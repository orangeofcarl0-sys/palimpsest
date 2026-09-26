/**
 * SR-2 §十一 — the MUTATING ATTEMPT EXECUTION owner, as machine proofs.
 *
 *     prepare → execute → observe → settle
 *
 * SR-2b3 moves D2's two decision ladders (prepare's precondition ladder, settle's observation
 * ladder) out of `ProjectController` into `src/work/attempt_execution.ts`, behind the controller's
 * unchanged façades. The PRIMITIVES stay where they were: claim, report, the execution-world port
 * and the scheduler's admission rule.
 *
 * The ruling is explicit about what this slice must prove (§十一): not "the new class runs" but
 *     same ATTEMPT_* event sequence · same attempt identity · same ExecutionWorld base ·
 *     same observed changed files · same result commit · same report digest · same settlement
 *     state · same exported object
 * and then all three live gates.
 *
 * The proofs run the REAL delegation kernel on a REAL repository, because the D2 decision ladders
 * only mean anything against a real execution world.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { GitCliPort } from "../../src/effects/index.js";
import { installPalimpsest, trustedDefaultPolicy } from "../../src/install.js";
import type { InstalledPalimpsest } from "../../src/composition/install_contract.js";
import { makeWorkDelegationService } from "../../src/interaction/work_delegation.js";
import { taskSpec } from "../helpers.js";

const PROJECT = "sr2b3";
const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

interface Rig {
  readonly installed: InstalledPalimpsest;
  readonly repo: string;
  attempts: Record<string, string>;
  close(): Promise<void>;
}

async function rig(options: { readonly execution?: "worktree" | "in-place" } = {}): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-sr2b3-"));
  cleanups.push(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a handle is open; the OS reaps it.
    }
  });
  const repo = join(dir, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "shared.js"), "export const base = 0;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  const head0 = git(repo, ["rev-parse", "HEAD"]);

  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: PROJECT,
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: options.execution ?? "worktree",
      standard: Object.freeze({
        statement: "tests pass",
        clauses: Object.freeze([
          Object.freeze({
            kind: "command_succeeds" as const,
            command: Object.freeze(["node", "-e", "process.exit(0)"]),
            predicate: "tests_pass" as const,
          }),
          Object.freeze({ kind: "scope_respected" as const }),
        ]),
        derivedFrom: Object.freeze(["sr2b3 fixture"]),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({
        allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
      }),
    } as never,
  );
  installed.controller.start({
    projectId: PROJECT,
    goal: "g",
    tasks: [taskSpec("task-a"), taskSpec("task-b")],
    headCommit: head0,
  });
  return {
    installed,
    repo,
    attempts: {},
    close: async () => {
      await installed.dispose();
    },
  };
}

/** A deterministic worker: same world, same file, same message ⇒ same observable outcome. */
function deterministicWorker(taskId: string) {
  return (worldPath: string) => ({
    adapterId: "sr2b3-deterministic",
    run: async (input: { readonly context: unknown }) => {
      const context = input.context as { work: { writeScope: readonly string[] } };
      const target = context.work.writeScope[0];
      if (target === undefined) throw new Error("worker got no write scope");
      writeFileSync(join(worldPath, target), `export const base = 1; // ${taskId}${String.fromCharCode(10)}`);
      execFileSync("git", ["add", "-A"], { cwd: worldPath });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", `work ${taskId}`], {
        cwd: worldPath,
      });
      return { kind: "READY_FOR_SETTLEMENT" as const };
    },
  });
}

async function drive(r: Rig, taskId: string): Promise<string> {
  const controller = r.installed.controller;
  const store = controller.store;
  const service = makeWorkDelegationService({ controller, workerFor: deterministicWorker(taskId) });
  await service.start({ expectedTaskId: taskId });
  for (let i = 0; i < 600; i += 1) {
    const row = store.connection
      .prepare("SELECT state FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
      .get(PROJECT, taskId) as { state: string } | undefined;
    if (row !== undefined && row.state === "COMPLETED") break;
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (i === 599) throw new Error(`attempt for ${taskId} never completed`);
  }
  const attemptId = (
    store.connection
      .prepare("SELECT attempt_id FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
      .get(PROJECT, taskId) as { attempt_id: string }
  ).attempt_id;
  r.attempts[taskId] = attemptId;
  return attemptId;
}

/* ================================================================== *
 * The prepare ladder: same refusals, same order, same codes
 * ================================================================== */

describe("SR-2 §十一 the prepare ladder is unchanged", () => {
  it("in-place placement is refused by name — P0 runs first, before anything is written", async () => {
    const r = await rig({ execution: "in-place" });
    try {
      const controller = r.installed.controller;
      const eventsBefore = controller.store.listEvents(PROJECT).length;
      // The façade and the owner must refuse IDENTICALLY.
      const viaFacade = await controller
        .prepareMutatingWork({ expectedTaskId: "task-a" })
        .then(() => null)
        .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
      const viaOwner = (() => {
        try {
          controller.attemptExecution.target({ expectedTaskId: "task-a" });
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      })();
      expect(viaFacade).toContain("WORKTREE_PLACEMENT_REQUIRED");
      expect(viaOwner).toBe(viaFacade);
      expect(controller.store.listEvents(PROJECT).length).toBe(eventsBefore);
    } finally {
      await r.close();
    }
  }, 240_000);

  it("target() and prepare() agree about which task and which base", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const target = controller.mutatingWorkTarget({ expectedTaskId: "task-a" });
      expect(target.taskId).toBe("task-a");
      expect(target.resumed).toBe(false);
      // The target's base is the envelope's base — the ONE Work base.
      const envelope = controller.work.taskEnvelope("task-a")!;
      expect(target.baseCommit).toBe(envelope.base_commit);
      // And the owner answers the same as the façade.
      expect(JSON.stringify(controller.attemptExecution.target({ expectedTaskId: "task-a" }))).toBe(
        JSON.stringify(target),
      );
    } finally {
      await r.close();
    }
  }, 240_000);

  it("prepare() produces a position whose world is at the envelope base — the four-way agreement held", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const prepared = await controller.prepareMutatingWork({ expectedTaskId: "task-a" });
      expect(prepared.state).toBe("PREPARED");
      expect(prepared.placement).toBe("worktree");
      expect(prepared.taskId).toBe("task-a");
      // The world exists and is a real git repository at the envelope's base.
      const envelope = controller.work.taskEnvelope("task-a")!;
      expect(prepared.baseCommit).toBe(envelope.base_commit);
      expect(git(prepared.worldPath, ["rev-parse", "HEAD"])).toBe(envelope.base_commit);
      expect(prepared.writeScope).toEqual([...envelope.write_paths]);
      // No worker has run, so the world holds no change.
      expect(git(prepared.worldPath, ["status", "--porcelain"])).toBe("");
      // The attempt exists in the projection and is nonterminal.
      expect(controller.work.attempt(prepared.attemptId)!.state).not.toBe("COMPLETED");
    } finally {
      await r.close();
    }
  }, 240_000);

  it("a SECOND prepare for the same task RESUMES — it does not mint a second position", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const first = await controller.prepareMutatingWork({ expectedTaskId: "task-a" });
      const second = await controller.prepareMutatingWork({ expectedTaskId: "task-a" });
      expect(second.state).toBe("RESUMED");
      expect(second.attemptId).toBe(first.attemptId);
      expect(second.worldPath).toBe(first.worldPath);
      expect(second.detail).toContain("already holds a mutating position");
      // Exactly one attempt row: no second position was created.
      const count = controller.store.connection
        .prepare("SELECT COUNT(*) AS c FROM attempts WHERE project_id=? AND task_id=?")
        .get(PROJECT, "task-a") as { c: number };
      expect(Number(count.c)).toBe(1);
    } finally {
      await r.close();
    }
  }, 240_000);
});

/* ================================================================== *
 * The settle ladder: same observation, same outcomes
 * ================================================================== */

describe("SR-2 §十一 the settle ladder is unchanged", () => {
  it("a worker that did not hand over work keeps everything — NOT_READY, nothing observed", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const prepared = await controller.prepareMutatingWork({ expectedTaskId: "task-a" });
      for (const kind of ["NEEDS_ESCALATION", "HOST_FAILURE"] as const) {
        const outcome = await controller.settleMutatingWork({ attemptId: prepared.attemptId, workerOutcome: { kind } });
        expect(outcome.state).toBe("NOT_READY");
        expect((outcome as { reason: string }).reason).toBe(kind);
        expect((outcome as { detail: string }).detail).toContain("nothing is observed, exported or recorded");
      }
      // The attempt is untouched: still holding its lane.
      expect(controller.work.attempt(prepared.attemptId)!.state).not.toBe("COMPLETED");
    } finally {
      await r.close();
    }
  }, 240_000);

  it("uncommitted work is refused by name — UNCOMMITTED_WORK, with the paths named", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const prepared = await controller.prepareMutatingWork({ expectedTaskId: "task-a" });
      // Dirty the world WITHOUT committing.
      writeFileSync(join(prepared.worldPath, prepared.writeScope[0]!), "export const base = 2;\n");
      const outcome = await controller.settleMutatingWork({
        attemptId: prepared.attemptId,
        workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
      });
      expect(outcome.state).toBe("NOT_READY");
      expect((outcome as { reason: string }).reason).toBe("UNCOMMITTED_WORK");
      expect((outcome as { detail: string }).detail).toContain("not committed");
      // Nothing was recorded.
      expect(controller.work.attempt(prepared.attemptId)!.state).not.toBe("COMPLETED");
    } finally {
      await r.close();
    }
  }, 240_000);

  it("no change against the base is refused by name — NO_WORK", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const prepared = await controller.prepareMutatingWork({ expectedTaskId: "task-a" });
      // The world is clean at its base: nothing to settle.
      const outcome = await controller.settleMutatingWork({
        attemptId: prepared.attemptId,
        workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
      });
      expect(outcome.state).toBe("NOT_READY");
      expect((outcome as { reason: string }).reason).toBe("NO_WORK");
    } finally {
      await r.close();
    }
  }, 240_000);

  it("out-of-scope work is refused by name, and the offending paths are listed", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const prepared = await controller.prepareMutatingWork({ expectedTaskId: "task-a" });
      // A path OUTSIDE the envelope's write scope, committed.
      writeFileSync(join(prepared.worldPath, "OUT_OF_SCOPE.txt"), "noise\n");
      execFileSync("git", ["add", "-A"], { cwd: prepared.worldPath });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "out of scope"], {
        cwd: prepared.worldPath,
      });
      const outcome = await controller.settleMutatingWork({
        attemptId: prepared.attemptId,
        workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
      });
      expect(outcome.state).toBe("NOT_READY");
      expect((outcome as { reason: string }).reason).toBe("OUT_OF_SCOPE");
      expect((outcome as { detail: string }).detail).toContain("OUT_OF_SCOPE.txt");
    } finally {
      await r.close();
    }
  }, 240_000);
});

/* ================================================================== *
 * The whole kernel: identity, result, report — field by field
 * ================================================================== */

describe("SR-2 §十一 the end-to-end kernel produces the same facts", () => {
  it("a real worker's run yields the same attempt identity, result commit, changed files and settlement", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const store = controller.store;

      // Capture the ATTEMPT_* event sequence the kernel produces.
      const eventsBefore = store.listEvents(PROJECT).map((event) => String(event.event_id));
      const attemptId = await drive(r, "task-a");

      const newEvents = store.listEvents(PROJECT).filter((event) => !eventsBefore.includes(String(event.event_id)));
      const attemptEvents = newEvents.filter((event) => event.entity_type === "attempt" || event.entity_id === attemptId);

      // IDENTITY: the attempt the kernel produced is addressable and COMPLETED.
      const row = controller.work.attempt(attemptId)!;
      expect(row.attemptId).toBe(attemptId);
      expect(row.taskId).toBe("task-a");
      expect(row.state).toBe("COMPLETED");

      // THE RESULT: the report names a commit that is resolvable in the canonical object database.
      const record = controller.attemptWorkRecord(attemptId)!;
      const report = record.report as { result_commit: string; changed_files: readonly string[] } | null;
      expect(report).not.toBeNull();
      const resultCommit = report!.result_commit;
      expect(resultCommit).toMatch(/^[0-9a-f]{40}$/u);
      // EXPORT BEFORE REPORT held: the named commit resolves in the canonical repository.
      expect(() => git(r.repo, ["cat-file", "-e", `${resultCommit}^{commit}`])).not.toThrow();

      // THE OBSERVED FILES: the envelope's write scope, as observed (never as claimed).
      const envelope = controller.work.taskEnvelope("task-a")!;
      expect([...report!.changed_files].sort()).toEqual([...envelope.write_paths].sort());

      // THE EVENT SEQUENCE: the D2 lifecycle events are exactly the expected ones, in order.
      const lifecycle = newEvents
        .filter((event) =>
          ["TASK_STARTED", "ATTEMPT_CREATED", "ATTEMPT_LEASED", "ATTEMPT_STARTED", "ATTEMPT_COMPLETED"].includes(event.event_type),
        )
        .map((event) => event.event_type);
      /**
       * The EXACT sequence this deployment's kernel produces, in order. Measured rather than
       * assumed: `claim` records the attempt's execution as ATTEMPT_STARTED and no separate
       * ATTEMPT_LEASED lands on this path, so the sequence has four events. The proof pins what
       * IS, because its job is to detect a CHANGE.
       */
      expect(lifecycle).toEqual(["TASK_STARTED", "ATTEMPT_CREATED", "ATTEMPT_STARTED", "ATTEMPT_COMPLETED"]);
      expect(attemptEvents.length).toBeGreaterThan(0);

      // THE CANONICAL TREE DID NOT MOVE: a worktree attempt commits in its world, not in canonical.
      const head = git(r.repo, ["rev-parse", "HEAD"]);
      const project = controller.work.project();
      expect(head).toBe(project.head_commit);
    } finally {
      await r.close();
    }
  }, 300_000);

  it("the settlement state is SETTLED with the observed commit and files", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const prepared = await controller.prepareMutatingWork({ expectedTaskId: "task-a" });
      // A deterministic worker's work, applied directly so the settlement is the only variable.
      writeFileSync(join(prepared.worldPath, prepared.writeScope[0]!), "export const base = 1;\n");
      execFileSync("git", ["add", "-A"], { cwd: prepared.worldPath });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "work task-a"], {
        cwd: prepared.worldPath,
      });
      const worldHead = git(prepared.worldPath, ["rev-parse", "HEAD"]);

      const outcome = await controller.settleMutatingWork({
        attemptId: prepared.attemptId,
        workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
      });
      expect(outcome.state).toBe("SETTLED");
      const settled = outcome as { resultCommit: string; changedFiles: readonly string[]; exported: boolean };
      // The result commit IS the world's HEAD — observed, not claimed.
      expect(settled.resultCommit).toBe(worldHead);
      expect([...settled.changedFiles]).toEqual([prepared.writeScope[0]!]);
      // The attempt is COMPLETED with exactly that commit.
      const report = controller.attemptWorkRecord(prepared.attemptId)!.report as { result_commit: string };
      expect(report.result_commit).toBe(worldHead);
    } finally {
      await r.close();
    }
  }, 300_000);
});

/* ================================================================== *
 * Structural: the owner holds the ladders, the controller the primitives
 * ================================================================== */

describe("SR-2 §十一 the boundary is where it was drawn", () => {
  it("the owner composes primitives and never runs a worker", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join: joinPath } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const raw = readFileSync(
      joinPath(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "work", "attempt_execution.ts"),
      "utf8",
    );
    // Comments stripped: the doc comment NAMES `worker.run()` to say the transport stays in D2-d.
    const source = raw
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split(String.fromCharCode(10))
      .map((line) => {
        const at = line.indexOf("//");
        return at === -1 ? line : line.slice(0, at);
      })
      .join(String.fromCharCode(10));
    // No transport, no job lifecycle, no scheduling: those belong to D2-d and the scheduler.
    for (const forbidden of ["worker.run", "jobId", "spawn", "execFileSync", "scheduler.decide"]) {
      expect(source, `the execution owner must not own ${forbidden}`).not.toContain(forbidden);
    }
    // It does NOT write events either: the primitives do.
    for (const forbidden of ["appendAtomic", "parseNewEvent", "normalizeEventPayload", "INSERT INTO"]) {
      expect(source, `the execution owner must not write the log (${forbidden})`).not.toContain(forbidden);
    }
  });

  it("the controller keeps the primitives and delegates the decisions", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join: joinPath } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const source = readFileSync(
      joinPath(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "tools", "controller.ts"),
      "utf8",
    );
    // The façades delegate.
    expect(source).toContain("return this.attemptExecution.target(input)");
    expect(source).toContain("return this.attemptExecution.prepare(input)");
    expect(source).toContain("return this.attemptExecution.settle(input)");
    // The primitives are still here — they are the controller's.
    for (const primitive of ["#advanceToClaimableAttempt", "#observeAttemptResultSync", "#speculativeAdmission", "#preparedProjection"]) {
      expect(source, `the controller must keep ${primitive}`).toContain(primitive);
    }
    // And the D2 ladder text is GONE from the controller: no leftover duplicate.
    expect(source).not.toContain("WORKTREE_PLACEMENT_REQUIRED: a mutating delegation");
    expect(source).not.toContain("BASE_DRIFT: this result was computed at");
  });

  it("src/work stays classified L2 and the module is not unclassified", async () => {
    const { analyseModuleArchitecture } = await import("../../tools/architecture/index.js");
    const { dirname, join: joinPath } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const repo = joinPath(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const architecture = analyseModuleArchitecture(repo);
    const node = architecture.modules.find((module) => module.file === "src/work/attempt_execution.ts");
    expect(node).toBeDefined();
    expect(node!.layer).toBe("L2");
    expect(architecture.modules.filter((module) => module.layer === "UNCLASSIFIED")).toEqual([]);
  });
});
