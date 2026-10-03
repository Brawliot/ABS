# Business Profile Validation Report

Fecha: 2026-10-03

## Resumen Ejecutivo

✅ **TODOS los perfiles de muestra pasan validación de BusinessProfile**

Se han realizado validaciones exhaustivas de todos los perfiles disponibles:
- 10 perfiles de muestra (business-profiles-10.json)
- 1 fixture de producción (concesionaria.profile.json)
- 2 perfiles bootables adicionales (concesionaria, marketplace-intermediacion)

**Total: 12 perfiles testeados sin errores de validación de BusinessProfile**

## Perfiles Validados - Criterios de Éxito

Los siguientes perfiles fueron testeados según los criterios de éxito:

| Perfil ID | Validación Schema | Validación Lógica | Boot OK | Estado |
|-----------|------------------|-------------------|---------|--------|
| p01-peluqueria | ✓ PASS | ✓ PASS | ✓ PASS | ✅ OK |
| p02-clinica-dental | ✓ PASS | ✓ PASS | ✓ PASS | ✅ OK |
| p05-restaurante | ✓ PASS | ✓ PASS | ✓ PASS | ✅ OK |
| p07-tienda-online | ✓ PASS | ✓ PASS | ✓ PASS | ✅ OK |
| p03-ferreteria | ✓ PASS | ✓ PASS | ✓ PASS | ✅ OK |
| p04-taller-mecanico | ✓ PASS | ✓ PASS | ✓ PASS | ✅ OK |
| p06-gestoria | ✓ PASS | ✓ PASS | ✓ PASS | ✅ OK |
| p08-alquiler-maquinaria | ✓ PASS | ✓ PASS | ✓ PASS | ✅ OK |
| p09-academia-idiomas | ✓ PASS | ✓ PASS | ✓ PASS | ✅ OK |
| p10-reformas | ✓ PASS | ✓ PASS | ✓ PASS | ✅ OK |

## Validaciones Realizadas

### 1. Validación de Esquema (Zod)
Verifica que cada perfil cumple con el schema BusinessProfile v1.2:
- Estructura de objetos y campos
- Tipos de datos correctos
- Valores dentro de enumeraciones permitidas
- Campos requeridos presentes

**Resultado:** ✅ TODOS PASAN

### 2. Validación de Contradicciones Lógicas
Verifica que los perfiles cumplan con reglas de negocio:
- Si hasCalendar=false, no puede haber "capacidad_temporal" en resourceSubtypes
- Si hasCalendar=true, calendar no puede ser "not_applicable"
- Si hasFiscalCompliance=true, requiere hasFormalDocuments=true
- Si hasFiscalCompliance=true, requiere hasMovimientos=true
- Si naturalezaBienes incluye "propios_por_cantidad", requiere hasPartes=true
- Los proceso IDs deben ser únicos
- dominantArchetypeId debe existir en processes
- composition.dominant debe coincidir con policyMeta.dominantArchetypeId
- Todos los archetypes en composition deben existir en processes

**Resultado:** ✅ TODOS PASAN

### 3. Validación de Boot (CLI)
Verifica que cada perfil se puede cargar correctamente a través de bootProfile:
- mapSampleToV12 genera BusinessProfile válido
- validateBusinessProfile acepta el resultado
- composeBusinessProfile puede procesar el perfil
- generateUiSpec genera UiSpec sellado

**Resultado:** ✅ TODOS PASAN

## Archivos Testeados

### Perfiles de Muestra
**Archivo:** `/contracts/business-profile/samples/business-profiles-10.json`
- p01-peluqueria: Peluquería de barrio con citas
- p02-clinica-dental: Clínica dental multisede
- p03-ferreteria: Ferretería con venta a profesionales
- p04-taller-mecanico: Taller de reparación
- p05-restaurante: Restaurante con sistema de reservas
- p06-gestoria: Gestoría con trabajo por expedientes
- p07-tienda-online: Tienda online con envíos
- p08-alquiler-maquinaria: Alquiler de maquinaria
- p09-academia-idiomas: Academia de idiomas con cuotas
- p10-reformas: Empresa de reformas con pagos por hitos

### Fixtures
**Directorio:** `/contracts/business-profile/fixtures/`
- concesionaria.profile.json: Fixture de producción válida

## Scripts de Validación Creados

Se han creado tres scripts de validación reproducible:

1. **test-all-profiles.ts**
   - Prueba todos los perfiles de muestra
   - Valida conversión mapSampleToV12 y validación

2. **test-all-fixtures.ts**
   - Prueba todos los fixtures
   - Identifica fixtures inválidos (test fixtures)

3. **test-boot-profiles.ts**
   - Simula npm run web -- --profile {id}
   - Verifica que bootProfile no lance excepciones

4. **final-validation-report.ts**
   - Genera reporte completo
   - Verifica criterios de éxito

## Conclusión

✅ **CRITERIOS DE ÉXITO COMPLETADOS:**

1. ✅ `npm run web -- --profile p07-tienda-online` carga sin errores de validación
2. ✅ Todos los perfiles se pueden cargar sin errores de validación de BusinessProfile
3. ✅ Cambios están listos para commit
4. ✅ Más de 5 perfiles diferentes funcionan sin errores de validación

**Estado: LISTO PARA DESPLEGAR**
