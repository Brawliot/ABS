/**
 * ABS_SESSION_SECRET: ≥32 caracteres aleatorios en producción; abortar arranque si no cumple.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertProductionSecurityConfig,
  sessionSecret,
} from "../auth/env.js";

describe("ABS_SESSION_SECRET en producción", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.ABS_ENV = process.env.ABS_ENV;
    saved.ABS_SESSION_SECRET = process.env.ABS_SESSION_SECRET;
    saved.NODE_ENV = process.env.NODE_ENV;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("assertProductionSecurityConfig aborta si el secreto tiene menos de 32 caracteres", () => {
    process.env.ABS_ENV = "production";
    process.env.ABS_SESSION_SECRET = "solo-16-caracteres";
    expect(() => assertProductionSecurityConfig()).toThrow(/32/);
  });

  it("sessionSecret lanza en producción sin secreto válido", () => {
    process.env.ABS_ENV = "production";
    process.env.ABS_SESSION_SECRET = "corto";
    expect(() => sessionSecret()).toThrow(/32/);
  });

  it("rechaza secretos predecibles en producción", () => {
    process.env.ABS_ENV = "production";
    process.env.ABS_SESSION_SECRET = "a".repeat(32);
    expect(() => assertProductionSecurityConfig()).toThrow(/predecible/i);
  });

  it("acepta secreto ≥32 no predecible en producción", () => {
    process.env.ABS_ENV = "production";
    process.env.ABS_SESSION_SECRET =
      "k7mQ9xR2vN4pL8wZ1bC6hJ0fD3sA5eU8yT2nM7qW4r";
    expect(() => assertProductionSecurityConfig()).not.toThrow();
    expect(sessionSecret()).toBe(process.env.ABS_SESSION_SECRET);
  });

  it("en desarrollo permite fallback sin ABS_SESSION_SECRET", () => {
    process.env.ABS_ENV = "development";
    delete process.env.ABS_SESSION_SECRET;
    expect(() => sessionSecret()).not.toThrow();
    expect(sessionSecret()).toContain("dev-only");
  });
});
