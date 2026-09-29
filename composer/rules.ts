/**
 * Tabla de reglas campo → decisión (datos, no lógica dispersa).
 * El motor en compose.ts interpreta `when` + `then`.
 *
 * Convenciones `when` (DSL mínimo):
 * - always
 * - field:<path>:unknown | known | not_applicable
 * - field:<path>:known_false | known_true
 * - field:<path>:cuenta_parte
 * - field:<path>:retencion
 * - field:<path>:hitos
 * - process:<archetypeId>:present
 * - process:<archetypeId>:absent
 * - dominant:<archetypeId>
 * - paymentMode:<mode>
 * - capacityMode:unknown | plazas | cita_individual
 * - portal:unknown | autoservicio_true
 * - channel:<name>
 * - calendar:unknown | known
 * - and:when1|when2  (todas)
 * - not:when1
 */

import type { CompositionRule } from "./types.js";

export const COMPOSITION_RULES: readonly CompositionRule[] = [
  // —— Preguntas (nunca adivinar) ——
  {
    id: "R_ASK_APLAZOS",
    description: "aPlazos unknown ⇒ preguntar (MUST_ASK)",
    when: "field:cobros.aPlazos:unknown",
    then: [
      {
        type: "ask",
        questionId: "ask.cobros.aPlazos",
        field: "cobros.aPlazos",
        question: "¿El negocio ofrece pago a plazos?",
        oracleRule: "FAIL_IF_COMPOSER_CHOOSES",
      },
    ],
  },
  {
    id: "R_ASK_CREDITO",
    description: "aCredito unknown ⇒ preguntar",
    when: "field:cobros.aCredito:unknown",
    then: [
      {
        type: "ask",
        questionId: "ask.cobros.aCredito",
        field: "cobros.aCredito",
        question: "¿Hay venta a crédito / cuenta de cliente?",
        oracleRule: "FAIL_IF_COMPOSER_CHOOSES",
      },
    ],
  },
  {
    id: "R_ASK_CUOTAS",
    description: "cuotasRecurrentes unknown ⇒ preguntar",
    when: "field:cobros.cuotasRecurrentes:unknown",
    then: [
      {
        type: "ask",
        questionId: "ask.cobros.cuotasRecurrentes",
        field: "cobros.cuotasRecurrentes",
        question: "¿Hay cuotas recurrentes / suscripción?",
        oracleRule: "FAIL_IF_COMPOSER_CHOOSES",
      },
    ],
  },
  {
    id: "R_ASK_NATURALEZA",
    description: "naturalezaBienes unknown ⇒ preguntar",
    when: "field:naturalezaBienes:unknown",
    then: [
      {
        type: "ask",
        questionId: "ask.naturalezaBienes",
        field: "naturalezaBienes",
        question: "¿Qué naturaleza tienen los bienes (stock / unitarios / del cliente)?",
        oracleRule: "FAIL_IF_COMPOSER_CHOOSES",
      },
    ],
  },
  {
    id: "R_ASK_PORTAL",
    description: "portalCliente unknown ⇒ preguntar",
    when: "portal:unknown",
    then: [
      {
        type: "ask",
        questionId: "ask.portalCliente",
        field: "portalCliente.autoservicio",
        question: "¿Hay portal de cliente (autoservicio)?",
        oracleRule: "FAIL_IF_COMPOSER_CHOOSES",
      },
    ],
  },
  {
    id: "R_ASK_CALENDAR",
    description: "calendar unknown + hasCalendar ⇒ pregunta unificada (confirm)",
    when: "and:calendar:unknown|hasCalendar:true",
    then: [
      {
        type: "ask",
        questionId: "confirm.calendar",
        field: "calendar",
        question:
          "Confirme el horario laboral (se aplicará L-V 09:00-18:00 si no indica otro)",
      },
    ],
  },

  // —— Crédito cuenta Parte (NO secundaria financiera) ——
  {
    id: "R_CUENTA_PARTE",
    description: "aCredito cuenta_parte → políticas; prohibir financiera por venta",
    when: "field:cobros.aCredito:cuenta_parte",
    then: [
      {
        type: "forbid_secondary",
        secondaryArchetypeId: "financiera",
        reason: "Crédito = cuenta Parte, no secundaria financiera",
      },
      {
        type: "add_policy",
        plantilla: "tpl.limite_credito_por_cliente",
        parametros: { por_defecto_eur: 1500 },
        idSuffix: "limite-credito",
        transitionId: "t_aceptar",
      },
      {
        type: "add_policy",
        plantilla: "tpl.bloqueo_por_impago",
        parametros: { dias: 45 },
        idSuffix: "bloqueo-impago",
        transitionId: "t_aceptar",
      },
    ],
  },

  // —— Plazos → financiera ——
  {
    id: "R_APLAZOS_FINANCIERA",
    description: "aPlazos enabled → secundaria financiera",
    when: "and:field:cobros.aPlazos:known_true|not:field:cobros.aCredito:cuenta_parte",
    then: [
      {
        type: "add_secondary",
        secondaryArchetypeId: "financiera",
      },
    ],
  },

  // —— Proceso financiera ya declarado (p.ej. concesionaria) ——
  {
    id: "R_PROCESS_FINANCIERA",
    description: "Proceso financiera presente (y no prohibido) → binding",
    when: "and:process:financiera:present|not:field:cobros.aCredito:cuenta_parte|not:field:cobros.aPlazos:unknown",
    then: [
      {
        type: "add_secondary",
        secondaryArchetypeId: "financiera",
      },
    ],
  },

  // —— paymentMode financiado sin cuenta_parte ni ask aPlazos ——
  {
    id: "R_PAYMENT_FINANCIADO",
    description: "paymentMode financiado → financiera si no hay ask aPlazos ni cuenta",
    when:
      "and:paymentMode:financiado|not:field:cobros.aCredito:cuenta_parte|not:field:cobros.aPlazos:unknown|not:field:cobros.aPlazos:known_false",
    then: [
      {
        type: "add_secondary",
        secondaryArchetypeId: "financiera",
      },
    ],
  },

  // —— aCredito true booleano (no cuenta) → financiera ——
  {
    id: "R_ACREDITO_BOOL_FINANCIERA",
    description: "aCredito true (crédito financiero, no cuenta) → financiera",
    when: "and:field:cobros.aCredito:known_true|not:field:cobros.aCredito:cuenta_parte",
    then: [
      {
        type: "add_secondary",
        secondaryArchetypeId: "financiera",
      },
    ],
  },

  // —— Fianzas / retención ——
  {
    id: "R_FIANZAS_RETENCION",
    description: "fianzas retencion → liquidación antes de cierre; no inventar secundaria",
    when: "field:cobros.fianzas:retencion",
    then: [
      {
        type: "retention_before_close",
        reason: "Retención abierta bloquea cierre (liquidacion_fianza)",
      },
    ],
  },
  {
    id: "R_FIANZA_CONDICIONAL",
    description: "retención con umbral de grupo → tpl.fianza_condicional",
    when: "field:cobros.fianzas:retencion_umbral",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.fianza_condicional",
        parametros: { umbral_comensales: 10 },
        idSuffix: "fianza-condicional",
        transitionId: "t_reservar",
      },
    ],
  },

  // —— Hitos (p10.d2): compromisos+bloqueos; NO secundaria financiera ——
  {
    id: "R_HITOS",
    description: "pagosPorHitos → compromisos+bloqueos; no N financieras",
    when: "field:cobros.pagosPorHitos:hitos",
    then: [
      {
        type: "mark_non_composable",
        extension: "hitos_como_n_financieras",
        reason:
          "Los hitos se modelan como compromisos pagar + bloqueos de fase, no N financieras ni secundaria financiera única",
        field: "cobros.pagosPorHitos",
      },
      {
        type: "add_policy",
        plantilla: "tpl.hitos_pago",
        parametros: { pattern: "compromisos_pagar_con_bloqueos" },
        idSuffix: "hitos-pago",
        transitionId: "t_ejecutar",
      },
    ],
  },

  // —— Taller: no entregar con saldo pendiente ——
  {
    id: "R_TALLER_SALDO_ENTREGA",
    description: "canal taller → restricción saldo antes de t_cerrar",
    when: "and:dominant:servicio_proyecto|channel:taller",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.restriccion_saldo_antes_de",
        parametros: {},
        idSuffix: "saldo-antes-cerrar",
        transitionId: "t_cerrar",
      },
    ],
  },

  // —— Subcontrata: no puede ser secundaria del mismo arquetipo ——
  {
    id: "R_SUBCONTRATA_DOC",
    description: "proceso subcontrata → documentar (SECONDARY_EQUALS_DOMINANT)",
    when: "process_id:lc.subcontrata",
    then: [
      {
        type: "mark_non_composable",
        extension: "subcontrata_secundaria_mismo_arquetipo",
        reason:
          "Subcontrata no puede ser secundaria servicio_proyecto de dominante servicio_proyecto (SECONDARY_EQUALS_DOMINANT). Queda como proceso standalone con exchangeDirection=empresa_compra; falta linked-transaction o arquetipo distinto.",
        field: "processes",
      },
    ],
  },

  // —— Postventa taller (concesionaria: venta + servicio) ——
  {
    id: "R_SERVICIO_POSTVENTA",
    description: "venta dominante + proceso servicio → secundaria postventa",
    when: "and:dominant:venta|process:servicio_proyecto:present",
    then: [
      {
        type: "add_secondary",
        secondaryArchetypeId: "servicio_proyecto",
        bornInDominantState: "cerrada",
        bloquea: "en_entrega",
      },
    ],
  },

  // —— Capacidad ——
  {
    id: "R_CAPACITY_PLAZAS",
    description: "capacityMode plazas",
    when: "capacityMode:plazas",
    then: [{ type: "set_capacity", mode: "plazas" }],
  },
  {
    id: "R_CAPACITY_DEFAULT",
    description: "capacityMode unknown + citas → default cita_individual (confirm)",
    when: "and:capacityMode:unknown|process:servicio_proyecto:present",
    then: [{ type: "set_capacity", mode: "cita_individual" }],
  },

  // —— Portal ——
  {
    id: "R_PORTAL_VISIBILITY",
    description: "autoservicio → visibilidad propia",
    when: "portal:autoservicio_true",
    then: [
      {
        type: "set_visibility",
        scope: "propia",
        roles: ["cliente"],
        fields: ["propia"],
      },
    ],
  },

  // —— Extensiones documentadas (no implementar) ——
  {
    id: "R_DOC_FILTRO_SENSIBLE",
    description: "Datos sensibles → documentar filtro (no componer)",
    when: "always",
    then: [], // se evalúa en compose si hay señales; placeholder
  },
];

/** Plantillas sample / expected → ids tpl.* */
export const SAMPLE_PLANTILLA_TO_TPL: Readonly<
  Record<string, import("../contracts/policy-templates/types.js").PolicyTemplateId>
> = {
  descuento_maximo_sin_aprobacion: "tpl.descuento_maximo_sin_aprobacion",
  importe_requiere_aprobacion: "tpl.importe_requiere_aprobacion",
  limite_credito_por_cliente: "tpl.limite_credito_por_cliente",
  bloqueo_por_impago: "tpl.bloqueo_por_impago",
  plazo_devolucion: "tpl.plazo_devolucion",
  aviso_plazo: "tpl.aviso_plazo",
  restriction_entrega_sin_saldo: "tpl.restriccion_saldo_antes_de",
  restriccion_saldo_antes_de: "tpl.restriccion_saldo_antes_de",
  evidence_requirement: "tpl.evidencia_requerida",
  evidencia_requerida: "tpl.evidencia_requerida",
  fianza_grupo: "tpl.fianza_condicional",
  fianza_retencion: "tpl.fianza_condicional",
  fianza_condicional: "tpl.fianza_condicional",
  permiso_excepcion: "tpl.permiso_excepcion",
  limite_plazos_propios: "tpl.limite_plazos_financiacion",
  limite_plazos_financiacion: "tpl.limite_plazos_financiacion",
  hitos_pago: "tpl.hitos_pago",
};
