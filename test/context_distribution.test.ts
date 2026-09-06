import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildContextManifest,
  compileContextRequirement,
  contextHandle,
  DEFAULT_BOOT_BUDGET_BYTES,
  distributeContext,
} from "../src/context/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore, snapshotDigest } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function manifestFixture() {
  const requirement = compileContextRequirement({
    projectId: "p1",
    taskId: "task-1",
    requiredArtifacts: ["report.md"],
    writePaths: ["src/task-1.py"],
    upstreamWritePaths: [],
    priorFailureEvidence: ["EVD-9"],
    staleRefs: ["EVD-STALE", "stale-attempt-1"],
  });
  return buildContextManifest({
    manifestId: "mf-1",
    taskId: "task-1",
    projectRevision: 3,
    requirement,
    source: [
      { path: "src/task-1.py", line: 1, snippet: "x".repeat(200), term: "task" },
      { path: "docs/notes.md", line: 2, snippet: "y".repeat(50), term: "task" },
    ],
    createdAt: "2026-08-13T00:00:00Z",
  });
}

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-ctx4-")), "ops.sqlite"),
    git,
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: "scheduler-project",
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
    clock: () => "2026-08-13T00:00:00Z",
  });
  return {
    store,
    controller,
    git,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

function eventCount(store: EventStore): number {
  return (
    store.connection.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number }
  ).c;
}

describe("context distribution (PLMP-CTX-4)", () => {
  it("CTX4-A01: the split is deterministic and exact references always boot", () => {
    const manifest = manifestFixture();
    const first = distributeContext(manifest);
    const second = distributeContext(manifest);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    // Exact references are the contracts the attempt must honour: even with
    // a zero budget they stay in boot (their bytes count, but never overflow).
    const zeroBudget = distributeContext(manifest, { bootBudgetBytes: 0 });
    expect(zeroBudget.boot.map((entry) => entry.kind)).toEqual(["exact"]);
    expect(zeroBudget.handles.map((entry) => entry.kind)).not.toContain("exact");
  });

  it("CTX4-A02: entries inside the budget boot; overflow becomes pull handles", () => {
    const manifest = manifestFixture();
    // exact (ref+digest) + evidence id + first source (snippet+path) fit; the
    // second source tips over.
    const exactBytes = 9 + 64; // "report.md" + 64-char digest
    const evidenceBytes = Buffer.byteLength("EVD-9");
    const firstSourceBytes = 200 + Buffer.byteLength("src/task-1.py");
    const { boot, handles } = distributeContext(manifest, {
      bootBudgetBytes: exactBytes + evidenceBytes + firstSourceBytes,
    });
    expect(boot.map((entry) => entry.handle)).toEqual([
      "@ctx/exact/report.md",
      "@ctx/source/src/task-1.py",
      "@ctx/evidence/EVD-9",
    ]);
    expect(handles).toEqual([{ handle: "@ctx/source/docs/notes.md", kind: "source", ref: "docs/notes.md" }]);

    // The default budget is 40960 bytes; a snippet larger than it can never
    // boot and lands in handles unchanged.
    expect(DEFAULT_BOOT_BUDGET_BYTES).toBe(40_960);
    const bloated = buildContextManifest({
      manifestId: "mf-big",
      taskId: "task-1",
      projectRevision: 3,
      requirement: compileContextRequirement({
        projectId: "p1",
        taskId: "task-1",
        requiredArtifacts: ["report.md"],
        writePaths: ["src/task-1.py"],
        upstreamWritePaths: [],
        priorFailureEvidence: [],
        staleRefs: [],
      }),
      source: [
        { path: "src/big.py", line: 1, snippet: "z".repeat(50_000), term: "task" },
      ],
      createdAt: "2026-08-13T00:00:00Z",
    });
    const defaultSplit = distributeContext(bloated);
    expect(defaultSplit.boot.map((entry) => entry.ref)).toEqual(["report.md"]);
    expect(defaultSplit.handles.map((entry) => entry.ref)).toEqual(["src/big.py"]);
  });

  it("CTX4-A03: the three handle kinds are syntactically fixed and excluded_stale never distributes", () => {
    const manifest = manifestFixture();
    const { boot, handles } = distributeContext(manifest);
    const byKind = (kind: string) => [...boot, ...handles].filter((entry) => entry.kind === kind);
    expect(byKind("exact").map((entry) => entry.handle)).toEqual([
      contextHandle("exact", "report.md"),
    ]);
    expect(byKind("source").map((entry) => entry.handle)).toEqual([
      contextHandle("source", "src/task-1.py"),
      contextHandle("source", "docs/notes.md"),
    ]);
    expect(byKind("evidence").map((entry) => entry.handle)).toEqual([
      contextHandle("evidence", "EVD-9"),
    ]);

    // The stale set is deliberately excluded: no boot or handle entry may
    // carry a ref from manifest.excluded_stale.
    const refs = [...boot, ...handles].map((entry) => entry.ref);
    for (const stale of manifest.excluded_stale) {
      expect(refs).not.toContain(stale);
    }
  });

  it("CTX4-A04: fetchContext resolves source/exact/evidence bodies; unknown handles stay undefined", async () => {
    const { controller, git, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.step();
      const first = controller.step()!;
      await controller.claim(first.entity_id);
      // A failed attempt with active gate evidence feeds the next compile's
      // evidence subjects.
      const gateEvent = await controller.gate({
        attemptId: first.entity_id,
        predicate: "tests_fail",
        command: ["python", "-m", "pytest"],
        exitCode: 1,
      });
      const evidenceId = gateEvent.entity_id;
      controller.report(first.entity_id, { workerStatus: "failed", summary: "broke" });

      let second = controller.step()!;
      for (let step = 0; step < 8 && second.event_type !== "ATTEMPT_CREATED"; step += 1) {
        second = controller.step()!;
      }
      expect(second.event_type).toBe("ATTEMPT_CREATED");
      const attemptId = second.entity_id;
      await controller.claim(attemptId);
      git.seedWorktreeFiles(attemptId, {
        "src/task-1.py": "task implementation for the objective\n",
      });

      const compiled = await controller.compileTaskContext(attemptId);
      expect(compiled.manifest.evidence).toEqual([evidenceId]);

      const exact = await controller.fetchContext(attemptId, "@ctx/exact/src/task-1.py");
      expect(exact).toMatchObject({ kind: "exact", ref: "src/task-1.py" });
      expect((exact!.body as { digest: string }).digest).toHaveLength(64);

      const source = await controller.fetchContext(attemptId, "@ctx/source/src/task-1.py");
      expect(source).toEqual({
        kind: "source",
        ref: "src/task-1.py",
        body: compiled.manifest.source[0],
      });

      const evidence = await controller.fetchContext(attemptId, `@ctx/evidence/${evidenceId}`);
      expect(evidence).toMatchObject({ kind: "evidence", ref: evidenceId });
      expect((evidence!.body as { evidence_id: string }).evidence_id).toBe(evidenceId);

      expect(await controller.fetchContext(attemptId, "@ctx/source/absent.py")).toBeUndefined();
      expect(await controller.fetchContext(attemptId, "@ctx/unknown/ref")).toBeUndefined();
      expect(await controller.fetchContext("attempt-does-not-exist", "@ctx/exact/src/task-1.py")).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("CTX4-A05: distribution and fetch are read-only over the frozen contract", async () => {
    const { controller, git, store, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      const attemptId = created.entity_id;
      git.seedWorktreeFiles(attemptId, {
        "src/task-1.py": "task implementation for the objective\n",
      });
      await controller.claim(attemptId);

      const result = await controller.compileTaskContext(attemptId);
      // The compile surface stays manifest + coverage; distribution is the
      // CTX-4 addition and nothing else moved.
      expect(Object.keys(result)).toEqual(["manifest", "coverage", "distribution"]);
      expect(Object.keys(result.manifest).sort()).toEqual(
        [
          "manifest_id",
          "task_id",
          "project_revision",
          "requirement",
          "exact",
          "source",
          "evidence",
          "excluded_stale",
          "retrieval",
          "created_at",
        ].sort(),
      );

      const eventsBefore = eventCount(store);
      const digestBefore = snapshotDigest(store.connection);
      const first = distributeContext(result.manifest);
      const second = distributeContext(result.manifest);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      for (const entry of [...first.boot, ...first.handles]) {
        await controller.fetchContext(attemptId, entry.handle);
      }
      await controller.fetchContext(attemptId, "@ctx/source/nowhere.py");
      expect(eventCount(store)).toBe(eventsBefore);
      expect(snapshotDigest(store.connection)).toBe(digestBefore);
    } finally {
      await cleanup();
    }
  });
});
