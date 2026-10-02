/**
 * Motor Orquestador de Transiciones (Capa 0.3)
 *
 * Coordina automáticamente qué documentos, procesos y acciones se disparan
 * cuando una transacción cambia de estado. Centralizador de reglas de negocio.
 *
 * Ejemplo: venta pasa a "aceptada"
 * → Automáticamente genera: factura, asientos contables, movimientos inventario, tareas
 */

import type { MotorGeneradorProcesos } from "./generador-procesos.js";
import type { TransaccionProyectada } from "./transaccion.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReglaDeGeneración {
  /** Qué tipos de documentos se generan automáticamente */
  readonly genera: string[];
  /** Qué datos son requeridos (cliente, líneas, etc.) */
  readonly requiere: string[];
  /** Si es obligatorio o opcional */
  readonly obligatorio: boolean;
}

export interface ReglasDePorArchetype {
  readonly [transitionId: string]: ReglaDeGeneración;
}

export interface ConfiguracionOrquestador {
  readonly reglasPorArchetype: {
    readonly [archetypeId: string]: ReglasDePorArchetype;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR ORQUESTADOR
// ═══════════════════════════════════════════════════════════════════════════════

export class MotorOrquestadorTransiciones {
  private config: {
    reglasPorArchetype: Record<string, Record<string, ReglaDeGeneración>>;
  };

  constructor(
    private motorGenerador: MotorGeneradorProcesos,
  ) {
    this.config = this.construirConfiguracion();
  }

  /**
   * Construye la configuración de reglas de generación por archetype y transición.
   * Define qué documentos se generan automáticamente en cada cambio de estado.
   */
  private construirConfiguracion(): ConfiguracionOrquestador {
    return {
      reglasPorArchetype: {
        // ═══════════════════════════════════════════════════════════════════════
        // VENTA: Ciclo de venta simple (propuesta → aceptada → en_entrega → cerrada)
        // ═══════════════════════════════════════════════════════════════════════
        venta: {
          // Propuesta → Aceptada: Generar factura, asientos, movimientos, tareas
          "t_aceptar": {
            genera: ["factura", "asientos_contables", "movimientos_inventario", "tareas"],
            requiere: ["cliente_id", "lineas", "total"],
            obligatorio: true,
          },
          // Aceptada → En Entrega: No genera documentos, solo registra evento
          "t_iniciar_entrega": {
            genera: [],
            requiere: ["factura"],
            obligatorio: false,
          },
          // En Entrega → Cerrada: Registra entrega, finaliza
          "t_cerrar": {
            genera: ["recibo_entrega"],
            requiere: ["movimiento_inventario"],
            obligatorio: false,
          },
        },

        // ═══════════════════════════════════════════════════════════════════════
        // COMPRA: Ciclo de compra (requisición → oc → recibida → factura)
        // ═══════════════════════════════════════════════════════════════════════
        compra: {
          // Requisición → OC Emitida: Generar OC
          "t_emitir_oc": {
            genera: ["orden_compra"],
            requiere: ["proveedor_id", "lineas"],
            obligatorio: true,
          },
          // OC Emitida → Recibida: Generar movimientos de inventario
          "t_recibir": {
            genera: ["movimientos_inventario"],
            requiere: ["orden_compra"],
            obligatorio: true,
          },
          // Recibida → Facturada: Generar asientos cuando llega factura de proveedor
          "t_facturar": {
            genera: ["asientos_contables"],
            requiere: ["factura_proveedor"],
            obligatorio: true,
          },
        },

        // ═══════════════════════════════════════════════════════════════════════
        // SERVICIO: Ciclo de servicio (orden → ejecución → factura)
        // ═══════════════════════════════════════════════════════════════════════
        servicio: {
          // Orden → Ejecutar: Generar tareas de ejecución
          "t_ejecutar": {
            genera: ["tareas"],
            requiere: ["cliente_id", "hitos"],
            obligatorio: true,
          },
          // Ejecutar → Completado: Generar factura
          "t_completar": {
            genera: ["factura", "asientos_contables"],
            requiere: ["cliente_id", "total"],
            obligatorio: true,
          },
        },
      },
    };
  }

  /**
   * Ejecuta automáticamente las generaciones definidas para una transición.
   * Se llama después de que la transición de estado ocurre.
   */
  async alTransicionar(
    tx: TransaccionProyectada,
    archetypeId: string,
    transitionId: string,
    nuevoEstado: string,
  ): Promise<{ ok: boolean; error?: string; generados?: string[] }> {
    try {
      console.log(`[MotorOrquestador] Transición detectada: ${archetypeId}.${transitionId} → ${nuevoEstado}`);

      // Obtener reglas aplicables
      const reglasArchetype = this.config.reglasPorArchetype[archetypeId];
      if (!reglasArchetype) {
        console.log(`[MotorOrquestador] ℹ️ No hay reglas de generación para archetype: ${archetypeId}`);
        return { ok: true, generados: [] };
      }

      const regla = reglasArchetype[transitionId];
      if (!regla) {
        console.log(`[MotorOrquestador] ℹ️ Transición sin generaciones automáticas: ${transitionId}`);
        return { ok: true, generados: [] };
      }

      // Validar precondiciones (datos requeridos)
      const validacion = this.validarPrecondiciones(tx, regla);
      if (!validacion.ok) {
        const msg = `Precondiciones no met: ${validacion.error}`;
        console.error(`[MotorOrquestador] ❌ ${msg}`);
        if (regla.obligatorio) {
          return { ok: false, error: msg };
        }
        // Si no es obligatorio, continuamos con warning
        console.warn(`[MotorOrquestador] ⚠️ Generación no obligatoria, continuando...`);
      }

      // Generar documentos automáticamente
      const generados: string[] = [];
      for (const tipoDocumento of regla.genera) {
        console.log(`[MotorOrquestador] 📄 Generando: ${tipoDocumento}`);

        try {
          const resultado = await this.generarDocumento(tx, tipoDocumento);
          if (resultado.ok) {
            generados.push(tipoDocumento);
            console.log(`[MotorOrquestador] ✅ ${tipoDocumento} generado: ${resultado.id}`);
          } else {
            console.error(`[MotorOrquestador] ❌ Fallo al generar ${tipoDocumento}: ${resultado.error}`);
            if (regla.obligatorio) {
              return { ok: false, error: `Fallo generando ${tipoDocumento}: ${resultado.error}` };
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[MotorOrquestador] 💥 Error al generar ${tipoDocumento}: ${msg}`);
          if (regla.obligatorio) {
            return { ok: false, error: msg };
          }
        }
      }

      console.log(`[MotorOrquestador] ✅ Transición completada. Generados: ${generados.join(", ") || "ninguno"}`);
      return { ok: true, generados };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MotorOrquestador] 💥 Error orquestando transición: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  /**
   * Valida que los datos requeridos existan antes de generar.
   */
  private validarPrecondiciones(
    tx: TransaccionProyectada,
    regla: ReglaDeGeneración,
  ): { ok: boolean; error?: string } {
    for (const requerido of regla.requiere) {
      const valor = (tx.datos as Record<string, any>)[requerido];
      if (valor === undefined || valor === null || (Array.isArray(valor) && valor.length === 0)) {
        return { ok: false, error: `Falta dato requerido: ${requerido}` };
      }
    }
    return { ok: true };
  }

  /**
   * Genera un documento específico según el tipo.
   * Delega al MotorGeneradorProcesos.
   */
  private async generarDocumento(
    tx: TransaccionProyectada,
    tipo: string,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    try {
      // Aquí iría la lógica para generar cada tipo de documento
      // Por ahora es un placeholder que será implementado en el siguiente paso

      // En futuro:
      // - generarDocumento("factura", tx) → llama motorGenerador.generarFactura(tx)
      // - generarDocumento("asientos_contables", tx) → llama motorGenerador.generarAsientos(tx)
      // - etc.

      console.log(`[MotorOrquestador] 🔧 Generador de ${tipo} será implementado`);
      return { ok: true, id: `doc-${tipo}-${Date.now()}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /**
   * Registra una nueva regla de generación en tiempo de ejecución.
   * Permite que módulos de negocio agreguen sus propias reglas.
   */
  registrarRegla(
    archetypeId: string,
    transitionId: string,
    regla: ReglaDeGeneración,
  ): void {
    if (!this.config.reglasPorArchetype[archetypeId]) {
      this.config.reglasPorArchetype[archetypeId] = {};
    }
    this.config.reglasPorArchetype[archetypeId][transitionId] = regla;
    console.log(`[MotorOrquestador] ✅ Regla registrada: ${archetypeId}.${transitionId}`);
  }

  /**
   * Obtiene la configuración actual (útil para debugging y testing).
   */
  obtenerConfiguracion(): ConfiguracionOrquestador {
    return this.config;
  }
}
