/**
 * Checklist: qué puntos de funcionalidad está cubierto.
 * Cada sección (generador) declara qué cubre.
 */

export type ChecklistItem =
  | "modulo.clientes"
  | "modulo.credito"
  | "modulo.agenda"
  | "modulo.facturas"
  | "modulo.stock"
  | "modulo.cuotas"
  | "modulo.dinero"
  | "crm.resumen"
  | "crm.abiertos"
  | "crm.sus_fichas"
  | "crm.deuda"
  | "crm.citas"
  | "crm.historial";

export interface ChecklistEntry {
  generador: string;
  cubiertos: readonly ChecklistItem[];
}

export function registrar(entries: readonly ChecklistEntry[]): Record<ChecklistItem, string | undefined> {
  const result: Record<ChecklistItem, string | undefined> = {
    "modulo.clientes": undefined,
    "modulo.credito": undefined,
    "modulo.agenda": undefined,
    "modulo.facturas": undefined,
    "modulo.stock": undefined,
    "modulo.cuotas": undefined,
    "modulo.dinero": undefined,
    "crm.resumen": undefined,
    "crm.abiertos": undefined,
    "crm.sus_fichas": undefined,
    "crm.deuda": undefined,
    "crm.citas": undefined,
    "crm.historial": undefined,
  };

  for (const entry of entries) {
    for (const item of entry.cubiertos) {
      result[item] = entry.generador;
    }
  }
  return result;
}
