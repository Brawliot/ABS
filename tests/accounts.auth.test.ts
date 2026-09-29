/**
 * Cuentas, sesiones, CSRF, aislamiento multiempresa, baja inmediata.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  seedAccount,
  DEMO_PASSWORD,
} from "../accounts/index.js";
import {
  allowDevSession,
  isProduction,
  createSession,
  MemorySessionStore,
  signSessionId,
  verifySignedSessionId,
  isSessionExpired,
  clearSecurityEventsForTests,
} from "../auth/index.js";
import {
  createAuthRuntime,
  loginWithPassword,
  logoutSession,
  revokeEmployeeAccess,
  switchActiveCompany,
  identityForAction,
} from "../web/auth-bridge.js";
import { bootProfile } from "../web/boot-profile.js";
import type { IncomingMessage } from "node:http";

describe("accounts — argon2id", () => {
  it("hash y verify redondos", () => {
    const h = hashPassword("Secreto!123");
    expect(h.startsWith("argon2id$")).toBe(true);
    expect(verifyPassword("Secreto!123", h)).toBe(true);
    expect(verifyPassword("otra", h)).toBe(false);
  });
});

describe("auth.env — selector imposible en producción", () => {
  const prevAbs = process.env.ABS_ENV;
  const prevNode = process.env.NODE_ENV;
  const prevAllow = process.env.ABS_ALLOW_DEV_SESSION;

  afterEach(() => {
    if (prevAbs === undefined) delete process.env.ABS_ENV;
    else process.env.ABS_ENV = prevAbs;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevAllow === undefined) delete process.env.ABS_ALLOW_DEV_SESSION;
    else process.env.ABS_ALLOW_DEV_SESSION = prevAllow;
  });

  it("ABS_ALLOW_DEV_SESSION=1 no activa selector en prod", () => {
    process.env.ABS_ENV = "production";
    process.env.ABS_ALLOW_DEV_SESSION = "1";
    expect(isProduction()).toBe(true);
    expect(allowDevSession()).toBe(false);
  });

  it("en desarrollo el selector está permitido por defecto", () => {
    process.env.ABS_ENV = "development";
    delete process.env.ABS_ALLOW_DEV_SESSION;
    expect(isProduction()).toBe(false);
    expect(allowDevSession()).toBe(true);
  });
});

describe("sesiones — firma, idle, logout-all", () => {
  it("firma HMAC rechaza manipulación", () => {
    const signed = signSessionId("ses_abc");
    expect(verifySignedSessionId(signed)).toBe("ses_abc");
    expect(verifySignedSessionId(signed + "x")).toBeNull();
    expect(verifySignedSessionId("ses_abc.bad")).toBeNull();
  });

  it("sesión revocada no es usable", () => {
    const store = new MemorySessionStore();
    const s = createSession({
      accountId: "acc_1",
      companyId: "co_a",
      roleId: "gerente",
      kind: "empleado",
    });
    store.put(s);
    store.revoke(s.sessionId, new Date().toISOString());
    expect(isSessionExpired(store.get(s.sessionId)!)).toBe(true);
  });
});

describe("login + aislamiento + baja", () => {
  beforeEach(() => clearSecurityEventsForTests());

  it("login ok y rechazo de otra empresa", () => {
    const auth = createAuthRuntime();
    seedAccount(auth.accounts, {
      email: "a@co.demo",
      password: DEMO_PASSWORD,
      displayName: "A",
      companyId: "empresa-a",
      roleId: "gerente",
      kind: "dueno",
    });
    seedAccount(auth.accounts, {
      email: "a@co.demo",
      password: DEMO_PASSWORD,
      displayName: "A",
      companyId: "empresa-b",
      roleId: "oficina",
      kind: "empleado",
    });
    const { session } = loginWithPassword(auth, {
      email: "a@co.demo",
      password: DEMO_PASSWORD,
      companyId: "empresa-a",
    });
    expect(session.companyId).toBe("empresa-a");
    expect(session.roleId).toBe("gerente");

    const switched = switchActiveCompany(auth, session, "empresa-b");
    expect(switched.session.companyId).toBe("empresa-b");
    expect(switched.session.roleId).toBe("oficina");

    expect(() =>
      switchActiveCompany(auth, switched.session, "empresa-inexistente"),
    ).toThrow(/Sin acceso/);
    auth.accounts.close();
  });

  it("empleado dado de baja pierde sesión inmediata", () => {
    const auth = createAuthRuntime();
    const owner = seedAccount(auth.accounts, {
      email: "owner@co.demo",
      password: DEMO_PASSWORD,
      displayName: "Owner",
      companyId: "co",
      roleId: "gerente",
      kind: "dueno",
    });
    const emp = seedAccount(auth.accounts, {
      email: "emp@co.demo",
      password: DEMO_PASSWORD,
      displayName: "Emp",
      companyId: "co",
      roleId: "oficina",
      kind: "empleado",
    });
    const ownerSes = loginWithPassword(auth, {
      email: "owner@co.demo",
      password: DEMO_PASSWORD,
      companyId: "co",
    }).session;
    const empSes = loginWithPassword(auth, {
      email: "emp@co.demo",
      password: DEMO_PASSWORD,
      companyId: "co",
    }).session;
    revokeEmployeeAccess(auth, ownerSes, emp.accountId);
    expect(
      auth.accounts.getActiveMembership(emp.accountId, "co"),
    ).toBeUndefined();
    expect(isSessionExpired(auth.sessions.get(empSes.sessionId)!)).toBe(true);
    expect(() =>
      loginWithPassword(auth, {
        email: "emp@co.demo",
        password: DEMO_PASSWORD,
        companyId: "co",
      }),
    ).toThrow(/Sin acceso/);
    void owner;
    auth.accounts.close();
  }, 60_000);

  it("logout-all invalida todas las sesiones", () => {
    const auth = createAuthRuntime();
    seedAccount(auth.accounts, {
      email: "u@co.demo",
      password: DEMO_PASSWORD,
      displayName: "U",
      companyId: "co",
      roleId: "gerente",
      kind: "dueno",
    });
    const s1 = loginWithPassword(auth, {
      email: "u@co.demo",
      password: DEMO_PASSWORD,
      companyId: "co",
    }).session;
    const s2 = loginWithPassword(auth, {
      email: "u@co.demo",
      password: DEMO_PASSWORD,
      companyId: "co",
    }).session;
    logoutSession(auth, s1, true);
    expect(isSessionExpired(auth.sessions.get(s1.sessionId)!)).toBe(true);
    expect(isSessionExpired(auth.sessions.get(s2.sessionId)!)).toBe(true);
    auth.accounts.close();
  }, 60_000);
});

describe("identityForAction — prod no acepta form", () => {
  const prev = process.env.ABS_ENV;
  afterEach(() => {
    if (prev === undefined) delete process.env.ABS_ENV;
    else process.env.ABS_ENV = prev;
  });

  it("en producción sin cookie rechaza", () => {
    process.env.ABS_ENV = "production";
    process.env.ABS_SESSION_SECRET = "test-secret-16chars";
    const boot = bootProfile("concesionaria");
    const req = { headers: {} } as IncomingMessage;
    expect(() =>
      identityForAction(createAuthRuntime(), req, {
        roleId: "hacker",
        parteId: "otra",
      }, boot),
    ).toThrow(/iniciar sesión/);
  });
});
