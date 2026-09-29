/**
 * Aprendiz bayesiano incremental por TIPO de objeto (no por instancia).
 *
 * - Salidas / tasas: Dirichlet (Beta si binario) — solo estadísticas suficientes.
 * - Tiempos de permanencia: Gamma (shape/rate) — solo estadísticas suficientes.
 * - Escribe únicamente en el perfil; no muta gramática ni otros aprendices.
 */

import type { DomainEvent } from "../core/events.js";
import type {
  IncrementalLearner,
  ProfileObservation,
  ProfileSnapshot,
} from "../core/profile.js";

export type ObjectTypeKey = string;

/** Fuerza del prior al mapear una media [0,1] a Beta(α,β). */
const PRIOR_STRENGTH = 2;

/** Estadísticas suficientes exportables (sin eventos ni Partes). */
export interface SufficientStats {
  readonly objectType: ObjectTypeKey;
  readonly binary: Readonly<Record<string, { alpha: number; beta: number }>>;
  readonly exits: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly dwells: Readonly<
    Record<string, { shape: number; rate: number }>
  >;
}

interface BetaStats {
  alpha: number;
  beta: number;
}

interface DirichletStats {
  /** Conteos / alphas por categoría (destino de salida, etc.). */
  alphas: Record<string, number>;
}

interface GammaStats {
  /** Forma α (shape). */
  shape: number;
  /** Tasa β (rate); media = shape/rate. */
  rate: number;
}

export interface BayesianLearnerOptions {
  /** Medias iniciales [0,1] por señal binaria (p. ej. tasa_cierre: 0.55). */
  readonly binaryPriors?: Readonly<Record<string, number>>;
  /** Alphas Dirichlet iniciales por familia de salidas: exit:{fromState} → {to: α}. */
  readonly exitPriors?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Priors Gamma (shape, rate) por estado: dwell:{stateId}. */
  readonly dwellPriors?: Readonly<Record<string, { shape: number; rate: number }>>;
}

/**
 * Destino de escritura del perfil. El aprendiz no tiene otra vía de salida.
 */
export class ProfileWriteSink {
  private version = 0;
  private updatedAt: string;
  private features: Record<string, number> = {};

  constructor() {
    this.updatedAt = new Date(0).toISOString();
  }

  write(at: string, features: Readonly<Record<string, number>>): void {
    this.version += 1;
    this.updatedAt = at;
    this.features = { ...features };
  }

  snapshot(): ProfileSnapshot {
    return {
      version: this.version,
      updatedAt: this.updatedAt,
      features: Object.freeze({ ...this.features }),
    };
  }
}

export class BayesianTypeLearner implements IncrementalLearner {
  private readonly binary = new Map<string, BetaStats>();
  private readonly exits = new Map<string, DirichletStats>();
  private readonly dwells = new Map<string, GammaStats>();
  private readonly sink = new ProfileWriteSink();

  /**
   * Destinos de escritura observados (solo "profile"). Sirve para auditar
   * que el aprendiz no escribe fuera del perfil.
   */
  readonly writeTargets: readonly string[] = ["profile"];

  constructor(
    readonly objectType: ObjectTypeKey,
    priors: Readonly<Record<string, number>> = {},
    options: BayesianLearnerOptions = {},
  ) {
    const binaryPriors = options.binaryPriors ?? priors;
    for (const [signal, mean] of Object.entries(binaryPriors)) {
      this.binary.set(signal, meanToBeta(mean));
    }
    for (const [key, alphas] of Object.entries(options.exitPriors ?? {})) {
      this.exits.set(key, { alphas: { ...alphas } });
    }
    for (const [key, g] of Object.entries(options.dwellPriors ?? {})) {
      this.dwells.set(key, { shape: g.shape, rate: g.rate });
    }
    this.flush(new Date(0).toISOString());
  }

  /** Actualiza estadísticas suficientes y reescribe solo el perfil. */
  observe(observation: ProfileObservation): void {
    const key = observation.signal;

    if (key.startsWith("exit:")) {
      const to =
        typeof observation.payload.to === "string"
          ? observation.payload.to
          : "unknown";
      this.observeExit(key, to);
    } else if (key.startsWith("dwell:")) {
      const duration =
        typeof observation.payload.duration === "number"
          ? observation.payload.duration
          : typeof observation.payload.value === "number"
            ? observation.payload.value
            : 1;
      this.observeDwell(key, Math.max(duration, 1e-9));
    } else {
      const success =
        typeof observation.payload.success === "boolean"
          ? observation.payload.success
          : typeof observation.payload.value === "number"
            ? observation.payload.value >= 0.5
            : true;
      this.observeBinary(key, success);
    }

    this.flush(observation.at);
  }

  observeBinary(signal: string, success: boolean): void {
    let stats = this.binary.get(signal);
    if (!stats) {
      stats = meanToBeta(0.5);
      this.binary.set(signal, stats);
    }
    if (success) stats.alpha += 1;
    else stats.beta += 1;
  }

  /** Dirichlet: una categoría (destino) recibe +1. */
  observeExit(fromKey: string, toCategory: string): void {
    let stats = this.exits.get(fromKey);
    if (!stats) {
      stats = { alphas: {} };
      this.exits.set(fromKey, stats);
    }
    stats.alphas[toCategory] = (stats.alphas[toCategory] ?? 1) + 1;
  }

  /** Gamma shape-rate: tras observar duración t, shape+=1, rate+=t. */
  observeDwell(stateKey: string, duration: number): void {
    let stats = this.dwells.get(stateKey);
    if (!stats) {
      stats = { shape: 1, rate: 1 };
      this.dwells.set(stateKey, stats);
    }
    stats.shape += 1;
    stats.rate += duration;
  }

  /** Escucha el flujo de eventos; solo escribe en el perfil de este tipo. */
  onEvent(event: DomainEvent): void {
    if (event.kind === "transicion" || event.kind === "excepcion") {
      this.observeExit(`exit:${event.fromStateId}`, event.toStateId);
      this.observeBinary(
        "tasa_cierre",
        event.toStateId === "cerrada" || event.kind === "transicion",
      );
      if (event.kind === "excepcion") {
        this.observeBinary("tasa_cancelacion", event.toStateId === "cancelada");
        this.observeBinary(
          "tasa_incumplimiento",
          event.toStateId === "incumplida",
        );
      }
    } else if (event.kind === "modificacion") {
      this.observeBinary("tasa_cierre", false);
    }
    this.flush(event.occurredAt);
  }

  snapshot(): ProfileSnapshot {
    return this.sink.snapshot();
  }

  /** Medias posteriores (solo lectura de estadísticas suficientes). */
  posteriorMean(signal: string): number | undefined {
    const b = this.binary.get(signal);
    if (b) return b.alpha / (b.alpha + b.beta);
    const d = this.exits.get(signal);
    if (d) {
      const total = Object.values(d.alphas).reduce((s, a) => s + a, 0);
      return total > 0 ? 1 / Object.keys(d.alphas).length : undefined;
    }
    const g = this.dwells.get(signal);
    if (g && g.rate > 0) return g.shape / g.rate;
    return undefined;
  }

  exitProbabilities(fromKey: string): Readonly<Record<string, number>> {
    const stats = this.exits.get(fromKey);
    if (!stats) return {};
    const total = Object.values(stats.alphas).reduce((s, a) => s + a, 0);
    if (total <= 0) return {};
    const out: Record<string, number> = {};
    for (const [k, a] of Object.entries(stats.alphas)) {
      out[k] = a / total;
    }
    return out;
  }

  /** Confirma que el único destino de escritura es el sink de perfil. */
  writesOnlyToProfile(): boolean {
    return (
      this.writeTargets.length === 1 && this.writeTargets[0] === "profile"
    );
  }

  /**
   * Estadísticas suficientes para agregación multiempresa.
   * Nunca incluye eventos, Partes ni identificadores de instancia.
   */
  exportSufficientStats(): SufficientStats {
    const binary: Record<string, { alpha: number; beta: number }> = {};
    for (const [k, v] of this.binary) {
      binary[k] = { alpha: v.alpha, beta: v.beta };
    }
    const exits: Record<string, Record<string, number>> = {};
    for (const [k, v] of this.exits) {
      exits[k] = { ...v.alphas };
    }
    const dwells: Record<string, { shape: number; rate: number }> = {};
    for (const [k, v] of this.dwells) {
      dwells[k] = { shape: v.shape, rate: v.rate };
    }
    return Object.freeze({
      objectType: this.objectType,
      binary: Object.freeze(binary),
      exits: Object.freeze(exits),
      dwells: Object.freeze(dwells),
    });
  }

  private flush(at: string): void {
    const features: Record<string, number> = {};
    for (const [signal, stats] of this.binary) {
      features[signal] = stats.alpha / (stats.alpha + stats.beta);
    }
    for (const [fromKey, stats] of this.exits) {
      const total = Object.values(stats.alphas).reduce((s, a) => s + a, 0);
      if (total <= 0) continue;
      for (const [to, a] of Object.entries(stats.alphas)) {
        features[`${fromKey}->${to}`] = a / total;
      }
    }
    for (const [stateKey, stats] of this.dwells) {
      if (stats.rate > 0) {
        features[stateKey] = stats.shape / stats.rate;
      }
    }
    this.sink.write(at, features);
  }
}

/**
 * Registro: un aprendiz por tipo. Nunca se consultan entre sí.
 */
export class LearnerRegistry {
  private readonly learners = new Map<ObjectTypeKey, BayesianTypeLearner>();

  getOrCreate(
    objectType: ObjectTypeKey,
    priors?: Readonly<Record<string, number>>,
  ): BayesianTypeLearner {
    let learner = this.learners.get(objectType);
    if (!learner) {
      learner = new BayesianTypeLearner(objectType, priors ?? {});
      this.learners.set(objectType, learner);
    }
    return learner;
  }

  /** Despacha un evento al aprendiz del tipo indicado (sin leer otros). */
  dispatch(objectType: ObjectTypeKey, event: DomainEvent): void {
    const learner = this.learners.get(objectType);
    if (!learner) return;
    learner.onEvent(event);
  }

  snapshot(objectType: ObjectTypeKey): ProfileSnapshot | undefined {
    return this.learners.get(objectType)?.snapshot();
  }

  types(): readonly ObjectTypeKey[] {
    return [...this.learners.keys()];
  }
}

function meanToBeta(mean: number): BetaStats {
  const m = clamp01(mean);
  return {
    alpha: Math.max(m * PRIOR_STRENGTH, 1e-6),
    beta: Math.max((1 - m) * PRIOR_STRENGTH, 1e-6),
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
