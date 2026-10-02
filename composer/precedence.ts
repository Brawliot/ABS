/**
 * Precedencia explícita de reglas del compositor.
 *
 * Las 5 reglas financieras pueden entrar en conflicto silenciosamente.
 * Esta tabla define prioridad (mayor número = se aplica primero/gana).
 *
 * Orden de aplicación:
 * 1. R_FINANCIAL_EXPLICIT (si procesos=["financiera"] o similar)
 * 2. R_APLAZOS (aPlazos=true explícito)
 * 3. R_ACREDITO_BOOL_FINANCIERA (aCredito=true)
 * 4. R_PAYMENT_FINANCIADO (paymentMode=financiado)
 * 5. Otras reglas según impacto
 */

export interface RulePrecedence {
  /** ID de regla (debe coincidir con CompositionRule.id) */
  readonly ruleId: string;
  /** Prioridad: 0-100, mayor = gana en conflicto */
  readonly priority: number;
  /** Razón de por qué esta prioridad */
  readonly reason: string;
  /** Qué otras reglas pueden conflictuar con ésta */
  readonly conflictsWith: readonly string[];
}

/**
 * Tabla de precedencia de todas las reglas del compositor.
 * Financieras tienen prioridades 75-100.
 */
export const RULE_PRECEDENCE: readonly RulePrecedence[] = [
  // ——————————————————————————————————————————————————————————————————
  // PREGUNTAS (muy alta prioridad: nunca adivinar si se desconoce)
  // ——————————————————————————————————————————————————————————————————
  {
    ruleId: "R_ASK_APLAZOS",
    priority: 99,
    reason: "aPlazos unknown → preguntar (MUST_ASK); nunca adivinar",
    conflictsWith: ["R_APLAZOS_FINANCIERA"],
  },
  {
    ruleId: "R_ASK_CREDITO",
    priority: 99,
    reason: "aCredito unknown → preguntar (MUST_ASK); nunca adivinar",
    conflictsWith: ["R_ACREDITO_BOOL_FINANCIERA", "R_CUENTA_PARTE"],
  },
  {
    ruleId: "R_ASK_CUOTAS",
    priority: 98,
    reason: "cuotasRecurrentes unknown → preguntar",
    conflictsWith: [],
  },
  {
    ruleId: "R_ASK_NATURALEZA",
    priority: 98,
    reason: "naturalezaBienes unknown → preguntar",
    conflictsWith: [],
  },
  {
    ruleId: "R_ASK_PORTAL",
    priority: 97,
    reason: "portalCliente unknown → preguntar",
    conflictsWith: [],
  },
  {
    ruleId: "R_ASK_CALENDAR",
    priority: 96,
    reason: "calendar unknown + hasCalendar → preguntar",
    conflictsWith: [],
  },

  // ——————————————————————————————————————————————————————————————————
  // REGLAS FINANCIERAS (corazón de la Fase 1)
  // ——————————————————————————————————————————————————————————————————

  /**
   * R_FINANCIAL_EXPLICIT: Si procesos=["financiera"] o paymentMode="financiado" explícito
   * Esta es la MÁS ALTA porque es una declaración explícita del usuario.
   */
  {
    ruleId: "R_FINANCIAL_EXPLICIT",
    priority: 100,
    reason: "Procesos explícitos 'financiera' siempre ganan; máxima confianza del usuario",
    conflictsWith: ["R_APLAZOS_FINANCIERA", "R_ACREDITO_BOOL_FINANCIERA", "R_PAYMENT_FINANCIADO", "R_PROCESO_FINANCIERA"],
  },

  /**
   * R_CUENTA_PARTE: aCredito=cuenta_parte → FORBID financiera + add políticas
   * Prioridad alta porque es una señal clara y PROHIBE financiera.
   */
  {
    ruleId: "R_CUENTA_PARTE",
    priority: 90,
    reason: "Crédito=cuenta Parte: forbid financiera, add políticas; prevalece sobre aplazos",
    conflictsWith: ["R_APLAZOS_FINANCIERA", "R_ACREDITO_BOOL_FINANCIERA", "R_PAYMENT_FINANCIADO"],
  },

  /**
   * R_APLAZOS_FINANCIERA: aPlazos=true → add financiera
   * Prioridad 85: es una señal financiera clara pero no forbid.
   */
  {
    ruleId: "R_APLAZOS_FINANCIERA",
    priority: 85,
    reason: "aPlazos=true explícito → add financiera",
    conflictsWith: ["R_ACREDITO_BOOL_FINANCIERA", "R_PAYMENT_FINANCIADO", "R_PROCESO_FINANCIERA"],
  },

  /**
   * R_ACREDITO_BOOL_FINANCIERA: aCredito=true → add financiera
   * Prioridad 82: similar a aplazos pero un poco menos prioritario
   */
  {
    ruleId: "R_ACREDITO_BOOL_FINANCIERA",
    priority: 82,
    reason: "aCredito=true → add financiera; señal clara pero no forbid",
    conflictsWith: ["R_PAYMENT_FINANCIADO", "R_PROCESO_FINANCIERA"],
  },

  /**
   * R_PAYMENT_FINANCIADO: paymentMode=financiado → add financiera
   * Prioridad 80: modo de pago explícito, pero menos prioritario que aPlazos/aCredito
   */
  {
    ruleId: "R_PAYMENT_FINANCIADO",
    priority: 80,
    reason: "paymentMode='financiado' explícito → add financiera",
    conflictsWith: ["R_PROCESO_FINANCIERA"],
  },

  /**
   * R_PROCESO_FINANCIERA: Proceso financiera presente → add financiera
   * Prioridad 78: menos prioritario que las señales de cobros/paymentMode
   */
  {
    ruleId: "R_PROCESS_FINANCIERA",
    priority: 78,
    reason: "Proceso 'financiera' presente → add financiera (pero menos que aPlazos/aCredito)",
    conflictsWith: [],
  },

  // ——————————————————————————————————————————————————————————————————
  // OTRAS REGLAS
  // ——————————————————————————————————————————————————————————————————

  {
    ruleId: "R_FIANZAS_RETENCION",
    priority: 70,
    reason: "Retención → liquidación antes de cierre; no inventar secundaria",
    conflictsWith: [],
  },
  {
    ruleId: "R_FIANZA_CONDICIONAL",
    priority: 69,
    reason: "Retención con umbral → tpl.fianza_condicional",
    conflictsWith: [],
  },
  {
    ruleId: "R_HITOS",
    priority: 68,
    reason: "pagosPorHitos → compromisos+bloqueos; no N financieras",
    conflictsWith: [],
  },
  {
    ruleId: "R_TALLER_SALDO_ENTREGA",
    priority: 50,
    reason: "Taller → restricción saldo antes de cerrar",
    conflictsWith: [],
  },
  {
    ruleId: "R_SUBCONTRATA_DOC",
    priority: 45,
    reason: "Subcontrata → documentar (SECONDARY_EQUALS_DOMINANT)",
    conflictsWith: [],
  },
  {
    ruleId: "R_SERVICIO_POSTVENTA",
    priority: 40,
    reason: "Venta + servicio → secundaria postventa",
    conflictsWith: [],
  },
  {
    ruleId: "R_CAPACITY_PLAZAS",
    priority: 35,
    reason: "capacityMode=plazas",
    conflictsWith: [],
  },
  {
    ruleId: "R_CAPACITY_DEFAULT",
    priority: 34,
    reason: "capacityMode unknown + servicios → default cita_individual",
    conflictsWith: [],
  },
  {
    ruleId: "R_PORTAL_VISIBILITY",
    priority: 30,
    reason: "autoservicio → visibilidad propia",
    conflictsWith: [],
  },
  {
    ruleId: "R_DOC_FILTRO_SENSIBLE",
    priority: 10,
    reason: "Datos sensibles → documentar filtro",
    conflictsWith: [],
  },
];

/**
 * Obtener prioridad de una regla por su ID.
 * Retorna 0 si la regla no existe (nunca se aplica).
 */
export function getRulePriority(ruleId: string): number {
  return RULE_PRECEDENCE.find((r) => r.ruleId === ruleId)?.priority ?? 0;
}

/**
 * Obtener metadatos de precedencia de una regla.
 * Útil para auditoría: por qué se aplicó esta regla sobre otras.
 */
export function getRulePrecedenceInfo(ruleId: string): RulePrecedence | undefined {
  return RULE_PRECEDENCE.find((r) => r.ruleId === ruleId);
}

/**
 * Ordenar un array de rule IDs por precedencia (descendente).
 * Mayor prioridad primero (se aplica antes/gana en conflictos).
 */
export function sortRuleIdsByPrecedence(ruleIds: readonly string[]): string[] {
  return [...ruleIds].sort((a, b) => getRulePriority(b) - getRulePriority(a));
}

/**
 * Verificar si dos reglas pueden conflictuar.
 * Útil para auditoría y validación.
 */
export function canRulesConflict(ruleIdA: string, ruleIdB: string): boolean {
  const infoA = getRulePrecedenceInfo(ruleIdA);
  const infoB = getRulePrecedenceInfo(ruleIdB);
  if (!infoA || !infoB) return false;
  return infoA.conflictsWith.includes(ruleIdB) || infoB.conflictsWith.includes(ruleIdA);
}
