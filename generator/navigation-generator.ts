/**
 * Generador de Navegación basado en perfil de negocio.
 * Deduce qué áreas y pantallas mostrar en el sidebar.
 */

import type { GeneratorInput } from "./types.js";
import { decidirModulos, moduloActivo } from "./rules/modules.js";

/**
 * Pantalla dentro de un área.
 */
export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly path: string;
  readonly activo: boolean;
  readonly razon?: string;
}

/**
 * Área agrupable (seccion colapsable en el sidebar).
 */
export interface NavArea {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly items: NavItem[];
  readonly activo: boolean;
  readonly expandidoPorDefecto: boolean;
}

/**
 * Especificación generada de navegación.
 */
export interface NavigationSpec {
  readonly caseId: string;
  readonly areas: NavArea[];
  readonly itemsGlobales: NavItem[];
}

/**
 * Deduce las áreas de operación según el perfil.
 */
function deduceAreaOperacion(input: GeneratorInput): NavArea {
  const items: NavItem[] = [];

  // Dashboard: siempre
  items.push({
    id: "dashboard",
    label: "Dashboard",
    icon: "📊",
    path: "/dashboard",
    activo: true,
    razon: "Visibility consolidada",
  });

  // Dinero: siempre
  items.push({
    id: "dinero",
    label: "Dinero",
    icon: "💰",
    path: "/dinero",
    activo: true,
    razon: "Cobros y pagos",
  });

  // Ventas
  if (moduloActivo(input, "catalogo")) {
    items.push({
      id: "ventas",
      label: "Ventas",
      icon: "🛒",
      path: "/ventas",
      activo: true,
      razon: "Gestión de catálogo y pedidos",
    });
  }

  // Stock
  if (moduloActivo(input, "stock")) {
    items.push({
      id: "inventario",
      label: "Inventario",
      icon: "📦",
      path: "/inventario",
      activo: true,
      razon: "Control de stock",
    });
  }

  // Facturas
  if (moduloActivo(input, "facturas")) {
    items.push({
      id: "facturas",
      label: "Facturas",
      icon: "📋",
      path: "/facturas",
      activo: true,
      razon: "Documentos fiscales",
    });
  }

  // Crédito
  if (moduloActivo(input, "credito")) {
    items.push({
      id: "credito",
      label: "Crédito",
      icon: "📊",
      path: "/credito",
      activo: true,
      razon: "Ventas a plazo",
    });
  }

  // Cuotas/Suscripciones
  if (moduloActivo(input, "cuotas")) {
    items.push({
      id: "cuotas",
      label: "Cuotas",
      icon: "🔄",
      path: "/cuotas",
      activo: true,
      razon: "Ingresos recurrentes",
    });
  }

  // Fianzas
  if (moduloActivo(input, "fianzas")) {
    items.push({
      id: "fianzas",
      label: "Fianzas",
      icon: "🏦",
      path: "/fianzas",
      activo: true,
      razon: "Dinero retenido",
    });
  }

  return {
    id: "operacion",
    label: "Operación",
    icon: "⚙️",
    items,
    activo: items.length > 0,
    expandidoPorDefecto: true,
  };
}

/**
 * Deduce las áreas empresariales según el perfil.
 */
function deduceAreasEmpresa(input: GeneratorInput): NavArea[] {
  const areas: NavArea[] = [];

  // Área: Documentos & Cumplimiento
  if (input.hasFiscalCompliance || input.hasFormalDocuments) {
    areas.push({
      id: "documentos",
      label: "Documentos",
      icon: "📄",
      items: [
        {
          id: "documentos-legales",
          label: "Documentos Legales",
          icon: "📑",
          path: "/documentos/legales",
          activo: true,
        },
        {
          id: "compliance",
          label: "Cumplimiento",
          icon: "✅",
          path: "/documentos/compliance",
          activo: input.hasFiscalCompliance,
        },
      ],
      activo: true,
      expandidoPorDefecto: false,
    });
  }

  // Área: Marketing & Visibilidad
  if (input.channels.includes("publico") || input.channels.includes("web")) {
    areas.push({
      id: "marketing",
      label: "Marketing",
      icon: "📢",
      items: [
        {
          id: "landing",
          label: "Landing Page",
          icon: "🌐",
          path: "/marketing/landing",
          activo: true,
        },
        {
          id: "seo",
          label: "SEO",
          icon: "📈",
          path: "/marketing/seo",
          activo: true,
        },
        {
          id: "analytics",
          label: "Analytics",
          icon: "📊",
          path: "/marketing/analytics",
          activo: true,
        },
      ],
      activo: true,
      expandidoPorDefecto: false,
    });
  }

  // Área: Reputación & Clientes
  if (moduloActivo(input, "portal") || moduloActivo(input, "clientes")) {
    areas.push({
      id: "reputacion",
      label: "Reputación",
      icon: "⭐",
      items: [
        {
          id: "resenas",
          label: "Reseñas",
          icon: "⭐",
          path: "/reputacion/resenas",
          activo: moduloActivo(input, "portal"),
        },
        {
          id: "nps",
          label: "NPS & Feedback",
          icon: "💬",
          path: "/reputacion/nps",
          activo: moduloActivo(input, "clientes"),
        },
      ],
      activo: true,
      expandidoPorDefecto: false,
    });
  }

  // Área: Procesos & SLA
  if (input.lifecycles.length > 1 || input.resourceSubtypes.length > 0) {
    areas.push({
      id: "procesos",
      label: "Procesos",
      icon: "⚙️",
      items: [
        {
          id: "flujos",
          label: "Flujos de Trabajo",
          icon: "🔄",
          path: "/procesos/flujos",
          activo: true,
        },
        {
          id: "sla",
          label: "SLA & Alertas",
          icon: "🚨",
          path: "/procesos/sla",
          activo: true,
        },
        {
          id: "cambios",
          label: "Log de Cambios",
          icon: "📝",
          path: "/procesos/cambios",
          activo: true,
        },
      ],
      activo: true,
      expandidoPorDefecto: false,
    });
  }

  // Área: Equipo & Configuración
  areas.push({
    id: "empresa",
    label: "Empresa",
    icon: "👥",
    items: [
      {
        id: "equipo",
        label: "Equipo",
        icon: "👥",
        path: "/empresa/equipo",
        activo: true,
      },
      {
        id: "roles",
        label: "Roles & Permisos",
        icon: "🔐",
        path: "/empresa/roles",
        activo: true,
      },
      {
        id: "configuracion",
        label: "Configuración",
        icon: "⚙️",
        path: "/empresa/configuracion",
        activo: true,
      },
    ],
    activo: true,
    expandidoPorDefecto: false,
  });

  return areas.filter((a) => a.activo);
}

/**
 * Genera la especificación completa de navegación.
 */
export function generateNavigationSpec(input: GeneratorInput): NavigationSpec {
  const areaOperacion = deduceAreaOperacion(input);
  const areasEmpresa = deduceAreasEmpresa(input);

  const todasLasAreas = [areaOperacion, ...areasEmpresa].filter(
    (a) => a.items.length > 0,
  );

  return {
    caseId: input.caseId,
    areas: todasLasAreas,
    itemsGlobales: [
      {
        id: "inicio",
        label: "Inicio",
        icon: "🏠",
        path: "/",
        activo: true,
      },
    ],
  };
}
