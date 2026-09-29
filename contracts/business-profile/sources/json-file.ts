/**
 * Fuente trivial: cargar BusinessProfile desde un archivo JSON.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BusinessProfileSource } from "../port.js";
import { BusinessProfileError } from "../types.js";

export class JsonFileBusinessProfileSource implements BusinessProfileSource {
  readonly sourceId = "json-file";

  constructor(private readonly filePath: string) {}

  load(): unknown {
    const abs = resolve(this.filePath);
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch (err) {
      throw new BusinessProfileError(
        "SCHEMA",
        `No se pudo leer el perfil: ${abs}`,
        [err instanceof Error ? err.message : String(err)],
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (err) {
      throw new BusinessProfileError(
        "SCHEMA",
        `JSON inválido en ${abs}`,
        [err instanceof Error ? err.message : String(err)],
      );
    }
  }
}

/** Atajo síncrono: path → raw. */
export function readProfileJson(filePath: string): unknown {
  return new JsonFileBusinessProfileSource(filePath).load();
}
