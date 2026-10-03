/**
 * Motor de secciones: renderiza contenido organizado en secciones con pesos.
 * Cada sección decide si se muestra según los datos y declara qué cubre.
 */

export interface SeccionMeta {
  id: string;
  titulo: string;
  peso: number;
  cubre: readonly string[];
}

export interface Seccion extends SeccionMeta {
  html: string;
}

export interface SeccionDef<C> {
  id: string;
  titulo: (ctx: C) => string;
  mostrar: (ctx: C) => boolean;
  peso: (ctx: C) => number;
  cubre: readonly string[];
  render: (ctx: C) => string;
}

export function montar<C>(
  definiciones: readonly SeccionDef<C>[],
  ctx: C,
): Seccion[] {
  const secciones: Seccion[] = [];
  for (const def of definiciones) {
    if (!def.mostrar(ctx)) continue;
    const peso = def.peso(ctx);
    secciones.push({
      id: def.id,
      titulo: def.titulo(ctx),
      peso,
      cubre: def.cubre,
      html: def.render(ctx),
    });
  }
  secciones.sort((a, b) => b.peso - a.peso);
  return secciones;
}

export function renderSecciones(secciones: readonly Seccion[]): string {
  return secciones
    .map((s) => `<section id="${s.id}" class="seccion"><h2>${s.titulo}</h2>${s.html}</section>`)
    .join("");
}
