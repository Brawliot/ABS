/**
 * E2E Happy Path + Exception por Arquetipo.
 * Verifica que cada arquetipo pueda completar una transacción
 * exitosa de principio a fin (happy path) y que rechace transiciones inválidas.
 */

import { describe, expect, it } from "vitest";
import { deriveState } from "../../../core/derivation.js";
import type { Lifecycle, StateNode, Transition } from "../../../core/lifecycle.js";
import { findState, isTerminalState } from "../../../core/lifecycle.js";
import { ventaArchetype } from "../../../archetypes/venta.js";
import { servicioArchetype } from "../../../archetypes/servicio.js";
import { financieraArchetype } from "../../../archetypes/financiera.js";
import { suscripcionArchetype } from "../../../archetypes/suscripcion.js";
import { usoTemporalArchetype } from "../../../archetypes/uso-temporal.js";
import { intermediacionArchetype } from "../../../archetypes/intermediacion.js";
import { mkTransitionEvent } from "./_helpers.js";

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
      it(`happy path: propuesta → terminal`, () => {
        const life = archetype.lifecycle;
        const events: any[] = [];
        const initialState = life.states.find((s: StateNode) => s.kind === "inicial");
        if (!initialState) throw new Error("No initial state found");
        let currentState = initialState.id;

        // Construye secuencia hasta terminal iterando transiciones válidas
        let attempts = 0;
        const maxAttempts = 100;

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
          attempts++;
        }

        // Verifica que se alcanzó un estado terminal
        expect(isTerminalState(life, currentState)).toBe(true);

        // Verifica que la derivación es válida
        const derived = deriveState(life, events);
        expect(derived.currentStateId).toBe(currentState);
        expect(derived.eventCount).toBe(events.length);
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
    });
  }

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
