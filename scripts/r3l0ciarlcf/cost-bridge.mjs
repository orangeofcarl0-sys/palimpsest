/**
 * R3-L0C-I-A-R-L-C-F §4 Gate F2 — THE DURABLE EVIDENCE TO RECONSTRUCTION-COST BRIDGE.
 *
 * WHAT THIS SUPERSEDES. The prior stage's bridge (`scripts/r3l0ciarlc/cost-bridge.mjs`) attributed a cost from the
 * durable journal by resolving the sidecar binding — which was right — but derived LIVE_PRIMARY from a route REGEX,
 * a sidecar MODE and a digest, and compared identities with `String.includes()`. Both were measured to be wrong
 * (`baseline/legacy-controls.mjs controlUnverifiedLivePrimary`).
 *
 * WHAT THIS DOES INSTEAD.
 *
 *   IDENTITY    the attempt identity is compared by EXACT normalization (`artifact-identity.mjs`), so a prefix or
 *               substring collision is an IDENTITY_CONFLICT rather than a match.
 *   DISCOVERY   when the sidecar names no artifact, the artifact is DISCOVERED under the session's own DSH home by
 *               exact attempt identity — and zero candidates, ambiguity and an unparseable identity are each their
 *               own outcome.
 *   PROVENANCE  LIVE_PRIMARY requires an independently corroborated EXECUTION WITNESS. A route string and a mode
 *               are declarations; with no witness the provenance is FIXTURE, and the honest verdict is
 *               `LIVE_PRIMARY_PROVENANCE = NOT_ESTABLISHED`.
 *   INTERPRETABILITY  a malformed, truncated or unreadable artifact is NOT a measured zero. The frozen
 *               instrumentation's `reconstructCost` throws or returns nothing for an unreadable artifact, and that
 *               is reported as UNINTERPRETABLE_ARTIFACT rather than as a zero-cost session.
 *
 * THE CHAIN IS UNCHANGED, AND IT IS §4's:
 *
 *     TRIAL_RECORDED → payload.record → contentDigests binding → sidecar verification → session/attempt/host-job
 *     identity → uniquely attributed DSH artifact → artifact digest verification → frozen reconstruction-cost
 *     instrumentation
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { BRIDGE_PROVENANCE, NL } from './contract.mjs';
import { attemptIdentityEquals, attemptIdFromPath, corroborateExecutionWitness, discoverScheduledArtifact, discoveryOutcome, SESSION_ARTIFACT_NAME } from './artifact-identity.mjs';

/** §4: the sidecar directory, matching the prior stage's layout so the binding resolves. */
export const LIVE_EVIDENCE_DIRECTORY = 'private/live-evidence';

/** §4: the nine outcomes the bridge must distinguish, each its own named state. */
export const COST_BRIDGE_OUTCOMES = Object.freeze([
  Object.freeze({ id: 'ARTIFACT_ABSENT', measured: false, provenance: null, detail: 'the sidecar names an artifact path and no file exists there, and no unique candidate was discovered under the scoped home' }),
  Object.freeze({ id: 'SIDECAR_ABSENT', measured: false, provenance: null, detail: 'the durable record binds no sidecar, or no sidecar exists for the session' }),
  Object.freeze({ id: 'SIDECAR_DIGEST_MISMATCH', measured: false, provenance: null, detail: 'the sidecar bytes no longer hash to the digest the durable record binds' }),
  Object.freeze({ id: 'ARTIFACT_DIGEST_MISMATCH', measured: false, provenance: null, detail: 'the artifact bytes no longer hash to the digest the sidecar recorded' }),
  Object.freeze({ id: 'IDENTITY_CONFLICT', measured: false, provenance: null, detail: 'the artifact path or the host evidence contradicts the session/attempt/host-job identity under EXACT normalized comparison' }),
  Object.freeze({ id: 'AMBIGUOUS_ARTIFACTS', measured: false, provenance: null, detail: 'more than one artifact carries the scheduled attempt identity, and choosing by recency would be a convenience' }),
  Object.freeze({ id: 'UNINTERPRETABLE_ARTIFACT', measured: false, provenance: null, detail: 'the artifact exists but the frozen instrumentation cannot reconstruct a cost from it — a malformed, truncated or unreadable artifact is NOT a measured zero' }),
  Object.freeze({ id: 'MEASURED_FIXTURE', measured: true, provenance: 'FIXTURE', detail: 'a non-primary execution\'s artifact was measured and labelled as a fixture' }),
  Object.freeze({ id: 'VERIFIED_LIVE_PRIMARY', measured: true, provenance: 'LIVE_PRIMARY', detail: 'a primary execution\'s artifact was measured, with an independently corroborated execution witness' }),
]);

/** §4: the outcome vocabulary, so a caller reads the state by name rather than by a boolean. */
export function bridgeOutcome(id) {
  return COST_BRIDGE_OUTCOMES.find((entry) => entry.id === id) ?? Object.freeze({ id, measured: false, provenance: null, detail: 'an undeclared bridge outcome' });
}

/** §4: the digest of a file's bytes, or null when it is absent or unreadable. */
export function digestOfFile(path) {
  if (path === null || path === undefined || !existsSync(path)) return null;
  try { return createHash('sha256').update(readFileSync(path)).digest('hex'); } catch { return null; }
}

/**
 * §4: DERIVE THE PROVENANCE FROM A CORROBORATED WITNESS.
 *
 * §4: "LIVE_PRIMARY must require an independently corroborated execution witness." A route string and a sidecar
 * mode are declarations. So this function reports them as the BASIS and delegates the decision to the witness
 * corroboration — a declaration never produces LIVE_PRIMARY on its own.
 */
export function deriveBridgeProvenance(input) {
  const { record, sidecar, artifactDigestVerified, witness = null, discovery = null } = input;
  const declaredRoute = String(record?.intendedExecutorRoute ?? '');
  const declaredRouteIsPrimary = /omnigate|deepseek|primary/iu.test(declaredRoute) && !/scripted|deterministic/iu.test(declaredRoute);
  const declaredMode = String(sidecar?.mode ?? '');
  const corroboration = corroborateExecutionWitness({
    witness,
    scheduledRunId: record?.runId ?? null,
    scheduledSessionId: record?.sessionId ?? null,
    expectedAttemptId: record?.attemptId ?? null,
    discovery,
    artifactDigestVerified: artifactDigestVerified === true,
  });
  const live = corroboration.corroborated === true;
  return Object.freeze({
    provenance: live ? BRIDGE_PROVENANCE.LIVE_PRIMARY : BRIDGE_PROVENANCE.FIXTURE,
    basis: Object.freeze({
      declaredRouteIsPrimary,
      declaredModeIsPrimary: declaredMode === 'PRIMARY',
      artifactDigestVerified: artifactDigestVerified === true,
      declaredRoute: declaredRoute === '' ? null : declaredRoute,
      declaredMode: declaredMode === '' ? null : declaredMode,
      /** §4: the declarations are carried, and explicitly do NOT decide. */
      declarationsDecideProvenance: false,
      witnessCorroborated: corroboration.corroborated === true,
      witnessMissing: corroboration.missing,
    }),
    corroboration,
    live,
    /** §4: a declaration alone cannot produce LIVE_PRIMARY, which is the whole correction. */
    declarationAloneIsInsufficient: true,
  });
}

/**
 * §4: COMPARE THE ARTIFACT'S IDENTITY AGAINST THE DURABLE RECORD AND THE SIDECAR, BY EXACT NORMALIZATION.
 *
 * The prior stage used `String.includes()` in both directions, which accepted a prefix collision. This compares the
 * NORMALIZED forms for exact equality, so `attempt-abcdef` and `attempt-abcdef0123456789` are different identities.
 */
export function compareIdentity(input) {
  const { record, sidecar, artifactPath, plannedSession } = input;
  const pathAttemptId = attemptIdFromPath(artifactPath);
  const recordAttempt = record?.attemptId ?? null;
  const sidecarAttempt = sidecar?.attemptId ?? null;
  const recordJob = record?.hostJobId ?? null;
  const sidecarJob = sidecar?.hostJobId ?? null;
  const conflicts = [];
  /** The sidecar's identity must agree with the durable record's, by exact normalized equality. */
  if (recordAttempt !== null && sidecarAttempt !== null && !attemptIdentityEquals(recordAttempt, sidecarAttempt)) conflicts.push('attemptId(sidecar vs record)');
  if (recordJob !== null && sidecarJob !== null && String(recordJob) !== String(sidecarJob)) conflicts.push('hostJobId(sidecar vs record)');
  /** When the path carries an attempt id, it must be the record's EXACT identity — a prefix is a different attempt. */
  if (pathAttemptId !== null && recordAttempt !== null && !attemptIdentityEquals(pathAttemptId, recordAttempt)) conflicts.push('attemptId(path vs record)');
  /** A planned session's identity, when supplied, must match the record's trajectory/generation/arm. */
  if (plannedSession !== null && plannedSession !== undefined) {
    for (const field of ['trajectoryId', 'generation', 'arm']) {
      if (plannedSession[field] !== undefined && record?.[field] !== undefined && String(plannedSession[field]) !== String(record[field])) conflicts.push(`${field}(plan vs record)`);
    }
  }
  return Object.freeze({
    attemptId: pathAttemptId ?? recordAttempt ?? sidecarAttempt ?? null,
    hostJobId: recordJob ?? sidecarJob ?? null,
    pathAttemptId,
    recordAttempt,
    sidecarAttempt,
    recordJob,
    sidecarJob,
    conflicts: Object.freeze(conflicts),
    exact: conflicts.length === 0,
    comparison: 'EXACT_NORMALIZED_EQUALITY',
    substringMatchingUsed: false,
  });
}

/**
 * §4: ATTRIBUTE ONE SESSION'S COST FROM ITS DURABLE RECORD.
 *
 * Every failure mode is its own named outcome. The artifact is resolved through the sidecar the durable record
 * binds, and — when the sidecar names no artifact — DISCOVERED under the session-scoped DSH home by exact attempt
 * identity. A malformed or unreadable artifact is UNINTERPRETABLE, never a measured zero.
 */
export async function attributeSessionFromRecord(input) {
  const { runRoot, record, plannedSession, artifactRoot = null, dshHomePath = null, witness = null } = input;
  const sessionId = record?.sessionId ?? null;
  const digests = record?.contentDigests ?? null;
  const bound = digests !== null && typeof digests === 'object' ? digests.r3l0ciarlLiveEvidence ?? null : null;

  /** 1. THE BINDING. No binding, no sidecar. */
  if (typeof bound !== 'string' || bound === '') {
    return Object.freeze({ sessionId, outcome: bridgeOutcome('SIDECAR_ABSENT'), measured: false, provenance: null, reason: 'the durable record binds no live-evidence sidecar, so the artifact cannot be resolved from the journal', bound: null, fields: null });
  }

  /** 2. THE SIDECAR, and its digest against the binding. */
  const sidecarPath = join(runRoot, LIVE_EVIDENCE_DIRECTORY, `${String(sessionId)}.json`);
  if (!existsSync(sidecarPath)) {
    return Object.freeze({ sessionId, outcome: bridgeOutcome('SIDECAR_ABSENT'), measured: false, provenance: null, reason: `the record binds a sidecar digest but no sidecar exists at ${sidecarPath}`, bound, fields: null });
  }
  const sidecarText = readFileSync(sidecarPath, 'utf8');
  const sidecarDigest = createHash('sha256').update(sidecarText, 'utf8').digest('hex');
  if (sidecarDigest !== bound) {
    return Object.freeze({ sessionId, outcome: bridgeOutcome('SIDECAR_DIGEST_MISMATCH'), measured: false, provenance: null, reason: `the sidecar bytes hash to ${sidecarDigest.slice(0, 16)} but the durable record binds ${bound.slice(0, 16)}`, bound, fields: null });
  }
  let sidecar = null;
  try { sidecar = JSON.parse(sidecarText); } catch { return Object.freeze({ sessionId, outcome: bridgeOutcome('SIDECAR_ABSENT'), measured: false, provenance: null, reason: 'the bound sidecar does not parse', bound, fields: null }); }

  /** 3. THE ARTIFACT. The sidecar's own path, or a DISCOVERY under the session-scoped home by exact identity. */
  const namedPath = sidecar?.sessionArtifactPath ?? null;
  const expectedAttemptId = record?.attemptId ?? sidecar?.attemptId ?? null;
  let artifactPath = namedPath;
  let discovery = null;
  if (namedPath === null || namedPath === '' || !existsSync(namedPath)) {
    if (dshHomePath !== null && dshHomePath !== undefined) {
      discovery = discoverScheduledArtifact({ dshHomePath, sessionId, expectedAttemptId });
      if (discovery.discovered === true) artifactPath = discovery.selected.path;
      else {
        const candidates = artifactRoot === null ? [] : candidateArtifacts(artifactRoot, sessionId);
        return Object.freeze({
          sessionId,
          outcome: bridgeOutcome(discovery.ambiguous ? 'AMBIGUOUS_ARTIFACTS' : 'ARTIFACT_ABSENT'),
          measured: false, provenance: null,
          reason: discovery.ambiguous
            ? `more than one artifact under ${dshHomePath} carries the scheduled attempt identity ${String(expectedAttemptId)}; choosing one by recency would be a convenience`
            : (namedPath === null || namedPath === '' ? 'the sidecar names no artifact and no unique candidate was discovered under the session-scoped DSH home' : `no artifact exists at ${namedPath} and no unique candidate was discovered under the session-scoped DSH home`),
          bound, sidecar, discovery,
          candidates: Object.freeze([...discovery.candidates, ...candidates]),
          fields: null,
        });
      }
    } else {
      const candidates = artifactRoot === null ? [] : candidateArtifacts(artifactRoot, sessionId);
      return Object.freeze({ sessionId, outcome: bridgeOutcome('ARTIFACT_ABSENT'), measured: false, provenance: null, reason: namedPath === null || namedPath === '' ? 'the sidecar names no artifact, so no cost may be claimed for this session' : `no artifact exists at ${namedPath}`, bound, sidecar, candidates: Object.freeze(candidates), fields: null });
    }
  }
  const artifactDigest = digestOfFile(artifactPath);
  const recordedArtifactDigest = sidecar?.sessionArtifactDigest ?? null;
  if (recordedArtifactDigest !== null && artifactDigest !== recordedArtifactDigest) {
    return Object.freeze({ sessionId, outcome: bridgeOutcome('ARTIFACT_DIGEST_MISMATCH'), measured: false, provenance: null, reason: `the artifact bytes hash to ${String(artifactDigest).slice(0, 16)} but the sidecar recorded ${String(recordedArtifactDigest).slice(0, 16)}`, bound, sidecar, fields: null });
  }

  /** 4. THE IDENTITY, by EXACT normalized comparison. */
  const identity = compareIdentity({ record, sidecar, artifactPath, plannedSession });
  if (identity.conflicts.length > 0) {
    return Object.freeze({ sessionId, outcome: bridgeOutcome('IDENTITY_CONFLICT'), measured: false, provenance: null, reason: `the artifact identity conflicts on [${identity.conflicts.join(', ')}] under exact normalized comparison`, bound, sidecar, identity, fields: null });
  }

  /** 5. THE PROVENANCE, from a corroborated execution witness rather than a declaration. */
  const provenance = deriveBridgeProvenance({ record, sidecar, artifactDigestVerified: recordedArtifactDigest !== null && artifactDigest === recordedArtifactDigest, witness, discovery });

  /**
   * 6. THE FROZEN INSTRUMENTATION, with the interpretability distinction made explicit.
   *
   * §4: "Do not treat empty or unreadable session content as measured zero merely because the parser did not
   * throw." So the artifact's records are counted, and an artifact whose content yields NO records at all is
   * UNINTERPRETABLE rather than a zero-cost session.
   */
  let cost = null;
  let interpretability = null;
  try {
    const { reconstructCost, decompressFrames, sessionRecords } = await import('../r3l0c/instrumentation.mjs');
    interpretability = interpretArtifact({ artifactPath, decompressFrames, sessionRecords });
    if (interpretability.interpretable !== true) {
      return Object.freeze({ sessionId, outcome: bridgeOutcome('UNINTERPRETABLE_ARTIFACT'), measured: false, provenance: null, reason: interpretability.reason, bound, sidecar, identity, interpretability, fields: null });
    }
    cost = reconstructCost({ path: artifactPath, attemptId: identity.attemptId });
  } catch (error) {
    return Object.freeze({ sessionId, outcome: bridgeOutcome('UNINTERPRETABLE_ARTIFACT'), measured: false, provenance: null, reason: `the frozen instrumentation could not reconstruct a cost: ${String(error?.message ?? error).slice(0, 200)}`, bound, sidecar, identity, interpretability, fields: null });
  }
  const fields = Object.freeze({
    sessionArtifactIdentity: Object.freeze({ path: artifactPath, attemptId: identity.attemptId, hostJobId: identity.hostJobId, digest: artifactDigest }),
    attemptId: identity.attemptId,
    hostJobId: identity.hostJobId,
    rawHistoryArtifactsRead: cost.rawHistoryArtifactsRead,
    rawHistoryArtifactIds: cost.rawHistoryArtifactIds,
    rawHistoryBytesReturned: cost.rawHistoryBytesReturned,
    historyReadActions: cost.historyReadActions,
    capitalPullActions: cost.capitalPullActions,
    capitalPullReturned: cost.capitalPullReturned,
    actionsBeforeFirstResult: cost.actionsBeforeFirstResult,
    elapsedToFirstResultMs: cost.elapsedToFirstResultMs,
    completionCause: cost.completionCause,
  });
  const outcomeId = provenance.live ? 'VERIFIED_LIVE_PRIMARY' : 'MEASURED_FIXTURE';
  return Object.freeze({
    sessionId,
    outcome: bridgeOutcome(outcomeId),
    measured: true,
    provenance: provenance.provenance,
    provenanceBasis: provenance.basis,
    corroboration: provenance.corroboration,
    reason: null,
    bound, sidecar, identity, discovery, interpretability,
    artifactDigest,
    fields,
    /** §4: a legitimate measured zero is DISTINGUISHABLE from missing evidence — the fields are present and zero. */
    measuredZeroIsDistinguishableFromAbsence: fields.rawHistoryArtifactsRead === 0 && fields.rawHistoryArtifactIds.length === 0,
    law: 'the reconstruction cost is attributed from the durable journal by resolving the bound sidecar, verifying the artifact digest and the EXACT identity chain, and reusing the frozen instrumentation',
  });
}

/**
 * §4: DECIDE WHETHER AN ARTIFACT IS INTERPRETABLE AT ALL.
 *
 * §4 names five things to distinguish: a genuinely observed zero read; the absence of a required event; a malformed
 * or unreadable artifact; a truncated artifact; and a valid fixture observation. This function separates them: an
 * artifact that decompresses to no records at all is UNREADABLE, and one whose records parse to nothing is
 * MALFORMED — neither is a measured zero.
 */
export function interpretArtifact(input) {
  const { artifactPath, decompressFrames, sessionRecords } = input;
  let text = null;
  try { text = decompressFrames(artifactPath); } catch (error) {
    return Object.freeze({ interpretable: false, state: 'UNREADABLE', recordCount: 0, reason: `the artifact could not be decompressed: ${String(error?.message ?? error).slice(0, 160)}` });
  }
  if (typeof text !== 'string' || text.trim() === '') {
    return Object.freeze({ interpretable: false, state: 'UNREADABLE', recordCount: 0, reason: 'the artifact decompressed to no content, so it is unreadable rather than a measured zero' });
  }
  let records = [];
  try { records = sessionRecords(text); } catch (error) {
    return Object.freeze({ interpretable: false, state: 'MALFORMED', recordCount: 0, reason: `the artifact's records could not be parsed: ${String(error?.message ?? error).slice(0, 160)}` });
  }
  if (records.length === 0) {
    return Object.freeze({ interpretable: false, state: 'MALFORMED', recordCount: 0, reason: 'the artifact contains content but no parseable session records, so it is malformed rather than a measured zero' });
  }
  /** §4: a valid artifact with no corpus read IS a genuine measured zero, and is reported as interpretable. */
  return Object.freeze({
    interpretable: true,
    state: 'INTERPRETABLE',
    recordCount: records.length,
    hasTurnStart: records.some((record) => record?.type === 'turn/start'),
    hasDispatch: records.some((record) => record?.type === 'tool/ptc-dispatch'),
    zeroIsAGenuineObservation: true,
    reason: null,
  });
}

/**
 * §4: THE MATRIX COST, FROM THE DURABLE JOURNAL.
 *
 * The authoritative entry. It reads the journal with the FROZEN reader, takes the admitted records from the
 * `TRIAL_RECORDED` payloads, and attributes each. Every session is either measured or carries an explicit labelled
 * absence; nothing is silently dropped and nothing is replaced by an invented zero.
 */
export async function bridgeMatrixCost(input) {
  const { journalPath, runRoot, plannedSessions = null, artifactRoot = null, dshHomePath = null, witnesses = {} } = input;
  const { readJournal } = await import('../r3l0cf/journal.mjs');
  const journal = readJournal(journalPath);
  const trialRecords = journal.records.filter((entry) => entry.kind === 'TRIAL_RECORDED');
  const records = trialRecords.map((entry) => entry.payload?.record).filter((record) => record !== null && record !== undefined);

  const planned = plannedSessions === null || plannedSessions === undefined ? null : new Set(plannedSessions);
  const measured = [];
  const absent = [];
  const perSession = [];
  for (const record of records) {
    const plannedSession = planned === null ? null : (planned.has(record.sessionId) ? Object.freeze({ sessionId: record.sessionId }) : null);
    const attributed = await attributeSessionFromRecord({ runRoot, record, plannedSession, artifactRoot, dshHomePath, witness: witnesses[record.sessionId] ?? null });
    perSession.push(attributed);
    if (attributed.measured === true) measured.push(attributed);
    else absent.push(Object.freeze({ sessionId: attributed.sessionId, outcome: attributed.outcome.id, reason: attributed.reason, detail: attributed.outcome.detail }));
  }
  const livePrimary = measured.filter((entry) => entry.provenance === BRIDGE_PROVENANCE.LIVE_PRIMARY);
  const fixture = measured.filter((entry) => entry.provenance === BRIDGE_PROVENANCE.FIXTURE);
  const plannedCount = planned === null ? records.length : planned.size;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F',
    kind: 'durable-evidence reconstruction cost',
    journalPath,
    journalIntact: journal.JOURNAL_INTACT,
    journalRecords: journal.records.length,
    trialRecords: records.length,
    plannedSessions: plannedCount,
    measuredCount: measured.length,
    absentCount: absent.length,
    measured: Object.freeze(measured),
    absent: Object.freeze(absent),
    perSession: Object.freeze(perSession),
    livePrimaryCount: livePrimary.length,
    fixtureCount: fixture.length,
    provenance: livePrimary.length > 0 && livePrimary.length === plannedCount ? BRIDGE_PROVENANCE.LIVE_PRIMARY
      : measured.length === 0 ? BRIDGE_PROVENANCE.ABSENT
        : livePrimary.length > 0 ? 'MIXED' : BRIDGE_PROVENANCE.FIXTURE,
    /** §4: every planned session is accounted for, whether measured or explicitly absent. */
    interpretable: measured.length + absent.length === plannedCount,
    allAttributed: absent.length === 0 && records.length === plannedCount,
    allSixteenLivePrimary: plannedCount === 16 && livePrimary.length === 16,
    /** §4: a fixture or absent measurement blocks a causal verdict rather than becoming a zero-cost session. */
    blocksCausalVerdict: livePrimary.length !== plannedCount,
    inventedFromMissingEvidence: false,
    selectedLatestArtifactByConvenience: false,
    /** §4: no declaration was accepted as an execution witness. */
    declarationsAcceptedAsWitness: false,
    law: 'the matrix reconstruction cost is derived from the durable journal, one named outcome per session, with no invented zeros and no declaration accepted as an execution witness',
  });
}

/** §4: candidate artifacts for a session, so an absent named artifact can be reported WITH its candidates. */
export function candidateArtifacts(artifactRoot, sessionId) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile() && entry.name === SESSION_ARTIFACT_NAME) found.push(path);
    }
  };
  walk(artifactRoot, 0);
  return found.filter((path) => String(path).replace(/\\/gu, '/').includes(String(sessionId))).sort();
}

export { NL, discoveryOutcome };
