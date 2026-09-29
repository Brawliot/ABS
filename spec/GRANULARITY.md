# Regla de granularidad — qué constituye UNA transacción

## Regla (normativa)

**Una transacción** es el *menor* intercambio de valor entre partes que cumple las tres condiciones a la vez:

1. **Aceptación única** — Queda fijado por **una** aceptación vinculante que apunta a una versión concreta de oferta (o a un paquete de ofertas co-aceptadas de forma atómica en el mismo acto).
2. **Cierre autónomo** — Puede alcanzar su terminal de éxito satisfaciendo por sí sola las **4 invariantes de cierre** (compromisos resueltos, saldo cero, recursos liberados o consumidos, evidencia completa), sin depender del cierre de otro intercambio.
3. **Independencia de fallo** — Si el fallo, cancelación o incumplimiento de un intercambio **no obliga** a invalidar el otro, son **transacciones distintas** (eventualmente vinculadas por composición dominante/secundario), no una sola.

Si dos intercambios fallan o se cierran juntos de forma inseparable (misma aceptación, mismo saldo, mismos recursos), son **una** transacción.

## Justificación

| Principio / mecanismo | Por qué encaja |
|----------------------|----------------|
| Capa 0 = transacción | La unidad es un intercambio de valor, no un “pedido comercial” ni un “cliente”. |
| Solo la Transacción avanza sola | Cada unidad tiene su propia máquina; lo demás se deriva de sus eventos. |
| Composición dominante/secundario | La financiera de una venta *nace* en un estado de la venta y puede *bloquear* un avance, pero es otra transacción con su propio cierre. |
| Oferta versionada | Renegociar = nueva versión; la aceptación apunta a una versión → límite natural de la unidad. |
| Invariantes de cierre | Si el saldo o los compromisos no se pueden liquidar sin mezclar otro intercambio, se ha cortado mal el grano. |

## Anti-ejemplos

| Situación | ¿Una o varias? |
|-----------|----------------|
| Venta de vehículo + financiación + plan de mantenimiento | **Tres** transacciones compuestas (venta dominante; financiera y servicio secundarias). |
| Dos líneas de un mismo albarán co-aceptadas juntas, mismo pago | **Una** (paquete atómico). |
| Suscripción mensual renovada | Cada periodo con aceptación/cargo propio es **una** transacción (o renovación = nueva vinculada); el arquetipo define el patrón, no fusiona periodos. |
| Reapertura tras terminal | **Nueva** transacción vinculada (nunca se reabre el terminal). |
| Pedido con varias entregas | **Un** acuerdo (una tx) con **un compromiso por entrega** (tramos); o txs vinculadas si fallan independencia de fallo. Ver principio 8 en PRINCIPLES.md. |

## Criterio operativo para el diagnóstico

El clasificador elige arquetipo(s); el parametrizador no puede fusionar en una sola especificación dos unidades que fallen el test de independencia de fallo. El validador de composición comprueba que los `bloquea` no formen ciclos.
