/**
 * LHAPE-A/B — the model-facing execution surface over the EXISTING owners.
 *
 * These are deterministic engineering qualifications, not model observations. A fake worker port
 * stands in for the DSH process so the test can hold two workers open at once and prove the
 * canonical/product facts they produce. The DSH process itself is exercised by the host scenario.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";
import { makeWorkDelegationService, type WorkWorkerRunPort } from "../src/interaction/work_delegation.js";
import { makeWorkSurfaces } from "../src/application/surfaces/work.js";
import { makeContributionService } from "../src/project_contribution/index.js";
import { appliedDecisionFromHistory } from "../src/composition/continuity.js";
import type { ProjectIr } from "../src/schema/models.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope and leave the required artifact",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["LHAPE fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(name: string): { root: string; repo: string; stateDir: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-lhape-${name}-`));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# LHAPE base\n");
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

function install(repo: string, stateDir: string, execution: "in-place" | "worktree" = "worktree") {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "lhape",
      repository: repo,
      stateDir,
      execution,
      standard,
      toolProfile: "normal",
      advanced: { concurrency: 2 },
    },
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
    callId: `c-${name}`,
    rootCallId: `r-${name}`,
    arguments: args,
    name,
    signal: new AbortController().signal,
  };
  return (await definition.execute(args, context)) as Record<string, unknown>;
}

const TASKS = [
  {
    task_id: "capacity",
    objective: "Write the capacity assessment for site A.",
    depends_on: [],
    write_paths: ["docs/capacity.md"],
    required_artifacts: ["docs/capacity.md"],
  },
  {
    task_id: "cost",
    objective: "Write the cost model for site B.",
    depends_on: [],
    write_paths: ["docs/cost.md"],
    required_artifacts: ["docs/cost.md"],
  },
];

async function start(installed: ReturnType<typeof install>, head: string, tasks = TASKS): Promise<void> {
  await call(installed, "palimpsest_start", {
    projectId: "lhape",
    goal: "produce a defensible multi-site deployment package",
    headCommit: head,
    tasks,
  });
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
}

function commitFile(worldDir: string, relative: string, contents: string): string {
  mkdirSync(dirname(join(worldDir, relative)), { recursive: true });
  writeFileSync(join(worldDir, relative), contents);
  git(worldDir, ["add", "-A"]);
  git(worldDir, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", `write ${relative}`]);
  return git(worldDir, ["rev-parse", "HEAD"]);
}

async function waitFor<T>(read: () => Promise<T> | T, done: (value: T) => boolean, label: string, timeoutMs = 30_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("LHAPE-A: the product surface runs independent workers concurrently", () => {
  it("two workers hold separate worlds at the same time and both settle without moving canonical source", async () => {
    const { repo, head, stateDir } = workspace("parallel");
    const installed = install(repo, stateDir);
    await start(installed, head);

    const worlds: string[] = [];
    const commits: string[] = [];
    let active = 0;
    let maxActive = 0;
    let releaseBoth: () => void = () => undefined;
    const release = new Promise<void>((resolve) => {
      releaseBoth = resolve;
    });
    let bothStartedResolve: () => void = () => undefined;
    const bothStarted = new Promise<void>((resolve) => {
      bothStartedResolve = resolve;
    });
    let spawn = 0;

    const workerFor = (): WorkWorkerRunPort => {
      const index = spawn++;
      return {
        adapterId: `overlap-${String(index)}`,
        async run({ workDir }) {
          worlds.push(workDir);
          active += 1;
          maxActive = Math.max(maxActive, active);
          if (active === 2) bothStartedResolve();
          await release;
          const relative = index === 0 ? "docs/capacity.md" : "docs/cost.md";
          commits.push(commitFile(workDir, relative, `# ${relative}\n\nproduced by worker ${String(index)}\n`));
          active -= 1;
          return { kind: "READY_FOR_SETTLEMENT" as const, summary: `wrote ${relative}` };
        },
      };
    };

    const service = makeWorkDelegationService({ controller: installed.controller, workerFor });
    const surface = makeWorkSurfaces({ controller: installed.controller, workDelegation: service }).work;

    const first = await surface.startWorker({ taskId: "capacity" });
    const second = await surface.startWorker({ taskId: "cost" });
    expect(first.state).toBe("STARTED");
    expect(second.state).toBe("STARTED");

    await bothStarted;
    expect(maxActive).toBe(2);
    expect(new Set(worlds).size).toBe(2);
    expect(worlds.every((dir) => dir.startsWith(join(repo, ".palimpsest", "worlds")))).toBe(true);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);

    const during = await surface.workers();
    expect(during.attempts.filter((attempt) => attempt.state === "RUNNING")).toHaveLength(2);
    expect(during.attempts.every((attempt) => attempt.hostObserved)).toBe(true);

    releaseBoth();
    await waitFor(
      () => service.jobs(),
      (jobs) => jobs.length === 2 && jobs.every((job) => job.phase === "FINISHED"),
      "both jobs to finish",
    );
    const after = await surface.workers();
    expect(after.attempts.map((attempt) => attempt.state).sort()).toEqual(["COMPLETED", "COMPLETED"]);
    expect(new Set(commits).size).toBe(2);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
    const changed = git(repo, ["status", "--porcelain"])
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.includes(".palimpsest"));
    expect(changed).toEqual([]);
  });

  it("refuses a second live worker on one task, and a stop REQUEST is not a stopped process", async () => {
    const { repo, head, stateDir } = workspace("stop");
    const installed = install(repo, stateDir);
    await start(installed, head);

    let committedResolve: () => void = () => undefined;
    const committed = new Promise<void>((resolve) => {
      committedResolve = resolve;
    });
    const workerFor = (): WorkWorkerRunPort => ({
      adapterId: "parked-committed-worker",
      async run({ workDir, signal }) {
        commitFile(workDir, "docs/capacity.md", "# capacity\n\ncommitted before the stop\n");
        committedResolve();
        await new Promise<void>((_resolve, reject) => {
          if (signal?.aborted === true) {
            reject(new Error("stopped by host request"));
            return;
          }
          signal?.addEventListener("abort", () => reject(new Error("stopped by host request")), { once: true });
        });
        return { kind: "READY_FOR_SETTLEMENT" as const };
      },
    });

    const service = makeWorkDelegationService({ controller: installed.controller, workerFor });
    const surface = makeWorkSurfaces({ controller: installed.controller, workDelegation: service }).work;

    const startedWorker = await surface.startWorker({ taskId: "capacity" });
    expect(startedWorker.state).toBe("STARTED");
    await committed;

    const duplicate = await surface.startWorker({ taskId: "capacity" });
    expect(duplicate.state).toBe("REFUSED");
    expect(duplicate.detail).toMatch(/WORK_ALREADY_RUNNING/u);

    const stop = await surface.stopWorker({ taskId: "capacity" });
    expect(stop.state).toBe("STOP_REQUESTED");
    expect(stop.detail).toMatch(/NOT an observation/iu);

    await waitFor(
      () => service.jobs(),
      (jobs) => jobs.length === 1 && jobs[0]!.phase === "HOST_ERROR",
      "the stop request to end the worker host",
    );
    const attemptId = installed.controller.status().attempts.find((attempt) => attempt.task_id === "capacity")!.attempt_id;
    expect(installed.controller.attemptWorkRecord(attemptId)?.state).toBe("RUNNING");

    const observed = await surface.workers();
    expect(observed.jobs[0]!.stopRequested).toBe(true);
    expect(observed.attempts.find((attempt) => attempt.taskId === "capacity")!.hostObserved).toBe(false);

    /**
     * A NEW host (here: the job is terminal, so no active worker) settles from the WORLD. The
     * committed work survives the failed host process, and no ATTEMPT_FAILED was ever fabricated.
     */
    const recovered = await surface.completeTask({ taskId: "capacity" });
    expect(recovered.state).toBe("SETTLED");
    expect(recovered.resultCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(installed.controller.attemptWorkRecord(attemptId)?.state).toBe("COMPLETED");
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
  });
});

describe("LHAPE-B: retirement, late results and promotion authority", () => {
  it("a result that arrives after its task was retired stays inspectable and is refused by promotion", async () => {
    const { repo, head, stateDir } = workspace("late");
    const installed = install(repo, stateDir);
    await start(installed, head);

    const prepared = await installed.controller.prepareMutatingWork();
    const resultCommit = commitFile(prepared.worldPath, "docs/capacity.md", "# capacity\n\nold-basis work\n");
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);

    const before = installed.controller.work.project();
    installed.controller.plan({
      goal: before.goal,
      requirements: before.requirements,
      decisions: before.decisions,
      tasks: [
        {
          task_id: "capacity-v2",
          objective: "Write the capacity assessment for the revised site A constraint.",
          depends_on: [],
          write_paths: ["docs/capacity-v2.md"],
          required_artifacts: ["docs/capacity-v2.md"],
        },
      ],
      reason: "the measured constraint invalidated both original tasks",
      changeClass: "behavior_change",
      changedIds: ["capacity", "cost"],
    });

    const status = installed.controller.status();
    const attempt = status.attempts.find((row) => row.task_id === "capacity")!;
    expect(attempt.orphaned).toBe(true);
    expect(attempt.state).toBe("STALE");

    const pulse = (await call(installed, "palimpsest_continuity", { action: "pulse" })) as {
      execution: {
        attempts: Array<{ taskId: string | null; state: string; orphaned: boolean; hostObserved: boolean }>;
      };
      decisionQueue: Array<{ kind: string; ref: string }>;
    };
    expect(pulse.execution.attempts).toContainEqual(
      expect.objectContaining({ taskId: "capacity", orphaned: true, hostObserved: false }),
    );
    expect(pulse.decisionQueue).toContainEqual(expect.objectContaining({ kind: "ORPHANED_EXECUTION" }));

    const surface = makeWorkSurfaces({ controller: installed.controller }).work;
    const recovered = await surface.completeTask({ taskId: "capacity" });
    expect(recovered.state).toBe("SETTLED");
    expect(recovered.resultCommit).toBe(resultCommit);

    const afterPulse = (await call(installed, "palimpsest_continuity", { action: "pulse" })) as {
      decisionQueue: Array<{ kind: string; ref: string }>;
    };
    expect(afterPulse.decisionQueue).toContainEqual(expect.objectContaining({ kind: "STALE_RESULT" }));

    const eligibility = installed.controller.promotions.assessEligibility(attempt.attempt_id);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockers.map((blocker) => blocker.kind)).toContain("task_retired");
    expect(eligibility.sourceCommit).toBe(resultCommit);
  });

  it("a crash between the plan revision and the decision journal record is reconciled without a second revision", async () => {
    const { repo, head, stateDir } = workspace("crash-window");
    const installed = install(repo, stateDir, "in-place");
    await start(installed, head);

    const workspaceService = installed.projectWorkspace!;
    let failDecisionWrite = true;
    const flaky = {
      journal: (projectId?: string) => workspaceService.journal(projectId),
      recordJournalEntry: async (entry: Parameters<typeof workspaceService.recordJournalEntry>[0]) => {
        if (failDecisionWrite && entry.title.includes("Contribution decision")) {
          failDecisionWrite = false;
          throw new Error("simulated crash after PROJECT_REVISED, before the journal record");
        }
        return await workspaceService.recordJournalEntry(entry);
      },
    };
    const controller = installed.controller;
    const history = (): readonly ProjectIr[] =>
      controller.store
        .listEvents("lhape")
        .filter((event) => event.event_type === "PROJECT_CREATED" || event.event_type === "PROJECT_REVISED")
        .map((event) => event.payload.project_ir as ProjectIr)
        .sort((left, right) => left.revision - right.revision);
    const service = makeContributionService({
      projectId: "lhape",
      controller: {
        projectId: "lhape",
        work: { project: () => controller.work.project() },
        status: () => controller.status(),
        plan: (input) => controller.plan(input),
      },
      workspace: flaky,
      appliedDecision: (decisionId) => appliedDecisionFromHistory(history(), decisionId),
    });

    const recorded = await service.record({
      sourceKind: "EXPLORATION",
      sourceRef: "input:measured-constraint",
      task: "check the site-B constraint",
      finding: "the site-B width limit is 700mm, so the 900mm unit is not admissible",
      declaredReadFootprint: ["inputs/constraint-update.md"],
    });
    const tasks = [
      TASKS[0]!,
      {
        task_id: "cost-v2",
        objective: "Write the cost model for the 700mm unit.",
        depends_on: [],
        write_paths: ["docs/cost-v2.md"],
        required_artifacts: ["docs/cost-v2.md"],
      },
    ];

    await expect(
      service.decide({
        contributionId: recorded.contribution.contributionId,
        decision: "REVISE_PLAN",
        decisionNote: "the measured constraint changes the cost task",
        reason: "measured site-B constraint",
        tasks,
      }),
    ).rejects.toThrow(/simulated crash/u);

    const afterCrash = controller.work.project();
    expect(afterCrash.tasks.map((task) => task.task_id)).toEqual(["capacity", "cost-v2"]);

    const retried = await service.decide({
      contributionId: recorded.contribution.contributionId,
      decision: "REVISE_PLAN",
      decisionNote: "the measured constraint changes the cost task",
      reason: "measured site-B constraint",
      tasks,
    });
    expect(retried.alreadyRecorded).toBe(false);
    expect(retried.decision.planChange?.toRevision).toBe(afterCrash.revision);
    expect(retried.decision.planChange?.fromRevision).toBe(afterCrash.revision - 1);
    expect(retried.decision.planChange?.addedTaskIds).toEqual(["cost-v2"]);
    expect(retried.decision.planChange?.reason).toMatch(/recovered/u);
    expect(controller.work.project().revision).toBe(afterCrash.revision);
    expect((await service.list()).find((entry) => entry.record.contributionId === recorded.contribution.contributionId)?.decisions).toHaveLength(1);
  });
});
