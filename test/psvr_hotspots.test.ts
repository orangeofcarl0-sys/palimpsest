/**
 * PSVR-0.3 — the four multi-task hotspots named before the PSVR project scenarios.
 *
 * Each test states the risk as a claim about the PRODUCT, not about a helper:
 *
 *   A. task-specific readiness   a second task's readiness must not borrow the first RUNNING
 *                                attempt's completion contract (verification required/satisfiable);
 *   B. partly unreadable inputs  an OBSERVED repository with an unreadable dirty path is not
 *                                "nothing changed", and must not block unrelated work either;
 *   C. finalize terminal race    `NO_RUNNING_ATTEMPT` is not "already settled" unless a COMPLETED
 *                                result commit actually exists;
 *   D. WORKTREE input path       a bounded, repository-contained read (size, traversal, symlink).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";
import { makeWorkOutcomeSurface } from "../src/application/work_outcome.js";
import { assessCanonicalInputs, readProjectInput } from "../src/work/unseen_inputs.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope and leave the required artifact",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PSVR hotspot fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(name: string): { root: string; repo: string; stateDir: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-psvr-${name}-`));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "deliverables"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# PSVR base\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* Windows may still hold a SQLite handle; the OS reaps the temp tree */
    }
  });
  return {
    root,
    repo,
    stateDir: join(root, "state"),
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim(),
  };
}

function install(repo: string, stateDir: string) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    { projectId: "psvr", repository: repo, stateDir, execution: "worktree", standard, toolProfile: "expert" },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

async function call(installed: ReturnType<typeof install>, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const definition = installed.tools.find((entry) => entry.name === name) as DshToolDefinition | undefined;
  if (definition === undefined) throw new Error(`missing tool ${name}`);
  const context: DshToolRunContext = {
    callId: `c-${name}-${String(args.taskId ?? "")}`,
    rootCallId: `r-${name}`,
    arguments: args,
    name,
    signal: new AbortController().signal,
  };
  return (await definition.execute(args, context)) as Record<string, unknown>;
}

function commit(workDir: string, path: string, content: string): string {
  const target = join(workDir, ...path.split("/"));
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, content);
  execFileSync("git", ["add", "-A"], { cwd: workDir });
  execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=worker", "commit", "-qm", `candidate ${path}`], { cwd: workDir });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workDir }).toString().trim();
}

type Readiness = {
  action: "CONTINUE_WORK" | "SEMANTIC_JUDGEMENT" | "MECHANICAL_FINALIZATION";
  reasons: string[];
  observationDigest: string;
  attempt: { attemptId: string; state: string; resultCommit: string | null } | null;
  inputs: { state: string; paths: string[]; unreadable: string[]; relevance: string };
  completion: { verificationRequired: boolean; verificationSatisfiable: boolean; blockers: string[] };
};

describe("PSVR-0 A — readiness is derived from the requested task's own attempt contract", () => {
  /**
   * The scheduler admits one RUNNING attempt per project, so two concurrent RUNNING attempts are not
   * reachable through the ordinary product, and a no-verifier deployment refuses a boundary task at
   * start. The reachable form of the coupling is a task whose attempt is COMPLETED: the project-wide
   * readiness saw no RUNNING attempt and dropped the task layer entirely (readinessState null, no
   * blockers), so the settled task's own verification requirement disappeared from the report. The
   * report must come from THAT attempt's contract.
   */
  it("reports the settled task's own task layer instead of a project-wide default", async () => {
    const { repo, stateDir, head } = workspace("readiness");
    const installed = install(repo, stateDir);
    await call(installed, "palimpsest_start", {
      projectId: "psvr",
      goal: "a boundary task and a plain task",
      headCommit: head,
      tasks: [
        { task_id: "a-proto", objective: "change the wire contract", depends_on: [], write_paths: ["proto"], required_artifacts: ["proto/service.proto"] },
        { task_id: "z-docs", objective: "write the note", depends_on: [], write_paths: ["docs"], required_artifacts: ["docs/note.md"] },
      ],
    });
    await call(installed, "palimpsest_next", {});
    const created = (await call(installed, "palimpsest_next", {})) as { eventType?: string; entityId?: string };
    expect(created.eventType).toBe("ATTEMPT_CREATED");
    const attemptId = String(created.entityId);
    await call(installed, "palimpsest_claim", { attemptId });
    const world = installed.controller.observeAttemptResult(attemptId)!;
    commit(world.workDir, "proto/service.proto", "syntax = \"proto3\";\n");
    const settled = (await call(installed, "palimpsest_work", { action: "complete", taskId: "a-proto", summary: "the wire contract" })) as { state?: string };
    expect(settled.state).toBe("SETTLED");
    const own = installed.controller.completionContract(attemptId);
    const readiness = (await call(installed, "palimpsest_work", { action: "readiness", taskId: "a-proto" })) as unknown as Readiness;
    expect(readiness.completion.verificationRequired).toBe(own?.verification.required);
    expect(readiness.completion.verificationRequired).toBe(true);
    // The task layer exists because the attempt was named: not the project-wide "no attempt" answer.
    expect((readiness.completion as { readinessState?: string | null }).readinessState).toBe("READY");
    expect((readiness.completion as { readinessState?: string | null }).readinessState).not.toBeNull();
    // The settled task is waiting for an operator, not for more mechanical work.
    expect(readiness.action).toBe("SEMANTIC_JUDGEMENT");
  });
});

describe("PSVR-0 B — a partly unreadable observation is neither absence nor a blanket stop", () => {
  it("starts work when the unreadable path is outside every write scope", () => {
    const { repo, head } = workspace("scope");
    mkdirSync(join(repo, "notes"), { recursive: true });
    writeFileSync(join(repo, "notes", "huge.bin"), "x".repeat(600 * 1024));
    const verdict = assessCanonicalInputs({ repository: repo, headCommit: head, unownedPaths: ["notes/huge.bin"], writeScopes: ["deliverables"] });
    expect(verdict.state).toBe("COVERED");
  });

  it("keeps a dirty path inside a write scope blocking, readable or not", () => {
    const { repo, head } = workspace("scope-in");
    mkdirSync(join(repo, "deliverables"), { recursive: true });
    writeFileSync(join(repo, "deliverables", "draft.md"), "unowned draft\n");
    const verdict = assessCanonicalInputs({ repository: repo, headCommit: head, unownedPaths: ["deliverables/draft.md"], writeScopes: ["deliverables"] });
    expect(verdict.state).toBe("BLOCKED");
    expect(verdict.stillUnowned).toContain("deliverables/draft.md");
  });

  it("refuses a mechanical settlement over an unreadable input until the principal declares it", async () => {
    const { repo, stateDir, head } = workspace("unreadable");
    const installed = install(repo, stateDir);
    await call(installed, "palimpsest_start", {
      projectId: "psvr",
      goal: "settle with an unreadable input present",
      headCommit: head,
      tasks: [{ task_id: "package", objective: "package", depends_on: [], write_paths: ["deliverables"], required_artifacts: ["deliverables/package.md"] }],
    });
    await call(installed, "palimpsest_next", {});
    const created = (await call(installed, "palimpsest_next", {})) as { entityId?: string };
    const attemptId = String(created.entityId);
    await call(installed, "palimpsest_claim", { attemptId });
    const world = installed.controller.observeAttemptResult(attemptId)!;
    commit(world.workDir, "deliverables/package.md", "# package\n\nall facts\n");
    mkdirSync(join(repo, "notes"), { recursive: true });
    writeFileSync(join(repo, "notes", "huge.bin"), "x".repeat(600 * 1024));

    const readiness = (await call(installed, "palimpsest_work", { action: "readiness", taskId: "package" })) as unknown as Readiness;
    expect(readiness.inputs.state).toBe("OBSERVED");
    expect(readiness.inputs.unreadable).toContain("notes/huge.bin");
    expect(readiness.inputs.relevance).toBe("NEEDS_SEMANTIC_ASSESSMENT");
    expect(readiness.action).toBe("SEMANTIC_JUDGEMENT");
    expect(readiness.reasons.join(" ")).toMatch(/could not read/iu);

    const refused = (await call(installed, "palimpsest_work", {
      action: "finalize",
      taskId: "package",
      expectedObservationDigest: readiness.observationDigest,
    })) as { state: string; detail: string };
    expect(refused.state).toBe("NOT_READY");
    expect(refused.detail).toMatch(/could not read|unreadable/iu);
    expect(installed.controller.status().attempts.some((attempt) => attempt.state === "RUNNING")).toBe(true);

    const settled = (await call(installed, "palimpsest_work", {
      action: "finalize",
      taskId: "package",
      expectedObservationDigest: readiness.observationDigest,
      acknowledgeInputs: true,
    })) as { state: string };
    expect(settled.state).toBe("SETTLED");
  });
});

describe("PSVR-0 C — a settlement that finds no RUNNING attempt is not 'already settled'", () => {
  it("reports the real state when the attempt disappears between readiness and settlement", async () => {
    const { repo, stateDir, head } = workspace("race");
    const installed = install(repo, stateDir);
    await call(installed, "palimpsest_start", {
      projectId: "psvr",
      goal: "race the finalization",
      headCommit: head,
      tasks: [{ task_id: "package", objective: "package", depends_on: [], write_paths: ["deliverables"], required_artifacts: ["deliverables/package.md"] }],
    });
    await call(installed, "palimpsest_next", {});
    const created = (await call(installed, "palimpsest_next", {})) as { entityId?: string };
    const attemptId = String(created.entityId);
    await call(installed, "palimpsest_claim", { attemptId });
    const world = installed.controller.observeAttemptResult(attemptId)!;
    commit(world.workDir, "deliverables/package.md", "# package\n\nall facts\n");
    const surface = makeWorkOutcomeSurface(
      { controller: installed.controller },
      {
        completeTask: async () => ({
          state: "NO_RUNNING_ATTEMPT" as const,
          taskId: "package",
          detail: "no RUNNING attempt exists for this task; the attempt was cancelled by another actor",
          resultCommit: null,
        }),
      } as never,
    );
    const readiness = await surface.outcomeReadiness({ taskId: "package" });
    const outcome = await surface.finalizeOutcome({ taskId: "package", expectedObservationDigest: readiness.observationDigest });
    expect(outcome.state).toBe("NOT_READY");
    expect(outcome.detail).toMatch(/no RUNNING attempt/iu);
    expect(outcome.resultCommit).toBeNull();
    expect(installed.controller.status().attempts.every((attempt) => attempt.state !== "COMPLETED")).toBe(true);
  });
});

describe("PSVR-0 D — the WORKTREE input read is bounded and repository-contained", () => {
  it("refuses traversal and an over-budget file", () => {
    const { root, repo, head } = workspace("read");
    writeFileSync(join(root, "outside.md"), "outside the repository\n");
    expect(readProjectInput({ repository: repo, path: "../outside.md", content: "WORKTREE", revision: head }).state).toBe("UNAVAILABLE");
    writeFileSync(join(repo, "big.md"), "x".repeat(600 * 1024));
    const big = readProjectInput({ repository: repo, path: "big.md", content: "WORKTREE", revision: head });
    expect(big.state).toBe("UNAVAILABLE");
    expect(big.state === "UNAVAILABLE" ? big.detail : "").toMatch(/above the .* budget/iu);
  });

  it("refuses a symlinked path that resolves outside the repository", () => {
    const { root, repo, head } = workspace("link");
    writeFileSync(join(root, "secret.txt"), "not a project input\n");
    let linked = true;
    try {
      symlinkSync(root, join(repo, "escape"), "junction");
    } catch {
      linked = false;
    }
    if (!linked) return;
    const read = readProjectInput({ repository: repo, path: "escape/secret.txt", content: "WORKTREE", revision: head });
    expect(read.state).toBe("UNAVAILABLE");
    expect(read.state === "UNAVAILABLE" ? read.detail : "").toMatch(/outside the repository/iu);
  });
});
