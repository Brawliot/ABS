/**
 * Parte viva: alta y edición de clientes, proveedores… (capa 0, instancias).
 * La identidad (PII) se guarda en ParteIdentityStore, nunca en eventos.
 */

import type { PartePersonalData } from "../policies/identity.js";
import { ParteSubtypes, type ParteSubtype } from "./subtypes.js";

export interface ParteInput {
  readonly subtype: ParteSubtype;
  readonly personal: PartePersonalData;
}

export const PARTE_SUBTYPE_LABELS: Readonly<Record<ParteSubtype, string>> = {
  cliente: "Cliente",
  proveedor: "Proveedor",
  tercero_intermediado: "Tercero intermediado",
  garante: "Garante",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: string | undefined): string | undefined {
  const t = (v ?? "").trim();
  return t === "" ? undefined : t;
}

/**
 * Normaliza y valida un formulario de Parte.
 * Devuelve la entrada lista para guardar o la lista de errores (en castellano).
 */
export function parseParteForm(
  form: Readonly<Record<string, string | undefined>>,
): { ok: true; value: ParteInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const subtype = clean(form.subtype);
  if (!subtype || !(ParteSubtypes as readonly string[]).includes(subtype)) {
    errors.push("Tipo de parte no válido.");
  }
  const displayName = clean(form.displayName);
  if (!displayName) errors.push("El nombre es obligatorio.");
  else if (displayName.length > 200) errors.push("El nombre es demasiado largo.");
  const email = clean(form.email);
  if (email && !EMAIL_RE.test(email)) errors.push("El correo no es válido.");
  if (errors.length > 0) return { ok: false, errors };

  const taxId = clean(form.taxId)?.toUpperCase();
  const phone = clean(form.phone);
  const address = clean(form.address);
  return {
    ok: true,
    value: {
      subtype: subtype as ParteSubtype,
      personal: {
        displayName: displayName!,
        ...(email ? { email } : {}),
        ...(taxId ? { taxId } : {}),
        ...(phone ? { phone } : {}),
        ...(address ? { address } : {}),
      },
    },
  };
}
