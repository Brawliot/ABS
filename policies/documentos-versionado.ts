import { randomUUID } from "crypto";

export interface Versión {
  readonly número: number;
  readonly contenido_anterior: string;
  readonly contenido_nuevo: string;
  readonly autor: string;
  readonly fecha: Date;
  readonly descripción_cambio?: string | undefined;
  readonly diff?: string | undefined;
}

export interface CambioDetectado {
  readonly línea: number;
  readonly tipo: "agregada" | "eliminada" | "modificada";
  readonly contenido_anterior?: string;
  readonly contenido_nuevo?: string;
}

export class MotorVersionado {
  private versiones: Map<string, Versión[]> = new Map();

  guardarCambio(
    documento_id: string,
    contenido_nuevo: string,
    autor: string,
    descripción?: string
  ): Versión {
    const versionesActuales = this.versiones.get(documento_id) ?? [];
    const número = versionesActuales.length + 1;

    const contenido_anterior =
      versionesActuales.length > 0
        ? versionesActuales[versionesActuales.length - 1].contenido_nuevo
        : "";

    const diff = this.calcularDiferencial(contenido_anterior, contenido_nuevo);

    const versión: Versión = {
      número,
      contenido_anterior,
      contenido_nuevo,
      autor,
      fecha: new Date(),
      descripción_cambio: descripción,
      diff,
    };

    versionesActuales.push(versión);
    this.versiones.set(documento_id, versionesActuales);

    return versión;
  }

  obtenerHistorial(documento_id: string): Versión[] {
    return this.versiones.get(documento_id) ?? [];
  }

  revertirAVersión(documento_id: string, número_versión: number): void {
    const versiones = this.versiones.get(documento_id) ?? [];
    const versionTarget = versiones.find((v) => v.número === número_versión);

    if (!versionTarget) {
      throw new Error(`Versión ${número_versión} no encontrada`);
    }

    // Crear nueva versión revertida
    const contenido_nuevo = versionTarget.contenido_nuevo;
    const contenido_anterior =
      versiones.length > 0
        ? versiones[versiones.length - 1].contenido_nuevo
        : "";

    const versionRevertida: Versión = {
      número: versiones.length + 1,
      contenido_anterior,
      contenido_nuevo,
      autor: "sistema",
      fecha: new Date(),
      descripción_cambio: `Revertida a versión ${número_versión}`,
    };

    versiones.push(versionRevertida);
    this.versiones.set(documento_id, versiones);
  }

  compararVersiones(
    documento_id: string,
    v1: number,
    v2: number
  ): { añadidas: string[]; eliminadas: string[]; modificadas: string[] } {
    const versiones = this.versiones.get(documento_id) ?? [];
    const version1 = versiones.find((v) => v.número === v1);
    const version2 = versiones.find((v) => v.número === v2);

    if (!version1 || !version2) {
      return { añadidas: [], eliminadas: [], modificadas: [] };
    }

    const lineas1 = version1.contenido_nuevo.split("\n");
    const lineas2 = version2.contenido_nuevo.split("\n");

    const añadidas = lineas2.filter((l) => !lineas1.includes(l));
    const eliminadas = lineas1.filter((l) => !lineas2.includes(l));

    // Detectar modificadas (líneas que cambiaron en posición o contenido)
    const modificadas = lineas2.filter(
      (l, idx) => lineas1[idx] && lineas1[idx] !== l
    );

    return {
      añadidas,
      eliminadas,
      modificadas,
    };
  }

  obtenerDiferencial(documento_id: string): string {
    const versiones = this.versiones.get(documento_id) ?? [];

    if (versiones.length === 0) {
      return "Sin historial";
    }

    // Retornar el diff de la última versión
    return versiones[versiones.length - 1].diff ?? "Sin cambios detectados";
  }

  private calcularDiferencial(anterior: string, nuevo: string): string {
    const lineasAntes = anterior.split("\n");
    const lineasDespués = nuevo.split("\n");

    const diff: string[] = [];

    const maxLen = Math.max(lineasAntes.length, lineasDespués.length);

    for (let i = 0; i < maxLen; i++) {
      const lineaAntes = lineasAntes[i] ?? "";
      const lineaDespués = lineasDespués[i] ?? "";

      if (lineaAntes === lineaDespués) {
        // Sin cambios
        continue;
      }

      if (!lineaAntes) {
        diff.push(`+ ${lineaDespués}`);
      } else if (!lineaDespués) {
        diff.push(`- ${lineaAntes}`);
      } else {
        diff.push(`- ${lineaAntes}`);
        diff.push(`+ ${lineaDespués}`);
      }
    }

    return diff.join("\n") || "Sin cambios";
  }

  obtenerÚltimaVersión(documento_id: string): Versión | undefined {
    const versiones = this.versiones.get(documento_id) ?? [];
    return versiones.length > 0 ? versiones[versiones.length - 1] : undefined;
  }

  obtenerVersión(documento_id: string, número: number): Versión | undefined {
    const versiones = this.versiones.get(documento_id) ?? [];
    return versiones.find((v) => v.número === número);
  }
}
