/**
 * APS-C pilot — close G cleanly after the accepted re-issue.
 *
 * `selection-final-2` now covers and has been promoted with BOTH current artifacts. The separate
 * `independent-check` task is still READY only because the earlier VERIFYING latch prevented it from
 * being claimed; its review is already inside the accepted tree. Retire that empty work position with
 * a typed plan revision and a decision that names the accepted artifact, rather than leaving a READY
 * task that could only produce zero work.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const RUN = resolve(String(process.argv.find((arg) => arg.startsWith("--run="))?.slice("--run=".length) ?? join(process.env.HOME ?? ".", "aps-pilot")));
const WORLD = join(RUN, "worlds", "G");
const STATE = join(RUN, "state-G");

const installed = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: "aps",
    repository: WORLD,
    stateDir: STATE,
    execution: "in-place",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
    standard: {
      statement: "Each selection or withholding decision must stay inside its declared write scope and cite the deciding constraint.",
      clauses: [{ kind: "scope_respected" }],
      derivedFrom: ["APS pilot G standard"],
      confirmed: true,
      notes: [],
    },
  },
);

const before = installed.controller.status();
const project = installed.controller.work.project();
const selection = project.tasks.find((task) => task.task_id === "selection-final-2");
if (selection === undefined) {
  throw new Error("selection-final-2 is absent; the accepted re-issue must exist before settlement");
}
const decision = {
  decision_id: `decision-aps-settle-${Date.now()}`,
  statement: "Retire the empty independent-check work position because its review is accepted inside selection-final-2",
  rationale:
    "reviews/coastal.md is a required artifact of the accepted selection-final-2 result at project head ac4971f. The separate independent-check task never acquired a claim because the VERIFYING latch blocked it; keeping it READY would offer a zero-work position whose artifact is already accepted.",
  evidence_ids: [],
  supersedes: null,
};
installed.controller.plan({
  goal: project.goal,
  requirements: project.requirements,
  decisions: [...project.decisions, decision],
  tasks: [selection],
  reason: "close the accepted G artifact set; retire the empty independent-check position",
  changeClass: "contract_breaking",
  changedIds: ["independent-check"],
});
installed.controller.step();
await installed.controller.reconcileProjectHead();
const after = installed.controller.status();
writeFileSync(
  join(RUN, "pilot-G-final-settlement.json"),
  `${JSON.stringify(
    {
      schema: "aps-pilot-final-settlement/v1",
      note: "The independent-check artifact is accepted inside selection-final-2; the empty work position is retired. No model run.",
      decision,
      before: {
        revision: before.revision,
        projectHead: before.headCommit,
        tasks: before.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
      },
      after: {
        revision: after.revision,
        projectHead: after.headCommit,
        tasks: after.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
        nextAction: after.nextAction,
      },
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`${JSON.stringify({ after: { revision: after.revision, projectHead: after.headCommit, tasks: after.tasks, nextAction: after.nextAction } })}\n`);
await installed.dispose();
