/**
 * Esquema Zod del BusinessProfile v1.2 (válido también para v1.1.0).
 */

import { z } from "zod";
import {
  ARCHETYPE_IDS,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_PROFILE_SCHEMA_VERSION_V11,
  CAPACITY_MODES,
  CAPACITY_RECURSO_SUBTYPES,
  CHANNEL_IDS,
  NATURALEZA_BIENES,
  PAYMENT_MODES,
} from "./types.js";
import { ALL_POLICY_TEMPLATE_IDS } from "../policy-templates/types.js";

const confidenceSchema = z.number().min(0).max(1).optional();

function fieldSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.discriminatedUnion("status", [
    z.object({
      status: z.literal("known"),
      value: valueSchema,
      confidence: confidenceSchema,
    }),
    z.object({
      status: z.literal("unknown"),
      confidence: confidenceSchema,
    }),
    z.object({
      status: z.literal("not_applicable"),
      confidence: confidenceSchema,
    }),
  ]);
}

const roleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

const processSchema = z.object({
  id: z.string().min(1),
  archetypeId: z.enum(ARCHETYPE_IDS),
  label: z.string().min(1).optional(),
  exchangeDirection: z.enum(["empresa_vende", "empresa_compra"]).optional(),
});

const timeWindowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^(\d{2}:\d{2}|24:00)$/),
});

const calendarSchema = z.object({
  id: z.string().min(1),
  weeklyHours: z.record(z.string(), z.array(timeWindowSchema)),
  exceptions: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        closed: z.boolean().optional(),
        windows: z.array(timeWindowSchema).optional(),
        label: z.string().optional(),
      }),
    )
    .optional(),
  shifts: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        weekdays: z.array(z.number().int().min(0).max(6)),
        window: timeWindowSchema,
        actorIds: z.array(z.string()).optional(),
        recursoIds: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  seasons: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        startDate: z.string(),
        endDate: z.string(),
      }),
    )
    .optional(),
  atRiskBeforeMs: z.number().int().positive().optional(),
});

const visibilitySchema = z.object({
  scope: z.enum(["empresa", "sede", "equipo", "propia"]),
});

const permissionSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("permiso"),
  action: z.enum(["consultar", "ejecutar", "aprobar", "forzar"]).optional(),
  transitionId: z.string().optional(),
  allowedRoles: z.array(z.string().min(1)).min(1),
  visibility: visibilitySchema.optional(),
  binding: z
    .object({
      mode: z.enum(["at_create", "on_state", "live"]),
      stateId: z.string().optional(),
    })
    .optional(),
});

const fieldPredicateSchema = z.object({
  field: z.string().min(1),
  op: z.enum([
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "present",
    "absent",
  ]),
  value: z.union([z.number(), z.string(), z.boolean()]).optional(),
});

const complianceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("cumplimiento"),
  transitionId: z.string().min(1),
  requiredEvidence: z
    .object({
      kind: z.enum(["aceptacion", "sistema", "fisica"]),
      referenceType: z.string().optional(),
      requiredRole: z.string().optional(),
    })
    .optional(),
  invariant: z
    .object({
      id: z.string(),
      predicate: z.string(),
      appliesInStates: z.array(z.string()).optional(),
      description: z.string(),
    })
    .optional(),
  restriction: fieldPredicateSchema.optional(),
  legalDeadline: z
    .object({
      anchorField: z.string(),
      durationMs: z.number().positive(),
      description: z.string(),
    })
    .optional(),
  dataRetention: z
    .object({
      description: z.string(),
    })
    .optional(),
  binding: z
    .object({
      mode: z.enum(["at_create", "on_state", "live"]),
      stateId: z.string().optional(),
    })
    .optional(),
});

const permissionFallbackSchema = z.object({
  roleId: z.string().min(1),
  excludeTransitionIds: z.array(z.string()).optional(),
});

const organizationSchema = z.object({
  sedes: z.array(z.object({ id: z.string(), label: z.string() })),
  equipos: z.array(
    z.object({ id: z.string(), label: z.string(), sedeId: z.string() }),
  ),
  assignments: z.array(
    z.object({
      actorId: z.string(),
      sedeId: z.string(),
      equipoId: z.string(),
      roleId: z.string(),
      reportsTo: z.string().optional(),
    }),
  ),
});

const businessPolicySchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("politica"),
    transitionId: z.string().min(1),
  })
  .passthrough();

const locationSchema = z.object({
  countryCode: z.string().length(2),
  regionCode: z.string().min(1).optional(),
});

const secondaryBindingSchema = z.object({
  secondaryArchetypeId: z.enum(ARCHETYPE_IDS),
  bornInDominantState: z.string().min(1),
  bloquea: z.string().min(1),
});

const compositionSchema = z.object({
  dominant: z.enum(ARCHETYPE_IDS),
  secondaries: z.array(secondaryBindingSchema),
});

const creditoCuentaSchema = z.object({
  kind: z.literal("cuenta_parte"),
  limitePorDefectoEur: z.number().positive().optional(),
  bloqueoImpagoDias: z.number().int().positive().optional(),
});

const plazosDeclSchema = z.object({
  enabled: z.literal(true),
  viaFinanciera: z.boolean().optional(),
});

const fianzaDeclSchema = z.object({
  kind: z.literal("retencion"),
  umbralComensales: z.number().int().positive().optional(),
  noReembolsable: z.boolean().optional(),
});

const cuotasDeclSchema = z.object({
  periodicidad: z.enum(["mensual", "semanal", "anual"]),
  domiciliada: z.boolean().optional(),
});

const hitoPagoSchema = z.object({
  id: z.string().min(1),
  fase: z.string().min(1),
  pct: z.number().positive().max(100).optional(),
  importeEur: z.number().positive().optional(),
  bloqueaStateId: z.string().min(1),
  bornInDominantState: z.string().min(1),
});

const hitosDeclSchema = z.object({
  hitos: z.array(hitoPagoSchema).min(1),
});

const cobrosModelSchema = z.object({
  aCredito: fieldSchema(z.union([z.literal(false), creditoCuentaSchema])),
  aPlazos: fieldSchema(z.union([z.literal(false), plazosDeclSchema])),
  fianzas: fieldSchema(z.union([z.literal(false), fianzaDeclSchema])),
  cuotasRecurrentes: fieldSchema(z.union([z.literal(false), cuotasDeclSchema])),
  pagosPorHitos: fieldSchema(z.union([z.literal(false), hitosDeclSchema])),
});

const POLICY_TEMPLATE_ENUM = ALL_POLICY_TEMPLATE_IDS as unknown as [
  (typeof ALL_POLICY_TEMPLATE_IDS)[number],
  ...(typeof ALL_POLICY_TEMPLATE_IDS)[number][],
];

const policyTemplateInvocationSchema = z.object({
  id: z.string().min(1),
  plantilla: z.enum(POLICY_TEMPLATE_ENUM),
  parametros: z.record(z.union([z.string(), z.number(), z.boolean()])),
  transitionId: z.string().min(1).optional(),
});

const portalClienteSchema = z.object({
  autoservicio: z.boolean(),
});

const baseBusinessProfileZod = z.object({
  schemaVersion: z.string().min(1),
  identity: z.object({
    companyId: z.string().min(1),
  }),
  policyMeta: z.object({
    documentVersion: z.string().min(1),
    dominantArchetypeId: z.enum(ARCHETYPE_IDS),
  }),
  processes: fieldSchema(z.array(processSchema).min(1)),
  composition: fieldSchema(compositionSchema).optional(),
  channels: fieldSchema(z.array(z.enum(CHANNEL_IDS)).min(1)),
  paymentMode: fieldSchema(z.enum(PAYMENT_MODES)),
  cobros: cobrosModelSchema.optional(),
  resourceSubtypes: fieldSchema(z.array(z.enum(CAPACITY_RECURSO_SUBTYPES))),
  capacityMode: fieldSchema(z.enum(CAPACITY_MODES)).optional(),
  naturalezaBienes: fieldSchema(z.array(z.enum(NATURALEZA_BIENES))),
  location: fieldSchema(locationSchema),
  capabilities: z.object({
    hasPartes: fieldSchema(z.boolean()),
    hasMovimientos: fieldSchema(z.boolean()),
    hasFormalDocuments: fieldSchema(z.boolean()),
    hasFiscalCompliance: fieldSchema(z.boolean()),
    hasCalendar: fieldSchema(z.boolean()),
  }),
  roles: fieldSchema(z.array(roleSchema).min(1)),
  calendar: fieldSchema(calendarSchema),
  permissions: fieldSchema(z.array(permissionSchema)),
  permissionFallback: fieldSchema(permissionFallbackSchema),
  compliance: fieldSchema(z.array(complianceSchema)),
  catalogFields: fieldSchema(z.array(z.string().min(1)).min(1)),
  organization: fieldSchema(organizationSchema),
  businessPolicies: fieldSchema(z.array(businessPolicySchema)),
  policyTemplates: fieldSchema(z.array(policyTemplateInvocationSchema)).optional(),
  portalCliente: fieldSchema(portalClienteSchema).optional(),
  pipelineStateIds: fieldSchema(z.array(z.string().min(1))),
  /** Nombres propios del negocio en pantalla (ver presentation/etiquetas.ts). */
  vocabulario: z.record(z.string().min(1).max(120), z.string().min(1).max(80)).optional(),
});

/**
 * Validaciones contextuales adicionales para BusinessProfile.
 * Se aplican tras el parse básico usando superRefine().
 */
export const businessProfileZod = baseBusinessProfileZod.superRefine((data, ctx) => {
  // VALIDACIÓN 1: Si portalCliente.autoservicio=true, debe existir canal "autoservicio"
  if (
    data.portalCliente &&
    "value" in data.portalCliente &&
    data.portalCliente.value?.autoservicio === true
  ) {
    if (
      data.channels.status === "known" &&
      !data.channels.value.includes("autoservicio")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'portalCliente.autoservicio=true requiere canal "autoservicio" en channels',
        path: ["portalCliente"],
      });
    }
  }

  // VALIDACIÓN 2: Si channels incluye "autoservicio", roles debe incluir "cliente"
  if (data.channels.status === "known" && data.channels.value.includes("autoservicio")) {
    if (data.roles.status === "known") {
      const hasClienteRole = data.roles.value.some((r) => r.id === "cliente");
      if (!hasClienteRole) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Canal "autoservicio" requiere rol "cliente" en roles',
          path: ["roles"],
        });
      }
    }
  }

  // VALIDACIÓN 3: resourceSubtypes no puede estar vacío si es known
  if (
    data.resourceSubtypes.status === "known" &&
    Array.isArray(data.resourceSubtypes.value) &&
    data.resourceSubtypes.value.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "resourceSubtypes no puede ser un array vacío. Si no aplica, use status=not_applicable",
      path: ["resourceSubtypes"],
    });
  }

  // VALIDACIÓN 4: Si organization es known, roles debe tener al menos un rol asignado
  if (data.organization.status === "known" && data.organization.value) {
    const org = data.organization.value;
    if (org.assignments && org.assignments.length > 0 && data.roles.status === "known") {
      const assignedRoleIds = new Set(org.assignments.map((a) => a.roleId));
      const roleIds = new Set(data.roles.value.map((r) => r.id));
      for (const assigned of assignedRoleIds) {
        if (!roleIds.has(assigned)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Rol asignado en organization "${assigned}" no existe en roles`,
            path: ["organization"],
          });
        }
      }
    }
  }

  // VALIDACIÓN 5: Si hasCalendar=true, capacityMode es más fuertemente recomendado
  if (
    data.capabilities.hasCalendar.status === "known" &&
    data.capabilities.hasCalendar.value === true &&
    data.capacityMode?.status === "unknown"
  ) {
    // No bloqueamos, pero marcamos que se requiere
    // (el materializador aplicará default)
  }

  // VALIDACIÓN 6: Si tiene "capacidad_temporal" en resourceSubtypes, debe tener hasCalendar=true
  if (
    data.resourceSubtypes.status === "known" &&
    data.resourceSubtypes.value.includes("capacidad_temporal")
  ) {
    if (
      data.capabilities.hasCalendar.status === "known" &&
      data.capabilities.hasCalendar.value === false
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'resourceSubtypes incluye "capacidad_temporal" pero hasCalendar=false (requiere calendarios)',
        path: ["resourceSubtypes"],
      });
    }
  }

  // VALIDACIÓN 7: Si hasFiscalCompliance=true, debe haber hasFormalDocuments=true
  if (
    data.capabilities.hasFiscalCompliance.status === "known" &&
    data.capabilities.hasFiscalCompliance.value === true
  ) {
    if (
      data.capabilities.hasFormalDocuments.status === "known" &&
      data.capabilities.hasFormalDocuments.value === false
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "hasFiscalCompliance=true requiere hasFormalDocuments=true (cumplimiento requiere documentos)",
        path: ["capabilities"],
      });
    }
  }

  // VALIDACIÓN 8: Si tiene compliance policies, no puede haber hasFormalDocuments=false
  if (
    data.capabilities.hasFormalDocuments.status === "known" &&
    data.capabilities.hasFormalDocuments.value === false &&
    data.compliance.status === "known" &&
    data.compliance.value.length > 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "hasFormalDocuments=false incompatible con políticas de compliance (requieren documentos)",
      path: ["capabilities"],
    });
  }

  // VALIDACIÓN 9: roles no puede estar vacío si es known
  if (data.roles.status === "known" && data.roles.value.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "roles no puede ser un array vacío. Debe haber al menos un rol definido",
      path: ["roles"],
    });
  }

  // VALIDACIÓN 10: Inconsistencia de composición con dominantArchetypeId
  if (
    data.composition?.status === "known" &&
    data.composition.value.dominant !== data.policyMeta.dominantArchetypeId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `composition.dominant="${data.composition.value.dominant}" no coincide con policyMeta.dominantArchetypeId="${data.policyMeta.dominantArchetypeId}"`,
      path: ["composition"],
    });
  }

  // VALIDACIÓN 11: Si processes tiene exchangeDirection="empresa_vende" con paymentMode=diferido
  // entonces requiere hasFormalDocuments=true (facturas)
  if (data.processes.status === "known" && data.processes.value.length > 0) {
    const hasVendor = data.processes.value.some(
      (p) => p.exchangeDirection === "empresa_vende",
    );
    if (
      hasVendor &&
      data.paymentMode.status === "known" &&
      data.paymentMode.value === "diferido"
    ) {
      if (
        data.capabilities.hasFormalDocuments.status === "known" &&
        data.capabilities.hasFormalDocuments.value === false
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'empresa_vende con paymentMode="diferido" requiere hasFormalDocuments=true (facturas)',
          path: ["paymentMode"],
        });
      }
    }
  }

  // VALIDACIÓN 12: naturalezaBienes con "propios_por_cantidad" requiere hasPartes=true
  if (
    data.naturalezaBienes.status === "known" &&
    data.naturalezaBienes.value.includes("propios_por_cantidad")
  ) {
    if (
      data.capabilities.hasPartes.status === "known" &&
      data.capabilities.hasPartes.value === false
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'naturalezaBienes="propios_por_cantidad" requiere hasPartes=true (inventario)',
        path: ["naturalezaBienes"],
      });
    }
  }
});

export type BusinessProfileZod = z.infer<typeof businessProfileZod>;

export const SUPPORTED_SCHEMA_VERSIONS = new Set<string>([
  BUSINESS_PROFILE_SCHEMA_VERSION_V11,
  BUSINESS_PROFILE_SCHEMA_VERSION,
]);
