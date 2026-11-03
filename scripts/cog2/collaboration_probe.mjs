#!/usr/bin/env node
/**
 * COG-2D feasibility probe — READ-ONLY plan derivation.
 *
 * Calls the EXISTING local collaboration service's `plan` (no model, no branch execution) against a
 * seeded test deployment. It answers one bounded question: can this deployment compose an
 * independent-work structure, or does it honestly report that a capability is required?
 *
 * `--run` is deliberately NOT implemented here: a run executes governed recipe paths and may spawn
 * branches. If the plan says the deployment can do it, the trial must be a separate, counted model
 * execution, not a diagnostic hidden in this probe.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { withDeployment } from "./rig.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const DIR = String(args.get("dir") ?? "");
const OUT = String(args.get("out") ?? "");
const INTENT = String(args.get("intent") ?? "AUTO").toUpperCase();
if (DIR === "") throw new Error("--dir=<seeded run dir> is required");
if (!["AUTO", "FOCUS", "PARALLEL", "CHECK", "PARALLEL_AND_CHECK"].includes(INTENT)) {
  throw new Error("--intent=AUTO|FOCUS|PARALLEL|CHECK|PARALLEL_AND_CHECK is required");
}

const task =
  "Assess the quality and coverage of the evidence behind the Harrowgate programme, and separately draft an implementation plan for the next six months. The evidence finding should be able to change the plan.";

const result = await withDeployment(
  { unit: "collaboration-probe", stateDir: join(DIR, "state"), workDir: join(DIR, "work"), projectId: "harrowgate" },
  async (deployment) => {
    const collaboration = deployment.installed.application.collaboration;
    if (collaboration === undefined) return { available: false, detail: "application.collaboration is absent" };
    try {
      const plan = await collaboration.plan({ task, requestedBy: "diagnostic:cog2-collaboration-probe", intent: INTENT });
      return { available: true, plan };
    } catch (error) {
      return {
        available: true,
        error: String(error),
        kind: error?.kind ?? error?.code ?? null,
        detail: error?.message ?? null,
      };
    }
  },
);

const record = {
  schema: "cog2-collaboration-probe/v1",
  generatedAt: new Date().toISOString(),
  dir: DIR,
  task,
  intent: INTENT,
  diagnostic: true,
  note: "Plan derivation only; no branch executed and no model called by this probe.",
  ...result,
};
if (OUT !== "") writeFileSync(OUT, JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
