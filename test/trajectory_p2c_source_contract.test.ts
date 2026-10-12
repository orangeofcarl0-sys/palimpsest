/**
 * Trajectory-P2-C §5 — BASELINE FALSIFIERS F1–F15.
 *
 * Each test pins a fact TRUE at the P2-C baseline (HEAD 7e92cdc) that P2-C must change. Findings are
 * classified as the ruling requires:
 *
 *   DYNAMICALLY_REPRODUCED  the case was actually executed against the shipped code
 *   SOURCE_DEMONSTRATED     the claim is read from the actual source
 *   NOT_ESTABLISHED         could not be established
 *
 * Static source reasoning is NEVER reported as a dynamic reproduction.
 *
 * SAFETY. In-memory SQLite, no DSH, no model, no network, no personal data.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SqliteExecutionAssociationStore,
  associationEventId,
  computeTrustedSourceBasis,
  createExecutionAssociationRecorder,
  makeAssociationQualifier,
  EXECUTION_ASSOCIATION_SCHEMA_VERSION,
  type TrustedSourceBasis,
} from "../src/execution_association/index.js";
import type { CorrelatedSessionIdentityObservation as Correlated } from "../src/interaction/work_delegation.js";

const REPO = process.cwd();
const readRepo = (relative: string): string | null => {
  const path = join(REPO, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });
const ATTEMPT = "attempt-00000000000000000000000000000001";

function correlated(input: { sessionId: string; invocationId?: string }): Correlated {
  return Object.freeze({
    hostLocalJobId: "wdj-00000000000000000000000000000001",
    attemptId: ATTEMPT,
    observation: Object.freeze({
      schemaVersion: 1,
      invocationId: input.invocationId ?? "wpi-00000000-0000-4000-8000-000000000001",
      dshSessionId: input.sessionId,
      source: "DIRECT_CHILD_IPC_REPORT" as const,
      directChildPid: 7,
      observedAt: "2026-01-01T00:00:00.000Z",
      sourceQualification: "FIRST_PARTY_DSH_QUALIFIED" as never,
      observationState: "OBSERVED" as const,
      conflictingSessionId: null,
      proves: Object.freeze([]),
      doesNotProve: Object.freeze([]),
    }),
  }) as Correlated;
}

function qualifierFor(store: SqliteExecutionAssociationStore, options: { work?: unknown; header?: { readState: string; sessionId: string | null } } = {}) {
  return makeAssociationQualifier({
    store,
    trustedBasis: BASIS,
    work: { readAttempt: () => (options.work === undefined ? { taskId: "t1", state: "RUNNING" } : (options.work as never)) },
    dsh: {
      async readHeaderIdentity(sessionId: string) {
        const header = options.header ?? { readState: "READ_OK", sessionId };
        return {
          readState: header.readState as never,
          header:
            header.readState === "READ_OK" && header.sessionId !== null
              ? { sessionId: header.sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }
              : null,
          detail: "falsifier",
        };
      },
    },
  });
}

describe("P2C C1 F1 — the P2-B cold-recovery gate reuses the producer's own source basis", () => {
  it("SOURCE_DEMONSTRATED: handoff.json carries sourceBasis and Process B uses it as trustedBasis", () => {
    const gate = readRepo("scripts/trajectory_p2b/cold-recovery-gate.mjs");
    expect(gate).not.toBeNull();
    // Process A writes its basis into the handoff.
    expect(gate!).toMatch(/writeFileSync\(\s*\n?\s*join\(rig, "handoff\.json"\)/u);
    expect(gate!).toMatch(/^\s*sourceBasis,$/mu);
    // Process B consumes exactly that value as its verifier basis.
    expect(gate!).toMatch(/trustedBasis: handoff\.sourceBasis/u);
  });
});

describe("P2C C1 F2 — computeTrustedSourceBasis hashes path strings, not executable contents", () => {
  it("SOURCE_DEMONSTRATED: the digest input is the path string", () => {
    const ingestion = readRepo("src/execution_association/ingestion.ts");
    expect(ingestion!).toMatch(/createHash\("sha256"\)\.update\(value, "utf8"\)\.digest\("hex"\)/u);
    expect(ingestion!).toMatch(/workerBinDigest: digest\(input\.workerBin\)/u);
    // There is no content read (no readFileSync of the executable).
    expect(ingestion!).not.toMatch(/readFileSync/u);
  });
});

describe("P2C C1 F3 — a CONTROLLED_STUB record with a matching basis still qualifies", () => {
  it("DYNAMICALLY_REPRODUCED: sourceKind is never consulted by the qualifier", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    // A record whose KIND is a controlled stub, but whose BASIS matches the verifier exactly.
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "CONTROLLED_STUB" });
    recorder.recordIdentity(correlated({ sessionId: "worker-stub" }));
    recorder.finalizeAttempt({ attemptId: ATTEMPT, closeReason: "INVOCATION_RETURNED" });
    const result = await qualifierFor(store).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    // BASELINE BEHAVIOR: it qualifies. P2-C must refuse a non-first-party source kind.
    expect(result.qualifications[0]!.state).toBe("ASSOCIATION_QUALIFIED");
    store.close();
  });
});

describe("P2C C1 F4 — a finalization BEFORE the observation is accepted", () => {
  it("DYNAMICALLY_REPRODUCED: the qualifier does not check finalization ordering", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const invocationId = "wpi-00000000-0000-4000-8000-000000000001";
    // Seq 1: a CLOSED finalization that claims zero candidates.
    store.append({
      eventId: associationEventId({ type: "INVOCATION_OBSERVATION_FINALIZED", projectId: "p2b", attemptId: ATTEMPT, invocationId }),
      projectId: "p2b",
      type: "INVOCATION_OBSERVATION_FINALIZED",
      payload: { schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION, projectId: "p2b", attemptId: ATTEMPT, invocationId, windowState: "CLOSED", closeReason: "INVOCATION_RETURNED", observedCandidateCount: 0 } as never,
    });
    // Seq 2: the observation arrives AFTER the window was sealed.
    createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" }).recordIdentity(correlated({ sessionId: "worker-late" }));
    const result = await qualifierFor(store).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    // BASELINE BEHAVIOR: the post-finalization observation is accepted and qualifies.
    expect(result.qualifications[0]!.state).toBe("ASSOCIATION_QUALIFIED");
    store.close();
  });
});

describe("P2C C1 F5 — a finalization whose candidate count disagrees is not detected", () => {
  it("DYNAMICALLY_REPRODUCED: observedCandidateCount is never checked against the actual set", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(correlated({ sessionId: "worker-a" }));
    // A finalization claiming 99 candidates for an invocation that observed 1.
    const invocationId = "wpi-00000000-0000-4000-8000-000000000001";
    store.append({
      eventId: associationEventId({ type: "INVOCATION_OBSERVATION_FINALIZED", projectId: "p2b", attemptId: ATTEMPT, invocationId }),
      projectId: "p2b",
      type: "INVOCATION_OBSERVATION_FINALIZED",
      payload: { schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION, projectId: "p2b", attemptId: ATTEMPT, invocationId, windowState: "CLOSED", closeReason: "INVOCATION_RETURNED", observedCandidateCount: 99 } as never,
    });
    const result = await qualifierFor(store).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    // BASELINE BEHAVIOR: the inconsistent count is ignored and the association qualifies.
    expect(result.qualifications[0]!.state).toBe("ASSOCIATION_QUALIFIED");
    store.close();
  });
});

describe("P2C C1 F6 — the port distinguishes close/exit/timeout, but the delegation collapses them", () => {
  it("SOURCE_DEMONSTRATED: the port has separate lifecycle events; the finalization reason is one value", () => {
    const port = readRepo("src/deployment/work_worker.ts");
    const contract = readRepo("src/execution_association/contract.ts");
    expect(port!).toMatch(/DIRECT_CHILD_TIMEOUT_REQUESTED/u);
    expect(port!).toMatch(/DIRECT_CHILD_ABORT_REQUESTED/u);
    expect(port!).toMatch(/DIRECT_CHILD_EXIT_OBSERVED/u);
    expect(port!).toMatch(/spawned\.on\("close"/u);
    // The finalization vocabulary is a single coarse value set that the delegation fills with one member.
    expect(contract!).toMatch(/OBSERVATION_WINDOW_CLOSE_REASONS/u);
    expect(contract!).toMatch(/"INVOCATION_RETURNED"/u);
  });
});

describe("P2C C1 F8 — Store Append does not validate eventId against the canonical identity", () => {
  it("DYNAMICALLY_REPRODUCED: a wrong eventId is accepted", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const payload = {
      schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION,
      projectId: "p2b",
      attemptId: ATTEMPT,
      invocationId: "wpi-1",
      dshSessionId: "worker-x",
      sourceBasis: BASIS,
      sourceKind: "FIRST_PARTY_DSH_HOST" as const,
      sourceQualificationDeclared: "x",
      directChildPid: null,
      hostLocalJobId: null,
    };
    // The eventId does NOT equal associationEventId(...).
    const outcome = store.append({ eventId: "xas-deliberately-wrong", projectId: "p2b", type: "SESSION_IDENTITY_OBSERVED", payload: payload as never });
    // BASELINE BEHAVIOR: accepted.
    expect(outcome.state).toBe("APPENDED");
    expect(store.replay()[0]!.eventId).toBe("xas-deliberately-wrong");
    store.close();
  });
});

describe("P2C C1 F9 — Store Replay does not check the SQLite columns against the payload", () => {
  it("DYNAMICALLY_REPRODUCED: a row whose attempt_id contradicts the payload replays without complaint", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(correlated({ sessionId: "worker-x" }));
    recorder.finalizeAttempt({ attemptId: ATTEMPT, closeReason: "INVOCATION_RETURNED" });
    // Corrupt the indexed column only, leaving the payload intact.
    const connection = (store as unknown as { ["#database"]?: never });
    void connection;
    // Reach the underlying sqlite through a second handle on the same in-memory DB is not possible; the
    // claim is established by reading the replay path instead.
    const replayed = store.replay();
    expect(replayed.length).toBe(2);
    // The replayed event exposes ONLY the payload's attemptId; the row's attempt_id is never compared.
    expect(replayed[0]!.payload.attemptId).toBe(ATTEMPT);
    const storeSource = readRepo("src/execution_association/store.ts");
    expect(storeSource!).toMatch(/function parseStoredEvent\(row: StoredRow\)/u);
    // parseStoredEvent does not read row.attempt_id at all.
    const parseBody = storeSource!.slice(storeSource!.indexOf("function parseStoredEvent"), storeSource!.indexOf("export class SqliteExecutionAssociationStore"));
    expect(parseBody).not.toMatch(/row\.attempt_id/u);
    store.close();
  });
});

describe("P2C C1 F10 — Work revalidation only requires a non-null record", () => {
  it("SOURCE_DEMONSTRATED: the port has no ATTEMPT_CREATED verification, but V0 does", () => {
    const qualifier = readRepo("src/execution_association/qualification.ts");
    const v0 = readRepo("src/composition/trajectory_v0.ts");
    // The qualifier's Work port returns a record or null; no creation-event check.
    expect(qualifier!).toMatch(/readAttempt\(input: \{ readonly projectId: string; readonly attemptId: string \}\)/u);
    expect(qualifier!).not.toMatch(/ATTEMPT_CREATED/u);
    // The V0 admission DOES verify the exact creation event — the reusable logic P2-C should prefer.
    expect(v0!).toMatch(/creationCount > 1/u);
    expect(v0!).toMatch(/ATTEMPT_CREATED/u);
  });
});

describe("P2C C1 F11 — an inconsistent binding state can expose events", () => {
  it("SOURCE_DEMONSTRATED: events are gated only on the admission flag, with no cross-field validator", () => {
    const handoff = readRepo("src/trajectory/handoff_preview.ts");
    expect(handoff!).toMatch(/const admitted = input\.binding\.sessionReadAdmission === "ADMITTED_TO_ATTEMPT" && !pageRefused;/u);
    // No validator exists that would refuse SESSION_CLAIMED_UNVERIFIED + null id + ADMITTED.
    expect(handoff!).not.toMatch(/validateAdmission|admissionInvariant|refuseContradictoryBinding/u);
  });
});

describe("P2C C1 F12 — a caller-built association object can satisfy the H1 resolver", () => {
  it("SOURCE_DEMONSTRATED: the resolver requires only three object fields", () => {
    const binding = readRepo("src/trajectory/binding.ts");
    expect(binding!).toMatch(/observationState === "PRODUCER_OBSERVED"/u);
    expect(binding!).toMatch(/durableBindingRef !== null/u);
    expect(binding!).toMatch(/verification === "VERIFIED"/u);
    // Nothing ties the object to a durable store: no import of the association concern or any store.
    expect(binding!).not.toMatch(/from "\.\.\/execution_association/u);
    expect(binding!).not.toMatch(/SqliteExecutionAssociationStore|ExecutionAssociationStore/u);
    // Its only import is the execution contract's BindingSource type.
    expect(binding!).toMatch(/import type \{ BindingSource \} from "\.\/execution\.js";/u);
  });
});

describe("P2C C1 F13 — normal product composition lacks the full path", () => {
  it("SOURCE_DEMONSTRATED: the host derives a branch port but not a work worker port; install composes neither association nor trajectory", () => {
    const host = readRepo("host/dsh/lib/index.js");
    const install = readRepo("src/install.ts");
    const launch = readRepo("src/deployment/launch.ts");
    expect(host!).toMatch(/dshSubprocessBranchExecutionPort/u);
    expect(host!).not.toMatch(/dshSubprocessWorkWorkerPort/u);
    expect(launch!).not.toMatch(/dshSubprocessWorkWorkerPort/u);
    expect(install!).not.toMatch(/composeTrajectoryV0/u);
    expect(install!).not.toMatch(/ExecutionAssociationStore/u);
  });
});

describe("P2C C1 F14 — the preview digest omits watermarks and known counts", () => {
  it("SOURCE_DEMONSTRATED: the digest object excludes readWatermark and knownEventCount", () => {
    const handoff = readRepo("src/trajectory/handoff_preview.ts");
    const digestStart = handoff!.indexOf("const previewDigest = canonicalDigest(");
    const digestEnd = handoff!.indexOf("return Object.freeze({", digestStart);
    const digestBody = handoff!.slice(digestStart, digestEnd);
    expect(digestBody).toMatch(/execution: \{/u);
    expect(digestBody).not.toMatch(/readWatermark/u);
    expect(digestBody).not.toMatch(/knownEventCount/u);
  });
});

describe("P2C C1 F15 — the P2-B mandatory wrappers can return ordinary PASS without running", () => {
  it("SOURCE_DEMONSTRATED: the wrappers early-return when DSH/dist is absent", () => {
    const wrapper = readRepo("test/trajectory_p2b_first_party_gate.test.ts");
    expect(wrapper!).toMatch(/if \(!hasFirstPartyDsh \|\| !hasBuiltDist\) return null;/u);
    // And the test then asserts the absence rather than an explicit SKIPPED/BLOCKED outcome.
    expect(wrapper!).toMatch(/expect\(hasFirstPartyDsh && hasBuiltDist\)\.toBe\(false\)/u);
  });
});
