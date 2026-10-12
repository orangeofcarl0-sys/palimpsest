/**
 * Trajectory-V0 §3/§4/§6 (V0-A/V0-B/V0-D) — the DUAL-VIEW CONTRACT, as machine proofs.
 *
 * These are primitive contract tests: they exercise the identity separation, the binding
 * classification, the event sanitization and the Preview's status separation on SYNTHETIC inputs.
 * The real-owner behaviour is proven separately in `trajectory_v0_async_work.test.ts` (real product
 * stack, non-model stub) and `trajectory_v0_dsh_source.test.ts` (controlled DSH source).
 *
 * The boundaries this file pins:
 *
 *     Work AttemptId ≠ HostJobId ≠ Port InvocationId ≠ DSH SessionId ≠ Trajectory View ID
 *     BOUND_VERIFIED      requires a real producer — a caller's declaration cannot reach it
 *     host observation    ≠ session binding ≠ session read admission  (V0S §5)
 *     turn/end            ≠ Work settlement      tool/call ≠ success
 *     missing session     ≠ empty event history  unknown exit ≠ successful exit
 *
 * ------------------------------------------------------------------ V0S §3 changed assertions
 *
 * This file previously encoded the acceptance rule V0S disproved. Each correction is recorded:
 *
 *   1. `BINDING_STATES` / `classifyBinding` → `SESSION_BINDING_STATES` /
 *      `classifySessionBinding`. V0 had ONE binding vocabulary whose lowest non-unbound state
 *      (`BOUND_LOCAL_ONLY`) covered both a host observation and a caller-selected session. The
 *      corrected model splits the fact into host-observation provenance, session binding and read
 *      admission, so the old name no longer denotes one thing.
 *   2. `BOUND_LOCAL_ONLY` → `SESSION_CLAIMED_UNVERIFIED`. The old name asserted a local BINDING;
 *      the corrected name says only that a claim was made, which is what the evidence supports.
 *   3. "a caller-supplied session id can NEVER reach BOUND_VERIFIED" is RETAINED and strengthened:
 *      the caller claim now also cannot make the read ADMITTED.
 *   4. `completeness === "COMPLETE"` from a session page alone is NO LONGER asserted. V0 derived
 *      completeness from "a session was read", which let a readable but unrelated session complete
 *      an Attempt Handoff. COMPLETE now additionally requires `ADMITTED_TO_ATTEMPT`.
 *   5. `sanitizeDshEvent` gained a `durability` field defaulting to `DURABILITY_UNRESOLVED`; the
 *      new assertion pins that a bare sanitize call never claims an event was persisted.
 */
import { describe, expect, it } from "vitest";

import {
  BINDING_SOURCES,
  buildHandoffPreview,
  classifyHostObservation,
  classifySessionBinding,
  DSH_EVENT_DURABILITY_STATES,
  DSH_PAGE_DOES_NOT_PROVE,
  DSH_READ_DEFAULT_PAGE,
  DSH_READ_MAX_PAGE,
  HOST_OBSERVATION_PROVENANCE_STATES,
  PREVIEW_COMPLETENESS_STATES,
  PREVIEW_DOES_NOT_AUTHORIZE,
  PROCESS_LIFECYCLE_STATES,
  readOnlyViolations,
  RECOGNIZED_DSH_EVENT_TYPES,
  resolveVerifiedSessionBinding,
  sanitizeDshEvent,
  SESSION_BINDING_STATES,
  SESSION_LIFECYCLE_STATES,
  SESSION_READ_ADMISSION_STATES,
  SESSION_READ_STATES,
  sessionLifecycleOf,
  trajectoryViewIdOf,
  validateReadRequest,
  type AttemptExecutionBinding,
  type DshSessionEventPage,
  type HandoffPreviewInput,
} from "../src/trajectory/index.js";

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const PROJECT = "t0v0";
const ATTEMPT = "attempt-".concat("a".repeat(32));

/**
 * A binding with no session at all: the honest default. `overrides` lets a test state exactly the
 * dimension it is about, so a wrong classification cannot hide behind another field's default.
 */
function bindingOf(overrides: Partial<AttemptExecutionBinding> = {}): AttemptExecutionBinding {
  const classification = classifySessionBinding({
    claimedSessionId: null,
    candidateCount: 0,
    sourceReadable: true,
    conflictDetail: null,
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    projectId: PROJECT,
    attemptId: ATTEMPT,
    viewId: trajectoryViewIdOf({ projectId: PROJECT, attemptId: ATTEMPT }),
    historicalWorkBasis: Object.freeze({ basisDigest: "b".repeat(64), capturedAtRevision: 0, taskId: "t1" }),
    hostLocalJobId: null,
    portInvocationId: null,
    dshSessionId: null,
    claimedSessionId: null,
    hostObservationProvenance: "NOT_OBSERVED" as const,
    sessionSource: classification.source,
    sessionBindingStatus: classification.state,
    sessionReadAdmission: "NOT_REQUESTED" as const,
    bindingEvidenceRefs: Object.freeze([]),
    detail: classification.detail,
    ...overrides,
  });
}

/**
 * §9: a page carrying every field the corrected contract requires, so a test that cares about ONE
 * of them does not silently inherit a wrong default for another.
 */
function pageOf(overrides: Partial<DshSessionEventPage> = {}): DshSessionEventPage {
  return Object.freeze({
    schemaVersion: 1 as const,
    readState: "READ_OK" as const,
    sessionId: "session-fixture",
    header: Object.freeze({
      sessionId: "session-fixture", version: 4, createdAt: 1_700_000_000_000,
      cwd: "C:/worlds/attempt", parentSession: null, isSeeded: false, origin: null, delegationDepth: null,
    }),
    sourceIdentity: "DSH_QUERY_PORT_FIXTURE",
    sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
    throughSeq: 2,
    knownEventCount: 3,
    inheritedEventCount: 0,
    requestedFromSeq: 0,
    requestedMaxEvents: 50,
    returnedCount: 3,
    pageBounded: true as const,
    diskIoBounded: false,
    durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const,
    persistedEventCount: 3,
    syntheticRecoveryEventCount: 0,
    events: Object.freeze([
      Object.freeze({ sessionId: "session-fixture", seq: 0, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT" as const, time: 1, surface: null, summary: "turn 0 opened", durationMs: null, observedStatus: null }),
      Object.freeze({ sessionId: "session-fixture", seq: 1, type: "tool/call", inherited: false, durability: "PERSISTED_DSH_EVENT" as const, time: 2, surface: null, summary: "tool call bash at step 0", durationMs: null, observedStatus: null }),
      Object.freeze({ sessionId: "session-fixture", seq: 2, type: "turn/end", inherited: false, durability: "PERSISTED_DSH_EVENT" as const, time: 3, surface: null, summary: "turn 0 closed", durationMs: null, observedStatus: "aborted" }),
    ]),
    knownParentSession: null,
    proves: Object.freeze(["x"]),
    doesNotProve: DSH_PAGE_DOES_NOT_PROVE,
    detail: "a fixture page",
    ...overrides,
  });
}

function inputOf(overrides: Partial<HandoffPreviewInput> = {}): HandoffPreviewInput {
  return {
    projectId: PROJECT,
    attemptId: ATTEMPT,
    binding: bindingOf(),
    canonical: {
      attemptState: "COMPLETED",
      taskId: "t1",
      workState: "VERIFYING",
      envelopeId: "env-1",
      basisDigest: "b".repeat(64),
      capturedAtRevision: 0,
      authorizationDetail: "authorized by TASK_CREATED env-1",
      resultRefs: ["1".repeat(40)],
      resultDetail: "the attempt reported a result commit",
      verificationState: "NOT_RUN",
      promotionState: "NOT_PROMOTED",
      promotionId: null,
      reworkState: "NONE",
      reworkDetail: "no governed reopening references this result",
    },
    host: {
      hostLocalJobId: null,
      portInvocationId: null,
      processLifecycle: "NOT_OBSERVED",
      processDetail: "no host observation was supplied",
      observedEventKinds: [],
      originLimitation: "G1-B local host observations are not independent, authority-bearing provenance.",
    },
    projectEvolution: {
      projectionRootId: "tr-".concat("c".repeat(32)),
      projectionSemanticDigest: "d".repeat(64),
      workSequence: 7,
      workEventDigest: "e".repeat(64),
      projectIrRevision: 1,
      selectedRelations: [{ relation: "ATTEMPT_PRODUCED_RESULT", evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE", detail: "the report names the attempt" }],
      quarantinedRelations: [],
      unresolvedReferences: [],
      currentnessCaveats: [],
    },
    ...overrides,
  };
}

/* ================================================================== §3 Identity separation */

describe("Trajectory-V0 §3 — identity separation", () => {
  it("the View ID is derived from (projectId, attemptId) and is stable across constructions", () => {
    const a = trajectoryViewIdOf({ projectId: PROJECT, attemptId: ATTEMPT });
    const b = trajectoryViewIdOf({ projectId: PROJECT, attemptId: ATTEMPT });
    expect(a).toBe(b);
    expect(a.startsWith("tv-")).toBe(true);
    // A different attempt yields a different view id.
    expect(trajectoryViewIdOf({ projectId: PROJECT, attemptId: "attempt-" + "z".repeat(32) })).not.toBe(a);
    // §3: the View ID is NOT T0's root id (which is a projection-snapshot identity).
    expect(a.startsWith("tr-")).toBe(false);
  });

  it("§3: the four execution identities are separate fields and are never collapsed", () => {
    const binding = bindingOf({ hostLocalJobId: "wdj-1", portInvocationId: "wpi-1", claimedSessionId: "session-x" });
    // Each identity keeps its own field; no field is derived from another.
    expect(binding.attemptId).toBe(ATTEMPT);
    expect(binding.hostLocalJobId).toBe("wdj-1");
    expect(binding.portInvocationId).toBe("wpi-1");
    expect(binding.claimedSessionId).toBe("session-x");
    expect(new Set([binding.attemptId, binding.hostLocalJobId, binding.portInvocationId, binding.claimedSessionId]).size).toBe(4);
  });

  it("§5: a claimed session id is NOT the established session id", () => {
    const binding = bindingOf({ claimedSessionId: "session-claimed" });
    // The claim is recorded as a claim, and the ESTABLISHED id stays null without a producer.
    expect(binding.claimedSessionId).toBe("session-claimed");
    expect(binding.dshSessionId).toBeNull();
  });
});

/* ================================================================== §5 Binding classification */

describe("Trajectory-V0 §5 — session binding states", () => {
  it("a caller-supplied session id can NEVER reach BOUND_VERIFIED", () => {
    const classification = classifySessionBinding({
      claimedSessionId: "session-caller-supplied",
      candidateCount: 1,
      sourceReadable: true,
      conflictDetail: null,
    });
    expect(classification.state).toBe("SESSION_CLAIMED_UNVERIFIED");
    expect(classification.source).toBe("CALLER_DECLARATION");
    expect(classification.state).not.toBe("BOUND_VERIFIED");
  });

  it("only a VERIFIED PRODUCER ASSOCIATION yields a verified session identity", () => {
    /**
     * ------------------------------------------------------------------ CHANGED ASSERTION (H1 C4)
     *
     * The baseline assertion called `classifySessionBinding({claimedSessionId: null, candidateCount: 1,
     * canonicalBindingPresent: true})` and required `BOUND_VERIFIED`. It pinned the DEFECT: a bare
     * boolean authorized a binding with no evidence about any session.
     *
     * The corrected contract asserts the OPPOSITE: the classifier cannot produce a verified state at
     * all, and verification comes from `resolveVerifiedSessionBinding` over producer-side evidence.
     */
    const classifierResult = classifySessionBinding({
      claimedSessionId: null,
      candidateCount: 1,
      sourceReadable: true,
      conflictDetail: null,
    });
    // With no claim and no session input, the honest state is UNBOUND — not VERIFIED.
    expect(classifierResult.state).toBe("SESSION_UNBOUND");

    const resolved = resolveVerifiedSessionBinding({
      projectId: PROJECT,
      attemptId: ATTEMPT,
      invocationId: "inv-1",
      associations: [
        {
          schemaVersion: 1 as const, projectId: PROJECT, attemptId: ATTEMPT, invocationId: "inv-1",
          dshSessionId: "session-produced",
          producerEvidence: { source: "HOST_PORT_OBSERVATION" as const, reference: "ipc-1" },
          observationState: "PRODUCER_OBSERVED" as const,
          durableBindingRef: "binding-1",
          verification: "VERIFIED" as const,
          conflictDetail: null,
        },
      ],
    });
    expect(resolved.outcome).toBe("RESOLVED_VERIFIED");
    expect(resolved.verifiedSessionId).toBe("session-produced");
    expect(resolved.invocationId).toBe("inv-1");
  });

  it("no evidence at all is SESSION_UNBOUND — the honest default", () => {
    const classification = classifySessionBinding({
      claimedSessionId: null,
      candidateCount: 0, sourceReadable: true, conflictDetail: null,
    });
    expect(classification.state).toBe("SESSION_UNBOUND");
    expect(classification.source).toBe("NONE");
  });

  it("a contradiction is CONFLICT, never downgraded to unbound", () => {
    const classification = classifySessionBinding({
      claimedSessionId: "session-a",
      candidateCount: 1, sourceReadable: true, conflictDetail: "the stored header disagrees with the claimed id",
    });
    expect(classification.state).toBe("CONFLICT");
    expect(classification.detail).toContain("disagrees");
  });

  it("more than one candidate is AMBIGUOUS — never resolved by picking one", () => {
    const classification = classifySessionBinding({
      claimedSessionId: "session-a",
      candidateCount: 2, sourceReadable: true, conflictDetail: null,
    });
    expect(classification.state).toBe("AMBIGUOUS");
  });

  it("an ATTEMPTED but unreadable session is SOURCE_UNAVAILABLE", () => {
    /**
     * ------------------------------------------------------------------ CHANGED ASSERTION (H0 C3)
     *
     * The baseline assertion passed only `sourceReadable: false` and expected SOURCE_UNAVAILABLE. The
     * counterexample is H0 §7.1: the ordinary Attempt Preview performs NO read at all, so reporting an
     * un-attempted read as SOURCE_UNAVAILABLE claimed a broken source that was never asked anything.
     *
     * The corrected contract separates "the read failed" from "no read was attempted": SOURCE_UNAVAILABLE
     * now requires `readAttempted: true`.
     */
    const attempted = classifySessionBinding({
      claimedSessionId: "session-gone",
      candidateCount: 1, readAttempted: true, sourceReadable: false, conflictDetail: null,
    });
    expect(attempted.state).toBe("SOURCE_UNAVAILABLE");
    // And with NO read attempted, the claim stays unverified rather than claiming a broken source.
    const unread = classifySessionBinding({
      claimedSessionId: "session-gone",
      candidateCount: 1, readAttempted: false, sourceReadable: false, conflictDetail: null,
    });
    expect(unread.state).toBe("SESSION_CLAIMED_UNVERIFIED");
    /**
     * ------------------------------------------------------------------ CHANGED ASSERTION (H1 C4)
     *
     * The H0 detail said "...and no read was performed through this path". H1 C4 reworded it to state
     * the structural reason the claim cannot bind: this classifier has no verification authority.
     */
    expect(unread.detail).toContain("DECLARATION");
    expect(unread.detail).toContain("no authority to establish an Attempt→Session binding");
  });

  it("§5: a HOST OBSERVATION cannot move the session binding", () => {
    /**
     * V0S §5 "No-session invariant": a real local host process observation is a different fact from
     * a session binding. With no claim, the binding is SESSION_UNBOUND even though the host
     * observation exists — `classifySessionBinding` has no host input at all, which is the point.
     */
    const classification = classifySessionBinding({
      claimedSessionId: null,
      candidateCount: 0, sourceReadable: true, conflictDetail: null,
    });
    expect(classification.state).toBe("SESSION_UNBOUND");
    // The host dimension is decided separately and does not appear in this result.
    expect(Object.keys(classification)).toEqual(["state", "source", "detail"]);
  });

  it("the vocabularies are exactly the ruled sets", () => {
    expect([...SESSION_BINDING_STATES]).toEqual(["BOUND_VERIFIED", "SESSION_CLAIMED_UNVERIFIED", "SESSION_UNBOUND", "AMBIGUOUS", "CONFLICT", "SOURCE_UNAVAILABLE"]);
    expect([...BINDING_SOURCES]).toContain("CANONICAL_ATTEMPT_BINDING");
    expect([...BINDING_SOURCES]).toContain("CALLER_DECLARATION");
    expect([...SESSION_READ_ADMISSION_STATES]).toEqual(["NOT_REQUESTED", "ADMITTED_TO_ATTEMPT", "READ_FAILED", "NOT_ADMITTED_TO_ATTEMPT"]);
  });
});

/* ================================================================== §5 Host observation provenance */

describe("Trajectory-V0 §5 — host observation provenance is its own dimension", () => {
  it("no record at all is NOT_OBSERVED", () => {
    const classification = classifyHostObservation({ recordPresent: false, attemptMatches: false, hasLocalIdentity: false, conflictDetail: null });
    expect(classification.provenance).toBe("NOT_OBSERVED");
  });

  it("a caller record is a CALLER_DECLARATION; only a produced origin is LOCAL_PORT_OBSERVATION", () => {
    /**
     * ------------------------------------------------------------------ CHANGED ASSERTION (H0 C4)
     *
     * The baseline asserted that a matching record with a host-local identity is
     * LOCAL_PORT_OBSERVATION. The counterexample is H0 F6: the ordinary Preview receives the record
     * from the CALLER, so its identifiers are testimony, not authority.
     *
     * The corrected contract requires a producer-established origin for LOCAL_PORT_OBSERVATION and
     * classifies a caller-supplied record as CALLER_DECLARATION.
     */
    const callerRecord = classifyHostObservation({ recordPresent: true, attemptMatches: true, hasLocalIdentity: true, conflictDetail: null });
    expect(callerRecord.provenance).toBe("CALLER_DECLARATION");
    expect(callerRecord.detail).toContain("caller testimony");

    const produced = classifyHostObservation({ recordPresent: true, attemptMatches: true, hasLocalIdentity: true, originEstablished: true, conflictDetail: null });
    expect(produced.provenance).toBe("LOCAL_PORT_OBSERVATION");
    // §5: it establishes no session, and the detail says so.
    expect(produced.detail).toContain("establishes no DSH session");
  });

  it("a record for another attempt is UNVERIFIED_ORIGIN, not silently dropped", () => {
    const classification = classifyHostObservation({ recordPresent: true, attemptMatches: false, hasLocalIdentity: true, conflictDetail: null });
    expect(classification.provenance).toBe("UNVERIFIED_ORIGIN");
  });

  it("the provenance vocabulary is exactly the ruled set", () => {
    expect([...HOST_OBSERVATION_PROVENANCE_STATES]).toEqual([
      "LOCAL_PORT_OBSERVATION", "CALLER_DECLARATION", "UNVERIFIED_ORIGIN", "SOURCE_UNAVAILABLE", "CONFLICTING_SOURCE", "NOT_OBSERVED",
    ]);
  });
});

/* ================================================================== §4 Event sanitization */

describe("Trajectory-V0 §4 — event views carry structure, never content", () => {
  it("every ruled event type is recognized", () => {
    for (const type of ["turn/start", "turn/end", "step/start", "step/end", "assistant/message", "assistant/attempt", "tool/call", "tool/result"]) {
      expect(RECOGNIZED_DSH_EVENT_TYPES).toContain(type);
    }
  });

  it("a tool/call exposes the tool NAME but never its arguments", () => {
    const view = sanitizeDshEvent({
      sessionId: "s", seq: 1, type: "tool/call", time: 1, inherited: false, surface: null,
      data: { turn: 0, step: 0, callId: "c1", name: "bash", arguments: { command: "SECRET-COMMAND --token=abc" } },
    });
    expect(view.summary).toContain("bash");
    expect(JSON.stringify(view)).not.toContain("SECRET-COMMAND");
    expect(JSON.stringify(view)).not.toContain("token");
  });

  it("an assistant/message exposes NO content and no stream", () => {
    const view = sanitizeDshEvent({
      sessionId: "s", seq: 2, type: "assistant/message", time: 1, inherited: false, surface: "current",
      data: { turn: 0, step: 0, message: { content: "PRIVATE-REASONING-TEXT" }, usage: { input: 5 }, stream: ["delta"] },
    });
    expect(view.summary).toContain("turn 0");
    expect(JSON.stringify(view)).not.toContain("PRIVATE-REASONING-TEXT");
    expect(JSON.stringify(view)).not.toContain("delta");
  });

  it("a failed assistant/attempt keeps its failure status and is not flattened to success", () => {
    const view = sanitizeDshEvent({
      sessionId: "s", seq: 3, type: "assistant/attempt", time: 1, inherited: false, surface: null,
      data: { turn: 0, status: "failed", failure: { code: "X" } },
    });
    expect(view.observedStatus).toBe("failed");
  });

  it("a turn/end reports its reason and never asserts success", () => {
    const aborted = sanitizeDshEvent({
      sessionId: "s", seq: 4, type: "turn/end", time: 1, inherited: false, surface: null,
      data: { turn: 0, reason: { kind: "aborted", reason: "user" } },
    });
    expect(aborted.observedStatus).toBe("aborted");
    expect(JSON.stringify(aborted)).not.toContain("completed");
  });

  it("an unrecognized type is referenced, not interpreted, and never dropped", () => {
    const view = sanitizeDshEvent({
      sessionId: "s", seq: 5, type: "some/newer/event", time: 1, inherited: false, surface: null,
      data: { anything: "content" },
    });
    expect(view.type).toBe("some/newer/event");
    expect(view.summary).toContain("unrecognized event kind");
    expect(JSON.stringify(view)).not.toContain("content");
  });

  it("§9: a bare sanitize call does NOT claim the event was persisted", () => {
    /**
     * §9: only a reader that verified the storage boundary may label an event `PERSISTED_DSH_EVENT`.
     * A plain projection has verified nothing, so it reports `DURABILITY_UNRESOLVED` — the honest
     * value, and the one that keeps a synthesized closer from being read as stored.
     */
    const view = sanitizeDshEvent({
      sessionId: "s", seq: 6, type: "turn/start", time: 1, inherited: false, surface: null, data: { turn: 0 },
    });
    expect(view.durability).toBe("DURABILITY_UNRESOLVED");
    expect([...DSH_EVENT_DURABILITY_STATES]).toContain("SYNTHETIC_RECOVERY_EVENT");
  });

  it("§4: the default page size is small and the hard maximum is bounded", () => {
    expect(DSH_READ_DEFAULT_PAGE).toBe(50);
    expect(DSH_READ_MAX_PAGE).toBe(200);
  });

  it("§9: a bounded read request refuses negative, fractional and excessive bounds", () => {
    expect(validateReadRequest({ sessionId: "s" }).ok).toBe(true);
    expect(validateReadRequest({ sessionId: "s", fromSeq: -1 }).ok).toBe(false);
    expect(validateReadRequest({ sessionId: "s", fromSeq: 1.5 }).ok).toBe(false);
    expect(validateReadRequest({ sessionId: "s", maxEvents: 0 }).ok).toBe(false);
    expect(validateReadRequest({ sessionId: "s", maxEvents: -5 }).ok).toBe(false);
    expect(validateReadRequest({ sessionId: "s", maxEvents: DSH_READ_MAX_PAGE + 1 }).ok).toBe(false);
    expect(validateReadRequest({ sessionId: "s", maxEvents: DSH_READ_MAX_PAGE }).ok).toBe(true);
  });
});

/* ================================================================== §6 Status separation */

describe("Trajectory-V0 §6 — the statuses stay separate", () => {
  it("there is NO single COMPLETED boolean on the Preview", () => {
    const preview = buildHandoffPreview(inputOf());
    const rendered = JSON.stringify(preview);
    expect(rendered).not.toContain("\"COMPLETED\":");
    // The dimensions exist as separate fields.
    expect(preview.execution.processLifecycle).toBeDefined();
    expect(preview.execution.sessionLifecycle).toBeDefined();
    expect(preview.canonical.attemptState).toBeDefined();
    expect(preview.canonical.verificationState).toBeDefined();
    expect(preview.canonical.promotionState).toBeDefined();
    expect(preview.completeness).toBeDefined();
    expect([...PROCESS_LIFECYCLE_STATES].length).toBeGreaterThan(4);
    expect([...SESSION_LIFECYCLE_STATES]).toContain("NO_SESSION_BOUND");
    expect([...PREVIEW_COMPLETENESS_STATES]).toEqual(["COMPLETE", "PARTIAL", "MINIMAL"]);
  });

  it("a child exiting zero does NOT become Work settlement", () => {
    const preview = buildHandoffPreview(
      inputOf({
        host: { hostLocalJobId: "wdj-1", portInvocationId: "wpi-1", processLifecycle: "EXITED", processDetail: "the direct child exited with code 0", observedEventKinds: ["DIRECT_CHILD_EXIT_OBSERVED"], originLimitation: "local only" },
        canonical: { ...inputOf().canonical, attemptState: "COMPLETED", promotionState: "NOT_PROMOTED", verificationState: "NOT_RUN" },
      }),
    );
    // The process exited, but the canonical outcome still says NOT_PROMOTED / NOT_RUN.
    expect(preview.execution.processLifecycle).toBe("EXITED");
    expect(preview.canonical.promotionState).toBe("NOT_PROMOTED");
    expect(preview.canonical.verificationState).toBe("NOT_RUN");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("does not prove Work settlement");
  });

  it("a DSH turn/end does NOT become promotion", () => {
    const preview = buildHandoffPreview(
      inputOf({
        binding: bindingOf({ dshSessionId: "session-fixture", claimedSessionId: "session-fixture", sessionBindingStatus: "BOUND_VERIFIED", sessionSource: "CANONICAL_ATTEMPT_BINDING", sessionReadAdmission: "ADMITTED_TO_ATTEMPT" }),
        sessionPage: pageOf(),
      }),
    );
    expect(preview.execution.sessionLifecycle).toBe("SESSION_READ");
    expect(preview.canonical.promotionState).toBe("NOT_PROMOTED");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("turn/end does not prove promotion");
  });

  it("a missing session is NOT an empty event history", () => {
    const preview = buildHandoffPreview(inputOf({ sessionPage: undefined }));
    expect(preview.execution.events).toEqual([]);
    expect(preview.execution.sessionLifecycle).toBe("NO_SESSION_BOUND");
    expect(preview.execution.eventsDetail).toContain("NOT evidence that no events occurred");
    expect(preview.caveats.missingSession).toBe(true);
  });

  it("an unreadable session keeps its honest read state and is not an empty stream", () => {
    const preview = buildHandoffPreview(inputOf({ sessionPage: pageOf({ readState: "FORMAT_UNSUPPORTED", events: [] }) }));
    expect(preview.execution.sessionLifecycle).toBe("SESSION_UNREADABLE");
    expect(preview.execution.sessionReadState).toBe("FORMAT_UNSUPPORTED");
    expect(preview.caveats.sourcesUnavailable.join(" ")).toContain("not supported");
  });

  it("a host restart is UNKNOWN_AFTER_RESTART, not a fabricated FINISHED", () => {
    const preview = buildHandoffPreview(
      inputOf({ host: { hostLocalJobId: null, portInvocationId: null, processLifecycle: "UNKNOWN_AFTER_RESTART", processDetail: "the host job map was lost", observedEventKinds: [], originLimitation: "local only" } }),
    );
    expect(preview.execution.processLifecycle).toBe("UNKNOWN_AFTER_RESTART");
    // And canonical settlement is untouched by the lost host job.
    expect(preview.canonical.attemptState).toBe("COMPLETED");
  });

  it("§8: a termination REQUEST is a distinct lifecycle from an observed exit", () => {
    for (const state of ["TIMEOUT_REQUESTED", "ABORT_REQUESTED", "EXIT_UNCONFIRMED"] as const) {
      expect([...PROCESS_LIFECYCLE_STATES]).toContain(state);
    }
  });

  it("session read states map honestly onto session lifecycle", () => {
    expect(sessionLifecycleOf("READ_OK", "ADMITTED_TO_ATTEMPT")).toBe("SESSION_READ");
    expect(sessionLifecycleOf(null)).toBe("NO_SESSION_BOUND");
    expect(sessionLifecycleOf(null, "NOT_REQUESTED", true)).toBe("SESSION_IDENTIFIED_NOT_READ");
    expect(sessionLifecycleOf("READ_CAPABILITY_ABSENT")).toBe("SESSION_IDENTIFIED_NOT_READ");
    for (const state of ["SESSION_MISSING", "CORRUPT_SESSION", "BACKEND_UNAVAILABLE", "FORMAT_UNSUPPORTED", "EVENT_GAP", "TRUNCATED_OBSERVATION", "IDENTITY_CONFLICT", "INVALID_REQUEST"] as const) {
      expect(sessionLifecycleOf(state)).toBe("SESSION_UNREADABLE");
      expect(SESSION_READ_STATES).toContain(state);
    }
  });

  it("§8: a READ_OK page that is NOT attributed reads SESSION_READ_NOT_ATTRIBUTED", () => {
    const preview = buildHandoffPreview(inputOf({ sessionPage: pageOf() }));
    expect(preview.execution.sessionLifecycle).toBe("SESSION_READ_NOT_ATTRIBUTED");
  });
});

/* ================================================================== §5/§8 Admission */

describe("Trajectory-V0 §5/§8 — admission, attribution and quarantine", () => {
  it("§5: the historical-basis note is always stated", () => {
    const preview = buildHandoffPreview(inputOf());
    expect(preview.projectContext.historicalBasisNote).toContain("WORK_HISTORICAL_CUT_WITH_CURRENT_CROSS_OWNER_READS");
  });

  it("§8: an unattributed readable session contributes NO events to the attempt", () => {
    /**
     * §5: `buildHandoffPreview` is PURE — it takes the admission as given, and the composition layer
     * derives it from the binding. So this fixture states the pair the composition produces for a
     * caller-claimed, readable, unverified session: a claim recorded, an unverified binding, and a
     * read that is explicitly NOT admitted.
     */
    const preview = buildHandoffPreview(
      inputOf({
        sessionPage: pageOf(),
        binding: bindingOf({
          claimedSessionId: "session-fixture",
          sessionBindingStatus: "SESSION_CLAIMED_UNVERIFIED",
          sessionReadAdmission: "NOT_ADMITTED_TO_ATTEMPT",
        }),
      }),
    );
    // The read happened, the events are real, and they are NOT this attempt's.
    expect(preview.execution.sessionReadAdmission).toBe("NOT_ADMITTED_TO_ATTEMPT");
    expect(preview.execution.events).toEqual([]);
    expect(preview.execution.eventsDetail).toContain("NOT admitted");
    expect(preview.attribution.sessionAttribution).toBe("NO_SESSION");
    expect(preview.completeness).not.toBe("COMPLETE");
  });

  it("§8: the four attribution dimensions are reported separately", () => {
    const preview = buildHandoffPreview(inputOf());
    expect(preview.attribution.canonicalCoverage).toBe("PRESENT");
    expect(preview.attribution.sourceReadability).toBe("NOT_REQUESTED");
    expect(preview.attribution.sessionAttribution).toBe("NO_SESSION");
    expect(preview.attribution.processObservation).toBe("NOT_OBSERVED");
    expect(preview.attribution.detail).toContain("separate facts");
  });

  it("§5: a quarantined T0 relation is never presented as an actionable fact", () => {
    const preview = buildHandoffPreview(
      inputOf({
        projectEvolution: {
          ...inputOf().projectEvolution,
          quarantinedRelations: [{ relation: "RECEIPT_REFERENCED_GROUND", reason: "the T0 cross-owner verifier is known incomplete" }],
        },
      }),
    );
    expect(preview.projectContext.quarantinedRelations).toHaveLength(1);
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("quarantined");
    // The quarantined relation is NOT in the selected (actionable) set.
    expect(preview.projectContext.selectedRelations.map((r) => r.relation)).not.toContain("RECEIPT_REFERENCED_GROUND");
  });

  it("§6: the Preview states what it does not authorize", () => {
    const preview = buildHandoffPreview(inputOf());
    expect(preview.isInspectionData).toBe(true);
    expect(preview.doesNotAuthorize).toBe(PREVIEW_DOES_NOT_AUTHORIZE);
    expect(preview.doesNotAuthorize.join(" ")).toContain("settling a Work attempt");
    expect(preview.doesNotAuthorize.join(" ")).toContain("injecting content into the next Agent prompt");
  });

  it("§10: the G1-B origin limitation is always carried", () => {
    const preview = buildHandoffPreview(inputOf());
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("not independent, authority-bearing provenance");
  });

  it("§10: an absent result is stated rather than asserted", () => {
    const preview = buildHandoffPreview(inputOf({ canonical: { ...inputOf().canonical, resultRefs: [], resultDetail: "no result recorded" } }));
    expect(preview.canonical.resultRefs).toEqual([]);
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("No canonical result reference exists");
  });

  it("§9: the page's provenance class and bounds are carried into the Preview", () => {
    const preview = buildHandoffPreview(
      inputOf({
        binding: bindingOf({ dshSessionId: "session-fixture", claimedSessionId: "session-fixture", sessionBindingStatus: "BOUND_VERIFIED", sessionSource: "CANONICAL_ATTEMPT_BINDING", sessionReadAdmission: "ADMITTED_TO_ATTEMPT" }),
        sessionPage: pageOf(),
      }),
    );
    expect(preview.execution.sourceEvidenceClass).toBe("DSH_QUERY_PORT_FIXTURE");
    expect(preview.execution.readWatermark).toBe(2);
    expect(preview.execution.requestedPageSize).toBe(50);
    expect(preview.execution.returnedPageSize).toBe(3);
  });
});

/* ================================================================== §4/§6 Determinism + read-only */

describe("Trajectory-V0 §4/§6 — determinism and read-only construction", () => {
  it("two builds from the same inputs are byte-identical", () => {
    const first = buildHandoffPreview(inputOf({ sessionPage: pageOf() }));
    const second = buildHandoffPreview(inputOf({ sessionPage: pageOf() }));
    expect(second.previewDigest).toBe(first.previewDigest);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("the digest excludes construction time and host paths", () => {
    const preview = buildHandoffPreview(inputOf());
    const rendered = JSON.stringify(preview);
    // No wall-clock timestamp and no absolute personal path appears in the semantic content.
    expect(preview.previewDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(rendered).not.toContain("C:\\Users");
  });

  it("§8: completeness requires ATTRIBUTION, not merely a readable session", () => {
    const unbound = buildHandoffPreview(inputOf({ sessionPage: undefined }));
    expect(unbound.completeness).toBe("PARTIAL");
    // A readable but UNATTRIBUTED session cannot complete the Preview.
    const unattributed = buildHandoffPreview(
      inputOf({
        sessionPage: pageOf(),
        binding: bindingOf({ claimedSessionId: "session-fixture", sessionBindingStatus: "SESSION_CLAIMED_UNVERIFIED", sessionReadAdmission: "NOT_ADMITTED_TO_ATTEMPT" }),
      }),
    );
    expect(unattributed.completeness).toBe("PARTIAL");
    // Only a verified, admitted read completes it.
    const attributed = buildHandoffPreview(
      inputOf({
        binding: bindingOf({ dshSessionId: "session-fixture", claimedSessionId: "session-fixture", sessionBindingStatus: "BOUND_VERIFIED", sessionSource: "CANONICAL_ATTEMPT_BINDING", sessionReadAdmission: "ADMITTED_TO_ATTEMPT" }),
        sessionPage: pageOf(),
      }),
    );
    expect(attributed.completeness).toBe("COMPLETE");
  });

  it("§10: readOnlyViolations reports exactly the dimension that moved", () => {
    const base = { workEventCount: 5, workLastEventDigest: "a", projectIrRevision: 1, projectIrDigest: "b", reasoningBases: ["r1"], proofBasis: "p", sessionSourceDigest: "s" };
    expect(readOnlyViolations(base, { ...base })).toEqual([]);
    expect(readOnlyViolations(base, { ...base, workEventCount: 6 })).toEqual(["work event count changed: 5 -> 6"]);
    expect(readOnlyViolations(base, { ...base, sessionSourceDigest: "s2" })).toEqual(["DSH session source changed"]);
  });
});
