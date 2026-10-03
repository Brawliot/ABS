# Guía Práctica: Solucionar Errores del Validador UiSpec

Pasos accionables y step-by-step para resolver cada categoría de errores. Diseñada para developers sin necesidad de leer el código.

---

## PASO 0: Antes de Empezar

### Verificar Setup Básico

```bash
# 1. Actualiza paquetes
npm install @abs/generator@latest

# 2. Verifica versions
npm ls | grep -E "@abs/(generator|presentation)"

# 3. Limpia caché de validación si es necesario
# (Solo si sospechas spec corrupta en memoria)
```

### Entender el Error

Cuando valides, obtendrás reporte:
```typescript
import { validateUiSpecReport } from "@abs/presentation";

const report = validateUiSpecReport(raw, input);
console.log(report.issues.map(i => ({
  code: i.code,
  path: i.path,
  message: i.message,
  suggestion: i.suggestion
})));
```

Cada issue tiene:
- **code:** Categoría (ej: SCHEMA, REF_INTERNAL)
- **path:** Dónde está (ej: views[0].actionIds)
- **message:** Qué pasó
- **suggestion:** Cómo arreglarlo
- **severity:** critica|media|baja

---

## Troubleshooting por Categoría

### A. ERRORES DE SCHEMA (Estructura Básica)

**Síntomas:** Todo falla, JSON no parsea.

#### Problema: "UNSUPPORTED_VERSION"

**Checklist:**
```
□ ¿Qué versión de Generador usaste?
  npm ls @abs/generator
  
□ ¿Coincide con versión de UiSpec?
  spec.version debe ser 1.0.0, 1.1.0 o 1.2.0
  
□ Si no, actualiza:
  npm install @abs/generator@latest
  npm run build
  
□ Regenera spec:
  const spec = generateUiSpec(input, options);
  
□ Revalida:
  const report = validateUiSpecReport(spec, input);
```

#### Problema: "SCHEMA" - JSON malformado

**Paso a paso:**

1. **Valida JSON:**
   ```bash
   cat spec.json | jq . > /dev/null
   # Si falla, hay error JSON
   ```

2. **Verifica estructura mínima:**
   ```json
   {
     "version": "1.0.0",
     "id": "spec-001",
     "views": [],
     "actions": [],
     "forms": [],
     "recorridos": [],
     "modules": [],
     "identity": { "brandName": "..." },
     "localization": [],
     "content": {},
     "styleTokenRefs": {}
   }
   ```

3. **Busca campos con tipo incorrecto:**
   ```typescript
   // ❌ Malo
   views: "[]"  // String en lugar de array
   
   // ✅ Bien
   views: []  // Array real
   ```

4. **Si vino de persistencia:**
   ```typescript
   import { parseAndValidateUiSpec } from "@abs/presentation";
   const spec = parseAndValidateUiSpec(jsonString, input);
   ```

---

### B. ERRORES REFERENCIALES (IDs Rotos)

**Síntomas:** Error dice "vista inexistente", "acción huérfana", etc.

#### Diagnóstico Rápido: Encontrar el Fantasma

```typescript
// Script para encontrar referencias rotas
function findBrokenRefs(spec) {
  const viewIds = new Set(spec.views.map(v => v.id));
  const actionIds = new Set(spec.actions.map(a => a.id));
  const formIds = new Set(spec.forms.map(f => f.id));
  
  const broken = [];
  
  // Buscar vistas sin acciones
  for (const view of spec.views) {
    for (const aid of view.actionIds) {
      if (!actionIds.has(aid)) {
        broken.push({
          type: "REF_INTERNAL",
          path: `views[${view.id}].actionIds`,
          ref: aid,
          fix: `Crear acción "${aid}" o cambiar referencia`
        });
      }
    }
  }
  
  return broken;
}
```

#### Problema: "REF_INTERNAL" - Acción/Forma/Vista Huérfana

**Opción 1: Crear Elemento Faltante**
```json
{
  "actions": [
    {
      "id": "accion-inexistente",
      "lifecycleId": "solicitud",
      "transitionId": "pasar_a_revisado",
      "visibleRoles": ["revisor"],
      "evidenceFields": []
    }
  ]
}
```

**Opción 2: Eliminar Referencia**
```json
{
  "views": [
    {
      "id": "vista-1",
      "actionIds": []  // Quitar IDs rotos
    }
  ]
}
```

#### Problema: "REF_DUPLICATE" - IDs Iguales

**Paso a paso:**

1. **Busca duplicados:**
   ```bash
   grep -o '"id":"[^"]*"' spec.json | sort | uniq -d
   ```

2. **Para cada duplicado, rename uno:**
   ```bash
   sed -i 's/"id":"tablero-1-viejo"/"id":"tablero-1-backup"/g' spec.json
   ```

3. **Busca referencias al ID antiguo y actualiza:**
   ```bash
   grep -n "tablero-1-viejo" spec.json
   # Cambiar manualmente referencias
   ```

4. **Verifica con:**
   ```typescript
   const report = validateUiSpecReport(spec, input);
   console.log(report.issues.filter(i => i.code === "REF_DUPLICATE"));
   ```

#### Problema: "REF_VIEW_STATE" - Estado Inexistente

**Diagnóstico:**

```typescript
// ¿Existe el lifecycle?
const lc = input.lifecycles.find(l => l.id === "solicitud");
if (!lc) {
  console.log("ERROR: Lifecycle no existe");
  return;
}

// ¿Existe el estado?
const state = lc.lifecycle.states.find(s => s.id === "aprobado");
if (!state) {
  console.log("Estados válidos:", lc.lifecycle.states.map(s => s.id));
  return;
}
```

**Arreglo:**

```json
{
  "views": [
    {
      "id": "tablero-1",
      "lifecycleId": "solicitud",
      "stateId": "aprobado"  // Verificar que existe
    }
  ]
}
```

#### Problema: "REF_ROLE" - Rol Inexistente

**Script de validación:**

```typescript
const validRoles = new Set();

// Roles definidos
input.roles.forEach(r => validRoles.add(r.id));

// Roles del ruleSet
input.ruleSet.roles?.forEach(r => validRoles.add(r.id));

// Rol "cliente" para autoservicio
if (input.channels.includes("autoservicio")) {
  validRoles.add("cliente");
}

console.log("Roles válidos:", [...validRoles]);

// Buscar en spec
for (const action of spec.actions) {
  for (const role of action.visibleRoles) {
    if (!validRoles.has(role)) {
      console.log(`❌ Rol inválido: ${role} en acción ${action.id}`);
    }
  }
}
```

**Arreglo:**
- Si typo: `"supervisor_typo"` → `"supervisor"`
- Si rol falta: Añade a `input.roles[]` o `input.ruleSet.roles[]`

#### Problema: "REF_ORPHAN_TRANSITIVE" - Cadena Rota

**Herramienta de debug:**

```typescript
function traceDependencies(spec, startId) {
  const graph = new Map();
  
  // Construir grafo
  const views = new Map(spec.views.map(v => [v.id, v]));
  const actions = new Map(spec.actions.map(a => [a.id, a]));
  const forms = new Map(spec.forms.map(f => [f.id, f]));
  
  // Rastrear desde startId
  function trace(id, path = []) {
    if (path.includes(id)) {
      console.log("CICLO:", path.concat(id).join(" → "));
      return;
    }
    
    const current = views.get(id) || actions.get(id) || forms.get(id);
    if (!current) {
      console.log("❌ Huérfano:", id, "en ruta:", path.join(" → "));
      return;
    }
    
    if (current.actionIds) {
      for (const aid of current.actionIds) {
        trace(aid, [...path, id]);
      }
    }
    if (current.formId) {
      trace(current.formId, [...path, id]);
    }
  }
  
  trace(startId);
}

traceDependencies(spec, "vista-1");
```

---

### C. ERRORES DE COHERENCIA (Lógica de Flujo)

**Síntomas:** Flujo inconsistente, permisos no-sinc, ciclos.

#### Problema: "COHERENCE_ROLE_ACTION" - Rol sin Guardia

**Checklist:**

```typescript
// 1. Identifica acción problemática
const action = spec.actions.find(a => a.id === "accion-1");

// 2. Obtén transición
console.log("Transición:", action.transitionId);

// 3. Busca guardias para esa transición
const guards = input.ruleSet.rules.filter(r =>
  r.kind === "guard" && 
  r.transitionId === action.transitionId
);

console.log("Guardias:", guards);

// 4. Compara con roles visibles
console.log("Roles en acción:", action.visibleRoles);
console.log("Roles con guardia:", guards.flatMap(g => g.allowedRoles));

// 5. Falta alguno?
```

**Arreglo:**

```typescript
// En tu GeneratorInput
input.ruleSet.rules.push({
  kind: "guard",
  transitionId: "pasar_a_revisado",
  action: "ejecutar",
  allowedRoles: ["supervisor"]  // Añade rol sin guardia
});

// Regenera y revalida
const spec = generateUiSpec(input, options);
const report = validateUiSpecReport(spec, input);
```

#### Problema: "COHERENCE_CYCLE_DETECTED" - Recorrido Circular

**Detección manual:**

```typescript
for (const recorrido of spec.recorridos) {
  const seen = new Set();
  for (const step of recorrido.steps) {
    if (seen.has(step)) {
      console.log(`❌ Ciclo en ${recorrido.id}: ${step} aparece 2x`);
      break;
    }
    seen.add(step);
  }
}
```

**Arreglo:**

```json
{
  "recorridos": [
    {
      "id": "recorrido-1",
      "steps": ["vista-1", "vista-2", "vista-3"]  // Único orden, sin repetición
    }
  ]
}
```

#### Problema: "COHERENCE_ENTITY_FIELD_MISMATCH" - Campo no en Entity

**Script:**

```typescript
import { ENTITY_SCHEMAS } from "@abs/presentation/uispec-schema";

for (const form of spec.forms) {
  const schema = ENTITY_SCHEMAS[form.entityKind];
  
  if (!schema) {
    console.log(`⚠️  Entity ${form.entityKind} desconocida`);
    continue;
  }
  
  for (const field of form.fields) {
    if (!schema.has(field.name)) {
      console.log(`❌ Campo ${field.name} no en entity ${form.entityKind}`);
      console.log(`   Campos válidos: ${[...schema].slice(0, 5).join(", ")}...`);
    }
  }
}
```

**Arreglo:**

```json
{
  "forms": [
    {
      "id": "forma-1",
      "entityKind": "solicitud",
      "fields": [
        { "name": "fecha_presentacion" }  // Verificar que existe
      ]
    }
  ]
}
```

---

### D. ERRORES DE SEGURIDAD (Protección)

**Síntomas:** Acceso no-autorizado, HTML malicioso.

#### Problema: "SECURITY_SENSITIVE_FIELD" - Datos Personales Expuestos

**Checklist:**

```typescript
import { DEFAULT_FIELD_RULES } from "@abs/filter/types";

for (const action of spec.actions) {
  for (const field of action.evidenceFields) {
    const rule = DEFAULT_FIELD_RULES.find(r => r.field === field.name);
    
    if (!rule) {
      console.log(`⚠️  Campo ${field.name} sin regla (asume público)`);
      continue;
    }
    
    if (rule.classification === "personal" || rule.classification === "fiscal") {
      // Verificar que todos los roles están permitidos
      for (const role of action.visibleRoles) {
        if (!rule.allowedRoles.includes(role)) {
          console.log(`❌ Rol ${role} no puede ver ${field.name}`);
          console.log(`   Roles permitidos: ${rule.allowedRoles.join(", ")}`);
        }
      }
    }
  }
}
```

**Arreglo:**

```json
{
  "actions": [
    {
      "id": "accion-1",
      "visibleRoles": ["admin"],  // Cambiar a rol permitido
      "evidenceFields": [{ "name": "rfc" }]
    }
  ]
}
```

#### Problema: "SECURITY_HTML_INJECTION" - Script/Event Detectado

**Buscar manualmente:**

```bash
grep -E '<script|onclick|javascript:|data:' spec.json | head -5
```

**Remover:**

```json
{
  "content": {
    "body": "Haz clic aquí"  // ✅ Sin HTML/eventos
  }
}
```

**Si necesitas HTML:**
```typescript
// Usar sistema de rendering seguro en lugar de raw HTML
import { sanitizeHtml } from "some-sanitizer";
const safe = sanitizeHtml(userContent);
```

#### Problema: "SECURITY_PORTAL_SCOPE" - Portal Scope Global

**Checklist:**

```typescript
for (const view of spec.views) {
  if (view.kind !== "portal_filtro") continue;
  
  const scope = view.presentation?.scope;
  const isGlobal = view.presentation?.isGlobal;
  
  if (scope !== "propia") {
    console.log(`❌ Portal ${view.id} scope="${scope}" (debe ser "propia")`);
  }
  
  if (isGlobal === true) {
    console.log(`❌ Portal ${view.id} isGlobal=true (debe ser false)`);
  }
}
```

**Arreglo:**

```json
{
  "views": [
    {
      "id": "portal-1",
      "kind": "portal_filtro",
      "presentation": {
        "scope": "propia",      // ✅ Solo datos del usuario
        "isGlobal": false       // ✅ No global
      }
    }
  ]
}
```

---

## Checklist de Validación Completa

Usa esto antes de "ir a producción":

```typescript
import {
  validateUiSpecReport,
  getValidatorMetrics,
  resetValidatorObservability
} from "@abs/presentation";

// 1. Reset métricas (si es fresh test)
resetValidatorObservability();

// 2. Valida spec
const report = validateUiSpecReport(raw, input);

// 3. Agrupa por severity
const critical = report.issues.filter(i => i.severity === "critica");
const warnings = report.issues.filter(i => i.severity === "media");
const info = report.issues.filter(i => i.severity === "baja");

console.log(`CRÍTICA: ${critical.length}, MEDIA: ${warnings.length}, BAJA: ${info.length}`);

if (!report.ok) {
  console.log("\n❌ VALIDATION FAILED\n");
  
  for (const issue of critical) {
    console.log(`[${issue.code}] ${issue.path}`);
    console.log(`  → ${issue.message}`);
    if (issue.suggestion) console.log(`  FIX: ${issue.suggestion}`);
    console.log();
  }
  
  process.exit(1);
}

console.log("✅ VALIDATION PASSED");

// 4. Revisa métricas
const metrics = getValidatorMetrics();
console.log(`Performance: ${metrics.avgValidationTimeMs.toFixed(2)}ms avg`);
console.log(`Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
```

---

## Decisión Rápida: ¿Cuál es Mi Error?

```
┌─ ¿Valida JSON?
│  ├─ NO → SCHEMA error: verifica sintaxis JSON
│  └─ SÍ → Continúa
│
├─ ¿IDs referencian a cosas que existen?
│  ├─ NO → REF_* error: crear elemento o eliminar ref
│  └─ SÍ → Continúa
│
├─ ¿La lógica de flujo tiene sentido?
│  ├─ NO → COHERENCE_* error: permisos/ciclos/estados
│  └─ SÍ → Continúa
│
└─ ¿Hay riesgo de seguridad?
   ├─ SÍ → SECURITY_* error: datos sensibles, HTML, scope
   └─ NO → ✅ VALIDATION PASSED
```

---

## CLI: Validar desde Línea de Comandos

```bash
# Opción 1: Script Node
cat spec.json | node -e '
const { validateUiSpecReport } = require("./dist/presentation/uispec-validator.js");
const input = JSON.parse(require("fs").readFileSync("input.json"));
const spec = JSON.parse(require("fs").readFileSync(0));
const report = validateUiSpecReport(spec, input);
if (!report.ok) {
  report.issues.forEach(i => console.log(`[${i.code}] ${i.path}: ${i.message}`));
  process.exit(1);
}
console.log("✅ Valid");
'

# Opción 2: Test Vitest
npm run test -- --grep "uispec-validator" --reporter=verbose
```

---

## Performance Tuning

Si validación es lenta:

```typescript
import { ValidationCache } from "@abs/presentation";

// 1. Usa caché persistente
const cache = new ValidationCache(5000);  // Máximo 5000 specs

// 2. Reutiliza cache entre validaciones
const report1 = validateUiSpecReport(spec, input, { cache });
const report2 = validateUiSpecReport(spec, input, { cache });  // Será rápido (cache hit)

// 3. Monitorea
const metrics = getValidatorMetrics();
console.log(`Hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
console.log(`Avg time: ${metrics.avgValidationTimeMs.toFixed(2)}ms`);
```

---

**Última actualización:** 2026-10-03 | **Versión:** 1.0.0 | **Contacto:** @abs/validator
