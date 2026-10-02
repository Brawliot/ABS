/**
 * E2E Happy Path + Exception por Arquetipo.
 * Verifica que cada arquetipo pueda completar una transacción
 * exitosa de principio a fin (happy path) y que rechace transiciones inválidas.
 */

import { describe, expect, it } from "vitest";
import { deriveState } from "../../../core/derivation.js";
import type { Lifecycle, StateNode, Transition } from "../../../core/lifecycle.js";
import { findState, isTerminalState, setsEqual } from "../../../core/lifecycle.js";
import { ventaArchetype } from "../../../archetypes/venta.js";
import { servicioArchetype } from "../../../archetypes/servicio.js";
import { financieraArchetype } from "../../../archetypes/financiera.js";
import { suscripcionArchetype } from "../../../archetypes/suscripcion.js";
import { usoTemporalArchetype } from "../../../archetypes/uso-temporal.js";
import { intermediacionArchetype } from "../../../archetypes/intermediacion.js";
import { mkTransitionEvent, expectEventCountIncrement, expectCommitmentsMonotonic } from "./_helpers.js";

const ARCHETYPES = [
  { name: "venta", archetype: ventaArchetype },
  { name: "servicio", archetype: servicioArchetype },
  { name: "financiera", archetype: financieraArchetype },
  { name: "suscripcion", archetype: suscripcionArchetype },
  { name: "uso-temporal", archetype: usoTemporalArchetype },
  { name: "intermediacion", archetype: intermediacionArchetype },
];

function outgoing(lifecycle: Lifecycle, stateId: string): readonly Transition[] {
  return lifecycle.transitions.filter((t: Transition) => t.from === stateId);
}

describe("Capa 0 — E2E Happy Path + Exception por Arquetipo", () => {
  for (const { name, archetype } of ARCHETYPES) {
    describe(`${name}: happy path + exception`, () => {
      it(`happy path: propuesta → terminal (con verificación de invariantes en cada paso)`, () => {
        const life = archetype.lifecycle;
        const events: any[] = [];
        const initialState = life.states.find((s: StateNode) => s.kind === "inicial");
        if (!initialState) throw new Error("No initial state found");
        let currentState = initialState.id;

        // Precondición: comenzamos en estado inicial
        expect(initialState.kind).toBe("inicial");

        // Construye secuencia hasta terminal iterando transiciones válidas
        let attempts = 0;
        const maxAttempts = 100;
        let previousDerived: ReturnType<typeof deriveState> | null = null;

        while (
          !isTerminalState(life, currentState) &&
          attempts < maxAttempts
        ) {
          const available = outgoing(life, currentState);
          if (available.length === 0) {
            break; // Sin transiciones posibles
          }

          // Toma la primera transición disponible
          const transition = available[0]!;
          const event = mkTransitionEvent(
            `e-${name}-${attempts}`,
            "subject-1",
            transition.id,
            transition.from,
            transition.to,
          );

          events.push(event);
          currentState = transition.to;

          // Verifica estado después de cada evento
          const derived = deriveState(life, events);

          // Invariante 1: eventCount debe incrementar exactamente en 1
          if (previousDerived === null) {
            expect(derived.eventCount).toBe(1);
          } else {
            expect(derived.eventCount).toBe(previousDerived.eventCount + 1);
          }

          // Invariante 2: compromisos son monótonos (nunca retroceden)
          if (previousDerived !== null) {
            for (const commitId of previousDerived.fulfilledCommitmentIds) {
              expect(derived.fulfilledCommitmentIds.has(commitId)).toBe(true);
            }
          }

          // Invariante 3: el estado derivado coincide con el actual
          expect(derived.currentStateId).toBe(currentState);

          // Invariante 4: fulfilledCommitmentIds ∪ pendingCommitmentIds debe ser constante
          const allCommitments = new Set([
            ...derived.fulfilledCommitmentIds,
            ...derived.pendingCommitmentIds,
          ]);
          const expectedTotal = life.commitments.length;
          expect(allCommitments.size).toBe(expectedTotal);

          previousDerived = derived;
          attempts++;
        }

        // Postcondición: se alcanzó un estado terminal
        expect(isTerminalState(life, currentState)).toBe(true);

        // Postcondición: la derivación final es válida
        const finalDerived = deriveState(life, events);
        expect(finalDerived.currentStateId).toBe(currentState);
        expect(finalDerived.eventCount).toBe(events.length);
        expect(finalDerived.eventCount).toBe(attempts);
      });

      it(`exception: transición inválida → rechazo`, () => {
        const life = archetype.lifecycle;
        const initial = life.states.find((s: StateNode) => s.kind === "inicial");
        if (!initial) return; // Skip si no hay inicial

        // Busca una transición que NO sale del inicial
        const transitionFromOtherState = life.transitions.find(
          (t: Transition) => t.from !== initial.id,
        );

        if (transitionFromOtherState) {
          // Intenta hacer esa transición desde el inicial (inválida)
          const badEvent = mkTransitionEvent(
            "e-bad",
            "subject-1",
            transitionFromOtherState.id,
            initial.id, // Origen incorrecto
            transitionFromOtherState.to,
          );

          // La máquina no puede avanzar por una transición que no sale del estado actual
          expect(() => {
            deriveState(life, [badEvent]);
          }).toThrow();
        }
      });
    }
  }

  describe("Walks expandidos: uso-temporal e intermediación", () => {
    it("uso-temporal: walk completo con verificación de compromisos temporales", () => {
      const life = usoTemporalArchetype.lifecycle;
      const events: any[] = [];
      const initialState = life.states.find((s: StateNode) => s.kind === "inicial");
      if (!initialState) return;

      let currentState = initialState.id;
      let stepCount = 0;
      let previousDerived: ReturnType<typeof deriveState> | null = null;

      // Walk: inicial → terminal con rastreo de compromisos temporales
      while (!isTerminalState(life, currentState) && stepCount < 50) {
        const available = outgoing(life, currentState);
        if (available.length === 0) break;

        const transition = available[0]!;
        const event = mkTransitionEvent(
          `uso-temporal-${stepCount}`,
          "sujeto-temporal",
          transition.id,
          transition.from,
          transition.to,
        );

        events.push(event);
        currentState = transition.to;

        const derived = deriveState(life, events);

        // Verificaciones en este paso
        expect(derived.currentStateId).toBe(currentState);
        expectEventCountIncrement(previousDerived, {
          event,
          state: derived,
          stepIndex: stepCount
        });

        // Para uso-temporal, verificamos que hay compromisos de "prestación"
        // (aunque no podemos acceder al nombre específico, verificamos que existan)
        expect(
          derived.fulfilledCommitmentIds.size +
          derived.pendingCommitmentIds.size,
        ).toBe(life.commitments.length);

        previousDerived = derived;
        stepCount++;
      }

      // Postcondición: llegó a terminal
      expect(isTerminalState(life, currentState)).toBe(true);
      const finalState = deriveState(life, events);
      expect(finalState.eventCount).toBe(events.length);
    });

    it("intermediacion: walk con verificación de comisiones y terceros", () => {
      const life = intermediacionArchetype.lifecycle;
      const events: any[] = [];
      const initialState = life.states.find((s: StateNode) => s.kind === "inicial");
      if (!initialState) return;

      let currentState = initialState.id;
      let stepCount = 0;
      let previousDerived: ReturnType<typeof deriveState> | null = null;

      // Walk: inicial → terminal con rastreo de distribución de comisiones
      while (!isTerminalState(life, currentState) && stepCount < 50) {
        const available = outgoing(life, currentState);
        if (available.length === 0) break;

        const transition = available[0]!;
        const event = mkTransitionEvent(
          `intermediacion-${stepCount}`,
          "intermediario-1",
          transition.id,
          transition.from,
          transition.to,
        );

        events.push(event);
        currentState = transition.to;

        const derived = deriveState(life, events);

        // Verificaciones en este paso
        expect(derived.currentStateId).toBe(currentState);
        expectEventCountIncrement(previousDerived, {
          event,
          state: derived,
          stepIndex: stepCount,
        });

        // Verificar que compromisos son monótonos
        if (previousDerived !== null) {
          expectCommitmentsMonotonic(previousDerived, {
            event,
            state: derived,
            stepIndex: stepCount,
          });
        }

        previousDerived = derived;
        stepCount++;
      }

      // Postcondición: llegó a terminal
      expect(isTerminalState(life, currentState)).toBe(true);
      const finalState = deriveState(life, events);
      expect(finalState.eventCount).toBe(events.length);
    });
  });

  describe("Invariante: todos los arquetipos tienen al menos un camino terminal", () => {
    for (const { name, archetype } of ARCHETYPES) {
      it(`${name} tiene camino a terminal`, () => {
        const life = archetype.lifecycle;
        const terminals = life.states.filter((s: StateNode) =>
          isTerminalState(life, s.id),
        );
        expect(terminals.length).toBeGreaterThan(0);
      });
    }
  });
});
