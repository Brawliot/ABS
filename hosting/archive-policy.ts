/**
 * Archivado de eventos antiguos → almacenamiento frío + snapshots.
 * No rompe replay ≡ estado: el tramo vivo + snapshot cubren el estado actual;
 * el archivo frío permanece direccionable para auditoría / replay histórico.
 */

export interface ArchivePolicy {
  /** Eventos más antiguos que N días pueden archivarse tras snapshot. */
  readonly coldAfterDays: number;
  /** Mantener al menos los últimos N eventos por subject en caliente. */
  readonly keepRecentPerSubject: number;
  /** Destino lógico (S3-compatible UE, filesystem, etc.). */
  readonly coldStorageUriTemplate: string;
}

export const DEFAULT_ARCHIVE_POLICY: ArchivePolicy = {
  coldAfterDays: 365,
  keepRecentPerSubject: 1_000,
  coldStorageUriTemplate: "file://{dataDir}/cold/{companyId}/{yyyy}/{mm}/",
};

/**
 * Estimación de volumen EventStore (orden de magnitud).
 * Payload medio ~0.5–2 KB; usamos 1 KB para dimensionar.
 */
export function estimateEventStoreGrowth(opts: {
  readonly companies: number;
  readonly eventsPerCompanyPerYear: number;
  readonly avgPayloadBytes?: number;
}): {
  readonly bytesPerYear: number;
  readonly gibPerYear: number;
  readonly note: string;
} {
  const avg = opts.avgPayloadBytes ?? 1024;
  const bytesPerYear =
    opts.companies * opts.eventsPerCompanyPerYear * avg;
  return {
    bytesPerYear,
    gibPerYear: bytesPerYear / (1024 ** 3),
    note:
      "Tras snapshot del subject, los eventos fríos pueden vivir en object storage; " +
      "replay operativo usa snapshot + cola caliente. Auditoría rehidrata frío bajo demanda.",
  };
}

/** Umbrales propuestos (PROPUESTA PARA EL USUARIO). */
export const HOSTING_THRESHOLDS = {
  /** Hasta aquí: shared por defecto. */
  preferSharedMaxCompanies: 50,
  /** A partir de aquí valorar mixto (dedicated para top N). */
  considerMixedFromCompanies: 100,
  /** Eventos/año por empresa que justifican dedicated o archive agresivo. */
  highVolumeEventsPerYear: 500_000,
  /** GiB EventStore total que disparan política de cold archive. */
  coldArchiveFromGiB: 50,
} as const;
