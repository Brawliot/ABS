# Convención de versionado de especificaciones

Las especificaciones del núcleo (`spec/`, gramática del metaobjeto, enums cerrados)
usan **versionado semántico** `MAJOR.MINOR.PATCH`.

| Componente | Cuándo incrementa |
|------------|-------------------|
| **MAJOR** | Cambio de **gramática**: nuevos tipos de estado, tipos de evento, ejes de estado, reglas de validez, capas del metaobjeto, o cualquiera de los 10 elementos. Compatible hacia atrás **no** se garantiza. |
| **MINOR** | Extensión compatible: nuevos campos opcionales en perfiles, nuevos arquetipos, documentación. No altera enums cerrados ni reglas de validez. |
| **PATCH** | Corrección editorial, ejemplos, clarificaciones sin cambiar semántica. |

## Reglas

1. Añadir un valor a un enum cerrado (p. ej. tipo de estado, tipo de evento, tipo de evidencia) exige **MAJOR**.
2. Cambiar el significado de una regla de validez exige **MAJOR**.
3. Solo un humano aprueba el bump de **MAJOR** (principio 6).
4. El archivo `spec/grammar.version.json` es la fuente de la versión vigente de la gramática.

## Versión actual

Ver `grammar.version.json`.
