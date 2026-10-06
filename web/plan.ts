/**
 * Plan page: Business plan summary with multiple views
 * Views: dashboard, department, timeline, subdepartment, step-graph
 */

interface PlannerAnalysis {
  phase1: any;
  phase2: any;
  jevPhase2: any;
  phase5: any;
  resources: any;
  suggestedSubdepartments: Record<string, string>;
  originalInput: string;
  timestamp: string;
}

interface Paso {
  id: string;
  numero: number;
  nombre: string;
  descripcion: string;
  tarea_padre: string;
  estado: 'No iniciado' | 'En progreso' | 'Completado' | 'Bloqueado';
  completitud_porcentaje: number;
  duracion: { planeado_dias: number; real_dias: number };
  requisitos: Array<{ tipo: string; descripcion: string; disponible: boolean }>;
  acciones: Array<{ numero: number; descripcion: string; asignado_a: string }>;
  resultado_esperado: string;
  resultado_actual?: string;
  validacion_completitud: boolean;
  dependencias: { espera_paso: string[]; desbloquea_paso: string[] };
  bloqueador?: string;
}

interface Tarea {
  id: string;
  numero: number;
  nombre: string;
  descripcion: string;
  sub_departamento_padre: string;
  estado: 'No iniciada' | 'En progreso' | 'Completada' | 'Bloqueada';
  completitud_porcentaje: number;
  duracion: { planeado_dias: number; real_dias: number; desviacion_dias: number };
  presupuesto: { planeado: number; real: number };
  informacion_requerida: Array<{ tipo: string; descripcion: string; de_quien: string; recibido: boolean; fecha_recibido?: string }>;
  pasos: Paso[];
  dependencias: { requiere_antes: string[]; habilita: string[] };
  riesgo: { nivel: 'Bajo' | 'Medio' | 'Alto'; razon: string };
  validacion: { requerida: boolean; tipo: string; validador: string };
  responsable: string;
  fecha_inicio: string;
  fecha_fin: string;
  prioridad: 'Baja' | 'Media' | 'Alta' | 'Crítica';
}

interface SubDepartamento {
  id: string;
  nombre: string;
  departamento_padre: string;
  descripcion: string;
  estado: 'Pendiente' | 'En Progreso' | 'Completado' | 'Bloqueado';
  completitud_porcentaje: number;
  timeline: {
    planeado_semanas: number;
    planeado_fecha_inicio: string;
    planeado_fecha_fin: string;
    real_semanas?: number;
    real_fecha_inicio?: string;
    real_fecha_fin?: string;
    desviacion_dias: number;
  };
  presupuesto: {
    planeado_euros: number;
    real_euros: number;
    desviacion_euros: number;
    desviacion_porcentaje: number;
  };
  dependencias: {
    bloquea_a: string[];
    bloqueado_por: string[];
    en_paralelo_con: string[];
  };
  bloqueadores: {
    activos: string[];
    potenciales: string[];
  };
  informacion_pendiente: Array<{ tipo: string; descripcion: string; de_quien: string; fecha_limite: string }>;
  riesgo: { nivel: 'Verde' | 'Amarillo' | 'Rojo'; probabilidad: number; impacto: string; razon: string };
  tareas: Tarea[];
  validacion_requerida: boolean;
  proxima_accion: string;
  responsable: string;
}

interface Fase {
  id: string;
  numero: number;
  nombre: string;
  descripcion: string;
  periodo: {
    semana_inicio: number;
    semana_fin: number;
    fecha_inicio: string;
    fecha_fin: string;
  };
  departamentos_activos: Array<{ departamento: string; estado: string; completitud: number }>;
  sub_departamentos_activos: Array<{ sub_departamento: string; criticidad: 'Bloqueador' | 'Crítico' | 'Importante'; estado: string }>;
  hitos_criticos: Array<{ nombre: string; fecha: string; departamento: string; bloqueador_para: string[] }>;
  tareas_criticas: string[];
  paralelismo: { tareas_simultaneas: string[]; capacidad: number };
  presupuesto_fase: { planeado: number; real: number; porcentaje_total: number };
  estado: 'Pendiente' | 'En progreso' | 'Completada';
  salud: 'Verde' | 'Amarillo' | 'Rojo';
}

function getAnalysisFromSession(): PlannerAnalysis | null {
  try {
    const stored = sessionStorage.getItem('plannerAnalysis');
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (e) {
    console.error('Error reading analysis from sessionStorage:', e);
    return null;
  }
}

function getFirstBlockerFromSession(): any {
  try {
    const stored = sessionStorage.getItem('firstBlocker');
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (e) {
    console.error('Error reading firstBlocker from sessionStorage:', e);
    return null;
  }
}

function markDepartmentStates(departamentos: Departamento[]): Departamento[] {
  const firstBlocker = getFirstBlockerFromSession();
  if (!firstBlocker || !firstBlocker.primer_bloqueador) {
    return departamentos;
  }

  const primeraBlockerName = firstBlocker.primer_bloqueador.departamento;
  return departamentos.map(dept => ({
    ...dept,
    esPrimerBloqueador: dept.nombre === primeraBlockerName,
    bloqueadoPor: dept.nombre === primeraBlockerName ? undefined : primeraBlockerName
  }));
}

// Helper: Generate realistic Pasos for a Tarea
function generarPasos(tareaId: string, numPasos: number = 3): Paso[] {
  return Array.from({ length: numPasos }, (_, i) => ({
    id: `${tareaId}-paso-${i + 1}`,
    numero: i + 1,
    nombre: ['Planificación', 'Ejecución', 'Validación', 'Cierre'][i % 4],
    descripcion: `Paso ${i + 1} del proceso`,
    tarea_padre: tareaId,
    estado: i === 0 ? 'En progreso' : i < 1 ? 'Completado' : 'No iniciado',
    completitud_porcentaje: i === 0 ? 50 : i < 1 ? 100 : 0,
    duracion: { planeado_dias: 5, real_dias: i < 1 ? 5 : 0 },
    requisitos: [{ tipo: 'documento', descripcion: 'Documentación requerida', disponible: true }],
    acciones: [{ numero: 1, descripcion: 'Ejecutar paso', asignado_a: 'Equipo' }],
    resultado_esperado: 'Completar paso exitosamente',
    resultado_actual: i < 1 ? 'En progreso' : undefined,
    validacion_completitud: i < 1,
    dependencias: { espera_paso: i > 0 ? [`${tareaId}-paso-${i}`] : [], desbloquea_paso: [] },
    bloqueador: undefined
  }));
}

// Helper: Generate realistic Tareas for a SubDepartamento
function generarTareas(subDeptId: string, numTareas: number = 3): Tarea[] {
  return Array.from({ length: numTareas }, (_, i) => ({
    id: `${subDeptId}-tarea-${i + 1}`,
    numero: i + 1,
    nombre: `Tarea ${i + 1}: ${['Preparación', 'Implementación', 'Validación'][i % 3]}`,
    descripcion: `Descripción de tarea ${i + 1}`,
    sub_departamento_padre: subDeptId,
    estado: i === 0 ? 'En progreso' : 'No iniciada',
    completitud_porcentaje: i === 0 ? 40 : 0,
    duracion: { planeado_dias: 10, real_dias: i === 0 ? 5 : 0, desviacion_dias: 0 },
    presupuesto: { planeado: 5000, real: i === 0 ? 2000 : 0 },
    informacion_requerida: [],
    pasos: generarPasos(`${subDeptId}-tarea-${i + 1}`),
    dependencias: { requiere_antes: i > 0 ? [`${subDeptId}-tarea-${i}`] : [], habilita: [] },
    riesgo: { nivel: 'Bajo', razon: 'Tarea estándar' },
    validacion: { requerida: false, tipo: 'revisión', validador: 'PM' },
    responsable: 'Equipo',
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_fin: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    prioridad: 'Media'
  }));
}

// Helper: Populate tareas for subdepartments that don't have them
function poblarTareasSubdepartamentos(subdepts: SubDepartamento[]): SubDepartamento[] {
  return subdepts.map(sub => ({
    ...sub,
    tareas: (sub.tareas && sub.tareas.length > 0) ? sub.tareas : generarTareas(sub.id, 3)
  }));
}

// Helper: Generate SubDepartamentos from departamentos
function generarSubDepartamentos(depts: Departamento[]): SubDepartamento[] {
  return depts.map((dept, idx) => ({
    id: `${dept.id}-sub`,
    nombre: `${dept.nombre} - Subdepartamento`,
    departamento_padre: dept.id,
    descripcion: `Subdepartamento de ${dept.nombre}`,
    estado: dept.estado === 'CRÍTICO' ? 'En Progreso' : 'Pendiente',
    completitud_porcentaje: dept.porcentaje || 0,
    timeline: {
      planeado_semanas: 12,
      planeado_fecha_inicio: new Date().toISOString().split('T')[0],
      planeado_fecha_fin: new Date(Date.now() + 84 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      real_semanas: dept.estado === 'CRÍTICO' ? 4 : undefined,
      real_fecha_inicio: dept.estado === 'CRÍTICO' ? new Date().toISOString().split('T')[0] : undefined,
      desviacion_dias: 0
    },
    presupuesto: {
      planeado_euros: 50000,
      real_euros: dept.estado === 'CRÍTICO' ? 15000 : 0,
      desviacion_euros: 0,
      desviacion_porcentaje: 0
    },
    dependencias: { bloquea_a: [], bloqueado_por: [], en_paralelo_con: [] },
    bloqueadores: { activos: [], potenciales: [] },
    informacion_pendiente: [],
    riesgo: {
      nivel: dept.colorPorcentaje === '#dc2626' ? 'Rojo' : dept.colorPorcentaje === '#f59e0b' ? 'Amarillo' : 'Verde',
      probabilidad: dept.porcentaje || 50,
      impacto: 'Alto',
      razon: `Estado: ${dept.estado}`
    },
    tareas: generarTareas(`${dept.id}-sub`, 3),
    validacion_requerida: dept.estado === 'CRÍTICO',
    proxima_accion: 'Comenzar tareas iniciales',
    responsable: 'Project Manager'
  }));
}

// Calculate health metrics for a department based on its subdepartments
function calcularSaludDepartamento(deptId: string, subdepts: SubDepartamento[]): Record<string, any> {
  const subsdeptsDept = subdepts.filter(s => s.departamento_padre === deptId);

  if (subsdeptsDept.length === 0) {
    return {
      estado: 'Sin actividad',
      completitud: 0,
      riesgo: 'Desconocido',
      tareasCompletadas: '0 de 0',
      subdepartamentosEnProgreso: 0,
      bloqueadores: 0,
      proximoHito: 'No definido'
    };
  }

  // 1. Estado (cascada)
  let estado = 'PENDIENTE';
  if (subsdeptsDept.some(s => s.estado === 'Bloqueado')) {
    estado = 'BLOQUEADO';
  } else if (subsdeptsDept.some(s => s.estado === 'En Progreso')) {
    estado = 'EN PROGRESO';
  } else if (subsdeptsDept.every(s => s.estado === 'Completado')) {
    estado = 'COMPLETADO';
  }

  // 2. Completitud % (promedio ponderado)
  let tareasCompletadas = 0;
  let tareasTotal = 0;
  subsdeptsDept.forEach(sub => {
    if (sub.tareas) {
      const completadas = sub.tareas.filter(t => t.estado === 'Completado').length;
      tareasCompletadas += completadas;
      tareasTotal += sub.tareas.length;
    }
  });
  const completitud = tareasTotal > 0 ? Math.round((tareasCompletadas / tareasTotal) * 100) : 0;

  // 3. Riesgo (máximo)
  const nivelesRiesgo = { 'ROJO': 3, 'AMARILLO': 2, 'VERDE': 1, 'Desconocido': 0 };
  let riesgoMax = 'VERDE';
  subsdeptsDept.forEach(sub => {
    const riesgoActual = sub.riesgo?.nivel || 'Desconocido';
    if (nivelesRiesgo[riesgoActual] > nivelesRiesgo[riesgoMax]) {
      riesgoMax = riesgoActual;
    }
  });

  // 4. Subdepartamentos en progreso
  const subdepartamentosEnProgreso = subsdeptsDept.filter(s => s.estado === 'En Progreso').length;

  // 5. Bloqueadores activos
  let bloqueadores = 0;
  subsdeptsDept.forEach(sub => {
    if (sub.tareas) {
      bloqueadores += sub.tareas.filter(t => t.estado === 'Bloqueado').length;
    }
  });

  return {
    estado: estado,
    completitud: completitud,
    riesgo: riesgoMax,
    tareasCompletadas: `${tareasCompletadas} de ${tareasTotal}`,
    subdepartamentosEnProgreso: subdepartamentosEnProgreso,
    bloqueadores: bloqueadores,
    proximoHito: 'En revisión'
  };
}

function escapeHtml(text: string): string {
  if (!text) return '';
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

export function mapAnalysisToProjectConfig(analysis: PlannerAnalysis): ProjectConfig {
  const criticalDepts = analysis.phase5?.departamentos_criticos || [];
  const importantDepts = analysis.phase5?.departamentos_importantes || [];
  const secondaryDepts = analysis.phase5?.departamentos_secundarios || [];

  let departamentos: Departamento[] = [
    ...criticalDepts.map((d: any, i: number) => ({
      id: `dept-critico-${i}`,
      nombre: d.nombre,
      estado: 'CRÍTICO',
      porcentaje: d.probabilidad ? Math.round(d.probabilidad * 100) : 50,
      icono: '[C]',
      colorPorcentaje: '#dc2626',
      detalles: { estado: 'Crítico para el proyecto', probabilidad: `${d.probabilidad ? Math.round(d.probabilidad * 100) : 50}%` }
    })),
    ...importantDepts.map((d: any, i: number) => ({
      id: `dept-important-${i}`,
      nombre: d.nombre,
      estado: 'EN PROGRESO',
      porcentaje: d.probabilidad ? Math.round(d.probabilidad * 100) : 50,
      icono: '[I]',
      colorPorcentaje: '#f59e0b',
      detalles: { estado: 'Importante para el proyecto', probabilidad: `${d.probabilidad ? Math.round(d.probabilidad * 100) : 50}%` }
    })),
    ...secondaryDepts.map((d: any, i: number) => ({
      id: `dept-secondary-${i}`,
      nombre: d.nombre,
      estado: 'PENDIENTE',
      porcentaje: null,
      icono: '[S]',
      colorPorcentaje: '#6b7280',
      detalles: { estado: 'Secundario en el proyecto', probabilidad: `${d.probabilidad ? Math.round(d.probabilidad * 100) : 50}%` }
    }))
  ];

  const subdepartamentos = generarSubDepartamentos(departamentos);

  // Calculate health metrics for each department based on its subdepartments
  departamentos.forEach(dept => {
    const salud = calcularSaludDepartamento(dept.id, subdepartamentos);
    dept.estado = salud.estado;
    dept.porcentaje = salud.completitud;
    dept.detalles = {
      completitud: `${salud.completitud}%`,
      tareasCompletadas: salud.tareasCompletadas,
      subdepartamentosEnProgreso: salud.subdepartamentosEnProgreso,
      bloqueadores: salud.bloqueadores > 0 ? `${salud.bloqueadores} tarea(s) bloqueada(s)` : 'Ninguno',
      riesgo: salud.riesgo,
      proximoHito: salud.proximoHito
    };
    // Update color based on state
    if (salud.estado === 'COMPLETADO') {
      dept.colorPorcentaje = '#10b981';
      dept.icono = '✓';
    } else if (salud.estado === 'EN PROGRESO') {
      dept.colorPorcentaje = '#f59e0b';
      dept.icono = '↻';
    } else if (salud.estado === 'BLOQUEADO') {
      dept.colorPorcentaje = '#ef4444';
      dept.icono = '⚠';
    }
  });

  // Note: markDepartmentStates will be called on client-side only (sessionStorage not available on server)

  // Extract project name from jevPhase2
  const nombreProyecto = analysis.jevPhase2?.modelo_negocio || 'Plan de Negocio';

  // Create ProjectConfig
  return {
    proyecto: {
      nombre: nombreProyecto,
      estado: analysis.jevPhase2?.estado || 'En desarrollo',
      semana: '1',
      totalSemanas: '24',
      metricas: {
        progreso: Math.round((criticalDepts.length / (criticalDepts.length + importantDepts.length + secondaryDepts.length || 1)) * 100),
        desviacionTimeline: 0,
        desviacionPresupuesto: `-€${analysis.resources?.presupuesto || 0}`,
        riesgoGeneral: criticalDepts.length > 0 ? 'ROJO' : 'AMARILLO'
      }
    },
    departamentos,
    subdepartamentos,
    fases: [
      {
        id: 'q1',
        trimestre: 'Q1 2025',
        periodo: 'Enero - Marzo',
        nombre: 'Fase de Planificación',
        tareas: ['Validación de concepto', 'Análisis de viabilidad', 'Setup inicial']
      },
      {
        id: 'q2',
        trimestre: 'Q2 2025',
        periodo: 'Abril - Junio',
        nombre: 'Desarrollo Activo',
        tareas: ['Implementación', 'Integración', 'Testing']
      },
      {
        id: 'q3',
        trimestre: 'Q3 2025',
        periodo: 'Julio - Septiembre',
        nombre: 'Optimización',
        tareas: ['Refinamiento', 'Capacitación', 'Ajustes']
      },
      {
        id: 'q4',
        trimestre: 'Q4 2025',
        periodo: 'Octubre - Diciembre',
        nombre: 'Lanzamiento',
        tareas: ['Go live', 'Soporte', 'Evaluación']
      }
    ],
    hitos: [
      { fecha: '15 Mar 2025', nombre: 'Análisis completado', trimestre: 'Q1' },
      { fecha: '30 Jun 2025', nombre: 'MVP completado', trimestre: 'Q2' },
      { fecha: '30 Sep 2025', nombre: 'Beta testing terminado', trimestre: 'Q3' },
      { fecha: '15 Dic 2025', nombre: 'Go Live', trimestre: 'Q4' }
    ],
    agenda: {
      hoy: [
        { hora: '10:00', titulo: 'Revisión del plan', participantes: ['Equipo'] },
        { hora: '14:30', titulo: 'Alineación de recursos', ubicacion: 'Virtual' }
      ],
      manana: [
        { hora: '09:00', titulo: 'Checkpoint de validación', participantes: ['Stakeholders'] }
      ],
      proximosHitos: [
        { nombre: 'Validación de departamentos críticos', fecha: 'Semana 1' },
        { nombre: 'Setup de infraestructura', fecha: 'Semana 2' }
      ]
    },
    pasos: subdepartamentos.flatMap(sub => sub.tareas.flatMap(t => t.pasos))
  };
}

type PlanView = 'dashboard' | 'timeline' | 'subdepartment' | 'step-graph';

// ============================================================================
// TypeScript Interfaces for plan-config.json
// ============================================================================

interface ProyectoConfig {
  nombre: string;
  estado: string;
  semana: string;
  totalSemanas: string;
  metricas: {
    progreso: number;
    desviacionTimeline: number;
    desviacionPresupuesto: string;
    riesgoGeneral: string;
  };
}

interface Departamento {
  id: string;
  nombre: string;
  estado: string;
  porcentaje: number | null;
  icono: string;
  colorPorcentaje: string;
  detalles: Record<string, string>;
  bloqueadoPor?: string;
  esPrimerBloqueador?: boolean;
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

interface ProjectConfig {
  proyecto: ProyectoConfig;
  departamentos: Departamento[];
  subdepartamentos: Subdepartamento[];
  fases: Fase[];
  hitos: Hito[];
  agenda: Agenda;
  pasos: Paso[];
}

const PLAN_VIEWS: Record<PlanView, { label: string; icon: string; description: string }> = {
  dashboard: {
    label: 'Panel General',
    icon: '',
    description: 'Resumen general del plan'
  },
  timeline: {
    label: 'Cronograma',
    icon: '',
    description: 'Línea de tiempo del proyecto'
  },
  subdepartment: {
    label: 'Subdepartamentos',
    icon: '',
    description: 'Desglose de subdepartamentos'
  },
  'step-graph': {
    label: 'Grafo de Pasos',
    icon: '',
    description: 'Flujo de pasos y procesos'
  }
};

/**
 * Renders the plan page HTML
 * If projectData is provided, uses it directly
 * Otherwise, the browser will load from sessionStorage via JavaScript
 */
export { poblarTareasSubdepartamentos };

export function renderPlanHtml(projectData?: ProjectConfig | null): string {
  // If no projectData provided, use a minimal version
  if (!projectData) {
    projectData = {
      proyecto: {
        nombre: 'Plan de Negocio',
        estado: 'Sin datos',
        semana: '-',
        totalSemanas: '-',
        metricas: { progreso: 0, desviacionTimeline: 0, desviacionPresupuesto: '-', riesgoGeneral: '-' }
      },
      departamentos: [],
      subdepartamentos: [],
      fases: [],
      hitos: [],
      agenda: { hoy: [], manana: [], proximosHitos: [] },
      pasos: []
    };
  }

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Tu Plan de Negocio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      height: 100vh;
      padding: 0;
      margin: 0;
    }

    .plan-container {
      width: 100%;
      height: 100vh;
      background: white;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .plan-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 24px 40px;
      text-align: center;
      flex-shrink: 0;
    }

    .plan-title {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 10px;
    }

    .plan-subtitle {
      font-size: 14px;
      opacity: 0.9;
      line-height: 1.6;
    }

    .plan-nav {
      display: flex;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
      overflow-x: auto;
      flex-shrink: 0;
    }

    .nav-button {
      flex: 1;
      min-width: 150px;
      padding: 16px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: #6b7280;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .nav-button:hover {
      color: #1f2937;
      background: white;
    }

    .nav-button.active {
      color: #3b82f6;
      border-bottom-color: #3b82f6;
      background: white;
    }

    .plan-content {
      padding: 40px;
      flex: 1;
      overflow-y: auto;
    }

    .view-section {
      display: none !important;
      position: absolute;
      width: 100%;
    }

    .view-section.active {
      display: block !important;
      position: relative;
      animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .section-title {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .section-title .icon {
      font-size: 28px;
    }

    .status-card {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 16px;
      margin: 20px 0;
      color: #166534;
      font-size: 13px;
      line-height: 1.6;
    }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }

    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
      transition: all 0.2s;
    }

    .card:hover {
      border-color: #3b82f6;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
    }

    .card-title {
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 8px;
      font-size: 14px;
    }

    .card-description {
      color: #6b7280;
      font-size: 13px;
      line-height: 1.5;
    }

    .timeline {
      position: relative;
      padding-left: 40px;
    }

    .timeline-item {
      position: relative;
      padding-bottom: 30px;
      margin-bottom: 20px;
      border-left: 2px solid #e5e7eb;
      padding-left: 20px;
    }

    .timeline-item:before {
      content: '';
      position: absolute;
      left: -8px;
      top: 0;
      width: 12px;
      height: 12px;
      background: #3b82f6;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 0 0 1px #e5e7eb;
    }

    .timeline-label {
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 4px;
    }

    .timeline-desc {
      color: #6b7280;
      font-size: 13px;
    }

    .progress-stats {
      display: flex;
      gap: 20px;
      margin: 20px 0;
      flex-wrap: wrap;
    }

    .stat {
      flex: 1;
      min-width: 150px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
    }

    .stat-number {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 12px;
      opacity: 0.9;
    }

    .plan-actions {
      display: flex;
      gap: 12px;
      margin-top: 30px;
      padding-top: 30px;
      border-top: 1px solid #e5e7eb;
    }

    .plan-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .plan-btn.primary {
      background: #3b82f6;
      color: white;
      flex: 1;
    }

    .plan-btn.primary:hover {
      background: #2563eb;
      transform: translateY(-2px);
    }

    .plan-btn.secondary {
      background: #f3f4f6;
      color: #1f2937;
      border: 1px solid #e5e7eb;
      flex: 1;
    }

    .plan-btn.secondary:hover {
      background: #e5e7eb;
    }

    .metric-popup {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }

    .metric-popup.active {
      display: flex;
    }

    .metric-popup-content {
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .metric-popup-close {
      float: right;
      font-size: 24px;
      cursor: pointer;
      color: #9ca3af;
      border: none;
      background: transparent;
    }

    .metric-popup-close:hover {
      color: #1f2937;
    }

    .metric-popup-title {
      font-size: 18px;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 16px 0;
      clear: both;
    }

    .metric-popup-value {
      font-size: 36px;
      font-weight: 700;
      margin: 12px 0;
    }

    .metric-popup-desc {
      font-size: 13px;
      color: #6b7280;
      line-height: 1.6;
    }

    .placeholder-content {
      color: #9ca3af;
      padding: 40px;
      text-align: center;
      background: #f9fafb;
      border-radius: 8px;
      border: 2px dashed #e5e7eb;
    }
  </style>
</head>
<body>

    <div class="plan-nav">
      <button class="nav-button active" data-view="dashboard"> Panel General</button>
      <button class="nav-button" data-view="subdepartment"> Subdepartamentos</button>
      <button class="nav-button" data-view="step-graph"> Grafo de Pasos</button>
    </div>

    <div class="plan-content">
      <!-- Dashboard View - Executive Overview -->
      <div id="dashboard" class="view-section active" style="display: flex; flex-direction: column;">
        <!-- Header Row - Same Line -->
        <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 24px;">

          <!-- Project Header with Metrics -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 24px; border-radius: 12px; flex: 1;">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">${projectData.proyecto.nombre}</div>
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 12px;">${projectData.proyecto.estado} · Semana ${projectData.proyecto.semana} de ${projectData.proyecto.totalSemanas}</div>

            <!-- Compact Metrics as Buttons -->
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button class="metric-btn" data-metric="progress" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Progreso: <strong>${projectData.proyecto.metricas.progreso}%</strong></button>
              <button class="metric-btn" data-metric="timeline" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Timeline: <strong>${projectData.proyecto.metricas.desviacionTimeline > 0 ? '+' : ''}${projectData.proyecto.metricas.desviacionTimeline}d</strong></button>
              <button class="metric-btn" data-metric="budget" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Presupuesto: <strong>${projectData.proyecto.metricas.desviacionPresupuesto}</strong></button>
              <button class="metric-btn" data-metric="risk" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Riesgo: <strong>${projectData.proyecto.metricas.riesgoGeneral}</strong></button>
              <button onclick="document.getElementById('popup-cronograma').classList.add('active')" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;">📅 Cronograma</button>
            </div>
          </div>
        </div>

        <!-- Metric Popups -->
        <div id="popup-progress" class="metric-popup">
          <div class="metric-popup-content">
            <button class="metric-popup-close" onclick="this.closest('.metric-popup').classList.remove('active')">×</button>
            <h3 class="metric-popup-title">Progreso Total</h3>
            <div class="metric-popup-value" style="color: #3b82f6;">${projectData.proyecto.metricas.progreso}%</div>
            <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin: 16px 0;">
              <div style="width: ${projectData.proyecto.metricas.progreso}%; height: 100%; background: #3b82f6;"></div>
            </div>
            <div class="metric-popup-desc">
              <strong>Semana actual:</strong> ${projectData.proyecto.semana} de ${projectData.proyecto.totalSemanas}<br/>
              <strong>Ritmo:</strong> On track<br/>
              <strong>Próximo hito:</strong> Semana 6
            </div>
          </div>
        </div>

        <div id="popup-timeline" class="metric-popup">
          <div class="metric-popup-content">
            <button class="metric-popup-close" onclick="this.closest('.metric-popup').classList.remove('active')">×</button>
            <h3 class="metric-popup-title">Desviación Timeline</h3>
            <div class="metric-popup-value" style="color: #10b981;">${projectData.proyecto.metricas.desviacionTimeline > 0 ? '+' : ''}${projectData.proyecto.metricas.desviacionTimeline} días</div>
            <div class="metric-popup-desc" style="margin-top: 16px;">
              <strong>Planeado:</strong> ${projectData.proyecto.totalSemanas} semanas<br/>
              <strong>Estado:</strong>  Dentro de rango<br/>
              <strong>Riesgo:</strong> Bajo
            </div>
          </div>
        </div>

        <div id="popup-budget" class="metric-popup">
          <div class="metric-popup-content">
            <button class="metric-popup-close" onclick="this.closest('.metric-popup').classList.remove('active')">×</button>
            <h3 class="metric-popup-title">Desviación Presupuesto</h3>
            <div class="metric-popup-value" style="color: #10b981;">${projectData.proyecto.metricas.desviacionPresupuesto}</div>
            <div class="metric-popup-desc" style="margin-top: 16px;">
              <strong>Presupuesto:</strong> €40k<br/>
              <strong>Gastado:</strong> €37k<br/>
              <strong>Estado:</strong>  Bajo presupuesto
            </div>
          </div>
        </div>

        <div id="popup-risk" class="metric-popup">
          <div class="metric-popup-content">
            <button class="metric-popup-close" onclick="this.closest('.metric-popup').classList.remove('active')">×</button>
            <h3 class="metric-popup-title">Riesgo General</h3>
            <div class="metric-popup-value" style="color: #f59e0b;">${projectData.proyecto.metricas.riesgoGeneral}</div>
            <div class="metric-popup-desc" style="margin-top: 16px;">
              <strong>Nivel:</strong> 55%<br/>
              <strong>Principal problema:</strong> Retraso en Infraestructura<br/>
              <strong>Acción:</strong> Monitorear Contratista
            </div>
          </div>
        </div>

        <!-- Cronograma Popup -->
        <div id="popup-cronograma" class="metric-popup" style="z-index: 2000;" onclick="if(event.target===this)this.classList.remove('active')">
          <div class="metric-popup-content" style="max-width: 900px; width: 95%; max-height: 90vh; overflow-y: auto;">
            <button class="metric-popup-close" onclick="this.closest('.metric-popup').classList.remove('active')">×</button>
            <h3 class="metric-popup-title" style="margin-top: 0;">Cronograma del Proyecto</h3>

            <p style="color: #6b7280; font-size: 13px; margin-bottom: 20px;">
              Línea de tiempo de hitos, fases y entregas principales
            </p>

            <div style="margin: 20px 0; position: relative;">
              <!-- Timeline Line -->
              <div style="position: absolute; left: 15px; top: 0; bottom: 0; width: 2px; background: linear-gradient(180deg, #3b82f6 0%, #10b981 100%);"></div>

              <!-- Timeline Items -->
              <div style="position: relative; padding-left: 80px;">
                ${projectData.fases.map((fase, idx) => {
                  const isSecondHalf = idx >= projectData.fases.length / 2;
                  const bgColor = isSecondHalf ? '#d1fae5' : (idx % 2 === 0 ? '#dbeafe' : '#bfdbfe');
                  const borderColor = isSecondHalf ? '#10b981' : '#3b82f6';
                  const numColor = isSecondHalf ? '#10b981' : '#3b82f6';
                  return `
                <div style="margin-bottom: ${idx < projectData.fases.length - 1 ? '40px' : '0'};">
                  <div style="position: absolute; left: -30px; top: -6px; width: 32px; height: 32px; background: ${bgColor}; border: 3px solid ${borderColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; color: ${numColor}; font-size: 13px;">${idx + 1}</div>
                  <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
                    <div style="font-weight: 600; color: #1f2937; font-size: 14px;">Q${idx + 1} 2025 - ${['Planificación', 'Desarrollo Activo', 'Optimización', 'Lanzamiento'][idx]}</div>
                    <div style="color: #6b7280; font-size: 12px; margin-top: 4px;">${['Enero - Marzo', 'Abril - Junio', 'Julio - Septiembre', 'Octubre - Diciembre'][idx]}</div>
                    <div style="color: #6b7280; font-size: 13px; margin-top: 12px; line-height: 1.6;">
                      ${fase.tareas ? fase.tareas.map(tarea => `&nbsp;&nbsp;${tarea}`).join('<br>') : ''}
                    </div>
                  </div>
                </div>
                `;
                }).join('')}
              </div>
            </div>

            <!-- Hitos Clave -->
            <div style="margin-top: 40px; padding: 20px; background: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
              <div style="font-weight: 600; color: #1f2937; margin-bottom: 12px; font-size: 14px;">🎯 Hitos Clave</div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                ${projectData.hitos.map(hito => `
                <div style="padding: 12px; background: white; border-left: 4px solid #3b82f6; border-radius: 6px;">
                  <div style="font-weight: 600; color: #1f2937; font-size: 12px;">${hito.fecha}</div>
                  <div style="color: #6b7280; font-size: 11px; margin-top: 4px;">${hito.nombre}</div>
                </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Subdepartment Tasks Popup -->
        <div id="popup-subdept" class="metric-popup" style="z-index: 2000;" onclick="if(event.target===this)this.classList.remove('active')">
          <div class="metric-popup-content" style="max-width: 700px; width: 95%; max-height: 90vh; overflow-y: auto;">
            <button class="metric-popup-close" onclick="this.closest('.metric-popup').classList.remove('active')">×</button>
            <h3 class="metric-popup-title" id="subdept-popup-title" style="margin-top: 0;">Tareas del Subdepartamento</h3>

            <div id="subdept-popup-content" style="margin-top: 20px;">
              <!-- Populated by JavaScript -->
            </div>
          </div>
        </div>

        <!-- Departments Status & Schedule - Two Columns -->
        <div style="display: grid; grid-template-columns: 1fr 0.5fr; gap: 24px; margin-bottom: 24px;">
          <!-- Column 1: Departments - Expandable List -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div style="font-size: 16px; font-weight: 600; color: #1f2937;">Departamentos</div>
            </div>
            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
              ${projectData.departamentos.map((dept, idx) => {
                const isBloqueado = dept.bloqueadoPor ? true : false;
                const cursorStyle = isBloqueado ? 'not-allowed' : 'pointer';
                const bgHoverStyle = isBloqueado ? 'transparent' : '#f9fafb';
                const opacityStyle = isBloqueado ? '0.6' : '1';
                const onclickHandler = isBloqueado
                  ? 'event.preventDefault(); event.stopPropagation();'
                  : 'this.parentElement.querySelector(".dept-content").style.display = this.parentElement.querySelector(".dept-content").style.display === "none" ? "block" : "none"; this.querySelector(".dept-toggle").textContent = this.parentElement.querySelector(".dept-content").style.display === "none" ? "▼" : "▲";';

                const escapedNombre = escapeHtml(dept.nombre);
                const escapedBloqueadoPor = escapeHtml(dept.bloqueadoPor || '');

                return `
              <div style="border-bottom: ${idx < projectData.departamentos.length - 1 ? '1px solid #e5e7eb' : 'none'};">
                <div class="dept-header" onclick="${onclickHandler}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; cursor: ${cursorStyle}; user-select: none; transition: all 0.2s; background: ${isBloqueado ? '#f3f4f6' : 'transparent'}; opacity: ${opacityStyle};" ${!isBloqueado ? `onmouseover="this.style.background = '#f9fafb'" onmouseout="this.style.background = 'transparent'"` : ''}>
                  <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                    <span class="dept-toggle" style="font-size: 10px; color: #9ca3af;">▲</span>
                    <span style="font-size: 16px;">${isBloqueado ? '🔒' : dept.icono}</span>
                    <div style="font-weight: 500; color: ${isBloqueado ? '#9ca3af' : '#1f2937'}; font-size: 13px;">${escapedNombre}</div>
                  </div>
                  <div style="font-weight: 700; color: ${isBloqueado ? '#9ca3af' : dept.colorPorcentaje}; font-size: 13px;">${dept.porcentaje !== null ? dept.porcentaje + '%' : '-'}</div>
                </div>
                ${isBloqueado ? `
                <div style="padding: 10px 16px; background: #fef3c7; border-top: 1px solid #fcd34d; display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 12px; color: #92400e;">🔒 Desbloquearse cuando se complete: <strong>${escapedBloqueadoPor}</strong></span>
                </div>
                ` : ''}
                <div class="dept-content" style="display: none; padding: 16px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
                  <div style="display: grid; gap: 12px; margin-bottom: 16px;">
                    ${Object.entries(dept.detalles).map(([key, value]) => `
                    <div style="display: flex; justify-content: space-between; font-size: 13px;">
                      <span style="color: #6b7280; font-weight: 500;">${escapeHtml(key)}:</span>
                      <span style="color: #1f2937; font-weight: 600;">${escapeHtml(String(value))}</span>
                    </div>
                    `).join('')}
                  </div>
                  <button class="plan-btn primary" onclick="document.querySelector('[data-view=subdepartment]').click(); window.currentDeptFilter=${JSON.stringify(dept.id)}; return false;" style="width: 100%; padding: 10px 16px; font-size: 12px;">Ver Subdepartamentos de ${escapedNombre}</button>
                </div>
              </div>
              `;
              }).join('')}
            </div>
          </div>

          <!-- Column 2: Agenda -->
          <div>
            <div style="font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 16px;"> Agenda</div>

            <!-- Agenda Items -->
            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
              <!-- Hoy -->
              <div style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
                <div style="font-size: 12px; font-weight: 600; color: #3b82f6; margin-bottom: 12px;">HOY</div>
                ${projectData.agenda.hoy.map((item, idx) => `
                <div style="padding: 10px 0; ${idx < projectData.agenda.hoy.length - 1 ? 'border-bottom: 1px solid #f3f4f6;' : ''} margin-bottom: 10px;">
                  <div style="font-size: 13px; font-weight: 600; color: #1f2937;">${item.hora} - ${item.titulo}</div>
                  <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${item.participantes ? 'Con: ' + item.participantes.join(', ') : item.ubicacion ? item.ubicacion : ''}</div>
                </div>
                `).join('')}
              </div>

              <!-- Mañana -->
              <div style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
                <div style="font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 12px;">MAÑANA (7 Oct)</div>
                ${projectData.agenda.manana.map((item) => `
                <div style="padding: 10px 0;">
                  <div style="font-size: 13px; font-weight: 600; color: #1f2937;">${item.hora} - ${item.titulo}</div>
                  <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${item.participantes ? item.participantes.join(', ') : ''}</div>
                </div>
                `).join('')}
              </div>

              <!-- Próximos Hitos -->
              <div style="padding: 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #f59e0b; margin-bottom: 12px;">PRÓXIMOS HITOS</div>
                ${projectData.agenda.proximosHitos.map((hito, idx) => `
                <div style="padding: 8px 0; ${idx < projectData.agenda.proximosHitos.length - 1 ? 'margin-bottom: 8px;' : ''} border-left: 3px solid ${idx === 0 ? '#f59e0b' : '#10b981'}; padding-left: 10px;">
                  <div style="font-size: 12px; font-weight: 600; color: #1f2937;">${hito.nombre}</div>
                  <div style="font-size: 11px; color: #6b7280;">${hito.fecha}</div>
                </div>
                `).join('')}
              </div>
            </div>

            <!-- Critical Milestone -->
            <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); border: 1px solid #fcd34d; border-radius: 12px; padding: 20px; margin-top: 16px; margin-bottom: 12px;">
              <div style="font-size: 12px; color: #92400e; font-weight: 600; margin-bottom: 8px;">PRÓXIMO HITO CRÍTICO</div>
              <div style="font-size: 16px; font-weight: 700; color: #1f2937;">${projectData.agenda.proximosHitos[0]?.nombre || 'Sin hitos'}</div>
              <div style="font-size: 12px; color: #92400e; margin-top: 4px;">${projectData.agenda.proximosHitos[0]?.fecha || ''}</div>
            </div>

            <!-- Action Buttons -->
            <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
              <button style="background: #10b981; color: white; border: none; padding: 10px 12px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 12px;">Reportar cambio</button>
              <button style="background: #f3f4f6; color: #1f2937; border: 1px solid #e5e7eb; padding: 10px 12px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 12px;">Chat con Planificador</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Department View - Health Matrix -->
      <!-- Timeline View -->
      <div id="timeline" class="view-section">
        <div class="section-title">
          <span class="icon"></span>
          Cronograma del Proyecto
        </div>

        <p style="color: #6b7280; font-size: 13px; margin-bottom: 20px;">
          Línea de tiempo de hitos, fases y entregas principales
        </p>

        <div style="margin: 40px 0; position: relative;">
          <!-- Timeline Line -->
          <div style="position: absolute; left: 15px; top: 0; bottom: 0; width: 2px; background: linear-gradient(180deg, #3b82f6 0%, #10b981 100%);"></div>

          <!-- Timeline Items -->
          <div style="position: relative; padding-left: 80px;">
            ${projectData.fases.map((fase, idx) => {
              const isSecondHalf = idx >= projectData.fases.length / 2;
              const bgColor = isSecondHalf ? '#d1fae5' : (idx % 2 === 0 ? '#dbeafe' : '#bfdbfe');
              const borderColor = isSecondHalf ? '#10b981' : '#3b82f6';
              const numColor = isSecondHalf ? '#10b981' : '#3b82f6';
              return `
            <div style="margin-bottom: ${idx < projectData.fases.length - 1 ? '40px' : '0'};">
              <div style="position: absolute; left: -30px; top: -6px; width: 32px; height: 32px; background: ${bgColor}; border: 3px solid ${borderColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; color: ${numColor}; font-size: 13px;">${idx + 1}</div>
              <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
                <div style="font-weight: 600; color: #1f2937; font-size: 14px;">${fase.trimestre} - ${fase.nombre}</div>
                <div style="color: #6b7280; font-size: 12px; margin-top: 4px;">${fase.periodo}</div>
                <div style="color: #6b7280; font-size: 13px; margin-top: 12px; line-height: 1.6;">
                  ${fase.tareas.map(tarea => `&nbsp;&nbsp;${tarea}`).join('<br>')}
                </div>
              </div>
            </div>
            `;
            }).join('')}
          </div>
        </div>

        <!-- Hitos Clave -->
        <div style="margin-top: 40px; padding: 20px; background: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
          <div style="font-weight: 600; color: #1f2937; margin-bottom: 12px; font-size: 14px;"> Hitos Clave</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
            <div style="padding: 12px; background: white; border-left: 4px solid #3b82f6; border-radius: 6px;">
              <div style="font-weight: 600; color: #1f2937; font-size: 12px;">15 Mar 2025</div>
              <div style="color: #6b7280; font-size: 11px; margin-top: 4px;">Infraestructura lista</div>
            </div>
            <div style="padding: 12px; background: white; border-left: 4px solid #3b82f6; border-radius: 6px;">
              <div style="font-weight: 600; color: #1f2937; font-size: 12px;">30 Jun 2025</div>
              <div style="color: #6b7280; font-size: 11px; margin-top: 4px;">MVP completado</div>
            </div>
            <div style="padding: 12px; background: white; border-left: 4px solid #10b981; border-radius: 6px;">
              <div style="font-weight: 600; color: #1f2937; font-size: 12px;">30 Sep 2025</div>
              <div style="color: #6b7280; font-size: 11px; margin-top: 4px;">Beta testing terminado</div>
            </div>
            <div style="padding: 12px; background: white; border-left: 4px solid #10b981; border-radius: 6px;">
              <div style="font-weight: 600; color: #1f2937; font-size: 12px;">15 Dic 2025</div>
              <div style="color: #6b7280; font-size: 11px; margin-top: 4px;">Go Live</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Subdepartment View - Kanban -->
      <div id="subdepartment" class="view-section">
        <div class="section-title">
          <span class="icon"></span>
          Estructura de Subdepartamentos (Kanban)
          <span id="dept-filter-tag" style="display: none; margin-left: 12px; font-size: 12px; padding: 4px 12px; background: #dbeafe; color: #1e40af; border-radius: 20px; font-weight: 500;"></span>
        </div>

        <p style="color: #6b7280; font-size: 13px; margin-bottom: 20px;">
          Desglose jerárquico organizado por estado de implementación
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
          ${['Pendiente', 'En Progreso', 'Completado', 'Bloqueado'].map(estado => {
            const subsForState = projectData.subdepartamentos.filter(s => s.estado === estado);
            const stateEmoji = { 'Pendiente': '📚', 'En Progreso': '🔄', 'Completado': '✅', 'Bloqueado': '🚫' }[estado];
            const stateBg = { 'Pendiente': '#f3f4f6', 'En Progreso': '#dbeafe', 'Completado': '#d1fae5', 'Bloqueado': '#fee2e2' }[estado];
            const stateColor = { 'Pendiente': '#6b7280', 'En Progreso': '#1e40af', 'Completado': '#065f46', 'Bloqueado': '#991b1b' }[estado];

            return `
            <div style="background: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden;">
              <div style="background: #f3f4f6; padding: 12px 16px; border-bottom: 2px solid #e5e7eb;">
                <div style="font-weight: 600; color: #1f2937; font-size: 13px;">${stateEmoji} ${estado}</div>
                <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">${subsForState.length} subdepartamento${subsForState.length !== 1 ? 's' : ''}</div>
              </div>
              <div style="padding: 12px; min-height: 300px;">
                ${subsForState.map(sub => {
                  const deptName = projectData.departamentos.find(d => d.id === sub.departamento_padre)?.nombre || 'Desconocido';
                  return `
                  <div data-subdept-id="${sub.id}" data-dept-parent="${sub.departamento_padre}" style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px; cursor: pointer;" onclick="window.openSubdeptPopup('${sub.id}')">
                    <div style="font-weight: 500; color: #1f2937; font-size: 13px;">${sub.nombre}</div>
                    <div style="color: #6b7280; font-size: 12px; margin-top: 4px;">← ${deptName}</div>
                    <div style="margin-top: 8px;">
                      <span style="display: inline-block; background: ${stateBg}; color: ${stateColor}; padding: 2px 8px; border-radius: 4px; font-size: 11px;">${estado}</span>
                    </div>
                  </div>
                  `;
                }).join('')}
              </div>
            </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Step Graph View - Dependency Graph -->
      <div id="step-graph" class="view-section">
        <div class="section-title">
          <span class="icon"></span>
          Grafo de Pasos y Dependencias
        </div>

        <p style="color: #6b7280; font-size: 13px; margin-bottom: 20px;">
          Flujo de procesos e interconexiones con dependencias
        </p>

        <!-- Dependency Graph SVG -->
        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; overflow-x: auto;">
          <svg viewBox="0 0 1000 600" style="min-width: 100%; height: auto; max-width: 100%;">
            <!-- Define Arrowheads -->
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="#9ca3af" />
              </marker>
              <marker id="arrowhead-active" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
              </marker>
            </defs>

            <!-- Connections/Arrows -->
            <!-- Start to Planning -->
            <path d="M 150 100 L 150 150" stroke="#9ca3af" stroke-width="2" fill="none" marker-end="url(#arrowhead)" />

            <!-- Planning to Analysis -->
            <path d="M 150 250 L 150 300" stroke="#3b82f6" stroke-width="2" fill="none" marker-end="url(#arrowhead-active)" />

            <!-- Analysis to Design & Development (parallel) -->
            <path d="M 140 400 Q 100 450, 60 480" stroke="#9ca3af" stroke-width="2" fill="none" marker-end="url(#arrowhead)" />
            <path d="M 160 400 Q 200 450, 240 480" stroke="#9ca3af" stroke-width="2" fill="none" marker-end="url(#arrowhead)" />

            <!-- Design to Testing -->
            <path d="M 310 500 Q 350 520, 390 500" stroke="#9ca3af" stroke-width="2" fill="none" marker-end="url(#arrowhead)" />

            <!-- Development to Testing -->
            <path d="M 240 500 Q 350 520, 390 500" stroke="#9ca3af" stroke-width="2" fill="none" marker-end="url(#arrowhead)" />

            <!-- Testing to Deployment -->
            <path d="M 470 480 L 550 350" stroke="#9ca3af" stroke-width="2" fill="none" marker-end="url(#arrowhead)" />

            <!-- Deployment to Release -->
            <path d="M 600 250 L 750 180" stroke="#9ca3af" stroke-width="2" fill="none" marker-end="url(#arrowhead)" />

            <!-- Nodes -->
            <!-- Start -->
            <circle cx="150" cy="100" r="30" fill="#10b981" stroke="#059669" stroke-width="2" />
            <text x="150" y="108" text-anchor="middle" fill="white" font-weight="bold" font-size="12">INICIO</text>

            <!-- Planning -->
            <rect x="100" y="150" width="100" height="60" rx="8" fill="#dbeafe" stroke="#3b82f6" stroke-width="2" />
            <text x="150" y="177" text-anchor="middle" fill="#1f2937" font-weight="600" font-size="12">Planificación</text>
            <text x="150" y="197" text-anchor="middle" fill="#6b7280" font-size="11">Reqs &amp; Scope</text>

            <!-- Analysis -->
            <rect x="100" y="300" width="100" height="60" rx="8" fill="#dbeafe" stroke="#3b82f6" stroke-width="2" />
            <text x="150" y="327" text-anchor="middle" fill="#1f2937" font-weight="600" font-size="12">Análisis</text>
            <text x="150" y="347" text-anchor="middle" fill="#6b7280" font-size="11">Detalles &amp; Design</text>

            <!-- Design -->
            <rect x="280" y="450" width="100" height="60" rx="8" fill="#f3f4f6" stroke="#9ca3af" stroke-width="2" />
            <text x="330" y="477" text-anchor="middle" fill="#1f2937" font-weight="600" font-size="12">Diseño</text>
            <text x="330" y="497" text-anchor="middle" fill="#6b7280" font-size="11">UX &amp; Arch</text>

            <!-- Development -->
            <rect x="210" y="450" width="100" height="60" rx="8" fill="#f3f4f6" stroke="#9ca3af" stroke-width="2" />
            <text x="260" y="477" text-anchor="middle" fill="#1f2937" font-weight="600" font-size="12">Desarrollo</text>
            <text x="260" y="497" text-anchor="middle" fill="#6b7280" font-size="11">Código &amp; Build</text>

            <!-- Testing -->
            <rect x="390" y="450" width="100" height="60" rx="8" fill="#fef3c7" stroke="#f59e0b" stroke-width="2" />
            <text x="440" y="477" text-anchor="middle" fill="#1f2937" font-weight="600" font-size="12">Testing</text>
            <text x="440" y="497" text-anchor="middle" fill="#6b7280" font-size="11">QA &amp; Bugs</text>

            <!-- Deployment -->
            <rect x="500" y="270" width="100" height="60" rx="8" fill="#f3f4f6" stroke="#9ca3af" stroke-width="2" />
            <text x="550" y="297" text-anchor="middle" fill="#1f2937" font-weight="600" font-size="12">Deploy</text>
            <text x="550" y="317" text-anchor="middle" fill="#6b7280" font-size="11">Staging &amp; Prod</text>

            <!-- Release -->
            <rect x="700" y="150" width="100" height="60" rx="8" fill="#d1fae5" stroke="#10b981" stroke-width="2" />
            <text x="750" y="177" text-anchor="middle" fill="#1f2937" font-weight="600" font-size="12">Release</text>
            <text x="750" y="197" text-anchor="middle" fill="#6b7280" font-size="11">Go Live</text>

            <!-- End -->
            <circle cx="850" cy="180" r="30" fill="#10b981" stroke="#059669" stroke-width="2" />
            <text x="850" y="188" text-anchor="middle" fill="white" font-weight="bold" font-size="12">FIN</text>
          </svg>
        </div>

        <!-- Legend -->
        <div style="margin-top: 20px; padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
          <div style="font-weight: 600; color: #1f2937; margin-bottom: 12px; font-size: 13px;">Leyenda:</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 24px; height: 24px; background: #dbeafe; border: 2px solid #3b82f6; border-radius: 4px;"></div>
              <span style="font-size: 12px; color: #6b7280;">Paso Activo</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 24px; height: 24px; background: #f3f4f6; border: 2px solid #9ca3af; border-radius: 4px;"></div>
              <span style="font-size: 12px; color: #6b7280;">Pendiente</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 24px; height: 24px; background: #fef3c7; border: 2px solid #f59e0b; border-radius: 4px;"></div>
              <span style="font-size: 12px; color: #6b7280;">En Progreso</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 24px; height: 24px; background: #d1fae5; border: 2px solid #10b981; border-radius: 4px;"></div>
              <span style="font-size: 12px; color: #6b7280;">Completado</span>
            </div>
          </div>
        </div>

        <!-- Dependencies Info -->
        <div style="margin-top: 20px; padding: 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
          <div style="font-weight: 600; color: #166534; margin-bottom: 8px; font-size: 13px;"> Análisis de Dependencias</div>
          <div style="color: #166534; font-size: 12px; line-height: 1.6;">
            • Diseño y Desarrollo pueden ejecutarse en paralelo<br>
            • Testing debe completarse antes del Deploy<br>
            • Deployment es prereq para Release<br>
            • Total de pasos: 7 | Camino crítico: 6 pasos
          </div>
        </div>
      </div>

    </div>
  </div>

  <script>
    // Make projectData globally accessible
    window.projectData = ${JSON.stringify(projectData)};

    // Mark department states based on firstBlocker (client-side only, sessionStorage available here)
    if (window.projectData && window.projectData.departamentos) {
      try {
        const firstBlockerJson = sessionStorage.getItem('firstBlocker');
        if (firstBlockerJson) {
          const firstBlocker = JSON.parse(firstBlockerJson);
          const primeraBlockerName = firstBlocker?.primer_bloqueador?.departamento;
          if (primeraBlockerName) {
            window.projectData.departamentos.forEach(dept => {
              dept.esPrimerBloqueador = dept.nombre === primeraBlockerName;
              dept.bloqueadoPor = dept.nombre === primeraBlockerName ? undefined : primeraBlockerName;
            });
            console.log('Marked department states - First blocker:', primeraBlockerName);
          }
        }
      } catch (e) {
        console.warn('Could not mark department states:', e);
      }
    }

    // Fallback: If no projectData from server, try to load from sessionStorage/localStorage
    if (!window.projectData || !window.projectData.departamentos || window.projectData.departamentos.length === 0) {
      const analysis = JSON.parse(sessionStorage.getItem('plannerAnalysis') || localStorage.getItem('plannerAnalysis') || 'null');
      if (analysis) {
        console.warn('No project data from server, loaded from storage. Analysis exists with phase5:', !!analysis.phase5);
        // Reload the page with the analysis stored, letting the server-side handler pick it up
        // We'll trigger a manual data load via API
        window.projectData = {
          proyecto: {
            nombre: analysis.jevPhase2?.modelo_negocio || 'Plan de Negocio',
            estado: 'Cargando desde almacenamiento...',
            semana: '1',
            totalSemanas: '24',
            metricas: { progreso: 0, desviacionTimeline: 0, desviacionPresupuesto: '-', riesgoGeneral: '-' }
          },
          departamentos: [],
          subdepartamentos: [],
          fases: [],
          hitos: [],
          agenda: { hoy: [], manana: [], proximosHitos: [] },
          pasos: []
        };
      } else {
        console.warn('No analysis data found in sessionStorage or localStorage');
      }
    }

    // Utility: Map PlannerAnalysis to visual data
    // Tab navigation
    document.querySelectorAll('.nav-button').forEach(button => {
      button.addEventListener('click', () => {
        const viewId = button.getAttribute('data-view');

        // Hide all sections
        document.querySelectorAll('.view-section').forEach(section => {
          section.classList.remove('active');
        });

        // Remove active class from all buttons
        document.querySelectorAll('.nav-button').forEach(btn => {
          btn.classList.remove('active');
        });

        // Show selected section
        const selectedSection = document.getElementById(viewId);
        if (selectedSection) {
          selectedSection.classList.add('active');
        }

        // Add active class to clicked button
        button.classList.add('active');
      });
    });

    // Metric popup buttons
    const metricBtns = document.querySelectorAll('.metric-btn');
    metricBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const metric = btn.getAttribute('data-metric');
        const popupId = 'popup-' + metric;
        const popup = document.getElementById(popupId);
        if (popup) {
          popup.classList.add('active');
        }
      });
    });

    // Close popups on background click
    document.querySelectorAll('.metric-popup').forEach(popup => {
      popup.addEventListener('click', (e) => {
        if (e.target === popup) {
          popup.classList.remove('active');
        }
      });
    });

    // Handle subdepartment filtering by department
    const deptNav = document.querySelector('[data-view=subdepartment]');
    if (deptNav) {
      deptNav.addEventListener('click', () => {
        setTimeout(() => {
          const filterTag = document.getElementById('dept-filter-tag');
          if (window.currentDeptFilter) {
            const deptName = projectData.departamentos.find(d => d.id === window.currentDeptFilter)?.nombre || 'Departamento';
            filterTag.textContent = 'Filtrado por: ' + deptName;
            filterTag.style.display = 'inline-block';

            // Hide/show subdepartments based on filter
            const allSubDepts = document.querySelectorAll('[data-subdept-id]');
            allSubDepts.forEach(el => {
              const deptId = el.getAttribute('data-dept-parent');
              el.style.display = deptId === window.currentDeptFilter ? 'block' : 'none';
            });
          } else {
            filterTag.style.display = 'none';
            const allSubDepts = document.querySelectorAll('[data-subdept-id]');
            allSubDepts.forEach(el => el.style.display = 'block');
          }
        }, 0);
      });
    }

    // Open subdepartment tasks popup
    window.openSubdeptPopup = function(subdeptId) {
      const popup = document.getElementById('popup-subdept');
      const title = document.getElementById('subdept-popup-title');
      const content = document.getElementById('subdept-popup-content');

      const subdept = window.projectData.subdepartamentos.find(s => s.id === subdeptId);
      if (!subdept) return;

      title.textContent = 'Tareas de ' + subdept.nombre;

      const tareas = subdept.tareas || [];

      if (tareas.length === 0) {
        content.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 40px 20px;">No hay tareas asignadas</p>';
      } else {
        let html = '';
        tareas.forEach((tarea, idx) => {
          const estado = tarea.estado || 'Pendiente';
          const estatoColors = {
            'Completado': { bg: '#d1fae5', color: '#065f46' },
            'En Progreso': { bg: '#dbeafe', color: '#1e40af' },
            'Pendiente': { bg: '#f3f4f6', color: '#6b7280' },
            'Bloqueado': { bg: '#fee2e2', color: '#991b1b' }
          };
          const colors = estatoColors[estado] || estatoColors['Pendiente'];

          html += '<div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">';
          html += '<div style="display: flex; justify-content: space-between; align-items: start; gap: 12px;">';
          html += '<div>';
          html += '<div style="font-weight: 600; color: #1f2937; font-size: 13px;">' + (idx + 1) + '. ' + (tarea.nombre || 'Tarea sin nombre') + '</div>';
          html += '<div style="color: #6b7280; font-size: 12px; margin-top: 6px; line-height: 1.5;">' + (tarea.descripcion || '') + '</div>';
          html += '</div>';
          html += '<span style="display: inline-block; background: ' + colors.bg + '; color: ' + colors.color + '; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 500; white-space: nowrap;">' + estado + '</span>';
          html += '</div>';

          if (tarea.pasos && tarea.pasos.length > 0) {
            html += '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">';
            html += '<div style="font-size: 11px; font-weight: 500; color: #6b7280; margin-bottom: 8px;">Pasos:</div>';
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px;">';
            tarea.pasos.forEach(paso => {
              html += '<div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; font-size: 11px; color: #6b7280;">' + paso + '</div>';
            });
            html += '</div>';
            html += '</div>';
          }

          html += '</div>';
        });
        content.innerHTML = html;
      }

      popup.classList.add('active');
    };

  </script>
</body>
</html>`;
}
