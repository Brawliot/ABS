export interface EtiquetaTarea {
  readonly id: string;
  readonly nombre: string;
  readonly color: string;
  readonly descripcion: string | undefined;
  readonly createdAt: Date;
}

export interface TareaConEtiquetas {
  readonly tareaId: string;
  readonly etiquetaId: string;
  readonly createdAt: Date;
}
