# Presentador

Lleva Insights de la **capa 3** a la **capa 2**.

1. Rechaza caducados y sin hechos base.
2. Pasa cada Insight por el **Filtro** (fila del sujeto + campos de hechos).
3. Coloca en **Módulo + Vista** junto al sujeto (`resolvePlacement`).
4. Asigna variante de experimento con **hash estable** (`audienceKey`, no sesión).
5. Aceptar recomendación → Intérprete → solicitud para el **Juez** (no ejecuta).

Contrato: `/contracts/insight`.
