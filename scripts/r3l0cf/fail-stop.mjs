/**
 * R3-L0C-F §4/§5/§6/§7/§8 — THE STAGE-OWNED FAIL-STOP MATRIX RUNNER.
 *
 * This is the new runner §3's falsifiers are written against. It is STAGE-OWNED and RESEARCH-ONLY: it creates no
 * canonical Work owner, writes no product store, and terminalizes nothing. It executes a schedule through an
 * injected `launch` seam and decides, at every step, whether the matrix may continue.
 *
 * THE FOUR LAWS IT ENFORCES, each of which is one of the legacy defects it replaces:
 *
 *   1. ONE LAUNCH PER SESSION. The exposure-intent is journalled BEFORE the launch, the launch happens once, and
 *      no code path reaches the seam twice for one session. `MAX_WORKER_LAUNCHES = 1`,
 *      `POST_EXPOSURE_RETRIES = 0`. This closes legacy D1/D2.
 *   2. PER-GENERATION DURABILITY. Each session's record is journalled and fsynced BEFORE the next session starts,
 *      so a crash loses at most the session in flight. This closes legacy D3.
 *   3. NO GENERATION IS ENTERED ON AN UNRESOLVED PREDECESSOR. Before a session starts, the previous session's
 *      outcome must be RESOLVED; an unresolved predecessor stops the matrix. This closes legacy D4.
 *   4. NO COMPLETION WITHOUT A GREEN POST-MATRIX VALIDITY GATE over the FULL schedule. Every scheduled session
 *      must be present and valid, and the validity gate must be green, or the run reports ABORTED rather than
 *      COMPLETE. This closes legacy D5.
 *
 * THE FAILURE CLASSIFICATION IS THE DECISION THAT MATTERS MOST. §5 splits failures into infrastructure/protocol
 * and observable behavioral, and forbids confusing them in either direction. The classifier here is
 * CONSERVATIVE in one specific way: an outcome it cannot positively classify as behavioral is treated as
 * infrastructure, because the cost of the two errors is asymmetric — misclassifying a behavioral failure as
 * infrastructure invites a retry that must never happen, while the reverse merely stops a matrix that could have
 * continued, and stopping is always the safe direction.
 *
 * THE UNCERTAIN STATE IS NOT AN OPTIMIZATION. §4 requires that a failure leaving it UNKNOWN whether a model call
 * occurred is preserved as UNCERTAIN and refuses automatic resume or replacement. The runner distinguishes
 * "the launch was never entered" from "the launch was entered and its outcome is unknown" by reading its own
 * journal, and the second is UNCERTAIN_PRESERVED.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CLASSIFICATION_LAW,
  FAILURE_CLASSES,
  FAIL_STOP_TRANSITIONS,
  LAUNCH_LAW,
  TERMINAL_PRESERVED_STATES,
  VERDICT_ADMISSION_PRECONDITIONS,
} from './contract.mjs';
import {
  ABORT_MANIFEST_FILE,
  JOURNAL_FILE,
  appendRecord,
  buildAbortManifest,
  buildEvidenceIndex,
  buildGenerationRecord,
  readJournal,
  writeJsonAtomic,
} from './journal.mjs';
import { buildObservation, evaluateFailStopProperties } from './properties.mjs';

const NL = String.fromCharCode(10);

/**
 * §4: THE STATE MACHINE.
 *
 * A transition not present in `FAIL_STOP_TRANSITIONS` is REFUSED rather than allowed by default, so an
 * unanticipated edge stops the runner instead of proceeding. That is the fail-closed reading of §4's state list.
 */
export class FailStopStateMachine {
  #state = 'PLANNED';
  #history = [];

  get state() {
    return this.#state;
  }

  get history() {
    return Object.freeze([...this.#history]);
  }

  /** §4: whether the machine may still execute anything. */
  get terminal() {
    return TERMINAL_PRESERVED_STATES.includes(this.#state) || this.#state === 'MATRIX_COMPLETE';
  }

  /** §4: move to a state, refusing an undeclared edge. */
  transition(next, detail = null) {
    const allowed = FAIL_STOP_TRANSITIONS[this.#state] ?? [];
    if (!allowed.includes(next)) {
      throw new Error(`REFUSED: the fail-stop machine cannot move ${this.#state} -> ${next}; the declared edges from ${this.#state} are [${allowed.join(', ') || 'none'}]`);
    }
    this.#history.push(Object.freeze({ from: this.#state, to: next, at: new Date().toISOString(), detail }));
    this.#state = next;
    return this.#state;
  }

  /** A serialisable snapshot, for the journal and the manifest. */
  snapshot() {
    return Object.freeze({ state: this.#state, terminal: this.terminal, history: this.history });
  }
}

/**
 * §5: CLASSIFY A SESSION OUTCOME.
 *
 * The classifier reads the outcome's own evidence and returns a classification plus the cause. The asymmetry is
 * deliberate and stated above: only a POSITIVELY behavioral outcome is classified as behavioral; everything
 * ambiguous is infrastructure, because the infrastructure response (stop, preserve) is the safe one.
 *
 * The behavioral signals are the §5 examples, and each is a fact on the outcome rather than an inference:
 *   · a completed Result whose work is incorrect            -> `resultCorrect === false`
 *   · low hidden invariant coverage                          -> `invariantCoverage` below the caller's floor
 *   · the model declined to pull capital that was visible    -> `visibleHandles > 0 && pulls.length === 0`
 *   · completed work fails correctness checks                -> `correctnessOk === false`
 *   · the model exhausted its budget without a usable result -> `completionCause` in MAX_TOKENS/TIMEOUT with no result
 */
export function classifyOutcome(outcome, options = {}) {
  const coverageFloor = options.coverageFloor ?? 0;
  const causes = [];
  /** Infrastructure/protocol, checked FIRST, because it dominates: a broken environment is not a behavioral fact. */
  if (outcome === null || outcome === undefined) causes.push({ kind: 'INFRASTRUCTURE', cause: 'MISSING_OUTCOME' });
  if (outcome?.reportMissing === true) causes.push({ kind: 'INFRASTRUCTURE', cause: 'MISSING_WORKER_REPORT' });
  if (outcome?.jobPhase === 'HOST_ERROR' || outcome?.hostFailure === true) causes.push({ kind: 'INFRASTRUCTURE', cause: 'HOST_FAILURE' });
  if (outcome?.gitObjectResolutionFailed === true) causes.push({ kind: 'INFRASTRUCTURE', cause: 'GIT_OBJECT_RESOLUTION_FAILURE' });
  if (outcome?.worldUnavailable === true) causes.push({ kind: 'INFRASTRUCTURE', cause: 'UNAVAILABLE_WORKER_WORLD' });
  if (outcome?.commitFailedEnvironmentally === true) causes.push({ kind: 'INFRASTRUCTURE', cause: 'ENVIRONMENTAL_COMMIT_FAILURE' });
  if (outcome?.treatmentMismatch === true) causes.push({ kind: 'INFRASTRUCTURE', cause: 'CONSUMER_VISIBLE_TREATMENT_MISMATCH' });
  if (outcome?.containmentFailed === true) causes.push({ kind: 'INFRASTRUCTURE', cause: 'CONTAINMENT_FAILURE' });
  if (outcome?.closureMismatch === true) causes.push({ kind: 'INFRASTRUCTURE', cause: 'EXECUTION_CLOSURE_MISMATCH' });
  if (outcome?.providerFailedAfterInvocation === true) causes.push({ kind: 'INFRASTRUCTURE', cause: 'PROVIDER_ROUTE_FAILURE_AFTER_INVOCATION' });
  if (outcome?.priorAttemptUnresolved === true) causes.push({ kind: 'INFRASTRUCTURE', cause: 'UNRESOLVED_ATTEMPT_BLOCKING_NEXT_GENERATION' });
  if (outcome?.threw === true) causes.push({ kind: 'INFRASTRUCTURE', cause: 'LAUNCH_THREW' });

  /** Behavioral signals, only when no infrastructure cause was found. */
  if (causes.length === 0) {
    if (outcome?.resultCorrect === false) causes.push({ kind: 'BEHAVIORAL', cause: 'INCORRECT_IMPLEMENTATION_DESPITE_RESULT' });
    if (typeof outcome?.invariantCoverage === 'number' && outcome.invariantCoverage < coverageFloor) causes.push({ kind: 'BEHAVIORAL', cause: 'LOW_HIDDEN_INVARIANT_COVERAGE' });
    if ((outcome?.visibleHandles ?? 0) > 0 && (outcome?.pulls ?? []).length === 0) causes.push({ kind: 'BEHAVIORAL', cause: 'MODEL_DECLINED_VISIBLE_CAPITAL' });
    if (outcome?.correctnessOk === false) causes.push({ kind: 'BEHAVIORAL', cause: 'COMPLETED_WORK_FAILS_CORRECTNESS' });
    if (outcome?.budgetExhaustedWithoutResult === true) causes.push({ kind: 'BEHAVIORAL', cause: 'BUDGET_EXHAUSTED_WITHOUT_USABLE_RESULT' });
    /**
     * §5: Work that cannot legally progress is a BEHAVIORAL outcome whose response is a whole-matrix stop and a
     * CENSORED trajectory — never a repair that forces Result/Verification/Promotion. It is checked last because
     * it is the most general statement, and it must produce a failure rather than being silently accepted: an
     * outcome that says the Work cannot progress but is classified OK would let the matrix continue over an
     * unresolved predecessor, which is legacy defect D4 reintroduced from the other side.
     */
    if (outcome?.workCannotProgress === true) causes.push({ kind: 'BEHAVIORAL', cause: 'WORK_CANNOT_PROGRESS_CENSORED_TRAJECTORY' });
  }

  /** §5: Work could not legally progress — a behavioral outcome whose response is also a whole-matrix stop. */
  const workCannotProgress = outcome?.workCannotProgress === true;
  const classification = causes.length === 0 ? 'OK' : causes[0].kind;
  return Object.freeze({
    classification,
    causes: Object.freeze(causes),
    /** §5: the response, taken from the frozen contract so it cannot be softened here. */
    response: classification === 'OK' ? Object.freeze([]) : (FAILURE_CLASSES[classification]?.response ?? Object.freeze([])),
    workCannotProgress,
    /** §5: the classification must never be read as license to retry. */
    retryPermitted: false,
    classifiedConservatively: causes.some((cause) => cause.kind === 'INFRASTRUCTURE'),
  });
}

/**
 * §4/§5/§6: RUN A SCHEDULE UNDER FAIL-STOP.
 *
 * The `launch` seam has the shape the real generation child has: it receives `{ session, attempt }` and returns an
 * outcome, and it may THROW (a host interruption) or hang (which the caller models with a timeout of its own).
 * The runner never calls it twice for a session.
 *
 * `validityGate` is the post-matrix gate. It receives the completed sessions and returns `{ green, detail }`. §14
 * lists the preconditions; the caller supplies the concrete checks, and the runner refuses to report completion
 * without a green gate over the FULL schedule.
 */
export async function runFailStopMatrix(input) {
  const {
    runId,
    runRoot,
    schedule,
    launch,
    validityGate = async () => ({ green: true, detail: 'no gate supplied' }),
    coverageFloor = 0,
    onSessionRecorded = null,
    /** §8: an injectable stop, so a falsifier can interrupt the run between two sessions deterministically. */
    beforeSession = null,
    closureDigest = null,
  } = input;

  const machine = new FailStopStateMachine();
  const journalPath = join(runRoot, JOURNAL_FILE);
  const plannedSessions = schedule.map((session) => session.sessionId);
  const completed = [];
  const failed = [];
  const uncertain = [];
  const records = [];
  const launches = [];
  /** §6: the terminal events written to a PRODUCT store. Fail-stop writes none, and the count proves it. */
  const terminalEventsSynthesized = [];

  const journal = (kind, payload) => appendRecord({ journalPath, kind, payload });

  journal('RUN_STARTED', { runId, runRoot, plannedSessions, closureDigest, maxWorkerLaunches: LAUNCH_LAW.MAX_WORKER_LAUNCHES, postExposureRetries: LAUNCH_LAW.POST_EXPOSURE_RETRIES });
  machine.transition('PREFLIGHT_PASSED', { note: 'the runner begins; the preflight itself is a separate stage step' });

  /** §7: the preservation marker is placed BEFORE the first primary worker launch. */
  writeJsonAtomic(join(runRoot, 'PRESERVE'), { runId, at: new Date().toISOString(), reason: 'a fail-stop run preserves its evidence from the first exposure onward' });
  journal('PREFLIGHT_RECORDED', { preserveMarkerPlaced: true });

  /** The state the machine is in when a session begins: it must have recorded an exposure-intent. */
  let lastFailure = null;

  for (const session of schedule) {
    /** §4: a terminal state ends the loop immediately; nothing further is launched. */
    if (machine.terminal) break;

    /** §8: the injectable interruption point, so a host-termination case is deterministic. */
    if (typeof beforeSession === 'function') {
      const stop = beforeSession({ session, completed: completed.slice(), launches: launches.slice() });
      if (stop?.stop === true) {
        lastFailure = Object.freeze({ sessionId: session.sessionId, failureClass: 'INFRASTRUCTURE_OR_PROTOCOL', cause: stop.cause ?? 'INJECTED_STOP', detail: stop.detail ?? null });
        journal('SESSION_FAILED', { sessionId: session.sessionId, failureClass: lastFailure.failureClass, cause: lastFailure.cause, phase: 'BEFORE_LAUNCH' });
        machine.transition('ABORT_PRESERVED', { sessionId: session.sessionId, cause: lastFailure.cause });
        break;
      }
    }

    /** §4/§5 defect 4: an UNRESOLVED predecessor stops the matrix before the next session starts. */
    if (session.requiresResolved !== undefined && session.requiresResolved !== null && !completed.includes(session.requiresResolved)) {
      lastFailure = Object.freeze({
        sessionId: session.sessionId,
        failureClass: 'INFRASTRUCTURE_OR_PROTOCOL',
        cause: 'UNRESOLVED_ATTEMPT_BLOCKING_NEXT_GENERATION',
        detail: `session "${session.sessionId}" requires "${session.requiresResolved}" to be resolved, but it is not among the completed sessions`,
      });
      journal('SESSION_FAILED', { sessionId: session.sessionId, failureClass: lastFailure.failureClass, cause: lastFailure.cause, phase: 'BEFORE_LAUNCH' });
      machine.transition('ABORT_PRESERVED', { sessionId: session.sessionId, cause: lastFailure.cause });
      break;
    }

    /** §4: the exposure-intent is durable BEFORE the launch, so a crash cannot hide a possible model call. */
    machine.transition('EXPOSURE_RECORDED', { sessionId: session.sessionId });
    journal('EXPOSURE_INTENT_RECORDED', { sessionId: session.sessionId, exposureState: 'INTENT_RECORDED_BEFORE_LAUNCH', intendedExecutorRoute: input.intendedExecutorRoute ?? null });

    /**
     * THE SINGLE LAUNCH. There is no loop around this call and no retry path below it: the `attempt` is always 1,
     * and the runner cannot reach the seam again for this session because the loop advances regardless of outcome.
     */
    machine.transition('WORKER_LAUNCHED', { sessionId: session.sessionId, attempt: 1 });
    launches.push(Object.freeze({ sessionId: session.sessionId, attempt: 1 }));
    journal('WORKER_LAUNCH_RECORDED', { sessionId: session.sessionId, attempt: 1, maxWorkerLaunches: LAUNCH_LAUNCHES_PER_SESSION });

    let outcome = null;
    let threw = null;
    try {
      outcome = await launch({ session, attempt: 1 });
    } catch (error) {
      /** A throw from the seam: the launch WAS entered, so the outcome is at best uncertain. */
      threw = String(error?.message ?? error);
      outcome = Object.freeze({ threw: true, threwDetail: threw });
    }

    const classified = classifyOutcome(outcome, { coverageFloor });

    /** §4: an entered launch whose outcome is unknown is UNCERTAIN, never assumed to be a non-event. */
    if (outcome?.outcomeUnknown === true) {
      uncertain.push(session.sessionId);
      journal('SESSION_UNCERTAIN', { sessionId: session.sessionId, reason: outcome.uncertainReason ?? 'OUTCOME_UNKNOWN', detail: 'the launch was entered and its outcome is unknown; do not infer that no model call occurred' });
      machine.transition('UNCERTAIN_PRESERVED', { sessionId: session.sessionId });
      break;
    }

    if (classified.classification === 'OK') {
      /** §6: the per-generation record is journalled and fsynced BEFORE the next session starts. */
      const record = buildGenerationRecord({
        sessionId: session.sessionId,
        block: session.block,
        arm: session.arm,
        generation: session.generation,
        trajectoryId: session.trajectoryId,
        executionClosureDigest: closureDigest,
        treatmentExpectationDigest: session.treatmentExpectationDigest ?? null,
        intendedExecutorRoute: input.intendedExecutorRoute ?? null,
        exposureState: 'LAUNCHED_ONCE',
        hostJobId: outcome?.hostJobId ?? null,
        attemptId: outcome?.attemptId ?? null,
        consumerVisibleHandles: outcome?.consumerVisibleHandles ?? [],
        governedPulls: outcome?.governedPulls ?? [],
        resolvedBodyDigests: outcome?.resolvedBodyDigests ?? [],
        startingHead: outcome?.startingHead ?? null,
        finalHead: outcome?.finalHead ?? null,
        resultState: outcome?.resultState ?? null,
        verificationState: outcome?.verificationState ?? null,
        promotionState: outcome?.promotionState ?? null,
        completionCause: outcome?.completionCause ?? null,
        infrastructureFailureCause: null,
        reportPath: outcome?.reportPath ?? null,
        transcriptPath: outcome?.transcriptPath ?? null,
        timestamps: { launchedAt: outcome?.launchedAt ?? null, recordedAt: new Date().toISOString() },
        contentDigests: outcome?.contentDigests ?? {},
      });
      journal('TRIAL_RECORDED', { sessionId: session.sessionId, record });
      records.push(record);
      completed.push(session.sessionId);
      machine.transition('TRIAL_RECORDED', { sessionId: session.sessionId });
      onSessionRecorded?.({ session, record, completed: completed.slice() });
      continue;
    }

    /** §5: a load-bearing failure stops the WHOLE matrix, not only the current generation. */
    lastFailure = Object.freeze({
      sessionId: session.sessionId,
      failureClass: classified.classification === 'BEHAVIORAL' ? 'OBSERVABLE_BEHAVIORAL' : 'INFRASTRUCTURE_OR_PROTOCOL',
      cause: classified.causes[0]?.cause ?? 'UNCLASSIFIED',
      detail: classified.causes.map((cause) => cause.cause).join(', '),
      workCannotProgress: classified.workCannotProgress,
    });
    failed.push(Object.freeze({ sessionId: session.sessionId, failureClass: lastFailure.failureClass, cause: lastFailure.cause }));
    journal('SESSION_FAILED', { sessionId: session.sessionId, failureClass: lastFailure.failureClass, cause: lastFailure.cause, causes: classified.causes, threw });
    machine.transition('ABORT_PRESERVED', { sessionId: session.sessionId, cause: lastFailure.cause });
    break;
  }

  /**
   * §5/§14: COMPLETION REQUIRES THE FULL SCHEDULE AND A GREEN POST-MATRIX VALIDITY GATE.
   *
   * The gate is evaluated only when nothing failed, and completion is reported only when the gate is green over
   * every scheduled session. A reduced denominator is never reported as completion — which is exactly the legacy
   * D5 defect.
   */
  let gate = null;
  let matrixCompleted = false;
  if (!machine.terminal) {
    gate = await validityGate({ completed: completed.slice(), records: records.slice(), plannedSessions });
    const allPresent = completed.length === plannedSessions.length && plannedSessions.every((sessionId) => completed.includes(sessionId));
    const gateGreen = gate?.green === true;
    journal('VALIDITY_GATE_RECORDED', { allPresent, gateGreen, detail: gate?.detail ?? null, planned: plannedSessions.length, completed: completed.length });
    if (allPresent && gateGreen) {
      machine.transition('MATRIX_COMPLETE', { sessions: completed.length });
      journal('MATRIX_COMPLETED', { sessions: completed.length });
      matrixCompleted = true;
    } else {
      lastFailure = lastFailure ?? Object.freeze({
        sessionId: null,
        failureClass: 'INFRASTRUCTURE_OR_PROTOCOL',
        cause: allPresent ? 'POST_MATRIX_VALIDITY_GATE_RED' : 'INCOMPLETE_SCHEDULE',
        detail: `allPresent=${String(allPresent)} gateGreen=${String(gateGreen)}`,
      });
      journal('MATRIX_ABORTED', { cause: lastFailure.cause, detail: lastFailure.detail });
      machine.transition('ABORT_PRESERVED', { cause: lastFailure.cause });
    }
  }

  const terminalState = machine.state;
  const manifest = buildAbortManifest({
    runId,
    terminalState,
    plannedSessions,
    completedSessions: completed,
    incompleteSessions: plannedSessions.filter((sessionId) => !completed.includes(sessionId)),
    uncertainSessions: uncertain,
    failure: lastFailure,
  });
  writeJsonAtomic(join(runRoot, ABORT_MANIFEST_FILE), manifest);
  const journalRead = readJournal(journalPath);
  writeJsonAtomic(join(runRoot, 'evidence-index.json'), buildEvidenceIndex({
    runId,
    runRoot,
    journalPath,
    manifestPath: join(runRoot, ABORT_MANIFEST_FILE),
    artifacts: [{ path: journalPath }, { path: join(runRoot, ABORT_MANIFEST_FILE) }, { path: join(runRoot, 'PRESERVE') }],
  }));

  /**
   * §8: the properties are evaluated over the NORMALIZED OBSERVATION, through the SAME evaluator the legacy
   * falsifier uses. That is what makes the two halves of §3's requirement commensurable.
   */
  const observation = buildObservation({
    plannedSessions,
    launches,
    completedSessions: completed,
    failedSessions: failed,
    durableRecords: records.map((record) => ({ sessionId: record.sessionId, kind: 'TRIAL_RECORDED' })),
    terminalEventsSynthesized,
    causalVerdictIssued: false,
    terminalState,
    matrixCompleted,
    postMatrixValidityGate: gate?.green === true,
  });
  const properties = evaluateFailStopProperties(observation);

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'fail-stop matrix run',
    runId,
    runRoot,
    journalPath,
    manifestPath: join(runRoot, ABORT_MANIFEST_FILE),
    machine: machine.snapshot(),
    terminalState,
    plannedSessions: Object.freeze(plannedSessions),
    completedSessions: Object.freeze(completed),
    failedSessions: Object.freeze(failed),
    uncertainSessions: Object.freeze(uncertain),
    records: Object.freeze(records),
    launches: Object.freeze(launches),
    maxLaunchesPerSession: launches.length === 0 ? 0 : Math.max(...Object.values(launches.reduce((counts, entry) => ({ ...counts, [entry.sessionId]: (counts[entry.sessionId] ?? 0) + 1 }), {}))),
    failure: lastFailure,
    validityGate: gate,
    matrixCompleted,
    journal: Object.freeze({ intact: journalRead.JOURNAL_INTACT, total: journalRead.total, interrupted: journalRead.interrupted, temporaryFiles: journalRead.temporaryFiles }),
    observation,
    properties,
    /** §14: a stopped matrix issues no verdict. */
    causalVerdictIssued: false,
    /** §15: nothing was terminalized in a product store. */
    terminalEventsSynthesized: Object.freeze(terminalEventsSynthesized),
    /** §5: the law this run operates under, carried so a report can quote it. */
    classificationLaw: CLASSIFICATION_LAW.law,
    verdictAdmissionPreconditions: VERDICT_ADMISSION_PRECONDITIONS,
  });
}

/** A named constant, so the journal record's field is readable rather than a bare `1`. */
const LAUNCH_LAUNCHES_PER_SESSION = LAUNCH_LAW.MAX_WORKER_LAUNCHES;

/**
 * §4: A RESTART AGAINST A PRESERVED RUN.
 *
 * §4 requires a restarted runner to refuse to resume or replace an uncertain run automatically, and §7 requires a
 * restart to detect an unfinished run. This reads the preserved run's journal and manifest and decides, WITHOUT
 * launching anything, what the restart may do:
 *
 *   COMPLETE          the matrix finished; nothing to resume
 *   ABORTED           a load-bearing failure stopped it; the evidence is preserved and the run must not be
 *                     resumed automatically
 *   UNCERTAIN         it is unknown whether a model call occurred; the run must not be resumed or replaced
 *                     automatically
 *   INTERRUPTED       the journal has a torn tail or a write left in flight; the run is preserved and must not be
 *                     resumed automatically
 *   RESUMABLE         no session was exposed, so the run may be started afresh — and even then, the restart does
 *                     not resume the SAME session, it starts a run that has not been exposed
 */
export function inspectPreservedRun(runRoot) {
  const journalPath = join(runRoot, JOURNAL_FILE);
  const read = readJournal(journalPath);
  const manifestPath = join(runRoot, ABORT_MANIFEST_FILE);
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  const preserveMarker = existsSync(join(runRoot, 'PRESERVE'));
  const exposureIntents = read.records.filter((record) => record.kind === 'EXPOSURE_INTENT_RECORDED');
  const launches = read.records.filter((record) => record.kind === 'WORKER_LAUNCH_RECORDED');
  const trials = read.records.filter((record) => record.kind === 'TRIAL_RECORDED');
  const uncertainRecords = read.records.filter((record) => record.kind === 'SESSION_UNCERTAIN');

  let verdict;
  if (!read.exists) verdict = 'NOT_STARTED';
  else if (read.INTERRUPTED_WRITE_DETECTED || read.WRITE_IN_FLIGHT_DETECTED) verdict = 'INTERRUPTED';
  else if (uncertainRecords.length > 0) verdict = 'UNCERTAIN';
  else if (manifest?.terminalState === 'MATRIX_COMPLETE') verdict = 'COMPLETE';
  else if (manifest !== null) verdict = 'ABORTED';
  else verdict = 'UNKNOWN';

  const exposed = exposureIntents.length > 0 || launches.length > 0;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'preserved run inspection',
    runRoot,
    verdict,
    preserveMarker,
    journalIntact: read.JOURNAL_INTACT,
    interrupted: read.interrupted,
    temporaryFiles: read.temporaryFiles,
    exposureIntents: exposureIntents.length,
    launches: launches.length,
    trials: trials.length,
    uncertain: uncertainRecords.length,
    manifestTerminalState: manifest?.terminalState ?? null,
    /** §4: the restart's decision, and it is a refusal in every case where exposure is possible. */
    mayResumeAutomatically: false,
    mayReplaceAutomatically: false,
    mayStartFresh: !exposed && (verdict === 'NOT_STARTED' || verdict === 'ABORTED'),
    decision: exposed
      ? 'REFUSE: the run recorded exposure-intent or a launch, so a restart must not resume or replace it automatically; the evidence is preserved for an explicit ruling'
      : (verdict === 'NOT_STARTED' ? 'ALLOW_START_FRESH: nothing was exposed' : 'REFUSE: the run is preserved and requires an explicit ruling before any further execution'),
    law: 'a restart must never automatically resume or replace a run in which exposure was possible',
  });
}

export { LAUNCH_LAW };
