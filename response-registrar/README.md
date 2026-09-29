# Registrador de respuesta

Registra la respuesta humana a cada Insight mostrado:

| Outcome | Semántica |
|---------|-----------|
| `aceptado` | Actuó; vincula `transitionId` / `transitionEventId` / `transitionResult` |
| `rechazado` | Descartó conscientemente |
| `ignorado` | Visto sin actuar dentro del plazo (`sweepIgnored`) |
| `caducado_sin_ver` | Expiró sin mostrarse |
| `pendiente` | Mostrado, aún en plazo |

Almacén **separado** del EventStore; seudónimos = misma política que telemetría UX
(`pseudonymize` del puente presentation-intelligence).

Lectura capa 3 / Priorizador: `openResponseReader(store)` → sin mutaciones.
