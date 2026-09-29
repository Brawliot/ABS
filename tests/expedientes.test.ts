/**
 * Transacción viva (gramática 2.0.0): eventos `alta` / `datos`, líneas,
 * totales, runtime persistente y pantallas /expedientes.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteEventStore } from "../adapters/sqlite-event-store.js";
import { deriveState } from "../core/derivation.js";
import type { AltaEvent, DatosEvent, LineaDatos, TransitionEvent } from "../core/events.js";
import { EventKinds } from "../core/grammar.js";
import {
  calcularTotales,
  diferencias,
  formatCantidad,
  parseCantidadMilesimas,
  proyectarTransaccion,
  validarDatos,
} from "../elements/transaccion.js";
import {
  AppRuntime,
  bootProfile,
  executeUiAction,
  startWebServer,
} from "../web/index.js";
import { parseExpedienteForm } from "../web/expedientes.js";

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
  const dir = mkdtempSync(join(tmpdir(), "abs-exp-"));
  dirs.push(dir);
  return join(dir, "db.sqlite");
}

const PROFILE = "p04-taller-mecanico";
const LC = "lc.compras";

function linea(p: Partial<LineaDatos> = {}): LineaDatos {
  return {
    descripcion: "Cambio de aceite",
    cantidadMilesimas: 1000,
    precioCentimos: 6000,
    ivaPct: 21,
    ...p,
  };
}

const EV = {
  occurredAt: "2026-06-01T10:00:00.000Z",
  actorId: "ana",
  actorKind: "humano" as const,
  evidence: { kind: "sistema" as const, reference: "x", recordedAt: "2026-06-01T10:00:00.000Z" },
};

describe("Gramática 2.0.0", () => {
  it("incluye los tipos de evento alta y datos", () => {
    expect(EventKinds).toContain("alta");
    expect(EventKinds).toContain("datos");
  });
});

describe("Cantidades y totales", () => {
  it.each([
    ["1", 1000],
    ["1,5", 1500],
    ["2.25", 2250],
    ["0,125", 125],
  ])("cantidad %s → %i milésimas", (raw, v) => {
    expect(parseCantidadMilesimas(raw)).toBe(v);
  });

  it.each(["0", "-1", "abc", "1,2345", ""])("rechaza cantidad %j", (raw) => {
    expect(parseCantidadMilesimas(raw)).toBeNull();
  });

  it("formatea cantidades", () => {
    expect(formatCantidad(1500)).toBe("1,5");
    expect(formatCantidad(2000)).toBe("2");
  });

  it("calcula base, IVA por tipo y total al céntimo, redondeando por línea", () => {
    const t = calcularTotales([
      linea(), // 60,00 + 12,60
      linea({ descripcion: "Pastillas", cantidadMilesimas: 2000, precioCentimos: 4590 }), // 91,80 + 19,28
      linea({ descripcion: "Libro", precioCentimos: 1999, ivaPct: 4 }), // 19,99 + 0,80
      linea({ descripcion: "Horas", cantidadMilesimas: 1500, precioCentimos: 3333 }), // 49,995→50,00 + 10,50
    ]);
    expect(t.lineas.map((l) => l.base)).toEqual([6000, 9180, 1999, 5000]);
    expect(t.base).toBe(22179);
    expect(t.ivaPorTipo).toEqual({ "21": 1260 + 1928 + 1050, "4": 80 });
    expect(t.iva).toBe(4318);
    expect(t.total).toBe(t.base + t.iva);
  });

  it("valida los datos con mensajes en castellano", () => {
    const errors = validarDatos({
      parteId: "",
      fecha: "2026-02-30",
      lineas: [linea({ descripcion: " ", cantidadMilesimas: 0, precioCentimos: -1, ivaPct: 7 })],
    });
    expect(errors).toEqual([
      "Elige un cliente o proveedor.",
      "La fecha no es válida.",
      "Línea 1: falta la descripción.",
      "Línea 1: la cantidad debe ser mayor que 0.",
      "Línea 1: el precio no es válido.",
      "Línea 1: el IVA debe ser 0, 4, 10 o 21 %.",
    ]);
    expect(validarDatos({ parteId: "p", fecha: "2026-06-01", lineas: [] })).toContain(
      "Añade al menos una línea.",
    );
  });
});

describe("Proyección de datos y estado", () => {
  const alta: AltaEvent = {
    ...EV,
    id: "alta-tx1",
    kind: "alta",
    subjectId: "tx1",
    lifecycleId: "lc",
    datos: { parteId: "p1", fecha: "2026-06-01", referencia: "1234-ABC", lineas: [linea()] },
  };
  const cambio: DatosEvent = {
    ...EV,
    id: "d1",
    kind: "datos",
    subjectId: "tx1",
    actorId: "luis",
    cambios: { notas: "Cliente con prisa", referencia: "" },
  };

  it("reproduce alta + datos (\"\" borra un campo opcional)", () => {
    const p = proyectarTransaccion([alta, cambio])!;
    expect(p.datos).toEqual({
      parteId: "p1",
      fecha: "2026-06-01",
      notas: "Cliente con prisa",
      lineas: [linea()],
    });
    expect(p.cambios.map((c) => [c.kind, c.actorId])).toEqual([
      ["alta", "ana"],
      ["datos", "luis"],
    ]);
    expect(proyectarTransaccion([cambio])).toBeUndefined();
  });

  it("diferencias solo devuelve lo que cambia", () => {
    const antes = alta.datos;
    expect(diferencias(antes, antes)).toEqual({});
    expect(diferencias(antes, { ...antes, referencia: undefined, notas: "x" } as never)).toEqual({
      referencia: "",
      notas: "x",
    });
  });

  it("alta y datos no cambian el estado derivado", () => {
    const boot = bootProfile(PROFILE);
    const slice = boot.input.lifecycles.find((l) => l.id === LC)!;
    const inicial = slice.lifecycle.states.find((s) => s.kind === "inicial")!.id;
    expect(deriveState(slice.lifecycle, [alta, cambio]).currentStateId).toBe(inicial);
  });
});

describe("Runtime: expedientes persistentes", () => {
  function open(dbPath: string) {
    return AppRuntime.open(bootProfile(PROFILE), { dbPath });
  }

  function crearOferta(rt: AppRuntime, id: string, precio: number) {
    rt.ofertas.create(
      rt.tenantId,
      id,
      { subtype: "bien", nombre: "Pastillas de freno", precioCentimos: precio, ivaPct: 21, unidad: "juego" },
      "2026-01-01T00:00:00.000Z",
    );
  }

  it("un negocio nuevo registra las altas demo una sola vez", () => {
    const dbPath = tempDb();
    const r1 = open(dbPath);
    const n = r1.subjects.length;
    expect(n).toBeGreaterThan(0);
    const altas = r1.store.all().filter((e) => e.kind === "alta").length;
    expect(altas).toBe(n);
    const row = r1.projectRows().find((r) => r.id === r1.subjects[0]!.id)!;
    expect(row.detalle).toMatchObject({ cliente: "Cliente demo A", total: "121,00 €" });
    r1.close();

    const r2 = open(dbPath);
    expect(r2.subjects.map((s) => s.id)).toEqual(r1.subjects.map((s) => s.id));
    expect(r2.store.all().filter((e) => e.kind === "alta")).toHaveLength(n);
    r2.close();
  });

  it("una base de datos anterior (solo transiciones) conserva su estado", async () => {
    const dbPath = tempDb();
    const r1 = open(dbPath);
    const subject = r1.subjects.find((s) => s.lifecycleId === LC)!;
    const ok = await executeUiAction(r1, {
      actionId: `action.${LC}.t_aceptar`,
      subjectId: subject.id,
      clientRequestId: "legacy-1",
      roleId: "dueno",
      parteId: subject.parteId,
      channel: "backoffice",
      kind: "boton",
    });
    expect(ok.ok).toBe(true);
    const transitions = r1.store.all().filter((e) => e.kind === "transicion");
    r1.close();

    // Simula la base de datos antigua: mismas transiciones, sin altas
    const legacyPath = tempDb();
    const legacy = new SqliteEventStore(legacyPath);
    for (const t of transitions) legacy.append(t as TransitionEvent);
    legacy.close();

    const r2 = open(legacyPath);
    expect(r2.subjects.some((s) => s.id === subject.id)).toBe(true);
    expect(r2.estadoDe(subject.id)?.id).toBe("aceptada");
    expect(r2.datosDe(subject.id)).toBeDefined();
    r2.close();
  });

  it("crea con líneas del catálogo (copia precio y versión) y líneas libres", () => {
    const rt = open(tempDb());
    crearOferta(rt, "of-1", 4590);
    const r = rt.crearTransaccion(
      {
        lifecycleId: LC,
        parteId: "parte-demo-1",
        fecha: "2026-06-02",
        referencia: " 1234-ABC ",
        lineas: [
          { ofertaId: "of-1", cantidadMilesimas: 2000 },
          { descripcion: "Mano de obra", cantidadMilesimas: 1500, precioCentimos: 4000, ivaPct: 21 },
        ],
      },
      "ana",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tx = rt.datosDe(r.id)!;
    expect(tx.datos.referencia).toBe("1234-ABC");
    expect(tx.datos.lineas[0]).toEqual({
      ofertaId: "of-1",
      ofertaVersion: 1,
      descripcion: "Pastillas de freno",
      cantidadMilesimas: 2000,
      precioCentimos: 4590,
      ivaPct: 21,
    });
    expect(calcularTotales(tx.datos.lineas).total).toBe(9180 + 1928 + 6000 + 1260);

    // Subir el precio en el catálogo no cambia el expediente ya creado
    rt.ofertas.update(
      rt.tenantId,
      "of-1",
      { subtype: "bien", nombre: "Pastillas de freno", precioCentimos: 5000, ivaPct: 21, unidad: "juego" },
      "2026-06-03T00:00:00.000Z",
    );
    expect(rt.datosDe(r.id)!.datos.lineas[0]!.precioCentimos).toBe(4590);
    expect(rt.subjects.some((s) => s.id === r.id)).toBe(true);
    rt.close();
  });

  it("rechaza cliente inexistente, oferta desconocida y línea libre sin precio", () => {
    const rt = open(tempDb());
    const r = rt.crearTransaccion(
      {
        lifecycleId: LC,
        parteId: "parte-que-no-existe",
        fecha: "2026-06-02",
        lineas: [
          { ofertaId: "nada", cantidadMilesimas: 1000 },
          { descripcion: "Algo", cantidadMilesimas: 1000 },
        ],
      },
      "ana",
    );
    expect(r).toEqual({
      ok: false,
      errors: [
        "El cliente o proveedor elegido no existe.",
        "Línea 1: esa oferta no está en el catálogo.",
        "Línea 2: indica el precio.",
        "Añade al menos una línea.",
      ],
    });
    expect(rt.crearTransaccion({ lifecycleId: "no", parteId: "", fecha: "", lineas: [] }, "ana")).toEqual({
      ok: false,
      errors: ["Ese proceso no existe."],
    });
    rt.close();
  });

  it("edita solo en estado inicial, sin eventos vacíos, y conserva la versión de la oferta", async () => {
    const rt = open(tempDb());
    crearOferta(rt, "of-1", 4590);
    const r = rt.crearTransaccion(
      { lifecycleId: LC, parteId: "parte-demo-1", fecha: "2026-06-02", lineas: [{ ofertaId: "of-1", cantidadMilesimas: 1000 }] },
      "ana",
    );
    if (!r.ok) throw new Error(r.errors.join());
    rt.ofertas.update(
      rt.tenantId,
      "of-1",
      { subtype: "bien", nombre: "Pastillas de freno", precioCentimos: 5000, ivaPct: 21, unidad: "juego" },
      "2026-06-03T00:00:00.000Z",
    );

    const same = rt.editarTransaccion(
      r.id,
      { lifecycleId: LC, parteId: "parte-demo-1", fecha: "2026-06-02", lineas: [{ ofertaId: "of-1", cantidadMilesimas: 1000, precioCentimos: 4590 }] },
      "luis",
    );
    expect(same).toEqual({ ok: true, changed: false });
    expect(rt.store.getBySubject(r.id).filter((e) => e.kind === "datos")).toHaveLength(0);

    const edit = rt.editarTransaccion(
      r.id,
      {
        lifecycleId: LC,
        parteId: "parte-demo-2",
        fecha: "2026-06-02",
        notas: "Revisar también luces",
        lineas: [{ ofertaId: "of-1", cantidadMilesimas: 2000, precioCentimos: 4590 }],
      },
      "luis",
    );
    expect(edit).toEqual({ ok: true, changed: true });
    const tx = rt.datosDe(r.id)!;
    expect(tx.datos.parteId).toBe("parte-demo-2");
    expect(tx.datos.lineas[0]).toMatchObject({ ofertaVersion: 1, cantidadMilesimas: 2000, precioCentimos: 4590 });
    const datosEv = rt.store.getBySubject(r.id).find((e) => e.kind === "datos") as DatosEvent;
    expect(Object.keys(datosEv.cambios).sort()).toEqual(["lineas", "notas", "parteId"]);

    const adv = await executeUiAction(rt, {
      actionId: `action.${LC}.t_aceptar`,
      subjectId: r.id,
      clientRequestId: "acc-1",
      roleId: "dueno",
      parteId: "parte-demo-2",
      channel: "backoffice",
      kind: "boton",
    });
    expect(adv.ok).toBe(true);
    expect(rt.puedeEditarDatos(r.id)).toBe(false);
    const late = rt.editarTransaccion(
      r.id,
      { lifecycleId: LC, parteId: "parte-demo-2", fecha: "2026-06-02", lineas: [{ descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 1 }] },
      "luis",
    );
    expect(late.ok).toBe(false);
    rt.close();
  });

  it("los eventos no llevan datos personales de la Parte", () => {
    const rt = open(tempDb());
    rt.partes.put(rt.tenantId, "p-juan", { displayName: "Juan García", phone: "600111222" }, "2026-01-01T00:00:00.000Z", "cliente");
    const r = rt.crearTransaccion(
      { lifecycleId: LC, parteId: "p-juan", fecha: "2026-06-02", lineas: [{ descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 100 }] },
      "ana",
    );
    if (!r.ok) throw new Error(r.errors.join());
    const raw = JSON.stringify(rt.store.getBySubject(r.id));
    expect(raw).not.toContain("Juan");
    expect(raw).not.toContain("600111222");
    expect(rt.projectRows().find((row) => row.id === r.id)?.detalle?.cliente).toBe("Juan García");
    rt.close();
  });
});

describe("Formulario de expediente", () => {
  it("ignora filas vacías, cantidad vacía = 1 y valida importes", () => {
    const ok = parseExpedienteForm(
      {
        numLineas: "4",
        clienteId: "p1",
        fecha: "2026-06-02",
        l0_oferta: "of-1",
        l0_cant: "",
        l1_desc: "Mano de obra",
        l1_cant: "1,5",
        l1_precio: "40",
        l1_iva: "21",
        l3_desc: "",
      },
      LC,
    );
    expect(ok).toEqual({
      ok: true,
      value: {
        lifecycleId: LC,
        parteId: "p1",
        fecha: "2026-06-02",
        referencia: "",
        notas: "",
        lineas: [
          { ofertaId: "of-1", cantidadMilesimas: 1000 },
          { descripcion: "Mano de obra", cantidadMilesimas: 1500, precioCentimos: 4000, ivaPct: 21 },
        ],
      },
    });
    const bad = parseExpedienteForm({ numLineas: "1", l0_desc: "X", l0_cant: "0", l0_precio: "1" }, LC);
    expect(bad).toEqual({ ok: false, errors: ["Línea 1: la cantidad no es válida (ejemplo: 1 o 2,5)."] });
  });
});

describe("Web: /expedientes", () => {
  function post(url: string, body: Record<string, string>) {
    return fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  }

  it("alta desde el formulario → ficha con total → tablero con enlace → edición → reinicio", async () => {
    const dbPath = tempDb();
    const h1 = await startWebServer(bootProfile(PROFILE), { port: 0, dbPath });
    let id = "";
    try {
      const home = await (await fetch(`${h1.url}?role=dueno`)).text();
      expect(home).toContain(`data-nuevo-expediente="${LC}"`);

      const form = await fetch(`${h1.url}expedientes/nuevo?proceso=${LC}&role=dueno`);
      expect(form.status).toBe(200);
      expect(await form.text()).toContain("data-expediente-form");

      const invalid = await post(`${h1.url}expedientes`, { roleId: "dueno", proceso: LC, numLineas: "5", clienteId: "", fecha: "2026-06-02" });
      expect(invalid.status).toBe(422);
      const invalidHtml = await invalid.text();
      expect(invalidHtml).toContain("Elige un cliente o proveedor.");
      expect(invalidHtml).toContain("Añade al menos una línea.");

      const mas = await post(`${h1.url}expedientes`, { roleId: "dueno", proceso: LC, numLineas: "5", accion: "mas" });
      expect(mas.status).toBe(200);
      expect((await mas.text()).match(/data-linea=/g)).toHaveLength(8);

      const created = await post(`${h1.url}expedientes`, {
        roleId: "dueno",
        proceso: LC,
        numLineas: "5",
        clienteId: "parte-demo-1",
        fecha: "2026-06-02",
        referencia: "1234-ABC",
        l0_desc: "Mano de obra <urgente>",
        l0_cant: "2",
        l0_precio: "40,00",
        l0_iva: "21",
        accion: "guardar",
        clientRequestId: "web-1",
      });
      expect(created.status).toBe(303);
      const loc = created.headers.get("location")!;
      id = decodeURIComponent(loc.split("?")[0]!.slice("/expedientes/".length));
      expect(id).toMatch(/^tx-/);

      const again = await post(`${h1.url}expedientes`, {
        roleId: "dueno", proceso: LC, numLineas: "5", clienteId: "parte-demo-1", fecha: "2026-06-02",
        l0_desc: "Mano de obra", l0_cant: "2", l0_precio: "40", clientRequestId: "web-1",
      });
      expect(again.headers.get("location")!.split("?")[0]).toBe(loc.split("?")[0]);

      const ficha = await (await fetch(`${h1.url}expedientes/${id}?role=dueno`)).text();
      expect(ficha).toContain("Mano de obra &lt;urgente&gt;");
      expect(ficha).toContain("96,80 €");
      expect(ficha).toContain("Cliente demo A");
      expect(ficha).toContain("data-editar-expediente");
      expect(ficha).toContain("data-historial");

      const board = await (await fetch(`${h1.url}?role=dueno&group=proceso.${LC}`)).text();
      expect(board).toContain(`href="/expedientes/${id}?`);
      expect(board).toContain("1234-ABC");
      expect(board).toContain("+ Nuevo: Compras a proveedor");

      // Cada tablero solo enseña expedientes de su proceso
      const otro = h1.runtime.subjects.find((s) => s.lifecycleId !== LC)!;
      const otroBoard = await (
        await fetch(`${h1.url}?role=dueno&group=proceso.${otro.lifecycleId}&view=view.${otro.lifecycleId}.propuesta`)
      ).text();
      expect(otroBoard).not.toContain(`data-row-id="${id}"`);

      const edited = await post(`${h1.url}expedientes/${id}`, {
        roleId: "dueno",
        numLineas: "4",
        clienteId: "parte-demo-2",
        fecha: "2026-06-02",
        referencia: "1234-ABC",
        l0_desc: "Mano de obra",
        l0_cant: "3",
        l0_precio: "40",
        l0_iva: "21",
        accion: "guardar",
      });
      expect(edited.status).toBe(303);
    } finally {
      await h1.close();
    }

    const h2 = await startWebServer(bootProfile(PROFILE), { port: 0, dbPath });
    try {
      const ficha = await (await fetch(`${h2.url}expedientes/${id}?role=dueno`)).text();
      expect(ficha).toContain("Cliente demo B");
      expect(ficha).toContain("145,20 €");
      expect(ficha).toContain("Datos cambiados: cliente, líneas");
      expect((await fetch(`${h2.url}expedientes/no-existe?role=dueno`)).status).toBe(404);
    } finally {
      await h2.close();
    }
  });

  it("el portal de cliente no puede crear ni ver expedientes por aquí", async () => {
    const h = await startWebServer(bootProfile(PROFILE), { port: 0, dbPath: tempDb() });
    try {
      const before = h.runtime.subjects.length;
      expect((await fetch(`${h.url}expedientes/nuevo?proceso=${LC}&role=cliente`)).status).toBe(403);
      const r = await post(`${h.url}expedientes`, {
        roleId: "cliente", proceso: LC, numLineas: "1", clienteId: "parte-demo-1", fecha: "2026-06-02",
        l0_desc: "X", l0_precio: "1",
      });
      expect(r.status).toBe(403);
      expect(h.runtime.subjects.length).toBe(before);
      const home = await (await fetch(`${h.url}?role=cliente`)).text();
      expect(home).not.toContain("data-nuevo-expediente");
    } finally {
      await h.close();
    }
  });
});
