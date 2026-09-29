/**
 * tpl.aviso_plazo → Insight de alerta N días antes del vencimiento.
 * No bloquea transiciones; se prioriza vía Priorizador (tope de interrupciones).
 */

import type { Insight } from "../insight.js";
import type { PolicyTemplateInvocation } from "./types.js";
import { prioritizeInsights } from "../../prioritizer/prioritize.js";
import type { PrioritizeResult } from "../../prioritizer/types.js";
import { PolicyTemplateError } from "./compile.js";

export interface AvisoPlazoContext {
  readonly tenantId: string;
  readonly subjectId: string;
  /** Instantánea ISO del vencimiento / plazo. */
  readonly deadlineAt: string;
  /** Ahora ISO. */
  readonly now: string;
  /** Roles del responsable (p. ej. gerente / gestoría). */
  readonly responsibleRoles: readonly string[];
  readonly interruptsAlreadyToday?: number;
}

function diasAntesOf(inv: PolicyTemplateInvocation): number {
  const v = inv.parametros.dias_antes;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && Number.isFinite(Number(v)) && Number(v) > 0) {
    return Number(v);
  }
  throw new PolicyTemplateError("tpl.aviso_plazo: falta dias_antes > 0");
}

/**
 * Construye un Insight de alerta si estamos dentro de la ventana
 * [deadline − N días, deadline]. Fuera de ventana → null (sin aviso).
 */
export function buildAvisoPlazoInsight(
  inv: PolicyTemplateInvocation,
  ctx: AvisoPlazoContext,
): Insight | null {
  if (inv.plantilla !== "tpl.aviso_plazo") {
    throw new PolicyTemplateError(
      `buildAvisoPlazoInsight exige tpl.aviso_plazo; recibido ${inv.plantilla}`,
    );
  }
  const diasAntes = diasAntesOf(inv);
  const deadlineMs = Date.parse(ctx.deadlineAt);
  const nowMs = Date.parse(ctx.now);
  if (Number.isNaN(deadlineMs) || Number.isNaN(nowMs)) {
    throw new PolicyTemplateError("tpl.aviso_plazo: fechas inválidas");
  }
  const windowMs = diasAntes * 24 * 60 * 60 * 1000;
  const windowStart = deadlineMs - windowMs;
  if (nowMs < windowStart || nowMs > deadlineMs) {
    return null;
  }
  const daysLeft = Math.max(
    0,
    Math.ceil((deadlineMs - nowMs) / (24 * 60 * 60 * 1000)),
  );
  return {
    id: `aviso-plazo:${inv.id}:${ctx.subjectId}`,
    type: "alerta",
    subject: {
      kind: "transaccion",
      id: ctx.subjectId,
      tenantId: ctx.tenantId,
    },
    title: `Plazo cercano (${daysLeft} día${daysLeft === 1 ? "" : "s"})`,
    summary: `Quedan ${daysLeft} día(s) para el vencimiento. Revisar el expediente antes del plazo.`,
    baseFacts: [
      {
        id: "deadline",
        label: "Vencimiento",
        value: ctx.deadlineAt,
        fieldKey: "operativo.plazo",
      },
      {
        id: "dias_antes",
        label: "Aviso configurado (días)",
        value: diasAntes,
      },
      {
        id: "dias_restantes",
        label: "Días restantes",
        value: daysLeft,
      },
    ],
    confidence: 1,
    generatedAt: ctx.now,
    expiresAt: ctx.deadlineAt,
    estimatedImpact: daysLeft <= 3 ? 1 : 0.6,
    complianceDerived: true,
  };
}

/** Emite el aviso y lo prioriza respetando el tope de interrupciones. */
export function prioritizeAvisoPlazo(
  inv: PolicyTemplateInvocation,
  ctx: AvisoPlazoContext,
): {
  readonly insight: Insight | null;
  readonly prioritized: PrioritizeResult | null;
} {
  const insight = buildAvisoPlazoInsight(inv, ctx);
  if (!insight) return { insight: null, prioritized: null };
  const prioritized = prioritizeInsights({
    insights: [insight],
    roles: ctx.responsibleRoles,
    now: ctx.now,
    ...(ctx.interruptsAlreadyToday !== undefined
      ? { interruptsAlreadyToday: ctx.interruptsAlreadyToday }
      : {}),
  });
  return { insight, prioritized };
}
