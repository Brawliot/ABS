/**
 * Configuración de calidad Fase B — semillas y umbrales fijados ANTES de medir.
 */

/** Semillas CI por commit (properties). */
export const PROPERTY_SEEDS_CI = 200;

/** Semillas ejecución nocturna. */
export const PROPERTY_SEEDS_NIGHTLY = 2000;

/**
 * Nº de seeds activo: ABS_PROPERTY_SEEDS env, o nightly si ABS_NIGHTLY=1, si no CI.
 */
export function propertyNumRuns(): number {
  const env = process.env.ABS_PROPERTY_SEEDS;
  if (env && /^\d+$/.test(env)) return Number(env);
  if (process.env.ABS_NIGHTLY === "1") return PROPERTY_SEEDS_NIGHTLY;
  return PROPERTY_SEEDS_CI;
}

/** Semilla fija reproducible. */
export const PROPERTY_SEED = 0xa11ce;

/** Umbrales de rendimiento (acordados; no post-hoc). */
export const PERF_THRESHOLDS = {
  /** p95 transición con BD real (ms). */
  transitionP95MsWithRealDb: 200,
  /** Replay 100k eventos (ms). */
  replay100kMs: 10_000,
  /** Generación UiSpec mediana con LLM real (ms). */
  uiSpecGenMedianMsWithLlm: 30_000,
  /**
   * Generación UiSpec mediana SIN LLM (determinista, Generador puro).
   * Definido aparte según aprobación Fase A.
   */
  uiSpecGenMedianMsWithoutLlm: 2_000,
} as const;

export type QualityLevel =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9;

export type LevelStatus =
  | "executed"
  | "partial"
  | "not_built"
  | "blocked_adapter";
