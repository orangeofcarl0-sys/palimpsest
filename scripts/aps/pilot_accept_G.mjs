/**
 * APS-C pilot — owner-authorized operator acceptance of the G condition's real-model artifacts.
 *
 * G's principal left `selection` in VERIFYING and `independent-check` READY (the VERIFYING latch is
 * real). This script performs the operator action on the real Promotion path. It is not a model run.
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
const records = [];

async function accept(taskId) {
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
  const completed = status.attempts.find((entry) => entry.task_id === taskId && entry.state === "COMPLETED");
  if (completed !== undefined) {
    const promotion = await installed.controller.promoteAttempt({ attemptId: completed.attempt_id, gateId: "gate-release" });
    installed.controller.step();
    await installed.controller.reconcileProjectHead();
    records.push({
      taskId,
      mode: "promoted-existing-completed-attempt",
      attemptId: completed.attempt_id,
      promotionId: promotion.promotionId,
      resultingHeadCommit: promotion.resultingHeadCommit,
      state: installed.controller.status().tasks.find((entry) => entry.task_id === taskId)?.state ?? "UNKNOWN",
    });
    return;
  }
  let attemptId = status.attempts.find(
    (entry) => entry.task_id === taskId && (entry.state === "CREATED" || entry.state === "LEASED"),
  )?.attempt_id;
  for (let step = 0; step < 6 && attemptId === undefined; step += 1) {
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
  const finished = await installed.controller.finish({ summary: `operator-authorized completion of ${taskId} after the G pilot` });
  installed.controller.step();
  const promotion = await installed.controller.promoteAttempt({ attemptId, gateId: "gate-release" });
  installed.controller.step();
  await installed.controller.reconcileProjectHead();
  records.push({
    taskId,
    mode: "claimed-and-completed",
    attemptId,
    changedFiles: finished.changedFiles,
    promotionId: promotion.promotionId,
    resultingHeadCommit: promotion.resultingHeadCommit,
    state: installed.controller.status().tasks.find((entry) => entry.task_id === taskId)?.state ?? "UNKNOWN",
  });
}

const refusals = [];
try {
  await accept("selection");
} catch (error) {
  refusals.push({ taskId: "selection", error: error instanceof Error ? error.message : String(error) });
}
try {
  await accept("independent-check");
} catch (error) {
  refusals.push({ taskId: "independent-check", error: error instanceof Error ? error.message : String(error) });
}

const after = installed.controller.status();
writeFileSync(
  join(RUN, "pilot-G-acceptance.json"),
  `${JSON.stringify(
    {
      schema: "aps-pilot-operator-acceptance/v1",
      note: "Owner-authorized operator acceptance attempt on the G condition's real-model artifacts. A refusal is preserved, never converted into a success. Not a model run.",
      accepted: records.some((record) => record.state === "SATISFIED"),
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
process.stdout.write(`${JSON.stringify({ accepted: records.some((record) => record.state === "SATISFIED"), records, refusals, after: { revision: after.revision, projectHead: after.headCommit, tasks: after.tasks } })}\n`);
await installed.dispose();
