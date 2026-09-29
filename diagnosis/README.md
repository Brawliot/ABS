# Diagnosis

Motor de diagnóstico: extractor LLM (OpenAI `gpt-4o-mini`) → JSON validado →
clasificador por reglas → parametrizador acotado → especificación versionada.

- La IA **solo traduce** a las 7 respuestas del cuestionario; nunca elige arquetipo.
- Umbral de confianza: 0.85 (repregunta).
- Contradicción `cliente_se_queda` ∧ `debe_volver` → LOW_CONF con opción de
  leasing con opción de compra (`uso_temporal` + `financiera`).
