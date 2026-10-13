/**
 * Trajectory-P2-C §11.5/§12 — ADVERSARIAL ATTRIBUTED-ADMISSION CONTROLS.
 *
 * The negative cases the ruling requires: each must REFUSE to authorize an unrelated or unqualified
 * session, and none may silently expose events. Controlled fixtures; the real-DSH positive path is the
 * cold-preview gate.
 *
 * SAFETY. In-memory SQLite; no model, no network, no personal session.
 */
import { describe, expect, it } from "vitest";

import {
  SqliteExecutionAssociationStore,
  computeTrustedSourceBasis,
  createExecutionAssociationRecorder,
  makeAssociationQualifier,
  makeTrustedSourceRegistry,
  registryFromSingleBasis,
  type TrustedSourceBasis,
} from "../src/execution_association/index.js";
import { validateAdmissionInvariants } from "../src/trajectory/index.js";
import { composeAttributedPreview } from "../src/composition/attributed_preview.js";
import type { CorrelatedSessionIdentityObservation as Correlated } from "../src/interaction/work_delegation.js";

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });
const ATTEMPT = "attempt-00000000000000000000000000000001";

function correlated(input: { attemptId: string; sessionId: string; invocationId?: string; kind?: string }): Correlated {
  return Object.freeze({
    hostLocalJobId: "wdj-00000000000000000000000000000001",
    attemptId: input.attemptId,
    observation: Object.freeze({
      schemaVersion: 1,
      invocationId: input.invocationId ?? "wpi-00000000-0000-4000-8000-000000000001",
      dshSessionId: input.sessionId,
      reportedSessionId: input.sessionId,
      source: "DIRECT_CHILD_IPC_REPORT" as const,
      directChildPid: 7,
      observedAt: "2026-01-01T00:00:00.000Z",
      sourceQualification: (input.kind ?? "FIRST_PARTY_DSH_QUALIFIED") as never,
      observationState: "OBSERVED" as const,
      conflictingSessionId: null,
      proves: Object.freeze([]),
      doesNotProve: Object.freeze([]),
    }),
  }) as Correlated;
}

/** A minimal Work read: only ATTEMPT is known. */
const work = {
  readAttempt: ({ attemptId }: { readonly attemptId: string }) =>
    attemptId === ATTEMPT ? { ok: true as const, taskId: "t1", state: "RUNNING", creationEventId: "ev-1" } : { ok: false as const, reason: "no canonical attempt" },
};

function readerFor(sessionId: string, events: readonly unknown[]) {
  return {
    sourceIdentity: "fixture",
    evidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
    async readEvents(request: { readonly sessionId: string }) {
      return {
        schemaVersion: 1, readState: "READ_OK", sessionId: request.sessionId, header: null,
        sourceIdentity: "fixture", sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE",
        throughSeq: events.length === 0 ? null : events.length - 1, knownEventCount: events.length, inheritedEventCount: 0,
        requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: events.length,
        pageBounded: true, diskIoBounded: true,
        durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED", persistedEventCount: events.length, syntheticRecoveryEventCount: 0,
        events, knownParentSession: null, proves: Object.freeze([]), doesNotProve: Object.freeze([]), detail: "fixture",
      } as never;
    },
  };
}

const EVENTS = [
  { sessionId: "worker-x", seq: 0, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 1, surface: null, summary: "turn 1 opened", durationMs: null, observedStatus: null },
];

/** A minimal controller whose canonical history contains exactly one ATTEMPT_CREATED for ATTEMPT. */
function controllerFixture() {
  const created = { event_type: "ATTEMPT_CREATED", entity_type: "attempt", entity_id: ATTEMPT, project_id: "p2c", event_id: "ev-created-1", project_sequence: 1, payload: { task_id: "t1", envelope_id: "env-1", attempt_no: 1 } };
  return {
    store: { listEvents: () => [created] },
    attemptWorkRecord: (id: string) => (id === ATTEMPT ? { state: "RUNNING", taskId: "t1", report: null, envelope: null } : null),
    attemptWorldBasis: () => null,
    attemptBasisForResolution: () => null,
  };
}

function service(input: {
  readonly store: SqliteExecutionAssociationStore;
  readonly work?: unknown;
  readonly header?: { readonly readState: string; readonly sessionId: string | null };
  readonly reader?: unknown;
  readonly registry?: unknown;
}) {
  const qualifier = makeAssociationQualifier({
    store: input.store,
    registry: (input.registry ?? registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST")) as never,
    work: (input.work ?? work) as never,
    dsh: {
      async readHeaderIdentity(sessionId: string) {
        const header = input.header ?? { readState: "READ_OK", sessionId };
        return { readState: header.readState as never, header: header.readState === "READ_OK" && header.sessionId !== null ? { sessionId: header.sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null } : null, detail: "control" };
      },
    },
  });
  return composeAttributedPreview({
    projectId: "p2c",
    controller: controllerFixture() as never,
    promotions: { promotionFactsSync: () => [] } as never,
    qualifier,
    store: input.store,
    sessionReader: (input.reader ?? readerFor("worker-x", EVENTS)) as never,
    projectEvolutionOf: async () => ({ projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null, failureOrigin: null, failureKind: null }) as never,
  });
}

describe("P2C §11.5 — adversarial attributed-admission controls", () => {
  it("§11.5 a Session that exists but has NO durable association is never read", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const svc = service({ store });
    const result = await svc.previewAttempt({ attemptId: ATTEMPT });
    expect(result.selection.state).toBe("NO_DURABLE_EVIDENCE");
    expect(result.preview.execution.events).toEqual([]);
    store.close();
  });

  it("§11.5 an untrusted source manifest cannot qualify", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    // Record with a DIFFERENT basis than the verifier's registry.
    const foreign = computeTrustedSourceBasis({ adapterId: "stub", workerBin: "/other/dsh.js", nodeExecPath: "/other/node.exe" });
    createExecutionAssociationRecorder({ store, projectId: "p2c", sourceBasis: foreign, sourceKind: "FIRST_PARTY_DSH_HOST" }).recordIdentity(correlated({ attemptId: ATTEMPT, sessionId: "worker-x" }));
    createExecutionAssociationRecorder({ store, projectId: "p2c", sourceBasis: foreign, sourceKind: "FIRST_PARTY_DSH_HOST" }).finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    const result = await service({ store }).previewAttempt({ attemptId: ATTEMPT });
    expect(result.preview.execution.dshSessionId).toBeNull();
    expect(result.preview.execution.events).toEqual([]);
    store.close();
  });

  it("§11.5 a Session Header that contradicts the association is refused", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2c", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(correlated({ attemptId: ATTEMPT, sessionId: "worker-x" }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    const result = await service({ store, header: { readState: "READ_OK", sessionId: "worker-different" } }).previewAttempt({ attemptId: ATTEMPT });
    expect(result.preview.execution.dshSessionId).toBeNull();
    expect(result.preview.execution.events).toEqual([]);
    store.close();
  });

  it("§11.5 an unavailable reader leaves the session unread, never an empty success", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2c", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(correlated({ attemptId: ATTEMPT, sessionId: "worker-x" }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    const svc = composeAttributedPreview({
      projectId: "p2c",
      controller: controllerFixture() as never,
      promotions: { promotionFactsSync: () => [] } as never,
      qualifier: makeAssociationQualifier({ store, registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"), work: work as never, dsh: { async readHeaderIdentity(sessionId: string) { return { readState: "READ_OK" as const, header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "ok" }; } } }),
      store,
      sessionReader: undefined,
      projectEvolutionOf: async () => ({ projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null, failureOrigin: null, failureKind: null }) as never,
    });
    const result = await svc.previewAttempt({ attemptId: ATTEMPT });
    // The binding is verified but no reader exists, so the read admission is NOT_REQUESTED and no events appear.
    expect(result.preview.execution.events).toEqual([]);
    expect(result.preview.execution.sessionReadAdmission).toBe("NOT_REQUESTED");
    store.close();
  });

  it("§11.5 several qualified invocations require explicit selection", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2c", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(correlated({ attemptId: ATTEMPT, sessionId: "worker-i1", invocationId: "wpi-i1" }));
    recorder.recordIdentity(correlated({ attemptId: ATTEMPT, sessionId: "worker-i2", invocationId: "wpi-i2" }));
    // P2-D0 §7.1: each Invocation closes from its own observed boundary.
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-i1", closeReason: "CHILD_EXIT_OBSERVED" });
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-i2", closeReason: "CHILD_EXIT_OBSERVED" });
    const result = await service({ store }).previewAttempt({ attemptId: ATTEMPT });
    expect(result.selection.state).toBe("AMBIGUOUS_REQUIRES_SELECTION");
    expect(result.preview.execution.dshSessionId).toBeNull();
    store.close();
  });

  it("§11.5 a conflict within an invocation does not select an arbitrary session", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2c", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(correlated({ attemptId: ATTEMPT, sessionId: "worker-a" }));
    recorder.recordIdentity(correlated({ attemptId: ATTEMPT, sessionId: "worker-b" }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    const result = await service({ store }).previewAttempt({ attemptId: ATTEMPT });
    expect(result.selection.state).toBe("NO_DURABLE_EVIDENCE");
    expect(result.preview.execution.dshSessionId).toBeNull();
    store.close();
  });

  it("§11.5 an invalid event page is refused by page integrity", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2c", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(correlated({ attemptId: ATTEMPT, sessionId: "worker-x" }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    // A page that claims 5 events while carrying 1 — RETURNED_COUNT_MISMATCH.
    const badReader = {
      sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
      async readEvents(request: { readonly sessionId: string }) {
        return { schemaVersion: 1, readState: "READ_OK", sessionId: request.sessionId, header: null, sourceIdentity: "fixture", sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE", throughSeq: 0, knownEventCount: 5, inheritedEventCount: 0, requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: 5, pageBounded: true, diskIoBounded: true, durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED", persistedEventCount: 5, syntheticRecoveryEventCount: 0, events: EVENTS, knownParentSession: null, proves: [], doesNotProve: [], detail: "bad" } as never;
      },
    };
    const result = await service({ store, reader: badReader }).previewAttempt({ attemptId: ATTEMPT });
    expect(result.preview.execution.events).toEqual([]);
    expect(result.preview.attribution.pageIntegrity).toBe("INVALID");
    store.close();
  });

  it("§12.1 a caller-declared source label does not grant verification", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    // A CONTROLLED_STUB record that DECLARES first-party in its label.
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2c", sourceBasis: BASIS, sourceKind: "CONTROLLED_STUB" });
    recorder.recordIdentity(correlated({ attemptId: ATTEMPT, sessionId: "worker-x", kind: "FIRST_PARTY_DSH_QUALIFIED" }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    const result = await service({ store }).previewAttempt({ attemptId: ATTEMPT });
    expect(result.preview.execution.dshSessionId).toBeNull();
    store.close();
  });

  it("§12.36 invalid binding-state combinations cannot expose events (F11)", () => {
    expect(validateAdmissionInvariants({ binding: { sessionBindingStatus: "SESSION_CLAIMED_UNVERIFIED", dshSessionId: null, claimedSessionId: "x", sessionReadAdmission: "ADMITTED_TO_ATTEMPT" } }).admissible).toBe(false);
    expect(validateAdmissionInvariants({ binding: { sessionBindingStatus: "SESSION_UNBOUND", dshSessionId: null, claimedSessionId: null, sessionReadAdmission: "ADMITTED_TO_ATTEMPT" } }).admissible).toBe(false);
  });
});
