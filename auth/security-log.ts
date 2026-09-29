/**
 * Registro de seguridad (sin PII en claro).
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoSecretInLogs } from "./env.js";

export type SecurityEventKind =
  | "login_ok"
  | "login_fail"
  | "logout"
  | "logout_all"
  | "invite_sent"
  | "invite_accepted"
  | "password_reset"
  | "membership_revoked"
  | "role_change"
  | "csrf_reject"
  | "session_reject"
  | "personal_data_access"
  | "anomaly";

export interface SecurityEvent {
  readonly at: string;
  readonly kind: SecurityEventKind;
  readonly accountId?: string;
  readonly companyId?: string;
  readonly emailFp?: string;
  readonly detail?: string;
  readonly ipHash?: string;
}

const memory: SecurityEvent[] = [];

export function logSecurityEvent(ev: SecurityEvent): void {
  const line = JSON.stringify(ev);
  assertNoSecretInLogs(line);
  memory.push(ev);
  try {
    const dir = join(
      dirname(fileURLToPath(import.meta.url)),
      "../tmp/security-logs",
    );
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "security.jsonl"), line + "\n", "utf8");
  } catch {
    /* best-effort file sink */
  }
}

export function listSecurityEvents(): readonly SecurityEvent[] {
  return memory;
}

export function clearSecurityEventsForTests(): void {
  memory.length = 0;
}
