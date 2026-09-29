/**
 * Simulador de intención para evaluación del harness (NO es un LLM real).
 * Más rico que el heurístico (importes, desambiguación de Partes).
 * Etiquetar siempre como origin/provider = eval_simulator.
 */

import type { ExtractContext, TextExtract } from "./types.js";
import { HeuristicInterpreterExtractor } from "./text-extractor.js";
import type { InterpreterIntentLlm } from "./intent-schema.js";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Proxy de LLM para medir el pipeline de evaluación con corpus sintético
 * cuando no hay OPENAI_API_KEY. No sustituye evaluación real.
 */
export function simulateInterpreterIntent(
  text: string,
  context: ExtractContext,
): InterpreterIntentLlm {
  const t = norm(text);
  const allowed = new Set(context.allowedTransitionIds);
  const dir = context.parteDirectory ?? [];

  // Ambigüedad de apellido (varias Partes con token compartido; comparar sin acentos)
  const garciaHits = dir.filter((p) => /garcia/.test(norm(p.label)));
  if (
    /garcia/.test(t) &&
    garciaHits.length >= 2 &&
    !/(perez|lopez)/.test(t)
  ) {
    return {
      confidence: 0.55,
      transitionId: null,
      intentLabel: "cobro_parcial",
      evidenceKind: "aceptacion",
      evidencePendingValidation: false,
      ambiguous: true,
      clarificationQuestion: `¿${garciaHits.map((g) => g.label).join(" o ")}?`,
      parteRefs: garciaHits.map((g) => g.ref),
      amounts: extractAmounts(text),
      dates: extractDates(text),
      fields: { pago_confirmado: false },
      candidates: pickCandidates(allowed, ["t_cerrar", "t_amortizar"]),
    };
  }

  const amounts = extractAmounts(text);
  const dates = extractDates(text);
  const parteRefs = matchPartes(text, dir);

  if (/(cancel|anul|no\s+quiero|desist)/.test(t)) {
    const tid = pick(allowed, [
      "t_cancelar_aceptada",
      "t_cancelar_propuesta",
      "t_cancelar",
    ]);
    return {
      confidence: tid ? 0.9 : 0.5,
      transitionId: tid,
      intentLabel: "cancelacion",
      evidenceKind: "aceptacion",
      evidencePendingValidation: false,
      ambiguous: !tid,
      clarificationQuestion: tid
        ? null
        : "La cancelación no está disponible ahora. ¿Qué otra acción quieres?",
      parteRefs,
      amounts,
      dates,
      fields: {},
      candidates: pickCandidates(allowed, [
        "t_cancelar_aceptada",
        "t_cancelar_propuesta",
      ]),
    };
  }

  if (
    /(acepto|aceptamos|aceptacion|de acuerdo|firmo|adelante con el pedido|confirmamos aceptacion)/.test(
      t,
    )
  ) {
    const tid = pick(allowed, ["t_aceptar", "t_aceptar_nueva_version"]);
    return {
      confidence: tid ? 0.92 : 0.5,
      transitionId: tid,
      intentLabel: "aceptacion",
      evidenceKind: "aceptacion",
      evidencePendingValidation: false,
      ambiguous: !tid,
      clarificationQuestion: tid
        ? null
        : "¿Quieres aceptar? No hay transición de aceptación disponible.",
      parteRefs,
      amounts,
      dates,
      fields: {},
      candidates: pickCandidates(allowed, ["t_aceptar"]),
    };
  }

  if (
    /(cobrad|cobre|efectivo|resto|parcial|entrada)/i.test(t) &&
    amounts.length > 0
  ) {
    const tid = pick(allowed, ["t_cerrar", "t_amortizar", "t_aceptar"]);
    return {
      confidence: tid ? 0.9 : 0.5,
      transitionId: tid,
      intentLabel: "cobro_parcial",
      evidenceKind: "fisica",
      evidenceReferenceType: "efectivo",
      evidencePendingValidation: true,
      ambiguous: !tid,
      clarificationQuestion: tid
        ? null
        : "¿Qué transición de cobro quieres registrar?",
      parteRefs,
      amounts,
      dates,
      fields: {
        pago_confirmado: false,
        importe_parcial: amounts[0]?.amount,
      },
      candidates: pickCandidates(allowed, ["t_cerrar", "t_amortizar"]),
    };
  }

  // Delegar en heurístico de dominio y enriquecer
  const h = new HeuristicInterpreterExtractor().extract(text, context);
  return {
    confidence: h.confidence,
    transitionId: h.transitionId,
    intentLabel: h.intentLabel,
    evidenceKind: h.evidenceKind,
    ...(h.evidenceReferenceType
      ? { evidenceReferenceType: h.evidenceReferenceType }
      : {}),
    evidencePendingValidation: h.evidencePendingValidation,
    ambiguous: Boolean(h.confirmationQuestion) || !h.transitionId,
    clarificationQuestion: h.confirmationQuestion ?? null,
    parteRefs,
    amounts: amounts.length ? amounts : [],
    dates,
    fields: { ...h.fields },
    candidates: (h.candidates ?? []).map((c) => ({
      transitionId: c.transitionId,
      label: c.label,
      confidence: c.confidence,
    })),
  };
}

function extractAmounts(text: string): {
  amount: number;
  currency: string;
  label?: string;
}[] {
  const out: { amount: number; currency: string; label?: string }[] = [];
  const re =
    /(\d+(?:[.,]\d+)?)\s*(?:€|eur|euros)?|(?:€|eur)\s*(\d+(?:[.,]\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = (m[1] ?? m[2] ?? "").replace(",", ".");
    const amount = Number(raw);
    if (Number.isFinite(amount)) {
      out.push({ amount, currency: "EUR" });
    }
  }
  return out;
}

function extractDates(text: string): { raw: string; role?: string }[] {
  const out: { raw: string; role?: string }[] = [];
  if (/mes\s+que\s+viene|el\s+mes\s+próximo/i.test(text)) {
    out.push({ raw: "mes que viene", role: "resto_pago" });
  }
  if (/mañana|hoy|ayer/i.test(text)) {
    const raw = text.match(/mañana|hoy|ayer/i)?.[0] ?? "fecha";
    out.push({ raw });
  }
  return out;
}

function matchPartes(
  text: string,
  dir: readonly { ref: string; label: string }[],
): string[] {
  const nt = norm(text);
  const hits: string[] = [];
  for (const p of dir) {
    const nl = norm(p.label);
    const last = nl.split(/\s+/).pop() ?? nl;
    if (
      (last.length >= 3 && nt.includes(last)) ||
      (nl.length >= 3 && nt.includes(nl))
    ) {
      hits.push(p.ref);
    }
  }
  return hits;
}

function pick(
  allowed: ReadonlySet<string>,
  preferred: readonly string[],
): string | null {
  for (const id of preferred) {
    if (allowed.has(id)) return id;
  }
  return null;
}

function pickCandidates(
  allowed: ReadonlySet<string>,
  preferred: readonly string[],
): { transitionId: string; label: string; confidence: number }[] {
  return preferred
    .filter((id) => allowed.has(id))
    .map((id) => ({ transitionId: id, label: id, confidence: 0.5 }));
}

export function simulateInterpreterIntentJson(
  text: string,
  context: ExtractContext,
): string {
  return JSON.stringify(simulateInterpreterIntent(text, context));
}

/** Adaptador LLM que usa el simulador (solo evaluación / CI). */
export function createEvalSimulatorResponder(
  getContext: () => ExtractContext,
): (req: { user: string }) => string {
  return (req) => {
    let message = req.user;
    try {
      const parsed = JSON.parse(req.user) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      /* user ya es texto */
    }
    return simulateInterpreterIntentJson(message, getContext());
  };
}
