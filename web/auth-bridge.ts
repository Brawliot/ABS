/**
 * Puente web ↔ auth: identidad solo desde sesión (prod).
 * En desarrollo, DevSession por query se tolera para no romper tests existentes.
 */

import type { IncomingMessage } from "node:http";
import {
  AccountStore,
  emailFingerprint,
  verifyTotp,
  AccountsError,
  type MembershipKind,
} from "../accounts/index.js";
import {
  allowDevSession,
  assertCsrf,
  CsrfError,
  clearSessionCookieHeader,
  createSession,
  CSRF_COOKIE,
  inviteLimiter,
  isProduction,
  isSessionExpired,
  loginLimiter,
  logSecurityEvent,
  MemorySessionStore,
  parseCookies,
  resetLimiter,
  rotateSession,
  SESSION_COOKIE,
  sessionCookieHeader,
  csrfCookieHeader,
  signSessionId,
  verifySignedSessionId,
  type AuthSession,
  type SessionStore,
} from "../auth/index.js";
import type { AppBootResult, DevSession } from "./types.js";
import { resolveSession } from "./render-app.js";

export interface AuthRuntime {
  readonly accounts: AccountStore;
  readonly sessions: SessionStore;
}

export function createAuthRuntime(dbPath?: string): AuthRuntime {
  return {
    accounts: new AccountStore(dbPath ? { dbPath } : undefined),
    sessions: new MemorySessionStore(),
  };
}

export function readAuthSession(
  auth: AuthRuntime,
  req: IncomingMessage,
): AuthSession | null {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const id = verifySignedSessionId(raw);
  if (!id) return null;
  const session = auth.sessions.get(id);
  if (!session || isSessionExpired(session)) return null;
  const acc = auth.accounts.getAccount(session.accountId);
  if (!acc || acc.disabledAt) return null;
  const mem = auth.accounts.getActiveMembership(
    session.accountId,
    session.companyId,
  );
  if (!mem) return null;
  return auth.sessions.touch(id, new Date().toISOString()) ?? session;
}

/**
 * Identidad efectiva para render / action.
 * Prod: solo cookie. Dev: cookie o query DevSession.
 */
export function resolveRequestIdentity(
  auth: AuthRuntime | undefined,
  req: IncomingMessage,
  boot: AppBootResult,
  query: Record<string, string>,
): {
  readonly mode: "auth" | "dev";
  readonly session: AuthSession | null;
  readonly dev: DevSession;
  readonly setCookies: string[];
} {
  if (auth) {
    const session = readAuthSession(auth, req);
    if (session) {
      const dev: DevSession = {
        roleId: session.roleId,
        parteId: session.parteId ?? "parte-demo-1",
        channel:
          session.kind === "portal_cliente" ? "autoservicio" : "backoffice",
        ...(session.sedeId ? { sedeId: session.sedeId } : {}),
        sedeScoped: Boolean(session.sedeId),
        tenantId: session.companyId,
      };
      return { mode: "auth", session, dev, setCookies: [] };
    }
  }

  if (isProduction() || !allowDevSession()) {
    const dev: DevSession = {
      roleId: boot.roles[0]?.id ?? "gerente",
      parteId: "parte-demo-1",
      channel: "backoffice",
    };
    return { mode: "dev", session: null, dev, setCookies: [] };
  }

  const base = resolveSession(boot, {
    ...(query.role !== undefined ? { role: query.role } : {}),
    ...(query.parte !== undefined ? { parte: query.parte } : {}),
    ...(query.group !== undefined ? { group: query.group } : {}),
    ...(query.view !== undefined ? { view: query.view } : {}),
  });
  const dev: DevSession = {
    ...base,
    ...(query.sede ? { sedeId: query.sede } : {}),
    sedeScoped: query.sedeScoped === "1",
    ...(query.tenant ? { tenantId: query.tenant } : {}),
  };
  return { mode: "dev", session: null, dev, setCookies: [] };
}

function sessionCookies(session: AuthSession): string[] {
  return [
    sessionCookieHeader(signSessionId(session.sessionId)),
    csrfCookieHeader(session.csrfToken),
  ];
}

export function loginWithPassword(
  auth: AuthRuntime,
  input: {
    readonly email: string;
    readonly password: string;
    readonly companyId: string;
    readonly totpCode?: string;
    readonly ipKey?: string;
  },
): { session: AuthSession; cookies: string[] } {
  const ipKey = input.ipKey ?? "unknown";
  if (!loginLimiter.check(`login:${ipKey}:${input.email.toLowerCase()}`)) {
    throw new AccountsError("Demasiados intentos", "rate_limited");
  }
  try {
    const acc = auth.accounts.verifyLogin(input.email, input.password);
    if (acc.totpEnabled || acc.requireTotp) {
      if (!input.totpCode || !acc.totpSecret) {
        throw new AccountsError("Se requiere segundo factor", "totp_required");
      }
      if (!verifyTotp(acc.totpSecret, input.totpCode)) {
        throw new AccountsError("Código 2FA inválido", "totp_invalid");
      }
    }
    const mem = auth.accounts.getActiveMembership(acc.id, input.companyId);
    if (!mem) {
      throw new AccountsError("Sin acceso a esa empresa", "not_found");
    }
    const session = createSession({
      accountId: acc.id,
      companyId: mem.companyId,
      roleId: mem.roleId,
      kind: mem.kind,
      parteId: mem.parteId,
      sedeId: mem.sedeId,
      equipoId: mem.equipoId,
    });
    auth.sessions.put(session);
    logSecurityEvent({
      at: new Date().toISOString(),
      kind: "login_ok",
      accountId: acc.id,
      companyId: mem.companyId,
      emailFp: emailFingerprint(acc.email),
    });
    loginLimiter.reset(`login:${ipKey}:${input.email.toLowerCase()}`);
    return { session, cookies: sessionCookies(session) };
  } catch (e) {
    logSecurityEvent({
      at: new Date().toISOString(),
      kind: "login_fail",
      emailFp: emailFingerprint(input.email),
      companyId: input.companyId,
      detail: e instanceof Error ? e.message : "fail",
    });
    throw e;
  }
}

export function loginWithMagicToken(
  auth: AuthRuntime,
  token: string,
  companyId: string,
): { session: AuthSession; cookies: string[] } {
  const acc = auth.accounts.consumeMagicLink(token);
  const mem = auth.accounts.getActiveMembership(acc.id, companyId);
  if (!mem) {
    throw new AccountsError("Sin acceso a esa empresa", "not_found");
  }
  const session = createSession({
    accountId: acc.id,
    companyId: mem.companyId,
    roleId: mem.roleId,
    kind: mem.kind,
    parteId: mem.parteId,
    sedeId: mem.sedeId,
    equipoId: mem.equipoId,
  });
  auth.sessions.put(session);
  logSecurityEvent({
    at: new Date().toISOString(),
    kind: "login_ok",
    accountId: acc.id,
    companyId: mem.companyId,
    emailFp: emailFingerprint(acc.email),
    detail: "magic_link",
  });
  return { session, cookies: sessionCookies(session) };
}

export function requestMagicLink(
  auth: AuthRuntime,
  email: string,
  companyId: string,
  ipKey = "unknown",
): { token: string } {
  if (!resetLimiter.check(`magic:${ipKey}:${email.toLowerCase()}`)) {
    throw new AccountsError("Demasiados intentos", "rate_limited");
  }
  const { token } = auth.accounts.createMagicLink(email, companyId);
  return { token };
}

export function requestPasswordReset(
  auth: AuthRuntime,
  email: string,
  ipKey = "unknown",
): { token: string | null } {
  if (!resetLimiter.check(`reset:${ipKey}:${email.toLowerCase()}`)) {
    throw new AccountsError("Demasiados intentos", "rate_limited");
  }
  const acc = auth.accounts.getAccountByEmail(email);
  if (!acc) return { token: null };
  const { token } = auth.accounts.createPasswordReset(acc.id);
  return { token };
}

export function completePasswordReset(
  auth: AuthRuntime,
  token: string,
  newPassword: string,
): void {
  const acc = auth.accounts.consumePasswordReset(token, newPassword);
  auth.sessions.revokeAllForAccount(acc.id, new Date().toISOString());
  logSecurityEvent({
    at: new Date().toISOString(),
    kind: "password_reset",
    accountId: acc.id,
  });
}

export function inviteEmployee(
  auth: AuthRuntime,
  session: AuthSession,
  input: {
    readonly email: string;
    readonly roleId: string;
    readonly kind?: MembershipKind;
    readonly sedeId?: string;
    readonly equipoId?: string;
    readonly parteId?: string;
  },
): { token: string } {
  if (!inviteLimiter.check(`invite:${session.companyId}`)) {
    throw new AccountsError("Demasiadas invitaciones", "rate_limited");
  }
  if (session.kind !== "dueno") {
    throw new AccountsError("Solo el dueño invita", "forbidden");
  }
  const { token } = auth.accounts.createInvitation({
    email: input.email,
    companyId: session.companyId,
    kind: input.kind ?? "empleado",
    roleId: input.roleId,
    ...(input.sedeId !== undefined ? { sedeId: input.sedeId } : {}),
    ...(input.equipoId !== undefined ? { equipoId: input.equipoId } : {}),
    ...(input.parteId !== undefined ? { parteId: input.parteId } : {}),
    invitedByAccountId: session.accountId,
  });
  logSecurityEvent({
    at: new Date().toISOString(),
    kind: "invite_sent",
    accountId: session.accountId,
    companyId: session.companyId,
    emailFp: emailFingerprint(input.email),
  });
  return { token };
}

export function acceptInvite(
  auth: AuthRuntime,
  token: string,
  opts: { readonly password?: string; readonly displayName?: string },
): { session: AuthSession; cookies: string[] } {
  const { account, membership } = auth.accounts.acceptInvitation(token, opts);
  const session = createSession({
    accountId: account.id,
    companyId: membership.companyId,
    roleId: membership.roleId,
    kind: membership.kind,
    parteId: membership.parteId,
    sedeId: membership.sedeId,
    equipoId: membership.equipoId,
  });
  auth.sessions.put(session);
  logSecurityEvent({
    at: new Date().toISOString(),
    kind: "invite_accepted",
    accountId: account.id,
    companyId: membership.companyId,
  });
  return { session, cookies: sessionCookies(session) };
}

export function revokeEmployeeAccess(
  auth: AuthRuntime,
  session: AuthSession,
  accountId: string,
): void {
  if (session.kind !== "dueno") {
    throw new AccountsError("Solo el dueño da de baja", "forbidden");
  }
  const at = new Date().toISOString();
  auth.accounts.revokeMembership(accountId, session.companyId, at);
  auth.sessions.revokeAllForAccount(accountId, at);
  logSecurityEvent({
    at,
    kind: "membership_revoked",
    accountId,
    companyId: session.companyId,
  });
}

/** Multiempresa: cambia empresa activa (nueva sesión, misma familia). */
export function switchActiveCompany(
  auth: AuthRuntime,
  session: AuthSession,
  companyId: string,
): { session: AuthSession; cookies: string[] } {
  const mem = auth.accounts.getActiveMembership(session.accountId, companyId);
  if (!mem) {
    throw new AccountsError("Sin acceso a esa empresa", "not_found");
  }
  const at = new Date().toISOString();
  auth.sessions.revoke(session.sessionId, at);
  const next = createSession({
    accountId: session.accountId,
    companyId: mem.companyId,
    roleId: mem.roleId,
    kind: mem.kind,
    parteId: mem.parteId,
    sedeId: mem.sedeId,
    equipoId: mem.equipoId,
    familyId: session.familyId,
  });
  auth.sessions.put(next);
  logSecurityEvent({
    at,
    kind: "role_change",
    accountId: session.accountId,
    companyId: mem.companyId,
    detail: `switch_company from=${session.companyId}`,
  });
  return { session: next, cookies: sessionCookies(next) };
}

export function logoutSession(
  auth: AuthRuntime,
  session: AuthSession,
  allDevices: boolean,
): string[] {
  const at = new Date().toISOString();
  if (allDevices) {
    auth.sessions.revokeAllForAccount(session.accountId, at);
    logSecurityEvent({
      at,
      kind: "logout_all",
      accountId: session.accountId,
      companyId: session.companyId,
    });
  } else {
    auth.sessions.revoke(session.sessionId, at);
    logSecurityEvent({
      at,
      kind: "logout",
      accountId: session.accountId,
      companyId: session.companyId,
    });
  }
  return [clearSessionCookieHeader()];
}

export function requireCsrf(
  session: AuthSession | null,
  form: Record<string, string>,
  headers: IncomingMessage["headers"],
): void {
  if (!session) {
    if (isProduction()) throw new CsrfError("Sesión requerida");
    return;
  }
  const token =
    form.csrfToken ??
    (typeof headers["x-csrf-token"] === "string"
      ? headers["x-csrf-token"]
      : undefined);
  try {
    assertCsrf(session, token);
  } catch (e) {
    logSecurityEvent({
      at: new Date().toISOString(),
      kind: "csrf_reject",
      accountId: session.accountId,
      companyId: session.companyId,
    });
    throw e;
  }
}

/**
 * Identidad para /action: sesión auth manda; en prod nunca se usa el form.
 */
export function identityForAction(
  auth: AuthRuntime | undefined,
  req: IncomingMessage,
  form: Record<string, string>,
  boot: AppBootResult,
): {
  readonly roleId: string;
  readonly parteId: string;
  readonly channel: string;
  readonly sedeId?: string;
  readonly sedeScoped?: boolean;
  readonly companyId?: string;
  readonly session: AuthSession | null;
} {
  const session = auth ? readAuthSession(auth, req) : null;
  if (session) {
    return {
      roleId: session.roleId,
      parteId: session.parteId ?? "parte-demo-1",
      channel: session.kind === "portal_cliente" ? "autoservicio" : "backoffice",
      ...(session.sedeId ? { sedeId: session.sedeId } : {}),
      sedeScoped: Boolean(session.sedeId),
      companyId: session.companyId,
      session,
    };
  }
  if (isProduction()) {
    logSecurityEvent({
      at: new Date().toISOString(),
      kind: "session_reject",
      detail: "action sin sesión en producción",
    });
    throw new AccountsError("Debe iniciar sesión", "not_found");
  }
  return {
    roleId: form.roleId ?? boot.roles[0]?.id ?? "gerente",
    parteId: form.parteId ?? "parte-demo-1",
    channel: form.channel ?? "backoffice",
    ...(form.sedeId ? { sedeId: form.sedeId } : {}),
    sedeScoped: form.sedeScoped === "1",
    session: null,
  };
}

export { rotateSession, CSRF_COOKIE };
