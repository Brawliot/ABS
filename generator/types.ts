/**
 * Contexto de generación (hechos de negocio + capa 0/1).
 * La UI primaria se deriva de procesos/composición; mod.* son etiquetas opcionales.
 */

import type { Lifecycle } from "../core/lifecycle.js";
import type { CompiledRuleSet, RoleDef } from "../policies/types.js";
import type { PresentationChannel } from "../presentation/types.js";
import type { RecursoSubtype } from "../elements/subtypes.js";
import type { ComposedArchetypeSpec } from "../archetypes/types.js";
import type { PolicyTemplateInvocation } from "../contracts/policy-templates/types.js";

export type PaymentMode = "inmediato" | "financiado" | "diferido" | "mixto";

/**
 * Naturaleza de bienes del negocio.
 * Solo `propios_por_cantidad` activa la etiqueta opcional Inventario.
 */
export type NaturalezaBien =
  | "propios_por_cantidad"
  | "propios_unitarios"
  | "del_cliente";

export interface LifecycleSlice {
  readonly id: string;
  readonly archetypeId: string;
  readonly lifecycle: Lifecycle;
  /** Etiqueta de negocio (p. ej. "taller"). */
  readonly label?: string;
  /**
   * Rol en la composición: dominante | secundario | independiente.
   * Si hay `composition`, se infiere; si no, independiente.
   */
  readonly compositionRole?: "dominant" | "secondary" | "standalone";
  /**
   * Sentido del dinero: la empresa vende (entra) o compra (sale).
   * Sin declarar se asume venta.
   */
  readonly exchangeDirection?: "empresa_vende" | "empresa_compra";
}

/**
 * Entrada del Generador: capas 0+1 materializadas + composición + señales.
 */
export interface GeneratorInput {
  readonly caseId: string;
  readonly caseVersion: string;
  readonly companyId: string;
  readonly generatedAt: string;
  readonly lifecycles: readonly LifecycleSlice[];
  /**
   * Composición dominante/secundarios (bloquea).
   * Si se omite, cada lifecycle es un proceso independiente.
   */
  readonly composition?: ComposedArchetypeSpec;
  readonly ruleSet: CompiledRuleSet;
  readonly roles: readonly RoleDef[];
  /** Canales operativos del negocio. */
  readonly channels: readonly PresentationChannel[];
  /** Capacidad temporal / retornable / capital. */
  readonly resourceSubtypes: readonly RecursoSubtype[];
  readonly naturalezaBienes: readonly NaturalezaBien[];
  readonly paymentMode: PaymentMode;
  readonly hasPartes: boolean;
  readonly hasMovimientos: boolean;
  readonly hasFormalDocuments: boolean;
  readonly hasFiscalCompliance: boolean;
  readonly hasCalendar: boolean;
  readonly pipelineStateIds?: readonly string[];
  /** Vocabulario del negocio para las etiquetas visibles. */
  readonly vocabulario?: Readonly<Record<string, string>>;
  /** Plantillas de políticas generadas por compositor. */
  readonly policyTemplates?: readonly PolicyTemplateInvocation[];
}

export interface ModuleMatch {
  readonly ruleId: string;
  readonly moduleId: string;
  readonly labelKey: string;
  readonly channel: PresentationChannel;
  readonly roleIds: readonly string[];
  /** Lifecycles a los que engancha el módulo (ids). */
  readonly lifecycleIds: readonly string[];
}

export interface ModuleRule {
  readonly id: string;
  readonly moduleId: string;
  readonly labelKey: string;
  readonly match: (ctx: GeneratorInput) => boolean;
  readonly resolve: (ctx: GeneratorInput) => ModuleMatch | null;
}
