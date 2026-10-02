import { randomUUID } from "crypto";
import { createHash } from "crypto";

export type NivelAcceso = "propietario" | "editor" | "comentador" | "visor" | "ninguno";

export interface Documento {
  readonly id: string;
  readonly nombre: string;
  readonly contenido: string;
  readonly propietario_id: string;
  readonly tipo: "texto" | "markdown" | "html" | "binario";
  readonly versión: number;
  readonly fecha_creación: Date;
  readonly fecha_actualización: Date;
  readonly permisos: Permiso[];
}

export interface Permiso {
  readonly id: string;
  readonly documento_id: string;
  readonly tipo_compartir: "usuario" | "grupo" | "público_sin_restricción" | "público_con_contraseña" | "temporal";
  readonly usuario_id?: string;
  readonly grupo_id?: string;
  readonly nivel: NivelAcceso;
  readonly fecha_vencimiento?: Date;
  readonly contraseña?: string; // Hash de contraseña si aplica
  readonly fecha_creación: Date;
}

export interface LinkPublico {
  readonly url: string;
  readonly código: string;
  readonly nivel: NivelAcceso;
  readonly contraseña?: string | undefined;
  readonly vencimiento?: Date | undefined;
}

export class MotorAccesoDocumentos {
  private documentos: Map<string, Documento> = new Map();
  private permisos: Map<string, Permiso[]> = new Map();
  private linksPublicos: Map<string, LinkPublico> = new Map();

  compartirConUsuario(
    documento_id: string,
    usuario_id: string,
    nivel: NivelAcceso
  ): Permiso {
    const documento = this.documentos.get(documento_id);
    if (!documento) {
      throw new Error("Documento no encontrado");
    }

    const permiso: Permiso = {
      id: randomUUID(),
      documento_id,
      tipo_compartir: "usuario",
      usuario_id,
      nivel,
      fecha_creación: new Date(),
    };

    const permisos = this.permisos.get(documento_id) ?? [];
    permisos.push(permiso);
    this.permisos.set(documento_id, permisos);

    return permiso;
  }

  compartirConGrupo(
    documento_id: string,
    grupo_id: string,
    nivel: NivelAcceso
  ): Permiso {
    const documento = this.documentos.get(documento_id);
    if (!documento) {
      throw new Error("Documento no encontrado");
    }

    const permiso: Permiso = {
      id: randomUUID(),
      documento_id,
      tipo_compartir: "grupo",
      grupo_id,
      nivel,
      fecha_creación: new Date(),
    };

    const permisos = this.permisos.get(documento_id) ?? [];
    permisos.push(permiso);
    this.permisos.set(documento_id, permisos);

    return permiso;
  }

  crearLinkPublico(
    documento_id: string,
    nivel?: NivelAcceso,
    contraseña?: string
  ): LinkPublico {
    const documento = this.documentos.get(documento_id);
    if (!documento) {
      throw new Error("Documento no encontrado");
    }

    const código = this.generarCódigoUnico();
    const url = `https://docs.example.com/public/${código}`;
    const nivelFinal = nivel ?? "visor";
    const contraseñaHash = contraseña ? this.hashContraseña(contraseña) : undefined;

    const link: LinkPublico = {
      url,
      código,
      nivel: nivelFinal,
      contraseña: contraseñaHash,
    };

    this.linksPublicos.set(código, link);

    // Crear permiso público
    const permiso: Permiso = {
      id: randomUUID(),
      documento_id,
      tipo_compartir: contraseña ? "público_con_contraseña" : "público_sin_restricción",
      nivel: nivelFinal,
      contraseña: contraseñaHash,
      fecha_creación: new Date(),
    };

    const permisos = this.permisos.get(documento_id) ?? [];
    permisos.push(permiso);
    this.permisos.set(documento_id, permisos);

    return link;
  }

  crearLinkTemporal(
    documento_id: string,
    horas_válidas: number,
    nivel?: NivelAcceso
  ): { url: string; vencimiento: Date } {
    const documento = this.documentos.get(documento_id);
    if (!documento) {
      throw new Error("Documento no encontrado");
    }

    const código = this.generarCódigoUnico();
    const url = `https://docs.example.com/temporal/${código}`;
    const vencimiento = new Date(Date.now() + horas_válidas * 3600000);

    const link: LinkPublico = {
      url,
      código,
      nivel: nivel ?? "visor",
      vencimiento,
    };

    this.linksPublicos.set(código, link);

    // Crear permiso temporal
    const permiso: Permiso = {
      id: randomUUID(),
      documento_id,
      tipo_compartir: "temporal",
      nivel: nivel ?? "visor",
      fecha_vencimiento: vencimiento,
      fecha_creación: new Date(),
    };

    const permisos = this.permisos.get(documento_id) ?? [];
    permisos.push(permiso);
    this.permisos.set(documento_id, permisos);

    return { url, vencimiento };
  }

  verificarAcceso(documento_id: string, usuario_id: string): NivelAcceso | null {
    const documento = this.documentos.get(documento_id);
    if (!documento) {
      return null;
    }

    // El propietario siempre tiene acceso total
    if (documento.propietario_id === usuario_id) {
      return "propietario";
    }

    const permisos = this.permisos.get(documento_id) ?? [];
    const permiso = permisos.find((p) => p.usuario_id === usuario_id);

    if (!permiso) {
      return null;
    }

    // Verificar vencimiento
    if (
      permiso.fecha_vencimiento &&
      permiso.fecha_vencimiento < new Date()
    ) {
      return null;
    }

    return permiso.nivel;
  }

  revocarAcceso(documento_id: string, usuario_id: string): void {
    const permisos = this.permisos.get(documento_id) ?? [];
    const filtrados = permisos.filter((p) => p.usuario_id !== usuario_id);
    this.permisos.set(documento_id, filtrados);
  }

  obtenerDocumentosCompartidosConmigo(usuario_id: string): Documento[] {
    const documentos: Documento[] = [];

    for (const [docId, doc] of this.documentos) {
      const acceso = this.verificarAcceso(docId, usuario_id);
      if (acceso && acceso !== "ninguno") {
        documentos.push(doc);
      }
    }

    return documentos;
  }

  crearDocumento(
    nombre: string,
    contenido: string,
    propietario_id: string,
    tipo: "texto" | "markdown" | "html" | "binario" = "texto"
  ): Documento {
    const id = randomUUID();
    const ahora = new Date();

    const documento: Documento = {
      id,
      nombre,
      contenido,
      propietario_id,
      tipo,
      versión: 1,
      fecha_creación: ahora,
      fecha_actualización: ahora,
      permisos: [],
    };

    this.documentos.set(id, documento);
    this.permisos.set(id, []);

    return documento;
  }

  obtenerDocumento(id: string): Documento | undefined {
    return this.documentos.get(id);
  }

  obtenerPermisos(documento_id: string): Permiso[] {
    return this.permisos.get(documento_id) ?? [];
  }

  private generarCódigoUnico(): string {
    return randomUUID().substring(0, 12);
  }

  private hashContraseña(contraseña: string): string {
    return createHash("sha256").update(contraseña).digest("hex");
  }
}
