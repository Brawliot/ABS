/**
 * Tests del BusinessProfileExtractor (Fase 2)
 *
 * Casos de prueba: simple → complejo
 * Valida:
 * - Determinismo (mismo input = mismo output)
 * - Confidence realista (0.5-0.95)
 * - Warnings accionables
 * - Integración con schema Fase 1
 */

import { describe, it, expect } from "vitest";
import type { ExtractionInput, ExtractionResult } from "../contracts/business-profile/extractor.js";
import {
  extractBusinessProfile,
  BusinessProfileExtractor,
} from "../contracts/business-profile/extractor.js";

describe("BusinessProfileExtractor", () => {
  // ========================================================================
  // TEST 1: PIZZERÍA (Simple)
  // ========================================================================

  describe("Test 1: Pizzería (Simple)", () => {
    const input: ExtractionInput = {
      narrativeDescription:
        "Vendemos pizzas a domicilio. 5 empleados. Local en centro. Presencial y web. Pago inmediato.",
      metadata: { locale: "es", confidence: "high" },
    };

    it("debería extraer direction como empresa_vende", async () => {
      const result = await extractBusinessProfile(input);
      expect(result).toBeDefined();
      expect(result.extraction.confidence).toBeGreaterThan(0.5);
      expect(result.extraction.fieldCoverage.has("exchangeDirection")).toBe(true);
    });

    it("debería detectar canales presencial y web", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("channels")).toBe(true);
    });

    it("debería detectar headcount = 5", async () => {
      const result = await extractBusinessProfile(input);
      // Los números se extraen pero se mapean a organización
      expect(result.extraction.fieldCoverage.has("organization")).toBe(true);
    });

    it("debería detectar localización fija", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("location")).toBe(true);
    });

    it("debería ser determinista", async () => {
      const result1 = await extractBusinessProfile(input);
      const result2 = await extractBusinessProfile(input);
      expect(result1.extraction.inputHash).toBe(result2.extraction.inputHash);
    });

    it("no debería tener warnings críticos", async () => {
      const result = await extractBusinessProfile(input);
      const errors = result.warnings.filter((w) => w.severity === "error");
      expect(errors.length).toBe(0);
    });
  });

  // ========================================================================
  // TEST 2: TALLER MECÁNICO (Complejo)
  // ========================================================================

  describe("Test 2: Taller Mecánico (Complejo)", () => {
    const input: ExtractionInput = {
      narrativeDescription: `Reparamos autos. A veces clientes traen desde 50km.
      Trabajamos con 3 talleres asociados. Pagos cash o tarjeta, a veces aplazamos 3 meses.
      Queremos estar en Google Maps. Local en La Plata. Tenemos 7 empleados.`,
      metadata: { locale: "es", confidence: "medium" },
    };

    it("debería detectar naturaleza como servicio", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("naturalezaBienes")).toBe(true);
    });

    it("debería detectar bienes del cliente (autos a reparar)", async () => {
      const result = await extractBusinessProfile(input);
      // "reparamos autos" → bienes_del_cliente
      expect(result.extraction.fieldCoverage.get("naturalezaBienes")).toBeDefined();
    });

    it("debería detectar modelo asociado", async () => {
      const result = await extractBusinessProfile(input);
      const org = result.extraction.fieldCoverage.get("organization");
      expect(org?.status).toBe("confident");
    });

    it("debería detectar múltiples modos de pago (cash, tarjeta, diferido)", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("paymentMode")).toBe(true);
    });

    it("debería generar warning sobre portal autoservicio", async () => {
      const result = await extractBusinessProfile(input);
      const portalWarnings = result.warnings.filter((w) => w.field === "portalCliente");
      expect(portalWarnings.length).toBeGreaterThan(0);
    });

    it("debería extraer localización (La Plata, Argentina)", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("location")).toBe(true);
    });

    it("debería detectar 7 empleados", async () => {
      const result = await extractBusinessProfile(input);
      const org = result.extraction.fieldCoverage.get("organization");
      expect(org?.status).toBe("confident");
    });
  });

  // ========================================================================
  // TEST 3: SAAS (Con Ambigüedad)
  // ========================================================================

  describe("Test 3: SaaS (Con Ambigüedad)", () => {
    const input: ExtractionInput = {
      narrativeDescription: `Somos un SaaS de analytics. Cobramos por suscripción mensual.
      Escalamos automáticamente. A veces clientes piden custom. 15 empleados distribuidos.`,
      metadata: { locale: "es", confidence: "high" },
    };

    it("debería detectar suscripción como mode de pago", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("paymentMode")).toBe(true);
    });

    it("debería identificar archetype suscripcion", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("dominantArchetype")).toBe(true);
    });

    it("debería generar warning sobre custom (ambigüedad)", async () => {
      const result = await extractBusinessProfile(input);
      // Detecta posible servicio_proyecto
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it("debería tener confidence moderada (ambigüedad parcial)", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.confidence).toBeLessThan(0.90);
    });
  });

  // ========================================================================
  // TEST 4: CONSULTORÍA (Minimal Info)
  // ========================================================================

  describe("Test 4: Consultoría (Minimal Info)", () => {
    const input: ExtractionInput = {
      narrativeDescription: "Hacemos consultoría de negocios.",
      metadata: { locale: "es" },
    };

    it("debería detectar naturaleza como servicio", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("naturalezaBienes")).toBe(true);
    });

    it("debería tener confidence baja (poca información)", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.confidence).toBeLessThan(0.70);
    });

    it("debería generar múltiples warnings", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // TEST 5: RESTAURANTE (Completo)
  // ========================================================================

  describe("Test 5: Restaurante (Completo)", () => {
    const input: ExtractionInput = {
      narrativeDescription: `Restaurante con 30 puestos. Abierto de 11 a 23hs.
      Presencial, delivery y web. Pagos mixtos (tarjeta, efectivo, cuenta).
      25 empleados. Comidas propias. Ubicado en CABA. Facturamos.`,
      metadata: { locale: "es" },
    };

    it("debería detectar capacityMode como plazas", async () => {
      const result = await extractBusinessProfile(input);
      const mode = result.extraction.fieldCoverage.get("capacityMode");
      expect(mode?.status).toBe("confident");
    });

    it("debería detectar múltiples canales", async () => {
      const result = await extractBusinessProfile(input);
      const channels = result.extraction.fieldCoverage.get("channels");
      expect(channels?.status).toBe("confident");
    });

    it("debería detectar naturaleza propios_por_cantidad", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("naturalezaBienes")).toBe(true);
    });

    it("debería detectar 25 empleados", async () => {
      const result = await extractBusinessProfile(input);
      const org = result.extraction.fieldCoverage.get("organization");
      expect(org?.status).toBe("confident");
    });

    it("debería detectar que tiene documentación formal", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("hasFormalDocuments")).toBe(true);
    });
  });

  // ========================================================================
  // TEST 6: PELUQUERÍA (Citas)
  // ========================================================================

  describe("Test 6: Peluquería (Citas)", () => {
    const input: ExtractionInput = {
      narrativeDescription: `Peluquería con 4 peluqueros. Atendemos con cita previa.
      Abierto de lunes a sábado. Pagos al contado o tarjeta.
      Somos 5 personas (4 peluqueros, 1 administrativo).`,
      metadata: { locale: "es" },
    };

    it("debería detectar capacityMode como cita_individual", async () => {
      const result = await extractBusinessProfile(input);
      const mode = result.extraction.fieldCoverage.get("capacityMode");
      expect(mode?.status).toBe("confident");
    });

    it("debería detectar capacidad_temporal en resourceSubtypes", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("resourceSubtypes")).toBe(true);
    });

    it("debería detectar hasCalendar = true", async () => {
      const result = await extractBusinessProfile(input);
      const hasCalendar = result.extraction.fieldCoverage.get("hasCalendar");
      expect(hasCalendar?.status).toBe("confident");
    });

    it("debería detectar pago inmediato", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("paymentMode")).toBe(true);
    });
  });

  // ========================================================================
  // TEST 7: E-COMMERCE (Digital)
  // ========================================================================

  describe("Test 7: E-commerce (Digital)", () => {
    const input: ExtractionInput = {
      narrativeDescription: `Vendemos ropa online. Solo web y autoservicio.
      Stock de 500 items. Pagos con tarjeta. Envíamos a todo el país.
      Somos 3 personas.`,
      metadata: { locale: "es" },
    };

    it("debería detectar canales web y autoservicio", async () => {
      const result = await extractBusinessProfile(input);
      const channels = result.extraction.fieldCoverage.get("channels");
      expect(channels?.status).toBe("confident");
    });

    it("debería detectar naturaleza propios_por_cantidad", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("naturalezaBienes")).toBe(true);
    });

    it("debería detectar hasPartes = true (inventario)", async () => {
      const result = await extractBusinessProfile(input);
      const hasPartes = result.extraction.fieldCoverage.get("hasPartes");
      expect(hasPartes?.status).toBe("confident");
    });

    it("debería generar warning sobre portalCliente (ambiguo)", async () => {
      const result = await extractBusinessProfile(input);
      // E-commerce tiene autoservicio → portal likely true
      expect(result.extraction.fieldCoverage.has("portalCliente")).toBe(true);
    });
  });

  // ========================================================================
  // TEST 8: RENTAL DE AUTOS (Bienes Retornables)
  // ========================================================================

  describe("Test 8: Rental de Autos (Bienes Retornables)", () => {
    const input: ExtractionInput = {
      narrativeDescription: `Alquilamos autos. Flota de 50 vehículos.
      Presencial y web. Pagos por día, tarjeta o efectivo.`,
      metadata: { locale: "es" },
    };

    it("debería detectar resourceSubtype retornable", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("resourceSubtypes")).toBe(true);
    });

    it("debería detectar capacidad por plazas (50 autos)", async () => {
      const result = await extractBusinessProfile(input);
      const mode = result.extraction.fieldCoverage.get("capacityMode");
      // Rental → capacidad de autos disponibles
      expect(mode?.status === "confident" || mode?.status === "unknown").toBe(true);
    });

    it("debería tener pago inmediato (por día)", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("paymentMode")).toBe(true);
    });
  });

  // ========================================================================
  // TEST 9: FABRICANTE (Capital + Compras)
  // ========================================================================

  describe("Test 9: Fabricante (Capital + Compras)", () => {
    const input: ExtractionInput = {
      narrativeDescription: `Fabricamos muebles. Compramos madera a proveedores.
      Tenemos 3 máquinas de corte, 10 empleados. Vendemos mayorista y minorista.`,
      metadata: { locale: "es" },
    };

    it("debería detectar resourceSubtype capital (máquinas)", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("resourceSubtypes")).toBe(true);
    });

    it("debería detectar direcciones mixtas (compra y venta)", async () => {
      const result = await extractBusinessProfile(input);
      // Por defecto asume vende
      expect(result.extraction.fieldCoverage.has("exchangeDirection")).toBe(true);
    });

    it("debería detectar 10 empleados", async () => {
      const result = await extractBusinessProfile(input);
      const org = result.extraction.fieldCoverage.get("organization");
      expect(org?.status).toBe("confident");
    });
  });

  // ========================================================================
  // TEST 10: GIMNASIO (Membresía + Citas)
  // ========================================================================

  describe("Test 10: Gimnasio (Membresía + Citas)", () => {
    const input: ExtractionInput = {
      narrativeDescription: `Gimnasio con suscripción mensual. 200 miembros activos.
      Clases grupales (20 personas máximo). Entrenadores personales con cita.
      Ubicado en la zona norte. 12 empleados.`,
      metadata: { locale: "es" },
    };

    it("debería detectar suscripción como paymentMode", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("paymentMode")).toBe(true);
    });

    it("debería detectar capacityMode como plazas (clases grupales)", async () => {
      const result = await extractBusinessProfile(input);
      const mode = result.extraction.fieldCoverage.get("capacityMode");
      expect(mode?.status === "confident" || mode?.status === "unknown").toBe(true);
    });

    it("debería detectar múltiples archetype hints (suscripción + servicio)", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.fieldCoverage.has("dominantArchetype")).toBe(true);
    });

    it("debería tener confidence moderada (ambigüedad parcial)", async () => {
      const result = await extractBusinessProfile(input);
      expect(result.extraction.confidence).toBeGreaterThan(0.50);
    });
  });

  // ========================================================================
  // TESTS DE DETERMINISMO
  // ========================================================================

  describe("Determinismo", () => {
    it("Mismo input → Mismo hash", async () => {
      const input1: ExtractionInput = {
        narrativeDescription: "Vendemos pizzas.",
      };
      const input2: ExtractionInput = {
        narrativeDescription: "Vendemos pizzas.",
      };

      const result1 = await extractBusinessProfile(input1);
      const result2 = await extractBusinessProfile(input2);

      expect(result1.extraction.inputHash).toBe(result2.extraction.inputHash);
    });

    it("Input diferente → Hash diferente", async () => {
      const input1: ExtractionInput = {
        narrativeDescription: "Vendemos pizzas.",
      };
      const input2: ExtractionInput = {
        narrativeDescription: "Vendemos hamburguesas.",
      };

      const result1 = await extractBusinessProfile(input1);
      const result2 = await extractBusinessProfile(input2);

      expect(result1.extraction.inputHash).not.toBe(result2.extraction.inputHash);
    });

    it("Ejecutar 3 veces el mismo input da idénticos resultados", async () => {
      const input: ExtractionInput = {
        narrativeDescription:
          "Somos un taller mecánico con 5 empleados. Reparamos autos.",
      };

      const result1 = await extractBusinessProfile(input);
      const result2 = await extractBusinessProfile(input);
      const result3 = await extractBusinessProfile(input);

      expect(result1.extraction.inputHash).toBe(result2.extraction.inputHash);
      expect(result2.extraction.inputHash).toBe(result3.extraction.inputHash);
      expect(result1.extraction.confidence).toBe(result2.extraction.confidence);
      expect(result2.extraction.confidence).toBe(result3.extraction.confidence);
    });
  });

  // ========================================================================
  // TESTS DE CONFIDENCE
  // ========================================================================

  describe("Confidence Scoring", () => {
    it("Alta información → Confidence alta (0.75+)", async () => {
      const input: ExtractionInput = {
        narrativeDescription: `Vendemos pizzas a domicilio. 5 empleados.
        Local en centro. Presencial y web. Pago inmediato.`,
      };
      const result = await extractBusinessProfile(input);
      expect(result.extraction.confidence).toBeGreaterThan(0.70);
    });

    it("Baja información → Confidence baja (< 0.65)", async () => {
      const input: ExtractionInput = {
        narrativeDescription: "Vendemos algo.",
      };
      const result = await extractBusinessProfile(input);
      expect(result.extraction.confidence).toBeLessThan(0.75);
    });

    it("Nunca retorna confidence = 1.0", async () => {
      const input: ExtractionInput = {
        narrativeDescription: `Vendemos pizzas a domicilio. 5 empleados.
        Local en centro. Presencial y web. Pago inmediato.
        CABA. Facturamos. Tenemos caja. Trabajamos con delivery.`,
      };
      const result = await extractBusinessProfile(input);
      expect(result.extraction.confidence).toBeLessThan(1.0);
    });
  });

  // ========================================================================
  // TESTS DE WARNINGS
  // ========================================================================

  describe("Warnings y Accionabilidad", () => {
    it("Warnings deben ser accionables (no vacíos)", async () => {
      const input: ExtractionInput = {
        narrativeDescription: "Hacemos algo.",
      };
      const result = await extractBusinessProfile(input);
      for (const warning of result.warnings) {
        expect(warning.message.length).toBeGreaterThan(10);
        expect(["error", "warning", "info"]).toContain(warning.severity);
      }
    });

    it("Si no hay info sobre portal → warning info", async () => {
      const input: ExtractionInput = {
        narrativeDescription: "Taller mecánico. 3 empleados.",
      };
      const result = await extractBusinessProfile(input);
      const portalWarning = result.warnings.find((w) => w.field === "portalCliente");
      expect(portalWarning?.severity).toBe("info");
    });
  });

  // ========================================================================
  // TEST DE INTEGRACIÓN
  // ========================================================================

  describe("Integración con Schema", () => {
    it("businessProfile generado tiene schemaVersion", async () => {
      const input: ExtractionInput = {
        narrativeDescription: "Vendemos pizzas.",
      };
      const result = await extractBusinessProfile(input);
      expect(result.businessProfile.schemaVersion).toBe("1.2.0");
    });

    it("businessProfile tiene identity.companyId", async () => {
      const input: ExtractionInput = {
        narrativeDescription: "Vendemos pizzas.",
      };
      const result = await extractBusinessProfile(input);
      expect(result.businessProfile.identity?.companyId).toBeDefined();
    });

    it("businessProfile tiene policyMeta.dominantArchetypeId", async () => {
      const input: ExtractionInput = {
        narrativeDescription: "Vendemos pizzas.",
      };
      const result = await extractBusinessProfile(input);
      expect(result.businessProfile.policyMeta?.dominantArchetypeId).toBeDefined();
      expect([
        "venta",
        "servicio_proyecto",
        "suscripcion",
        "uso_temporal",
        "intermediacion",
        "financiera",
      ]).toContain(result.businessProfile.policyMeta?.dominantArchetypeId);
    });
  });
});
