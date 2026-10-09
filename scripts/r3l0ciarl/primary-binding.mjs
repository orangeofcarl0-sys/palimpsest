/**
 * R3-L0C-I-A-R-L §3 — PRIMARY-ONLY INPUT DISCIPLINE AND VERIFIED AUTHORIZATION.
 *
 * THE DEFECT THIS CLOSES, measured in L3 and L3b. The pipeline read every measurement as `input.X ?? measured`
 * with NO mode condition, so a PRIMARY run could supply its own plan, closure, pre-exposure checks, validity gate,
 * cost attribution, cost provenance, route configuration and retry counters — and the pipeline would use them
 * instead of deriving anything. And the authorization check accepted any record whose five decisions were true and
 * whose `authority` was a non-empty string, so `authority: 'because I said so'`, with no approved plan and no
 * budget, was a "present" authorization decision.
 *
 * THE REPAIR SEPARATES THE TWO MODES STRUCTURALLY:
 *
 *   DETERMINISTIC   injection is PERMITTED. The deterministic path exists to exercise the machinery, and its
 *                   inputs are fixtures; forbidding injection would make the controls untestable.
 *   PRIMARY         injection is REFUSED for every derived measurement. The pipeline reads the committed plan and
 *                   computes its own closure, containment and validity. A caller-supplied substitute is a refusal
 *                   BEFORE exposure, not a warning.
 *
 * AND THE AUTHORIZATION IS VERIFIED RATHER THAN ACCEPTED. §3 requires the record to identify the approved plan,
 * the paid-run budget and the five decisions, and it requires the AUTHORITY to be verified at the trusted launch
 * boundary. So the record carries `approvedPlanId` and `approvedPlanDigest`, which are compared against the plan
 * actually being executed, and a `paidRunBudget`. An authority string alone fails.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { AUTHORIZATION_REQUIREMENTS, AUTHORIZATION_RECORD_FIELDS, NL, PRIMARY_DERIVED_INPUTS } from './contract.mjs';

/**
 * §3: REFUSE CALLER SUBSTITUTION IN PRIMARY MODE.
 *
 * Returns `{ refused: true, substituted }` when a PRIMARY invocation supplies any derived measurement. The list
 * is §3's own, so a new substitutable input cannot be added without appearing here.
 */
export function enforcePrimaryInputBinding(input) {
  const { mode, provided } = input;
  const supplied = PRIMARY_DERIVED_INPUTS.filter((name) => provided?.[name] !== undefined);
  if (mode !== 'PRIMARY') {
    return Object.freeze({
      refused: false,
      mode,
      injectionPermitted: true,
      supplied: Object.freeze(supplied),
      reason: null,
      law: 'DETERMINISTIC mode permits explicit test injection',
    });
  }
  if (supplied.length === 0) {
    return Object.freeze({ refused: false, mode, injectionPermitted: false, supplied: Object.freeze([]), reason: null, law: 'PRIMARY derives every measurement' });
  }
  return Object.freeze({
    refused: true,
    mode,
    injectionPermitted: false,
    supplied: Object.freeze(supplied),
    reason: `a PRIMARY invocation supplied [${supplied.join(', ')}], which the PRIMARY path must derive itself; a caller-supplied measurement is not an actual measurement`,
    law: 'in PRIMARY mode the pipeline derives its own measurements and refuses caller substitution',
  });
}

/**
 * §3: VERIFY AN EXTERNAL AUTHORIZATION RECORD AT THE TRUSTED LAUNCH BOUNDARY.
 *
 * The record must name the authority, the APPROVED PLAN (id AND digest), a PAID-RUN BUDGET, and all five
 * decisions. The approved plan is compared against the plan actually being executed, so a record for a different
 * plan cannot authorize this run. An authority string alone is insufficient — this is the property L3b measured
 * as absent.
 */
export function verifyAuthorizationRecord(input) {
  const { record, executingPlanId, executingPlanDigest } = input;
  const problems = [];
  if (record === null || record === undefined || typeof record !== 'object') {
    return Object.freeze({ verified: false, problems: Object.freeze(['no authorization record was supplied']), authority: null, detail: 'a boolean signal or an absent record is not an authorization decision' });
  }
  for (const field of AUTHORIZATION_RECORD_FIELDS) {
    if (!(field in record)) problems.push(`the record omits ${field}`);
  }
  if (typeof record.authority !== 'string' || record.authority === '') problems.push('the record names no authority');
  /** §3: the authority must be a DECISION RECORD, not a bare assertion. */
  if (typeof record.authority === 'string' && record.authority !== '' && !/^decision:/.test(record.authority)) {
    problems.push('the authority is a bare string rather than a decision reference; an assertion is not a verified authority');
  }
  if (typeof record.approvedPlanId !== 'string' || record.approvedPlanId === '') problems.push('the record approves no plan id');
  if (typeof record.approvedPlanDigest !== 'string' || record.approvedPlanDigest === '') problems.push('the record approves no plan digest');
  const decisions = record.decisions ?? {};
  const missingDecisions = AUTHORIZATION_REQUIREMENTS.map((entry) => entry.id).filter((id) => decisions[id] !== true);
  if (missingDecisions.length > 0) problems.push(`the record omits or denies [${missingDecisions.join(', ')}]`);
  const budget = record.paidRunBudget;
  if (budget === null || budget === undefined || typeof budget !== 'object') problems.push('the record declares no paid-run budget');
  else {
    if (typeof budget.maxSessions !== 'number' || budget.maxSessions <= 0) problems.push('the paid-run budget declares no positive maxSessions');
    if (typeof budget.currency !== 'string' || budget.currency === '') problems.push('the paid-run budget declares no currency');
  }
  /** §3: the approved plan must be the plan ACTUALLY being executed. */
  if (executingPlanId !== undefined && record.approvedPlanId !== executingPlanId) problems.push(`the record approves plan "${String(record.approvedPlanId)}" but "${String(executingPlanId)}" is executing`);
  if (executingPlanDigest !== undefined && record.approvedPlanDigest !== executingPlanDigest) problems.push('the record approves a different plan digest than the one executing');
  return Object.freeze({
    verified: problems.length === 0,
    problems: Object.freeze(problems),
    authority: record.authority ?? null,
    approvedPlanId: record.approvedPlanId ?? null,
    approvedPlanDigest: record.approvedPlanDigest ?? null,
    paidRunBudget: budget ?? null,
    decisionsVerified: Object.freeze(AUTHORIZATION_REQUIREMENTS.map((entry) => entry.id).filter((id) => decisions[id] === true)),
    verifiedAtLaunchBoundary: true,
    authorityStringAloneIsNotProof: true,
    detail: problems.length === 0
      ? `an external authorization decision for plan ${String(record.approvedPlanId)}, verified against the executing plan at the launch boundary`
      : `the authorization record was refused: ${problems.join('; ')}`,
  });
}

/**
 * §3: RESOLVE THE EXECUTION MODE WITH THE BINDING AND THE AUTHORIZATION ENFORCED TOGETHER.
 *
 * This is the single entry the pipeline uses, so the mode, the binding and the authorization cannot be checked
 * independently and then disagree.
 */
export async function resolveBoundMode(input) {
  const { mode, paidAuthorization, authorizationDecision, provided, executingPlanId, executingPlanDigest } = input;
  const binding = enforcePrimaryInputBinding({ mode, provided });
  if (binding.refused === true) {
    return Object.freeze({ resolved: false, mode, refusedAt: 'PRIMARY_INPUT_BINDING', binding, authorization: null, reason: binding.reason });
  }
  if (mode !== 'PRIMARY') {
    return Object.freeze({ resolved: true, mode, binding, authorization: null, authorizationVerified: false, reason: null });
  }
  const authorization = verifyAuthorizationRecord({ record: authorizationDecision, executingPlanId, executingPlanDigest });
  if (authorization.verified !== true) {
    return Object.freeze({ resolved: false, mode, refusedAt: 'AUTHORIZATION_VERIFICATION', binding, authorization, reason: authorization.detail });
  }
  /** §3: this stage grants no authorization of its own. */
  return Object.freeze({ resolved: true, mode, binding, authorization, authorizationVerified: true, paidAuthorizationSignal: paidAuthorization === true, reason: null });
}

export { NL };
