/**
 * Store SQLite para Estadísticas Fase 3
 * Almacena snapshots de KPIs, datos históricos, y alertas
 */

import Database from 'better-sqlite3';

export interface SnapshotKPI {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly fecha: string;
  readonly periodo: string;
  readonly kpi_id: string;
  readonly valor: number;
  readonly estado: string;
  readonly metadatos_json: string;
  readonly created_at: string;
}

export interface DatoHistorico {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly fecha: string;
  readonly metrica: string;
  readonly valor_numerico: number;
  readonly dimension_json: string;
  readonly created_at: string;
}

export interface AlertaKPI {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly kpi_id: string;
  readonly tipo: string;
  readonly umbral: number;
  readonly valor_actual: number;
  readonly accion: string;
  readonly fecha: string;
  readonly activa: boolean;
  readonly created_at: string;
}

export class SqliteEstadisticasStore {
  private readonly db: Database.Database;

  constructor(path: string | ':memory:' = ':memory:') {
    this.db = new Database(path);
    if (path !== ':memory:') this.db.pragma('journal_mode = WAL');

    // Crear tablas
    this.db.exec(`
      -- Snapshots de KPIs por período
      CREATE TABLE IF NOT EXISTS snapshots_kpi_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        fecha TEXT NOT NULL,
        periodo TEXT NOT NULL,
        kpi_id TEXT NOT NULL,
        valor REAL NOT NULL,
        estado TEXT NOT NULL,
        metadatos_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(tenant_id, periodo, kpi_id)
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_fase3_tenant_periodo
        ON snapshots_kpi_fase3(tenant_id, periodo);
      CREATE INDEX IF NOT EXISTS idx_snapshots_fase3_kpi_id
        ON snapshots_kpi_fase3(tenant_id, kpi_id);

      -- Datos históricos para análisis de tendencias
      CREATE TABLE IF NOT EXISTS datos_historicos_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        fecha TEXT NOT NULL,
        metrica TEXT NOT NULL,
        valor_numerico REAL NOT NULL,
        dimension_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_datos_historicos_fase3_tenant_fecha
        ON datos_historicos_fase3(tenant_id, fecha);
      CREATE INDEX IF NOT EXISTS idx_datos_historicos_fase3_metrica
        ON datos_historicos_fase3(tenant_id, metrica);

      -- Alertas activas
      CREATE TABLE IF NOT EXISTS alertas_kpi_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        kpi_id TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('warning', 'critical')),
        umbral REAL NOT NULL,
        valor_actual REAL NOT NULL,
        accion TEXT NOT NULL,
        fecha TEXT NOT NULL,
        activa BOOLEAN NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_alertas_fase3_tenant_activa
        ON alertas_kpi_fase3(tenant_id, activa);
      CREATE INDEX IF NOT EXISTS idx_alertas_fase3_kpi_id
        ON alertas_kpi_fase3(tenant_id, kpi_id);
    `);
  }

  /**
   * Guarda un snapshot de KPI
   */
  guardarSnapshot(
    tenantId: string,
    fecha: string,
    periodo: string,
    kpiId: string,
    valor: number,
    estado: string,
    metadatos: Record<string, unknown>,
  ): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO snapshots_kpi_fase3 (
        tenant_id, fecha, periodo, kpi_id, valor, estado, metadatos_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(tenantId, fecha, periodo, kpiId, valor, estado, JSON.stringify(metadatos), now);
  }

  /**
   * Obtiene snapshots de un período
   */
  obtenerSnapshotsPeriodo(tenantId: string, periodo: string): SnapshotKPI[] {
    return this.db
      .prepare(
        `SELECT * FROM snapshots_kpi_fase3
       WHERE tenant_id = ? AND periodo = ?
       ORDER BY kpi_id ASC`,
      )
      .all(tenantId, periodo) as SnapshotKPI[];
  }

  /**
   * Obtiene valores históricos de un KPI
   */
  obtenerHistoricoKPI(tenantId: string, kpiId: string, ultimosPeriodos: number = 12): SnapshotKPI[] {
    return this.db
      .prepare(
        `SELECT * FROM snapshots_kpi_fase3
       WHERE tenant_id = ? AND kpi_id = ?
       ORDER BY fecha DESC
       LIMIT ?`,
      )
      .all(tenantId, kpiId, ultimosPeriodos) as SnapshotKPI[];
  }

  /**
   * Registra datos históricos para análisis
   */
  guardarDatoHistorico(
    tenantId: string,
    fecha: string,
    metrica: string,
    valor: number,
    dimension?: Record<string, unknown>,
  ): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO datos_historicos_fase3 (
        tenant_id, fecha, metrica, valor_numerico, dimension_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(tenantId, fecha, metrica, valor, JSON.stringify(dimension || {}), now);
  }

  /**
   * Obtiene datos históricos de una métrica
   */
  obtenerDatosHistoricos(
    tenantId: string,
    metrica: string,
    desde: string,
    hasta: string,
  ): DatoHistorico[] {
    return this.db
      .prepare(
        `SELECT * FROM datos_historicos_fase3
       WHERE tenant_id = ? AND metrica = ? AND fecha BETWEEN ? AND ?
       ORDER BY fecha ASC`,
      )
      .all(tenantId, metrica, desde, hasta) as DatoHistorico[];
  }

  /**
   * Registra una alerta de KPI
   */
  guardarAlerta(
    tenantId: string,
    kpiId: string,
    tipo: 'warning' | 'critical',
    umbral: number,
    valorActual: number,
    accion: string,
    fecha: string,
  ): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO alertas_kpi_fase3 (
        tenant_id, kpi_id, tipo, umbral, valor_actual, accion, fecha, activa, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(tenantId, kpiId, tipo, umbral, valorActual, accion, fecha, true, now);
  }

  /**
   * Obtiene alertas activas
   */
  obtenerAlertasActivas(tenantId: string): AlertaKPI[] {
    return this.db
      .prepare(
        `SELECT * FROM alertas_kpi_fase3
       WHERE tenant_id = ? AND activa = 1
       ORDER BY created_at DESC`,
      )
      .all(tenantId) as AlertaKPI[];
  }

  /**
   * Desactiva una alerta
   */
  desactivarAlerta(seq: number): void {
    this.db
      .prepare(`UPDATE alertas_kpi_fase3 SET activa = 0 WHERE seq = ?`)
      .run(seq);
  }

  /**
   * Obtiene estadísticas agregadas de un período
   */
  obtenerEstadisticasPeriodo(
    tenantId: string,
    periodo: string,
  ): { promedioKPIs: number; totalAlertas: number } {
    const snapshots = this.obtenerSnapshotsPeriodo(tenantId, periodo);
    const promedioKPIs =
      snapshots.length > 0
        ? snapshots.reduce((sum, s) => sum + s.valor, 0) / snapshots.length
        : 0;

    const alertas = this.db
      .prepare(
        `SELECT COUNT(*) as total FROM alertas_kpi_fase3
       WHERE tenant_id = ? AND fecha = ? AND activa = 1`,
      )
      .get(tenantId, periodo) as { total: number };

    return {
      promedioKPIs,
      totalAlertas: alertas?.total ?? 0,
    };
  }

  /**
   * Obtiene tendencia de una métrica
   */
  obtenerTendencia(
    tenantId: string,
    metrica: string,
    ultimosPeriodos: number = 6,
  ): Array<{ fecha: string; valor: number }> {
    const resultados = this.db
      .prepare(
        `SELECT fecha, valor_numerico as valor FROM datos_historicos_fase3
       WHERE tenant_id = ? AND metrica = ?
       ORDER BY fecha DESC
       LIMIT ?`,
      )
      .all(tenantId, metrica, ultimosPeriodos) as Array<{ fecha: string; valor: number }>;

    return resultados.reverse();
  }

  close(): void {
    this.db.close();
  }
}
