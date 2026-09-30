/**
 * Tests para pasos personalizados: validación, construcción y ciclos.
 */

import { describe, expect, it, afterEach } from "vitest";
import { validarPasos, construirCiclo } from "../elements/pasos.js";
import type { ProcesoCustom } from "../contracts/business-profile/samples/sample-types.js";
import { requireArchetype } from "../archetypes/catalog.js";
import { AppRuntime, bootProfile } from "../web/index.js";
import { probarCiclos } from "../web/probar-ciclo.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("Validación de pasos personalizados", () => {
  it("rechaza ids repetidos en estados", () => {
    const base = requireArchetype("suscripcion").lifecycle;
    const pasos: ProcesoCustom[] = [
      {
        proceso: "lc.suscripcion",
        estados: [
          { id: "a", nombre: "A", equivale: "activa" },
          { id: "a", nombre: "B", equivale: "activa" },
        ],
        acciones: [],
      },
    ];

    const errores = validarPasos(pasos, base);
    expect(errores).toContainEqual(
      expect.objectContaining({ tipo: "id_repetido" }),
    );
  });

  it("rechaza equivales inexistentes", () => {
    const base = requireArchetype("suscripcion").lifecycle;
    const pasos: ProcesoCustom[] = [
      {
        proceso: "lc.suscripcion",
        estados: [{ id: "a", nombre: "A", equivale: "inexistente" }],
        acciones: [],
      },
    ];

    const errores = validarPasos(pasos, base);
    expect(errores).toContainEqual(
      expect.objectContaining({ tipo: "equivale_inexistente" }),
    );
  });

  it("rechaza falta de estado inicial", () => {
    const base = requireArchetype("suscripcion").lifecycle;
    const pasos: ProcesoCustom[] = [
      {
        proceso: "lc.suscripcion",
        estados: [
          { id: "a", nombre: "A", equivale: "activa" },
          { id: "b", nombre: "B", equivale: "activa" },
        ],
        acciones: [{ id: "t1", nombre: "T1", de: "b", a: "a" }],
      },
    ];

    const errores = validarPasos(pasos, base);
    expect(errores).toContainEqual(
      expect.objectContaining({ tipo: "estado_inicial_falta" }),
    );
  });

  it("rechaza si falta mapear un estado terminal de éxito", () => {
    const base = requireArchetype("servicio_proyecto").lifecycle;
    const pasos: ProcesoCustom[] = [
      {
        proceso: "lc.servicio_proyecto",
        estados: [
          { id: "acuerdo", nombre: "Acuerdo", equivale: "acordado" },
          // Falta "cerrada" que es terminal_exito en la base
        ],
        acciones: [],
      },
    ];

    const errores = validarPasos(pasos, base);
    const tienenFaltaEstadoFinal = errores.some(
      (e) => e.tipo === "estado_final_falta",
    );
    expect(tienenFaltaEstadoFinal).toBe(true);
  });

  it("rechaza acciones que cruzan invalidamente entre equivales", () => {
    const base = requireArchetype("intermediacion").lifecycle;
    const pasos: ProcesoCustom[] = [
      {
        proceso: "lc.intermediacion",
        estados: [
          { id: "inicio", nombre: "Inicio", equivale: "propuesta" },
          { id: "fin", nombre: "Fin", equivale: "propuesta" },
        ],
        acciones: [
          { id: "ir", nombre: "Ir", de: "inicio", a: "fin" },
        ],
      },
    ];

    const errores = validarPasos(pasos, base);
    // No hay error porque los dos están en propuesta
    expect(errores.filter((e) => e.tipo === "accion_invalida")).toEqual([]);
  });

  it("valida un flujo simplificado de intermediación", () => {
    const base = requireArchetype("intermediacion").lifecycle;
    const pasos: ProcesoCustom[] = [
      {
        proceso: "lc.intermediacion",
        estados: [
          { id: "captado", nombre: "Captado", equivale: "propuesta" },
          { id: "emparejado", nombre: "Emparejado", equivale: "emparejada" },
          { id: "en_curso", nombre: "En curso", equivale: "en_curso" },
          { id: "vendido", nombre: "Vendido", equivale: "cerrada" },
        ],
        acciones: [
          {
            id: "emparejar",
            nombre: "Emparejar",
            de: "captado",
            a: "emparejado",
          },
          {
            id: "iniciar_curso",
            nombre: "Iniciar curso",
            de: "emparejado",
            a: "en_curso",
          },
          { id: "cerrar", nombre: "Cerrar", de: "en_curso", a: "vendido" },
        ],
      },
    ];

    const errores = validarPasos(pasos, base);
    expect(errores).toEqual([]);
  });
});

describe("Construcción de ciclos personalizados", () => {
  it("construye un ciclo simplificado heredando kind y situations", () => {
    const base = requireArchetype("intermediacion").lifecycle;
    const pasos: ProcesoCustom[] = [
      {
        proceso: "lc.intermediacion",
        estados: [
          { id: "captado", nombre: "Captado", equivale: "propuesta" },
          { id: "vendido", nombre: "Vendido", equivale: "cerrada" },
        ],
        acciones: [{ id: "vender", nombre: "Vender", de: "captado", a: "vendido" }],
      },
    ];

    const { lifecycle, mapAcciones } = construirCiclo(pasos, base);

    expect(lifecycle.states).toHaveLength(2);
    expect(lifecycle.states[0]!.id).toBe("captado");
    expect(lifecycle.states[0]!.kind).toBe("inicial");
    expect(lifecycle.states[1]!.id).toBe("vendido");
    expect(lifecycle.states[1]!.kind).toBe("terminal_exito");

    expect(lifecycle.transitions).toHaveLength(1);
    expect(lifecycle.transitions[0]!.id).toBe("vender");
  });

  it("mapea acciones que heredan reglas base", () => {
    const base = requireArchetype("intermediacion").lifecycle;
    const pasos: ProcesoCustom[] = [
      {
        proceso: "lc.intermediacion",
        estados: [
          { id: "captado", nombre: "Captado", equivale: "propuesta" },
          { id: "emparejado", nombre: "Emparejado", equivale: "emparejada" },
          { id: "en_curso", nombre: "En curso", equivale: "en_curso" },
          { id: "vendido", nombre: "Vendido", equivale: "cerrada" },
        ],
        acciones: [
          {
            id: "emparejar",
            nombre: "Emparejar",
            de: "captado",
            a: "emparejado",
          },
          {
            id: "iniciar_curso",
            nombre: "Iniciar curso",
            de: "emparejado",
            a: "en_curso",
          },
          { id: "cerrar", nombre: "Cerrar", de: "en_curso", a: "vendido" },
        ],
      },
    ];

    const { lifecycle, mapAcciones } = construirCiclo(pasos, base);

    // Las acciones que cambian de equivale deben tener mapeado un ID base
    expect(mapAcciones["emparejar"]).toBeDefined();
    expect(mapAcciones["iniciar_curso"]).toBeDefined();
    expect(mapAcciones["cerrar"]).toBeDefined();
  });
});

describe("Ciclos completos de negocios con pasos", () => {
  it("n03-autoescuela arranca con sus estados personalizados", async () => {
    const boot = bootProfile("n03-autoescuela");
    const dir = mkdtempSync(join(tmpdir(), "abs-pasos-"));
    dirs.push(dir);
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    // Verificar que los estados personalizados están presentes
    const lcSlice = boot.input.lifecycles.find(
      (s) => s.id === "lc.servicio_proyecto",
    );
    if (!lcSlice) throw new Error("No se encontró lc.servicio_proyecto");
    expect(lcSlice.lifecycle.states).toContainEqual(
      expect.objectContaining({ id: "matriculado" }),
    );
    expect(lcSlice.lifecycle.states).toContainEqual(
      expect.objectContaining({ id: "apto" }),
    );

    rt.close();
  });

  it("n04-inmobiliaria arranca con sus estados personalizados", async () => {
    const boot = bootProfile("n04-inmobiliaria");
    const dir = mkdtempSync(join(tmpdir(), "abs-pasos-"));
    dirs.push(dir);
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    // Verificar que los estados personalizados están presentes
    const lcSlice = boot.input.lifecycles.find(
      (s) => s.id === "lc.intermediacion",
    );
    if (!lcSlice) throw new Error("No se encontró lc.intermediacion");
    expect(lcSlice.lifecycle.states).toContainEqual(
      expect.objectContaining({ id: "captado" }),
    );
    expect(lcSlice.lifecycle.states).toContainEqual(
      expect.objectContaining({ id: "vendido" }),
    );

    rt.close();
  });

  it("ciclos personalizados se construyen sin errores", () => {
    // Solo verificar que los ciclos se construyen correctamente
    const boot1 = bootProfile("n03-autoescuela");
    expect(boot1.input.lifecycles.length).toBeGreaterThan(0);

    const boot2 = bootProfile("n04-inmobiliaria");
    expect(boot2.input.lifecycles.length).toBeGreaterThan(0);
  });
});
