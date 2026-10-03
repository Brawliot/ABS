/**
 * Tests para contactos y tareas de cliente: múltiples contactos,
 * establecer principal, crear y completar tareas.
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

describe("Contactos de cliente", () => {
  function open() {
    const dir = mkdtempSync(join(tmpdir(), "abs-contactos-"));
    dirs.push(dir);
    return AppRuntime.open(bootProfile("n02-panaderia"), {
      dbPath: join(dir, "db.sqlite"),
    });
  }

  it("registra múltiples contactos", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    const res1 = rt.registrarContacto(clienteId, {
      nombre: "Juan López",
      cargo: "Director",
      telefono: "600123456",
      email: "juan@example.com",
      esPrincipal: true,
    });
    expect(res1.ok).toBe(true);

    const res2 = rt.registrarContacto(clienteId, {
      nombre: "María García",
      cargo: "Responsable de compras",
      email: "maria@example.com",
    });
    expect(res2.ok).toBe(true);

    const contactos = rt.contactosDelCliente(clienteId);
    expect(contactos.length).toBe(2);
    expect(contactos[0]?.esPrincipal).toBe(true);
    expect(contactos[0]?.nombre).toBe("Juan López");

    rt.close();
  });

  it("valida que el nombre no sea vacío", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    const res = rt.registrarContacto(clienteId, { nombre: "   " });
    expect(res.ok).toBe(false);

    rt.close();
  });

  it("establece un contacto como principal", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    const res1 = rt.registrarContacto(clienteId, {
      nombre: "Contacto 1",
      esPrincipal: false,
    });
    const id1 = (res1.ok && res1.id) || "";

    const res2 = rt.registrarContacto(clienteId, {
      nombre: "Contacto 2",
      esPrincipal: false,
    });
    const id2 = (res2.ok && res2.id) || "";

    rt.establecerContactoPrincipal(clienteId, id2);

    const contactos = rt.contactosDelCliente(clienteId);
    const contacto2 = contactos.find((c) => c.id === id2);
    expect(contacto2?.esPrincipal).toBe(true);

    rt.close();
  });
});

describe("Tareas de CRM", () => {
  function open() {
    const dir = mkdtempSync(join(tmpdir(), "abs-tareas-"));
    dirs.push(dir);
    return AppRuntime.open(bootProfile("n02-panaderia"), {
      dbPath: join(dir, "db.sqlite"),
    });
  }

  it("crea tareas con diferentes prioridades", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    const res1 = rt.crearTarea(clienteId, {
      texto: "Tarea urgente",
      prioridad: "alta",
      fechaVencimiento: "2026-10-10",
    });
    expect(res1.ok).toBe(true);

    const res2 = rt.crearTarea(clienteId, {
      texto: "Tarea normal",
      prioridad: "media",
    });
    expect(res2.ok).toBe(true);

    const tareas = rt.tareasDelCliente(clienteId);
    expect(tareas.length).toBe(2);
    expect(tareas[0]?.prioridad).toBe("alta");
    expect(tareas[1]?.prioridad).toBe("media");

    rt.close();
  });

  it("filtra tareas pendientes", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    const res1 = rt.crearTarea(clienteId, { texto: "Tarea 1" });
    const id1 = (res1.ok && res1.id) || "";

    const res2 = rt.crearTarea(clienteId, { texto: "Tarea 2" });
    const id2 = (res2.ok && res2.id) || "";

    rt.completarTarea(id1);

    const pendientes = rt.tareasDelCliente(clienteId, "pendientes");
    expect(pendientes.length).toBe(1);
    expect(pendientes[0]?.id).toBe(id2);

    rt.close();
  });

  it("cuenta tareas por estado", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    rt.crearTarea(clienteId, { texto: "Tarea 1" });
    rt.crearTarea(clienteId, { texto: "Tarea 2" });
    rt.crearTarea(clienteId, { texto: "Tarea 3" });

    expect(rt.contarTareas(clienteId)).toBe(3);
    expect(rt.contarTareas(clienteId, "pendiente")).toBe(3);
    expect(rt.contarTareas(clienteId, "completada")).toBe(0);

    rt.close();
  });

  it("valida que texto no sea vacío", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    const res = rt.crearTarea(clienteId, { texto: "   " });
    expect(res.ok).toBe(false);

    rt.close();
  });

  it("ordena tareas por prioridad y fecha", () => {
    const rt = open();
    const clienteId = "parte-demo-1";

    rt.crearTarea(clienteId, {
      texto: "Tarea baja",
      prioridad: "baja",
      fechaVencimiento: "2026-10-20",
    });
    rt.crearTarea(clienteId, {
      texto: "Tarea alta temprana",
      prioridad: "alta",
      fechaVencimiento: "2026-10-05",
    });
    rt.crearTarea(clienteId, {
      texto: "Tarea alta tardía",
      prioridad: "alta",
      fechaVencimiento: "2026-10-15",
    });

    const tareas = rt.tareasDelCliente(clienteId);
    expect(tareas.length).toBe(3);
    expect(tareas[0]?.texto).toBe("Tarea alta temprana");
    expect(tareas[1]?.texto).toBe("Tarea alta tardía");
    expect(tareas[2]?.texto).toBe("Tarea baja");

    rt.close();
  });
});
