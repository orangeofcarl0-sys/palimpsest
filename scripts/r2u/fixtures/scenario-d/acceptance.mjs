/**
 * R2-U §6/§10/§11 — SCENARIO D: INCREMENTAL CACHE INVALIDATION. THE HIDDEN ACCEPTANCE.
 *
 * Like the R1-R scenarios, THIS FILE NEVER ENTERS THE WORKER'S WORLD. The worker gets a black-box oracle
 * that names failure classes; it does not get the rule set.
 *
 * THE CONTRACT. `invalidateCache(cache, changed)` updates the caller's cache after a set of source nodes
 * changed. The caller owns `cache` and keeps using it, so the obligations are stronger than "return the
 * right object":
 *
 *   (1) THE AFFECTED CLOSURE IS COMPUTED BEFORE ANY MUTATION. An entry is stale when its source changed,
 *       when it transitively DEPENDS ON a node whose source changed, or when it names a dependency the
 *       cache does not hold (it cannot be shown to be unaffected). Invalidation runs DESCENDANTS-ward: a
 *       node's dependents are stale, its dependencies are not.
 *   (2) THE WHOLE INPUT IS VALIDATED BEFORE THE FIRST DELETION, so a refused call leaves the caller's
 *       cache EXACTLY as it was.
 *   (3) UNAFFECTED ENTRIES ARE PRESERVED, value and dependencies both.
 *
 * The pre-paid cognitive mistake is therefore:
 *
 *     invalidate the changed nodes before the affected closure is computed
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from "node:crypto";

export const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};
export const digestOf = (value) => createHash("sha256").update(canonical(value)).digest("hex");

export class CacheError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CacheError";
    this.code = code;
  }
}

/**
 * THE CORRECT IMPLEMENTATION.
 *
 * (1) Validate the cache's SHAPE and every entry's dependency identity, and every changed id, before
 *     touching anything. (2) Compute the affected set: the changed nodes, every entry naming an
 *     unresolvable dependency, and the transitive DEPENDENTS of both — the walk terminates on cycles
 *     because the affected set is what is visited. (3) Only then delete.
 */
export function invalidateCacheReference(cache, changed) {
  if (cache === null || typeof cache !== "object" || Array.isArray(cache)) {
    throw new CacheError("INVALID_CACHE", "the cache must be a plain object");
  }
  if (!Array.isArray(changed)) throw new CacheError("INVALID_INPUT", "the changed set must be an array");

  /* (1) VALIDATION — entirely before any mutation of `cache`. */
  for (const id of changed) {
    if (typeof id !== "string" || id.length === 0) {
      throw new CacheError("INVALID_NODE_ID", "every changed node id must be a non-empty string");
    }
  }
  const ids = Object.keys(cache);
  for (const id of ids) {
    const entry = cache[id];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new CacheError("INVALID_ENTRY", `the cache entry for "${id}" must be an object`);
    }
    if (!Object.hasOwn(entry, "value")) {
      throw new CacheError("INVALID_ENTRY", `the cache entry for "${id}" must record the value it produced`);
    }
    if (!Array.isArray(entry.deps)) {
      throw new CacheError("INVALID_ENTRY", `the cache entry for "${id}" must record its dependencies as an array`);
    }
    for (const dep of entry.deps) {
      if (typeof dep !== "string" || dep.length === 0) {
        throw new CacheError("INVALID_ENTRY", `the cache entry for "${id}" names a dependency that is not a non-empty string`);
      }
    }
  }

  /* (2) THE AFFECTED SET — computed in full before the first deletion. */
  const stale = new Set();
  const queue = [];
  const markStale = (id) => {
    if (stale.has(id)) return;
    stale.add(id);
    queue.push(id);
  };
  for (const id of changed) markStale(id);
  /** An entry naming a dependency the cache does not hold cannot be shown to be unaffected. */
  for (const id of ids) {
    for (const dep of cache[id].deps) if (!Object.hasOwn(cache, dep)) markStale(id);
  }
  /** The transitive DEPENDENTS of everything already stale. `stale` guards the walk, so cycles terminate. */
  while (queue.length > 0) {
    const node = queue.shift();
    for (const id of ids) {
      if (stale.has(id)) continue;
      if (cache[id].deps.includes(node)) markStale(id);
    }
  }

  /* (3) APPLICATION — only now, and only the entries the frozen set named. */
  for (const id of stale) if (Object.hasOwn(cache, id)) delete cache[id];
  return cache;
}

/* ---------------------------------------------------------------- case sets */

/**
 * VISIBLE cases — copied into the worker's world as `test/cases.json`, WITHOUT the `invariant` field.
 *
 * These cover BASIC behaviour only: invalidating a node that nothing depends on, preserving an unrelated
 * entry, an empty changed set, and refusing a malformed changed id. The non-obvious guarantees — the
 * transitive dependent closure, ancestors being preserved, unresolvable dependencies, cycles, and cache
 * integrity across a rejection — live ONLY in the hidden set, so the worker must reason about what an
 * incremental invalidation owes its caller.
 */
export const VISIBLE_CASES = Object.freeze([
  Object.freeze({ id: "v01", invariant: "changed-node-invalidated", cache: { a: { value: 1, deps: [] }, z: { value: 9, deps: [] } }, changed: ["a"], expect: "accept" }),
  Object.freeze({ id: "v02", invariant: "unaffected-preserved", cache: { a: { value: 1, deps: [] }, b: { value: 2, deps: [] } }, changed: [], expect: "accept" }),
  Object.freeze({ id: "v03", invariant: "unknown-changed-node-is-harmless", cache: { a: { value: 1, deps: [] } }, changed: ["ghost"], expect: "accept" }),
  Object.freeze({ id: "v04", invariant: "changed-id-shape-validated", cache: { a: { value: 1, deps: [] } }, changed: [""], expect: "reject" }),
  Object.freeze({ id: "v05", invariant: "changed-node-invalidated", cache: { a: { value: { n: 1 }, deps: [] }, b: { value: [1, 2], deps: [] } }, changed: ["b"], expect: "accept" }),
]);

/**
 * HIDDEN cases — the authoritative judgement. Never copied into the world.
 *
 * The `cache` field is the CALLER'S object. For an `accept` case, `expected` is the cache afterwards. For
 * a `reject` case, the contract requires the caller's cache to be left EXACTLY as it was: that is the
 * integrity invariant, and it is what a validate-as-you-delete implementation fails.
 *
 *   h01/h02/h07/h12  the transitive DEPENDENT closure
 *   h03/h08          an ANCESTOR of a changed node is NOT stale (direction matters)
 *   h04/h05          an unresolvable dependency makes its holder unusable
 *   h06/h11          a cycle must terminate and still invalidate correctly
 *   h09/h10/h14      REJECTION MUST NOT MUTATE, including when the cache turns invalid after entries
 *                    would already have been deleted
 *   h13              a deep chain, where the closure is far from the seed
 */
export const HIDDEN_CASES = Object.freeze([
  Object.freeze({ id: "h01", invariant: "dependent-closure-invalidated", cache: { a: { value: 1, deps: [] }, b: { value: 2, deps: ["a"] }, c: { value: 3, deps: ["b"] }, z: { value: 9, deps: [] } }, changed: ["a"], expect: "accept" }),
  Object.freeze({ id: "h02", invariant: "dependent-closure-invalidated", cache: { a: { value: 1, deps: [] }, b: { value: 2, deps: ["a"] }, c: { value: 3, deps: ["a"] }, d: { value: 4, deps: ["b", "c"] } }, changed: ["a"], expect: "accept" }),
  Object.freeze({ id: "h03", invariant: "ancestors-preserved", cache: { a: { value: 1, deps: [] }, b: { value: 2, deps: ["a"] }, c: { value: 3, deps: ["b"] } }, changed: ["c"], expect: "accept" }),
  Object.freeze({ id: "h04", invariant: "unresolvable-dependency-is-unusable", cache: { a: { value: 1, deps: [] }, b: { value: 2, deps: ["missing"] }, c: { value: 3, deps: ["b"] } }, changed: [], expect: "accept" }),
  Object.freeze({ id: "h05", invariant: "unresolvable-dependency-is-unusable", cache: { a: { value: 1, deps: ["nope"] } }, changed: [], expect: "accept" }),
  Object.freeze({ id: "h06", invariant: "cycle-terminates", cache: { a: { value: 1, deps: ["b"] }, b: { value: 2, deps: ["a"] }, z: { value: 9, deps: [] } }, changed: ["a"], expect: "accept" }),
  Object.freeze({ id: "h07", invariant: "dependent-closure-invalidated", cache: { leaf: { value: 0, deps: [] }, mid: { value: 1, deps: ["leaf"] }, top: { value: 2, deps: ["mid"] }, other: { value: 3, deps: ["mid"] }, free: { value: 4, deps: [] } }, changed: ["mid"], expect: "accept" }),
  Object.freeze({ id: "h08", invariant: "dependent-closure-invalidated", cache: { base: { value: 0, deps: [] }, mid: { value: 1, deps: ["base"] }, top: { value: 2, deps: ["mid"] } }, changed: ["base"], expect: "accept" }),
  Object.freeze({ id: "h09", invariant: "rejection-leaves-cache-untouched", cache: { keep: { value: 1, deps: [] }, also: { value: 2, deps: [] } }, changed: [42], expect: "reject" }),
  Object.freeze({ id: "h10", invariant: "rejection-leaves-cache-untouched", cache: { a: { value: 1, deps: [] }, bad: { value: 2, deps: "a" } }, changed: ["a"], expect: "reject" }),
  Object.freeze({ id: "h11", invariant: "cycle-terminates", cache: { x: { value: 1, deps: ["y"] }, y: { value: 2, deps: ["z"] }, z: { value: 3, deps: ["x"] }, lonely: { value: 4, deps: [] } }, changed: ["y"], expect: "accept" }),
  Object.freeze({ id: "h12", invariant: "dependent-closure-invalidated", cache: { a: { value: 1, deps: [] }, b: { value: 2, deps: ["a"] }, c: { value: 3, deps: ["b"] }, d: { value: 4, deps: ["c"] }, e: { value: 5, deps: ["d"] } }, changed: ["a"], expect: "accept" }),
  Object.freeze({ id: "h13", invariant: "deep-chain-closure", cache: { n0: { value: 0, deps: [] }, n1: { value: 1, deps: ["n0"] }, n2: { value: 2, deps: ["n1"] }, n3: { value: 3, deps: ["n2"] }, n4: { value: 4, deps: ["n3"] }, n5: { value: 5, deps: ["n4"] }, unrelated: { value: 6, deps: [] } }, changed: ["n0"], expect: "accept" }),
  // REJECTION MUST NOT MUTATE: the cache is non-empty and an entry is malformed, so a validate-as-you-go
  // implementation would already have deleted the changed node before discovering the bad entry.
  Object.freeze({ id: "h14", invariant: "rejection-leaves-cache-untouched", cache: { a: { value: 1, deps: [] }, b: { value: 2, deps: ["a"] }, broken: { deps: [] } }, changed: ["a"], expect: "reject" }),
]);

export function firstDifference(left, right, path = "") {
  if (canonical(left) === canonical(right)) return null;
  const both = left !== null && right !== null && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right);
  if (both) {
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      const inner = firstDifference(left[key], right[key], path === "" ? key : `${path}.${key}`);
      if (inner !== null) return inner;
    }
  }
  return path === "" ? "(root)" : path;
}

/**
 * Judge ONE case.
 *
 * The candidate is given a FRESH COPY of the case's caller cache, so a mutation it performs cannot leak
 * into the next case. For a rejection the copy is compared against the original: any difference is the
 * cache-integrity violation, reported as its own named class rather than folded into a generic failure.
 */
export function judgeCase(invalidate, testCase) {
  const callerCache = structuredClone(testCase.cache);
  const before = canonical(callerCache);
  let outcome;
  try {
    invalidate(callerCache, testCase.changed);
    outcome = { kind: "returned" };
  } catch (error) {
    outcome = { kind: "threw", code: error?.code ?? error?.name ?? "Error" };
  }
  const invariant = testCase.invariant;

  if (testCase.expect === "reject") {
    if (outcome.kind === "returned") {
      return { id: testCase.id, invariant, pass: false, failureClass: "ACCEPTED_INVALID_INPUT", detail: canonical(callerCache).slice(0, 120) };
    }
    if (canonical(callerCache) !== before) {
      return { id: testCase.id, invariant, pass: false, failureClass: "MUTATED_CACHE_BEFORE_REJECTING", detail: `the caller's cache changed from ${before} to ${canonical(callerCache)}` };
    }
    return { id: testCase.id, invariant, pass: true, failureClass: null, detail: "" };
  }

  if (outcome.kind === "threw") return { id: testCase.id, invariant, pass: false, failureClass: "REJECTED_BUT_SHOULD_ACCEPT", detail: outcome.code };
  if (digestOf(callerCache) !== testCase.digest) {
    return { id: testCase.id, invariant, pass: false, failureClass: "WRONG_CACHE", detail: `first difference at ${firstDifference(callerCache, testCase.expected)}` };
  }
  return { id: testCase.id, invariant, pass: true, failureClass: null, detail: "" };
}

/** Attach the reference result and digest to each case. `invariant` is retained for the teacher/tests. */
export function materialize(cases) {
  return cases.map((testCase) => {
    if (testCase.expect !== "accept") return { id: testCase.id, invariant: testCase.invariant, cache: testCase.cache, changed: testCase.changed, expect: testCase.expect };
    const expected = invalidateCacheReference(structuredClone(testCase.cache), testCase.changed);
    return { id: testCase.id, invariant: testCase.invariant, cache: testCase.cache, changed: testCase.changed, expect: testCase.expect, digest: digestOf(expected), expected };
  });
}

/**
 * The WORKER-VISIBLE form: the case, the caller's cache, and — for accepted cases — the expected cache
 * afterwards. No invariant name, no rule text.
 */
export function materializeVisible(cases) {
  return materialize(cases).map((entry) => {
    const { invariant: _invariant, ...visible } = entry;
    return visible;
  });
}

export function runCases(invalidate, cases) {
  const results = cases.map((testCase) => judgeCase(invalidate, testCase));
  return { results, passed: results.filter((r) => r.pass).length, total: results.length };
}
