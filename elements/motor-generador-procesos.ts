/**
 * MotorGeneradorProcesos (Capa 0.2)
 * Genera documentos, asientos contables, movimientos de inventario.
 * Se coordina con MotorOrquestadorTransiciones.
 */

export interface DocumentoGenerado {
  readonly id: string;
  readonly tipo: "factura" | "asiento" | "movimiento" | "confirmacion" | "orden_compra" | "orden_servicio";
  readonly entidad_id: string;
  readonly data: Record<string, unknown>;
  readonly creado_en: string;
}

export interface GeneracionRequest {
  readonly tipo: string;
  readonly tx: Record<string, unknown>;
  readonly razon: string;
}

export interface GeneracionResult {
  readonly exitosa: boolean;
  readonly documentos: DocumentoGenerado[];
  readonly errores: string[];
}

export class MotorGeneradorProcesos {
  private documentos: DocumentoGenerado[] = [];

  generarDocumento(request: GeneracionRequest): GeneracionResult {
    console.log(
      `[MotorGeneradorProcesos] Generando ${request.tipo}: ${request.razon}`,
    );

    const documentos: DocumentoGenerado[] = [];
    const errores: string[] = [];

    try {
      const doc = this.crearDocumento(request);
      documentos.push(doc);
      this.documentos.push(doc);
      console.log(`✅ Generado: ${request.tipo} (${doc.id})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errores.push(`${request.tipo}: ${msg}`);
      console.log(`❌ Error generando ${request.tipo}: ${msg}`);
    }

    return {
      exitosa: errores.length === 0,
      documentos,
      errores,
    };
  }

  private crearDocumento(request: GeneracionRequest): DocumentoGenerado {
    const id = `${request.tipo}-${Date.now()}`;
    const tx = request.tx;

    const data = this.construirDatos(request.tipo, tx);

    return {
      id,
      tipo: request.tipo as any,
      entidad_id: (tx.id as string) ?? "unknown",
      data,
      creado_en: new Date().toISOString(),
    };
  }

  private construirDatos(
    tipo: string,
    tx: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (tipo) {
      case "factura":
        return {
          numero: `FAC-${Date.now()}`,
          fecha: new Date().toISOString(),
          cliente_id: tx.cliente_id,
          total: tx.total ?? 0,
          iva: (Number(tx.total ?? 0) * 0.21) | 0,
          estado: "emitida",
        };

      case "asiento":
        return {
          numero: `ASI-${Date.now()}`,
          fecha: new Date().toISOString(),
          tipo_asiento: tx.tipo_asiento ?? "documento",
          total_debito: tx.total ?? 0,
          total_credito: tx.total ?? 0,
          estado: "registrado",
        };

      case "movimiento":
        return {
          numero: `MOV-${Date.now()}`,
          fecha: new Date().toISOString(),
          tipo_movimiento: (tx.tipo_movimiento as string) ?? "entrada",
          cantidad: tx.cantidad ?? 0,
          producto_id: tx.producto_id,
          bodega_id: tx.bodega_id,
          estado: "registrado",
        };

      case "confirmacion":
        return {
          numero: `CONF-${Date.now()}`,
          fecha: new Date().toISOString(),
          referencia: tx.id,
          estado: "confirmada",
        };

      case "orden_compra":
        return {
          numero: `OC-${Date.now()}`,
          fecha: new Date().toISOString(),
          proveedor_id: tx.proveedor_id,
          total: tx.total ?? 0,
          estado: "generada",
        };

      case "orden_servicio":
        return {
          numero: `OS-${Date.now()}`,
          fecha: new Date().toISOString(),
          cliente_id: tx.cliente_id,
          descripcion: tx.descripcion,
          estado: "creada",
        };

      default:
        return { tipo, generado_en: new Date().toISOString() };
    }
  }

  obtenerDocumentos(): DocumentoGenerado[] {
    return [...this.documentos];
  }

  obtenerDocumentosPorTipo(tipo: string): DocumentoGenerado[] {
    return this.documentos.filter((d) => d.tipo === tipo);
  }

  obtenerDocumentosPorEntidad(entidad_id: string): DocumentoGenerado[] {
    return this.documentos.filter((d) => d.entidad_id === entidad_id);
  }
}
