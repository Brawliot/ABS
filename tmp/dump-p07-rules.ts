import { writeFileSync } from "node:fs";
import { bootProfile } from "../web/index.js";

const b = bootProfile("p07-tienda-online");
const legal = b.input.ruleSet.rules.filter((r) => r.kind === "legal_deadline");
const evid = b.input.ruleSet.rules.filter(
  (r) => r.kind === "evidence_requirement",
);
writeFileSync(
  "tmp/p07-rules.json",
  JSON.stringify({ legal, evid: evid.slice(0, 20) }, null, 2),
);
console.log(
  "legal",
  legal.map((r) => ({ tid: (r as { transitionId: string }).transitionId, desc: (r as { description: string }).description })),
);
console.log(
  "evid",
  evid.map((r) => ({
    tid: (r as { transitionId: string }).transitionId,
    ref: (r as { referenceType?: string }).referenceType,
  })),
);
