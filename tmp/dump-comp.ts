import { writeFileSync } from "node:fs";
import { allBootableIds, bootProfile } from "../web/index.js";

const rows = [];
for (const id of allBootableIds()) {
  const b = bootProfile(id);
  rows.push({
    id,
    composition: b.input.composition ?? null,
    lcs: b.input.lifecycles.map((l) => ({
      id: l.id,
      arch: l.archetypeId,
      role: l.compositionRole,
    })),
  });
}
writeFileSync("tmp/comp.json", JSON.stringify(rows, null, 2));
console.log(
  rows
    .map(
      (r) =>
        `${r.id} d=${r.composition?.dominant ?? "-"} secs=${(r.composition?.secondaries ?? [])
          .map((s) => `${s.secondaryArchetypeId}->${s.bloquea}`)
          .join(";") || "-"}`,
    )
    .join("\n"),
);
