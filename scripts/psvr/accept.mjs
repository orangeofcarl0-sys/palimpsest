/**
 * PSVR-A operator acceptance — the EXISTING Promotion path, with the scenario's own standard.
 *
 * It performs exactly what an operator does: assess eligibility, promote the latest COMPLETED attempt,
 * step the scheduler, reconcile the head, and record the outcome. It accepts nothing by itself and
 * fabricates no candidate. The standard is the SAME one the project was started with, so the release
 * gate is not silently different at acceptance time.
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
const TASK = String(args.get("task") ?? "");
const LABEL = String(args.get("label") ?? TASK);
const COMMAND = String(args.get("command") ?? "node --test").split(" ");
const PROJECT = String(args.get("project") ?? "psvr-a");
if (RUN === "" || TASK === "") throw new Error("--run and --task are required");
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");

const STANDARD = {
  statement: "The suite runs, the declared artifacts exist, and every write stays inside the task's scope.",
  clauses: [
    { kind: "command_succeeds", command: COMMAND, predicate: "tests_pass" },
    { kind: "scope_respected" },
    { kind: "files_exist", paths: [] },
  ],
  derivedFrom: ["package.json:scripts.test", "fixture policy"],
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
    policy: trustedDefaultPolicy({ allowed_commands: [{ executable: COMMAND[0], argv_prefix: COMMAND.slice(1) }] }),
    toolProfile: "normal",
    standard: STANDARD,
  },
);

/**
 * Do NOT run the scheduler to quiescence here: that would create an ATTEMPT_CREATED for the next
 * task, and a mutating delegation only bootstraps a task whose pending decision is TASK_STARTED.
 * The one transition this operator performs is TASK_READY -> (pending TASK_STARTED), after the
 * promotion, below.
 */
const before = installed.controller.status();
const attempts = before.attempts.filter((attempt) => attempt.task_id === TASK && attempt.state === "COMPLETED");
const attempt = attempts[attempts.length - 1];
const record = {
  schema: "psvr-operator-acceptance/v1",
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

/**
 * Independent verification, when the composed runtime offers it. A task whose contract touches a
 * boundary surface REQUIRES it, and promotion refuses without a run over this exact result — so the
 * operator runs the product's verifier here, before assessing eligibility. The run is recorded by the
 * product; this script does not fabricate a verdict.
 */
let verification = null;
const verificationService = installed.verification?.service;
if (verificationService !== undefined) {
  const outcome = await verificationService.verifyAttemptResult({ attemptId: attempt.attempt_id, requestedBy: "operator:psvr-accept" });
  verification = {
    status: outcome.status,
    typedReasonCode: outcome.typedReasonCode ?? null,
    verdict: outcome.run?.verdict ?? null,
    detail: outcome.detail,
    runRef: outcome.run?.runId ?? null,
    subjectDigest: outcome.run?.subject?.digest ?? null,
  };
}
record.verification = verification;

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
  // Make the NEXT task schedulable without creating its attempt: commit TASK_READY and stop, so the
  // pending decision is TASK_STARTED — exactly what `delegate` bootstraps.
  for (let tick = 0; tick < 4; tick += 1) {
    const preview = installed.controller.preview();
    if (preview.decision !== "next" || preview.eventType !== "TASK_READY") break;
    installed.controller.step();
  }
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
    : { schema: "psvr-operator-promotions/v1", records: [] };
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
