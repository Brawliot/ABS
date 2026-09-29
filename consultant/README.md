# Consultor

Traduce preguntas en lenguaje natural a **consultas estructuradas** sobre un
catálogo cerrado (métricas, dimensiones, filtros). Nunca genera SQL/consultas
libres contra almacenes.

1. Extractor (LLM / heurístico) → `StructuredMetricQuery` o aclaración
2. Ejecución sobre hechos métricos → **Filtro**
3. Respuesta con `calculation` (métrica, periodo, filtros)
4. Preguntas fuera de catálogo → `UnansweredGapLog` (métricas que faltan)
