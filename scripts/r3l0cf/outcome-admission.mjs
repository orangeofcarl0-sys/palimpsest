/**
 * R3-L0C-I Gate 2 — THE OUTCOME-ADMISSION SCHEMA AND THE THREE-WAY DISPOSITION.
 *
 * THE CORRECTION THIS MODULE MAKES, stated first because it changes a prior stage's behaviour and the change is
 * deliberate. R3-L0C-F's `classifyOutcome` treated a low hidden-oracle vector and a declined capital pull as
 * BEHAVIORAL failures whose response was a whole-matrix ABORT. That is wrong for this experiment, and it is wrong
 * in the most expensive possible way: those two things ARE the dependent variable. `prepaidCoverage` and whether
 * the model pulled visible capital are precisely what the study measures. Stopping the matrix when the first C
 * session declines a pull would destroy the experiment at its first interesting observation, and would make the
 * study measure only the sessions that happened to behave.
 *
 * Gate 2 requires the separation to be explicit, and this module is where it lives:
 *
 *   ADMITTED        an admissible experimental observation. Includes a CORRECT result, an INCORRECT result, a
 *                   DECLINED capital pull, and a low hidden-oracle vector. The matrix CONTINUES and the
 *                   observation is recorded. This is data, not a fault.
 *
 *   TRIAL_INVALID   an infrastructure or treatment failure that invalidates the trial's INTERPRETATION. A missing
 *                   report, a host failure, a Git object-resolution failure, a treatment realization mismatch, a
 *                   containment or closure failure, or a provider failure after invocation. The matrix STOPS,
 *                   because a trial whose treatment never reached the consumer cannot be read as a treatment
 *                   observation in either direction.
 *
 *   CENSORED        the Canonical Work could not advance legally, so the NEXT generation is impossible. The
 *                   trajectory is preserved as censored and the matrix STOPS. This is never repaired by forcing
 *                   Result, Verification or Promotion.
 *
 * WHY THE THIRD DISPOSITION IS SEPARATE FROM THE SECOND. A treatment failure says "this trial does not mean what
 * it looks like it means". A Work blockage says "the project cannot continue, and the reason is the project's own
 * state, not the experiment's machinery". Collapsing them would lose the distinction an operator needs: the first
 * is a harness or environment fault to fix, the second is a legitimate project outcome to report.
 *
 * NO EMPTY-OBJECT SUCCESS. The schema requires the outcome to carry EXPLICIT evidence of what happened. An empty
 * object, or one missing every admission signal, is `UNCLASSIFIABLE` and is NOT admitted — it cannot be recorded
 * as a trial, and it cannot be silently treated as success. R3-L0C-F's `classifyOutcome({})` returned `OK`, which
 * is exactly the failure this schema closes: a default-to-success path that would let a broken adapter produce
 * sixteen "successful" sessions.
 *
 * THE FROZEN ENDPOINTS ARE UNTOUCHED. This module reads the frozen `COMPLETION_CAUSES` and re-exports them; it
 * defines no new primary endpoint and changes no verdict threshold. It decides only whether a session's evidence
 * may be ADMITTED to the analysis, which is an admission question rather than a measurement one.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/**
 * Gate 2: THE REQUIRED ADMISSION SIGNALS.
 *
 * Each is a field the outcome MUST carry explicitly for the schema to consider it at all. They are the minimum
 * evidence that a session actually ran and produced something observable: what the host did, what the attempt did,
 * and what the consumer boundary carried.
 *
 * The set is deliberately small and structural. It is NOT a list of behavioural expectations — those are the
 * measurements, and requiring them would make an interesting outcome inadmissible, which is the error Gate 2
 * corrects.
 */
export const REQUIRED_ADMISSION_SIGNALS = Object.freeze([
  /** The host job reached a terminal phase the adapter actually observed. */
  'jobPhase',
  /** Whether the worker produced a report at all. A missing report is evidence, not silence. */
  'reportPresent',
  /** The attempt's terminal state, as the governed path reports it. */
  'attemptState',
  /** What the consumer boundary carried: the handle count the worker could see. */
  'consumerVisibleHandleCount',
  /** Whether the governed pull was exercised, and with what result. */
  'governedPullCount',
  /** The completion cause, from the frozen vocabulary. */
  'completionCause',
]);

/**
 * Gate 2: THE DISPOSITIONS.
 *
 * `ADMITTED` is the only disposition under which a trial record is written and the matrix continues.
 */
export const OUTCOME_DISPOSITIONS = Object.freeze([
  Object.freeze({
    id: 'ADMITTED',
    meaning: 'an admissible experimental observation, whatever its behavioural quality',
    matrixResponse: 'CONTINUE',
    trialRecorded: true,
    preservesTrajectory: false,
  }),
  Object.freeze({
    id: 'TRIAL_INVALID',
    meaning: 'an infrastructure or treatment failure that invalidates the trial\'s interpretation',
    matrixResponse: 'STOP_MATRIX',
    trialRecorded: false,
    preservesTrajectory: false,
  }),
  Object.freeze({
    id: 'CENSORED',
    meaning: 'the Canonical Work could not advance legally, so the next generation is impossible',
    matrixResponse: 'STOP_MATRIX_PRESERVE_CENSORED',
    trialRecorded: false,
    preservesTrajectory: true,
  }),
  Object.freeze({
    id: 'UNCLASSIFIABLE',
    meaning: 'the outcome carried no explicit admission evidence, so it may not be recorded as a trial',
    matrixResponse: 'STOP_MATRIX',
    trialRecorded: false,
    preservesTrajectory: false,
  }),
]);

/**
 * Gate 2: THE INFRASTRUCTURE/TREATMENT CAUSES.
 *
 * Each is a fault in the EXPERIMENT'S MACHINERY or in the TREATMENT'S DELIVERY. None of them is a behavioural
 * measurement, and each makes the trial uninterpretable rather than merely unsuccessful.
 */
export const TRIAL_INVALID_CAUSES = Object.freeze([
  Object.freeze({ id: 'MISSING_WORKER_REPORT', detail: 'the worker produced no report the harness can read' }),
  Object.freeze({ id: 'HOST_FAILURE', detail: 'the host job failed' }),
  Object.freeze({ id: 'GIT_OBJECT_RESOLUTION_FAILURE', detail: 'the world lost Git object access' }),
  Object.freeze({ id: 'UNAVAILABLE_WORKER_WORLD', detail: 'the worker world was not available' }),
  Object.freeze({ id: 'ENVIRONMENTAL_COMMIT_FAILURE', detail: 'the worker could not commit for an environmental reason' }),
  Object.freeze({ id: 'CONSUMER_VISIBLE_TREATMENT_MISMATCH', detail: 'the frozen treatment expectation did not match what the consumer saw' }),
  Object.freeze({ id: 'CONTAINMENT_FAILURE', detail: 'the experiment containment did not hold' }),
  Object.freeze({ id: 'EXECUTION_CLOSURE_MISMATCH', detail: 'the execution closure drifted' }),
  Object.freeze({ id: 'PROVIDER_ROUTE_FAILURE_AFTER_INVOCATION', detail: 'the provider route failed after the invocation' }),
  Object.freeze({ id: 'LAUNCH_THREW', detail: 'the launch seam threw' }),
]);

/**
 * Gate 2: THE ADMISSIBLE BEHAVIOURAL OBSERVATIONS.
 *
 * These are the things R3-L0C-F stopped on and this stage ADMITS. Each is a fact about how the worker performed,
 * and each is a measurement the study exists to collect. They are recorded, never treated as a reason to
 * terminate.
 */
export const ADMISSIBLE_OBSERVATIONS = Object.freeze([
  Object.freeze({ id: 'CORRECT_IMPLEMENTATION', detail: 'the promoted source satisfies the hidden oracle' }),
  Object.freeze({ id: 'INCORRECT_IMPLEMENTATION', detail: 'the promoted source fails some hidden invariant classes' }),
  Object.freeze({ id: 'LOW_HIDDEN_INVARIANT_COVERAGE', detail: 'the promoted source covers fewer hidden classes than the floor' }),
  Object.freeze({ id: 'MODEL_DECLINED_VISIBLE_CAPITAL', detail: 'capital was visible at the consumer boundary and the worker pulled none of it' }),
  Object.freeze({ id: 'COMPLETED_WORK_FAILS_CORRECTNESS', detail: 'the completed work failed the project\'s own correctness check' }),
  Object.freeze({ id: 'BUDGET_EXHAUSTED_WITHOUT_USABLE_RESULT', detail: 'the worker reached its budget without a usable result' }),
]);

/**
 * Gate 2: THE CANONICAL-WORK BLOCKAGE.
 *
 * A fact about the PROJECT's own state, not about the experiment's machinery. It means the next generation cannot
 * legally start, and the trajectory is censored rather than replaced.
 */
export const WORK_BLOCKAGE = Object.freeze({
  id: 'CANONICAL_WORK_CANNOT_ADVANCE',
  detail: 'the attempt did not settle, so the project is not quiescent and the next generation cannot legally start',
  response: 'STOP_MATRIX_PRESERVE_CENSORED',
  /** Gate 2: the repair this forbids. */
  forbiddenRepair: 'never force Result, Verification or Promotion to unblock the project',
});

/**
 * Gate 2: ADMIT AN OUTCOME.
 *
 * THE ORDER IS THE POLICY, and it is the reverse of R3-L0C-F's. Machinery faults are checked first, because a
 * broken environment makes every behavioural reading untrustworthy — but a behavioural observation is NEVER a
 * reason to stop, and the absence of admission evidence is itself a stop rather than a default success.
 */
export function admitOutcome(outcome, options = {}) {
  const coverageFloor = options.coverageFloor ?? 0;

  /**
   * 0. AN ENTERED LAUNCH WHOSE OUTCOME IS UNKNOWN — CHECKED FIRST, and the ordering is a correction.
   *
   * The schema check cannot precede this one, because an unknown outcome BY DEFINITION may carry no evidence: the
   * whole reason it is unknown is that the process died, the report never arrived, or the port failed after the
   * invocation. Requiring admission signals first would reclassify every genuine uncertainty as
   * `UNCLASSIFIABLE`, which reads as "the harness sent a malformed outcome" rather than "a model call may have
   * happened and we cannot tell" — a materially different and much less alarming claim.
   *
   * Measured: with the schema check first, the UNCERTAIN case produced ABORT_PRESERVED instead of
   * UNCERTAIN_PRESERVED, which loses the one distinction §4 of R3-L0C-F exists to preserve.
   */
  if (outcome !== null && typeof outcome === 'object' && outcome.outcomeUnknown === true) {
    return Object.freeze({
      disposition: 'TRIAL_INVALID',
      cause: 'OUTCOME_UNKNOWN_AFTER_LAUNCH',
      missingSignals: Object.freeze([]),
      observations: Object.freeze([]),
      trialRecorded: false,
      matrixResponse: 'STOP_MATRIX',
      detail: 'the launch was entered and its outcome is unknown; do not infer that no model call occurred',
    });
  }

  /** 1. THE SCHEMA. No explicit evidence, no admission. This is the empty-object guard. */
  const missingSignals = outcome === null || outcome === undefined || typeof outcome !== 'object'
    ? [...REQUIRED_ADMISSION_SIGNALS]
    : REQUIRED_ADMISSION_SIGNALS.filter((signal) => !(signal in outcome));
  if (missingSignals.length > 0) {
    return Object.freeze({
      disposition: 'UNCLASSIFIABLE',
      cause: 'INSUFFICIENT_ADMISSION_EVIDENCE',
      missingSignals: Object.freeze(missingSignals),
      observations: Object.freeze([]),
      trialRecorded: false,
      matrixResponse: 'STOP_MATRIX',
      detail: `the outcome carries no evidence for [${missingSignals.join(', ')}], so it cannot be recorded as a trial; an absent signal is not a successful one`,
    });
  }

  /** 2. THE MACHINERY AND TREATMENT FAULTS. These invalidate interpretation, so the matrix stops. */
  const invalidCause = firstInvalidCause(outcome);
  if (invalidCause !== null) {
    return Object.freeze({
      disposition: 'TRIAL_INVALID',
      cause: invalidCause.id,
      missingSignals: Object.freeze([]),
      observations: Object.freeze([]),
      trialRecorded: false,
      matrixResponse: 'STOP_MATRIX',
      detail: invalidCause.detail,
    });
  }

  /**
   * 4. THE CANONICAL-WORK BLOCKAGE. Checked BEFORE the behavioural observations, because a project that cannot
   * advance is a stop regardless of how the work turned out, and the censored trajectory must be preserved
   * rather than read as a behavioural result.
   */
  if (outcome.workCannotAdvance === true) {
    return Object.freeze({
      disposition: 'CENSORED',
      cause: WORK_BLOCKAGE.id,
      missingSignals: Object.freeze([]),
      observations: Object.freeze([...collectObservations(outcome, coverageFloor)]),
      trialRecorded: false,
      matrixResponse: 'STOP_MATRIX_PRESERVE_CENSORED',
      detail: WORK_BLOCKAGE.detail,
      forbiddenRepair: WORK_BLOCKAGE.forbiddenRepair,
    });
  }

  /**
   * 5. THE ADMISSIBLE OBSERVATIONS. Reaching here with explicit evidence means the session ran, the machinery
   * held, and the project can continue. Whatever the work's quality, it is DATA.
   */
  const observations = collectObservations(outcome, coverageFloor);
  return Object.freeze({
    disposition: 'ADMITTED',
    cause: null,
    missingSignals: Object.freeze([]),
    observations: Object.freeze(observations),
    trialRecorded: true,
    matrixResponse: 'CONTINUE',
    detail: `admitted with ${String(observations.length)} behavioural observation(s): ${observations.map((entry) => entry.id).join(', ') || 'none'}`,
  });
}

/** The first machinery/treatment cause present on the outcome, or null. */
function firstInvalidCause(outcome) {
  const present = [];
  if (outcome.reportPresent === false || outcome.reportMissing === true) present.push(TRIAL_INVALID_CAUSES[0]);
  if (outcome.jobPhase === 'HOST_ERROR' || outcome.hostFailure === true) present.push(TRIAL_INVALID_CAUSES[1]);
  if (outcome.gitObjectResolutionFailed === true) present.push(TRIAL_INVALID_CAUSES[2]);
  if (outcome.worldUnavailable === true) present.push(TRIAL_INVALID_CAUSES[3]);
  if (outcome.commitFailedEnvironmentally === true) present.push(TRIAL_INVALID_CAUSES[4]);
  if (outcome.treatmentMismatch === true) present.push(TRIAL_INVALID_CAUSES[5]);
  if (outcome.containmentFailed === true) present.push(TRIAL_INVALID_CAUSES[6]);
  if (outcome.closureMismatch === true) present.push(TRIAL_INVALID_CAUSES[7]);
  if (outcome.providerFailedAfterInvocation === true) present.push(TRIAL_INVALID_CAUSES[8]);
  if (outcome.threw === true) present.push(TRIAL_INVALID_CAUSES[9]);
  return present[0] ?? null;
}

/**
 * Gate 2: THE BEHAVIOURAL OBSERVATIONS PRESENT.
 *
 * Each is read from the outcome's own evidence, and each is RECORDED rather than acted upon. The floor is applied
 * to produce the low-coverage observation, which is a measurement, not a fault.
 */
function collectObservations(outcome, coverageFloor) {
  const found = [];
  if (outcome.hiddenInvariantVector !== undefined && outcome.hiddenInvariantVector !== null) {
    const failed = outcome.hiddenInvariantVector.failedPrepaidClasses ?? [];
    if (failed.length === 0) found.push(ADMISSIBLE_OBSERVATIONS[0]);
    else found.push(ADMISSIBLE_OBSERVATIONS[1]);
    if (typeof outcome.hiddenInvariantVector.prepaidCoverage === 'number' && outcome.hiddenInvariantVector.prepaidCoverage < coverageFloor) found.push(ADMISSIBLE_OBSERVATIONS[2]);
  }
  if ((outcome.consumerVisibleHandleCount ?? 0) > 0 && (outcome.governedPullCount ?? 0) === 0) found.push(ADMISSIBLE_OBSERVATIONS[3]);
  if (outcome.correctnessOk === false) found.push(ADMISSIBLE_OBSERVATIONS[4]);
  if (outcome.completionCause === 'MAX_TOKENS' || outcome.completionCause === 'TIMEOUT') found.push(ADMISSIBLE_OBSERVATIONS[5]);
  return found;
}

/**
 * Gate 2: THE POLICY, AS A VALUE.
 *
 * Carried so a report can state the policy without re-deriving it, and so the separation Gate 2 requires is
 * auditable as data rather than as prose.
 */
export const BEHAVIORAL_OUTCOME_POLICY = Object.freeze({
  schemaVersion: 1,
  kind: 'behavioural outcome policy',
  separates: Object.freeze({
    admissibleObservation: ADMISSIBLE_OBSERVATIONS.map((entry) => entry.id),
    infrastructureOrTreatmentFailure: TRIAL_INVALID_CAUSES.map((entry) => entry.id),
    canonicalWorkBlockage: WORK_BLOCKAGE.id,
  }),
  /** Gate 2's central correction, stated so it cannot be quietly reverted. */
  incorrectOracleVectorIsAStop: false,
  declinedCapitalPullIsAStop: false,
  lowCoverageIsAStop: false,
  incorrectVectorIsRecorded: true,
  declinedPullIsRecorded: true,
  /** Gate 2: the Work blockage is still a stop, and the repair is still forbidden. */
  workBlockageIsAStop: true,
  forcesResultVerificationOrPromotion: false,
  /** Gate 2: no empty-object success. */
  requiresExplicitAdmissionEvidence: true,
  emptyObjectAdmitted: false,
  frozenEndpointsChanged: false,
  frozenThresholdsChanged: false,
  law: 'a behavioural outcome is recorded, not a reason to terminate the study; only a machinery fault or a canonical Work blockage stops the matrix',
});

export { NL };
