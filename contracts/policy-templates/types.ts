/**
 * Catálogo de plantillas de política (v1.2 + extensiones del compositor).
 * Cada plantilla compila de forma determinista a BusinessPolicy | CompliancePolicy.
 *
 * POLICY_TEMPLATE_IDS = núcleo v1.2 (congelado para tests prep).
 * POLICY_TEMPLATE_IDS_EXTRA = plantillas añadidas para cerrar expected/*.
 */

export const POLICY_TEMPLATE_IDS = [
  "tpl.descuento_maximo_sin_aprobacion",
  "tpl.importe_requiere_aprobacion",
  "tpl.limite_credito_por_cliente",
  "tpl.bloqueo_por_impago",
  "tpl.plazo_devolucion",
  "tpl.aviso_plazo",
] as const;

/** Plantillas adicionales del compositor (no alteran el array núcleo). */
export const POLICY_TEMPLATE_IDS_EXTRA = [
  "tpl.restriccion_saldo_antes_de",
  "tpl.evidencia_requerida",
  "tpl.fianza_condicional",
  "tpl.permiso_excepcion",
  "tpl.limite_plazos_financiacion",
  "tpl.hitos_pago",
] as const;

export type CorePolicyTemplateId = (typeof POLICY_TEMPLATE_IDS)[number];
export type ExtraPolicyTemplateId = (typeof POLICY_TEMPLATE_IDS_EXTRA)[number];
export type PolicyTemplateId = CorePolicyTemplateId | ExtraPolicyTemplateId;

export const ALL_POLICY_TEMPLATE_IDS: readonly PolicyTemplateId[] = [
  ...POLICY_TEMPLATE_IDS,
  ...POLICY_TEMPLATE_IDS_EXTRA,
];

export interface PolicyTemplateInvocation {
  readonly id: string;
  readonly plantilla: PolicyTemplateId;
  readonly parametros: Readonly<Record<string, string | number | boolean>>;
  /** Transición ancla (si la plantilla la requiere y no viene en params). */
  readonly transitionId?: string;
}
