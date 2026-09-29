# Guía de etiquetado — corpus Intérprete

## Objetivo

Etiquetar mensajes de negocio (anonimizados) para medir si el Intérprete:

1. Elige la **transición** correcta entre las permitidas, o
2. **Pregunta** cuando hay ambigüedad / faltan datos (nunca supone).

## Formato (una línea JSON por caso)

```json
{
  "id": "real-0001",
  "message": "texto del mensaje ya anonimizado",
  "context": {
    "subjectId": "tx-…",
    "allowedTransitionIds": ["t_aceptar", "t_cerrar", "t_cancelar_aceptada"],
    "hasAttachments": false,
    "parteDirectory": [
      { "ref": "parte:gperez", "label": "García Pérez" },
      { "ref": "parte:glopez", "label": "García López" }
    ]
  },
  "expected": {
    "transitionId": null,
    "intentLabel": "cobro_parcial",
    "ambiguous": true,
    "mustAskClarification": true,
    "amountEquals": [300]
  },
  "ambiguous": true,
  "origin": "real_anonymized",
  "split": "test",
  "intentType": "cobro_parcial",
  "notes": "Debe preguntar qué García"
}
```

## Campos

| Campo | Regla |
|-------|--------|
| `origin` | `real_anonymized` para mensajes reales; `synthetic` solo generados |
| `split` | `dev` = ajuste de prompts; `test` = evaluación reportada (no mezclar) |
| `expected.transitionId` | `null` si debe aclarar; si no, id exacto de `allowedTransitionIds` |
| `expected.mustAskClarification` | `true` si actuar sin preguntar es **error grave** |
| `intentType` | `aceptacion` \| `cancelacion` \| `declaracion_pago` \| `cobro_parcial` \| `entrega` \| `ambiguo` \| `saludo` \| `otro` |

## Anonimización (obligatoria antes de guardar)

- Sustituir nombres propios por etiquetas de catálogo (`García Pérez`) o refs.
- Eliminar email, teléfono, DNI, IBAN, direcciones.
- No incluir capturas ni texto de comprobantes con PII.

## Criterios de oro

- **Ambiguo:** varias Partes posibles, falta importe/fecha crítico, o intención no mapeable → `transitionId=null` + `mustAskClarification=true`.
- **Claro:** una sola transición razonable entre las permitidas.
- **Prohibido en oro:** transición fuera de `allowedTransitionIds`.

## Separación dev / test

- El informe de precisión se calcula **solo** con `split=test`.
- No uses casos `test` para iterar el system prompt; usa `dev`.
- Objetivo: **n ≥ 139** casos `origin=real_anonymized` en `split=test`.

## Archivos

- `corpus.synthetic.*.jsonl` — generados (no son reales).
- `corpus.real.test.jsonl` — a aportar por el usuario (crear al disponer de mensajes).
