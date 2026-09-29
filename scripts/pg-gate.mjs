/**
 * Gate CI: si faltan env de PG o PERF_FULL, falla (skip = fallo en CI).
 */
const required = [
  "ABS_POSTGRES_URL",
  "ABS_POSTGRES_RESTORE_URL",
  "ABS_PERF_FULL",
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `[pg-gate] Faltan variables obligatorias: ${missing.join(", ")}`,
  );
  process.exit(1);
}
if (process.env.ABS_PERF_FULL !== "1") {
  console.error(
    "[pg-gate] ABS_PERF_FULL debe ser 1 (benchmark 100k obligatorio)",
  );
  process.exit(1);
}

console.log("[pg-gate] entorno PG + PERF_FULL OK");
