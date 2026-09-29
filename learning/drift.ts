/**
 * Detector de deriva: alerta cuando el perfil cambia de forma sostenida,
 * distinguiendo el cambio real de la variación normal (ruido muestral).
 *
 * Usa una ventana reciente frente a una línea base fijada tras un periodo
 * de calentamiento. Exige N observaciones consecutivas fuera de banda
 * (media ± k·σ de la base) antes de alertar.
 */

export interface DriftAlert {
  readonly signal: string;
  readonly at: string;
  readonly baselineMean: number;
  readonly currentMean: number;
  readonly sustainedSteps: number;
  readonly band: { readonly low: number; readonly high: number };
}

export interface DriftDetectorOptions {
  /** Observaciones para fijar la línea base. */
  readonly burnIn?: number;
  /** Tamaño de la ventana reciente. */
  readonly windowSize?: number;
  /** Multiplicador de σ de la base para la banda de variación normal. */
  readonly sigmaMultiplier?: number;
  /** Mínimo absoluto de semi-ancho de banda (evita bandas degeneradas). */
  readonly minBand?: number;
  /** Pasos consecutivos fuera de banda para confirmar deriva. */
  readonly sustainCount?: number;
}

export class DriftDetector {
  private readonly burnIn: number;
  private readonly windowSize: number;
  private readonly sigmaMultiplier: number;
  private readonly minBand: number;
  private readonly sustainCount: number;

  private readonly history = new Map<string, number[]>();
  private readonly baseline = new Map<
    string,
    { mean: number; std: number; locked: boolean }
  >();
  private readonly outsideStreak = new Map<string, number>();
  private readonly alerted = new Set<string>();

  constructor(options: DriftDetectorOptions = {}) {
    this.burnIn = options.burnIn ?? 30;
    this.windowSize = options.windowSize ?? 20;
    this.sigmaMultiplier = options.sigmaMultiplier ?? 2.5;
    this.minBand = options.minBand ?? 0.08;
    this.sustainCount = options.sustainCount ?? 5;
  }

  /**
   * Alimenta la media posterior actual de una señal.
   * Devuelve alerta solo si el desplazamiento es sostenido (no un pico).
   */
  observe(signal: string, posteriorMean: number, at: string): DriftAlert | null {
    let hist = this.history.get(signal);
    if (!hist) {
      hist = [];
      this.history.set(signal, hist);
    }
    hist.push(posteriorMean);

    let base = this.baseline.get(signal);
    if (!base) {
      base = { mean: posteriorMean, std: 0, locked: false };
      this.baseline.set(signal, base);
    }

    if (!base.locked) {
      if (hist.length >= this.burnIn) {
        const sample = hist.slice(0, this.burnIn);
        base.mean = mean(sample);
        base.std = std(sample);
        base.locked = true;
      }
      return null;
    }

    const window = hist.slice(-this.windowSize);
    const currentMean = mean(window);
    const half =
      Math.max(base.std * this.sigmaMultiplier, this.minBand);
    const low = base.mean - half;
    const high = base.mean + half;
    const outside = currentMean < low || currentMean > high;

    const streak = outside ? (this.outsideStreak.get(signal) ?? 0) + 1 : 0;
    this.outsideStreak.set(signal, streak);

    if (streak >= this.sustainCount && !this.alerted.has(signal)) {
      this.alerted.add(signal);
      return {
        signal,
        at,
        baselineMean: base.mean,
        currentMean,
        sustainedSteps: streak,
        band: { low, high },
      };
    }
    return null;
  }

  /** Reinicia el seguimiento de una señal (p. ej. tras recalibrar). */
  reset(signal?: string): void {
    if (signal) {
      this.history.delete(signal);
      this.baseline.delete(signal);
      this.outsideStreak.delete(signal);
      this.alerted.delete(signal);
      return;
    }
    this.history.clear();
    this.baseline.clear();
    this.outsideStreak.clear();
    this.alerted.clear();
  }
}

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}
