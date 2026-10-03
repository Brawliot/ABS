# Códigos de Error del Validador UiSpec

Referencia exhaustiva de los 25+ códigos de error que el Validador UiSpec puede emitir. Cada código incluye descripción, causas comunes, y cómo solucionarlo.

---

## SCHEMA (Fase 1: Estructura)

### UNSUPPORTED_VERSION

**¿Qué significa?**
- La versión de `UiSpec.version` no es soportada por el Validador.
- Versiones soportadas: `1.0.0`, `1.1.0`, `1.2.0`

**¿Por qué falla?**
- Generaste la spec con una versión del Generador que el Validador no entiende.
- Es común si usas binarios desactualizados o incompatibles.

**Cómo arreglarlo:**
1. Verifica tu versión del Generador: `npm ls @abs/generator`
2. Si es < 1.2.0, actualiza: `npm install @abs/generator@latest`
3. Regenera la spec desde cero.
4. Reintenta validación.

**Ejemplo real:**
```json
{
  "version": "2.0.0",  // ❌ No soportada
  "views": []
}
```

**Solución:**
```json
{
  "version": "1.2.0",  // ✅ Soportada
  "views": []
}
```

**Referencia de código:** `presentation/uispec-validator.ts:402-409`

---

### SCHEMA

**¿Qué significa?**
- UiSpec no cumple el esquema Zod esperado.
- Falta un campo requerido, tipo incorrecto, o estructura malformada.

**¿Por qué falla?**
- El JSON no parsea correctamente.
- Faltan campos obligatorios: `views`, `actions`, `forms`, `version`, `id`.
- Un campo tiene tipo incorrecto (ej: `views` debería ser array, es string).

**Cómo arreglarlo:**
1. Lee el mensaje de error exacto (incluye ruta JSON).
2. Verifica la estructura en `presentation/uispec-schema.ts` (esquema Zod).
3. Añade campo faltante o convierte al tipo correcto.
4. Prueba con: `validateUiSpec(raw, input)` en tu código.

**Ejemplo real:**
```json
{
  "version": "1.0.0",
  // ❌ Falta views[], actions[], forms[]
  "identity": { "brandName": "Mis Servicios" }
}
```

**Solución:**
```json
{
  "version": "1.0.0",
  "id": "spec-001",
  "views": [],
  "actions": [],
  "forms": [],
  "recorridos": [],
  "modules": [],
  "identity": { "brandName": "Mis Servicios" },
  "localization": [],
  "content": {},
  "styleTokenRefs": {}
}
```

**Referencia de código:** `presentation/uispec-schema.ts`

---

## REFERENCIAL (Fase 1: Referencias)

### REF_VIEW_STATE

**¿Qué significa?**
- Una vista tipo `tablero` referencia un `lifecycleId` o `stateId` que no existe.
- O el `stateId` no pertenece a ese lifecycle.

**¿Por qué falla?**
- Generador creó referencia a estado inexistente.
- Eliminaste un estado del lifecycle después de generar.
- Cargaste spec de persistencia corrupta.

**Cómo arreglarlo:**
1. Identifica el `lifecycleId` y `stateId` del error.
2. En `GeneratorInput.lifecycles[]`, encuentra el lifecycle por ID.
3. Verifica que el state existe en `lifecycle.states[]`.
4. Si no existe, añádelo o cambia vista a otro state válido.
5. Regenera la spec.

**Ejemplo real:**
```json
{
  "views": [
    {
      "id": "tablero-pendientes",
      "kind": "tablero",
      "lifecycleId": "solicitud",
      "stateId": "aprobado_malamente"  // ❌ No existe
    }
  ]
}
```

**Solución:**
```json
{
  "views": [
    {
      "id": "tablero-pendientes",
      "kind": "tablero",
      "lifecycleId": "solicitud",
      "stateId": "aprobado"  // ✅ Existe en lifecycle.states[]
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:464-490`

---

### REF_ACTION_TRANSITION

**¿Qué significa?**
- Una acción referencia `lifecycleId` o `transitionId` que no existe.

**¿Por qué falla?**
- Asignaste una transición a una acción, pero esa transición no está en el lifecycle.
- Cambiaste nombre de transición sin actualizar acciones.

**Cómo arreglarlo:**
1. Busca la acción por ID.
2. Verifica `action.lifecycleId` existe en input.lifecycles.
3. Verifica `action.transitionId` existe en ese lifecycle.
4. Si no, lista transiciones válidas y actualiza acción.

**Ejemplo real:**
```json
{
  "actions": [
    {
      "id": "accion-aprobar",
      "lifecycleId": "solicitud",
      "transitionId": "pasar_a_revisado_typo"  // ❌ No existe
    }
  ]
}
```

**Solución:**
```json
{
  "actions": [
    {
      "id": "accion-aprobar",
      "lifecycleId": "solicitud",
      "transitionId": "pasar_a_revisado"  // ✅ Existe
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:512-527`

---

### REF_ROLE

**¿Qué significa?**
- Un elemento (vista, acción, módulo) referencia un `role` que no existe en el GeneratorInput.

**¿Por qué falla?**
- Typo en nombre del rol.
- Eliminaste rol de definición sin actualizar specs.
- Inventaste un rol que no está en `input.roles[]`.

**Cómo arreglarlo:**
1. Lee el rol inválido del error (ej: `revisor` ≠ `reviewer`).
2. En GeneratorInput, lista todos `input.roles[].id` válidos.
3. Corrige el typo o crea el rol faltante.
4. Regenera spec.

**Ejemplo real:**
```json
{
  "actions": [
    {
      "id": "accion-1",
      "visibleRoles": ["supervisor_typo"]  // ❌ No existe
    }
  ]
}
```

**Solución:**
```json
{
  "actions": [
    {
      "id": "accion-1",
      "visibleRoles": ["supervisor"]  // ✅ Existe en input.roles
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:529-537`

---

### REF_PROCESS_GROUP

**¿Qué significa?**
- Un `processGroup` referencia `lifecycleId`, `archetypeId`, o `viewIds[]` que no existen.

**¿Por qué falla?**
- Asignaste archetype/lifecycle que no está registrado.
- Archetype para dominio/secundario no coincide con composition.
- Referencia a vista inexistente.

**Cómo arreglarlo:**
1. Verifica `processGroup.lifecycleId` existe en input.lifecycles.
2. Si `role="dominant"`, verifica `archetypeId === composition.dominant`.
3. Si `role="secondary"`, verifica en `composition.secondaries[]`.
4. Verifica todas vistas en `processGroup.viewIds[]` existen.

**Ejemplo real:**
```json
{
  "processGroups": [
    {
      "id": "grupo-financiero",
      "lifecycleId": "credito_invalido",  // ❌ No existe
      "role": "dominant"
    }
  ]
}
```

**Solución:**
```json
{
  "processGroups": [
    {
      "id": "grupo-financiero",
      "lifecycleId": "credito",  // ✅ Existe
      "role": "dominant"
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:551-603`

---

### REF_PANEL

**¿Qué significa?**
- Un `processGroup` referencia un panel que no existe, o una vista que no es panel.
- Panel tipo `panel_bloqueo` referencia secundaria/señal no en composition.

**¿Por qué falla?**
- Asignaste vista ordinaria como panel.
- Referencia a `panel_bloqueo` pero secondaria no está configurada.
- Falta `panel_credito` sin financiera, `panel_agenda` sin capacidad_temporal.

**Cómo arreglarlo:**
1. Verifica que vista tiene `kind` que inicia con `panel_` (ej: `panel_bloqueo`, `panel_credito`).
2. Para `panel_bloqueo`, verifica `secondaryArchetypeId` y `bloquea` están en `composition.secondaries[]`.
3. Para `panel_credito`, verifica secundaria financiera en composition.
4. Para `panel_agenda`, verifica `input.resourceSubtypes` incluye `capacidad_temporal`.

**Ejemplo real:**
```json
{
  "processGroups": [
    {
      "panelIds": ["vista-1"]  // ❌ vista-1 es "tablero", no panel
    }
  ]
}
```

**Solución:**
```json
{
  "processGroups": [
    {
      "panelIds": ["panel-bloqueo-1"]  // ✅ Es panel_bloqueo
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:604-708`

---

### REF_INTERNAL

**¿Qué significa?**
- Una vista/acción/módulo/recorrido referencia un elemento que no existe internamente.
- Ej: vista referencia acción huérfana, recorrido referencia vista inexistente.

**¿Por qué falla?**
- Eliminaste acción/forma pero vistas/acciones aún la referencian.
- Typo en ID.
- Datos corruptos de persistencia.

**Cómo arreglarlo:**
1. Identifica qué tipo es huérfano (acción, forma, vista).
2. O crea el elemento faltante, o elimina la referencia.
3. Regenera si fue error de Generador.

**Ejemplo real:**
```json
{
  "views": [
    {
      "id": "vista-1",
      "actionIds": ["accion-inexistente"]  // ❌ No existe
    }
  ]
}
```

**Solución:**
```json
{
  "views": [
    {
      "id": "vista-1",
      "actionIds": ["accion-1"]  // ✅ Existe en actions[]
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:492-733`

---

### REF_DUPLICATE

**¿Qué significa?**
- Hay dos elementos con el mismo ID (ej: dos vistas con id="tablero-1").
- IDs deben ser únicos globalmente dentro de views/actions/forms/recorridos.

**¿Por qué falla?**
- Copypaste manual de specs sin cambiar IDs.
- Regenerador produjo duplicados (bug Generador).
- Merge de dos specs con IDs conflictivos.

**Cómo arreglarlo:**
1. Encuentra ambas ocurrencias del ID duplicado.
2. Cambia uno a nuevo ID único (ej: `tablero-1-v2`).
3. Busca referencias a ese ID y actualiza también.
4. Revalida.

**Ejemplo real:**
```json
{
  "views": [
    { "id": "tablero-1", "kind": "tablero" },
    { "id": "tablero-1", "kind": "panel_bloqueo" }  // ❌ Duplicado
  ]
}
```

**Solución:**
```json
{
  "views": [
    { "id": "tablero-1", "kind": "tablero" },
    { "id": "tablero-1-bloqueo", "kind": "panel_bloqueo" }  // ✅ Único
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:443-461`

---

### REF_ORPHAN_TRANSITIVE

**¿Qué significa?**
- Una referencia transitiva no existe (ej: acción → forma inexistente → campos).
- El elemento fantasma está profundamente anidado en dependencias.

**¿Por qué falla?**
- Eliminaste forma/vista pero acciones aún las referencian.
- Dependency chain está rota (A→B→C, pero C no existe).

**Cómo arreglarlo:**
1. Lee el error: qué elemento falta y quién lo referencia.
2. O crea el elemento faltante, o retira la referencia.
3. Prueba `buildDependencyGraph()` mentalmente para encontrar ruptura.

**Ejemplo real:**
```json
{
  "actions": [
    {
      "id": "accion-1",
      "formId": "forma-inexistente"  // ❌ Forma no existe
    }
  ]
}
```

**Solución:**
Crear la forma o eliminar la referencia:
```json
{
  "actions": [
    {
      "id": "accion-1",
      "formId": "forma-1"  // ✅ Existe
    }
  ],
  "forms": [
    { "id": "forma-1", "entityKind": "solicitud", "fields": [] }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:227-300`

---

## COHERENCIA (Fase 2: Lógica)

### COHERENCE_ROLE_ACTION

**¿Qué significa?**
- Una acción es visible a un rol que no tiene guardia/permiso en el ruleSet.
- El rol ve la acción pero no puede ejecutarla.

**¿Por qué falla?**
- Asignaste `visibleRoles: ["supervisor"]` pero no hay guardia para ese rol en transición.
- Generador no sincronizó roles con ruleSet.

**Cómo arreglarlo:**
1. Identifica acción y rol problemático.
2. Busca `transitionId` de la acción.
3. En `input.ruleSet.rules[]`, añade: `{ kind: "guard", transitionId: "...", action: "ejecutar", allowedRoles: ["supervisor"] }`
4. Revalida.

**Ejemplo real:**
```json
{
  "actions": [
    {
      "id": "accion-1",
      "transitionId": "pasar_a_revisado",
      "visibleRoles": ["supervisor"]  // ❌ Sin guardia
    }
  ]
}
```

**Input faltante:**
```ts
input.ruleSet.rules = [
  // Falta guardia para supervisor → pasar_a_revisado
];
```

**Solución:**
```ts
input.ruleSet.rules = [
  {
    kind: "guard",
    transitionId: "pasar_a_revisado",
    action: "ejecutar",
    allowedRoles: ["supervisor"]
  }
];
```

**Referencia de código:** `presentation/uispec-validator.ts:753-777`

---

### COHERENCE_UNKNOWN_TRANSITION

**¿Qué significa?**
- La transición asignada a una acción no está en el lifecycle esperado.
- Diferente a REF_ACTION_TRANSITION: aquí sí existe, pero no pertenece.

**¿Por qué falla?**
- Asignaste transición de otro lifecycle.
- Editaste JSON a mano y confundiste transiciones.

**Cómo arreglarlo:**
1. Verifica `action.transitionId` corresponde a `action.lifecycleId`.
2. Lista transiciones válidas del lifecycle.
3. Actualiza acción.

**Referencia de código:** `presentation/uispec-validator.ts:753-777`

---

### COHERENCE_MISSING_BLOCK

**¿Qué significa?**
- Para cada bloqueo (`composition.secondaries[]` con señal "bloquea"), debe existir `panel_bloqueo`.
- Falta el panel visual que muestre el bloqueo al usuario.

**¿Por qué falla?**
- Composition define bloqueos pero no hay paneles que los muestren.
- Eliminaste panel sin actualizar composition.

**Cómo arreglarlo:**
1. Para cada `{ secondaryArchetypeId: "X", bloquea: "Y" }` en composition.secondaries.
2. Crea vista tipo `panel_bloqueo` con `presentation: { secondaryArchetypeId: "X", bloquea: "Y" }`.
3. Añade panel a processGroup.panelIds.

**Ejemplo real:**
```json
{
  "composition": {
    "dominant": "solicitud",
    "secondaries": [
      { "secondaryArchetypeId": "aseguradora", "bloquea": "primas" }  // ❌ Falta panel
    ]
  },
  "views": []
}
```

**Solución:**
```json
{
  "views": [
    {
      "id": "panel-bloqueo-aseg",
      "kind": "panel_bloqueo",
      "presentation": {
        "secondaryArchetypeId": "aseguradora",
        "bloquea": "primas"
      }
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:780-796`

---

### COHERENCE_TERMINAL_REOPEN

**¿Qué significa?**
- Un `tablero` muestra una vista con estado terminal (ej: "rechazado", "finalizado").
- Pero tiene acciones que salen del terminal, reabriendo el proceso.

**¿Por qué falla?**
- Reapertura no controlada: usuario ve botón para cambiar de "rechazado" a "activo" sin verificación.
- Breach en control de flujo.

**Cómo arreglarlo:**
1. En el tablero terminal, no añadas acciones que transicionen fuera.
2. O convierte transición en solo-read (no ejecutable).
3. O crea estado transitorio (ej: "revisión_reapertura") antes de "activo".

**Ejemplo real:**
```json
{
  "views": [
    {
      "id": "tablero-final",
      "kind": "tablero",
      "stateId": "rechazado",  // Terminal
      "actionIds": ["accion-reapertura"]  // ❌ Sale del terminal
    }
  ]
}
```

**Solución:**
Remover acción o cambiar a estado no-terminal:
```json
{
  "views": [
    {
      "id": "tablero-final",
      "kind": "tablero",
      "stateId": "rechazado",
      "actionIds": []  // ✅ Sin acciones
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:799-818`

---

### COHERENCE_CONTENT_HASH_MISMATCH

**¿Qué significa?**
- El `contentHash` guardado no coincide con el calculado.
- Spec fue mutada después de generarse o corrupta en persistencia.

**¿Por qué falla?**
- Editaste spec a mano después de guardarla.
- Base de datos corrupta o deserialización errónea.
- Versionamiento de spec cambió pero hash no se recalculó.

**Cómo arreglarlo:**
1. Regenera spec desde cero: `generateUiSpec(input, generatorOptions)`.
2. O revalida con caché limpia: `validateUiSpecReport(raw, input, { cache: new ValidationCache() })`.

**Referencia de código:** `presentation/uispec-validator.ts:894-922`

---

### COHERENCE_UNPERMITTED_ROLE

**¿Qué significa?**
- Un rol ve una acción pero no tiene guardia en ruleSet para ejecutarla.
- Diferente a COHERENCE_ROLE_ACTION: más específico en permisos.

**¿Por qué falla?**
- Falta guardia/permiso para el rol en esa transición.

**Cómo arreglarlo:**
1. Identifica rol y transición.
2. Añade guardia en `input.ruleSet.rules[]`.

**Referencia de código:** `presentation/uispec-validator.ts:927-951`

---

### COHERENCE_ENTITY_FIELD_MISMATCH

**¿Qué significa?**
- Un formulario declara campo que no existe en entity schema.
- Ej: forma de "solicitud" incluye campo "edad" que no está en entity schema.

**¿Por qué falla?**
- Typo en nombre de campo.
- Entity schema no está registrada en ENTITY_SCHEMAS.
- Cambió schema de entity pero formularios no se actualizaron.

**Cómo arreglarlo:**
1. Lee el error: qué campo y qué entity.
2. En `ENTITY_SCHEMAS`, verifica que entity está registrada.
3. Lista campos válidos y corrige nombre en formulario.
4. O registra campo en entity schema.

**Ejemplo real:**
```json
{
  "forms": [
    {
      "id": "forma-solicitud",
      "entityKind": "solicitud",
      "fields": [
        { "name": "edad" }  // ❌ No existe en entity solicitud
      ]
    }
  ]
}
```

**Solución:**
```json
{
  "forms": [
    {
      "id": "forma-solicitud",
      "entityKind": "solicitud",
      "fields": [
        { "name": "fecha_nacimiento" }  // ✅ Existe en schema
      ]
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:843-882`

---

### COHERENCE_CYCLE_DETECTED

**¿Qué significa?**
- Un recorrido tiene ciclo: el mismo `viewId` aparece múltiples veces en steps.
- Ej: [vista1 → vista2 → vista1 → ...] infinito.

**¿Por qué falla?**
- Generador no detectó ciclo en composición de recorridos.
- Diseñador creó recorrido circular a propósito (error).

**Cómo arreglarlo:**
1. Lee steps del recorrido problemático.
2. Identifica vista que se repite.
3. Reordena steps para eliminar repetición.
4. Asegúrate que cada vista aparece máximo una vez.

**Ejemplo real:**
```json
{
  "recorridos": [
    {
      "id": "recorrido-1",
      "steps": ["vista-1", "vista-2", "vista-1"]  // ❌ Ciclo: vista-1 aparece 2x
    }
  ]
}
```

**Solución:**
```json
{
  "recorridos": [
    {
      "id": "recorrido-1",
      "steps": ["vista-1", "vista-2"]  // ✅ Sin ciclos
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:192-222`

---

## SEGURIDAD (Fase 2: Protección)

### SECURITY_SENSITIVE_FIELD

**¿Qué significa?**
- Un campo sensible (personal, fiscal) es visible a roles no autorizados.
- Ej: campo "RFC" es solo para admin, pero aparece a "cliente".

**¿Por qué falla?**
- Asignaste campo sensitivo a rol no permitido por DEFAULT_FIELD_RULES.
- Generador no filtró correctamente.

**Cómo arreglarlo:**
1. Identifica campo (ej: "RFC") y roles que lo ven.
2. En `DEFAULT_FIELD_RULES`, verifica clasificación del campo.
3. Revisa `allowedRoles` del campo.
4. Cambia visibleRoles de acción/forma para que no incluya roles no-permitidos.
5. O pide a DBA que whitelist el rol en DEFAULT_FIELD_RULES.

**Ejemplo real:**
```json
{
  "actions": [
    {
      "id": "accion-1",
      "visibleRoles": ["cliente"],  // ❌ Cliente no puede ver
      "evidenceFields": [
        { "name": "rfc" }  // RFC es solo fiscal/admin
      ]
    }
  ]
}
```

**Solución:**
```json
{
  "actions": [
    {
      "id": "accion-1",
      "visibleRoles": ["admin"],  // ✅ Admin sí puede ver
      "evidenceFields": [
        { "name": "rfc" }
      ]
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:1073-1089`, `filter/types.ts`

---

### SECURITY_PORTAL_FIELD

**¿Qué significa?**
- Un portal (portal_filtro) expone campo sensible que no está permitido a `cliente`.
- Portales son per-user (self-service), campos deben ser públicos.

**¿Por qué falla?**
- Portal referencia forma con campos fiscales/personales.
- Usuario cliente no debería ver RFC de otros.

**Cómo arreglarlo:**
1. Para portal, quita campos sensibles de forma.
2. Crea forma alternativa solo con campos públicos.
3. O rediseña portal para no incluir esos campos.

**Ejemplo real:**
```json
{
  "views": [
    {
      "id": "portal-mis-tramites",
      "kind": "portal_filtro",
      "formId": "forma-completa"  // ❌ Incluye RFC, DNI
    }
  ],
  "forms": [
    {
      "id": "forma-completa",
      "fields": ["nombre", "rfc", "dni"]  // RFC y DNI son personales
    }
  ]
}
```

**Solución:**
```json
{
  "views": [
    {
      "id": "portal-mis-tramites",
      "kind": "portal_filtro",
      "formId": "forma-portal"  // ✅ Solo campos públicos
    }
  ],
  "forms": [
    {
      "id": "forma-portal",
      "fields": ["nombre"]  // Solo nombre, sin datos personales
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:1092-1121`

---

### SECURITY_DESIGN_LITERAL

**¿Qué significa?**
- Valores de diseño (colores hex, tamaños px, fonts) están literales en spec.
- Deben estar en tokens de diseño del sistema, no hardcoded.

**¿Por qué falla?**
- Copypaste de CSS inline en strings.
- No se siguió metodología design tokens.

**Cómo arreglarlo:**
1. Extrae valores: `#FF0000`, `12px`, `"Arial"`.
2. Defínelos en styleTokenRefs o tema del sistema de diseño.
3. Reemplaza references: `{ token: "color-primary" }` en lugar de `#FF0000`.

**Ejemplo real:**
```json
{
  "content": {
    "etiqueta-1": {
      "title": "Tramite #FF0000 Urgente 12px Arial"  // ❌ Literales
    }
  }
}
```

**Solución:**
```json
{
  "content": {
    "etiqueta-1": {
      "title": "Tramite Urgente"  // ✅ Sin literales
    }
  },
  "styleTokenRefs": {
    "color-urgente": "#FF0000",
    "font-size-base": "12px",
    "font-family-ui": "Arial"
  }
}
```

**Referencia de código:** `presentation/uispec-validator.ts:1023-1067`, `generator/validate-ui.ts`

---

### SECURITY_INJECTION

**¿Qué significa?**
- Potencial inyección de código en campos de texto.
- Se detectaron caracteres o patrones que podrían ejecutarse.

**¿Por qué falla?**
- Campo contiene caracteres especiales, quotes sin escape, etc.

**Cómo arreglarlo:**
1. Sanitiza entrada: escapa quotes, remover caracteres especiales.
2. O usa system que auto-escape valores.

**Referencia de código:** `presentation/uispec-validator.ts:93-125`

---

### SECURITY_HTML_INJECTION

**¿Qué significa?**
- Contenido HTML/ejecutable detectado: script tags, event handlers, data URLs.
- OWASP risk: XSS, JavaScript injection.

**¿Por qué falla?**
- Campo contiene `<script>`, `onclick=`, `javascript:`, `data:text/html`.
- Peligro: si renderiza sin sanitizar, ejecuta código.

**Cómo arreglarlo:**
1. Identifica el campo problemático.
2. Remover: tags HTML (`<script>`, `<iframe>`), event handlers (`onclick=`, `onload=`), protocols (`javascript:`, `data:`).
3. Usa entity encoding si necesitas caracteres especiales: `&lt;` en lugar de `<`.

**Ejemplo real:**
```json
{
  "content": {
    "instrucciones": {
      "body": "Haz click <script>alert('xss')</script>"  // ❌ Script
    }
  }
}
```

**Solución:**
```json
{
  "content": {
    "instrucciones": {
      "body": "Haz click aqui para continuar"  // ✅ Sin HTML
    }
  }
}
```

**Referencia de código:** `presentation/uispec-validator.ts:93-125`, `957-975`

---

### SECURITY_PORTAL_SCOPE

**¿Qué significa?**
- Portal (portal_filtro) tiene scope != "propia", exponiendo datos globales.
- O es "global" (isGlobal=true) pero scope="propia", contradicción.

**¿Por qué falla?**
- Scope "global" o "compartida" expone datos de otros usuarios.
- Portal debe ser per-user: scope="propia", isGlobal=false.

**Cómo arreglarlo:**
1. Para portal, siempre: `scope: "propia"` y `isGlobal: false`.
2. Si necesitas global, no es un portal, es tablero.

**Ejemplo real:**
```json
{
  "views": [
    {
      "id": "portal-global",
      "kind": "portal_filtro",
      "presentation": {
        "scope": "global",  // ❌ Expone todo
        "isGlobal": true
      }
    }
  ]
}
```

**Solución:**
```json
{
  "views": [
    {
      "id": "portal-propia",
      "kind": "portal_filtro",
      "presentation": {
        "scope": "propia",  // ✅ Solo usuario actual
        "isGlobal": false
      }
    }
  ]
}
```

**Referencia de código:** `presentation/uispec-validator.ts:979-1021`

---

## Resumen Rápido: Matriz de Códigos

| Código | Severidad | Tipo | Solución Rápida |
|--------|-----------|------|-----------------|
| UNSUPPORTED_VERSION | critica | Schema | Actualiza Generador y regenera |
| SCHEMA | critica | Schema | Verifica estructura JSON vs esquema Zod |
| REF_VIEW_STATE | critica | Referencial | Lifecycle/state existe, coinciden |
| REF_ACTION_TRANSITION | critica | Referencial | Transición existe en lifecycle |
| REF_ROLE | critica | Referencial | Rol existe en input.roles[] |
| REF_PROCESS_GROUP | critica | Referencial | Lifecycle/archetype/view existen |
| REF_PANEL | critica | Referencial | Vista es tipo panel, en composition |
| REF_INTERNAL | critica | Referencial | Elemento referenciado existe |
| REF_DUPLICATE | critica | Referencial | Todos IDs únicos |
| REF_ORPHAN_TRANSITIVE | critica | Referencial | Cadena de dependencias completa |
| COHERENCE_ROLE_ACTION | media | Coherencia | Rol tiene guardia en ruleSet |
| COHERENCE_UNKNOWN_TRANSITION | media | Coherencia | Transición pertenece a lifecycle |
| COHERENCE_MISSING_BLOCK | media | Coherencia | Panel exists para cada bloqueo |
| COHERENCE_TERMINAL_REOPEN | media | Coherencia | Terminal sin acciones reapertura |
| COHERENCE_CONTENT_HASH_MISMATCH | media | Coherencia | Regenera o limpia caché |
| COHERENCE_UNPERMITTED_ROLE | critica | Coherencia | Añade guardia para rol |
| COHERENCE_ENTITY_FIELD_MISMATCH | critica | Coherencia | Campo existe en entity schema |
| COHERENCE_CYCLE_DETECTED | critica | Coherencia | Steps sin repeticiones |
| SECURITY_SENSITIVE_FIELD | critica | Seguridad | Campo solo para roles permitidos |
| SECURITY_PORTAL_FIELD | critica | Seguridad | Portal sin campos sensibles |
| SECURITY_DESIGN_LITERAL | media | Seguridad | Usa styleTokenRefs, no valores |
| SECURITY_INJECTION | critica | Seguridad | Sanitiza entrada |
| SECURITY_HTML_INJECTION | critica | Seguridad | Remover HTML/events/protocols |
| SECURITY_PORTAL_SCOPE | critica | Seguridad | scope="propia", isGlobal=false |

---

## Cómo Usar Esta Referencia

1. **Durante validación:** Si ves un error, busca el código aquí.
2. **Cómo arreglarlo:** Sigue los pasos paso a paso.
3. **Ejemplo real:** Compara tu spec con el ejemplo inválido.
4. **Testing:** Valida con `validateUiSpec(spec, input)` después de cambios.

## Integración Programática

```typescript
import { validateUiSpecReport, getValidatorMetrics } from "./presentation/uispec-validator";

const report = validateUiSpecReport(raw, input);
if (!report.ok) {
  for (const issue of report.issues) {
    console.error(`[${issue.code}] ${issue.path}: ${issue.message}`);
    if (issue.suggestion) console.log(`  → ${issue.suggestion}`);
  }
}

// Métricas
const metrics = getValidatorMetrics();
console.log(`Total validaciones: ${metrics.validationsAttempted}`);
console.log(`Hit rate: ${(metrics.cacheHitRate * 100).toFixed(2)}%`);
```

---

**Última actualización:** 2026-10-03 | **Versión:** 1.0.0
