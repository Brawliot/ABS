/**
 * Glosario de campos del BusinessProfile.
 * Proporciona documentación, ejemplos y errores comunes para cada campo.
 */

export interface FieldEntry {
  /** Descripción clara en español simple */
  description: string;
  /** Valores disponibles con explicación */
  values?: Record<string, string>;
  /** Casos reales de uso */
  examples: string[];
  /** Errores comunes en la configuración */
  commonMistakes: string[];
  /** Campos relacionados que se ven afectados */
  relatedFields?: string[];
}

export const FIELD_GLOSSARY: Record<string, FieldEntry> = {
  // Procesos y arquitectura
  processes: {
    description:
      "Lista de procesos de negocio que la empresa ejecuta. Cada proceso tiene un tipo (arquetipo) que define su ciclo de vida.",
    examples: [
      "Una pizzería: 1 proceso de venta (arquetipo: venta)",
      "Un taller: 1 venta de servicios, 1 suscripción de mantenimiento",
      "Un restaurante: venta de pizzas + servicio de delivery",
    ],
    commonMistakes: [
      "Incluir procesos que no ejecuta realmente",
      "Dejar vacía la lista",
      "Duplicar IDs de proceso",
      "Usar arquetipos incorrectos para el modelo",
    ],
    relatedFields: ["policyMeta.dominantArchetypeId", "composition"],
  },

  exchangeDirection: {
    description:
      "¿Mi empresa vende (empresa_vende) o compra (empresa_compra)? Dirección del flujo de bienes/servicios.",
    values: {
      empresa_vende:
        "Mi empresa es proveedor (B2B, B2C, C2C). Vendo a clientes.",
      empresa_compra:
        "Mi empresa es comprador. Compro a proveedores (P2B, P2C, etc.)",
    },
    examples: [
      "Pizzería vende pizzas → empresa_vende",
      "Restaurante compra ingredientes → empresa_compra",
      "Agencia publicitaria vende servicios → empresa_vende",
      "Fabricante compra materia prima → empresa_compra",
    ],
    commonMistakes: [
      "Pensar que empresa_vende solo es B2C (también es B2B, C2C)",
      "Mezclar direcciones en un proceso (cada proceso tiene una)",
      "Asumir empresa_compra significa ser distribuidor",
    ],
    relatedFields: ["processes", "channels", "paymentMode"],
  },

  // Naturaleza de bienes
  naturalezaBienes: {
    description:
      "Tipo físico/tangible de lo que se intercambia: productos propios, servicios intangibles, bienes del cliente.",
    values: {
      propios_por_cantidad:
        "Productos en inventario del que se vende por unidades (pizzas, libros, autos)",
      propios_unitarios: "Servicios o productos únicos/personalizados (consultoría, reparación)",
      del_cliente:
        "Bienes que el cliente proporciona (ropa para limpiar, auto para reparar)",
    },
    examples: [
      "Pizzería vende pizzas → propios_por_cantidad",
      "Consultor vende horas → propios_unitarios",
      "Taller de mecánica repara autos del cliente → del_cliente",
      "Sastre cose traje con tela del cliente → del_cliente",
      "Librería vende libros → propios_por_cantidad",
    ],
    commonMistakes: [
      "Confundir propios_por_cantidad con inventario (es el tipo de bien)",
      "Seleccionar varios cuando el negocio es solo uno",
      "No mencionar del_cliente si el modelo lo requiere",
    ],
    relatedFields: ["capabilities.hasPartes", "paymentMode"],
  },

  // Canales
  channels: {
    description:
      "Formas en que clientes interactúan con tu negocio: en persona, online, autoservicio, etc.",
    values: {
      presencial: "Cliente viene a un lugar físico (oficina, tienda, taller)",
      web: "Sitio web o app (pedidos, consultas, pagos online)",
      autoservicio:
        "Plataforma donde el cliente se autogestiona (no habla con empleado)",
      backoffice:
        "Sistema interno (NO es canal al cliente, es interno de empresa)",
      taller: "Espacio de trabajo con máquinas/equipos",
    },
    examples: [
      "Pizzería: presencial + web",
      "Banco: web + presencial + autoservicio",
      "Ecommerce: solo web + autoservicio",
      "Consultoría: presencial + web",
    ],
    commonMistakes: [
      "Incluir backoffice como canal al cliente",
      "Dejar vacía la lista",
      "Olvidar canales secundarios que existen",
    ],
    relatedFields: ["portalCliente", "roles"],
  },

  // Capacidad
  capacityMode: {
    description:
      "¿Cómo se organiza la capacidad? Citas individuales o plazas/asientos.",
    values: {
      cita_individual: "Cada cita es para UNA persona (médico, peluquería)",
      plazas: "Múltiples personas en una sesión (clase, restaurante, evento)",
    },
    examples: [
      "Peluquería: cita_individual (cada cliente solo)",
      "Restaurante: plazas (mesas con gente)",
      "Dentista: cita_individual",
      "Cine: plazas (varias personas por función)",
    ],
    commonMistakes: [
      "Confundir con paymentMode",
      "Pensar que cita_individual requiere solo 1 día",
      "Olvidar que plazas implica gestión de ocupación",
    ],
    relatedFields: ["capabilities.hasCalendar", "resourceSubtypes"],
  },

  // Subtypes de recursos
  resourceSubtypes: {
    description:
      "Tipos de recursos/capacidades que son limitados: temporal (citas), retornable (equipos), capital (máquinas).",
    values: {
      capacidad_temporal: "Tiempo disponible (horas de atención, slots de cita)",
      retornable: "Equipos/vehículos que se prestan y devuelven (scooter, auto)",
      capital: "Máquinas/instalaciones fijas (forno, piscina, sala)",
    },
    examples: [
      "Médico: capacidad_temporal (slots de cita)",
      "Rental de autos: retornable (autos que se devuelven)",
      "Fábrica: capital (máquinas/producción)",
      "Peluquería: capacidad_temporal (tiempo de peluquero)",
    ],
    commonMistakes: [
      "Dejar vacío (es error, no default)",
      "Pensar que es solo para servicios",
      "Confundir retornable con del_cliente",
    ],
    relatedFields: ["capabilities.hasCalendar", "capacityMode"],
  },

  // Portal cliente
  portalCliente: {
    description:
      "¿Tiene plataforma de autoservicio? Si es true, necesita canal 'autoservicio'.",
    values: {
      "true/autoservicio": "Cliente se gestiona sin empleado (portal, app)",
      "false/no autoservicio": "Todo requiere interacción con empleado",
    },
    examples: [
      "Banco: portalCliente.autoservicio=true + canal autoservicio",
      "Pizzería presencial: sin portalCliente",
      "Restaurante con app: portalCliente.autoservicio=true",
    ],
    commonMistakes: [
      "Poner autoservicio=true sin tener canal autoservicio",
      "Confundir con web (web no es autoservicio si el vendedor confirma)",
      "Olvidar que requiere rol cliente automático",
    ],
    relatedFields: ["channels", "roles"],
  },

  // Roles
  roles: {
    description:
      "Personas/grupos que ejecutan acciones en el proceso: empleados, gerentes, clientes.",
    examples: [
      "Pizzería: pizzero, repartidor, cajarero",
      "Taller: mecánico, jefe, recepcionista",
      "Banco: ejecutivo, gerente, cliente",
    ],
    commonMistakes: [
      "Dejar vacío (es error, no default)",
      "Incluir roles que nunca actúan",
      "Olvidar rol cliente si hay autoservicio",
      "Roles sin label",
    ],
    relatedFields: ["permissions", "organization", "portalCliente"],
  },

  // Ubicación
  location: {
    description:
      "País y región donde opera. Afecta a calendario (festivos), cumplimiento legal.",
    examples: [
      "Empresa en Buenos Aires: countryCode=AR, regionCode=BA",
      "Empresa en España: countryCode=ES",
    ],
    commonMistakes: [
      "Código de país inválido (no es nombre del país)",
      "Olvidar que afecta a festivos del calendario",
    ],
    relatedFields: ["calendar"],
  },

  // Naturaleza de bienes (sinónimo)
  exchangeNature: {
    description:
      "Sinónimo alternativo de naturalezaBienes. Tipo de bien: goods (tangible), services (intangible), digital.",
    values: {
      goods: "Productos tangibles (pizzas, autos, libros, ropa)",
      services: "Prestaciones intangibles (consultoría, reparación, consulta médica)",
      digital:
        "Contenido/software (apps, datos, suscripciones, información online)",
    },
    examples: [
      "Pizzería vende pizzas → goods",
      "Consultor vende asesoría → services",
      "SaaS vende software → digital",
      "Restaurante vende comida → goods",
    ],
    commonMistakes: [
      "Confundir goods con deliverable type",
      "No especificar digital para software/datos",
      "Pensar que services es solo profesional (mecánico es services)",
    ],
    relatedFields: ["naturalezaBienes", "paymentMode"],
  },

  // Modo de pago
  paymentMode: {
    description:
      "¿Cuándo se paga? Inmediato (aquí), financiado (crédito), diferido (luego), o mixto.",
    values: {
      inmediato: "Cliente paga en el momento (efectivo, tarjeta, transferencia)",
      financiado: "Crédito del proveedor (empresa financia compra del cliente)",
      diferido: "Cliente paga después pero no es crédito (ej: factura 30 días)",
      mixto: "Combina modo (50% inmediato, 50% financiado)",
    },
    examples: [
      "Pizzería: inmediato (paga al buscar)",
      "Tienda con tarjeta: inmediato (se procesa en el acto)",
      "Taller a plazo: financiado o diferido",
      "Distribuidor B2B: diferido (factura a 30 días)",
    ],
    commonMistakes: [
      "Confundir diferido con financiado (diferido no es crédito)",
      "Pensar que es sobre cantidad de cuotas",
      "Asumir que todos los clientes usan el mismo modo",
    ],
    relatedFields: ["cobros", "capacityMode"],
  },

  // Capacidades
  capabilities: {
    description:
      "¿Qué hace el sistema? ¿Hay partes? ¿Movimientos? ¿Documentos? ¿Cumplimiento fiscal?",
    examples: [
      "Tienda: hasPartes=true (inventario), hasMovimientos=true, hasFormalDocuments=true",
      "Consultor individual: hasPartes=false, hasMovimientos=false",
    ],
    commonMistakes: [
      "Pensar que hasPartes es solo inventario (incluye bienes de cliente)",
      "Olvidar que hasFiscalCompliance requiere hasFormalDocuments",
      "Confundir hasMovimientos con transacciones",
    ],
    relatedFields: ["naturalezaBienes", "organization"],
  },

  // Permiso fallback
  permissionFallback: {
    description:
      "¿Quién aprueba por defecto? Si no hay permiso específico, este rol puede actuar.",
    examples: [
      "Fallback a gerente: cualquier acción sin permiso específico → gerente puede hacer",
    ],
    commonMistakes: ["Dejar sin fallback (toda acción sin permiso es rechazada)"],
    relatedFields: ["permissions", "roles"],
  },

  // Políticas de negocio
  businessPolicies: {
    description:
      "Reglas de negocio: descuentos, límites, validaciones, auditoría.",
    examples: [
      "Descuento por volumen: 10% si compra > $100",
      "Límite de crédito: máximo $5000 por cliente",
    ],
    commonMistakes: [
      "Incluir políticas que no son del negocio (eso es compliance)",
      "Olvidar que requieren transicionId",
    ],
    relatedFields: ["compliance", "processes"],
  },

  // Cumplimiento
  compliance: {
    description:
      "Requisitos legales/regulatorios: impuestos, retención, GDPR, validaciones de documento.",
    examples: [
      "Fiscalización: registrar cada venta",
      "Retención: aplicar 10% de impuesto",
      "GDPR: consentimiento antes de guardar datos",
    ],
    commonMistakes: [
      "Confundir compliance con businessPolicies (compliance es legal)",
      "Olvidar que se aplican a transiciones específicas",
    ],
    relatedFields: ["capabilities.hasFiscalCompliance", "businessPolicies"],
  },

  // Campos de catálogo
  catalogFields: {
    description: "Campos adicionales que se usan en movimientos/partes, más allá de importe.",
    examples: [
      "catalogFields: [importe, parte_id, cantidad, descuento]",
      "Taller: [importe, parte_id, mano_obra_pct]",
    ],
    commonMistakes: [
      "Incluir campos que nunca se usan",
      "Olvidar que importe es siempre mínimo",
    ],
    relatedFields: ["policyTemplates"],
  },

  // Organización
  organization: {
    description:
      "Estructura: sedes (oficinas), equipos, asignaciones (quién trabaja dónde).",
    examples: [
      "Cadena de pizzerías: 3 sedes (Buenos Aires, Rosario, Córdoba)",
      "Taller: 1 sede, 2 equipos (taller mecánico, recepción)",
    ],
    commonMistakes: [
      "Crear estructura sin asignaciones (empleados sin equipo)",
      "Olvidar que each asignación requiere rol",
    ],
    relatedFields: ["roles", "calendar"],
  },

  // Plantillas de política
  policyTemplates: {
    description:
      "Atajos: invocar plantillas pre-built (ej: 'facturación automática', 'retención de impuestos').",
    examples: [
      'policyTemplates: [{plantilla: "facturacion_automatica", parametros: {}}]',
    ],
    commonMistakes: ["Parametros incorrectos o incompletos"],
    relatedFields: ["compliance", "businessPolicies"],
  },

  // Pipeline de estados
  pipelineStateIds: {
    description:
      "Estados principales del pipeline visible al usuario (ej: pendiente, aprobado, completado).",
    examples: [
      "pipelineStateIds: [propuesta, negociacion, ganada, ejecutando, completada]",
    ],
    commonMistakes: [
      "Dejar vacío",
      "Incluir estados que no son del pipeline principal",
    ],
    relatedFields: ["processes", "roles"],
  },

  // Calendario
  calendar: {
    description:
      "Horarios de atención: semana laboral, turnos, temporadas, excepciones (festivos, cierre).",
    examples: [
      "Oficina: L-V 09:00-18:00",
      "Taller: L-S 08:00-20:00 con turno de noche",
      "Resort: temporada alta (verano) vs baja (invierno)",
    ],
    commonMistakes: [
      "Pensar que es solo para citas (aplica a toda operación)",
      "Olvidar festivos",
      "Solapar turnos",
    ],
    relatedFields: ["capabilities.hasCalendar", "location", "capacityMode"],
  },

  // Composición
  composition: {
    description:
      "Relacionar múltiples procesos: cuál es dominante, cuáles son secundarios, cómo se bloquean.",
    examples: [
      "Venta dominante + Financiera secundaria: un cliente compra a crédito",
    ],
    commonMistakes: [
      "No matchear composición con procesos",
      "Circular: secundario bloquea a dominante",
    ],
    relatedFields: ["processes", "policyMeta.dominantArchetypeId"],
  },

  // Métodos de cobro
  cobros: {
    description:
      "Detalles de cómo se cobra: crédito, plazos, fianzas, cuotas, hitos de pago.",
    examples: [
      "aCredito: {kind: cuenta_parte, limitePorDefectoEur: 5000}",
      "pagosPorHitos: permite facturar por fases del proyecto",
    ],
    commonMistakes: [
      "Confundir paymentMode (cuándo) con cobros (cómo)",
      "Sobrecomplicar la estructura",
    ],
    relatedFields: ["paymentMode", "processes"],
  },
};
