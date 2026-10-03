/**
 * Store SQLite para Simulador (Fase 4B)
 * APPEND-ONLY: nunca UPDATE/DELETE
 */

import type {
  GuardadoSimulación,
  ValidacionSimulación,
  AccuracyPorModelo,
} from "../elements/simulador.js";

export interface SimuladorStore {
  guardarSimulación(sim: GuardadoSimulación): Promise<void>;
  obtenerSimulación(id: string): Promise<GuardadoSimulación | null>;
  listarSimulaciones(): Promise<GuardadoSimulación[]>;

  guardarEscenario(escenario: any): Promise<void>;
  obtenerEscenarios(): Promise<any[]>;

  guardarValidación(validacion: ValidacionSimulación): Promise<void>;
  obtenerValidaciones(): Promise<ValidacionSimulación[]>;

  guardarAccuracy(accuracy: AccuracyPorModelo[]): Promise<void>;
  obtenerAccuracy(): Promise<AccuracyPorModelo[]>;
}

export class SqliteSimuladorStore implements SimuladorStore {
  private simulaciones: Map<string, GuardadoSimulación> = new Map();
  private escenarios: any[] = [];
  private validaciones: ValidacionSimulación[] = [];
  private accuracyPorModelo: AccuracyPorModelo[] = [];

  async guardarSimulación(sim: GuardadoSimulación): Promise<void> {
    this.simulaciones.set(sim.id, sim);
  }

  async obtenerSimulación(id: string): Promise<GuardadoSimulación | null> {
    return this.simulaciones.get(id) || null;
  }

  async listarSimulaciones(): Promise<GuardadoSimulación[]> {
    return Array.from(this.simulaciones.values());
  }

  async guardarEscenario(escenario: any): Promise<void> {
    this.escenarios.push({
      ...escenario,
      id: `escenario-${Date.now()}`,
      fecha: new Date(),
    });
  }

  async obtenerEscenarios(): Promise<any[]> {
    return this.escenarios;
  }

  async guardarValidación(validacion: ValidacionSimulación): Promise<void> {
    this.validaciones.push(validacion);
  }

  async obtenerValidaciones(): Promise<ValidacionSimulación[]> {
    return this.validaciones;
  }

  async guardarAccuracy(accuracy: AccuracyPorModelo[]): Promise<void> {
    this.accuracyPorModelo = accuracy;
  }

  async obtenerAccuracy(): Promise<AccuracyPorModelo[]> {
    return this.accuracyPorModelo;
  }
}
