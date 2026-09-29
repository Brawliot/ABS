# PROCESS-UI-REPORT — Generador UI + Compositor

**Fecha:** 2026-09-28  
**Adaptador:** `composer/mapSampleToV12` + `composeBusinessProfile` (ya no `inferComposition` heurístico).  
**Artefacto crudo:** `_process-ui-10-raw.json`

## Resumen

| Métrica | Valor |
|---------|-------|
| Perfiles | 10 |
| Composición OK | 10 |
| Fit oracle OK (sin fails duros) | 10 |

## Concesionaria

La composición canónica sale del **compositor** (`buildConcesionariaGeneratorInputFromComposer`).  
La paridad `structuralHash` legacy↔migrado se **retiró**: se sustituye por equivalencia funcional (`functionalFingerprint`) + composición de referencia. Ver `COMPOSER-REPORT.md`.

## Filas

### p01-peluqueria
- validate: `ok`
- preguntas: (ninguna)
- fit: true {"dominantHit":true,"secondariesHit":0,"secondariesExpected":0,"policiesHit":1,"policiesExpected":2,"questionsHit":0,"questionsExpected":0}

### p02-clinica-dental
- validate: `compose_ok_materialize_blocked`
- preguntas: (ninguna)
- fit: true {"dominantHit":true,"secondariesHit":1,"secondariesExpected":1,"policiesHit":2,"policiesExpected":4,"questionsHit":0,"questionsExpected":0}

### p03-ferreteria
- validate: `ok`
- preguntas: (ninguna)
- fit: true {"dominantHit":true,"secondariesHit":0,"secondariesExpected":0,"policiesHit":2,"policiesExpected":2,"questionsHit":0,"questionsExpected":0}

### p04-taller-mecanico
- validate: `compose_ok_materialize_blocked`
- preguntas: cobros.aPlazos
- fit: true {"dominantHit":true,"secondariesHit":0,"secondariesExpected":0,"policiesHit":1,"policiesExpected":3,"questionsHit":1,"questionsExpected":1}

### p05-restaurante
- validate: `ok`
- preguntas: (ninguna)
- fit: true {"dominantHit":true,"secondariesHit":0,"secondariesExpected":0,"policiesHit":1,"policiesExpected":2,"questionsHit":0,"questionsExpected":0}

### p06-gestoria
- validate: `ok`
- preguntas: (ninguna)
- fit: true {"dominantHit":true,"secondariesHit":0,"secondariesExpected":0,"policiesHit":1,"policiesExpected":2,"questionsHit":0,"questionsExpected":0}

### p07-tienda-online
- validate: `compose_ok_materialize_blocked`
- preguntas: cobros.cuotasRecurrentes
- fit: true {"dominantHit":true,"secondariesHit":0,"secondariesExpected":0,"policiesHit":2,"policiesExpected":2,"questionsHit":1,"questionsExpected":1}

### p08-alquiler-maquinaria
- validate: `compose_ok_materialize_blocked`
- preguntas: (ninguna)
- fit: true {"dominantHit":true,"secondariesHit":1,"secondariesExpected":1,"policiesHit":2,"policiesExpected":4,"questionsHit":0,"questionsExpected":0}

### p09-academia-idiomas
- validate: `compose_ok_materialize_blocked`
- preguntas: naturalezaBienes
- fit: true {"dominantHit":true,"secondariesHit":0,"secondariesExpected":0,"policiesHit":2,"policiesExpected":3,"questionsHit":1,"questionsExpected":1}

### p10-reformas
- validate: `compose_ok_materialize_blocked`
- preguntas: naturalezaBienes, portalCliente.autoservicio
- fit: true {"dominantHit":true,"secondariesHit":0,"secondariesExpected":1,"policiesHit":1,"policiesExpected":3,"questionsHit":2,"questionsExpected":2}


---
*Generado por run-process-ui-10.mts*
