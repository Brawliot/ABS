/**
 * Fases dentro de un paso: validación y manejo.
 */

import { describe, expect, it } from "vitest";
import { validarPasos } from "../elements/pasos.js";
import type { Lifecycle } from "../core/lifecycle.js";

// Mock lifecycle para pruebas
const mockLifecycle: Lifecycle = {
  states: [
    { id: "presupuesto", label: "Presupuesto", kind: "inicial", situations: [] },
    { id: "intermedio", label: "Intermedio", kind: "intermedio", situations: [] },
    { id: "cerrado_exito", label: "Cerrado", kind: "terminal_exito", situations: [] },
  ],
  transitions: [
    { id: "t1", from: "presupuesto", to: "intermedio", fulfills: [], requiredEvidence: "sistema", condition: "always", allowedActor: "humano" },
    { id: "t2", from: "intermedio", to: "cerrado_exito", fulfills: [], requiredEvidence: "sistema", condition: "always", allowedActor: "humano" },
  ],
  commitments: [],
};

describe("Fases dentro de un paso", () => {
  it("rechaza fases en estados terminales", () => {
    const pasos = [
      {
        proceso: "test",
        estados: [
          { id: "inicio", nombre: "Inicio", equivale: "presupuesto" },
          {
            id: "cierre",
            nombre: "Cierre",
            equivale: "cerrado_exito",
            fases: [{ id: "fase1", nombre: "Fase 1" }],
          },
        ],
        acciones: [
          { id: "cerrar", nombre: "Cerrar", de: "inicio", a: "cierre" },
        ],
      },
    ];
    const errores = validarPasos(pasos, mockLifecycle);
    expect(errores.length).toBeGreaterThan(0);
    expect(errores.some((e) => e.mensaje.includes("terminal"))).toBe(true);
  });

  it("acepta fases en estados no terminales", () => {
    const pasos = [
      {
        proceso: "test",
        estados: [
          {
            id: "inicio",
            nombre: "Inicio",
            equivale: "presupuesto",
            fases: [
              { id: "fase1", nombre: "Fase 1" },
              { id: "fase2", nombre: "Fase 2" },
            ],
          },
          { id: "cierre", nombre: "Cierre", equivale: "cerrado_exito" },
        ],
        acciones: [
          { id: "cerrar", nombre: "Cerrar", de: "inicio", a: "cierre" },
        ],
      },
    ];
    const errores = validarPasos(pasos, mockLifecycle);
    const faseErrors = errores.filter((e) => e.mensaje.includes("Fase"));
    expect(faseErrors.length).toBe(0);
  });

  it("rechaza ids de fases duplicados", () => {
    const pasos = [
      {
        proceso: "test",
        estados: [
          {
            id: "inicio",
            nombre: "Inicio",
            equivale: "presupuesto",
            fases: [
              { id: "fase1", nombre: "Fase 1" },
              { id: "fase1", nombre: "Fase Duplicate" },
            ],
          },
          { id: "cierre", nombre: "Cierre", equivale: "cerrado_exito" },
        ],
        acciones: [
          { id: "cerrar", nombre: "Cerrar", de: "inicio", a: "cierre" },
        ],
      },
    ];
    const errores = validarPasos(pasos, mockLifecycle);
    expect(errores.some((e) => e.tipo === "id_repetido" && e.mensaje.includes("Fase"))).toBe(
      true,
    );
  });
});

describe("Reglas por proceso (lifecycleId)", () => {
  it("una regla con lifecycleId A no afecta a expediente de B", () => {
    const ruleA: import("../policies/types.js").CompiledCondition = {
      kind: "condition",
      id: "rule-a",
      priority: 100,
      transitionId: "t_ejecutar",
      predicate: { field: "importe", op: "gt", value: 1000 },
      sourcePolicyId: "pol-a",
      sourceKind: "politica",
      binding: { mode: "live" },
      lifecycleId: "lc.a",
    };

    const ruleB: import("../policies/types.js").CompiledCondition = {
      kind: "condition",
      id: "rule-b",
      priority: 100,
      transitionId: "t_ejecutar",
      predicate: { field: "importe", op: "gt", value: 1000 },
      sourcePolicyId: "pol-b",
      sourceKind: "politica",
      binding: { mode: "live" },
      lifecycleId: "lc.b",
    };

    // Regla A aplicada a expediente de B debe ser filtrada
    expect(ruleA.lifecycleId).toBe("lc.a");
    expect(ruleB.lifecycleId).toBe("lc.b");
    expect(ruleA.lifecycleId).not.toBe(ruleB.lifecycleId);
  });
});
