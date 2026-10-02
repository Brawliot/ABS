/**
 * Motor de Validación de Transiciones (Capa 0.3)
 *
 * Valida que una transición de estado sea permitida según:
 * - Reglas de precondición (¿existen los datos necesarios?)
 * - Reglas de negocio (¿cumple con políticas?)
 * - Dependencias (¿están completos los documentos requeridos?)
 *
 * Se ejecuta ANTES de permitir que la transición ocurra.
 */

import type { Transacción } from "../core/transacción.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReglaDeValidación {
  /** ID único de la regla */
  readonly id: string;
  /** Descripción de qué valida */
  readonly descripción: string;
  /** Función que ejecuta la validación */
  readonly validar: (tx: Transacción) => { ok: boolean; error?: string };
  /** Si no pasa, ¿bloquea la transición o es solo warning? */
  readonly bloqueante: boolean;
}

export interface ResultadoValidación {
  readonly permitida: boolean;
  readonly errores: string[];
  readonly advertencias: string[];
}

export interface ConfiguracionValidacion {
  readonly reglasPorArchetype: {
    readonly [archetypeId: string]: {
      readonly [transitionId: string]: ReglaDeValidación[];
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR VALIDACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

export class MotorValidacionTransiciones {
  private config: ConfiguracionValidacion;

  constructor() {
    this.config = this.construirConfiguracion();
  }

  /**
   * Construye las reglas de validación para cada transición.
   */
  private construirConfiguracion(): ConfiguracionValidacion {
    return {
      reglasPorArchetype: {
        // ═══════════════════════════════════════════════════════════════════════
        // VENTA
        // ═══════════════════════════════════════════════════════════════════════
        venta: {
          // Propuesta → Aceptada
          t_aceptar: [
            {
              id: "venta-acepta-tiene-cliente",
              descripción: "La venta debe tener un cliente",
              validar: (tx) => ({
                ok: !!tx.datos.parteId,
                error: tx.datos.parteId ? undefined : "No hay cliente asignado",
              }),
              bloqueante: true,
            },
            {
              id: "venta-acepta-tiene-lineas",
              descripción: "La venta debe tener al menos una línea",
              validar: (tx) => {
                const lineas = (tx.datos as any).lineas || [];
                return {
                  ok: Array.isArray(lineas) && lineas.length > 0,
                  error: lineas.length === 0 ? "No hay líneas de venta" : undefined,
                };
              },
              bloqueante: true,
            },
            {
              id: "venta-acepta-total-positivo",
              descripción: "El total debe ser positivo",
              validar: (tx) => {
                const total = (tx.datos as any).total || 0;
                return {
                  ok: total > 0,
                  error: total <= 0 ? "Total debe ser mayor a cero" : undefined,
                };
              },
              bloqueante: true,
            },
            {
              id: "venta-acepta-cliente-activo",
              descripción: "El cliente debe estar activo (advertencia)",
              validar: () => ({
                ok: true,
                error: undefined, // Placeholder: verificaría que cliente está activo
              }),
              bloqueante: false,
            },
          ],

          // Aceptada → En Entrega
          "t_iniciar_entrega": [
            {
              id: "venta-entrega-tiene-factura",
              descripción: "La venta debe tener factura antes de entregar",
              validar: () => ({
                ok: true, // Placeholder: verificaría que existe factura
                error: undefined,
              }),
              bloqueante: true,
            },
          ],

          // En Entrega → Cerrada
          "t_cerrar": [
            {
              id: "venta-cierra-tiene-movimiento",
              descripción: "Debe existir movimiento de inventario",
              validar: () => ({
                ok: true, // Placeholder
                error: undefined,
              }),
              bloqueante: false,
            },
          ],
        },

        // ═══════════════════════════════════════════════════════════════════════
        // COMPRA
        // ═══════════════════════════════════════════════════════════════════════
        compra: {
          "t_emitir_oc": [
            {
              id: "compra-oc-tiene-proveedor",
              descripción: "Debe haber proveedor asignado",
              validar: (tx) => ({
                ok: !!(tx.datos as any).proveedor_id,
                error: !(tx.datos as any).proveedor_id ? "No hay proveedor" : undefined,
              }),
              bloqueante: true,
            },
            {
              id: "compra-oc-tiene-lineas",
              descripción: "Debe haber líneas de compra",
              validar: (tx) => {
                const lineas = (tx.datos as any).lineas || [];
                return {
                  ok: lineas.length > 0,
                  error: lineas.length === 0 ? "No hay líneas" : undefined,
                };
              },
              bloqueante: true,
            },
          ],

          "t_recibir": [
            {
              id: "compra-recibe-tiene-oc",
              descripción: "Debe existir OC emitida",
              validar: () => ({
                ok: true,
                error: undefined,
              }),
              bloqueante: true,
            },
          ],
        },

        // ═══════════════════════════════════════════════════════════════════════
        // SERVICIO
        // ═══════════════════════════════════════════════════════════════════════
        servicio: {
          "t_ejecutar": [
            {
              id: "servicio-ejecuta-tiene-cliente",
              descripción: "Debe haber cliente",
              validar: (tx) => ({
                ok: !!tx.datos.parteId,
                error: !tx.datos.parteId ? "No hay cliente" : undefined,
              }),
              bloqueante: true,
            },
          ],

          "t_completar": [
            {
              id: "servicio-completa-tiene-hitos",
              descripción: "Deben estar completados los hitos",
              validar: () => ({
                ok: true, // Placeholder
                error: undefined,
              }),
              bloqueante: true,
            },
          ],
        },
      },
    };
  }

  /**
   * Valida si una transición es permitida.
   * Se ejecuta antes de actualizar el estado.
   */
  validarTransicion(
    tx: Transacción,
    transitionId: string,
  ): ResultadoValidación {
    console.log(`[MotorValidación] Validando: ${tx.archetypeId}.${transitionId}`);

    const errores: string[] = [];
    const advertencias: string[] = [];

    // Obtener reglas aplicables
    const reglasArchetype = this.config.reglasPorArchetype[tx.archetypeId];
    if (!reglasArchetype) {
      console.log(`[MotorValidación] ✅ No hay reglas para ${tx.archetypeId}`);
      return { permitida: true, errores: [], advertencias: [] };
    }

    const reglas = reglasArchetype[transitionId] || [];
    if (reglas.length === 0) {
      console.log(`[MotorValidación] ✅ No hay reglas para ${transitionId}`);
      return { permitida: true, errores: [], advertencias: [] };
    }

    // Ejecutar cada regla
    for (const regla of reglas) {
      const resultado = regla.validar(tx);
      if (!resultado.ok) {
        const msg = `[${regla.id}] ${resultado.error || regla.descripción}`;
        if (regla.bloqueante) {
          console.error(`[MotorValidación] ❌ ${msg}`);
          errores.push(msg);
        } else {
          console.warn(`[MotorValidación] ⚠️ ${msg}`);
          advertencias.push(msg);
        }
      } else {
        console.log(`[MotorValidación] ✅ ${regla.descripción}`);
      }
    }

    const permitida = errores.length === 0;
    console.log(
      permitida
        ? `[MotorValidación] ✅ Transición PERMITIDA`
        : `[MotorValidación] ❌ Transición BLOQUEADA por ${errores.length} erro(es)`,
    );

    return { permitida, errores, advertencias };
  }

  /**
   * Registra una nueva regla de validación en tiempo de ejecución.
   */
  registrarRegla(
    archetypeId: string,
    transitionId: string,
    regla: ReglaDeValidación,
  ): void {
    if (!this.config.reglasPorArchetype[archetypeId]) {
      this.config.reglasPorArchetype[archetypeId] = {};
    }
    if (!this.config.reglasPorArchetype[archetypeId][transitionId]) {
      this.config.reglasPorArchetype[archetypeId][transitionId] = [];
    }
    this.config.reglasPorArchetype[archetypeId][transitionId].push(regla);
    console.log(`[MotorValidación] ✅ Regla registrada: ${archetypeId}.${transitionId}.${regla.id}`);
  }

  /**
   * Obtiene la configuración actual.
   */
  obtenerConfiguracion(): ConfiguracionValidacion {
    return this.config;
  }
}
