/**
 * Paso 6 — facturas: NIF, tipo (completa / simplificada), desglose de IVA,
 * numeración correlativa, inmutabilidad, huella encadenada, rectificativas
 * y pantallas.
 */

import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteFacturaStore, type FacturaBorrador } from "../adapters/sqlite-factura-store.js";
import type { LineaDatos } from "../core/events.js";
import {
  decidirTipo,
  desgloseIva,
  nifValido,
  normalizarNif,
  verificarCadena,
} from "../elements/factura.js";
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
  const dir = mkdtempSync(join(tmpdir(), "abs-fac-"));
  dirs.push(dir);
  return join(dir, "db.sqlite");
}

const EMISOR = { razonSocial: "Talleres Paco SL", nif: "B12345674", domicilio: "C/ Mayor 1, 28001 Madrid" };
const linea = (p: Partial<LineaDatos> = {}): LineaDatos => ({
  descripcion: "Revisión",
  cantidadMilesimas: 1000,
  precioCentimos: 10000,
  ivaPct: 21,
  ...p,
});
const ANIO = Number(
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric" }).format(new Date()),
);

describe("NIF", () => {
  it.each(["12345678Z", "12.345.678-z", "X1234567L", "B12345674", "Q2826000H"])("válido %s", (n) => {
    expect(nifValido(n)).toBe(true);
  });
  it.each(["12345678A", "B12345675", "X1234567A", "ABC", ""])("inválido %j", (n) => {
    expect(nifValido(n)).toBe(false);
  });
  it("normaliza", () => {
    expect(normalizarNif(" 12.345.678-z ")).toBe("12345678Z");
  });
});

describe("Tipo y desglose", () => {
  it("completa con NIF y dirección; si no, simplificada hasta 400 €", () => {
    const cliente = { nombre: "Juan", nif: "12345678Z", domicilio: "C/ Luna 2" };
    expect(decidirTipo(cliente, 1_000_000)).toEqual({ ok: true, tipo: "completa" });
    expect(decidirTipo({ nombre: "Juan" }, 40_000)).toEqual({ ok: true, tipo: "simplificada" });
    expect(decidirTipo({ nombre: "Juan", nif: "12345678A", domicilio: "x" }, 100)).toEqual({ ok: true, tipo: "simplificada" });
    const no = decidirTipo(undefined, 40_001);
    expect(no.ok).toBe(false);
  });

  it("IVA por tipo sobre la suma de bases", () => {
    // 3 × 0,33 € al 21 %: por línea saldría 0,07×3 = 0,21; por tipo 0,99×21 % = 0,2079 → 0,21
    const d = desgloseIva([
      linea({ precioCentimos: 33 }),
      linea({ precioCentimos: 33 }),
      linea({ precioCentimos: 33 }),
      linea({ precioCentimos: 1000, ivaPct: 10 }),
    ]);
    expect(d.desglose).toEqual([
      { tipo: 21, base: 99, cuota: 21 },
      { tipo: 10, base: 1000, cuota: 100 },
    ]);
    expect(d.total).toBe(99 + 21 + 1000 + 100);
  });
});

describe("Almacén de facturas", () => {
  const borrador = (serie: "F" | "T" | "R", fecha = "2026-09-10"): FacturaBorrador => {
    const d = desgloseIva([linea()]);
    return {
      tenantId: "t",
      serie,
      tipo: serie === "F" ? "completa" : serie === "T" ? "simplificada" : "rectificativa",
      expedienteId: "tx-1",
      parteId: "p1",
      fechaExpedicion: fecha,
      emisor: EMISOR,
      ...(serie === "F" ? { receptor: { nombre: "Juan García", nif: "12345678Z", domicilio: "C/ Luna 2" } } : {}),
      lineas: [linea()],
      desglose: d.desglose,
      base: d.base,
      iva: d.iva,
      total: d.total,
      expedidaEn: `${fecha}T10:00:00.000Z`,
      expedidaPor: "ana",
    };
  };

  it("numera por serie y año, sin huecos, y encadena huellas", () => {
    const path = tempDb();
    const s = new SqliteFacturaStore(path);
    expect(s.expedir("t", borrador("F")).codigo).toBe("F2026-0001");
    expect(s.expedir("t", borrador("F")).codigo).toBe("F2026-0002");
    expect(s.expedir("t", borrador("T")).codigo).toBe("T2026-0001");
    expect(s.expedir("t", borrador("F", "2027-01-02")).codigo).toBe("F2027-0001");
    expect(s.expedir("otro", borrador("F")).codigo).toBe("F2026-0001");
    const todas = s.list("t");
    expect(todas.map((f) => f.huellaAnterior === "" ? "" : "enc")).toEqual(["", "enc", "enc", "enc"]);
    expect(verificarCadena(todas)).toEqual({ ok: true });
    // Alterar cualquier dato rompe la cadena
    const alterada = todas.map((f, i) => (i === 1 ? { ...f, total: f.total + 1 } : f));
    expect(verificarCadena(alterada)).toEqual({ ok: false, codigo: "F2026-0002" });
    s.close();
  });

  it("la base de datos impide modificar o borrar facturas", () => {
    const path = tempDb();
    const s = new SqliteFacturaStore(path);
    s.expedir("t", borrador("F"));
    s.close();
    const raw = new Database(path);
    expect(() => raw.prepare("UPDATE facturas SET numero = 99").run()).toThrow(/no se modifican/);
    expect(() => raw.prepare("DELETE FROM facturas").run()).toThrow(/no se borran/);
    raw.close();
  });

  it("los datos del cliente van cifrados y se recuperan al leer", () => {
    const path = tempDb();
    const s = new SqliteFacturaStore(path);
    const f = s.expedir("t", borrador("F"));
    s.close();
    expect(readFileSync(path).includes(Buffer.from("Juan García"))).toBe(false);
    const s2 = new SqliteFacturaStore(path);
    expect(s2.get("t", f.id)?.receptor).toEqual({ nombre: "Juan García", nif: "12345678Z", domicilio: "C/ Luna 2" });
    expect(verificarCadena(s2.list("t"))).toEqual({ ok: true });
    s2.close();
  });
});

describe("Runtime: expedir, rectificar y volver a facturar", () => {
  const LC = "lc.servicio_proyecto";
  async function aceptar(rt: AppRuntime, id: string) {
    const r = await executeUiAction(rt, {
      actionId: `action.${LC}.t_acordar`,
      subjectId: id,
      clientRequestId: `acc-${id}`,
      roleId: "dueno",
      parteId: "parte-demo-1",
      channel: "backoffice",
      kind: "boton",
    });
    if (!r.ok) throw new Error(r.flash.text);
  }
  function crear(rt: AppRuntime, eur: number, parteId = "parte-demo-1"): string {
    const r = rt.crearTransaccion(
      { lifecycleId: LC, parteId, fecha: "2026-09-01", lineas: [{ descripcion: "Revisión", cantidadMilesimas: 1000, precioCentimos: eur * 100, ivaPct: 21 }] },
      "ana",
    );
    if (!r.ok) throw new Error(r.errors.join());
    return r.id;
  }

  it("recorrido completo", async () => {
    const rt = AppRuntime.open(bootProfile("p04-taller-mecanico"), { dbPath: tempDb() });
    const id = crear(rt, 100);

    let st = rt.facturacionDe(id);
    expect(st.vigente === undefined && !st.puede && st.motivo).toMatch(/presupuesto/);
    await aceptar(rt, id);
    st = rt.facturacionDe(id);
    expect(st.vigente === undefined && !st.puede && st.motivo).toMatch(/datos de la empresa/);

    rt.facturas.putEmisor(rt.tenantId, EMISOR, "2026-01-01T00:00:00.000Z");
    st = rt.facturacionDe(id);
    expect(st.vigente === undefined && st.puede && st.tipo).toBe("simplificada");

    const t1 = rt.expedirFactura(id, "ana");
    expect(t1.ok && t1.factura).toMatchObject({ codigo: `T${ANIO}-0001`, tipo: "simplificada", total: 12100 });
    expect(t1.ok && t1.factura.receptor).toBeUndefined();
    expect(rt.expedirFactura(id, "ana")).toEqual({ ok: false, error: `Ya tiene la factura T${ANIO}-0001.` });

    if (!t1.ok) throw new Error();
    expect(rt.rectificarFactura(t1.factura.id, " ", "ana")).toEqual({ ok: false, error: "Indica el motivo de la rectificación." });
    const r1 = rt.rectificarFactura(t1.factura.id, "El cliente pide factura completa", "ana");
    expect(r1.ok && r1.factura).toMatchObject({
      codigo: `R${ANIO}-0001`,
      rectificaA: `T${ANIO}-0001`,
      total: -12100,
      base: -10000,
      iva: -2100,
    });
    expect(rt.rectificarFactura(t1.factura.id, "otra vez", "ana").ok).toBe(false);

    // Con NIF y dirección del cliente, ahora sale completa
    rt.partes.put(rt.tenantId, "parte-demo-1", { displayName: "Juan García", taxId: "12345678z", address: "C/ Luna 2" }, "2026-09-02T00:00:00.000Z");
    const f1 = rt.expedirFactura(id, "ana");
    expect(f1.ok && f1.factura).toMatchObject({
      codigo: `F${ANIO}-0001`,
      tipo: "completa",
      receptor: { nombre: "Juan García", nif: "12345678Z", domicilio: "C/ Luna 2" },
    });
    const fin = rt.facturacionDe(id);
    expect(fin.vigente?.codigo).toBe(`F${ANIO}-0001`);
    expect(fin.historial.map((f) => f.codigo)).toEqual([`T${ANIO}-0001`, `R${ANIO}-0001`, `F${ANIO}-0001`]);
    expect(verificarCadena(rt.facturas.list(rt.tenantId))).toEqual({ ok: true });
    rt.close();
  });

  it("más de 400 € sin datos del cliente no se factura, y las compras tampoco", async () => {
    const rt = AppRuntime.open(bootProfile("p04-taller-mecanico"), { dbPath: tempDb() });
    rt.facturas.putEmisor(rt.tenantId, EMISOR, "2026-01-01T00:00:00.000Z");
    const id = crear(rt, 500);
    await aceptar(rt, id);
    const st = rt.facturacionDe(id);
    expect(st.vigente === undefined && !st.puede && st.motivo).toMatch(/NIF y la dirección del cliente/);
    const compra = rt.subjects.find((s) => s.lifecycleId === "lc.compras")!;
    await executeUiAction(rt, {
      actionId: "action.lc.compras.t_aceptar",
      subjectId: compra.id,
      clientRequestId: "c1",
      roleId: "dueno",
      parteId: "parte-demo-1",
      channel: "backoffice",
      kind: "boton",
    });
    const sc = rt.facturacionDe(compra.id);
    expect(sc.vigente === undefined && !sc.puede && sc.motivo).toMatch(/compra/);
    rt.close();
  });
});

describe("Web: facturas y datos de la empresa", () => {
  function post(url: string, body: Record<string, string>) {
    return fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  }

  it("empresa → expedir desde el expediente → ver → rectificar", async () => {
    const h = await startWebServer(bootProfile("p04-taller-mecanico"), { port: 0, dbPath: tempDb() });
    try {
      const rt = h.runtime;
      const r = rt.crearTransaccion(
        { lifecycleId: "lc.servicio_proyecto", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: [{ descripcion: "Revisión <completa>", cantidadMilesimas: 1000, precioCentimos: 18000, ivaPct: 21 }] },
        "ana",
      );
      if (!r.ok) throw new Error();
      const acc = await executeUiAction(rt, {
        actionId: "action.lc.servicio_proyecto.t_acordar",
        subjectId: r.id,
        clientRequestId: "w1",
        roleId: "dueno",
        parteId: "parte-demo-1",
        channel: "backoffice",
        kind: "boton",
      });
      expect(acc.ok).toBe(true);

      let ficha = await (await fetch(`${h.url}expedientes/${r.id}?role=dueno`)).text();
      expect(ficha).toContain("data-factura-no");
      expect(ficha).toContain("datos de la empresa");

      const mal = await post(`${h.url}empresa`, { roleId: "dueno", razonSocial: "Talleres Paco SL", nif: "B12345675", domicilio: "C/ Mayor 1" });
      expect(mal.status).toBe(422);
      expect(await mal.text()).toContain("El NIF de la empresa no es válido.");
      const bien = await post(`${h.url}empresa`, { roleId: "dueno", ...EMISOR });
      expect(bien.status).toBe(303);

      ficha = await (await fetch(`${h.url}expedientes/${r.id}?role=dueno`)).text();
      expect(ficha).toContain("data-expedir-factura");

      const exp = await post(`${h.url}expedientes/${r.id}/factura`, { roleId: "dueno" });
      expect(exp.status).toBe(303);
      const loc = exp.headers.get("location")!;
      expect(loc).toMatch(/^\/facturas\/fac-/);
      const doc = await (await fetch(`${h.url}${loc.slice(1)}`)).text();
      expect(doc).toContain(`T${ANIO}-0001`);
      expect(doc).toContain("Talleres Paco SL");
      expect(doc).toContain("B12345674");
      expect(doc).toContain("Revisión &lt;completa&gt;");
      expect(doc).toContain("217,80 €");
      expect(doc).toContain("data-imprimir");
      expect(doc).toContain('<script src="/imprimir.js">');
      expect((await fetch(`${h.url}imprimir.js`)).status).toBe(200);

      const lista = await (await fetch(`${h.url}facturas?role=dueno`)).text();
      expect(lista).toContain('data-cadena="ok"');
      expect(lista).toContain(`T${ANIO}-0001`);

      const facId = loc.split("?")[0]!.slice("/facturas/".length);
      const rect = await post(`${h.url}facturas/${facId}/rectificar`, { roleId: "dueno", motivo: "Error en el precio" });
      expect(rect.status).toBe(303);
      const docR = await (await fetch(`${h.url}${rect.headers.get("location")!.slice(1)}`)).text();
      expect(docR).toContain(`R${ANIO}-0001`);
      expect(docR).toContain("Error en el precio");
      expect(docR).toContain("-217,80 €");

      ficha = await (await fetch(`${h.url}expedientes/${r.id}?role=dueno`)).text();
      expect(ficha).toContain("data-expedir-factura");
      expect(ficha).toContain(`R${ANIO}-0001`);

      expect((await fetch(`${h.url}facturas?role=cliente`)).status).toBe(403);
      expect((await post(`${h.url}expedientes/${r.id}/factura`, { roleId: "cliente" })).status).toBe(403);
      expect((await fetch(`${h.url}facturas/no-existe?role=dueno`)).status).toBe(404);
    } finally {
      await h.close();
    }
  });
});
