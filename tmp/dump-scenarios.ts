import { writeFileSync, mkdirSync } from "node:fs";
import { allBootableIds, bootProfile } from "../web/index.js";

mkdirSync("tmp", { recursive: true });
const out = [];
for (const id of allBootableIds()) {
  const b = bootProfile(id);
  const lifecycles = b.input.lifecycles.map((l) => ({
    id: l.id,
    archetypeId: l.archetypeId,
    initial: l.lifecycle.initialStateId,
    happyTransitions: l.lifecycle.transitions
      .filter((t) => !t.id.includes("cancel") && !t.id.includes("incumplir") && !t.id.includes("fallar"))
      .map((t) => ({
        id: t.id,
        from: t.from,
        to: t.to,
        actor: t.allowedActor,
      })),
    allTransitions: l.lifecycle.transitions.map((t) => ({
      id: t.id,
      from: t.from,
      to: t.to,
      actor: t.allowedActor,
    })),
  }));
  const actions = b.spec.actions.map((a) => ({
    id: a.id,
    transitionId: a.transitionId,
    lifecycleId: a.lifecycleId,
    roles: [...a.visibleRoles],
  }));
  out.push({
    profileId: id,
    roles: b.roles.map((r) => r.id),
    composition: b.input.composition,
    lifecycles,
    actions,
    groups: (b.spec.processGroups ?? []).map((g) => ({
      id: g.id,
      archetypeId: g.archetypeId,
      roleIds: [...g.roleIds],
    })),
  });
}
writeFileSync("tmp/scenario-map.json", JSON.stringify(out, null, 2));
console.log("wrote", out.length);
