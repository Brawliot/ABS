# Informe Intérprete + LLM

Generado: 2026-09-28T00:10:55.122Z

## Corpus

- Casos en split=test: **187**
- Sintéticos: **187** (marcados `origin=synthetic`)
- Reales anonimizados: **0** (objetivo ≥ 139)
- **Limitación:** Conjunto de prueba con 0 casos reales anonimizados (< 139). Resultados actuales son sobre corpus SINTÉTICO (n=187).

## Proveedores medidos

- Heurístico: HeuristicInterpreterExtractor
- Camino LLM: LlmInterpreterExtractor + EvalSimulatorLlmAdapter (NO es OpenAI; proxy de evaluación)
- OpenAI: error: Falta OPENAI_API_KEY (necesario salvo ABS_LLM_MODE=replay con cassettes)

## Tabla comparativa (corpus de prueba)

| Camino | Precisión | IC95% | Aclaraciones | Errores graves |
|--------|-----------|-------|--------------|----------------|
| Heurístico | 75.9% | [69.3%, 81.5%] | 57.2% | 0.0% |
| Simulador eval | 97.9% | [94.6%, 99.2%] | 33.2% | 2.1% |
| OpenAI real | — | — | — | no ejecutado |

### Precisión por tipo (simulador)

- **aceptacion**: 100.0% IC95% [88.6%, 100.0%] (30/30)
- **cancelacion**: 100.0% IC95% [91.2%, 100.0%] (40/40)
- **declaracion_pago**: 100.0% IC95% [86.7%, 100.0%] (25/25)
- **cobro_parcial**: 100.0% IC95% [90.1%, 100.0%] (35/35)
- **entrega**: 84.0% IC95% [65.3%, 93.6%] (21/25)
- **saludo**: 100.0% IC95% [86.2%, 100.0%] (24/24)
- **ambiguo**: 100.0% IC95% [67.6%, 100.0%] (8/8)

### Análisis de errores (simulador)

- **transicion**: 4

## Guardrail

- Muestra interpretAsync: 30
- Transiciones ilegales llegando a solicitud (Juez): **0** (debe ser 0)

## Qué debe aportar el usuario

Mensajes reales anonimizados en JSONL (origin=real_anonymized, split=test), n≥139, etiquetados según LABELING.md. No usar el split=dev para ajustar prompts del informe de prueba.

Formato: ver `LABELING.md`. Colocar en `corpus.real.test.jsonl` con `origin=real_anonymized` y `split=test`.
