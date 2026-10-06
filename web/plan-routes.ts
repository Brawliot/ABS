/**
 * Rutas de API para Plan: guardar y recuperar análisis del planner
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody, sendJson } from "./http-utils.js";
import type { AppRuntime } from "./runtime.js";

export interface PlanRouteContext {
  runtime: AppRuntime;
}

/**
 * Maneja rutas de plan (/api/plan/...)
 * Retorna true si fue manejada, false si debe continuar
 */
export async function handlePlanRoute(
  path: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  ctx: PlanRouteContext
): Promise<boolean> {
  const { runtime } = ctx;

  // POST /api/plan/analysis/save
  if (path === "/api/plan/analysis/save" && method === "POST") {
    try {
      const body = await readBody(req);
      const analysis = JSON.parse(body);

      // Log departamentos from phase5
      console.log("\n========== ANÁLISIS RECIBIDO ==========");
      console.log("Timestamp:", analysis.timestamp);
      console.log("Phase1 sector:", analysis.phase1?.answers?.sector?.choice);
      console.log("Phase2 tipo:", analysis.phase2?.tipo_negocio);
      console.log("\nPHASE5 DEPARTAMENTOS:");
      if (analysis.phase5) {
        console.log("  Críticos:", analysis.phase5.departamentos_criticos?.map((d: any) => d.nombre) || []);
        console.log("  Importantes:", analysis.phase5.departamentos_importantes?.map((d: any) => d.nombre) || []);
        console.log("  Secundarios:", analysis.phase5.departamentos_secundarios?.map((d: any) => d.nombre) || []);
        console.log("  Total de departamentos:",
          (analysis.phase5.departamentos_criticos?.length || 0) +
          (analysis.phase5.departamentos_importantes?.length || 0) +
          (analysis.phase5.departamentos_secundarios?.length || 0)
        );
      } else {
        console.log("  ⚠️  PHASE5 NO EXISTE");
      }
      console.log("=====================================\n");

      const id = runtime.savePlannerAnalysis(analysis);
      sendJson(res, 200, { id });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Error saving plan analysis:", msg);
      sendJson(res, 500, { error: msg });
      return true;
    }
  }

  // GET /api/plan/analysis/:id
  const match = path.match(/^\/api\/plan\/analysis\/([a-f0-9-]+)$/);
  if (match && method === "GET") {
    try {
      const id = match[1];
      const analysis = runtime.getPlannerAnalysis(id);
      if (!analysis) {
        sendJson(res, 404, { error: "Analysis not found" });
        return true;
      }
      sendJson(res, 200, analysis);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Error getting plan analysis:", msg);
      sendJson(res, 500, { error: msg });
      return true;
    }
  }

  return false;
}
