# Generador — capa 2 (MVP)

Produce una **especificación de interfaz versionada** (JSON) a partir de las
capas 0 (máquinas) y 1 (políticas), más señales de canal/recurso.

## Principios

- Salida = `UiSpec` en `/presentation`. **No** es código de producto.
- Personalizaciones (`Identity`, `Content`, localización) viven en
  `PresentationOverlay` y se fusionan en cada regeneración.
- Nadie edita a mano el JSON generado.
- Añadir un módulo = añadir una regla en `generator/rules/modules.ts`.

## Módulos (reglas)

| Regla | Condición |
|-------|-----------|
| TPV | canal `presencial` + pago `inmediato` + venta |
| CRM | Partes + estados propuesta/solicitud |
| Inventario | `naturalezaBienes` incluye `propios_por_cantidad` |
| Agenda | `capacidad_temporal` + calendario |
| Facturación | movimientos + docs formales + cumplimiento fiscal |
| Portal cliente | canal `autoservicio` + visibilidad para rol cliente/parte |

## Uso

```ts
import { generateUiSpec, buildConcesionariaGeneratorInput } from "./generator";
import { renderUiSpecHtml } from "./presentation";

const input = buildConcesionariaGeneratorInput();
const spec = generateUiSpec(input, {
  overlay: {
    version: "1",
    identity: { brandName: "Autos López", logoUrl: "/logo.svg" },
    content: { brand: { title: "Autos López" } },
  },
});
const html = renderUiSpecHtml(spec, { roleId: "comercial" });
```
