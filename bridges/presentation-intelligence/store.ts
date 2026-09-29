/**
 * Almacén de telemetría UX — SEPARADO del EventStore de negocio.
 * Uso interno del puente; la capa 3 NO lo recibe.
 */

import type { DomainEvent } from "../../core/events.js";
import type { EventStore } from "../../core/event-store.js";
import {
  TELEMETRY_RETENTION_DAYS,
  ExperienceStoreError,
  type ExperienceTelemetryRecord,
} from "./types.js";
import { assertTelemetryPrivacy } from "./privacy.js";

export class ExperienceTelemetryStore {
  private readonly records: ExperienceTelemetryRecord[] = [];

  /** Añade un registro (falla si viola privacidad). */
  append(record: ExperienceTelemetryRecord): void {
    assertTelemetryPrivacy(record);
    if (this.records.some((r) => r.id === record.id)) {
      throw new ExperienceStoreError(
        `Telemetría duplicada: id ${record.id}`,
      );
    }
    this.records.push(Object.freeze({ ...record }));
  }

  /** Lectura interna (capa 2 / puente). No exportar a capa 3. */
  all(): readonly ExperienceTelemetryRecord[] {
    return this.records;
  }

  byRecorrido(recorridoId: string): readonly ExperienceTelemetryRecord[] {
    return this.records.filter((r) => r.recorridoId === recorridoId);
  }

  /**
   * Conservación limitada: elimina registros más antiguos que `retentionDays`
   * respecto a `nowIso`. No toca el EventStore de negocio.
   */
  purgeExpired(
    nowIso: string,
    retentionDays: number = TELEMETRY_RETENTION_DAYS,
  ): number {
    const now = Date.parse(nowIso);
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (let i = this.records.length - 1; i >= 0; i--) {
      const at = Date.parse(this.records[i]!.at);
      if (at < cutoff) {
        this.records.splice(i, 1);
        removed += 1;
      }
    }
    return removed;
  }

  size(): number {
    return this.records.length;
  }
}

/**
 * Garantiza que abandonar un formulario / telemetría UX
 * no escribe en el almacén de eventos de negocio.
 */
export function recordAbandonWithoutBusinessEvent(input: {
  readonly telemetry: ExperienceTelemetryStore;
  readonly businessStore: EventStore;
  readonly record: ExperienceTelemetryRecord;
}): { readonly businessEventCount: number } {
  const before = input.businessStore.all().length;
  input.telemetry.append(input.record);
  const after = input.businessStore.all().length;
  if (after !== before) {
    throw new ExperienceStoreError(
      "Invariante violada: telemetría UX escribió en EventStore de negocio",
    );
  }
  return { businessEventCount: after };
}

/** @deprecated Preferir openLayer3Reader — se mantiene por compatibilidad de pruebas. */
export interface ExperienceReadOnlyView {
  all(): readonly ExperienceTelemetryRecord[];
  byRecorrido(recorridoId: string): readonly ExperienceTelemetryRecord[];
  size(): number;
}

/** @deprecated Preferir openLayer3Reader. */
export function asReadOnlyView(
  store: ExperienceTelemetryStore,
): ExperienceReadOnlyView {
  return {
    all: () => store.all(),
    byRecorrido: (id) => store.byRecorrido(id),
    size: () => store.size(),
  };
}

/** Tipo guard: DomainEvent no es telemetría. */
export function isBusinessDomainEvent(
  e: DomainEvent | ExperienceTelemetryRecord,
): e is DomainEvent {
  return (
    "kind" in e &&
    (e.kind === "transicion" ||
      e.kind === "excepcion" ||
      e.kind === "modificacion" ||
      e.kind === "vencimiento")
  );
}
