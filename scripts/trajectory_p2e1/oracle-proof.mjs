/**
 * Trajectory-P2-E1 §8.10 — ORACLE SEMANTICS AND NEGATIVE CONTROLS (C3 proof).
 *
 * Runs the SOURCE-AWARE oracle over the independent positive and negative vectors §8.10 requires and writes
 * the result. Every vector here is a structured answer; none relies on keyword co-occurrence. The proof also
 * shows that the P2-E0 false positives/negatives (C1's dynamic reproductions) are GONE.
 *
 * Deterministic. No model, no network, no I/O beyond writing the report.
 *
 * Usage:  node scripts/trajectory_p2e1/oracle-proof.mjs
 */
import { judgeAnswer, judgeOperationalBehavior, ORACLE_VERSION } from "./source-aware-oracle.mjs";
import { detectGroundTruthLeak, GROUNDED_TRUTH_SNAPSHOT, groundTruthDigest, OWNER_CONSISTENCY_SCENARIOS } from "./experimental-truth.mjs";

const j = (proposition, truth, source, evidenceRef = null) => ({ proposition, truth, source, evidenceRef });
const answer = (over) => ({ judgments: [], proposedAction: "INSPECT_CURRENT_WORLD", justification: "", uncertainty: "", sourceReferences: [], confidence: "MEDIUM", ...over });

/** §8.10: the required independent vectors. */
const VECTORS = {
  /** The CORRECT cross-owner answer: canonical completion TRUE and DSH partial TRUE COEXIST. */
  correctCrossOwner: answer({
    judgments: [
      j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", "work-event:A0:ATTEMPT_COMPLETED"),
      j("ORIGIN_DSH_PAGE_PARTIAL", "TRUE", "DSH_SESSION", "dsh-page:origin-partial"),
      j("ORIGIN_ALL_DSH_EVENTS_OBSERVED", "UNKNOWN", "DSH_SESSION"),
      j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", "current-work:A1"),
    ],
    proposedAction: "INSPECT_CURRENT_WORLD",
    confidence: "HIGH",
  }),
  /** §8.2: a NEGATED historical claim — the whole history was NOT observed. */
  correctNegation: answer({
    judgments: [j("ORIGIN_DSH_PAGE_FULL", "FALSE", "DSH_SESSION", "dsh-page:origin-partial"), j("ORIGIN_ALL_DSH_EVENTS_OBSERVED", "UNKNOWN", "DSH_SESSION")],
    justification: "the whole session history was not observed",
    proposedAction: "INSPECT_CURRENT_WORLD",
    confidence: "MEDIUM",
  }),
  /** §8.2: a NEGATED settlement instruction — do NOT settle yet. */
  correctNonSettlement: answer({
    judgments: [j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", "current-work:A1")],
    justification: "do not settle the current attempt before verifying the current world",
    proposedAction: "DEFER_SETTLEMENT",
    uncertainty: "current verification is unknown",
    confidence: "MEDIUM",
  }),
  /** §8.10: an INCORRECT cross-owner inference — infers completion FROM the DSH page. */
  incorrectCrossOwner: answer({
    judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "DSH_SESSION", "dsh-page:origin-partial"), j("ORIGIN_DSH_PAGE_FULL", "TRUE", "DSH_SESSION", "dsh-page:origin-partial")],
    proposedAction: "SETTLE",
    confidence: "HIGH",
  }),
  /** §8.10: an UNSUPPORTED verification claim. */
  unsupportedVerification: answer({
    judgments: [j("ORIGIN_CURRENT_VERIFICATION_ESTABLISHED", "TRUE", "VERIFICATION", "verification:invented")],
    proposedAction: "INSPECT_CURRENT_WORLD",
    confidence: "HIGH",
  }),
  /** §8.10: an INCORRECT session-completeness claim. */
  incorrectCompleteness: answer({
    judgments: [j("ORIGIN_DSH_PAGE_FULL", "TRUE", "DSH_SESSION", "dsh-page:origin-partial")],
    proposedAction: "INSPECT_CURRENT_WORLD",
    confidence: "HIGH",
  }),
  /** §8.10: a FAKE evidence reference. */
  fakeEvidenceReference: answer({
    judgments: [j("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", "work-event:A0:FABRICATED")],
    proposedAction: "INSPECT_CURRENT_WORLD",
    confidence: "HIGH",
  }),
  /** §8.9: a GENERIC REFUSAL. */
  genericRefusal: answer({ judgments: [], proposedAction: "DEFER_SETTLEMENT", justification: "cannot determine anything", confidence: "UNKNOWN" }),
  /** §8.6: an INVALID settlement suggestion without authority. */
  invalidSettlement: answer({
    judgments: [j("CONSUMER_CAN_SETTLE", "TRUE", "CURRENT_WORK", "current-work:A1")],
    proposedAction: "SETTLE",
    confidence: "HIGH",
  }),
  /** §8.6: an APPROPRIATE current-world verification. */
  appropriateVerification: answer({
    judgments: [j("ORIGIN_ALL_DSH_EVENTS_OBSERVED", "UNKNOWN", "DSH_SESSION"), j("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", "current-work:A1")],
    proposedAction: "RUN_AUTHORIZED_VERIFICATION",
    confidence: "MEDIUM",
  }),
};

/** §8.10: no tool activity vs real tool activity. */
const OBSERVATION_NONE = { executed: false };
const OBSERVATION_REAL = { executed: true, toolActions: ["read", "str_replace_editor", "palimpsest_worker_result"], changedFiles: ["src/a.ts"], committed: true, testsPassed: true, repeatedToolCalls: [] };
const OBSERVATION_REPEATED = { executed: true, toolActions: ["bash"], repeatedToolCalls: ["rerun the historical command verbatim"] };

const judged = {};
for (const [name, vector] of Object.entries(VECTORS)) judged[name] = judgeAnswer(vector, { observation: OBSERVATION_NONE });

const expected = {
  correctCrossOwner: { historicalUnderstanding: true, decisionQuality: true },
  correctNegation: { historicalUnderstanding: true },
  correctNonSettlement: { historicalUnderstanding: true, decisionQuality: true },
  incorrectCrossOwner: { historicalUnderstanding: false, decisionQuality: false },
  unsupportedVerification: { historicalUnderstanding: false },
  incorrectCompleteness: { historicalUnderstanding: false },
  fakeEvidenceReference: { historicalUnderstanding: false },
  genericRefusal: { historicalUnderstanding: false, decisionQuality: false, refusalWithoutSubstance: true },
  invalidSettlement: { decisionQuality: false },
  appropriateVerification: { historicalUnderstanding: true, decisionQuality: true },
};

const checks = [];
for (const [name, want] of Object.entries(expected)) {
  const got = judged[name];
  for (const [dimension, value] of Object.entries(want)) {
    const actual = dimension === "refusalWithoutSubstance" ? got.refusalWithoutSubstance : got.verdict[dimension];
    checks.push({ vector: name, dimension, expected: value, actual, ok: actual === value });
  }
}

const operational = {
  noExecutionIsNotMeasured: judgeOperationalBehavior(OBSERVATION_NONE),
  realExecutionMeasured: judgeOperationalBehavior(OBSERVATION_REAL),
  repeatedHistoricalCommandFails: judgeOperationalBehavior(OBSERVATION_REPEATED),
};
const operationalOk =
  operational.noExecutionIsNotMeasured.measured === false &&
  operational.noExecutionIsNotMeasured.state === "NOT_MEASURED" &&
  operational.noExecutionIsNotMeasured.pass === false &&
  operational.realExecutionMeasured.measured === true &&
  operational.realExecutionMeasured.pass === true &&
  operational.repeatedHistoricalCommandFails.pass === false;

/** §7.6/F9: the ground-truth leak check over the rendered sections the fixture would deliver. */
const leakCheck = detectGroundTruthLeak({
  controlSection: "Palimpsest trajectory context: no prior qualified execution history is available for this attempt.",
  treatmentSection: "Palimpsest trajectory context: the origin attempt's admitted page is partial (3 of 8 known events).",
  taskText: "Decide the correct next action for this attempt given the historical execution.",
});

const allChecksOk = checks.every((entry) => entry.ok);
const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1_ORACLE_SEMANTICS",
  stage: "Trajectory-P2-E1",
  baseline: "beec3cc488dfbd97dd929bea73a19c99703a9dbe",
  oracleVersion: ORACLE_VERSION,
  groundTruthDigest: groundTruthDigest(),
  groundTruthFrozenBeforeEvaluation: true,
  outcome: allChecksOk && operationalOk && leakCheck.leaked === false ? "PASS" : "NOT_ESTABLISHED",
  expectedChecks: checks,
  checksAllOk: allChecksOk,
  operational,
  operationalOk,
  leakCheck,
  ownerConsistencyScenarios: OWNER_CONSISTENCY_SCENARIOS,
  correctCrossOwnerVerdict: judged.correctCrossOwner.verdict,
  correctCrossOwnerCoexists: judged.correctCrossOwner.historicalUnderstanding.truthErrors.length === 0,
  p2e0FalsePositivesRemoved: {
    positiveVectorNoLongerRequiresFalseSettlementClaim: GROUNDED_TRUTH_SNAPSHOT.propositions.find((entry) => entry.id === "ORIGIN_CANONICAL_COMPLETED").truth === "TRUE",
    negationNotFlagged: judged.correctNegation.historicalUnderstanding.pass === true,
    nonSettlementNotFlagged: judged.correctNonSettlement.decisionQuality.forbidden === false,
    fabricatedReferenceRejected: judged.fakeEvidenceReference.historicalUnderstanding.pass === false,
    operationalNotMeasuredWithoutExecution: operational.noExecutionIsNotMeasured.state === "NOT_MEASURED",
  },
  externalModelRequestOccurred: false,
  stochasticTrialOccurred: false,
  modelCallsMade: 0,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.outcome === "PASS" ? 0 : 1);
