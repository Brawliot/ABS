import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type {
  Campaña,
  ContactoEmail,
  EstadoCampaña,
  EstadoContacto,
  EventoEmail,
  PlantillaEmail,
  Segmento,
  SegmentoCriterio,
  TipoSegmento,
} from '../elements/email-marketing.js';

export class SqliteEmailMarketingStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializarTablas();
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contactos_email (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        nombre TEXT,
        empresa TEXT,
        estado TEXT NOT NULL,
        fecha_suscripción TEXT NOT NULL,
        último_abierto TEXT,
        último_click TEXT,
        metadatos TEXT
      );

      CREATE TABLE IF NOT EXISTS segmentos (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        criterios_json TEXT,
        contactos_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS contacto_segmento (
        contacto_id TEXT NOT NULL,
        segmento_id TEXT NOT NULL,
        PRIMARY KEY (contacto_id, segmento_id),
        FOREIGN KEY (contacto_id) REFERENCES contactos_email(id),
        FOREIGN KEY (segmento_id) REFERENCES segmentos(id)
      );

      CREATE TABLE IF NOT EXISTS plantillas_email (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        asunto TEXT NOT NULL,
        contenido_html TEXT NOT NULL,
        contenido_texto TEXT,
        variables_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS campañas (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        descripción TEXT,
        plantilla_id TEXT NOT NULL,
        segmento_id TEXT NOT NULL,
        estado TEXT NOT NULL,
        fecha_envío TEXT NOT NULL,
        remitente TEXT NOT NULL,
        asunto_personalizado INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (plantilla_id) REFERENCES plantillas_email(id),
        FOREIGN KEY (segmento_id) REFERENCES segmentos(id)
      );

      CREATE TABLE IF NOT EXISTS eventos_email (
        id TEXT PRIMARY KEY,
        campaña_id TEXT NOT NULL,
        contacto_id TEXT,
        email TEXT NOT NULL,
        tipo TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        detalles_json TEXT,
        FOREIGN KEY (campaña_id) REFERENCES campañas(id)
      );

      CREATE INDEX IF NOT EXISTS idx_contactos_email ON contactos_email(email);
      CREATE INDEX IF NOT EXISTS idx_contactos_estado ON contactos_email(estado);
      CREATE INDEX IF NOT EXISTS idx_segmentos_tipo ON segmentos(tipo);
      CREATE INDEX IF NOT EXISTS idx_plantillas_nombre ON plantillas_email(nombre);
      CREATE INDEX IF NOT EXISTS idx_campañas_estado ON campañas(estado);
      CREATE INDEX IF NOT EXISTS idx_eventos_campaña ON eventos_email(campaña_id);
      CREATE INDEX IF NOT EXISTS idx_eventos_contacto ON eventos_email(contacto_id);
    `);
  }

  crearContacto(
    email: string,
    nombre?: string,
    empresa?: string
  ): ContactoEmail {
    const id = randomUUID();
    const ahora = new Date();

    this.db
      .prepare(
        `INSERT INTO contactos_email
        (id, email, nombre, empresa, estado, fecha_suscripción, metadatos)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        email,
        nombre || null,
        empresa || null,
        "activo",
        ahora.toISOString(),
        JSON.stringify({})
      );

    return {
      id,
      email,
      nombre,
      empresa,
      segmentos: [],
      estado: "activo",
      fechaSuscripción: ahora,
      metadatos: {},
    };
  }

  obtenerContacto(id: string): ContactoEmail | undefined {
    const row = this.db
      .prepare("SELECT * FROM contactos_email WHERE id = ?")
      .get(id) as any;

    if (!row) return undefined;

    const segmentos = this.db
      .prepare("SELECT segmento_id FROM contacto_segmento WHERE contacto_id = ?")
      .all(id) as Array<{ segmento_id: string }>;

    return {
      id: row.id,
      email: row.email,
      nombre: row.nombre,
      empresa: row.empresa,
      segmentos: segmentos.map((s) => s.segmento_id),
      estado: row.estado,
      fechaSuscripción: new Date(row.fecha_suscripción),
      últimoAbierto: row.último_abierto ? new Date(row.último_abierto) : undefined,
      últimoClick: row.último_click ? new Date(row.último_click) : undefined,
      metadatos: row.metadatos ? JSON.parse(row.metadatos) : {},
    };
  }

  listarContactos(): ContactoEmail[] {
    const rows = this.db
      .prepare("SELECT * FROM contactos_email ORDER BY fecha_suscripción DESC")
      .all() as any[];

    return rows.map((row) => {
      const segmentos = this.db
        .prepare(
          "SELECT segmento_id FROM contacto_segmento WHERE contacto_id = ?"
        )
        .all(row.id) as Array<{ segmento_id: string }>;

      return {
        id: row.id,
        email: row.email,
        nombre: row.nombre,
        empresa: row.empresa,
        segmentos: segmentos.map((s) => s.segmento_id),
        estado: row.estado,
        fechaSuscripción: new Date(row.fecha_suscripción),
        últimoAbierto: row.último_abierto
          ? new Date(row.último_abierto)
          : undefined,
        últimoClick: row.último_click ? new Date(row.último_click) : undefined,
        metadatos: row.metadatos ? JSON.parse(row.metadatos) : {},
      };
    });
  }

  actualizarContacto(
    id: string,
    datos: Partial<ContactoEmail>
  ): void {
    if (datos.estado) {
      this.db
        .prepare("UPDATE contactos_email SET estado = ? WHERE id = ?")
        .run(datos.estado, id);
    }
    if (datos.últimoAbierto) {
      this.db
        .prepare("UPDATE contactos_email SET último_abierto = ? WHERE id = ?")
        .run(datos.últimoAbierto.toISOString(), id);
    }
    if (datos.últimoClick) {
      this.db
        .prepare("UPDATE contactos_email SET último_click = ? WHERE id = ?")
        .run(datos.últimoClick.toISOString(), id);
    }
  }

  crearSegmento(
    nombre: string,
    tipo: TipoSegmento,
    criterios?: SegmentoCriterio[]
  ): Segmento {
    const id = randomUUID();
    const ahora = new Date();

    this.db
      .prepare(
        `INSERT INTO segmentos
        (id, nombre, tipo, criterios_json, contactos_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        nombre,
        tipo,
        criterios ? JSON.stringify(criterios) : null,
        0,
        ahora.toISOString()
      );

    return {
      id,
      nombre,
      tipo,
      criterios,
      contactosCount: 0,
      createdAt: ahora,
    };
  }

  obtenerSegmento(id: string): Segmento | undefined {
    const row = this.db
      .prepare("SELECT * FROM segmentos WHERE id = ?")
      .get(id) as any;

    if (!row) return undefined;

    return {
      id: row.id,
      nombre: row.nombre,
      tipo: row.tipo,
      criterios: row.criterios_json ? JSON.parse(row.criterios_json) : undefined,
      contactosCount: row.contactos_count,
      createdAt: new Date(row.created_at),
    };
  }

  listarSegmentos(): Segmento[] {
    const rows = this.db
      .prepare("SELECT * FROM segmentos ORDER BY created_at DESC")
      .all() as any[];

    return rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      tipo: row.tipo,
      criterios: row.criterios_json ? JSON.parse(row.criterios_json) : undefined,
      contactosCount: row.contactos_count,
      createdAt: new Date(row.created_at),
    }));
  }

  crearPlantilla(
    nombre: string,
    asunto: string,
    contenidoHTML: string,
    contenidoTexto?: string,
    variables?: string[]
  ): PlantillaEmail {
    const id = randomUUID();
    const ahora = new Date();

    this.db
      .prepare(
        `INSERT INTO plantillas_email
        (id, nombre, asunto, contenido_html, contenido_texto, variables_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        nombre,
        asunto,
        contenidoHTML,
        contenidoTexto || null,
        JSON.stringify(variables || []),
        ahora.toISOString()
      );

    return {
      id,
      nombre,
      asunto,
      contenidoHTML,
      contenidoTexto,
      variables: variables || [],
      createdAt: ahora,
    };
  }

  obtenerPlantilla(id: string): PlantillaEmail | undefined {
    const row = this.db
      .prepare("SELECT * FROM plantillas_email WHERE id = ?")
      .get(id) as any;

    if (!row) return undefined;

    return {
      id: row.id,
      nombre: row.nombre,
      asunto: row.asunto,
      contenidoHTML: row.contenido_html,
      contenidoTexto: row.contenido_texto,
      variables: JSON.parse(row.variables_json || "[]"),
      createdAt: new Date(row.created_at),
    };
  }

  crearCampaña(
    nombre: string,
    plantillaId: string,
    segmentoId: string,
    fechaEnvío: Date,
    remitente: string
  ): Campaña {
    const id = randomUUID();
    const ahora = new Date();

    this.db
      .prepare(
        `INSERT INTO campañas
        (id, nombre, plantilla_id, segmento_id, estado, fecha_envío, remitente, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, nombre, plantillaId, segmentoId, "borrador", fechaEnvío.toISOString(), remitente, ahora.toISOString());

    return {
      id,
      nombre,
      plantillaId,
      segmentoId,
      estado: "borrador",
      fechaEnvío,
      remitente,
      asuntoPersonalizado: false,
      createdAt: ahora,
    };
  }

  obtenerCampaña(id: string): Campaña | undefined {
    const row = this.db
      .prepare("SELECT * FROM campañas WHERE id = ?")
      .get(id) as any;

    if (!row) return undefined;

    return {
      id: row.id,
      nombre: row.nombre,
      descripción: row.descripción,
      plantillaId: row.plantilla_id,
      segmentoId: row.segmento_id,
      estado: row.estado,
      fechaEnvío: new Date(row.fecha_envío),
      remitente: row.remitente,
      asuntoPersonalizado: Boolean(row.asunto_personalizado),
      createdAt: new Date(row.created_at),
    };
  }

  actualizarEstadoCampaña(id: string, estado: EstadoCampaña): void {
    this.db
      .prepare("UPDATE campañas SET estado = ? WHERE id = ?")
      .run(estado, id);
  }

  listarCampañas(): Campaña[] {
    const rows = this.db
      .prepare("SELECT * FROM campañas ORDER BY created_at DESC")
      .all() as any[];

    return rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      descripción: row.descripción,
      plantillaId: row.plantilla_id,
      segmentoId: row.segmento_id,
      estado: row.estado,
      fechaEnvío: new Date(row.fecha_envío),
      remitente: row.remitente,
      asuntoPersonalizado: Boolean(row.asunto_personalizado),
      createdAt: new Date(row.created_at),
    }));
  }

  registrarEvento(evento: EventoEmail): void {
    this.db
      .prepare(
        `INSERT INTO eventos_email
        (id, campaña_id, contacto_id, email, tipo, timestamp, detalles_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        evento.id,
        evento.campaña_id,
        evento.contacto_id || null,
        evento.email,
        evento.tipo,
        evento.timestamp.toISOString(),
        evento.detalles ? JSON.stringify(evento.detalles) : null
      );
  }

  obtenerEventosCampaña(campaña_id: string): EventoEmail[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM eventos_email WHERE campaña_id = ? ORDER BY timestamp ASC"
      )
      .all(campaña_id) as any[];

    return rows.map((row) => ({
      id: row.id,
      campaña_id: row.campaña_id,
      contacto_id: row.contacto_id,
      email: row.email,
      tipo: row.tipo,
      timestamp: new Date(row.timestamp),
      detalles: row.detalles_json ? JSON.parse(row.detalles_json) : undefined,
    }));
  }

  cerrarConexión(): void {
    this.db.close();
  }
}
