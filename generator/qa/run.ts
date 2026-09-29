/**
 * Pase final del Generador: Probador MVP.
 */

import type { GeneratorInput } from "../types.js";
import type { UiSpec } from "../../presentation/types.js";
import { collectFindings } from "./detect.js";
import {
  QA_MAX_DURATION_MS,
  QaDeliveryBlockedError,
  type QaReport,
} from "./types.js";
import {
  createWalkContext,
  exploreReachability,
  walkCreditSale,
  walkExceptions,
  walkHappyPath,
} from "./walk.js";
import { syntheticCreditFields } from "./synthetic.js";

export interface RunQaOptions {
  readonly now?: string;
  /** Si true, lanza QaDeliveryBlockedError cuando hay críticos. */
  readonly throwOnBlock?: boolean;
  /** Límite de tiempo (por defecto 5 min). */
  readonly maxDurationMs?: number;
}

/**
 * Ejecuta usuarios sintéticos sobre copia aislada del motor.
 * Hallazgos críticos ⇒ deliveryBlocked (bloquea la entrega).
 */
export function runQaPass(
  input: GeneratorInput,
  spec: UiSpec,
  options: RunQaOptions = {},
): QaReport {
  const started = Date.now();
  const now = options.now ?? input.generatedAt;
  const ctx = createWalkContext(input, now);
  const scenarios = [];

  // Venta con crédito (criterio concesionaria)
  scenarios.push(walkCreditSale(ctx, input, spec));

  // Camino feliz + excepciones por cada arquetipo/lifecycle
  for (const slice of input.lifecycles) {
    if (slice.archetypeId === "venta") {
      // credit-sale ya cubre el feliz de venta
      scenarios.push(...walkExceptions(ctx, slice, spec, `ex-${slice.id}`));
    } else {
      scenarios.push(
        walkHappyPath(
          ctx,
          slice,
          spec,
          `happy-${slice.id}`,
          syntheticCreditFields(),
        ),
      );
      scenarios.push(...walkExceptions(ctx, slice, spec, `ex-${slice.id}`));
    }
    exploreReachability(ctx, slice, spec);
  }

  const findings = collectFindings(input, spec, ctx, scenarios);
  const durationMs = Date.now() - started;
  const deliveryBlocked = findings.some((f) => f.severity === "critical");

  const report: QaReport = {
    version: "qa-1.0.0",
    caseId: input.caseId,
    ranAt: now,
    durationMs,
    findings,
    deliveryBlocked,
    scenarios,
    actionsEnabled: [...ctx.enabledActionIds].sort(),
    statesVisited: [...ctx.visitedStates].sort(),
  };

  const max = options.maxDurationMs ?? QA_MAX_DURATION_MS;
  if (durationMs > max) {
    // No bloquea por tiempo en el informe estándar; el test lo aserta.
    // Se deja durationMs visible.
  }

  if (options.throwOnBlock && deliveryBlocked) {
    throw new QaDeliveryBlockedError(
      `Entrega bloqueada: ${findings.filter((f) => f.severity === "critical").length} hallazgo(s) crítico(s)`,
      report,
    );
  }

  return report;
}

/**
 * Pase final acoplado al Generador: genera no aplica aquí;
 * valida la UiSpec ya producida y decide si se entrega.
 */
export function assertDeliverable(report: QaReport): void {
  if (report.deliveryBlocked) {
    throw new QaDeliveryBlockedError(
      `Entrega bloqueada por el Probador (${report.findings.filter((f) => f.severity === "critical").length} críticos)`,
      report,
    );
  }
}
