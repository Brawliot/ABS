/**
 * Generador de Dashboard basado en perfil de negocio.
 * Reutiliza GeneradorDashboard pero parametriza KPIs operacionales y empresariales
 * según módulos activos y decisiones de módulos.
 */

import type { GeneratorInput } from "./types.js";
import type { DecisionModulo } from "./rules/modules.js";
import { decidirModulos, moduloActivo } from "./rules/modules.js";

/**
 * KPI operacional: dinero, stock, compras que mueven el negocio.
 */
export interface KPIOperacional {
  readonly id: string;
  readonly titulo: string;
  readonly categoria: "ventas" | "inventario" | "compras" | "finanzas";
  readonly activo: boolean;
  readonly razon: string;
}

/**
 * KPI empresarial: visibilidad organizacional, cumplimiento, reputación.
 */
export interface KPIEmpresarial {
  readonly id: string;
  readonly titulo: string;
  readonly categoria: "documentos" | "sla" | "reputacion" | "procesos";
  readonly activo: boolean;
  readonly razon: string;
}

/**
 * Especificación generada del dashboard para un perfil de negocio.
 */
export interface DashboardSpec {
  readonly caseId: string;
  readonly kpisOperacionales: KPIOperacional[];
  readonly kpisEmpresariales: KPIEmpresarial[];
  readonly seccionesVisibles: {
    readonly operacion: boolean;
    readonly empresa: boolean;
  };
  readonly modulosActivos: DecisionModulo[];
}

/**
 * Deduce los KPIs operacionales según el perfil.
 * Responde: ¿qué dinero, stock y compras debería monitorear?
 */
function deduceKPIsOperacionales(input: GeneratorInput): KPIOperacional[] {
  const kpis: KPIOperacional[] = [];
  const modulos = decidirModulos(input);

  // Ventas: siempre
  if (moduloActivo(input, "dinero")) {
    kpis.push({
      id: "op.ingresos_hoy",
      titulo: "Ingresos hoy",
      categoria: "ventas",
      activo: true,
      razon: "Monitoreo diario de flujo de dinero.",
    });

    kpis.push({
      id: "op.clientes_nuevos",
      titulo: "Clientes nuevos",
      categoria: "ventas",
      activo: true,
      razon: "Crecimiento de cartera.",
    });

    kpis.push({
      id: "op.pedidos_pendientes",
      titulo: "Pedidos pendientes",
      categoria: "ventas",
      activo: true,
      razon: "Flujo operacional.",
    });
  }

  // Stock: si vende por cantidad
  if (moduloActivo(input, "stock")) {
    kpis.push({
      id: "op.stock_critico",
      titulo: "Stock crítico",
      categoria: "inventario",
      activo: true,
      razon: "Alertas de abastecimiento.",
    });

    kpis.push({
      id: "op.rotacion_inventario",
      titulo: "Rotación de inventario",
      categoria: "inventario",
      activo: true,
      razon: "Eficiencia de stock.",
    });

    kpis.push({
      id: "op.valor_almacen",
      titulo: "Valor en almacén",
      categoria: "inventario",
      activo: true,
      razon: "Capital inmovilizado.",
    });
  }

  // Compras: en operaciones que requieren suministros
  const tieneMercancia = input.naturalezaBienes.includes("propios_por_cantidad");
  if (tieneMercancia && input.lifecycles.length > 0) {
    kpis.push({
      id: "op.ordenes_compra_abiertas",
      titulo: "Órdenes de compra abiertas",
      categoria: "compras",
      activo: true,
      razon: "Control de abastecimiento.",
    });

    kpis.push({
      id: "op.llegadas_esperadas",
      titulo: "Llegadas esperadas",
      categoria: "compras",
      activo: true,
      razon: "Planificación de recepciones.",
    });

    kpis.push({
      id: "op.variacion_precios_proveedores",
      titulo: "Variación de precios",
      categoria: "compras",
      activo: true,
      razon: "Control de costos.",
    });
  }

  // Crédito: si vende a plazos
  if (moduloActivo(input, "credito")) {
    kpis.push({
      id: "op.cuentas_por_cobrar",
      titulo: "Cuentas por cobrar",
      categoria: "finanzas",
      activo: true,
      razon: "Efectivo diferido.",
    });

    kpis.push({
      id: "op.morosidad",
      titulo: "Cartera morosa",
      categoria: "finanzas",
      activo: true,
      razon: "Riesgo crediticio.",
    });
  }

  // Cuotas: si cobra suscripciones
  if (moduloActivo(input, "cuotas")) {
    kpis.push({
      id: "op.mrr",
      titulo: "MRR (ingresos recurrentes)",
      categoria: "finanzas",
      activo: true,
      razon: "Visibilidad de ingresos predecibles.",
    });

    kpis.push({
      id: "op.churn_clientes",
      titulo: "Churn de clientes",
      categoria: "finanzas",
      activo: true,
      razon: "Retención de suscriptores.",
    });
  }

  return kpis;
}

/**
 * Deduce los KPIs empresariales según el perfil.
 * Responde: ¿qué debería estar documentado, cumplido y visible?
 */
function deduceKPIsEmpresariales(input: GeneratorInput): KPIEmpresarial[] {
  const kpis: KPIEmpresarial[] = [];

  // Documentos: si tiene obligaciones fiscales o formales
  if (input.hasFiscalCompliance || input.hasFormalDocuments) {
    kpis.push({
      id: "emp.documentos_vencidos",
      titulo: "Documentos vencidos",
      categoria: "documentos",
      activo: true,
      razon: "Obligaciones fiscales y legales.",
    });

    kpis.push({
      id: "emp.pendientes_registro",
      titulo: "Pendientes de registro",
      categoria: "documentos",
      activo: true,
      razon: "Cumplimiento normativo.",
    });
  }

  // SLA y procesos: si hay operaciones complejas
  if (input.lifecycles.length > 1 || input.resourceSubtypes.length > 0) {
    kpis.push({
      id: "emp.sla_incumplidos",
      titulo: "SLAs incumplidos",
      categoria: "sla",
      activo: true,
      razon: "Calidad de servicio.",
    });

    kpis.push({
      id: "emp.tareas_abiertas",
      titulo: "Tareas abiertas",
      categoria: "procesos",
      activo: true,
      razon: "Seguimiento de trabajo en curso.",
    });

    kpis.push({
      id: "emp.cambios_sin_documentar",
      titulo: "Cambios sin documentar",
      categoria: "procesos",
      activo: true,
      razon: "Trazabilidad operacional.",
    });
  }

  // Reputación: si tiene portal cliente
  if (moduloActivo(input, "portal")) {
    kpis.push({
      id: "emp.resenas_promedio",
      titulo: "Reseñas promedio",
      categoria: "reputacion",
      activo: true,
      razon: "Percepción del cliente.",
    });

    kpis.push({
      id: "emp.nps_score",
      titulo: "NPS (satisfacción cliente)",
      categoria: "reputacion",
      activo: true,
      razon: "Lealtad y recomendación.",
    });
  }

  // Landing y SEO: si hay canales públicos
  if (input.channels.includes("publico") || input.channels.includes("web")) {
    kpis.push({
      id: "emp.posicion_seo",
      titulo: "Posición SEO",
      categoria: "reputacion",
      activo: true,
      razon: "Visibilidad orgánica.",
    });

    kpis.push({
      id: "emp.trafico_web",
      titulo: "Tráfico web",
      categoria: "reputacion",
      activo: true,
      razon: "Interés de mercado.",
    });

    kpis.push({
      id: "emp.conversion_rate",
      titulo: "Tasa de conversión",
      categoria: "reputacion",
      activo: true,
      razon: "Efectividad de landing page.",
    });
  }

  return kpis;
}

/**
 * Genera la especificación completa del dashboard para un perfil.
 */
export function generateDashboardSpec(input: GeneratorInput): DashboardSpec {
  const kpisOperacionales = deduceKPIsOperacionales(input);
  const kpisEmpresariales = deduceKPIsEmpresariales(input);
  const modulosActivos = decidirModulos(input);

  return {
    caseId: input.caseId,
    kpisOperacionales,
    kpisEmpresariales,
    seccionesVisibles: {
      operacion: kpisOperacionales.length > 0,
      empresa: kpisEmpresariales.length > 0,
    },
    modulosActivos,
  };
}
