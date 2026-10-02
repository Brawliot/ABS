/**
 * Proyección incremental de hechos por tenant.
 * Avanza con cada evento; no reescanea todo el historial en cada consulta.
 */

import type { DomainEvent, TransitionEvent } from "../core/events.js";
import type { TenantId } from "../tenancy/index.js";
import { FACT_IDS, paramsKey, type FactParams } from "./catalog.js";

/** Terminales que liquidan deuda / liberan recurso. */
const TERMINAL_STATES = new Set([
  "cerrada",
  "cancelada",
  "incumplida",
  "liquidado",
  "completada",
  "terminada",
]);

/**
 * Payload de negocio en event.data para alimentar hechos.
 * Convención estable documentada en docs/facts.md.
 */
export interface FactEventPayload {
  readonly parteId?: string;
  readonly importe?: number;
  readonly recursoId?: string;
  readonly capacityUnits?: number;
  readonly periodStart?: string;
  readonly periodEnd?: string;
  /** Estado de la tx tras el evento (si no, toStateId). */
  readonly stateId?: string;
  /** Alcance de meta (objetivo.volumen / valor / tasa). */
  readonly scopeId?: string;
  readonly volumenDelta?: number;
  readonly valorDelta?: number;
  readonly tasaValue?: number;
}

export interface FactValue {
  readonly value: number;
  /** Versión optimista del hecho (sube en cada cambio del mismo key). */
  readonly version: number;
  /** Índice exclusivo en el flujo del tenant (posición de cálculo). */
  readonly streamPosition: number;
}

interface ParteState {
  pendingBalance: number;
  firstSeenAt: string | null;
  /** subjectId → estado actual */
  txStates: Map<string, string>;
  /** stateId → Set<subjectId> (índice inverso para O(1) búsquedas) */
  txStatesByValue: Map<string, Set<string>>;
  /** subjectId → importe que contribuye al saldo mientras abierta */
  txAmounts: Map<string, number>;
  /** version counters per fact param key */
  versions: Map<string, number>;
}

interface RecursoPeriodState {
  committed: number;
  version: number;
}

export class TenantFactProjection {
  private stream: DomainEvent[] = [];
  private readonly partes = new Map<string, ParteState>();
  private readonly recursos = new Map<string, RecursoPeriodState>();
  /** scopeId → agregados de meta */
  private readonly scopes = new Map<
    string,
    { volumen: number; valor: number; tasa: number; version: number }
  >();
  /** Override de disponibilidad de turno (hecho calendario.turno_disponible). */
  private readonly turnoOverrides = new Map<
    string,
    { value: number; version: number }
  >();

  constructor(readonly tenantId: TenantId) {}

  /** Número de eventos aplicados (posición del flujo). */
  get position(): number {
    return this.stream.length;
  }

  /** Aplica un evento de forma incremental. */
  apply(event: DomainEvent): void {
    this.stream.push(event);
    if (event.kind !== "transicion" && event.kind !== "excepcion") return;

    const payload = readPayload(event);
    const toState =
      payload.stateId ??
      ("toStateId" in event ? event.toStateId : undefined);
    if (!toState) return;

    const parteId = payload.parteId;
    if (parteId) {
      this.applyParte(event.subjectId, parteId, toState, payload, event.occurredAt);
    }

    if (payload.recursoId && payload.capacityUnits !== undefined) {
      this.applyRecurso(payload, toState);
    }

    if (payload.scopeId) {
      this.applyScope(payload);
    }
  }

  /** Reconstruye desde cero (determinista). */
  rebuild(events: readonly DomainEvent[]): void {
    this.stream = [];
    this.partes.clear();
    this.recursos.clear();
    this.scopes.clear();
    this.turnoOverrides.clear();
    for (const e of events) this.apply(e);
  }

  /**
   * Materializa disponibilidad de turno (desde calendario / isOnShift).
   * El Proveedor llama esto al preparar hechos de turno.
   */
  setTurnoDisponible(params: FactParams, available: boolean): void {
    const key = paramsKey(params);
    const prev = this.turnoOverrides.get(key);
    this.turnoOverrides.set(key, {
      value: available ? 1 : 0,
      version: (prev?.version ?? 0) + 1,
    });
  }

  /** Snapshot de hechos en la posición actual (tras N eventos). */
  read(factId: string, params: FactParams, nowMs?: number): FactValue {
    const pos = this.position;
    switch (factId) {
      case FACT_IDS.PARTE_SALDO_PENDIENTE: {
        const parteId = String(params.parteId);
        const p = this.partes.get(parteId);
        const key = paramsKey(params);
        return {
          value: p?.pendingBalance ?? 0,
          version: p?.versions.get(key) ?? 0,
          streamPosition: pos,
        };
      }
      case FACT_IDS.PARTE_ANTIGUEDAD_MS: {
        const parteId = String(params.parteId);
        const p = this.partes.get(parteId);
        const key = paramsKey(params);
        const first = p?.firstSeenAt;
        const now = nowMs ?? Date.now();
        const value = first ? Math.max(0, now - Date.parse(first)) : 0;
        return {
          value,
          version: p?.versions.get(key) ?? 0,
          streamPosition: pos,
        };
      }
      case FACT_IDS.RECURSO_CAPACIDAD_COMPROMETIDA: {
        const key = recursoPeriodKey(params);
        const r = this.recursos.get(key);
        return {
          value: r?.committed ?? 0,
          version: r?.version ?? 0,
          streamPosition: pos,
        };
      }
      case FACT_IDS.PARTE_TX_EN_ESTADO: {
        const parteId = String(params.parteId);
        const stateId = String(params.stateId);
        const p = this.partes.get(parteId);
        // O(1) lookup gracias al índice inverso (en lugar de O(N) iteración)
        const count = p
          ? (p.txStatesByValue.get(stateId)?.size ?? 0)
          : 0;
        const key = paramsKey(params);
        return {
          value: count,
          version: p?.versions.get(key) ?? 0,
          streamPosition: pos,
        };
      }
      case FACT_IDS.OBJETIVO_VOLUMEN: {
        const scopeId = String(params.scopeId);
        const s = this.scopes.get(scopeId);
        return {
          value: s?.volumen ?? 0,
          version: s?.version ?? 0,
          streamPosition: pos,
        };
      }
      case FACT_IDS.OBJETIVO_VALOR: {
        const scopeId = String(params.scopeId);
        const s = this.scopes.get(scopeId);
        return {
          value: s?.valor ?? 0,
          version: s?.version ?? 0,
          streamPosition: pos,
        };
      }
      case FACT_IDS.OBJETIVO_TASA: {
        const scopeId = String(params.scopeId);
        const s = this.scopes.get(scopeId);
        return {
          value: s?.tasa ?? 0,
          version: s?.version ?? 0,
          streamPosition: pos,
        };
      }
      case FACT_IDS.CALENDARIO_TURNO_DISPONIBLE:
        // Valor materializado vía FactProvider.setTurno / override; por defecto 0.
        return {
          value: this.turnoOverrides.get(paramsKey(params))?.value ?? 0,
          version: this.turnoOverrides.get(paramsKey(params))?.version ?? 0,
          streamPosition: pos,
        };
      default:
        return { value: 0, version: 0, streamPosition: pos };
    }
  }

  /**
   * Lee hechos como estaban tras exactamente `atPosition` eventos
   * (consistencia temporal con la transición evaluada).
   */
  readAt(
    factId: string,
    params: FactParams,
    atPosition: number,
    nowMs?: number,
  ): FactValue {
    if (atPosition === this.position) {
      return this.read(factId, params, nowMs);
    }
    const tmp = new TenantFactProjection(this.tenantId);
    tmp.rebuild(this.stream.slice(0, Math.max(0, atPosition)));
    return tmp.read(factId, params, nowMs);
  }

  events(): readonly DomainEvent[] {
    return this.stream;
  }

  private applyParte(
    subjectId: string,
    parteId: string,
    toState: string,
    payload: FactEventPayload,
    occurredAt: string,
  ): void {
    let p = this.partes.get(parteId);
    if (!p) {
      p = {
        pendingBalance: 0,
        firstSeenAt: null,
        txStates: new Map(),
        txStatesByValue: new Map(),  // Índice inverso: stateId → Set<subjectId>
        txAmounts: new Map(),
        versions: new Map(),
      };
      this.partes.set(parteId, p);
    }
    if (!p.firstSeenAt) p.firstSeenAt = occurredAt;

    const prevState = p.txStates.get(subjectId);
    const prevAmount = p.txAmounts.get(subjectId) ?? 0;
    const wasOpen = prevState !== undefined && !TERMINAL_STATES.has(prevState);
    const willOpen = !TERMINAL_STATES.has(toState);

    if (wasOpen) {
      p.pendingBalance -= prevAmount;
      // Remover del índice inverso
      if (prevState) {
        const set = p.txStatesByValue.get(prevState);
        if (set) {
          set.delete(subjectId);
          if (set.size === 0) {
            p.txStatesByValue.delete(prevState);
          }
        }
      }
    }

    const newAmount =
      payload.importe !== undefined ? Number(payload.importe) : prevAmount;

    // Validar que el importe sea un número válido (no NaN, Infinity, etc.)
    if (!isFinite(newAmount)) {
      console.warn(
        `[TenantFactProjection.applyParte] WARNING: Importe inválido para ${subjectId}: ${newAmount}; ` +
        `usando valor anterior ${prevAmount}`
      );
      // Usar prevAmount si newAmount es inválido
      if (willOpen) {
        p.txAmounts.set(subjectId, prevAmount);
        p.pendingBalance += prevAmount;
        p.txStates.set(subjectId, toState);
        // Agregar al índice inverso
        const set = p.txStatesByValue.get(toState) ?? new Set();
        set.add(subjectId);
        p.txStatesByValue.set(toState, set);
      }
    } else if (willOpen) {
      p.txAmounts.set(subjectId, newAmount);
      p.pendingBalance += newAmount;
      p.txStates.set(subjectId, toState);
      // Agregar al índice inverso
      const set = p.txStatesByValue.get(toState) ?? new Set();
      set.add(subjectId);
      p.txStatesByValue.set(toState, set);
    } else {
      p.txAmounts.delete(subjectId);
      p.txStates.delete(subjectId);
      // Remover del índice inverso
      if (toState) {
        const set = p.txStatesByValue.get(toState);
        if (set) {
          set.delete(subjectId);
          if (set.size === 0) {
            p.txStatesByValue.delete(toState);
          }
        }
      }
    }

    bump(p.versions, paramsKey({ parteId }));
    bump(p.versions, paramsKey({ parteId, stateId: toState }));
    if (prevState) bump(p.versions, paramsKey({ parteId, stateId: prevState }));
  }

  private applyRecurso(payload: FactEventPayload, toState: string): void {
    if (
      payload.recursoId === undefined ||
      payload.capacityUnits === undefined ||
      !payload.periodStart ||
      !payload.periodEnd
    ) {
      return;
    }
    const key = recursoPeriodKey({
      recursoId: payload.recursoId,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
    });
    let r = this.recursos.get(key);
    if (!r) {
      r = { committed: 0, version: 0 };
      this.recursos.set(key, r);
    }
    const units = Number(payload.capacityUnits);
    // Validar que units sea un número válido
    if (!isFinite(units)) {
      console.warn(
        `[TenantFactProjection.applyRecurso] WARNING: capacityUnits inválido: ${units}; ignorando actualización`
      );
      return;
    }
    if (TERMINAL_STATES.has(toState) || toState === "disponible") {
      r.committed = Math.max(0, r.committed - units);
    } else if (toState === "reservado" || toState === "en_entrega" || toState === "aceptada") {
      r.committed += units;
    }
    r.version += 1;
  }

  private applyScope(payload: FactEventPayload): void {
    const scopeId = payload.scopeId;
    if (!scopeId) return;
    let s = this.scopes.get(scopeId);
    if (!s) {
      s = { volumen: 0, valor: 0, tasa: 0, version: 0 };
      this.scopes.set(scopeId, s);
    }
    if (payload.volumenDelta !== undefined) {
      const delta = Number(payload.volumenDelta);
      if (isFinite(delta)) {
        s.volumen += delta;
      } else {
        console.warn(`[TenantFactProjection.applyScope] WARNING: volumenDelta inválido: ${delta}`);
      }
    }
    if (payload.valorDelta !== undefined) {
      const delta = Number(payload.valorDelta);
      if (isFinite(delta)) {
        s.valor += delta;
      } else {
        console.warn(`[TenantFactProjection.applyScope] WARNING: valorDelta inválido: ${delta}`);
      }
    }
    if (payload.tasaValue !== undefined) {
      const tasa = Number(payload.tasaValue);
      if (isFinite(tasa)) {
        s.tasa = tasa;
      } else {
        console.warn(`[TenantFactProjection.applyScope] WARNING: tasaValue inválido: ${tasa}`);
      }
    }
    s.version += 1;
  }
}

function bump(versions: Map<string, number>, key: string): void {
  versions.set(key, (versions.get(key) ?? 0) + 1);
}

function recursoPeriodKey(params: FactParams): string {
  return paramsKey({
    recursoId: String(params.recursoId),
    periodStart: String(params.periodStart),
    periodEnd: String(params.periodEnd),
  });
}

function readPayload(event: DomainEvent): FactEventPayload {
  if (!("data" in event) || !event.data || typeof event.data !== "object") {
    return {};
  }
  const data = event.data as Record<string, unknown>;
  const facts =
    data.facts && typeof data.facts === "object"
      ? (data.facts as Record<string, unknown>)
      : data;
  const fieldsAfter =
    data.fieldsAfter && typeof data.fieldsAfter === "object"
      ? (data.fieldsAfter as Record<string, unknown>)
      : {};

  const out: Record<string, string | number> = {};
  const parteId = str(facts.parteId ?? fieldsAfter.parte_id ?? fieldsAfter.parteId);
  if (parteId !== undefined) out.parteId = parteId;
  const importe = num(facts.importe ?? fieldsAfter.importe);
  if (importe !== undefined) out.importe = importe;
  const recursoId = str(
    facts.recursoId ?? fieldsAfter.recurso_id ?? fieldsAfter.recursoId,
  );
  if (recursoId !== undefined) out.recursoId = recursoId;
  const capacityUnits = num(facts.capacityUnits ?? fieldsAfter.capacityUnits);
  if (capacityUnits !== undefined) out.capacityUnits = capacityUnits;
  const periodStart = str(facts.periodStart ?? fieldsAfter.periodStart);
  if (periodStart !== undefined) out.periodStart = periodStart;
  const periodEnd = str(facts.periodEnd ?? fieldsAfter.periodEnd);
  if (periodEnd !== undefined) out.periodEnd = periodEnd;
  const stateId = str(facts.stateId);
  if (stateId !== undefined) out.stateId = stateId;
  const scopeId = str(facts.scopeId ?? fieldsAfter.scopeId);
  if (scopeId !== undefined) out.scopeId = scopeId;
  const volumenDelta = num(facts.volumenDelta);
  if (volumenDelta !== undefined) out.volumenDelta = volumenDelta;
  const valorDelta = num(facts.valorDelta ?? facts.importe);
  if (valorDelta !== undefined) out.valorDelta = valorDelta;
  const tasaValue = num(facts.tasaValue);
  if (tasaValue !== undefined) out.tasaValue = tasaValue;
  return out as FactEventPayload;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

/** Helper de tests: construye data.facts en un TransitionEvent. */
export function withFactPayload(
  event: TransitionEvent,
  facts: FactEventPayload,
): TransitionEvent {
  return {
    ...event,
    data: {
      ...(event.data ?? {}),
      facts,
    },
  };
}
