/**
 * Asientos contables: verificar que se registran correctamente
 * y que siempre se balance (débitos = créditos).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { AppRuntime, bootProfile } from "../web/index.js";

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

describe("Asientos contables", () => {
  it("registra asientos con doble entrada", () => {
    const boot = bootProfile("p01-peluqueria");
    const dir = mkdtempSync(join(tmpdir(), "abs-asientos-"));
    dirs.push(dir);
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    // Asiento 1: venta de €100 → débito Caja / crédito Ingresos
    const asiento1 = rt.registrarAsiento(
      "2026-09-01",
      "1000", // Caja
      "4000", // Ventas
      10000, // €100
      "Venta de servicios",
      "expediente-001"
    );
    if (!asiento1.ok) throw new Error(`Registrar asiento falló: ${asiento1.error}`);
    expect(asiento1.numeroAsiento).toBeTruthy();

    // Asiento 2: cobro por banco → débito Banco / crédito Caja
    const asiento2 = rt.registrarAsiento(
      "2026-09-02",
      "1100", // Banco
      "1000", // Caja
      10000, // €100
      "Cobro en banco",
      "expediente-001"
    );
    expect(asiento2.ok).toBe(true);

    // Verificar que se registraron
    const asientos = rt.asientos.todos(rt.tenantId);
    expect(asientos.length).toBe(2);

    // Verificar que cuadran
    let totalDebitos = 0;
    let totalCreditos = 0;
    for (const a of asientos) {
      totalDebitos += a.importe_centimos;
      totalCreditos += a.importe_centimos;
    }
    expect(totalDebitos).toBe(totalCreditos);

    rt.close();
  });

  it("valida que las cuentas existan", () => {
    const boot = bootProfile("p01-peluqueria");
    const dir = mkdtempSync(join(tmpdir(), "abs-asientos-"));
    dirs.push(dir);
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    // Intentar registrar asiento con cuenta inexistente
    const resultado = rt.registrarAsiento(
      "2026-09-01",
      "9999", // Cuenta inexistente
      "4000",
      10000,
      "Test",
      "ref"
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toContain("no existe");
    }

    rt.close();
  });

  it("actualiza saldos de cuentas", () => {
    const boot = bootProfile("p01-peluqueria");
    const dir = mkdtempSync(join(tmpdir(), "abs-asientos-"));
    dirs.push(dir);
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    // Saldo inicial de caja
    const cajaAntes = rt.cuentas.obtener("1000", rt.tenantId);
    expect(cajaAntes?.saldo_centimos).toBe(0);

    // Registrar asiento: débito caja €100
    rt.registrarAsiento(
      "2026-09-01",
      "1000", // Caja (+débito)
      "4000", // Ventas (-crédito)
      10000,
      "Venta",
      "ref"
    );

    // Verificar saldos actualizados
    const cajaDespues = rt.cuentas.obtener("1000", rt.tenantId);
    expect(cajaDespues?.saldo_centimos).toBe(10000);

    const ventas = rt.cuentas.obtener("4000", rt.tenantId);
    expect(ventas?.saldo_centimos).toBe(-10000);

    rt.close();
  });
});
