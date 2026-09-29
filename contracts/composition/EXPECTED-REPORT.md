# EXPECTED-REPORT — Composición esperada de los 10 perfiles

**Fecha:** 2026-09-28 (v1.1 — decisiones de usuario aplicadas)  
**Modo:** solo análisis (sin cambios a código, contrato ni pruebas).  
**Fuentes:** `business-profiles-10.json`, `INGREDIENTS-REPORT.md`, `PROCESS-UI-REPORT.md`.  
**Artefactos:** `contracts/composition/expected/<id>.json` (`schemaVersion` `expected-composition/1.1`).

**Convención de marcas**

| Marca | Significado |
|-------|-------------|
| `EXPRESABLE_HOY` | Piezas actuales bastan. |
| `REQUIERE_EXTENSION` | Falta tipar comportamiento (no 7º arquetipo). |
| `REQUIERE_CAMPO_CONTRATO` | v1.1 no tiene campo/plantilla runtime. |
| `MUST_ASK` / `oracleRule: FAIL_IF_COMPOSER_CHOOSES` | El compositor **debe emitir pregunta**; si elige en silencio, el oráculo **falla**. |
| `resolution: ACCEPTED` | Decisión de usuario cerrada. |

---

## 0. Resumen ejecutivo (post-decisiones)

| Perfil | Dominante(s) | Secundarios / mecanismos clave | Preguntas obligatorias |
|--------|--------------|--------------------------------|------------------------|
| p01 | `servicio_proyecto` + `venta` | compras (dir. compra); plazas | — |
| p02 | `servicio_proyecto` (+ cita) | `financiera` bloquea **en_ejecucion** | — |
| p03 | `venta` | **cuenta Parte**: factCondition+restriction; **sin** secundaria financiera; facturación agregada | — |
| p04 | `servicio_proyecto` | cobro = **restriction**; financiera **solo si** aPlazos | **aPlazos** |
| p05 | `uso_temporal` + `venta` | fianza grupo; plazas; compras | — |
| p06 | `suscripcion` + expedientes `servicio` | plazos externos; agenda no central | — |
| p07 | `venta` (+ devolución) | lotes; compras; **no** servicio par | **cuotasRecurrentes** |
| p08 | `uso_temporal` | `financiera`; fianza; mantenimiento→recurso | — |
| p09 | `suscripcion` + plazas (no servicio curso) | tutor→hijo | **inventario (conf. 0.5)** |
| p10 | `servicio_proyecto` | hitos=compromisos; **versionado_alcance**; subcontrata | **naturalezaBienes**, **portal** |

---

## 1. Decisiones de usuario (2026-09-28)

### 1.1 Aceptadas (`resolution: ACCEPTED`)

p01.d1, p01.d2, p02.d1, p02.d2, p02.d3, p04.d2, p05.d1, p06.d1, p06.d2, p07.d2, p08.d1, p08.d2, p09.d1, p10.d2.

### 1.2 Cambios respecto al borrador v1.0

| ID | Antes (recomendación oráculo) | Ahora (usuario) |
|----|-------------------------------|-----------------|
| **p03.d1** | secundaria `financiera` por venta | **Cuenta de Parte**: factCondition `parte.saldo_pendiente` + restriction por límite/impago; cobro mensual = **facturacion_agregada**. **Prohibido** secundaria financiera por venta. |
| **p04.d1** | secundaria venta/cobro | **restriction** (no entregar con saldo pendiente). Financiera **solo si** `aPlazos===true`. |
| **p04.d3** (nuevo) | — | `aPlazos` unknown → **MUST_ASK** |
| **p07.d1** | “preguntar” informal | **MUST_ASK** + `FAIL_IF_COMPOSER_CHOOSES` |
| **p09.d2** | “preguntar” informal | **MUST_ASK** + fail si elige inventario |
| **p10.d3** | ask | **MUST_ASK** |
| **p10.d4** (nuevo) | portal ask implícito | **MUST_ASK** portal |
| **p10.d1** | preguntar venta vs servicio | **ACCEPTED**: modificado = nueva versión de alcance/presupuesto + nueva aceptación **en la misma tx** `servicio_proyecto`. Como el arquetipo no tiene renegociación tipo `venta`, extensión **`versionado_alcance`**. |

### 1.3 Regla de oráculo para preguntas

Si el compositor, ante un ítem `MUST_ASK` / `oracleRule: FAIL_IF_COMPOSER_CHOOSES`:

- elige un valor, o  
- omite la pregunta y continúa,

→ **el oráculo de composición falla** (`oracleFailIf` en el JSON del perfil).

---

## 2. Resumen por perfil (actualizado)

### p01–p02, p05–p06, p08
Sin cambio de modelo respecto a v1.0 salvo `resolution: ACCEPTED` en las decisiones listadas.

### p03-ferreteria
- Dominante `venta`; **secondaries: []**.
- Crédito = cuenta Parte + factCondition/restriction.
- Extensión **facturacion_agregada** para cierre mensual.
- `oracleFailIf`: secundaria financiera inesperada.

### p04-taller-mecanico
- Cobro = restriction; sin secundaria de cobro.
- `composerMustAsk` p04.d3 sobre `aPlazos`.
- Custodia ACCEPTED (`retornable` owned-by Parte).

### p07-tienda-online
- Sin `servicio_proyecto` par (ACCEPTED).
- `p07.d1` MUST_ASK cuotas.

### p09-academia-idiomas
- Solo `suscripcion` + plazas (ACCEPTED p09.d1); **no** proceso `servicio_proyecto` de curso.
- `p09.d2` MUST_ASK inventario.

### p10-reformas
- Hitos = compromisos+bloqueos (ACCEPTED).
- Modificados = **versionado_alcance** en misma tx (extensión).
- MUST_ASK: naturalezaBienes (p10.d3) y portal (p10.d4).
- Subcontrata y compras se mantienen.

---

## 3. Diff vs heurístico PROCESS-UI (cambios relevantes)

| Perfil | Nota post-decisión |
|--------|-------------------|
| p03 | Heurístico **no** añade financiera → ahora **alineado** en absence; sigue faltando tipado cuenta + agregación |
| p04 | Heurístico sin secundaria cobro → **alineado**; falta MUST_ASK aPlazos, custodia, compras |
| p07 | Sigue el falso positivo `servicio_proyecto` |
| p09 | Heurístico inventaría sin preguntar → **falla** oráculo MUST_ASK |
| p10 | Heurístico sin preguntar naturaleza/portal → **falla** MUST_ASK |

---

## 4. Extensiones consolidadas (v1.1)

| Extensión | Perfiles | n |
|-----------|----------|---|
| **direccion_compra** | p01, p03, p04, p05, p07, p10 | **6** |
| **plazas** | p01, p05, p08, p09 | **4** |
| **liquidacion_fianza** | p05, p08, p09 | **3** |
| **filtro_dato_sensible** | p02, p06, p09 | **3** |
| **hitos** | p10 (p02 señal vía financiera) | **1–2** |
| **lotes** | p05, p07 | **2** |
| **custodia** | p04 | **1** |
| **plazos_externos** | p06 | **1** |
| **facturacion_agregada** | p03 | **1** |
| **versionado_alcance** | p10 | **1** | *nueva* — versionar alcance/presupuesto + aceptación en `servicio_proyecto` |

---

## 5. Campos de contrato (sin cambio mayor)

Sigue siendo crítico el **catálogo `tpl.*` runtime**, cobros/bloqueos tipados, portal scopes, y **ask flows** explícitos (`MUST_ASK` ahora tipados en expected para p04, p07, p09, p10).

---

## 6. Preguntas abiertas del compositor (`MUST_ASK`)

| ID | Perfil | Campo | Pregunta (resumen) |
|----|--------|-------|---------------------|
| p04.d3 | p04 | `cobros.aPlazos` | ¿Pago a plazos? → si sí, secundaria financiera |
| p07.d1 | p07 | `cobros.cuotasRecurrentes` | ¿Suscripción / caja mensual? |
| p09.d2 | p09 | `naturalezaBienes` (conf. 0.5) | ¿Inventario de material? |
| p10.d3 | p10 | `naturalezaBienes` | ¿Stock / por obra / del cliente? |
| p10.d4 | p10 | `portalCliente.autoservicio` | ¿Portal de cliente? |

---

## 7. Índice

| Archivo | Notas v1.1 |
|---------|------------|
| `expected/p01-peluqueria.json` | ACCEPTED d1–d2 |
| `expected/p02-clinica-dental.json` | ACCEPTED d1–d3 |
| `expected/p03-ferreteria.json` | Cuenta Parte; sin financiera |
| `expected/p04-taller-mecanico.json` | Restriction + MUST_ASK aPlazos |
| `expected/p05-restaurante.json` | ACCEPTED d1 |
| `expected/p06-gestoria.json` | ACCEPTED d1–d2 |
| `expected/p07-tienda-online.json` | MUST_ASK cuotas; no servicio par |
| `expected/p08-alquiler-maquinaria.json` | ACCEPTED d1–d2 |
| `expected/p09-academia-idiomas.json` | Capacidad bajo suscripción; MUST_ASK inventario |
| `expected/p10-reformas.json` | versionado_alcance; MUST_ASK naturaleza+portal |

Cada JSON incluye `oracleFailIf` / `composerMustAsk` donde aplica.

---

*Fin del informe v1.1. Ningún archivo de producto fuera de `/contracts/composition/` ha sido modificado.*
