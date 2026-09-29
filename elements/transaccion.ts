/**
 * Transacción viva: sus datos de negocio (cliente, líneas, total…).
 * El estado sigue saliendo solo de las transiciones (deriveState); los datos
 * salen de los eventos `alta` y `datos` del mismo expediente.
 */

import type {
  AltaEvent,
  DatosEvent,
  DomainEvent,
  LineaDatos,
  TransaccionDatos,
} from "../core/events.js";
import { IVA_TIPOS } from "./oferta.js";

export const MAX_LINEAS = 50;

/** Línea tal como llega del formulario (antes de resolver el catálogo). */
export interface LineaEntrada {
  readonly ofertaId?: string;
  readonly descripcion?: string;
  readonly cantidadMilesimas: number;
  /** Si falta en una línea de catálogo, se usa el precio de la Oferta. */
  readonly precioCentimos?: number;
  /** Solo líneas libres: las de catálogo usan el IVA de la Oferta. */
  readonly ivaPct?: number;
}

export interface EntradaTransaccion {
  readonly lifecycleId: string;
  readonly parteId: string;
  readonly fecha: string;
  readonly referencia?: string;
  readonly notas?: string;
  readonly sedeId?: string;
  readonly lineas: readonly LineaEntrada[];
}

export interface TotalesLinea {
  /** Base sin IVA (céntimos). */
  readonly base: number;
  readonly iva: number;
  readonly total: number;
}

export interface Totales {
  readonly lineas: readonly TotalesLinea[];
  readonly base: number;
  readonly iva: number;
  readonly total: number;
  /** Desglose de IVA por tipo (tipo → cuota en céntimos). */
  readonly ivaPorTipo: Readonly<Record<string, number>>;
}

/** Cambio registrado sobre los datos del expediente (para el historial). */
export interface CambioDatos {
  readonly eventId: string;
  readonly kind: "alta" | "datos";
  readonly at: string;
  readonly actorId: string;
  readonly campos: readonly (keyof TransaccionDatos)[];
}

export interface TransaccionProyectada {
  readonly id: string;
  readonly lifecycleId: string;
  readonly sedeId?: string;
  readonly datos: TransaccionDatos;
  readonly creadaEn: string;
  readonly creadaPor: string;
  readonly cambios: readonly CambioDatos[];
}

/** Redondeo comercial (mitad hacia arriba, simétrico). */
function redondear(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

export function totalesLinea(l: LineaDatos): TotalesLinea {
  const base = redondear((l.cantidadMilesimas * l.precioCentimos) / 1000);
  const iva = redondear((base * l.ivaPct) / 100);
  return { base, iva, total: base + iva };
}

export function calcularTotales(lineas: readonly LineaDatos[]): Totales {
  const porLinea = lineas.map(totalesLinea);
  const ivaPorTipo: Record<string, number> = {};
  lineas.forEach((l, i) => {
    const k = String(l.ivaPct);
    ivaPorTipo[k] = (ivaPorTipo[k] ?? 0) + porLinea[i]!.iva;
  });
  return {
    lineas: porLinea,
    base: porLinea.reduce((s, t) => s + t.base, 0),
    iva: porLinea.reduce((s, t) => s + t.iva, 0),
    total: porLinea.reduce((s, t) => s + t.total, 0),
    ivaPorTipo,
  };
}

/** "1" | "1,5" | "2.25" | "0,125" → milésimas. null si no es válida o ≤ 0. */
export function parseCantidadMilesimas(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const [ent = "0", dec = ""] = t.split(".");
  const v = Number(ent) * 1000 + Number(dec.padEnd(3, "0"));
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

/** 1500 → "1,5" */
export function formatCantidad(milesimas: number): string {
  const ent = Math.floor(milesimas / 1000);
  const dec = (milesimas % 1000).toString().padStart(3, "0").replace(/0+$/, "");
  return dec ? `${ent},${dec}` : String(ent);
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function fechaValida(f: string): boolean {
  if (!FECHA_RE.test(f)) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

/** Reglas de los datos completos de una transacción (errores en castellano). */
export function validarDatos(d: TransaccionDatos): string[] {
  const errors: string[] = [];
  if (!d.parteId) errors.push("Elige un cliente o proveedor.");
  if (!fechaValida(d.fecha)) errors.push("La fecha no es válida.");
  if ((d.referencia ?? "").length > 100) errors.push("La referencia es demasiado larga.");
  if ((d.notas ?? "").length > 2000) errors.push("Las notas son demasiado largas.");
  if (d.lineas.length === 0) errors.push("Añade al menos una línea.");
  if (d.lineas.length > MAX_LINEAS) errors.push(`Como máximo ${MAX_LINEAS} líneas.`);
  d.lineas.forEach((l, i) => {
    const n = i + 1;
    if (!l.descripcion.trim()) errors.push(`Línea ${n}: falta la descripción.`);
    if (l.descripcion.length > 200) errors.push(`Línea ${n}: descripción demasiado larga.`);
    if (!Number.isSafeInteger(l.cantidadMilesimas) || l.cantidadMilesimas <= 0) {
      errors.push(`Línea ${n}: la cantidad debe ser mayor que 0.`);
    }
    if (!Number.isSafeInteger(l.precioCentimos) || l.precioCentimos < 0) {
      errors.push(`Línea ${n}: el precio no es válido.`);
    }
    if (!(IVA_TIPOS as readonly number[]).includes(l.ivaPct)) {
      errors.push(`Línea ${n}: el IVA debe ser 0, 4, 10 o 21 %.`);
    }
  });
  return errors;
}

function aplicar(
  base: TransaccionDatos,
  cambios: Partial<TransaccionDatos>,
): TransaccionDatos {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(cambios)) {
    // "" borra un campo opcional (referencia / notas)
    if (v === "" && (k === "referencia" || k === "notas")) delete out[k];
    else if (v !== undefined) out[k] = v;
  }
  return out as unknown as TransaccionDatos;
}

/**
 * Reconstruye los datos actuales reproduciendo `alta` + `datos` en orden.
 * Devuelve undefined si el expediente no tiene alta (expediente sin datos).
 */
export function proyectarTransaccion(
  events: readonly DomainEvent[],
): TransaccionProyectada | undefined {
  const alta = events.find((e): e is AltaEvent => e.kind === "alta");
  if (!alta) return undefined;
  let datos = alta.datos;
  const cambios: CambioDatos[] = [
    {
      eventId: alta.id,
      kind: "alta",
      at: alta.occurredAt,
      actorId: alta.actorId,
      campos: Object.keys(alta.datos) as (keyof TransaccionDatos)[],
    },
  ];
  for (const e of events) {
    if (e.kind !== "datos") continue;
    const ev = e as DatosEvent;
    datos = aplicar(datos, ev.cambios);
    cambios.push({
      eventId: ev.id,
      kind: "datos",
      at: ev.occurredAt,
      actorId: ev.actorId,
      campos: Object.keys(ev.cambios) as (keyof TransaccionDatos)[],
    });
  }
  return {
    id: alta.subjectId,
    lifecycleId: alta.lifecycleId,
    ...(alta.sedeId ? { sedeId: alta.sedeId } : {}),
    datos,
    creadaEn: alta.occurredAt,
    creadaPor: alta.actorId,
    cambios,
  };
}

/** Qué ha cambiado entre dos versiones de los datos (solo campos distintos). */
export function diferencias(
  antes: TransaccionDatos,
  despues: TransaccionDatos,
): Partial<TransaccionDatos> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  for (const k of keys) {
    const a = (antes as unknown as Record<string, unknown>)[k];
    const b = (despues as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out[k] = b === undefined ? "" : b;
    }
  }
  return out as Partial<TransaccionDatos>;
}
