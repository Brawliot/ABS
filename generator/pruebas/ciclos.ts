/**
 * Pruebas para ciclos completos: verifican que cada proceso llega al final.
 */

import { probarCiclos } from "../../web/probar-ciclo.js";
import type { ContextoPrueba, ResultadoPrueba } from "../checklist.js";

export async function probarCicloCompleto(
  ctx: ContextoPrueba,
  lifecycleId: string,
): Promise<ResultadoPrueba> {
  const resultados = await probarCiclos(ctx.boot, ctx.runtime);
  const r = resultados.find((x) => x.lifecycleId === lifecycleId);

  if (!r) {
    return { ok: false, detalle: "Ciclo no encontrado" };
  }

  if (r.paradoEn === "OK") {
    return { ok: true, detalle: "Ciclo completo llega al final" };
  }

  return {
    ok: false,
    detalle: `Se para en «${ctx.runtime.etiquetas.accion(lifecycleId, r.paradoEn)}»: ${r.motivo ?? ""}`,
  };
}
