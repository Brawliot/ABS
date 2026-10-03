/**
 * API REST para terceros: autenticación con token Bearer.
 * Rutas: GET /api/v1/...
 * - Públicas: POST /api/v1/webhook/evento
 * - Autenticadas: GET /api/v1/expedientes, GET /api/v1/expediente/<id>, etc.
 * - Rate limit: 100 requests/minuto por token
 */

import type { AppRuntime } from "./runtime.js";
import type { IncomingMessage } from "node:http";

export interface ApiToken {
  readonly token: string;
  readonly createdAt: string;
  readonly lastUsedAt?: string;
  readonly requestCount: number;
}

export interface ApiResponse<T = unknown> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly message?: string;
}

const API_TOKENS_DEV: Map<string, ApiToken> = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minuto
const RATE_LIMIT_MAX = 100;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function generarToken(): string {
  return `token_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function crearToken(): ApiToken {
  const token = generarToken();
  const now = new Date().toISOString();
  const apiToken: ApiToken = {
    token,
    createdAt: now,
    requestCount: 0,
  };
  API_TOKENS_DEV.set(token, apiToken);
  return apiToken;
}

export function verificarToken(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return undefined;
  }
  return auth.slice("Bearer ".length);
}

export function verificarRateLimit(token: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(token);

  if (!record || record.resetAt < now) {
    requestCounts.set(token, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

export function buscarExpedientes(
  runtime: AppRuntime,
  filters?: { estado?: string; cliente?: string },
): { ok: boolean; data?: unknown[]; error?: string } {
  filters = filters ?? {};
  try {
    let exp = runtime.expedientesDinero();

    if (filters.estado) {
      exp = exp.filter((e) => e.estadoId === filters.estado);
    }

    if (filters.cliente) {
      exp = exp.filter((e) => e.parteId === filters.cliente);
    }

    const data = exp.map((e) => ({
      id: e.id,
      label: e.label,
      estado: e.estadoId,
      cliente: e.parteId,
      importe: e.totalCentimos / 100,
      fecha: e.fecha,
      situacion: e.situacion,
    }));

    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export function obtenerExpediente(runtime: AppRuntime, id: string): { ok: boolean; data?: unknown; error?: string } {
  try {
    const exp = runtime.expedientesDinero().find((e) => e.id === id);
    if (!exp) {
      return { ok: false, error: "Expediente no encontrado" };
    }

    const datos = runtime.datosDe(id);
    return {
      ok: true,
      data: {
        id: exp.id,
        label: exp.label,
        estado: exp.estadoId,
        cliente: exp.parteId,
        importe: exp.totalCentimos / 100,
        fecha: exp.fecha,
        situacion: exp.situacion,
        datos: datos?.datos ?? {},
        movimientos: exp.movimientos,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export function buscarClientes(
  runtime: AppRuntime,
  filters?: { deuda?: string },
): { ok: boolean; data?: unknown[]; error?: string } {
  filters = filters ?? {};
  try {
    const clientes = new Map<string, { nombre: string; deuda: number }>();
    for (const e of runtime.expedientesDinero()) {
      if (!clientes.has(e.parteId)) {
        clientes.set(e.parteId, { nombre: e.label.split("#")[0]?.trim() ?? "—", deuda: 0 });
      }
      if (e.situacion === "pendiente") {
        const c = clientes.get(e.parteId);
        if (c) c.deuda += e.totalCentimos / 100;
      }
    }

    let data = Array.from(clientes).map(([id, c]) => ({
      id,
      nombre: c.nombre,
      deuda: c.deuda,
    }));

    if (filters.deuda) {
      const [min, max] = filters.deuda.split("-").map(Number);
      data = data.filter((c) => {
        if (min !== undefined && c.deuda < min) return false;
        if (max !== undefined && c.deuda > max) return false;
        return true;
      });
    }

    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export function buscarFacturas(
  runtime: AppRuntime,
  filters?: { serie?: string; desde?: string; hasta?: string },
): { ok: boolean; data?: unknown[]; error?: string } {
  try {
    const flt = filters ?? {};
    let facturas = runtime.facturas.list(runtime.tenantId);

    if (flt.serie) {
      facturas = facturas.filter((f) => f.serie === flt.serie);
    }

    if (flt.desde) {
      facturas = facturas.filter((f) => f.fechaExpedicion >= flt.desde!);
    }

    if (flt.hasta) {
      facturas = facturas.filter((f) => f.fechaExpedicion <= flt.hasta!);
    }

    const data = facturas.map((f) => ({
      id: f.id,
      serie: f.serie,
      numero: f.numero,
      codigo: f.codigo,
      fecha: f.fechaExpedicion,
      cliente: f.parteId,
      base: f.base / 100,
      iva: f.iva / 100,
      total: f.total / 100,
    }));

    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}
