/**
 * Almacén SQLite para módulo de Disponibilidad: Recursos, reservas,
 * cancelaciones (append-only) y recordatorios.
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type { Recurso, Reserva, Cancelación } from "../policies/disponibilidad-motor.js";
import type { TipoRecurso, EstadoReserva } from "../policies/disponibilidad-motor.js";

export class SqliteDisponibilidadStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializarTablas();
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recursos (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        descripcion TEXT,
        capacidad INTEGER,
        ubicacion TEXT NOT NULL,
        disponible INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reservas (
        id TEXT PRIMARY KEY,
        recurso_id TEXT NOT NULL,
        cliente_id TEXT NOT NULL,
        titulo TEXT NOT NULL,
        fecha_inicio TEXT NOT NULL,
        fecha_fin TEXT NOT NULL,
        estado TEXT NOT NULL,
        descripcion TEXT,
        contacto TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (recurso_id) REFERENCES recursos(id)
      );

      CREATE TABLE IF NOT EXISTS cancelaciones (
        id TEXT PRIMARY KEY,
        reserva_id TEXT NOT NULL,
        razon TEXT NOT NULL,
        fecha_cancelacion TEXT NOT NULL,
        reembolso INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (reserva_id) REFERENCES reservas(id)
      );

      CREATE TABLE IF NOT EXISTS recordatorios (
        id TEXT PRIMARY KEY,
        reserva_id TEXT NOT NULL,
        tiempo_antes INTEGER NOT NULL,
        enviado INTEGER NOT NULL DEFAULT 0,
        fecha_envio TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (reserva_id) REFERENCES reservas(id)
      );

      CREATE INDEX IF NOT EXISTS idx_recursos_tipo ON recursos(tipo);
      CREATE INDEX IF NOT EXISTS idx_recursos_disponible ON recursos(disponible);
      CREATE INDEX IF NOT EXISTS idx_reservas_recurso ON reservas(recurso_id);
      CREATE INDEX IF NOT EXISTS idx_reservas_cliente ON reservas(cliente_id);
      CREATE INDEX IF NOT EXISTS idx_reservas_estado ON reservas(estado);
      CREATE INDEX IF NOT EXISTS idx_reservas_fecha ON reservas(fecha_inicio);
      CREATE INDEX IF NOT EXISTS idx_cancelaciones_reserva ON cancelaciones(reserva_id);
      CREATE INDEX IF NOT EXISTS idx_recordatorios_reserva ON recordatorios(reserva_id);
    `);
  }

  crearRecurso(
    nombre: string,
    tipo: TipoRecurso,
    descripcion: string,
    ubicacion: string,
    capacidad?: number
  ): string {
    const id = randomUUID();
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO recursos
      (id, nombre, tipo, descripcion, capacidad, ubicacion, disponible, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      nombre,
      tipo,
      descripcion,
      capacidad || null,
      ubicacion,
      1,
      ahora.toISOString()
    );

    return id;
  }

  obtenerRecurso(id: string): Recurso | undefined {
    const row = this.db.prepare("SELECT * FROM recursos WHERE id = ?").get(id) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      nombre: row.nombre,
      tipo: row.tipo as TipoRecurso,
      descripcion: row.descripcion,
      capacidad: row.capacidad,
      ubicación: row.ubicacion,
      disponible: Boolean(row.disponible),
    };
  }

  obtenerTodosLosRecursos(): Recurso[] {
    const rows = this.db.prepare("SELECT * FROM recursos ORDER BY created_at DESC").all() as any[];

    return rows.map(row => ({
      id: row.id,
      nombre: row.nombre,
      tipo: row.tipo as TipoRecurso,
      descripcion: row.descripcion,
      capacidad: row.capacidad,
      ubicación: row.ubicacion,
      disponible: Boolean(row.disponible),
    }));
  }

  crearReserva(
    recursoId: string,
    clienteId: string,
    titulo: string,
    fechaInicio: Date,
    fechaFin: Date,
    contacto: string,
    descripcion?: string
  ): string {
    const id = randomUUID();
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO reservas
      (id, recurso_id, cliente_id, titulo, fecha_inicio, fecha_fin, estado, descripcion, contacto, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      recursoId,
      clienteId,
      titulo,
      fechaInicio.toISOString(),
      fechaFin.toISOString(),
      "confirmada",
      descripcion || null,
      contacto,
      ahora.toISOString()
    );

    return id;
  }

  obtenerReserva(id: string): Reserva | undefined {
    const row = this.db.prepare("SELECT * FROM reservas WHERE id = ?").get(id) as any;
    if (!row) return undefined;

    return this.rowAReserva(row);
  }

  obtenerReservasRecurso(recursoId: string): Reserva[] {
    const rows = this.db.prepare(
      "SELECT * FROM reservas WHERE recurso_id = ? ORDER BY fecha_inicio"
    ).all(recursoId) as any[];

    return rows.map(row => this.rowAReserva(row));
  }

  obtenerTodasLasReservas(): Reserva[] {
    const rows = this.db.prepare(
      "SELECT * FROM reservas ORDER BY fecha_inicio DESC"
    ).all() as any[];

    return rows.map(row => this.rowAReserva(row));
  }

  actualizarEstadoReserva(id: string, nuevoEstado: EstadoReserva): void {
    this.db.prepare("UPDATE reservas SET estado = ? WHERE id = ?").run(
      nuevoEstado,
      id
    );
  }

  reprogramarReserva(
    id: string,
    nuevaFechaInicio: Date,
    nuevaFechaFin: Date
  ): void {
    this.db.prepare(
      "UPDATE reservas SET fecha_inicio = ?, fecha_fin = ? WHERE id = ?"
    ).run(
      nuevaFechaInicio.toISOString(),
      nuevaFechaFin.toISOString(),
      id
    );
  }

  registrarCancelación(
    reservaId: string,
    razon: string,
    reembolso: number
  ): void {
    const id = randomUUID();
    const ahora = new Date();

    // Registrar cancelación (append-only)
    this.db.prepare(
      `INSERT INTO cancelaciones
      (id, reserva_id, razon, fecha_cancelacion, reembolso, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, reservaId, razon, ahora.toISOString(), reembolso, ahora.toISOString());

    // Actualizar estado de reserva
    this.actualizarEstadoReserva(reservaId, "cancelada");
  }

  obtenerCancelaciones(recursoId?: string): Cancelación[] {
    let query = "SELECT c.* FROM cancelaciones c";
    let params: any[] = [];

    if (recursoId) {
      query += " JOIN reservas r ON c.reserva_id = r.id WHERE r.recurso_id = ?";
      params = [recursoId];
    }

    query += " ORDER BY c.fecha_cancelacion DESC";

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      reservaId: row.reserva_id,
      razon: row.razon,
      fechaCancelación: new Date(row.fecha_cancelacion),
      reembolso: row.reembolso,
    }));
  }

  crearRecordatorio(
    reservaId: string,
    minutosAntes: number
  ): void {
    const id = randomUUID();
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO recordatorios
      (id, reserva_id, tiempo_antes, created_at)
      VALUES (?, ?, ?, ?)`
    ).run(id, reservaId, minutosAntes, ahora.toISOString());
  }

  obtenerRecordatoriosPendientes(): Array<{
    id: string;
    reservaId: string;
    minutosAntes: number;
  }> {
    const rows = this.db.prepare(
      "SELECT id, reserva_id, tiempo_antes FROM recordatorios WHERE enviado = 0"
    ).all() as any[];

    return rows.map(row => ({
      id: row.id,
      reservaId: row.reserva_id,
      minutosAntes: row.tiempo_antes,
    }));
  }

  marcarRecordatorioEnviado(id: string): void {
    const ahora = new Date();
    this.db.prepare(
      "UPDATE recordatorios SET enviado = 1, fecha_envio = ? WHERE id = ?"
    ).run(ahora.toISOString(), id);
  }

  private rowAReserva(row: any): Reserva {
    return {
      id: row.id,
      recursoId: row.recurso_id,
      clienteId: row.cliente_id,
      titulo: row.titulo,
      fechaInicio: new Date(row.fecha_inicio),
      fechaFin: new Date(row.fecha_fin),
      estado: row.estado as EstadoReserva,
      descripcion: row.descripcion,
      contacto: row.contacto,
      createdAt: new Date(row.created_at),
    };
  }

  close(): void {
    this.db.close();
  }
}
