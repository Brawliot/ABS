/**
 * Clasificación de capa 1: segmento, familia, categoría, zona.
 * Etiquetas sobre Parte, Oferta y Recurso; todo cambio es un evento.
 */

export type ClassificationTarget = "parte" | "oferta" | "recurso";

export type ClassificationDimension =
  | "segmento"
  | "familia"
  | "categoria"
  | "zona";

export interface LabelAssignment {
  readonly target: ClassificationTarget;
  readonly subjectId: string;
  readonly dimension: ClassificationDimension;
  readonly value: string;
}

export interface ClassificationDef {
  /** Asignaciones iniciales (semilla; también generan eventos al activar). */
  readonly assignments?: readonly LabelAssignment[];
}

/** Evento de cambio de etiqueta (capa 1; append-only). */
export interface ClassificationChangeEvent {
  readonly id: string;
  readonly kind: "clasificacion";
  readonly occurredAt: string;
  readonly actorId: string;
  /** manual | regla */
  readonly source: "manual" | "regla";
  readonly ruleId?: string;
  readonly target: ClassificationTarget;
  readonly subjectId: string;
  readonly dimension: ClassificationDimension;
  /** null = quitar etiqueta en esa dimensión. */
  readonly value: string | null;
  readonly previousValue: string | null;
}

export interface ClassificationSnapshot {
  /** target → subjectId → dimension → value */
  readonly labels: Readonly<
    Record<
      ClassificationTarget,
      Readonly<Record<string, Readonly<Partial<Record<ClassificationDimension, string>>>>>
    >
  >;
  readonly events: readonly ClassificationChangeEvent[];
}

export class ClassificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClassificationError";
  }
}

export function emptyClassificationSnapshot(): ClassificationSnapshot {
  return {
    labels: { parte: {}, oferta: {}, recurso: {} },
    events: [],
  };
}

export function seedClassification(
  def: ClassificationDef,
  opts: { readonly at: string; readonly actorId: string },
): ClassificationSnapshot {
  let snap = emptyClassificationSnapshot();
  for (const a of def.assignments ?? []) {
    const ev: ClassificationChangeEvent = {
      id: `seed:${a.target}:${a.subjectId}:${a.dimension}`,
      kind: "clasificacion",
      occurredAt: opts.at,
      actorId: opts.actorId,
      source: "manual",
      target: a.target,
      subjectId: a.subjectId,
      dimension: a.dimension,
      value: a.value,
      previousValue: null,
    };
    snap = applyClassificationEvent(snap, ev);
  }
  return snap;
}

export function applyClassificationEvent(
  snapshot: ClassificationSnapshot,
  event: ClassificationChangeEvent,
): ClassificationSnapshot {
  if (event.kind !== "clasificacion") {
    throw new ClassificationError("Evento no es de clasificación");
  }
  const byTarget = {
    parte: { ...snapshot.labels.parte },
    oferta: { ...snapshot.labels.oferta },
    recurso: { ...snapshot.labels.recurso },
  };
  const subjects = { ...(byTarget[event.target] ?? {}) };
  const dims = { ...(subjects[event.subjectId] ?? {}) };
  const previous = dims[event.dimension] ?? null;

  if (event.value === null) {
    delete dims[event.dimension];
  } else {
    dims[event.dimension] = event.value;
  }

  if (Object.keys(dims).length === 0) {
    delete subjects[event.subjectId];
  } else {
    subjects[event.subjectId] = dims;
  }
  byTarget[event.target] = subjects;

  const normalized: ClassificationChangeEvent = {
    ...event,
    previousValue: event.previousValue ?? previous,
  };

  return {
    labels: byTarget,
    events: [...snapshot.events, normalized],
  };
}

/** Emite un cambio (manual o por regla) y lo aplica. */
export function changeLabel(
  snapshot: ClassificationSnapshot,
  input: {
    readonly id: string;
    readonly occurredAt: string;
    readonly actorId: string;
    readonly source: "manual" | "regla";
    readonly ruleId?: string;
    readonly target: ClassificationTarget;
    readonly subjectId: string;
    readonly dimension: ClassificationDimension;
    readonly value: string | null;
  },
): { readonly snapshot: ClassificationSnapshot; readonly event: ClassificationChangeEvent } {
  const previous =
    snapshot.labels[input.target]?.[input.subjectId]?.[input.dimension] ?? null;
  const event: ClassificationChangeEvent = {
    id: input.id,
    kind: "clasificacion",
    occurredAt: input.occurredAt,
    actorId: input.actorId,
    source: input.source,
    ...(input.ruleId !== undefined ? { ruleId: input.ruleId } : {}),
    target: input.target,
    subjectId: input.subjectId,
    dimension: input.dimension,
    value: input.value,
    previousValue: previous,
  };
  return { snapshot: applyClassificationEvent(snapshot, event), event };
}

export function getLabel(
  snapshot: ClassificationSnapshot,
  target: ClassificationTarget,
  subjectId: string,
  dimension: ClassificationDimension,
): string | undefined {
  return snapshot.labels[target]?.[subjectId]?.[dimension];
}

/**
 * Snapshot de etiquetas tal como estaban justo antes de `atIso`
 * (para vinculación at_create / reconstrucción).
 */
export function labelsAt(
  events: readonly ClassificationChangeEvent[],
  atIso: string,
): ClassificationSnapshot {
  let snap = emptyClassificationSnapshot();
  for (const ev of events) {
    if (ev.occurredAt > atIso) break;
    snap = applyClassificationEvent(snap, ev);
  }
  return snap;
}

export function subjectMatchesClassification(
  snapshot: ClassificationSnapshot,
  selector: {
    readonly target: ClassificationTarget;
    readonly dimension: ClassificationDimension;
    readonly value: string;
  },
  subjectId: string,
): boolean {
  return getLabel(snapshot, selector.target, subjectId, selector.dimension) ===
    selector.value;
}
