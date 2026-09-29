/**
 * Banco de 30 preguntas para medir precisión del Consultor.
 */

import type { DimensionId, MetricId } from "../../consultant/catalog.js";
import type { PeriodFilter } from "../../consultant/types.js";

export type ConsultantGold =
  | {
      readonly id: string;
      readonly question: string;
      readonly expect: "respuesta";
      readonly metricId: MetricId;
      readonly groupBy: readonly DimensionId[];
      readonly period: PeriodFilter;
      readonly filters?: {
        readonly canal?: string;
        readonly segmento?: string;
        readonly sedeId?: string;
      };
    }
  | {
      readonly id: string;
      readonly question: string;
      readonly expect: "aclaracion";
      readonly reason?: "out_of_catalog" | "ambiguous" | "low_confidence";
    };

export const CONSULTANT_QUESTION_BANK: readonly ConsultantGold[] = [
  {
    id: "c01",
    question: "¿Cuánto vendimos en marzo por canal?",
    expect: "respuesta",
    metricId: "ventas_importe",
    groupBy: ["canal"],
    period: { year: 2026, month: 3 },
  },
  {
    id: "c02",
    question: "Ventas de abril 2026 por sede",
    expect: "respuesta",
    metricId: "ventas_importe",
    groupBy: ["sede"],
    period: { year: 2026, month: 4 },
  },
  {
    id: "c03",
    question: "¿Cuántas unidades vendimos en enero por segmento?",
    expect: "respuesta",
    metricId: "ventas_unidades",
    groupBy: ["segmento"],
    period: { year: 2026, month: 1 },
  },
  {
    id: "c04",
    question: "Previsión de ingresos en mayo por canal",
    expect: "respuesta",
    metricId: "prevision_ingresos",
    groupBy: ["canal"],
    period: { year: 2026, month: 5 },
  },
  {
    id: "c05",
    question: "Ticket medio en febrero por canal",
    expect: "respuesta",
    metricId: "ticket_medio",
    groupBy: ["canal"],
    period: { year: 2026, month: 2 },
  },
  {
    id: "c06",
    question: "Tasa de conversión en marzo por segmento",
    expect: "respuesta",
    metricId: "tasa_conversion",
    groupBy: ["segmento"],
    period: { year: 2026, month: 3 },
  },
  {
    id: "c07",
    question: "¿Cuánto vendimos en junio en el canal web?",
    expect: "respuesta",
    metricId: "ventas_importe",
    groupBy: [],
    period: { year: 2026, month: 6 },
    filters: { canal: "web" },
  },
  {
    id: "c08",
    question: "Ventas de julio por canal en sede-a",
    expect: "respuesta",
    metricId: "ventas_importe",
    groupBy: ["canal"],
    period: { year: 2026, month: 7 },
    filters: { sedeId: "sede-a" },
  },
  {
    id: "c09",
    question: "Facturación de agosto por segmento",
    expect: "respuesta",
    metricId: "ventas_importe",
    groupBy: ["segmento"],
    period: { year: 2026, month: 8 },
  },
  {
    id: "c10",
    question: "¿Cuánto vendido en septiembre por sede?",
    expect: "respuesta",
    metricId: "ventas_importe",
    groupBy: ["sede"],
    period: { year: 2026, month: 9 },
  },
  {
    id: "c11",
    question: "Ventas presencial en octubre",
    expect: "respuesta",
    metricId: "ventas_importe",
    groupBy: [],
    period: { year: 2026, month: 10 },
    filters: { canal: "presencial" },
  },
  {
    id: "c12",
    question: "Número de ventas en noviembre por canal",
    expect: "respuesta",
    metricId: "ventas_unidades",
    groupBy: ["canal"],
    period: { year: 2026, month: 11 },
  },
  {
    id: "c13",
    question: "Ingresos previstos diciembre por sede",
    expect: "respuesta",
    metricId: "prevision_ingresos",
    groupBy: ["sede"],
    period: { year: 2026, month: 12 },
  },
  {
    id: "c14",
    question: "Ticket medio canal autoservicio en marzo",
    expect: "respuesta",
    metricId: "ticket_medio",
    groupBy: [],
    period: { year: 2026, month: 3 },
    filters: { canal: "autoservicio" },
  },
  {
    id: "c15",
    question: "Conversión en abril canal web",
    expect: "respuesta",
    metricId: "tasa_conversion",
    groupBy: [],
    period: { year: 2026, month: 4 },
    filters: { canal: "web" },
  },
  {
    id: "c16",
    question: "Ventas segmento premium en mayo por canal",
    expect: "respuesta",
    metricId: "ventas_importe",
    groupBy: ["canal"],
    period: { year: 2026, month: 5 },
    filters: { segmento: "premium" },
  },
  {
    id: "c17",
    question: "¿Cuánto vendimos en enero 2025 por canal?",
    expect: "respuesta",
    metricId: "ventas_importe",
    groupBy: ["canal"],
    period: { year: 2025, month: 1 },
  },
  {
    id: "c18",
    question: "Facturado en febrero por canal",
    expect: "respuesta",
    metricId: "ventas_importe",
    groupBy: ["canal"],
    period: { year: 2026, month: 2 },
  },
  {
    id: "c19",
    question: "Previsión de facturación en marzo por segmento",
    expect: "respuesta",
    metricId: "prevision_ingresos",
    groupBy: ["segmento"],
    period: { year: 2026, month: 3 },
  },
  {
    id: "c20",
    question: "Cuántas unidades en backoffice en junio",
    expect: "respuesta",
    metricId: "ventas_unidades",
    groupBy: [],
    period: { year: 2026, month: 6 },
    filters: { canal: "backoffice" },
  },
  {
    id: "c21",
    question: "¿Cuál es el stock de almacén?",
    expect: "aclaracion",
    reason: "out_of_catalog",
  },
  {
    id: "c22",
    question: "¿Cuántos empleados tenemos?",
    expect: "aclaracion",
    reason: "out_of_catalog",
  },
  {
    id: "c23",
    question: "Sueldos de la nómina de marzo",
    expect: "aclaracion",
    reason: "out_of_catalog",
  },
  {
    id: "c24",
    question: "Inventario de piezas en sede B",
    expect: "aclaracion",
    reason: "out_of_catalog",
  },
  {
    id: "c25",
    question: "Hola",
    expect: "aclaracion",
    reason: "ambiguous",
  },
  {
    id: "c26",
    question: "Ayuda",
    expect: "aclaracion",
    reason: "ambiguous",
  },
  {
    id: "c27",
    question: "¿Qué tiempo hace?",
    expect: "aclaracion",
    reason: "out_of_catalog",
  },
  {
    id: "c28",
    question: "Dime el ROI de marketing digital",
    expect: "aclaracion",
    reason: "out_of_catalog",
  },
  {
    id: "c29",
    question: "Costes de RRHH del trimestre",
    expect: "aclaracion",
    reason: "out_of_catalog",
  },
  {
    id: "c30",
    question: "¿Cuánto vendimos en marzo por canal?",
    expect: "respuesta",
    metricId: "ventas_importe",
    groupBy: ["canal"],
    period: { year: 2026, month: 3 },
  },
];
