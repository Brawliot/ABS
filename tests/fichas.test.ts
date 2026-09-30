import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validarDefinicionFichas,
  parseFichaForm,
  type DefinicionFicha,
} from "../elements/ficha.js";
import { SqliteFichaStore } from "../adapters/sqlite-ficha-store.js";
import { startWebServer } from "../web/server.js";
import { bootProfile } from "../contracts/materialize.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";

describe("fichas", () => {
  describe("validarDefinicionFichas", () => {
    it("rechaza un id repetido", () => {
      const fichas: DefinicionFicha[] = [
        {
          id: "ficha1",
          nombre: "Ficha 1",
          plural: "Fichas 1",
          elemento: "recurso",
          deQuien: "propio",
          campos: [{ id: "campo1", nombre: "Campo 1", tipo: "texto" }],
        },
        {
          id: "ficha1",
          nombre: "Ficha 2",
          plural: "Fichas 2",
          elemento: "oferta",
          campos: [{ id: "campo1", nombre: "Campo 1", tipo: "texto" }],
        },
      ];
      const errors = validarDefinicionFichas(fichas);
      expect(errors.some((e) => e.includes("repetido"))).toBe(true);
    });

    it("rechaza un campo dni", () => {
      const fichas: DefinicionFicha[] = [
        {
          id: "ficha1",
          nombre: "Ficha 1",
          plural: "Fichas 1",
          elemento: "recurso",
          deQuien: "propio",
          campos: [
            { id: "dni", nombre: "DNI", tipo: "texto" },
            { id: "nombre", nombre: "Nombre", tipo: "texto" },
          ],
        },
      ];
      const errors = validarDefinicionFichas(fichas);
      expect(errors.some((e) => e.includes("personales"))).toBe(true);
    });

    it("rechaza opcion sin opciones", () => {
      const fichas: DefinicionFicha[] = [
        {
          id: "ficha1",
          nombre: "Ficha 1",
          plural: "Fichas 1",
          elemento: "oferta",
          campos: [{ id: "tipo", nombre: "Tipo", tipo: "opcion" }],
        },
      ];
      const errors = validarDefinicionFichas(fichas);
      expect(errors.some((e) => e.includes("opcion"))).toBe(true);
    });

    it("rechaza recurso sin deQuien", () => {
      const fichas: DefinicionFicha[] = [
        {
          id: "ficha1",
          nombre: "Ficha 1",
          plural: "Fichas 1",
          elemento: "recurso",
          campos: [{ id: "campo1", nombre: "Campo 1", tipo: "texto" }],
        },
      ];
      const errors = validarDefinicionFichas(fichas);
      expect(errors.some((e) => e.includes("deQuien"))).toBe(true);
    });

    it("no rechaza fichas válidas", () => {
      const fichas: DefinicionFicha[] = [
        {
          id: "inmueble",
          nombre: "Inmueble",
          plural: "Inmuebles",
          elemento: "recurso",
          deQuien: "propio",
          campos: [
            { id: "direccion", nombre: "Dirección", tipo: "texto", obligatorio: true },
            { id: "metros", nombre: "Metros", tipo: "numero" },
          ],
        },
      ];
      const errors = validarDefinicionFichas(fichas);
      expect(errors).toHaveLength(0);
    });
  });

  describe("parseFichaForm", () => {
    const def: DefinicionFicha = {
      id: "prueba",
      nombre: "Prueba",
      plural: "Pruebas",
      elemento: "recurso",
      deQuien: "propio",
      campos: [
        { id: "precio", nombre: "Precio", tipo: "importe" },
        { id: "cantidad", nombre: "Cantidad", tipo: "numero" },
        { id: "nombre", nombre: "Nombre", tipo: "texto", obligatorio: true },
        { id: "activo", nombre: "Activo", tipo: "si_no" },
      ],
    };

    it("convierte importe 1.234,50 a 123450 céntimos", () => {
      const form = {
        precio: "1.234,50",
        cantidad: "5",
        nombre: "Test",
      };
      const result = parseFichaForm(def, form);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.valores.precio).toBe(123450);
      }
    });

    it("rechaza obligatorio vacío", () => {
      const form = {
        precio: "10,50",
        cantidad: "5",
        nombre: "",
      };
      const result = parseFichaForm(def, form);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("obligatorio"))).toBe(true);
      }
    });

    it("convierte checkbox si_no", () => {
      const form = {
        precio: "10,50",
        cantidad: "5",
        nombre: "Test",
        activo: "on",
      };
      const result = parseFichaForm(def, form);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.valores.activo).toBe(true);
      }
    });

    it("rechaza importe inválido", () => {
      const form = {
        precio: "abc",
        cantidad: "5",
        nombre: "Test",
      };
      const result = parseFichaForm(def, form);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("importe"))).toBe(true);
      }
    });
  });

  describe("SqliteFichaStore", () => {
    let dbPath: string;
    let store: SqliteFichaStore;

    beforeEach(() => {
      dbPath = join(tmpdir(), `ficha-${Date.now()}.sqlite`);
      store = new SqliteFichaStore(dbPath);
    });

    afterEach(() => {
      store.close();
      rmSync(dbPath, { force: true });
    });

    it("crea una ficha versión 1", () => {
      const ficha = store.crear("tenant1", "tipo1", "id1", { nombre: "Test" }, "2026-01-01T00:00:00Z");
      expect(ficha.version).toBe(1);
      expect(ficha.valores).toEqual({ nombre: "Test" });
    });

    it("actualizar crea versión 2", () => {
      store.crear("tenant1", "tipo1", "id1", { nombre: "Test" }, "2026-01-01T00:00:00Z");
      const v2 = store.actualizar("tenant1", "tipo1", "id1", { nombre: "Actualizado" }, "2026-01-02T00:00:00Z");
      expect(v2.version).toBe(2);
      expect(v2.valores.nombre).toBe("Actualizado");
    });

    it("el historial contiene todas las versiones", () => {
      store.crear("tenant1", "tipo1", "id1", { nombre: "V1" }, "2026-01-01T00:00:00Z");
      store.actualizar("tenant1", "tipo1", "id1", { nombre: "V2" }, "2026-01-02T00:00:00Z");
      store.actualizar("tenant1", "tipo1", "id1", { nombre: "V3" }, "2026-01-03T00:00:00Z");

      const history = store.historial("tenant1", "tipo1", "id1");
      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(1);
      expect(history[2].version).toBe(3);
    });

    it("no permite UPDATE directo", () => {
      store.crear("tenant1", "tipo1", "id1", { nombre: "Test" }, "2026-01-01T00:00:00Z");
      expect(() => {
        store["db"].prepare("UPDATE ficha_versions SET valores = ? WHERE id = ?").run('{"x":1}', "id1");
      }).toThrow();
    });

    it("no permite DELETE directo", () => {
      store.crear("tenant1", "tipo1", "id1", { nombre: "Test" }, "2026-01-01T00:00:00Z");
      expect(() => {
        store["db"].prepare("DELETE FROM ficha_versions WHERE id = ?").run("id1");
      }).toThrow();
    });
  });

  describe("web - fichas", () => {
    let handle: { close(): Promise<void> };
    let baseUrl: string;

    beforeEach(async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "fichas-web-"));
      const boot = bootProfile("n04-inmobiliaria");
      handle = await startWebServer(boot, {
        port: 0,
        dbPath: join(tmpDir, "test.sqlite"),
      });
      baseUrl = handle.url;
    });

    afterEach(async () => {
      await handle.close();
    });

    it("GET /fichas/inmueble da 200", async () => {
      const res = await fetch(`${baseUrl}/fichas/inmueble?role=gerente&parte=p1`);
      expect(res.status).toBe(200);
    });

    it("POST /fichas/inmueble crea y redirige", async () => {
      const form = new FormData();
      form.append("direccion", "Calle Mayor 1");
      form.append("metros", "100");
      form.append("habitaciones", "3");
      form.append("precio_venta", "250.000");
      form.append("tipo", "Vivienda");
      form.append("roleId", "gerente");
      form.append("parteId", "p1");

      const res = await fetch(`${baseUrl}/fichas/inmueble?role=gerente&parte=p1`, {
        method: "POST",
        body: form,
        redirect: "manual",
      });
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toContain("/fichas/inmueble/inmueble-");
    });

    it("GET /fichas/inmueble/<id> muestra detalle", async () => {
      const form = new FormData();
      form.append("direccion", "Calle Mayor 1");
      form.append("metros", "100");
      form.append("habitaciones", "3");
      form.append("precio_venta", "250.000");
      form.append("tipo", "Vivienda");
      form.append("roleId", "gerente");
      form.append("parteId", "p1");

      const createRes = await fetch(`${baseUrl}/fichas/inmueble?role=gerente&parte=p1`, {
        method: "POST",
        body: form,
        redirect: "follow",
      });

      expect(createRes.status).toBe(200);
      const text = await createRes.text();
      expect(text).toContain("Calle Mayor 1");
      expect(text).not.toContain("immueble-");
    });

    it("negocio sin fichas da 404", async () => {
      const res = await fetch(`${baseUrl}/fichas/inexistente?role=gerente&parte=p1`);
      expect(res.status).toBe(404);
    });
  });

  describe("no hay fugas de identificadores técnicos", () => {
    let handle: { close(): Promise<void> };
    let baseUrl: string;

    beforeEach(async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "fichas-web-"));
      const boot = bootProfile("n04-inmobiliaria");
      handle = await startWebServer(boot, {
        port: 0,
        dbPath: join(tmpDir, "test.sqlite"),
      });
      baseUrl = handle.url;
    });

    afterEach(async () => {
      await handle.close();
    });

    it("no muestra UUIDs ni ids técnicos", async () => {
      const form = new FormData();
      form.append("direccion", "Calle Mayor 1");
      form.append("metros", "100");
      form.append("habitaciones", "3");
      form.append("precio_venta", "250.000");
      form.append("tipo", "Vivienda");
      form.append("roleId", "gerente");
      form.append("parteId", "p1");

      await fetch(`${baseUrl}/fichas/inmueble?role=gerente&parte=p1`, {
        method: "POST",
        body: form,
      });

      const res = await fetch(`${baseUrl}/fichas/inmueble?role=gerente&parte=p1`);
      const text = await res.text();
      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      expect(text).not.toMatch(uuidPattern);
    });
  });
});
