/**
 * Capa 2 — presentación: esquema de interfaz (no código de producto).
 *
 * Módulo = agrupación de vistas, acciones y recorridos para un rol y un canal.
 * Nadie edita a mano la salida generada: las personalizaciones van en Overlay.
 */

export type PresentationChannel =
  | "presencial"
  | "backoffice"
  | "autoservicio"
  | "taller"
  | "web";

export interface LocalizationBundle {
  readonly locale: string;
  /** Clave estable → texto. */
  readonly strings: Readonly<Record<string, string>>;
}

export interface IdentitySpec {
  readonly brandName?: string;
  readonly logoUrl?: string;
  /**
   * @deprecated No usar literales en UiSpec. Preferir tokens semánticos
   * (`color.primario`) resueltos por el DesignSystem activo.
   * El Generador no escribe estos campos en la especificación.
   */
  readonly primaryColor?: string;
  /** @deprecated Ver primaryColor. */
  readonly secondaryColor?: string;
}

/** Contenido editorial superpuesto (sobrevive a regeneración). */
export interface ContentOverride {
  readonly title?: string;
  readonly subtitle?: string;
  readonly body?: string;
  readonly labels?: Readonly<Record<string, string>>;
}

export interface FormFieldSpec {
  readonly name: string;
  readonly labelKey: string;
  readonly type: "string" | "number" | "boolean" | "date" | "enum" | "reference";
  readonly required: boolean;
  readonly enumValues?: readonly string[];
  readonly referenceEntity?: string;
}

export interface FormSpec {
  readonly id: string;
  readonly entityKind: string;
  readonly fields: readonly FormFieldSpec[];
}

export interface ActionSpec {
  readonly id: string;
  readonly transitionId: string;
  readonly lifecycleId: string;
  readonly labelKey: string;
  /** Roles con permiso de ejecutar (capa 1). */
  readonly visibleRoles: readonly string[];
  readonly requiredEvidenceKind: string;
  readonly evidenceFields: readonly FormFieldSpec[];
  readonly formId?: string;
}

/** Kinds de vista: tableros de proceso + paneles derivados de señales. */
export type ViewKind =
  | "tablero"
  | "lista"
  | "detalle"
  | "formulario"
  | "panel_agenda"
  | "panel_retencion"
  | "panel_credito"
  | "panel_periodos"
  | "panel_bloqueo"
  | "portal_filtro";

export interface ViewSpec {
  readonly id: string;
  readonly kind: ViewKind;
  readonly labelKey: string;
  /** Estado de la máquina (tablero) o null. */
  readonly stateId: string | null;
  readonly lifecycleId: string | null;
  readonly actionIds: readonly string[];
  readonly formId?: string;
  /**
   * Patrones que esta vista admite (catálogo cerrado por kind).
   * El Generador los declara; el binding elige entre ellos según el DS.
   */
  readonly admittedPatterns: {
    readonly listados: readonly ("tabla" | "tarjetas" | "lista")[];
    readonly navegacion: readonly ("lateral" | "superior" | "inferior_movil")[];
    readonly formularios: readonly (
      | "una_columna"
      | "dos_columnas"
      | "por_pasos"
    )[];
    readonly tableros: readonly ("kanban" | "lista_agrupada")[];
  };
  /** Metadatos de presentación (bloqueo, retención, etc.). */
  readonly presentation?: Readonly<Record<string, string>>;
}

/**
 * Agrupación primaria de UI por proceso (lifecycle) y secundarios.
 * Sustituye a mod.* como organizador; mod.* queda como etiqueta opcional.
 */
export interface ProcessGroupSpec {
  readonly id: string;
  readonly labelKey: string;
  readonly lifecycleId: string;
  readonly archetypeId: string;
  readonly role: "dominant" | "secondary" | "standalone";
  /** Estado del dominante que este secundario bloquea (si aplica). */
  readonly bloqueaStateId?: string;
  readonly bornInDominantState?: string;
  readonly viewIds: readonly string[];
  readonly actionIds: readonly string[];
  readonly panelIds: readonly string[];
  readonly recorridoId: string;
  readonly channel: PresentationChannel;
  readonly roleIds: readonly string[];
}

export interface RecorridoSpec {
  readonly id: string;
  readonly labelKey: string;
  /** Secuencia de viewIds. */
  readonly steps: readonly string[];
  readonly roleIds: readonly string[];
}

/**
 * Etiqueta opcional de agrupación (legacy mod.*).
 * Nunca es condición para que exista una pantalla.
 */
export interface ModuleSpec {
  readonly id: string;
  readonly labelKey: string;
  /** Regla que lo dedujo. */
  readonly ruleId: string;
  readonly channel: PresentationChannel;
  readonly roleIds: readonly string[];
  readonly viewIds: readonly string[];
  readonly actionIds: readonly string[];
  readonly recorridoIds: readonly string[];
}

/**
 * Especificación de interfaz versionada (salida del Generador).
 * Determinista: misma entrada ⇒ mismo contentHash.
 * Organización primaria: `processGroups`; `modules` = etiquetas opcionales.
 */
export interface UiSpec {
  readonly id: string;
  readonly version: string;
  readonly generatedAt: string;
  readonly sourceCaseId: string;
  readonly sourceCaseVersion: string;
  readonly sourcePolicyHash: string;
  readonly contentHash: string;
  readonly processGroups?: readonly ProcessGroupSpec[];
  /** Etiquetas opcionales (mod.*) — compat / navegación auxiliar. */
  readonly modules: readonly ModuleSpec[];
  readonly views: readonly ViewSpec[];
  readonly actions: readonly ActionSpec[];
  readonly forms: readonly FormSpec[];
  readonly recorridos: readonly RecorridoSpec[];
  /** Identidad ya fusionada con overlay (si había) — sin colores literales. */
  readonly identity: IdentitySpec;
  readonly localization: readonly LocalizationBundle[];
  /** Copia de claves de contenido fusionadas (para auditoría). */
  readonly content: Readonly<Record<string, ContentOverride>>;
  /**
   * Solo tokens semánticos (p. ej. color.primario, espaciado.m).
   * Los renderizadores resuelven con el sistema de diseño activo.
   */
  readonly styleTokenRefs: import("./tokens.js").UiStyleTokenRefs;
}

/**
 * Capa superpuesta: personalizaciones que NO se regeneran.
 * Se fusiona por id estable tras cada generación.
 */
export interface PresentationOverlay {
  readonly version: string;
  readonly identity?: IdentitySpec;
  readonly content?: Readonly<Record<string, ContentOverride>>;
  readonly localization?: readonly LocalizationBundle[];
  /**
   * Sistema de diseño aprobado (Diseñador).
   * Forma alineada con `DesignSystemVersion` en `/design`.
   */
  readonly designSystem?: {
    readonly version: string;
    readonly approvedAt: string;
    readonly contentHash: string;
    readonly companyId: string;
    readonly proposalId: string;
    readonly system: unknown;
  };
  /** Historial versionado (metadatos). */
  readonly designSystemHistory?: readonly {
    readonly version: string;
    readonly contentHash: string;
    readonly approvedAt: string;
    readonly proposalId: string;
  }[];
  /**
   * Arquitectura de información por rol (Arquitecto IA).
   * Forma alineada con `InformationArchitecture` en `/design/ia`.
   */
  readonly informationArchitecture?: {
    readonly version: string;
    readonly contentHash: string;
    readonly generatedAt: string;
    readonly sourceUiSpecHash: string;
    readonly byRole: unknown;
  };
  /**
   * Textos de interfaz (Redactor). Forma alineada con `InterfaceCopyPack`.
   */
  readonly interfaceCopy?: {
    readonly version: string;
    readonly contentHash: string;
    readonly sourceUiSpecHash: string;
    readonly locale: string;
    readonly tone: string;
    readonly templates: unknown;
    readonly vocabulary: Readonly<Record<string, string>>;
    readonly proposedAt: string;
  };
}

/**
 * ─────────────────────────────────────────────────────────────
 * Hub de Inicio: Navegación centralizada después de login
 * ─────────────────────────────────────────────────────────────
 * Estructura de datos para el dashboard inicial con control de roles.
 */

/**
 * Información de un rol específico.
 * Define permisos y etiqueta del rol que se mostrará en UI.
 */
export interface RoleInfo {
  readonly roleId: string;
  readonly label: string;
  readonly permissions: readonly string[];
  /** Descripción del rol para tooltip/ayuda. */
  readonly description?: string;
}

/**
 * Tarjeta de proceso en el grid del hub.
 * Representa un proceso (lifecycle) que el usuario puede acceder.
 */
export interface ProcessCardSpec {
  readonly id: string;
  readonly lifecycleId: string;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  readonly href: string;
  readonly isVisible: boolean;
  readonly isEnabled: boolean;
  /** Contador opcional (ej: "8 pendientes"). */
  readonly count?: number;
  /** Permisos requeridos para ver esta tarjeta. */
  readonly requiredPermissions: readonly string[];
  /** Métrica de importancia (0-100) para ordenar. */
  readonly priority?: number;
}

/**
 * Acción rápida en el hub.
 * Atajos a operaciones frecuentes según el rol.
 */
export interface QuickActionSpec {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly href: string;
  readonly requiredPermissions: readonly string[];
  /** Orden de visualización. */
  readonly order?: number;
}

/**
 * Widget de resumen/métrica en el hub.
 * Muestra KPIs importantes para el rol.
 */
export interface SummaryWidgetSpec {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** Tendencia: up, down, stable. */
  readonly trend: "up" | "down" | "stable";
  readonly icon: string;
  /** Color semántico del widget. */
  readonly colorSemantic?: "success" | "warning" | "danger" | "info";
  readonly requiredPermissions: readonly string[];
}

/**
 * Especificación completa del Hub Dashboard.
 * Contiene todos los elementos visuales que ve un usuario después de login.
 * Generado por bootHubDashboard() basado en UiSpec y rol actual.
 */
export interface HubDashboardSpec {
  readonly userId: string;
  readonly sessionId: string;
  readonly generatedAt: string;
  /** Rol actual seleccionado. */
  readonly currentRole: RoleInfo;
  /** Roles disponibles que el usuario puede cambiar. */
  readonly availableRoles: readonly RoleInfo[];
  /** Procesos principales del negocio. */
  readonly processCards: readonly ProcessCardSpec[];
  /** Acciones rápidas contextúales. */
  readonly quickActions: readonly QuickActionSpec[];
  /** Widgets de resumen de negocio. */
  readonly summary: readonly SummaryWidgetSpec[];
  /** Navegación auxiliar (enlaces adicionales). */
  readonly auxiliaryLinks?: readonly {
    readonly id: string;
    readonly label: string;
    readonly href: string;
    readonly icon?: string;
  }[];
}

export const PRESENTATION_SCHEMA_VERSION = "2.0.0-mvp";
