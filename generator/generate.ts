/**
 * Generador: capas 0+1 → UiSpec (capa 2).
 * Organización primaria: processGroups (procesos / secundarios).
 * mod.* = etiquetas opcionales (nunca condición de existencia de pantallas).
 */

import { createHash } from "node:crypto";
import type { EvidenceKind } from "../core/grammar.js";
import type { Transition } from "../core/lifecycle.js";
import { hashCanonical, canonicalStringify } from "../policies/compiler.js";
import type {
  ActionSpec,
  ContentOverride,
  FormFieldSpec,
  FormSpec,
  IdentitySpec,
  ModuleSpec,
  PresentationOverlay,
  ProcessGroupSpec,
  RecorridoSpec,
  UiSpec,
  ViewSpec,
} from "../presentation/types.js";
import { PRESENTATION_SCHEMA_VERSION } from "../presentation/types.js";
import { admittedPatternsForView } from "../presentation/patterns.js";
import { DEFAULT_STYLE_TOKEN_REFS } from "../presentation/tokens.js";
import { deduceModules } from "./rules/index.js";
import type { GeneratorInput, ModuleMatch } from "./types.js";
import {
  derivePresentationPanels,
  panelToView,
} from "./presentation-rules.js";
import { buildProcessGroups } from "./process-groups.js";
import { validateUiSpec } from "../presentation/uispec-validator.js";
import type { ValidatedUiSpec } from "../presentation/validated.js";
import { LocalizationGenerator } from "./localization-generator.js";
import { ViewActionIndex } from "./indexing.js";

export interface GenerateOptions {
  readonly overlay?: PresentationOverlay;
  /** Si se omite, se usa input.generatedAt. */
  readonly generatedAt?: string;
}

/**
 * Cache global de índices para acceso O(1) rápido a vistas y acciones.
 * Se llena durante generateUiSpec y se puede consultar después.
 */
const uiSpecIndexCache = new Map<string, ViewActionIndex>();

export function getUiSpecIndex(uiSpecId: string): ViewActionIndex | undefined {
  return uiSpecIndexCache.get(uiSpecId);
}

export function clearUiSpecIndexCache(): void {
  uiSpecIndexCache.clear();
}

function rolesForTransition(
  input: GeneratorInput,
  transitionId: string,
): string[] {
  const roles = new Set<string>();
  for (const r of input.ruleSet.rules) {
    if (
      r.kind === "guard" &&
      r.transitionId === transitionId &&
      (r.action === "ejecutar" || r.action === "aprobar")
    ) {
      for (const role of r.allowedRoles) roles.add(role);
    }
  }
  return [...roles].sort();
}

function evidenceFields(kind: EvidenceKind): FormFieldSpec[] {
  return [
    {
      name: "evidence.kind",
      labelKey: "field.evidence_kind",
      type: "enum",
      required: true,
      enumValues: [kind],
    },
    {
      name: "evidence.reference",
      labelKey: "field.evidence_reference",
      type: "string",
      required: true,
    },
    {
      name: "evidence.recordedAt",
      labelKey: "field.evidence_recorded_at",
      type: "date",
      required: true,
    },
  ];
}

function entityForms(): FormSpec[] {
  return [
    {
      id: "form.parte",
      entityKind: "parte",
      fields: [
        {
          name: "parte_id",
          labelKey: "field.parte_id",
          type: "reference",
          required: true,
          referenceEntity: "parte",
        },
        {
          name: "nombre_ref",
          labelKey: "field.parte_ref_label",
          type: "string",
          required: false,
        },
      ],
    },
    {
      id: "form.oferta",
      entityKind: "oferta",
      fields: [
        {
          name: "oferta_version",
          labelKey: "field.oferta_version",
          type: "number",
          required: true,
        },
        {
          name: "descripcion",
          labelKey: "field.oferta_desc",
          type: "string",
          required: false,
        },
      ],
    },
    {
      id: "form.recurso",
      entityKind: "recurso",
      fields: [
        {
          name: "recurso_id",
          labelKey: "field.recurso_id",
          type: "reference",
          required: true,
          referenceEntity: "recurso",
        },
        {
          name: "cantidad",
          labelKey: "field.cantidad",
          type: "number",
          required: false,
        },
      ],
    },
  ];
}

/** Tableros por estado + acciones por transición (derivado de procesos). */
function buildActionsAndViews(input: GeneratorInput): {
  views: ViewSpec[];
  actions: ActionSpec[];
} {
  const views: ViewSpec[] = [];
  const actions: ActionSpec[] = [];

  for (const slice of input.lifecycles) {
    for (const state of slice.lifecycle.states) {
      const viewId = `view.${slice.id}.${state.id}`;
      const outgoing = slice.lifecycle.transitions.filter(
        (t) => t.from === state.id,
      );
      const actionIds: string[] = [];
      for (const t of outgoing) {
        const act = actionFromTransition(input, slice.id, t);
        if (act.visibleRoles.length === 0) continue;
        actions.push(act);
        actionIds.push(act.id);
      }
      views.push({
        id: viewId,
        kind: "tablero",
        labelKey: `view.${slice.id}.${state.id}`,
        stateId: state.id,
        lifecycleId: slice.id,
        actionIds: actionIds.sort(),
        admittedPatterns: admittedPatternsForView("tablero"),
      });
    }
  }

  views.sort((a, b) => a.id.localeCompare(b.id));
  actions.sort((a, b) => a.id.localeCompare(b.id));
  return { views, actions };
}

function actionFromTransition(
  input: GeneratorInput,
  lifecycleId: string,
  t: Transition,
): ActionSpec {
  const visibleRoles = rolesForTransition(input, t.id);
  return {
    id: `action.${lifecycleId}.${t.id}`,
    transitionId: t.id,
    lifecycleId,
    labelKey: `action.${t.id}`,
    visibleRoles,
    requiredEvidenceKind: t.requiredEvidence,
    evidenceFields: evidenceFields(t.requiredEvidence),
    formId: "form.parte",
  };
}

/**
 * Etiquetas opcionales mod.* — empaquetan vistas existentes; no crean pantallas.
 */
function buildModuleTags(
  matches: readonly ModuleMatch[],
  views: readonly ViewSpec[],
  actions: readonly ActionSpec[],
): { modules: ModuleSpec[]; moduleRecorridos: RecorridoSpec[] } {
  const modules: ModuleSpec[] = [];
  const moduleRecorridos: RecorridoSpec[] = [];

  for (const m of matches) {
    const viewIds = views
      .filter(
        (v) =>
          v.kind === "tablero" &&
          v.lifecycleId !== null &&
          (m.lifecycleIds.length === 0 ||
            m.lifecycleIds.includes(v.lifecycleId)),
      )
      .map((v) => v.id);
    const actionIds = actions
      .filter(
        (a) =>
          m.lifecycleIds.length === 0 ||
          m.lifecycleIds.includes(a.lifecycleId),
      )
      .filter((a) => a.visibleRoles.some((r) => m.roleIds.includes(r)))
      .map((a) => a.id);

    const recorridoId = `recorrido.${m.moduleId}`;
    const primaryLc = m.lifecycleIds[0];
    const orderedSteps = primaryLc
      ? views
          .filter((v) => v.lifecycleId === primaryLc && v.kind === "tablero")
          .map((v) => v.id)
      : viewIds.slice(0, 5);

    moduleRecorridos.push({
      id: recorridoId,
      labelKey: `recorrido.${m.moduleId}`,
      steps: orderedSteps,
      roleIds: m.roleIds,
    });

    modules.push({
      id: m.moduleId,
      labelKey: m.labelKey,
      ruleId: m.ruleId,
      channel: m.channel,
      roleIds: m.roleIds,
      viewIds,
      actionIds,
      recorridoIds: [recorridoId],
    });
  }

  modules.sort((a, b) => a.id.localeCompare(b.id));
  moduleRecorridos.sort((a, b) => a.id.localeCompare(b.id));
  return { modules, moduleRecorridos };
}

function defaultLocalization(
  processGroups: readonly ProcessGroupSpec[],
  modules: readonly ModuleSpec[],
  views: readonly ViewSpec[],
  actions: readonly ActionSpec[],
): Record<string, string> {
  const strings: Record<string, string> = {
    "module.tpv": "TPV",
    "module.crm": "CRM",
    "module.inventario": "Inventario",
    "module.agenda": "Agenda",
    "module.agenda_taller": "Agenda del taller",
    "module.facturacion": "Facturación",
    "module.portal_cliente": "Portal del cliente",
    "panel.agenda_disponibilidad": "Agenda / disponibilidad",
    "panel.retencion": "Retención / fianza",
    "panel.credito": "Crédito",
    "panel.periodos_cuotas": "Periodos / cuotas",
    "panel.bloqueo": "Bloqueo de avance",
    "panel.portal_filtro": "Portal (filtro por Parte)",
    "proceso.portal_filtro": "Portal",
    "field.evidence_kind": "Tipo de evidencia",
    "field.evidence_reference": "Referencia",
    "field.evidence_recorded_at": "Registrada en",
    "field.parte_id": "Parte",
    "field.parte_ref_label": "Etiqueta",
    "field.oferta_version": "Versión de oferta",
    "field.oferta_desc": "Descripción",
    "field.recurso_id": "Recurso",
    "field.cantidad": "Cantidad",
  };
  for (const g of processGroups) {
    strings[g.labelKey] = g.labelKey.replace(/^proceso\./, "");
  }
  for (const m of modules) {
    strings[m.labelKey] = strings[m.labelKey] ?? m.id;
  }
  for (const v of views) {
    if (v.presentation?.vista) {
      strings[v.labelKey] =
        strings[v.labelKey] ?? String(v.presentation.vista);
    } else {
      strings[v.labelKey] = v.stateId
        ? `Tablero: ${v.stateId}`
        : (strings[v.labelKey] ?? v.labelKey);
    }
  }
  for (const a of actions) {
    strings[a.labelKey] = a.transitionId;
  }
  return strings;
}

/**
 * Fusiona overlay sobre la especificación generada.
 */
export function applyOverlay(
  base: Omit<UiSpec, "contentHash" | "identity" | "localization" | "content"> & {
    identity: IdentitySpec;
    localization: UiSpec["localization"];
    content: Readonly<Record<string, ContentOverride>>;
  },
  overlay: PresentationOverlay | undefined,
): {
  identity: IdentitySpec;
  localization: UiSpec["localization"];
  content: Readonly<Record<string, ContentOverride>>;
} {
  const rawIdentity: IdentitySpec = {
    ...base.identity,
    ...(overlay?.identity ?? {}),
  };
  const identity: IdentitySpec = {
    ...(rawIdentity.brandName !== undefined
      ? { brandName: rawIdentity.brandName }
      : {}),
    ...(rawIdentity.logoUrl !== undefined
      ? { logoUrl: rawIdentity.logoUrl }
      : {}),
  };
  const content: Record<string, ContentOverride> = {
    ...base.content,
  };
  for (const [k, v] of Object.entries(overlay?.content ?? {})) {
    content[k] = { ...content[k], ...v };
  }
  const localization =
    overlay?.localization && overlay.localization.length > 0
      ? overlay.localization
      : base.localization;
  return { identity, localization, content };
}

/**
 * Genera UiSpec determinista a partir de procesos + composición + señales.
 * La salida queda validada y sellada (obligatorio antes de render/persistir).
 */
export function generateUiSpec(
  input: GeneratorInput,
  options: GenerateOptions = {},
): ValidatedUiSpec {
  const generatedAt = options.generatedAt ?? input.generatedAt;
  const matches = deduceModules(input);
  const { views: stateViews, actions } = buildActionsAndViews(input);
  const panels = derivePresentationPanels(input);
  const panelViews = panels.map(panelToView);
  const views = [...stateViews, ...panelViews].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const forms = entityForms();
  const { processGroups, recorridos: processRecorridos } = buildProcessGroups(
    input,
    views,
    actions,
    panels,
  );
  const { modules, moduleRecorridos } = buildModuleTags(
    matches,
    views,
    actions,
  );
  const recorridos = [...processRecorridos, ...moduleRecorridos].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  // FASE 1: Auto-generar localización
  const localizationGen = new LocalizationGenerator();
  const autoGeneratedLabels = localizationGen.generateLabels(
    {
      archetypeId: input.composition?.dominant ?? input.lifecycles[0]?.archetypeId ?? "default",
      caseId: input.caseId,
      locale: "es",
    },
    processGroups,
    views,
    actions,
  );

  // Fusionar con defaultLocalization para compatibilidad
  const strings = { ...autoGeneratedLabels, ...defaultLocalization(processGroups, modules, views, actions) };
  const baseIdentity: IdentitySpec = {};
  const baseContent: Record<string, ContentOverride> = {};
  const baseLocalization = [
    { locale: "es-ES", strings: Object.freeze({ ...strings }) },
  ];

  const merged = applyOverlay(
    {
      id: `ui:${input.caseId}`,
      version: PRESENTATION_SCHEMA_VERSION,
      generatedAt,
      sourceCaseId: input.caseId,
      sourceCaseVersion: input.caseVersion,
      sourcePolicyHash: input.ruleSet.contentHash,
      processGroups,
      modules,
      views,
      actions,
      forms,
      recorridos,
      identity: baseIdentity,
      localization: baseLocalization,
      content: baseContent,
      styleTokenRefs: DEFAULT_STYLE_TOKEN_REFS,
    },
    options.overlay,
  );

  const artifact = {
    id: `ui:${input.caseId}`,
    version: PRESENTATION_SCHEMA_VERSION,
    generatedAt,
    sourceCaseId: input.caseId,
    sourceCaseVersion: input.caseVersion,
    sourcePolicyHash: input.ruleSet.contentHash,
    processGroups,
    modules,
    views,
    actions,
    forms,
    recorridos,
    identity: merged.identity,
    localization: merged.localization,
    content: merged.content,
    styleTokenRefs: DEFAULT_STYLE_TOKEN_REFS,
  };

  const contentHash = hashCanonical(artifact);

  // FASE 1: Pre-indexación para O(1) lookups
  const index = new ViewActionIndex();
  index.build(views, actions);
  // Validar consistencia del índice
  const indexValidation = index.validateConsistency();
  if (!indexValidation.valid) {
    console.warn(
      "Índice contiene inconsistencias:",
      indexValidation.errors,
    );
  }

  const frozen: UiSpec = Object.freeze({
    ...artifact,
    contentHash,
    processGroups: Object.freeze([...processGroups]),
    modules: Object.freeze([...modules]),
    views: Object.freeze([...views]),
    actions: Object.freeze([...actions]),
    forms: Object.freeze([...forms]),
    recorridos: Object.freeze([...recorridos]),
    identity: Object.freeze({ ...merged.identity }),
    localization: Object.freeze(
      merged.localization.map((l) =>
        Object.freeze({
          locale: l.locale,
          strings: Object.freeze({ ...l.strings }),
        }),
      ),
    ),
    content: Object.freeze({ ...merged.content }),
    styleTokenRefs: Object.freeze({ ...DEFAULT_STYLE_TOKEN_REFS }),
  });

  // Almacenar el índice en un mapa global para uso posterior (opcional)
  // Esto permite acceso O(1) sin modificar la estructura del UiSpec
  uiSpecIndexCache.set(frozen.id, index);

  return validateUiSpec(frozen, input, { validatedAt: generatedAt });
}

/**
 * Hash estructural. Incluye processGroups (organización primaria).
 * Cambio v-process-ui: views de panel + processGroups + recorridos.proceso.*
 * alteran el hash respecto a la era solo-mod.*; estados/acciones/roles
 * de proceso permanecen equivalentes (ver prueba de equivalencia funcional).
 */
export function structuralHash(spec: UiSpec): string {
  return createHash("sha256")
    .update(
      canonicalStringify({
        processGroups: spec.processGroups ?? [],
        modules: spec.modules,
        views: spec.views,
        actions: spec.actions,
        forms: spec.forms,
        recorridos: spec.recorridos,
        sourceCaseId: spec.sourceCaseId,
        sourcePolicyHash: spec.sourcePolicyHash,
      }),
      "utf8",
    )
    .digest("hex");
}

/** Acciones visibles para un rol (criterio de permiso). */
export function actionsVisibleToRole(
  spec: UiSpec,
  roleId: string,
): readonly ActionSpec[] {
  return spec.actions.filter((a) => a.visibleRoles.includes(roleId));
}
