# Revisor de seguridad — pase final del Generador

Revisa la **configuración generada** (RuleSet + UiSpec), no el código del motor.

## Reglas deterministas

- Separación de funciones (pago crear/aprobar; stock ajuste/recuento)
- Mínimo privilegio (permisos sin uso en recorridos)
- Forzado excesivo o sin límite (`binding: live`)
- PII visible sin acción que lo requiera
- Automatizaciones sobredimensionadas

## Atacante

Sobre copia aislada del motor, busca la secuencia proveedor ficticio → pedido →
recepción → pago ejecutada por un solo rol.

## Salida

Hallazgos con gravedad, secuencia demostrativa y **propuestas de capa 1**
(nunca aplicadas). Críticos ⇒ `deliveryBlocked`.

```ts
import { runSecurityReview, assertSecurityDeliverable } from "../generator/security";

const report = runSecurityReview(input, spec);
assertSecurityDeliverable(report);
```
