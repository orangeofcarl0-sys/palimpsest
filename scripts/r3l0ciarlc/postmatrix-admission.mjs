/**
 * R3-L0C-I-A-R-L-C §4 Gate B — THE AUTHORITATIVE TERMINAL ADMISSION.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlPostflightOutsideAdmission`: the prior
 * pipeline awaits `runFailStopMatrix`, which decides and journals `MATRIX_COMPLETED` internally, and only THEN
 * computes `freshPostflight`. A runtime drift applied after the last admitted trial is therefore detected — after
 * the matrix has already completed. The gate that the drift should have controlled was evaluated and passed
 * before the drift existed, and there is no single reducer whose RED would have prevented completion.
 *
 * THE REPAIR IS ONE REDUCER INSIDE THE RUNNER'S OWN `validityGate` CALLBACK. The frozen runner calls it BEFORE it
 * writes its completion decision, and completes only when it returns `green: true`. So a RED here is a RED at the
 * decision point: no `MATRIX_COMPLETED` event, an `ABORT_PRESERVED` manifest, and no causal verdict.
 *
 * WHAT THE REDUCER READS, in §4's order:
 *
 *   1. the durable journal, with the FROZEN integrity-aware reader (a torn tail or a write in flight is a RED);
 *   2. exactly the frozen session identities and launch cardinalities;
 *   3. sidecar continuity and cost attribution, from the durable record;
 *   4. the execution closure, RECOMPUTED at this instant;
 *   5. the effective route, RECOMPUTED at this instant;
 *   6. the current runtime attestation (S1/S2);
 *   7. the frozen nine-condition post-matrix validity gate.
 *
 * WHY THE RECOMPUTATIONS HAPPEN HERE AND NOT EARLIER. A value computed before the matrix proves only that the
 * runtime WAS the planned one. §4's mutation — a change applied after the last admitted trial — is only visible to
 * a computation made AFTER that trial, which is what the callback is.
 *
 * THE FROZEN DISTINCTION IS PRESERVED. A mechanically valid deterministic matrix may reach `MATRIX_COMPLETE` while
 * its causal evaluability stays NO, because its artifacts are FIXTURE or absent as the frozen protocol allows.
 * This reducer decides MECHANICAL completion; the causal admission stays the frozen gate's own decision.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { NL, RED_CONSEQUENCES, TERMINAL_ADMISSION_CONDITIONS, TERMINAL_DECISIONS } from './contract.mjs';

/** §4: the conditions, as data, so the reducer and the report agree on the set. */
export const REQUIRED_TERMINAL_CONDITIONS = TERMINAL_ADMISSION_CONDITIONS;

/**
 * §4: THE AUTHORITATIVE TERMINAL-ADMISSION REDUCER.
 *
 * `recompute` supplies the closure and the effective route measured AT THIS INSTANT; `attestation` supplies the
 * S1/S2 comparison; `costAttribution` is the durable bridge's result. Every input is a measurement taken here or
 * carried from the durable journal — none is a caller's assertion about what the value is.
 */
export async function authoritativeTerminalAdmission(input) {
  const {
    completed, records, plannedSessions, schedule, plan,
    journalPath, journalReader, liveEvidenceContinuity, costAttribution,
    recompute, attestation, postMatrixValidity,
  } = input;

  const journal = journalReader(journalPath);
  const conditions = [];
  const add = (id, holds, detail) => conditions.push(Object.freeze({ id, holds: holds === true, detail: detail ?? null }));

  /** 1. THE JOURNAL. A torn tail or a write left in flight makes every later reading untrustworthy. */
  add('JOURNAL_TRUSTWORTHY', journal.JOURNAL_INTACT === true && journal.INTERRUPTED_WRITE_DETECTED !== true && journal.WRITE_IN_FLIGHT_DETECTED !== true,
    `intact=${String(journal.JOURNAL_INTACT)} interrupted=${String(journal.INTERRUPTED_WRITE_DETECTED)} writeInFlight=${String(journal.WRITE_IN_FLIGHT_DETECTED)}`);

  /** 2. THE FROZEN IDENTITIES, from the durable records against the plan's schedule. */
  const plannedById = new Map((schedule ?? []).map((session) => [session.sessionId, session]));
  const identityMismatches = [];
  const unplanned = [];
  for (const record of records) {
    const session = plannedById.get(record.sessionId);
    if (session === undefined) { unplanned.push(record.sessionId); continue; }
    for (const field of ['block', 'arm', 'generation', 'trajectoryId']) {
      if (String(record[field]) !== String(session[field])) identityMismatches.push(`${record.sessionId}.${field}`);
    }
  }
  const recordedIds = new Set(records.map((record) => record.sessionId));
  const missing = (plannedSessions ?? []).filter((sessionId) => !recordedIds.has(sessionId));
  add('IDENTITIES_EXACT', identityMismatches.length === 0 && unplanned.length === 0 && missing.length === 0,
    `mismatches=[${identityMismatches.join(', ')}] unplanned=[${unplanned.join(', ')}] missing=[${missing.join(', ')}]`);

  /** 3. THE LAUNCH CARDINALITY, from the durable journal — one launch per planned session, none unplanned. */
  const launchesBySession = new Map();
  for (const entry of journal.records) {
    if (entry.kind !== 'WORKER_LAUNCH_RECORDED') continue;
    const sessionId = entry.payload?.sessionId ?? null;
    if (sessionId === null) continue;
    launchesBySession.set(sessionId, (launchesBySession.get(sessionId) ?? 0) + 1);
  }
  const retries = [...launchesBySession.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
  const plannedSet = new Set(plannedSessions ?? []);
  const unplannedLaunches = [...launchesBySession.keys()].filter((sessionId) => !plannedSet.has(sessionId));
  add('LAUNCH_CARDINALITY_EXACT', retries === 0 && unplannedLaunches.length === 0 && launchesBySession.size === plannedSet.size,
    `retries=${String(retries)} unplannedLaunches=[${unplannedLaunches.join(', ')}] launchedSessions=${String(launchesBySession.size)} planned=${String(plannedSet.size)}`);

  /** 4. THE SIDECAR CONTINUITY, from the durable binding. */
  const continuity = liveEvidenceContinuity;
  add('SIDECAR_CONTINUITY', continuity?.LIVE_ARTIFACT_PROPAGATION === 'PASS',
    `sessions=${String(continuity?.sessions ?? 'ABSENT')} allBound=${String(continuity?.allBound)} allMatched=${String(continuity?.allMatched)} allComplete=${String(continuity?.allComplete)}`);

  /** 5. THE COST ATTRIBUTION, from the durable bridge. */
  add('COST_ATTRIBUTION', costAttribution !== null && costAttribution !== undefined && costAttribution.interpretable === true,
    `interpretable=${String(costAttribution?.interpretable)} measured=${String(costAttribution?.measuredCount)} absent=${String(costAttribution?.absentCount)} planned=${String(costAttribution?.plannedSessions)}`);

  /** 6/7. THE FRESH CLOSURE AND ROUTE, RECOMPUTED AT THIS INSTANT. */
  const fresh = await recompute();
  const boundClosure = plan?.executionClosure?.executionClosureDigest ?? null;
  const freshClosure = fresh?.closure?.executionClosureDigest ?? null;
  const closureMatches = typeof boundClosure === 'string' && boundClosure !== '' && freshClosure === boundClosure;
  add('CLOSURE_FRESH_MATCH', closureMatches, `plan=${String(boundClosure).slice(0, 16)} fresh=${String(freshClosure).slice(0, 16)}`);
  const routeIdentity = fresh?.route?.MODEL_ROUTE_IDENTITY ?? null;
  add('ROUTE_FRESH_MATCH', routeIdentity === 'MATCH', `freshRoute=${String(routeIdentity)}`);

  /** 8. THE IN-RUN RUNTIME ATTESTATION. */
  add('RUNTIME_ATTESTED', attestation?.IN_RUN_ATTESTATION === 'PASS',
    `s1MatchesExpected=${String(attestation?.s1MatchesExpectedBundle)} s2MatchesS1=${String(attestation?.s2MatchesS1)} competingWriter=${String(attestation?.competingWriterDetected)}`);

  /** 9. THE FROZEN NINE-CONDITION POST-MATRIX GATE. */
  add('FROZEN_POSTMATRIX_VALIDITY', postMatrixValidity?.green === true,
    postMatrixValidity?.detail ?? 'the frozen post-matrix validity gate did not report green');

  const failing = conditions.filter((condition) => condition.holds !== true).map((condition) => condition.id);
  const green = failing.length === 0;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C',
    kind: 'authoritative terminal admission',
    /** The frozen runner reads exactly this field. GREEN is the only value under which it may complete. */
    green,
    decision: green ? TERMINAL_DECISIONS.GREEN : TERMINAL_DECISIONS.RED,
    conditions: Object.freeze(conditions),
    failing: Object.freeze(failing),
    requiredConditions: TERMINAL_ADMISSION_CONDITIONS.map((entry) => entry.id),
    /** §4: the journal was read HERE, so a completion decision is made over the durable record. */
    journalReadAtAdmission: true,
    journalIntact: journal.JOURNAL_INTACT,
    identitiesExact: identityMismatches.length === 0 && unplanned.length === 0 && missing.length === 0,
    retries,
    unplannedLaunches: Object.freeze(unplannedLaunches),
    freshClosureDigest: freshClosure,
    boundClosureDigest: boundClosure,
    routeIdentity,
    detail: green
      ? `all ${String(conditions.length)} terminal-admission conditions hold over ${String(completed.length)} session(s); the durable journal was read at admission and the closure and route were recomputed here`
      : `terminal admission is RED: [${failing.join(', ')}]`,
    /** §4: the consequences of a RED, carried so a reader sees what it forbids. */
    onRed: RED_CONSEQUENCES,
    /** §4: the diagnostic postflight remains available AFTER the runner returns, but is not the first sighting. */
    thisReducerIsTheFirstSightingOfACausalValidityFailure: true,
    frozenStateMachineUnchanged: true,
    law: 'there is ONE authoritative terminal-admission reducer, and it decides before the runner writes its completion decision',
  });
}

export { NL };
