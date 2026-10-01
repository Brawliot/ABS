/**
 * Test: ciclo de Carpintería con cobros por hitos.
 * Verifica que "Empezar trabajo" se bloquea sin cobro del 50% y se permite después.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AppRuntime, bootProfile } from "../web/index.js";
import { executeUiAction } from "../web/action-handler.js";

describe("Carpintería: ciclo con cobros por hitos", () => {
  let boot: ReturnType<typeof bootProfile>;
  let rt: AppRuntime;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "abs-test-"));
    boot = bootProfile("n06-carpinteria");
    rt = AppRuntime.open(boot, { dbPath: join(tempDir, "db.sqlite") });
  });

  afterAll(() => {
    rt.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("ciclo completo con bloqueo de hitos y cobros", async () => {
    // 1. Crea expediente: "Visita para medir" es el lifecycle de servicio_proyecto
    const lcId = boot.input.lifecycles.find((lc) => lc.archetypeId === "servicio_proyecto")?.id;
    expect(lcId).toBeDefined();

    const txRes = rt.crearTransaccion(
      {
        lifecycleId: lcId!,
        parteId: "parte-demo-1",
        fecha: "2026-09-01",
        lineas: [
          {
            descripcion: "Trabajo personalizado",
            cantidadMilesimas: 1000,
            precioCentimos: 100000, // 1000 EUR
            ivaPct: 21,
          },
        ],
      },
      "test-carpinteria",
    );
    expect(txRes.ok).toBe(true);
    const expediente = txRes.id;
    const totalExp = 100000; // céntimos
    const pago50 = Math.round(totalExp / 2);

    // 2. Acepta expediente (t_acordar)
    let acepta = false;
    for (const role of boot.roles) {
      const res = await executeUiAction(rt, {
        actionId: `action.${lcId}.t_acordar`,
        subjectId: expediente,
        clientRequestId: `${expediente}-acordar`,
        roleId: role.id,
        parteId: "parte-demo-1",
        channel: "backoffice",
      });
      if (res.ok) {
        acepta = true;
        break;
      }
    }
    expect(acepta).toBe(true, "Debería poder aceptar el expediente");

    // 3. Intenta "Empezar trabajo" (t_ejecutar) SIN pago → DEBE FALLAR
    let intentoSinPago = false;
    let errorSinPago = "";
    for (const role of boot.roles) {
      const res = await executeUiAction(rt, {
        actionId: `action.${lcId}.t_ejecutar`,
        subjectId: expediente,
        clientRequestId: `${expediente}-ejecutar-sin-pago`,
        roleId: role.id,
        parteId: "parte-demo-1",
        channel: "backoffice",
      });
      if (!res.ok) {
        intentoSinPago = true;
        errorSinPago = res.flash.text;
        break;
      }
    }
    expect(intentoSinPago).toBe(true, `Debería rechazar sin pago. Error: ${errorSinPago}`);

    // 4. Extrae IDs de hitos del RuleSet
    const hitosRule = boot.input.ruleSet.rules.find(
      (r: any) => "plantilla" in r && r.plantilla === "tpl.hitos_pago"
    ) as any;
    expect(hitosRule).toBeDefined();

    const hitosJson = hitosRule?.parametros?.hitosJson;
    expect(hitosJson).toBeDefined();
    const hitos = typeof hitosJson === "string" ? JSON.parse(hitosJson) : [];
    expect(hitos.length).toBeGreaterThan(0, "Debe haber al menos 1 hito compilado");

    const hitoIds = hitos.map((h: any) => h.id ?? `h${hitos.indexOf(h) + 1}`);
    expect(hitoIds).toContain("h1", "Debe haber hito h1");

    // 5. Registra pago del 50% para el PRIMER hito
    const reg1 = rt.registrarCobro(
      expediente,
      { importeCentimos: pago50, hitoId: hitoIds[0], medio: "transferencia" },
      "test-carpinteria"
    );
    expect(reg1.ok).toBe(true, `Debería registrar cobro: ${reg1.error ?? "ok"}`);

    // 6. Reintenta "Empezar trabajo" → DEBERÍA FUNCIONAR
    let ejecuta = false;
    let errorConPago = "";
    for (const role of boot.roles) {
      const res = await executeUiAction(rt, {
        actionId: `action.${lcId}.t_ejecutar`,
        subjectId: expediente,
        clientRequestId: `${expediente}-ejecutar-con-pago`,
        roleId: role.id,
        parteId: "parte-demo-1",
        channel: "backoffice",
      });
      if (res.ok) {
        ejecuta = true;
        break;
      }
      errorConPago = res.flash.text;
    }
    expect(ejecuta).toBe(true, `Debería permitir ejecutar con pago del 50%. Error: ${errorConPago}`);

    // 7. Verifica que el ciclo continúa (debería poder llegar a t_presentar)
    let presentar = false;
    if (hitoIds.length > 1) {
      // Registra pago del segundo hito si existe
      const reg2 = rt.registrarCobro(
        expediente,
        { importeCentimos: pago50, hitoId: hitoIds[1], medio: "transferencia" },
        "test-carpinteria"
      );
      expect(reg2.ok).toBe(true, `Debería registrar segundo cobro: ${reg2.error ?? "ok"}`);

      for (const role of boot.roles) {
        const res = await executeUiAction(rt, {
          actionId: `action.${lcId}.t_presentar`,
          subjectId: expediente,
          clientRequestId: `${expediente}-presentar`,
          roleId: role.id,
          parteId: "parte-demo-1",
          channel: "backoffice",
        });
        if (res.ok) {
          presentar = true;
          break;
        }
      }
      expect(presentar).toBe(true, "Debería poder presentar después de cobrar segundo hito");
    }
  });
});
