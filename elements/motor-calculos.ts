/**
 * MotorCalculos (Capa 0.3)
 * Calcula valores derivados automáticamente y los persiste en EventStore.
 * Ejemplos: total, iva, saldo_pendiente, margen, días_atraso.
 */

interface CalculoRule {
  readonly archetype: string;
  readonly campo: string;
  readonly formula: string;
  readonly tipo: "suma" | "resta" | "multiplicacion" | "division" | "custom";
}

export interface CalculoResult {
  readonly campo: string;
  readonly valor: number;
  readonly formula: string;
}

export class MotorCalculos {
  private config: {
    readonly calculosPorArchetype: Record<string, CalculoRule[]>;
  };
  private eventStore?: any; // Referencia a SqliteEventStore para persistencia

  constructor(eventStore?: any) {
    this.eventStore = eventStore;
    this.config = this.construirConfiguracion();
    console.log(
      `[MotorCalculos] ${eventStore ? "Inicializado con EventStore" : "Sin persistencia - modo simulación"}`,
    );
  }

  private construirConfiguracion() {
    return {
      calculosPorArchetype: {
        venta: [
          {
            archetype: "venta",
            campo: "total",
            formula: "Σ(línea.cantidad × línea.precio)",
            tipo: "suma" as const,
          },
          {
            archetype: "venta",
            campo: "iva",
            formula: "total × iva_pct",
            tipo: "multiplicacion" as const,
          },
          {
            archetype: "venta",
            campo: "total_con_iva",
            formula: "total + iva",
            tipo: "suma" as const,
          },
          {
            archetype: "venta",
            campo: "saldo_pendiente",
            formula: "total_con_iva - pagado",
            tipo: "resta" as const,
          },
          {
            archetype: "venta",
            campo: "dias_atraso",
            formula: "hoy - fecha_vencimiento",
            tipo: "custom" as const,
          },
        ],
        compra: [
          {
            archetype: "compra",
            campo: "total",
            formula: "Σ(línea.cantidad × línea.precio_unitario)",
            tipo: "suma" as const,
          },
          {
            archetype: "compra",
            campo: "saldo_pendiente",
            formula: "total - pagado",
            tipo: "resta" as const,
          },
        ],
        servicio: [
          {
            archetype: "servicio",
            campo: "total",
            formula: "tarifa × duracion_horas",
            tipo: "multiplicacion" as const,
          },
          {
            archetype: "servicio",
            campo: "margen",
            formula: "(tarifa - costo_unitario) / tarifa × 100",
            tipo: "custom" as const,
          },
        ],
      },
    };
  }

  calcular(
    tx: Record<string, unknown>,
    campo: string,
  ): CalculoResult | undefined {
    const archetype = (tx.arquetipo_id as string) ?? "desconocido";
    const reglas = this.config.calculosPorArchetype[archetype] ?? [];

    const regla = reglas.find((r) => r.campo === campo);
    if (!regla) {
      console.log(
        `ℹ️ No hay cálculo definido para ${archetype}.${campo}`,
      );
      return undefined;
    }

    console.log(
      `[MotorCalculos] Calculando ${archetype}.${campo} = ${regla.formula}`,
    );

    const valor = this.evaluarFormula(regla, tx);
    console.log(`📊 Calculado: ${campo} = ${valor}`);

    return {
      campo,
      valor,
      formula: regla.formula,
    };
  }

  calcularTodos(tx: Record<string, unknown>): CalculoResult[] {
    const archetype = (tx.arquetipo_id as string) ?? "desconocido";
    const reglas = this.config.calculosPorArchetype[archetype] ?? [];
    const resultados: CalculoResult[] = [];

    for (const regla of reglas) {
      try {
        const valor = this.evaluarFormula(regla, tx);
        const resultado: CalculoResult = {
          campo: regla.campo,
          valor,
          formula: regla.formula,
        };
        resultados.push(resultado);

        // Persistir cálculo en EventStore
        if (this.eventStore) {
          this.persistirCalculoEnEventStore(resultado, tx, archetype);
        }
      } catch (err) {
        console.log(
          `⚠️ Error calculando ${regla.campo}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return resultados;
  }

  private evaluarFormula(
    regla: CalculoRule,
    tx: Record<string, unknown>,
  ): number {
    switch (regla.tipo) {
      case "suma": {
        const valores = this.extraerValoresDeFormula(regla.formula, tx);
        return valores.reduce((a, b) => a + b, 0);
      }
      case "resta": {
        const valores = this.extraerValoresDeFormula(regla.formula, tx);
        if (valores.length < 2) return 0;
        return valores[0]! - valores.slice(1).reduce((a, b) => a + b, 0);
      }
      case "multiplicacion": {
        const valores = this.extraerValoresDeFormula(regla.formula, tx);
        return valores.reduce((a, b) => a * b, 1);
      }
      case "division": {
        const valores = this.extraerValoresDeFormula(regla.formula, tx);
        if (valores.length < 2 || valores[1] === 0) return 0;
        return valores[0]! / valores[1]!;
      }
      case "custom": {
        return this.evaluarCustom(regla.campo, tx);
      }
      default:
        return 0;
    }
  }

  private extraerValoresDeFormula(
    formula: string,
    tx: Record<string, unknown>,
  ): number[] {
    // Extrae números y referencias de campos de la fórmula
    // Formato simple: "campo1 + campo2" → [valor1, valor2]
    const valores: number[] = [];

    // Reemplaza referencias de campos con sus valores
    let evaluada = formula;
    const campos = formula.match(/\b[a-z_]+\b/gi) ?? [];
    for (const campo of campos) {
      const valor = tx[campo.toLowerCase()] ?? 0;
      evaluada = evaluada.replace(new RegExp(campo, "g"), String(valor));
    }

    // Extrae números
    const numeros = evaluada.match(/-?\d+(?:\.\d+)?/g) ?? [];
    for (const num of numeros) {
      valores.push(Number(num));
    }

    return valores;
  }

  private evaluarCustom(
    campo: string,
    tx: Record<string, unknown>,
  ): number {
    // Lógica personalizada para campos complejos
    switch (campo) {
      case "dias_atraso": {
        const hoy = new Date();
        const vencimiento = new Date(tx.fecha_vencimiento as string);
        const dias = Math.max(
          0,
          Math.floor((hoy.getTime() - vencimiento.getTime()) / (1000 * 60 * 60 * 24)),
        );
        return dias;
      }
      case "margen": {
        const tarifa = Number(tx.tarifa ?? 0);
        const costo = Number(tx.costo_unitario ?? 0);
        if (tarifa === 0) return 0;
        return ((tarifa - costo) / tarifa) * 100;
      }
      default:
        return 0;
    }
  }

  registrarCalculo(
    archetype: string,
    campo: string,
    formula: string,
    tipo: CalculoRule["tipo"],
  ) {
    if (!this.config.calculosPorArchetype[archetype]) {
      this.config.calculosPorArchetype[archetype] = [];
    }
    this.config.calculosPorArchetype[archetype].push({
      archetype,
      campo,
      formula,
      tipo,
    });
    console.log(
      `ℹ️ Cálculo registrado: ${archetype}.${campo} = ${formula}`,
    );
  }

  obtenerConfiguracion() {
    return this.config;
  }

  private persistirCalculoEnEventStore(
    calculo: CalculoResult,
    tx: Record<string, unknown>,
    archetype: string,
  ): void {
    try {
      // Crear evento de Modificación para registro del cálculo
      const evento = {
        id: `calc-${calculo.campo}-${Date.now()}`,
        kind: "modificacion" as const,
        subjectId: (tx.id as string) ?? "unknown",
        occurredAt: new Date().toISOString(),
        actorId: "sys-calculos",
        actorKind: "sistema" as const,
        evidence: {
          kind: "sistema" as const,
          reference: `Cálculo derivado: ${calculo.campo}`,
          recordedAt: new Date().toISOString(),
        },
        freeText: JSON.stringify({
          campo: calculo.campo,
          valor: calculo.valor,
          formula: calculo.formula,
          archetype,
          timestamp: new Date().toISOString(),
        }),
      };

      this.eventStore.append(evento);
      console.log(
        `📝 Cálculo persistido en EventStore: ${calculo.campo}=${calculo.valor}`,
      );
    } catch (err) {
      console.log(
        `⚠️ Error persistiendo cálculo en EventStore: ${err instanceof Error ? err.message : String(err)}`,
      );
      // No fallar el cálculo si la persistencia falla
    }
  }
}
