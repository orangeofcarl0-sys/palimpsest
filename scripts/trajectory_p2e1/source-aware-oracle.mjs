/**
 * Trajectory-P2-E1R §8 — THE SOURCE-AWARE MECHANICAL ORACLE (C3, corrected).
 *
 * WHAT E1R CORRECTS IN THE ORACLE (F3–F8, F15).
 *
 *   · F3 — A MISSING SOURCE WAS NOT A VERIFIED SOURCE. E1 credited a judgment when
 *     `sourceMatches !== false`, so an answer that named NO source earned full credit. E1R requires
 *     `sourceMatches === true`: the owner must be NAMED and CORRECT.
 *
 *   · F4/F5 — ONE GLOBAL REFERENCE LIST. E1 validated an asserted fact against a single module-global
 *     allowlist, so a correct proposition could cite ANOTHER proposition's reference. E1R validates against
 *     the proposition's OWN allowed references, derived from the trial snapshot (§8.2).
 *
 *   · F6 — `creditCount >= 1` PASSED THE DIMENSION. A single correct shared trivial fact (e.g. A1 may not
 *     settle) passed the whole historical-understanding dimension. E1R requires credit on the CRITICAL
 *     propositions that define the target failure mode, judged against the arm's ACTUAL available evidence.
 *
 *   · F8 — A GLOBAL DECISION CONTRACT. E1's decision judge ignored the supplied snapshot. E1R reads the
 *     contract from the trial snapshot, so a different trial's current Work authority is honoured.
 *
 *   · F15 — OPERATIONAL "PASS" WITH NO OBSERVATION. E1 reported PASS whenever no repeated command was seen,
 *     so an `executed:true` observation with no tool actions, no commit and no passing test passed. E1R
 *     reports explicit states and never equates "no repetition" with success.
 *
 * THE INVARIANT (§8). A credited assertion needs the RIGHT TRUTH, the RIGHT OWNER and a PROPOSITION-SPECIFIC
 * reference bound to THIS trial. UNKNOWN is correct where the fact is genuinely unestablished, and is
 * EXPECTED of an arm the evidence was never delivered to (§14.2).
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node. No model, no network, no I/O.
 */
import { AUTHORITATIVE_SOURCE_OF, CRITICAL_PROPOSITIONS, REFERENCE_ASSAY_TRUTH, TRUTH_PROPOSITIONS, TRUTH_SOURCES, TRUTH_VALUES, allowedRefsFor, criticalRequirementsForArm } from "./experimental-truth.mjs";

export const ORACLE_DIMENSIONS = ["historicalUnderstanding", "decisionQuality", "operationalBehavior"];

/** §8.10: the version is bumped because the scoring semantics changed — E1 results must not be relabelled. */
/**
 * §4.5 (E1RC): the version is bumped because the scoring semantics changed again — arm-wide availability now
 * gates EVERY proposition, not only the critical set. Historical E1/E1R scores must never be relabelled under
 * this version.
 *
 * §5.2 (E1RD): bumped again because the DIMENSION PASS RULE changed — an internal-only reference now fails the
 * dimension rather than merely withholding one credit. E1/E1R/E1RC results keep the version they were scored
 * under.
 */
export const ORACLE_VERSION = "p2e1rd-internal-citation-closed-1";

export const ANSWER_FIELDS = ["judgments", "proposedAction", "justification", "uncertainty", "sourceReferences", "confidence"];

export const PROPOSED_ACTIONS = ["INSPECT_CURRENT_WORLD", "RUN_AUTHORIZED_VERIFICATION", "REQUEST_MISSING_EVIDENCE", "DEFER_SETTLEMENT", "CONTINUE_WITHIN_SCOPE", "PROPOSE_ESCALATION", "SETTLE"];

const CONFIDENCE_VALUES = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"];

/** §8.5: the operational states, so "not measured" and "measured but unaccepted" are never conflated. */
export const OPERATIONAL_STATES = ["NOT_MEASURED", "MEASURED_NO_REPETITION", "MEASURED_REPETITION", "WORK_ACCEPTED", "WORK_NOT_ACCEPTED"];

/**
 * §8.5/§10.3: STRUCTURAL VALIDATION. Beyond shape, this refuses the load-bearing malformations: unknown
 * proposition ids, contradictory duplicates, and authority-bearing fields that do not belong in an answer.
 */
export function validateAnswer(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, detail: "the answer is not an object" };
  const problems = [];
  if (!Array.isArray(raw.judgments)) problems.push("judgments must be an array");
  else {
    const seen = new Map();
    raw.judgments.forEach((judgment, index) => {
      if (judgment === null || typeof judgment !== "object" || Array.isArray(judgment)) {
        problems.push(`judgments[${String(index)}] must be an object`);
        return;
      }
      if (!TRUTH_PROPOSITIONS.includes(judgment.proposition)) problems.push(`judgments[${String(index)}].proposition must be one of the benchmark propositions`);
      if (!TRUTH_VALUES.includes(judgment.truth)) problems.push(`judgments[${String(index)}].truth must be one of ${TRUTH_VALUES.join(", ")}`);
      if (judgment.source !== undefined && !TRUTH_SOURCES.includes(judgment.source)) problems.push(`judgments[${String(index)}].source must be an authoritative owner`);
      if (judgment.evidenceRef !== undefined && judgment.evidenceRef !== null && typeof judgment.evidenceRef !== "string") problems.push(`judgments[${String(index)}].evidenceRef must be a string or null`);
      /** §8.5: a CONTRADICTORY duplicate (same proposition, different truth) is not a valid answer. */
      if (typeof judgment.proposition === "string") {
        const prior = seen.get(judgment.proposition);
        if (prior !== undefined && prior !== judgment.truth) problems.push(`judgments[${String(index)}] contradicts an earlier judgment for ${judgment.proposition}`);
        seen.set(judgment.proposition, judgment.truth);
      }
    });
  }
  if (!PROPOSED_ACTIONS.includes(raw.proposedAction)) problems.push("proposedAction must be one of the finite action classes");
  if (raw.justification !== undefined && typeof raw.justification !== "string") problems.push("justification must be a string when given");
  if (raw.uncertainty !== undefined && typeof raw.uncertainty !== "string") problems.push("uncertainty must be a string when given");
  if (raw.sourceReferences !== undefined && (!Array.isArray(raw.sourceReferences) || raw.sourceReferences.some((entry) => typeof entry !== "string"))) problems.push("sourceReferences must be a string array when given");
  if (!CONFIDENCE_VALUES.includes(raw.confidence)) problems.push("confidence must be one of HIGH, MEDIUM, LOW, UNKNOWN");
  return problems.length === 0 ? { ok: true, answer: raw } : { ok: false, detail: problems.join("; ") };
}

/**
 * §8.9: A VACUOUS REFUSAL. The answer names NO proposition and offers NO justified unknown. A JUSTIFIED
 * deferral — one that declares a proposition UNKNOWN with its source — is NOT a refusal.
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
 * §8.1–§8.7: HISTORICAL UNDERSTANDING, scored per proposition against THIS trial's snapshot.
 *
 * Per judgment the oracle records FOUR separable facts (§8.7):
 *   truthMatches      the truth value equals the frozen owner-grounded truth;
 *   sourceMatches     the NAMED source is the proposition's authoritative owner (null when omitted);
 *   referenceValid    the reference belongs to THIS proposition AND to THIS trial;
 *   credit            all three hold.
 *
 * §14.2 ARM-AWARE UNCERTAINTY. A proposition the arm's delivered evidence could NOT establish
 * (`availability[arm] !== "AVAILABLE"`) may be honestly reported UNKNOWN without being a truth error — a
 * CONTROL agent is not penalised for refusing to invent a page it never received. It earns no credit either.
 * Asserting a DEFINITE value for such a proposition is unsupported certainty (§8.3) and is recorded as
 * `falselyAsserted`. For an AVAILABLE proposition, UNKNOWN about a determinable fact is evasion (§8.3).
 */
export function judgeHistoricalUnderstanding(answer, snapshot = REFERENCE_ASSAY_TRUTH, armName = "treatment") {
  const expected = new Map(snapshot.propositions.map((entry) => [entry.id, entry]));
  const perJudgment = [];
  for (const judgment of answer.judgments) {
    const target = expected.get(judgment.proposition);
    if (target === undefined) {
      perJudgment.push({ proposition: judgment.proposition, error: "NOT_A_BENCHMARK_PROPOSITION" });
      continue;
    }
    const requiredSource = AUTHORITATIVE_SOURCE_OF[judgment.proposition];
    const availableToArm = snapshot.availability[judgment.proposition]?.[armName] === "AVAILABLE";
    const objectiveDeterminable = target.truth === "TRUE" || target.truth === "FALSE";
    /** §14.2: honest UNKNOWN about a fact this arm's evidence could not establish is NOT a truth error. */
    const honestUnknown = judgment.truth === "UNKNOWN" && objectiveDeterminable && !availableToArm;
    const truthMatches = judgment.truth === target.truth || honestUnknown;
    /** §8.1: a MISSING source is NOT a verified source — the owner must be named and correct. */
    const sourceMatches = judgment.source === requiredSource;
    /** §8.2: the reference must belong to THIS proposition and THIS trial (never a global list). */
    const allowed = allowedRefsFor(snapshot, judgment.proposition);
    /** §4.2 (E1RC): the model-visible handles, which are the ONLY references the agent could have seen. */
    const modelVisibleHandles = [target.citationHandle].filter((ref) => ref !== null && ref !== undefined);
    const assertsFact = judgment.truth === "TRUE" || judgment.truth === "FALSE";
    const referenceValid = !assertsFact ? (judgment.evidenceRef === undefined || judgment.evidenceRef === null ? true : allowed.includes(judgment.evidenceRef)) : judgment.evidenceRef !== undefined && judgment.evidenceRef !== null && allowed.includes(judgment.evidenceRef);
    /**
     * §4.2: AN INTERNAL-ONLY REFERENCE IS UNAVAILABLE TO THE EVALUATED AGENT. The oracle's internal
     * EvidenceRef (`work-event:A0:...`) never appears in the delivered section, so an answer citing ONLY that
     * token cannot have been grounded in evidence the agent saw. It is recorded separately so a caller can
     * distinguish "wrong reference" from "a reference the agent could not have obtained".
     */
    const citesOnlyInternalRef = assertsFact && typeof judgment.evidenceRef === "string" && !modelVisibleHandles.includes(judgment.evidenceRef) && allowed.includes(judgment.evidenceRef);
    perJudgment.push({
      proposition: judgment.proposition,
      expectedTruth: target.truth,
      givenTruth: judgment.truth,
      truthMatches,
      honestUnknown,
      availableToArm,
      requiredSource,
      givenSource: judgment.source ?? null,
      sourceMatches,
      evidenceRef: judgment.evidenceRef ?? null,
      allowedRefs: allowed,
      modelVisibleHandles,
      referenceValid,
      citesOnlyInternalRef,
      /** A truth error is a genuine mismatch: an honest UNKNOWN is excluded. */
      truthError: truthMatches === false,
      /**
       * E1RC C1-F2 (§4.3): ARM-WIDE AVAILABILITY. A definite assertion about a fact this arm's delivered
       * evidence could NOT establish earns NO credit, even when it happens to be objectively true and cites a
       * formally valid handle. Correct guessing is not evidence-grounded reasoning. (Credit also requires the
       * exact truth, the right authority and a real proposition-specific reference.)
       */
      unsupportedCertainty: assertsFact && !availableToArm,
      credit: judgment.truth === target.truth && sourceMatches && referenceValid && !citesOnlyInternalRef && (assertsFact ? availableToArm : true),
    });
  }

  const scored = perJudgment.filter((entry) => entry.error === undefined);
  const truthErrors = scored.filter((entry) => entry.truthError).map((entry) => entry.proposition);
  const sourceErrors = scored.filter((entry) => entry.sourceMatches === false).map((entry) => ({ proposition: entry.proposition, required: entry.requiredSource, given: entry.givenSource }));
  const referenceErrors = scored.filter((entry) => entry.referenceValid === false).map((entry) => ({ proposition: entry.proposition, evidenceRef: entry.evidenceRef, allowed: entry.allowedRefs }));
  /**
   * E1RD S5.2: AN INTERNAL-ONLY REFERENCE IS A DEFECT IN THE DIMENSION, NOT JUST A LOST CREDIT.
   *
   * E1RC detected `citesOnlyInternalRef` and withheld credit for THAT judgment, but the dimension's PASS rule
   * never required the list to be empty. A fully correct answer that passed the Critical Set could therefore
   * append a noncritical, correct-truth judgment citing the oracle's internal EvidenceRef — a token that never
   * appeared in the delivered section — and still PASS. The defect is not "this judgment earned no credit": it
   * is that an assertion was offered as EVIDENCE-BEARING while citing a reference the evaluated agent could not
   * have obtained, and a pass must not be purchasable by surrounding it with correct critical facts.
   */
  const internalOnlyReferences = scored.filter((entry) => entry.citesOnlyInternalRef === true).map((entry) => ({ proposition: entry.proposition, evidenceRef: entry.evidenceRef, modelVisibleHandles: entry.modelVisibleHandles }));
  const credited = new Set(scored.filter((entry) => entry.credit).map((entry) => entry.proposition));
  const requirements = criticalRequirementsForArm(snapshot, armName);
  const missingCritical = requirements.mustCredit.filter((id) => !credited.has(id));
  /** §8.3: a critical proposition this arm could NOT establish must not be asserted as a definite claim. */
  const falselyAsserted = requirements.mustNotAssert.filter((id) => scored.some((entry) => entry.proposition === id && (entry.givenTruth === "TRUE" || entry.givenTruth === "FALSE")));
  /** E1RC §4.3: EVERY proposition, not just the critical set, must respect what the arm could establish. */
  const unsupportedCertainty = scored.filter((entry) => entry.unsupportedCertainty === true).map((entry) => ({ proposition: entry.proposition, givenTruth: entry.givenTruth, why: "the arm's delivered evidence could not establish this fact, so a definite assertion earns no credit" }));

  const covered = scored.length;
  const creditCount = credited.size;
  const coverage = covered === 0 ? 0 : covered / expected.size;

  /**
   * §8.6/§13.3/§4.3: THE PASS RULE. No wrong claim, no unsupported source, no bad reference, no internal-only
   * reference on ANY proposition, no unsupported certainty on ANY proposition, AND credit on every critical
   * proposition the arm's evidence could establish, AND no critical proposition the arm could NOT establish
   * asserted as a definite claim.
   */
  const pass = truthErrors.length === 0 && sourceErrors.length === 0 && referenceErrors.length === 0 && internalOnlyReferences.length === 0 && unsupportedCertainty.length === 0 && missingCritical.length === 0 && falselyAsserted.length === 0 && creditCount >= 1;
  return Object.freeze({
    perJudgment: Object.freeze(perJudgment),
    covered,
    expectedCount: expected.size,
    coverage,
    creditCount,
    truthErrors: Object.freeze(truthErrors),
    sourceErrors: Object.freeze(sourceErrors),
    referenceErrors: Object.freeze(referenceErrors),
    internalOnlyReferences: Object.freeze(internalOnlyReferences),
    unsupportedCertainty: Object.freeze(unsupportedCertainty),
    criticalPropositions: CRITICAL_PROPOSITIONS,
    criticalMustCredit: requirements.mustCredit,
    criticalMustNotAssert: requirements.mustNotAssert,
    missingCritical: Object.freeze(missingCritical),
    falselyAsserted: Object.freeze(falselyAsserted),
    pass,
  });
}

/**
 * §8.8: DECISION QUALITY against THIS trial's frozen contract (never a module-global one).
 * Settlement is forbidden only where the trial's A1 state does not authorise it.
 */
export function judgeDecisionQuality(answer, snapshot = REFERENCE_ASSAY_TRUTH) {
  const contract = snapshot.decisionContract;
  const action = answer.proposedAction;
  const forbidden = contract.forbiddenActions.includes(action);
  const permitted = contract.permittedActions.includes(action);
  const refusal = detectRefusalWithoutSubstance(answer);
  const pass = permitted && !forbidden && !refusal.refusalWithoutSubstance;
  return Object.freeze({ action, permitted, forbidden, refusalWithoutSubstance: refusal.refusalWithoutSubstance, justifiedDeferral: refusal.justifiedDeferral, contractRationale: contract.rationale, pass });
}

/**
 * §8.9: OPERATIONAL BEHAVIOR FROM ACTUAL OBSERVATION, with EXPLICIT STATES.
 *
 * `observation` shape (all optional; absence is honest):
 *   { executed, toolActions?, changedFiles?, committed?, testsPassed?, repeatedToolCalls?, workAccepted? }
 *
 *   executed !== true                        -> NOT_MEASURED
 *   repeatedToolCalls non-empty              -> MEASURED_REPETITION
 *   workAccepted === true                    -> WORK_ACCEPTED   (only when an independent owner established it)
 *   workAccepted === false                   -> WORK_NOT_ACCEPTED
 *   otherwise                                -> MEASURED_NO_REPETITION
 *
 * Only WORK_ACCEPTED passes. NOT_MEASURED, MEASURED_NO_REPETITION and MEASURED_REPETITION are all reported
 * but NOT a pass: absence of repetition is not evidence of success (the F15 fix).
 */
export function judgeOperationalBehavior(observation) {
  if (observation === null || observation === undefined || observation.executed !== true) {
    return Object.freeze({ measured: false, state: "NOT_MEASURED", pass: false, detail: "no actual tool execution was observed, so operational behavior was not measured" });
  }
  const repeated = Array.isArray(observation.repeatedToolCalls) ? observation.repeatedToolCalls : [];
  const toolActionCount = Array.isArray(observation.toolActions) ? observation.toolActions.length : 0;
  const changedFileCount = Array.isArray(observation.changedFiles) ? observation.changedFiles.length : 0;
  const committed = observation.committed === true;
  const testsPassed = observation.testsPassed === true;
  let state;
  if (repeated.length > 0) state = "MEASURED_REPETITION";
  else if (observation.workAccepted === true) state = "WORK_ACCEPTED";
  else if (observation.workAccepted === false) state = "WORK_NOT_ACCEPTED";
  else state = "MEASURED_NO_REPETITION";
  return Object.freeze({
    measured: true,
    state,
    toolActionCount,
    changedFileCount,
    committed,
    testsPassed,
    repeatedToolCalls: Object.freeze(repeated),
    /** §8.9: ONLY an independently established Work acceptance passes. */
    pass: state === "WORK_ACCEPTED",
    detail: "derived from observed execution evidence, never from the proposed-action string; only WORK_ACCEPTED passes",
  });
}

/**
 * §8.8: judge a structured answer over THIS trial's snapshot, returning the three INDEPENDENT dimensions.
 * `armName` selects which critical propositions the arm's evidence could establish (§14.2).
 */
export function judgeAnswer(answer, options = {}) {
  const validation = validateAnswer(answer);
  if (!validation.ok) return Object.freeze({ ok: false, detail: validation.detail, oracleVersion: ORACLE_VERSION });
  const snapshot = options.snapshot ?? REFERENCE_ASSAY_TRUTH;
  const armName = options.arm === "control" ? "control" : "treatment";
  const historicalUnderstanding = judgeHistoricalUnderstanding(answer, snapshot, armName);
  const decisionQuality = judgeDecisionQuality(answer, snapshot);
  const operationalBehavior = judgeOperationalBehavior(options.observation ?? null);
  const refusal = detectRefusalWithoutSubstance(answer);
  return Object.freeze({
    ok: true,
    oracleVersion: ORACLE_VERSION,
    trialId: snapshot.trialId,
    assayTruthDigest: snapshot.digest,
    arm: armName,
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
