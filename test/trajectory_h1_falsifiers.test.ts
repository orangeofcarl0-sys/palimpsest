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
  type HandoffPreviewInput,
} from "../src/trajectory/handoff_preview.js";
import { validateSessionEventPage } from "../src/trajectory/page_integrity.js";
import type { DshSessionEventPage } from "../src/trajectory/execution.js";

const PROJECT = "h1a";
const ATTEMPT = `attempt-${"a".repeat(32)}`;
const SESSION = "session-fixture";

const SOURCE_FILES = {
  /**
   * P2-C §7.6: the reader IMPLEMENTATION moved into the shipped host package so the product composition
   * and research share one reader; `scripts/trajectory_v0/dsh-session-reader.mjs` is now a thin re-export.
   * This falsifier reads the implementation directly.
   */
  reader: "host/deployment/runtime/session_reader.js",
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
    host: { hostLocalJobId: null, portInvocationId: null, processLifecycle: "NOT_OBSERVED", processDetail: "x", observedEventKinds: [], lifecycleCoverage: "NONE" as const, originLimitation: "x" },
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

    /**
     * ------------------------------------------------------------------ CHANGED ASSERTION (H1 C2)
     *
     * The baseline assertion PINNED THE DEFECT by requiring the source to still contain
     * `const boundaryConsistent = stored === null ? false : stored.count <= all.length;`.
     *
     * The corrected contract asserts the OPPOSITE: that rule is gone, and the reader derives the
     * boundary from the ONE array its read produced.
     */
    const code = source(SOURCE_FILES.reader);
    expect(code).not.toContain("const boundaryConsistent = stored === null ? false : stored.count <= all.length;");
    expect(code).not.toContain("boundaryConsistent");
    expect(code).toContain("const all = [...stored, ...closers];");
    expect(code).toContain("const durabilityOf = (index) => (index < storedCount ? 'PERSISTED_DSH_EVENT' : 'SYNTHETIC_RECOVERY_EVENT');");
  });
});

/* ================================================================== F2 */

describe("H1 F2 — false FULL coverage from inconsistent counts", () => {
  it("F2 (baseline): known=50, returned=50, events=[] still yields FULL and COMPLETE", () => {
    /**
     * DYNAMICALLY_REPRODUCED. The ruling's exact construction: a page whose count metadata claims 50
     * events while the returned array is EMPTY.
     *
     * ------------------------------------------------------------------ CHANGED ASSERTION (H1 C3)
     *
     * The baseline assertion called the H0 helper `eventPageCoverageOf({admitted:true, knownEventCount:50,
     * returnedCount:50})` and required it to return "FULL" — it PINNED THE DEFECT. H1 C3 removed that
     * helper entirely, so the baseline predicate is reproduced here as an explicit fixture.
     */
    const baselineCoverageOf = (known: number | null, returned: number): string =>
      known === null ? "UNKNOWN" : returned >= known ? "FULL" : "PARTIAL";
    expect(baselineCoverageOf(50, 50)).toBe("FULL");

    // The corrected product refuses the same page: the empty array contradicts the claimed count.
    const preview = buildHandoffPreview(attributedInput(page({ knownEventCount: 50, returnedCount: 50, events: Object.freeze([]) })));
    expect(preview.attribution.pageIntegrity).toBe("INVALID");
    expect(preview.attribution.pageIntegrityReason).toBe("RETURNED_COUNT_MISMATCH");
    expect(preview.attribution.eventPageCoverage).toBe("NOT_APPLICABLE");
    expect(preview.completeness).not.toBe("COMPLETE");
    // And the contradiction is now VISIBLE rather than silent.
    expect(preview.caveats.contradictoryObservations.join(" ")).toContain("INVALID");
  });
});

/* ================================================================== F3 */

describe("H1 F3 — a nonzero cursor is not distinguished from full-history coverage", () => {
  it("F3 (baseline): a page beginning mid-history still reports FULL coverage", () => {
    /**
     * DYNAMICALLY_REPRODUCED. H0 had no notion of "the page must begin at the start of the relevant
     * Session-local range to claim full coverage".
     *
     * ------------------------------------------------------------------ CHANGED ASSERTION (H1 C3)
     *
     * The baseline assertion called the removed helper and required "FULL". The corrected contract
     * refuses the self-contradictory form and reports the consistent form as PARTIAL.
     */
    const baselineCoverageOf = (known: number | null, returned: number): string =>
      known === null ? "UNKNOWN" : returned >= known ? "FULL" : "PARTIAL";
    expect(baselineCoverageOf(100, 100)).toBe("FULL");

    // (a) a page claiming as many events as the source reports while starting at seq 50 contradicts
    //     the source's own total, so it is INVALID rather than FULL.
    const appearsComplete = page({ requestedFromSeq: 50, knownEventCount: 100, returnedCount: 100, throughSeq: 149 });
    const contradictory = buildHandoffPreview(attributedInput(appearsComplete));
    expect(contradictory.attribution.pageIntegrity).toBe("INVALID");
    expect(contradictory.attribution.eventPageCoverage).not.toBe("FULL");

    // (b) an honestly mid-history page is PARTIAL, and the detail says it does not begin at the start.
    const realEvents = Object.freeze(
      Array.from({ length: 100 }, (_, index) =>
        Object.freeze({
          sessionId: SESSION, seq: 50 + index, type: "step/start", inherited: false,
          durability: "PERSISTED_DSH_EVENT" as const, time: index, surface: null,
          summary: `step ${String(50 + index)}`, durationMs: null, observedStatus: null,
        }),
      ),
    );
    const midHistory = page({
      requestedFromSeq: 50, knownEventCount: 150, returnedCount: 100, throughSeq: 149,
      requestedMaxEvents: 200, persistedEventCount: 150, events: realEvents as never,
    });
    const preview = buildHandoffPreview(attributedInput(midHistory));
    expect(preview.attribution.eventPageCoverage).toBe("PARTIAL");
    expect(preview.attribution.pageIntegrity).toBe("VALID_PARTIAL");
  });
});

/* ================================================================== F4 */

describe("H1 F4 — malformed page metadata is accepted", () => {
  it("F4 (baseline): watermark, count, sequence and identity inconsistencies all still yield FULL", () => {
    /**
     * DYNAMICALLY_REPRODUCED at the baseline: the H0 helper read ONLY `knownEventCount` and
     * `returnedCount`, so none of these malformations was detected.
     *
     * ------------------------------------------------------------------ CHANGED ASSERTION (H1 C3)
     *
     * The baseline assertions called the removed helper. The corrected contract is now the assertion:
     * every one of these pages is refused with its own bounded reason.
     */
    const malformed: ReadonlyArray<readonly [string, DshSessionEventPage]> = [
      ["incorrect throughSeq (claims a watermark the events cannot reach)", page({ knownEventCount: 50, returnedCount: 50, throughSeq: 9 })],
      ["returnedCount exceeds the requested maximum", page({ requestedMaxEvents: 10, returnedCount: 50, knownEventCount: 50 })],
      ["page SessionId differs from the header SessionId", page({ sessionId: "session-other", knownEventCount: 50, returnedCount: 50 })],
      ["negative metadata", page({ knownEventCount: -1, returnedCount: 50 })],
    ];
    for (const [label, candidate] of malformed) {
      const verdict = validateSessionEventPage({ page: candidate, admitted: true, expectedSessionId: SESSION });
      expect(verdict.state, label).toBe("INVALID");
      expect(verdict.reason, label).not.toBeNull();
      expect(verdict.coverage, label).toBe("NOT_APPLICABLE");
    }

    /**
     * The baseline source no longer contains the two-number rule at all, which is the durable form of
     * the correction: there is no remaining entry point that can produce FULL from counts alone.
     */
    const previewCode = source(SOURCE_FILES.preview);
    expect(previewCode).not.toContain('return input.returnedCount >= input.knownEventCount ? "FULL" : "PARTIAL";');
    expect(previewCode).not.toContain("export function eventPageCoverageOf(");
    expect(previewCode).toContain("validateSessionEventPage");
  });
});

/* ================================================================== F5 */

describe("H1 F5 — boolean binding authority", () => {
  it("F5 (baseline): a bare boolean elevates the caller's claimed SessionId to BOUND_VERIFIED", () => {
    /**
     * DYNAMICALLY_REPRODUCED at the baseline. The H0 classifier accepted `canonicalBindingPresent` — a
     * boolean NOT tied to any specific SessionId — so `true` plus ANY claimed id yielded
     * BOUND_VERIFIED for that claimed id, and the composition then set `dshSessionId` to it.
     *
     * ------------------------------------------------------------------ CHANGED ASSERTION (H1 C4)
     *
     * The baseline assertion CALLED the classifier with `canonicalBindingPresent: true` and required
     * BOUND_VERIFIED — it pinned the defect. The parameter no longer exists, so the baseline predicate
     * is reproduced as an explicit fixture and the corrected contract is asserted against the product.
     */
    const baselineElevates = (claimedSessionId: string): string => (claimedSessionId.length > 0 ? "BOUND_VERIFIED" : "SESSION_UNBOUND");
    expect(baselineElevates("session-X")).toBe("BOUND_VERIFIED");

    // The corrected classifier cannot reach a verified state, whatever the claim.
    const corrected = classifySessionBinding({ claimedSessionId: "session-X", candidateCount: 1, sourceReadable: true, conflictDetail: null });
    expect(corrected.state).toBe("SESSION_CLAIMED_UNVERIFIED");
    expect(corrected.state).not.toBe("BOUND_VERIFIED");

    /**
     * And the composition no longer derives the established id from a classification at all: it comes
     * from the verified association resolution, which does not accept the claim.
     */
    const composition = source(SOURCE_FILES.composition);
    expect(composition).not.toContain('dshSessionId: classification.state === "BOUND_VERIFIED" ? claimedSessionId : null');
    expect(composition).not.toContain("canonicalBindingPresent");
    expect(composition).toContain("dshSessionId: verifiedSessionId");
    expect(composition).toContain("resolveVerifiedSessionBinding");
  });
});

/* ================================================================== F6 */

describe("H1 F6 — host provenance implies process coverage", () => {
  it("F6 (baseline): LOCAL_PORT_OBSERVATION yielded COMPLETE coverage regardless of what was observed", () => {
    /**
     * DYNAMICALLY_REPRODUCED at the baseline. `attributionOf` mapped provenance directly to coverage:
     *     LOCAL_PORT_OBSERVATION -> processObservation = "COMPLETE"
     * with no reference to which lifecycle phases the producer actually saw.
     *
     * ------------------------------------------------------------------ CHANGED ASSERTION (H1 C5)
     *
     * The baseline assertion required COMPLETE for a spawn-only observation. H1 §9.3 makes coverage a
     * SEPARATE dimension from provenance: COMPLETE now additionally requires that BOTH a spawn and an
     * exit were observed, so a spawn-only observation reports PARTIAL.
     */
    const produced = classifyHostObservation({ recordPresent: true, attemptMatches: true, hasLocalIdentity: true, originEstablished: true, conflictDetail: null });
    expect(produced.provenance).toBe("LOCAL_PORT_OBSERVATION");

    const input = attributedInput(page({ knownEventCount: 50, returnedCount: 50 }));
    const spawnOnly = buildHandoffPreview({
      ...input,
      binding: { ...input.binding, hostObservationProvenance: "LOCAL_PORT_OBSERVATION" },
      host: { ...input.host, processLifecycle: "RUNNING", observedEventKinds: ["DIRECT_CHILD_SPAWN_OBSERVED"], lifecycleCoverage: "SPAWN_ONLY" },
    });
    expect(spawnOnly.attribution.processObservation).toBe("PARTIAL");

    // A producer observation covering BOTH phases IS complete — the rule is not "never complete".
    const spawnAndExit = buildHandoffPreview({
      ...input,
      binding: { ...input.binding, hostObservationProvenance: "LOCAL_PORT_OBSERVATION" },
      host: { ...input.host, processLifecycle: "EXITED", observedEventKinds: ["DIRECT_CHILD_SPAWN_OBSERVED", "DIRECT_CHILD_EXIT_OBSERVED"], lifecycleCoverage: "SPAWN_AND_EXIT" },
    });
    expect(spawnAndExit.attribution.processObservation).toBe("COMPLETE");

    /**
     * This remains a CONTROLLED FUTURE-PATH contract: no producer establishes origin on the ordinary
     * Preview path today (the composition supplies `originEstablished: false`).
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
  it("F8 (baseline): quarantine entries were deduplicated by relation NAME, collapsing distinct edges", () => {
    /**
     * SOURCE_DEMONSTRATED at the baseline. The dedup key was the RELATION NAME, so two genuinely
     * distinct rejected edges of the same relation collapsed to ONE reported entry and the second
     * reason was lost. The quarantine SCOPE also used the broad `canonicalEventIds` set, which includes
     * the attempt's AUTHORIZATION event — the one identity two attempts can share — so a rejected
     * relation touching the shared node could be reported as BOTH attempts' quarantined fact.
     *
     * ------------------------------------------------------------------ CHANGED ASSERTION (H1 C5)
     *
     * The baseline assertions required the defective forms. H1 §9.2 replaces both: entries carry a
     * stable `edgeId` and are deduplicated by it, and the scope requires the edge to touch one of the
     * attempt's OWN identities rather than merely the shared authorization.
     */
    const code = source(SOURCE_FILES.relation);
    expect(code).not.toContain("new Map(quarantined.map((entry) => [entry.relation, entry])).values()");
    expect(code).toContain("new Map(quarantined.map((entry) => [entry.edgeId, entry])).values()");
    expect(code).toContain("readonly edgeId: string;");
    // The scope now requires an OWN identity, not merely membership in the broad set.
    expect(code).toContain("ownsAnEndpoint(edge)");
    expect(code).toContain("if (context.creationEventId !== null) ownIdentities.add(context.creationEventId);");
    // The broad set is still built (it is T0-scoped evidence), but it is no longer the scope test.
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
  it("F10 (baseline): a non-TrajectoryRefusal failure of CANONICAL WORK access was reported as optional", () => {
    /**
     * SOURCE_DEMONSTRATED at the baseline. H0 distinguished `error instanceof TrajectoryRefusal` (a
     * canonical Work source failure) from everything else, and described "everything else" as an
     * OPTIONAL cross-owner plane that could not be projected. The residual defect: T0 reads the
     * canonical Work plane through the SAME input object without wrapping its failures, so a raw
     * failure from that read is NOT a `TrajectoryRefusal` and was reported as an optional owner's
     * absence — downgrading a possible canonical-source failure.
     *
     * ------------------------------------------------------------------ CHANGED ASSERTION (H1 C5)
     *
     * The baseline assertions required the guessing branch. H1 §9.5 removes the guess: an
     * unattributable failure is reported as `UNKNOWN_SOURCE_STAGE`, structurally, and is explicitly NOT
     * attributed to an optional owner.
     */
    const code = source(SOURCE_FILES.composition);
    expect(code).toContain("const workValidationFailed = error instanceof TrajectoryRefusal;");
    expect(code).not.toContain("an optional cross-owner plane could not be projected");
    expect(code).toContain('failureOrigin: workValidationFailed ? ("CANONICAL_WORK_VALIDATION" as const) : ("UNKNOWN_SOURCE_STAGE" as const)');
    expect(code).toContain("NOT attributed to an optional owner");
    // The structured kind travels with the structured origin.
    expect(code).toContain("failureKind: workValidationFailed ? error.kind : null");
  });
});
