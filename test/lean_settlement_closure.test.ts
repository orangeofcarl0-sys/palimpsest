/**
 * PLMP-LEAN-1 §D2-e1 — SETTLEMENT CLOSURE: how a worker's testimony becomes canonical Work.
 *
 *     READY_FOR_SETTLEMENT → observe → basis admission → export → report → ATTEMPT_COMPLETED
 *
 * Four rules shape that order, and each one exists because the other order is a hole:
 *
 *   `WorkerOutcome != AttemptReport`
 *     The worker never writes the ledger. Everything the attempt records comes from the observation.
 *
 *   `basis first`
 *     Admitting the base AFTER exporting would leave a world exported and reported against a head the
 *     project no longer has.
 *
 *   `export before report`
 *     The report names `result_commit = R`. If a world were released before R was resolvable in the
 *     canonical object database, the ledger would name a commit nobody can materialize.
 *
 *   `BASE_DRIFT destroys nothing`
 *     The result stays in its world for D3, and the attempt keeps its lane: someone else's head move
 *     must not release mutation authority as a side effect.
 *
 * The crash windows between export and report are proven here too, because a new backend means new
 * windows: R-only-in-world, R-exported-not-reported, and reported-then-retried.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { gitRepositoryWorldPort } from "../src/deployment/execution_world.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const PASSING = ["node", "-e", "process.exit(0)"];

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "tests_pass" as const }),
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
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d2e1-"));
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
      projectId: "d2e1",
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

async function declareAndPrepare(
  call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
  controller: { prepareMutatingWork: (input?: { expectedTaskId?: string }) => Promise<{ taskId: string; attemptId: string; worldPath: string; baseCommit: string }> },
  head: string,
) {
  await call("palimpsest_start", {
    projectId: "d2e1",
    goal: "make the project tidy",
    headCommit: head,
    tasks: [
      { task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
    ],
  });
  return await controller.prepareMutatingWork();
}

/** The worker's own commit inside its world, made the way a real worker makes one. */
function workerCommits(worldPath: string, contents: string, message = "worker commit"): string {
  writeFileSync(join(worldPath, "src", "a.ts"), contents);
  execFileSync("git", ["add", "-A"], { cwd: worldPath });
  execFileSync("git", ["commit", "-qm", message], { cwd: worldPath });
  return git(worldPath, ["rev-parse", "HEAD"]);
}

const attemptState = (connection: Connection): string =>
  (connection.prepare("SELECT state FROM attempts WHERE project_id=?").get("d2e1" as never) as { state: string }).state;

const recordedResultCommit = (connection: Connection): string | null => {
  const row = connection.prepare("SELECT report_json FROM attempts WHERE project_id=?").get("d2e1" as never) as {
    report_json: Uint8Array | null;
  };
  if (row.report_json === null) return null;
  return (JSON.parse(new TextDecoder().decode(row.report_json)) as { result_commit: string | null }).result_commit;
};

describe("§D2-e1 the closure: observation, not the worker's word", () => {
  it("settles a worker's committed result into COMPLETED, and the report names a commit the project can materialize", async () => {
    const { repo, head } = workspace();
    const { controller, connection, call } = makeStack(repo);
    const prepared = await declareAndPrepare(call, controller, head);
    const result = workerCommits(prepared.worldPath, "export const a = 2;\n");

    const settled = await controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    });
    expect(settled.state, JSON.stringify(settled)).toBe("SETTLED");
    if (settled.state !== "SETTLED") return;
    expect(settled.resultCommit).toBe(result);
    expect(settled.changedFiles).toEqual(["src/a.ts"]);
    expect(settled.exported).toBe(true);
    expect(attemptState(connection)).toBe("COMPLETED");
    // The recorded result is the OBSERVED commit, and the canonical object database can resolve it —
    // which is what makes releasing a world safe later.
    expect(recordedResultCommit(connection)).toBe(result);
    expect(git(repo, ["cat-file", "-e", `${result}^{commit}`])).toBe("");
    // …and the project itself has still not accepted anything.
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(repo, ["show", "HEAD:src/a.ts"])).toContain("export const a = 1;");
  });

  it("refuses an uncommitted world, keeping the attempt RUNNING and the work exactly where it is", async () => {
    const { repo, head } = workspace();
    const { controller, connection, call } = makeStack(repo);
    const prepared = await declareAndPrepare(call, controller, head);
    writeFileSync(join(prepared.worldPath, "src", "a.ts"), "export const a = 3;\n");

    const settled = await controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    });
    expect(settled.state).toBe("NOT_READY");
    if (settled.state !== "NOT_READY") return;
    expect(settled.reason).toBe("UNCOMMITTED_WORK");
    expect(attemptState(connection)).toBe("RUNNING");
    expect(existsSync(join(prepared.worldPath, "src", "a.ts"))).toBe(true);
  });

  it("an empty world is NOT_READY: a worker that changed nothing cannot settle a task", async () => {
    const { repo, head } = workspace();
    const { controller, connection, call } = makeStack(repo);
    const prepared = await declareAndPrepare(call, controller, head);
    const settled = await controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    });
    expect(settled.state).toBe("NOT_READY");
    if (settled.state !== "NOT_READY") return;
    expect(settled.reason).toBe("NO_WORK");
    expect(attemptState(connection)).toBe("RUNNING");
  });

  it("a worker that escalates or fails settles nothing: the world and the attempt are untouched", async () => {
    const { repo, head } = workspace();
    const { controller, connection, call } = makeStack(repo);
    const prepared = await declareAndPrepare(call, controller, head);
    workerCommits(prepared.worldPath, "export const a = 4;\n");

    for (const kind of ["NEEDS_ESCALATION", "HOST_FAILURE"] as const) {
      const settled = await controller.settleMutatingWork({ attemptId: prepared.attemptId, workerOutcome: { kind } });
      expect(settled.state).toBe("NOT_READY");
      if (settled.state !== "NOT_READY") continue;
      expect(settled.reason).toBe(kind);
    }
    // Even though the world holds a perfectly good commit, nothing was observed, exported or recorded.
    expect(attemptState(connection)).toBe("RUNNING");
    expect(recordedResultCommit(connection)).toBeNull();
  });
});

describe("§D2-e1 BASE_DRIFT destroys nothing and terminalises nothing", () => {
  it("refuses settlement when the project head moved, retaining the result and the lane", async () => {
    const { repo, head } = workspace();
    const { controller, connection, call } = makeStack(repo);
    const prepared = await declareAndPrepare(call, controller, head);
    const result = workerCommits(prepared.worldPath, "export const a = 5;\n");

    // Someone else moves the canonical project while the worker was working.
    writeFileSync(join(repo, "src", "b.ts"), "export const b = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "unrelated"], { cwd: repo });

    const settled = await controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    });
    expect(settled.state).toBe("BASE_DRIFT");
    if (settled.state !== "BASE_DRIFT") return;
    expect(settled.resultCommit).toBe(result);
    expect(settled.worldRetained).toBe(true);
    expect(settled.detail).toContain("retained");
    // NOTHING was exported, recorded or terminalised: the result is real and still in its world, and the
    // attempt still holds the mutating lane. A violation of the base must not release mutation authority.
    expect(recordedResultCommit(connection)).toBeNull();
    expect(attemptState(connection)).toBe("RUNNING");
    expect(existsSync(prepared.worldPath)).toBe(true);
    expect(git(prepared.worldPath, ["rev-parse", "HEAD"])).toBe(result);
    // It is genuinely not in the canonical object database: no export happened.
    expect(() => git(repo, ["cat-file", "-e", `${result}^{commit}`])).toThrow();
  });

  it("a settlement retried after the head returns to the basis still works (nothing was lost)", async () => {
    const { repo, head } = workspace();
    const { controller, connection, call } = makeStack(repo);
    const prepared = await declareAndPrepare(call, controller, head);
    const result = workerCommits(prepared.worldPath, "export const a = 6;\n");

    writeFileSync(join(repo, "src", "b.ts"), "export const b = 2;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "unrelated"], { cwd: repo });
    const drifted = await controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    });
    expect(drifted.state).toBe("BASE_DRIFT");

    // The drift is undone by its owner (not by this layer), and the SAME world settles cleanly: the
    // result survived the refusal, which is why nothing was deleted.
    execFileSync("git", ["reset", "--hard", head], { cwd: repo });
    const settled = await controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    });
    expect(settled.state, JSON.stringify(settled)).toBe("SETTLED");
    if (settled.state !== "SETTLED") return;
    expect(settled.resultCommit).toBe(result);
    expect(attemptState(connection)).toBe("COMPLETED");
  });
});

describe("§D2-e1 the export/report crash windows", () => {
  it("Crash A — R exists only in the world: a restart retries the same settlement", async () => {
    const { repo, head } = workspace();
    const { controller, connection, call } = makeStack(repo);
    const prepared = await declareAndPrepare(call, controller, head);
    const result = workerCommits(prepared.worldPath, "export const a = 7;\n");

    // Simulate "the process died before settlement ran": nothing exported, nothing recorded.
    expect(recordedResultCommit(connection)).toBeNull();
    expect(() => git(repo, ["cat-file", "-e", `${result}^{commit}`])).toThrow();

    const settled = await controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    });
    expect(settled.state).toBe("SETTLED");
    expect(recordedResultCommit(connection)).toBe(result);
  });

  it("Crash B — R exported but not reported: a second export is harmless and nothing duplicates", async () => {
    const { repo, head } = workspace();
    const { controller, connection, call } = makeStack(repo);
    const prepared = await declareAndPrepare(call, controller, head);
    const result = workerCommits(prepared.worldPath, "export const a = 8;\n");

    // The export happened; the report did not (the crash window this slice names).
    const port = gitRepositoryWorldPort({ repository: repo, worldsRoot: join(repo, ".palimpsest", "worlds") });
    const first = await port.exportResultCommit({ attemptId: prepared.attemptId, commit: result });
    expect(first.imported, first.detail).toBe(true);
    expect(recordedResultCommit(connection)).toBeNull();

    // Retrying is idempotent: export is object availability, so a second import is a no-op that leaves
    // the same world, the same commit and no duplicate facts behind.
    const settled = await controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    });
    expect(settled.state).toBe("SETTLED");
    if (settled.state !== "SETTLED") return;
    expect(settled.exported).toBe(true);
    expect(recordedResultCommit(connection)).toBe(result);
    expect(attemptState(connection)).toBe("COMPLETED");
    expect(
      (connection.prepare("SELECT COUNT(*) AS c FROM attempts WHERE project_id=?").get("d2e1" as never) as { c: number }).c,
    ).toBe(1);
  });

  it("Crash C — a retried settlement is recognisably a REPLAY, not a second attempt at settling", async () => {
    const { repo, head } = workspace();
    const { controller, connection, call } = makeStack(repo);
    const prepared = await declareAndPrepare(call, controller, head);
    const result = workerCommits(prepared.worldPath, "export const a = 9;" + String.fromCharCode(10));

    const first = await controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    });
    expect(first.state).toBe("SETTLED");
    const attemptsAfterFirst = (connection.prepare("SELECT COUNT(*) AS c FROM attempts WHERE project_id=?").get("d2e1" as never) as {
      c: number;
    }).c;
    const completedEvents = (connection.prepare(
      "SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type='ATTEMPT_COMPLETED'",
    ).get("d2e1" as never) as { c: number }).c;

    /**
     * A retry after the crash window must be a REPLAY, not a second settlement and not a duplicate fact.
     *
     * It is allowed to reach the same observation and the same (now idempotent) export — that is why the
     * retry is safe — but the ledger must not grow: the scheduler identifies the callback by
     * `(attempt, terminal event type, report digest)` and returns the committed event when that identity
     * already exists. So the honest assertions are about identity and counts, not about which layer
     * refuses.
     */
    const retried = await controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    });
    expect(retried.state).toBe("SETTLED");
    if (retried.state !== "SETTLED" || first.state !== "SETTLED") return;
    expect(retried.resultCommit).toBe(first.resultCommit);
    expect(retried.resultCommit).toBe(result);
    expect(
      (connection.prepare("SELECT COUNT(*) AS c FROM attempts WHERE project_id=?").get("d2e1" as never) as { c: number }).c,
    ).toBe(attemptsAfterFirst);
    expect(
      (connection.prepare(
        "SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type='ATTEMPT_COMPLETED'",
      ).get("d2e1" as never) as { c: number }).c,
    ).toBe(completedEvents);
    expect(attemptState(connection)).toBe("COMPLETED");
    expect(recordedResultCommit(connection)).toBe(result);
  });
});
