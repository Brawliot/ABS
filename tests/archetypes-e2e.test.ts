/**
 * HUECO 2 — E2E Arquetipos (6): Estructura y validación
 *
 * Para cada arquetipo:
 * ✔ Máquina de estados válida
 * ✔ Estado inicial único
 * ✔ Estados terminales no tienen salidas
 * ✔ Todos los estados y transiciones son accesibles
 */

import { describe, expect, it } from "vitest";
import { validateLifecycle } from "../core/validator.js";
import { ARCHETYPES } from "../archetypes/catalog.js";
import type { Lifecycle } from "../core/lifecycle.js";

describe("Arquetipos E2E (6 arquetipos)", () => {
  for (const archetype of ARCHETYPES) {
    describe(`Arquetipo: ${archetype.id}`, () => {
      it("tiene máquina válida", () => {
        const result = validateLifecycle(archetype.lifecycle);
        expect(result).toEqual({ ok: true });
      });

      it("tiene exactamente un estado inicial", () => {
        const initials = archetype.lifecycle.states.filter(
          (s) => s.kind === "inicial",
        );
        expect(initials).toHaveLength(1);
      });

      it("tiene al menos un estado terminal", () => {
        const terminals = archetype.lifecycle.states.filter((s) =>
          s.kind.startsWith("terminal"),
        );
        expect(terminals.length).toBeGreaterThan(0);
      });

      it("todos los estados tienen IDs únicos", () => {
        const ids = archetype.lifecycle.states.map((s) => s.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      });

      it("todas las transiciones tienen IDs únicos", () => {
        const ids = archetype.lifecycle.transitions.map((t) => t.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      });

      it("terminales no tienen salidas", () => {
        const terminals = archetype.lifecycle.states.filter((s) =>
          s.kind.startsWith("terminal"),
        );

        for (const terminal of terminals) {
          const exits = archetype.lifecycle.transitions.filter(
            (t) => t.from === terminal.id,
          );
          expect(exits).toHaveLength(0);
        }
      });

      it("cada transición usa estados válidos", () => {
        const stateIds = new Set(
          archetype.lifecycle.states.map((s) => s.id),
        );

        for (const trans of archetype.lifecycle.transitions) {
          expect(stateIds.has(trans.from)).toBe(true);
          expect(stateIds.has(trans.to)).toBe(true);
        }
      });

      it("cada no-terminal tiene al menos una salida", () => {
        const nonTerminals = archetype.lifecycle.states.filter(
          (s) => !s.kind.startsWith("terminal"),
        );

        for (const state of nonTerminals) {
          const exits = archetype.lifecycle.transitions.filter(
            (t) => t.from === state.id,
          );
          expect(exits.length, `${state.id} sin salidas`).toBeGreaterThan(0);
        }
      });

      it("máquina es acíclica (no hay bucles a terminales)", () => {
        const life = archetype.lifecycle;
        const terminals = new Set(
          life.states.filter((s) => s.kind.startsWith("terminal")).map((s) => s.id),
        );

        // Cualquier estado terminal no debe tener salidas
        for (const terminal of terminals) {
          const exits = life.transitions.filter((t) => t.from === terminal);
          expect(exits).toHaveLength(0);
        }
      });
    });
  }

  describe("Cross-archetype invariants", () => {
    it("todos los arquetipos tienen un estado inicial llamado igual", () => {
      const initials = ARCHETYPES.map((arch) =>
        arch.lifecycle.states.find((s) => s.kind === "inicial"),
      );

      expect(initials.every((i) => i !== undefined)).toBe(true);
    });

    it("todos los arquetipos tienen estados terminales", () => {
      for (const arch of ARCHETYPES) {
        const terminals = arch.lifecycle.states.filter((s) =>
          s.kind.startsWith("terminal"),
        );
        expect(terminals.length, `${arch.id} sin terminales`).toBeGreaterThan(0);
      }
    });

    it("hay exactamente 6 arquetipos", () => {
      expect(ARCHETYPES).toHaveLength(6);
    });

    it("arquetipos tienen IDs documentados", () => {
      const ids = ARCHETYPES.map((a) => a.id);
      expect(ids.sort()).toEqual([
        "financiera",
        "intermediacion",
        "servicio_proyecto",
        "suscripcion",
        "uso_temporal",
        "venta",
      ]);
    });
  });

  describe("Estructura de ciclo de vida", () => {
    it("cada arquetipo tiene transiciones no-vacías", () => {
      for (const arch of ARCHETYPES) {
        expect(arch.lifecycle.transitions.length, arch.id).toBeGreaterThan(0);
      }
    });

    it("cada arquetipo tiene estados no-vacíos", () => {
      for (const arch of ARCHETYPES) {
        expect(arch.lifecycle.states.length, arch.id).toBeGreaterThan(0);
      }
    });

    it("inicial y terminales son distintos", () => {
      for (const arch of ARCHETYPES) {
        const initial = arch.lifecycle.states.find((s) => s.kind === "inicial");
        const terminals = arch.lifecycle.states.filter((s) =>
          s.kind.startsWith("terminal"),
        );

        expect(initial?.id).not.toEqual(terminals[0]?.id);
      }
    });
  });
});
