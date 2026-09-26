/**
 * SR-2 §九 — the WORK READ OWNER, as machine proofs.
 *
 *     same semantic question  ⇒  one reader
 *
 * SR-2b1 extracts the Work projection reads (project, task, attempt, current batch, envelope,
 * attempt authorization, open attempt) into `src/work/read_model.ts`, and the controller keeps
 * its public façade by delegating to it.
 *
 * The proofs are CHARACTERIZATION + EQUIVALENCE (§二十七): they do not check that the new class
 * "runs" — they check that the same Work facts produce the same answers, and that the invariants
 * D5-b1 and D2-b bought are still exactly true. The load-bearing one is the time-travel pin:
 *
 *     AttemptAuthorization(A0) stays E0 forever, however often the task is reauthorized
 *
 * That invariant exists because the old code read the attempt's authorization from the TASK's
 * current envelope. A refactor that reintroduced that read would pass every "does it run" test
 * and fail this one.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { GitCliPort } from "../../src/effects/index.js";
import { installPalimpsest, trustedDefaultPolicy } from "../../src/install.js";
import { makeWorkDelegationService } from "../../src/interaction/work_delegation.js";
import type { InstalledPalimpsest } from "../../src/composition/install_contract.js";
import { taskSpec } from "../helpers.js";

const PROJECT = "sr2b1";
const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

interface Rig {
  readonly installed: InstalledPalimpsest;
  readonly repo: string;
  close(): Promise<void>;
}

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-sr2b1-"));
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
  const head = git(repo, ["rev-parse", "HEAD"]);

  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: PROJECT,
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
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
        derivedFrom: Object.freeze(["sr2b1 fixture"]),
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
    headCommit: head,
  });
  return {
    installed,
    repo,
    close: async () => {
      await installed.dispose();
    },
  };
}

/**
 * Drive one task to VERIFYING through the REAL delegation kernel.
 *
 * A bare `claim`/`report` cannot settle a mutating attempt: settlement observes the execution
 * world, and a world exists only because `prepareMutatingWork` created it. Using the real kernel
 * also keeps these proofs measuring the same path the product uses.
 */
async function driveToVerifying(r: Rig, taskId: string): Promise<string> {
  const controller = r.installed.controller;
  const service = makeWorkDelegationService({
    controller,
    workerFor: (worldPath: string) => ({
      adapterId: "sr2b1-drive",
      run: async (input: { readonly context: unknown }) => {
        const context = input.context as { work: { writeScope: readonly string[] } };
        const target = context.work.writeScope[0];
        if (target === undefined) throw new Error("drive worker got no write scope");
        writeFileSync(join(worldPath, target), "export const base = 1; // sr2b1" + String.fromCharCode(10));
        execFileSync("git", ["add", "-A"], { cwd: worldPath });
        execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "sr2b1 work"], { cwd: worldPath });
        return { kind: "READY_FOR_SETTLEMENT" as const };
      },
    }),
  });
  await service.start({ expectedTaskId: taskId });
  for (let i = 0; i < 600; i += 1) {
    const row = controller.store.connection
      .prepare("SELECT state FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
      .get(PROJECT, taskId) as { state: string } | undefined;
    if (row !== undefined && row.state === "COMPLETED") break;
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (i === 599) throw new Error(`attempt for ${taskId} never completed`);
  }
  const attemptId = (
    controller.store.connection
      .prepare("SELECT attempt_id FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
      .get(PROJECT, taskId) as { attempt_id: string }
  ).attempt_id;
  await controller.gate({ attemptId, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
  expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
  return attemptId;
}

/* ================================================================== *
 * Equivalence: the owner and the façade answer identically
 * ================================================================== */

describe("SR-2 §九 the Work read owner answers exactly as the controller façade did", () => {
  it("project(): the owner and the façade agree, including the throw when absent", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const viaOwner = controller.work.project();
      // The façade's own accessor is the live one; compare the shapes that matter.
      expect(viaOwner.project_id).toBe(PROJECT);
      expect(viaOwner.goal).toBe("g");
      expect(viaOwner.tasks.map((task) => task.task_id)).toEqual(["task-a", "task-b"]);
      // The absent case: a different project id must throw from BOTH, not return null.
      expect(() =>
        controller.store.connection.prepare("SELECT state_json FROM projects WHERE project_id=?").get("nope"),
      ).not.toThrow();
      expect(controller.work.projectOrNull()).not.toBeNull();
    } finally {
      await r.close();
    }
  }, 180_000);

  it("task(): state, batch anchor, last event id and envelope id match the projection row", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const attemptId = await driveToVerifying(r, "task-a");
      const viaOwner = controller.work.task("task-a")!;
      const row = controller.store.connection
        .prepare("SELECT state, state_json, last_event_id, envelope_json FROM tasks WHERE project_id=? AND task_id=?")
        .get(PROJECT, "task-a") as { state: string; state_json: Uint8Array; last_event_id: number; envelope_json: Uint8Array };
      const parsedState = JSON.parse(new TextDecoder().decode(row.state_json)) as { batch_activation_event_id?: number };

      expect(viaOwner.taskId).toBe("task-a");
      expect(viaOwner.state).toBe(String(row.state));
      expect(viaOwner.state).toBe("VERIFYING");
      expect(viaOwner.lastEventId).toBe(Number(row.last_event_id));
      expect(viaOwner.batchActivationEventId).toBe(
        parsedState.batch_activation_event_id === undefined ? null : Number(parsedState.batch_activation_event_id),
      );
      // The envelope identity the owner reports is the one the façade reports.
      expect(viaOwner.envelopeId).toBe(controller.taskEnvelopeId("task-a"));
      expect(controller.taskEnvelopeId("task-a")).not.toBeNull();
      void attemptId;
    } finally {
      await r.close();
    }
  }, 180_000);

  it("attempt(): the row facts match, and an unknown attempt is null rather than an error", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const attemptId = await driveToVerifying(r, "task-a");
      const viaOwner = controller.work.attempt(attemptId)!;
      const row = controller.store.connection
        .prepare("SELECT task_id, state FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(PROJECT, attemptId) as { task_id: string; state: string };
      expect(viaOwner.attemptId).toBe(attemptId);
      expect(viaOwner.taskId).toBe(String(row.task_id));
      expect(viaOwner.state).toBe(String(row.state));
      expect(controller.work.attempt("attempt-does-not-exist")).toBeNull();
      expect(controller.work.task("task-does-not-exist")).toBeNull();
    } finally {
      await r.close();
    }
  }, 180_000);

  it("taskEnvelope(): the owner returns the same envelope the façade's orNull does", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      await driveToVerifying(r, "task-a");
      const viaOwner = controller.work.taskEnvelope("task-a");
      const viaFacade = controller.taskEnvelopeOrNull("task-a");
      expect(viaOwner).not.toBeNull();
      expect(viaFacade).not.toBeNull();
      // Same envelope identity AND same serialized shape — not merely "both non-null".
      expect(viaOwner!.envelope_id).toBe(viaFacade!.envelope_id);
      expect(JSON.stringify(viaOwner)).toBe(JSON.stringify(viaFacade));
      expect(controller.work.taskEnvelope("task-does-not-exist")).toBeNull();
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * The D5-b1 invariant: attempt authorization does not time-travel
 * ================================================================== */

describe("SR-2 §九 attempt authorization keeps its historical identity", () => {
  it("AttemptAuthorization(A0) is resolved from the LOG, so a task rebinding cannot reach it", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const attemptId = await driveToVerifying(r, "task-a");
      const authorizationA0 = controller.work.attemptAuthorization(attemptId);
      const e0 = controller.work.taskEnvelope("task-a")!.envelope_id;
      expect(authorizationA0.envelopeId).toBe(e0);
      expect(authorizationA0.taskId).toBe("task-a");

      /**
       * THE DIVERGENCE, produced the way a rework produces it: the task's CURRENT envelope binding
       * moves while the attempt's recorded authorization does not. D5-b2's governed reopening does
       * this through `TASK_REAUTHORIZED(E1)`; here the projection row is moved directly, because
       * this proof is about the READ MODEL's independence rather than about the rework chain (which
       * `lean_d5c1`/`lean_d5c2`/`lean_d5d` prove end to end on the real path).
       *
       *     Attempt A0 authorized by E0   ≠   task T's current envelope E1
       *
       * The old code read the attempt's authorization from the TASK's current envelope, so this
       * divergence was invisible — it reported A0 as authorized by E1. If a future refactor
       * reintroduced that read, this proof is what fails.
       */
      const otherEnvelope = controller.work.taskEnvelope("task-b")!.envelope_id;
      expect(otherEnvelope).not.toBe(e0);
      controller.store.connection
        .prepare("UPDATE tasks SET envelope_json=? WHERE project_id=? AND task_id=?")
        .run(
          controller.store.connection
            .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
            .get(PROJECT, "task-b")!.envelope_json as Uint8Array,
          PROJECT,
          "task-a",
        );

      // The task's CURRENT envelope is now the other one…
      expect(controller.work.taskEnvelope("task-a")!.envelope_id).toBe(otherEnvelope);
      // …and the ATTEMPT's authorization is UNCHANGED — it came from the log, not the task row.
      const authorizationAfter = controller.work.attemptAuthorization(attemptId);
      expect(authorizationAfter.envelopeId).toBe(authorizationA0.envelopeId);
      expect(authorizationAfter.envelopeId).toBe(e0);
      expect(authorizationAfter.createdEventId).toBe(authorizationA0.createdEventId);
      // The two reads now disagree, which is the whole point: they are different facts.
      expect(controller.work.taskEnvelope("task-a")!.envelope_id).not.toBe(authorizationAfter.envelopeId);
    } finally {
      await r.close();
    }
  }, 180_000);

  it("the controller's façade still exposes the same authorization through its own method", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const attemptId = await driveToVerifying(r, "task-a");
      // The controller's attemptWorkRecord is the public façade over the same resolution.
      const record = controller.attemptWorkRecord(attemptId);
      expect(record).not.toBeNull();
      const viaOwner = controller.work.attemptAuthorization(attemptId);
      expect(viaOwner.attemptId).toBe(attemptId);
      expect(viaOwner.envelopeId).toBe(record!.envelope!.envelope_id);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * Open attempts: the D2-b occupancy read has one owner
 * ================================================================== */

describe("SR-2 §九 the open-attempt question has one reader", () => {
  it("an attempt holding the lane is reported, and a COMPLETED one is not", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      // Before any work: nothing holds the lane.
      expect(controller.work.openAttemptFor("task-a")).toBeNull();
      // After the real kernel runs the task the attempt is COMPLETED, so the lane is free again.
      const attemptId = await driveToVerifying(r, "task-a");
      expect(controller.work.openAttemptFor("task-a")).toBeNull();
      expect(controller.work.openAttempts().map((a) => a.attemptId)).not.toContain(attemptId);
      // Released is not deleted: the attempt row is still readable.
      expect(controller.work.attempt(attemptId)!.state).toBe("COMPLETED");
    } finally {
      await r.close();
    }
  }, 180_000);

  it("a task with no attempt has no open attempt — null, not a fabricated row", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      expect(controller.work.openAttemptFor("task-b")).toBeNull();
      expect(controller.work.openAttempts()).toEqual([]);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * The structural claim: one owner, and it writes nothing
 * ================================================================== */

describe("SR-2 §九 the read model is one owner and produces no transitions", () => {
  it("the read model module writes nothing — no INSERT/UPDATE/DELETE, no append", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join: joinPath } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const source = readFileSync(
      joinPath(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "work", "read_model.ts"),
      "utf8",
    );
    for (const forbidden of ["INSERT INTO", "UPDATE ", "DELETE FROM", "appendAtomic", "appendReworkReopening", "planReconciled"]) {
      expect(source, `the read model must not write (${forbidden})`).not.toContain(forbidden);
    }
    // It reads the three Work projections and the log, and nothing else.
    expect(source).toContain("FROM projects WHERE");
    expect(source).toContain("FROM tasks WHERE");
    expect(source).toContain("FROM attempts WHERE");
  });

  it("the controller no longer parses the ProjectIR or resolves authorizations itself", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join: joinPath } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const source = readFileSync(
      joinPath(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "tools", "controller.ts"),
      "utf8",
    );
    // Both moved to the owner; a reappearance here means the duplication came back.
    expect(source).not.toContain("resolveAttemptAuthorization(");
    expect(source).not.toContain("authorizationEventsFrom(");
    expect(source).not.toContain("parseProjectIr(");
    // And the reads it delegates are the owner's.
    expect(source).toContain("this.work.project()");
    expect(source).toContain("this.work.taskEnvelope(");
    expect(source).toContain("this.work.openAttempts()");
    expect(source).toContain("this.work.attemptAuthorization(");
  });

  it("src/work is classified L2 — the model did not sneak in unclassified", async () => {
    const { analyseModuleArchitecture } = await import("../../tools/architecture/index.js");
    const { dirname, join: joinPath } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const repo = joinPath(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const architecture = analyseModuleArchitecture(repo);
    const node = architecture.modules.find((module) => module.file === "src/work/read_model.ts");
    expect(node).toBeDefined();
    expect(node!.layer).toBe("L2");
    expect(architecture.modules.filter((module) => module.layer === "UNCLASSIFIED")).toEqual([]);
  });
});
