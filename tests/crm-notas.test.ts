/**
 * Tests para notas de cliente: historiales, filtrado por visibilidad,
 * y validación de que solo empleados pueden registrar notas.
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

describe("Notas de cliente", () => {
  function open() {
    const dir = mkdtempSync(join(tmpdir(), "abs-notas-"));
    dirs.push(dir);
    return AppRuntime.open(bootProfile("n02-panaderia"), {
      dbPath: join(dir, "db.sqlite"),
    });
  }

  it("registra nota interna y pública correctamente", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    const res1 = rt.agregarNotaEnCliente(clienteId, "Nota interna importante", "gerente", true);
    expect(res1.ok).toBe(true);

    const res2 = rt.agregarNotaEnCliente(clienteId, "Nota pública para el cliente", "gerente", false);
    expect(res2.ok).toBe(true);

    const notas = rt.notasDelCliente(clienteId);
    expect(notas.length).toBe(2);
    expect(notas[0]?.esInterna).toBe(false);
    expect(notas[1]?.esInterna).toBe(true);

    rt.close();
  });

  it("rechaza que cliente registre notas", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    const res = rt.agregarNotaEnCliente(clienteId, "Intento de nota", "cliente", false);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("cliente");
    }

    rt.close();
  });

  it("valida longitud de nota", () => {
    const rt = open();
    const clienteId = "parte-demo-1";
    const textoLargo = "x".repeat(6000);

    const res = rt.agregarNotaEnCliente(clienteId, textoLargo, "gerente", false);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("larga");
    }

    rt.close();
  });

  it("rechaza nota vacía", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    const res = rt.agregarNotaEnCliente(clienteId, "   ", "gerente", false);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("vacía");
    }

    rt.close();
  });

  it("cuenta notas del cliente", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    rt.agregarNotaEnCliente(clienteId, "Nota 1", "gerente", false);
    rt.agregarNotaEnCliente(clienteId, "Nota 2", "gerente", true);
    rt.agregarNotaEnCliente(clienteId, "Nota 3", "gestor", false);

    expect(rt.contarNotasDelCliente(clienteId)).toBe(3);

    rt.close();
  });

  it("devuelve notas ordenadas por fecha descendente", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    rt.agregarNotaEnCliente(clienteId, "Nota antigua", "gerente", false);
    // Pequeña pausa para asegurar diferentes timestamps
    const ahora = Date.now();
    while (Date.now() === ahora) {} // Espera a que cambie el timestamp
    rt.agregarNotaEnCliente(clienteId, "Nota nueva", "gerente", false);

    const notas = rt.notasDelCliente(clienteId);
    expect(notas.length).toBe(2);
    expect(notas[0]?.texto).toBe("Nota nueva");
    expect(notas[1]?.texto).toBe("Nota antigua");

    rt.close();
  });
});
