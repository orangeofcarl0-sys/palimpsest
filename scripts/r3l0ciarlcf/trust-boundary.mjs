/**
 * R3-L0C-I-A-R-L-C-F §6 Gate F4 — THE TRUST, AUTHORITY AND BUDGET BOUNDARY.
 *
 * THE DEFECTS THIS CLOSES, both measured by `baseline/legacy-controls.mjs controlPartialPlanAndBudget`:
 *
 *   1. the plan binding used the SELECTED-projection digest, so an authorization approving a materially different
 *      execution route could still bind (see `plan-identity.mjs` for the correction);
 *   2. the `ENFORCEABLE_BUDGET` concept was computed as `coversFrozenScope && enforceable === 'DECLARED_ONLY'`, so
 *      a DECLARED_ONLY budget was reported as an ENFORCEABLE one. §6: "`DECLARED_ONLY` must not imply
 *      `ENFORCEABLE_BUDGET = true`."
 *
 * THE REPAIR SEPARATES FIVE THINGS §6 NAMES, and each is a value on the result:
 *
 *   DECLARED_BUDGET                    a session ceiling and a currency were declared
 *   SESSION_SCOPE_COVERAGE             the ceiling covers the frozen 16-session scope
 *   MAX_AUTHORIZED_MONETARY_EXPENDITURE  a maximum authorized MONETARY amount, not a session count
 *   ACTUAL_HOST_ENFORCED_BUDGET        the host actually enforces a spending limit
 *   CURRENT_LAUNCH_PERMISSION          the launch boundary is open for this run right now
 *
 * A DECLARED BUDGET IS NOT AN ENFORCED ONE, and this module has no host enforcement mechanism to offer, so
 * `ACTUAL_HOST_ENFORCED_BUDGET` is FALSE and `SPEND_ENFORCEMENT` is `NOT_ESTABLISHED`. §6 requires that reported
 * plainly rather than hidden behind a `true`.
 *
 * WHAT THIS STAGE DOES NOT DO. §6: "Do not create paid authorization." and "This stage must not implement a
 * self-approved trust root." So no trusted authority source is created, a fabricated `decision:` reference creates
 * no permission, and with no separately verifiable issuer the verdict is `EXTERNAL_AUTHORITY = NOT_ESTABLISHED`.
 * §6: "If a future paid run requires an independent trusted-authority and budget-enforcement implementation, report
 * that as a separate blocker for a later explicitly authorized stage."
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs';

import {
  AUTHORITY_TRUST, AUTHORIZATION_RECORD_FIELDS, AUTHORIZATION_REQUIREMENTS, BUDGET_CONCEPTS, NL, REPO_ROOT,
} from './contract.mjs';
import { fullPlanDigest } from './plan-identity.mjs';

/** §6: the frozen session scope a budget must cover. */
export const FROZEN_SESSION_SCOPE = 16;

/** §6: the trusted authority source's own path, outside the run root, so a run cannot supply its own authority. */
export const TRUSTED_AUTHORITY_ENV = 'PALIMPSEST_AUTHORITY_SOURCE';

/** §6: the source the corpus and the capital come from, resolved from the frozen plan rather than restated. */
export const PLAN_BINDING_FIELD = 'planContentDigest';

/* ================================================================ §6 the plan binding */

/**
 * §6: BIND THE PLAN BY ITS FULL CONTENT DIGEST.
 *
 * The digest is the FULL-plan digest from `plan-identity.mjs`, which is separate from the ExecutionClosureDigest
 * and free of self-reference.
 */
export function planBinding(plan) {
  const digest = fullPlanDigest(plan);
  const closureDigest = plan?.executionClosure?.executionClosureDigest ?? null;
  return Object.freeze({
    planContentDigest: digest,
    executionClosureDigest: closureDigest,
    planId: plan?.planId ?? null,
    /** §6: the plan binding is NOT the closure binding, and a record approving one must not be accepted for the other. */
    planContentDigestIsSeparateFromClosure: digest !== null && digest !== closureDigest,
    planBindingIsSelfReferential: false,
    coversEveryPlanFieldExceptItsOwn: true,
    law: 'the authorization record binds the plan by its FULL content digest, which is separate from the execution closure and free of self-reference',
  });
}

/* ================================================================ §6 the trusted authority source */

/**
 * §6: RESOLVE THE SEPARATELY CONTROLLED TRUSTED AUTHORITY SOURCE.
 *
 * A trusted source must be (a) configured out of band and (b) OUTSIDE the run root, so a run cannot write the
 * decision that authorizes it. This repository has no such source and this stage does not create one — creating one
 * and then trusting it would be self-signing. So the resolution reports absence.
 */
export function trustedAuthoritySource() {
  const configured = process.env[TRUSTED_AUTHORITY_ENV]?.trim();
  if (configured === undefined || configured === '') {
    return Object.freeze({
      available: false, path: null,
      reason: `no trusted authority source is configured (${TRUSTED_AUTHORITY_ENV} is unset); this stage does not create one, because creating a source and then trusting it would be self-signing`,
    });
  }
  const path = configured;
  if (!existsSync(path)) return Object.freeze({ available: false, path, reason: `the configured trusted authority source does not exist at ${path}` });
  /** §6: a source INSIDE the repository is not separately controlled, so it is refused rather than trusted. */
  const normalized = path.replace(/\\/gu, '/');
  const root = String(REPO_ROOT).replace(/\\/gu, '/');
  if (normalized.startsWith(root)) {
    return Object.freeze({ available: false, path, reason: `the configured source at ${path} is INSIDE the repository, so it is not separately controlled and cannot be trusted` });
  }
  try {
    const text = readFileSync(path, 'utf8');
    const parsed = JSON.parse(text);
    /**
     * §6: EXISTENCE OUTSIDE THE REPOSITORY IS NOT TRUST. §6 requires "separately verifiable issuer identity,
     * independent control of the authorization source, approved plan scope, and revocation/validity rules". A file
     * that merely exists outside the repository supplies none of those, so it is reported as PRESENT but not
     * VERIFIED — and this stage implements no self-approved trust root to close the gap.
     */
    return Object.freeze({
      available: true, path, source: Object.freeze({ ...parsed }),
      issuerIdentityVerifiable: false,
      independentlyControlled: false,
      revocationRulesPresent: false,
      verified: false,
      reason: 'a file outside the repository exists, but this stage implements no issuer-identity verification, no independent-control proof and no revocation rules, so the source is PRESENT but NOT TRUSTED',
    });
  } catch (error) {
    return Object.freeze({ available: false, path, reason: `the configured source does not parse: ${String(error?.message ?? error).slice(0, 200)}` });
  }
}

/* ================================================================ §6 schema validity */

/** §6: SCHEMA VALIDITY. A shape check, and explicitly not an authority check. */
export function schemaValidity(record) {
  const problems = [];
  if (record === null || record === undefined || typeof record !== 'object') {
    return Object.freeze({ valid: false, problems: Object.freeze(['no authorization record was supplied']), shapeIsNotAuthority: true });
  }
  for (const field of AUTHORIZATION_RECORD_FIELDS) if (!(field in record)) problems.push(`the record omits ${field}`);
  if (typeof record.authority !== 'string' || record.authority === '') problems.push('the record names no authority');
  if (typeof record.approvedPlanId !== 'string' || record.approvedPlanId === '') problems.push('the record approves no plan id');
  if (typeof record.approvedPlanDigest !== 'string' || record.approvedPlanDigest === '') problems.push('the record approves no plan digest');
  const decisions = record.decisions ?? {};
  const missing = AUTHORIZATION_REQUIREMENTS.map((entry) => entry.id).filter((id) => decisions[id] !== true);
  if (missing.length > 0) problems.push(`the record omits or denies [${missing.join(', ')}]`);
  const budget = record.paidRunBudget;
  if (budget === null || budget === undefined || typeof budget !== 'object') problems.push('the record declares no paid-run budget');
  else {
    if (typeof budget.maxSessions !== 'number' || budget.maxSessions <= 0) problems.push('the paid-run budget declares no positive maxSessions');
    if (typeof budget.currency !== 'string' || budget.currency === '') problems.push('the paid-run budget declares no currency');
  }
  return Object.freeze({
    valid: problems.length === 0,
    problems: Object.freeze(problems),
    shapeIsNotAuthority: true,
    decisionPrefixIsNotVerification: true,
  });
}

/* ================================================================ §6 the five separated budget concepts */

/**
 * §6: THE FIVE BUDGET CONCEPTS, EACH ITS OWN VALUE.
 *
 * The contradiction this corrects: the prior stage computed `ENFORCEABLE_BUDGET` as
 * `coversFrozenScope && enforceable === 'DECLARED_ONLY'`, which made a declared-only budget ENFORCEABLE. Here the
 * five are separate, `ACTUAL_HOST_ENFORCED_BUDGET` is FALSE because this stage has no host enforcement mechanism,
 * and `CURRENT_LAUNCH_PERMISSION` is FALSE because §6 keeps the PRIMARY launch closed.
 */
export function budgetSemantics(record) {
  const budget = record?.paidRunBudget ?? null;
  const declared = budget !== null && typeof budget === 'object';
  const maxSessions = declared && typeof budget.maxSessions === 'number' ? budget.maxSessions : null;
  const sessionScopeCoverage = maxSessions !== null && maxSessions >= FROZEN_SESSION_SCOPE;
  const maxAuthorizedMonetaryExpenditure = declared && typeof budget.maxAmount === 'number' && budget.maxAmount > 0 ? budget.maxAmount : null;
  const hostEnforcement = detectHostSpendEnforcement();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F',
    kind: 'budget semantics',
    concepts: Object.freeze({
      DECLARED_BUDGET: declared,
      SESSION_SCOPE_COVERAGE: sessionScopeCoverage,
      MAX_AUTHORIZED_MONETARY_EXPENDITURE: maxAuthorizedMonetaryExpenditure !== null,
      ACTUAL_HOST_ENFORCED_BUDGET: hostEnforcement.enforced,
      CURRENT_LAUNCH_PERMISSION: false,
    }),
    declared,
    maxSessions,
    requiredSessions: FROZEN_SESSION_SCOPE,
    sessionScopeCoverage,
    maxAuthorizedMonetaryExpenditure,
    currency: budget?.currency ?? null,
    /** §6: a declared ceiling is NOT a host-enforced one, and this stage has no spend enforcement to offer. */
    hostEnforcement,
    /** §6: the semantic contradiction, stated as the property that must NOT hold. */
    declaredOnlyImpliesEnforceable: false,
    declaredOnlyIsNotEnforceable: true,
    SPEND_ENFORCEMENT: hostEnforcement.enforced ? 'PASS' : 'NOT_ESTABLISHED',
    law: 'a declared budget is not an enforceable spending authority; the five budget concepts are separate, and a session ceiling is not a monetary expenditure limit',
  });
}

/**
 * §6: DETECT A HOST SPEND-ENFORCEMENT MECHANISM.
 *
 * §6: "No caller-provided `maxSessions`, budget object or authority string may stand in for an enforceable spending
 * limit." So the detection looks for an actual host mechanism rather than reading a caller's claim. This repository
 * has none, and the function reports that rather than assuming one.
 */
export function detectHostSpendEnforcement() {
  return Object.freeze({
    enforced: false,
    mechanism: null,
    searchedFor: Object.freeze(['a host-side spend limiter', 'a provider-side hard budget cap', 'a host configuration that refuses a request above a monetary ceiling']),
    reason: 'no host-side or provider-side spending-enforcement mechanism exists in this repository, and this stage does not implement one; a caller-declared session ceiling is not an enforced monetary limit',
  });
}

/* ================================================================ §6 the external authority */

/**
 * §6: VERIFY THE EXTERNAL AUTHORITY.
 *
 * The verdict is `VERIFIED` only when a separately controlled trusted source resolves the record's authority AND
 * the source supplies a verifiable issuer identity, independent control and revocation rules. With no such source —
 * this repository's state — the verdict is `AUTHORITY_NOT_ESTABLISHED`, and the launch permission stays `false`. A
 * syntactically valid `decision:` string alone is `REFUSED` at the authority stage rather than accepted.
 */
export function verifyExternalAuthority(input) {
  const { record, plan, trustedSource = trustedAuthoritySource() } = input;
  const schema = schemaValidity(record);
  const binding = planBinding(plan);
  const budget = budgetSemantics(record);
  const expectedPlanDigest = binding.planContentDigest;
  const planBound = typeof record?.approvedPlanDigest === 'string' && record.approvedPlanDigest !== '' && expectedPlanDigest !== null && record.approvedPlanDigest === expectedPlanDigest;
  const planIdBound = typeof record?.approvedPlanId === 'string' && record.approvedPlanId !== '' && plan?.planId !== undefined && record.approvedPlanId === plan.planId;

  /** §6: the authority resolves ONLY against a TRUSTED source. Presence outside the repository is not trust. */
  let authorityVerified = false;
  let authorityReason;
  if (trustedSource.available !== true) {
    authorityReason = trustedSource.reason;
  } else if (trustedSource.verified !== true) {
    authorityReason = trustedSource.reason;
  } else {
    const decisions = trustedSource.source?.decisions ?? {};
    const authorityId = trustedSource.source?.authority ?? null;
    authorityVerified = typeof authorityId === 'string' && authorityId !== '' && record?.authority === authorityId && decisions[record?.authority] === true;
    authorityReason = authorityVerified
      ? `the authority "${String(record?.authority)}" resolves against the separately controlled trusted source at ${String(trustedSource.path)}`
      : `the authority "${String(record?.authority)}" does not resolve against the trusted source at ${String(trustedSource.path)}`;
  }

  const problems = [...schema.problems];
  if (!planBound) problems.push(`the record approves plan digest ${String(record?.approvedPlanDigest).slice(0, 16)} but the executing plan's FULL content digest is ${String(expectedPlanDigest).slice(0, 16)}`);
  if (!planIdBound) problems.push(`the record approves plan id "${String(record?.approvedPlanId)}" but "${String(plan?.planId)}" is executing`);
  if (!budget.sessionScopeCoverage) problems.push(`the declared budget of ${String(budget.maxSessions)} session(s) does not cover the frozen ${String(FROZEN_SESSION_SCOPE)}-session scope`);
  if (budget.concepts.ACTUAL_HOST_ENFORCED_BUDGET !== true) problems.push(`no host spending enforcement exists: ${budget.hostEnforcement.reason}`);
  if (authorityVerified !== true) problems.push(`the authority is not externally verified: ${String(authorityReason)}`);

  const verdict = authorityVerified !== true
    ? (trustedSource.available !== true ? AUTHORITY_TRUST.NOT_ESTABLISHED : AUTHORITY_TRUST.REFUSED)
    : (schema.valid && planBound && planIdBound && budget.sessionScopeCoverage ? AUTHORITY_TRUST.VERIFIED : AUTHORITY_TRUST.REFUSED);

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F',
    kind: 'external authority verification',
    verdict,
    verified: verdict === AUTHORITY_TRUST.VERIFIED,
    concepts: Object.freeze({
      SCHEMA_VALIDITY: schema.valid,
      EXTERNALLY_VERIFIED_AUTHORITY: authorityVerified,
      AUTHORIZED_PROSPECTIVE_PLAN: planBound && planIdBound,
      ENFORCEABLE_BUDGET: budget.concepts.ACTUAL_HOST_ENFORCED_BUDGET,
      CURRENT_LAUNCH_PERMISSION: false,
    }),
    schema,
    budget,
    binding,
    planContentDigest: expectedPlanDigest,
    planContentDigestIsSeparateFromClosure: binding.planContentDigestIsSeparateFromClosure,
    planBindingIsSelfReferential: false,
    trustedSource: Object.freeze({ available: trustedSource.available, verified: trustedSource.verified === true, path: trustedSource.path ?? null, reason: trustedSource.reason ?? null }),
    problems: Object.freeze(problems),
    /** §6: this stage grants no authorization and opens no launch. */
    thisStageProvidesAuthorization: false,
    syntacticallyValidDecisionIsTrustedAuthority: false,
    authorityStringAloneIsNotProof: true,
    launchProhibited: true,
    detail: verdict === AUTHORITY_TRUST.VERIFIED
      ? `an external authorization decision for plan ${String(record?.approvedPlanId)}, verified against a separately controlled trusted source`
      : `the authorization is not verified (${verdict}): ${String(authorityReason)}`,
  });
}

/* ================================================================ §6 the PRIMARY input binding */

/** §6: the values a PRIMARY run must NOT take from its caller. */
export const TRUSTED_HOST_INPUTS = Object.freeze(['dshHome', 'installHostBundle', 'verifyCompiled']);

/** §6: the measurements the pipeline derives; a caller value is a substituted measurement. */
export const PRIMARY_DERIVED_INPUTS = Object.freeze([
  'plan', 'planPath', 'closure', 'preExposureChecks', 'validityGate', 'costAttribution', 'costProvenance',
  'routeConfiguration', 'realizationPreflight', 'replacements', 'retries', 'systemValid', 'containment',
  'expectedPlanId', 'artifactFixture', 'terminalRecompute', 'terminalCompiledVerification', 'terminalMutation',
  'terminalMeasurement',
]);

/** §6: the execution-configuration substitutes a PRIMARY run may not supply. */
export const PRIMARY_FORBIDDEN_SEAMS = Object.freeze(['faultAt', 'faultKind', 'timeoutMs']);

/** §6: the frozen experimental inputs a PRIMARY run legitimately supplies. */
export const EXPERIMENTAL_INPUTS = Object.freeze(['prehistory', 'admittedRefs', 'artifactRoot', 'runId', 'runRoot', 'profileId']);

/** §6: every input refused in PRIMARY, as one set. */
export const PRIMARY_REFUSED_INPUTS = Object.freeze([...PRIMARY_DERIVED_INPUTS, ...TRUSTED_HOST_INPUTS, ...PRIMARY_FORBIDDEN_SEAMS]);

/** §6: REFUSE CALLER SUBSTITUTION IN PRIMARY MODE. DETERMINISTIC permits injection, because that path is a fixture path. */
export function enforcePrimaryInputBinding(input) {
  const { mode, provided } = input;
  const supplied = PRIMARY_REFUSED_INPUTS.filter((name) => provided?.[name] !== undefined);
  if (mode !== 'PRIMARY') {
    return Object.freeze({ refused: false, mode, injectionPermitted: true, supplied: Object.freeze(supplied), reason: null, law: 'DETERMINISTIC mode permits explicit test injection' });
  }
  if (supplied.length === 0) {
    return Object.freeze({ refused: false, mode, injectionPermitted: false, supplied: Object.freeze([]), reason: null, law: 'PRIMARY derives every measurement and reads every trusted host input from the trusted boundary' });
  }
  return Object.freeze({
    refused: true, mode, injectionPermitted: false, supplied: Object.freeze(supplied),
    reason: `a PRIMARY invocation supplied [${supplied.join(', ')}], which the PRIMARY path must derive itself or read from the trusted host boundary; a caller-supplied measurement is not an actual measurement`,
    law: 'in PRIMARY mode the pipeline derives its own measurements and refuses caller substitution',
  });
}

/** §6: the trusted host configuration, reported rather than simulated. */
export function trustedHostConfiguration(input = {}) {
  const dshHome = input.dshHome ?? null;
  const installHostBundle = input.installHostBundle ?? null;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F',
    kind: 'trusted host configuration',
    trustedInputs: TRUSTED_HOST_INPUTS,
    resolvedFromTrustedBoundary: false,
    dshHomeResolved: typeof dshHome === 'string' && dshHome !== '',
    installerResolved: typeof installHostBundle === 'function',
    verifyCompiledPolicy: 'ENABLED — a skipped source-to-compiled verification is never a PRIMARY attestation pass',
    reason: 'this stage holds no separately controlled host trust root, so it refuses PRIMARY substitution and reports the boundary rather than simulating one',
  });
}

export { NL, BUDGET_CONCEPTS, REPO_ROOT };
