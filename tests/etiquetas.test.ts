/**
 * Paso 5 — pantallas para personas: etiquetas dinámicas (vocabulario del
 * negocio → proceso → arquetipo → identificador legible) y vigilancia de que
 * ningún identificador técnico llegue a la pantalla.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ARCHETYPES } from "../archetypes/catalog.js";
import {
  ACCION_LABELS,
  crearEtiquetador,
  humanizarId,
  pareceIdentificador,
} from "../presentation/etiquetas.js";
import {
  AppRuntime,
  allBootableIds,
  bootProfile,
  executeUiAction,
  renderAppHtml,
  resolveSession,
  startWebServer,
} from "../web/index.js";
import { processGroupsForRole } from "../web/visibility.js";
import { readFileSync } from "node:fs";
import {
  materializeBusinessProfile,
  validateBusinessProfile,
} from "../contracts/business-profile/index.js";
import {
  CONCESIONARIA_PROFILE_PATH,
  CONCESIONARIA_SYSTEM_IDS,
} from "../generator/packs/concesionaria.js";

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
function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "abs-etq-"));
  dirs.push(dir);
  return join(dir, "db.sqlite");
}

/** Lo que una persona lee: sin etiquetas, atributos, scripts ni estilos. */
function textoVisible(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ");
}

const FUGA =
  /\b[a-z0-9]+_[a-z0-9_]+\b|\b(t|c|lc|proceso|view|panel|mod|action|form|field|tpl)\.[a-z]|estado=|UiSpec|\bhash\b|standalone/;

function fugas(html: string): string[] {
  const t = textoVisible(html);
  const out: string[] = [];
  const re = new RegExp(FUGA.source, "g");
  for (const m of t.matchAll(re)) {
    out.push(`«${m[0]}» en …${t.slice(Math.max(0, m.index! - 40), m.index! + 40)}…`);
  }
  return out;
}

describe("Cadena de etiquetas", () => {
  const venta = ARCHETYPES.find((a) => a.id === "venta")!.lifecycle;
  const servicio = ARCHETYPES.find((a) => a.id === "servicio_proyecto")!.lifecycle;
  const lifecycles = [
    { id: "lc.venta", archetypeId: "venta", lifecycle: venta },
    { id: "lc.compras", archetypeId: "venta", lifecycle: venta, label: "Compras a proveedor", exchangeDirection: "empresa_compra" as const },
    { id: "lc.taller", archetypeId: "servicio_proyecto", lifecycle: servicio, label: "recepcion del vehiculo" },
  ];

  it("usa las etiquetas del arquetipo, con variante para compras", () => {
    const et = crearEtiquetador({ lifecycles });
    expect(et.accion("lc.venta", "t_cerrar")).toBe("Entregar y cobrar");
    expect(et.accion("lc.compras", "t_cerrar")).toBe("Recibir y pagar");
    expect(et.accion("lc.compras", "t_cancelar_aceptada")).toBe("Cancelar pedido");
    expect(et.estado("lc.venta", "en_entrega")).toBe("En entrega");
    expect(et.proceso("lc.venta")).toBe("Ventas");
    expect(et.proceso("lc.taller")).toBe("Recepcion del vehiculo");
    expect(et.vista({ kind: "tablero", stateId: "aceptada", lifecycleId: "lc.venta" })).toBe("Aceptada");
    expect(et.vista({ kind: "panel_agenda", stateId: null, lifecycleId: null }, "panel.agenda")).toBe("Agenda");
  });

  it("el vocabulario del negocio manda: claves exactas y términos", () => {
    const et = crearEtiquetador({
      lifecycles,
      vocabulario: {
        "accion:t_acordar": "Dar el visto bueno",
        "accion:lc.taller:t_cerrar": "Devolver el coche",
        "proceso:lc.taller": "Reparaciones",
        "estado:en_espera": "Listo para recoger",
        presupuesto: "valoración",
      },
    });
    expect(et.accion("lc.taller", "t_acordar")).toBe("Dar el visto bueno");
    expect(et.accion("lc.taller", "t_cerrar")).toBe("Devolver el coche");
    expect(et.accion("lc.venta", "t_cerrar")).toBe("Entregar y cobrar");
    expect(et.proceso("lc.taller")).toBe("Reparaciones");
    expect(et.estado("lc.taller", "en_espera")).toBe("Listo para recoger");
    // Término sustituido respetando la mayúscula inicial
    expect(et.accion("lc.venta", "t_aceptar")).toBe("Aceptar valoración");
    expect(et.accion("lc.venta", "t_cancelar_propuesta")).toBe("Anular valoración");
    expect(et.texto("Presupuesto listo")).toBe("Valoración listo");
  });

  it("último recurso: el identificador pasa a texto legible", () => {
    expect(humanizarId("t_iniciar_entrega")).toBe("Iniciar entrega");
    expect(humanizarId("lc.servicio_proyecto")).toBe("Servicio proyecto");
    const et = crearEtiquetador({ lifecycles });
    expect(et.accion("lc.venta", "t_hito_fase_2")).toBe("Hito fase 2");
    expect(pareceIdentificador("t_cerrar")).toBe(true);
    expect(pareceIdentificador("Entregar y cobrar")).toBe(false);
  });

  it("todos los pasos de todos los arquetipos tienen nombre escrito", () => {
    const sinNombre: string[] = [];
    for (const a of ARCHETYPES) {
      for (const t of a.lifecycle.transitions) {
        if (!ACCION_LABELS[a.id]?.[t.id]) sinNombre.push(`${a.id}.${t.id}`);
      }
      for (const s of a.lifecycle.states) {
        if (!s.label || pareceIdentificador(s.label)) sinNombre.push(`${a.id}.estado.${s.id}`);
      }
    }
    expect(sinNombre).toEqual([]);
  });
});

describe("Vocabulario desde la ficha del negocio", () => {
  it("el perfil lo valida y llega hasta las etiquetas", () => {
    const raw = JSON.parse(readFileSync(CONCESIONARIA_PROFILE_PATH, "utf8")) as Record<string, unknown>;
    const profile = validateBusinessProfile({
      ...raw,
      vocabulario: { "accion:t_aceptar": "Firmar contrato", pedido: "operación" },
    });
    const input = materializeBusinessProfile(profile, { systemIds: CONCESIONARIA_SYSTEM_IDS });
    expect(input.vocabulario).toEqual({ "accion:t_aceptar": "Firmar contrato", pedido: "operación" });
    const et = crearEtiquetador(input);
    const venta = input.lifecycles.find((l) => l.archetypeId === "venta")!;
    expect(et.accion(venta.id, "t_aceptar")).toBe("Firmar contrato");
    expect(et.accion(venta.id, "t_cancelar_aceptada")).toBe("Cancelar operación");
    expect(() => validateBusinessProfile({ ...raw, vocabulario: { "": "x" } })).toThrow();
  });
});

describe("Vigilante: ningún identificador en pantalla", () => {
  it("app principal de los 12 negocios, todos los roles, procesos y vistas", () => {
    const todas: string[] = [];
    for (const id of allBootableIds()) {
      const boot = bootProfile(id);
      const rt = AppRuntime.open(boot, { dbPath: tempDb() });
      const rows = rt.projectRows();
      for (const role of boot.roles) {
        for (const g of processGroupsForRole(boot.spec, role.id)) {
          for (const v of [...g.viewIds, ...g.panelIds]) {
            const session = resolveSession(boot, { role: role.id, group: g.id, view: v });
            for (const live of [false, true]) {
              const html = renderAppHtml({
                boot,
                session,
                ...(live ? { live: true, liveRows: rows, activeBlocks: rt.activeBlocks() } : {}),
              });
              for (const f of fugas(html)) todas.push(`${id}/${role.id}/${v}: ${f}`);
            }
          }
        }
      }
      rt.close();
    }
    expect([...new Set(todas)].slice(0, 20)).toEqual([]);
  });

  it("el modo técnico sí enseña los identificadores (y solo si se pide)", () => {
    const boot = bootProfile("p04-taller-mecanico");
    const session = resolveSession(boot, { role: "dueno" });
    const limpio = renderAppHtml({ boot, session });
    const tecnico = renderAppHtml({ boot, session: { ...session, tecnico: true } });
    expect(fugas(limpio)).toEqual([]);
    expect(textoVisible(tecnico)).toContain("UiSpec");
    expect(tecnico).toContain("Ocultar detalles técnicos");
    expect(limpio).toContain("Ver detalles técnicos");
  });

  it("fichas, clientes, catálogo, dinero y mensajes tras actuar", async () => {
    const h = await startWebServer(bootProfile("concesionaria"), { port: 0, dbPath: tempDb() });
    try {
      const rt = h.runtime;
      const sub = rt.subjects.find((s) => s.lifecycleId === "lc.venta")!;
      const r = await executeUiAction(rt, {
        actionId: "action.lc.venta.t_aceptar",
        subjectId: sub.id,
        clientRequestId: "etq-1",
        roleId: "comercial",
        parteId: "parte-demo-1",
        channel: "backoffice",
        kind: "boton",
      });
      expect(r.ok, r.flash.text).toBe(true);
      expect(fugas(`<p>${r.flash.text}</p>`)).toEqual([]);
      const role = "gerente";
      const pages = [
        `?role=${role}`,
        `?role=${role}&group=proceso.lc.venta`,
        `expedientes/${sub.id}?role=${role}`,
        `expedientes/nuevo?proceso=lc.venta&role=${role}`,
        `partes?role=${role}`,
        `partes/parte-demo-1?role=${role}`,
        `ofertas?role=${role}`,
        `dinero?role=${role}`,
        `facturas?role=${role}`,
        `empresa?role=${role}`,
        `stock?role=${role}`,
      ];
      rt.ofertas.create(rt.tenantId, "of-coche", { subtype: "bien", nombre: "Coche", precioCentimos: 100, ivaPct: 21, unidad: "ud" }, "2026-01-01T00:00:00.000Z");
      rt.configurarStock("of-coche", true, 1000);
      rt.ajustarStock("of-coche", "entrada", 3000, "Inicial", "gerente");
      pages.push(`stock/of-coche?role=${role}`);
      rt.facturas.putEmisor(rt.tenantId, { razonSocial: "Concesionaria SL", nif: "B12345674", domicilio: "C/ Mayor 1" }, "2026-01-01T00:00:00.000Z");
      const fac = rt.expedirFactura(sub.id, "gerente");
      expect(fac.ok).toBe(true);
      if (fac.ok) pages.push(`facturas/${fac.factura.id}?role=${role}`);
      for (const p of pages) {
        const res = await fetch(`${h.url}${p}`);
        expect(res.status, p).toBe(200);
        expect(fugas(await res.text()), p).toEqual([]);
      }
      // Sin sesión técnica no aparecen las herramientas internas
      const home = await (await fetch(`${h.url}?role=${role}`)).text();
      expect(home).not.toContain("data-force-panel");
      expect(home).not.toContain("data-link-devolucion");
      const tecnico = await (await fetch(`${h.url}?role=${role}&tecnico=1`)).text();
      expect(tecnico).toContain("data-force-panel");
    } finally {
      await h.close();
    }
  });
});
