/**
 * Integrador de Dashboard en el Presenter.
 * Orquesta la generación del dashboard desde GeneratorInput.
 */

import type { GeneratorInput } from "../generator/types.js";
import { generateDashboardSpec } from "../generator/dashboard-generator.js";
import { GeneradorDashboard, type DashboardGenerado } from "../web/dashboard-estadisticas.js";
import type { KPIPeriodo, Alerta } from "../policies/kpi-engine.js";

/**
 * Contexto de ejecución del dashboard para un caso/compañía.
 */
export interface DashboardContext {
  readonly generatorInput: GeneratorInput;
  readonly periodo: string;
  readonly kpisPeriodo: KPIPeriodo;
  readonly historicoPeriodos: KPIPeriodo[];
  readonly alertas: Alerta[];
  readonly datosSeries: Array<{ fecha: string; ingresos: number; gastos: number; clientes: number }>;
}

/**
 * Genera el dashboard completo para un caso de negocio.
 * Combina: especificación del perfil + generación base + datos reales.
 */
export function generarDashboardPara(ctx: DashboardContext): DashboardGenerado {
  // 1. Deducir qué debe mostrar el dashboard según el perfil
  const spec = generateDashboardSpec(ctx.generatorInput);

  // 2. Generar dashboard con estructura base (KPIs, gráficos, alertas)
  const generador = new GeneradorDashboard();
  return generador.generarDashboardParametrizado(
    spec,
    ctx.periodo,
    ctx.kpisPeriodo,
    ctx.historicoPeriodos,
    ctx.alertas,
    ctx.datosSeries,
  );
}

/**
 * Presentación renderizable del dashboard (capa 2/3).
 * Define qué aparece en pantalla, en qué orden, y por qué.
 */
export interface DashboardPresentation {
  readonly titulo: string;
  readonly descripcion: string;
  readonly tablas: {
    readonly operacion: {
      readonly titulo: string;
      readonly items: Array<{ id: string; titulo: string; valor: string; unidad: string; estado: string }>;
    };
    readonly empresa: {
      readonly titulo: string;
      readonly items: Array<{ id: string; titulo: string; valor: string; unidad: string; estado: string }>;
    };
  };
  readonly graficos: Array<{
    readonly id: string;
    readonly titulo: string;
    readonly tipo: 'linea' | 'pastel' | 'barra';
  }>;
  readonly alertas: Array<{
    readonly id: string;
    readonly titulo: string;
    readonly severidad: 'info' | 'warning' | 'critical';
  }>;
}

/**
 * Renderiza el dashboard generado a un formato presentable.
 */
export function renderizarDashboard(generated: DashboardGenerado): DashboardPresentation {
  const { especificacion, dashboard, kpisOperacionales, kpisEmpresariales } = generated;

  return {
    titulo: "Dashboard de Negocio",
    descripcion: `Perfil: ${especificacion.modulosActivos.map((m) => m.nombre).join(", ")}`,
    tablas: {
      operacion: {
        titulo: "Operación",
        items: kpisOperacionales.map((kpi) => ({
          id: kpi.id,
          titulo: kpi.titulo,
          valor: String(kpi.valor),
          unidad: kpi.unidad,
          estado: kpi.estado,
        })),
      },
      empresa: {
        titulo: "Empresa",
        items: kpisEmpresariales.map((kpi) => ({
          id: kpi.id,
          titulo: kpi.titulo,
          valor: String(kpi.valor),
          unidad: kpi.unidad,
          estado: kpi.estado,
        })),
      },
    },
    graficos: [
      ...dashboard.graficos_linea.map((g) => ({
        id: g.titulo.toLowerCase().replace(/ /g, "-"),
        titulo: g.titulo,
        tipo: "linea" as const,
      })),
      ...dashboard.graficos_pastel.map((g) => ({
        id: g.titulo.toLowerCase().replace(/ /g, "-"),
        titulo: g.titulo,
        tipo: "pastel" as const,
      })),
      ...dashboard.graficos_barra.map((g) => ({
        id: g.titulo.toLowerCase().replace(/ /g, "-"),
        titulo: g.titulo,
        tipo: "barra" as const,
      })),
    ],
    alertas: dashboard.alertas_activas.map((a) => ({
      id: a.id,
      titulo: a.mensaje,
      severidad: (a.severidad === "critica" ? "critical" : a.severidad) as "info" | "warning" | "critical",
    })),
  };
}

/**
 * Ejemplo de uso en el presenter.
 *
 * ```typescript
 * const input: GeneratorInput = { ... };
 * const ctx: DashboardContext = {
 *   generatorInput: input,
 *   periodo: "2024-10",
 *   kpisPeriodo: { ... },
 *   historicoPeriodos: [ ... ],
 *   alertas: [ ... ],
 *   datosSeries: [ ... ]
 * };
 *
 * const generated = generarDashboardPara(ctx);
 * const presentation = renderizarDashboard(generated);
 * // → Se envía `presentation` a la UI
 * ```
 */
