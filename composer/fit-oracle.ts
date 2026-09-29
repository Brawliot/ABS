/**
 * Oráculo de encaje: composición producida vs expected/<id>.json
 * Encaje duro: dominante + secundarios + políticas (salvo excepciones declaradas).
 */

import type { ComposerSuccess } from "./types.js";
import type { ArchetypeId } from "../archetypes/types.js";

export interface ExpectedCompositionDoc {
  readonly profileId: string;
  readonly processes?: readonly {
    readonly dominant?: string;
    readonly secondaries?: readonly {
      readonly secondaryArchetypeId: string;
      readonly bornInDominantState?: string;
      readonly bloquea?: string;
    }[];
    readonly direction?: string;
  }[];
  readonly policies?: readonly {
    readonly plantilla: string;
  }[];
  readonly composerMustAsk?: readonly {
    readonly id?: string;
    readonly field: string;
  }[];
  readonly oracleFailIf?: readonly {
    readonly code: string;
    readonly when?: string;
    readonly message?: string;
  }[];
}

export interface FitFinding {
  readonly code: string;
  readonly severity: "hit" | "miss" | "fail";
  readonly message: string;
  readonly exceptionId?: string;
}

export interface FitReport {
  readonly profileId: string;
  readonly ok: boolean;
  readonly findings: readonly FitFinding[];
  readonly summary: {
    readonly dominantHit: boolean;
    readonly secondariesHit: number;
    readonly secondariesExpected: number;
    readonly policiesHit: number;
    readonly policiesExpected: number;
    readonly questionsHit: number;
    readonly questionsExpected: number;
  };
}

/**
 * Huecos conocidos: no hacen fallar el oráculo duro.
 * Cualquier otro SECONDARY_MISS / POLICY_MISS / DOMINANT_MISS → fail.
 */
export interface OracleException {
  readonly id: string;
  readonly profileId: string | "*";
  readonly code: "SECONDARY_MISS" | "POLICY_MISS" | "ASK_MISS" | "EXTENSION";
  /** Clave de plantilla o secondaryArchetypeId o field. */
  readonly key: string;
  readonly reason: string;
}

export const ORACLE_EXCEPTIONS: readonly OracleException[] = [
  {
    id: "ex.facturacion_agregada",
    profileId: "p03-ferreteria",
    code: "EXTENSION",
    key: "facturacion_agregada",
    reason: "Extensión no tipada en núcleo",
  },
  {
    id: "ex.versionado_alcance",
    profileId: "p10-reformas",
    code: "EXTENSION",
    key: "versionado_alcance",
    reason: "Renegociación de alcance en servicio_proyecto no modelada",
  },
  {
    id: "ex.custodia",
    profileId: "p04-taller-mecanico",
    code: "EXTENSION",
    key: "custodia",
    reason: "Ciclo depósito vehículo — extensión de riesgo medio",
  },
  {
    id: "ex.lotes_p05",
    profileId: "p05-restaurante",
    code: "EXTENSION",
    key: "lotes",
    reason: "Lotes/caducidad no tipados",
  },
  {
    id: "ex.lotes_p07",
    profileId: "p07-tienda-online",
    code: "EXTENSION",
    key: "lotes",
    reason: "Lotes/caducidad no tipados",
  },
  {
    id: "ex.filtro_sensible",
    profileId: "*",
    code: "EXTENSION",
    key: "filtro_dato_sensible",
    reason: "Filtro PII — riesgo medio; no compuesto",
  },
  {
    id: "ex.plazos_externos",
    profileId: "p06-gestoria",
    code: "EXTENSION",
    key: "plazos_externos",
    reason: "Plazos fiscales externos no compuestos",
  },
  {
    id: "ex.subcontrata_secundaria",
    profileId: "p10-reformas",
    code: "SECONDARY_MISS",
    key: "servicio_proyecto",
    reason:
      "Subcontrata no puede ser secundaria del mismo arquetipo (SECONDARY_EQUALS_DOMINANT); proceso standalone + falta linked-transaction",
  },
  {
    id: "ex.matricula_no_reembolsable",
    profileId: "p09-academia-idiomas",
    code: "POLICY_MISS",
    key: "matricula_no_reembolsable",
    reason: "Plantilla prosa de 1 perfil; no ampliada al catálogo multi-perfil",
  },
];

/** Alias expected plantilla prosa ↔ tpl.* */
const PLANTILLA_ALIASES: Readonly<Record<string, readonly string[]>> = {
  evidence_requirement: ["evidence_requirement", "evidencia_requerida"],
  evidencia_requerida: ["evidence_requirement", "evidencia_requerida"],
  restriction_entrega_sin_saldo: [
    "restriction_entrega_sin_saldo",
    "restriccion_saldo_antes_de",
  ],
  restriccion_saldo_antes_de: [
    "restriction_entrega_sin_saldo",
    "restriccion_saldo_antes_de",
  ],
  fianza_grupo: ["fianza_grupo", "fianza_condicional", "fianza_retencion"],
  fianza_retencion: ["fianza_grupo", "fianza_condicional", "fianza_retencion"],
  fianza_condicional: ["fianza_grupo", "fianza_condicional", "fianza_retencion"],
  permiso_excepcion: ["permiso_excepcion"],
  limite_plazos_propios: [
    "limite_plazos_propios",
    "limite_plazos_financiacion",
  ],
  limite_plazos_financiacion: [
    "limite_plazos_propios",
    "limite_plazos_financiacion",
  ],
  hitos_pago: ["hitos_pago"],
};

function primaryExpected(doc: ExpectedCompositionDoc): {
  dominant: ArchetypeId;
  secondaries: {
    secondaryArchetypeId: string;
    bornInDominantState?: string;
    bloquea?: string;
  }[];
} {
  const main = doc.processes?.[0];
  return {
    dominant: (main?.dominant ?? "venta") as ArchetypeId,
    secondaries: [...(main?.secondaries ?? [])],
  };
}

function plantillaKey(p: string): string {
  return p.replace(/^tpl\./, "");
}

function plantillaMatches(expected: string, produced: string): boolean {
  const e = plantillaKey(expected);
  const pr = plantillaKey(produced);
  if (e === pr) return true;
  const aliases = PLANTILLA_ALIASES[e];
  if (aliases && aliases.includes(pr)) return true;
  const rev = PLANTILLA_ALIASES[pr];
  if (rev && rev.includes(e)) return true;
  return false;
}

function isExcepted(
  profileId: string,
  code: OracleException["code"],
  key: string,
): OracleException | undefined {
  return ORACLE_EXCEPTIONS.find(
    (ex) =>
      (ex.profileId === profileId || ex.profileId === "*") &&
      ex.code === code &&
      (ex.key === key || ex.key === plantillaKey(key)),
  );
}

/**
 * Compara ComposerSuccess con expected JSON.
 * ok=false si hay severity=fail no exceptuada.
 */
export function runCompositionFitOracle(
  produced: ComposerSuccess,
  expected: ExpectedCompositionDoc,
): FitReport {
  const findings: FitFinding[] = [];
  const exp = primaryExpected(expected);

  const dominantHit = produced.dominant === exp.dominant;
  findings.push({
    code: dominantHit ? "DOMINANT_HIT" : "DOMINANT_MISS",
    severity: dominantHit ? "hit" : "fail",
    message: dominantHit
      ? `dominante ${produced.dominant}`
      : `dominante producido=${produced.dominant} esperado=${exp.dominant}`,
  });

  const prodSecs = produced.composition?.secondaries ?? [];
  let secondariesHit = 0;
  for (const es of exp.secondaries) {
    const hit = prodSecs.find(
      (s) => s.secondaryArchetypeId === es.secondaryArchetypeId,
    );
    if (hit) {
      secondariesHit++;
      const bindingOk =
        (!es.bornInDominantState ||
          hit.bornInDominantState === es.bornInDominantState) &&
        (!es.bloquea || hit.bloquea === es.bloquea);
      findings.push({
        code: bindingOk ? "SECONDARY_HIT" : "SECONDARY_BINDING_MISS",
        severity: bindingOk ? "hit" : "fail",
        message: bindingOk
          ? `secundaria ${es.secondaryArchetypeId} ${hit.bornInDominantState}→${hit.bloquea}`
          : `secundaria ${es.secondaryArchetypeId} binding distinto (prod ${hit.bornInDominantState}→${hit.bloquea})`,
      });
    } else {
      const ex = isExcepted(
        expected.profileId,
        "SECONDARY_MISS",
        es.secondaryArchetypeId,
      );
      findings.push({
        code: "SECONDARY_MISS",
        severity: ex ? "miss" : "fail",
        message: ex
          ? `falta secundaria ${es.secondaryArchetypeId} (excepción ${ex.id}: ${ex.reason})`
          : `falta secundaria ${es.secondaryArchetypeId}`,
        ...(ex ? { exceptionId: ex.id } : {}),
      });
    }
  }

  for (const ps of prodSecs) {
    const wanted = exp.secondaries.some(
      (e) => e.secondaryArchetypeId === ps.secondaryArchetypeId,
    );
    if (
      !wanted &&
      exp.secondaries.length === 0 &&
      ps.secondaryArchetypeId === "financiera"
    ) {
      findings.push({
        code: "UNEXPECTED_FINANCIERA",
        severity: "fail",
        message: "financiera secundaria no esperada",
      });
    }
  }

  const expPolicies = expected.policies ?? [];
  let policiesHit = 0;
  for (const ep of expPolicies) {
    const key = plantillaKey(ep.plantilla);
    const hit = produced.policyTemplates.some((t) =>
      plantillaMatches(ep.plantilla, t.plantilla),
    );
    if (hit) {
      policiesHit++;
      findings.push({
        code: "POLICY_HIT",
        severity: "hit",
        message: `política ${key}`,
      });
    } else {
      const ex = isExcepted(expected.profileId, "POLICY_MISS", key);
      findings.push({
        code: "POLICY_MISS",
        severity: ex ? "miss" : "fail",
        message: ex
          ? `falta política ${key} (excepción ${ex.id}: ${ex.reason})`
          : `falta política ${key}`,
        ...(ex ? { exceptionId: ex.id } : {}),
      });
    }
  }

  const mustAsk = expected.composerMustAsk ?? [];
  let questionsHit = 0;
  for (const q of mustAsk) {
    const hit = produced.questions.some(
      (pq) =>
        pq.field === q.field ||
        pq.field.endsWith(q.field) ||
        q.field.endsWith(pq.field.replace(/^cobros\./, "")),
    );
    if (hit) {
      questionsHit++;
      findings.push({
        code: "ASK_HIT",
        severity: "hit",
        message: `pregunta ${q.field}`,
      });
    } else {
      const ex = isExcepted(expected.profileId, "ASK_MISS", q.field);
      findings.push({
        code: "ASK_MISS",
        severity: ex ? "miss" : "fail",
        message: `falta pregunta ${q.field}`,
        ...(ex ? { exceptionId: ex.id } : {}),
      });
    }
  }

  for (const fail of expected.oracleFailIf ?? []) {
    if (fail.code.includes("CHOSE") || fail.code.includes("WITHOUT_ASK")) {
      const fieldHint = fail.when ?? fail.message ?? "";
      const relatedAsk = mustAsk.find((m) =>
        fieldHint
          .toLowerCase()
          .includes(m.field.toLowerCase().split(".").pop()!),
      );
      if (relatedAsk) {
        const asked = produced.questions.some((q) =>
          q.field.includes(relatedAsk.field.split(".").pop()!),
        );
        if (
          !asked &&
          prodSecs.length > 0 &&
          relatedAsk.field.includes("aPlazos")
        ) {
          findings.push({
            code: fail.code,
            severity: "fail",
            message: fail.message ?? "eligió sin preguntar",
          });
        }
      }
    }
    if (fail.code === "UNEXPECTED_FINANCIERA_SECONDARY") {
      if (prodSecs.some((s) => s.secondaryArchetypeId === "financiera")) {
        findings.push({
          code: fail.code,
          severity: "fail",
          message: fail.message ?? "financiera inesperada",
        });
      }
    }
    if (fail.code === "UNEXPECTED_FINANCIERA_HITOS") {
      if (prodSecs.some((s) => s.secondaryArchetypeId === "financiera")) {
        findings.push({
          code: fail.code,
          severity: "fail",
          message: fail.message ?? "hitos no deben modelarse como financiera",
        });
      }
    }
  }

  const hardFails = findings.filter((f) => f.severity === "fail");
  const ok = hardFails.length === 0;

  return {
    profileId: expected.profileId,
    ok,
    findings,
    summary: {
      dominantHit,
      secondariesHit,
      secondariesExpected: exp.secondaries.length,
      policiesHit,
      policiesExpected: expPolicies.length,
      questionsHit,
      questionsExpected: mustAsk.length,
    },
  };
}
