/**
 * CAPA 4: Sección CRM - Gestión de documentos en el panel de administración
 * - Lista documentos del expediente
 * - Botón subir si es propietario
 * - Manejo de permisos
 */

import type { VaultHandler, UsuarioContext } from "./vault-handler.js";
import type { Documento } from "../elements/documento.js";

export interface SeccionDocumentosCRM {
  documentos: Documento[];
  puedeSubir: boolean;
  puedeGestionarPermisos: boolean;
}

export function cargarSeccionDocumentos(
  vaultHandler: VaultHandler,
  usuario: UsuarioContext,
  expedienteId: string,
): SeccionDocumentosCRM {
  // Listar documentos del expediente donde el usuario tenga acceso
  const documentosAccesibles = vaultHandler.listarDocumentosAccesibles(usuario);

  // Filtrar por expediente
  const documentosExpediente = documentosAccesibles.filter(
    (doc) => doc.expedienteId === expedienteId,
  );

  // Determinar permisos
  const puedeSubir = ["admin", "carpintero", "staff"].includes(usuario.roleId);
  const puedeGestionarPermisos = usuario.esAdmin || usuario.roleId === "carpintero";

  return {
    documentos: documentosExpediente,
    puedeSubir,
    puedeGestionarPermisos,
  };
}

export interface ControlDocumentoCRM {
  documentoId: string;
  nombre: string;
  propietario: string;
  puedeRenombrar: boolean;
  puedeEliminar: boolean;
  puedeGestionarPermisos: boolean;
}

export function construirControlDocumento(
  documento: Documento,
  usuario: UsuarioContext,
): ControlDocumentoCRM {
  const esOwner = documento.propietarioId === usuario.userId;
  const esAdmin = usuario.esAdmin;

  return {
    documentoId: documento.id,
    nombre: documento.nombre,
    propietario: documento.propietarioId,
    puedeRenombrar: esOwner || esAdmin,
    puedeEliminar: esOwner || esAdmin,
    puedeGestionarPermisos: esOwner || esAdmin,
  };
}
