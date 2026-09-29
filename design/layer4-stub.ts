/**
 * Stub de capa 4 (inteligencia de marca / segmento).
 * La capa 4 aún no existe: valores heurísticos a partir de la descripción.
 */

export interface Layer4BrandHints {
  readonly segment: string | null;
  readonly differentiation: string | null;
  readonly moodKeywords: readonly string[];
}

export interface Layer4Stub {
  inferBrandHints(input: {
    readonly businessDescription: string;
    readonly segment?: string;
    readonly differentiation?: string;
  }): Layer4BrandHints;
}

/**
 * Stub determinista: detecta sector por palabras clave.
 */
export class HeuristicLayer4Stub implements Layer4Stub {
  inferBrandHints(input: {
    readonly businessDescription: string;
    readonly segment?: string;
    readonly differentiation?: string;
  }): Layer4BrandHints {
    const t = input.businessDescription
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase();

    let segment = input.segment ?? null;
    const mood: string[] = [];

    if (/ferreter|bricolaj|herramient|torniller/.test(t)) {
      segment = segment ?? "ferreteria";
      mood.push("industrial", "practico", "robusto");
    } else if (/clinic|salud|medic|dental|estetic/.test(t)) {
      segment = segment ?? "clinica";
      mood.push("premium", "sereno", "confianza");
    } else if (/ropa|moda|streetwear|juvenil|boutique|fashion/.test(t)) {
      segment = segment ?? "moda_juvenil";
      mood.push("energetico", "cercano", "expresivo");
    } else if (/almacen|logistica|taller/.test(t)) {
      segment = segment ?? "operaciones";
      mood.push("tactil", "alto_contraste");
    } else {
      segment = segment ?? "general";
      mood.push("neutro");
    }

    return {
      segment,
      differentiation: input.differentiation ?? null,
      moodKeywords: mood,
    };
  }
}
