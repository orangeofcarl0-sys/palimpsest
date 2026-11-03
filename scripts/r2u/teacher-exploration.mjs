/**
 * R2-U §12 — SCENARIO D: TEACHER / CAPITAL GENERATION.
 *
 * §12 forbids authoring the ideal Procedure from the hidden oracle specification. The capital must be
 * TRACEABLE TO ACTUAL PRIOR-GENERATION OBSERVATIONS. So this module does not write a Procedure: it RUNS a
 * deterministic prior-generation ladder against the REAL hidden acceptance, records what each generation
 * actually observed, and returns those observations. The capital documents are then derived from that
 * record, and the Procedure's clause list is the ordered method the generations actually had to discover
 * — in the order the observations forced.
 *
 * WHAT "DETERMINISTIC PRIOR-GENERATION EXPLORATION" MEANS HERE, HONESTLY. The ladder is a SCRIPTED
 * sequence of candidate implementations, not a stochastic model call. Each generation is a plausible next
 * move for an engineer who has just seen the previous generation's failure classes. It is deterministic so
 * the capital is reproducible, and it is a genuine exploration because every recorded observation below is
 * the oracle's REAL output for the REAL candidate — not a narrative.
 *
 * The generations are deliberately NOT the mature implementation. They are what an engineer writes while
 * discovering, in order, that (a) the affected set is a CLOSURE rather than the changed nodes, (b) the
 * whole input must be validated before the first deletion, (c) invalidation runs DESCENDANTS-ward, and
 * (d) an entry naming a dependency the cache does not hold cannot be shown to be unaffected.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const scenarioD = await import(pathToFileURL(join(REPO, 'scripts', 'r2u', 'fixtures', 'scenario-d', 'acceptance.mjs')).href);

const err = (code, message) => Object.assign(new Error(message), { code });

/** The shape checks every generation after D0 performs, kept in one place so the ladder is readable. */
function validateChanged(changed) {
  for (const id of changed) {
    if (typeof id !== 'string' || id.length === 0) throw err('INVALID_NODE_ID', 'every changed node id must be a non-empty string');
  }
}
function validateEntries(cache) {
  for (const id of Object.keys(cache)) {
    const entry = cache[id];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw err('INVALID_ENTRY', `the cache entry for "${id}" must be an object`);
    if (!Object.hasOwn(entry, 'value')) throw err('INVALID_ENTRY', `the cache entry for "${id}" must record the value it produced`);
    if (!Array.isArray(entry.deps)) throw err('INVALID_ENTRY', `the cache entry for "${id}" must record its dependencies as an array`);
  }
}

/* ================================================================ the ladder */

/**
 * Generation D0 — the starting point, reproduced inline so the exploration is self-contained.
 * (The same logic as `fixtures/scenario-d/src/cache.ts`.)
 *
 * It reads the goal literally and deletes the entries whose source changed, and nothing else.
 */
function d0(cache, changed) {
  if (cache === null || typeof cache !== 'object' || Array.isArray(cache)) throw err('INVALID_CACHE', 'the cache must be a plain object');
  if (!Array.isArray(changed)) throw err('INVALID_INPUT', 'the changed set must be an array');
  for (const id of changed) {
    if (typeof id !== 'string' || id.length === 0) throw err('INVALID_NODE_ID', 'every changed node id must be a non-empty string');
    delete cache[id];
  }
  return cache;
}

/**
 * Generation D1 — the engineer notices that a malformed cache is being accepted, and adds the shape
 * checks. But the checks run AFTER the deletions, so an input that turns out to be invalid has already
 * had entries removed from the caller's cache. The closure is still missing entirely.
 */
function d1(cache, changed) {
  if (cache === null || typeof cache !== 'object' || Array.isArray(cache)) throw err('INVALID_CACHE', 'the cache must be a plain object');
  if (!Array.isArray(changed)) throw err('INVALID_INPUT', 'the changed set must be an array');
  validateChanged(changed);
  for (const id of changed) delete cache[id];
  validateEntries(cache);
  return cache;
}

/**
 * Generation D2 — the engineer discovers that a node computed FROM a changed node is stale too, and
 * computes a closure. Two mistakes remain: the closure is walked in BOTH directions, so a node's
 * dependencies are invalidated along with its dependents; and an entry naming a dependency the cache does
 * not hold is left alone rather than treated as unusable.
 */
function d2(cache, changed) {
  if (cache === null || typeof cache !== 'object' || Array.isArray(cache)) throw err('INVALID_CACHE', 'the cache must be a plain object');
  if (!Array.isArray(changed)) throw err('INVALID_INPUT', 'the changed set must be an array');
  validateChanged(changed);
  validateEntries(cache);
  const ids = Object.keys(cache);
  const stale = new Set(changed.filter((id) => Object.hasOwn(cache, id)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of ids) {
      if (stale.has(id)) continue;
      const deps = cache[id].deps;
      // BOTH directions: a dependency that is stale makes this node stale, and a node that is stale makes
      // its dependencies stale too.
      if (deps.some((dep) => stale.has(dep)) || ids.some((other) => !stale.has(other) && cache[other].deps.includes(id) && stale.has(other))) {
        stale.add(id);
        grew = true;
      }
    }
    // ...and the reverse edge, applied to the nodes just marked.
    for (const id of ids) {
      if (stale.has(id)) continue;
      if (cache[id].deps.some((dep) => stale.has(dep))) {
        stale.add(id);
        grew = true;
      }
    }
    for (const id of [...stale]) for (const dep of cache[id].deps) if (Object.hasOwn(cache, dep) && !stale.has(dep)) stale.add(dep);
  }
  for (const id of stale) delete cache[id];
  return cache;
}

/**
 * Generation D3 — the direction is now right (descendants only), but an entry naming a dependency the
 * cache does not hold is still left in place, so a value that cannot be shown to be unaffected survives.
 */
function d3(cache, changed) {
  if (cache === null || typeof cache !== 'object' || Array.isArray(cache)) throw err('INVALID_CACHE', 'the cache must be a plain object');
  if (!Array.isArray(changed)) throw err('INVALID_INPUT', 'the changed set must be an array');
  validateChanged(changed);
  validateEntries(cache);
  const ids = Object.keys(cache);
  const stale = new Set();
  const queue = [];
  const mark = (id) => {
    if (stale.has(id)) return;
    stale.add(id);
    queue.push(id);
  };
  for (const id of changed) mark(id);
  while (queue.length > 0) {
    const node = queue.shift();
    for (const id of ids) if (!stale.has(id) && cache[id].deps.includes(node)) mark(id);
  }
  for (const id of stale) if (Object.hasOwn(cache, id)) delete cache[id];
  return cache;
}

/** Generation D4 — the mature method. The closure is frozen before the first deletion. */
function d4(cache, changed) {
  return scenarioD.invalidateCacheReference(cache, changed);
}

export const SCENARIO_D_GENERATIONS = Object.freeze([
  Object.freeze({ id: 'D0', note: 'the starting point: delete the entries whose source changed', invalidate: d0 }),
  Object.freeze({ id: 'D1', note: 'add shape validation, but after the deletions', invalidate: d1 }),
  Object.freeze({ id: 'D2', note: 'compute a closure, but in both directions', invalidate: d2 }),
  Object.freeze({ id: 'D3', note: 'walk descendants only, but ignore unresolvable dependencies', invalidate: d3 }),
  Object.freeze({ id: 'D4', note: 'freeze the affected set, then delete', invalidate: d4 }),
]);

/* ================================================================ the exploration */

/**
 * Run the ladder against the REAL oracle and record what each generation OBSERVED.
 *
 * The record is the grounding: `observations[g]` is the oracle's own output for generation g, and
 * `discoveries[g]` names the invariant the engineer could infer from those failures and nothing else.
 */
export function explore(input) {
  const { generations, runCases, cases, key } = input;
  const observations = [];
  const discoveries = [];
  for (const generation of generations) {
    const fn = generation.invalidate;
    const outcome = runCases(fn, cases);
    const failed = outcome.results.filter((result) => !result.pass);
    const classes = [...new Set(failed.map((result) => result.failureClass))].sort();
    observations.push(
      Object.freeze({
        generation: generation.id,
        note: generation.note,
        passed: outcome.passed,
        total: outcome.total,
        failedCaseIds: Object.freeze(failed.map((result) => result.id)),
        failureClasses: Object.freeze(classes),
        failedInvariants: Object.freeze([...new Set(failed.map((result) => result.invariant))].sort()),
        details: Object.freeze(failed.map((result) => `${result.id} ${result.invariant} ${result.failureClass} ${result.detail}`.trim())),
      }),
    );
    discoveries.push(inferDiscovery(key, generation.id, failed));
  }
  return Object.freeze({
    scenario: key,
    generations: Object.freeze(generations.map((generation) => generation.id)),
    observations: Object.freeze(observations),
    discoveries: Object.freeze(discoveries),
  });
}

/**
 * The discovery a generation's OWN observed failures force (§12).
 *
 * This reads the FAILED INVARIANTS — the properties the oracle's cases actually exercised — and maps them
 * to the clause an engineer could infer from those failures and nothing else.
 */
function inferDiscovery(key, generationId, failed) {
  if (failed.length === 0) {
    return Object.freeze({
      generation: generationId,
      discovery: 'the oracle accepts this candidate',
      forcedBy: Object.freeze([]),
      detail: 'no failures remained at this generation, so it became the method the capital records',
    });
  }
  const invariants = [...new Set(failed.map((result) => result.invariant))].sort();
  const detail = failed.map((result) => `${result.id}:${result.invariant}:${result.failureClass}`).join(', ');
  const clause = DISCOVERY_BY_INVARIANT[key];
  const discovered = invariants.map((invariant) => clause[invariant] ?? `an unrecognized property failed (${invariant})`);
  return Object.freeze({
    generation: generationId,
    discovery: discovered.join('; and '),
    forcedBy: Object.freeze(invariants),
    detail,
  });
}

/**
 * The invariant → clause mapping. Each clause is the SMALLEST statement the observation supports: it says
 * what must be true, not how to implement it, which is what §12 requires of a Procedure clause.
 */
const DISCOVERY_BY_INVARIANT = Object.freeze({
  D: Object.freeze({
    'changed-node-invalidated': 'the entry for a node whose source changed must not survive the call',
    'unaffected-preserved': 'an entry that is still correct must be preserved, value and dependencies both',
    'unknown-changed-node-is-harmless': 'a changed id that names no cache entry is not itself an error',
    'changed-id-shape-validated': 'a changed id that is not a usable node id must be refused',
    'dependent-closure-invalidated': 'the affected set is a CLOSURE: an entry computed from a stale node is itself stale, transitively',
    'ancestors-preserved': 'invalidation runs DESCENDANTS-ward: a node\'s dependents are stale, its dependencies are not',
    'unresolvable-dependency-is-unusable': 'an entry naming a dependency the cache does not hold cannot be shown to be unaffected, so it must not survive',
    'cycle-terminates': 'the dependency graph is not guaranteed to be a tree, so the closure walk must terminate on a cycle',
    'deep-chain-closure': 'the closure must be followed to its end, however far from the changed node it reaches',
    'rejection-leaves-cache-untouched': 'the whole input must be validated before the first deletion, so a refused call leaves the caller\'s cache exactly as it was',
  }),
});

export function exploreScenarioD() {
  return explore({
    key: 'D',
    generations: SCENARIO_D_GENERATIONS,
    runCases: scenarioD.runCases,
    cases: scenarioD.materialize(scenarioD.HIDDEN_CASES),
  });
}

export function exploreAll() {
  return Object.freeze({ D: exploreScenarioD() });
}
