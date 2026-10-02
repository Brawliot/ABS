/**
 * MotorOrquestadorTransiciones (Capa 0.3)
 * Coordina generación automática de documentos, asientos, movimientos.
 * Se ejecuta DESPUÉS de la transición de estado.
 */

interface GeneracionRule {
  readonly archetype: string;
  readonly transitionId: string;
  readonly generarElementos: string[];
}

export interface OrquestacionResult {
  readonly generados: Array<{
    readonly tipo: string;
    readonly id: string;
    readonly label: string;
  }>;
  readonly erroresGeneracion: string[];
}

export class MotorOrquestadorTransiciones {
  private config: {
    readonly generacionesPorArchetype: Record<
      string,
      Record<string, GeneracionRule>
    >;
  };
  private motorGenerador: any; // Referencia al MotorGeneradorProcesos

  constructor(motorGenerador?: any) {
    this.motorGenerador = motorGenerador;
    this.config = this.construirConfiguracion();
    console.log(
      `[MotorOrquestadorTransiciones] ${motorGenerador ? "Inicializado con MotorGeneradorProcesos" : "Sin generador - modo simulación"}`,
    );
  }

  private construirConfiguracion() {
    return {
      generacionesPorArchetype: {
        venta: {
          t_aceptar: {
            archetype: "venta",
            transitionId: "t_aceptar",
            generarElementos: [
              "confirmacion",
              "asiento_contable",
              "movimiento_inventario",
            ],
          },
          t_facturar: {
            archetype: "venta",
            transitionId: "t_facturar",
            generarElementos: ["factura", "asiento_facturacion"],
          },
        },
        compra: {
          t_aceptar: {
            archetype: "compra",
            transitionId: "t_aceptar",
            generarElementos: ["orden_compra", "asiento_contable"],
          },
          t_recibir: {
            archetype: "compra",
            transitionId: "t_recibir",
            generarElementos: ["recepcion", "movimiento_inventario"],
          },
        },
        servicio: {
          t_iniciar: {
            archetype: "servicio",
            transitionId: "t_iniciar",
            generarElementos: ["orden_servicio", "cronograma"],
          },
          t_completar: {
            archetype: "servicio",
            transitionId: "t_completar",
            generarElementos: ["factura_servicio", "asiento_finalizacion"],
          },
        },
      },
    };
  }

  alTransicionar(
    tx: Record<string, unknown>,
    transitionId: string,
    nuevoEstado: string,
  ): OrquestacionResult {
    const archetype = (tx.arquetipo_id as string) ?? "desconocido";
    const generados: OrquestacionResult["generados"] = [];
    const erroresGeneracion: string[] = [];

    console.log(
      `[MotorOrquestadorTransiciones] Orquestando ${archetype}.${transitionId} → ${nuevoEstado}`,
    );

    const regla = this.config.generacionesPorArchetype[archetype]?.[transitionId];
    if (!regla) {
      console.log(`ℹ️ Sin generaciones configuradas para ${archetype}.${transitionId}`);
      return { generados, erroresGeneracion };
    }

    for (const tipoElemento of regla.generarElementos) {
      try {
        const resultado = this.generarElemento(tipoElemento, tx, transitionId);
        if (resultado) {
          generados.push(resultado);
          console.log(`📄 Generado: ${tipoElemento} (${resultado.id})`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        erroresGeneracion.push(`${tipoElemento}: ${msg}`);
        console.log(`❌ Error generando ${tipoElemento}: ${msg}`);
      }
    }

    return { generados, erroresGeneracion };
  }

  private generarElemento(
    tipo: string,
    tx: Record<string, unknown>,
    transitionId: string,
  ): OrquestacionResult["generados"][number] | undefined {
    // Usar MotorGeneradorProcesos real si está disponible
    if (this.motorGenerador) {
      try {
        const resultado = this.motorGenerador.generarDocumento({
          tipo,
          tx,
          razon: `Generado automáticamente por transición ${transitionId}`,
        });

        if (resultado.exitosa && resultado.documentos.length > 0) {
          const doc = resultado.documentos[0]!;
          return {
            tipo,
            id: doc.id,
            label: `${tipo} (${doc.id})`,
          };
        }
      } catch (err) {
        console.log(
          `⚠️ Error usando MotorGenerador: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Fallback a simulación si no hay generador o falló
    const id = `${tipo}-${Date.now()}`;
    const label = `${tipo} simulado`;
    return { tipo, id, label };
  }

  registrarGeneracion(
    archetype: string,
    transitionId: string,
    elementosAGenerar: string[],
  ) {
    if (!this.config.generacionesPorArchetype[archetype]) {
      this.config.generacionesPorArchetype[archetype] = {};
    }
    this.config.generacionesPorArchetype[archetype][transitionId] = {
      archetype,
      transitionId,
      generarElementos: elementosAGenerar,
    };
    console.log(
      `ℹ️ Generación registrada: ${archetype}.${transitionId} → ${elementosAGenerar.join(", ")}`,
    );
  }

  obtenerConfiguracion() {
    return this.config;
  }
}
