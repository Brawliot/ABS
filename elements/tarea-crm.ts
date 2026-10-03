export interface TareaCrm {
  readonly id: string;
  readonly texto: string;
  readonly estado: 'pendiente' | 'completada';
  readonly prioridad: 'baja' | 'media' | 'alta';
  readonly asignadoA: string | undefined;
  readonly vencimiento: Date | undefined;
  readonly etiquetaIds: string[];
  readonly createdAt: Date;
  readonly completadoEn: Date | undefined;
}

export function crearTarea(
  id: string,
  texto: string,
  prioridad: 'baja' | 'media' | 'alta' = 'media',
  asignadoA?: string,
  vencimiento?: Date,
): TareaCrm {
  return {
    id,
    texto,
    estado: 'pendiente',
    prioridad,
    asignadoA: asignadoA || undefined,
    vencimiento: vencimiento || undefined,
    etiquetaIds: [],
    createdAt: new Date(),
    completadoEn: undefined,
  };
}
