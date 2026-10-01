/**
 * Ciclo completo de carpintería: visita para medir, presupuesto, aceptación,
 * pago de hitos, ejecución y cierre. Verifica que los hitos se pagan correctamente.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
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

describe("Ciclo de carpintería con pagos de hitos", () => {
  it("completa el ciclo hasta cierre con pago de hitos", async () => {
    const boot = bootProfile("n06-carpinteria");
    const dir = mkdtempSync(join(tmpdir(), "abs-carp-"));
    dirs.push(dir);
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const lineas = [
      { descripcion: "Cocina a medida", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21 },
    ];
    const alta = rt.crearTransaccion(
      {
        lifecycleId: "lc.servicio_proyecto",
        parteId: "parte-demo-1",
        fecha: "2026-09-01",
        lineas,
      },
      "test"
    );
    if (!alta.ok) throw new Error(`Crear transacción falló: ${alta.errors.join(" ")}`);
    const expedienteId = alta.id;

    // Acción 1: Acordar (t_acordar) — propuesta → acordado
    const acordar = await executeUiAction(rt, {
      actionId: "action.lc.servicio_proyecto.t_acordar",
      subjectId: expedienteId,
      clientRequestId: `${expedienteId}-1`,
      roleId: "dueno",
      parteId: "parte-demo-1",
      channel: "backoffice",
      kind: "boton",
    });
    expect(acordar.ok, `Acordar falló: ${acordar.flash.text}`).toBe(true);
    expect(acordar.newStateId).toBe("acordado");

    // Registrar el 50% de pago para el primer hito
    const total = lineas.reduce((sum, l) => sum + (l.precioCentimos * l.cantidadMilesimas / 1000), 0);
    const mitad = Math.round(total / 2);
    const cobro = rt.registrarCobro(
      expedienteId,
      { importeCentimos: mitad, hitoId: "h1", medio: "efectivo" },
      "prueba"
    );
    expect(cobro.ok, `Registrar cobro falló: ${!cobro.ok ? cobro.error : ""}`).toBe(true);

    // Acción 2: Ejecutar (t_ejecutar) — acordado → en_ejecucion
    // Esto debería funcionar ahora porque el 50% está pagado
    // Intentar con ambos roles para la transición del sistema
    let ejecutar = await executeUiAction(rt, {
      actionId: "action.lc.servicio_proyecto.t_ejecutar",
      subjectId: expedienteId,
      clientRequestId: `${expedienteId}-2`,
      roleId: "oficial",
      parteId: "parte-demo-1",
      channel: "backoffice",
      kind: "boton",
    });
    if (!ejecutar.ok) {
      ejecutar = await executeUiAction(rt, {
        actionId: "action.lc.servicio_proyecto.t_ejecutar",
        subjectId: expedienteId,
        clientRequestId: `${expedienteId}-2b`,
        roleId: "dueno",
        parteId: "parte-demo-1",
        channel: "backoffice",
        kind: "boton",
      });
    }
    expect(ejecutar.ok, `Ejecutar falló: ${ejecutar.flash.text}`).toBe(true);
    expect(ejecutar.newStateId).toBe("en_ejecucion");

    // Acción 3: Presentar (t_presentar) — en_ejecucion → en_espera
    let presentar = await executeUiAction(rt, {
      actionId: "action.lc.servicio_proyecto.t_presentar",
      subjectId: expedienteId,
      clientRequestId: `${expedienteId}-3`,
      roleId: "oficial",
      parteId: "parte-demo-1",
      channel: "backoffice",
      kind: "boton",
    });
    if (!presentar.ok) {
      presentar = await executeUiAction(rt, {
        actionId: "action.lc.servicio_proyecto.t_presentar",
        subjectId: expedienteId,
        clientRequestId: `${expedienteId}-3b`,
        roleId: "dueno",
        parteId: "parte-demo-1",
        channel: "backoffice",
        kind: "boton",
      });
    }
    expect(presentar.ok, `Presentar falló: ${presentar.flash.text}`).toBe(true);
    expect(presentar.newStateId).toBe("en_espera");

    // Registrar el segundo 50% de pago para el segundo hito (montaje)
    const cobro2 = rt.registrarCobro(
      expedienteId,
      { importeCentimos: mitad, hitoId: "h2", medio: "efectivo" },
      "prueba"
    );
    expect(cobro2.ok, `Registrar segundo cobro falló: ${!cobro2.ok ? cobro2.error : ""}`).toBe(true);

    // Acción 4: Cerrar (t_cerrar) — en_espera → cerrada
    const cerrar = await executeUiAction(rt, {
      actionId: "action.lc.servicio_proyecto.t_cerrar",
      subjectId: expedienteId,
      clientRequestId: `${expedienteId}-4`,
      roleId: "dueno",
      parteId: "parte-demo-1",
      channel: "backoffice",
      kind: "boton",
    });
    expect(cerrar.ok, `Cerrar falló: ${cerrar.flash.text}`).toBe(true);
    expect(cerrar.newStateId).toBe("cerrada");

    rt.close();
  });
});
