/**
 * MotorSecuencias (Capa 0.3)
 * Garantiza orden correcto de eventos.
 * Impide estados imposibles.
 */

interface SecuenciaRule {
  readonly id: string;
  readonly archetype: string;
  readonly estado_actual: string;
  readonly transitionId: string;
  readonly permitido: boolean;
  readonly razon: string;
}

export interface ValidacionSecuenciaResult {
  readonly permitida: boolean;
  readonly razon?: string;
}

export class MotorSecuencias {
  private config: {
    readonly reglasPorArchetype: Record<string, SecuenciaRule[]>;
  };

  constructor() {
    this.config = this.construirConfiguracion();
  }

  private construirConfiguracion() {
    return {
      reglasPorArchetype: {
        venta: [
          {
            id: "seq_venta_1",
            archetype: "venta",
            estado_actual: "pagada",
            transitionId: "t_facturar",
            permitido: false,
            razon: "No puedes facturar una venta ya pagada",
          },
          {
            id: "seq_venta_2",
            archetype: "venta",
            estado_actual: "propuesta",
            transitionId: "t_facturar",
            permitido: false,
            razon: "Debes aceptar la venta antes de facturar",
          },
          {
            id: "seq_venta_3",
            archetype: "venta",
            estado_actual: "cancelada",
            transitionId: "t_aceptar",
            permitido: false,
            razon: "No puedes aceptar una venta cancelada",
          },
        ],
        compra: [
          {
            id: "seq_compra_1",
            archetype: "compra",
            estado_actual: "recibida",
            transitionId: "t_aceptar",
            permitido: false,
            razon: "No puedes aceptar una compra ya recibida",
          },
          {
            id: "seq_compra_2",
            archetype: "compra",
            estado_actual: "propuesta",
            transitionId: "t_recibir",
            permitido: false,
            razon: "Debes aceptar la compra antes de recibir",
          },
        ],
        servicio: [
          {
            id: "seq_servicio_1",
            archetype: "servicio",
            estado_actual: "completado",
            transitionId: "t_iniciar",
            permitido: false,
            razon: "No puedes reiniciar un servicio completado",
          },
          {
            id: "seq_servicio_2",
            archetype: "servicio",
            estado_actual: "propuesta",
            transitionId: "t_completar",
            permitido: false,
            razon: "Debes iniciar el servicio antes de completarlo",
          },
          {
            id: "seq_servicio_3",
            archetype: "servicio",
            estado_actual: "entregado",
            transitionId: "t_entregar",
            permitido: false,
            razon: "El servicio ya fue entregado",
          },
        ],
      },
    };
  }

  validarSecuencia(
    tx: Record<string, unknown>,
    transitionId: string,
    estado_actual: string,
  ): ValidacionSecuenciaResult {
    const archetype = (tx.arquetipo_id as string) ?? "desconocido";
    const reglas = this.config.reglasPorArchetype[archetype] ?? [];

    console.log(
      `[MotorSecuencias] Validando secuencia: ${archetype} en ${estado_actual} → ${transitionId}`,
    );

    for (const regla of reglas) {
      if (
        regla.estado_actual === estado_actual &&
        regla.transitionId === transitionId
      ) {
        if (!regla.permitido) {
          console.log(`❌ Secuencia inválida: ${regla.razon}`);
          return {
            permitida: false,
            razon: regla.razon,
          };
        }
      }
    }

    console.log(`✅ Secuencia válida`);
    return { permitida: true };
  }

  registrarRegla(
    id: string,
    archetype: string,
    estado_actual: string,
    transitionId: string,
    permitido: boolean,
    razon: string,
  ) {
    if (!this.config.reglasPorArchetype[archetype]) {
      this.config.reglasPorArchetype[archetype] = [];
    }
    this.config.reglasPorArchetype[archetype].push({
      id,
      archetype,
      estado_actual,
      transitionId,
      permitido,
      razon,
    });
    console.log(
      `ℹ️ Regla de secuencia registrada: ${id} (${permitido ? "permitida" : "bloqueada"})`,
    );
  }

  obtenerConfiguracion() {
    return this.config;
  }
}
