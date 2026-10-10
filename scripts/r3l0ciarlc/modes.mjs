/**
 * R3-L0C-I-A-R-L-C §5 — THE AUTHORITATIVE-PATH GUARD AND MODE RESOLUTION.
 *
 * WHY THIS MODULE EXISTS RATHER THAN REUSING THE PRIOR STAGE'S. The prior stage's guard accepts only
 * `r3-l0c-iar-l-primary-plan`, and its plan is SUPERSEDED. The mode table and the shipped-executable resolver are
 * the prior stage's, imported rather than restated, so the two cannot disagree about which worker a mode requires;
 * but the AUTHORIZATION DECISION is not claimed here. §5 requires the authority to be verified against a
 * separately controlled trusted source, which lives in `trust-boundary.mjs`. Keeping a weak claim beside a strict
 * one invites a reader to act on the wrong one, so this module reports the SIGNAL only and leaves the DECISION to
 * the strict verifier.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { NL, REPO_ROOT } from './contract.mjs';

/** §5: this stage's plan id, so the guard and the plan agree on the name. */
export const AUTHORITATIVE_PLAN_ID = 'r3-l0c-iar-lc-primary-plan';

/**
 * §5: THE AUTHORITATIVE-PATH GUARD.
 *
 * The prior stages' pipelines remain byte-identical and executable; this guard QUARANTINES them as launch entries
 * rather than pretending they have become impossible.
 */
export function assertAuthoritativePath(input) {
  const caller = String(input?.caller ?? 'unknown');
  const authorized = input?.authorizedBy === AUTHORITATIVE_PLAN_ID;
  if (authorized !== true) {
    throw new Error(
      `REFUSED: "${caller}" is not the authoritative execution path. R3-L0C-I-A-R-L-C's plan (${AUTHORITATIVE_PLAN_ID}) is the only authorized entry point. `
      + 'The R3-L0C-R, R3-L0C-I-A, R3-L0C-I-A-R and R3-L0C-I-A-R-L pipelines remain byte-identical and are still executable code; they are QUARANTINED by this guard, not made impossible, and must not be run as though they were the current plan.',
    );
  }
  return Object.freeze({
    authorized: true,
    caller,
    authoritativePath: 'scripts/r3l0ciarlc/pipeline.mjs',
    priorPipelinesQuarantined: true,
    priorPipelinesStillExecutable: true,
  });
}

/**
 * §5: RESOLVE AN EXECUTION MODE.
 *
 * The mode table and the shipped-executable resolver are the prior chain's, so a mode resolves the same worker
 * here as there. The AUTHORIZATION DECISION is NOT reported: this module reports the boolean SIGNAL and the mode,
 * and the strict verification is the caller's separate, mandatory step.
 */
export async function resolveExecutionMode(input) {
  const prior = await import('../r3l0ciarl/modes.mjs');
  const resolved = await prior.resolveExecutionMode({ mode: input.mode, paidAuthorization: input.paidAuthorization });
  return Object.freeze({
    resolved: resolved.resolved,
    reason: resolved.reason,
    mode: resolved.mode,
    workerExecutable: resolved.workerExecutable,
    workerIsScripted: resolved.workerIsScripted,
    externalModelCallPermitted: resolved.externalModelCallPermitted,
    paidAuthorizationRequired: resolved.paidAuthorizationRequired,
    /** §5: the SIGNAL, honestly named; the DECISION is verified separately and is not claimed here. */
    paidAuthorizationSignalPresent: resolved.paidAuthorizationSignalPresent ?? (input.paidAuthorization === true),
    paidAuthorizationDecisionPresent: false,
    paidAuthorizationDecisionClaimedHere: false,
    requiredDecisions: resolved.requiredDecisions,
    silentFallbackTaken: resolved.silentFallbackTaken,
    thisStageEntersPrimary: resolved.thisStageEntersPrimary,
    decisionVerifiedBy: 'scripts/r3l0ciarlc/trust-boundary.mjs verifyExternalAuthority',
  });
}

/** §5: resolve the shipped DSH executable, or report why it could not be resolved. */
export async function resolveShippedDshBinAsync() {
  const prior = await import('../r3l0ciarl/modes.mjs');
  return prior.resolveShippedDshBinAsync();
}

export { NL, REPO_ROOT };
