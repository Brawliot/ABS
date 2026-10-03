/**
 * Oferta viva: catálogo de productos / servicios con precio (capa 0, instancias).
 * Cada cambio crea una versión nueva; las líneas de transacción referenciarán
 * `ofertaId` + `version` y copiarán el precio vigente.
 */

import { OfertaSubtypes, type OfertaSubtype } from "./subtypes.js";

/** Tipos de IVA admitidos (España). */
export const IVA_TIPOS = [0, 4, 10, 21] as const;
export type IvaTipo = (typeof IVA_TIPOS)[number];

export interface OfertaInput {
  readonly subtype: OfertaSubtype;
  readonly nombre: string;
  readonly descripcion?: string;
  /** Precio unitario sin IVA, en céntimos de euro. */
  readonly precioCentimos: number;
  readonly ivaPct: IvaTipo;
  /** Unidad de venta: "ud", "hora", "mes", "kg"… */
  readonly unidad: string;
}

export interface OfertaRecord extends OfertaInput {
  readonly ofertaId: string;
  readonly tenantId: string;
  /** Empieza en 1; sube con cada edición. */
  readonly version: number;
  readonly activa: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OfertaCatalog {
  create(tenantId: string, ofertaId: string, input: OfertaInput, at: string): OfertaRecord;
  update(tenantId: string, ofertaId: string, input: OfertaInput, at: string): OfertaRecord;
  setActiva(tenantId: string, ofertaId: string, activa: boolean, at: string): OfertaRecord;
  get(tenantId: string, ofertaId: string): OfertaRecord | undefined;
  /** Versión concreta (para reconstruir líneas antiguas). */
  getVersion(tenantId: string, ofertaId: string, version: number): OfertaRecord | undefined;
  list(tenantId: string): readonly OfertaRecord[];
  history(tenantId: string, ofertaId: string): readonly OfertaRecord[];
}

export class OfertaCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfertaCatalogError";
  }
}

export const OFERTA_SUBTYPE_LABELS: Readonly<Record<OfertaSubtype, string>> = {
  bien: "Producto",
  trabajo: "Servicio / trabajo",
  acceso: "Acceso / suscripción",
  uso: "Alquiler / uso",
  dinero_cobertura: "Financiación / cobertura",
};

/**
 * "12,50" | "12.50" | "1.234,56" | "12" → céntimos. null si no es un importe válido.
 */
export function parseImporteCentimos(raw: string): number | null {
  const t = raw.trim().replace(/\s|€/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t)) return null;
  let normalized: string;
  if (t.includes(",")) {
    normalized = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    normalized = t.replace(/\./g, "");
  } else {
    normalized = t;
  }
  const [ent = "0", dec = ""] = normalized.split(".");
  const cents = Number(ent) * 100 + Number(dec.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** 123456 → "1.234,56 €" */
export function formatCentimos(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const ent = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = (abs % 100).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${ent},${dec} €`;
}

function clean(v: string | undefined): string | undefined {
  const t = (v ?? "").trim();
  return t === "" ? undefined : t;
}

/** Normaliza y valida un formulario de Oferta. */
export function parseOfertaForm(
  form: Readonly<Record<string, string | undefined>>,
): { ok: true; value: OfertaInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const subtype = clean(form.subtype);
  if (!subtype || !(OfertaSubtypes as readonly string[]).includes(subtype)) {
    errors.push("Tipo de oferta no válido.");
  }
  const nombre = clean(form.nombre);
  if (!nombre) errors.push("El nombre es obligatorio.");
  else if (nombre.length > 200) errors.push("El nombre es demasiado largo.");
  const precioRaw = clean(form.precio);
  const precioCentimos =
    precioRaw === undefined ? null : parseImporteCentimos(precioRaw);
  if (precioCentimos === null) {
    errors.push("El precio no es válido (ejemplo: 12,50).");
  }
  const iva = Number(clean(form.ivaPct) ?? "NaN");
  if (!(IVA_TIPOS as readonly number[]).includes(iva)) {
    errors.push("El IVA debe ser 0, 4, 10 o 21 %.");
  }
  const unidad = clean(form.unidad) ?? "ud";
  if (unidad.length > 20) errors.push("La unidad es demasiado larga.");
  if (errors.length > 0) return { ok: false, errors };

  const descripcion = clean(form.descripcion);
  return {
    ok: true,
    value: {
      subtype: subtype as OfertaSubtype,
      nombre: nombre!,
      ...(descripcion ? { descripcion } : {}),
      precioCentimos: precioCentimos!,
      ivaPct: iva as IvaTipo,
      unidad,
    },
  };
}
