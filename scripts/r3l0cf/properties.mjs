/**
 * R3-L0C-F §3/§8 — THE FAIL-STOP PROPERTY EVALUATOR.
 *
 * THE DESIGN POINT OF THIS MODULE IS THAT THERE IS EXACTLY ONE EVALUATOR AND TWO SUBJECTS.
 *
 * §3 requires the negative tests to "fail against the old behavior, then pass against the new fail-stop runner".
 * A test can only do both if the SAME predicate is applied to both runners. If the legacy falsifier asserted
 * "the legacy runner retried" and the new suite separately asserted "the new runner did not retry", the two
 * assertions could drift apart and neither would constrain the other. So the five §8 properties are defined
 * ONCE, here, over a NORMALIZED RUN OBSERVATION, and:
 *
 *   · `scripts/r3l0cf/falsifiers.mjs` feeds them the legacy control flow's observation  -> the properties FAIL
 *   · the fail-stop runner feeds them its own journal and abort manifest              -> the properties HOLD
 *
 * The evaluator reads only the observation, never the runner's identity, so it cannot be satisfied by knowing
 * which runner it is looking at.
 *
 * THE OBSERVATION IS A DELIBERATELY SMALL SHAPE. It is what a run can always produce — a schedule, the launches
 * that happened, the durable records that exist, the terminal events that were synthesized, and whether a causal
 * verdict was issued — and nothing that only one implementation could produce. That is what makes it usable as
 * the common subject of the two halves of the falsifier.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { CRASH_MATRIX_REQUIREMENTS } from './contract.mjs';

const NL = String.fromCharCode(10);

/**
 * §8: THE NORMALIZED RUN OBSERVATION.
 *
 * Built by a runner from its own durable records. Every field is an OBSERVATION, not a declaration: `launches`
 * is what was launched, `durableRecords` is what exists on disk, `terminalEventsSynthesized` is what was written
 * to a product store, and `causalVerdictIssued` is whether a treatment verdict was produced.
 */
export function buildObservation(input) {
  return Object.freeze({
    schemaVersion: 1,
    /** The scheduled sessions, in order. A run must not exceed this set and must not skip within it. */
    plannedSessions: Object.freeze([...(input.plannedSessions ?? [])]),
    /** Every worker launch, in order: `{ sessionId, attempt }`. `attempt` is always 1 under fail-stop. */
    launches: Object.freeze((input.launches ?? []).map((entry) => Object.freeze({ sessionId: entry.sessionId, attempt: entry.attempt }))),
    /** The sessions that produced a durable record, in order. */
    completedSessions: Object.freeze([...(input.completedSessions ?? [])]),
    /** The sessions that failed, in order, with the failure class. */
    failedSessions: Object.freeze((input.failedSessions ?? []).map((entry) => Object.freeze({ sessionId: entry.sessionId, failureClass: entry.failureClass ?? null }))),
    /** The durable records that exist, per session: `{ sessionId, kind }`. */
    durableRecords: Object.freeze((input.durableRecords ?? []).map((entry) => Object.freeze({ sessionId: entry.sessionId, kind: entry.kind }))),
    /** §5: terminal events written to a PRODUCT store. Fail-stop must synthesize none. */
    terminalEventsSynthesized: Object.freeze([...(input.terminalEventsSynthesized ?? [])]),
    /** §14: whether a treatment verdict was issued. A stopped matrix issues none. */
    causalVerdictIssued: input.causalVerdictIssued === true,
    /** The run's terminal research state. */
    terminalState: input.terminalState ?? null,
    /** Whether the run reported matrix completion. */
    matrixCompleted: input.matrixCompleted === true,
    /** Whether a post-matrix validity gate was green. */
    postMatrixValidityGate: input.postMatrixValidityGate === true,
  });
}

/** §8: how many times a session was launched. */
function launchesFor(observation, sessionId) {
  return observation.launches.filter((entry) => entry.sessionId === sessionId).length;
}

/**
 * §8 property 1: NO_SECOND_LAUNCH.
 *
 * No session was launched more than once. The law is `MAX_WORKER_LAUNCHES = 1`, and the measurement is the launch
 * multiset rather than a counter a runner could reset.
 */
export function evaluateNoSecondLaunch(observation) {
  const counts = new Map();
  for (const launch of observation.launches) counts.set(launch.sessionId, (counts.get(launch.sessionId) ?? 0) + 1);
  const violated = [...counts.entries()].filter(([, count]) => count > 1).map(([sessionId, count]) => Object.freeze({ sessionId, launches: count }));
  return Object.freeze({
    id: 'NO_SECOND_LAUNCH',
    holds: violated.length === 0,
    detail: violated.length === 0
      ? `every one of the ${String(observation.launches.length)} launch(es) is the first for its session`
      : `${String(violated.length)} session(s) were launched more than once`,
    violated,
    maxLaunchesPerSession: observation.launches.length === 0 ? 0 : Math.max(...counts.values()),
  });
}

/**
 * §8 property 2: NEXT_SESSION_NOT_STARTED.
 *
 * After a load-bearing failure, no LATER scheduled session was started. This is the whole-matrix stop of §5: a
 * failure stops the matrix, not merely the current generation, so the failure's index in the schedule is the last
 * index at which anything was launched.
 */
export function evaluateNextSessionNotStarted(observation) {
  const order = new Map(observation.plannedSessions.map((sessionId, index) => [sessionId, index]));
  const firstFailure = observation.failedSessions.length === 0 ? null : observation.failedSessions[0];
  if (firstFailure === null) {
    return Object.freeze({ id: 'NEXT_SESSION_NOT_STARTED', holds: true, detail: 'no session failed, so the property is not exercised', violated: Object.freeze([]), failureIndex: null });
  }
  const failureIndex = order.get(firstFailure.sessionId) ?? null;
  if (failureIndex === null) {
    /** A failure outside the schedule is itself a defect, reported rather than ignored. */
    return Object.freeze({ id: 'NEXT_SESSION_NOT_STARTED', holds: false, detail: `the failing session "${firstFailure.sessionId}" is not in the schedule`, violated: Object.freeze([{ sessionId: firstFailure.sessionId, reason: 'NOT_SCHEDULED' }]), failureIndex: null });
  }
  const startedAfter = observation.launches.filter((launch) => (order.get(launch.sessionId) ?? -1) > failureIndex).map((launch) => launch.sessionId);
  const uniqueAfter = [...new Set(startedAfter)];
  return Object.freeze({
    id: 'NEXT_SESSION_NOT_STARTED',
    holds: uniqueAfter.length === 0,
    detail: uniqueAfter.length === 0
      ? `nothing was started after the failure at "${firstFailure.sessionId}" (schedule index ${String(failureIndex)})`
      : `${String(uniqueAfter.length)} session(s) were started after the failure`,
    violated: Object.freeze(uniqueAfter.map((sessionId) => Object.freeze({ sessionId, reason: 'STARTED_AFTER_FAILURE' }))),
    failureIndex,
  });
}

/**
 * §8 property 3: EVIDENCE_PRESERVED.
 *
 * Every session that COMPLETED has a durable record. A completed session whose record is missing is lost
 * evidence, which is exactly the legacy defect D3.
 */
export function evaluateEvidencePreserved(observation) {
  const recorded = new Set(observation.durableRecords.map((entry) => entry.sessionId));
  const lost = observation.completedSessions.filter((sessionId) => !recorded.has(sessionId));
  return Object.freeze({
    id: 'EVIDENCE_PRESERVED',
    holds: lost.length === 0,
    detail: lost.length === 0
      ? `all ${String(observation.completedSessions.length)} completed session(s) have a durable record`
      : `${String(lost.length)} completed session(s) have no durable record`,
    violated: Object.freeze(lost.map((sessionId) => Object.freeze({ sessionId, reason: 'NO_DURABLE_RECORD' }))),
    durableRecordCount: observation.durableRecords.length,
  });
}

/**
 * §8 property 4: NO_FAKE_ATTEMPT_TERMINAL.
 *
 * The run synthesized no terminal event in a product store. §15 is explicit that fail-stop does NOT implement
 * `ATTEMPT_CANCELLED`, does NOT turn `HOST_FAILURE` into `ATTEMPT_FAILED`, and does NOT create new governance
 * authority. So the number of synthesized terminal events must be zero, and the property reads the observation
 * rather than trusting the runner's intent.
 */
export function evaluateNoFakeAttemptTerminal(observation) {
  const synthesized = observation.terminalEventsSynthesized;
  return Object.freeze({
    id: 'NO_FAKE_ATTEMPT_TERMINAL',
    holds: synthesized.length === 0,
    detail: synthesized.length === 0
      ? 'no attempt terminal event was synthesized'
      : `${String(synthesized.length)} attempt terminal event(s) were synthesized`,
    violated: Object.freeze(synthesized.map((event) => Object.freeze({ event, reason: 'SYNTHESIZED_TERMINAL' }))),
  });
}

/**
 * §8 property 5: NO_CAUSAL_VERDICT.
 *
 * A stopped matrix issued no causal treatment verdict. §14 lists the conditions a verdict requires, and a
 * stopped run satisfies none of them, so the property is simply that no verdict was issued.
 */
export function evaluateNoCausalVerdict(observation) {
  return Object.freeze({
    id: 'NO_CAUSAL_VERDICT',
    holds: observation.causalVerdictIssued !== true,
    detail: observation.causalVerdictIssued === true ? 'a causal treatment verdict was issued' : 'no causal treatment verdict was issued',
    violated: observation.causalVerdictIssued === true ? Object.freeze([{ reason: 'CAUSAL_VERDICT_ISSUED' }]) : Object.freeze([]),
  });
}

/**
 * §8: EVALUATE ALL FIVE PROPERTIES over one observation.
 *
 * The result carries the conjunction, so a caller can assert "every required property holds" without re-listing
 * them — and the list comes from the frozen contract, so a property added to §8 cannot be silently omitted.
 */
export function evaluateFailStopProperties(observation) {
  const properties = Object.freeze([
    evaluateNoSecondLaunch(observation),
    evaluateNextSessionNotStarted(observation),
    evaluateEvidencePreserved(observation),
    evaluateNoFakeAttemptTerminal(observation),
    evaluateNoCausalVerdict(observation),
  ]);
  const failing = properties.filter((property) => property.holds !== true).map((property) => property.id);
  /** §8: every required property must be present, so a missing one is reported rather than assumed. */
  const evaluated = new Set(properties.map((property) => property.id));
  const missing = CRASH_MATRIX_REQUIREMENTS.filter((id) => !evaluated.has(id));
  return Object.freeze({
    schemaVersion: 1,
    kind: 'fail-stop property evaluation',
    properties,
    ALL_PROPERTIES_HOLD: failing.length === 0 && missing.length === 0,
    failing: Object.freeze(failing),
    missing: Object.freeze(missing),
    evaluated: Object.freeze([...evaluated]),
  });
}

/**
 * §8: THE PROPERTIES THAT DISTINGUISH THE TWO RUNNERS.
 *
 * Used by the falsifier to state, as a value, WHICH properties the legacy runner violates. A legacy run that
 * violated none would make the falsifier vacuous, so the caller reports that rather than treating it as a pass.
 */
export function legacyViolations(observation) {
  const evaluation = evaluateFailStopProperties(observation);
  return Object.freeze({
    violated: evaluation.failing,
    anyViolated: evaluation.failing.length > 0,
    detail: evaluation.failing.length > 0
      ? `the legacy run violates ${evaluation.failing.join(', ')}`
      : 'the legacy run violates none of the five properties, so this falsifier is VACUOUS',
  });
}

export { NL };
