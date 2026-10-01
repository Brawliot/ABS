/**
 * CAPA 4: Portal Cliente - Acceso a documentos del cliente
 * - Solo documentos donde roleId='cliente' tiene 'ver' o 'descargar'
 * - Sin acceso a gestión (renombrar, permisos)
 */

import type { VaultHandler, UsuarioContext } from "./vault-handler.js";
import type { Documento } from "../elements/documento.js";

export interface DocumentoClienteVisible {
  documentoId: string;
  nombre: string;
  mimetype: string;
  tamanio: number;
  createdAt: Date;
  puedeDescargar: boolean;
}

export function cargarDocumentosPortalCliente(
  vaultHandler: VaultHandler,
  usuario: UsuarioContext,
): DocumentoClienteVisible[] {
  // El usuario debe tener roleId = 'cliente'
  if (usuario.roleId !== "cliente") {
    return [];
  }

  // Listar documentos accesibles al cliente
  const documentosAccesibles = vaultHandler.listarDocumentosAccesibles(usuario);

  return documentosAccesibles.map((doc) => {
    // Verificar si puede descargar
    const puedeDescargar = vaultHandler.verificarAcceso(
      doc.id,
      usuario,
      "descargar",
    );

    return {
      documentoId: doc.id,
      nombre: doc.nombre,
      mimetype: doc.mimetype,
      tamanio: doc.tamanio,
      createdAt: doc.createdAt,
      puedeDescargar,
    };
  });
}

export interface AccionDescargaCliente {
  readonly documentoId: string;
  readonly nombreArchivo: string;
  readonly contenido: Buffer;
  readonly mimetype: string;
}

export function iniciarDescargaDocumentoCliente(
  vaultHandler: VaultHandler,
  usuario: UsuarioContext,
  documentoId: string,
): AccionDescargaCliente {
  // Verificar acceso
  if (!vaultHandler.verificarAcceso(documentoId, usuario, "descargar")) {
    throw new Error(
      `Usuario ${usuario.userId} no tiene permiso para descargar este documento`,
    );
  }

  // Obtener documento
  const documento = vaultHandler.obtenerDocumento(documentoId, usuario);

  // Obtener contenido
  const contenido = vaultHandler.descargarDocumento(documentoId, usuario);

  return {
    documentoId,
    nombreArchivo: documento.nombre,
    contenido,
    mimetype: documento.mimetype,
  };
}
