/**
 * R3-L0C-I-A-R §4 — THE CHILD/WORKER ADMISSION GATE.
 *
 * THE DEFECT THIS CLOSES, measured in G4. The R3-L0C-I-A adapter computed `reportPresent: workerResult.present`
 * — the presence of the result LINE, not its validity — and carried `childOk`, `attemptId` and `attemptState`
 * without anything in the admission path refusing on them. The frozen `admitOutcome` checks `reportPresent ===
 * false`, `jobPhase === 'HOST_ERROR'`, git/world/commit faults, `treatmentMismatch`, containment/closure, provider
 * and `threw` — and nothing else. Measured: five of the six §4 controls were ADMITTED.
 *
 * THE REPAIR IS A GATE IN FRONT OF THE FROZEN SCHEMA. This module runs the six §4 checks FIRST and returns a
 * refusal when any fires; otherwise it delegates to the frozen `admitOutcome`, so R3-L0C-I's behavioural-admission
 * policy (an incorrect oracle vector and a declined pull are DATA, not stops) is preserved rather than reimplemented.
 *
 * WHY THE GATE IS SEPARATE FROM THE SCHEMA. The frozen schema decides whether a session's evidence may be admitted
 * to the analysis — an admission question. The six §4 controls are machinery, vocabulary, identity and evidence
 * faults, which are also admission questions but of a different kind: they are about whether the harness correctly
 * READ the worker, not about how the worker performed. Keeping them separate means the behavioural policy cannot
 * be quietly changed by a repair to the read path.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { ADMISSION_NEGATIVE_CONTROLS, EXPECTED_TERMINAL_STATES, NL } from './contract.mjs';

/**
 * §4: THE MACHINERY/VOCABULARY/IDENTITY/EVIDENCE REFUSALS.
 *
 * Each returns `null` when it does not fire, or `{ cause, detail }` when it does. They are checked in the order
 * §4 lists them, and the FIRST to fire is the cause reported.
 */
export function admissionFault(outcome) {
  const o = outcome ?? {};

  /** 1. A result line present but malformed. */
  if (o.workerResultPresent === true && o.workerResultParseFailure !== null && o.workerResultParseFailure !== undefined) {
    return Object.freeze({ cause: 'MALFORMED_WORKER_RESULT', detail: `a Worker Result line was present but did not satisfy the shipped contract: ${String(o.workerResultParseFailure).slice(0, 200)}` });
  }

  /** 2. A result line whose vocabulary is invalid (parses, but not an admissible kind/field combination). */
  if (o.workerResultPresent === true && o.workerResultAdmissible === false && (o.workerResultParseFailure === null || o.workerResultParseFailure === undefined)) {
    return Object.freeze({ cause: 'INVALID_WORKER_RESULT_VOCABULARY', detail: `the Worker Result line parsed but its vocabulary is not admissible (kind=${String(o.workerResultKind)})` });
  }
  if (o.workerResultPresent === true && o.workerResultAdmissible === false) {
    return Object.freeze({ cause: 'INVALID_WORKER_RESULT_VOCABULARY', detail: `the Worker Result line is not admissible (kind=${String(o.workerResultKind)})` });
  }

  /** 3. The child report says ok=false while the host phase is FINISHED. */
  if (o.jobPhase === 'FINISHED' && o.childOk === false) {
    return Object.freeze({ cause: 'CHILD_REPORT_ERROR_UNDER_FINISHED_HOST', detail: `the child report carries ok=false (error=${String(o.childError)}) while the host job reached FINISHED` });
  }

  /** 4. A missing attempt identity. */
  if (o.attemptId === null || o.attemptId === undefined || o.attemptId === '') {
    return Object.freeze({ cause: 'MISSING_ATTEMPT_IDENTITY', detail: 'the outcome carries no attempt identity, so the session cannot be bound to a durable attempt' });
  }

  /**
   * 5. An unexpected terminal state when a result was declared.
   *
   * THE SCOPE IS DELIBERATE. A state that means the work simply did not settle (`RUNNING`, `LEASED`, `CREATED`) is
   * the CANONICAL WORK BLOCKAGE case, which the frozen schema classifies as `CENSORED` and preserves — it is a
   * legitimate project outcome, not a machinery fault, and refusing it here would turn a censored trajectory into
   * an infrastructure failure. So this control fires only for a state that is NEITHER the expected terminal set
   * NOR one of the known non-terminal attempt states.
   */
  const NON_TERMINAL_ATTEMPT_STATES = ['RUNNING', 'LEASED', 'CREATED'];
  if (o.reportPresent === true && o.attemptState !== null && o.attemptState !== undefined
    && !EXPECTED_TERMINAL_STATES.includes(String(o.attemptState))
    && !NON_TERMINAL_ATTEMPT_STATES.includes(String(o.attemptState))) {
    return Object.freeze({ cause: 'UNEXPECTED_TERMINAL_STATE', detail: `the attempt reached terminal state "${String(o.attemptState)}" while a result was declared; the expected states are [${EXPECTED_TERMINAL_STATES.join(', ')}] and a non-terminal state is classified as a Work blockage rather than as a machinery fault` });
  }
  if (o.reportPresent === true && (o.attemptState === null || o.attemptState === undefined)) {
    return Object.freeze({ cause: 'UNEXPECTED_TERMINAL_STATE', detail: 'the outcome declared a result but carries no attempt state, so its terminal state cannot be established' });
  }

  return null;
}

/**
 * §4: ADMIT AN OUTCOME THROUGH THE GATE AND THEN THE FROZEN SCHEMA.
 *
 * Returns the frozen schema's disposition when the gate does not fire, and a `TRIAL_INVALID` refusal when it does.
 * The refusal names the cause and carries the §4 control id, so the acceptance suite can assert the pair.
 */
export async function admitThroughGate(outcome, options = {}) {
  const { admitOutcome } = await import('../r3l0cf/outcome-admission.mjs');
  const fault = admissionFault(outcome);
  if (fault !== null) {
    const control = ADMISSION_NEGATIVE_CONTROLS.find((entry) => entry.requiredCause === fault.cause);
    return Object.freeze({
      disposition: 'TRIAL_INVALID',
      cause: fault.cause,
      controlId: control?.id ?? null,
      missingSignals: Object.freeze([]),
      observations: Object.freeze([]),
      trialRecorded: false,
      matrixResponse: 'STOP_MATRIX',
      detail: fault.detail,
      gateFired: true,
    });
  }
  const admitted = admitOutcome(outcome, options);
  return Object.freeze({ ...admitted, controlId: null, gateFired: false });
}

/**
 * §4: THE NEGATIVE CONTROLS AS DATA, WITH THE OUTCOME SHAPE EACH NEEDS.
 *
 * Every control carries the six admission signals the frozen schema requires, EXCEPT the last, which deliberately
 * omits one — so the fifth control's refusal is produced by this stage's gate and the sixth's by the frozen
 * schema's own empty-evidence guard. The acceptance suite builds each outcome from this, so the control set and
 * the test agree on the six cases and their required causes.
 */
const SIGNALS = Object.freeze({ jobPhase: 'FINISHED', reportPresent: true, attemptState: 'COMPLETED', consumerVisibleHandleCount: 0, governedPullCount: 0, completionCause: 'RESULT_SUBMITTED' });

export const ADMISSION_CONTROL_OUTCOMES = Object.freeze({
  WORKER_RESULT_LINE_MALFORMED: Object.freeze({ ...SIGNALS, workerResultPresent: true, workerResultAdmissible: false, workerResultParseFailure: 'the result line does not parse', attemptId: 'attempt-x' }),
  WORKER_RESULT_VOCABULARY_INVALID: Object.freeze({ ...SIGNALS, workerResultPresent: true, workerResultKind: 'WHATEVER', workerResultAdmissible: false, workerResultParseFailure: null, attemptId: 'attempt-x' }),
  CHILD_REPORT_ERROR_HOST_FINISHED: Object.freeze({ ...SIGNALS, childOk: false, childError: 'the child reported an error', workerResultPresent: true, workerResultAdmissible: true, attemptId: 'attempt-x' }),
  MISSING_ATTEMPT_IDENTITY: Object.freeze({ ...SIGNALS, attemptId: null, workerResultPresent: true, workerResultAdmissible: true }),
  UNEXPECTED_TERMINAL_STATE: Object.freeze({ ...SIGNALS, attemptId: 'attempt-x', attemptState: 'SOMETHING_UNEXPECTED', workerResultPresent: true, workerResultAdmissible: true }),
  /** §4: the declared outcome omits a MANDATORY admission signal, which the frozen schema refuses. */
  DECLARED_OUTCOME_MISSING_EVIDENCE: Object.freeze({ jobPhase: 'FINISHED', reportPresent: true, attemptState: 'COMPLETED', consumerVisibleHandleCount: 0, governedPullCount: 0, attemptId: 'attempt-x' }),
});

/** §4: the positive control, which MUST remain admissible. */
export const ADMISSION_POSITIVE_OUTCOME = Object.freeze({
  ...SIGNALS,
  workerResultPresent: true, workerResultKind: 'READY_FOR_SETTLEMENT', workerResultAdmissible: true, workerResultParseFailure: null,
  childOk: true, attemptId: 'attempt-ok',
});

export { NL };
