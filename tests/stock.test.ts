/**
 * Paso 7 — stock: movimientos derivados de entregas / recepciones, reservas,
 * ajustes inmutables, avisos (sin bloquear) y pantallas.
 */

import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { requireArchetype } from "../archetypes/catalog.js";
import { SqliteStockStore } from "../adapters/sqlite-stock-store.js";
import { estadoStock, mueveStock, resumenStock } from "../elements/stock.js";
import { AppRuntime, bootProfile, executeUiAction, startWebServer } from "../web/index.js";

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
  const dir = mkdtempSync(join(tmpdir(), "abs-stock-"));
  dirs.push(dir);
  return join(dir, "db.sqlite");
}

describe("Cuándo se mueve la mercancía", () => {
  const venta = requireArchetype("venta").lifecycle;
  const servicio = requireArchetype("servicio_proyecto").lifecycle;
  const susc = requireArchetype("suscripcion").lifecycle;
  const t = (lc: typeof venta, id: string) => lc.transitions.find((x) => x.id === id)!;
  it("venta: al entregar (t_cerrar), no al aceptar ni al preparar", () => {
    expect(mueveStock("venta", venta, t(venta, "t_cerrar"))).toBe(true);
    expect(mueveStock("venta", venta, t(venta, "t_aceptar"))).toBe(false);
    expect(mueveStock("venta", venta, t(venta, "t_iniciar_entrega"))).toBe(false);
  });
  it("servicio: al cerrar con éxito; suscripción: nunca", () => {
    expect(mueveStock("servicio_proyecto", servicio, t(servicio, "t_cerrar"))).toBe(true);
    expect(mueveStock("servicio_proyecto", servicio, t(servicio, "t_fallar"))).toBe(false);
    expect(mueveStock("suscripcion", susc, t(susc, "t_cerrar"))).toBe(false);
  });
});

describe("Resumen", () => {
  it("stock, reservado, en camino, disponible y estado", () => {
    const linea = (ofertaId: string, q: number) => ({ ofertaId, descripcion: "x", cantidadMilesimas: q, precioCentimos: 1, ivaPct: 21 });
    const r = resumenStock({
      controlados: new Map([["a", { minimo: 2000 }], ["b", { minimo: 0 }]]),
      movimientos: [
        { ofertaId: "a", delta: 5000, at: "1", origen: "ajuste" },
        { ofertaId: "a", delta: -1000, at: "2", origen: "expediente" },
        { ofertaId: "x", delta: 99, at: "3", origen: "ajuste" },
      ],
      pendientes: [
        { direccion: "entra", lineas: [linea("a", 2000), linea("x", 5)] },
        { direccion: "sale", lineas: [linea("a", 10000)] },
      ],
    });
    expect(r).toEqual([
      { ofertaId: "a", stock: 4000, reservado: 2000, enCamino: 10000, disponible: 2000, minimo: 2000, estado: "bajo" },
      { ofertaId: "b", stock: 0, reservado: 0, enCamino: 0, disponible: 0, minimo: 0, estado: "agotado" },
    ]);
    expect(estadoStock(3000, 2000)).toBe("ok");
  });
});

describe("Ajustes inmutables", () => {
  it("la base de datos impide modificar o borrar ajustes", () => {
    const path = tempDb();
    const s = new SqliteStockStore(path);
    s.configurar("t", { ofertaId: "a", control: true, minimo: 0 }, "2026-01-01");
    s.ajustar("t", { ofertaId: "a", delta: 5000, motivo: "Inicial", actorId: "ana", at: "2026-01-01" });
    s.close();
    const raw = new Database(path);
    expect(() => raw.prepare("UPDATE stock_ajustes SET delta = 1").run()).toThrow(/no se modifican/);
    expect(() => raw.prepare("DELETE FROM stock_ajustes").run()).toThrow(/no se borran/);
    raw.close();
  });
});

describe("Runtime: recorrido en el taller", () => {
  const SERV = "lc.servicio_proyecto";
  const COMPRAS = "lc.compras";
  let n = 0;
  async function pasos(rt: AppRuntime, id: string, lc: string, steps: string[]) {
    for (const s of steps) {
      const r = await executeUiAction(rt, {
        actionId: `action.${lc}.${s}`,
        subjectId: id,
        clientRequestId: `st-${n++}`,
        roleId: "dueno",
        parteId: "parte-demo-1",
        channel: "backoffice",
        kind: "boton",
      });
      if (!r.ok) throw new Error(`${s}: ${r.flash.text}`);
    }
  }
  function crear(rt: AppRuntime, lc: string, lineas: { ofertaId?: string; descripcion?: string; cantidadMilesimas: number; precioCentimos?: number; ivaPct?: number }[]) {
    const r = rt.crearTransaccion({ lifecycleId: lc, parteId: "parte-demo-1", fecha: "2026-09-01", lineas }, "ana");
    if (!r.ok) throw new Error(r.errors.join());
    return r.id;
  }
  const stockDe = (rt: AppRuntime, id: string) => rt.stock().productos.find((p) => p.ofertaId === id)!;

  it("inventario → trabajo que usa piezas → compra → recuento", async () => {
    const rt = AppRuntime.open(bootProfile("p04-taller-mecanico"), { dbPath: tempDb() });
    const T = rt.tenantId;
    rt.ofertas.create(T, "pastillas", { subtype: "bien", nombre: "Pastillas de freno", precioCentimos: 4590, ivaPct: 21, unidad: "juego" }, "2026-01-01T00:00:00Z");
    rt.ofertas.create(T, "aceite", { subtype: "bien", nombre: "Aceite 5W30", precioCentimos: 900, ivaPct: 21, unidad: "l" }, "2026-01-01T00:00:00Z");

    expect(rt.ajustarStock("pastillas", "entrada", 5000, "Inicial", "ana")).toEqual({
      ok: false,
      error: "Ese producto no tiene activado el control de stock.",
    });
    expect(rt.configurarStock("pastillas", true, 2000)).toEqual({ ok: true });
    expect(rt.ajustarStock("pastillas", "entrada", 5000, " ", "ana").ok).toBe(false);
    expect(rt.ajustarStock("pastillas", "entrada", 5000, "Inventario inicial", "ana")).toEqual({ ok: true, delta: 5000 });
    expect(stockDe(rt, "pastillas")).toMatchObject({ stock: 5000, disponible: 5000, estado: "ok" });

    // Trabajo con 2 juegos + aceite (no controlado) + mano de obra
    const trabajo = crear(rt, SERV, [
      { ofertaId: "pastillas", cantidadMilesimas: 2000 },
      { ofertaId: "aceite", cantidadMilesimas: 4000 },
      { descripcion: "Mano de obra", cantidadMilesimas: 1000, precioCentimos: 4000, ivaPct: 21 },
    ]);
    expect(rt.faltasStock(trabajo)).toEqual([]);
    await pasos(rt, trabajo, SERV, ["t_acordar"]);
    expect(stockDe(rt, "pastillas")).toMatchObject({ stock: 5000, reservado: 2000, disponible: 3000, estado: "ok" });
    await pasos(rt, trabajo, SERV, ["t_ejecutar", "t_presentar", "t_cerrar"]);
    expect(stockDe(rt, "pastillas")).toMatchObject({ stock: 3000, reservado: 0, disponible: 3000 });
    expect(rt.stock().productos.map((p) => p.ofertaId)).toEqual(["pastillas"]);

    // Otro presupuesto pide más de lo que hay: avisa, pero no bloquea
    const grande = crear(rt, SERV, [{ ofertaId: "pastillas", cantidadMilesimas: 4000 }]);
    expect(rt.faltasStock(grande)).toEqual([{ ofertaId: "pastillas", necesita: 4000, disponible: 3000 }]);
    await pasos(rt, grande, SERV, ["t_acordar"]);
    expect(stockDe(rt, "pastillas")).toMatchObject({ disponible: -1000, estado: "agotado" });

    // Compra de 10 al proveedor: en camino hasta recibir
    const compra = crear(rt, COMPRAS, [{ ofertaId: "pastillas", cantidadMilesimas: 10000, precioCentimos: 2000 }]);
    await pasos(rt, compra, COMPRAS, ["t_aceptar"]);
    expect(stockDe(rt, "pastillas")).toMatchObject({ enCamino: 10000, stock: 3000 });
    await pasos(rt, compra, COMPRAS, ["t_iniciar_entrega", "t_cerrar"]);
    expect(stockDe(rt, "pastillas")).toMatchObject({ enCamino: 0, stock: 13000, disponible: 9000 });
    expect(rt.faltasStock(grande)).toEqual([]);

    // Recuento: hay 12 de verdad → ajuste de −1
    expect(rt.ajustarStock("pastillas", "recuento", 12000, "Inventario de septiembre", "ana")).toEqual({ ok: true, delta: -1000 });
    expect(rt.ajustarStock("pastillas", "recuento", 12000, "Otra vez", "ana")).toEqual({ ok: true, delta: 0 });
    expect(stockDe(rt, "pastillas").stock).toBe(12000);

    const movs = rt.stock().movimientos.filter((m) => m.ofertaId === "pastillas").map((m) => [m.origen, m.delta]);
    expect(movs).toEqual([
      ["ajuste", 5000],
      ["expediente", -2000],
      ["expediente", 10000],
      ["ajuste", -1000],
    ]);

    // Dejar de controlar: desaparece del resumen
    rt.configurarStock("pastillas", false, 0);
    expect(rt.stock().productos).toEqual([]);
    rt.close();
  });
});

describe("Web: /stock", () => {
  function post(url: string, body: Record<string, string>) {
    return fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  }

  it("activar control, ajustar, ver aviso en el expediente", async () => {
    const h = await startWebServer(bootProfile("p04-taller-mecanico"), { port: 0, dbPath: tempDb() });
    try {
      const rt = h.runtime;
      rt.ofertas.create(rt.tenantId, "pastillas", { subtype: "bien", nombre: "Pastillas de freno", precioCentimos: 4590, ivaPct: 21, unidad: "juego" }, "2026-01-01T00:00:00Z");
      let lista = await (await fetch(`${h.url}stock?role=dueno`)).text();
      expect(lista).toContain("data-stock-vacio");
      expect(lista).toContain("data-stock-alta");

      expect((await post(`${h.url}stock`, { roleId: "dueno", ofertaId: "pastillas", minimo: "abc" })).status).toBe(422);
      expect((await post(`${h.url}stock`, { roleId: "dueno", ofertaId: "pastillas", minimo: "2" })).status).toBe(303);
      expect((await post(`${h.url}stock/pastillas/ajuste`, { roleId: "dueno", tipo: "entrada", cantidad: "3", motivo: "" })).status).toBe(422);
      expect((await post(`${h.url}stock/pastillas/ajuste`, { roleId: "dueno", tipo: "entrada", cantidad: "3", motivo: "Inventario inicial" })).status).toBe(303);

      lista = await (await fetch(`${h.url}stock?role=dueno`)).text();
      expect(lista).toContain('data-stock-producto="pastillas" data-estado="ok"');
      const ficha = await (await fetch(`${h.url}stock/pastillas?role=dueno`)).text();
      expect(ficha).toContain("Inventario inicial");
      expect(ficha).toContain("+3 juego");

      const r = rt.crearTransaccion(
        { lifecycleId: "lc.servicio_proyecto", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: [{ ofertaId: "pastillas", cantidadMilesimas: 5000 }] },
        "ana",
      );
      if (!r.ok) throw new Error();
      const exp = await (await fetch(`${h.url}expedientes/${r.id}?role=dueno`)).text();
      expect(exp).toContain("data-falta-stock");
      expect(exp).toContain("hacen falta 5 juego y hay 3 disponibles");

      const oferta = await (await fetch(`${h.url}ofertas/pastillas?role=dueno`)).text();
      expect(oferta).toContain("data-ver-stock");
      const home = await (await fetch(`${h.url}?role=dueno`)).text();
      expect(home).toContain('data-maestros="stock"');
      expect((await fetch(`${h.url}stock?role=cliente`)).status).toBe(403);
      expect((await fetch(`${h.url}stock/no-existe?role=dueno`)).status).toBe(404);
    } finally {
      await h.close();
    }
  });
});
