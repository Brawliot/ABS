# Presentation — capa 2

Esquema de interfaz: Módulo, Vista, Acción, Contenido, Recorrido, Identidad,
Localización. Consumido por el Generador; renderizado mínimo en `renderer.ts`.

**Lectura:** nunca al almacén directamente — solo `readThroughFilter` /
`createPresentationReadGateway` (paquete `filter/`).
