/**
 * Trajectory-P2-D0 §6.4 — MANDATORY REAL PARENT-IPC IDENTITY PRESERVATION GATE.
 *
 * This is the primary Session candidate-preservation gate. It drives the REAL Parent Worker Port
 * (`dshSubprocessWorkWorkerPort`) with a controlled Node ChildProcess, sends A, B and C over the REAL
 * identity IPC protocol, attaches the REAL Work correlation sink and the REAL trusted recorder, and
 * verifies through the REAL durable store.
 *
 * It deliberately does NOT substitute three direct calls to `Recorder.recordIdentity()`: that would test
 * the recorder but not the broken production transport chain. What is under test is the whole
 * tracker→sink→recorder→store path the product actually wires.
 *
 * SAFETY. A controlled local stub child; temp SQLite; no DSH, no model, no network, no personal data.
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
import {
  makeWorkDelegationService,
  type CorrelatedSessionIdentityObservation as Correlated,
} from "../src/interaction/work_delegation.js";
import {
  SqliteExecutionAssociationStore,
  computeTrustedSourceBasis,
  createExecutionAssociationRecorder,
  makeAssociationQualifier,
  registryFromSingleBasis,
  type TrustedSourceBasis,
} from "../src/execution_association/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });
const PROJECT = "p2d0-ipc";

/** A controlled child that reports each SessionId over the real identity IPC channel, then reports an outcome. */
function scriptedChild(sessionIds: readonly string[], options: { readonly stayOpen?: boolean } = {}): { readonly dshBin: string; readonly workDir: string } {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-p2d0-ipc-"));
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
  const tail = options.stayOpen === true
    ? "setInterval(() => {}, 1000);"
    : `process.stdout.write("PALIMPSEST_WORK_RESULT " + JSON.stringify({ kind: "READY_FOR_SETTLEMENT", summary: "done" }) + "\\n");`;
  writeFileSync(scriptPath, `${sends}\n${tail}\n`, "utf8");
  return { dshBin: scriptPath, workDir: dir };
}

const CONTEXT = { work: {}, compiled: { manifestId: "m", boot: [], handles: [] } } as never;

/* ================================================================== §6.4 real IPC A/B/C */

describe("P2D0 §6.4 — real Parent IPC: three distinct identities survive to the durable candidate set", () => {
  it("A/B/C all reach durable ingestion, a repeated A is idempotent, and the qualification is CONFLICT", async () => {
    const child = scriptedChild(["worker-A", "worker-B", "worker-C", "worker-A"]);
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });

    const port = dshSubprocessWorkWorkerPort({ dshBin: child.dshBin, profile: "p2d0-stub", timeoutMs: 20_000 });
    const correlated: Correlated[] = [];
    const outcome = await port.run({
      workDir: child.workDir,
      context: CONTEXT,
      observeSessionIdentity: (observation) => {
        // The REAL correlation the product wires: attemptId from canonical Work, job id from this service.
        correlated.push(Object.freeze({ hostLocalJobId: "wdj-real", attemptId: "attempt-real", observation }) as Correlated);
      },
    });
    expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");

    // The sink received one report per IPC message (A, B, C, A).
    expect(correlated).toHaveLength(4);
    // And each entry carries the identity THAT message reported, not the tracker's cumulative first.
    expect(correlated.map((entry) => entry.observation.reportedSessionId)).toEqual(["worker-A", "worker-B", "worker-C", "worker-A"]);

    // Feed them through the REAL recorder — the product's own ingestion path.
    for (const entry of correlated) recorder.recordIdentity(entry);
    recorder.finalizeAttempt({ attemptId: "attempt-real", closeReason: "CHILD_EXIT_OBSERVED" });

    // The durable candidate set is {A, B, C}, not {A}.
    const durable = store
      .replayForAttempt({ projectId: PROJECT, attemptId: "attempt-real" })
      .filter((event) => event.type === "SESSION_IDENTITY_OBSERVED")
      .map((event) => (event.payload as { dshSessionId: string }).dshSessionId);
    expect([...new Set(durable)].sort()).toEqual(["worker-A", "worker-B", "worker-C"]);
    // Repeated A did not create a duplicate logical observation.
    expect(durable.filter((sessionId) => sessionId === "worker-A")).toHaveLength(1);
    expect(durable).toHaveLength(3);

    // Finalization cannot produce a unique qualified A: the Invocation is a CONFLICT.
    const storePath = join(mkdtempSync(join(tmpdir(), "p2d0-ipc-db-")), "assoc.sqlite");
    cleanups.push(() => {
      try {
        rmSync(join(storePath, ".."), { recursive: true, force: true });
      } catch {
        /* windows */
      }
    });
    const fileStore = new SqliteExecutionAssociationStore(storePath);
    cleanups.push(() => fileStore.close());
    const replayRecorder = createExecutionAssociationRecorder({ store: fileStore, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    for (const entry of correlated) replayRecorder.recordIdentity(entry);
    replayRecorder.finalizeInvocation({ attemptId: "attempt-real", invocationId: correlated[0]!.observation.invocationId, closeReason: "CHILD_EXIT_OBSERVED" });
    const qualifier = makeAssociationQualifier({
      store: fileStore,
      registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
      work: { readAttempt: () => ({ ok: true, taskId: "t1", state: "RUNNING", creationEventId: "ev-1" }) },
      dsh: { async readHeaderIdentity(sessionId: string) { return { readState: "READ_OK" as const, header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "fixture" }; } },
    });
    const result = await qualifier.qualifyAttempt({ projectId: PROJECT, attemptId: "attempt-real" });
    expect(result.qualifications[0]!.state).toBe("CONFLICT");
    // No attributed Session events are admitted, because nothing qualified.
    expect(result.summary.qualifiedCount).toBe(0);
    store.close();
  });

  it("a single identity still finalizes normally, so the fix does not break the ordinary path", async () => {
    const child = scriptedChild(["worker-solo"]);
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const port = dshSubprocessWorkWorkerPort({ dshBin: child.dshBin, profile: "p2d0-stub", timeoutMs: 20_000 });
    const correlated: Correlated[] = [];
    await port.run({
      workDir: child.workDir,
      context: CONTEXT,
      observeSessionIdentity: (observation) => {
        correlated.push(Object.freeze({ hostLocalJobId: "wdj-real", attemptId: "attempt-solo", observation }) as Correlated);
      },
    });
    for (const entry of correlated) recorder.recordIdentity(entry);
    const invocationId = correlated[0]!.observation.invocationId;
    recorder.finalizeInvocation({ attemptId: "attempt-solo", invocationId, closeReason: "CHILD_EXIT_OBSERVED" });
    const qualifier = makeAssociationQualifier({
      store,
      registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
      work: { readAttempt: () => ({ ok: true, taskId: "t1", state: "RUNNING", creationEventId: "ev-1" }) },
      dsh: { async readHeaderIdentity(sessionId: string) { return { readState: "READ_OK" as const, header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "fixture" }; } },
    });
    const result = await qualifier.qualifyAttempt({ projectId: PROJECT, attemptId: "attempt-solo" });
    expect(result.qualifications[0]!.state).toBe("ASSOCIATION_QUALIFIED");
    store.close();
  });

  it("the REAL delegation service wires the correlation: a real Job's child identity reaches the recorder", async () => {
    /**
     * §6.4: the correlation is built at the one host-private boundary that holds `prepared.attemptId` and
     * the service's own jobId. This drives the REAL `makeWorkDelegationService` with a controlled
     * controller stand-in, so the transport chain (port → correlateSessionIdentity → recorder) is real.
     */
    const child = scriptedChild(["worker-job-A", "worker-job-B"]);
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const port = dshSubprocessWorkWorkerPort({ dshBin: child.dshBin, profile: "p2d0-stub", timeoutMs: 20_000 });
    const service = makeWorkDelegationService({
      controller: {
        mutatingWorkTarget: () => ({ taskId: "t1", resumed: false }),
        prepareMutatingWork: async () => ({ attemptId: "attempt-wired", taskId: "t1", worldPath: child.workDir }),
        workWorkerAttemptContext: async () => CONTEXT,
        settleMutatingWork: async () => ({ state: "READY" }),
        attemptWorkRecord: () => null,
        fetchContext: async () => undefined,
      } as never,
      workerFor: () => port,
      onCorrelatedSessionIdentity: (entry) => recorder.recordIdentity(entry),
      onCorrelatedObservation: (entry) => {
        if (entry.observation.eventKind !== "DIRECT_CHILD_EXIT_OBSERVED") return;
        recorder.finalizeInvocation({ attemptId: entry.attemptId, invocationId: entry.invocationId, closeReason: "CHILD_EXIT_OBSERVED" });
      },
    });
    const started = await service.start({ expectedTaskId: "t1" });
    // Await the job's terminal phase without a scheduler: poll the read-only view.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const view = await service.followup({ jobId: started.jobId });
      if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const durable = store
      .replayForAttempt({ projectId: PROJECT, attemptId: "attempt-wired" })
      .filter((event) => event.type === "SESSION_IDENTITY_OBSERVED")
      .map((event) => (event.payload as { dshSessionId: string }).dshSessionId);
    // Both identities the real child reported survived, associated with the canonical AttemptId.
    expect([...new Set(durable)].sort()).toEqual(["worker-job-A", "worker-job-B"]);
    // And the window was finalized by the OBSERVED exit, not by a returned port.
    const finalizations = store
      .replayForAttempt({ projectId: PROJECT, attemptId: "attempt-wired" })
      .filter((event) => event.type === "INVOCATION_OBSERVATION_FINALIZED");
    expect(finalizations).toHaveLength(1);
    expect((finalizations[0]!.payload as { closeReason: string }).closeReason).toBe("CHILD_EXIT_OBSERVED");
    store.close();
  });
});
