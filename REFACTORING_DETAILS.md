# Refactorización Detallada de web/plan.ts

## Estado Actual
- **Líneas totales:** 1116
- **Tipo de cambio:** Refactorización de renderizado dinámico
- **Status:** Listo para usar

## Cambios Realizados

### 1. Interfaces TypeScript (Nuevas)

Se agregaron 6 interfaces nuevas para tipar `plan-config.json`:

```typescript
// Líneas 34-93
interface ProyectoConfig {
  nombre: string;
  estado: string;
  semana: string;
  totalSemanas: string;
  metricas: { progreso, desviacionTimeline, desviacionPresupuesto, riesgoGeneral };
}

interface Departamento {
  id: string;
  nombre: string;
  estado: string;
  porcentaje: number | null;
  icono: string;
  colorPorcentaje: string;
  detalles: Record<string, string>;
}

interface Subdepartamento {
  id: string;
  nombre: string;
  departamento: string;
  estado: string;
  completitud: number | null;
}

interface Fase {
  id: string;
  trimestre: string;
  periodo: string;
  nombre: string;
  tareas: string[];
}

interface Hito {
  fecha: string;
  nombre: string;
  trimestre: string;
}

interface AgendaItem {
  hora: string;
  titulo: string;
  participantes?: string[];
  ubicacion?: string;
}

interface Agenda {
  hoy: AgendaItem[];
  manana: AgendaItem[];
  proximosHitos: Array<{ nombre: string; fecha: string }>;
}

interface Paso {
  id: string;
  nombre: string;
  subtipo?: string;
  estado: string;
  dependencias: string[];
}

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

### 2. Cambio de Firma de Función

**Línea 138:**
```typescript
// Antes:
export function renderPlanHtml(): string {

// Después:
export function renderPlanHtml(projectData: ProjectConfig): string {
```

### 3. Reemplazos de Datos Dinámicos

#### Dashboard (26 referencias a projectData)

**Proyecto Header:**
- Nombre: `${projectData.proyecto.nombre}`
- Estado: `${projectData.proyecto.estado}`
- Semana: `Semana ${projectData.proyecto.semana} de ${projectData.proyecto.totalSemanas}`

**Métricas:**
- Progreso: `${projectData.proyecto.metricas.progreso}%`
- Timeline: `${projectData.proyecto.metricas.desviacionTimeline}d`
- Presupuesto: `${projectData.proyecto.metricas.desviacionPresupuesto}`
- Riesgo: `${projectData.proyecto.metricas.riesgoGeneral}`

**Departamentos (Lista Dinámica):**
```typescript
${projectData.departamentos.map((dept, idx) => `...`).join('')}
```
Genera dinámicamente:
- Icono: `${dept.icono}`
- Nombre: `${dept.nombre}`
- Porcentaje: `${dept.porcentaje}%` o `-`
- Color: `${dept.colorPorcentaje}`
- Modal con detalles desde `dept.detalles`

**Agenda Dinámica:**
```typescript
// Hoy
${projectData.agenda.hoy.map((item) => ...)}

// Mañana
${projectData.agenda.manana.map((item) => ...)}

// Próximos Hitos
${projectData.agenda.proximosHitos.map((hito, idx) => ...)}
```

#### Timeline (Fases y Hitos)

**Fases:**
```typescript
${projectData.fases.map((fase, idx) => {
  const isSecondHalf = idx >= projectData.fases.length / 2;
  const bgColor = isSecondHalf ? '#d1fae5' : (idx % 2 === 0 ? '#dbeafe' : '#bfdbfe');
  const borderColor = isSecondHalf ? '#10b981' : '#3b82f6';
  return `<div>
    <div>Número: ${idx + 1}</div>
    <div>Trimestre: ${fase.trimestre}</div>
    <div>Nombre: ${fase.nombre}</div>
    <div>Período: ${fase.periodo}</div>
    <div>Tareas: ${fase.tareas.join('<br>')}</div>
  </div>`;
}).join('')}
```

**Hitos Clave:**
```typescript
${projectData.hitos.map((hito) => {
  const isSecondHalf = hito.trimestre === 'Q3' || hito.trimestre === 'Q4';
  const borderColor = isSecondHalf ? '#10b981' : '#3b82f6';
  return `<div>
    <div>Fecha: ${hito.fecha}</div>
    <div>Nombre: ${hito.nombre}</div>
  </div>`;
}).join('')}
```

#### Subdepartamentos (Kanban)

**Estructura Dinámica:**
```typescript
${(() => {
  const states = ['Backlog', 'En Progreso', 'Completado'];
  return states.map(state => {
    const items = projectData.subdepartamentos.filter(sub => sub.estado === state);
    const deptMap = new Map(projectData.departamentos.map(d => [d.id, d.nombre]));
    return `<div>
      <div>Estado: ${state}</div>
      <div>Cantidad: ${items.length}</div>
      ${items.map(sub => `<div>
        <div>${sub.nombre}</div>
        <div>← ${deptMap.get(sub.departamento) || 'Desconocido'}</div>
        <div>Estado: ${sub.estado}</div>
      </div>`).join('')}
    </div>`;
  }).join('');
})()}
```

#### Step Graph (Grafo de Dependencias)

**Nodos (desde pasos):**
```typescript
${projectData.pasos.map((paso, idx) => {
  const pos = getNodePosition(idx);
  let fillColor = '#f3f4f6';
  let strokeColor = '#9ca3af';
  
  if (paso.estado === 'completado') {
    fillColor = '#d1fae5';
    strokeColor = '#10b981';
  } else if (paso.estado === 'activo') {
    fillColor = '#dbeafe';
    strokeColor = '#3b82f6';
  } else if (paso.estado === 'enProgreso') {
    fillColor = '#fef3c7';
    strokeColor = '#f59e0b';
  }
  
  if (paso.id === 'inicio' || paso.id === 'fin') {
    return `<circle cx="${pos.x}" cy="${pos.y}" r="30" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" /><text>${paso.nombre}</text>`;
  } else {
    return `<rect x="${pos.x - 50}" y="${pos.y - 30}" width="100" height="60" rx="8" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" /><text>${paso.nombre}</text><text>${paso.subtipo || ''}</text>`;
  }
}).join('')}
```

**Conexiones/Flechas (desde dependencias):**
```typescript
${projectData.pasos.flatMap((paso, pasoIndex) => {
  const pasoPos = getNodePosition(pasoIndex);
  
  return paso.dependencias.map((depId) => {
    const depIndex = projectData.pasos.findIndex(p => p.id === depId);
    const depPos = getNodePosition(depIndex);
    const isActive = paso.estado === 'activo' || paso.estado === 'enProgreso';
    const marker = isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead)';
    const stroke = isActive ? '#3b82f6' : '#9ca3af';
    
    const dx = pasoPos.x - depPos.x;
    if (Math.abs(dx) < 50) {
      return `<path d="M ${depPos.x} ${depPos.y + 30} L ${pasoPos.x} ${pasoPos.y - 30}" stroke="${stroke}" marker-end="${marker}" />`;
    } else {
      const mx = (depPos.x + pasoPos.x) / 2;
      const my = (depPos.y + pasoPos.y) / 2;
      return `<path d="M ${depPos.x} ${depPos.y + 30} Q ${mx} ${my}, ${pasoPos.x} ${pasoPos.y - 30}" stroke="${stroke}" marker-end="${marker}" />`;
    }
  });
}).join('')}
```

**Helper Function:**
```typescript
function getNodePosition(idx: number): { x: number; y: number } {
  const positions: Array<{ x: number; y: number }> = [
    { x: 150, y: 100 },   // inicio
    { x: 150, y: 180 },   // planificacion
    { x: 150, y: 300 },   // analisis
    { x: 260, y: 450 },   // desarrollo
    { x: 330, y: 450 },   // diseño
    { x: 440, y: 450 },   // testing
    { x: 550, y: 300 },   // deploy
    { x: 750, y: 180 },   // release
    { x: 850, y: 180 }    // fin
  ];
  return positions[idx] || { x: 100 + idx * 50, y: 300 };
}
```

## Ejemplo de Uso

```typescript
// Importar el JSON
import planConfig from './plan-config.json';

// Llamar la función con los datos
const html = renderPlanHtml(planConfig);

// Renderizar en el DOM
document.body.innerHTML = html;
```

## Validación de Tipos

Todo está tipado con TypeScript. Al pasar datos incorrectos, TypeScript lo detectará en tiempo de compilación:

```typescript
// Esto causará error de tipo:
renderPlanHtml({ /* datos incompletos */ });

// Esto es correcto:
const config: ProjectConfig = require('./plan-config.json');
renderPlanHtml(config);
```

## Estructura de plan-config.json

El archivo debe seguir esta estructura exacta:

```json
{
  "proyecto": {
    "nombre": "Restaurante Malasaña",
    "estado": "Estado del proyecto",
    "semana": "4",
    "totalSemanas": "24",
    "metricas": {
      "progreso": 35,
      "desviacionTimeline": -2,
      "desviacionPresupuesto": "-€3k",
      "riesgoGeneral": "AMARILLO"
    }
  },
  "departamentos": [
    {
      "id": "legal",
      "nombre": "Legal & Compliance",
      "estado": "COMPLETADO",
      "porcentaje": 100,
      "icono": "✅",
      "colorPorcentaje": "#10b981",
      "detalles": { "estado": "Completo", "permisos": "Conseguidos" }
    }
    // ... más departamentos
  ],
  "subdepartamentos": [
    {
      "id": "sub-1-1",
      "nombre": "Sub 1.1 - Análisis",
      "departamento": "legal",
      "estado": "Backlog",
      "completitud": null
    }
    // ... más subdepartamentos
  ],
  "fases": [
    {
      "id": "q1",
      "trimestre": "Q1 2025",
      "periodo": "Enero - Marzo",
      "nombre": "Fase de Planificación",
      "tareas": ["Preparación de infraestructura", "Setup de equipo base", "Definición de procesos"]
    }
    // ... más fases
  ],
  "hitos": [
    {
      "fecha": "15 Mar 2025",
      "nombre": "Infraestructura lista",
      "trimestre": "Q1"
    }
    // ... más hitos
  ],
  "agenda": {
    "hoy": [
      {
        "hora": "10:00",
        "titulo": "Revisión Infraestructura",
        "participantes": ["Contratista", "RRHH"]
      }
      // ... más items
    ],
    "manana": [
      {
        "hora": "09:00",
        "titulo": "Checkpoint Desarrollo",
        "participantes": ["Equipo Dev"]
      }
      // ... más items
    ],
    "proximosHitos": [
      { "nombre": "Finalizar obra", "fecha": "Semana 6 (15 Mar)" }
      // ... más hitos
    ]
  },
  "pasos": [
    {
      "id": "inicio",
      "nombre": "INICIO",
      "estado": "completado",
      "dependencias": []
    },
    {
      "id": "planificacion",
      "nombre": "Planificación",
      "subtipo": "Reqs & Scope",
      "estado": "activo",
      "dependencias": ["inicio"]
    }
    // ... más pasos
  ]
}
```

## Datos Generados Automáticamente

Los siguientes elementos se generan dinámicamente sin requrir entradas adicionales:

1. **Colores de estado:** Automáticos basados en `estado`
2. **Posiciones en el grafo:** Calculadas con `getNodePosition()`
3. **Conexiones de dependencias:** Generadas desde `dependencias`
4. **Contador de elementos:** (ej: "3 subdepartamentos")
5. **Numeración de fases:** Automática basada en posición en array
6. **Rutas de SVG:** Calculadas según proximidad entre nodos

## Ventajas de este Refactoring

✅ **Separación de datos y presentación**
✅ **Type-safe** - Errores detectados en compilación
✅ **Reutilizable** - Una función, múltiples planes
✅ **Mantenible** - Cambios en datos no requieren tocar código HTML
✅ **Escalable** - Agregar departamentos, hitos, etc. es trivial
✅ **HTML idéntico** - Salida visual es la misma que original

## Testing

Para probar la función:

```typescript
import { renderPlanHtml } from './web/plan.ts';
import testData from './plan-config.json';

const html = renderPlanHtml(testData);
console.log(html); // HTML completo del dashboard

// Verificar que incluya datos esperados:
console.assert(html.includes('Restaurante Malasaña'));
console.assert(html.includes('35%'));
console.assert(html.includes('Legal & Compliance'));
// ... más assertions
```

## Próximas Mejoras Posibles

1. Validación en runtime con Zod o similar
2. Serialización de datos desde API
3. Cache de HTML generado
4. Soporte para múltiples idiomas
5. Temas CSS dinámicos
6. Exportación a PDF desde datos
