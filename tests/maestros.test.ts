/**
 * Capa 0 viva: Partes y catálogo de Ofertas (dominio, SQLite y web).
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteParteIdentityStore } from "../adapters/sqlite-identity-store.js";
import { SqliteOfertaCatalog } from "../adapters/sqlite-oferta-catalog.js";
import {
  formatCentimos,
  parseImporteCentimos,
  parseOfertaForm,
  type OfertaInput,
} from "../elements/oferta.js";
import { parseParteForm } from "../elements/parte.js";
import { AppRuntime, bootProfile, startWebServer } from "../web/index.js";

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
  const dir = mkdtempSync(join(tmpdir(), "abs-maestros-"));
  dirs.push(dir);
  return join(dir, "db.sqlite");
}

const ACEITE: OfertaInput = {
  subtype: "trabajo",
  nombre: "Cambio de aceite",
  precioCentimos: 6000,
  ivaPct: 21,
  unidad: "ud",
};

describe("Importes", () => {
  it.each([
    ["12,50", 1250],
    ["12.50", 1250],
    ["12,5", 1250],
    ["12", 1200],
    ["0", 0],
    ["1.234,56", 123456],
    ["1.234", 123400],
    ["60 €", 6000],
  ])("%s → %i céntimos", (raw, cents) => {
    expect(parseImporteCentimos(raw)).toBe(cents);
  });

  it.each(["", "-5", "abc", "12,345", "1,2,3"])("rechaza %j", (raw) => {
    expect(parseImporteCentimos(raw)).toBeNull();
  });

  it("formatea en español", () => {
    expect(formatCentimos(123456)).toBe("1.234,56 €");
    expect(formatCentimos(5)).toBe("0,05 €");
  });
});

describe("Validación de formularios", () => {
  it("Parte: nombre obligatorio, correo válido, tipo cerrado", () => {
    const bad = parseParteForm({ subtype: "vecino", displayName: " ", email: "x" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toHaveLength(3);

    const good = parseParteForm({
      subtype: "cliente",
      displayName: "  Juan García ",
      taxId: "12345678z",
      email: "",
    });
    expect(good).toEqual({
      ok: true,
      value: {
        subtype: "cliente",
        personal: { displayName: "Juan García", taxId: "12345678Z" },
      },
    });
  });

  it("Oferta: precio, IVA y tipo", () => {
    const bad = parseOfertaForm({ subtype: "bien", nombre: "X", precio: "gratis", ivaPct: "7" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toHaveLength(2);

    const good = parseOfertaForm({
      subtype: "trabajo",
      nombre: "Cambio de aceite",
      precio: "60",
      ivaPct: "21",
      unidad: "",
    });
    expect(good).toEqual({ ok: true, value: ACEITE });
  });
});

describe("SqliteParteIdentityStore", () => {
  it("persiste entre reinicios, cifra la PII y aísla tenants", () => {
    const path = tempDb();
    const a = new SqliteParteIdentityStore(path);
    a.put("t1", "p1", { displayName: "Juan García", email: "juan@example.com" }, "2026-01-01T00:00:00.000Z", "cliente");
    a.put("t2", "p2", { displayName: "Otra empresa" }, "2026-01-01T00:00:00.000Z", "proveedor");
    a.close();

    const raw = readFileSync(path);
    expect(raw.includes(Buffer.from("juan@example.com"))).toBe(false);

    const b = new SqliteParteIdentityStore(path);
    const list = b.list("t1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      parteId: "p1",
      subtype: "cliente",
      personal: { displayName: "Juan García", email: "juan@example.com" },
    });
    expect(b.get("t1", "p2")).toBeUndefined();
    b.close();
  });

  it("editar conserva la fecha de alta y el tipo si no se indica", () => {
    const s = new SqliteParteIdentityStore();
    s.put("t", "p", { displayName: "A" }, "2026-01-01T00:00:00.000Z", "proveedor");
    const rec = s.put("t", "p", { displayName: "B" }, "2026-02-01T00:00:00.000Z");
    expect(rec).toMatchObject({
      subtype: "proveedor",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      personal: { displayName: "B" },
    });
    s.close();
  });

  it("borrado RGPD: el id sigue existiendo pero sin datos", () => {
    const s = new SqliteParteIdentityStore();
    s.put("t", "p", { displayName: "Juan" }, "2026-01-01T00:00:00.000Z", "cliente");
    s.erase("t", "p", "2026-03-01T00:00:00.000Z");
    expect(s.get("t", "p")).toMatchObject({ personal: null, erasedAt: "2026-03-01T00:00:00.000Z" });
    expect(s.resolve("t", "p")).toMatchObject({ erased: true, personal: { displayName: "[borrado]" } });
    expect(() => s.erase("t", "nadie", "2026-03-01T00:00:00.000Z")).toThrow();
    s.close();
  });
});

describe("SqliteOfertaCatalog", () => {
  it("versiona cada cambio y conserva el precio antiguo", () => {
    const path = tempDb();
    const c = new SqliteOfertaCatalog(path);
    c.create("t", "o1", ACEITE, "2026-01-01T00:00:00.000Z");
    c.update("t", "o1", { ...ACEITE, precioCentimos: 6500 }, "2026-02-01T00:00:00.000Z");
    c.setActiva("t", "o1", false, "2026-03-01T00:00:00.000Z");
    c.close();

    const d = new SqliteOfertaCatalog(path);
    const now = d.get("t", "o1")!;
    expect(now).toMatchObject({ version: 3, precioCentimos: 6500, activa: false, createdAt: "2026-01-01T00:00:00.000Z" });
    expect(d.getVersion("t", "o1", 1)?.precioCentimos).toBe(6000);
    expect(d.history("t", "o1").map((h) => h.version)).toEqual([1, 2, 3]);
    expect(d.list("t")).toHaveLength(1);
    expect(d.list("otro")).toHaveLength(0);
    expect(() => d.create("t", "o1", ACEITE, "2026-04-01T00:00:00.000Z")).toThrow(/ya existe/);
    expect(() => d.update("t", "nada", ACEITE, "2026-04-01T00:00:00.000Z")).toThrow(/no existe/);
    d.close();
  });

  it("activar dos veces no crea versión nueva", () => {
    const c = new SqliteOfertaCatalog();
    c.create("t", "o1", ACEITE, "2026-01-01T00:00:00.000Z");
    c.setActiva("t", "o1", true, "2026-02-01T00:00:00.000Z");
    expect(c.get("t", "o1")?.version).toBe(1);
    c.close();
  });
});

describe("Runtime", () => {
  it("da de alta como clientes las partes demo una sola vez", () => {
    const dbPath = tempDb();
    const boot = bootProfile("p04-taller-mecanico");
    const r1 = AppRuntime.open(boot, { dbPath });
    const names = r1.partes.list(r1.tenantId).map((p) => p.personal?.displayName);
    expect(names).toEqual(boot.samplePartes.map((p) => p.label));
    r1.partes.put(r1.tenantId, "parte-demo-1", { displayName: "Renombrado" }, "2026-05-01T00:00:00.000Z");
    r1.close();

    const r2 = AppRuntime.open(boot, { dbPath });
    expect(r2.partes.get(r2.tenantId, "parte-demo-1")?.personal?.displayName).toBe("Renombrado");
    expect(r2.partes.list(r2.tenantId)).toHaveLength(boot.samplePartes.length);
    r2.close();
  });
});

describe("Web: /partes y /ofertas", () => {
  async function start(dbPath: string) {
    const boot = bootProfile("p04-taller-mecanico");
    return startWebServer(boot, { port: 0, dbPath });
  }

  function post(url: string, body: Record<string, string>) {
    return fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  }

  it("alta de cliente y producto, sobreviven a un reinicio", async () => {
    const dbPath = tempDb();
    const h1 = await start(dbPath);
    try {
      const created = await post(`${h1.url}partes`, {
        roleId: "dueno",
        subtype: "cliente",
        displayName: "Juan <García>",
        phone: "600 000 000",
        clientRequestId: "req-1",
      });
      expect(created.status).toBe(303);
      const loc = created.headers.get("location")!;
      expect(loc).toMatch(/^\/partes\/parte-[0-9a-f-]+\?/);

      // Doble envío: no crea otra
      const again = await post(`${h1.url}partes`, {
        roleId: "dueno",
        subtype: "cliente",
        displayName: "Juan <García>",
        clientRequestId: "req-1",
      });
      expect(again.headers.get("location")!.split("?")[0]).toBe(loc.split("?")[0]);

      const oferta = await post(`${h1.url}ofertas`, {
        roleId: "dueno",
        subtype: "trabajo",
        nombre: "Cambio de aceite",
        precio: "60,00",
        ivaPct: "21",
        unidad: "ud",
      });
      expect(oferta.status).toBe(303);

      const invalid = await post(`${h1.url}ofertas`, {
        roleId: "dueno",
        subtype: "bien",
        nombre: "",
        precio: "x",
        ivaPct: "21",
      });
      expect(invalid.status).toBe(422);
      expect(await invalid.text()).toContain("data-form-errors");
    } finally {
      await h1.close();
    }

    const h2 = await start(dbPath);
    try {
      const partes = await (await fetch(`${h2.url}partes?role=dueno`)).text();
      expect(partes).toContain("Juan &lt;García&gt;");
      expect(partes).not.toContain("Juan <García>");
      // 2 clientes demo + 1 creada (el doble envío no duplicó)
      expect(partes.match(/data-parte-id="parte-(?!demo-)/g)).toHaveLength(1);
      expect(partes).toContain("Cliente demo A");

      const ofertas = await (await fetch(`${h2.url}ofertas?role=dueno`)).text();
      expect(ofertas).toContain("Cambio de aceite");
      expect(ofertas).toContain("60,00 €");

      const home = await (await fetch(`${h2.url}?role=dueno`)).text();
      expect(home).toContain('data-maestros="partes"');
      expect(home).toContain('data-maestros="ofertas"');
      const portal = await (await fetch(`${h2.url}?role=cliente`)).text();
      expect(portal).not.toContain("data-maestros=");
    } finally {
      await h2.close();
    }
  });

  it("el portal de cliente no puede ver ni crear maestros", async () => {
    const h = await start(tempDb());
    try {
      const view = await fetch(`${h.url}partes?role=cliente`);
      expect(view.status).toBe(403);
      const create = await post(`${h.url}ofertas`, {
        roleId: "cliente",
        subtype: "bien",
        nombre: "Hack",
        precio: "1",
        ivaPct: "21",
      });
      expect(create.status).toBe(403);
      expect(h.runtime.ofertas.list(h.runtime.tenantId)).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it("editar una oferta crea versión y muestra el historial", async () => {
    const h = await start(tempDb());
    try {
      const tenant = h.runtime.tenantId;
      h.runtime.ofertas.create(tenant, "oferta-x", ACEITE, "2026-01-01T00:00:00.000Z");
      const res = await post(`${h.url}ofertas/oferta-x`, {
        roleId: "dueno",
        subtype: "trabajo",
        nombre: "Cambio de aceite",
        precio: "65",
        ivaPct: "21",
        unidad: "ud",
      });
      expect(res.status).toBe(303);
      expect(h.runtime.ofertas.get(tenant, "oferta-x")).toMatchObject({ version: 2, precioCentimos: 6500 });
      const page = await (await fetch(`${h.url}ofertas/oferta-x?role=dueno`)).text();
      expect(page).toContain("data-oferta-historial");
      expect(page).toContain("60,00 €");
      expect(page).toContain("65,00 €");
      expect((await fetch(`${h.url}ofertas/no-existe?role=dueno`)).status).toBe(404);
    } finally {
      await h.close();
    }
  });
});
