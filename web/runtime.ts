/**
 * Runtime de aplicación: EventStore SQLite + ledger + proyección.
 * Las escrituras SOLO ocurren tras Intérprete → Juez (vía action-handler).
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteEventStore } from "../adapters/sqlite-event-store.js";
import { SqliteParteIdentityStore } from "../adapters/sqlite-identity-store.js";
import { SqliteOfertaCatalog } from "../adapters/sqlite-oferta-catalog.js";
import { SqliteFacturaStore } from "../adapters/sqlite-factura-store.js";
import { SqliteStockStore } from "../adapters/sqlite-stock-store.js";
import { SqliteCobrosStore } from "../adapters/sqlite-cobros-store.js";
import { SqliteDevolucionesStore } from "../adapters/sqlite-devoluciones-store.js";
import { SqliteFinanciachsStore } from "../adapters/sqlite-financiados-store.js";
import { SqliteCreditoClienteStore } from "../adapters/sqlite-credito-cliente-store.js";
import { SqliteNotasStore } from "../adapters/sqlite-notas-store.js";
import {
  cantidadesPorOferta,
  movimientosStockDe,
  resumenStock,
  type MovimientoStock,
  type ResumenProducto,
} from "../elements/stock.js";
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
import type { ArchetypeId } from "../archetypes/types.js";
import { createLlmClientFromEnv } from "../llm/index.js";
import type { LlmClient } from "../llm/index.js";
import {
  evaluateBlocks,
  type SubTransactionSnapshot,
} from "../archetypes/composed-runtime.js";
import { randomUUID } from "node:crypto";
import type {
  AltaEvent,
  DatosEvent,
  LineaDatos,
  TransaccionDatos,
  TransitionEvent,
} from "../core/events.js";
import { formatCentimos } from "../elements/oferta.js";
import {
  direccionDe,
  movimientosDe,
  situacionCobro,
  type Direccion,
  type Movimiento,
  type SituacionCobro,
} from "../elements/movimientos.js";
import {
  calcularTotales,
  diferencias,
  proyectarTransaccion,
  validarDatos,
  type EntradaTransaccion,
  type TransaccionProyectada,
} from "../elements/transaccion.js";
import { assertNoPiiInEventData } from "../policies/identity.js";
import { crearEtiquetador, type Etiquetador } from "../presentation/etiquetas.js";
import { deriveState } from "../core/derivation.js";
import { findState } from "../core/lifecycle.js";
import { redactInterfaceCopy } from "../design/copy/index.js";
import type { InterfaceCopyPack } from "../design/copy/types.js";
import { FactProvider } from "../facts/index.js";
import { IdempotencyLedger } from "../interpreter/index.js";
import type { AppBootResult, SampleRow } from "./types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface RuntimeSubject {
  readonly id: string;
  readonly lifecycleId: string;
  readonly label: string;
  readonly parteId: string;
  readonly sedeId?: string;
  readonly vinculadaA?: string;
}

/** Campos que calcula o rellena el sistema: nunca se piden en el formulario. */
const CAMPOS_DEL_SISTEMA = new Set([
  "importe",
  "parte_id",
  "subject_id",
  "sentido",
  "dias_impago",
  "recibos_pendientes",
  "compra_at",
]);

/** Estados de impago (dinero que la Parte debe). */
const ESTADOS_IMPAGO = new Set(["impagada", "no_devuelta"]);

export interface CampoProceso {
  readonly campo: string;
  readonly tipo: "numero" | "si_no" | "texto";
}

export interface ExpedienteDinero {
  readonly id: string;
  readonly label: string;
  readonly lifecycleId: string;
  readonly proceso: string;
  readonly parteId: string;
  readonly fecha: string;
  readonly referencia?: string;
  readonly direccion: Direccion;
  readonly totalCentimos: number;
  readonly estadoId: string;
  readonly estadoLabel: string;
  readonly situacion: SituacionCobro;
  readonly movimientos: readonly Movimiento[];
}

export interface FlashMessage {
  readonly kind: "ok" | "error" | "info" | "block";
  readonly text: string;
  readonly blockProcessGroupId?: string;
  readonly blockArchetypeId?: string;
  readonly idempotentReplay?: boolean;
}

export interface ActiveBlockInfo {
  readonly text: string;
  readonly processGroupId?: string;
  readonly archetypeId: string;
  readonly blockedStateId: string;
}

export class AppRuntime {
  readonly boot: AppBootResult;
  readonly store: SqliteEventStore;
  readonly facts: FactProvider;
  readonly ledger: IdempotencyLedger;
  readonly copyPack: InterfaceCopyPack;
  readonly llmClient: LlmClient;
  readonly tenantId: string;
  readonly dbPath: string;
  readonly subjects: RuntimeSubject[];
  /** Partes vivas (clientes, proveedores…): identidad persistente y cifrada. */
  readonly partes: SqliteParteIdentityStore;
  /** Catálogo de Ofertas (productos / servicios) versionado. */
  readonly ofertas: SqliteOfertaCatalog;
  /** Nombres visibles (procesos, estados, pasos) según el vocabulario del negocio. */
  readonly etiquetas: Etiquetador;
  /** Facturas expedidas (inmutables) y datos fiscales del emisor. */
  readonly facturas: SqliteFacturaStore;
  /** Productos con control de stock y ajustes manuales. */
  readonly stockStore: SqliteStockStore;
  /** Cobros parciales (señal, hitos, pagos a cuenta). */
  readonly cobros: SqliteCobrosStore;
  /** Devoluciones de productos (append-only). */
  readonly devoluciones: SqliteDevolucionesStore;
  /** Financiados (cuotas mensuales con amortización francesa). */
  readonly financiados: SqliteFinanciachsStore;
  /** Límites de crédito por cliente. */
  readonly creditoCliente: SqliteCreditoClienteStore;
  /** Notas de cliente (append-only). */
  readonly notas: SqliteNotasStore;
  flash: FlashMessage | undefined;
  /** Unidades/plazas reservadas (concurrencia de recurso). */
  private readonly reservedUnits = new Map<string, string>();
  private readonly subjectLocks = new Set<string>();
  /** Force grants de prueba/Observador (RuleSet sellado no es extensible). */
  readonly observerForceGrants: {
    transitionId: string;
    allowedRoles: readonly string[];
  }[] = [];
  /** Reglas adicionales de escenario (p. ej. hito de fase en reformas). */
  readonly extraRules: import("../policies/types.js").CompiledRule[] = [];

  effectiveRuleSet(): import("../policies/types.js").CompiledRuleSet {
    const base = this.boot.input.ruleSet;
    if (this.extraRules.length === 0) return base;
    return { ...base, rules: [...base.rules, ...this.extraRules] };
  }

  private constructor(
    boot: AppBootResult,
    store: SqliteEventStore,
    dbPath: string,
    subjects: RuntimeSubject[],
    copyPack: InterfaceCopyPack,
    tenantId: string,
    maestros: {
      readonly partes: SqliteParteIdentityStore;
      readonly ofertas: SqliteOfertaCatalog;
      readonly facturas: SqliteFacturaStore;
      readonly stock: SqliteStockStore;
      readonly cobros: SqliteCobrosStore;
      readonly devoluciones: SqliteDevolucionesStore;
      readonly financiados: SqliteFinanciachsStore;
      readonly creditoCliente: SqliteCreditoClienteStore;
      readonly notas: SqliteNotasStore;
    },
    llmClient = createLlmClientFromEnv()
  ) {
    this.boot = boot;
    this.store = store;
    this.dbPath = dbPath;
    this.partes = maestros.partes;
    this.ofertas = maestros.ofertas;
    this.facturas = maestros.facturas;
    this.stockStore = maestros.stock;
    this.cobros = maestros.cobros;
    this.devoluciones = maestros.devoluciones;
    this.financiados = maestros.financiados;
    this.creditoCliente = maestros.creditoCliente;
    this.notas = maestros.notas;
    this.etiquetas = crearEtiquetador(boot.input);
    this.facts = new FactProvider();
    this.facts.attachStore(tenantId, store);
    this.ledger = new IdempotencyLedger();
    this.copyPack = copyPack;
    this.llmClient = createLlmClientFromEnv();
    this.tenantId = tenantId;
    this.subjects = subjects;
  }

  static open(
    boot: AppBootResult,
    options?: { readonly dbPath?: string; readonly tenantId?: string },
  ): AppRuntime {
    const dir = join(ROOT, "tmp", "web-runtime");
    mkdirSync(dir, { recursive: true });
    const tenantId = options?.tenantId ?? boot.profileId;
    const dbPath =
      options?.dbPath ?? join(dir, `${tenantId}.sqlite`);
    const store = new SqliteEventStore(dbPath);

    const { pack } = redactInterfaceCopy({
      spec: boot.spec,
      tone: "cercano",
      locale: "es-ES",
      proposedAt: "2026-06-01T00:00:00.000Z",
    });

    const subjects = loadSubjects(boot, store);
    const partes = new SqliteParteIdentityStore(dbPath);
    const ofertas = new SqliteOfertaCatalog(dbPath);
    const facturas = new SqliteFacturaStore(dbPath);
    const stock = new SqliteStockStore(dbPath);
    const cobros = new SqliteCobrosStore(dbPath);
    const devoluciones = new SqliteDevolucionesStore(dbPath);
    const financiados = new SqliteFinanciachsStore(dbPath);
    const creditoCliente = new SqliteCreditoClienteStore(dbPath);
    const notas = new SqliteNotasStore(dbPath);
    seedDemoPartes(partes, tenantId, boot);
    return new AppRuntime(boot, store, dbPath, subjects, pack, tenantId, {
      partes,
      ofertas,
      facturas,
      stock,
      cobros,
      devoluciones,
      financiados,
      creditoCliente,
      notas,
    });
  }

  close(): void {
    this.store.close();
    this.partes.close();
    this.ofertas.close();
    this.facturas.close();
    this.stockStore.close();
    this.cobros.close();
    this.devoluciones.close();
    this.financiados.close();
    this.creditoCliente.close();
    this.notas.close();
  }

  setFlash(flash: FlashMessage | undefined): void {
    this.flash = flash;
  }

  /** Mutex por expediente: evita dos avances concurrentes. */
  tryLockSubject(subjectId: string): boolean {
    if (this.subjectLocks.has(subjectId)) return false;
    this.subjectLocks.add(subjectId);
    return true;
  }

  unlockSubject(subjectId: string): void {
    this.subjectLocks.delete(subjectId);
  }

  /**
   * Reserva atómica de unidad/plaza. Devuelve false si ya está tomada.
   */
  tryReserveUnit(unitId: string, subjectId: string): boolean {
    const holder = this.reservedUnits.get(unitId);
    if (holder && holder !== subjectId) return false;
    this.reservedUnits.set(unitId, subjectId);
    return true;
  }

  unitHolder(unitId: string): string | undefined {
    return this.reservedUnits.get(unitId);
  }

  addSubject(subject: RuntimeSubject): void {
    if (this.subjects.some((s) => s.id === subject.id)) return;
    (this.subjects as RuntimeSubject[]).push(subject);
  }

  /** Nombre visible de una Parte (o marcador si se borró / no existe). */
  nombreParte(parteId: string): string {
    return this.partes.resolve(this.tenantId, parteId).personal.displayName;
  }

  /**
   * Situación económica de cada expediente con datos: total, sentido del
   * dinero (entra / sale), situación de cobro y movimientos liquidados.
   */
  expedientesDinero(): ExpedienteDinero[] {
    const out: ExpedienteDinero[] = [];
    for (const sub of this.subjects) {
      const slice = this.boot.input.lifecycles.find((l) => l.id === sub.lifecycleId);
      if (!slice) continue;
      const events = this.store.getBySubject(sub.id);
      const tx = proyectarTransaccion(events);
      if (!tx) continue;
      const derived = deriveState(slice.lifecycle, events);
      const st = findState(slice.lifecycle, derived.currentStateId);
      const total = calcularTotales(tx.datos.lineas).total;
      const direccion = direccionDe(slice.exchangeDirection);
      const movimientos = movimientosDe({
        expedienteId: sub.id,
        parteId: tx.datos.parteId,
        direccion,
        lifecycle: slice.lifecycle,
        events,
        totalCentimos: total,
      });
      out.push({
        id: sub.id,
        label: sub.label,
        lifecycleId: slice.id,
        proceso: this.etiquetas.proceso(slice.id),
        parteId: tx.datos.parteId,
        fecha: tx.datos.fecha,
        ...(tx.datos.referencia ? { referencia: tx.datos.referencia } : {}),
        direccion,
        totalCentimos: total,
        estadoId: derived.currentStateId,
        estadoLabel: this.etiquetas.estado(slice.id, derived.currentStateId),
        situacion: situacionCobro({
          lifecycle: slice.lifecycle,
          stateId: derived.currentStateId,
          movimientos,
        }),
        movimientos,
      });
    }
    return out;
  }

  /**
   * Situación de facturación del expediente: su factura vigente (la última no
   * rectificada) o si se puede expedir una y, si no, por qué.
   */
  facturacionDe(
    expedienteId: string,
  ):
    | { readonly vigente: Factura; readonly historial: readonly Factura[] }
    | { readonly vigente?: undefined; readonly historial: readonly Factura[]; readonly puede: true; readonly tipo: "completa" | "simplificada" }
    | { readonly vigente?: undefined; readonly historial: readonly Factura[]; readonly puede: false; readonly motivo: string } {
    const historial = this.facturas.porExpediente(this.tenantId, expedienteId);
    const rectificadas = new Set(historial.filter((f) => f.rectificaA).map((f) => f.rectificaA));
    const vigente = [...historial]
      .reverse()
      .find((f) => f.tipo !== "rectificativa" && !rectificadas.has(f.codigo));
    if (vigente) return { vigente, historial };
    const e = this.expedientesDinero().find((x) => x.id === expedienteId);
    const no = (motivo: string) => ({ historial, puede: false as const, motivo });
    if (!e) return no("Ese expediente no existe.");
    if (e.direccion === "sale") return no("Es una compra: la factura la emite el proveedor.");
    if (e.situacion === "presupuesto") return no("Todavía es un presupuesto: se factura cuando el cliente lo acepta.");
    if (e.situacion === "sin_importe") return no("Está anulado: no hay nada que facturar.");
    const emisorErr = validarEmisor(this.facturas.getEmisor(this.tenantId));
    if (emisorErr.length > 0) return no(`Antes de facturar, completa los datos de la empresa: ${emisorErr.join(" ")}`);
    const tipo = decidirTipo(this.receptorDe(e.parteId), e.totalCentimos);
    if (!tipo.ok) return no(tipo.error);
    return { historial, puede: true, tipo: tipo.tipo };
  }

  /** Datos fiscales del cliente, tal como están hoy en su ficha. */
  private receptorDe(parteId: string): DatosReceptor | undefined {
    const rec = this.partes.get(this.tenantId, parteId);
    if (!rec || rec.erasedAt || !rec.personal) return undefined;
    return {
      nombre: rec.personal.displayName,
      ...(rec.personal.taxId ? { nif: normalizarNif(rec.personal.taxId) } : {}),
      ...(rec.personal.address ? { domicilio: rec.personal.address } : {}),
    };
  }

  /** Expide la factura del expediente (completa o simplificada). */
  expedirFactura(
    expedienteId: string,
    actorId: string,
  ): { ok: true; factura: Factura } | { ok: false; error: string } {
    const estado = this.facturacionDe(expedienteId);
    if (estado.vigente) return { ok: false, error: `Ya tiene la factura ${estado.vigente.codigo}.` };
    if (!estado.puede) return { ok: false, error: estado.motivo };
    const tx = this.datosDe(expedienteId)!;
    const e = this.expedientesDinero().find((x) => x.id === expedienteId)!;
    const emisor = this.facturas.getEmisor(this.tenantId) as DatosEmisor;
    const receptor = this.receptorDe(tx.datos.parteId);
    const now = new Date().toISOString();
    const fechaExpedicion = fechaMadrid(now);
    const cobro = e.movimientos[0];
    const fechaOperacion = cobro ? fechaMadrid(cobro.at) : undefined;
    const d = desgloseIva(tx.datos.lineas);
    const factura = this.facturas.expedir(this.tenantId, {
      tenantId: this.tenantId,
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
      // La simplificada solo lleva datos del cliente si los tiene completos
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
  }

  /**
   * Rectificativa total: misma factura en negativo, con motivo. La original
   * deja de estar vigente y el expediente se puede volver a facturar.
   */
  rectificarFactura(
    facturaId: string,
    motivo: string,
    actorId: string,
  ): { ok: true; factura: Factura } | { ok: false; error: string } {
    const original = this.facturas.get(this.tenantId, facturaId);
    if (!original) return { ok: false, error: "Esa factura no existe." };
    if (original.tipo === "rectificativa") {
      return { ok: false, error: "Una rectificativa no se rectifica: expide una factura nueva." };
    }
    const todas = this.facturas.porExpediente(this.tenantId, original.expedienteId);
    if (todas.some((f) => f.rectificaA === original.codigo)) {
      return { ok: false, error: `La factura ${original.codigo} ya está rectificada.` };
    }
    const m = motivo.trim();
    if (!m) return { ok: false, error: "Indica el motivo de la rectificación." };
    if (m.length > 300) return { ok: false, error: "El motivo es demasiado largo." };
    const now = new Date().toISOString();
    const lineas = lineasRectificativas(original.lineas);
    const d = desgloseIva(lineas);
    const factura = this.facturas.expedir(this.tenantId, {
      tenantId: this.tenantId,
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
  }

  /**
   * Datos adicionales que piden las reglas de un proceso (descuento_pct,
   * fianza_eur…). Se detectan en las reglas: no se escriben a mano por negocio.
   */
  camposDeProceso(lifecycleId: string): readonly CampoProceso[] {
    const slice = this.boot.input.lifecycles.find((l) => l.id === lifecycleId);
    if (!slice) return [];
    const transiciones = new Set(slice.lifecycle.transitions.map((t) => t.id));
    const out = new Map<string, CampoProceso>();
    for (const r of this.effectiveRuleSet().rules) {
      if (!("transitionId" in r) || !transiciones.has(r.transitionId)) continue;
      const preds: { field: string; value?: unknown }[] = [];
      // Las reglas sobre hechos (saldo, impagos…) los calcula el sistema
      if (r.kind === "condition" && !("factBinding" in r && r.factBinding)) {
        preds.push(r.predicate as { field: string; value?: unknown });
      }
      if (r.kind === "evidence_requirement" && r.when) preds.push(r.when as { field: string; value?: unknown });
      for (const p of preds) {
        if (!p?.field || !/^[a-z][a-z0-9_]{0,40}$/.test(p.field)) continue;
        if (CAMPOS_DEL_SISTEMA.has(p.field) || p.field.startsWith("hito_")) continue;
        if (out.has(p.field)) continue;
        out.set(p.field, {
          campo: p.field,
          tipo: typeof p.value === "boolean" ? "si_no" : typeof p.value === "number" ? "numero" : "texto",
        });
      }
    }
    return [...out.values()].sort((a, b) => a.campo.localeCompare(b.campo));
  }

  /** ¿El proceso es secundario de la composición (p. ej. financiación de una venta)? */
  esSecundario(lifecycleId: string): boolean {
    const comp = this.boot.input.composition;
    const slice = this.boot.input.lifecycles.find((l) => l.id === lifecycleId);
    return !!comp && !!slice && comp.secondaries.some((s) => s.secondaryArchetypeId === slice.archetypeId);
  }

  /** Expedientes principales abiertos a los que se puede vincular un secundario. */
  principalesAbiertos(): readonly RuntimeSubject[] {
    const comp = this.boot.input.composition;
    if (!comp) return [];
    return this.subjects.filter((s) => {
      const slice = this.boot.input.lifecycles.find((l) => l.id === s.lifecycleId);
      if (slice?.archetypeId !== comp.dominant) return false;
      return !(this.estadoDe(s.id)?.kind ?? "").startsWith("terminal");
    });
  }

  /** Secundarios vinculados a un expediente principal. */
  vinculadosA(principalId: string): readonly RuntimeSubject[] {
    return this.subjects.filter((s) => this.datosDe(s.id)?.datos.vinculadoA === principalId);
  }

  /** Impagos de una Parte: días desde el más antiguo y número de recibos. */
  impagosDe(parteId: string, nowMs = Date.now()): { readonly dias: number; readonly recibos: number } {
    let oldest: number | undefined;
    let recibos = 0;
    for (const sub of this.subjects) {
      const events = this.store.getBySubject(sub.id);
      const tx = proyectarTransaccion(events);
      if (tx?.datos.parteId !== parteId) continue;
      const estado = this.estadoDe(sub.id)?.id ?? "";
      if (!ESTADOS_IMPAGO.has(estado)) continue;
      recibos += 1;
      const entrada = [...events]
        .reverse()
        .find((e) => e.kind !== "alta" && e.kind !== "datos" && "toStateId" in e && e.toStateId === estado);
      const t = Date.parse(entrada?.occurredAt ?? tx.creadaEn);
      if (oldest === undefined || t < oldest) oldest = t;
    }
    return {
      dias: oldest === undefined ? 0 : Math.max(0, Math.floor((nowMs - oldest) / 86_400_000)),
      recibos,
    };
  }

  /**
   * Existencias de los productos con control de stock: resumen por producto
   * y todos los movimientos (ajustes + entregas / recepciones).
   */
  stock(): { readonly productos: readonly ResumenProducto[]; readonly movimientos: readonly MovimientoStock[] } {
    const controlados = this.stockStore.controlados(this.tenantId);
    const ids = new Set(controlados.keys());
    const movimientos: MovimientoStock[] = [...this.stockStore.ajustes(this.tenantId)];
    const pendientes: { direccion: Direccion; lineas: readonly LineaDatos[] }[] = [];
    if (ids.size > 0) {
      for (const e of this.expedientesDinero()) {
        const slice = this.boot.input.lifecycles.find((l) => l.id === e.lifecycleId)!;
        const events = this.store.getBySubject(e.id);
        const lineas = proyectarTransaccion(events)!.datos.lineas;
        movimientos.push(
          ...movimientosStockDe({
            expedienteId: e.id,
            archetypeId: slice.archetypeId,
            lifecycle: slice.lifecycle,
            direccion: e.direccion,
            lineas,
            events,
            controlados: ids,
          }),
        );
        if (e.situacion === "pendiente" && ["venta", "servicio_proyecto"].includes(slice.archetypeId)) {
          pendientes.push({ direccion: e.direccion, lineas });
        }
      }
    }
    movimientos.sort((a, b) => a.at.localeCompare(b.at));
    return { productos: resumenStock({ controlados, movimientos, pendientes }), movimientos };
  }

  /** Activa / desactiva el control de stock de un producto y fija su mínimo. */
  configurarStock(
    ofertaId: string,
    control: boolean,
    minimoMilesimas: number,
  ): { ok: true } | { ok: false; error: string } {
    if (!this.ofertas.get(this.tenantId, ofertaId)) return { ok: false, error: "Ese producto no existe." };
    if (!Number.isSafeInteger(minimoMilesimas) || minimoMilesimas < 0) {
      return { ok: false, error: "El mínimo no es válido." };
    }
    this.stockStore.configurar(
      this.tenantId,
      { ofertaId, control, minimo: minimoMilesimas },
      new Date().toISOString(),
    );
    return { ok: true };
  }

  /**
   * Ajuste manual: entrada o salida de una cantidad, o recuento (se indica la
   * cantidad real y se registra la diferencia). Siempre con motivo.
   */
  ajustarStock(
    ofertaId: string,
    tipo: "entrada" | "salida" | "recuento",
    cantidadMilesimas: number,
    motivo: string,
    actorId: string,
  ): { ok: true; delta: number } | { ok: false; error: string } {
    if (!this.stockStore.controlados(this.tenantId).has(ofertaId)) {
      return { ok: false, error: "Ese producto no tiene activado el control de stock." };
    }
    const m = motivo.trim();
    if (!m) return { ok: false, error: "Indica el motivo del ajuste." };
    if (m.length > 200) return { ok: false, error: "El motivo es demasiado largo." };
    if (!Number.isSafeInteger(cantidadMilesimas) || cantidadMilesimas < 0 || (tipo !== "recuento" && cantidadMilesimas === 0)) {
      return { ok: false, error: "La cantidad no es válida." };
    }
    const actual = this.stock().productos.find((p) => p.ofertaId === ofertaId)?.stock ?? 0;
    const delta =
      tipo === "entrada" ? cantidadMilesimas : tipo === "salida" ? -cantidadMilesimas : cantidadMilesimas - actual;
    if (delta === 0) return { ok: true, delta: 0 };
    this.stockStore.ajustar(this.tenantId, {
      ofertaId,
      delta,
      motivo: m,
      actorId,
      at: new Date().toISOString(),
    });
    return { ok: true, delta };
  }

  /**
   * Productos de un expediente de venta que no hay disponibles en cantidad
   * suficiente (aviso; no bloquea).
   */
  faltasStock(expedienteId: string): { readonly ofertaId: string; readonly necesita: number; readonly disponible: number }[] {
    const e = this.expedientesDinero().find((x) => x.id === expedienteId);
    if (!e || e.direccion !== "entra" || (e.situacion !== "presupuesto" && e.situacion !== "pendiente")) return [];
    const productos = this.stock().productos;
    if (productos.length === 0) return [];
    const lineas = this.datosDe(expedienteId)!.datos.lineas;
    const ids = new Set(productos.map((p) => p.ofertaId));
    const out: { ofertaId: string; necesita: number; disponible: number }[] = [];
    for (const [ofertaId, q] of cantidadesPorOferta(lineas, ids)) {
      const p = productos.find((x) => x.ofertaId === ofertaId)!;
      // Si ya está aceptado, su propia reserva cuenta como disponible para él
      const disponible = p.disponible + (e.situacion === "pendiente" ? q : 0);
      if (q > disponible) out.push({ ofertaId, necesita: q, disponible });
    }
    return out;
  }

  registrarCobro(
    expedienteId: string,
    {
      importeCentimos,
      hitoId,
      medio,
    }: {
      readonly importeCentimos: number;
      readonly hitoId?: string;
      readonly medio: string;
    },
    actorId: string,
  ): { ok: true } | { ok: false; error: string } {
    if (!Number.isSafeInteger(importeCentimos) || importeCentimos <= 0) {
      return { ok: false, error: "El importe debe ser mayor que 0." };
    }
    const tx = this.datosDe(expedienteId);
    if (!tx) return { ok: false, error: "El expediente no existe." };
    const totalCobrado = this.cobros.totalParcial(this.tenantId, expedienteId);
    const totalPendiente = (tx.datos.lineas.reduce((sum, l) => sum + l.precioCentimos * l.cantidadMilesimas / 1000, 0));
    if (totalCobrado + importeCentimos > totalPendiente) {
      return { ok: false, error: "El cobro supera el importe total del expediente." };
    }
    this.cobros.registrar(this.tenantId, {
      expediente: expedienteId,
      importeCentimos,
      fecha: new Date().toISOString(),
      ...(hitoId ? { hitoId } : {}),
      medio,
      actor: actorId,
    });
    return { ok: true };
  }

  /** Cobros parciales de un expediente. */
  cobrosDelExpediente(expedienteId: string): readonly { readonly importeCentimos: number; readonly fecha: string; readonly hitoId?: string; readonly medio: string; readonly actor: string }[] {
    return this.cobros.deExpediente(this.tenantId, expedienteId);
  }

  /** Total cobrado en un expediente. */
  totalCobradoDe(expedienteId: string): number {
    return this.cobros.totalParcial(this.tenantId, expedienteId);
  }

  devolver(
    expedienteId: string,
    lineas: readonly { readonly ofertaId: string; readonly cantidadMilesimas: number }[],
    motivo: string,
    actorId: string,
    plazoDevolucionDias: number = 30,
  ): { ok: true } | { ok: false; error: string } {
    const estado = this.estadoDe(expedienteId);
    if (!estado) return { ok: false, error: "El expediente no existe." };
    if (estado.kind !== "terminal_exito") {
      return { ok: false, error: "Solo se puede devolver expedientes cerrados con éxito." };
    }
    const tx = this.datosDe(expedienteId);
    if (!tx) return { ok: false, error: "El expediente no tiene datos." };
    const events = this.store.getBySubject(expedienteId) as import("../core/events.js").DomainEvent[];
    if (events.length === 0) return { ok: false, error: "El expediente sin eventos." };
    const ultimoEvento = events[events.length - 1]!;
    const ahora = new Date();
    const entrega = new Date(ultimoEvento.occurredAt);
    const diasTranscurridos = (ahora.getTime() - entrega.getTime()) / (1000 * 60 * 60 * 24);
    if (diasTranscurridos > plazoDevolucionDias) {
      return { ok: false, error: `El plazo de devolución de ${plazoDevolucionDias} días ha expirado.` };
    }
    const m = motivo.trim();
    if (!m) return { ok: false, error: "Indica el motivo de la devolución." };
    if (m.length > 500) return { ok: false, error: "El motivo es demasiado largo." };
    if (lineas.length === 0) return { ok: false, error: "Selecciona al menos una línea para devolver." };
    let totalDevuelto = 0;
    for (const linea of lineas) {
      const oferta = tx.datos.lineas.find((l) => l.descripcion === linea.ofertaId || l.precioCentimos === linea.cantidadMilesimas);
      if (!oferta) return { ok: false, error: `Línea ${linea.ofertaId} no encontrada en el expediente.` };
      if (linea.cantidadMilesimas > oferta.cantidadMilesimas) {
        return { ok: false, error: `No se puede devolver más de lo vendido de ${linea.ofertaId}.` };
      }
      totalDevuelto += oferta.precioCentimos * linea.cantidadMilesimas / 1000;
    }
    this.devoluciones.registrar(this.tenantId, {
      expediente: expedienteId,
      lineas,
      importeCentimos: Math.round(totalDevuelto),
      fecha: new Date().toISOString(),
      motivo: m,
      actor: actorId,
    });
    return { ok: true };
  }

  /** Devoluciones de un expediente. */
  devolucionesDelExpediente(expedienteId: string): readonly { readonly lineas: readonly { readonly ofertaId: string; readonly cantidadMilesimas: number }[]; readonly importeCentimos: number; readonly fecha: string; readonly motivo: string; readonly actor: string }[] {
    return this.devoluciones.delExpediente(this.tenantId, expedienteId);
  }

  /** Total devuelto en un expediente. */
  totalDevueltoEn(expedienteId: string): number {
    return this.devoluciones.totalDevuelto(this.tenantId, expedienteId);
  }

  /** Crea un financiado con cuotas mensuales (amortización francesa). */
  crearFinanciado(
    expedienteId: string,
    importeCentimos: number,
    plazoMeses: number,
    tasaInteres: number,
    actorId: string,
  ): { ok: true; financiadoId: string } | { ok: false; error: string } {
    if (plazoMeses <= 0) return { ok: false, error: "El plazo debe ser mayor a 0 meses." };
    if (importeCentimos <= 0) return { ok: false, error: "El importe debe ser mayor a 0." };
    if (tasaInteres < 0) return { ok: false, error: "La tasa de interés no puede ser negativa." };

    const financiadoId = `fin-${randomUUID()}`;
    const now = new Date().toISOString();

    let cuotaMensualCentimos: number;
    if (tasaInteres <= 0) {
      cuotaMensualCentimos = Math.ceil(importeCentimos / plazoMeses);
    } else {
      const tasaMensual = tasaInteres / 100 / 12;
      const cuotaMensualNum = (importeCentimos / 100) * (
        (tasaMensual * Math.pow(1 + tasaMensual, plazoMeses)) /
        (Math.pow(1 + tasaMensual, plazoMeses) - 1)
      );
      cuotaMensualCentimos = Math.round(cuotaMensualNum * 100);
    }

    this.financiados.crearFinanciado(this.tenantId, {
      id: financiadoId,
      expedienteOrigen: expedienteId,
      plazoMeses,
      tasaInteres,
      cuotaMensualCentimos,
      fecha: now,
    });

    for (let i = 1; i <= plazoMeses; i++) {
      const vencimiento = new Date(now);
      vencimiento.setMonth(vencimiento.getMonth() + i);
      this.financiados.agregarCuota(this.tenantId, {
        financiadoId,
        numeroOrden: i,
        vencimientoEn: vencimiento.toISOString(),
        importeCentimos: cuotaMensualCentimos,
      });
    }

    return { ok: true, financiadoId };
  }

  /** Obtiene el financiado activo de un expediente. */
  financiadoDe(expedienteId: string): { readonly id: string; readonly plazoMeses: number; readonly tasaInteres: number; readonly cuotaMensualCentimos: number; readonly cuotas: readonly { readonly numeroOrden: number; readonly vencimientoEn: string; readonly importeCentimos: number; readonly estado: "pendiente" | "pagada" | "cancelada"; }[] } | undefined {
    const fin = this.financiados.deExpediente(this.tenantId, expedienteId);
    if (!fin) return undefined;
    const cuotas = this.financiados.cuotasDelFinanciado(this.tenantId, fin.id!).map((c) => ({
      numeroOrden: c.numeroOrden,
      vencimientoEn: c.vencimientoEn,
      importeCentimos: c.importeCentimos,
      estado: c.estado,
    }));
    return {
      id: fin.id!,
      plazoMeses: fin.plazoMeses,
      tasaInteres: fin.tasaInteres,
      cuotaMensualCentimos: fin.cuotaMensualCentimos,
      cuotas,
    };
  }

  /** Paga una cuota de un financiado. */
  pagarCuotaFinanciado(
    expedienteId: string,
    numeroOrden: number,
    actorId: string,
  ): { ok: true } | { ok: false; error: string } {
    const fin = this.financiados.deExpediente(this.tenantId, expedienteId);
    if (!fin) return { ok: false, error: "Este expediente no tiene un financiado." };

    const cuotas = this.financiados.cuotasDelFinanciado(this.tenantId, fin.id!);
    const cuota = cuotas.find((c) => c.numeroOrden === numeroOrden);
    if (!cuota) return { ok: false, error: `No existe la cuota ${numeroOrden}.` };
    if (cuota.estado !== "pendiente") return { ok: false, error: `La cuota ${numeroOrden} ya está pagada o cancelada.` };

    const now = new Date().toISOString();
    this.financiados.pagarCuota(this.tenantId, fin.id!, numeroOrden, now);

    const todasPagadas = cuotas.every((c) => c.estado === "pagada" || c.numeroOrden === numeroOrden);
    if (todasPagadas) {
      this.financiados.actualizarEstadoFinanciado(this.tenantId, fin.id!, "pagado");
    }

    return { ok: true };
  }

  /** Obtiene la situación de crédito del cliente. */
  creditoDelCliente(clienteId: string): { readonly activo: number; readonly limite: number; readonly disponible: number; readonly enBloqueo: boolean } {
    const limite = this.creditoCliente.obtenerLimite(this.tenantId, clienteId);
    const activo = this.expedientesDinero()
      .filter((e) => e.parteId === clienteId && e.direccion === "entra" && e.situacion === "pendiente")
      .reduce((sum, e) => sum + e.totalCentimos, 0);
    const enBloqueo = this.impagosDe(clienteId).dias > 0 || this.impagosDe(clienteId).recibos > 0;
    return {
      activo,
      limite,
      disponible: Math.max(0, limite - activo),
      enBloqueo,
    };
  }

  /** Establece el límite de crédito para un cliente. */
  establecerLimiteCredito(clienteId: string, limiteCentimos: number): void {
    this.creditoCliente.establecerLimite(this.tenantId, clienteId, limiteCentimos);
  }

  /** Reserva stock para un expediente. */
  reservarStock(
    expedienteId: string,
    ofertaId: string,
    cantidadMilesimas: number,
  ): { ok: true } | { ok: false; error: string } {
    return this.stockStore.reservar(this.tenantId, ofertaId, expedienteId, cantidadMilesimas);
  }

  /** Obtiene reservas activas de un expediente. */
  reservasDelExpediente(expedienteId: string): readonly { readonly ofertaId: string; readonly cantidadMilesimas: number; readonly estado: "reservada" | "confirmada" | "cancelada" }[] {
    return this.stockStore.reservasDelExpediente(this.tenantId, expedienteId);
  }

  /** Confirma todas las reservas de un expediente. */
  confirmarStockDelExpediente(expedienteId: string): void {
    this.stockStore.confirmarReservas(this.tenantId, expedienteId);
  }

  /** Cancela todas las reservas de un expediente. */
  cancelarStockDelExpediente(expedienteId: string): void {
    this.stockStore.cancelarReservas(this.tenantId, expedienteId);
  }

  /** Campos de hitos pagados calculados dinámicamente basado en cobros. */
  camposHitosPagados(
    expedienteId: string,
  ): Record<string, boolean> {
    const tx = this.datosDe(expedienteId);
    if (!tx) return {};
    const totalCobrado = this.totalCobradoDe(expedienteId);
    const totalExpediente = tx.datos.lineas.reduce(
      (sum, l) => sum + l.precioCentimos * l.cantidadMilesimas / 1000,
      0,
    );
    if (totalExpediente === 0) return {};
    const out: Record<string, boolean> = {};
    const ruleSet = this.effectiveRuleSet();
    const hitosFields = new Set<string>();
    for (const r of ruleSet.rules) {
      if (r.kind === "condition" && "predicate" in r && r.predicate?.field?.startsWith("hito_")) {
        hitosFields.add(r.predicate.field);
      }
    }
    for (const field of hitosFields) {
      const match = field.match(/^hito_(.+)_cobrado$/);
      if (!match?.[1]) continue;
      const hitoId = match[1];
      let hitoTarget = 0;
      const cobrosDelHito = this.cobrosDelExpediente(expedienteId).filter(
        (c) => c.hitoId === hitoId,
      );
      if (cobrosDelHito.length > 0) {
        hitoTarget = cobrosDelHito.reduce((sum, c) => sum + c.importeCentimos, 0);
      } else {
        const pctMatch = hitoId.match(/(\d+)/);
        if (pctMatch?.[1]) {
          const pct = Number(pctMatch[1]) / 100;
          hitoTarget = Math.round(totalExpediente * pct);
        }
      }
      out[field] = totalCobrado >= hitoTarget;
    }
    return out;
  }

  /** Datos de negocio actuales del expediente (cliente, líneas…). */
  datosDe(subjectId: string): TransaccionProyectada | undefined {
    return proyectarTransaccion(this.store.getBySubject(subjectId));
  }

  /** Estado actual del expediente, con su tipo (inicial, intermedio…). */
  estadoDe(
    subjectId: string,
  ): { readonly id: string; readonly label: string; readonly kind: string } | undefined {
    const slice = this.lifecycleForSubject(subjectId);
    if (!slice) return undefined;
    const derived = deriveState(
      slice.lifecycle,
      this.store.getBySubject(subjectId),
    );
    const st = findState(slice.lifecycle, derived.currentStateId);
    return {
      id: derived.currentStateId,
      label: this.etiquetas.estado(slice.id, derived.currentStateId),
      kind: st?.kind ?? "",
    };
  }

  /** Los datos solo se editan en el estado inicial (presupuesto / propuesta). */
  puedeEditarDatos(subjectId: string): boolean {
    return this.estadoDe(subjectId)?.kind === "inicial";
  }

  /**
   * Alta de un expediente con sus datos. Resuelve las líneas del catálogo
   * (copia precio y versión vigentes) y registra un evento `alta`.
   */
  crearTransaccion(
    entrada: EntradaTransaccion,
    actorId: string,
  ): { ok: true; id: string } | { ok: false; errors: string[] } {
    const slice = this.boot.input.lifecycles.find(
      (l) => l.id === entrada.lifecycleId,
    );
    if (!slice) return { ok: false, errors: ["Ese proceso no existe."] };
    const resolved = this.resolverDatos(entrada, undefined);
    if (!resolved.ok) return resolved;

    const id = `tx-${randomUUID()}`;
    const at = new Date().toISOString();
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
    this.store.append(alta);
    this.facts.applyEvent(this.tenantId, alta);
    this.addSubject(subjectFromAlta(alta, this.boot, this.subjects.length + 1));
    return { ok: true, id };
  }

  /**
   * Cambia los datos de un expediente en estado inicial. Solo registra los
   * campos que cambian; si no cambia nada, no escribe ningún evento.
   */
  editarTransaccion(
    subjectId: string,
    entrada: EntradaTransaccion,
    actorId: string,
  ): { ok: true; changed: boolean } | { ok: false; errors: string[] } {
    const actual = this.datosDe(subjectId);
    if (!actual) return { ok: false, errors: ["Ese expediente no existe."] };
    if (!this.puedeEditarDatos(subjectId)) {
      return {
        ok: false,
        errors: [
          "Este expediente ya no está en su estado inicial: sus datos no se pueden cambiar.",
        ],
      };
    }
    const resolved = this.resolverDatos(entrada, actual.datos);
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
    this.store.append(ev);
    this.facts.applyEvent(this.tenantId, ev);
    return { ok: true, changed: true };
  }

  /**
   * Convierte la entrada del formulario en datos guardables:
   * - la Parte debe existir y no estar borrada;
   * - una línea de catálogo toma descripción, precio e IVA de la Oferta
   *   (el precio se puede ajustar); una línea que ya estaba conserva su versión.
   */
  private resolverDatos(
    entrada: EntradaTransaccion,
    previos: TransaccionDatos | undefined,
  ): { ok: true; datos: TransaccionDatos } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    const parte = this.partes.get(this.tenantId, entrada.parteId);
    if (entrada.parteId && (!parte || parte.erasedAt)) {
      errors.push("El cliente o proveedor elegido no existe.");
    }
    const lineas: LineaDatos[] = [];
    entrada.lineas.forEach((l, i) => {
      const n = i + 1;
      if (l.ofertaId) {
        const previa = previos?.lineas.find((p) => p.ofertaId === l.ofertaId);
        const oferta = previa?.ofertaVersion
          ? this.ofertas.getVersion(this.tenantId, l.ofertaId, previa.ofertaVersion)
          : this.ofertas.get(this.tenantId, l.ofertaId);
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
    const permitidos = new Set(this.camposDeProceso(entrada.lifecycleId).map((c) => c.campo));
    const campos = Object.fromEntries(
      Object.entries(entrada.campos ?? {}).filter(([k, v]) => permitidos.has(k) && v !== ""),
    );
    const vinculadoA = entrada.vinculadoA?.trim();
    if (vinculadoA && !this.principalesAbiertos().some((s) => s.id === vinculadoA) && previos?.vinculadoA !== vinculadoA) {
      errors.push("El expediente principal elegido no existe o ya está cerrado.");
    }
    const datos: TransaccionDatos = {
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

  /** Filas de UI derivadas solo de eventos (no estado local de cliente). */
  projectRows(filter?: {
    readonly sedeId?: string;
    readonly sedeScoped?: boolean;
  }): readonly SampleRow[] {
    const rows: SampleRow[] = [];
    for (const sub of this.subjects) {
      if (
        filter?.sedeScoped &&
        filter.sedeId &&
        sub.sedeId &&
        sub.sedeId !== filter.sedeId
      ) {
        continue;
      }
      const slice = this.boot.input.lifecycles.find(
        (l) => l.id === sub.lifecycleId,
      );
      if (!slice) continue;
      const events = this.store.getBySubject(sub.id);
      const derived = deriveState(slice.lifecycle, events);
      const state = findState(slice.lifecycle, derived.currentStateId);
      const tx = proyectarTransaccion(events);
      const parteId = tx?.datos.parteId ?? sub.parteId;
      rows.push({
        id: sub.id,
        label: sub.label,
        stateId: derived.currentStateId,
        lifecycleId: sub.lifecycleId,
        parteId,
        ...(tx
          ? {
              detalle: {
                cliente: this.nombreParte(parteId),
                fecha: tx.datos.fecha,
                total: formatCentimos(calcularTotales(tx.datos.lineas).total),
                ...(tx.datos.referencia ? { referencia: tx.datos.referencia } : {}),
              },
            }
          : {}),
        meta: `estado=${derived.currentStateId}${state ? ` (${state.label})` : ""}${sub.vinculadaA ? ` · vinculada_a=${sub.vinculadaA}` : ""}`,
        ...(sub.sedeId !== undefined ? { sedeId: sub.sedeId } : {}),
        ...(sub.vinculadaA !== undefined
          ? { vinculadaA: sub.vinculadaA }
          : {}),
      });
    }
    for (const v of this.boot.spec.views) {
      if (
        v.kind === "panel_agenda" ||
        v.kind === "panel_retencion" ||
        v.kind === "panel_credito" ||
        v.kind === "panel_periodos"
      ) {
        rows.push({
          id: `panel-info-${v.kind}`,
          label: `Indicador: ${this.etiquetas.vista(v)}`,
          stateId: null,
          parteId: this.subjects[0]?.parteId ?? "parte-demo-1",
          meta: v.kind,
        });
      }
    }
    return rows;
  }

  /**
   * Bloqueos de composición activos: qué secundario falta y a qué processGroup enlazar.
   */
  activeBlocks(): readonly ActiveBlockInfo[] {
    const composition = this.boot.input.composition;
    if (!composition) return [];

    const subs: SubTransactionSnapshot[] = [];
    for (const sub of this.subjects) {
      const slice = this.boot.input.lifecycles.find(
        (l) => l.id === sub.lifecycleId,
      );
      if (!slice) continue;
      const isSec = composition.secondaries.some(
        (s) => s.secondaryArchetypeId === slice.archetypeId,
      );
      if (!isSec) continue;
      const events = this.store.getBySubject(sub.id) as TransitionEvent[];
      // Un secundario solo bloquea al expediente principal al que está vinculado
      if (!proyectarTransaccion(events)?.datos.vinculadoA) continue;
      const derived = deriveState(slice.lifecycle, events);
      const st = findState(slice.lifecycle, derived.currentStateId);
      if (!st) continue;
      subs.push({
        instanceId: sub.id,
        secondaryArchetypeId: slice.archetypeId as ArchetypeId,
        currentStateId: derived.currentStateId,
        stateKind: st.kind,
      });
    }

    const out: ActiveBlockInfo[] = [];
    const seen = new Set<string>();
    for (const sec of composition.secondaries) {
      const blocks = evaluateBlocks(composition, sec.bloquea, subs).filter(
        (b) => b.blocksTransition,
      );
      for (const b of blocks) {
        const key = `${b.secondaryArchetypeId}:${sec.bloquea}:${b.instanceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const pgId = this.boot.spec.processGroups?.find(
          (g) => g.archetypeId === b.secondaryArchetypeId,
        )?.id;
        out.push({
          text: `${this.subjects.find((x) => x.id === this.datosDe(b.instanceId)?.datos.vinculadoA)?.label ?? "Un expediente"} necesita completar ${this.subjects.find((x) => x.id === b.instanceId)?.label ?? this.etiquetas.arquetipo(b.secondaryArchetypeId)} para poder pasar a «${this.etiquetas.estado(null, sec.bloquea)}».`,
          ...(pgId !== undefined ? { processGroupId: pgId } : {}),
          archetypeId: b.secondaryArchetypeId,
          blockedStateId: sec.bloquea,
        });
      }
    }
    return out;
  }

  lifecycleForSubject(subjectId: string) {
    const sub = this.subjects.find((s) => s.id === subjectId);
    if (!sub) return undefined;
    return this.boot.input.lifecycles.find((l) => l.id === sub.lifecycleId);
  }

  actionById(actionId: string) {
    return this.boot.spec.actions.find((a) => a.id === actionId);
  }

  agregarNotaEnCliente(
    clienteId: string,
    texto: string,
    autorRoleId: string,
    esInterna: boolean,
  ): { ok: true } | { ok: false; error: string } {
    if (autorRoleId === "cliente") {
      return { ok: false, error: "Los clientes no pueden registrar notas." };
    }
    try {
      this.notas.registrarNota(this.tenantId, clienteId, texto, autorRoleId, esInterna);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  notasDelCliente(clienteId: string): readonly { readonly texto: string; readonly autor: string; readonly fecha: string; readonly esInterna: boolean }[] {
    return this.notas.notasDelCliente(this.tenantId, clienteId).map((n) => ({
      texto: n.texto,
      autor: n.autor,
      fecha: n.fecha,
      esInterna: n.esInterna,
    }));
  }

  contarNotasDelCliente(clienteId: string): number {
    return this.notas.contarNotasDelCliente(this.tenantId, clienteId);
  }
}

/**
 * Con el almacén vacío, da de alta como clientes las Partes de ejemplo a las
 * que apuntan los expedientes demo, para que tengan nombre y ficha reales.
 */
/** AAAA-MM-DD en hora de Madrid. */
function fechaMadrid(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function seedDemoPartes(
  partes: SqliteParteIdentityStore,
  tenantId: string,
  boot: AppBootResult,
): void {
  if (partes.list(tenantId).length > 0) return;
  for (const p of boot.samplePartes) {
    partes.put(
      tenantId,
      p.id,
      { displayName: p.label },
      "2026-01-01T00:00:00.000Z",
      "cliente",
    );
  }
}

/**
 * Expedientes = eventos `alta` del almacén. Con el almacén sin altas (negocio
 * nuevo o base de datos anterior a los datos de transacción), registra las altas
 * de los expedientes demo con los mismos ids, así el historial previo encaja.
 */
function loadSubjects(
  boot: AppBootResult,
  store: SqliteEventStore,
): RuntimeSubject[] {
  let altas = store.all().filter((e): e is AltaEvent => e.kind === "alta");
  if (altas.length === 0) {
    const at = "2026-06-01T00:00:00.000Z";
    for (const s of seedSubjects(boot)) {
      store.append({
        id: `alta-${s.id}`,
        kind: "alta",
        subjectId: s.id,
        occurredAt: at,
        actorId: "sistema-demo",
        actorKind: "sistema",
        evidence: { kind: "sistema", reference: "seed-demo", recordedAt: at },
        lifecycleId: s.lifecycleId,
        ...(s.sedeId ? { sedeId: s.sedeId } : {}),
        datos: {
          parteId: s.parteId,
          fecha: at.slice(0, 10),
          referencia: "demo",
          lineas: [
            {
              descripcion: `Ejemplo · ${s.label}`,
              cantidadMilesimas: 1000,
              precioCentimos: 10000,
              ivaPct: 21,
            },
          ],
        },
      });
    }
    altas = store.all().filter((e): e is AltaEvent => e.kind === "alta");
  }
  return altas.map((a, i) => subjectFromAlta(a, boot, i + 1));
}

function subjectFromAlta(
  alta: AltaEvent,
  boot: AppBootResult,
  n: number,
): RuntimeSubject {
  const slice = boot.input.lifecycles.find((l) => l.id === alta.lifecycleId);
  return {
    id: alta.subjectId,
    lifecycleId: alta.lifecycleId,
    label: `${slice ? crearEtiquetador(boot.input).proceso(slice.id) : "Expediente"} #${n}`,
    parteId: alta.datos.parteId,
    ...(alta.sedeId ? { sedeId: alta.sedeId } : {}),
  };
}

function seedSubjects(boot: AppBootResult): RuntimeSubject[] {
  const out: RuntimeSubject[] = [];
  let i = 1;
  for (const slice of boot.input.lifecycles) {
    const parteId = i % 2 === 0 ? "parte-demo-2" : "parte-demo-1";
    const sedeId = i % 2 === 0 ? "sede-norte" : "sede-centro";
    out.push({
      id: `tx-${boot.profileId}-${slice.id}-${i}`,
      lifecycleId: slice.id,
      label: `${slice.label ?? slice.archetypeId} #${i}`,
      parteId,
      sedeId,
    });
    i++;
    if (i > 8) break;
  }
  if (out.length === 0) {
    out.push({
      id: `tx-${boot.profileId}-demo-1`,
      lifecycleId: boot.input.lifecycles[0]?.id ?? "lc",
      label: "Expediente demo",
      parteId: "parte-demo-1",
      sedeId: "sede-centro",
    });
  }
  return out;
}
