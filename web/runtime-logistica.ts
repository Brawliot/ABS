/**
 * Runtime Logística: Gestión de envíos y seguimiento
 * Métodos delegados desde AppRuntime
 */

import type { AppRuntime } from "./runtime.js";

export interface LogisticaRuntimeFunctions {
  crearEnvio(expedienteId: string): void;
  actualizarEnvio(
    expedienteId: string,
    estado: "preparado" | "enviado" | "en_transito" | "entregado" | "devuelto",
    proveedorLogistica?: string,
    numeroSeguimiento?: string,
  ): void;
  marcarEntregado(expedienteId: string, firmaEntrega?: string): void;
  obtenerEnvio(expedienteId: string): any;
  historialEnvio(expedienteId: string): readonly any[];
  pendientesDeEnviar(): readonly any[];
}

export function createLogisticaFunctions(runtime: AppRuntime): LogisticaRuntimeFunctions {
  return {
    crearEnvio(expedienteId: string): void {
      runtime.logistica.crearEnvio(runtime.tenantId, expedienteId, "preparado");
    },

    actualizarEnvio(
      expedienteId: string,
      estado: "preparado" | "enviado" | "en_transito" | "entregado" | "devuelto",
      proveedorLogistica?: string,
      numeroSeguimiento?: string,
    ): void {
      runtime.logistica.actualizarEnvio(runtime.tenantId, expedienteId, estado, proveedorLogistica, numeroSeguimiento);
    },

    marcarEntregado(expedienteId: string, firmaEntrega?: string): void {
      runtime.logistica.marcarEntregado(runtime.tenantId, expedienteId, firmaEntrega);
    },

    obtenerEnvio(expedienteId: string): any {
      return runtime.logistica.obtenerUltimo(runtime.tenantId, expedienteId);
    },

    historialEnvio(expedienteId: string): readonly any[] {
      return runtime.logistica.historialEnvio(runtime.tenantId, expedienteId);
    },

    pendientesDeEnviar(): readonly any[] {
      return runtime.logistica.pendientesDeEnviar(runtime.tenantId);
    },
  };
}
