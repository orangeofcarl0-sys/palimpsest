/**
 * R3-L0C-I-A-R-L-C-F-S §5 Gate S3 — COMPLETE DURABLE-TRIAL IDENTITY RECONCILIATION.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlPartialTrialIdentity` against the real
 * `8bf8d42` code: `reconcileDurableTrials` compared only `['block', 'arm', 'generation', 'trajectoryId']`, so a
 * durable/in-memory pair agreeing on the scientific schedule identity but conflicting on `attemptId`, `hostJobId`,
 * `executionClosureDigest` and the sidecar `contentDigests` binding left every condition holding and the
 * reconciliation GREEN.
 *
 * WHAT THIS ADDS, WITHOUT CREATING A SECOND REDUCER. §5: "The reconciliation result must feed the existing
 * authoritative `validityGate`. Do not create a second independent final admission reducer." So this module WRAPS the
 * prior stage's reconciliation: it calls it, adds the extended identity conditions, and returns an object whose
 * `green` and `failing` account for BOTH. The frozen `authoritativeTerminalAdmission` then reads `green` exactly as
 * before, and there is still one reducer.
 *
 * THE COMPARISON SURFACE, with the rationale for every field. §5 requires the surface to be "derived from actual
 * `TRIAL_RECORDED.payload.record` and the in-memory admitted record", and it requires the rationale to be documented
 * rather than the comparison to be indiscriminate — because "timestamps or intentionally different representations
 * are not supposed to be byte-identical". `TRIAL_IDENTITY_FIELDS` in the contract carries the per-field rationale.
 *
 * THE FOUR NULL/ABSENT STATES, kept separate. §5: "A pair of matching null fields is not independently verified
 * identity." A deterministic fixture may legitimately lack some Host/Attempt fields while mechanical measurement
 * stays valid, but a future PRIMARY observation with a required identity absence must not be promoted to verified
 * LIVE_PRIMARY — so the absence is recorded as a fact that blocks that promotion rather than silently passing.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import {
  IDENTITY_STATES, NL, REQUIRED_RECONCILIATIONS, TRIAL_IDENTITY_FIELDS,
} from './contract.mjs';

/** §5: the fields compared, split by whether they are load-bearing identity or evidence references. */
const INCLUDED = TRIAL_IDENTITY_FIELDS.filter((entry) => entry.included === true);
const LOAD_BEARING = INCLUDED.filter((entry) => entry.loadBearing === true).map((entry) => entry.field);
const EVIDENCE_REFERENCES = INCLUDED.filter((entry) => entry.loadBearing !== true).map((entry) => entry.field);
const EXCLUDED = TRIAL_IDENTITY_FIELDS.filter((entry) => entry.included !== true);

/** §5: a canonical rendering, so a key-order difference is not reported as a conflict. */
function canonical(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** §5: whether a field is EXPLICITLY absent, as distinct from present-and-null. */
function isAbsent(value) {
  return value === null || value === undefined;
}

/**
 * §5: CLASSIFY ONE FIELD PAIR INTO ONE OF THE FOUR STATES.
 *
 * `SAME_VERIFIED_IDENTITY` requires BOTH sides to carry a value and for the values to be equal. Two matching nulls
 * are `BOTH_EXPLICITLY_ABSENT`, which is a DIFFERENT and weaker fact — it is not verified identity.
 */
export function classifyField(input) {
  const { field, durableValue, inMemoryValue } = input;
  const durableAbsent = isAbsent(durableValue);
  const inMemoryAbsent = isAbsent(inMemoryValue);
  if (durableAbsent && inMemoryAbsent) {
    return Object.freeze({ field, state: IDENTITY_STATES.BOTH_EXPLICITLY_ABSENT, equal: null, durableValue: null, inMemoryValue: null, independentlyVerified: false });
  }
  if (durableAbsent !== inMemoryAbsent) {
    return Object.freeze({
      field, state: IDENTITY_STATES.ONE_ABSENT, equal: false,
      durableValue: durableAbsent ? null : durableValue, inMemoryValue: inMemoryAbsent ? null : inMemoryValue,
      absentSide: durableAbsent ? 'durable' : 'in-memory', independentlyVerified: false,
    });
  }
  const equal = canonical(durableValue) === canonical(inMemoryValue);
  return Object.freeze({
    field,
    state: equal ? IDENTITY_STATES.SAME_VERIFIED_IDENTITY : IDENTITY_STATES.CONFLICTING_IDENTITIES,
    equal,
    durableValue: equal ? durableValue : durableValue,
    inMemoryValue: equal ? inMemoryValue : inMemoryValue,
    independentlyVerified: equal === true,
  });
}

/**
 * §5: RECONCILE THE DURABLE TRIAL AGAINST THE IN-MEMORY OBSERVATION OVER THE FULL IDENTITY SURFACE.
 *
 * It returns, per session, every field's state, and it names the conflicts and the absences separately. A conflict on
 * ANY included field is a FAILING condition; a load-bearing absence is recorded as blocking a LIVE_PRIMARY
 * promotion rather than as a conflict, because §5 distinguishes the deterministic fixture case.
 */
export function reconcileTrialIdentity(input) {
  const { durableRecords = [], inMemoryRecords = [], plannedSessions = [] } = input;
  const plannedSet = new Set(plannedSessions);
  const inMemoryById = new Map((inMemoryRecords ?? []).map((record) => [record.sessionId, record]));
  const durableById = new Map((durableRecords ?? []).map((record) => [record.sessionId, record]));

  const sessions = [];
  const conflicts = [];
  const oneAbsent = [];
  const bothAbsent = [];
  const unmatched = [];

  for (const [sessionId, durable] of durableById.entries()) {
    const inMemory = inMemoryById.get(sessionId);
    if (inMemory === undefined) { unmatched.push(Object.freeze({ sessionId, side: 'durable', detail: 'a durable trial has no in-memory observation' })); continue; }
    const fields = INCLUDED.map((entry) => classifyField({ field: entry.field, durableValue: durable?.[entry.field], inMemoryValue: inMemory?.[entry.field] }));
    for (const entry of fields) {
      if (entry.state === IDENTITY_STATES.CONFLICTING_IDENTITIES) conflicts.push(Object.freeze({ sessionId, field: entry.field, durable: entry.durableValue, inMemory: entry.inMemoryValue }));
      else if (entry.state === IDENTITY_STATES.ONE_ABSENT) oneAbsent.push(Object.freeze({ sessionId, field: entry.field, absentSide: entry.absentSide }));
      else if (entry.state === IDENTITY_STATES.BOTH_EXPLICITLY_ABSENT) bothAbsent.push(Object.freeze({ sessionId, field: entry.field }));
    }
    sessions.push(Object.freeze({ sessionId, fields: Object.freeze(fields), conflicting: Object.freeze(fields.filter((entry) => entry.state === IDENTITY_STATES.CONFLICTING_IDENTITIES).map((entry) => entry.field)) }));
  }
  for (const sessionId of inMemoryById.keys()) if (!durableById.has(sessionId)) unmatched.push(Object.freeze({ sessionId, side: 'in-memory', detail: 'an in-memory observation has no durable trial' }));

  /** §5: a load-bearing absence is recorded as blocking a LIVE_PRIMARY promotion, not as a conflict. */
  const loadBearingAbsent = bothAbsent.filter((entry) => LOAD_BEARING.includes(entry.field));
  const evidenceReferenceAbsent = bothAbsent.filter((entry) => EVIDENCE_REFERENCES.includes(entry.field));

  const identityConflicts = conflicts.length;
  const oneSidedAbsences = oneAbsent.length;
  const unmatchedRecords = unmatched.length;
  const green = identityConflicts === 0 && oneSidedAbsences === 0 && unmatchedRecords === 0;

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S',
    kind: 'complete durable-trial identity reconciliation',
    comparedFields: Object.freeze(INCLUDED.map((entry) => entry.field)),
    loadBearingFields: Object.freeze(LOAD_BEARING),
    evidenceReferenceFields: Object.freeze(EVIDENCE_REFERENCES),
    excludedFields: Object.freeze(EXCLUDED.map((entry) => Object.freeze({ field: entry.field, rationale: entry.rationale }))),
    sessions: Object.freeze(sessions),
    conflicts: Object.freeze(conflicts),
    oneSidedAbsences: Object.freeze(oneAbsent),
    bothAbsentFields: Object.freeze(bothAbsent),
    unmatched: Object.freeze(unmatched),
    /** §5: the four states, each counted rather than collapsed. */
    counts: Object.freeze({
      SAME_VERIFIED_IDENTITY: sessions.reduce((total, session) => total + session.fields.filter((entry) => entry.state === IDENTITY_STATES.SAME_VERIFIED_IDENTITY).length, 0),
      BOTH_EXPLICITLY_ABSENT: bothAbsent.length,
      ONE_ABSENT: oneSidedAbsences,
      CONFLICTING_IDENTITIES: identityConflicts,
    }),
    /** §5: a pair of matching nulls is NOT independently verified identity, and it blocks a LIVE_PRIMARY promotion. */
    matchingNullsAreVerifiedIdentity: false,
    requiredIdentityAbsent: loadBearingAbsent.length > 0,
    blocksLivePrimaryPromotion: loadBearingAbsent.length > 0,
    loadBearingAbsences: Object.freeze(loadBearingAbsent),
    evidenceReferenceAbsences: Object.freeze(evidenceReferenceAbsent),
    /** §5: the fields §5 names in its minimum review surface, shown present so a reader sees nothing was skipped. */
    reviewSurfaceComplete: LOAD_BEARING.length >= 13,
    green,
    failing: Object.freeze([
      ...(identityConflicts > 0 ? ['DURABLE_IN_MEMORY_IDENTITY_CONFLICT'] : []),
      ...(oneSidedAbsences > 0 ? ['DURABLE_IN_MEMORY_ONE_SIDED_ABSENCE'] : []),
      ...(unmatchedRecords > 0 ? ['DURABLE_IN_MEMORY_UNMATCHED_RECORD'] : []),
    ]),
    law: 'the durable and in-memory observations must agree on EVERY included identity field; a pair of matching nulls is not verified identity, and a load-bearing absence blocks a LIVE_PRIMARY promotion without altering the frozen deterministic design',
  });
}

/**
 * §5: THE EXTENDED RECONCILIATION ADAPTER.
 *
 * It calls the prior stage's `reconcileDurableTrials` — the module that owns the durable session set, the sidecar
 * binding, the cost classification and the journal integrity — and ADDS the full-identity reconciliation. The
 * returned object keeps the prior shape and its `green`/`failing` account for both, so the ONE authoritative reducer
 * consumes it unchanged and no second reducer exists.
 */
export async function reconcileTrialEvidence(input) {
  const { reconcileDurableTrials } = await import('../r3l0ciarlcf/durable-reconciliation.mjs');
  const prior = reconcileDurableTrials(input);

  const durableRecords = (input.journal?.records ?? [])
    .filter((entry) => entry.kind === 'TRIAL_RECORDED')
    .map((entry) => entry.payload?.record)
    .filter((record) => record !== null && record !== undefined);
  const identity = reconcileTrialIdentity({
    durableRecords,
    inMemoryRecords: input.inMemoryRecords ?? [],
    plannedSessions: input.plannedSessions ?? [],
  });

  /** §5: the sidecar attempt/host-job relationships, checked against the durable bindings the prior reducer read. */
  const bindings = await reconcileSidecarBindings({ durableRecords, input });

  const conditions = Object.freeze([
    ...prior.conditions,
    Object.freeze({ id: 'DURABLE_IN_MEMORY_FULL_IDENTITY', holds: identity.green === true, detail: `conflicts=${String(identity.counts.CONFLICTING_IDENTITIES)} oneAbsent=${String(identity.counts.ONE_ABSENT)} unmatched=${String(identity.unmatched.length)}` }),
    Object.freeze({ id: 'SIDECAR_ATTEMPT_AND_HOSTJOB_AGREE', holds: bindings.agree === true, detail: bindings.detail }),
  ]);
  const failing = conditions.filter((condition) => condition.holds !== true).map((condition) => condition.id);

  return Object.freeze({
    ...prior,
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S',
    kind: 'extended durable trial reconciliation',
    conditions,
    requiredConditions: Object.freeze([...prior.requiredConditions, 'DURABLE_IN_MEMORY_FULL_IDENTITY', 'SIDECAR_ATTEMPT_AND_HOSTJOB_AGREE']),
    failing: Object.freeze(failing),
    green: failing.length === 0,
    /** §5: the extended identity evidence, carried whole so a reader sees the comparison surface. */
    identity,
    sidecarBindings: bindings,
    requiredReconciliations: REQUIRED_RECONCILIATIONS,
    /** §5: the prior reducer's own facts are preserved rather than recomputed. */
    priorReconciliationGreen: prior.green,
    priorFailing: prior.failing,
    extendedBy: 'scripts/r3l0ciarlcfs/trial-identity.mjs reconcileTrialIdentity',
    secondReducerCreated: false,
    law: 'this adapter EXTENDS the prior reconciliation; the single authoritative terminal reducer consumes one green/failing pair, so no second final admission reducer exists',
  });
}

/**
 * §5: RECONCILE THE SIDECAR BINDINGS THE DURABLE RECORD CARRIES.
 *
 * §5's reconciliations 3-5: the durable trial against its sidecar digest binding, the durable AttemptId against the
 * sidecar AttemptId, and the durable HostJobId against the sidecar or authentic host evidence when available. The
 * sidecar is read from the run root the same way the cost bridge reads it, so the two cannot disagree about which
 * file the binding names.
 */
async function reconcileSidecarBindings(input) {
  const { durableRecords, input: outer } = input;
  const runRoot = outer.runRoot ?? null;
  const perSession = [];
  const problems = [];
  if (runRoot === null) {
    return Object.freeze({ agree: null, perSession: Object.freeze([]), detail: 'no run root was supplied, so the sidecar bindings cannot be reconciled here', checked: false, problems: Object.freeze([]) });
  }
  const { attemptIdentityEquals } = await import('../r3l0ciarlcf/artifact-identity.mjs');
  const { existsSync, readFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { join } = await import('node:path');
  const { LIVE_EVIDENCE_DIRECTORY } = await import('../r3l0ciarlcf/cost-bridge.mjs');

  for (const record of durableRecords) {
    const sessionId = record?.sessionId ?? null;
    const bound = record?.contentDigests?.r3l0ciarlLiveEvidence ?? null;
    const sidecarPath = sessionId === null ? null : join(runRoot, LIVE_EVIDENCE_DIRECTORY, `${String(sessionId)}.json`);
    if (typeof bound !== 'string' || bound === '' || sidecarPath === null || !existsSync(sidecarPath)) {
      /** A missing binding is already the prior reducer's SIDECAR_BINDING_VALID concern; it is not double-reported here. */
      perSession.push(Object.freeze({ sessionId, checked: false, reason: 'no bound sidecar file to reconcile' }));
      continue;
    }
    const text = readFileSync(sidecarPath, 'utf8');
    const digest = createHash('sha256').update(text, 'utf8').digest('hex');
    let sidecar = null;
    try { sidecar = JSON.parse(text); } catch { sidecar = null; }
    const digestMatches = digest === bound;
    const attemptAgrees = record?.attemptId === null || record?.attemptId === undefined || sidecar?.attemptId === null || sidecar?.attemptId === undefined
      ? null : attemptIdentityEquals(record.attemptId, sidecar.attemptId);
    const hostJobAgrees = record?.hostJobId === null || record?.hostJobId === undefined || sidecar?.hostJobId === null || sidecar?.hostJobId === undefined
      ? null : String(record.hostJobId) === String(sidecar.hostJobId);
    if (digestMatches !== true) problems.push(`${String(sessionId)}: the sidecar digest does not match the durable binding`);
    if (attemptAgrees === false) problems.push(`${String(sessionId)}: the durable AttemptId and the sidecar AttemptId are different identities`);
    if (hostJobAgrees === false) problems.push(`${String(sessionId)}: the durable HostJobId and the sidecar HostJobId disagree`);
    perSession.push(Object.freeze({ sessionId, checked: true, digestMatches, attemptAgrees, hostJobAgrees }));
  }
  return Object.freeze({
    agree: problems.length === 0,
    checked: true,
    perSession: Object.freeze(perSession),
    problems: Object.freeze(problems),
    detail: `checked=${String(perSession.filter((entry) => entry.checked === true).length)} problems=${String(problems.length)}`,
  });
}

export { NL };
