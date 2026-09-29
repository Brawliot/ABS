/**
 * Pipeline: BusinessProfile → compositor → materialize → GeneratorInput.
 * Preguntas unificadas: confirmaciones de materialize se listan en composer.questions
 * antes de materializar; materialize no puede bloquearse por un ask no listado.
 */

import type { BusinessProfile } from "../contracts/business-profile/types.js";
import {
  validateBusinessProfile,
  materializeBusinessProfileDetailed,
  type MaterializeOptions,
  type MaterializeResult,
  BusinessProfileError,
} from "../contracts/business-profile/index.js";
import { known, isUnknown, isKnown } from "../contracts/business-profile/field.js";
import { composeBusinessProfile, type ComposeOptions } from "./compose.js";
import type { ComposerQuestion, ComposerResult, ComposerSuccess } from "./types.js";
import type { GeneratorInput } from "../generator/types.js";

export interface ComposedPipelineResult {
  readonly composer: ComposerSuccess;
  readonly materialize: MaterializeResult;
  readonly input: GeneratorInput;
}

/** Campos que materialize trata como ask (bloqueantes). */
const MATERIALIZE_ASK_FIELDS = [
  "naturalezaBienes",
  "portalCliente",
  "cobros.aCredito",
  "cobros.aPlazos",
  "cobros.cuotasRecurrentes",
  "processes",
  "channels",
  "paymentMode",
  "roles",
  "permissionFallback",
  "capabilities.hasFormalDocuments",
  "capabilities.hasFiscalCompliance",
  "capabilities.hasCalendar",
] as const;

function fieldUnknown(profile: BusinessProfile, path: string): boolean {
  switch (path) {
    case "naturalezaBienes":
      return isUnknown(profile.naturalezaBienes);
    case "portalCliente":
      return !!profile.portalCliente && isUnknown(profile.portalCliente);
    case "cobros.aCredito":
      return !!profile.cobros && isUnknown(profile.cobros.aCredito);
    case "cobros.aPlazos":
      return !!profile.cobros && isUnknown(profile.cobros.aPlazos);
    case "cobros.cuotasRecurrentes":
      return !!profile.cobros && isUnknown(profile.cobros.cuotasRecurrentes);
    case "calendar":
      return (
        isKnown(profile.capabilities.hasCalendar) &&
        profile.capabilities.hasCalendar.value === true &&
        !!profile.calendar &&
        isUnknown(profile.calendar)
      );
    default:
      return false;
  }
}

/**
 * Asegura que toda confirmación/ask de materialize esté en questions
 * antes de llamar a materialize.
 */
export function unifyComposerQuestions(
  profile: BusinessProfile,
  composed: ComposerSuccess,
): ComposerSuccess {
  const questions: ComposerQuestion[] = [...composed.questions];
  const traces = [...composed.traces];

  const ensure = (q: ComposerQuestion): void => {
    if (questions.some((x) => x.id === q.id || x.field === q.field)) return;
    questions.push(q);
    traces.push({
      elementId: q.id,
      elementKind: "question",
      field: q.field,
      ruleId: q.ruleId,
      decision: q.question,
    });
  };

  for (const path of MATERIALIZE_ASK_FIELDS) {
    if (!fieldUnknown(profile, path)) continue;
    if (questions.some((q) => q.field === path || q.field.startsWith(path))) {
      continue;
    }
    ensure({
      id: `unify.${path}`,
      field: path,
      question: `Campo "${path}" desconocido: se requiere respuesta del usuario`,
      ruleId: "R_UNIFY_ASK",
      kind: "ask",
      oracleRule: "FAIL_IF_COMPOSER_CHOOSES",
    });
  }

  if (fieldUnknown(profile, "calendar")) {
    ensure({
      id: "confirm.calendar",
      field: "calendar",
      question:
        "Confirme el horario laboral (default L-V 09:00-18:00 si no indica otro)",
      ruleId: "R_UNIFY_CALENDAR",
      kind: "confirm",
    });
  }

  if (
    profile.capacityMode &&
    isUnknown(profile.capacityMode) &&
    !questions.some((q) => q.field === "capacityMode")
  ) {
    ensure({
      id: "confirm.capacityMode",
      field: "capacityMode",
      question:
        "capacityMode desconocido: se aplicará cita_individual; confirme si usa plazas",
      ruleId: "R_UNIFY_CAPACITY",
      kind: "confirm",
    });
  }

  questions.sort((a, b) => a.id.localeCompare(b.id));

  return {
    ...composed,
    questions,
    traces,
  };
}

/**
 * Valida raw → compone → unifica preguntas → materializa.
 * Si hay asks bloqueantes sin respuesta, lanza INCOMPLETE con details = fields
 * (todos ya listados en composer.questions).
 */
export function businessProfileThroughComposer(
  raw: unknown,
  options?: MaterializeOptions & { readonly compose?: ComposeOptions },
): ComposedPipelineResult {
  const profile = validateBusinessProfile(raw);
  const composed = composeBusinessProfile(profile, options?.compose);
  if (!composed.ok) {
    throw new BusinessProfileError(
      composed.code === "INVALID_COMPOSITION" ? "CONTRADICTION" : "INCOMPLETE",
      composed.message,
      composed.details,
    );
  }
  return applyComposerToMaterialize(profile, composed, options);
}

export function applyComposerToMaterialize(
  profile: BusinessProfile,
  composed: ComposerSuccess,
  options?: MaterializeOptions,
): ComposedPipelineResult {
  const unified = unifyComposerQuestions(profile, composed);

  const blocking = unified.questions.filter(
    (q) =>
      q.kind !== "confirm" &&
      (q.oracleRule === "FAIL_IF_COMPOSER_CHOOSES" || q.kind === "ask"),
  );
  const unanswered = blocking.filter((q) => fieldUnknown(profile, q.field) ||
    (q.field.startsWith("cobros.") && fieldUnknown(profile, q.field)) ||
    (q.field === "portalCliente.autoservicio" &&
      !!profile.portalCliente &&
      isUnknown(profile.portalCliente)) ||
    (q.field === "calendar.horario" && fieldUnknown(profile, "calendar")),
  );

  // Materialize solo si no hay asks bloqueantes pendientes.
  // Las confirm ya están en la lista unificada; materialize aplicará defaults.
  if (unanswered.length > 0) {
    throw new BusinessProfileError(
      "INCOMPLETE",
      `Preguntas pendientes (listadas en compositor): ${unanswered.map((q) => q.field).join(", ")}`,
      unanswered.map((q) => q.field),
    );
  }

  const patched: BusinessProfile = {
    ...profile,
    processes: known(composed.processes),
    ...(composed.composition
      ? { composition: known(composed.composition) }
      : { composition: { status: "not_applicable" as const } }),
    ...(composed.policyTemplates.length > 0
      ? { policyTemplates: known(composed.policyTemplates) }
      : {}),
  };

  const materialize = materializeBusinessProfileDetailed(patched, options);

  // Garantía: toda confirmación de materialize debía estar prelistada
  for (const c of materialize.confirmations) {
    const covered = unified.questions.some(
      (q) =>
        q.kind === "confirm" ||
        c.toLowerCase().includes(q.field.toLowerCase().split(".").pop()!),
    );
    if (!covered && /calendar|capacity/i.test(c)) {
      throw new BusinessProfileError(
        "CONTRADICTION",
        `Materialize emitió confirmación no listada en questions: ${c}`,
        ["questions"],
      );
    }
  }

  return {
    composer: unified,
    materialize,
    input: materialize.input,
  };
}

/** Solo composición (sin materialize). */
export function composeValidatedProfile(
  profile: BusinessProfile,
  options?: ComposeOptions,
): ComposerResult {
  return composeBusinessProfile(profile, options);
}
