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
 *
 * ---------------------------------------------------------------- H1 C3 update (read this first)
 *
 * H0's `page()` helper set `returnedCount` while leaving `events: []` — the anti-pattern H1 §7.5
 * forbids. Under H1's page-integrity validator such a page is INVALID, so these fixtures now build
 * REAL contiguous event arrays. The H0 properties they assert are unchanged; only the fixtures are
 * honest now, which is why the assertions below are the SAME properties stated against real pages.
 */
import { describe, expect, it } from "vitest";

import {
  EVENT_PAGE_COVERAGE_STATES,
  previewCompletenessOf,
  type DshEventView,
  type DshSessionEventPage,
} from "../src/trajectory/index.js";
import { validateSessionEventPage } from "../src/trajectory/page_integrity.js";
import { buildHandoffPreview, type HandoffPreviewInput } from "../src/trajectory/handoff_preview.js";

const PROJECT = "h0d";
const ATTEMPT = `attempt-${"a".repeat(32)}`;
const SESSION = "session-fixture";

/** H1 C3: a real event view at the given sequence. */
function realEvent(seq: number): DshEventView {
  return Object.freeze({
    sessionId: SESSION, seq, type: "step/start", inherited: false,
    durability: "PERSISTED_DSH_EVENT" as const, time: 1_700_000_000_000 + seq, surface: null,
    summary: `step ${String(seq)} opened`, durationMs: null, observedStatus: null,
  });
}

/**
 * §9: a page with the given known/returned bounds and REAL contiguous events.
 *
 * `returnedCount` defaults to the number of events actually supplied, so a caller asking for a
 * "50 of 200" page gets fifty real events and a source that reports two hundred.
 */
function page(knownEventCount: number | null, returnedCount: number, syntheticRecoveryEventCount: number | null = 0): DshSessionEventPage {
  const synthetic = syntheticRecoveryEventCount ?? 0;
  /**
   * H1 C3: the durability counts describe the WHOLE OBSERVED LOG, exactly as the real reader reports
   * them (`persistedEventCount = stored.length`, `syntheticRecoveryEventCount = closers.length`,
   * `knownEventCount = stored + closers`). A page may return a SLICE of that log, so the counts are
   * anchored on the source's total rather than on the page's returned count.
   */
  const observedTotal = knownEventCount ?? returnedCount;
  const persistedCount = observedTotal - synthetic;
  const events = Object.freeze(
    Array.from({ length: returnedCount }, (_, index) =>
      index < persistedCount
        ? realEvent(index)
        : Object.freeze({ ...realEvent(index), durability: "SYNTHETIC_RECOVERY_EVENT" as const, type: "turn/end", observedStatus: "interrupted" }),
    ),
  );
  return Object.freeze({
    schemaVersion: 1 as const,
    readState: "READ_OK" as const,
    sessionId: SESSION,
    header: Object.freeze({ sessionId: SESSION, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }),
    sourceIdentity: "DSH_QUERY_PORT_FIXTURE",
    sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
    throughSeq: returnedCount === 0 ? null : returnedCount - 1,
    knownEventCount,
    inheritedEventCount: 0,
    requestedFromSeq: 0,
    requestedMaxEvents: 200,
    returnedCount,
    pageBounded: true as const,
    diskIoBounded: false,
    durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const,
    persistedEventCount: persistedCount,
    syntheticRecoveryEventCount,
    events,
    knownParentSession: null,
    proves: Object.freeze([]),
    doesNotProve: Object.freeze([]),
    detail: "a fixture page with real events",
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

  it("coverageOf derives FULL / PARTIAL / UNKNOWN / NOT_APPLICABLE from a validated page", () => {
    /**
     * ------------------------------------------------------------------ CHANGED ASSERTION (H1 C3)
     *
     * The baseline called the H0 two-number helper `eventPageCoverageOf({admitted, knownEventCount,
     * returnedCount})`. H1 C3 removed that helper, so the same four outcomes are asserted through the
     * validated accessor, with REAL events supplied for the pages that claim coverage.
     */
    expect(validateSessionEventPage({ page: undefined, admitted: false }).coverage).toBe("NOT_APPLICABLE");
    expect(validateSessionEventPage({ page: page(50, 50), admitted: true }).coverage).toBe("FULL");
    expect(validateSessionEventPage({ page: page(200, 50), admitted: true }).coverage).toBe("PARTIAL");
    expect(validateSessionEventPage({ page: page(null, 50), admitted: true }).coverage).toBe("UNKNOWN");
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
