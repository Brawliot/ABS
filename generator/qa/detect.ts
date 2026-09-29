/**
 * Detección de hallazgos del Probador.
 */

import { isTerminalState, outgoing } from "../../core/lifecycle.js";
import type { GeneratorInput } from "../types.js";
import type { UiSpec } from "../../presentation/types.js";
import { fillRequiredFields } from "./synthetic.js";
import type { QaFinding, QaScenarioResult } from "./types.js";
import type { WalkContext } from "./walk.js";

function finding(
  kind: QaFinding["kind"],
  severity: QaFinding["severity"],
  message: string,
  step: QaFinding["step"],
): QaFinding {
  const id = `qa.${kind}.${step.stateId ?? step.actionId ?? step.viewId ?? step.formId ?? step.recorridoId ?? "x"}`;
  return { id, kind, severity, message, step };
}

/**
 * Acciones del UiSpec cuya transición nunca se habilitó en ningún escenario.
 */
export function detectNeverEnabledActions(
  spec: UiSpec,
  enabledActionIds: ReadonlySet<string>,
): QaFinding[] {
  const out: QaFinding[] = [];
  for (const a of spec.actions) {
    if (!enabledActionIds.has(a.id)) {
      out.push(
        finding(
          "action_never_enabled",
          "major",
          `La acción «${a.id}» (${a.transitionId}) no se habilita en ningún recorrido sintético`,
          {
            actionId: a.id,
            transitionId: a.transitionId,
            lifecycleId: a.lifecycleId,
          },
        ),
      );
    }
  }
  return out;
}

/**
 * Callejones: estados no terminales sin salidas estructurales, o detectados en walk.
 */
export function detectDeadEnds(
  input: GeneratorInput,
  ctx: WalkContext,
): QaFinding[] {
  const out: QaFinding[] = [];
  const seen = new Set<string>();

  for (const slice of input.lifecycles) {
    for (const state of slice.lifecycle.states) {
      if (isTerminalState(slice.lifecycle, state.id)) continue;
      const outs = outgoing(slice.lifecycle, state.id);
      if (outs.length === 0) {
        const key = `${slice.id}:${state.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(
          finding(
            "dead_end",
            "critical",
            `Callejón sin salida: el estado «${state.id}» no tiene transiciones salientes`,
            { lifecycleId: slice.id, stateId: state.id },
          ),
        );
      }
    }
  }

  for (const c of ctx.deadEndCandidates) {
    const key = `${c.lifecycleId}:${c.stateId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const slice = input.lifecycles.find((l) => l.id === c.lifecycleId);
    if (!slice) continue;
    if (isTerminalState(slice.lifecycle, c.stateId)) continue;
    out.push(
      finding(
        "dead_end",
        "critical",
        `Callejón sin salida: en «${c.stateId}» ningún rol puede actuar`,
        {
          lifecycleId: c.lifecycleId,
          stateId: c.stateId,
          scenarioId: c.subjectKey,
        },
      ),
    );
  }
  return out;
}

/**
 * Recorridos / escenarios que no alcanzan un terminal.
 */
export function detectNoTerminal(
  scenarios: readonly QaScenarioResult[],
): QaFinding[] {
  const out: QaFinding[] = [];
  for (const s of scenarios) {
    // Solo caminos felices deben alcanzar terminal; excepciones fallidas se ignoran
    if (!s.id.includes("exception") && !s.reachedTerminal) {
      // Excepciones con prefijo "ex-" 
      if (s.id.includes("-t_cancelar") || s.id.includes("-t_incumplir") || s.id.includes("-t_rechazar") || s.id.includes("-t_impago")) {
        continue;
      }
      out.push(
        finding(
          "recorrido_no_terminal",
          s.id === "credit-sale" ? "critical" : "major",
          `El recorrido «${s.label}» no alcanza un estado terminal`,
          {
            scenarioId: s.id,
            recorridoId: s.id,
            ...(s.terminalStateId ? { stateId: s.terminalStateId } : {}),
          },
        ),
      );
    }
  }
  return out;
}

/**
 * Pantallas de recorrido sin acciones de salida (y no son terminal).
 */
export function detectScreensWithoutExit(
  input: GeneratorInput,
  spec: UiSpec,
): QaFinding[] {
  const out: QaFinding[] = [];
  for (const rec of spec.recorridos) {
    for (const viewId of rec.steps) {
      const view = spec.views.find((v) => v.id === viewId);
      if (!view) continue;
      if (view.actionIds.length > 0) continue;
      if (view.stateId && view.lifecycleId) {
        const slice = input.lifecycles.find((l) => l.id === view.lifecycleId);
        if (slice && isTerminalState(slice.lifecycle, view.stateId)) continue;
        // Vista de estado intermedio sin acciones → sin salida
        if (view.stateId) {
          out.push(
            finding(
              "screen_no_exit",
              "major",
              `Pantalla «${viewId}» sin acciones de salida en el recorrido`,
              {
                viewId,
                stateId: view.stateId,
                recorridoId: rec.id,
                lifecycleId: view.lifecycleId ?? undefined,
              },
            ),
          );
        }
      }
    }
  }
  return out;
}

/**
 * Campos obligatorios que el relleno sintético no puede satisfacer.
 */
export function detectImpossibleFields(spec: UiSpec): QaFinding[] {
  const out: QaFinding[] = [];
  for (const form of spec.forms) {
    const { impossible } = fillRequiredFields(form);
    for (const f of impossible) {
      out.push(
        finding(
          "impossible_required_field",
          "critical",
          `Campo obligatorio «${f.name}» imposible de rellenar (tipo ${f.type})`,
          { formId: form.id, fieldName: f.name },
        ),
      );
    }
  }
  // Campos de evidencia en acciones
  for (const a of spec.actions) {
    for (const f of a.evidenceFields) {
      if (!f.required) continue;
      const { impossible } = fillRequiredFields({
        id: `evidence.${a.id}`,
        entityKind: "evidence",
        fields: [f],
      });
      for (const bad of impossible) {
        out.push(
          finding(
            "impossible_required_field",
            "critical",
            `Campo de evidencia «${bad.name}» en acción «${a.id}» imposible de rellenar`,
            {
              actionId: a.id,
              formId: `evidence.${a.id}`,
              fieldName: bad.name,
            },
          ),
        );
      }
    }
  }
  return out;
}

export function collectFindings(
  input: GeneratorInput,
  spec: UiSpec,
  ctx: WalkContext,
  scenarios: readonly QaScenarioResult[],
): QaFinding[] {
  return [
    ...detectDeadEnds(input, ctx),
    ...detectNoTerminal(scenarios),
    ...detectNeverEnabledActions(spec, ctx.enabledActionIds),
    ...detectScreensWithoutExit(input, spec),
    ...detectImpossibleFields(spec),
  ];
}
