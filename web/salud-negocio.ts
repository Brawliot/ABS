/**
 * Salud y monitoreo del negocio: métricas en tiempo real.
 * Endpoint: GET /negocio/salud (autenticado)
 * Devuelve: expedientes, ingresos, cobros, deuda, clientes, stock, tareas, alertas.
 */

import type { AppRuntime } from "./runtime.js";

export interface AlertaNegocio {
  readonly nivel: "rojo" | "amarillo" | "verde";
  readonly titulo: string;
  readonly descripcion: string;
}

export interface SaludNegocio {
  readonly timestamp: string;
  readonly expedientes: {
    readonly creados: number;
    readonly cerrados: number;
    readonly pendientes: number;
  };
  readonly dinero: {
    readonly ingresosHoy: number;
    readonly cobrosHoy: number;
    readonly deudaPendiente: number;
  };
  readonly clientes: {
    readonly activos: number;
    readonly bloqueados: number;
  };
  readonly stock: {
    readonly bajo: number;
    readonly agotado: number;
  };
  readonly tareas: {
    readonly pendientes: number;
    readonly vencidas: number;
  };
  readonly alertas: readonly AlertaNegocio[];
}

export function calcularSaludNegocio(runtime: AppRuntime, hoy: string): SaludNegocio {
  const expedientes = runtime.expedientesDinero();
  const tareas = runtime.tareasVencidasHoy();

  const expedientesHoy = expedientes.filter((e) => e.fecha.startsWith(hoy));
  const expedientesCerrados = expedientes.filter((e) => e.estadoId.startsWith("terminal"));
  const expedientesPendientes = expedientes.filter((e) => !e.estadoId.startsWith("terminal"));

  const ingresosHoy = expedientesHoy.reduce((s, e) => {
    if (e.situacion === "liquidado") return s + e.totalCentimos;
    return s;
  }, 0);

  const cobrosHoy = expedientesHoy.filter((e) => e.situacion === "liquidado").length;

  const deudaPendiente = expedientes
    .filter((e) => e.situacion === "pendiente")
    .reduce((s, e) => s + e.totalCentimos, 0);

  const clientesUnicos = new Set(expedientes.map((e) => e.parteId));
  const clientesBloqueados = new Set(
    expedientes
      .filter((e) => {
        const deuda = expedientes
          .filter((ex) => ex.parteId === e.parteId && ex.situacion === "pendiente")
          .reduce((s, ex) => s + ex.totalCentimos, 0);
        const limite = runtime.creditoCliente.obtenerLimite(runtime.tenantId, e.parteId);
        return limite > 0 && deuda > limite;
      })
      .map((e) => e.parteId),
  );

  let stockBajo = 0;
  let stockAgotado = 0;

  const alertas: AlertaNegocio[] = [];

  if (stockAgotado > 0) {
    alertas.push({
      nivel: "rojo",
      titulo: "Stock agotado",
      descripcion: `${stockAgotado} producto(s) sin existencias`,
    });
  }

  if (stockBajo > 0) {
    alertas.push({
      nivel: "amarillo",
      titulo: "Stock bajo",
      descripcion: `${stockBajo} producto(s) por debajo del mínimo`,
    });
  }

  if (clientesBloqueados.size > 0) {
    alertas.push({
      nivel: "rojo",
      titulo: "Clientes bloqueados",
      descripcion: `${clientesBloqueados.size} cliente(s) ha superado su límite de crédito`,
    });
  }

  if (tareas.length > 0) {
    alertas.push({
      nivel: "amarillo",
      titulo: "Tareas pendientes",
      descripcion: `${tareas.length} tarea(s) vencida(s) hoy`,
    });
  }

  if (deudaPendiente > 0) {
    const deudaFormato = Math.round(deudaPendiente / 100);
    if (deudaFormato > 100000) {
      alertas.push({
        nivel: "rojo",
        titulo: "Deuda elevada",
        descripcion: `Deuda pendiente: ${deudaFormato.toLocaleString("es-ES")} €`,
      });
    }
  }

  if (alertas.length === 0) {
    alertas.push({
      nivel: "verde",
      titulo: "Todo en orden",
      descripcion: "No hay alertas",
    });
  }

  return {
    timestamp: new Date().toISOString(),
    expedientes: {
      creados: expedientesHoy.length,
      cerrados: expedientesCerrados.length,
      pendientes: expedientesPendientes.length,
    },
    dinero: {
      ingresosHoy: Math.round(ingresosHoy / 100),
      cobrosHoy,
      deudaPendiente: Math.round(deudaPendiente / 100),
    },
    clientes: {
      activos: clientesUnicos.size,
      bloqueados: clientesBloqueados.size,
    },
    stock: {
      bajo: stockBajo,
      agotado: stockAgotado,
    },
    tareas: {
      pendientes: tareas.length,
      vencidas: tareas.length,
    },
    alertas,
  };
}
