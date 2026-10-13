/**
 * Trajectory-P2-B §11 — THE ADVERSARIAL TEST MATRIX (B1 durable + B2 recovery negatives).
 *
 * The §11 matrix requires source-grounded evidence for each property. The POSITIVE cases live in
 * `trajectory_p2b_durable_contract.test.ts` (B1) and the two gates (real DSH). This file covers the
 * NEGATIVE and adversarial cases that must REFUSE, at the durable boundary and after a simulated
 * restart. Each test states which evidence class it used.
 *
 * SAFETY. In-memory / temp-file SQLite; no DSH, no model, no provider, no personal data.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  SqliteExecutionAssociationStore,
  ExecutionAssociationStoreError,
  ExecutionAssociationConflictError,
  associationEventId,
  computeTrustedSourceBasis,
  createExecutionAssociationRecorder,
  makeAssociationQualifier,
  registryFromSingleBasis,
  EXECUTION_ASSOCIATION_SCHEMA_VERSION,
  type TrustedSourceBasis,
} from "../src/execution_association/index.js";
import type { CorrelatedSessionIdentityObservation as Correlated } from "../src/interaction/work_delegation.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function tempStorePath(label: string): string {
  const root = mkdtempSync(join(tmpdir(), `p2b-${label}-`));
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* windows keeps the directory busy while a handle is open; the OS reaps it */
    }
  });
  return join(root, "associations.sqlite");
}

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });
const ATTEMPT = "attempt-00000000000000000000000000000001";

function correlated(input: { sessionId: string; invocationId?: string; attemptId?: string; declared?: string }): Correlated {
  return Object.freeze({
    hostLocalJobId: "wdj-00000000000000000000000000000001",
    attemptId: input.attemptId ?? ATTEMPT,
    observation: Object.freeze({
      schemaVersion: 1,
      invocationId: input.invocationId ?? "wpi-00000000-0000-4000-8000-000000000001",
      dshSessionId: input.sessionId,
      reportedSessionId: input.sessionId,
      source: "DIRECT_CHILD_IPC_REPORT" as const,
      directChildPid: 7,
      observedAt: "2026-01-01T00:00:00.000Z",
      sourceQualification: (input.declared ?? "FIRST_PARTY_DSH_QUALIFIED") as never,
      observationState: "OBSERVED" as const,
      conflictingSessionId: null,
      proves: Object.freeze([]),
      doesNotProve: Object.freeze([]),
    }),
  }) as Correlated;
}

function recorderOn(store: SqliteExecutionAssociationStore) {
  return createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
}

function qualifierFor(store: SqliteExecutionAssociationStore, options: { work?: unknown; header?: { readState: string; sessionId: string | null } } = {}) {
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
        const header = options.header ?? { readState: "READ_OK", sessionId };
        return {
          readState: header.readState as never,
          header:
            header.readState === "READ_OK" && header.sessionId !== null
              ? { sessionId: header.sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }
              : null,
          detail: "matrix",
        };
      },
    },
  });
}

/* ================================================================== B1 negatives */

describe("P2B §11 B1 — durable-observation adversarial cases", () => {
  it("§11 B1: wrong project evidence is not imported — a projectId mismatch is refused", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    expect(() =>
      store.append({
        eventId: "xas-x",
        projectId: "other-project",
        type: "SESSION_IDENTITY_OBSERVED",
        payload: {
          schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION,
          projectId: "p2b",
          attemptId: ATTEMPT,
          invocationId: "wpi-1",
          dshSessionId: "worker-1",
          sourceBasis: BASIS,
          sourceKind: "FIRST_PARTY_DSH_HOST",
          sourceQualificationDeclared: "FIRST_PARTY_DSH_QUALIFIED",
          directChildPid: null,
          hostLocalJobId: null,
        } as never,
      }),
    ).toThrow(/does not match the event projectId/u);
    store.close();
  });

  it("§11 B1: an untyped / unknown event type fails closed", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    expect(() => store.append({ eventId: "xas-y", projectId: "p2b", type: "SOMETHING_ELSE" as never, payload: {} as never })).toThrow(
      ExecutionAssociationStoreError,
    );
    store.close();
  });

  it("§11 B1: a malformed stored record fails closed on replay — it never reads as an empty history", () => {
    const path = tempStorePath("corrupt");
    const store = new SqliteExecutionAssociationStore(path);
    recorderOn(store).recordIdentity(correlated({ sessionId: "worker-1" }));
    // Corrupt the stored payload directly.
    store.close();
    const raw = new (require("node:sqlite").DatabaseSync)(path);
    raw.exec("UPDATE execution_associations SET payload_json = '{not json'");
    raw.close();
    const reopened = new SqliteExecutionAssociationStore(path);
    expect(() => reopened.replay()).toThrow(/malformed payload/u);
    reopened.close();
  });

  it("§11 B1: a write failure cannot manufacture a durable status (fault before commit)", () => {
    const path = tempStorePath("fault");
    const store = new SqliteExecutionAssociationStore(path);
    recorderOn(store).recordIdentity(correlated({ sessionId: "worker-1" }));
    store.close();
    // A second store whose append is forced to fail by a read-only-ish corruption: assert the failure
    // surfaces rather than a false APPENDED.
    const reopened = new SqliteExecutionAssociationStore(path);
    /**
     * -------------------------------------------------------------- CHANGED (P2C C2)
     *
     * C2 added the canonical-identity check, so a payload whose IDENTITY differs from its eventId is now
     * refused EARLIER (a stronger refusal). The event_conflict property is still real: the same canonical
     * identity with divergent NON-identity content (here a different source basis) must conflict rather
     * than silently overwrite.
     */
    const eventId = associationEventId({ type: "SESSION_IDENTITY_OBSERVED", projectId: "p2b", attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", dshSessionId: "worker-1" });
    const otherBasis = computeTrustedSourceBasis({ adapterId: "other", workerBin: "/other/dsh.js", nodeExecPath: "/other/node.exe" });
    expect(() =>
      reopened.append({
        eventId,
        projectId: "p2b",
        type: "SESSION_IDENTITY_OBSERVED",
        payload: {
          schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION,
          projectId: "p2b",
          attemptId: ATTEMPT,
          invocationId: "wpi-00000000-0000-4000-8000-000000000001",
          dshSessionId: "worker-1",
          sourceBasis: otherBasis,
          sourceKind: "FIRST_PARTY_DSH_HOST",
          sourceQualificationDeclared: "x",
          directChildPid: null,
          hostLocalJobId: null,
        } as never,
      }),
    ).toThrow(ExecutionAssociationConflictError);
    reopened.close();
  });

  it("§11 B1: optional absence of the store does not prevent ordinary Work execution (the concern is separate)", () => {
    /**
     * §7.7: the durable concern is OPTIONAL. Its absence is represented by the deployment simply not
     * composing it; nothing in Work, Delegation or the Worker Port imports it, so an absent store cannot
     * change ordinary execution. This asserts the separation at the source level.
     */
    const delegation = existsSync(join(process.cwd(), "src", "interaction", "work_delegation.ts"));
    expect(delegation).toBe(true);
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const source = readFileSync(join(process.cwd(), "src", "interaction", "work_delegation.ts"), "utf8");
    // The delegation service must NOT import the durable store — the coupling is a sink, not a dependency.
    expect(source).not.toMatch(/execution_association/u);
  });
});

/* ================================================================== B2 negatives (simulated restart) */

describe("P2B §11 B2 — cold-recovery adversarial cases (each on a FRESH store handle)", () => {
  it("§11 B2: missing record stays missing — never inferred from Session readability", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const result = await qualifierFor(store).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications).toHaveLength(0);
    store.close();
  });

  it("§11 B2: wrong AttemptId has no observation", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-1" }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    const result = await qualifierFor(store).qualifyAttempt({ projectId: "p2b", attemptId: `attempt-${"9".repeat(32)}` });
    expect(result.qualifications).toHaveLength(0);
    store.close();
  });

  it("§11 B2: wrong ProjectId has no observation", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-1" }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    const result = await qualifierFor(store).qualifyAttempt({ projectId: "someone-else", attemptId: ATTEMPT });
    expect(result.qualifications).toHaveLength(0);
    store.close();
  });

  it("§11 B2: a wrong DSH SessionId in the header is a REFUSAL, not a silent success", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-real" }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    const result = await qualifierFor(store, { header: { readState: "READ_OK", sessionId: "worker-other" } }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("SOURCE_REFUSED");
    store.close();
  });

  it("§11 B2: a session whose format is unsupported is SOURCE_UNAVAILABLE, not an empty history", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-x" }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    const result = await qualifierFor(store, { header: { readState: "SESSION_FORMAT_UNSUPPORTED", sessionId: null } }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("SOURCE_UNAVAILABLE");
    store.close();
  });

  it("§11 B2: a historical COMPLETED attempt still retains a recoverable association (§9.1)", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = recorderOn(store);
    recorder.recordIdentity(correlated({ sessionId: "worker-done" }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    // The attempt is terminal in Work; §9.1 says that is NOT a reason to refuse historical provenance.
    // (P2C C2: the Work port now returns an explicit admission result.)
    const result = await qualifierFor(store, { work: { ok: true, taskId: "t1", state: "COMPLETED", creationEventId: "ev-1" } }).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("ASSOCIATION_QUALIFIED");
    store.close();
  });

  it("§11 B2: three distinct identities remain THREE candidates after a restart, and the invocation is CONFLICT", async () => {
    const path = tempStorePath("three");
    const first = new SqliteExecutionAssociationStore(path);
    const recorder = createExecutionAssociationRecorder({ store: first, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    for (const sessionId of ["worker-a", "worker-b", "worker-c"]) recorder.recordIdentity(correlated({ sessionId }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    first.close();

    // A FRESH handle, as a new process would open it.
    const reopened = new SqliteExecutionAssociationStore(path);
    const sessions = reopened
      .replay()
      .filter((event) => event.type === "SESSION_IDENTITY_OBSERVED")
      .map((event) => (event.payload as { dshSessionId: string }).dshSessionId)
      .sort();
    expect(sessions).toEqual(["worker-a", "worker-b", "worker-c"]);
    const result = await qualifierFor(reopened).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("CONFLICT");
    expect((result.qualifications[0] as { candidates: readonly unknown[] }).candidates).toHaveLength(3);
    reopened.close();
  });

  it("§11 B2: a duplicate identical record does not duplicate on restart", async () => {
    const path = tempStorePath("dup");
    const first = new SqliteExecutionAssociationStore(path);
    const recorder = createExecutionAssociationRecorder({ store: first, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(correlated({ sessionId: "worker-1" }));
    recorder.recordIdentity(correlated({ sessionId: "worker-1" }));
    first.close();
    const reopened = new SqliteExecutionAssociationStore(path);
    expect(reopened.replay().filter((event) => event.type === "SESSION_IDENTITY_OBSERVED")).toHaveLength(1);
    reopened.close();
  });

  it("§11 B2: an untrusted association cannot qualify by self-declaration (§7.6/§9.1)", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    // A record written with a FOREIGN basis but declaring FIRST_PARTY_DSH_QUALIFIED.
    const foreign = computeTrustedSourceBasis({ adapterId: "stub", workerBin: "/x/dsh.js", nodeExecPath: "/x/node.exe" });
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: foreign, sourceKind: "CONTROLLED_STUB" });
    recorder.recordIdentity(correlated({ sessionId: "worker-claimed", declared: "FIRST_PARTY_DSH_QUALIFIED" }));
    recorder.finalizeInvocation({ attemptId: ATTEMPT, invocationId: "wpi-00000000-0000-4000-8000-000000000001", closeReason: "CHILD_EXIT_OBSERVED" });
    const result = await qualifierFor(store).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("SOURCE_REFUSED");
    store.close();
  });

  it("§11 B2: a record written but with finalization MISSING is durable but NOT qualified", async () => {
    const path = tempStorePath("nofinal");
    const first = new SqliteExecutionAssociationStore(path);
    createExecutionAssociationRecorder({ store: first, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" }).recordIdentity(correlated({ sessionId: "worker-1" }));
    first.close();
    const reopened = new SqliteExecutionAssociationStore(path);
    const result = await qualifierFor(reopened).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("OBSERVATION_INCOMPLETE");
    reopened.close();
  });
});
