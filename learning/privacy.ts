/**
 * Aislamiento multiempresa y capa agregada de perfiles (dimensión 10).
 *
 * - Todo dato (eventos, especificaciones, perfiles) pertenece a una empresa.
 * - Ninguna consulta cruza el límite salvo la capa agregada.
 * - El agregado solo publica estadísticas suficientes (≥ umbral de empresas).
 */

import { InMemoryEventStore, type EventStore } from "../core/event-store.js";
import type { AppendOnlyEvent, DomainEvent } from "../core/events.js";
import type { ProfileSnapshot } from "../core/profile.js";
import {
  BayesianTypeLearner,
  type ObjectTypeKey,
  type SufficientStats,
} from "./bayesian.js";

export type CompanyId = string;

/** Umbral mínimo de empresas para publicar un perfil agregado. */
export const AGGREGATE_MIN_COMPANIES = 5;

/** Campos permitidos en un perfil agregado publicado (allowlist). */
export const AGGREGATE_ALLOWED_KEYS = [
  "archetypeKey",
  "companyCount",
  "publishedAt",
  "features",
  "sufficient",
] as const;

/** Claves prohibidas en cualquier nivel del agregado (anti-reconstrucción). */
export const AGGREGATE_FORBIDDEN_FRAGMENT = [
  "event",
  "evento",
  "subject",
  "actor",
  "parte",
  "party",
  "companyid",
  "empresa",
  "freetext",
  "evidence",
  "reference",
  "occurredat",
  "transitionid",
] as const;

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

export class AggregateNotPublishedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AggregateNotPublishedError";
  }
}

/** Vista de EventStore acotada a una empresa: no expone datos de otras. */
export class TenantEventStore implements EventStore {
  constructor(
    readonly companyId: CompanyId,
    private readonly inner: InMemoryEventStore = new InMemoryEventStore(),
  ) {}

  append(event: DomainEvent): void {
    this.inner.append(event);
  }

  getById(id: string): AppendOnlyEvent | undefined {
    return this.inner.getById(id);
  }

  getBySubject(subjectId: string): readonly AppendOnlyEvent[] {
    return this.inner.getBySubject(subjectId);
  }

  all(): readonly AppendOnlyEvent[] {
    return this.inner.all();
  }

  subscribe(listener: Parameters<EventStore["subscribe"]>[0]): () => void {
    return this.inner.subscribe(listener);
  }

  replace(id: string, event: DomainEvent): never {
    return this.inner.replace(id, event);
  }

  remove(id: string): never {
    return this.inner.remove(id);
  }
}

interface TenantSpecRecord {
  readonly id: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

interface TenantBucket {
  readonly events: TenantEventStore;
  readonly specs: Map<string, TenantSpecRecord>;
  readonly learners: Map<ObjectTypeKey, BayesianTypeLearner>;
}

/**
 * Bóveda multiempresa: eventos, especificaciones y perfiles por empresa.
 * La única vía de lectura cruzada es {@link AggregatedProfileLayer}.
 */
export class MultiTenantVault {
  private readonly tenants = new Map<CompanyId, TenantBucket>();

  registerCompany(companyId: CompanyId): void {
    if (!companyId.trim()) {
      throw new TenantIsolationError("companyId vacío");
    }
    if (this.tenants.has(companyId)) return;
    this.tenants.set(companyId, {
      events: new TenantEventStore(companyId),
      specs: new Map(),
      learners: new Map(),
    });
  }

  private bucket(companyId: CompanyId): TenantBucket {
    const b = this.tenants.get(companyId);
    if (!b) {
      throw new TenantIsolationError(
        `Empresa no registrada o acceso denegado: ${companyId}`,
      );
    }
    return b;
  }

  eventStore(companyId: CompanyId): TenantEventStore {
    return this.bucket(companyId).events;
  }

  appendEvent(companyId: CompanyId, event: DomainEvent): void {
    this.bucket(companyId).events.append(event);
  }

  /**
   * Lectura de eventos: solo la empresa dueña.
   * Cualquier intento de leer otra empresa lanza.
   */
  readEvents(requesterId: CompanyId, ownerId: CompanyId): readonly AppendOnlyEvent[] {
    if (requesterId !== ownerId) {
      throw new TenantIsolationError(
        `Aislamiento: ${requesterId} no puede leer eventos de ${ownerId}`,
      );
    }
    return this.bucket(ownerId).events.all();
  }

  getEventById(
    requesterId: CompanyId,
    ownerId: CompanyId,
    eventId: string,
  ): AppendOnlyEvent | undefined {
    if (requesterId !== ownerId) {
      throw new TenantIsolationError(
        `Aislamiento: ${requesterId} no puede leer eventos de ${ownerId}`,
      );
    }
    return this.bucket(ownerId).events.getById(eventId);
  }

  putSpec(
    companyId: CompanyId,
    specId: string,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    this.bucket(companyId).specs.set(specId, {
      id: specId,
      payload: Object.freeze({ ...payload }),
    });
  }

  getSpec(
    requesterId: CompanyId,
    ownerId: CompanyId,
    specId: string,
  ): TenantSpecRecord | undefined {
    if (requesterId !== ownerId) {
      throw new TenantIsolationError(
        `Aislamiento: ${requesterId} no puede leer especificaciones de ${ownerId}`,
      );
    }
    return this.bucket(ownerId).specs.get(specId);
  }

  getOrCreateLearner(
    companyId: CompanyId,
    objectType: ObjectTypeKey,
    priors?: Readonly<Record<string, number>>,
  ): BayesianTypeLearner {
    const b = this.bucket(companyId);
    let learner = b.learners.get(objectType);
    if (!learner) {
      learner = new BayesianTypeLearner(objectType, priors ?? {});
      b.learners.set(objectType, learner);
    }
    return learner;
  }

  /**
   * Lectura de perfil propio: solo la empresa dueña.
   */
  readProfile(
    requesterId: CompanyId,
    ownerId: CompanyId,
    objectType: ObjectTypeKey,
  ): ProfileSnapshot | undefined {
    if (requesterId !== ownerId) {
      throw new TenantIsolationError(
        `Aislamiento: ${requesterId} no puede leer perfiles de ${ownerId}`,
      );
    }
    return this.bucket(ownerId).learners.get(objectType)?.snapshot();
  }

  /** Contribución anónima a la capa agregada (sin eventos ni Partes). */
  exportContribution(
    companyId: CompanyId,
    objectType: ObjectTypeKey,
  ): SufficientStats | undefined {
    return this.bucket(companyId).learners.get(objectType)?.exportSufficientStats();
  }

  companyIds(): readonly CompanyId[] {
    return [...this.tenants.keys()];
  }
}

/** Perfil agregado publicado: solo estadísticas suficientes anonimizadas. */
export interface PublishedAggregate {
  readonly archetypeKey: ObjectTypeKey;
  readonly companyCount: number;
  readonly publishedAt: string;
  /** Medias posteriores del pool. */
  readonly features: Readonly<Record<string, number>>;
  /** Estadísticas suficientes acumuladas (sin IDs de empresa ni eventos). */
  readonly sufficient: {
    readonly binary: Readonly<
      Record<string, { alpha: number; beta: number }>
    >;
    readonly exits: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly dwells: Readonly<
      Record<string, { shape: number; rate: number }>
    >;
  };
}

/**
 * Capa agregada: combina suficientes de N empresas del mismo arquetipo.
 * Solo publica si N ≥ {@link AGGREGATE_MIN_COMPANIES}.
 */
export class AggregatedProfileLayer {
  private readonly contributions = new Map<
    ObjectTypeKey,
    Map<CompanyId, SufficientStats>
  >();
  private readonly published = new Map<ObjectTypeKey, PublishedAggregate>();

  constructor(readonly minCompanies: number = AGGREGATE_MIN_COMPANIES) {}

  /**
   * Registra la contribución de una empresa.
   * Solo acepta SufficientStats (nunca eventos ni datos de Partes).
   */
  contribute(companyId: CompanyId, stats: SufficientStats): void {
    assertNoForbiddenPayload(stats as unknown as Record<string, unknown>);
    let byCompany = this.contributions.get(stats.objectType);
    if (!byCompany) {
      byCompany = new Map();
      this.contributions.set(stats.objectType, byCompany);
    }
    byCompany.set(companyId, stats);
    // Invalidar publicación previa si el pool cambia
    this.published.delete(stats.objectType);
  }

  contributorCount(archetypeKey: ObjectTypeKey): number {
    return this.contributions.get(archetypeKey)?.size ?? 0;
  }

  /**
   * Publica el agregado si cumple el umbral.
   * Devuelve null si hay menos empresas que el mínimo (no se publica).
   */
  tryPublish(archetypeKey: ObjectTypeKey, at = new Date().toISOString()): PublishedAggregate | null {
    const byCompany = this.contributions.get(archetypeKey);
    const n = byCompany?.size ?? 0;
    if (n < this.minCompanies) {
      this.published.delete(archetypeKey);
      return null;
    }

    const pooled = poolStats([...byCompany!.values()]);
    const features = featuresFromPooled(pooled);
    const pub: PublishedAggregate = Object.freeze({
      archetypeKey,
      companyCount: n,
      publishedAt: at,
      features: Object.freeze(features),
      sufficient: Object.freeze({
        binary: Object.freeze(pooled.binary),
        exits: Object.freeze(pooled.exits),
        dwells: Object.freeze(pooled.dwells),
      }),
    });
    assertAggregateSafe(pub);
    this.published.set(archetypeKey, pub);
    return pub;
  }

  getPublished(archetypeKey: ObjectTypeKey): PublishedAggregate | undefined {
    return this.published.get(archetypeKey);
  }

  /**
   * Priors heredables por una empresa nueva del mismo arquetipo.
   * Solo desde el agregado publicado (nunca perfiles individuales).
   */
  inheritPriors(archetypeKey: ObjectTypeKey): Readonly<Record<string, number>> {
    const pub = this.published.get(archetypeKey);
    if (!pub) {
      throw new AggregateNotPublishedError(
        `No hay agregado publicado para ${archetypeKey} (umbral ${this.minCompanies})`,
      );
    }
    return pub.features;
  }
}

function poolStats(all: readonly SufficientStats[]): {
  binary: Record<string, { alpha: number; beta: number }>;
  exits: Record<string, Record<string, number>>;
  dwells: Record<string, { shape: number; rate: number }>;
} {
  const binary: Record<string, { alpha: number; beta: number }> = {};
  const exits: Record<string, Record<string, number>> = {};
  const dwells: Record<string, { shape: number; rate: number }> = {};

  for (const s of all) {
    for (const [k, v] of Object.entries(s.binary)) {
      const cur = binary[k] ?? { alpha: 0, beta: 0 };
      binary[k] = { alpha: cur.alpha + v.alpha, beta: cur.beta + v.beta };
    }
    for (const [from, alphas] of Object.entries(s.exits)) {
      const cur = exits[from] ?? {};
      for (const [to, a] of Object.entries(alphas)) {
        cur[to] = (cur[to] ?? 0) + a;
      }
      exits[from] = cur;
    }
    for (const [k, v] of Object.entries(s.dwells)) {
      const cur = dwells[k] ?? { shape: 0, rate: 0 };
      dwells[k] = { shape: cur.shape + v.shape, rate: cur.rate + v.rate };
    }
  }
  return { binary, exits, dwells };
}

function featuresFromPooled(pooled: ReturnType<typeof poolStats>): Record<string, number> {
  const features: Record<string, number> = {};
  for (const [k, v] of Object.entries(pooled.binary)) {
    const t = v.alpha + v.beta;
    if (t > 0) features[k] = v.alpha / t;
  }
  for (const [from, alphas] of Object.entries(pooled.exits)) {
    const total = Object.values(alphas).reduce((s, a) => s + a, 0);
    if (total <= 0) continue;
    for (const [to, a] of Object.entries(alphas)) {
      features[`${from}->${to}`] = a / total;
    }
  }
  for (const [k, v] of Object.entries(pooled.dwells)) {
    if (v.rate > 0) features[k] = v.shape / v.rate;
  }
  return features;
}

function assertNoForbiddenPayload(obj: unknown, path = ""): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      assertNoForbiddenPayload(obj[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    for (const frag of AGGREGATE_FORBIDDEN_FRAGMENT) {
      if (lower.includes(frag)) {
        throw new TenantIsolationError(
          `Contribución inválida: clave prohibida "${k}" en ${path || "/"}`,
        );
      }
    }
    assertNoForbiddenPayload(v, path ? `${path}.${k}` : k);
  }
}

/** Verifica que un agregado publicado no permite reconstruir un evento. */
export function assertAggregateSafe(pub: PublishedAggregate): void {
  const keys = Object.keys(pub);
  for (const k of keys) {
    if (!(AGGREGATE_ALLOWED_KEYS as readonly string[]).includes(k)) {
      throw new TenantIsolationError(
        `Agregado inseguro: clave no permitida "${k}"`,
      );
    }
  }
  assertNoForbiddenPayload(pub.features, "features");
  assertNoForbiddenPayload(pub.sufficient, "sufficient");
  // companyCount es un entero ≥ umbral; no lista de empresas
  if (!Number.isFinite(pub.companyCount) || pub.companyCount < AGGREGATE_MIN_COMPANIES) {
    throw new TenantIsolationError("Agregado inseguro: companyCount inválido");
  }
}

/**
 * Comprueba que ningún campo del agregado permite reconstruir un evento
 * individual (sin IDs, timestamps de evento, Partes, texto libre, etc.).
 */
export function aggregateCannotReconstructEvent(pub: PublishedAggregate): boolean {
  try {
    assertAggregateSafe(pub);
  } catch {
    return false;
  }
  const json = JSON.stringify(pub);
  const banned = [
    '"id":',
    "subjectId",
    "actorId",
    "freeText",
    "occurredAt",
    "transitionId",
    "parte",
    "party",
    "evidence",
  ];
  for (const b of banned) {
    if (json.toLowerCase().includes(b.toLowerCase())) return false;
  }
  return true;
}
