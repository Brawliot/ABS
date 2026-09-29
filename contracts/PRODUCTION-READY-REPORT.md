# Informe — preparación producción (PostgreSQL, backups, despliegue UE)

Fecha: 2026-09-28

## 0. Residuales de plantillas

### 0.1 `enrichFormForTransition`
- **Eliminados** defaults que hacían las reglas menos estrictas (`dias_impago:0`, `importe:0`, `hito_*_cobrado:true`, anclas legales inventadas, valores que desactivaban restricciones).
- **Conservados** solo: `parte_id`, `evidence.kind` del lifecycle, `evidence.referenceType` tipado por regla de cumplimiento (no ablanda umbrales).
- **Camino feliz E2E** movido a `tests/e2e/happy-path-fields.ts` (journeys, adverse, smoke).
- **Pruebas nuevas:** `tests/policy-templates.missing-fields.test.ts` — dato ausente ⇒ rechazo.

### 0.2 `tpl.aviso_plazo`
- Ya **no** compila a `dataRetention`.
- Genera Insight de alerta vía `buildAvisoPlazoInsight` / `prioritizeAvisoPlazo` (Priorizador, tope de interrupciones).
- **No bloquea** transiciones.
- Prueba: `tests/aviso-plazo.gestoria.test.ts` (p06).

---

## 1. PostgreSQL

| Pieza | Estado |
|-------|--------|
| Adaptador `PostgresEventStore` | Sí (`adapters/postgres-event-store.ts`) |
| Conformidad InMemory + SQLite + PG | `tests/event-store.conformance.test.ts` (PG si `ABS_POSTGRES_URL`) |
| Append-only (GRANT + trigger) | Migración `001` |
| UNIQUE `(company_id, subject_id, stream_version)` | Sí |
| RLS por `abs.company_id` | Sí |
| Identidad cifrada AES-GCM | `adapters/postgres-identity-store.ts` + esquema `abs_identity` |
| Migraciones UP/DOWN | `db/migrations/*`, CLI `npm run db:migrate` |
| Outbox atómico | Misma TX que el evento; `adapters/outbox.ts` |
| Snapshots (si replay lento) | Migración `002` (tabla; uso opcional) |
| SQLite | Se mantiene para dev/tests locales |

---

## 2. Copias de seguridad — PROPUESTA PARA EL USUARIO

| Objetivo | Propuesta |
|----------|-----------|
| **RPO** (pérdida máxima de datos) | ≤ 5 minutos (WAL archiving / PITR del proveedor) |
| **RTO** (tiempo de recuperación) | ≤ 1 hora para staging; ≤ 4 horas para producción piloto |
| Almacenamiento | Solo UE (mismo proveedor que la BD) |
| Prueba | `scripts/restore-verify.sh` + `tests/backup.restore.test.ts` (requiere `ABS_POSTGRES_RESTORE_URL`) |

Una copia no verificada **no cuenta**. Programar restore drill mensual.

---

## 3. Despliegue

- `Dockerfile` multi-stage + `docker-compose.yml` (postgres + app local).
- Entornos: `development` / `staging` / `production` vía `ABS_ENV` + secretos fuera del repo (`.env.example`).
- CI: typecheck + audit + suite + Playwright; migraciones PG en job; staging auto en `main`; producción con Environment approval.
- HTTPS: obligación operativa del reverse proxy del proveedor; arranque con `assertProductionSecurityConfig`.
- Observabilidad: `observability/metrics.ts` (p95, rechazos Juez, errores, coste LLM) + logs JSON sin PII.

### DECISIÓN DEL USUARIO — proveedores UE (piloto ~10 empresas)

| Proveedor | Región UE | BD gestionada + backups | Coste estimado/mes* |
|-----------|-----------|-------------------------|---------------------|
| **Scaleway** (Paris/Amsterdam) | Sí | Managed PostgreSQL + Object Storage | ~40–80 € |
| **OVHcloud** (Gravelines/Strasbourg) | Sí | Public Cloud Databases + backup | ~35–70 € |
| **Hetzner Cloud** (Falkenstein/Nuremberg) | Sí | Cloud + self-managed PG o Managed | ~25–55 € |

\*VM pequeña + PG managed + almacenamiento backup. Sin cuentas creadas; elegir uno e instalar el CLI/registry correspondiente.

---

## 4. Rendimiento

- Umbrales (`quality/config.ts`): replay 100k ≤ 10 s; p95 transición ≤ 200 ms.
- Benchmark: `tests/event-store.perf.test.ts`
  - Suite diaria: 5 000 eventos (umbral escalado).
  - Oficial 100k: `ABS_PERF_FULL=1` + `ABS_POSTGRES_URL`.

### Parte 0 — verificación previa (2026-09-28, verde)

Entorno: `docker compose` (postgres `:5432` + postgres-restore `:5433`), `ABS_POSTGRES_URL`, `ABS_POSTGRES_RESTORE_URL`, `ABS_PERF_FULL=1`.

| Comprobación | Resultado |
|--------------|-----------|
| Conformidad InMemory / SQLite / PostgreSQL | 12/12 (incl. PG append, aislamiento RLS, trigger UPDATE/DELETE, outbox atómico) |
| RLS + trigger append-only | Verde (duplicado rechazado; UPDATE/DELETE rechazados) |
| Restore `pg_dump` → restore → count | Verde (`tests/backup.restore.test.ts`) |
| Restore + replay de payloads | 50/50 ids idénticos tras restore |
| Suite completa | **437 passed**, 1 skipped (Playwright scaffold sin `ABS_PLAYWRIGHT`; **0 skips** en PG/RLS/backup/perf) |
| CI | Servicio PostgreSQL + `scripts/pg-gate.mjs` (skip = fallo) + re-chequeo JSON sin skips |

**Cifras reales vs umbrales:**

| Métrica | Medido | Umbral | Margen |
|---------|--------|--------|--------|
| Replay 100k PostgreSQL | **528 ms** | 10 000 ms | ~19× bajo umbral |
| Append 100k PostgreSQL (lote 500) | **5 225 ms** | (informativo) | — |
| Replay 100k SQLite (`ABS_PERF_FULL=1`) | **~518–1 000 ms** (suite total ~16,7 s incl. append) | 10 000 ms | OK |
| p95 append/transición (SQLite BD real) | **1 ms** | 200 ms | OK |

Correcciones en origen (sin editar pruebas): detección de id duplicado en buffer PG (`knownIds`); cache `seq` + statements preparados + WAL en SQLite; CI/pg-gate ya exigían PG + `ABS_PERF_FULL`.

### Resultado residuales (suite)

- Conformidad EventStore: InMemory + SQLite + PostgreSQL (con URL).
- `tsc` + Playwright (humo, journeys, adversos, auth) en verde cuando `ABS_PLAYWRIGHT=1`.

---

## 5. Pasos del usuario para el primer despliegue

1. Elegir proveedor UE de la tabla y crear proyecto + secretos (`ABS_SESSION_SECRET` ≥32, `ABS_IDENTITY_KEY`, `ABS_POSTGRES_URL`).
2. `docker build -t abs-app:1 .` y publicar al registry del proveedor.
3. Provisionar PostgreSQL managed (UE) con backups/PITR activos.
4. `ABS_POSTGRES_URL=… npm run db:migrate`.
5. Desplegar contenedor con HTTPS (proxy) y health `/health`.
6. Ejecutar un restore drill: `pg_dump` → `scripts/restore-verify.sh`.
7. Configurar Environment `production` en GitHub con reviewers obligatorios.
8. Smoke: login + una transición en staging antes de producción.

---

## 6. Archivos clave nuevos

- `db/migrations/001_*.sql`, `002_*.sql`, `db/migrate.ts`, `db/cli-migrate.ts`
- `adapters/postgres-event-store.ts`, `postgres-identity-store.ts`, `outbox.ts`
- `tests/event-store.conformance.test.ts`, `event-store.perf.test.ts`, `backup.restore.test.ts`
- `tests/e2e/happy-path-fields.ts`, `policy-templates.missing-fields.test.ts`, `aviso-plazo.gestoria.test.ts`
- `Dockerfile`, `docker-compose.yml`, `.env.example`, `observability/metrics.ts`
- `scripts/restore-verify.sh`
