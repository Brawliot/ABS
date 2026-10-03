import type { SenalesNegocio } from "../design/generative.js";
/**
 * Arranque: BusinessProfile / sample / concesionaria
 * → compositor → Generador → UiSpec sellada + DesignSystem.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  composeBusinessProfile,
  mapSampleToV12,
  unifyComposerQuestions,
  applyComposerToMaterialize,
} from "../composer/index.js";
import type { ComposerQuestion } from "../composer/types.js";
import {
  known,
  validateBusinessProfile,
} from "../contracts/business-profile/index.js";
import type { SampleProfile } from "../contracts/business-profile/samples/sample-types.js";
import { proposeDesignSystems } from "../design/index.js";
import {
  generateUiSpec,
  buildConcesionariaGeneratorInputWithComposition,
} from "../generator/index.js";
import { requireArchetype } from "../archetypes/catalog.js";
import type { GeneratorInput } from "../generator/types.js";
import type { CompiledRuleSet } from "../policies/types.js";
import { isValidatedUiSpec } from "../presentation/validated.js";
import { buildSampleRows, DEFAULT_SAMPLE_PARTES } from "./sample-data.js";
import type { AppBootResult } from "./types.js";
import { validarPasos, construirCiclo, reglasParaPasos } from "../elements/pasos.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE_FILES = [
  join(ROOT, "contracts/business-profile/samples/business-profiles-10.json"),
  join(ROOT, "contracts/business-profile/samples/negocios-nuevos.json"),
];

/** Lee los perfiles de un JSON: `{perfiles: [...]}`, una lista o un perfil suelto. */
export function readSampleFile(path: string): SampleProfile[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (Array.isArray(raw)) return raw as SampleProfile[];
  const obj = raw as { perfiles?: SampleProfile[] };
  return obj.perfiles ?? [raw as SampleProfile];
}

/** Perfiles cargados desde archivos sueltos (`--archivo`), por id. */
const extraSamples = new Map<string, SampleProfile>();

/** Registra los perfiles de un archivo externo y devuelve sus ids. */
export function registerSampleFile(path: string): string[] {
  const perfiles = readSampleFile(path);
  for (const p of perfiles) extraSamples.set(p.id, p);
  return perfiles.map((p) => p.id);
}

function allSamples(): SampleProfile[] {
  return [...SAMPLE_FILES.flatMap(readSampleFile), ...extraSamples.values()];
}

export function listSampleProfileIds(): readonly string[] {
  return [...new Set(allSamples().map((p) => p.id))];
}

export function loadSampleProfile(id: string): SampleProfile {
  const p = extraSamples.get(id) ?? allSamples().find((x) => x.id === id);
  if (!p) {
    throw new Error(
      `Perfil desconocido: ${id}. Disponibles: ${listSampleProfileIds().join(", ")}, concesionaria`,
    );
  }
  return p;
}

/**
 * Completa asks bloqueantes con defaults de demo (materialize).
 * Las preguntas originales se conservan para el aviso en UI.
 */
function resolveAsksForDemo(
  profile: Record<string, unknown>,
): Record<string, unknown> {
  const raw = structuredClone(profile) as Record<string, unknown>;
  if ((raw.naturalezaBienes as { status?: string })?.status === "unknown") {
    raw.naturalezaBienes = known(["propios_por_cantidad"]);
  }
  if ((raw.portalCliente as { status?: string })?.status === "unknown") {
    // false evita contradicción canal; la pregunta original sigue en el banner
    raw.portalCliente = known({ autoservicio: false });
  }
  if (raw.cobros) {
    const cobros = raw.cobros as Record<string, { status?: string }>;
    for (const key of ["aCredito", "aPlazos", "cuotasRecurrentes"] as const) {
      if (cobros[key]?.status === "unknown") {
        cobros[key] = known(false) as never;
      }
    }
  }
  return raw;
}

function unrenderedNotes(spec: AppBootResult["spec"]): string[] {
  const notes: string[] = [];
  // Acciones: conectadas vía Intérprete→Juez
  if (spec.recorridos.length > 0) {
    notes.push(
      "recorridos: visibles como lista de pasos; wizard interactivo pendiente",
    );
  }
  // modules legacy no son navegación primaria
  if (spec.modules.length > 0) {
    notes.push(
      "modules (mod.*): etiquetas legacy; la navegación usa processGroups",
    );
  }
  return notes;
}

/**
 * Arranca un perfil sample (p01…p10) hasta UiSpec sellada.
 */
/** Señales del perfil que ajustan el diseño (densidad, tamaño táctil). */
function senalesDe(input: GeneratorInput, sedes: number): SenalesNegocio {
  return {
    sedes,
    roles: input.roles.length,
    autoservicio: input.channels.includes("autoservicio") || input.channels.includes("web"),
    tactil: input.channels.includes("taller") || input.channels.includes("presencial"),
  };
}

export function bootSampleProfile(profileId: string): AppBootResult {
  const sample = loadSampleProfile(profileId);
  const { profile, scheduleQuestions } = mapSampleToV12(sample);

  // Preguntas antes de resolver asks (usuario debe verlas)
  const rawValidated = validateBusinessProfile(profile);
  const preCompose = composeBusinessProfile(rawValidated, {
    extraQuestions: scheduleQuestions,
  });
  const questions: ComposerQuestion[] = preCompose.ok
    ? [...unifyComposerQuestions(rawValidated, preCompose).questions]
    : [...scheduleQuestions];

  const resolved = resolveAsksForDemo(profile as Record<string, unknown>);
  const validated = validateBusinessProfile(resolved);
  const composed = composeBusinessProfile(validated, {
    extraQuestions: scheduleQuestions,
  });
  if (!composed.ok) {
    throw new Error(`Compositor ${profileId}: ${composed.message}`);
  }
  const unified = unifyComposerQuestions(validated, composed);
  const pipe = applyComposerToMaterialize(validated, unified, {
    generatedAt: "2026-06-01T00:00:00.000Z",
    systemIds: {
      caseId: `case-${profileId}`,
      caseVersion: "1.0.0",
      documentId: `pol-${profileId}`,
      compiledVersion: "compiled:web-1",
      activationAt: "2026-01-01T00:00:00.000Z",
    },
  });

  // Aplicar pasos personalizados si están presentes en el sample
  if (sample.pasos && sample.pasos.length > 0) {
    const lifecyclesArray = [...pipe.input.lifecycles];
    const vocabularioNuevo = { ...pipe.input.vocabulario };
    let ruleSet = pipe.input.ruleSet;

    for (const paso of sample.pasos) {
      const lcSlice = lifecyclesArray.find((l) => l.id === paso.proceso);
      if (!lcSlice) {
        throw new Error(
          `Proceso "${paso.proceso}" con pasos personalizados no encontrado`,
        );
      }

      const erroresValidacion = validarPasos([paso], lcSlice.lifecycle);
      if (erroresValidacion.length > 0) {
        const msgs = erroresValidacion
          .map((e) => `${e.tipo}: ${e.mensaje}`)
          .join("; ");
        throw new Error(`Validación de pasos fallida: ${msgs}`);
      }

      const { lifecycle: cicloNuevo } = construirCiclo(
        [paso],
        lcSlice.lifecycle,
      );

      // Reemplazar el lifecycle
      const sliceIdx = lifecyclesArray.findIndex((l) => l.id === paso.proceso);
      lifecyclesArray[sliceIdx] = {
        ...lcSlice,
        lifecycle: cicloNuevo,
      };

      // Reglas para las acciones propias (copias; las originales no se tocan)
      ruleSet = reglasParaPasos(ruleSet, lcSlice.lifecycle, paso);

      // Agregar al vocabulario para etiquetas
      for (const estado of paso.estados) {
        vocabularioNuevo[`estado:${estado.id}`] = estado.nombre;
      }
      for (const accion of paso.acciones) {
        vocabularioNuevo[`accion:${paso.proceso}:${accion.id}`] =
          accion.nombre;
      }
    }

    // Reemplazar los arrays en el input
    (pipe.input as any).lifecycles = lifecyclesArray;
    (pipe.input as any).vocabulario = vocabularioNuevo;
    (pipe.input as any).ruleSet = ruleSet;
  }

  const spec = generateUiSpec(pipe.input);
  if (!isValidatedUiSpec(spec)) {
    throw new Error("generateUiSpec no devolvió UiSpec sellada");
  }

  const sedesField = sample.organizacion.sedes;
  const ds = proposeDesignSystems({
    companyId: profileId,
    businessDescription: sample.descripcion,
    identity: { brandName: sample.nombre },
    senales: senalesDe(pipe.input, Array.isArray(sedesField.valor) ? sedesField.valor.length : 1),
  }).proposals[0]!;

  const roles = pipe.input.roles.map((r) => ({
    id: r.id,
    label: r.label,
  }));
  if (!roles.some((r) => r.id === "cliente")) {
    roles.push({ id: "cliente", label: "Cliente (portal)" });
  }

  return {
    profileId,
    brandName: sample.nombre,
    spec,
    input: pipe.input,
    designSystem: ds,
    questions,
    roles,
    samplePartes: [...DEFAULT_SAMPLE_PARTES],
    sampleRows: buildSampleRows(spec),
    unrendered: unrenderedNotes(spec),
  };
}

/**
 * Arranca la concesionaria (pack + compositor).
 */
export function bootConcesionaria(): AppBootResult {
  const input = buildConcesionariaGeneratorInputWithComposition();
  const spec = generateUiSpec(input);
  if (!isValidatedUiSpec(spec)) {
    throw new Error("generateUiSpec no devolvió UiSpec sellada");
  }
  const ds = proposeDesignSystems({
    companyId: "concesionaria",
    businessDescription:
      "Concesionario de vehículos: venta, financiación y taller",
    identity: { brandName: "Concesionaria ABS" },
    senales: senalesDe(input, 1),
  }).proposals[0]!;

  const roles = input.roles.map((r) => ({ id: r.id, label: r.label }));
  if (!roles.some((r) => r.id === "cliente")) {
    roles.push({ id: "cliente", label: "Cliente (portal)" });
  }

  return {
    profileId: "concesionaria",
    brandName: "Concesionaria ABS",
    spec,
    input,
    designSystem: ds,
    questions: [],
    roles,
    samplePartes: [...DEFAULT_SAMPLE_PARTES],
    sampleRows: buildSampleRows(spec),
    unrendered: unrenderedNotes(spec),
  };
}

/**
 * Perfil demo de intermediación (marketplace) — cubre el 6º arquetipo
 * cuando ningún sample lo trae como dominante.
 */
export function bootMarketplaceIntermediacion(): AppBootResult {
  const arch = requireArchetype("intermediacion");
  const roles = [
    { id: "operador", label: "Operador" },
    { id: "vendedor", label: "Vendedor" },
    { id: "cliente", label: "Cliente" },
  ] as const;
  const permissionGuards = arch.lifecycle.transitions.map((t, i) => ({
    kind: "guard" as const,
    id: `guard:mkt-${t.id}`,
    priority: 100 + i,
    transitionId: t.id,
    action: "ejecutar" as const,
    allowedRoles: ["operador", "vendedor"],
    sourcePolicyId: "perm-marketplace",
    sourceKind: "permiso" as const,
    binding: { mode: "live" as const, phase: "permiso" as const },
  }));
  const emptyRules: CompiledRuleSet = {
    version: "1",
    activationAt: "2026-01-01T00:00:00.000Z",
    sourceDocumentId: "pol-marketplace",
    sourceDocumentVersion: "1",
    companyId: "marketplace-intermediacion",
    archetypeId: "intermediacion",
    contentHash: "demo-intermediacion",
    roles: [...roles],
    rules: permissionGuards,
    actorDirectory: {},
    deadlines: [],
    goals: [],
  };
  const input: GeneratorInput = {
    caseId: "case-marketplace-intermediacion",
    caseVersion: "1.0.0",
    companyId: "marketplace-intermediacion",
    generatedAt: "2026-06-01T00:00:00.000Z",
    lifecycles: [
      {
        id: "lc.intermediacion",
        archetypeId: "intermediacion",
        lifecycle: arch.lifecycle,
        label: "Marketplace",
        compositionRole: "dominant",
      },
    ],
    composition: { dominant: "intermediacion", secondaries: [] },
    ruleSet: emptyRules,
    roles: [...roles],
    channels: ["backoffice", "web", "autoservicio"],
    resourceSubtypes: ["not_applicable"],
    naturalezaBienes: ["propios_por_cantidad"],
    paymentMode: "inmediato",
    hasPartes: true,
    hasMovimientos: true,
    hasFormalDocuments: true,
    hasFiscalCompliance: false,
    hasCalendar: false,
  };
  const spec = generateUiSpec(input);
  if (!isValidatedUiSpec(spec)) {
    throw new Error("marketplace: UiSpec no sellada");
  }
  const ds = proposeDesignSystems({
    companyId: "marketplace-intermediacion",
    businessDescription: "Marketplace de intermediación entre partes",
    identity: { brandName: "ABS Marketplace" },
    senales: senalesDe(input, 1),
  }).proposals[0]!;
  return {
    profileId: "marketplace-intermediacion",
    brandName: "ABS Marketplace",
    spec,
    input,
    designSystem: ds,
    questions: [],
    roles: [
      { id: "operador", label: "Operador" },
      { id: "vendedor", label: "Vendedor" },
      { id: "cliente", label: "Cliente (portal)" },
    ],
    samplePartes: [...DEFAULT_SAMPLE_PARTES],
    sampleRows: buildSampleRows(spec),
    unrendered: unrenderedNotes(spec),
  };
}

export function bootProfile(id: string): AppBootResult {
  if (id === "concesionaria") return bootConcesionaria();
  if (id === "marketplace-intermediacion") {
    return bootMarketplaceIntermediacion();
  }
  return bootSampleProfile(id);
}

export function allBootableIds(): readonly string[] {
  return [
    ...listSampleProfileIds(),
    "concesionaria",
    "marketplace-intermediacion",
  ];
}
