import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileContextRequirement } from "../src/context/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort, GitCliPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeRig(attemptLimit = 2) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-ctx2-")), "ops.sqlite"),
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
      attempt_limit: attemptLimit,
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

describe("context requirement compiler (PLMP-CTX-2 P1)", () => {
  const input = {
    projectId: "p1",
    taskId: "task-1",
    requiredArtifacts: ["report.md", "report.md", "schema.json"],
    writePaths: ["src/router.ts"],
    upstreamWritePaths: ["src/router_state.ts", "src/router.ts"],
    priorFailureEvidence: ["EVD-9", "EVD-7"],
    staleRefs: ["ARCH-ROUTING@6", "EVD-42"],
  };

  it("CTX2-A01: the five requirement classes derive from their declared sources", () => {
    const requirement = compileContextRequirement(input);
    expect(requirement.exact).toEqual(["report.md", "schema.json"]); // dedup + sorted
    expect(requirement.codePaths).toEqual(["src/router.ts", "src/router_state.ts"]);
    expect(requirement.evidenceSubjects).toEqual(["EVD-7", "EVD-9"]);
    expect(requirement.historical).toEqual([]); // V0 placeholder
    expect(requirement.taskId).toBe("task-1");
  });

  it("CTX2-A02: the forbidden set is the stale set verbatim", () => {
    const requirement = compileContextRequirement(input);
    expect(requirement.forbiddenStale).toEqual(["ARCH-ROUTING@6", "EVD-42"]);
  });

  it("CTX2-A08: the compiler is a pure function of its inputs", () => {
    expect(JSON.stringify(compileContextRequirement(input))).toBe(
      JSON.stringify(compileContextRequirement(input)),
    );
  });
});

describe("lexical worktree scan (PLMP-CTX-2 P2)", () => {
  it("CTX2-A03 (fake): seeded files match terms with deterministic order and cap", async () => {
    const git = new FakeGitPort(HEAD);
    git.seedWorktreeFiles("wt-1", {
      "src/router.ts": "const modulation = 1;\nexport function forward() {}\n",
      "docs/notes.md": "modulation failed before\nunrelated line\nMODULATION again\n",
    });
    const matches = await git.scanLexical({
      worktreeId: "wt-1",
      terms: ["Modulation"],
      maxMatches: 2,
    });
    expect(matches).toHaveLength(2); // capped mid-scan, in path/line order
    expect(matches[0]).toMatchObject({ path: "docs/notes.md", line: 1, term: "modulation" });
    expect(matches[1]).toMatchObject({ path: "docs/notes.md", line: 3 });

    // Without the cap all four hits surface, docs before src (path order).
    const all = await git.scanLexical({ worktreeId: "wt-1", terms: ["modulation"] });
    expect(all.map((match) => `${match.path}:${match.line}`)).toEqual([
      "docs/notes.md:1",
      "docs/notes.md:3",
      "src/router.ts:1",
    ]);

    // Glob filter and empty result set.
    expect(
      await git.scanLexical({ worktreeId: "wt-1", terms: ["modulation"], glob: "src/" }),
    ).toHaveLength(1);
    expect(await git.scanLexical({ worktreeId: "wt-1", terms: ["nonexistent"] })).toEqual([]);
    expect(await git.scanLexical({ worktreeId: "wt-1", terms: [] })).toEqual([]);
  });

  it("CTX2-A03 (cli): the real port scans a real directory tree", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-scan-"));
    const worktreeRoot = join(root, "worktrees");
    const worktree = join(worktreeRoot, "wt-1");
    const nested = join(worktree, "src");
    mkdirSync(nested, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(worktree, "README.md"), "population modulation notes\n");
    writeFileSync(join(nested, "router.py"), "def forward():\n    return MODULATION\n");

    const port = new GitCliPort(root, worktreeRoot);
    const matches = await port.scanLexical({ worktreeId: "wt-1", terms: ["modulation"] });
    expect(matches.map((match) => match.path).sort()).toEqual([
      "README.md",
      "src/router.py",
    ]);
    const nestedMatch = matches.find((match) => match.path === "src/router.py")!;
    expect(nestedMatch.line).toBe(2);
    expect(nestedMatch.term).toBe("modulation");

    // .git directories are skipped.
    mkdirSync(join(worktree, ".git"), { recursive: true });
    const { writeFileSync: wf2 } = await import("node:fs");
    wf2(join(worktree, ".git", "config"), "modulation inside git dir\n");
    const filtered = await port.scanLexical({ worktreeId: "wt-1", terms: ["modulation"] });
    expect(filtered.map((match) => match.path)).not.toContain(".git/config");
  });
});

describe("context manifest canonical flow (PLMP-CTX-2 P3/P4/P5)", () => {
  it("CTX2-A04/A09: the manifest lands on the hash chain and recompiles are idempotent", async () => {
    const { controller, git, store, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      const attemptId = created.entity_id;
      git.seedWorktreeFiles(attemptId, {
        "src/task-1.py": "task: population modulation implementation\n",
      });
      await controller.claim(attemptId);

      const before = eventCount(store);
      const result = await controller.compileTaskContext(attemptId);
      expect(eventCount(store)).toBe(before + 1); // CTX2-A04: one canonical event

      expect(result.manifest.manifest_id).toBeDefined();
      expect(result.manifest.task_id).toBe("task-1");
      expect(result.manifest.exact.map((entry) => entry.ref)).toEqual(["src/task-1.py"]);
      expect(result.manifest.exact[0]!.digest).toHaveLength(64);
      expect(result.manifest.source[0]).toMatchObject({
        path: "src/task-1.py",
        term: "task",
      });
      expect(result.manifest.evidence).toEqual([]);
      expect(result.manifest.excluded_stale).toEqual([]);
      expect(result.manifest.retrieval).toEqual(["lexical"]);

      // The projection is queryable.
      const row = store.connection
        .prepare("SELECT manifest_id, task_id FROM context_manifests WHERE project_id=?")
        .all("scheduler-project") as Array<{ manifest_id: string; task_id: string }>;
      expect(row).toHaveLength(1);
      expect(row[0]!.manifest_id).toBe(result.manifest.manifest_id);

      // CTX2-A09: a recompile returns the same manifest without a new event.
      const again = await controller.compileTaskContext(attemptId);
      expect(again.manifest).toEqual(result.manifest);
      expect(eventCount(store)).toBe(before + 1);
    } finally {
      await cleanup();
    }
  });

  it("CTX2-A05: reports backfill the manifest id; uncompiled attempts stay byte-clean", async () => {
    const { controller, git, store, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.step();
      const first = controller.step()!;
      git.seedWorktreeFiles(first.entity_id, {
        "src/task-1.py": "complete the implementation\n",
      });
      await controller.claim(first.entity_id);
      await controller.compileTaskContext(first.entity_id);
      controller.report(first.entity_id, { workerStatus: "failed", summary: "broke the build" });

      // The batch settles back to READY before the retry attempt is created.
      let second = controller.step()!;
      for (let step = 0; step < 8 && second.event_type !== "ATTEMPT_CREATED"; step += 1) {
        second = controller.step()!;
      }
      expect(second.event_type).toBe("ATTEMPT_CREATED");
      await controller.claim(second.entity_id);
      controller.report(second.entity_id, { workerStatus: "completed", summary: "fixed" });

      const reports = (
        store.connection
          .prepare("SELECT attempt_id, report_json FROM attempts WHERE project_id=? ORDER BY attempt_id")
          .all("scheduler-project") as Array<{ attempt_id: string; report_json: Uint8Array }>
      ).map((row) => {
        const report = JSON.parse(new TextDecoder().decode(row.report_json)) as {
          attempt_id: string;
          context_manifest?: string;
        };
        return report;
      });
      const compiled = reports.find((report) => report.attempt_id === first.entity_id)!;
      expect(typeof compiled.context_manifest).toBe("string");
      const uncompiled = reports.find((report) => report.attempt_id === second.entity_id)!;
      expect("context_manifest" in uncompiled).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("CTX2-A07: a cold worktree recommends exploration; a seeded one reads green", async () => {
    // Cold rig: nothing to retrieve -> code coverage 0 -> explore.
    const coldRig = makeRig();
    try {
      const { controller, git } = coldRig;
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      await controller.claim(created.entity_id);
      const cold = await controller.compileTaskContext(created.entity_id);
      expect(cold.coverage.code).toBe(0);
      expect(cold.coverage.recommendation.additionalExploration).toBe(true);
      expect(cold.coverage.unresolved.some((entry) => entry.startsWith("code:"))).toBe(true);
    } finally {
      await coldRig.cleanup();
    }

    // Seeded rig: the write path is present and lexically hit -> all green.
    const seededRig = makeRig();
    try {
      const { controller, git } = seededRig;
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      git.seedWorktreeFiles(created.entity_id, {
        "src/task-1.py": "task implementation for the objective\n",
      });
      await controller.claim(created.entity_id);
      const covered = await controller.compileTaskContext(created.entity_id);
      expect(covered.coverage.code).toBe(1);
      expect(covered.coverage.recommendation.additionalExploration).toBe(false);
      expect(covered.coverage.unresolved).toEqual([]);
    } finally {
      await seededRig.cleanup();
    }
  });
});
