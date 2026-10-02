import { randomUUID } from "crypto";
import type { Conector } from "./integraciones-connectors.js";

export type TipoTrigger =
  | "manual"
  | "horario"
  | "evento"
  | "cambio_datos"
  | "webhook";

export type TipoPaso =
  | "sincronizar"
  | "transformar"
  | "validar"
  | "notificar"
  | "esperar";

export interface FlujoIntegración {
  readonly id: string;
  readonly nombre: string;
  readonly pasos: PasoFlujo[];
  readonly trigger: TipoTrigger;
  readonly activo: boolean;
  readonly frecuencia?: string; // Ej: "0 * * * *" (cron)
  readonly fecha_creación: Date;
  readonly última_ejecución?: Date;
}

export interface PasoFlujo {
  readonly orden: number;
  readonly tipo: TipoPaso;
  readonly conector_id?: string;
  readonly configuración: Record<string, unknown>;
  readonly condición_siguiente?: (resultado: unknown) => boolean;
}

export interface RegistroEjecuciónFlujo {
  readonly fecha: Date;
  readonly éxito: boolean;
  readonly registros_procesados: number;
  readonly tiempo_ms: number;
  readonly detalles_errores?: string[];
}

export interface ErrorFrecuente {
  readonly error: string;
  readonly ocurrencias: number;
  readonly última_vez: Date;
}

export class MotorFlujos {
  private flujos: Map<string, FlujoIntegración> = new Map();
  private historialEjecución: RegistroEjecuciónFlujo[] = [];
  private erroresFrecuentes: Map<string, ErrorFrecuente> = new Map();

  crearFlujo(
    nombre: string,
    trigger: TipoTrigger,
    pasos: PasoFlujo[],
    frecuencia?: string
  ): FlujoIntegración {
    const id = randomUUID();
    const flujo: FlujoIntegración = {
      id,
      nombre,
      pasos: pasos.map((p, idx) => ({ ...p, orden: idx })),
      trigger,
      activo: true,
      frecuencia,
      fecha_creación: new Date(),
    };

    this.flujos.set(id, flujo);
    return flujo;
  }

  async ejecutarFlujo(
    flujo_id: string,
    datos_iniciales: Record<string, unknown> = {}
  ): Promise<{
    éxito: boolean;
    resultados_pasos: unknown[];
    errores?: string[];
  }> {
    const flujo = this.flujos.get(flujo_id);
    if (!flujo) {
      return {
        éxito: false,
        resultados_pasos: [],
        errores: ["Flujo no encontrado"],
      };
    }

    const inicio = Date.now();
    const resultados_pasos: unknown[] = [];
    const errores: string[] = [];
    let registros_procesados = 0;
    let datos = { ...datos_iniciales }; // Mantener datos mutables entre pasos

    try {
      for (const paso of flujo.pasos) {
        try {
          let resultado: unknown;

          switch (paso.tipo) {
            case "sincronizar":
              resultado = {
                tipo: "sincronización",
                registros: Math.floor(Math.random() * 100),
              };
              registros_procesados += (resultado as Record<string, unknown>)
                .registros as number;
              break;

            case "transformar":
              resultado = this.aplicarTransformación(
                datos,
                paso.configuración
              );
              datos = (resultado as Record<string, unknown>) ?? datos;
              break;

            case "validar":
              resultado = this.validarDatos(datos, paso.configuración);
              if (!resultado) {
                throw new Error("Validación fallida");
              }
              break;

            case "notificar":
              resultado = {
                notificación_enviada: true,
                destinatarios: (paso.configuración.destinatarios as string[])
                  ?.length ?? 0,
              };
              break;

            case "esperar":
              const ms = (paso.configuración.milisegundos as number) ?? 1000;
              await new Promise((resolve) => setTimeout(resolve, ms));
              resultado = { tipo: "espera", ms };
              break;
          }

          resultados_pasos.push(resultado);

          // Aplicar condición para siguiente paso si existe
          if (
            paso.condición_siguiente &&
            !paso.condición_siguiente(resultado)
          ) {
            break; // Detener flujo si la condición falla
          }
        } catch (e) {
          const errorMsg =
            e instanceof Error ? e.message : "Error desconocido en paso";
          errores.push(errorMsg);
          this.registrarErrorFrecuente(errorMsg);

          if (paso.configuración.detener_en_error === true) {
            break;
          }
        }
      }

      const duracion_ms = Date.now() - inicio;
      const registro: RegistroEjecuciónFlujo = {
        fecha: new Date(),
        éxito: errores.length === 0,
        registros_procesados,
        tiempo_ms: duracion_ms,
        detalles_errores: errores.length > 0 ? errores : undefined,
      };

      this.historialEjecución.push(registro);

      // Actualizar última ejecución del flujo
      const flujoActualizado: FlujoIntegración = {
        ...flujo,
        última_ejecución: new Date(),
      };
      this.flujos.set(flujo_id, flujoActualizado);

      return {
        éxito: errores.length === 0,
        resultados_pasos,
        errores: errores.length > 0 ? errores : undefined,
      };
    } catch (e) {
      const errorMsg =
        e instanceof Error ? e.message : "Error desconocido";
      return {
        éxito: false,
        resultados_pasos,
        errores: [errorMsg],
      };
    }
  }

  programarEjecución(flujo_id: string, frecuencia: string): void {
    const flujo = this.flujos.get(flujo_id);
    if (flujo) {
      const flujoActualizado: FlujoIntegración = {
        ...flujo,
        frecuencia,
        trigger: "horario",
      };
      this.flujos.set(flujo_id, flujoActualizado);
    }
  }

  obtenerHistorialFlujo(flujo_id: string, límite: number = 10): {
    fecha: Date;
    éxito: boolean;
    registros_procesados: number;
    tiempo_ms: number;
  }[] {
    return this.historialEjecución
      .filter((_, idx) => idx >= this.historialEjecución.length - límite)
      .map((r) => ({
        fecha: r.fecha,
        éxito: r.éxito,
        registros_procesados: r.registros_procesados,
        tiempo_ms: r.tiempo_ms,
      }));
  }

  obtenerErroresFrecuentes(flujo_id: string): ErrorFrecuente[] {
    return Array.from(this.erroresFrecuentes.values()).sort(
      (a, b) => b.ocurrencias - a.ocurrencias
    );
  }

  obtenerFlujo(id: string): FlujoIntegración | undefined {
    return this.flujos.get(id);
  }

  listarFlujos(activos?: boolean): FlujoIntegración[] {
    const flujos = Array.from(this.flujos.values());
    return activos !== undefined
      ? flujos.filter((f) => f.activo === activos)
      : flujos;
  }

  private aplicarTransformación(
    datos: Record<string, unknown>,
    configuración: Record<string, unknown>
  ): unknown {
    // Simular transformación de datos
    const resultado = { ...datos };
    if (configuración.mapa_campos) {
      const mapa = configuración.mapa_campos as Record<string, string>;
      for (const [origen, destino] of Object.entries(mapa)) {
        if (origen in resultado) {
          (resultado as Record<string, unknown>)[destino] =
            resultado[origen];
          delete resultado[origen];
        }
      }
    }
    return resultado;
  }

  private validarDatos(
    datos: Record<string, unknown>,
    configuración: Record<string, unknown>
  ): boolean {
    const campos_requeridos =
      (configuración.campos_requeridos as string[]) ?? [];
    for (const campo of campos_requeridos) {
      if (!(campo in datos) || datos[campo] === null) {
        return false;
      }
    }
    return true;
  }

  private registrarErrorFrecuente(error: string): void {
    if (!this.erroresFrecuentes.has(error)) {
      this.erroresFrecuentes.set(error, {
        error,
        ocurrencias: 0,
        última_vez: new Date(),
      });
    }

    const errorFreq = this.erroresFrecuentes.get(error)!;
    this.erroresFrecuentes.set(error, {
      error,
      ocurrencias: errorFreq.ocurrencias + 1,
      última_vez: new Date(),
    });
  }
}
