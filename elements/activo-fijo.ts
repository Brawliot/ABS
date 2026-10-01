export type TipoActivo = "muebles" | "vehículos" | "máquinas" | "tecnología" | "inmuebles";
export type MetodoDepreciación = "lineal" | "acelerada" | "porcentaje_fijo";
export type EstadoActivo = "activo" | "mantenimiento" | "retirado" | "vendido";

export interface ValorActivo {
  readonly fecha: Date;
  readonly valorLibros: number;
  readonly depreciación: number;
  readonly método: MetodoDepreciación;
  readonly vidaÚtil: number;
}

export interface ActivoFijo {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoActivo;
  readonly descripción?: string | undefined;
  readonly fechaCompra: Date;
  readonly costoAdquisición: number;
  readonly valoresActuales: ValorActivo[];
  readonly estado: EstadoActivo;
  readonly ubicación: string;
  readonly responsable?: string | undefined;
  readonly createdAt: Date;
}

export interface MantenimientoActivo {
  readonly id: string;
  readonly activoId: string;
  readonly fecha: Date;
  readonly tipo: "preventivo" | "correctivo";
  readonly costo: number;
  readonly descripción: string;
  readonly próximaMantenimiento?: Date | undefined;
}

export interface AsientoDepreciación {
  readonly id: string;
  readonly activoId: string;
  readonly período: string;
  readonly monto: number;
  readonly createdAt: Date;
}
