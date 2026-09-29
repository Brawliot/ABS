# Priorizador

Decide **qué** Insights se muestran, **cuándo** y con qué **urgencia**.

## Urgencia (cerrada)

`interrumpir` → `destacar` → `mostrar_en_contexto` → `solo_bajo_consulta`

## Puntuación

Tipo × confianza × impacto estimado × proximidad a caducidad.

## Límites

Máx. **3** interrupciones por persona y día (configurable por rol).

## Aprendizaje

Tasas del Registrador (`statsByInsightType`): tipos ignorados ≥90% con
suficientes observaciones bajan un nivel. Alertas `complianceDerived` nunca
bajan de `destacar`.
