# Informe — 10 perfiles sintéticos × BusinessProfile v1.1

**Fecha:** 2026-09-27  
**Alcance:** solo análisis (sin cambios a contrato ni Generador).  
**Método:** mapeo heurístico sample→v1.1 (`samples/analyze-10.mts`) → `validateBusinessProfile` → `materialize` → `deduceModules` / `generateUiSpec`.  
**Artefacto crudo:** `_analysis-raw.json`.

---

## 0. Resumen ejecutivo

| Resultado | Valor |
|-----------|-------|
| Perfiles que validan tras mapeo | **10/10** |
| Perfiles cuya UiSpec cubre *todos* los módulos generables esperados | **8/10** (falla cobertura inventariable en p10; p01–p09 OK en IDs mapeables) |
| Violaciones de `modulosNoEsperados` (módulo real generado) | **3 perfiles** (p01 portal; p08/p10 agenda) |
| Campos sample **sin equivalente** estable en v1.1 | ~20 familias (tabla §1) |
| Unknowns del sample que **sí** activan política v1.1 | calendario → **confirm**; naturalezaBienes → **default_safe** |
| Unknowns del sample **huérfanos** (sin campo / sin política) | aPlazos, cuotasRecurrentes, detalle portal |

El contrato v1.1 expresa bien señales gruesas (canales, naturalezaBienes, citas→agenda, TPV básico). **No expresa** cobros ricos, bloqueos, plantillas de política, datos sensibles, capacidad/aforo, fianzas, recurrencia operativa ni composición.

---

## 1. Mapeo sample → esquema v1.1

### 1.1 Equivalencias usadas

| Campo sample | Campo v1.1 | Calidad del mapeo |
|--------------|------------|-------------------|
| `id` | `identity.companyId` (+ systemIds) | OK (id técnico de muestra) |
| `naturalezaBienes` | `naturalezaBienes` | **Directo** (mismos valores) |
| `organizacion.roles[].rol` | `roles[].id/label` | Parcial (se pierde `n`) |
| `organizacion.sedes` | `organization` | Parcial (sedes→OrgDef sintético) |
| `calendario.tieneCitas` | `capabilities.hasCalendar` | Parcial (bool inferido de string) |
| `calendario.festivosRegion` | `location` | Parcial (`ES-MD`→country/region) |
| `calendario.horario` | `calendar` | **Roto**: string libre ≠ `CalendarDef` → se trata como `unknown`→confirm |
| `portalCliente.autoservicio` truthy | `channels` + autoservicio | Solo sí/no; se pierde el alcance (“solo reserva”, “nunca HC”) |
| `permissionFallback` prosa | `permissionFallback.roleId` | Heurística (rol “gerente/dueño…”) |
| `procesos[]` | `processes` / `dominantArchetypeId` | Inferencia débil de arquetipo |
| `cobros.*` | `paymentMode` (aprox.) | Solo inmediato/financiado/mixto |
| `cumplimiento` con “factura” | `hasFormalDocuments` + `hasFiscalCompliance` | Heurística |
| — | `permissions` excepciones | **Vacío** (prosa no compilable) |
| — | `compliance` estructurado | **Vacío** |
| — | `businessPolicies` | **not_applicable** (plantillas sample no existen en runtime) |

### 1.2 Campos sample sin equivalente (o no expresables)

| Campo / dato sample | ¿Por qué no cabe? |
|---------------------|-------------------|
| `nombre`, `descripcion` | Metadato humano; no en contrato |
| `procesos[]` texto libre | Solo se infiere arquetipo; no hay DSL de proceso |
| `cobros.aCredito` / `aPlazos` / `fianzas` / `cuotasRecurrentes` / `pagosPorHitos` | No hay campos de modelo de cobro |
| `portalCliente.autoservicio` detalle | Solo canal; no scopes de portal |
| `permissionFallback` prosa | Solo `roleId` |
| `excepcionesPermiso[]` prosa | No hay compilador NL→PermissionPolicy |
| `politicas[].plantilla` | Catálogo de plantillas no implementado |
| `cumplimiento[]` prosa | No hay CompliancePolicy desde texto |
| `datosSensibles` | Ausente (RGPD/salud/menores) |
| `calendario.horario` string | No hay parser → CalendarDef |
| `calendario.turnosPersonal` / `temporadas` texto | Parcialmente previsto en CalendarDef pero no cableado desde sample |
| `organizacion.roles[].n` | Cardinalidad de plantilla |
| `bloqueos[]` | Composición / guardas no en perfil |
| `modulosEsperados*` | Solo oráculo de análisis |

### 1.3 Datos que el sample declara y el Generador no puede materializar como módulo

(además de lo anterior) compras, crédito/cuentas, presupuestos, órdenes de reparación, envíos, devoluciones, producción/lotes, fianzas, flota, multisede UI, asistencia, evaluaciones, subcontratas, cobros por hitos, calendario fiscal, turnos de personal, aforo.

---

## 2. Validación y módulos generados vs esperados

### 2.1 Validación

Los **10** perfiles, tras el adaptador heurístico, pasan `validateBusinessProfile` (`validate: ok`).  
Ninguno llega inválido al Generador en este ejercicio (el adaptador rellena lo mínimo obligatorio).

### 2.2 Tabla por perfil

| id | Módulos generados | Esperados mapeables presentes | Esperados *sin* módulo en Generador | Violación `modulosNoEsperados` | Notas |
|----|-------------------|-------------------------------|--------------------------------------|--------------------------------|-------|
| **p01** peluquería | agenda, crm, facturación, inventario, portal, **tpv** | agenda, tpv, facturación, inventario, crm | compras | **portal completo** (sí se generó portal) | TPV sí (presencial+inmediato+venta) |
| **p02** clínica | agenda, crm, facturación, inventario, portal | agenda, crm, portal, inventario | presupuestos, sesiones, crédito/plazos | — | Multisede solo en organization; sin UI multisede |
| **p03** ferretería | crm, facturación, inventario, portal | crm, inventario, portal | compras | — | Sin agenda (correcto: sin citas) |
| **p04** taller | agenda, crm, facturación, inventario, portal | todos los mapeables | órdenes, presupuestos, compras | — | `del_cliente`+`propios_por_cantidad` → Inventario OK |
| **p05** restaurante | agenda, crm, facturación, inventario, portal, **tpv** | inventario, crm, facturación | reservas c/aforo, compras, turnos | — | TPV generado (necesario) pero aforo no |
| **p06** gestoría | agenda, crm, portal | crm, portal | calendario fiscal, cuotas | — | Agenda “extra”; sin inventario (naturaleza N/A) |
| **p07** tienda online | crm, facturación, inventario, portal | inventario, crm, portal | pedidos, envíos, devoluciones, compras | — | Sin agenda (OK) |
| **p08** alquiler | agenda, crm, facturación, inventario, portal | inventario, crm | flota, fianzas, crédito, multisede… | **agenda de citas personales** | Agenda aparece por `capacidad_temporal`+citas |
| **p09** academia | agenda, crm, facturación, inventario, portal | crm, portal | grupos, asistencia, cuotas, multisede | — | Inventario por confianza 0.5 en sample (marginal) |
| **p10** reformas | agenda, crm, facturación | — | obras, hitos, subcontratas… | **agenda central** | `naturalezaBienes`→`[]` ⇒ **sin inventario** (esperado mapeable ausente) |

### 2.3 Lectura

- Donde el oráculo pide un módulo **existente** (crm/agenda/inventario/portal/tpv/facturación), el Generador suele acertar **si** el adaptador infiere bien canales/naturaleza/citas.
- La mayoría de fallos son **módulos que el Generador no tiene**.
- Falsos positivos frecuentes: **portal** (cualquier autoservicio) y **agenda** (cualquier “tiene citas” + capacidad_temporal).

---

## 3. Campos `unknown` y política prevista

| Unknown en sample | Perfiles | Campo v1.1 | Política CONTRACT | ¿Se cumplió? |
|-------------------|----------|------------|-------------------|--------------|
| `calendario.horario` unknown | **p04** | `calendar` | **confirm** (L-V 9–18) | **Sí** — `confirmations` con default |
| `calendario.horario` known string | p01,p02,p05–p10 | (forzado a unknown en adaptador) | confirm | Sí (pérdida de horario real) |
| `cobros.aPlazos` unknown | **p04** | — | — | **No hay campo** → no pregunta ni default |
| `cobros.cuotasRecurrentes` unknown | **p07** | — | — | **No hay campo** |
| `naturalezaBienes` unknown | **p10** | `naturalezaBienes` | **default_safe** `[]` | **Sí** — sin Inventario |
| `portalCliente.autoservicio` unknown | **p10** | — (solo `channels`) | channels sería **ask** si unknown | Portal no se pregunta; se omitió autoservicio |

**Conclusión:** las políticas `confirm` / `default_safe` del contrato funcionan **solo** para campos que existen. Varios unknowns del sample son **ciegos**: no disparan ask/confirm/default porque el contrato no los modela. Además, `naturalezaBienes` unknown usa default vacío: para reformas eso **no pregunta** (el sample pedía “debe preguntar”) → desalineación sample↔política actual.

---

## 4. Patrones de huecos (recuento de perfiles afectados)

Agrupación de `necesidadesNoExpresables` + fallos de módulos/oráculo + bloqueos no modelados:

| Patrón | # perfiles | ids | Evidencia típica |
|--------|------------|-----|------------------|
| **Recurrencia / cuotas / suscripción operativa** | **4** | p06, p07*, p08, p09 | cuotas mensuales, alquiler semanal; *p07 unknown |
| **Bloqueos / composición de flujo** | **8** | p02–p05, p07–p10 | consentimiento, señal, límite crédito, no entregar sin pago, fases… |
| **Capacidad / aforo / disponibilidad temporal de recurso** | **3** | p05, p08, (p01 cola) | aforo por turno; flota por fechas; huecos walk-in |
| **Hitos / fases de cobro** | **2** | p02 (señal), p10 (30/40/30) | pagosPorHitos |
| **Fianzas / depósitos / retención** | **3** | p05, p08, p09 | señal grupo; fianza maquinaria; matrícula |
| **Terceros (financiera, subcontrata, mensajería, padre/tutor)** | **5** | p02, p07, p09, p10, (p03 proveedor*) | *compras también |
| **Datos sensibles / Filtro fino** | **3** | p02, p06, p09 | salud, económicos, menores + visibilidad delegada |
| **TPV / cobro presencial rico** | **2** | p01, p05 | TPV sí se genera; aforo/cola no |
| **Compras / proveedores / producción / lotes** | **6** | p01, p03, p04, p05, p07, p10 | sin módulo compras/producción |
| **Custodia / ciclo de objeto del cliente** | **2** | p04, p08 | vehículo en depósito; unidad unitaria |
| **Multisede / traspasos / visibilidad por sede** | **4** | p02, p08, p09, (org) | organization existe; sin módulo ni Filtro fino en UiSpec |
| **Horario estructurado / turnos / temporadas / plazos externos** | **7+** | casi todos con horario string; p06 fiscal; p09 curso | CalendarDef no alimentado; plazos legales externos |
| **Portal semántico (qué puede ver el cliente)** | **6+** | p01–p02, p04–p09 | solo canal autoservicio |
| **Plantillas de política / excepciones en prosa** | **10** | todos | no compiladas |

\*Un mismo perfil puede contar en varios patrones.

---

## 5. Propuesta priorizada para v1.2 (sin implementar)

Orden sugerido por impacto × nº de perfiles × encaje con Generador actual:

### P0 — Bloqueantes para dejar de “inventar” en el adaptador

1. **Modelo de cobro en el perfil** (`cobros`: crédito, plazos, fianzas, recurrencia, hitos) con `ProfileField` y políticas ask/default explícitas — cubre p02–p10 y los unknowns huérfanos.  
2. **`calendar` conversable** (o parser mínimo desde “L-V 9-18”) + distinguir **cita individual vs capacidad/aforo vs plazos externos (fiscal)** — p04 confirm real; p05/p06/p08.  
3. **`portalScopes`** (qué ve el cliente: citas / pagos / nunca HC / tutores) en lugar de solo canal — p01,p02,p09.  
4. **Política ask para `naturalezaBienes` unknown** (hoy default `[]` contradice p10 “debe preguntar”).

### P1 — Expresividad de gobierno

5. **Plantillas `businessPolicies`** del REPORT v1.1 (descuento, límite crédito, bloqueo impago, plazo devolución, aviso plazo) + excepciones tipadas — los 10.  
6. **`datosSensibles` + categorías** enlazadas al Filtro — p02,p06,p09.  
7. **`bloqueos` / composición en el perfil** (y pendiente ya abierta: composición en `GeneratorInput`) — 8 perfiles.

### P2 — Módulos / señales de Generador

8. Señales o módulos: **compras**, **crédito/cuentas**, **fianzas**, **flota/disponibilidad**, **producción/lotes** — 6–8 perfiles.  
9. Matizar **agenda**: no activar `mod.agenda` solo por “tiene citas” genérico si el negocio niega “agenda de citas personales” (p08,p10).  
10. **Multisede** como señal de UI/Filtro, no solo `organization`.

### P3 — UX del contrato

11. Campos `nombre`/`descripcion` opcionales (metadato).  
12. Cardinalidad de roles (`n`) si aporta dimensionamiento.

---

## 6. Limitaciones de este informe

- El mapeo es **heurístico**: un traductor humano/LLM distinto obtendría otros `processes`/`channels`.  
- “Módulo esperado presente” solo cuenta IDs que el Generador **conoce**; el resto se lista como hueco de producto.  
- No se midió igualdad de `structuralHash` entre runs (sí se generó UiSpec en cada perfil válido).

---

## 7. Veredicto

v1.1 **soporta el esqueleto** (inventario por naturaleza, TPV básico, portal binario, agenda por citas) y valida los 10 tras adaptación.  
**No es suficiente** para los 10 negocios sintéticos: cobros, bloqueos, capacidad, fianzas, terceros, datos sensibles y plantillas concentran casi todos los `necesidadesNoExpresables`.  
La prioridad v1.2 debería empezar por **modelo de cobro + calendario/capacidad + portalScopes + ask en naturalezaBienes**, antes de nuevos módulos de Generador.
