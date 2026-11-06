/**
 * PNWF-CQ — action coherence, host-local liveness and journal projection.
 *
 * These are the real product paths the live continuation cohort exposed, reproduced against real
 * temporary repositories. No model is involved: Work, Git, SQLite, ProjectIR, Continuity and the
 * normal tool are the product owners.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import { explainWorkState } from "../src/domain/work_state.js";
import { computeInvalidationSet } from "../src/evidence/invalidation.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "the declared artifact exists and every write stays inside its task scope",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PNWF-CQ fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(name: string): { root: string; repo: string; stateDir: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-pnwf-cq-${name}-`));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# CQ base\n");
  writeFileSync(join(repo, "docs", "result.md"), "# existing result\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: repo });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* Windows may still hold a SQLite handle; the OS reaps the temp tree */
    }
  });
  return { root, repo, stateDir: join(root, "state"), head };
}

function install(repo: string, stateDir: string) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    { projectId: "pnwf-cq", repository: repo, stateDir, execution: "worktree", standard, toolProfile: "normal" },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

async function call(
  installed: ReturnType<typeof install>,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const definition = installed.tools.find((entry) => entry.name === name) as DshToolDefinition | undefined;
  if (definition === undefined) throw new Error(`missing tool ${name}`);
  const context: DshToolRunContext = {
    callId: `c-${name}-${Math.random()}`,
    rootCallId: `r-${name}`,
    arguments: args,
    name,
    signal: new AbortController().signal,
  };
  return (await definition.execute(args, context)) as Record<string, unknown>;
}

const task = {
  task_id: "verify",
  objective: "verify the committed result",
  write_paths: ["docs"],
  required_artifacts: ["docs/result.md"],
};

async function started(installed: ReturnType<typeof install>, head: string): Promise<void> {
  await call(installed, "palimpsest_start", {
    projectId: "pnwf-cq",
    goal: "PNWF-CQ action coherence",
    headCommit: head,
    tasks: [task],
  });
}

function commit(repo: string, message: string): string {
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", message], { cwd: repo });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
}

type Status = {
  headCommit: string;
  directOutcome?: { repositoryHead: string | null; projectHead: string; relation: string };
  nextAction: {
    kind: string;
    executable: boolean;
    action: string | null;
    detail: string;
    blockers: string[];
    session?: { mayEnd: boolean; action: string | null };
    semantic?: { question: string; facts: string[]; options: string[] };
  };
  attempts: Array<{
    attempt_id: string;
    state: string;
    execution?: { baseCommit: string; worldHead: string | null; uncommittedChanges: string[]; liveness: string };
  }>;
  tasks: Array<{ task_id: string; state: string }>;
};

type Readiness = {
  action: string;
  reasons: string[];
  execution: { liveness: string } | null;
  directOutcome: { relation: string; repositoryHead: string | null } | null;
};

describe("PNWF-CQ-A — status and readiness describe the same attempt facts", () => {
  it("a zero-delta world reports no settleable delta, not that the user's work is outstanding", async () => {
    const { repo, stateDir, head } = workspace("zero-delta-direct");
    const installed = install(repo, stateDir);
    await started(installed, head);
    await installed.controller.prepareMutatingWork({ expectedTaskId: "verify" });

    // The direct outcome exists in the repository, outside the attempt's world.
    writeFileSync(join(repo, "docs", "result.md"), "# direct outcome, already committed\n");
    const direct = commit(repo, "direct outcome");

    const status = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(status.nextAction.kind).toBe("NO_SETTLEABLE_DELTA");
    expect(status.nextAction.executable).toBe(false);
    expect(status.nextAction.detail).toMatch(/no settleable candidate delta/iu);
    expect(status.nextAction.detail).toMatch(/not establish that the user's actual outcome is incomplete/iu);
    expect(status.nextAction.detail).toContain(direct.slice(0, 12));
    expect(status.nextAction.detail).not.toMatch(/actual work is still outstanding/iu);
    expect(status.attempts[0]?.execution?.liveness).toBe("UNOBSERVED");

    const readiness = (await call(installed, "palimpsest_work", {
      action: "readiness",
      taskId: "verify",
    })) as unknown as Readiness;
    expect(readiness.action).toBe("SEMANTIC_JUDGEMENT");
    expect(readiness.reasons.join(" ")).toMatch(/no commit beyond/iu);
    expect(readiness.reasons.join(" ")).toMatch(/no settleable candidate delta/iu);
    expect(readiness.reasons.join(" ")).toMatch(/does not establish that the user's actual outcome is incomplete/iu);
    expect(readiness.reasons.join(" ")).toMatch(new RegExp(direct.slice(0, 12), "u"));
    expect(readiness.reasons.join(" ")).not.toMatch(/actual work is still outstanding/iu);
    expect(readiness.directOutcome).toMatchObject({ relation: "DIRECT_AHEAD", repositoryHead: direct });
    expect(readiness.execution?.liveness).toBe("UNOBSERVED");
  });

  it("a world at base with uncommitted edits is not described as having no work", async () => {
    const { repo, stateDir, head } = workspace("uncommitted");
    const installed = install(repo, stateDir);
    await started(installed, head);
    const prepared = await installed.controller.prepareMutatingWork({ expectedTaskId: "verify" });
    writeFileSync(join(prepared.worldPath, "docs", "draft.md"), "# uncommitted, but real work\n");

    const status = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(status.attempts[0]?.execution?.worldHead).toBe(head);
    expect(status.attempts[0]?.execution?.uncommittedChanges).toContain("docs/draft.md");
    expect(status.nextAction.kind).toBe("WAIT_ACTIVE_WORK");
    expect(status.nextAction.detail).toMatch(/uncommitted changes/iu);
    expect(status.nextAction.detail).toMatch(/does not mean there is no work/iu);

    const readiness = (await call(installed, "palimpsest_work", {
      action: "readiness",
      taskId: "verify",
    })) as unknown as Readiness;
    expect(readiness.action).toBe("CONTINUE_WORK");
    expect(readiness.reasons.join(" ")).toMatch(/uncommitted changes/iu);
    expect(readiness.reasons.join(" ")).not.toMatch(/no commit beyond/iu);
  });
});

describe("PNWF-CQ-B — host-local absence is UNOBSERVED, never 'never started'", () => {
  it("a second host settles without claiming an observed worker exit, and records UNATTRIBUTED", async () => {
    const { repo, stateDir, head } = workspace("cross-host");
    const first = install(repo, stateDir);
    await started(first, head);
    const prepared = await first.controller.prepareMutatingWork({ expectedTaskId: "verify" });
    writeFileSync(join(prepared.worldPath, "docs", "result.md"), "# committed by the first host's writer\n");
    execFileSync("git", ["add", "-A"], { cwd: prepared.worldPath });
    execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"], {
      cwd: prepared.worldPath,
    });

    // The first host observes a writer that is still OPEN. Its own settlement must refuse.
    first.controller.executionInvocations.begin({
      attemptId: prepared.attemptId,
      taskId: "verify",
      headAtStart: head,
    });
    const refused = await first.controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
      observation: { path: "PRINCIPAL" },
    });
    expect(refused.state).toBe("NOT_READY");
    expect((refused as { reason?: string }).reason).toBe("WORKER_STILL_RUNNING");

    // A second host has no invocation ledger. The status must say UNOBSERVED, not NEVER_STARTED.
    const second = install(repo, stateDir);
    const status = (await call(second, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(status.attempts.find((attempt) => attempt.attempt_id === prepared.attemptId)?.execution?.liveness).toBe(
      "UNOBSERVED",
    );
    expect(JSON.stringify(status)).not.toMatch(/NEVER_STARTED/u);
    expect(status.nextAction.detail).toMatch(/no invocation record/iu);
    expect(status.nextAction.detail).toMatch(/not proof a worker never started/iu);
    expect(status.nextAction.detail).toMatch(/UNATTRIBUTED/u);

    const completed = (await call(second, "palimpsest_work", { action: "complete", taskId: "verify" })) as unknown as {
      state: string;
      detail: string;
      attribution?: { attribution: string };
    };
    expect(completed.state).toBe("SETTLED");
    expect(completed.attribution?.attribution).toBe("UNATTRIBUTED");
    expect(completed.detail).toMatch(/attribution UNATTRIBUTED/u);
    expect(completed.detail).toMatch(/not proof that an earlier writer stopped/iu);
    // The second host did not fabricate a worker exit.
    expect(completed.detail).not.toMatch(/worker (?:has )?exited/iu);
  });

  it("keeps the ordinary principal completion of an unobserved world working", async () => {
    const { repo, stateDir, head } = workspace("principal");
    const installed = install(repo, stateDir);
    await started(installed, head);
    const prepared = await installed.controller.prepareMutatingWork({ expectedTaskId: "verify" });
    writeFileSync(join(prepared.worldPath, "docs", "result.md"), "# principal-authored result\n");
    execFileSync("git", ["add", "-A"], { cwd: prepared.worldPath });
    execFileSync("git", ["-c", "user.email=p@p.p", "-c", "user.name=principal", "commit", "-qm", "principal"], {
      cwd: prepared.worldPath,
    });
    const completed = (await call(installed, "palimpsest_work", { action: "complete", taskId: "verify" })) as unknown as {
      state: string;
      attribution?: { attribution: string };
    };
    expect(completed.state).toBe("SETTLED");
    expect(completed.attribution?.attribution).toBe("UNATTRIBUTED");
  });
});

describe("PNWF-CQ-C — mechanical next and semantic decision are shown together", () => {
  it("adds the business question without changing the Scheduler's legal next step", () => {
    const next = explainWorkState({
      standardConfirmed: true,
      schedulerState: "RUNNING",
      schedulerDecision: { eventType: "ATTEMPT_CREATED", entityId: "verify" },
      schedulerError: null,
      tasks: [{ taskId: "verify", state: "READY" }],
      attempts: [],
      holds: [],
      promotionFence: [],
      headState: "IN_SYNC",
      directOutcome: {
        repositoryHead: "a".repeat(40),
        projectHead: "a".repeat(40),
        relation: "IN_SYNC",
        admittedDirectCommit: "a".repeat(40),
        uncommittedPaths: [],
      },
    });
    expect(next.kind).toBe("EXECUTE_SCHEDULER_STEP");
    expect(next.executable).toBe(true);
    expect(next.action).toBe("palimpsest_work action=next");
    expect(next.semantic?.question).toMatch(/independent objective/iu);
    expect(next.semantic?.facts.join(" ")).toMatch(/mechanically legal/iu);
    expect(next.semantic?.options.join(" ")).toMatch(/retire a redundant formal task/iu);
  });
});

describe("PNWF-CQ-D — invalidation classes say what they actually do", () => {
  it("metadata_only never produces a typed invalidation set", () => {
    const edges = [
      { from: "a", to: "b", sensitive_to: ["behavior_change", "contract_breaking"] as const },
    ];
    const metadata = computeInvalidationSet(
      { from: 1, to: 2, change_class: "metadata_only", changed_ids: ["a"] },
      edges as never,
    );
    expect([...metadata]).toEqual([]);
    const behavior = computeInvalidationSet(
      { from: 1, to: 2, change_class: "behavior_change", changed_ids: ["a"] },
      edges as never,
    );
    expect([...behavior].sort()).toEqual(["a", "b"]);
  });

  it("the final owner refuses a typed revision while a worker invocation is still OPEN", async () => {
    const { repo, stateDir, head } = workspace("plan-toctou");
    const installed = install(repo, stateDir);
    await started(installed, head);
    const prepared = await installed.controller.prepareMutatingWork({ expectedTaskId: "verify" });
    const invocation = installed.controller.executionInvocations.begin({
      attemptId: prepared.attemptId,
      taskId: "verify",
      headAtStart: head,
    });

    // This is the state the DSH adapter's worker snapshot cannot close by itself: the invocation is
    // OPEN at the OWNER even though the adapter read the job map before it began.
    expect(() =>
      installed.controller.planReconciled({
        tasks: [],
        reason: "retire the redundant task",
        changeClass: "behavior_change",
        changedIds: ["verify"],
      }),
    ).toThrow(/worker invocation is still OPEN/iu);
    const before = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(before.tasks.find((entry) => entry.task_id === "verify")?.state).toBe("ACTIVE");

    installed.controller.executionInvocations.end(invocation.invocationId, { headAtEnd: head, outcome: "ENDED" });
    installed.controller.planReconciled({
      tasks: [],
      reason: "retire the redundant task",
      changeClass: "behavior_change",
      changedIds: ["verify"],
    });
    const after = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(after.tasks.find((entry) => entry.task_id === "verify")?.state).toBe("STALE");
  });

  it("the normal plan tool refuses changedIds that would not invalidate anything", async () => {
    const { repo, stateDir, head } = workspace("metadata-plan");
    const installed = install(repo, stateDir);
    await started(installed, head);
    await expect(
      call(installed, "palimpsest_work", {
        action: "plan",
        tasks: [],
        reason: "bookkeeping retirement",
        changeClass: "metadata_only",
        changedIds: ["verify"],
      }),
    ).rejects.toThrow(/NO invalidation effect/iu);

    // The honest route: remove the task from the graph while the project is quiescent.
    await call(installed, "palimpsest_work", {
      action: "plan",
      tasks: [],
      reason: "the task is redundant; remove it from the graph",
      changeClass: "metadata_only",
    });
    const status = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(status.tasks.find((entry) => entry.task_id === "verify")?.state).toBe("STALE");
  });
});

describe("PNWF-CQ-E — recorded observations are not open questions", () => {
  it("keeps a verification record in history while a real question stays open", async () => {
    const { repo, stateDir, head } = workspace("journal");
    const installed = install(repo, stateDir);
    await call(installed, "palimpsest_start", {
      projectId: "pnwf-cq",
      goal: "journal projection",
      headCommit: head,
      tasks: [],
    });
    const workspaceService = installed.application.projectWorkspace;
    expect(workspaceService).toBeDefined();
    await workspaceService!.recordJournalEntry({
      projectId: "pnwf-cq",
      kind: "REFERENCE_NOTE",
      title: "Verification record at the committed result",
      body: "Re-read the committed result and the suite; the observation is recorded at this commit.",
      provenance: "Audit of the committed result.",
      relatedRefs: [{ kind: "commit", id: head }],
    });
    await workspaceService!.recordJournalEntry({
      projectId: "pnwf-cq",
      kind: "REFERENCE_NOTE",
      title: "Loose note without a source",
      body: "This note has no structured source identity, so it stays conservative.",
      provenance: "session note",
    });
    await workspaceService!.recordJournalEntry({
      projectId: "pnwf-cq",
      kind: "OPEN_QUESTION",
      title: "Which deployment target is authoritative?",
      body: "The operator has not decided.",
      provenance: "operator question",
    });

    const summary = await installed.application.projectWorkspace!.summary();
    const titles = summary.openQuestions.map((entry) => entry.title);
    expect(titles).toContain("Loose note without a source");
    expect(titles).toContain("Which deployment target is authoritative?");
    expect(titles).not.toContain("Verification record at the committed result");
  });
});
