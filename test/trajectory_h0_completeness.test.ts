/**
 * Trajectory-V0S-H0 §9 (C5) — PREVIEW COMPLETENESS AND COVERAGE INTEGRITY.
 *
 * The dynamic proof of H0-I5 for the coverage dimension: a readable, ATTRIBUTED page that returns only
 * part of the source must not produce a `COMPLETE` Preview, and the coverage must be reported as its
 * own dimension rather than collapsed into completeness.
 *
 * The attributed state is set by a CONTROLLED FIXTURE, because no binding producer exists in this
 * deployment. It models the consumer state a future verified binding WOULD produce; it does NOT claim
 * a real binding.
 */
import { describe, expect, it } from "vitest";

import {
  EVENT_PAGE_COVERAGE_STATES,
  eventPageCoverageOf,
  previewCompletenessOf,
  type DshSessionEventPage,
} from "../src/trajectory/index.js";
import { buildHandoffPreview, type HandoffPreviewInput } from "../src/trajectory/handoff_preview.js";

const PROJECT = "h0d";
const ATTEMPT = `attempt-${"a".repeat(32)}`;

/** §9: a page with the given known/returned bounds, attributed by the caller's binding. */
function page(knownEventCount: number | null, returnedCount: number, syntheticRecoveryEventCount: number | null = 0): DshSessionEventPage {
  return Object.freeze({
    schemaVersion: 1 as const,
    readState: "READ_OK" as const,
    sessionId: "session-fixture",
    header: Object.freeze({ sessionId: "session-fixture", version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }),
    sourceIdentity: "DSH_QUERY_PORT_FIXTURE",
    sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
    throughSeq: returnedCount - 1,
    knownEventCount,
    inheritedEventCount: 0,
    requestedFromSeq: 0,
    requestedMaxEvents: 50,
    returnedCount,
    pageBounded: true as const,
    diskIoBounded: false,
    durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const,
    persistedEventCount: knownEventCount,
    syntheticRecoveryEventCount,
    events: Object.freeze([]),
    knownParentSession: null,
    proves: Object.freeze([]),
    doesNotProve: Object.freeze([]),
    detail: "a fixture page",
  });
}

/** §9: a Preview input with an ATTRIBUTED read (a controlled fixture, not a real binding). */
function attributedInput(sessionPage: DshSessionEventPage): HandoffPreviewInput {
  return {
    projectId: PROJECT, attemptId: ATTEMPT,
    binding: {
      schemaVersion: 1 as const, projectId: PROJECT, attemptId: ATTEMPT, viewId: "tv-x",
      historicalWorkBasis: { basisDigest: null, capturedAtRevision: null, taskId: "t1" },
      hostLocalJobId: null, portInvocationId: null,
      dshSessionId: "session-fixture", claimedSessionId: "session-fixture",
      hostObservationProvenance: "NOT_OBSERVED" as const,
      sessionSource: "CANONICAL_ATTEMPT_BINDING" as const,
      sessionBindingStatus: "BOUND_VERIFIED" as const,
      sessionReadAdmission: "ADMITTED_TO_ATTEMPT" as const,
      bindingEvidenceRefs: Object.freeze([]), detail: "a controlled fixture models a verified binding",
    },
    canonical: {
      attemptState: "COMPLETED", taskId: "t1", workState: null, envelopeId: "env-1", basisDigest: null, capturedAtRevision: null,
      authorizationDetail: "x", resultRefs: ["1".repeat(40)], resultDetail: "x", verificationState: "NOT_RUN",
      promotionState: "NOT_PROMOTED", promotionId: null, reworkState: "NONE", reworkDetail: "x",
    },
    host: { hostLocalJobId: null, portInvocationId: null, processLifecycle: "NOT_OBSERVED", processDetail: "x", observedEventKinds: [], originLimitation: "x" },
    sessionPage,
    projectEvolution: {
      projectionRootId: "tr-x", projectionSemanticDigest: null, workSequence: 1, workEventDigest: null, projectIrRevision: 0,
      selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [],
      basisCompleteness: "COMPLETE",
    },
  };
}

describe("Trajectory-V0S-H0 §9 — coverage is its own dimension", () => {
  it("the coverage vocabulary is the ruled set", () => {
    expect([...EVENT_PAGE_COVERAGE_STATES]).toEqual(["FULL", "PARTIAL", "UNKNOWN", "NOT_APPLICABLE"]);
  });

  it("coverageOf derives FULL / PARTIAL / UNKNOWN / NOT_APPLICABLE from the page's own bounds", () => {
    expect(eventPageCoverageOf({ admitted: false, knownEventCount: 200, returnedCount: 50 })).toBe("NOT_APPLICABLE");
    expect(eventPageCoverageOf({ admitted: true, knownEventCount: 50, returnedCount: 50 })).toBe("FULL");
    expect(eventPageCoverageOf({ admitted: true, knownEventCount: 200, returnedCount: 50 })).toBe("PARTIAL");
    expect(eventPageCoverageOf({ admitted: true, knownEventCount: null, returnedCount: 50 })).toBe("UNKNOWN");
  });

  it("completeness requires FULL coverage, not merely an attributed read", () => {
    expect(previewCompletenessOf({ sessionLifecycle: "SESSION_READ", hasCanonicalResult: true, hasProjectContext: true, eventPageCoverage: "FULL" })).toBe("COMPLETE");
    expect(previewCompletenessOf({ sessionLifecycle: "SESSION_READ", hasCanonicalResult: true, hasProjectContext: true, eventPageCoverage: "PARTIAL" })).toBe("PARTIAL");
    expect(previewCompletenessOf({ sessionLifecycle: "SESSION_READ", hasCanonicalResult: true, hasProjectContext: true, eventPageCoverage: "UNKNOWN" })).toBe("PARTIAL");
  });

  it("a 50-of-200 attributed page yields PARTIAL and states the limitation", () => {
    const preview = buildHandoffPreview(attributedInput(page(200, 50)));
    expect(preview.completeness).toBe("PARTIAL");
    expect(preview.attribution.eventPageCoverage).toBe("PARTIAL");
    expect(preview.attribution.sessionAttribution).toBe("ATTRIBUTED");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("PARTIAL");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("will never append more events");
  });

  it("a 50-of-50 attributed page yields COMPLETE — the rule is not simply 'never complete'", () => {
    const preview = buildHandoffPreview(attributedInput(page(50, 50)));
    expect(preview.completeness).toBe("COMPLETE");
    expect(preview.attribution.eventPageCoverage).toBe("FULL");
  });

  it("a source reporting no total yields UNKNOWN coverage, never an assumed FULL", () => {
    const preview = buildHandoffPreview(attributedInput(page(null, 50)));
    expect(preview.completeness).not.toBe("COMPLETE");
    expect(preview.attribution.eventPageCoverage).toBe("UNKNOWN");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("cannot be claimed");
  });

  it("a synthetic recovery closer does not count as evidence of successful execution", () => {
    const preview = buildHandoffPreview(attributedInput(page(50, 50, 2)));
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("Synthetic recovery closers are present");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("NOT evidence that the original execution completed successfully");
  });

  it("an unattributed claim reports NOT_APPLICABLE coverage and cannot be COMPLETE", () => {
    const input = attributedInput(page(50, 50));
    const unattributed: HandoffPreviewInput = {
      ...input,
      binding: {
        ...input.binding,
        dshSessionId: null,
        sessionBindingStatus: "SESSION_CLAIMED_UNVERIFIED",
        sessionSource: "CALLER_DECLARATION",
        sessionReadAdmission: "NOT_REQUESTED",
      },
      sessionPage: undefined,
    };
    const preview = buildHandoffPreview(unattributed);
    expect(preview.attribution.eventPageCoverage).toBe("NOT_APPLICABLE");
    expect(preview.completeness).not.toBe("COMPLETE");
  });
});

describe("Trajectory-V0S-H0 §9.2 — structured basis currentness", () => {
  it("staleBasis follows the STRUCTURED basis completeness, not caveat text", () => {
    const incomplete: HandoffPreviewInput = {
      ...attributedInput(page(50, 50)),
      projectEvolution: { ...attributedInput(page(50, 50)).projectEvolution, basisCompleteness: "INCOMPLETE", currentnessCaveats: ["a caveat with no keyword at all"] },
    };
    expect(buildHandoffPreview(incomplete).caveats.staleBasis).toBe(true);

    const complete: HandoffPreviewInput = {
      ...attributedInput(page(50, 50)),
      projectEvolution: { ...attributedInput(page(50, 50)).projectEvolution, basisCompleteness: "COMPLETE", currentnessCaveats: ["this text says stale but the basis is COMPLETE"] },
    };
    expect(buildHandoffPreview(complete).caveats.staleBasis).toBe(false);

    const raced: HandoffPreviewInput = {
      ...attributedInput(page(50, 50)),
      projectEvolution: { ...attributedInput(page(50, 50)).projectEvolution, basisCompleteness: "RACED", currentnessCaveats: [] },
    };
    expect(buildHandoffPreview(raced).caveats.staleBasis).toBe(true);
  });
});
