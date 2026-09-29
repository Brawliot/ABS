import { defineConfig } from "vitest/config";

/** Suite principal: excluye madurez para que sus fallos no la bloqueen. */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "tests/maturity/**",
    ],
    environment: "node",
    testTimeout: 20_000,
  },
});
