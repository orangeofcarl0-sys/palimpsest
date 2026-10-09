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
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { BEHAVIORAL_OUTCOME_POLICY, admitOutcome } from './outcome-admission.mjs';

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
 * R3-L0C-I Gate 2: THE CLASSIFIER, DELEGATING THE RESPONSE TO THE ADMISSION SCHEMA.
 *
 * R3-L0C-F's classifier decided BOTH the kind of fact AND the response, and it got the response wrong: it
 * treated an incorrect hidden-oracle vector and a declined capital pull as whole-matrix stops. Those are the
 * study's dependent variables, so stopping on them would destroy the experiment at its first interesting
 * observation.
 *
 * The fix keeps the classification — infrastructure versus behavioral is still a real and useful distinction —
 * and moves the RESPONSE to `admitOutcome`, which is now the single source of the policy. `disposition` is the
 * decision the runner acts on; `classification` is the kind of fact it was made from. Two names because they are
 * two different questions, and conflating them is exactly the error Gate 2 corrects.
 *
 * `classification` is preserved for readers that only want the kind of fact, and it now reports `UNCLASSIFIABLE`
 * rather than `OK` for an outcome that carries no explicit admission evidence — R3-L0C-F returned `OK` for `{}`,
 * which was a default-to-success path.
 */
export function classifyOutcome(outcome, options = {}) {
  const admitted = admitOutcome(outcome, options);

  /**
   * The kind of fact, derived from the same evidence the admission schema read. `INFRASTRUCTURE` for a machinery
   * or treatment fault, `CENSORED` for a Work blockage, `UNCLASSIFIABLE` for absent evidence, and `BEHAVIORAL`
   * for an admissible observation — which, and this is the correction, is a RECORDED outcome rather than a stop.
   */
  let classification;
  if (admitted.disposition === 'UNCLASSIFIABLE') classification = 'UNCLASSIFIABLE';
  else if (admitted.disposition === 'TRIAL_INVALID') classification = 'INFRASTRUCTURE';
  else if (admitted.disposition === 'CENSORED') classification = 'CENSORED';
  else classification = 'BEHAVIORAL';

  return Object.freeze({
    /** The kind of fact. */
    classification,
    /** The response the runner acts on, from the admission schema. */
    disposition: admitted.disposition,
    cause: admitted.cause,
    observations: admitted.observations,
    missingSignals: admitted.missingSignals,
    matrixResponse: admitted.matrixResponse,
    detail: admitted.detail,
    /** Gate 2: an admissible observation is recorded, never a reason to stop. */
    isAStop: admitted.disposition !== 'ADMITTED',
    workCannotProgress: admitted.disposition === 'CENSORED',
    /** §5 of R3-L0C-F, retained: the classification is never license to retry. */
    retryPermitted: false,
    classifiedConservatively: admitted.disposition === 'TRIAL_INVALID',
  });
}

/**
 * R3-L0C-I Gate 1: THE RUN-ID REPLAY GUARD.
 *
 * THE DEFECT THIS CLOSES, measured against R3-L0C-F. Calling `runFailStopMatrix()` twice with the same exposed
 * `runRoot` re-ran the whole schedule and launched every session AGAIN. The journal from the first run was sitting
 * on disk, fully readable, and the second run ignored it. That is a replay of possibly-exposed sessions, which is
 * the one thing the entire fail-stop protocol exists to prevent — and it is reachable by the ordinary act of
 * running the same command twice.
 *
 * WHY THE GUARD IS A CLAIM FILE AND NOT A JOURNAL READ. The journal is the EVIDENCE; the claim is the LOCK. They
 * are separate because a journal read is not atomic: two runners starting together would both read "no exposure
 * yet" and both proceed. The claim is created with `wx` (exclusive), so exactly one runner can hold a run root,
 * and the loser is REFUSED rather than raced.
 *
 * THE THREE OUTCOMES, and the middle one is the important one:
 *
 *   NEW                    no claim exists, so the run root is unspent. The claim is created and the run proceeds.
 *   REFUSED_ALREADY_CLAIMED a claim exists and names a DIFFERENT run id. Another run owns this root.
 *   REFUSED_REPLAY         a claim exists for THIS run id and the journal records exposure. The run has already
 *                          happened; re-running it would re-launch exposed sessions.
 *
 * A claim for this run id with NO exposure recorded is also refused, and that is deliberate rather than strict for
 * its own sake: the run root already carries a journal and a PRESERVE marker, so continuing into it would mix two
 * runs' evidence in one directory. A fresh run belongs in a fresh root.
 */
export const CLAIM_FILE = 'run-claim.json';

/**
 * R3-L0C-I-A §2: THE CLAIM NONCE.
 *
 * §2 adds a requirement the flag could not satisfy: "If the outer entry preclaims the root, ensure the inner
 * Fail-Stop runner verifies the trusted claim rather than merely accepting an unchecked caller flag such as
 * `enforceRunClaim=false`."
 *
 * A FLAG IS NOT PROOF. `enforceRunClaim: false` asserts that somebody else claimed the root; it carries no
 * evidence of WHO, and any caller could set it. The nonce is the evidence: the claimant writes a value it alone
 * generated, and the runner compares the value it was handed against the value on disk. A caller that did not
 * claim cannot produce the nonce, so the check cannot be satisfied by asserting that it was.
 */
export const CLAIM_NONCE_FIELD = 'claimNonce';

/** Gate 1: whether a run root may be claimed, and why not when it may not. */
export function inspectRunClaim(input) {
  const { runRoot, runId } = input;
  const claimPath = join(runRoot, CLAIM_FILE);
  const journalPath = join(runRoot, JOURNAL_FILE);
  const claim = existsSync(claimPath) ? readJsonOrNull(claimPath) : null;
  const journal = readJournal(journalPath);
  const exposureIntents = journal.records.filter((record) => record.kind === 'EXPOSURE_INTENT_RECORDED').length;
  const launches = journal.records.filter((record) => record.kind === 'WORKER_LAUNCH_RECORDED').length;

  if (claim === null) {
    return Object.freeze({
      verdict: 'NEW',
      mayProceed: true,
      claim: null,
      exposureIntents,
      launches,
      journalExists: journal.exists,
      reason: 'no claim exists, so this run root is unspent',
    });
  }
  if (claim.runId !== runId) {
    return Object.freeze({
      verdict: 'REFUSED_ALREADY_CLAIMED',
      mayProceed: false,
      claim,
      exposureIntents,
      launches,
      journalExists: journal.exists,
      reason: `the run root is claimed by run "${String(claim.runId)}", not "${runId}"; a run root belongs to exactly one run`,
    });
  }
  if (exposureIntents > 0 || launches > 0) {
    return Object.freeze({
      verdict: 'REFUSED_REPLAY',
      mayProceed: false,
      claim,
      exposureIntents,
      launches,
      journalExists: journal.exists,
      reason: `run "${runId}" already recorded ${String(exposureIntents)} exposure-intent(s) and ${String(launches)} launch(es) in this run root; re-running it would re-launch possibly-exposed sessions, which is the replay fail-stop exists to prevent`,
    });
  }
  return Object.freeze({
    verdict: 'REFUSED_REPLAY',
    mayProceed: false,
    claim,
    exposureIntents,
    launches,
    journalExists: journal.exists,
    reason: `run "${runId}" already claimed this run root; a fresh run belongs in a fresh root, because continuing here would mix two runs' evidence`,
  });
}

/** Read a JSON file, or null when it is absent or unreadable. */
function readJsonOrNull(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Gate 1: CLAIM A RUN ROOT, ATOMICALLY.
 *
 * The claim is created with the `wx` flag, so the creation IS the mutual exclusion: a second process attempting
 * the same path gets `EEXIST` rather than a successful write. A process that loses the race is refused; it does
 * not overwrite, and it does not proceed.
 */
export function claimRunRoot(input) {
  const { runRoot, runId } = input;
  const inspection = inspectRunClaim({ runRoot, runId });
  if (inspection.mayProceed !== true) return Object.freeze({ claimed: false, inspection });
  const claimPath = join(runRoot, CLAIM_FILE);
  /** R3-L0C-I-A §2: the nonce, so the claim can be VERIFIED later rather than merely asserted. */
  const claimNonce = typeof input.claimNonce === 'string' && input.claimNonce !== '' ? input.claimNonce : randomUUID();
  const record = { schemaVersion: 1, runId, claimedAt: new Date().toISOString(), pid: process.pid, exclusive: true, [CLAIM_NONCE_FIELD]: claimNonce };
  try {
    const handle = openSync(claimPath, 'wx');
    try {
      writeFileSync(handle, `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
    } finally {
      closeSync(handle);
    }
    return Object.freeze({ claimed: true, claim: Object.freeze(record), claimNonce, inspection });
  } catch (error) {
    /**
     * The exclusive create failed, which means another process claimed the root between the inspection and the
     * create. Re-inspect so the refusal names the actual holder rather than reporting a bare filesystem error.
     */
    const raced = inspectRunClaim({ runRoot, runId });
    return Object.freeze({
      claimed: false,
      inspection: raced,
      raceDetail: String(error?.code ?? error?.message ?? error).slice(0, 120),
    });
  }
}

/**
 * R3-L0C-I-A §2: VERIFY A TRUSTED CLAIM AGAINST DISK.
 *
 * This is what replaces the caller flag. It reads the claim from the run root and requires the run id AND the
 * nonce to match, so an outer entry that preclaimed can hand its nonce down and the runner can confirm the
 * claim is real. There is no parameter that disables the check: a caller with no nonce cannot proceed.
 *
 * The three outcomes name what is actually wrong, because "the claim failed" is not a diagnosable state:
 *
 *   TRUSTED                  the on-disk claim names this run and the nonce matches
 *   REFUSED_UNCLAIMED        no claim exists at all
 *   REFUSED_ALREADY_CLAIMED  the on-disk claim names a DIFFERENT run
 *   REFUSED_UNTRUSTED_CLAIM  the claim names this run but the caller's nonce does not match
 *   REFUSED_MALFORMED_CLAIM  the claim does not parse or carries no nonce
 */
export function verifyTrustedClaim(input) {
  const { runRoot, runId, claimNonce } = input;
  const claimPath = join(runRoot, CLAIM_FILE);
  if (!existsSync(claimPath)) {
    return Object.freeze({ trusted: false, verdict: 'REFUSED_UNCLAIMED', reason: 'no claim file exists on disk, so the caller does not hold this run root' });
  }
  let claim;
  try {
    claim = JSON.parse(readFileSync(claimPath, 'utf8'));
  } catch {
    return Object.freeze({ trusted: false, verdict: 'REFUSED_MALFORMED_CLAIM', reason: 'the on-disk claim does not parse' });
  }
  if (typeof claim?.[CLAIM_NONCE_FIELD] !== 'string' || claim[CLAIM_NONCE_FIELD] === '') {
    return Object.freeze({ trusted: false, verdict: 'REFUSED_MALFORMED_CLAIM', reason: 'the on-disk claim carries no claim nonce, so it cannot be verified', claim });
  }
  if (claim.runId !== runId) {
    return Object.freeze({ trusted: false, verdict: 'REFUSED_ALREADY_CLAIMED', reason: `the on-disk claim names run "${String(claim.runId)}", not "${runId}"`, claim });
  }
  if (typeof claimNonce !== 'string' || claimNonce === '' || claim[CLAIM_NONCE_FIELD] !== claimNonce) {
    return Object.freeze({
      trusted: false,
      verdict: 'REFUSED_UNTRUSTED_CLAIM',
      reason: 'the caller-supplied claim nonce does not match the nonce on disk, so the caller cannot prove it holds this run root; a caller flag is not proof of a claim',
      claim,
    });
  }
  return Object.freeze({ trusted: true, verdict: 'TRUSTED', claim, reason: 'the on-disk claim names this run and the nonce matches' });
}

/**
 * §4/§5/§6: RUN A SCHEDULE UNDER FAIL-STOP.
 *
 * The `launch` seam has the shape the real generation child has: it receives `{ session, attempt }` and returns an
 * outcome, and it may THROW (a host interruption) or hang (which the caller models with a timeout of its own).
 * The runner never calls it twice for a session.
 *
 * Gate 1: THE VALIDITY GATE IS REQUIRED, NOT DEFAULTED. R3-L0C-F supplied a green default when the caller omitted
 * it, so forgetting the gate silently produced MATRIX_COMPLETE. A gate that defaults to green is not a gate. The
 * parameter has no default, and its absence is refused before anything is claimed or launched.
 */
export async function runFailStopMatrix(input) {
  const {
    runId,
    runRoot,
    schedule,
    launch,
    validityGate,
    coverageFloor = 0,
    onSessionRecorded = null,
    /** §8: an injectable stop, so a falsifier can interrupt the run between two sessions deterministically. */
    beforeSession = null,
    closureDigest = null,
    /**
     * Gate 1: whether to enforce the run-id claim. A caller that owns a fresh root leaves this on.
     *
     * R3-L0C-I-A §2: `enforceRunClaim: false` IS NO LONGER A BYPASS. An outer entry that preclaimed the root must
     * pass the trusted claim's nonce instead, and the nonce is verified against disk below. The flag is retained
     * only so a caller that owns the root can claim it itself; setting it to false without a valid nonce is
     * REFUSED rather than honoured.
     */
    enforceRunClaim = true,
    /** R3-L0C-I-A §2: the nonce of a claim the CALLER already holds, verified against disk rather than trusted. */
    trustedClaimNonce = null,
  } = input;

  /**
   * Gate 1: FAIL CLOSED BEFORE ANY WORKER LAUNCH.
   *
   * Both checks happen before the journal, the marker and the claim, so a refused run leaves the root exactly as
   * it found it. This is the "fail closed before any worker launch" requirement: nothing is written, nothing is
   * launched, and the refusal names its reason.
   */
  if (typeof validityGate !== 'function') {
    throw new Error('REFUSED: runFailStopMatrix requires an explicit validityGate; a gate that defaults to green is not a gate, and R3-L0C-F let an omitted gate produce MATRIX_COMPLETE');
  }
  /**
   * R3-L0C-I-A §2: THE CLAIM IS VERIFIED, NOT ASSUMED.
   *
   * R3-L0C-F accepted `enforceRunClaim: false` as a statement that somebody else owned the root. That is a flag,
   * and a flag carries no evidence of who set it — so any caller could bypass the replay guard by asserting a
   * claim it did not hold. The repair keeps the flag's convenience for a caller that owns a fresh root and
   * removes its power: a caller that did not claim must present the NONCE the claimant wrote, and the nonce is
   * checked against disk here.
   */
  let claimRecord = null;
  if (enforceRunClaim === true) {
    const claim = claimRunRoot({ runRoot, runId });
    if (claim.claimed !== true) {
      throw new Error(`REFUSED: ${claim.inspection.verdict} — ${claim.inspection.reason}`);
    }
    claimRecord = claim.claim;
  } else {
    const verification = verifyTrustedClaim({ runRoot, runId, claimNonce: trustedClaimNonce });
    if (verification.trusted !== true) {
      throw new Error(`REFUSED: ${verification.verdict} — ${verification.reason}`);
    }
    claimRecord = verification.claim;
  }

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

  journal('RUN_STARTED', { runId, runRoot, plannedSessions, closureDigest, maxWorkerLaunches: LAUNCH_LAW.MAX_WORKER_LAUNCHES, postExposureRetries: LAUNCH_LAW.POST_EXPOSURE_RETRIES, claimNonce: claimRecord?.[CLAIM_NONCE_FIELD] ?? null });
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
    if (classified.disposition === 'TRIAL_INVALID' && classified.cause === 'OUTCOME_UNKNOWN_AFTER_LAUNCH') {
      uncertain.push(session.sessionId);
      journal('SESSION_UNCERTAIN', { sessionId: session.sessionId, reason: outcome?.uncertainReason ?? 'OUTCOME_UNKNOWN', detail: 'the launch was entered and its outcome is unknown; do not infer that no model call occurred' });
      machine.transition('UNCERTAIN_PRESERVED', { sessionId: session.sessionId });
      break;
    }

    /**
     * Gate 2: AN ADMISSIBLE OBSERVATION IS RECORDED AND THE MATRIX CONTINUES.
     *
     * This is the corrected branch. Under R3-L0C-F only an `OK` outcome was recorded; an incorrect oracle vector
     * or a declined pull stopped the whole study. Under Gate 2 those are ADMITTED: the session produced a real,
     * interpretable observation, which is precisely what the experiment exists to collect. The observations are
     * carried on the record so the analysis can read them.
     */
    if (classified.disposition === 'ADMITTED') {
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
      /** Gate 2: the behavioural observations ride ON the record, so the analysis reads them rather than inferring them. */
      const admittedRecord = Object.freeze({
        ...record,
        observations: classified.observations,
        admission: 'ADMITTED',
        /**
         * R3-L0C-I-A §4/§6: THE TREATMENT REALIZATION, carried on the record.
         *
         * The post-matrix gate must be able to check that every session's treatment actually reached the consumer
         * boundary, and the realization is a property of the ADAPTER's measurement rather than of the journal's
         * declared field list. It is therefore carried here, from the outcome, so a reader of the record can see
         * the verdict without re-deriving it from the raw handles.
         */
        treatmentRealization: outcome?.treatmentRealization ?? null,
        /** R3-L0C-I-A §4: the worker's own uptake count, separate from the host's audit count. */
        workerUptakeCount: outcome?.pullLayers?.workerPullObserved?.count ?? null,
        hostResolveAuditCount: outcome?.hostResolveAuditCount ?? null,
      });
      journal('TRIAL_RECORDED', { sessionId: session.sessionId, record: admittedRecord });
      records.push(admittedRecord);
      completed.push(session.sessionId);
      machine.transition('TRIAL_RECORDED', { sessionId: session.sessionId });
      onSessionRecorded?.({ session, record: admittedRecord, completed: completed.slice() });
      continue;
    }

    /**
     * Gate 2: A MACHINERY FAULT OR A CANONICAL-WORK BLOCKAGE STOPS THE WHOLE MATRIX.
     *
     * Only these two dispositions stop. The `CENSORED` case is distinguished on the failure record so the abort
     * manifest can name a preserved censored trajectory rather than a harness fault — the distinction an operator
     * needs, because one is a defect to fix and the other is a legitimate project outcome to report.
     */
    lastFailure = Object.freeze({
      sessionId: session.sessionId,
      failureClass: classified.disposition === 'CENSORED' ? 'CANONICAL_WORK_BLOCKAGE' : 'INFRASTRUCTURE_OR_PROTOCOL',
      cause: classified.cause ?? 'UNCLASSIFIED',
      detail: classified.detail,
      workCannotProgress: classified.disposition === 'CENSORED',
      disposition: classified.disposition,
    });
    failed.push(Object.freeze({ sessionId: session.sessionId, failureClass: lastFailure.failureClass, cause: lastFailure.cause, disposition: classified.disposition }));
    journal('SESSION_FAILED', { sessionId: session.sessionId, failureClass: lastFailure.failureClass, cause: lastFailure.cause, disposition: classified.disposition, threw });
    machine.transition(classified.disposition === 'CENSORED' ? 'ABORT_PRESERVED' : 'ABORT_PRESERVED', { sessionId: session.sessionId, cause: lastFailure.cause, disposition: classified.disposition });
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
