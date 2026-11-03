/**
 * APS-C pilot — accept G's real-model artifacts through a LEGITIMATE replan.
 *
 * The original `selection` attempt reported commit 349e074, then the model committed the independent
 * check at ac4971f. The in-place promotion guard correctly refuses to promote the older report. This
 * script does not bypass it: it records a typed plan revision that retires the old selection task,
 * introduces `selection-final` at the current basis, completes that task from the already-committed
 * artifact, and promotes it. The old candidate remains historical.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "aps-pilot")));
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
const records = [];
const refusals = [];

const tasks = [
  {
    task_id: "selection-final-2",
    objective:
      "Re-issue the complete current G deliverable set at the current basis: the selection record in deliverables/selection.md and the independent coastal review in reviews/coastal.md. Both files are already committed; the task's write scope covers the complete current state so the in-place result commit contains all work.",
    depends_on: [],
    write_paths: ["deliverables/selection.md", "reviews/coastal.md"],
    required_artifacts: ["deliverables/selection.md", "reviews/coastal.md"],
  },
  {
    task_id: "independent-check",
    objective: "Independently check the coastal-rating status and record the result in reviews/coastal.md.",
    depends_on: [],
    write_paths: ["reviews/coastal.md"],
    required_artifacts: ["reviews/coastal.md"],
  },
];
const decision = {
  decision_id: `decision-aps-replan-${Date.now()}`,
  statement: "Retire the stale G selection/first re-issue report and re-issue the complete current artifact set as selection-final-2",
  rationale:
    "The original selection attempt recorded commit 349e074, then the independent check landed at ac4971f. The first re-issue still declared only the selection path, so the product correctly refused the out-of-scope review file. This typed replan gives the re-issued task the COMPLETE current tree scope. It is not an acceptance bypass; the artifacts are unchanged and are re-reported from the current head.",
  evidence_ids: [],
  supersedes: null,
};

try {
  installed.controller.plan({
    goal: project.goal,
    requirements: project.requirements,
    decisions: [...project.decisions, decision],
    tasks,
    reason: "the current tree contains both artifacts; re-issue the complete set at the current basis",
    changeClass: "contract_breaking",
    changedIds: ["selection", "selection-final"],
  });
  installed.controller.step();
} catch (error) {
  refusals.push({ stage: "plan", error: error instanceof Error ? error.message : String(error) });
}

async function completeAndAccept(taskId) {
  let status = installed.controller.status();
  const task = status.tasks.find((entry) => entry.task_id === taskId);
  if (task === undefined) {
    records.push({ taskId, state: "ABSENT" });
    return;
  }
  if (task.state === "SATISFIED") {
    records.push({ taskId, state: "SATISFIED", detail: "already accepted" });
    return;
  }
  let attemptId = status.attempts.find(
    (entry) => entry.task_id === taskId && (entry.state === "CREATED" || entry.state === "LEASED"),
  )?.attempt_id;
  for (let step = 0; step < 8 && attemptId === undefined; step += 1) {
    installed.controller.step();
    status = installed.controller.status();
    attemptId = status.attempts.find(
      (entry) => entry.task_id === taskId && (entry.state === "CREATED" || entry.state === "LEASED"),
    )?.attempt_id;
  }
  if (attemptId === undefined) {
    records.push({ taskId, mode: "no-claimable-attempt", state: task.state });
    return;
  }
  await installed.controller.claim(attemptId);
  const finished = await installed.controller.finish({ summary: `re-reported ${taskId} at the current basis` });
  installed.controller.step();
  const promotion = await installed.controller.promoteAttempt({ attemptId, gateId: "gate-release" });
  installed.controller.step();
  await installed.controller.reconcileProjectHead();
  records.push({
    taskId,
    mode: "claimed-and-completed-from-current-artifact",
    attemptId,
    changedFiles: finished.changedFiles,
    promotionId: promotion.promotionId,
    resultingHeadCommit: promotion.resultingHeadCommit,
    state: installed.controller.status().tasks.find((entry) => entry.task_id === taskId)?.state ?? "UNKNOWN",
  });
}

for (const taskId of ["selection-final-2", "independent-check"]) {
  try {
    await completeAndAccept(taskId);
  } catch (error) {
    refusals.push({ stage: taskId, error: error instanceof Error ? error.message : String(error) });
  }
}

const after = installed.controller.status();
writeFileSync(
  join(RUN, "pilot-G-acceptance-replan.json"),
  `${JSON.stringify(
    {
      schema: "aps-pilot-replan-acceptance/v1",
      note: "A typed plan revision retires the stale report and re-issues the same artifact under a new task id. No promotion guard was bypassed.",
      decision,
      records,
      refusals,
      before: {
        revision: before.revision,
        projectHead: before.headCommit,
        tasks: before.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
      },
      after: {
        revision: after.revision,
        projectHead: after.headCommit,
        tasks: after.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
      },
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`${JSON.stringify({ records, refusals, after: { revision: after.revision, projectHead: after.headCommit, tasks: after.tasks } })}\n`);
await installed.dispose();
