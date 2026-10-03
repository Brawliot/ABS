/**
 * Etiquetas visibles: cómo se llama cada cosa en pantalla.
 *
 * Cadena (la primera que responda gana):
 *   1. Vocabulario del negocio (clave exacta: `accion:t_cerrar`,
 *      `accion:lc.compras:t_cerrar`, `estado:aceptada`, `proceso:lc.compras`…)
 *   2. Nombre que el negocio dio al proceso (slice.label)
 *   3. Etiquetas del arquetipo (escritas una vez; variante para compras)
 *   4. Identificador convertido en texto legible (último recurso)
 * Después, el vocabulario de términos (clave sin «:», p. ej.
 * `pedido → orden de reparación`) sustituye palabras en el texto final.
 *
 * Los identificadores nunca se muestran tal cual.
 */

import type { ArchetypeId } from "../archetypes/types.js";
import type { Lifecycle } from "../core/lifecycle.js";
import type { ViewSpec } from "./types.js";

type Sentido = "empresa_vende" | "empresa_compra";

interface SliceInfo {
  readonly id: string;
  readonly archetypeId: string;
  readonly lifecycle: Lifecycle;
  readonly label?: string;
  readonly exchangeDirection?: Sentido;
}

/** Nombre genérico del proceso por arquetipo y sentido. */
const PROCESO_LABELS: Readonly<Record<string, { vende: string; compra: string }>> = {
  venta: { vende: "Ventas", compra: "Compras" },
  servicio_proyecto: { vende: "Trabajos", compra: "Trabajos encargados" },
  suscripcion: { vende: "Suscripciones", compra: "Suscripciones contratadas" },
  uso_temporal: { vende: "Alquileres", compra: "Alquileres contratados" },
  intermediacion: { vende: "Intermediación", compra: "Intermediación" },
  financiera: { vende: "Financiación", compra: "Financiación recibida" },
};

/** Nombre de cada paso (botón) por arquetipo, desde el punto de vista de quien vende. */
export const ACCION_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  venta: {
    t_aceptar: "Aceptar presupuesto",
    t_proponer_renegociacion: "Renegociar",
    t_aceptar_nueva_version: "Aceptar nueva oferta",
    t_iniciar_entrega: "Preparar entrega",
    t_entrega_parcial: "Entregar una parte",
    t_cerrar: "Entregar y cobrar",
    t_cancelar_propuesta: "Anular presupuesto",
    t_cancelar_aceptada: "Cancelar pedido",
    t_cancelar_renegociacion: "Cancelar pedido",
    t_incumplir_entrega: "Marcar como no entregado",
  },
  servicio_proyecto: {
    t_acordar: "Aceptar presupuesto",
    t_ejecutar: "Empezar trabajo",
    t_presentar: "Terminar trabajo",
    t_cerrar: "Entregar y cobrar",
    t_cancelar: "Cancelar",
    t_fallar: "No se puede hacer",
    t_rechazar_entrega: "Cliente rechaza el trabajo",
  },
  suscripcion: {
    t_activar: "Dar de alta",
    t_pausar: "Pausar",
    t_reanudar: "Reanudar",
    t_periodo: "Fin de periodo",
    t_renovar: "Cobrar y renovar",
    t_cerrar: "Dar de baja",
    t_cancelar: "Anular alta",
    t_impago: "Marcar impago",
  },
  uso_temporal: {
    t_reservar: "Reservar",
    t_iniciar_uso: "Entregar al cliente",
    t_cerrar: "Recoger y cobrar",
    t_cancelar: "Cancelar reserva",
    t_no_devolver: "Marcar no devuelto",
  },
  intermediacion: {
    t_emparejar: "Emparejar",
    t_iniciar: "Iniciar",
    t_abrir_disputa: "Abrir reclamación",
    t_resolver_liberar: "Resolver: liberar pago",
    t_resolver_reembolsar: "Resolver: reembolsar",
    t_cerrar: "Cerrar y cobrar comisión",
    t_cancelar: "Cancelar",
    t_fallar: "Marcar como fallida",
  },
  financiera: {
    t_aprobar: "Aprobar",
    t_desembolsar: "Desembolsar",
    t_amortizar: "Empezar a amortizar",
    t_cerrar: "Liquidar",
    t_rechazar: "Rechazar",
    t_impago: "Marcar impago",
  },
};

/** Variante cuando la empresa compra (el paso se ve desde el otro lado). */
export const ACCION_LABELS_COMPRA: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  venta: {
    t_aceptar: "Confirmar pedido",
    t_iniciar_entrega: "Pedido en camino",
    t_entrega_parcial: "Recibir una parte",
    t_cerrar: "Recibir y pagar",
    t_cancelar_propuesta: "Anular pedido",
    t_incumplir_entrega: "El proveedor no entrega",
  },
  servicio_proyecto: {
    t_acordar: "Encargar",
    t_ejecutar: "El proveedor empieza",
    t_presentar: "El proveedor termina",
    t_cerrar: "Aceptar y pagar",
    t_fallar: "El proveedor no puede",
    t_rechazar_entrega: "Rechazar el trabajo",
  },
  suscripcion: { t_renovar: "Pagar y renovar" },
  uso_temporal: {
    t_iniciar_uso: "Recoger",
    t_cerrar: "Devolver y pagar",
  },
};

/** Vistas que no son un tablero de estado. */
const VISTA_LABELS: Readonly<Record<string, string>> = {
  panel_agenda: "Agenda",
  panel_retencion: "Fianzas",
  panel_credito: "Crédito",
  panel_periodos: "Cuotas",
  panel_bloqueo: "Bloqueos",
  portal_filtro: "Mis pedidos",
  lista: "Lista",
  detalle: "Detalle",
  formulario: "Formulario",
};

const ID_PREFIX = /^(t|c|lc|proceso|view|panel|mod|action|form|field)[._]/;

/** ¿Parece un identificador y no un texto para personas? */
export function pareceIdentificador(text: string): boolean {
  return /\b[a-z0-9]+_[a-z0-9_]+\b/.test(text) || ID_PREFIX.test(text) || /\b[a-z]+\.[a-z_]+\b/.test(text);
}

/** `t_iniciar_entrega` → «Iniciar entrega»; `lc.servicio_proyecto` → «Servicio proyecto». */
export function humanizarId(id: string): string {
  let s = id;
  while (ID_PREFIX.test(s)) s = s.replace(ID_PREFIX, "");
  s = s.replace(/[._]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
}

function primeraMayuscula(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export interface Etiquetador {
  proceso(lifecycleId: string): string;
  estado(lifecycleId: string | null | undefined, stateId: string): string;
  accion(lifecycleId: string | null | undefined, transitionId: string): string;
  /** Nombre del arquetipo (p. ej. para mensajes de bloqueo). */
  arquetipo(archetypeId: string): string;
  /** Pestaña / título de una vista. `tituloSpec` es el texto de la UiSpec, si lo hay. */
  vista(view: Pick<ViewSpec, "kind" | "stateId" | "lifecycleId">, tituloSpec?: string): string;
  /** Aplica solo el vocabulario de términos del negocio a un texto libre. */
  texto(text: string): string;
  /** Dato adicional de una regla: `fianza_eur` → «Fianza (€)». */
  campo(field: string): string;
}

export function crearEtiquetador(input: {
  readonly lifecycles: readonly SliceInfo[];
  readonly vocabulario?: Readonly<Record<string, string>>;
}): Etiquetador {
  const vocab = input.vocabulario ?? {};
  const terminos = Object.entries(vocab)
    .filter(([k]) => !k.includes(":"))
    .sort((a, b) => b[0].length - a[0].length);
  const slice = (id: string | null | undefined) =>
    id ? input.lifecycles.find((l) => l.id === id) : undefined;
  const compra = (s: SliceInfo | undefined) => s?.exchangeDirection === "empresa_compra";

  const texto = (text: string): string => {
    let out = text;
    for (const [from, to] of terminos) {
      const re = new RegExp(`(^|[^\\p{L}])(${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=$|[^\\p{L}])`, "giu");
      out = out.replace(re, (_m, pre: string, word: string) => {
        const rep = word.charAt(0) === word.charAt(0).toUpperCase() ? primeraMayuscula(to) : to;
        return `${pre}${rep}`;
      });
    }
    return out;
  };

  /** Clave exacta del vocabulario: primero la específica del proceso. */
  const exacta = (tipo: string, lifecycleId: string | null | undefined, id: string) =>
    (lifecycleId ? vocab[`${tipo}:${lifecycleId}:${id}`] : undefined) ?? vocab[`${tipo}:${id}`];

  const arquetipo = (archetypeId: string, sentidoCompra = false) => {
    const l = PROCESO_LABELS[archetypeId];
    return l ? (sentidoCompra ? l.compra : l.vende) : humanizarId(archetypeId);
  };

  const proceso = (lifecycleId: string): string => {
    const over = vocab[`proceso:${lifecycleId}`];
    if (over) return over;
    const s = slice(lifecycleId);
    if (s?.label && !pareceIdentificador(s.label)) return texto(primeraMayuscula(s.label));
    if (s) return texto(arquetipo(s.archetypeId, compra(s)));
    return texto(humanizarId(lifecycleId));
  };

  const estado = (lifecycleId: string | null | undefined, stateId: string): string => {
    const over = exacta("estado", lifecycleId, stateId);
    if (over) return over;
    const s = slice(lifecycleId);
    const label =
      s?.lifecycle.states.find((x) => x.id === stateId)?.label ??
      input.lifecycles.flatMap((l) => l.lifecycle.states).find((x) => x.id === stateId)?.label;
    return texto(label && !pareceIdentificador(label) ? label : humanizarId(stateId));
  };

  const accion = (lifecycleId: string | null | undefined, transitionId: string): string => {
    const over = exacta("accion", lifecycleId, transitionId);
    if (over) return over;
    const s = slice(lifecycleId);
    const arch = s?.archetypeId ?? "";
    const label =
      (compra(s) ? ACCION_LABELS_COMPRA[arch]?.[transitionId] : undefined) ??
      ACCION_LABELS[arch]?.[transitionId];
    return texto(label ?? humanizarId(transitionId));
  };

  const vista = (
    view: Pick<ViewSpec, "kind" | "stateId" | "lifecycleId">,
    tituloSpec?: string,
  ): string => {
    if (view.kind === "tablero" && view.stateId) return estado(view.lifecycleId, view.stateId);
    if (tituloSpec && !pareceIdentificador(tituloSpec)) return texto(tituloSpec);
    return texto(VISTA_LABELS[view.kind] ?? humanizarId(view.kind));
  };

  const campo = (field: string): string => {
    const over = vocab[`campo:${field}`];
    if (over) return over;
    const sufijos: readonly [RegExp, string][] = [
      [/_pct$/, "(%)"],
      [/_eur$/, "(€)"],
      [/_meses$/, "(meses)"],
      [/_dias$/, "(días)"],
    ];
    for (const [re, unidad] of sufijos) {
      if (re.test(field)) return texto(`${humanizarId(field.replace(re, ""))} ${unidad}`);
    }
    return texto(humanizarId(field));
  };

  return {
    proceso,
    estado,
    accion,
    arquetipo: (id) => texto(arquetipo(id)),
    vista,
    texto,
    campo,
  };
}

/** Arquetipos con etiquetas de pasos declaradas (para tests de cobertura). */
export function arquetiposEtiquetados(): readonly ArchetypeId[] {
  return Object.keys(ACCION_LABELS) as ArchetypeId[];
}
