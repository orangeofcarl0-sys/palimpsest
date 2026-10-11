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
 *     BOUND_VERIFIED   requires a real producer — a caller's declaration cannot reach it
 *     turn/end         ≠ Work settlement      tool/call ≠ success
 *     missing session  ≠ empty event history  unknown exit ≠ successful exit
 */
import { describe, expect, it } from "vitest";

import {
  BINDING_SOURCES,
  BINDING_STATES,
  buildHandoffPreview,
  classifyBinding,
  DSH_PAGE_DOES_NOT_PROVE,
  DSH_READ_DEFAULT_PAGE,
  PREVIEW_COMPLETENESS_STATES,
  PREVIEW_DOES_NOT_AUTHORIZE,
  PROCESS_LIFECYCLE_STATES,
  readOnlyViolations,
  RECOGNIZED_DSH_EVENT_TYPES,
  sanitizeDshEvent,
  SESSION_LIFECYCLE_STATES,
  SESSION_READ_STATES,
  sessionLifecycleOf,
  trajectoryViewIdOf,
  type AttemptExecutionBinding,
  type DshSessionEventPage,
  type HandoffPreviewInput,
} from "../src/trajectory/index.js";

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const PROJECT = "t0v0";
const ATTEMPT = "attempt-".concat("a".repeat(32));

function bindingOf(overrides: Partial<AttemptExecutionBinding> = {}): AttemptExecutionBinding {
  const classification = classifyBinding({
    claimedSessionId: null,
    canonicalBindingPresent: false,
    localObservationPresent: false,
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
    sessionSource: classification.source,
    bindingStatus: classification.state,
    bindingEvidenceRefs: Object.freeze([]),
    detail: classification.detail,
    ...overrides,
  });
}

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
    throughSeq: 2,
    knownEventCount: 3,
    inheritedEventCount: 0,
    events: Object.freeze([
      Object.freeze({ sessionId: "session-fixture", seq: 0, type: "turn/start", inherited: false, time: 1, surface: null, summary: "turn 0 opened", durationMs: null, observedStatus: null }),
      Object.freeze({ sessionId: "session-fixture", seq: 1, type: "tool/call", inherited: false, time: 2, surface: null, summary: "tool call bash at step 0", durationMs: null, observedStatus: null }),
      Object.freeze({ sessionId: "session-fixture", seq: 2, type: "turn/end", inherited: false, time: 3, surface: null, summary: "turn 0 closed", durationMs: null, observedStatus: "aborted" }),
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
    const binding = bindingOf({ hostLocalJobId: "wdj-1", portInvocationId: "wpi-1", dshSessionId: "session-x" });
    // Each identity keeps its own field; no field is derived from another.
    expect(binding.attemptId).toBe(ATTEMPT);
    expect(binding.hostLocalJobId).toBe("wdj-1");
    expect(binding.portInvocationId).toBe("wpi-1");
    expect(binding.dshSessionId).toBe("session-x");
    expect(new Set([binding.attemptId, binding.hostLocalJobId, binding.portInvocationId, binding.dshSessionId]).size).toBe(4);
  });
});

/* ================================================================== §3 Binding classification */

describe("Trajectory-V0 §3 — binding states", () => {
  it("a caller-supplied session id can NEVER reach BOUND_VERIFIED", () => {
    const classification = classifyBinding({
      claimedSessionId: "session-caller-supplied",
      canonicalBindingPresent: false,
      localObservationPresent: false,
      candidateCount: 1,
      sourceReadable: true,
      conflictDetail: null,
    });
    expect(classification.state).toBe("BOUND_LOCAL_ONLY");
    expect(classification.source).toBe("CALLER_DECLARATION");
    expect(classification.state).not.toBe("BOUND_VERIFIED");
  });

  it("only a real producer yields BOUND_VERIFIED", () => {
    const classification = classifyBinding({
      claimedSessionId: null,
      canonicalBindingPresent: true,
      localObservationPresent: false,
      candidateCount: 1,
      sourceReadable: true,
      conflictDetail: null,
    });
    expect(classification.state).toBe("BOUND_VERIFIED");
    expect(classification.source).toBe("CANONICAL_ATTEMPT_BINDING");
  });

  it("no evidence at all is SESSION_UNBOUND — the honest default", () => {
    const classification = classifyBinding({
      claimedSessionId: null, canonicalBindingPresent: false, localObservationPresent: false,
      candidateCount: 0, sourceReadable: true, conflictDetail: null,
    });
    expect(classification.state).toBe("SESSION_UNBOUND");
    expect(classification.source).toBe("NONE");
  });

  it("a contradiction is CONFLICT, never downgraded to unbound", () => {
    const classification = classifyBinding({
      claimedSessionId: "session-a", canonicalBindingPresent: false, localObservationPresent: false,
      candidateCount: 1, sourceReadable: true, conflictDetail: "the stored header disagrees with the claimed id",
    });
    expect(classification.state).toBe("CONFLICT");
    expect(classification.detail).toContain("disagrees");
  });

  it("more than one candidate is AMBIGUOUS — never resolved by picking one", () => {
    const classification = classifyBinding({
      claimedSessionId: null, canonicalBindingPresent: false, localObservationPresent: true,
      candidateCount: 2, sourceReadable: true, conflictDetail: null,
    });
    expect(classification.state).toBe("AMBIGUOUS");
  });

  it("an identified but unreadable session is SOURCE_UNAVAILABLE", () => {
    const classification = classifyBinding({
      claimedSessionId: "session-gone", canonicalBindingPresent: false, localObservationPresent: false,
      candidateCount: 1, sourceReadable: false, conflictDetail: null,
    });
    expect(classification.state).toBe("SOURCE_UNAVAILABLE");
  });

  it("the vocabularies are exactly the ruled sets", () => {
    expect([...BINDING_STATES]).toEqual(["BOUND_VERIFIED", "BOUND_LOCAL_ONLY", "SESSION_UNBOUND", "AMBIGUOUS", "CONFLICT", "SOURCE_UNAVAILABLE"]);
    expect([...BINDING_SOURCES]).toContain("CANONICAL_ATTEMPT_BINDING");
    expect([...BINDING_SOURCES]).toContain("CALLER_DECLARATION");
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

  it("§4: the default page size is small", () => {
    expect(DSH_READ_DEFAULT_PAGE).toBe(50);
  });
});

/* ================================================================== §6 Status separation */

describe("Trajectory-V0 §6 — the six statuses stay separate", () => {
  it("there is NO single COMPLETED boolean on the Preview", () => {
    const preview = buildHandoffPreview(inputOf());
    const rendered = JSON.stringify(preview);
    expect(rendered).not.toContain("\"COMPLETED\":");
    // The six dimensions exist as separate fields.
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
    const preview = buildHandoffPreview(inputOf({ sessionPage: pageOf() }));
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

  it("session read states map honestly onto session lifecycle", () => {
    expect(sessionLifecycleOf("READ_OK")).toBe("SESSION_READ");
    expect(sessionLifecycleOf(null)).toBe("NO_SESSION_BOUND");
    expect(sessionLifecycleOf("READ_CAPABILITY_ABSENT")).toBe("SESSION_IDENTIFIED_NOT_READ");
    for (const state of ["SESSION_MISSING", "CORRUPT_SESSION", "BACKEND_UNAVAILABLE", "FORMAT_UNSUPPORTED", "EVENT_GAP", "TRUNCATED_OBSERVATION", "IDENTITY_CONFLICT"] as const) {
      expect(sessionLifecycleOf(state)).toBe("SESSION_UNREADABLE");
      expect(SESSION_READ_STATES).toContain(state);
    }
  });
});

/* ================================================================== §5/§10 Admission */

describe("Trajectory-V0 §5/§10 — admission and quarantine", () => {
  it("§5: the historical-basis note is always stated", () => {
    const preview = buildHandoffPreview(inputOf());
    expect(preview.projectContext.historicalBasisNote).toContain("WORK_HISTORICAL_CUT_WITH_CURRENT_CROSS_OWNER_READS");
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

  it("completeness is derived, not asserted", () => {
    const unbound = buildHandoffPreview(inputOf({ sessionPage: undefined }));
    expect(unbound.completeness).toBe("PARTIAL");
    const bound = buildHandoffPreview(inputOf({ sessionPage: pageOf() }));
    expect(bound.completeness).toBe("COMPLETE");
  });

  it("§10: readOnlyViolations reports exactly the dimension that moved", () => {
    const base = { workEventCount: 5, workLastEventDigest: "a", projectIrRevision: 1, projectIrDigest: "b", reasoningBases: ["r1"], proofBasis: "p", sessionSourceDigest: "s" };
    expect(readOnlyViolations(base, { ...base })).toEqual([]);
    expect(readOnlyViolations(base, { ...base, workEventCount: 6 })).toEqual(["work event count changed: 5 -> 6"]);
    expect(readOnlyViolations(base, { ...base, sessionSourceDigest: "s2" })).toEqual(["DSH session source changed"]);
  });
});
