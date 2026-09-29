# CONTRACTS — Capa 0 (núcleo) ↔ Capa 1 (políticas)

Contrato estable entre el núcleo operativo y el compilador de políticas.
Cambios aquí exigen revisión explícita (alineado con `PRINCIPLES.md`).

## Capa 0 — qué decide el núcleo

- **Estados y transiciones** los declara el arquetipo / lifecycle. Son estructura versionada.
- **Guardas estructurales hoy**: en cada `Transition` viven `condition` (predicado
  declarado), `requiredEvidence` y `allowedActor`. `assertCanAdvance` las exige
  antes de aceptar un avance; la composición añade bloqueos `bloquea` y traza.
- **Invariantes** (capa 4 del metaobjeto) se evalúan por predicado en el estado derivado.
- El núcleo **no** interpreta descuentos, roles de empresa ni normativa sectorial.

## Capa 1 — qué aporta la empresa

- **Organización**: sede, equipo, rol y jerarquía → atributos de Actor (`actorDirectory`).
- **Permiso**: `consultar` (visibilidad), `ejecutar`/`aprobar` (guardas), `forzar` (vía Observador).
- **Política**: cálculo, condición, aprobación (evidencia / superior directo) y restricción (rechazo duro).
- **Cumplimiento**: evidencias, invariantes, restricciones y plazos legales (máx. prioridad, **nunca forzables**). Conservación de datos vía `ParteIdentityStore` (PII fuera de eventos).
- **Comunicación**: documento formal / mensaje externo / notificación interna desde evento+plantilla; no altera estado; traza de envíos; formales → Evidencia.
- **Vinculación**: cada regla declara `at_create` | `on_state` | `live` (defecto: cálculos al crear, permisos en vivo).
- **Objetivo**: plazo hábil sobre Compromiso (reloj en_plazo / en_riesgo / vencido); metas de volumen/valor/tasa comparadas con hechos — **nunca bloquean** transiciones.
- **Calendario**: horario, excepciones/festivos, turnos (hecho `calendario.turno_disponible`) y temporadas (selector de política).
- **Clasificación**: etiquetas segmento/familia/categoría/zona sobre Parte, Oferta y Recurso; todo cambio es evento `clasificacion`.

## Compilador — contrato de salida

El `CompiledRuleSet` **solo** puede contener:

| Artefacto compilado | Semántica en capa 0 |
|---------------------|---------------------|
| `guard` | Roles autorizados a ejecutar/aprobar una transición existente |
| `condition` | Predicado de campo; si `isRestriction`, rechazo cuando se cumple |
| `calculation` | Asignación/ajuste de campo (selectores: segment, season, classification) |
| `evidence_requirement` | Evidencia adicional (rol o superior directo) |
| `invariant` | Invariante adicional referenciando estados existentes |
| `visibility` | Regla de consulta (no bloquea avance) |
| `force_grant` | Quién puede forzar vía Observador (no es guarda de avance) |
| `legal_deadline` | Plazo legal: rechaza la transición mientras el plazo esté abierto |

Además (no son guardas): `calendar`, `deadlines`, `goals`, `actorDirectory`.

**Conservación de datos:** los eventos solo referencian `parteId` opaco. El PII vive en
`ParteIdentityStore` (fuera del EventStore). El borrado anonimiza el almacén sin
mutar el historial.

Cada regla lleva `binding` (`at_create` / `on_state` / `live`). El Juez aplica
`selectEffectiveRules` mezclando el RuleSet vivo, el snapshot de creación y los
fijados al entrar en estado.

**Prohibido** en entrada y salida: crear o modificar estados, transiciones, compromisos
o kinds de gramática. Una aprobación por umbral se compila como `evidence_requirement`
sobre una transición ya existente — nunca como estado nuevo. Los plazos anotan el
reloj sobre un `commitmentId` existente; no crean compromisos.

## Prioridad en conflictos

`Cumplimiento (300) > Permiso (200) > Restricción (150) > Política (100)`.

## Activación

Antes de activar un `CompiledRuleSet`: todas las reglas referencian transiciones/campos
existentes, no hay contradicciones detectables, y el `contentHash` reproduce el
contenido (compilación determinista).

## Juez — aplicación en el pipeline

El Juez (`policies/judge.ts`) inserta guardas de política **en el pipeline existente**
(antes de `assertCanAdvance` / bloqueos de composición). No crea un pipeline nuevo.

**Orden de evaluación:** Cumplimiento → Permiso → Política (restricciones primero) → núcleo.

Cada guarda es una función pura `(GuardContext) → aceptar|rechazar` con `ruleId` y
motivo. Los cálculos se materializan en `TransitionEvent.data` (`calculations`,
`fieldsAfter`, `ruleSetVersion`, `ruleSetContentHash`) para reconstrucción.
La traza incluye la versión del `CompiledRuleSet`. La primera guarda que rechaza
detiene la evaluación; la traza conserva todas las evaluadas hasta ese punto.
Eventos pasados se re-evalúan con el RuleSet embebido en el evento, no con el actual.
Una subida de precio (`at_create`) no altera transacciones ya creadas; retirar un
permiso (`live`) se aplica de inmediato.

## Vía de forzado

Un actor puede forzar una transición rechazada por **Permiso** o **Política** solo si:

1. tiene permiso explícito de forzado para esa regla (`allowedForceRuleIds`), y
2. aporta un motivo en texto libre (obligatorio).

**Nunca** se pueden forzar Cumplimiento ni guardas del núcleo. La transición forzada
es un evento `transicion` normal con `data.deviation` (regla saltada, versión del
RuleSet, actor, motivo).

## Intérprete — solicitudes (no ejecuta)

La capa 2 / mensajería convierte interacciones en `TransitionRequest` vía
`interpreter/`. Nunca llama a `attemptJudgedAdvance`. Bajo umbral de confianza
(0.85) pide confirmación. Idempotencia ante doble envío.

## Filtro — lectura capa 2

Toda lectura desde presentación pasa por el Filtro (`filter/`): filas (visibility +
sede/equipo/propia + tenant) y campos (fiscal/personal). Accesos PII en
`personalAccessLog`. La capa 2 **no** puede tocar EventStore ni proyecciones
(`Layer2DirectAccessError`).

## Observador

Proyección de solo lectura (`/observer`) sobre el flujo de eventos: forzados,
`modificacion` y automatizaciones canceladas a mano. Consultas por regla, actor y
periodo. Sin acceso de escritura a políticas ni al `CompiledRuleSet`.

## Puente presentation-intelligence

Telemetría de experiencia en `/bridges/presentation-intelligence` (separada del
EventStore). Capa 2 escribe; capa 3 solo lee agregados e impresiones de Insight
vía `openLayer3Reader` → `Layer3PresentationIntelligence` (sin almacén ni
`append`). Insights: qué / dónde / a quién seudonimizado + correlación para el
Registrador de respuesta.

## Contrato Insight + Presentador

Contrato en `/contracts/insight` (capa 3 produce). El **Presentador** (`/presenter`)
coloca cada Insight en Módulo/Vista junto al sujeto, exige hechos base, pasa por
el Filtro, oculta caducados y asigna experimentos con hash estable. Aceptar una
recomendación → Intérprete → Juez (vía normal).

## Registrador de respuesta

`/response-registrar`: outcome `aceptado` | `rechazado` | `ignorado` |
`caducado_sin_ver` (y `pendiente`). Si aceptado, vincula transición + resultado
(`exito` | `excepcion`) y variante de experimento. Almacén separado; seudónimos
como telemetría UX. Lectura: `openResponseReader` para capa 3 y Priorizador.

## Priorizador

`/prioritizer`: urgencia cerrada (`interrumpir` | `destacar` | `mostrar_en_contexto`
| `solo_bajo_consulta`). Score por tipo, confianza, impacto y caducidad. Tope de
interrupciones [3]/día (por rol). Aprendizaje desde tasas del Registrador;
alertas `complianceDerived` nunca bajan de `destacar`.

## Consultor

`/consultant`: NL → consulta estructurada sobre catálogo cerrado (métricas,
dimensiones canal/segmento/periodo/sede, filtros). Toda respuesta pasa por el
Filtro y expone `calculation`. Bajo umbral / fuera de catálogo → aclaración +
`UnansweredGapLog` (métricas faltantes). Nunca consultas libres a almacenes.

## Diseñador

`/design`: sistema de diseño por empresa (tokens, densidad, patrones cerrados,
tono, perfiles rol/canal). 3 propuestas JSON → validador WCAG AA / táctil 44px /
patrones vs canal → overlay versionado. Stub de capa 4 para segmento.

## Diseñador ↔ Generador

La UiSpec solo referencia tokens semánticos (`color.primario`, `espaciado.m`).
`bindDesignToUiSpec` elige patrones admitidos por vista; incompatibles → default +
aviso. Cambiar el DS solo re-renderiza (`structuralHash` estable). Validación
aplicada: `validateUiWithDesignSystem`. Vista previa: `renderModuleDesignComparison`.

## Arquitecto de información

`/design/ia`: por rol — inicio (pendientes + frecuentes), menú (≤7 + grupo),
jerarquía de campos. Salida en overlay. Aprendizaje del Observador → **propuestas**
aprobables; nunca reordena solo.

## Redactor de interfaz

`/design/copy`: plantillas (etiqueta, botón verbo+objeto, confirmación, vacío,
ayuda, error) con tono del DS y vocabulario de negocio. Propuesta **una vez**;
fill determinista. Errores desde traza del Juez + hechos. Validador: longitud,
jerga prohibida, variables de hechos, locale.

## Probador (pase final del Generador)

`/generator/qa`: usuario sintético por rol sobre copia aislada del motor. Cubre
camino feliz y excepciones. Detecta acciones nunca habilitadas, callejones,
recorridos sin terminal, pantallas sin salida y campos imposibles. Críticos
bloquean la entrega (`deliveryBlocked`).

## Revisor de seguridad (pase final del Generador)

`/generator/security`: revisa la configuración (RuleSet + UiSpec), no el motor.
SoD, mínimo privilegio, forzado, PII, automatizaciones; atacante busca secuencias
de un solo actor (p. ej. proveedor ficticio). Propone cambios de capa 1 y **nunca
los aplica**. Críticos bloquean la entrega.

## Proveedor de hechos

Catálogo en `/facts`. Las reglas declaran `requiredFacts` / `factCondition`; el
Compilador valida el catálogo. El Proveedor mantiene proyecciones incrementales por
`tenantId` y entrega un `FactBag` sellado a las guardas (sin EventStore).
Consistencia temporal = posición del flujo; concurrencia = versión optimista del hecho.
La traza registra valores y `streamPosition`.
