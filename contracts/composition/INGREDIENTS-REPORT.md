# INGREDIENTS-REPORT — ¿Bastan las piezas del núcleo para componer módulos?

**Fecha:** 2026-09-27  
**Modo:** solo análisis (sin cambios a código, contrato ni pruebas).  
**Fuentes:** `PRINCIPLES.md`, `archetypes/*`, `elements/*`, `policies/*`, `facts/*`, `filter/*`, `generator/*`, samples `business-profiles-10.json`, informe `samples/REPORT-10-v1.1.md`.

**Veredicto corto:** las piezas de Capa 0/1 **bastan para modelar el flujo operativo** de la mayoría de necesidades de los 10 perfiles (como composición de arquetipos + compromisos + movimientos + políticas). **No bastan hoy para “generar módulos de UI”** porque el Generador elige de un catálogo fijo (`mod.*`) y **no consume** la composición. El compositor de producto es viable si primero se cierra un puñado de **extensiones** (no arquetipos nuevos) y se cambia el Generador a “UI derivada de procesos”.

---

## 1. Inventario de piezas componibles (hoy)

### 1.1 Arquetipos de transacción (6)

| Id | Archivo | Happy path (ids transición) | Notas |
|----|---------|------------------------------|-------|
| `venta` | `archetypes/venta.ts:240` | `t_aceptar`…`t_cerrar`; parciales `t_entrega_parcial` | Oferta versionada, entrega por tramos |
| `servicio_proyecto` | `archetypes/servicio.ts:150` | `t_acordar`→`t_ejecutar`→`t_presentar`→`t_cerrar` | Alcance + entrega de trabajo |
| `suscripcion` | `archetypes/suscripcion.ts:187` | `t_activar`, `t_periodo`, `t_renovar`, pausa | Periodos / renovación |
| `uso_temporal` | `archetypes/uso-temporal.ts:116` | `t_reservar`→`t_iniciar_uso`→`t_cerrar` | Reserva de recurso + devolución |
| `intermediacion` | `archetypes/intermediacion.ts` | disputa + retención (`c_retencion`) | Marketplace / retención de valor |
| `financiera` | `archetypes/financiera.ts:133` | `t_aprobar`→`t_desembolsar`→`t_amortizar` | Crédito / cobertura |

Catálogo: `archetypes/catalog.ts:9-16`.

### 1.2 Composición (Capa 0)

| Pieza | Evidencia | Semántica |
|-------|-----------|-----------|
| `SecondaryBinding` | `archetypes/types.ts:25-31` | `secondaryArchetypeId`, `bornInDominantState`, `bloquea` |
| `ComposedArchetypeSpec` | `types.ts:33-36` | `dominant` + `secondaries[]` |
| Validador (sin ciclos) | `archetypes/composition.ts:37-64`, DFS `117+` | `bloquea` ≠ `bornIn`; ciclos estado/secundario |
| Runtime `bloquea` | `archetypes/composed-runtime.ts:2-4`, `193-244` | Impide avance del dominante mientras secundario abierto |
| Tx vinculada (no reapertura) | `archetypes/linked-transaction.ts:1-60` | Devolución/reapertura = tx nueva `vinculada_a` |
| Granularidad | `spec/GRANULARITY.md:5-31` | Una tx = aceptación + cierre autónomo + independencia de fallo |

**Único tipo de enlace de composición en runtime:** `bloquea` (más nacimiento en estado). No hay “paralelo sin bloqueo”, “opcional”, ni “bloquea transición concreta” tipado aparte del estado destino.

### 1.3 Los 10 elementos + subtipos cerrados

Definición: `PRINCIPLES.md:67-80`. Subtipos: `elements/subtypes.ts:6-85`.

| Elemento | Subtipos relevantes para composición |
|----------|--------------------------------------|
| Parte | `cliente`, `proveedor`, `tercero_intermediado`, `garante` |
| Oferta | `bien`, `trabajo`, `acceso`, `uso`, `dinero_cobertura` |
| Recurso | `consumible`, `capacidad_temporal`, `retornable`, `capital` |
| Compromiso | `entregar`, `pagar`, `devolver`, `mantener` |
| Movimiento | `cargo`, `liquidacion`, `reembolso`, **`retencion`**, `reparto` |
| Evidencia | `aceptacion`, `confirmacion_sistema`, `constancia_fisica` |
| Transacción | los 6 arquetipos |
| Actor / Estado / Evento | kinds de gramática (`core/grammar.ts`) |

Metaobjeto 5 capas: `PRINCIPLES.md:84-92`; registro: `core/metaobject.ts`.

### 1.4 Políticas Capa 1 (artefactos compilables)

Declarativo → compilado: `policies/types.ts`, `policies/compiler.ts`.

| Artefacto | Origen típico | Uso |
|-----------|---------------|-----|
| `guard` / permiso ejecutar·aprobar | `PermissionPolicy` | Quién avanza |
| `visibility` + `VisibilityScope` | permiso `consultar` | empresa\|sede\|equipo\|**propia** |
| `force_grant` | permiso `forzar` | Observador |
| `condition` / `restriction` / `factCondition` | `BusinessPolicy` | Predicados / rechazo duro |
| `calculation` | política | Precio, descuentos… |
| `evidence_requirement` | approval / compliance | Evidencia extra |
| `invariant` | compliance | Invariante adicional |
| `legal_deadline` | compliance | Plazo legal bloquea transición |
| `dataRetention` | compliance (nota) | Conservación (PII fuera) |
| Organización | `organization.ts` | sedes/equipos/`reportsTo` |
| Calendario | `calendario.ts` | horario, festivos, **turnos**, temporadas |
| Objetivo | `objetivo.ts` | plazos hábiles / metas (**no bloquean**) |
| Clasificación | `clasificacion.ts` | segmento/familia/categoría/zona |
| Comunicación | `comunicacion.ts` | plantilla → doc formal → Evidencia |
| Vinculación | `at_create` \| `on_state` \| `live` | Cuándo aplica la regla |

**Plantillas nombradas en BusinessProfile REPORT:** propuestas (`tpl.*`), **no implementadas** como catálogo runtime — hoy solo JSON de `PolicyDocument`.

### 1.5 Hechos (guardas sin EventStore)

`facts/catalog.ts:28-39`: `parte.saldo_pendiente`, `parte.antiguedad_ms`, `recurso.capacidad_comprometida`, `parte.tx_en_estado`, `calendario.turno_disponible`, objetivos informativos.

### 1.6 Filtro (lectura Capa 2)

| Capacidad | Evidencia |
|-----------|-----------|
| Filas por scope sede/equipo/propia/empresa | `filter/filter.ts:88-117` |
| Campos `operativo` \| `fiscal` \| `personal` | `filter/types.ts:16`, defaults `116-146` |
| Log acceso personal | `filter.ts:178-224` |
| Sello anti acceso directo L2 | `filter/seal.ts:32+` |

**No hay** clasificación “salud”, “menores”, “tutor→hijo” como scope de primer nivel.

### 1.7 Generador (hoy): piezas de UI **no** componibles desde el núcleo

Reglas fijas: `generator/rules/modules.ts:34-205` — `mod.tpv`, `mod.crm`, `mod.inventario`, `mod.agenda`, `mod.facturacion`, `mod.portal_cliente`.  
Vistas/acciones sí se derivan de lifecycles: `generator/generate.ts:144-171`.

---

## 2. Prueba de composición (necesidades mínimas + 10 perfiles)

Leyenda: **COMPONIBLE** | **COMPONIBLE CON AJUSTE** | **FALTA PIEZA** | **DUDA** (validador Capa 0).

### 2.1 Necesidades mínimas pedidas

| Necesidad | Clasificación | Composición / pieza |
|-----------|---------------|---------------------|
| **Fianza / depósito** | **COMPONIBLE CON AJUSTE** | Movimiento `retencion` (`subtypes.ts:46`) + evidencia de cobro; liberación/reembolso como en intermediación (`intermediacion.ts:7-14`). **Ajuste:** tipificar “fianza de cliente” en oferta `dinero_cobertura` o política que exija retención antes de `t_iniciar_*` / `t_reservar`. Intermediación ya modela retención, pero el patrón “cliente deja fianza en alquiler/reserva” encaja más en `uso_temporal` + movimiento retención — **DUDA** si el validador de cierre exige liquidar retención como saldo 0 sin regla explícita. |
| **Cobro por hitos** | **COMPONIBLE CON AJUSTE** | Dominante `servicio_proyecto` (o `venta`) + N compromisos `pagar` por fase; o N txs `venta`/`servicio` vinculadas. **Ajuste:** parámetro “hitos[]” (importes/%) → commitments + `bloquea` de fase siguiente hasta cobro (secundaria `financiera` o evidencia de pago). Un solo `t_amortizar` de financiera **no** es multi-hito semántico. |
| **Cuota recurrente** | **COMPONIBLE** | Arquetipo `suscripcion` (`t_periodo` / `t_renovar`, `suscripcion.ts:129-147`) + GRANULARITY periodo = tx. Política de domiciliación = cálculo/comunicación, no nuevo arquetipo. |
| **Crédito con límite** | **COMPONIBLE** | Secundaria `financiera` bornIn aceptación + `bloquea` entrega/cierre (`types.ts:25-31`; pack concesionaria). Límite: `factCondition` sobre `parte.saldo_pendiente` (`facts/catalog.ts:28-49`) + restriction. Impago: `t_impago`. |
| **Presupuesto + aceptación** | **COMPONIBLE** | Estado `propuesta` + `t_aceptar` / `t_acordar` con evidencia `aceptacion` (venta/servicio). Renegociación: `t_proponer_renegociacion` (venta). |
| **Orden de reparación** | **COMPONIBLE CON AJUSTE** | Dominante `servicio_proyecto` (diagnóstico→presupuesto→ejecución→cierre) + secundaria `venta` de piezas o compromisos `entregar` consumibles. **Ajuste:** etiqueta de proceso / campos (vehículo, nº orden); bloqueo “no entregar sin pago” = `bloquea` cierre/entrega por financiera o restriction por saldo. |
| **Custodia bien del cliente** | **COMPONIBLE CON AJUSTE** | Recurso `retornable` del cliente + compromisos `devolver`; o tx `uso_temporal` invertida (taller custodia). **Ajuste:** Parte dueña del recurso ≠ empresa; política “no `t_cerrar` sin devolución”. **DUDA:** el modelo de recurso asume compromiso de la empresa; custodia ajena puede rozar invariantes de proyección (`elements/projection.ts`). |
| **Alquiler unidad por fechas** | **COMPONIBLE** | `uso_temporal` + recurso `retornable`/`capital` + hecho `recurso.capacidad_comprometida` (`catalog.ts:61-71`) en factCondition anti- overlapping. Composición con `financiera` si crédito. |
| **Aforo / capacidad (no cita 1:1)** | **COMPONIBLE CON AJUSTE** | Mismo hecho `capacidad_comprometida` sobre recurso `capacidad_temporal` (mesa/turno). **Ajuste:** semántica “plazas” vs “cita individual”; calendario turnos (`calendario.ts` shifts). No hace falta arquetipo nuevo. |
| **Compras a proveedor** | **COMPONIBLE CON AJUSTE** | Tx `venta` **invertida** (empresa como comprador) o `servicio_proyecto` de suministro; Parte `proveedor`. **Ajuste:** rol/dirección del intercambio en definición (hoy venta asume cliente-comprador típico) — **DUDA** si la máquina `venta` es direccionalmente neutra. Alternativa: no nuevo arquetipo; parametrizar Partes comprador/vendedor. |
| **Producción por lotes** | **FALTA PIEZA** (extensión) | Consumible + movimientos no bastan para “materia prima → lote → caducidad”. **Extender** Recurso/Oferta con lote/caducidad (campos de definición) o hecho `recurso.lote_*`; **no** un 7º arquetipo. Hasta entonces solo inventario por cantidad (`naturalezaBienes` / consumible). |
| **Obra con fases** | **COMPONIBLE CON AJUSTE** | `servicio_proyecto` + hitos de pago (arriba) + subcontrata = secundaria `servicio_proyecto` o Parte `proveedor` en tx vinculada. `bloquea` fase siguiente. |
| **Matrícula y grupo** | **COMPONIBLE CON AJUSTE** | `suscripcion` (cuota) + recurso `capacidad_temporal` (plaza en grupo) + clasificación zona/segmento. **Ajuste:** relación tutor–menor (visibilidad) → Filtro; no está en scopes actuales. |
| **Consentimiento previo** | **COMPONIBLE** | Compliance `requiredEvidence` / `evidence_requirement` en transición de inicio (`compiler` compliance) + comunicación documento formal → Evidencia (`comunicacion.ts:92-94`). LegalDeadline si aplica. |

### 2.2 Cruce con perfiles (necesidadesNoExpresables / bloqueos / módulos ausentes)

| Perfil | Necesidad destacada | Clasificación | Notas |
|--------|---------------------|---------------|-------|
| p01 | Walk-in / cola con huecos | **COMPONIBLE CON AJUSTE** | Capacidad libre + cita opcional; UI de “hueco”, no pieza nuclear nueva |
| p02 | HC restringida; financiera externa; bloqueos consentimiento/señal | Consentimiento **COMPONIBLE**; HC **FALTA PIEZA** (clasificación dato + Filtro); financiera externa **COMPONIBLE CON AJUSTE** (Parte `tercero_intermediado` + secundaria financiera) |
| p03 | Crédito límite + albarán→factura | Crédito **COMPONIBLE**; agrupación albarán **FALTA PIEZA** (regla de facturación agregada / commitment batch) |
| p04 | Custodia coche + garantía post-cierre | Custodia **CON AJUSTE**; garantía = tx vinculada post-terminal **COMPONIBLE** (`linked-transaction.ts`) |
| p05 | Aforo + TPV + mermas | Aforo **CON AJUSTE**; TPV es **módulo UI** (canal+pago), flujo cobro = venta; mermas **FALTA** (extensión consumible) |
| p06 | Cuotas + plazos fiscales externos | Cuotas **COMPONIBLE** (suscripción); calendario fiscal **FALTA PIEZA** (plazos no = horario negocio; hoy `legalDeadline` ancla a campo de tx, no a calendario externo masivo) |
| p07 | Lotes/producción + envíos | Lotes **FALTA** (extensión); envío = compromiso `entregar` **COMPONIBLE CON AJUSTE** |
| p08 | Flota + fianza + traspaso sedes | Flota/fechas **COMPONIBLE**; fianza **CON AJUSTE**; traspaso sede **CON AJUSTE** (organización + recurso) |
| p09 | Tutor-menor + cuotas + curso | Cuotas **COMPONIBLE**; tutor→hijo **FALTA** (Filtro/relación); temporada académica **CON AJUSTE** (seasons calendario) |
| p10 | Hitos + subcontrata + modificados | Hitos/subcontrata **CON AJUSTE**; cambio sobre oferta aceptada = renegociación venta **COMPONIBLE** o nueva versión |

---

## 3. Análisis del Generador: ¿puede construir pantallas desde composición?

### 3.1 Lo que ya deriva de procesos (sin catálogo de módulo)

En `generator/generate.ts:144-171`:

- Por cada `LifecycleSlice` × estado → `view.*` (tablero).
- Por cada transición saliente con roles de guarda → `action.*`.
- Forms de entidad genéricos (`parte`/`oferta`/`recurso`).

Es decir: **tablero de máquina de estados** ya es composición → UI.

### 3.2 Lo que depende de IDs de módulo fijos

`generator/rules/modules.ts`:

| Módulo | Match (señales, no composición) |
|--------|----------------------------------|
| `mod.tpv` | `presencial` + `paymentMode===inmediato` + arquetipo venta |
| `mod.crm` | `hasPartes` + estados pipeline |
| `mod.inventario` | `naturalezaBienes` incluye `propios_por_cantidad` |
| `mod.agenda` | `capacidad_temporal` + `hasCalendar` |
| `mod.facturacion` | movimientos + formales + fiscal |
| `mod.portal_cliente` | canal `autoservicio` + visibility cliente |

`buildModules` (`generate.ts:192-258`) **empaqueta** vistas/acciones existentes bajo esos IDs; no inventa pantallas de “crédito” o “fianzas”.

`GeneratorInput` (`generator/types.ts`) **no incluye** `ComposedArchetypeSpec` → el Generador **ignora** `bloquea` / secundarios al maquetar.

### 3.3 Qué haría falta para UI derivada de procesos (sin catálogo manual)

1. Entrada = lifecycles **+ composition** + ruleSet (ya casi).  
2. Agrupar UI por **proceso** (slice) y por **secundario** (sub-tablero), no por `mod.*`.  
3. Derivar “páginas” de señales tipadas: recurso capacidad → agenda; retención abierta → panel fianza; `suscripcion` → cuotas; etc. (reglas de **presentación**, no módulos de negocio).  
4. Portal = proyección Filtro de Partes, no `mod.portal_cliente` hardcode.  
5. Dejar de exigir `modulosEsperados` de producto; el oráculo pasa a ser “¿existen vistas para cada estado alcanzable y acciones permitidas?”.

**Conclusión Generador:** hoy **no** genera “módulo crédito” componiendo `financiera`; solo pinta la máquina si está en `lifecycles` y la mete en CRM/Agenda/… según booleans. El compositor de negocio es viable **después** de desacoplar `MODULE_RULES` de la semántica de negocio.

---

## 4. Piezas que faltan / extensiones (priorizadas)

Prioridad: **extender existente** > pieza nueva. Riesgo = impacto en invariantes P5/P7/cierre/composición.

| # | Pieza (mínima) | Tipo | Perfiles que desbloquea (≈) | Riesgo núcleo |
|---|----------------|------|------------------------------|---------------|
| 1 | **Parametrizar hitos de pago** (lista importe/% → compromisos `pagar` + bloqueos) | Extensión composición/política | p02, p05, p10 (3–4) | Bajo si no añade estados a mano |
| 2 | **Fianza como retención tipada** (movimiento `retencion` + guarda pre-avance) | Extensión movimiento + política | p05, p08, p09 (3) | Medio: cierre/saldo con retención |
| 3 | **Dirección comprador/vendedor** en venta (compras proveedor) | Extensión definición/Parte | p01, p03, p04, p05, p07, p10 (6) | Bajo–medio |
| 4 | **Capacidad “plazas”** (hecho ya existe; semántica aforo vs cita) | Extensión hecho/calendario | p01, p05, p08, p09 (4) | Bajo |
| 5 | **Custodia recurso de tercero** (retornable owned-by Parte) | Extensión recurso/proyección | p04, p08 (2) | **Medio–alto** (proyección/cierre) |
| 6 | **Lote / caducidad / merma** en consumible | Extensión definición recurso | p05, p07 (2+) | Medio (inventario) |
| 7 | **Plazos externos / calendario fiscal** (no solo `legalDeadline` por tx) | Extensión cumplimiento/calendario | p06 (1) + cumplimiento general | Medio |
| 8 | **Filtro: dato sensible + visibilidad delegada (tutor)** | Extensión Filtro/clasificación | p02, p06, p09 (3) | Bajo en Capa 0; alto en privacidad |
| 9 | **Facturación agregada (albaranes→factura)** | Extensión compromiso/movimiento o política | p03 (1) | Medio |
| 10 | **Composición en GeneratorInput + UI por proceso** | Cambio Generador (no núcleo) | **10/10** para “módulos” | Nulo en Capa 0; alto en producto |

**No se recomienda** (con lo visto): 7º arquetipo “obra”, “reparación”, “matrícula”, “fianza”. Encajan como parámetros de `servicio_proyecto` / `suscripcion` / `uso_temporal` + movimientos/políticas.

### Piezas que **no** faltan en el núcleo (falso hueco de “módulo”)

TPV, CRM, portal, agenda, facturación como **nombres de módulo** — son empaquetados UI. El flujo subyacente ya es venta/servicio + canales + permisos.

---

## 5. Respuesta a la decisión de producto

| Pregunta | Respuesta |
|----------|-----------|
| ¿Componer módulos desde el núcleo en lugar de catálogo manual? | **Sí como dirección.** El núcleo ya compone **comportamiento** (arquetipos + `bloquea` + políticas + hechos). |
| ¿Bastan las piezas actuales sin tocar nada? | **No.** Hacen falta pocas **extensiones** (hitos, fianza tipada, dirección compra, capacidad plazas, custodia, lotes, plazos externos, Filtro sensible) y un **Generador orientado a procesos**. |
| ¿El cuello de botella es Capa 0 o el Generador? | **Ambos, pero el Generador es el bloqueo inmediato** para la promesa “generar módulos”: hoy `MODULE_RULES` no lee composición. |
| ¿Riesgo de romper invariantes? | Bajo si se evita arquetipo nuevo y se extiende movimiento/hecho/política; **custodia de bien ajeno** y **retenciones en cierre** son las zonas delicadas (validar con `assertTransactionClosure` / proyección). |

---

## 6. DUDA abiertas (para el compositor)

1. ¿Una fianza en `uso_temporal` liquida con las 4 invariantes de cierre sin regla extra de `retencion`?  
2. ¿`venta` es usable como compra a proveedor solo cambiando roles de Parte, o el lenguaje de estados sesga el modelo?  
3. ¿Varios `bloquea` al mismo estado destino con dos secundarios es válido y deseable (DFS ya contempla multi-arista)? Revisar `composition.ts` + casos reales obra+financiera+subcontrata.

---

*Fin del informe. Ningún archivo de producto fuera de `/contracts/composition/` ha sido modificado por este análisis.*
