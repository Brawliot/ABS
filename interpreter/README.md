# Intérprete — MVP

Convierte interacciones (botón, formulario, mensaje) en **solicitudes de
transición**. **Nunca ejecuta**: el Juez es quien avanza.

- Estructurado → traducción determinista.
- Texto libre → extractor (heurístico offline / LLM) + confianza; bajo umbral
  (0.85, mismo que diagnóstico) → confirmación o humano.
- Identidad desde canal (`identityFromChannel`).
- Idempotencia (`IdempotencyLedger` / `clientRequestId`).

Declaración de pago con captura → solicitud con
`evidenceValidationStatus: "pendiente_validacion"` y `pago_confirmado: false`.
