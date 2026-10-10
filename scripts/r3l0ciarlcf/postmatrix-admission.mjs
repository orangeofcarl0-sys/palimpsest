/**
 * R3-L0C-I-A-R-L-C-F §4/§5 — THE AUTHORITATIVE TERMINAL ADMISSION.
 *
 * WHAT THIS SUPERSEDES. The prior stage's reducer (`scripts/r3l0ciarlc/postmatrix-admission.mjs`) was the single
 * authoritative decision point inside the frozen runner's `validityGate` — which was the right shape — but it
 * computed `IDENTITIES_EXACT` from the caller-supplied IN-MEMORY `records` while the cost bridge independently read
 * `TRIAL_RECORDED` from the durable journal. Measured by `baseline/legacy-controls.mjs controlDividedIdentities`: a
 * durable trial carrying a different arm left the gate GREEN.
 *
 * WHAT THIS DOES INSTEAD. The reducer decides over ONE coherent evidence set:
 *
 *   · the durable reconciliation (§5) derives the authoritative session set from the journal and checks it against
 *     the in-memory observation, so a disagreement is a FAILING CONDITION rather than an invisible one;
 *   · the freshness measurement (§3) reports whether the closure and the route were RECOMPUTED at this instant and
 *     whether they match the plan, rather than comparing a captured object to itself;
 *   · the attestation is the S0/S1/S2 sequence (§7), unchanged in method;
 *   · the frozen post-matrix validity gate remains a required condition.
 *
 * THE FROZEN RUNNER IS UNCHANGED. `runFailStopMatrix` still calls `validityGate` BEFORE it writes its completion
 * decision, and still reads exactly the `green` field. So a RED here is a RED at the decision point.
 *
 * THE FROZEN DISTINCTION IS PRESERVED. A mechanically valid deterministic matrix may reach `MATRIX_COMPLETE` while
 * its causal evaluability stays NO, because its artifacts are FIXTURE or absent as the frozen protocol allows. This
 * reducer decides MECHANICAL completion; the causal admission is the separate reduction in
 * `durable-reconciliation.mjs causalEvaluability`.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { NL, RED_CONSEQUENCES, TERMINAL_DECISIONS } from './contract.mjs';

/** §4: the conditions, as data, so the reducer and the report agree on the set. */
export const REQUIRED_TERMINAL_CONDITIONS = Object.freeze([
  Object.freeze({ id: 'JOURNAL_TRUSTWORTHY', detail: 'the durable journal is intact — no torn tail and no write left in flight' }),
  Object.freeze({ id: 'DURABLE_TRIAL_CONSISTENCY', detail: 'the durable journal and the in-memory observation agree on every session identity, with exactly one trial per planned session' }),
  Object.freeze({ id: 'LAUNCH_CARDINALITY_EXACT', detail: 'exactly one exposure intent and one launch per planned session, and no unplanned launch' }),
  Object.freeze({ id: 'SIDECAR_CONTINUITY', detail: 'every session\'s live-evidence sidecar survived into the durable record, digest-verified' }),
  Object.freeze({ id: 'COST_ATTRIBUTION', detail: 'every session\'s cost is either measured or carries an explicit labelled absence, and no session is silently dropped' }),
  Object.freeze({ id: 'CLOSURE_FRESH_MATCH', detail: 'the closure was RECOMPUTED at terminal admission and still matches the plan' }),
  Object.freeze({ id: 'ROUTE_FRESH_MATCH', detail: 'the effective route was RECOMPUTED at terminal admission and still matches the plan' }),
  Object.freeze({ id: 'FRESHNESS_BASIS_RECORDED', detail: 'the admission-time measurement recorded its basis, so a captured preflight object is distinguishable from a fresh measurement' }),
  Object.freeze({ id: 'RUNTIME_ATTESTED', detail: 'the current runtime attestation holds: S1 matches the expected bundle and S2 matches S1' }),
  Object.freeze({ id: 'FROZEN_POSTMATRIX_VALIDITY', detail: 'the frozen nine-condition post-matrix validity gate is green' }),
]);

/** §4: the terminal decision vocabulary. GREEN is the only value under which the runner may complete. */
export const TERMINAL_DECISION_VALUES = TERMINAL_DECISIONS;

/**
 * §4/§5: THE AUTHORITATIVE TERMINAL-ADMISSION REDUCER.
 *
 * `durableReconciliation` is the §5 reconciliation over the durable journal; `freshness` is the §3 admission-time
 * measurement; `attestation` is the S1/S2 comparison; `costAttribution` is the durable bridge's result. Every input
 * is a measurement taken here or carried from the durable journal — none is a caller's assertion.
 */
export async function authoritativeTerminalAdmission(input) {
  const {
    completed, records, plannedSessions, schedule, plan,
    journalPath, journalReader, liveEvidenceContinuity, costAttribution,
    durableReconciliation, freshness, attestation, postMatrixValidity,
  } = input;

  const journal = journalReader(journalPath);
  const conditions = [];
  const add = (id, holds, detail) => conditions.push(Object.freeze({ id, holds: holds === true, detail: detail ?? null }));

  /** 1. THE JOURNAL. A torn tail or a write left in flight makes every later reading untrustworthy. */
  add('JOURNAL_TRUSTWORTHY', journal.JOURNAL_INTACT === true && journal.INTERRUPTED_WRITE_DETECTED !== true && journal.WRITE_IN_FLIGHT_DETECTED !== true,
    `intact=${String(journal.JOURNAL_INTACT)} interrupted=${String(journal.INTERRUPTED_WRITE_DETECTED)} writeInFlight=${String(journal.WRITE_IN_FLIGHT_DETECTED)}`);

  /**
   * 2. THE DURABLE TRIAL CONSISTENCY, from the DURABLE journal rather than from the in-memory records.
   *
   * This is the F3 correction. The reconciliation derives the authoritative session set from the journal, checks
   * exactly one trial per planned session, checks the exact frozen identity, and checks that the in-memory
   * observation AGREES with the durable one.
   */
  add('DURABLE_TRIAL_CONSISTENCY', durableReconciliation?.green === true,
    `failing=[${(durableReconciliation?.failing ?? ['RECONCILIATION_ABSENT']).join(', ')}]`);

  /** 3. THE LAUNCH CARDINALITY, from the durable journal. */
  const launchesBySession = new Map();
  const exposuresBySession = new Map();
  for (const entry of journal.records) {
    const sessionId = entry.payload?.sessionId ?? null;
    if (sessionId === null) continue;
    if (entry.kind === 'WORKER_LAUNCH_RECORDED') launchesBySession.set(sessionId, (launchesBySession.get(sessionId) ?? 0) + 1);
    if (entry.kind === 'EXPOSURE_INTENT_RECORDED') exposuresBySession.set(sessionId, (exposuresBySession.get(sessionId) ?? 0) + 1);
  }
  const retries = [...launchesBySession.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
  const plannedSet = new Set(plannedSessions ?? []);
  const unplannedLaunches = [...launchesBySession.keys()].filter((sessionId) => !plannedSet.has(sessionId));
  const missingLaunches = [...plannedSet].filter((sessionId) => launchesBySession.get(sessionId) !== 1);
  const missingExposures = [...plannedSet].filter((sessionId) => exposuresBySession.get(sessionId) !== 1);
  add('LAUNCH_CARDINALITY_EXACT',
    retries === 0 && unplannedLaunches.length === 0 && missingLaunches.length === 0 && missingExposures.length === 0,
    `retries=${String(retries)} unplannedLaunches=[${unplannedLaunches.join(', ')}] missingLaunches=[${missingLaunches.join(', ')}] missingExposures=[${missingExposures.join(', ')}]`);

  /** 4. THE SIDECAR CONTINUITY, from the durable binding. */
  const continuity = liveEvidenceContinuity;
  add('SIDECAR_CONTINUITY', continuity?.LIVE_ARTIFACT_PROPAGATION === 'PASS',
    `sessions=${String(continuity?.sessions ?? 'ABSENT')} allBound=${String(continuity?.allBound)} allMatched=${String(continuity?.allMatched)} allComplete=${String(continuity?.allComplete)}`);

  /** 5. THE COST ATTRIBUTION, from the durable bridge. */
  add('COST_ATTRIBUTION', costAttribution !== null && costAttribution !== undefined && costAttribution.interpretable === true,
    `interpretable=${String(costAttribution?.interpretable)} measured=${String(costAttribution?.measuredCount)} absent=${String(costAttribution?.absentCount)} planned=${String(costAttribution?.plannedSessions)}`);

  /** 6/7. THE FRESH CLOSURE AND ROUTE, from the §3 admission-time measurement. */
  const boundClosure = plan?.executionClosure?.executionClosureDigest ?? null;
  add('CLOSURE_FRESH_MATCH', freshness?.closureMatchesPlan === true,
    `basis=${String(freshness?.basis)} plan=${String(boundClosure).slice(0, 16)} admission=${String(freshness?.admissionClosureDigest).slice(0, 16)} preflight=${String(freshness?.preflightClosureDigest).slice(0, 16)}`);
  add('ROUTE_FRESH_MATCH', freshness?.routeMatchesPlan === true,
    `admissionRoute=${String(freshness?.admissionRouteIdentity)} preflightRoute=${String(freshness?.preflightRouteIdentity)}`);

  /**
   * 8. THE FRESHNESS BASIS. §3 requires the measurement basis to be recorded, so a captured preflight object is
   * distinguishable from a fresh measurement. An unrecorded basis is a FAILURE, not a neutral absence.
   */
  add('FRESHNESS_BASIS_RECORDED', typeof freshness?.basis === 'string' && freshness.basis !== '' && freshness.fresh === true,
    `basis=${String(freshness?.basis)} fresh=${String(freshness?.fresh)}`);

  /** 9. THE IN-RUN RUNTIME ATTESTATION. */
  add('RUNTIME_ATTESTED', attestation?.IN_RUN_ATTESTATION === 'PASS',
    `s1MatchesExpected=${String(attestation?.s1MatchesExpectedBundle)} s2MatchesS1=${String(attestation?.s2MatchesS1)} competingWriter=${String(attestation?.competingWriterDetected)}`);

  /** 10. THE FROZEN NINE-CONDITION POST-MATRIX GATE. */
  add('FROZEN_POSTMATRIX_VALIDITY', postMatrixValidity?.green === true,
    postMatrixValidity?.detail ?? 'the frozen post-matrix validity gate did not report green');

  const failing = conditions.filter((condition) => condition.holds !== true).map((condition) => condition.id);
  const green = failing.length === 0;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F',
    kind: 'authoritative terminal admission',
    /** The frozen runner reads exactly this field. GREEN is the only value under which it may complete. */
    green,
    decision: green ? TERMINAL_DECISIONS.GREEN : TERMINAL_DECISIONS.RED,
    conditions: Object.freeze(conditions),
    failing: Object.freeze(failing),
    requiredConditions: REQUIRED_TERMINAL_CONDITIONS.map((entry) => entry.id),
    /** §5: the journal was read HERE, so a completion decision is made over the durable record. */
    journalReadAtAdmission: true,
    journalIntact: journal.JOURNAL_INTACT,
    durableTrialConsistency: durableReconciliation?.green === true,
    durableSessionSet: durableReconciliation?.authoritativeSessionSet ?? null,
    retries,
    unplannedLaunches: Object.freeze(unplannedLaunches),
    /** §3: the admission-time measurement, carried whole so a reader sees the basis and the preflight digest. */
    freshness: freshness ?? null,
    freshClosureDigest: freshness?.admissionClosureDigest ?? null,
    preflightClosureDigest: freshness?.preflightClosureDigest ?? null,
    boundClosureDigest: boundClosure,
    routeIdentity: freshness?.admissionRouteIdentity ?? null,
    measurementBasis: freshness?.basis ?? null,
    detail: green
      ? `all ${String(conditions.length)} terminal-admission conditions hold over ${String(completed.length)} session(s); the durable journal was read at admission, the closure and route were RECOMPUTED here, and the durable and in-memory identities agree`
      : `terminal admission is RED: [${failing.join(', ')}]`,
    /** §4: the consequences of a RED, carried so a reader sees what it forbids. */
    onRed: RED_CONSEQUENCES,
    thisReducerIsTheFirstSightingOfACausalValidityFailure: true,
    frozenStateMachineUnchanged: true,
    law: 'there is ONE authoritative terminal-admission reducer, it decides before the runner writes its completion decision, and it decides over the durable journal reconciled against the in-memory observation',
  });
}

export { NL };
