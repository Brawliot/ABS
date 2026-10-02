/**
 * Motor de Cálculos (Capa 0.4)
 *
 * Calcula automáticamente valores derivados de transacciones.
 * Define reglas de "qué valores calcular y cómo".
 */

import type { TransaccionProyectada } from "./transaccion.js";

export type TipoCalculo =
  | "subtotal"
  | "impuesto"
  | "descuento"
  | "total"
  | "margen"
  | "comisión"
  | "gastos_envío";

export type TipoRedondeo = "piso" | "techo" | "normal";

export interface ReglaDeCalculo {
  readonly id: string;
  readonly tipo: TipoCalculo;
  readonly descripción: string;
  readonly calcular: (tx: TransaccionProyectada, contexto?: Record<string, number>) => number;
  readonly validar?: (valor: number) => { ok: boolean; error?: string };
  readonly redondeo?: TipoRedondeo;
  readonly obligatorio: boolean;
}

export interface ConfiguracionCalculos {
  readonly reglasPorArchetype: {
    readonly [archetypeId: string]: {
      readonly [calculoId: string]: ReglaDeCalculo;
    };
  };
}

export interface ResultadoCalculo {
  ok: boolean;
  calculados: Record<string, number>;
  error?: string;
}

export class MotorCalculos {
  private config: {
    reglasPorArchetype: Record<string, Record<string, ReglaDeCalculo>>;
  };

  constructor() {
    this.config = this.construirConfiguracion();
  }

  private construirConfiguracion(): ConfiguracionCalculos {
    return {
      reglasPorArchetype: {
        venta: {
          "subtotal": {
            id: "venta-subtotal",
            tipo: "subtotal",
            descripción: "Suma de líneas de venta",
            calcular: (tx) => {
              const lineas = (tx.datos as any).lineas || [];
              return Math.round(lineas.reduce((sum: number, l: any) => {
                const cantidad = (l.cantidadMilesimas || 0) / 1000;
                return sum + (cantidad * (l.precioCentimos || 0));
              }, 0));
            },
            redondeo: "normal",
            obligatorio: true,
          },

          "impuesto_venta": {
            id: "venta-impuesto",
            tipo: "impuesto",
            descripción: "IVA aplicable a la venta",
            calcular: (tx, ctx) => {
              const subtotal = ctx?.subtotal || 0;
              const lineas = (tx.datos as any).lineas || [];
              const tasaIVA = lineas[0]?.ivaPct || 21;
              return Math.round(subtotal * (tasaIVA / 100));
            },
            redondeo: "normal",
            obligatorio: true,
          },

          "descuento_cliente": {
            id: "venta-descuento",
            tipo: "descuento",
            descripción: "Descuento por tipo de cliente",
            calcular: (tx, ctx) => {
              const subtotal = ctx?.subtotal || 0;
              const tipoCliente = (tx.datos as any).cliente_tipo || "regular";

              if (tipoCliente === "vip") {
                return Math.round(subtotal * 0.10);
              }
              if (tipoCliente === "premium") {
                return Math.round(subtotal * 0.05);
              }
              return 0;
            },
            redondeo: "normal",
            obligatorio: false,
          },

          "total_venta": {
            id: "venta-total",
            tipo: "total",
            descripción: "Total a pagar",
            calcular: (tx, ctx) => {
              const subtotal = ctx?.subtotal || 0;
              const impuesto = ctx?.impuesto_venta || 0;
              const descuento = ctx?.descuento_cliente || 0;
              return subtotal + impuesto - descuento;
            },
            validar: (valor) => ({
              ok: valor > 0,
              error: "Total debe ser mayor a 0"
            }),
            redondeo: "normal",
            obligatorio: true,
          },
        },

        compra: {
          "subtotal_compra": {
            id: "compra-subtotal",
            tipo: "subtotal",
            descripción: "Suma de líneas de compra",
            calcular: (tx) => {
              const lineas = (tx.datos as any).lineas || [];
              return Math.round(lineas.reduce((sum: number, l: any) => {
                const cantidad = (l.cantidadMilesimas || 0) / 1000;
                return sum + (cantidad * (l.precioCentimos || 0));
              }, 0));
            },
            obligatorio: true,
          },

          "impuesto_compra": {
            id: "compra-impuesto",
            tipo: "impuesto",
            descripción: "IVA deducible en compra",
            calcular: (tx, ctx) => {
              const subtotal = ctx?.subtotal_compra || 0;
              const tasaIVA = (tx.datos as any).lineas?.[0]?.ivaPct || 21;
              return Math.round(subtotal * (tasaIVA / 100));
            },
            obligatorio: true,
          },

          "gastos_importacion": {
            id: "compra-gastos",
            tipo: "gastos_envío",
            descripción: "Gastos de importación si es necesario",
            calcular: (tx) => {
              const paisProv = (tx.datos as any).proveedor_pais || "ES";
              return paisProv === "ES" ? 0 : 2500;
            },
            obligatorio: false,
          },

          "total_compra": {
            id: "compra-total",
            tipo: "total",
            descripción: "Total a pagar por compra",
            calcular: (tx, ctx) => {
              const subtotal = ctx?.subtotal_compra || 0;
              const impuesto = ctx?.impuesto_compra || 0;
              const gastos = ctx?.gastos_importacion || 0;
              return subtotal + impuesto + gastos;
            },
            validar: (valor) => ({
              ok: valor > 0,
              error: "Total compra debe ser mayor a 0"
            }),
            obligatorio: true,
          },
        },

        servicio: {
          "tarifa_base": {
            id: "servicio-tarifa",
            tipo: "subtotal",
            descripción: "Tarifa base del servicio",
            calcular: (tx) => (tx.datos as any).tarifa_servicio || 10000,
            obligatorio: true,
          },

          "impuesto_servicio": {
            id: "servicio-impuesto",
            tipo: "impuesto",
            descripción: "IVA en servicios",
            calcular: (tx, ctx) => {
              const tarifa = ctx?.tarifa_base || 0;
              return Math.round(tarifa * 0.21);
            },
            obligatorio: true,
          },

          "descuento_volumen": {
            id: "servicio-descuento",
            tipo: "descuento",
            descripción: "Descuento por volumen de hitos",
            calcular: (tx, ctx) => {
              const tarifa = ctx?.tarifa_base || 0;
              const hitos = (tx.datos as any).hitos?.length || 1;

              if (hitos >= 5) {
                return Math.round(tarifa * 0.15);
              }
              if (hitos >= 3) {
                return Math.round(tarifa * 0.10);
              }
              return 0;
            },
            obligatorio: false,
          },

          "total_servicio": {
            id: "servicio-total",
            tipo: "total",
            descripción: "Total del servicio",
            calcular: (tx, ctx) => {
              const tarifa = ctx?.tarifa_base || 0;
              const impuesto = ctx?.impuesto_servicio || 0;
              const descuento = ctx?.descuento_volumen || 0;
              return tarifa + impuesto - descuento;
            },
            validar: (valor) => ({
              ok: valor > 0,
              error: "Total servicio debe ser mayor a 0"
            }),
            obligatorio: true,
          },
        },
      },
    };
  }

  async alCrear(
    tx: TransaccionProyectada,
    archetypeId: string,
  ): Promise<ResultadoCalculo> {
    try {
      console.log(`[MotorCalculos] 🧮 Calculando valores para: ${archetypeId}`);

      const calculados: Record<string, number> = {};

      const reglasArchetype = this.config.reglasPorArchetype[archetypeId];
      if (!reglasArchetype) {
        console.log(`[MotorCalculos] ℹ️ No hay reglas de cálculo para ${archetypeId}`);
        return { ok: true, calculados };
      }

      for (const [calculoId, regla] of Object.entries(reglasArchetype)) {
        try {
          console.log(`[MotorCalculos] 🔢 Calculando: ${calculoId}`);

          const valor = regla.calcular(tx, calculados);
          console.log(`[MotorCalculos]   → Resultado: €${(valor / 100).toFixed(2)}`);

          if (regla.validar) {
            const validacion = regla.validar(valor);
            if (!validacion.ok) {
              const msg = `Validación fallida: ${validacion.error}`;
              console.error(`[MotorCalculos] ❌ ${msg}`);
              if (regla.obligatorio) {
                return { ok: false, calculados, error: msg };
              }
              console.warn(`[MotorCalculos] ⚠️ No obligatorio, continuando...`);
              continue;
            }
          }

          const valorFinal = this.aplicarRedondeo(valor, regla.redondeo || "normal");
          calculados[calculoId] = valorFinal;

        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[MotorCalculos] 💥 Error calculando ${calculoId}: ${msg}`);
          if (regla.obligatorio) {
            return { ok: false, calculados, error: msg };
          }
        }
      }

      console.log(`[MotorCalculos] ✅ Cálculos completados:`, calculados);
      return { ok: true, calculados };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MotorCalculos] 💥 Error en cálculos: ${msg}`);
      return { ok: false, calculados: {}, error: msg };
    }
  }

  private aplicarRedondeo(valor: number, tipo: TipoRedondeo): number {
    switch (tipo) {
      case "piso":
        return Math.floor(valor);
      case "techo":
        return Math.ceil(valor);
      case "normal":
      default:
        return Math.round(valor);
    }
  }

  registrarRegla(
    archetypeId: string,
    calculoId: string,
    regla: ReglaDeCalculo,
  ): void {
    if (!this.config.reglasPorArchetype[archetypeId]) {
      this.config.reglasPorArchetype[archetypeId] = {};
    }
    this.config.reglasPorArchetype[archetypeId][calculoId] = regla;
    console.log(`[MotorCalculos] ✅ Regla registrada: ${archetypeId}.${calculoId}`);
  }

  obtenerConfiguracion(): ConfiguracionCalculos {
    return this.config;
  }
}
