/**
 * Triggers predefinidos para casos de uso comunes.
 */

export const TRIGGER_FACTURA_AUTOMATICA = {
  nombre: "Factura automática en venta completada",
  condicion: "estado = 'completado'",
  accion: "facturar" as const,
};

export const TRIGGER_NOTIF_PAGO_RETRASADO = {
  nombre: "Notificar pago retrasado",
  condicion: "estado = 'vencido'",
  accion: "notificar" as const,
};

export const TRIGGER_STOCK_BAJO = {
  nombre: "Alerta stock bajo",
  condicion: "stock = 'critico'",
  accion: "notificar" as const,
};

export const TRIGGER_REPORTE_CIERRE = {
  nombre: "Reporte automático al cerrar expediente",
  condicion: "estado = 'cerrado'",
  accion: "exportar_reporte" as const,
};

export const TRIGGER_COBRO_AUTOMATICO = {
  nombre: "Cobro automático en fecha de vencimiento",
  condicion: "estado = 'vencido'",
  accion: "cobrar" as const,
};
