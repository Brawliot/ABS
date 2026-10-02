import { randomUUID } from "crypto";

export type EstadoPresupuesto =
  | "borrador"
  | "aprobado"
  | "en_ejecución"
  | "cerrado"
  | "revisionado";

export type TipoPartida =
  | "salarios"
  | "gastos_operativos"
  | "inversión"
  | "marketing"
  | "otros";

export interface Presupuesto {
  readonly id: string;
  readonly nombre: string;
  readonly año: number;
  readonly departamento?: string;
  readonly estado: EstadoPresupuesto;
  readonly partidas: PartidaPresupuestaria[];
  readonly presupuesto_total: number;
  readonly gasto_real: number;
  readonly fecha_creación: Date;
  readonly aprobado_por?: string;
}

export interface PartidaPresupuestaria {
  readonly id: string;
  readonly presupuesto_id: string;
  readonly concepto: string;
  readonly tipo: TipoPartida;
  readonly presupuestado: number;
  readonly gastado: number;
  readonly porcentaje_gastado: number;
  readonly varianza: number;
}

export interface EjecuciónPresupuesto {
  readonly presupuesto_total: number;
  readonly gastado_total: number;
  readonly disponible: number;
  readonly porcentaje_ejecutado: number;
  readonly varianzas: {
    partida_id: string;
    concepto: string;
    varianza_pct: number;
  }[];
}

export class MotorPresupuestos {
  private presupuestos: Map<string, Presupuesto> = new Map();
  private gastos: Map<string, number[]> = new Map(); // partida_id -> [gastos]

  crearPresupuesto(
    nombre: string,
    año: number,
    departamento?: string
  ): Presupuesto {
    const id = randomUUID();
    const presupuesto: Presupuesto = {
      id,
      nombre,
      año,
      departamento,
      estado: "borrador",
      partidas: [],
      presupuesto_total: 0,
      gasto_real: 0,
      fecha_creación: new Date(),
    };

    this.presupuestos.set(id, presupuesto);
    return presupuesto;
  }

  agregarPartida(
    presupuesto_id: string,
    concepto: string,
    tipo: TipoPartida,
    monto_presupuestado: number
  ): PartidaPresupuestaria {
    const presupuesto = this.presupuestos.get(presupuesto_id);
    if (!presupuesto) {
      throw new Error("Presupuesto no encontrado");
    }

    const partida: PartidaPresupuestaria = {
      id: randomUUID(),
      presupuesto_id,
      concepto,
      tipo,
      presupuestado: monto_presupuestado,
      gastado: 0,
      porcentaje_gastado: 0,
      varianza: 0,
    };

    const partidas = [...presupuesto.partidas, partida];
    const presupuesto_total = partidas.reduce(
      (sum, p) => sum + p.presupuestado,
      0
    );

    const presupuestoActualizado: Presupuesto = {
      ...presupuesto,
      partidas,
      presupuesto_total,
    };

    this.presupuestos.set(presupuesto_id, presupuestoActualizado);
    this.gastos.set(partida.id, []);

    return partida;
  }

  registrarGasto(partida_id: string, monto: number): void {
    const gastos = this.gastos.get(partida_id) ?? [];
    gastos.push(monto);
    this.gastos.set(partida_id, gastos);

    // Actualizar todas las partidas afectadas
    for (const [presupuesto_id, presupuesto] of this.presupuestos) {
      const partidas_actualizado = presupuesto.partidas.map((p) => {
        if (p.id === partida_id) {
          const gastado = (this.gastos.get(partida_id) ?? []).reduce(
            (sum, g) => sum + g,
            0
          );
          return {
            ...p,
            gastado,
            porcentaje_gastado: (gastado / p.presupuestado) * 100,
            varianza: p.presupuestado - gastado,
          };
        }
        return p;
      });

      const gasto_real = partidas_actualizado.reduce(
        (sum, p) => sum + p.gastado,
        0
      );

      this.presupuestos.set(presupuesto_id, {
        ...presupuesto,
        partidas: partidas_actualizado,
        gasto_real,
      });
    }
  }

  calcularVarianzas(presupuesto_id: string): {
    varianza_total: number;
    varianza_pct: number;
    partidas_en_rojo: PartidaPresupuestaria[];
    partidas_sobre_presupuesto: PartidaPresupuestaria[];
  } {
    const presupuesto = this.presupuestos.get(presupuesto_id);
    if (!presupuesto) {
      return {
        varianza_total: 0,
        varianza_pct: 0,
        partidas_en_rojo: [],
        partidas_sobre_presupuesto: [],
      };
    }

    const varianza_total = presupuesto.presupuesto_total - presupuesto.gasto_real;
    const varianza_pct =
      presupuesto.presupuesto_total > 0
        ? (varianza_total / presupuesto.presupuesto_total) * 100
        : 0;

    const partidas_en_rojo = presupuesto.partidas.filter(
      (p) => p.porcentaje_gastado >= 90
    );
    const partidas_sobre_presupuesto = presupuesto.partidas.filter(
      (p) => p.gastado > p.presupuestado
    );

    return {
      varianza_total,
      varianza_pct,
      partidas_en_rojo,
      partidas_sobre_presupuesto,
    };
  }

  aprobarPresupuesto(presupuesto_id: string, aprobado_por: string): void {
    const presupuesto = this.presupuestos.get(presupuesto_id);
    if (!presupuesto) {
      throw new Error("Presupuesto no encontrado");
    }

    const presupuestoActualizado: Presupuesto = {
      ...presupuesto,
      estado: "aprobado",
      aprobado_por,
    };

    this.presupuestos.set(presupuesto_id, presupuestoActualizado);
  }

  obtenerEjecuciónPresupuesto(presupuesto_id: string): EjecuciónPresupuesto {
    const presupuesto = this.presupuestos.get(presupuesto_id);
    if (!presupuesto) {
      throw new Error("Presupuesto no encontrado");
    }

    const disponible = presupuesto.presupuesto_total - presupuesto.gasto_real;
    const porcentaje_ejecutado =
      presupuesto.presupuesto_total > 0
        ? (presupuesto.gasto_real / presupuesto.presupuesto_total) * 100
        : 0;

    const varianzas = presupuesto.partidas.map((p) => ({
      partida_id: p.id,
      concepto: p.concepto,
      varianza_pct: ((p.presupuestado - p.gastado) / p.presupuestado) * 100,
    }));

    return {
      presupuesto_total: presupuesto.presupuesto_total,
      gastado_total: presupuesto.gasto_real,
      disponible,
      porcentaje_ejecutado,
      varianzas,
    };
  }

  obtenerPresupuesto(id: string): Presupuesto | undefined {
    return this.presupuestos.get(id);
  }

  listarPresupuestos(): Presupuesto[] {
    return Array.from(this.presupuestos.values());
  }
}
