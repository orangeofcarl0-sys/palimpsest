/**
 * R3-L0C-I-A-R-L-C-F-S §7 Gate S5 — AUTHORIZATION AND SPENDING-VERDICT CONSISTENCY.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlAuthorizationVerdictInconsistency` against
 * the real `8bf8d42` code: `verifyExternalAuthority` pushed the absence of host spending enforcement onto its
 * `problems` list and then computed `VERIFIED` from `schema.valid && planBound && planIdBound && budget.sessionScopeCoverage`
 * — WITHOUT requiring enforcement. A descriptive problem list and the final boolean therefore disagreed, and a
 * synthetically verified source produced `verified: true` with an unsatisfied mandatory condition.
 *
 * THE MODEL §7 REQUIRES, KEPT SEPARATE. §7 names seven things that must not be collapsed: schema validity,
 * independently verified external authority, committed full-plan identity, authorized session scope, authorized
 * monetary limit, ACTUAL Host Spending Enforcement, and current launch permission. Each is its own value here.
 *
 * THE MANDATORY CONDITIONS. §7: "`AUTHORIZATION_VERIFIED` must not be true unless" every one of eight conditions
 * holds, ending with "no mandatory authorization condition is false or unknown". So the reducer computes the eight,
 * and the verdict is `VERIFIED` only when ALL of them are `true` — the same set the problem list describes.
 *
 * WHAT THIS STAGE DOES NOT DO. §7: "No real authorization source may be created in this stage. No paid model request
 * may be made." And `CURRENT_LAUNCH_PERMISSION` must remain false even when a helper's synthetic test satisfies every
 * schema condition. So the reducer carries `CURRENT_LAUNCH_PERMISSION: false` unconditionally, and a TEST-FIXTURE
 * trusted source is accepted ONLY as an explicit test input, which cannot open a launch.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import {
  AUTHORITY_CONCEPTS, AUTHORIZATION_CONDITIONS, AUTHORIZATION_VERDICTS, NL,
} from './contract.mjs';

/** §7: the trusted authority source, imported from the reused prior-stage module rather than restated. */
async function trustedSourceOf(input) {
  if (input.trustedSource !== undefined) return input.trustedSource;
  const { trustedAuthoritySource } = await import('../r3l0ciarlcf/trust-boundary.mjs');
  return trustedAuthoritySource();
}

/** §7: schema validity, from the reused prior-stage check. */
async function schemaOf(record) {
  const { schemaValidity } = await import('../r3l0ciarlcf/trust-boundary.mjs');
  return schemaValidity(record);
}

/** §7: the budget semantics, from the reused prior-stage module, so the five concepts keep one definition. */
async function budgetOf(record) {
  const { budgetSemantics } = await import('../r3l0ciarlcf/trust-boundary.mjs');
  return budgetSemantics(record);
}

/** §7: the plan binding, from the reused prior-stage module. */
async function bindingOf(plan) {
  const { planBinding } = await import('../r3l0ciarlcf/trust-boundary.mjs');
  return planBinding(plan);
}

/**
 * §7: REDUCE THE AUTHORIZATION VERDICT FROM THE EIGHT MANDATORY CONDITIONS.
 *
 * Every condition is computed, then the verdict requires ALL of them. A condition that is FALSE or UNKNOWN makes the
 * verdict `REFUSED` (or `AUTHORITY_NOT_ESTABLISHED` when there is no trusted source at all), and the same conditions
 * are reported in `problems` — so the two can no longer disagree.
 */
export async function reduceAuthorizationVerdict(input) {
  const { record = null, plan = null } = input;
  const trustedSource = await trustedSourceOf(input);
  const schema = await schemaOf(record);
  const budget = await budgetOf(record);
  const binding = await bindingOf(plan);

  const expectedPlanDigest = binding.planContentDigest;
  const planBound = typeof record?.approvedPlanDigest === 'string' && record.approvedPlanDigest !== ''
    && expectedPlanDigest !== null && record.approvedPlanDigest === expectedPlanDigest;
  const planIdBound = typeof record?.approvedPlanId === 'string' && record.approvedPlanId !== ''
    && plan?.planId !== undefined && record.approvedPlanId === plan.planId;

  /** §7: the authority resolves ONLY against a TRUSTED source; presence outside the repository is not trust. */
  let authorityVerified = false;
  let authorityReason = null;
  if (trustedSource.available !== true) authorityReason = trustedSource.reason;
  else if (trustedSource.verified !== true) authorityReason = trustedSource.reason;
  else {
    const decisions = trustedSource.source?.decisions ?? {};
    const authorityId = trustedSource.source?.authority ?? null;
    authorityVerified = typeof authorityId === 'string' && authorityId !== '' && record?.authority === authorityId && decisions[record?.authority] === true;
    authorityReason = authorityVerified
      ? `the authority "${String(record?.authority)}" resolves against the separately controlled trusted source at ${String(trustedSource.path)}`
      : `the authority "${String(record?.authority)}" does not resolve against the trusted source at ${String(trustedSource.path)}`;
  }

  const hostEnforced = budget.concepts.ACTUAL_HOST_ENFORCED_BUDGET === true;

  /**
   * §7: THE EIGHT MANDATORY CONDITIONS, computed as named values.
   *
   * `NO_FALSE_OR_UNKNOWN_CONDITION` is deliberately last and is derived from the other seven, so a condition added
   * later cannot silently escape it.
   */
  const baseConditions = Object.freeze({
    SCHEMA_VALIDITY: schema.valid === true,
    EXTERNALLY_VERIFIED_AUTHORITY: authorityVerified === true,
    APPROVED_PLAN_ID_MATCH: planIdBound === true,
    APPROVED_FULL_PLAN_DIGEST_MATCH: planBound === true,
    AUTHORIZED_SESSION_SCOPE: budget.sessionScopeCoverage === true,
    EXPLICIT_MONETARY_LIMIT: budget.concepts.MAX_AUTHORIZED_MONETARY_EXPENDITURE === true,
    PROVEN_HOST_SPEND_ENFORCEMENT: hostEnforced === true,
  });
  const allBaseHold = Object.values(baseConditions).every((value) => value === true);
  const conditions = Object.freeze({ ...baseConditions, NO_FALSE_OR_UNKNOWN_CONDITION: allBaseHold });

  /** §7: the problems are derived FROM the conditions, so the list and the verdict cannot disagree. */
  const problems = [];
  if (baseConditions.SCHEMA_VALIDITY !== true) for (const problem of schema.problems) problems.push(problem);
  if (baseConditions.APPROVED_FULL_PLAN_DIGEST_MATCH !== true) problems.push(`the record approves plan digest ${String(record?.approvedPlanDigest).slice(0, 16)} but the executing plan's FULL content digest is ${String(expectedPlanDigest).slice(0, 16)}`);
  if (baseConditions.APPROVED_PLAN_ID_MATCH !== true) problems.push(`the record approves plan id "${String(record?.approvedPlanId)}" but "${String(plan?.planId)}" is executing`);
  if (baseConditions.AUTHORIZED_SESSION_SCOPE !== true) problems.push(`the declared budget of ${String(budget.maxSessions)} session(s) does not cover the frozen ${String(budget.requiredSessions)}-session scope`);
  if (baseConditions.EXPLICIT_MONETARY_LIMIT !== true) problems.push('the record declares no explicit maximum authorized monetary expenditure, so its ceiling is a session count rather than a spending limit');
  if (baseConditions.PROVEN_HOST_SPEND_ENFORCEMENT !== true) problems.push(`no host spending enforcement exists: ${budget.hostEnforcement.reason}`);
  if (baseConditions.EXTERNALLY_VERIFIED_AUTHORITY !== true) problems.push(`the authority is not externally verified: ${String(authorityReason)}`);

  const verified = AUTHORIZATION_CONDITIONS.every((entry) => conditions[entry.id] === true);
  const verdict = verified === true
    ? AUTHORIZATION_VERDICTS.VERIFIED
    : (trustedSource.available !== true ? AUTHORIZATION_VERDICTS.NOT_ESTABLISHED : AUTHORIZATION_VERDICTS.REFUSED);

  /** §7: the seven concepts, each its own value, plus the launch permission which stays FALSE in this stage. */
  const concepts = Object.freeze({
    SCHEMA_VALIDITY: schema.valid === true,
    EXTERNALLY_VERIFIED_AUTHORITY: authorityVerified === true,
    COMMITTED_FULL_PLAN_IDENTITY: planBound === true && planIdBound === true,
    AUTHORIZED_SESSION_SCOPE: budget.sessionScopeCoverage === true,
    AUTHORIZED_MONETARY_LIMIT: budget.concepts.MAX_AUTHORIZED_MONETARY_EXPENDITURE === true,
    ACTUAL_HOST_SPEND_ENFORCEMENT: hostEnforced === true,
    CURRENT_LAUNCH_PERMISSION: false,
  });

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S',
    kind: 'authorization verdict reduction',
    verdict,
    verified,
    conditions,
    mandatoryConditions: AUTHORIZATION_CONDITIONS.map((entry) => entry.id),
    /** §7: every mandatory condition must hold, so a false-or-unknown condition cannot be reported VERIFIED. */
    everyMandatoryConditionRequired: true,
    allMandatoryConditionsHold: verified,
    unsatisfiedConditions: Object.freeze(AUTHORIZATION_CONDITIONS.filter((entry) => conditions[entry.id] !== true).map((entry) => entry.id)),
    concepts,
    conceptIds: AUTHORITY_CONCEPTS,
    problems: Object.freeze(problems),
    /** §7: the consistency property, stated as a value so a test can assert it directly. */
    verdictAgreesWithProblems: (verified === true) === (problems.length === 0),
    hostSpendEnforcement: budget.SPEND_ENFORCEMENT,
    hostEnforcement: budget.hostEnforcement,
    budget,
    schema,
    binding,
    planContentDigest: expectedPlanDigest,
    trustedSource: Object.freeze({ available: trustedSource.available, verified: trustedSource.verified === true, path: trustedSource.path ?? null, reason: trustedSource.reason ?? null, testFixture: trustedSource.testFixture === true }),
    /** §7: the honesty flags. */
    thisStageProvidesAuthorization: false,
    syntacticallyValidDecisionIsTrustedAuthority: false,
    authorityStringAloneIsNotProof: true,
    testFixtureCannotOpenLaunch: trustedSource.testFixture === true ? concepts.CURRENT_LAUNCH_PERMISSION === false : true,
    launchProhibited: true,
    detail: verified === true
      ? `an external authorization decision for plan ${String(record?.approvedPlanId)}, verified against a separately controlled trusted source with proven spending enforcement`
      : `the authorization is not verified (${verdict}): ${String(authorityReason ?? 'a mandatory condition is unsatisfied')}`,
    law: 'AUTHORIZATION_VERIFIED requires every mandatory condition including PROVEN host spending enforcement and no false-or-unknown condition; the problem list is derived from the same conditions, so it cannot disagree with the verdict',
  });
}

export { NL };
