# Infraestructura LLM — informe

## Proveedor elegido

**OpenAI** (`gpt-4o-mini` por defecto) vía Chat Completions + `response_format.json_schema`.

Alternativa siempre disponible: **HeuristicLlmAdapter** (determinista, sin red) — usada por defecto en CI y como `failureMode: "heuristic"`.

Cassettes: **CassetteLlmAdapter** (`record` / `replay`) para pruebas del camino LLM sin proveedor.

## Configuración

| Variable | Valores | Efecto |
|----------|---------|--------|
| `ABS_LLM_PROVIDER` | `heuristic` (default), `openai`, `cassette` | Elige adaptador base |
| `OPENAI_API_KEY` | string | Obligatorio si provider=`openai` |
| `ABS_LLM_MODEL` | p.ej. `gpt-4o-mini` | Modelo OpenAI |
| `ABS_LLM_MODE` | `live` (default), `record`, `replay` | Cassettes alrededor del adaptador |
| `ABS_LLM_CASSETTE_DIR` | path | Directorio de cassettes (default `tmp/llm-cassettes`) |

```ts
import { createLlmClientFromEnv, LlmClient, HeuristicLlmAdapter } from "./llm/index.js";

// Producción / demo con clave:
// ABS_LLM_PROVIDER=openai OPENAI_API_KEY=sk-... 

// Suite / CI (determinista):
const client = new LlmClient({ adapter: new HeuristicLlmAdapter() });
```

**Garantía de suite:** `createLlmClientFromEnv()` usa heurístico salvo `ABS_LLM_PROVIDER=openai`. Las pruebas nuevas inyectan adaptadores; no hay llamadas reales en `npm test`.

## Contrato de seguridad

1. Toda respuesta pasa por **Zod** (`parseAndValidate`). Sin validar → no se usa.
2. Fallo de esquema → **1 reintento**; si sigue mal → `failureMode` (`heuristic` | `ask_clarification` | `noop`). **Nunca inventar.**
3. Confianza &lt; umbral del componente → `ask_clarification` (no actuar).
4. Ninguna salida LLM ejecuta transiciones: los componentes (posterior) alimentan Intérprete → Juez.

## Datos enviados por tipo de llamada (RGPD)

Tras `minimizePayload` / `minimizeText` (email, teléfono, DNI/NIE, IBAN, tarjeta, nombres heurísticos; ids → `subject:…` / `parte:…`).

| callKind | Componente | Se envía (minimizado) | No se envía |
|----------|------------|----------------------|-------------|
| `interpreter.extract_intent` | Intérprete | Texto de intención con refs; transitionIds; flags | Nombre, email, tel, DNI, IBAN, binarios |
| `consultant.extract_query` | Consultor | Pregunta con refs; ids de catálogo | PII de Parte |
| `redactor.propose_copy` | Redactor | Ids UI, tono/locale, claves de error | Datos de clientes, chats con PII |
| `designer.propose_tokens` | Diseñador | Descripción de negocio, brandName | Empleados/clientes, fotos personales |
| `diagnosis.extract_answers` | Diagnóstico | Descripción operativa del negocio | Clientes nombrados, contactos |

Detalle en código: `llm/call-kinds.ts` (`CALL_KIND_PRIVACY`).

## Coste estimado por llamada

Fórmula en `llm/cost.ts` (USD, precios orientativos / 1M tokens):

| Modelo | Input | Output | Ejemplo ~400+100 tokens |
|--------|-------|--------|-------------------------|
| `gpt-4o-mini` | $0.15 | $0.60 | ≈ **$0.00012** |
| `gpt-4o` | $2.50 | $10.00 | ≈ **$0.002** |
| heuristic / cassette | $0 | $0 | **$0** |

El log (`LlmCallLogEntry`) guarda `estimatedCostUsd`, tokens, modelo/versión, duración y resultado de validación — **sin** texto de usuario ni PII (solo `userContentHash`).

## Umbrales de confianza por defecto

| Componente | Umbral |
|------------|--------|
| interpreter | 0.70 |
| consultant | 0.70 |
| redactor | 0.60 |
| designer | 0.55 |
| diagnosis | 0.75 |

## Pruebas

`tests/llm.infra.test.ts`: esquema, reintento, fallo proveedor, timeout, mal formado, umbral, minimización, cassettes, inventario `llm` built.

## Archivos

- `llm/*` — infra
- `adapters/index.ts` — export + inventario
- `llm/LLM-INFRA-REPORT.md` — este informe
