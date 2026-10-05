/**
 * Tests para auth-routes.ts
 * Pruebas de handlers de autenticación
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAuthRoute } from "./auth-routes.js";
import type { AuthRouteContext } from "./auth-routes.js";

describe("Auth Routes", () => {
  let mockReq: Partial<IncomingMessage>;
  let mockRes: Partial<ServerResponse>;
  let ctx: AuthRouteContext;

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

    ctx = {
      auth: undefined,
      boot: { profileId: "test-profile" },
    };
  });

  describe("Auth route detection", () => {
    it("debería retornar false para rutas que no son de auth", async () => {
      const handled = await handleAuthRoute(
        "/api/test",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(false);
    });

    it("debería retornar true para rutas de auth", async () => {
      const handled = await handleAuthRoute(
        "/auth/login",
        "POST",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });
  });

  describe("Supported auth endpoints", () => {
    const endpoints = [
      { path: "/auth/login", method: "POST" },
      { path: "/auth/logout", method: "POST" },
      { path: "/auth/magic-request", method: "POST" },
      { path: "/auth/magic", method: "GET" },
      { path: "/auth/reset-request", method: "POST" },
      { path: "/auth/reset", method: "POST" },
      { path: "/auth/invite", method: "POST" },
      { path: "/auth/invite/accept", method: "POST" },
      { path: "/auth/revoke", method: "POST" },
      { path: "/auth/switch-company", method: "POST" },
    ];

    endpoints.forEach(({ path, method }) => {
      it(`debería soportar ${method} ${path}`, async () => {
        const handled = await handleAuthRoute(
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
    it("debería rechazar GET en POST-only endpoints", async () => {
      const handled = await handleAuthRoute(
        "/auth/login",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });
  });

  describe("Context handling", () => {
    it("debería funcionar sin auth runtime", async () => {
      const noAuthCtx: AuthRouteContext = {
        auth: undefined,
        boot: { profileId: "test-profile" },
      };

      const handled = await handleAuthRoute(
        "/auth/login",
        "POST",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        noAuthCtx,
      );
      expect(handled).toBe(true);
    });
  });
});
