import type {
  Presupuesto,
  PartidaPresupuestaria,
} from "./presupuestos-motor.js";
import { randomUUID } from "crypto";

export interface ConfiguraciónAlerta {
  readonly presupuesto_id: string;
  readonly umbral_pct: number;
  readonly notificar_a: string[];
}

export interface Escenario {
  readonly id: string;
  readonly presupuesto_id: string;
  readonly nombre: string;
  readonly ajustes: Map<string, number>; // partida_id -> nuevo_monto
  readonly presupuesto_ajustado: number;
  readonly varianza_esperada: number;
}

export interface ComparativaEscenario {
  readonly escenario_id: string;
  readonly nombre: string;
  readonly impacto_presupuesto: number;
  readonly impacto_varianza: number;
}

export class MotorAlertasPresupuesto {
  private alertas: Map<string, ConfiguraciónAlerta> = new Map();
  private escenarios: Map<string, Escenario> = new Map();

  configurarAlertas(
    presupuesto_id: string,
    umbral_pct: number = 80,
    notificar_a: string[] = []
  ): void {
    const alerta: ConfiguraciónAlerta = {
      presupuesto_id,
      umbral_pct,
      notificar_a,
    };

    this.alertas.set(presupuesto_id, alerta);
  }

  detectarOvrespend(presupuesto: Presupuesto): PartidaPresupuestaria[] {
    const alerta = this.alertas.get(presupuesto.id);
    const umbral = alerta?.umbral_pct ?? 80;

    return presupuesto.partidas.filter((p) => p.porcentaje_gastado >= umbral);
  }

  crearEscenario(
    presupuesto: Presupuesto,
    nombre: string,
    ajustes: Map<string, number>
  ): { presupuesto_ajustado: number; varianza_esperada: number } {
    const id = randomUUID();

    // Calcular presupuesto con ajustes
    let presupuesto_ajustado = 0;
    const partidas_ajustadas = presupuesto.partidas.map((p) => {
      const monto_ajustado = ajustes.get(p.id) ?? p.presupuestado;
      presupuesto_ajustado += monto_ajustado;
      return monto_ajustado;
    });

    const gasto_proyectado = presupuesto.gasto_real;
    const varianza_esperada = presupuesto_ajustado - gasto_proyectado;

    const escenario: Escenario = {
      id,
      presupuesto_id: presupuesto.id,
      nombre,
      ajustes,
      presupuesto_ajustado,
      varianza_esperada,
    };

    this.escenarios.set(id, escenario);

    return {
      presupuesto_ajustado,
      varianza_esperada,
    };
  }

  compararEscenarios(
    presupuesto_actual: Presupuesto,
    escenarios: Escenario[]
  ): ComparativaEscenario[] {
    return escenarios.map((esc) => {
      const impacto_presupuesto = esc.presupuesto_ajustado - presupuesto_actual.presupuesto_total;
      const impacto_varianza = esc.varianza_esperada - (presupuesto_actual.presupuesto_total - presupuesto_actual.gasto_real);

      return {
        escenario_id: esc.id,
        nombre: esc.nombre,
        impacto_presupuesto,
        impacto_varianza,
      };
    });
  }

  obtenerEscenario(id: string): Escenario | undefined {
    return this.escenarios.get(id);
  }

  listarEscenarios(presupuesto_id: string): Escenario[] {
    return Array.from(this.escenarios.values()).filter(
      (e) => e.presupuesto_id === presupuesto_id
    );
  }
}
