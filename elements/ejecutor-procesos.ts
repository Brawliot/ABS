/**
 * MotorEjecutorProcesos: Ejecución Automática en Tiempo Real (SEGUNDO CORE)
 *
 * Responsabilidades:
 * - Ejecutar paso a paso procesos generados por MotorGeneradorProcesos
 * - Reintentos con backoff exponencial (1s, 2s, 4s, 8s)
 * - Transacciones: commit/rollback automático
 * - Webhooks en cada paso (configurable)
 * - Pausa/Reanudación de ejecuciones
 * - Timeout por paso y global
 * - Auditoría append-only (NUNCA UPDATE/DELETE)
 *
 * Arquitectura append-only:
 * - Cada paso ejecutado se registra como inmutable
 * - Cada webhook disparado se registra como inmutable
 * - Cada evento se registra como inmutable
 * - No se modifica nunca el historial
 */

import { randomUUID } from "node:crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS BASE
// ═══════════════════════════════════════════════════════════════════════════════

export type EstadoEjecución =
  | "pendiente"
  | "en_progreso"
  | "pausado"
  | "completado"
  | "fallido"
  | "revertido";

export type ResultadoPaso =
  | "éxito"
  | "error_recuperable"
  | "error_crítico"
  | "requiere_intervención";

export type PrioridadEjecución =
  | "baja"
  | "normal"
  | "alta"
  | "crítica";

export type ModoEjecución =
  | "síncrono"
  | "asíncrono";

// ═══════════════════════════════════════════════════════════════════════════════
// PASO A EJECUTAR
// ═══════════════════════════════════════════════════════════════════════════════

export interface PasoEjecución {
  readonly id: string;
  readonly orden: number;
  readonly tipo: string; // "crear_factura", "actualizar_inventario", "generar_asiento", etc.
  readonly configuración: Record<string, any>;
  readonly condición?: string; // opcional: evaluado antes de ejecutar
  readonly transaccional: boolean;
  readonly reintentos_máximos: number;
  readonly timeout_ms: number;
  readonly descripción?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULTADO DE EJECUCIÓN DE UN PASO (APPEND-ONLY)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ResultadoEjecuciónPaso {
  readonly id: string; // Generado automáticamente
  readonly paso_id: string;
  readonly ejecución_id: string;
  readonly timestamp: Date;
  readonly estado: ResultadoPaso;
  readonly datos_entrada: Record<string, any>;
  readonly datos_salida?: Record<string, any>;
  readonly error?: string;
  readonly stack_trace?: string;
  readonly intentos_usados: number;
  readonly tiempo_ms: number;
  readonly webhook_disparado?: boolean;
  readonly secuencia: number; // Para mantener orden
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTO DISPARADO (APPEND-ONLY)
// ═══════════════════════════════════════════════════════════════════════════════

export interface EventoDisparo {
  readonly id: string;
  readonly ejecución_id: string;
  readonly tipo: string;
  readonly timestamp: Date;
  readonly datos: Record<string, any>;
  readonly enviado_a: string[];
  readonly secuencia: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULTADO DE WEBHOOK (APPEND-ONLY)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ResultadoWebhook {
  readonly id: string;
  readonly ejecución_id: string;
  readonly url: string;
  readonly método: string;
  readonly payload?: Record<string, any>;
  readonly status_code?: number;
  readonly respuesta?: string;
  readonly error?: string;
  readonly timestamp: Date;
  readonly reintentos: number;
  readonly éxito: boolean;
  readonly tiempo_ms: number;
  readonly secuencia: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EJECUCIÓN DE PROCESO
// ═══════════════════════════════════════════════════════════════════════════════

export interface EjecuciónProceso {
  readonly id: string;
  readonly proceso_id: string;
  readonly estado: EstadoEjecución;
  readonly fecha_inicio: Date;
  readonly fecha_fin?: Date;
  readonly pasos_ejecutados: ResultadoEjecuciónPaso[]; // Append-only
  readonly pasos_pendientes: PasoEjecución[];
  readonly errores_acumulados: string[];
  readonly eventos_disparados: EventoDisparo[]; // Append-only
  readonly webhooks_enviados: ResultadoWebhook[]; // Append-only
  readonly transacción_id?: string;
  readonly usuario_ejecutor: string;
  readonly número_secuencia: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE EJECUCIÓN
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConfiguraciónEjecución {
  readonly modo: ModoEjecución;
  readonly reintentos_globales: number;
  readonly timeout_global_ms: number;
  readonly transaccional: boolean;
  readonly permitir_pausas_manuales: boolean;
  readonly webhooks_en_cada_paso: boolean;
  readonly webhooks_globales: string[];
  readonly prioridad: PrioridadEjecución;
  readonly usuario_ejecutor?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXTO DE EJECUCIÓN
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContextoEjecución {
  readonly ejecución: EjecuciónProceso;
  readonly paso_actual?: PasoEjecución;
  readonly variables: Record<string, any>; // Variables que se pasan entre pasos
  readonly resultado_anterior?: ResultadoEjecuciónPaso;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORIAL DE EJECUCIÓN
// ═══════════════════════════════════════════════════════════════════════════════

export interface HistorialEjecución {
  readonly ejecución_id: string;
  readonly proceso_id: string;
  readonly fecha_inicio: Date;
  readonly fecha_fin?: Date;
  readonly total_pasos: number;
  readonly pasos_exitosos: number;
  readonly pasos_fallidos: number;
  readonly tiempo_total_ms: number;
  readonly estado_final: EstadoEjecución;
  readonly errores: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERFAZ DEL MOTOR EJECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

export interface IMotorEjecutorProcesos {
  /**
   * Ejecutar un proceso generado paso a paso
   */
  ejecutar(
    proceso: any, // ProcesoGenerado
    configuración?: Partial<ConfiguraciónEjecución>
  ): Promise<EjecuciónProceso>;

  /**
   * Pausar una ejecución en progreso
   */
  pausar(ejecución_id: string): Promise<void>;

  /**
   * Reanudar una ejecución pausada
   */
  reanudar(ejecución_id: string): Promise<void>;

  /**
   * Revertar una ejecución (rollback de transacciones)
   */
  revertar(ejecución_id: string): Promise<void>;

  /**
   * Obtener estado de ejecución
   */
  obtenerEstado(ejecución_id: string): EjecuciónProceso | undefined;

  /**
   * Obtener historial de ejecuciones de un proceso
   */
  obtenerHistorial(proceso_id: string): HistorialEjecución[];

  /**
   * Cancelar ejecución
   */
  cancelar(ejecución_id: string): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY PARA CREAR INSTANCIAS
// ═══════════════════════════════════════════════════════════════════════════════

export function crearConfiguraciónEjecuciónPorDefecto(): ConfiguraciónEjecución {
  return {
    modo: "síncrono",
    reintentos_globales: 3,
    timeout_global_ms: 300000, // 5 minutos
    transaccional: true,
    permitir_pausas_manuales: false,
    webhooks_en_cada_paso: true,
    webhooks_globales: [],
    prioridad: "normal",
  };
}

export function crearPasoEjecución(
  tipo: string,
  configuración: Record<string, any>,
  orden: number = 0
): PasoEjecución {
  return {
    id: randomUUID(),
    orden,
    tipo,
    configuración,
    transaccional: false,
    reintentos_máximos: 3,
    timeout_ms: 30000, // 30 segundos por paso
  };
}

export function crearEjecuciónProceso(
  proceso_id: string,
  usuario_ejecutor: string = "sistema"
): EjecuciónProceso {
  return {
    id: randomUUID(),
    proceso_id,
    estado: "pendiente",
    fecha_inicio: new Date(),
    pasos_ejecutados: [],
    pasos_pendientes: [],
    errores_acumulados: [],
    eventos_disparados: [],
    webhooks_enviados: [],
    usuario_ejecutor,
    número_secuencia: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULTADO DE EJECUCIÓN COMPLETO
// ═══════════════════════════════════════════════════════════════════════════════

export interface ResultadoEjecuciónCompleto {
  readonly éxito: boolean;
  readonly ejecución: EjecuciónProceso;
  readonly historial: HistorialEjecución;
  readonly errores: string[];
  readonly tiempo_total_ms: number;
  readonly pasos_ejecutados: number;
  readonly pasos_fallidos: number;
}
