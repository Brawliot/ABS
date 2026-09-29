/**
 * Mensajes de error a partir de la traza del Juez (plantillas + hechos).
 */

import type { JudgeTrace } from "../../policies/judge.js";
import { fillAndLocalize } from "./fill.js";
import type { CopyTemplate, InterfaceCopyPack } from "./types.js";
import { CopyFillError } from "./types.js";

function rejectedGuard(trace: JudgeTrace) {
  return [...trace.guardsEvaluated]
    .reverse()
    .find((g) => g.result === "rejected");
}

/**
 * Extrae hechos numéricos de la traza + contexto para rellenar plantillas.
 * Solo usa valores presentes; no inventa.
 */
export function factsFromJudgeTrace(
  trace: JudgeTrace,
  extras?: Readonly<Record<string, string | number | boolean>>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {
    ...(extras ?? {}),
  };
  out.accion = trace.transitionId;
  out.pedido = trace.subjectId;
  if (trace.appliedRuleId) out.regla_id = trace.appliedRuleId;

  if (trace.factsUsed) {
    for (const [factId, info] of Object.entries(trace.factsUsed)) {
      // factId tipo credito.disponible → credito_disponible
      const key = factId.replace(/\./g, "_");
      out[key] = info.value;
      // alias por nombre del hecho (no por el namespace "credito")
      if (/deuda|debt|saldo/i.test(factId)) out.deuda = info.value;
      if (/limite|limit/i.test(factId)) out.limite = info.value;
      if (/disponible|available/i.test(factId)) out.disponible = info.value;
    }
  }
  for (const [k, v] of Object.entries(trace.calculations)) {
    out[k.replace(/\./g, "_")] = v;
  }
  return out;
}

function pickErrorTemplate(
  pack: InterfaceCopyPack,
  trace: JudgeTrace,
): CopyTemplate {
  const rejected = rejectedGuard(trace);
  const phase = rejected?.phase ?? "";
  const reason = (rejected?.reason ?? trace.reason).toLowerCase();

  const byKey = (suffix: string) =>
    pack.templates.find(
      (t) => t.kind === "error" && t.key.includes(suffix),
    );

  if (/credito|crédito|limite|límite|deuda|importe.*gt|supera/i.test(reason) ||
      /credito|credit/i.test(phase + (rejected?.ruleId ?? ""))) {
    const t = byKey("error.credito") ?? byKey("error.credit");
    if (t) return t;
  }
  if (/aprobacion|aprobación|superior|responsable/i.test(reason)) {
    const t = byKey("error.aprobacion");
    if (t) return t;
  }
  if (/permiso|rol/i.test(reason) || phase === "permiso") {
    const t = byKey("error.permiso");
    if (t) return t;
  }
  const generic = pack.templates.find((t) => t.key === "error.generico");
  if (generic) return generic;
  const anyErr = pack.templates.find((t) => t.kind === "error");
  if (anyErr) return anyErr;
  throw new CopyFillError("Pack sin plantilla de error");
}

/**
 * Construye el mensaje de error visible: regla + hechos + qué puede hacer.
 */
export function renderJudgeErrorMessage(
  pack: InterfaceCopyPack,
  trace: JudgeTrace,
  extras?: Readonly<Record<string, string | number | boolean>>,
): string {
  const template = pickErrorTemplate(pack, trace);
  const facts = factsFromJudgeTrace(trace, extras);
  // Solo pasar variables requeridas (nada inventado)
  const vars: Record<string, string | number | boolean> = {};
  for (const name of template.requiredVariables) {
    if (!(name in facts)) {
      throw new CopyFillError(
        `Hecho faltante para plantilla ${template.key}: ${name}`,
      );
    }
    vars[name] = facts[name]!;
  }
  return fillAndLocalize(template, vars, pack.vocabulary);
}
