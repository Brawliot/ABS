/**
 * Motor de Exportación: Exportar datos en múltiples formatos
 * CSV, JSON, SQL, Python, Power BI.
 */

export interface DatosExportacion {
  readonly columnas: readonly string[];
  readonly filas: readonly Record<string, any>[];
}

export interface ExportacionProgramada {
  readonly id: string;
  readonly nombre: string;
  readonly consulta: string;
  readonly formatos: readonly string[];
  readonly frecuencia: "diaria" | "semanal" | "mensual";
  readonly siguientaEjecucion: Date;
  readonly activa: boolean;
}

export class MotorExportAnalísis {
  private exportacionesProgramadas = new Map<string, ExportacionProgramada>();

  exportarCSV(datos: DatosExportacion): string {
    const headers = datos.columnas.join(",");
    const filas = datos.filas.map(fila =>
      datos.columnas
        .map(col => {
          const valor = fila[col];
          if (typeof valor === "string" && valor.includes(",")) {
            return `"${valor}"`;
          }
          return valor ?? "";
        })
        .join(",")
    );

    return [headers, ...filas].join("\n");
  }

  exportarJSON(datos: DatosExportacion): string {
    return JSON.stringify(
      {
        columnas: datos.columnas,
        total: datos.filas.length,
        datos: datos.filas,
      },
      null,
      2
    );
  }

  exportarSQL(datos: DatosExportacion, tabla: string): string {
    if (datos.filas.length === 0) {
      return `-- No hay datos para exportar de ${tabla}`;
    }

    const columnas = datos.columnas.join(", ");
    const inserts = datos.filas.map(fila => {
      const valores = datos.columnas
        .map(col => {
          const valor = fila[col];
          if (valor === null || valor === undefined) return "NULL";
          if (typeof valor === "string") return `'${valor.replace(/'/g, "''")}'`;
          if (valor instanceof Date) return `'${valor.toISOString()}'`;
          return valor;
        })
        .join(", ");
      return `INSERT INTO ${tabla} (${columnas}) VALUES (${valores});`;
    });

    return inserts.join("\n");
  }

  exportarPython(datos: DatosExportacion): string {
    const json = this.exportarJSON(datos);

    return `import pandas as pd
import json

data_json = '''${json}'''
data = json.loads(data_json)

df = pd.DataFrame(data['datos'])

print(df.head())
print(f"Total de registros: {len(df)}")

# Guardar a CSV
df.to_csv('datos.csv', index=False)

# Guardar a Excel
df.to_excel('datos.xlsx', index=False)

# Estadísticas básicas
print(df.describe())
`;
  }

  exportarPowerBI(datos: DatosExportacion): string {
    const json = this.exportarJSON(datos);

    return `let
    Fuente = Json.Document(
      Text.FromBinary(
        Binary.Buffer(
          "${json.replace(/"/g, '\\"')}"
        )
      )
    ),
    DatosTabla = Fuente[datos],
    ConvertidoATabla = Table.FromList(
      DatosTabla,
      Splitter.SplitByNothing(),
      null,
      null,
      ExtraValues.Error
    ),
    ExpandidoRegistros = Table.ExpandRecordColumn(
      ConvertidoATabla,
      "Column1",
      ${JSON.stringify(datos.columnas)},
      ${JSON.stringify(datos.columnas)}
    )
in
    ExpandidoRegistros`;
  }

  programarExportación(
    nombre: string,
    consulta: string,
    formatos: string[],
    frecuencia: "diaria" | "semanal" | "mensual"
  ): ExportacionProgramada {
    const id = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const siguientaEjecucion = new Date();
    if (frecuencia === "diaria") {
      siguientaEjecucion.setDate(siguientaEjecucion.getDate() + 1);
    } else if (frecuencia === "semanal") {
      siguientaEjecucion.setDate(siguientaEjecucion.getDate() + 7);
    } else if (frecuencia === "mensual") {
      siguientaEjecucion.setMonth(siguientaEjecucion.getMonth() + 1);
    }

    const exportacion: ExportacionProgramada = {
      id,
      nombre,
      consulta,
      formatos,
      frecuencia,
      siguientaEjecucion,
      activa: true,
    };

    this.exportacionesProgramadas.set(id, exportacion);
    return exportacion;
  }

  obtenerExportacionesProgramadas(): ExportacionProgramada[] {
    return Array.from(this.exportacionesProgramadas.values());
  }

  desactivarExportacion(id: string): void {
    const exp = this.exportacionesProgramadas.get(id);
    if (exp) {
      this.exportacionesProgramadas.set(id, {
        ...exp,
        activa: false,
      });
    }
  }

  activarExportacion(id: string): void {
    const exp = this.exportacionesProgramadas.get(id);
    if (exp) {
      this.exportacionesProgramadas.set(id, {
        ...exp,
        activa: true,
      });
    }
  }
}
