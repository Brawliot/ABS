/**
 * Utilidades HTTP — helpers reutilizables para peticiones/respuestas.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { securityHeaders } from "../auth/index.js";

/**
 * Extrae parámetros de query string.
 * Ejemplo: "?role=admin&parte=p1" → { role: "admin", parte: "p1" }
 */
export function parseQuery(url: string): Record<string, string> {
  const i = url.indexOf("?");
  if (i < 0) return {};
  const out: Record<string, string> = {};
  new URLSearchParams(url.slice(i + 1)).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

/**
 * Envía respuesta HTTP con headers de seguridad automáticos.
 * - Content-Type
 * - Cache-Control: no-store
 * - Security headers (CSP, X-Frame-Options, etc.)
 * - Set-Cookie (si aplica)
 */
export function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  type: string,
  headers?: Record<string, string | string[]>,
): void {
  const merged: Record<string, string | string[]> = {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...(headers ?? {}),
  };
  res.statusCode = status;
  for (const [k, v] of Object.entries(merged)) {
    if (k === "Set-Cookie" && Array.isArray(v)) {
      for (const c of v) res.appendHeader("Set-Cookie", c);
    } else if (typeof v === "string") {
      res.setHeader(k, v);
    }
  }
  res.end(body);
}

/**
 * Lee el cuerpo completo de una petición HTTP como string UTF-8.
 */
export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Convierte datos form-encoded a objeto.
 * Ejemplo: "email=user@test&pass=abc" → { email: "user@test", pass: "abc" }
 */
export function formToRecord(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  new URLSearchParams(raw).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

/**
 * Envía respuesta JSON.
 */
export function sendJson(
  res: ServerResponse,
  status: number,
  data: unknown,
  headers?: Record<string, string | string[]>,
): void {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8", headers);
}

/**
 * Envía error JSON.
 */
export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  headers?: Record<string, string | string[]>,
): void {
  sendJson(res, status, { ok: false, error: message }, headers);
}

/**
 * Envía respuesta HTML.
 */
export function sendHtml(
  res: ServerResponse,
  status: number,
  html: string,
  headers?: Record<string, string | string[]>,
): void {
  send(res, status, html, "text/html; charset=utf-8", headers);
}

/**
 * Envía plain text.
 */
export function sendText(
  res: ServerResponse,
  status: number,
  text: string,
  headers?: Record<string, string | string[]>,
): void {
  send(res, status, text, "text/plain", headers);
}

/**
 * Redirect.
 */
export function redirect(
  res: ServerResponse,
  location: string,
  status: number = 303,
): void {
  send(res, status, "", "text/plain", { Location: location });
}
