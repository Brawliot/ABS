/**
 * Construcción de ciclos personalizados desde pasos declarados en el perfil.
 * El negocio declara sus estados y acciones, mapeados a equivalentes del arquetipo.
 * La validación garantiza que no se rompen las reglas del ciclo base.
 */

import type { Lifecycle, StateNode, Transition } from "../core/lifecycle.js";
import { findState, setsEqual } from "../core/lifecycle.js";
import type {
  ProcesoCustom,
  EstadoCustom,
  AccionCustom,
} from "../contracts/business-profile/samples/sample-types.js";

export interface ErrorValidacion {
  readonly tipo:
    | "id_repetido"
    | "equivale_inexistente"
    | "estado_inicial_falta"
    | "estado_final_falta"
    | "no_alcanzable"
    | "accion_invalida";
  readonly mensaje: string;
  readonly detalles?: string;
}

/**
 * Valida que los pasos declarados respeten las reglas del ciclo base.
 * Devuelve lista de errores legibles o array vacío si es válido.
 */
export function validarPasos(
  pasos: readonly ProcesoCustom[] | undefined,
  lifecycleBase: Lifecycle,
): readonly ErrorValidacion[] {
  if (!pasos || pasos.length === 0) return [];

  const errores: ErrorValidacion[] = [];

  for (const proceso of pasos) {
    const estados = proceso.estados;
    const acciones = proceso.acciones;

    // Verificar ids repetidos en estados
    const idsEstados = new Set<string>();
    for (const e of estados) {
      if (idsEstados.has(e.id)) {
        errores.push({
          tipo: "id_repetido",
          mensaje: `Estado con id duplicado: "${e.id}" en proceso "${proceso.proceso}"`,
        });
      }
      idsEstados.add(e.id);
    }

    // Verificar ids repetidos en acciones
    const idsAcciones = new Set<string>();
    for (const a of acciones) {
      if (idsAcciones.has(a.id)) {
        errores.push({
          tipo: "id_repetido",
          mensaje: `Acción con id duplicado: "${a.id}" en proceso "${proceso.proceso}"`,
        });
      }
      idsAcciones.add(a.id);
    }

    // Verificar que todos los equivales existan en la base
    for (const e of estados) {
      if (!findState(lifecycleBase, e.equivale)) {
        errores.push({
          tipo: "equivale_inexistente",
          mensaje: `Estado "${e.id}" mapea a equivale inexistente: "${e.equivale}"`,
          detalles: `Estados disponibles: ${lifecycleBase.states.map((s) => s.id).join(", ")}`,
        });
      }
    }

    // Verificar que de/a en acciones sean ids de estados válidos
    for (const a of acciones) {
      if (!idsEstados.has(a.de)) {
        errores.push({
          tipo: "accion_invalida",
          mensaje: `Acción "${a.id}": estado origen "${a.de}" no existe`,
        });
      }
      if (!idsEstados.has(a.a)) {
        errores.push({
          tipo: "accion_invalida",
          mensaje: `Acción "${a.id}": estado destino "${a.a}" no existe`,
        });
      }
    }

    // Verificar que hay un estado inicial (sin entrada) y que sea alcanzable
    const conEntrada = new Set(acciones.map((a) => a.a));
    const iniciales = estados.filter((e) => !conEntrada.has(e.id));

    if (iniciales.length !== 1) {
      errores.push({
        tipo: "estado_inicial_falta",
        mensaje: `Proceso "${proceso.proceso}": debe haber exactamente un estado inicial (sin entrada), hay ${iniciales.length}`,
      });
    }
    if (iniciales.length === 1) {
      const inicial = iniciales[0]!;
      const baseInicial = findState(lifecycleBase, inicial.equivale);
      if (baseInicial && baseInicial.kind !== "inicial") {
        errores.push({
          tipo: "estado_inicial_falta",
          mensaje: `Estado inicial "${inicial.id}" mapea a "${inicial.equivale}" que no es inicial en la base`,
        });
      }
    }

    // Verificar que los estados terminales de éxito de la base tengan equivalente
    const exitosBase = lifecycleBase.states.filter((s) =>
      s.kind === "terminal_exito",
    );
    const equivalesUsados = new Set(estados.map((e) => e.equivale));
    for (const exito of exitosBase) {
      if (!equivalesUsados.has(exito.id)) {
        errores.push({
          tipo: "estado_final_falta",
          mensaje: `Falta mapear estado terminal de éxito: "${exito.id}" (${exito.label})`,
        });
      }
    }

    // Verificar alcanzabilidad desde el inicial hasta los terminales
    if (iniciales.length === 1) {
      const inicial = iniciales[0]!;
      const alcanzables = new Set<string>();
      const cola = [inicial.id];
      alcanzables.add(inicial.id);

      while (cola.length > 0) {
        const actual = cola.shift()!;
        for (const a of acciones) {
          if (a.de === actual && !alcanzables.has(a.a)) {
            alcanzables.add(a.a);
            cola.push(a.a);
          }
        }
      }

      for (const e of estados) {
        if (e.id === inicial.id) continue;
        if (!alcanzables.has(e.id)) {
          errores.push({
            tipo: "no_alcanzable",
            mensaje: `Estado "${e.id}" no es alcanzable desde el inicial "${inicial.id}"`,
          });
        }
      }
    }

    // Verificar que acciones que cambian de equivale respeten la base
    for (const a of acciones) {
      const deEstado = estados.find((e) => e.id === a.de);
      const aEstado = estados.find((e) => e.id === a.a);

      if (!deEstado || !aEstado) continue;

      if (deEstado.equivale !== aEstado.equivale) {
        // Esta acción cambia de equivale, debe ser válida en la base
        const transBase = lifecycleBase.transitions.find(
          (t) => t.from === deEstado.equivale && t.to === aEstado.equivale,
        );

        if (!transBase) {
          errores.push({
            tipo: "accion_invalida",
            mensaje: `Acción "${a.id}" cruza de ${deEstado.equivale} a ${aEstado.equivale}, pero esa transición no existe en la base`,
            detalles: `Transiciones válidas desde ${deEstado.equivale}: ${lifecycleBase.transitions
              .filter((t) => t.from === deEstado.equivale)
              .map((t) => t.to)
              .join(", ")}`,
          });
        }
      }
    }
  }

  return errores;
}

/**
 * Construye un Lifecycle personalizado desde los pasos declarados.
 * Devuelve { lifecycle, mapAcciones } donde mapAcciones mapea id de acción propia
 * a id de transición base (si hereda reglas).
 */
export function construirCiclo(
  pasos: readonly ProcesoCustom[] | undefined,
  lifecycleBase: Lifecycle,
): {
  readonly lifecycle: Lifecycle;
  readonly mapAcciones: Readonly<Record<string, string>>;
} {
  if (!pasos || pasos.length === 0) {
    return { lifecycle: lifecycleBase, mapAcciones: {} };
  }

  if (pasos.length > 1) {
    throw new Error("construirCiclo soporta un solo proceso por ahora");
  }

  const proceso = pasos[0]!;
  const estados = proceso.estados;
  const acciones = proceso.acciones;

  const mapAcciones: Record<string, string> = {};

  // Construir estados nuevos (heredan kind de su equivale)
  const estadosNuevos: StateNode[] = estados.map((e) => {
    const baseState = findState(lifecycleBase, e.equivale)!;
    return {
      id: e.id,
      kind: baseState.kind,
      label: e.nombre,
      situations: baseState.situations,
    };
  });

  // Construir transiciones
  const transicionesNuevas: Transition[] = acciones.map((a) => {
    const deEstado = estados.find((e) => e.id === a.de)!;
    const aEstado = estados.find((e) => e.id === a.a)!;

    // Buscar transición base si cambia de equivale
    let baseTransition: Transition | undefined;
    if (deEstado.equivale !== aEstado.equivale) {
      baseTransition = lifecycleBase.transitions.find(
        (t) => t.from === deEstado.equivale && t.to === aEstado.equivale,
      );
      if (baseTransition) {
        mapAcciones[a.id] = baseTransition.id;
      }
    }

    return {
      id: a.id,
      from: a.de,
      to: a.a,
      condition: baseTransition?.condition ?? "siempre",
      requiredEvidence: baseTransition?.requiredEvidence ?? "sistema",
      allowedActor: baseTransition?.allowedActor ?? "humano",
      fulfills: baseTransition?.fulfills ?? [],
    };
  });

  return {
    lifecycle: {
      states: estadosNuevos,
      transitions: transicionesNuevas,
      commitments: lifecycleBase.commitments,
    },
    mapAcciones,
  };
}
