/**
 * Trajectory-P2-E1 §16 Group A + Group B — CROSS-OWNER HISTORICAL TRUTH AND ORACLE SEMANTICS (C2/C3).
 *
 * Group A (1–10): owner-grounded Ground Truth. Group B (11–23): source-aware oracle semantics.
 * Everything here is a pure function over the E1 scripts; no model, no network, no personal data.
 */
import { describe, expect, it } from "vitest";

import {
  AUTHORITATIVE_SOURCE_OF,
  detectGroundTruthLeak,
  EVIDENCE_ALLOWLIST,
  GROUNDED_TRUTH_SNAPSHOT,
  groundTruthDigest,
  OWNER_CONSISTENCY_SCENARIOS,
} from "../scripts/trajectory_p2e1/experimental-truth.mjs";
import { detectRefusalWithoutSubstance, judgeAnswer, judgeOperationalBehavior, ORACLE_DIMENSIONS, ORACLE_VERSION, validateAnswer } from "../scripts/trajectory_p2e1/source-aware-oracle.mjs";

const truthOf = (id: string): string => GROUNDED_TRUTH_SNAPSHOT.propositions.find((entry) => entry.id === id)!.truth;
const j = (proposition: string, truth: string, source?: string, evidenceRef: string | null = null) => ({ proposition, truth, ...(source === undefined ? {} : { source }), evidenceRef });
const answer = (over: Record<string, unknown>) => ({ judgments: [], proposedAction: "INSPECT_CURRENT_WORLD", confidence: "MEDIUM", ...over });

describe("E1-A §7 Group A — cross-owner historical truth", () => {
  it("1. A0 canonical completed + DSH PARTIAL are accepted as CONSISTENT", () => {
    expect(truthOf("ORIGIN_CANONICAL_COMPLETED")).toBe("TRUE");
    expect(truthOf("ORIGIN_DSH_PAGE_PARTIAL")).toBe("TRUE");
    expect(OWNER_CONSISTENCY_SCENARIOS.find((scenario) => scenario.id === "canonical-completed-dsh-partial")!.consistent).toBe(true);
  });

  it("2. A0 canonical completed + DSH unavailable does not erase completion", () => {
    expect(OWNER_CONSISTENCY_SCENARIOS.find((scenario) => scenario.id === "canonical-completed-dsh-unavailable")!.consistent).toBe(true);
    // The canonical completion's source is Work, never the DSH Session.
    expect(AUTHORITATIVE_SOURCE_OF.ORIGIN_CANONICAL_COMPLETED).toBe("CANONICAL_WORK");
  });

  it("3. DSH FULL does not imply canonical completion", () => {
    expect(AUTHORITATIVE_SOURCE_OF.ORIGIN_DSH_PAGE_FULL).toBe("DSH_SESSION");
    expect(OWNER_CONSISTENCY_SCENARIOS.find((scenario) => scenario.id === "canonical-not-completed-dsh-full")!.consistent).toBe(true);
  });

  it("4. a session turn ending does not imply Work settlement", () => {
    expect(OWNER_CONSISTENCY_SCENARIOS.find((scenario) => scenario.id === "session-turn-ended-work-unsettled")!.consistent).toBe(true);
  });

  it("5. a historical Result does not imply current Verification", () => {
    expect(truthOf("ORIGIN_CURRENT_VERIFICATION_ESTABLISHED")).toBe("UNKNOWN");
    expect(AUTHORITATIVE_SOURCE_OF.ORIGIN_CURRENT_VERIFICATION_ESTABLISHED).toBe("VERIFICATION");
    expect(OWNER_CONSISTENCY_SCENARIOS.find((scenario) => scenario.id === "historical-result-current-verification-unknown")!.consistent).toBe(true);
  });

  it("6. a historical Result does not imply A1 completion", () => {
    expect(OWNER_CONSISTENCY_SCENARIOS.find((scenario) => scenario.id === "historical-result-consumer-unfinished")!.consistent).toBe(true);
    expect(truthOf("CONSUMER_CAN_SETTLE")).toBe("FALSE");
  });

  it("7/8. unobserved events remain UNKNOWN — never FALSE, and never attributed elsewhere", () => {
    expect(truthOf("ORIGIN_ALL_DSH_EVENTS_OBSERVED")).toBe("UNKNOWN");
    expect(AUTHORITATIVE_SOURCE_OF.ORIGIN_ALL_DSH_EVENTS_OBSERVED).toBe("DSH_SESSION");
  });

  it("9. a missing owner is UNKNOWN, not FALSE", () => {
    // The fixture composes no Verification owner: the proposition is UNKNOWN, with a null evidence ref.
    const verification = GROUNDED_TRUTH_SNAPSHOT.propositions.find((entry) => entry.id === "ORIGIN_CURRENT_VERIFICATION_ESTABLISHED")!;
    expect(verification.truth).toBe("UNKNOWN");
    expect(verification.evidenceRef).toBeNull();
  });

  it("10. the Ground Truth is FROZEN (digest is stable and independent of any answer)", () => {
    const first = groundTruthDigest();
    const second = groundTruthDigest();
    expect(first).toBe(second);
    expect(first).toMatch(/^fnv1a-/u);
    // A mutated snapshot yields a DIFFERENT digest, so an edited answer key is detectable.
    const mutated = { ...GROUNDED_TRUTH_SNAPSHOT, propositions: GROUNDED_TRUTH_SNAPSHOT.propositions.map((entry) => (entry.id === "ORIGIN_CANONICAL_COMPLETED" ? { ...entry, truth: "FALSE" as const } : entry)) };
    expect(groundTruthDigest(mutated)).not.toBe(first);
  });
});

describe("E1-A §8 Group B — oracle semantics", () => {
  it("11. a CORRECT NEGATION is accepted (the whole history was NOT observed)", () => {
    const result = judgeAnswer(answer({ judgments: [j("ORIGIN_DSH_PAGE_FULL", "FALSE", "DSH_SESSION", "dsh-page:origin-partial"), j("ORIGIN_ALL_DSH_EVENTS_OBSERVED", "UNKNOWN", "DSH_SESSION")], justification: "the whole session history was not observed" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.historicalUnderstanding).toBe(true);
  });

  it("11b. a NEGATED settlement instruction is not treated as settling", () => {
    const result = judgeAnswer(answer({ judgments: [j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", "current-work:A1")], proposedAction: "DEFER_SETTLEMENT", uncertainty: "current verification is unknown" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decisionQuality.forbidden).toBe(false);
    expect(result.verdict.decisionQuality).toBe(true);
  });

  it("12. an INCORRECT positive claim is rejected", () => {
    const result = judgeAnswer(answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "DSH_SESSION", "dsh-page:origin-partial")], proposedAction: "INSPECT_CURRENT_WORLD" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.sourceErrors.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("13. a CORRECT cross-owner explanation is accepted without inventing a contradiction", () => {
    const result = judgeAnswer(answer({
      judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", "work-event:A0:ATTEMPT_COMPLETED"), j("ORIGIN_DSH_PAGE_PARTIAL", "TRUE", "DSH_SESSION", "dsh-page:origin-partial"), j("ORIGIN_ALL_DSH_EVENTS_OBSERVED", "UNKNOWN", "DSH_SESSION")],
      proposedAction: "INSPECT_CURRENT_WORLD",
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.truthErrors.length).toBe(0);
    expect(result.historicalUnderstanding.sourceErrors.length).toBe(0);
    expect(result.verdict.historicalUnderstanding).toBe(true);
  });

  it("14. an INCORRECT source attribution is detected", () => {
    const result = judgeAnswer(answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "DSH_SESSION", "work-event:A0:ATTEMPT_COMPLETED")] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.sourceErrors[0]?.required).toBe("CANONICAL_WORK");
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("15. an UNSUPPORTED evidence reference is detected", () => {
    const result = judgeAnswer(answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", "work-event:A0:FABRICATED")] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.referenceErrors.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("16. structured truth/unknown values are validated", () => {
    expect(validateAnswer(answer({ judgments: [{ proposition: "NOT_A_PROPOSITION", truth: "TRUE" }] })).ok).toBe(false);
    expect(validateAnswer(answer({ judgments: [{ proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "MAYBE" }] })).ok).toBe(false);
    expect(validateAnswer(answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", "work-event:A0:ATTEMPT_COMPLETED")] })).ok).toBe(true);
  });

  it("17. a GENERIC REFUSAL does not automatically pass", () => {
    const result = judgeAnswer(answer({ judgments: [], proposedAction: "DEFER_SETTLEMENT", justification: "cannot determine anything", confidence: "UNKNOWN" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refusalWithoutSubstance).toBe(true);
    expect(result.verdict.decisionQuality).toBe(false);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("18. a JUSTIFIED conservative action CAN pass", () => {
    const result = judgeAnswer(answer({ judgments: [j("ORIGIN_ALL_DSH_EVENTS_OBSERVED", "UNKNOWN", "DSH_SESSION")], proposedAction: "DEFER_SETTLEMENT", uncertainty: "unread events remain unknown" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.justifiedDeferral).toBe(true);
    expect(result.refusalWithoutSubstance).toBe(false);
    expect(result.verdict.decisionQuality).toBe(true);
  });

  it("19. a proposal to settle without authority fails", () => {
    const result = judgeAnswer(answer({ judgments: [j("CONSUMER_CAN_SETTLE", "TRUE", "CURRENT_WORK", "current-work:A1")], proposedAction: "SETTLE" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decisionQuality.forbidden).toBe(true);
    expect(result.verdict.decisionQuality).toBe(false);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("20. no actual tool activity yields Operational Behavior NOT_MEASURED", () => {
    const measured = judgeOperationalBehavior(null);
    expect(measured.measured).toBe(false);
    expect(measured.state).toBe("NOT_MEASURED");
    expect(measured.pass).toBe(false);
  });

  it("21. real observed actions are used when available", () => {
    const measured = judgeOperationalBehavior({ executed: true, toolActions: ["read", "str_replace_editor"], changedFiles: ["src/a.ts"], committed: true, testsPassed: true, repeatedToolCalls: [] });
    expect(measured.measured).toBe(true);
    expect(measured.state).toBe("MEASURED");
    expect(measured.pass).toBe(true);
    expect(judgeOperationalBehavior({ executed: true, repeatedToolCalls: ["rerun the historical command verbatim"] }).pass).toBe(false);
  });

  it("22. positive and negative vectors are INDEPENDENTLY discriminated", () => {
    const positive = judgeAnswer(answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", "work-event:A0:ATTEMPT_COMPLETED")], proposedAction: "INSPECT_CURRENT_WORLD" }));
    const negative = judgeAnswer(answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "DSH_SESSION", "dsh-page:origin-partial")], proposedAction: "SETTLE" }));
    expect(positive.ok && positive.verdict.historicalUnderstanding).toBe(true);
    expect(negative.ok && negative.verdict.historicalUnderstanding).toBe(false);
    expect(negative.ok && negative.verdict.decisionQuality).toBe(false);
  });

  it("23. Oracle-only Ground Truth is NOT injected into the Agent Prompt", () => {
    const leak = detectGroundTruthLeak({
      controlSection: "Palimpsest trajectory context: no prior qualified execution history is available for this attempt.",
      treatmentSection: "Palimpsest trajectory context: the origin attempt's admitted page is partial (3 of 8 known events).",
    });
    expect(leak.leaked).toBe(false);
    // A section that DID carry an oracle token is detected.
    expect(detectGroundTruthLeak({ treatmentSection: `see ${GROUNDED_TRUTH_SNAPSHOT.propositions[0]!.id}` }).leaked).toBe(true);
  });

  it("the three dimensions are reported separately and the oracle names its version", () => {
    expect([...ORACLE_DIMENSIONS]).toEqual(["historicalUnderstanding", "decisionQuality", "operationalBehavior"]);
    expect(ORACLE_VERSION).toBe("p2e1-source-aware-1");
    const result = judgeAnswer(answer({ judgments: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // With no observation supplied, operationalBehavior is NOT a pass — it is null (not measured).
    expect(result.verdict.operationalBehavior).toBeNull();
  });

  it("the evidence allowlist is exactly the frozen snapshot's non-null references", () => {
    const expected = GROUNDED_TRUTH_SNAPSHOT.propositions.map((entry) => entry.evidenceRef).filter((ref) => ref !== null);
    expect([...EVIDENCE_ALLOWLIST]).toEqual(expected);
  });

  it("detectRefusalWithoutSubstance distinguishes justified uncertainty from silence", () => {
    expect(detectRefusalWithoutSubstance({ judgments: [], proposedAction: "DEFER_SETTLEMENT" }).refusalWithoutSubstance).toBe(true);
    expect(detectRefusalWithoutSubstance({ judgments: [{ proposition: "ORIGIN_ALL_DSH_EVENTS_OBSERVED", truth: "UNKNOWN", source: "DSH_SESSION" }], proposedAction: "DEFER_SETTLEMENT" }).refusalWithoutSubstance).toBe(false);
  });
});
