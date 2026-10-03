/**
 * Motor de Simulador - Modelos Matemáticos (Fase 4B)
 * Proyecciones: lineal, exponencial, estacional, polinómica
 */

import type {
  DatoPunto,
  ProyeccionLineal,
  ProyeccionExponencial,
  ProyeccionEstacional,
  ProyeccionPolinómica,
  Proyección,
  Tendencia,
} from "../elements/simulador.js";

export class MotorSimuladorModelos {
  /**
   * Regresión lineal: y = pendiente * x + intercepto
   */
  proyectarLineal(
    datos: DatoPunto[],
    periodosAdelante: number,
  ): ProyeccionLineal {
    if (datos.length < 2) {
      throw new Error("Se requieren al menos 2 puntos de datos");
    }

    const n = datos.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = datos.map((d) => d.valor);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, v, i) => a + v * (y[i] ?? 0), 0);
    const sumX2 = x.reduce((a, v) => a + v * v, 0);

    const pendiente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercepto = (sumY - pendiente * sumX) / n;

    const predicciones_calculadas = y.map((_, i) => pendiente * i + intercepto);
    const r2 = this.calcularR2(y, predicciones_calculadas);

    const predicciones: DatoPunto[] = [];
    const ultimoDato = datos[n - 1];
    if (!ultimoDato) throw new Error("Datos vacíos");
    const ultimaFecha = ultimoDato.fecha;

    for (let i = 1; i <= periodosAdelante; i++) {
      const valor = pendiente * (n - 1 + i) + intercepto;
      const fecha = new Date(ultimaFecha);
      fecha.setMonth(fecha.getMonth() + i);
      predicciones.push({ fecha, valor: Math.max(0, valor) });
    }

    return {
      modelo: "lineal",
      pendiente,
      intercepto,
      r2,
      predicciones,
    };
  }

  /**
   * Proyección exponencial: y = a * e^(b*x)
   */
  proyectarExponencial(
    datos: DatoPunto[],
    periodosAdelante: number,
  ): ProyeccionExponencial {
    if (datos.length < 2) {
      throw new Error("Se requieren al menos 2 puntos de datos");
    }

    const n = datos.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = datos.map((d) => d.valor);

    // Transformar: ln(y) = ln(a) + b*x
    const lnY = y.map((v) => Math.log(Math.max(v ?? 0.001, 0.001)));

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumLnY = lnY.reduce((a, b) => a + b, 0);
    const sumXLnY = x.reduce((a, v, i) => a + v * (lnY[i] ?? 0), 0);
    const sumX2 = x.reduce((a, v) => a + v * v, 0);

    const b = (n * sumXLnY - sumX * sumLnY) / (n * sumX2 - sumX * sumX);
    const lnA = (sumLnY - b * sumX) / n;
    const a = Math.exp(lnA);

    const predicciones_valores = y.map((_, i) => a * Math.exp(b * i));
    const r2 = this.calcularR2(y, predicciones_valores);

    const predicciones: DatoPunto[] = [];
    const ultimoDato = datos[n - 1];
    if (!ultimoDato) throw new Error("Datos vacíos");
    const ultimaFecha = ultimoDato.fecha;

    for (let i = 1; i <= periodosAdelante; i++) {
      const valor = a * Math.exp(b * (n - 1 + i));
      const fecha = new Date(ultimaFecha);
      fecha.setMonth(fecha.getMonth() + i);
      predicciones.push({ fecha, valor: Math.max(0, valor) });
    }

    return {
      modelo: "exponencial",
      basee: a,
      exponente: b,
      r2,
      predicciones,
    };
  }

  /**
   * Proyección estacional: detecta ciclos + aplica tendencia
   */
  proyectarEstacional(
    datos: DatoPunto[],
    periodosAdelante: number,
  ): ProyeccionEstacional {
    if (datos.length < 12) {
      throw new Error("Se requieren al menos 12 puntos para detectar estacionalidad");
    }

    const n = datos.length;
    const valores = datos.map((d) => d.valor);

    // Detectar ciclo (asumimos 12 meses)
    const ciclo = 12;
    const amplitudes: number[] = [];

    for (let i = 0; i < ciclo; i++) {
      const componentes: number[] = [];
      for (let j = i; j < n; j += ciclo) {
        const valor = valores[j];
        if (valor !== undefined) componentes.push(valor);
      }
      if (componentes.length === 0) {
        amplitudes.push(0);
        continue;
      }
      const promedio = componentes.reduce((a, b) => a + b, 0) / componentes.length;
      const desv = Math.sqrt(
        componentes.reduce((a, v) => a + (v - promedio) ** 2, 0) / componentes.length,
      );
      amplitudes.push(desv);
    }

    const amplitud = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;

    // Tendencia base usando regresión lineal
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = valores.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, v, i) => a + v * (valores[i] ?? 0), 0);
    const sumX2 = x.reduce((a, v) => a + v * v, 0);

    const pendiente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const tendencia = pendiente > 0 ? "alcista" : pendiente < 0 ? "bajista" : "lateral";

    const predicciones_valores = valores.map((_, i) => {
      const promedio = sumY / n;
      const componente = amplitudes[i % ciclo] ?? 0;
      return promedio + componente * Math.sin((i * 2 * Math.PI) / ciclo);
    });

    const r2 = this.calcularR2(valores, predicciones_valores);

    const predicciones: DatoPunto[] = [];
    const ultimaFecha = datos[n - 1]?.fecha;
    if (!ultimaFecha) throw new Error("Datos vacíos");

    for (let i = 1; i <= periodosAdelante; i++) {
      const indice = n - 1 + i;
      const promedio = sumY / n;
      const componente = amplitudes[indice % ciclo] ?? 0;
      const valor =
        promedio +
        componente * Math.sin((indice * 2 * Math.PI) / ciclo) +
        pendiente * i;
      const fecha = new Date(ultimaFecha);
      fecha.setMonth(fecha.getMonth() + i);
      predicciones.push({ fecha, valor: Math.max(0, valor) });
    }

    return {
      modelo: "estacional",
      ciclo,
      amplitud,
      tendenciaBase: tendencia,
      r2,
      predicciones,
    };
  }

  /**
   * Proyección polinómica: y = a0 + a1*x + a2*x^2 + ... + an*x^n
   */
  proyectarPolinómico(
    datos: DatoPunto[],
    grado: number,
    periodosAdelante: number,
  ): ProyeccionPolinómica {
    if (datos.length < grado + 2) {
      throw new Error(`Se requieren al menos ${grado + 2} puntos de datos`);
    }

    const n = datos.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = datos.map((d) => d.valor);

    // Matriz de Vandermonde para regresión polinómica
    const A: number[][] = [];
    for (let i = 0; i < n; i++) {
      const xi = x[i];
      if (xi === undefined) continue;
      const fila: number[] = [];
      for (let j = 0; j <= grado; j++) {
        fila.push(Math.pow(xi, j));
      }
      A.push(fila);
    }

    const coeficientes = this.resolverSistemaLineal(A, y);

    const predicciones_valores = y.map((_, i) => {
      let valor = 0;
      for (let j = 0; j <= grado; j++) {
        const coef = coeficientes[j];
        if (coef !== undefined) {
          valor += coef * Math.pow(i, j);
        }
      }
      return valor;
    });

    const r2 = this.calcularR2(y, predicciones_valores);

    const predicciones: DatoPunto[] = [];
    const ultimaFecha = datos[n - 1]?.fecha;
    if (!ultimaFecha) throw new Error("Datos vacíos");

    for (let i = 1; i <= periodosAdelante; i++) {
      let valor = 0;
      const indice = n - 1 + i;
      for (let j = 0; j <= grado; j++) {
        const coef = coeficientes[j];
        if (coef !== undefined) {
          valor += coef * Math.pow(indice, j);
        }
      }
      const fecha = new Date(ultimaFecha);
      fecha.setMonth(fecha.getMonth() + i);
      predicciones.push({ fecha, valor: Math.max(0, valor) });
    }

    return {
      modelo: "polinómico",
      grado,
      coeficientes,
      r2,
      predicciones,
    };
  }

  /**
   * Calcula R² (coeficiente de determinación)
   * R² = 1 - (SS_res / SS_tot)
   */
  calcularR2(actual: number[], predicho: number[]): number {
    if (actual.length !== predicho.length) {
      throw new Error("Datos y predicciones deben tener la misma longitud");
    }

    const media = actual.reduce((a, b) => a + b, 0) / actual.length;
    const ssTot = actual.reduce((a, v) => a + (v - media) ** 2, 0);
    const ssRes = actual.reduce((a, v, i) => a + (v - (predicho[i] ?? 0)) ** 2, 0);

    if (ssTot === 0) return 1;
    return 1 - ssRes / ssTot;
  }

  /**
   * Detecta tendencia alcista/bajista/lateral
   */
  detectarTendencia(datos: DatoPunto[]): Tendencia {
    if (datos.length < 2) return "lateral";

    const n = datos.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = datos.map((d) => d.valor);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, v, i) => a + v * (y[i] ?? 0), 0);
    const sumX2 = x.reduce((a, v) => a + v * v, 0);

    const pendiente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Calcular pendiente relativa al promedio
    const promedio = sumY / n;
    const pendienteRelativa = promedio > 0 ? Math.abs(pendiente) / promedio : Math.abs(pendiente);
    const umbral = 0.05; // 5% de cambio relativo por período

    if (pendiente > 0 && pendienteRelativa > umbral) return "alcista";
    if (pendiente < 0 && pendienteRelativa > umbral) return "bajista";
    return "lateral";
  }

  /**
   * Resuelve sistema lineal Ax = b usando Gauss
   */
  private resolverSistemaLineal(A: number[][], b: number[]): number[] {
    const n = A.length;
    const m = A[0]?.length ?? 0; // número de incógnitas
    const matriz = A.map((fila, i) => [...fila, b[i] ?? 0]);

    // Eliminación hacia adelante
    for (let i = 0; i < n; i++) {
      let maxFila = i;
      for (let k = i + 1; k < n; k++) {
        const valK = Math.abs((matriz[k]?.[i]) ?? 0);
        const valMax = Math.abs((matriz[maxFila]?.[i]) ?? 0);
        if (valK > valMax) {
          maxFila = k;
        }
      }

      const temp = matriz[i];
      const filaMax = matriz[maxFila];
      if (temp && filaMax) {
        matriz[i] = filaMax;
        matriz[maxFila] = temp;
      }

      for (let k = i + 1; k < n; k++) {
        const filaK = matriz[k];
        const filaI = matriz[i];
        if (!filaK || !filaI) continue;

        const factor = (filaK[i] ?? 0) / (filaI[i] ?? 1);
        for (let j = i; j <= n; j++) {
          filaK[j] = (filaK[j] ?? 0) - factor * (filaI[j] ?? 0);
        }
      }
    }

    // Sustitución hacia atrás
    const x: number[] = new Array(m).fill(0);

    for (let i = Math.min(n - 1, m - 1); i >= 0; i--) {
      const fila = matriz[i];
      if (!fila) continue;

      let valor = fila[m] ?? 0; // Última columna es el término independiente
      for (let j = i + 1; j < m; j++) {
        const xj = x[j];
        valor -= (fila[j] ?? 0) * (xj ?? 0);
      }
      x[i] = valor / (fila[i] ?? 1);
    }

    return x;
  }
}
