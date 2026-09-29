/**
 * Observabilidad: logs estructurados sin PII + métricas básicas.
 */

export type MetricName =
  | "transition_latency_ms"
  | "judge_rejection"
  | "error"
  | "llm_cost_eur";

const samples: Record<MetricName, number[]> = {
  transition_latency_ms: [],
  judge_rejection: [],
  error: [],
  llm_cost_eur: [],
};

const FORBIDDEN_LOG_KEYS = [
  "email",
  "taxId",
  "address",
  "phone",
  "password",
  "displayName",
  "ABS_SESSION_SECRET",
  "OPENAI_API_KEY",
];

export function recordMetric(name: MetricName, value: number): void {
  const arr = samples[name];
  arr.push(value);
  if (arr.length > 10_000) arr.splice(0, arr.length - 5_000);
}

export function percentile(name: MetricName, p: number): number | null {
  const arr = [...samples[name]].sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const idx = Math.min(arr.length - 1, Math.floor((p / 100) * arr.length));
  return arr[idx] ?? null;
}

export function structuredLog(
  level: "info" | "warn" | "error",
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (FORBIDDEN_LOG_KEYS.some((f) => k.toLowerCase().includes(f.toLowerCase()))) {
      safe[k] = "[redacted]";
    } else {
      safe[k] = v;
    }
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...safe,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function metricsSnapshot(): Readonly<Record<string, number | null>> {
  return {
    transition_p95_ms: percentile("transition_latency_ms", 95),
    judge_rejections: samples.judge_rejection.length,
    errors: samples.error.length,
    llm_cost_eur_sum: samples.llm_cost_eur.reduce((a, b) => a + b, 0),
  };
}
