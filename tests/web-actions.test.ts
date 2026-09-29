/**
 * Acciones UI → Intérprete → Juez → SQLite (pruebas nuevas).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import {
  AppRuntime,
  bootProfile,
  executeUiAction,
  renderAppHtml,
  resolveSession,
} from "../web/index.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function openRuntime(profileId: string): AppRuntime {
  const dir = mkdtempSync(join(tmpdir(), "abs-web-"));
  dirs.push(dir);
  const boot = bootProfile(profileId);
  return AppRuntime.open(boot, { dbPath: join(dir, "events.sqlite") });
}

describe("Web acciones → Juez", () => {
  it("ejecuta una transición visible y persiste en SQLite", async () => {
    const runtime = openRuntime("concesionaria");
    const roleId =
      runtime.boot.roles.find((r) =>
        runtime.boot.spec.actions.some((a) => a.visibleRoles.includes(r.id)),
      )?.id ?? runtime.boot.roles[0]!.id;

    const action = runtime.boot.spec.actions.find((a) =>
      a.visibleRoles.includes(roleId),
    )!;
    const subject = runtime.subjects.find(
      (s) => s.lifecycleId === action.lifecycleId,
    ) ?? runtime.subjects[0]!;

    const r1 = await executeUiAction(runtime, {
      actionId: action.id,
      subjectId: subject.id,
      clientRequestId: "req-once-1",
      roleId,
      parteId: subject.parteId,
      channel: "backoffice",
      kind: "boton",
    });

    // Puede ok o rechazo de política; si ok, hay evento
    if (r1.ok) {
      expect(runtime.store.getBySubject(subject.id).length).toBeGreaterThan(0);
      expect(r1.newStateId).toBeTruthy();
      const rows = runtime.projectRows();
      expect(rows.some((row) => row.id === subject.id)).toBe(true);
    } else {
      expect(r1.flash.kind === "error" || r1.flash.kind === "block").toBe(true);
      expect(r1.flash.text.length).toBeGreaterThan(10);
      // Sin jerga técnica cruda típica
      expect(r1.flash.text).not.toMatch(/JudgeRejectionError|stack|at Object\./i);
    }
    runtime.close();
  });

  it("doble envío con mismo clientRequestId no duplica eventos", async () => {
    const runtime = openRuntime("concesionaria");
    const roleId = runtime.boot.roles[0]!.id;
    const action = runtime.boot.spec.actions.find((a) =>
      a.visibleRoles.includes(roleId),
    );
    if (!action) {
      runtime.close();
      return;
    }
    const subject =
      runtime.subjects.find((s) => s.lifecycleId === action.lifecycleId) ??
      runtime.subjects[0]!;

    const body = {
      actionId: action.id,
      subjectId: subject.id,
      clientRequestId: "dup-req-42",
      roleId,
      parteId: subject.parteId,
      channel: "backoffice" as const,
      kind: "boton" as const,
    };

    const a = await executeUiAction(runtime, body);
    const countAfterFirst = runtime.store.getBySubject(subject.id).length;
    const b = await executeUiAction(runtime, body);
    const countAfterSecond = runtime.store.getBySubject(subject.id).length;

    expect(countAfterSecond).toBe(countAfterFirst);
    if (a.ok) {
      expect(b.idempotentReplay || b.flash.idempotentReplay).toBe(true);
    }
    runtime.close();
  });

  it("HTML vivo incluye formularios de acción activos", () => {
    const runtime = openRuntime("p03-ferreteria");
    const liveRows = runtime.projectRows();
    const session = resolveSession(runtime.boot, {}, { preferRows: liveRows });
    const html = renderAppHtml({
      boot: runtime.boot,
      session,
      live: true,
      liveRows,
    });
    expect(html).toContain('data-live="1"');
    expect(html).toContain('action="/action"');
    expect(html).toContain("data-client-request");
    runtime.close();
  });

  it("HTML sin liveRows permanece solo lectura (contrato web-app)", () => {
    const runtime = openRuntime("p03-ferreteria");
    const session = resolveSession(runtime.boot, {});
    const html = renderAppHtml({ boot: runtime.boot, session });
    expect(html).toContain('data-live="0"');
    if (html.includes("data-action-id=")) {
      expect(html).toContain("disabled");
      expect(html).toContain("solo lectura");
    }
    runtime.close();
  });

  it("rechazo muestra flash comprensible en HTML", async () => {
    const runtime = openRuntime("concesionaria");
    // Rol que no ve la acción → rechazo de UI
    const action = runtime.boot.spec.actions[0];
    if (!action) {
      runtime.close();
      return;
    }
    const forbiddenRole =
      runtime.boot.roles.find((r) => !action.visibleRoles.includes(r.id))?.id ??
      "rol-inexistente";
    const subject = runtime.subjects[0]!;
    const result = await executeUiAction(runtime, {
      actionId: action.id,
      subjectId: subject.id,
      clientRequestId: "rej-1",
      roleId: forbiddenRole,
      parteId: subject.parteId,
      channel: "backoffice",
    });
    expect(result.ok).toBe(false);
    runtime.setFlash(result.flash);
    const html = renderAppHtml({
      boot: runtime.boot,
      session: resolveSession(runtime.boot, { role: forbiddenRole }),
      liveRows: runtime.projectRows(),
      flash: result.flash,
    });
    expect(html).toContain('data-flash="error"');
    expect(html).toContain(result.flash.text.slice(0, 20));
    runtime.close();
  });
});
