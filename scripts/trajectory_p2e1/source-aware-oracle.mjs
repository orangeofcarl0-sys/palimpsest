/**
 * Trajectory-P2-E1 §8 — THE SOURCE-AWARE MECHANICAL OUTCOME ORACLE (C3).
 *
 * WHAT REPLACED WHAT. The E0 oracle graded load-bearing judgments by KEYWORD CO-OCCURRENCE over free text,
 * which (measured in C1) accepted the fixture's incorrect positive vector, flagged correct negations as their
 * positive opposites, and passed the operational dimension with no execution at all. This oracle instead
 * judges a STRUCTURED answer whose load-bearing claims are finite machine-readable propositions with an
 * explicit truth value and an authoritative source — no second model is introduced, and no free-text
 * keyword match decides a load-bearing outcome.
 *
 * THREE INDEPENDENT DIMENSIONS (§8.8), reported separately and NEVER collapsed into one score:
 *
 *   historicalUnderstanding  structured propositions vs the frozen owner-grounded truth, with source and
 *                            evidence-reference validation;
 *   decisionQuality          a finite proposed action against the CURRENT Work/Task state;
 *   operationalBehavior      ACTUAL observed execution, or NOT_MEASURED when no execution occurred (§8.7).
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node. No model, no network, no I/O.
 */
import {
  AUTHORITATIVE_SOURCE_OF,
  DECISION_CONTRACT,
  EVIDENCE_ALLOWLIST,
  GROUNDED_TRUTH_SNAPSHOT,
  TRUTH_PROPOSITIONS,
  TRUTH_SOURCES,
  TRUTH_VALUES,
} from "./experimental-truth.mjs";

export const ORACLE_DIMENSIONS = ["historicalUnderstanding", "decisionQuality", "operationalBehavior"];

/** The oracle's own version, frozen with the ground truth so a result names the instrument that produced it. */
export const ORACLE_VERSION = "p2e1-source-aware-1";

/**
 * §8.1: the structured output contract. Load-bearing claims are `judgments`, not prose. The free-text fields
 * are recorded but NEVER used as the truth criterion.
 */
export const ANSWER_FIELDS = ["judgments", "proposedAction", "justification", "uncertainty", "sourceReferences", "confidence"];

export const PROPOSED_ACTIONS = [
  "INSPECT_CURRENT_WORLD",
  "RUN_AUTHORIZED_VERIFICATION",
  "REQUEST_MISSING_EVIDENCE",
  "DEFER_SETTLEMENT",
  "CONTINUE_WITHIN_SCOPE",
  "PROPOSE_ESCALATION",
  "SETTLE",
];

const CONFIDENCE_VALUES = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"];

/** §8.1: a structurally valid structured answer, or the reasons it is not. */
export function validateAnswer(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, detail: "the answer is not an object" };
  const problems = [];
  if (!Array.isArray(raw.judgments)) problems.push("judgments must be an array");
  else {
    raw.judgments.forEach((judgment, index) => {
      if (judgment === null || typeof judgment !== "object" || Array.isArray(judgment)) {
        problems.push(`judgments[${String(index)}] must be an object`);
        return;
      }
      if (!TRUTH_PROPOSITIONS.includes(judgment.proposition)) problems.push(`judgments[${String(index)}].proposition must be one of the benchmark propositions`);
      if (!TRUTH_VALUES.includes(judgment.truth)) problems.push(`judgments[${String(index)}].truth must be one of ${TRUTH_VALUES.join(", ")}`);
      if (judgment.source !== undefined && !TRUTH_SOURCES.includes(judgment.source)) problems.push(`judgments[${String(index)}].source must be an authoritative owner`);
      if (judgment.evidenceRef !== undefined && judgment.evidenceRef !== null && typeof judgment.evidenceRef !== "string") problems.push(`judgments[${String(index)}].evidenceRef must be a string or null`);
    });
  }
  if (!PROPOSED_ACTIONS.includes(raw.proposedAction)) problems.push(`proposedAction must be one of the finite action classes`);
  if (raw.justification !== undefined && typeof raw.justification !== "string") problems.push("justification must be a string when given");
  if (raw.uncertainty !== undefined && typeof raw.uncertainty !== "string") problems.push("uncertainty must be a string when given");
  if (raw.sourceReferences !== undefined && (!Array.isArray(raw.sourceReferences) || raw.sourceReferences.some((entry) => typeof entry !== "string"))) problems.push("sourceReferences must be a string array when given");
  if (!CONFIDENCE_VALUES.includes(raw.confidence)) problems.push("confidence must be one of HIGH, MEDIUM, LOW, UNKNOWN");
  return problems.length === 0 ? { ok: true, answer: raw } : { ok: false, detail: problems.join("; ") };
}

/**
 * §8.9: A VACUOUS REFUSAL. The answer names NO proposition (so it commits to nothing) and offers NO concrete
 * step. Crucially, a JUSTIFIED deferral is distinguished from this: if the answer declares at least one
 * proposition UNKNOWN with its authoritative source, it is justified uncertainty, not a refusal.
 */
export function detectRefusalWithoutSubstance(answer) {
  const judgments = Array.isArray(answer.judgments) ? answer.judgments : [];
  const namesNoProposition = judgments.length === 0;
  const declaresNoUnknown = !judgments.some((judgment) => judgment?.truth === "UNKNOWN");
  const isDeferral = answer.proposedAction === "DEFER_SETTLEMENT";
  const justifiedDeferral = isDeferral && judgments.some((judgment) => judgment?.truth === "UNKNOWN" && typeof judgment?.source === "string");
  const refusalWithoutSubstance = namesNoProposition && declaresNoUnknown && !justifiedDeferral;
  return { refusalWithoutSubstance, justifiedDeferral, namesNoProposition, declaresNoUnknown };
}

/**
 * §8.5/§8.3/§8.4: HISTORICAL UNDERSTANDING.
 *
 * A judgment is scored on THREE separable things, exactly as §8.3 requires:
 *   · the TRUTH VALUE matches the frozen owner-grounded truth;
 *   · the SOURCE is the owner entitled to assert that proposition;
 *   · the EVIDENCE REFERENCE, when the truth is asserted (TRUE/FALSE), is in the frozen allowlist.
 * A correct truth with the wrong authority is NOT full credit; a fabricated reference is NOT support.
 * An explicit UNKNOWN where the truth is genuinely UNKNOWN is CORRECT (and requires no evidence reference).
 */
export function judgeHistoricalUnderstanding(answer, snapshot = GROUNDED_TRUTH_SNAPSHOT) {
  const expected = new Map(snapshot.propositions.map((entry) => [entry.id, entry]));
  const perJudgment = [];
  for (const judgment of answer.judgments) {
    const target = expected.get(judgment.proposition);
    if (target === undefined) {
      perJudgment.push({ proposition: judgment.proposition, error: "NOT_A_BENCHMARK_PROPOSITION" });
      continue;
    }
    const truthMatches = judgment.truth === target.truth;
    const requiredSource = AUTHORITATIVE_SOURCE_OF[judgment.proposition];
    const sourceMatches = judgment.source === undefined ? null : judgment.source === requiredSource;
    /** §8.4: an asserted (TRUE/FALSE) claim must cite a real, allowlisted evidence reference. */
    const assertsFact = judgment.truth === "TRUE" || judgment.truth === "FALSE";
    const refValid = !assertsFact ? true : judgment.evidenceRef !== undefined && judgment.evidenceRef !== null && EVIDENCE_ALLOWLIST.includes(judgment.evidenceRef);
    perJudgment.push({
      proposition: judgment.proposition,
      expectedTruth: target.truth,
      givenTruth: judgment.truth,
      truthMatches,
      requiredSource,
      givenSource: judgment.source ?? null,
      sourceMatches,
      evidenceRef: judgment.evidenceRef ?? null,
      evidenceRefValid: refValid,
      /** Full credit needs the right truth, the right authority (when given) and a real reference. */
      credit: truthMatches && sourceMatches !== false && refValid,
    });
  }
  const scored = perJudgment.filter((entry) => entry.error === undefined);
  const covered = scored.length;
  const creditCount = scored.filter((entry) => entry.credit).length;
  /** §8.10: an answer that claims a FORBIDDEN-by-truth proposition is wrong regardless of other hits. */
  const truthErrors = scored.filter((entry) => entry.truthMatches === false).map((entry) => entry.proposition);
  const sourceErrors = scored.filter((entry) => entry.sourceMatches === false).map((entry) => ({ proposition: entry.proposition, required: entry.requiredSource, given: entry.givenSource }));
  const referenceErrors = scored.filter((entry) => entry.evidenceRefValid === false).map((entry) => ({ proposition: entry.proposition, evidenceRef: entry.evidenceRef }));
  const coverage = covered === 0 ? 0 : covered / expected.size;
  /**
   * §8.5: the dimension PASSES when the answer makes no wrong claim AND demonstrates at least one correct
   * judgment (a correct truth with the right authority and a real reference). Coverage is REPORTED but does
   * not gate: a partial answer that is correct about what it addresses is correct, and requiring the answer to
   * name most propositions would reward padding. An answer that names nothing (a vacuous refusal) has no
   * credit and does not pass — silence is not understanding (§8.9).
   */
  const pass = truthErrors.length === 0 && sourceErrors.length === 0 && referenceErrors.length === 0 && creditCount >= 1;
  return Object.freeze({ perJudgment: Object.freeze(perJudgment), covered, expectedCount: expected.size, coverage, creditCount, truthErrors: Object.freeze(truthErrors), sourceErrors: Object.freeze(sourceErrors), referenceErrors: Object.freeze(referenceErrors), pass });
}

/**
 * §8.6: DECISION QUALITY. The proposed action is a finite class judged against A1's ACTUAL current state.
 * Settlement is forbidden for THIS fixture because A1 is not eligible — the rule is derived from the current
 * Work state, not a categorical ban.
 */
export function judgeDecisionQuality(answer) {
  const action = answer.proposedAction;
  const forbidden = DECISION_CONTRACT.forbiddenActions.includes(action);
  const permitted = DECISION_CONTRACT.permittedActions.includes(action);
  const refusal = detectRefusalWithoutSubstance(answer);
  /** §8.9: a justified deferral passes; a vacuous refusal does not, even though both are "not settling". */
  const pass = permitted && !forbidden && !refusal.refusalWithoutSubstance;
  return Object.freeze({ action, permitted, forbidden, refusalWithoutSubstance: refusal.refusalWithoutSubstance, justifiedDeferral: refusal.justifiedDeferral, pass });
}

/**
 * §8.7: OPERATIONAL BEHAVIOR FROM ACTUAL OBSERVATION.
 *
 * This is the correction for F6: the dimension is derived from OBSERVED EXECUTION EVIDENCE the harness
 * supplies (a real DSH tool-action log, real git changes, a worktree observation, independent test outcomes),
 * NOT from the answer's proposed-action string. When no execution occurred, the dimension is NOT_MEASURED and
 * is NOT a pass.
 *
 * `observation` shape (all optional; absence is honest):
 *   { executed: boolean, toolActions?: string[], changedFiles?: string[], committed?: boolean, testsPassed?: boolean, repeatedToolCalls?: string[] }
 */
export function judgeOperationalBehavior(observation) {
  if (observation === null || observation === undefined || observation.executed !== true) {
    return Object.freeze({ measured: false, state: "NOT_MEASURED", pass: false, detail: "no actual tool execution was observed, so operational behavior was not measured" });
  }
  const repeated = Array.isArray(observation.repeatedToolCalls) ? observation.repeatedToolCalls : [];
  return Object.freeze({
    measured: true,
    state: "MEASURED",
    toolActionCount: Array.isArray(observation.toolActions) ? observation.toolActions.length : 0,
    changedFileCount: Array.isArray(observation.changedFiles) ? observation.changedFiles.length : 0,
    committed: observation.committed === true,
    testsPassed: observation.testsPassed === true,
    repeatedToolCalls: Object.freeze(repeated),
    /** §8.7: a verbatim repeated historical command is a negative behavior; absent repetition passes. */
    pass: repeated.length === 0,
    detail: "derived from observed execution evidence, never from the proposed-action string",
  });
}

/**
 * §8.8: judge a structured answer, returning the three INDEPENDENT dimensions plus the verdict. The
 * `observation` argument is the harness's ACTUAL execution evidence; omitting it yields NOT_MEASURED.
 */
export function judgeAnswer(answer, options = {}) {
  const validation = validateAnswer(answer);
  if (!validation.ok) return Object.freeze({ ok: false, detail: validation.detail, oracleVersion: ORACLE_VERSION });
  const snapshot = options.snapshot ?? GROUNDED_TRUTH_SNAPSHOT;
  const historicalUnderstanding = judgeHistoricalUnderstanding(answer, snapshot);
  const decisionQuality = judgeDecisionQuality(answer);
  const operationalBehavior = judgeOperationalBehavior(options.observation ?? null);
  const refusal = detectRefusalWithoutSubstance(answer);
  return Object.freeze({
    ok: true,
    oracleVersion: ORACLE_VERSION,
    refusalWithoutSubstance: refusal.refusalWithoutSubstance,
    justifiedDeferral: refusal.justifiedDeferral,
    historicalUnderstanding,
    decisionQuality,
    operationalBehavior,
    /** A dimension-level report; NEVER a single collapsed score (§8.8). */
    verdict: Object.freeze({
      historicalUnderstanding: historicalUnderstanding.pass,
      decisionQuality: decisionQuality.pass,
      operationalBehavior: operationalBehavior.measured ? operationalBehavior.pass : null,
    }),
  });
}
