/**
 * APS-C pilot — finish the legitimate G replan.
 *
 * The first re-issue attempt (`selection-final`) is still RUNNING but its task was retired by the typed
 * replan and its lease is long expired. Mark it EXPIRED through the scheduler's late-result path, then
 * complete and promote `selection-final-2`, whose write scope covers the COMPLETE current artifact set.
 * No promotion guard is bypassed and the old report is not accepted.
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
const expired = [];
for (const attempt of before.attempts.filter((entry) => entry.state === "RUNNING")) {
  try {
    installed.controller.reportLate(attempt.attempt_id, {
      workerStatus: "expired",
      summary: "superseded by the typed replan; the attempt's lease expired and its report is not accepted",
    });
    expired.push({ attemptId: attempt.attempt_id, taskId: attempt.task_id, outcome: "EXPIRED_RECORDED" });
    installed.controller.step();
  } catch (error) {
    expired.push({ attemptId: attempt.attempt_id, taskId: attempt.task_id, outcome: "REFUSED", error: error instanceof Error ? error.message : String(error) });
  }
}

const records = [];
const refusals = [];
let status = installed.controller.status();
const task = status.tasks.find((entry) => entry.task_id === "selection-final-2");
if (task === undefined) {
  refusals.push({ stage: "selection-final-2", error: "task is absent" });
} else {
  let attempt = status.attempts.find(
    (entry) => entry.task_id === "selection-final-2" && (entry.state === "CREATED" || entry.state === "LEASED" || entry.state === "RUNNING"),
  );
  let attemptId = attempt?.attempt_id;
  for (let step = 0; step < 8 && attemptId === undefined; step += 1) {
    installed.controller.step();
    status = installed.controller.status();
    attempt = status.attempts.find(
      (entry) => entry.task_id === "selection-final-2" && (entry.state === "CREATED" || entry.state === "LEASED" || entry.state === "RUNNING"),
    );
    attemptId = attempt?.attempt_id;
  }
  if (attemptId === undefined) {
    refusals.push({ stage: "selection-final-2", error: "no claimable attempt" });
  } else {
    try {
      if (attempt?.state !== "RUNNING") await installed.controller.claim(attemptId);
      const finished = await installed.controller.finish({ summary: "complete current selection+review artifact set at the current basis" });
      installed.controller.step();
      const promotion = await installed.controller.promoteAttempt({ attemptId, gateId: "gate-release" });
      installed.controller.step();
      await installed.controller.reconcileProjectHead();
      records.push({
        taskId: "selection-final-2",
        attemptId,
        changedFiles: finished.changedFiles,
        promotionId: promotion.promotionId,
        resultingHeadCommit: promotion.resultingHeadCommit,
        state: installed.controller.status().tasks.find((entry) => entry.task_id === "selection-final-2")?.state ?? "UNKNOWN",
      });
    } catch (error) {
      refusals.push({ stage: "selection-final-2", error: error instanceof Error ? error.message : String(error) });
    }
  }
}

const after = installed.controller.status();
writeFileSync(
  join(RUN, "pilot-G-final-acceptance.json"),
  `${JSON.stringify(
    {
      schema: "aps-pilot-final-acceptance/v1",
      note: "The stale attempt was recorded EXPIRED after the typed replan; selection-final-2 covers the complete current artifact set and was promoted. The old report was not accepted.",
      expired,
      records,
      refusals,
      before: {
        revision: before.revision,
        projectHead: before.headCommit,
        tasks: before.tasks.map((entry) => ({ taskId: entry.task_id, state: entry.state })),
        attempts: before.attempts.map((entry) => ({ attemptId: entry.attempt_id, taskId: entry.task_id, state: entry.state })),
      },
      after: {
        revision: after.revision,
        projectHead: after.headCommit,
        tasks: after.tasks.map((entry) => ({ taskId: entry.task_id, state: entry.state })),
        attempts: after.attempts.map((entry) => ({ attemptId: entry.attempt_id, taskId: entry.task_id, state: entry.state })),
      },
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`${JSON.stringify({ expired, records, refusals, after: { revision: after.revision, projectHead: after.headCommit, tasks: after.tasks } })}\n`);
await installed.dispose();
