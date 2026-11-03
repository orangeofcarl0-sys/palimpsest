/**
 * R3-L0C-I-A-R-L-C §5 Gate C — THE PRIMARY TRUST AND AUTHORIZATION BOUNDARY.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlWeakAuthorizationTrust` by CALLING the
 * real verifier: the prior stage accepted any authority string matching `/^decision:/` as a verified authority and
 * required only `maxSessions > 0`, so `authority: "decision:totally-made-up-by-the-caller"` with a ONE-session
 * budget verified `true` for a frozen SIXTEEN-session scope. The plan binding was the ExecutionClosureDigest, which
 * conflates "the code that will run" with "the plan that was approved".
 *
 * THE REPAIR SEPARATES FIVE THINGS §5 names, and each is a value on the result:
 *
 *   SCHEMA_VALIDITY                every required field present with a well-formed shape
 *   EXTERNALLY_VERIFIED_AUTHORITY  the authority resolves against a SEPARATELY CONTROLLED trusted source
 *   AUTHORIZED_PROSPECTIVE_PLAN    the record binds the complete frozen plan by a content digest
 *   ENFORCEABLE_BUDGET             the budget covers the frozen scope AND the host can enforce it
 *   CURRENT_LAUNCH_PERMISSION      the launch boundary is open for this run right now
 *
 * A RECORD CAN BE SCHEMA-VALID AND STILL NOT BE TRUSTED. That is the whole point: schema validity is a shape
 * check, and a shape is not an authority. This stage does not invent, simulate or self-sign a real external
 * decision. No separately controlled trusted authority source exists in this repository, so the honest verdict is
 * `AUTHORITY_NOT_ESTABLISHED` and the PRIMARY launch stays PROHIBITED.
 *
 * THE PLAN BINDING IS A CONTENT DIGEST, SEPARATE FROM THE CLOSURE. `planContentDigest` hashes the plan's own
 * scientific content and its closure binding, and it is NOT the ExecutionClosureDigest. It is free of
 * self-reference because the plan does not carry its own content digest: the digest is computed FROM the plan, and
 * nothing writes it back into the plan.
 *
 * WHY THE TRUSTED ENVIRONMENT VALUES MOVE. §5: "Move trusted execution-environment values into a trusted host
 * configuration or a comparably restrictive boundary. Do not rely exclusively on a growing blacklist." So the
 * values a PRIMARY run must not take from its caller are resolved from `trustedHostConfiguration()`, which reads a
 * trusted host config — not from the invocation.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import {
  AUTHORITY_TRUST,
  AUTHORIZATION_RECORD_FIELDS,
  AUTHORIZATION_REQUIREMENTS,
  EXPERIMENTAL_INPUTS,
  FROZEN_SESSION_SCOPE,
  NL,
  PRIMARY_DERIVED_INPUTS,
  PRIMARY_FORBIDDEN_SEAMS,
  PRIMARY_REFUSED_INPUTS,
  REPO_ROOT,
  TRUSTED_HOST_INPUTS,
} from './contract.mjs';

const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/* ================================================================ §5 the plan content digest */

/**
 * §5: THE PLAN'S OWN CONTENT DIGEST, SEPARATE FROM THE EXECUTION CLOSURE.
 *
 * It hashes the plan's SCIENTIFIC content and its closure binding, with a canonical key order, so two plans with
 * the same experiment and the same closure binding digest identically and a changed schedule, seed, treatment,
 * endpoint or threshold moves it. It is NOT the ExecutionClosureDigest: the closure is about the CODE that runs,
 * the content digest is about the PLAN that was approved, and a record that approves one must not be accepted for
 * the other.
 */
export function planContentDigest(plan) {
  if (plan === null || plan === undefined || typeof plan !== 'object') return null;
  const design = plan.preservedDesign ?? {};
  const material = {
    planId: String(plan.planId ?? ''),
    baseline: String(plan.baseline ?? ''),
    schedule: canonical((plan.schedule ?? []).map((session) => ({ sessionId: session.sessionId, block: session.block, arm: session.arm, generation: session.generation, trajectoryId: session.trajectoryId }))),
    experimentalUnit: String(design.experimentalUnit ?? ''),
    treatment: String(design.treatment ?? ''),
    randomizationSeed: String(design.randomizationSeed ?? ''),
    sessionCount: String(design.sessionCount ?? ''),
    armOrder: canonical(design.armOrder ?? null),
    exposures: canonical(design.exposures ?? null),
    corpusDigest: String(design.corpusDigest ?? ''),
    capitalBundleDigest: String(design.capitalBundleDigest ?? ''),
    verdictThresholdsChanged: String(design.verdictThresholdsChanged),
    primaryEndpointsChanged: String(design.primaryEndpointsChanged),
    executionClosureDigest: String(plan.executionClosure?.executionClosureDigest ?? ''),
    authorizationRequired: canonical(plan.authorizationRequired ?? null),
  };
  return sha256(canonical(material));
}

/** A canonical JSON rendering, so a key order change does not move a digest. */
function canonical(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/* ================================================================ §5 the trusted authority source */

/** §5: the trusted source's own path, outside the run root, so a run cannot supply its own authority. */
export const TRUSTED_AUTHORITY_ENV = 'PALIMPSEST_AUTHORITY_SOURCE';

/**
 * §5: RESOLVE THE SEPARATELY CONTROLLED TRUSTED AUTHORITY SOURCE.
 *
 * A trusted source must be (a) configured out of band and (b) OUTSIDE the run root, so a run cannot write the
 * decision that authorizes it. This repository has no such source, and this stage does not create one — creating
 * one and then trusting it would be self-signing. So the resolution reports absence, and the caller's verdict is
 * `AUTHORITY_NOT_ESTABLISHED` rather than a pass.
 */
export function trustedAuthoritySource() {
  const configured = process.env[TRUSTED_AUTHORITY_ENV]?.trim();
  if (configured === undefined || configured === '') {
    return Object.freeze({
      available: false,
      path: null,
      reason: `no trusted authority source is configured (${TRUSTED_AUTHORITY_ENV} is unset); this stage does not create one, because creating a source and then trusting it would be self-signing`,
    });
  }
  const path = configured;
  if (!existsSync(path)) {
    return Object.freeze({ available: false, path, reason: `the configured trusted authority source does not exist at ${path}` });
  }
  /** §5: a source INSIDE the repository is not separately controlled, so it is refused rather than trusted. */
  const normalized = path.replace(/\\/gu, '/');
  const root = String(REPO_ROOT).replace(/\\/gu, '/');
  if (normalized.startsWith(root)) {
    return Object.freeze({ available: false, path, reason: `the configured source at ${path} is INSIDE the repository, so it is not separately controlled and cannot be trusted` });
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return Object.freeze({ available: true, path, source: Object.freeze({ ...parsed, sourceDigest: sha256(readFileSync(path, 'utf8')) }), reason: null });
  } catch (error) {
    return Object.freeze({ available: false, path, reason: `the configured source does not parse: ${String(error?.message ?? error).slice(0, 200)}` });
  }
}

/* ================================================================ §5 the five separated concepts */

/** §5: SCHEMA VALIDITY. A shape check, and explicitly not an authority check. */
export function schemaValidity(record) {
  const problems = [];
  if (record === null || record === undefined || typeof record !== 'object') {
    return Object.freeze({ valid: false, problems: Object.freeze(['no authorization record was supplied']), shapeIsNotAuthority: true });
  }
  for (const field of AUTHORIZATION_RECORD_FIELDS) {
    if (!(field in record)) problems.push(`the record omits ${field}`);
  }
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
    /** §5: stated on the result, because the whole defect is that this was read as an authority. */
    shapeIsNotAuthority: true,
    decisionPrefixIsNotVerification: true,
  });
}

/**
 * §5: THE ENFORCEABLE BUDGET.
 *
 * §5: "Verify that budget constraints actually cover the frozen 16-session scope, and distinguish a declared
 * budget from a budget the host can enforce." So the coverage is checked against the frozen scope, and the
 * ENFORCEABILITY is a separate fact: a declared number is not an enforced one, and this stage cannot enforce a
 * spend, so `enforceable` is reported as `DECLARED_ONLY` rather than as `true`.
 */
export function enforceableBudget(record) {
  const budget = record?.paidRunBudget ?? null;
  if (budget === null || typeof budget !== 'object') {
    return Object.freeze({ present: false, coversFrozenScope: false, maxSessions: null, requiredSessions: FROZEN_SESSION_SCOPE, enforceable: 'ABSENT', declaredOnly: true });
  }
  const maxSessions = typeof budget.maxSessions === 'number' ? budget.maxSessions : null;
  return Object.freeze({
    present: true,
    maxSessions,
    requiredSessions: FROZEN_SESSION_SCOPE,
    coversFrozenScope: maxSessions !== null && maxSessions >= FROZEN_SESSION_SCOPE,
    /** §5: a declared ceiling is not a host-enforced one, and this stage has no spend enforcement to offer. */
    enforceable: 'DECLARED_ONLY',
    declaredOnly: true,
    currency: budget.currency ?? null,
  });
}

/**
 * §5: VERIFY THE EXTERNAL AUTHORITY.
 *
 * The verdict is `VERIFIED` only when a separately controlled trusted source resolves the record's authority. With
 * no source — this repository's state — the verdict is `AUTHORITY_NOT_ESTABLISHED`, and the launch permission stays
 * `false`. A syntactically valid `decision:` string alone is `REFUSED` at the authority stage rather than accepted.
 */
export function verifyExternalAuthority(input) {
  const { record, plan, trustedSource = trustedAuthoritySource() } = input;
  const schema = schemaValidity(record);
  const budget = enforceableBudget(record);
  const expectedPlanDigest = planContentDigest(plan);
  const planBound = typeof record?.approvedPlanDigest === 'string' && record.approvedPlanDigest !== '' && expectedPlanDigest !== null && record.approvedPlanDigest === expectedPlanDigest;
  const planIdBound = typeof record?.approvedPlanId === 'string' && record.approvedPlanId !== '' && plan?.planId !== undefined && record.approvedPlanId === plan.planId;

  /** §5: the authority resolves ONLY against the trusted source. The prefix check is not a verification. */
  let authorityVerified = false;
  let authorityReason;
  if (trustedSource.available !== true) {
    authorityReason = trustedSource.reason;
  } else {
    const decisions = trustedSource.source?.decisions ?? {};
    const authorityId = trustedSource.source?.authority ?? null;
    authorityVerified = typeof authorityId === 'string' && authorityId !== '' && record?.authority === authorityId && decisions[record?.authority] === true;
    authorityReason = authorityVerified
      ? `the authority "${String(record?.authority)}" resolves against the trusted source at ${String(trustedSource.path)}`
      : `the authority "${String(record?.authority)}" does not resolve against the trusted source at ${String(trustedSource.path)}`;
  }

  const problems = [...schema.problems];
  if (!planBound) problems.push(`the record approves plan digest ${String(record?.approvedPlanDigest).slice(0, 16)} but the executing plan's content digest is ${String(expectedPlanDigest).slice(0, 16)}`);
  if (!planIdBound) problems.push(`the record approves plan id "${String(record?.approvedPlanId)}" but "${String(plan?.planId)}" is executing`);
  if (!budget.coversFrozenScope) problems.push(`the declared budget of ${String(budget.maxSessions)} session(s) does not cover the frozen ${String(FROZEN_SESSION_SCOPE)}-session scope`);
  if (authorityVerified !== true) problems.push(`the authority is not externally verified: ${String(authorityReason)}`);

  const verdict = authorityVerified !== true
    ? (trustedSource.available !== true ? AUTHORITY_TRUST.NOT_ESTABLISHED : AUTHORITY_TRUST.REFUSED)
    : (schema.valid && planBound && planIdBound && budget.coversFrozenScope ? AUTHORITY_TRUST.VERIFIED : AUTHORITY_TRUST.REFUSED);

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C',
    kind: 'external authority verification',
    verdict,
    verified: verdict === AUTHORITY_TRUST.VERIFIED,
    /** §5: the five separated concepts, each its own value. */
    concepts: Object.freeze({
      SCHEMA_VALIDITY: schema.valid,
      EXTERNALLY_VERIFIED_AUTHORITY: authorityVerified,
      AUTHORIZED_PROSPECTIVE_PLAN: planBound && planIdBound,
      ENFORCEABLE_BUDGET: budget.coversFrozenScope && budget.enforceable === 'DECLARED_ONLY',
      CURRENT_LAUNCH_PERMISSION: false,
    }),
    schema,
    budget,
    planContentDigest: expectedPlanDigest,
    planContentDigestIsSeparateFromClosure: expectedPlanDigest !== null && expectedPlanDigest !== (plan?.executionClosure?.executionClosureDigest ?? null),
    planBindingIsSelfReferential: false,
    trustedSource: Object.freeze({ available: trustedSource.available, path: trustedSource.path ?? null, reason: trustedSource.reason ?? null }),
    problems: Object.freeze(problems),
    /** §5: this stage grants no authorization and opens no launch. */
    thisStageProvidesAuthorization: false,
    syntacticallyValidDecisionIsTrustedAuthority: false,
    authorityStringAloneIsNotProof: true,
    launchProhibited: true,
    detail: verdict === AUTHORITY_TRUST.VERIFIED
      ? `an external authorization decision for plan ${String(record?.approvedPlanId)}, verified against a separately controlled trusted source`
      : `the authorization is not verified (${verdict}): ${String(authorityReason)}`,
  });
}

/* ================================================================ §5 the trusted host configuration */

/**
 * §5: THE TRUSTED EXECUTION-ENVIRONMENT VALUES.
 *
 * §5 requires these to come from a trusted host configuration rather than from the invocation. This stage cannot
 * mint trust it does not have, so the configuration reports which values it can supply from a trusted boundary and
 * which it cannot — and the pipeline REFUSES a PRIMARY run that supplies any of them.
 */
export function trustedHostConfiguration(input = {}) {
  const dshHome = input.dshHome ?? null;
  const installHostBundle = input.installHostBundle ?? null;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C',
    kind: 'trusted host configuration',
    trustedInputs: TRUSTED_HOST_INPUTS,
    /** §5: the resolver is the boundary; a caller-supplied value is not a trusted one. */
    resolvedFromTrustedBoundary: false,
    dshHomeResolved: typeof dshHome === 'string' && dshHome !== '',
    installerResolved: typeof installHostBundle === 'function',
    verifyCompiledPolicy: 'ENABLED — a skipped source-to-compiled verification is never a PRIMARY attestation pass',
    reason: 'this stage holds no separately controlled host trust root, so it refuses PRIMARY substitution and reports the boundary rather than simulating one',
  });
}

/**
 * §5: REFUSE CALLER SUBSTITUTION IN PRIMARY MODE.
 *
 * DETERMINISTIC permits injection, because that path exists to exercise the machinery with fixtures. PRIMARY
 * refuses EVERY derived measurement and every trusted host input.
 */
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

export { NL, PRIMARY_DERIVED_INPUTS, PRIMARY_REFUSED_INPUTS, TRUSTED_HOST_INPUTS, EXPERIMENTAL_INPUTS, PRIMARY_FORBIDDEN_SEAMS };
