/**
 * Fase 3 del Compositor: 11 Reglas Faltantes para Cobertura Completa
 *
 * Cada regla es independiente, determinista y cubre un caso de uso específico.
 * Usa solo condiciones simples que el compositor puede evaluar confiablemente.
 *
 * Los 6 arquetipos soportados y sus refinamientos en Fase 3:
 * - venta: R_VENTA_PREMIUM, R_BIENES_CANTIDAD_INVENTARIO, R_DEVOLUCION_PLAZO, R_EVIDENCIA_ENTREGA
 * - servicio_proyecto: R_SERVICIO_CITAS, R_SERVICIO_PROYECTO_HITOS
 * - suscripcion: R_SUSCRIPCION_INTERVALO
 * - uso_temporal: R_USO_TEMPORAL_RETORNABLE
 * - intermediacion: R_INTERMEDIACION_COMISIONES
 * - financiera: R_APROBACION_IMPORTE
 */

import type { CompositionRule } from "./types.js";

export const COMPOSITION_RULES_PHASE_3: readonly CompositionRule[] = [
  // ——————————————————————————————————————————————————————————————————
  // 1. R_VENTA_PREMIUM: Ventas premium con descuentos especiales
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_VENTA_PREMIUM",
    description: "dominant=venta + naturalezaBienes known → descuento máximo",
    when: "and:dominant:venta|field:naturalezaBienes:known",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.descuento_maximo_sin_aprobacion",
        parametros: { porcentaje: 15 },
        idSuffix: "descuento-venta",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 2. R_SERVICIO_CITAS: Servicios con citas individuales
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_SERVICIO_CITAS",
    description: "capacityMode=cita_individual → políticas de citas",
    when: "capacityMode:cita_individual",
    then: [
      {
        type: "set_capacity",
        mode: "cita_individual",
      },
      {
        type: "add_policy",
        plantilla: "tpl.plazo_devolucion",
        parametros: {
          dias: 7,
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
    description: "dominant=servicio_proyecto → políticas de hitos",
    when: "dominant:servicio_proyecto",
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
    description: "dominant=suscripcion + cuotasRecurrentes known → límite de plazos",
    when: "dominant:suscripcion",
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
    description: "dominant=uso_temporal + fianzas known → fianza condicional",
    when: "and:dominant:uso_temporal|field:cobros.fianzas:known",
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
    description: "dominant=intermediacion + aCredito=cuenta_parte → límite de crédito",
    when: "and:dominant:intermediacion|field:cobros.aCredito:cuenta_parte",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.limite_credito_por_cliente",
        parametros: {
          por_defecto_eur: 10000,
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
    description: "capacityMode=plazas → establecer modo de capacidad",
    when: "capacityMode:plazas",
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
    description: "dominant=venta + naturalezaBienes known → límite de crédito de inventario",
    when: "and:dominant:venta|field:naturalezaBienes:known",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.limite_credito_por_cliente",
        parametros: {
          por_defecto_eur: 5000,
          bloqueo_impago_dias: 30,
        },
        idSuffix: "limite-credito-inventario",
      },
    ],
  },

  // ——————————————————————————————————————————————————————————————————
  // 9. R_DEVOLUCION_PLAZO: Política de devoluciones (para venta)
  // ——————————————————————————————————————————————————————————————————
  {
    id: "R_DEVOLUCION_PLAZO",
    description: "dominant=venta → establecer plazo de devolución estándar",
    when: "dominant:venta",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.plazo_devolucion",
        parametros: {
          dias: 14,
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
    description: "any archetype → política de aprobación de importes altos (100€+)",
    when: "always",
    then: [
      {
        type: "add_policy",
        plantilla: "tpl.importe_requiere_aprobacion",
        parametros: {
          importe_eur: 100,
          aprueba: "dueno",
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
    description: "dominant=venta → exigir evidencia de entrega",
    when: "dominant:venta",
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
 * Obtener la lista de reglas de Fase 3.
 */
export function getAllCompositionRules(): readonly CompositionRule[] {
  return COMPOSITION_RULES_PHASE_3;
}

/**
 * Verificar cobertura de arquetipos en Fase 3.
 * Retorna los arquetipos refinados por estas 11 reglas.
 */
export function getPhase3Coverage(): Readonly<string[]> {
  return [
    "venta",
    "servicio_proyecto",
    "suscripcion",
    "uso_temporal",
    "intermediacion",
    "financiera",
  ];
}
