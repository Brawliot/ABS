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

export const businessProfileZod = z.object({
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
});

export type BusinessProfileZod = z.infer<typeof businessProfileZod>;

export const SUPPORTED_SCHEMA_VERSIONS = new Set<string>([
  BUSINESS_PROFILE_SCHEMA_VERSION_V11,
  BUSINESS_PROFILE_SCHEMA_VERSION,
]);
