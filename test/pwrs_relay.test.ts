/**
 * PWRS-A/B/C — work relay, retained-work reuse and asset-grounded episode convergence.
 *
 * These are deterministic qualifications of the PRODUCT mechanics, not observations of model
 * behaviour. The fixture drives real attempts through the real Work path in isolated worlds and
 * checks what the product records: which execution window it observed, what a successor may reuse,
 * and whether an episode points at the candidate that actually exists.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";
import { makeWorkDelegationService } from "../src/interaction/work_delegation.js";
import { EXECUTION_RELAY_MARKER, parseExecutionRelay, relayAvailability, attributeSettlement, makeExecutionInvocationLedger } from "../src/work/execution_relay.js";
import { buildPulseEpisode, evaluateEpisodeReadiness } from "../src/project_continuity/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope and leave the required artifact",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PWRS fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(name: string): { root: string; repo: string; stateDir: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-pwrs-${name}-`));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "deliverables"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# PWRS base\n");
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
    {
      projectId: "pwrs",
      repository: repo,
      stateDir,
      execution: "worktree",
      standard,
      // `expert` exposes the legacy mechanical chain (`next`/`claim`/`report`) AND the product
      // facade, so the fixture can drive a real world while exercising `palimpsest_work`.
      toolProfile: "expert",
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
    task_id: "package",
    objective: "Produce the deployment package.",
    depends_on: [],
    write_paths: ["deliverables"],
    required_artifacts: ["deliverables/package.md"],
  },
];

async function start(installed: ReturnType<typeof install>, head: string): Promise<void> {
  await call(installed, "palimpsest_start", {
    projectId: "pwrs",
    goal: "produce and defend a deployment package",
    headCommit: head,
    tasks: TASKS,
  });
}

/** Drive a REAL attempt to RUNNING in its own world and return its identity. */
async function runningAttempt(installed: ReturnType<typeof install>): Promise<{ attemptId: string; workDir: string }> {
  await call(installed, "palimpsest_next", {});
  const created = (await call(installed, "palimpsest_next", {})) as { entityId?: string };
  const attemptId = String(created.entityId);
  await call(installed, "palimpsest_claim", { attemptId });
  const observed = installed.controller.observeAttemptResult(attemptId);
  if (observed === null) throw new Error("the claimed attempt has no observable world");
  return { attemptId, workDir: observed.workDir };
}

function commitAll(workDir: string, message: string): string {
  execFileSync("git", ["add", "-A"], { cwd: workDir });
  execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=worker", "commit", "-qm", message], { cwd: workDir });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workDir }).toString().trim();
}

/** Write the task's required artifact INSIDE its world (git does not track the empty directory). */
function writeCandidate(workDir: string, content: string): void {
  mkdirSync(join(workDir, "deliverables"), { recursive: true });
  writeFileSync(join(workDir, "deliverables", "package.md"), content);
}

type RelayResult = {
  state: string;
  taskId: string;
  route: string;
  attemptId: string | null;
  detail: string;
  resultCommit: string | null;
  attribution: { attribution: string; executor: string; settledBy: string; independenceEligible: boolean; liveness: string } | null;
  retainedWorldPath: string | null;
  reuse: { unaffectedPaths: string[]; conflictedPaths: string[]; alreadyPresentPaths: string[] } | null;
  taskState: string | null;
};

describe("PWRS-A attribution is an observed window, never a claim", () => {
  const base = "a".repeat(40);
  const head = "b".repeat(40);

  it("attributes the settled tree to the invocation that ended on it", () => {
    const ledger = makeExecutionInvocationLedger({ now: () => "2026-11-05T00:00:00Z" });
    const first = ledger.begin({ attemptId: "attempt-1", taskId: "t", headAtStart: base });
    ledger.end(first.invocationId, { headAtEnd: head, outcome: "ENDED" });
    const attribution = attributeSettlement({
      invocations: ledger.list("attempt-1"),
      observation: { path: "PRINCIPAL" },
      settledHead: head,
    });
    expect(attribution.attribution).toBe("ORIGINAL_WORKER_OBSERVED");
    expect(attribution.executor).toBe("ORIGINAL_WORKER");
    expect(attribution.settledBy).toBe("PRINCIPAL");
    expect(attribution.independenceEligible).toBe(true);
  });

  it("does not credit a worker when the world moved after the invocation ended", () => {
    const ledger = makeExecutionInvocationLedger({ now: () => "2026-11-05T00:00:00Z" });
    const first = ledger.begin({ attemptId: "attempt-2", taskId: "t", headAtStart: base });
    ledger.end(first.invocationId, { headAtEnd: base, outcome: "ENDED" });
    const attribution = attributeSettlement({
      invocations: ledger.list("attempt-2"),
      observation: { path: "PRINCIPAL" },
      settledHead: head,
    });
    expect(attribution.attribution).toBe("MULTI_EXECUTOR");
    expect(attribution.independenceEligible).toBe(false);
  });

  it("records a principal continuation as DECLARED recovery, never as worker production", () => {
    const attribution = attributeSettlement({
      invocations: [],
      observation: {
        path: "PRINCIPAL",
        takeover: { declaredAt: "2026-11-05T00:00:00Z", declaredBy: "PRINCIPAL", livenessBasis: "DECLARED_ABANDONED" },
      },
      settledHead: head,
    });
    expect(attribution.attribution).toBe("PRINCIPAL_RECOVERY");
    expect(attribution.executor).toBe("PRINCIPAL");
    expect(attribution.evidence).toBe("DECLARED");
    expect(attribution.independenceEligible).toBe(false);
  });

  it("leaves a result with no observed writer UNATTRIBUTED rather than guessing", () => {
    const attribution = attributeSettlement({ invocations: [], observation: { path: "PRINCIPAL" }, settledHead: head });
    expect(attribution.attribution).toBe("UNATTRIBUTED");
    expect(attribution.executor).toBe("UNKNOWN");
  });

  it("refuses a same-world takeover while an invocation is open, and allows a successor only after it ends", () => {
    const ledger = makeExecutionInvocationLedger({ now: () => "2026-11-05T00:00:00Z" });
    ledger.begin({ attemptId: "attempt-3", taskId: "t", headAtStart: base });
    const running = relayAvailability({ attemptId: "attempt-3", attemptState: "RUNNING", hostJobActive: true, invocations: ledger.list("attempt-3") });
    expect(running.routes.find((route) => route.route === "TAKEOVER")?.available).toBe(false);
    expect(running.routes.find((route) => route.route === "SUCCESSOR")?.available).toBe(false);

    const unconfirmed = relayAvailability({
      attemptId: "attempt-4",
      attemptState: "RUNNING",
      hostJobActive: false,
      invocations: [],
    });
    expect(unconfirmed.routes.find((route) => route.route === "TAKEOVER")?.requiresDeclaration).toBe(true);
    expect(unconfirmed.routes.find((route) => route.route === "SUCCESSOR")?.available).toBe(true);
  });
});

describe("PWRS-C episode currentness follows the real artifact", () => {
  const basis = { projectRevision: 1, projectDigest: "d".repeat(64), headCommit: "c".repeat(40) };
  const readiness = evaluateEpisodeReadiness({
    tasks: [],
    attempts: [],
    awaitingOperator: [],
    unresolvedQuestions: [],
    blockedEffects: [],
    negativeFindingRefs: [],
    mechanicalActions: [],
  });
  const conclusion = {
    schema: "pc1-episode-conclusion/v1" as const,
    conclusionId: "episode-test",
    intent: "DELIVER" as const,
    statement: "delivered",
    artifacts: ["deliverables/package.md"],
    waitingOn: null,
    nextStep: null,
    evidenceRefs: [],
    recordedAt: "2026-11-05T00:00:00Z",
    basis,
    check: {
      deliveryBlockers: [],
      awaitingOperator: [],
      openTasks: [],
      openAttempts: [],
      unresolvedQuestions: [],
      blockedEffects: [],
      artifacts: [
        { path: "deliverables/package.md", present: true, tracked: true, committed: true, digest: "a".repeat(64), source: "WORKTREE" as const, commit: null, detail: "committed at HEAD" },
      ],
    },
  };
  const journal = (body: string) => [
    { entryId: "e1", kind: "REFERENCE_NOTE", title: "Episode conclusion: DELIVER", body: `<!-- pc1-episode-conclusion:v1 -->${JSON.stringify(conclusion)}` },
    { entryId: "e2", kind: "REFERENCE_NOTE", title: body, body },
  ];

  it("reopens a DELIVER when the artifact bytes changed but project revision and HEAD did not", () => {
    const episode = buildPulseEpisode({
      entries: journal("unrelated"),
      readiness,
      basis,
      artifactStatesNow: [
        { path: "deliverables/package.md", present: true, tracked: true, committed: true, digest: "b".repeat(64), source: "WORKTREE", commit: null, detail: "committed at HEAD" },
      ],
      basisRelevant: () => false,
    });
    expect(episode.state).toBe("REOPENED");
    expect(episode.changedSince.join(" ")).toMatch(/changed content/iu);
  });

  it("does not reopen for a bookkeeping record the caller marks irrelevant, and stays current otherwise", () => {
    const episode = buildPulseEpisode({
      entries: journal("routine bookkeeping"),
      readiness,
      basis,
      artifactStatesNow: [
        { path: "deliverables/package.md", present: true, tracked: true, committed: true, digest: "a".repeat(64), source: "WORKTREE", commit: null, detail: "committed at HEAD" },
      ],
      basisRelevant: () => false,
    });
    expect(episode.state).toBe("DELIVERED");
    expect(episode.current).toBe(true);
  });
});

describe("PWRS real Work paths", () => {
  it("names a governed candidate in its result commit instead of reporting it absent", async () => {
    const { repo, head, stateDir } = workspace("candidate");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const { attemptId, workDir } = await runningAttempt(installed);
    writeCandidate(workDir, "# Candidate\n\nA governed candidate package.\n");
    const candidate = commitAll(workDir, "candidate package");
    await call(installed, "palimpsest_report", { attemptId, workerStatus: "completed", summary: "candidate ready" });
    await call(installed, "palimpsest_next", {});

    // The canonical worktree does NOT hold the candidate — it exists only as the attempt's result.
    expect(existsSync(join(repo, "deliverables", "package.md"))).toBe(false);

    const concluded = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "WAIT_FOR_OPERATOR",
      statement: "The governed candidate is complete and awaits operator acceptance.",
      waitingOn: "operator acceptance of the candidate package",
      artifacts: ["deliverables/package.md"],
    })) as unknown as {
      state: string;
      warnings?: string[];
      conclusion: { check?: { artifacts?: Array<{ present: boolean; tracked: boolean; committed: boolean; source?: string; commit?: string | null; digest?: string | null }> } } | null;
      episode: { state: string } | null;
    };
    expect(concluded.state).toBe("RECORDED");
    expect(concluded.warnings ?? []).toEqual([]);
    const artifact = concluded.conclusion?.check?.artifacts?.[0];
    expect(artifact).toMatchObject({ present: true, tracked: true, committed: true, source: "RESULT_COMMIT" });
    expect(artifact?.commit?.slice(0, 7)).toBe(candidate.slice(0, 7));
    expect(artifact?.digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(concluded.episode?.state).toBe("AWAITING_OPERATOR");
  });

  it("refuses a second writer into a world no host observed, then continues in a NEW world with reuse facts", async () => {
    const { repo, head, stateDir } = workspace("successor");
    const first = install(repo, stateDir);
    await start(first, head);
    const { attemptId, workDir } = await runningAttempt(first);
    writeCandidate(workDir, "# Partial\n\nPartial package from the abandoned worker.\n");
    commitAll(workDir, "partial package");
    const oldWorld = workDir;
    first.dispose();

    const second = install(repo, stateDir);
    // A new host that never observed the attempt refuses to point a second worker at its world.
    const delegation = makeWorkDelegationService({
      controller: second.controller,
      workerFor: () => ({ adapterId: "test-fixture", run: async () => ({ kind: "READY_FOR_SETTLEMENT" as const }) }),
    });
    await expect(delegation.start({ expectedTaskId: "package" })).rejects.toThrow(/EXECUTOR_LIVENESS_UNKNOWN/u);

    const successor = (await call(second, "palimpsest_work", { action: "relay", taskId: "package", relayRoute: "successor" })) as unknown as RelayResult;
    expect(successor.state).toBe("SUCCESSOR_READY");
    expect(successor.retainedWorldPath).toBe(oldWorld);
    expect(successor.reuse?.unaffectedPaths).toContain("deliverables/package.md");
    expect(successor.taskState).toBe("READY");
    expect(existsSync(oldWorld)).toBe(true);

    const next = await runningAttempt(second);
    expect(next.attemptId).not.toBe(attemptId);
    expect(next.workDir).not.toBe(oldWorld);
    expect(existsSync(oldWorld)).toBe(true);
  });

  it("records an observed-exit takeover as worker production settled by the principal", async () => {
    const { repo, head, stateDir } = workspace("takeover-observed");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const { attemptId, workDir } = await runningAttempt(installed);
    writeCandidate(workDir, "# Package\n\nWorker-produced package.\n");
    commitAll(workDir, "worker package");

    // The transport's own observation: the invocation started at the base and ended on this head.
    const invocation = installed.controller.executionInvocations.begin({
      attemptId,
      taskId: "package",
      headAtStart: head,
    });
    installed.controller.executionInvocations.end(invocation.invocationId, {
      headAtEnd: execFileSync("git", ["rev-parse", "HEAD"], { cwd: workDir }).toString().trim(),
      outcome: "ENDED",
    });

    const takeover = (await call(installed, "palimpsest_work", { action: "relay", taskId: "package", relayRoute: "takeover" })) as unknown as RelayResult;
    expect(takeover.state).toBe("TAKEOVER_SETTLED");
    expect(takeover.attribution).toMatchObject({
      attribution: "ORIGINAL_WORKER_OBSERVED",
      executor: "ORIGINAL_WORKER",
      settledBy: "PRINCIPAL",
      independenceEligible: true,
      liveness: "OBSERVED_EXIT",
    });

    const journal = await installed.application.projectWorkspace!.journal();
    const record = journal.map((entry) => parseExecutionRelay(entry.entry.body)).find((entry) => entry !== null);
    expect(record?.attribution.attribution).toBe("ORIGINAL_WORKER_OBSERVED");
    const pulse = (await call(installed, "palimpsest_continuity", { action: "pulse" })) as unknown as {
      execution: { attempts: Array<{ relay?: { attribution: string; independenceEligible: boolean } | null }> };
    };
    expect(pulse.execution.attempts.some((attempt) => attempt.relay?.attribution === "ORIGINAL_WORKER_OBSERVED")).toBe(true);
  });

  it("records a principal-written candidate as DECLARED recovery, not as worker output", async () => {
    const { repo, head, stateDir } = workspace("takeover-declared");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const { attemptId, workDir } = await runningAttempt(installed);
    // The principal recovers the abandoned world and writes the candidate itself.
    writeCandidate(workDir, "# Recovered\n\nPrincipal-recovered package.\n");
    commitAll(workDir, "principal recovery package");

    const refused = (await call(installed, "palimpsest_work", {
      action: "relay",
      taskId: "package",
      relayRoute: "takeover",
    })) as unknown as RelayResult;
    // No invocation was ever observed, so a takeover needs the explicit declaration.
    expect(refused.state).toBe("REFUSED");
    expect(refused.detail).toMatch(/declar/i);

    const takeover = (await call(installed, "palimpsest_work", {
      action: "relay",
      taskId: "package",
      relayRoute: "takeover",
      declareExecutorAbandoned: true,
    })) as unknown as RelayResult;
    expect(takeover.state).toBe("TAKEOVER_SETTLED");
    expect(takeover.attribution).toMatchObject({
      attribution: "PRINCIPAL_RECOVERY",
      executor: "PRINCIPAL",
      settledBy: "PRINCIPAL",
      independenceEligible: false,
      liveness: "DECLARED_ABANDONED",
    });
    const journal = await installed.application.projectWorkspace!.journal();
    const body = journal.map((entry) => entry.entry.body).find((text) => text.includes(EXECUTION_RELAY_MARKER));
    expect(body).toBeDefined();
    expect(parseExecutionRelay(body!)?.attribution.attribution).toBe("PRINCIPAL_RECOVERY");
  });

  it("refuses any settlement while this host still observes the invocation as OPEN", async () => {
    const { repo, head, stateDir } = workspace("open-invocation");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const { attemptId, workDir } = await runningAttempt(installed);
    writeCandidate(workDir, "# Package\n\nStill being written.\n");
    commitAll(workDir, "in-flight package");
    installed.controller.executionInvocations.begin({ attemptId, taskId: "package", headAtStart: head });

    const complete = (await call(installed, "palimpsest_work", { action: "complete", taskId: "package" })) as unknown as { state: string; detail: string };
    expect(complete.state).toBe("NOT_READY");
    expect(complete.detail).toMatch(/WORKER_STILL_RUNNING|OPEN/u);

    const relay = (await call(installed, "palimpsest_work", { action: "relay", taskId: "package", relayRoute: "takeover", declareExecutorAbandoned: true })) as unknown as RelayResult;
    expect(relay.state).toBe("REFUSED");
  });
});
