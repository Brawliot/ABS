# BusinessProfile — contrato de entrada del Generador

**Versión del esquema:** `1.2.0` (`BUSINESS_PROFILE_SCHEMA_VERSION`)  
**Compatibilidad:** `1.1.0` sigue siendo válida (campos v1.2 opcionales).  
**Consumidor:** ABS / compositor.  
**Productor futuro:** `BusinessProfileSource` (formulario, importación, traductor).  
`diagnosis/` **no** es fuente de este contrato.

Cada campo opcional usa `ProfileField<T>`: `known` | `unknown` | `not_applicable` (+ `confidence?`).

**Fuera del contrato (los genera el sistema):** `caseId`, `caseVersion`, `documentId`, `compiledVersion`, `activationAt` → `generateSystemIds` / `MaterializeOptions.systemIds`.

---

## Tabla de campos (v1.2)

| Campo | Tipo | Obl. | Valores | Uso en código | Ante `unknown` |
|-------|------|------|---------|---------------|----------------|
| `schemaVersion` | string | sí | `"1.1.0"` \| `"1.2.0"` | validador | — |
| `identity.companyId` | string | sí | id empresa | RuleSet / ids sistema | — |
| `policyMeta.documentVersion` | string | sí | semver libre | PolicyDocument.version | — |
| `policyMeta.dominantArchetypeId` | enum | sí | 6 arquetipos | PolicyDocument | — |
| `processes` | Field\<ProcessDecl[]\> | known≥1 | id + archetypeId + label? + **exchangeDirection?** | lifecycles / compra | **ask** |
| `channels` | Field\<Channel[]\> | known≥1 | presencial…web | modules | **ask** |
| `paymentMode` | Field\<PaymentMode\> | known | inmediato\|financiado\|diferido\|mixto | TPV | **ask** |
| `cobros` | CobrosModel? | — | ver § Cobros | compositor | por subcampo |
| `resourceSubtypes` | Field\<…\> | — | capacidad_temporal\|retornable\|capital | Agenda | **default_safe** `[]` |
| `capacityMode` | Field\<cita_individual\|plazas\>? | — | | plazas vs cita | **default_safe** `cita_individual` |
| `naturalezaBienes` | Field\<NaturalezaBien[]\> | — | propios_por_cantidad\|propios_unitarios\|del_cliente | Inventario | **ask** (v1.2; ya no default `[]`) |
| `location` | Field\<{countryCode, regionCode?}\> | — | ISO país | festivos | **default_safe** omitir |
| `capabilities.*` | Field\<bool\> | — | | CRM / Facturación / Agenda | ver v1.1 |
| `roles` | Field\<RoleDef[]\> | known≥1 | | permisos | **ask** |
| `calendar` | Field\<CalendarDef\> | si citas | | RuleSet | **confirm** → L-V 9–18 |
| `permissions` | Field\<PermissionPolicy[]\> | — | excepciones | expand | **default_safe** `[]` |
| `permissionFallback` | Field\<{roleId, exclude?}\> | known | rol residual | matriz | **ask** |
| `compliance` | Field\<CompliancePolicy[]\> | — | | RuleSet | **default_safe** `[]` |
| `catalogFields` | Field\<string[]\> | — | | compile | **default_safe** `[importe,parte_id]` |
| `organization` | Field\<OrganizationDef\> | — | | actorDirectory | **default_safe** omitir |
| `businessPolicies` | Field\<BusinessPolicy[]\> | — | JSON avanzado | RuleSet | **default_safe** omitir |
| `policyTemplates` | Field\<Invocation[]\>? | — | `tpl.*` | compile → PolicyDocument | **default_safe** omitir |
| `portalCliente` | Field\<{autoservicio}\>? | — | | canal portal MUST_ASK | **ask** |
| `pipelineStateIds` | Field\<string[]\> | — | | CRM | **default_safe** omitir |

### Cobros (v1.2)

| Subcampo | Tipo known | Ante `unknown` |
|----------|------------|----------------|
| `aCredito` | `false` \| `{ kind: "cuenta_parte", limitePorDefectoEur?, bloqueoImpagoDias? }` | **ask** |
| `aPlazos` | `false` \| `{ enabled: true, viaFinanciera? }` | **ask** |
| `fianzas` | `false` \| `{ kind: "retencion", umbralComensales?, noReembolsable? }` | **default_safe** (omitir) |
| `cuotasRecurrentes` | `false` \| `{ periodicidad, domiciliada? }` | **ask** |
| `pagosPorHitos` | `false` \| `{ hitos: HitoPagoDecl[] }` | **default_safe** (omitir) |

Cada subcampo es `ProfileField` con `confidence?`.

### Plantillas `tpl.*`

Catálogo en `contracts/policy-templates/`. Compilación determinista a `BusinessPolicy` / `CompliancePolicy` (Capa 1):

- `tpl.descuento_maximo_sin_aprobacion`
- `tpl.importe_requiere_aprobacion`
- `tpl.limite_credito_por_cliente`
- `tpl.bloqueo_por_impago`
- `tpl.plazo_devolucion`
- `tpl.aviso_plazo`

### Inventario

`naturalezaBienes`: solo `propios_por_cantidad` activa `mod.inventario`.  
**v1.2:** `unknown` ⇒ **ask** (no default vacío).

### Portal

Canal `autoservicio` ⇒ rol `cliente` + `visibility.scope = "propia"`.  
Campo `portalCliente` (opcional): si presente y `unknown` ⇒ **ask**; si `autoservicio=true` exige canal `autoservicio`.

### Extensiones de núcleo (fuera del JSON schema, APIs)

| Extensión | Módulo |
|-----------|--------|
| Dirección de intercambio | `elements/exchange-direction.ts` |
| Capacidad por plazas | `facts/plazas.ts` + `capacityMode` |
| Pagos por hitos | `archetypes/milestones.ts` + `cobros.pagosPorHitos` |
| Liquidación de fianza | `elements/retention-settlement.ts` |

### Puerto

```ts
interface BusinessProfileSource {
  readonly sourceId: string;
  load(): unknown | Promise<unknown>;
}
```

Flujo: `validate` → `materialize` (+ systemIds, plantillas) → `generateUiSpec`.

### Migración v1.1 → v1.2

- Perfiles `schemaVersion: "1.1.0"` siguen validando y materializando.
- Campos nuevos (`cobros`, `capacityMode`, `policyTemplates`, `portalCliente`, `exchangeDirection`) son opcionales.
- Cambio de semántica: `naturalezaBienes` unknown ya no materializa a `[]`; exige respuesta o `not_applicable`.
