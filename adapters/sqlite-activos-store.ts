import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type {
  ActivoFijo,
  EstadoActivo,
  MantenimientoActivo,
  MetodoDepreciación,
  TipoActivo,
  ValorActivo,
} from '../elements/activo-fijo.js';

export class SqliteActivosStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializarTablas();
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activos_fijos (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        descripción TEXT,
        fecha_compra TEXT NOT NULL,
        costo_adquisición INTEGER NOT NULL,
        estado TEXT NOT NULL,
        ubicación TEXT NOT NULL,
        responsable TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS valores_activos (
        id TEXT PRIMARY KEY,
        activo_id TEXT NOT NULL,
        fecha TEXT NOT NULL,
        valor_libros INTEGER NOT NULL,
        depreciación INTEGER NOT NULL,
        método TEXT NOT NULL,
        vida_útil INTEGER NOT NULL,
        FOREIGN KEY (activo_id) REFERENCES activos_fijos(id)
      );

      CREATE TABLE IF NOT EXISTS mantenimiento_activos (
        id TEXT PRIMARY KEY,
        activo_id TEXT NOT NULL,
        fecha TEXT NOT NULL,
        tipo TEXT NOT NULL,
        costo INTEGER NOT NULL,
        descripción TEXT NOT NULL,
        próximo_mantenimiento TEXT,
        FOREIGN KEY (activo_id) REFERENCES activos_fijos(id)
      );

      CREATE TABLE IF NOT EXISTS asientos_depreciación (
        id TEXT PRIMARY KEY,
        activo_id TEXT NOT NULL,
        período TEXT NOT NULL,
        monto INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (activo_id) REFERENCES activos_fijos(id)
      );

      CREATE INDEX IF NOT EXISTS idx_activos_tipo ON activos_fijos(tipo);
      CREATE INDEX IF NOT EXISTS idx_activos_estado ON activos_fijos(estado);
      CREATE INDEX IF NOT EXISTS idx_valores_activo_id ON valores_activos(activo_id);
      CREATE INDEX IF NOT EXISTS idx_mantenimiento_activo_id ON mantenimiento_activos(activo_id);
    `);
  }

  crearActivo(
    nombre: string,
    tipo: TipoActivo,
    fechaCompra: Date,
    costoAdquisición: number,
    ubicación: string,
    responsable?: string
  ): ActivoFijo {
    const id = randomUUID();
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO activos_fijos
      (id, nombre, tipo, fecha_compra, costo_adquisición, estado, ubicación, responsable, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      nombre,
      tipo,
      fechaCompra.toISOString(),
      costoAdquisición,
      "activo",
      ubicación,
      responsable || null,
      ahora.toISOString()
    );

    const activo: ActivoFijo = {
      id,
      nombre,
      tipo,
      fechaCompra,
      costoAdquisición,
      valoresActuales: [],
      estado: "activo",
      ubicación,
      createdAt: ahora,
    };

    if (responsable) {
      (activo as any).responsable = responsable;
    }

    return activo;
  }

  obtenerActivo(id: string): ActivoFijo | undefined {
    const row = this.db
      .prepare("SELECT * FROM activos_fijos WHERE id = ?")
      .get(id) as any;

    if (!row) return undefined;

    const valores = this.obtenerValoresActivo(id);

    return {
      id: row.id,
      nombre: row.nombre,
      tipo: row.tipo,
      descripción: row.descripción,
      fechaCompra: new Date(row.fecha_compra),
      costoAdquisición: row.costo_adquisición,
      valoresActuales: valores,
      estado: row.estado,
      ubicación: row.ubicación,
      responsable: row.responsable,
      createdAt: new Date(row.created_at),
    };
  }

  listarActivos(): ActivoFijo[] {
    const rows = this.db
      .prepare("SELECT * FROM activos_fijos ORDER BY created_at DESC")
      .all() as any[];

    return rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      tipo: row.tipo,
      descripción: row.descripción,
      fechaCompra: new Date(row.fecha_compra),
      costoAdquisición: row.costo_adquisición,
      valoresActuales: this.obtenerValoresActivo(row.id),
      estado: row.estado,
      ubicación: row.ubicación,
      responsable: row.responsable,
      createdAt: new Date(row.created_at),
    }));
  }

  guardarValorActivo(activoId: string, valor: ValorActivo): void {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO valores_activos
        (id, activo_id, fecha, valor_libros, depreciación, método, vida_útil)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        activoId,
        valor.fecha.toISOString(),
        valor.valorLibros,
        valor.depreciación,
        valor.método,
        valor.vidaÚtil
      );
  }

  obtenerValoresActivo(activoId: string): ValorActivo[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM valores_activos WHERE activo_id = ? ORDER BY fecha ASC"
      )
      .all(activoId) as any[];

    return rows.map((row) => ({
      fecha: new Date(row.fecha),
      valorLibros: row.valor_libros,
      depreciación: row.depreciación,
      método: row.método as MetodoDepreciación,
      vidaÚtil: row.vida_útil,
    }));
  }

  registrarMantenimiento(
    activoId: string,
    tipo: "preventivo" | "correctivo",
    costo: number,
    descripción: string,
    próximoMantenimiento?: Date
  ): MantenimientoActivo {
    const id = randomUUID();
    const ahora = new Date();

    this.db
      .prepare(
        `INSERT INTO mantenimiento_activos
        (id, activo_id, fecha, tipo, costo, descripción, próximo_mantenimiento)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        activoId,
        ahora.toISOString(),
        tipo,
        costo,
        descripción,
        próximoMantenimiento?.toISOString() || null
      );

    return {
      id,
      activoId,
      fecha: ahora,
      tipo,
      costo,
      descripción,
      próximaMantenimiento: próximoMantenimiento,
    };
  }

  obtenerMantenimiento(activoId: string): MantenimientoActivo[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM mantenimiento_activos WHERE activo_id = ? ORDER BY fecha DESC"
      )
      .all(activoId) as any[];

    return rows.map((row) => ({
      id: row.id,
      activoId: row.activo_id,
      fecha: new Date(row.fecha),
      tipo: row.tipo,
      costo: row.costo,
      descripción: row.descripción,
      próximaMantenimiento: row.próximo_mantenimiento
        ? new Date(row.próximo_mantenimiento)
        : undefined,
    }));
  }

  cambiarEstado(activoId: string, nuevoEstado: EstadoActivo): void {
    this.db
      .prepare("UPDATE activos_fijos SET estado = ? WHERE id = ?")
      .run(nuevoEstado, activoId);
  }

  cerrarConexión(): void {
    this.db.close();
  }
}
