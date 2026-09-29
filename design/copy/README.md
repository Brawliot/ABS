# Redactor de interfaz

Escribe textos del software generado: etiquetas, botones (verbo+objeto),
confirmaciones, vacíos, ayudas y errores.

1. **Una vez** por especificación: `proposeCopyPack` / `redactInterfaceCopy` → overlay
2. **Runtime**: `resolveCopy` / `resolveJudgeError` rellenan `{{variables}}` sin LLM
3. Validador: longitud, jerga prohibida, errores con hechos declarados, locale

Vocabulario de negocio (p. ej. «albarán») desde la capa superpuesta.
