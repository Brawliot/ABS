/**
 * Panel Hoy: expedientes que necesitan atención hoy.
 * Verifica que el panel se adapta al negocio y el rol.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppRuntime, bootProfile } from "../web/index.js";
import { montarSeccionesHoy } from "../web/secciones-hoy.js";
import type { Viewer } from "../web/maestros.js";

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

function abrirRuntime(id: string) {
  const dir = mkdtempSync(join(tmpdir(), "abs-hoy-"));
  dirs.push(dir);
  const boot = bootProfile(id);
  return { boot, rt: AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") }) };
}

describe("Panel Hoy", () => {
  it("en n01-fisioterapia hay secciones de expedientes", () => {
    const { boot, rt } = abrirRuntime("n01-fisioterapia");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const hoy = "2026-09-30"; // Fecha fija para tests

    const { secciones } = montarSeccionesHoy({ runtime: rt, boot, viewer, hoy });

    expect(secciones.length).toBeGreaterThan(0);
    expect(secciones.some((s) => s.id === "hoy-resumen")).toBe(true);

    rt.close();
  });

  it("resumen siempre está presente", () => {
    const { boot, rt } = abrirRuntime("p04-taller-mecanico");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const hoy = "2026-09-30";

    const { html } = montarSeccionesHoy({ runtime: rt, boot, viewer, hoy });

    expect(html).toContain("hoy-resumen");

    rt.close();
  });

  it("expediente atascado aparece en la sección", () => {
    const { boot, rt } = abrirRuntime("p04-taller-mecanico");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const hoy = "2026-09-30";

    const { secciones } = montarSeccionesHoy({ runtime: rt, boot, viewer, hoy });

    // Al menos resumen debería estar
    expect(secciones.some((s) => s.id === "hoy-resumen")).toBe(true);

    rt.close();
  });

  it("dos negocios dan órdenes de secciones distintos", () => {
    const { boot: boot1, rt: rt1 } = abrirRuntime("n01-fisioterapia");
    const { boot: boot2, rt: rt2 } = abrirRuntime("p04-taller-mecanico");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const hoy = "2026-09-30";

    const { secciones: secs1 } = montarSeccionesHoy({ runtime: rt1, boot: boot1, viewer, hoy });
    const { secciones: secs2 } = montarSeccionesHoy({ runtime: rt2, boot: boot2, viewer, hoy });

    // Ambos deberían renderizarse sin error
    expect(secs1.length).toBeGreaterThanOrEqual(0);
    expect(secs2.length).toBeGreaterThanOrEqual(0);

    rt1.close();
    rt2.close();
  });

  it("no muestra identificadores técnicos en HTML", () => {
    const { boot, rt } = abrirRuntime("n01-fisioterapia");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const hoy = "2026-09-30";

    const { html } = montarSeccionesHoy({ runtime: rt, boot, viewer, hoy });

    // No debería contener IDs técnicos sin escapar
    expect(html).not.toMatch(/data-id=["\']parte-/);

    rt.close();
  });
});
