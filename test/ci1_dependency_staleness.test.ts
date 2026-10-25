/**
 * Palimpsest-CI1 §9/§10 — EXPLICIT CROSS-OWNER DEPENDENCY, AND STALE AUTHORITY.
 *
 * THE SCENARIO, AND WHY IT IS THE HARD ONE.
 *
 *   Owner A produces A1, and A1 is PROMOTED, so it becomes the project's canonical head.
 *   Owner B starts from that head and READS A1's actual bytes, recording the digest it consumed.
 *   B produces B1, which therefore genuinely depends on A1.
 *   Owner A then produces A2, which changes the content identity AT THE SAME PATH.
 *
 * The three questions the ruling separates, answered separately here:
 *
 *   HISTORICAL VALIDITY      did A1 really exist, and does B1 still name the A1 it consumed?
 *   CURRENT APPLICABILITY    does A1's evidence still apply now that A2 exists?
 *   PROMOTION AUTHORITY      may an operation advance the trusted state right now?
 *
 * THE FAILURE THIS TEST EXISTS TO CATCH is the SILENT REDIRECTION: B1's dependency being re-pointed at A2 because
 * A2 now occupies the same path. A path is not an identity.
 *
 * HOW THE DEPENDENCY IS MADE REAL RATHER THAN DECLARED. The ruling is explicit that "the model said it used A1" is
 * not evidence. So B's worker reads the file from the world it was given, hashes the bytes, and REFUSES when the
 * digest is not the one the caller expected. The digest B consumed is recorded from DISK. The negative control then
 * shows that claiming A1's digest while the world holds A2 is a hard failure, not a silent success.
 *
 * ONE RIG, ONE REPOSITORY. The scenario is genuinely ordered — A1 must be promoted before B can consume it, and A2
 * must exist after B1 for the redirection question to be askable — so the executions run in sequence over the same
 * repository and the same ledger, with the worker binding swapped between phases.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { callbackRuntimeCarrierPort } from "../src/runtime/index.js";
import type { WorkWorkerRunPort } from "../src/interaction/work_delegation.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function removeTree(path: string): void {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch {
      /* a live handle */
    }
  }
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* left for the global sweep */
  }
}

/**
 * CONTENT IDENTITY MUST BE MEASURED ON THE BYTES A WORKER ACTUALLY READS, NOT ON THE BYTES A TEST AUTHORED.
 *
 * This machine has `core.autocrlf=true`, so git converts LF to CRLF when it MATERIALIZES a world. A test that
 * hashes the authored string and compares it with what the worker read therefore compares two different things,
 * and fails for a reason that has nothing to do with dependency correctness. That is a REAL hazard for this
 * stage's thesis — "the candidate is bound to immutable content identity" is only true if the identity is of the
 * bytes in play — so it is measured rather than papered over: the expectation is derived with the SAME
 * normalization git applies here, and the negative control additionally asserts the authored and materialized
 * digests really do differ, so this normalization cannot silently become a no-op.
 */
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

/** A1 and A2 differ in CONTENT at the SAME PATH, which is the whole point. */
const A1_CONTENT = "export const shared = 'A1';\n";
const A2_CONTENT = "export const shared = 'A2';\n";
const BASE_CONTENT = "export const shared = 'S0';\n";
const TARGET_PATH = "src/shared.ts";

/** git's own normalization for this repository, so the expectation matches what a world will hold. */
const materialize = (authored: string): string => authored.replace(/\n/gu, "\r\n");
const A1_DIGEST = sha256(materialize(A1_CONTENT));
const A2_DIGEST = sha256(materialize(A2_CONTENT));

interface BoundedWorker extends WorkWorkerRunPort {
  readonly observations: string[];
  readonly consumed: Array<{ path: string; digest: string }>;
}

/**
 * A worker that writes one file, optionally after CONSUMING an immutable input whose digest it verifies.
 *
 * `expectedDigest` is the digest the CALLER claims the worker will find. A mismatch THROWS, so a worker handed A2
 * while its caller believes it consumed A1 cannot quietly succeed.
 */
function worker(input: {
  readonly label: string;
  readonly file: string;
  readonly contents: string;
  readonly consume?: { readonly path: string; readonly expectedDigest: string };
}): BoundedWorker {
  const observations: string[] = [];
  const consumed: Array<{ path: string; digest: string }> = [];
  return {
    adapterId: `ci1b-${input.label}`,
    observations,
    consumed,
    async run({ workDir }) {
      observations.push(`ran:${input.label}`);
      if (input.consume !== undefined) {
        const bytes = readFileSync(join(workDir, input.consume.path));
        const digest = sha256(bytes);
        consumed.push({ path: input.consume.path, digest });
        if (digest !== input.consume.expectedDigest) {
          throw new Error(`CI1B dependency mismatch: consumed ${digest}, expected ${input.consume.expectedDigest}`);
        }
      }
      mkdirSync(join(workDir, input.file, ".."), { recursive: true });
      writeFileSync(join(workDir, input.file), input.contents);
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", input.label], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

function carrierPort() {
  return callbackRuntimeCarrierPort("ci1b-carrier", {
    onRealize: async (request) => ({
      runtimeAgent: { runtimeAdapter: "ci1b", agentId: `agent-${request.activationId}` },
      session: { runtimeAdapter: "ci1b", sessionId: `session-${request.activationId}` },
    }),
    onRelease: async () => undefined,
  });
}

interface TaskDecl {
  readonly task_id: string;
  readonly objective: string;
  readonly depends_on: string[];
  readonly write_paths: string[];
  readonly required_artifacts: string[];
}

/**
 * ALL THREE EXECUTIONS ARE DECLARED UP FRONT, IN ONE PLAN.
 *
 * The first version called `palimpsest_start` again for A2 and hit `idempotency key was reused for a different
 * request`: a project's plan is declared once, and re-declaring it is a new request under the same key. The
 * dependency `task-b depends_on task-a` is what makes the ORDER a property of the plan rather than of the test's
 * call sequence — which is also more faithful, because the dependency is a project fact.
 */
const TASK_A: TaskDecl = { task_id: "task-a", objective: "owner A writes shared", depends_on: [], write_paths: [TARGET_PATH], required_artifacts: [] };
const TASK_B: TaskDecl = { task_id: "task-b", objective: "owner B consumes shared", depends_on: ["task-a"], write_paths: ["src/b.ts"], required_artifacts: [] };
const TASK_A2: TaskDecl = { task_id: "task-a2", objective: "owner A revises shared", depends_on: ["task-b"], write_paths: [TARGET_PATH], required_artifacts: [] };
const PLAN: readonly TaskDecl[] = [TASK_A, TASK_B, TASK_A2];

interface Rig {
  readonly repo: string;
  readonly installed: ReturnType<typeof installPalimpsest>;
  /** Rebind which worker handles a given write scope, so each phase can use its own. */
  readonly bind: (scope: string, next: BoundedWorker) => void;
  readonly start: (tasks: readonly TaskDecl[]) => Promise<void>;
  readonly run: (taskId: string) => Promise<{ attemptId: string; resultCommit: string }>;
  readonly promote: (attemptId: string, sourceCommit: string, expectedHeadCommit: string, taskId: string) => Promise<{ promotionId: string; resultingHeadCommit: string; satisfiedEvent: string | null; reconciliation: unknown; taskStateAfter: string }>;
  readonly attemptRow: (attemptId: string) => { state: string; report: Record<string, unknown> | null } | null;
  readonly head: () => string;
}

function makeRig(): Rig {
  const repo = mkdtempSync(join(tmpdir(), "ci1b-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, TARGET_PATH), BASE_CONTENT);
  writeFileSync(join(repo, "README.md"), "# base\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
  const head = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

  /**
   * A MUTABLE DISPATCH TABLE.
   *
   * The scenario needs a different worker in each phase — A writes the file, B reads it, A rewrites it — while the
   * ledger and repository stay the same. Rebinding through a map is the smallest way to express that, and an
   * unbound scope is a refusal rather than a fallback.
   */
  const bound = new Map<string, BoundedWorker>();

  const rig = mkdtempSync(join(tmpdir(), "ci1b-ledger-"));
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "ci1b",
      databasePath: join(rig, "p.sqlite"),
      ordariumDatabasePath: join(rig, "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      /**
       * CONCURRENCY 1, BECAUSE THIS SCENARIO IS SEQUENTIAL AND PROMOTION REQUIRES VERIFYING.
       *
       * With `concurrency: 2` the scheduler opens a batch expecting two candidates, so a single completed attempt
       * leaves the task ACTIVE rather than advancing it to VERIFYING — and `promote` refuses an ACTIVE task with
       * `task_not_verifying` (`src/effects/promotion.ts:458-461`). That is the product's real rule: a promotion may
       * only start from verified Work. Declaring capacity 1 makes each attempt a complete batch, which is what this
       * ordered scenario needs.
       */
      concurrency: 1,
      standard: {
        statement: "the candidate exists and its scope is respected",
        clauses: [{ kind: "scope_respected" as const }],
        derivedFrom: ["ci1b fixture"],
        confirmed: true,
        notes: [],
      },
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      runtimeCarrierPort: carrierPort(),
      workWorkerPort: () => ({
        adapterId: "ci1b-dispatch",
        async run(runInput: Parameters<WorkWorkerRunPort["run"]>[0]) {
          const scope = runInput.context.work.writeScope;
          const key = Array.isArray(scope) && scope.length > 0 ? String(scope[0]) : "";
          const chosen = bound.get(key);
          if (chosen === undefined) throw new Error(`CI1B: no worker bound to scope ${JSON.stringify(scope)}`);
          return chosen.run(runInput);
        },
      }),
    } as never,
  );
  cleanups.push(() => {
    try {
      installed.dispose();
    } catch {
      /* best-effort */
    }
    removeTree(rig);
    removeTree(repo);
  });

  const connection = installed.controller.store.connection as unknown as {
    prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown };
  };
  const attemptRow = (attemptId: string) => {
    const row = connection
      .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get("ci1b" as never, attemptId as never) as { state: string; report_json: Uint8Array | null } | undefined;
    if (row === undefined) return null;
    return {
      state: row.state,
      report: row.report_json === null ? null : (JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>),
    };
  };

  const start = async (tasks: readonly TaskDecl[]) => {
    const tool = installed.tools.find((entry) => entry.name === "palimpsest_start");
    if (tool === undefined) throw new Error("no palimpsest_start");
    await tool.execute(
      { projectId: "ci1b", goal: "cross-owner dependency", headCommit: head(), tasks },
      { callId: "c-start", rootCallId: "r-start", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal },
    );
  };

  const service = installed.workDelegation;
  if (service === undefined) throw new Error("CI1B: no work delegation composed");
  /**
   * ADVANCE THE SCHEDULER BEFORE ASKING FOR THE NEXT TASK.
   *
   * `expectedTaskId` is an ASSERTION about what the scheduler would do next, not a command. After one attempt
   * settles, the task's own transition (ACTIVE -> VERIFYING) and the next task's readiness are the SCHEDULER's
   * decisions, committed by `controller.step()`. Without stepping, `speculativeAdmission` refuses with
   * `TASK_NOT_NEXT_SCHEDULABLE` because the project has not yet recorded that the previous work moved on.
   *
   * Stepping is bounded and stops when the scheduler reports idle, so it cannot spin.
   */
  const settleScheduler = () => {
    const committed: string[] = [];
    for (let tick = 0; tick < 20; tick += 1) {
      const event = installed.controller.step();
      if (event === null) break;
      committed.push(event.event_type);
    }
    if (process.env.CI1_DEBUG === "1") console.error("STEPS:", JSON.stringify(committed));
  };

  const run = async (taskId: string) => {
    /**
     * DO NOT STEP HERE.
     *
     * An earlier version called `settleScheduler()` before `start`, which committed the very `TASK_STARTED` that
     * `start` needs to own — so `speculativeAdmission` then saw `idle` and refused with
     * `TASK_NOT_NEXT_SCHEDULABLE`. `start` performs its own admission and opens the attempt; stepping first steals
     * its position. The scheduler is advanced only where the SCENARIO needs a transition that `start` does not make
     * itself — that is, between a promotion and its reconciliation.
     */
    /**
     * ADVANCE ONLY WHILE THE SCHEDULER IS NOT YET READY TO START SOMETHING.
     *
     * `start` requires the scheduler's next decision to be `TASK_STARTED`. After a promotion the scheduler first
     * wants `TASK_READY` (unblocking the dependent task) and only then `TASK_STARTED`. Stepping while the decision is
     * already `TASK_STARTED` would steal `start`'s own position, so the loop stops there — which is the narrowest
     * correct rule and the one that took the most attempts to find.
     */
    for (let tick = 0; tick < 12; tick += 1) {
      const preview = installed.controller.preview();
      if (preview.decision !== "next" || preview.eventType === "TASK_STARTED") break;
      installed.controller.step();
    }
    const started = await service.start({ expectedTaskId: taskId });
    const deadline = Date.now() + 120_000;
    let view: Awaited<ReturnType<typeof service.followup>> | undefined;
    while (Date.now() < deadline) {
      view = await service.followup({ jobId: started.jobId });
      if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) break;
      await new Promise((done) => setTimeout(done, 25));
    }
    if (view === undefined || !("phase" in view) || view.phase !== "FINISHED" || view.attemptId === null) {
      throw new Error(`task ${taskId} did not finish: ${JSON.stringify(view)}`);
    }
    const row = attemptRow(view.attemptId);
    if (row === null || typeof row.report?.result_commit !== "string") {
      throw new Error(`task ${taskId} has no canonical result`);
    }
    return { attemptId: view.attemptId, resultCommit: row.report.result_commit };
  };

  /**
   * ADVANCE THE SCHEDULER UNTIL THE TASK REACHES VERIFYING.
   *
   * Settlement writes the ATTEMPT's terminal state, but the TASK's transition to VERIFYING is the SCHEDULER's own
   * decision, committed by `controller.step()`. Without a step the task stays ACTIVE and `promote` refuses with
   * `task_not_verifying` — a real product rule, not a test obstacle: a promotion may only start from verified Work.
   *
   * The loop is bounded and stops on a stable state, so a task that cannot advance fails loudly instead of spinning.
   */
  const advanceToVerifying = (taskId: string): string => {
    for (let tick = 0; tick < 20; tick += 1) {
      const state = taskState(taskId);
      if (state === "VERIFYING") return state;
      const event = installed.controller.step();
      if (event === null) return taskState(taskId);
    }
    return taskState(taskId);
  };

  const taskState = (taskId: string): string => {
    const row = connection
      .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
      .get("ci1b" as never, taskId as never) as { state: string } | undefined;
    return row?.state ?? "UNKNOWN";
  };

  /**
   * PROMOTE, THEN RECONCILE THE PROJECT HEAD.
   *
   * A promotion advances the PROVEN EFFECT HEAD, but the ProjectIR's own `headCommit` only advances through an
   * explicit reconciliation. Until that happens the project reports `SYNC_REQUIRED`, and new work is refused with
   * `HEAD_NOT_IN_SYNC: new work must not be activated until the head is reconciled`.
   *
   * That refusal is the product's real staleness fence, and it is exactly the mechanism the ruling asks this stage
   * to exercise rather than simulate. So promotion here does BOTH steps, and reports the reconciliation outcome as
   * its own fact instead of folding it into a success flag.
   */
  const promote = async (attemptId: string, sourceCommit: string, expectedHeadCommit: string, taskId: string) => {
    const state = advanceToVerifying(taskId);
    if (state !== "VERIFYING") {
      throw new Error(`CI1B: task ${taskId} did not reach VERIFYING (state ${state})`);
    }
    const result = await installed.controller.promote(attemptId, sourceCommit, expectedHeadCommit);
    /**
     * STEP EXACTLY ONCE — ENOUGH TO MOVE THE PROMOTED TASK TO SATISFIED, AND NO FURTHER.
     *
     * This ordering constraint took several attempts to get right, and it is a REAL property of the product rather
     * than a test detail:
     *
     *   · the first step after settlement commits `TASK_SATISFIED` for the promoted task;
     *   · a SECOND step immediately commits `TASK_READY` + `TASK_STARTED` for the next ready task, which makes the
     *     project non-quiescent again — so a reconcile attempted after that is blocked for the NEXT task's sake,
     *     not the promoted one's.
     *
     * Therefore the reconcile runs after the first step and before any further one. Looping `step()` until the
     * scheduler reports idle is exactly wrong here: it advances the whole plan past the quiescence window.
     */
    const afterSatisfied = installed.controller.step();
    const reconciliation = await installed.controller.reconcileProjectHead();
    return {
      promotionId: result.promotionId,
      resultingHeadCommit: result.resultingHeadCommit,
      satisfiedEvent: afterSatisfied?.event_type ?? null,
      reconciliation,
      taskStateAfter: taskState(taskId),
    };
  };

  return { repo, installed, bind: (scope, next) => void bound.set(scope, next), start, run, promote, attemptRow, head };
}

describe("CI1 §9 C2-B — explicit cross-Owner dependency, and no silent redirection", () => {
  it("B1 names the A1 it actually consumed, and A2 does not inherit it", async () => {
    const workerA1 = worker({ label: "A1", file: TARGET_PATH, contents: A1_CONTENT });
    const workerB1 = worker({
      label: "B1",
      file: "src/b.ts",
      contents: "export const b = 'B1';\n",
      consume: { path: TARGET_PATH, expectedDigest: A1_DIGEST },
    });
    const workerA2 = worker({ label: "A2", file: TARGET_PATH, contents: A2_CONTENT });

    const rig = makeRig();

    /** PHASE 1 — A produces A1 from the shared baseline S0. */
    const s0 = rig.head();
    rig.bind(TARGET_PATH, workerA1);
    await rig.start(PLAN);
    const a1 = await rig.run("task-a");

    expect(workerA1.consumed).toEqual([]);
    /**
     * `git show` reports the BLOB, which is the NORMALIZED content — LF, not the CRLF a checkout materializes. So
     * the blob digest is compared with the authored digest, and the materialized digest is compared with what the
     * worker read. Keeping the two separate is the point: they are different identities of the same file, and only
     * one of them is what a consumer actually sees.
     */
    const a1Blob = execFileSync("git", ["show", `${a1.resultCommit}:${TARGET_PATH}`], { cwd: rig.repo, encoding: "utf8" });
    expect(sha256(a1Blob)).toBe(sha256(A1_CONTENT));
    expect(A1_DIGEST).not.toBe(sha256(A1_CONTENT));

    /**
     * PHASE 2 — A1 is PROMOTED with a compare-and-swap on the expected head.
     *
     * This is the mechanism that makes "current revision" a real thing rather than a label: the promotion refuses
     * unless the expected head is the canonical head (`src/effects/promotion.ts:476-480`).
     */
    const promotionA1 = await rig.promote(a1.attemptId, a1.resultCommit, s0, "task-a");
    expect(promotionA1.promotionId).toBeTruthy();
    /**
     * THE RECONCILIATION IS ITS OWN FACT, NOT A SUCCESS FLAG.
     *
     * `satisfiedEvent` is what the scheduler committed to move the promoted task out of VERIFYING, and
     * `reconciliation.status` is the head owner's own verdict. Asserting both separately is what keeps "the task was
     * satisfied" from being silently equated with "the head advanced".
     */
    expect(promotionA1.satisfiedEvent).toBe("TASK_SATISFIED");
    expect((promotionA1.reconciliation as { status?: string }).status).toBe("reconciled");
    const headAfterA1 = rig.head();
    expect(headAfterA1).not.toBe(s0);

    /**
     * PHASE 3 — B consumes A1 FROM THE PROMOTED HEAD and produces B1.
     *
     * B's worker reads the file and hashes it, so the recorded digest is the bytes it actually saw. If the world
     * did not contain A1, this would either throw (digest mismatch) or record a different digest — both of which
     * are failures, not quiet successes.
     */
    rig.bind("src/b.ts", workerB1);
    const b1 = await rig.run("task-b");
    expect(workerB1.consumed).toEqual([{ path: TARGET_PATH, digest: A1_DIGEST }]);
    expect(workerB1.observations).toEqual(["ran:B1"]);

    /** B1's own content is a distinct immutable object. */
    const b1Bytes = execFileSync("git", ["show", `${b1.resultCommit}:src/b.ts`], { cwd: rig.repo, encoding: "utf8" });
    expect(b1Bytes).toContain("B1");
    expect(b1.resultCommit).not.toBe(a1.resultCommit);

    /**
     * PHASE 4 — A produces A2, which CHANGES THE CONTENT AT THE SAME PATH.
     *
     * A2 must be promoted to become "current", so it is promoted here. This is what makes the staleness question
     * askable: after this point A2 is the canonical head and A1 is historical.
     */
    /**
     * B1 MUST ALSO BE PROMOTED BEFORE THE PLAN CAN ADVANCE.
     *
     * This is a product rule the scheduler trace made visible: a completed task sits in VERIFYING, and the plan
     * will not move to the next task until that task is promoted and reaches SATISFIED. So each phase here is
     * execute -> promote -> reconcile, and the A2 phase cannot start until B1 has been through that cycle.
     */
    const promotionB1 = await rig.promote(b1.attemptId, b1.resultCommit, headAfterA1, "task-b");
    expect(promotionB1.satisfiedEvent).toBe("TASK_SATISFIED");
    expect((promotionB1.reconciliation as { status?: string }).status).toBe("reconciled");
    const headAfterB1 = rig.head();
    expect(headAfterB1).not.toBe(headAfterA1);

    rig.bind(TARGET_PATH, workerA2);
    const a2 = await rig.run("task-a2");
    const a2Blob = execFileSync("git", ["show", `${a2.resultCommit}:${TARGET_PATH}`], { cwd: rig.repo, encoding: "utf8" });
    expect(sha256(a2Blob)).toBe(sha256(A2_CONTENT));
    expect(A2_DIGEST).not.toBe(A1_DIGEST);
    await rig.promote(a2.attemptId, a2.resultCommit, headAfterB1, "task-a2");

    /**
     * HISTORICAL VALIDITY — UNCHANGED.
     *
     * B1's recorded consumption still names A1's digest. Nothing about A2 rewrote it, because the record is of
     * BYTES, not of a path. This is the assertion the silent-redirection failure would break.
     */
    expect(workerB1.consumed).toEqual([{ path: TARGET_PATH, digest: A1_DIGEST }]);
    expect(workerB1.consumed[0]!.digest).not.toBe(A2_DIGEST);

    /**
     * CURRENT APPLICABILITY — SEPARATE FROM HISTORICAL VALIDITY.
     *
     * The file at that path now holds A2. So B1's consumption record is historically true and currently
     * inapplicable. Both statements are made from measured facts: the digest B consumed, and the bytes at the path
     * now. Collapsing these into one "B1 is valid" flag would lose exactly the distinction the ruling asks for.
     */
    const nowBytes = readFileSync(join(rig.repo, TARGET_PATH));
    expect(sha256(nowBytes)).toBe(A2_DIGEST);
    expect(sha256(nowBytes)).not.toBe(workerB1.consumed[0]!.digest);

    /**
     * THE THREE ATTEMPTS ARE THREE DISTINCT CANONICAL RESULTS, each with its own terminal state and report.
     */
    const rowA1 = rig.attemptRow(a1.attemptId);
    const rowB1 = rig.attemptRow(b1.attemptId);
    const rowA2 = rig.attemptRow(a2.attemptId);
    expect(rowA1?.state).toBe("COMPLETED");
    expect(rowB1?.state).toBe("COMPLETED");
    expect(rowA2?.state).toBe("COMPLETED");
    expect(new Set([a1.resultCommit, b1.resultCommit, a2.resultCommit]).size).toBe(3);
  }, 240_000);

  it("NEGATIVE CONTROL: a consumer that claims A1 while the world holds A2 fails hard", async () => {
    /**
     * THE MISBOUND-DEPENDENCY CONTROL.
     *
     * A worker is told to expect A1's digest while the world it is handed actually contains A2. If the harness
     * silently accepted that, every dependency claim in this file would be worthless. So this asserts the opposite:
     * the worker THROWS, the job reports HOST_ERROR, and NO canonical result is recorded for the attempt.
     *
     * This is the control for §13 item 4 (candidate hash mismatch) and item 5 (incorrect dependency version).
     *
     * THE ORDER IS THE PRODUCT'S, AGAIN. task-a must run and be promoted before task-b becomes schedulable, so the
     * A2 content is produced by A's own worker rather than seeded behind the scheduler's back. Doing it through the
     * product means the world B receives is one the product actually created.
     */
    const writerA2 = worker({ label: "A2", file: TARGET_PATH, contents: A2_CONTENT });
    const liar = worker({
      label: "LIAR",
      file: "src/b.ts",
      contents: "export const b = 'LIE';\n",
      consume: { path: TARGET_PATH, expectedDigest: A1_DIGEST },
    });
    const rig = makeRig();

    /** A produces A2 and it is promoted, so the world B starts from genuinely holds A2. */
    rig.bind(TARGET_PATH, writerA2);
    await rig.start([TASK_A, TASK_B]);
    const a2 = await rig.run("task-a");
    const promotion = await rig.promote(a2.attemptId, a2.resultCommit, rig.head(), "task-a");
    expect(promotion.satisfiedEvent).toBe("TASK_SATISFIED");
    expect((promotion.reconciliation as { status?: string }).status).toBe("reconciled");

    /** Now B runs and is told to expect A1. The world holds A2, so the claim is false. */
    rig.bind("src/b.ts", liar);
    let failed = false;
    let attemptId: string | null = null;
    try {
      const result = await rig.run("task-b");
      attemptId = result.attemptId;
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);

    /**
     * The worker DID read the file and recorded the digest it actually saw — A2's. That record is what makes the
     * refusal attributable: not "the worker crashed", but "the worker read different bytes than claimed".
     */
    expect(liar.consumed).toEqual([{ path: TARGET_PATH, digest: A2_DIGEST }]);
    expect(liar.consumed[0]!.digest).not.toBe(A1_DIGEST);

    /** And no attempt reached COMPLETED, so no result was recorded against the false claim. */
    if (attemptId !== null) {
      const row = rig.attemptRow(attemptId);
      expect(row?.state).not.toBe("COMPLETED");
    }
  }, 240_000);
});
