import { describe, it, expect, beforeEach } from "vitest";
import { MotorAccesoDocumentos } from "../policies/documentos-acceso.js";
import { MotorVersionado } from "../policies/documentos-versionado.js";
import { MotorBúsquedaDocumentos } from "../policies/documentos-busqueda.js";
import { SqliteDocumentosStore } from "../adapters/sqlite-documentos-store.js";
import { join } from "path";

const TEST_DB = join("/tmp", `test-documentos-${Date.now()}.sqlite`);

describe("Documentos Compartidos - Módulo Futuro (75%)", () => {
  let motorAcceso: MotorAccesoDocumentos;
  let motorVersionado: MotorVersionado;
  let motorBúsqueda: MotorBúsquedaDocumentos;
  let store: SqliteDocumentosStore;

  beforeEach(() => {
    motorAcceso = new MotorAccesoDocumentos();
    motorVersionado = new MotorVersionado();
    motorBúsqueda = new MotorBúsquedaDocumentos();
    store = new SqliteDocumentosStore(TEST_DB);
  });

  // ==================== TESTS ACCESO ====================

  it("comparte documento con usuario", () => {
    const doc = motorAcceso.crearDocumento(
      "Propuesta de Proyecto",
      "Contenido inicial",
      "user-123"
    );

    const permiso = motorAcceso.compartirConUsuario(doc.id, "user-456", "editor");

    expect(permiso.usuario_id).toBe("user-456");
    expect(permiso.nivel).toBe("editor");
    expect(permiso.tipo_compartir).toBe("usuario");
  });

  it("comparte documento con grupo", () => {
    const doc = motorAcceso.crearDocumento(
      "Documento de Equipo",
      "Contenido",
      "admin-1"
    );

    const permiso = motorAcceso.compartirConGrupo(doc.id, "grupo-marketing", "comentador");

    expect(permiso.grupo_id).toBe("grupo-marketing");
    expect(permiso.nivel).toBe("comentador");
    expect(permiso.tipo_compartir).toBe("grupo");
  });

  it("crea link público sin contraseña", () => {
    const doc = motorAcceso.crearDocumento(
      "Documento Público",
      "Contenido para todos",
      "user-1"
    );

    const link = motorAcceso.crearLinkPublico(doc.id, "visor");

    expect(link.url).toContain("https://docs.example.com/public/");
    expect(link.nivel).toBe("visor");
    expect(link.contraseña).toBeUndefined();
  });

  it("crea link público con contraseña", () => {
    const doc = motorAcceso.crearDocumento(
      "Documento Protegido",
      "Contenido sensible",
      "user-2"
    );

    const link = motorAcceso.crearLinkPublico(doc.id, "visor", "micontraseña123");

    expect(link.url).toBeDefined();
    expect(link.nivel).toBe("visor");
    expect(link.contraseña).toBeDefined();
    expect(link.contraseña).not.toBe("micontraseña123"); // Hash
  });

  it("crea link temporal con vencimiento", () => {
    const doc = motorAcceso.crearDocumento(
      "Documento Temporal",
      "Acceso 24h",
      "user-3"
    );

    const { url, vencimiento } = motorAcceso.crearLinkTemporal(doc.id, 24, "editor");

    expect(url).toContain("https://docs.example.com/temporal/");
    expect(vencimiento.getTime()).toBeGreaterThan(Date.now());

    // Verificar que es aproximadamente 24 horas
    const diferencia = vencimiento.getTime() - Date.now();
    const horas = diferencia / (1000 * 60 * 60);
    expect(horas).toBeCloseTo(24, 0);
  });

  it("verifica acceso según nivel", () => {
    const doc = motorAcceso.crearDocumento(
      "Documento Test",
      "Contenido",
      "propietario-1"
    );

    motorAcceso.compartirConUsuario(doc.id, "usuario-2", "editor");
    motorAcceso.compartirConUsuario(doc.id, "usuario-3", "visor");

    expect(motorAcceso.verificarAcceso(doc.id, "propietario-1")).toBe("propietario");
    expect(motorAcceso.verificarAcceso(doc.id, "usuario-2")).toBe("editor");
    expect(motorAcceso.verificarAcceso(doc.id, "usuario-3")).toBe("visor");
    expect(motorAcceso.verificarAcceso(doc.id, "usuario-desconocido")).toBeNull();
  });

  it("revoca acceso correctamente", () => {
    const doc = motorAcceso.crearDocumento(
      "Documento Revocable",
      "Contenido",
      "owner-1"
    );

    motorAcceso.compartirConUsuario(doc.id, "user-revoke", "editor");
    expect(motorAcceso.verificarAcceso(doc.id, "user-revoke")).toBe("editor");

    motorAcceso.revocarAcceso(doc.id, "user-revoke");
    expect(motorAcceso.verificarAcceso(doc.id, "user-revoke")).toBeNull();
  });

  it("obtiene documentos compartidos conmigo", () => {
    const doc1 = motorAcceso.crearDocumento("Doc 1", "Contenido 1", "owner-1");
    const doc2 = motorAcceso.crearDocumento("Doc 2", "Contenido 2", "owner-2");
    const doc3 = motorAcceso.crearDocumento("Doc 3", "Contenido 3", "owner-3");

    motorAcceso.compartirConUsuario(doc1.id, "usuario-x", "visor");
    motorAcceso.compartirConUsuario(doc2.id, "usuario-x", "editor");

    const documentosMios = motorAcceso.obtenerDocumentosCompartidosConmigo("usuario-x");

    expect(documentosMios).toHaveLength(2);
    expect(documentosMios.some((d) => d.id === doc1.id)).toBe(true);
    expect(documentosMios.some((d) => d.id === doc2.id)).toBe(true);
  });

  // ==================== TESTS VERSIONADO ====================

  it("guarda versión nueva", () => {
    const doc_id = "doc-version-1";
    const v1 = motorVersionado.guardarCambio(
      doc_id,
      "Primera versión del contenido",
      "usuario-a"
    );

    expect(v1.número).toBe(1);
    expect(v1.contenido_nuevo).toBe("Primera versión del contenido");
    expect(v1.autor).toBe("usuario-a");
  });

  it("obtiene historial completo", () => {
    const doc_id = "doc-history";

    motorVersionado.guardarCambio(doc_id, "Version 1", "user-1", "Inicial");
    motorVersionado.guardarCambio(doc_id, "Version 2", "user-2", "Actualización");
    motorVersionado.guardarCambio(doc_id, "Version 3", "user-1", "Corrección");

    const historial = motorVersionado.obtenerHistorial(doc_id);

    expect(historial).toHaveLength(3);
    expect(historial[0].número).toBe(1);
    expect(historial[2].número).toBe(3);
  });

  it("revierte a versión anterior", () => {
    const doc_id = "doc-revert";

    motorVersionado.guardarCambio(doc_id, "V1", "user-a");
    motorVersionado.guardarCambio(doc_id, "V2", "user-a");
    motorVersionado.guardarCambio(doc_id, "V3", "user-a");

    motorVersionado.revertirAVersión(doc_id, 1);

    const historial = motorVersionado.obtenerHistorial(doc_id);

    expect(historial).toHaveLength(4);
    expect(historial[3].contenido_nuevo).toBe("V1");
  });

  it("compara dos versiones", () => {
    const doc_id = "doc-compare";

    motorVersionado.guardarCambio(
      doc_id,
      "Línea 1\nLínea 2\nLínea 3",
      "user-1"
    );
    motorVersionado.guardarCambio(
      doc_id,
      "Línea 1\nLínea 2 modificada\nLínea 3\nLínea 4 nueva",
      "user-2"
    );

    const comparativa = motorVersionado.compararVersiones(doc_id, 1, 2);

    expect(comparativa.añadidas.length).toBeGreaterThan(0);
    expect(comparativa.modificadas.length).toBeGreaterThan(0);
  });

  // ==================== TESTS BÚSQUEDA Y COMENTARIOS ====================

  it("busca en contenido", () => {
    motorBúsqueda.registrarDocumento("doc-1", "Este es un documento sobre ventas");
    motorBúsqueda.registrarDocumento(
      "doc-2",
      "Otro documento con información de marketing"
    );
    motorBúsqueda.registrarDocumento(
      "doc-3",
      "Documento de soporte técnico"
    );

    const resultados = motorBúsqueda.buscarFullText("documento");

    expect(resultados.length).toBeGreaterThan(0);
    expect(resultados.every((r) => r.documento_id)).toBe(true);
  });

  it("agrega comentario inline", () => {
    const doc_id = "doc-comentarios";
    motorBúsqueda.registrarDocumento(doc_id, "Contenido del documento");

    const comentario = motorBúsqueda.agregarComentario(
      doc_id,
      5,
      "Revisar esta sección",
      "reviewer-1"
    );

    expect(comentario.línea).toBe(5);
    expect(comentario.texto).toBe("Revisar esta sección");
    expect(comentario.resuelta).toBe(false);
  });

  it("resuelve comentario", () => {
    const doc_id = "doc-resolver";
    motorBúsqueda.registrarDocumento(doc_id, "Contenido");

    const comentario = motorBúsqueda.agregarComentario(
      doc_id,
      3,
      "Problema encontrado",
      "user-1"
    );

    motorBúsqueda.resolverComentario(comentario.id, doc_id);

    const comentarios = motorBúsqueda.obtenerComentarios(doc_id);
    const resuelto = comentarios.find((c) => c.id === comentario.id);

    expect(resuelto?.resuelta).toBe(true);
  });

  it("obtiene documentos recientes", () => {
    motorBúsqueda.registrarDocumento("doc-recent-1", "Contenido 1");
    motorBúsqueda.registrarDocumento("doc-recent-2", "Contenido 2");
    motorBúsqueda.registrarDocumento("doc-recent-3", "Contenido 3");

    const recientes = motorBúsqueda.obtenerDocumentosRecientes("user-1", 1);

    expect(recientes.length).toBeGreaterThan(0);
    expect(recientes.every((d) => d.última_actualización)).toBe(true);
  });

  // ==================== TESTS PERSISTENCIA ====================

  it("guarda y recupera documento de base de datos", () => {
    const doc = motorAcceso.crearDocumento(
      "Documento Persistente",
      "Contenido importante",
      "user-persist"
    );

    store.guardarDocumento(doc);
    const recuperado = store.obtenerDocumento(doc.id);

    expect(recuperado).toBeDefined();
    expect(recuperado?.nombre).toBe("Documento Persistente");
    expect(recuperado?.contenido).toBe("Contenido importante");
  });

  it("lista documentos del propietario", () => {
    const doc1 = motorAcceso.crearDocumento("D1", "C1", "owner-persist");
    const doc2 = motorAcceso.crearDocumento("D2", "C2", "owner-persist");

    store.guardarDocumento(doc1);
    store.guardarDocumento(doc2);

    const recuperados = [
      store.obtenerDocumento(doc1.id),
      store.obtenerDocumento(doc2.id),
    ].filter((d) => d !== undefined);

    expect(recuperados).toHaveLength(2);
  });

  it("no mezcla comentarios entre documentos", () => {
    const doc1 = "doc-sep-1";
    const doc2 = "doc-sep-2";

    motorBúsqueda.registrarDocumento(doc1, "Contenido 1");
    motorBúsqueda.registrarDocumento(doc2, "Contenido 2");

    motorBúsqueda.agregarComentario(doc1, 1, "Comentario para doc1", "user-1");
    motorBúsqueda.agregarComentario(doc2, 1, "Comentario para doc2", "user-2");

    const comentariosDoc1 = motorBúsqueda.obtenerComentarios(doc1);
    const comentariosDoc2 = motorBúsqueda.obtenerComentarios(doc2);

    expect(comentariosDoc1).toHaveLength(1);
    expect(comentariosDoc2).toHaveLength(1);
    expect(comentariosDoc1[0].autor_id).toBe("user-1");
    expect(comentariosDoc2[0].autor_id).toBe("user-2");
  });
});
