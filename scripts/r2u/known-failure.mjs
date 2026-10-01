#!/usr/bin/env node
/**
 * R2-U §10/§18 — THE PRE-PAID COGNITIVE MISTAKE FOR SCENARIO D, AND HOW ITS RECURRENCE IS MEASURED.
 *
 * The detector is BEHAVIOURAL: it runs the candidate against a small DIAGNOSTIC PROBE whose only purpose
 * is to separate "this implementation has the closure ordering wrong" from "this implementation failed
 * some case". Private reasoning is never inspected.
 *
 * The distinction matters because recurrence is recorded as its OWN outcome, separate from acceptance. An
 * implementation can pass acceptance and still invalidate in the wrong ORDER on inputs the oracle does not
 * exercise; an implementation can fail acceptance for a reason that is not this mistake at all.
 *
 * WHY THE PROBES ARE NARROW. Each probe is chosen so that ONLY the ordering mistake produces the observed
 * signal, and so that the CORRECT method passes it. None of them is in the visible or hidden case lists,
 * so they cannot be answered by memorising those.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

import { detectC as detectScenarioC } from '../r1r/known-failure.mjs';

export { detectB, detectC } from '../r1r/known-failure.mjs';

/* ---------------------------------------------------------------- scenario D */

/**
 * D's mistake: `invalidate the changed nodes before the affected closure is computed`.
 *
 * Five fingerprints, all of which mean the deletion was entangled with the closure computation:
 *
 *   (a) a DEPENDENT of a changed node was left in place — the closure was not followed at all;
 *   (b) an ANCESTOR of a changed node was discarded — the closure was walked in both directions;
 *   (c) an entry naming a dependency the cache does not hold SURVIVED — it cannot be shown to be current;
 *   (d) a REFUSED call left the caller's cache changed — validation happened after the deletions;
 *   (e) a CYCLE did not terminate, or was not invalidated correctly.
 *
 * Each probe runs against a FRESH caller cache, so one probe's mutation cannot leak into the next.
 */
export const D_PROBES = Object.freeze([
  Object.freeze({
    id: 'p01',
    why: 'a node computed from a changed node is stale and must not survive',
    cache: { a: { value: 1, deps: [] }, b: { value: 2, deps: ['a'] }, c: { value: 3, deps: ['b'] }, free: { value: 4, deps: [] } },
    changed: ['a'],
    expect: 'accept',
    survivors: ['free'],
    absent: ['a', 'b', 'c'],
  }),
  Object.freeze({
    id: 'p02',
    why: 'a node the changed node was computed FROM is still correct and must survive',
    cache: { base: { value: 0, deps: [] }, mid: { value: 1, deps: ['base'] }, top: { value: 2, deps: ['mid'] } },
    changed: ['top'],
    expect: 'accept',
    survivors: ['base', 'mid'],
    absent: ['top'],
  }),
  Object.freeze({
    id: 'p03',
    why: 'an entry naming a dependency the cache does not hold cannot be shown to be current',
    cache: { a: { value: 1, deps: [] }, orphan: { value: 2, deps: ['gone'] }, free: { value: 3, deps: [] } },
    changed: [],
    expect: 'accept',
    survivors: ['a', 'free'],
    absent: ['orphan'],
  }),
  Object.freeze({
    id: 'p04',
    why: 'a refused call must leave the caller\'s cache exactly as it was',
    cache: { a: { value: 1, deps: [] }, b: { value: 2, deps: ['a'] } },
    changed: ['a', 7],
    expect: 'reject',
    untouched: true,
  }),
  Object.freeze({
    id: 'p05',
    why: 'the dependency graph may contain a cycle, which the closure walk must terminate on',
    cache: { x: { value: 1, deps: ['y'] }, y: { value: 2, deps: ['x'] }, z: { value: 3, deps: [] } },
    changed: ['x'],
    expect: 'accept',
    survivors: ['z'],
    absent: ['x', 'y'],
  }),
]);

/**
 * D's detector. Every probe is checked for the property its `why` names, so a failure to terminate is a
 * violation rather than a hang: the probes are run under a wall-clock guard by the caller, and an
 * implementation that loops is reported as a non-terminating closure walk.
 */
export function detectD(invalidate) {
  const violations = [];
  for (const probe of D_PROBES) {
    const cache = structuredClone(probe.cache);
    const before = JSON.stringify(cache);
    let outcome;
    try {
      invalidate(cache, probe.changed);
      outcome = { kind: 'returned' };
    } catch (error) {
      outcome = { kind: 'threw', code: error?.code ?? error?.name ?? 'Error' };
    }

    if (probe.expect === 'reject') {
      if (outcome.kind === 'returned') {
        violations.push({ probe: probe.id, why: probe.why, detail: `the invalid input was accepted (${JSON.stringify(cache)})` });
        continue;
      }
      if (JSON.stringify(cache) !== before) {
        violations.push({ probe: probe.id, why: probe.why, detail: `the caller's cache was mutated before the refusal (${before} -> ${JSON.stringify(cache)})` });
      }
      continue;
    }

    if (outcome.kind === 'threw') {
      violations.push({ probe: probe.id, why: probe.why, detail: `a valid input was refused (${outcome.code})` });
      continue;
    }
    for (const id of probe.absent ?? []) {
      if (Object.hasOwn(cache, id)) violations.push({ probe: probe.id, why: probe.why, detail: `the stale entry "${id}" survived` });
    }
    for (const id of probe.survivors ?? []) {
      if (!Object.hasOwn(cache, id)) violations.push({ probe: probe.id, why: probe.why, detail: `the still-correct entry "${id}" was discarded` });
    }
  }
  return Object.freeze({
    detector: 'invalidateBeforeClosureFrozen',
    recurred: violations.length > 0,
    violations: Object.freeze(violations),
    probesRun: D_PROBES.length,
  });
}

/**
 * Dispatch by scenario id.
 *
 * SYNCHRONOUS on purpose. The trial harness calls this while assembling a trial record, and an async
 * version returns a PROMISE — which `JSON.stringify` renders as `{}`, so every trial would have recorded an
 * empty known-failure object and the recurrence measure would have silently read as UNKNOWN. The R1-R
 * detectors are imported statically here for the same reason: a dynamic import would force the call to be
 * async again.
 */
export function detectKnownFailure(scenarioId, fn) {
  if (scenarioId === 'C') return detectScenarioC(fn);
  if (scenarioId === 'D') return detectD(fn);
  throw new Error(`no known-failure detector for scenario ${scenarioId}`);
}
