/**
 * Proveedor de hechos: entrega valores a las guardas sin exponer el EventStore.
 * Consistencia temporal + control de versión optimista por tenant.
 */

import type { DomainEvent } from "../core/events.js";
import type { EventStore } from "../core/event-store.js";
import type { TenantId } from "../tenancy/index.js";
import { TenantIsolationError } from "../tenancy/index.js";
import {
  isOnShift,
  type CompiledCalendar,
} from "../policies/calendario.js";
import {
  assertKnownFact,
  makeFactKey,
  type FactParams,
} from "./catalog.js";
import { TenantFactProjection, type FactValue } from "./projection.js";

export class FactOptimisticConflictError extends Error {
  constructor(
    message: string,
    readonly factId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(message);
    this.name = "FactOptimisticConflictError";
  }
}

export class FactAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FactAccessError";
  }
}

export interface FactRequest {
  readonly factId: string;
  readonly params: FactParams;
}

export interface FactSnapshotEntry extends FactValue {
  readonly factId: string;
  readonly params: FactParams;
}

/** Bolsa sellada que reciben las guardas: solo hechos declarados. */
export interface FactBag {
  readonly tenantId: TenantId;
  readonly streamPosition: number;
  readonly entries: Readonly<Record<string, FactSnapshotEntry>>;
  get(factId: string, params?: FactParams): number;
  /** Versiones capturadas para confirmación optimista. */
  readonly versions: Readonly<
    Record<string, { factId: string; params: FactParams; version: number }>
  >;
}

function entryKey(factId: string, params: FactParams): string {
  return `${factId}?${Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&")}`;
}

/**
 * Proveedor por tenant. Las guardas NUNCA reciben el EventStore.
 */
export class FactProvider {
  private readonly projections = new Map<TenantId, TenantFactProjection>();

  projection(tenantId: TenantId): TenantFactProjection {
    let p = this.projections.get(tenantId);
    if (!p) {
      p = new TenantFactProjection(tenantId);
      this.projections.set(tenantId, p);
    }
    return p;
  }

  /** Suscribe proyección incremental al almacén de un tenant. */
  attachStore(tenantId: TenantId, store: EventStore): () => void {
    const proj = this.projection(tenantId);
    proj.rebuild(store.all() as DomainEvent[]);
    return store.subscribe((ev) => {
      proj.apply(ev as DomainEvent);
    });
  }

  applyEvent(tenantId: TenantId, event: DomainEvent): void {
    this.projection(tenantId).apply(event);
  }

  rebuild(tenantId: TenantId, events: readonly DomainEvent[]): void {
    this.projection(tenantId).rebuild(events);
  }

  /**
   * Calcula hechos en la posición actual del flujo del tenant.
   * `atPosition` opcional para fijar consistencia temporal.
   */
  prepare(
    tenantId: TenantId,
    requests: readonly FactRequest[],
    options?: { readonly atPosition?: number; readonly nowMs?: number },
  ): FactBag {
    const proj = this.projection(tenantId);
    if (proj.tenantId !== tenantId) {
      throw new TenantIsolationError("Proyección de otro tenant");
    }

    const at =
      options?.atPosition !== undefined ? options.atPosition : proj.position;
    const entries: Record<string, FactSnapshotEntry> = {};
    const versions: Record<
      string,
      { factId: string; params: FactParams; version: number }
    > = {};

    for (const req of requests) {
      assertKnownFact(req.factId, req.params);
      const value = proj.readAt(req.factId, req.params, at, options?.nowMs);
      const k = entryKey(req.factId, req.params);
      entries[k] = {
        factId: req.factId,
        params: req.params,
        ...value,
      };
      versions[k] = {
        factId: req.factId,
        params: req.params,
        version: value.version,
      };
    }

    const bag: FactBag = {
      tenantId,
      streamPosition: at,
      entries,
      versions,
      get(factId: string, params: FactParams = {}): number {
        const k = entryKey(factId, params);
        const e = entries[k];
        if (!e) {
          throw new FactAccessError(
            `Hecho no declarado en la bolsa: ${factId} (${k})`,
          );
        }
        return e.value;
      },
    };

    return sealFactBag(bag);
  }

  /**
   * Confirma que las versiones no cambiaron desde prepare.
   * Si cambiaron → OptimisticConflictError (reevaluar transición).
   */
  confirm(bag: FactBag): void {
    const proj = this.projection(bag.tenantId);
    for (const v of Object.values(bag.versions)) {
      const current = proj.read(v.factId, v.params);
      if (current.version !== v.version) {
        throw new FactOptimisticConflictError(
          `Hecho ${v.factId} cambió (v${v.version}→v${current.version}); reevaluar transición`,
          v.factId,
          v.version,
          current.version,
        );
      }
    }
  }

  /**
   * Intenta confirmar; si hay conflicto, regenera la bolsa en la nueva posición.
   * Devuelve la bolsa a usar (original o nueva tras conflicto detectado).
   */
  confirmOrRefresh(
    bag: FactBag,
    requests: readonly FactRequest[],
    options?: { readonly nowMs?: number },
  ): { ok: true; bag: FactBag } | { ok: false; bag: FactBag } {
    try {
      this.confirm(bag);
      return { ok: true, bag };
    } catch (err) {
      if (!(err instanceof FactOptimisticConflictError)) throw err;
      const refreshed = this.prepare(bag.tenantId, requests, {
        ...(options?.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
      });
      return { ok: false, bag: refreshed };
    }
  }

  /**
   * Materializa `calendario.turno_disponible` desde el calendario (hecho de turno).
   */
  materializeTurno(
    tenantId: TenantId,
    calendar: CompiledCalendar,
    params: {
      readonly at: string;
      readonly actorId?: string;
      readonly recursoId?: string;
    },
  ): void {
    const available = isOnShift(calendar, params.at, {
      ...(params.actorId !== undefined ? { actorId: params.actorId } : {}),
      ...(params.recursoId !== undefined ? { recursoId: params.recursoId } : {}),
    });
    const factParams: Record<string, string> = { at: params.at };
    if (params.actorId !== undefined) factParams.actorId = params.actorId;
    if (params.recursoId !== undefined) factParams.recursoId = params.recursoId;
    this.projection(tenantId).setTurnoDisponible(factParams, available);
  }
}

/** Impide acceder a propiedades de almacén / eventos desde la bolsa. */
function sealFactBag(bag: FactBag): FactBag {
  return new Proxy(bag, {
    get(target, prop, receiver) {
      const name = String(prop);
      if (
        name === "eventStore" ||
        name === "store" ||
        name === "events" ||
        name === "getBySubject" ||
        name === "all" ||
        name === "append"
      ) {
        throw new FactAccessError(
          "Las guardas no pueden acceder al almacén de eventos; solo a hechos declarados",
        );
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Sella el GuardContext para que cualquier acceso al EventStore falle.
 */
export function sealAgainstEventStore<T extends object>(ctx: T): T {
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      const name = String(prop);
      if (
        name === "eventStore" ||
        name === "store" ||
        name === "events" ||
        name === "getBySubject" ||
        name === "append" ||
        name === "all"
      ) {
        throw new FactAccessError(
          "Las guardas no pueden acceder al almacén de eventos; solo reciben hechos del Proveedor",
        );
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export { makeFactKey, entryKey };
