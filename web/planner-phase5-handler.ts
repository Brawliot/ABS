/**
 * Phase 5: Department probability calculation and validation
 */

interface Phase5Input {
  sector: string;
  alcance_geografico: string;
  regulacion: string;
  modelo_negocio: string;
  cliente_objetivo: string;
  presupuesto: string;
  dependencia: string;
  equipo: string;
  validacion: string;
  experiencia: string;
}

interface Department {
  nombre: string;
  probabilidad: number;
  clasificacion: "crítico" | "importante" | "secundario";
  origen: "automático" | "preguntar";
}

interface Phase5Output {
  departamentos_incluidos: Department[];
  departamentos_preguntar: Department[];
  departamentos_omitidos: Department[];
}

const DEPARTMENTS = [
  "Legal & Compliance",
  "Finanzas",
  "RRHH",
  "Operativo",
  "Ventas",
  "Marketing",
  "Logística",
  "Soporte/Success",
  "Tecnología",
  "Producto",
  "Sanidad",
  "Compras/Proveedores",
  "Marca",
  "Infraestructura",
];

function calculateDepartmentProbability(dept: string, input: Phase5Input): number {
  let prob = 50; // Base probability

  // Sector impact
  const isHospitality = input.sector.toLowerCase().includes("hostelería") ||
    input.sector.toLowerCase().includes("restauración");
  const isTech = input.sector.toLowerCase().includes("tecnología") ||
    input.sector.toLowerCase().includes("saas");
  const isRetail = input.sector.toLowerCase().includes("retail") ||
    input.sector.toLowerCase().includes("comercio");
  const isManufacturing = input.sector.toLowerCase().includes("manufactura");
  const isServices = input.sector.toLowerCase().includes("servicios");
  const isFinance = input.sector.toLowerCase().includes("finanzas") ||
    input.sector.toLowerCase().includes("banca");
  const isHealth = input.sector.toLowerCase().includes("salud") ||
    input.sector.toLowerCase().includes("medicina");
  const isConstruction = input.sector.toLowerCase().includes("construcción");

  // Regulation impact
  const hasHighRegulation = input.regulacion.toLowerCase().includes("crítica") ||
    input.regulacion.toLowerCase().includes("fuerte");
  const hasMediumRegulation = input.regulacion.toLowerCase().includes("moderada");
  const hasLowRegulation = input.regulacion.toLowerCase().includes("light");

  // Model impact
  const isB2C = input.modelo_negocio.toLowerCase().includes("b2c");
  const isB2B = input.modelo_negocio.toLowerCase().includes("b2b");
  const isSaaS = input.modelo_negocio.toLowerCase().includes("saas");
  const isMarketplace = input.modelo_negocio.toLowerCase().includes("marketplace");
  const isDelivery = input.modelo_negocio.toLowerCase().includes("delivery");

  // Budget impact
  const isBudgetHigh = input.presupuesto.toLowerCase().includes("alto") ||
    input.presupuesto.toLowerCase().includes("muy alto") ||
    input.presupuesto.toLowerCase().includes("importante");
  const isBudgetMedium = input.presupuesto.toLowerCase().includes("medio");
  const isBudgetLow = input.presupuesto.toLowerCase().includes("bajo") ||
    input.presupuesto.toLowerCase().includes("muy bajo") ||
    input.presupuesto.toLowerCase().includes("bootstrap");

  // Dependencies impact
  const hasHighDependency = input.dependencia.toLowerCase().includes("alta") ||
    input.dependencia.toLowerCase().includes("crítica");
  const hasMediumDependency = input.dependencia.toLowerCase().includes("media");

  // Team impact
  const isSoloFounder = input.equipo.toLowerCase().includes("solo") ||
    input.equipo.toLowerCase().includes("fundador");
  const isSmallTeam = input.equipo.toLowerCase().includes("pequeño") ||
    input.equipo.toLowerCase().includes("2-3") ||
    input.equipo.toLowerCase().includes("4-6");
  const isLargeTeam = input.equipo.toLowerCase().includes("7+") ||
    input.equipo.toLowerCase().includes("completo");

  // Validation impact
  const isEarlyStage = input.validacion.toLowerCase().includes("idea") ||
    input.validacion.toLowerCase().includes("problema");
  const hasTraction = input.validacion.toLowerCase().includes("mvp") ||
    input.validacion.toLowerCase().includes("tracción");

  // Customer impact
  const isIndividual = input.cliente_objetivo.toLowerCase().includes("individual") ||
    input.cliente_objetivo.toLowerCase().includes("consumidor");
  const isSME = input.cliente_objetivo.toLowerCase().includes("pequeña") ||
    input.cliente_objetivo.toLowerCase().includes("pequeño");
  const isEnterprise = input.cliente_objetivo.toLowerCase().includes("empresa") ||
    input.cliente_objetivo.toLowerCase().includes("grande") ||
    input.cliente_objetivo.toLowerCase().includes("multinacional");

  // Department-specific calculations
  switch (dept) {
    case "Legal & Compliance":
      if (hasHighRegulation) prob += 30;
      else if (hasMediumRegulation) prob += 15;
      if (isFinance || isHealth || isConstruction) prob += 20;
      if (isB2B || isEnterprise) prob += 10;
      return Math.min(prob, 99);

    case "Finanzas":
      prob = 85; // Almost always needed
      if (isBudgetHigh) prob += 10;
      if (isB2B) prob += 5;
      return Math.min(prob, 99);

    case "RRHH":
      if (!isSoloFounder) prob += 25;
      if (isLargeTeam) prob += 15;
      if (isBudgetLow) prob -= 10;
      if (isHospitality) prob += 15; // Needs staff
      return Math.min(Math.max(prob, 40), 98);

    case "Operativo":
      prob = 80; // Almost always needed
      if (isHospitality || isManufacturing) prob += 15;
      if (isEarlyStage) prob += 10;
      return Math.min(prob, 99);

    case "Ventas":
      if (isB2C) prob += 25;
      if (isB2B) prob += 30;
      if (isSME || isEnterprise) prob += 20;
      if (isDelivery) prob += 20;
      if (isBudgetLow) prob -= 15;
      return Math.min(Math.max(prob, 30), 92);

    case "Marketing":
      if (isB2C) prob += 30;
      if (isIndividual || isSME) prob += 20;
      if (isHospitality) prob += 15;
      if (isBudgetLow) prob -= 20;
      if (isBudgetHigh) prob += 15;
      return Math.min(Math.max(prob, 35), 88);

    case "Logística":
      if (hasHighDependency || hasMediumDependency) prob += 30;
      if (isDelivery || isMarketplace) prob += 30;
      if (isRetail) prob += 20;
      if (isBudgetLow) prob -= 15;
      return Math.min(Math.max(prob, 35), 85);

    case "Soporte/Success":
      if (isSaaS || isMarketplace) prob += 30;
      if (isB2C && hasTraction) prob += 15;
      if (isEnterprise) prob += 20;
      if (isEarlyStage) prob -= 25;
      return Math.min(Math.max(prob, 15), 80);

    case "Tecnología":
      if (isTech || isSaaS) prob += 35;
      if (isMarketplace) prob += 25;
      if (isDelivery) prob += 25;
      if (isBudgetLow) prob -= 15;
      if (isEarlyStage) prob += 15;
      return Math.min(Math.max(prob, 30), 90);

    case "Producto":
      if (isSaaS || isTech) prob += 30;
      if (isHospitality) prob += 30;
      if (isEarlyStage) prob += 25;
      if (hasTraction) prob += 15;
      return Math.min(Math.max(prob, 50), 95);

    case "Sanidad":
      if (isHealth) prob += 90;
      else if (isHospitality || isManufacturing) prob += 35;
      else prob -= 40;
      return Math.min(Math.max(prob, 0), 95);

    case "Compras/Proveedores":
      if (hasHighDependency || hasMediumDependency) prob += 35;
      if (isManufacturing || isHospitality) prob += 25;
      if (isBudgetLow) prob -= 10;
      return Math.min(Math.max(prob, 40), 92);

    case "Marca":
      if (isB2C) prob += 25;
      if (isIndividual || isSME) prob += 20;
      if (isBudgetHigh) prob += 20;
      if (isBudgetLow) prob -= 20;
      if (isEarlyStage) prob -= 15;
      return Math.min(Math.max(prob, 35), 80);

    case "Infraestructura":
      if (isHospitality || isManufacturing || isConstruction) prob += 40;
      if (isBudgetHigh) prob += 15;
      if (isEarlyStage) prob += 15;
      return Math.min(Math.max(prob, 40), 95);

    default:
      return prob;
  }
}

function classifyDepartment(prob: number): "crítico" | "importante" | "secundario" {
  if (prob >= 80) return "crítico";
  if (prob >= 50) return "importante";
  return "secundario";
}

export function calculateDepartmentProbabilities(input: Phase5Input): Phase5Output {
  const departmentResults: Array<{
    nombre: string;
    probabilidad: number;
    clasificacion: "crítico" | "importante" | "secundario";
    origen: "automático" | "preguntar";
  }> = [];

  DEPARTMENTS.forEach((dept) => {
    const probabilidad = calculateDepartmentProbability(dept, input);
    const clasificacion = classifyDepartment(probabilidad);
    const origen = probabilidad > 80 ? "automático" : probabilidad >= 40 ? "preguntar" : "automático";

    departmentResults.push({
      nombre: dept,
      probabilidad,
      clasificacion,
      origen,
    });
  });

  const departamentos_incluidos = departmentResults.filter((d) => d.probabilidad > 80);
  const departamentos_preguntar = departmentResults.filter((d) => d.probabilidad >= 40 && d.probabilidad <= 80);
  const departamentos_omitidos = departmentResults.filter((d) => d.probabilidad < 40);

  return {
    departamentos_incluidos,
    departamentos_preguntar,
    departamentos_omitidos,
  };
}

export type { Phase5Input, Phase5Output, Department };
