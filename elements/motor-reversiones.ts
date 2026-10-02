/**
 * MotorReversiones (Capa 0.3)
 * Define qué pasa si cancelas/anulapas una transacción.
 * Genera compensaciones automáticas y las persiste en EventStore.
 */

interface RetencionAction {
  readonly tipo: "reversar_asiento" | "devolver_inventario" | "cancelar_documento" | "liberar_recurso";
  readonly entidad: string;
  readonly razon: string;
}

interface ReversionRule {
  readonly archetype: string;
  readonly transitionId: string;
  readonly acciones: RetencionAction[];
}

export interface ReversionResult {
  readonly acciones_ejecutadas: RetencionAction[];
  readonly estado_nuevo: string;
  readonly errores: string[];
}

export class MotorReversiones {
  private config: {
    readonly reversionesPorArchetype: Record<string, Record<string, ReversionRule>>;
  };
  private eventStore?: any; // Referencia a SqliteEventStore para persistencia

  constructor(eventStore?: any) {
    this.eventStore = eventStore;
    this.config = this.construirConfiguracion();
    console.log(
      `[MotorReversiones] ${eventStore ? "Inicializado con EventStore" : "Sin persistencia - modo simulación"}`,
    );
  }

  private construirConfiguracion() {
    return {
      reversionesPorArchetype: {
        venta: {
          cancelar: {
            archetype: "venta",
            transitionId: "cancelar",
            acciones: [
              {
                tipo: "reversar_asiento" as const,
                entidad: "venta",
                razon: "Cancelación de venta",
              },
              {
                tipo: "devolver_inventario" as const,
                entidad: "inventario",
                razon: "Devolución de stock",
              },
              {
                tipo: "cancelar_documento" as const,
                entidad: "factura",
                razon: "Cancelación de factura asociada",
              },
            ],
          },
          anular: {
            archetype: "venta",
            transitionId: "anular",
            acciones: [
              {
                tipo: "reversar_asiento" as const,
                entidad: "venta",
                razon: "Anulación de venta",
              },
              {
                tipo: "devolver_inventario" as const,
                entidad: "inventario",
                razon: "Devolución de stock",
              },
            ],
          },
        },
        compra: {
          cancelar: {
            archetype: "compra",
            transitionId: "cancelar",
            acciones: [
              {
                tipo: "reversar_asiento" as const,
                entidad: "compra",
                razon: "Cancelación de compra",
              },
              {
                tipo: "cancelar_documento" as const,
                entidad: "orden_compra",
                razon: "Cancelación de OC",
              },
            ],
          },
          rechazar: {
            archetype: "compra",
            transitionId: "rechazar",
            acciones: [
              {
                tipo: "cancelar_documento" as const,
                entidad: "orden_compra",
                razon: "Rechazo de compra",
              },
            ],
          },
        },
        servicio: {
          cancelar: {
            archetype: "servicio",
            transitionId: "cancelar",
            acciones: [
              {
                tipo: "reversar_asiento" as const,
                entidad: "servicio",
                razon: "Cancelación de servicio",
              },
              {
                tipo: "liberar_recurso" as const,
                entidad: "cronograma",
                razon: "Liberación de slots agendados",
              },
            ],
          },
        },
      },
    };
  }

  revertir(
    tx: Record<string, unknown>,
    transitionId: string,
  ): ReversionResult {
    const archetype = (tx.arquetipo_id as string) ?? "desconocido";
    const acciones_ejecutadas: RetencionAction[] = [];
    const errores: string[] = [];

    console.log(
      `[MotorReversiones] Iniciando reversión de ${archetype}.${transitionId}`,
    );

    const regla = this.config.reversionesPorArchetype[archetype]?.[transitionId];
    if (!regla) {
      console.log(
        `ℹ️ Sin reversiones configuradas para ${archetype}.${transitionId}`,
      );
      return {
        acciones_ejecutadas,
        estado_nuevo: "cancelada",
        errores,
      };
    }

    for (const accion of regla.acciones) {
      try {
        this.ejecutarAccion(accion, tx);
        acciones_ejecutadas.push(accion);

        // Persistir acción de reversión en EventStore
        if (this.eventStore) {
          this.persistirAccionEnEventStore(accion, tx, transitionId);
        }

        console.log(`↩️ Ejecutada: ${accion.tipo} (${accion.entidad})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errores.push(`${accion.tipo}: ${msg}`);
        console.log(`❌ Error en reversión ${accion.tipo}: ${msg}`);
      }
    }

    return {
      acciones_ejecutadas,
      estado_nuevo: this.determinarEstadoNuevo(transitionId),
      errores,
    };
  }

  private ejecutarAccion(
    accion: RetencionAction,
    tx: Record<string, unknown>,
  ): void {
    // Simulación: en producción, ejecutaría transacciones reales
    switch (accion.tipo) {
      case "reversar_asiento":
        console.log(
          `  [asiento] Creando entrada de reversión para ${accion.entidad}`,
        );
        break;
      case "devolver_inventario":
        console.log(
          `  [inventario] Devolviendo items a stock (transacción: ${tx.id})`,
        );
        break;
      case "cancelar_documento":
        console.log(
          `  [documento] Marcando ${accion.entidad} como cancelada`,
        );
        break;
      case "liberar_recurso":
        console.log(`  [recurso] Liberando slots en ${accion.entidad}`);
        break;
    }
  }

  private determinarEstadoNuevo(transitionId: string): string {
    // Determina el estado al que transiciona después de reverso
    switch (transitionId) {
      case "cancelar":
        return "cancelada";
      case "anular":
        return "anulada";
      case "rechazar":
        return "rechazada";
      default:
        return "reversada";
    }
  }

  registrarReversiones(
    archetype: string,
    transitionId: string,
    acciones: RetencionAction[],
  ) {
    if (!this.config.reversionesPorArchetype[archetype]) {
      this.config.reversionesPorArchetype[archetype] = {};
    }
    this.config.reversionesPorArchetype[archetype][transitionId] = {
      archetype,
      transitionId,
      acciones,
    };
    console.log(
      `ℹ️ Plan de reversión registrado: ${archetype}.${transitionId} (${acciones.length} acciones)`,
    );
  }

  obtenerConfiguracion() {
    return this.config;
  }

  private persistirAccionEnEventStore(
    accion: RetencionAction,
    tx: Record<string, unknown>,
    transitionId: string,
  ): void {
    try {
      // Crear evento de Modificación para registro de acción de reversión
      const evento = {
        id: `rev-${accion.tipo}-${Date.now()}`,
        kind: "modificacion" as const,
        subjectId: (tx.id as string) ?? "unknown",
        occurredAt: new Date().toISOString(),
        actorId: "sys-reversiones",
        actorKind: "sistema" as const,
        evidence: {
          kind: "sistema" as const,
          reference: `Acción de reversión: ${accion.tipo}`,
          recordedAt: new Date().toISOString(),
        },
        freeText: JSON.stringify({
          accion_tipo: accion.tipo,
          accion_entidad: accion.entidad,
          accion_razon: accion.razon,
          transicion_id: transitionId,
          timestamp: new Date().toISOString(),
        }),
      };

      this.eventStore.append(evento);
      console.log(
        `📝 Acción de reversión persistida en EventStore: ${accion.tipo}`,
      );
    } catch (err) {
      console.log(
        `⚠️ Error persistiendo reversión en EventStore: ${err instanceof Error ? err.message : String(err)}`,
      );
      // No fallar la reversión si la persistencia falla
    }
  }
}
