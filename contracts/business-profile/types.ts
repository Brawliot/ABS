/**
 * BusinessProfile — contrato de entrada del Generador (consumidor ABS).
 * Versión del esquema: BUSINESS_PROFILE_SCHEMA_VERSION (1.2.0).
 * v1.1.0 sigue siendo válida (campos v1.2 opcionales).
 *
 * Ids técnicos (caseId, documentId, compiledVersion) NO forman parte del
 * contrato: los genera el sistema en MaterializeOptions / generateSystemIds.
 */

import type { RecursoSubtype } from "../../elements/subtypes.js";
import type { PresentationChannel } from "../../presentation/types.js";
import type { PaymentMode } from "../../generator/types.js";
import type {
  BusinessPolicy,
  CompliancePolicy,
  PermissionPolicy,
  RoleDef,
} from "../../policies/types.js";
import type { CalendarDef } from "../../policies/calendario.js";
import type { OrganizationDef } from "../../policies/organization.js";
import type {
  ArchetypeId,
  ComposedArchetypeSpec,
} from "../../archetypes/types.js";
import type { ProfileField } from "./field.js";
import type { PolicyTemplateInvocation } from "../policy-templates/types.js";

export const BUSINESS_PROFILE_SCHEMA_VERSION = "1.2.0" as const;
export const BUSINESS_PROFILE_SCHEMA_VERSION_V11 = "1.1.0" as const;

export const ARCHETYPE_IDS = [
  "venta",
  "servicio_proyecto",
  "suscripcion",
  "uso_temporal",
  "intermediacion",
  "financiera",
] as const;

export const CHANNEL_IDS = [
  "presencial",
  "backoffice",
  "autoservicio",
  "taller",
  "web",
] as const satisfies readonly PresentationChannel[];

export const PAYMENT_MODES = [
  "inmediato",
  "financiado",
  "diferido",
  "mixto",
] as const satisfies readonly PaymentMode[];

export const CAPACITY_RECURSO_SUBTYPES = [
  "capacidad_temporal",
  "retornable",
  "capital",
] as const satisfies readonly RecursoSubtype[];

export const NATURALEZA_BIENES = [
  "propios_por_cantidad",
  "propios_unitarios",
  "del_cliente",
] as const;

export type NaturalezaBien = (typeof NATURALEZA_BIENES)[number];

export const CAPACITY_MODES = ["cita_individual", "plazas"] as const;
export type CapacityMode = (typeof CAPACITY_MODES)[number];

export interface CreditoCuentaDecl {
  readonly kind: "cuenta_parte";
  readonly limitePorDefectoEur?: number;
  readonly bloqueoImpagoDias?: number;
}

export interface PlazosDecl {
  readonly enabled: true;
  readonly viaFinanciera?: boolean;
}

export interface FianzaDecl {
  readonly kind: "retencion";
  readonly umbralComensales?: number;
  readonly noReembolsable?: boolean;
}

export interface CuotasDecl {
  readonly periodicidad: "mensual" | "semanal" | "anual";
  readonly domiciliada?: boolean;
}

export interface HitoPagoDecl {
  readonly id: string;
  readonly fase: string;
  readonly pct?: number;
  readonly importeEur?: number;
  readonly bloqueaStateId: string;
  readonly bornInDominantState: string;
}

export interface HitosDecl {
  readonly hitos: readonly HitoPagoDecl[];
}

export interface CobrosModel {
  readonly aCredito: ProfileField<false | CreditoCuentaDecl>;
  readonly aPlazos: ProfileField<false | PlazosDecl>;
  readonly fianzas: ProfileField<false | FianzaDecl>;
  readonly cuotasRecurrentes: ProfileField<false | CuotasDecl>;
  readonly pagosPorHitos: ProfileField<false | HitosDecl>;
}

export interface ProcessDecl {
  readonly id: string;
  readonly archetypeId: ArchetypeId;
  readonly label?: string;
  readonly exchangeDirection?: "empresa_vende" | "empresa_compra";
}

/** Portal de cliente (v1.2). unknown ⇒ ask (MUST_ASK en expected). */
export interface PortalClienteDecl {
  readonly autoservicio: boolean;
}

export interface PolicyCompileMeta {
  readonly documentVersion: string;
  readonly dominantArchetypeId: ArchetypeId;
}

export interface PermissionFallback {
  readonly roleId: string;
  readonly excludeTransitionIds?: readonly string[];
}

export interface BusinessLocation {
  readonly countryCode: string;
  readonly regionCode?: string;
}

export interface BusinessProfile {
  readonly schemaVersion: string;
  readonly identity: {
    readonly companyId: string;
  };
  readonly policyMeta: PolicyCompileMeta;
  readonly processes: ProfileField<readonly ProcessDecl[]>;
  readonly composition?: ProfileField<ComposedArchetypeSpec>;
  readonly channels: ProfileField<readonly PresentationChannel[]>;
  readonly paymentMode: ProfileField<PaymentMode>;
  /** Modelo de cobro tipado (v1.2). Opcional en perfiles v1.1. */
  readonly cobros?: CobrosModel;
  readonly resourceSubtypes: ProfileField<
    readonly (typeof CAPACITY_RECURSO_SUBTYPES)[number][]
  >;
  readonly capacityMode?: ProfileField<CapacityMode>;
  /** unknown ⇒ ask (v1.2). */
  readonly naturalezaBienes: ProfileField<readonly NaturalezaBien[]>;
  readonly location: ProfileField<BusinessLocation>;
  readonly capabilities: {
    readonly hasPartes: ProfileField<boolean>;
    readonly hasMovimientos: ProfileField<boolean>;
    readonly hasFormalDocuments: ProfileField<boolean>;
    readonly hasFiscalCompliance: ProfileField<boolean>;
    readonly hasCalendar: ProfileField<boolean>;
  };
  readonly roles: ProfileField<readonly RoleDef[]>;
  readonly calendar: ProfileField<CalendarDef>;
  readonly permissions: ProfileField<readonly PermissionPolicy[]>;
  readonly permissionFallback: ProfileField<PermissionFallback>;
  readonly compliance: ProfileField<readonly CompliancePolicy[]>;
  readonly catalogFields: ProfileField<readonly string[]>;
  readonly organization: ProfileField<OrganizationDef>;
  readonly businessPolicies: ProfileField<readonly BusinessPolicy[]>;
  readonly policyTemplates?: ProfileField<
    readonly PolicyTemplateInvocation[]
  >;
  /** unknown ⇒ ask (v1.2). Ausente en perfiles v1.1. */
  readonly portalCliente?: ProfileField<PortalClienteDecl>;
  readonly pipelineStateIds: ProfileField<readonly string[]>;
  /**
   * Nombres propios del negocio en pantalla. Claves exactas
   * (`accion:t_cerrar`, `estado:aceptada`, `proceso:lc.venta`…) o términos
   * (`pedido` → `orden de reparación`). Ver presentation/etiquetas.ts.
   */
  readonly vocabulario?: Readonly<Record<string, string>>;
  /** Fichas generadas de cada negocio (Recurso, Oferta, Parte con campos propios). */
  readonly fichas?: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly plural: string;
    readonly elemento: "recurso" | "oferta";
    readonly deQuien?: "propio" | "del_cliente";
    readonly campos: readonly {
      readonly id: string;
      readonly nombre: string;
      readonly tipo: "texto" | "numero" | "importe" | "si_no" | "fecha" | "opcion";
      readonly opciones?: readonly string[];
      readonly obligatorio?: boolean;
    }[];
    readonly enProcesos?: readonly string[];
  }[];
}

export type UnknownPolicy = "ask" | "default_safe" | "block" | "confirm";

export type BusinessProfileErrorCode =
  | "UNSUPPORTED_VERSION"
  | "SCHEMA"
  | "CONTRADICTION"
  | "INCOMPLETE"
  | "NOT_APPLICABLE_REQUIRED"
  | "MATERIALIZE";

export class BusinessProfileError extends Error {
  readonly code: BusinessProfileErrorCode;
  readonly details: readonly string[];

  constructor(
    code: BusinessProfileErrorCode,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = "BusinessProfileError";
    this.code = code;
    this.details = details;
  }
}
