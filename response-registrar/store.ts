/**
 * Almacén de respuestas a Insights — SEPARADO del EventStore de negocio.
 */

import type { EventStore } from "../core/event-store.js";
import {
  RESPONSE_RETENTION_DAYS,
  ResponseRegistrarError,
  type InsightResponseRecord,
} from "./types.js";
import { assertResponsePrivacy } from "./privacy.js";

export class InsightResponseStore {
  private readonly records: InsightResponseRecord[] = [];

  append(record: InsightResponseRecord): void {
    assertResponsePrivacy(record);
    if (this.records.some((r) => r.id === record.id)) {
      throw new ResponseRegistrarError(
        `Respuesta duplicada: id ${record.id}`,
      );
    }
    this.records.push(Object.freeze({ ...record }));
  }

  /** Sustituye un registro existente (actualización de outcome / vínculo). */
  replace(record: InsightResponseRecord): void {
    assertResponsePrivacy(record);
    const idx = this.records.findIndex((r) => r.id === record.id);
    if (idx < 0) {
      throw new ResponseRegistrarError(
        `Respuesta no encontrada: ${record.id}`,
      );
    }
    this.records[idx] = Object.freeze({ ...record });
  }

  get(id: string): InsightResponseRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  all(): readonly InsightResponseRecord[] {
    return this.records;
  }

  byInsight(insightId: string): readonly InsightResponseRecord[] {
    return this.records.filter((r) => r.insightId === insightId);
  }

  purgeExpired(
    nowIso: string,
    retentionDays: number = RESPONSE_RETENTION_DAYS,
  ): number {
    const cutoff =
      Date.parse(nowIso) - retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (let i = this.records.length - 1; i >= 0; i--) {
      const at = Date.parse(this.records[i]!.outcomeAt);
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

/** Garantiza que registrar respuesta no escribe en EventStore de negocio. */
export function assertNoBusinessStoreMutation(
  businessStore: EventStore,
  mutate: () => void,
): void {
  const before = businessStore.all().length;
  mutate();
  if (businessStore.all().length !== before) {
    throw new ResponseRegistrarError(
      "Invariante: Registrador escribió en EventStore de negocio",
    );
  }
}
