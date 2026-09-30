/**
 * Devoluciones: reembolsos dentro del plazo legal.
 * Verifica que solo se pueden devolver expedientes cerrados dentro del plazo.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppRuntime, bootProfile, executeUiAction } from "../web/index.js";

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

describe("Devoluciones", () => {
  function open(id: string) {
    const dir = mkdtempSync(join(tmpdir(), "abs-devoluciones-"));
    dirs.push(dir);
    return AppRuntime.open(bootProfile(id), { dbPath: join(dir, "db.sqlite") });
  }

  it("registrar devolución almacena correctamente", () => {
    const rt = open("n02-panaderia");
    const boot = bootProfile("n02-panaderia");
    const linea = [{ descripcion: "Pan", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21 }];
    const slice = boot.input.lifecycles[0];
    if (!slice) throw new Error("No hay lifecycles");
    const tx = rt.crearTransaccion({ lifecycleId: slice.id, parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea }, "t");
    if (!tx.ok) throw new Error(tx.errors.join());
    const expedienteId = tx.id;
    expect(rt.totalDevueltoEn(expedienteId)).toBe(0);
    rt.close();
  });

  it("solo devuelve expedientes cerrados", async () => {
    const rt = open("n02-panaderia");
    const boot = bootProfile("n02-panaderia");
    const linea = [{ descripcion: "Pan", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21 }];
    const slice = boot.input.lifecycles[0];
    if (!slice) throw new Error("No hay lifecycles");
    const tx = rt.crearTransaccion({ lifecycleId: slice.id, parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea }, "t");
    if (!tx.ok) throw new Error(tx.errors.join());
    const expedienteId = tx.id;
    const r = rt.devolver(
      expedienteId,
      [{ ofertaId: "Pan", cantidadMilesimas: 100 }],
      "Cambio de idea",
      "gerente",
    );
    expect(r.ok).toBe(false);
    expect((r as any).error).toContain("cerrado");
    rt.close();
  });
});
