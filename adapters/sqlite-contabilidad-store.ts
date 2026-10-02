/**
 * Store SQLite para Contabilidad Fase 3
 * Almacén append-only de asientos, cuentas, y períodos cerrados
 */

import Database from 'better-sqlite3';

export interface AsientoContable {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly fecha: string;
  readonly numero_asiento: string;
  readonly cuenta_deudora: string;
  readonly cuenta_acreedora: string;
  readonly importe_centimos: number;
  readonly concepto: string;
  readonly referencia: string;
  readonly evento_origen: string;
  readonly created_at: string;
}

export interface CuentaMayor {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly tipo: string;
  readonly saldo_inicial: number;
  readonly saldo_deudor: number;
  readonly created_at: string;
}

export interface CierrePeriodo {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly periodo: string;
  readonly fecha_cierre: string;
  readonly total_debe: number;
  readonly total_haber: number;
  readonly diferencia: number;
  readonly cuadrado: boolean;
  readonly estado: 'abierto' | 'cerrado';
  readonly created_at: string;
}

export interface EventoContable {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly fecha: string;
  readonly tipo_evento: string;
  readonly descripcion: string;
  readonly referencia: string;
  readonly datos_json: string;
  readonly created_at: string;
}

export class SqliteContabilidadStore {
  private readonly db: Database.Database;
  private asientoCounter: number = 0;

  constructor(path: string | ':memory:' = ':memory:') {
    this.db = new Database(path);
    if (path !== ':memory:') this.db.pragma('journal_mode = WAL');

    // Crear tablas
    this.db.exec(`
      -- Tabla de asientos contables (append-only)
      CREATE TABLE IF NOT EXISTS asientos_contables_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        fecha TEXT NOT NULL,
        numero_asiento TEXT NOT NULL UNIQUE,
        cuenta_deudora TEXT NOT NULL,
        cuenta_acreedora TEXT NOT NULL,
        importe_centimos INTEGER NOT NULL CHECK (importe_centimos > 0),
        concepto TEXT NOT NULL,
        referencia TEXT NOT NULL,
        evento_origen TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_asientos_fase3_tenant_fecha
        ON asientos_contables_fase3(tenant_id, fecha);
      CREATE INDEX IF NOT EXISTS idx_asientos_fase3_cuenta_deudora
        ON asientos_contables_fase3(tenant_id, cuenta_deudora);
      CREATE INDEX IF NOT EXISTS idx_asientos_fase3_cuenta_acreedora
        ON asientos_contables_fase3(tenant_id, cuenta_acreedora);
      CREATE INDEX IF NOT EXISTS idx_asientos_fase3_referencia
        ON asientos_contables_fase3(tenant_id, referencia);

      -- Trigger para prevenir actualizaciones
      CREATE TRIGGER IF NOT EXISTS asientos_fase3_no_update
        BEFORE UPDATE ON asientos_contables_fase3
      BEGIN
        SELECT RAISE(ABORT, 'Los asientos no se modifican: registre un asiento de reverso');
      END;

      CREATE TRIGGER IF NOT EXISTS asientos_fase3_no_delete
        BEFORE DELETE ON asientos_contables_fase3
      BEGIN
        SELECT RAISE(ABORT, 'Los asientos no se borran: registre un asiento de reverso');
      END;

      -- Plan de cuentas
      CREATE TABLE IF NOT EXISTS cuentas_mayor_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        codigo TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        saldo_inicial INTEGER NOT NULL DEFAULT 0,
        saldo_deudor INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cuentas_fase3_tenant
        ON cuentas_mayor_fase3(tenant_id, codigo);

      -- Cierres de período
      CREATE TABLE IF NOT EXISTS cierre_periodos_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        periodo TEXT NOT NULL,
        fecha_cierre TEXT NOT NULL,
        total_debe INTEGER NOT NULL,
        total_haber INTEGER NOT NULL,
        diferencia INTEGER NOT NULL,
        cuadrado BOOLEAN NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('abierto', 'cerrado')),
        created_at TEXT NOT NULL,
        UNIQUE(tenant_id, periodo)
      );

      CREATE INDEX IF NOT EXISTS idx_cierre_fase3_tenant
        ON cierre_periodos_fase3(tenant_id, periodo);

      -- Eventos contables (auditoría)
      CREATE TABLE IF NOT EXISTS eventos_contables_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        fecha TEXT NOT NULL,
        tipo_evento TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        referencia TEXT NOT NULL,
        datos_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_eventos_fase3_tenant_fecha
        ON eventos_contables_fase3(tenant_id, fecha);
    `);

    this.inicializarContador();
  }

  private inicializarContador(): void {
    const row = this.db
      .prepare(
        `
      SELECT MAX(CAST(SUBSTR(numero_asiento, INSTR(numero_asiento, '-') + 1) AS INTEGER)) as max_num
      FROM asientos_contables_fase3
      WHERE numero_asiento LIKE '%-\d+' ESCAPE '\'
    `,
      )
      .get() as { max_num: number | null } | undefined;
    this.asientoCounter = (row?.max_num ?? 0) + 1;
  }

  /**
   * Registra un asiento contable (append-only)
   */
  registrarAsiento(tenantId: string, asiento: Omit<AsientoContable, 'seq' | 'tenant_id' | 'numero_asiento' | 'created_at'>): string {
    const numeroAsiento = `${tenantId}-${this.asientoCounter++}`;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO asientos_contables_fase3 (
        tenant_id, fecha, numero_asiento, cuenta_deudora, cuenta_acreedora,
        importe_centimos, concepto, referencia, evento_origen, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        asiento.fecha,
        numeroAsiento,
        asiento.cuenta_deudora,
        asiento.cuenta_acreedora,
        asiento.importe_centimos,
        asiento.concepto,
        asiento.referencia,
        asiento.evento_origen,
        now,
      );

    return numeroAsiento;
  }

  /**
   * Obtiene todos los asientos de un período
   */
  obtenerAsientosPeriodo(tenantId: string, desde: string, hasta: string): AsientoContable[] {
    return this.db
      .prepare(
        `SELECT * FROM asientos_contables_fase3
       WHERE tenant_id = ? AND fecha BETWEEN ? AND ?
       ORDER BY fecha, seq ASC`,
      )
      .all(tenantId, desde, hasta) as AsientoContable[];
  }

  /**
   * Obtiene el saldo de una cuenta en una fecha
   */
  obtenerSaldoCuenta(tenantId: string, cuenta: string, hastaFecha: string): number {
    const resultado = this.db
      .prepare(
        `
      SELECT
        COALESCE(SUM(CASE WHEN cuenta_deudora = ? THEN importe_centimos ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN cuenta_acreedora = ? THEN importe_centimos ELSE 0 END), 0) as saldo
      FROM asientos_contables_fase3
      WHERE tenant_id = ? AND fecha <= ?
    `,
      )
      .get(cuenta, cuenta, tenantId, hastaFecha) as { saldo: number };

    return resultado?.saldo ?? 0;
  }

  /**
   * Registra una cuenta en el plan de cuentas
   */
  registrarCuenta(tenantId: string, codigo: string, nombre: string, tipo: string): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT OR IGNORE INTO cuentas_mayor_fase3 (
        tenant_id, codigo, nombre, tipo, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(tenantId, codigo, nombre, tipo, now);
  }

  /**
   * Obtiene todas las cuentas del plan
   */
  obtenerCuentas(tenantId: string): CuentaMayor[] {
    return this.db
      .prepare(`SELECT * FROM cuentas_mayor_fase3 WHERE tenant_id = ? ORDER BY codigo`)
      .all(tenantId) as CuentaMayor[];
  }

  /**
   * Cierra un período
   */
  cerrarPeriodo(tenantId: string, periodo: string, totalDebe: number, totalHaber: number): CierrePeriodo {
    const diferencia = totalDebe - totalHaber;
    const cuadrado = diferencia === 0;
    const now = new Date().toISOString();
    const fechaCierre = new Date().toISOString().split('T')[0];

    this.db
      .prepare(
        `INSERT INTO cierre_periodos_fase3 (
        tenant_id, periodo, fecha_cierre, total_debe, total_haber, diferencia, cuadrado, estado, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        periodo,
        fechaCierre,
        totalDebe,
        totalHaber,
        diferencia,
        cuadrado ? 1 : 0,
        'cerrado',
        now,
      );

    const periodo_obj: CierrePeriodo = {
      seq: undefined,
      tenant_id: tenantId,
      periodo,
      fecha_cierre: fechaCierre as string,
      total_debe: totalDebe,
      total_haber: totalHaber,
      diferencia,
      cuadrado,
      estado: 'cerrado',
      created_at: now,
    };
    return periodo_obj;
  }

  /**
   * Verifica si un período está cerrado
   */
  periodoCerrado(tenantId: string, periodo: string): boolean {
    const resultado = this.db
      .prepare(`SELECT estado FROM cierre_periodos_fase3 WHERE tenant_id = ? AND periodo = ?`)
      .get(tenantId, periodo) as { estado: string } | undefined;

    return resultado?.estado === 'cerrado';
  }

  /**
   * Registra un evento contable (auditoría)
   */
  registrarEvento(
    tenantId: string,
    tipoEvento: string,
    descripcion: string,
    referencia: string,
    datos: Record<string, unknown>,
  ): void {
    const now = new Date().toISOString();
    const fecha = now.split('T')[0];

    this.db
      .prepare(
        `INSERT INTO eventos_contables_fase3 (
        tenant_id, fecha, tipo_evento, descripcion, referencia, datos_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        fecha,
        tipoEvento,
        descripcion,
        referencia,
        JSON.stringify(datos),
        now,
      );
  }

  /**
   * Obtiene el total de débitos y créditos en un período
   */
  obtenerTotalesPeriodo(tenantId: string, periodo: string): { debe: number; haber: number } {
    const [año, mes] = periodo.split('-').map(Number);
    const mesStr = String(mes).padStart(2, '0');
    const filtroFecha = `${año}-${mesStr}`;

    const resultado = this.db
      .prepare(
        `
      SELECT
        SUM(importe_centimos) as debe,
        SUM(importe_centimos) as haber
      FROM asientos_contables_fase3
      WHERE tenant_id = ? AND fecha LIKE ?
    `,
      )
      .get(tenantId, `${filtroFecha}%`) as { debe: number; haber: number };

    return {
      debe: resultado?.debe ?? 0,
      haber: resultado?.haber ?? 0,
    };
  }

  close(): void {
    this.db.close();
  }
}
