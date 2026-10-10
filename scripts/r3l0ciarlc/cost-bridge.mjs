/**
 * R3-L0C-I-A-R-L-C §3 Gate A — THE DURABLE EVIDENCE TO RECONSTRUCTION COST BRIDGE.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlDurableCostDisconnection` by CALLING
 * the real functions: the prior stage binds a live-evidence sidecar digest into the durable `TRIAL_RECORDED`
 * record through the frozen `contentDigests` field, but the matrix cost measurement consumes
 * `record.sessionArtifactPath` — a field the frozen admitted record does NOT carry (`JOURNAL_FIELDS` has no such
 * field and `buildGenerationRecord` builds exactly that set). So a genuine journal readback reads `null` for every
 * session and attributes nothing, even though the artifact exists and the record points at its sidecar.
 *
 * THE REPAIR IS A BRIDGE THAT STARTS FROM THE DURABLE JOURNAL AND RESOLVES THE BINDING. It does not add a journal
 * field, and it creates no canonical store. The chain is exactly §3's:
 *
 *     TRIAL_RECORDED → payload.record → contentDigests binding → sidecar verification → session/attempt/host-job
 *     identity → uniquely attributed DSH artifact → artifact digest verification → frozen reconstruction-cost
 *     instrumentation
 *
 * WHY THE FROZEN INSTRUMENTATION AND NOT A SECOND PARSER. §3 says reuse it, and the frozen
 * `reconstructCost` is what the study's cost outcomes mean. A reimplementation would be a second thing to keep in
 * step, and the two would eventually disagree about what a raw-history read is.
 *
 * WHY PROVENANCE IS DERIVED HERE. §3: "File existence and a caller-provided `mode` label alone are insufficient
 * proof of LIVE_PRIMARY." So LIVE_PRIMARY requires the record's OWN `intendedExecutorRoute` to name the primary
 * route, the sidecar's mode to be PRIMARY, AND the artifact digest to verify. All three, or the provenance is
 * FIXTURE (a non-primary artifact) or ABSENT (no artifact).
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { BRIDGE_PROVENANCE, COST_BRIDGE_OUTCOMES, NL } from './contract.mjs';

/** §3: the sidecar directory, matching the prior stage's own layout so the binding resolves. */
export const LIVE_EVIDENCE_DIRECTORY = 'private/live-evidence';

/** §3: the artifact file name the shipped runtime writes. */
export const SESSION_ARTIFACT_NAME = 'session.v4.jsonl.zstd';

/** §3: the digest of a file's bytes, or null when it is absent or unreadable. */
export function digestOfFile(path) {
  if (path === null || path === undefined || !existsSync(path)) return null;
  try { return createHash('sha256').update(readFileSync(path)).digest('hex'); } catch { return null; }
}

/** §3: the outcome vocabulary, so a caller reads the state by name rather than by a boolean. */
export function bridgeOutcome(id) {
  const found = COST_BRIDGE_OUTCOMES.find((entry) => entry.id === id);
  return found ?? Object.freeze({ id, measured: false, provenance: null, detail: 'an undeclared bridge outcome' });
}

/**
 * §3: DERIVE THE PROVENANCE FROM VERIFIED EVIDENCE.
 *
 * Three facts, all required for LIVE_PRIMARY. The record's route is the DURABLE one, so a caller label cannot
 * substitute; the sidecar's mode is what the generation recorded; and the artifact digest is verified against the
 * sidecar's own record of it.
 */
export function deriveBridgeProvenance(input) {
  const { record, sidecar, artifactDigestVerified } = input;
  const route = String(record?.intendedExecutorRoute ?? '');
  const recordRouteIsPrimary = /omnigate|deepseek|primary/iu.test(route) && !/scripted|deterministic/iu.test(route);
  const sidecarModeIsPrimary = String(sidecar?.mode ?? '') === 'PRIMARY';
  const basis = Object.freeze({
    recordRouteIsPrimary,
    sidecarModeIsPrimary,
    artifactDigestVerified: artifactDigestVerified === true,
    recordRoute: route === '' ? null : route,
    sidecarMode: sidecar?.mode ?? null,
  });
  const live = recordRouteIsPrimary && sidecarModeIsPrimary && artifactDigestVerified === true;
  return Object.freeze({ provenance: live ? BRIDGE_PROVENANCE.LIVE_PRIMARY : BRIDGE_PROVENANCE.FIXTURE, basis, live });
}

/**
 * §3: ATTRIBUTE ONE SESSION'S COST FROM ITS DURABLE RECORD.
 *
 * Every failure mode is its own named outcome, because §3 requires the eight distinctions and forbids collapsing
 * them. The artifact is resolved ONLY through the sidecar the durable record binds — never by scanning for a
 * convenient file — and an ambiguous set is REFUSED rather than resolved by recency.
 */
export async function attributeSessionFromRecord(input) {
  const { runRoot, record, plannedSession, artifactRoot = null } = input;
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

  /** 3. THE ARTIFACT, and its digest against the sidecar's own record. */
  const artifactPath = sidecar?.sessionArtifactPath ?? null;
  if (artifactPath === null || artifactPath === '') {
    return Object.freeze({ sessionId, outcome: bridgeOutcome('ARTIFACT_ABSENT'), measured: false, provenance: null, reason: 'the sidecar names no artifact, so no cost may be claimed for this session', bound, sidecar, fields: null });
  }
  if (!existsSync(artifactPath)) {
    /** §3: an absent named artifact is reported as absent; a nearby candidate is NOT substituted for it. */
    const candidates = artifactRoot === null ? [] : candidateArtifacts(artifactRoot, sessionId);
    return Object.freeze({ sessionId, outcome: bridgeOutcome('ARTIFACT_ABSENT'), measured: false, provenance: null, reason: `no artifact exists at ${artifactPath}`, bound, sidecar, candidates: Object.freeze(candidates), fields: null });
  }
  const artifactDigest = digestOfFile(artifactPath);
  const recordedArtifactDigest = sidecar?.sessionArtifactDigest ?? null;
  if (recordedArtifactDigest !== null && artifactDigest !== recordedArtifactDigest) {
    return Object.freeze({ sessionId, outcome: bridgeOutcome('ARTIFACT_DIGEST_MISMATCH'), measured: false, provenance: null, reason: `the artifact bytes hash to ${String(artifactDigest).slice(0, 16)} but the sidecar recorded ${String(recordedArtifactDigest).slice(0, 16)}`, bound, sidecar, fields: null });
  }

  /** 4. THE IDENTITY. The sidecar's identity must agree with the durable record, and the path must carry the attempt. */
  const identity = compareIdentity({ record, sidecar, artifactPath, plannedSession });
  if (identity.conflicts.length > 0) {
    return Object.freeze({ sessionId, outcome: bridgeOutcome('IDENTITY_CONFLICT'), measured: false, provenance: null, reason: `the artifact identity conflicts on [${identity.conflicts.join(', ')}]`, bound, sidecar, identity, fields: null });
  }

  /** 5. THE PROVENANCE, derived from the verified evidence rather than a label. */
  const provenance = deriveBridgeProvenance({ record, sidecar, artifactDigestVerified: recordedArtifactDigest !== null && artifactDigest === recordedArtifactDigest });

  /** 6. THE FROZEN INSTRUMENTATION. The counting rules are the study's, not a second implementation's. */
  let cost = null;
  try {
    const { reconstructCost } = await import('../r3l0c/instrumentation.mjs');
    cost = reconstructCost({ path: artifactPath, attemptId: identity.attemptId });
  } catch (error) {
    return Object.freeze({ sessionId, outcome: bridgeOutcome('UNINTERPRETABLE_ARTIFACT'), measured: false, provenance: null, reason: `the frozen instrumentation could not reconstruct a cost: ${String(error?.message ?? error).slice(0, 200)}`, bound, sidecar, fields: null });
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
    reason: null,
    bound,
    sidecar,
    identity,
    artifactDigest,
    fields,
    /** §3: a legitimate measured zero is DISTINGUISHABLE from missing evidence — the fields are present and zero. */
    measuredZeroIsDistinguishableFromAbsence: fields.rawHistoryArtifactsRead === 0 && fields.rawHistoryArtifactIds.length === 0,
    law: 'the reconstruction cost is attributed from the durable journal by resolving the bound sidecar, verifying the artifact digest and the identity chain, and reusing the frozen instrumentation',
  });
}

/** §3: compare the artifact's identity against the durable record and the sidecar, field by field. */
export function compareIdentity(input) {
  const { record, sidecar, artifactPath, plannedSession } = input;
  const normalized = String(artifactPath ?? '').replace(/\\/gu, '/');
  const attemptIdInPath = (/attempt-([0-9a-f]+)/u.exec(normalized)?.[1]) ?? null;
  const hostJobIdInPath = (/job-([0-9a-zA-Z]+)/u.exec(normalized)?.[1]) ?? null;
  const recordAttempt = record?.attemptId ?? null;
  const sidecarAttempt = sidecar?.attemptId ?? null;
  const recordJob = record?.hostJobId ?? null;
  const sidecarJob = sidecar?.hostJobId ?? null;
  const conflicts = [];
  /** The sidecar's identity must agree with the durable record's, or the evidence has been crossed. */
  if (recordAttempt !== null && sidecarAttempt !== null && String(recordAttempt) !== String(sidecarAttempt)) conflicts.push('attemptId(sidecar vs record)');
  if (recordJob !== null && sidecarJob !== null && String(recordJob) !== String(sidecarJob)) conflicts.push('hostJobId(sidecar vs record)');
  /** When the path carries an attempt id, it must be the record's. */
  if (attemptIdInPath !== null && recordAttempt !== null && !String(recordAttempt).includes(attemptIdInPath) && !String(attemptIdInPath).includes(String(recordAttempt))) conflicts.push('attemptId(path vs record)');
  /** A planned session's identity, when supplied, must match the record's trajectory/generation/arm. */
  if (plannedSession !== null && plannedSession !== undefined) {
    for (const field of ['trajectoryId', 'generation', 'arm']) {
      if (plannedSession[field] !== undefined && record?.[field] !== undefined && String(plannedSession[field]) !== String(record[field])) conflicts.push(`${field}(plan vs record)`);
    }
  }
  return Object.freeze({
    attemptId: attemptIdInPath ?? recordAttempt ?? sidecarAttempt ?? null,
    hostJobId: hostJobIdInPath ?? recordJob ?? sidecarJob ?? null,
    attemptIdInPath,
    hostJobIdInPath,
    recordAttempt,
    sidecarAttempt,
    recordJob,
    sidecarJob,
    conflicts: Object.freeze(conflicts),
    exact: conflicts.length === 0,
  });
}

/** §3: candidate artifacts for a session, so an absent named artifact can be reported WITH its candidates. */
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

/**
 * §3: THE MATRIX COST, FROM THE DURABLE JOURNAL.
 *
 * This is the authoritative entry. It reads the journal with the FROZEN reader, takes the admitted records from
 * the `TRIAL_RECORDED` payloads, and attributes each. Every session is either measured or carries an explicit
 * labelled absence; nothing is silently dropped and nothing is replaced by an invented zero.
 */
export async function bridgeMatrixCost(input) {
  const { journalPath, runRoot, plannedSessions = null, artifactRoot = null } = input;
  const { readJournal } = await import('../r3l0cf/journal.mjs');
  const journal = readJournal(journalPath);
  const records = journal.records.filter((entry) => entry.kind === 'TRIAL_RECORDED').map((entry) => entry.payload?.record).filter((record) => record !== null && record !== undefined);

  const planned = plannedSessions === null || plannedSessions === undefined ? null : new Set(plannedSessions);
  const measured = [];
  const absent = [];
  const perSession = [];
  for (const record of records) {
    const plannedSession = planned === null ? null : (planned.has(record.sessionId) ? Object.freeze({ sessionId: record.sessionId }) : null);
    const attributed = await attributeSessionFromRecord({ runRoot, record, plannedSession, artifactRoot });
    perSession.push(attributed);
    if (attributed.measured === true) measured.push(attributed);
    else absent.push(Object.freeze({ sessionId: attributed.sessionId, outcome: attributed.outcome.id, reason: attributed.reason, detail: attributed.outcome.detail }));
  }
  const livePrimary = measured.filter((entry) => entry.provenance === BRIDGE_PROVENANCE.LIVE_PRIMARY);
  const fixture = measured.filter((entry) => entry.provenance === BRIDGE_PROVENANCE.FIXTURE);
  const plannedCount = planned === null ? records.length : planned.size;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C',
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
    /** §3: every planned session is accounted for, whether measured or explicitly absent. */
    interpretable: measured.length + absent.length === plannedCount,
    allAttributed: absent.length === 0 && records.length === plannedCount,
    allSixteenLivePrimary: plannedCount === 16 && livePrimary.length === 16,
    /** §3: a fixture or absent measurement blocks a causal verdict rather than becoming a zero-cost session. */
    blocksCausalVerdict: livePrimary.length !== plannedCount,
    inventedFromMissingEvidence: false,
    selectedLatestArtifactByConvenience: false,
    law: 'the matrix reconstruction cost is derived from the durable journal, one named outcome per session, with no invented zeros',
  });
}

export { NL };
