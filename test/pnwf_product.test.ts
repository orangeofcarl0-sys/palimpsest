/**
 * PNWF — Project-Native Work Flow, deterministic product qualification.
 *
 * These tests execute the installed product against real temporary repositories. They prove the
 * behaviour the PSVR-C trajectory exposed:
 *
 *   · a direct outcome can be observed and delivered without inventing a formal task;
 *   · a zero-delta RUNNING attempt is not advertised as a settleable completion;
 *   · the session has a legal CHECKPOINT that does not settle the attempt;
 *   · a redundant formal task can be retired through the EXISTING typed plan revision, never by
 *     faking a settlement;
 *   · a direct commit ahead of the canonical head is shown, never auto-promoted;
 *   · a real committed world delta still settles through the ordinary path and stops at VERIFYING.
 *
 * No model is involved. The host, Git, SQLite, Work, Scheduler, Episode and ProjectIR are the real
 * product owners.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import { explainWorkState } from "../src/domain/work_state.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "the declared artifact exists and every write stays inside its task scope",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PNWF fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(name: string, files: Record<string, string> = {}): { root: string; repo: string; stateDir: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-pnwf-${name}-`));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# PNWF base\n");
  writeFileSync(join(repo, "docs", "result.md"), "# delivered result\n");
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(repo, path, ".."), { recursive: true });
    writeFileSync(join(repo, path), body);
  }
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

function install(repo: string, stateDir: string, execution: "in-place" | "worktree" = "in-place") {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    { projectId: "pnwf", repository: repo, stateDir, execution, standard, toolProfile: "normal" },
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

async function start(installed: ReturnType<typeof install>, head: string, tasks: readonly unknown[] = []): Promise<void> {
  await call(installed, "palimpsest_start", {
    projectId: "pnwf",
    goal: "PNWF deterministic qualification",
    headCommit: head,
    tasks,
  });
}

function commit(repo: string, message: string): string {
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", message], { cwd: repo });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
}

type Status = {
  headCommit: string;
  directOutcome?: { repositoryHead: string | null; projectHead: string; relation: string; uncommittedPaths: string[] };
  nextAction: { kind: string; executable: boolean; action: string | null; detail: string; session?: { mayEnd: boolean; action: string | null; detail: string } };
  tasks: Array<{ task_id: string; state: string }>;
  attempts: Array<{ attempt_id: string; task_id: string | null; state: string; execution?: { worldHead: string | null; baseCommit: string; liveness: string } }>;
  promotions: Array<{ promotion_id: string; state: string }>;
  summary: { attemptsRunning: number; tasksSatisfied: number };
};

type Conclude = {
  state: string;
  blockers: string[];
  warnings?: string[];
  conclusion?: {
    intent: string;
    check?: {
      openTasks: string[];
      openAttempts: string[];
      artifacts: Array<{ path: string; present: boolean; tracked: boolean; committed: boolean; commit: string | null; source: string; digest?: string | null }>;
    };
  };
  session?: { mayEnd: boolean; detail: string };
};

type Pulse = {
  episode: { state: string; current: boolean; changedSince: string[]; conclusion: { intent: string } | null };
};

describe("PNWF — direct outcome continuity", () => {
  it("Case 1: a no-task project delivers a direct commit without inventing Work", async () => {
    const { repo, stateDir, head } = workspace("no-task");
    const installed = install(repo, stateDir);
    await start(installed, head, []);

    const status = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(status.nextAction.kind).toBe("NO_FORMAL_WORK");
    expect(status.nextAction.executable).toBe(false);
    expect(status.nextAction.session?.mayEnd).toBe(true);
    expect(status.directOutcome).toMatchObject({ repositoryHead: head, projectHead: head, relation: "IN_SYNC" });
    expect(status.tasks).toEqual([]);
    expect(status.attempts).toEqual([]);

    const concluded = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "DELIVER",
      statement: "The committed result is the deliverable; no formal Work was invented for it.",
      artifacts: ["docs/result.md"],
    })) as unknown as Conclude;
    expect(concluded.state).toBe("RECORDED");
    expect(concluded.session?.mayEnd).toBe(true);
    expect(concluded.blockers).toEqual([]);
    const artifact = concluded.conclusion?.check?.artifacts[0];
    expect(artifact).toMatchObject({
      path: "docs/result.md",
      present: true,
      tracked: true,
      committed: true,
      source: "WORKTREE",
      commit: head,
    });
    expect(concluded.conclusion?.check?.openTasks).toEqual([]);
    expect(concluded.conclusion?.check?.openAttempts).toEqual([]);

    const events = installed.controller.store.connection
      .prepare("SELECT event_type, COUNT(*) AS n FROM events WHERE project_id=? GROUP BY event_type")
      .all("pnwf") as Array<{ event_type: string; n: number }>;
    const types = new Set(events.map((row) => row.event_type));
    for (const forbidden of ["ATTEMPT_STARTED", "ATTEMPT_COMPLETED", "PROMOTION_COMMITTED"]) {
      expect(types.has(forbidden)).toBe(false);
    }

    // A NEW product instance reading the same state sees the conclusion, not a fabricated Work.
    await installed.dispose();
    const reopened = install(repo, stateDir);
    const pulse = (await call(reopened, "palimpsest_continuity", { action: "pulse" })) as unknown as Pulse;
    expect(pulse.episode.state).toBe("DELIVERED");
    expect(pulse.episode.current).toBe(true);
    expect(pulse.episode.conclusion?.intent).toBe("DELIVER");

    // Reading the same conclusion twice does not append journal entries.
    const projectWorkspace = reopened.application.projectWorkspace;
    expect(projectWorkspace).toBeDefined();
    const before = (await projectWorkspace!.journal()).length;
    await call(reopened, "palimpsest_continuity", { action: "pulse" });
    await call(reopened, "palimpsest_continuity", { action: "pulse" });
    expect((await projectWorkspace!.journal()).length).toBe(before);
  });

  it("Case 2: an uncommitted direct draft is reported, never claimed as committed", async () => {
    const { repo, stateDir, head } = workspace("draft");
    const installed = install(repo, stateDir);
    await start(installed, head, []);
    writeFileSync(join(repo, "docs", "draft.md"), "# a real draft, not committed\n");
    const status = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(status.directOutcome?.relation).toBe("IN_SYNC");
    expect(status.directOutcome?.uncommittedPaths).toContain("docs/draft.md");

    const concluded = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "DELIVER",
      statement: "The draft is present but is not yet a committed result.",
      artifacts: ["docs/draft.md"],
    })) as unknown as Conclude;
    expect(concluded.state).toBe("RECORDED");
    expect(concluded.conclusion?.check?.artifacts[0]).toMatchObject({
      path: "docs/draft.md",
      present: true,
      committed: false,
      commit: null,
      source: "WORKTREE",
    });
    expect(concluded.warnings?.join(" ")).toMatch(/not tracked|uncommitted|not in HEAD/iu);
  });

  it("Case 7: a direct DELIVER is advisory — no promotion, no worker attribution, no acceptance", async () => {
    const { repo, stateDir, head } = workspace("advisory");
    const installed = install(repo, stateDir);
    await start(installed, head, []);
    writeFileSync(join(repo, "docs", "result.md"), "# directly changed and committed\n");
    const direct = commit(repo, "direct deliver");
    expect(direct).not.toBe(head);
    const concluded = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "DELIVER",
      statement: "The direct commit is the deliverable; the operator still decides whether to accept it.",
      artifacts: ["docs/result.md"],
    })) as unknown as Conclude;
    expect(concluded.state).toBe("RECORDED");
    expect(concluded.conclusion?.check?.artifacts[0]).toMatchObject({ committed: true, commit: direct });
    const status = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(status.promotions).toEqual([]);
    expect(status.attempts).toEqual([]);
    expect(status.tasks).toEqual([]);
  });
});

describe("PNWF — reality-aware guidance and redundant Work", () => {
  const task = {
    task_id: "verify",
    objective: "verify the committed result",
    write_paths: ["docs"],
    required_artifacts: ["docs/result.md"],
  };

  it("Case 3 + Case 5: a zero-delta RUNNING attempt is not offered as a completion; an active worker never is", async () => {
    const { repo, stateDir, head } = workspace("zero-delta");
    const installed = install(repo, stateDir, "worktree");
    await start(installed, head, [task]);
    const prepared = await installed.controller.prepareMutatingWork({ expectedTaskId: "verify" });
    expect(prepared.attemptId).toBeTruthy();

    const status = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(status.nextAction.kind).toBe("NO_SETTLEABLE_DELTA");
    expect(status.nextAction.executable).toBe(false);
    expect(status.nextAction.action).toBeNull();
    expect(status.nextAction.detail).toMatch(/cannot|NO_WORK|no commit beyond/iu);
    expect(status.nextAction.session?.mayEnd).toBe(true);
    expect(status.nextAction.session?.action).toMatch(/conclude/u);
    expect(status.attempts[0]?.execution).toMatchObject({ baseCommit: head, worldHead: head, liveness: "NEVER_STARTED" });

    // The taskId-less path must also return guidance, not a bare thrown refusal.
    const placed = (await call(installed, "palimpsest_work", {
      action: "complete",
      summary: "nothing new",
    })) as unknown as { state: string; detail: string; nextActions: string[] };
    expect(placed.state).toBe("NOT_READY");
    expect(placed.nextActions.join(" ")).toMatch(/do not retry complete/iu);
    expect(placed.nextActions.join(" ")).toMatch(/conclude intent=CHECKPOINT/u);

    const complete = (await call(installed, "palimpsest_work", {
      action: "complete",
      taskId: "verify",
      summary: "nothing new",
    })) as unknown as { state: string; detail: string; nextActions: string[] };
    expect(complete.state).toBe("NOT_READY");
    expect(complete.detail).toMatch(/no observable change/iu);
    expect(complete.nextActions.join(" ")).toMatch(/do not retry complete/iu);
    expect(complete.nextActions.join(" ")).toMatch(/conclude intent=CHECKPOINT/u);

    const checkpoint = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "CHECKPOINT",
      statement: "The committed outcome exists at the basis, but the formal attempt has no delta; preserve the open position.",
      nextStep: "Retire the redundant task or let the operator accept the direct result.",
    })) as unknown as Conclude;
    expect(checkpoint.state).toBe("RECORDED");
    expect(checkpoint.session?.mayEnd).toBe(true);
    expect(checkpoint.conclusion?.check?.openTasks).toContain("verify:ACTIVE");
    expect(checkpoint.conclusion?.check?.openAttempts.join(" ")).toMatch(/verify:RUNNING/u);

    // CHECKPOINT did not settle or accept anything.
    const afterCheckpoint = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(afterCheckpoint.tasks.find((entry) => entry.task_id === "verify")?.state).toBe("ACTIVE");
    expect(afterCheckpoint.summary.attemptsRunning).toBe(1);

    // A live/unproven world cannot be retired by a typed revision.
    await expect(
      call(installed, "palimpsest_work", {
        action: "plan",
        reason: "retire the redundant task",
        tasks: [],
        changeClass: "behavior_change",
        changedIds: ["verify"],
      }),
    ).rejects.toThrow(/cannot retire task verify/u);

    // The existing successor route closes the unobserved position; then the typed revision retires it.
    const relay = (await call(installed, "palimpsest_work", {
      action: "relay",
      taskId: "verify",
      relayRoute: "successor",
      summary: "no worker was observed; close the empty position as a successor",
    })) as unknown as { state: string; taskState: string | null };
    expect(relay.state).toBe("SUCCESSOR_READY");
    expect(relay.taskState).toBe("READY");

    await call(installed, "palimpsest_work", {
      action: "plan",
      reason: "the verification task is redundant: the artifact already exists at the basis",
      tasks: [],
      changeClass: "behavior_change",
      changedIds: ["verify"],
    });
    const retired = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(retired.tasks.find((entry) => entry.task_id === "verify")?.state).toBe("STALE");
    expect(retired.promotions).toEqual([]);
    expect(retired.summary.tasksSatisfied).toBe(0);
  });

  it("a pure active-worker fact is never reported as a settleable delta", () => {
    const active = explainWorkState({
      standardConfirmed: true,
      schedulerState: "RUNNING",
      schedulerDecision: null,
      schedulerError: null,
      tasks: [{ taskId: "verify", state: "ACTIVE" }],
      attempts: [
        {
          taskId: "verify",
          state: "RUNNING",
          execution: { attemptId: "attempt-1", baseCommit: "a".repeat(40), worldHead: "a".repeat(40), uncommittedChanges: [], liveness: "ACTIVE" },
        },
      ],
      holds: [],
      promotionFence: [],
      headState: "IN_SYNC",
    });
    expect(active.kind).toBe("WAIT_ACTIVE_WORK");
    expect(active.executable).toBe(false);
    expect(active.action).toBeNull();
    expect(active.detail).toMatch(/WORKER_ACTIVE|worker is still observed/iu);
    expect(active.session?.mayEnd).toBe(true);

    const committed = explainWorkState({
      standardConfirmed: true,
      schedulerState: "RUNNING",
      schedulerDecision: null,
      schedulerError: null,
      tasks: [{ taskId: "verify", state: "ACTIVE" }],
      attempts: [
        {
          taskId: "verify",
          state: "RUNNING",
          execution: { attemptId: "attempt-2", baseCommit: "a".repeat(40), worldHead: "b".repeat(40), uncommittedChanges: [], liveness: "EXITED" },
        },
      ],
      holds: [],
      promotionFence: [],
      headState: "IN_SYNC",
    });
    expect(committed.kind).toBe("WAIT_ACTIVE_WORK");
    expect(committed.executable).toBe(true);
    expect(committed.action).toBe("palimpsest_work action=complete");

    const unknown = explainWorkState({
      standardConfirmed: true,
      schedulerState: "RUNNING",
      schedulerDecision: null,
      schedulerError: null,
      tasks: [{ taskId: "verify", state: "ACTIVE" }],
      attempts: [
        {
          taskId: "verify",
          state: "RUNNING",
          execution: { attemptId: "attempt-3", baseCommit: "a".repeat(40), worldHead: "b".repeat(40), uncommittedChanges: [], liveness: "UNKNOWN" },
        },
      ],
      holds: [],
      promotionFence: [],
      headState: "IN_SYNC",
    });
    expect(unknown.kind).toBe("WAIT_ACTIVE_WORK");
    expect(unknown.executable).toBe(false);
    expect(unknown.detail).toMatch(/liveness is UNKNOWN|unobserved writer/iu);
  });
});

describe("PNWF — governance transition and governed Work", () => {
  it("Case 6: a direct commit ahead of the canonical head is shown, never promoted", async () => {
    const { repo, stateDir, head } = workspace("ahead");
    const installed = install(repo, stateDir, "worktree");
    await start(installed, head, [
      { task_id: "next", objective: "continue governed work", write_paths: ["docs"], required_artifacts: ["docs/result.md"] },
    ]);
    writeFileSync(join(repo, "docs", "result.md"), "# direct change\n");
    const direct = commit(repo, "direct ahead");
    expect(direct).not.toBe(head);

    const status = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(status.directOutcome).toMatchObject({
      repositoryHead: direct,
      projectHead: head,
      relation: "DIRECT_AHEAD",
    });
    expect(status.nextAction.kind).toBe("DIRECT_HEAD_AHEAD");
    expect(status.nextAction.executable).toBe(false);

    await expect(installed.controller.prepareMutatingWork({ expectedTaskId: "next" })).rejects.toThrow(/HEAD_BASIS_MISMATCH/u);

    const after = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(after.headCommit).toBe(head);
    expect(after.directOutcome?.projectHead).toBe(head);
    expect(after.promotions).toEqual([]);
  });

  it("Case 4: a committed world delta settles through the ordinary path and stops at VERIFYING", async () => {
    const { repo, stateDir, head } = workspace("governed");
    const installed = install(repo, stateDir, "worktree");
    await start(installed, head, [
      { task_id: "write", objective: "write the governed artifact", write_paths: ["src"], required_artifacts: ["src/a.ts"] },
    ]);
    const prepared = await installed.controller.prepareMutatingWork({ expectedTaskId: "write" });
    mkdirSync(join(prepared.worldPath, "src"), { recursive: true });
    writeFileSync(join(prepared.worldPath, "src", "a.ts"), "export const value = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: prepared.worldPath });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "governed work"], { cwd: prepared.worldPath });

    const status = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(status.nextAction.executable).toBe(true);
    expect(status.nextAction.action).toBe("palimpsest_work action=complete");

    const complete = (await call(installed, "palimpsest_work", {
      action: "complete",
      taskId: "write",
      summary: "the governed artifact is committed",
    })) as unknown as { state: string; resultCommit: string; nextActions: string[] };
    expect(complete.state).toBe("SETTLED");
    expect(complete.resultCommit).toMatch(/^[0-9a-f]{40}$/u);
    const after = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(after.tasks.find((entry) => entry.task_id === "write")?.state).toBe("VERIFYING");
    expect(after.promotions).toEqual([]);
  });
});

describe("PNWF — negative controls", () => {
  it("a missing artifact cannot be delivered as a positive conclusion", async () => {
    const { repo, stateDir, head } = workspace("missing");
    const installed = install(repo, stateDir);
    await start(installed, head, []);
    const refused = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "DELIVER",
      statement: "This should not be accepted because the artifact does not exist.",
      artifacts: ["docs/does-not-exist.md"],
    })) as unknown as Conclude;
    expect(refused.state).toBe("REFUSED");
    expect(refused.blockers.join(" ")).toMatch(/does not exist/iu);
    expect(refused.session?.mayEnd).toBe(false);
  });

  it("a recorded artifact that moves is reopened, not silently rewritten", async () => {
    const { repo, stateDir, head } = workspace("reopen");
    const installed = install(repo, stateDir);
    await start(installed, head, []);
    const concluded = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "DELIVER",
      statement: "The committed result is the deliverable.",
      artifacts: ["docs/result.md"],
    })) as unknown as Conclude;
    expect(concluded.state).toBe("RECORDED");
    writeFileSync(join(repo, "docs", "result.md"), "# changed after delivery\n");
    const direct = commit(repo, "change after delivery");
    const pulse = (await call(installed, "palimpsest_continuity", { action: "pulse" })) as unknown as Pulse;
    expect(["REOPENED", "STALE"]).toContain(pulse.episode.state);
    expect(pulse.episode.current).toBe(false);
    expect(pulse.episode.changedSince.join(" ")).toMatch(/docs\/result\.md/iu);
    const artifact = concluded.conclusion?.check?.artifacts[0];
    expect(artifact?.commit).toBe(head);
    expect(direct).not.toBe(head);
  });

  it("an unobservable repository is UNOBSERVABLE, not 'in sync'", async () => {
    const { repo, stateDir, head } = workspace("unobservable");
    const installed = install(repo, stateDir);
    await start(installed, head, []);
    rmSync(join(repo, ".git"), { recursive: true, force: true });
    const status = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as Status;
    expect(status.directOutcome?.relation).toBe("UNOBSERVABLE");
    expect(status.directOutcome?.repositoryHead).toBeNull();
  });

  it("the declared basis must be the repository head", async () => {
    const { repo, stateDir, head } = workspace("basis");
    const installed = install(repo, stateDir);
    await expect(
      call(installed, "palimpsest_start", {
        projectId: "pnwf",
        goal: "bad basis",
        headCommit: "a".repeat(40),
        tasks: [],
      }),
    ).rejects.toThrow(/HEAD_CONFLICT/u);
    const status = (await call(installed, "palimpsest_work", { action: "status" }).catch(() => null)) as Status | null;
    expect(status).toBeNull();
    // The real head still starts the project.
    await start(installed, head, []);
    expect(readFileSync(join(repo, "docs", "result.md"), "utf8")).toContain("delivered result");
  });
});
