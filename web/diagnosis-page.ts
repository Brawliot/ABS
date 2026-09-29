/**
 * Página de diagnóstico: negocio que no encaja → cercanos + preguntas.
 */

import {
  classifyFromAnswers,
  NoArchetypeMatchError,
} from "../diagnosis/classifier.js";
import type {
  DiagnosisQuestionId,
  ExtractedAnswer,
} from "../diagnosis/questions.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ans(
  questionId: DiagnosisQuestionId,
  value: boolean | string,
): ExtractedAnswer {
  return { questionId, value, confidence: 0.92 };
}

/** Respuestas que provocan NoArchetypeMatchError (ruptura audit #7). */
export function noMatchAnswers(): readonly ExtractedAnswer[] {
  return [
    ans("cliente_se_queda", false),
    ans("debe_volver", false),
    ans("pago_periodico_acceso", false),
    ans("se_produce_despues", false),
    ans("tercero_conecta", false),
    ans("dinero_o_cobertura", false),
    ans("linea_mas_ingresos", "venta"),
  ];
}

export function runDiagnosis(
  answers: readonly ExtractedAnswer[],
): {
  readonly ok: boolean;
  readonly htmlBody: string;
  readonly nearestCount: number;
  readonly questionsCount: number;
} {
  try {
    const r = classifyFromAnswers(answers);
    return {
      ok: true,
      nearestCount: 0,
      questionsCount: 0,
      htmlBody:
        `<p data-diagnosis-ok="1">Clasificado como <strong>${esc(r.composition.dominant)}</strong>.</p>`,
    };
  } catch (err) {
    if (err instanceof NoArchetypeMatchError) {
      const nearest = err.nearest
        .map(
          (n) =>
            `<li data-nearest="${esc(n.archetypeId)}">${esc(n.archetypeId)} (score ${n.score.toFixed(2)})</li>`,
        )
        .join("");
      const qs = err.distinguishingQuestions
        .map(
          (q) =>
            `<li data-distinguishing="${esc(q.questionId)}">${esc(q.prompt)}</li>`,
        )
        .join("");
      return {
        ok: false,
        nearestCount: err.nearest.length,
        questionsCount: err.distinguishingQuestions.length,
        htmlBody:
          `<div data-diagnosis-nomatch="1" role="alert">` +
          `<p><strong>Ningún arquetipo encaja</strong> con estas respuestas.</p>` +
          `<p>Arquetipos más cercanos:</p><ul data-nearest-list>${nearest}</ul>` +
          `<p>Preguntas para distinguir:</p><ul data-questions-list>${qs}</ul>` +
          `</div>`,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      nearestCount: 0,
      questionsCount: 0,
      htmlBody: `<p data-diagnosis-error="1">${esc(msg)}</p>`,
    };
  }
}

export function renderDiagnosisHtml(resultBody: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Diagnóstico · ABS</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 2rem; max-width: 40rem; background: linear-gradient(160deg,#f7f3ee,#e8eef5); color: #1a1a1a; }
    h1 { font-size: 1.75rem; }
    form label { display: block; margin: 0.5rem 0; }
    button { margin-top: 1rem; padding: 0.6rem 1.2rem; font: inherit; cursor: pointer; }
    [data-diagnosis-nomatch] { border: 2px solid #8b3a3a; padding: 1rem; margin-top: 1rem; background: #fff; }
  </style>
</head>
<body data-page="diagnosis">
  <h1>Diagnóstico de negocio</h1>
  <p>Indique el patrón operativo. Si no encaja en ningún arquetipo, verá los más cercanos y preguntas distintivas.</p>
  <form method="post" action="/diagnosis" data-diagnosis-form>
    <label><input type="checkbox" name="se_queda" value="1" /> El cliente se queda con el bien</label>
    <label><input type="checkbox" name="vuelve" value="1" /> El bien debe volver</label>
    <label><input type="checkbox" name="periodico" value="1" /> Pago periódico por acceso</label>
    <label><input type="checkbox" name="produce" value="1" /> Se produce después (proyecto)</label>
    <label><input type="checkbox" name="tercero" value="1" /> Un tercero conecta partes</label>
    <label><input type="checkbox" name="dinero" value="1" /> Dinero o cobertura</label>
    <label>Línea de ingresos <input name="linea" value="venta" /></label>
    <input type="hidden" name="nomatch_demo" value="" data-nomatch-flag />
    <button type="submit">Clasificar</button>
    <button type="submit" name="force_nomatch" value="1" data-force-nomatch>Probar «no encaja»</button>
  </form>
  ${resultBody}
</body>
</html>`;
}

export function answersFromForm(
  form: Record<string, string>,
): readonly ExtractedAnswer[] {
  if (form.force_nomatch === "1" || form.nomatch_demo === "1") {
    return noMatchAnswers();
  }
  return [
    ans("cliente_se_queda", form.se_queda === "1"),
    ans("debe_volver", form.vuelve === "1"),
    ans("pago_periodico_acceso", form.periodico === "1"),
    ans("se_produce_despues", form.produce === "1"),
    ans("tercero_conecta", form.tercero === "1"),
    ans("dinero_o_cobertura", form.dinero === "1"),
    ans("linea_mas_ingresos", form.linea || "venta"),
  ];
}
