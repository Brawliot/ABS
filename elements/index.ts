/**
 * Instanciación de los 10 elementos del núcleo (plantillas tipadas).
 * Sin lógica de negocio concreta de un sector.
 */

import type { MetaObjectSpec } from "../core/metaobject.js";
import {
  compromisoDerivedLifecycle,
  evidenciaDerivedLifecycle,
  movimientoDerivedLifecycle,
  ofertaDerivedLifecycle,
  parteDerivedLifecycle,
  recursoDerivedLifecycle,
  structuralAnchorLifecycle,
} from "./derived-lifecycles.js";
import { elementSpec } from "./factory.js";
import {
  ActorSubtypes,
  CompromisoSubtypes,
  EstadoSubtypes,
  EventoSubtypes,
  EvidenciaSubtypes,
  MovimientoSubtypes,
  OfertaSubtypes,
  ParteSubtypes,
  RecursoSubtypes,
  TransaccionSubtypes,
  type ActorSubtype,
  type CompromisoSubtype,
  type EstadoSubtype,
  type EventoSubtype,
  type EvidenciaSubtype,
  type MovimientoSubtype,
  type OfertaSubtype,
  type ParteSubtype,
  type RecursoSubtype,
  type TransaccionSubtype,
} from "./subtypes.js";
import { transactionClosureInvariants } from "./closure.js";
import type { Lifecycle } from "../core/lifecycle.js";

export function createParteSpec(subtype: ParteSubtype): MetaObjectSpec {
  return elementSpec({
    id: `element-parte-${subtype}`,
    elementKind: "parte",
    subtype,
    allowedSubtypes: ParteSubtypes,
    lifecycle: parteDerivedLifecycle,
    fields: [
      { name: "nombre", type: "string", required: true },
      { name: "referencia_externa", type: "string", required: false },
    ],
  });
}

export function createActorSpec(subtype: ActorSubtype): MetaObjectSpec {
  return elementSpec({
    id: `element-actor-${subtype}`,
    elementKind: "actor",
    subtype,
    allowedSubtypes: ActorSubtypes,
    lifecycle: structuralAnchorLifecycle,
    fields: [
      { name: "nombre", type: "string", required: true },
      { name: "canal", type: "string", required: false },
    ],
  });
}

export function createOfertaSpec(subtype: OfertaSubtype): MetaObjectSpec {
  return elementSpec({
    id: `element-oferta-${subtype}`,
    elementKind: "oferta",
    subtype,
    allowedSubtypes: OfertaSubtypes,
    lifecycle: ofertaDerivedLifecycle,
    fields: [
      { name: "version", type: "number", required: true },
      { name: "transaccion_id", type: "reference", required: true },
      { name: "descripcion", type: "string", required: true },
      {
        name: "aceptacion_version",
        type: "number",
        required: false,
      },
    ],
  });
}

export function createRecursoSpec(subtype: RecursoSubtype): MetaObjectSpec {
  return elementSpec({
    id: `element-recurso-${subtype}`,
    elementKind: "recurso",
    subtype,
    allowedSubtypes: RecursoSubtypes,
    lifecycle: recursoDerivedLifecycle,
    fields: [
      { name: "codigo", type: "string", required: true },
      { name: "cantidad", type: "number", required: true },
    ],
  });
}

export function createCompromisoSpec(
  subtype: CompromisoSubtype,
): MetaObjectSpec {
  return elementSpec({
    id: `element-compromiso-${subtype}`,
    elementKind: "compromiso",
    subtype,
    allowedSubtypes: CompromisoSubtypes,
    lifecycle: compromisoDerivedLifecycle,
    fields: [
      { name: "transaccion_id", type: "reference", required: true },
      { name: "deudor_parte_id", type: "reference", required: true },
      { name: "acreedor_parte_id", type: "reference", required: true },
    ],
  });
}

export function createMovimientoSpec(
  subtype: MovimientoSubtype,
): MetaObjectSpec {
  return elementSpec({
    id: `element-movimiento_valor-${subtype}`,
    elementKind: "movimiento_valor",
    subtype,
    allowedSubtypes: MovimientoSubtypes,
    lifecycle: movimientoDerivedLifecycle,
    fields: [
      { name: "transaccion_id", type: "reference", required: true },
      { name: "importe", type: "number", required: true },
      { name: "moneda", type: "string", required: true },
      {
        name: "direccion",
        type: "enum",
        required: true,
        enumValues: ["in", "out"],
      },
      /** Parte afectada (reparto N-partes / retención). */
      { name: "parte_id", type: "reference", required: false },
    ],
  });
}

export function createEvidenciaSpec(subtype: EvidenciaSubtype): MetaObjectSpec {
  return elementSpec({
    id: `element-evidencia-${subtype}`,
    elementKind: "evidencia",
    subtype,
    allowedSubtypes: EvidenciaSubtypes,
    lifecycle: evidenciaDerivedLifecycle,
    fields: [
      { name: "transaccion_id", type: "reference", required: true },
      { name: "referencia", type: "string", required: true },
    ],
  });
}

export function createEstadoSpec(subtype: EstadoSubtype): MetaObjectSpec {
  return elementSpec({
    id: `element-estado-${subtype}`,
    elementKind: "estado",
    subtype,
    allowedSubtypes: EstadoSubtypes,
    lifecycle: structuralAnchorLifecycle,
    fields: [
      { name: "maquina_id", type: "reference", required: true },
      { name: "state_node_id", type: "string", required: true },
    ],
  });
}

export function createEventoSpec(subtype: EventoSubtype): MetaObjectSpec {
  return elementSpec({
    id: `element-evento-${subtype}`,
    elementKind: "evento",
    subtype,
    allowedSubtypes: EventoSubtypes,
    lifecycle: structuralAnchorLifecycle,
    fields: [
      { name: "event_id", type: "reference", required: true },
      { name: "subject_id", type: "reference", required: true },
    ],
  });
}

/**
 * Transacción: el ciclo lo aporta el arquetipo (máquina propia).
 * Esta fábrica fija definición + invariantes de cierre; el lifecycle es inyectado.
 */
export function createTransaccionSpec(
  subtype: TransaccionSubtype,
  lifecycle: Lifecycle,
): MetaObjectSpec {
  return elementSpec({
    id: `element-transaccion-${subtype}`,
    elementKind: "transaccion",
    subtype,
    allowedSubtypes: TransaccionSubtypes,
    lifecycle,
    invariants: [
      {
        id: "inv_tx_estructural",
        appliesInStates: [],
        predicate: "always_true",
        description: "Invariante estructural de transacción",
      },
      ...transactionClosureInvariants,
    ],
    fields: [
      { name: "arquetipo_id", type: "string", required: true },
      { name: "oferta_version_aceptada", type: "number", required: false },
      { name: "dominante_id", type: "reference", required: false },
      { name: "vinculada_a", type: "reference", required: false },
      { name: "motivo_vinculo", type: "string", required: false },
    ],
  });
}

/** Catálogo: una plantilla por cada subtipo cerrado (transacción se completa con arquetipos). */
export function allNonTransactionElementTemplates(): MetaObjectSpec[] {
  return [
    ...ParteSubtypes.map(createParteSpec),
    ...ActorSubtypes.map(createActorSpec),
    ...OfertaSubtypes.map(createOfertaSpec),
    ...RecursoSubtypes.map(createRecursoSpec),
    ...CompromisoSubtypes.map(createCompromisoSpec),
    ...MovimientoSubtypes.map(createMovimientoSpec),
    ...EvidenciaSubtypes.map(createEvidenciaSpec),
    ...EstadoSubtypes.map(createEstadoSpec),
    ...EventoSubtypes.map(createEventoSpec),
  ];
}

export * from "./subtypes.js";
export * from "./closure.js";
export * from "./derived-lifecycles.js";
export * from "./projection.js";
export * from "./factory.js";
export * from "./exchange-direction.js";
export * from "./retention-settlement.js";
export * from "./empleado.js";
export * from "./vacaciones.js";
export * from "./activo-fijo.js";
export * from "./email-marketing.js";

// Fase 3: Contabilidad, Estadísticas, Transporte
export type { AsientoRegistro } from "../adapters/sqlite-asientos-store.js";
export type { AsientoAutomatico } from "../policies/contabilidad-automatica.js";
export type { PeriodoCerrado, CuadraturaPeriodo } from "../policies/cierre-periodo.js";
export type { BalanceGeneral, PerdidayGanancia, FlujoEfectivo } from "../web/reportes-contables.js";
export type { KPI, KPIPeriodo, ComparativaPeriodos, Alerta } from "../policies/kpi-engine.js";
export type { Tendencia, PrediccionDemanda, Anomalia, Forecast } from "../policies/predicciones.js";
export type { Dashboard } from "../web/dashboard-estadisticas.js";
export type { Ruta, Parada, ResultadoOptimizacion } from "../policies/rutas-transporte.js";
export type { TarifaProveedor, CostoRuta, ComparativaProveedores, Margen } from "../policies/costos-transporte.js";
export type { Paquete, Vehiculo, PlanificacionDia, Conflicto } from "../policies/planificador-entregas.js";

// Fase 4B: Simulador
export type {
  ModeloProyeccion,
  Tendencia as TendenciaProyección,
  EscenarioTipo,
  DatoPunto,
  ProyeccionLineal,
  ProyeccionExponencial,
  ProyeccionEstacional,
  ProyeccionPolinómica,
  Proyección,
  Escenario,
  ComparativaEscenarios,
  AnálisisSensibilidad,
  Elasticidad,
  PuntoEquilibrio,
  GráficoTornadoSensibilidad,
  GuardadoSimulación,
  ValidacionSimulación,
  AccuracyPorModelo,
  RecomendaciónModelo,
} from "./simulador.js";
