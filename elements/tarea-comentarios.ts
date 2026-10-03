export interface ComentarioTarea {
  readonly id: string;
  readonly tareaId: string;
  readonly autorId: string;
  readonly texto: string;
  readonly createdAt: Date;
  readonly updatedAt: Date | undefined;
}
