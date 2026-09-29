# JOURNEY-COVERAGE-REPORT — caminos felices multirol (Playwright)

**Generado:** 2026-09-28T14:50:52.872Z
**Duración suite journeys:** 23172 ms (23.2 s)

## Por escenario

| Escenario | Perfil | Dominante | Completo | Cierre | Replay | Portal | Transiciones |
|-----------|--------|-----------|----------|--------|--------|--------|--------------|
| p01-peluqueria.venta | p01-peluqueria | venta | sí | ok | ok | ok | t_aceptar → t_iniciar_entrega → t_cerrar |
| p02-clinica.servicio | p02-clinica-dental | servicio_proyecto | sí | ok | ok | ok | t_aprobar → t_desembolsar → t_amortizar → t_cerrar → t_acordar → t_ejecutar → t_presentar → t_cerrar |
| p03-ferreteria.venta | p03-ferreteria | venta | sí | ok | ok | ok | t_aceptar → t_iniciar_entrega → t_cerrar |
| p04-taller.servicio | p04-taller-mecanico | servicio_proyecto | sí | ok | ok | ok | t_acordar → t_ejecutar → t_presentar → t_cerrar |
| p05-restaurante.venta | p05-restaurante | venta | sí | ok | ok | ok | t_aceptar → t_iniciar_entrega → t_cerrar |
| p06-gestoria.suscripcion | p06-gestoria | suscripcion | sí | ok | ok | ok | t_activar → t_cerrar |
| p07-tienda.venta | p07-tienda-online | venta | sí | ok | ok | ok | t_aceptar → t_iniciar_entrega → t_cerrar |
| p08-alquiler.uso | p08-alquiler-maquinaria | uso_temporal | sí | ok | ok | ok | t_aprobar → t_desembolsar → t_amortizar → t_cerrar → t_reservar → t_iniciar_uso → t_cerrar |
| p09-academia.suscripcion | p09-academia-idiomas | suscripcion | sí | ok | ok | ok | t_activar → t_cerrar |
| p10-reformas.servicio | p10-reformas | servicio_proyecto | sí | ok | ok | ok | t_acordar → t_ejecutar → t_presentar → t_cerrar |
| concesionaria.venta | concesionaria | venta | sí | ok | ok | ok | t_aprobar → t_desembolsar → t_amortizar → t_cerrar → t_acordar → t_ejecutar → t_presentar → t_cerrar → t_aceptar → t_iniciar_entrega → t_cerrar |
| marketplace.intermediacion | marketplace-intermediacion | intermediacion | sí | ok | ok | ok | t_emparejar → t_iniciar → t_cerrar |

## Cobertura por arquetipo

- **venta:** 5 completo(s) · escenarios: p01-peluqueria.venta, p03-ferreteria.venta, p05-restaurante.venta, p07-tienda.venta, concesionaria.venta
- **servicio_proyecto:** 4 completo(s) · escenarios: p02-clinica.servicio, p04-taller.servicio, p10-reformas.servicio, concesionaria.venta
- **financiera:** 3 completo(s) · escenarios: p02-clinica.servicio, p08-alquiler.uso, concesionaria.venta
- **uso_temporal:** 1 completo(s) · escenarios: p08-alquiler.uso
- **suscripcion:** 2 completo(s) · escenarios: p06-gestoria.suscripcion, p09-academia.suscripcion
- **intermediacion:** 1 completo(s) · escenarios: marketplace.intermediacion

## Flujos no completados

Ninguno.

## Trazabilidad

Definiciones: `tests/e2e/journeys/scenarios.ts`. Ejecución UI-only: `tests/e2e/journeys/runner.ts`.

*Fin JOURNEY-COVERAGE-REPORT.*
