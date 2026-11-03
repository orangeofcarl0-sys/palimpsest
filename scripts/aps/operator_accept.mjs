/**
 * APS — perform the explicit operator acceptance of the deterministic host run's delivered result.
 *
 * This is a real operator action on the real Work/Promotion path. It is NOT a model result: the
 * artifact was produced by a principal whose model was a deterministic stand-in. The script records
 * exactly what it did and refuses to invent a successful promotion.
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
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "aps-run")));
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");
const TASK = String(args.get("task") ?? "site-a");

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
      statement: "Each selection must stay inside its declared write scope, name the vendor, and record the deciding constraint.",
      clauses: [{ kind: "scope_respected" }],
      derivedFrom: ["APS run profile"],
      confirmed: true,
      notes: [],
    },
  },
);

const before = installed.controller.status();
const attempt = before.attempts.find((entry) => entry.task_id === TASK && entry.state === "COMPLETED");
let record;
if (attempt === undefined) {
  record = {
    schema: "aps-operator-acceptance/v1",
    operator: "owner-authorized deterministic acceptance",
    taskId: TASK,
    acceptedAt: new Date().toISOString(),
    promoted: false,
    detail: `no COMPLETED attempt exists for task ${TASK}; acceptance was not fabricated`,
    before,
  };
  writeFileSync(join(RUN, "operator-acceptance.json"), `${JSON.stringify(record, null, 2)}\n`);
  await installed.dispose();
  process.stderr.write(`${record.detail}\n`);
  process.exit(1);
}

try {
  const result = await installed.controller.promoteAttempt({ attemptId: attempt.attempt_id, gateId: "gate-release" });
  installed.controller.step();
  await installed.controller.reconcileProjectHead();
  const after = installed.controller.status();
  const payload = result.committed?.payload ?? {};
  record = {
    schema: "aps-operator-acceptance/v1",
    operator: "owner-authorized deterministic acceptance",
    taskId: TASK,
    attemptId: attempt.attempt_id,
    acceptedAt: new Date().toISOString(),
    promoted: true,
    note: "The artifact is a deterministic-host-run deliverable, not a model result. The acceptance is a real operator decision on the real Work/Promotion path.",
    result: {
      promotionId: result.promotionId ?? null,
      sourceCommit: payload.source_commit ?? null,
      expectedHeadCommit: payload.expected_head_commit ?? null,
      resultingHeadCommit: result.resultingHeadCommit ?? null,
      eventType: result.committed?.event_type ?? null,
    },
    before: {
      revision: before.revision,
      tasks: before.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
      projectHead: before.headCommit,
    },
    after: {
      revision: after.revision,
      tasks: after.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
      projectHead: after.headCommit,
    },
  };
  writeFileSync(join(RUN, "operator-acceptance.json"), `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ promoted: true, task: TASK, after: record.after })}\n`);
} catch (error) {
  const after = installed.controller.status();
  record = {
    schema: "aps-operator-acceptance/v1",
    operator: "owner-authorized deterministic acceptance",
    taskId: TASK,
    attemptId: attempt.attempt_id,
    acceptedAt: new Date().toISOString(),
    promoted: false,
    detail: error instanceof Error ? error.message : String(error),
    before: {
      revision: before.revision,
      tasks: before.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
    },
    after: {
      revision: after.revision,
      tasks: after.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
    },
  };
  writeFileSync(join(RUN, "operator-acceptance.json"), `${JSON.stringify(record, null, 2)}\n`);
  process.stderr.write(`${record.detail}\n`);
  await installed.dispose();
  process.exit(1);
}
await installed.dispose();
