# Corpus Intérprete

Evaluación offline del camino Intérprete → intención estructurada (sin Juez).

## Archivos

| Archivo | Uso |
|---------|-----|
| `LABELING.md` | Guía de etiquetado y anonimización |
| `corpus.synthetic.test.jsonl` | Split de prueba (generado; `origin=synthetic`) |
| `corpus.synthetic.dev.jsonl` | Split de desarrollo (ajustar prompts; no reportar) |
| `corpus.real.test.jsonl` | A aportar: mensajes reales anonimizados (`origin=real_anonymized`) |
| `generate-synthetic.ts` | Genera el corpus sintético |
| `evaluate.ts` | Métricas + informe |
| `INTERPRETER-LLM-REPORT.md` | Informe (regenerado por evaluate) |

## Comandos

```bash
npx tsx tests/real/interpreter/generate-synthetic.ts
npx tsx tests/real/interpreter/evaluate.ts
```

## Separación

- **test**: solo para el informe de precisión.
- **dev**: iteración de prompts; no mezclar con métricas publicadas.
- Objetivo: **n ≥ 139** casos `real_anonymized` en `split=test`. Mientras no existan, el informe declara la limitación y reporta el sintético.
