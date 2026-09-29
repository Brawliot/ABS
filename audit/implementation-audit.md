# Auditoría de implementación ABS

**Fecha:** 2026-09-27  
**Modo:** solo lectura (sin modificar código fuera de `/audit/`)  
**Ejecuciones:** `tsc -p tsconfig.json --noEmit` → exit 0; `vitest run` → **185 passed | 1 skipped (186)** en 36 archivos, exit 0  
**Especificación aportada por el usuario:** vacía (se usó el corpus del repo + matriz Fase A del chat [ABS project state management](4c1c62aa-e8cd-4480-b099-c3ccb9187ed7))

---

## 1. Resumen ejecutivo

Las seis piezas del alcance (Capa 0, Puente 0↔1, Capa 1, Puente 1↔2, Capa 2, Puente 2↔3) **existen y están cableadas** en el árbol de producción; no son stubs vacíos. La mayoría de invariantes de contrato tienen prueba de comportamiento que puede fallar.

Recuento aproximado por estado (elementos/subelementos de la lista ampliada, ~55 filas de la §2):

| Estado | ≈ |
|--------|---|
| IMPLEMENTADO | 34 |
| IMPLEMENTADO SIN PRUEBA | 1 |
| STAND-IN | 6 |
| PARCIAL | 10 |
| VIOLACIÓN | 0 (estructurales duras no halladas) |
| NO CONSTRUIDO | 2 (Planificador; E2E navegador como producto) |
| SIN ESPECIFICACIÓN ENCONTRADA | 0 de la lista base |
| DUDA | 2 |

**Pieza más débil:** Capa 2 / Puente 2↔3 en lo que depende de **navegador real, LLM real y Planificador→Generador** (render string, stand-ins, diagnóstico heurístico ~36 % extractor / ~74 % final E2E, sin pipeline automático al Generador). En núcleo/gobierno, la debilidad relativa son las **7 rupturas** (mayoría comprobación estructural, no walk) y la **falta de `it()` dedicado a forzado del núcleo**.

`tsc` limpio. Suite verde con 1 `it.skipIf` (Playwright opcional, esperado).

---

## 2. Fuentes de especificación (Paso 1)

| Fuente | Qué aporta |
|--------|------------|
| `PRINCIPLES.md` | 10 elementos, Evento fuente de verdad, terminal→tx vinculada, privacidad multiempresa |
| `CONTRACTS.md` | Capa 0↔1, Compilador/Juez/forzado, Intérprete, Filtro, Observador, puente UX, especialistas |
| `docs/policies.md`, `docs/facts.md`, `docs/generator.md` | Detalle capa 1, hechos, generador |
| `spec/GRANULARITY.md`, `spec/VERSIONING.md` | Granularidad acuerdos/entregas; versionado |
| READMEs por módulo (`core` implícito vía PRINCIPLES, `generator/`, `design/`, `bridges/…`, etc.) | Contratos locales |
| Matriz Fase A (chat calidad, 2026-09-27) | Criterio × prueba × C/P/H/NC |
| `audit-report.json` / `test-report.json` | Mediciones automatizadas (no sustituyen esta auditoría) |
| Spec usuario pegada | **Vacía** |

Elementos añadidos respecto a la lista base mínima (porque aparecen en CONTRACTS/docs): Comunicación, Objetivo, Clasificación, Vinculación, Observador (proyección), Proveedor de hechos, 10 elementos del metaobjeto, Composición/bloqueos, Learning/privacidad agregada (mencionado; no auditado en profundidad fuera de PII-eventos).

---

## 3. Tabla por capa / puente

Leyenda Real/Stand-in: **R** = lógica determinista de producto; **S** = heurística/LLM stub; **M** = mock solo en test.

### Capa 0 — Núcleo

| Elemento | Subelemento | Estado | Evidencia código | Evidencia prueba | Real/S | Notas |
|----------|-------------|--------|------------------|------------------|--------|-------|
| Gramática | Metaobjeto 5 capas + kinds cerrados | IMPLEMENTADO | `core/grammar.ts:7-51`, `core/metaobject.ts`, `core/lifecycle.ts:17-135` | `validator.test.ts` › varios rechazos de máquina; `elements-archetypes-diagnosis.test.ts` › plantillas | R | Callers: arquetipos, validator, derivation, judge |
| Gramática | Estados / transiciones / terminales | IMPLEMENTADO | `lifecycle.ts` (`isTerminalState`, `outgoing`); `validator.ts` `TERMINAL_WITH_EXIT` | `validator.test.ts` › "falla si un terminal tiene salidas" | R | |
| Validador | `validateLifecycle` + Registry | IMPLEMENTADO | `metaobject.ts:54-59` (registro); `derivation.ts:61-67` (uso en crudo) | `derivation.test.ts` › "rechaza registrar…"; "pasar máquina inválida a deriveState falla"; `level1.properties` › "ninguna máquina inválida se registra…" | R | Registry poco usado en runtime (arquetipos en crudo); defensa real = assert en derive |
| Derivación | Estado de eventos; replay ≡ estado | IMPLEMENTADO | `derivation.ts:75-104` | `derivation.test.ts` › "reconstruye el estado idéntico…"; `level1.properties` › "reproducir la misma secuencia…" | R | |
| Derivación | Terminal no se reabre | IMPLEMENTADO | `derivation.ts:117-120` (+ linked tx) | `derivation.test.ts` › "un terminal nunca se reabre" | R | |
| EventStore | Append-only real (todas las rutas) | IMPLEMENTADO | `event-store.ts:68-78`; `adapters/sqlite-event-store.ts` solo `INSERT`; sin SQL UPDATE/DELETE de eventos | `event-store.immutability.test.ts` › modify/delete/id reuse; `level5.concurrency` › dup id SQLite | R | Lectura SQLite sin `deepFreeze` (mutación en memoria, no en BD). `InsightResponseStore.replace` es otro almacén |
| 6 arquetipos | Happy + excepciones en máquina | PARCIAL | `archetypes/catalog.ts`; cada `*.ts` + `build-lifecycle.ts:41-44` | `elements-archetypes-diagnosis.test.ts` › "cada arquetipo tiene máquina válida" | R | **Falta** walk E2E feliz+excepción por arquetipo; disputa/pausa a menudo en happyPath |
| 7 rupturas | Suite audit | PARCIAL | `tests/audit.measurement.test.ts` `ruptureSuite` ~727-976 | Mismo archivo › "mide clasificación…" (embebido) | R | 5/7 = existencia estructural; devolución + saldo multiparte sí ejecutan |
| (extra) 10 elementos | Parte…Evento | IMPLEMENTADO | `elements/` + PRINCIPLES | Suite elements/archetypes | R | Fuera lista base; especificado en PRINCIPLES |
| (extra) Composición | `bloquea` + DFS ciclos | IMPLEMENTADO | `archetypes/composed-runtime.ts` | `composition-runtime.test.ts` | R | Medido en audit-report |

### Puente 0↔1 — Compilador → Juez

| Elemento | Subelemento | Estado | Evidencia código | Evidencia prueba | Real/S | Notas |
|----------|-------------|--------|------------------|------------------|--------|-------|
| Compilador | Determinismo contentHash | IMPLEMENTADO | `policies/compiler.ts` `hashCanonical` ~166-170 | `policies.compiler.test.ts` › "compilar dos veces…"; `level1.properties` › "mismo input… contentHash" | R | |
| Compilador | No crea estados/transiciones | IMPLEMENTADO | `schema.ts` FORBIDDEN keys; `assertNoForbiddenStructure` | `policies.compiler.test.ts` › "una política que intenta crear un estado se rechaza" | R | |
| Juez | Prioridad Cumplimiento>Permiso>Restricción>Política | IMPLEMENTADO | `types.ts:193-199` PRIORITY; `judge.ts:744-779` PHASE_ORDER + sort por priority | `layer1-org.test.ts` › "una restricción rechaza aunque…"; judge/layer1 tests | R | **DUDA menor:** `GuardPhase` no nombra `restriccion`; va en fase `politica` con priority 150. Alineado con CONTRACTS L72 ("restricciones primero") |
| Juez | Pipeline antes de núcleo | IMPLEMENTADO | `attemptJudgedAdvance` → guards → `assertCanAdvance` | `policies.judge.test.ts` | R | Callers: observer flows, presenter tests, qa engine |

### Capa 1 — Gobierno

| Elemento | Subelemento | Estado | Evidencia código | Evidencia prueba | Real/S | Notas |
|----------|-------------|--------|------------------|------------------|--------|-------|
| Organización | Sede/equipo/rol/jerarquía | IMPLEMENTADO | `policies/organization.ts`; compile → actorDirectory | `layer1-org.test.ts` › "aprobación del superior directo…" | R | |
| Permiso | ejecutar/aprobar/forzar/consultar | IMPLEMENTADO | `compiler.ts` → guard/visibility/force_grant | `layer1-org` › "consultar y forzar…"; judge › rol requerido | R | |
| Política | calc/cond/aprob/restricción | IMPLEMENTADO | compiler + `evaluateCompiledRule` | judge + layer1-org restricción | R | |
| Cumplimiento | Prioridad máx; nunca forzar | IMPLEMENTADO | phase cumplimiento; `assertForceAllowed` L1090 | `observer.test.ts` › "forzar… Cumplimiento falla…"; `layer1-comm-comp` plazo 14d | R | |
| Calendario | horas/festivos/turnos/temporadas | IMPLEMENTADO | `policies/calendario.ts` | `layer1-objetivo-cal-class` › "48 horas hábiles…" | R | |
| Comunicación | docs formales → evidencia | IMPLEMENTADO | `policies/comunicacion.ts` | `layer1-comm-comp` › venta+factura | R | Extra vs lista base |
| Objetivo | nunca bloquea | IMPLEMENTADO | `objetivo.ts` | `layer1-objetivo-cal-class` › "incumplir una meta no bloquea…" | R | Extra |
| Clasificación | etiquetas + evento | IMPLEMENTADO | `clasificacion.ts` | `layer1-objetivo-cal-class` › descuento segmento | R | Extra |
| Vinculación | at_create / on_state / live | IMPLEMENTADO | `selectEffectiveRules` | layer1-org at_create + live | R | Extra |
| Hechos | FactBag sellado | IMPLEMENTADO | `facts/provider.ts:223-266` | `facts.test.ts` › "guarda que intente leer el almacén…" | R | `provider.ts` importa **tipo** EventStore para attachStore — bolsa no lo expone |
| Hechos | Sin acceso EventStore en guardas | IMPLEMENTADO | seal + judge `sealAgainstEventStore` | facts.test.ts + level2 bridge (débil) | R | |
| Hechos | Concurrencia optimista por versión | IMPLEMENTADO | `confirm` / `FactOptimisticConflictError` | `facts.test.ts` › "dos pedidos simultáneos…" | R | In-process; no multi-proceso (Fase B level5 parcial) |
| Observador | Forzado solo Permiso/Política + motivo | IMPLEMENTADO | `judge.ts:1080-1104` (motor); `observer/projection.ts` (lectura) | `observer.test.ts` › sin motivo / sin permiso / Cumplimiento | R | Observador ≠ ejecutor del force |
| Observador | Núcleo nunca forzar | IMPLEMENTADO SIN PRUEBA | `judge.ts:1018-1022` | **Ningún `it()` dedicado** | R | Código impone; cobertura ausente |
| Privacidad | PII fuera de eventos | IMPLEMENTADO | `policies/identity.ts` ParteIdentityStore | `layer1-comm-comp` › "borrar PII… deja eventos intactos" | R | `privacy.test.ts` = learning agregado, no este invariante |

### Puente 1↔2 — Intérprete y Filtro

| Elemento | Subelemento | Estado | Evidencia código | Evidencia prueba | Real/S | Notas |
|----------|-------------|--------|------------------|------------------|--------|-------|
| Intérprete | Nunca ejecuta Juez | IMPLEMENTADO | `interpret.ts:1-3,36-37`; 0 refs `attemptJudgedAdvance` en `interpreter/` | `interpreter.test.ts`; `level2` › "intérprete no ejecuta…" (solo aserta kind → **débil**) | R | Presenter llama interpret+juez por separado |
| Intérprete | Idempotencia doble envío | IMPLEMENTADO | `idempotency.ts` + ledger en interpret | `interpreter.test.ts` › "formulario enviado dos veces…" | R | |
| Intérprete | Extracción NL | STAND-IN | `HeuristicInterpreterExtractor` | interpreter precision 30 msgs | S | Adaptador LLM `built: false` |
| Filtro | Tenant / sede / PII | IMPLEMENTADO | `filter/filter.ts`, `seal.ts` | `filter.test.ts` (sede, fiscal, portal, personalAccessLog) | R | Filas sintéticas OK para invariante |
| Filtro | Layer2DirectAccessError | IMPLEMENTADO | `filter/types.ts`, `seal.ts` | `filter.test.ts` › "intento de lectura directa…" | R | |

### Capa 2 — Generación

| Elemento | Subelemento | Estado | Evidencia código | Evidencia prueba | Real/S | Notas |
|----------|-------------|--------|------------------|------------------|--------|-------|
| Generador | Módulos por negocio; concesionaria sin TPV | IMPLEMENTADO | `generator/rules/modules.ts`; pack `concesionaria.ts` | `generator.test.ts` › "concesionaria genera… sin TPV" | R | |
| Generador | Misma entrada → misma UiSpec | IMPLEMENTADO | `generate.ts` contentHash/structuralHash | generator + `level1.properties` › same GeneratorInput | R | |
| Generador | Overlays sobreviven regen | IMPLEMENTADO | `applyOverlay` | `generator.test.ts` › "cambiar un estado… conserva logotipo…" | R | |
| UiSpec | Esquema definido y validado | PARCIAL | `presentation/types.ts` `PRESENTATION_SCHEMA_VERSION`; `generator/validate-ui.ts` literales/a11y | design-generator tests literales/a11y | R | **No** hay validador runtime del UiSpec completo (Zod/JSON Schema). Solo tipos TS + checks parciales |
| Render HTML | Existencia real | PARCIAL | `presentation/renderer.ts` `renderUiSpecHtml` → string | `generator.test.ts` › "renderizador web mínimo…" | R | Navegador: `adapters` playwright `built:false`; 1 test `skipIf` |

### Puente 2↔3 — Presentation-intelligence y especialistas

| Elemento | Subelemento | Estado | Evidencia código | Evidencia prueba | Real/S | Notas |
|----------|-------------|--------|------------------|------------------|--------|-------|
| Telemetría | Separada del EventStore | IMPLEMENTADO | `bridges/presentation-intelligence/store.ts:1-78` | `experience.test.ts` › "abandonar… no genera ningún evento…" | R | Importa tipo EventStore solo para invariante |
| Presentador | Acción → vía normal Intérprete→Juez | IMPLEMENTADO | `presenter/accept.ts` → interpret | `presenter.test.ts` › "aceptar una recomendación… pasa por el Juez" | R | |
| Registrador | Outcomes + almacén propio | IMPLEMENTADO | `response-registrar/` | `response-registrar.test.ts` | R | |
| Priorizador | Tope 3 interrupciones/día | IMPLEMENTADO | `types.ts` `DEFAULT_INTERRUPT_LIMIT_PER_DAY = 3`; `prioritize.ts` | `prioritizer.test.ts` › "nadie recibe más interrupciones…" | R | |
| Consultor | Solo catálogo + Filtro | IMPLEMENTADO | `consultant/` | consultant tests catálogo/sede/fuera | S/R | Lógica R; NL = stand-in |
| Diseñador | WCAG, patrones, hash estructural | IMPLEMENTADO | `design/validate.ts` WCAG AA; `bind-design` / generate structuralHash | `design*.test.ts`, `design-generator.test.ts` | S/R | Propuestas = stand-in determinista |
| Diseñador↔Generador | bind estable | IMPLEMENTADO | `presentation/bind-design.ts`; `generator/validate-ui.ts` | design-generator › hash estable / fallback patrón | R | |
| Arquitecto IA | Menú ≤7; no reordena solo | IMPLEMENTADO | `design/ia/types.ts` MAX=7; `learning.ts` propose | `design-ia.test.ts` | R | |
| Redactor | Sin jerga; determinismo | IMPLEMENTADO | `FORBIDDEN_JARGON`; fill determinista | `design-copy.test.ts` | S/R | Sin LLM runtime |
| Probador | Callejones; flujo <5 min | IMPLEMENTADO | `QA_MAX_DURATION_MS`; detect dead ends | `generator-qa.test.ts` | R | |
| Revisor seguridad | SoD; fraude; sin falsos críticos | IMPLEMENTADO | `generator/security/` | `generator-security.test.ts` + level7 | R | Propuestas no aplicadas |
| Diagnóstico / extractor | Texto→flags→arquetipo | PARCIAL / STAND-IN | `diagnosis/`; Heuristic + OpenAI opcional | `e2e.diagnosis.test.ts` (extractor 35.71%, final 73.81%) | S | Bajo umbral 90%; corpus real vacío |
| Planificador negocio | Conexión al Generador | NO CONSTRUIDO | — | — | — | Sin módulo; Generador vía packs manuales |

### Comprobaciones estructurales transversales

| Regla | Resultado |
|-------|-----------|
| Capa 0 no importa 1/2/3 | **CUMPLE** (core solo → `elements/closure`) |
| Capa 1 (policies/facts/observer) no importa generator/presentation/… | **CUMPLE** |
| Intérprete no invoca Juez | **CUMPLE** |
| FactBag no expone EventStore | **CUMPLE** (matiz: provider tipa EventStore) |
| Telemetría no escribe EventStore negocio | **CUMPLE** |
| Ningún camino update/delete de eventos de negocio | **CUMPLE** en EventStore InMemory+Sqlite |

---

## 4. Violaciones de contrato (por gravedad)

No se halló **VIOLACIÓN** dura (capa inferior importando superior; intérprete ejecutando juez; telemetría append a EventStore; mutación SQL de eventos).

**Casi-violaciones / riesgos (gravedad media-baja):**

1. **Cobertura:** forzado del núcleo implementado (`judge.ts:1018-1022`) sin `it()` — riesgo de regresión silenciosa.  
2. **UiSpec “validado”:** especificación habla de esquema; runtime solo valida literales de diseño/a11y, no el documento completo.  
3. **MetaObjectRegistry** infrautilizado: la puerta documentada “ninguna máquina inválida se registra” depende más de `deriveState` que del registry en caminos productivos.  
4. **Rupturas del audit** sobrevaloradas si se leen como “flujos demostrados”: 5/7 son checks de forma de máquina.

---

## 5. Discrepancias con la matriz Fase A

Fuente: inventario Fase A del chat de calidad (aprox. 162 `it()`, muchos **P/H/NC**).

| Criterio Fase A | Marcado entonces | Hallazgo ahora | Discrepancia |
|-----------------|------------------|----------------|--------------|
| Propiedades generativas | H / NC | `level1.properties.test.ts` con **200 seeds** (+ informe nightly 2000) | Fase A desactualizada: ya no es H total |
| BD real / Sqlite | NC | `SqliteEventStore` + `adapters` `built:true` | Desactualizada |
| `/tests/real` | NC | Existe README + `diagnosis.jsonl` con `cases: []` | Carpeta sí; corpus **vacío** |
| Concurrencia | H | `level5.concurrency.test.ts` **partial** | Parcialmente cubierto |
| Seguridad sistemática | P | `level7.security.test.ts` executed | Mejor que Fase A |
| EventStore append-only | C | Sigue C (+ Sqlite) | OK |
| Intérprete no ejecuta Juez | C | Código C; `level2` it es débil (forma) | Matriz optimista en la prueba de integración |
| 6 arquetipos happy+exc | P | Sigue P (sin E2E por arquetipo) | Consistente |
| Compilación determinista | P | Ahora también property test → más cerca de C | Fase A P conservadora aún razonable |
| Prioridad Juez | P | Cubierto por restricción+fases; no property de orden total | P/C borderline |
| E2E navegador | NC | Sigue NC (+ scaffold skip) | Consistente |
| Planificador | (no en matriz detalle) | NO CONSTRUIDO | — |
| “Capa 2 completa” en audit-report score 3/3 | Implícito C | Render = string; sin navegador | **Informe de medición más optimista** que esta auditoría |

No se vio ningún criterio marcado **C** en Fase A que hoy resulte **falso** en código; sí hay **sobreconfianza** del `audit-report.json` / scores 3/3 frente a stand-ins y E2E ausente.

---

## 6. Especificado sin implementación / implementado sin especificación

### Especificado sin implementación (o sin cierre)

| Ítem | Fuente | Estado |
|------|--------|--------|
| Planificador de negocio → Generador | Fuera de alcance pedido + ausencia en repo | NO CONSTRUIDO |
| E2E NL→navegador→cierre multi-rol | Plan calidad Fase A/B | NO CONSTRUIDO |
| Validador runtime completo de UiSpec | CONTRACTS/docs “esquema” | PARCIAL |
| Corpus `/tests/real` usable (n≥139) | Plan calidad | Vacío |
| LLM real para Diseñador/Redactor/Consultor/Intérprete | adapters + CONTRACTS “IA traduce” | STAND-IN |
| Operación 10×90 días; fallos mid-transition; benches p95 | Plan calidad | NO CONSTRUIDO (informe Fase B lo declara) |

### Implementado con especificación débil o solo implícita

| Ítem | Nota |
|------|------|
| `SqliteEventStore` | No estaba en lista base; aparece en adapters Fase B |
| Learning Dirichlet/Drift / privacy agregada | PRINCIPLES §9; tests privacy — fuera del checklist mínimo de esta auditoría |
| `composition-runtime`, invariantes de cierre | PRINCIPLES/GRANULARITY — implementados |
| Niveles calidad 1/2/5/7 + `test-report.json` | Plan de calidad, no CONTRACTS de producto |

---

## 7. Dudas que necesitan decisión del usuario

1. **Prioridad “Restricción” como fase nombrada vs priority 150 dentro de `politica`:** ¿el contrato exige `GuardPhase` propia o basta el orden efectivo documentado en CONTRACTS L72?  
2. **UiSpec “validado”:** ¿basta TypeScript + `assertSpecHasNoLiteralDesignValues` + a11y, o se exige validador runtime del documento completo?  
3. **Rupturas del audit:** ¿aceptar cobertura estructural como “cubiertas”, o exigir walks de eventos por escenario?  
4. **Diagnóstico:** ¿forma parte del veredicto de las 6 piezas (hoy PARCIAL/STAND-IN bajo 90 %) o se declara fuera hasta LLM+corpus real?  
5. **Import `interpreter` → `presentation/types`:** CONTRACTS sitúa el intérprete en “capa 2 / mensajería”; la lista base lo pone en Puente 1↔2. ¿Se tolera esa dependencia tipada?

---

## 8. Transversales ejecutados

### Typecheck
```
npx tsc -p tsconfig.json --noEmit  → exit 0 (sin errores)
```

### Vitest
```
Test Files  36 passed (36)
Tests       185 passed | 1 skipped (186)
Duration    ~8.6s
```
- Skip: `playwright.scaffold.test.ts` › "opcional: carga HTML en Chromium…" (`it.skipIf(ABS_PLAYWRIGHT !== "1")`) — no es fallo de producto.  
- Fallos: **ninguno** que cruzar con elementos.  
- Señales de calidad: E2E diagnóstico imprime accuracy extractor/final bajo umbral; consultant/interpreter reportan 100 % sobre bancos **sintéticos**.

### TODOs / skip / only / as any / @ts-ignore
- En código de producto auditado: **0** `TODO`/`FIXME`/`as any`/`@ts-ignore`.  
- Tests: **1** skip condicional Playwright (arriba). **0** `it.only`.  
- Aserciones triviales: el `it` de level2 “intérprete no ejecuta el Juez” solo comprueba `kind` de outcome — **no cuenta** como prueba estructural fuerte (la evidencia fuerte es grep + unitarios).

### Stand-ins explícitos (`adapters/index.ts`)
| Adapter | built |
|---------|-------|
| sqlite_event_store | true |
| playwright | false |
| llm | false (OpenAI opcional solo en diagnóstico) |

---

## 9. Veredicto final

| Pieza | ¿Completa? | Comentario |
|-------|------------|------------|
| **Capa 0** | **Casi** (completa para MVP núcleo; no para “todas las rupturas como flujos”) | Gramática, validador dual, derivación, EventStore OK; arquetipos/rupturas PARCIALES en profundidad de prueba |
| **Puente 0↔1** | **Sí (con matiz de fase restricción)** | Compilador+Juez reales y probados |
| **Capa 1** | **Sí (hueco de prueba en forzado núcleo)** | Org…hechos…PII cableados |
| **Puente 1↔2** | **Sí (extractor STAND-IN)** | Intérprete no llama Juez; Filtro OK |
| **Capa 2** | **No del todo** | Generador OK; UiSpec sin validador total; HTML = string, sin navegador |
| **Puente 2↔3** | **Funcional MVP; no “completo” de calidad** | Especialistas con criterios de prompt verdes; LLM stand-in; sin Planificador; diagnóstico por debajo del umbral |

**Pieza más débil:** **Capa 2 + cierre Puente 2↔3** (render/navegador, validación UiSpec, LLM/corpus, ausencia de Planificador→Generador), no el núcleo de eventos.

**Preferencia de esta auditoría:** muchos huecos reales documentados arriba frente a los scores 3/3 del `audit-report.json`. Lo construido es sustancial y en gran parte real; lo que falta es sobre todo **profundidad de prueba / adaptadores / piezas declaradas no construidas**, no inventarios de carpetas vacías con nombres bonitos.
)
