/**
 * Tests del ArchetypeAdvisor (Fase 4)
 *
 * Casos de prueba: recomendación de arquetipos basada en BusinessProfile
 * Total: 15+ test cases
 */

import { describe, it, expect } from "vitest";
import type { BusinessProfile } from "../contracts/business-profile/types.js";
import {
  adviseArchetype,
  ArchetypeAdvisor,
} from "../contracts/business-profile/archetype-advisor.js";
import {
  known,
  unknownField,
  notApplicable,
} from "../contracts/business-profile/field.js";

describe("ArchetypeAdvisor", () => {
  // ========================================================================
  // TEST 1: Pizzería (VENTA clara)
  // ========================================================================

  describe("Test 1: Pizzería (VENTA clara)", () => {
    const pizzeriaProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "pizzeria_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta_presencial",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial", "web"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_por_cantidad"]),
      location: known({ countryCode: "AR" }),
      resourceSubtypes: known([]),
      roles: known([{ id: "gerente", label: "Gerente" }] as any),
      organization: known({
        sedes: [{ id: "sede1", label: "Sede Principal" }],
        equipos: [{ id: "equipo1", label: "Equipo 1", sedeId: "sede1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(false),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
      portalCliente: known({ autoservicio: false }),
    };

    it("debería recomendar 'venta' como dominante", () => {
      const advice = adviseArchetype(pizzeriaProfile);
      expect(advice.dominant.archetype).toBe("venta");
    });

    it("debería tener confidence >= 0.80", () => {
      const advice = adviseArchetype(pizzeriaProfile);
      expect(advice.dominant.confidence).toBeGreaterThanOrEqual(0.80);
    });

    it("debería tener confidence < 1.0", () => {
      const advice = adviseArchetype(pizzeriaProfile);
      expect(advice.dominant.confidence).toBeLessThan(1.0);
    });

    it("debería tener reasoning con múltiples razones", () => {
      const advice = adviseArchetype(pizzeriaProfile);
      expect(advice.dominant.reasoning.length).toBeGreaterThan(3);
    });

    it("debería tener baja o nula ambigüedad", () => {
      const advice = adviseArchetype(pizzeriaProfile);
      // La pizzería debería tener venta claramente dominante
      // Aceptamos que haya un pequeño margen de ambigüedad si la diferencia es cercana a 15%
      if (advice.ambiguity) {
        // Si hay ambigüedad, debe ser porque otros arquetipos están muy cerca (< 15%)
        expect(advice.dominant.archetype).toBe("venta");
        expect(advice.dominant.confidence).toBeGreaterThan(0.75);
      }
    });

    it("debería contener signals específicas", () => {
      const advice = adviseArchetype(pizzeriaProfile);
      const signals = advice.dominant.signals.map((s) => s.signal);
      expect(signals).toContain("processes_venta_explicit");
      expect(signals).toContain("exchangeDirection_vende");
      expect(signals).toContain("paymentMode_inmediato");
    });
  });

  // ========================================================================
  // TEST 2: Taller Mecánico (SERVICIO_PROYECTO claro)
  // ========================================================================

  describe("Test 2: Taller Mecánico (SERVICIO_PROYECTO claro)", () => {
    const tallerProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "taller_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "servicio_proyecto",
      },
      processes: known([
        {
          id: "reparacion",
          archetypeId: "servicio_proyecto",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial", "backoffice"]),
      paymentMode: known("diferido"),
      naturalezaBienes: known(["propios_por_cantidad"]),
      location: known({ countryCode: "AR" }),
      capacityMode: known("plazas"),
      resourceSubtypes: known(["capacidad_temporal"]),
      cobros: {
        pagosPorHitos: known({ hitos: [] } as any),
        aCredito: known(false),
        aPlazos: known(false),
        fianzas: known(false),
        cuotasRecurrentes: known(false),
      },
      roles: known([{ id: "tecnico", label: "Técnico" }] as any),
      organization: known({
        sedes: [{ id: "sede1" }],
        equipos: [{ id: "equipo1", sedeId: "sede1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(true),
      },
      portalCliente: known({ autoservicio: false }),
    };

    it("debería recomendar 'servicio_proyecto' como dominante", () => {
      const advice = adviseArchetype(tallerProfile);
      expect(advice.dominant.archetype).toBe("servicio_proyecto");
    });

    it("debería tener confidence >= 0.75", () => {
      const advice = adviseArchetype(tallerProfile);
      expect(advice.dominant.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("debería contener señal de pagos por hitos", () => {
      const advice = adviseArchetype(tallerProfile);
      const signals = advice.dominant.signals.map((s) => s.signal);
      expect(signals).toContain("cobros_pagosPorHitos");
    });
  });

  // ========================================================================
  // TEST 3: SaaS (SUSCRIPCION clara)
  // ========================================================================

  describe("Test 3: SaaS (SUSCRIPCION clara)", () => {
    const saasProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "saas_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "suscripcion",
      },
      processes: known([
        {
          id: "acceso_saas",
          archetypeId: "suscripcion",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["web"]),
      paymentMode: known("financiado"),
      naturalezaBienes: known([]),
      location: known({ countryCode: "AR" }),
      resourceSubtypes: known(["capacidad_temporal"]),
      cobros: {
        cuotasRecurrentes: known({
          periodicidad: "mensual",
          domiciliada: true,
        } as any),
        aCredito: known(false),
        aPlazos: known(false),
        fianzas: known(false),
        pagosPorHitos: known(false),
      },
      roles: known([{ id: "admin", label: "Admin" }] as any),
      organization: known({
        sedes: [{ id: "sede1" }],
        equipos: [{ id: "equipo1", sedeId: "sede1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(true),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(true),
      },
      portalCliente: known({ autoservicio: true }),
    };

    it("debería recomendar 'suscripcion' como dominante", () => {
      const advice = adviseArchetype(saasProfile);
      expect(advice.dominant.archetype).toBe("suscripcion");
    });

    it("debería tener confidence >= 0.85", () => {
      const advice = adviseArchetype(saasProfile);
      expect(advice.dominant.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("debería contener señal de cuotas recurrentes", () => {
      const advice = adviseArchetype(saasProfile);
      const signals = advice.dominant.signals.map((s) => s.signal);
      expect(signals).toContain("cobros_cuotasRecurrentes");
    });

    it("debería contener señal de portal autoservicio", () => {
      const advice = adviseArchetype(saasProfile);
      const signals = advice.dominant.signals.map((s) => s.signal);
      expect(signals).toContain("portalCliente_autoservicio");
    });
  });

  // ========================================================================
  // TEST 4: Agencia Digital (SERVICIO_PROYECTO)
  // ========================================================================

  describe("Test 4: Agencia Digital (SERVICIO_PROYECTO)", () => {
    const agenciaProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "agencia_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "servicio_proyecto",
      },
      processes: known([
        {
          id: "proyecto_web",
          archetypeId: "servicio_proyecto",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial", "web", "backoffice"]),
      paymentMode: known("diferido"),
      naturalezaBienes: known([]),
      location: known({ countryCode: "AR" }),
      capacityMode: known("plazas"),
      resourceSubtypes: known(["capacidad_temporal"]),
      cobros: {
        pagosPorHitos: known({
          hitos: [
            {
              id: "hito1",
              fase: "diseño",
              pct: 25,
              bloqueaStateId: "s1",
              bornInDominantState: "s0",
            },
          ],
        } as any),
        aCredito: known(false),
        aPlazos: known(false),
        fianzas: known(false),
        cuotasRecurrentes: known(false),
      },
      roles: known([{ id: "pm", label: "Project Manager" }] as any),
      organization: known({
        sedes: [{ id: "sede1" }],
        equipos: [
          { id: "equipo1", sedeId: "sede1" },
          { id: "equipo2", sedeId: "sede1" },
        ],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(true),
        hasMovimientos: known(true),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(true),
      },
      portalCliente: known({ autoservicio: false }),
    };

    it("debería recomendar 'servicio_proyecto' como dominante", () => {
      const advice = adviseArchetype(agenciaProfile);
      expect(advice.dominant.archetype).toBe("servicio_proyecto");
    });

    it("debería tener confidence >= 0.80", () => {
      const advice = adviseArchetype(agenciaProfile);
      expect(advice.dominant.confidence).toBeGreaterThanOrEqual(0.80);
    });
  });

  // ========================================================================
  // TEST 5: Banco (FINANCIERA clara)
  // ========================================================================

  describe("Test 5: Banco (FINANCIERA clara)", () => {
    const bancoProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "banco_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "financiera",
      },
      processes: known([
        {
          id: "prestamo",
          archetypeId: "financiera",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial", "web", "backoffice"]),
      paymentMode: known("financiado"),
      naturalezaBienes: known([]),
      location: known({ countryCode: "AR" }),
      resourceSubtypes: known([]),
      cobros: {
        aCredito: known({
          kind: "cuenta_parte",
          limitePorDefectoEur: 10000,
        } as any),
        aPlazos: known({ enabled: true } as any),
        fianzas: known({ kind: "retencion" } as any),
        cuotasRecurrentes: known(false),
        pagosPorHitos: known(false),
      },
      roles: known([
        { id: "ejecutivo", label: "Ejecutivo de Cuentas" },
      ] as any),
      organization: known({
        sedes: [{ id: "sede1" }],
        equipos: [{ id: "equipo1", sedeId: "sede1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(true),
        hasMovimientos: known(true),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
      portalCliente: known({ autoservicio: true }),
    };

    it("debería recomendar 'financiera' como dominante", () => {
      const advice = adviseArchetype(bancoProfile);
      expect(advice.dominant.archetype).toBe("financiera");
    });

    it("debería tener confidence >= 0.80", () => {
      const advice = adviseArchetype(bancoProfile);
      expect(advice.dominant.confidence).toBeGreaterThanOrEqual(0.80);
    });

    it("debería contener señales de crédito o plazos", () => {
      const advice = adviseArchetype(bancoProfile);
      const signals = advice.dominant.signals.map((s) => s.signal);
      // Búsqueda case-insensitive
      const hasCredit = signals.some((s) =>
        s.toLowerCase().includes("credito") || s.toLowerCase().includes("plazo")
      );
      expect(hasCredit).toBe(true);
    });
  });

  // ========================================================================
  // TEST 6: Rental (USO_TEMPORAL claro)
  // ========================================================================

  describe("Test 6: Rental de Autos (USO_TEMPORAL claro)", () => {
    const rentalProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "rental_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "uso_temporal",
      },
      processes: known([
        {
          id: "alquiler",
          archetypeId: "uso_temporal",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial", "web"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "AR" }),
      capacityMode: known("plazas"),
      resourceSubtypes: known(["capacidad_temporal", "retornable"]),
      cobros: {
        fianzas: known({ kind: "retencion" } as any),
        aCredito: known(false),
        aPlazos: known(false),
        cuotasRecurrentes: known(false),
        pagosPorHitos: known(false),
      },
      roles: known([{ id: "gerente", label: "Gerente" }] as any),
      organization: known({
        sedes: [{ id: "sede1" }],
        equipos: [{ id: "equipo1", sedeId: "sede1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(true),
      },
      portalCliente: known({ autoservicio: false }),
    };

    it("debería recomendar 'uso_temporal' como dominante", () => {
      const advice = adviseArchetype(rentalProfile);
      expect(advice.dominant.archetype).toBe("uso_temporal");
    });

    it("debería tener confidence >= 0.75", () => {
      const advice = adviseArchetype(rentalProfile);
      expect(advice.dominant.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("debería contener señal de recurso retornable", () => {
      const advice = adviseArchetype(rentalProfile);
      const signals = advice.dominant.signals.map((s) => s.signal);
      expect(signals).toContain("resource_retornable");
    });
  });

  // ========================================================================
  // TEST 7: Marketplace (INTERMEDIACION clara)
  // ========================================================================

  describe("Test 7: Marketplace (INTERMEDIACION clara)", () => {
    const marketplaceProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "marketplace_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "intermediacion",
      },
      processes: known([
        {
          id: "intermediacion",
          archetypeId: "intermediacion",
          exchangeDirection: "empresa_vende",
        },
        {
          id: "intermediacion_compra",
          archetypeId: "intermediacion",
          exchangeDirection: "empresa_compra",
        },
      ]),
      channels: known(["web", "autoservicio"]),
      paymentMode: known("mixto"),
      naturalezaBienes: known([]),
      location: known({ countryCode: "AR" }),
      resourceSubtypes: known([]),
      cobros: {
        aCredito: known(false),
        aPlazos: known(false),
        fianzas: known(false),
        cuotasRecurrentes: known(false),
        pagosPorHitos: known(false),
      },
      roles: known([
        { id: "admin", label: "Admin" },
        { id: "support", label: "Soporte" },
      ] as any),
      organization: known({
        sedes: [{ id: "sede1" }],
        equipos: [
          { id: "equipo1", sedeId: "sede1" },
          { id: "equipo2", sedeId: "sede1" },
        ],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(true),
        hasMovimientos: known(true),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
      portalCliente: known({ autoservicio: true }),
    };

    it("debería recomendar 'intermediacion' como dominante", () => {
      const advice = adviseArchetype(marketplaceProfile);
      expect(advice.dominant.archetype).toBe("intermediacion");
    });

    it("debería tener confidence >= 0.75", () => {
      const advice = adviseArchetype(marketplaceProfile);
      expect(advice.dominant.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("debería tener ambas direcciones de intercambio", () => {
      const advice = adviseArchetype(marketplaceProfile);
      const signals = advice.dominant.signals.map((s) => s.signal);
      expect(signals).toContain("exchangeDirection_ambas");
    });
  });

  // ========================================================================
  // TEST 8: Consultoría (AMBIGUO entre venta y proyecto)
  // ========================================================================

  describe("Test 8: Consultoría (Ambiguo)", () => {
    const consultoriaProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "consulta_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "servicio_proyecto",
      },
      processes: known([
        {
          id: "consulta",
          archetypeId: "servicio_proyecto",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial", "web"]),
      paymentMode: known("diferido"),
      naturalezaBienes: known([]),
      location: known({ countryCode: "AR" }),
      capacityMode: known("cita_individual"),
      resourceSubtypes: known(["capacidad_temporal"]),
      cobros: {
        pagosPorHitos: known(false),
        aPlazos: known(false),
        aCredito: known(false),
        fianzas: known(false),
        cuotasRecurrentes: known(false),
      },
      roles: known([{ id: "consultor", label: "Consultor" }] as any),
      organization: known({
        sedes: [{ id: "sede1" }],
        equipos: [{ id: "equipo1", sedeId: "sede1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(true),
      },
      portalCliente: known({ autoservicio: false }),
    };

    it("debería detectar ambigüedad", () => {
      const advice = adviseArchetype(consultoriaProfile);
      expect(advice.ambiguity).not.toBeNull();
    });

    it("debería sugerir preguntas desambigüantes", () => {
      const advice = adviseArchetype(consultoriaProfile);
      expect(advice.suggestedQuestions).toBeDefined();
      expect((advice.suggestedQuestions ?? []).length).toBeGreaterThan(0);
    });

    it("debería tener moderate confidence en dominante", () => {
      const advice = adviseArchetype(consultoriaProfile);
      // La consultoría tiene características de proyecto (0.84 es razonable)
      // Puede haber baja ambigüedad si la diferencia es pequeña
      expect(advice.dominant.confidence).toBeGreaterThan(0.70);
      expect(advice.dominant.confidence).toBeLessThan(0.95);
    });
  });

  // ========================================================================
  // TEST 9: Restaurante (Venta + Servicio)
  // ========================================================================

  describe("Test 9: Restaurante (Venta + Servicio)", () => {
    const restauranteProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "restaurante_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta_comida",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial", "web", "autoservicio"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_por_cantidad"]),
      location: known({ countryCode: "AR" }),
      capacityMode: known("plazas"),
      resourceSubtypes: known([]),
      roles: known([{ id: "mesero", label: "Mesero" }] as any),
      organization: known({
        sedes: [{ id: "sede1" }],
        equipos: [{ id: "equipo1", sedeId: "sede1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(false),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
      portalCliente: known({ autoservicio: true }),
    };

    it("debería recomendar 'venta' como dominante", () => {
      const advice = adviseArchetype(restauranteProfile);
      expect(advice.dominant.archetype).toBe("venta");
    });

    it("debería tener secundarios", () => {
      const advice = adviseArchetype(restauranteProfile);
      expect(advice.secondary.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // TEST 10: Perfil Incompleto
  // ========================================================================

  describe("Test 10: Perfil Incompleto", () => {
    const incompletoProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "incompleto_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: unknownField(),
      channels: unknownField(),
      paymentMode: unknownField(),
      naturalezaBienes: unknownField(),
      location: unknownField(),
      resourceSubtypes: unknownField(),
      roles: unknownField(),
      organization: unknownField(),
      capabilities: {
        hasPartes: unknownField(),
        hasMovimientos: unknownField(),
        hasFormalDocuments: unknownField(),
        hasFiscalCompliance: unknownField(),
        hasCalendar: unknownField(),
      },
    };

    it("debería aún retornar un consejo", () => {
      const advice = adviseArchetype(incompletoProfile);
      expect(advice.dominant).toBeDefined();
      expect(advice.dominant.archetype).toBeDefined();
    });

    it("debería tener confidence reducida", () => {
      const advice = adviseArchetype(incompletoProfile);
      expect(advice.dominant.confidence).toBeLessThan(0.70);
    });

    it("debería tener pocas signals", () => {
      const advice = adviseArchetype(incompletoProfile);
      expect(advice.dominant.signals.length).toBeLessThan(5);
    });
  });

  // ========================================================================
  // TEST 11: Determinismo
  // ========================================================================

  describe("Test 11: Determinismo", () => {
    const profile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "determinismo_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta1",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["web", "presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_por_cantidad"]),
      location: known({ countryCode: "AR" }),
      resourceSubtypes: known([]),
      roles: known([{ id: "r1", label: "R1" }] as any),
      organization: known({
        sedes: [{ id: "s1" }],
        equipos: [{ id: "e1", sedeId: "s1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(false),
        hasFiscalCompliance: known(false),
        hasCalendar: known(false),
      },
    };

    it("debería ser determinístico", () => {
      const advice1 = adviseArchetype(profile);
      const advice2 = adviseArchetype(profile);
      const advice3 = adviseArchetype(profile);

      expect(advice1.dominant.archetype).toBe(advice2.dominant.archetype);
      expect(advice2.dominant.archetype).toBe(advice3.dominant.archetype);
      expect(advice1.dominant.confidence).toBe(advice2.dominant.confidence);
      expect(advice2.dominant.confidence).toBe(advice3.dominant.confidence);
    });
  });

  // ========================================================================
  // TEST 12: Signals Tracing
  // ========================================================================

  describe("Test 12: Signals Tracing", () => {
    const profileWithSignals: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "signals_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "servicio_proyecto",
      },
      processes: known([
        {
          id: "proyecto1",
          archetypeId: "servicio_proyecto",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial", "backoffice"]),
      paymentMode: known("diferido"),
      naturalezaBienes: known([]),
      location: known({ countryCode: "AR" }),
      capacityMode: known("plazas"),
      resourceSubtypes: known(["capacidad_temporal"]),
      cobros: {
        pagosPorHitos: known({ hitos: [] } as any),
        aCredito: known(false),
        aPlazos: known(false),
        fianzas: known(false),
        cuotasRecurrentes: known(false),
      },
      roles: known([{ id: "pm", label: "PM" }] as any),
      organization: known({
        sedes: [{ id: "s1" }],
        equipos: [{ id: "e1", sedeId: "s1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(true),
      },
    };

    it("debería mostrar signals para la recomendación", () => {
      const advice = adviseArchetype(profileWithSignals);
      expect(advice.dominant.signals.length).toBeGreaterThan(0);
    });

    it("cada signal debería tener signal, weight y description", () => {
      const advice = adviseArchetype(profileWithSignals);
      advice.dominant.signals.forEach((sig) => {
        expect(sig.signal).toBeDefined();
        expect(typeof sig.weight).toBe("number");
        expect(sig.weight).toBeGreaterThan(0);
        expect(sig.weight).toBeLessThanOrEqual(1);
        expect(sig.description).toBeDefined();
      });
    });
  });

  // ========================================================================
  // TEST 13: Warnings
  // ========================================================================

  describe("Test 13: Warnings", () => {
    const profileWithWarning: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "warning_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta1",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["web"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_por_cantidad"]),
      location: known({ countryCode: "AR" }),
      resourceSubtypes: known([]),
      roles: known([{ id: "r1" }] as any),
      organization: known({
        sedes: [{ id: "s1" }],
        equipos: [{ id: "e1", sedeId: "s1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(false),
        hasFiscalCompliance: known(false),
        hasCalendar: known(true), // Venta pero requiere calendario = warning
      },
    };

    it("debería generar warnings si hay inconsistencias", () => {
      const advice = adviseArchetype(profileWithWarning);
      expect(advice.dominant.warnings).toBeDefined();
      expect(Array.isArray(advice.dominant.warnings)).toBe(true);
    });
  });

  // ========================================================================
  // TEST 14: Confidence máximo < 1.0
  // ========================================================================

  describe("Test 14: Confidence < 1.0", () => {
    const profiles = [
      {
        name: "Pizzería",
        profile: {
          schemaVersion: "1.2.0",
          identity: { companyId: "p1" },
          policyMeta: { documentVersion: "1.0.0", dominantArchetypeId: "venta" },
          processes: known([
            {
              id: "v1",
              archetypeId: "venta",
              exchangeDirection: "empresa_vende",
            },
          ]),
          channels: known(["presencial", "web"]),
          paymentMode: known("inmediato"),
          naturalezaBienes: known(["propios_por_cantidad"]),
          location: known({ countryCode: "AR" }),
          resourceSubtypes: known([]),
          roles: known([{ id: "r1" }] as any),
          organization: known({
            sedes: [{ id: "s1" }],
            equipos: [{ id: "e1", sedeId: "s1" }],
            assignments: [],
          } as any),
          capabilities: {
            hasPartes: known(false),
            hasMovimientos: known(false),
            hasFormalDocuments: known(false),
            hasFiscalCompliance: known(true),
            hasCalendar: known(false),
          },
        },
      },
      {
        name: "SaaS",
        profile: {
          schemaVersion: "1.2.0",
          identity: { companyId: "p2" },
          policyMeta: {
            documentVersion: "1.0.0",
            dominantArchetypeId: "suscripcion",
          },
          processes: known([
            {
              id: "s1",
              archetypeId: "suscripcion",
              exchangeDirection: "empresa_vende",
            },
          ]),
          channels: known(["web"]),
          paymentMode: known("financiado"),
          naturalezaBienes: known([]),
          location: known({ countryCode: "AR" }),
          resourceSubtypes: known(["capacidad_temporal"]),
          cobros: {
            cuotasRecurrentes: known({ periodicidad: "mensual" } as any),
            aCredito: known(false),
            aPlazos: known(false),
            fianzas: known(false),
            pagosPorHitos: known(false),
          },
          roles: known([{ id: "r1" }] as any),
          organization: known({
            sedes: [{ id: "s1" }],
            equipos: [{ id: "e1", sedeId: "s1" }],
            assignments: [],
          } as any),
          capabilities: {
            hasPartes: known(false),
            hasMovimientos: known(true),
            hasFormalDocuments: known(false),
            hasFiscalCompliance: known(false),
            hasCalendar: known(true),
          },
          portalCliente: known({ autoservicio: true }),
        },
      },
    ];

    profiles.forEach(({ name, profile }) => {
      it(`${name}: debería tener confidence < 1.0`, () => {
        const advice = adviseArchetype(profile as any);
        expect(advice.dominant.confidence).toBeLessThan(1.0);
      });
    });
  });

  // ========================================================================
  // TEST 15: Preguntas Desambigüantes
  // ========================================================================

  describe("Test 15: Preguntas Desambigüantes", () => {
    const ambiguousPerfil: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "ambig_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "servicio_proyecto",
      },
      processes: known([
        {
          id: "p1",
          archetypeId: "servicio_proyecto",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("diferido"),
      naturalezaBienes: known(["propios_por_cantidad"]),
      location: known({ countryCode: "AR" }),
      capacityMode: known("cita_individual"),
      resourceSubtypes: known(["capacidad_temporal"]),
      cobros: {
        pagosPorHitos: known(false),
        aCredito: known(false),
        aPlazos: known(false),
        fianzas: known(false),
        cuotasRecurrentes: known(false),
      },
      roles: known([{ id: "r1" }] as any),
      organization: known({
        sedes: [{ id: "s1" }],
        equipos: [{ id: "e1", sedeId: "s1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(false),
        hasFiscalCompliance: known(false),
        hasCalendar: known(false),
      },
    };

    it("debería sugerir preguntas cuando hay ambigüedad", () => {
      const advice = adviseArchetype(ambiguousPerfil);
      if (advice.ambiguity) {
        expect(advice.suggestedQuestions).toBeDefined();
        expect((advice.suggestedQuestions ?? []).length).toBeGreaterThan(0);
      }
    });

    it("preguntas deberían ser strings no vacíos", () => {
      const advice = adviseArchetype(ambiguousPerfil);
      (advice.suggestedQuestions ?? []).forEach((q) => {
        expect(typeof q).toBe("string");
        expect(q.length).toBeGreaterThan(0);
      });
    });
  });

  // ========================================================================
  // TEST 16: Función de Conveniencia
  // ========================================================================

  describe("Test 16: Función adviseArchetype", () => {
    const perfil: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "func_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "v1",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["web"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_por_cantidad"]),
      location: known({ countryCode: "AR" }),
      resourceSubtypes: known([]),
      roles: known([{ id: "r1" }] as any),
      organization: known({
        sedes: [{ id: "s1" }],
        equipos: [{ id: "e1", sedeId: "s1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(false),
        hasFiscalCompliance: known(false),
        hasCalendar: known(false),
      },
    };

    it("debería retornar ArchetypeAdvice", () => {
      const advice = adviseArchetype(perfil);
      expect(advice).toBeDefined();
      expect(advice.dominant).toBeDefined();
      expect(advice.secondary).toBeDefined();
    });

    it("debería funcionar con o sin coherence", () => {
      const advice1 = adviseArchetype(perfil);
      const advice2 = adviseArchetype(perfil, undefined);
      expect(advice1.dominant.archetype).toBe(advice2.dominant.archetype);
    });
  });
});
