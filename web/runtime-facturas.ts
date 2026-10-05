/**
 * Runtime Facturas: Gestión de facturación fiscal
 * Métodos delegados desde AppRuntime
 */

import type { AppRuntime } from "./runtime.js";
import {
  decidirTipo,
  desgloseIva,
  lineasRectificativas,
  normalizarNif,
  validarEmisor,
  type DatosEmisor,
  type DatosReceptor,
  type Factura,
} from "../elements/factura.js";

export interface FacturasRuntimeFunctions {
  facturacionDe(
    expedienteId: string,
  ):
    | { readonly vigente: Factura; readonly historial: readonly Factura[] }
    | { readonly vigente?: undefined; readonly historial: readonly Factura[]; readonly puede: true; readonly tipo: "completa" | "simplificada" }
    | { readonly vigente?: undefined; readonly historial: readonly Factura[]; readonly puede: false; readonly motivo: string };
  expedirFactura(expedienteId: string, actorId: string): { ok: true; factura: Factura } | { ok: false; error: string };
  rectificarFactura(facturaId: string, motivo: string, actorId: string): { ok: true; factura: Factura } | { ok: false; error: string };
}

function fechaMadrid(isoString: string): string {
  return isoString.split("T")[0] ?? isoString;
}

export function createFacturasFunctions(runtime: AppRuntime): FacturasRuntimeFunctions {
  function receptorDe(parteId: string): DatosReceptor | undefined {
    const rec = runtime.partes.get(runtime.tenantId, parteId);
    if (!rec || rec.erasedAt || !rec.personal) return undefined;
    return {
      nombre: rec.personal.displayName,
      ...(rec.personal.taxId ? { nif: normalizarNif(rec.personal.taxId) } : {}),
      ...(rec.personal.address ? { domicilio: rec.personal.address } : {}),
    };
  }

  return {
    facturacionDe(
      expedienteId: string,
    ):
      | { readonly vigente: Factura; readonly historial: readonly Factura[] }
      | { readonly vigente?: undefined; readonly historial: readonly Factura[]; readonly puede: true; readonly tipo: "completa" | "simplificada" }
      | { readonly vigente?: undefined; readonly historial: readonly Factura[]; readonly puede: false; readonly motivo: string } {
      const historial = runtime.facturas.porExpediente(runtime.tenantId, expedienteId);
      const rectificadas = new Set(historial.filter((f) => f.rectificaA).map((f) => f.rectificaA));
      const vigente = [...historial]
        .reverse()
        .find((f) => f.tipo !== "rectificativa" && !rectificadas.has(f.codigo));
      if (vigente) return { vigente, historial };
      const e = runtime.expedientesDinero().find((x) => x.id === expedienteId);
      const no = (motivo: string) => ({ historial, puede: false as const, motivo });
      if (!e) return no("Ese expediente no existe.");
      if (e.direccion === "sale") return no("Es una compra: la factura la emite el proveedor.");
      if (e.situacion === "presupuesto") return no("Todavía es un presupuesto: se factura cuando el cliente lo acepta.");
      if (e.situacion === "sin_importe") return no("Está anulado: no hay nada que facturar.");
      const emisorErr = validarEmisor(runtime.facturas.getEmisor(runtime.tenantId));
      if (emisorErr.length > 0) return no(`Antes de facturar, completa los datos de la empresa: ${emisorErr.join(" ")}`);
      const tipo = decidirTipo(receptorDe(e.parteId), e.totalCentimos);
      if (!tipo.ok) return no(tipo.error);
      return { historial, puede: true, tipo: tipo.tipo };
    },

    expedirFactura(
      expedienteId: string,
      actorId: string,
    ): { ok: true; factura: Factura } | { ok: false; error: string } {
      const estado = this.facturacionDe(expedienteId);
      if (estado.vigente) return { ok: false, error: `Ya tiene la factura ${estado.vigente.codigo}.` };
      if (!estado.puede) return { ok: false, error: estado.motivo };
      const tx = runtime.datosDe(expedienteId)!;
      const e = runtime.expedientesDinero().find((x) => x.id === expedienteId)!;
      const emisor = runtime.facturas.getEmisor(runtime.tenantId) as DatosEmisor;
      const receptor = receptorDe(tx.datos.parteId);
      const now = new Date().toISOString();
      const fechaExpedicion = fechaMadrid(now);
      const cobro = e.movimientos[0];
      const fechaOperacion = cobro ? fechaMadrid(cobro.at) : undefined;
      const d = desgloseIva(tx.datos.lineas);
      const factura = runtime.facturas.expedir(runtime.tenantId, {
        tenantId: runtime.tenantId,
        serie: estado.tipo === "completa" ? "F" : "T",
        tipo: estado.tipo,
        expedienteId,
        parteId: tx.datos.parteId,
        fechaExpedicion,
        ...(fechaOperacion && fechaOperacion !== fechaExpedicion ? { fechaOperacion } : {}),
        emisor: {
          razonSocial: emisor.razonSocial,
          nif: normalizarNif(emisor.nif),
          domicilio: emisor.domicilio,
        },
        ...(estado.tipo === "completa" && receptor ? { receptor } : {}),
        lineas: tx.datos.lineas,
        desglose: d.desglose,
        base: d.base,
        iva: d.iva,
        total: d.total,
        expedidaEn: now,
        expedidaPor: actorId,
      });
      return { ok: true, factura };
    },

    rectificarFactura(
      facturaId: string,
      motivo: string,
      actorId: string,
    ): { ok: true; factura: Factura } | { ok: false; error: string } {
      const original = runtime.facturas.get(runtime.tenantId, facturaId);
      if (!original) return { ok: false, error: "Esa factura no existe." };
      if (original.tipo === "rectificativa") {
        return { ok: false, error: "Una rectificativa no se rectifica: expide una factura nueva." };
      }
      const todas = runtime.facturas.porExpediente(runtime.tenantId, original.expedienteId);
      if (todas.some((f) => f.rectificaA === original.codigo)) {
        return { ok: false, error: `La factura ${original.codigo} ya está rectificada.` };
      }
      const m = motivo.trim();
      if (!m) return { ok: false, error: "Indica el motivo de la rectificación." };
      if (m.length > 300) return { ok: false, error: "El motivo es demasiado largo." };
      const now = new Date().toISOString();
      const lineas = lineasRectificativas(original.lineas);
      const d = desgloseIva(lineas);
      const factura = runtime.facturas.expedir(runtime.tenantId, {
        tenantId: runtime.tenantId,
        serie: "R",
        tipo: "rectificativa",
        expedienteId: original.expedienteId,
        parteId: original.parteId,
        fechaExpedicion: fechaMadrid(now),
        emisor: original.emisor,
        ...(original.receptor ? { receptor: original.receptor } : {}),
        lineas,
        desglose: d.desglose,
        base: d.base,
        iva: d.iva,
        total: d.total,
        rectificaA: original.codigo,
        motivo: m,
        expedidaEn: now,
        expedidaPor: actorId,
      });
      return { ok: true, factura };
    },
  };
}
