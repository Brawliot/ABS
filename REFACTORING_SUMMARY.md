# Refactorización web/plan.ts - Resumen de Cambios

## Objetivo
Refactorizar `web/plan.ts` para que acepte datos dinámicamente desde `plan-config.json` en lugar de tener valores hardcodeados.

## Cambios Implementados

### 1. **Interfaces TypeScript** (líneas 34-96)
Se crearon interfaces completas para validar y tipar los datos del `plan-config.json`:

```typescript
interface ProjectConfig {
  proyecto: ProyectoConfig;
  departamentos: Departamento[];
  subdepartamentos: Subdepartamento[];
  fases: Fase[];
  hitos: Hito[];
  agenda: Agenda;
  pasos: Paso[];
}
```

**Interfaces adicionales:**
- `ProyectoConfig`: nombre, estado, semana, totalSemanas, metricas
- `Departamento`: id, nombre, estado, porcentaje, icono, colorPorcentaje, detalles
- `Subdepartamento`: id, nombre, departamento, estado, completitud
- `Fase`: id, trimestre, periodo, nombre, tareas
- `Hito`: fecha, nombre, trimestre
- `Agenda`: hoy, mañana, proximosHitos
- `Paso`: id, nombre, subtipo, estado, dependencias

### 2. **Cambio de Firma de Función**

**Antes:**
```typescript
export function renderPlanHtml(): string {
```

**Después:**
```typescript
export function renderPlanHtml(projectData: ProjectConfig): string {
```

### 3. **Reemplazos en el Dashboard (Vista 1)**

#### Datos del Proyecto
- `"Restaurante Malasaña"` → `${projectData.proyecto.nombre}`
- `"Semana 4 de 24"` → `Semana ${projectData.proyecto.semana} de ${projectData.proyecto.totalSemanas}`

#### Métricas
- Progreso: `35%` → `${projectData.proyecto.metricas.progreso}%`
- Timeline: `-2d` → `${projectData.proyecto.metricas.desviacionTimeline}d`
- Presupuesto: `-€3k` → `${projectData.proyecto.metricas.desviacionPresupuesto}`
- Riesgo: `AMARILLO` → `${projectData.proyecto.metricas.riesgoGeneral}`

#### Departamentos (Lista dinámica)
**Antes:** 6 divs hardcodeados para: Legal, Infraestructura, Finanzas, RRHH, Operativo, Sanidad
**Después:** Generado con `.map()` sobre `projectData.departamentos`:
```typescript
${projectData.departamentos.map((dept, idx) => `...`).join('')}
```

#### Modales de Departamentos
**Antes:** 6 modales hardcodeados
**Después:** Generados dinámicamente con detalles desde `dept.detalles`

#### Agenda
**Antes:** Valores hardcodeados para hoy, mañana, próximos hitos
**Después:** Generados desde `projectData.agenda`:
```typescript
${projectData.agenda.hoy.map((item) => ...)}
${projectData.agenda.manana.map((item) => ...)}
${projectData.agenda.proximosHitos.map((hito) => ...)}
```

### 4. **Timeline (Vista 2)**

#### Fases
**Antes:** 4 divs Q1-Q4 hardcodeados
**Después:** Generados desde `projectData.fases`:
```typescript
${projectData.fases.map((fase, idx) => {
  const isSecondHalf = idx >= projectData.fases.length / 2;
  // Colores y numeración automática
  return `<div>...${fase.trimestre}...${fase.nombre}...${fase.tareas.join()}</div>`;
}).join('')}
```

#### Hitos Clave
**Antes:** 4 hitos hardcodeados (15 Mar, 30 Jun, 30 Sep, 15 Dic)
**Después:** Generados desde `projectData.hitos`:
```typescript
${projectData.hitos.map((hito) => {
  const borderColor = hito.trimestre === 'Q3' || hito.trimestre === 'Q4' ? '#10b981' : '#3b82f6';
  return `<div>...${hito.fecha}...${hito.nombre}</div>`;
}).join('')}
```

### 5. **Subdepartamentos - Kanban (Vista 3)**

**Antes:** 3 columnas hardcodeadas (Backlog, En Progreso, Completado) con datos fijos
**Después:** Generadas dinámicamente filtrando `projectData.subdepartamentos` por estado:
```typescript
${(() => {
  const states = ['Backlog', 'En Progreso', 'Completado'];
  return states.map(state => {
    const items = projectData.subdepartamentos.filter(sub => sub.estado === state);
    return `<div>...${items.map(sub => ...).join('')}...</div>`;
  }).join('');
})()}
```

### 6. **Step Graph - Grafo de Dependencias (Vista 4)**

#### Función Helper
Se agregó una función helper para calcular posiciones de nodos:
```typescript
function getNodePosition(idx: number): { x: number; y: number } {
  const positions: Array<{ x: number; y: number }> = [
    { x: 150, y: 100 },   // inicio
    { x: 150, y: 180 },   // planificacion
    // ... más posiciones
  ];
  return positions[idx] || { x: 100 + idx * 50, y: 300 };
}
```

#### Nodos y Conexiones
**Antes:** Nodos SVG hardcodeados (9 nodos) y conexiones (8 flechas)
**Después:** Generados dinámicamente desde `projectData.pasos`:
- **Nodos:** Generados iterando sobre `projectData.pasos`
  - Círculos para inicio/fin
  - Rectángulos para pasos intermedios
  - Colores basados en `paso.estado` (completado/activo/enProgreso/pendiente)

- **Conexiones:** Generadas desde `paso.dependencias`:
  - Líneas verticales para dependencias cercanas
  - Curvas (Bezier) para dependencias lejanas
  - Colores basados en estado del paso

## Cómo Usar

### Antes (Hardcodeado):
```typescript
const html = renderPlanHtml();
```

### Después (Dinámico):
```typescript
import planConfig from './plan-config.json';
const html = renderPlanHtml(planConfig);
```

## Archivos Modificados

1. **web/plan.ts**
   - Interfaz TypeScript: +62 líneas
   - Cambio de firma: 1 línea
   - Reemplazos dinámicos: ~200+ líneas modificadas
   - Total: ~260+ líneas de cambios

2. **web/plan-config.json** (Sin cambios - usado como entrada)

## Beneficios

1. **Mantenibilidad:** Los datos están separados del código HTML
2. **Reutilización:** La función puede generar cualquier plan con estructura similar
3. **Type Safety:** Interfaces TypeScript previenen errores en tiempo de desarrollo
4. **Escalabilidad:** Fácil agregar más departamentos, hitos, fases, etc.
5. **Testing:** Más fácil de probar con diferentes conjuntos de datos

## Estructura Esperada de plan-config.json

```json
{
  "proyecto": { nombre, estado, semana, totalSemanas, metricas },
  "departamentos": [ { id, nombre, estado, porcentaje, icono, colorPorcentaje, detalles } ],
  "subdepartamentos": [ { id, nombre, departamento, estado, completitud } ],
  "fases": [ { id, trimestre, periodo, nombre, tareas } ],
  "hitos": [ { fecha, nombre, trimestre } ],
  "agenda": { hoy, manana, proximosHitos },
  "pasos": [ { id, nombre, subtipo, estado, dependencias } ]
}
```

## Notas Técnicas

- El HTML generado es idéntico al original en estructura y CSS
- Los colores e iconos se determinan dinámicamente basados en los datos
- Las dependencias en el grafo se calculan desde `paso.dependencias`
- El estado visual (colores, estilos) se mapea automáticamente desde los datos

## Próximos Pasos Opcionales

1. Agregar validación en tiempo de ejecución para `projectData`
2. Crear función helper para generar `plan-config.json` desde entrada del usuario
3. Agregar propiedades adicionales a interfaces según sea necesario
4. Optimizar generación de SVG para grafos más complejos
