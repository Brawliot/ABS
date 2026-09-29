/**
 * Runtime de aplicación: EventStore SQLite + ledger + proyección.
 * Las escrituras SOLO ocurren tras Intérprete → Juez (vía action-handler).
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteEventStore } from "../adapters/sqlite-event-store.js";
import type { ArchetypeId } from "../archetypes/types.js";
import { createLlmClientFromEnv } from "../llm/index.js";
import type { LlmClient } from "../llm/index.js";
import {
  evaluateBlocks,
  type SubTransactionSnapshot,
} from "../archetypes/composed-runtime.js";
import type { TransitionEvent } from "../core/events.js";
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
    llmClient = createLlmClientFromEnv()
  ) {
    this.boot = boot;
    this.store = store;
    this.dbPath = dbPath;
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

    const subjects = seedSubjects(boot);
    return new AppRuntime(boot, store, dbPath, subjects, pack, tenantId);
  }

  close(): void {
    this.store.close();
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
      const events = this.store.getBySubject(sub.id) as TransitionEvent[];
      const derived = deriveState(slice.lifecycle, events);
      const state = findState(slice.lifecycle, derived.currentStateId);
      rows.push({
        id: sub.id,
        label: sub.label,
        stateId: derived.currentStateId,
        parteId: sub.parteId,
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
