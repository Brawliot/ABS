/**
 * Perfiles de frecuencia esperada por arquetipo/rol (reglas iniciales).
 * Deterministas: sustituibles por hechos de aprendizaje cuando existan.
 */

export interface ExpectedActionFrequency {
  readonly actionLabelOrTransition: string;
  readonly weight: number;
}

/** Pesos esperados: mayor = más frecuente para el rol. */
export const ARCHETYPE_ROLE_FREQUENCY: Readonly<
  Record<string, readonly ExpectedActionFrequency[]>
> = {
  almacenero: [
    { actionLabelOrTransition: "recibir", weight: 100 },
    { actionLabelOrTransition: "recepcion", weight: 95 },
    { actionLabelOrTransition: "t_recibir", weight: 90 },
    { actionLabelOrTransition: "inventario", weight: 50 },
    { actionLabelOrTransition: "t_cerrar", weight: 20 },
  ],
  almacen: [
    { actionLabelOrTransition: "recibir", weight: 100 },
    { actionLabelOrTransition: "recepcion", weight: 95 },
    { actionLabelOrTransition: "t_recibir", weight: 90 },
    { actionLabelOrTransition: "inventario", weight: 50 },
  ],
  vendedor: [
    { actionLabelOrTransition: "t_aceptar", weight: 100 },
    { actionLabelOrTransition: "venta", weight: 80 },
    { actionLabelOrTransition: "t_iniciar_entrega", weight: 40 },
    { actionLabelOrTransition: "compra", weight: 0 },
    { actionLabelOrTransition: "t_comprar", weight: 0 },
  ],
  comercial: [
    { actionLabelOrTransition: "t_aceptar", weight: 100 },
    { actionLabelOrTransition: "venta", weight: 80 },
    { actionLabelOrTransition: "compra", weight: 0 },
  ],
  gerente: [
    { actionLabelOrTransition: "t_aceptar", weight: 60 },
    { actionLabelOrTransition: "t_cerrar", weight: 60 },
    { actionLabelOrTransition: "aprobar", weight: 80 },
  ],
};

export function frequencyWeight(
  roleId: string,
  transitionId: string,
  labelKey: string,
): number {
  const profile =
    ARCHETYPE_ROLE_FREQUENCY[roleId] ??
    ARCHETYPE_ROLE_FREQUENCY[roleId.toLowerCase()] ??
    [];
  const hay = `${transitionId} ${labelKey}`.toLowerCase();
  let best = 10;
  for (const p of profile) {
    if (hay.includes(p.actionLabelOrTransition.toLowerCase())) {
      best = Math.max(best, p.weight);
    }
  }
  // Compras: peso 0 para vendedor/comercial
  if (
    (roleId === "vendedor" || roleId === "comercial") &&
    /compra|t_comprar|purchase|procurement/i.test(hay)
  ) {
    return 0;
  }
  return best;
}

export function isPurchaseRelated(
  transitionId: string,
  labelKey: string,
  label?: string,
): boolean {
  const hay = `${transitionId} ${labelKey} ${label ?? ""}`.toLowerCase();
  return /compra|t_comprar|purchase|procurement|orden_compra/.test(hay);
}
