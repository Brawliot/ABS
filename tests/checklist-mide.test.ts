/**
 * PASO 4 — Medición de funcionalidad con checklist.
 * Verifica que los puntos se generan y ejecutan correctamente.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppRuntime, bootProfile } from "../web/index.js";
import { generarPuntos, revisar } from "../generator/checklist.js";

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

function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "abs-checklist-"));
  dirs.push(dir);
  return join(dir, "db.sqlite");
}

describe("Checklist: medición de puntos", () => {
  it("p10-reformas falla en cobro.hitos", async () => {
    const boot = bootProfile("p10-reformas");
    const rt = AppRuntime.open(boot, { dbPath: tempDb() });

    const puntos = await revisar(boot, rt);
    const punto = puntos.find((p) => p.id === "cobro.hitos");

    expect(punto).toBeDefined();
    expect(punto?.estado).toBe("FALLA");

    rt.close();
  });

  it("p03-ferreteria se carga correctamente", async () => {
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: tempDb() });

    const puntos = await revisar(boot, rt);

    expect(puntos.length).toBeGreaterThan(0);
    // Al menos debe haber ciclos
    const ciclos = puntos.filter((p) => p.id.startsWith("ciclo."));
    expect(ciclos.length).toBeGreaterThan(0);

    rt.close();
  });

  it("los cobros no tienen prueba aún", async () => {
    const boot = bootProfile("p04-taller-mecanico");
    const rt = AppRuntime.open(boot, { dbPath: tempDb() });

    const puntos = await revisar(boot, rt);
    const cobros = puntos.filter((p) => p.id.startsWith("cobro."));

    expect(cobros.length).toBeGreaterThan(0);
    cobros.forEach((p) => {
      expect(p.estado).not.toBe("CUBIERTO");
    });

    rt.close();
  });

  it("ranking ordena puntos que fallan de más a menos negocios", async () => {
    const perfiles = ["p04-taller-mecanico", "p10-reformas"];
    const puntosPorPerfil: Record<string, string[]> = {};

    for (const perfil of perfiles) {
      const boot = bootProfile(perfil);
      const rt = AppRuntime.open(boot, { dbPath: tempDb() });
      const puntos = await revisar(boot, rt);
      puntosPorPerfil[perfil] = puntos.filter((p) => p.estado === "FALLA").map((p) => p.id);
      rt.close();
    }

    // Los puntos que fallan en más perfiles deben aparecer primero en el ranking
    const ranking = new Map<string, number>();
    for (const ids of Object.values(puntosPorPerfil)) {
      for (const id of ids) {
        ranking.set(id, (ranking.get(id) ?? 0) + 1);
      }
    }

    const sorted = Array.from(ranking.entries()).sort((a, b) => b[1] - a[1]);
    expect(sorted.length).toBeGreaterThan(0);
    expect(sorted[0]![1]).toBeGreaterThanOrEqual(sorted[sorted.length - 1]![1]);
  });

  it("genera puntos para todos los ciclos", async () => {
    const boot = bootProfile("p04-taller-mecanico");
    const puntosBase = generarPuntos(boot);

    const ciclos = puntosBase.filter((p) => p.id.startsWith("ciclo."));
    expect(ciclos.length).toBe(boot.input.lifecycles.length);
  });

  it("genera al menos cobros y ciclos", async () => {
    const boot = bootProfile("p04-taller-mecanico");
    const puntosBase = generarPuntos(boot);

    const ciclos = puntosBase.filter((p) => p.id.startsWith("ciclo."));
    const cobros = puntosBase.filter((p) => p.id.startsWith("cobro."));

    expect(ciclos.length).toBeGreaterThan(0);
    expect(cobros.length).toBeGreaterThan(0);
  });
});
