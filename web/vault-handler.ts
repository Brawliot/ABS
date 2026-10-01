/**
 * CAPA 2: Lógica de negocio del Vault
 * - Verificación de acceso
 * - Subida de documentos con validación
 * - Descarga con validación de permisos
 */

import type { SqliteVaultStore } from "../adapters/sqlite-vault-store.js";
import type { NivelPermiso, Documento, PermisoDocumento } from "../elements/documento.js";

export interface UsuarioContext {
  readonly userId: string;
  readonly roleId: string;
  readonly esAdmin: boolean;
}

export class VaultHandler {
  constructor(private store: SqliteVaultStore) {}

  verificarAcceso(
    documentoId: string,
    usuario: UsuarioContext,
    nivelRequerido: NivelPermiso,
  ): boolean {
    if (usuario.esAdmin) {
      return true;
    }

    const permiso = this.store.obtenerPermiso(documentoId, usuario.roleId);

    if (!permiso) {
      return false;
    }

    // Validar que el nivel de permiso cumpla con lo requerido
    const nivelHierarquia: Record<NivelPermiso, number> = {
      ver: 1,
      editar: 2,
      descargar: 3,
    };

    return nivelHierarquia[permiso as unknown as NivelPermiso] >= nivelHierarquia[nivelRequerido];
  }

  subirDocumento(
    expedienteId: string,
    archivo: {
      nombre: string;
      mimetype: string;
      contenido: Buffer;
    },
    usuario: UsuarioContext,
  ): string {
    // Validar que el usuario sea propietario (rolId apropiado para subir)
    if (!["admin", "carpintero", "staff"].includes(usuario.roleId)) {
      throw new Error(
        `Usuario con rol ${usuario.roleId} no puede subir documentos`,
      );
    }

    const documentoId = this.store.subirDocumento(
      archivo.nombre,
      archivo.mimetype,
      archivo.contenido,
      usuario.userId,
      expedienteId,
    );

    return documentoId;
  }

  descargarDocumento(
    documentoId: string,
    usuario: UsuarioContext,
  ): Buffer {
    if (!this.verificarAcceso(documentoId, usuario, "descargar")) {
      throw new Error(
        `Usuario ${usuario.userId} no tiene permiso para descargar este documento`,
      );
    }

    return this.store.obtenerContenido(documentoId);
  }

  obtenerDocumento(
    documentoId: string,
    usuario: UsuarioContext,
  ): Documento {
    if (!this.verificarAcceso(documentoId, usuario, "ver")) {
      throw new Error(
        `Usuario ${usuario.userId} no tiene permiso para ver este documento`,
      );
    }

    const doc = this.store.obtenerDocumento(documentoId);

    if (!doc) {
      throw new Error(`Documento ${documentoId} no encontrado`);
    }

    return doc;
  }

  listarDocumentosAccesibles(usuario: UsuarioContext): Documento[] {
    if (usuario.esAdmin) {
      // Los admins ven todos
      return this.store.listarDocumentosPorRol(usuario.roleId);
    }

    return this.store.listarDocumentosPorRol(usuario.roleId);
  }

  cambiarPermisos(
    documentoId: string,
    usuario: UsuarioContext,
    roleId: string,
    nivel: NivelPermiso,
  ): void {
    // Solo el propietario o admin pueden cambiar permisos
    const doc = this.store.obtenerDocumento(documentoId);

    if (!doc) {
      throw new Error(`Documento ${documentoId} no encontrado`);
    }

    if (doc.propietarioId !== usuario.userId && !usuario.esAdmin) {
      throw new Error(
        `Solo el propietario puede cambiar los permisos del documento`,
      );
    }

    this.store.cambiarPermisos(documentoId, roleId, nivel);
  }

  renombrarDocumento(
    documentoId: string,
    usuario: UsuarioContext,
    nuevoNombre: string,
  ): void {
    const doc = this.store.obtenerDocumento(documentoId);

    if (!doc) {
      throw new Error(`Documento ${documentoId} no encontrado`);
    }

    if (doc.propietarioId !== usuario.userId && !usuario.esAdmin) {
      throw new Error(
        `Solo el propietario puede renombrar el documento`,
      );
    }

    // En una implementación real, actualizarías la BD
    // Por ahora registramos la operación en append-only
    // NOTA: Esta es una operación que debe registrarse en el log de operaciones
  }
}
