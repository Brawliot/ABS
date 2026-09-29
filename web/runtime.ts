/**
 * Runtime de aplicación: EventStore SQLite + ledger + proyección.
 * Las escrituras SOLO ocurren tras Intérprete → Juez (vía action-handler).
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteEventStore } from "../adapters/sqlite-event-store.js";
import { SqliteParteIdentityStore } from "../adapters/sqlite-identity-store.js";
import { SqliteOfertaCatalog } from "../adapters/sqlite-oferta-catalog.js";
import type { ArchetypeId } from "../archetypes/types.js";
import { createLlmClientFromEnv } from "../llm/index.js";
import type { LlmClient } from "../llm/index.js";
import {
  evaluateBlocks,
  type SubTransactionSnapshot,
} from "../archetypes/composed-runtime.js";
import { randomUUID } from "node:crypto";
import type {
  AltaEvent,
  DatosEvent,
  LineaDatos,
  TransaccionDatos,
  TransitionEvent,
} from "../core/events.js";
import { formatCentimos } from "../elements/oferta.js";
import {
  calcularTotales,
  diferencias,
  proyectarTransaccion,
  validarDatos,
  type EntradaTransaccion,
  type TransaccionProyectada,
} from "../elements/transaccion.js";
import { assertNoPiiInEventData } from "../policies/identity.js";
import { deriveState } from "../core/derivation.js";
import { findState } from "../core/lifecycle.js";
import { redactInterfaceCopy } from "../design/copy/index.js";
import type { InterfaceCopyPack } from "../design/copy/types.js";
import { FactProvider } from "../facts/index.js";
import { IdempotencyLedger } from "../interpreter/index.js";
import type { AppBootResult, SampleRow } from "./types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface RuntimeSubject {
  readonly id: string;
  readonly lifecycleId: string;
  readonly label: string;
  readonly parteId: string;
  readonly sedeId?: string;
  readonly vinculadaA?: string;
}

export interface FlashMessage {
  readonly kind: "ok" | "error" | "info" | "block";
  readonly text: string;
  readonly blockProcessGroupId?: string;
  readonly blockArchetypeId?: string;
  readonly idempotentReplay?: boolean;
}

export interface ActiveBlockInfo {
  readonly text: string;
  readonly processGroupId?: string;
  readonly archetypeId: string;
  readonly blockedStateId: string;
}

export class AppRuntime {
  readonly boot: AppBootResult;
  readonly store: SqliteEventStore;
  readonly facts: FactProvider;
  readonly ledger: IdempotencyLedger;
  readonly copyPack: InterfaceCopyPack;
  readonly llmClient: LlmClient;
  readonly tenantId: string;
  readonly dbPath: string;
  readonly subjects: RuntimeSubject[];
  /** Partes vivas (clientes, proveedores…): identidad persistente y cifrada. */
  readonly partes: SqliteParteIdentityStore;
  /** Catálogo de Ofertas (productos / servicios) versionado. */
  readonly ofertas: SqliteOfertaCatalog;
  flash: FlashMessage | undefined;
  /** Unidades/plazas reservadas (concurrencia de recurso). */
  private readonly reservedUnits = new Map<string, string>();
  private readonly subjectLocks = new Set<string>();
  /** Force grants de prueba/Observador (RuleSet sellado no es extensible). */
  readonly observerForceGrants: {
    transitionId: string;
    allowedRoles: readonly string[];
  }[] = [];
  /** Reglas adicionales de escenario (p. ej. hito de fase en reformas). */
  readonly extraRules: import("../policies/types.js").CompiledRule[] = [];

  effectiveRuleSet(): import("../policies/types.js").CompiledRuleSet {
    const base = this.boot.input.ruleSet;
    if (this.extraRules.length === 0) return base;
    return { ...base, rules: [...base.rules, ...this.extraRules] };
  }

  private constructor(
    boot: AppBootResult,
    store: SqliteEventStore,
    dbPath: string,
    subjects: RuntimeSubject[],
    copyPack: InterfaceCopyPack,
    tenantId: string,
    maestros: {
      readonly partes: SqliteParteIdentityStore;
      readonly ofertas: SqliteOfertaCatalog;
    },
    llmClient = createLlmClientFromEnv()
  ) {
    this.boot = boot;
    this.store = store;
    this.dbPath = dbPath;
    this.partes = maestros.partes;
    this.ofertas = maestros.ofertas;
    this.facts = new FactProvider();
    this.facts.attachStore(tenantId, store);
    this.ledger = new IdempotencyLedger();
    this.copyPack = copyPack;
    this.llmClient = createLlmClientFromEnv();
    this.tenantId = tenantId;
    this.subjects = subjects;
  }

  static open(
    boot: AppBootResult,
    options?: { readonly dbPath?: string; readonly tenantId?: string },
  ): AppRuntime {
    const dir = join(ROOT, "tmp", "web-runtime");
    mkdirSync(dir, { recursive: true });
    const tenantId = options?.tenantId ?? boot.profileId;
    const dbPath =
      options?.dbPath ?? join(dir, `${tenantId}.sqlite`);
    const store = new SqliteEventStore(dbPath);

    const { pack } = redactInterfaceCopy({
      spec: boot.spec,
      tone: "cercano",
      locale: "es-ES",
      proposedAt: "2026-06-01T00:00:00.000Z",
    });

    const subjects = loadSubjects(boot, store);
    const partes = new SqliteParteIdentityStore(dbPath);
    const ofertas = new SqliteOfertaCatalog(dbPath);
    seedDemoPartes(partes, tenantId, boot);
    return new AppRuntime(boot, store, dbPath, subjects, pack, tenantId, {
      partes,
      ofertas,
    });
  }

  close(): void {
    this.store.close();
    this.partes.close();
    this.ofertas.close();
  }

  setFlash(flash: FlashMessage | undefined): void {
    this.flash = flash;
  }

  /** Mutex por expediente: evita dos avances concurrentes. */
  tryLockSubject(subjectId: string): boolean {
    if (this.subjectLocks.has(subjectId)) return false;
    this.subjectLocks.add(subjectId);
    return true;
  }

  unlockSubject(subjectId: string): void {
    this.subjectLocks.delete(subjectId);
  }

  /**
   * Reserva atómica de unidad/plaza. Devuelve false si ya está tomada.
   */
  tryReserveUnit(unitId: string, subjectId: string): boolean {
    const holder = this.reservedUnits.get(unitId);
    if (holder && holder !== subjectId) return false;
    this.reservedUnits.set(unitId, subjectId);
    return true;
  }

  unitHolder(unitId: string): string | undefined {
    return this.reservedUnits.get(unitId);
  }

  addSubject(subject: RuntimeSubject): void {
    if (this.subjects.some((s) => s.id === subject.id)) return;
    (this.subjects as RuntimeSubject[]).push(subject);
  }

  /** Nombre visible de una Parte (o marcador si se borró / no existe). */
  nombreParte(parteId: string): string {
    return this.partes.resolve(this.tenantId, parteId).personal.displayName;
  }

  /** Datos de negocio actuales del expediente (cliente, líneas…). */
  datosDe(subjectId: string): TransaccionProyectada | undefined {
    return proyectarTransaccion(this.store.getBySubject(subjectId));
  }

  /** Estado actual del expediente, con su tipo (inicial, intermedio…). */
  estadoDe(
    subjectId: string,
  ): { readonly id: string; readonly label: string; readonly kind: string } | undefined {
    const slice = this.lifecycleForSubject(subjectId);
    if (!slice) return undefined;
    const derived = deriveState(
      slice.lifecycle,
      this.store.getBySubject(subjectId),
    );
    const st = findState(slice.lifecycle, derived.currentStateId);
    return {
      id: derived.currentStateId,
      label: st?.label ?? derived.currentStateId,
      kind: st?.kind ?? "",
    };
  }

  /** Los datos solo se editan en el estado inicial (presupuesto / propuesta). */
  puedeEditarDatos(subjectId: string): boolean {
    return this.estadoDe(subjectId)?.kind === "inicial";
  }

  /**
   * Alta de un expediente con sus datos. Resuelve las líneas del catálogo
   * (copia precio y versión vigentes) y registra un evento `alta`.
   */
  crearTransaccion(
    entrada: EntradaTransaccion,
    actorId: string,
  ): { ok: true; id: string } | { ok: false; errors: string[] } {
    const slice = this.boot.input.lifecycles.find(
      (l) => l.id === entrada.lifecycleId,
    );
    if (!slice) return { ok: false, errors: ["Ese proceso no existe."] };
    const resolved = this.resolverDatos(entrada, undefined);
    if (!resolved.ok) return resolved;

    const id = `tx-${randomUUID()}`;
    const at = new Date().toISOString();
    const alta: AltaEvent = {
      id: `alta-${id}`,
      kind: "alta",
      subjectId: id,
      occurredAt: at,
      actorId,
      actorKind: "humano",
      evidence: { kind: "sistema", reference: `alta:${id}`, recordedAt: at },
      lifecycleId: slice.id,
      ...(entrada.sedeId ? { sedeId: entrada.sedeId } : {}),
      datos: resolved.datos,
    };
    assertNoPiiInEventData(alta.datos as unknown as Record<string, unknown>);
    this.store.append(alta);
    this.facts.applyEvent(this.tenantId, alta);
    this.addSubject(subjectFromAlta(alta, this.boot, this.subjects.length + 1));
    return { ok: true, id };
  }

  /**
   * Cambia los datos de un expediente en estado inicial. Solo registra los
   * campos que cambian; si no cambia nada, no escribe ningún evento.
   */
  editarTransaccion(
    subjectId: string,
    entrada: EntradaTransaccion,
    actorId: string,
  ): { ok: true; changed: boolean } | { ok: false; errors: string[] } {
    const actual = this.datosDe(subjectId);
    if (!actual) return { ok: false, errors: ["Ese expediente no existe."] };
    if (!this.puedeEditarDatos(subjectId)) {
      return {
        ok: false,
        errors: [
          "Este expediente ya no está en su estado inicial: sus datos no se pueden cambiar.",
        ],
      };
    }
    const resolved = this.resolverDatos(entrada, actual.datos);
    if (!resolved.ok) return resolved;
    const cambios = diferencias(actual.datos, resolved.datos);
    if (Object.keys(cambios).length === 0) return { ok: true, changed: false };

    const at = new Date().toISOString();
    const ev: DatosEvent = {
      id: `datos-${randomUUID()}`,
      kind: "datos",
      subjectId,
      occurredAt: at,
      actorId,
      actorKind: "humano",
      evidence: { kind: "sistema", reference: `datos:${subjectId}`, recordedAt: at },
      cambios,
    };
    assertNoPiiInEventData(ev.cambios as unknown as Record<string, unknown>);
    this.store.append(ev);
    this.facts.applyEvent(this.tenantId, ev);
    return { ok: true, changed: true };
  }

  /**
   * Convierte la entrada del formulario en datos guardables:
   * - la Parte debe existir y no estar borrada;
   * - una línea de catálogo toma descripción, precio e IVA de la Oferta
   *   (el precio se puede ajustar); una línea que ya estaba conserva su versión.
   */
  private resolverDatos(
    entrada: EntradaTransaccion,
    previos: TransaccionDatos | undefined,
  ): { ok: true; datos: TransaccionDatos } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    const parte = this.partes.get(this.tenantId, entrada.parteId);
    if (entrada.parteId && (!parte || parte.erasedAt)) {
      errors.push("El cliente o proveedor elegido no existe.");
    }
    const lineas: LineaDatos[] = [];
    entrada.lineas.forEach((l, i) => {
      const n = i + 1;
      if (l.ofertaId) {
        const previa = previos?.lineas.find((p) => p.ofertaId === l.ofertaId);
        const oferta = previa?.ofertaVersion
          ? this.ofertas.getVersion(this.tenantId, l.ofertaId, previa.ofertaVersion)
          : this.ofertas.get(this.tenantId, l.ofertaId);
        if (!oferta || (!previa && !oferta.activa)) {
          errors.push(`Línea ${n}: esa oferta no está en el catálogo.`);
          return;
        }
        lineas.push({
          ofertaId: oferta.ofertaId,
          ofertaVersion: oferta.version,
          descripcion: l.descripcion?.trim() || oferta.nombre,
          cantidadMilesimas: l.cantidadMilesimas,
          precioCentimos: l.precioCentimos ?? oferta.precioCentimos,
          ivaPct: oferta.ivaPct,
        });
        return;
      }
      if (l.precioCentimos === undefined) {
        errors.push(`Línea ${n}: indica el precio.`);
        return;
      }
      lineas.push({
        descripcion: (l.descripcion ?? "").trim(),
        cantidadMilesimas: l.cantidadMilesimas,
        precioCentimos: l.precioCentimos,
        ivaPct: l.ivaPct ?? 21,
      });
    });
    const referencia = entrada.referencia?.trim();
    const notas = entrada.notas?.trim();
    const datos: TransaccionDatos = {
      parteId: entrada.parteId,
      fecha: entrada.fecha,
      ...(referencia ? { referencia } : {}),
      ...(notas ? { notas } : {}),
      lineas,
    };
    errors.push(...validarDatos(datos));
    return errors.length > 0 ? { ok: false, errors } : { ok: true, datos };
  }

  /** Filas de UI derivadas solo de eventos (no estado local de cliente). */
  projectRows(filter?: {
    readonly sedeId?: string;
    readonly sedeScoped?: boolean;
  }): readonly SampleRow[] {
    const rows: SampleRow[] = [];
    for (const sub of this.subjects) {
      if (
        filter?.sedeScoped &&
        filter.sedeId &&
        sub.sedeId &&
        sub.sedeId !== filter.sedeId
      ) {
        continue;
      }
      const slice = this.boot.input.lifecycles.find(
        (l) => l.id === sub.lifecycleId,
      );
      if (!slice) continue;
      const events = this.store.getBySubject(sub.id);
      const derived = deriveState(slice.lifecycle, events);
      const state = findState(slice.lifecycle, derived.currentStateId);
      const tx = proyectarTransaccion(events);
      const parteId = tx?.datos.parteId ?? sub.parteId;
      rows.push({
        id: sub.id,
        label: sub.label,
        stateId: derived.currentStateId,
        lifecycleId: sub.lifecycleId,
        parteId,
        ...(tx
          ? {
              detalle: {
                cliente: this.nombreParte(parteId),
                fecha: tx.datos.fecha,
                total: formatCentimos(calcularTotales(tx.datos.lineas).total),
                ...(tx.datos.referencia ? { referencia: tx.datos.referencia } : {}),
              },
            }
          : {}),
        meta: `estado=${derived.currentStateId}${state ? ` (${state.label})` : ""}${sub.vinculadaA ? ` · vinculada_a=${sub.vinculadaA}` : ""}`,
        ...(sub.sedeId !== undefined ? { sedeId: sub.sedeId } : {}),
        ...(sub.vinculadaA !== undefined
          ? { vinculadaA: sub.vinculadaA }
          : {}),
      });
    }
    for (const v of this.boot.spec.views) {
      if (
        v.kind === "panel_agenda" ||
        v.kind === "panel_retencion" ||
        v.kind === "panel_credito" ||
        v.kind === "panel_periodos"
      ) {
        rows.push({
          id: `panel-info-${v.kind}`,
          label: `Indicador ${v.kind}`,
          stateId: null,
          parteId: this.subjects[0]?.parteId ?? "parte-demo-1",
          meta: v.kind,
        });
      }
    }
    return rows;
  }

  /**
   * Bloqueos de composición activos: qué secundario falta y a qué processGroup enlazar.
   */
  activeBlocks(): readonly ActiveBlockInfo[] {
    const composition = this.boot.input.composition;
    if (!composition) return [];

    const subs: SubTransactionSnapshot[] = [];
    for (const sub of this.subjects) {
      const slice = this.boot.input.lifecycles.find(
        (l) => l.id === sub.lifecycleId,
      );
      if (!slice) continue;
      const isSec = composition.secondaries.some(
        (s) => s.secondaryArchetypeId === slice.archetypeId,
      );
      if (!isSec) continue;
      const events = this.store.getBySubject(sub.id) as TransitionEvent[];
      const derived = deriveState(slice.lifecycle, events);
      const st = findState(slice.lifecycle, derived.currentStateId);
      if (!st) continue;
      subs.push({
        instanceId: sub.id,
        secondaryArchetypeId: slice.archetypeId as ArchetypeId,
        currentStateId: derived.currentStateId,
        stateKind: st.kind,
      });
    }

    const out: ActiveBlockInfo[] = [];
    const seen = new Set<string>();
    for (const sec of composition.secondaries) {
      const blocks = evaluateBlocks(composition, sec.bloquea, subs).filter(
        (b) => b.blocksTransition,
      );
      for (const b of blocks) {
        const key = `${b.secondaryArchetypeId}:${sec.bloquea}:${b.instanceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const pgId = this.boot.spec.processGroups?.find(
          (g) => g.archetypeId === b.secondaryArchetypeId,
        )?.id;
        out.push({
          text: `Falta completar «${b.secondaryArchetypeId}» (expediente ${b.instanceId}) para desbloquear «${sec.bloquea}».`,
          ...(pgId !== undefined ? { processGroupId: pgId } : {}),
          archetypeId: b.secondaryArchetypeId,
          blockedStateId: sec.bloquea,
        });
      }
    }
    return out;
  }

  lifecycleForSubject(subjectId: string) {
    const sub = this.subjects.find((s) => s.id === subjectId);
    if (!sub) return undefined;
    return this.boot.input.lifecycles.find((l) => l.id === sub.lifecycleId);
  }

  actionById(actionId: string) {
    return this.boot.spec.actions.find((a) => a.id === actionId);
  }
}

/**
 * Con el almacén vacío, da de alta como clientes las Partes de ejemplo a las
 * que apuntan los expedientes demo, para que tengan nombre y ficha reales.
 */
function seedDemoPartes(
  partes: SqliteParteIdentityStore,
  tenantId: string,
  boot: AppBootResult,
): void {
  if (partes.list(tenantId).length > 0) return;
  for (const p of boot.samplePartes) {
    partes.put(
      tenantId,
      p.id,
      { displayName: p.label },
      "2026-01-01T00:00:00.000Z",
      "cliente",
    );
  }
}

/**
 * Expedientes = eventos `alta` del almacén. Con el almacén sin altas (negocio
 * nuevo o base de datos anterior a los datos de transacción), registra las altas
 * de los expedientes demo con los mismos ids, así el historial previo encaja.
 */
function loadSubjects(
  boot: AppBootResult,
  store: SqliteEventStore,
): RuntimeSubject[] {
  let altas = store.all().filter((e): e is AltaEvent => e.kind === "alta");
  if (altas.length === 0) {
    const at = "2026-06-01T00:00:00.000Z";
    for (const s of seedSubjects(boot)) {
      store.append({
        id: `alta-${s.id}`,
        kind: "alta",
        subjectId: s.id,
        occurredAt: at,
        actorId: "sistema-demo",
        actorKind: "sistema",
        evidence: { kind: "sistema", reference: "seed-demo", recordedAt: at },
        lifecycleId: s.lifecycleId,
        ...(s.sedeId ? { sedeId: s.sedeId } : {}),
        datos: {
          parteId: s.parteId,
          fecha: at.slice(0, 10),
          referencia: "demo",
          lineas: [
            {
              descripcion: `Ejemplo · ${s.label}`,
              cantidadMilesimas: 1000,
              precioCentimos: 10000,
              ivaPct: 21,
            },
          ],
        },
      });
    }
    altas = store.all().filter((e): e is AltaEvent => e.kind === "alta");
  }
  return altas.map((a, i) => subjectFromAlta(a, boot, i + 1));
}

function subjectFromAlta(
  alta: AltaEvent,
  boot: AppBootResult,
  n: number,
): RuntimeSubject {
  const slice = boot.input.lifecycles.find((l) => l.id === alta.lifecycleId);
  return {
    id: alta.subjectId,
    lifecycleId: alta.lifecycleId,
    label: `${slice?.label ?? slice?.archetypeId ?? "Expediente"} #${n}`,
    parteId: alta.datos.parteId,
    ...(alta.sedeId ? { sedeId: alta.sedeId } : {}),
  };
}

function seedSubjects(boot: AppBootResult): RuntimeSubject[] {
  const out: RuntimeSubject[] = [];
  let i = 1;
  for (const slice of boot.input.lifecycles) {
    const parteId = i % 2 === 0 ? "parte-demo-2" : "parte-demo-1";
    const sedeId = i % 2 === 0 ? "sede-norte" : "sede-centro";
    out.push({
      id: `tx-${boot.profileId}-${slice.id}-${i}`,
      lifecycleId: slice.id,
      label: `${slice.label ?? slice.archetypeId} #${i}`,
      parteId,
      sedeId,
    });
    i++;
    if (i > 8) break;
  }
  if (out.length === 0) {
    out.push({
      id: `tx-${boot.profileId}-demo-1`,
      lifecycleId: boot.input.lifecycles[0]?.id ?? "lc",
      label: "Expediente demo",
      parteId: "parte-demo-1",
      sedeId: "sede-centro",
    });
  }
  return out;
}
