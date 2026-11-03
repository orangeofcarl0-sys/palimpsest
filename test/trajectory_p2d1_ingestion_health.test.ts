/**
 * Trajectory-P2-D1 §6.4/§6.6 — MANDATORY INGESTION-COMPLETENESS FAULT INJECTION.
 *
 * The primary C2 gate. It drives the REAL Parent Worker Port (`dshSubprocessWorkWorkerPort`) with a
 * controlled Node ChildProcess that reports identities over the REAL IPC protocol, attaches the REAL Work
 * correlation sink and the REAL trusted recorder, and injects a durable-append FAILURE at the store
 * boundary — the exact "Session A succeeds, Session B fails, child close observed" sequence (§6.6).
 *
 * WHAT IT PROVES. A known ingestion failure cannot be laundered into a verified binding:
 *   · Worker Outcome unchanged;
 *   · Session B not fabricated;
 *   · the Association is NOT qualified as unique A;
 *   · the finalization does not claim a complete candidate set;
 *   · a COLD REPLAY through a DIFFERENT Recorder instance cannot recover a falsely complete association.
 *
 * SAFETY. A controlled local stub child; temp/in-memory SQLite; no DSH, no model, no network, no personal data.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  WORK_WORKER_SESSION_IDENTITY_CHANNEL,
  WORK_WORKER_SESSION_IDENTITY_KIND,
  dshSubprocessWorkWorkerPort,
} from "../src/deployment/work_worker.js";
import type { CorrelatedSessionIdentityObservation as Correlated } from "../src/interaction/work_delegation.js";
import {
  SqliteExecutionAssociationStore,
  computeTrustedSourceBasis,
  createExecutionAssociationRecorder,
  makeAssociationQualifier,
  registryFromSingleBasis,
  type ExecutionAssociationStore,
  type TrustedSourceBasis,
} from "../src/execution_association/index.js";
import { validateObservationWindow } from "../src/execution_association/window_integrity.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });
const PROJECT = "p2d1-ingestion";

function scriptedChild(sessionIds: readonly string[]): { readonly dshBin: string; readonly workDir: string } {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-p2d1-ipc-"));
  cleanups.push(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows keeps the directory busy; the OS reaps it */
    }
  });
  const scriptPath = join(dir, "cluster-child.mjs");
  const sends = sessionIds
    .map((sessionId) => `process.send(${JSON.stringify({ channel: WORK_WORKER_SESSION_IDENTITY_CHANNEL, kind: WORK_WORKER_SESSION_IDENTITY_KIND, sessionId })});`)
    .join("\n");
  writeFileSync(scriptPath, `${sends}\nprocess.stdout.write("PALIMPSEST_WORK_RESULT " + JSON.stringify({ kind: "READY_FOR_SETTLEMENT", summary: "done" }) + "\\n");\n`, "utf8");
  return { dshBin: scriptPath, workDir: dir };
}

/** A store that fails the Nth append, so "Session B fails" is deterministic. */
function failOnNthAppend(real: ExecutionAssociationStore, failOn: number, mode: "throw" | "reject"): ExecutionAssociationStore {
  let count = 0;
  return {
    append: (event) => {
      count += 1;
      if (count === failOn) {
        if (mode === "throw") throw new Error("simulated durable append failure");
        // A store that returns a non-committed outcome rather than throwing.
        return { state: "REJECTED", reason: "simulated rejection" } as never;
      }
      return real.append(event);
    },
    replay: () => real.replay(),
    replayForAttempt: (input) => real.replayForAttempt(input),
    replayForSession: (input) => real.replayForSession(input),
    head: () => real.head(),
    close: () => real.close(),
  };
}

const CONTEXT = { work: {}, compiled: { manifestId: "m", boot: [], handles: [] } } as never;

async function driveRealIpc(sessionIds: readonly string[], sink: (entry: Correlated) => void, attemptId: string): Promise<{ readonly outcomeKind: string; readonly correlated: readonly Correlated[] }> {
  const child = scriptedChild(sessionIds);
  const port = dshSubprocessWorkWorkerPort({ dshBin: child.dshBin, profile: "p2d1-stub", timeoutMs: 20_000 });
  const correlated: Correlated[] = [];
  const outcome = await port.run({
    workDir: child.workDir,
    context: CONTEXT,
    observeSessionIdentity: (observation) => {
      const entry = Object.freeze({ hostLocalJobId: "wdj-real", attemptId, observation }) as Correlated;
      correlated.push(entry);
      sink(entry);
    },
  });
  return { outcomeKind: outcome.kind, correlated };
}

/* ================================================================== §6.6 the mandatory sequence */

describe("P2D1 §6.6 — A succeeds, B fails, close observed: no false unique qualification", () => {
  it("a THROWN append for B leaves a durable incompleteness marker, an UNKNOWN window, and no qualification", async () => {
    const real = new SqliteExecutionAssociationStore(":memory:");
    const flaky = failOnNthAppend(real, 2, "throw");
    const recorder = createExecutionAssociationRecorder({ store: flaky, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const attemptId = "attempt-c2";

    const { outcomeKind, correlated } = await driveRealIpc(["worker-A", "worker-B"], (entry) => {
      try {
        recorder.recordIdentity(entry);
      } catch {
        /* the product sink contains a throw; the Recorder already marked incompleteness */
      }
    }, attemptId);

    // §6.6: the Worker Outcome is UNCHANGED by the ingestion failure.
    expect(outcomeKind).toBe("READY_FOR_SETTLEMENT");
    expect(correlated).toHaveLength(2);

    // The parent observes the real child close and finalizes.
    recorder.finalizeInvocation({ attemptId, invocationId: correlated[0]!.observation.invocationId, closeReason: "CHILD_EXIT_OBSERVED" });

    // Session B is NOT fabricated: only A is durable.
    const durable = real.replayForAttempt({ projectId: PROJECT, attemptId }).filter((event) => event.type === "SESSION_IDENTITY_OBSERVED");
    expect(durable.map((event) => (event.payload as { dshSessionId: string }).dshSessionId)).toEqual(["worker-A"]);

    // A durable incompleteness marker exists.
    const markers = real.replayForAttempt({ projectId: PROJECT, attemptId }).filter((event) => event.type === "INVOCATION_INGESTION_INCOMPLETE");
    expect(markers).toHaveLength(1);

    // The window is NOT a closure: the validator refuses it.
    const window = validateObservationWindow(real.replayForAttempt({ projectId: PROJECT, attemptId }));
    expect(window.state).toBe("CONTRADICTORY");
    expect(window.reason).toBe("INGESTION_INCOMPLETE");

    // §6.6: the Association is NOT qualified as unique A.
    const qualifier = makeAssociationQualifier({
      store: real,
      registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
      work: { readAttempt: () => ({ ok: true, taskId: "t1", state: "RUNNING", creationEventId: "ev-1" }) },
      dsh: { async readHeaderIdentity(sessionId: string) { return { readState: "READ_OK" as const, header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "fixture" }; } },
    });
    const qualification = await qualifier.qualifyAttempt({ projectId: PROJECT, attemptId });
    expect(qualification.qualifications[0]!.state).toBe("OBSERVATION_INCOMPLETE");
    expect(qualification.summary.qualifiedCount).toBe(0);
    real.close();
  });

  it("a REJECTED outcome for B leaves the same durable incompleteness marker", async () => {
    const real = new SqliteExecutionAssociationStore(":memory:");
    const flaky = failOnNthAppend(real, 2, "reject");
    const recorder = createExecutionAssociationRecorder({ store: flaky, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const attemptId = "attempt-c2-reject";
    const { correlated } = await driveRealIpc(["worker-A", "worker-B"], (entry) => void recorder.recordIdentity(entry), attemptId);
    recorder.finalizeInvocation({ attemptId, invocationId: correlated[0]!.observation.invocationId, closeReason: "CHILD_EXIT_OBSERVED" });
    expect(real.replayForAttempt({ projectId: PROJECT, attemptId }).filter((event) => event.type === "INVOCATION_INGESTION_INCOMPLETE")).toHaveLength(1);
    expect(validateObservationWindow(real.replayForAttempt({ projectId: PROJECT, attemptId })).reason).toBe("INGESTION_INCOMPLETE");
    real.close();
  });

  it("§6.6 COLD REPLAY: a DIFFERENT Recorder instance over the same durable store cannot recover a false CLOSED window", async () => {
    const real = new SqliteExecutionAssociationStore(":memory:");
    const flaky = failOnNthAppend(real, 2, "throw");
    const recorderA = createExecutionAssociationRecorder({ store: flaky, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const attemptId = "attempt-c2-cold";
    const { correlated } = await driveRealIpc(["worker-A", "worker-B"], (entry) => {
      try {
        recorderA.recordIdentity(entry);
      } catch {
        /* contained */
      }
    }, attemptId);

    // A FRESH recorder (as after a restart) finalizes over the SAME durable store.
    const recorderB = createExecutionAssociationRecorder({ store: real, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    expect(recorderB.ingestionHealthOf({ attemptId, invocationId: correlated[0]!.observation.invocationId })).toBe("INGESTION_FAILED");
    recorderB.finalizeInvocation({ attemptId, invocationId: correlated[0]!.observation.invocationId, closeReason: "CHILD_EXIT_OBSERVED" });
    // The finalization is UNKNOWN, not CLOSED, and the validator still refuses.
    const window = validateObservationWindow(real.replayForAttempt({ projectId: PROJECT, attemptId }));
    expect(window.state).toBe("CONTRADICTORY");
    expect(window.reason).toBe("INGESTION_INCOMPLETE");
    real.close();
  });
});

/* ================================================================== §6.5 sticky / isolation / idempotence */

describe("P2D1 §6.5 — ordering, stickiness, idempotence and per-Invocation isolation", () => {
  it("failure on the FIRST report leaves no complete association", () => {
    const real = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store: failOnNthAppend(real, 1, "throw"), projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    expect(() => recorder.recordIdentity({ hostLocalJobId: "", attemptId: "a1", observation: { invocationId: "wpi-1", dshSessionId: "worker-A", reportedSessionId: "worker-A", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 1 } })).toThrow();
    recorder.finalizeInvocation({ attemptId: "a1", invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    expect(validateObservationWindow(real.replayForAttempt({ projectId: PROJECT, attemptId: "a1" })).reason).toBe("INGESTION_INCOMPLETE");
    real.close();
  });

  it("a later SUCCESSFUL report does not erase the earlier failure (sticky)", () => {
    const real = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store: failOnNthAppend(real, 1, "throw"), projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const obs = (s: string) => ({ hostLocalJobId: "", attemptId: "a2", observation: { invocationId: "wpi-1", dshSessionId: s, reportedSessionId: s, source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 1 } });
    expect(() => recorder.recordIdentity(obs("worker-A"))).toThrow();
    // A later report SUCCEEDS.
    recorder.recordIdentity(obs("worker-B"));
    expect(real.replayForAttempt({ projectId: PROJECT, attemptId: "a2" }).some((event) => event.type === "SESSION_IDENTITY_OBSERVED")).toBe(true);
    // The health is still FAILED, and the finalization is still UNKNOWN.
    expect(recorder.ingestionHealthOf({ attemptId: "a2", invocationId: "wpi-1" })).toBe("INGESTION_FAILED");
    recorder.finalizeInvocation({ attemptId: "a2", invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    expect(validateObservationWindow(real.replayForAttempt({ projectId: PROJECT, attemptId: "a2" })).reason).toBe("INGESTION_INCOMPLETE");
    real.close();
  });

  it("a duplicate identical report is IDEMPOTENT and is NOT counted as a failure", () => {
    const real = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store: real, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const obs = { hostLocalJobId: "", attemptId: "a3", observation: { invocationId: "wpi-1", dshSessionId: "worker-A", reportedSessionId: "worker-A", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 1 } };
    expect(recorder.recordIdentity(obs).state).toBe("APPENDED");
    expect(recorder.recordIdentity(obs).state).toBe("IDEMPOTENT");
    expect(recorder.ingestionHealthOf({ attemptId: "a3", invocationId: "wpi-1" })).toBe("COMPLETE_SO_FAR");
    recorder.finalizeInvocation({ attemptId: "a3", invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    expect(validateObservationWindow(real.replayForAttempt({ projectId: PROJECT, attemptId: "a3" })).state).toBe("CLOSED_CONSISTENT");
    real.close();
  });

  it("independent Invocations do not share failure state", () => {
    const real = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store: failOnNthAppend(real, 1, "throw"), projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const obs = (inv: string, s: string) => ({ hostLocalJobId: "", attemptId: "a4", observation: { invocationId: inv, dshSessionId: s, reportedSessionId: s, source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 1 } });
    // Invocation 1's first append fails; Invocation 2 is unaffected.
    expect(() => recorder.recordIdentity(obs("wpi-1", "worker-1"))).toThrow();
    expect(recorder.recordIdentity(obs("wpi-2", "worker-2")).state).toBe("APPENDED");
    expect(recorder.ingestionHealthOf({ attemptId: "a4", invocationId: "wpi-1" })).toBe("INGESTION_FAILED");
    expect(recorder.ingestionHealthOf({ attemptId: "a4", invocationId: "wpi-2" })).toBe("COMPLETE_SO_FAR");
    real.close();
  });

  it("a FAILED finalization append leaves the window OPEN, which prevents qualification", () => {
    const real = new SqliteExecutionAssociationStore(":memory:");
    // The finalization is the 2nd append (after one observation), and it fails.
    const recorder = createExecutionAssociationRecorder({ store: failOnNthAppend(real, 2, "throw"), projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity({ hostLocalJobId: "", attemptId: "a5", observation: { invocationId: "wpi-1", dshSessionId: "worker-A", reportedSessionId: "worker-A", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 1 } });
    expect(() => recorder.finalizeInvocation({ attemptId: "a5", invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" })).toThrow();
    // No finalization was written: the window stays OPEN, not CLOSED.
    expect(validateObservationWindow(real.replayForAttempt({ projectId: PROJECT, attemptId: "a5" })).state).toBe("OPEN");
    real.close();
  });

  it("the ordinary path is unaffected: one identity, one close, still qualifies", () => {
    const real = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store: real, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity({ hostLocalJobId: "", attemptId: "a6", observation: { invocationId: "wpi-1", dshSessionId: "worker-A", reportedSessionId: "worker-A", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 1 } });
    recorder.finalizeInvocation({ attemptId: "a6", invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    const window = validateObservationWindow(real.replayForAttempt({ projectId: PROJECT, attemptId: "a6" }));
    expect(window.state).toBe("CLOSED_CONSISTENT");
    expect(window.reason).toBe(null);
    real.close();
  });
});
