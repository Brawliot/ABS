/**
 * Compras a proveedores: órdenes de compra y recepción de mercancía.
 * Append-only: cada acción crea un evento, no se modifica.
 */

import Database from "better-sqlite3";

export type EstadoCompra = "pendiente" | "recibida" | "cancelada";

export interface Compra {
  readonly id: string;
  readonly proveedor: string;
  readonly productoId: string;
  readonly cantidad: number;
  readonly precioUnitarioCentimos: number;
  readonly estado: EstadoCompra;
  readonly fechaPedido: string;
  readonly fechaRecibida?: string;
  readonly cantidadRecibida?: number;
}

export class SqliteComprasStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS compras (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        proveedor TEXT NOT NULL,
        producto_id TEXT NOT NULL,
        cantidad INTEGER NOT NULL CHECK (cantidad > 0),
        precio_unitario_centimos INTEGER NOT NULL CHECK (precio_unitario_centimos > 0),
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'recibida', 'cancelada')),
        fecha_pedido TEXT NOT NULL,
        fecha_recibida TEXT,
        cantidad_recibida INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_compras_tenant ON compras(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_compras_estado ON compras(tenant_id, estado);
      CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras(tenant_id, proveedor);
      CREATE TRIGGER IF NOT EXISTS compras_no_delete BEFORE DELETE ON compras
      BEGIN SELECT RAISE(ABORT, 'Las compras no se borran: cancele con actualización'); END;
    `);
  }

  crearCompra(
    tenantId: string,
    compraId: string,
    proveedor: string,
    productoId: string,
    cantidad: number,
    precioUnitarioCentimos: number,
    fechaPedido: string,
  ): Compra {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO compras (id, tenant_id, proveedor, producto_id, cantidad, precio_unitario_centimos, estado, fecha_pedido, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
      )
      .run(compraId, tenantId, proveedor, productoId, cantidad, precioUnitarioCentimos, fechaPedido, now);
    return {
      id: compraId,
      proveedor,
      productoId,
      cantidad,
      precioUnitarioCentimos,
      estado: "pendiente",
      fechaPedido,
    };
  }

  recibirCompra(
    tenantId: string,
    compraId: string,
    cantidadRecibida: number,
  ): Compra | undefined {
    const compra = this.obtener(tenantId, compraId);
    if (!compra || compra.estado !== "pendiente") return undefined;

    const ahora = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE compras SET estado = 'recibida', fecha_recibida = ?, cantidad_recibida = ?
         WHERE id = ? AND tenant_id = ?`,
      )
      .run(ahora, cantidadRecibida, compraId, tenantId);

    return {
      ...compra,
      estado: "recibida",
      fechaRecibida: ahora,
      cantidadRecibida,
    };
  }

  cancelarCompra(tenantId: string, compraId: string): Compra | undefined {
    const compra = this.obtener(tenantId, compraId);
    if (!compra) return undefined;

    this.db.prepare(`UPDATE compras SET estado = 'cancelada' WHERE id = ? AND tenant_id = ?`).run(compraId, tenantId);

    return {
      ...compra,
      estado: "cancelada",
    };
  }

  obtener(tenantId: string, compraId: string): Compra | undefined {
    const row = this.db
      .prepare(
        `SELECT id, proveedor, producto_id, cantidad, precio_unitario_centimos, estado, fecha_pedido, fecha_recibida, cantidad_recibida
         FROM compras WHERE id = ? AND tenant_id = ?`,
      )
      .get(compraId, tenantId) as {
      id: string;
      proveedor: string;
      producto_id: string;
      cantidad: number;
      precio_unitario_centimos: number;
      estado: string;
      fecha_pedido: string;
      fecha_recibida?: string;
      cantidad_recibida?: number;
    } | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      proveedor: row.proveedor,
      productoId: row.producto_id,
      cantidad: row.cantidad,
      precioUnitarioCentimos: row.precio_unitario_centimos,
      estado: row.estado as EstadoCompra,
      fechaPedido: row.fecha_pedido,
      ...(row.fecha_recibida && { fechaRecibida: row.fecha_recibida }),
      ...(row.cantidad_recibida && { cantidadRecibida: row.cantidad_recibida }),
    } as Compra;
  }

  listar(tenantId: string, filtros?: { proveedor?: string; estado?: EstadoCompra }): readonly Compra[] {
    let query =
      `SELECT id, proveedor, producto_id, cantidad, precio_unitario_centimos, estado, fecha_pedido, fecha_recibida, cantidad_recibida
       FROM compras WHERE tenant_id = ?`;
    const params: any[] = [tenantId];

    if (filtros?.proveedor) {
      query += ` AND proveedor = ?`;
      params.push(filtros.proveedor);
    }
    if (filtros?.estado) {
      query += ` AND estado = ?`;
      params.push(filtros.estado);
    }

    query += ` ORDER BY fecha_pedido DESC`;

    const rows = this.db.prepare(query).all(...params) as {
      id: string;
      proveedor: string;
      producto_id: string;
      cantidad: number;
      precio_unitario_centimos: number;
      estado: string;
      fecha_pedido: string;
      fecha_recibida?: string;
      cantidad_recibida?: number;
    }[];

    return rows.map((r) => ({
      id: r.id,
      proveedor: r.proveedor,
      productoId: r.producto_id,
      cantidad: r.cantidad,
      precioUnitarioCentimos: r.precio_unitario_centimos,
      estado: r.estado as EstadoCompra,
      fechaPedido: r.fecha_pedido,
      ...(r.fecha_recibida && { fechaRecibida: r.fecha_recibida }),
      ...(r.cantidad_recibida && { cantidadRecibida: r.cantidad_recibida }),
    } as Compra));
  }

  deudaConProveedor(tenantId: string, proveedor: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(cantidad * precio_unitario_centimos), 0) as total
         FROM compras WHERE tenant_id = ? AND proveedor = ? AND estado != 'cancelada'`,
      )
      .get(tenantId, proveedor) as { total: number };
    return row.total;
  }

  close(): void {
    this.db.close();
  }
}
