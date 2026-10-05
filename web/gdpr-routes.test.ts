/**
 * Tests para gdpr-routes.ts
 * Pruebas de handlers de GDPR y privacidad
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleGdprRoute } from "./gdpr-routes.js";
import type { GdprRouteContext } from "./gdpr-routes.js";
import { ParteIdentityStore } from "../policies/identity.js";

describe("GDPR Routes", () => {
  let mockReq: Partial<IncomingMessage>;
  let mockRes: Partial<ServerResponse>;
  let ctx: GdprRouteContext;

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
      identities: new ParteIdentityStore(),
    };
  });

  describe("GDPR route detection", () => {
    it("debería retornar false para rutas que no son de GDPR", async () => {
      const handled = await handleGdprRoute(
        "/api/test",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(false);
    });

    it("debería retornar true para rutas de GDPR", async () => {
      const handled = await handleGdprRoute(
        "/gdpr/export",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });
  });

  describe("Supported GDPR endpoints", () => {
    const endpoints = [
      { path: "/gdpr/export", method: "GET" },
      { path: "/gdpr/erase", method: "POST" },
      { path: "/gdpr/rectify", method: "POST" },
      { path: "/gdpr/rat", method: "GET" },
      { path: "/gdpr/legal-drafts", method: "GET" },
    ];

    endpoints.forEach(({ path, method }) => {
      it(`debería soportar ${method} ${path}`, async () => {
        const handled = await handleGdprRoute(
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
      const handled = await handleGdprRoute(
        "/gdpr/export",
        "POST",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });
  });

  describe("Context handling", () => {
    it("debería funcionar sin auth runtime", async () => {
      const noAuthCtx: GdprRouteContext = {
        auth: undefined,
        boot: { profileId: "test-profile" },
        identities: new ParteIdentityStore(),
      };

      const handled = await handleGdprRoute(
        "/gdpr/export",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        noAuthCtx,
      );
      expect(handled).toBe(true);
    });

    it("debería usar identities store del context", async () => {
      const identities = new ParteIdentityStore();
      const ctxWithIdentities: GdprRouteContext = {
        auth: undefined,
        boot: { profileId: "test-profile" },
        identities,
      };

      const handled = await handleGdprRoute(
        "/gdpr/export",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctxWithIdentities,
      );
      expect(handled).toBe(true);
    });
  });

  describe("GDPR compliance", () => {
    it("debería retornar true para /gdpr/export (export personal data)", async () => {
      const handled = await handleGdprRoute(
        "/gdpr/export",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });

    it("debería retornar true para /gdpr/erase (right to be forgotten)", async () => {
      const handled = await handleGdprRoute(
        "/gdpr/erase",
        "POST",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });

    it("debería retornar true para /gdpr/rectify (rectification)", async () => {
      const handled = await handleGdprRoute(
        "/gdpr/rectify",
        "POST",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });

    it("debería retornar true para /gdpr/rat (transfer analysis record)", async () => {
      const handled = await handleGdprRoute(
        "/gdpr/rat",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });

    it("debería retornar true para /gdpr/legal-drafts", async () => {
      const handled = await handleGdprRoute(
        "/gdpr/legal-drafts",
        "GET",
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        ctx,
      );
      expect(handled).toBe(true);
    });
  });
});
