/**
 * Trajectory-P2-B §7/§9 — THE DURABLE EXECUTION-ASSOCIATION CONTRACT.
 *
 * Controlled, in-memory tests of the durable concern's OWN semantics: typed strict records, stable
 * event identity, byte-identical idempotency, same-id divergence refusal, ALL-candidate conflict
 * retention, observation-window finalization, and the source-verifying read side.
 *
 * These are CONTROLLED FIXTURES. They establish the contract; they do NOT establish that a real DSH
 * host ran (that is `trajectory_p2b_first_party_gate.test.ts`) and they do NOT establish cold recovery
 * (that is `trajectory_p2b_cold_recovery.test.ts`).
 *
 * SAFETY. In-memory SQLite, no DSH, no model, no provider, no network, no personal data.
 */
import { describe, expect, it } from "vitest";

import {
  SqliteExecutionAssociationStore,
  ExecutionAssociationStoreError,
  ExecutionAssociationConflictError,
  associationEventId,
  computeTrustedSourceBasis,
  createExecutionAssociationRecorder,
  makeAssociationQualifier,
  registryFromSingleBasis,
  parseSessionIdentityObserved,
  EXECUTION_ASSOCIATION_SCHEMA_VERSION,
  type SessionIdentityObservedPayload,
  type TrustedSourceBasis,
} from "../src/execution_association/index.js";
import type { CorrelatedSessionIdentityObservation as Correlated } from "../src/interaction/work_delegation.js";

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({
  adapterId: "dsh-subprocess-work-worker:p2b-test",
  workerBin: "/test/bin/dsh.js",
  nodeExecPath: "/test/bin/node.exe",
});

/** A correlated observation, shaped exactly like the delegation correlation produces. */
function correlated(input: {
  attemptId?: string;
  invocationId?: string;
  sessionId: string;
  hostLocalJobId?: string | null;
  declared?: string;
}): Correlated {
  const observation = Object.freeze({
    schemaVersion: 1,
    invocationId: input.invocationId ?? "wpi-00000000-0000-4000-8000-000000000001",
    dshSessionId: input.sessionId,
    source: "DIRECT_CHILD_IPC_REPORT" as const,
    directChildPid: 4242,
    observedAt: "2026-01-01T00:00:00.000Z",
    sourceQualification: (input.declared ?? "FIRST_PARTY_DSH_QUALIFIED") as never,
    observationState: "OBSERVED" as const,
    conflictingSessionId: null,
    proves: Object.freeze([]),
    doesNotProve: Object.freeze([]),
  });
  return Object.freeze({
    hostLocalJobId: input.hostLocalJobId ?? "wdj-00000000-0000-4000-8000-00000000000a",
    attemptId: input.attemptId ?? "attempt-00000000000000000000000000000001",
    observation,
  }) as Correlated;
}

function recorderOn(store: SqliteExecutionAssociationStore) {
  return createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
}

/* ================================================================== §7 durable observation */

describe("P2B B1 §7 — typed, append-only durable observation", () => {
  it("persists an exact observation and replays it with all identities preserved", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    const outcome = recorder.recordIdentity(correlated({ sessionId: "worker-aaaa", hostLocalJobId: "wdj-x" }));
    expect(outcome.state).toBe("APPENDED");

    const events = store.replay();
    expect(events).toHaveLength(1);
    const payload = events[0]!.payload as SessionIdentityObservedPayload;
    expect(payload.projectId).toBe("p2b");
    expect(payload.attemptId).toBe("attempt-00000000000000000000000000000001");
    expect(payload.invocationId).toBe("wpi-00000000-0000-4000-8000-000000000001");
    expect(payload.dshSessionId).toBe("worker-aaaa");
    expect(payload.hostLocalJobId).toBe("wdj-x");
    expect(payload.sourceKind).toBe("FIRST_PARTY_DSH_HOST");
    expect(payload.sourceBasis.workerBinDigest).toBe(BASIS.workerBinDigest);
    store.close();
  });

  it("§7.3/§7.4 — a repeated identical delivery is idempotent, even with a new delivery timestamp", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    const first = recorder.recordIdentity(correlated({ sessionId: "worker-same" }));
    // A retry: the same logical observation. The payload has no timestamp, so it is byte-identical.
    const second = recorder.recordIdentity(correlated({ sessionId: "worker-same" }));
    expect(first.state).toBe("APPENDED");
    expect(second.state).toBe("IDEMPOTENT");
    if (first.state === "REJECTED" || second.state === "REJECTED") throw new Error("unreachable");
    expect(second.eventId).toBe(first.eventId);
    expect(store.replay()).toHaveLength(1);
    store.close();
  });

  it("§7.3 — the same canonical event id with DIFFERENT content fails closed", () => {
    /**
     * -------------------------------------------------------------- CHANGED (P2C C2)
     *
     * C2 added the canonical-identity check, so a payload whose IDENTITY fields differ now fails the
     * identity check first (a stronger, earlier refusal). The event_conflict property is still real and is
     * exercised here through a NON-identity field: the same logical identity (same canonical id) with a
     * different source basis is divergent content under one id, and must conflict rather than overwrite.
     */
    const store = new SqliteExecutionAssociationStore(":memory:");
    const eventId = associationEventId({
      type: "SESSION_IDENTITY_OBSERVED",
      projectId: "p2b",
      attemptId: "attempt-00000000000000000000000000000001",
      invocationId: "wpi-00000000-0000-4000-8000-000000000001",
      dshSessionId: "worker-a",
    });
    const base = (basis: typeof BASIS) => ({
      eventId,
      projectId: "p2b",
      type: "SESSION_IDENTITY_OBSERVED" as const,
      payload: {
        schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION,
        projectId: "p2b",
        attemptId: "attempt-00000000000000000000000000000001",
        invocationId: "wpi-00000000-0000-4000-8000-000000000001",
        dshSessionId: "worker-a",
        sourceBasis: basis,
        sourceKind: "FIRST_PARTY_DSH_HOST" as const,
        sourceQualificationDeclared: "FIRST_PARTY_DSH_QUALIFIED",
        directChildPid: 1,
        hostLocalJobId: null,
      },
    });
    const otherBasis = computeTrustedSourceBasis({ adapterId: "other", workerBin: "/other/dsh.js", nodeExecPath: "/other/node.exe" });
    store.append(base(BASIS));
    expect(() => store.append(base(otherBasis))).toThrow(ExecutionAssociationConflictError);
    store.close();
  });

  it("§6.3 (C2) — a payload whose identity fields disagree with its event id is refused", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const eventId = associationEventId({
      type: "SESSION_IDENTITY_OBSERVED",
      projectId: "p2b",
      attemptId: "attempt-00000000000000000000000000000001",
      invocationId: "wpi-00000000-0000-4000-8000-000000000001",
      dshSessionId: "worker-a",
    });
    expect(() =>
      store.append({
        eventId,
        projectId: "p2b",
        type: "SESSION_IDENTITY_OBSERVED",
        payload: {
          schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION,
          projectId: "p2b",
          attemptId: "attempt-00000000000000000000000000000001",
          invocationId: "wpi-00000000-0000-4000-8000-000000000001",
          dshSessionId: "worker-DIFFERENT",
          sourceBasis: BASIS,
          sourceKind: "FIRST_PARTY_DSH_HOST",
          sourceQualificationDeclared: "x",
          directChildPid: 1,
          hostLocalJobId: null,
        } as never,
      }),
    ).toThrow(/canonical identity/u);
    store.close();
  });

  it("§7.5 — three distinct identities for one invocation are ALL preserved", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    for (const sessionId of ["worker-a", "worker-b", "worker-c"]) {
      expect(recorder.recordIdentity(correlated({ sessionId })).state).toBe("APPENDED");
    }
    const sessions = store
      .replay()
      .map((event) => (event.payload as SessionIdentityObservedPayload).dshSessionId)
      .sort();
    expect(sessions).toEqual(["worker-a", "worker-b", "worker-c"]);
    // This is exactly the case the P2-A two-slot tracker LOST (F6).
    store.close();
  });

  it("§7.5 — distinct invocations under one attempt are preserved separately", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-i1", invocationId: "wpi-i1" }));
    recorder.recordIdentity(correlated({ sessionId: "worker-i2", invocationId: "wpi-i2" }));
    const invocations = [...new Set(store.replay().map((event) => event.payload.invocationId))].sort();
    expect(invocations).toEqual(["wpi-i1", "wpi-i2"]);
    store.close();
  });

  it("§7.6 — a malformed payload fails closed at the store boundary", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    expect(() =>
      store.append({
        eventId: "xas-bad",
        projectId: "p2b",
        type: "SESSION_IDENTITY_OBSERVED",
        // Missing sourceBasis and every required field.
        payload: { schemaVersion: 1, projectId: "p2b", attemptId: "a", invocationId: "i", dshSessionId: "s" } as never,
      }),
    ).toThrow(ExecutionAssociationStoreError);
    store.close();
  });

  it("§7.1 — the strict parser refuses an unknown field (no generic bag)", () => {
    expect(() =>
      parseSessionIdentityObserved({
        schemaVersion: 1,
        projectId: "p2b",
        attemptId: "a",
        invocationId: "i",
        dshSessionId: "s",
        sourceBasis: BASIS,
        sourceKind: "FIRST_PARTY_DSH_HOST",
        sourceQualificationDeclared: "x",
        directChildPid: null,
        hostLocalJobId: null,
        extraField: "smuggled",
      }),
    ).toThrow(/unknown field "extraField"/u);
  });

  it("§7.6 — the recorder refuses a non-producer source", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    const forged = {
      hostLocalJobId: "wdj-x",
      attemptId: "attempt-00000000000000000000000000000001",
      observation: { ...correlated({ sessionId: "worker-x" }).observation, source: "CALLER_DECLARED" },
    } as unknown as Correlated;
    expect(recorder.recordIdentity(forged)).toMatchObject({ state: "REJECTED" });
    expect(store.replay()).toHaveLength(0);
    store.close();
  });
});

/* ================================================================== §8 window finalization */

describe("P2B B1 §8 — observation-window finalization", () => {
  it("§8.1 — an unfinalized invocation is durable but the window is not closed", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    recorderOn(store).recordIdentity(correlated({ sessionId: "worker-open" }));
    const types = store.replay().map((event) => event.type);
    expect(types).toEqual(["SESSION_IDENTITY_OBSERVED"]);
    expect(types).not.toContain("INVOCATION_OBSERVATION_FINALIZED");
    store.close();
  });

  it("§8.1 — finalizing records the closed window with the candidate count from committed evidence", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-a" }));
    recorder.recordIdentity(correlated({ sessionId: "worker-b" }));
    const outcome = recorder.finalizeInvocation({
      attemptId: "attempt-00000000000000000000000000000001",
      invocationId: "wpi-00000000-0000-4000-8000-000000000001",
      closeReason: "INVOCATION_RETURNED",
    });
    expect(outcome.state).toBe("APPENDED");
    const finalized = store.replay().find((event) => event.type === "INVOCATION_OBSERVATION_FINALIZED")!;
    expect(finalized.payload).toMatchObject({ windowState: "CLOSED", closeReason: "INVOCATION_RETURNED", observedCandidateCount: 2 });
    store.close();
  });
});

/* ================================================================== §9 qualification */

function qualificationHarness(options: {
  readonly store: SqliteExecutionAssociationStore;
  readonly work?: { readonly taskId: string | null; readonly state: string | null } | null;
  readonly header?: { readonly readState: string; readonly sessionId: string | null };
}) {
  return makeAssociationQualifier({
    store: options.store,
    registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
    work: {
      /**
       * -------------------------------------------------------------- CHANGED (P2C C2)
       *
       * The Work revalidation port now returns an EXPLICIT result (ok/refused) so the qualifier can reuse
       * the V0S/H0 admission logic and verify the exact ATTEMPT_CREATED event (P2-C F10).
       */
      readAttempt: () =>
        options.work === undefined
          ? { ok: true as const, taskId: "t1", state: "RUNNING", creationEventId: "ev-1" }
          : options.work === null
            ? { ok: false as const, reason: "canonical Work has no such attempt under this project" }
            : { ok: true as const, taskId: options.work.taskId, state: options.work.state, creationEventId: "ev-1" },
    },
    dsh: {
      async readHeaderIdentity(sessionId: string) {
        const header = options.header ?? { readState: "READ_OK", sessionId };
        return {
          readState: header.readState as never,
          header:
            header.readState === "READ_OK" && header.sessionId !== null
              ? { sessionId: header.sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }
              : null,
          detail: "test",
        };
      },
    },
  });
}

describe("P2B B2 §9 — source-verifying qualification", () => {
  const ATTEMPT = "attempt-00000000000000000000000000000001";

  it("§9.1/§9.5 — a unique, closed, basis-matching observation qualifies and yields a real H1 association", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-ok" }));
    recorder.finalizeAttempt({ attemptId: ATTEMPT, closeReason: "INVOCATION_RETURNED" });

    const result = await qualificationHarness({ store }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.summary.qualifiedCount).toBe(1);
    const qualified = result.qualifications[0]!;
    expect(qualified.state).toBe("ASSOCIATION_QUALIFIED");
    if (qualified.state !== "ASSOCIATION_QUALIFIED") throw new Error("unreachable");
    expect(qualified.dshSessionId).toBe("worker-ok");
    expect(qualified.durableBindingRef).toMatch(/^xas-[0-9a-f]{64}$/u);
    // §9.5: the H1 association is assembled from real evidence — a real durableBindingRef, no dummy.
    expect(qualified.h1Association.durableBindingRef).toBe(qualified.durableBindingRef);
    expect(qualified.h1Association.verification).toBe("VERIFIED");
    expect(qualified.h1Association.observationState).toBe("PRODUCER_OBSERVED");
    expect(qualified.h1Association.producerEvidence.source).toBe("CANONICAL_ATTEMPT_BINDING");
    store.close();
  });

  it("§9.1 — an observation whose source basis does NOT match the deployment is refused", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const foreignBasis = computeTrustedSourceBasis({ adapterId: "stub", workerBin: "/other/dsh.js", nodeExecPath: "/other/node.exe" });
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: foreignBasis, sourceKind: "CONTROLLED_STUB" });
    recorder.recordIdentity(correlated({ sessionId: "worker-foreign", declared: "FIRST_PARTY_DSH_QUALIFIED" }));
    recorder.finalizeAttempt({ attemptId: ATTEMPT, closeReason: "INVOCATION_RETURNED" });

    /**
     * §5 B0-C3: the record declares FIRST_PARTY_DSH_QUALIFIED, but its BASIS is a controlled stub. The
     * verifier holds the real basis, so the declaration grants nothing and the association is refused.
     */
    const result = await qualificationHarness({ store }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("SOURCE_REFUSED");
    expect(result.summary.qualifiedCount).toBe(0);
    store.close();
  });

  it("§9.1 — an attempt Work does not know is refused", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-orphan" }));
    recorder.finalizeAttempt({ attemptId: ATTEMPT, closeReason: "INVOCATION_RETURNED" });
    const result = await qualificationHarness({ store, work: null }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("SOURCE_REFUSED");
    store.close();
  });

  it("§8/§9.3 — an UNFINALIZED window is durable but NOT qualified", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    recorderOn(store).recordIdentity(correlated({ sessionId: "worker-unfinalized" }));
    const result = await qualificationHarness({ store }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("OBSERVATION_INCOMPLETE");
    store.close();
  });

  it("§9.3 — two distinct identities for one invocation is a CONFLICT, never first-wins", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-a" }));
    recorder.recordIdentity(correlated({ sessionId: "worker-b" }));
    recorder.finalizeAttempt({ attemptId: ATTEMPT, closeReason: "INVOCATION_RETURNED" });
    const result = await qualificationHarness({ store }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("CONFLICT");
    expect(result.summary.conflictCount).toBe(1);
    // Both candidates remain visible.
    expect((result.qualifications[0] as { candidates: readonly unknown[] }).candidates).toHaveLength(2);
    store.close();
  });

  it("§10.4 — an unreadable source is SOURCE_UNAVAILABLE, distinct from a conflict and from absent", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-gone" }));
    recorder.finalizeAttempt({ attemptId: ATTEMPT, closeReason: "INVOCATION_RETURNED" });
    const result = await qualificationHarness({ store, header: { readState: "SESSION_MISSING", sessionId: null } }).qualifyAttempt({
      projectId: "p2b",
      attemptId: ATTEMPT,
    });
    expect(result.qualifications[0]!.state).toBe("SOURCE_UNAVAILABLE");
    store.close();
  });

  it("§9.2 — no durable observation at all is NO_DURABLE_OBSERVATION", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const result = await qualificationHarness({ store }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications).toHaveLength(0);
    expect(result.summary.invocationCount).toBe(0);
    store.close();
  });

  it("§9.4 — two invocations of one attempt are qualified independently", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-i1", invocationId: "wpi-i1" }));
    recorder.recordIdentity(correlated({ sessionId: "worker-i2", invocationId: "wpi-i2" }));
    recorder.finalizeAttempt({ attemptId: ATTEMPT, closeReason: "INVOCATION_RETURNED" });
    const result = await qualificationHarness({ store }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.summary.invocationCount).toBe(2);
    expect(result.summary.qualifiedCount).toBe(2);
    store.close();
  });
});
