/**
 * Sistema de checklist: describe qué debe cubrir un generador.
 * Base para validar cobertura de módulos y landing.
 */

import { deduceModules } from "./rules/modules.js";
import type { GeneratorInput } from "./types.js";

export interface Punto {
  readonly id: string;
  readonly que: string;
  readonly porque: string;
}

export interface GeneradorBase {
  readonly id: string;
  readonly nombre: string;
}

export interface Generador extends GeneradorBase {
  cubre(input: GeneratorInput, perfil: unknown): string[];
}

export interface ResultadoRevision {
  readonly cubiertos: readonly { readonly punto: Punto; readonly por: string }[];
  readonly sinCubrir: readonly Punto[];
}

/**
 * Deduce el checklist de un generador basado en módulos y canales web.
 */
export function checklistDe(
  input: GeneratorInput,
  _perfil?: unknown,
): Punto[] {
  const puntos: Punto[] = [];

  // Convertir módulos detectados a puntos
  const modulos = deduceModules(input);
  for (const modulo of modulos) {
    const nombreModulo = modulo.moduleId.replace("mod.", "");
    puntos.push({
      id: modulo.moduleId,
      que: nombreModulo,
      porque: `Módulo ${modulo.labelKey} detectado (regla: ${modulo.ruleId})`,
    });
  }

  // Añadir puntos web: presentación (siempre)
  puntos.push({
    id: "web.presentar",
    que: "Presentar",
    porque: "Landing pública con datos del negocio",
  });

  // Oferta: si hay fichas o catálogo (aproximación: ciclos de venta)
  const tieneCatalogo =
    input.lifecycles.some((l) => l.archetypeId === "venta") ||
    input.lifecycles.length > 0;
  if (tieneCatalogo) {
    puntos.push({
      id: "web.oferta",
      que: "Oferta",
      porque: "Mostrar catálogo y precios a clientes",
    });
  }

  // Contacto (siempre)
  puntos.push({
    id: "web.contacto",
    que: "Contacto",
    porque: "Datos de contacto del negocio",
  });

  // Solicitud: si hay procesos que venden al cliente (ciclos)
  const vendeCtoCliente = input.lifecycles.some(
    (l) =>
      l.archetypeId === "venta" || l.archetypeId === "servicio",
  );
  if (vendeCtoCliente) {
    puntos.push({
      id: "web.solicitud",
      que: "Solicitud",
      porque: "Formulario para solicitar presupuesto o cita",
    });
  }

  return puntos.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Revisa cobertura de checklist contra generadores.
 */
export function revisar(
  checklist: readonly Punto[],
  generadores: readonly Generador[],
  input: GeneratorInput,
  perfil?: unknown,
): ResultadoRevision {
  const cubiertos: { punto: Punto; por: string }[] = [];
  const sinCubrir: Punto[] = [];

  for (const punto of checklist) {
    let cubiertosPor: string[] = [];
    for (const gen of generadores) {
      const cubre = gen.cubre(input, perfil);
      if (cubre.includes(punto.id)) {
        cubiertosPor.push(gen.id);
      }
    }

    if (cubiertosPor.length > 0) {
      cubiertos.push({
        punto,
        por: cubiertosPor.join(", "),
      });
    } else {
      sinCubrir.push(punto);
    }
  }

  return { cubiertos, sinCubrir };
}

/**
 * Generador que cubre puntos de módulos activos (gestión existente).
 */
export const GENERADOR_GESTION: Generador = {
  id: "gestion",
  nombre: "Gestión (módulos activos)",
  cubre(input: GeneratorInput, _perfil?: unknown): string[] {
    const modulos = deduceModules(input);
    return modulos.map((m) => m.moduleId);
  },
};

/**
 * Generador web: cubre presentación, contacto y solicitud (si procede).
 */
export const GENERADOR_WEB: Generador = {
  id: "web",
  nombre: "Landing pública",
  cubre(input: GeneratorInput, _perfil?: unknown): string[] {
    const puntos: string[] = ["web.presentar", "web.contacto"];

    const tieneCatalogo =
      input.lifecycles.some((l) => l.archetypeId === "venta") ||
      input.lifecycles.length > 0;
    if (tieneCatalogo) {
      puntos.push("web.oferta");
    }

    const vendeCtoCliente = input.lifecycles.some(
      (l) =>
        l.archetypeId === "venta" || l.archetypeId === "servicio",
    );
    if (vendeCtoCliente) {
      puntos.push("web.solicitud");
    }

    return puntos;
  },
};
