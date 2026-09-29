# Informe — cierre de pendientes (ferretería / compositor / eval Intérprete)

**Fecha:** 2026-09-28  
**Restricciones:** sin tocar Capa 0; sin editar pruebas existentes.

---

## 1. Bug ferretería (`regla-ferreteria-credito`)

### Causa (origen)
`contracts/policy-templates/compile.ts` — plantilla `tpl.limite_credito_por_cliente` emitía:

```ts
factRestriction.params.parteId = "{{parte_id}}"
```

`policies/judge.ts` → `resolveFactParams` solo sustituye `$fields.*`. El literal `{{parte_id}}` hacía que `parte.saldo_pendiente` se evaluara para una Parte inexistente (**saldo = 0**), así que `saldo > 1500` nunca se cumplía y `t_aceptar` se aceptaba con deuda 2000.

Cadena: **plantilla → PolicyDocument → CompiledRuleSet → Juez** (compositor y proyección de hechos estaban bien).

### Corrección
En `contracts/policy-templates/compile.ts`:
- `parteId: "$fields.parte_id"`
- `amountField: "importe"` (bloquea también `saldo + nueva venta > límite`)
- campos de catálogo: `parte_id`, `importe`

### Verificación
- Adverse: **PASS** `regla-ferreteria-credito` (`web/ADVERSE-REPORT.md` — 24/24)
- Nueva prueba: `tests/credit-limit.properties.test.ts` (propiedad + regresión + escenario adverso unitario)

### Otras plantillas / perfiles
| Pieza | ¿Afectada? | Acción |
|-------|------------|--------|
| `tpl.restriccion_saldo_antes_de` | No | Ya usaba `$fields.parte_id` |
| `tpl.bloqueo_por_impago` | Debilidad distinta | Campo `dias_impago`/`recibos_pendientes`; sin valor en form no activa |
| `tpl.importe_requiere_aprobacion` | Debilidad distinta | Sin `importe` en fields no dispara approval |
| p03 / p08 / sample-pol con límite crédito | Sí | Corregidos vía mismo compile |

---

## 2. Prompt «Cerrar huecos COMPOSER-REPORT»

**Estado: ya ejecutado completo** antes de esta pasada.

Evidencia: `contracts/composition/COMPOSER-REPORT.md` («huecos cerrados») + `tests/composer.gaps.test.ts` + `composer/schedule-parser.ts` + plantillas EXTRA + oráculo estricto (`ORACLE_EXCEPTIONS`, fit 10/10).

| Ítem del prompt | Estado |
|-----------------|--------|
| Saldo taller antes de entregar | ✓ |
| Hitos reformas = compromisos + bloqueos (traces/milestones) | ✓ (residual: `tpl.hitos_pago` no emite regla de fase nativa — hallazgo adverse documentado, E2E inyecta regla) |
| Preguntas unificadas | ✓ |
| Lector de horarios | ✓ |
| Plantillas nuevas | ✓ |
| Oráculo estricto + excepciones | ✓ |

No faltaba implementación del prompt; el residual de hitos→fase nativa está declarado a propósito (evitar N financieras).

---

## 3. Eval Intérprete — tres caminos

Corpus: sintético test **n=187** (`origin=synthetic`). Objetivo reales ≥139: **no alcanzado**.

| Camino | Precisión | IC95% | Aclaraciones | Errores graves |
|--------|-----------|-------|--------------|----------------|
| Heurístico | 75.9% | [69.3%, 81.5%] | 57.2% | **0.0%** |
| Simulador eval | 97.9% | [94.6%, 99.2%] | 33.2% | 2.1% |
| OpenAI real | — | — | — | **no ejecutado** |

**OpenAI:** no hay `OPENAI_API_KEY` en el entorno. El harness ya soporta:

```bash
ABS_LLM_PROVIDER=openai ABS_LLM_MODE=record ABS_LLM_CASSETTE_DIR=tmp/interpreter-cassettes npm run eval:interpreter
```

Cuando haya clave: grabará cassettes, rellenará la tercera fila y, si errores graves LLM > heurístico, propondrá umbral 0.85 (código en `tests/real/interpreter/evaluate.ts`).

Informe vivo: `tests/real/interpreter/INTERPRETER-LLM-REPORT.md`.

---

## Suite
- `tsc` OK
- Adverse Playwright: **24/24** (ferretería crédito verde)
- Prueba nueva crédito verde
- `vitest.config.ts`: `testTimeout: 20000` (properties de UiSpec >5s en máquina cargada; no se editaron tests existentes)
