/**
 * CAPA 0: Definiciones de entidades del Vault
 * Documento y PermisoDocumento — append-only
 */

export interface Documento {
  readonly id: string;
  readonly nombre: string;
  readonly mimetype: string;
  readonly tamanio: number;
  readonly propietarioId: string;
  readonly expedienteId: string;
  readonly createdAt: Date;
  readonly hash: string;
}

export type NivelPermiso = "ver" | "editar" | "descargar";

export interface PermisoDocumento {
  readonly documentoId: string;
  readonly roleId: string;
  readonly nivel: NivelPermiso;
}

export interface DocumentoOperacion {
  readonly tipo: "renombrar" | "subir" | "cambiar_permisos";
  readonly documentoId: string;
  readonly propietarioId: string;
  readonly timestamp: Date;
  readonly detalles: Record<string, unknown>;
}
