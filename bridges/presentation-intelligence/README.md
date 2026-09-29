# Puente presentation → intelligence

Observador de experiencia como **puente** entre capa 2 (presentación) y capa 3
(inteligencia).

| Rol | API |
|-----|-----|
| Capa 2 (escribir) | `ExperienceTelemetryStore.append`, `buildTelemetryRecord`, `buildInsightShownRecord` |
| Capa 3 (leer) | `openLayer3Reader(store)` → `Layer3PresentationIntelligence` |

La capa 3 **solo** lee agregados (embudo, abandonos, impresiones de Insight) a
través de esa interfaz. No recibe el almacén ni puede hacer `append`.

Insights (`insight_shown`): qué (`insightId`), dónde (`insightSurfaceId`), a
quién (`subjectPseudoId`), correlación seudonimizada para el Registrador de
respuesta.
