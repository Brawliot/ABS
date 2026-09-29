/**
 * Catálogo determinista de conflictos SoD, secuencias de fraude y PII.
 */

/** Par de segregación de funciones (misma persona no puede ambos). */
export interface SodPair {
  readonly id: string;
  readonly label: string;
  readonly createPattern: RegExp;
  readonly approvePattern: RegExp;
}

export const SOD_PAIRS: readonly SodPair[] = [
  {
    id: "pago_crear_aprobar",
    label: "crear y aprobar un pago",
    createPattern: /^(t_)?(crear|registrar|solicitar)_?pago$/i,
    approvePattern: /^(t_)?(aprobar|autorizar)_?pago$/i,
  },
  {
    id: "stock_ajuste_recuento",
    label: "registrar un ajuste de stock y validar su propio recuento",
    createPattern: /^(t_)?(ajuste_stock|registrar_ajuste|ajustar_stock)$/i,
    approvePattern: /^(t_)?(validar_recuento|aprobar_recuento|validar_ajuste)$/i,
  },
];

/**
 * Secuencia de fraude clásico: proveedor ficticio → pedido → recepción → pago.
 * Solo se evalúa si existen estas (o alias) en la configuración.
 */
export const FRAUD_SUPPLIER_SEQUENCE: readonly {
  readonly id: string;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    id: "crear_proveedor",
    patterns: [/^(t_)?crear_proveedor$/i, /^(t_)?alta_proveedor$/i],
  },
  {
    id: "pedido_proveedor",
    patterns: [
      /^(t_)?pedido_proveedor$/i,
      /^(t_)?crear_pedido_proveedor$/i,
      /^(t_)?ordenar_compra$/i,
    ],
  },
  {
    id: "recibir_mercancia",
    patterns: [
      /^(t_)?recibir_mercancia$/i,
      /^(t_)?recibir_pedido$/i,
      /^(t_)?recepcion_compra$/i,
    ],
  },
  {
    id: "pagar_proveedor",
    patterns: [
      /^(t_)?pagar_proveedor$/i,
      /^(t_)?pagar_pedido$/i,
      /^(t_)?liquidar_proveedor$/i,
    ],
  },
];

/** Campos considerados datos personales (capa 1 / filtro). */
export const PII_FIELD_PATTERNS: readonly RegExp[] = [
  /^email$/i,
  /^correo$/i,
  /^telefono$/i,
  /^phone$/i,
  /^dni$/i,
  /^nif$/i,
  /^ssn$/i,
  /^nombre_completo$/i,
  /^displayName$/i,
  /^direccion$/i,
  /^address$/i,
  /^fecha_nacimiento$/i,
  /^iban$/i,
];

export const AUTOMATION_ROLE_PATTERN =
  /^(bot|auto|sistema|automation|worker|daemon)/i;

export function matchesAny(id: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((p) => p.test(id));
}

export function resolveFraudSteps(
  transitionIds: readonly string[],
): { readonly stepId: string; readonly transitionId: string }[] | null {
  const resolved: { stepId: string; transitionId: string }[] = [];
  const used = new Set<string>();
  for (const step of FRAUD_SUPPLIER_SEQUENCE) {
    const hit = transitionIds.find(
      (t) => !used.has(t) && matchesAny(t, step.patterns),
    );
    if (!hit) return null;
    used.add(hit);
    resolved.push({ stepId: step.id, transitionId: hit });
  }
  return resolved;
}
