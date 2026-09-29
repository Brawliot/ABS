import { describe, expect, it } from "vitest";
import { validateLifecycle } from "../core/validator.js";
import type { CommitmentRef, Lifecycle, StateNode, Transition } from "../core/lifecycle.js";
import { minimalExampleLifecycle } from "../archetypes/minimal-example.js";

type MutableLifecycle = {
  states: StateNode[];
  transitions: Transition[];
  commitments: CommitmentRef[];
};

function cloneLifecycle(
  base: Lifecycle = minimalExampleLifecycle,
): MutableLifecycle {
  return structuredClone(base) as MutableLifecycle;
}

describe("Validador de ciclo de vida", () => {
  it("acepta la máquina de ejemplo mínima", () => {
    const result = validateLifecycle(minimalExampleLifecycle);
    expect(result).toEqual({ ok: true });
  });

  it("falla sin exactamente un estado inicial", () => {
    const life = cloneLifecycle();
    life.states[0] = { ...life.states[0]!, kind: "intermedio" };
    const result = validateLifecycle(life);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "EXACTLY_ONE_INITIAL")).toBe(
        true,
      );
    }
  });

  it("falla si un estado no es alcanzable", () => {
    const life = cloneLifecycle();
    life.states.push({
      id: "isla",
      kind: "intermedio",
      label: "Isla",
      situations: [
        {
          fulfilled: ["c_cierre"],
          pending: ["c_aceptacion", "c_rechazo"],
        },
      ],
    });
    life.transitions.push({
      id: "t_isla",
      from: "isla",
      to: "cerrado",
      condition: "x",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: [],
    });
    const result = validateLifecycle(life);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "UNREACHABLE_STATE")).toBe(
        true,
      );
    }
  });

  it("falla con dos estados iniciales", () => {
    const life = cloneLifecycle();
    life.states.push({
      id: "otro_inicial",
      kind: "inicial",
      label: "Otro",
      situations: [
        {
          fulfilled: ["c_rechazo"],
          pending: ["c_aceptacion", "c_cierre"],
        },
      ],
    });
    life.transitions.push({
      id: "t_extra",
      from: "otro_inicial",
      to: "activo",
      condition: "x",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: [],
    });
    const result = validateLifecycle(life);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "EXACTLY_ONE_INITIAL")).toBe(
        true,
      );
    }
  });

  it("falla sin terminal de éxito", () => {
    const life = cloneLifecycle();
    life.states = life.states.map((s) =>
      s.kind === "terminal_exito"
        ? { ...s, kind: "terminal_excepcion" as const }
        : s,
    );
    const result = validateLifecycle(life);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) => i.code === "AT_LEAST_ONE_SUCCESS_TERMINAL"),
      ).toBe(true);
    }
  });

  it("falla si un no-terminal no tiene salida", () => {
    const life = cloneLifecycle();
    life.transitions = life.transitions.filter((t) => t.from !== "activo");
    const result = validateLifecycle(life);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) => i.code === "NON_TERMINAL_WITHOUT_EXIT"),
      ).toBe(true);
    }
  });

  it("falla si un terminal tiene salidas", () => {
    const life = cloneLifecycle();
    life.transitions.push({
      id: "t_reabrir",
      from: "cerrado",
      to: "activo",
      condition: "reapertura",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: [],
    });
    const result = validateLifecycle(life);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "TERMINAL_WITH_EXIT")).toBe(
        true,
      );
    }
  });

  it("falla si una transición no exige evidencia válida", () => {
    const life = cloneLifecycle();
    const broken = {
      ...life.transitions[0]!,
      requiredEvidence: undefined,
    } as unknown as Transition;
    life.transitions[0] = broken;
    const result = validateLifecycle(life);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) => i.code === "TRANSITION_WITHOUT_EVIDENCE"),
      ).toBe(true);
    }
  });
});
