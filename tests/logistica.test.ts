/**
 * Pruebas: logística y seguimiento de envíos.
 * Verifica cambios de estado y tracking.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

function open(id: string) {
  const boot = bootProfile(id);
  const dir = mkdtempSync(join(tmpdir(), "abs-logistica-"));
  dirs.push(dir);
  return { boot, rt: AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") }) };
}

describe("Logística y Seguimiento", () => {
  it("crea envío en estado preparado", () => {
    const { boot, rt } = open("concesionaria");

    // Crear expediente
    const linea = [{ descripcion: "Coche", cantidadMilesimas: 1000, precioCentimos: 3000000, ivaPct: 21 }];
    const exp = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );
    expect(exp.ok).toBe(true);

    if (exp.ok) {
      rt.crearEnvio(exp.id);
      const envio = rt.obtenerEnvio(exp.id);
      expect(envio?.estado).toBe("preparado");
    }

    rt.close();
  });

  it("actualiza estado de envío a enviado", () => {
    const { boot, rt } = open("concesionaria");

    const linea = [{ descripcion: "Coche", cantidadMilesimas: 1000, precioCentimos: 3000000, ivaPct: 21 }];
    const exp = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );
    expect(exp.ok).toBe(true);

    if (exp.ok) {
      rt.crearEnvio(exp.id);
      rt.actualizarEnvio(exp.id, "enviado", "DHL", "123456");

      const envio = rt.obtenerEnvio(exp.id);
      expect(envio?.estado).toBe("enviado");
      expect(envio?.proveedorLogistica).toBe("DHL");
      expect(envio?.numeroSeguimiento).toBe("123456");
    }

    rt.close();
  });

  it("marca como entregado", () => {
    const { boot, rt } = open("concesionaria");

    const linea = [{ descripcion: "Coche", cantidadMilesimas: 1000, precioCentimos: 3000000, ivaPct: 21 }];
    const exp = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );
    expect(exp.ok).toBe(true);

    if (exp.ok) {
      rt.crearEnvio(exp.id);
      rt.marcarEntregado(exp.id, "firma-cliente");

      const envio = rt.obtenerEnvio(exp.id);
      expect(envio?.estado).toBe("entregado");
      expect(envio?.firmaEntrega).toBe("firma-cliente");
    }

    rt.close();
  });

  it("obtiene historial de cambios", () => {
    const { boot, rt } = open("concesionaria");

    const linea = [{ descripcion: "Coche", cantidadMilesimas: 1000, precioCentimos: 3000000, ivaPct: 21 }];
    const exp = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );
    expect(exp.ok).toBe(true);

    if (exp.ok) {
      rt.crearEnvio(exp.id);
      rt.actualizarEnvio(exp.id, "enviado", "Correos", "567890");
      rt.marcarEntregado(exp.id);

      const historial = rt.historialEnvio(exp.id);
      expect(historial.length).toBeGreaterThanOrEqual(1);

      // Último debe ser entregado
      const ultimo = historial[historial.length - 1];
      expect(ultimo?.estado).toBe("entregado");
    }

    rt.close();
  });

  it("lista pendientes de enviar", () => {
    const { boot, rt } = open("concesionaria");

    const linea = [{ descripcion: "Coche", cantidadMilesimas: 1000, precioCentimos: 3000000, ivaPct: 21 }];

    // Crear 2 expedientes
    const exp1 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );
    const exp2 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );

    if (exp1.ok && exp2.ok) {
      // Crear envíos (estado preparado)
      rt.crearEnvio(exp1.id);
      rt.crearEnvio(exp2.id);

      // Marcar uno como enviado
      rt.actualizarEnvio(exp1.id, "enviado");

      // Solo exp2 debe estar pendiente
      const pendientes = rt.pendientesDeEnviar();
      expect(pendientes.includes(exp2.id)).toBe(true);
    }

    rt.close();
  });

  it("transiciones: preparado → enviado → en_transito → entregado", () => {
    const { boot, rt } = open("concesionaria");

    const linea = [{ descripcion: "Coche", cantidadMilesimas: 1000, precioCentimos: 3000000, ivaPct: 21 }];
    const exp = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );
    expect(exp.ok).toBe(true);

    if (exp.ok) {
      rt.crearEnvio(exp.id);
      expect(rt.obtenerEnvio(exp.id)?.estado).toBe("preparado");

      rt.actualizarEnvio(exp.id, "enviado");
      expect(rt.obtenerEnvio(exp.id)?.estado).toBe("enviado");

      rt.actualizarEnvio(exp.id, "en_transito");
      expect(rt.obtenerEnvio(exp.id)?.estado).toBe("en_transito");

      rt.marcarEntregado(exp.id);
      expect(rt.obtenerEnvio(exp.id)?.estado).toBe("entregado");
    }

    rt.close();
  });
});
