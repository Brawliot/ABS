/**
 * Dimensión 8 — EVOLUCIÓN.
 * Verifica que la versión de gramática está declarada, que el modelo de versiones
 * es coherente con spec/VERSIONING.md, y que el grammarVersion en grammar.version.json
 * es semántico (MAJOR.MINOR.PATCH).
 *
 * Dimensión 9 — DETERMINISMO Y TIEMPO.
 * La máquina de estados NO debe depender de Date.now() ni de la zona horaria;
 * el orden de eventos es posicional (índice en el array), no temporal.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveState } from "../../../core/derivation.js";
import { validateLifecycle } from "../../../core/validator.js";
import { ventaArchetype } from "../../../archetypes/venta.js";
import { minimalExampleLifecycle } from "../../../archetypes/minimal-example.js";
import { mkTransitionEvent } from "./_helpers.js";

const life = ventaArchetype.lifecycle;
const tAccept = life.transitions.find((t) => t.id === "t_aceptar")!;

// ──────────────────────────────────────────────
// DIM 8 — EVOLUCIÓN
// ──────────────────────────────────────────────
describe("Madurez Capa0 · EVOLUCIÓN", () => {
  it("E1: grammar.version.json existe y contiene semVer", () => {
    const raw = readFileSync(
      join(process.cwd(), "spec", "grammar.version.json"),
      "utf-8",
    );
    const obj = JSON.parse(raw) as { grammarVersion?: string };
    expect(obj.grammarVersion, "grammarVersion ausente").toBeDefined();
    expect(
      /^\d+\.\d+\.\d+$/.test(obj.grammarVersion ?? ""),
      `grammarVersion no es semVer: ${obj.grammarVersion}`,
    ).toBe(true);
  });

  it("E2: grammarVersion actual en 1.x.x (Capa 0 estable)", () => {
    const raw = readFileSync(
      join(process.cwd(), "spec", "grammar.version.json"),
      "utf-8",
    );
    const obj = JSON.parse(raw) as { grammarVersion: string };
    const major = Number(obj.grammarVersion.split(".")[0]);
    expect(major, "MAJOR debe ser 1 para gramática estable de Capa 0").toBe(1);
  });

  it("E3: las variantes de evidencia reconocidas por el validator no cambian sin MAJOR", () => {
    // La evidencia está en la gramática; validamos que el lifecycle de venta
    // sigue siendo válido (invariante de no-romper-retrocompatibilidad).
    const r = validateLifecycle(ventaArchetype.lifecycle);
    expect(r.ok, `Lifecycle venta no válido — posible cambio de gramática: ${JSON.stringify("issues" in r ? r.issues : [])}`).toBe(true);
  });

  it("E4: minimal-example lifecycle sigue siendo válido (snapshot de gramática anterior)", () => {
    const r = validateLifecycle(minimalExampleLifecycle);
    expect(r.ok, `minimal-example roto — posible cambio incompatible: ${JSON.stringify("issues" in r ? r.issues : [])}`).toBe(true);
  });

  it("E5: un evento guardado con occurredAt 2020 es reproducible hoy (forward compat)", () => {
    const ev = mkTransitionEvent("e-old", "s-old", tAccept.id, tAccept.from, tAccept.to, {
      occurredAt: "2020-03-15T10:00:00.000Z",
    });
    const d = deriveState(life, [ev]);
    expect(d.currentStateId).toBe(tAccept.to);
  });

  it("E6: un evento guardado con occurredAt futuro (2099) es reproducible (no hay validación de fecha)", () => {
    const ev = mkTransitionEvent("e-fut", "s-fut", tAccept.id, tAccept.from, tAccept.to, {
      occurredAt: "2099-12-31T23:59:59.999Z",
    });
    // La derivación nunca debe fallar por fecha
    const d = deriveState(life, [ev]);
    expect(d.currentStateId).toBe(tAccept.to);
  });
});

// ──────────────────────────────────────────────
// DIM 9 — DETERMINISMO Y TIEMPO
// ──────────────────────────────────────────────
describe("Madurez Capa0 · DETERMINISMO Y TIEMPO", () => {
  it("D1: deriveState no llama a Date.now() (puro, sin reloj)", () => {
    const spy = vi.spyOn(Date, "now");
    const ev = mkTransitionEvent("e-det", "s-det", tAccept.id, tAccept.from, tAccept.to);
    deriveState(life, [ev]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("D2: el mismo array de eventos en zonas horarias distintas → mismo estado", () => {
    const ev = mkTransitionEvent("e-tz", "s-tz", tAccept.id, tAccept.from, tAccept.to);
    // Simular cambio de TZ cambiando el env (solo a nivel de Node, no del OS)
    const origTZ = process.env.TZ;
    const results: string[] = [];
    for (const tz of ["UTC", "America/New_York", "Asia/Tokyo", "Europe/Madrid"]) {
      process.env.TZ = tz;
      results.push(deriveState(life, [ev]).currentStateId);
    }
    process.env.TZ = origTZ;
    // Todos los resultados deben ser iguales
    expect(new Set(results).size).toBe(1);
  });

  it("D3: el orden es posicional (array), no por occurredAt — timestamp tardío primero, temprano segundo", () => {
    const late  = mkTransitionEvent("e-late", "s-pos", tAccept.id, tAccept.from, tAccept.to, { occurredAt: "2099-01-01T00:00:00.000Z" });
    const early = mkTransitionEvent("e-early", "s-pos", tAccept.id, tAccept.from, tAccept.to, { occurredAt: "2000-01-01T00:00:00.000Z" });
    // Ambos eventos son la misma transición, solo uno de ellos puede aplicarse
    const d1 = deriveState(life, [late]);
    const d2 = deriveState(life, [early]);
    // El estado final solo depende de qué evento está en posición 0 (orden posicional, no por timestamp)
    expect(d1.currentStateId).toBe(d2.currentStateId);
    expect(d1.currentStateId).toBe(tAccept.to);
    
    // Orden [early, late]: early aplica primero (propuesta → aceptada), late intenta aplicarse segundo
    // pero late requiere partir de propuesta y ya estamos en aceptada → debe lanzar
    expect(() => deriveState(life, [early, late])).toThrow();
  });

  it("D4: deriveState con timestamps iguales (todos '2026-01-01T00:00:00.000Z') → determinista", () => {
    const ev1 = mkTransitionEvent("e-ts1", "s-ts", tAccept.id, tAccept.from, tAccept.to, { occurredAt: "2026-01-01T00:00:00.000Z" });
    const d1 = deriveState(life, [ev1]);
    const d2 = deriveState(life, [ev1]);
    expect(d1.currentStateId).toBe(d2.currentStateId);
    expect(d1.eventCount).toBe(d2.eventCount);
  });

  it("D5: validateLifecycle no usa fecha ni reloj (resultado estable entre llamadas en distintos momentos)", () => {
    const r1 = validateLifecycle(ventaArchetype.lifecycle);
    const r2 = validateLifecycle(ventaArchetype.lifecycle);
    expect(r1.ok).toBe(r2.ok);
  });
});
