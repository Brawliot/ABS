/**
 * Financiados (SQLite): registra financiaciones de expedientes (amortización
 * francesa) con cuotas mensuales. Almacén append-only con triggers que
 * impiden modificación o borrado; un error se corrige con reversión de cuotas.
 */

import Database from "better-sqlite3";

export interface FinanciadoRegistro {
  readonly id?: string;
  readonly expedienteOrigen: string;
  readonly plazoMeses: number;
  readonly tasaInteres: number;
  readonly cuotaMensualCentimos: number;
  readonly estadoFinanciado: "activo" | "pagado" | "cancelado";
  readonly fecha: string;
}

export interface CuotaRegistro {
  readonly seq?: number;
  readonly financiadoId: string;
  readonly numeroOrden: number;
  readonly vencimientoEn: string;
  readonly importeCentimos: number;
  readonly estado: "pendiente" | "pagada" | "cancelada";
  readonly fechaPago?: string;
}

export class SqliteFinanciachsStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS financiados (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        expediente_origen TEXT NOT NULL,
        plazo_meses INTEGER NOT NULL CHECK (plazo_meses > 0),
        tasa_interes REAL NOT NULL CHECK (tasa_interes >= 0),
        cuota_mensual_centimos INTEGER NOT NULL CHECK (cuota_mensual_centimos > 0),
        estado_financiado TEXT NOT NULL DEFAULT 'activo' CHECK (estado_financiado IN ('activo', 'pagado', 'cancelado')),
        fecha TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_financiados_expediente ON financiados(tenant_id, expediente_origen);
      CREATE INDEX IF NOT EXISTS idx_financiados_estado ON financiados(tenant_id, estado_financiado);
      CREATE TRIGGER IF NOT EXISTS financiados_no_update BEFORE UPDATE ON financiados
      BEGIN SELECT RAISE(ABORT, 'Los financiados no se modifican: registre reversión de cuotas'); END;
      CREATE TRIGGER IF NOT EXISTS financiados_no_delete BEFORE DELETE ON financiados
      BEGIN SELECT RAISE(ABORT, 'Los financiados no se borran: cancele con reversión'); END;

      CREATE TABLE IF NOT EXISTS cuotas (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        financiado_id TEXT NOT NULL,
        numero_orden INTEGER NOT NULL,
        vencimiento_en TEXT NOT NULL,
        importe_centimos INTEGER NOT NULL CHECK (importe_centimos > 0),
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'cancelada')),
        fecha_pago TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (financiado_id) REFERENCES financiados(id),
        UNIQUE (tenant_id, financiado_id, numero_orden)
      );
      CREATE INDEX IF NOT EXISTS idx_cuotas_financiado ON cuotas(tenant_id, financiado_id);
      CREATE INDEX IF NOT EXISTS idx_cuotas_estado ON cuotas(tenant_id, estado);
      CREATE TRIGGER IF NOT EXISTS cuotas_no_delete BEFORE DELETE ON cuotas
      BEGIN SELECT RAISE(ABORT, 'Las cuotas no se borran: registre cancelación'); END;
    `);
  }

  crearFinanciado(
    tenantId: string,
    financiado: {
      readonly id: string;
      readonly expedienteOrigen: string;
      readonly plazoMeses: number;
      readonly tasaInteres: number;
      readonly cuotaMensualCentimos: number;
      readonly fecha: string;
    },
  ): void {
    this.db
      .prepare(
        `INSERT INTO financiados (id, tenant_id, expediente_origen, plazo_meses, tasa_interes, cuota_mensual_centimos, fecha, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        financiado.id,
        tenantId,
        financiado.expedienteOrigen,
        financiado.plazoMeses,
        financiado.tasaInteres,
        financiado.cuotaMensualCentimos,
        financiado.fecha,
        new Date().toISOString(),
      );
  }

  deExpediente(
    tenantId: string,
    expedienteOrigen: string,
  ): FinanciadoRegistro | undefined {
    const row = this.db
      .prepare(
        `SELECT id, expediente_origen, plazo_meses, tasa_interes, cuota_mensual_centimos, estado_financiado, fecha
         FROM financiados
         WHERE tenant_id = ? AND expediente_origen = ? AND estado_financiado = 'activo'
         LIMIT 1`,
      )
      .get(tenantId, expedienteOrigen) as {
      id: string;
      expediente_origen: string;
      plazo_meses: number;
      tasa_interes: number;
      cuota_mensual_centimos: number;
      estado_financiado: string;
      fecha: string;
    } | undefined;
    return row
      ? {
          id: row.id,
          expedienteOrigen: row.expediente_origen,
          plazoMeses: row.plazo_meses,
          tasaInteres: row.tasa_interes,
          cuotaMensualCentimos: row.cuota_mensual_centimos,
          estadoFinanciado: row.estado_financiado as "activo" | "pagado" | "cancelado",
          fecha: row.fecha,
        }
      : undefined;
  }

  agregarCuota(
    tenantId: string,
    cuota: {
      readonly financiadoId: string;
      readonly numeroOrden: number;
      readonly vencimientoEn: string;
      readonly importeCentimos: number;
    },
  ): void {
    this.db
      .prepare(
        `INSERT INTO cuotas (tenant_id, financiado_id, numero_orden, vencimiento_en, importe_centimos, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        cuota.financiadoId,
        cuota.numeroOrden,
        cuota.vencimientoEn,
        cuota.importeCentimos,
        new Date().toISOString(),
      );
  }

  cuotasDelFinanciado(
    tenantId: string,
    financiadoId: string,
  ): readonly CuotaRegistro[] {
    const rows = this.db
      .prepare(
        `SELECT seq, financiado_id, numero_orden, vencimiento_en, importe_centimos, estado, fecha_pago
         FROM cuotas
         WHERE tenant_id = ? AND financiado_id = ?
         ORDER BY numero_orden ASC`,
      )
      .all(tenantId, financiadoId) as {
      seq: number;
      financiado_id: string;
      numero_orden: number;
      vencimiento_en: string;
      importe_centimos: number;
      estado: string;
      fecha_pago: string | null;
    }[];
    return rows.map((r) => ({
      seq: r.seq,
      financiadoId: r.financiado_id,
      numeroOrden: r.numero_orden,
      vencimientoEn: r.vencimiento_en,
      importeCentimos: r.importe_centimos,
      estado: r.estado as "pendiente" | "pagada" | "cancelada",
      ...(r.fecha_pago ? { fechaPago: r.fecha_pago } : {}),
    }));
  }

  pagarCuota(
    tenantId: string,
    financiadoId: string,
    numeroOrden: number,
    fecha: string,
  ): void {
    this.db
      .prepare(
        `UPDATE cuotas SET estado = 'pagada', fecha_pago = ?
         WHERE tenant_id = ? AND financiado_id = ? AND numero_orden = ?`,
      )
      .run(fecha, tenantId, financiadoId, numeroOrden);
  }

  actualizarEstadoFinanciado(
    tenantId: string,
    financiadoId: string,
    nuevoEstado: "activo" | "pagado" | "cancelado",
  ): void {
    this.db
      .prepare(
        `UPDATE financiados SET estado_financiado = ?
         WHERE tenant_id = ? AND id = ?`,
      )
      .run(nuevoEstado, tenantId, financiadoId);
  }

  close(): void {
    this.db.close();
  }
}
