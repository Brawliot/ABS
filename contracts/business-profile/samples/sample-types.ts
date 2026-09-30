/**
 * Tipo del banco de samples (compartido sample→v12 / runners).
 */

export interface SampleField {
  readonly estado: string;
  readonly valor?: unknown;
  readonly confianza?: number;
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
