# COMPOSER-REPORT — Compositor determinista v1 (huecos cerrados)

**Fecha:** 2026-09-28  
**Módulo:** `composer/`  
**Camino:** `BusinessProfile v1.2` → `composeBusinessProfile` → preguntas unificadas → materialize → `generateUiSpec`  
**Adaptador samples:** `mapSampleToV12` + `parseScheduleText`

---

## 1. Qué entrega el compositor

| Salida | Descripción |
|--------|-------------|
| `composition` | `ComposedArchetypeSpec` validada o `undefined` |
| `processes` | Procesos (posiblemente aumentados) |
| `policyTemplates` | Invocaciones `tpl.*` (núcleo + EXTRA) |
| `milestones` | Hitos validados (compromisos pagar + bloqueos de fase) |
| `visibility` | Requisitos de portal |
| `questions` | Lista unificada: MUST_ASK + confirms (calendario/horario) |
| `nonComposable` | Extensiones documentadas |
| `traces` | Cada elemento → `field` + `ruleId` + `decision` |
| `compositionHash` | SHA-256 canónico |

---

## 2. Tabla de encaje (oráculo estricto)

Fuente: `expected/<id>.json` + `runCompositionFitOracle`.  
**Encaje duro** = dominante + secundarios + políticas (salvo `ORACLE_EXCEPTIONS`).  
**fitOk duro: 10/10.**

| Perfil | Dominante | Secundarios (hit/esp) | Políticas (hit/esp) | Preguntas unificadas | Notas |
|--------|-----------|----------------------|---------------------|----------------------|-------|
| p01-peluqueria | ✓ | 0/0 | 2/2 | — | `permiso_excepcion` + descuento |
| p02-clinica-dental | ✓ | 1/1 financiera | 4/4 | confirm horario (sede) | evidence + límite plazos |
| p03-ferreteria | ✓ | 0/0 | 2/2 | — | cuenta Parte; sin financiera |
| p04-taller-mecanico | ✓ | 0/0 | 3/3 | `cobros.aPlazos`, calendar | **saldo antes de t_cerrar** ✓ |
| p05-restaurante | ✓ | 0/0 | 2/2 | — | `fianza_condicional` (grupo>10) |
| p06-gestoria | ✓ | 0/0 | 2/2 | confirm agosto intensivo | evidence + aviso_plazo |
| p07-tienda-online | ✓ | 0/0 | 2/2 | `cobros.cuotasRecurrentes` | — |
| p08-alquiler-maquinaria | ✓ | 1/1 financiera | 4/4 | — | fianza + evidence + crédito |
| p09-academia-idiomas | ✓ | 0/0 | 2/3 | `naturalezaBienes` | excepción: `matricula_no_reembolsable` |
| p10-reformas | ✓ | 0/1\* | 3/3 | `naturalezaBienes`, portal | hitos sin financiera; \*subcontrata |

\* Secundaria `servicio_proyecto` (subcontrata) exceptuada: ver §4.

### Excepciones del oráculo (`ORACLE_EXCEPTIONS`)

| id | Perfil | Motivo |
|----|--------|--------|
| `ex.facturacion_agregada` | p03 | Extensión no tipada |
| `ex.versionado_alcance` | p10 | Renegociación en servicio |
| `ex.custodia` | p04 | Depósito vehículo |
| `ex.lotes_*` | p05, p07 | Lotes/caducidad |
| `ex.filtro_sensible` | \* | PII / filtro |
| `ex.plazos_externos` | p06 | Calendario fiscal |
| `ex.subcontrata_secundaria` | p10 | SECONDARY_EQUALS_DOMINANT |
| `ex.matricula_no_reembolsable` | p09 | Plantilla prosa 1 perfil |

Cualquier otro `POLICY_MISS` / `SECONDARY_MISS` / `DOMINANT_MISS` → **fail**.

---

## 3. Taller (p04) — comprobación crítica

**Antes:** la composición no imponía «no entregar con saldo pendiente».  
**Ahora:**

1. Regla `R_TALLER_SALDO_ENTREGA` (canal `taller` + dominante servicio) → `tpl.restriccion_saldo_antes_de` en `t_cerrar`.
2. Plantilla compila a `factRestriction` (`parte.saldo_pendiente` > 0 → rechazo).
3. Prueba `tests/composer.gaps.test.ts`: el Juez rechaza `t_cerrar` con saldo pendiente vía `FactProvider` + `attemptJudgedAdvance`.

---

## 4. Reformas (p10) — decisión hitos / subcontrata

**p10.d2 (ACCEPTED):** hitos = compromisos pagar + bloqueos de la fase siguiente, **no** secundaria financiera.

| Aspecto | Decisión |
|---------|----------|
| Compositor | `R_HITOS` ya **no** añade `financiera`. Emite `milestones` + `tpl.hitos_pago` + grafo bornIn→bloquea en traces. |
| Subcontrata | **No** se modela como secundaria del mismo arquetipo: `validateComposition` rechaza `SECONDARY_EQUALS_DOMINANT`. Queda proceso standalone `lc.subcontrata` con `exchangeDirection=empresa_compra` + `nonComposable.subcontrata_secundaria_mismo_arquetipo`. |
| Alternativa (sin implementar) | Linked-transaction / arquetipo proveedor distinto, o extensión de composición que permita secundaria homónima con id de proceso. |

---

## 5. Preguntas unificadas

- `unifyComposerQuestions` lista **antes de materializar** todos los asks y confirms (calendario incluido).
- Materialize no puede bloquearse por un campo que no estuviera en esa lista.
- Confirms (`kind: confirm`) permiten default; asks con `FAIL_IF_COMPOSER_CHOOSES` bloquean.

| Perfil | Preguntas |
|--------|-----------|
| p01 | (ninguna) |
| p02 | `calendar.horario` (sede Norte…) |
| p03 | (ninguna) |
| p04 | `cobros.aPlazos`, `calendar` |
| p05 | (ninguna) |
| p06 | `calendar.temporadas` (agosto intensivo) |
| p07 | `cobros.cuotasRecurrentes` |
| p08 | (ninguna) |
| p09 | `naturalezaBienes` |
| p10 | `naturalezaBienes`, `portalCliente.autoservicio` |

---

## 6. Lector de horarios

Módulo `composer/schedule-parser.ts` → `CalendarDef` determinista.

Soporta: rangos `L-V`, `M-S`, días sueltos, horarios partidos (`y`), media jornada sábado, `lunes cerrado`, temporada `agosto intensivo` (sin inventar horas → pregunta).  
Lo no interpretable → `questions`, nunca valor inventado. Aplicado a los 10 perfiles en `mapSampleToV12`.

---

## 7. Catálogo `tpl.*`

**Núcleo** (`POLICY_TEMPLATE_IDS`, 6 — intacto para tests prep): descuento, importe, límite crédito, bloqueo impago, plazo devolución, aviso plazo.

**EXTRA** (`POLICY_TEMPLATE_IDS_EXTRA`):

| Plantilla | Compila a |
|-----------|-----------|
| `tpl.restriccion_saldo_antes_de` | `factRestriction` saldo > 0 |
| `tpl.evidencia_requerida` | `requiredEvidence` |
| `tpl.fianza_condicional` | condition umbral + restriction fianza |
| `tpl.permiso_excepcion` | `PermissionPolicy` rol restringido |
| `tpl.limite_plazos_financiacion` | restriction `plazos_meses` |
| `tpl.hitos_pago` | compliance documentando pattern |

Aliases sample/expected → tpl en `SAMPLE_PLANTILLA_TO_TPL`.

---

## 8. Pruebas

| Archivo | Contenido |
|---------|-----------|
| `tests/composer.gaps.test.ts` | **Nuevo:** taller/Juez, hitos p10, horarios, unificación, oráculo estricto |
| `tests/composer.test.ts` | Sin cambios de aserciones; sigue verde |
| `tests/composer-prep.v12.test.ts` | Catálogo núcleo de 6 intacto |

**Suite:** `tsc` + vitest — **282 passed** (1 skipped).

---

## 9. Trazabilidad

```ts
const r = composeBusinessProfile(profile, { extraQuestions: scheduleQuestions });
r.traces.filter(t => t.elementKind === "policy" || t.elementKind === "secondary")
```

Ejemplo taller: `R_TALLER_SALDO_ENTREGA` → `tpl.restriccion_saldo_antes_de`.  
Ejemplo reformas: `R_HITOS` + `R_HITOS_VALIDATE` (compromisos) + `R_SUBCONTRATA_DOC`.

---

*Fin COMPOSER-REPORT.*
