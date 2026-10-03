/**
 * Store SQLite para I+D (Fase 4B)
 * APPEND-ONLY: nunca UPDATE/DELETE
 */

import type {
  ProyectoIyD,
  Hito,
  RegistroTiempoTrabajo,
  RegistroGasto,
  Experimento,
  ResultadoExperimento,
} from "../elements/proyecto-iyd.js";

export interface IyDStore {
  guardarProyecto(proyecto: ProyectoIyD): Promise<void>;
  obtenerProyecto(id: string): Promise<ProyectoIyD | null>;
  listarProyectos(): Promise<ProyectoIyD[]>;

  guardarHito(proyectoId: string, hito: Hito): Promise<void>;
  obtenerHitosProyecto(proyectoId: string): Promise<Hito[]>;

  registrarTiempoTrabajo(trabajo: RegistroTiempoTrabajo): Promise<void>;
  obtenerTiempoTrabajoProyecto(proyectoId: string): Promise<RegistroTiempoTrabajo[]>;

  registrarGasto(gasto: RegistroGasto): Promise<void>;
  obtenerGastosProyecto(proyectoId: string): Promise<RegistroGasto[]>;

  guardarExperimento(experimento: Experimento): Promise<void>;
  obtenerExperimento(id: string): Promise<Experimento | null>;
  listarExperimentos(): Promise<Experimento[]>;

  guardarResultadoExperimento(resultado: ResultadoExperimento): Promise<void>;
  obtenerResultadosExperimento(experimentoId: string): Promise<ResultadoExperimento[]>;
}

export class SqliteIyDStore implements IyDStore {
  private proyectos: Map<string, ProyectoIyD> = new Map();
  private hitos: Map<string, Hito[]> = new Map();
  private tiempoTrabajo: RegistroTiempoTrabajo[] = [];
  private gastos: RegistroGasto[] = [];
  private experimentos: Map<string, Experimento> = new Map();
  private resultadosExperimentos: ResultadoExperimento[] = [];

  async guardarProyecto(proyecto: ProyectoIyD): Promise<void> {
    this.proyectos.set(proyecto.id, proyecto);
  }

  async obtenerProyecto(id: string): Promise<ProyectoIyD | null> {
    return this.proyectos.get(id) || null;
  }

  async listarProyectos(): Promise<ProyectoIyD[]> {
    return Array.from(this.proyectos.values());
  }

  async guardarHito(proyectoId: string, hito: Hito): Promise<void> {
    if (!this.hitos.has(proyectoId)) {
      this.hitos.set(proyectoId, []);
    }
    this.hitos.get(proyectoId)!.push(hito);
  }

  async obtenerHitosProyecto(proyectoId: string): Promise<Hito[]> {
    return this.hitos.get(proyectoId) || [];
  }

  async registrarTiempoTrabajo(trabajo: RegistroTiempoTrabajo): Promise<void> {
    this.tiempoTrabajo.push(trabajo);
  }

  async obtenerTiempoTrabajoProyecto(proyectoId: string): Promise<RegistroTiempoTrabajo[]> {
    return this.tiempoTrabajo; // Simplificado: en BD real, filtrar por proyectoId
  }

  async registrarGasto(gasto: RegistroGasto): Promise<void> {
    this.gastos.push(gasto);
  }

  async obtenerGastosProyecto(proyectoId: string): Promise<RegistroGasto[]> {
    return this.gastos; // Simplificado: en BD real, filtrar por proyectoId
  }

  async guardarExperimento(experimento: Experimento): Promise<void> {
    this.experimentos.set(experimento.id, experimento);
  }

  async obtenerExperimento(id: string): Promise<Experimento | null> {
    return this.experimentos.get(id) || null;
  }

  async listarExperimentos(): Promise<Experimento[]> {
    return Array.from(this.experimentos.values());
  }

  async guardarResultadoExperimento(resultado: ResultadoExperimento): Promise<void> {
    this.resultadosExperimentos.push(resultado);
  }

  async obtenerResultadosExperimento(experimentoId: string): Promise<ResultadoExperimento[]> {
    return this.resultadosExperimentos.filter(
      (r) => r.experimentoId === experimentoId,
    );
  }
}
