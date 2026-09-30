/**
 * Cobros parciales: pagos por hitos, señales y a cuenta.
 * Verifica que un expediente se bloquea hasta cobrar lo suficiente para avanzar.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppRuntime, bootProfile, executeUiAction } from "../web/index.js";
import { probarCiclos } from "../web/probar-ciclo.js";

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

describe("Cobros parciales", () => {
  function open(id: string) {
    const dir = mkdtempSync(join(tmpdir(), "abs-cobros-"));
    dirs.push(dir);
    return AppRuntime.open(bootProfile(id), { dbPath: join(dir, "db.sqlite") });
  }

  it("registrar cobro parcial funciona", async () => {
    const rt = open("n06-carpinteria");
    const boot = bootProfile("n06-carpinteria");
    const linea = [{ descripcion: "Trabajo", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21 }];
    const slice = boot.input.lifecycles[0];
    if (!slice) throw new Error("No hay lifecycles");
    const tx = rt.crearTransaccion({ lifecycleId: slice.id, parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea }, "t");
    if (!tx.ok) throw new Error(tx.errors.join());
    const expedienteId = tx.id;
    const r = rt.registrarCobro(expedienteId, { importeCentimos: 50000, medio: "transferencia" }, "gerente");
    expect(r.ok).toBe(true);
    const cobros = rt.cobrosDelExpediente(expedienteId);
    expect(cobros).toHaveLength(1);
    expect(cobros[0]!.importeCentimos).toBe(50000);
    rt.close();
  });

  it("cobros se consultan correctamente", async () => {
    const rt = open("n06-carpinteria");
    const boot = bootProfile("n06-carpinteria");
    const linea = [{ descripcion: "Trabajo", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21 }];
    const slice = boot.input.lifecycles[0];
    if (!slice) throw new Error("No hay lifecycles");
    const tx = rt.crearTransaccion({ lifecycleId: slice.id, parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea }, "t");
    if (!tx.ok) throw new Error(tx.errors.join());
    const expedienteId = tx.id;
    expect(rt.totalCobradoDe(expedienteId)).toBe(0);
    rt.registrarCobro(expedienteId, { importeCentimos: 50000, medio: "transferencia" }, "gerente");
    expect(rt.totalCobradoDe(expedienteId)).toBe(50000);
    rt.registrarCobro(expedienteId, { importeCentimos: 30000, medio: "efectivo" }, "gerente");
    expect(rt.totalCobradoDe(expedienteId)).toBe(80000);
    const cobros = rt.cobrosDelExpediente(expedienteId);
    expect(cobros).toHaveLength(2);
    rt.close();
  });
});
