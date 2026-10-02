/**
 * Almacén SQLite para módulo de Soporte: Tickets, comentarios, base de conocimiento,
 * escaladas (append-only) y encuestas CSAT.
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type {
  Ticket,
  ComentarioTicket,
  Escalada,
  TipoTicket,
  NivelPrioridad,
  EstadoTicket,
  CanalContacto,
} from "../policies/soporte-tickets.js";
import type { ArticuloConocimiento } from "../policies/soporte-base-conocimiento.js";
import type { RespuestaCSAT, EncuestaCSAT } from "../policies/soporte-csat.js";

export class SqliteSoporteStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializarTablas();
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        numero INTEGER UNIQUE NOT NULL,
        cliente_id TEXT NOT NULL,
        titulo TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        tipo TEXT NOT NULL,
        prioridad TEXT NOT NULL,
        estado TEXT NOT NULL,
        agente_asignado_id TEXT,
        canal_contacto TEXT NOT NULL,
        fecha_creacion TEXT NOT NULL,
        fecha_vencimiento TEXT NOT NULL,
        fecha_resolucion TEXT,
        tags TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comentarios_ticket (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        autor_id TEXT NOT NULL,
        contenido TEXT NOT NULL,
        es_interno INTEGER NOT NULL,
        fecha_creacion TEXT NOT NULL,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id)
      );

      CREATE TABLE IF NOT EXISTS base_conocimiento (
        id TEXT PRIMARY KEY,
        titulo TEXT NOT NULL,
        contenido TEXT NOT NULL,
        categoria TEXT NOT NULL,
        etiquetas TEXT,
        vistas INTEGER NOT NULL DEFAULT 0,
        utilidad INTEGER NOT NULL DEFAULT 50,
        fecha_creacion TEXT NOT NULL,
        fecha_actualizacion TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escaladas (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        razon TEXT NOT NULL,
        nivel_anterior TEXT,
        nivel_nuevo TEXT NOT NULL,
        fecha_escalada TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS csat_encuestas (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        cliente_id TEXT NOT NULL,
        estado TEXT NOT NULL,
        fecha_envio TEXT NOT NULL,
        fecha_respuesta TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS csat_respuestas (
        id TEXT PRIMARY KEY,
        encuesta_id TEXT NOT NULL,
        ticket_id TEXT NOT NULL,
        puntuacion INTEGER NOT NULL,
        comentario TEXT,
        fecha_respuesta TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (encuesta_id) REFERENCES csat_encuestas(id)
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_cliente ON tickets(cliente_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets(estado);
      CREATE INDEX IF NOT EXISTS idx_tickets_agente ON tickets(agente_asignado_id);
      CREATE INDEX IF NOT EXISTS idx_comentarios_ticket ON comentarios_ticket(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_base_conocimiento_cat ON base_conocimiento(categoria);
      CREATE INDEX IF NOT EXISTS idx_escaladas_ticket ON escaladas(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_csat_ticket ON csat_encuestas(ticket_id);
    `);
  }

  crearTicket(
    clienteId: string,
    titulo: string,
    descripcion: string,
    tipo: TipoTicket,
    prioridad: NivelPrioridad,
    estado: EstadoTicket,
    canalContacto: CanalContacto,
    fechaVencimiento: Date,
    tags?: string[]
  ): string {
    const id = randomUUID();
    const numero = Date.now() % 1000000;
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO tickets
      (id, numero, cliente_id, titulo, descripcion, tipo, prioridad, estado,
       canal_contacto, fecha_creacion, fecha_vencimiento, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      numero,
      clienteId,
      titulo,
      descripcion,
      tipo,
      prioridad,
      estado,
      canalContacto,
      ahora.toISOString(),
      fechaVencimiento.toISOString(),
      tags ? JSON.stringify(tags) : null,
      ahora.toISOString()
    );

    return id;
  }

  obtenerTicket(id: string): Ticket | undefined {
    const row = this.db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as any;
    if (!row) return undefined;

    return this.rowATicket(row);
  }

  actualizarEstadoTicket(id: string, nuevoEstado: EstadoTicket, fechaResolución?: Date): void {
    const ahora = new Date();
    this.db.prepare(
      `UPDATE tickets
       SET estado = ?, fecha_resolucion = ?, created_at = ?
       WHERE id = ?`
    ).run(
      nuevoEstado,
      fechaResolución?.toISOString() || null,
      ahora.toISOString(),
      id
    );
  }

  asignarAgente(ticketId: string, agenteId: string): void {
    this.db.prepare(
      "UPDATE tickets SET agente_asignado_id = ? WHERE id = ?"
    ).run(agenteId, ticketId);
  }

  obtenerTicketsCliente(clienteId: string): Ticket[] {
    const rows = this.db.prepare(
      "SELECT * FROM tickets WHERE cliente_id = ? ORDER BY created_at DESC"
    ).all(clienteId) as any[];

    return rows.map(row => this.rowATicket(row));
  }

  agregarComentario(ticketId: string, autorId: string, contenido: string, esInterno: boolean): void {
    const id = randomUUID();
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO comentarios_ticket
      (id, ticket_id, autor_id, contenido, es_interno, fecha_creacion)
      VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, ticketId, autorId, contenido, esInterno ? 1 : 0, ahora.toISOString());
  }

  obtenerComentarios(ticketId: string): ComentarioTicket[] {
    const rows = this.db.prepare(
      "SELECT * FROM comentarios_ticket WHERE ticket_id = ? ORDER BY fecha_creacion ASC"
    ).all(ticketId) as any[];

    return rows.map(row => ({
      id: row.id,
      ticketId: row.ticket_id,
      autorId: row.autor_id,
      contenido: row.contenido,
      esInterno: Boolean(row.es_interno),
      fechaCreacion: new Date(row.fecha_creacion),
    }));
  }

  crearArticulo(
    titulo: string,
    contenido: string,
    categoria: string,
    etiquetas?: string[]
  ): string {
    const id = randomUUID();
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO base_conocimiento
      (id, titulo, contenido, categoria, etiquetas, fecha_creacion, fecha_actualizacion)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      titulo,
      contenido,
      categoria,
      etiquetas ? JSON.stringify(etiquetas) : null,
      ahora.toISOString(),
      ahora.toISOString()
    );

    return id;
  }

  obtenerArticulo(id: string): ArticuloConocimiento | undefined {
    const row = this.db.prepare("SELECT * FROM base_conocimiento WHERE id = ?").get(id) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      titulo: row.titulo,
      contenido: row.contenido,
      categoría: row.categoria,
      etiquetas: row.etiquetas ? JSON.parse(row.etiquetas) : [],
      vistas: row.vistas,
      utilidad: row.utilidad,
      fechaCreacion: new Date(row.fecha_creacion),
      fechaActualizacion: new Date(row.fecha_actualizacion),
    };
  }

  incrementarVistas(articuloId: string): void {
    this.db.prepare(
      "UPDATE base_conocimiento SET vistas = vistas + 1 WHERE id = ?"
    ).run(articuloId);
  }

  registrarEscalada(
    ticketId: string,
    razon: string,
    nivelAnterior: string | undefined,
    nivelNuevo: string
  ): void {
    const id = randomUUID();
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO escaladas
      (id, ticket_id, razon, nivel_anterior, nivel_nuevo, fecha_escalada, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, ticketId, razon, nivelAnterior || null, nivelNuevo, ahora.toISOString(), ahora.toISOString());
  }

  obtenerEscaladas(ticketId: string): Escalada[] {
    const rows = this.db.prepare(
      "SELECT * FROM escaladas WHERE ticket_id = ? ORDER BY fecha_escalada ASC"
    ).all(ticketId) as any[];

    return rows.map(row => ({
      id: row.id,
      ticketId: row.ticket_id,
      razon: row.razon,
      nivelAnterior: row.nivel_anterior,
      nivelNuevo: row.nivel_nuevo,
      fechaEscalada: new Date(row.fecha_escalada),
    }));
  }

  crearEncuestaCSAT(ticketId: string, clienteId: string): string {
    const id = randomUUID();
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO csat_encuestas
      (id, ticket_id, cliente_id, estado, fecha_envio, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, ticketId, clienteId, "pendiente", ahora.toISOString(), ahora.toISOString());

    return id;
  }

  registrarRespuestaCSAT(
    encuestaId: string,
    ticketId: string,
    puntuacion: number,
    comentario: string
  ): void {
    const id = randomUUID();
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO csat_respuestas
      (id, encuesta_id, ticket_id, puntuacion, comentario, fecha_respuesta, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, encuestaId, ticketId, puntuacion, comentario, ahora.toISOString(), ahora.toISOString());

    this.db.prepare(
      "UPDATE csat_encuestas SET estado = ?, fecha_respuesta = ? WHERE id = ?"
    ).run("respondida", ahora.toISOString(), encuestaId);
  }

  obtenerRespuestasCSAT(ticketId: string): RespuestaCSAT[] {
    const rows = this.db.prepare(
      `SELECT r.* FROM csat_respuestas r
       WHERE r.ticket_id = ?
       ORDER BY r.fecha_respuesta ASC`
    ).all(ticketId) as any[];

    return rows.map(row => ({
      id: row.id,
      encuestaId: row.encuesta_id,
      ticketId: row.ticket_id,
      puntuacion: row.puntuacion,
      comentario: row.comentario || "",
      fechaRespuesta: new Date(row.fecha_respuesta),
    }));
  }

  obtenerTodosLosTickets(): Ticket[] {
    const rows = this.db.prepare(
      "SELECT * FROM tickets ORDER BY created_at DESC"
    ).all() as any[];

    return rows.map(row => this.rowATicket(row));
  }

  private rowATicket(row: any): Ticket {
    const fechaResolución = row.fecha_resolucion ? new Date(row.fecha_resolucion) : undefined;
    return {
      id: row.id,
      numero: row.numero,
      clienteId: row.cliente_id,
      titulo: row.titulo,
      descripcion: row.descripcion,
      tipo: row.tipo as TipoTicket,
      prioridad: row.prioridad as NivelPrioridad,
      estado: row.estado as EstadoTicket,
      agenteAsignadoId: row.agente_asignado_id,
      canalContacto: row.canal_contacto as CanalContacto,
      fechaCreacion: new Date(row.fecha_creacion),
      fechaVencimiento: new Date(row.fecha_vencimiento),
      fechaResolución,
      comentarios: this.obtenerComentarios(row.id),
      tags: row.tags ? JSON.parse(row.tags) : [],
    } as Ticket;
  }

  close(): void {
    this.db.close();
  }
}
