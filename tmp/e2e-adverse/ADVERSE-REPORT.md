# Informe escenarios adversos (Playwright)

Fecha: 2026-09-28T14:50:48.084Z
Total: 24 · OK: 24 · Fallos: 0

## excepciones

- **PASS** `exc-venta-rechazo`: t_cancelar_propuesta → estado «cancelada»
- **PASS** `exc-servicio-rechazo-entrega`: t_rechazar_entrega → estado «fallida»
- **PASS** `exc-financiera-impago`: t_impago → estado «impagada»
- **PASS** `exc-uso-cancelar`: t_cancelar → estado «cancelada»
- **PASS** `exc-suscripcion-pausa`: t_pausar → estado «pausada»
- **PASS** `exc-intermediacion-disputa`: t_abrir_disputa → estado «en_disputa»

## rupturas

- **PASS** `rup-1-parciales`: Recorrido t_aceptar→t_iniciar_entrega→t_entrega_parcial
- **PASS** `rup-2-renegociacion`: Recorrido renegociación + re-aceptación
- **PASS** `rup-3-devolucion-vinculada`: Terminal bloqueado; devolución tx-p07-tienda-online-lc.compras-1-devolucion vinculada_a=tx-p07-tienda-online-lc.compras-1
- **PASS** `rup-4-multiparte`: Saldo 0 en a/b/c vía UI: {"a":0,"b":0,"c":0}
- **PASS** `rup-5-pausa`: t_activar→t_pausar→t_reanudar en UI
- **PASS** `rup-6-disputa`: Disputa + liberación de retención en UI
- **PASS** `rup-7-no-encaja`: Diagnóstico UI: 2 cercanos, 3 preguntas

## reglas

- **PASS** `regla-taller-saldo`: Rechazo t_cerrar con mensaje: No se pudo completar «cerrar». Revisa los datos del pedido tx-p04-taller-mecanico-lc.servicio_proyecto-2 e inténtalo de 
- **PASS** `regla-clinica-consentimiento`: Rechazo sin consentimiento/señal: No se puede avanzar a «en_ejecucion»: falta completar el proceso secundario «financiera» (expediente tx-p02-clinica-dental-lc.financiera-2).
- **PASS** `regla-ferreteria-credito`: Rechazo t_aceptar sobre límite: No se pudo completar «aceptar». Revisa los datos del pedido tx-p03-ferreteria-lc.compras-1 e inténtalo de nuevo.
- **PASS** `regla-maquinaria-fianza`: Rechazo cierre con fianza (estado=reservada; setupWarn=t_iniciar_uso: No se puede avanzar a «en_uso»: falta completar el proceso secundario «financiera» (expediente tx-p08-alquiler-maquinaria-lc.financiera-1).

Ir al proceso que bloquea (financiera)): No se pudo completar «cerrar». Revisa los datos del pedido tx-p08-alquiler-maquinaria-lc.uso_temporal-2 e inténtalo de n
- **PASS** `regla-reformas-hito`: Rechazo t_presentar sin hito (tpl.hitos_pago nativo): No se pudo completar «presentar». Revisa los datos del pedido tx-p10-reformas-lc.servicio_proyecto-2

## permisos

- **PASS** `perm-rol-indebido`: Rol «dependiente» sin botón; POST rechazado
- **PASS** `perm-forzado-observador`: Política force flash=Restricción: hecho parte.saldo_pendiente cumple gt 1500 (eval=2000); Cumplimiento: No se puede avanzar a «en_ejecucion»: falta completar el proceso secundario «financiera» (expediente tx-p02-clinica-dental-lc.financiera-2).

## aislamiento

- **PASS** `iso-multiempresa`: UI A no lista B; POST cross-tenant 403
- **PASS** `iso-sede`: Rol sede-centro no ve ni toca sede-norte

## concurrencia

- **PASS** `conc-transicion`: 1 ganador / 1 rechazo claro (events=1): No se pudo completar «aceptar». Revisa los datos del pedido tx-p03-ferreteria-lc.compras-1 e inténta
- **PASS** `conc-unidad`: Reserva exclusiva excavadora-1: La unidad o plaza «excavadora-1» ya está reservada (expediente tx-p08-alquiler-maquinaria-lc.uso_tem

## Hallazgos con gravedad

Ningún fallo de producto detectado en esta pasada.