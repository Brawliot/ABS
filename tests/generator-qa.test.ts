/**
 * Criterios Probador MVP:
 * - Concesionaria completa venta con crédito hasta el cierre (roles combinados)
 * - Callejón sin salida inyectado se detecta y bloquea la entrega
 * - Pase < 5 minutos en especificación mediana
 */

import { describe, expect, it } from "vitest";
import { minimalExampleLifecycle } from "../archetypes/minimal-example.js";
import {
  buildConcesionariaGeneratorInput,
  generateUiSpec,
} from "../generator/index.js";
import {
  QA_MAX_DURATION_MS,
  runQaPass,
  type QaReport,
} from "../generator/qa/index.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import type { PolicyDocument } from "../policies/types.js";
import type { GeneratorInput } from "../generator/types.js";

function deadEndInput(): GeneratorInput {
  const life = minimalExampleLifecycle;
  const doc: PolicyDocument = {
    id: "pol-deadend",
    version: "1.0.0",
    companyId: "qa-deadend",
    archetypeId: "venta",
    roles: [
      { id: "ops", label: "Operaciones" },
      { id: "gerente_ausente", label: "Gerente ausente" },
    ],
    permissions: [
      {
        id: "perm-aceptar",
        kind: "permiso",
        transitionId: "t_aceptar",
        allowedRoles: ["ops"],
      },
      // Salidas desde «activo» solo para un rol que el Probador no simula
      {
        id: "perm-cerrar-ghost",
        kind: "permiso",
        transitionId: "t_cerrar",
        allowedRoles: ["gerente_ausente"],
      },
      {
        id: "perm-rechazar-ghost",
        kind: "permiso",
        transitionId: "t_rechazar",
        allowedRoles: ["gerente_ausente"],
      },
    ],
  };
  const catalog = catalogFromLifecycle(
    life.transitions.map((t) => t.id),
    life.states.map((s) => s.id),
    ["importe", "factura_id"],
  );
  const ruleSet = compilePolicies(doc, {
    catalog,
    activationAt: "2026-01-01T00:00:00.000Z",
    compiledVersion: "compiled:deadend-1",
  });
  return {
    caseId: "case-deadend",
    caseVersion: "1",
    companyId: "qa-deadend",
    generatedAt: "2026-06-01T00:00:00.000Z",
    lifecycles: [
      {
        id: "lc.trap",
        archetypeId: "venta",
        lifecycle: life,
        label: "Trampa",
      },
    ],
    ruleSet,
    // Solo se simula ops → nadie puede salir de «activo»
    roles: [{ id: "ops", label: "Operaciones" }],
    channels: ["backoffice"],
    resourceSubtypes: [],
    naturalezaBienes: [],
    paymentMode: "inmediato",
    hasPartes: true,
    hasMovimientos: false,
    hasFormalDocuments: false,
    hasFiscalCompliance: false,
    hasCalendar: false,
  };
}

describe("Probador MVP — pase final del Generador", () => {
  it("la concesionaria completa una venta con crédito hasta el cierre combinando roles", () => {
    const input = buildConcesionariaGeneratorInput();
    const spec = generateUiSpec(input);
    const report = runQaPass(input, spec);

    const sale = report.scenarios.find((s) => s.id === "credit-sale");
    expect(sale).toBeDefined();
    expect(sale!.reachedTerminal).toBe(true);
    expect(sale!.terminalStateId).toBe("cerrada");
    // Combina al menos comercial (aceptar) + finanzas/gerente (cierre)
    expect(sale!.rolesUsed.length).toBeGreaterThanOrEqual(2);
    expect(sale!.transitionsApplied).toContain("t_aceptar");
    expect(sale!.transitionsApplied).toContain("t_cerrar");
    expect(
      report.findings.some(
        (f) =>
          f.kind === "recorrido_no_terminal" && f.step.scenarioId === "credit-sale",
      ),
    ).toBe(false);
  });

  it("un callejón sin salida inyectado a propósito se detecta y bloquea la entrega", () => {
    const input = deadEndInput();
    const spec = generateUiSpec(input);
    const report = runQaPass(input, spec);

    const dead = report.findings.filter((f) => f.kind === "dead_end");
    expect(dead.length).toBeGreaterThanOrEqual(1);
    expect(dead.some((f) => f.severity === "critical")).toBe(true);
    expect(dead.some((f) => f.step.stateId === "activo")).toBe(true);
    expect(report.deliveryBlocked).toBe(true);
  });

  it("el pase termina en menos de 5 minutos para una especificación mediana", () => {
    const input = buildConcesionariaGeneratorInput();
    const spec = generateUiSpec(input);
    const report: QaReport = runQaPass(input, spec);
    expect(report.durationMs).toBeLessThan(QA_MAX_DURATION_MS);
    expect(report.durationMs).toBeLessThan(60_000); // mediana esperada << 5 min
  });
});
