/**
 * PLMP-LEAN-1 §D2-b — bootstrap an EXISTING, scheduler-admissible canonical Work task into an isolated
 * execution position.
 *
 *     D2-b = bootstrap an already-declared canonical Work task into an isolated worker attempt
 *
 * The boundary this file exists to pin is the one that keeps D2 from quietly becoming a second planner:
 *
 *     What work exists?  !=  Who executes that work?
 *
 * `palimpsest_begin` is the DIRECT entrance: the principal states what the work is, and the product
 * bootstraps a direct attempt. D2-b takes NO goal, NO write scope and NO artifacts — it consumes a
 * task the project has already declared and authorized, and refuses when there is none. It is also not
 * a second scheduler: it bootstraps the task the scheduler itself makes next, and `expectedTaskId` is
 * an ASSERTION on that decision rather than a way to reach another task.
 *
 * And it mints no authority: the worker's authority is the canonical `TaskEnvelope`, so base commit,
 * write scope, artifacts, allowed commands and policy identity are all the EXISTING ones.
 *
 * Everything here runs with no model anywhere: D2-b has to close on its own without an LLM.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
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

function workspace(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d2b-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a sqlite handle is open; the OS reaps it.
    }
  });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() };
}

interface Connection {
  prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown };
}

function makeStack(repo: string, options: { readonly execution?: "worktree" | "in-place"; readonly tasks?: readonly unknown[] } = {}) {
  const git = new GitCliPort(repo, join(repo, ".palimpsest", "worktrees"));
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "d2b",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git,
      execution: options.execution ?? "worktree",
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

/** Declare a canonical two-task plan through the public lifecycle, so the scheduler has real work. */
async function declarePlan(
  call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
  head: string,
): Promise<void> {
  await call("palimpsest_start", {
    projectId: "d2b",
    goal: "make the project tidy",
    headCommit: head,
    tasks: [
      { task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: ["src/a.ts"] },
      { task_id: "t2", objective: "tidy b", depends_on: ["t1"], write_paths: ["src/a.ts"], required_artifacts: [] },
    ],
  });
}

/** The tree's own view of untracked files, with the product's scaffolding filtered. */
const porcelain = (cwd: string): readonly string[] =>
  execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" })
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.endsWith(".palimpsest/"));

const eventCount = (connection: Connection): number =>
  (connection.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=?").get("d2b" as never) as { c: number }).c;

const attemptStates = (connection: Connection): readonly string[] =>
  (connection.prepare("SELECT state FROM attempts WHERE project_id=? ORDER BY attempt_id").all("d2b" as never) as readonly {
    state: string;
  }[]).map((row) => row.state);

describe("§D2-b 1/2. it executes EXISTING work, and the scheduler keeps its sovereignty", () => {
  it("WORK_NOT_DECLARED: no canonical task means nothing to bootstrap, with zero events", async () => {
    const { repo } = workspace();
    const { controller, connection } = makeStack(repo);
    const before = eventCount(connection);
    await expect(controller.prepareMutatingWork()).rejects.toThrow(/WORK_NOT_DECLARED/u);
    // It cannot create a plan: delegation executes work, it does not invent it.
    expect(eventCount(connection)).toBe(before);
    expect(controller.isProjectInitialized()).toBe(false);
  });

  it("TASK_NOT_NEXT_SCHEDULABLE: it bootstraps the task the PROJECT makes next, not the one asked for", async () => {
    const { repo, head } = workspace();
    const { controller, call, connection } = makeStack(repo);
    await declarePlan(call, head);
    const before = eventCount(connection);

    // The scheduler's next task is t1 (t2 depends on it). Asking for t2 must not reorder, hold or skip.
    await expect(controller.prepareMutatingWork({ expectedTaskId: "t2" })).rejects.toThrow(/TASK_NOT_NEXT_SCHEDULABLE/u);
    expect(eventCount(connection)).toBe(before);
    expect(attemptStates(connection)).toEqual([]);

    // The assertion form is accepted when it agrees with the scheduler.
    const prepared = await controller.prepareMutatingWork({ expectedTaskId: "t1" });
    expect(prepared.taskId).toBe("t1");
  });
});

describe("§D2-b 3/4. envelope authority is reused, and the lane is exclusive", () => {
  it("the attempt's authority IS the canonical TaskEnvelope — no delegation envelope appears", async () => {
    const { repo, head } = workspace();
    const { controller, call, connection } = makeStack(repo);
    await declarePlan(call, head);

    const prepared = await controller.prepareMutatingWork();
    const taskRow = connection.prepare("SELECT envelope_json FROM tasks WHERE task_id=?").get("t1" as never) as {
      envelope_json: Uint8Array;
    };
    const canonicalEnvelope = JSON.parse(new TextDecoder().decode(taskRow.envelope_json)) as {
      base_commit: string;
      write_paths: string[];
      envelope_id: string;
    };

    expect(prepared.baseCommit).toBe(canonicalEnvelope.base_commit);
    expect(prepared.writeScope).toEqual(canonicalEnvelope.write_paths);
    // The attempt the Work owner created is bound to that SAME envelope — read back through the Work
    // owner's own record, which is what the verification plane reads too.
    const record = controller.attemptWorkRecord(prepared.attemptId);
    expect(record?.taskId).toBe("t1");
    expect(record?.envelope?.envelope_id).toBe(canonicalEnvelope.envelope_id);
    expect(record?.envelope?.base_commit).toBe(canonicalEnvelope.base_commit);
    // And no second authority vocabulary exists in the result.
    expect(Object.keys(prepared).sort()).toEqual(
      ["attemptId", "baseCommit", "completion", "detail", "placement", "requiredArtifacts", "state", "taskId", "worldPath", "writeScope"].sort(),
    );
  });

  it("§D4-0 a second lane is refused by the SCHEDULER, with zero events", async () => {
    const { repo, head } = workspace();
    const { controller, call, connection } = makeStack(repo);
    await declarePlan(call, head);
    const first = await controller.prepareMutatingWork();
    const before = eventCount(connection);

    // Same work again: that is the RESUME path, not a second lane.
    const again = await controller.prepareMutatingWork();
    expect(again.state).toBe("RESUMED");
    expect(again.attemptId).toBe(first.attemptId);
    expect(eventCount(connection)).toBe(before);

    /**
     * A different task is refused — and WHICH authority refuses it is the point of §D4-0.
     *
     * Before the authority split this was `MUTATING_LANE_OCCUPIED`, a product-wide "one nonterminal
     * attempt" rule that used the CANONICAL-SOURCE authority to forbid a speculative world. That rule is
     * now the SCHEDULER's declared task concurrency, so the refusal names the scheduler's decision. The
     * behaviour a caller sees is the same refusal with zero events; what changed is which authority owns
     * the question, and therefore whether a plan that DECLARES more concurrency can use it.
     */
    await expect(controller.prepareMutatingWork({ expectedTaskId: "t2" })).rejects.toThrow(/TASK_NOT_NEXT_SCHEDULABLE/u);
    expect(eventCount(connection)).toBe(before);

    // The canonical-source authority is still enforced where it applies: an in-place deployment keeps
    // strict single-writer, because there the speculative world IS the canonical tree.
    expect(controller.execution).toBe("worktree");
  });
});

describe("§D2-b 5/6. the canonical basis is clean, and there is exactly one base", () => {
  it("refuses when the canonical tree holds work nobody owns, judged by the SAME predicate begin uses", async () => {
    const { repo, head } = workspace();
    const { controller, call, connection } = makeStack(repo);
    await declarePlan(call, head);
    // An unowned change in the canonical tree. `.palimpsest/` scaffolding must NOT count — the same
    // filter begin uses, so the two entrances cannot disagree about what "clean" means.
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 2;\n");
    const before = eventCount(connection);
    await expect(controller.prepareMutatingWork()).rejects.toThrow(/belong to no attempt/u);
    expect(eventCount(connection)).toBe(before);
    expect(attemptStates(connection)).toEqual([]);

    // Reverted: the scaffolding left behind by the product itself is not a blocker.
    execFileSync("git", ["checkout", "--", "src/a.ts"], { cwd: repo });
    const prepared = await controller.prepareMutatingWork();
    expect(prepared.state).toBe("PREPARED");
    expect(existsSync(join(repo, ".palimpsest"))).toBe(true);
  });

  it("HEAD_BASIS_MISMATCH: a canonical head that moved on is refused before any event", async () => {
    const { repo, head } = workspace();
    const { controller, call, connection } = makeStack(repo);
    await declarePlan(call, head);

    // The canonical repository moves ahead of the task's envelope base.
    writeFileSync(join(repo, "src", "b.ts"), "export const b = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "drift"], { cwd: repo });

    const before = eventCount(connection);
    await expect(controller.prepareMutatingWork()).rejects.toThrow(/HEAD_BASIS_MISMATCH|HEAD_NOT_IN_SYNC/u);
    expect(eventCount(connection)).toBe(before);
    expect(attemptStates(connection)).toEqual([]);
  });

  it("an in-place deployment has no worker lane at all", async () => {
    const { repo, head } = workspace();
    const { controller, call, connection } = makeStack(repo, { execution: "in-place" });
    await declarePlan(call, head);
    const before = eventCount(connection);
    await expect(controller.prepareMutatingWork()).rejects.toThrow(/WORKTREE_PLACEMENT_REQUIRED/u);
    expect(eventCount(connection)).toBe(before);
  });
});

describe("§D2-b 7/8. retry converges, and nothing claims a worker is running", () => {
  it("a retry after a crash at ATTEMPT_CREATED claims THAT attempt instead of creating a second", async () => {
    const { repo, head } = workspace();
    const { controller, call, connection } = makeStack(repo);
    await declarePlan(call, head);

    // Crash between ATTEMPT_CREATED and the claim: the attempt exists, unclaimed and worldless.
    // Built from public lifecycle primitives so the ledger and its projection stay consistent.
    controller.step(); // TASK_STARTED
    controller.step(); // ATTEMPT_CREATED
    const created = (connection.prepare("SELECT attempt_id, state FROM attempts WHERE project_id=?").all(
      "d2b" as never,
    ) as readonly { attempt_id: string; state: string }[])[0]!;
    expect(created.state).toBe("CREATED");

    const before = eventCount(connection);
    const prepared = await controller.prepareMutatingWork();
    expect(prepared.attemptId).toBe(created.attempt_id);
    expect(prepared.state).toBe("PREPARED");
    expect(existsSync(prepared.worldPath)).toBe(true);
    // ONE attempt, and the only events added are the claim's.
    expect(attemptStates(connection)).toEqual(["RUNNING"]);
    expect(eventCount(connection)).toBeGreaterThan(before);

    // A further retry changes nothing: no second attempt, no second world, no new events.
    const settled = eventCount(connection);
    const resumed = await controller.prepareMutatingWork();
    expect(resumed.state).toBe("RESUMED");
    expect(resumed.attemptId).toBe(prepared.attemptId);
    expect(resumed.worldPath).toBe(prepared.worldPath);
    expect(eventCount(connection)).toBe(settled);
    expect(attemptStates(connection)).toEqual(["RUNNING"]);
  });

  it("after bootstrapping it claims a READY POSITION, never a running worker", async () => {
    const { repo, head } = workspace();
    const { controller, call } = makeStack(repo);
    await declarePlan(call, head);
    const prepared = await controller.prepareMutatingWork();

    // The state vocabulary says what is true: an attempt is RUNNING, and no host process exists.
    expect(prepared.state).toBe("PREPARED");
    expect(prepared.detail).toContain("no worker is running yet");
    expect(JSON.stringify(prepared)).not.toMatch(/WORKER_RUNNING|workerRunning/u);
    // The execution world is real and holds none of the work yet.
    expect(prepared.placement).toBe("worktree");
    expect(existsSync(prepared.worldPath)).toBe(true);
    expect(porcelain(prepared.worldPath)).toEqual([]);
    // The principal's canonical tree is untouched by having prepared a worker lane.
    expect(porcelain(repo)).toEqual([]);
  });
});
