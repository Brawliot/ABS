/**
 * Motor de Políticas (Capa 0.5)
 *
 * Aplica reglas de negocio de forma centralizada.
 * Define políticas de "qué está permitido y bajo qué condiciones".
 *
 * Ejemplo: Cuando se crea una venta:
 * - Cliente puede estar activo
 * - No puede exceder límite de crédito
 * - Descuentos solo si volumen mínimo
 * - No puede vender a clientes en lista negra
 */

import type { TransaccionProyectada } from "./transaccion.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

export type TipoPolitica =
  | "limite_credito"      // Máximo a financiar
  | "descuento_volumen"   // Descuento automático por cantidad
  | "restriccion_cliente" // Bloquear cliente específico
  | "restriccion_producto"// Bloquear producto
  | "margen_minimo"       // Margen mínimo requerido
  | "validacion_precio"   // Precio debe estar en rango
  | "regla_negocio";      // Regla personalizada

export interface RespuestaValidacion {
  ok: boolean;
  advertencias: string[];
  errores: string[];
  datos?: Record<string, any>;
}

export interface ReglaDePolitica {
  readonly id: string;
  readonly tipo: TipoPolitica;
  readonly descripción: string;
  readonly validar: (tx: TransaccionProyectada) => RespuestaValidacion;
  readonly bloqueante: boolean; // Si true, rechaza transición
}

export interface ConfiguracionPoliticas {
  readonly reglasPorArchetype: {
    readonly [archetypeId: string]: {
      readonly [policyId: string]: ReglaDePolitica;
    };
  };
}

export interface ResultadoPolitica {
  ok: boolean;
  permitido: boolean;
  errores: string[];
  advertencias: string[];
  aplicadas: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR POLÍTICAS
// ═══════════════════════════════════════════════════════════════════════════════

export class MotorPolicias {
  private config: {
    reglasPorArchetype: Record<string, Record<string, ReglaDePolitica>>;
  };

  constructor() {
    this.config = this.construirConfiguracion();
  }

  /**
   * Construye la configuración de políticas por archetype.
   */
  private construirConfiguracion(): ConfiguracionPoliticas {
    return {
      reglasPorArchetype: {
        // ═══════════════════════════════════════════════════════════════════════
        // VENTA
        // ═══════════════════════════════════════════════════════════════════════
        venta: {
          // Cliente debe estar activo
          "cliente_activo": {
            id: "venta-cliente-activo",
            tipo: "restriccion_cliente",
            descripción: "Cliente debe estar activo",
            validar: (tx: TransaccionProyectada) => {
              const clienteActivo = (tx.datos as any).cliente_activo !== false;
              return {
                ok: clienteActivo,
                advertencias: [],
                errores: clienteActivo ? [] : ["Cliente no está activo"],
              };
            },
            bloqueante: true,
          },

          // No puede exceder límite de crédito
          "limite_credito": {
            id: "venta-limite-credito",
            tipo: "limite_credito",
            descripción: "No puede exceder límite de crédito del cliente",
            validar: (tx: TransaccionProyectada) => {
              const total = (tx.datos as any).total || 0;
              const creditoDisponible = (tx.datos as any).cliente_credito_disponible || 0;

              const permitido = total <= creditoDisponible;
              return {
                ok: permitido,
                advertencias: !permitido ? [`Crédito disponible: €${(creditoDisponible / 100).toFixed(2)}`] : [],
                errores: !permitido ? ["Excede límite de crédito"] : [],
              };
            },
            bloqueante: true,
          },

          // Margen mínimo del 20%
          "margen_minimo": {
            id: "venta-margen-minimo",
            tipo: "margen_minimo",
            descripción: "Margen mínimo debe ser 20%",
            validar: (tx: TransaccionProyectada) => {
              const total = (tx.datos as any).total || 0;
              const costo = (tx.datos as any).costo_total || 0;
              const margen = costo > 0 ? ((total - costo) / total) * 100 : 100;

              const permitido = margen >= 20;
              return {
                ok: true,
                advertencias: permitido ? [] : [`Margen: ${margen.toFixed(1)}%`],
                errores: [],
              };
            },
            bloqueante: false,
          },

          // No vender a clientes en lista negra
          "lista_negra": {
            id: "venta-lista-negra",
            tipo: "restriccion_cliente",
            descripción: "Cliente no debe estar en lista negra",
            validar: (tx: TransaccionProyectada) => {
              const enListaNegra = (tx.datos as any).cliente_lista_negra === true;
              return {
                ok: !enListaNegra,
                advertencias: [],
                errores: enListaNegra ? ["Cliente está en lista negra"] : [],
              };
            },
            bloqueante: true,
          },
        },

        // ═══════════════════════════════════════════════════════════════════════
        // COMPRA
        // ═══════════════════════════════════════════════════════════════════════
        compra: {
          // Proveedor debe estar activo
          "proveedor_activo": {
            id: "compra-proveedor-activo",
            tipo: "restriccion_cliente",
            descripción: "Proveedor debe estar activo",
            validar: (tx: TransaccionProyectada) => {
              const proveedorActivo = (tx.datos as any).proveedor_activo !== false;
              return {
                ok: proveedorActivo,
                advertencias: [],
                errores: proveedorActivo ? [] : ["Proveedor no está activo"],
              };
            },
            bloqueante: true,
          },

          // Precio dentro de rango permitido
          "validacion_precio": {
            id: "compra-precio-valido",
            tipo: "validacion_precio",
            descripción: "Precio debe estar dentro del rango histórico",
            validar: (tx: TransaccionProyectada) => {
              const precioActual = (tx.datos as any).precio_unitario || 0;
              const precioPromedio = (tx.datos as any).precio_promedio_historico || precioActual;
              const variacion = Math.abs((precioActual - precioPromedio) / precioPromedio) * 100;

              const permitido = variacion <= 15;
              return {
                ok: true,
                advertencias: variacion > 5 ? [`Precio varía ${variacion.toFixed(1)}% del promedio`] : [],
                errores: permitido ? [] : [],
              };
            },
            bloqueante: false,
          },

          // Margen mínimo 10%
          "margen_proveedor": {
            id: "compra-margen-minimo",
            tipo: "margen_minimo",
            descripción: "Margen mínimo de compra debe ser 10%",
            validar: (tx: TransaccionProyectada) => {
              const costoCompra = (tx.datos as any).total || 0;
              const precioVenta = (tx.datos as any).precio_venta_estimado || 0;
              const margen = precioVenta > 0 ? ((precioVenta - costoCompra) / precioVenta) * 100 : 100;

              const permitido = margen >= 10;
              return {
                ok: true,
                advertencias: permitido ? [] : [`Margen: ${margen.toFixed(1)}%`],
                errores: [],
              };
            },
            bloqueante: false,
          },
        },

        // ═══════════════════════════════════════════════════════════════════════
        // SERVICIO
        // ═══════════════════════════════════════════════════════════════════════
        servicio: {
          // Cliente debe estar activo
          "cliente_servicio_activo": {
            id: "servicio-cliente-activo",
            tipo: "restriccion_cliente",
            descripción: "Cliente debe estar activo para contratar servicios",
            validar: (tx: TransaccionProyectada) => {
              const clienteActivo = (tx.datos as any).cliente_activo !== false;
              return {
                ok: clienteActivo,
                advertencias: [],
                errores: clienteActivo ? [] : ["Cliente no está activo"],
              };
            },
            bloqueante: true,
          },

          // Mínimo de hitos requeridos
          "minimo_hitos": {
            id: "servicio-minimo-hitos",
            tipo: "regla_negocio",
            descripción: "Se requiere mínimo 1 hito para servicios",
            validar: (tx: TransaccionProyectada) => {
              const hitos = (tx.datos as any).hitos?.length || 0;
              const permitido = hitos >= 1;
              return {
                ok: permitido,
                advertencias: [],
                errores: permitido ? [] : ["Servicio requiere al menos 1 hito"],
              };
            },
            bloqueante: true,
          },

          // Precio mínimo del servicio
          "precio_minimo_servicio": {
            id: "servicio-precio-minimo",
            tipo: "validacion_precio",
            descripción: "Precio mínimo de servicio es €50",
            validar: (tx: TransaccionProyectada) => {
              const tarifa = (tx.datos as any).tarifa_servicio || 0;
              const precioMinimo = 5000; // €50
              const permitido = tarifa >= precioMinimo;
              return {
                ok: permitido,
                advertencias: [],
                errores: permitido ? [] : ["Precio mínimo de servicio es €50"],
              };
            },
            bloqueante: false,
          },
        },
      },
    };
  }

  /**
   * Aplica todas las políticas para una transacción.
   */
  async aplicar(
    tx: TransaccionProyectada,
    archetypeId: string,
  ): Promise<ResultadoPolitica> {
    try {
      console.log(`[MotorPolicias] 📋 Aplicando políticas para: ${archetypeId}`);

      const errores: string[] = [];
      const advertencias: string[] = [];
      const aplicadas: string[] = [];

      // Obtener políticas para este archetype
      const politicasArchetype = this.config.reglasPorArchetype[archetypeId];
      if (!politicasArchetype) {
        console.log(`[MotorPolicias] ℹ️ No hay políticas para ${archetypeId}`);
        return { ok: true, permitido: true, errores, advertencias, aplicadas };
      }

      // Aplicar cada política
      for (const [policyId, regla] of Object.entries(politicasArchetype)) {
        try {
          console.log(`[MotorPolicias] 🔍 Validando: ${policyId}`);

          const resultado = regla.validar(tx);
          aplicadas.push(policyId);

          if (!resultado.ok) {
            console.error(`[MotorPolicias] ❌ Política falló: ${policyId}`);

            if (resultado.errores.length > 0) {
              errores.push(...resultado.errores);
              if (regla.bloqueante) {
                console.error(`[MotorPolicias] 🛑 BLOQUEANTE: ${policyId}`);
                return { ok: false, permitido: false, errores, advertencias, aplicadas };
              }
            }
          }

          if (resultado.advertencias.length > 0) {
            advertencias.push(...resultado.advertencias);
            console.warn(`[MotorPolicias] ⚠️ ${policyId}: ${resultado.advertencias.join(", ")}`);
          }

        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[MotorPolicias] 💥 Error validando ${policyId}: ${msg}`);
          errores.push(`Error en política ${policyId}: ${msg}`);
          if ((regla as any).bloqueante) {
            return { ok: false, permitido: false, errores, advertencias, aplicadas };
          }
        }
      }

      const permitido = errores.length === 0;
      console.log(`[MotorPolicias] ✅ Políticas completadas. Permitido: ${permitido}`);
      return { ok: true, permitido, errores, advertencias, aplicadas };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MotorPolicias] 💥 Error aplicando políticas: ${msg}`);
      return { ok: false, permitido: false, errores: [msg], advertencias: [], aplicadas: [] };
    }
  }

  /**
   * Registra una nueva política en tiempo de ejecución.
   */
  registrarRegla(
    archetypeId: string,
    policyId: string,
    regla: ReglaDePolitica,
  ): void {
    if (!this.config.reglasPorArchetype[archetypeId]) {
      this.config.reglasPorArchetype[archetypeId] = {};
    }
    this.config.reglasPorArchetype[archetypeId][policyId] = regla;
    console.log(`[MotorPolicias] ✅ Política registrada: ${archetypeId}.${policyId}`);
  }

  /**
   * Obtiene la configuración actual.
   */
  obtenerConfiguracion(): ConfiguracionPoliticas {
    return this.config;
  }
}
