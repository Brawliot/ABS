/**
 * Handler de Navegación Generada
 * Integra generateNavigationSpec y generateDashboardSpec en el dashboard.
 * Reemplaza datos hardcodeados con especificaciones generadas.
 */

import type { GeneratorInput } from "../../generator/types.js";
import { generateNavigationSpec } from "../../generator/navigation-generator.js";
import { generateDashboardSpec } from "../../generator/dashboard-generator.js";
import { generarNavigacionPara, aplicarPermisosRol } from "../../presenter/navigation-integrador.js";
import { generarDashboardPara } from "../../presenter/dashboard-integrador.js";
import type { DashboardContext } from "../../presenter/dashboard-integrador.js";

/**
 * Datos de inicialización para la interfaz.
 * Combina navegación generada + dashboard generado.
 */
export interface GeneratedUIData {
  readonly navigation: ReturnType<typeof generarNavigacionPara>;
  readonly dashboard: ReturnType<typeof generarDashboardPara>;
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly role: string;
  };
}

/**
 * Genera datos dinámicos de UI basados en GeneratorInput.
 *
 * @param input - Perfil del negocio
 * @param userId - ID del usuario
 * @param roleId - Rol del usuario
 * @param userName - Nombre del usuario
 * @param dashboardContext - Datos para el dashboard (KPIs, histórico, etc.)
 * @returns Datos para inyectar en el HTML
 */
export function generateUIDataFromProfile(
  input: GeneratorInput,
  userId: string,
  roleId: string,
  userName: string,
  dashboardContext: DashboardContext,
): GeneratedUIData {
  // 1. Generar navegación
  const nav = generarNavigacionPara(input, roleId);
  const navFiltrada = aplicarPermisosRol(nav, roleId);

  // 2. Generar dashboard
  const dashboard = generarDashboardPara(dashboardContext);

  return {
    navigation: navFiltrada,
    dashboard,
    user: {
      id: userId,
      name: userName,
      role: roleId,
    },
  };
}

/**
 * Inyecta datos generados en el HTML del template.
 * Similar a renderHubDashboardWithData pero usa datos generados.
 */
export function injectGeneratedDataIntoHTML(
  html: string,
  generatedData: GeneratedUIData,
): string {
  const dataScript = `<script>
    window.GENERATED_UI_DATA = ${JSON.stringify(generatedData)};

    // Renderizar navegación
    function renderNavigation() {
      const nav = window.GENERATED_UI_DATA.navigation;
      const sidebar = document.querySelector('.sidebar-left');
      if (!sidebar) return;

      let html = '<div style="padding: 1rem 0;">';

      // Items globales
      nav.itemsGlobales.forEach(item => {
        html += \`
          <div style="padding: 0.5rem 1rem; border-left: 3px solid transparent; cursor: pointer;">
            <span style="font-size: 1.2rem;">\${item.icon}</span>
            <span style="margin-left: 0.5rem; font-size: 0.85rem;">\${item.label}</span>
          </div>
        \`;
      });

      html += '</div>';

      // Áreas
      nav.areas.forEach(area => {
        const isExpanded = area.expandido;
        html += \`
          <div style="margin: 1rem 0; border-top: 1px solid var(--border);">
            <div style="padding: 0.75rem 1rem; cursor: pointer; font-weight: 600; display: flex; align-items: center;">
              <span>\${area.icon}</span>
              <span style="margin-left: 0.5rem; flex: 1;">\${area.label}</span>
              <span style="transform: \${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}; transition: transform 0.2s;">▼</span>
            </div>
            <div style="display: \${isExpanded ? 'block' : 'none'}; padding-left: 1.5rem;">
              \${area.items.map(item => \`
                <div style="padding: 0.5rem 0; font-size: 0.85rem; color: var(--text-secondary);">
                  <a href="\${item.path}" style="color: inherit; text-decoration: none;">
                    \${item.icon} \${item.label}
                  </a>
                </div>
              \`).join('')}
            </div>
          </div>
        \`;
      });

      sidebar.innerHTML = html;
    }

    // Renderizar dashboard
    function renderDashboard() {
      const dash = window.GENERATED_UI_DATA.dashboard;
      const content = document.querySelector('.content');
      if (!content) return;

      let html = '<div style="padding: 2rem;">';

      // KPIs Operacionales
      if (dash.kpisOperacionales.length > 0) {
        html += '<h2 style="color: var(--primary-light); margin-bottom: 1rem;">Operación</h2>';
        html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 2rem;">';
        dash.kpisOperacionales.forEach(kpi => {
          html += \`
            <div style="background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 8px; padding: 1rem;">
              <div style="font-size: 0.85rem; color: var(--text-secondary);">\${kpi.titulo}</div>
              <div style="font-size: 1.5rem; font-weight: 600; margin: 0.5rem 0; color: var(--primary-light);">
                \${kpi.valor} <span style="font-size: 0.8rem;">\${kpi.unidad}</span>
              </div>
              <div style="font-size: 0.75rem; color: \${kpi.estado === 'ok' ? 'var(--success)' : kpi.estado === 'warning' ? 'var(--warning)' : 'var(--danger)'};">
                ● \${kpi.estado}
              </div>
            </div>
          \`;
        });
        html += '</div>';
      }

      // KPIs Empresariales
      if (dash.kpisEmpresariales.length > 0) {
        html += '<h2 style="color: var(--primary-light); margin-bottom: 1rem;">Empresa</h2>';
        html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">';
        dash.kpisEmpresariales.forEach(kpi => {
          html += \`
            <div style="background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 8px; padding: 1rem;">
              <div style="font-size: 0.85rem; color: var(--text-secondary);">\${kpi.titulo}</div>
              <div style="font-size: 1.5rem; font-weight: 600; margin: 0.5rem 0; color: var(--primary-light);">
                \${kpi.valor} <span style="font-size: 0.8rem;">\${kpi.unidad}</span>
              </div>
              <div style="font-size: 0.75rem; color: \${kpi.estado === 'ok' ? 'var(--success)' : kpi.estado === 'warning' ? 'var(--warning)' : 'var(--danger)'};">
                ● \${kpi.estado}
              </div>
            </div>
          \`;
        });
        html += '</div>';
      }

      html += '</div>';
      content.innerHTML = html;
    }

    // Renderizar cuando cargue
    document.addEventListener('DOMContentLoaded', () => {
      renderNavigation();
      renderDashboard();
    });
  </script>`;

  // Inyectar antes de cierre de body
  return html.replace("</body>", dataScript + "</body>");
}
