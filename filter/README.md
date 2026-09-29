# Filtro — juez de lectura (capa 2)

Toda lectura desde la presentación pasa por `readThroughFilter`.

- **Filas**: permiso `consultar` (visibility), ámbito sede/equipo/propia, `tenantId`.
- **Campos**: reglas fiscales / personales / operativas.
- **PII**: cada acceso a campos personales queda en `personalAccessLog`.
- **Sellado**: `sealAgainstLayer2DirectAccess` / `assertNoDirectStoreAccess` —
  la capa 2 no puede tocar EventStore ni proyecciones.
