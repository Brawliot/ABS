/**
 * MotorPoliticasDeNegocio (Capa 0.3)
 * Reglas globales que aplican a TODO.
 * Se validan JUNTO CON MotorValidacion.
 * Ejemplos: máximo descuento, mínimo margen, plazo crédito máximo, etc.
 */

interface PoliticaRule {
  readonly id: string;
  readonly archetype: string;
  readonly campo: string;
  readonly condicion: string;
  readonly valor: number | string;
  readonly bloqueante: boolean;
  readonly descripcion: string;
}

export interface PoliticaViolacion {
  readonly policyId: string;
  readonly descripcion: string;
  readonly valor_actual: number | string;
  readonly valor_limite: number | string;
  readonly bloqueante: boolean;
}

export interface ValidacionPoliticasResult {
  readonly permitida: boolean;
  readonly violaciones: PoliticaViolacion[];
  readonly advertencias: PoliticaViolacion[];
}

export class MotorPoliticasDeNegocio {
  private config: {
    readonly politicasPorArchetype: Record<string, PoliticaRule[]>;
  };

  constructor() {
    this.config = this.construirConfiguracion();
  }

  private construirConfiguracion() {
    return {
      politicasPorArchetype: {
        venta: [
          {
            id: "pol_venta_descuento_max",
            archetype: "venta",
            campo: "descuento_pct",
            condicion: "<=",
            valor: 15,
            bloqueante: true,
            descripcion: "Máximo descuento permitido: 15%",
          },
          {
            id: "pol_venta_margen_min",
            archetype: "venta",
            campo: "margen",
            condicion: ">=",
            valor: 20,
            bloqueante: true,
            descripcion: "Margen mínimo requerido: 20%",
          },
          {
            id: "pol_venta_lineas_max",
            archetype: "venta",
            campo: "cantidad_lineas",
            condicion: "<=",
            valor: 100,
            bloqueante: false,
            descripcion: "Advertencia: más de 100 líneas es inusual",
          },
        ],
        compra: [
          {
            id: "pol_compra_min_orden",
            archetype: "compra",
            campo: "total",
            condicion: ">=",
            valor: 100,
            bloqueante: false,
            descripcion: "Advertencia: orden menor a 100 puede incurrir en sobrecostos",
          },
          {
            id: "pol_compra_proveedor_activo",
            archetype: "compra",
            campo: "proveedor_activo",
            condicion: "==",
            valor: 1,
            bloqueante: true,
            descripcion: "Solo se puede comprar a proveedores activos",
          },
        ],
        servicio: [
          {
            id: "pol_servicio_plazo_credito_max",
            archetype: "servicio",
            campo: "plazo_credito_dias",
            condicion: "<=",
            valor: 90,
            bloqueante: true,
            descripcion: "Plazo máximo de crédito: 90 días",
          },
          {
            id: "pol_servicio_margen_min",
            archetype: "servicio",
            campo: "margen",
            condicion: ">=",
            valor: 25,
            bloqueante: true,
            descripcion: "Margen mínimo para servicios: 25%",
          },
        ],
      },
    };
  }

  validarPoliticas(
    tx: Record<string, unknown>,
  ): ValidacionPoliticasResult {
    const archetype = (tx.arquetipo_id as string) ?? "desconocido";
    const politicas = this.config.politicasPorArchetype[archetype] ?? [];
    const violaciones: PoliticaViolacion[] = [];
    const advertencias: PoliticaViolacion[] = [];

    console.log(
      `[MotorPoliticasDeNegocio] Validando ${archetype} contra ${politicas.length} política(s)`,
    );

    for (const politica of politicas) {
      const cumple = this.evaluarPolitica(politica, tx);
      if (!cumple) {
        const violacion: PoliticaViolacion = {
          policyId: politica.id,
          descripcion: politica.descripcion,
          valor_actual: (tx[politica.campo] as number | string) ?? "N/A",
          valor_limite: politica.valor,
          bloqueante: politica.bloqueante,
        };

        if (politica.bloqueante) {
          violaciones.push(violacion);
          console.log(`❌ Violación bloqueante: ${politica.id}`);
        } else {
          advertencias.push(violacion);
          console.log(`⚠️ Advertencia de política: ${politica.id}`);
        }
      }
    }

    const permitida = violaciones.length === 0;
    console.log(
      permitida
        ? `✅ Todas las políticas cumplidas`
        : `❌ ${violaciones.length} violación(es) bloqueante(s)`,
    );

    return { permitida, violaciones, advertencias };
  }

  private evaluarPolitica(
    politica: PoliticaRule,
    tx: Record<string, unknown>,
  ): boolean {
    const valor_actual = tx[politica.campo];

    // Si el campo no existe (ej. margen no calculado aún), asumir que pasa
    if (valor_actual === undefined) {
      return true;
    }

    switch (politica.condicion) {
      case "<=":
        return Number(valor_actual ?? 0) <= Number(politica.valor);
      case ">=":
        return Number(valor_actual ?? 0) >= Number(politica.valor);
      case "==": {
        // Handle boolean/truthy comparisons
        if (politica.valor === 1 && typeof valor_actual === "boolean") {
          return valor_actual === true;
        }
        return valor_actual === politica.valor;
      }
      case "!=":
        return valor_actual !== politica.valor;
      case "<":
        return Number(valor_actual ?? 0) < Number(politica.valor);
      case ">":
        return Number(valor_actual ?? 0) > Number(politica.valor);
      default:
        return true;
    }
  }

  registrarPolitica(
    id: string,
    archetype: string,
    campo: string,
    condicion: string,
    valor: number | string,
    bloqueante: boolean,
    descripcion: string,
  ) {
    if (!this.config.politicasPorArchetype[archetype]) {
      this.config.politicasPorArchetype[archetype] = [];
    }
    this.config.politicasPorArchetype[archetype].push({
      id,
      archetype,
      campo,
      condicion,
      valor,
      bloqueante,
      descripcion,
    });
    console.log(
      `ℹ️ Política registrada: ${id} (${bloqueante ? "BLOQUEANTE" : "advertencia"})`,
    );
  }

  obtenerConfiguracion() {
    return this.config;
  }
}
