/**
 * ODPE-B — outcome readiness and the bounded finalization.
 *
 * These tests exercise the two real-model failures the ODPE stage exists to remove:
 *
 *   MISSING SETTLEMENT    a correct commit exists and the agent does not settle it;
 *   PREMATURE SETTLEMENT  current inputs arrived and the agent settles anyway.
 *
 * The product's answer is not a finisher agent: `readiness` derives the facts from the owners and
 * classifies the next step; `finalize` re-observes, refuses a stale digest, and settles through the
 * SAME Work owner a human would use. No promotion, no episode conclusion.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";
import { makeWorkDelegationService } from "../src/interaction/work_delegation.js";
import { makeWorkSurfaces } from "../src/application/surfaces/work.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope and leave the required artifact",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["ODPE fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(name: string): { root: string; repo: string; stateDir: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-odpe-${name}-`));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "deliverables"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# ODPE base\n");
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
    { projectId: "odpe", repository: repo, stateDir, execution: "worktree", standard, toolProfile: "expert" },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

async function call(installed: ReturnType<typeof install>, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
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
    task_id: "package",
    objective: "Produce the deployment package.",
    depends_on: [],
    write_paths: ["deliverables"],
    required_artifacts: ["deliverables/package.md"],
  },
];

async function start(installed: ReturnType<typeof install>, head: string): Promise<void> {
  await call(installed, "palimpsest_start", {
    projectId: "odpe",
    goal: "produce and defend a deployment package",
    headCommit: head,
    tasks: TASKS,
  });
}

async function runningAttempt(installed: ReturnType<typeof install>): Promise<{ attemptId: string; workDir: string }> {
  await call(installed, "palimpsest_next", {});
  const created = (await call(installed, "palimpsest_next", {})) as { entityId?: string };
  const attemptId = String(created.entityId);
  await call(installed, "palimpsest_claim", { attemptId });
  const observed = installed.controller.observeAttemptResult(attemptId);
  if (observed === null) throw new Error("the claimed attempt has no observable world");
  return { attemptId, workDir: observed.workDir };
}

function writeCandidate(workDir: string, content: string): string {
  mkdirSync(join(workDir, "deliverables"), { recursive: true });
  writeFileSync(join(workDir, "deliverables", "package.md"), content);
  execFileSync("git", ["add", "-A"], { cwd: workDir });
  execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=worker", "commit", "-qm", "candidate"], { cwd: workDir });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workDir }).toString().trim();
}

type Readiness = {
  schema: string;
  action: "CONTINUE_WORK" | "SEMANTIC_JUDGEMENT" | "MECHANICAL_FINALIZATION";
  reasons: string[];
  observationDigest: string;
  task: { taskId: string; state: string } | null;
  attempt: { attemptId: string; state: string; resultCommit: string | null; resultCommitted: boolean } | null;
  inputs: { state: string; paths: string[]; relevance: string };
  completion: { mechanicalChecksEvaluable: boolean; verificationRequired: boolean };
  next: string[];
};

type Finalized = {
  state: string;
  taskId: string;
  detail: string;
  resultCommit: string | null;
  taskState: string | null;
  readiness: Readiness;
};

describe("ODPE-B — outcome readiness names the next action from facts", () => {
  it("reports CONTINUE_WORK while the world has no candidate commit", async () => {
    const { repo, stateDir, head } = workspace("empty");
    const installed = install(repo, stateDir);
    await start(installed, head);
    await runningAttempt(installed);
    const readiness = (await call(installed, "palimpsest_work", { action: "readiness", taskId: "package" })) as unknown as Readiness;
    expect(readiness.schema).toBe("odpe-outcome-readiness/v1");
    expect(readiness.action).toBe("CONTINUE_WORK");
    expect(readiness.reasons.join(" ")).toMatch(/no commit beyond/iu);
    expect(readiness.next.join(" ")).toMatch(/continue the actual work/iu);
  });

  it("reports MECHANICAL_FINALIZATION for a clean, committed, artifact-complete world", async () => {
    const { repo, stateDir, head } = workspace("ready");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const { workDir } = await runningAttempt(installed);
    const commit = writeCandidate(workDir, "# package\n\nall seven facts\n");
    const readiness = (await call(installed, "palimpsest_work", { action: "readiness", taskId: "package" })) as unknown as Readiness;
    expect(readiness.action).toBe("MECHANICAL_FINALIZATION");
    expect(readiness.attempt?.resultCommitted).toBe(true);
    expect(readiness.attempt?.resultCommit).toBe(commit);
    expect(readiness.completion.mechanicalChecksEvaluable).toBe(true);
    expect(readiness.next.join(" ")).toMatch(/action=finalize/iu);
  });

  it("reports SEMANTIC_JUDGEMENT when an input arrived after the basis", async () => {
    const { repo, stateDir, head } = workspace("input");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const { workDir } = await runningAttempt(installed);
    writeCandidate(workDir, "# package\n\nstill uses the baseline assumption\n");
    writeFileSync(join(repo, "inbox-measured.md"), "measured corridor: 700 mm\n");
    const readiness = (await call(installed, "palimpsest_work", { action: "readiness", taskId: "package" })) as unknown as Readiness;
    expect(readiness.action).toBe("SEMANTIC_JUDGEMENT");
    expect(readiness.inputs.state).toBe("OBSERVED");
    expect(readiness.inputs.paths).toContain("inbox-measured.md");
    expect(readiness.inputs.relevance).toBe("NEEDS_SEMANTIC_ASSESSMENT");
    expect(readiness.reasons.join(" ")).toMatch(/decide whether the candidate still holds/iu);
  });
});

describe("ODPE-B — bounded finalization", () => {
  it("settles a ready candidate through the same Work owner and stops before acceptance", async () => {
    const { repo, stateDir, head } = workspace("finalize");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const { workDir } = await runningAttempt(installed);
    const commit = writeCandidate(workDir, "# package\n\nall seven facts\n");
    const readiness = (await call(installed, "palimpsest_work", { action: "readiness", taskId: "package" })) as unknown as Readiness;
    const settled = (await call(installed, "palimpsest_work", {
      action: "finalize",
      taskId: "package",
      expectedObservationDigest: readiness.observationDigest,
    })) as unknown as Finalized;
    expect(settled.state).toBe("SETTLED");
    expect(settled.resultCommit).toBe(commit);
    // The scheduler moved the task to VERIFYING; the product did NOT accept it.
    expect(settled.taskState).toBe("VERIFYING");
    expect(settled.readiness.task?.state).toBe("VERIFYING");
    expect(settled.detail).toMatch(/operator must accept/iu);
    expect(installed.controller.status().promotions).toEqual([]);
    // Canonical HEAD did not move: a settlement is not a promotion.
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim()).toBe(head);
  });

  it("is idempotent after the settlement: a second call reports ALREADY_SETTLED, not a duplicate", async () => {
    const { repo, stateDir, head } = workspace("idempotent");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const { workDir } = await runningAttempt(installed);
    const commit = writeCandidate(workDir, "# package\n\nall seven facts\n");
    const first = (await call(installed, "palimpsest_work", { action: "readiness", taskId: "package" })) as unknown as Readiness;
    await call(installed, "palimpsest_work", { action: "finalize", taskId: "package", expectedObservationDigest: first.observationDigest });
    const second = (await call(installed, "palimpsest_work", { action: "readiness", taskId: "package" })) as unknown as Readiness;
    const again = (await call(installed, "palimpsest_work", {
      action: "finalize",
      taskId: "package",
      expectedObservationDigest: second.observationDigest,
    })) as unknown as Finalized;
    expect(again.state).toBe("ALREADY_SETTLED");
    expect(again.resultCommit).toBe(commit);
    expect(again.detail).toMatch(/no second settlement/iu);
  });

  it("refuses a stale observation digest instead of settling a moved world", async () => {
    const { repo, stateDir, head } = workspace("stale");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const { workDir } = await runningAttempt(installed);
    writeCandidate(workDir, "# package\n\nfirst candidate\n");
    const readiness = (await call(installed, "palimpsest_work", { action: "readiness", taskId: "package" })) as unknown as Readiness;
    // The world moves after the decision was made.
    writeFileSync(join(workDir, "deliverables", "package.md"), "# package\n\nsecond candidate\n");
    execFileSync("git", ["add", "-A"], { cwd: workDir });
    execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=worker", "commit", "-qm", "moved"], { cwd: workDir });
    const refused = (await call(installed, "palimpsest_work", {
      action: "finalize",
      taskId: "package",
      expectedObservationDigest: readiness.observationDigest,
    })) as unknown as Finalized;
    expect(refused.state).toBe("STALE_OBSERVATION");
    expect(installed.controller.status().attempts.every((attempt) => attempt.state !== "COMPLETED")).toBe(true);
  });

  it("refuses to settle while a current input is unacknowledged, then settles after the declaration", async () => {
    const { repo, stateDir, head } = workspace("premature");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const { workDir } = await runningAttempt(installed);
    writeCandidate(workDir, "# package\n\nuses the baseline assumption\n");
    writeFileSync(join(repo, "inbox-measured.md"), "measured corridor: 700 mm\n");
    const readiness = (await call(installed, "palimpsest_work", { action: "readiness", taskId: "package" })) as unknown as Readiness;
    expect(readiness.action).toBe("SEMANTIC_JUDGEMENT");
    const refused = (await call(installed, "palimpsest_work", {
      action: "finalize",
      taskId: "package",
      expectedObservationDigest: readiness.observationDigest,
    })) as unknown as Finalized;
    expect(refused.state).toBe("NOT_READY");
    expect(refused.detail).toMatch(/current inputs arrived after/iu);
    expect(installed.controller.status().attempts.some((attempt) => attempt.state === "RUNNING")).toBe(true);

    // The principal declares it re-read the input; the SAME facts now permit the mechanical chain.
    const settled = (await call(installed, "palimpsest_work", {
      action: "finalize",
      taskId: "package",
      expectedObservationDigest: readiness.observationDigest,
      acknowledgeInputs: true,
    })) as unknown as Finalized;
    expect(settled.state).toBe("SETTLED");
    expect(installed.controller.attemptWorkRecord((settled.readiness.attempt as { attemptId?: string } | null)?.attemptId ?? "")?.state ?? "COMPLETED").toBe("COMPLETED");
  });

  it("hands the settled candidate to the existing episode conclusion with the real result commit", async () => {
    const { repo, stateDir, head } = workspace("episode");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const { workDir } = await runningAttempt(installed);
    const commit = writeCandidate(workDir, "# package\n\nall seven facts\n");
    const readiness = (await call(installed, "palimpsest_work", { action: "readiness", taskId: "package" })) as unknown as Readiness;
    await call(installed, "palimpsest_work", { action: "finalize", taskId: "package", expectedObservationDigest: readiness.observationDigest });
    const concluded = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "WAIT_FOR_OPERATOR",
      statement: "the package is settled and needs the operator's acceptance",
      artifacts: ["deliverables/package.md"],
      waitingOn: "operator promotion",
    })) as {
      state: string;
      conclusion?: { intent?: string; artifacts?: Array<{ path?: string; source?: string; commit?: string | null; digest?: string | null }> };
      episode?: { state?: string };
      session?: { mayEnd?: boolean };
    };
    expect(concluded.state).toBe("RECORDED");
    expect(concluded.conclusion?.intent).toBe("WAIT_FOR_OPERATOR");
    const artifact = (concluded.conclusion as { check?: { artifacts?: Array<{ path?: string; source?: string; commit?: string | null; digest?: string | null }> } } | undefined)?.check?.artifacts?.find((entry) => entry.path === "deliverables/package.md");
    expect(artifact?.source).toBe("RESULT_COMMIT");
    expect(artifact?.commit).toBe(commit);
    expect(artifact?.digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(concluded.session?.mayEnd).toBe(true);
  });
});

describe("ODPE-B — worker liveness is part of the outcome fact", () => {
  it("classifies an UNCONFIRMED worker exit as a semantic decision and names the legal relay", async () => {
    const { repo, stateDir, head } = workspace("unconfirmed");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const service = makeWorkDelegationService({
      controller: installed.controller,
      workerFor: () => ({
        adapterId: "odpe-unconfirmed",
        async run({ workDir }) {
          writeCandidate(workDir, "# package\n\ncommitted before the transport died\n");
          await new Promise((resolve) => setTimeout(resolve, 50));
          throw new Error("the worker transport died before any exit was observed");
        },
      }),
    });
    const surface = makeWorkSurfaces({ controller: installed.controller, workDelegation: service }).work;
    const started = await surface.startWorker({ taskId: "package" });
    expect(started.state).toBe("STARTED");
    for (let tick = 0; tick < 200; tick += 1) {
      const jobs = await service.jobs();
      if (jobs.length === 1 && jobs[0]!.phase === "HOST_ERROR") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const readiness = await surface.outcomeReadiness({ taskId: "package" });
    expect(readiness.execution?.processExit).toBe("UNCONFIRMED");
    expect(readiness.action).toBe("SEMANTIC_JUDGEMENT");
    expect(readiness.reasons.join(" ")).toMatch(/without a confirmed process exit/iu);
    const refused = await surface.finalizeOutcome({
      taskId: "package",
      expectedObservationDigest: readiness.observationDigest,
    });
    expect(refused.state).toBe("NOT_READY");

    // The legal route the readiness named really works, and it is a DECLARED recovery.
    const takeover = await surface.relay({ taskId: "package", route: "takeover", declareExecutorAbandoned: true });
    expect(takeover.state).toBe("TAKEOVER_SETTLED");
    expect(takeover.attribution?.liveness).toBe("DECLARED_ABANDONED");
    expect(takeover.attribution?.independenceEligible).toBe(false);
  });
});
