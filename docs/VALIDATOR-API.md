# Referencia de API del Validador UiSpec

Documentación exhaustiva de funciones, tipos, y cómo usarlas en código.

---

## Resumen Ejecutivo

| Función | Propósito | Devuelve |
|---------|-----------|----------|
| `validateUiSpec()` | Valida y sella, lanza si falla | `ValidatedUiSpec` |
| `validateUiSpecReport()` | Valida devuelve reporte (no lanza) | `UiSpecValidationReport` |
| `parseAndValidateUiSpec()` | Carga JSON y valida | `ValidatedUiSpec` |
| `serializeValidatedUiSpec()` | Serializa a JSON seguro | `string` (JSON) |
| `getValidatorMetrics()` | Telemetría en tiempo real | Métricas object |
| `exportValidatorMetricsJson()` | Metrics para ELK/Prometheus | JSON string |
| `exportValidatorMetricsCsv()` | Metrics para Grafana/Splunk | CSV string |
| `getValidatorLogs()` | Logs por nivel | Array de logs |
| `resetValidatorObservability()` | Limpia métricas (tests) | void |

---

## Funciones Principales

### `validateUiSpec(raw, input, options?): ValidatedUiSpec`

**Propósito:** Valida UiSpec contra GeneratorInput. Lanza error si no es válida.

**Parámetros:**
```typescript
raw: unknown                          // JSON parseable como UiSpec
input: GeneratorInput                 // Contexto: roles, lifecycles, etc.
options?: {
  readonly validatedAt?: string       // ISO timestamp (default: now)
}
```

**Retorna:**
```typescript
ValidatedUiSpec  // UiSpec + sello interno de validación
```

**Lanza:**
```typescript
UiSpecValidationError  // Si hay issues
{
  message: string          // Mensaje de error
  issues: UiSpecValidationIssue[]
  report: UiSpecValidationReport
}
```

**Ejemplo Básico:**
```typescript
import { validateUiSpec } from "@abs/presentation";

const raw = JSON.parse(specJson);
const input = buildConcesionariaGeneratorInput({ /* ... */ });

try {
  const validated = validateUiSpec(raw, input);
  console.log("✅ Spec válida, lista para renderizar");
  // Usar validated.views, validated.actions, etc.
} catch (err) {
  if (err instanceof UiSpecValidationError) {
    console.error("❌ Errores encontrados:");
    err.issues.forEach(i => {
      console.log(`  [${i.code}] ${i.path}: ${i.message}`);
    });
  }
}
```

**Ejemplo con Timestamp Custom:**
```typescript
const validated = validateUiSpec(raw, input, {
  validatedAt: "2026-10-03T14:30:00Z"
});
console.log(validated.validatedAt);  // "2026-10-03T14:30:00Z"
```

**Cuándo Usar:**
- Cuando necesitas garantía de validez (lanza si falla).
- Al inicio de pipeline de rendering.
- En tests donde quieres fallar rápido.

---

### `validateUiSpecReport(raw, input, options?): UiSpecValidationReport`

**Propósito:** Valida sin lanzar. Devuelve reporte completo.

**Parámetros:**
```typescript
raw: unknown
input: GeneratorInput
options?: {
  readonly validatedAt?: string
  readonly cache?: ValidationCache  // Cache custom (default: global)
}
```

**Retorna:**
```typescript
UiSpecValidationReport {
  ok: boolean                       // Pasó validación?
  issues: UiSpecValidationIssue[]   // Lista de errores
  validatedAt: string               // Cuándo se validó
  schemaVersion: string             // Versión de spec
}
```

**Ejemplo: Análisis Detallado:**
```typescript
import { validateUiSpecReport, ValidationCache } from "@abs/presentation";

// Cache específico para batch
const cache = new ValidationCache(100);

const report = validateUiSpecReport(raw, input, { cache });

if (report.ok) {
  console.log("✅ Spec válida");
} else {
  // Agrupar por severidad
  const critical = report.issues.filter(i => i.severity === "critica");
  const warnings = report.issues.filter(i => i.severity === "media");
  
  console.log(`Crítica: ${critical.length}, Advertencias: ${warnings.length}`);
  
  // Procesar por tipo
  for (const code of ["SECURITY_INJECTION", "COHERENCE_CYCLE_DETECTED"]) {
    const matching = report.issues.filter(i => i.code === code);
    if (matching.length > 0) {
      console.log(`${code}: ${matching.length} issues`);
      for (const issue of matching) {
        console.log(`  ${issue.path}: ${issue.message}`);
      }
    }
  }
  
  // Cache stats
  console.log(`Cache size: ${cache.size()}`);
}
```

**Cuándo Usar:**
- Cuando necesitas procesar todos los errores.
- Dashboard/reportes que no deben crashear.
- Batch processing con reporte final.
- Integración con logging/monitoring.

---

### `parseAndValidateUiSpec(json, input): ValidatedUiSpec`

**Propósito:** Carga desde JSON/persistencia y valida en un paso.

**Parámetros:**
```typescript
json: string       // JSON válido
input: GeneratorInput
```

**Retorna:**
```typescript
ValidatedUiSpec
```

**Lanza:**
```typescript
UiSpecValidationError
{
  message: string
  issues: [{ code: "SCHEMA", message: "JSON inválido: ..." }]
}
```

**Ejemplo: Cargar desde Base de Datos:**
```typescript
import { parseAndValidateUiSpec } from "@abs/presentation";

async function loadSpecFromDb(specId: string) {
  // 1. Obtén JSON de DB
  const specJson = await db.specs.findOne({ id: specId });
  
  if (!specJson) {
    console.error("Spec no encontrada");
    return null;
  }
  
  // 2. Valida inmediatamente
  try {
    const validated = parseAndValidateUiSpec(specJson.content, input);
    console.log("✅ Spec cargada y validada");
    return validated;
  } catch (err) {
    console.error("❌ Spec corrupta:", err.issues);
    // Alertar: spec necesita regeneración
    await db.specs.updateOne(
      { id: specId },
      { $set: { corrupted: true } }
    );
    return null;
  }
}
```

**Cuándo Usar:**
- Cargar specs previamente guardadas.
- Procesos que cargan y validan en cadena.
- Cuando quieres detectar corrupción de DB.

---

### `serializeValidatedUiSpec(spec): string`

**Propósito:** Convierte ValidatedUiSpec a JSON para guardar.

**Parámetros:**
```typescript
spec: ValidatedUiSpec  // Debe ser validada (tiene sello interno)
```

**Retorna:**
```typescript
string  // JSON válido
```

**Lanza:**
```typescript
UiSpecValidationError  // Si spec no fue validada
{
  code: "NOT_VALIDATED"
  message: "No se puede persistir una UiSpec sin validar"
}
```

**Ejemplo: Pipeline Completo Validación → Persistencia:**
```typescript
import {
  validateUiSpec,
  serializeValidatedUiSpec,
  parseAndValidateUiSpec
} from "@abs/presentation";

// Paso 1: Generar y validar
const raw = generateUiSpec(input, options);
const validated = validateUiSpec(raw, input);

// Paso 2: Guardar
const json = serializeValidatedUiSpec(validated);
await db.specs.insertOne({
  id: validated.id,
  content: json,
  savedAt: new Date().toISOString()
});

console.log("✅ Spec guardada (validada)");

// Paso 3: Más tarde, cargar
const loaded = parseAndValidateUiSpec(json, input);
// Al cargar, se revalida automáticamente
console.log("✅ Spec cargada (revalidada)");
```

**Cuándo Usar:**
- Pipeline estándar: generar → validar → guardar.
- Nunca guardes specs no-validadas.
- El sello interno previene accidental serialization.

---

## Tipos de Datos

### `UiSpecValidationReport`

```typescript
interface UiSpecValidationReport {
  readonly ok: boolean                    // true si no hay issues
  readonly issues: UiSpecValidationIssue[]
  readonly validatedAt: string            // ISO 8601 timestamp
  readonly schemaVersion: string          // Ej: "1.0.0"
}
```

**Ejemplo de Uso:**
```typescript
const report = validateUiSpecReport(raw, input);

if (report.ok) {
  console.log(`Spec v${report.schemaVersion} validada a ${report.validatedAt}`);
} else {
  console.log(`${report.issues.length} errores encontrados`);
}
```

---

### `UiSpecValidationIssue`

```typescript
interface UiSpecValidationIssue {
  readonly code: UiSpecValidationCode           // Categoría (ej: SCHEMA, REF_INTERNAL)
  readonly path: string                         // Ruta JSON (ej: views[0].actionIds)
  readonly message: string                      // Descripción en español
  readonly suggestion?: string                  // Cómo arreglarlo
  readonly affectedIds?: readonly string[]      // IDs relacionados
  readonly severity?: ValidationSeverity        // "critica" | "media" | "baja"
}
```

**Ejemplo de Iteración:**
```typescript
report.issues.forEach(issue => {
  const icon = {
    critica: "🔴",
    media: "🟡",
    baja: "🟢"
  }[issue.severity || "media"];
  
  console.log(`${icon} [${issue.code}]`);
  console.log(`   Ubicación: ${issue.path}`);
  console.log(`   Error: ${issue.message}`);
  
  if (issue.suggestion) {
    console.log(`   ✓ Solución: ${issue.suggestion}`);
  }
  
  if (issue.affectedIds?.length) {
    console.log(`   IDs: ${issue.affectedIds.join(", ")}`);
  }
});
```

---

### `ValidatedUiSpec`

```typescript
// Idéntica a UiSpec pero con sello interno
// (No visible en TypeScript, es Symbol privado)
interface ValidatedUiSpec extends UiSpec {
  // __VALIDATED_UISPEC_SEAL__ (símbolo privado)
}
```

**Diferencia con UiSpec:**
```typescript
const raw: UiSpec = { /* ... */ };  // Sin validar

const validated: ValidatedUiSpec = validateUiSpec(raw, input);
// Ahora tiene sello que prueba validación

serializeValidatedUiSpec(validated);  // ✅ OK
serializeValidatedUiSpec(raw);        // ❌ Error: "NOT_VALIDATED"
```

---

### `UiSpecValidationCode`

Enumeración de todos los códigos de error:

```typescript
type UiSpecValidationCode =
  // Schema (Fase 1)
  | "UNSUPPORTED_VERSION"
  | "SCHEMA"
  
  // Referencial (Fase 1)
  | "REF_VIEW_STATE"
  | "REF_ACTION_TRANSITION"
  | "REF_ROLE"
  | "REF_PROCESS_GROUP"
  | "REF_PANEL"
  | "REF_INTERNAL"
  | "REF_DUPLICATE"
  | "REF_ORPHAN_TRANSITIVE"
  
  // Coherencia (Fase 2)
  | "COHERENCE_ROLE_ACTION"
  | "COHERENCE_UNKNOWN_TRANSITION"
  | "COHERENCE_MISSING_BLOCK"
  | "COHERENCE_TERMINAL_REOPEN"
  | "COHERENCE_CONTENT_HASH_MISMATCH"
  | "COHERENCE_UNPERMITTED_ROLE"
  | "COHERENCE_ENTITY_FIELD_MISMATCH"
  | "COHERENCE_CYCLE_DETECTED"
  
  // Seguridad (Fase 2)
  | "SECURITY_SENSITIVE_FIELD"
  | "SECURITY_PORTAL_FIELD"
  | "SECURITY_DESIGN_LITERAL"
  | "SECURITY_INJECTION"
  | "SECURITY_HTML_INJECTION"
  | "SECURITY_PORTAL_SCOPE"
  
  | "NOT_VALIDATED";
```

**Referencia:** Ver `docs/VALIDATOR-ERROR-CODES.md` para descripción completa.

---

## Telemetría y Observability

### `getValidatorMetrics(): object`

**Propósito:** Obtén métricas de validaciones en tiempo real.

**Retorna:**
```typescript
{
  validationsAttempted: number       // Total specs validadas
  validationsPassed: number          // Specs válidas
  validationsFailed: number          // Specs inválidas
  cacheHits: number                  // Validaciones desde caché
  cacheMisses: number                // Validaciones completas
  cacheHitRate: number               // 0.0-1.0 (hits / attempted)
  avgValidationTimeMs: number        // Tiempo promedio
  criticalIssuesByCode: Record<string, number>  // Contadores por código
}
```

**Ejemplo:**
```typescript
import { getValidatorMetrics } from "@abs/presentation";

// Después de varias validaciones
const metrics = getValidatorMetrics();

console.log(`
Intentos: ${metrics.validationsAttempted}
Pasaron: ${metrics.validationsPassed}
Fallaron: ${metrics.validationsFailed}
Hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%
Tiempo promedio: ${metrics.avgValidationTimeMs.toFixed(2)}ms
`);

// Problemas críticos por tipo
for (const [code, count] of Object.entries(metrics.criticalIssuesByCode)) {
  console.log(`  ${code}: ${count}`);
}
```

---

### `exportValidatorMetricsJson(): string`

**Propósito:** Exporta métricas en JSON (integrable con ELK, Prometheus).

**Retorna:**
```typescript
string  // JSON con timestamp y métricas
```

**Formato:**
```json
{
  "timestamp": "2026-10-03T14:30:45.123Z",
  "validationsAttempted": 523,
  "validationsPassed": 515,
  "validationsFailed": 8,
  "cacheHits": 312,
  "cacheMisses": 211,
  "cacheHitRate": 0.5966...,
  "avgValidationTimeMs": 3.45,
  "criticalIssuesByCode": {
    "SECURITY_HTML_INJECTION": 2,
    "COHERENCE_CYCLE_DETECTED": 1
  }
}
```

**Ejemplo: Enviar a Prometheus:**
```typescript
import { exportValidatorMetricsJson } from "@abs/presentation";

async function pushMetrics() {
  const metrics = exportValidatorMetricsJson();
  const json = JSON.parse(metrics);
  
  // Enviar a servicio de monitoreo
  await fetch("http://prometheus:9090/metrics", {
    method: "POST",
    body: JSON.stringify({
      job: "validator",
      instance: "abs-prod",
      data: json
    })
  });
}
```

---

### `exportValidatorMetricsCsv(): string`

**Propósito:** Exporta métricas en CSV (integrable con Grafana, Splunk).

**Retorna:**
```typescript
string  // CSV con timestamp, metric_name, value
```

**Formato:**
```csv
timestamp,metric_name,value
2026-10-03T14:30:45.123Z,validations_attempted,523
2026-10-03T14:30:45.123Z,validations_passed,515
2026-10-03T14:30:45.123Z,validations_failed,8
2026-10-03T14:30:45.123Z,cache_hits,312
2026-10-03T14:30:45.123Z,cache_misses,211
2026-10-03T14:30:45.123Z,cache_hit_rate,0.5966
2026-10-03T14:30:45.123Z,avg_validation_time_ms,3.45
2026-10-03T14:30:45.123Z,critical_issues_SECURITY_HTML_INJECTION,2
2026-10-03T14:30:45.123Z,critical_issues_COHERENCE_CYCLE_DETECTED,1
```

**Ejemplo: Guardar a Archivo:**
```typescript
import { exportValidatorMetricsCsv } from "@abs/presentation";
import { writeFileSync } from "fs";

const csv = exportValidatorMetricsCsv();
writeFileSync(`metrics-${Date.now()}.csv`, csv);
```

---

### `getValidatorLogs(level?): Array`

**Propósito:** Obtén logs del validador por nivel.

**Parámetros:**
```typescript
level?: "debug" | "info" | "warn" | "error"  // Opcional: filtrar
```

**Retorna:**
```typescript
Array<{
  level: string         // "debug", "info", "warn", "error"
  msg: string
  timestamp: string     // ISO 8601
}>
```

**Ejemplo:**
```typescript
import { getValidatorLogs } from "@abs/presentation";

// Todos los logs
const allLogs = getValidatorLogs();

// Solo errores
const errors = getValidatorLogs("error");
console.log("Errores recientes:", errors);

// Últimos N logs
const recent = getValidatorLogs().slice(-10);
```

---

### `resetValidatorObservability(): void`

**Propósito:** Limpia métricas y logs (útil para benchmarks/tests).

**Ejemplo:**
```typescript
import {
  validateUiSpecReport,
  getValidatorMetrics,
  resetValidatorObservability
} from "@abs/presentation";

// Benchmark
resetValidatorObservability();

for (let i = 0; i < 100; i++) {
  validateUiSpecReport(specs[i], input);
}

const metrics = getValidatorMetrics();
console.log(`Promedio: ${metrics.avgValidationTimeMs.toFixed(2)}ms`);
```

---

## Cache Personalizado

### `ValidationCache` class

**Propósito:** LRU cache para evitar re-validar specs idénticas.

**Constructor:**
```typescript
const cache = new ValidationCache(maxSize = 1000);
```

**Métodos:**
```typescript
cache.get(contentHash: string): UiSpecValidationReport | undefined
cache.set(contentHash: string, report: UiSpecValidationReport): void
cache.size(): number
cache.clear(): void
```

**Ejemplo: Cache Custom:**
```typescript
import { ValidationCache, validateUiSpecReport } from "@abs/presentation";

// Cache pequeño para tests
const testCache = new ValidationCache(10);

const report1 = validateUiSpecReport(spec, input, { cache: testCache });
const report2 = validateUiSpecReport(spec, input, { cache: testCache });

// report2 viene del caché (más rápido)
```

---

## Casos de Uso Comunes

### 1. Pipeline Generador → Validador → Renderer

```typescript
import {
  generateUiSpec,
  validateUiSpec,
  serializeValidatedUiSpec
} from "@abs/presentation";

async function generateAndPersist(input: GeneratorInput) {
  // 1. Generar
  const raw = generateUiSpec(input, { verbose: false });
  
  // 2. Validar (lanza si falla)
  const validated = validateUiSpec(raw, input);
  
  // 3. Guardar
  const json = serializeValidatedUiSpec(validated);
  await db.specs.insertOne({
    id: validated.id,
    content: json
  });
  
  console.log("✅ Spec generada, validada y guardada");
}
```

### 2. Cargar desde Persistencia

```typescript
import { parseAndValidateUiSpec } from "@abs/presentation";

async function loadAndRender(specId: string) {
  // 1. Cargar JSON
  const doc = await db.specs.findOne({ id: specId });
  
  // 2. Validar y revalidar
  const validated = parseAndValidateUiSpec(doc.content, input);
  
  // 3. Renderizar con garantía de validez
  return renderToHtml(validated);
}
```

### 3. Validación con Reporte Detallado

```typescript
import { validateUiSpecReport } from "@abs/presentation";

async function validateBatch(specs: unknown[]) {
  const results = [];
  
  for (const raw of specs) {
    const report = validateUiSpecReport(raw, input);
    results.push({
      ok: report.ok,
      issueCount: report.issues.length,
      issues: report.issues
    });
  }
  
  return results;
}
```

### 4. Monitoreo en Producción

```typescript
import {
  validateUiSpecReport,
  exportValidatorMetricsJson,
  getValidatorLogs
} from "@abs/presentation";

async function monitoringRoutine() {
  // Cada 1 minuto
  setInterval(async () => {
    // 1. Obtén métricas
    const metricsJson = exportValidatorMetricsJson();
    
    // 2. Envía a monitoring
    await fetch("http://metrics.internal/push", {
      method: "POST",
      body: metricsJson
    });
    
    // 3. Si hay errores, alertar
    const errorLogs = getValidatorLogs("error");
    if (errorLogs.length > 0) {
      await alertSlack(`Validador errors: ${errorLogs.length}`);
    }
  }, 60000);
}
```

---

## Errors y Excepciones

### `UiSpecValidationError` class

```typescript
class UiSpecValidationError extends Error {
  readonly issues: readonly UiSpecValidationIssue[]
  readonly report: UiSpecValidationReport
}
```

**Cómo Capturar:**
```typescript
import { validateUiSpec, UiSpecValidationError } from "@abs/presentation";

try {
  const validated = validateUiSpec(raw, input);
} catch (err) {
  if (err instanceof UiSpecValidationError) {
    console.log("Validación fallida:");
    console.log(err.report);  // Reporte completo
    console.log(err.issues);  // Array de issues
  } else {
    throw err;  // Error inesperado
  }
}
```

---

## Performance Tips

### 1. Usa Cache para Specs Idénticas

```typescript
import { ValidationCache, validateUiSpecReport } from "@abs/presentation";

const cache = new ValidationCache(5000);

// Primera validación: completa
validateUiSpecReport(spec, input, { cache });

// Segunda validación del mismo spec: desde caché (< 1ms)
validateUiSpecReport(spec, input, { cache });
```

### 2. Batch Processing

```typescript
for (const spec of specs) {
  const report = validateUiSpecReport(spec, input);
  
  if (!report.ok) {
    console.log(`Spec ${spec.id} failed with ${report.issues.length} issues`);
  }
}

// No lanza excepciones, continúa procesando
```

### 3. Monitorea Métricas

```typescript
const metrics = getValidatorMetrics();

if (metrics.avgValidationTimeMs > 10) {
  console.warn("Validador lento: > 10ms promedio");
}

if (metrics.cacheHitRate < 0.5) {
  console.warn("Cache ineficiente: < 50% hit rate");
}
```

---

## Importes Comunes

```typescript
// Funciones principales
import {
  validateUiSpec,
  validateUiSpecReport,
  parseAndValidateUiSpec,
  serializeValidatedUiSpec
} from "@abs/presentation";

// Telemetría
import {
  getValidatorMetrics,
  exportValidatorMetricsJson,
  exportValidatorMetricsCsv,
  getValidatorLogs,
  resetValidatorObservability
} from "@abs/presentation";

// Tipos
import type {
  UiSpecValidationReport,
  UiSpecValidationIssue,
  UiSpecValidationCode,
  ValidatedUiSpec
} from "@abs/presentation";

// Cache y errores
import {
  ValidationCache,
  UiSpecValidationError
} from "@abs/presentation";
```

---

**Última actualización:** 2026-10-03 | **Versión:** 1.0.0 | **API Stability:** STABLE
