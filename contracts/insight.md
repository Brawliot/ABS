# Contrato Insight

La **capa 3** produce Insights; el **Presentador** (capa 2) los coloca en la UI.
Este directorio define el contrato; la implementación de inteligencia queda fuera.

## Campos obligatorios

| Campo | Semántica |
|-------|-----------|
| `type` | `metrica` \| `alerta` \| `diagnostico` \| `prevision` \| `recomendacion` \| `optimizacion` \| `experimento` |
| `subject` | Transacción, Parte, Recurso u otro elemento |
| `baseFacts` | Hechos que lo justifican (sin ellos no se muestra) |
| `confidence` | [0, 1] |
| `generatedAt` / `expiresAt` | Caducidad: el Presentador oculta caducados |

## Acción sugerida (opcional)

`suggestedAction.transitionId` se ejecuta por la vía normal **Intérprete → Juez**.
El Presentador no aplica la transición.

Versión: `INSIGHT_CONTRACT_VERSION`.
