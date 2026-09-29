import { defineConfig } from "vitest/config";

/** Madurez Capa 0 — tiempos largos (1M eventos, 2000 semillas, PG). */
export default defineConfig({
  test: {
    include: ["tests/maturity/capa0/**/*.test.ts"],
    environment: "node",
    testTimeout: 600_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
