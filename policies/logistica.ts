/**
 * Motor de logística: envíos, seguimiento, costos, reportes.
 */

import type { ProveedorLogistica } from "../adapters/logistica-providers.js";

export type EstadoEnvio =
  | "preparado"
  | "enviado"
  | "en_transito"
  | "entregado"
  | "devuelto";

export interface Envio {
  readonly id: string;
  readonly expedienteId: string;
  readonly proveedor: string;
  readonly numeroSeguimiento: string;
  readonly estado: EstadoEnvio;
  readonly peso: number;
  readonly zona: string;
  readonly costo: number;
  readonly destino: string;
  readonly fechaEnvio: Date | undefined;
  readonly fechaEntrega: Date | undefined;
  readonly createdAt: Date;
}

export interface ReporteLogistica {
  readonly enviosTotal: number;
  readonly tasaEntrega: number;
  readonly costoPromedio: number;
  readonly demora_promedio_dias: number;
}

export class MotorLogistica {
  private envios = new Map<string, Envio>();
  private envioContador = 0;
  private proveedores = new Map<string, ProveedorLogistica>();

  registrarProveedor(nombre: string, proveedor: ProveedorLogistica): void {
    this.proveedores.set(nombre, proveedor);
  }

  crearEnvio(
    expedienteId: string,
    nombreProveedor: string,
    destino: string,
    peso: number,
    zona: string
  ): Envio {
    const proveedor = this.proveedores.get(nombreProveedor);
    if (!proveedor) {
      throw new Error(`Proveedor ${nombreProveedor} no está registrado`);
    }

    const costo = proveedor.calcularCosto(peso, zona);
    const envioData = proveedor.crearEnvio(expedienteId, destino);

    if (!envioData.ok) {
      throw new Error(`No se pudo crear envío con ${nombreProveedor}`);
    }

    const envio: Envio = {
      id: `env-${++this.envioContador}`,
      expedienteId,
      proveedor: nombreProveedor,
      numeroSeguimiento: envioData.numeroSeguimiento,
      estado: "preparado",
      peso,
      zona,
      costo,
      destino,
      fechaEnvio: undefined,
      fechaEntrega: undefined,
      createdAt: new Date(),
    };

    this.envios.set(envio.id, envio);
    return envio;
  }

  actualizarEstadoEnvio(
    envioId: string,
    nuevoEstado: EstadoEnvio
  ): Envio {
    const envio = this.envios.get(envioId);
    if (!envio) {
      throw new Error(`Envío ${envioId} no existe`);
    }

    const updated: Envio = {
      ...envio,
      estado: nuevoEstado,
      fechaEnvio:
        nuevoEstado === "enviado"
          ? new Date()
          : envio.fechaEnvio,
      fechaEntrega:
        nuevoEstado === "entregado"
          ? new Date()
          : envio.fechaEntrega,
    };

    this.envios.set(envioId, updated);
    return updated;
  }

  obtenerTracking(numeroSeguimiento: string): {
    estado: string;
    ubicacion: string;
    eta?: Date;
  } | null {
    const envio = Array.from(this.envios.values()).find(
      (e) => e.numeroSeguimiento === numeroSeguimiento
    );

    if (!envio) return null;

    const proveedor = this.proveedores.get(envio.proveedor);
    if (!proveedor) return null;

    return proveedor.obtenerTracking(numeroSeguimiento);
  }

  calcularCostoEnvio(peso: number, zona: string, nombreProveedor: string): number {
    const proveedor = this.proveedores.get(nombreProveedor);
    if (!proveedor) {
      throw new Error(`Proveedor ${nombreProveedor} no está registrado`);
    }

    return proveedor.calcularCosto(peso, zona);
  }

  generarReporteLogistica(desde: Date, hasta: Date): ReporteLogistica {
    const enviosEnPeriodo = Array.from(this.envios.values()).filter(
      (e) =>
        e.createdAt >= desde &&
        e.createdAt <= hasta
    );

    if (enviosEnPeriodo.length === 0) {
      return {
        enviosTotal: 0,
        tasaEntrega: 0,
        costoPromedio: 0,
        demora_promedio_dias: 0,
      };
    }

    const entregados = enviosEnPeriodo.filter((e) => e.estado === "entregado");
    const costoTotal = enviosEnPeriodo.reduce((sum, e) => sum + e.costo, 0);

    const demorasDias = entregados
      .filter((e) => e.fechaEnvio && e.fechaEntrega)
      .map((e) => {
        const inicio = e.fechaEnvio!.getTime();
        const fin = e.fechaEntrega!.getTime();
        return Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24));
      });

    const demoraPromedio =
      demorasDias.length > 0
        ? demorasDias.reduce((a, b) => a + b, 0) / demorasDias.length
        : 0;

    return {
      enviosTotal: enviosEnPeriodo.length,
      tasaEntrega:
        (entregados.length / enviosEnPeriodo.length) * 100,
      costoPromedio: costoTotal / enviosEnPeriodo.length,
      demora_promedio_dias: Math.round(demoraPromedio * 100) / 100,
    };
  }

  obtenerEnvio(envioId: string): Envio | undefined {
    return this.envios.get(envioId);
  }

  listarEnvios(): Envio[] {
    return Array.from(this.envios.values());
  }
}
