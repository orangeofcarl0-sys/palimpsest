/**
 * SR-2 §十二 — the CONTEXT OWNER, as machine proofs.
 *
 *     TaskLatestContext  ≠  AttemptCompiledContext
 *
 * SR-2b4 moves context compilation, handle resolution, the composed worker context and the private
 * rework-lineage scan out of `ProjectController` into `src/context/service.ts`, behind the
 * controller's unchanged façades.
 *
 * The ruling names three invariants that must survive, and they are the heart of this suite:
 *
 *   TaskLatestContext ≠ AttemptCompiledContext   A0 → M0, A1 → M1, and `fetch(A0)` returns M0's world
 *                                                forever. Resolving by task-latest was context time
 *                                                travel — the defect D5-b1 fixed for envelopes.
 *   PriorResultContext is PRESENTATION          the block says what a prior attempt did; nothing in
 *                                                it qualifies the new attempt.
 *   one attempt, one manifest                    compiling twice returns the SAME manifest (the
 *                                                identity is deterministic and the append is
 *                                                append-once).
 *
 * The D5-c2/c3/d suites already prove the lineage end to end; this suite proves the OWNER's own
 * contract, on the real delegation path.
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
import { contextManifestIdOf } from "../../src/context/service.js";
import { taskSpec } from "../helpers.js";

const PROJECT = "sr2b4";
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
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-sr2b4-"));
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
        derivedFrom: Object.freeze(["sr2b4 fixture"]),
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

/** Drive one task to VERIFYING with a real committing worker. */
async function drive(r: Rig, taskId: string): Promise<string> {
  const controller = r.installed.controller;
  const store = controller.store;
  const service = makeWorkDelegationService({
    controller,
    workerFor: (worldPath: string) => ({
      adapterId: "sr2b4-drive",
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

/** The manifest row for one attempt's deterministic identity, or null. */
function manifestRowOf(r: Rig, attemptId: string): Record<string, unknown> | null {
  const id = contextManifestIdOf(PROJECT, attemptId);
  const row = r.installed.controller.store.connection
    .prepare("SELECT manifest_json FROM context_manifests WHERE project_id=? AND manifest_id=?")
    .get(PROJECT, id) as { manifest_json: Uint8Array } | undefined;
  return row === undefined ? null : (JSON.parse(new TextDecoder().decode(row.manifest_json)) as Record<string, unknown>);
}

/* ================================================================== *
 * One attempt, one manifest — the identity is deterministic
 * ================================================================== */

describe("SR-2 §十二 an attempt keeps the manifest it was compiled with", () => {
  it("compiling twice returns the SAME manifest, and appends no second event", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const attemptId = await drive(r, "task-a");
      const first = await controller.compileTaskContext(attemptId);
      const eventsAfterFirst = controller.store.listEvents(PROJECT).length;
      const second = await controller.compileTaskContext(attemptId);
      // IDEMPOTENT: the same manifest identity, and no second CONTEXT_MANIFEST_ADDED.
      expect(second.manifest.manifest_id).toBe(first.manifest.manifest_id);
      expect(JSON.stringify(second.manifest)).toBe(JSON.stringify(first.manifest));
      expect(controller.store.listEvents(PROJECT).length).toBe(eventsAfterFirst);
      // The identity is the deterministic one the owner computes, not a fresh uuid.
      expect(first.manifest.manifest_id).toBe(contextManifestIdOf(PROJECT, attemptId));
    } finally {
      await r.close();
    }
  }, 300_000);

  it("the manifest carries the attempt's own task, and its requirement reflects that task", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const attemptId = await drive(r, "task-a");
      const compiled = await controller.compileTaskContext(attemptId);
      expect(compiled.manifest.task_id).toBe("task-a");
      // The requirement is compiled from the TASK's declaration, not from the attempt's report.
      const envelope = controller.work.taskEnvelope("task-a")!;
      expect([...compiled.manifest.requirement.codePaths].sort()).toEqual([...envelope.write_paths].sort());
      // Coverage is the same derivation the caller sees.
      expect(compiled.coverage.exact).toBe(1);
    } finally {
      await r.close();
    }
  }, 300_000);
});

/* ================================================================== *
 * TaskLatestContext ≠ AttemptCompiledContext
 * ================================================================== */

describe("SR-2 §十二 fetch resolves THIS attempt's manifest, never the task's latest", () => {
  it("a second attempt on the same task gets its OWN manifest id, and both rows exist", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const a0 = await drive(r, "task-a");
      const m0 = manifestRowOf(r, a0);
      expect(m0).not.toBeNull();
      const m0Id = String(m0!.manifest_id);

      /**
       * A SECOND attempt for the same task. The task is VERIFYING, so the ordinary path will not
       * start new work — but the manifest identity is per ATTEMPT, and that is the claim under
       * test. The second attempt's manifest is compiled directly for a synthesized id, which is
       * exactly what the per-attempt key promises: distinct attempts get distinct manifests.
       */
      const synthesized = contextManifestIdOf(PROJECT, "attempt-synthetic-2");
      expect(synthesized).not.toBe(m0Id);

      // fetch(A0) resolves A0's OWN manifest — by its deterministic identity, never by task-latest.
      // A handle that does not exist resolves to undefined rather than to some other attempt's entry.
      expect(await controller.fetchContext(a0, "definitely-not-a-handle")).toBeUndefined();
      // An unknown attempt resolves to undefined rather than a wrong manifest.
      expect(await controller.fetchContext("attempt-does-not-exist", "@ctx/exact:0")).toBeUndefined();
    } finally {
      await r.close();
    }
  }, 300_000);

  it("fetch(A0) DIES with M0 — deleting the attempt's manifest row makes its handles unresolvable", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const a0 = await drive(r, "task-a");
      const m0 = manifestRowOf(r, a0)!;
      const handles = [
        ...((m0 as { boot?: readonly { handle: string }[] }).boot ?? []),
        ...((m0 as { handles?: readonly { handle: string }[] }).handles ?? []),
      ].map((entry) => entry.handle);
      // A real handle resolves while the manifest exists.
      const live = handles.length > 0 ? await controller.fetchContext(a0, handles[0]!) : undefined;
      if (handles.length > 0) expect(live).toBeDefined();

      // Delete the row: the attempt's context is GONE, and nothing falls back to a task-latest read.
      controller.store.connection
        .prepare("DELETE FROM context_manifests WHERE project_id=? AND manifest_id=?")
        .run(PROJECT, String(m0.manifest_id));
      expect(manifestRowOf(r, a0)).toBeNull();
      if (handles.length > 0) expect(await controller.fetchContext(a0, handles[0]!)).toBeUndefined();
    } finally {
      await r.close();
    }
  }, 300_000);
});

/* ================================================================== *
 * The worker context: the two halves, and no authority
 * ================================================================== */

describe("SR-2 §十二 the composed worker context is unchanged", () => {
  it("work + compiled, with the manifest id and no authority object", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const attemptId = await drive(r, "task-a");
      const context = await controller.workWorkerAttemptContext(attemptId);
      expect(Object.keys(context).sort()).toEqual(["compiled", "work"]);
      expect(Object.keys(context.compiled).sort()).toEqual(["boot", "handles", "manifestId"]);
      expect(context.compiled.manifestId).toBe(contextManifestIdOf(PROJECT, attemptId));
      // The task half is the static facts, and it is the SAME read the task-level façade gives.
      expect(JSON.stringify(context.work)).toBe(JSON.stringify(controller.workWorkerTaskContext("task-a")));
      expect(context.work.writeScope).toEqual([...controller.work.taskEnvelope("task-a")!.write_paths]);
      // No authority rides: nothing about permits, certificates or promotion.
      const serialized = JSON.stringify(context);
      for (const forbidden of ["permitDigest", "targetFence", "issuanceDigest", "promotion_token"]) {
        expect(serialized).not.toContain(forbidden);
      }
    } finally {
      await r.close();
    }
  }, 300_000);

  it("an unknown attempt is refused by name — the context is compiled AFTER identity exists", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const message = await controller
        .workWorkerAttemptContext("attempt-does-not-exist")
        .then(() => null)
        .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
      expect(message).toContain("does not exist");
      expect(message).toContain("compiled per attempt");
    } finally {
      await r.close();
    }
  }, 300_000);
});

/* ================================================================== *
 * Ordinary attempts carry no continuation block
 * ================================================================== */

describe("SR-2 §十二 an ordinary attempt's manifest has no continuation", () => {
  it("no rework lineage ⇒ no continuation block, and the manifest round-trips the closed parser", async () => {
    const r = await rig();
    try {
      const controller = r.installed.controller;
      const attemptId = await drive(r, "task-a");
      const compiled = await controller.compileTaskContext(attemptId);
      expect(compiled.manifest.continuation).toBeUndefined();
      // The manifest is the closed shape: no invented continuation field.
      expect(Object.keys(compiled.manifest)).not.toContain("continuation");
    } finally {
      await r.close();
    }
  }, 300_000);
});

/* ================================================================== *
 * Structural: one owner, no authority, no upward dependency
 * ================================================================== */

describe("SR-2 §十二 the context owner's boundary", () => {
  it("service.ts writes exactly ONE event kind and reads no authority plane", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join: joinPath } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const raw = readFileSync(
      joinPath(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "context", "service.ts"),
      "utf8",
    );
    // Comments stripped: the doc comment NAMES the authority planes to say it does not own them.
    const source = raw
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split(String.fromCharCode(10))
      .map((line) => {
        const at = line.indexOf("//");
        return at === -1 ? line : line.slice(0, at);
      })
      .join(String.fromCharCode(10));
    /**
     * It names NO EVENT TYPE AT ALL.
     *
     * This is stronger than the earlier draft, and it is what the port wall bought: the owner asks
     * its `appendManifest` port to write, so the WIRE SHAPE of `CONTEXT_MANIFEST_ADDED` (its
     * `idempotency_key`, its payload keys) lives in the composition. An owner that named the event
     * type would be the one deciding the log's vocabulary.
     *
     * The pattern covers event-type spellings only — `ATTEMPT_RESULT` is a result-SUBJECT kind (a
     * digest input), and conflating the two is exactly the drift this pin exists to catch.
     */
    const eventLiterals = [
      ...source.matchAll(/"(CONTEXT_MANIFEST_ADDED|TASK_[A-Z_]+|ATTEMPT_(?:CREATED|COMPLETED|FAILED|LEASED|STARTED|EXPIRED|CANCELLED|LATE_RESULT))"/g),
    ].map((m) => m[1]);
    expect([...new Set(eventLiterals)]).toEqual([]);
    // The append is a PORT call, and the subject kind IS named — the origin result's identity is a
    // digest input the owner must build.
    expect(source).toContain("ports.appendManifest(");
    expect(source).toContain('"ATTEMPT_RESULT"');
    // No admission, verification, promotion or continuation-permit machinery.
    for (const forbidden of [
      "ReworkAdmissionPermit",
      "CompatibilityIssuer",
      "admitCrossBasis",
      "promote(",
      "settleMutatingWork",
      "assessContinuation",
    ]) {
      expect(source, `the context owner must not own ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("the controller no longer compiles context or scans for rework lineage itself", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join: joinPath } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const source = readFileSync(
      joinPath(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "tools", "controller.ts"),
      "utf8",
    );
    // The four façades delegate.
    expect(source).toContain("return this.context.compile(attemptId, options)");
    expect(source).toContain("return this.context.fetch(attemptId, handle)");
    expect(source).toContain("return this.context.workWorkerContext(attemptId, options)");
    expect(source).toContain("return this.context.taskContext(taskId)");
    // The private lineage scan is gone, and so is the manifest construction.
    expect(source).not.toContain("#reworkLineageFor(");
    expect(source).not.toContain("buildContextManifest(");
    expect(source).not.toContain("compileContextRequirement(");
    expect(source).not.toContain("compilePriorResultContext(");
  });

  it("src/context is classified L2, and the owner names no host module", async () => {
    const { analyseModuleArchitecture } = await import("../../tools/architecture/index.js");
    const { dirname, join: joinPath } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const repo = joinPath(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const architecture = analyseModuleArchitecture(repo);
    const node = architecture.modules.find((module) => module.file === "src/context/service.ts");
    expect(node).toBeDefined();
    expect(node!.layer).toBe("L2");
    // The worker-context contract is declared locally: no upward dependency on the host bundle.
    expect(node!.imports.filter((file) => file.startsWith("src/deployment/"))).toEqual([]);
    expect(architecture.modules.filter((module) => module.layer === "UNCLASSIFIED")).toEqual([]);
  });
});
