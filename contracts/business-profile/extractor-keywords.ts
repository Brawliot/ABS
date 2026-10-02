/**
 * Diccionario de palabras clave para extracción determinista de BusinessProfile.
 * Utilizado por BusinessProfileExtractor para identificar campos basado en heurísticas.
 */

export interface KeywordGroup {
  exact: string[];
  partial: string[];
}

export const EXTRACTOR_KEYWORDS = {
  // === exchangeDirection ===
  empresa_vende: {
    exact: ["vendo", "venta", "vendemos", "vender", "comercializo", "comercializamos"],
    partial: ["ventas", "vender", "vendedor", "comercio"],
  },
  empresa_compra: {
    exact: ["compro", "compra", "compramos", "adquiero", "adquirimos", "proveedor"],
    partial: ["comprar", "comprador", "suministrador"],
  },

  // === naturalezaBienes ===
  propios_por_cantidad: {
    exact: ["producto", "productos", "inventario", "stock", "mercancía"],
    partial: ["ítems", "unidades", "artículos", "bienes", "mercaderías"],
  },
  propios_unitarios: {
    exact: ["servicio", "servicios", "consultoría", "asesoramiento", "reparación", "trabajo", "proyecto"],
    partial: ["servir", "profesional", "especialista", "consultor", "técnico"],
  },
  bienes_del_cliente: {
    exact: ["cliente", "cliente proporciona", "trae el cliente", "del cliente", "ajena"],
    partial: ["ropa del cliente", "auto del cliente", "material del cliente"],
  },

  // === Canales ===
  presencial: {
    exact: ["presencial", "tienda", "local", "oficina", "mostrador", "físico", "en persona", "cara a cara"],
    partial: ["visitamos", "venimos", "acudo", "voy a"],
  },
  web: {
    exact: ["web", "sitio web", "website", "aplicación", "app", "online", "internet", "digital", "plataforma"],
    partial: ["página", "portal", "e-commerce", "ecommerce"],
  },
  autoservicio: {
    exact: ["autoservicio", "self-service", "plataforma autoservicio", "sin empleado", "automático"],
    partial: ["cliente se gestiona", "cliente mismo", "sin mediación"],
  },
  backoffice: {
    exact: ["backoffice", "back office", "interno", "sistema interno"],
    partial: ["administración", "gestión interna"],
  },
  taller: {
    exact: ["taller", "tallerazo", "workshop", "fábrica", "producción", "máquinas"],
    partial: ["equipos", "máquina", "producir"],
  },

  // === exchangeNature (alias para naturalezaBienes) ===
  goods: {
    exact: ["bien", "bienes", "producto", "productos", "mercancía", "tangible"],
    partial: ["artículo", "ítem", "objeto", "cosa"],
  },
  services: {
    exact: ["servicio", "servicios", "prestación", "consultoría", "asesoramiento"],
    partial: ["servir", "profesional", "experto"],
  },
  digital: {
    exact: ["software", "datos", "saas", "suscripción digital", "app", "plataforma", "cloud"],
    partial: ["digital", "electrónico", "virtual"],
  },

  // === paymentMode ===
  inmediato: {
    exact: ["inmediato", "al contado", "pago inmediato", "al momento", "cash"],
    partial: ["pago ahora", "sin crédito"],
  },
  financiado: {
    exact: ["financiado", "financiamiento", "crédito", "préstamo", "cuotas"],
    partial: ["financiar", "a plazos", "en cuotas"],
  },
  diferido: {
    exact: ["diferido", "aplazado", "a después", "próximo mes"],
    partial: ["después", "más tarde", "pospone"],
  },
  mixto: {
    exact: ["mixto", "combinado", "depende", "flexible"],
    partial: ["varias formas", "múltiples", "opcional"],
  },

  // === capacityMode ===
  cita_individual: {
    exact: ["cita", "citas", "individual", "una persona", "sesión individual", "privado"],
    partial: ["cada cliente", "uno por uno", "sin grupo"],
  },
  plazas: {
    exact: ["plaza", "plazas", "asiento", "asientos", "grupo", "múltiples", "capacidad"],
    partial: ["ocupación", "nivel", "evento", "clase"],
  },

  // === capacityMode relacionado a temporal ===
  temporal: {
    exact: ["temporal", "tiempo", "hora", "horas", "disponibilidad", "slot", "franja"],
    partial: ["duración", "periodo", "ventana", "turno"],
  },

  // === resourceSubtypes ===
  capacidad_temporal: {
    exact: ["cita", "hora", "turno", "disponibilidad", "slot", "franja horaria"],
    partial: ["tiempo disponible", "horario", "agenda"],
  },
  retornable: {
    exact: ["retornable", "devolución", "préstamo", "renta", "alquiler", "vehículo", "equipo"],
    partial: ["se devuelve", "retorna", "devolvés"],
  },
  capital: {
    exact: ["máquina", "máquinas", "instalación", "capital", "fijo", "infraestructura"],
    partial: ["equipo fijo", "planta", "equipamiento"],
  },

  // === location ===
  fixed_location: {
    exact: ["local", "oficina", "tienda", "sede", "ubicación", "dirección", "calle"],
    partial: ["en", "centro", "zona", "barrio", "km"],
  },
  online_only: {
    exact: ["online", "remoto", "virtual", "web", "internet", "a distancia"],
    partial: ["no presencial", "digital"],
  },

  // === capabilities.hasCalendar ===
  has_calendar: {
    exact: ["cita", "hora", "reserva", "agenda", "turno", "disponibilidad"],
    partial: ["reservar", "agendar", "programar"],
  },

  // === capabilities.hasPartes (inventory tracking) ===
  has_inventory: {
    exact: ["inventario", "stock", "producto", "mercancía", "cantidad", "control"],
    partial: ["existencia", "disponible", "en almacén"],
  },

  // === capabilities.hasFiscalCompliance ===
  has_fiscal: {
    exact: ["impuesto", "factura", "fiscal", "iva", "ingresos", "declaración", "contabilidad"],
    partial: ["fiscal", "legal", "cumplimiento"],
  },

  // === capabilities.hasFormalDocuments ===
  has_documents: {
    exact: ["documento", "contrato", "factura", "recibo", "comprobante", "acta"],
    partial: ["documentación", "formal", "registro"],
  },

  // === portalCliente (v1.2) ===
  self_service_portal: {
    exact: ["autoservicio", "portal cliente", "self-service", "cliente", "sin mediación"],
    partial: ["cliente gestiona", "cliente puede", "plataforma cliente"],
  },

  // === Organization model ===
  solo_founder: {
    exact: ["solo", "autónomo", "freelancer", "única persona", "yo solo"],
    partial: ["independiente", "por cuenta propia"],
  },
  small_team: {
    exact: ["equipo", "equipo pequeño", "empleado", "empleados", "personal", "gente"],
    partial: ["trabaja con", "tiene", "colaboradores"],
  },
  associated: {
    exact: ["asociado", "asociación", "asociados", "joint", "alianza", "red"],
    partial: ["trabajamos juntos", "en red", "colaboración"],
  },
  franchise: {
    exact: ["franquicia", "franquiciado", "franchisee"],
    partial: ["modelo de negocio"],
  },

  // === Números (para headcount, km, etc.) ===
  numbers: {
    exact: [],
    partial: [], // Se detectan con regex
  },

  // === Payment method specifics ===
  cash_payment: {
    exact: ["efectivo", "cash", "dinero", "billetes", "monedas"],
    partial: [],
  },
  card_payment: {
    exact: ["tarjeta", "débito", "crédito", "visa", "mastercard"],
    partial: ["pago con tarjeta"],
  },
  bank_transfer: {
    exact: ["transferencia", "transferencia bancaria", "banco"],
    partial: ["banco", "cuenta"],
  },
  subscription: {
    exact: ["suscripción", "mensual", "recurrente", "periódico", "abono"],
    partial: ["se suscribe", "membresía"],
  },

  // === Archetype hints ===
  venta: {
    exact: ["venta", "vendo", "vendemos", "comercio", "tienda"],
    partial: ["ventas"],
  },
  servicio_proyecto: {
    exact: ["servicio", "proyecto", "contrato", "consultoría", "reparación"],
    partial: ["trabajos", "encargo"],
  },
  suscripcion: {
    exact: ["suscripción", "membresía", "membresía", "recurrente", "saas"],
    partial: ["suscribir", "plan", "abono"],
  },
  uso_temporal: {
    exact: ["temporal", "horas", "cita", "sesión", "clase"],
    partial: ["duración", "tiempo"],
  },
  intermediacion: {
    exact: ["intermediario", "plataforma", "marketplace", "comisión"],
    partial: ["intermediación"],
  },

  // === Geographic hints ===
  location_keyword: {
    exact: ["argentina", "españa", "chile", "méxico", "colombia", "uruguay", "perú", "bolivia"],
    partial: ["país", "región", "provincia", "ciudad"],
  },

  // === Online visibility ===
  online_visibility: {
    exact: ["google", "maps", "redes", "instagram", "facebook", "tiktok", "linkedin", "web"],
    partial: ["presencia", "visible", "encontrar"],
  },
};

/**
 * Extrae palabras clave de un texto (normalizado).
 * Retorna pares {keyword, confidence}.
 */
export function extractKeywords(text: string): Map<string, number> {
  const normalized = text.toLowerCase();
  const results = new Map<string, number>();

  // Iterar por cada grupo de palabras clave
  for (const [groupKey, group] of Object.entries(EXTRACTOR_KEYWORDS)) {
    // Exact matches: confidence 0.95
    for (const exact of group.exact) {
      const regex = new RegExp(`\\b${exact}\\b`);
      if (regex.test(normalized)) {
        results.set(`${groupKey}:exact`, Math.max(results.get(`${groupKey}:exact`) || 0, 0.95));
      }
    }

    // Partial matches: confidence 0.70
    for (const partial of group.partial) {
      if (normalized.includes(partial)) {
        results.set(`${groupKey}:partial`, Math.max(results.get(`${groupKey}:partial`) || 0, 0.70));
      }
    }
  }

  return results;
}

/**
 * Detecta números en el texto (para headcount, km, etc.).
 * Retorna array de números encontrados.
 */
export function extractNumbers(text: string): number[] {
  const regex = /\d+/g;
  const matches = text.match(regex);
  return matches ? matches.map(Number) : [];
}

/**
 * Detecta patrones de horario (HH:MM - HH:MM).
 */
export function extractTimePatterns(text: string): string[] {
  const regex = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

/**
 * Detecta URLs y canales en el texto.
 */
export function extractUrls(text: string): string[] {
  const regex = /https?:\/\/[^\s]+|www\.[^\s]+/g;
  const matches = text.match(regex);
  return matches || [];
}
