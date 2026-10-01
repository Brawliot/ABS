# Auditoría Capa 1 - Almacenamiento (ABS)

**Rama**: `claude/dreamy-goodall-ryxatn`  
**Fecha**: 2026-10-01  
**Análisis de**: `adapters/`, `db/`, `core/event-store.ts`

---

## 1. Funcionamiento

### 1.1 Adapters/Stores Principales

- **SqliteEventStore** (`adapters/sqlite-event-store.ts`, 142 líneas)
  - Implementa `EventStore` con better-sqlite3
  - Modo: in-file o in-memory
  - Patrón: append-only, inmutable
  - Transacciones: Sí, pero con cache `nextSeq` local

- **PostgresEventStore** (`adapters/postgres-event-store.ts`, 261 líneas)
  - Implementa `EventStore` con pg pool
  - Patrón: append-only, async/await
  - Cache: `streamVersions` (Map) + `knownIds` (Set)
  - Transacciones: Sí, con rollback

- **PostgresParteIdentityStore** (`adapters/postgres-identity-store.ts`, 168 líneas)
  - Almacena identidad personal cifrada (AES-256-GCM)
  - Patrón: UPSERT (INSERT ON CONFLICT DO UPDATE)
  - Sin transacciones explícitas

- **InMemoryEventStore** (`core/event-store.ts`)
  - Para tests/desarrollo
  - Implementa mismo `EventStore`

### 1.2 Base de Datos

- **Motor**: PostgreSQL (con RLS) + SQLite (para dev/tests)
- **Schemas**: 
  - `abs_events`: eventos + snapshots + migraciones
  - `abs_identity`: identidades cifradas
  - `abs_outbox`: efectos externos atómicos
- **Migraciones**: 4 UP, 3 DOWN (falta 1)
  - `001`: eventos + RLS + outbox
  - `002`: snapshots
  - `003`: optimización de performance
  - `004`: documentación (sin DOWN)

### 1.3 Patrón de Escritura

- **Append-only**: Los 3 stores rejectan UPDATE/DELETE a eventos
  - Trigger en PostgreSQL: `reject_mutation()`
  - Métodos `replace()` y `remove()` lanzan excepciones
- **Mutable en identity/outbox**: UPSERT permitido
- **Transaccional**:
  - PostgreSQL: BEGIN/COMMIT/ROLLBACK explícitos
  - SQLite: `db.transaction()` con rollback automático
- **Outbox pattern**: Efectos externos atómicos con evento (BEGIN → INSERT evento + INSERT outbox → COMMIT)

### 1.4 Conexiones & Pooling

- **PostgreSQL**: Pool de conexiones (`pg.Pool`)
  - `withClient()` obtiene/libera cliente
  - Finally blocks garantizan release
  - `withCompanyContext()` setea variable de sesión `abs.company_id`
  - `synchronous_commit = OFF` para más speed
  
- **SQLite**: Conexión única por instancia
  - `close()` manual
  - WAL mode para mejor concurrencia

---

## 2. Hallazgos Identificados

### 🔴 **Hallazgo 1: Falta migración DOWN para 004_document_pk_uniqueness**

- **Ubicación**: `db/migrations/004_document_pk_uniqueness.up.sql` (sin .down.sql)
- **Descripción**: La migración 004 documenta la garantía de PK uniqueness pero no tiene rollback. Si se necesita revertir a 003, no hay script DOWN.
- **Impacto**: 
  - No se puede hacer `migrateDown()` más allá de 003
  - Limita flexibility de desarrollo/testing
  - Bloquea reproducción de issues en versión anterior
- **Severidad**: **P1** (importante)

---

### 🟡 **Hallazgo 2: Duplicación de función `deepFreeze` en 3 ubicaciones**

- **Ubicación**: 
  - `adapters/sqlite-event-store.ts:134-142`
  - `adapters/postgres-event-store.ts:252-260`
  - `core/event-store.ts:81-89`
- **Descripción**: Misma función privada copiada en 3 archivos, 27 líneas de código duplicado.
- **Impacto**: 
  - Mantenimiento (bug fix en 1 lugar no aplica a otros)
  - Inconsistencia de comportamiento si evolucionan por separado
- **Severidad**: **P2** (nice-to-have)

---

### 🟡 **Hallazgo 3: Sin manejo de errores en `JSON.parse()`**

- **Ubicación**: 
  - `adapters/postgres-event-store.ts:157, 171, 183`
  - `adapters/sqlite-event-store.ts:100, 105, 112`
- **Descripción**: `JSON.parse()` se llama sin try/catch. Si payload está corrupto en BD, crash en runtime.
- **Impacto**: 
  - Si BD contiene JSON malformado (corrupción, bug anterior), app cae
  - Sin recuperación elegante ni log de error
  - `getById()`, `getBySubject()`, `all()` pueden fallar
- **Severidad**: **P1** (importante)

---

### 🟡 **Hallazgo 4: Cache `nextSeq` en SQLite no es robusto ante reinicio**

- **Ubicación**: `adapters/sqlite-event-store.ts:16, 40, 72`
- **Descripción**: `nextSeq` se inicializa en constructor pero solo se usa como aproximación. Si instancia se cae entre SELECT MAX(seq) y INSERT, otra instancia puede usar same seq.
- **Impacto**: 
  - En dev: race condition si hay 2+ procesos accediendo same BD SQLite
  - Secuencia seq no monotónica garantizada
  - Violación de orden de eventos
- **Severidad**: **P1** (importante para dev, N/A prod si SQLite nunca es multi-instancia)

---

### 🟡 **Hallazgo 5: Cache `streamVersions` en PostgresEventStore puede desincronizarse**

- **Ubicación**: `adapters/postgres-event-store.ts:22, 56-72, 123`
- **Descripción**: `streamVersions` cachea MAX(stream_version) en memoria. Si otra instancia escribe a mismo subject_id, cache se desincroniza.
- **Impacto**: 
  - Violación de UNIQUE(company_id, subject_id, stream_version)
  - Dos eventos podrían intentar escribir con mismo stream_version
  - DB rechaza con error pero violó invariante en app
- **Severidad**: **P0** (bloquea) - en multi-instancia production

---

### 🟡 **Hallazgo 6: Cache `knownIds` es optimización local, no garantía global**

- **Ubicación**: `adapters/postgres-event-store.ts:28, 101`
- **Descripción**: `knownIds` (Set) rechaza duplicados en THIS instancia pero no es fuente de verdad. DB (PK UNIQUE) lo es. Comentario lo aclara, pero es confuso.
- **Impacto**: 
  - Documentación contradictoria en código
  - Performance: `knownIds.has()` es O(1) pero no garantiza unicidad global
  - Race: 2 instancias pueden ambas pasar el check local y fallar en DB
- **Severidad**: **P2** (arquitectura, pero funciona por DB constraint)

---

### 🟡 **Hallazgo 7: Falta índice en `created_at` para `parte_identity`**

- **Ubicación**: `db/migrations/001_events_rls_outbox.up.sql:66-75` (sin índice)
- **Descripción**: Tabla `parte_identity` no tiene índice en `created_at` o `updated_at`. Búsquedas por rango (ej. "identidades creadas hoy") serían lentas.
- **Impacto**: 
  - O(n) scan si hay auditoría/compliance que query por fecha
  - Performance (Capa 2/3) podría ser lento
- **Severidad**: **P2** (depende de uso)

---

### 🟡 **Hallazgo 8: Sin validación de entrada en `companyId`**

- **Ubicación**: `adapters/postgres-event-store.ts:38, 99` + todas las queries
- **Descripción**: `companyId` se usa directo en queries sin validación. RLS protege a nivel BD, pero no hay checks en app.
- **Impacto**: 
  - RLS mitiga riesgo (fila filtrada si company_id mal)
  - Pero: NULL, '', '%', etc. podrían comportarse inesperado
  - Falta validación de tipo/formato
- **Severidad**: **P2** (RLS protege, pero podría ser más explícito)

---

### 🟡 **Hallazgo 9: PostgreSQL `synchronous_commit = OFF` reduce durabilidad**

- **Ubicación**: `adapters/postgres-event-store.ts:41`
- **Descripción**: `SET LOCAL synchronous_commit TO OFF` acelera escritura pero fsync no es garantizado antes de await().
- **Impacto**: 
  - Si DB cae entre COMMIT y fsync, datos se pierden
  - Trade-off: performance vs durabilidad
  - En production podría ser inaceptable
- **Severidad**: **P2** (depende de SLA)

---

### 🟡 **Hallazgo 10: Outbox pattern no es completamente atomic**

- **Ubicación**: `adapters/outbox.ts:73-86` (drainOutbox)
- **Descripción**: Flujo:
  1. `claimUnpublished()` → obtiene filas unpublished
  2. para cada fila: `handler()` (puede fallar) → `markPublished()`
  
  Si handler() falla, fila queda stuck. Sin reintento automático, límite de reintentos, o circuit breaker.
- **Impacto**: 
  - Efectos externos (email, notificación) pueden no enviarse
  - Fila queda stuck en outbox para siempre
  - No hay observabilidad de fallos
- **Severidad**: **P0** (bloquea) - en flujos de negocio críticos

---

### 🟡 **Hallazgo 11: Inconsistencia async/sync entre SqliteEventStore y PostgresEventStore**

- **Ubicación**: 
  - SQLite: métodos síncronos (append, getById)
  - PostgreSQL: métodos async (async append, async getById)
- **Descripción**: Dos implementaciones del mismo `EventStore` con signaturas diferentes.
- **Impacto**: 
  - Capa 2/3 debe manejar ambos tipos de signaturas
  - Cambiar de SQLite a PostgreSQL requiere reescribir código
  - TypeScript no fuerza compatibilidad de async
- **Severidad**: **P1** (importante para portabilidad)

---

### 🟡 **Hallazgo 12: Falta migración DOWN para 004**

Ya listado en **Hallazgo 1**.

---

## 3. Mejoras Recomendadas

### ✅ Mejora 1: Crear migración DOWN para 004_document_pk_uniqueness

**Problema que resuelve**: Hallazgo 1

**Pasos**:
1. Crear archivo `db/migrations/004_document_pk_uniqueness.down.sql`
2. Agregar: `DELETE FROM abs_events.schema_migrations WHERE version = '004_document_pk_uniqueness'`
3. (Optional) Comentario explicativo: "Esta es migración de documentación, no cambia schema"
4. Verificar que `migrateDown()` funciona hasta 003

**Prioridad**: P1

---

### ✅ Mejora 2: Extraer `deepFreeze` a módulo compartido

**Problema que resuelve**: Hallazgo 2

**Pasos**:
1. Crear archivo `core/deep-freeze.ts` con función exportada
2. Cambiar en `sqlite-event-store.ts`: `import { deepFreeze } from "../core/deep-freeze.js"`
3. Cambiar en `postgres-event-store.ts`: mismo import
4. Eliminar función local en `core/event-store.ts`, usar import
5. Actualizar tests si existen

**Prioridad**: P2

---

### ✅ Mejora 3: Agregar manejo de errores en `JSON.parse()`

**Problema que resuelve**: Hallazgo 3

**Pasos**:
1. En cada lugar donde se llama `JSON.parse()` en `getById()`, `getBySubject()`, `all()`:
   - Envolver en try/catch
   - Lanzar `EventStoreError` con mensaje: "Payload corrupto para evento {id}: {error message}"
   - Logging: registrar error pero no incluir payload completo (puede ser grande)
2. Tests: agregar caso de payload JSON malformado

**Prioridad**: P1

---

### ✅ Mejora 4: Eliminar cache `nextSeq` en SqliteEventStore

**Problema que resuelve**: Hallazgo 4

**Pasos**:
1. Eliminar atributo `private nextSeq: number`
2. En cada `append()`, reemplazar el cache con: `SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq` dentro de transacción
3. Confiar en AUTOINCREMENT del ROWID de SQLite si es viable, o usar explicit transaction + SELECT MAX
4. Verificar que UNIQUE seq constraint previene duplicados

**Prioridad**: P1 (si hay risk de multi-instancia en SQLite)

---

### ✅ Mejora 5: Refactorizar cache `streamVersions` en PostgresEventStore

**Problema que resuelve**: Hallazgo 5

**Pasos**:
1. Opción A (corto plazo): Invalidar cache si append falla con UNIQUE violation
   - En `appendImmediate()` catch block: limpiar `streamVersions.delete(subjectId)`
   
2. Opción B (largo plazo): Eliminar cache, hacer SELECT MAX(stream_version) cada vez
   - Impacto: 1 query extra per append, pero correctitud garantizada
   - Benchmark: si latencia es inaceptable, usar connection pool warming

3. Opción C (híbrido): Cache + versioning
   - Guardar timestamp de cache, invalidar si > X segundos
   - O usar "check" en DB: `SELECT MAX(stream_version) WHERE subject_id` antes de usar cache

**Prioridad**: P0

---

### ✅ Mejora 6: Documentar `knownIds` cache o eliminarlo

**Problema que resuelve**: Hallazgo 6

**Pasos**:
1. Si keep cache:
   - Agregar JSDoc: "Optimización local, NO garantía de unicidad global. DB PK es fuente de verdad."
   - Considerar limpieza periódica si Map crece sin límite
   
2. Si eliminar cache:
   - Borrar `private knownIds = new Set<string>()`
   - Borrar `this.knownIds.add()` en append()
   - Resultado: más queries a DB pero código más simple

**Prioridad**: P2

---

### ✅ Mejora 7: Agregar índice en `created_at` para `parte_identity`

**Problema que resuelve**: Hallazgo 7

**Pasos**:
1. Crear migración `005_identity_indexes.up.sql`:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_parte_identity_created_at 
     ON abs_identity.parte_identity (company_id, created_at);
   
   CREATE INDEX IF NOT EXISTS idx_parte_identity_updated_at
     ON abs_identity.parte_identity (company_id, updated_at);
   ```

2. Crear `005_identity_indexes.down.sql`:
   ```sql
   DROP INDEX IF EXISTS abs_identity.idx_parte_identity_updated_at;
   DROP INDEX IF EXISTS abs_identity.idx_parte_identity_created_at;
   ```

3. Verificar que `migrateUp()` aplica la nueva migración

**Prioridad**: P2

---

### ✅ Mejora 8: Validar `companyId` en app

**Problema que resuelve**: Hallazgo 8

**Pasos**:
1. Crear función `validateCompanyId(id: string): void` en módulo utils
   - Validar: no nulo, no vacío, alfanumérico + guiones
   - Lanzar error si inválido
   
2. En `PostgresEventStore.constructor()`: validar opts.companyId
   
3. En `PostgresParteIdentityStore.constructor()`: validar companyId
   
4. En `withCompanyContext()`: validar antes de setear config

**Prioridad**: P2

---

### ✅ Mejora 9: Documentar trade-off `synchronous_commit = OFF`

**Problema que resuelve**: Hallazgo 9

**Pasos**:
1. Agregar comentario en `postgres-event-store.ts:41`:
   ```
   // synchronous_commit = OFF: no espera fsync, más rápido pero menos durable
   // TODO: evaluar para production. En 99.99% uptime DB, es aceptable.
   //       Si SLA es 99.9999%, cambiar a ON.
   ```

2. Crear issue/task para revisar SLA y ajustar si es necesario

3. Considerar variable env: `ABS_SYNC_COMMIT` para control dinámico

**Prioridad**: P2

---

### ✅ Mejora 10: Refactorizar drainOutbox con retry + observabilidad

**Problema que resuelve**: Hallazgo 10

**Pasos**:
1. Cambiar signature de `drainOutbox()`:
   ```typescript
   export async function drainOutbox(
     pool: Pool,
     companyId: string,
     handler: (row: OutboxRow) => Promise<void>,
     options?: { maxRetries?: number; onError?: (row: OutboxRow, err: Error) => Promise<void> }
   ): Promise<{ succeeded: number; failed: number }>
   ```

2. Implementar retry:
   - Hasta `maxRetries` intentos
   - Backoff exponencial
   - Si falla después de retries: callback `onError` (para logging)

3. Retornar conteo de succeeded + failed

4. Tests: simular handler que falla N veces, verifica retry

**Prioridad**: P0

---

### ✅ Mejora 11: Hacer `EventStore` interface async-compatible

**Problema que resuelve**: Hallazgo 11

**Pasos**:
1. Opción A: Hacer `EventStore` interface con métodos async
   - Cambiar en `core/event-store.ts`: `async append()`, `async getById()`
   - Actualizar `InMemoryEventStore` para ser async (Promise wrappers)
   - Cambiar `SqliteEventStore` a async (wrapper con setImmediate)
   
2. Opción B: Crear `AsyncEventStore` interface separada
   - Keep `EventStore` sync
   - Crear `AsyncEventStore extends EventStore` con async
   - Postgres usa async, SQLite usa sync (nativa)
   - Capa 2 elige qué usar

3. Opción C: Factory que adapta automáticamente
   - `createEventStore()` retorna siempre Promise<EventStore>
   - Internamente, envuelve sync en async si es necesario

**Recomendación**: Opción A (más limpio para future-proof)

**Prioridad**: P1

---

## 4. Resumen Ejecutivo

| Métrica | Valor |
|---------|-------|
| **Adapters/Stores principales** | 3 (SQLite, PostgreSQL + 2 identity/outbox) |
| **BD** | PostgreSQL (prod) + SQLite (dev) |
| **Migraciones** | 4 UP, 3 DOWN (falta 1) |
| **Patrón principal** | Append-only + event sourcing |
| **Hallazgos totales** | 12 |
| **P0 (bloqueante)** | 2 (Hallazgo 5, 10) |
| **P1 (importante)** | 5 (Hallazgo 1, 3, 4, 11) |
| **P2 (nice-to-have)** | 5 (Hallazgo 2, 6, 7, 8, 9) |

---

### Riesgo General: **MEDIO**

**Justificación**:
- Hallazgo 5 (cache sync) es **bloqueante** en multi-instancia
- Hallazgo 10 (outbox retry) es **bloqueante** en flujos críticos
- Hallazgos 1, 3, 4, 11 son **importantes** pero recuperables
- RLS y transacciones protegen datos bien
- Pero: falta observabilidad, retry, y validación en inputs

---

### Recomendación de Acción Inmediata (Prioridad Top 3)

1. **🔴 P0**: Refactorizar `streamVersions` cache → Hallazgo 5
   - **Por qué**: Violación de invariante en multi-instancia
   - **Cómo**: Opción C (hybrid) con versioning de cache

2. **🔴 P0**: Implementar retry + observabilidad en `drainOutbox()` → Hallazgo 10
   - **Por qué**: Efectos externos pueden quedar stuck
   - **Cómo**: Agregar maxRetries + backoff + logging

3. **🟡 P1**: Agregar manejo de errores en `JSON.parse()` → Hallazgo 3
   - **Por qué**: Crash en runtime si BD corrupta
   - **Cómo**: try/catch con `EventStoreError` detallado

---

## Apéndice A: Fichas de Hallazgos Críticos

### Hallazgo 5: `streamVersions` cache desincronización (P0)

**Código afectado**:
```typescript
// adapters/postgres-event-store.ts:56-72
private async nextVersion(client: PoolClient, subjectId: string): Promise<number> {
  const cached = this.streamVersions.get(subjectId);
  if (cached !== undefined) {
    const next = cached + 1;
    this.streamVersions.set(subjectId, next);
    return next;  // ← Problema: otra instancia puede haber escrito next
  }
  // ... resto del código
}
```

**Escenario de falla**:
1. Instancia A: cache hit → `cached = 5` → incrementa a 6
2. Instancia B: INSERT event con stream_version=6 (pasó su propio MAX query)
3. Instancia A: INSERT event con stream_version=6 → UNIQUE violation
4. Error manejado, pero violó invariante (Capa 2 pensaba que tendría v6, pero falla)

**Solución elegida**: Opción C (hybrid)
- Cachear pero con TTL/versioning
- Si append falla con UNIQUE: invalidar cache y reintentar
- Así: rápido en caso normal, pero correcto en concurrencia

---

### Hallazgo 10: `drainOutbox` falta retry (P0)

**Código actual**:
```typescript
// adapters/outbox.ts:73-86
export async function drainOutbox(pool: Pool, companyId: string, handler) {
  const rows = await claimUnpublished(pool, companyId);
  for (const row of rows) {
    await handler(row);  // ← Si esto falla, fila stuck en outbox
    await markPublished(pool, companyId, row.id);
  }
}
```

**Problema**: Si `handler()` falla (ej. email service down), fila queda unpublished. 
- Próximo `drainOutbox()` re-intenta
- Pero: sin exponential backoff, sin límite, sin logging
- Resultado: email duplicados, o stuck forever

**Solución**: 
```typescript
export async function drainOutbox(
  pool: Pool,
  companyId: string,
  handler: (row: OutboxRow) => Promise<void>,
  options?: { maxRetries?: number }
): Promise<{ succeeded: number; failed: number }>
```

Implementar: 
- Retry con backoff (1s, 2s, 4s, ...)
- Si maxRetries agotados: callback `onError` para logging/alerting
- Retornar { succeeded, failed } para observabilidad

---

### Hallazgo 3: Sin validación `JSON.parse()` (P1)

**Ubicación**:
```typescript
// adapters/postgres-event-store.ts:157
return deepFreeze(JSON.parse(row) as AppendOnlyEvent);  // ← Crash si JSON inválido
```

**Causa de corrupción posible**:
- Bug en versión anterior que guardó JSON malformado
- Corrupción de datos en BD (hardware)
- Migración que cambió formato sin validación

**Fix simple**:
```typescript
try {
  const parsed = JSON.parse(row) as AppendOnlyEvent;
  return deepFreeze(parsed);
} catch (err) {
  throw new EventStoreError(
    `Payload corrupto para evento ${id}: ${(err as Error).message}`
  );
}
```

---

