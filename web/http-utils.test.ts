/**
 * Tests para http-utils.ts
 * Pruebas de funciones HTTP core
 */

import { describe, it, expect, beforeEach } from "vitest";
import { parseQuery, formToRecord } from "./http-utils.js";

describe("HTTP Utils", () => {
  describe("parseQuery", () => {
    it("debería extraer parámetros de query string", () => {
      const result = parseQuery("/?role=admin&parte=p1");
      expect(result).toEqual({ role: "admin", parte: "p1" });
    });

    it("debería retornar objeto vacío sin query string", () => {
      const result = parseQuery("/");
      expect(result).toEqual({});
    });

    it("debería manejar múltiples valores del mismo parámetro", () => {
      const result = parseQuery("/?a=1&a=2&b=3");
      expect(result.a).toBe("2"); // Último valor gana
      expect(result.b).toBe("3");
    });

    it("debería decodificar URLs", () => {
      const result = parseQuery("/?email=test%40example.com");
      expect(result.email).toBe("test@example.com");
    });

    it("debería manejar valores vacíos", () => {
      const result = parseQuery("/?key=&other=value");
      expect(result.key).toBe("");
      expect(result.other).toBe("value");
    });
  });

  describe("formToRecord", () => {
    it("debería convertir form-encoded a objeto", () => {
      const result = formToRecord("email=test@example.com&password=abc123");
      expect(result).toEqual({
        email: "test@example.com",
        password: "abc123",
      });
    });

    it("debería retornar objeto vacío para string vacío", () => {
      const result = formToRecord("");
      expect(result).toEqual({});
    });

    it("debería manejar valores especiales", () => {
      const result = formToRecord("name=John+Doe&comment=Hello%2C+World");
      expect(result.name).toBe("John Doe");
      expect(result.comment).toBe("Hello, World");
    });

    it("debería decodificar caracteres especiales", () => {
      const result = formToRecord("text=50%25&symbol=%24");
      expect(result.text).toBe("50%");
      expect(result.symbol).toBe("$");
    });
  });
});
