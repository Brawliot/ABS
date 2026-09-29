/**
 * Motor del compositor: BusinessProfile → ComposerResult.
 * Reglas = datos (COMPOSITION_RULES); evaluación determinista.
 */

import type { ArchetypeId, SecondaryBinding } from "../archetypes/types.js";
import { validateComposition } from "../archetypes/composition.js";
import { requireArchetype } from "../archetypes/catalog.js";
import { validateLifecycle } from "../core/validator.js";
import type { BusinessProfile, ProcessDecl } from "../contracts/business-profile/types.js";
import { isKnown, isUnknown, isNotApplicable } from "../contracts/business-profile/field.js";
import type { PolicyTemplateInvocation } from "../contracts/policy-templates/types.js";
import { buildHitosTemplateInvocation } from "../contracts/policy-templates/compile.js";
import {
  hitosToCommitments,
  validateHitosList,
  type HitoPagoSpec,
} from "../archetypes/milestones.js";
import { COMPOSITION_RULES, SAMPLE_PLANTILLA_TO_TPL } from "./rules.js";
import { defaultFinancieraBinding } from "./bindings.js";
import { hashComposerOutput } from "./hash.js";
import type {
  ComposerQuestion,
  ComposerResult,
  NonComposableItem,
  RuleAction,
  TraceEntry,
  VisibilityRequirement,
} from "./types.js";

interface EvalCtx {
  readonly profile: BusinessProfile;
  readonly dominant: ArchetypeId;
  readonly processArchetypes: ReadonlySet<ArchetypeId>;
  forbiddenSecondaries: Set<ArchetypeId>;
}

function fieldStatus(
  profile: BusinessProfile,
  path: string,
): "known" | "unknown" | "not_applicable" | "absent" {
  const cobros = profile.cobros;
  switch (path) {
    case "cobros.aCredito":
      return cobros ? cobros.aCredito.status : "absent";
    case "cobros.aPlazos":
      return cobros ? cobros.aPlazos.status : "absent";
    case "cobros.fianzas":
      return cobros ? cobros.fianzas.status : "absent";
    case "cobros.cuotasRecurrentes":
      return cobros ? cobros.cuotasRecurrentes.status : "absent";
    case "cobros.pagosPorHitos":
      return cobros ? cobros.pagosPorHitos.status : "absent";
    case "naturalezaBienes":
      return profile.naturalezaBienes.status;
    case "capacityMode":
      return profile.capacityMode ? profile.capacityMode.status : "absent";
    case "portalCliente":
      return profile.portalCliente ? profile.portalCliente.status : "absent";
    default:
      return "absent";
  }
}

function isCuentaParte(profile: BusinessProfile): boolean {
  const c = profile.cobros?.aCredito;
  if (!c || !isKnown(c)) return false;
  const v = c.value;
  return typeof v === "object" && v !== null && v.kind === "cuenta_parte";
}

function isTruthyPlazos(profile: BusinessProfile): boolean {
  const c = profile.cobros?.aPlazos;
  if (!c || !isKnown(c)) return false;
  const v = c.value;
  if (v === false) return false;
  if (typeof v === "object" && v !== null && v.enabled === true) return true;
  return Boolean(v);
}

function isKnownFalsePlazos(profile: BusinessProfile): boolean {
  const c = profile.cobros?.aPlazos;
  if (!c || !isKnown(c)) return false;
  return c.value === false;
}

function isACreditoBoolTrue(profile: BusinessProfile): boolean {
  const c = profile.cobros?.aCredito;
  if (!c || !isKnown(c)) return false;
  return c.value === true as unknown; // never with our types; cuenta_parte is object
}

function isRetencion(profile: BusinessProfile): boolean {
  const c = profile.cobros?.fianzas;
  if (!c || !isKnown(c)) return false;
  const v = c.value;
  return typeof v === "object" && v !== null && v.kind === "retencion";
}

function isRetencionConUmbral(profile: BusinessProfile): boolean {
  const c = profile.cobros?.fianzas;
  if (!c || !isKnown(c)) return false;
  const v = c.value;
  return (
    typeof v === "object" &&
    v !== null &&
    v.kind === "retencion" &&
    typeof (v as { umbralComensales?: number }).umbralComensales === "number"
  );
}

function isHitos(profile: BusinessProfile): boolean {
  const c = profile.cobros?.pagosPorHitos;
  if (!c || !isKnown(c)) return false;
  const v = c.value;
  return typeof v === "object" && v !== null && Array.isArray(v.hitos) && v.hitos.length > 0;
}

function evalAtom(atom: string, ctx: EvalCtx): boolean {
  if (atom === "always") return true;

  if (atom.startsWith("not:")) {
    return !evalWhen(atom.slice(4), ctx);
  }
  if (atom.startsWith("and:")) {
    const parts = atom.slice(4).split("|");
    return parts.every((p) => evalWhen(p, ctx));
  }

  if (atom.startsWith("dominant:")) {
    return ctx.dominant === atom.slice("dominant:".length);
  }
  if (atom.startsWith("paymentMode:")) {
    const mode = atom.slice("paymentMode:".length);
    return isKnown(ctx.profile.paymentMode) && ctx.profile.paymentMode.value === mode;
  }
  if (atom.startsWith("process:")) {
    const [, arch, flag] = atom.split(":");
    const present = ctx.processArchetypes.has(arch as ArchetypeId);
    return flag === "present" ? present : !present;
  }
  if (atom.startsWith("capacityMode:")) {
    const flag = atom.slice("capacityMode:".length);
    const cm = ctx.profile.capacityMode;
    if (flag === "unknown") return !cm || isUnknown(cm);
    if (flag === "plazas") return !!cm && isKnown(cm) && cm.value === "plazas";
    if (flag === "cita_individual")
      return !!cm && isKnown(cm) && cm.value === "cita_individual";
    return false;
  }
  if (atom.startsWith("channel:")) {
    const ch = atom.slice("channel:".length);
    const channels = ctx.profile.channels;
    return isKnown(channels) && channels.value.includes(ch as never);
  }
  if (atom.startsWith("calendar:")) {
    const flag = atom.slice("calendar:".length);
    const cal = ctx.profile.calendar;
    if (flag === "unknown") return !!cal && isUnknown(cal);
    if (flag === "known") return !!cal && isKnown(cal);
    return false;
  }
  if (atom.startsWith("hasCalendar:")) {
    const want = atom.slice("hasCalendar:".length) === "true";
    const hc = ctx.profile.capabilities.hasCalendar;
    return isKnown(hc) && hc.value === want;
  }
  if (atom.startsWith("process_id:")) {
    const id = atom.slice("process_id:".length);
    return (
      isKnown(ctx.profile.processes) &&
      ctx.profile.processes.value.some((p) => p.id === id)
    );
  }
  if (atom.startsWith("portal:")) {
    const flag = atom.slice("portal:".length);
    const p = ctx.profile.portalCliente;
    if (flag === "unknown") {
      // Ausente en v1.1 ≠ ask; unknown explícito o v1.2 sin canal autoservicio + portal unknown
      if (p && isUnknown(p)) return true;
      return false;
    }
    if (flag === "autoservicio_true") {
      return !!p && isKnown(p) && p.value.autoservicio === true;
    }
    return false;
  }
  if (atom.startsWith("field:")) {
    const rest = atom.slice("field:".length);
    const lastColon = rest.lastIndexOf(":");
    const path = rest.slice(0, lastColon);
    const flag = rest.slice(lastColon + 1);
    const st = fieldStatus(ctx.profile, path);
    if (flag === "unknown") return st === "unknown";
    if (flag === "known") return st === "known";
    if (flag === "not_applicable") return st === "not_applicable" || st === "absent";
    if (flag === "cuenta_parte") return isCuentaParte(ctx.profile);
    if (flag === "retencion") return isRetencion(ctx.profile);
    if (flag === "retencion_umbral") return isRetencionConUmbral(ctx.profile);
    if (flag === "hitos") return isHitos(ctx.profile);
    if (flag === "known_true") {
      if (path === "cobros.aPlazos") return isTruthyPlazos(ctx.profile);
      if (path === "cobros.aCredito") {
        return isCuentaParte(ctx.profile) || isACreditoBoolTrue(ctx.profile);
      }
      return false;
    }
    if (flag === "known_false") {
      if (path === "cobros.aPlazos") return isKnownFalsePlazos(ctx.profile);
      if (path === "cobros.aCredito") {
        const c = ctx.profile.cobros?.aCredito;
        return !!c && isKnown(c) && c.value === false;
      }
      return false;
    }
  }
  return false;
}

function evalWhen(when: string, ctx: EvalCtx): boolean {
  return evalAtom(when, ctx);
}

function collectPolicyTemplatesFromProfile(
  profile: BusinessProfile,
): PolicyTemplateInvocation[] {
  if (profile.policyTemplates && isKnown(profile.policyTemplates)) {
    return [...profile.policyTemplates.value];
  }
  return [];
}

export interface ComposeOptions {
  /** Preguntas adicionales (p.ej. residuos del parser de horarios). */
  readonly extraQuestions?: readonly ComposerQuestion[];
}

/**
 * Compone un BusinessProfile validado.
 * Nunca adivina: unknown con política ask → pregunta.
 * Composición inválida → error (no se entrega).
 */
export function composeBusinessProfile(
  profile: BusinessProfile,
  options?: ComposeOptions,
): ComposerResult {
  const traces: TraceEntry[] = [];
  const questions: ComposerQuestion[] = [];
  const visibility: VisibilityRequirement[] = [];
  const nonComposable: NonComposableItem[] = [];
  const policyTemplates: PolicyTemplateInvocation[] = [
    ...collectPolicyTemplatesFromProfile(profile),
  ];
  const forbidden = new Set<ArchetypeId>();
  const secondariesByArch = new Map<ArchetypeId, SecondaryBinding>();

  if (!isKnown(profile.processes)) {
    return {
      ok: false,
      code: "INCOMPLETE_PROFILE",
      message: 'processes debe ser known para componer',
      details: ["processes"],
      traces,
      questions,
    };
  }

  const processes: ProcessDecl[] = [...profile.processes.value];
  const dominant = profile.policyMeta.dominantArchetypeId;
  const processArchetypes = new Set(processes.map((p) => p.archetypeId));

  traces.push({
    elementId: "dominant",
    elementKind: "composition",
    field: "policyMeta.dominantArchetypeId",
    ruleId: "R_DOMINANT",
    decision: `dominante ${dominant}`,
    value: dominant,
  });

  // Perfil ya trae composition known → respetar (tras validar)
  if (profile.composition && isKnown(profile.composition)) {
    const composition = profile.composition.value;
    const v = validateComposition(composition);
    if (!v.ok) {
      return {
        ok: false,
        code: "INVALID_COMPOSITION",
        message: `composition del perfil inválida: ${v.issues.map((i) => i.message).join("; ")}`,
        details: v.issues.map((i) => i.code),
        traces,
        questions,
      };
    }
    for (const life of [composition.dominant, ...composition.secondaries.map((s) => s.secondaryArchetypeId)]) {
      const arch = requireArchetype(life);
      const lv = validateLifecycle(arch.lifecycle);
      if (!lv.ok) {
        return {
          ok: false,
          code: "INVALID_COMPOSITION",
          message: `Lifecycle inválido: ${life}`,
          details: lv.issues.map((i) => i.message),
          traces,
          questions,
        };
      }
    }
    const outBase = {
      composition,
      processes,
      policyTemplates,
      visibility,
      questions,
      nonComposable,
      dominant,
    };
    return {
      ok: true,
      ...outBase,
      traces: [
        ...traces,
        {
          elementId: "composition",
          elementKind: "composition",
          field: "composition",
          ruleId: "R_PROFILE_COMPOSITION",
          decision: "composition known del perfil",
          value: composition,
        },
      ],
      compositionHash: hashComposerOutput(outBase),
    };
  }

  const ctx: EvalCtx = {
    profile,
    dominant,
    processArchetypes,
    forbiddenSecondaries: forbidden,
  };

  const applyAction = (ruleId: string, action: RuleAction): void => {
    switch (action.type) {
      case "ask": {
        if (questions.some((q) => q.id === action.questionId)) return;
        const kind =
          action.kind ??
          (action.oracleRule === "FAIL_IF_COMPOSER_CHOOSES"
            ? "ask"
            : action.questionId.startsWith("confirm.")
              ? "confirm"
              : "ask");
        questions.push({
          id: action.questionId,
          field: action.field,
          question: action.question,
          ruleId,
          kind,
          ...(action.oracleRule !== undefined
            ? { oracleRule: action.oracleRule }
            : {}),
        });
        traces.push({
          elementId: action.questionId,
          elementKind: "question",
          field: action.field,
          ruleId,
          decision: action.question,
        });
        break;
      }
      case "forbid_secondary": {
        forbidden.add(action.secondaryArchetypeId);
        secondariesByArch.delete(action.secondaryArchetypeId);
        traces.push({
          elementId: `forbid.${action.secondaryArchetypeId}`,
          elementKind: "secondary",
          field: "cobros.aCredito",
          ruleId,
          decision: action.reason,
        });
        break;
      }
      case "add_secondary": {
        if (forbidden.has(action.secondaryArchetypeId)) {
          traces.push({
            elementId: `skip.${action.secondaryArchetypeId}`,
            elementKind: "secondary",
            field: "composition.secondaries",
            ruleId,
            decision: `omitido: prohibido (${action.secondaryArchetypeId})`,
          });
          return;
        }
        if (action.secondaryArchetypeId === dominant) return;
        if (!processArchetypes.has(action.secondaryArchetypeId)) {
          processes.push({
            id: `lc.${action.secondaryArchetypeId}`,
            archetypeId: action.secondaryArchetypeId,
            label: action.secondaryArchetypeId,
          });
          processArchetypes.add(action.secondaryArchetypeId);
        }
        let bornIn = action.bornInDominantState;
        let bloquea = action.bloquea;
        if (action.secondaryArchetypeId === "financiera" && (!bornIn || !bloquea)) {
          const def = defaultFinancieraBinding(dominant);
          bornIn = bornIn ?? def.bornInDominantState;
          bloquea = bloquea ?? def.bloquea;
        }
        if (!bornIn || !bloquea) {
          traces.push({
            elementId: `skip.${action.secondaryArchetypeId}`,
            elementKind: "secondary",
            field: "composition.secondaries",
            ruleId,
            decision: "omitido: falta bornIn/bloquea",
          });
          return;
        }
        const finalBinding: SecondaryBinding = {
          secondaryArchetypeId: action.secondaryArchetypeId,
          bornInDominantState: bornIn,
          bloquea,
        };
        secondariesByArch.set(action.secondaryArchetypeId, finalBinding);
        traces.push({
          elementId: `sec.${action.secondaryArchetypeId}`,
          elementKind: "secondary",
          field: "composition.secondaries",
          ruleId,
          decision: `${finalBinding.bornInDominantState}→bloquea ${finalBinding.bloquea}`,
          value: finalBinding,
        });
        break;
      }
      case "add_policy": {
        const id = `tpl-${action.idSuffix}`;
        if (policyTemplates.some((p) => p.id === id)) return;
        const inv: PolicyTemplateInvocation = {
          id,
          plantilla: action.plantilla,
          parametros: action.parametros,
          ...(action.transitionId ? { transitionId: action.transitionId } : {}),
        };
        policyTemplates.push(inv);
        traces.push({
          elementId: id,
          elementKind: "policy",
          field: "policyTemplates",
          ruleId,
          decision: action.plantilla,
          value: action.parametros,
        });
        break;
      }
      case "add_process": {
        if (processes.some((p) => p.id === action.process.id)) return;
        processes.push(action.process);
        processArchetypes.add(action.process.archetypeId);
        traces.push({
          elementId: action.process.id,
          elementKind: "process",
          field: "processes",
          ruleId,
          decision: `proceso ${action.process.archetypeId}`,
          value: action.process,
        });
        break;
      }
      case "set_visibility": {
        visibility.push({
          scope: action.scope,
          roles: action.roles,
          ruleId,
          ...(action.fields !== undefined ? { fields: action.fields } : {}),
        });
        traces.push({
          elementId: `vis.${action.scope}`,
          elementKind: "visibility",
          field: "portalCliente",
          ruleId,
          decision: `scope ${action.scope}`,
        });
        break;
      }
      case "mark_non_composable": {
        nonComposable.push({
          extension: action.extension,
          reason: action.reason,
          ruleId,
          ...(action.field !== undefined ? { field: action.field } : {}),
        });
        traces.push({
          elementId: action.extension,
          elementKind: "non_composable",
          field: action.field ?? "",
          ruleId,
          decision: action.reason,
        });
        break;
      }
      case "set_capacity": {
        traces.push({
          elementId: `capacity.${action.mode}`,
          elementKind: "capacity",
          field: "capacityMode",
          ruleId,
          decision: action.mode,
        });
        break;
      }
      case "retention_before_close": {
        nonComposable.push({
          extension: "liquidacion_fianza",
          reason: action.reason,
          field: "cobros.fianzas",
          ruleId,
        });
        traces.push({
          elementId: "retention",
          elementKind: "non_composable",
          field: "cobros.fianzas",
          ruleId,
          decision: action.reason,
        });
        // También es componible vía API retention-settlement — marcamos requisito
        traces.push({
          elementId: "retention.rule",
          elementKind: "composition",
          field: "cobros.fianzas",
          ruleId,
          decision: "aplica assertRetentionSettledBeforeClosure en cierre",
        });
        break;
      }
      default: {
        const _e: never = action;
        void _e;
      }
    }
  };

  // Aplicar reglas en orden estable
  for (const rule of COMPOSITION_RULES) {
    if (rule.then.length === 0) continue;
    if (!evalWhen(rule.when, ctx)) continue;
    for (const action of rule.then) {
      applyAction(rule.id, action);
    }
  }

  // Hitos: validar lista si known → commitments + grafo de bloqueos (no financiera)
  let milestones: HitoPagoSpec[] | undefined;
  if (isHitos(profile) && profile.cobros && isKnown(profile.cobros.pagosPorHitos)) {
    const hitosDecl = profile.cobros.pagosPorHitos.value;
    if (typeof hitosDecl === "object" && hitosDecl !== null && "hitos" in hitosDecl) {
      const specs: HitoPagoSpec[] = hitosDecl.hitos.map((h) => ({
        id: h.id,
        fase: h.fase,
        bornInDominantState: h.bornInDominantState,
        bloquea: h.bloqueaStateId,
        ...(h.pct !== undefined ? { pct: h.pct } : {}),
        ...(h.importeEur !== undefined ? { importeEur: h.importeEur } : {}),
      }));
      try {
        validateHitosList(specs);
        const commitments = hitosToCommitments(specs);
        milestones = specs;
        traces.push({
          elementId: "hitos",
          elementKind: "composition",
          field: "cobros.pagosPorHitos",
          ruleId: "R_HITOS_VALIDATE",
          decision: `${specs.length} hitos → ${commitments.length} compromisos pagar + bloqueos de fase`,
          value: {
            pattern: "compromisos_pagar_con_bloqueos",
            commitments,
            phaseEdges: specs.map((h) => ({
              from: h.bornInDominantState,
              blocks: h.bloquea,
            })),
          },
        });
      } catch (err) {
        return {
          ok: false,
          code: "CONTRADICTION",
          message: err instanceof Error ? err.message : String(err),
          details: ["cobros.pagosPorHitos"],
          traces,
          questions,
        };
      }
    }
  }

  // Preguntas extra (parser de horarios, etc.)
  if (options?.extraQuestions) {
    for (const q of options.extraQuestions) {
      if (questions.some((x) => x.id === q.id)) continue;
      questions.push(q);
      traces.push({
        elementId: q.id,
        elementKind: "question",
        field: q.field,
        ruleId: q.ruleId,
        decision: q.question,
      });
    }
  }

  // Compra: procesos con exchangeDirection
  for (const p of processes) {
    if (p.exchangeDirection === "empresa_compra") {
      traces.push({
        elementId: p.id,
        elementKind: "process",
        field: "processes.exchangeDirection",
        ruleId: "R_DIR_COMPRA",
        decision: "empresa_compra (venta como compra a proveedor)",
        value: p.exchangeDirection,
      });
    }
  }

  const secondaries = [...secondariesByArch.values()].sort((a, b) =>
    a.secondaryArchetypeId.localeCompare(b.secondaryArchetypeId),
  );

  const composition =
    secondaries.length === 0
      ? undefined
      : { dominant, secondaries };

  if (composition) {
    const v = validateComposition(composition);
    if (!v.ok) {
      return {
        ok: false,
        code: "INVALID_COMPOSITION",
        message: v.issues.map((i) => i.message).join("; "),
        details: v.issues.map((i) => i.code),
        traces,
        questions,
      };
    }
    for (const sec of composition.secondaries) {
      const arch = requireArchetype(sec.secondaryArchetypeId);
      const lv = validateLifecycle(arch.lifecycle);
      if (!lv.ok) {
        return {
          ok: false,
          code: "INVALID_COMPOSITION",
          message: `Lifecycle secundario inválido: ${sec.secondaryArchetypeId}`,
          details: lv.issues.map((i) => i.message),
          traces,
          questions,
        };
      }
    }
    const domArch = requireArchetype(composition.dominant);
    if (!validateLifecycle(domArch.lifecycle).ok) {
      return {
        ok: false,
        code: "INVALID_COMPOSITION",
        message: `Lifecycle dominante inválido: ${composition.dominant}`,
        details: [],
        traces,
        questions,
      };
    }
  }

  if (milestones && milestones.length > 0) {
    for (let i = 0; i < policyTemplates.length; i++) {
      const pt = policyTemplates[i]!;
      if (pt.plantilla === "tpl.hitos_pago") {
        policyTemplates[i] = buildHitosTemplateInvocation(pt, milestones);
      }
    }
  }

  // Orden determinista
  processes.sort((a, b) => a.id.localeCompare(b.id));
  policyTemplates.sort((a, b) => a.id.localeCompare(b.id));
  questions.sort((a, b) => a.id.localeCompare(b.id));

  const outBase = {
    composition,
    processes,
    policyTemplates,
    visibility,
    questions,
    nonComposable,
    dominant,
    ...(milestones !== undefined ? { milestones } : {}),
  };

  return {
    ok: true,
    ...outBase,
    traces,
    compositionHash: hashComposerOutput(outBase),
  };
}

/** Resuelve plantilla sample → tpl.* si existe. */
export function resolveSamplePlantilla(
  plantilla: string,
): PolicyTemplateInvocation["plantilla"] | undefined {
  if (plantilla.startsWith("tpl.")) {
    return plantilla as PolicyTemplateInvocation["plantilla"];
  }
  return SAMPLE_PLANTILLA_TO_TPL[plantilla];
}

export { isNotApplicable };
