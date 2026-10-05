/**
 * Runtime Transacciones: Gestión de datos de expedientes
 * Métodos delegados desde AppRuntime
 */

import { randomUUID } from "node:crypto";
import type { AppRuntime } from "./runtime.js";
import {
  diferencias,
  proyectarTransaccion,
  validarDatos,
  type EntradaTransaccion,
  type TransaccionProyectada,
} from "../elements/transaccion.js";
import { deriveState } from "../core/derivation.js";
import { findState } from "../core/lifecycle.js";
import type { AltaEvent, DatosEvent } from "../core/events.js";
import { assertNoPiiInEventData } from "../policies/identity.js";
import { crearEtiquetador } from "../presentation/etiquetas.js";
import type { AppBootResult } from "./types.js";

export interface TransaccionesRuntimeFunctions {
  datosDe(subjectId: string): TransaccionProyectada | undefined;
  estadoDe(subjectId: string): { readonly id: string; readonly label: string; readonly kind: string } | undefined;
  puedeEditarDatos(subjectId: string): boolean;
  crearTransaccion(entrada: EntradaTransaccion, actorId: string): { ok: true; id: string } | { ok: false; errors: string[] };
  editarTransaccion(subjectId: string, entrada: EntradaTransaccion, actorId: string): { ok: true; changed: boolean } | { ok: false; errors: string[] };
}

function subjectFromAlta(alta: AltaEvent, boot: AppBootResult, n: number): any {
  const slice = boot.input.lifecycles.find((l) => l.id === alta.lifecycleId);
  return {
    id: alta.subjectId,
    lifecycleId: alta.lifecycleId,
    label: `${slice ? crearEtiquetador(boot.input).proceso(slice.id) : "Expediente"} #${n}`,
    parteId: alta.datos.parteId,
    ...(alta.sedeId ? { sedeId: alta.sedeId } : {}),
  };
}

export function createTransaccionesFunctions(runtime: AppRuntime): TransaccionesRuntimeFunctions {
  function resolverDatos(
    entrada: EntradaTransaccion,
    previos: any,
  ): { ok: true; datos: any } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    const parte = runtime.partes.get(runtime.tenantId, entrada.parteId);
    if (entrada.parteId && (!parte || parte.erasedAt)) {
      errors.push("El cliente o proveedor elegido no existe.");
    }
    const lineas: any[] = [];
    entrada.lineas.forEach((l, i) => {
      const n = i + 1;
      if (l.ofertaId) {
        const previa = previos?.lineas.find((p: any) => p.ofertaId === l.ofertaId);
        const oferta = previa?.ofertaVersion
          ? runtime.ofertas.getVersion(runtime.tenantId, l.ofertaId, previa.ofertaVersion)
          : runtime.ofertas.get(runtime.tenantId, l.ofertaId);
        if (!oferta || (!previa && !oferta.activa)) {
          errors.push(`Línea ${n}: esa oferta no está en el catálogo.`);
          return;
        }
        lineas.push({
          ofertaId: oferta.ofertaId,
          ofertaVersion: oferta.version,
          descripcion: l.descripcion?.trim() || oferta.nombre,
          cantidadMilesimas: l.cantidadMilesimas,
          precioCentimos: l.precioCentimos ?? oferta.precioCentimos,
          ivaPct: oferta.ivaPct,
        });
        return;
      }
      if (l.precioCentimos === undefined) {
        errors.push(`Línea ${n}: indica el precio.`);
        return;
      }
      lineas.push({
        descripcion: (l.descripcion ?? "").trim(),
        cantidadMilesimas: l.cantidadMilesimas,
        precioCentimos: l.precioCentimos,
        ivaPct: l.ivaPct ?? 21,
      });
    });
    const referencia = entrada.referencia?.trim();
    const notas = entrada.notas?.trim();
    const permitidos = new Set(runtime.camposDeProceso(entrada.lifecycleId).map((c) => c.campo));
    const camposEstandar = new Set(["cliente_id", "proveedor_id"]);
    const camposValidos = new Set([...permitidos, ...camposEstandar]);
    const campos: any = Object.fromEntries(
      Object.entries(entrada.campos ?? {}).filter(([k, v]: [string, any]) => camposValidos.has(k) && v !== ""),
    );
    const sliceActual = runtime.boot.input.lifecycles.find((l) => l.id === entrada.lifecycleId);
    if (!previos && !campos.cliente_id && sliceActual && (sliceActual.archetypeId === "venta" || sliceActual.archetypeId === "servicio" || sliceActual.archetypeId === "servicio_proyecto")) {
      campos.cliente_id = entrada.parteId;
    }
    if (!previos && !campos.proveedor_id && sliceActual && sliceActual.archetypeId === "compra") {
      campos.proveedor_id = entrada.parteId;
    }
    if (previos && previos.campos) {
      for (const [k, v] of Object.entries(previos.campos)) {
        if (!campos.hasOwnProperty(k) && (camposValidos.has(k) || k === "cliente_id" || k === "proveedor_id")) {
          campos[k] = v;
        }
      }
    }
    const vinculadoA = entrada.vinculadoA?.trim();
    if (vinculadoA && !runtime.principalesAbiertos().some((s) => s.id === vinculadoA) && previos?.vinculadoA !== vinculadoA) {
      errors.push("El expediente principal elegido no existe o ya está cerrado.");
    }
    const datos: any = {
      parteId: entrada.parteId,
      fecha: entrada.fecha,
      ...(referencia ? { referencia } : {}),
      ...(notas ? { notas } : {}),
      lineas,
      ...(Object.keys(campos).length > 0 ? { campos } : {}),
      ...(vinculadoA ? { vinculadoA } : {}),
    };
    errors.push(...validarDatos(datos));
    return errors.length > 0 ? { ok: false, errors } : { ok: true, datos };
  }

  return {
    datosDe(subjectId: string): TransaccionProyectada | undefined {
      return proyectarTransaccion(runtime.store.getBySubject(subjectId));
    },

    estadoDe(subjectId: string): { readonly id: string; readonly label: string; readonly kind: string } | undefined {
      const slice = runtime.lifecycleForSubject(subjectId);
      if (!slice) return undefined;
      const derived = deriveState(slice.lifecycle, runtime.store.getBySubject(subjectId));
      const st = findState(slice.lifecycle, derived.currentStateId);
      return {
        id: derived.currentStateId,
        label: runtime.etiquetas.estado(slice.id, derived.currentStateId),
        kind: st?.kind ?? "",
      };
    },

    puedeEditarDatos(subjectId: string): boolean {
      return this.estadoDe(subjectId)?.kind === "inicial";
    },

    crearTransaccion(entrada: EntradaTransaccion, actorId: string): { ok: true; id: string } | { ok: false; errors: string[] } {
      const slice = runtime.boot.input.lifecycles.find((l) => l.id === entrada.lifecycleId);
      if (!slice) return { ok: false, errors: ["Ese proceso no existe."] };
      const resolved = resolverDatos(entrada, undefined);
      if (!resolved.ok) return resolved;

      const id = `tx-${randomUUID()}`;
      const at = new Date().toISOString();

      const controlados = runtime.stockStore.controlados(runtime.tenantId);
      for (const linea of resolved.datos.lineas) {
        if (linea.ofertaId && controlados.has(linea.ofertaId)) {
          const res = runtime.stockStore.reservar(runtime.tenantId, linea.ofertaId, id, linea.cantidadMilesimas);
          if (!res.ok) {
            return { ok: false, errors: [res.error] };
          }
        }
      }

      const alta: AltaEvent = {
        id: `alta-${id}`,
        kind: "alta",
        subjectId: id,
        occurredAt: at,
        actorId,
        actorKind: "humano",
        evidence: { kind: "sistema", reference: `alta:${id}`, recordedAt: at },
        lifecycleId: slice.id,
        ...(entrada.sedeId ? { sedeId: entrada.sedeId } : {}),
        datos: resolved.datos,
      };
      assertNoPiiInEventData(alta.datos as unknown as Record<string, unknown>);
      runtime.store.append(alta);
      runtime.facts.applyEvent(runtime.tenantId, alta);
      runtime.addSubject(subjectFromAlta(alta, runtime.boot, runtime.subjects.length + 1));
      return { ok: true, id };
    },

    editarTransaccion(subjectId: string, entrada: EntradaTransaccion, actorId: string): { ok: true; changed: boolean } | { ok: false; errors: string[] } {
      const actual = this.datosDe(subjectId);
      if (!actual) return { ok: false, errors: ["Ese expediente no existe."] };
      if (!this.puedeEditarDatos(subjectId)) {
        return {
          ok: false,
          errors: ["Este expediente ya no está en su estado inicial: sus datos no se pueden cambiar."],
        };
      }
      const resolved = resolverDatos(entrada, actual.datos);
      if (!resolved.ok) return resolved;
      const cambios = diferencias(actual.datos, resolved.datos);
      if (Object.keys(cambios).length === 0) return { ok: true, changed: false };

      const at = new Date().toISOString();
      const ev: DatosEvent = {
        id: `datos-${randomUUID()}`,
        kind: "datos",
        subjectId,
        occurredAt: at,
        actorId,
        actorKind: "humano",
        evidence: { kind: "sistema", reference: `datos:${subjectId}`, recordedAt: at },
        cambios,
      };
      assertNoPiiInEventData(ev.cambios as unknown as Record<string, unknown>);
      runtime.store.append(ev);
      runtime.facts.applyEvent(runtime.tenantId, ev);
      return { ok: true, changed: true };
    },
  };
}
