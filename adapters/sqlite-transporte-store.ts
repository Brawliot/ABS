/**
 * Store SQLite para Transporte Fase 3
 * Almacena rutas, entregas, tracking GPS, tarifas
 */

import Database from 'better-sqlite3';

export interface RutaRegistro {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly ruta_id: string;
  readonly fecha: string;
  readonly zona: string;
  readonly estado: string;
  readonly distancia_km: number;
  readonly tiempo_estimado_horas: number;
  readonly peso_total_kg: number;
  readonly volumen_total_m3: number;
  readonly created_at: string;
}

export interface ParadaRegistro {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly ruta_id: string;
  readonly parada_num: number;
  readonly cliente_id: string;
  readonly latitud: number;
  readonly longitud: number;
  readonly ventana_inicio: string;
  readonly ventana_fin: string;
  readonly created_at: string;
}

export interface EntregaCompletada {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly ruta_id: string;
  readonly parada_id: string;
  readonly fecha_entrega: string;
  readonly hora_entrega: string;
  readonly firma_cliente: string;
  readonly observaciones: string;
  readonly created_at: string;
}

export interface TarifaTransporte {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly proveedor_id: string;
  readonly zona: string;
  readonly costo_base_centimos: number;
  readonly costo_por_km_centimos: number;
  readonly costo_por_kg_centimos: number;
  readonly created_at: string;
}

export interface TrackingGPS {
  readonly seq?: number;
  readonly tenant_id: string;
  readonly ruta_id: string;
  readonly vehiculo_id: string;
  readonly latitud: number;
  readonly longitud: number;
  readonly timestamp: string;
  readonly velocidad_kmh: number;
  readonly created_at: string;
}

export class SqliteTransporteStore {
  private readonly db: Database.Database;

  constructor(path: string | ':memory:' = ':memory:') {
    this.db = new Database(path);
    if (path !== ':memory:') this.db.pragma('journal_mode = WAL');

    // Crear tablas
    this.db.exec(`
      -- Rutas planeadas
      CREATE TABLE IF NOT EXISTS rutas_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        ruta_id TEXT NOT NULL UNIQUE,
        fecha TEXT NOT NULL,
        zona TEXT NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('planificada', 'en_curso', 'completada', 'cancelada')),
        distancia_km REAL NOT NULL,
        tiempo_estimado_horas REAL NOT NULL,
        peso_total_kg REAL NOT NULL,
        volumen_total_m3 REAL NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_rutas_fase3_tenant_fecha
        ON rutas_fase3(tenant_id, fecha);
      CREATE INDEX IF NOT EXISTS idx_rutas_fase3_zona
        ON rutas_fase3(tenant_id, zona);

      -- Paradas de cada ruta
      CREATE TABLE IF NOT EXISTS paradas_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        ruta_id TEXT NOT NULL,
        parada_num INTEGER NOT NULL,
        cliente_id TEXT NOT NULL,
        latitud REAL NOT NULL,
        longitud REAL NOT NULL,
        ventana_inicio TEXT NOT NULL,
        ventana_fin TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (ruta_id) REFERENCES rutas_fase3(ruta_id)
      );

      CREATE INDEX IF NOT EXISTS idx_paradas_fase3_ruta
        ON paradas_fase3(tenant_id, ruta_id);

      -- Entregas completadas
      CREATE TABLE IF NOT EXISTS entregas_completadas_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        ruta_id TEXT NOT NULL,
        parada_id TEXT NOT NULL,
        fecha_entrega TEXT NOT NULL,
        hora_entrega TEXT NOT NULL,
        firma_cliente TEXT NOT NULL,
        observaciones TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(tenant_id, parada_id)
      );

      CREATE INDEX IF NOT EXISTS idx_entregas_fase3_ruta
        ON entregas_completadas_fase3(tenant_id, ruta_id);
      CREATE INDEX IF NOT EXISTS idx_entregas_fase3_fecha
        ON entregas_completadas_fase3(tenant_id, fecha_entrega);

      -- Tarifas de proveedores
      CREATE TABLE IF NOT EXISTS tarifas_transporte_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        proveedor_id TEXT NOT NULL,
        zona TEXT NOT NULL,
        costo_base_centimos INTEGER NOT NULL,
        costo_por_km_centimos INTEGER NOT NULL,
        costo_por_kg_centimos INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(tenant_id, proveedor_id, zona)
      );

      CREATE INDEX IF NOT EXISTS idx_tarifas_fase3_zona
        ON tarifas_transporte_fase3(tenant_id, zona);

      -- Tracking GPS en tiempo real
      CREATE TABLE IF NOT EXISTS tracking_gps_fase3 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        ruta_id TEXT NOT NULL,
        vehiculo_id TEXT NOT NULL,
        latitud REAL NOT NULL,
        longitud REAL NOT NULL,
        timestamp TEXT NOT NULL,
        velocidad_kmh REAL NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tracking_fase3_ruta
        ON tracking_gps_fase3(tenant_id, ruta_id);
      CREATE INDEX IF NOT EXISTS idx_tracking_fase3_timestamp
        ON tracking_gps_fase3(tenant_id, timestamp);
    `);
  }

  /**
   * Guarda una ruta
   */
  guardarRuta(
    tenantId: string,
    rutaId: string,
    fecha: string,
    zona: string,
    distanciaKm: number,
    tiempoEstimadoHoras: number,
    pesoTotalKg: number,
    volumenTotalM3: number,
  ): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO rutas_fase3 (
        tenant_id, ruta_id, fecha, zona, estado,
        distancia_km, tiempo_estimado_horas, peso_total_kg, volumen_total_m3, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        rutaId,
        fecha,
        zona,
        'planificada',
        distanciaKm,
        tiempoEstimadoHoras,
        pesoTotalKg,
        volumenTotalM3,
        now,
      );
  }

  /**
   * Obtiene rutas de un día
   */
  obtenerRutasDia(tenantId: string, fecha: string): RutaRegistro[] {
    return this.db
      .prepare(
        `SELECT * FROM rutas_fase3
       WHERE tenant_id = ? AND fecha = ?
       ORDER BY zona, seq ASC`,
      )
      .all(tenantId, fecha) as RutaRegistro[];
  }

  /**
   * Actualiza estado de una ruta
   */
  actualizarEstadoRuta(
    tenantId: string,
    rutaId: string,
    nuevoEstado: string,
  ): void {
    this.db
      .prepare(
        `UPDATE rutas_fase3 SET estado = ? WHERE tenant_id = ? AND ruta_id = ?`,
      )
      .run(nuevoEstado, tenantId, rutaId);
  }

  /**
   * Registra una parada en una ruta
   */
  registrarParada(
    tenantId: string,
    rutaId: string,
    paradaNum: number,
    clienteId: string,
    latitud: number,
    longitud: number,
    ventanaInicio: string,
    ventanaFin: string,
  ): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO paradas_fase3 (
        tenant_id, ruta_id, parada_num, cliente_id,
        latitud, longitud, ventana_inicio, ventana_fin, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        rutaId,
        paradaNum,
        clienteId,
        latitud,
        longitud,
        ventanaInicio,
        ventanaFin,
        now,
      );
  }

  /**
   * Obtiene paradas de una ruta
   */
  obtenerParadas(tenantId: string, rutaId: string): ParadaRegistro[] {
    return this.db
      .prepare(
        `SELECT * FROM paradas_fase3
       WHERE tenant_id = ? AND ruta_id = ?
       ORDER BY parada_num ASC`,
      )
      .all(tenantId, rutaId) as ParadaRegistro[];
  }

  /**
   * Registra una entrega completada
   */
  registrarEntrega(
    tenantId: string,
    rutaId: string,
    paradaId: string,
    fechaEntrega: string,
    horaEntrega: string,
    firmaCliente: string,
    observaciones?: string,
  ): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO entregas_completadas_fase3 (
        tenant_id, ruta_id, parada_id, fecha_entrega, hora_entrega,
        firma_cliente, observaciones, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        rutaId,
        paradaId,
        fechaEntrega,
        horaEntrega,
        firmaCliente,
        observaciones || '',
        now,
      );
  }

  /**
   * Obtiene entregas completadas de una ruta
   */
  obtenerEntregasRuta(tenantId: string, rutaId: string): EntregaCompletada[] {
    return this.db
      .prepare(
        `SELECT * FROM entregas_completadas_fase3
       WHERE tenant_id = ? AND ruta_id = ?
       ORDER BY created_at ASC`,
      )
      .all(tenantId, rutaId) as EntregaCompletada[];
  }

  /**
   * Registra tarifa de un proveedor
   */
  registrarTarifa(
    tenantId: string,
    proveedorId: string,
    zona: string,
    costoBaseCentimos: number,
    costoPorKmCentimos: number,
    costoPorKgCentimos: number,
  ): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO tarifas_transporte_fase3 (
        tenant_id, proveedor_id, zona,
        costo_base_centimos, costo_por_km_centimos, costo_por_kg_centimos, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        proveedorId,
        zona,
        costoBaseCentimos,
        costoPorKmCentimos,
        costoPorKgCentimos,
        now,
      );
  }

  /**
   * Obtiene tarifas para una zona
   */
  obtenerTarifasZona(tenantId: string, zona: string): TarifaTransporte[] {
    return this.db
      .prepare(
        `SELECT * FROM tarifas_transporte_fase3
       WHERE tenant_id = ? AND zona = ?
       ORDER BY costo_base_centimos ASC`,
      )
      .all(tenantId, zona) as TarifaTransporte[];
  }

  /**
   * Registra punto GPS
   */
  registrarGPS(
    tenantId: string,
    rutaId: string,
    vehiculoId: string,
    latitud: number,
    longitud: number,
    velocidadKmh: number,
  ): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO tracking_gps_fase3 (
        tenant_id, ruta_id, vehiculo_id, latitud, longitud,
        timestamp, velocidad_kmh, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        rutaId,
        vehiculoId,
        latitud,
        longitud,
        now,
        velocidadKmh,
        now,
      );
  }

  /**
   * Obtiene tracking de una ruta
   */
  obtenerTrackingRuta(tenantId: string, rutaId: string): TrackingGPS[] {
    return this.db
      .prepare(
        `SELECT * FROM tracking_gps_fase3
       WHERE tenant_id = ? AND ruta_id = ?
       ORDER BY timestamp DESC
       LIMIT 100`,
      )
      .all(tenantId, rutaId) as TrackingGPS[];
  }

  /**
   * Obtiene última posición de una ruta
   */
  obtenerUltimaPosicion(tenantId: string, rutaId: string): TrackingGPS | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM tracking_gps_fase3
         WHERE tenant_id = ? AND ruta_id = ?
         ORDER BY timestamp DESC
         LIMIT 1`,
        )
        .get(tenantId, rutaId) as TrackingGPS | undefined) || null
    );
  }

  /**
   * Obtiene estadísticas de entregas completadas
   */
  obtenerEstadisticasEntregas(tenantId: string, fecha: string): {
    total_entregas: number;
    completadas: number;
    pendientes: number;
    tasa_exito_pct: number;
  } {
    const resultado = this.db
      .prepare(
        `
      SELECT
        COUNT(DISTINCT r.ruta_id) as total_rutas,
        COUNT(DISTINCT ec.parada_id) as entregas_completadas
      FROM rutas_fase3 r
      LEFT JOIN entregas_completadas_fase3 ec ON r.ruta_id = ec.ruta_id
      WHERE r.tenant_id = ? AND r.fecha = ?
    `,
      )
      .get(tenantId, fecha) as {
        total_rutas: number;
        entregas_completadas: number;
      };

    const totalEntregas = resultado.total_rutas * 5; // Asumir promedio 5 paradas por ruta
    const completadas = resultado.entregas_completadas;
    const pendientes = totalEntregas - completadas;
    const tasaExito =
      totalEntregas > 0 ? (completadas / totalEntregas) * 100 : 0;

    return {
      total_entregas: totalEntregas,
      completadas,
      pendientes,
      tasa_exito_pct: tasaExito,
    };
  }

  close(): void {
    this.db.close();
  }
}
