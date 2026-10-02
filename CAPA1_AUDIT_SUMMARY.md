# 🔍 Auditoría Capa 1: Persistencia - Resumen Ejecutivo

**Fecha:** 2 Octubre 2026  
**Rama:** `capa-1/persistencia`  
**Estado:** Discovery Complete  
**Riesgo Operacional:** MEDIA-ALTA (Producción >1M eventos: CRÍTICO)

---

## Resumen de 30 Segundos

Brawliot/ABS implementa **Event Sourcing puro** ✓ (correcto en diseño), pero sufre **problemas críticos de performance**:

- 🔴 **2 CRÍTICOS:** Queries sin LIMIT (OOM), N+1 pattern (timeout PostgreSQL)
- 🟠 **3 ALTOS:** Eventos muertos, Outbox no publicado, arquitectura suboptimizada
- 🟡 **6 MEDIOS/BAJOS:** Performance, validación, optimización

**Veredicto:** Event Sourcing bien hecho pero no listo para producción con datos reales.

---

## Hallazgos Clave

### ✓ Lo que está BIEN
```
✓ Append-only invariante (trigger DB + excepciones explícitas)
✓ RLS habilitada en TODAS las tablas PostgreSQL
✓ Multi-tenancy via set_config() + session variable
✓ Idempotencia por event.id (PRIMARY KEY única)
✓ Punto único de escritura (web/action-handler.ts:540)
✓ Auditoría completa: quién, qué, cuándo, por qué
```

### ✗ Lo que está MAL (CRÍTICO)

| Severidad | Problema | Ubicación | Impacto |
|-----------|----------|-----------|---------|
| 🔴 | store.all() sin LIMIT | postgres-event-store.ts:175 | OOM con 1M eventos |
| 🔴 | getBySubject() sin LIMIT (5× por acción) | postgres-event-store.ts:161 | PostgreSQL: timeout |
| 🟠 | N+1 en projectRows() | runtime.ts:161 | 1000 queries por página |
| 🟠 | ExceptionEvent nunca creado | events.ts:40 | Rechazos no auditados |
| 🟠 | Outbox nunca publicado | adapters/outbox.ts | Efectos externos rotos |

---

## Arquitectura Actual

```
Event Store (Append-only)
├── PostgreSQL: PRODUCCIÓN
│   ├── Tabla: abs_events.events (company_id, id, payload, seq)
│   ├── RLS habilitada
│   ├── Trigger: rechaza UPDATE/DELETE
│   └── Índice: (company_id, seq)
│
└── SQLite: DESARROLLO/TESTS
    ├── Tabla: events (id, subject_id, payload, seq)
    └── NO soporta RLS

Modelos: 10 Elementos (Transacción, Parte, Recurso, Movimiento, etc.)

Flujo de Persistencia:
  UI → executeUiAction() 
    → [Validación + Juez + Derivación]
    → store.append(TransitionEvent)  ← ÚNICO punto de escritura
    → runtime.facts.applyEvent()
    → Response { eventId, newState }

Proyecciones: TenantFactProjection (reconstruye estado iterando eventos)

Almacenes Secundarios:
  - accounts/store.ts (cuentas, separado de negocio)
  - postgres-identity-store.ts (PII cifrada AES-256)
  - response-registrar/store.ts (respuestas LLM)
  - adapters/outbox.ts (efectos externos - NO PUBLICADO)
```

---

## Los 11 Problemas Priorizado

### CRÍTICO 🔴

**[3.1] store.all() SIN LIMIT**
```typescript
// adapters/postgres-event-store.ts:175-184
async all(): Promise<AppendOnlyEvent[]> {
  const res = await client.query(
    `SELECT payload FROM abs_events.events
     WHERE company_id = $1
     ORDER BY seq ASC`,  // ← SIN LIMIT
    [this.companyId]
  );
  return res.rows.map(r => JSON.parse(r.payload));  // ← TODO en memoria
}
```
- **Dónde se llama:** web/server.ts:644 (`/info`), facts/provider.ts:87
- **Impacto:** 1M eventos → 50+ MB, 5 años → OOM
- **Fix:** Agregar `LIMIT 1000` o paginación

**[3.2] getBySubject() SIN LIMIT (llamado 5× por acción)**
```typescript
// adapters/postgres-event-store.ts:161-172
async getBySubject(subjectId: string): Promise<AppendOnlyEvent[]> {
  const res = await client.query(
    `SELECT payload FROM abs_events.events
     WHERE company_id = $1 AND subject_id = $2
     ORDER BY stream_version ASC`,  // ← SIN LIMIT
    [this.companyId, subjectId]
  );
  return res.rows.map(r => JSON.parse(r.payload));  // ← TODO
}
```
- **Dónde:** action-handler.ts:264,399,411,503 + runtime.ts:180,231
- **Impacto:** Transacción con 100K eventos secundarios → 250MB, PostgreSQL timeout
- **Fix:** `LIMIT 5000` + cursor-based pagination

### ALTA 🟠

**[3.3] N+1 en projectRows()**
- Ubicación: web/runtime.ts:161-194
- Problema: `for (const sub of subjects) { store.getBySubject(sub.id) }`
- Impacto: 1000 transacciones → 1000 queries PostgreSQL

**[1.1] Eventos Muertos**
- Tipos definidos pero NUNCA CREADOS: ExceptionEvent, ModificationEvent, ExpirationEvent
- Impacto: Rechazos y vencimientos no se auditan

**[4.3] Outbox No Publicado**
- Ubicación: adapters/outbox.ts (funciones definidas, nunca llamadas)
- Impacto: Efectos externos (correo, webhooks) nunca se disparan

### MEDIA 🟡

**[2.1] readAt() Reconstruye TODO**
- Ubicación: facts/projection.ts:230-241
- Problema: Acceso a posición histórica → O(N²)

**[2.3] Saldo Acumula Errores (NaN)**
- Sin validación de payload.importe
- Evento corrupto invalida saldo de cliente

**[4.1] Sin Try/Catch en store.append()**
- Ubicación: web/action-handler.ts:540
- Si falla UNIQUE constraint → HTTP 500

**[6.1] Snapshots Muertos**
- Tabla creada (migración 002), nunca poblada
- Proyecciones siempre replayan 100% de eventos

### BAJA 🔵

**[2.2] Sin Índices en Memory**
- Búsqueda de estado: O(N) lineal

**[5.3] SQLite Sin RLS**
- Development multi-tenant risk

---

## Estadísticas del Codebase

| Métrica | Valor |
|---------|-------|
| Total Capa 1 | ~2,350 líneas de código |
| Puntos de escritura | 1 (web/action-handler.ts:540) |
| Tipos de eventos | 4 definidos, 1 usado |
| Llamadas a getBySubject() | 5 por acción |
| Queries sin LIMIT | 2 críticas |
| Snapshots generados | 0 |
| Outbox publicados | 0 |

---

## Plan de Acción Inmediata

### 🔴 ESTA SEMANA (Estabilidad)

1. **Agregar LIMIT en store.all()**
   - Archivo: `adapters/postgres-event-store.ts:175`
   - Cambio: `SELECT ... LIMIT 10000`
   - Prueba: Test con 1M eventos

2. **Agregar LIMIT en getBySubject()**
   - Archivo: `adapters/postgres-event-store.ts:161`
   - Cambio: `SELECT ... LIMIT 5000`
   - Prueba: Verificar queries en action-handler

3. **Agregar isFinite() en cálculo de saldos**
   - Archivo: `facts/projection.ts:260`
   - Cambio: `if (!isFinite(newAmount)) { ... }`

4. **Try/catch en store.append()**
   - Archivo: `web/action-handler.ts:540`
   - Envolver en try/catch para EventStoreError

### 🟠 PRÓXIMAS 2 SEMANAS (Funcionalidad)

5. **Implementar drainOutbox() job**
   - Crear background task que ejecute cada minuto
   - Publicar efectos externos

6. **Batch de getBySubject()**
   - Refactorizar projectRows()
   - Cargar todos los subjects de una vez

7. **Crear ExceptionEvent en rechazos**
   - Ubicación: `policies/judge.ts`
   - Registrar rechazos como eventos

### 🟡 PRÓXIMO MES (Performance)

8. **Snapshots auto-generados**
   - Background job que crea snapshots cada N eventos
   - Precarga en lectura

9. **Índices de estado en memory**
   - TenantFactProjection: indexar txStates por stateId

10. **Cache en readAt()**
    - Evitar reconstrucción de proyecciones históricas

---

## Validaciones Correctas ✅

```
✓ RLS habilitada en TODAS las tablas
✓ company_id en todos los WHERE
✓ set_config() limpia contexto
✓ Append-only trigger previene mutaciones
✓ Idempotencia por event.id
✓ Seed accounts funciona
✓ Punto único de escritura
```

---

## Próximos Pasos

1. **Hoy:** Revisar este reporte
2. **Mañana:** Crear PRs para Fase 1 (Estabilidad)
3. **Esta semana:** Mergemar Fase 1
4. **Próximas 2 semanas:** Fase 2 (Funcionalidad)
5. **Próximo mes:** Fase 3 (Performance)

**Riesgo:** Sin Fase 1, producción con >1M eventos colapsará.

---

## Artefactos Generados

- ✅ `CAPA1_AUDIT_REPORT.html` - Reporte detallado (artifact)
- ✅ `CAPA1_AUDIT_SUMMARY.md` - Este documento (git)

---

**Auditoría realizada por:** Agente Explorador  
**Validación:** Manual review pendiente  
**Próxima revisión:** Post-Fase 1 (1-2 semanas)
