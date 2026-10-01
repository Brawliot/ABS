/**
 * Tests para auditoría y reportes: registro de cambios,
 * historial completo, y generación de reportes básicos.
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

describe("Auditoría de cambios", () => {
  function open() {
    const dir = mkdtempSync(join(tmpdir(), "abs-auditoria-"));
    dirs.push(dir);
    return AppRuntime.open(bootProfile("n02-panaderia"), {
      dbPath: join(dir, "db.sqlite"),
    });
  }

  it("registra cambios en auditoría", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    rt.registrarCambioAuditoria(clienteId, "nombre", "Juan López", "Juan López García", "gerente");
    rt.registrarCambioAuditoria(clienteId, "email", "juan@old.com", "juan@new.com", "gestor");

    const cambios = rt.auditoriaDe(clienteId);
    expect(cambios.length).toBe(2);
    expect(cambios[0]?.campo).toBe("email");
    expect(cambios[1]?.campo).toBe("nombre");

    rt.close();
  });

  it("devuelve historial completo ordenado descendente", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    rt.registrarCambioAuditoria(clienteId, "campo1", "a", "b", "usuario1");
    const ahora = Date.now();
    while (Date.now() === ahora) {}
    rt.registrarCambioAuditoria(clienteId, "campo2", "c", "d", "usuario2");

    const cambios = rt.auditoriaDe(clienteId);
    expect(cambios.length).toBe(2);
    expect(cambios[0]?.campo).toBe("campo2");
    expect(cambios[1]?.campo).toBe("campo1");

    rt.close();
  });

  it("registra con valores anteriores opcionales", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    rt.registrarCambioAuditoria(clienteId, "nuevo_campo", undefined, "valor_nuevo", "gerente");

    const cambios = rt.auditoriaDe(clienteId);
    expect(cambios.length).toBe(1);
    expect(cambios[0]?.valorAnterior).toBeUndefined();
    expect(cambios[0]?.valorNuevo).toBe("valor_nuevo");

    rt.close();
  });
});

describe("Reportes de CRM", () => {
  function open() {
    const dir = mkdtempSync(join(tmpdir(), "abs-reportes-"));
    dirs.push(dir);
    return AppRuntime.open(bootProfile("n02-panaderia"), {
      dbPath: join(dir, "db.sqlite"),
    });
  }

  it("genera reporte top-clientes en CSV", () => {
    const rt = open();

    const csv = rt.generarReporte("top-clientes");
    expect(csv).toContain("Cliente,Deuda Total (€),Ingresos (€)");
    expect(csv).toBeTruthy();

    rt.close();
  });

  it("genera reporte vencidos en CSV", () => {
    const rt = open();

    const csv = rt.generarReporte("vencidos");
    expect(csv).toContain("Cliente,Deuda Vencida (€),Días");
    expect(csv).toBeTruthy();

    rt.close();
  });

  it("genera reporte inactivos en CSV", () => {
    const rt = open();

    const csv = rt.generarReporte("inactivos");
    expect(csv).toContain("Cliente,Últimas Expedientes,Días Inactivos");
    expect(csv).toBeTruthy();

    rt.close();
  });

  it("formatea CSV correctamente", () => {
    const rt = open();

    const csv = rt.generarReporte("top-clientes");
    const lineas = csv.split("\n");
    expect(lineas[0]).toBe("Cliente,Deuda Total (€),Ingresos (€)");
    expect(lineas.length).toBeGreaterThan(1);

    rt.close();
  });
});
