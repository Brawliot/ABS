/**
 * ViewActionIndex: Pre-indexación para búsquedas O(1).
 *
 * Cachea vistas y acciones agrupadas por estado y vista origen.
 * Mejora performance de O(N²) a O(1) en specs grandes.
 */

import { createHash } from "node:crypto";
import type {
  ActionSpec,
  ViewSpec,
} from "../presentation/types.js";

export class ViewActionIndex {
  private viewIndex: Map<string, ViewSpec> = new Map();
  private actionIndex: Map<string, ActionSpec> = new Map();
  private viewsByState: Map<string, ViewSpec[]> = new Map();
  private actionsByView: Map<string, ActionSpec[]> = new Map();
  private actionsByTransition: Map<string, ActionSpec> = new Map();
  private _indexHash: string = "";

  /**
   * Construye los índices desde vistas y acciones.
   * Debe llamarse una sola vez tras generar la spec.
   */
  build(views: readonly ViewSpec[], actions: readonly ActionSpec[]): void {
    // Indexar vistas
    for (const view of views) {
      this.viewIndex.set(view.id, view);

      // Agrupar por estado
      if (view.stateId) {
        if (!this.viewsByState.has(view.stateId)) {
          this.viewsByState.set(view.stateId, []);
        }
        this.viewsByState.get(view.stateId)!.push(view);
      }
    }

    // Indexar acciones
    for (const action of actions) {
      this.actionIndex.set(action.id, action);
      this.actionsByTransition.set(action.transitionId, action);

      // Agrupar por vista origen (deducida de actionIds en vistas)
      // Nota: Las acciones no tienen referencia directa a vista, se indexan
      // cuando se referencian desde las vistas
    }

    // Segundo paso: agrupar acciones por vista (desde viewSpec.actionIds)
    for (const view of views) {
      if (view.actionIds.length > 0) {
        if (!this.actionsByView.has(view.id)) {
          this.actionsByView.set(view.id, []);
        }
        for (const actionId of view.actionIds) {
          const action = this.actionIndex.get(actionId);
          if (action) {
            this.actionsByView.get(view.id)!.push(action);
          }
        }
      }
    }

    // Calcular hash para determinismo
    this._indexHash = this.calculateHash();
  }

  /**
   * Obtiene todas las vistas para un estado dado. O(1).
   */
  getViewsByState(state: string): ViewSpec[] {
    return this.viewsByState.get(state) ?? [];
  }

  /**
   * Obtiene todas las acciones disponibles en una vista. O(1).
   */
  getActionsFromView(viewId: string): ActionSpec[] {
    return this.actionsByView.get(viewId) ?? [];
  }

  /**
   * Obtiene una vista por su ID. O(1).
   */
  getView(id: string): ViewSpec | undefined {
    return this.viewIndex.get(id);
  }

  /**
   * Obtiene una acción por su ID. O(1).
   */
  getAction(id: string): ActionSpec | undefined {
    return this.actionIndex.get(id);
  }

  /**
   * Obtiene una acción por su transitionId. O(1).
   */
  getActionByTransition(transitionId: string): ActionSpec | undefined {
    return this.actionsByTransition.get(transitionId);
  }

  /**
   * Devuelve todas las vistas indexadas.
   */
  getAllViews(): ViewSpec[] {
    return Array.from(this.viewIndex.values());
  }

  /**
   * Devuelve todas las acciones indexadas.
   */
  getAllActions(): ActionSpec[] {
    return Array.from(this.actionIndex.values());
  }

  /**
   * Devuelve el hash del índice para validar determinismo.
   */
  get indexHash(): string {
    return this._indexHash;
  }

  /**
   * Calcula hash del índice basado en IDs ordenados.
   * Determinista: mismo índice → mismo hash.
   */
  private calculateHash(): string {
    const hasher = createHash("sha256");

    // Ordenar todos los IDs para determinismo
    const viewIds = Array.from(this.viewIndex.keys()).sort();
    const actionIds = Array.from(this.actionIndex.keys()).sort();
    const stateIds = Array.from(this.viewsByState.keys()).sort();

    hasher.update(JSON.stringify({ viewIds, actionIds, stateIds }));

    return hasher.digest("hex").substring(0, 16);
  }

  /**
   * Valida que todos los actionIds en vistas existan en el índice.
   */
  validateConsistency(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const view of this.viewIndex.values()) {
      for (const actionId of view.actionIds) {
        if (!this.actionIndex.has(actionId)) {
          errors.push(
            `Vista ${view.id} referencia acción inexistente: ${actionId}`,
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Retorna estadísticas del índice para análisis de performance.
   */
  getStats(): {
    readonly totalViews: number;
    readonly totalActions: number;
    readonly stateCount: number;
    readonly avgActionsPerView: number;
    readonly avgViewsPerState: number;
  } {
    const totalViews = this.viewIndex.size;
    const totalActions = this.actionIndex.size;
    const stateCount = this.viewsByState.size;

    let totalActionsInViews = 0;
    for (const actions of this.actionsByView.values()) {
      totalActionsInViews += actions.length;
    }

    let totalViewsInStates = 0;
    for (const views of this.viewsByState.values()) {
      totalViewsInStates += views.length;
    }

    return {
      totalViews,
      totalActions,
      stateCount,
      avgActionsPerView:
        totalViews > 0 ? totalActionsInViews / totalViews : 0,
      avgViewsPerState:
        stateCount > 0 ? totalViewsInStates / stateCount : 0,
    };
  }
}
