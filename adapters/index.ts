/**
 * Adaptadores externos — estado de construcción.
 * Orden: BD real → Playwright → LLM real.
 */

export type AdapterId =
  | "sqlite_event_store"
  | "postgres_event_store"
  | "sqlite_vault_store"
  | "playwright"
  | "llm";

export interface AdapterStatus {
  readonly id: AdapterId;
  readonly built: boolean;
  readonly notes: string;
}

export function adapterInventory(): readonly AdapterStatus[] {
  return [
    {
      id: "sqlite_event_store",
      built: true,
      notes: "SqliteEventStore (better-sqlite3) implementa EventStore append-only",
    },
    {
      id: "postgres_event_store",
      built: true,
      notes:
        "PostgresEventStore async: RLS, trigger append-only, stream_version, outbox, identidad cifrada",
    },
    {
      id: "sqlite_vault_store",
      built: true,
      notes:
        "SqliteVaultStore: Gestión de documentos append-only con control de acceso por roleId, rechaza duplicados por hash",
    },
    {
      id: "playwright",
      built: true,
      notes:
        "E2E humo por perfil: arranque, transición, rechazo Juez, idempotencia, persistencia, axe + móvil",
    },
    {
      id: "llm",
      built: true,
      notes:
        "llm/: adaptador único (OpenAI + heurístico + cassettes), Zod, timeout/reintento, minimización RGPD, log sin PII",
    },
  ];
}

export { SqliteEventStore } from "./sqlite-event-store.js";
export { PostgresEventStore } from "./postgres-event-store.js";
export { PostgresParteIdentityStore } from "./postgres-identity-store.js";
export { SqliteVaultStore } from "./sqlite-vault-store.js";
export { claimUnpublished, markPublished, drainOutbox } from "./outbox.js";
export {
  LlmClient,
  createLlmClientFromEnv,
  OpenAiLlmAdapter,
  HeuristicLlmAdapter,
  CassetteLlmAdapter,
} from "../llm/index.js";
