# Catálogo de hechos

El **Proveedor de hechos** calcula datos cross-transacción a partir del flujo de
eventos (por `tenantId`) y se los entrega a las guardas. Las guardas **no** leen
el almacén de eventos.

## Hechos del MVP

| id | Resultado | Parámetros | Elemento | Derivación |
|----|-----------|------------|----------|------------|
| `parte.saldo_pendiente` | number | `parteId` | Parte | Suma de `importe` de txs abiertas (no terminal) |
| `parte.antiguedad_ms` | duration_ms | `parteId` | Parte | now − primera transacción de la Parte |
| `recurso.capacidad_comprometida` | number | `recursoId`, `periodStart`, `periodEnd` | Recurso | Suma de `capacityUnits` reservadas en el periodo |
| `parte.tx_en_estado` | integer | `parteId`, `stateId` | Parte | Nº de txs de la Parte en ese estado |
| `calendario.turno_disponible` | integer | `at`, `actorId?`, `recursoId?` | Recurso | 1 si hay turno abierto (calendario) |
| `objetivo.volumen` | number | `scopeId` | Transacción | Agregado de volumen (meta; informativo) |
| `objetivo.valor` | number | `scopeId` | Transacción | Agregado de valor (meta; informativo) |
| `objetivo.tasa` | number | `scopeId` | Transacción | Tasa observada (meta; informativo) |

Definiciones en código: `facts/catalog.ts`.

## Payload en eventos

Para alimentar la proyección incremental, cada transición relevante debe llevar en
`event.data.facts` (o campos en `fieldsAfter`):

```json
{
  "facts": {
    "parteId": "cliente-1",
    "importe": 12000,
    "recursoId": "sala-a",
    "capacityUnits": 1,
    "periodStart": "2026-04-01T00:00:00.000Z",
    "periodEnd": "2026-04-02T00:00:00.000Z"
  }
}
```

## Declarar hechos en una política

```json
{
  "id": "pol-credito",
  "kind": "politica",
  "transitionId": "t_aceptar",
  "requiredFacts": [
    {
      "factId": "parte.saldo_pendiente",
      "params": { "parteId": "$fields.parte_id" }
    }
  ],
  "factCondition": {
    "factId": "parte.saldo_pendiente",
    "params": { "parteId": "$fields.parte_id" },
    "amountField": "importe",
    "op": "lte",
    "value": 50000
  }
}
```

`$fields.X` se resuelve contra los campos de la transacción evaluada.
El Compilador rechaza hechos inexistentes o parámetros incorrectos.

## Flujo en el Juez

1. `collectFactRequests(ruleSet, transitionId, fields)`
2. `provider.prepare(tenantId, requests)` → `FactBag`
3. `attemptJudgedAdvance({ ..., facts: bag })`
4. Tras aceptar: `provider.confirm(bag)`; si versionó el hecho, reevaluar
5. Al confirmar el evento: `provider.applyEvent(tenantId, event)`

La traza incluye `factsUsed` y `factsStreamPosition`.

## Cómo añadir un hecho nuevo

1. Añadir definición en `FACT_CATALOG` (`facts/catalog.ts`) con id, tipo, params y derivación.
2. Implementar el update incremental en `TenantFactProjection.apply` / `read`.
3. Documentar el payload de evento aquí.
4. Cubrir con un test de proyección + un test de compilación que lo referencie.
5. No exponer el `EventStore` a las guardas: solo valores vía `FactBag.get`.

## Aislamiento

Toda proyección está keyed por `tenantId`. Un `FactProvider` nunca mezcla eventos
de empresas distintas.
