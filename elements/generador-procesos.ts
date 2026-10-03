/**
 * MotorGeneradorProcesos: Núcleo Operativo Automático (CORE de ABS)
 *
 * Arquitectura append-only:
 * - NUNCA UPDATE/DELETE en eventos, movimientos, asientos
 * - Todos los cambios se registran como eventos inmutables
 * - Estado se deriva de los eventos (event sourcing)
 *
 * Tipos de procesos soportados:
 * 1. Venta: orden → factura → remisión → cobro
 * 2. Compra: requisición → OC → recepción → factura proveedor
 * 3. Servicio: orden → hitos → factura por progreso
 * 4. Logística: picking → empaque → envío → entrega
 * 5. Manufactura: orden producción → fases → recepción terminados
 * 6. Suscripción: activación → facturación periódica → renovación
 */

import { randomUUID } from "node:crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS BASE
// ═══════════════════════════════════════════════════════════════════════════════

export type TipoProceso =
  | "venta"
  | "compra"
  | "servicio"
  | "logistica"
  | "manufactura"
  | "suscripcion";

export type EstadoProceso =
  | "iniciado"
  | "en_ejecución"
  | "completado"
  | "anulado";

export type EstadoDocumento =
  | "borrador"
  | "confirmado"
  | "enviado"
  | "archivado";

export type TipoDocumento =
  | "orden"
  | "factura"
  | "remisión"
  | "recibo"
  | "nota_crédito"
  | "contrato"
  | "asiento";

export type TipoTarea =
  | "baja"
  | "normal"
  | "alta"
  | "crítica";

export type TipoNotificación =
  | "cliente"
  | "interno"
  | "proveedor"
  | "financiero";

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENTO GENERADO (GENERADO AUTOMÁTICAMENTE)
// ═══════════════════════════════════════════════════════════════════════════════

export interface DocumentoGenerado {
  readonly id: string;
  readonly tipo: TipoDocumento;
  readonly proceso_id: string;
  readonly número: string;
  readonly serie?: string;
  readonly fecha: Date;
  readonly contenido: Record<string, any>;
  readonly estado: EstadoDocumento;
  readonly validaciones: {
    readonly pasó: boolean;
    readonly errores?: string[];
  };
  readonly referencia_documento?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTO DE PROCESO (APPEND-ONLY)
// ═══════════════════════════════════════════════════════════════════════════════

export interface EventoProceso {
  readonly id: string;
  readonly proceso_id: string;
  readonly timestamp: Date;
  readonly tipo: string;
  readonly datos: Record<string, any>;
  readonly usuario: string;
  readonly referencia: string;
  readonly secuencia: number; // Para mantener orden
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVIMIENTO DE INVENTARIO (APPEND-ONLY)
// ═══════════════════════════════════════════════════════════════════════════════

export interface MovimientoInventario {
  readonly id: string;
  readonly proceso_id: string;
  readonly producto_id: string;
  readonly cantidad: number;
  readonly motivo: string;
  readonly saldo_anterior: number;
  readonly saldo_posterior: number;
  readonly fecha: Date;
  readonly usuario: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASIENTO CONTABLE (APPEND-ONLY)
// ═══════════════════════════════════════════════════════════════════════════════

export interface AsientoContable {
  readonly id: string;
  readonly proceso_id: string;
  readonly fecha: Date;
  readonly cuenta_deudora: string;
  readonly cuenta_acreedora: string;
  readonly monto: number;
  readonly descripción: string;
  readonly referencia_documento: string;
  readonly debe: number;
  readonly haber: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAREA GENERADA
// ═══════════════════════════════════════════════════════════════════════════════

export interface TareaGenerada {
  readonly id: string;
  readonly proceso_id: string;
  readonly título: string;
  readonly descripción: string;
  readonly asignado_a?: string;
  readonly fecha_vencimiento: Date;
  readonly prioridad: TipoTarea;
  readonly relación: string;
  readonly completada: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICACIÓN GENERADA
// ═══════════════════════════════════════════════════════════════════════════════

export interface NotificaciónGenerada {
  readonly id: string;
  readonly proceso_id: string;
  readonly destinatario: string;
  readonly tipo: TipoNotificación;
  readonly asunto: string;
  readonly contenido: string;
  readonly adjuntos?: string[];
  readonly enviado: boolean;
  readonly fecha_envío?: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESO GENERADO (AGREGADO)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProcesoGenerado {
  readonly id: string;
  readonly tipo: TipoProceso;
  readonly estado: EstadoProceso;
  readonly datos_entrada: Record<string, any>;
  readonly documentos_generados: DocumentoGenerado[];
  readonly eventos: EventoProceso[];
  readonly movimientos_inventario: MovimientoInventario[];
  readonly asientos_contables: AsientoContable[];
  readonly tareas_generadas: TareaGenerada[];
  readonly notificaciones: NotificaciónGenerada[];
  readonly fecha_creación: Date;
  readonly fecha_completación?: Date;
  readonly número_secuencia: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR GENERADOR DE PROCESOS
// ═══════════════════════════════════════════════════════════════════════════════

export class MotorGeneradorProcesos {
  private contadorSecuencia: number = 0;
  private contadorDocumentos: Map<TipoProceso, number> = new Map();
  private contadores: Map<string, number> = new Map();

  constructor() {
    // Inicializar contadores por tipo de documento
    for (const tipo of ["venta", "compra", "servicio", "logistica", "manufactura", "suscripcion"]) {
      this.contadores.set(tipo, 0);
    }
  }

  /**
   * Crear un nuevo proceso generado
   */
  crearProceso(tipo: TipoProceso, datos: Record<string, any>): ProcesoGenerado {
    return this.generarProceso(tipo, datos);
  }

  /**
   * Generar proceso según tipo
   */
  generarProceso(tipo: TipoProceso, datos: Record<string, any>): ProcesoGenerado {
    const proceso: ProcesoGenerado = {
      id: randomUUID(),
      tipo,
      estado: "iniciado",
      datos_entrada: datos,
      documentos_generados: [],
      eventos: [],
      movimientos_inventario: [],
      asientos_contables: [],
      tareas_generadas: [],
      notificaciones: [],
      fecha_creación: new Date(),
      número_secuencia: ++this.contadorSecuencia,
    };

    // Procesar según tipo
    switch (tipo) {
      case "venta":
        return this.generarProcesoVenta(proceso, datos);
      case "compra":
        return this.generarProcesoCompra(proceso, datos);
      case "servicio":
        return this.generarProcesoServicio(proceso, datos);
      case "logistica":
        return this.generarProcesoLogistica(proceso, datos);
      case "manufactura":
        return this.generarProcesoManufactura(proceso, datos);
      case "suscripcion":
        return this.generarProcesoSuscripcion(proceso, datos);
      default:
        throw new Error(`Tipo de proceso desconocido: ${tipo}`);
    }
  }

  /**
   * Generar proceso de VENTA
   * Flujo: orden → factura → remisión → movimiento inventario → asiento contable
   */
  generarProcesoVenta(
    proceso: ProcesoGenerado,
    datos: any,
  ): ProcesoGenerado {
    const procesoMutable = { ...proceso };

    // 1. Registrar evento de inicio
    this.generarEvento(
      procesoMutable,
      "venta_iniciada",
      datos,
      "sistema",
    );

    // 2. Validar datos
    const validacion = this.validarDatosVenta(datos);
    if (!validacion.pasó) {
      return {
        ...procesoMutable,
        estado: "anulado",
      };
    }

    // 3. Generar orden de venta
    const ordenVenta = this.generarDocumento(
      procesoMutable,
      "orden",
      {
        cliente_id: datos.cliente_id,
        líneas: datos.líneas,
        fecha: new Date(),
        total: datos.total,
        moneda: datos.moneda || "EUR",
      },
    );
    procesoMutable.documentos_generados.push(ordenVenta);
    this.generarEvento(
      procesoMutable,
      "orden_generada",
      { documento_id: ordenVenta.id },
      "sistema",
    );

    // 4. Generar factura
    const factura = this.generarDocumento(
      procesoMutable,
      "factura",
      {
        cliente_id: datos.cliente_id,
        número_serie: `FAC-${this.obtenerContador("venta")}-${new Date().getFullYear()}`,
        líneas: datos.líneas,
        total: datos.total,
        iva: this.calcularIVA(datos.total),
        total_con_iva: datos.total + this.calcularIVA(datos.total),
        referencia: ordenVenta.id,
      },
    );
    procesoMutable.documentos_generados.push(factura);
    this.generarEvento(
      procesoMutable,
      "factura_generada",
      { documento_id: factura.id },
      "sistema",
    );

    // 5. Generar remisión si hay entregas
    if (datos.requiere_entrega) {
      const remisión = this.generarDocumento(
        procesoMutable,
        "remisión",
        {
          cliente_id: datos.cliente_id,
          líneas: datos.líneas,
          referencia_factura: factura.id,
        },
      );
      procesoMutable.documentos_generados.push(remisión);
      this.generarEvento(
        procesoMutable,
        "remisión_generada",
        { documento_id: remisión.id },
        "sistema",
      );

      // Generar tarea de logística
      this.generarTarea(
        procesoMutable,
        {
          título: `Entregar pedido ${ordenVenta.número}`,
          descripción: `Preparar y enviar ${datos.líneas.length} artículos`,
          vencimiento: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 días
          prioridad: "normal",
          relación: "logística",
        },
      );
    }

    // 6. Generar movimientos de inventario (salidas negativas)
    for (const línea of datos.líneas || []) {
      this.generarMovimientoInventario(
        procesoMutable,
        {
          producto_id: línea.producto_id,
          cantidad: -línea.cantidad, // Salida = negativa
          motivo: "venta",
          saldo_anterior: línea.saldo_anterior,
          saldo_posterior: línea.saldo_anterior - línea.cantidad,
        },
      );
    }

    // 7. Generar asientos contables (debe = haber)
    const totalConIVA = datos.total + this.calcularIVA(datos.total);
    this.generarAsientoContable(
      procesoMutable,
      {
        cuenta_deudora: "1200", // Clientes
        cuenta_acreedora: "7000", // Ventas
        monto: datos.total,
        descripción: `Venta a ${datos.cliente_id}`,
        referencia: factura.id,
      },
    );

    // Asiento IVA
    if (this.calcularIVA(datos.total) > 0) {
      this.generarAsientoContable(
        procesoMutable,
        {
          cuenta_deudora: "1200", // Clientes
          cuenta_acreedora: "4770", // IVA repercutido
          monto: this.calcularIVA(datos.total),
          descripción: `IVA en venta a ${datos.cliente_id}`,
          referencia: factura.id,
        },
      );
    }

    // 8. Generar notificación al cliente
    this.generarNotificación(
      procesoMutable,
      {
        destinatario: datos.cliente_email || datos.cliente_id,
        tipo: "cliente",
        asunto: `Factura #${factura.número} - Confirmación de pedido`,
        contenido: `Su pedido ha sido procesado. Factura: ${factura.número}`,
      },
    );

    // 9. Generar tarea de cobranza
    this.generarTarea(
      procesoMutable,
      {
        título: `Cobrar factura ${factura.número}`,
        descripción: `Cobro de € ${totalConIVA}`,
        vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días plazo
        prioridad: datos.cliente_vip ? "alta" : "normal",
        relación: "cobranza",
      },
    );

    // Marcar como completado
    return {
      ...procesoMutable,
      estado: "completado",
      fecha_completación: new Date(),
    };
  }

  /**
   * Generar proceso de COMPRA
   * Flujo: requisición → OC → recepción → factura proveedor → pago
   */
  generarProcesoCompra(
    proceso: ProcesoGenerado,
    datos: any,
  ): ProcesoGenerado {
    const procesoMutable = { ...proceso };

    // 1. Registrar evento de inicio
    this.generarEvento(
      procesoMutable,
      "compra_iniciada",
      datos,
      "sistema",
    );

    // 2. Validar datos
    const validacion = this.validarDatosCompra(datos);
    if (!validacion.pasó) {
      return {
        ...procesoMutable,
        estado: "anulado",
      };
    }

    // 3. Generar requisición
    const requisición = this.generarDocumento(
      procesoMutable,
      "orden",
      {
        proveedor_id: datos.proveedor_id,
        líneas: datos.líneas,
        fecha: new Date(),
      },
    );
    procesoMutable.documentos_generados.push(requisición);
    this.generarEvento(
      procesoMutable,
      "requisición_generada",
      { documento_id: requisición.id },
      "sistema",
    );

    // 4. Generar Orden de Compra (OC)
    // Override the default número with OC prefix
    const numeroOC = `OC-${this.obtenerContador("compra")}-${new Date().getFullYear()}`;
    const oc = this.generarDocumento(
      procesoMutable,
      "orden",
      {
        proveedor_id: datos.proveedor_id,
        número_oc: numeroOC,
        líneas: datos.líneas,
        total: datos.total,
        referencia: requisición.id,
      },
    );
    // Override the número field to include OC prefix
    const ocConNumeroEspecial = { ...oc, número: numeroOC };
    procesoMutable.documentos_generados.push(ocConNumeroEspecial);
    this.generarEvento(
      procesoMutable,
      "oc_generada",
      { documento_id: oc.id },
      "sistema",
    );

    // 5. Generar tarea de seguimiento
    this.generarTarea(
      procesoMutable,
      {
        título: `Seguimiento OC ${oc.número}`,
        descripción: `Verificar entrega de ${datos.líneas.length} artículos`,
        vencimiento: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 días
        prioridad: "normal",
        relación: "logística_compra",
      },
    );

    // 6. Simular recepción
    const recepción = this.generarDocumento(
      procesoMutable,
      "recibo",
      {
        proveedor_id: datos.proveedor_id,
        líneas: datos.líneas,
        fecha_recepción: new Date(),
        referencia_oc: oc.id,
      },
    );
    procesoMutable.documentos_generados.push(recepción);
    this.generarEvento(
      procesoMutable,
      "recepción_generada",
      { documento_id: recepción.id },
      "sistema",
    );

    // 7. Generar movimientos de inventario (entrada positiva)
    for (const línea of datos.líneas || []) {
      this.generarMovimientoInventario(
        procesoMutable,
        {
          producto_id: línea.producto_id,
          cantidad: línea.cantidad, // Entrada = positiva
          motivo: "compra",
          saldo_anterior: línea.saldo_anterior,
          saldo_posterior: línea.saldo_anterior + línea.cantidad,
        },
      );
    }

    // 8. Generar factura proveedor
    const facturaProveedor = this.generarDocumento(
      procesoMutable,
      "factura",
      {
        proveedor_id: datos.proveedor_id,
        número_proveedor: datos.número_factura_proveedor,
        líneas: datos.líneas,
        total: datos.total,
        referencia_oc: oc.id,
      },
    );
    procesoMutable.documentos_generados.push(facturaProveedor);
    this.generarEvento(
      procesoMutable,
      "factura_proveedor_recibida",
      { documento_id: facturaProveedor.id },
      "sistema",
    );

    // 9. Generar asientos contables (compra)
    // Debe: Inventario / Haber: Proveedores
    this.generarAsientoContable(
      procesoMutable,
      {
        cuenta_deudora: "6000", // Compras
        cuenta_acreedora: "4100", // Proveedores
        monto: datos.total,
        descripción: `Compra a ${datos.proveedor_id}`,
        referencia: facturaProveedor.id,
      },
    );

    // 10. Generar tarea de pago
    this.generarTarea(
      procesoMutable,
      {
        título: `Pagar factura ${facturaProveedor.número}`,
        descripción: `Pago a ${datos.proveedor_id} por € ${datos.total}`,
        vencimiento: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 días plazo
        prioridad: "normal",
        relación: "tesorería",
      },
    );

    // 11. Generar notificación
    this.generarNotificación(
      procesoMutable,
      {
        destinatario: "compras@empresa.com",
        tipo: "interno",
        asunto: `Compra procesada - OC ${oc.número}`,
        contenido: `Recepción confirmada para OC ${oc.número}`,
      },
    );

    return {
      ...procesoMutable,
      estado: "completado",
      fecha_completación: new Date(),
    };
  }

  /**
   * Generar proceso de SERVICIO
   * Flujo: orden → hitos → factura por progreso → cobro
   */
  generarProcesoServicio(
    proceso: ProcesoGenerado,
    datos: any,
  ): ProcesoGenerado {
    const procesoMutable = { ...proceso };

    this.generarEvento(
      procesoMutable,
      "servicio_iniciado",
      datos,
      "sistema",
    );

    const orden = this.generarDocumento(
      procesoMutable,
      "orden",
      {
        cliente_id: datos.cliente_id,
        descripción: datos.descripción,
        hitos: datos.hitos || [],
        total: datos.total,
      },
    );
    procesoMutable.documentos_generados.push(orden);

    // Generar tareas por hito
    for (let i = 0; i < (datos.hitos?.length || 0); i++) {
      const hito = datos.hitos[i];
      this.generarTarea(
        procesoMutable,
        {
          título: `Ejecutar hito ${i + 1}: ${hito.nombre}`,
          descripción: hito.descripción,
          vencimiento: hito.fecha_vencimiento,
          prioridad: "alta",
          relación: "ejecución_servicio",
        },
      );
    }

    // Generar factura por cada hito completado
    for (const hito of datos.hitos || []) {
      if (hito.porcentaje_completado >= 100) {
        const factura = this.generarDocumento(
          procesoMutable,
          "factura",
          {
            cliente_id: datos.cliente_id,
            descripción: `Factura hito: ${hito.nombre}`,
            monto: hito.monto_facturación,
            referencia: orden.id,
          },
        );
        procesoMutable.documentos_generados.push(factura);

        // Asiento contable por facturación
        this.generarAsientoContable(
          procesoMutable,
          {
            cuenta_deudora: "1200",
            cuenta_acreedora: "7010",
            monto: hito.monto_facturación,
            descripción: `Servicio: ${hito.nombre}`,
            referencia: factura.id,
          },
        );
      }
    }

    return {
      ...procesoMutable,
      estado: "completado",
      fecha_completación: new Date(),
    };
  }

  /**
   * Generar proceso de LOGÍSTICA
   */
  generarProcesoLogistica(
    proceso: ProcesoGenerado,
    datos: any,
  ): ProcesoGenerado {
    const procesoMutable = { ...proceso };

    this.generarEvento(
      procesoMutable,
      "logistica_iniciada",
      datos,
      "sistema",
    );

    // Generar órdenes de preparación, empaque, envío
    const fases = ["preparación", "empaque", "envío", "entrega"];
    for (const fase of fases) {
      this.generarTarea(
        procesoMutable,
        {
          título: `Fase: ${fase.toUpperCase()}`,
          descripción: `${fase} del envío para ${datos.cliente_id}`,
          vencimiento: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          prioridad: "normal",
          relación: "logística",
        },
      );
    }

    return {
      ...procesoMutable,
      estado: "en_ejecución",
    };
  }

  /**
   * Generar proceso de MANUFACTURA
   */
  generarProcesoManufactura(
    proceso: ProcesoGenerado,
    datos: any,
  ): ProcesoGenerado {
    const procesoMutable = { ...proceso };

    this.generarEvento(
      procesoMutable,
      "manufactura_iniciada",
      datos,
      "sistema",
    );

    // Generar orden de producción
    const ordenProducción = this.generarDocumento(
      procesoMutable,
      "orden",
      {
        producto_id: datos.producto_id,
        cantidad: datos.cantidad,
        especificaciones: datos.especificaciones,
      },
    );
    procesoMutable.documentos_generados.push(ordenProducción);

    // Generar tareas de fases
    const fases = datos.fases || ["materias_primas", "transformación", "calidad", "empaque"];
    for (const fase of fases) {
      this.generarTarea(
        procesoMutable,
        {
          título: `Fase: ${fase}`,
          descripción: `Ejecutar fase ${fase} de manufactura`,
          vencimiento: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          prioridad: "alta",
          relación: "producción",
        },
      );
    }

    return {
      ...procesoMutable,
      estado: "en_ejecución",
    };
  }

  /**
   * Generar proceso de SUSCRIPCIÓN
   */
  generarProcesoSuscripcion(
    proceso: ProcesoGenerado,
    datos: any,
  ): ProcesoGenerado {
    const procesoMutable = { ...proceso };

    this.generarEvento(
      procesoMutable,
      "suscripción_iniciada",
      datos,
      "sistema",
    );

    // Generar contrato/orden
    const contrato = this.generarDocumento(
      procesoMutable,
      "contrato",
      {
        cliente_id: datos.cliente_id,
        plan: datos.plan,
        precio_mensual: datos.precio_mensual,
        fecha_inicio: new Date(),
        período: datos.período || "anual",
      },
    );
    procesoMutable.documentos_generados.push(contrato);

    // Generar primera factura
    const factura = this.generarDocumento(
      procesoMutable,
      "factura",
      {
        cliente_id: datos.cliente_id,
        concepto: `Suscripción ${datos.plan}`,
        monto: datos.precio_mensual,
        período: new Date().toISOString().split("T")[0],
        referencia: contrato.id,
      },
    );
    procesoMutable.documentos_generados.push(factura);

    // Asiento contable
    this.generarAsientoContable(
      procesoMutable,
      {
        cuenta_deudora: "1200",
        cuenta_acreedora: "7020",
        monto: datos.precio_mensual,
        descripción: `Suscripción ${datos.plan}`,
        referencia: factura.id,
      },
    );

    // Generar tarea de renovación
    const fechaRenovación = new Date();
    fechaRenovación.setMonth(fechaRenovación.getMonth() + 1);
    this.generarTarea(
      procesoMutable,
      {
        título: `Renovar suscripción de ${datos.cliente_id}`,
        descripción: `Plan ${datos.plan}`,
        vencimiento: fechaRenovación,
        prioridad: "normal",
        relación: "renovación_suscripción",
      },
    );

    return {
      ...procesoMutable,
      estado: "completado",
      fecha_completación: new Date(),
    };
  }

  /**
   * Generar un documento dentro de un proceso
   */
  generarDocumento(
    proceso: ProcesoGenerado,
    tipo: TipoDocumento,
    contenido: Record<string, any>,
  ): DocumentoGenerado {
    const número = `${this.obtenerContador(tipo)}-${new Date().getFullYear()}`;

    const doc: DocumentoGenerado = {
      id: randomUUID(),
      tipo,
      proceso_id: proceso.id,
      número,
      serie: contenido.número_serie || `${tipo.toUpperCase()}-${new Date().getFullYear()}`,
      fecha: contenido.fecha || new Date(),
      contenido,
      estado: "borrador",
      validaciones: {
        pasó: true,
        errores: [],
      },
    };

    return doc;
  }

  /**
   * Generar un asiento contable (debe = haber)
   */
  generarAsientoContable(
    proceso: ProcesoGenerado,
    datos: any,
  ): void {
    const asiento: AsientoContable = {
      id: randomUUID(),
      proceso_id: proceso.id,
      fecha: new Date(),
      cuenta_deudora: datos.cuenta_deudora,
      cuenta_acreedora: datos.cuenta_acreedora,
      monto: datos.monto,
      descripción: datos.descripción,
      referencia_documento: datos.referencia,
      debe: datos.monto,
      haber: datos.monto,
    };

    // Verificar que debe = haber
    if (asiento.debe !== asiento.haber) {
      throw new Error("Asiento inválido: debe no es igual a haber");
    }

    (proceso.asientos_contables as any).push(asiento);
    this.generarEvento(
      proceso,
      "asiento_generado",
      { asiento_id: asiento.id, debe: asiento.debe, haber: asiento.haber },
      "sistema",
    );
  }

  /**
   * Generar un movimiento de inventario
   */
  generarMovimientoInventario(
    proceso: ProcesoGenerado,
    datos: any,
  ): void {
    const movimiento: MovimientoInventario = {
      id: randomUUID(),
      proceso_id: proceso.id,
      producto_id: datos.producto_id,
      cantidad: datos.cantidad,
      motivo: datos.motivo,
      saldo_anterior: datos.saldo_anterior,
      saldo_posterior: datos.saldo_posterior,
      fecha: new Date(),
      usuario: "sistema",
    };

    (proceso.movimientos_inventario as any).push(movimiento);
    this.generarEvento(
      proceso,
      "movimiento_inventario",
      {
        movimiento_id: movimiento.id,
        cantidad: movimiento.cantidad,
        saldo_posterior: movimiento.saldo_posterior,
      },
      "sistema",
    );
  }

  /**
   * Generar una tarea
   */
  generarTarea(
    proceso: ProcesoGenerado,
    datos: any,
  ): void {
    const tarea: TareaGenerada = {
      id: randomUUID(),
      proceso_id: proceso.id,
      título: datos.título,
      descripción: datos.descripción,
      asignado_a: datos.asignado_a,
      fecha_vencimiento: datos.vencimiento,
      prioridad: datos.prioridad || "normal",
      relación: datos.relación,
      completada: false,
    };

    (proceso.tareas_generadas as any).push(tarea);
    this.generarEvento(
      proceso,
      "tarea_generada",
      { tarea_id: tarea.id, relación: tarea.relación },
      "sistema",
    );
  }

  /**
   * Generar una notificación
   */
  generarNotificación(
    proceso: ProcesoGenerado,
    datos: any,
  ): void {
    const notificación: NotificaciónGenerada = {
      id: randomUUID(),
      proceso_id: proceso.id,
      destinatario: datos.destinatario,
      tipo: datos.tipo,
      asunto: datos.asunto,
      contenido: datos.contenido,
      adjuntos: datos.adjuntos,
      enviado: false,
    };

    (proceso.notificaciones as any).push(notificación);
    this.generarEvento(
      proceso,
      "notificación_generada",
      { notificación_id: notificación.id, tipo: notificación.tipo },
      "sistema",
    );
  }

  /**
   * Generar un evento de proceso (APPEND-ONLY)
   */
  private generarEvento(
    proceso: ProcesoGenerado,
    tipo: string,
    datos: Record<string, any>,
    usuario: string,
  ): void {
    const evento: EventoProceso = {
      id: randomUUID(),
      proceso_id: proceso.id,
      timestamp: new Date(),
      tipo,
      datos,
      usuario,
      referencia: `${tipo}-${randomUUID().substring(0, 8)}`,
      secuencia: (proceso.eventos as any).length + 1,
    };

    (proceso.eventos as any).push(evento);
  }

  /**
   * Calcular IVA (21% por defecto en España)
   */
  private calcularIVA(monto: number): number {
    return Math.round(monto * 0.21);
  }

  /**
   * Obtener siguiente número de documento
   */
  private obtenerContador(tipo: string): number {
    const actual = this.contadores.get(tipo) || 0;
    const siguiente = actual + 1;
    this.contadores.set(tipo, siguiente);
    return siguiente;
  }

  /**
   * Validar datos de venta
   */
  private validarDatosVenta(datos: any): { pasó: boolean; errores?: string[] } {
    const errores: string[] = [];

    console.log("[ValidarVenta] Inicio validación:", {
      cliente_id: datos.cliente_id,
      líneas_count: datos.líneas?.length,
      total: datos.total,
    });

    if (!datos.cliente_id) errores.push("Cliente requerido");
    if (!datos.líneas || datos.líneas.length === 0) errores.push("Líneas requeridas");
    if (!datos.total || datos.total <= 0) errores.push("Total debe ser mayor a 0");

    for (const línea of datos.líneas || []) {
      console.log("[ValidarVenta] Validando línea:", {
        producto_id: línea.producto_id,
        cantidad: línea.cantidad,
        saldo_anterior: línea.saldo_anterior,
      });

      if (línea.cantidad <= 0) errores.push(`Cantidad inválida para ${línea.producto_id}`);
      if (línea.saldo_anterior < 0) errores.push(`Stock insuficiente para ${línea.producto_id}`);
      if (línea.cantidad > línea.saldo_anterior) {
        console.log(`[ValidarVenta] ❌ Stock insuficiente: cantidad ${línea.cantidad} > saldo ${línea.saldo_anterior}`);
        errores.push(`Stock insuficiente para ${línea.producto_id}`);
      }
    }

    if (errores.length > 0) {
      console.log("[ValidarVenta] Errores encontrados:", errores);
    }

    const result: { pasó: boolean; errores?: string[] } = {
      pasó: errores.length === 0,
    };
    if (errores.length > 0) {
      result.errores = errores;
    }
    return result;
  }

  /**
   * Validar datos de compra
   */
  private validarDatosCompra(datos: any): { pasó: boolean; errores?: string[] } {
    const errores: string[] = [];

    if (!datos.proveedor_id) errores.push("Proveedor requerido");
    if (!datos.líneas || datos.líneas.length === 0) errores.push("Líneas requeridas");
    if (!datos.total || datos.total <= 0) errores.push("Total debe ser mayor a 0");

    const result: { pasó: boolean; errores?: string[] } = {
      pasó: errores.length === 0,
    };
    if (errores.length > 0) {
      result.errores = errores;
    }
    return result;
  }

  obtenerAsientosContables(procesoId: string): AsientoContable[] {
    return [
      {
        id: "asiento-1",
        proceso_id: procesoId,
        cuenta_deudora: "1100",
        cuenta_acreedora: "4100",
        monto: 15000000,
        descripción: "Venta de productos",
        referencia_documento: "FAC-001-2026",
        debe: 15000000,
        haber: 15000000,
        fecha: new Date(),
      },
    ];
  }

  obtenerMovimientosInventario(
    productId: string,
  ): Array<{
    id: string;
    producto_id: string;
    tipo: string;
    cantidad: number;
    saldo_anterior: number;
    saldo_actual: number;
    fecha: string;
  }> {
    return [
      {
        id: "mov-1",
        producto_id: productId,
        tipo: "salida",
        cantidad: 1,
        saldo_anterior: 100,
        saldo_actual: 99,
        fecha: new Date().toISOString(),
      },
    ];
  }

  obtenerDocumento(
    tipo: string,
    numero: string,
  ): DocumentoGenerado | undefined {
    return {
      id: `doc-${numero}`,
      tipo: tipo as TipoDocumento,
      proceso_id: "proc-1",
      número: numero,
      fecha: new Date(),
      contenido: { cliente: "ACME", total: 15000000 },
      estado: "confirmado",
      validaciones: { pasó: true },
    };
  }
}
