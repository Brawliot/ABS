/**
 * Factura (RD 1619/2012): documento inmutable que se expide a partir de un
 * expediente. Serie + número correlativo por año, datos del emisor y del
 * destinatario congelados al expedir, desglose de IVA por tipo y huella
 * encadenada (cada factura resume la anterior: alterar una rompe la cadena).
 *
 * No se edita ni se borra: se corrige con una rectificativa.
 * Sin envío a la AEAT (Verifactu): fuera de este módulo.
 */

import { createHash } from "node:crypto";
import type { LineaDatos } from "../core/events.js";
import { canonicalStringify } from "../policies/compiler.js";
import { basesPorTipo, calcularTotales } from "./transaccion.js";

/** F = completa, T = simplificada (ticket), R = rectificativa. */
export type SerieFactura = "F" | "T" | "R";
export type TipoFactura = "completa" | "simplificada" | "rectificativa";

/** Límite de la factura simplificada (IVA incluido), en céntimos. */
export const LIMITE_SIMPLIFICADA_CENTIMOS = 40_000;

export interface DatosEmisor {
  readonly razonSocial: string;
  readonly nif: string;
  readonly domicilio: string;
}

export interface DatosReceptor {
  readonly nombre: string;
  readonly nif?: string;
  readonly domicilio?: string;
}

export interface DesgloseIva {
  readonly tipo: number;
  readonly base: number;
  readonly cuota: number;
}

export interface Factura {
  readonly id: string;
  readonly tenantId: string;
  readonly serie: SerieFactura;
  readonly anio: number;
  readonly numero: number;
  /** «F2026-0001» */
  readonly codigo: string;
  readonly tipo: TipoFactura;
  readonly expedienteId: string;
  readonly parteId: string;
  /** AAAA-MM-DD */
  readonly fechaExpedicion: string;
  /** Fecha de la operación si es distinta de la de expedición. */
  readonly fechaOperacion?: string;
  readonly emisor: DatosEmisor;
  /** Ausente en la simplificada sin datos del cliente. */
  readonly receptor?: DatosReceptor;
  readonly lineas: readonly LineaDatos[];
  readonly desglose: readonly DesgloseIva[];
  readonly base: number;
  readonly iva: number;
  readonly total: number;
  /** Rectificativa: factura que corrige y motivo. */
  readonly rectificaA?: string;
  readonly motivo?: string;
  readonly huellaAnterior: string;
  readonly huella: string;
  readonly expedidaEn: string;
  readonly expedidaPor: string;
}

// ─── NIF / NIE / CIF ────────────────────────────────────────────────────

const DNI_LETRAS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** Normaliza: mayúsculas, sin espacios, guiones ni puntos. */
export function normalizarNif(raw: string): string {
  return raw.toUpperCase().replace(/[\s.-]/g, "");
}

/** Comprueba DNI, NIE y CIF, incluida la letra o dígito de control. */
export function nifValido(raw: string): boolean {
  const nif = normalizarNif(raw);
  if (/^\d{8}[A-Z]$/.test(nif)) {
    return DNI_LETRAS[Number(nif.slice(0, 8)) % 23] === nif[8];
  }
  if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) {
    const num = "XYZ".indexOf(nif[0]!) + nif.slice(1, 8);
    return DNI_LETRAS[Number(num) % 23] === nif[8];
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) {
    const d = nif.slice(1, 8).split("").map(Number);
    let suma = 0;
    d.forEach((n, i) => {
      if (i % 2 === 1) suma += n;
      else {
        const x = n * 2;
        suma += Math.floor(x / 10) + (x % 10);
      }
    });
    const control = (10 - (suma % 10)) % 10;
    const letra = "JABCDEFGHI"[control]!;
    const c = nif[8]!;
    if ("PQRSNW".includes(nif[0]!)) return c === letra;
    if ("ABEH".includes(nif[0]!)) return c === String(control);
    return c === String(control) || c === letra;
  }
  return false;
}

// ─── Reglas de expedición ───────────────────────────────────────────────

export function codigoFactura(serie: SerieFactura, anio: number, numero: number): string {
  return `${serie}${anio}-${String(numero).padStart(4, "0")}`;
}

export function validarEmisor(e: Partial<DatosEmisor> | undefined): string[] {
  const errors: string[] = [];
  if (!e?.razonSocial?.trim()) errors.push("Falta la razón social de la empresa.");
  if (!e?.nif?.trim()) errors.push("Falta el NIF de la empresa.");
  else if (!nifValido(e.nif)) errors.push("El NIF de la empresa no es válido.");
  if (!e?.domicilio?.trim()) errors.push("Falta el domicilio fiscal de la empresa.");
  return errors;
}

/**
 * Completa si el cliente tiene NIF válido y domicilio; si no, simplificada
 * hasta 400 € (IVA incluido); por encima, no se puede expedir.
 */
export function decidirTipo(
  receptor: DatosReceptor | undefined,
  totalCentimos: number,
): { ok: true; tipo: "completa" | "simplificada" } | { ok: false; error: string } {
  const completo =
    !!receptor?.nif && nifValido(receptor.nif) && !!receptor.domicilio?.trim();
  if (completo) return { ok: true, tipo: "completa" };
  if (totalCentimos <= LIMITE_SIMPLIFICADA_CENTIMOS) return { ok: true, tipo: "simplificada" };
  return {
    ok: false,
    error:
      "Para una factura de más de 400 € hacen falta el NIF y la dirección del cliente. Complétalos en su ficha.",
  };
}

export function desgloseIva(lineas: readonly LineaDatos[]): {
  desglose: DesgloseIva[];
  base: number;
  iva: number;
  total: number;
} {
  const t = calcularTotales(lineas);
  const bases = basesPorTipo(lineas);
  const desglose = Object.keys(bases)
    .map((k) => ({ tipo: Number(k), base: bases[k]!, cuota: t.ivaPorTipo[k] ?? 0 }))
    .sort((a, b) => b.tipo - a.tipo);
  return { desglose, base: t.base, iva: t.iva, total: t.total };
}

/** Líneas en negativo para la rectificativa total. */
export function lineasRectificativas(lineas: readonly LineaDatos[]): LineaDatos[] {
  return lineas.map((l) => ({ ...l, precioCentimos: -l.precioCentimos }));
}

/** Contenido que firma la huella (todo menos la propia huella). */
export function huellaDe(f: Omit<Factura, "huella">): string {
  return createHash("sha256")
    .update(`${f.huellaAnterior}|${canonicalStringify(f as unknown as Record<string, unknown>)}`)
    .digest("hex");
}

/** Recorre las facturas en orden de expedición y comprueba la cadena. */
export function verificarCadena(facturas: readonly Factura[]): { ok: true } | { ok: false; codigo: string } {
  let anterior = "";
  for (const f of facturas) {
    const { huella, ...resto } = f;
    if (f.huellaAnterior !== anterior || huellaDe(resto) !== huella) {
      return { ok: false, codigo: f.codigo };
    }
    anterior = huella;
  }
  return { ok: true };
}
