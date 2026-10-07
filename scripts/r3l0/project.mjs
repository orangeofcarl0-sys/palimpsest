/**
 * R3-L0 §4/§5/§9 — THE ONE LONG-HORIZON EXPERIMENTAL PROJECT FAMILY.
 *
 * §4 requires exactly ONE project family that evolves through three ADDITIVE requirement generations on the
 * SAME durable code/project world, designed from MECHANISM requirements before any worker run, exposing at
 * least TWO historically prepaid reasoning lessons across later generations.
 *
 * THE TWO LESSONS (§5's recommended pair, chosen because both recur naturally in ordinary project reasoning):
 *
 *   L1 — validate the complete relevant input/state before destructive mutation
 *   L2 — compute/freeze the complete affected dependency set before mutation/invalidation
 *
 * THE PROJECT: `entitlement-ledger`, a multi-tenant capability ledger.
 *
 * A tenant holds a plan; a plan grants capabilities; a grant may be DERIVED from another grant, so the grants
 * form a forest; revoking a grant must revoke everything derived from it. A tenant's effective capabilities are
 * its plan's capabilities overridden by its own explicit overrides.
 *
 * WHY THIS EXPOSES BOTH LESSONS, AND WHY THEY RECUR:
 *
 *   L1 recurs at every MUTATION ENTRY POINT. G1 introduces a batch application, G2 a revocation, G3 a plan
 *      migration — three different entry points, each owing the same "validate the whole request before the
 *      first effect" obligation.
 *   L2 recurs at every INVALIDATION PATH. G2 introduces cascading revocation; G3's migration can revoke grants
 *      the new plan does not include, so the closure must be frozen before the first mutation there too.
 *
 * THE PREHISTORY (§5) is a DIFFERENT surface: two incidents the project already resolved — an earlier
 * `applyChanges` that suffered the L1 mistake, and an earlier `recomputeIndex` that suffered the L2 mistake.
 * Those fixes remain in the world as ordinary prior art, so a HISTORY_ONLY worker can in principle REDISCOVER
 * the lessons from project history. That is intentional: the control condition must be able to succeed, or the
 * treatment would be measuring nothing.
 *
 * NOT A COPY OF SCENARIO D. Scenario D invalidates a build cache after a change set. Here there is no cache and
 * no change set: the question is which GRANTS survive a revocation, and the dependency structure is an explicit
 * derived-from forest the caller declared.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/* ================================================================ §5 the prepaid lessons */

export const PREPAID_LESSONS = Object.freeze([
  Object.freeze({
    id: 'L1',
    statement: 'validate the complete relevant input/state before destructive mutation',
    origin: 'the prehistory incident on applyChanges',
    /** The general method, stated as an obligation the mechanism forces. */
    obligation: 'no effect may be applied until the WHOLE request has been validated, so a refusal leaves the caller\'s state exactly as it was',
  }),
  Object.freeze({
    id: 'L2',
    statement: 'compute/freeze the complete affected dependency set before mutation/invalidation',
    origin: 'the prehistory incident on recomputeIndex',
    obligation: 'the affected closure must be computed while the dependency edges still exist, because the mutation is what destroys the evidence needed to compute it',
  }),
]);

/* ================================================================ §10 the diagnostic classes */

/**
 * §10/§11: THE RESEARCH DIAGNOSTIC CLASSES.
 *
 * These are NOT Project Verification. They are research-only, invisible to the worker, carry no canonical
 * authority, and change no promotion. They exist to produce a frozen failure-class vector per generation.
 *
 * `prepaid` records whether the class is an exposure of a PREPAID lesson (§11). `EXTENSION` classes are
 * reported in diagnostic quality but do NOT enter PERR, because the project never paid for them.
 */
export const DIAGNOSTIC_CLASSES = Object.freeze([
  Object.freeze({ id: 'D1', invariant: 'atomic-batch', lesson: 'L1', prepaid: true, statement: 'an unusable operation anywhere in a batch leaves the caller\'s ledger byte-identical' }),
  Object.freeze({ id: 'D2', invariant: 'validate-before-effect', lesson: 'L1', prepaid: true, statement: 'an operation AFTER a valid one is validated before the valid one has any effect' }),
  Object.freeze({ id: 'D3', invariant: 'closure-before-mutation', lesson: 'L2', prepaid: true, statement: 'the affected set is computed while the derived-from edges still exist, so a cascade is complete' }),
  Object.freeze({ id: 'D4', invariant: 'transitive-cascade', lesson: 'L2', prepaid: true, statement: 'a revocation reaches the FULL transitive closure, not only direct children' }),
  Object.freeze({ id: 'D5', invariant: 'override-preservation', lesson: null, prepaid: false, statement: 'a tenant\'s explicit overrides survive a plan migration' }),
  Object.freeze({ id: 'D6', invariant: 'composed-atomicity', lesson: 'L1', prepaid: true, statement: 'a migration whose validation fails leaves the ledger byte-identical, even though it may revoke and regrant' }),
]);

/**
 * §11: THE PREPAID EXPOSURE MAPPING, frozen before execution.
 *
 * §11 is explicit that a prepaid relationship must NOT be inferred after outcomes are known, so this map is
 * declared here and the analysis reads it rather than deriving it.
 */
export const PREPAID_EXPOSURES = Object.freeze({
  G1: Object.freeze(['D1', 'D2']),
  G2: Object.freeze(['D1', 'D2', 'D3', 'D4']),
  G3: Object.freeze(['D1', 'D2', 'D3', 'D4', 'D6']),
});

/** §11: the classes that enter PERR are exactly the prepaid ones exposed by a generation. */
export function eligiblePrepaidExposures(generation) {
  const exposed = PREPAID_EXPOSURES[generation] ?? [];
  return exposed.filter((classId) => DIAGNOSTIC_CLASSES.find((entry) => entry.id === classId)?.prepaid === true);
}

/** §11: the total eligible prepaid exposures across the whole trajectory. */
export function trajectoryEligibleExposures() {
  return Object.keys(PREPAID_EXPOSURES).reduce((total, generation) => total + eligiblePrepaidExposures(generation).length, 0);
}

/* ================================================================ the ledger contract (shared by all generations) */

/**
 * The README states the contract in the terms a user of the library would use. It is the project's own
 * specification, and it is what a worker reads to understand what it owes. It deliberately does NOT enumerate
 * the diagnostic classes: the worker must reason about what the contract implies.
 */
export const LEDGER_README = [
  '# entitlement-ledger',
  '',
  '`ledger` is a multi-tenant capability ledger.',
  '',
  '## The ledger',
  '',
  '```js',
  '{',
  '  tenants: { [tenantId]: { plan: string, overrides: { [capability]: boolean } } },',
  '  grants:  { [grantId]: { tenantId: string, capability: string, derivedFrom: string | null } },',
  '  applied: { [batchId]: true },',
  '}',
  '```',
  '',
  '· A `grant` is a tenant\'s permission for one capability. `derivedFrom` names ANOTHER grant this one was',
  '  derived from, or `null`. The grants therefore form a forest.',
  '· `overrides` are the tenant\'s EXPLICIT decisions: `true` grants a capability the plan does not include,',
  '  `false` denies one the plan does include. A tenant\'s own override always wins over its plan.',
  '· `applied` records the batch ids the ledger has already applied, so re-applying one is a no-op.',
  '',
  '## The plan catalogue',
  '',
  '```js',
  'PLANS = { basic: ["read"], pro: ["read", "write"], enterprise: ["read", "write", "admin"] }',
  '```',
  '',
  '## What the contract requires',
  '',
  '· Every operation is REFUSED by throwing an error with a `code`, and a refused operation must leave the',
  '  caller\'s ledger exactly as it was.',
  '· A grant naming a tenant the ledger does not hold is refused.',
  '· A grant naming a capability no plan defines is refused.',
  '· A batch the ledger has already applied is a no-op.',
  '· Revoking a grant also revokes every grant DERIVED from it, at any depth.',
  '· A tenant\'s effective capabilities are its plan\'s capabilities, with its own overrides applied last.',
  '',
  '## Running the checks',
  '',
  '```',
  'node test/check.js',
  '```',
  '',
  'The visible checks cover the ordinary path. They are not the whole contract.',
  '',
].join('\n');

export const LEDGER_PLANS = [
  '/** The plan catalogue. A capability no plan defines cannot be granted. */',
  'export const PLANS = Object.freeze({',
  '  basic: Object.freeze(["read"]),',
  '  pro: Object.freeze(["read", "write"]),',
  '  enterprise: Object.freeze(["read", "write", "admin"]),',
  '});',
  '',
].join('\n');

export const LEDGER_ERRORS = [
  '/** The ledger\'s own error type. `code` is stable and machine-readable. */',
  'export class LedgerError extends Error {',
  '  /**',
  '   * @param {string} code a stable, machine-readable failure code',
  '   * @param {string} message a human-readable explanation',
  '   */',
  '  constructor(code, message) {',
  '    super(message);',
  '    this.name = "LedgerError";',
  '    this.code = code;',
  '  }',
  '}',
  '',
].join('\n');

/**
 * §5: THE PREHISTORY PRIOR ART — two ALREADY-FIXED APIs from incidents the project resolved.
 *
 * These are ordinary, correct code in the world. They are the durable trace of the lessons, and a HISTORY_ONLY
 * worker can read them and in principle rediscover the general obligation. The comments state WHAT the fix was,
 * because that is what the project's own record would contain — but they are written about the EARLIER surface,
 * not about the new one, so carrying them across is still the worker's reasoning job.
 */
export const PREHISTORY_PRIOR_ART = [
  '/**',
  ' * PRIOR ART — the two APIs this project already fixed after incidents.',
  ' *',
  ' * These are ordinary, working code. They are kept because they are the project\'s own history, and because',
  ' * the fixes they carry are the general obligations the ledger owes every caller.',
  ' */',
  '',
  '/**',
  ' * applyChanges — the FIRST batch API this project shipped.',
  ' *',
  ' * INCIDENT 1: it used to walk the changes and apply each as it arrived, so a change naming an unknown',
  ' * tenant left every EARLIER change already applied. The fix was to validate the whole change set before the',
  ' * first write, and to compute the complete effect before mutating anything.',
  ' *',
  ' * @param {object} ledger the CALLER\'S ledger',
  ' * @param {{ id: string, changes: ReadonlyArray<{ tenantId: string, capability: string }> }} changeSet',
  ' */',
  'export function applyChanges(ledger, changeSet) {',
  '  if (ledger.applied[changeSet.id] === true) return ledger;',
  '  // VALIDATE THE WHOLE SET FIRST. Nothing below this loop may run before it completes.',
  '  for (const change of changeSet.changes) {',
  '    if (ledger.tenants[change.tenantId] === undefined) {',
  '      throw new LedgerError("UNKNOWN_TENANT", `no tenant ${change.tenantId}`);',
  '    }',
  '    if (!PLANS[ledger.tenants[change.tenantId].plan].includes(change.capability)) {',
  '      throw new LedgerError("UNKNOWN_CAPABILITY", `${change.capability} is not in the plan`);',
  '    }',
  '  }',
  '  for (const change of changeSet.changes) {',
  '    ledger.tenants[change.tenantId].overrides[change.capability] = true;',
  '  }',
  '  ledger.applied[changeSet.id] = true;',
  '  return ledger;',
  '}',
  '',
  '/**',
  ' * recomputeIndex — the FIRST invalidation API this project shipped.',
  ' *',
  ' * INCIDENT 2: it used to remove the node first and then look for what depended on it, so by the time it',
  ' * looked, the edges it needed were already gone and only the DIRECT dependents were ever cleared. The fix was',
  ' * to compute the complete affected set while the edges still existed, freeze it, and only then mutate.',
  ' *',
  ' * @param {{ edges: Record<string, ReadonlyArray<string>>, fresh: Record<string, boolean> }} index',
  ' * @param {string} nodeId',
  ' */',
  'export function recomputeIndex(index, nodeId) {',
  '  // COMPUTE THE CLOSURE FIRST, over the intact edges.',
  '  const affected = new Set();',
  '  const stack = [nodeId];',
  '  while (stack.length > 0) {',
  '    const current = stack.pop();',
  '    if (affected.has(current)) continue;',
  '    affected.add(current);',
  '    for (const dependent of Object.keys(index.edges)) {',
  '      if (index.edges[dependent].includes(current)) stack.push(dependent);',
  '    }',
  '  }',
  '  // ONLY NOW mutate.',
  '  for (const id of affected) {',
  '    index.fresh[id] = false;',
  '    delete index.edges[id];',
  '  }',
  '  return index;',
  '}',
  '',
].join('\n');

/** The project's own incident record. This is the durable history a HISTORY_ONLY worker can read. */
export const PREHISTORY_INCIDENT_1 = [
  '# Incident 1 — applyChanges applied before it validated',
  '',
  '## What happened',
  '',
  'A caller sent a change set whose SECOND change named a tenant the ledger did not hold. `applyChanges` was',
  'walking the set and applying each change as it arrived, so the FIRST change had already been written when the',
  'second was refused. The caller kept using the same ledger object and saw a partially applied set.',
  '',
  '## Root cause',
  '',
  'The function validated nothing before it began writing. Validation and effect were interleaved, so there was',
  'no point at which the whole request was known to be usable.',
  '',
  '## Fix',
  '',
  'Validate the COMPLETE change set before the first write. Once validation finishes, the effect is known to be',
  'applicable, and the apply loop cannot be interrupted by a refusal.',
  '',
  '## The general obligation',
  '',
  'A refusal must leave the caller\'s state exactly as it was. That is only possible if no effect is applied',
  'until the whole request has been validated.',
  '',
].join('\n');

export const PREHISTORY_INCIDENT_2 = [
  '# Incident 2 — recomputeIndex lost the edges it needed',
  '',
  '## What happened',
  '',
  '`recomputeIndex(index, nodeId)` was supposed to clear every node affected by `nodeId`, transitively. It cleared',
  '`nodeId` first, deleting its edges, and only then looked for what depended on it. By then the derived-from',
  'edges had been deleted, so only nodes whose edges happened to be visited before the deletion were cleared.',
  'Callers saw stale nodes survive a recompute.',
  '',
  '## Root cause',
  '',
  'The mutation destroyed the evidence the computation needed. The closure was computed AFTER the thing it was',
  'computed from had been removed.',
  '',
  '## Fix',
  '',
  'Compute the complete affected set FIRST, while every edge still exists, and freeze it. Only then mutate.',
  '',
  '## The general obligation',
  '',
  'A dependency closure must be computed before the mutation that destroys the dependency edges. Computing it',
  'afterwards silently yields an incomplete set, and the incompleteness is invisible to the caller.',
  '',
].join('\n');

/* ================================================================ §9 the three generations */

/**
 * §9: THE GENERATION REQUIREMENTS, frozen before primary execution.
 *
 * Each generation ADDS meaningful project work on the SAME durable world, and exposes declared diagnostic
 * opportunities. The requirement text states what the project owes; it does NOT name the diagnostic classes, so
 * the worker must reason about what the obligation implies.
 */
export const GENERATIONS = Object.freeze([
  Object.freeze({
    id: 'G1',
    generation: 1,
    title: 'batch application',
    /** §9: the additive requirement. */
    requirement: 'Add `applyBatch(ledger, batch)` to the ledger: it applies a batch of grant and revoke operations atomically, so that an unusable operation anywhere in the batch leaves the caller\'s ledger exactly as it was. A batch id the ledger has already applied is a no-op.',
    exposes: Object.freeze(['D1', 'D2']),
    /** The APIs that must exist and behave correctly by the END of this generation. */
    requiredExports: Object.freeze(['applyBatch']),
    objective: 'implement applyBatch so a batch of ledger operations applies atomically',
    projectGoal: 'let callers apply a batch of entitlement changes all-or-nothing',
  }),
  Object.freeze({
    id: 'G2',
    generation: 2,
    title: 'cascading revocation',
    requirement: 'Add `revokeCapability(ledger, tenantId, capability)`: it revokes that tenant\'s grant for that capability AND every grant derived from it, at any depth. A revocation of a grant that does not exist is refused.',
    exposes: Object.freeze(['D1', 'D2', 'D3', 'D4']),
    requiredExports: Object.freeze(['applyBatch', 'revokeCapability']),
    objective: 'implement revokeCapability so revocation reaches every grant derived from it',
    projectGoal: 'keep the entitlement ledger consistent when a capability is withdrawn',
  }),
  Object.freeze({
    id: 'G3',
    generation: 3,
    title: 'plan migration',
    requirement: 'Add `migratePlan(ledger, tenantId, newPlan)`: it moves the tenant to a new plan, KEEPS every explicit override the tenant already holds, and revokes the grants the new plan does not include (cascading as revocation does). A migration to a plan the catalogue does not define is refused, and a refused migration leaves the ledger exactly as it was.',
    exposes: Object.freeze(['D1', 'D2', 'D3', 'D4', 'D6']),
    requiredExports: Object.freeze(['applyBatch', 'revokeCapability', 'migratePlan']),
    objective: 'implement migratePlan so a tenant moves plans without losing its explicit decisions',
    projectGoal: 'move a tenant onto a new plan without breaking the capabilities it was explicitly given',
  }),
]);

/** The generation spec for an id, or undefined. */
export function generationOf(id) {
  return GENERATIONS.find((entry) => entry.id === id);
}

/* ================================================================ the visible oracle (ordinary Project Verification) */

/**
 * §10: THE VISIBLE ORACLE IS ORDINARY PROJECT VERIFICATION.
 *
 * It covers the ordinary path and states the broad contract. It is deliberately NOT the diagnostic oracle: it
 * does not enumerate the diagnostic classes, and it is satisfiable without solving them, so ordinary Work can
 * proceed through canonical semantics even when a diagnostic class fails.
 */
export const VISIBLE_ORACLE = [
  'import assert from "node:assert/strict";',
  'import { applyBatch, revokeCapability, migratePlan } from "../src/ledger.mjs";',
  '',
  'const fresh = () => ({',
  '  tenants: { acme: { plan: "pro", overrides: {} }, beta: { plan: "basic", overrides: {} } },',
  '  grants: { g1: { tenantId: "acme", capability: "read", derivedFrom: null } },',
  '  applied: {},',
  '});',
  '',
  '// A batch of ordinary grants applies and records itself.',
  '{',
  '  const ledger = fresh();',
  '  applyBatch(ledger, { id: "b1", operations: [',
  '    { kind: "grant", tenantId: "acme", capability: "write" },',
  '    { kind: "grant", tenantId: "beta", capability: "read" },',
  '  ] });',
  '  assert.equal(ledger.applied.b1, true, "an applied batch must be recorded");',
  '}',
  '',
  '// Re-applying a batch the ledger already applied changes nothing.',
  '{',
  '  const ledger = fresh();',
  '  applyBatch(ledger, { id: "b2", operations: [{ kind: "grant", tenantId: "acme", capability: "write" }] });',
  '  const before = JSON.stringify(ledger);',
  '  applyBatch(ledger, { id: "b2", operations: [{ kind: "grant", tenantId: "acme", capability: "write" }] });',
  '  assert.equal(JSON.stringify(ledger), before, "re-applying a batch must be a no-op");',
  '}',
  '',
  '// An unusable operation is refused.',
  '{',
  '  const ledger = fresh();',
  '  let threw = false;',
  '  try {',
  '    applyBatch(ledger, { id: "b3", operations: [{ kind: "grant", tenantId: "ghost", capability: "read" }] });',
  '  } catch {',
  '    threw = true;',
  '  }',
  '  assert.equal(threw, true, "a batch naming an unknown tenant must be refused");',
  '}',
  '',
  '// Revoking a grant removes it.',
  '{',
  '  const ledger = fresh();',
  '  revokeCapability(ledger, "acme", "read");',
  '  assert.equal(Object.keys(ledger.grants).length, 0, "a revoked grant must be gone");',
  '}',
  '',
  '// A migration moves the tenant to the new plan.',
  '{',
  '  const ledger = fresh();',
  '  migratePlan(ledger, "acme", "enterprise");',
  '  assert.equal(ledger.tenants.acme.plan, "enterprise", "the tenant must be on the new plan");',
  '}',
  '',
  'process.stdout.write("ok" + String.fromCharCode(10));',
  '',
].join('\n');

export const LEDGER_PACKAGE_JSON = `${JSON.stringify({ name: 'entitlement-ledger', private: true, type: 'module', scripts: { test: 'node test/check.js' } }, null, 2)}\n`;

/* ================================================================ the per-generation starting sources */

/**
 * G1's starting point: `applyBatch` exists but walks the batch and applies as it arrives — the L1 mistake, in
 * the new surface. `revokeCapability` and `migratePlan` do not exist yet.
 *
 * The prehistory prior art is present in the SAME file, so the world carries the project's own history.
 */
export const G1_SOURCE_H0 = [
  '/**',
  ' * entitlement-ledger — the ledger API.',
  ' *',
  ' * See README.md for the contract. `plans.mjs` holds the plan catalogue and `errors.mjs` the error type.',
  ' */',
  'import { PLANS } from "./plans.mjs";',
  'import { LedgerError } from "./errors.mjs";',
  '',
  '/* ------------------------------------------------------------------ the prior art */',
  '',
  PREHISTORY_PRIOR_ART,
  '/* ------------------------------------------------------------------ the current API */',
  '',
  '/**',
  ' * applyBatch — apply a batch of operations to the caller\'s ledger.',
  ' *',
  ' * @param {object} ledger the CALLER\'S ledger; the caller keeps using the same object',
  ' * @param {{ id: string, operations: ReadonlyArray<{ kind: string, tenantId: string, capability: string }> }} batch',
  ' * @returns the ledger',
  ' */',
  'export function applyBatch(ledger, batch) {',
  '  for (const operation of batch.operations) {',
  '    const tenant = ledger.tenants[operation.tenantId];',
  '    if (operation.kind === "grant") {',
  '      tenant.overrides[operation.capability] = true;',
  '    } else {',
  '      tenant.overrides[operation.capability] = false;',
  '    }',
  '  }',
  '  ledger.applied[batch.id] = true;',
  '  return ledger;',
  '}',
  '',
  '/**',
  ' * revokeCapability — withdraw a capability from a tenant.',
  ' *',
  ' * @param {object} ledger the CALLER\'S ledger',
  ' * @param {string} tenantId',
  ' * @param {string} capability',
  ' */',
  'export function revokeCapability(ledger, tenantId, capability) {',
  '  for (const grantId of Object.keys(ledger.grants)) {',
  '    const grant = ledger.grants[grantId];',
  '    if (grant.tenantId === tenantId && grant.capability === capability) {',
  '      delete ledger.grants[grantId];',
  '    }',
  '  }',
  '  return ledger;',
  '}',
  '',
  '/**',
  ' * migratePlan — move a tenant onto another plan.',
  ' *',
  ' * @param {object} ledger the CALLER\'S ledger',
  ' * @param {string} tenantId',
  ' * @param {string} newPlan',
  ' */',
  'export function migratePlan(ledger, tenantId, newPlan) {',
  '  ledger.tenants[tenantId].plan = newPlan;',
  '  ledger.tenants[tenantId].overrides = {};',
  '  return ledger;',
  '}',
  '',
].join('\n');

/** G2's starting point: the SAME file after G1 was promoted. `revokeCapability` still only clears direct grants. */
export const G2_SOURCE_H0 = [
  '/**',
  ' * entitlement-ledger — the ledger API.',
  ' *',
  ' * See README.md for the contract. `plans.mjs` holds the plan catalogue and `errors.mjs` the error type.',
  ' */',
  'import { PLANS } from "./plans.mjs";',
  'import { LedgerError } from "./errors.mjs";',
  '',
  PREHISTORY_PRIOR_ART,
  '/**',
  ' * applyBatch — apply a batch of operations to the caller\'s ledger.',
  ' */',
  'export function applyBatch(ledger, batch) {',
  '  if (ledger.applied[batch.id] === true) return ledger;',
  '  for (const operation of batch.operations) {',
  '    const tenant = ledger.tenants[operation.tenantId];',
  '    if (tenant === undefined) throw new LedgerError("UNKNOWN_TENANT", `no tenant ${operation.tenantId}`);',
  '  }',
  '  for (const operation of batch.operations) {',
  '    const tenant = ledger.tenants[operation.tenantId];',
  '    if (operation.kind === "grant") tenant.overrides[operation.capability] = true;',
  '    else tenant.overrides[operation.capability] = false;',
  '  }',
  '  ledger.applied[batch.id] = true;',
  '  return ledger;',
  '}',
  '',
  '/**',
  ' * revokeCapability — withdraw a capability from a tenant.',
  ' *',
  ' * Removes the tenant\'s own grant for the capability. Grants derived from it are not considered.',
  ' */',
  'export function revokeCapability(ledger, tenantId, capability) {',
  '  for (const grantId of Object.keys(ledger.grants)) {',
  '    const grant = ledger.grants[grantId];',
  '    if (grant.tenantId === tenantId && grant.capability === capability) {',
  '      delete ledger.grants[grantId];',
  '    }',
  '  }',
  '  return ledger;',
  '}',
  '',
  '/**',
  ' * migratePlan — move a tenant onto another plan.',
  ' */',
  'export function migratePlan(ledger, tenantId, newPlan) {',
  '  ledger.tenants[tenantId].plan = newPlan;',
  '  ledger.tenants[tenantId].overrides = {};',
  '  return ledger;',
  '}',
  '',
].join('\n');

/** G3's starting point: the same file, with `migratePlan` still discarding overrides and not revoking. */
export const G3_SOURCE_H0 = [
  '/**',
  ' * entitlement-ledger — the ledger API.',
  ' *',
  ' * See README.md for the contract. `plans.mjs` holds the plan catalogue and `errors.mjs` the error type.',
  ' */',
  'import { PLANS } from "./plans.mjs";',
  'import { LedgerError } from "./errors.mjs";',
  '',
  PREHISTORY_PRIOR_ART,
  '/** applyBatch — apply a batch of operations to the caller\'s ledger. */',
  'export function applyBatch(ledger, batch) {',
  '  if (ledger.applied[batch.id] === true) return ledger;',
  '  for (const operation of batch.operations) {',
  '    const tenant = ledger.tenants[operation.tenantId];',
  '    if (tenant === undefined) throw new LedgerError("UNKNOWN_TENANT", `no tenant ${operation.tenantId}`);',
  '  }',
  '  for (const operation of batch.operations) {',
  '    const tenant = ledger.tenants[operation.tenantId];',
  '    if (operation.kind === "grant") tenant.overrides[operation.capability] = true;',
  '    else tenant.overrides[operation.capability] = false;',
  '  }',
  '  ledger.applied[batch.id] = true;',
  '  return ledger;',
  '}',
  '',
  '/** revokeCapability — withdraw a capability and everything derived from it. */',
  'export function revokeCapability(ledger, tenantId, capability) {',
  '  const roots = Object.keys(ledger.grants).filter((grantId) => {',
  '    const grant = ledger.grants[grantId];',
  '    return grant.tenantId === tenantId && grant.capability === capability;',
  '  });',
  '  for (const rootId of roots) {',
  '    const affected = new Set();',
  '    const stack = [rootId];',
  '    while (stack.length > 0) {',
  '      const current = stack.pop();',
  '      if (affected.has(current)) continue;',
  '      affected.add(current);',
  '      for (const grantId of Object.keys(ledger.grants)) {',
  '        if (ledger.grants[grantId].derivedFrom === current) stack.push(grantId);',
  '      }',
  '    }',
  '    for (const id of affected) delete ledger.grants[id];',
  '  }',
  '  return ledger;',
  '}',
  '',
  '/**',
  ' * migratePlan — move a tenant onto another plan.',
  ' *',
  ' * Sets the new plan and clears the tenant\'s explicit decisions.',
  ' */',
  'export function migratePlan(ledger, tenantId, newPlan) {',
  '  const tenant = ledger.tenants[tenantId];',
  '  if (tenant === undefined) throw new LedgerError("UNKNOWN_TENANT", `no tenant ${tenantId}`);',
  '  if (PLANS[newPlan] === undefined) throw new LedgerError("UNKNOWN_PLAN", `no plan ${newPlan}`);',
  '  tenant.plan = newPlan;',
  '  tenant.overrides = {};',
  '  return ledger;',
  '}',
  '',
].join('\n');

/**
 * §12: the generation starting points are H0 REVISIONS, not resets. In the real trajectory, generation N+1
 * starts from whatever generation N actually promoted — these constants are only used to CONSTRUCT the
 * prehistory's own baseline and to document what each generation's H0 looks like.
 */
export const GENERATION_H0 = Object.freeze({ G1: G1_SOURCE_H0, G2: G2_SOURCE_H0, G3: G3_SOURCE_H0 });
