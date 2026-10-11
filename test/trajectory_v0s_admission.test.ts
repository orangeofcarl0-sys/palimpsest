/**
 * Trajectory-V0S §4–§8 (S1-A … S1-E) — THE ATTEMPT-SCOPED ADMISSION CONTRACT.
 *
 * The corrected consumer rules, proven against the REAL product stack (a local non-model Work stub
 * through `installPalimpsest` → `makeWorkDelegationService` → `dshSubprocessWorkWorkerPort`):
 *
 *   S1-A  a Work Attempt is verified against its canonical history BEFORE any execution source is read;
 *   S1-B  host observation provenance, session binding and read admission are three separate facts;
 *   S1-C  no Attempt-scoped consumer can read an arbitrary Session by id;
 *   S1-D  Work relations are selected by exact canonical identity, never a display label;
 *   S1-E  Handoff completeness and the timeout/abort/exit chronology are not overstated.
 *
 * Evidence class: PASS_REAL_OWNER_NONMODEL (the Work half is the real product stack). The session
 * halves are labelled fixtures where no real session could produce the case on demand.
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
import {
  AttemptAdmissionRefusal,
  classifyHostObservation,
  classifySessionBinding,
  DSH_PAGE_DOES_NOT_PROVE,
  HOST_OBSERVATION_PROVENANCE_STATES,
  PROCESS_LIFECYCLE_STATES,
  SESSION_BINDING_STATES,
  SESSION_READ_ADMISSION_STATES,
  validateReadRequest,
  type DshSessionEventPage,
  type DshSessionReadPort,
} from "../src/trajectory/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

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

interface Rig {
  readonly repo: string;
  readonly installed: ReturnType<typeof installPalimpsest>;
}

function makeRig(projectId: string): Rig {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-v0s-"));
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
      /* windows keeps the directory busy; the OS reaps it */
    }
  });
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId,
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: Object.freeze({
        statement: "tests pass and scope respected",
        clauses: Object.freeze([
          Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
          Object.freeze({ kind: "scope_respected" as const }),
        ]),
        derivedFrom: Object.freeze(["trajectory-v0s fixture"]),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  return { repo, installed };
}

/** §4: run one real non-model attempt, returning its canonical id and host record. */
async function runAttempt(rig: Rig, projectId: string, marker: string): Promise<{ attemptId: string; hostRecord: TrajectoryV0HostRecord; jobId: string }> {
  const stubRoot = mkdtempSync(join(tmpdir(), `palimpsest-${marker}-`));
  cleanups.push(() => {
    try {
      rmSync(stubRoot, { recursive: true, force: true });
    } catch {
      /* the OS reaps it */
    }
  });
  const stubPath = writeCommittingStub(stubRoot, marker);
  const hostRecords = new Map<string, TrajectoryV0HostRecord>();
  const service = makeWorkDelegationService({
    controller: rig.installed.controller,
    workerFor: () => ({
      adapterId: `${marker}-worker`,
      async run(runInput: Parameters<ReturnType<typeof dshSubprocessWorkWorkerPort>["run"]>[0]) {
        const port = dshSubprocessWorkWorkerPort({ dshBin: stubPath, profile: marker, timeoutMs: 30_000 });
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
        detail: `observed ${kinds.length} host event(s)`,
      });
    },
  });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim();
  rig.installed.controller.start({
    projectId, goal: "g", headCommit: head,
    tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
  });
  const started = await service.start({ expectedTaskId: "t1" });
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const candidate = (await service.followup({ jobId: started.jobId })) as { phase?: string; attemptId?: string | null; hostError?: string | null };
    if (candidate.phase === "FINISHED" || candidate.phase === "HOST_ERROR") {
      if (candidate.attemptId === null || candidate.attemptId === undefined) throw new Error("no attemptId");
      return { attemptId: candidate.attemptId, hostRecord: hostRecords.get(candidate.attemptId)!, jobId: started.jobId };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job did not settle");
}

/** §6: a counting reader proves a refused Attempt invokes ZERO read-port methods. */
function countingReader(): { readonly port: DshSessionReadPort; readonly calls: () => number } {  let calls = 0;
  return {
    calls: () => calls,
    port: {
      sourceIdentity: "counting-fixture",
      evidenceClass: "DSH_QUERY_PORT_FIXTURE",
      async readEvents() {
        calls += 1;
        throw new Error("readEvents must not be reached");
      },
      async readHeaderIdentity() {
        calls += 1;
        throw new Error("readHeaderIdentity must not be reached");
      },
    },
  };
}

/** §5: a labelled fixture page, complete enough that no required field is inherited by accident. */
function fixturePage(sessionId: string, overrides: Partial<DshSessionEventPage> = {}): DshSessionEventPage {
  return Object.freeze({
    schemaVersion: 1 as const,
    readState: "READ_OK" as const,
    sessionId,
    header: Object.freeze({ sessionId, version: 4, createdAt: 1_700_000_000_000, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }),
    sourceIdentity: "DSH_QUERY_PORT_FIXTURE",
    sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
    throughSeq: 1,
    knownEventCount: 2,
    inheritedEventCount: 0,
    requestedFromSeq: 0,
    requestedMaxEvents: 50,
    returnedCount: 2,
    pageBounded: true as const,
    diskIoBounded: false,
    durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const,
    persistedEventCount: 2,
    syntheticRecoveryEventCount: 0,
    events: Object.freeze([
      Object.freeze({ sessionId, seq: 0, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT" as const, time: 1, surface: null, summary: "turn 1 opened", durationMs: null, observedStatus: null }),
      Object.freeze({ sessionId, seq: 1, type: "turn/end", inherited: false, durability: "PERSISTED_DSH_EVENT" as const, time: 2, surface: null, summary: "turn 1 closed", durationMs: null, observedStatus: "completed" }),
    ]),
    knownParentSession: null,
    proves: Object.freeze(["fixture"]),
    doesNotProve: DSH_PAGE_DOES_NOT_PROVE,
    detail: "a labelled fixture page",
    ...overrides,
  });
}

/** §5: a reader whose header resolves the claimed id and returns a page. */
function agreeingReader(sessionId: string): DshSessionReadPort {
  return {
    sourceIdentity: "DSH_QUERY_PORT_FIXTURE",
    evidenceClass: "DSH_QUERY_PORT_FIXTURE",
    async readEvents() {
      return fixturePage(sessionId);
    },
    async readHeaderIdentity(id) {
      return { readState: "READ_OK" as const, header: { sessionId: id, version: 4, createdAt: 1_700_000_000_000, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "the fixture header agrees" };
    },
  };
}

/* ================================================================== S1-A */

describe("Trajectory-V0S §4 S1-A — exact Work Attempt admission", () => {
  it("S1-A1: an attempt id that exists nowhere is ATTEMPT_NOT_FOUND, before any read", async () => {
    const rig = makeRig("v0sa1");
    await runAttempt(rig, "v0sa1", "v0sa1");
    const counting = countingReader();
    const v0 = composeTrajectoryV0({
      projectId: "v0sa1", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: counting.port,
    });
    await expect(v0.previewAttempt({ attemptId: `attempt-${"1".repeat(32)}`, claimedSessionId: "session-x" }))
      .rejects.toMatchObject({ code: "ATTEMPT_NOT_FOUND" });
    expect(counting.calls()).toBe(0);
  }, 180_000);

  it("S1-A2/A5: an attempt belonging to another project is refused, and no session is read", async () => {
    /**
     * §4 S1-A2/A5: an attempt that belongs to a different project must be refused before any
     * execution source is touched, and a readable session offered alongside it must not rescue it.
     *
     * MEASURED PRODUCT BEHAVIOUR: a Palimpsest controller is scoped to ONE project and reads only
     * that project's events, so a foreign attempt is not merely rejected — it is INVISIBLE through
     * this route, and the refusal is `ATTEMPT_NOT_FOUND`. The `FOREIGN_ATTEMPT` branch in
     * `admitAttempt` is a defensive distinction for a store that holds several projects; it is not
     * reachable through a single-project controller. The assertion requires the properties that
     * actually matter: a typed refusal, and ZERO read-port calls.
     */
    const rig = makeRig("v0sa2a");
    await runAttempt(rig, "v0sa2a", "v0sa2a");
    const foreignAttemptId = `attempt-${"5".repeat(32)}`;

    const counting = countingReader();
    const v0 = composeTrajectoryV0({
      projectId: "v0sa2a", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: counting.port,
    });
    let refusalCode: string | undefined;
    try {
      await v0.previewAttempt({ attemptId: foreignAttemptId, claimedSessionId: "session-readable" });
    } catch (error) {
      refusalCode = (error as AttemptAdmissionRefusal).code;
    }
    expect(refusalCode).toBe("ATTEMPT_NOT_FOUND");
    // §4 S1-A6: the refusal happened before any execution source was touched.
    expect(counting.calls()).toBe(0);
  }, 300_000);

  it("S1-A3: a valid task id does not admit a different attempt id", async () => {
    const rig = makeRig("v0sa3");
    const { attemptId } = await runAttempt(rig, "v0sa3", "v0sa3");
    const v0 = composeTrajectoryV0({
      projectId: "v0sa3", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    // The real attempt is admitted; a different id naming the same task is not.
    const admitted = await v0.previewAttempt({ attemptId });
    expect(admitted.attempt.taskId).toBe("t1");
    await expect(v0.previewAttempt({ attemptId: `attempt-${"2".repeat(32)}` })).rejects.toMatchObject({ code: "ATTEMPT_NOT_FOUND" });
  }, 180_000);

  it("S1-A4: the refusal is a typed, machine-readable error, not a generic throw", async () => {
    const rig = makeRig("v0sa4");
    await runAttempt(rig, "v0sa4", "v0sa4");
    const v0 = composeTrajectoryV0({
      projectId: "v0sa4", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    let caught: unknown;
    try {
      await v0.previewAttempt({ attemptId: `attempt-${"3".repeat(32)}` });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AttemptAdmissionRefusal);
    expect((caught as AttemptAdmissionRefusal).code).toBe("ATTEMPT_NOT_FOUND");
    // The kind is in the message too, so a caller seeing only `message` still learns the reason.
    expect((caught as Error).message).toContain("ATTEMPT_NOT_FOUND");
  }, 180_000);

  it("S1-A6: a canonical attempt is admitted and reports its own exact identity", async () => {
    const rig = makeRig("v0sa6");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0sa6", "v0sa6");
    const v0 = composeTrajectoryV0({
      projectId: "v0sa6", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({ attemptId, hostRecord });
    expect(preview.attempt.attemptId).toBe(attemptId);
    expect(preview.attempt.projectId).toBe("v0sa6");
    expect(preview.attempt.taskId).toBe("t1");
    // The canonical facts are read from this attempt's OWN events.
    expect(preview.canonical.attemptState).toBe("COMPLETED");
    expect(preview.canonical.resultRefs.length).toBeGreaterThan(0);
  }, 180_000);
});

/* ================================================================== S1-B */

describe("Trajectory-V0S §5 S1-B — host observation and session binding are separate facts", () => {
  it("S1-B1: a real host observation with NO session is LOCAL_PORT_OBSERVATION + SESSION_UNBOUND", async () => {
    const rig = makeRig("v0sb1");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0sb1", "v0sb1");
    const v0 = composeTrajectoryV0({
      projectId: "v0sb1", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({ attemptId, hostRecord });
    // §5: the host observed a real direct child...
    expect(preview.execution.hostObservationProvenance).toBe("LOCAL_PORT_OBSERVATION");
    expect(preview.execution.hostLocalJobId).toBe(hostRecord.hostLocalJobId);
    expect(preview.execution.portInvocationId).toBe(hostRecord.portInvocationId);
    // ...and there is still NO session. The two facts do not merge.
    expect(preview.execution.sessionBindingStatus).toBe("SESSION_UNBOUND");
    expect(preview.execution.sessionReadAdmission).toBe("NOT_REQUESTED");
    expect(preview.execution.sessionLifecycle).toBe("NO_SESSION_BOUND");
    expect(preview.execution.dshSessionId).toBeNull();
    expect(preview.attribution.processObservation).toBe("COMPLETE");
    expect(preview.attribution.sessionAttribution).toBe("NO_SESSION");
  }, 180_000);

  it("S1-B2: a caller-claimed unrelated readable session admits NO events", async () => {
    const rig = makeRig("v0sb2");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0sb2", "v0sb2");
    const v0 = composeTrajectoryV0({
      projectId: "v0sb2", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: agreeingReader("session-unrelated"),
    });
    const preview = await v0.previewAttempt({ attemptId, claimedSessionId: "session-unrelated", hostRecord });
    expect(preview.execution.sessionBindingStatus).toBe("SESSION_CLAIMED_UNVERIFIED");
    expect(preview.execution.dshSessionId).toBeNull();
    expect(preview.execution.claimedSessionId).toBe("session-unrelated");
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (H0 C3)
     *
     * V0S asserted `sessionReadAdmission === NOT_ADMITTED_TO_ATTEMPT` and
     * `sessionLifecycle === SESSION_READ_NOT_ATTRIBUTED`, because V0S still READ the claimed session and
     * then declined to admit it. H0 §7 goes further: the ordinary Attempt Preview performs NO read at
     * all, so the honest admission is `NOT_REQUESTED` and the lifecycle is `SESSION_IDENTIFIED_NOT_READ`.
     * The assertion that matters — no events enter the attempt — is retained and strengthened.
     */
    expect(preview.execution.sessionReadAdmission).toBe("NOT_REQUESTED");
    expect(preview.execution.sessionReadState).toBeNull();
    expect(preview.execution.events).toEqual([]);
    expect(preview.execution.sessionLifecycle).toBe("SESSION_IDENTIFIED_NOT_READ");
    expect(preview.completeness).not.toBe("COMPLETE");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("UNVERIFIED");
  }, 180_000);

  it("S1-B3: a host record for another attempt is HOST_RECORD_CONFLICT", async () => {
    const rig = makeRig("v0sb3");
    const { attemptId } = await runAttempt(rig, "v0sb3", "v0sb3");
    const v0 = composeTrajectoryV0({
      projectId: "v0sb3", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    await expect(
      v0.previewAttempt({
        attemptId,
        hostRecord: { attemptId: `attempt-${"7".repeat(32)}`, hostLocalJobId: "wdj-b", portInvocationId: "wpi-b", eventKinds: ["DIRECT_CHILD_EXIT_OBSERVED"], exited: true, exitCode: 0, spawnFailed: false, unknownAfterRestart: false, detail: "another attempt" },
      }),
    ).rejects.toMatchObject({ code: "HOST_RECORD_CONFLICT" });
  }, 180_000);

  it("S1-B4/B5: a matching host record cannot mint BOUND_VERIFIED, and a self-declared trust flag changes nothing", () => {
    /**
     * §5: `classifySessionBinding` has no host input at all, which is the structural reason a host
     * observation cannot raise a binding. The "trusted" claim lives on a reader's own record and is
     * not consulted by the classifier.
     */
    const withHostOnly = classifySessionBinding({ claimedSessionId: null, canonicalBindingPresent: false, candidateCount: 0, sourceReadable: true, conflictDetail: null });
    expect(withHostOnly.state).toBe("SESSION_UNBOUND");
    const claimed = classifySessionBinding({ claimedSessionId: "session-x", canonicalBindingPresent: false, candidateCount: 1, sourceReadable: true, conflictDetail: null });
    expect(claimed.state).toBe("SESSION_CLAIMED_UNVERIFIED");
    expect(claimed.state).not.toBe("BOUND_VERIFIED");
    // Only a canonical producer reaches BOUND_VERIFIED.
    expect(classifySessionBinding({ claimedSessionId: "session-x", canonicalBindingPresent: true, candidateCount: 1, sourceReadable: true, conflictDetail: null }).state).toBe("BOUND_VERIFIED");
    // §5: the vocabularies are the ruled sets.
    expect([...SESSION_BINDING_STATES]).toContain("SESSION_CLAIMED_UNVERIFIED");
    expect([...SESSION_READ_ADMISSION_STATES]).toContain("NOT_ADMITTED_TO_ATTEMPT");
    expect([...HOST_OBSERVATION_PROVENANCE_STATES]).toContain("LOCAL_PORT_OBSERVATION");
  });

  it("S1-B6: a real spawn/exit without Work settlement does not assert canonical completion", async () => {
    const rig = makeRig("v0sb6");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0sb6", "v0sb6");
    const v0 = composeTrajectoryV0({
      projectId: "v0sb6", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({ attemptId, hostRecord });
    // The process exited, and promotion/verification remain the owner's facts.
    expect(preview.execution.processLifecycle).toBe("EXITED");
    expect(preview.canonical.promotionState).toBe("NOT_PROMOTED");
    expect(preview.canonical.verificationState).toBe("NOT_OBSERVED_BY_V0");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("does not prove Work settlement");
  }, 180_000);

  it("S1-B7: a lost host job after restart is UNKNOWN_AFTER_RESTART and changes no canonical history", async () => {
    const rig = makeRig("v0sb7");
    const { attemptId } = await runAttempt(rig, "v0sb7", "v0sb7");
    const v0 = composeTrajectoryV0({
      projectId: "v0sb7", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({
      attemptId,
      hostRecord: { attemptId, hostLocalJobId: null, portInvocationId: null, eventKinds: [], exited: false, exitCode: null, spawnFailed: false, unknownAfterRestart: true, detail: "the host job map was lost" },
    });
    expect(preview.execution.processLifecycle).toBe("UNKNOWN_AFTER_RESTART");
    expect(preview.canonical.attemptState).toBe("COMPLETED");
  }, 180_000);

  it("S1-B8: a missing session is NOT evidence of zero tool calls", async () => {
    const rig = makeRig("v0sb8");
    const { attemptId } = await runAttempt(rig, "v0sb8", "v0sb8");
    const v0 = composeTrajectoryV0({
      projectId: "v0sb8", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({ attemptId });
    expect(preview.execution.events).toEqual([]);
    // §5: the absence is stated as an absent SOURCE, never as a claim about what happened.
    expect(preview.execution.eventsDetail).toContain("NOT evidence that no events occurred");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("no tool was called");
    expect(DSH_PAGE_DOES_NOT_PROVE.join(" ")).toContain("no tool was called");
  }, 180_000);
});

/* ================================================================== S1-C */

describe("Trajectory-V0S §6 S1-C — the arbitrary Session read surface is closed", () => {
  it("S1-C1/C6: the Attempt-scoped service exposes NO unrestricted session read or list", async () => {
    const rig = makeRig("v0sc1");
    await runAttempt(rig, "v0sc1", "v0sc1");
    const v0 = composeTrajectoryV0({
      projectId: "v0sc1", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: agreeingReader("session-arbitrary"),
    });
    /**
     * §6: the composed service surface is exactly the Attempt-scoped inspection plus the reader
     * capability flag. There is no `readSessionPage`, no `listSessions`, and no other method that
     * takes a bare session id.
     */
    expect(Object.keys(v0).sort()).toEqual(["hasDshReader", "previewAttempt"]);
    expect("readSessionPage" in v0).toBe(false);
    expect("listSessions" in v0).toBe(false);
    expect(typeof (v0 as unknown as Record<string, unknown>)["readSessionPage"]).toBe("undefined");
  }, 180_000);

  it("S1-C2: an unknown attempt causes zero session reads even when a reader is composed", async () => {
    const rig = makeRig("v0sc2");
    await runAttempt(rig, "v0sc2", "v0sc2");
    const counting = countingReader();
    const v0 = composeTrajectoryV0({
      projectId: "v0sc2", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: counting.port,
    });
    await expect(v0.previewAttempt({ attemptId: `attempt-${"8".repeat(32)}`, claimedSessionId: "session-s" }))
      .rejects.toMatchObject({ code: "ATTEMPT_NOT_FOUND" });
    expect(counting.calls()).toBe(0);
  }, 180_000);

  it("S1-C3: a source header matching its own SessionId does not establish Attempt ownership", async () => {
    const rig = makeRig("v0sc3");
    const { attemptId } = await runAttempt(rig, "v0sc3", "v0sc3");
    const v0 = composeTrajectoryV0({
      projectId: "v0sc3", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: agreeingReader("session-self-consistent"),
    });
    const preview = await v0.previewAttempt({ attemptId, claimedSessionId: "session-self-consistent" });
    // The header agreed with the claim, and ownership is still not established.
    expect(preview.execution.sessionBindingStatus).toBe("SESSION_CLAIMED_UNVERIFIED");
    expect(preview.execution.dshSessionId).toBeNull();
    expect(preview.attribution.sessionAttribution).toBe("NO_SESSION");
  }, 180_000);

  it("S1-C4: a session fork ParentId does not become a Work delegation edge", async () => {
    const rig = makeRig("v0sc4");
    const { attemptId } = await runAttempt(rig, "v0sc4", "v0sc4");
    /**
     * §6: a page whose header names a parent session. The parent relation is the SESSION's own
     * lineage; it must not appear as a Work relation and must not create an Attempt→Session binding.
     */
    const forkReader: DshSessionReadPort = {
      sourceIdentity: "DSH_QUERY_PORT_FIXTURE",
      evidenceClass: "DSH_QUERY_PORT_FIXTURE",
      async readEvents() {
        return fixturePage("session-child", {
          header: Object.freeze({ sessionId: "session-child", version: 4, createdAt: 1, cwd: null, parentSession: "session-parent", isSeeded: true, origin: null, delegationDepth: 1 }),
          knownParentSession: "session-parent",
        });
      },
      async readHeaderIdentity() {
        return { readState: "READ_OK" as const, header: { sessionId: "session-child", version: 4, createdAt: 1, cwd: null, parentSession: "session-parent", isSeeded: true, origin: null, delegationDepth: 1 }, detail: "a forked session" };
      },
    };
    const v0 = composeTrajectoryV0({
      projectId: "v0sc4", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: forkReader,
    });
    const preview = await v0.previewAttempt({ attemptId, claimedSessionId: "session-child" });
    // The lineage is not a Work relation, and the attempt owns no session.
    expect(preview.execution.sessionBindingStatus).toBe("SESSION_CLAIMED_UNVERIFIED");
    // H0 C3: the claim is recorded and NO read is performed, so the admission is NOT_REQUESTED.
    expect(preview.execution.sessionReadAdmission).toBe("NOT_REQUESTED");
    expect(preview.execution.events).toEqual([]);
    expect(preview.projectContext.selectedRelations.map((relation) => relation.relation)).not.toContain("SESSION_FORKED_FROM");
    // No Work relation names the parent session.
    expect(JSON.stringify(preview.projectContext.selectedRelations)).not.toContain("session-parent");
  }, 180_000);
});

/* ================================================================== S1-D */

describe("Trajectory-V0S §7 S1-D — exact Project Evolution relation admission", () => {
  it("S1-D6: real Work Authorization and Result relations remain visible and exactly established", async () => {
    const rig = makeRig("v0sd6");
    const { attemptId } = await runAttempt(rig, "v0sd6", "v0sd6");
    const v0 = composeTrajectoryV0({
      projectId: "v0sd6", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({ attemptId });
    const relations = preview.projectContext.selectedRelations.map((relation) => relation.relation);
    expect(relations).toContain("ATTEMPT_PRODUCED_RESULT");
    for (const relation of preview.projectContext.selectedRelations) {
      expect(relation.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
      // §7: every selected relation's detail names a real canonical event id, not a label.
      expect(relation.detail).toMatch(/event_id \d+/u);
    }
  }, 180_000);

  it("S1-D1/D5: no display label can substitute for canonical source identity", () => {
    /**
     * §7: the corrected selector matches `event_id` identity, never a label. The policy lives in
     * `src/trajectory/relation_admission.ts` and the composition adapter consumes it, so BOTH files
     * are scanned. Comments are stripped first, because the files deliberately QUOTE the old
     * anti-pattern when explaining what was corrected — a substring search over raw text would flag
     * the documentation of the fix as the defect.
     */
    const code = stripComments(
      readShipped("src", "composition", "trajectory_v0.ts") + readShipped("src", "trajectory", "relation_admission.ts"),
    );
    expect(code).not.toContain(".label.includes(");
    expect(code).toContain("ESTABLISHED_BY_OWNER_REFERENCE");
    expect(code).toContain("canonicalEventIds");
  });
  it("S1-D7: the known-incomplete T0 relations remain quarantined, never selected", async () => {
    const rig = makeRig("v0sd7");
    const { attemptId } = await runAttempt(rig, "v0sd7", "v0sd7");
    const v0 = composeTrajectoryV0({
      projectId: "v0sd7", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: rig.installed.reasoningCells?.service, proof: rig.installed.proof, projectWorkspace: rig.installed.projectWorkspace,
      journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({ attemptId });
    const selected = preview.projectContext.selectedRelations.map((relation) => relation.relation);
    for (const relation of ["RECEIPT_REFERENCED_GROUND", "GOVERNED_INTENT_CHANGED_PROJECT", "REVISION_SUCCEEDED_REVISION"]) {
      expect(selected).not.toContain(relation);
    }
  }, 180_000);
});

/** §7: read a shipped source file so a source-level property can be asserted. */
function readShipped(...segments: readonly string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: joinPath } = require("node:path") as typeof import("node:path");
  return readFileSync(joinPath(process.cwd(), ...segments), "utf8");
}

/** §7: remove block and line comments so a source assertion cannot match documentation prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

/* ================================================================== S1-E */

describe("Trajectory-V0S §8 S1-E — Handoff completeness and interruption semantics", () => {
  it("S1-E1: a readable but unrelated Session cannot yield a COMPLETE Attempt Handoff", async () => {
    const rig = makeRig("v0se1");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0se1", "v0se1");
    const v0 = composeTrajectoryV0({
      projectId: "v0se1", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: agreeingReader("session-unrelated"),
    });
    const preview = await v0.previewAttempt({ attemptId, claimedSessionId: "session-unrelated", hostRecord });
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (H0 C3)
     *
     * V0S asserted `sessionReadState === READ_OK` and `sourceReadability === READABLE`, because V0S read
     * the claimed session. H0 §7 performs no read, so the read state is null and the source readability
     * is `NOT_REQUESTED` — the Preview still cannot be COMPLETE, which is the property under test.
     */
    expect(preview.execution.sessionReadState).toBeNull();
    expect(preview.completeness).not.toBe("COMPLETE");
    expect(preview.attribution.sessionAttribution).toBe("NO_SESSION");
    expect(preview.attribution.sourceReadability).toBe("NOT_REQUESTED");
  }, 180_000);

  it("S1-E2: a Work Result with SESSION_UNBOUND remains a useful PARTIAL Preview", async () => {
    const rig = makeRig("v0se2");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0se2", "v0se2");
    const v0 = composeTrajectoryV0({
      projectId: "v0se2", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({ attemptId, hostRecord });
    expect(preview.completeness).toBe("PARTIAL");
    // Useful: the canonical outcome and the project context are both present.
    expect(preview.canonical.attemptState).toBe("COMPLETED");
    expect(preview.canonical.resultRefs.length).toBeGreaterThan(0);
    expect(preview.projectContext.projectionRootId).not.toBeNull();
  }, 180_000);

  it("S1-E3/E4/E5: timeout, abort and unconfirmed exit are distinct from an observed exit", async () => {
    const rig = makeRig("v0se3");
    const { attemptId } = await runAttempt(rig, "v0se3", "v0se3");
    const v0 = composeTrajectoryV0({
      projectId: "v0se3", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const record = (kinds: readonly string[], exited: boolean): TrajectoryV0HostRecord => ({
      attemptId, hostLocalJobId: "wdj-1", portInvocationId: "wpi-1", eventKinds: kinds, exited, exitCode: exited ? 0 : null,
      spawnFailed: false, unknownAfterRestart: false, detail: "host chronology",
    });

    /** S1-E3: a timeout was REQUESTED and no exit was observed — not EXITED. */
    const timeout = await v0.previewAttempt({ attemptId, hostRecord: record(["DIRECT_CHILD_SPAWN_OBSERVED", "DIRECT_CHILD_TIMEOUT_REQUESTED"], false) });
    expect(timeout.execution.processLifecycle).toBe("TIMEOUT_REQUESTED");
    expect(timeout.execution.processLifecycle).not.toBe("EXITED");

    /** S1-E4: an abort was requested and the exit is unconfirmed — not ordinary RUNNING. */
    const aborted = await v0.previewAttempt({ attemptId, hostRecord: record(["DIRECT_CHILD_SPAWN_OBSERVED", "DIRECT_CHILD_ABORT_REQUESTED", "DIRECT_CHILD_EXIT_UNCONFIRMED"], false) });
    expect(aborted.execution.processLifecycle).toBe("EXIT_UNCONFIRMED");
    expect(aborted.execution.processLifecycle).not.toBe("RUNNING");
    expect(aborted.execution.processLifecycle).not.toBe("EXITED");

    /** S1-E5: an actual exit AFTER an abort request preserves both facts. */
    const exitedAfterAbort = await v0.previewAttempt({ attemptId, hostRecord: record(["DIRECT_CHILD_SPAWN_OBSERVED", "DIRECT_CHILD_ABORT_REQUESTED", "DIRECT_CHILD_EXIT_OBSERVED"], true) });
    expect(exitedAfterAbort.execution.processLifecycle).toBe("EXITED");
    expect(exitedAfterAbort.execution.processDetail).toContain("LATER observed");

    // §8: the lifecycle vocabulary carries the request states explicitly.
    for (const state of ["TIMEOUT_REQUESTED", "ABORT_REQUESTED", "EXIT_UNCONFIRMED"]) {
      expect([...PROCESS_LIFECYCLE_STATES]).toContain(state);
    }
  }, 240_000);

  it("S1-E6: a DSH turn/end does not imply Work settlement", async () => {
    const rig = makeRig("v0se6");
    const { attemptId } = await runAttempt(rig, "v0se6", "v0se6");
    const v0 = composeTrajectoryV0({
      projectId: "v0se6", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: agreeingReader("session-turn-end"),
    });
    const preview = await v0.previewAttempt({ attemptId, claimedSessionId: "session-turn-end" });
    // The page's turn/end is a DSH fact; the canonical outcome is untouched by it.
    expect(preview.canonical.promotionState).toBe("NOT_PROMOTED");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("turn/end does not prove promotion");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("does not prove Work settlement");
  }, 180_000);

  it("S1-E7: a reader fixture identity is not presented as real DSH evidence", async () => {
    const rig = makeRig("v0se7");
    const { attemptId } = await runAttempt(rig, "v0se7", "v0se7");
    const v0 = composeTrajectoryV0({
      projectId: "v0se7", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: agreeingReader("session-fixture-id"),
    });
    const preview = await v0.previewAttempt({ attemptId, claimedSessionId: "session-fixture-id" });
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (H0 C3)
     *
     * V0S read the claimed session and therefore carried the fixture's provenance class into the
     * Preview. H0 §7 performs no read, so no page exists and the provenance fields are null: a consumer
     * cannot be shown fixture metadata as if it were evidence about this attempt. The property under
     * test — a fixture is not presented as real DSH evidence — holds a fortiori, because nothing is
     * presented at all.
     */
    expect(preview.execution.sourceEvidenceClass).toBeNull();
    expect(preview.execution.sourceIdentity).toBeNull();
    expect(preview.execution.events).toEqual([]);
  }, 180_000);

  it("S1-E8: a semantic digest is not mislabeled as a byte attestation", async () => {
    const rig = makeRig("v0se8");
    const { attemptId } = await runAttempt(rig, "v0se8", "v0se8");
    const v0 = composeTrajectoryV0({
      projectId: "v0se8", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({ attemptId });
    // §8: the digest is a SEMANTIC digest of the read model, and the model says so by carrying the
    // preview content rather than claiming to attest response bytes.
    expect(preview.previewDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(preview)).not.toContain("responseBytes");
    expect(JSON.stringify(preview)).not.toContain("byteAttestation");
  }, 180_000);
});

/* ================================================================== §9 reader contract */

describe("Trajectory-V0S §9 — the bounded read request contract", () => {
  it("a usable request is honoured and an unusable one is refused", () => {
    expect(validateReadRequest({ sessionId: "s" }).ok).toBe(true);
    expect(validateReadRequest({ sessionId: "s", fromSeq: 0, maxEvents: 200 }).ok).toBe(true);
    expect(validateReadRequest({ sessionId: "s", fromSeq: -1 }).ok).toBe(false);
    expect(validateReadRequest({ sessionId: "s", fromSeq: 1.5 }).ok).toBe(false);
    expect(validateReadRequest({ sessionId: "s", fromSeq: Number.NaN }).ok).toBe(false);
    expect(validateReadRequest({ sessionId: "s", maxEvents: 0 }).ok).toBe(false);
    expect(validateReadRequest({ sessionId: "s", maxEvents: -1 }).ok).toBe(false);
    expect(validateReadRequest({ sessionId: "s", maxEvents: 201 }).ok).toBe(false);
  });
});
