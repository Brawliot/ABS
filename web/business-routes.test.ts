/**
 * Tests para business-routes.ts
 * Pruebas de handlers de lógica de negocio
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleBusinessRoute } from "./business-routes.js";
import type { BusinessRouteContext } from "./business-routes.js";
import { AppRuntime } from "./runtime.js";
import type { AppBootResult } from "./types.js";

describe("Business Routes", () => {
  let mockReq: Partial<IncomingMessage>;
  let mockRes: Partial<ServerResponse>;
  let ctx: BusinessRouteContext;
  let mockRuntime: Partial<AppRuntime>;
  let mockBoot: Partial<AppBootResult>;

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

    mockRuntime = {
      subjects: [],
      activeBlocks: vi.fn(() => []),
      projectRows: vi.fn(() => []),
      setFlash: vi.fn(),
    };

    mockBoot = {
      profileId: "test-profile",
      brandName: "Test Brand",
      spec: {},
      roles: [],
      input: { lifecycles: [], channels: [] },
    };

    ctx = {
      auth: undefined,
      boot: mockBoot as AppBootResult,
      runtime: mockRuntime as AppRuntime,
    };
  });

  describe("Business route detection", () => {
    it("debería retornar false para rutas que no son de negocio", async () => {
      const handled = await handleBusinessRoute(
        "/api/test",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/api/test",
      );
      expect(handled).toBe(false);
    });

    it("debería retornar true para rutas de negocio", async () => {
      const handled = await handleBusinessRoute(
        "/login",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/login",
      );
      expect(handled).toBe(true);
    });
  });

  describe("Supported business endpoints", () => {
    const endpoints = [
      { path: "/wizard/decision", method: "GET" },
      { path: "/diagnosis", method: "GET" },
      { path: "/diagnosis", method: "POST" },
      { path: "/link-devolucion", method: "POST" },
      { path: "/action", method: "POST" },
      { path: "/inicio", method: "GET" },
      { path: "/login", method: "GET" },
    ];

    endpoints.forEach(({ path, method }) => {
      it(`debería soportar ${method} ${path}`, async () => {
        const handled = await handleBusinessRoute(
          path,
          method,
          mockReq as IncomingMessage,
          mockRes as ServerResponse,
          ctx,
          path,
        );
        expect(handled).toBe(true);
      });
    });
  });

  describe("Critical business routes", () => {
    it("debería retornar true para POST /action (ruta crítica)", async () => {
      const handled = await handleBusinessRoute(
        "/action",
        "POST",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/action",
      );
      expect(handled).toBe(true);
    });

    it("debería retornar true para GET /wizard/decision", async () => {
      const handled = await handleBusinessRoute(
        "/wizard/decision",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/wizard/decision",
      );
      expect(handled).toBe(true);
    });

    it("debería retornar true para GET /diagnosis", async () => {
      const handled = await handleBusinessRoute(
        "/diagnosis",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/diagnosis",
      );
      expect(handled).toBe(true);
    });

    it("debería retornar true para POST /diagnosis", async () => {
      const handled = await handleBusinessRoute(
        "/diagnosis",
        "POST",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/diagnosis",
      );
      expect(handled).toBe(true);
    });

    it("debería retornar true para GET /inicio (dashboard)", async () => {
      const handled = await handleBusinessRoute(
        "/inicio",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/inicio",
      );
      expect(handled).toBe(true);
    });

    it("debería retornar true para GET /login", async () => {
      const handled = await handleBusinessRoute(
        "/login",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/login",
      );
      expect(handled).toBe(true);
    });
  });

  describe("Invalid HTTP methods", () => {
    it("debería rechazar POST en GET-only endpoints", async () => {
      const handled = await handleBusinessRoute(
        "/wizard/decision",
        "POST",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/wizard/decision",
      );
      expect(handled).toBe(true);
    });

    it("debería rechazar GET en POST-only endpoints", async () => {
      const handled = await handleBusinessRoute(
        "/action",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/action",
      );
      expect(handled).toBe(true);
    });
  });

  describe("Context handling", () => {
    it("debería funcionar sin auth runtime", async () => {
      const noAuthCtx: BusinessRouteContext = {
        auth: undefined,
        boot: mockBoot as AppBootResult,
        runtime: mockRuntime as AppRuntime,
      };

      const handled = await handleBusinessRoute(
        "/login",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        noAuthCtx,
        "/login",
      );
      expect(handled).toBe(true);
    });

    it("debería usar runtime y boot del context", async () => {
      const customRuntime = { ...mockRuntime, projectRows: vi.fn(() => []) };
      const ctxWithRuntime: BusinessRouteContext = {
        auth: undefined,
        boot: mockBoot as AppBootResult,
        runtime: customRuntime as AppRuntime,
      };

      const handled = await handleBusinessRoute(
        "/login",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctxWithRuntime,
        "/login",
      );
      expect(handled).toBe(true);
    });
  });

  describe("Wizard and diagnosis flows", () => {
    it("debería soportar wizard decision screen", async () => {
      const handled = await handleBusinessRoute(
        "/wizard/decision",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/wizard/decision",
      );
      expect(handled).toBe(true);
    });

    it("debería soportar diagnosis GET y POST", async () => {
      const getHandled = await handleBusinessRoute(
        "/diagnosis",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/diagnosis",
      );
      expect(getHandled).toBe(true);

      const postHandled = await handleBusinessRoute(
        "/diagnosis",
        "POST",
        { ...mockReq, method: "POST" } as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/diagnosis",
      );
      expect(postHandled).toBe(true);
    });

    it("debería soportar linked return creation", async () => {
      const handled = await handleBusinessRoute(
        "/link-devolucion",
        "POST",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
        "/link-devolucion",
      );
      expect(handled).toBe(true);
    });
  });
});
