/**
 * PLMP-LEAN-1 §D2-d — the asynchronous Work transport, and the three equations it exists to prove.
 *
 *     CanonicalOutcome(sync) == CanonicalOutcome(async)
 *     HostLifetimeFailure    ⇏  FabricatedProjectFact
 *     delegate(W)            executes an EXISTING canonical Work, not an invented intent
 *
 * The transport adds a non-blocking `start`, a host-local job lifetime, observation and restart honesty
 * — and nothing else. `prepare`, `run`, `settle`, the completion invariant, basis admission and the
 * promotion authority are untouched, which is why there is ONE blocking kernel and the async layer is a
 * wrapper over it.
 *
 * The distinction the whole slice turns on:
 *
 *     HostJobState != AttemptState        HostJob is NOT canonical Project truth
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import {
  executeMutatingWorkBlocking,
  makeWorkDelegationService,
  type WorkWorkerRunPort,
} from "../src/interaction/work_delegation.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["test fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

function workspace(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d2d-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return { repo, head: git(repo, ["rev-parse", "HEAD"]) };
}

interface Connection {
  prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown };
}

function makeStack(repo: string) {
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "d2d",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  const connection = installed.controller.store.connection as unknown as Connection;
  const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const tool = installed.tools.find((entry) => entry.name === name);
    if (tool === undefined) throw new Error(`no core tool ${name}`);
    return (await tool.execute(args, {
      callId: `c-${name}`,
      rootCallId: `r-${name}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })) as Record<string, unknown>;
  };
  return { installed, controller: installed.controller, connection, call };
}

async function declarePlan(
  call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
  head: string,
  tasks?: readonly unknown[],
): Promise<void> {
  await call("palimpsest_start", {
    projectId: "d2d",
    goal: "make the project tidy",
    headCommit: head,
    tasks:
      tasks ??
      [
        { task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
        { task_id: "t2", objective: "tidy b", depends_on: ["t1"], write_paths: ["src/a.ts"], required_artifacts: [] },
      ],
  });
}

/** A worker that edits and commits inside whatever world it is handed — the real discipline. */
function committingWorker(contents = "export const a = 2;\n"): WorkWorkerRunPort {
  return {
    adapterId: "test-committing-worker",
    async run({ workDir }) {
      writeFileSync(join(workDir, "src", "a.ts"), contents);
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["commit", "-qm", "worker commit"], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

/**
 * Wait until a job reaches a phase, or a condition holds. Async transport means `start` returns BEFORE
 * prepare runs, so asserting canonical state immediately after `start` would be asserting a race — the
 * honest thing is to wait for the observable transition.
 */
async function waitFor<T>(read: () => Promise<T> | T, done: (value: T) => boolean, label: string): Promise<T> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const attemptStates = (connection: Connection): readonly string[] =>
  (connection.prepare("SELECT state FROM attempts WHERE project_id=? ORDER BY attempt_id").all("d2d" as never) as readonly {
    state: string;
  }[]).map((row) => row.state);

const eventCount = (connection: Connection): number =>
  (connection.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=?").get("d2d" as never) as { c: number }).c;

/** The canonical execution outcome, as an equality-comparable shape. */
function canonicalOutcome(connection: Connection, attemptId: string): Record<string, unknown> {
  const row = connection.prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?").get(
    "d2d" as never,
    attemptId as never,
  ) as { state: string; report_json: Uint8Array | null } | undefined;
  const report = row?.report_json == null ? null : (JSON.parse(new TextDecoder().decode(row.report_json)) as { result_commit?: string | null; changed_files?: readonly string[] });
  return { state: row?.state ?? null, resultCommit: report?.result_commit ?? null, changedFiles: report?.changed_files ?? null };
}

describe("§D2-d the transport is additive, and executes EXISTING work", () => {
  it("start returns before the work completes, then the job settles the canonical attempt", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo, );
    await declarePlan(stack.call, head);

    let releaseWorker: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseWorker = resolve;
    });
    const service = makeWorkDelegationService({
      controller: stack.controller,
      workerFor: () => ({
        adapterId: "gated-worker",
        async run({ workDir }) {
          await gate;
          writeFileSync(join(workDir, "src", "a.ts"), "export const a = 2;\n");
          execFileSync("git", ["add", "-A"], { cwd: workDir });
          execFileSync("git", ["commit", "-qm", "worker commit"], { cwd: workDir });
          return { kind: "READY_FOR_SETTLEMENT" };
        },
      }),
    });

    const started = await service.start();
    expect(started.state).toBe("STARTED");
    expect(started.taskId).toBe("t1");
    // RETURNED BEFORE COMPLETION: `start` has already returned, and the canonical attempt reaches
    // RUNNING while the worker is still parked. Nothing has settled.
    const running = await waitFor(
      () => attemptStates(stack.connection),
      (states) => states.length === 1 && states[0] === "RUNNING",
      "the attempt to reach RUNNING",
    );
    expect(running).toEqual(["RUNNING"]);
    const mid = await service.followup({ jobId: started.jobId });
    expect("phase" in mid && mid.phase === "RUNNING").toBe(true);

    releaseWorker();
    const done = await waitFor(
      () => service.followup({ jobId: started.jobId }),
      (candidate) => "phase" in candidate && candidate.phase === "FINISHED",
      "the job to finish after the worker was released",
    );
    if (!("attemptId" in done)) throw new Error("expected a job view");
    expect(done.phase).toBe("FINISHED");
    expect(done.attemptId).toBeTruthy();
    expect(attemptStates(stack.connection)).toEqual(["COMPLETED"]);
    // The result is the OBSERVED commit — a real commit that is not the base — and the project itself
    // still holds none of the work.
    const outcome = canonicalOutcome(stack.connection, done.attemptId!);
    expect(outcome.resultCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(outcome.resultCommit).not.toBe(head);
    expect(outcome.changedFiles).toEqual(["src/a.ts"]);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(repo, ["show", "HEAD:src/a.ts"])).toContain("export const a = 1;");
  });

  it("a prose task is structurally impossible: there is no way to ask for an invented Work", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo);
    const service = makeWorkDelegationService({ controller: stack.controller, workerFor: () => committingWorker() });
    // The API accepts no `task` at all — the parameter does not exist. What it DOES refuse is having no
    // canonical work to execute.
    const before = eventCount(stack.connection);
    await expect(service.start()).rejects.toThrow(/WORK_NOT_DECLARED/u);
    expect(eventCount(stack.connection)).toBe(before);
    expect(attemptStates(stack.connection)).toEqual([]);
  });

  it("an expectedTaskId mismatch fails closed BEFORE any job, attempt, world or event", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo);
    await declarePlan(stack.call, head);
    const service = makeWorkDelegationService({ controller: stack.controller, workerFor: () => committingWorker() });

    const before = eventCount(stack.connection);
    // The scheduler's next task is t1 (t2 depends on it). Asking for t2 must not reorder anything.
    await expect(service.start({ expectedTaskId: "t2" })).rejects.toThrow(/TASK_NOT_NEXT_SCHEDULABLE/u);
    expect(eventCount(stack.connection)).toBe(before);
    expect(attemptStates(stack.connection)).toEqual([]);
  });
});

describe("§D2-d equation 1: CanonicalOutcome(sync) == CanonicalOutcome(async)", () => {
  it("the blocking kernel and the async transport produce the SAME canonical execution facts", async () => {
    const syncRun = await (async () => {
      const { repo, head } = workspace();
      const stack = makeStack(repo);
      await declarePlan(stack.call, head);
      const result = await executeMutatingWorkBlocking(
        { controller: stack.controller, workerFor: () => committingWorker("export const a = 7;\n") },
        { expectedTaskId: "t1" },
      );
      return {
        outcome: canonicalOutcome(stack.connection, result.attemptId),
        taskId: result.taskId,
        settlement: result.settlement,
      };
    })();

    const asyncRun = await (async () => {
      const { repo, head } = workspace();
      const stack = makeStack(repo);
      await declarePlan(stack.call, head);
      const service = makeWorkDelegationService({
        controller: stack.controller,
        workerFor: () => committingWorker("export const a = 7;\n"),
      });
      const started = await service.start();
      const view = await waitFor(
        () => service.followup({ jobId: started.jobId }),
        (candidate) => "attemptId" in candidate && candidate.attemptId !== null && (candidate.phase === "FINISHED" || candidate.phase === "HOST_ERROR"),
        "the async job to produce an attempt and settle",
      );
      if (!("attemptId" in view) || view.attemptId === null) throw new Error("the async job produced no attempt");
      return { outcome: canonicalOutcome(stack.connection, view.attemptId), taskId: view.taskId, settlement: view.settlement };
    })();

    /**
     * Same task, same attempt state, same observed file set, same settlement state, and a result commit
     * that is real and not the base — in BOTH paths.
     *
     * The commit HASHES differ, and must: each run materializes its own world and the commit carries its
     * own timestamp. Asserting hash equality would be asserting that two separate executions produced one
     * commit, which is not the claim. The claim is that the CANONICAL FACTS agree — the transport changed,
     * the semantics did not.
     */
    expect(asyncRun.taskId).toBe(syncRun.taskId);
    expect(asyncRun.outcome.state).toBe(syncRun.outcome.state);
    expect(asyncRun.outcome.changedFiles).toEqual(syncRun.outcome.changedFiles);
    expect(asyncRun.outcome.resultCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(syncRun.outcome.resultCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(asyncRun.outcome.resultCommit).not.toBe(syncRun.outcome.resultCommit);
    expect((syncRun.settlement as { state: string }).state).toBe("SETTLED");
    expect((asyncRun.settlement as { state: string }).state).toBe("SETTLED");
  });
});

describe("§D2-d equation 2: a host lifetime failure fabricates no project fact", () => {
  it("a worker that throws leaves the attempt RUNNING with its lane fenced and no ATTEMPT_FAILED", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo);
    await declarePlan(stack.call, head);
    const service = makeWorkDelegationService({
      controller: stack.controller,
      workerFor: () => ({
        adapterId: "exploding-worker",
        async run() {
          throw new Error("the worker host exploded");
        },
      }),
    });

    const started = await service.start();
    // The attempt is created before the worker runs, so it exists even though the worker then explodes.
    await waitFor(() => attemptStates(stack.connection), (states) => states.length === 1, "the attempt to be created");
    const view = await waitFor(
      () => service.followup({ jobId: started.jobId }),
      (candidate) => "phase" in candidate && (candidate.phase === "FINISHED" || candidate.phase === "HOST_ERROR"),
      "the job to reach a terminal host phase",
    );
    if (!("hostError" in view)) throw new Error("expected a job view");
    // The HOST records its own failure…
    expect(view.phase).toBe("HOST_ERROR");
    expect(view.hostError).toContain("exploded");
    // …and the PROJECT is untouched: still RUNNING, lane still held, no terminal event fabricated.
    expect(attemptStates(stack.connection)).toEqual(["RUNNING"]);
    expect(
      (stack.connection.prepare(
        "SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type IN ('ATTEMPT_FAILED','ATTEMPT_COMPLETED')",
      ).get("d2d" as never) as { c: number }).c,
    ).toBe(0);
    /**
     * And the fenced authority is real, in the exact form D2-b defines it: a second delegation does not
     * take a SECOND lane. Because the lane holder is the same task, the second `start` legitimately
     * RESUMES that work position rather than displacing it — and crucially the project still holds
     * exactly ONE attempt, still RUNNING. `canonical exactly-one-owner > host exactly-one-Promise`.
     */
    const second = await service.start();
    expect(second.taskId).toBe(started.taskId);
    expect(second.resumed).toBe(true);
    expect(attemptStates(stack.connection)).toEqual(["RUNNING"]);
    expect(
      (stack.connection.prepare("SELECT COUNT(*) AS c FROM attempts WHERE project_id=?").get("d2d" as never) as { c: number }).c,
    ).toBe(1);
  });

  it("a worker that reports a host failure is NOT_READY, not a failed attempt", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo);
    await declarePlan(stack.call, head);
    const service = makeWorkDelegationService({
      controller: stack.controller,
      workerFor: () => ({ adapterId: "failing-worker", run: async () => ({ kind: "HOST_FAILURE" as const, detail: "process died" }) }),
    });
    const started = await service.start();
    const view = await waitFor(
      () => service.followup({ jobId: started.jobId }),
      (candidate) => "phase" in candidate && (candidate.phase === "FINISHED" || candidate.phase === "HOST_ERROR"),
      "the job to reach a terminal host phase",
    );
    if (!("settlement" in view)) throw new Error("expected a job view");
    expect((view.settlement as { state: string }).state).toBe("NOT_READY");
    expect(attemptStates(stack.connection)).toEqual(["RUNNING"]);
  });
});

describe("§D2-d restart honesty: host jobs are not durable, the project says what is true", () => {
  it("a NEW host knows nothing of an old job, and the canonical attempt is unchanged", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo);
    await declarePlan(stack.call, head);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = makeWorkDelegationService({
      controller: stack.controller,
      workerFor: () => ({ adapterId: "parked-worker", run: async () => { await gate; return { kind: "NEEDS_ESCALATION" as const, detail: "parked" }; } }),
    });
    const started = await first.start();
    const before = await waitFor(
      () => attemptStates(stack.connection),
      (states) => states.length === 1 && states[0] === "RUNNING",
      "the attempt to reach RUNNING before the restart",
    );
    expect(before).toEqual(["RUNNING"]);

    // A RESTART: a brand-new service over the SAME canonical project, with an empty job map.
    const restarted = makeWorkDelegationService({ controller: stack.controller, workerFor: () => committingWorker() });
    const view = await restarted.followup({ jobId: started.jobId });
    expect("phase" in view && view.phase).toBe("UNKNOWN");
    if ("detail" in view) expect(view.detail).toContain("not durable");

    // The canonical truth is unchanged and queryable by the DURABLE identity instead: orphaned execution
    // stays canonically UNRESOLVED — not failed, not auto-resumed.
    expect(attemptStates(stack.connection)).toEqual(before);
    const inspect = await restarted.inspectAttempt({ attemptId: "does-not-exist" });
    expect(inspect.known).toBe(false);
    release();
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Even after the old worker finishes, nothing retroactively changed the canonical state.
    expect(attemptStates(stack.connection)).toEqual(before);
  });

  it("a completed attempt survives the loss of host observability (Project truth outlives the host)", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo);
    await declarePlan(stack.call, head);
    const service = makeWorkDelegationService({ controller: stack.controller, workerFor: () => committingWorker() });
    const started = await service.start();
    const view = await waitFor(
      () => service.followup({ jobId: started.jobId }),
      (candidate) => "attemptId" in candidate && candidate.attemptId !== null && candidate.phase === "FINISHED",
      "the job to settle",
    );
    if (!("attemptId" in view) || view.attemptId === null) throw new Error("no attempt");
    const attemptId = view.attemptId;

    // The host forgets everything (a restart, with settlement already committed).
    const restarted = makeWorkDelegationService({ controller: stack.controller, workerFor: () => committingWorker() });
    expect((await restarted.followup({ jobId: started.jobId })).phase).toBe("UNKNOWN");
    // The project still says COMPLETED, and the result commit is still there.
    const inspect = await restarted.inspectAttempt({ attemptId });
    expect(inspect).toMatchObject({ known: true, state: "COMPLETED", taskId: "t1" });
  });
});

describe("§D2-d followup is read-only", () => {
  it("repeated followup changes nothing at all", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo);
    await declarePlan(stack.call, head);
    const service = makeWorkDelegationService({ controller: stack.controller, workerFor: () => committingWorker() });
    const started = await service.start();
    await waitFor(
      () => service.followup({ jobId: started.jobId }),
      (candidate) => "phase" in candidate && candidate.phase === "FINISHED",
      "the job to settle before the purity check",
    );

    const snapshot = () => ({
      events: eventCount(stack.connection),
      states: attemptStates(stack.connection),
      head: git(repo, ["rev-parse", "HEAD"]),
      tree: git(repo, ["status", "--porcelain"]),
      refs: git(repo, ["for-each-ref", "--format=%(refname)"]),
    });
    const before = snapshot();
    for (let i = 0; i < 5; i += 1) await service.followup({ jobId: started.jobId });
    await service.followup({ jobId: "wdj-nonexistent" });
    expect(snapshot()).toEqual(before);
  });
});

describe("§D2-d the transport cannot write project lifecycle, and cannot verify or promote", () => {
  it("the async layer names no terminal event, no verifier and no promotion authority", () => {
    /**
     * Two structural facts, checked on the transport's own source:
     *
     *   1. it never writes project lifecycle — the only way an attempt completes is `settleMutatingWork`;
     *   2. it never verifies or promotes — those belong to D2-e2's planes, so `start` cannot quietly
     *      become `prepare → run → settle → verify → promote`.
     *
     * If either appeared, the transport would have stopped being transport.
     */
    const source = readFileSync(join(REPO, "src", "interaction", "work_delegation.ts"), "utf8");
    // COMMENTS ARE STRIPPED: the module's own doc comment NAMES the bypasses it refuses, so a raw text
    // search would fail on the explanation rather than on a violation. The check is about code.
    const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//gu, "");
    const text = withoutBlocks.split(String.fromCharCode(10)).map((line) => { const at = line.indexOf("//"); return at < 0 ? line : line.slice(0, at); }).join(String.fromCharCode(10));
    // It calls the blocking orchestration and nothing else that mutates.
    expect(text).toMatch(/settleMutatingWork/u);
    expect(text).toMatch(/prepareMutatingWork/u);
    // No lifecycle event names, and no direct store/ledger access.
    for (const forbidden of [
      "ATTEMPT_COMPLETED",
      "ATTEMPT_FAILED",
      "ATTEMPT_CANCELLED",
      "PROMOTION",
      "promoteAttempt",
      "assessPromotionEligibility",
      "commandAttemptResultVerifier",
      "verifyAttemptResult",
      "recordCallback",
    ]) {
      expect(text, `the transport must not contain "${forbidden}"`).not.toContain(forbidden);
    }
    // And the job map stays THIN: no task definition, authority state, retry count or verification
    // status accumulated in host-local state.
    for (const forbidden of ["retryCount", "authorityState", "verificationStatus", "promotionStatus", "dependencyGraph"]) {
      expect(text, `the job map must not accumulate "${forbidden}"`).not.toContain(forbidden);
    }
  });
});
