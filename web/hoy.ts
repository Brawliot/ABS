/**
 * Panel Hoy: expedientes que necesitan atención hoy.
 * GET /hoy: lista personalizada por negocio y rol.
 */

import type { IncomingMessage } from "node:http";
import type { AppRuntime } from "./runtime.js";
import type { AppBootResult } from "./types.js";
import type { Viewer } from "./maestros.js";
import { page, html, withDev, esc } from "./maestros.js";
import { montarSeccionesHoy } from "./secciones-hoy.js";

export interface HoyContext {
  readonly runtime: AppRuntime;
  readonly boot: AppBootResult;
}

export interface HoyResponse {
  readonly status: number;
  readonly body: string;
  readonly contentType: string;
}

export function isHoyPath(path: string): boolean {
  return path === "/hoy";
}

export function handleHoy(ctx: HoyContext, viewer: Viewer): HoyResponse {
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }); // YYYY-MM-DD

  const { html: contenido } = montarSeccionesHoy({
    runtime: ctx.runtime,
    boot: ctx.boot,
    viewer,
    hoy,
  });

  return html(
    200,
    page(
      { runtime: ctx.runtime, boot: ctx.boot, auth: undefined },
      viewer,
      "Hoy",
      contenido,
    ),
  );
}

export function html_response(status: number, body: string): HoyResponse {
  return { status, body, contentType: "text/html; charset=utf-8" };
}
