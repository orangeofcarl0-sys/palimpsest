/**
 * R3-L0C-I-A-R §8 — EXECUTION MODES AND THE AUTHORIZATION BOUNDARY.
 *
 * THE DEFECT THIS CLOSES, measured in G8b. R3-L0C-I-A resolved
 *
 *     paidAuthorizationPresent: mode.id === 'PRIMARY' ? input.paidAuthorization === true : false
 *
 * so a caller-supplied boolean resolved PRIMARY and reported the authorization PRESENT. §8 requires an explicit
 * EXTERNAL authorization decision for five named things — paid model usage, the bounded fail-stop protocol, no
 * automatic retries or replacements, preservation of partially completed invalid runs, and the accepted
 * `PROMPT_NEUTRALITY = LIMITED` constraint. A boolean is an execution CONFIGURATION SIGNAL, not that decision.
 *
 * THE REPAIR SEPARATES THE TWO. `resolveExecutionMode` still resolves the worker a mode requires, and it reports
 * `paidAuthorizationSignalPresent` (the boolean, honestly named) separately from
 * `paidAuthorizationDecisionPresent`, which is FALSE unless a structured, external decision record is supplied.
 * PRIMARY is refused unless that decision is present, and this stage never supplies one.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { AUTHORIZATION_REQUIREMENTS, NL, PAID_AUTHORIZATION_LAW, REPO_ROOT } from './contract.mjs';

/** §8: the two declared modes. */
export const EXECUTION_MODES = Object.freeze([
  Object.freeze({ id: 'DETERMINISTIC', worker: 'ScriptedWorker', externalModelCallPermitted: false, paidAuthorizationRequired: false }),
  Object.freeze({ id: 'PRIMARY', worker: 'the shipped DSH WorkerPort on the frozen omnigate DeepSeek route', externalModelCallPermitted: true, paidAuthorizationRequired: true }),
]);

/**
 * §8: RESOLVE AN EXECUTION MODE, SEPARATING THE SIGNAL FROM THE DECISION.
 *
 * `authorizationDecision` is a structured record naming the five decisions and their authority. A bare boolean is
 * NOT accepted as one: the resolution reports it as a signal and leaves the decision absent.
 */
export async function resolveExecutionMode(input) {
  const requested = String(input.mode ?? '');
  const mode = EXECUTION_MODES.find((entry) => entry.id === requested);
  if (mode === undefined) {
    return Object.freeze({
      resolved: false,
      reason: `"${requested === '' ? '(absent)' : requested}" is not a declared execution mode; the declared modes are [${EXECUTION_MODES.map((entry) => entry.id).join(', ')}]`,
      silentFallbackTaken: false,
      mode: null,
      workerExecutable: null,
      externalModelCallPermitted: null,
    });
  }
  const { SCRIPTED_WORKER } = await import('./primary-adapter.mjs');
  const shipped = mode.id === 'PRIMARY' ? await resolveShippedDshBinAsync() : null;
  const workerExecutable = mode.id === 'PRIMARY' ? shipped?.bin ?? null : SCRIPTED_WORKER;

  /**
   * §8: THE DECISION IS A STRUCTURED RECORD, NOT A BOOLEAN.
   *
   * A boolean may be supplied as a CONFIGURATION SIGNAL, and it is reported as exactly that. The DECISION is
   * present only when a record names all five required decisions with an authority. This stage supplies neither.
   */
  const signal = input.paidAuthorization === true;
  const decision = normalizeAuthorizationDecision(input.authorizationDecision);
  return Object.freeze({
    resolved: workerExecutable !== null,
    reason: null,
    mode: mode.id,
    workerExecutable,
    workerIsScripted: mode.id === 'DETERMINISTIC',
    externalModelCallPermitted: mode.externalModelCallPermitted,
    paidAuthorizationRequired: mode.paidAuthorizationRequired,
    /** §8: the boolean, honestly named as a signal. */
    paidAuthorizationSignalPresent: mode.id === 'PRIMARY' ? signal : false,
    /** §8: the decision, which a boolean cannot supply. */
    paidAuthorizationDecisionPresent: mode.id === 'PRIMARY' ? decision.present : false,
    paidAuthorizationDecision: decision.detail,
    /** §8: a free-text authorization claim is not proof. */
    callerSuppliedAuthorizedByAccepted: false,
    callerSuppliedBooleanIsNotADecision: true,
    silentFallbackTaken: false,
    thisStageEntersPrimary: PAID_AUTHORIZATION_LAW.thisStageEntersPrimary,
    requiredDecisions: AUTHORIZATION_REQUIREMENTS.map((entry) => entry.id),
  });
}

/** §8: a decision record must name all five required decisions with an authority. */
function normalizeAuthorizationDecision(record) {
  if (record === null || record === undefined || typeof record !== 'object') return Object.freeze({ present: false, detail: 'no external authorization decision record was supplied; a boolean signal is not a decision' });
  const required = AUTHORIZATION_REQUIREMENTS.map((entry) => entry.id);
  const decisions = record.decisions ?? {};
  const missing = required.filter((id) => decisions[id] !== true);
  if (missing.length > 0) return Object.freeze({ present: false, detail: `the authorization record omits or denies [${missing.join(', ')}]` });
  if (typeof record.authority !== 'string' || record.authority === '') return Object.freeze({ present: false, detail: 'the authorization record names no authority' });
  return Object.freeze({ present: true, detail: `an external authorization decision naming all five decisions, from ${record.authority}` });
}

/** §8: resolve the shipped DSH executable, or report why it could not be resolved. */
export async function resolveShippedDshBinAsync() {
  try {
    const env = await import('../gates/env.mjs');
    const bin = env.dshBin();
    if (typeof bin !== 'string' || bin === '') return Object.freeze({ bin: null, resolved: false, error: 'the gates resolver returned no path' });
    return Object.freeze({ bin, resolved: true, source: 'scripts/gates/env.mjs dshBin()' });
  } catch (error) {
    return Object.freeze({ bin: null, resolved: false, error: String(error?.message ?? error).slice(0, 200) });
  }
}

/** §2: the authoritative-path guard. The old matrices remain executable; this guard quarantines them. */
export function assertAuthoritativePath(input) {
  const caller = String(input?.caller ?? 'unknown');
  const authorizedBy = input?.authorizedBy;
  const authorized = authorizedBy === 'r3-l0c-iar-primary-plan';
  if (authorized !== true) {
    throw new Error(
      `REFUSED: "${caller}" is not the authoritative execution path. R3-L0C-I-A-R's plan (r3-l0c-iar-primary-plan) is the only authorized entry point. `
      + 'The R3-L0C-R and R3-L0C-I-A matrices remain byte-identical and are still executable code; they are QUARANTINED by this guard, not made impossible, and must not be run as though they were the current plan.',
    );
  }
  return Object.freeze({
    authorized: true,
    caller,
    authoritativePath: 'scripts/r3l0ciar/pipeline.mjs',
    priorMatricesQuarantined: true,
    priorMatricesStillExecutable: true,
  });
}

export { NL, REPO_ROOT, PAID_AUTHORIZATION_LAW };
