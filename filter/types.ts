/**
 * Filtro — juez de lectura de la capa 2.
 *
 * Toda lectura desde presentación pasa por aquí. Funciones puras y deterministas.
 */

import type { TenantId } from "../tenancy/index.js";
import type { ActorAttributes } from "../policies/organization.js";
import type {
  CompiledRuleSet,
  VisibilityScope,
} from "../policies/types.js";

export type FilterSubjectKind = "transaccion" | "parte" | "recurso";

export type FieldClassification = "operativo" | "fiscal" | "personal";

/** Fila candidata a lectura (ya proyectada; el Filtro no toca el almacén). */
export interface FilterRow {
  readonly kind: FilterSubjectKind;
  readonly id: string;
  readonly tenantId: TenantId;
  readonly sedeId?: string;
  readonly equipoId?: string;
  /** Parte dueña / vinculada (Portal, ámbito propia). */
  readonly parteId?: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface FilterReader {
  readonly id: string;
  readonly roles: readonly string[];
  readonly tenantId: TenantId;
  /** Parte que representa (Portal del cliente). */
  readonly parteId?: string;
}

/** Regla de acceso a campo (cumplimiento / sensibilidad). */
export interface FieldAccessRule {
  readonly field: string;
  readonly classification: FieldClassification;
  /** Vacío = nadie (salvo que se declare bypass). Roles que pueden ver el campo. */
  readonly allowedRoles: readonly string[];
}

export interface FilterPolicy {
  readonly fieldRules: readonly FieldAccessRule[];
  /**
   * Ámbito efectivo de consulta cuando hay varias reglas visibility.
   * Si se omite, se toma el más restrictivo aplicable al rol.
   */
  readonly defaultScope?: VisibilityScope;
}

export interface RowVerdict {
  readonly ok: boolean;
  readonly rowId: string;
  readonly reason: string;
  readonly ruleId: string;
}

export interface FieldVerdict {
  readonly field: string;
  readonly visible: boolean;
  readonly classification: FieldClassification;
  readonly reason: string;
}

/** Registro de acceso a datos personales (cumplimiento). */
export interface PersonalDataAccessRecord {
  readonly at: string;
  readonly readerId: string;
  readonly tenantId: TenantId;
  readonly subjectKind: FilterSubjectKind;
  readonly subjectId: string;
  readonly fields: readonly string[];
  readonly purpose: "consulta";
}

export interface FilteredRead {
  readonly row: FilterRow;
  /** Campos visibles (resto omitidos o redactados). */
  readonly fields: Readonly<Record<string, unknown>>;
  readonly redactedFields: readonly string[];
  readonly rowVerdict: RowVerdict;
  readonly fieldVerdicts: readonly FieldVerdict[];
}

export interface FilterReadResult {
  readonly items: readonly FilteredRead[];
  readonly personalAccessLog: readonly PersonalDataAccessRecord[];
  readonly denied: readonly RowVerdict[];
}

export class FilterRejectionError extends Error {
  constructor(
    message: string,
    readonly verdict: RowVerdict,
  ) {
    super(message);
    this.name = "FilterRejectionError";
  }
}

export class Layer2DirectAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Layer2DirectAccessError";
  }
}

/** Catálogo MVP de campos sensibles. */
export const DEFAULT_FIELD_RULES: readonly FieldAccessRule[] = [
  {
    field: "base_imponible",
    classification: "fiscal",
    allowedRoles: ["finanzas", "gerente", "contabilidad"],
  },
  {
    field: "iva",
    classification: "fiscal",
    allowedRoles: ["finanzas", "gerente", "contabilidad"],
  },
  {
    field: "nif",
    classification: "fiscal",
    allowedRoles: ["finanzas", "gerente", "contabilidad"],
  },
  {
    field: "cif",
    classification: "fiscal",
    allowedRoles: ["finanzas", "gerente", "contabilidad"],
  },
  {
    field: "email",
    classification: "personal",
    allowedRoles: ["gerente", "comercial", "finanzas", "cliente"],
  },
  {
    field: "displayName",
    classification: "personal",
    allowedRoles: ["gerente", "comercial", "finanzas", "cliente", "taller"],
  },
  {
    field: "address",
    classification: "personal",
    allowedRoles: ["gerente", "finanzas"],
  },
  {
    field: "phone",
    classification: "personal",
    allowedRoles: ["gerente", "comercial", "taller"],
  },
  {
    field: "taxId",
    classification: "fiscal",
    allowedRoles: ["finanzas", "gerente"],
  },
];

export function readerAttrs(
  ruleSet: CompiledRuleSet,
  reader: FilterReader,
): ActorAttributes | undefined {
  return ruleSet.actorDirectory[reader.id];
}
