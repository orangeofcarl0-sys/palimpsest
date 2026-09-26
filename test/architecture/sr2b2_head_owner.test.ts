/**
 * SR-2 §十 — the PROJECT HEAD OWNER, as machine proofs.
 *
 *     READY@E0  →  G10-X  →  READY@E1
 *
 * SR-2b2 moves the head ORCHESTRATION out of `ProjectController` into `src/work/head.ts`, behind
 * the controller's unchanged façade. The head machinery already had a pure kernel and a fact
 * source; what it lacked was an owner.
 *
 * These proofs are EQUIVALENCE (§二十七): the ruling is explicit that this slice must compare
 *     candidate before/after · blocker set · PROJECT_REVISED payload · TASK_REAUTHORIZED payload ·
 *     event order · ProjectIR revision/digest
 * field by field. The end-to-end chain is run on the REAL D5 rework path, because that is the only
 * way the head actually advances in this system (a bare `plan` cannot — quiescence refuses).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { GitCliPort } from "../../src/effects/index.js";
import { installPalimpsest, trustedDefaultPolicy } from "../../src/install.js";
import type { InstalledPalimpsest } from "../../src/composition/install_contract.js";
import { makeWorkDelegationService } from "../../src/interaction/work_delegation.js";
import { taskSpec } from "../helpers.js";

const PROJECT = "sr2b2";
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

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-sr2b2-"));
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
        derivedFrom: Object.freeze(["sr2b2 fixture"]),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({
        allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
      }),
    } as never,
  );
  const { controller, store } = { controller: installed.controller, store: installed.controller.store };
  controller.start({
    projectId: PROJECT,
    goal: "g",
    tasks: [taskSpec("task-a"), taskSpec("task-b"), taskSpec("task-c")],
    stageGraph: {
      stages: [
        { id: "active", state: "ACTIVE", concurrency: 3 },
        { id: "verifying", state: "VERIFYING", concurrency: 3 },
        { id: "blocked", state: "BLOCKED" },
        { id: "ready", state: "READY" },
      ],
      transitions: [
        { from: "active", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" },
        { from: "active", event: "TASK_READY", to: "READY", when: "batch-failed-budget-remaining" },
        { from: "active", event: "TASK_FAILED", to: "FAILED", when: "attempt-limit-exhausted" },
        { from: "verifying", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
        { from: "verifying", event: "TASK_READY", to: "READY", when: "rework-admitted" },
        { from: "blocked", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
        { from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
      ],
      guards: {},
      declared_by: "sr2b2-spec",
      reason: "three tasks reach VERIFYING together so the head can advance",
    },
    headCommit: head0,
  });
  controller.declareRoleTable({ roles: [{ role: "implementer", slots: 3 }], hardCap: 3, declaredBy: "sr2b2-spec" });

  const attempts: Record<string, string> = {};
  const drive = async (taskId: string): Promise<string> => {
    const service = makeWorkDelegationService({
      controller,
      workerFor: (worldPath: string) => ({
        adapterId: "sr2b2-drive",
        run: async (input: { readonly context: unknown }) => {
          const context = input.context as { work: { writeScope: readonly string[] } };
          const target = context.work.writeScope[0];
          if (target === undefined) throw new Error("drive worker got no write scope");
          writeFileSync(join(worldPath, target), `export const base = 1; // ${taskId}\n`);
          execFileSync("git", ["add", "-A"], { cwd: worldPath });
          execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", `work ${taskId}`], {
            cwd: worldPath,
          });
          return { kind: "READY_FOR_SETTLEMENT" as const };
        },
      }),
    });
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
    await controller.gate({ attemptId, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
    expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
    attempts[taskId] = attemptId;
    return attemptId;
  };

  return {
    installed,
    repo,
    attempts,
    close: async () => {
      await installed.dispose();
    },
  };
}

const read = (rel: string): string => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", rel), "utf8");

/* ================================================================== *
 * Equivalence: status / candidate / fence answer identically
 * ================================================================== */

describe("SR-2 §十 the head owner answers exactly as the controller's façade did", () => {
  it("status(): IN_SYNC at genesis, and the façade reads the same state", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const viaOwner = controller.head.status();
      expect(viaOwner.state).toBe("IN_SYNC");
      expect(viaOwner.projectHeadCommit).toBe(viaOwner.provenEffectHeadCommit);
      expect(viaOwner.latestPromotionEventRef).toBeNull();
      expect(viaOwner.projectRevision).toBe(0);
    } finally {
      await r.close();
    }
  }, 240_000);

  it("candidate(): compilable is false with no drift, and reports the blocker by name", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      // One task reaches VERIFYING, so there is no head drift yet.
      await drive(r, "task-a");

      // The candidate is the head owner's, and with no promotion it reports no drift by name.
      const compiled = controller.head.candidate();
      expect(compiled.compilable).toBe(false);
      expect(compiled.blockers.map((blocker) => blocker.kind)).toContain("no_drift");
      // And the status agrees: the basis and the proven effect head are the same.
      expect(controller.head.status().state).toBe("IN_SYNC");
    } finally {
      await r.close();
    }
  }, 240_000);

  it("reconcile(): reports in_sync when nothing has drifted — zero writes", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const before = controller.store.listEvents(PROJECT).length;
      const outcome = await controller.reconcileProjectHead();
      expect(outcome.status).toBe("in_sync");
      expect(outcome.fromHead).toBe(outcome.toHead);
      expect(outcome.blockers).toEqual([]);
      // In-sync is not a write: the log did not move.
      expect(controller.store.listEvents(PROJECT).length).toBe(before);
    } finally {
      await r.close();
    }
  }, 240_000);

  it("targetFence(): reports the SAME picture the status does, and the façade is byte-identical", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const fence = controller.reworkTargetFence();
      const viaOwner = controller.head.targetFence();
      // The façade delegates, so these must be identical field for field.
      expect(JSON.stringify(viaOwner)).toBe(JSON.stringify(fence));
      const status = controller.head.status();
      expect(fence.provenEffectHeadCommit).toBe(status.provenEffectHeadCommit);
      expect(fence.latestPromotionEventRef).toBe(status.latestPromotionEventRef);
      expect(fence.projectHeadCommit).toBe(status.projectHeadCommit);
      const project = controller.work.project();
      expect(fence.projectRevision).toBe(project.revision);
      expect(fence.projectDigest).toBe(project.digest);
    } finally {
      await r.close();
    }
  }, 240_000);
});

/* ================================================================== *
 * The end-to-end head advance: READY@E0 → G10-X → READY@E1
 * ================================================================== */

describe("SR-2 §十 the head advance path is unchanged end to end", () => {
  it("a real drift reconciles, and the ProjectIR revision advances with the SAME payload shape", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const store = controller.store;
      /**
       * ONE task is driven; the others stay READY. That keeps the project QUIESCENT after the
       * promotion, which is what lets the head actually advance.
       *
       * The remaining tasks are deliberately not driven: an attempt authorized at H0 cannot be
       * promoted after the effect head moved (the product refuses with
       * `cross_revision_promotion_not_supported` — correct behaviour), so a multi-task drift would
       * need the governed-rework path to resolve quiescence. That chain is proven end to end by
       * the D5 suites; this proof is about the HEAD OWNER, so it isolates the head question.
       */
      const attemptA = await drive(r, "task-a");
      const resultCommitOf = (attemptId: string) => {
        const event = store
          .listEvents(PROJECT)
          .find((entry) => entry.event_type === "ATTEMPT_COMPLETED" && entry.entity_id === attemptId);
        return (event!.payload as { attempt_report: { result_commit: string } }).attempt_report.result_commit;
      };
      const irOf = () => {
        const row = store.connection.prepare("SELECT state_json FROM projects WHERE project_id=?").get(PROJECT) as {
          state_json: Uint8Array;
        };
        return JSON.parse(new TextDecoder().decode(row.state_json)) as {
          revision: number;
          digest: string;
          head_commit: string;
        };
      };
      await controller.promote(attemptA, resultCommitOf(attemptA), controller.promotionEligibility(attemptA).canonicalExpectedHead!);
      expect(controller.step()!.event_type).toBe("TASK_SATISFIED");

      // THE DRIFT: the effect head is ahead of the ProjectIR basis.
      const status = controller.head.status();
      expect(status.state).toBe("SYNC_REQUIRED");
      expect(status.provenEffectHeadCommit).not.toBe(status.projectHeadCommit);

      const before = irOf();
      const eventsBefore = store.listEvents(PROJECT).length;

      // THE ADVANCE, through the head owner's reconcile.
      const outcome = await controller.reconcileProjectHead();
      expect(outcome.status).toBe("reconciled");
      expect(outcome.fromHead).toBe(before.head_commit);
      expect(outcome.toHead).toBe(status.provenEffectHeadCommit);
      expect(outcome.blockers).toEqual([]);

      const after = irOf();
      expect(after.revision).toBeGreaterThan(before.revision);
      expect(after.head_commit).toBe(status.provenEffectHeadCommit);
      // The advance re-anchored the head and moved nothing else: the goal is untouched.
      expect(controller.work.project().goal).toBe("g");

      // THE PAYLOAD SHAPE: a head-only reconciliation is a PROJECT_REVISED that RETAINS every task
      // (it adds none and retires none), which is exactly what makes it non-meaning-changing.
      const newEvents = store.listEvents(PROJECT).slice(eventsBefore);
      const revised = newEvents.filter((event) => event.event_type === "PROJECT_REVISED");
      expect(revised.length).toBe(1);
      const payload = revised[0]!.payload as { project_ir: { revision: number; head_commit: string; tasks: readonly unknown[] } };
      expect(payload.project_ir.revision).toBe(after.revision);
      expect(payload.project_ir.head_commit).toBe(after.head_commit);
      expect(payload.project_ir.tasks.length).toBe(3);

      // The status is now IN_SYNC, and the fence reports the ADVANCED picture.
      expect(controller.head.status().state).toBe("IN_SYNC");
      const fenceAfter = controller.head.targetFence();
      expect(fenceAfter.projectHeadCommit).toBe(after.head_commit);
      expect(fenceAfter.projectRevision).toBe(after.revision);
      // A second reconcile is a no-op: nothing left to advance.
      const again = await controller.reconcileProjectHead();
      expect(again.status).toBe("in_sync");
    } finally {
      await r.close();
    }
  }, 420_000);

  it("reconcile(): a real quiescence blocker is reported, not forced — zero writes", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const store = controller.store;
      // TWO tasks driven to VERIFYING, so one of them is always blocking quiescence.
      const attemptA = await drive(r, "task-a");
      await drive(r, "task-b");
      const resultCommitOf = (attemptId: string) => {
        const event = store
          .listEvents(PROJECT)
          .find((entry) => entry.event_type === "ATTEMPT_COMPLETED" && entry.entity_id === attemptId);
        return (event!.payload as { attempt_report: { result_commit: string } }).attempt_report.result_commit;
      };
      const irOf = () => {
        const row = store.connection.prepare("SELECT state_json FROM projects WHERE project_id=?").get(PROJECT) as {
          state_json: Uint8Array;
        };
        return JSON.parse(new TextDecoder().decode(row.state_json)) as { revision: number; head_commit: string };
      };
      await controller.promote(attemptA, resultCommitOf(attemptA), controller.promotionEligibility(attemptA).canonicalExpectedHead!);
      controller.step();

      const before = irOf();
      const eventsBefore = store.listEvents(PROJECT).length;
      const outcome = await controller.reconcileProjectHead();
      // The other task is still VERIFYING, so the advance is refused BY NAME with zero writes.
      expect(outcome.status).toBe("blocked");
      expect(outcome.blockers.join(" ")).toContain("quiescence");
      expect(store.listEvents(PROJECT).length).toBe(eventsBefore);
      expect(irOf().revision).toBe(before.revision);
      expect(irOf().head_commit).toBe(before.head_commit);
    } finally {
      await r.close();
    }
  }, 420_000);
});

/** Drive one task to VERIFYING with a real committing worker. */
async function drive(r: Rig, taskId: string): Promise<string> {
  const controller = r.installed.controller;
  const store = controller.store;
  const service = makeWorkDelegationService({
    controller,
    workerFor: (worldPath: string) => ({
      adapterId: "sr2b2-drive",
      run: async (input: { readonly context: unknown }) => {
        const context = input.context as { work: { writeScope: readonly string[] } };
        const target = context.work.writeScope[0];
        if (target === undefined) throw new Error("drive worker got no write scope");
        writeFileSync(join(worldPath, target), `export const base = 1; // ${taskId}${String.fromCharCode(10)}`);
        execFileSync("git", ["add", "-A"], { cwd: worldPath });
        execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", `work ${taskId}`], {
          cwd: worldPath,
        });
        return { kind: "READY_FOR_SETTLEMENT" as const };
      },
    }),
  });
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
  await controller.gate({ attemptId, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
  expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
  r.attempts[taskId] = attemptId;
  return attemptId;
}

/* ================================================================== *
 * Structural: one owner, and it writes no head itself
 * ================================================================== */

describe("SR-2 §十 the head owner is one place and invents no head", () => {
  it("head.ts contains no INSERT/UPDATE/DELETE and never calls git", () => {
    // Comments stripped: this file's own doc comment NAMES `git.head()` to explain that the head
    // derivation never uses it, so a raw text search would match the explanation.
    const blockStripped = read("src/work/head.ts").replace(/\/\*[\s\S]*?\*\//g, " ");
    const source = blockStripped
      .split(String.fromCharCode(10))
      .map((line) => {
        const at = line.indexOf("//");
        return at === -1 ? line : line.slice(0, at);
      })
      .join(String.fromCharCode(10));
    for (const forbidden of ["INSERT INTO", "UPDATE ", "DELETE FROM", "git.head", "execFileSync", "rev-parse"]) {
      expect(source, `the head owner must not write or read git (${forbidden})`).not.toContain(forbidden);
    }
  });

  it("the controller no longer compiles a head candidate or derives a status itself", () => {
    const source = read("src/tools/controller.ts");
    expect(source).not.toContain("compileProjectHeadReconciliation(");
    expect(source).not.toContain("deriveProjectHeadStatus(");
    // It delegates the four head questions to the owner.
    expect(source).toContain("this.head.candidate()");
    expect(source).toContain("this.head.targetFence()");
    expect(source).toContain("this.head.reconcile(");
    expect(source).toContain("this.head.validateHeadAdvance(");
  });

  it("the commit path still runs through the controller's trusted revision entry", () => {
    const source = read("src/tools/controller.ts");
    // The service cannot commit by itself: it is handed this controller's `planReconciled`.
    expect(source).toContain("commitHeadAdvance");
    expect(source).toContain("planReconciled(");
    const head = read("src/work/head.ts");
    // And the owner's own write path is exactly one delegated call.
    expect(head).toContain("deps.commitHeadAdvance(");
  });

  it("head.ts reuses the ONE pure kernel rather than re-deriving the status", () => {
    const head = read("src/work/head.ts");
    expect(head).toContain("deriveProjectHeadStatus");
    expect(head).toContain("compileProjectHeadReconciliation");
  });
});
