/**
 * Tests para api-routes.ts
 * Pruebas de handlers de API endpoints
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApiRoute } from "./api-routes.js";
import type { ApiRouteContext } from "./api-routes.js";

describe("API Routes", () => {
  let mockReq: Partial<IncomingMessage>;
  let mockRes: Partial<ServerResponse>;
  let ctx: ApiRouteContext;

  beforeEach(() => {
    mockReq = {
      method: "GET",
      url: "/",
      headers: {},
    };

    mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
      setHeader: vi.fn(),
    };

    ctx = {};
  });

  describe("API route detection", () => {
    it("debería retornar false para rutas que no son de API", async () => {
      const handled = await handleApiRoute(
        "/auth/login",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(false);
    });

    it("debería retornar true para rutas de API", async () => {
      const handled = await handleApiRoute(
        "/api/wizard/draft",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });
  });

  describe("Supported API endpoints", () => {
    const endpoints = [
      { path: "/api/wizard/draft", method: "GET" },
      { path: "/api/wizard/decision", method: "POST" },
    ];

    endpoints.forEach(({ path, method }) => {
      it(`debería soportar ${method} ${path}`, async () => {
        const handled = await handleApiRoute(
          path,
          method,
          mockReq as IncomingMessage,
          mockRes as ServerResponse,
          ctx,
        );
        expect(handled).toBe(true);
      });
    });
  });

  describe("Invalid HTTP methods", () => {
    it("debería rechazar POST en GET-only endpoints", async () => {
      const handled = await handleApiRoute(
        "/api/wizard/draft",
        "POST",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });

    it("debería rechazar GET en POST-only endpoints", async () => {
      const handled = await handleApiRoute(
        "/api/wizard/decision",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });
  });

  describe("Wizard API endpoints", () => {
    it("debería retornar true para GET /api/wizard/draft", async () => {
      const handled = await handleApiRoute(
        "/api/wizard/draft",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });

    it("debería retornar true para POST /api/wizard/decision", async () => {
      const handled = await handleApiRoute(
        "/api/wizard/decision",
        "POST",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });
  });

  describe("Context handling", () => {
    it("debería funcionar con contexto vacío", async () => {
      const emptyCtx: ApiRouteContext = {};

      const handled = await handleApiRoute(
        "/api/wizard/draft",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        emptyCtx,
      );
      expect(handled).toBe(true);
    });
  });

  describe("API versioning", () => {
    it("debería retornar false para rutas de /api/v1 (no implementadas aún)", async () => {
      const handled = await handleApiRoute(
        "/api/v1/test",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(false);
    });

    it("debería retornar false para rutas de /api/procesos (no implementadas aún)", async () => {
      const handled = await handleApiRoute(
        "/api/procesos/test",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(false);
    });
  });
});
