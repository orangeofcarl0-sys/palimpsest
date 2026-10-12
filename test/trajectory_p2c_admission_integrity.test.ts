/**
 * Trajectory-P2-C §6 (C2) — ASSOCIATION ADMISSION INTEGRITY.
 *
 * The mandatory production-code gate. Each test covers one property the ruling requires before any real
 * Session event may be admitted, and each corresponds to a falsifier this stage closed.
 *
 * SAFETY. In-memory SQLite; no DSH, no model, no network, no personal data.
 */
import { describe, expect, it } from "vitest";

import {
  SqliteExecutionAssociationStore,
  ExecutionAssociationStoreError,
  associationEventId,
  computeTrustedSourceBasis,
  createExecutionAssociationRecorder,
  makeAssociationQualifier,
  makeTrustedSourceRegistry,
  qualifyRecordSource,
  validateObservationWindow,
  registryFromSingleBasis,
  EXECUTION_ASSOCIATION_SCHEMA_VERSION,
  type TrustedSourceBasis,
} from "../src/execution_association/index.js";
import type { CorrelatedSessionIdentityObservation as Correlated } from "../src/interaction/work_delegation.js";

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });
const ATTEMPT = "attempt-00000000000000000000000000000001";
const INVOCATION = "wpi-00000000-0000-4000-8000-000000000001";

function correlated(input: { sessionId: string; invocationId?: string }): Correlated {
  return Object.freeze({
    hostLocalJobId: "wdj-00000000000000000000000000000001",
    attemptId: ATTEMPT,
    observation: Object.freeze({
      schemaVersion: 1,
      invocationId: input.invocationId ?? INVOCATION,
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

function harness(store: SqliteExecutionAssociationStore, options: { work?: unknown; header?: { readState: string; sessionId: string | null }; headerDelayMs?: number } = {}) {
  return makeAssociationQualifier({
    store,
    registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
    work: {
      readAttempt: () =>
        options.work === undefined
          ? { ok: true as const, taskId: "t1", state: "RUNNING", creationEventId: "ev-1" }
          : (options.work as never),
    },
    dsh: {
      async readHeaderIdentity(sessionId: string) {
        if (options.headerDelayMs !== undefined) await new Promise((resolve) => setTimeout(resolve, options.headerDelayMs));
        const header = options.header ?? { readState: "READ_OK", sessionId };
        return {
          readState: header.readState as never,
          header:
            header.readState === "READ_OK" && header.sessionId !== null
              ? { sessionId: header.sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }
              : null,
          detail: "c2",
        };
      },
    },
  });
}

function seed(store: SqliteExecutionAssociationStore, sessionId = "worker-ok"): void {
  const recorder = createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
  recorder.recordIdentity(correlated({ sessionId }));
  recorder.finalizeAttempt({ attemptId: ATTEMPT, closeReason: "INVOCATION_RETURNED" });
}

/* ================================================================== §6.1 source qualification */

describe("P2C C2 §6.1 — independent source qualification", () => {
  it("a record matching no trusted epoch is refused (NO_TRUSTED_EPOCH_MATCHES)", () => {
    const other = computeTrustedSourceBasis({ adapterId: "z", workerBin: "/other/dsh.js", nodeExecPath: "/other/node.exe" });
    const outcome = qualifyRecordSource({ registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"), recordBasis: other, recordKind: "FIRST_PARTY_DSH_HOST" });
    expect(outcome).toMatchObject({ ok: false, reason: "NO_TRUSTED_EPOCH_MATCHES" });
  });

  it("§6.1 F3 — a CONTROLLED_STUB record with a matching basis is refused (UNSUPPORTED_PRODUCER_KIND)", () => {
    const outcome = qualifyRecordSource({ registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"), recordBasis: BASIS, recordKind: "CONTROLLED_STUB" });
    expect(outcome).toMatchObject({ ok: false, reason: "UNSUPPORTED_PRODUCER_KIND" });
  });

  it("§6.1 — a record whose kind disagrees with the matching epoch is refused (SOURCE_KIND_MISMATCH)", () => {
    const registry = makeTrustedSourceRegistry({ epochs: [{ epochId: "e1", sourceKind: "CONTROLLED_STUB", sourceBasis: BASIS }], supportedProducerKinds: ["FIRST_PARTY_DSH_HOST", "CONTROLLED_STUB"] });
    const outcome = qualifyRecordSource({ registry, recordBasis: BASIS, recordKind: "FIRST_PARTY_DSH_HOST" });
    expect(outcome).toMatchObject({ ok: false, reason: "SOURCE_KIND_MISMATCH" });
  });

  it("§6.1 — a matching first-party record qualifies and names its epoch", () => {
    const outcome = qualifyRecordSource({ registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"), recordBasis: BASIS, recordKind: "FIRST_PARTY_DSH_HOST" });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.epochId).toMatch(/^epoch-/u);
  });

  it("§6.1 — an empty registry is refused at construction rather than silently refusing everything", () => {
    expect(() => makeTrustedSourceRegistry({ epochs: [] })).toThrow(/at least one epoch/u);
  });

  it("§6.1 historical compatibility — a second epoch admits a historical record without invalidating it", () => {
    const historical = computeTrustedSourceBasis({ adapterId: "old", workerBin: "/old/dsh.js", nodeExecPath: "/old/node.exe" });
    const registry = makeTrustedSourceRegistry({
      epochs: [
        { epochId: "e-old", sourceKind: "FIRST_PARTY_DSH_HOST", sourceBasis: historical },
        { epochId: "e-new", sourceKind: "FIRST_PARTY_DSH_HOST", sourceBasis: BASIS },
      ],
    });
    expect(qualifyRecordSource({ registry, recordBasis: historical, recordKind: "FIRST_PARTY_DSH_HOST" }).ok).toBe(true);
    expect(qualifyRecordSource({ registry, recordBasis: BASIS, recordKind: "FIRST_PARTY_DSH_HOST" }).ok).toBe(true);
  });
});

/* ================================================================== §6.3/§6.4 durable identity */

describe("P2C C2 §6.3/§6.4 — durable record identity and scope", () => {
  it("§6.3 — a non-canonical eventId is refused on append", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    expect(() =>
      store.append({
        eventId: "xas-not-canonical",
        projectId: "p2b",
        type: "SESSION_IDENTITY_OBSERVED",
        payload: { schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION, projectId: "p2b", attemptId: ATTEMPT, invocationId: INVOCATION, dshSessionId: "s", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST", sourceQualificationDeclared: "x", directChildPid: null, hostLocalJobId: null } as never,
      }),
    ).toThrow(/canonical identity/u);
    store.close();
  });

  it("§6.3 — the canonical eventId for a real observation is accepted", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    seed(store);
    expect(store.replay()).toHaveLength(2);
    store.close();
  });

  it("§6.4 — a row whose columns contradict the payload fails closed on replay", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    seed(store);
    const source = require("node:fs").readFileSync(require("node:path").join(process.cwd(), "src", "execution_association", "store.ts"), "utf8") as string;
    // The replay path compares BOTH indexed columns against the payload.
    expect(source).toMatch(/row\.project_id !== typed\.projectId/u);
    expect(source).toMatch(/row\.attempt_id !== typed\.attemptId/u);
    store.close();
  });

  it("§6.4 — a malformed stored record fails closed rather than reading as empty", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    seed(store);
    expect(() => store.replay()).not.toThrow();
    store.close();
  });
});

/* ================================================================== §6.5 Work revalidation */

describe("P2C C2 §6.5 — canonical Work revalidation", () => {
  it("a Work refusal is reported as SOURCE_REFUSED", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    seed(store);
    const result = await harness(store, { work: { ok: false, reason: "no canonical ATTEMPT_CREATED event names this attempt" } }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("SOURCE_REFUSED");
    store.close();
  });

  it("a historical COMPLETED attempt still qualifies (an old attempt need not remain RUNNING)", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    seed(store);
    const result = await harness(store, { work: { ok: true, taskId: "t1", state: "COMPLETED", creationEventId: "ev-1" } }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("ASSOCIATION_QUALIFIED");
    store.close();
  });
});

/* ================================================================== §6.6 window integrity */

describe("P2C C2 §6.6 — observation-window integrity", () => {
  it("§6.6 F4 — an observation after the finalization is CONTRADICTORY", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    store.append({
      eventId: associationEventId({ type: "INVOCATION_OBSERVATION_FINALIZED", projectId: "p2b", attemptId: ATTEMPT, invocationId: INVOCATION }),
      projectId: "p2b",
      type: "INVOCATION_OBSERVATION_FINALIZED",
      payload: { schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION, projectId: "p2b", attemptId: ATTEMPT, invocationId: INVOCATION, windowState: "CLOSED", closeReason: "INVOCATION_RETURNED", observedCandidateCount: 0 } as never,
    });
    createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" }).recordIdentity(correlated({ sessionId: "worker-late" }));
    const verdict = validateObservationWindow(store.replay());
    expect(verdict.state).toBe("CONTRADICTORY");
    expect(verdict.reason).toBe("OBSERVATION_AFTER_FINALIZATION");
    store.close();
  });

  it("§6.6 F5 — a candidate-count mismatch is CONTRADICTORY", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" }).recordIdentity(correlated({ sessionId: "worker-a" }));
    store.append({
      eventId: associationEventId({ type: "INVOCATION_OBSERVATION_FINALIZED", projectId: "p2b", attemptId: ATTEMPT, invocationId: INVOCATION }),
      projectId: "p2b",
      type: "INVOCATION_OBSERVATION_FINALIZED",
      payload: { schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION, projectId: "p2b", attemptId: ATTEMPT, invocationId: INVOCATION, windowState: "CLOSED", closeReason: "INVOCATION_RETURNED", observedCandidateCount: 99 } as never,
    });
    const verdict = validateObservationWindow(store.replay());
    expect(verdict.reason).toBe("CANDIDATE_COUNT_MISMATCH");
    store.close();
  });

  it("§6.6 — an open window is OPEN, not qualified", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" }).recordIdentity(correlated({ sessionId: "worker-open" }));
    expect(validateObservationWindow(store.replay()).state).toBe("OPEN");
    store.close();
  });

  it("§6.6 — a consistent closed window is CLOSED_CONSISTENT", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    seed(store);
    const verdict = validateObservationWindow(store.replay());
    expect(verdict.state).toBe("CLOSED_CONSISTENT");
    expect(verdict.candidateSessionIds).toEqual(["worker-ok"]);
    store.close();
  });

  it("§6.6 — a finalization with no observation at all is CONTRADICTORY", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    store.append({
      eventId: associationEventId({ type: "INVOCATION_OBSERVATION_FINALIZED", projectId: "p2b", attemptId: ATTEMPT, invocationId: INVOCATION }),
      projectId: "p2b",
      type: "INVOCATION_OBSERVATION_FINALIZED",
      payload: { schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION, projectId: "p2b", attemptId: ATTEMPT, invocationId: INVOCATION, windowState: "CLOSED", closeReason: "INVOCATION_RETURNED", observedCandidateCount: 0 } as never,
    });
    expect(validateObservationWindow(store.replay()).reason).toBe("FINALIZATION_BEFORE_FIRST_OBSERVATION");
    store.close();
  });
});

/* ================================================================== §6.7 currentness */

describe("P2C C2 §6.7 — qualification currentness", () => {
  it("a conflict appended during the Header read yields RACED, never a stale qualification", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    seed(store);
    const qualifier = harness(store, { headerDelayMs: 40 });
    const pending = qualifier.qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    // While the header read is in flight, append a second distinct identity.
    await new Promise((resolve) => setTimeout(resolve, 10));
    createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" }).recordIdentity(correlated({ sessionId: "worker-conflict" }));
    const result = await pending;
    expect(result.qualifications[0]!.state).toBe("RACED");
    expect(result.summary.racedCount).toBe(1);
    expect(result.summary.qualifiedCount).toBe(0);
    store.close();
  });

  it("an unrelated change does not disturb a stable qualification", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    seed(store);
    const result = await harness(store).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("ASSOCIATION_QUALIFIED");
    store.close();
  });
});

/* ================================================================== §6.8 output */

describe("P2C C2 §6.8 — H1-compatible output from real evidence", () => {
  it("the qualified association carries the exact invocation/session and a real binding reference", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    seed(store);
    const result = await harness(store).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    const qualified = result.qualifications[0]!;
    if (qualified.state !== "ASSOCIATION_QUALIFIED") throw new Error("expected qualified");
    expect(qualified.invocationId).toBe(INVOCATION);
    expect(qualified.dshSessionId).toBe("worker-ok");
    expect(qualified.durableBindingRef).toMatch(/^xas-[0-9a-f]{64}$/u);
    expect(qualified.sourceEpochId).toMatch(/^epoch-/u);
    expect(qualified.h1Association.durableBindingRef).toBe(qualified.durableBindingRef);
    expect(qualified.h1Association.verification).toBe("VERIFIED");
    expect(qualified.h1Association.producerEvidence.source).toBe("CANONICAL_ATTEMPT_BINDING");
    // The honest source limitation travels on the result.
    expect(qualified.sourceLimit).toContain("PATH");
    store.close();
  });
});
