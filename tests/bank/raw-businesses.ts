/**
 * Banco de descripciones crudas de negocio para medición e2e del diagnóstico.
 * Incluye claras, vagas, contradictorias, híbridas y mal escritas.
 */

import type { ArchetypeId } from "../../archetypes/types.js";
import type { ExtractedAnswer } from "../../diagnosis/questions.js";

export type ExpectedOutcomeKind =
  | "dominant"
  | "LOW_CONF"
  | "NONE"
  | "AMBIGUOUS";

export interface BankCase {
  readonly id: string;
  /** Texto libre tal como lo escribiría un usuario. */
  readonly text: string;
  /** Respuestas oro del cuestionario (lo que un extractor fiel debería devolver). */
  readonly expectedAnswers: readonly ExtractedAnswer[];
  readonly expectedOutcome: {
    readonly kind: ExpectedOutcomeKind;
    /** Dominante esperado si kind === "dominant". */
    readonly dominant?: ArchetypeId;
  };
  readonly tags: readonly string[];
}

function a(
  questionId: ExtractedAnswer["questionId"],
  value: boolean | string,
  confidence = 0.92,
): ExtractedAnswer {
  return { questionId, value, confidence };
}

function answers(flags: {
  se_queda: boolean;
  vuelve: boolean;
  periodico: boolean;
  produce: boolean;
  tercero: boolean;
  dinero: boolean;
  linea: string;
  confidence?: number;
}): ExtractedAnswer[] {
  const c = flags.confidence ?? 0.92;
  return [
    a("cliente_se_queda", flags.se_queda, c),
    a("debe_volver", flags.vuelve, c),
    a("pago_periodico_acceso", flags.periodico, c),
    a("se_produce_despues", flags.produce, c),
    a("tercero_conecta", flags.tercero, c),
    a("dinero_o_cobertura", flags.dinero, c),
    a("linea_mas_ingresos", flags.linea, c),
  ];
}

export const RAW_BUSINESS_BANK: readonly BankCase[] = [
  {
    id: "b01",
    text: "Tengo una tienda de zapatos: el cliente paga y se lleva el par a casa.",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedOutcome: { kind: "dominant", dominant: "venta" },
    tags: ["claro", "venta"],
  },
  {
    id: "b02",
    text: "Consultoría IT: firmamos alcance y luego implementamos el sistema.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "servicio_proyecto",
    }),
    expectedOutcome: { kind: "dominant", dominant: "servicio_proyecto" },
    tags: ["claro", "servicio"],
  },
  {
    id: "b03",
    text: "SaaS B2B, cuota mensual por usuario activo.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "suscripcion" },
    tags: ["claro", "suscripcion"],
  },
  {
    id: "b04",
    text: "Alquilo furgonetas por días; el vehículo siempre vuelve al depósito.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: true,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "uso_temporal",
    }),
    expectedOutcome: { kind: "dominant", dominant: "uso_temporal" },
    tags: ["claro", "uso"],
  },
  {
    id: "b05",
    text: "Marketplace: conectamos comprador y vendedor y cobramos comisión.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: true,
      dinero: false,
      linea: "intermediacion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "intermediacion" },
    tags: ["claro", "intermediacion"],
  },
  {
    id: "b06",
    text: "Prestamos microcréditos a autónomos.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: true,
      linea: "financiera",
    }),
    expectedOutcome: { kind: "dominant", dominant: "financiera" },
    tags: ["claro", "financiera"],
  },
  {
    id: "b07",
    text: "Concesionario: vendemos coches, financiamos y tenemos taller postventa.",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: true,
      linea: "venta",
    }),
    expectedOutcome: { kind: "dominant", dominant: "venta" },
    tags: ["hibrido", "concesionaria"],
  },
  {
    id: "b08",
    text: "Coworking: pagas mensual por acceso a mesa.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "suscripcion" },
    tags: ["claro"],
  },
  {
    id: "b09",
    text: "Vendemos y al mismo tiempo el cliente debe devolverlo siempre.",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: true,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedOutcome: { kind: "LOW_CONF" },
    tags: ["contradictorio", "g15"],
  },
  {
    id: "b10",
    text: "Leasing de maquinaria con opción de compra al final.",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: true,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: true,
      linea: "uso_temporal",
      confidence: 0.88,
    }),
    expectedOutcome: { kind: "LOW_CONF" },
    tags: ["contradictorio", "leasing"],
  },
  {
    id: "b11",
    text: "algo con clientes y dinero, no se explicar mas",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
      confidence: 0.4,
    }),
    expectedOutcome: { kind: "LOW_CONF" },
    tags: ["vago", "mal_escrito"],
  },
  {
    id: "b12",
    text: "No cobramos nada; solo damos consejos gratis.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "servicio_proyecto",
    }),
    expectedOutcome: { kind: "NONE" },
    tags: ["borde", "sin_intercambio"],
  },
  {
    id: "b13",
    text: "Formacion online grabada: pagas una vez y te quedas el acceso.",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedOutcome: { kind: "dominant", dominant: "venta" },
    tags: ["borde", "digital"],
  },
  {
    id: "b14",
    text: "Gimnasio con cuota mensual.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "suscripcion" },
    tags: ["claro"],
  },
  {
    id: "b15",
    text: "Factoring: adelantamos facturas a pymes.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: true,
      linea: "financiera",
    }),
    expectedOutcome: { kind: "dominant", dominant: "financiera" },
    tags: ["claro"],
  },
  {
    id: "b16",
    text: "airbnb host alquilo habitacion temporalmente",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: true,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "uso_temporal",
    }),
    expectedOutcome: { kind: "dominant", dominant: "uso_temporal" },
    tags: ["mal_escrito", "uso"],
  },
  {
    id: "b17",
    text: "Agencia inmobiliaria: cobramos por conectar comprador y propietario.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: true,
      dinero: false,
      linea: "intermediacion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "intermediacion" },
    tags: ["claro"],
  },
  {
    id: "b18",
    text: "Clínica dental: tratamiento en varias sesiones tras presupuesto.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "servicio_proyecto",
    }),
    expectedOutcome: { kind: "dominant", dominant: "servicio_proyecto" },
    tags: ["claro"],
  },
  {
    id: "b19",
    text: "Dropshipping: el proveedor envía; nosotros cobramos el margen.",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: true,
      dinero: false,
      linea: "intermediacion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "intermediacion" },
    tags: ["hibrido", "dropshipping"],
  },
  {
    id: "b20",
    text: "No sé si vendemos software o lo alquilamos; el cliente dice ambas cosas.",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: true,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
      confidence: 0.65,
    }),
    expectedOutcome: { kind: "LOW_CONF" },
    tags: ["contradictorio", "vago"],
  },
  {
    id: "b21",
    text: "Barbería: corte puntual, pagas y te vas.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "servicio_proyecto",
    }),
    expectedOutcome: { kind: "dominant", dominant: "servicio_proyecto" },
    tags: ["claro"],
  },
  {
    id: "b22",
    text: "Energia tarifa fija mensual por suministro",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "suscripcion" },
    tags: ["mal_escrito"],
  },
  {
    id: "b23",
    text: "P2P lending: la plataforma conecta prestamistas y prestatarios.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: true,
      dinero: true,
      linea: "intermediacion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "intermediacion" },
    tags: ["hibrido"],
  },
  {
    id: "b24",
    text: "Negocio raro: trueque de horas entre vecinos sin dinero.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: true,
      dinero: false,
      linea: "intermediacion",
      confidence: 0.55,
    }),
    expectedOutcome: { kind: "LOW_CONF" },
    tags: ["vago", "no_encaja"],
  },
  {
    id: "b25",
    text: "Todo false no se queda no vuelve no periodico no produce no tercero no dinero",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedOutcome: { kind: "NONE" },
    tags: ["sin_candidato"],
  },
  {
    id: "b26",
    text: "Seguro de hogar: cobramos prima y cubrimos siniestros.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: true,
      linea: "financiera",
    }),
    expectedOutcome: { kind: "dominant", dominant: "financiera" },
    tags: ["hibrido", "seguro"],
  },
  {
    id: "b27",
    text: "Constructoras: obra llave en mano con pagos por hitos.",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "servicio_proyecto",
    }),
    expectedOutcome: { kind: "dominant", dominant: "servicio_proyecto" },
    tags: ["hibrido"],
  },
  {
    id: "b28",
    text: "Renting de portátiles a empresas; al acabar el contrato vuelven.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: true,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "uso_temporal",
    }),
    expectedOutcome: { kind: "dominant", dominant: "uso_temporal" },
    tags: ["hibrido"],
  },
  {
    id: "b29",
    text: "vendo cosas",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
      confidence: 0.5,
    }),
    expectedOutcome: { kind: "LOW_CONF" },
    tags: ["vago", "mal_escrito"],
  },
  {
    id: "b30",
    text: "App de citas: premium mensual + a veces comisión por evento.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: true,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "suscripcion" },
    tags: ["hibrido"],
  },
  {
    id: "b31",
    text: "Franquicia: cobramos canon periódico + venta de material.",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "suscripcion" },
    tags: ["hibrido"],
  },
  {
    id: "b32",
    text: "ONG: donaciones recurrentes sin contraprestación clara.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: true,
      linea: "financiera",
      confidence: 0.7,
    }),
    expectedOutcome: { kind: "LOW_CONF" },
    tags: ["borde", "ong"],
  },
  {
    id: "b33",
    text: "El cliente se queda con el coche PERO tiene que devolverlo si no paga la letra — leasing.",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: true,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: true,
      linea: "uso_temporal",
    }),
    expectedOutcome: { kind: "LOW_CONF" },
    tags: ["contradictorio", "leasing"],
  },
  {
    id: "b34",
    text: "Plataforma que pone fontaneros en contacto con vecinos; cobramos fee.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: true,
      dinero: false,
      linea: "intermediacion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "intermediacion" },
    tags: ["claro"],
  },
  {
    id: "b35",
    text: "Curso online con cuota mes a mes mientras dure el acceso.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "suscripcion" },
    tags: ["hibrido"],
  },
  {
    id: "b36",
    text: "kiosko prensa vendo periodicos y chicles",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedOutcome: { kind: "dominant", dominant: "venta" },
    tags: ["mal_escrito"],
  },
  {
    id: "b37",
    text: "Ayudo a empresas a montar su ERP a medida en 6 meses.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "servicio_proyecto",
    }),
    expectedOutcome: { kind: "dominant", dominant: "servicio_proyecto" },
    tags: ["claro"],
  },
  {
    id: "b38",
    text: "??? negocio digital ??? ingresos ???",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
      confidence: 0.3,
    }),
    expectedOutcome: { kind: "LOW_CONF" },
    tags: ["vago", "mal_escrito"],
  },
  {
    id: "b39",
    text: "Seguro + marketplace de talleres: conectamos y también cubrimos.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: true,
      dinero: true,
      linea: "intermediacion",
    }),
    expectedOutcome: { kind: "dominant", dominant: "intermediacion" },
    tags: ["hibrido"],
  },
  {
    id: "b40",
    text: "Vendemos material de oficina al contado, sin rarezas.",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedOutcome: { kind: "dominant", dominant: "venta" },
    tags: ["claro"],
  },
  {
    id: "b41",
    text: "Alquiler de escenarios para eventos; al terminar se desmonta y vuelve.",
    expectedAnswers: answers({
      se_queda: false,
      vuelve: true,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "uso_temporal",
    }),
    expectedOutcome: { kind: "dominant", dominant: "uso_temporal" },
    tags: ["claro"],
  },
  {
    id: "b42",
    text: "El cliente compra y se queda el bien, pero también debe devolverlo siempre (texto absurdo a propósito).",
    expectedAnswers: answers({
      se_queda: true,
      vuelve: true,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedOutcome: { kind: "LOW_CONF" },
    tags: ["contradictorio"],
  },
];

export function answersMatchGold(
  got: readonly ExtractedAnswer[],
  gold: readonly ExtractedAnswer[],
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  const byId = new Map(got.map((a) => [a.questionId, a]));
  for (const g of gold) {
    const a = byId.get(g.questionId);
    if (!a) {
      mismatches.push(`falta ${g.questionId}`);
      continue;
    }
    if (a.value !== g.value) {
      mismatches.push(`${g.questionId}: got=${String(a.value)} want=${String(g.value)}`);
    }
    // Confianza: solo exigimos mismo lado del umbral si el oro es bajo/alto
    const goldLow = g.confidence < 0.85;
    const gotLow = a.confidence < 0.85;
    if (goldLow !== gotLow) {
      mismatches.push(
        `${g.questionId}.confidence lado-umbral: got=${a.confidence} want~${g.confidence}`,
      );
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
