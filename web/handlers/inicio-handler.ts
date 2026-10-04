/**
 * Hub de Inicio Handler
 * ─────────────────────
 * Genera la especificación completa del dashboard inicial (HubDashboardSpec)
 * basada en UiSpec, roles del usuario, y permisos.
 *
 * Responsabilidades:
 * - Validar roles disponibles
 * - Generar tarjetas de procesos visibles
 * - Generar acciones rápidas según permisos
 * - Generar widgets de resumen según rol
 * - Validar permisos en servidor (seguridad)
 * - Servir HTML del dashboard
 */

import { readFileSync } from "fs";
import { join } from "path";
import type {
  HubDashboardSpec,
  ProcessCardSpec,
  QuickActionSpec,
  RoleInfo,
  SummaryWidgetSpec,
  UiSpec,
} from "../../presentation/types.js";
import { processGroupsForRole } from "../visibility.js";
import type { AppRuntime } from "../runtime.js";

/**
 * Información de permisos por rol (mapeo simple para demostración).
 * En producción, esto vendría de la capa de autenticación/autorización.
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  gerente: [
    "pedidos.ver",
    "pedidos.crear",
    "pedidos.editar",
    "inventario.ver",
    "inventario.editar",
    "facturas.ver",
    "facturas.crear",
    "reportes.ver",
    "usuarios.ver",
    "usuarios.editar",
  ],
  operario: ["pedidos.ver", "inventario.ver", "agenda.ver", "clientes.ver"],
  logistica: [
    "pedidos.ver",
    "inventario.ver",
    "inventario.editar",
    "envios.ver",
    "envios.editar",
  ],
  contabilidad: ["facturas.ver", "facturas.crear", "reportes.ver", "dinero.ver"],
  atencion_cliente: ["clientes.ver", "pedidos.ver", "clientes.editar"],
};

/**
 * Descripción de roles para mostrar en UI.
 */
const ROLE_DESCRIPTIONS: Record<string, string> = {
  gerente: "Acceso completo a todos los procesos del negocio",
  operario: "Acceso a operaciones básicas",
  logistica: "Gestión de inventario y envíos",
  contabilidad: "Gestión de facturación y reportes",
  atencion_cliente: "Gestión de clientes y atención al cliente",
};

/**
 * Mapeo de procesos (lifecycle) a iconos y descripciones.
 */
const PROCESS_META: Record<
  string,
  {
    icon: string;
    description: string;
    priority: number;
    requiredPermissions: string[];
  }
> = {
  pedidos: {
    icon: "📦",
    description: "Gestión de pedidos y órdenes",
    priority: 90,
    requiredPermissions: ["pedidos.ver"],
  },
  inventario: {
    icon: "📊",
    description: "Control de stock e inventario",
    priority: 80,
    requiredPermissions: ["inventario.ver"],
  },
  agenda: {
    icon: "📅",
    description: "Citas y disponibilidad",
    priority: 75,
    requiredPermissions: ["agenda.ver"],
  },
  clientes: {
    icon: "👥",
    description: "Gestión de clientes y proveedores",
    priority: 70,
    requiredPermissions: ["clientes.ver"],
  },
  facturas: {
    icon: "🧾",
    description: "Facturación y cobros",
    priority: 65,
    requiredPermissions: ["facturas.ver"],
  },
  cuotas: {
    icon: "💳",
    description: "Gestión de suscripciones y cuotas",
    priority: 60,
    requiredPermissions: ["cuotas.ver"],
  },
  reportes: {
    icon: "📈",
    description: "Reportes y análisis del negocio",
    priority: 50,
    requiredPermissions: ["reportes.ver"],
  },
};

/**
 * Sirve el HTML del dashboard de inicio.
 * Lee el archivo template y lo devuelve.
 *
 * @returns Contenido HTML del dashboard
 */
export function getHubDashboardHTML(): string {
  try {
    const templatePath = join(process.cwd(), "web", "templates", "inicio.html");
    return readFileSync(templatePath, "utf-8");
  } catch (error) {
    console.error("Error reading inicio.html template:", error);
    return "<h1>Error loading dashboard</h1>";
  }
}

/**
 * Inyecta datos dinámicos en el HTML del dashboard.
 * Los datos se insertan como JSON en un script para que JavaScript los renderice.
 *
 * @param spec - UiSpec cargada
 * @param userId - ID del usuario
 * @param roleId - Rol del usuario
 * @param userName - Nombre del usuario
 * @param runtime - AppRuntime para acceso a datos reales
 * @returns HTML con datos inyectados
 */
export function renderHubDashboardWithData(
  spec: UiSpec,
  userId: string,
  roleId: string,
  userName: string,
  runtime?: AppRuntime
): string {
  // Generar datos dinámicos
  const dashboardData = bootHubDashboard(spec, userId, roleId, `session-${Date.now()}`, runtime);

  // Obtener HTML template
  const html = getHubDashboardHTML();

  // Inyectar datos como JSON en el HTML
  const dataScript = `<script>
    window.DASHBOARD_DATA = ${JSON.stringify({
      user: {
        id: userId,
        name: userName,
        roleId: roleId,
        role: dashboardData.currentRole,
      },
      actions: dashboardData.quickActions,
      summary: dashboardData.summary,
      availableRoles: dashboardData.availableRoles,
      processCards: dashboardData.processCards,
    })};
  </script>`;

  // Insertar script antes del cierre del body
  return html.replace("</body>", `${dataScript}</body>`);
}

/**
 * Función principal: genera el HubDashboardSpec completo.
 *
 * @param spec - UiSpec cargada
 * @param userId - ID del usuario actual
 * @param roleId - Rol actual seleccionado
 * @param sessionId - ID de sesión para auditoria
 * @param runtime - AppRuntime para datos reales (opcional)
 * @returns HubDashboardSpec con todos los elementos del dashboard
 */
export function bootHubDashboard(
  spec: UiSpec,
  userId: string,
  roleId: string,
  sessionId: string,
  runtime?: AppRuntime
): HubDashboardSpec {
  // Validar que el rol existe y está disponible
  const availableRoles = generateAvailableRoles(spec);
  let currentRole = availableRoles.find((r) => r.roleId === roleId);

  // Si el rol no está en availableRoles pero fue validado en el servidor,
  // crear un rol genérico basado en los permisos conocidos
  if (!currentRole) {
    currentRole = {
      roleId,
      label: formatRoleLabel(roleId),
      permissions: ROLE_PERMISSIONS[roleId] ?? [],
      description: ROLE_DESCRIPTIONS[roleId],
    } as RoleInfo;
  }

  // Generar elementos del dashboard
  const processCards = generateProcessCards(spec, currentRole as RoleInfo, availableRoles);
  const quickActions = generateQuickActions(spec, currentRole as RoleInfo, processCards);
  const summary = generateSummaryWidgets(currentRole as RoleInfo, processCards, runtime);

  return {
    userId,
    sessionId,
    generatedAt: new Date().toISOString(),
    currentRole,
    availableRoles,
    processCards,
    quickActions,
    summary,
    auxiliaryLinks: generateAuxiliaryLinks(spec),
  };
}

/**
 * Genera lista de roles disponibles con sus permisos.
 *
 * @param spec - UiSpec que contiene definición de roles
 * @returns Array de RoleInfo disponibles
 */
function generateAvailableRoles(spec: UiSpec): readonly RoleInfo[] {
  // Extraer roles únicos de ProcessGroupSpec
  const roleIds = new Set<string>();

  if (spec.processGroups) {
    for (const group of spec.processGroups) {
      for (const rid of group.roleIds) {
        roleIds.add(rid);
      }
    }
  }

  // Mapear a RoleInfo completo
  return Array.from(roleIds).map((roleId) => ({
    roleId,
    label: formatRoleLabel(roleId),
    permissions: ROLE_PERMISSIONS[roleId] ?? [],
    description: ROLE_DESCRIPTIONS[roleId] ?? undefined,
  })) as readonly RoleInfo[];
}

/**
 * Genera tarjetas de procesos visibles para el rol actual.
 * Filtra por permisos y ordena por prioridad.
 *
 * @param spec - UiSpec
 * @param currentRole - Rol actual
 * @param allRoles - Todos los roles disponibles
 * @returns Array de ProcessCardSpec visibles
 */
function generateProcessCards(
  spec: UiSpec,
  currentRole: RoleInfo,
  allRoles: readonly RoleInfo[]
): readonly ProcessCardSpec[] {
  const userPermissions = new Set(currentRole.permissions);
  const cards: ProcessCardSpec[] = [];

  // Obtener procesos accesibles para el rol
  const groups = processGroupsForRole(spec, currentRole.roleId);

  for (const group of groups) {
    const lifecycleId = group.lifecycleId;
    const meta = PROCESS_META[lifecycleId];

    if (!meta) {
      // Procesos no documentados se incluyen con permisos permisivos
      cards.push({
        id: `process:${lifecycleId}`,
        lifecycleId,
        label: formatProcessLabel(lifecycleId),
        icon: "⚙️",
        description: "Proceso del negocio",
        href: `/proceso/${lifecycleId}`,
        isVisible: true,
        isEnabled: true,
        requiredPermissions: [],
        priority: 50,
      });
    } else {
      // Verificar si el usuario tiene permisos para ver este proceso
      const hasPermission = meta.requiredPermissions.every((perm) =>
        userPermissions.has(perm)
      );

      if (hasPermission) {
        const processCount = getProcessCount(lifecycleId, currentRole.roleId);
        cards.push({
          id: `process:${lifecycleId}`,
          lifecycleId,
          label: formatProcessLabel(lifecycleId),
          icon: meta.icon,
          description: meta.description,
          href: `/proceso/${lifecycleId}`,
          isVisible: true,
          isEnabled: true,
          requiredPermissions: meta.requiredPermissions,
          priority: meta.priority,
          ...(processCount !== undefined && { count: processCount }),
        });
      }
    }
  }

  // Ordenar por prioridad (mayor primero)
  return cards.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Genera acciones rápidas contextuales basadas en procesos visibles.
 *
 * @param spec - UiSpec
 * @param currentRole - Rol actual
 * @param processCards - Tarjetas de procesos disponibles
 * @returns Array de QuickActionSpec
 */
function generateQuickActions(
  spec: UiSpec,
  currentRole: RoleInfo,
  processCards: readonly ProcessCardSpec[]
): readonly QuickActionSpec[] {
  const actions: QuickActionSpec[] = [];
  const userPermissions = new Set(currentRole.permissions);
  let order = 0;

  // Acción "Nuevo Pedido" si tiene permiso
  if (userPermissions.has("pedidos.crear")) {
    actions.push({
      id: "quick:nuevo-pedido",
      label: "Nuevo Pedido",
      icon: "➕",
      href: "/pedidos/nuevo",
      requiredPermissions: ["pedidos.crear"],
      order: order++,
    });
  }

  // Acción "Consultar Stock" si tiene permiso
  if (userPermissions.has("inventario.ver")) {
    actions.push({
      id: "quick:consultar-stock",
      label: "Consultar Stock",
      icon: "🔍",
      href: "/inventario/consultar",
      requiredPermissions: ["inventario.ver"],
      order: order++,
    });
  }

  // Acción "Crear Factura" si tiene permiso
  if (userPermissions.has("facturas.crear")) {
    actions.push({
      id: "quick:nueva-factura",
      label: "Nueva Factura",
      icon: "📝",
      href: "/facturas/nueva",
      requiredPermissions: ["facturas.crear"],
      order: order++,
    });
  }

  // Acción "Ver Reportes" si tiene permiso
  if (userPermissions.has("reportes.ver")) {
    actions.push({
      id: "quick:ver-reportes",
      label: "Reportes",
      icon: "📊",
      href: "/reportes",
      requiredPermissions: ["reportes.ver"],
      order: order++,
    });
  }

  // Acción "Gestionar Usuarios" si es gerente
  if (userPermissions.has("usuarios.editar")) {
    actions.push({
      id: "quick:gestionar-usuarios",
      label: "Usuarios",
      icon: "👨‍💼",
      href: "/usuarios",
      requiredPermissions: ["usuarios.editar"],
      order: order++,
    });
  }

  return actions;
}

/**
 * Genera widgets de resumen/métricas según el rol.
 * Muestra KPIs importantes para el negocio.
 *
 * @param currentRole - Rol actual
 * @param processCards - Procesos disponibles
 * @param runtime - AppRuntime para datos reales (opcional)
 * @returns Array de SummaryWidgetSpec
 */
function generateSummaryWidgets(
  currentRole: RoleInfo,
  processCards: readonly ProcessCardSpec[],
  runtime?: AppRuntime
): readonly SummaryWidgetSpec[] {
  const widgets: SummaryWidgetSpec[] = [];
  const userPermissions = new Set(currentRole.permissions);

  // Widget: Ventas del día (si tiene permiso)
  if (userPermissions.has("pedidos.ver") || userPermissions.has("facturas.ver")) {
    let ventasHoy = "$2,450"; // default
    if (runtime) {
      try {
        const expedientes = runtime.expedientesDinero();
        const hoy = new Date();
        const today = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        const salesTotal = expedientes
          .filter(e => {
            const eDate = new Date((e as any).fecha || 0);
            const eToday = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
            return eToday.getTime() === today.getTime() && (e as any).estadoId !== "anulado";
          })
          .reduce((sum, e) => sum + ((e as any).totalCentimos || 0), 0);
        ventasHoy = `$${(salesTotal / 100).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
      } catch (e) {
        console.error("Error calculating sales:", e);
      }
    }
    widgets.push({
      id: "widget:ventas-hoy",
      label: "Ventas Hoy",
      value: ventasHoy,
      trend: "up",
      icon: "💰",
      colorSemantic: "success",
      requiredPermissions: ["pedidos.ver"],
    });
  }

  // Widget: Pedidos Pendientes (si tiene permiso)
  if (userPermissions.has("pedidos.ver")) {
    let pedidosPendientes = "8"; // default
    if (runtime) {
      try {
        const expedientes = runtime.expedientesDinero();
        const pending = expedientes.filter((e: any) =>
          e.lifecycleId === "pedidos" &&
          ["pendiente", "en_proceso"].includes(e.situacion)
        ).length;
        pedidosPendientes = pending.toString();
      } catch (e) {
        console.error("Error calculating pending orders:", e);
      }
    }
    widgets.push({
      id: "widget:pedidos-pendientes",
      label: "Pedidos Pendientes",
      value: pedidosPendientes,
      trend: "stable",
      icon: "📦",
      colorSemantic: "warning",
      requiredPermissions: ["pedidos.ver"],
    });
  }

  // Widget: Stock Crítico (si tiene permiso)
  if (userPermissions.has("inventario.ver")) {
    widgets.push({
      id: "widget:stock-critico",
      label: "Stock Crítico",
      value: "3 productos",
      trend: "down",
      icon: "⚠️",
      colorSemantic: "danger",
      requiredPermissions: ["inventario.ver"],
    });
  }

  // Widget: Clientes Activos (si tiene permiso)
  if (userPermissions.has("clientes.ver")) {
    let clientesActivos = "156"; // default
    if (runtime) {
      try {
        const expedientes = runtime.expedientesDinero();
        const uniqueClients = new Set(expedientes.map((e: any) => e.parteId)).size;
        clientesActivos = uniqueClients.toString();
      } catch (e) {
        console.error("Error calculating active clients:", e);
      }
    }
    widgets.push({
      id: "widget:clientes-activos",
      label: "Clientes Activos",
      value: clientesActivos,
      trend: "up",
      icon: "👥",
      colorSemantic: "info",
      requiredPermissions: ["clientes.ver"],
    });
  }

  // Widget: Facturas Pendientes (si tiene permiso)
  if (userPermissions.has("facturas.ver")) {
    let factunasPendientes = "12"; // default
    if (runtime) {
      try {
        const expedientes = runtime.expedientesDinero();
        const unpaid = expedientes.filter((e: any) =>
          e.lifecycleId === "facturas" && e.situacion === "impagada"
        ).length;
        factunasPendientes = unpaid.toString();
      } catch (e) {
        console.error("Error calculating pending invoices:", e);
      }
    }
    widgets.push({
      id: "widget:facturas-pendientes",
      label: "Facturas Pendientes",
      value: factunasPendientes,
      trend: "stable",
      icon: "🧾",
      colorSemantic: "warning",
      requiredPermissions: ["facturas.ver"],
    });
  }

  return widgets;
}

/**
 * Genera enlaces auxiliares adicionales según el rol.
 * Links de navegación secundaria.
 */
function generateAuxiliaryLinks(spec: UiSpec) {
  return [
    {
      id: "link:ayuda",
      label: "Ayuda",
      href: "/ayuda",
      icon: "❓",
    },
    {
      id: "link:documentacion",
      label: "Documentación",
      href: "/docs",
      icon: "📚",
    },
    {
      id: "link:soporte",
      label: "Soporte",
      href: "mailto:soporte@empresa.com",
      icon: "💬",
    },
  ];
}

/**
 * Obtiene conteo de items para un proceso específico.
 * En producción, esto vendría de queries a base de datos.
 */
function getProcessCount(lifecycleId: string, roleId: string): number | undefined {
  // Datos de ejemplo
  const counts: Record<string, Record<string, number>> = {
    pedidos: {
      gerente: 15,
      operario: 8,
      logistica: 12,
    },
    facturas: {
      gerente: 5,
      contabilidad: 12,
    },
    agenda: {
      operario: 6,
    },
  };

  return counts[lifecycleId]?.[roleId];
}

/**
 * Formatea etiqueta de rol para mostrar.
 * "gerente" → "Gerente", "atencion_cliente" → "Atención al Cliente"
 */
function formatRoleLabel(roleId: string): string {
  return roleId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Formatea etiqueta de proceso para mostrar.
 * "pedidos" → "Pedidos", "inventario" → "Inventario"
 */
function formatProcessLabel(lifecycleId: string): string {
  return lifecycleId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Valida que un usuario tenga permisos para acceder a un proceso.
 * Se ejecuta en servidor (validación de seguridad).
 */
export function hasPermissionForProcess(
  processId: string,
  userPermissions: Set<string>
): boolean {
  const meta = PROCESS_META[processId];
  if (!meta) return false; // Proceso no existe
  return meta.requiredPermissions.every((perm) => userPermissions.has(perm));
}

/**
 * Valida que un usuario tenga permisos para una acción rápida.
 */
export function hasPermissionForAction(
  actionId: string,
  userPermissions: Set<string>
): boolean {
  const permissions: Record<string, string[]> = {
    "quick:nuevo-pedido": ["pedidos.crear"],
    "quick:consultar-stock": ["inventario.ver"],
    "quick:nueva-factura": ["facturas.crear"],
    "quick:ver-reportes": ["reportes.ver"],
    "quick:gestionar-usuarios": ["usuarios.editar"],
  };

  const required = permissions[actionId];
  if (!required) return false;
  return required.every((perm) => userPermissions.has(perm));
}
