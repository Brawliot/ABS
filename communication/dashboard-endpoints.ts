/**
 * Endpoints REST para el dashboard de notificaciones.
 * GET /notificaciones - lista con filtros
 * GET /notificaciones/estadísticas - resumen del día
 * POST /notificaciones/:id/reintentar - reintentar una fallida
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ColaNotificaciones } from "./notification-queue.js";
import type { SqliteNotificacionesEnviosStore } from "../adapters/sqlite-notificaciones-envios-store.js";

export interface ParámetrosFiltro {
  estado?: "pendiente" | "enviado" | "fallido";
  canal?: string;
  evento?: string;
  limite?: number;
  offset?: number;
}

export interface VistaNotificación {
  id: string;
  evento: string;
  canal: string;
  destinatario: string;
  plantilla: string;
  estado: "pendiente" | "enviado" | "fallido";
  intentos: number;
  error?: string;
  timestamp: string;
}

export interface EstadísticasNotificaciones {
  hoy: {
    pendientes: number;
    enviadas: number;
    fallidas: number;
    total: number;
  };
  porCanal: Record<string, { enviadas: number; fallidas: number; pendientes: number }>;
  porPlantilla: Record<string, number>;
}

export class DashboardEndpoints {
  constructor(
    private store: SqliteNotificacionesEnviosStore,
    private cola: ColaNotificaciones
  ) {}

  manejarRuta(
    req: IncomingMessage,
    res: ServerResponse,
    ruta: string,
    querystring: URLSearchParams
  ): boolean {
    if (ruta === "/notificaciones") {
      if (req.method === "GET") {
        return this.obtenerNotificaciones(res, querystring);
      }
    } else if (ruta === "/notificaciones/estadísticas") {
      if (req.method === "GET") {
        return this.obtenerEstadísticas(res);
      }
    } else if (ruta.match(/^\/notificaciones\/[^/]+\/reintentar$/)) {
      if (req.method === "POST") {
        const id = ruta.split("/")[2];
        return this.reintentarNotificación(res, id);
      }
    }
    return false;
  }

  private obtenerNotificaciones(
    res: ServerResponse,
    querystring: URLSearchParams
  ): boolean {
    try {
      const estado = querystring.get("estado") as any;
      const canal = querystring.get("canal");
      const limite = parseInt(querystring.get("limite") || "50", 10);

      let notificaciones = this.store.obtenerTodos(limite);

      if (estado) {
        notificaciones = notificaciones.filter((n) => n.estado === estado);
      }
      if (canal) {
        notificaciones = notificaciones.filter((n) => n.canal === canal);
      }

      const vistas: VistaNotificación[] = notificaciones.map((n) => ({
        id: n.id,
        evento: n.evento_id,
        canal: n.canal,
        destinatario: n.destinatario,
        plantilla: n.plantilla,
        estado: n.estado,
        intentos: n.intentos,
        error: n.error,
        timestamp: n.timestamp,
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ notificaciones: vistas }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Error desconocido",
        })
      );
      return true;
    }
  }

  private obtenerEstadísticas(res: ServerResponse): boolean {
    try {
      const stats = this.cola.obtenerEstadísticas();

      const todas = this.store.obtenerTodos(1000);

      const porCanal: Record<string, any> = {};
      const porPlantilla: Record<string, number> = {};

      for (const notif of todas) {
        if (!porCanal[notif.canal]) {
          porCanal[notif.canal] = { enviadas: 0, fallidas: 0, pendientes: 0 };
        }
        if (notif.estado === "enviado") porCanal[notif.canal].enviadas++;
        if (notif.estado === "fallido") porCanal[notif.canal].fallidas++;
        if (notif.estado === "pendiente") porCanal[notif.canal].pendientes++;

        porPlantilla[notif.plantilla] = (porPlantilla[notif.plantilla] || 0) + 1;
      }

      const estadísticas: EstadísticasNotificaciones = {
        hoy: {
          pendientes: stats.pendientes,
          enviadas: stats.enviadas,
          fallidas: stats.fallidas,
          total: stats.total,
        },
        porCanal,
        porPlantilla,
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(estadísticas));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Error desconocido",
        })
      );
      return true;
    }
  }

  private reintentarNotificación(res: ServerResponse, id: string): boolean {
    try {
      this.cola.reintentarFallida(id);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, mensaje: `Reintentando ${id}` }));
      return true;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Error desconocido",
        })
      );
      return true;
    }
  }
}
