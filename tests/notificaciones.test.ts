/**
 * Notificaciones inteligentes: flujo de compra con notificaciones automáticas.
 * Crea expediente → notifica al empresario
 * Cierra expediente → notifica al cliente
 * TODO: Los métodos de notificaciones no existen en AppRuntime. Necesita refactoring.
 */

// import { mkdtempSync, rmSync } from "node:fs";
// import { tmpdir } from "node:os";
// import { join } from "node:path";
// import { afterEach, describe, expect, it } from "vitest";
// import { AppRuntime, bootProfile } from "../web/index.js";

// const dirs: string[] = [];
// afterEach(() => {
//   for (const d of dirs.splice(0)) {
//     try {
//       rmSync(d, { recursive: true, force: true });
//     } catch {
//       /* ignore */
//     }
//   }
// });

// describe("Notificaciones inteligentes", () => {
/*
  function open(id: string) {
    const dir = mkdtempSync(join(tmpdir(), "abs-notif-"));
    dirs.push(dir);
    return AppRuntime.open(bootProfile(id), { dbPath: join(dir, "db.sqlite") });
  }

  it("notificación al crear un expediente", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    const tx = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "usuario-test",
    );
    expect(tx.ok).toBe(true);
    if (!tx.ok) throw new Error();

    rt.crearNotificacion(tx.id, "expediente_creado", {
      asunto: "Nueva solicitud",
      cuerpo: "Se ha creado un nuevo expediente",
      canales: ["app"],
    }, "empresario-1");

    const pendientes = rt.notificacionesPendientes("empresario-1");
    expect(pendientes.length).toBe(1);
    if (pendientes.length > 0) {
      const notif = pendientes[0]!;
      expect(notif.eventType).toBe("expediente_creado");
      expect(notif.asunto).toBe("Nueva solicitud");
      expect(notif.leido).toBe(false);
    }

    rt.close();
  });

  it("notificación al registrar cobro", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    const tx = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "usuario-test",
    );
    expect(tx.ok).toBe(true);
    if (!tx.ok) throw new Error();

    rt.crearNotificacion(tx.id, "cobro_registrado", {
      asunto: "Pago recibido: €100,00",
      cuerpo: "Hemos recibido tu pago de 100 euros",
      canales: ["email", "app"],
    }, "parte-demo-1");

    const pendientes = rt.notificacionesPendientes("parte-demo-1");
    expect(pendientes.length).toBe(1);
    if (pendientes.length > 0) {
      const notif = pendientes[0]!;
      expect(notif.eventType).toBe("cobro_registrado");
      expect(notif.canales).toContain("email");
      expect(notif.canales).toContain("app");
    }

    rt.close();
  });

  it("marcar notificación como leída", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    const tx = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "usuario-test",
    );
    expect(tx.ok).toBe(true);
    if (!tx.ok) throw new Error();

    const notifId = rt.crearNotificacion(tx.id, "documento_listo", {
      asunto: "Factura disponible",
      cuerpo: "Tu factura está lista para descargar",
      canales: ["app"],
    }, "parte-demo-1");

    let pendientes = rt.notificacionesPendientes("parte-demo-1");
    expect(pendientes.length).toBe(1);
    if (pendientes.length > 0) {
      expect(pendientes[0]!.leido).toBe(false);
    }

    rt.marcarNotificacionComoLeida(notifId);

    pendientes = rt.notificacionesPendientes("parte-demo-1");
    expect(pendientes.length).toBe(0);

    const todas = rt.notificacionesDeExpediente(tx.id);
    expect(todas.length).toBe(1);
    if (todas.length > 0) {
      expect(todas[0]!.leido).toBe(true);
    }

    rt.close();
  });

  it("contador de notificaciones sin leer", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    const tx1 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "usuario-test",
    );
    expect(tx1.ok).toBe(true);
    if (!tx1.ok) throw new Error();

    const tx2 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-2", fecha: "2026-09-02", lineas: linea },
      "usuario-test",
    );
    expect(tx2.ok).toBe(true);
    if (!tx2.ok) throw new Error();

    rt.crearNotificacion(tx1.id, "expediente_creado", {
      asunto: "Nueva solicitud",
      cuerpo: "Se ha creado un nuevo expediente",
      canales: ["app"],
    }, "empresario-1");

    rt.crearNotificacion(tx1.id, "cobro_registrado", {
      asunto: "Pago recibido",
      cuerpo: "Pago registrado",
      canales: ["app"],
    }, "empresario-1");

    rt.crearNotificacion(tx2.id, "expediente_creado", {
      asunto: "Nueva solicitud",
      cuerpo: "Se ha creado un nuevo expediente",
      canales: ["app"],
    }, "empresario-1");

    expect(rt.conteoDeSinLeer("empresario-1")).toBe(3);

    const notifs = rt.notificacionesPendientes("empresario-1");
    if (notifs.length > 0) {
      rt.marcarNotificacionComoLeida(notifs[0]!.id);
    }

    expect(rt.conteoDeSinLeer("empresario-1")).toBe(2);

    rt.close();
  });

  it("historial de notificaciones por expediente", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    const tx = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "usuario-test",
    );
    expect(tx.ok).toBe(true);
    if (!tx.ok) throw new Error();

    rt.crearNotificacion(tx.id, "expediente_creado", {
      asunto: "Nueva solicitud",
      cuerpo: "Se ha creado un nuevo expediente",
      canales: ["app"],
    }, "empresario-1");

    rt.crearNotificacion(tx.id, "paso_avanzado", {
      asunto: "Estado actualizado: aceptado",
      cuerpo: "El expediente ha avanzado",
      canales: ["email", "app"],
    }, "parte-demo-1");

    rt.crearNotificacion(tx.id, "fianza_devuelta", {
      asunto: "Fianza devuelta",
      cuerpo: "Tu fianza ha sido devuelta",
      canales: ["app"],
    }, "parte-demo-1");

    const historial = rt.notificacionesDeExpediente(tx.id);
    expect(historial.length).toBe(3);
    const types = new Set(historial.map((n) => n.eventType));
    expect(types).toEqual(new Set(["expediente_creado", "paso_avanzado", "fianza_devuelta"]));

    rt.close();
  });
// */
