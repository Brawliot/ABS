/**
 * Cuentas de usuario — identidad de acceso (no reglas de negocio).
 * Los permisos siguen en Juez + Filtro.
 */

export type AccountId = string;
export type CompanyId = string;
export type MembershipKind = "empleado" | "portal_cliente" | "dueno";

export interface AccountRecord {
  readonly id: AccountId;
  readonly email: string;
  /** argon2id encoded (salt incluido). null si solo magic-link. */
  readonly passwordHash: string | null;
  readonly displayName: string;
  readonly totpSecret: string | null;
  readonly totpEnabled: boolean;
  /** Dueño puede exigir 2FA. */
  readonly requireTotp: boolean;
  readonly disabledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Vínculo cuenta ↔ empresa (una petición = una empresa activa). */
export interface MembershipRecord {
  readonly id: string;
  readonly accountId: AccountId;
  readonly companyId: CompanyId;
  readonly kind: MembershipKind;
  readonly roleId: string;
  readonly sedeId: string | null;
  readonly equipoId: string | null;
  /** Portal: Parte del cliente. */
  readonly parteId: string | null;
  readonly invitedAt: string;
  readonly acceptedAt: string | null;
  readonly revokedAt: string | null;
}

export interface InvitationRecord {
  readonly id: string;
  readonly email: string;
  readonly companyId: CompanyId;
  readonly kind: MembershipKind;
  readonly roleId: string;
  readonly sedeId: string | null;
  readonly equipoId: string | null;
  readonly parteId: string | null;
  readonly tokenHash: string;
  readonly invitedByAccountId: AccountId;
  readonly expiresAt: string;
  readonly acceptedAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
}

export interface PasswordResetRecord {
  readonly id: string;
  readonly accountId: AccountId;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
  readonly createdAt: string;
}

export interface MagicLinkRecord {
  readonly id: string;
  readonly email: string;
  readonly companyId: CompanyId | null;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
  readonly createdAt: string;
}

export class AccountsError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_credentials"
      | "disabled"
      | "totp_required"
      | "totp_invalid"
      | "invite_invalid"
      | "rate_limited"
      | "conflict"
      | "not_found"
      | "forbidden" = "invalid_credentials",
  ) {
    super(message);
    this.name = "AccountsError";
  }
}
