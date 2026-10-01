/**
 * Triggers: automatización de flujos basada en eventos.
 * Triggers simples: factura grande, cliente bloqueado, expediente cerrado, financiado.
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

// describe("Triggers: automatización de flujos", () => {
//   function open(id: string) {
//     const dir = mkdtempSync(join(tmpdir(), "abs-triggers-"));
//     dirs.push(dir);
//     return AppRuntime.open(bootProfile(id), { dbPath: join(dir, "db.sqlite") });
//   }
//
//   it("crear trigger de factura grande", () => {
//     const rt = open("p03-ferreteria");
//
//     const triggerId = rt.triggers.crear(rt.tenantId, {
//       nombre: "Notificar factura grande",
//       actorId: "empresario-1",
//       condicion: {
//         tipo: "factura_grande",
//         parametros: { montoMinimo: 50000 },
//       },
//       accion: {
//         tipo: "notificacion",
//         parametros: {
//           asunto: "Factura de importe elevado",
//           cuerpo: "Se ha emitido una factura con importe superior a €500",
//           canales: ["email", "app"],
//         },
//       },
//     });
//
//     expect(triggerId).toBeDefined();
//     expect(triggerId).toMatch(/^trigger-/);
//
//     const trigger = rt.triggers.obtener(rt.tenantId, triggerId);
//     expect(trigger?.nombre).toBe("Notificar factura grande");
//     expect(trigger?.activo).toBe(true);
//     expect(trigger?.condicion.tipo).toBe("factura_grande");
//
//     rt.close();
//   });
//
//   it("listar triggers activos", () => {
//     const rt = open("p03-ferreteria");
//
//     const id1 = rt.triggers.crear(rt.tenantId, {
//       nombre: "Trigger 1",
//       actorId: "usuario-1",
//       condicion: { tipo: "factura_grande" },
//       accion: {
//         tipo: "notificacion",
//         parametros: {},
//       },
//     });
//
//     const id2 = rt.triggers.crear(rt.tenantId, {
//       nombre: "Trigger 2",
//       actorId: "usuario-1",
//       condicion: { tipo: "cliente_bloqueado" },
//       accion: {
//         tipo: "notificacion",
//         parametros: {},
//       },
//     });
//
//     const activos = rt.triggers.lista(rt.tenantId, true);
//     expect(activos.length).toBeGreaterThanOrEqual(2);
//     expect(activos.some((t) => t.id === id1)).toBe(true);
//     expect(activos.some((t) => t.id === id2)).toBe(true);
//
//     rt.close();
//   });
//
//   it("activar y desactivar trigger", () => {
//     const rt = open("p03-ferreteria");
//
//     const triggerId = rt.triggers.crear(rt.tenantId, {
//       nombre: "Test trigger",
//       actorId: "usuario-1",
//       condicion: { tipo: "factura_grande" },
//       accion: {
//         tipo: "notificacion",
//         parametros: {},
//       },
//     });
//
//     let trigger = rt.triggers.obtener(rt.tenantId, triggerId);
//     expect(trigger?.activo).toBe(true);
//
//     rt.triggers.activar(rt.tenantId, triggerId, false);
//     trigger = rt.triggers.obtener(rt.tenantId, triggerId);
//     expect(trigger?.activo).toBe(false);
//
//     rt.triggers.activar(rt.tenantId, triggerId, true);
//     trigger = rt.triggers.obtener(rt.tenantId, triggerId);
//     expect(trigger?.activo).toBe(true);
//
//     rt.close();
//   });
//
//   it("registrar ejecución de trigger", () => {
//     const rt = open("p03-ferreteria");
//
//     const triggerId = rt.triggers.crear(rt.tenantId, {
//       nombre: "Test trigger",
//       actorId: "usuario-1",
//       condicion: { tipo: "factura_grande" },
//       accion: {
//         tipo: "notificacion",
//         parametros: {},
//       },
//     });
//
//     rt.triggers.registrarEjecucion(
//       rt.tenantId,
//       triggerId,
//       "factura_registrada",
//       false,
//       "Error al enviar notificación",
//     );
//
//     rt.triggers.registrarEjecucion(
//       rt.tenantId,
//       triggerId,
//       "factura_registrada",
//       true,
//       "Notificación enviada exitosamente",
//     );
//
//     const ejecuciones = rt.triggers.ejecuciones(rt.tenantId, triggerId);
//     expect(ejecuciones.length).toBe(2);
//     // Verificar que se registraron con los valores correctos (orden DESC por timestamp)
//     const exitosos = ejecuciones.filter((e) => e.exito).length;
//     const fallidos = ejecuciones.filter((e) => !e.exito).length;
//     expect(exitosos).toBe(1);
//     expect(fallidos).toBe(1);
//
//     rt.close();
//   });
//
//   it("trigger de factura grande → notificación", () => {
//     const rt = open("p03-ferreteria");
//     const linea = [
//       { descripcion: "Producto caro", cantidadMilesimas: 1000, precioCentimos: 60000, ivaPct: 21 },
//     ];
//
//     // Crear trigger
//     const triggerId = rt.triggers.crear(rt.tenantId, {
//       nombre: "Notificar facturas grandes",
//       actorId: "empresario-1",
//       condicion: {
//         tipo: "factura_grande",
//         parametros: { montoMinimo: 50000 },
//       },
//       accion: {
//         tipo: "notificacion",
//         parametros: {
//           asunto: "Factura grande registrada",
//           cuerpo: "Se ha creado una factura con importe elevado",
//           canales: ["email"],
//         },
//       },
//     });
//
//     expect(triggerId).toBeDefined();
//
//     // Crear expediente con factura grande
//     const tx = rt.crearTransaccion(
//       { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
//       "usuario-test",
//     );
//     expect(tx.ok).toBe(true);
//
//     // Simular ejecución del trigger
//     if (tx.ok && "id" in tx) {
//       rt.triggers.registrarEjecucion(
//         rt.tenantId,
//         triggerId,
//         "expediente_creado",
//         true,
//         `Notificación enviada para expediente ${tx.id}`,
//       );
//
//       // Crear notificación via trigger
//       rt.crearNotificacion(tx.id, "factura_grande", {
//         asunto: "Factura grande registrada",
//         cuerpo: "Se ha creado una factura con importe elevado",
//         canales: ["email"],
//       }, "empresario-1");
//     }
//
//     const notificaciones = rt.notificacionesPendientes("empresario-1");
//     expect(notificaciones.length).toBeGreaterThan(0);
//
//     rt.close();
//   });
//
//   it("historial de ejecuciones del trigger", () => {
//     const rt = open("p03-ferreteria");
//
//     const triggerId = rt.triggers.crear(rt.tenantId, {
//       nombre: "Test trigger",
//       actorId: "usuario-1",
//       condicion: { tipo: "expediente_cerrado" },
//       accion: {
//         tipo: "notificacion",
//         parametros: {},
//       },
//     });
//
//     // Registrar varias ejecuciones
//     for (let i = 0; i < 3; i++) {
//       rt.triggers.registrarEjecucion(
//         rt.tenantId,
//         triggerId,
//         "expediente_cerrado",
//         i % 2 === 0, // alternado: exito, fallo, exito
//         `Ejecución #${i + 1}`,
//       );
//     }
//
//     const historial = rt.triggers.ejecuciones(rt.tenantId, triggerId);
//     expect(historial.length).toBe(3);
//     expect(historial.filter((e) => e.exito).length).toBe(2);
//     expect(historial.filter((e) => !e.exito).length).toBe(1);
//
//     rt.close();
//   });
// });
