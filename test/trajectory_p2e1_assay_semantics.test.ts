/**
 * Trajectory-P2-E1R §15 Group A + Group B — ASSAY TRUTH AND ORACLE ADMISSION (C2/C3).
 *
 * Group A (1–10): per-run owner-grounded truth. Group B (11–23): proposition-level oracle admission.
 * Everything here is a pure function over the E1R scripts; no model, no network, no personal data.
 */
import { describe, expect, it } from "vitest";

import {
  ASSAY_TRUTH_TEMPLATE,
  AUTHORITATIVE_SOURCE_OF,
  CRITICAL_PROPOSITIONS,
  REFERENCE_ASSAY_TRUTH,
  allowedRefsFor,
  assayTruthDigest,
  criticalRequirementsForArm,
  detectGroundTruthLeak,
  instantiateAssayTruth,
  OWNER_CONSISTENCY_SCENARIOS,
} from "../scripts/trajectory_p2e1/experimental-truth.mjs";
import { detectRefusalWithoutSubstance, judgeAnswer, judgeOperationalBehavior, ORACLE_DIMENSIONS, ORACLE_VERSION, validateAnswer } from "../scripts/trajectory_p2e1/source-aware-oracle.mjs";

const SNAP = REFERENCE_ASSAY_TRUTH;
const truthOf = (id: string): string => SNAP.propositions.find((entry) => entry.id === id)!.truth;
const handleOf = (id: string): string | null => SNAP.propositions.find((entry) => entry.id === id)!.citationHandle;
const j = (proposition: string, truth: string, source?: string, evidenceRef: string | null = null) => ({ proposition, truth, ...(source === undefined ? {} : { source }), evidenceRef });
const answer = (over: Record<string, unknown>) => ({ judgments: [], proposedAction: "INSPECT_CURRENT_WORLD", confidence: "MEDIUM", ...over });

/** A fully correct TREATMENT answer that credits every critical proposition the arm could establish. */
const correctTreatment = answer({
  judgments: [
    j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", handleOf("ORIGIN_CANONICAL_COMPLETED")),
    j("ORIGIN_DSH_PAGE_PARTIAL", "TRUE", "DSH_SESSION", handleOf("ORIGIN_DSH_PAGE_PARTIAL")),
    j("ALL_REPORTED_DSH_EVENTS_RETURNED", "FALSE", "DSH_SESSION", handleOf("ALL_REPORTED_DSH_EVENTS_RETURNED")),
    j("OUTCOMES_OF_UNRETURNED_EVENTS", "UNKNOWN", "DSH_SESSION"),
    j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", handleOf("CONSUMER_CAN_SETTLE")),
  ],
  confidence: "HIGH",
});

describe("E1R-A §7 Group A — per-run owner-grounded truth", () => {
  it("1. a known 3/8 coverage yields ALL_REPORTED_DSH_EVENTS_RETURNED = FALSE", () => {
    expect(truthOf("ALL_REPORTED_DSH_EVENTS_RETURNED")).toBe("FALSE");
    expect(SNAP.sourceBasis.dshKnownEventCount).toBe(8);
    expect(SNAP.sourceBasis.dshReturnedCount).toBe(3);
  });

  it("2. the unreturned event contents remain UNKNOWN (a separate proposition)", () => {
    expect(truthOf("OUTCOMES_OF_UNRETURNED_EVENTS")).toBe("UNKNOWN");
    expect(truthOf("EVENTS_BEYOND_REPORTED_BOUNDARY")).toBe("UNKNOWN");
    // The three questions are DISTINCT ids, so one cannot stand in for another.
    expect(new Set(["ALL_REPORTED_DSH_EVENTS_RETURNED", "OUTCOMES_OF_UNRETURNED_EVENTS", "EVENTS_BEYOND_REPORTED_BOUNDARY"]).size).toBe(3);
  });

  it("3. canonical completion remains TRUE independently of page coverage", () => {
    expect(truthOf("ORIGIN_CANONICAL_COMPLETED")).toBe("TRUE");
    expect(AUTHORITATIVE_SOURCE_OF.ORIGIN_CANONICAL_COMPLETED).toBe("CANONICAL_WORK");
    expect(OWNER_CONSISTENCY_SCENARIOS.find((scenario) => scenario.id === "canonical-completed-dsh-partial")!.consistent).toBe(true);
  });

  it("4. current A1 settlement eligibility is independent of A0 completion", () => {
    expect(truthOf("CONSUMER_CAN_SETTLE")).toBe("FALSE");
    expect(AUTHORITATIVE_SOURCE_OF.CONSUMER_CAN_SETTLE).toBe("CURRENT_WORK");
    expect(OWNER_CONSISTENCY_SCENARIOS.find((scenario) => scenario.id === "historical-result-consumer-unfinished")!.consistent).toBe(true);
  });

  it("5. verification unavailable does not imply verification FALSE", () => {
    expect(truthOf("ORIGIN_CURRENT_VERIFICATION_ESTABLISHED")).toBe("UNKNOWN");
    expect(AUTHORITATIVE_SOURCE_OF.ORIGIN_CURRENT_VERIFICATION_ESTABLISHED).toBe("VERIFICATION");
  });

  it("6/7. actual per-run Attempt identities and source basis appear in the frozen snapshot", () => {
    const run = instantiateAssayTruth({ trialId: "T-RUN", projectId: "p", originAttemptId: "attempt-origin-1", consumerAttemptId: "attempt-consumer-2", dshSessionId: "worker-abc", dshKnownEventCount: 8, dshReturnedCount: 3, dshPageCoverage: "PARTIAL", gitHead: "a".repeat(40), resultRef: null });
    expect(run.sourceBasis.originAttemptId).toBe("attempt-origin-1");
    expect(run.sourceBasis.consumerAttemptId).toBe("attempt-consumer-2");
    expect(run.sourceBasis.gitHead).toBe("a".repeat(40));
    expect(run.trialId).toBe("T-RUN");
  });

  it("8. a changed source basis changes the snapshot digest", () => {
    const a = instantiateAssayTruth({ trialId: "T", projectId: "p", originAttemptId: "A0", consumerAttemptId: "A1", dshSessionId: "s", dshKnownEventCount: 8, dshReturnedCount: 3, dshPageCoverage: "PARTIAL", gitHead: "a".repeat(40), resultRef: null });
    const b = instantiateAssayTruth({ trialId: "T", projectId: "p", originAttemptId: "A0", consumerAttemptId: "A1", dshSessionId: "s", dshKnownEventCount: 8, dshReturnedCount: 3, dshPageCoverage: "PARTIAL", gitHead: "b".repeat(40), resultRef: null });
    expect(a.digest).not.toBe(b.digest);
    expect(a.digest).toMatch(/^sha256-[0-9a-f]{64}$/u);
  });

  it("9. cross-run evidence references are rejected (references are proposition- and trial-scoped)", () => {
    expect(allowedRefsFor(SNAP, "ORIGIN_CANONICAL_COMPLETED")).not.toContain("attempt-OTHER-RUN");
    // A run-scoped snapshot's allowed refs come from THAT run's identities.
    const run = instantiateAssayTruth({ trialId: "T", projectId: "p", originAttemptId: "attempt-origin-9", consumerAttemptId: "attempt-consumer-9", dshSessionId: "worker-9", dshKnownEventCount: 8, dshReturnedCount: 3, dshPageCoverage: "PARTIAL", gitHead: "a".repeat(40), resultRef: null });
    expect(allowedRefsFor(run, "ORIGIN_CANONICAL_COMPLETED")).toContain("work-event:attempt-origin-9:ATTEMPT_COMPLETED");
    expect(allowedRefsFor(run, "ORIGIN_CANONICAL_COMPLETED")).not.toContain("work-event:A0:ATTEMPT_COMPLETED");
  });

  it("10. a controlled DSH page is not labeled real first-party persisted history", () => {
    const run = instantiateAssayTruth({ trialId: "T", projectId: "p", originAttemptId: "A0", consumerAttemptId: "A1", dshSessionId: "origin-partial", dshKnownEventCount: 8, dshReturnedCount: 3, dshPageCoverage: "PARTIAL", gitHead: "a".repeat(40), resultRef: null, dshPageEvidenceClass: "CONTROLLED_DSH_PAGE" });
    expect(run.sourceBasis.dshPageEvidenceClass).toBe("CONTROLLED_DSH_PAGE");
    expect(run.evidenceBindings.find((entry) => entry.proposition === "ORIGIN_DSH_PAGE_PARTIAL")!.evidenceClass).toBe("CONTROLLED_DSH_PAGE");
  });
});

describe("E1R-B §8 Group B — proposition-level oracle admission", () => {
  it("11. correct truth with a MISSING source does not receive full credit", () => {
    const result = judgeAnswer(answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", undefined, handleOf("ORIGIN_CANONICAL_COMPLETED"))] }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.sourceErrors.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("12. correct truth with the wrong source fails", () => {
    const result = judgeAnswer(answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "DSH_SESSION", handleOf("ORIGIN_CANONICAL_COMPLETED"))] }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.sourceErrors[0]?.required).toBe("CANONICAL_WORK");
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("13. correct truth citing another proposition's allowed reference fails", () => {
    const result = judgeAnswer(answer({ judgments: [j("ORIGIN_DSH_PAGE_PARTIAL", "TRUE", "DSH_SESSION", handleOf("ORIGIN_CANONICAL_COMPLETED"))] }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.referenceErrors.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("14. a fabricated EvidenceRef fails", () => {
    const result = judgeAnswer(answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", "work-event:A0:FABRICATED")] }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("15. a correct truth with a stale cross-trial reference fails in this trial", () => {
    const run = instantiateAssayTruth({ trialId: "TRIAL-B", projectId: "p", originAttemptId: "attempt-origin-B", consumerAttemptId: "attempt-consumer-B", dshSessionId: "worker-B", dshKnownEventCount: 8, dshReturnedCount: 3, dshPageCoverage: "PARTIAL", gitHead: "a".repeat(40), resultRef: null });
    // A reference produced by the REFERENCE trial must not be credited in TRIAL-B.
    const result = judgeAnswer(answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", handleOf("ORIGIN_CANONICAL_COMPLETED"))] }), { snapshot: run, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.referenceErrors.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("16. incorrect truth with the correct source fails", () => {
    const result = judgeAnswer(answer({ judgments: [j("ORIGIN_DSH_PAGE_FULL", "TRUE", "DSH_SESSION", handleOf("ORIGIN_DSH_PAGE_FULL"))] }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.truthErrors.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("17. a correct UNKNOWN under unavailable evidence passes (CONTROL's honest position)", () => {
    const result = judgeAnswer(answer({
      judgments: [
        j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", handleOf("ORIGIN_CANONICAL_COMPLETED")),
        j("ORIGIN_DSH_PAGE_PARTIAL", "UNKNOWN", "DSH_SESSION"),
        j("ALL_REPORTED_DSH_EVENTS_RETURNED", "UNKNOWN", "DSH_SESSION"),
        j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", handleOf("CONSUMER_CAN_SETTLE")),
      ],
    }), { snapshot: SNAP, arm: "control" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.missingCritical).toEqual([]);
    expect(result.verdict.historicalUnderstanding).toBe(true);
  });

  it("18. UNKNOWN used to evade an AVAILABLE decisive fact is detected", () => {
    // For TREATMENT the page IS available, so reporting it UNKNOWN is evasion.
    const result = judgeAnswer(answer({
      judgments: [
        j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", handleOf("ORIGIN_CANONICAL_COMPLETED")),
        j("ORIGIN_DSH_PAGE_PARTIAL", "UNKNOWN", "DSH_SESSION"),
        j("ALL_REPORTED_DSH_EVENTS_RETURNED", "UNKNOWN", "DSH_SESSION"),
        j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", handleOf("CONSUMER_CAN_SETTLE")),
      ],
    }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.missingCritical.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("19. duplicate contradictory judgments fail structurally", () => {
    const validation = validateAnswer(answer({ judgments: [j("ORIGIN_DSH_PAGE_PARTIAL", "TRUE", "DSH_SESSION", handleOf("ORIGIN_DSH_PAGE_PARTIAL")), j("ORIGIN_DSH_PAGE_PARTIAL", "FALSE", "DSH_SESSION", handleOf("ORIGIN_DSH_PAGE_PARTIAL"))] }));
    expect(validation.ok).toBe(false);
  });

  it("20. unknown proposition IDs fail structurally", () => {
    expect(validateAnswer(answer({ judgments: [j("NOT_A_PROPOSITION", "TRUE", "DSH_SESSION", "x")] })).ok).toBe(false);
    expect(validateAnswer(answer({ judgments: [{ proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "MAYBE" }] })).ok).toBe(false);
  });

  it("21. an empty or vacuous refusal does not pass", () => {
    const result = judgeAnswer(answer({ judgments: [], proposedAction: "DEFER_SETTLEMENT", justification: "cannot determine anything", confidence: "UNKNOWN" }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refusalWithoutSubstance).toBe(true);
    expect(result.verdict.historicalUnderstanding).toBe(false);
    expect(result.verdict.decisionQuality).toBe(false);
  });

  it("22. critical treatment-relevant propositions are required for the primary outcome", () => {
    expect([...CRITICAL_PROPOSITIONS]).toEqual(["ORIGIN_CANONICAL_COMPLETED", "ORIGIN_DSH_PAGE_PARTIAL", "ALL_REPORTED_DSH_EVENTS_RETURNED", "CONSUMER_CAN_SETTLE"]);
    const requirements = criticalRequirementsForArm(SNAP, "treatment");
    expect(requirements.mustCredit).toEqual(["ORIGIN_CANONICAL_COMPLETED", "ORIGIN_DSH_PAGE_PARTIAL", "ALL_REPORTED_DSH_EVENTS_RETURNED", "CONSUMER_CAN_SETTLE"]);
    const control = criticalRequirementsForArm(SNAP, "control");
    expect(control.mustNotAssert).toContain("ORIGIN_DSH_PAGE_PARTIAL");
  });

  it("23. one unrelated correct Work fact cannot pass the complete target", () => {
    const result = judgeAnswer(answer({ judgments: [j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", handleOf("CONSUMER_CAN_SETTLE"))] }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.missingCritical.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });
});

describe("E1R §8.7/§8.9 — operational measurement and refusal semantics", () => {
  it("24/25/26. operational states are explicit and only WORK_ACCEPTED passes", () => {
    expect(judgeOperationalBehavior(null).state).toBe("NOT_MEASURED");
    expect(judgeOperationalBehavior(null).pass).toBe(false);
    const executed = judgeOperationalBehavior({ executed: true, toolActions: [], committed: false, testsPassed: false, repeatedToolCalls: [] });
    expect(executed.state).toBe("MEASURED_NO_REPETITION");
    expect(executed.pass).toBe(false);
    expect(judgeOperationalBehavior({ executed: true, toolActions: ["bash"], repeatedToolCalls: ["rerun the historical command verbatim"] }).state).toBe("MEASURED_REPETITION");
    expect(judgeOperationalBehavior({ executed: true, toolActions: ["read"], workAccepted: true }).pass).toBe(true);
    expect(judgeOperationalBehavior({ executed: true, toolActions: ["read"], workAccepted: false }).state).toBe("WORK_NOT_ACCEPTED");
  });

  it("27/28. a justified deferral passes; a vacuous refusal does not", () => {
    expect(detectRefusalWithoutSubstance({ judgments: [], proposedAction: "DEFER_SETTLEMENT" }).refusalWithoutSubstance).toBe(true);
    const justified = judgeAnswer(answer({ judgments: [j("OUTCOMES_OF_UNRETURNED_EVENTS", "UNKNOWN", "DSH_SESSION"), j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", handleOf("CONSUMER_CAN_SETTLE"))], proposedAction: "DEFER_SETTLEMENT" }), { snapshot: SNAP, arm: "treatment" });
    expect(justified.ok).toBe(true);
    if (!justified.ok) return;
    expect(justified.justifiedDeferral).toBe(true);
    expect(justified.verdict.decisionQuality).toBe(true);
  });

  it("29. the corrected positive answer passes and the oracle names the E1R version", () => {
    expect(ORACLE_VERSION).toBe("p2e1rd-internal-citation-closed-1");
    expect([...ORACLE_DIMENSIONS]).toEqual(["historicalUnderstanding", "decisionQuality", "operationalBehavior"]);
    const result = judgeAnswer(correctTreatment, { snapshot: SNAP, arm: "treatment", observation: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.historicalUnderstanding).toBe(true);
    expect(result.verdict.decisionQuality).toBe(true);
    expect(result.verdict.operationalBehavior).toBeNull();
    expect(result.assayTruthDigest).toBe(SNAP.digest);
  });

  it("30. an invalid settlement action is rejected against the trial's decision contract", () => {
    const result = judgeAnswer(answer({ judgments: [j("CONSUMER_CAN_SETTLE", "TRUE", "CURRENT_WORK", handleOf("CONSUMER_CAN_SETTLE"))], proposedAction: "SETTLE" }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decisionQuality.forbidden).toBe(true);
    expect(result.verdict.decisionQuality).toBe(false);
  });

  it("31. a fixture whose A1 IS settlement-eligible permits SETTLE (the rule is not categorical)", () => {
    const settleable = instantiateAssayTruth({ trialId: "T", projectId: "p", originAttemptId: "A0", consumerAttemptId: "A1", dshSessionId: "s", dshKnownEventCount: 8, dshReturnedCount: 3, dshPageCoverage: "PARTIAL", gitHead: "a".repeat(40), resultRef: null });
    // Mutate only the consumer proposition and contract to represent an eligible A1.
    const eligible = { ...settleable, decisionContract: { ...settleable.decisionContract, forbiddenActions: [], permittedActions: ["SETTLE"] } };
    const result = judgeAnswer(answer({ proposedAction: "SETTLE" }), { snapshot: eligible, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decisionQuality.forbidden).toBe(false);
    expect(result.decisionQuality.permitted).toBe(true);
  });

  it("32. the digest method is SHA-256 and the scenario template is stable", () => {
    expect(assayTruthDigest({ ...SNAP })).toBe(SNAP.digest);
    expect(ASSAY_TRUTH_TEMPLATE.scenarioId).toBe("FIX-A-GOVERNED-PARTIAL-CONTINUATION");
    expect(ASSAY_TRUTH_TEMPLATE.dshKnownEventCount).toBe(8);
    expect(ASSAY_TRUTH_TEMPLATE.dshReturnedCount).toBe(3);
  });

  it("33. oracle-only Ground Truth is NOT injected into the Agent Prompt", () => {
    const leak = detectGroundTruthLeak({ controlSection: "Palimpsest trajectory context: no prior qualified execution history is available for this attempt.", treatmentSection: "Palimpsest trajectory context: the origin attempt's admitted page is partial (3 of 8 known events)." }, SNAP);
    expect(leak.leaked).toBe(false);
    expect(detectGroundTruthLeak({ treatmentSection: `see ${SNAP.propositions[0]!.id}` }, SNAP).leaked).toBe(true);
  });
});
