/**
 * BusinessProfile → GeneratorInput.
 * Aplica política ante desconocidos; nunca llama a generateUiSpec.
 */

import { requireArchetype } from "../../archetypes/catalog.js";
import type { ArchetypeId, ComposedArchetypeSpec } from "../../archetypes/types.js";
import { validateComposition } from "../../archetypes/composition.js";
import type { RecursoSubtype } from "../../elements/subtypes.js";
import type { PresentationChannel } from "../../presentation/types.js";
import type {
  GeneratorInput,
  NaturalezaBien,
  PaymentMode,
} from "../../generator/types.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../../policies/compiler.js";
import type {
  CompliancePolicy,
  PermissionPolicy,
  PolicyDocument,
  RoleDef,
  BusinessPolicy,
} from "../../policies/types.js";
import type { CalendarDef } from "../../policies/calendario.js";
import type { ProfileField } from "./field.js";
import { isKnown, isNotApplicable, isUnknown } from "./field.js";
import type {
  BusinessLocation,
  BusinessProfile,
  PermissionFallback,
  ProcessDecl,
  UnknownPolicy,
} from "./types.js";
import { BusinessProfileError } from "./types.js";
import { validateBusinessProfile } from "./validate.js";
import {
  defaultBusinessHoursCalendar,
  DEFAULT_CALENDAR_CONFIDENCE,
} from "./defaults.js";
import { holidaysForLocation } from "./holidays.js";
import { generateSystemIds, type SystemIds } from "./system-ids.js";
import {
  catalogFieldsForTemplates,
  compilePolicyTemplates,
} from "../policy-templates/compile.js";
import type { PolicyTemplateInvocation } from "../policy-templates/types.js";

export interface MaterializeOptions {
  readonly generatedAt?: string;
  /** Ids técnicos (fuera del contrato). Si se omiten, se generan. */
  readonly systemIds?: Partial<SystemIds>;
}

export interface MaterializeResult {
  readonly input: GeneratorInput;
  /** Defaults aplicados que el producto debe confirmar con el usuario. */
  readonly confirmations: readonly string[];
  readonly systemIds: SystemIds;
}

/** Política por campo ante status=unknown (ver CONTRACT.md). */
export const UNKNOWN_FIELD_POLICY: Readonly<
  Record<string, UnknownPolicy>
> = {
  processes: "ask",
  composition: "default_safe",
  channels: "ask",
  paymentMode: "ask",
  resourceSubtypes: "default_safe",
  naturalezaBienes: "ask",
  "cobros.aCredito": "ask",
  "cobros.aPlazos": "ask",
  "cobros.fianzas": "default_safe",
  "cobros.cuotasRecurrentes": "ask",
  "cobros.pagosPorHitos": "default_safe",
  capacityMode: "default_safe",
  policyTemplates: "default_safe",
  portalCliente: "ask",
  location: "default_safe",
  "capabilities.hasPartes": "default_safe",
  "capabilities.hasMovimientos": "default_safe",
  "capabilities.hasFormalDocuments": "ask",
  "capabilities.hasFiscalCompliance": "ask",
  "capabilities.hasCalendar": "ask",
  roles: "ask",
  calendar: "confirm",
  permissions: "default_safe",
  permissionFallback: "ask",
  compliance: "default_safe",
  catalogFields: "default_safe",
  organization: "default_safe",
  businessPolicies: "default_safe",
  pipelineStateIds: "default_safe",
};

const DEFAULT_GENERATED_AT = "2026-06-01T00:00:00.000Z";

function resolveKnownOrThrow<T>(
  field: ProfileField<T>,
  path: string,
  required: boolean,
): T | undefined {
  if (isKnown(field)) return field.value;
  if (isNotApplicable(field)) {
    if (required) {
      throw new BusinessProfileError(
        "NOT_APPLICABLE_REQUIRED",
        `Campo requerido "${path}" es not_applicable`,
        [path],
      );
    }
    return undefined;
  }
  const policy = UNKNOWN_FIELD_POLICY[path] ?? "ask";
  if (policy === "ask" || policy === "block") {
    throw new BusinessProfileError(
      "INCOMPLETE",
      `Campo "${path}" desconocido: se requiere respuesta del usuario`,
      [path],
    );
  }
  // default_safe | confirm → caller supplies default
  return undefined;
}

function expandPermissions(
  explicit: readonly PermissionPolicy[],
  fallback: PermissionFallback | undefined,
  transitionIds: readonly string[],
): PermissionPolicy[] {
  const covered = new Set(
    explicit
      .map((p) => p.transitionId)
      .filter((id): id is string => typeof id === "string"),
  );
  for (const id of fallback?.excludeTransitionIds ?? []) {
    covered.add(id);
  }
  const out: PermissionPolicy[] = [...explicit];
  if (!fallback) return out;
  for (const tid of transitionIds) {
    if (covered.has(tid)) continue;
    out.push({
      id: `perm-${tid}`,
      kind: "permiso",
      transitionId: tid,
      allowedRoles: [fallback.roleId],
    });
  }
  return out;
}

/**
 * Autoservicio ⇒ rol cliente + visibilidad scope propia (default y máximo).
 */
function ensurePortalClienteDefaults(
  channels: readonly PresentationChannel[],
  roles: RoleDef[],
  permissions: PermissionPolicy[],
): { roles: RoleDef[]; permissions: PermissionPolicy[] } {
  if (!channels.includes("autoservicio")) {
    return { roles, permissions };
  }
  const rolesOut = [...roles];
  if (!rolesOut.some((r) => r.id === "cliente")) {
    rolesOut.push({ id: "cliente", label: "Cliente" });
  }
  const permsOut = permissions.map((p) => {
    if (
      p.action === "consultar" &&
      p.allowedRoles.includes("cliente") &&
      p.visibility &&
      p.visibility.scope !== "propia"
    ) {
      // Máximo: solo propia
      return { ...p, visibility: { scope: "propia" as const } };
    }
    return p;
  });
  const hasClienteVis = permsOut.some(
    (p) =>
      p.action === "consultar" &&
      p.allowedRoles.includes("cliente") &&
      p.visibility?.scope === "propia",
  );
  if (!hasClienteVis) {
    permsOut.push({
      id: "perm-portal-cliente",
      kind: "permiso",
      action: "consultar",
      allowedRoles: ["cliente"],
      visibility: { scope: "propia" },
    });
  }
  return { roles: rolesOut, permissions: permsOut };
}

function mergeHolidayExceptions(
  calendar: CalendarDef,
  location: BusinessLocation | undefined,
): CalendarDef {
  if (!location) return calendar;
  const holidays = holidaysForLocation(location);
  if (holidays.length === 0) return calendar;
  const byDate = new Map<string, (typeof holidays)[number]>();
  for (const ex of calendar.exceptions ?? []) {
    byDate.set(ex.date, ex);
  }
  for (const h of holidays) {
    if (!byDate.has(h.date)) byDate.set(h.date, h);
  }
  return {
    ...calendar,
    exceptions: [...byDate.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}

/**
 * Materializa un perfil ya validado. Devuelve confirmaciones de defaults.
 */
export function materializeBusinessProfileDetailed(
  profile: BusinessProfile,
  options: MaterializeOptions = {},
): MaterializeResult {
  const confirmations: string[] = [];
  const systemIds = generateSystemIds(
    profile.identity.companyId,
    profile.policyMeta.documentVersion,
    options.systemIds,
  );

  const processes = resolveKnownOrThrow(
    profile.processes,
    "processes",
    true,
  ) as readonly ProcessDecl[];

  const channels = resolveKnownOrThrow(
    profile.channels,
    "channels",
    true,
  ) as readonly PresentationChannel[];

  const paymentMode = resolveKnownOrThrow(
    profile.paymentMode,
    "paymentMode",
    true,
  ) as PaymentMode;

  let resourceSubtypes = resolveKnownOrThrow(
    profile.resourceSubtypes,
    "resourceSubtypes",
    false,
  ) as readonly RecursoSubtype[] | undefined;
  if (resourceSubtypes === undefined) {
    resourceSubtypes = [];
  }

  let naturalezaBienes = resolveKnownOrThrow(
    profile.naturalezaBienes,
    "naturalezaBienes",
    false,
  ) as readonly NaturalezaBien[] | undefined;
  // unknown ⇒ ask (lanza). not_applicable / ausente de valor ⇒ [].
  if (naturalezaBienes === undefined) {
    naturalezaBienes = [];
  }

  // Cobros v1.2: subcampos unknown respetan UNKNOWN_FIELD_POLICY.
  if (profile.cobros) {
    resolveKnownOrThrow(profile.cobros.aCredito, "cobros.aCredito", false);
    resolveKnownOrThrow(profile.cobros.aPlazos, "cobros.aPlazos", false);
    resolveKnownOrThrow(profile.cobros.fianzas, "cobros.fianzas", false);
    resolveKnownOrThrow(
      profile.cobros.cuotasRecurrentes,
      "cobros.cuotasRecurrentes",
      false,
    );
    resolveKnownOrThrow(
      profile.cobros.pagosPorHitos,
      "cobros.pagosPorHitos",
      false,
    );
  }

  // portalCliente unknown ⇒ ask (MUST_ASK). Si known+autoservicio, exige canal.
  if (profile.portalCliente) {
    const portal = resolveKnownOrThrow(
      profile.portalCliente,
      "portalCliente",
      false,
    ) as { autoservicio: boolean } | undefined;
    if (portal?.autoservicio === true && !channels.includes("autoservicio")) {
      throw new BusinessProfileError(
        "CONTRADICTION",
        'portalCliente.autoservicio=true requiere canal "autoservicio"',
        ["portalCliente", "channels"],
      );
    }
  }

  if (profile.capacityMode && isUnknown(profile.capacityMode)) {
    resolveKnownOrThrow(profile.capacityMode, "capacityMode", false);
    confirmations.push(
      "capacityMode: aplicado default cita_individual; confirmar plazas si aplica",
    );
  }

  let location = resolveKnownOrThrow(
    profile.location,
    "location",
    false,
  ) as BusinessLocation | undefined;

  let roles = [
    ...(resolveKnownOrThrow(profile.roles, "roles", true) as readonly RoleDef[]),
  ];

  const hasPartes =
    resolveKnownOrThrow(
      profile.capabilities.hasPartes,
      "capabilities.hasPartes",
      false,
    ) ?? true;
  const hasMovimientos =
    resolveKnownOrThrow(
      profile.capabilities.hasMovimientos,
      "capabilities.hasMovimientos",
      false,
    ) ?? true;

  const hasFormalDocuments = resolveKnownOrThrow(
    profile.capabilities.hasFormalDocuments,
    "capabilities.hasFormalDocuments",
    true,
  ) as boolean;
  const hasFiscalCompliance = resolveKnownOrThrow(
    profile.capabilities.hasFiscalCompliance,
    "capabilities.hasFiscalCompliance",
    true,
  ) as boolean;
  const hasCalendar = resolveKnownOrThrow(
    profile.capabilities.hasCalendar,
    "capabilities.hasCalendar",
    true,
  ) as boolean;

  let calendar: CalendarDef | undefined;
  if (hasCalendar) {
    if (isKnown(profile.calendar)) {
      calendar = mergeHolidayExceptions(
        profile.calendar.value as CalendarDef,
        location,
      );
    } else if (isNotApplicable(profile.calendar)) {
      throw new BusinessProfileError(
        "NOT_APPLICABLE_REQUIRED",
        'hasCalendar=true (tiene citas) no admite calendar=not_applicable',
        ["calendar"],
      );
    } else {
      // unknown → default L-V 9-18 + festivos de ubicación; confirmar
      calendar = mergeHolidayExceptions(
        defaultBusinessHoursCalendar(location),
        location,
      );
      confirmations.push(
        `calendar: aplicado default L-V 09:00-18:00 (confidence≈${DEFAULT_CALENDAR_CONFIDENCE}); confirmar con el usuario`,
      );
    }
  } else if (isKnown(profile.calendar)) {
    throw new BusinessProfileError(
      "CONTRADICTION",
      "hasCalendar=false pero calendar está known",
      ["calendar"],
    );
  }

  let permissionsExplicit =
    resolveKnownOrThrow(profile.permissions, "permissions", false) ??
    ([] as PermissionPolicy[]);

  const fallback = resolveKnownOrThrow(
    profile.permissionFallback,
    "permissionFallback",
    true,
  ) as PermissionFallback;

  let compliance =
    resolveKnownOrThrow(profile.compliance, "compliance", false) ??
    ([] as CompliancePolicy[]);

  let catalogFields =
    resolveKnownOrThrow(profile.catalogFields, "catalogFields", false) ??
    (["importe", "parte_id"] as const);

  const lifecycles = processes.map((p) => {
    const arch = requireArchetype(p.archetypeId as ArchetypeId);
    return {
      id: p.id,
      archetypeId: p.archetypeId,
      lifecycle: arch.lifecycle,
      ...(p.label !== undefined ? { label: p.label } : {}),
      ...(p.exchangeDirection !== undefined
        ? { exchangeDirection: p.exchangeDirection }
        : {}),
    };
  });

  let composition: ComposedArchetypeSpec | undefined;
  if (profile.composition && isKnown(profile.composition)) {
    composition = profile.composition.value as ComposedArchetypeSpec;
    const result = validateComposition(composition);
    if (!result.ok) {
      throw new BusinessProfileError(
        "CONTRADICTION",
        `Composición inválida: ${result.issues.map((i) => i.message).join("; ")}`,
        result.issues.map((i) => i.code),
      );
    }
    const processArch = new Set(processes.map((p) => p.archetypeId));
    if (!processArch.has(composition.dominant)) {
      throw new BusinessProfileError(
        "CONTRADICTION",
        `composition.dominant="${composition.dominant}" no está en processes`,
        ["composition.dominant"],
      );
    }
    for (const sec of composition.secondaries) {
      if (!processArch.has(sec.secondaryArchetypeId)) {
        throw new BusinessProfileError(
          "CONTRADICTION",
          `secundario "${sec.secondaryArchetypeId}" no está en processes`,
          ["composition.secondaries"],
        );
      }
    }
  }
  // unknown / not_applicable / ausente → sin composición (procesos independientes)

  const lifecyclesWithRole = lifecycles.map((l) => {
    if (!composition) {
      return { ...l, compositionRole: "standalone" as const };
    }
    if (l.archetypeId === composition.dominant) {
      return { ...l, compositionRole: "dominant" as const };
    }
    if (
      composition.secondaries.some(
        (s) => s.secondaryArchetypeId === l.archetypeId,
      )
    ) {
      return { ...l, compositionRole: "secondary" as const };
    }
    return { ...l, compositionRole: "standalone" as const };
  });

  const transitionIds = [
    ...new Set(
      lifecyclesWithRole.flatMap((l) =>
        l.lifecycle.transitions.map((t) => t.id),
      ),
    ),
  ];
  const stateIds = [
    ...new Set(
      lifecyclesWithRole.flatMap((l) => l.lifecycle.states.map((s) => s.id)),
    ),
  ];

  let permissions = expandPermissions(
    permissionsExplicit,
    fallback,
    transitionIds,
  );

  const portal = ensurePortalClienteDefaults(channels, roles, permissions);
  roles = portal.roles;
  permissions = portal.permissions;

  const orgKnown = isKnown(profile.organization)
    ? profile.organization.value
    : undefined;
  const bizPolicies: BusinessPolicy[] = isKnown(profile.businessPolicies)
    ? [...profile.businessPolicies.value]
    : [];

  let templateCompliance: CompliancePolicy[] = [];
  let templateCatalogExtras: readonly string[] = [];
  if (profile.policyTemplates) {
    const invs = resolveKnownOrThrow(
      profile.policyTemplates,
      "policyTemplates",
      false,
    ) as readonly PolicyTemplateInvocation[] | undefined;
    if (invs && invs.length > 0) {
      const compiled = compilePolicyTemplates(invs);
      bizPolicies.push(...compiled.policies);
      templateCompliance = [...compiled.compliance];
      permissions = [...permissions, ...compiled.permissions];
      templateCatalogExtras = catalogFieldsForTemplates(invs);
    }
  }

  compliance = [...compliance, ...templateCompliance];

  const document: PolicyDocument = {
    id: systemIds.documentId,
    version: profile.policyMeta.documentVersion,
    companyId: profile.identity.companyId,
    archetypeId: profile.policyMeta.dominantArchetypeId,
    roles: [...roles],
    permissions: [...permissions],
    compliance: [...compliance],
    ...(calendar !== undefined ? { calendar } : {}),
    ...(orgKnown !== undefined ? { organization: orgKnown } : {}),
    ...(bizPolicies.length > 0 ? { policies: [...bizPolicies] } : {}),
  };

  const catalogFieldSet = new Set<string>([...catalogFields]);
  for (const f of templateCatalogExtras) catalogFieldSet.add(f);
  // Campos mínimos usados por plantillas/cumplimiento frecuentes
  if (![...catalogFieldSet].includes("importe")) catalogFieldSet.add("importe");

  const catalog = catalogFromLifecycle(
    transitionIds,
    stateIds,
    [...catalogFieldSet],
  );

  try {
    const ruleSet = compilePolicies(document, {
      catalog,
      activationAt: systemIds.activationAt!,
      compiledVersion: systemIds.compiledVersion,
    });

    const pipeline =
      resolveKnownOrThrow(
        profile.pipelineStateIds,
        "pipelineStateIds",
        false,
      ) ?? undefined;

    const input: GeneratorInput = {
      caseId: systemIds.caseId,
      caseVersion: systemIds.caseVersion,
      companyId: profile.identity.companyId,
      generatedAt: options.generatedAt ?? DEFAULT_GENERATED_AT,
      lifecycles: lifecyclesWithRole,
      ...(composition !== undefined ? { composition } : {}),
      ruleSet,
      roles: document.roles,
      channels: [...channels],
      resourceSubtypes: [...resourceSubtypes],
      naturalezaBienes: [...naturalezaBienes],
      paymentMode,
      hasPartes,
      hasMovimientos,
      hasFormalDocuments,
      hasFiscalCompliance,
      hasCalendar,
      ...(pipeline !== undefined ? { pipelineStateIds: pipeline } : {}),
      ...(profile.vocabulario !== undefined
        ? { vocabulario: profile.vocabulario }
        : {}),
      ...(profile.fichas !== undefined ? { fichas: profile.fichas } : {}),
    };

    return {
      input,
      confirmations: Object.freeze([...confirmations]),
      systemIds,
    };
  } catch (err) {
    if (err instanceof BusinessProfileError) throw err;
    throw new BusinessProfileError(
      "MATERIALIZE",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export function materializeBusinessProfile(
  profile: BusinessProfile,
  options: MaterializeOptions = {},
): GeneratorInput {
  return materializeBusinessProfileDetailed(profile, options).input;
}

export function businessProfileToGeneratorInput(
  raw: unknown,
  options?: MaterializeOptions,
): GeneratorInput {
  const profile = validateBusinessProfile(raw);
  return materializeBusinessProfile(profile, options);
}
