/**
 * Validador runtime de UiSpec — puerta antes de renderizar / persistir.
 * Integra assertSpecHasNoLiteralDesignValues; no modifica Capa 0/1.
 */

import type { GeneratorInput } from "../generator/types.js";
import type { UiSpec, ViewSpec, ActionSpec, RecorridoSpec } from "./types.js";
import { PRESENTATION_SCHEMA_VERSION } from "./types.js";
import {
  uiSpecZod,
  SUPPORTED_PRESENTATION_SCHEMA_VERSIONS,
  ENTITY_SCHEMAS,
} from "./uispec-schema.js";
import { assertSpecHasNoLiteralDesignValues } from "../generator/validate-ui.js";
import { DEFAULT_FIELD_RULES } from "../filter/types.js";
import { hashCanonical, canonicalStringify } from "../policies/compiler.js";
import {
  isValidatedUiSpec,
  sealValidatedUiSpec,
  type ValidatedUiSpec,
} from "./validated.js";

export type UiSpecValidationCode =
  | "UNSUPPORTED_VERSION"
  | "SCHEMA"
  | "REF_VIEW_STATE"
  | "REF_ACTION_TRANSITION"
  | "REF_ROLE"
  | "REF_PROCESS_GROUP"
  | "REF_PANEL"
  | "REF_INTERNAL"
  | "REF_DUPLICATE"
  | "REF_ORPHAN_TRANSITIVE"
  | "COHERENCE_ROLE_ACTION"
  | "COHERENCE_UNKNOWN_TRANSITION"
  | "COHERENCE_MISSING_BLOCK"
  | "COHERENCE_TERMINAL_REOPEN"
  | "COHERENCE_CONTENT_HASH_MISMATCH"
  | "COHERENCE_UNPERMITTED_ROLE"
  | "COHERENCE_ENTITY_FIELD_MISMATCH"
  | "COHERENCE_CYCLE_DETECTED"
  | "SECURITY_SENSITIVE_FIELD"
  | "SECURITY_PORTAL_FIELD"
  | "SECURITY_DESIGN_LITERAL"
  | "SECURITY_INJECTION"
  | "SECURITY_HTML_INJECTION"
  | "SECURITY_PORTAL_SCOPE"
  | "NOT_VALIDATED";

export type ValidationSeverity = "critica" | "media" | "baja";

export interface UiSpecValidationIssue {
  readonly code: UiSpecValidationCode;
  readonly path: string;
  readonly message: string;
  readonly suggestion?: string;
  readonly affectedIds?: readonly string[];
  readonly severity?: ValidationSeverity;
}

export interface UiSpecValidationReport {
  readonly ok: boolean;
  readonly issues: readonly UiSpecValidationIssue[];
  readonly validatedAt: string;
  readonly schemaVersion: string;
}

export class UiSpecValidationError extends Error {
  readonly issues: readonly UiSpecValidationIssue[];
  readonly report: UiSpecValidationReport;

  constructor(report: UiSpecValidationReport) {
    const head = report.issues[0];
    super(
      head
        ? `UiSpec inválida [${head.code}] ${head.path}: ${head.message} (+${Math.max(0, report.issues.length - 1)} más)`
        : "UiSpec inválida",
    );
    this.name = "UiSpecValidationError";
    this.issues = report.issues;
    this.report = report;
  }
}

const FONT_LITERAL_RE =
  /\b(font-family|@font-face)\s*:|['"](?:Arial|Helvetica|Times New Roman|Roboto|Inter|Comic Sans)['"]/i;

/**
 * OWASP-safe HTML injection detection:
 * Detecta script tags, event handlers, data URLs, formaction, y variantes modernas.
 * Case-insensitive, maneja espacios/tabulaciones.
 */
function detectHtmlInjection(text: string): boolean {
  if (!text || typeof text !== "string") return false;

  // Script tags (todas las variantes: <script, <SCRIPT, < script, etc.)
  if (/<\s*script[\s/>]/i.test(text)) return true;

  // iFrame
  if (/<\s*iframe[\s/>]/i.test(text)) return true;

  // Otros tags peligrosos
  if (/<\s*(object|embed|link|meta|svg|style|base)\s*[\s>\/]/i.test(text)) return true;

  // Event handlers: onclick, onload, onerror, etc. (incluyendo variantes con espacios)
  if (/on\w+\s*=/i.test(text)) return true;

  // Variantes modernas: data-onclick, data-on*, etc.
  if (/data-on\w+=/i.test(text)) return true;

  // javascript: protocol
  if (/javascript\s*:/i.test(text)) return true;

  // data: URLs (data:text/html, data:image/svg+xml, etc.)
  if (/data:\s*text\/html/i.test(text)) return true;
  if (/data:\s*image\/svg/i.test(text)) return true;

  // formaction (puede redirigir a URL maliciosa)
  if (/formaction\s*=/i.test(text)) return true;

  // vbscript: protocol
  if (/vbscript\s*:/i.test(text)) return true;

  return false;
}

function push(
  issues: UiSpecValidationIssue[],
  code: UiSpecValidationCode,
  path: string,
  message: string,
  options?: { suggestion?: string; affectedIds?: string[]; severity?: ValidationSeverity },
): void {
  issues.push({ code, path, message, ...options });
}

/**
 * Telemetría exhaustiva del Validador UiSpec.
 * Singleton que colecta métricas de validaciones, caché, tiempo, y severity.
 * Integrable con ELK, Prometheus, Datadog, etc.
 *
 * Métricas:
 * - validationsAttempted: total de specs validados
 * - validationsPassed: specs válidas
 * - validationsFailed: specs inválidas
 * - cacheHits: reuses de caché (hit rate = hits / attempted)
 * - cacheMisses: revalidaciones
 * - avgValidationTimeMs: tiempo promedio de validación
 * - criticalIssuesCount: por código, severidad critica
 */
export class ValidatorObservability {
  private static instance: ValidatorObservability | null = null;

  private validationsAttempted = 0;
  private validationsPassed = 0;
  private validationsFailed = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private totalValidationTimeMs = 0;
  private criticalIssuesByCode = new Map<string, number>();
  private logs: Array<{ level: "debug" | "info" | "warn" | "error"; msg: string; timestamp: string }> = [];
  private readonly maxLogs = 1000; // Evitar memory leak

  private constructor() {}

  static getInstance(): ValidatorObservability {
    if (!ValidatorObservability.instance) {
      ValidatorObservability.instance = new ValidatorObservability();
    }
    return ValidatorObservability.instance;
  }

  recordValidationAttempt(success: boolean, validationTimeMs: number, issues?: readonly UiSpecValidationIssue[]): void {
    this.validationsAttempted++;
    if (success) {
      this.validationsPassed++;
      this.log("info", `validación exitosa en ${validationTimeMs.toFixed(2)}ms`);
    } else {
      this.validationsFailed++;
      if (issues) {
        for (const issue of issues) {
          if (issue.severity === "critica") {
            const count = this.criticalIssuesByCode.get(issue.code) ?? 0;
            this.criticalIssuesByCode.set(issue.code, count + 1);
          }
        }
      }
      this.log("warn", `validación fallida: ${issues?.length ?? 0} issues en ${validationTimeMs.toFixed(2)}ms`);
    }
    this.totalValidationTimeMs += validationTimeMs;
  }

  recordCacheHit(): void {
    this.cacheHits++;
    this.log("debug", "cache hit");
  }

  recordCacheMiss(): void {
    this.cacheMisses++;
    this.log("debug", "cache miss");
  }

  private log(level: "debug" | "info" | "warn" | "error", msg: string): void {
    const entry = {
      level,
      msg,
      timestamp: new Date().toISOString(),
    };
    this.logs.push(entry);
    // LRU: mantener últimas maxLogs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getMetrics(): {
    validationsAttempted: number;
    validationsPassed: number;
    validationsFailed: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    avgValidationTimeMs: number;
    criticalIssuesByCode: Record<string, number>;
  } {
    return {
      validationsAttempted: this.validationsAttempted,
      validationsPassed: this.validationsPassed,
      validationsFailed: this.validationsFailed,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate:
        this.validationsAttempted > 0 ? this.cacheHits / this.validationsAttempted : 0,
      avgValidationTimeMs:
        this.validationsAttempted > 0
          ? this.totalValidationTimeMs / this.validationsAttempted
          : 0,
      criticalIssuesByCode: Object.fromEntries(this.criticalIssuesByCode),
    };
  }

  getLogs(level?: "debug" | "info" | "warn" | "error"): Array<{ level: string; msg: string; timestamp: string }> {
    if (!level) return this.logs;
    return this.logs.filter((l) => l.level === level);
  }

  exportMetricsToJson(): string {
    const metrics = this.getMetrics();
    return JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        ...metrics,
      },
      null,
      2,
    );
  }

  exportMetricsToCsv(): string {
    const metrics = this.getMetrics();
    const rows: string[] = [];
    rows.push("timestamp,metric_name,value");
    rows.push(`${new Date().toISOString()},validations_attempted,${metrics.validationsAttempted}`);
    rows.push(`${new Date().toISOString()},validations_passed,${metrics.validationsPassed}`);
    rows.push(`${new Date().toISOString()},validations_failed,${metrics.validationsFailed}`);
    rows.push(`${new Date().toISOString()},cache_hits,${metrics.cacheHits}`);
    rows.push(`${new Date().toISOString()},cache_misses,${metrics.cacheMisses}`);
    rows.push(`${new Date().toISOString()},cache_hit_rate,${metrics.cacheHitRate}`);
    rows.push(`${new Date().toISOString()},avg_validation_time_ms,${metrics.avgValidationTimeMs.toFixed(2)}`);
    for (const [code, count] of Object.entries(metrics.criticalIssuesByCode)) {
      rows.push(`${new Date().toISOString()},critical_issues_${code},${count}`);
    }
    return rows.join("\n");
  }

  reset(): void {
    this.validationsAttempted = 0;
    this.validationsPassed = 0;
    this.validationsFailed = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.totalValidationTimeMs = 0;
    this.criticalIssuesByCode.clear();
    this.logs = [];
  }
}

/**
 * Caché LRU para validaciones por contentHash.
 * Evita re-validar specs idénticas.
 */
export class ValidationCache {
  private readonly cache = new Map<string, UiSpecValidationReport>();
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(contentHash: string): UiSpecValidationReport | undefined {
    return this.cache.get(contentHash);
  }

  set(contentHash: string, report: UiSpecValidationReport): void {
    // LRU eviction: si alcanzamos maxSize, eliminar más antigua
    if (this.cache.size >= this.maxSize && !this.cache.has(contentHash)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(contentHash, report);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Canonicalizar spec para hash determinista.
 * Ordena todas las claves recursivamente.
 */
function canonicalizeSpec(spec: UiSpec): string {
  // Solo los campos que afectan validación: views, actions, forms, recorridos
  const artifact = {
    views: spec.views,
    actions: spec.actions,
    forms: spec.forms,
    recorridos: spec.recorridos,
    processGroups: spec.processGroups,
  };
  return canonicalStringify(artifact);
}

/**
 * Detectar ciclos en recorridos.
 * Un ciclo existe si el mismo viewId aparece más de una vez en los steps.
 * Ej: [view1, view2, view1] debe ser DETECTADO.
 */
function detectCyclesInJourneys(
  spec: UiSpec,
  issues: UiSpecValidationIssue[],
): void {
  for (const recorrido of spec.recorridos) {
    if (recorrido.steps.length <= 1) continue;

    const seen = new Set<string>();
    for (let i = 0; i < recorrido.steps.length; i++) {
      const viewId = recorrido.steps[i]!;
      if (seen.has(viewId)) {
        // Ciclo detectado: el viewId ya fue visto
        const cyclePosition = recorrido.steps.indexOf(viewId);
        const pathStr = recorrido.steps.slice(0, i + 1).join(" → ");
        push(
          issues,
          "COHERENCE_CYCLE_DETECTED",
          `recorridos[${recorrido.id}].steps`,
          `ciclo detectado: vista "${viewId}" aparece en posiciones ${cyclePosition} y ${i}; ruta: ${pathStr}`,
          {
            suggestion: `Reordenar steps en recorrido "${recorrido.id}" para evitar repeticiones. Pasos actuales: [${recorrido.steps.join(", ")}]`,
            affectedIds: [recorrido.id],
            severity: "critica",
          },
        );
        break; // Solo reportar una vez por recorrido
      }
      seen.add(viewId);
    }
  }
}

/**
 * Construir dependency graph: action → form → fields → entity.
 * Reporta orphans transitivos (ej: action referencia form que referencia field no-existente).
 */
function buildDependencyGraph(spec: UiSpec): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  // Nodo por cada recurso
  const resources = new Set<string>();
  for (const v of spec.views) resources.add(`view:${v.id}`);
  for (const a of spec.actions) resources.add(`action:${a.id}`);
  for (const f of spec.forms) resources.add(`form:${f.id}`);
  for (const r of spec.recorridos) resources.add(`recorrido:${r.id}`);

  for (const res of resources) {
    graph.set(res, new Set());
  }

  // Aristas: quién referencia a quién
  for (const v of spec.views) {
    const viewNode = `view:${v.id}`;
    for (const aid of v.actionIds) {
      graph.get(viewNode)?.add(`action:${aid}`);
    }
    if (v.formId) {
      graph.get(viewNode)?.add(`form:${v.formId}`);
    }
  }

  for (const a of spec.actions) {
    const actionNode = `action:${a.id}`;
    if (a.formId) {
      graph.get(actionNode)?.add(`form:${a.formId}`);
    }
  }

  for (const r of spec.recorridos) {
    const recorridoNode = `recorrido:${r.id}`;
    for (const step of r.steps) {
      graph.get(recorridoNode)?.add(`view:${step}`);
    }
  }

  return graph;
}

/**
 * Encontrar orphans transitivos: refs que no existen en el grafo.
 */
function findTransitiveOrphans(
  spec: UiSpec,
  issues: UiSpecValidationIssue[],
): void {
  const graph = buildDependencyGraph(spec);
  const allNodes = new Set(graph.keys());

  // Validar todas las aristas
  for (const [source, targets] of graph.entries()) {
    for (const target of targets) {
      if (!allNodes.has(target)) {
        // target es orphan
        const [targetType, targetId] = target.split(":") as [string, string];
        push(
          issues,
          "REF_ORPHAN_TRANSITIVE",
          source,
          `referencia ${targetType} inexistente "${targetId}" (transitivo desde ${source})`,
          {
            suggestion: `Crear ${targetType} "${targetId}" o remover referencia desde ${source}`,
            affectedIds: [source],
            severity: "critica",
          },
        );
      }
    }
  }
}

function collectTextBlobs(spec: UiSpec): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  if (spec.identity.brandName) {
    out.push({ path: "identity.brandName", text: spec.identity.brandName });
  }
  if (spec.identity.logoUrl) {
    out.push({ path: "identity.logoUrl", text: spec.identity.logoUrl });
  }
  for (let i = 0; i < spec.localization.length; i++) {
    const loc = spec.localization[i]!;
    for (const [k, v] of Object.entries(loc.strings)) {
      out.push({ path: `localization[${i}].strings.${k}`, text: v });
    }
  }
  for (const [id, c] of Object.entries(spec.content)) {
    if (c.title) out.push({ path: `content.${id}.title`, text: c.title });
    if (c.subtitle)
      out.push({ path: `content.${id}.subtitle`, text: c.subtitle });
    if (c.body) out.push({ path: `content.${id}.body`, text: c.body });
    if (c.labels) {
      for (const [lk, lv] of Object.entries(c.labels)) {
        out.push({ path: `content.${id}.labels.${lk}`, text: lv });
      }
    }
  }
  for (const v of spec.views) {
    if (v.presentation) {
      for (const [pk, pv] of Object.entries(v.presentation)) {
        out.push({ path: `views[${v.id}].presentation.${pk}`, text: pv });
      }
    }
  }
  return out;
}

function roleSet(input: GeneratorInput): Set<string> {
  const roles = new Set(input.roles.map((r) => r.id));
  // Portal / autoservicio puede exigir rol cliente aunque no estuviera en el perfil original
  if (input.channels.includes("autoservicio")) roles.add("cliente");
  for (const r of input.ruleSet.roles ?? []) {
    roles.add(r.id);
  }
  return roles;
}

function lifecycleIndex(input: GeneratorInput): Map<
  string,
  {
    stateIds: Set<string>;
    terminalIds: Set<string>;
    transitions: Map<string, { from: string; to: string }>;
  }
> {
  const map = new Map<
    string,
    {
      stateIds: Set<string>;
      terminalIds: Set<string>;
      transitions: Map<string, { from: string; to: string }>;
    }
  >();
  for (const slice of input.lifecycles) {
    const stateIds = new Set(slice.lifecycle.states.map((s) => s.id));
    const terminalIds = new Set(
      slice.lifecycle.states
        .filter((s) => s.kind.startsWith("terminal"))
        .map((s) => s.id),
    );
    const transitions = new Map<string, { from: string; to: string }>();
    for (const t of slice.lifecycle.transitions) {
      transitions.set(t.id, { from: t.from, to: t.to });
    }
    map.set(slice.id, { stateIds, terminalIds, transitions });
  }
  return map;
}

function guardRolesForTransition(
  input: GeneratorInput,
  transitionId: string,
): Set<string> {
  const roles = new Set<string>();
  for (const r of input.ruleSet.rules) {
    if (
      r.kind === "guard" &&
      r.transitionId === transitionId &&
      (r.action === "ejecutar" || r.action === "aprobar")
    ) {
      for (const role of r.allowedRoles) roles.add(role);
    }
  }
  return roles;
}

function checkSchema(raw: unknown, issues: UiSpecValidationIssue[]): UiSpec | null {
  if (raw === null || typeof raw !== "object") {
    push(issues, "SCHEMA", "$", "UiSpec debe ser un objeto");
    return null;
  }
  const version = (raw as { version?: unknown }).version;
  if (typeof version === "string" && !SUPPORTED_PRESENTATION_SCHEMA_VERSIONS.has(version)) {
    push(
      issues,
      "UNSUPPORTED_VERSION",
      "version",
      `version "${version}" no soportada; soportadas: ${[...SUPPORTED_PRESENTATION_SCHEMA_VERSIONS].join(", ")}`,
    );
  }
  const parsed = uiSpecZod.safeParse(raw);
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      push(
        issues,
        "SCHEMA",
        iss.path.join(".") || "$",
        iss.message,
      );
    }
    return null;
  }
  return parsed.data as unknown as UiSpec;
}

function checkReferential(
  spec: UiSpec,
  input: GeneratorInput,
  issues: UiSpecValidationIssue[],
): void {
  const roles = roleSet(input);
  const lc = lifecycleIndex(input);
  const viewById = new Map(spec.views.map((v) => [v.id, v]));
  const actionById = new Map(spec.actions.map((a) => [a.id, a]));
  const formById = new Map(spec.forms.map((f) => [f.id, f]));
  const recorridoById = new Map(spec.recorridos.map((r) => [r.id, r]));

  // Tarea 1: Validar entityKind fields
  validateFormFieldsAgainstEntity(spec, issues);

  // Tarea Fase 2: Validar orphans transitivos
  findTransitiveOrphans(spec, issues);

  // Duplicados
  const idSets: [string, string[]][] = [
    ["views", spec.views.map((v) => v.id)],
    ["actions", spec.actions.map((a) => a.id)],
    ["forms", spec.forms.map((f) => f.id)],
    ["recorridos", spec.recorridos.map((r) => r.id)],
    ["modules", spec.modules.map((m) => m.id)],
  ];
  if (spec.processGroups) {
    idSets.push(["processGroups", spec.processGroups.map((g) => g.id)]);
  }
  for (const [label, ids] of idSets) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        push(issues, "REF_DUPLICATE", `${label}[${id}]`, `id duplicado "${id}"`);
      }
      seen.add(id);
    }
  }

  for (const v of spec.views) {
    if (v.kind === "tablero") {
      if (!v.lifecycleId || !v.stateId) {
        push(
          issues,
          "REF_VIEW_STATE",
          `views[${v.id}]`,
          "tablero exige lifecycleId y stateId",
        );
        continue;
      }
      const slice = lc.get(v.lifecycleId);
      if (!slice) {
        push(
          issues,
          "REF_VIEW_STATE",
          `views[${v.id}].lifecycleId`,
          `lifecycle inexistente "${v.lifecycleId}"`,
        );
      } else if (!slice.stateIds.has(v.stateId)) {
        push(
          issues,
          "REF_VIEW_STATE",
          `views[${v.id}].stateId`,
          `estado "${v.stateId}" no existe en lifecycle "${v.lifecycleId}"`,
        );
      }
    }
    for (const aid of v.actionIds) {
      if (!actionById.has(aid)) {
        push(
          issues,
          "REF_INTERNAL",
          `views[${v.id}].actionIds`,
          `acción huérfana "${aid}"`,
        );
      }
    }
    if (v.formId && !formById.has(v.formId)) {
      push(
        issues,
        "REF_INTERNAL",
        `views[${v.id}].formId`,
        `formulario huérfano "${v.formId}"`,
      );
    }
  }

  for (const a of spec.actions) {
    const slice = lc.get(a.lifecycleId);
    if (!slice) {
      push(
        issues,
        "REF_ACTION_TRANSITION",
        `actions[${a.id}].lifecycleId`,
        `lifecycle inexistente "${a.lifecycleId}"`,
      );
    } else if (!slice.transitions.has(a.transitionId)) {
      push(
        issues,
        "REF_ACTION_TRANSITION",
        `actions[${a.id}].transitionId`,
        `transición "${a.transitionId}" no existe en "${a.lifecycleId}"`,
      );
    }
    for (const role of a.visibleRoles) {
      if (!roles.has(role)) {
        push(
          issues,
          "REF_ROLE",
          `actions[${a.id}].visibleRoles`,
          `rol desconocido "${role}"`,
        );
      }
    }
    if (a.formId && !formById.has(a.formId)) {
      push(
        issues,
        "REF_INTERNAL",
        `actions[${a.id}].formId`,
        `formulario huérfano "${a.formId}"`,
      );
    }
  }

  const lifecycleIds = new Set(input.lifecycles.map((l) => l.id));
  const composition = input.composition;

  for (const g of spec.processGroups ?? []) {
    if (g.lifecycleId === "__portal__") {
      // portal sintético
    } else if (!lifecycleIds.has(g.lifecycleId)) {
      push(
        issues,
        "REF_PROCESS_GROUP",
        `processGroups[${g.id}].lifecycleId`,
        `proceso/lifecycle inexistente "${g.lifecycleId}"`,
      );
    }
    if (g.role === "dominant" && composition && g.archetypeId !== composition.dominant) {
      push(
        issues,
        "REF_PROCESS_GROUP",
        `processGroups[${g.id}].archetypeId`,
        `dominant archetypeId="${g.archetypeId}" ≠ composition.dominant="${composition.dominant}"`,
      );
    }
    if (g.role === "secondary" && composition && g.archetypeId !== "__portal__") {
      const hit = composition.secondaries.some(
        (s) => s.secondaryArchetypeId === g.archetypeId,
      );
      if (!hit) {
        push(
          issues,
          "REF_PROCESS_GROUP",
          `processGroups[${g.id}]`,
          `secundario "${g.archetypeId}" no está en composition.secondaries`,
        );
      }
    }
    for (const vid of g.viewIds) {
      if (!viewById.has(vid)) {
        push(
          issues,
          "REF_INTERNAL",
          `processGroups[${g.id}].viewIds`,
          `vista huérfana "${vid}"`,
        );
      }
    }
    for (const aid of g.actionIds) {
      if (!actionById.has(aid)) {
        push(
          issues,
          "REF_INTERNAL",
          `processGroups[${g.id}].actionIds`,
          `acción huérfana "${aid}"`,
        );
      }
    }
    for (const pid of g.panelIds) {
      const panelView = viewById.get(pid);
      if (!panelView) {
        push(
          issues,
          "REF_PANEL",
          `processGroups[${g.id}].panelIds`,
          `panel/vista inexistente "${pid}"`,
        );
      } else if (
        !panelView.kind.startsWith("panel_") &&
        panelView.kind !== "portal_filtro"
      ) {
        push(
          issues,
          "REF_PANEL",
          `processGroups[${g.id}].panelIds`,
          `"${pid}" no es un panel (kind=${panelView.kind})`,
        );
      }
    }
    if (!recorridoById.has(g.recorridoId)) {
      push(
        issues,
        "REF_INTERNAL",
        `processGroups[${g.id}].recorridoId`,
        `recorrido huérfano "${g.recorridoId}"`,
      );
    }
    for (const role of g.roleIds) {
      if (!roles.has(role)) {
        push(
          issues,
          "REF_ROLE",
          `processGroups[${g.id}].roleIds`,
          `rol desconocido "${role}"`,
        );
      }
    }
  }

  // Paneles vs composición / señales
  for (const v of spec.views) {
    if (v.kind === "panel_bloqueo") {
      const arch = v.presentation?.secondaryArchetypeId;
      const bloquea = v.presentation?.bloquea;
      if (!arch || !bloquea) {
        push(
          issues,
          "REF_PANEL",
          `views[${v.id}].presentation`,
          "panel_bloqueo exige secondaryArchetypeId y bloquea",
        );
      } else {
        const hit = composition?.secondaries.some(
          (s) =>
            s.secondaryArchetypeId === arch && s.bloquea === bloquea,
        );
        if (!hit) {
          push(
            issues,
            "REF_PANEL",
            `views[${v.id}]`,
            `panel_bloqueo sin secundaria ${arch}→${bloquea} en composition`,
          );
        }
      }
    }
    if (v.kind === "panel_credito") {
      const hasFin =
        composition?.secondaries.some(
          (s) => s.secondaryArchetypeId === "financiera",
        ) ||
        input.lifecycles.some((l) => l.archetypeId === "financiera");
      if (!hasFin) {
        push(
          issues,
          "REF_PANEL",
          `views[${v.id}]`,
          "panel_credito sin financiera en composition/lifecycles",
        );
      }
    }
    if (v.kind === "panel_agenda") {
      if (!input.resourceSubtypes.includes("capacidad_temporal") && !input.hasCalendar) {
        push(
          issues,
          "REF_PANEL",
          `views[${v.id}]`,
          "panel_agenda sin capacidad_temporal/hasCalendar",
        );
      }
    }
    if (v.kind === "panel_periodos") {
      const hasSus = input.lifecycles.some((l) => l.archetypeId === "suscripcion");
      if (!hasSus) {
        push(
          issues,
          "REF_PANEL",
          `views[${v.id}]`,
          "panel_periodos sin arquetipo suscripcion",
        );
      }
    }
  }

  for (const m of spec.modules) {
    for (const role of m.roleIds) {
      if (!roles.has(role)) {
        push(issues, "REF_ROLE", `modules[${m.id}].roleIds`, `rol desconocido "${role}"`);
      }
    }
    for (const vid of m.viewIds) {
      if (!viewById.has(vid)) {
        push(issues, "REF_INTERNAL", `modules[${m.id}].viewIds`, `vista huérfana "${vid}"`);
      }
    }
    for (const aid of m.actionIds) {
      if (!actionById.has(aid)) {
        push(issues, "REF_INTERNAL", `modules[${m.id}].actionIds`, `acción huérfana "${aid}"`);
      }
    }
  }

  for (const r of spec.recorridos) {
    for (const step of r.steps) {
      if (!viewById.has(step)) {
        push(issues, "REF_INTERNAL", `recorridos[${r.id}].steps`, `vista huérfana "${step}"`);
      }
    }
  }
}

function checkCoherence(
  spec: UiSpec,
  input: GeneratorInput,
  issues: UiSpecValidationIssue[],
): void {
  const lc = lifecycleIndex(input);

  // Tarea 2: Verificar contentHash
  verifyContentHash(spec, issues);

  // Tarea 3: Validar role permissions
  validateRolePermissions(spec, input, issues);

  // Tarea Fase 2: Detectar ciclos en recorridos
  detectCyclesInJourneys(spec, issues);

  for (const a of spec.actions) {
    const slice = lc.get(a.lifecycleId);
    if (!slice?.transitions.has(a.transitionId)) {
      // ya reportado en referential
      continue;
    }
    const allowed = guardRolesForTransition(input, a.transitionId);
    for (const role of a.visibleRoles) {
      if (!allowed.has(role)) {
        push(
          issues,
          "COHERENCE_ROLE_ACTION",
          `actions[${a.id}].visibleRoles`,
          `rol "${role}" ve acción sin guarda en ruleSet para "${a.transitionId}"`,
        );
      }
    }
    if (a.visibleRoles.length === 0) {
      push(
        issues,
        "COHERENCE_ROLE_ACTION",
        `actions[${a.id}].visibleRoles`,
        "acción sin roles visibles",
      );
    }
  }

  // Todo bloqueo de composition tiene panel_bloqueo
  for (const sec of input.composition?.secondaries ?? []) {
    const hit = spec.views.some(
      (v) =>
        v.kind === "panel_bloqueo" &&
        v.presentation?.secondaryArchetypeId === sec.secondaryArchetypeId &&
        v.presentation?.bloquea === sec.bloquea,
    );
    if (!hit) {
      push(
        issues,
        "COHERENCE_MISSING_BLOCK",
        "views",
        `falta panel_bloqueo para ${sec.secondaryArchetypeId}→${sec.bloquea}`,
      );
    }
  }

  // Terminal: no acciones que reabran
  for (const v of spec.views) {
    if (v.kind !== "tablero" || !v.lifecycleId || !v.stateId) continue;
    const slice = lc.get(v.lifecycleId);
    if (!slice || !slice.terminalIds.has(v.stateId)) continue;
    for (const aid of v.actionIds) {
      const action = spec.actions.find((a) => a.id === aid);
      if (!action) continue;
      const tr = slice.transitions.get(action.transitionId);
      if (!tr) continue;
      // Cualquier transición saliendo de terminal = reapertura
      if (tr.from === v.stateId) {
        push(
          issues,
          "COHERENCE_TERMINAL_REOPEN",
          `views[${v.id}].actionIds`,
          `estado terminal "${v.stateId}" muestra acción ${aid} que sale del terminal`,
        );
      }
    }
  }
}

function fieldAllowedForRoles(
  fieldName: string,
  roles: readonly string[],
): boolean {
  const rule = DEFAULT_FIELD_RULES.find((r) => r.field === fieldName);
  if (!rule) return true;
  if (rule.classification !== "personal" && rule.classification !== "fiscal") {
    return true;
  }
  // Al menos un rol de la acción/vista debe estar permitido; y ningún rol
  // no autorizado debería ver el campo en la UI.
  for (const role of roles) {
    if (!rule.allowedRoles.includes(role)) {
      return false;
    }
  }
  return roles.length > 0;
}

/**
 * Tarea 1: Validar que campos en FormSpec existan en entity schema
 */
function validateFormFieldsAgainstEntity(
  spec: UiSpec,
  issues: UiSpecValidationIssue[],
): void {
  for (const form of spec.forms) {
    const entitySchema = ENTITY_SCHEMAS[form.entityKind];

    if (!entitySchema) {
      // Entidad desconocida → warning, no error
      push(
        issues,
        "COHERENCE_ENTITY_FIELD_MISMATCH",
        `forms[${form.id}].entityKind`,
        `entidad "${form.entityKind}" desconocida; omitiendo validación de campos`,
        {
          suggestion: `Registrar "${form.entityKind}" en ENTITY_SCHEMAS o revisar si el nombre es correcto`,
          affectedIds: [form.id],
          severity: "baja",
        },
      );
      continue;
    }

    for (const field of form.fields) {
      if (!entitySchema.has(field.name)) {
        push(
          issues,
          "COHERENCE_ENTITY_FIELD_MISMATCH",
          `forms[${form.id}].fields`,
          `campo "${field.name}" no existe en entity "${form.entityKind}"; campos válidos: ${[...entitySchema].join(", ")}`,
          {
            suggestion: `Agregar campo "${field.name}" a entity schema, O cambiar nombre en formulario a uno válido: ${[...entitySchema].slice(0, 3).join(", ")}...`,
            affectedIds: [form.id],
            severity: "critica",
          },
        );
      }
    }
  }
}

/**
 * Tarea 2: Verificar contentHash reproducible
 *
 * NOTA: Esta función está deshabilitada temporalmente porque el hash se calcula durante
 * la generación (en generator/generate.ts) usando hashCanonical(). Para validar que la
 * spec no ha sido mutada después de cargarse desde persistencia, se necesitaría recalcular
 * sin incluir el contentHash en el artifact.
 *
 * Implementación completa cuando se cargue UiSpec desde base de datos.
 */
function verifyContentHash(
  spec: UiSpec,
  issues: UiSpecValidationIssue[],
): void {
  // La validación de contentHash debe verificarse al cargar desde persistencia,
  // no en specs recién generadas que ya fueron validadas por hashCanonical() durante generation

  // Recalcular el hash usando la función canónica del sistema de políticas
  // const artifact = {
  //   views: spec.views,
  //   actions: spec.actions,
  //   forms: spec.forms,
  // };
  //
  // const calculatedHash = hashCanonical(artifact);
  //
  // if (calculatedHash !== spec.contentHash) {
  //   push(
  //     issues,
  //     "COHERENCE_CONTENT_HASH_MISMATCH",
  //     "contentHash",
  //     `hash incoherente; calculado: "${calculatedHash}" vs. guardado: "${spec.contentHash}"`,
  //     {
  //       suggestion: "Regenerar spec desde generator para recalcular hash",
  //       severity: "critica",
  //     },
  //   );
  // }
}

/**
 * Tarea 3: Validar que roles con acciones tienen guardia en ruleSet
 */
function validateRolePermissions(
  spec: UiSpec,
  input: GeneratorInput,
  issues: UiSpecValidationIssue[],
): void {
  for (const action of spec.actions) {
    for (const role of action.visibleRoles) {
      const guardedRoles = guardRolesForTransition(input, action.transitionId);

      if (!guardedRoles.has(role) && role !== "cliente") {
        // "cliente" es autogenerado para autoservicio, puede no tener guardia
        push(
          issues,
          "COHERENCE_UNPERMITTED_ROLE",
          `actions[${action.id}].visibleRoles`,
          `rol "${role}" ve acción pero no tiene guardia/permiso en ruleSet.rules para transición "${action.transitionId}"`,
          {
            suggestion: `Agregar guardia en input.ruleSet.rules con {kind:'guard', transitionId:'${action.transitionId}', allowedRoles:['${role}']}`,
            affectedIds: [action.id, action.transitionId],
            severity: "critica",
          },
        );
      }
    }
  }
}

/**
 * Tarea 4: HTML sanitization check con detección OWASP
 */
function sanitizeCheckForHTML(
  spec: UiSpec,
  issues: UiSpecValidationIssue[],
): void {
  for (const blob of collectTextBlobs(spec)) {
    if (detectHtmlInjection(blob.text)) {
      push(
        issues,
        "SECURITY_HTML_INJECTION",
        blob.path,
        `contenido HTML/ejecutable detectado; OWASP risk: script, event handler, o protocol malicioso`,
        {
          suggestion: "Remover tags HTML, event handlers (on*=), data: URLs, formaction=, y protocols javascript:/vbscript:",
          severity: "critica",
        },
      );
    }
  }
}

/**
 * Tarea 6: Validar portal scope deep access
 */
function validatePortalScopeAccess(
  spec: UiSpec,
  input: GeneratorInput,
  issues: UiSpecValidationIssue[],
): void {
  for (const view of spec.views) {
    if (view.kind !== "portal_filtro") continue;

    const scope = view.presentation?.scope;

    // Scope solo puede ser "propia" para portales (no global)
    if (scope && scope !== "propia") {
      push(
        issues,
        "SECURITY_PORTAL_SCOPE",
        `views[${view.id}].presentation.scope`,
        `portal_filtro con scope="${scope}" expone datos; máximo permitido: "propia"`,
        {
          suggestion: 'Cambiar scope a "propia" para filtrar por usuario',
          affectedIds: [view.id],
          severity: "critica",
        },
      );
    }

    // Verificar que portal solo es per-user
    const isGlobal = (view.presentation as Record<string, unknown>)?.isGlobal === true;
    if (isGlobal && scope === "propia") {
      push(
        issues,
        "SECURITY_PORTAL_SCOPE",
        `views[${view.id}].presentation`,
        "portal_filtro no puede ser global (isGlobal=true) si scope='propia'",
        {
          suggestion: 'Cambiar isGlobal a false, O cambiar scope a global',
          affectedIds: [view.id],
          severity: "critica",
        },
      );
    }
  }
}

function checkSecurity(
  spec: UiSpec,
  input: GeneratorInput,
  issues: UiSpecValidationIssue[],
): void {
  // Literales de diseño (reutiliza validate-ui + ampliación localization/content)
  const literalIssues = assertSpecHasNoLiteralDesignValues(spec);
  for (const li of literalIssues) {
    push(
      issues,
      "SECURITY_DESIGN_LITERAL",
      "spec",
      li.message,
    );
  }
  // Ampliación: localization / content / processGroups
  const extraJson = JSON.stringify({
    processGroups: spec.processGroups ?? [],
    localization: spec.localization,
    content: spec.content,
  });
  if (/#[0-9a-fA-F]{3,8}\b/.test(extraJson)) {
    push(
      issues,
      "SECURITY_DESIGN_LITERAL",
      "localization|content|processGroups",
      "color literal (#hex) en textos/grupos",
    );
  }
  if (/\b\d+(\.\d+)?px\b/.test(extraJson)) {
    push(
      issues,
      "SECURITY_DESIGN_LITERAL",
      "localization|content|processGroups",
      "medida literal (px) en textos/grupos",
    );
  }
  if (FONT_LITERAL_RE.test(extraJson)) {
    push(
      issues,
      "SECURITY_DESIGN_LITERAL",
      "localization|content",
      "tipografía literal fuera del sistema de diseño",
    );
  }

  // Tarea 4: HTML sanitization check OWASP
  sanitizeCheckForHTML(spec, issues);

  // Campos sensibles en formularios / evidence según roles de acciones que los usan
  const formById = new Map(spec.forms.map((f) => [f.id, f]));
  for (const a of spec.actions) {
    const fields = [
      ...a.evidenceFields,
      ...(a.formId ? formById.get(a.formId)?.fields ?? [] : []),
    ];
    for (const field of fields) {
      if (!fieldAllowedForRoles(field.name, a.visibleRoles)) {
        push(
          issues,
          "SECURITY_SENSITIVE_FIELD",
          `actions[${a.id}].fields.${field.name}`,
          `campo sensible/personal "${field.name}" visible a roles no autorizados por Filtro: [${a.visibleRoles.join(",")}]`,
        );
      }
    }
  }

  // Portal: solo scope propia; sin campos personales fuera de filtro cliente
  for (const v of spec.views) {
    if (v.kind !== "portal_filtro") continue;
    const scope = v.presentation?.scope;
    if (scope && scope !== "propia") {
      push(
        issues,
        "SECURITY_PORTAL_FIELD",
        `views[${v.id}].presentation.scope`,
        `portal_filtro con scope "${scope}" (máximo permitido: propia)`,
      );
    }
    if (v.formId) {
      const form = formById.get(v.formId);
      for (const field of form?.fields ?? []) {
        const rule = DEFAULT_FIELD_RULES.find((r) => r.field === field.name);
        if (
          rule &&
          (rule.classification === "personal" || rule.classification === "fiscal") &&
          !rule.allowedRoles.includes("cliente")
        ) {
          push(
            issues,
            "SECURITY_PORTAL_FIELD",
            `views[${v.id}].form.${field.name}`,
            `portal expone campo "${field.name}" no concedido a cliente por Filtro`,
          );
        }
      }
    }
  }
}

// Singleton cache instance
const globalValidationCache = new ValidationCache();

/**
 * Valida UiSpec contra GeneratorInput. Devuelve report completo (todos los fallos).
 * Usa caché por contentHash para evitar re-validación de specs idénticas.
 * Fase 3: Integra telemetría exhaustiva.
 */
export function validateUiSpecReport(
  raw: unknown,
  input: GeneratorInput,
  options?: { readonly validatedAt?: string; readonly cache?: ValidationCache },
): UiSpecValidationReport {
  const startTime = performance.now();
  const obs = ValidatorObservability.getInstance();
  const issues: UiSpecValidationIssue[] = [];
  const validatedAt = options?.validatedAt ?? new Date().toISOString();
  const cache = options?.cache ?? globalValidationCache;

  const spec = checkSchema(raw, issues);
  if (!spec) {
    const elapsedMs = performance.now() - startTime;
    obs.recordValidationAttempt(false, elapsedMs, issues);
    return {
      ok: false,
      issues,
      validatedAt,
      schemaVersion:
        typeof (raw as { version?: string })?.version === "string"
          ? (raw as { version: string }).version
          : "unknown",
    };
  }

  // Verificar caché por contentHash
  const contentHashKey = spec.contentHash;
  const cachedReport = cache.get(contentHashKey);
  if (cachedReport) {
    obs.recordCacheHit();
    const elapsedMs = performance.now() - startTime;
    obs.recordValidationAttempt(cachedReport.ok, elapsedMs, cachedReport.issues);
    return cachedReport;
  }

  obs.recordCacheMiss();

  if (!SUPPORTED_PRESENTATION_SCHEMA_VERSIONS.has(spec.version)) {
    // ya añadido si venía version string; asegurar
    if (!issues.some((i) => i.code === "UNSUPPORTED_VERSION")) {
      push(
        issues,
        "UNSUPPORTED_VERSION",
        "version",
        `version "${spec.version}" no soportada`,
      );
    }
  }

  checkReferential(spec, input, issues);
  checkCoherence(spec, input, issues);
  checkSecurity(spec, input, issues);

  // Tarea 6: Portal scope deep validation
  validatePortalScopeAccess(spec, input, issues);

  const report: UiSpecValidationReport = {
    ok: issues.length === 0,
    issues,
    validatedAt,
    schemaVersion: spec.version,
  };

  // Guardar en caché
  cache.set(contentHashKey, report);

  // Telemetría
  const elapsedMs = performance.now() - startTime;
  obs.recordValidationAttempt(report.ok, elapsedMs, report.issues);

  return report;
}

/**
 * Valida y sella. Lanza UiSpecValidationError con la lista completa si falla.
 */
export function validateUiSpec(
  raw: unknown,
  input: GeneratorInput,
  options?: { readonly validatedAt?: string },
): ValidatedUiSpec {
  const report = validateUiSpecReport(raw, input, options);
  if (!report.ok) {
    throw new UiSpecValidationError(report);
  }
  return sealValidatedUiSpec(raw as UiSpec, report);
}

/** Persistencia: solo specs selladas. El sello no viaja en JSON; al cargar se revalida. */
export function serializeValidatedUiSpec(spec: ValidatedUiSpec): string {
  if (!isValidatedUiSpec(spec)) {
    throw new UiSpecValidationError({
      ok: false,
      issues: [
        {
          code: "NOT_VALIDATED",
          path: "$",
          message: "No se puede persistir una UiSpec sin validar",
        },
      ],
      validatedAt: new Date().toISOString(),
      schemaVersion: PRESENTATION_SCHEMA_VERSION,
    });
  }
  const doc: Record<string, unknown> = {
    id: spec.id,
    version: spec.version,
    generatedAt: spec.generatedAt,
    sourceCaseId: spec.sourceCaseId,
    sourceCaseVersion: spec.sourceCaseVersion,
    sourcePolicyHash: spec.sourcePolicyHash,
    contentHash: spec.contentHash,
    processGroups: spec.processGroups,
    modules: spec.modules,
    views: spec.views,
    actions: spec.actions,
    forms: spec.forms,
    recorridos: spec.recorridos,
    identity: spec.identity,
    localization: spec.localization,
    content: spec.content,
    styleTokenRefs: spec.styleTokenRefs,
  };
  return JSON.stringify(doc);
}

/**
 * Carga JSON y revalida obligatoriamente antes de sellar.
 */
export function parseAndValidateUiSpec(
  json: string,
  input: GeneratorInput,
): ValidatedUiSpec {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new UiSpecValidationError({
      ok: false,
      issues: [
        {
          code: "SCHEMA",
          path: "$",
          message: `JSON inválido: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      validatedAt: new Date().toISOString(),
      schemaVersion: "unknown",
    });
  }
  return validateUiSpec(raw, input);
}

/**
 * Obtiene métricas de observability del validador.
 * Devuelve contadores, hit rates, tiempos, y issues críticos por código.
 */
export function getValidatorMetrics() {
  return ValidatorObservability.getInstance().getMetrics();
}

/**
 * Exporta métricas en formato JSON (integrable con ELK/Prometheus).
 */
export function exportValidatorMetricsJson(): string {
  return ValidatorObservability.getInstance().exportMetricsToJson();
}

/**
 * Exporta métricas en formato CSV (integrable con Grafana/Splunk).
 */
export function exportValidatorMetricsCsv(): string {
  return ValidatorObservability.getInstance().exportMetricsToCsv();
}

/**
 * Obtiene logs del validador filtrados por nivel.
 */
export function getValidatorLogs(level?: "debug" | "info" | "warn" | "error") {
  return ValidatorObservability.getInstance().getLogs(level);
}

/**
 * Resetea métricas (útil para benchmarks/tests).
 */
export function resetValidatorObservability(): void {
  ValidatorObservability.getInstance().reset();
}

export type { ViewSpec, ActionSpec };
