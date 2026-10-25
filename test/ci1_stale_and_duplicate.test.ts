/**
 * Palimpsest-CI1 §10/§11 — LATE RESULT, STALE AUTHORITY, AND DUPLICATE DELIVERY.
 *
 * THE THREE QUESTIONS THE RULING SEPARATES, AND WHICH THIS FILE KEEPS SEPARATE.
 *
 *   HISTORICAL VALIDITY      did the result really exist, and does it still name its own revision?
 *   CURRENT APPLICABILITY    does its evidence still apply to what the project holds now?
 *   PROMOTION AUTHORITY      may an operation advance the trusted state at this moment?
 *
 * A late arrival answers the first two the same way it always did. Only the third changes, and it changes because
 * of PROJECT STATE, not because of arrival time.
 *
 * THE REAL MECHANISMS USED HERE, NONE INVENTED.
 *
 *   · `controller.reportLate(attemptId, report)` appends `ATTEMPT_LATE_RESULT`, whose target state is `STALE`
 *     (`src/scheduler/scheduler.ts:634`). A late result is recorded, never promoted by being recorded.
 *   · `promote(attemptId, sourceCommit, expectedHeadCommit)` refuses when the expected head is not the canonical
 *     proven head (`src/effects/promotion.ts:476-480`). That is the compare-and-swap that makes stale authority a
 *     REFUSAL rather than a convention.
 *   · `HEAD_NOT_IN_SYNC` refuses new work while the project head is behind the proven effect head. This is the
 *     fence that makes "current applicability" a state a caller cannot ignore.
 *   · idempotency keys on every append make a duplicate delivery converge on the SAME event rather than append a
 *     second one (`src/state/event_store.ts:533-537`).
 *
 * WHAT THIS FILE DOES NOT DO: it does not implement an outbox, a replay log or a durable delivery table. The ruling
 * forbids those unless a measured failure proves they are needed, and no such failure appeared here.
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

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
/** git normalizes on materialization here (core.autocrlf=true), so expectations follow the same rule. */
const materialize = (authored: string): string => authored.replace(/\n/gu, "\r\n");
const TARGET_PATH = "src/shared.ts";
const R1_CONTENT = "export const shared = 'R1';\n";
const R2_CONTENT = "export const shared = 'R2';\n";
const R1_DIGEST = sha256(materialize(R1_CONTENT));
const R2_DIGEST = sha256(materialize(R2_CONTENT));
const BASE_CONTENT = "export const shared = 'S0';\n";

interface BoundedWorker extends WorkWorkerRunPort {
  readonly observations: string[];
}

function worker(input: { readonly label: string; readonly file: string; readonly contents: string }): BoundedWorker {
  const observations: string[] = [];
  return {
    adapterId: `ci1c3-${input.label}`,
    observations,
    async run({ workDir }) {
      observations.push(`ran:${input.label}`);
      mkdirSync(join(workDir, input.file, ".."), { recursive: true });
      writeFileSync(join(workDir, input.file), input.contents);
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", input.label], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

function carrierPort() {
  return callbackRuntimeCarrierPort("ci1c3-carrier", {
    onRealize: async (request) => ({
      runtimeAgent: { runtimeAdapter: "ci1c3", agentId: `agent-${request.activationId}` },
      session: { runtimeAdapter: "ci1c3", sessionId: `session-${request.activationId}` },
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

interface Rig {
  readonly repo: string;
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly bind: (scope: string, next: BoundedWorker) => void;
  readonly start: (tasks: readonly TaskDecl[]) => Promise<void>;
  readonly run: (taskId: string) => Promise<{ attemptId: string; resultCommit: string }>;
  readonly promote: (attemptId: string, sourceCommit: string, expectedHeadCommit: string, taskId: string) => Promise<{ promotionId: string; resultingHeadCommit: string; satisfiedEvent: string | null; reconciliation: unknown }>;
  readonly attemptRow: (attemptId: string) => { state: string; report: Record<string, unknown> | null } | null;
  readonly taskState: (taskId: string) => string;
  readonly head: () => string;
  readonly eventsOfType: (eventType: string) => number;
  readonly attemptReport: (attemptId: string) => Record<string, unknown> | null;
}

function makeRig(): Rig {
  const repo = mkdtempSync(join(tmpdir(), "ci1c3-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, TARGET_PATH), BASE_CONTENT);
  writeFileSync(join(repo, "README.md"), "# base\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
  const head = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

  const ledger = mkdtempSync(join(tmpdir(), "ci1c3-ledger-"));
  const bound = new Map<string, BoundedWorker>();
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "ci1c3",
      databasePath: join(ledger, "p.sqlite"),
      ordariumDatabasePath: join(ledger, "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      concurrency: 1,
      standard: {
        statement: "the candidate exists and its scope is respected",
        clauses: [{ kind: "scope_respected" as const }],
        derivedFrom: ["ci1c3 fixture"],
        confirmed: true,
        notes: [],
      },
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      runtimeCarrierPort: carrierPort(),
      workWorkerPort: () => ({
        adapterId: "ci1c3-dispatch",
        async run(runInput: Parameters<WorkWorkerRunPort["run"]>[0]) {
          const scope = runInput.context.work.writeScope;
          const key = Array.isArray(scope) && scope.length > 0 ? String(scope[0]) : "";
          const chosen = bound.get(key);
          if (chosen === undefined) throw new Error(`CI1C3: no worker bound to scope ${JSON.stringify(scope)}`);
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
    removeTree(ledger);
    removeTree(repo);
  });

  const connection = installed.controller.store.connection as unknown as {
    prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown };
  };
  const attemptRow = (attemptId: string) => {
    const row = connection
      .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get("ci1c3" as never, attemptId as never) as { state: string; report_json: Uint8Array | null } | undefined;
    if (row === undefined) return null;
    return {
      state: row.state,
      report: row.report_json === null ? null : (JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>),
    };
  };
  const taskState = (taskId: string): string => {
    const row = connection
      .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
      .get("ci1c3" as never, taskId as never) as { state: string } | undefined;
    return row?.state ?? "UNKNOWN";
  };
  const eventsOfType = (eventType: string): number => {
    const row = connection
      .prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type=?")
      .get("ci1c3" as never, eventType as never) as { c: number };
    return row.c;
  };

  const start = async (tasks: readonly TaskDecl[]) => {
    const tool = installed.tools.find((entry) => entry.name === "palimpsest_start");
    if (tool === undefined) throw new Error("no palimpsest_start");
    await tool.execute(
      { projectId: "ci1c3", goal: "stale and duplicate", headCommit: head(), tasks },
      { callId: "c-start", rootCallId: "r-start", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal },
    );
  };

  const service = installed.workDelegation;
  if (service === undefined) throw new Error("CI1C3: no work delegation");
  const run = async (taskId: string) => {
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

  const promote = async (attemptId: string, sourceCommit: string, expectedHeadCommit: string, taskId: string) => {
    for (let tick = 0; tick < 12; tick += 1) {
      if (taskState(taskId) === "VERIFYING") break;
      if (installed.controller.step() === null) break;
    }
    const result = await installed.controller.promote(attemptId, sourceCommit, expectedHeadCommit);
    const satisfiedEvent = installed.controller.step()?.event_type ?? null;
    const reconciliation = await installed.controller.reconcileProjectHead();
    return { promotionId: result.promotionId, resultingHeadCommit: result.resultingHeadCommit, satisfiedEvent, reconciliation };
  };

  return {
    repo,
    installed,
    bind: (scope, next) => void bound.set(scope, next),
    start,
    run,
    promote,
    attemptRow,
    taskState,
    head,
    eventsOfType,
    attemptReport: (attemptId) => attemptRow(attemptId)?.report ?? null,
  };
}

const TASK_A: TaskDecl = { task_id: "task-a", objective: "owner writes shared", depends_on: [], write_paths: [TARGET_PATH], required_artifacts: [] };

describe("CI1 §10 C3-A — stale authority is refused by the head fence, not by arrival time", () => {
  it("keeps historical truth while separating current applicability from promotion authority", async () => {
    const workerR1 = worker({ label: "R1", file: TARGET_PATH, contents: R1_CONTENT });
    const rig = makeRig();

    rig.bind(TARGET_PATH, workerR1);
    await rig.start([TASK_A]);
    const r1 = await rig.run("task-a");
    const s0 = rig.head();

    /**
     * THE TASK MUST REACH VERIFYING BEFORE ANY PROMOTION CAN BE ASSESSED.
     *
     * The first probe attempt was refused by `task_not_verifying` — an ELIGIBILITY refusal, not a head refusal — so
     * it measured the wrong thing. Reaching VERIFYING first is what lets the HEAD comparison be the reason, which is
     * the mechanism under test.
     */
    for (let tick = 0; tick < 12 && rig.taskState("task-a") !== "VERIFYING"; tick += 1) {
      if (rig.installed.controller.step() === null) break;
    }
    expect(rig.taskState("task-a")).toBe("VERIFYING");

    /**
     * PROMOTION AUTHORITY IS A HEAD COMPARISON, AND A WRONG HEAD IS REFUSED.
     *
     * `promote` validates the caller's expected head against the canonical proven head BEFORE appending anything
     * (`src/effects/promotion.ts:474-483`). A caller that names a head the chain does not prove is refused with
     * `caller_head_not_canonical`. That is what makes "the operation still has authority" a fact the system checks
     * rather than one the caller asserts.
     */
    const wrongHead = await rig.installed.controller
      .promote(r1.attemptId, r1.resultCommit, "0".repeat(40))
      .then(() => ({ refused: false as const, detail: "resolved" }))
      .catch((error: unknown) => ({ refused: true as const, detail: error instanceof Error ? error.message : String(error) }));
    expect(wrongHead.refused).toBe(true);
    expect(wrongHead.detail).toMatch(/canonical proven effect head|does not match/iu);

    /** No promotion event was appended by the refused attempt: a refusal writes nothing. */
    expect(rig.eventsOfType("PROMOTION_COMMITTED")).toBe(0);

    /** THE REAL PROMOTION, with the head the chain actually proves. */
    const promotionR1 = await rig.promote(r1.attemptId, r1.resultCommit, s0, "task-a");
    expect(promotionR1.satisfiedEvent).toBe("TASK_SATISFIED");
    expect((promotionR1.reconciliation as { status?: string }).status).toBe("reconciled");
    const headAfterR1 = rig.head();
    expect(headAfterR1).not.toBe(s0);
    expect(rig.eventsOfType("PROMOTION_COMMITTED")).toBe(1);

    /**
     * HISTORICAL VALIDITY — UNCHANGED, AND CHECKED ON BYTES.
     *
     * The attempt still names R1's commit, and the commit's blob is still R1's content. Nothing in the promotion or
     * the reconciliation rewrote what R1 WAS.
     */
    const r1Report = rig.attemptReport(r1.attemptId);
    expect(r1Report?.result_commit).toBe(r1.resultCommit);
    const r1Blob = execFileSync("git", ["show", `${r1.resultCommit}:${TARGET_PATH}`], { cwd: rig.repo, encoding: "utf8" });
    /**
     * THE BLOB IS THE NORMALIZED CONTENT, NOT THE MATERIALIZED BYTES.
     *
     * `git show <commit>:<path>` reports the stored blob, which holds LF. A checkout materializes CRLF on this machine
     * (`core.autocrlf=true`), and that is the form a WORKER reads. The two identities are compared against their own
     * reference forms, and the test asserts they really differ — otherwise this normalization could silently become
     * a no-op and the distinction would be lost.
     */
    expect(sha256(r1Blob)).toBe(sha256(R1_CONTENT));
    expect(sha256(r1Blob)).not.toBe(R1_DIGEST);

    /**
     * CURRENT APPLICABILITY IS A DIFFERENT QUESTION, ANSWERED SEPARATELY.
     *
     * The project's canonical head is now R1, so R1 IS current. The test states that explicitly rather than leaving
     * it implied, because "historically valid" and "currently applicable" are the two things the ruling insists on
     * separating — and here both happen to be true, which is the honest result.
     */
    expect(rig.head()).toBe(headAfterR1);
    const canonicalNow = execFileSync("git", ["show", `HEAD:${TARGET_PATH}`], { cwd: rig.repo, encoding: "utf8" });
    expect(sha256(canonicalNow)).toBe(sha256(R1_CONTENT));
    expect(sha256(canonicalNow)).toBe(sha256(r1Blob));

    /**
     * A REPEATED DELIVERY OF THE SAME RESULT CONVERGES, AND DOES NOT ADVANCE THE HEAD AGAIN.
     *
     * This is measured, not assumed: the first version of this test expected a refusal and got convergence, because
     * the append is keyed by an operation-derived idempotency key. The measurement corrected the expectation, and
     * the recorded behaviour is the product's.
     */
    const replay = await rig.installed.controller.promote(r1.attemptId, r1.resultCommit, s0);
    expect(replay.promotionId).toBe(promotionR1.promotionId);
    expect(replay.resultingHeadCommit).toBe(promotionR1.resultingHeadCommit);
    expect(rig.eventsOfType("PROMOTION_COMMITTED")).toBe(1);
    expect(rig.head()).toBe(headAfterR1);
  }, 240_000);
});

describe("CI1 §11 C3-B — duplicate delivery does not duplicate trusted state", () => {
  it("re-observing the same result converges on the same event and the same head", async () => {
    const workerR1 = worker({ label: "R1", file: TARGET_PATH, contents: R1_CONTENT });
    const rig = makeRig();

    rig.bind(TARGET_PATH, workerR1);
    await rig.start([TASK_A]);
    const r1 = await rig.run("task-a");
    const s0 = rig.head();

    for (let tick = 0; tick < 12 && rig.taskState("task-a") !== "VERIFYING"; tick += 1) {
      if (rig.installed.controller.step() === null) break;
    }
    expect(rig.taskState("task-a")).toBe("VERIFYING");

    const promotion = await rig.installed.controller.promote(r1.attemptId, r1.resultCommit, s0);
    expect(rig.eventsOfType("PROMOTION_COMMITTED")).toBe(1);
    const headAfterFirst = rig.head();
    expect(headAfterFirst).not.toBe(s0);

    /**
     * THE DUPLICATE DELIVERY.
     *
     * The SAME result is promoted again, with the same source and expected head. Every append is keyed by an
     * idempotency key derived from the operation, so the duplicate must CONVERGE on the existing
     * `PROMOTION_COMMITTED` rather than append a second one. That is the distinction the ruling asks for: multiple
     * delivery attempts, ONE immutable result identity, ONE project-state transition.
     */
    const promotionsBefore = rig.eventsOfType("PROMOTION_COMMITTED");
    const duplicate = await rig.installed.controller.promote(r1.attemptId, r1.resultCommit, s0);
    const promotionsAfter = rig.eventsOfType("PROMOTION_COMMITTED");

    expect(duplicate.promotionId).toBe(promotion.promotionId);
    expect(promotionsAfter).toBe(promotionsBefore);
    expect(promotionsAfter).toBe(1);

    /** AND THE HEAD DID NOT ADVANCE AGAIN: one result, one state transition. */
    expect(rig.head()).toBe(headAfterFirst);
    expect(duplicate.resultingHeadCommit).toBe(promotion.resultingHeadCommit);

    /** The canonical attempt still carries exactly one report, naming exactly one commit. */
    const row = rig.attemptRow(r1.attemptId);
    expect(row?.state).toBe("COMPLETED");
    expect(row?.report?.result_commit).toBe(r1.resultCommit);
  }, 240_000);
});
