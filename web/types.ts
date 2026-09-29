/**
 * Tipos de la aplicación web (capa presentación → navegador).
 * No decide reglas de negocio: solo proyecta UiSpec + sesión de desarrollo.
 */

import type { ComposerQuestion } from "../composer/types.js";
import type { DesignSystem } from "../design/schema.js";
import type { GeneratorInput } from "../generator/types.js";
import type { PresentationChannel } from "../presentation/types.js";
import type { ValidatedUiSpec } from "../presentation/validated.js";

/** Sesión provisional de desarrollo (NO es el sistema de cuentas real). */
export interface DevSession {
  readonly roleId: string;
  readonly parteId: string;
  readonly channel: PresentationChannel;
  readonly processGroupId?: string;
  readonly viewId?: string;
  /** Empresa (tenant) en instancia multiempresa. */
  readonly tenantId?: string;
  /** Sede operativa; si el rol está limitado, filtra expedientes. */
  readonly sedeId?: string;
  /** Rol con ámbito solo-sede (no ve otras sedes). */
  readonly sedeScoped?: boolean;
}

export interface SampleRow {
  readonly id: string;
  readonly label: string;
  readonly stateId: string | null;
  readonly parteId: string;
  readonly meta?: string;
  readonly sedeId?: string;
  readonly vinculadaA?: string;
}

export interface AppBootResult {
  readonly profileId: string;
  readonly brandName: string;
  readonly spec: ValidatedUiSpec;
  readonly input: GeneratorInput;
  readonly designSystem: DesignSystem;
  /** Preguntas del compositor (avisos; no ocultas). */
  readonly questions: readonly ComposerQuestion[];
  readonly roles: readonly { readonly id: string; readonly label: string }[];
  readonly samplePartes: readonly { readonly id: string; readonly label: string }[];
  readonly sampleRows: readonly SampleRow[];
  /** Piezas de UiSpec no renderizadas en esta pasada. */
  readonly unrendered: readonly string[];
}

export interface RenderAppOptions {
  readonly session: DevSession;
  readonly boot: AppBootResult;
  readonly basePath?: string;
  /**
   * Modo vivo: filas desde EventStore + formularios POST /action.
   * Sin esto, render solo lectura (compatible con tests de arranque).
   */
  readonly liveRows?: readonly SampleRow[];
  /** Fuerza modo vivo aunque no haya filas proyectadas. */
  readonly live?: boolean;
  readonly flash?: import("./runtime.js").FlashMessage;
  /** Indicadores de bloqueo activos (runtime). */
  readonly activeBlocks?: readonly {
    readonly text: string;
    readonly processGroupId?: string;
    readonly archetypeId: string;
    readonly blockedStateId: string;
  }[];
  /**
   * Selector DevSession. Por defecto true en desarrollo.
   * false con sesión auth real o en producción.
   */
  readonly showDevSession?: boolean;
}
