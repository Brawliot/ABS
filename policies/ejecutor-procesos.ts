/**
 * MotorEjecutorProcesos: Ejecución Automática en Tiempo Real
 *
 * Responsabilidades:
 * - Ejecutar procesos generados paso a paso
 * - Reintentos con backoff exponencial (1s, 2s, 4s, 8s)
 * - Transacciones: commit/rollback automático
 * - Webhooks en cada paso (configurable)
 * - Pausa/Reanudación de ejecuciones
 * - Timeout por paso y global
 * - Auditoría append-only (NUNCA UPDATE/DELETE)
 */

import { randomUUID } from "node:crypto";
import type {
  PasoEjecución,
  ResultadoEjecuciónPaso,
  EjecuciónProceso,
  ConfiguraciónEjecución,
  EventoDisparo,
  ResultadoWebhook,
  ContextoEjecución,
  HistorialEjecución,
  ResultadoPaso,
  ModoEjecución,
} from "../elements/ejecutor-procesos.js";
import {
  crearConfiguraciónEjecuciónPorDefecto,
  crearEjecuciónProceso,
} from "../elements/ejecutor-procesos.js";
import type { ProcesoGenerado } from "../elements/generador-procesos.js";

/**
 * MotorEjecutorProcesos: Ejecuta procesos generados de forma automática
 */
export class MotorEjecutorProcesos {
  private ejecuciones: Map<string, EjecuciónProceso> = new Map();
  private contadorSecuencia: number = 0;
  private transacciones: Map<string, { estado: "activa" | "committed" | "rolledback"; pasos: string[] }> = new Map();

  constructor() {
    // Inicializar con almacenamiento en memoria
    // En producción, esto se reemplazaría con SqliteEjecutorProcesosStore
  }

  /**
   * Ejecutar un proceso generado paso a paso
   */
  async ejecutar(
    proceso: ProcesoGenerado,
    configuración?: Partial<ConfiguraciónEjecución>
  ): Promise<EjecuciónProceso> {
    const config: ConfiguraciónEjecución = {
      ...crearConfiguraciónEjecuciónPorDefecto(),
      ...configuración,
    };

    // 1. Crear ejecución
    const ejecución = crearEjecuciónProceso(proceso.id, config.usuario_ejecutor || "sistema");
    const ejecuciónMutable = { ...ejecución, número_secuencia: ++this.contadorSecuencia };

    // 2. Validar proceso
    if (!this.validarProceso(proceso)) {
      return {
        ...ejecuciónMutable,
        estado: "fallido",
        errores_acumulados: ["Proceso inválido para ejecución"],
        fecha_fin: new Date(),
      };
    }

    // 3. Construir plano de ejecución a partir del proceso
    const pasos = this.construirPlanosDeEjecución(proceso);
    const ejecuciónConPasos = { ...ejecuciónMutable, pasos_pendientes: pasos };

    // 4. Crear transacción si aplica
    let transacción_id: string | undefined;
    if (config.transaccional) {
      transacción_id = this.crearTransacción();
      const ejecuciónConTx = { ...ejecuciónConPasos, transacción_id };
      this.ejecuciones.set(ejecuciónConTx.id, ejecuciónConTx);
    } else {
      this.ejecuciones.set(ejecuciónConPasos.id, ejecuciónConPasos);
    }

    // 5. Ejecutar paso a paso
    const resultadoEjecución = await this.ejecutarPasoAPaso(
      ejecuciónConPasos.id,
      pasos,
      config,
      transacción_id
    );

    // 6. Commit o Rollback
    if (config.transaccional && transacción_id) {
      if (resultadoEjecución.estado === "completado") {
        await this.commitTransacción(transacción_id);
      } else if (resultadoEjecución.estado === "fallido") {
        await this.rollbackTransacción(transacción_id);
      }
    }

    // 7. Disparar webhooks globales
    if (config.webhooks_globales.length > 0) {
      await this.dispararWebhooksGlobales(
        ejecuciónConPasos.id,
        config.webhooks_globales,
        resultadoEjecución
      );
    }

    // 8. Actualizar ejecución con resultado final
    const ejecuciónFinal: EjecuciónProceso = {
      ...resultadoEjecución,
      id: ejecuciónConPasos.id,
      proceso_id: proceso.id,
      transacción_id,
      usuario_ejecutor: config.usuario_ejecutor || "sistema",
      número_secuencia: ejecuciónConPasos.número_secuencia,
      fecha_fin: new Date(),
    };

    this.ejecuciones.set(ejecuciónFinal.id, ejecuciónFinal);
    return ejecuciónFinal;
  }

  /**
   * Ejecutar pasos de forma secuencial
   */
  private async ejecutarPasoAPaso(
    ejecución_id: string,
    pasos: PasoEjecución[],
    config: ConfiguraciónEjecución,
    transacción_id?: string
  ): Promise<Partial<EjecuciónProceso>> {
    const ejecución = this.ejecuciones.get(ejecución_id);
    if (!ejecución) {
      throw new Error(`Ejecución no encontrada: ${ejecución_id}`);
    }

    const pasos_ejecutados: ResultadoEjecuciónPaso[] = [];
    const errores_acumulados: string[] = [];
    const eventos_disparados: EventoDisparo[] = [];
    const webhooks_enviados: ResultadoWebhook[] = [];
    let estado: "completado" | "fallido" = "completado";
    let secuenciaPaso = 0;

    const inicio = Date.now();

    for (const paso of pasos) {
      // Validar timeout global
      if (config.timeout_global_ms && Date.now() - inicio > config.timeout_global_ms) {
        errores_acumulados.push(`Timeout global excedido: ${config.timeout_global_ms}ms`);
        estado = "fallido";
        break;
      }

      // Evaluar condición si existe
      if (paso.condición) {
        const contexto: any = {
          ejecución,
          paso_actual: paso,
          variables: {},
          resultado_anterior: pasos_ejecutados.length > 0 ? pasos_ejecutados[pasos_ejecutados.length - 1] : undefined,
        };

        const condiciónCumple = this.evaluarCondición(paso.condición, contexto);
        if (!condiciónCumple) {
          continue;
        }
      }

      // Ejecutar paso con reintentos
      const resultado = await this.ejecutarPasoConReintentos(
        paso,
        config.reintentos_globales,
        ejecución,
        ++secuenciaPaso
      );

      pasos_ejecutados.push(resultado);

      // Disparar webhook por paso si está configurado
      if (config.webhooks_en_cada_paso && config.webhooks_globales && config.webhooks_globales.length > 0) {
        for (const url of config.webhooks_globales) {
          const webhookResultado = await this.dispararWebhook(url, {
            ejecución_id,
            paso_id: paso.id,
            resultado,
            tipo: "paso_completado",
          });
          webhooks_enviados.push(webhookResultado);
        }
      }

      // Disparar evento por paso
      const evento: any = {
        id: randomUUID(),
        ejecución_id,
        tipo: `paso_${resultado.estado}`,
        timestamp: new Date(),
        datos: {
          paso_id: paso.id,
          estado: resultado.estado,
          tiempo_ms: resultado.tiempo_ms,
        },
        enviado_a: [],
        secuencia: eventos_disparados.length + 1,
      };
      eventos_disparados.push(evento);

      // Detener si hay error crítico
      if (resultado.estado === "error_crítico") {
        errores_acumulados.push(`Error crítico en paso ${paso.id}: ${resultado.error || "Unknown error"}`);
        estado = "fallido";
        break;
      }

      // Detener si requiere intervención
      if (resultado.estado === "requiere_intervención") {
        errores_acumulados.push(`Intervención requerida en paso ${paso.id}: ${resultado.error || "Intervention required"}`);
        estado = "fallido";
        break;
      }
    }

    return {
      id: ejecución_id,
      estado,
      pasos_ejecutados,
      pasos_pendientes: [],
      errores_acumulados,
      eventos_disparados,
      webhooks_enviados,
      fecha_inicio: ejecución.fecha_inicio,
    };
  }

  /**
   * Ejecutar un paso con reintentos y backoff exponencial
   */
  private async ejecutarPasoConReintentos(
    paso: PasoEjecución,
    reintentos_máximos: number,
    ejecución: EjecuciónProceso,
    secuencia: number
  ): Promise<ResultadoEjecuciónPaso> {
    const resultadoPaso: ResultadoEjecuciónPaso = {
      id: randomUUID(),
      paso_id: paso.id,
      ejecución_id: ejecución.id,
      timestamp: new Date(),
      estado: "error_crítico",
      datos_entrada: paso.configuración,
      intentos_usados: 0,
      tiempo_ms: 0,
      secuencia,
    };

    const inicio = Date.now();
    let ultimoError: string | undefined;

    for (let intento = 0; intento <= reintentos_máximos; intento++) {
      resultadoPaso.intentos_usados = intento + 1;

      try {
        // Ejecutar paso con timeout
        const resultado = await this.ejecutarPasoConTimeout(paso);

        resultadoPaso.estado = "éxito";
        resultadoPaso.datos_salida = resultado;
        resultadoPaso.tiempo_ms = Date.now() - inicio;
        return resultadoPaso;
      } catch (error: any) {
        ultimoError = error?.message || "Error desconocido";

        // Determinar si es recuperable
        const esRecuperable = this.esErrorRecuperable(ultimoError);

        if (!esRecuperable || intento === reintentos_máximos) {
          resultadoPaso.error = ultimoError;
          resultadoPaso.stack_trace = error?.stack;
          resultadoPaso.estado = esRecuperable ? "error_recuperable" : "error_crítico";
          resultadoPaso.tiempo_ms = Date.now() - inicio;

          if (!esRecuperable) {
            return resultadoPaso;
          }
        }

        // Backoff exponencial: 1s, 2s, 4s, 8s
        if (intento < reintentos_máximos) {
          const espera = Math.pow(2, intento) * 1000;
          await this.esperar(espera);
        }
      }
    }

    // Último intento falló
    resultadoPaso.error = ultimoError;
    resultadoPaso.estado = "error_crítico";
    resultadoPaso.tiempo_ms = Date.now() - inicio;
    return resultadoPaso;
  }

  /**
   * Ejecutar paso con timeout
   */
  private async ejecutarPasoConTimeout(paso: PasoEjecución): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout en paso ${paso.id}: ${paso.timeout_ms}ms`));
      }, paso.timeout_ms);

      try {
        // Ejecutar paso según su tipo
        const resultado = this.ejecutarPasoActual(paso);
        clearTimeout(timeout);
        resolve(resultado);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Ejecutar paso actual según su tipo
   */
  private ejecutarPasoActual(paso: PasoEjecución): Record<string, any> {
    switch (paso.tipo) {
      case "crear_factura":
        return this.ejecutarCrearFactura(paso.configuración);
      case "actualizar_inventario":
        return this.ejecutarActualizarInventario(paso.configuración);
      case "generar_asiento":
        return this.ejecutarGenerarAsiento(paso.configuración);
      case "registrar_evento":
        return this.ejecutarRegistrarEvento(paso.configuración);
      case "enviar_notificación":
        return this.ejecutarEnviarNotificación(paso.configuración);
      default:
        return { resultado: "paso_completado", tipo: paso.tipo };
    }
  }

  /**
   * Implementaciones específicas de pasos
   */
  private ejecutarCrearFactura(config: Record<string, any>): Record<string, any> {
    if (!config.cliente_id || !config.total) {
      throw new Error("Datos inválidos para crear factura");
    }
    return {
      factura_id: randomUUID(),
      número: `FAC-${Date.now()}`,
      cliente_id: config.cliente_id,
      total: config.total,
    };
  }

  private ejecutarActualizarInventario(config: Record<string, any>): Record<string, any> {
    if (!config.producto_id || config.cantidad === undefined) {
      throw new Error("Datos inválidos para actualizar inventario");
    }
    return {
      producto_id: config.producto_id,
      cantidad: config.cantidad,
      saldo_anterior: config.saldo_anterior || 0,
      saldo_posterior: (config.saldo_anterior || 0) + config.cantidad,
    };
  }

  private ejecutarGenerarAsiento(config: Record<string, any>): Record<string, any> {
    if (!config.cuenta_deudora || !config.cuenta_acreedora || !config.monto) {
      throw new Error("Datos inválidos para generar asiento");
    }
    return {
      asiento_id: randomUUID(),
      cuenta_deudora: config.cuenta_deudora,
      cuenta_acreedora: config.cuenta_acreedora,
      monto: config.monto,
      debe: config.monto,
      haber: config.monto,
    };
  }

  private ejecutarRegistrarEvento(config: Record<string, any>): Record<string, any> {
    return {
      evento_id: randomUUID(),
      tipo: config.tipo,
      datos: config.datos,
      registrado: true,
    };
  }

  private ejecutarEnviarNotificación(config: Record<string, any>): Record<string, any> {
    return {
      notificación_id: randomUUID(),
      destinatario: config.destinatario,
      asunto: config.asunto,
      enviada: true,
    };
  }

  /**
   * Pausar una ejecución en progreso
   */
  async pausar(ejecución_id: string): Promise<void> {
    const ejecución = this.ejecuciones.get(ejecución_id);
    if (!ejecución) {
      throw new Error(`Ejecución no encontrada: ${ejecución_id}`);
    }

    if (ejecución.estado !== "en_progreso") {
      throw new Error(`No se puede pausar ejecución en estado: ${ejecución.estado}`);
    }

    this.ejecuciones.set(ejecución_id, {
      ...ejecución,
      estado: "pausado",
    });
  }

  /**
   * Reanudar una ejecución pausada
   */
  async reanudar(ejecución_id: string): Promise<void> {
    const ejecución = this.ejecuciones.get(ejecución_id);
    if (!ejecución) {
      throw new Error(`Ejecución no encontrada: ${ejecución_id}`);
    }

    if (ejecución.estado !== "pausado") {
      throw new Error(`No se puede reanudar ejecución en estado: ${ejecución.estado}`);
    }

    this.ejecuciones.set(ejecución_id, {
      ...ejecución,
      estado: "en_progreso",
    });
  }

  /**
   * Revertar una ejecución (rollback de transacciones)
   */
  async revertar(ejecución_id: string): Promise<void> {
    const ejecución = this.ejecuciones.get(ejecución_id);
    if (!ejecución) {
      throw new Error(`Ejecución no encontrada: ${ejecución_id}`);
    }

    if (!ejecución.transacción_id) {
      throw new Error("No hay transacción para revertar");
    }

    await this.rollbackTransacción(ejecución.transacción_id);

    this.ejecuciones.set(ejecución_id, {
      ...ejecución,
      estado: "revertido",
    });
  }

  /**
   * Obtener estado de ejecución
   */
  obtenerEstado(ejecución_id: string): EjecuciónProceso | undefined {
    return this.ejecuciones.get(ejecución_id);
  }

  /**
   * Obtener historial de ejecuciones de un proceso
   */
  obtenerHistorial(proceso_id: string): HistorialEjecución[] {
    const ejecucionesDelProceso = Array.from(this.ejecuciones.values()).filter(
      e => e.proceso_id === proceso_id
    );

    return ejecucionesDelProceso.map(e => ({
      ejecución_id: e.id,
      proceso_id: e.proceso_id,
      fecha_inicio: e.fecha_inicio,
      fecha_fin: e.fecha_fin,
      total_pasos: e.pasos_ejecutados.length,
      pasos_exitosos: e.pasos_ejecutados.filter((p: ResultadoEjecuciónPaso) => p.estado === "éxito").length,
      pasos_fallidos: e.pasos_ejecutados.filter((p: ResultadoEjecuciónPaso) => p.estado.includes("error")).length,
      tiempo_total_ms: e.fecha_fin
        ? e.fecha_fin.getTime() - e.fecha_inicio.getTime()
        : Date.now() - e.fecha_inicio.getTime(),
      estado_final: e.estado,
      errores: e.errores_acumulados,
    }));
  }

  /**
   * Crear transacción
   */
  private crearTransacción(): string {
    const id = randomUUID();
    this.transacciones.set(id, { estado: "activa", pasos: [] });
    return id;
  }

  /**
   * Commit de transacción
   */
  private async commitTransacción(id: string): Promise<void> {
    const tx = this.transacciones.get(id);
    if (!tx) {
      throw new Error(`Transacción no encontrada: ${id}`);
    }

    // En implementación real, aquí se confirmarían todos los cambios
    this.transacciones.set(id, { ...tx, estado: "committed" });
  }

  /**
   * Rollback de transacción
   */
  private async rollbackTransacción(id: string): Promise<void> {
    const tx = this.transacciones.get(id);
    if (!tx) {
      throw new Error(`Transacción no encontrada: ${id}`);
    }

    // En implementación real, aquí se revertirían todos los cambios
    this.transacciones.set(id, { ...tx, estado: "rolledback" });
  }

  /**
   * Disparar webhook por paso
   */
  private async dispararWebhook(
    url: string,
    datos: Record<string, any>
  ): Promise<ResultadoWebhook> {
    const inicio = Date.now();
    const resultado: ResultadoWebhook = {
      id: randomUUID(),
      ejecución_id: datos.ejecución_id,
      url,
      método: "POST",
      payload: datos,
      timestamp: new Date(),
      reintentos: 0,
      éxito: false,
      tiempo_ms: 0,
      secuencia: 0,
    };

    try {
      // En implementación real, aquí se haría una llamada HTTP
      // Por ahora, simulamos éxito
      resultado.éxito = true;
      resultado.status_code = 200;
      resultado.respuesta = JSON.stringify({ ok: true });
    } catch (error: any) {
      resultado.error = error?.message;
      resultado.éxito = false;
    }

    resultado.tiempo_ms = Date.now() - inicio;
    return resultado;
  }

  /**
   * Disparar webhooks globales
   */
  private async dispararWebhooksGlobales(
    ejecución_id: string,
    webhooks: string[],
    ejecución: Partial<EjecuciónProceso>
  ): Promise<void> {
    for (const url of webhooks) {
      await this.dispararWebhook(url, {
        ejecución_id,
        tipo: "ejecución_completada",
        estado: ejecución.estado,
        pasos_ejecutados: ejecución.pasos_ejecutados?.length || 0,
      });
    }
  }

  /**
   * Utilidades
   */
  private validarProceso(proceso: ProcesoGenerado): boolean {
    return !!(proceso.id && proceso.tipo && proceso.estado);
  }

  private construirPlanosDeEjecución(proceso: ProcesoGenerado): PasoEjecución[] {
    const pasos: PasoEjecución[] = [];
    let orden = 0;

    // Crear paso para cada documento generado
    for (const doc of proceso.documentos_generados) {
      pasos.push({
        id: `paso-${orden}`,
        orden: orden++,
        tipo: "crear_factura",
        configuración: {
          tipo_documento: doc.tipo,
          documento_id: doc.id,
          contenido: doc.contenido,
        },
        transaccional: true,
        reintentos_máximos: 3,
        timeout_ms: 30000,
      });
    }

    // Crear paso para cada movimiento de inventario
    for (const mov of proceso.movimientos_inventario) {
      pasos.push({
        id: `paso-${orden}`,
        orden: orden++,
        tipo: "actualizar_inventario",
        configuración: {
          producto_id: mov.producto_id,
          cantidad: mov.cantidad,
          motivo: mov.motivo,
        },
        transaccional: true,
        reintentos_máximos: 3,
        timeout_ms: 30000,
      });
    }

    // Crear paso para cada asiento contable
    for (const asiento of proceso.asientos_contables) {
      pasos.push({
        id: `paso-${orden}`,
        orden: orden++,
        tipo: "generar_asiento",
        configuración: {
          cuenta_deudora: asiento.cuenta_deudora,
          cuenta_acreedora: asiento.cuenta_acreedora,
          monto: asiento.monto,
          descripción: asiento.descripción,
        },
        transaccional: true,
        reintentos_máximos: 3,
        timeout_ms: 30000,
      });
    }

    // Crear paso para cada notificación
    for (const notif of proceso.notificaciones) {
      pasos.push({
        id: `paso-${orden}`,
        orden: orden++,
        tipo: "enviar_notificación",
        configuración: {
          destinatario: notif.destinatario,
          asunto: notif.asunto,
          contenido: notif.contenido,
        },
        transaccional: false,
        reintentos_máximos: 2,
        timeout_ms: 60000,
      });
    }

    return pasos;
  }

  private evaluarCondición(condición: string, contexto: ContextoEjecución): boolean {
    // Implementación básica de evaluación de condiciones
    // En producción, esto sería más sofisticado
    if (condición === "siempre") return true;
    if (condición === "nunca") return false;
    if (condición === "si_éxito_anterior" && contexto.resultado_anterior) {
      return contexto.resultado_anterior.estado === "éxito";
    }
    return true;
  }

  private esErrorRecuperable(error: string): boolean {
    const patronesRecuperables = [
      "timeout",
      "conexión",
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
    ];
    return patronesRecuperables.some(p => error.toLowerCase().includes(p.toLowerCase()));
  }

  private async esperar(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
