/**
 * SnapshotManager: Gestiona creación y uso de snapshots.
 * Estrategia: crear snapshot cada N eventos para fast-path replay.
 */

import type { DomainEvent } from "../core/events.js";
import type { AppRuntime } from "../web/runtime.js";

export interface SnapshotConfig {
  readonly enableSnapshots?: boolean;
  readonly snapshotIntervalEvents?: number;  // default 1000
  readonly pruneKeepCount?: number;          // default 5
}

export class SnapshotManager {
  private readonly snapshotIntervalEvents: number;
  private readonly pruneKeepCount: number;
  private eventsSinceLastSnapshot = new Map<string, number>();

  constructor(config: SnapshotConfig = {}) {
    this.snapshotIntervalEvents = config.snapshotIntervalEvents ?? 1000;
    this.pruneKeepCount = config.pruneKeepCount ?? 5;
  }

  /**
   * Después de procesar un evento, decidir si crear snapshot.
   * Si han pasado N eventos → snapshottear el estado actual.
   */
  async considerSnapshot(
    runtime: AppRuntime,
    subjectId: string,
    currentStreamVersion: number,
    currentState: unknown
  ): Promise<boolean> {
    const eventsSince = (this.eventsSinceLastSnapshot.get(subjectId) ?? 0) + 1;
    this.eventsSinceLastSnapshot.set(subjectId, eventsSince);

    if (eventsSince < this.snapshotIntervalEvents) {
      return false; // No es hora aún
    }

    // Es hora de snapshottear
    try {
      // Guardar snapshot
      // En dev/SQLite: ignorar (no soporta SnapshotStore)
      if ((runtime.store as any).saveSnapshot) {
        await (runtime.store as any).saveSnapshot(
          subjectId,
          currentStreamVersion,
          currentState
        );
        console.log(
          `[SnapshotManager] Snapshot creado: ${subjectId} @ v${currentStreamVersion}`
        );
      }

      // Reset contador
      this.eventsSinceLastSnapshot.set(subjectId, 0);

      // Limpiar snapshots antiguos (background)
      this.pruneOldSnapshots(runtime, subjectId).catch((err) => {
        console.error(
          `[SnapshotManager] Error prunando snapshots: ${subjectId}`,
          err
        );
      });

      return true;
    } catch (err) {
      // No romper flujo si falla snapshot
      console.error(`[SnapshotManager] Error creando snapshot: ${subjectId}`, err);
      return false;
    }
  }

  /**
   * Limpiar snapshots antiguos (background job).
   */
  private async pruneOldSnapshots(
    runtime: AppRuntime,
    subjectId: string
  ): Promise<void> {
    if ((runtime.store as any).pruneSnapshots) {
      const deleted = await (runtime.store as any).pruneSnapshots(
        subjectId,
        this.pruneKeepCount
      );
      if (deleted > 0) {
        console.log(
          `[SnapshotManager] Prunados ${deleted} snapshots antiguos: ${subjectId}`
        );
      }
    }
  }
}

/**
 * Singleton global para fácil acceso.
 */
let instance: SnapshotManager | null = null;

export function getSnapshotManager(): SnapshotManager {
  if (!instance) {
    instance = new SnapshotManager();
  }
  return instance;
}

export function setSnapshotManager(manager: SnapshotManager | null): void {
  instance = manager;
}
