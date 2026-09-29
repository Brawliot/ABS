# Corpus real (anonimizado)

Coloca aquí textos **reales anonimizados** aportados por el responsable de calidad.

## Convención

| Archivo | Uso |
|---------|-----|
| `diagnosis/*.txt` o `diagnosis.jsonl` | Extractor de diagnóstico (prioridad) |
| `interpreter/` | Intérprete |
| `consultant/` | Consultor |
| `design/` | Propuestas Diseñador / Redactor |

Mientras no haya corpus, los bancos sintéticos en `/tests/bank` son **smoke test**
y el informe los etiqueta como **limitación** — no demuestran el umbral 90%±5%.

No subir PII. Anonimizar nombres, CIF, emails y direcciones antes de commit.
