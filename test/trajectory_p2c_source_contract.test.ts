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
  registryFromSingleBasis,
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
          detail: "falsifier",
        };
      },
    },
  });
}

describe("P2C C1 F1 — the P2-B cold-recovery gate reuses the producer's own source basis", () => {
  it("SOURCE_DEMONSTRATED at baseline; now Process B DERIVES its own basis (C3)", () => {
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (P2C C3)
     *
     * AT BASELINE Process A wrote its `sourceBasis` into handoff.json and Process B used it as its
     * `trustedBasis`, so the experiment proved only VALUE MATCHING. C3 removed the basis from the handoff
     * (keeping only the executable facts) and made Process B recompute its own trusted registry.
     * Baseline finding preserved as F1.
     */
    const gate = readRepo("scripts/trajectory_p2b/cold-recovery-gate.mjs");
    expect(gate).not.toBeNull();
    // Process B derives its OWN basis from the executable facts rather than receiving the producer's.
    expect(gate!).toMatch(/processBBasis = association\.computeTrustedSourceBasis/u);
    expect(gate!).toMatch(/registry: association\.registryFromSingleBasis\(processBBasis/u);
    // And the handoff no longer carries a ready-made trustedBasis field.
    expect(gate!).not.toMatch(/trustedBasis: handoff\.sourceBasis/u);
    expect(gate!).not.toMatch(/^\s{6}sourceBasis,$/mu);
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
  it("DYNAMICALLY_REPRODUCED at baseline; now REFUSED by C2 source-kind enforcement", async () => {
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (P2C C2)
     *
     * AT BASELINE this test reproduced the defect: a CONTROLLED_STUB record with the verifier's exact
     * basis returned ASSOCIATION_QUALIFIED, because the qualifier never read `sourceKind`.
     *
     * C2's source.ts enforces that a record's KIND must be a supported producer kind AND must agree with
     * the matching trusted epoch's kind, so the stub is now refused. The baseline finding is preserved in
     * `research-evidence/trajectory-p2c/baseline-falsifiers.json` (F3) and the assertion is flipped here.
     */
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "CONTROLLED_STUB" });
    recorder.recordIdentity(correlated({ sessionId: "worker-stub" }));
    recorder.finalizeAttempt({ attemptId: ATTEMPT, closeReason: "INVOCATION_RETURNED" });
    const result = await qualifierFor(store).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("SOURCE_REFUSED");
    expect(result.summary.qualifiedCount).toBe(0);
    store.close();
  });
});

describe("P2C C1 F4 — a finalization BEFORE the observation is accepted", () => {
  it("DYNAMICALLY_REPRODUCED at baseline; now REFUSED by C2 window integrity", async () => {
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (P2C C2)
     *
     * AT BASELINE the qualifier accepted this: it only required windowState===CLOSED. C2's
     * `validateObservationWindow` derives the window from the durable record ORDER, so an observation
     * recorded AFTER the finalization is CONTRADICTORY and the association is not qualified. Baseline
     * finding preserved as F4 in baseline-falsifiers.json.
     */
    const store = new SqliteExecutionAssociationStore(":memory:");
    const invocationId = "wpi-00000000-0000-4000-8000-000000000001";
    store.append({
      eventId: associationEventId({ type: "INVOCATION_OBSERVATION_FINALIZED", projectId: "p2b", attemptId: ATTEMPT, invocationId }),
      projectId: "p2b",
      type: "INVOCATION_OBSERVATION_FINALIZED",
      payload: { schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION, projectId: "p2b", attemptId: ATTEMPT, invocationId, windowState: "CLOSED", closeReason: "INVOCATION_RETURNED", observedCandidateCount: 0 } as never,
    });
    createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" }).recordIdentity(correlated({ sessionId: "worker-late" }));
    const result = await qualifierFor(store).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("OBSERVATION_INCOMPLETE");
    store.close();
  });
});

describe("P2C C1 F5 — a finalization whose candidate count disagrees is not detected", () => {
  it("DYNAMICALLY_REPRODUCED at baseline; now REFUSED by C2 window integrity", async () => {
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (P2C C2)
     *
     * AT BASELINE the recorded `observedCandidateCount` was never compared to the actual candidate set.
     * C2 compares it, so a finalization claiming 99 candidates for an invocation that observed 1 is
     * CONTRADICTORY. Baseline finding preserved as F5.
     */
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2b", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(correlated({ sessionId: "worker-a" }));
    const invocationId = "wpi-00000000-0000-4000-8000-000000000001";
    store.append({
      eventId: associationEventId({ type: "INVOCATION_OBSERVATION_FINALIZED", projectId: "p2b", attemptId: ATTEMPT, invocationId }),
      projectId: "p2b",
      type: "INVOCATION_OBSERVATION_FINALIZED",
      payload: { schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION, projectId: "p2b", attemptId: ATTEMPT, invocationId, windowState: "CLOSED", closeReason: "INVOCATION_RETURNED", observedCandidateCount: 99 } as never,
    });
    const result = await qualifierFor(store).qualifyAttempt({ projectId: "p2b", attemptId: ATTEMPT });
    expect(result.qualifications[0]!.state).toBe("OBSERVATION_INCOMPLETE");
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
  it("DYNAMICALLY_REPRODUCED at baseline; now REFUSED by C2 identity enforcement", () => {
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (P2C C2)
     *
     * AT BASELINE a wrong eventId was accepted verbatim. C2 validates `eventId === associationEventId(...)`
     * on BOTH append and replay, so the non-canonical id is refused. Baseline finding preserved as F8.
     */
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
    expect(() =>
      store.append({ eventId: "xas-deliberately-wrong", projectId: "p2b", type: "SESSION_IDENTITY_OBSERVED", payload: payload as never }),
    ).toThrow(/does not match the canonical identity/u);
    store.close();
  });
});

describe("P2C C1 F9 — Store Replay does not check the SQLite columns against the payload", () => {
  it("SOURCE_DEMONSTRATED at baseline; now ENFORCED by C2 record-scope validation", () => {
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (P2C C2)
     *
     * AT BASELINE parseStoredEvent never read `row.attempt_id`. C2 compares the row's project_id and
     * attempt_id against the payload and fails closed on a mismatch, so a mutated column can no longer
     * be replayed as a valid record. Baseline finding preserved as F9.
     */
    const storeSource = readRepo("src/execution_association/store.ts");
    expect(storeSource!).toMatch(/row\.attempt_id !== typed\.attemptId/u);
    expect(storeSource!).toMatch(/row\.project_id !== typed\.projectId/u);
    // And the append path validates the canonical id too.
    expect(storeSource!).toMatch(/eventId !== canonicalId/u);
  });
});

describe("P2C C1 F10 — Work revalidation only requires a non-null record", () => {
  it("SOURCE_DEMONSTRATED at baseline; now the port requires an EXACT admission result (C2)", () => {
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (P2C C2)
     *
     * AT BASELINE `readAttempt` returned `{taskId,state}|null`, so the qualifier could only check that a
     * record EXISTED. C2 changed the port to return an explicit `{ok:true, ...creationEventId} | {ok:false,
     * reason}` so an implementation can reuse the V0S/H0 admission logic that verifies the exact
     * ATTEMPT_CREATED event. The baseline finding is preserved as F10.
     */
    const qualifier = readRepo("src/execution_association/qualification.ts");
    const v0 = readRepo("src/composition/trajectory_v0.ts");
    // The port now carries an explicit admission outcome, including the creation event identity.
    expect(qualifier!).toMatch(/readonly ok: true; readonly taskId: string \| null; readonly state: string \| null; readonly creationEventId: string \| null/u);
    expect(qualifier!).toMatch(/readonly ok: false; readonly reason: string/u);
    // A Work refusal is surfaced as SOURCE_REFUSED rather than being read as "attempt not found".
    expect(qualifier!).toMatch(/canonical Work refused this attempt/u);
    // The V0 admission logic that verifies the exact creation event remains the reusable source.
    expect(v0!).toMatch(/creationCount > 1/u);
    expect(v0!).toMatch(/ATTEMPT_CREATED/u);
  });
});

describe("P2C C1 F11 — an inconsistent binding state can expose events", () => {
  it("SOURCE_DEMONSTRATED at baseline; now REFUSED by C3 admission invariants", () => {
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (P2C C3)
     *
     * AT BASELINE events were gated only on `sessionReadAdmission === "ADMITTED_TO_ATTEMPT" && !pageRefused`,
     * so SESSION_CLAIMED_UNVERIFIED + null dshSessionId + ADMITTED_TO_ATTEMPT exposed the page's events.
     * C3 added `validateAdmissionInvariants`, and `buildHandoffPreview` now also requires it to pass.
     * Baseline finding preserved as F11.
     */
    const handoff = readRepo("src/trajectory/handoff_preview.ts");
    const invariants = readRepo("src/trajectory/admission_invariants.ts");
    expect(invariants).not.toBeNull();
    expect(invariants!).toMatch(/ADMITTED_WITHOUT_SESSION_ID/u);
    expect(invariants!).toMatch(/ADMITTED_WITHOUT_VERIFIED_BINDING/u);
    // The preview now requires the invariants to pass before admitting events.
    expect(handoff!).toMatch(/validateAdmissionInvariants/u);
    expect(handoff!).toMatch(/sessionReadAdmission === "ADMITTED_TO_ATTEMPT" && !pageRefused && !invariantsRefused/u);
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
  it("SOURCE_DEMONSTRATED at baseline; now the host derives a work port and the install composes the capability (C3)", () => {
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (P2C C3)
     *
     * AT BASELINE the host derived only a BRANCH port and the install composed neither the association
     * concern nor a trajectory surface. C3 added the host-derived work-worker facts, the install
     * composition and the read-only surface. Baseline finding preserved as F13.
     */
    const host = readRepo("host/dsh/lib/index.js");
    const install = readRepo("src/install.ts");
    const launch = readRepo("src/deployment/launch.ts");
    const cluster = readRepo("src/composition/execution_association.ts");
    // The host now derives work-worker facts beside the branch host.
    expect(host!).toMatch(/deriveWorkWorkerFacts/u);
    expect(host!).toMatch(/dshSubprocessBranchExecutionPort/u);
    // The install composes the cluster and exposes a trajectory surface (the cluster module owns the
    // wiring, keeping install.ts a composition root).
    expect(install!).toMatch(/composeExecutionAssociationCluster/u);
    expect(install!).toMatch(/trajectory/u);
    expect(cluster!).toMatch(/composeAttributedPreview/u);
    // The deployment forwards the host facts into the install.
    expect(launch!).toMatch(/workWorkerFacts/u);
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
