/**
 * Enrutado de conexiones: una Pool por databaseUrl.
 * Garantiza que ninguna consulta de una empresa use el pool de otra URL.
 */

import { Pool } from "pg";
import { PostgresEventStore } from "../adapters/postgres-event-store.js";
import { PostgresParteIdentityStore } from "../adapters/postgres-identity-store.js";
import type { CompanyDatabaseRegistry } from "./registry.js";
import { HostingError } from "./types.js";

export class PoolRouter {
  private readonly pools = new Map<string, Pool>();
  private readonly companyToUrl = new Map<string, string>();

  constructor(
    private readonly registry: CompanyDatabaseRegistry,
    private readonly poolFactory: (url: string) => Pool = (url) =>
      new Pool({ connectionString: url, max: 8 }),
  ) {}

  /** Resuelve URL de la empresa y memoriza el vínculo company→url. */
  resolveUrl(companyId: string): string {
    const route = this.registry.require(companyId);
    const prev = this.companyToUrl.get(companyId);
    if (prev !== undefined && prev !== route.databaseUrl) {
      this.companyToUrl.set(companyId, route.databaseUrl);
    } else if (prev === undefined) {
      this.companyToUrl.set(companyId, route.databaseUrl);
    }
    return route.databaseUrl;
  }

  getPool(companyId: string): Pool {
    const url = this.resolveUrl(companyId);
    let pool = this.pools.get(url);
    if (!pool) {
      pool = this.poolFactory(url);
      this.pools.set(url, pool);
    }
    return pool;
  }

  /**
   * Falla si se intenta usar un pool cuya URL no es la registrada para la empresa.
   * Uso: wrappers / auditorías; getPool ya enruta solo a la URL correcta.
   */
  assertPoolForCompany(companyId: string, pool: Pool): void {
    const url = this.resolveUrl(companyId);
    const expected = this.pools.get(url);
    if (expected !== pool) {
      throw new HostingError(
        `Intento de cruzar bases: pool no pertenece a ${companyId}`,
        "cross_database",
      );
    }
  }

  /** Dos empresas no pueden compartir EventStore si están en URLs distintas — factory tipada. */
  eventStore(companyId: string): PostgresEventStore {
    const route = this.registry.require(companyId);
    if (route.readOnly) {
      return new ReadOnlyPostgresEventStore({
        pool: this.getPool(companyId),
        companyId,
      });
    }
    return new PostgresEventStore({
      pool: this.getPool(companyId),
      companyId,
    });
  }

  identityStore(companyId: string): PostgresParteIdentityStore {
    return new PostgresParteIdentityStore(this.getPool(companyId), companyId);
  }

  async end(): Promise<void> {
    const closing = [...this.pools.values()].map((p) => p.end());
    this.pools.clear();
    this.companyToUrl.clear();
    await Promise.all(closing);
  }
}

/** EventStore que rechaza append en modo solo lectura (migración). */
class ReadOnlyPostgresEventStore extends PostgresEventStore {
  override async append(
    _event: Parameters<PostgresEventStore["append"]>[0],
    _options?: Parameters<PostgresEventStore["append"]>[1],
  ): Promise<void> {
    throw new HostingError(
      "Empresa en modo solo lectura (migración en curso)",
      "read_only",
    );
  }
}
