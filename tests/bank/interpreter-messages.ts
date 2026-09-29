/**
 * Banco de 30 mensajes realistas para medir precisión del Intérprete.
 */

export type InterpreterExpectedKind =
  | "solicitud"
  | "confirmacion"
  | "derivacion_humana";

export interface InterpreterGoldCase {
  readonly id: string;
  readonly text: string;
  readonly hasAttachment: boolean;
  readonly expected: {
    readonly kind: InterpreterExpectedKind;
    readonly transitionId?: string;
    readonly intentLabel?: string;
    readonly evidencePendingValidation?: boolean;
    readonly pagoConfirmado?: false;
  };
  readonly tags: readonly string[];
}

export const INTERPRETER_MESSAGE_BANK: readonly InterpreterGoldCase[] = [
  {
    id: "m01",
    text: "Ya he pagado, adjunto la captura del bizum.",
    hasAttachment: true,
    expected: {
      kind: "solicitud",
      transitionId: "t_cerrar",
      intentLabel: "declaracion_pago",
      evidencePendingValidation: true,
      pagoConfirmado: false,
    },
    tags: ["pago", "captura"],
  },
  {
    id: "m02",
    text: "Ya he pagado.",
    hasAttachment: false,
    expected: { kind: "confirmacion" },
    tags: ["pago", "sin_captura"],
  },
  {
    id: "m03",
    text: "Hola",
    hasAttachment: false,
    expected: { kind: "confirmacion" },
    tags: ["ambiguo"],
  },
  {
    id: "m04",
    text: "?",
    hasAttachment: false,
    expected: { kind: "confirmacion" },
    tags: ["ambiguo"],
  },
  {
    id: "m05",
    text: "Acepto la oferta, adelante.",
    hasAttachment: false,
    expected: {
      kind: "solicitud",
      transitionId: "t_aceptar",
      intentLabel: "aceptacion",
    },
    tags: ["aceptacion"],
  },
  {
    id: "m06",
    text: "De acuerdo, firmo.",
    hasAttachment: false,
    expected: {
      kind: "solicitud",
      transitionId: "t_aceptar",
      intentLabel: "aceptacion",
    },
    tags: ["aceptacion"],
  },
  {
    id: "m07",
    text: "Quiero cancelar el pedido.",
    hasAttachment: false,
    expected: {
      kind: "solicitud",
      transitionId: "t_cancelar_aceptada",
      intentLabel: "cancelacion",
    },
    tags: ["cancelacion"],
  },
  {
    id: "m08",
    text: "Anular, por favor no quiero seguir.",
    hasAttachment: false,
    expected: {
      kind: "solicitud",
      transitionId: "t_cancelar_aceptada",
      intentLabel: "cancelacion",
    },
    tags: ["cancelacion"],
  },
  {
    id: "m09",
    text: "He hecho el pago, aquí el comprobante.",
    hasAttachment: true,
    expected: {
      kind: "solicitud",
      transitionId: "t_cerrar",
      intentLabel: "declaracion_pago",
      evidencePendingValidation: true,
      pagoConfirmado: false,
    },
    tags: ["pago"],
  },
  {
    id: "m10",
    text: "Transferencia hecha, captura adjunta.",
    hasAttachment: true,
    expected: {
      kind: "solicitud",
      transitionId: "t_cerrar",
      intentLabel: "declaracion_pago",
      evidencePendingValidation: true,
      pagoConfirmado: false,
    },
    tags: ["pago"],
  },
  {
    id: "m11",
    text: "Buenas",
    hasAttachment: false,
    expected: { kind: "confirmacion" },
    tags: ["ambiguo"],
  },
  {
    id: "m12",
    text: "Ok",
    hasAttachment: false,
    expected: { kind: "confirmacion" },
    tags: ["ambiguo"],
  },
  {
    id: "m13",
    text: "Ya pagué el importe total, os mando la foto del ticket.",
    hasAttachment: true,
    expected: {
      kind: "solicitud",
      transitionId: "t_cerrar",
      intentLabel: "declaracion_pago",
      evidencePendingValidation: true,
      pagoConfirmado: false,
    },
    tags: ["pago"],
  },
  {
    id: "m14",
    text: "Recibí el pedido esta mañana.",
    hasAttachment: false,
    expected: {
      kind: "solicitud",
      transitionId: "t_entrega_parcial",
      intentLabel: "entrega",
      evidencePendingValidation: true,
    },
    tags: ["entrega"],
  },
  {
    id: "m15",
    text: "Ha llegado el paquete.",
    hasAttachment: false,
    expected: {
      kind: "solicitud",
      transitionId: "t_entrega_parcial",
      intentLabel: "entrega",
      evidencePendingValidation: true,
    },
    tags: ["entrega"],
  },
  {
    id: "m16",
    text: "No sé qué hacer con esto.",
    hasAttachment: false,
    expected: { kind: "confirmacion" },
    tags: ["ambiguo"],
  },
  {
    id: "m17",
    text: "Ayuda",
    hasAttachment: false,
    expected: { kind: "confirmacion" },
    tags: ["ambiguo"],
  },
  {
    id: "m18",
    text: "Acepto.",
    hasAttachment: false,
    expected: {
      kind: "solicitud",
      transitionId: "t_aceptar",
      intentLabel: "aceptacion",
    },
    tags: ["aceptacion"],
  },
  {
    id: "m19",
    text: "Canceladlo todo, desisto.",
    hasAttachment: false,
    expected: {
      kind: "solicitud",
      transitionId: "t_cancelar_aceptada",
      intentLabel: "cancelacion",
    },
    tags: ["cancelacion"],
  },
  {
    id: "m20",
    text: "Os envié el bizum, mira la captura.",
    hasAttachment: true,
    expected: {
      kind: "solicitud",
      transitionId: "t_cerrar",
      intentLabel: "declaracion_pago",
      evidencePendingValidation: true,
      pagoConfirmado: false,
    },
    tags: ["pago"],
  },
  {
    id: "m21",
    text: "mmm...",
    hasAttachment: false,
    expected: { kind: "confirmacion" },
    tags: ["ambiguo"],
  },
  {
    id: "m22",
    text: "Info",
    hasAttachment: false,
    expected: { kind: "confirmacion" },
    tags: ["ambiguo"],
  },
  {
    id: "m23",
    text: "Vale, firmo el contrato.",
    hasAttachment: false,
    expected: {
      kind: "solicitud",
      transitionId: "t_aceptar",
      intentLabel: "aceptacion",
    },
    tags: ["aceptacion"],
  },
  {
    id: "m24",
    text: "No quiero seguir, cancelar pedido.",
    hasAttachment: false,
    expected: {
      kind: "solicitud",
      transitionId: "t_cancelar_aceptada",
      intentLabel: "cancelacion",
    },
    tags: ["cancelacion"],
  },
  {
    id: "m25",
    text: "Pagado. Comprobante en el adjunto.",
    hasAttachment: true,
    expected: {
      kind: "solicitud",
      transitionId: "t_cerrar",
      intentLabel: "declaracion_pago",
      evidencePendingValidation: true,
      pagoConfirmado: false,
    },
    tags: ["pago"],
  },
  {
    id: "m26",
    text: "El mensajero entregó la mercancía.",
    hasAttachment: false,
    expected: {
      kind: "solicitud",
      transitionId: "t_entrega_parcial",
      intentLabel: "entrega",
      evidencePendingValidation: true,
    },
    tags: ["entrega"],
  },
  {
    id: "m27",
    text: "asdfgh",
    hasAttachment: false,
    expected: { kind: "confirmacion" },
    tags: ["ruido"],
  },
  {
    id: "m28",
    text: "Ya he pagado la factura, screenshot adjunto.",
    hasAttachment: true,
    expected: {
      kind: "solicitud",
      transitionId: "t_cerrar",
      intentLabel: "declaracion_pago",
      evidencePendingValidation: true,
      pagoConfirmado: false,
    },
    tags: ["pago"],
  },
  {
    id: "m29",
    text: "Qué tal",
    hasAttachment: false,
    expected: { kind: "confirmacion" },
    tags: ["ambiguo"],
  },
  {
    id: "m30",
    text: "Hecho el pago por transferencia, os dejo la imagen.",
    hasAttachment: true,
    expected: {
      kind: "solicitud",
      transitionId: "t_cerrar",
      intentLabel: "declaracion_pago",
      evidencePendingValidation: true,
      pagoConfirmado: false,
    },
    tags: ["pago"],
  },
];

export function scoreInterpreterCase(
  gold: InterpreterGoldCase,
  outcome: {
    readonly kind: InterpreterExpectedKind;
    readonly transitionId?: string;
    readonly intentLabel?: string;
    readonly evidenceValidationStatus?: string;
    readonly fields?: Readonly<Record<string, unknown>>;
  },
): boolean {
  if (outcome.kind !== gold.expected.kind) return false;
  if (gold.expected.kind !== "solicitud") return true;
  if (
    gold.expected.transitionId &&
    outcome.transitionId !== gold.expected.transitionId
  ) {
    return false;
  }
  if (
    gold.expected.intentLabel &&
    outcome.intentLabel !== gold.expected.intentLabel
  ) {
    return false;
  }
  if (gold.expected.evidencePendingValidation) {
    if (outcome.evidenceValidationStatus !== "pendiente_validacion") {
      return false;
    }
  }
  if (gold.expected.pagoConfirmado === false) {
    if (outcome.fields?.pago_confirmado === true) return false;
  }
  return true;
}
