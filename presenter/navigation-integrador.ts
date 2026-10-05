/**
 * Integrador de Navegación en el Presenter.
 * Orquesta la generación de la navegación desde GeneratorInput.
 */

import type { GeneratorInput } from "../generator/types.js";
import { generateNavigationSpec, type NavigationSpec, type NavArea, type NavItem } from "../generator/navigation-generator.js";

/**
 * Estructura renderizable de la navegación.
 * Listo para consumir en la UI del sidebar.
 */
export interface NavigationPresentation {
  readonly titulo: string;
  readonly areas: Array<{
    readonly id: string;
    readonly label: string;
    readonly icon: string;
    readonly expandido: boolean;
    readonly items: Array<{
      readonly id: string;
      readonly label: string;
      readonly icon: string;
      readonly path: string;
      readonly activo: boolean;
    }>;
  }>;
  readonly itemsGlobales: Array<{
    readonly id: string;
    readonly label: string;
    readonly icon: string;
    readonly path: string;
  }>;
}

/**
 * Renderiza la navegación generada a un formato presentable.
 */
export function renderizarNavigation(spec: NavigationSpec, userRole?: string): NavigationPresentation {
  return {
    titulo: "Navegación",
    areas: spec.areas.map((area) => ({
      id: area.id,
      label: area.label,
      icon: area.icon,
      expandido: area.expandidoPorDefecto,
      items: area.items.map((item) => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        path: item.path,
        activo: item.activo,
      })),
    })),
    itemsGlobales: spec.itemsGlobales.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      path: item.path,
    })),
  };
}

/**
 * Genera la navegación para un caso de negocio.
 */
export function generarNavigacionPara(input: GeneratorInput, userRole?: string): NavigationPresentation {
  const spec = generateNavigationSpec(input);
  return renderizarNavigation(spec, userRole);
}

/**
 * Filtra la navegación según el rol del usuario.
 * Por defecto, muestra todo; los roles pueden restringir.
 */
export function filtrarNavigacionPorRol(
  nav: NavigationPresentation,
  rolId: string,
  permisosRol: Set<string>,
): NavigationPresentation {
  return {
    ...nav,
    areas: nav.areas
      .map((area) => ({
        ...area,
        items: area.items.filter(
          (item) =>
            permisosRol.has(item.path) || permisosRol.has(area.id),
        ),
      }))
      .filter((area) => area.items.length > 0),
  };
}

/**
 * Predefiniciones de permisos por rol.
 * Mapea roles comunes a qué áreas/items pueden ver.
 */
export const PERMISOS_POR_ROL: Record<string, Set<string>> = {
  "admin": new Set([
    // Todo acceso
    "/", // inicio
    "/dashboard",
    "/dinero",
    "/ventas",
    "/inventario",
    "/facturas",
    "/credito",
    "/cuotas",
    "/fianzas",
    "/documentos",
    "/marketing",
    "/reputacion",
    "/procesos",
    "/empresa",
  ]),
  "gerente": new Set([
    "/",
    "/dashboard",
    "/dinero",
    "/ventas",
    "/inventario",
    "/facturas",
    "/documentos/compliance",
    "/marketing/analytics",
    "/reputacion",
    "/procesos/sla",
    "/empresa",
  ]),
  "vendedor": new Set([
    "/",
    "/ventas",
    "/dinero",
    "/clientes",
  ]),
  "almacenero": new Set([
    "/",
    "/inventario",
    "/dinero", // básico
  ]),
  "marketing": new Set([
    "/",
    "/marketing",
    "/reputacion",
    "/analytics",
  ]),
  "cliente": new Set([
    "/",
    "/reputacion/resenas",
  ]),
};

/**
 * Aplica permisos automáticos según el rol.
 */
export function aplicarPermisosRol(
  nav: NavigationPresentation,
  rolId: string,
): NavigationPresentation {
  const permisos = PERMISOS_POR_ROL[rolId] ?? new Set();
  return filtrarNavigacionPorRol(nav, rolId, permisos);
}

/**
 * Ejemplo de uso en el presenter:
 *
 * ```typescript
 * const input: GeneratorInput = { ... };
 * const userRole = "gerente";
 *
 * const nav = generarNavigacionPara(input, userRole);
 * const navFiltrada = aplicarPermisosRol(nav, userRole);
 *
 * // → navFiltrada se envía al sidebar
 * ```
 */
