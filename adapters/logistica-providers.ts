/**
 * Proveedores de logística: interfaz e implementaciones simuladas.
 */

export interface ProveedorLogistica {
  nombre: string;
  calcularCosto(peso: number, zona: string): number;
  obtenerTracking(numeroSeguimiento: string): {
    estado: string;
    ubicacion: string;
    eta?: Date;
  };
  crearEnvio(expedienteId: string, destino: string): {
    ok: boolean;
    numeroSeguimiento: string;
  };
}

export class ProveedorDHL implements ProveedorLogistica {
  readonly nombre = "DHL";

  calcularCosto(peso: number, zona: string): number {
    const tarifaBase = 5000; // Pesos chilenos base
    const tarifaPorKg = 2500;
    const cargoZona = zona === "metropolitana" ? 0 : 5000;

    return tarifaBase + peso * tarifaPorKg + cargoZona;
  }

  obtenerTracking(numeroSeguimiento: string): {
    estado: string;
    ubicacion: string;
    eta?: Date;
  } {
    // Simulación realista
    const hash = this.hashSeguimiento(numeroSeguimiento);
    const estados = ["preparando", "en_transito", "en_distribucion", "entregado"] as const;
    const ubicaciones = ["Santiago", "Puente Alto", "La Florida", "Ñuñoa", "Destino"] as const;

    const estado: string = estados[hash % estados.length] as string;
    const ubicacion: string = ubicaciones[Math.floor(hash / 100) % ubicaciones.length] as string;
    const eta = new Date();
    eta.setDate(eta.getDate() + (hash % 5) + 1);

    return { estado, ubicacion, eta };
  }

  crearEnvio(expedienteId: string, destino: string): {
    ok: boolean;
    numeroSeguimiento: string;
  } {
    const randomStr = Math.random().toString(36);
    const randomPart: string = randomStr.substring(2, 8).toUpperCase();
    const expPart: string = expedienteId.substring(0, 8);
    const numeroSeguimiento = `DHL-${expPart}-${randomPart}`;

    return { ok: true, numeroSeguimiento };
  }

  private hashSeguimiento(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

export class ProveedorFedEx implements ProveedorLogistica {
  readonly nombre = "FedEx";

  calcularCosto(peso: number, zona: string): number {
    const tarifaBase = 7000;
    const tarifaPorKg = 3000;
    const cargoZona = zona === "metropolitana" ? 0 : 8000;

    return tarifaBase + peso * tarifaPorKg + cargoZona;
  }

  obtenerTracking(numeroSeguimiento: string): {
    estado: string;
    ubicacion: string;
    eta?: Date;
  } {
    const hash = this.hashSeguimiento(numeroSeguimiento);
    const estados = ["recibido", "en_ruta", "fuera_para_entrega", "entregado"] as const;
    const ubicaciones = [
      "Centro Distribución",
      "En Ruta",
      "Centro Local",
      "Destino",
    ] as const;

    const estado: string = estados[hash % estados.length] as string;
    const ubicacion: string = ubicaciones[Math.floor(hash / 100) % ubicaciones.length] as string;
    const eta = new Date();
    eta.setDate(eta.getDate() + (hash % 3) + 1);

    return { estado, ubicacion, eta };
  }

  crearEnvio(expedienteId: string, destino: string): {
    ok: boolean;
    numeroSeguimiento: string;
  } {
    const randomStr = Math.random().toString(36);
    const randomPart: string = randomStr.substring(2, 8).toUpperCase();
    const expPart: string = expedienteId.substring(0, 8);
    const numeroSeguimiento = `FX-${expPart}-${randomPart}`;

    return { ok: true, numeroSeguimiento };
  }

  private hashSeguimiento(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
