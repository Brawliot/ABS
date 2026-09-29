/**
 * Catálogo de escenarios E2E: camino feliz multirol por perfil.
 * Trazabilidad: perfil → proceso dominante → transiciones (+ secundarios).
 */

export type ArchetypeId =
  | "venta"
  | "servicio_proyecto"
  | "financiera"
  | "uso_temporal"
  | "suscripcion"
  | "intermediacion";

export interface JourneyStep {
  /** Arquetipo del expediente sobre el que se actúa */
  readonly archetypeId: ArchetypeId;
  readonly transitionId: string;
  /** Rol que debe ejecutar (visibleRoles) */
  readonly roleId: string;
  /** Roles que NO deben ver la acción (muestreo) */
  readonly forbiddenRoleIds: readonly string[];
}

export interface JourneyScenario {
  readonly id: string;
  readonly profileId: string;
  readonly title: string;
  /** Proceso dominante (lifecycle / processGroup) */
  readonly dominantArchetype: ArchetypeId;
  /** Camino feliz mínimo hasta terminal de éxito */
  readonly steps: readonly JourneyStep[];
  /** Transiciones del happy path canónico del arquetipo (cobertura) */
  readonly happyPathCanonical: readonly string[];
}

const VENTA_MIN = ["t_aceptar", "t_iniciar_entrega", "t_cerrar"] as const;
const VENTA_FULL = [
  "t_aceptar",
  "t_proponer_renegociacion",
  "t_aceptar_nueva_version",
  "t_iniciar_entrega",
  "t_entrega_parcial",
  "t_cerrar",
] as const;
const SERVICIO_MIN = [
  "t_acordar",
  "t_ejecutar",
  "t_presentar",
  "t_cerrar",
] as const;
const FINANCIERA_MIN = [
  "t_aprobar",
  "t_desembolsar",
  "t_amortizar",
  "t_cerrar",
] as const;
const USO_MIN = ["t_reservar", "t_iniciar_uso", "t_cerrar"] as const;
const SUSCRIPCION_MIN = ["t_activar", "t_cerrar"] as const;
const INTER_MIN = ["t_emparejar", "t_iniciar", "t_cerrar"] as const;

function finSteps(
  roleId: string,
  forbidden: readonly string[],
): JourneyStep[] {
  return FINANCIERA_MIN.map((tid) => ({
    archetypeId: "financiera" as const,
    transitionId: tid,
    roleId,
    forbiddenRoleIds: forbidden,
  }));
}

function servSteps(
  roleId: string,
  forbidden: readonly string[],
): JourneyStep[] {
  return SERVICIO_MIN.map((tid) => ({
    archetypeId: "servicio_proyecto" as const,
    transitionId: tid,
    roleId,
    forbiddenRoleIds: forbidden,
  }));
}

function ventaSteps(
  roleId: string,
  forbidden: readonly string[],
): JourneyStep[] {
  return VENTA_MIN.map((tid) => ({
    archetypeId: "venta" as const,
    transitionId: tid,
    roleId,
    forbiddenRoleIds: forbidden,
  }));
}

/**
 * Escenarios: 10 samples + concesionaria + marketplace intermediación.
 */
export const JOURNEY_SCENARIOS: readonly JourneyScenario[] = [
  {
    id: "p01-peluqueria.venta",
    profileId: "p01-peluqueria",
    title: "Peluquería — compra/venta a cierre",
    dominantArchetype: "venta",
    happyPathCanonical: [...VENTA_FULL],
    steps: ventaSteps("duena", ["cliente", "peluquera"]),
  },
  {
    id: "p02-clinica.servicio",
    profileId: "p02-clinica-dental",
    title: "Clínica — señal/financiera + tratamiento a cierre",
    dominantArchetype: "servicio_proyecto",
    happyPathCanonical: [...SERVICIO_MIN],
    steps: [
      ...finSteps("director_medico", ["cliente", "higienista"]),
      ...servSteps("director_medico", ["cliente", "higienista"]),
    ],
  },
  {
    id: "p03-ferreteria.venta",
    profileId: "p03-ferreteria",
    title: "Ferretería — venta mostrador a cierre",
    dominantArchetype: "venta",
    happyPathCanonical: [...VENTA_FULL],
    steps: ventaSteps("dueno", ["cliente", "almacen"]),
  },
  {
    id: "p04-taller.servicio",
    profileId: "p04-taller-mecanico",
    title: "Taller — reparación (servicio) a cierre",
    dominantArchetype: "servicio_proyecto",
    happyPathCanonical: [...SERVICIO_MIN],
    steps: servSteps("dueno", ["cliente", "mecanico"]),
  },
  {
    id: "p05-restaurante.venta",
    profileId: "p05-restaurante",
    title: "Restaurante — ticket/venta a cierre",
    dominantArchetype: "venta",
    happyPathCanonical: [...VENTA_FULL],
    steps: ventaSteps("gerente", ["cliente", "cocina"]),
  },
  {
    id: "p06-gestoria.suscripcion",
    profileId: "p06-gestoria",
    title: "Gestoría — cuota/suscripción a cierre",
    dominantArchetype: "suscripcion",
    happyPathCanonical: [
      "t_activar",
      "t_pausar",
      "t_reanudar",
      "t_periodo",
      "t_renovar",
      "t_cerrar",
    ],
    steps: SUSCRIPCION_MIN.map((tid) => ({
      archetypeId: "suscripcion" as const,
      transitionId: tid,
      roleId: "socio",
      forbiddenRoleIds: ["cliente", "administrativo"],
    })),
  },
  {
    id: "p07-tienda.venta",
    profileId: "p07-tienda-online",
    title: "Tienda online — pedido a cierre",
    dominantArchetype: "venta",
    happyPathCanonical: [...VENTA_FULL],
    steps: ventaSteps("fundadora", ["cliente", "logistica"]),
  },
  {
    id: "p08-alquiler.uso",
    profileId: "p08-alquiler-maquinaria",
    title: "Alquiler — crédito + reserva/uso a cierre",
    dominantArchetype: "uso_temporal",
    happyPathCanonical: [...USO_MIN],
    steps: [
      ...finSteps("gerente", ["cliente", "transportista"]),
      ...USO_MIN.map((tid) => ({
        archetypeId: "uso_temporal" as const,
        transitionId: tid,
        roleId: "gerente",
        forbiddenRoleIds: ["cliente", "transportista"],
      })),
    ],
  },
  {
    id: "p09-academia.suscripcion",
    profileId: "p09-academia-idiomas",
    title: "Academia — matrícula/suscripción a cierre",
    dominantArchetype: "suscripcion",
    happyPathCanonical: [
      "t_activar",
      "t_pausar",
      "t_reanudar",
      "t_periodo",
      "t_renovar",
      "t_cerrar",
    ],
    steps: SUSCRIPCION_MIN.map((tid) => ({
      archetypeId: "suscripcion" as const,
      transitionId: tid,
      roleId: "directora",
      forbiddenRoleIds: ["cliente", "profesor"],
    })),
  },
  {
    id: "p10-reformas.servicio",
    profileId: "p10-reformas",
    title: "Reformas — obra (servicio) a cierre",
    dominantArchetype: "servicio_proyecto",
    happyPathCanonical: [...SERVICIO_MIN],
    steps: servSteps("gerente", ["cliente", "operario"]),
  },
  {
    id: "concesionaria.venta",
    profileId: "concesionaria",
    title: "Concesionaria — financiera + taller + venta a cierre",
    dominantArchetype: "venta",
    happyPathCanonical: [...VENTA_FULL],
    steps: [
      ...finSteps("finanzas", ["cliente", "taller"]),
      ...servSteps("taller", ["cliente", "comercial"]),
      ...ventaSteps("comercial", ["cliente", "taller"]),
    ],
  },
  {
    id: "marketplace.intermediacion",
    profileId: "marketplace-intermediacion",
    title: "Marketplace — intermediación a cierre (cobertura 6º arquetipo)",
    dominantArchetype: "intermediacion",
    happyPathCanonical: [
      "t_emparejar",
      "t_iniciar",
      "t_abrir_disputa",
      "t_resolver_liberar",
      "t_cerrar",
    ],
    steps: INTER_MIN.map((tid) => ({
      archetypeId: "intermediacion" as const,
      transitionId: tid,
      roleId: "operador",
      forbiddenRoleIds: ["cliente", "vendedor"],
    })),
  },
];

export const ALL_ARCHETYPES: readonly ArchetypeId[] = [
  "venta",
  "servicio_proyecto",
  "financiera",
  "uso_temporal",
  "suscripcion",
  "intermediacion",
];
