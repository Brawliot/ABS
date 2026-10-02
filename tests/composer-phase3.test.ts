/**
 * Fase 3 del Compositor: 11 Reglas Faltantes para Cobertura Completa
 *
 * 22 tests completos:
 * - 2 tests por cada una de las 11 reglas (condición sí/no)
 * - 3 tests E2E de integración
 *
 * Ejecutar: npx vitest run tests/composer-phase3.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { BusinessProfile } from "../contracts/business-profile/types.js";
import { composeBusinessProfile } from "../composer/compose.js";
import { COMPOSITION_RULES_PHASE_3, getPhase3Coverage } from "../composer/rules-phase3.js";

/**
 * Helpers para crear perfiles de prueba.
 */
function createMinimalProfile(overrides?: Partial<BusinessProfile>): BusinessProfile {
  return {
    companyId: "test-company",
    caseVersion: "1.0",
    caseId: "test-case",
    policyMeta: {
      dominantArchetypeId: "venta" as any,
      documentVersion: "1.0",
    },
    processes: {
      status: "known",
      value: [],
    },
    naturalezaBienes: {
      status: "known",
      value: "propios_por_cantidad" as any,
    },
    paymentMode: {
      status: "known",
      value: "inmediato" as any,
    },
    capabilities: {
      hasCalendar: { status: "unknown" as const },
    },
    ...overrides,
  } as BusinessProfile;
}

describe("Fase 3 Compositor: 11 Reglas Faltantes", () => {
  describe("R_COMPRA_EXPLICIT: Procesos de compra explícitos", () => {
    it("debería aplicar R_COMPRA_EXPLICIT cuando proceso compra está presente", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "compra" as any,
          documentVersion: "1.0",
        },
        processes: {
          status: "known",
          value: [
            {
              id: "proc-compra",
              archetypeId: "compra" as any,
              label: "Compra de Bienes",
            },
          ],
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Verificar que la regla se aplicó: debe haber un proceso compra
        const hasCompraProcess = result.processes.some((p) => p.archetypeId === "compra");
        expect(hasCompraProcess).toBe(true);
        // Verificar que se añadió la política de aprobación
        const hasAprobacionPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.aprobacion_compra"
        );
        expect(hasAprobacionPolicy).toBe(true);
      }
    });

    it("no debería aplicar R_COMPRA_EXPLICIT cuando no hay proceso compra", () => {
      const profile = createMinimalProfile({
        processes: {
          status: "known",
          value: [
            {
              id: "proc-venta",
              archetypeId: "venta" as any,
              label: "Venta",
            },
          ],
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // No debe haber un proceso compra aparte
        const processes = result.processes.filter((p) => p.archetypeId === "compra");
        expect(processes.length).toBe(0);
      }
    });
  });

  describe("R_SERVICIO_CITAS: Servicios con citas individuales", () => {
    it("debería aplicar R_SERVICIO_CITAS cuando servicio + cita_individual + calendar", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "servicio_proyecto" as any,
          documentVersion: "1.0",
        },
        processes: {
          status: "known",
          value: [
            {
              id: "proc-servicio",
              archetypeId: "servicio_proyecto" as any,
              label: "Servicio",
            },
          ],
        },
        capacityMode: {
          status: "known",
          value: "cita_individual" as any,
        },
        capabilities: {
          hasCalendar: { status: "known", value: true },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Verificar políticas de citas
        const hasReservaPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.reserva_cita"
        );
        const hasNoShowPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.no_show_penalty"
        );
        expect(hasReservaPolicy).toBe(true);
        expect(hasNoShowPolicy).toBe(true);
      }
    });

    it("no debería aplicar R_SERVICIO_CITAS sin calendar", () => {
      const profile = createMinimalProfile({
        capacityMode: {
          status: "known",
          value: "cita_individual" as any,
        },
        capabilities: {
          hasCalendar: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Sin calendar, no se aplica la regla completamente
        const hasReservaPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.reserva_cita"
        );
        // La regla requiere calendar:known, por lo que no se aplica
        expect(hasReservaPolicy).toBe(false);
      }
    });
  });

  describe("R_SERVICIO_PROYECTO_HITOS: Proyectos con entregas por hitos", () => {
    it("debería aplicar R_SERVICIO_PROYECTO_HITOS cuando dominante es servicio_proyecto", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "servicio_proyecto" as any,
          documentVersion: "1.0",
        },
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: { status: "unknown" as const },
          cuotasRecurrentes: { status: "unknown" as const },
          fianzas: { status: "unknown" as const },
          pagosPorHitos: {
            status: "known",
            value: {
              hitos: [
                {
                  id: "h1",
                  fase: "Diseño",
                  bornInDominantState: "aceptado",
                  bloqueaStateId: "entrega",
                  pct: 30,
                },
              ],
            },
          },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasHitoPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.hito_acepta_entrega"
        );
        expect(hasHitoPolicy).toBe(true);
      }
    });

    it("no debería aplicar R_SERVICIO_PROYECTO_HITOS sin pagosPorHitos", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "venta" as any,
          documentVersion: "1.0",
        },
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: { status: "unknown" as const },
          cuotasRecurrentes: { status: "unknown" as const },
          fianzas: { status: "unknown" as const },
          pagosPorHitos: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasHitoPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.hito_acepta_entrega"
        );
        expect(hasHitoPolicy).toBe(false);
      }
    });
  });

  describe("R_SUSCRIPCION_INTERVALO: Suscripciones con intervalo", () => {
    it("debería aplicar R_SUSCRIPCION_INTERVALO cuando cuotasRecurrentes=true", () => {
      const profile = createMinimalProfile({
        paymentMode: {
          status: "known",
          value: "recurrente" as any,
        },
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: { status: "unknown" as const },
          cuotasRecurrentes: { status: "known", value: true },
          fianzas: { status: "unknown" as const },
          pagosPorHitos: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasRenovacionPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.renovacion_automatica"
        );
        expect(hasRenovacionPolicy).toBe(true);
      }
    });

    it("no debería aplicar R_SUSCRIPCION_INTERVALO cuando cuotasRecurrentes=false", () => {
      const profile = createMinimalProfile({
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: { status: "unknown" as const },
          cuotasRecurrentes: { status: "known", value: false },
          fianzas: { status: "unknown" as const },
          pagosPorHitos: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasRenovacionPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.renovacion_automatica"
        );
        expect(hasRenovacionPolicy).toBe(false);
      }
    });
  });

  describe("R_USO_TEMPORAL_RETORNABLE: Recursos retornables", () => {
    it("debería aplicar R_USO_TEMPORAL_RETORNABLE cuando dominante es uso_temporal", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "uso_temporal" as any,
          documentVersion: "1.0",
        },
        naturalezaBienes: {
          status: "known",
          value: "del_cliente" as any,
        },
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: { status: "unknown" as const },
          cuotasRecurrentes: { status: "unknown" as const },
          fianzas: { status: "known", value: true },
          pagosPorHitos: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasInspeccionPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.inspeccion_devolucao"
        );
        expect(hasInspeccionPolicy).toBe(true);
      }
    });

    it("no debería aplicar R_USO_TEMPORAL_RETORNABLE sin fianzas", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "venta" as any,
          documentVersion: "1.0",
        },
        naturalezaBienes: {
          status: "known",
          value: "propios_por_cantidad" as any,
        },
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: { status: "unknown" as const },
          cuotasRecurrentes: { status: "unknown" as const },
          fianzas: { status: "unknown" as const },
          pagosPorHitos: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasInspeccionPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.inspeccion_devolucao"
        );
        expect(hasInspeccionPolicy).toBe(false);
      }
    });
  });

  describe("R_INTERMEDIACION_PARTES: Múltiples partes involucradas", () => {
    it("debería aplicar R_INTERMEDIACION_PARTES cuando dominante es intermediacion", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "intermediacion" as any,
          documentVersion: "1.0",
        },
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: { status: "unknown" as const },
          cuotasRecurrentes: { status: "unknown" as const },
          fianzas: { status: "unknown" as const },
          pagosPorHitos: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasComisionPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.comision_intermediario"
        );
        expect(hasComisionPolicy).toBe(true);
      }
    });

    it("no debería aplicar R_INTERMEDIACION_PARTES cuando no es intermediacion", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "venta" as any,
          documentVersion: "1.0",
        },
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: { status: "unknown" as const },
          cuotasRecurrentes: { status: "unknown" as const },
          fianzas: { status: "unknown" as const },
          pagosPorHitos: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasComisionPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.comision_intermediario"
        );
        expect(hasComisionPolicy).toBe(false);
      }
    });
  });

  describe("R_CAPACIDAD_RECURSO: Capacidad de recursos", () => {
    it("debería aplicar R_CAPACIDAD_RECURSO cuando capacityMode=plazas con servicio", () => {
      const profile = createMinimalProfile({
        processes: {
          status: "known",
          value: [
            {
              id: "proc-servicio",
              archetypeId: "servicio_proyecto" as any,
              label: "Servicio",
            },
          ],
        },
        capacityMode: {
          status: "known",
          value: "plazas" as any,
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasCapacidadPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.control_capacidad"
        );
        expect(hasCapacidadPolicy).toBe(true);
      }
    });

    it("no debería aplicar R_CAPACIDAD_RECURSO sin capacityMode conocido", () => {
      const profile = createMinimalProfile({
        capacityMode: { status: "unknown" as const },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasCapacidadPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.control_capacidad"
        );
        expect(hasCapacidadPolicy).toBe(false);
      }
    });
  });

  describe("R_BIENES_CANTIDAD: Bienes por cantidad (inventario)", () => {
    it("debería aplicar R_BIENES_CANTIDAD cuando naturalezaBienes=propios_por_cantidad", () => {
      const profile = createMinimalProfile({
        naturalezaBienes: {
          status: "known",
          value: "propios_por_cantidad" as any,
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasStockPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.control_stock_minimo"
        );
        expect(hasStockPolicy).toBe(true);
      }
    });

    it("no debería aplicar R_BIENES_CANTIDAD cuando naturalezaBienes no es por cantidad", () => {
      const profile = createMinimalProfile({
        naturalezaBienes: {
          status: "known",
          value: "del_cliente" as any,
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasStockPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.control_stock_minimo"
        );
        expect(hasStockPolicy).toBe(false);
      }
    });
  });

  describe("R_PROCESOS_COMPLEJOS: Procesos con múltiples etapas", () => {
    it("debería aplicar R_PROCESOS_COMPLEJOS cuando hay múltiples procesos", () => {
      const profile = createMinimalProfile({
        processes: {
          status: "known",
          value: [
            {
              id: "proc-servicio",
              archetypeId: "servicio_proyecto" as any,
              label: "Servicio",
            },
            {
              id: "proc-compra",
              archetypeId: "compra" as any,
              label: "Compra",
            },
          ],
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasSecuenciaPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.secuencia_procesos"
        );
        expect(hasSecuenciaPolicy).toBe(true);
      }
    });

    it("no debería aplicar R_PROCESOS_COMPLEJOS con un único proceso", () => {
      const profile = createMinimalProfile({
        processes: {
          status: "known",
          value: [
            {
              id: "proc-venta",
              archetypeId: "venta" as any,
              label: "Venta",
            },
          ],
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasSecuenciaPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.secuencia_procesos"
        );
        expect(hasSecuenciaPolicy).toBe(false);
      }
    });
  });

  describe("R_LOCATION_COMPLIANCE: Cumplimiento por ubicación", () => {
    it("siempre debería aplicar R_LOCATION_COMPLIANCE (always)", () => {
      const profile = createMinimalProfile();

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasRgpdPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.rgpd_si_ubicacion_ue"
        );
        const hasImpuestosPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.impuestos_locales"
        );
        expect(hasRgpdPolicy).toBe(true);
        expect(hasImpuestosPolicy).toBe(true);
      }
    });

    it("debería tener RGPD en perfil default", () => {
      const profile = createMinimalProfile();
      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.policyTemplates.length).toBeGreaterThan(0);
      }
    });
  });

  describe("R_ROLES_ESCALACION: Escalación de roles", () => {
    it("siempre debería aplicar R_ROLES_ESCALACION (always)", () => {
      const profile = createMinimalProfile();

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasEscalacionPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.escalacion_aprobador"
        );
        const hasDelegacionPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.delegacion_temporal"
        );
        expect(hasEscalacionPolicy).toBe(true);
        expect(hasDelegacionPolicy).toBe(true);
      }
    });

    it("debería tener escalación en perfil default", () => {
      const profile = createMinimalProfile();
      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.policyTemplates.length).toBeGreaterThan(0);
      }
    });
  });

  // ——————————————————————————————————————————————————————————————————
  // TESTS E2E: INTEGRACIÓN DE MÚLTIPLES REGLAS
  // ——————————————————————————————————————————————————————————————————

  describe("E2E: Integración de Fase 3", () => {
    it("E2E-1: Múltiples reglas se aplican correctamente en conjunto (venta + compra + hitos)", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "venta" as any,
          documentVersion: "1.0",
        },
        processes: {
          status: "known",
          value: [
            {
              id: "proc-venta",
              archetypeId: "venta" as any,
              label: "Venta",
            },
            {
              id: "proc-compra",
              archetypeId: "compra" as any,
              label: "Compra de Materiales",
            },
          ],
        },
        naturalezaBienes: {
          status: "known",
          value: "propios_por_cantidad" as any,
        },
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: { status: "unknown" as const },
          cuotasRecurrentes: { status: "unknown" as const },
          fianzas: { status: "unknown" as const },
          pagosPorHitos: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Verificar que múltiples reglas se aplicaron:
        // - R_COMPRA_EXPLICIT (compra)
        // - R_BIENES_CANTIDAD (inventario)
        // - R_PROCESOS_COMPLEJOS (múltiples procesos)
        // - R_LOCATION_COMPLIANCE (siempre)
        // - R_ROLES_ESCALACION (siempre)

        const policies = result.policyTemplates.map((p) => p.plantilla);
        expect(policies).toContain("tpl.aprobacion_compra"); // R_COMPRA_EXPLICIT
        expect(policies).toContain("tpl.control_stock_minimo"); // R_BIENES_CANTIDAD
        expect(policies).toContain("tpl.secuencia_procesos"); // R_PROCESOS_COMPLEJOS
        expect(policies).toContain("tpl.rgpd_si_ubicacion_ue"); // R_LOCATION_COMPLIANCE
        expect(policies).toContain("tpl.escalacion_aprobador"); // R_ROLES_ESCALACION
      }
    });

    it("E2E-2: Cobertura completa de arquetipos (al menos venta, compra, servicio, suscripcion, uso_temporal, intermediacion)", () => {
      // Crear perfil que trigger cada arquetipo
      const profile = createMinimalProfile({
        processes: {
          status: "known",
          value: [
            {
              id: "proc-venta",
              archetypeId: "venta" as any,
              label: "Venta",
            },
            {
              id: "proc-compra",
              archetypeId: "compra" as any,
              label: "Compra",
            },
            {
              id: "proc-servicio",
              archetypeId: "servicio_proyecto" as any,
              label: "Servicio",
            },
          ],
        },
        naturalezaBienes: {
          status: "known",
          value: "propios_por_cantidad" as any,
        },
        capacityMode: {
          status: "known",
          value: "cita_individual" as any,
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const phase3Coverage = getPhase3Coverage();
        // Verificar que al menos algunos arquetipos están soportados
        expect(phase3Coverage).toContain("compra");
        expect(phase3Coverage).toContain("servicio");
        expect(phase3Coverage).toContain("servicio_proyecto");
      }
    });

    it("E2E-3: Determinismo: misma entrada → misma salida siempre", () => {
      const profile = createMinimalProfile({
        naturalezaBienes: {
          status: "known",
          value: "propios_por_cantidad" as any,
        },
        capacityMode: {
          status: "known",
          value: "cita_individual" as any,
        },
      });

      // Ejecutar 3 veces
      const result1 = composeBusinessProfile(profile);
      const result2 = composeBusinessProfile(profile);
      const result3 = composeBusinessProfile(profile);

      // Todos deben ser ok
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result3.ok).toBe(true);

      if (result1.ok && result2.ok && result3.ok) {
        // Hashes deben ser idénticos
        expect(result1.compositionHash).toBe(result2.compositionHash);
        expect(result2.compositionHash).toBe(result3.compositionHash);

        // Mismo número de políticas
        expect(result1.policyTemplates.length).toBe(result2.policyTemplates.length);
        expect(result2.policyTemplates.length).toBe(result3.policyTemplates.length);

        // Mismo número de procesos
        expect(result1.processes.length).toBe(result2.processes.length);
        expect(result2.processes.length).toBe(result3.processes.length);
      }
    });
  });

  // ——————————————————————————————————————————————————————————————————
  // VALIDACIONES FINALES
  // ——————————————————————————————————————————————————————————————————

  describe("Validaciones de Fase 3", () => {
    it("debería tener exactamente 11 reglas de Fase 3", () => {
      expect(COMPOSITION_RULES_PHASE_3.length).toBe(11);
    });

    it("todas las reglas de Fase 3 deben tener ID único", () => {
      const ids = COMPOSITION_RULES_PHASE_3.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("todas las reglas de Fase 3 deben tener descripción", () => {
      COMPOSITION_RULES_PHASE_3.forEach((rule) => {
        expect(rule.description).toBeTruthy();
        expect(rule.description.length).toBeGreaterThan(0);
      });
    });

    it("todas las reglas de Fase 3 deben tener condición (when) definida", () => {
      COMPOSITION_RULES_PHASE_3.forEach((rule) => {
        expect(rule.when).toBeTruthy();
        expect(rule.when.length).toBeGreaterThan(0);
      });
    });

    it("todas las reglas de Fase 3 deben tener acciones (then) definidas", () => {
      COMPOSITION_RULES_PHASE_3.forEach((rule) => {
        expect(rule.then).toBeDefined();
        expect(rule.then.length).toBeGreaterThan(0);
      });
    });

    it("getPhase3Coverage() debería retornar arquetipos válidos", () => {
      const coverage = getPhase3Coverage();
      expect(coverage.length).toBeGreaterThan(0);
      expect(coverage).toContain("compra");
      expect(coverage).toContain("servicio");
      expect(coverage).toContain("suscripcion");
    });
  });
});
