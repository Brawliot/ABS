/**
 * Semillas de cuentas de demo / E2E (no producción).
 */

import type { AccountStore } from "./store.js";
import type { MembershipKind } from "./types.js";

export interface SeedAccountSpec {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly companyId: string;
  readonly roleId: string;
  readonly kind?: MembershipKind;
  readonly sedeId?: string;
  readonly equipoId?: string;
  readonly parteId?: string;
  readonly requireTotp?: boolean;
}

/** Contraseña fija solo para tests/demo. */
export const DEMO_PASSWORD = "AbsDemo!2026";

export function seedAccount(
  store: AccountStore,
  spec: SeedAccountSpec,
): { accountId: string; membershipId: string } {
  let acc = store.getAccountByEmail(spec.email);
  if (!acc) {
    acc = store.createAccount({
      email: spec.email,
      password: spec.password,
      displayName: spec.displayName,
      ...(spec.requireTotp !== undefined
        ? { requireTotp: spec.requireTotp }
        : {}),
    });
  }
  const existing = store.getActiveMembership(acc.id, spec.companyId);
  if (existing) {
    return { accountId: acc.id, membershipId: existing.id };
  }
  const mem = store.addMembership({
    accountId: acc.id,
    companyId: spec.companyId,
    kind: spec.kind ?? "empleado",
    roleId: spec.roleId,
    ...(spec.sedeId !== undefined ? { sedeId: spec.sedeId } : {}),
    ...(spec.equipoId !== undefined ? { equipoId: spec.equipoId } : {}),
    ...(spec.parteId !== undefined ? { parteId: spec.parteId } : {}),
  });
  return { accountId: acc.id, membershipId: mem.id };
}

/**
 * Una cuenta por rol del boot (perfil), más portal cliente si existe rol cliente.
 */
export function seedProfileAccounts(
  store: AccountStore,
  companyId: string,
  roles: readonly { readonly id: string }[],
  options?: { readonly password?: string; readonly parteId?: string },
): readonly SeedAccountSpec[] {
  const password = options?.password ?? DEMO_PASSWORD;
  const parteId = options?.parteId ?? "parte-demo-1";
  const specs: SeedAccountSpec[] = [];
  for (const r of roles) {
    const isPortal = r.id === "cliente" || r.id.startsWith("cliente_");
    const spec: SeedAccountSpec = {
      email: `${r.id}@${companyId}.demo.local`,
      password,
      displayName: `Demo ${r.id}`,
      companyId,
      roleId: r.id,
      kind: isPortal ? "portal_cliente" : r.id.includes("duen") || r.id === "gerente" || r.id === "director_medico" || r.id === "propietario"
        ? "dueno"
        : "empleado",
      ...(isPortal ? { parteId } : {}),
    };
    seedAccount(store, spec);
    specs.push(spec);
  }
  return specs;
}
