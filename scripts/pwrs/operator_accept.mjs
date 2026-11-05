/**
 * PWRS operator acceptance — the EXISTING Promotion path, parameterized for the PWRS-R layout.
 *
 * `scripts/lhape/operator_promote.mjs` assumes `<RUN>/world` + `<RUN>/state`; the PWRS-R cohorts keep
 * one world and one state per condition. This script performs the same operator action on explicit
 * paths: assess eligibility, promote the latest COMPLETED attempt, step, reconcile the head, and
 * record the result. It accepts nothing by itself and fabricates no candidate.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ""));
const STATE = resolve(String(args.get("state") ?? ""));
const WORLD = resolve(String(args.get("world") ?? ""));
const PROJECT = String(args.get("project") ?? "");
const TASK = String(args.get("task") ?? "");
const LABEL = String(args.get("label") ?? TASK);
if (RUN === "" || STATE === "" || WORLD === "" || PROJECT === "" || TASK === "") {
  throw new Error("--run --state --world --project --task are required");
}

const STANDARD = {
  statement: "Stay inside the declared write scope and leave the required package artifact.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["PWRS operator acceptance"],
  confirmed: true,
  notes: [],
};

const installed = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: PROJECT,
    repository: WORLD,
    stateDir: STATE,
    execution: "worktree",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
    standard: STANDARD,
  },
);

for (let tick = 0; tick < 16; tick += 1) {
  const event = installed.controller.step();
  if (event === null) break;
}
const before = installed.controller.status();
const candidates = before.attempts.filter((attempt) => attempt.task_id === TASK && attempt.state === "COMPLETED");
const attempt = candidates[candidates.length - 1];
const record = {
  schema: "pwrs-operator-acceptance/v1",
  label: LABEL,
  projectId: PROJECT,
  taskId: TASK,
  operator: "owner-authorized deterministic acceptance",
  acceptedAt: new Date().toISOString(),
  promoted: false,
  attemptId: attempt?.attempt_id ?? null,
  before: {
    revision: before.revision,
    headCommit: before.headCommit,
    tasks: before.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
  },
};

if (attempt === undefined) {
  record.detail = `no COMPLETED attempt exists for task ${TASK}; acceptance was not fabricated`;
  writeFileSync(join(RUN, `operator-${LABEL}.json`), `${JSON.stringify(record, null, 2)}\n`);
  await installed.dispose();
  process.stderr.write(`${record.detail}\n`);
  process.exit(1);
}

const eligibility = installed.controller.promotions.assessEligibility(attempt.attempt_id);
record.eligibility = {
  eligible: eligibility.eligible,
  blockers: eligibility.blockers.map((blocker) => ({ kind: blocker.kind, detail: blocker.detail })),
  sourceCommit: eligibility.sourceCommit,
  taskState: eligibility.taskState,
  attemptState: eligibility.attemptState,
  canonicalExpectedHead: eligibility.canonicalExpectedHead,
};

try {
  const result = await installed.controller.promoteAttempt({ attemptId: attempt.attempt_id, gateId: "gate-release" });
  installed.controller.step();
  const head = await installed.controller.reconcileProjectHead();
  const after = installed.controller.status();
  const payload = result.committed?.payload ?? {};
  record.promoted = true;
  record.result = {
    promotionId: result.promotionId ?? null,
    sourceCommit: payload.source_commit ?? null,
    expectedHeadCommit: payload.expected_head_commit ?? null,
    resultingHeadCommit: result.resultingHeadCommit ?? null,
    eventType: result.committed?.event_type ?? null,
  };
  record.headReconciliation = head;
  record.after = {
    revision: after.revision,
    headCommit: after.headCommit,
    tasks: after.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
  };
  writeFileSync(join(RUN, `operator-${LABEL}.json`), `${JSON.stringify(record, null, 2)}\n`);
  const ledgerPath = join(RUN, "operator-promotions.json");
  const ledger = existsSync(ledgerPath)
    ? JSON.parse(readFileSync(ledgerPath, "utf8"))
    : { schema: "pwrs-operator-promotions/v1", records: [] };
  ledger.records.push(record);
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ promoted: true, task: TASK, after: record.after })}\n`);
} catch (error) {
  record.detail = error instanceof Error ? error.message : String(error);
  record.after = {
    revision: installed.controller.status().revision,
    headCommit: installed.controller.status().headCommit,
    tasks: installed.controller.status().tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
  };
  writeFileSync(join(RUN, `operator-${LABEL}.json`), `${JSON.stringify(record, null, 2)}\n`);
  process.stderr.write(`${record.detail}\n`);
  await installed.dispose();
  process.exit(2);
}

await installed.dispose();
