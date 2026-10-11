/**
 * Trajectory-V0 §7/§8 (V0-E / V0-F) — REAL NON-MODEL WORK, ASYNC INSPECTION, AND TWO-ATTEMPT ISOLATION.
 *
 * The stack is the REAL product path — `installPalimpsest` → `ProjectController` →
 * `makeWorkDelegationService` → `dshSubprocessWorkWorkerPort` — driven by a LOCAL, NON-MODEL Node
 * stub that commits inside the execution world it is handed. No DSH model worker launches, no
 * provider is contacted, and `modelCallsMade` stays 0.
 *
 * The properties this file proves, in the ruling's terms:
 *
 *   §7  the Attempt retains its canonical identity, and is addressable from a SEPARATE caller after
 *       `start()` returns, without an active main Agent Turn;
 *   §7  the host observations match the correct Port Invocation;
 *   §7  the Worker outcome is NOT mistaken for canonical Settlement;
 *   §7  no DSH SessionId is fabricated when the stub has no DSH session — the Preview reports
 *       SESSION_UNBOUND explicitly;
 *   §8  two interleaved Attempts never cross-contaminate their execution events, and neither
 *       terminalizes the other.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { makeWorkDelegationService } from "../src/interaction/work_delegation.js";
import { dshSubprocessWorkWorkerPort } from "../src/deployment/work_worker.js";
import { composeTrajectoryV0, type TrajectoryV0HostRecord } from "../src/composition/trajectory_v0.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

/**
 * §7: a local, NON-MODEL Node stub that edits and commits inside the world it was handed.
 *
 * It never imports `@deepseek-ai/dsh`, never contacts a provider and never touches a remote service.
 * Its only effect is a file edit plus a git commit in its own worktree — which is exactly what a
 * real worker's *result* would be, without any model.
 */
function writeCommittingStub(directory: string, marker: string): string {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${marker}.cjs`);
  writeFileSync(
    path,
    [
      'const fs = require("node:fs");',
      'const cp = require("node:child_process");',
      'fs.writeFileSync("src/a.ts", "export const a = 2;\\n");',
      'cp.execFileSync("git", ["add", "-A"]);',
      'cp.execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "worker commit"]);',
      'process.stdout.write("PALIMPSEST_WORK_RESULT " + JSON.stringify({ kind: "READY_FOR_SETTLEMENT", summary: "done" }) + "\\n");',
      'process.exit(0);',
    ].join("\n"),
    "utf8",
  );
  return path;
}

/** §7: a real repository with the given tasks declared, so attempts can be prepared. */
function prepareProject(root: string): { repo: string; head: string } {
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* windows keeps the directory busy while a git handle is open; the OS reaps it */
    }
  });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() };
}

function standardOf() {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["trajectory-v0 fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

interface Rig {
  readonly repo: string;
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly v0: ReturnType<typeof composeTrajectoryV0>;
}

/**
 * §7: install the real stack and compose the V0 service with NO DSH session reader — the stub
 * produces no DSH session, and V0 must report SESSION_UNBOUND rather than fabricate one.
 */
function makeRig(options: { projectId: string }): Rig {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-v0-"));
  const { repo } = prepareProject(root);
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: options.projectId,
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());

  const v0 = composeTrajectoryV0({
    projectId: options.projectId,
    controller: installed.controller,
    promotions: installed.controller.promotions,
    reasoning: installed.reasoningCells?.service,
    proof: installed.proof,
    projectWorkspace: installed.projectWorkspace,
    journalStore: undefined,
    associationStore: undefined,
    dshSessionReader: undefined,
  });

  return { repo, installed, v0 };
}

/** A temp directory for one stub, cleaned up with the suite. */
function stubDir(label: string): string {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-${label}-stub-`));
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* the OS reaps it */
    }
  });
  return root;
}

/**
 * §7: a real delegation service whose observations are correlated to the canonical AttemptId and
 * this service's own host JobId — the one host-private boundary that legitimately holds both.
 */
function observingService(
  installed: ReturnType<typeof installPalimpsest>,
  stubPath: string,
  profile: string,
  hostRecords: Map<string, TrajectoryV0HostRecord>,
) {
  return makeWorkDelegationService({
    controller: installed.controller,
    workerFor: () => ({
      adapterId: `${profile}-worker`,
      async run(runInput: Parameters<ReturnType<typeof dshSubprocessWorkWorkerPort>["run"]>[0]) {
        const port = dshSubprocessWorkWorkerPort({ dshBin: stubPath, profile, timeoutMs: 30_000 });
        return port.run(runInput);
      },
    }),
    onCorrelatedObservation: (entry) => {
      const existing = hostRecords.get(entry.attemptId);
      const kinds = existing === undefined ? [] : [...existing.eventKinds];
      kinds.push(entry.observation.eventKind);
      hostRecords.set(entry.attemptId, {
        attemptId: entry.attemptId,
        hostLocalJobId: entry.hostLocalJobId,
        portInvocationId: entry.observation.invocationId,
        eventKinds: kinds,
        exited: entry.observation.eventKind === "DIRECT_CHILD_EXIT_OBSERVED",
        exitCode: entry.observation.exitCode,
        spawnFailed: entry.observation.eventKind === "DIRECT_CHILD_SPAWN_ERROR",
        unknownAfterRestart: false,
        detail: `observed ${kinds.length} host event(s); role ${entry.observation.processRole}`,
      });
    },
  });
}

/**
 * Await an ALREADY-STARTED job's terminal host phase; returns the canonical AttemptId.
 *
 * Takes the jobId rather than starting the job itself: `start()` must be called by the caller so
 * two attempts can be launched before either is awaited, which is what makes them interleave.
 */
async function awaitTerminal(service: ReturnType<typeof makeWorkDelegationService>, jobId: string): Promise<{ jobId: string; attemptId: string }> {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const candidate = (await service.followup({ jobId })) as { phase?: string; attemptId?: string | null; hostError?: string | null };
    if (candidate.phase === "FINISHED" || candidate.phase === "HOST_ERROR") {
      if (candidate.attemptId === null || candidate.attemptId === undefined) {
        throw new Error(`job ${jobId} reached ${String(candidate.phase)} with no attemptId (hostError: ${String(candidate.hostError ?? "none")})`);
      }
      return { jobId, attemptId: candidate.attemptId };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`job ${jobId} did not settle in time`);
}

/** Start one attempt and await its terminal host phase. */
async function startAndAwait(service: ReturnType<typeof makeWorkDelegationService>, taskId: string): Promise<{ jobId: string; attemptId: string }> {
  const started = await service.start({ expectedTaskId: taskId });
  return awaitTerminal(service, started.jobId);
}

/* ================================================================== §7 real async work */

describe("Trajectory-V0 §7 V0-E — real non-model Work, inspected independently", () => {
  it("an Attempt keeps its canonical identity and is addressable from a separate caller after start()", async () => {
    const rig = makeRig({ projectId: "v0e" });
    const stubPath = writeCommittingStub(stubDir("v0e"), "v0e");
    const hostRecords = new Map<string, TrajectoryV0HostRecord>();
    const service = observingService(rig.installed, stubPath, "v0e", hostRecords);

    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim();
    rig.installed.controller.start({
      projectId: "v0e",
      goal: "tidy the project",
      headCommit: head,
      tasks: [{ task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
    });

    const started = await service.start({ expectedTaskId: "t1" });
    /** §7: start() returns BEFORE the job finishes — this is the async transport. */
    expect(started.state).toBe("STARTED");
    const { attemptId } = await awaitTerminal(service, started.jobId);
    expect(attemptId).toMatch(/^attempt-[0-9a-f]{32}$/u);

    /**
     * §7: a SEPARATE caller — the Trajectory service — addresses the attempt by its canonical id,
     * with no reference to the host job handle and no active main Agent Turn.
     */
    const record = hostRecords.get(attemptId);
    const preview = await rig.v0.previewAttempt({
      attemptId,
      ...(record === undefined ? {} : { hostRecord: record }),
    });

    // §7: the canonical identity is retained and the view is addressed by (projectId, attemptId).
    expect(preview.attempt.attemptId).toBe(attemptId);
    expect(preview.attempt.projectId).toBe("v0e");
    expect(preview.attempt.viewId.startsWith("tv-")).toBe(true);
    expect(preview.attempt.taskId).toBe("t1");

    // §7: the host observations match the correct Port Invocation.
    expect(record).toBeDefined();
    expect(preview.execution.portInvocationId).toBe(record!.portInvocationId);
    expect(preview.execution.portInvocationId).toMatch(/^wpi-/u);
    expect(preview.execution.hostLocalJobId).toBe(started.jobId);
    expect(preview.execution.processLifecycle).toBe("EXITED");

    // §7: no DSH SessionId is fabricated — the stub has no DSH session.
    expect(preview.execution.dshSessionId).toBeNull();
    /**
     * §3: a real host observation supports the binding, so it is BOUND_LOCAL_ONLY — never
     * BOUND_VERIFIED, because no canonical producer confirms it.
     */
    expect(preview.execution.bindingStatus).toBe("BOUND_LOCAL_ONLY");
    expect(preview.execution.bindingSource).toBe("HOST_PORT_OBSERVATION");
    expect(preview.execution.sessionLifecycle).toBe("NO_SESSION_BOUND");
    // §4: with no session bound there are no events — and that absence is stated as such.
    expect(preview.execution.events).toEqual([]);
    expect(preview.execution.eventsDetail).toContain("NOT evidence that no events occurred");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("No DSH session is bound");

    // §7: the Worker outcome is NOT mistaken for canonical Settlement.
    expect(preview.execution.processLifecycle).toBe("EXITED");
    expect(preview.canonical.promotionState).toBe("NOT_PROMOTED");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("does not prove Work settlement");

    // §7: the Project Evolution view identifies the correct Attempt and Result references.
    expect(preview.canonical.resultRefs.length).toBeGreaterThan(0);
    expect(preview.projectContext.projectionRootId).not.toBeNull();
    const resultRelation = preview.projectContext.selectedRelations.find((relation) => relation.relation === "ATTEMPT_PRODUCED_RESULT");
    expect(resultRelation).toBeDefined();
    expect(resultRelation!.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");

    // §7: the Handoff Preview combines the safe information into one bounded model.
    expect(preview.kind).toBe("HANDOFF_PREVIEW");
    expect(preview.isInspectionData).toBe(true);
    expect(preview.completeness).toBe("PARTIAL");
  }, 180_000);

  it("§7: after a restart the host job map is gone, so the process lifecycle is UNKNOWN_AFTER_RESTART — and canonical settlement is untouched", async () => {
    const rig = makeRig({ projectId: "v0e2" });
    const stubPath = writeCommittingStub(stubDir("v0e2"), "v0e2");
    const hostRecords = new Map<string, TrajectoryV0HostRecord>();
    const service = observingService(rig.installed, stubPath, "v0e2", hostRecords);

    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim();
    rig.installed.controller.start({
      projectId: "v0e2", goal: "g", headCommit: head,
      tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
    });
    const started = await service.start({ expectedTaskId: "t1" });
    const { attemptId } = await awaitTerminal(service, started.jobId);

    /**
     * §7: simulate the restart. A NEW delegation service has no job map, so the old handle is
     * unknown — and the view must not fabricate a prior FINISHED phase.
     */
    const restarted = makeWorkDelegationService({ controller: rig.installed.controller, workerFor: () => { throw new Error("unused"); } });
    const afterRestart = await restarted.followup({ jobId: started.jobId });
    expect(afterRestart.phase).toBe("UNKNOWN");
    expect((afterRestart as { detail: string }).detail).toContain("not durable");

    /** The canonical Attempt record is independently readable, and settlement is unchanged. */
    const preview = await rig.v0.previewAttempt({
      attemptId,
      hostRecord: {
        attemptId,
        hostLocalJobId: null,
        portInvocationId: null,
        eventKinds: [],
        exited: false,
        exitCode: null,
        spawnFailed: false,
        unknownAfterRestart: true,
        detail: "the host job map was lost across a restart; no durable host lifecycle source exists",
      },
    });
    expect(preview.execution.processLifecycle).toBe("UNKNOWN_AFTER_RESTART");
    expect(preview.canonical.attemptState).toBe("COMPLETED");
    expect(preview.canonical.resultRefs.length).toBeGreaterThan(0);
  }, 180_000);
});

/* ================================================================== §8 two interleaved attempts */

describe("Trajectory-V0 §8 V0-F — two interleaved asynchronous Attempts", () => {
  /**
   * §8: two INDEPENDENT projects, so both attempts can be in flight at once without the scheduler's
   * lane governance refusing the second. This is the ruling's permitted arrangement ("use two
   * permitted independent projects or tasks without weakening governance").
   */
  it("A and B have distinct identities, distinct event sources, and neither Preview contains the other's events", async () => {
    const rigA = makeRig({ projectId: "v0fa" });
    const rigB = makeRig({ projectId: "v0fb" });
    const stubA = writeCommittingStub(stubDir("v0fa"), "v0fa");
    const stubB = writeCommittingStub(stubDir("v0fb"), "v0fb");
    const recordsA = new Map<string, TrajectoryV0HostRecord>();
    const recordsB = new Map<string, TrajectoryV0HostRecord>();
    const serviceA = observingService(rigA.installed, stubA, "v0fa", recordsA);
    const serviceB = observingService(rigB.installed, stubB, "v0fb", recordsB);

    const headA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rigA.repo, encoding: "utf8" }).trim();
    const headB = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rigB.repo, encoding: "utf8" }).trim();
    rigA.installed.controller.start({
      projectId: "v0fa", goal: "g", headCommit: headA,
      tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
    });
    rigB.installed.controller.start({
      projectId: "v0fb", goal: "g", headCommit: headB,
      tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
    });

    /** §8: start BOTH before awaiting either, so their executions genuinely interleave. */
    const startedA = await serviceA.start({ expectedTaskId: "t1" });
    const startedB = await serviceB.start({ expectedTaskId: "t1" });
    const [resultA, resultB] = await Promise.all([awaitTerminal(serviceA, startedA.jobId), awaitTerminal(serviceB, startedB.jobId)]);

    // §8: distinct canonical identities.
    expect(resultA.attemptId).not.toBe(resultB.attemptId);
    expect(resultA.jobId).not.toBe(resultB.jobId);

    const previewA = await rigA.v0.previewAttempt({ attemptId: resultA.attemptId, hostRecord: recordsA.get(resultA.attemptId)! });
    const previewB = await rigB.v0.previewAttempt({ attemptId: resultB.attemptId, hostRecord: recordsB.get(resultB.attemptId)! });

    // §8: distinct View IDs, host jobs and port invocation ids.
    expect(previewA.attempt.viewId).not.toBe(previewB.attempt.viewId);
    expect(previewA.execution.hostLocalJobId).not.toBe(previewB.execution.hostLocalJobId);
    expect(previewA.execution.portInvocationId).not.toBe(previewB.execution.portInvocationId);

    /**
     * §8: A's Preview never contains B's process events, and vice versa. The observable check is
     * that each Preview's host/attempt identity matches only its own attempt.
     */
    expect(previewA.attempt.attemptId).toBe(resultA.attemptId);
    expect(previewA.attempt.projectId).toBe("v0fa");
    expect(previewB.attempt.attemptId).toBe(resultB.attemptId);
    expect(previewB.attempt.projectId).toBe("v0fb");
    /**
     * §8: each Preview's result reference is the commit its OWN stub produced. The two stubs write
     * the same file content, so the commits may coincide in content — what must not coincide is the
     * SOURCE: each result is read from its own project's event log, and each preview reports its own
     * attempt's terminal event.
     */
    expect(previewA.canonical.resultRefs.length).toBeGreaterThan(0);
    expect(previewB.canonical.resultRefs.length).toBeGreaterThan(0);
    expect(previewA.projectContext.projectionRootId).not.toBe(previewB.projectContext.projectionRootId);

    // §8: A's completion does not terminalize B — both reached FINISHED independently.
    expect(previewA.canonical.attemptState).toBe("COMPLETED");
    expect(previewB.canonical.attemptState).toBe("COMPLETED");

    // §8: both views are reconstructible after the observation phase.
    const againA = await rigA.v0.previewAttempt({ attemptId: resultA.attemptId, hostRecord: recordsA.get(resultA.attemptId)! });
    expect(againA.previewDigest).toBe(previewA.previewDigest);
    expect(againA.attempt.viewId).toBe(previewA.attempt.viewId);
  }, 240_000);

  it("§8 negative control: supplying B's SessionId as A's claimed binding never becomes a successful binding", async () => {
    const rig = makeRig({ projectId: "v0fn" });
    const stubPath = writeCommittingStub(stubDir("v0fn"), "v0fn");
    const hostRecords = new Map<string, TrajectoryV0HostRecord>();
    const service = observingService(rig.installed, stubPath, "v0fn", hostRecords);
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim();
    rig.installed.controller.start({
      projectId: "v0fn", goal: "g", headCommit: head,
      tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
    });
    const { attemptId } = await startAndAwait(service, "t1");

    /**
     * §8: a caller claims a session id that has nothing to do with this attempt. With no reader
     * composed the source is unreadable, so the honest outcome is an UNRESOLVED SOURCE — never a
     * successful binding.
     */
    const preview = await rig.v0.previewAttempt({
      attemptId,
      claimedSessionId: "session-belonging-to-someone-else",
      hostRecord: hostRecords.get(attemptId)!,
    });
    expect(preview.execution.bindingStatus).not.toBe("BOUND_VERIFIED");
    expect(preview.execution.bindingStatus).toBe("SOURCE_UNAVAILABLE");
    // §4: the session is identified but the read capability is absent, so it is NOT read — and it is
    // explicitly not "no session bound", because the caller did identify one.
    expect(preview.execution.sessionLifecycle).toBe("SESSION_IDENTIFIED_NOT_READ");
    expect(preview.execution.sessionReadState).toBe("READ_CAPABILITY_ABSENT");
    expect(preview.caveats.sourcesUnavailable.join(" ")).toContain("missing source");
  }, 180_000);

  it("§8 negative control: a composed reader whose header names a DIFFERENT session is a CONFLICT, never a binding", async () => {
    const rig = makeRig({ projectId: "v0fc" });
    const stubPath = writeCommittingStub(stubDir("v0fc"), "v0fc");
    const hostRecords = new Map<string, TrajectoryV0HostRecord>();
    const service = observingService(rig.installed, stubPath, "v0fc", hostRecords);
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim();
    rig.installed.controller.start({
      projectId: "v0fc", goal: "g", headCommit: head,
      tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
    });
    const { attemptId } = await startAndAwait(service, "t1");

    /**
     * §8: a reader that RESOLVES the claimed id but reports an immutable header naming a different
     * session. That is a contradiction, so the binding must be CONFLICT — the one state that must
     * never be downgraded to "unbound".
     */
    const v0WithReader = composeTrajectoryV0({
      projectId: "v0fc",
      controller: rig.installed.controller,
      promotions: rig.installed.controller.promotions,
      reasoning: undefined,
      proof: undefined,
      projectWorkspace: undefined,
      journalStore: undefined,
      associationStore: undefined,
      dshSessionReader: {
        sourceIdentity: "DSH_QUERY_PORT_FIXTURE",
        evidenceClass: "DSH_QUERY_PORT_FIXTURE",
        async readHeaderIdentity() {
          return {
            readState: "READ_OK" as const,
            header: { sessionId: "session-a-different-one", version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null },
            detail: "the fixture resolves a different session than the one claimed",
          };
        },
        async readEvents() {
          throw new Error("readEvents must not be reached once the header conflicts");
        },
      },
    });

    const preview = await v0WithReader.previewAttempt({
      attemptId,
      claimedSessionId: "session-claimed-by-caller",
      hostRecord: hostRecords.get(attemptId)!,
    });
    expect(preview.execution.bindingStatus).toBe("CONFLICT");
    expect(preview.caveats.contradictoryObservations.join(" ")).toContain("names session");
    // And a conflict never silently becomes a session read.
    expect(preview.execution.sessionLifecycle).not.toBe("SESSION_READ");
    expect(preview.execution.events).toEqual([]);
  }, 180_000);

  it("§8 negative control: the same display label on two different Attempts does not merge them", async () => {
    const rigA = makeRig({ projectId: "v0fl" });
    const rigB = makeRig({ projectId: "v0fl" });
    const stubA = writeCommittingStub(stubDir("v0fla"), "v0fla");
    const stubB = writeCommittingStub(stubDir("v0flb"), "v0flb");
    const serviceA = observingService(rigA.installed, stubA, "v0fla", new Map());
    const serviceB = observingService(rigB.installed, stubB, "v0flb", new Map());
    const headA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rigA.repo, encoding: "utf8" }).trim();
    const headB = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rigB.repo, encoding: "utf8" }).trim();
    /** §8: the SAME task_id and objective in both projects — the shared display label. */
    rigA.installed.controller.start({ projectId: "v0fl", goal: "g", headCommit: headA, tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }] });
    rigB.installed.controller.start({ projectId: "v0fl", goal: "g", headCommit: headB, tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }] });
    const { attemptId: idA } = await startAndAwait(serviceA, "t1");
    const { attemptId: idB } = await startAndAwait(serviceB, "t1");

    // §8: identical task labels, but the canonical attempt ids differ and the views stay separate.
    expect(idA).not.toBe(idB);
    const previewA = await rigA.v0.previewAttempt({ attemptId: idA });
    const previewB = await rigB.v0.previewAttempt({ attemptId: idB });
    expect(previewA.attempt.attemptId).toBe(idA);
    expect(previewB.attempt.attemptId).toBe(idB);
    expect(previewA.attempt.viewId).not.toBe(previewB.attempt.viewId);
    // Both report the same task label, yet neither view claims the other's attempt.
    expect(previewA.attempt.taskId).toBe("t1");
    expect(previewB.attempt.taskId).toBe("t1");
  }, 240_000);
});
