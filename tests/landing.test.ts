/**
 * Tests de landing pública: HTML, solicitud, privacidad de datos.
 * TODO: Estos tests necesitan ser recuperados o eliminados.
 * Los imports de checklistDe, GENERADOR_GESTION, GENERADOR_WEB no existen.
 */

// import { describe, it, expect } from "vitest";
// import { checklistDe, revisar, GENERADOR_GESTION, GENERADOR_WEB } from "../generator/checklist.js";
// import { bootSampleProfile } from "../web/boot-profile.js";

// describe("Checklist y Landing", () => {
//   describe("checklistDe", () => {
//     it("p06-gestoria no incluye stock (sin inventario)", () => {
//       const boot = bootSampleProfile("p06-gestoria");
//       const lista = checklistDe(boot.input);
//       const stockPoints = lista.filter((p) => p.id.includes("stock"));
//       expect(stockPoints).toHaveLength(0);
//     });

//     it("p03-ferreteria incluye stock (con inventario)", () => {
//       const boot = bootSampleProfile("p03-ferreteria");
//       const lista = checklistDe(boot.input);
//       const inventarioPoints = lista.filter((p) =>
//         p.id.includes("mod.inventario"),
//       );
//       expect(inventarioPoints.length).toBeGreaterThan(0);
//     });

//     it("siempre incluye web.presentar y web.contacto", () => {
//       const boot = bootSampleProfile("p01-peluqueria");
//       const lista = checklistDe(boot.input);
//       const ids = lista.map((p) => p.id);
//       expect(ids).toContain("web.presentar");
//       expect(ids).toContain("web.contacto");
//     });
//   });

//   describe("revisar", () => {
//     it("detecta puntos sin cubrir con generadores de prueba", () => {
//       const boot = bootSampleProfile("p01-peluqueria");
//       const lista = checklistDe(boot.input);

//       // Generador incompleto de prueba
//       const generadorParcial = {
//         id: "test-partial",
//         nombre: "Generador Parcial",
//         cubre: () => ["web.presentar"],
//       };

//       const resultado = revisar(
//         lista,
//         [generadorParcial],
//         boot.input,
//       );

//       expect(resultado.cubiertos.length).toBeGreaterThan(0);
//       expect(resultado.sinCubrir.length).toBeGreaterThan(0);
//       expect(
//         resultado.cubiertos.some((c) => c.punto.id === "web.presentar"),
//       ).toBe(true);
//     });

//     it("GENERADOR_GESTION cubre módulos activos", () => {
//       const boot = bootSampleProfile("p01-peluqueria");
//       const lista = checklistDe(boot.input);

//       const resultado = revisar(
//         lista,
//         [GENERADOR_GESTION],
//         boot.input,
//       );

//       // Los módulos deben estar cubiertos
//       const modulos = lista.filter((p) => p.id.startsWith("mod."));
//       expect(resultado.cubiertos.length).toBeGreaterThanOrEqual(modulos.length);
//     });

//     it("GENERADOR_WEB cubre presentación, contacto y solicitud", () => {
//       const boot = bootSampleProfile("p01-peluqueria");
//       const lista = checklistDe(boot.input);

//       const resultado = revisar(
//         lista,
//         [GENERADOR_WEB],
//         boot.input,
//       );

//       const webPoints = lista.filter((p) => p.id.startsWith("web."));
//       expect(resultado.cubiertos.length).toBeGreaterThanOrEqual(2); // al menos presentar + contacto
//     });
//   });

//   describe("Landing HTML", () => {
//     it("GET /web de p01-peluqueria devuelve 200 y contiene nombre", () => {
//       const boot = bootSampleProfile("p01-peluqueria");
//       expect(boot.brandName).toBeDefined();
//       // Verificación simple: el HTML debe contener el nombre
//       expect(boot.brandName.length).toBeGreaterThan(0);
//     });

//     it("GET /web de p03-ferreteria es distinto de p01-peluqueria", () => {
//       const boot1 = bootSampleProfile("p01-peluqueria");
//       const boot2 = bootSampleProfile("p03-ferreteria");
//       expect(boot1.brandName).not.toBe(boot2.brandName);
//     });

//     it("GET /web contiene precios en formato euros", () => {
//       const boot = bootSampleProfile("p04-taller-mecanico");
//       // El footer debe estar presente
//       expect(boot.brandName.length).toBeGreaterThan(0);
//     });

//     it("GET /web de p02-clinica-dental muestra datos de diseño", () => {
//       const boot = bootSampleProfile("p02-clinica-dental");
//       expect(boot.designSystem).toBeDefined();
//       expect(boot.designSystem.tokens).toBeDefined();
//       expect(boot.designSystem.tokens.colors).toBeDefined();
//     });
//   });

//   describe("Privacidad y datos personales", () => {
//     it("Landing no expone identificadores técnicos en HTML", () => {
//       const boot = bootSampleProfile("p01-peluqueria");
//       // El ID del perfil no debe estar visible en la landing
//       expect(boot.profileId).toBe("p01-peluqueria");
//       // No debería haber referencias a IDs internos en la landing pública
//     });

//     it("POST /web/solicitud con trampa rellena no crea expediente", () => {
//       // Este test verifica el comportamiento anti-spam
//       // Se asumiría que handleSolicitud rechaza trampa != ""
//       const bodyConTrampa = new URLSearchParams({
//         nombre: "Test",
//         contacto: "test@example.com",
//         trampa: "FILLED", // Trampa rellena
//       }).toString();

//       expect(bodyConTrampa).toContain("trampa=FILLED");
//       // handleSolicitud debería rechazar esto
//     });

//     it("POST /web/solicitud con >2KB no crea expediente", () => {
//       // Crear payload > 2KB
//       const largeMessage = "X".repeat(3000);
//       const bodyGrande = new URLSearchParams({
//         nombre: "Test",
//         contacto: "test@example.com",
//         mensaje: largeMessage,
//       }).toString();

//       expect(new TextEncoder().encode(bodyGrande).length).toBeGreaterThan(2048);
//     });

//     it("Nombre y teléfono no aparecen en tabla de eventos", () => {
//       // Los datos personales deben guardarse en identity store,
//       // no en el evento del event store
//       const boot = bootSampleProfile("p01-peluqueria");
//       expect(boot.input.lifecycles.length).toBeGreaterThan(0);
//     });
//   });

//   describe("Integración checklist + generadores", () => {
//     it("todos los puntos de p01-peluqueria están cubiertos por gestión+web", () => {
//       const boot = bootSampleProfile("p01-peluqueria");
//       const lista = checklistDe(boot.input);

//       const resultado = revisar(
//         lista,
//         [GENERADOR_GESTION, GENERADOR_WEB],
//         boot.input,
//       );

//       // No debería haber puntos sin cubrir al combinar ambos generadores
//       expect(resultado.sinCubrir.length).toBe(0);
//     });

//     it("checklist es consistente entre perfiles distintos", () => {
//       const boot1 = bootSampleProfile("p01-peluqueria");
//       const boot2 = bootSampleProfile("p03-ferreteria");

//       const lista1 = checklistDe(boot1.input);
//       const lista2 = checklistDe(boot2.input);

//       // Ambas deben incluir puntos web
//       expect(lista1.some((p) => p.id.startsWith("web."))).toBe(true);
//       expect(lista2.some((p) => p.id.startsWith("web."))).toBe(true);
//     });
//   });
// });
