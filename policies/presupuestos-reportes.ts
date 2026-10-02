import type { Presupuesto, PartidaPresupuestaria } from "./presupuestos-motor.js";

export interface DetallePartida {
  readonly partida: string;
  readonly presupuestado: number;
  readonly gastado: number;
  readonly varianza_pct: number;
  readonly estado: "dentro" | "alerta" | "crítico";
}

export interface TendenciaPresupuesto {
  readonly año: number;
  readonly presupuesto: number;
  readonly gastado: number;
  readonly varianza: number;
}

export interface ReporteEjecución {
  readonly html: string;
  readonly pdf?: string;
}

export class MotorReportesPresupuesto {
  generarReporteEjecución(presupuesto: Presupuesto): ReporteEjecución {
    const html = this.generarHtmlReporte(presupuesto);

    return {
      html,
      // En producción, aquí se generaría un PDF real
      pdf: undefined,
    };
  }

  generarDetallePartidas(presupuesto: Presupuesto): DetallePartida[] {
    return presupuesto.partidas.map((p) => {
      let estado: "dentro" | "alerta" | "crítico";

      if (p.porcentaje_gastado >= 100) {
        estado = "crítico";
      } else if (p.porcentaje_gastado >= 80) {
        estado = "alerta";
      } else {
        estado = "dentro";
      }

      return {
        partida: p.concepto,
        presupuestado: p.presupuestado,
        gastado: p.gastado,
        varianza_pct:
          ((p.presupuestado - p.gastado) / p.presupuestado) * 100,
        estado,
      };
    });
  }

  compararPeriodos(presupuesto1: Presupuesto, presupuesto2: Presupuesto): {
    variación_presupuesto: number;
    variación_gastos: number;
    nuevas_partidas: PartidaPresupuestaria[];
    partidas_eliminadas: PartidaPresupuestaria[];
  } {
    const variación_presupuesto =
      presupuesto2.presupuesto_total - presupuesto1.presupuesto_total;
    const variación_gastos = presupuesto2.gasto_real - presupuesto1.gasto_real;

    const ids1 = new Set(presupuesto1.partidas.map((p) => p.concepto));
    const ids2 = new Set(presupuesto2.partidas.map((p) => p.concepto));

    const nuevas_partidas = presupuesto2.partidas.filter(
      (p) => !ids1.has(p.concepto)
    );
    const partidas_eliminadas = presupuesto1.partidas.filter(
      (p) => !ids2.has(p.concepto)
    );

    return {
      variación_presupuesto,
      variación_gastos,
      nuevas_partidas,
      partidas_eliminadas,
    };
  }

  obtenerTendencia(
    presupuestos: Presupuesto[]
  ): TendenciaPresupuesto[] {
    return presupuestos
      .sort((a, b) => a.año - b.año)
      .map((p) => ({
        año: p.año,
        presupuesto: p.presupuesto_total,
        gastado: p.gasto_real,
        varianza: p.presupuesto_total - p.gasto_real,
      }));
  }

  private generarHtmlReporte(presupuesto: Presupuesto): string {
    const detalles = this.generarDetallePartidas(presupuesto);
    const porcentaje_ejecución =
      (presupuesto.gasto_real / presupuesto.presupuesto_total) * 100;

    const filas_partidas = detalles
      .map(
        (d) => `
      <tr>
        <td>${d.partida}</td>
        <td>$${d.presupuestado.toFixed(2)}</td>
        <td>$${d.gastado.toFixed(2)}</td>
        <td>${d.varianza_pct.toFixed(2)}%</td>
        <td><span class="estado-${d.estado}">${d.estado.toUpperCase()}</span></td>
      </tr>
    `
      )
      .join("");

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte de Ejecución Presupuestaria</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { border-bottom: 2px solid #333; margin-bottom: 20px; }
          .resumen { background-color: #f5f5f5; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background-color: #4CAF50; color: white; }
          .estado-dentro { color: green; font-weight: bold; }
          .estado-alerta { color: orange; font-weight: bold; }
          .estado-crítico { color: red; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Reporte de Ejecución Presupuestaria</h1>
          <p><strong>Nombre:</strong> ${presupuesto.nombre}</p>
          <p><strong>Año:</strong> ${presupuesto.año}</p>
          ${presupuesto.departamento ? `<p><strong>Departamento:</strong> ${presupuesto.departamento}</p>` : ""}
        </div>

        <div class="resumen">
          <h2>Resumen Ejecutivo</h2>
          <table>
            <tr>
              <th>Métrica</th>
              <th>Valor</th>
            </tr>
            <tr>
              <td>Presupuesto Total</td>
              <td>$${presupuesto.presupuesto_total.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Gasto Real</td>
              <td>$${presupuesto.gasto_real.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Disponible</td>
              <td>$${(presupuesto.presupuesto_total - presupuesto.gasto_real).toFixed(2)}</td>
            </tr>
            <tr>
              <td>Porcentaje Ejecutado</td>
              <td>${porcentaje_ejecución.toFixed(2)}%</td>
            </tr>
            <tr>
              <td>Estado</td>
              <td>${presupuesto.estado.toUpperCase()}</td>
            </tr>
          </table>
        </div>

        <h2>Detalle por Partidas</h2>
        <table>
          <thead>
            <tr>
              <th>Partida</th>
              <th>Presupuestado</th>
              <th>Gastado</th>
              <th>Varianza %</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${filas_partidas}
          </tbody>
        </table>

        <p><em>Generado: ${new Date().toLocaleString()}</em></p>
      </body>
      </html>
    `;
  }
}
