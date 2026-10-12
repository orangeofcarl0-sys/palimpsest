/**
 * Trajectory-H1 §5 (C1) — BASELINE FALSIFIERS F1–F10, MEASURED AGAINST THE EXACT H0 BASELINE.
 *
 * This file reproduces the source-consistency and binding-contract defects that H1 must correct,
 * BEFORE any production behaviour changes. Every falsifier is classified honestly:
 *
 *   DYNAMICALLY_REPRODUCED  executed against the real baseline contract code
 *   SOURCE_DEMONSTRATED     proven by reading the baseline source, not executed
 *   NOT_ESTABLISHED         the evidence did not support the claim either way
 *
 * Evidence classes used below:
 *   REAL_DSH_NO_MODEL        a real first-party DSH behaviour (used by the companion audit script)
 *   CONTROLLED_RULE_FIXTURE  the exact baseline predicate reproduced as an isolated fixture
 *   CONTROLLED_FIXTURE       a unit/contract fixture over the real baseline function
 *   SOURCE_ONLY              a source-text reading
 *
 * No model is invoked, no provider is contacted and no personal session is touched.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyHostObservation,
  classifySessionBinding,
} from "../src/trajectory/execution.js";
import {
  buildHandoffPreview,
  eventPageCoverageOf,
  type HandoffPreviewInput,
} from "../src/trajectory/handoff_preview.js";
import type { DshSessionEventPage } from "../src/trajectory/execution.js";

const PROJECT = "h1a";
const ATTEMPT = `attempt-${"a".repeat(32)}`;
const SESSION = "session-fixture";

const SOURCE_FILES = {
  reader: "scripts/trajectory_v0/dsh-session-reader.mjs",
  execution: "src/trajectory/execution.ts",
  preview: "src/trajectory/handoff_preview.ts",
  composition: "src/composition/trajectory_v0.ts",
  relation: "src/trajectory/relation_admission.ts",
  projection: "src/trajectory/projection.ts",
} as const;

function source(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

/** A page with explicit, possibly self-contradictory metadata. */
function page(overrides: Partial<DshSessionEventPage> & { readonly events?: readonly never[] }): DshSessionEventPage {
  const base = {
    schemaVersion: 1 as const,
    readState: "READ_OK" as const,
    sessionId: SESSION,
    header: { sessionId: SESSION, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null },
    sourceIdentity: "fixture",
    sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
    throughSeq: 49,
    knownEventCount: 50,
    inheritedEventCount: 0,
    requestedFromSeq: 0,
    requestedMaxEvents: 50,
    returnedCount: 50,
    pageBounded: true as const,
    diskIoBounded: false,
    durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const,
    persistedEventCount: 50,
    syntheticRecoveryEventCount: 0,
    events: Object.freeze([]),
    knownParentSession: null,
    proves: Object.freeze([]),
    doesNotProve: Object.freeze([]),
    detail: "a fixture page",
  };
  return Object.freeze({ ...base, ...overrides }) as DshSessionEventPage;
}

/** An ATTRIBUTED Preview input (a controlled fixture modelling a verified binding). */
function attributedInput(sessionPage: DshSessionEventPage): HandoffPreviewInput {
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
    sessionPage,
    projectEvolution: {
      projectionRootId: "tr-x", projectionSemanticDigest: null, workSequence: 1, workEventDigest: null, projectIrRevision: 0,
      selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [],
      basisCompleteness: "COMPLETE",
    },
  };
}

/* ================================================================== F1 */

describe("H1 F1 — H0's counter consistency rule is insufficient", () => {
  it("F1 (baseline): `stored.count <= coldRead.events.length` accepts a boundary from a different snapshot", () => {
    /**
     * CONTROLLED_RULE_FIXTURE + SOURCE_DEMONSTRATED.
     *
     * The baseline rule is at `scripts/trajectory_v0/dsh-session-reader.mjs`:
     *     const boundaryConsistent = stored === null ? false : stored.count <= all.length;
     *
     * `all` is the COLD READ's returned array, which already includes `interruptedTurnClosers`. So the
     * comparison is between a raw stored count and a total that contains synthetic events. The exact
     * baseline predicate is reproduced here so the arithmetic counterexample is executed rather than
     * merely asserted.
     */
    const baselineBoundaryConsistent = (storedCount: number, coldReadTotal: number): boolean => storedCount <= coldReadTotal;

    // Cold read: 2 stored events + 2 synthetic recovery closers = 4 returned.
    const coldReadTotal = 4;
    // A later stored-prefix read observes 3 stored events (the writer appended one between reads).
    const laterStoredCount = 3;

    // The baseline accepts the boundary...
    expect(baselineBoundaryConsistent(laterStoredCount, coldReadTotal)).toBe(true);

    /**
     * ...and the classification it derives is wrong. The first read's own true stored boundary was 2,
     * so seqs 2 and 3 in THAT read were synthetic. Classifying by the LATER count of 3 makes seq 2
     * "persisted" — a synthetic closer promoted to a stored event.
     */
    const baselineDurabilityOf = (seq: number): string => (seq < laterStoredCount ? "PERSISTED_DSH_EVENT" : "SYNTHETIC_RECOVERY_EVENT");
    expect(baselineDurabilityOf(2)).toBe("PERSISTED_DSH_EVENT"); // was synthetic in the observed read

    // The source rule is still the baseline one at this commit (it is corrected by C2).
    const code = source(SOURCE_FILES.reader);
    expect(code).toContain("const boundaryConsistent = stored === null ? false : stored.count <= all.length;");
  });
});

/* ================================================================== F2 */

describe("H1 F2 — false FULL coverage from inconsistent counts", () => {
  it("F2 (baseline): known=50, returned=50, events=[] still yields FULL and COMPLETE", () => {
    /**
     * DYNAMICALLY_REPRODUCED against the real baseline pure functions. The ruling's exact construction:
     * a page whose count metadata claims 50 events while the returned array is EMPTY.
     */
    expect(eventPageCoverageOf({ admitted: true, knownEventCount: 50, returnedCount: 50 })).toBe("FULL");

    const preview = buildHandoffPreview(attributedInput(page({ knownEventCount: 50, returnedCount: 50, events: Object.freeze([]) })));
    expect(preview.attribution.eventPageCoverage).toBe("FULL");
    expect(preview.completeness).toBe("COMPLETE");
    // The absence is invisible: no caveat reports that the page carried no events at all.
    expect(preview.caveats.epistemicLimits.join(" ")).not.toContain("no events");
  });
});

/* ================================================================== F3 */

describe("H1 F3 — a nonzero cursor is not distinguished from full-history coverage", () => {
  it("F3 (baseline): a page beginning mid-history still reports FULL coverage", () => {
    /**
     * DYNAMICALLY_REPRODUCED. H0 has no notion of "the page must begin at the start of the relevant
     * Session-local range to claim full coverage". A page requesting from seq 50 that reports a
     * returned count equal to the source's total is reported FULL even though seqs 0..49 are absent.
     */
    const midHistory = page({ requestedFromSeq: 50, knownEventCount: 100, returnedCount: 100, throughSeq: 149 });
    expect(eventPageCoverageOf({ admitted: true, knownEventCount: midHistory.knownEventCount ?? null, returnedCount: midHistory.returnedCount })).toBe("FULL");
    const preview = buildHandoffPreview(attributedInput(midHistory));
    expect(preview.attribution.eventPageCoverage).toBe("FULL");
    // The baseline has no field that records the page did not begin at the beginning.
    expect(preview.attribution.detail).not.toContain("begins");
  });
});

/* ================================================================== F4 */

describe("H1 F4 — malformed page metadata is accepted", () => {
  it("F4 (baseline): watermark, count, sequence and identity inconsistencies all still yield FULL", () => {
    /**
     * DYNAMICALLY_REPRODUCED. `eventPageCoverageOf` reads ONLY `knownEventCount` and `returnedCount`,
     * so none of these malformations is detected.
     */
    const malformed: ReadonlyArray<readonly [string, DshSessionEventPage]> = [
      ["incorrect throughSeq (claims a watermark the events cannot reach)", page({ knownEventCount: 50, returnedCount: 50, throughSeq: 9 })],
      ["returnedCount exceeds the requested maximum", page({ requestedMaxEvents: 10, returnedCount: 50, knownEventCount: 50 })],
      ["page SessionId differs from the header SessionId", page({ sessionId: "session-other", knownEventCount: 50, returnedCount: 50 })],
      ["negative metadata", page({ knownEventCount: -1, returnedCount: 50 })],
    ];
    for (const [label, candidate] of malformed) {
      expect(eventPageCoverageOf({ admitted: true, knownEventCount: candidate.knownEventCount, returnedCount: candidate.returnedCount }), label).toBe("FULL");
    }

    /**
     * The reader-level checks that WOULD catch a sequence gap exist (the reader scans contiguity), but
     * the CONSUMER's coverage helper validates none of the page's own fields. That asymmetry is the
     * defect: a page reaching the consumer through any other path is not validated at all.
     */
    const previewCode = source(SOURCE_FILES.preview);
    expect(previewCode).toContain("return input.returnedCount >= input.knownEventCount ? \"FULL\" : \"PARTIAL\";");
  });
});

/* ================================================================== F5 */

describe("H1 F5 — boolean binding authority", () => {
  it("F5 (baseline): a bare boolean elevates the caller's claimed SessionId to BOUND_VERIFIED", () => {
    /**
     * DYNAMICALLY_REPRODUCED against the real baseline classifier. `canonicalBindingPresent` is an
     * input that is NOT tied to any specific SessionId, so `true` plus ANY claimed id yields
     * BOUND_VERIFIED for that claimed id.
     */
    const elevated = classifySessionBinding({
      claimedSessionId: "session-X",
      canonicalBindingPresent: true,
      candidateCount: 1,
      sourceReadable: true,
      conflictDetail: null,
    });
    expect(elevated.state).toBe("BOUND_VERIFIED");
    expect(elevated.source).toBe("CANONICAL_ATTEMPT_BINDING");

    /**
     * And the composition derives the ESTABLISHED id from that state:
     *     dshSessionId: classification.state === "BOUND_VERIFIED" ? claimedSessionId : null
     * so the boolean alone decides that the CALLER's id is the attempt's session.
     *
     * This is a FUTURE-INTEGRATION CONTRACT RISK, not a reachable production exploit: the composition
     * supplies `canonicalBindingPresent: false` today (asserted below).
     */
    const composition = source(SOURCE_FILES.composition);
    expect(composition).toContain('dshSessionId: classification.state === "BOUND_VERIFIED" ? claimedSessionId : null');
    expect(composition).toContain("canonicalBindingPresent: false");
  });
});

/* ================================================================== F6 */

describe("H1 F6 — host provenance implies process coverage", () => {
  it("F6 (baseline): LOCAL_PORT_OBSERVATION yields COMPLETE coverage regardless of what was observed", () => {
    /**
     * DYNAMICALLY_REPRODUCED. `attributionOf` maps provenance to coverage directly:
     *     LOCAL_PORT_OBSERVATION -> processObservation = "COMPLETE"
     * with no reference to which lifecycle phases the producer actually saw. A producer that observed
     * only a Spawn would still report COMPLETE coverage of the process lifecycle.
     */
    const produced = classifyHostObservation({ recordPresent: true, attemptMatches: true, hasLocalIdentity: true, originEstablished: true, conflictDetail: null });
    expect(produced.provenance).toBe("LOCAL_PORT_OBSERVATION");

    const input = attributedInput(page({ knownEventCount: 50, returnedCount: 50 }));
    const preview = buildHandoffPreview({
      ...input,
      binding: { ...input.binding, hostObservationProvenance: "LOCAL_PORT_OBSERVATION" },
      host: { ...input.host, processLifecycle: "RUNNING", observedEventKinds: ["DIRECT_CHILD_SPAWN_OBSERVED"] },
    });
    expect(preview.attribution.processObservation).toBe("COMPLETE");

    /**
     * This is a CONTROLLED FUTURE-PATH contract defect: no producer establishes origin on the ordinary
     * Preview path today (H0 supplies `originEstablished: false`), so it is not an ordinary exploit.
     */
    const composition = source(SOURCE_FILES.composition);
    expect(composition).toContain("originEstablished: false");
  });
});

/* ================================================================== F7 */

describe("H1 F7 — relation evidence preconditions and the T0 trust boundary", () => {
  it("F7: the selector is a selector over a T0-validated projection, not a validator of arbitrary input", () => {
    /**
     * SOURCE_DEMONSTRATED. `verdictFor` enforces, on its OWN authority:
     *   - the evidence reference names the WORK plane;
     *   - the evidence carries a canonical id;
     *   - the evidence's project scope matches, when present;
     *   - the relation-specific endpoint roles and the compared identity field.
     *
     * It does NOT re-derive the edge from canonical state, does NOT check `byReference.verification`,
     * does NOT verify `evidenceState` beyond the caller's pre-filter, and does NOT validate that the
     * projection's nodes are internally consistent. Those are T0's responsibilities, and T0 has
     * already run `buildProjectTrajectory` over the canonical Work events by the time the selector sees
     * the projection. The correct trust boundary is therefore: SELECTOR OVER A T0-VALIDATED PROJECTION.
     */
    const code = source(SOURCE_FILES.relation);
    expect(code).toContain('if (by.ownerPlane !== "WORK")');
    expect(code).toContain('if (by.canonicalId === null)');
    expect(code).toContain("if (by.projectId !== null && by.projectId !== context.projectId)");
    // The selector does not consult byReference.verification, so it relies on T0 for source verification.
    expect(code).not.toContain("by.verification");
    // It also does not re-check the edge evidence state inside verdictFor; that gate is the caller's.
    expect(code).toContain('if (edge.evidenceState !== "ESTABLISHED_BY_OWNER_REFERENCE" || edge.evidence === null)');
  });
});

/* ================================================================== F8 */

describe("H1 F8 — quarantine identity loss", () => {
  it("F8 (baseline): quarantine entries are deduplicated by relation NAME, collapsing distinct edges", () => {
    /**
     * SOURCE_DEMONSTRATED. The final dedup is:
     *     [...new Map(quarantined.map((entry) => [entry.relation, entry])).values()]
     * The map key is the RELATION NAME, so two genuinely distinct rejected edges of the same relation
     * (for example two different ATTEMPT_PRODUCED_RESULT edges that both fail their role check for
     * different reasons) collapse to ONE reported entry and the second reason is lost.
     */
    const code = source(SOURCE_FILES.relation);
    expect(code).toContain("new Map(quarantined.map((entry) => [entry.relation, entry])).values()");

    /**
     * The quarantine SCOPE also uses the broad `canonicalEventIds` set, which includes the attempt's
     * AUTHORIZATION event. A shared authorization event is therefore in two attempts' scope sets, so a
     * rejected relation touching the shared node can be reported as BOTH attempts' quarantined fact.
     */
    expect(code).toContain("context.canonicalEventIds.has(from)");
    // The scope set itself is built in the composition adapter, and it includes the AUTHORIZATION
    // event — the one identity two attempts can share.
    expect(source(SOURCE_FILES.composition)).toContain("canonicalEventIds.add(String(admitted.authorization.event_id))");
  });
});

/* ================================================================== F9 */

describe("H1 F9 — T0 traceAttempt identity matching", () => {
  it("F9: traceAttempt() still matches by display-label substring (source-demonstrated, not modified)", () => {
    /**
     * SOURCE_DEMONSTRATED. T0's public `traceAttempt()` selects by `node.label.includes(attemptId)`
     * combined with `node.label.startsWith("ATTEMPT_CREATED")`. A label is display data, never
     * identity, so a label that merely CONTAINS the id can be selected.
     *
     * H1 does NOT modify `src/trajectory/projection.ts`: T0's frozen projection semantics and
     * historical digests are protected, and a correct fix requires new T0 domain structure. The
     * finding is recorded and deferred to an independently reviewable T0 correctness slice.
     */
    const code = source(SOURCE_FILES.projection);
    expect(code).toContain("node.label.includes(attemptId)");
    expect(code).toContain('node.label.startsWith("ATTEMPT_CREATED")');
  });
});

/* ================================================================== F10 */

describe("H1 F10 — projection failure taxonomy", () => {
  it("F10 (baseline): a non-TrajectoryRefusal failure of CANONICAL WORK access is reported as optional", () => {
    /**
     * SOURCE_DEMONSTRATED. H0 distinguishes `error instanceof TrajectoryRefusal` (a canonical Work
     * source failure) from everything else, and describes "everything else" as an OPTIONAL cross-owner
     * plane that could not be projected.
     *
     * The residual defect: the T0 projection reads the canonical Work plane through the SAME input
     * object, and a raw failure from that read (for example an EventStore error that is not wrapped in
     * a `TrajectoryRefusal`) is NOT a `TrajectoryRefusal`, so it is reported as an optional owner's
     * absence. A canonical-source failure is thereby downgraded to an optional limitation.
     */
    const code = source(SOURCE_FILES.composition);
    expect(code).toContain("const workSourceFailed = error instanceof TrajectoryRefusal;");
    expect(code).toContain("an optional cross-owner plane could not be projected, so the project context is partial");
    // The optional branch is reached by ANY error that is not a TrajectoryRefusal, including one whose
    // origin is the canonical Work plane itself.
    expect(code).not.toContain("isCanonicalWorkFailure(error)");
  });
});
