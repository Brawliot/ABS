/**
 * Phase 4: Dimensiones críticas inferidas
 */

import type { Phase2Response } from "./planner-phase2-handler.js";
import type { AnalyzedPhase2Results } from "./planner-jev-phase2.js";

interface Phase4Input {
  sector: string;
  alcance_geografico: string;
  regulacion: string;
  modelo_negocio: string;
  equipo: string;
  validacion: string;
  dependencia: string;
  cliente_objetivo: string;
  presupuesto: string;
  experiencia: string;
}

interface Phase4Output {
  dimensiones_inferidas: string[];
  dimensiones_criticas: string[];
  dimensiones_importantes: string[];
  dimensiones_secundarias: string[];
}

const DIMENSION_MAPPINGS = {
  // Sector
  "Hostelería/Restauración": ["Operativo", "Logística", "Sanidad"],
  "Tecnología/SaaS": ["Tecnología", "Operativo", "Producto"],
  "Retail/Comercio": ["Operativo", "Logística", "Inventario", "Tecnología"],
  "Servicios Profesionales": ["Operativo", "Producto", "Marca"],
  "Manufactura": ["Operativo", "Logística", "Calidad"],
  "Finanzas/Banca/Seguros": ["Legal", "Compliance", "Tecnología", "Seguridad"],
  "Salud/Medicina": ["Legal", "Sanidad", "Compliance", "Seguridad"],
  "Logística/Transporte": ["Logística", "Operativo", "Tecnología"],
  "Educación/Formación": ["Operativo", "Producto", "Marketing"],
  "Construcción/Inmobiliaria": ["Legal", "Operativo", "Finanzas"],
  "Marketing/Publicidad/Agencias": ["Marketing", "Producto", "Tecnología"],
  "Medios/Contenido/Entretenimiento": ["Producto", "Tecnología", "Marca"],
  "Agricultura/Ganadería": ["Operativo", "Logística", "Sanidad"],
  "Energía/Utilidades": ["Legal", "Operativo", "Regulación"],
  "Consultoría/Asesoría": ["Operativo", "Producto", "Marca"],

  // Geografía
  "Hyper-local": ["Legal-Local"],
  "Local": ["Legal-Local"],
  "Regional": ["Legal-Regional"],
  "Nacional": ["Legal-Nacional", "Logística"],
  "Internacional": ["Legal-Multi-país", "Logística-Internacional"],
  "Global": ["Legal-Multi-país", "Logística-Internacional", "Tecnología"],
  "Online": ["Tecnología", "Legal-Digital"],

  // Regulación
  "Sin regulación relevante": [],
  "Regulación light": ["Legal-Básico"],
  "Regulación moderada": ["Legal", "Compliance"],
  "Regulación fuerte": ["Legal", "Compliance", "Auditoría"],
  "Regulación crítica": ["Legal", "Compliance", "Auditoría", "Seguridad"],
  "Multi-jurisdiccional": ["Legal-Multi-país", "Compliance"],
  "Riesgo muy alto": ["Legal", "Compliance", "Auditoría", "Riesgos"],

  // Modelo de Negocio
  "B2C Directo": ["Marketing", "Ventas", "Marca"],
  "B2B": ["Ventas", "Soporte", "Relaciones"],
  "B2B2C": ["Ventas", "Relaciones", "Logística"],
  "C2C": ["Tecnología", "Operativo", "Gestión-Partners"],
  "SaaS": ["Tecnología", "Marketing", "Ventas", "Soporte", "Producto"],
  "Freemium": ["Tecnología", "Marketing", "Producto", "Metrics"],
  "Híbrido": ["Marketing", "Ventas", "Tecnología", "Producto"],

  // Equipo
  "Solo fundador": ["RRHH", "Operativo"],
  "Fundador + 1 co-fundador": ["RRHH", "Operativo"],
  "Fundador + equipo (2-3)": ["RRHH", "Operativo", "Cultura"],
  "Equipo pequeño (4-6)": ["RRHH", "Operativo", "Cultura"],
  "Equipo completo (7+)": ["RRHH", "Operativo", "Cultura", "Escalabilidad"],
  "Solo freelancers/contratistas": ["Operativo", "Relaciones-Proveedores"],
  "Acceso a talent pool": ["RRHH", "Operativo"],

  // Validación
  "Idea sin validar": ["Producto", "Investigación-Mercado"],
  "Problema validado": ["Producto", "Investigación-Solución"],
  "Solución prototipada": ["Producto", "Investigación-Solución"],
  "Solución validada": ["Producto", "Go-To-Market"],
  "MVP en operación": ["Operativo", "Producto-Mejora"],
  "Producto consolidado": ["Operativo", "Escalabilidad"],
  "Tracción probada": ["Escalabilidad", "Producto-Evolución"],

  // Dependencia
  "Autónomo (0%)": [],
  "Baja (1-2 partners clave)": ["Proveedores"],
  "Media (3-5 partners clave)": ["Proveedores", "Logística", "Relaciones"],
  "Alta (6+ partners clave)": ["Proveedores", "Logística", "Relaciones", "Riesgos"],
  "Crítica (no funciona sin partners)": ["Proveedores", "Logística", "Relaciones", "Riesgos", "Contingencia"],
  "Ecosistema (modelo plataforma)": ["Tecnología", "Gestión-Partners", "Relaciones"],

  // Cliente Objetivo
  "Consumidor individual": ["Producto", "Marketing", "Marca"],
  "Pequeñas empresas (1-50)": ["Ventas", "Soporte", "Relaciones"],
  "Medianas empresas (51-250)": ["Ventas", "Soporte", "Contratos", "Legal"],
  "Grandes empresas (250+)": ["Ventas", "Soporte", "Contratos", "Legal"],
  "Multinacionales": ["Ventas", "Compliance", "Legal", "Relaciones"],
  "Sector público": ["Compliance", "Contratos", "Legal", "Regulación"],
  "ONGs": ["Relaciones", "Operativo", "Impacto-Social"],
  "Mixto": ["Ventas", "Segmentación", "Producto-Múltiple"],

  // Presupuesto
  "Muy bajo (< €5k)": ["Finanzas-Restricción", "Operativo-Lean"],
  "Bajo (€5k - €25k)": ["Finanzas-Control", "RRHH-Contratos"],
  "Medio (€25k - €100k)": ["Finanzas", "RRHH"],
  "Alto (€100k - €500k)": ["Finanzas", "Inversión", "Tesorería"],
  "Muy alto (€500k - €1M)": ["Finanzas", "Inversión", "Tesorería"],
  "Inversión importante (€1M+)": ["Finanzas", "Inversión", "Tesorería", "Escalabilidad"],
  "Bootstrap / Autofinanciado": ["Finanzas-Restricción", "Operativo-Lean"],

  // Experiencia
  "Sin experiencia": ["Investigación", "Mentoría", "Riesgos"],
  "Experiencia técnica": ["Tecnología", "Operativo"],
  "Experiencia comercial": ["Ventas", "Marketing"],
  "Experiencia directiva": ["RRHH", "Operativo"],
  "Experiencia en el sector": [],
  "Emprendedor serial": [],
  "Expertise dual o múltiple": [],
};

function normalize(text: string | undefined | null): string {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/í/g, "i")
    .replace(/ó/g, "o")
    .replace(/ú/g, "u");
}

function findMapping(value: string | undefined | null): string[] {
  if (!value) return [];
  const normalized = normalize(value);
  if (!normalized) return [];
  for (const [key, dimensions] of Object.entries(DIMENSION_MAPPINGS)) {
    const normalizedKey = normalize(key);
    if (normalizedKey && (normalizedKey.includes(normalized) || normalized.includes(normalizedKey))) {
      return dimensions;
    }
  }
  return [];
}

export function inferDimensions(input: Phase4Input): Phase4Output {
  const allDimensions: Set<string> = new Set();

  findMapping(input.sector).forEach(d => allDimensions.add(d));
  findMapping(input.alcance_geografico).forEach(d => allDimensions.add(d));
  findMapping(input.regulacion).forEach(d => allDimensions.add(d));
  findMapping(input.modelo_negocio).forEach(d => allDimensions.add(d));
  findMapping(input.equipo).forEach(d => allDimensions.add(d));
  findMapping(input.validacion).forEach(d => allDimensions.add(d));
  findMapping(input.dependencia).forEach(d => allDimensions.add(d));
  findMapping(input.cliente_objetivo).forEach(d => allDimensions.add(d));
  findMapping(input.presupuesto).forEach(d => allDimensions.add(d));
  findMapping(input.experiencia).forEach(d => allDimensions.add(d));

  const dimensiones_inferidas = Array.from(allDimensions).sort();

  const CRITICIDAD = {
    criticas: [
      "Operativo",
      "Legal",
      "Finanzas",
      "Sanidad",
      "Seguridad",
      "Compliance",
      "Tecnología",
      "Calidad",
      "Regulación",
    ],
    importantes: [
      "RRHH",
      "Logística",
      "Producto",
      "Marketing",
      "Ventas",
      "Soporte",
      "Relaciones",
      "Investigación-Mercado",
      "Investigación-Solución",
      "Escalabilidad",
      "Go-To-Market",
      "Contratos",
    ],
  };

  const dimensiones_criticas = dimensiones_inferidas.filter((d) =>
    CRITICIDAD.criticas.some((c) => d.includes(c) || c.includes(d))
  );

  const dimensiones_importantes = dimensiones_inferidas.filter(
    (d) =>
      !dimensiones_criticas.includes(d) &&
      CRITICIDAD.importantes.some((i) => d.includes(i) || i.includes(d))
  );

  const dimensiones_secundarias = dimensiones_inferidas.filter(
    (d) => !dimensiones_criticas.includes(d) && !dimensiones_importantes.includes(d)
  );

  return {
    dimensiones_inferidas,
    dimensiones_criticas,
    dimensiones_importantes,
    dimensiones_secundarias,
  };
}

export type { Phase4Input, Phase4Output };
