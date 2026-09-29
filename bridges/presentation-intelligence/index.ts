/**
 * Puente presentation-intelligence: Observador de experiencia
 * entre capa 2 (escritura telemetría) y capa 3 (lectura agregada).
 */

export * from "./types.js";
export {
  pseudonymize,
  assertTelemetryPrivacy,
  buildTelemetryRecord,
  buildInsightShownRecord,
} from "./privacy.js";
export {
  ExperienceTelemetryStore,
  recordAbandonWithoutBusinessEvent,
  asReadOnlyView,
  isBusinessDomainEvent,
} from "./store.js";
export type { ExperienceReadOnlyView } from "./store.js";
export { buildRecorridoFunnel, topAbandonmentPoints } from "./funnel.js";
export {
  openLayer3Reader,
  assertLayer3ReadOnlyPort,
} from "./layer3-reader.js";
export type {
  Layer3PresentationIntelligence,
  InsightImpressionQuery,
} from "./layer3-reader.js";
