/**
 * MotorValidacionTransiciones (Capa 0.3)
 * Valida precondiciones ANTES de cualquier transición.
 * Reglas bloqueantes y advertencias por archetype.
 */

interface ValidationRule {
  readonly archetype: string;
  readonly transitionId: string;
  readonly condicion: string;
  readonly tipo: "bloqueante" | "advertencia";
  readonly mensaje: string;
}

type ConfigType = {
  readonly reglasPorArchetype: Record<string, Record<string, ValidationRule[]>>;
};

export interface ValidationResult {
  readonly permitida: boolean;
  readonly errores: string[];
  readonly advertencias: string[];
}

export class MotorValidacionTransiciones {
  private config: ConfigType;

  constructor() {
    this.config = this.construirConfiguracion();
  }

  private construirConfiguracion(): ConfigType {
    return {
      reglasPorArchetype: {
        venta: {
          t_aceptar: [
            {
              archetype: "venta",
              transitionId: "t_aceptar",
              condicion: "cliente_id != null",
              tipo: "bloqueante" as const,
              mensaje: "Venta sin cliente asignado",
            },
            {
              archetype: "venta",
              transitionId: "t_aceptar",
              condicion: "total > 0",
              tipo: "bloqueante" as const,
              mensaje: "Venta con total nulo o negativo",
            },
          ],
          t_facturar: [
            {
              archetype: "venta",
              transitionId: "t_facturar",
              condicion: "estado == 'aceptada'",
              tipo: "bloqueante" as const,
              mensaje: "Solo se facturan ventas aceptadas",
            },
          ],
        },
        compra: {
          t_aceptar: [
            {
              archetype: "compra",
              transitionId: "t_aceptar",
              condicion: "proveedor_id != null",
              tipo: "bloqueante" as const,
              mensaje: "Compra sin proveedor asignado",
            },
          ],
        },
        servicio: {
          t_iniciar: [
            {
              archetype: "servicio",
              transitionId: "t_iniciar",
              condicion: "cliente_id != null",
              tipo: "bloqueante" as const,
              mensaje: "Servicio sin cliente",
            },
          ],
        },
      },
    };
  }

  validarTransicion(
    tx: Record<string, unknown>,
    transitionId: string,
  ): ValidationResult {
    const archetype = (tx.arquetipo_id as string) ?? "desconocido";
    const errores: string[] = [];
    const advertencias: string[] = [];

    console.log(
      `[MotorValidacionTransiciones] Validando ${archetype}.${transitionId}`,
    );

    const reglasTransicion = this.config.reglasPorArchetype[archetype]?.[
      transitionId
    ] ?? [];

    for (const regla of reglasTransicion) {
      // Evaluación simple de condiciones (expandible)
      const cumple = this.evaluarCondicion(regla.condicion, tx);

      if (!cumple) {
        const msg = `❌ ${regla.mensaje}`;
        if (regla.tipo === "bloqueante") {
          errores.push(msg);
        } else {
          advertencias.push(msg);
        }
      }
    }

    const permitida = errores.length === 0;
    console.log(
      permitida
        ? `✅ Validación exitosa`
        : `❌ Validación rechazada: ${errores.join("; ")}`,
    );

    return {
      permitida,
      errores,
      advertencias,
    };
  }

  private evaluarCondicion(
    condicion: string,
    tx: Record<string, unknown>,
  ): boolean {
    // Evaluación declarativa simple
    // Formato: "campo != null", "campo > 0", "campo == 'valor'"
    const trimmed = condicion.trim();

    if (trimmed.includes("!=")) {
      const parts = trimmed.split("!=").map((s) => s.trim());
      const campo = parts[0]!;
      const valor = parts[1]!;
      const campoVal = tx[campo];
      if (valor === "null") {
        return campoVal !== null && campoVal !== undefined;
      }
      return campoVal !== valor;
    }

    if (trimmed.includes("==")) {
      const parts = trimmed.split("==").map((s) => s.trim());
      const campo = parts[0]!;
      const valor = parts[1]!;
      const campoVal = tx[campo];
      const compara = valor.replace(/['"]/g, "");
      return campoVal === compara;
    }

    if (trimmed.includes(">")) {
      const parts = trimmed.split(">").map((s) => s.trim());
      const campo = parts[0]!;
      const valor = parts[1]!;
      const campoVal = Number(tx[campo] ?? 0);
      const compara = Number(valor);
      return campoVal > compara;
    }

    // Fallback: asumir verdadero
    return true;
  }

  registrarRegla(archetype: string, transitionId: string, regla: ValidationRule) {
    if (!this.config.reglasPorArchetype[archetype]) {
      this.config.reglasPorArchetype[archetype] = {};
    }
    if (!this.config.reglasPorArchetype[archetype][transitionId]) {
      this.config.reglasPorArchetype[archetype][transitionId] = [];
    }
    this.config.reglasPorArchetype[archetype][transitionId].push(regla);
    console.log(
      `ℹ️ Regla registrada: ${archetype}.${transitionId} → ${regla.mensaje}`,
    );
  }

  obtenerConfiguracion() {
    return this.config;
  }
}
