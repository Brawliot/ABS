/**
 * Tipo del banco de samples (compartido sample→v12 / runners).
 */

export interface SampleField {
  readonly estado: string;
  readonly valor?: unknown;
  readonly confianza?: number;
}

export interface EstadoCustom {
  readonly id: string;
  readonly nombre: string;
  readonly equivale: string;
}

export interface AccionCustom {
  readonly id: string;
  readonly nombre: string;
  readonly de: string;
  readonly a: string;
}

export interface ProcesoCustom {
  readonly proceso: string;
  readonly estados: readonly EstadoCustom[];
  readonly acciones: readonly AccionCustom[];
}

export interface SampleProfile {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly organizacion: {
    readonly sedes: SampleField;
    readonly roles: SampleField;
  };
  readonly naturalezaBienes: SampleField;
  readonly calendario: {
    readonly tieneCitas: SampleField;
    readonly horario: SampleField;
    readonly festivosRegion: SampleField;
    readonly turnosPersonal?: SampleField;
    readonly temporadas?: SampleField;
  };
  readonly procesos: string[];
  readonly cobros: Record<string, SampleField>;
  readonly portalCliente: { readonly autoservicio: SampleField };
  readonly permissionFallback: SampleField;
  readonly excepcionesPermiso: string[];
  readonly politicas: {
    readonly plantilla: string;
    readonly parametros: Record<string, unknown>;
  }[];
  readonly cumplimiento: string[];
  readonly datosSensibles: SampleField;
  readonly modulosEsperados: string[];
  readonly modulosNoEsperados: string[];
  readonly bloqueos: string[];
  readonly necesidadesNoExpresables: string[];
  readonly queEstresa: string[];
  readonly pasos?: readonly ProcesoCustom[];
}
