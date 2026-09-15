/**
 * G10-Y §6 — independent machine reproduction of CF-W-03.
 *
 * Claim under test: a typed invalidating ProjectIR revision COMMITs the new Work
 * world (new ProjectIR + staled task) and only THEN, in a separate
 * non-transactional step, revokes the Work Evidence that granted authority to
 * the superseded work. A process death in that window leaves a durable fail-open
 * state:
 *
 *     new ProjectIR  +  staled task  +  old Evidence still status='active'
 *
 * and because `GateEngine` reads ONLY `status='active'` evidence, the gate can
 * still consume authority that the revision was supposed to revoke.
 *
 * Method (a REAL process death, not a mock): the revision runs in a CHILD
 * process whose `appendAtomic` is observed through a thin proxy that delegates
 * to the genuine EventStore and then SIGKILLs the child the instant the batch's
 * SQLite COMMIT has returned durably. The parent then reopens the SAME database
 * file and inspects the surviving state.
 *
 * Usage: node scripts/audit/y0-cf-w-03-repro.mjs
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..", "..");
/** Windows ESM requires file:// URLs for absolute dynamic imports. */
const mod = (...segments) => pathToFileURL(join(REPO, ...segments)).href;
const PROJECT = "y0-project";
const HEAD = "c".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";

const taskSpec = (taskId, dependsOn = []) => ({
  task_id: taskId,
  objective: `Complete ${taskId}.`,
  depends_on: [...dependsOn],
  write_paths: [`src/${taskId}.py`],
  required_artifacts: [`src/${taskId}.py`],
});

class FixedClock {
  next() {
    return CLOCK;
  }
}

async function openRig(dir, { killAfterCommit = false } = {}) {
  const { EventStore } = await import(mod("dist/src/state/index.js"));
  const { createPalimpsestEffects, FakeGitPort } = await import(mod("dist/src/effects/index.js"));
  const { ProjectController } = await import(mod("dist/src/tools/index.js"));
  const { TaskPolicy } = await import(mod("dist/src/domain/index.js"));

  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FixedClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "o.sqlite"),
    git: new FakeGitPort(HEAD),
  });

  // The crash seam: delegate to the genuine store, then die the moment the
  // batch's COMMIT has returned. Nothing about the production transaction is
  // altered - the process simply never reaches the follow-up repair step.
  const storeForController = killAfterCommit
    ? new Proxy(store, {
        get(target, property) {
          if (property === "appendAtomic") {
            return (...args) => {
              const committed = target.appendAtomic(...args);
              process.kill(process.pid, "SIGKILL");
              return committed;
            };
          }
          // Read accessors with the TARGET as receiver: a proxy receiver makes
          // V8 refuse private-field access (#aggregateValidator) on the target.
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      })
    : store;

  const controller = new ProjectController({
    store: storeForController,
    effects,
    projectId: PROJECT,
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => CLOCK,
  });
  return { store, controller, effects };
}

/** Phase 1 — rev0, task-a ACTIVE with an open attempt and ACTIVE Evidence E. */
async function setup(dir) {
  const { store, controller, effects } = await openRig(dir);
  controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
  controller.step(); // TASK_STARTED -> task-a ACTIVE
  const created = controller.step(); // ATTEMPT_CREATED -> open attempt
  const attemptId = created.entity_id;
  await controller.claim(attemptId); // RUNNING

  const gateEvent = await controller.gate({
    attemptId,
    predicate: "tests_pass",
    command: ["python", "-m", "pytest"],
    exitCode: 0,
  });
  const evidenceId = gateEvent.entity_id;

  controller.declareGate(
    {
      gate_id: "g1",
      version: 1,
      subject_type: "attempt",
      require: { mode: "all", chain: [{ exists: { predicate: "tests_pass" } }] },
    },
    "y0",
  );

  const before = controller.evaluateGate("g1", "attempt", attemptId);
  store.close();
  await effects.close();
  console.log(
    JSON.stringify({ phase: "setup", attemptId, evidenceId, gateVerdict: before.verdict, evidenceUsed: before.evidence_used }, null, 2),
  );
}

/** Phase 2 — the invalidating revision, run in a child that dies at COMMIT. */
async function revise(dir) {
  const { controller } = await openRig(dir, { killAfterCommit: true });
  controller.planReconciled({
    tasks: [taskSpec("task-a"), taskSpec("task-b")],
    changeClass: "behavior_change",
    changedIds: ["task-a"],
  });
  // Unreachable when the crash seam works.
  console.log(JSON.stringify({ phase: "revise", crashSeam: "NOT_TRIGGERED" }));
  process.exit(3);
}

/** Phase 3 — reopen the same file in the parent and inspect what survived. */
async function verify(dir) {
  const { store } = await openRig(dir);
  const { activeEvidenceViews } = await import(mod("dist/src/evidence/gate_dsl.js"));
  const { GateEngine } = await import(mod("dist/src/evidence/index.js"));

  const row = store.connection
    .prepare("SELECT revision, head_commit FROM projects WHERE project_id=?")
    .get(PROJECT);
  const taskA = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, "task-a");
  const taskB = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, "task-b");
  const evidence = store.connection
    .prepare("SELECT evidence_id, status FROM evidence WHERE project_id=?")
    .all(PROJECT);
  const events = store.listEvents(PROJECT);
  const attemptId = events.find((event) => event.event_type === "ATTEMPT_CREATED").entity_id;
  const evidenceId = events.find((event) => event.event_type === "EVIDENCE_ADDED").entity_id;

  const activeViews = activeEvidenceViews(store, PROJECT, "attempt", attemptId);
  const gate = new GateEngine().evaluate(store, PROJECT, "attempt", attemptId, "g1");

  const failOpen = {
    projectRevision: Number(row.revision),
    taskAState: String(taskA.state),
    taskBRegistered: taskB !== undefined,
    evidenceStatus: String(evidence.find((e) => e.evidence_id === evidenceId).status),
    activeEvidenceViews: activeViews.map((view) => view.evidence_id),
    gateVerdictAfterRevision: gate.verdict,
    gateEvidenceUsed: gate.evidence_used,
    staleEvidenceEvents: events.filter((event) => event.event_type === "EVIDENCE_STALE").length,
  };

  // The pre-fix failure mode: the NEW world committed while the superseded
  // world's Evidence kept its gate authority.
  const mixedStateProven =
    failOpen.projectRevision === 1 &&
    failOpen.taskAState === "STALE" &&
    failOpen.taskBRegistered === true &&
    failOpen.evidenceStatus === "active" &&
    failOpen.activeEvidenceViews.includes(evidenceId) &&
    failOpen.gateVerdictAfterRevision === "PASS" &&
    failOpen.staleEvidenceEvents === 0;

  // The post-fix contract: the crash exposes the COMPLETE new world - revision
  // committed, retired task stale, its Evidence revoked by a canonical event, and
  // the gate no longer able to consume the revoked authority.
  const closedStateProven =
    failOpen.projectRevision === 1 &&
    failOpen.taskAState === "STALE" &&
    failOpen.taskBRegistered === true &&
    failOpen.evidenceStatus === "stale" &&
    !failOpen.activeEvidenceViews.includes(evidenceId) &&
    failOpen.gateVerdictAfterRevision !== "PASS" &&
    failOpen.staleEvidenceEvents === 1;

  store.close();
  const classification = mixedStateProven
    ? "FAIL_OPEN_MIXED_STATE"
    : closedStateProven
      ? "CLOSED_COMPLETE_NEW_WORLD"
      : "UNEXPECTED";
  console.log(JSON.stringify({ phase: "verify", ...failOpen, classification }, null, 2));
  process.exit(classification === "UNEXPECTED" ? 1 : 0);
}

const mode = process.argv[2];
const dir = process.argv[3] ?? mkdtempSync(join(tmpdir(), "palimpsest-y0-"));
if (mode === "setup") {
  await setup(dir);
} else if (mode === "revise") {
  await revise(dir);
} else if (mode === "verify") {
  await verify(dir);
} else {
  // Orchestrator: setup -> crashing child -> verify.
  const self = fileURLToPath(import.meta.url);
  const run = (args) =>
    spawnSync(process.execPath, [self, ...args, dir], { encoding: "utf8" });

  const setupResult = run(["setup"]);
  process.stdout.write(setupResult.stdout ?? "");
  process.stderr.write(setupResult.stderr ?? "");
  if (setupResult.status !== 0) process.exit(2);

  // A surviving child prints the NOT_TRIGGERED marker; a child killed inside the
  // COMMIT->repair window prints nothing. (Windows reports the termination as a
  // non-zero status rather than a signal, so the marker is the portable witness.)
  const reviseResult = run(["revise"]);
  const survived = (reviseResult.stdout ?? "").includes("NOT_TRIGGERED");
  console.log(
    JSON.stringify({
      crashSeam: survived ? "NOT_KILLED" : "child terminated immediately after COMMIT",
      childExitStatus: reviseResult.status,
    }),
  );
  if (survived) {
    console.error("crash seam did not fire - reproduction is not trustworthy");
    process.exit(2);
  }

  const verifyResult = run(["verify"]);
  process.stdout.write(verifyResult.stdout ?? "");
  process.stderr.write(verifyResult.stderr ?? "");
  console.log(`\nworkspace retained for inspection: ${dir}`);
  process.exit(verifyResult.status ?? 1);
}
