/**
 * R3-L0C-I-A-R-L-C-F-S-H §8 — THE AUTHORITATIVE-PATH GUARD AND MODE RESOLUTION.
 *
 * The prior stages' pipelines remain byte-identical and executable; this guard QUARANTINES them as launch entries
 * rather than pretending they have become impossible. §4 of the prior stage and §12 of this one both require that
 * limitation to be DISCLOSED rather than papered over, so `priorPipelinesStillExecutable` is a value on the result.
 *
 * WHAT THIS STAGE ADDS. §8 requires the full-plan preflight enforcement to dominate the reachable execution path it
 * claims to protect, so the guard is split in two and the second half is the one that matters:
 *
 *   `assertAuthoritativePath`      names this stage's plan and quarantines the prior pipelines.
 *   `assertCommittedPlanIdentity`  READS AND VERIFIES THE COMMITTED PLAN before anything else may run, and it is
 *                                  called by the stage pipeline as its FIRST executable statement — before the claim,
 *                                  before the preparation, before any exposure. A guard that is never called by the
 *                                  execution entry is not an integration proof, so the pipeline's own step list
 *                                  records the guard as step 1 and a test asserts the ordering.
 *
 * The mode table and the shipped-executable resolver are the prior chain's, imported rather than restated, so the
 * two cannot disagree about which worker a mode requires. The AUTHORIZATION DECISION is not claimed here.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { NL, PLAN_ID, REPO_ROOT } from './contract.mjs';

/** §8: this stage's plan id, so the guard and the plan agree on the name. */
export const AUTHORITATIVE_PLAN_ID = PLAN_ID;

/** §8: THE AUTHORITATIVE-PATH GUARD. */
export function assertAuthoritativePath(input) {
  const caller = String(input?.caller ?? 'unknown');
  const authorized = input?.authorizedBy === AUTHORITATIVE_PLAN_ID;
  if (authorized !== true) {
    throw new Error(
      `REFUSED: "${caller}" is not the authoritative execution path. R3-L0C-I-A-R-L-C-F-S-H's plan (${AUTHORITATIVE_PLAN_ID}) is the only authorized entry point. `
      + 'The R3-L0C-R, R3-L0C-I-A, R3-L0C-I-A-R, R3-L0C-I-A-R-L, R3-L0C-I-A-R-L-C, R3-L0C-I-A-R-L-C-F and R3-L0C-I-A-R-L-C-F-S pipelines remain byte-identical and are still executable code; they are QUARANTINED by this guard, not made impossible, and must not be run as though they were the current plan.',
    );
  }
  return Object.freeze({
    authorized: true,
    caller,
    authoritativePath: 'scripts/r3l0ciarlcfsh/pipeline.mjs',
    priorPipelinesQuarantined: true,
    priorPipelinesStillExecutable: true,
  });
}

/**
 * §8: THE MANDATORY FULL-PLAN PREFLIGHT GUARD.
 *
 * It reads and verifies the committed plan by its full content digest, its committed Git blob, its schema and id, and
 * its closure binding — WITHOUT regenerating it. It returns a refusal object rather than throwing, so the pipeline
 * can report a structured refusal, and it is designed to be the FIRST thing the pipeline does.
 */
export async function assertCommittedPlanIdentity(input = {}) {
  const { readAndVerifyCommittedPlan } = await import('./committed-plan.mjs');
  const verification = await readAndVerifyCommittedPlan(input);
  return Object.freeze({
    guard: 'COMMITTED_PLAN_PREFLIGHT',
    passed: verification.verified === true,
    verification,
    refusesBefore: Object.freeze(['ACQUIRE_EXCLUSIVE_RUN_ROOT', 'PREPARE_WORLDS_STORES_PROFILES', 'EXPOSURE_INTENT', 'WORKER_LAUNCH']),
    dominatesExecutionEntry: true,
    regeneratesPlan: false,
    reason: verification.verified === true
      ? null
      : `the committed plan did not verify: [${verification.problems.join('; ')}]`,
  });
}

/** §8: RESOLVE AN EXECUTION MODE. The mode table is the prior chain's; the AUTHORIZATION DECISION is not claimed here. */
export async function resolveExecutionMode(input) {
  const prior = await import('../r3l0ciarlcf/modes.mjs');
  const resolved = await prior.resolveExecutionMode({ mode: input.mode, paidAuthorization: input.paidAuthorization });
  return Object.freeze({
    resolved: resolved.resolved,
    reason: resolved.reason,
    mode: resolved.mode,
    workerExecutable: resolved.workerExecutable,
    workerIsScripted: resolved.workerIsScripted,
    externalModelCallPermitted: resolved.externalModelCallPermitted,
    paidAuthorizationRequired: resolved.paidAuthorizationRequired,
    paidAuthorizationSignalPresent: resolved.paidAuthorizationSignalPresent ?? (input.paidAuthorization === true),
    paidAuthorizationDecisionPresent: false,
    paidAuthorizationDecisionClaimedHere: false,
    requiredDecisions: resolved.requiredDecisions,
    silentFallbackTaken: resolved.silentFallbackTaken,
    thisStageEntersPrimary: resolved.thisStageEntersPrimary,
    decisionVerifiedBy: 'scripts/r3l0ciarlcfs/authorization-verdict.mjs reduceAuthorizationVerdict',
  });
}

/** §8: resolve the shipped DSH executable, or report why it could not be resolved. */
export async function resolveShippedDshBinAsync() {
  const prior = await import('../r3l0ciarlcf/modes.mjs');
  return prior.resolveShippedDshBinAsync();
}

export { NL, REPO_ROOT };
