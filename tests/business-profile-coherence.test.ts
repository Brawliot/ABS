/**
 * Tests del CoherenceValidator (Fase 3)
 *
 * Casos de prueba: validación de coherencia, integridad y completitud
 * Total: 15+ test cases
 */

import { describe, it, expect } from "vitest";
import type { BusinessProfile } from "../contracts/business-profile/types.js";
import {
  validateCoherence,
  CoherenceValidator,
} from "../contracts/business-profile/coherence-validator.js";
import {
  known,
  unknownField,
  notApplicable,
} from "../contracts/business-profile/field.js";

describe("CoherenceValidator", () => {
  // ========================================================================
  // TEST 1: Pizzería (Coherente y completa)
  // ========================================================================

  describe("Test 1: Pizzería (Coherente)", () => {
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
      location: known({ countryCode: "AR", regionCode: "BA" }),
      capacityMode: known("plazas"),
      resourceSubtypes: known(["capacidad_temporal"]),
      roles: known([
        { id: "gerente", label: "Gerente" },
      ] as any),
      organization: known({ 
        sedes: [{ id: "sede1", label: "Sede Principal" }],
        equipos: [{ id: "equipo1", label: "Equipo 1", sedeId: "sede1" }],
        assignments: [],
      } as any),
      capabilities: {
        hasPartes: known(true),
        hasMovimientos: known(true),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
      portalCliente: known({ autoservicio: false }),
    };

    it("debería tener coherencia = true", () => {
      const result = validateCoherence(pizzeriaProfile);
      expect(result.isCoherent).toBe(true);
    });

    it("debería tener completeness.overall >= 0.8", () => {
      const result = validateCoherence(pizzeriaProfile);
      expect(result.completeness.overall).toBeGreaterThanOrEqual(0.8);
    });

    it("debería tener 0 contradicciones", () => {
      const result = validateCoherence(pizzeriaProfile);
      expect(result.contradictions.length).toBe(0);
    });

    it("debería tener missingCritical vacío", () => {
      const result = validateCoherence(pizzeriaProfile);
      expect(result.missingCritical.length).toBe(0);
    });

    it("debería tener categorías de completeness", () => {
      const result = validateCoherence(pizzeriaProfile);
      expect(Object.keys(result.completeness.byCategory).length).toBeGreaterThan(0);
      expect(result.completeness.byCategory.exchange).toBeDefined();
      expect(result.completeness.byCategory.distribution).toBeDefined();
    });
  });

  // ========================================================================
  // TEST 2: SaaS sin payment (Incompleto)
  // ========================================================================

  describe("Test 2: SaaS sin paymentMode (Incompleto)", () => {
    const saasProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "saas_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "suscripcion",
      },
      processes: known([
        {
          id: "suscripcion",
          archetypeId: "suscripcion",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["web"]),
      paymentMode: unknownField(), // FALTA
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "AR" }),
      capacityMode: unknownField(),
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

    it("debería tener coherencia = false", () => {
      const result = validateCoherence(saasProfile);
      expect(result.isCoherent).toBe(false);
    });

    it("debería tener completeness < 0.6", () => {
      const result = validateCoherence(saasProfile);
      expect(result.completeness.overall).toBeLessThan(0.6);
    });

    it("debería detectar paymentMode en missingCritical", () => {
      const result = validateCoherence(saasProfile);
      expect(result.missingCritical).toContain("paymentMode");
    });

    it("debería sugerir especificar paymentMode", () => {
      const result = validateCoherence(saasProfile);
      const paymentSuggestion = result.suggestions.find((s) => s.field === "paymentMode");
      expect(paymentSuggestion).toBeDefined();
      expect(paymentSuggestion?.priority).toBe("high");
    });
  });

  // ========================================================================
  // TEST 3: Virtual + Presencial sin Digital (Contradictorio)
  // ========================================================================

  describe("Test 3: Virtual + Presencial (Contradictorio)", () => {
    const contradictoryProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "contradictory_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "servicio_proyecto",
      },
      processes: known([
        {
          id: "servicio",
          archetypeId: "servicio_proyecto",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "VIRTUAL" }), // VIRTUAL
      capacityMode: known("cita_individual"),
      resourceSubtypes: known(["capacidad_temporal"]),
      roles: known([{ roleId: "operario", name: "Operario" }]),
      organization: known({  model: "pyme", headcount: 2 }),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(true),
      },
    };

    it("debería detectar contradicción location.kind vs channels", () => {
      const result = validateCoherence(contradictoryProfile);
      const contradiction = result.contradictions.find(
        (c) => c.field1 === "location.kind" || c.field2 === "channels",
      );
      expect(contradiction).toBeDefined();
      expect(contradiction?.severity).toBe("error");
    });

    it("debería sugerir agregar canal 'web' para virtual", () => {
      const result = validateCoherence(contradictoryProfile);
      const suggestion = result.suggestions.find(
        (s) => s.field === "channels" && s.priority === "high",
      );
      expect(suggestion).toBeDefined();
    });
  });

  // ========================================================================
  // TEST 4: Individual + Múltiples empleados (Error)
  // ========================================================================

  describe("Test 4: Individual con 5 empleados (Error)", () => {
    const individualProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "individual_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "AR" }),
      capacityMode: unknownField(),
      resourceSubtypes: unknownField(),
      roles: unknownField(),
      organization: known({  model: "individual", headcount: 5 }), // ERROR
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(false),
        hasFiscalCompliance: known(false),
        hasCalendar: known(false),
      },
    };

    it("debería detectar contradicción organization.model vs headcount", () => {
      const result = validateCoherence(individualProfile);
      const contradiction = result.contradictions.find(
        (c) => c.field1 === "organization.model" || c.field2 === "organization.headcount",
      );
      expect(contradiction).toBeDefined();
      expect(contradiction?.severity).toBe("error");
    });

    it("debería tener isCoherent = false", () => {
      const result = validateCoherence(individualProfile);
      expect(result.isCoherent).toBe(false);
    });
  });

  // ========================================================================
  // TEST 5: Citas sin Calendario (Error)
  // ========================================================================

  describe("Test 5: Citas individuales sin calendario (Error)", () => {
    const citasProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "citas_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "servicio_proyecto",
      },
      processes: known([
        {
          id: "servicio",
          archetypeId: "servicio_proyecto",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "AR" }),
      capacityMode: known("cita_individual"), // Citas
      resourceSubtypes: known(["capacidad_temporal"]),
      roles: known([{ roleId: "terapeuta", name: "Terapeuta" }]),
      organization: known({  model: "pyme", headcount: 2 }),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false), // ERROR: Sin calendario
      },
    };

    it("debería detectar error: citas sin calendario", () => {
      const result = validateCoherence(citasProfile);
      const contradiction = result.contradictions.find(
        (c) => c.field1 === "capacityMode" && c.field2 === "capabilities.hasCalendar",
      );
      expect(contradiction).toBeDefined();
      expect(contradiction?.severity).toBe("error");
    });
  });

  // ========================================================================
  // TEST 6: Financiado sin documentos (Error)
  // ========================================================================

  describe("Test 6: Pago financiado sin documentos (Error)", () => {
    const financiadoProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "financiado_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta_financiada",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("financiado"), // Financiado
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "AR" }),
      capacityMode: unknownField(),
      resourceSubtypes: unknownField(),
      roles: unknownField(),
      organization: known({  model: "pyme", headcount: 3 }),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(false), // ERROR: Sin documentos
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
    };

    it("debería detectar error: financiado sin documentos", () => {
      const result = validateCoherence(financiadoProfile);
      const contradiction = result.contradictions.find(
        (c) => c.field1 === "paymentMode" && c.field2 === "capabilities.hasFormalDocuments",
      );
      expect(contradiction).toBeDefined();
      expect(contradiction?.severity).toBe("error");
    });
  });

  // ========================================================================
  // TEST 7: Portal autoservicio sin canal digital (Error)
  // ========================================================================

  describe("Test 7: Portal autoservicio sin canal digital (Error)", () => {
    const portalProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "portal_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta_online",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]), // SIN DIGITAL
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "AR" }),
      capacityMode: unknownField(),
      resourceSubtypes: unknownField(),
      roles: unknownField(),
      organization: known({  model: "pyme", headcount: 2 }),
      portalCliente: known({ autoservicio: true }), // Portal autoservicio
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
    };

    it("debería detectar error: portal autoservicio sin canal digital", () => {
      const result = validateCoherence(portalProfile);
      const contradiction = result.contradictions.find(
        (c) => c.field1 === "portalCliente" && c.field2 === "channels",
      );
      expect(contradiction).toBeDefined();
      expect(contradiction?.severity).toBe("error");
    });
  });

  // ========================================================================
  // TEST 8: Multiparte sin hasPartes (Error)
  // ========================================================================

  describe("Test 8: Bienes multiparte sin hasPartes (Error)", () => {
    const multiparteProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "multipart_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_por_cantidad"]), // Multiparte
      location: known({ countryCode: "AR" }),
      capacityMode: unknownField(),
      resourceSubtypes: unknownField(),
      roles: unknownField(),
      organization: known({  model: "pyme", headcount: 3 }),
      capabilities: {
        hasPartes: known(false), // ERROR: Sin hasPartes
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
    };

    it("debería detectar error: multiparte sin hasPartes", () => {
      const result = validateCoherence(multiparteProfile);
      const contradiction = result.contradictions.find(
        (c) => c.field1 === "naturalezaBienes" && c.field2 === "capabilities.hasPartes",
      );
      expect(contradiction).toBeDefined();
      expect(contradiction?.severity).toBe("error");
    });
  });

  // ========================================================================
  // TEST 9: Procesos vacíos (Missing Critical)
  // ========================================================================

  describe("Test 9: Sin procesos definidos (Critical)", () => {
    const noProcessesProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "no_proc_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([]), // VACÍO
      channels: known(["presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "AR" }),
      capacityMode: unknownField(),
      resourceSubtypes: unknownField(),
      roles: unknownField(),
      organization: known({  model: "pyme", headcount: 2 }),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
    };

    it("debería incluir 'processes' en missingCritical", () => {
      const result = validateCoherence(noProcessesProfile);
      expect(result.missingCritical).toContain("processes");
    });

    it("debería tener isCoherent = false", () => {
      const result = validateCoherence(noProcessesProfile);
      expect(result.isCoherent).toBe(false);
    });
  });

  // ========================================================================
  // TEST 10: Sin canales (Critical)
  // ========================================================================

  describe("Test 10: Sin canales definidos (Critical)", () => {
    const noChannelsProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "no_channels_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known([]), // VACÍO
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "AR" }),
      capacityMode: unknownField(),
      resourceSubtypes: unknownField(),
      roles: unknownField(),
      organization: known({  model: "pyme", headcount: 2 }),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
    };

    it("debería incluir 'channels' en missingCritical", () => {
      const result = validateCoherence(noChannelsProfile);
      expect(result.missingCritical).toContain("channels");
    });
  });

  // ========================================================================
  // TEST 11: Sin location (Critical)
  // ========================================================================

  describe("Test 11: Sin ubicación (Critical)", () => {
    const noLocationProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "no_location_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]),
      location: unknownField(), // DESCONOCIDO
      capacityMode: unknownField(),
      resourceSubtypes: unknownField(),
      roles: unknownField(),
      organization: known({  model: "pyme", headcount: 2 }),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
    };

    it("debería incluir 'location' en missingCritical", () => {
      const result = validateCoherence(noLocationProfile);
      expect(result.missingCritical).toContain("location");
    });
  });

  // ========================================================================
  // TEST 12: Calendario sin citas (Warning/Suggestion)
  // ========================================================================

  describe("Test 12: Calendario sin citas individuales (Warning)", () => {
    const calendarWithoutCitasProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "cal_no_citas_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "AR" }),
      capacityMode: known("plazas"), // NO es cita_individual
      resourceSubtypes: known(["capacidad_temporal"]),
      roles: known([{ roleId: "operario", name: "Operario" }]),
      organization: known({  model: "pyme", headcount: 2 }),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(true), // Pero tiene calendario
      },
    };

    it("debería sugerir revisar modelo de capacidad", () => {
      const result = validateCoherence(calendarWithoutCitasProfile);
      const suggestion = result.suggestions.find(
        (s) => s.field === "capacityMode" && s.priority === "low",
      );
      expect(suggestion).toBeDefined();
    });
  });

  // ========================================================================
  // TEST 13: Sugerencias de roles
  // ========================================================================

  describe("Test 13: Sin roles definidos (Suggestion)", () => {
    const noRolesProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "no_roles_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "AR" }),
      capacityMode: unknownField(),
      resourceSubtypes: unknownField(),
      roles: unknownField(), // SIN ROLES
      organization: known({  model: "pyme", headcount: 2 }),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
    };

    it("debería sugerir definir roles", () => {
      const result = validateCoherence(noRolesProfile);
      const suggestion = result.suggestions.find((s) => s.field === "roles");
      expect(suggestion).toBeDefined();
      expect(suggestion?.priority).toBe("medium");
    });
  });

  // ========================================================================
  // TEST 14: Servicios sin especificar capacityMode
  // ========================================================================

  describe("Test 14: Servicio sin especificar capacityMode (Suggestion)", () => {
    const servicioSinCapacidadProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "service_no_cap_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "servicio_proyecto",
      },
      processes: known([
        {
          id: "servicio",
          archetypeId: "servicio_proyecto",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]), // Servicio
      location: known({ countryCode: "AR" }),
      capacityMode: unknownField(), // NO ESPECIFICADO
      resourceSubtypes: unknownField(),
      roles: known([{ roleId: "operario", name: "Operario" }]),
      organization: known({  model: "pyme", headcount: 2 }),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
    };

    it("debería sugerir especificar capacityMode para servicios", () => {
      const result = validateCoherence(servicioSinCapacidadProfile);
      const suggestion = result.suggestions.find((s) => s.field === "capacityMode");
      expect(suggestion).toBeDefined();
      expect(suggestion?.priority).toBe("medium");
    });
  });

  // ========================================================================
  // TEST 15: Perfil con campos unknown (No falla)
  // ========================================================================

  describe("Test 15: Perfil con campos unknown (No falla)", () => {
    const unknownFieldsProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "unknown_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: unknownField(), // UNKNOWN
      channels: unknownField(), // UNKNOWN
      paymentMode: unknownField(), // UNKNOWN
      naturalezaBienes: unknownField(), // UNKNOWN
      location: unknownField(), // UNKNOWN
      capacityMode: unknownField(),
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

    it("no debería lanzar error", () => {
      expect(() => {
        validateCoherence(unknownFieldsProfile);
      }).not.toThrow();
    });

    it("debería marcar campos como missingCritical", () => {
      const result = validateCoherence(unknownFieldsProfile);
      expect(result.missingCritical.length).toBeGreaterThan(0);
    });

    it("debería tener isCoherent = false", () => {
      const result = validateCoherence(unknownFieldsProfile);
      expect(result.isCoherent).toBe(false);
    });

    it("debería tener completeness < 0.5", () => {
      const result = validateCoherence(unknownFieldsProfile);
      expect(result.completeness.overall).toBeLessThan(0.5);
    });
  });

  // ========================================================================
  // TEST 16: Sugerencias accionables
  // ========================================================================

  describe("Test 16: Sugerencias accionables", () => {
    const suggestionsProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "sugg_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "servicio_proyecto",
      },
      processes: known([
        {
          id: "servicio",
          archetypeId: "servicio_proyecto",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]), // Servicio
      location: known({ countryCode: "VIRTUAL" }), // Virtual
      capacityMode: unknownField(),
      resourceSubtypes: unknownField(),
      roles: unknownField(),
      organization: known({  model: "pyme", headcount: 1 }),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(true),
        hasFiscalCompliance: known(true),
        hasCalendar: known(false),
      },
    };

    it("debería tener sugerencias con reason no vacío", () => {
      const result = validateCoherence(suggestionsProfile);
      result.suggestions.forEach((s) => {
        expect(s.reason).toBeTruthy();
        expect(s.reason.length).toBeGreaterThan(0);
      });
    });

    it("debería tener sugerencias con priority definido", () => {
      const result = validateCoherence(suggestionsProfile);
      result.suggestions.forEach((s) => {
        expect(["low", "medium", "high"]).toContain(s.priority);
      });
    });

    it("debería sugerir agregar 'web' para servicio virtual", () => {
      const result = validateCoherence(suggestionsProfile);
      const webSuggestion = result.suggestions.find((s) => s.field === "channels");
      expect(webSuggestion).toBeDefined();
    });
  });

  // ========================================================================
  // TEST 17: Función pública validateCoherence
  // ========================================================================

  describe("Test 17: Función pública validateCoherence", () => {
    const minimalProfile: any = {
      schemaVersion: "1.2.0",
      identity: { companyId: "minimal_001" },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta",
      },
      processes: known([
        {
          id: "venta",
          archetypeId: "venta",
          exchangeDirection: "empresa_vende",
        },
      ]),
      channels: known(["presencial"]),
      paymentMode: known("inmediato"),
      naturalezaBienes: known(["propios_unitarios"]),
      location: known({ countryCode: "AR" }),
      capacityMode: unknownField(),
      resourceSubtypes: unknownField(),
      roles: unknownField(),
      organization: known({  model: "pyme", headcount: 1 }),
      capabilities: {
        hasPartes: known(false),
        hasMovimientos: known(false),
        hasFormalDocuments: known(false),
        hasFiscalCompliance: known(false),
        hasCalendar: known(false),
      },
    };

    it("debería retornar CoherenceCheckResult válido", () => {
      const result = validateCoherence(minimalProfile);
      expect(result).toHaveProperty("isCoherent");
      expect(result).toHaveProperty("completeness");
      expect(result).toHaveProperty("contradictions");
      expect(result).toHaveProperty("missingCritical");
      expect(result).toHaveProperty("suggestions");
    });

    it("debería ser determinista", () => {
      const result1 = validateCoherence(minimalProfile);
      const result2 = validateCoherence(minimalProfile);

      expect(result1.isCoherent).toBe(result2.isCoherent);
      expect(result1.completeness.overall).toBe(result2.completeness.overall);
      expect(result1.contradictions.length).toBe(result2.contradictions.length);
    });
  });
});
