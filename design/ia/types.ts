/**
 * Arquitecto de información — jerarquía por rol (capa superpuesta).
 */

export const MAX_MAIN_MENU_ENTRIES = 7;

export const PRIMARY_LIST_FIELDS = [
  "identificacion",
  "estado",
  "importe",
  "plazo",
] as const;

export type PrimaryListField = (typeof PRIMARY_LIST_FIELDS)[number];

export interface HomeHighlight {
  readonly viewIds: readonly string[];
  readonly actionIds: readonly string[];
  /** Etiquetas destacadas (p. ej. "Recibir mercancía"). */
  readonly labels: readonly string[];
  /** Transacciones / ítems pendientes del rol. */
  readonly pendingTaskIds: readonly string[];
}

export interface MenuGroup {
  readonly id: string;
  readonly label: string;
  readonly entryIds: readonly string[];
}

export interface MenuSpec {
  /** Entradas principales (máx. 7). */
  readonly primaryEntries: readonly {
    readonly id: string;
    readonly label: string;
    readonly kind: "view" | "action" | "module";
    readonly refId: string;
  }[];
  /** Resto agrupado. */
  readonly groups: readonly MenuGroup[];
}

export interface ViewFieldHierarchy {
  readonly viewId: string;
  readonly primaryFields: readonly string[];
  readonly secondaryFields: readonly string[];
}

/** Arquitectura de información para un rol. */
export interface RoleInformationArchitecture {
  readonly roleId: string;
  readonly home: HomeHighlight;
  readonly menu: MenuSpec;
  readonly viewHierarchies: readonly ViewFieldHierarchy[];
}

/** Salida completa del Arquitecto (va al overlay). */
export interface InformationArchitecture {
  readonly version: string;
  readonly contentHash: string;
  readonly generatedAt: string;
  readonly sourceUiSpecHash: string;
  readonly byRole: readonly RoleInformationArchitecture[];
}

/** Propuesta de cambio (aprendizaje); nunca se aplica sola. */
export type IaProposalKind =
  | "reorder_menu"
  | "promote_action"
  | "demote_action"
  | "change_home";

export interface InformationArchitectureProposal {
  readonly id: string;
  readonly kind: IaProposalKind;
  readonly roleId: string;
  readonly rationale: string;
  readonly suggested: Readonly<Record<string, unknown>>;
  readonly basedOnTelemetry: {
    readonly insightId?: string;
    readonly abandonStepId?: string;
    readonly metric?: string;
  };
  readonly status: "pending" | "approved" | "rejected";
  readonly createdAt: string;
}

export class InformationArchitectureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InformationArchitectureError";
  }
}
