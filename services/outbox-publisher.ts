/**
 * OutboxPublisher: Background job que ejecuta drainOutbox() periódicamente.
 * At-least-once delivery: si falla, se reintenta al siguiente ciclo.
 */

import type { Pool } from "pg";
import { drainOutbox } from "../adapters/outbox.js";
import type { OutboxHandler } from "../adapters/outbox-handler.js";

export interface OutboxPublisherOptions {
  readonly pool: Pool;
  readonly handler: OutboxHandler;
  readonly intervalMs?: number;  // default 60000 (1 minuto)
  readonly batchSize?: number;   // default 50
}

export class OutboxPublisher {
  private readonly pool: Pool;
  private readonly handler: OutboxHandler;
  private readonly intervalMs: number;
  private timeoutId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(options: OutboxPublisherOptions) {
    this.pool = options.pool;
    this.handler = options.handler;
    this.intervalMs = options.intervalMs ?? 60000;  // 1 minuto por defecto
  }

  /**
   * Inicia el job: ejecuta drainOutbox() cada intervalMs
   */
  start(): void {
    if (this.isRunning) {
      console.warn("[OutboxPublisher] Ya está ejecutándose");
      return;
    }
    this.isRunning = true;
    console.log(
      `[OutboxPublisher] Iniciado: ejecutará drainOutbox() cada ${this.intervalMs}ms`
    );
    this.scheduleNext();
  }

  /**
   * Detiene el job
   */
  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.isRunning = false;
    console.log("[OutboxPublisher] Detenido");
  }

  /**
   * Ejecuta drainOutbox() una vez AHORA (util para testing)
   */
  async runOnce(companyId: string): Promise<number> {
    try {
      const published = await drainOutbox(
        this.pool,
        companyId,
        (row) => this.handler.handle(row)
      );
      if (published > 0) {
        console.log(
          `[OutboxPublisher] Publicados ${published} eventos para empresa ${companyId}`
        );
      }
      return published;
    } catch (err) {
      console.error("[OutboxPublisher] Error en drainOutbox:", err);
      return 0;
    }
  }

  /**
   * Ejecuta drainOutbox() para TODAS las empresas conocidas (si las tenemos)
   * En un sistema multi-tenant real, querrías iterar sobre empresas activas
   */
  async drainAll(companyIds: string[]): Promise<number> {
    let total = 0;
    for (const companyId of companyIds) {
      try {
        const n = await this.runOnce(companyId);
        total += n;
      } catch (err) {
        console.error(`[OutboxPublisher] Error drenando empresa ${companyId}:`, err);
      }
    }
    return total;
  }

  private scheduleNext(): void {
    if (!this.isRunning) return;

    this.timeoutId = setTimeout(async () => {
      try {
        // TODO: En producción, queremos iterar sobre empresas activas
        // Por ahora, solo loguear que está vivo
        console.log(`[OutboxPublisher] Tick: verificando outbox...`);
      } catch (err) {
        console.error("[OutboxPublisher] Error en tick:", err);
      } finally {
        this.scheduleNext();
      }
    }, this.intervalMs);
  }
}

/**
 * Singleton global (útil para dev/small deployments)
 * En producción, considerar Temporal, Bull queues, etc.
 */
let instance: OutboxPublisher | null = null;

export function getOutboxPublisher(): OutboxPublisher | null {
  return instance;
}

export function setOutboxPublisher(pub: OutboxPublisher | null): void {
  instance = pub;
}
