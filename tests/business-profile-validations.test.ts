/**
 * Tests para validaciones contextuales del BusinessProfile (Fase 1).
 * Valida las 12 nuevas reglas de negocio y contradicciones.
 */

import { describe, it, expect } from "vitest";
import { validateBusinessProfile, BusinessProfileError } from "../contracts/business-profile/index.js";
import {
  known,
  unknownField,
  notApplicable,
} from "../contracts/business-profile/field.js";

// Perfil base válido (punto de partida)
const BASE_VALID_PROFILE = {
  schemaVersion: "1.2.0",
  identity: { companyId: "test-company" },
  policyMeta: {
    documentVersion: "1.0.0",
    dominantArchetypeId: "venta" as const,
  },
  processes: known([
    {
      id: "proc-1",
      archetypeId: "venta" as const,
      label: "Venta principal",
      exchangeDirection: "empresa_vende" as const,
    },
  ]),
  channels: known(["presencial", "web"] as const),
  paymentMode: known("inmediato" as const),
  resourceSubtypes: known(["capacidad_temporal"] as const),
  capacityMode: known("cita_individual" as const),
  naturalezaBienes: known(["propios_por_cantidad"] as const),
  location: known({ countryCode: "ES", regionCode: "Madrid" }),
  capabilities: {
    hasPartes: known(true),
    hasMovimientos: known(true),
    hasFormalDocuments: known(true),
    hasFiscalCompliance: known(false),
    hasCalendar: known(true),
  },
  roles: known([
    { id: "admin", label: "Administrador" },
    { id: "vendedor", label: "Vendedor" },
  ]),
  calendar: known({
    id: "cal-1",
    weeklyHours: {
      "1": [{ start: "09:00", end: "18:00" }],
      "2": [{ start: "09:00", end: "18:00" }],
      "3": [{ start: "09:00", end: "18:00" }],
      "4": [{ start: "09:00", end: "18:00" }],
      "5": [{ start: "09:00", end: "18:00" }],
    },
  }),
  permissions: known([]),
  permissionFallback: known({ roleId: "admin" }),
  compliance: known([]),
  catalogFields: known(["importe", "parte_id"]),
  organization: known({
    sedes: [{ id: "sede-1", label: "Sede Principal" }],
    equipos: [{ id: "eq-1", label: "Equipo Ventas", sedeId: "sede-1" }],
    assignments: [
      { actorId: "u1", sedeId: "sede-1", equipoId: "eq-1", roleId: "vendedor" },
    ],
  }),
  businessPolicies: known([]),
  pipelineStateIds: known(["propuesta", "ganada", "completada"]),
};

describe("BusinessProfile Validations (Fase 1)", () => {
  describe("VALIDACIÓN 1: portalCliente.autoservicio=true requiere canal autoservicio", () => {
    it("debe pasar cuando portalCliente.autoservicio=true y canal autoservicio existe", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        channels: known(["autoservicio", "web"] as const),
        roles: known([
          { id: "admin", label: "Admin" },
          { id: "cliente", label: "Cliente" },
          { id: "vendedor", label: "Vendedor" },
        ]),
        portalCliente: known({ autoservicio: true }),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe fallar cuando portalCliente.autoservicio=true sin canal autoservicio", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        portalCliente: known({ autoservicio: true }),
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });

    it("debe pasar cuando portalCliente.autoservicio=false sin canal autoservicio", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        portalCliente: known({ autoservicio: false }),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe pasar cuando portalCliente es unknown", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        portalCliente: unknownField(),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });
  });

  describe("VALIDACIÓN 2: canal autoservicio requiere rol cliente", () => {
    it("debe fallar cuando hay autoservicio sin rol cliente", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        channels: known(["autoservicio", "web"] as const),
        roles: known([
          { id: "admin", label: "Admin" },
          { id: "vendedor", label: "Vendedor" },
        ]),
        organization: known({
          sedes: [{ id: "sede-1", label: "Sede Principal" }],
          equipos: [{ id: "eq-1", label: "Equipo Ventas", sedeId: "sede-1" }],
          assignments: [
            { actorId: "u1", sedeId: "sede-1", equipoId: "eq-1", roleId: "vendedor" },
          ],
        }),
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });

    it("debe pasar cuando hay autoservicio y rol cliente", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        channels: known(["autoservicio", "web"] as const),
        roles: known([
          { id: "admin", label: "Admin" },
          { id: "cliente", label: "Cliente" },
          { id: "vendedor", label: "Vendedor" },
        ]),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe pasar cuando no hay autoservicio", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        channels: known(["presencial", "web"] as const),
        roles: known([
          { id: "admin", label: "Admin" },
          { id: "vendedor", label: "Vendedor" },
        ]),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });
  });

  describe("VALIDACIÓN 3: resourceSubtypes no puede estar vacío si es known", () => {
    it("debe pasar cuando resourceSubtypes tiene valores", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        resourceSubtypes: known(["capacidad_temporal"] as const),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe fallar cuando resourceSubtypes es array vacío", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        resourceSubtypes: known([] as const),
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });

    it("debe pasar cuando resourceSubtypes es unknown", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        resourceSubtypes: unknownField(),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe pasar cuando resourceSubtypes es not_applicable", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        resourceSubtypes: notApplicable(),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });
  });

  describe("VALIDACIÓN 4: organization assignments deben referenciar roles existentes", () => {
    it("debe pasar cuando todos los roles asignados existen", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        organization: known({
          sedes: [{ id: "sede-1", label: "Sede" }],
          equipos: [{ id: "eq-1", label: "Equipo", sedeId: "sede-1" }],
          assignments: [
            { actorId: "u1", sedeId: "sede-1", equipoId: "eq-1", roleId: "admin" },
          ],
        }),
        roles: known([{ id: "admin", label: "Admin" }]),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe fallar cuando rol asignado no existe", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        organization: known({
          sedes: [{ id: "sede-1", label: "Sede" }],
          equipos: [{ id: "eq-1", label: "Equipo", sedeId: "sede-1" }],
          assignments: [
            { actorId: "u1", sedeId: "sede-1", equipoId: "eq-1", roleId: "inexistente" },
          ],
        }),
        roles: known([{ id: "admin", label: "Admin" }]),
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });
  });

  describe("VALIDACIÓN 6: capacidad_temporal requiere hasCalendar=true", () => {
    it("debe fallar cuando tiene capacidad_temporal y hasCalendar=false", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        resourceSubtypes: known(["capacidad_temporal"] as const),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasCalendar: known(false),
        },
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });

    it("debe pasar cuando tiene capacidad_temporal y hasCalendar=true", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        resourceSubtypes: known(["capacidad_temporal"] as const),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasCalendar: known(true),
        },
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe pasar cuando no tiene capacidad_temporal", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        resourceSubtypes: known(["retornable", "capital"] as const),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasCalendar: known(false),
        },
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });
  });

  describe("VALIDACIÓN 7: hasFiscalCompliance=true requiere hasFormalDocuments=true", () => {
    it("debe fallar cuando hasFiscalCompliance=true y hasFormalDocuments=false", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasFiscalCompliance: known(true),
          hasFormalDocuments: known(false),
        },
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });

    it("debe pasar cuando ambas son true", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasFiscalCompliance: known(true),
          hasFormalDocuments: known(true),
        },
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe pasar cuando hasFiscalCompliance=false", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasFiscalCompliance: known(false),
          hasFormalDocuments: known(false),
        },
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });
  });

  describe("VALIDACIÓN 8: compliance policies requieren hasFormalDocuments=true", () => {
    it("debe fallar cuando hay compliance y hasFormalDocuments=false", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        compliance: known([
          {
            id: "comp-1",
            kind: "cumplimiento" as const,
            transitionId: "t-1",
          },
        ]),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasFormalDocuments: known(false),
        },
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });

    it("debe pasar cuando hay compliance y hasFormalDocuments=true", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        compliance: known([
          {
            id: "comp-1",
            kind: "cumplimiento" as const,
            transitionId: "t-1",
          },
        ]),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasFormalDocuments: known(true),
        },
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe pasar cuando compliance está vacío", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        compliance: known([]),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasFormalDocuments: known(false),
        },
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });
  });

  describe("VALIDACIÓN 9: roles no puede estar vacío si es known", () => {
    it("debe pasar cuando roles tiene elementos", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        roles: known([
          { id: "admin", label: "Admin" },
          { id: "vendedor", label: "Vendedor" },
        ]),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe fallar cuando roles es array vacío", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        roles: known([]),
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });

    it("debe pasar cuando roles es unknown", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        roles: unknownField(),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });
  });

  describe("VALIDACIÓN 10: composition.dominant debe coincidir con policyMeta.dominantArchetypeId", () => {
    it("debe fallar cuando no coinciden", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        processes: known([
          {
            id: "proc-1",
            archetypeId: "venta" as const,
            exchangeDirection: "empresa_vende" as const,
          },
          {
            id: "proc-2",
            archetypeId: "suscripcion" as const,
            exchangeDirection: "empresa_vende" as const,
          },
        ]),
        policyMeta: {
          documentVersion: "1.0.0",
          dominantArchetypeId: "venta" as const,
        },
        composition: known({
          dominant: "suscripcion" as const,
          secondaries: [
            {
              secondaryArchetypeId: "venta" as const,
              bornInDominantState: "s-1",
              bloquea: "s-2",
            },
          ],
        }),
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });

    it("debe pasar cuando coinciden", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        processes: known([
          {
            id: "proc-1",
            archetypeId: "venta" as const,
            exchangeDirection: "empresa_vende" as const,
          },
          {
            id: "proc-2",
            archetypeId: "financiera" as const,
            exchangeDirection: "empresa_vende" as const,
          },
        ]),
        policyMeta: {
          documentVersion: "1.0.0",
          dominantArchetypeId: "venta" as const,
        },
        composition: known({
          dominant: "venta" as const,
          secondaries: [
            {
              secondaryArchetypeId: "financiera" as const,
              bornInDominantState: "s-1",
              bloquea: "s-2",
            },
          ],
        }),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });
  });

  describe("VALIDACIÓN 11: empresa_vende con paymentMode=diferido requiere hasFormalDocuments=true", () => {
    it("debe fallar cuando empresa_vende, diferido, sin documentos", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        processes: known([
          {
            id: "proc-1",
            archetypeId: "venta" as const,
            exchangeDirection: "empresa_vende" as const,
          },
        ]),
        paymentMode: known("diferido" as const),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasFormalDocuments: known(false),
        },
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });

    it("debe pasar cuando empresa_vende, diferido, con documentos", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        processes: known([
          {
            id: "proc-1",
            archetypeId: "venta" as const,
            exchangeDirection: "empresa_vende" as const,
          },
        ]),
        paymentMode: known("diferido" as const),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasFormalDocuments: known(true),
        },
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe pasar cuando empresa_vende pero paymentMode != diferido", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        processes: known([
          {
            id: "proc-1",
            archetypeId: "venta" as const,
            exchangeDirection: "empresa_vende" as const,
          },
        ]),
        paymentMode: known("inmediato" as const),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasFormalDocuments: known(false),
        },
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });
  });

  describe("VALIDACIÓN 12: propios_por_cantidad requiere hasPartes=true", () => {
    it("debe fallar cuando propios_por_cantidad y hasPartes=false", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        naturalezaBienes: known(["propios_por_cantidad"] as const),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasPartes: known(false),
        },
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });

    it("debe pasar cuando propios_por_cantidad y hasPartes=true", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        naturalezaBienes: known(["propios_por_cantidad"] as const),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasPartes: known(true),
        },
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe pasar cuando no tiene propios_por_cantidad", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        naturalezaBienes: known(["propios_unitarios"] as const),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasPartes: known(false),
        },
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });
  });

  describe("Integration tests: múltiples validaciones", () => {
    it("perfil base válido debe pasar todas las validaciones", () => {
      expect(() => validateBusinessProfile(BASE_VALID_PROFILE)).not.toThrow();
    });

    it("debe detectar múltiples violaciones", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        roles: known([]), // Viola VALIDACIÓN 9
        channels: known(["autoservicio"] as const), // Viola VALIDACIÓN 2 (sin rol cliente)
        resourceSubtypes: known([] as const), // Viola VALIDACIÓN 3
      };
      expect(() => validateBusinessProfile(profile)).toThrow(BusinessProfileError);
    });

    it("debe permitir perfiles con campos unknown", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        resourceSubtypes: unknownField(),
        capacityMode: unknownField(),
        calendar: unknownField(),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });

    it("debe permitir perfiles con campos not_applicable", () => {
      const profile = {
        ...BASE_VALID_PROFILE,
        resourceSubtypes: notApplicable(),
        capacityMode: notApplicable(),
        composition: notApplicable(),
        capabilities: {
          ...BASE_VALID_PROFILE.capabilities,
          hasCalendar: known(false), // not_applicable con hasCalendar=false no es contradicción
        },
        calendar: notApplicable(),
      };
      expect(() => validateBusinessProfile(profile)).not.toThrow();
    });
  });
});
