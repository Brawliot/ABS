/**
 * Almacén de cuentas / membresías / invitaciones (SQLite o memoria).
 */

import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { hashPassword, hashToken, randomToken, verifyPassword } from "./password.js";
import {
  AccountsError,
  type AccountId,
  type AccountRecord,
  type CompanyId,
  type InvitationRecord,
  type MagicLinkRecord,
  type MembershipKind,
  type MembershipRecord,
  type PasswordResetRecord,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export class AccountStore {
  private readonly db: Database.Database;

  constructor(options?: { readonly dbPath?: string }) {
    this.db = new Database(options?.dbPath ?? ":memory:");
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT,
        display_name TEXT NOT NULL,
        totp_secret TEXT,
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        require_totp INTEGER NOT NULL DEFAULT 0,
        disabled_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memberships (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        role_id TEXT NOT NULL,
        sede_id TEXT,
        equipo_id TEXT,
        parte_id TEXT,
        invited_at TEXT NOT NULL,
        accepted_at TEXT,
        revoked_at TEXT,
        UNIQUE(account_id, company_id)
      );
      CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE,
        company_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        role_id TEXT NOT NULL,
        sede_id TEXT,
        equipo_id TEXT,
        parte_id TEXT,
        token_hash TEXT NOT NULL,
        invited_by TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        accepted_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS password_resets (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS magic_links (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE,
        company_id TEXT,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  createAccount(input: {
    readonly email: string;
    readonly password?: string;
    readonly displayName: string;
    readonly requireTotp?: boolean;
  }): AccountRecord {
    const email = normalizeEmail(input.email);
    const id = `acc_${randomUUID().slice(0, 12)}`;
    const at = nowIso();
    const passwordHash =
      input.password !== undefined ? hashPassword(input.password) : null;
    try {
      this.db
        .prepare(
          `INSERT INTO accounts (id,email,password_hash,display_name,totp_secret,totp_enabled,require_totp,disabled_at,created_at,updated_at)
           VALUES (?,?,?,?,NULL,0,?,NULL,?,?)`,
        )
        .run(
          id,
          email,
          passwordHash,
          input.displayName,
          input.requireTotp ? 1 : 0,
          at,
          at,
        );
    } catch {
      throw new AccountsError("El correo ya está registrado", "conflict");
    }
    return this.getAccount(id)!;
  }

  getAccount(id: AccountId): AccountRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM accounts WHERE id = ?`)
      .get(id) as AccountRow | undefined;
    return row ? mapAccount(row) : undefined;
  }

  getAccountByEmail(email: string): AccountRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM accounts WHERE email = ? COLLATE NOCASE`)
      .get(normalizeEmail(email)) as AccountRow | undefined;
    return row ? mapAccount(row) : undefined;
  }

  disableAccount(accountId: AccountId, at = nowIso()): void {
    this.db
      .prepare(
        `UPDATE accounts SET disabled_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(at, at, accountId);
  }

  setPassword(accountId: AccountId, password: string, at = nowIso()): void {
    this.db
      .prepare(
        `UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?`,
      )
      .run(hashPassword(password), at, accountId);
  }

  enableTotp(accountId: AccountId, secret: string, at = nowIso()): void {
    this.db
      .prepare(
        `UPDATE accounts SET totp_secret = ?, totp_enabled = 1, updated_at = ? WHERE id = ?`,
      )
      .run(secret, at, accountId);
  }

  verifyLogin(email: string, password: string): AccountRecord {
    const acc = this.getAccountByEmail(email);
    if (!acc || !acc.passwordHash) {
      throw new AccountsError("Credenciales incorrectas");
    }
    if (acc.disabledAt) {
      throw new AccountsError("Cuenta deshabilitada", "disabled");
    }
    if (!verifyPassword(password, acc.passwordHash)) {
      throw new AccountsError("Credenciales incorrectas");
    }
    return acc;
  }

  addMembership(input: {
    readonly accountId: AccountId;
    readonly companyId: CompanyId;
    readonly kind: MembershipKind;
    readonly roleId: string;
    readonly sedeId?: string | null;
    readonly equipoId?: string | null;
    readonly parteId?: string | null;
    readonly acceptedAt?: string | null;
  }): MembershipRecord {
    const id = `mem_${randomUUID().slice(0, 12)}`;
    const at = nowIso();
    this.db
      .prepare(
        `INSERT INTO memberships (id,account_id,company_id,kind,role_id,sede_id,equipo_id,parte_id,invited_at,accepted_at,revoked_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,NULL)`,
      )
      .run(
        id,
        input.accountId,
        input.companyId,
        input.kind,
        input.roleId,
        input.sedeId ?? null,
        input.equipoId ?? null,
        input.parteId ?? null,
        at,
        input.acceptedAt ?? at,
      );
    return this.getMembership(id)!;
  }

  getMembership(id: string): MembershipRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM memberships WHERE id = ?`)
      .get(id) as MemRow | undefined;
    return row ? mapMem(row) : undefined;
  }

  listMemberships(accountId: AccountId): MembershipRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM memberships WHERE account_id = ? AND revoked_at IS NULL`,
      )
      .all(accountId) as MemRow[];
    return rows.map(mapMem);
  }

  getActiveMembership(
    accountId: AccountId,
    companyId: CompanyId,
  ): MembershipRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM memberships WHERE account_id = ? AND company_id = ? AND revoked_at IS NULL AND accepted_at IS NOT NULL`,
      )
      .get(accountId, companyId) as MemRow | undefined;
    return row ? mapMem(row) : undefined;
  }

  revokeMembership(accountId: AccountId, companyId: CompanyId, at = nowIso()): void {
    this.db
      .prepare(
        `UPDATE memberships SET revoked_at = ? WHERE account_id = ? AND company_id = ? AND revoked_at IS NULL`,
      )
      .run(at, accountId, companyId);
  }

  createInvitation(input: {
    readonly email: string;
    readonly companyId: CompanyId;
    readonly kind: MembershipKind;
    readonly roleId: string;
    readonly sedeId?: string | null;
    readonly equipoId?: string | null;
    readonly parteId?: string | null;
    readonly invitedByAccountId: AccountId;
    readonly ttlMs?: number;
  }): { invitation: InvitationRecord; token: string } {
    const token = randomToken(32);
    const id = `inv_${randomUUID().slice(0, 12)}`;
    const at = nowIso();
    const expires = new Date(Date.now() + (input.ttlMs ?? 7 * 86400_000)).toISOString();
    this.db
      .prepare(
        `INSERT INTO invitations (id,email,company_id,kind,role_id,sede_id,equipo_id,parte_id,token_hash,invited_by,expires_at,accepted_at,revoked_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?)`,
      )
      .run(
        id,
        normalizeEmail(input.email),
        input.companyId,
        input.kind,
        input.roleId,
        input.sedeId ?? null,
        input.equipoId ?? null,
        input.parteId ?? null,
        hashToken(token),
        input.invitedByAccountId,
        expires,
        at,
      );
    const invitation = this.getInvitation(id)!;
    return { invitation, token };
  }

  getInvitation(id: string): InvitationRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM invitations WHERE id = ?`)
      .get(id) as InvRow | undefined;
    return row ? mapInv(row) : undefined;
  }

  acceptInvitation(
    token: string,
    opts: { readonly password?: string; readonly displayName?: string },
  ): { account: AccountRecord; membership: MembershipRecord } {
    const th = hashToken(token);
    const row = this.db
      .prepare(
        `SELECT * FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
      )
      .get(th) as InvRow | undefined;
    if (!row) throw new AccountsError("Invitación inválida", "invite_invalid");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new AccountsError("Invitación caducada", "invite_invalid");
    }
    let account = this.getAccountByEmail(row.email);
    if (!account) {
      account = this.createAccount({
        email: row.email,
        ...(opts.password !== undefined ? { password: opts.password } : {}),
        displayName: opts.displayName ?? row.email.split("@")[0] ?? "Usuario",
      });
    } else if (opts.password) {
      this.setPassword(account.id, opts.password);
      account = this.getAccount(account.id)!;
    }
    const at = nowIso();
    this.db
      .prepare(`UPDATE invitations SET accepted_at = ? WHERE id = ?`)
      .run(at, row.id);
    const existing = this.getActiveMembership(account.id, row.company_id);
    if (existing) {
      return { account, membership: existing };
    }
    const membership = this.addMembership({
      accountId: account.id,
      companyId: row.company_id,
      kind: row.kind as MembershipKind,
      roleId: row.role_id,
      sedeId: row.sede_id,
      equipoId: row.equipo_id,
      parteId: row.parte_id,
      acceptedAt: at,
    });
    return { account, membership };
  }

  createPasswordReset(accountId: AccountId, ttlMs = 3600_000): {
    record: PasswordResetRecord;
    token: string;
  } {
    const token = randomToken(32);
    const id = `pwr_${randomUUID().slice(0, 12)}`;
    const at = nowIso();
    const expires = new Date(Date.now() + ttlMs).toISOString();
    this.db
      .prepare(
        `INSERT INTO password_resets (id,account_id,token_hash,expires_at,used_at,created_at)
         VALUES (?,?,?,?,NULL,?)`,
      )
      .run(id, accountId, hashToken(token), expires, at);
    const record: PasswordResetRecord = {
      id,
      accountId,
      tokenHash: hashToken(token),
      expiresAt: expires,
      usedAt: null,
      createdAt: at,
    };
    return { record, token };
  }

  consumePasswordReset(token: string, newPassword: string): AccountRecord {
    const th = hashToken(token);
    const row = this.db
      .prepare(
        `SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL`,
      )
      .get(th) as {
      id: string;
      account_id: string;
      expires_at: string;
    } | undefined;
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      throw new AccountsError("Enlace de recuperación inválido o caducado");
    }
    const at = nowIso();
    this.db
      .prepare(`UPDATE password_resets SET used_at = ? WHERE id = ?`)
      .run(at, row.id);
    this.setPassword(row.account_id, newPassword, at);
    const acc = this.getAccount(row.account_id);
    if (!acc) throw new AccountsError("Cuenta no encontrada", "not_found");
    return acc;
  }

  createMagicLink(
    email: string,
    companyId: CompanyId | null,
    ttlMs = 900_000,
  ): { record: MagicLinkRecord; token: string } {
    const token = randomToken(32);
    const id = `mag_${randomUUID().slice(0, 12)}`;
    const at = nowIso();
    const expires = new Date(Date.now() + ttlMs).toISOString();
    this.db
      .prepare(
        `INSERT INTO magic_links (id,email,company_id,token_hash,expires_at,used_at,created_at)
         VALUES (?,?,?,?,?,NULL,?)`,
      )
      .run(id, normalizeEmail(email), companyId, hashToken(token), expires, at);
    return {
      record: {
        id,
        email: normalizeEmail(email),
        companyId,
        tokenHash: hashToken(token),
        expiresAt: expires,
        usedAt: null,
        createdAt: at,
      },
      token,
    };
  }

  consumeMagicLink(token: string): AccountRecord {
    const th = hashToken(token);
    const row = this.db
      .prepare(
        `SELECT * FROM magic_links WHERE token_hash = ? AND used_at IS NULL`,
      )
      .get(th) as {
      id: string;
      email: string;
      expires_at: string;
    } | undefined;
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      throw new AccountsError("Enlace mágico inválido o caducado");
    }
    const at = nowIso();
    this.db
      .prepare(`UPDATE magic_links SET used_at = ? WHERE id = ?`)
      .run(at, row.id);
    let acc = this.getAccountByEmail(row.email);
    if (!acc) {
      acc = this.createAccount({
        email: row.email,
        displayName: row.email.split("@")[0] ?? "Usuario",
      });
    }
    if (acc.disabledAt) {
      throw new AccountsError("Cuenta deshabilitada", "disabled");
    }
    return acc;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface AccountRow {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string;
  totp_secret: string | null;
  totp_enabled: number;
  require_totp: number;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapAccount(r: AccountRow): AccountRecord {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    displayName: r.display_name,
    totpSecret: r.totp_secret,
    totpEnabled: r.totp_enabled === 1,
    requireTotp: r.require_totp === 1,
    disabledAt: r.disabled_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface MemRow {
  id: string;
  account_id: string;
  company_id: string;
  kind: string;
  role_id: string;
  sede_id: string | null;
  equipo_id: string | null;
  parte_id: string | null;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

function mapMem(r: MemRow): MembershipRecord {
  return {
    id: r.id,
    accountId: r.account_id,
    companyId: r.company_id,
    kind: r.kind as MembershipKind,
    roleId: r.role_id,
    sedeId: r.sede_id,
    equipoId: r.equipo_id,
    parteId: r.parte_id,
    invitedAt: r.invited_at,
    acceptedAt: r.accepted_at,
    revokedAt: r.revoked_at,
  };
}

interface InvRow {
  id: string;
  email: string;
  company_id: string;
  kind: string;
  role_id: string;
  sede_id: string | null;
  equipo_id: string | null;
  parte_id: string | null;
  token_hash: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function mapInv(r: InvRow): InvitationRecord {
  return {
    id: r.id,
    email: r.email,
    companyId: r.company_id,
    kind: r.kind as MembershipKind,
    roleId: r.role_id,
    sedeId: r.sede_id,
    equipoId: r.equipo_id,
    parteId: r.parte_id,
    tokenHash: r.token_hash,
    invitedByAccountId: r.invited_by,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  };
}

/** Fingerprint estable de email para logs (sin PII). */
export function emailFingerprint(email: string): string {
  return createHash("sha256")
    .update(normalizeEmail(email))
    .digest("hex")
    .slice(0, 16);
}
