/**
 * R3-L0C-I-A-R-L §2 — THE FRESH POSTFLIGHT EVIDENCE.
 *
 * THE DEFECT THIS CLOSES, measured in L2. The post-matrix gate captured the PREFLIGHT `closure`, `containment`
 * and route objects and compared the digest it had already seen, so a runtime change between preflight and
 * postflight was invisible to it. And the retry and replacement counts were caller-supplied numbers
 * (`input.replacements ?? 0`, `input.retries ?? 0`) rather than derivations from the durable journal.
 *
 * THE REPAIR HAS THREE PARTS, and each answers a different question:
 *
 *   1. RECOMPUTE THE CLOSURE AND THE EFFECTIVE RUNTIME CONFIGURATION AFTER THE MATRIX, and compare them against
 *      the plan's binding. A mutation applied after preflight therefore shows up as a postflight drift.
 *   2. DERIVE THE RETRY AND REPLACEMENT COUNTS FROM THE DURABLE JOURNAL. The journal is the record of what was
 *      actually launched, so a count read from it cannot be supplied by a caller.
 *   3. COMPARE EVERY SESSION'S EXACT FROZEN IDENTITY — block, arm, generation, trajectory — against the plan's
 *      schedule, so a session recorded under a different identity is a failure rather than a surprise later.
 *
 * WHY THE CLOSURE IS RECOMPUTED RATHER THAN COMPARED TO A REMEMBERED VALUE. A remembered value proves only that
 * the runtime was what the preflight saw. The property §2 asks for is that the runtime at POSTFLIGHT time is still
 * the planned one, which requires reading it again.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs';

import { NL } from './contract.mjs';

/** §2: the frozen schedule shape, so the identity comparison knows what "complete" means. */
export const EXPECTED_SHAPE = Object.freeze({ pairedBlocks: 4, arms: 2, generations: 2, sessions: 16, trajectories: 8 });

/**
 * §2: DERIVE THE RETRY AND REPLACEMENT COUNTS FROM THE DURABLE JOURNAL.
 *
 * A retry is a SECOND launch record for one session, and a replacement is a session id that appears in the journal
 * but not in the plan (or vice versa). Both are read from the journal rather than accepted from a caller.
 */
export function deriveCountsFromJournal(input) {
  const { journalRecords, plannedSessions } = input;
  const launchesBySession = new Map();
  for (const record of journalRecords) {
    if (record.kind !== 'WORKER_LAUNCH_RECORDED') continue;
    const sessionId = record.payload?.sessionId ?? null;
    if (sessionId === null) continue;
    launchesBySession.set(sessionId, (launchesBySession.get(sessionId) ?? 0) + 1);
  }
  const retries = [...launchesBySession.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
  const planned = new Set(plannedSessions ?? []);
  const launched = new Set(launchesBySession.keys());
  const unplannedLaunches = [...launched].filter((sessionId) => !planned.has(sessionId));
  const sessionsNeverLaunched = [...planned].filter((sessionId) => !launched.has(sessionId));
  return Object.freeze({
    kind: 'counts derived from the durable journal',
    launchesBySession: Object.freeze(Object.fromEntries([...launchesBySession.entries()].sort())),
    totalLaunches: [...launchesBySession.values()].reduce((total, count) => total + count, 0),
    retries,
    replacements: unplannedLaunches.length,
    unplannedLaunches: Object.freeze(unplannedLaunches),
    sessionsNeverLaunched: Object.freeze(sessionsNeverLaunched),
    /** §2: the property. No session was launched twice and none was replaced. */
    noRetries: retries === 0,
    noReplacements: unplannedLaunches.length === 0,
    derivedFromCallerSuppliedNumbers: false,
    law: 'the retry and replacement counts are derived from the durable journal, not supplied by a caller',
  });
}

/**
 * §2: COMPARE EVERY SESSION'S EXACT FROZEN IDENTITY.
 *
 * Each recorded session is matched to its planned session by id, and the four identity fields must agree exactly.
 * A recorded session with no planned counterpart, a planned session with no record, and a mismatched field are
 * each reported separately, because they are different faults.
 */
export function compareSessionIdentities(input) {
  const { records, schedule } = input;
  const planned = new Map(schedule.map((session) => [session.sessionId, session]));
  const mismatches = [];
  const unplanned = [];
  for (const record of records) {
    const session = planned.get(record.sessionId);
    if (session === undefined) { unplanned.push(record.sessionId); continue; }
    for (const field of ['block', 'arm', 'generation', 'trajectoryId']) {
      if (String(record[field]) !== String(session[field])) {
        mismatches.push(Object.freeze({ sessionId: record.sessionId, field, recorded: record[field], planned: session[field] }));
      }
    }
  }
  const recordedIds = new Set(records.map((record) => record.sessionId));
  const missing = [...planned.keys()].filter((sessionId) => !recordedIds.has(sessionId));
  const uniqueRecorded = recordedIds.size;
  const trajectories = new Set(records.map((record) => record.trajectoryId));
  const blocks = new Set(records.map((record) => record.block));
  return Object.freeze({
    kind: 'session identity comparison',
    recorded: records.length,
    uniqueRecorded,
    planned: planned.size,
    identityMismatches: Object.freeze(mismatches),
    unplannedSessions: Object.freeze(unplanned),
    missingSessions: Object.freeze(missing),
    distinctTrajectories: trajectories.size,
    distinctBlocks: blocks.size,
    /** §2: the four properties. */
    allIdentitiesExact: mismatches.length === 0 && unplanned.length === 0 && missing.length === 0,
    allSixteenUnique: uniqueRecorded === EXPECTED_SHAPE.sessions && records.length === EXPECTED_SHAPE.sessions,
    eightTrajectories: trajectories.size === EXPECTED_SHAPE.trajectories,
    fourBlocks: blocks.size === EXPECTED_SHAPE.pairedBlocks,
    law: 'every session is compared to its exact frozen block, arm, generation and trajectory identity',
  });
}

/**
 * §2: RECOMPUTE THE RUNTIME AFTER THE MATRIX AND COMPARE IT AGAINST THE PLAN.
 *
 * `recompute` is injected so the caller supplies the actual recomputation (the closure and the effective route);
 * this function only decides. The comparison is against the PLAN's binding, so a drift is a drift regardless of
 * what the preflight saw.
 */
export async function freshPostflight(input) {
  const { plan, preflightClosureDigest, recompute } = input;
  const fresh = await recompute();
  const bound = plan?.executionClosure?.executionClosureDigest ?? null;
  const freshClosureDigest = fresh.closure?.executionClosureDigest ?? null;
  const closureMatchesPlan = typeof bound === 'string' && bound !== '' && freshClosureDigest === bound;
  const routeIdentity = fresh.route?.MODEL_ROUTE_IDENTITY ?? fresh.routeIdentity ?? null;
  const routeMatchesPlan = routeIdentity === 'MATCH';
  return Object.freeze({
    kind: 'fresh postflight evidence',
    preflightClosureDigest,
    freshClosureDigest,
    boundClosureDigest: bound,
    closureMatchesPlan,
    /** §2: whether the runtime MOVED between preflight and postflight. */
    runtimeMovedAfterPreflight: preflightClosureDigest !== null && preflightClosureDigest !== undefined && preflightClosureDigest !== freshClosureDigest,
    routeIdentity,
    routeMatchesPlan,
    runtimeConfiguration: fresh.route ?? null,
    systemValid: fresh.systemValid ?? null,
    environmentValid: fresh.environmentValid ?? null,
    /** §2: the property. The runtime at postflight is still the planned one. */
    POSTFLIGHT_FRESHNESS: closureMatchesPlan && routeMatchesPlan ? 'PASS' : 'FAIL',
    law: 'the closure and the effective runtime configuration are recomputed AFTER the matrix and compared against the plan',
  });
}

/** §2: read the durable journal, so the counts come from the record rather than from memory. */
export function readJournalRecords(journalPath) {
  if (!existsSync(journalPath)) return Object.freeze([]);
  const lines = readFileSync(journalPath, 'utf8').split(/\r?\n/u).filter((line) => line.trim() !== '');
  const records = [];
  for (const line of lines) {
    try { records.push(JSON.parse(line)); } catch { /* a torn line is the journal reader's concern, not this one's */ }
  }
  return Object.freeze(records);
}

export { NL };
