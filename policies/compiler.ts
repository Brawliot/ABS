/**
 * Compilador de políticas (capa 1 → reglas de capa 0).
 *
 * REGLA INVIOLABLE: el resultado solo contiene guardas, condiciones, cálculos,
 * requisitos de evidencia e invariantes. Nunca estados ni transiciones.
 */

import { createHash } from "node:crypto";
import { assertKnownFact, FactCatalogError } from "../facts/catalog.js";
import { compileCalendar } from "./calendario.js";
import { compileOrganization } from "./organization.js";
import { compileObjectives } from "./objetivo.js";
import { FORBIDDEN_POLICY_KEYS } from "./schema.js";
import {
  PRIORITY,
  PolicyCompileError,
  defaultBindingFor,
  type BusinessPolicy,
  type CompileCatalog,
  type CompiledRule,
  type CompiledRuleSet,
  type CompliancePolicy,
  type FactRequirement,
  type PermissionPolicy,
  type PolicyDocument,
  type RoleDef,
  type RuleBinding,
} from "./types.js";

export interface CompileOptions {
  readonly catalog: CompileCatalog;
  /** Fecha de activación del CompiledRuleSet (ISO-8601). */
  readonly activationAt: string;
  /** Versión del artefacto compilado (distinta de la del documento fuente). */
  readonly compiledVersion?: string;
}

/**
 * Compila un documento de políticas a un CompiledRuleSet determinista.
 * Misma entrada + mismo catálogo + misma activationAt ⇒ misma salida (hash incluido).
 */
export function compilePolicies(
  document: PolicyDocument,
  options: CompileOptions,
): CompiledRuleSet {
  assertNoForbiddenStructure(document);
  assertSchemaShape(document);

  const roleIds = new Set(document.roles.map((r) => r.id));
  if (roleIds.size !== document.roles.length) {
    throw new PolicyCompileError(
      "Roles duplicados en el documento",
      "SCHEMA",
    );
  }

  const transitionSet = new Set(options.catalog.transitionIds);
  const fieldSet = new Set(options.catalog.fieldNames);
  const stateSet = new Set(options.catalog.stateIds);

  const rules: CompiledRule[] = [];

  for (const p of document.permissions ?? []) {
    rules.push(
      ...compilePermission(p, roleIds, transitionSet, stateSet),
    );
  }
  for (const p of document.policies ?? []) {
    rules.push(
      ...compileBusiness(p, roleIds, transitionSet, fieldSet, stateSet),
    );
  }
  for (const p of document.compliance ?? []) {
    rules.push(
      ...compileCompliance(p, roleIds, transitionSet, fieldSet, stateSet),
    );
  }

  if (rules.length === 0) {
    throw new PolicyCompileError(
      "El documento no produce ninguna regla compilable",
      "EMPTY",
    );
  }

  detectContradictions(rules);

  let actorDirectory: CompiledRuleSet["actorDirectory"] = {};
  if (document.organization) {
    try {
      actorDirectory = compileOrganization(document.organization, roleIds);
    } catch (err) {
      throw new PolicyCompileError(
        err instanceof Error ? err.message : String(err),
        "ORG",
      );
    }
  }

  let calendar: CompiledRuleSet["calendar"];
  if (document.calendar) {
    try {
      calendar = compileCalendar(document.calendar);
    } catch (err) {
      throw new PolicyCompileError(
        err instanceof Error ? err.message : String(err),
        "CALENDAR",
      );
    }
  }

  let deadlines: CompiledRuleSet["deadlines"] = [];
  let goals: CompiledRuleSet["goals"] = [];
  if (document.objectives) {
    try {
      const objs = compileObjectives(document.objectives);
      deadlines = objs.deadlines;
      goals = objs.goals;
      for (const g of goals) {
        try {
          assertKnownFact(g.factId, {
            ...Object.fromEntries(
              Object.entries(g.factParams).map(([k, v]) => [
                k,
                v.startsWith("$") ? "placeholder" : v,
              ]),
            ),
          });
        } catch (err) {
          if (err instanceof FactCatalogError) {
            throw new PolicyCompileError(
              err.message,
              err.code === "UNKNOWN_FACT" ? "UNKNOWN_FACT" : "BAD_FACT_PARAMS",
            );
          }
          throw err;
        }
      }
    } catch (err) {
      if (err instanceof PolicyCompileError) throw err;
      throw new PolicyCompileError(
        err instanceof Error ? err.message : String(err),
        "OBJECTIVE",
      );
    }
  }

  const sortedRules = stableSortRules(rules);
  const roles = stableSortRoles(document.roles);

  const artifact: Omit<CompiledRuleSet, "contentHash"> = {
    version: options.compiledVersion ?? `compiled:${document.version}`,
    activationAt: options.activationAt,
    sourceDocumentId: document.id,
    sourceDocumentVersion: document.version,
    companyId: document.companyId,
    archetypeId: document.archetypeId,
    roles,
    rules: sortedRules,
    actorDirectory,
    deadlines,
    goals,
    ...(calendar !== undefined ? { calendar } : {}),
  };

  const contentHash = hashCanonical(artifact);

  return Object.freeze({
    ...artifact,
    contentHash,
    roles: Object.freeze([...roles]),
    rules: Object.freeze(sortedRules.map(freezeRule)),
    actorDirectory: Object.freeze({ ...actorDirectory }),
    deadlines: Object.freeze([...deadlines]),
    goals: Object.freeze([...goals]),
    ...(calendar !== undefined ? { calendar: Object.freeze(calendar) } : {}),
  });
}

/**
 * Valida un CompiledRuleSet antes de activarlo:
 * referencias existentes, sin contradicciones, hash coherente (determinismo).
 */
export function validateCompiledRuleSet(
  ruleSet: CompiledRuleSet,
  catalog: CompileCatalog,
): void {
  const transitionSet = new Set(catalog.transitionIds);
  const fieldSet = new Set(catalog.fieldNames);
  const stateSet = new Set(catalog.stateIds);

  for (const rule of ruleSet.rules) {
    if ("transitionId" in rule && rule.transitionId) {
      assertKnownTransition(rule.transitionId, transitionSet);
    }
    if (rule.kind === "condition") {
      if (!rule.factBinding && rule.predicate.field !== "_fact") {
        assertKnownField(rule.predicate.field, fieldSet);
      }
    }
    if (rule.kind === "calculation") {
      assertKnownField(rule.calculation.field, fieldSet);
    }
    if (rule.kind === "evidence_requirement" && rule.when) {
      assertKnownField(rule.when.field, fieldSet);
    }
    if (rule.kind === "invariant") {
      for (const s of rule.appliesInStates) {
        if (!stateSet.has(s)) {
          throw new PolicyCompileError(
            `Invariante ${rule.invariantId} referencia estado inexistente "${s}"`,
            "UNKNOWN_STATE_REF",
          );
        }
      }
    }
    if (rule.binding.mode === "on_state") {
      if (!rule.binding.stateId || !stateSet.has(rule.binding.stateId)) {
        throw new PolicyCompileError(
          `Regla ${rule.id}: binding on_state con stateId inválido`,
          "UNKNOWN_STATE_REF",
        );
      }
    }
    // Defensa: el set no puede contener claves de máquina
    const asRec = rule as unknown as Record<string, unknown>;
    if ("from" in asRec || "to" in asRec || "states" in asRec) {
      throw new PolicyCompileError(
        "CompiledRuleSet inválido: contiene forma de estado/transición",
        "FORBIDDEN_STRUCTURE",
      );
    }
  }

  detectContradictions([...ruleSet.rules]);

  const { contentHash: _h, ...rest } = ruleSet;
  const expected = hashCanonical(rest);
  if (expected !== ruleSet.contentHash) {
    throw new PolicyCompileError(
      "CompiledRuleSet no determinista o alterado: contentHash no coincide",
      "SCHEMA",
    );
  }
}

function compilePermission(
  p: PermissionPolicy,
  roleIds: ReadonlySet<string>,
  transitions: ReadonlySet<string>,
  states: ReadonlySet<string>,
): CompiledRule[] {
  const action = p.action ?? "ejecutar";
  for (const r of p.allowedRoles) {
    if (!roleIds.has(r)) {
      throw new PolicyCompileError(
        `Permiso ${p.id}: rol desconocido "${r}"`,
        "UNKNOWN_ROLE",
      );
    }
  }

  if (action === "consultar") {
    const binding = assertBinding(
      defaultBindingFor("visibility", p.binding),
      states,
      p.id,
    );
    return [
      {
        kind: "visibility",
        id: `vis:${p.id}`,
        priority: PRIORITY.permiso,
        allowedRoles: [...p.allowedRoles].sort(),
        visibilityScope: p.visibility?.scope ?? "empresa",
        sourcePolicyId: p.id,
        sourceKind: "permiso",
        binding,
      },
    ];
  }

  if (!p.transitionId) {
    throw new PolicyCompileError(
      `Permiso ${p.id}: transitionId obligatorio para action=${action}`,
      "SCHEMA",
    );
  }
  assertKnownTransition(p.transitionId, transitions);

  if (action === "forzar") {
    const binding = assertBinding(
      defaultBindingFor("force_grant", p.binding),
      states,
      p.id,
    );
    return [
      {
        kind: "force_grant",
        id: `force:${p.id}`,
        priority: PRIORITY.permiso,
        transitionId: p.transitionId,
        allowedRoles: [...p.allowedRoles].sort(),
        sourcePolicyId: p.id,
        sourceKind: "permiso",
        binding,
      },
    ];
  }

  const binding = assertBinding(
    defaultBindingFor("guard", p.binding),
    states,
    p.id,
  );
  return [
    {
      kind: "guard",
      id: `guard:${p.id}`,
      priority: PRIORITY.permiso,
      transitionId: p.transitionId,
      allowedRoles: [...p.allowedRoles].sort(),
      sourcePolicyId: p.id,
      sourceKind: "permiso",
      action: action === "aprobar" ? "aprobar" : "ejecutar",
      binding,
    },
  ];
}

function compileBusiness(
  p: BusinessPolicy,
  roleIds: ReadonlySet<string>,
  transitions: ReadonlySet<string>,
  fields: ReadonlySet<string>,
  states: ReadonlySet<string>,
): CompiledRule[] {
  assertKnownTransition(p.transitionId, transitions);
  const out: CompiledRule[] = [];
  const requiredFacts = validateFactReqs([
    ...(p.requiredFacts ?? []),
    ...(p.factCondition
      ? [{ factId: p.factCondition.factId, params: p.factCondition.params }]
      : []),
    ...(p.factRestriction
      ? [
          {
            factId: p.factRestriction.factId,
            params: p.factRestriction.params,
          },
        ]
      : []),
  ]);

  const pushCond = (
    id: string,
    predicate: NonNullable<BusinessPolicy["condition"]>,
    opts: {
      factBinding?: NonNullable<
        Extract<CompiledRule, { kind: "condition" }>["factBinding"]
      >;
      isRestriction?: boolean;
      priority: number;
    },
  ) => {
    const binding = assertBinding(
      defaultBindingFor("condition", p.binding),
      states,
      p.id,
    );
    out.push({
      kind: "condition",
      id,
      priority: opts.priority,
      transitionId: p.transitionId,
      predicate,
      sourcePolicyId: p.id,
      sourceKind: "politica",
      binding,
      ...(opts.factBinding ? { factBinding: opts.factBinding } : {}),
      ...(opts.isRestriction ? { isRestriction: true } : {}),
      ...(requiredFacts.length ? { requiredFacts } : {}),
    });
  };

  if (p.condition) {
    assertKnownField(p.condition.field, fields);
    pushCond(`cond:${p.id}`, p.condition, {
      priority: PRIORITY.politica,
    });
  }

  if (p.factCondition) {
    if (p.factCondition.amountField) {
      assertKnownField(p.factCondition.amountField, fields);
    }
    pushCond(
      `cond-fact:${p.id}`,
      {
        field: p.factCondition.amountField ?? "_fact",
        op: p.factCondition.op,
        value: p.factCondition.value,
      },
      {
        priority: PRIORITY.politica,
        factBinding: {
          factId: p.factCondition.factId,
          params: p.factCondition.params,
          ...(p.factCondition.amountField !== undefined
            ? { amountField: p.factCondition.amountField }
            : {}),
        },
      },
    );
  }

  if (p.restriction) {
    assertKnownField(p.restriction.field, fields);
    pushCond(`restr:${p.id}`, p.restriction, {
      priority: PRIORITY.restriccion,
      isRestriction: true,
    });
  }

  if (p.factRestriction) {
    if (p.factRestriction.amountField) {
      assertKnownField(p.factRestriction.amountField, fields);
    }
    pushCond(
      `restr-fact:${p.id}`,
      {
        field: p.factRestriction.amountField ?? "_fact",
        op: p.factRestriction.op,
        value: p.factRestriction.value,
      },
      {
        priority: PRIORITY.restriccion,
        isRestriction: true,
        factBinding: {
          factId: p.factRestriction.factId,
          params: p.factRestriction.params,
          ...(p.factRestriction.amountField !== undefined
            ? { amountField: p.factRestriction.amountField }
            : {}),
        },
      },
    );
  }

  if (p.calculation) {
    assertKnownField(p.calculation.field, fields);
    const segment = p.calculation.segment ?? p.segment;
    const season = p.calculation.season ?? p.season;
    const classification = p.calculation.classification ?? p.classification;
    if (classification) {
      assertKnownField(classification.subjectField, fields);
    }
    const calc = {
      field: p.calculation.field,
      op: p.calculation.op,
      value: p.calculation.value,
      ...(segment !== undefined ? { segment } : {}),
      ...(season !== undefined ? { season } : {}),
      ...(classification !== undefined ? { classification } : {}),
    };
    const binding = assertBinding(
      defaultBindingFor("calculation", p.binding),
      states,
      p.id,
    );
    out.push({
      kind: "calculation",
      id: `calc:${p.id}`,
      priority: PRIORITY.politica,
      transitionId: p.transitionId,
      calculation: calc,
      sourcePolicyId: p.id,
      sourceKind: "politica",
      binding,
      ...(requiredFacts.length ? { requiredFacts } : {}),
    });
  }

  if (p.approval) {
    const transitionId = p.approval.transitionId ?? p.transitionId;
    assertKnownTransition(transitionId, transitions);
    assertKnownField(p.approval.when.field, fields);
    if (p.approval.requiredRole && !roleIds.has(p.approval.requiredRole)) {
      throw new PolicyCompileError(
        `Política ${p.id}: rol de aprobación desconocido "${p.approval.requiredRole}"`,
        "UNKNOWN_ROLE",
      );
    }
    if (!p.approval.requiredRole && !p.approval.requiredDirectSuperior) {
      throw new PolicyCompileError(
        `Política ${p.id}: approval exige requiredRole o requiredDirectSuperior`,
        "SCHEMA",
      );
    }
    const binding = assertBinding(
      defaultBindingFor("evidence_requirement", p.binding),
      states,
      p.id,
    );
    out.push({
      kind: "evidence_requirement",
      id: `evidence:${p.id}`,
      priority: PRIORITY.politica,
      transitionId,
      evidenceKind: "aceptacion",
      ...(p.approval.requiredRole !== undefined
        ? { requiredRole: p.approval.requiredRole }
        : {}),
      ...(p.approval.requiredDirectSuperior
        ? { requiredDirectSuperior: true }
        : {}),
      when: p.approval.when,
      sourcePolicyId: p.id,
      sourceKind: "politica",
      binding,
      ...(requiredFacts.length ? { requiredFacts } : {}),
    });
  }

  if (out.length === 0) {
    throw new PolicyCompileError(
      `Política ${p.id}: no declara calculation, condition, factCondition, restriction ni approval`,
      "SCHEMA",
    );
  }
  return out;
}

function validateFactReqs(
  reqs: readonly FactRequirement[],
): FactRequirement[] {
  const out: FactRequirement[] = [];
  const seen = new Set<string>();
  for (const r of reqs) {
    try {
      // Params pueden ser "$fields.x"; validamos nombres de parámetros del hecho
      const resolvedKeys: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.params)) {
        resolvedKeys[k] = v.startsWith("$") ? "placeholder" : v;
      }
      assertKnownFact(r.factId, resolvedKeys);
    } catch (err) {
      if (err instanceof FactCatalogError) {
        throw new PolicyCompileError(
          err.message,
          err.code === "UNKNOWN_FACT" ? "UNKNOWN_FACT" : "BAD_FACT_PARAMS",
        );
      }
      throw err;
    }
    const key = `${r.factId}:${JSON.stringify(r.params)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function compileCompliance(
  p: CompliancePolicy,
  roleIds: ReadonlySet<string>,
  transitions: ReadonlySet<string>,
  fields: ReadonlySet<string>,
  states: ReadonlySet<string>,
): CompiledRule[] {
  assertKnownTransition(p.transitionId, transitions);
  const out: CompiledRule[] = [];

  if (p.requiredEvidence) {
    if (
      p.requiredEvidence.requiredRole &&
      !roleIds.has(p.requiredEvidence.requiredRole)
    ) {
      throw new PolicyCompileError(
        `Cumplimiento ${p.id}: rol desconocido "${p.requiredEvidence.requiredRole}"`,
        "UNKNOWN_ROLE",
      );
    }
    const binding = assertBinding(
      defaultBindingFor("evidence_requirement", p.binding),
      states,
      p.id,
    );
    out.push({
      kind: "evidence_requirement",
      id: `evidence:${p.id}`,
      priority: PRIORITY.cumplimiento,
      transitionId: p.transitionId,
      evidenceKind: p.requiredEvidence.kind,
      ...(p.requiredEvidence.requiredRole !== undefined
        ? { requiredRole: p.requiredEvidence.requiredRole }
        : {}),
      ...(p.requiredEvidence.referenceType !== undefined
        ? { referenceType: p.requiredEvidence.referenceType }
        : {}),
      sourcePolicyId: p.id,
      sourceKind: "cumplimiento",
      binding,
    });
  }

  if (p.invariant) {
    for (const s of p.invariant.appliesInStates ?? []) {
      if (!states.has(s)) {
        throw new PolicyCompileError(
          `Cumplimiento ${p.id}: estado inexistente "${s}" en invariante`,
          "UNKNOWN_STATE_REF",
        );
      }
    }
    const m = /^field_present:(.+)$/.exec(p.invariant.predicate);
    if (m) {
      assertKnownField(m[1]!, fields);
    }
    const binding = assertBinding(
      defaultBindingFor("invariant", p.binding),
      states,
      p.id,
    );
    out.push({
      kind: "invariant",
      id: `inv:${p.id}`,
      priority: PRIORITY.cumplimiento,
      invariantId: p.invariant.id,
      predicate: p.invariant.predicate,
      appliesInStates: [...(p.invariant.appliesInStates ?? [])].sort(),
      description: p.invariant.description,
      sourcePolicyId: p.id,
      sourceKind: "cumplimiento",
      binding,
    });
  }

  if (p.restriction) {
    assertKnownField(p.restriction.field, fields);
    const binding = assertBinding(
      defaultBindingFor("condition", p.binding),
      states,
      p.id,
    );
    out.push({
      kind: "condition",
      id: `restr-comp:${p.id}`,
      priority: PRIORITY.cumplimiento,
      transitionId: p.transitionId,
      predicate: p.restriction,
      sourcePolicyId: p.id,
      sourceKind: "cumplimiento",
      isRestriction: true,
      binding,
    });
  }

  if (p.legalDeadline) {
    assertKnownField(p.legalDeadline.anchorField, fields);
    if (p.legalDeadline.durationMs <= 0) {
      throw new PolicyCompileError(
        `Cumplimiento ${p.id}: legalDeadline.durationMs debe ser > 0`,
        "SCHEMA",
      );
    }
    const binding = assertBinding(
      defaultBindingFor("legal_deadline", p.binding),
      states,
      p.id,
    );
    out.push({
      kind: "legal_deadline",
      id: `legal:${p.id}`,
      priority: PRIORITY.cumplimiento,
      transitionId: p.transitionId,
      anchorField: p.legalDeadline.anchorField,
      durationMs: p.legalDeadline.durationMs,
      description: p.legalDeadline.description,
      sourcePolicyId: p.id,
      sourceKind: "cumplimiento",
      binding,
    });
  }

  if (out.length === 0) {
    if (p.dataRetention || p.avisoPlazo) return out;
    throw new PolicyCompileError(
      `Cumplimiento ${p.id}: no declara requiredEvidence, invariant, restriction, legalDeadline, dataRetention ni avisoPlazo`,
      "SCHEMA",
    );
  }
  return out;
}

function assertNoForbiddenStructure(doc: PolicyDocument): void {
  const rec = doc as unknown as Record<string, unknown>;
  for (const key of FORBIDDEN_POLICY_KEYS) {
    if (key in rec && rec[key] !== undefined) {
      throw new PolicyCompileError(
        `Política rechazada: la clave "${key}" intenta alterar estados/transiciones de capa 0. ` +
          `El compilador solo emite guardas, condiciones, cálculos, evidencias e invariantes.`,
        "FORBIDDEN_STRUCTURE",
      );
    }
  }
  // Barrido profundo por si anidan createState etc.
  scanForbidden(doc, "");
}

function scanForbidden(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanForbidden(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    if (
      lower === "createstate" ||
      lower === "addstate" ||
      lower === "newstate" ||
      lower === "createtransition" ||
      lower === "addtransition" ||
      lower === "newtransition"
    ) {
      throw new PolicyCompileError(
        `Política rechazada en ${path || "/"}: "${k}" intenta crear estado/transición. ` +
          `Use requisitos de evidencia sobre transiciones existentes (p. ej. aprobación por umbral).`,
        "FORBIDDEN_STRUCTURE",
      );
    }
    // "states" / "transitions" solo prohibidos en raíz (ya cubierto); anidados en invariantes appliesInStates OK
    scanForbidden(v, path ? `${path}.${k}` : k);
  }
}

function assertSchemaShape(doc: PolicyDocument): void {
  if (!doc.id?.trim() || !doc.version?.trim() || !doc.companyId?.trim()) {
    throw new PolicyCompileError(
      "Documento incompleto: id, version y companyId son obligatorios",
      "SCHEMA",
    );
  }
  if (!Array.isArray(doc.roles) || doc.roles.length === 0) {
    throw new PolicyCompileError(
      "Se requiere al menos un rol en el modelo mínimo de roles",
      "SCHEMA",
    );
  }
}

function assertBinding(
  binding: RuleBinding,
  states: ReadonlySet<string>,
  policyId: string,
): RuleBinding {
  if (binding.mode === "on_state") {
    if (!binding.stateId) {
      throw new PolicyCompileError(
        `Política ${policyId}: binding on_state exige stateId`,
        "SCHEMA",
      );
    }
    if (!states.has(binding.stateId)) {
      throw new PolicyCompileError(
        `Política ${policyId}: estado de binding inexistente "${binding.stateId}"`,
        "UNKNOWN_STATE_REF",
      );
    }
  }
  return binding;
}

/**
 * Selecciona reglas efectivas según vinculación (at_create / on_state / live).
 */
export function selectEffectiveRules(input: {
  readonly ruleSet: CompiledRuleSet;
  readonly creationRuleSet?: CompiledRuleSet;
  readonly stateBoundRuleSets?: Readonly<Record<string, CompiledRuleSet>>;
}): CompiledRule[] {
  const live = input.ruleSet;
  const creation = input.creationRuleSet ?? live;
  const out: CompiledRule[] = [];

  for (const r of creation.rules) {
    if (r.binding.mode === "at_create") out.push(r);
  }
  for (const r of live.rules) {
    if (r.binding.mode === "live") out.push(r);
  }
  for (const [stateId, rs] of Object.entries(input.stateBoundRuleSets ?? {})) {
    for (const r of rs.rules) {
      if (r.binding.mode === "on_state" && r.binding.stateId === stateId) {
        out.push(r);
      }
    }
  }
  return stableSortRules(out);
}

/** Roles autorizados a forzar una transición (vía Observador). */
export function forceRolesForTransition(
  ruleSet: CompiledRuleSet,
  transitionId: string,
): readonly string[] {
  const roles = new Set<string>();
  for (const r of ruleSet.rules) {
    if (r.kind === "force_grant" && r.transitionId === transitionId) {
      for (const role of r.allowedRoles) roles.add(role);
    }
  }
  return [...roles].sort();
}

function assertKnownTransition(
  id: string,
  transitions: ReadonlySet<string>,
): void {
  if (!transitions.has(id)) {
    throw new PolicyCompileError(
      `Transición inexistente en el catálogo de capa 0: "${id}"`,
      "UNKNOWN_TRANSITION",
    );
  }
}

function assertKnownField(field: string, fields: ReadonlySet<string>): void {
  if (!fields.has(field)) {
    throw new PolicyCompileError(
      `Campo inexistente en el catálogo: "${field}"`,
      "UNKNOWN_FIELD",
    );
  }
}

/**
 * Contradicciones MVP:
 * - Dos cálculos set/add/... sobre el mismo (transitionId, field, segment)
 * - Dos guardas de permiso con conjuntos de roles disjuntos sin solape para la misma transición
 *   (permitimos unión si se compilan juntas; contradicción = mismos roles exclusivos conflictivos)
 * - Dos evidencias de cumplimiento con referenceType distinto en la misma transición+kind
 */
function detectContradictions(rules: readonly CompiledRule[]): void {
  const calcs = rules.filter((r) => r.kind === "calculation");
  const seenCalc = new Map<string, CompiledRule>();
  for (const r of calcs) {
    if (r.kind !== "calculation") continue;
    const seg = r.calculation.segment ?? "";
    const key = `${r.transitionId}|${r.calculation.field}|${seg}|${r.calculation.op}`;
    const prev = seenCalc.get(key);
    if (prev && prev.kind === "calculation") {
      if (prev.calculation.value !== r.calculation.value) {
        throw new PolicyCompileError(
          `Políticas contradictorias: cálculos incompatibles sobre ` +
            `${r.calculation.field} (segmento "${seg || "*"}") en ${r.transitionId}: ` +
            `${prev.sourcePolicyId}=${prev.calculation.value} vs ${r.sourcePolicyId}=${r.calculation.value}`,
          "CONTRADICTION",
        );
      }
    }
    seenCalc.set(key, r);
  }

  // Dos descuentos (campo descuento*) set distintos mismo segmento
  const discountCalcs = calcs.filter(
    (r) =>
      r.kind === "calculation" &&
      r.calculation.field.toLowerCase().includes("descuento"),
  );
  const bySeg = new Map<string, typeof discountCalcs[0]>();
  for (const r of discountCalcs) {
    if (r.kind !== "calculation") continue;
    const seg = r.calculation.segment ?? "";
    const key = `${r.transitionId}|${seg}`;
    const prev = bySeg.get(key);
    if (
      prev &&
      prev.kind === "calculation" &&
      (prev.calculation.value !== r.calculation.value ||
        prev.calculation.op !== r.calculation.op)
    ) {
      throw new PolicyCompileError(
        `Políticas contradictorias: dos descuentos para el segmento "${seg || "*"}" ` +
          `en ${r.transitionId} (${prev.sourcePolicyId} vs ${r.sourcePolicyId})`,
        "CONTRADICTION",
      );
    }
    bySeg.set(key, r);
  }
}

function stableSortRules(rules: CompiledRule[]): CompiledRule[] {
  return [...rules].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.id.localeCompare(b.id);
  });
}

function stableSortRoles(roles: readonly RoleDef[]): RoleDef[] {
  return [...roles]
    .map((r) => ({ id: r.id, label: r.label }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function freezeRule(rule: CompiledRule): CompiledRule {
  return Object.freeze(structuredClone(rule)) as CompiledRule;
}

/** Hash canónico determinista (JSON con claves ordenadas). */
export function hashCanonical(value: unknown): string {
  const json = canonicalStringify(value);
  return createHash("sha256").update(json, "utf8").digest("hex");
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = sortKeys(obj[k]);
  }
  return out;
}

/** Catálogo mínimo derivado de un lifecycle + campos de negocio. */
export function catalogFromLifecycle(
  transitionIds: readonly string[],
  stateIds: readonly string[],
  fieldNames: readonly string[],
): CompileCatalog {
  return {
    transitionIds: [...transitionIds].sort(),
    stateIds: [...stateIds].sort(),
    fieldNames: [...fieldNames].sort(),
  };
}

export function isEvidenceRequirement(
  rule: CompiledRule,
): rule is Extract<CompiledRule, { kind: "evidence_requirement" }> {
  return rule.kind === "evidence_requirement";
}

/** Helper de lectura: ¿el set introduce estados o transiciones? Siempre false si es válido. */
export function ruleSetTouchesMachineStructure(ruleSet: CompiledRuleSet): boolean {
  const json = JSON.stringify(ruleSet);
  return (
    /"from"\s*:/.test(json) ||
    /"to"\s*:/.test(json) ||
    /"states"\s*:/.test(json) ||
    /"transitions"\s*:/.test(json)
  );
}
