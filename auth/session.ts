/**
 * Sesiones firmadas: cookies HttpOnly, Secure (prod), SameSite=Lax.
 * Rotación al login; caducidad por inactividad; logout-all.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { allowDevSession, isProduction, sessionSecret } from "./env.js";
import type { AccountId, CompanyId, MembershipKind } from "../accounts/types.js";

export const SESSION_COOKIE = "abs_session";
export const CSRF_COOKIE = "abs_csrf";

export interface AuthSession {
  readonly sessionId: string;
  readonly accountId: AccountId;
  readonly companyId: CompanyId;
  readonly roleId: string;
  readonly kind: MembershipKind;
  readonly parteId: string | null;
  readonly sedeId: string | null;
  readonly equipoId: string | null;
  readonly csrfToken: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  /** Familia para rotación / logout-all. */
  readonly familyId: string;
  readonly revokedAt: string | null;
}

export interface SessionStore {
  put(session: AuthSession): void;
  get(sessionId: string): AuthSession | undefined;
  touch(sessionId: string, at: string): AuthSession | undefined;
  revoke(sessionId: string, at: string): void;
  revokeFamily(familyId: string, at: string): number;
  revokeAllForAccount(accountId: AccountId, at: string): number;
}

export class MemorySessionStore implements SessionStore {
  private readonly map = new Map<string, AuthSession>();

  put(session: AuthSession): void {
    this.map.set(session.sessionId, session);
  }

  get(sessionId: string): AuthSession | undefined {
    return this.map.get(sessionId);
  }

  touch(sessionId: string, at: string): AuthSession | undefined {
    const prev = this.map.get(sessionId);
    if (!prev || prev.revokedAt) return undefined;
    const next = { ...prev, lastSeenAt: at };
    this.map.set(sessionId, next);
    return next;
  }

  revoke(sessionId: string, at: string): void {
    const prev = this.map.get(sessionId);
    if (!prev) return;
    this.map.set(sessionId, { ...prev, revokedAt: at });
  }

  revokeFamily(familyId: string, at: string): number {
    let n = 0;
    for (const [id, s] of this.map) {
      if (s.familyId === familyId && !s.revokedAt) {
        this.map.set(id, { ...s, revokedAt: at });
        n += 1;
      }
    }
    return n;
  }

  revokeAllForAccount(accountId: AccountId, at: string): number {
    let n = 0;
    for (const [id, s] of this.map) {
      if (s.accountId === accountId && !s.revokedAt) {
        this.map.set(id, { ...s, revokedAt: at });
        n += 1;
      }
    }
    return n;
  }
}

const IDLE_MS = () =>
  Number(process.env.ABS_SESSION_IDLE_MS ?? 8 * 3600_000);

export function createSession(input: {
  readonly accountId: AccountId;
  readonly companyId: CompanyId;
  readonly roleId: string;
  readonly kind: MembershipKind;
  readonly parteId?: string | null;
  readonly sedeId?: string | null;
  readonly equipoId?: string | null;
  readonly familyId?: string;
}): AuthSession {
  const at = new Date().toISOString();
  return {
    sessionId: `ses_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    accountId: input.accountId,
    companyId: input.companyId,
    roleId: input.roleId,
    kind: input.kind,
    parteId: input.parteId ?? null,
    sedeId: input.sedeId ?? null,
    equipoId: input.equipoId ?? null,
    csrfToken: randomUUID().replace(/-/g, ""),
    createdAt: at,
    lastSeenAt: at,
    familyId: input.familyId ?? `fam_${randomUUID().slice(0, 12)}`,
    revokedAt: null,
  };
}

/** Rotación: nueva sesión, misma familia; revoca la anterior. */
export function rotateSession(
  store: SessionStore,
  prev: AuthSession,
): AuthSession {
  const at = new Date().toISOString();
  store.revoke(prev.sessionId, at);
  const next = createSession({
    accountId: prev.accountId,
    companyId: prev.companyId,
    roleId: prev.roleId,
    kind: prev.kind,
    parteId: prev.parteId,
    sedeId: prev.sedeId,
    equipoId: prev.equipoId,
    familyId: prev.familyId,
  });
  store.put(next);
  return next;
}

export function isSessionExpired(session: AuthSession, nowMs = Date.now()): boolean {
  if (session.revokedAt) return true;
  const last = Date.parse(session.lastSeenAt);
  return nowMs - last > IDLE_MS();
}

export function signSessionId(sessionId: string): string {
  const sig = createHmac("sha256", sessionSecret())
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${sig}`;
}

export function verifySignedSessionId(value: string): string | null {
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const id = value.slice(0, i);
  const sig = value.slice(i + 1);
  const expected = createHmac("sha256", sessionSecret())
    .update(id)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return id;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function sessionCookieHeader(
  signedValue: string,
  maxAgeSec = Math.floor(IDLE_MS() / 1000),
): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(signedValue)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}

export function csrfCookieHeader(token: string): string {
  const parts = [
    `${CSRF_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(IDLE_MS() / 1000)}`,
  ];
  if (isProduction()) parts.push("Secure");
  // CSRF cookie legible por JS solo si double-submit; preferimos header/form
  return parts.join("; ");
}

export { allowDevSession, isProduction };
