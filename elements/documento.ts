/**
 * Tipos para el Vault de Documentos
 * Define estructura de documentos y permisos
 */

export type NivelPermiso = "ver" | "editar" | "descargar";

export interface Documento {
  readonly id: string;
  readonly nombre: string;
  readonly mimetype: string;
  readonly tamanio: number;
  readonly propietarioId: string;
  readonly expedienteId?: string;
  readonly createdAt: Date;
  readonly hash: string;
}

export interface PermisoDocumento {
  readonly documentoId: string;
  readonly roleId: string;
  readonly nivel: NivelPermiso;
  readonly createdAt: Date;
}

export interface DocumentoOperacion {
  readonly id: string;
  readonly documentoId: string;
  readonly operacion: "subir" | "descargar" | "compartir" | "eliminar";
  readonly usuarioId: string;
  readonly timestamp: Date;
  readonly detalles?: string;
}
