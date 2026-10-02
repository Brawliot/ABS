/**
 * Motor de Auditoría (Capa 0.6)
 *
 * Rastreo inmutable de TODOS los cambios en transacciones.
 * Propósito: compliance, debugging, análisis histórico.
 *
 * Ejemplo: Cuando se ejecuta una acción:
 * - Registra qué cambió (antes/después)
 * - Quién lo hizo y cuándo
 * - Qué motores intervinieron
 * - Resultado final (bloqueante, advertencia, etc.)
 */

import type { TransaccionProyectada } from "./transaccion.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

export type TipoEvento =
  | "CREACION"         // Transacción creada
  | "CAMBIO_ESTADO"    // Estado cambió
  | "VALIDACION"       // Validación ejecutada
  | "POLITICA"         // Política ejecutada
  | "CALCULO"          // Cálculo ejecutado
  | "ORQUESTACION"     // Orquestación ejecutada
  | "NOTIFICACION"     // Notificación enviada
  | "ERROR"            // Error ocurrió
  | "RECHAZO"          // Transacción rechazada
  | "APROBACION";      // Transacción aprobada

export interface RegistroAuditoria {
  readonly id: string;                    // ID único del evento
  readonly transaccionId: string;         // Cuál transacción
  readonly timestamp: string;             // RFC3339
  readonly tipo: TipoEvento;              // Qué pasó
  readonly usuario: string;               // Quién lo hizo
  readonly motor?: string | undefined;                // Qué motor intervino
  readonly estadoAntes?: string | undefined;          // Estado anterior
  readonly estadoDespues?: string | undefined;        // Estado nuevo
  readonly datosAnteriores?: Record<string, any> | undefined; // Datos antes
  readonly datosNuevos?: Record<string, any> | undefined;    // Datos después
  readonly cambios?: { campo: string; antes: any; despues: any }[] | undefined;
  readonly resultado?: { exitoso: boolean; errores?: string[] | undefined; advertencias?: string[] | undefined } | undefined;
  readonly contexto?: Record<string, any> | undefined;
}

export interface ConfiguracionAuditoria {
  readonly maxRegistrosPorTransaccion?: number;
  readonly almacenamientoEnabled: boolean;
  readonly compresionDatos?: boolean;
}

export interface ResultadoAuditoria {
  ok: boolean;
  registroId: string;
  registroCreado: RegistroAuditoria;
  errores: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR AUDITORÍA
// ═══════════════════════════════════════════════════════════════════════════════

export class MotorAuditoria {
  private config: ConfiguracionAuditoria;
  private registros: Map<string, RegistroAuditoria[]> = new Map();
  private contador: number = 0;

  constructor(config: Partial<ConfiguracionAuditoria> = {}) {
    this.config = {
      maxRegistrosPorTransaccion: 1000,
      almacenamientoEnabled: true,
      compresionDatos: false,
      ...config,
    };
  }

  /**
   * Registra un evento de auditoría.
   */
  async registrar(evento: Omit<RegistroAuditoria, 'id'>): Promise<ResultadoAuditoria> {
    try {
      this.contador++;
      const registroId = `audit-${Date.now()}-${this.contador}`;

      const registro: RegistroAuditoria = {
        ...evento,
        id: registroId,
      };

      // Guardar en memoria
      if (!this.registros.has(evento.transaccionId)) {
        this.registros.set(evento.transaccionId, []);
      }

      const lista = this.registros.get(evento.transaccionId)!;

      // Respetar límite
      if (
        this.config.maxRegistrosPorTransaccion &&
        lista.length >= this.config.maxRegistrosPorTransaccion
      ) {
        lista.shift(); // Eliminar más viejo
        console.warn(
          `[MotorAuditoria] ⚠️ Límite de registros alcanzado para ${evento.transaccionId}`,
        );
      }

      lista.push(registro);

      console.log(
        `[MotorAuditoria] 📝 Evento registrado: ${registro.tipo} (${registroId})`,
      );

      return { ok: true, registroId, registroCreado: registro, errores: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MotorAuditoria] 💥 Error registrando evento: ${msg}`);
      return {
        ok: false,
        registroId: "",
        registroCreado: {} as RegistroAuditoria,
        errores: [msg],
      };
    }
  }

  /**
   * Registra un cambio de estado.
   */
  async registrarTransicion(
    transaccionId: string,
    usuario: string,
    estadoAntes: string,
    estadoDespues: string,
    contexto?: Record<string, any>,
  ): Promise<ResultadoAuditoria> {
    return this.registrar({
      transaccionId,
      timestamp: new Date().toISOString(),
      tipo: "CAMBIO_ESTADO",
      usuario,
      estadoAntes,
      estadoDespues,
      ...(contexto ? { contexto } : {}),
    });
  }

  /**
   * Registra un cambio de datos.
   */
  async registrarCambio(
    transaccionId: string,
    usuario: string,
    datosAnteriores: Record<string, any>,
    datosNuevos: Record<string, any>,
    motor: string,
  ): Promise<ResultadoAuditoria> {
    const cambios = this.detectarCambios(datosAnteriores, datosNuevos);

    return this.registrar({
      transaccionId,
      timestamp: new Date().toISOString(),
      tipo: "CALCULO",
      usuario,
      motor,
      datosAnteriores,
      datosNuevos,
      cambios,
      resultado: {
        exitoso: cambios.length > 0,
      },
    });
  }

  /**
   * Registra error o validación fallida.
   */
  async registrarError(
    transaccionId: string,
    usuario: string,
    motor: string,
    errores: string[],
  ): Promise<ResultadoAuditoria> {
    return this.registrar({
      transaccionId,
      timestamp: new Date().toISOString(),
      tipo: "ERROR",
      usuario,
      motor,
      resultado: {
        exitoso: false,
        errores,
      },
    });
  }

  /**
   * Registra validación exitosa.
   */
  async registrarValidacion(
    transaccionId: string,
    usuario: string,
    motor: string,
    advertencias?: string[],
  ): Promise<ResultadoAuditoria> {
    return this.registrar({
      transaccionId,
      timestamp: new Date().toISOString(),
      tipo: "VALIDACION",
      usuario,
      motor,
      resultado: {
        exitoso: true,
        ...(advertencias && advertencias.length > 0 ? { advertencias } : {}),
      },
    });
  }

  /**
   * Obtiene historial completo de una transacción.
   */
  obtenerHistorial(transaccionId: string): RegistroAuditoria[] {
    return this.registros.get(transaccionId) || [];
  }

  /**
   * Obtiene últimos N eventos de una transacción.
   */
  obtenerUltimosEventos(transaccionId: string, limite: number = 10): RegistroAuditoria[] {
    const historial = this.obtenerHistorial(transaccionId);
    return historial.slice(Math.max(0, historial.length - limite));
  }

  /**
   * Obtiene eventos por tipo.
   */
  obtenerEventosPorTipo(
    transaccionId: string,
    tipo: TipoEvento,
  ): RegistroAuditoria[] {
    return this.obtenerHistorial(transaccionId).filter((r) => r.tipo === tipo);
  }

  /**
   * Obtiene eventos de un rango de tiempo.
   */
  obtenerEventosEnRango(
    transaccionId: string,
    desde: Date,
    hasta: Date,
  ): RegistroAuditoria[] {
    const historial = this.obtenerHistorial(transaccionId);
    const desdeStr = desde.toISOString();
    const hastaStr = hasta.toISOString();

    return historial.filter((r) => r.timestamp >= desdeStr && r.timestamp <= hastaStr);
  }

  /**
   * Genera reporte de auditoría.
   */
  generarReporte(transaccionId: string): {
    transaccionId: string;
    totalEventos: number;
    eventosPorTipo: Record<string, number>;
    usuarios: string[];
    motoresInvolucrados: string[];
    primeraActividad: string | undefined;
    ultimaActividad: string | undefined;
    cambiosFinales: Record<string, any>;
  } {
    const historial = this.obtenerHistorial(transaccionId);

    const eventosPorTipo: Record<string, number> = {};
    const usuarios = new Set<string>();
    const motores = new Set<string>();

    for (const r of historial) {
      eventosPorTipo[r.tipo] = (eventosPorTipo[r.tipo] || 0) + 1;
      usuarios.add(r.usuario);
      if (r.motor) motores.add(r.motor);
    }

    // Cambios finales: último registro con datosNuevos
    let ultimoConDatos: RegistroAuditoria | undefined;
    for (let i = historial.length - 1; i >= 0; i--) {
      if (historial[i]!.datosNuevos) {
        ultimoConDatos = historial[i];
        break;
      }
    }
    const cambiosFinales = ultimoConDatos?.datosNuevos || {};

    return {
      transaccionId,
      totalEventos: historial.length,
      eventosPorTipo,
      usuarios: Array.from(usuarios),
      motoresInvolucrados: Array.from(motores),
      primeraActividad: historial[0]?.timestamp,
      ultimaActividad: historial[historial.length - 1]?.timestamp,
      cambiosFinales,
    };
  }

  /**
   * Limpia registros antiguos (para mantenimiento).
   */
  limpiarRegistrosAntiguos(diasAtras: number = 30): number {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - diasAtras);
    const umbral = fecha.toISOString();

    let eliminados = 0;
    for (const [txId, registros] of this.registros.entries()) {
      const nuevosRegistros = registros.filter((r) => r.timestamp > umbral);
      eliminados += registros.length - nuevosRegistros.length;
      if (nuevosRegistros.length === 0) {
        this.registros.delete(txId);
      } else {
        this.registros.set(txId, nuevosRegistros);
      }
    }

    console.log(`[MotorAuditoria] 🧹 Eliminados ${eliminados} registros antiguos`);
    return eliminados;
  }

  /**
   * Detecta cambios entre dos objetos.
   */
  private detectarCambios(
    antes: Record<string, any>,
    despues: Record<string, any>,
  ): Array<{ campo: string; antes: any; despues: any }> {
    const cambios: Array<{ campo: string; antes: any; despues: any }> = [];

    // Campos en después que no estaban antes o cambiaron
    for (const [campo, valor] of Object.entries(despues)) {
      if (JSON.stringify(antes[campo]) !== JSON.stringify(valor)) {
        cambios.push({
          campo,
          antes: antes[campo],
          despues: valor,
        });
      }
    }

    // Campos que estaban antes pero ya no
    for (const campo of Object.keys(antes)) {
      if (!(campo in despues)) {
        cambios.push({
          campo,
          antes: antes[campo],
          despues: undefined,
        });
      }
    }

    return cambios;
  }

  /**
   * Obtiene configuración actual.
   */
  obtenerConfiguracion(): ConfiguracionAuditoria {
    return this.config;
  }

  /**
   * Actualiza configuración.
   */
  actualizarConfiguracion(config: Partial<ConfiguracionAuditoria>): void {
    this.config = { ...this.config, ...config };
    console.log(`[MotorAuditoria] ⚙️ Configuración actualizada`);
  }
}
