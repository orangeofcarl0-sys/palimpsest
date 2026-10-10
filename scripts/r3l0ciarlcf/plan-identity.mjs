/**
 * R3-L0C-I-A-R-L-C-F §6 Gate F4 — FULL PLAN IDENTITY.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlPartialPlanAndBudget` by CALLING the real
 * function: `planContentDigest` hashed a SELECTED projection of fifteen named fields, so a changed execution route
 * (the model and the provider), a changed pipeline order, changed terminal-admission conditions, changed
 * authorization decisions, changed execution-path deviations and a changed reused-module list all left the digest
 * UNMOVED. §6: "The current `planContentDigest()` hashes a selected plan projection. Establish a deterministic
 * full-plan digest over the canonical content of the committed prospective plan, excluding only the digest's own
 * self-referential field."
 *
 * THE REPAIR HASHES EVERY FIELD OF THE PLAN. The digest is computed over the canonical serialization of the plan
 * with exactly ONE key removed — the digest's own field — so a material change to ANY field moves it, and the
 * exclusion is a single named field rather than a hand-maintained projection that can silently fall behind.
 *
 * WHY THIS IS NOT SELF-REFERENTIAL. The digest is computed FROM the plan and written onto the plan. Nothing hashes
 * the plan-with-its-digest, and the digest field itself is excluded, so the digest is a function of the plan's
 * content alone. §6 requires this explicitly, and the prior stage's separate-digest property is preserved: the
 * full-plan digest is NOT the ExecutionClosureDigest.
 *
 * WHY THE COVERAGE LIST IS CARRIED. A reader should be able to see WHICH fields the digest covers without
 * reconstructing the exclusion rule, so `PLAN_DIGEST_COVERAGE` names the material fields and the gates test
 * asserts that a mutation to each one moves the digest.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';

import { NL, PLAN_DIGEST_COVERAGE, PLAN_DIGEST_SELF_FIELD } from './contract.mjs';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** §6: a canonical JSON rendering, so a key-order change does not move a digest. */
export function canonical(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * §6: THE FULL-PLAN DIGEST.
 *
 * Every field of the plan participates, and exactly one — the digest's own field — is excluded. The exclusion is by
 * NAME, not by a projection, so a field ADDED to the plan is covered automatically rather than silently omitted.
 */
export function fullPlanDigest(plan) {
  if (plan === null || plan === undefined || typeof plan !== 'object') return null;
  const material = {};
  for (const [key, value] of Object.entries(plan)) {
    if (key === PLAN_DIGEST_SELF_FIELD) continue;
    material[key] = value;
  }
  return sha256(canonical(material));
}

/**
 * §6: THE COVERAGE REPORT, so a reader can see what the digest actually covers.
 *
 * `coveredFields` is every field of the plan except the self-referential one; `missingMaterialFields` is any field
 * the contract NAMES as material that the plan does not carry, which is a finding rather than a silent omission.
 */
export function planDigestCoverage(plan) {
  if (plan === null || plan === undefined || typeof plan !== 'object') {
    return Object.freeze({ available: false, coveredFields: Object.freeze([]), missingMaterialFields: Object.freeze([...PLAN_DIGEST_COVERAGE]), selfFieldExcluded: PLAN_DIGEST_SELF_FIELD, reason: 'no plan was supplied' });
  }
  const covered = Object.keys(plan).filter((key) => key !== PLAN_DIGEST_SELF_FIELD);
  const missingMaterial = PLAN_DIGEST_COVERAGE.filter((field) => !(field in plan));
  return Object.freeze({
    available: true,
    coveredFields: Object.freeze(covered.sort()),
    coveredCount: covered.length,
    namedMaterialFields: PLAN_DIGEST_COVERAGE,
    missingMaterialFields: Object.freeze(missingMaterial),
    selfFieldExcluded: PLAN_DIGEST_SELF_FIELD,
    exclusionIsByNameNotByProjection: true,
    coversEveryPlanField: missingMaterial.length === 0,
  });
}

/**
 * §6: PROVE THE DIGEST MOVES ON A MATERIAL CHANGE.
 *
 * Each mutation is applied to a COPY of the plan, so the caller's plan is never written — the same
 * mutation-by-override discipline the closure uses. The six mutations §6 names are all present, plus the fields the
 * baseline was measured to miss.
 */
export function proveFullPlanDigestMoves(plan) {
  const base = fullPlanDigest(plan);
  if (base === null) return Object.freeze({ PROVEN: false, reason: 'no plan was supplied', mutations: Object.freeze([]) });
  const mutations = [];
  const mutate = (id, mutateFn, description) => {
    const copy = JSON.parse(JSON.stringify(plan));
    try { mutateFn(copy); } catch (error) { mutations.push(Object.freeze({ id, description, moved: false, error: String(error?.message ?? error).slice(0, 160) })); return; }
    const digest = fullPlanDigest(copy);
    mutations.push(Object.freeze({ id, description, moved: digest !== base, digest }));
  };
  /** §6's own list, plus the fields the baseline was measured to miss. */
  mutate('MODEL_PROVIDER_ROUTE', (copy) => { copy.executionRoute.modelId = 'MUTATED-MODEL'; copy.executionRoute.providerId = 'MUTATED-PROVIDER'; }, 'the model/provider route');
  mutate('EXECUTION_SETTINGS_VALUE', (copy) => { copy.executionRoute.settingsDigest = 'f'.repeat(64); }, 'an execution settings value');
  mutate('SESSION_SCHEDULE', (copy) => { copy.schedule[0].arm = copy.schedule[0].arm === 'C' ? 'H' : 'C'; }, 'the session schedule');
  mutate('TREATMENT_EXPOSURE', (copy) => { copy.preservedDesign.exposures = { MUTATED: true }; }, 'a treatment/exposure');
  mutate('FROZEN_ENDPOINT_OR_THRESHOLD', (copy) => { copy.preservedDesign.primaryEndpointsChanged = true; copy.preservedDesign.verdictThresholdsChanged = true; }, 'a frozen endpoint or threshold definition');
  mutate('AUTHORIZATION_SCOPE', (copy) => { copy.authorizationRequired.what = 'MUTATED'; }, 'the authorization scope');
  mutate('PIPELINE_ORDER', (copy) => { copy.pipelineOrder = ['MUTATED']; }, 'the pipeline order');
  mutate('TERMINAL_ADMISSION_CONDITIONS', (copy) => { copy.terminalAdmissionConditions = []; }, 'the terminal-admission conditions');
  mutate('AUTHORIZATION_DECISIONS', (copy) => { copy.authorizationDecisions = []; }, 'the authorization decisions');
  mutate('EXECUTION_PATH_DEVIATIONS', (copy) => { copy.executionPathDeviations = []; }, 'the execution-path deviations');
  mutate('REUSED_MODULES', (copy) => { copy.reusedModules = []; }, 'the reused-module list');
  mutate('CLOSURE_BINDING', (copy) => { copy.executionClosure.executionClosureDigest = 'a'.repeat(64); }, 'the execution-closure binding');
  mutate('RANDOMIZATION_SEED', (copy) => { copy.preservedDesign.randomizationSeed = 'MUTATED'; }, 'the frozen randomization seed');
  const unmoved = mutations.filter((entry) => entry.moved !== true);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'full-plan digest mutations',
    baseDigest: base,
    mutations: Object.freeze(mutations),
    allMutationsMove: unmoved.length === 0,
    unmoved: Object.freeze(unmoved.map((entry) => entry.id)),
    computedByOverride: true,
    planWritten: false,
    PROVEN: unmoved.length === 0 && mutations.length >= 6,
    law: 'the full-plan digest covers every plan field except its own, so a change to any material field moves it',
  });
}

export { NL };
