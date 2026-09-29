/**
 * Contrato RGPD: qué datos salen hacia el proveedor por tipo de llamada.
 * Tras minimización — nunca PII cruda (nombres, DNI, email, teléfono, IBAN…).
 */

import type { LlmCallKind, LlmComponentId } from "./types.js";

export interface CallKindPrivacyDoc {
  readonly callKind: LlmCallKind;
  readonly componentId: LlmComponentId;
  readonly purpose: string;
  /** Campos / categorías que SÍ pueden enviarse (ya minimizados). */
  readonly outboundAllowed: readonly string[];
  /** Categorías que NUNCA deben enviarse. */
  readonly outboundForbidden: readonly string[];
  /** Ejemplo de payload minimizado (sin PII). */
  readonly exampleMinimizedUser: string;
}

export const CALL_KIND_PRIVACY: readonly CallKindPrivacyDoc[] = [
  {
    callKind: "interpreter.extract_intent",
    componentId: "interpreter",
    purpose: "Extraer intención/transición candidata desde texto libre del usuario",
    outboundAllowed: [
      "texto de intención con identificadores sustituidos por refs (subject:<id>, parte:<ref>)",
      "lista de transitionIds permitidos (ids técnicos)",
      "flags booleanos (hasAttachments)",
    ],
    outboundForbidden: [
      "nombre/apellidos",
      "email",
      "teléfono",
      "DNI/NIE",
      "IBAN/tarjeta",
      "direcciones postales",
      "contenido de adjuntos binarios",
    ],
    exampleMinimizedUser:
      'Mensaje: "quiero cancelar el pedido subject:tx-42". Transiciones: t_cancelar_aceptada, t_cerrar. hasAttachments=false',
  },
  {
    callKind: "consultant.extract_query",
    componentId: "consultant",
    purpose: "Mapear pregunta en lenguaje natural a ids del catálogo Consultor",
    outboundAllowed: [
      "pregunta con refs (subject:<id>, parte:<ref>)",
      "ids de catálogo candidatos",
    ],
    outboundForbidden: [
      "nombre/apellidos",
      "email",
      "teléfono",
      "DNI/NIE",
      "importes ligados a identidad personal no necesaria",
    ],
    exampleMinimizedUser:
      'Pregunta: "¿cuánto debe parte:p-7 en subject:tx-9?". Catálogo: saldo_parte, estado_tx',
  },
  {
    callKind: "redactor.propose_copy",
    componentId: "redactor",
    purpose: "Proponer plantillas de copy de interfaz (una vez)",
    outboundAllowed: [
      "ids de acciones/vistas",
      "tono/locale",
      "etiquetas técnicas de error de Juez (sin datos de Parte)",
    ],
    outboundForbidden: [
      "datos de clientes reales",
      "mensajes de usuario con PII",
      "historiales de chat",
    ],
    exampleMinimizedUser:
      'Acción action.lc.venta.t_aceptar; tono=cercano; locale=es-ES; errorKey=saldo_pendiente',
  },
  {
    callKind: "designer.propose_tokens",
    componentId: "designer",
    purpose: "Proponer DesignSystem / tokens semánticos",
    outboundAllowed: [
      "descripción de negocio genérica (sin clientes)",
      "brandName de empresa",
      "restricciones de a11y",
    ],
    outboundForbidden: [
      "datos de empleados/clientes",
      "fotos identificables de personas",
      "documentos internos con PII",
    ],
    exampleMinimizedUser:
      'Negocio: taller mecánico multimarca; brandName=Taller Norte; canales=backoffice,portal',
  },
  {
    callKind: "diagnosis.extract_answers",
    componentId: "diagnosis",
    purpose: "Extraer 7 respuestas de diagnóstico desde descripción de negocio",
    outboundAllowed: [
      "descripción operativa del negocio (sin clientes nombrados)",
      "ids de preguntas de diagnóstico",
    ],
    outboundForbidden: [
      "nombres de clientes/proveedores reales",
      "CIF/NIF innecesarios",
      "datos de contacto personales",
    ],
    exampleMinimizedUser:
      "Vendemos material y el cliente se lo lleva; no vuelve; cobro al contado.",
  },
];

export function privacyDocFor(
  callKind: LlmCallKind,
): CallKindPrivacyDoc | undefined {
  return CALL_KIND_PRIVACY.find((d) => d.callKind === callKind);
}
