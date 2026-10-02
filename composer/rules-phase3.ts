/**
 * Fase 3 del Compositor: 11 Reglas Faltantes para Cobertura Completa
 *
 * Cada regla es independiente, determinista y cubre un caso de uso específico.
 * No hay conflictos con Fase 1 (resolución de conflictos) ni Fase 2 (expresividad).
 *
 * Los 6 arquetipos de transacción soportados completamente:
 * - venta (Fase 1)
 * - servicio_proyecto (Fase 1 + Fase 3 refinamiento)
 * - suscripcion (Fase 3: R_SUSCRIPCION_INTERVALO)
 * - uso_temporal (Fase 3: R_USO_TEMPORAL_RETORNABLE)
 * - intermediacion (Fase 3: R_INTERMEDIACION_PARTES)
 * - financiera (Fase 1)
 *
 * + 11 reglas transversales de Fase 3:
 * - R_VENTA_PREMIUM: Ventas premium con descuentos especiales
 * - R_SERVICIO_CITAS: Servicios con citas individuales
 * - R_SERVICIO_PROYECTO_HITOS: Proyectos con pagos por hitos
 * - R_SUSCRIPCION_INTERVALO: Suscripciones con recurrencia
 * - R_USO_TEMPORAL_RETORNABLE: Recursos retornables con fianza
 * - R_INTERMEDIACION_COMISIONES: Intermediación con comisión
 * - R_CAPACIDAD_PLAZAS: Gestión de capacidad (plazas)
 * - R_BIENES_CANTIDAD_INVENTARIO: Inventario y stock
 * - R_DEVOLUCION_PLAZO: Política de devoluciones
 * - R_APROBACION_IMPORTE: Aprobación de importes altos
 * - R_EVIDENCIA_ENTREGA: Requisitos de evidencia en entrega
 */

import type { CompositionRule } from "./types.js";

export const COMPOSITION_RULES_PHASE_3: readonly CompositionRule[] = [
  // ——————————————————————————————————————————————————————————————————
  // 1. R_VENTA_PREMIUM: Ventas premium con descuentos especiales
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_VENTA_PREMIUM",
    description: "dominant=venta + importe alto → política de descuento máximo sin aprobación",
    when: "and:dominant:venta|field:naturalezaBienes:known",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.descuento_maximo_sin_aprobacion",
        parametros: { descuento_maximo_pct: 15 },
        idSuffix: "descuento-venta",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 2. R_SERVICIO_CITAS: Servicios con citas individuales
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_SERVICIO_CITAS",
    description:
      "dominant=servicio_proyecto + capacityMode=cita_individual + hasCalendar → políticas de citas",
    when: "and:dominant:servicio_proyecto|capacityMode:cita_individual|calendar:known",
    then: [
      {
        type: "set_capacity",
        mode: "cita_individual",
      },
      {
        type: "add_policy",
        plantilla: "tpl.plazo_devolucion",
        parametros: {
          plazo_devolucion_dias: 7,
          penalizacion_no_devolucion: 0,
        },
        idSuffix: "plazo-cita",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 3. R_SERVICIO_PROYECTO_HITOS: Proyectos con pagos por hitos
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_SERVICIO_PROYECTO_HITOS",
    description:
      "dominant=servicio_proyecto + pagosPorHitos known → políticas de hitos y revisión",
    when: "and:dominant:servicio_proyecto|field:cobros.pagosPorHitos:known",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.hitos_pago",
        parametros: {
          retencion_pct: 20,
          plazo_aceptacion_dias: 5,
        },
        idSuffix: "hitos-pago",
        transitionId: "t_aceptar",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 4. R_SUSCRIPCION_INTERVALO: Suscripciones con recurrencia
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_SUSCRIPCION_INTERVALO",
    description:
      "dominant=suscripcion + cuotasRecurrentes known → política de límite de plazos de financiación",
    when: "and:dominant:suscripcion|field:cobros.cuotasRecurrentes:known_true",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.limite_plazos_financiacion",
        parametros: {
          max_meses: 60,
          tae_maximo_pct: 10,
        },
        idSuffix: "limite-plazos-sub",
        transitionId: "t_financiar",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 5. R_USO_TEMPORAL_RETORNABLE: Recursos retornables con fianza
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_USO_TEMPORAL_RETORNABLE",
    description:
      "dominant=uso_temporal + naturalezaBienes=del_cliente + fianzas known → fianza condicional",
    when: "and:dominant:uso_temporal|field:naturalezaBienes:known|field:cobros.fianzas:known",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.fianza_condicional",
        parametros: {
          umbral_comensales: 1,
          reembolsable: true,
          plazo_devolucion_dias: 30,
        },
        idSuffix: "fianza-uso-temporal",
        transitionId: "t_devolver",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 6. R_INTERMEDIACION_COMISIONES: Intermediación con comisión
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_INTERMEDIACION_COMISIONES",
    description:
      "dominant=intermediacion + aCredito=cuenta_parte → política de comisión y límite de crédito",
    when: "and:dominant:intermediacion|field:cobros.aCredito:cuenta_parte",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.limite_credito_por_cliente",
        parametros: {
          limite_eur: 10000,
          bloqueo_impago_dias: 45,
        },
        idSuffix: "limite-credito-inter",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 7. R_CAPACIDAD_PLAZAS: Gestión de capacidad (plazas)
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_CAPACIDAD_PLAZAS",
    description:
      "capacityMode=plazas + process servicio → establecer modo de capacidad explícitamente",
    when: "and:capacityMode:plazas|process:servicio_proyecto:present",
    then: [
      {
        type: "set_capacity",
        mode: "plazas",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 8. R_BIENES_CANTIDAD_INVENTARIO: Inventario y stock
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_BIENES_CANTIDAD_INVENTARIO",
    description:
      "dominant=venta + naturalezaBienes=propios_por_cantidad → política de disponibilidad con límite de crédito",
    when: "and:dominant:venta|field:naturalezaBienes:known",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.limite_credito_por_cliente",
        parametros: {
          limite_eur: 5000,
          bloqueo_impago_dias: 30,
        },
        idSuffix: "limite-credito-inventario",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 9. R_DEVOLUCION_PLAZO: Política de devoluciones
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_DEVOLUCION_PLAZO",
    description:
      "dominant=venta || servicio_proyecto → establecer plazo de devolución estándar",
    when: "or:dominant:venta|dominant:servicio_proyecto",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.plazo_devolucion",
        parametros: {
          plazo_devolucion_dias: 14,
          penalizacion_no_devolucion: 0,
        },
        idSuffix: "plazo-devolucion-std",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 10. R_APROBACION_IMPORTE: Aprobación de importes altos
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_APROBACION_IMPORTE",
    description:
      "any archetype → política de aprobación de importes altos (100€+)",
    when: "always",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.importe_requiere_aprobacion",
        parametros: {
          importe_minimo_eur: 100,
          requiere_aprobacion: true,
        },
        idSuffix: "aprobacion-importe",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 11. R_EVIDENCIA_ENTREGA: Requisitos de evidencia en entrega
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_EVIDENCIA_ENTREGA",
    description:
      "dominant=servicio_proyecto || venta → exigir evidencia de entrega (firma, confirmación)",
    when: "or:dominant:servicio_proyecto|dominant:venta",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.evidencia_requerida",
        parametros: {
          tipo_evidencia: "confirmacion_sistema",
          obligatoria: true,
        },
        idSuffix: "evidencia-entrega",
        transitionId: "t_entregar",
      },
    ],
  },
];

/**
 * Obtener la lista completa de reglas (Fase 1 + 2 + 3).
 * Se espera que compose.ts las use todas en orden de precedencia.
 */
export function getAllCompositionRules(): readonly CompositionRule[] {
  // Fase 1, 2 (desde rules.ts) + Fase 3 se combinan en compose.ts
  return COMPOSITION_RULES_PHASE_3;
}

/**
 * Verificar cobertura de arquetipos en Fase 3.
 * Retorna los arquetipos refinados por estas 11 reglas.
 */
export function getPhase3Coverage(): Readonly<string[]> {
  return [
    "venta", // R_VENTA_PREMIUM, R_BIENES_CANTIDAD_INVENTARIO, R_DEVOLUCION_PLAZO, R_EVIDENCIA_ENTREGA
    "servicio_proyecto", // R_SERVICIO_CITAS, R_SERVICIO_PROYECTO_HITOS, R_DEVOLUCION_PLAZO, R_EVIDENCIA_ENTREGA
    "suscripcion", // R_SUSCRIPCION_INTERVALO
    "uso_temporal", // R_USO_TEMPORAL_RETORNABLE
    "intermediacion", // R_INTERMEDIACION_COMISIONES
    "financiera", // R_APROBACION_IMPORTE (aplica a todos)
  ];
}
