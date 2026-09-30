/**
 * Motor genérico de secciones: construye páginas dinámicas por composición.
 * Aplica a web, CRM, portal: reutilizable sin dependencias de dominio.
 */

/** Contexto genérico para evaluar secciones. */
export interface ContextoSeccion {
  readonly [key: string]: unknown;
}

/** Definición de una sección: qué cubre, cuándo aplica, peso y render. */
export interface Seccion<C extends ContextoSeccion> {
  readonly id: string;
  /** Puntos de la checklist que cubre esta sección. */
  readonly cubre: readonly string[];
  /** ¿Aplica en este contexto? */
  aplica(ctx: C): boolean;
  /** Prioridad: mayor → más arriba. A igual peso, se respeta orden de lista. */
  peso(ctx: C): number;
  /** Variantes posibles según diseño (p. ej. "grande", "sobria"). */
  readonly variantes: readonly string[];
  /** Elige variante según el contexto. */
  seleccionarVariante(ctx: C): string;
  /** Renderiza la sección en HTML. */
  render(ctx: C, variante: string): string;
}

export interface ResultadoMontaje {
  readonly html: string;
  readonly cubiertos: readonly string[];
  readonly seccionesUsadas: readonly {
    readonly id: string;
    readonly variante: string;
  }[];
}

/**
 * Monta una página dinámicamente eligiendo y ordenando secciones.
 * Filtra por aplica, ordena por peso (mayor primero), elige variante, renderiza.
 */
export function montar<C extends ContextoSeccion>(
  secciones: readonly Seccion<C>[],
  ctx: C,
): ResultadoMontaje {
  // Filtrar secciones que aplican
  const aplicables = secciones.filter((s) => s.aplica(ctx));

  // Ordenar: por peso (descendente), luego mantener orden original
  const ordenadas = aplicables
    .map((s: Seccion<C>, idx: number) => ({ seccion: s, peso: s.peso(ctx), orden: idx }))
    .sort((a, b) => {
      const cmpPeso = b.peso - a.peso; // Mayor peso primero
      return cmpPeso !== 0 ? cmpPeso : a.orden - b.orden;
    })
    .map((x: { seccion: Seccion<C>; peso: number; orden: number }) => x.seccion);

  // Seleccionar variante y renderizar
  const partes: string[] = [];
  const cubiertos: Set<string> = new Set();
  const seccionesUsadas: {
    id: string;
    variante: string;
  }[] = [];

  for (const seccion of ordenadas) {
    const variante = seccion.seleccionarVariante(ctx);
    const html = seccion.render(ctx, variante);
    partes.push(html);

    // Registrar lo que cubre
    for (const punto of seccion.cubre) {
      cubiertos.add(punto);
    }

    seccionesUsadas.push({ id: seccion.id, variante });
  }

  return {
    html: partes.join("\n"),
    cubiertos: Array.from(cubiertos).sort(),
    seccionesUsadas,
  };
}
