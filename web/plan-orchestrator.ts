/**
 * Plan Orchestrator: Determines sequential execution order for department agents
 */

interface DepartmentAgentTask {
  posicion: number;
  departamento: string;
  razon: string;
  informacion_pendiente: "Alta" | "Media" | "Baja";
  dependencias: string[];
  estado: "SIGUIENTE" | "En espera" | "Pendiente";
}

interface OrchestratorOutput {
  fase: number;
  orden_secuencial: DepartmentAgentTask[];
  cola_ejecucion: DepartmentAgentTask[];
  proxima_tarea: DepartmentAgentTask | null;
}

const DEPARTMENT_DEPENDENCIES: Record<string, string[]> = {
  "Legal & Compliance": [],
  "Infraestructura": ["Legal & Compliance"],
  "Finanzas": ["Legal & Compliance"],
  "RRHH": ["Finanzas"],
  "Operativo": ["RRHH", "Infraestructura"],
  "Sanidad": ["Legal & Compliance", "Operativo"],
  "Producto": ["Operativo"],
  "Compras/Proveedores": ["Producto"],
  "Tecnología": ["Operativo"],
  "Logística": ["Tecnología", "Compras/Proveedores"],
  "Ventas": ["Operativo", "Producto"],
  "Marca": ["Ventas"],
};

const BLOCKER_INDICATORS: Record<string, boolean> = {
  "Legal & Compliance": true,
  "Infraestructura": true,
  "Finanzas": true,
  "RRHH": true,
  "Operativo": true,
  "Sanidad": true,
  "Producto": false,
  "Compras/Proveedores": false,
  "Tecnología": false,
  "Logística": false,
  "Ventas": false,
  "Marca": false,
};

function topologicalSort(departments: string[]): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(dept: string) {
    if (visited.has(dept)) return;
    if (visiting.has(dept)) return; // Cycle detection

    visiting.add(dept);

    const deps = DEPARTMENT_DEPENDENCIES[dept] || [];
    deps.forEach((dep) => {
      if (departments.includes(dep)) {
        visit(dep);
      }
    });

    visiting.delete(dept);
    visited.add(dept);
    sorted.push(dept);
  }

  departments.forEach((dept) => visit(dept));
  return sorted;
}

export function orchestratePlan(departments: string[], businessContext: {
  sector: string;
  timeline: string;
  presupuesto: string;
  equipo: string;
}): OrchestratorOutput {
  const orderedDepts = topologicalSort(departments);

  const tareas: DepartmentAgentTask[] = orderedDepts.map((dept, index) => {
    const deps = DEPARTMENT_DEPENDENCIES[dept] || [];
    const isBlocker = BLOCKER_INDICATORS[dept];
    const dependenciasActivas = deps.filter((d) => departments.includes(d));

    let informacionPendiente: "Alta" | "Media" | "Baja" = "Media";
    if (isBlocker) {
      informacionPendiente = "Alta";
    } else if (["Ventas", "Marketing"].includes(dept)) {
      informacionPendiente = "Baja";
    }

    return {
      posicion: index + 1,
      departamento: dept,
      razon: isBlocker
        ? `BLOQUEADOR: ${dept} es crítico para avanzar`
        : `DEPENDENCIA: Necesita ${dependenciasActivas.join(", ")}`,
      informacion_pendiente: informacionPendiente,
      dependencias: dependenciasActivas,
      estado: index === 0 ? "SIGUIENTE" : index < 3 ? "En espera" : "Pendiente",
    };
  });

  return {
    fase: 7,
    orden_secuencial: tareas,
    cola_ejecucion: tareas.slice(0, 3), // Next 3 in queue
    proxima_tarea: tareas[0] || null,
  };
}

export type { DepartmentAgentTask, OrchestratorOutput };
