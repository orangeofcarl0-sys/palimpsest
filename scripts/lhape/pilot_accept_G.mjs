/**
 * LHAPE-C pilot — operator acceptance for the governed G condition.
 *
 * Real operator action on the canonical Promotion path. It names only the task; the product derives
 * the attempt, source commit and expected head. If the model did not deliver a completed package
 * attempt, nothing is fabricated.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ""));
if (RUN === "") throw new Error("--run is required");
const WORLD = join(RUN, "worlds", "G");
const STATE = join(RUN, "state-G");
mkdirSync(join(RUN, "out", "G"), { recursive: true });

const installed = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: "lhape-pilot",
    repository: WORLD,
    stateDir: STATE,
    execution: "worktree",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
    standard: {
      statement: "Stay inside the declared write scope and leave the required package artifact.",
      clauses: [{ kind: "scope_respected" }],
      derivedFrom: ["LHAPE-C pilot G standard"],
      confirmed: true,
      notes: [],
    },
  },
);

for (let tick = 0; tick < 16; tick += 1) {
  const event = installed.controller.step();
  if (event === null) break;
}
const before = installed.controller.status();
const candidates = before.attempts.filter((attempt) => attempt.task_id === "package" && attempt.state === "COMPLETED");
const attempt = candidates[candidates.length - 1];
const record = {
  schema: "lhape-pilot-g-acceptance/v1",
  taskId: "package",
  attemptId: attempt?.attempt_id ?? null,
  promoted: false,
  before: {
    revision: before.revision,
    headCommit: before.headCommit,
    tasks: before.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
  },
};
if (attempt === undefined) {
  record.detail = "no COMPLETED package attempt exists; acceptance was not fabricated";
} else {
  const eligibility = installed.controller.promotions.assessEligibility(attempt.attempt_id);
  record.eligibility = {
    eligible: eligibility.eligible,
    blockers: eligibility.blockers.map((blocker) => ({ kind: blocker.kind, detail: blocker.detail })),
    sourceCommit: eligibility.sourceCommit,
    taskState: eligibility.taskState,
  };
  try {
    const result = await installed.controller.promoteAttempt({ attemptId: attempt.attempt_id, gateId: "gate-release" });
    installed.controller.step();
    await installed.controller.reconcileProjectHead();
    const after = installed.controller.status();
    const payload = result.committed?.payload ?? {};
    record.promoted = true;
    record.result = {
      promotionId: result.promotionId ?? null,
      sourceCommit: payload.source_commit ?? null,
      expectedHeadCommit: payload.expected_head_commit ?? null,
      resultingHeadCommit: result.resultingHeadCommit ?? null,
    };
    record.after = {
      revision: after.revision,
      headCommit: after.headCommit,
      tasks: after.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
    };
  } catch (error) {
    record.detail = error instanceof Error ? error.message : String(error);
  }
}
writeFileSync(join(RUN, "out", "G", "operator-acceptance.json"), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ promoted: record.promoted, attemptId: record.attemptId, detail: record.detail ?? null })}\n`);
await installed.dispose();
