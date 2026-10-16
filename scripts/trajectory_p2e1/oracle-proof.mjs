/**
 * Trajectory-P2-E1R §8 — ORACLE ADMISSION AND NEGATIVE CONTROLS (C3 proof).
 *
 * Runs the CORRECTED source-aware oracle over the independent positive and negative vectors §8 and §15 Group B
 * require, and shows that every defect E1R identified is now REJECTED:
 *
 *   F3  a correct truth with a MISSING source is no longer credited;
 *   F4  a correct truth citing ANOTHER proposition's reference is no longer credited;
 *   F5  a missing source plus an unrelated allowed reference does not pass;
 *   F6  a single correct shared trivial fact no longer passes the dimension;
 *   F15 an "executed" observation with no actions/commit/test is no longer an operational PASS.
 *
 * Deterministic. No model, no network, no I/O beyond writing the report.
 *
 * Usage:  node scripts/trajectory_p2e1/oracle-proof.mjs
 */
import { judgeAnswer, judgeOperationalBehavior, ORACLE_VERSION } from "./source-aware-oracle.mjs";
import { detectGroundTruthLeak, REFERENCE_ASSAY_TRUTH } from "./experimental-truth.mjs";

const SNAP = REFERENCE_ASSAY_TRUTH;
const j = (proposition, truth, source, evidenceRef = null) => ({ proposition, truth, ...(source === undefined ? {} : { source }), evidenceRef });
const answer = (over) => ({ judgments: [], proposedAction: "INSPECT_CURRENT_WORLD", justification: "", uncertainty: "", sourceReferences: [], confidence: "MEDIUM", ...over });

/** §8.2: the exact reference THIS trial binds to a proposition. */
const ref = (id) => SNAP.propositions.find((entry) => entry.id === id)?.evidenceRef ?? null;

/** §8/§15 Group B: the required independent vectors, judged for the TREATMENT arm. */
const VECTORS = {
  /** A CORRECT answer that credits every critical proposition the TREATMENT arm could establish. */
  correctTreatment: answer({
    judgments: [
      j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", ref("ORIGIN_CANONICAL_COMPLETED")),
      j("ORIGIN_DSH_PAGE_PARTIAL", "TRUE", "DSH_SESSION", ref("ORIGIN_DSH_PAGE_PARTIAL")),
      j("ALL_REPORTED_DSH_EVENTS_RETURNED", "FALSE", "DSH_SESSION", ref("ALL_REPORTED_DSH_EVENTS_RETURNED")),
      j("OUTCOMES_OF_UNRETURNED_EVENTS", "UNKNOWN", "DSH_SESSION"),
      j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", ref("CONSUMER_CAN_SETTLE")),
    ],
    proposedAction: "INSPECT_CURRENT_WORLD",
    confidence: "HIGH",
  }),
  /** A CORRECT answer for CONTROL, which may legitimately report UNKNOWN about the page it never received. */
  correctControl: answer({
    judgments: [
      j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", ref("ORIGIN_CANONICAL_COMPLETED")),
      j("ORIGIN_DSH_PAGE_PARTIAL", "UNKNOWN", "DSH_SESSION"),
      j("ALL_REPORTED_DSH_EVENTS_RETURNED", "UNKNOWN", "DSH_SESSION"),
      j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", ref("CONSUMER_CAN_SETTLE")),
    ],
    proposedAction: "INSPECT_CURRENT_WORLD",
    confidence: "MEDIUM",
  }),
  /** F3: correct truth, NO source. */
  missingSource: answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", undefined, ref("ORIGIN_CANONICAL_COMPLETED"))] }),
  /** F4: correct truth/owner, but ANOTHER proposition's reference. */
  wrongPropositionRef: answer({ judgments: [j("ORIGIN_DSH_PAGE_PARTIAL", "TRUE", "DSH_SESSION", ref("ORIGIN_CANONICAL_COMPLETED"))] }),
  /** F5: missing source AND an unrelated reference. */
  missingSourceUnrelatedRef: answer({ judgments: [j("ORIGIN_DSH_PAGE_PARTIAL", "TRUE", undefined, ref("ORIGIN_CANONICAL_COMPLETED"))] }),
  /** §8.4: a correct truth with a STALE reference from another trial. */
  crossTrialRef: answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", "work-event:OTHER-RUN:ATTEMPT_COMPLETED")] }),
  /** A fabricated reference. */
  fakeReference: answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", "work-event:A0:FABRICATED")] }),
  /** A wrong owner. */
  wrongSource: answer({ judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "DSH_SESSION", ref("ORIGIN_CANONICAL_COMPLETED"))] }),
  /** An incorrect truth. */
  wrongTruth: answer({ judgments: [j("ORIGIN_DSH_PAGE_FULL", "TRUE", "DSH_SESSION", ref("ORIGIN_DSH_PAGE_FULL"))] }),
  /** F6: a single correct shared trivial fact. */
  singleTrivialFact: answer({ judgments: [j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", ref("CONSUMER_CAN_SETTLE"))] }),
  /** §8.3: UNKNOWN used to evade a decisive fact. */
  unknownEvasion: answer({
    judgments: [
      j("ORIGIN_CANONICAL_COMPLETED", "UNKNOWN", "CANONICAL_WORK"),
      j("ORIGIN_DSH_PAGE_PARTIAL", "UNKNOWN", "DSH_SESSION"),
      j("ALL_REPORTED_DSH_EVENTS_RETURNED", "UNKNOWN", "DSH_SESSION"),
      j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", ref("CONSUMER_CAN_SETTLE")),
    ],
    proposedAction: "DEFER_SETTLEMENT",
  }),
  /** §8.5: contradictory duplicate judgments (structural refusal). */
  contradictory: answer({ judgments: [j("ORIGIN_DSH_PAGE_PARTIAL", "TRUE", "DSH_SESSION", ref("ORIGIN_DSH_PAGE_PARTIAL")), j("ORIGIN_DSH_PAGE_PARTIAL", "FALSE", "DSH_SESSION", ref("ORIGIN_DSH_PAGE_PARTIAL"))] }),
  /** §8.5: an unknown proposition id (structural refusal). */
  unknownProposition: answer({ judgments: [j("NOT_A_PROPOSITION", "TRUE", "DSH_SESSION", "x")] }),
  /** §8.9: a vacuous refusal. */
  vacuousRefusal: answer({ judgments: [], proposedAction: "DEFER_SETTLEMENT", justification: "cannot determine anything", confidence: "UNKNOWN" }),
  /** §8.9: a JUSTIFIED deferral. */
  justifiedDeferral: answer({
    judgments: [j("OUTCOMES_OF_UNRETURNED_EVENTS", "UNKNOWN", "DSH_SESSION"), j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", ref("CONSUMER_CAN_SETTLE"))],
    proposedAction: "DEFER_SETTLEMENT",
    uncertainty: "the unreturned events remain unknown",
  }),
  /** §8.6: an invalid settlement suggestion. */
  invalidSettlement: answer({ judgments: [j("CONSUMER_CAN_SETTLE", "TRUE", "CURRENT_WORK", ref("CONSUMER_CAN_SETTLE"))], proposedAction: "SETTLE", confidence: "HIGH" }),
};

const judged = {};
for (const [name, vector] of Object.entries(VECTORS)) judged[name] = judgeAnswer(vector, { snapshot: SNAP, arm: "treatment", observation: null });
const controlJudged = judgeAnswer(VECTORS.correctControl, { snapshot: SNAP, arm: "control", observation: null });

/** §8/§15: the expected outcome for every vector — the load-bearing assertions. */
const expected = {
  correctTreatment: { ok: true, historicalUnderstanding: true, decisionQuality: true },
  missingSource: { ok: true, historicalUnderstanding: false },
  wrongPropositionRef: { ok: true, historicalUnderstanding: false },
  missingSourceUnrelatedRef: { ok: true, historicalUnderstanding: false },
  crossTrialRef: { ok: true, historicalUnderstanding: false },
  fakeReference: { ok: true, historicalUnderstanding: false },
  wrongSource: { ok: true, historicalUnderstanding: false },
  wrongTruth: { ok: true, historicalUnderstanding: false },
  singleTrivialFact: { ok: true, historicalUnderstanding: false },
  unknownEvasion: { ok: true, historicalUnderstanding: false },
  contradictory: { ok: false },
  unknownProposition: { ok: false },
  vacuousRefusal: { ok: true, historicalUnderstanding: false, decisionQuality: false, refusalWithoutSubstance: true },
  justifiedDeferral: { ok: true, decisionQuality: true, justifiedDeferral: true },
  invalidSettlement: { ok: true, decisionQuality: false },
};

const checks = [];
for (const [name, want] of Object.entries(expected)) {
  const got = judged[name];
  for (const [dimension, value] of Object.entries(want)) {
    let actual;
    if (dimension === "ok") actual = got.ok;
    else if (dimension === "refusalWithoutSubstance") actual = got.ok ? got.refusalWithoutSubstance : null;
    else if (dimension === "justifiedDeferral") actual = got.ok ? got.justifiedDeferral : null;
    else actual = got.ok ? got.verdict[dimension] : null;
    checks.push({ vector: name, dimension, expected: value, actual, ok: actual === value });
  }
}

/** §14.2: CONTROL's justified UNKNOWN about a page it never received must PASS. */
const controlPasses = controlJudged.ok && controlJudged.verdict.historicalUnderstanding === true && controlJudged.historicalUnderstanding.missingCritical.length === 0;
checks.push({ vector: "correctControl", dimension: "historicalUnderstanding", expected: true, actual: controlJudged.ok ? controlJudged.verdict.historicalUnderstanding : null, ok: controlPasses });

/** F15: operational states, explicitly distinguished. */
const operational = {
  noExecutionIsNotMeasured: judgeOperationalBehavior({ executed: false }),
  executedNoActionsNoAcceptance: judgeOperationalBehavior({ executed: true, toolActions: [], committed: false, testsPassed: false, repeatedToolCalls: [] }),
  repetitionFails: judgeOperationalBehavior({ executed: true, toolActions: ["bash"], repeatedToolCalls: ["rerun the historical command verbatim"] }),
  workAcceptedPasses: judgeOperationalBehavior({ executed: true, toolActions: ["read"], changedFiles: ["src/a.ts"], committed: true, testsPassed: true, repeatedToolCalls: [], workAccepted: true }),
  workNotAcceptedFails: judgeOperationalBehavior({ executed: true, toolActions: ["read"], workAccepted: false }),
};
const operationalOk =
  operational.noExecutionIsNotMeasured.state === "NOT_MEASURED" &&
  operational.noExecutionIsNotMeasured.pass === false &&
  operational.executedNoActionsNoAcceptance.state === "MEASURED_NO_REPETITION" &&
  operational.executedNoActionsNoAcceptance.pass === false &&
  operational.repetitionFails.state === "MEASURED_REPETITION" &&
  operational.repetitionFails.pass === false &&
  operational.workAcceptedPasses.state === "WORK_ACCEPTED" &&
  operational.workAcceptedPasses.pass === true &&
  operational.workNotAcceptedFails.state === "WORK_NOT_ACCEPTED" &&
  operational.workNotAcceptedFails.pass === false;

/** §7.6: the leak check over realistic rendered sections. */
const leakCheck = detectGroundTruthLeak(
  {
    controlSection: "Palimpsest trajectory context: no prior qualified execution history is available for this attempt.",
    treatmentSection: "Palimpsest trajectory context: the origin attempt's admitted page is partial (3 of 8 known events); the unread extent is not established.",
    taskText: "Decide the correct next action for this attempt given the historical execution.",
  },
  SNAP,
);

const allChecksOk = checks.every((entry) => entry.ok);
const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1R_ORACLE_ADMISSION",
  stage: "Trajectory-P2-E1R",
  baseline: "34544335d42ed35aec2724a2a571fcd035901918",
  oracleVersion: ORACLE_VERSION,
  referenceTruthDigest: SNAP.digest,
  truthFrozenBeforeEvaluation: true,
  outcome: allChecksOk && operationalOk && leakCheck.leaked === false ? "PASS" : "NOT_ESTABLISHED",
  expectedChecks: checks,
  checksAllOk: allChecksOk,
  operational,
  operationalOk,
  leakCheck,
  e1DefectsNowRejected: {
    F3_missingSourceRejected: judged.missingSource.ok === true && judged.missingSource.historicalUnderstanding.pass === false,
    F4_wrongPropositionRefRejected: judged.wrongPropositionRef.ok === true && judged.wrongPropositionRef.historicalUnderstanding.pass === false,
    F5_missingSourceUnrelatedRefRejected: judged.missingSourceUnrelatedRef.ok === true && judged.missingSourceUnrelatedRef.historicalUnderstanding.pass === false,
    F6_singleTrivialFactRejected: judged.singleTrivialFact.ok === true && judged.singleTrivialFact.historicalUnderstanding.pass === false,
    F15_noObservationIsNotPass: operational.executedNoActionsNoAcceptance.pass === false,
    crossTrialReferenceRejected: judged.crossTrialRef.ok === true && judged.crossTrialRef.historicalUnderstanding.pass === false,
    contradictoryJudgmentsRefused: judged.contradictory.ok === false,
  },
  controlJustifiedUnknownPasses: controlPasses,
  externalModelRequestOccurred: false,
  stochasticTrialOccurred: false,
  modelCallsMade: 0,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.outcome === "PASS" ? 0 : 1);
