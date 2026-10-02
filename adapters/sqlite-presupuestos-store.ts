import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type {
  Presupuesto,
  PartidaPresupuestaria,
} from "../policies/presupuestos-motor.js";

export interface Gasto {
  readonly id: string;
  readonly partida_id: string;
  readonly monto: number;
  readonly fecha: Date;
  readonly concepto: string;
}

export class SqlitePresupuestosStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializarTablas();
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS presupuestos (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        año INTEGER NOT NULL,
        departamento TEXT,
        estado TEXT NOT NULL,
        presupuesto_total REAL DEFAULT 0,
        gasto_real REAL DEFAULT 0,
        fecha_creación TEXT NOT NULL,
        aprobado_por TEXT
      );

      CREATE TABLE IF NOT EXISTS partidas_presupuestarias (
        id TEXT PRIMARY KEY,
        presupuesto_id TEXT NOT NULL,
        concepto TEXT NOT NULL,
        tipo TEXT NOT NULL,
        presupuestado REAL NOT NULL,
        gastado REAL DEFAULT 0,
        fecha_creación TEXT NOT NULL,
        FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id)
      );

      CREATE TABLE IF NOT EXISTS gastos_registrados (
        id TEXT PRIMARY KEY,
        partida_id TEXT NOT NULL,
        monto REAL NOT NULL,
        concepto TEXT,
        fecha TEXT NOT NULL,
        fecha_registro TEXT NOT NULL,
        FOREIGN KEY (partida_id) REFERENCES partidas_presupuestarias(id)
      );

      CREATE TABLE IF NOT EXISTS escenarios_presupuesto (
        id TEXT PRIMARY KEY,
        presupuesto_id TEXT NOT NULL,
        nombre TEXT NOT NULL,
        presupuesto_ajustado REAL NOT NULL,
        varianza_esperada REAL NOT NULL,
        fecha_creación TEXT NOT NULL,
        FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id)
      );

      CREATE TABLE IF NOT EXISTS aprobaciones (
        id TEXT PRIMARY KEY,
        presupuesto_id TEXT NOT NULL,
        aprobado_por TEXT NOT NULL,
        fecha_aprobación TEXT NOT NULL,
        comentarios TEXT,
        FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id)
      );

      CREATE INDEX IF NOT EXISTS idx_presupuestos_año ON presupuestos(año);
      CREATE INDEX IF NOT EXISTS idx_presupuestos_departamento ON presupuestos(departamento);
      CREATE INDEX IF NOT EXISTS idx_presupuestos_estado ON presupuestos(estado);
      CREATE INDEX IF NOT EXISTS idx_partidas_presupuesto ON partidas_presupuestarias(presupuesto_id);
      CREATE INDEX IF NOT EXISTS idx_gastos_partida ON gastos_registrados(partida_id);
      CREATE INDEX IF NOT EXISTS idx_escenarios_presupuesto ON escenarios_presupuesto(presupuesto_id);
    `);
  }

  guardarPresupuesto(presupuesto: Presupuesto): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO presupuestos
      (id, nombre, año, departamento, estado, presupuesto_total, gasto_real, fecha_creación, aprobado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      presupuesto.id,
      presupuesto.nombre,
      presupuesto.año,
      presupuesto.departamento ?? null,
      presupuesto.estado,
      presupuesto.presupuesto_total,
      presupuesto.gasto_real,
      presupuesto.fecha_creación.toISOString(),
      presupuesto.aprobado_por ?? null
    );

    // Guardar partidas
    for (const partida of presupuesto.partidas) {
      this.guardarPartida(partida);
    }
  }

  obtenerPresupuesto(id: string): Presupuesto | undefined {
    const stmt = this.db.prepare("SELECT * FROM presupuestos WHERE id = ?");
    const row = stmt.get(id) as any;

    if (!row) return undefined;

    const stmtPartidas = this.db.prepare(
      "SELECT * FROM partidas_presupuestarias WHERE presupuesto_id = ?"
    );
    const partidas = stmtPartidas.all(id) as any[];

    return {
      id: row.id,
      nombre: row.nombre,
      año: row.año,
      departamento: row.departamento,
      estado: row.estado,
      presupuesto_total: row.presupuesto_total,
      gasto_real: row.gasto_real,
      fecha_creación: new Date(row.fecha_creación),
      aprobado_por: row.aprobado_por,
      partidas: partidas.map((p) => ({
        id: p.id,
        presupuesto_id: p.presupuesto_id,
        concepto: p.concepto,
        tipo: p.tipo,
        presupuestado: p.presupuestado,
        gastado: p.gastado,
        porcentaje_gastado: p.presupuestado > 0 ? (p.gastado / p.presupuestado) * 100 : 0,
        varianza: p.presupuestado - p.gastado,
      })),
    };
  }

  listarPresupuestos(año?: number, departamento?: string): Presupuesto[] {
    let stmt;
    let params: any[] = [];

    if (año && departamento) {
      stmt = this.db.prepare(
        "SELECT * FROM presupuestos WHERE año = ? AND departamento = ? ORDER BY fecha_creación DESC"
      );
      params = [año, departamento];
    } else if (año) {
      stmt = this.db.prepare(
        "SELECT * FROM presupuestos WHERE año = ? ORDER BY fecha_creación DESC"
      );
      params = [año];
    } else if (departamento) {
      stmt = this.db.prepare(
        "SELECT * FROM presupuestos WHERE departamento = ? ORDER BY fecha_creación DESC"
      );
      params = [departamento];
    } else {
      stmt = this.db.prepare(
        "SELECT * FROM presupuestos ORDER BY fecha_creación DESC"
      );
    }

    const rows = params.length > 0 ? (stmt.all(...params) as any[]) : (stmt.all() as any[]);

    return rows.map((row) => {
      const stmtPartidas = this.db.prepare(
        "SELECT * FROM partidas_presupuestarias WHERE presupuesto_id = ?"
      );
      const partidas = stmtPartidas.all(row.id) as any[];

      return {
        id: row.id,
        nombre: row.nombre,
        año: row.año,
        departamento: row.departamento,
        estado: row.estado,
        presupuesto_total: row.presupuesto_total,
        gasto_real: row.gasto_real,
        fecha_creación: new Date(row.fecha_creación),
        aprobado_por: row.aprobado_por,
        partidas: partidas.map((p) => ({
          id: p.id,
          presupuesto_id: p.presupuesto_id,
          concepto: p.concepto,
          tipo: p.tipo,
          presupuestado: p.presupuestado,
          gastado: p.gastado,
          porcentaje_gastado: p.presupuestado > 0 ? (p.gastado / p.presupuestado) * 100 : 0,
          varianza: p.presupuestado - p.gastado,
        })),
      };
    });
  }

  private guardarPartida(partida: PartidaPresupuestaria): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO partidas_presupuestarias
      (id, presupuesto_id, concepto, tipo, presupuestado, gastado, fecha_creación)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      partida.id,
      partida.presupuesto_id,
      partida.concepto,
      partida.tipo,
      partida.presupuestado,
      partida.gastado,
      new Date().toISOString()
    );
  }

  registrarGasto(
    partida_id: string,
    monto: number,
    concepto?: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO gastos_registrados
      (id, partida_id, monto, concepto, fecha, fecha_registro)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      randomUUID(),
      partida_id,
      monto,
      concepto ?? null,
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Actualizar gastado en la partida
    const stmtUpdate = this.db.prepare(`
      UPDATE partidas_presupuestarias
      SET gastado = (
        SELECT SUM(monto) FROM gastos_registrados WHERE partida_id = ?
      )
      WHERE id = ?
    `);
    stmtUpdate.run(partida_id, partida_id);
  }

  obtenerGastos(partida_id: string): Gasto[] {
    const stmt = this.db.prepare(
      "SELECT * FROM gastos_registrados WHERE partida_id = ? ORDER BY fecha DESC"
    );
    const rows = stmt.all(partida_id) as any[];

    return rows.map((row) => ({
      id: row.id,
      partida_id: row.partida_id,
      monto: row.monto,
      fecha: new Date(row.fecha),
      concepto: row.concepto,
    }));
  }

  guardarEscenario(
    presupuesto_id: string,
    nombre: string,
    presupuesto_ajustado: number,
    varianza_esperada: number
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO escenarios_presupuesto
      (id, presupuesto_id, nombre, presupuesto_ajustado, varianza_esperada, fecha_creación)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      randomUUID(),
      presupuesto_id,
      nombre,
      presupuesto_ajustado,
      varianza_esperada,
      new Date().toISOString()
    );
  }

  obtenerEscenarios(presupuesto_id: string) {
    const stmt = this.db.prepare(
      "SELECT * FROM escenarios_presupuesto WHERE presupuesto_id = ? ORDER BY fecha_creación DESC"
    );
    const rows = stmt.all(presupuesto_id) as any[];

    return rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      presupuesto_ajustado: row.presupuesto_ajustado,
      varianza_esperada: row.varianza_esperada,
    }));
  }

  close(): void {
    this.db.close();
  }
}
