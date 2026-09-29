/**
 * Motor de proyección (principio 7): los ciclos derivados solo avanzan
 * reproduciendo eventos de transacciones. Ninguna otra vía puede mutarlos.
 */

import { deriveState, type DerivedState } from "../core/derivation.js";
import type { AppendOnlyEvent, DomainEvent, EvidenceRecord } from "../core/events.js";
import type { EventStore } from "../core/event-store.js";
import type { Lifecycle } from "../core/lifecycle.js";
import {
  movimientoDerivedLifecycle,
  recursoDerivedLifecycle,
} from "./derived-lifecycles.js";

export class DerivedCycleMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DerivedCycleMutationError";
  }
}

export type DerivedElementKind = "recurso" | "movimiento";

interface DerivedElementRecord {
  readonly kind: DerivedElementKind;
  readonly lifecycle: Lifecycle;
  /** Log privado: solo la proyección puede añadir eventos. */
  events: DomainEvent[];
}

interface TxLinks {
  recursos: Set<string>;
  movimientos: Set<string>;
}

const SYSTEM_EVIDENCE = (at: string): EvidenceRecord => ({
  kind: "sistema",
  reference: "projection",
  recordedAt: at,
});

const FISICA_EVIDENCE = (at: string): EvidenceRecord => ({
  kind: "fisica",
  reference: "projection",
  recordedAt: at,
});

/**
 * Proyecta eventos de transacción sobre recursos y movimientos vinculados.
 *
 * Reglas (ejemplos del principio 7):
 * - Acuerdo (aceptada) → reserva el Recurso
 * - Cancelada → libera el Recurso (devolver)
 * - Cierre / cobro → liquida el Movimiento (y consume recurso si sigue reservado)
 */
export class DerivedLifecycleProjection {
  private readonly elements = new Map<string, DerivedElementRecord>();
  private readonly linksByTx = new Map<string, TxLinks>();
  private unsubscribe: (() => void) | undefined;
  private seq = 0;

  /** Se suscribe al flujo append-only del almacén. */
  attach(store: EventStore): void {
    this.detach();
    this.unsubscribe = store.subscribe((event) => this.onTransactionEvent(event));
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  registerRecurso(id: string): void {
    if (this.elements.has(id)) {
      throw new DerivedCycleMutationError(`Elemento derivado ya registrado: ${id}`);
    }
    this.elements.set(id, {
      kind: "recurso",
      lifecycle: recursoDerivedLifecycle,
      events: [],
    });
  }

  registerMovimiento(id: string): void {
    if (this.elements.has(id)) {
      throw new DerivedCycleMutationError(`Elemento derivado ya registrado: ${id}`);
    }
    this.elements.set(id, {
      kind: "movimiento",
      lifecycle: movimientoDerivedLifecycle,
      events: [],
    });
  }

  linkRecurso(transactionId: string, recursoId: string): void {
    this.assertRegistered(recursoId, "recurso");
    this.linksOf(transactionId).recursos.add(recursoId);
  }

  linkMovimiento(transactionId: string, movimientoId: string): void {
    this.assertRegistered(movimientoId, "movimiento");
    this.linksOf(transactionId).movimientos.add(movimientoId);
  }

  stateOf(elementId: string): DerivedState {
    const rec = this.elements.get(elementId);
    if (!rec) {
      throw new DerivedCycleMutationError(`Elemento derivado desconocido: ${elementId}`);
    }
    return deriveState(rec.lifecycle, rec.events);
  }

  /**
   * Única vía pública de mutación directa — siempre falla.
   * Los ciclos derivados no pueden modificarse fuera de la proyección.
   */
  applyDirectTransition(
    _elementId: string,
    _transitionId: string,
  ): never {
    throw new DerivedCycleMutationError(
      "Ciclo derivado: mutación directa prohibida; solo avanza por proyección de eventos de transacción",
    );
  }

  /** Intento de escribir el log derivado a mano — siempre falla. */
  appendDerivedEvent(_elementId: string, _event: DomainEvent): never {
    throw new DerivedCycleMutationError(
      "Ciclo derivado: no se pueden añadir eventos fuera del motor de proyección",
    );
  }

  /** Permite reinyectar un evento (p. ej. tests o replay sin store). */
  project(event: AppendOnlyEvent | DomainEvent): void {
    this.onTransactionEvent(event);
  }

  private onTransactionEvent(event: AppendOnlyEvent | DomainEvent): void {
    const toState =
      event.kind === "transicion" ||
      event.kind === "excepcion" ||
      event.kind === "vencimiento"
        ? event.toStateId
        : undefined;
    if (!toState) return;

    const links = this.linksByTx.get(event.subjectId);
    if (!links) return;

    const at = event.occurredAt;

    if (toState === "aceptada") {
      for (const rid of links.recursos) {
        this.tryApply(rid, "t_recurso_reservar", at, SYSTEM_EVIDENCE(at));
      }
    }

    if (toState === "cancelada") {
      for (const rid of links.recursos) {
        this.tryApply(rid, "t_recurso_devolver", at, FISICA_EVIDENCE(at), "humano");
      }
    }

    if (toState === "cerrada") {
      for (const rid of links.recursos) {
        this.tryApply(rid, "t_recurso_consumir", at, FISICA_EVIDENCE(at));
      }
      for (const mid of links.movimientos) {
        this.tryApply(mid, "t_mov_liquidar", at, SYSTEM_EVIDENCE(at));
      }
    }
  }

  private tryApply(
    elementId: string,
    transitionId: string,
    at: string,
    evidence: EvidenceRecord,
    actorKind: "sistema" | "humano" = "sistema",
  ): void {
    const rec = this.elements.get(elementId);
    if (!rec) return;

    const current = deriveState(rec.lifecycle, rec.events);
    const transition = rec.lifecycle.transitions.find((t) => t.id === transitionId);
    if (!transition) return;
    if (transition.from !== current.currentStateId) return;

    this.seq += 1;
    const derivedEvent: DomainEvent = {
      id: `proj-${elementId}-${this.seq}`,
      kind: "transicion",
      subjectId: elementId,
      occurredAt: at,
      actorId: "projection",
      actorKind,
      evidence,
      transitionId,
      fromStateId: transition.from,
      toStateId: transition.to,
    };
    rec.events.push(derivedEvent);
  }

  private linksOf(transactionId: string): TxLinks {
    let links = this.linksByTx.get(transactionId);
    if (!links) {
      links = { recursos: new Set(), movimientos: new Set() };
      this.linksByTx.set(transactionId, links);
    }
    return links;
  }

  private assertRegistered(id: string, kind: DerivedElementKind): void {
    const rec = this.elements.get(id);
    if (!rec || rec.kind !== kind) {
      throw new DerivedCycleMutationError(
        `Se esperaba ${kind} registrado con id ${id}`,
      );
    }
  }
}
