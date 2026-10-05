/**
 * Runtime CRM: Gestión de notas, contactos, tareas y auditoría
 * Métodos delegados desde AppRuntime
 */

import type { AppRuntime } from "./runtime.js";

export interface CrmRuntimeFunctions {
  agregarNotaEnCliente(clienteId: string, texto: string, autorRoleId: string, esInterna: boolean): { ok: true } | { ok: false; error: string };
  notasDelCliente(clienteId: string): readonly { readonly texto: string; readonly autor: string; readonly fecha: string; readonly esInterna: boolean }[];
  contarNotasDelCliente(clienteId: string): number;
  registrarContacto(clienteId: string, datos: { readonly nombre: string; readonly telefono?: string; readonly email?: string; readonly cargo?: string; readonly esPrincipal?: boolean }): { ok: true; id: string } | { ok: false; error: string };
  contactosDelCliente(clienteId: string): readonly { readonly id: string; readonly nombre: string; readonly telefono?: string; readonly email?: string; readonly cargo?: string; readonly esPrincipal: boolean }[];
  establecerContactoPrincipal(clienteId: string, contactoId: string): void;
  crearTarea(clienteId: string, datos: { readonly texto: string; readonly fechaVencimiento?: string; readonly prioridad?: "baja" | "media" | "alta"; readonly asignadoA?: string }): { ok: true; id: string } | { ok: false; error: string };
  tareasDelCliente(clienteId: string, filtro?: "pendientes" | "todas"): readonly { readonly id: string; readonly texto: string; readonly fechaVencimiento?: string; readonly estado: "pendiente" | "completada"; readonly asignadoA?: string; readonly prioridad: "baja" | "media" | "alta" }[];
  completarTarea(tareaId: string): void;
  contarTareas(clienteId: string, estado?: "pendiente" | "completada"): number;
  registrarCambioAuditoria(clienteId: string, campo: string, valorAnterior: string | undefined, valorNuevo: string | undefined, autor: string): void;
  auditoriaDe(clienteId: string): readonly { readonly campo: string; readonly valorAnterior?: string; readonly valorNuevo?: string; readonly autor: string; readonly fecha: string }[];
}

export function createCrmFunctions(runtime: AppRuntime): CrmRuntimeFunctions {
  return {
    agregarNotaEnCliente(clienteId: string, texto: string, autorRoleId: string, esInterna: boolean): { ok: true } | { ok: false; error: string } {
      if (autorRoleId === "cliente") {
        return { ok: false, error: "Los clientes no pueden registrar notas." };
      }
      try {
        runtime.notas.registrarNota(runtime.tenantId, clienteId, texto, autorRoleId, esInterna);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    notasDelCliente(clienteId: string): readonly { readonly texto: string; readonly autor: string; readonly fecha: string; readonly esInterna: boolean }[] {
      return runtime.notas.notasDelCliente(runtime.tenantId, clienteId).map((n) => ({
        texto: n.texto,
        autor: n.autor,
        fecha: n.fecha,
        esInterna: n.esInterna,
      }));
    },

    contarNotasDelCliente(clienteId: string): number {
      return runtime.notas.contarNotasDelCliente(runtime.tenantId, clienteId);
    },

    registrarContacto(clienteId: string, datos: { readonly nombre: string; readonly telefono?: string; readonly email?: string; readonly cargo?: string; readonly esPrincipal?: boolean }): { ok: true; id: string } | { ok: false; error: string } {
      try {
        const id = runtime.contactos.registrarContacto(runtime.tenantId, clienteId, datos);
        return { ok: true, id };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    contactosDelCliente(clienteId: string): readonly { readonly id: string; readonly nombre: string; readonly telefono?: string; readonly email?: string; readonly cargo?: string; readonly esPrincipal: boolean }[] {
      return runtime.contactos.contactosDelCliente(runtime.tenantId, clienteId).map((c) => ({
        id: c.id ?? "",
        nombre: c.nombre,
        ...(c.telefono ? { telefono: c.telefono } : {}),
        ...(c.email ? { email: c.email } : {}),
        ...(c.cargo ? { cargo: c.cargo } : {}),
        esPrincipal: c.esPrincipal,
      }));
    },

    establecerContactoPrincipal(clienteId: string, contactoId: string): void {
      runtime.contactos.establecerPrincipal(runtime.tenantId, clienteId, contactoId);
    },

    crearTarea(clienteId: string, datos: { readonly texto: string; readonly fechaVencimiento?: string; readonly prioridad?: "baja" | "media" | "alta"; readonly asignadoA?: string }): { ok: true; id: string } | { ok: false; error: string } {
      try {
        const resultado = (runtime.tareas as any).crearTarea(runtime.tenantId, clienteId, {
          ...datos,
          prioridad: (datos.prioridad ?? "baja") as "baja" | "media" | "alta",
        });
        const id = typeof resultado === "string" ? resultado : (resultado as any).id;
        return { ok: true, id };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    tareasDelCliente(clienteId: string, filtro?: "pendientes" | "todas"): readonly { readonly id: string; readonly texto: string; readonly fechaVencimiento?: string; readonly estado: "pendiente" | "completada"; readonly asignadoA?: string; readonly prioridad: "baja" | "media" | "alta" }[] {
      const tareas = (runtime.tareas as any).tareasDelCliente?.(runtime.tenantId, clienteId, filtro) ?? [];
      return tareas.map((t: any) => ({
        id: t.id ?? "",
        texto: t.texto,
        ...(t.fechaVencimiento ? { fechaVencimiento: t.fechaVencimiento } : {}),
        estado: t.estado,
        ...(t.asignadoA ? { asignadoA: t.asignadoA } : {}),
        prioridad: t.prioridad ?? "baja",
      }));
    },

    completarTarea(tareaId: string): void {
      (runtime.tareas as any).completarTarea?.(runtime.tenantId, tareaId);
    },

    contarTareas(clienteId: string, estado?: "pendiente" | "completada"): number {
      return (runtime.tareas as any).contarTareas?.(runtime.tenantId, clienteId, estado) ?? 0;
    },

    registrarCambioAuditoria(clienteId: string, campo: string, valorAnterior: string | undefined, valorNuevo: string | undefined, autor: string): void {
      runtime.auditoria.registrarCambio(runtime.tenantId, clienteId, campo, valorAnterior, valorNuevo, autor);
    },

    auditoriaDe(clienteId: string): readonly { readonly campo: string; readonly valorAnterior?: string; readonly valorNuevo?: string; readonly autor: string; readonly fecha: string }[] {
      return runtime.auditoria.auditoriaDe(runtime.tenantId, clienteId).map((r) => ({
        campo: r.campo,
        ...(r.valorAnterior ? { valorAnterior: r.valorAnterior } : {}),
        ...(r.valorNuevo ? { valorNuevo: r.valorNuevo } : {}),
        autor: r.autor,
        fecha: r.fecha,
      }));
    },
  };
}
