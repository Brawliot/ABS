# Políticas de capa 1 — formato declarativo

Documento JSON validado por el esquema en `policies/schema.ts` y compilado por
`compilePolicies` a un `CompiledRuleSet` versionado.

## Forma general

```json
{
  "id": "pack-id",
  "version": "1.0.0",
  "companyId": "acme",
  "archetypeId": "venta",
  "roles": [{ "id": "gerente", "label": "Gerente" }],
  "organization": {
    "sedes": [{ "id": "sede-1", "label": "Central" }],
    "equipos": [{ "id": "eq-1", "label": "Ventas", "sedeId": "sede-1" }],
    "assignments": [
      {
        "actorId": "u-vendedor",
        "sedeId": "sede-1",
        "equipoId": "eq-1",
        "roleId": "vendedor",
        "reportsTo": "u-gerente"
      }
    ]
  },
  "permissions": [],
  "policies": [],
  "compliance": []
}
```

Campos **prohibidos** (rechazo con error explicativo): `states`, `transitions`,
`createState`, `addTransition`, y análogos. El compilador no puede ampliar la máquina.

## Comunicación

Plantilla + evento disparador → `CommunicationRecord` en traza (`affectsState: false`).
Canales: `documento_formal`, `mensaje_externo`, `notificacion_interna`.
Un documento formal genera además `EvidenceRecord` tipada (p. ej. `factura:…`).

## Cumplimiento

Prioridad 300; **nunca forzable**. Incluye evidencia obligatoria, invariante,
restricción, `legalDeadline` (p. ej. desistimiento 14 días) y nota de
`dataRetention` (el borrado operativo es `ParteIdentityStore`).

## Conservación de datos (PII)

Eventos → solo `parteId`. Identidad → `ParteIdentityStore`. Tras `erase`, el
historial se reproduce igual; `resolve` devuelve `[borrado]`.

## Organización

Sede, equipo, rol y `reportsTo` se compilan a `actorDirectory` (atributos de Actor).
Permite reglas como `approval.requiredDirectSuperior`.

## Objetivo

- **Plazo**: `businessDurationMs` sobre un `commitmentId` existente; `addBusinessDuration`
  + calendario → `dueAt`; reloj `en_plazo` | `en_riesgo` | `vencido`.
- **Metas** (`volumen` / `valor` / `tasa`): se comparan con hechos (`observeGoals`).
  **Nunca** se compilan a guardas ni bloquean transiciones.

## Calendario

`weeklyHours`, `exceptions` (festivos), `shifts` (disponibilidad → hecho
`calendario.turno_disponible`), `seasons` (selector `calculation.season`).

## Clasificación

Etiquetas `segmento` | `familia` | `categoria` | `zona` sobre Parte, Oferta o Recurso.
Cada cambio es un evento `clasificacion` (`changeLabel`). Los cálculos pueden
seleccionar por `segment` (etiqueta de Parte) o `classification` explícita;
la vinculación `at_create` congela el snapshot de etiquetas al crear.

## Permisos (`action`)

| action | Compila a | Uso |
|--------|-----------|-----|
| `ejecutar` / `aprobar` | `guard` | Guarda de actor en el avance |
| `forzar` | `force_grant` | Vía del Observador |
| `consultar` | `visibility` | Regla de visibilidad (sin UI aún) |

## Políticas

| Declaración | Compila a |
|-------------|-----------|
| `calculation` | cálculo en la transición (`binding` por defecto `at_create`) |
| `condition` / `factCondition` | guarda con hechos/campos |
| `approval` | requisito de evidencia (rol y/o superior directo) |
| `restriction` / `factRestriction` | guarda de rechazo (`isRestriction`) |

## Vinculación (`binding`)

- `at_create` — se fija al crear la transacción (snapshot `creationRuleSet`)
- `on_state` — al entrar en `stateId` (snapshot en `stateBoundRuleSets`)
- `live` — versión actual del RuleSet

Por defecto: **cálculos → at_create**; **permisos y resto → live**.
El Juez usa `selectEffectiveRules` para mezclar las versiones.

## Prioridad

Cumplimiento (300) > Permiso (200) > Restricción (150) > Política (100).

## Ejemplo 1 — Aprobación por umbral (Permiso + Política)

*«Pedidos > 10.000 € requieren aprobación del gerente»* se modela como política con
`approval`: se compila a `evidence_requirement` (aceptación + rol `gerente`) sobre
`t_aceptar`. **No** se crea ningún estado.

```json
{
  "id": "acme-venta-aprobacion",
  "version": "1.0.0",
  "companyId": "acme",
  "archetypeId": "venta",
  "roles": [
    { "id": "vendedor", "label": "Vendedor" },
    { "id": "gerente", "label": "Gerente" }
  ],
  "permissions": [
    {
      "id": "perm-aceptar",
      "kind": "permiso",
      "transitionId": "t_aceptar",
      "allowedRoles": ["vendedor", "gerente"]
    }
  ],
  "policies": [
    {
      "id": "pol-aprobacion-alto-valor",
      "kind": "politica",
      "transitionId": "t_aceptar",
      "approval": {
        "when": { "field": "importe", "op": "gt", "value": 10000 },
        "requiredRole": "gerente"
      }
    }
  ]
}
```

## Ejemplo 2 — Descuento por segmento (Política)

Cálculo de `descuento_pct` para el segmento `retail`. Dos descuentos distintos
para el mismo segmento y transición se rechazan como contradicción.

```json
{
  "id": "acme-venta-descuentos",
  "version": "1.0.0",
  "companyId": "acme",
  "archetypeId": "venta",
  "roles": [{ "id": "vendedor", "label": "Vendedor" }],
  "policies": [
    {
      "id": "pol-dto-retail",
      "kind": "politica",
      "transitionId": "t_aceptar",
      "segment": "retail",
      "calculation": {
        "field": "descuento_pct",
        "op": "set",
        "value": 10,
        "segment": "retail"
      },
      "condition": {
        "field": "credito_disponible",
        "op": "gte",
        "value": 0
      }
    }
  ]
}
```

## Ejemplo 3 — Factura obligatoria antes del cierre (Cumplimiento)

Evidencia física tipada `factura` en `t_cerrar` más invariante de campo presente.
Prioridad de cumplimiento (300) prevalece sobre permisos y políticas.

```json
{
  "id": "acme-venta-factura",
  "version": "1.0.0",
  "companyId": "acme",
  "archetypeId": "venta",
  "roles": [
    { "id": "operaciones", "label": "Operaciones" },
    { "id": "gerente", "label": "Gerente" }
  ],
  "compliance": [
    {
      "id": "comp-factura-cierre",
      "kind": "cumplimiento",
      "transitionId": "t_cerrar",
      "requiredEvidence": {
        "kind": "fisica",
        "referenceType": "factura"
      },
      "invariant": {
        "id": "inv_factura_antes_cierre",
        "predicate": "field_present:factura_id",
        "appliesInStates": ["en_entrega"],
        "description": "Factura obligatoria antes del cierre"
      }
    }
  ]
}
```

## Activación

1. `compilePolicies(doc, { catalog, activationAt })` → `CompiledRuleSet`
2. `validateCompiledRuleSet(ruleSet, catalog)` antes de activar
3. Misma entrada ⇒ mismo `contentHash` (compilación determinista)
4. Al juzgar: pasar `creationRuleSet` / `stateBoundRuleSets` para respetar vinculación
