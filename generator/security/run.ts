/**
 * Pase final: Revisor de seguridad (configuración generada).
 */

import type { GeneratorInput } from "../types.js";
import type { UiSpec } from "../../presentation/types.js";
import { findSupplierFraudSequences } from "./attacker.js";
import { resetProposalSeq } from "./propose.js";
import { runStaticRules } from "./rules.js";
import {
  SecurityDeliveryBlockedError,
  type SecurityReport,
} from "./types.js";

export interface RunSecurityOptions {
  readonly now?: string;
  readonly throwOnBlock?: boolean;
}

/**
 * Audita la configuración (RuleSet + UiSpec). No modifica capa 1.
 * Críticos ⇒ deliveryBlocked.
 */
export function runSecurityReview(
  input: GeneratorInput,
  spec: UiSpec,
  options: RunSecurityOptions = {},
): SecurityReport {
  resetProposalSeq();
  const started = Date.now();
  const now = options.now ?? input.generatedAt;

  const findings = [
    ...runStaticRules(input, spec),
    ...findSupplierFraudSequences(input, now),
  ];

  // Deduplicar por id
  const byId = new Map(findings.map((f) => [f.id, f]));
  const unique = [...byId.values()];
  const deliveryBlocked = unique.some((f) => f.severity === "critical");

  const report: SecurityReport = {
    version: "security-1.0.0",
    caseId: input.caseId,
    ranAt: now,
    durationMs: Date.now() - started,
    findings: unique,
    deliveryBlocked,
    proposals: unique.map((f) => f.proposal),
  };

  if (options.throwOnBlock && deliveryBlocked) {
    throw new SecurityDeliveryBlockedError(
      `Entrega bloqueada por seguridad: ${unique.filter((f) => f.severity === "critical").length} crítico(s)`,
      report,
    );
  }

  return report;
}

export function assertSecurityDeliverable(report: SecurityReport): void {
  if (report.deliveryBlocked) {
    throw new SecurityDeliveryBlockedError(
      `Entrega bloqueada por el Revisor de seguridad`,
      report,
    );
  }
}
