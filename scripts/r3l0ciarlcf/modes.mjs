/**
 * R3-L0C-I-A-R-L-C-F §6 — THE AUTHORITATIVE-PATH GUARD AND MODE RESOLUTION.
 *
 * The prior stages' pipelines remain byte-identical and executable; this guard QUARANTINES them as launch entries
 * rather than pretending they have become impossible. The mode table and the shipped-executable resolver are the
 * prior chain's, imported rather than restated, so the two cannot disagree about which worker a mode requires; but
 * the AUTHORIZATION DECISION is not claimed here — §6 requires it to be verified against a separately controlled
 * trusted source, which lives in `trust-boundary.mjs`.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { NL, REPO_ROOT } from './contract.mjs';

/** §6: this stage's plan id, so the guard and the plan agree on the name. */
export const AUTHORITATIVE_PLAN_ID = 'r3-l0c-iar-lcf-primary-plan';

/** §6: THE AUTHORITATIVE-PATH GUARD. */
export function assertAuthoritativePath(input) {
  const caller = String(input?.caller ?? 'unknown');
  const authorized = input?.authorizedBy === AUTHORITATIVE_PLAN_ID;
  if (authorized !== true) {
    throw new Error(
      `REFUSED: "${caller}" is not the authoritative execution path. R3-L0C-I-A-R-L-C-F's plan (${AUTHORITATIVE_PLAN_ID}) is the only authorized entry point. `
      + 'The R3-L0C-R, R3-L0C-I-A, R3-L0C-I-A-R, R3-L0C-I-A-R-L and R3-L0C-I-A-R-L-C pipelines remain byte-identical and are still executable code; they are QUARANTINED by this guard, not made impossible, and must not be run as though they were the current plan.',
    );
  }
  return Object.freeze({
    authorized: true,
    caller,
    authoritativePath: 'scripts/r3l0ciarlcf/pipeline.mjs',
    priorPipelinesQuarantined: true,
    priorPipelinesStillExecutable: true,
  });
}

/** §6: RESOLVE AN EXECUTION MODE. The mode table is the prior chain's; the AUTHORIZATION DECISION is not claimed here. */
export async function resolveExecutionMode(input) {
  const prior = await import('../r3l0ciarlc/modes.mjs');
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
    decisionVerifiedBy: 'scripts/r3l0ciarlcf/trust-boundary.mjs verifyExternalAuthority',
  });
}

/** §6: resolve the shipped DSH executable, or report why it could not be resolved. */
export async function resolveShippedDshBinAsync() {
  const prior = await import('../r3l0ciarlc/modes.mjs');
  return prior.resolveShippedDshBinAsync();
}

export { NL, REPO_ROOT };
