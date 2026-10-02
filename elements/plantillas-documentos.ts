/**
 * Plantillas de Documentos Generados Automáticamente
 *
 * Cada plantilla es responsable de renderizar la estructura de un documento
 * según el tipo y los datos proporcionados.
 */

import { randomUUID } from "node:crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// INTERFAZ BASE
// ═══════════════════════════════════════════════════════════════════════════════

export interface PlantillaDocumento {
  readonly tipo: string;
  readonly versión: string;
  renderizar(datos: any): Record<string, any>;
  validar(datos: any): { válido: boolean; errores?: string[] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANTILLA: ORDEN DE VENTA
// ═══════════════════════════════════════════════════════════════════════════════

export class PlantillaOrdenVenta implements PlantillaDocumento {
  readonly tipo = "orden";
  readonly versión = "1.0";

  renderizar(datos: any): Record<string, any> {
    return {
      id_documento: randomUUID(),
      tipo: this.tipo,
      versión: this.versión,
      fecha: datos.fecha || new Date().toISOString(),
      cliente: {
        id: datos.cliente_id,
        nombre: datos.cliente_nombre,
        email: datos.cliente_email,
        dirección: datos.cliente_dirección,
      },
      líneas: this.renderizarLíneas(datos.líneas || []),
      resumen: {
        cantidad_artículos: datos.líneas?.length || 0,
        subtotal: this.calcularSubtotal(datos.líneas),
        iva: this.calcularIVA(this.calcularSubtotal(datos.líneas)),
        total: datos.total || 0,
      },
      estado: "confirmada",
      notas: datos.notas || "",
      términos_condiciones: this.obtenerTerminosEstándar(),
    };
  }

  validar(datos: any): { válido: boolean; errores?: string[] } {
    const errores: string[] = [];

    if (!datos.cliente_id) errores.push("Cliente requerido");
    if (!datos.líneas || datos.líneas.length === 0) errores.push("Orden debe tener líneas");
    if (!datos.total || datos.total <= 0) errores.push("Total debe ser positivo");

    const result: { válido: boolean; errores?: string[] } = {
      válido: errores.length === 0,
    };
    if (errores.length > 0) {
      result.errores = errores;
    }
    return result;
  }

  private renderizarLíneas(líneas: any[]): any[] {
    return líneas.map((línea, idx) => ({
      número: idx + 1,
      producto_id: línea.producto_id,
      descripción: línea.descripción,
      cantidad: línea.cantidad,
      precio_unitario: línea.precio_unitario,
      subtotal: línea.cantidad * línea.precio_unitario,
    }));
  }

  private calcularSubtotal(líneas: any[]): number {
    return (líneas || []).reduce((acc, línea) => acc + (línea.cantidad * línea.precio_unitario || 0), 0);
  }

  private calcularIVA(subtotal: number): number {
    return Math.round(subtotal * 0.21);
  }

  private obtenerTerminosEstándar(): string {
    return "Plazo de pago 30 días desde la fecha de factura. No se aceptan devoluciones después de 15 días.";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANTILLA: FACTURA
// ═══════════════════════════════════════════════════════════════════════════════

export class PlantillaFactura implements PlantillaDocumento {
  readonly tipo = "factura";
  readonly versión = "1.0";

  renderizar(datos: any): Record<string, any> {
    const subtotal = this.calcularSubtotal(datos.líneas || []);
    const iva = this.calcularIVA(subtotal);
    const total = subtotal + iva;

    return {
      id_documento: randomUUID(),
      tipo: this.tipo,
      versión: this.versión,
      número_factura: datos.número_serie || `FAC-${randomUUID().substring(0, 8)}`,
      serie: datos.serie || "A",
      fecha_emisión: datos.fecha || new Date().toISOString(),
      fecha_vencimiento: this.calcularFechaVencimiento(new Date(), 30),
      emisor: {
        nombre: "Empresa XYZ SL",
        nif: "ESA12345678",
        dirección: "Calle Principal 123, 28001 Madrid",
        email: "facturación@empresa.com",
      },
      receptor: {
        id: datos.cliente_id,
        nombre: datos.cliente_nombre,
        nif: datos.cliente_nif,
        dirección: datos.cliente_dirección,
        email: datos.cliente_email,
      },
      líneas: this.renderizarLíneasFactura(datos.líneas || []),
      resumen_financiero: {
        base_imponible: subtotal,
        iva_21_por_ciento: iva,
        total_factura: total,
        moneda: datos.moneda || "EUR",
      },
      método_pago: datos.método_pago || "Transferencia bancaria",
      referencia_pedido: datos.referencia,
      estado: "emitida",
      concepto_fiscal: "Venta de bienes",
    };
  }

  validar(datos: any): { válido: boolean; errores?: string[] } {
    const errores: string[] = [];

    if (!datos.cliente_id) errores.push("Cliente requerido");
    if (!datos.líneas || datos.líneas.length === 0) errores.push("Factura debe tener líneas");
    if (!datos.cliente_nif) errores.push("NIF del cliente requerido");

    const result: { válido: boolean; errores?: string[] } = {
      válido: errores.length === 0,
    };
    if (errores.length > 0) {
      result.errores = errores;
    }
    return result;
  }

  private renderizarLíneasFactura(líneas: any[]): any[] {
    return líneas.map((línea, idx) => ({
      número_línea: idx + 1,
      código_producto: línea.producto_id,
      descripción: línea.descripción,
      cantidad: línea.cantidad,
      unidad_medida: línea.unidad || "ud",
      precio_unitario: línea.precio_unitario,
      porcentaje_descuento: línea.descuento || 0,
      subtotal_línea: línea.cantidad * línea.precio_unitario * (1 - (línea.descuento || 0) / 100),
    }));
  }

  private calcularSubtotal(líneas: any[]): number {
    return (líneas || []).reduce((acc, línea) =>
      acc + (línea.cantidad * línea.precio_unitario * (1 - (línea.descuento || 0) / 100)),
      0
    );
  }

  private calcularIVA(subtotal: number): number {
    return Math.round(subtotal * 0.21);
  }

  private calcularFechaVencimiento(fecha: Date, días: number): string {
    const vencimiento = new Date(fecha);
    vencimiento.setDate(vencimiento.getDate() + días);
    const partes = vencimiento.toISOString().split("T");
    return partes[0] || "";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANTILLA: REMISIÓN
// ═══════════════════════════════════════════════════════════════════════════════

export class PlantillaRemisión implements PlantillaDocumento {
  readonly tipo = "remisión";
  readonly versión = "1.0";

  renderizar(datos: any): Record<string, any> {
    return {
      id_documento: randomUUID(),
      tipo: this.tipo,
      versión: this.versión,
      número_remisión: `REM-${randomUUID().substring(0, 8)}`,
      fecha_remisión: new Date().toISOString(),
      remitente: {
        nombre: "Empresa XYZ SL",
        dirección_envío: "Centro de distribución, Avenida Logística 45",
      },
      destinatario: {
        id: datos.cliente_id,
        nombre: datos.cliente_nombre,
        dirección_entrega: datos.cliente_dirección,
        teléfono: datos.cliente_teléfono,
      },
      líneas: this.renderizarLíneasRemisión(datos.líneas || []),
      instrucciones_entrega: datos.instrucciones || "Entregar en horario comercial",
      referencia_factura: datos.referencia_factura,
      referencia_pedido: datos.referencia_pedido,
      transportista: datos.transportista || "Por determinar",
      estado: "preparada_para_envío",
      peso_total_kg: this.calcularPesoTotal(datos.líneas || []),
      volumen_total_m3: this.calcularVolumenTotal(datos.líneas || []),
    };
  }

  validar(datos: any): { válido: boolean; errores?: string[] } {
    const errores: string[] = [];

    if (!datos.cliente_id) errores.push("Cliente requerido");
    if (!datos.líneas || datos.líneas.length === 0) errores.push("Remisión debe tener líneas");

    const result: { válido: boolean; errores?: string[] } = {
      válido: errores.length === 0,
    };
    if (errores.length > 0) {
      result.errores = errores;
    }
    return result;
  }

  private renderizarLíneasRemisión(líneas: any[]): any[] {
    return líneas.map((línea, idx) => ({
      número: idx + 1,
      código_producto: línea.producto_id,
      descripción: línea.descripción,
      cantidad: línea.cantidad,
      peso_unitario: línea.peso_unitario || 1,
      peso_total: (línea.cantidad || 1) * (línea.peso_unitario || 1),
    }));
  }

  private calcularPesoTotal(líneas: any[]): number {
    return (líneas || []).reduce((acc, línea) =>
      acc + ((línea.cantidad || 1) * (línea.peso_unitario || 1)),
      0
    );
  }

  private calcularVolumenTotal(líneas: any[]): number {
    return (líneas || []).reduce((acc, línea) =>
      acc + ((línea.cantidad || 1) * (línea.volumen_unitario || 0.01)),
      0
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANTILLA: RECIBO
// ═══════════════════════════════════════════════════════════════════════════════

export class PlantillaRecibo implements PlantillaDocumento {
  readonly tipo = "recibo";
  readonly versión = "1.0";

  renderizar(datos: any): Record<string, any> {
    return {
      id_documento: randomUUID(),
      tipo: this.tipo,
      versión: this.versión,
      número_recibo: `REC-${randomUUID().substring(0, 8)}`,
      fecha_recepción: new Date().toISOString(),
      remitente: {
        id: datos.proveedor_id,
        nombre: datos.proveedor_nombre,
      },
      receptor: {
        nombre: "Empresa XYZ SL",
        dirección: "Centro de recepción",
      },
      líneas: this.renderizarLíneasRecepción(datos.líneas || []),
      resumen: {
        cantidad_artículos: datos.líneas?.length || 0,
        cantidad_total: this.calcularCantidadTotal(datos.líneas || []),
      },
      condición_recepción: "Conforme",
      observaciones: datos.observaciones || "Sin observaciones",
      recibido_por: "Sistema automático",
      referencia_oc: datos.referencia_oc,
      estado: "recibido",
    };
  }

  validar(datos: any): { válido: boolean; errores?: string[] } {
    const errores: string[] = [];

    if (!datos.proveedor_id) errores.push("Proveedor requerido");
    if (!datos.líneas || datos.líneas.length === 0) errores.push("Recibo debe tener líneas");

    const result: { válido: boolean; errores?: string[] } = {
      válido: errores.length === 0,
    };
    if (errores.length > 0) {
      result.errores = errores;
    }
    return result;
  }

  private renderizarLíneasRecepción(líneas: any[]): any[] {
    return líneas.map((línea, idx) => ({
      número: idx + 1,
      código_producto: línea.producto_id,
      descripción: línea.descripción,
      cantidad_solicitada: línea.cantidad_solicitada || línea.cantidad,
      cantidad_recibida: línea.cantidad,
      estado_recepción: "conforme",
    }));
  }

  private calcularCantidadTotal(líneas: any[]): number {
    return (líneas || []).reduce((acc, línea) => acc + (línea.cantidad || 0), 0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANTILLA: NOTA DE CRÉDITO
// ═══════════════════════════════════════════════════════════════════════════════

export class PlantillaNotaCrédito implements PlantillaDocumento {
  readonly tipo = "nota_crédito";
  readonly versión = "1.0";

  renderizar(datos: any): Record<string, any> {
    const subtotal = this.calcularSubtotal(datos.líneas || []);
    const iva = this.calcularIVA(subtotal);
    const total = subtotal + iva;

    return {
      id_documento: randomUUID(),
      tipo: this.tipo,
      versión: this.versión,
      número_nota_crédito: `NC-${randomUUID().substring(0, 8)}`,
      fecha_emisión: new Date().toISOString(),
      referencia_factura_original: datos.referencia_factura,
      motivo: datos.motivo || "Devolución parcial",
      cliente: {
        id: datos.cliente_id,
        nombre: datos.cliente_nombre,
      },
      líneas: this.renderizarLíneasNC(datos.líneas || []),
      resumen_financiero: {
        base_imponible: -subtotal, // Negativo porque es devolución
        iva_21_por_ciento: -iva,
        total_nota_crédito: -total,
      },
      descripción_detallada: datos.descripción || "Devolución de artículos",
      estado: "emitida",
    };
  }

  validar(datos: any): { válido: boolean; errores?: string[] } {
    const errores: string[] = [];

    if (!datos.cliente_id) errores.push("Cliente requerido");
    if (!datos.líneas || datos.líneas.length === 0) errores.push("Nota de crédito debe tener líneas");
    if (!datos.referencia_factura) errores.push("Referencia a factura original requerida");

    const result: { válido: boolean; errores?: string[] } = {
      válido: errores.length === 0,
    };
    if (errores.length > 0) {
      result.errores = errores;
    }
    return result;
  }

  private renderizarLíneasNC(líneas: any[]): any[] {
    return líneas.map((línea, idx) => ({
      número: idx + 1,
      descripción: línea.descripción,
      cantidad_devuelta: línea.cantidad,
      precio_unitario: línea.precio_unitario,
      subtotal: -(línea.cantidad * línea.precio_unitario),
    }));
  }

  private calcularSubtotal(líneas: any[]): number {
    return (líneas || []).reduce((acc, línea) => acc + (línea.cantidad * línea.precio_unitario || 0), 0);
  }

  private calcularIVA(subtotal: number): number {
    return Math.round(subtotal * 0.21);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANTILLA: ORDEN DE COMPRA
// ═══════════════════════════════════════════════════════════════════════════════

export class PlantillaOC implements PlantillaDocumento {
  readonly tipo = "orden";
  readonly versión = "1.0";

  renderizar(datos: any): Record<string, any> {
    return {
      id_documento: randomUUID(),
      tipo: this.tipo,
      versión: this.versión,
      número_oc: datos.número_oc || `OC-${randomUUID().substring(0, 8)}`,
      fecha_emisión: new Date().toISOString(),
      fecha_entrega_prevista: datos.fecha_entrega || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      comprador: {
        nombre: "Empresa XYZ SL",
        departamento: datos.departamento_compras || "Compras",
        email: datos.email_compras || "compras@empresa.com",
      },
      proveedor: {
        id: datos.proveedor_id,
        nombre: datos.proveedor_nombre,
        contacto: datos.proveedor_contacto,
        email: datos.proveedor_email,
      },
      líneas: this.renderizarLíneasOC(datos.líneas || []),
      resumen: {
        subtotal: this.calcularSubtotal(datos.líneas || []),
        gastos_envío: datos.gastos_envío || 0,
        total: datos.total || this.calcularSubtotal(datos.líneas || []),
      },
      condiciones_pago: datos.condiciones_pago || "Neto 30 días",
      forma_pago: datos.forma_pago || "Transferencia bancaria",
      moneda: "EUR",
      estado: "emitida",
    };
  }

  validar(datos: any): { válido: boolean; errores?: string[] } {
    const errores: string[] = [];

    if (!datos.proveedor_id) errores.push("Proveedor requerido");
    if (!datos.líneas || datos.líneas.length === 0) errores.push("OC debe tener líneas");

    const result: { válido: boolean; errores?: string[] } = {
      válido: errores.length === 0,
    };
    if (errores.length > 0) {
      result.errores = errores;
    }
    return result;
  }

  private renderizarLíneasOC(líneas: any[]): any[] {
    return líneas.map((línea, idx) => ({
      número: idx + 1,
      código_producto: línea.producto_id,
      descripción: línea.descripción,
      cantidad: línea.cantidad,
      precio_unitario: línea.precio_unitario,
      subtotal: línea.cantidad * línea.precio_unitario,
    }));
  }

  private calcularSubtotal(líneas: any[]): number {
    return (líneas || []).reduce((acc, línea) => acc + (línea.cantidad * línea.precio_unitario || 0), 0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANTILLA: CONTRATO
// ═══════════════════════════════════════════════════════════════════════════════

export class PlantillaContrato implements PlantillaDocumento {
  readonly tipo = "contrato";
  readonly versión = "1.0";

  renderizar(datos: any): Record<string, any> {
    return {
      id_documento: randomUUID(),
      tipo: this.tipo,
      versión: this.versión,
      número_contrato: `CTR-${randomUUID().substring(0, 8)}`,
      fecha_firma: new Date().toISOString(),
      fecha_vigencia_desde: datos.fecha_inicio || new Date().toISOString(),
      fecha_vigencia_hasta: this.calcularFechaVencimiento(new Date(), datos.meses_vigencia || 12),
      parte_a: {
        nombre: "Empresa XYZ SL",
        representante: datos.representante_empresa || "Director General",
      },
      parte_b: {
        id: datos.cliente_id,
        nombre: datos.cliente_nombre,
        representante: datos.representante_cliente,
      },
      objeto_contrato: datos.objeto || "Prestación de servicios",
      alcance_servicios: datos.alcance || "Según propuesta adjunta",
      precio: {
        monto: datos.precio_mensual || datos.total,
        moneda: "EUR",
        periodicidad: datos.periodicidad || "mensual",
      },
      términos_cancelación: this.obtenerTerminosCancelación(),
      condiciones_generales: this.obtenerCondicionesGenerales(),
      estado: "activo",
    };
  }

  validar(datos: any): { válido: boolean; errores?: string[] } {
    const errores: string[] = [];

    if (!datos.cliente_id) errores.push("Cliente requerido");
    if (!datos.objeto) errores.push("Objeto del contrato requerido");
    if (!datos.precio_mensual && !datos.total) errores.push("Precio requerido");

    const result: { válido: boolean; errores?: string[] } = {
      válido: errores.length === 0,
    };
    if (errores.length > 0) {
      result.errores = errores;
    }
    return result;
  }

  private calcularFechaVencimiento(fecha: Date, meses: number): string {
    const vencimiento = new Date(fecha);
    vencimiento.setMonth(vencimiento.getMonth() + meses);
    const partes = vencimiento.toISOString().split("T");
    return partes[0] || "";
  }

  private obtenerTerminosCancelación(): string {
    return "Cualquiera de las partes puede cancelar el contrato con 30 días de preaviso.";
  }

  private obtenerCondicionesGenerales(): string {
    return "El contrato se rige por las leyes españolas. Cualquier disputa será resuelta en los juzgados de Madrid.";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY DE PLANTILLAS
// ═══════════════════════════════════════════════════════════════════════════════

export class FactoryPlantillas {
  private plantillas: Map<string, PlantillaDocumento> = new Map();

  constructor() {
    this.plantillas.set("orden", new PlantillaOrdenVenta());
    this.plantillas.set("factura", new PlantillaFactura());
    this.plantillas.set("remisión", new PlantillaRemisión());
    this.plantillas.set("recibo", new PlantillaRecibo());
    this.plantillas.set("nota_crédito", new PlantillaNotaCrédito());
    this.plantillas.set("contrato", new PlantillaContrato());
  }

  obtenerPlantilla(tipo: string): PlantillaDocumento | undefined {
    return this.plantillas.get(tipo);
  }

  renderizar(tipo: string, datos: any): Record<string, any> | null {
    const plantilla = this.obtenerPlantilla(tipo);
    if (!plantilla) return null;
    return plantilla.renderizar(datos);
  }

  validar(tipo: string, datos: any): { válido: boolean; errores?: string[] } {
    const plantilla = this.obtenerPlantilla(tipo);
    if (!plantilla) return { válido: false, errores: ["Plantilla no encontrada"] };
    return plantilla.validar(datos);
  }
}
