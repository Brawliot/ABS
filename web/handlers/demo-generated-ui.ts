/**
 * Demo: UI Generada
 * Ejemplo de cómo usar los generadores para crear un dashboard parametrizado.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { GeneratorInput } from "../../generator/types.js";
import { generateUIDataFromProfile, injectGeneratedDataIntoHTML } from "./generated-navigation-handler.js";
import type { DashboardContext } from "../../presenter/dashboard-integrador.js";

/**
 * Crea un GeneratorInput de demostración (tienda de ropa).
 */
function createDemoGeneratorInput(): GeneratorInput {
  return {
    caseId: "demo-tienda-001",
    caseVersion: "1.0",
    companyId: "company-001",
    generatedAt: new Date().toISOString(),
    lifecycles: [
      {
        id: "venta-presencial",
        archetypeId: "venta",
        label: "TPV",
        lifecycle: {
          id: "venta",
          name: "Venta",
          states: [
            { id: "inicio", kind: "inicial" },
            { id: "confirmada", kind: "confirmada" },
            { id: "completada", kind: "completada" },
          ],
        },
      },
    ],
    ruleSet: { rules: [] } as any,
    roles: [
      { id: "gerente", name: "Gerente", permissions: [] },
      { id: "vendedor", name: "Vendedor", permissions: [] },
      { id: "almacenero", name: "Almacenero", permissions: [] },
    ],
    channels: ["presencial", "backoffice"],
    resourceSubtypes: [],
    naturalezaBienes: ["propios_por_cantidad"],
    paymentMode: "inmediato",
    hasPartes: false,
    hasMovimientos: true,
    hasFormalDocuments: false,
    hasFiscalCompliance: true,
    hasCalendar: false,
  };
}

/**
 * Crea un DashboardContext de demostración.
 */
function createDemoDashboardContext(): DashboardContext {
  return {
    generatorInput: createDemoGeneratorInput(),
    periodo: "2024-10",
    kpisPeriodo: {
      periodo: "2024-10",
      ingresos_centimos: 150000,
      gastos_centimos: 80000,
      margen_pct: 46.67,
      roi_pct: 18.75,
      cac_centimos: 5000,
      ltv_centimos: 45000,
    } as any,
    historicoPeriodos: [
      {
        periodo: "2024-08",
        ingresos_centimos: 120000,
        gastos_centimos: 70000,
        margen_pct: 41.67,
        roi_pct: 16.43,
        cac_centimos: 4500,
        ltv_centimos: 42000,
      },
      {
        periodo: "2024-09",
        ingresos_centimos: 135000,
        gastos_centimos: 75000,
        margen_pct: 44.44,
        roi_pct: 17.5,
        cac_centimos: 4800,
        ltv_centimos: 43500,
      },
    ] as any,
    alertas: [
      {
        id: "stock-bajo",
        codigo: "STOCK_BAJO",
        mensaje: "Stock crítico en 3 productos",
        severidad: "warning",
        activa: true,
      },
    ] as any,
    datosSeries: [
      { fecha: "2024-10-01", ingresos: 5000, gastos: 2800, clientes: 45 },
      { fecha: "2024-10-02", ingresos: 6200, gastos: 3100, clientes: 48 },
      { fecha: "2024-10-03", ingresos: 5800, gastos: 2900, clientes: 46 },
    ],
  };
}

/**
 * Genera HTML con UI completamente personalizada según el perfil.
 */
export function generateDemoUIHTML(roleId: string = "gerente"): string {
  const input = createDemoGeneratorInput();
  const dashboardCtx = createDemoDashboardContext();

  const generatedData = generateUIDataFromProfile(
    input,
    "user-001",
    roleId,
    "Juan García",
    dashboardCtx,
  );

  // Leer template
  const templatePath = join(process.cwd(), "web", "templates", "inicio.html");
  let html = readFileSync(templatePath, "utf-8");

  // Inyectar datos generados
  html = injectGeneratedDataIntoHTML(html, generatedData);

  return html;
}

/**
 * Exporta la función para usar en servidor.
 * Ejemplo en Express:
 *
 * ```typescript
 * app.get('/inicio', (req, res) => {
 *   const role = req.query.role as string || 'gerente';
 *   const html = generateDemoUIHTML(role);
 *   res.send(html);
 * });
 * ```
 */
