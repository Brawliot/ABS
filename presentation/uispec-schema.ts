/**
 * Esquema Zod estructural de UiSpec (validación en tiempo de ejecución).
 */

import { z } from "zod";
import { PRESENTATION_SCHEMA_VERSION } from "./types.js";

export const SUPPORTED_PRESENTATION_SCHEMA_VERSIONS = new Set<string>([
  PRESENTATION_SCHEMA_VERSION,
]);

const channelSchema = z.enum([
  "presencial",
  "backoffice",
  "autoservicio",
  "taller",
  "web",
]);

const viewKindSchema = z.enum([
  "tablero",
  "lista",
  "detalle",
  "formulario",
  "panel_agenda",
  "panel_retencion",
  "panel_credito",
  "panel_periodos",
  "panel_bloqueo",
  "portal_filtro",
]);

const admittedPatternsSchema = z.object({
  listados: z.array(z.enum(["tabla", "tarjetas", "lista"])),
  navegacion: z.array(z.enum(["lateral", "superior", "inferior_movil"])),
  formularios: z.array(z.enum(["una_columna", "dos_columnas", "por_pasos"])),
  tableros: z.array(z.enum(["kanban", "lista_agrupada"])),
});

const formFieldSchema = z.object({
  name: z.string().min(1),
  labelKey: z.string().min(1),
  type: z.enum(["string", "number", "boolean", "date", "enum", "reference"]),
  required: z.boolean(),
  enumValues: z.array(z.string()).optional(),
  referenceEntity: z.string().min(1).optional(),
});

const formSchema = z.object({
  id: z.string().min(1),
  entityKind: z.string().min(1),
  fields: z.array(formFieldSchema),
});

const actionSchema = z.object({
  id: z.string().min(1),
  transitionId: z.string().min(1),
  lifecycleId: z.string().min(1),
  labelKey: z.string().min(1),
  visibleRoles: z.array(z.string().min(1)),
  requiredEvidenceKind: z.string().min(1),
  evidenceFields: z.array(formFieldSchema),
  formId: z.string().min(1).optional(),
});

const viewSchema = z.object({
  id: z.string().min(1),
  kind: viewKindSchema,
  labelKey: z.string().min(1),
  stateId: z.string().min(1).nullable(),
  lifecycleId: z.string().min(1).nullable(),
  actionIds: z.array(z.string()),
  formId: z.string().min(1).optional(),
  admittedPatterns: admittedPatternsSchema,
  presentation: z.record(z.string()).optional(),
});

const processGroupSchema = z.object({
  id: z.string().min(1),
  labelKey: z.string().min(1),
  lifecycleId: z.string().min(1),
  archetypeId: z.string().min(1),
  role: z.enum(["dominant", "secondary", "standalone"]),
  bloqueaStateId: z.string().min(1).optional(),
  bornInDominantState: z.string().min(1).optional(),
  viewIds: z.array(z.string()),
  actionIds: z.array(z.string()),
  panelIds: z.array(z.string()),
  recorridoId: z.string().min(1),
  channel: channelSchema,
  roleIds: z.array(z.string()),
});

const recorridoSchema = z.object({
  id: z.string().min(1),
  labelKey: z.string().min(1),
  steps: z.array(z.string()),
  roleIds: z.array(z.string()),
});

const moduleSchema = z.object({
  id: z.string().min(1),
  labelKey: z.string().min(1),
  ruleId: z.string().min(1),
  channel: channelSchema,
  roleIds: z.array(z.string()),
  viewIds: z.array(z.string()),
  actionIds: z.array(z.string()),
  recorridoIds: z.array(z.string()),
});

const identitySchema = z.object({
  brandName: z.string().optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
});

const localizationSchema = z.object({
  locale: z.string().min(1),
  strings: z.record(z.string()),
});

const contentOverrideSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  labels: z.record(z.string()).optional(),
});

const styleTokenRefsSchema = z.object({
  colorPrimario: z.literal("color.primario"),
  colorSecundario: z.literal("color.secundario"),
  colorFondo: z.literal("color.fondo"),
  colorSuperficie: z.literal("color.superficie"),
  colorTexto: z.literal("color.texto"),
  espaciadoM: z.literal("espaciado.m"),
  tipografiaTitulos: z.literal("tipografia.titulos"),
  tipografiaCuerpo: z.literal("tipografia.cuerpo"),
  densidad: z.literal("densidad.activa"),
  tactilMinimo: z.literal("tactil.minimo"),
});

export const uiSpecZod = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  generatedAt: z.string().min(1),
  sourceCaseId: z.string().min(1),
  sourceCaseVersion: z.string().min(1),
  sourcePolicyHash: z.string().min(1),
  contentHash: z.string().min(1),
  processGroups: z.array(processGroupSchema).optional(),
  modules: z.array(moduleSchema),
  views: z.array(viewSchema),
  actions: z.array(actionSchema),
  forms: z.array(formSchema),
  recorridos: z.array(recorridoSchema),
  identity: identitySchema,
  localization: z.array(localizationSchema),
  content: z.record(contentOverrideSchema),
  styleTokenRefs: styleTokenRefsSchema,
});

export type UiSpecZod = z.infer<typeof uiSpecZod>;
