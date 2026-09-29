# Diseñador

Produce un **sistema de diseño** propio por empresa y lo guarda en la
capa superpuesta (`PresentationOverlay.designSystem`).

1. Entrada: identidad + descripción (+ stub capa 4: segmento/diferenciación)
2. LLM/heurístico propone **3** alternativas JSON (esquema cerrado)
3. Validador determinista: WCAG AA 4,5:1, táctil ≥44 px, escala tipográfica,
   máx. colores, patrones vs canal
4. Si falla → rechazo con motivo y otra propuesta (máx. 3 intentos)
5. Aprobado → versionado en `DesignStore` + overlay
