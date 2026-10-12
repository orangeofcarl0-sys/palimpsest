/**
 * Trajectory-H1 §7 (C3) — PAGE INTEGRITY AND COVERAGE QUALIFICATION.
 *
 * The adversarial suite for H1's second product gate. It uses ACTUAL event entries whenever it claims
 * a full page — the H0 anti-pattern of setting `returnedCount=50` with an empty event array and calling
 * it FULL is exactly what this file forbids and reproduces as a defect.
 *
 * Evidence classes:
 *   CONTROLLED_FIXTURE  a unit/contract fixture over the real product validator
 *   REAL_DSH_NO_MODEL   the companion durability suite exercises the same validator over real pages
 *
 * No model is invoked, no provider is contacted and no personal session is touched.
 */
import { describe, expect, it } from "vitest";

import {
  eventPageCoverageOfPage,
  PAGE_INTEGRITY_REASONS,
  PAGE_INTEGRITY_STATES,
  validateSessionEventPage,
} from "../src/trajectory/page_integrity.js";
import type { DshEventView, DshSessionEventPage } from "../src/trajectory/execution.js";
import {
  buildHandoffPreview,
  type HandoffPreviewInput,
} from "../src/trajectory/handoff_preview.js";

const PROJECT = "h1c";
const ATTEMPT = `attempt-${"c".repeat(32)}`;
const SESSION = "session-h1c";

/** A real event view at the given sequence. */
function eventAt(seq: number, overrides: Partial<DshEventView> = {}): DshEventView {
  return Object.freeze({
    sessionId: SESSION,
    seq,
    type: "step/start",
    inherited: false,
    durability: "PERSISTED_DSH_EVENT" as const,
    time: 1_700_000_000_000 + seq,
    surface: null,
    summary: `step ${String(seq)} opened`,
    durationMs: null,
    observedStatus: null,
    ...overrides,
  }) as DshEventView;
}

/** A contiguous run of real events starting at `from`. */
function eventsFrom(from: number, count: number): readonly DshEventView[] {
  return Object.freeze(Array.from({ length: count }, (_, index) => eventAt(from + index)));
}

/** A page built from REAL events, with any field overridable. */
function page(input: {
  readonly events: readonly DshEventView[];
  readonly knownEventCount?: number | null;
  readonly returnedCount?: number;
  readonly throughSeq?: number | null;
  readonly requestedFromSeq?: number;
  readonly requestedMaxEvents?: number;
  readonly sessionId?: string;
  readonly headerSessionId?: string | null;
  readonly readState?: DshSessionEventPage["readState"];
  readonly persistedEventCount?: number | null;
  readonly syntheticRecoveryEventCount?: number | null;
  readonly durabilityProvenance?: DshSessionEventPage["durabilityProvenance"];
}): DshSessionEventPage {
  const events = input.events;
  const sessionId = input.sessionId ?? SESSION;
  const persisted = input.persistedEventCount === undefined ? (input.knownEventCount ?? events.length) : input.persistedEventCount;
  return Object.freeze({
    schemaVersion: 1 as const,
    readState: input.readState ?? ("READ_OK" as const),
    sessionId,
    header:
      input.headerSessionId === null
        ? null
        : Object.freeze({ sessionId: input.headerSessionId ?? sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }),
    sourceIdentity: "fixture",
    sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
    throughSeq: input.throughSeq === undefined ? (events.length === 0 ? null : events[events.length - 1]!.seq) : input.throughSeq,
    knownEventCount: input.knownEventCount === undefined ? events.length : input.knownEventCount,
    inheritedEventCount: 0,
    requestedFromSeq: input.requestedFromSeq ?? 0,
    requestedMaxEvents: input.requestedMaxEvents ?? 50,
    returnedCount: input.returnedCount ?? events.length,
    pageBounded: true as const,
    diskIoBounded: false,
    durabilityProvenance: input.durabilityProvenance ?? ("PERSISTED_AND_SYNTHETIC_SEPARATED" as const),
    persistedEventCount: persisted,
    syntheticRecoveryEventCount: input.syntheticRecoveryEventCount === undefined ? 0 : input.syntheticRecoveryEventCount,
    events,
    knownParentSession: null,
    proves: Object.freeze([]),
    doesNotProve: Object.freeze([]),
    detail: "a fixture page",
  }) as DshSessionEventPage;
}

/** An ATTRIBUTED Preview input over the given page. */
function attributedInput(sessionPage: DshSessionEventPage | undefined): HandoffPreviewInput {
  return {
    projectId: PROJECT,
    attemptId: ATTEMPT,
    binding: {
      schemaVersion: 1 as const, projectId: PROJECT, attemptId: ATTEMPT, viewId: "tv-x",
      historicalWorkBasis: { basisDigest: null, capturedAtRevision: null, taskId: "t1" },
      hostLocalJobId: null, portInvocationId: null,
      dshSessionId: SESSION, claimedSessionId: SESSION,
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
    ...(sessionPage === undefined ? {} : { sessionPage }),
    projectEvolution: {
      projectionRootId: "tr-x", projectionSemanticDigest: null, workSequence: 1, workEventDigest: null, projectIrRevision: 0,
      selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [],
      basisCompleteness: "COMPLETE",
    },
  };
}

const admit = { admitted: true, expectedSessionId: SESSION } as const;

describe("Trajectory-H1 §7 — page integrity vocabulary and verdicts", () => {
  it("the integrity vocabulary and the reason codes are the ruled sets", () => {
    expect([...PAGE_INTEGRITY_STATES]).toEqual(["VALID_FULL", "VALID_PARTIAL", "VALID_UNKNOWN_COVERAGE", "NOT_APPLICABLE", "INVALID"]);
    // Every reason is a stable machine-readable code, not prose.
    for (const reason of PAGE_INTEGRITY_REASONS) expect(reason).toMatch(/^[A-Z_]+$/);
  });

  it("F2 counterexample: returnedCount=50 with an EMPTY event array is INVALID, never FULL", () => {
    const contradiction = page({ events: Object.freeze([]), returnedCount: 50, knownEventCount: 50, throughSeq: 49 });
    const verdict = validateSessionEventPage({ page: contradiction, ...admit });
    expect(verdict.state).toBe("INVALID");
    expect(verdict.reason).toBe("RETURNED_COUNT_MISMATCH");
    expect(verdict.coverage).toBe("NOT_APPLICABLE");
  });

  it("F4 counterexample: every malformed page is INVALID with its own bounded reason", () => {
    const cases: ReadonlyArray<readonly [string, ReturnType<typeof page>, string]> = [
      ["sequence gap", page({ events: [eventAt(0), eventAt(1), eventAt(5), eventAt(6)], knownEventCount: 4 }), "SEQUENCE_NOT_CONTIGUOUS"],
      ["duplicate sequence", page({ events: [eventAt(0), eventAt(1), eventAt(1)], knownEventCount: 3 }), "SEQUENCE_NOT_CONTIGUOUS"],
      ["descending sequence", page({ events: [eventAt(1), eventAt(0)], knownEventCount: 2 }), "SEQUENCE_NOT_CONTIGUOUS"],
      ["incorrect throughSeq", page({ events: eventsFrom(0, 3), knownEventCount: 3, throughSeq: 9 }), "WATERMARK_MISMATCH"],
      ["event SessionId mismatch", page({ events: [eventAt(0), eventAt(1, { sessionId: "session-other" })], knownEventCount: 2 }), "EVENT_SESSION_MISMATCH"],
      ["header SessionId mismatch", page({ events: eventsFrom(0, 2), knownEventCount: 2, headerSessionId: "session-other" }), "HEADER_SESSION_MISMATCH"],
      ["returned exceeds requested maximum", page({ events: eventsFrom(0, 50), knownEventCount: 50, requestedMaxEvents: 10 }), "RETURNED_EXCEEDS_REQUESTED_MAX"],
      ["known count below returned", page({ events: eventsFrom(0, 5), knownEventCount: 3, requestedMaxEvents: 50 }), "KNOWN_COUNT_BELOW_RETURNED"],
      ["negative numeric metadata", page({ events: eventsFrom(0, 2), knownEventCount: -1 }), "INVALID_NUMERIC_METADATA"],
      ["cursor mismatch", page({ events: eventsFrom(10, 3), knownEventCount: 13, requestedFromSeq: 5 }), "CURSOR_MISMATCH"],
    ];
    for (const [label, candidate, reason] of cases) {
      const verdict = validateSessionEventPage({ page: candidate, ...admit });
      expect(verdict.state, label).toBe("INVALID");
      expect(verdict.reason, label).toBe(reason);
      expect(verdict.coverage, label).toBe("NOT_APPLICABLE");
    }
  });

  it("a non-successful read state cannot establish coverage", () => {
    for (const readState of ["SESSION_MISSING", "CORRUPT_SESSION", "FORMAT_UNSUPPORTED", "EVENT_GAP", "INVALID_REQUEST", "READ_CAPABILITY_ABSENT"] as const) {
      const verdict = validateSessionEventPage({ page: page({ events: Object.freeze([]), readState, knownEventCount: null }), ...admit });
      expect(verdict.state, readState).toBe("INVALID");
      expect(verdict.reason, readState).toBe("READ_STATE_NOT_OK");
    }
  });

  it("a page for a DIFFERENT session than the verified binding is INVALID", () => {
    const other = page({ events: eventsFrom(0, 2), knownEventCount: 2, sessionId: "session-Y", headerSessionId: "session-Y" });
    const verdict = validateSessionEventPage({ page: other, admitted: true, expectedSessionId: SESSION });
    expect(verdict.state).toBe("INVALID");
    expect(verdict.reason).toBe("SESSION_ID_MISMATCH");
  });

  it("F3 counterexample: a nonzero-cursor page cannot claim whole-history FULL", () => {
    /**
     * The baseline rule was `returnedCount >= knownEventCount -> FULL`, which ignores where the page
     * begins. Two shapes are relevant, and the corrected validator handles both:
     *
     *  (a) a page that claims as many events as the source reports while starting mid-history. For real
     *      events that is SELF-CONTRADICTORY: 100 events from seq 50 reach seq 149, but the source says
     *      there are only 100 events. The baseline called it FULL; the validator refuses it.
     *  (b) an honestly mid-history page: it covers a real sub-range and is PARTIAL.
     */
    const appearsComplete = page({ events: eventsFrom(50, 100), knownEventCount: 100, requestedFromSeq: 50, requestedMaxEvents: 200 });
    const contradictory = validateSessionEventPage({ page: appearsComplete, ...admit });
    expect(contradictory.state).toBe("INVALID");
    expect(contradictory.reason).toBe("WATERMARK_MISMATCH");
    expect(contradictory.coverage).toBe("NOT_APPLICABLE");

    // (b) a consistent mid-history page is PARTIAL and says why it is not full.
    const midHistory = page({ events: eventsFrom(50, 100), knownEventCount: 150, requestedFromSeq: 50, requestedMaxEvents: 200 });
    const verdict = validateSessionEventPage({ page: midHistory, ...admit });
    expect(verdict.state).toBe("VALID_PARTIAL");
    expect(verdict.coverage).toBe("PARTIAL");
    expect(verdict.detail).toContain("does not begin at the start");
  });

  it("a page that omits the tail is PARTIAL, not FULL", () => {
    const partial = page({ events: eventsFrom(0, 50), knownEventCount: 200, requestedMaxEvents: 50 });
    const verdict = validateSessionEventPage({ page: partial, ...admit });
    expect(verdict.state).toBe("VALID_PARTIAL");
    expect(verdict.coverage).toBe("PARTIAL");
  });

  it("a valid 50-of-50 page with REAL events is FULL", () => {
    const full = page({ events: eventsFrom(0, 50), knownEventCount: 50, requestedMaxEvents: 50 });
    const verdict = validateSessionEventPage({ page: full, ...admit });
    expect(verdict.state).toBe("VALID_FULL");
    expect(verdict.coverage).toBe("FULL");
  });

  it("a valid 50-of-200 page is PARTIAL", () => {
    const partial = page({ events: eventsFrom(0, 50), knownEventCount: 200, requestedMaxEvents: 50 });
    expect(validateSessionEventPage({ page: partial, ...admit }).coverage).toBe("PARTIAL");
  });

  it("READ_OK with an unknown total is VALID_UNKNOWN_COVERAGE, never an assumed FULL", () => {
    const unknown = page({ events: eventsFrom(0, 10), knownEventCount: null, requestedMaxEvents: 50 });
    const verdict = validateSessionEventPage({ page: unknown, ...admit });
    expect(verdict.state).toBe("VALID_UNKNOWN_COVERAGE");
    expect(verdict.coverage).toBe("UNKNOWN");
  });

  it("a valid empty Session is distinct from an unreadable source", () => {
    // A genuinely empty stored session: zero events, known total zero.
    const empty = page({ events: Object.freeze([]), knownEventCount: 0, requestedMaxEvents: 50, persistedEventCount: 0, syntheticRecoveryEventCount: 0 });
    const verdict = validateSessionEventPage({ page: empty, ...admit });
    expect(verdict.state).toBe("VALID_FULL");
    expect(verdict.coverage).toBe("FULL");

    // An empty page after a NONZERO cursor is not the whole history.
    const afterCursor = page({ events: Object.freeze([]), knownEventCount: 5, requestedFromSeq: 5, requestedMaxEvents: 50, persistedEventCount: 5, syntheticRecoveryEventCount: 0 });
    expect(validateSessionEventPage({ page: afterCursor, ...admit }).coverage).toBe("PARTIAL");

    // An unreadable source is INVALID, not an empty history.
    const unreadable = page({ events: Object.freeze([]), readState: "CORRUPT_SESSION", knownEventCount: null });
    expect(validateSessionEventPage({ page: unreadable, ...admit }).state).toBe("INVALID");
  });

  it("an unresolved durability provenance is honest, not invalid", () => {
    const unresolved = page({
      events: eventsFrom(0, 3), knownEventCount: 3, requestedMaxEvents: 50,
      durabilityProvenance: "DURABILITY_UNRESOLVED", persistedEventCount: null, syntheticRecoveryEventCount: null,
    });
    const verdict = validateSessionEventPage({ page: unresolved, ...admit });
    // Consistency and durability are SEPARATE facts: an unresolved boundary does not make the page
    // self-contradictory, and the page still covers its whole known range.
    expect(verdict.state).toBe("VALID_FULL");
    const durabilityCheck = verdict.checks.find((check) => check.check === "durabilityMetadata");
    expect(durabilityCheck?.detail).toContain("no event is asserted to have been durably stored");
  });

  it("contradictory durability metadata is INVALID rather than trusted", () => {
    // The page claims a separated boundary at 5, but seq 1 is labelled SYNTHETIC.
    const contradictory = page({
      events: [eventAt(0), eventAt(1, { durability: "SYNTHETIC_RECOVERY_EVENT" }), eventAt(2)],
      knownEventCount: 3, requestedMaxEvents: 50, persistedEventCount: 5, syntheticRecoveryEventCount: 0,
    });
    const verdict = validateSessionEventPage({ page: contradictory, ...admit });
    expect(verdict.state).toBe("INVALID");
    expect(verdict.reason).toBe("DURABILITY_METADATA_CONTRADICTORY");

    // Counts that do not add up to the known total are equally contradictory.
    const badTotals = page({
      events: eventsFrom(0, 3), knownEventCount: 3, requestedMaxEvents: 50, persistedEventCount: 5, syntheticRecoveryEventCount: 5,
    });
    expect(validateSessionEventPage({ page: badTotals, ...admit }).reason).toBe("DURABILITY_METADATA_CONTRADICTORY");
  });

  it("an unattributed page makes NO coverage claim, and that is not a defect report", () => {
    const verdict = validateSessionEventPage({ page: page({ events: eventsFrom(0, 5), knownEventCount: 5 }), admitted: false });
    expect(verdict.state).toBe("NOT_APPLICABLE");
    expect(verdict.coverage).toBe("NOT_APPLICABLE");
    expect(verdict.reason).toBeNull();
    // And no page at all is the same verdict.
    expect(validateSessionEventPage({ page: undefined, admitted: false }).state).toBe("NOT_APPLICABLE");
  });

  it("eventPageCoverageOfPage is the validated accessor", () => {
    expect(eventPageCoverageOfPage({ page: page({ events: eventsFrom(0, 5), knownEventCount: 5 }), ...admit })).toBe("FULL");
    expect(eventPageCoverageOfPage({ page: page({ events: Object.freeze([]), returnedCount: 50, knownEventCount: 50 }), ...admit })).toBe("NOT_APPLICABLE");
  });
});

describe("Trajectory-H1 §7.4 — an invalid page fails closed in the Preview", () => {
  it("an INVALID page admits NO events, cannot be COMPLETE, and is not reported as a readable session", () => {
    const contradictory = page({ events: Object.freeze([]), returnedCount: 50, knownEventCount: 50, throughSeq: 49 });
    const preview = buildHandoffPreview(attributedInput(contradictory));

    // §7.4: no coverage claim, no completeness, no trusted events.
    expect(preview.attribution.eventPageCoverage).toBe("NOT_APPLICABLE");
    expect(preview.attribution.pageIntegrity).toBe("INVALID");
    expect(preview.attribution.pageIntegrityReason).toBe("RETURNED_COUNT_MISMATCH");
    expect(preview.completeness).not.toBe("COMPLETE");
    expect(preview.execution.events).toEqual([]);
    expect(preview.execution.eventsDetail).toContain("NOT admitted");
    // §7.4: the lifecycle does not present a self-contradictory page as a trustworthy read.
    expect(preview.execution.sessionLifecycle).toBe("SESSION_UNREADABLE");
    // §7.4: the bounded reason is exposed machine-readably and in the caveats.
    expect(preview.caveats.contradictoryObservations.join(" ")).toContain("INVALID");
    expect(preview.caveats.contradictoryObservations.join(" ")).toContain("RETURNED_COUNT_MISMATCH");
  });

  it("an INVALID page does not fabricate a Work failure or a promotion change", () => {
    const contradictory = page({ events: Object.freeze([]), returnedCount: 50, knownEventCount: 50 });
    const preview = buildHandoffPreview(attributedInput(contradictory));
    // §7.4: the canonical facts are the owner's, untouched by a malformed Session page.
    expect(preview.canonical.attemptState).toBe("COMPLETED");
    expect(preview.canonical.resultRefs.length).toBeGreaterThan(0);
    expect(preview.canonical.promotionState).toBe("NOT_PROMOTED");
    expect(preview.projectContext.projectionRootId).toBe("tr-x");
  });

  it("a VALID FULL page still completes a Preview — the rule is not 'never complete'", () => {
    const full = page({ events: eventsFrom(0, 50), knownEventCount: 50, requestedMaxEvents: 50 });
    const preview = buildHandoffPreview(attributedInput(full));
    expect(preview.attribution.pageIntegrity).toBe("VALID_FULL");
    expect(preview.attribution.eventPageCoverage).toBe("FULL");
    expect(preview.completeness).toBe("COMPLETE");
    expect(preview.execution.sessionLifecycle).toBe("SESSION_READ");
    expect(preview.execution.events.length).toBe(50);
  });

  it("a FULL observed range does NOT assert Session termination", () => {
    const full = page({ events: eventsFrom(0, 50), knownEventCount: 50, requestedMaxEvents: 50 });
    const preview = buildHandoffPreview(attributedInput(full));
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("will never append more events");
  });

  it("Work verification and promotion stay independent of any page verdict", () => {
    const full = page({ events: eventsFrom(0, 50), knownEventCount: 50, requestedMaxEvents: 50 });
    const preview = buildHandoffPreview(attributedInput(full));
    expect(preview.canonical.verificationState).toBe("NOT_RUN");
    expect(preview.canonical.promotionState).toBe("NOT_PROMOTED");
  });

  it("a synthetic closer does not establish execution success", () => {
    const withClosers = page({
      events: [eventAt(0), eventAt(1), eventAt(2, { type: "turn/end", durability: "SYNTHETIC_RECOVERY_EVENT", observedStatus: "interrupted" })],
      knownEventCount: 3, requestedMaxEvents: 50, persistedEventCount: 2, syntheticRecoveryEventCount: 1,
    });
    const verdict = validateSessionEventPage({ page: withClosers, ...admit });
    expect(verdict.state).toBe("VALID_FULL");
    const preview = buildHandoffPreview(attributedInput(withClosers));
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("NOT evidence that the original execution completed successfully");
    // And the synthetic event keeps its own durability class in the admitted view.
    const closer = preview.execution.events.find((event) => event.seq === 2);
    expect(closer?.durability).toBe("SYNTHETIC_RECOVERY_EVENT");
  });

  it("an attributed page with UNRESOLVED durability is still usable, with the limitation stated", () => {
    const unresolved = page({
      events: eventsFrom(0, 5), knownEventCount: 5, requestedMaxEvents: 50,
      durabilityProvenance: "DURABILITY_UNRESOLVED", persistedEventCount: null, syntheticRecoveryEventCount: null,
    });
    const preview = buildHandoffPreview(attributedInput(unresolved));
    expect(preview.attribution.pageIntegrity).toBe("VALID_FULL");
    expect(preview.completeness).toBe("COMPLETE");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("no event is asserted to have been durably stored");
  });
});
