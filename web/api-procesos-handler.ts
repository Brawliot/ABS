/**
 * Handler API para MotorGeneradorProcesos
 * @deprecated: Este handler es de Fase 5 y usa interfaz diferente a Capa 0.2
 * Los endpoints de Capa 0 están en query-handler.ts
 */

import type { AppRuntime } from "./runtime.js";
import type { IncomingMessage } from "node:http";

export async function handleApiProcesos(
  runtime: AppRuntime,
  req: IncomingMessage,
  path: string,
  method: string,
  readBodyFn: () => Promise<string>,
): Promise<{ status: number; body: string; contentType: string }> {
  // Este handler es de Fase 5 y está en desarrollo
  // Todos los endpoints retornan 501 Not Implemented
  // Los endpoints de Capa 0 están en query-handler.ts
  return {
    status: 501,
    body: JSON.stringify({
      error: "Endpoints de Fase 5 no implementados aún",
      info: "Use los endpoints de Capa 0: /api/transacciones/{id}/documentos, /calculos, /notificaciones, /audits",
    }),
    contentType: "application/json; charset=utf-8",
  };
}
