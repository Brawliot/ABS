/**
 * Fichas generadas de cada negocio: Recurso, Oferta o Parte con campos propios.
 */

import { parseImporteCentimos } from "./oferta.js";

export interface DefinicionFicha {
  readonly id: string;
  readonly nombre: string;
  readonly plural: string;
  readonly elemento: "recurso" | "oferta";
  readonly deQuien?: "propio" | "del_cliente";
  readonly campos: readonly DefinicionCampo[];
  readonly enProcesos?: readonly string[];
}

export interface DefinicionCampo {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: "texto" | "numero" | "importe" | "si_no" | "fecha" | "opcion";
  readonly opciones?: readonly string[];
  readonly obligatorio?: boolean;
}

export type ValorCampo = string | number | boolean | null;

export interface FichaRecord {
  readonly fichaId: string;
  readonly id: string;
  readonly tenantId: string;
  readonly version: number;
  readonly valores: Record<string, ValorCampo>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const CAMPOS_PERSONALES = new Set([
  "dni",
  "nif",
  "telefono",
  "email",
  "nombre_cliente",
  "iban",
]);

const ID_RE = /^[a-z0-9_]+$/;

export function validarDefinicionFichas(fichas: readonly DefinicionFicha[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const ficha of fichas) {
    if (!ID_RE.test(ficha.id)) {
      errors.push(`Ficha "${ficha.id}": id no válido (solo a-z, 0-9, _).`);
    }
    if (ids.has(ficha.id)) {
      errors.push(`Ficha "${ficha.id}": id repetido.`);
    }
    ids.add(ficha.id);

    if (!ficha.nombre || ficha.nombre.length === 0) {
      errors.push(`Ficha "${ficha.id}": nombre vacío.`);
    }
    if (!ficha.plural || ficha.plural.length === 0) {
      errors.push(`Ficha "${ficha.id}": plural vacío.`);
    }

    if (ficha.elemento !== "recurso" && ficha.elemento !== "oferta") {
      errors.push(`Ficha "${ficha.id}": elemento debe ser "recurso" u "oferta".`);
    }

    if (ficha.elemento === "recurso" && !ficha.deQuien) {
      errors.push(`Ficha "${ficha.id}": recurso requiere "deQuien" (propio|del_cliente).`);
    }

    if (ficha.campos.length === 0) {
      errors.push(`Ficha "${ficha.id}": debe tener al menos un campo.`);
    }

    const campoIds = new Set<string>();
    for (const campo of ficha.campos) {
      if (!ID_RE.test(campo.id)) {
        errors.push(`Ficha "${ficha.id}", campo "${campo.id}": id no válido.`);
      }
      if (campoIds.has(campo.id)) {
        errors.push(`Ficha "${ficha.id}": campo "${campo.id}" repetido.`);
      }
      campoIds.add(campo.id);

      if (CAMPOS_PERSONALES.has(campo.id)) {
        errors.push(
          `Ficha "${ficha.id}", campo "${campo.id}": campos personales no permitidos en fichas.`
        );
      }

      if (!campo.nombre || campo.nombre.length === 0) {
        errors.push(`Ficha "${ficha.id}", campo "${campo.id}": nombre vacío.`);
      }

      if (
        !["texto", "numero", "importe", "si_no", "fecha", "opcion"].includes(campo.tipo)
      ) {
        errors.push(`Ficha "${ficha.id}", campo "${campo.id}": tipo no válido.`);
      }

      if (campo.tipo === "opcion" && (!campo.opciones || campo.opciones.length === 0)) {
        errors.push(
          `Ficha "${ficha.id}", campo "${campo.id}": tipo "opcion" requiere opciones.`
        );
      }

      if (campo.tipo !== "opcion" && campo.opciones) {
        errors.push(
          `Ficha "${ficha.id}", campo "${campo.id}": solo tipo "opcion" admite opciones.`
        );
      }
    }
  }

  return errors;
}

export function parseFichaForm(
  definicion: DefinicionFicha,
  form: Readonly<Record<string, string | undefined>>,
): { ok: true; valores: Record<string, ValorCampo> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const valores: Record<string, ValorCampo> = {};

  for (const campo of definicion.campos) {
    const raw = form[campo.id]?.trim();

    if (campo.tipo === "si_no") {
      valores[campo.id] = raw === "true" || raw === "on" ? true : false;
      continue;
    }

    if (!raw || raw.length === 0) {
      if (campo.obligatorio) {
        errors.push(`"${campo.nombre}" es obligatorio.`);
      }
      valores[campo.id] = null;
      continue;
    }

    if (campo.tipo === "texto") {
      valores[campo.id] = raw;
    } else if (campo.tipo === "numero") {
      const num = Number(raw);
      if (Number.isNaN(num) || !Number.isFinite(num)) {
        errors.push(`"${campo.nombre}": debe ser un número válido.`);
        valores[campo.id] = null;
      } else {
        valores[campo.id] = num;
      }
    } else if (campo.tipo === "importe") {
      const cents = parseImporteCentimos(raw);
      if (cents === null) {
        errors.push(`"${campo.nombre}": importe no válido (ejemplo: 12,50).`);
        valores[campo.id] = null;
      } else {
        valores[campo.id] = cents;
      }
    } else if (campo.tipo === "fecha") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        errors.push(`"${campo.nombre}": fecha no válida (YYYY-MM-DD).`);
        valores[campo.id] = null;
      } else {
        valores[campo.id] = raw;
      }
    } else if (campo.tipo === "opcion") {
      if (
        !campo.opciones ||
        !(campo.opciones as readonly string[]).includes(raw)
      ) {
        errors.push(`"${campo.nombre}": opción no válida.`);
        valores[campo.id] = null;
      } else {
        valores[campo.id] = raw;
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, valores };
}
