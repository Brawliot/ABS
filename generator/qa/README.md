# Probador — pase final del Generador

Usuarios sintéticos (uno por rol) recorren caminos felices y excepciones sobre
una **copia aislada** del motor (`InMemoryEventStore` propio).

## Detecta

| Hallazgo | Gravedad típica |
|----------|-----------------|
| Acción que nunca se habilita | major |
| Callejón sin salida (nadie puede actuar) | **critical** |
| Recorrido que no alcanza terminal | major / critical |
| Pantalla sin salida | major |
| Campo obligatorio imposible | **critical** |

Los hallazgos **críticos** ponen `deliveryBlocked: true` y bloquean la entrega.

## Uso

```ts
import { generateUiSpec, buildConcesionariaGeneratorInput } from "../generator";
import { runQaPass, assertDeliverable } from "../generator/qa";

const input = buildConcesionariaGeneratorInput();
const spec = generateUiSpec(input);
const report = runQaPass(input, spec);
assertDeliverable(report); // lanza si hay críticos
```
