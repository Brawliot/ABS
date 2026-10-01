/**
 * Tareas recurrentes: cobro vencido, cliente bloqueado, stock bajo, factura sin enviar.
 * Las tareas se crean automáticamente al detectar condiciones y se completan manualmente.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppRuntime, bootProfile } from "../web/index.js";
import type { SqliteEventStore } from "../adapters/sqlite-event-store.js";

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

describe("Tareas recurrentes", () => {
  it("registra y lista tareas", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-tareas-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const hoy = "2026-09-01";

    rt.tareas.registrar(rt.tenantId, {
      tipo: "cobro_vencido",
      referencia: "exp-001",
      periodicidad: "diaria",
      proximaEjecucion: hoy,
    });

    const tareas = rt.tareasVencidasHoy();
    expect(tareas.some((t) => t.tipo === "cobro_vencido")).toBe(true);

    rt.close();
  });

  it("completa una tarea y calcula la próxima ejecución", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-tareas-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    rt.tareas.registrar(rt.tenantId, {
      tipo: "cobro_vencido",
      referencia: "test-001",
      periodicidad: "diaria",
      proximaEjecucion: "2026-09-01",
    });

    const tareasBefore = Array.from(rt.tareas.deReferencia(rt.tenantId, "test-001"));
    expect(tareasBefore).toHaveLength(1);
    expect(tareasBefore[0]?.estado).toBe("pendiente");

    const seq = tareasBefore[0]?.seq;
    if (seq !== undefined) {
      rt.completarTarea(seq);

      const tareasAfter = Array.from(rt.tareas.deReferencia(rt.tenantId, "test-001"));
      expect(tareasAfter).toHaveLength(2);
      const completada = tareasAfter.find((t) => t.estado === "completada");
      expect(completada?.estado).toBe("completada");
      expect(completada?.proximaEjecucion).toBe("2026-09-02");
    }

    rt.close();
  });

  it("registra tareas por tipo", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-tareas-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const hoy = "2026-09-01";

    rt.tareas.registrar(rt.tenantId, {
      tipo: "stock_bajo",
      referencia: "producto-001",
      periodicidad: "semanal",
      proximaEjecucion: hoy,
    });

    const tareasBajo = rt.tareas.porTipo(rt.tenantId, "stock_bajo");
    expect(tareasBajo.some((t) => t.referencia === "producto-001")).toBe(true);

    rt.close();
  });

  it("lista tareas vencidas hoy", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-tareas-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
    const future = new Date();
    future.setDate(future.getDate() + 15);
    const futuraFecha = future.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

    rt.tareas.registrar(rt.tenantId, {
      tipo: "factura_sin_enviar",
      referencia: "factura-001",
      periodicidad: "diaria",
      proximaEjecucion: hoy,
    });

    rt.tareas.registrar(rt.tenantId, {
      tipo: "cliente_bloqueado",
      referencia: "cliente-002",
      periodicidad: "semanal",
      proximaEjecucion: futuraFecha,
    });

    const tareasPendientes = Array.from(rt.tareasVencidasHoy());
    expect(tareasPendientes.length).toBeGreaterThanOrEqual(1);
    expect(tareasPendientes.some((t) => t.tipo === "factura_sin_enviar")).toBe(true);

    rt.close();
  });

  it("cancela una tarea", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-tareas-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    rt.tareas.registrar(rt.tenantId, {
      tipo: "stock_bajo",
      referencia: "producto-001",
      periodicidad: "semanal",
      proximaEjecucion: "2026-09-01",
    });

    const tareasBefore = Array.from(rt.tareas.deReferencia(rt.tenantId, "producto-001"));
    expect(tareasBefore).toHaveLength(1);
    const seq = tareasBefore[0]?.seq;

    if (seq !== undefined) {
      rt.tareas.cancelar(rt.tenantId, seq);

      const tareasAfter = Array.from(rt.tareas.deReferencia(rt.tenantId, "producto-001"));
      expect(tareasAfter[0]?.estado).toBe("cancelada");
    }

    rt.close();
  });
});
