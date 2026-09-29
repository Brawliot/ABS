/**
 * Genera corpus sintético marcado origin=synthetic.
 * Uso: npx tsx tests/real/interpreter/generate-synthetic.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InterpreterCorpusCase, IntentType } from "./schema.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

const VENTA = [
  "t_aceptar",
  "t_cancelar_aceptada",
  "t_cancelar_propuesta",
  "t_iniciar_entrega",
  "t_entrega_parcial",
  "t_cerrar",
] as const;

const PARTES_GARCIA = [
  { ref: "parte:gperez", label: "García Pérez" },
  { ref: "parte:glopez", label: "García López" },
] as const;

function caseOf(
  i: number,
  partial: Omit<InterpreterCorpusCase, "id" | "origin"> & {
    origin?: InterpreterCorpusCase["origin"];
  },
): InterpreterCorpusCase {
  return {
    id: `syn-${String(i).padStart(4, "0")}`,
    origin: partial.origin ?? "synthetic",
    ...partial,
  };
}

export function buildSyntheticCorpus(): InterpreterCorpusCase[] {
  const cases: InterpreterCorpusCase[] = [];
  let n = 1;

  const push = (
    p: Omit<InterpreterCorpusCase, "id" | "origin"> & {
      origin?: InterpreterCorpusCase["origin"];
    },
  ) => {
    cases.push(caseOf(n++, p));
  };

  // Aceptación
  for (const msg of [
    "Acepto el presupuesto",
    "De acuerdo, firmo",
    "Ok, aceptamos la oferta",
    "Perfecto, adelante con el pedido",
    "Confirmamos aceptación",
  ]) {
    for (let k = 0; k < 6; k++) {
      push({
        message: `${msg}${k ? ` (#${k})` : ""}`,
        context: {
          subjectId: `tx-v-${n}`,
          allowedTransitionIds: [...VENTA],
          hasAttachments: false,
        },
        expected: {
          transitionId: "t_aceptar",
          intentLabel: "aceptacion",
          ambiguous: false,
        },
        ambiguous: false,
        split: "test",
        intentType: "aceptacion",
      });
    }
  }

  // Cancelación
  for (const msg of [
    "Quiero cancelar",
    "Anula el pedido",
    "No quiero seguir, desisto",
    "Cancelad la aceptación",
    "Por favor anulad",
  ]) {
    for (let k = 0; k < 6; k++) {
      push({
        message: `${msg}${k ? ` v${k}` : ""}`,
        context: {
          subjectId: `tx-c-${n}`,
          allowedTransitionIds: [...VENTA],
          hasAttachments: false,
        },
        expected: {
          transitionId: "t_cancelar_aceptada",
          intentLabel: "cancelacion",
          ambiguous: false,
        },
        ambiguous: false,
        split: "test",
        intentType: "cancelacion",
      });
    }
  }

  // Declaración de pago
  for (const msg of [
    "Ya he pagado, te adjunto el bizum",
    "He hecho la transferencia con comprobante",
    "Pagado por bizum, captura adjunta",
    "Ya pagué, aquí el screenshot",
    "Comprobante de pago enviado",
  ]) {
    for (let k = 0; k < 5; k++) {
      push({
        message: `${msg}${k ? ` ${k}` : ""}`,
        context: {
          subjectId: `tx-p-${n}`,
          allowedTransitionIds: [...VENTA],
          hasAttachments: true,
        },
        expected: {
          transitionId: "t_cerrar",
          intentLabel: "declaracion_pago",
          ambiguous: false,
        },
        ambiguous: false,
        split: "test",
        intentType: "declaracion_pago",
      });
    }
  }

  // Cobro parcial + García ambiguo
  for (let k = 0; k < 20; k++) {
    push({
      message: `Ya le he cobrado a García, ${200 + k * 10} en efectivo y el resto el mes que viene`,
      context: {
        subjectId: `tx-g-${n}`,
        allowedTransitionIds: [...VENTA],
        hasAttachments: false,
        parteDirectory: [...PARTES_GARCIA],
      },
      expected: {
        transitionId: null,
        intentLabel: "cobro_parcial",
        ambiguous: true,
        mustAskClarification: true,
        amountEquals: [200 + k * 10],
      },
      ambiguous: true,
      split: "test",
      intentType: "cobro_parcial",
      notes: "Debe preguntar García Pérez vs García López",
    });
  }

  // Cobro parcial desambiguado
  for (let k = 0; k < 15; k++) {
    push({
      message: `Cobrado a García Pérez ${150 + k} euros en efectivo, resto el mes que viene`,
      context: {
        subjectId: `tx-gp-${n}`,
        allowedTransitionIds: [...VENTA],
        hasAttachments: false,
        parteDirectory: [...PARTES_GARCIA],
      },
      expected: {
        transitionId: "t_cerrar",
        intentLabel: "cobro_parcial",
        ambiguous: false,
        amountEquals: [150 + k],
      },
      ambiguous: false,
      split: "test",
      intentType: "cobro_parcial",
    });
  }

  // Entrega
  for (const msg of [
    "El cliente ya ha recibido el pedido",
    "Entrega parcial hecha",
    "Ha llegado el material",
    "Recibí la mercancía",
    "Entregado en tienda",
  ]) {
    for (let k = 0; k < 5; k++) {
      push({
        message: `${msg}${k ? ` ${k}` : ""}`,
        context: {
          subjectId: `tx-e-${n}`,
          allowedTransitionIds: [...VENTA],
          hasAttachments: false,
        },
        expected: {
          transitionId: "t_entrega_parcial",
          intentLabel: "entrega",
          ambiguous: false,
        },
        ambiguous: false,
        split: "test",
        intentType: "entrega",
      });
    }
  }

  // Ambiguo / saludo
  for (const msg of [
    "Hola",
    "Buenas",
    "¿Me ayudas?",
    "No sé",
    "Mmm",
    "Info",
    "?",
    "Vale",
  ]) {
    for (let k = 0; k < 4; k++) {
      push({
        message: k ? `${msg} ${k}` : msg,
        context: {
          subjectId: `tx-a-${n}`,
          allowedTransitionIds: [...VENTA],
          hasAttachments: false,
        },
        expected: {
          transitionId: null,
          intentLabel: "ambiguo",
          ambiguous: true,
          mustAskClarification: true,
        },
        ambiguous: true,
        split: "test",
        intentType: msg.length <= 5 ? "saludo" : "ambiguo",
      });
    }
  }

  // Transición no permitida en contexto (solo t_aceptar disponible)
  for (let k = 0; k < 10; k++) {
    push({
      message: `Quiero cancelar el pedido ahora mismo ${k}`,
      context: {
        subjectId: `tx-np-${n}`,
        allowedTransitionIds: ["t_aceptar"],
        hasAttachments: false,
      },
      expected: {
        transitionId: null,
        intentLabel: "cancelacion",
        ambiguous: true,
        mustAskClarification: true,
      },
      ambiguous: true,
      split: "test",
      intentType: "cancelacion",
      notes: "Cancelación no está en allowed → debe aclarar, no inventar",
    });
  }

  // DEV set (no usar para ajustar métricas de prueba)
  const devSeeds: { msg: string; type: IntentType; tid: string | null }[] = [
    { msg: "Acepto", type: "aceptacion", tid: "t_aceptar" },
    { msg: "Cancelar pedido", type: "cancelacion", tid: "t_cancelar_aceptada" },
    { msg: "Ya pagué con captura", type: "declaracion_pago", tid: "t_cerrar" },
    { msg: "Hola qué tal", type: "saludo", tid: null },
    { msg: "Entrega lista", type: "entrega", tid: "t_entrega_parcial" },
  ];
  for (let k = 0; k < 8; k++) {
    for (const s of devSeeds) {
      push({
        message: `${s.msg} [dev ${k}]`,
        context: {
          subjectId: `tx-dev-${n}`,
          allowedTransitionIds: [...VENTA],
          hasAttachments: s.type === "declaracion_pago",
        },
        expected: {
          transitionId: s.tid,
          intentLabel: s.type === "saludo" ? "ambiguo" : s.type,
          ambiguous: s.tid === null,
          mustAskClarification: s.tid === null,
        },
        ambiguous: s.tid === null,
        split: "dev",
        intentType: s.type,
      });
    }
  }

  return cases;
}

export function writeSyntheticCorpus(outDir = ROOT): {
  readonly total: number;
  readonly test: number;
  readonly dev: number;
} {
  mkdirSync(outDir, { recursive: true });
  const all = buildSyntheticCorpus();
  const test = all.filter((c) => c.split === "test");
  const dev = all.filter((c) => c.split === "dev");

  const toJsonl = (rows: InterpreterCorpusCase[]) =>
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

  writeFileSync(join(outDir, "corpus.synthetic.test.jsonl"), toJsonl(test));
  writeFileSync(join(outDir, "corpus.synthetic.dev.jsonl"), toJsonl(dev));
  writeFileSync(
    join(outDir, "corpus.synthetic.all.jsonl"),
    toJsonl(all),
  );

  return { total: all.length, test: test.length, dev: dev.length };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).replace(/\\/g, "/") ===
    process.argv[1].replace(/\\/g, "/");

if (isMain) {
  const stats = writeSyntheticCorpus();
  console.log(
    `[corpus] synthetic total=${stats.total} test=${stats.test} dev=${stats.dev}`,
  );
}
