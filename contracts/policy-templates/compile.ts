/**
 * Compilación determinista plantilla → políticas Capa 1.
 */

import type {
  BusinessPolicy,
  CompliancePolicy,
  FieldPredicate,
  PermissionPolicy,
} from "../../policies/types.js";
import type {
  PolicyTemplateId,
  PolicyTemplateInvocation,
} from "./types.js";
import { ALL_POLICY_TEMPLATE_IDS } from "./types.js";
import {
  hitoPaymentField,
  transitionIdForBloqueaState,
  type HitoPagoSpec,
} from "../../archetypes/milestones.js";

export class PolicyTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyTemplateError";
  }
}

export interface CompiledTemplates {
  readonly policies: readonly BusinessPolicy[];
  readonly compliance: readonly CompliancePolicy[];
  readonly permissions: readonly PermissionPolicy[];
}

function num(params: PolicyTemplateInvocation["parametros"], key: string): number {
  const v = params[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  throw new PolicyTemplateError(`Plantilla: falta número "${key}"`);
}

function str(
  params: PolicyTemplateInvocation["parametros"],
  key: string,
  fallback?: string,
): string {
  const v = params[key];
  if (typeof v === "string" && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new PolicyTemplateError(`Plantilla: falta string "${key}"`);
}

function transitionOf(inv: PolicyTemplateInvocation, fallback: string): string {
  if (inv.transitionId) return inv.transitionId;
  const t = inv.parametros.transitionId;
  if (typeof t === "string" && t.length > 0) return t;
  return fallback;
}

function emptyCompiled(): CompiledTemplates {
  return { policies: [], compliance: [], permissions: [] };
}

/** Compila una invocación a 1+ políticas. Determinista. */
export function compilePolicyTemplate(
  inv: PolicyTemplateInvocation,
): CompiledTemplates {
  if (!(ALL_POLICY_TEMPLATE_IDS as readonly string[]).includes(inv.plantilla)) {
    throw new PolicyTemplateError(`Plantilla desconocida: ${inv.plantilla}`);
  }

  switch (inv.plantilla as PolicyTemplateId) {
    case "tpl.descuento_maximo_sin_aprobacion": {
      const pct = num(inv.parametros, "porcentaje");
      const transitionId = transitionOf(inv, "t_aceptar");
      const restriction: FieldPredicate = {
        field: "descuento_pct",
        op: "gt",
        value: pct,
      };
      const policy: BusinessPolicy = {
        id: inv.id,
        kind: "politica",
        transitionId,
        restriction,
      };
      return { policies: [policy], compliance: [], permissions: [] };
    }
    case "tpl.importe_requiere_aprobacion": {
      const importe = num(inv.parametros, "importe_eur");
      const aprueba = str(inv.parametros, "aprueba");
      const transitionId = transitionOf(inv, "t_aceptar");
      const policy: BusinessPolicy = {
        id: inv.id,
        kind: "politica",
        transitionId,
        condition: { field: "importe", op: "present" },
        approval: {
          when: { field: "importe", op: "gte", value: importe },
          requiredRole: aprueba,
          transitionId,
        },
      };
      return { policies: [policy], compliance: [], permissions: [] };
    }
    case "tpl.limite_credito_por_cliente": {
      const limite = num(inv.parametros, "por_defecto_eur");
      const transitionId = transitionOf(inv, "t_aceptar");
      // Critico: parteId debe resolverse con $fields.* ({{parte_id}} era literal
      // y el hecho leía saldo 0 → nunca bloqueaba). amountField=importe para que
      // saldo + nueva venta no supere el límite.
      const policy: BusinessPolicy = {
        id: inv.id,
        kind: "politica",
        transitionId,
        factRestriction: {
          factId: "parte.saldo_pendiente",
          params: { parteId: "$fields.parte_id" },
          amountField: "importe",
          op: "gt",
          value: limite,
        },
      };
      return { policies: [policy], compliance: [], permissions: [] };
    }
    case "tpl.bloqueo_por_impago": {
      const useRecibos =
        typeof inv.parametros.recibos_pendientes === "number";
      const dias = useRecibos
        ? num(inv.parametros, "recibos_pendientes")
        : num(inv.parametros, "dias");
      const transitionId = transitionOf(inv, "t_aceptar");
      const field = useRecibos ? "recibos_pendientes" : "dias_impago";
      const policy: BusinessPolicy = {
        id: inv.id,
        kind: "politica",
        transitionId,
        condition: { field, op: "present" },
        restriction: { field, op: "gte", value: dias },
      };
      return { policies: [policy], compliance: [], permissions: [] };
    }
    case "tpl.plazo_devolucion": {
      const dias = num(inv.parametros, "dias");
      const transitionId = transitionOf(inv, "t_cerrar");
      const anchor = str(inv.parametros, "anchorField", "compra_at");
      const compliance: CompliancePolicy = {
        id: inv.id,
        kind: "cumplimiento",
        transitionId,
        legalDeadline: {
          anchorField: anchor,
          durationMs: dias * 24 * 60 * 60 * 1000,
          description: `Plazo de devolución / desistimiento ${dias} días`,
        },
      };
      return { policies: [], compliance: [compliance], permissions: [] };
    }
    case "tpl.aviso_plazo": {
      const diasAntes = num(inv.parametros, "dias_antes");
      const transitionId = transitionOf(inv, "t_cerrar");
      // Documenta el aviso; no genera guardas. Runtime: buildAvisoPlazoInsight + Priorizador.
      const compliance: CompliancePolicy = {
        id: inv.id,
        kind: "cumplimiento",
        transitionId,
        avisoPlazo: {
          diasAntes,
          description: `Aviso al responsable ${diasAntes} días antes del vencimiento (Priorizador)`,
        },
      };
      return { policies: [], compliance: [compliance], permissions: [] };
    }
    case "tpl.restriccion_saldo_antes_de": {
      // Rechaza la transición si la Parte tiene impagos (entrega con deuda).
      // Deuda = transacciones en impago, no las que siguen en curso: en los
      // arquetipos el cobro va con el cierre, así que un trabajo abierto no es
      // deuda (contarlo bloqueaba mutuamente dos trabajos del mismo cliente).
      const transitionId = transitionOf(inv, "t_cerrar");
      const policy: BusinessPolicy = {
        id: inv.id,
        kind: "politica",
        transitionId,
        requiredFacts: [
          {
            factId: "parte.importe_impagado",
            params: { parteId: "$fields.parte_id", excludeSubjectId: "$fields.subject_id" },
          },
        ],
        factRestriction: {
          factId: "parte.importe_impagado",
          params: { parteId: "$fields.parte_id", excludeSubjectId: "$fields.subject_id" },
          op: "gt",
          value: 0,
        },
      };
      return { policies: [policy], compliance: [], permissions: [] };
    }
    case "tpl.evidencia_requerida": {
      const transitionId = transitionOf(inv, "t_acordar");
      const evidence =
        typeof inv.parametros.evidence === "string"
          ? inv.parametros.evidence
          : typeof inv.parametros.referencia === "string"
            ? inv.parametros.referencia
            : "documento";
      const kindRaw =
        typeof inv.parametros.kind === "string" ? inv.parametros.kind : "aceptacion";
      const kind =
        kindRaw === "fisica" || kindRaw === "sistema" || kindRaw === "aceptacion"
          ? kindRaw
          : "aceptacion";
      const compliance: CompliancePolicy = {
        id: inv.id,
        kind: "cumplimiento",
        transitionId,
        requiredEvidence: {
          kind,
          referenceType: evidence,
        },
      };
      return { policies: [], compliance: [compliance], permissions: [] };
    }
    case "tpl.fianza_condicional": {
      const umbral =
        typeof inv.parametros.umbral === "number"
          ? inv.parametros.umbral
          : typeof inv.parametros.umbral_comensales === "number"
            ? inv.parametros.umbral_comensales
            : typeof inv.parametros.umbralComensales === "number"
              ? inv.parametros.umbralComensales
              : num(inv.parametros, "N");
      const transitionId = transitionOf(inv, "t_reservar");
      const field =
        typeof inv.parametros.campo === "string"
          ? inv.parametros.campo
          : "tamano_grupo";
      // Solo restricción: el umbral (p. ej. retención/tamaño) se evalúa en runtime
      // vía campos del formulario; no exigir condition gte como guarda obligatoria.
      const policy: BusinessPolicy = {
        id: inv.id,
        kind: "politica",
        transitionId,
        restriction: { field: "fianza_eur", op: "lte", value: 0 },
      };
      return { policies: [policy], compliance: [], permissions: [] };
    }
    case "tpl.permiso_excepcion": {
      const role =
        typeof inv.parametros.rol === "string"
          ? inv.parametros.rol
          : typeof inv.parametros.aprueba === "string"
            ? inv.parametros.aprueba
            : "dueno";
      const transitionId = transitionOf(inv, "t_cancelar");
      const permission: PermissionPolicy = {
        id: inv.id,
        kind: "permiso",
        action: "ejecutar",
        transitionId,
        allowedRoles: [role],
      };
      return { policies: [], compliance: [], permissions: [permission] };
    }
    case "tpl.limite_plazos_financiacion": {
      const maxMeses =
        typeof inv.parametros.meses_max_sin_aprobacion === "number"
          ? inv.parametros.meses_max_sin_aprobacion
          : typeof inv.parametros.max_meses === "number"
            ? inv.parametros.max_meses
            : typeof inv.parametros.meses === "number"
              ? inv.parametros.meses
              : num(inv.parametros, "limite_meses");
      const transitionId = transitionOf(inv, "t_aprobar");
      const policy: BusinessPolicy = {
        id: inv.id,
        kind: "politica",
        transitionId,
        restriction: { field: "plazos_meses", op: "gt", value: maxMeses },
      };
      return { policies: [policy], compliance: [], permissions: [] };
    }
    case "tpl.hitos_pago": {
      const hitos = parseHitosFromParams(inv.parametros);
      const policies: BusinessPolicy[] = hitos.map((h, i) => {
        const transitionId =
          h.transitionId ??
          transitionIdForBloqueaState(h.bloqueaStateId) ??
          transitionOf(inv, "t_ejecutar");
        const field = h.paymentField ?? hitoPaymentField(h.id, i);
        return {
          id: `${inv.id}:${h.id}`,
          kind: "politica",
          transitionId,
          condition: { field, op: "eq", value: true },
        };
      });
      const compliance: CompliancePolicy = {
        id: inv.id,
        kind: "cumplimiento",
        transitionId: transitionOf(inv, "t_ejecutar"),
        dataRetention: {
          description:
            "Hitos de pago = compromisos pagar + bloqueos de fase (condiciones compiladas en políticas)",
        },
      };
      return { policies, compliance: [compliance], permissions: [] };
    }
    default: {
      const _exhaustive: never = inv.plantilla as never;
      throw new PolicyTemplateError(`No implementada: ${String(_exhaustive)}`);
    }
  }
}

/** Compila un lote de plantillas (orden estable por id). */
export function compilePolicyTemplates(
  invocations: readonly PolicyTemplateInvocation[],
): CompiledTemplates {
  const policies: BusinessPolicy[] = [];
  const compliance: CompliancePolicy[] = [];
  const permissions: PermissionPolicy[] = [];
  const sorted = [...invocations].sort((a, b) => a.id.localeCompare(b.id));
  for (const inv of sorted) {
    const c = compilePolicyTemplate(inv);
    policies.push(...c.policies);
    compliance.push(...c.compliance);
    permissions.push(...c.permissions);
  }
  return { policies, compliance, permissions };
}

/** Campos de catálogo que exige cada plantilla al compilar. */
export function catalogFieldsForTemplate(
  inv: PolicyTemplateInvocation,
): readonly string[] {
  switch (inv.plantilla as PolicyTemplateId) {
    case "tpl.descuento_maximo_sin_aprobacion":
      return ["descuento_pct"];
    case "tpl.importe_requiere_aprobacion":
      return ["importe"];
    case "tpl.limite_credito_por_cliente":
      return ["parte_id", "importe"];
    case "tpl.bloqueo_por_impago":
      return [
        typeof inv.parametros.recibos_pendientes === "number"
          ? "recibos_pendientes"
          : "dias_impago",
      ];
    case "tpl.plazo_devolucion": {
      const anchor =
        typeof inv.parametros.anchorField === "string"
          ? inv.parametros.anchorField
          : "compra_at";
      return [anchor];
    }
    case "tpl.aviso_plazo":
      return [];
    case "tpl.restriccion_saldo_antes_de":
      return ["parte_id"];
    case "tpl.evidencia_requerida":
      return [];
    case "tpl.fianza_condicional":
      return [
        typeof inv.parametros.campo === "string"
          ? inv.parametros.campo
          : "tamano_grupo",
        "fianza_eur",
      ];
    case "tpl.permiso_excepcion":
      return [];
    case "tpl.limite_plazos_financiacion":
      return ["plazos_meses"];
    case "tpl.hitos_pago":
      return parseHitosFromParams(inv.parametros).flatMap((h, i) => [
        h.paymentField ?? hitoPaymentField(h.id, i),
      ]);
    default: {
      const _exhaustive: never = inv.plantilla as never;
      return _exhaustive;
    }
  }
}

export function catalogFieldsForTemplates(
  invocations: readonly PolicyTemplateInvocation[],
): readonly string[] {
  const set = new Set<string>();
  for (const inv of invocations) {
    for (const f of catalogFieldsForTemplate(inv)) set.add(f);
  }
  return [...set].sort();
}

interface HitoCompileSpec {
  readonly id: string;
  readonly fase?: string;
  readonly bloqueaStateId: string;
  readonly bornInDominantState?: string;
  readonly transitionId?: string;
  readonly paymentField?: string;
}

function parseHitosFromParams(
  params: PolicyTemplateInvocation["parametros"],
): readonly HitoCompileSpec[] {
  const raw = params.hitosJson;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new PolicyTemplateError(
      "tpl.hitos_pago requiere hitosJson (lista de hitos del compositor)",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PolicyTemplateError("tpl.hitos_pago: hitosJson inválido");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new PolicyTemplateError("tpl.hitos_pago: al menos un hito");
  }
  return parsed.map((item, i) => {
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : `h${i + 1}`;
    const bloqueaStateId =
      typeof o.bloqueaStateId === "string"
        ? o.bloqueaStateId
        : typeof o.bloquea === "string"
          ? o.bloquea
          : "";
    if (!bloqueaStateId) {
      throw new PolicyTemplateError(`tpl.hitos_pago: hito ${id} sin bloqueaStateId`);
    }
    return {
      id,
      bloqueaStateId,
      ...(typeof o.fase === "string" ? { fase: o.fase } : {}),
      ...(typeof o.bornInDominantState === "string"
        ? { bornInDominantState: o.bornInDominantState }
        : {}),
      ...(typeof o.transitionId === "string"
        ? { transitionId: o.transitionId }
        : {}),
      ...(typeof o.paymentField === "string"
        ? { paymentField: o.paymentField }
        : {}),
    };
  });
}

/** Enriquece invocación tpl.hitos_pago con hitos del compositor. */
export function buildHitosTemplateInvocation(
  base: PolicyTemplateInvocation,
  milestones: readonly HitoPagoSpec[],
): PolicyTemplateInvocation {
  const hitosJson = JSON.stringify(
    milestones.map((h, i) => ({
      id: h.id,
      fase: h.fase,
      bloqueaStateId: h.bloquea,
      bornInDominantState: h.bornInDominantState,
      transitionId: transitionIdForBloqueaState(h.bloquea),
      paymentField: hitoPaymentField(h.id, i),
    })),
  );
  return {
    ...base,
    parametros: { ...base.parametros, hitosJson },
  };
}

export { emptyCompiled };
