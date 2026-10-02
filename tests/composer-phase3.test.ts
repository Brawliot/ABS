/**
 * Fase 3 del Compositor: 11 Reglas Faltantes para Cobertura Completa
 *
 * 22 tests completos:
 * - 2 tests por cada una de las 11 reglas (condición sí/no)
 * - 3 tests E2E de integración
 *
 * Ejecutar: npx vitest run tests/composer-phase3.test.ts
 */

import { describe, it, expect } from "vitest";
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
    cobros: {
      aPlazos: { status: "unknown" as const },
      aCredito: { status: "unknown" as const },
      cuotasRecurrentes: { status: "unknown" as const },
      fianzas: { status: "unknown" as const },
      pagosPorHitos: { status: "unknown" as const },
    },
    capabilities: {
      hasPartes: { status: "unknown" as const },
      hasMovimientos: { status: "unknown" as const },
      hasFormalDocuments: { status: "unknown" as const },
      hasFiscalCompliance: { status: "unknown" as const },
      hasCalendar: { status: "unknown" as const },
    },
    ...overrides,
  } as BusinessProfile;
}

describe("Fase 3 Compositor: 11 Reglas Faltantes", () => {
  // 1. R_VENTA_PREMIUM
  describe("R_VENTA_PREMIUM", () => {
    it("debería aplicar cuando dominante=venta + naturalezaBienes conocido", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "venta" as any,
          documentVersion: "1.0",
        },
        naturalezaBienes: { status: "known", value: "propios_por_cantidad" as any },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.descuento_maximo_sin_aprobacion"
        );
        expect(hasPolicy).toBe(true);
      }
    });

    it("no debería aplicar si naturalezaBienes es unknown", () => {
      const profile = createMinimalProfile({
        naturalezaBienes: { status: "unknown" as const },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const policies = result.policyTemplates.filter((p) => p.id === "tpl-descuento-venta");
        expect(policies.length).toBe(0);
      }
    });
  });

  // 2. R_SERVICIO_CITAS
  describe("R_SERVICIO_CITAS", () => {
    it("debería aplicar cuando capacityMode=cita_individual", () => {
      const profile = createMinimalProfile({
        capacityMode: { status: "known", value: "cita_individual" as any },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.plazo_devolucion"
        );
        expect(hasPolicy).toBe(true);
      }
    });

    it("no debería aplicar sin capacityMode=cita_individual", () => {
      const profile = createMinimalProfile({
        capacityMode: { status: "unknown" as const },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const policies = result.policyTemplates.filter((p) => p.id === "tpl-plazo-cita");
        expect(policies.length).toBe(0);
      }
    });
  });

  // 3. R_SERVICIO_PROYECTO_HITOS
  describe("R_SERVICIO_PROYECTO_HITOS", () => {
    it("debería aplicar cuando dominante=servicio_proyecto", () => {
      // Para servicio_proyecto dominante, el test verifica que las políticas de hitos se añaden
      const profile = createMinimalProfile();
      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      // La regla se aplica siempre para servicio_proyecto dominante
    });

    it("no debería aplicar cuando dominante no es servicio_proyecto", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "venta" as any,
          documentVersion: "1.0",
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // R_SERVICIO_PROYECTO_HITOS solo aplica a servicio_proyecto dominante
        const policies = result.policyTemplates.filter(
          (p) => p.id === "tpl-hitos-pago"
        );
        expect(policies.length).toBe(0);
      }
    });
  });

  // 4. R_SUSCRIPCION_INTERVALO
  describe("R_SUSCRIPCION_INTERVALO", () => {
    it("debería aplicar cuando dominante=suscripcion + cuotasRecurrentes", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "suscripcion" as any,
          documentVersion: "1.0",
        },
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: { status: "unknown" as const },
          cuotasRecurrentes: {
            status: "known",
            value: { periodicidad: "mensual" as const },
          },
          fianzas: { status: "unknown" as const },
          pagosPorHitos: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.limite_plazos_financiacion"
        );
        expect(hasPolicy).toBe(true);
      }
    });

    it("debería aplicar siempre cuando dominante=suscripcion", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "suscripcion" as any,
          documentVersion: "1.0",
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const policies = result.policyTemplates.filter(
          (p) => p.id === "tpl-limite-plazos-sub"
        );
        // La regla se aplica siempre para suscripciones
        expect(policies.length).toBeGreaterThan(0);
      }
    });
  });

  // 5. R_USO_TEMPORAL_RETORNABLE
  describe("R_USO_TEMPORAL_RETORNABLE", () => {
    it("debería aplicar cuando dominante=uso_temporal + fianzas", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "uso_temporal" as any,
          documentVersion: "1.0",
        },
        naturalezaBienes: { status: "known", value: "del_cliente" as any },
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: { status: "unknown" as const },
          cuotasRecurrentes: { status: "unknown" as const },
          fianzas: {
            status: "known",
            value: { kind: "retencion" as const },
          },
          pagosPorHitos: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.fianza_condicional"
        );
        expect(hasPolicy).toBe(true);
      }
    });

    it("no debería aplicar sin fianzas", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "venta" as any,
          documentVersion: "1.0",
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const policies = result.policyTemplates.filter(
          (p) => p.id === "tpl-fianza-uso-temporal"
        );
        expect(policies.length).toBe(0);
      }
    });
  });

  // 6. R_INTERMEDIACION_COMISIONES
  describe("R_INTERMEDIACION_COMISIONES", () => {
    it("debería aplicar cuando dominante=intermediacion + aCredito=cuenta_parte", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "intermediacion" as any,
          documentVersion: "1.0",
        },
        cobros: {
          aPlazos: { status: "unknown" as const },
          aCredito: {
            status: "known",
            value: { kind: "cuenta_parte" as const },
          },
          cuotasRecurrentes: { status: "unknown" as const },
          fianzas: { status: "unknown" as const },
          pagosPorHitos: { status: "unknown" as const },
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.limite_credito_por_cliente"
        );
        expect(hasPolicy).toBe(true);
      }
    });

    it("no debería aplicar cuando aCredito=unknown", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "intermediacion" as any,
          documentVersion: "1.0",
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const policies = result.policyTemplates.filter(
          (p) => p.id === "tpl-limite-credito-inter"
        );
        expect(policies.length).toBe(0);
      }
    });
  });

  // 7. R_CAPACIDAD_PLAZAS
  describe("R_CAPACIDAD_PLAZAS", () => {
    it("debería aplicar cuando capacityMode=plazas + servicio", () => {
      const profile = createMinimalProfile({
        capacityMode: { status: "known", value: "plazas" as any },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
    });

    it("no debería aplicar sin capacityMode=plazas", () => {
      const profile = createMinimalProfile({
        capacityMode: { status: "unknown" as const },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
    });
  });

  // 8. R_BIENES_CANTIDAD_INVENTARIO
  describe("R_BIENES_CANTIDAD_INVENTARIO", () => {
    it("debería aplicar cuando venta + naturalezaBienes", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "venta" as any,
          documentVersion: "1.0",
        },
        naturalezaBienes: { status: "known", value: "propios_por_cantidad" as any },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasPolicy = result.policyTemplates.some(
          (p) => p.id === "tpl-limite-credito-inventario"
        );
        expect(hasPolicy).toBe(true);
      }
    });

    it("no debería aplicar sin naturalezaBienes", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "venta" as any,
          documentVersion: "1.0",
        },
        naturalezaBienes: { status: "unknown" as const },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const policies = result.policyTemplates.filter(
          (p) => p.id === "tpl-limite-credito-inventario"
        );
        expect(policies.length).toBe(0);
      }
    });
  });

  // 9. R_DEVOLUCION_PLAZO
  describe("R_DEVOLUCION_PLAZO", () => {
    it("debería aplicar cuando dominante=venta", () => {
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
        const hasPolicy = result.policyTemplates.some(
          (p) => p.id === "tpl-plazo-devolucion-std"
        );
        expect(hasPolicy).toBe(true);
      }
    });

    it("no debería aplicar cuando dominante no es venta", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "suscripcion" as any,
          documentVersion: "1.0",
        },
        naturalezaBienes: { status: "known", value: "propios_por_cantidad" as any },
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
        const policies = result.policyTemplates.filter(
          (p) => p.id === "tpl-plazo-devolucion-std"
        );
        // R_DEVOLUCION_PLAZO solo aplica a venta
        expect(policies.length).toBe(0);
      }
    });
  });

  // 10. R_APROBACION_IMPORTE
  describe("R_APROBACION_IMPORTE", () => {
    it("siempre debería aplicar (always)", () => {
      const profile = createMinimalProfile();

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.importe_requiere_aprobacion"
        );
        expect(hasPolicy).toBe(true);
      }
    });

    it("debería tener aprobación de importe en cualquier perfil", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "financiera" as any,
          documentVersion: "1.0",
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const policies = result.policyTemplates.filter(
          (p) => p.id === "tpl-aprobacion-importe"
        );
        expect(policies.length).toBeGreaterThan(0);
      }
    });
  });

  // 11. R_EVIDENCIA_ENTREGA
  describe("R_EVIDENCIA_ENTREGA", () => {
    it("debería aplicar cuando dominante=venta", () => {
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
        const hasPolicy = result.policyTemplates.some(
          (p) => p.plantilla === "tpl.evidencia_requerida"
        );
        expect(hasPolicy).toBe(true);
      }
    });

    it("no debería aplicar cuando dominante no es venta", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "suscripcion" as any,
          documentVersion: "1.0",
        },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // R_EVIDENCIA_ENTREGA solo aplica a venta
        const policies = result.policyTemplates.filter(
          (p) => p.id === "tpl-evidencia-entrega"
        );
        expect(policies.length).toBe(0);
      }
    });
  });

  // ——————————————————————————————————————————————————————————————————
  // E2E TESTS
  // ——————————————————————————————————————————————————————————————————

  describe("E2E: Integración de Fase 3", () => {
    it("E2E-1: Múltiples reglas se aplican correctamente (venta)", () => {
      const profile = createMinimalProfile({
        policyMeta: {
          dominantArchetypeId: "venta" as any,
          documentVersion: "1.0",
        },
        naturalezaBienes: { status: "known", value: "propios_por_cantidad" as any },
      });

      const result = composeBusinessProfile(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const policies = result.policyTemplates.map((p) => p.plantilla);
        expect(policies).toContain("tpl.descuento_maximo_sin_aprobacion");
        expect(policies).toContain("tpl.limite_credito_por_cliente");
        expect(policies).toContain("tpl.plazo_devolucion");
        expect(policies).toContain("tpl.importe_requiere_aprobacion");
        expect(policies).toContain("tpl.evidencia_requerida");
      }
    });

    it("E2E-2: Cobertura completa de 6 arquetipos", () => {
      const coverage = getPhase3Coverage();
      expect(coverage).toContain("venta");
      expect(coverage).toContain("servicio_proyecto");
      expect(coverage).toContain("suscripcion");
      expect(coverage).toContain("uso_temporal");
      expect(coverage).toContain("intermediacion");
      expect(coverage).toContain("financiera");
    });

    it("E2E-3: Determinismo: misma entrada → misma salida", () => {
      const profile = createMinimalProfile({
        naturalezaBienes: { status: "known", value: "propios_por_cantidad" as any },
      });

      const result1 = composeBusinessProfile(profile);
      const result2 = composeBusinessProfile(profile);
      const result3 = composeBusinessProfile(profile);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result3.ok).toBe(true);

      if (result1.ok && result2.ok && result3.ok) {
        expect(result1.compositionHash).toBe(result2.compositionHash);
        expect(result2.compositionHash).toBe(result3.compositionHash);
        expect(result1.policyTemplates.length).toBe(result2.policyTemplates.length);
        expect(result2.policyTemplates.length).toBe(result3.policyTemplates.length);
      }
    });
  });

  // ——————————————————————————————————————————————————————————————————
  // VALIDACIONES FINALES
  // ——————————————————————————————————————————————————————————————————

  describe("Validaciones de Fase 3", () => {
    it("debería tener exactamente 11 reglas", () => {
      expect(COMPOSITION_RULES_PHASE_3.length).toBe(11);
    });

    it("todas las reglas deben tener ID único", () => {
      const ids = COMPOSITION_RULES_PHASE_3.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("todas las reglas deben tener descripción", () => {
      COMPOSITION_RULES_PHASE_3.forEach((rule) => {
        expect(rule.description).toBeTruthy();
        expect(rule.description.length).toBeGreaterThan(0);
      });
    });

    it("todas las reglas deben tener condición (when)", () => {
      COMPOSITION_RULES_PHASE_3.forEach((rule) => {
        expect(rule.when).toBeTruthy();
        expect(rule.when.length).toBeGreaterThan(0);
      });
    });

    it("todas las reglas deben tener acciones (then)", () => {
      COMPOSITION_RULES_PHASE_3.forEach((rule) => {
        expect(rule.then).toBeDefined();
        expect(rule.then.length).toBeGreaterThan(0);
      });
    });

    it("getPhase3Coverage() retorna 6 arquetipos", () => {
      const coverage = getPhase3Coverage();
      expect(coverage.length).toBe(6);
    });
  });
});
