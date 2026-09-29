/**
 * Mover empresa entre bases (shared ↔ dedicated) y exportar para EN CLIENTE.
 * Procedimiento: solo-lectura → copia → verificación → flip de rutas → borrado origen → o rollback.
 */

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Pool } from "pg";
import { migrateUp } from "../db/migrate.js";
import type { CompanyDatabaseRegistry } from "./registry.js";
import {
  deleteCompanyData,
  exportCompany,
  importCompanyPackage,
  verifyMove,
} from "./company-data.js";
import type {
  CompanyExportPackage,
  HostingMode,
  MoveVerification,
} from "./types.js";
import { HostingError } from "./types.js";

export interface MoveCompanyOptions {
  readonly registry: CompanyDatabaseRegistry;
  readonly companyId: string;
  readonly targetMode: HostingMode;
  readonly targetDatabaseUrl: string;
  /** Tras verificar, borrar datos en origen. */
  readonly purgeSource?: boolean;
}

export interface MoveCompanyResult {
  readonly verification: MoveVerification;
  readonly previousUrl: string;
  readonly targetUrl: string;
  readonly rolledBack: boolean;
}

export async function moveCompany(
  opts: MoveCompanyOptions,
): Promise<MoveCompanyResult> {
  const { registry, companyId, targetMode, targetDatabaseUrl } = opts;
  const purgeSource = opts.purgeSource !== false;
  const route = registry.require(companyId);
  const previousUrl = route.databaseUrl;

  if (previousUrl === targetDatabaseUrl && route.mode === targetMode) {
    throw new HostingError(
      "Origen y destino son la misma ruta",
      "move_failed",
    );
  }

  registry.setReadOnly(companyId, true);

  const sourcePool = new Pool({ connectionString: previousUrl, max: 4 });
  const destPool = new Pool({ connectionString: targetDatabaseUrl, max: 4 });

  let rolledBack = false;
  try {
    await migrateUp(sourcePool);
    await migrateUp(destPool);

    const pkg = await exportCompany(sourcePool, companyId);
    await importCompanyPackage(destPool, pkg);

    const prePurge = await verifyMove(
      sourcePool,
      destPool,
      companyId,
      pkg,
      { expectSourceCleared: false },
    );
    if (!prePurge.ok) {
      throw new HostingError(
        `Verificación pre-purge falló: ${JSON.stringify(prePurge.details)}`,
        "verify_failed",
      );
    }

    // Flip de enrutado antes de borrar origen (mínima interrupción ya en RO).
    registry.upsert({
      companyId,
      mode: targetMode,
      databaseUrl: targetDatabaseUrl,
      readOnly: true,
      ...(route.label !== undefined ? { label: route.label } : {}),
    });

    if (purgeSource) {
      await deleteCompanyData(sourcePool, companyId);
    }

    const verification = await verifyMove(
      sourcePool,
      destPool,
      companyId,
      pkg,
      { expectSourceCleared: purgeSource },
    );

    if (!verification.ok) {
      // Rollback: restaurar ruta origen y reimportar si se borró.
      registry.upsert({
        companyId,
        mode: route.mode,
        databaseUrl: previousUrl,
        readOnly: false,
        ...(route.label !== undefined ? { label: route.label } : {}),
      });
      if (purgeSource) {
        await importCompanyPackage(sourcePool, pkg);
      }
      await deleteCompanyData(destPool, companyId);
      rolledBack = true;
      throw new HostingError(
        `Verificación final falló; rollback aplicado: ${JSON.stringify(verification.details)}`,
        "verify_failed",
      );
    }

    registry.setReadOnly(companyId, false);
    return {
      verification,
      previousUrl,
      targetUrl: targetDatabaseUrl,
      rolledBack,
    };
  } catch (err) {
    if (!rolledBack) {
      registry.upsert({
        companyId,
        mode: route.mode,
        databaseUrl: previousUrl,
        readOnly: false,
        ...(route.label !== undefined ? { label: route.label } : {}),
      });
    }
    throw err;
  } finally {
    await sourcePool.end();
    await destPool.end();
  }
}

/** Exportación completa a fichero JSON (portabilidad del negocio). */
export async function exportCompanyToFile(
  databaseUrl: string,
  companyId: string,
  outPath: string,
): Promise<CompanyExportPackage> {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    await migrateUp(pool);
    const pkg = await exportCompany(pool, companyId);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(pkg, null, 2), "utf8");
    return pkg;
  } finally {
    await pool.end();
  }
}

/** Arranque EN CLIENTE: importa paquete en BD local y registra ruta on_client. */
export async function bootstrapOnClient(opts: {
  readonly registry: CompanyDatabaseRegistry;
  readonly companyId: string;
  readonly localDatabaseUrl: string;
  readonly packagePath: string;
  readonly label?: string;
}): Promise<CompanyExportPackage> {
  const raw = readFileSync(opts.packagePath, "utf8");
  const pkg = JSON.parse(raw) as CompanyExportPackage;
  if (pkg.manifest.companyId !== opts.companyId) {
    throw new HostingError(
      `Paquete es de ${pkg.manifest.companyId}, no de ${opts.companyId}`,
      "import_failed",
    );
  }
  const pool = new Pool({ connectionString: opts.localDatabaseUrl, max: 4 });
  try {
    await migrateUp(pool);
    await importCompanyPackage(pool, pkg);
    const check = await exportCompany(pool, opts.companyId);
    if (check.manifest.eventStreamHash !== pkg.manifest.eventStreamHash) {
      throw new HostingError(
        "Hash de eventos distinto tras import EN CLIENTE",
        "verify_failed",
      );
    }
    if (check.manifest.identityHash !== pkg.manifest.identityHash) {
      throw new HostingError(
        "Hash de identidad distinto tras import EN CLIENTE",
        "verify_failed",
      );
    }
    opts.registry.upsert({
      companyId: opts.companyId,
      mode: "on_client",
      databaseUrl: opts.localDatabaseUrl,
      readOnly: false,
      label: opts.label ?? "on-client",
    });
    return check;
  } finally {
    await pool.end();
  }
}
