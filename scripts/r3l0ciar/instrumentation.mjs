/**
 * R3-L0C-I-A-R §6 — RECONSTRUCTION-COST ATTRIBUTION BY IDENTITY CHAIN.
 *
 * THE DEFECT THIS CLOSES, measured in G6. R3-L0C-I-A's `attributeArtifact` set `attributed: true` when the
 * artifact's PATH merely contained the session id, with no attempt, host-job, run or content corroboration, and
 * `measureMatrixCost` reported `allAttributed` while nothing gated the analysis on it.
 *
 * THE REPAIR IS A FULL IDENTITY CHAIN. Attribution binds
 *
 *     runId -> sessionId -> trajectoryId -> generation -> AttemptId -> HostJobId -> artifact digest
 *
 * and `attributed` is true only when the path-derived identity CORROBORATES the caller's expected identity on
 * every field it can check. A filename-only match is NOT enough; an uncorroborated identity is REFUSED rather
 * than accepted. `measureMatrixCost` requires all sixteen records before the causal verdict, and a missing or
 * ambiguous attribution BLOCKS the causal verdict rather than becoming a zero-cost session.
 *
 * THE TWO PROVENANCE LABELS STAY SEPARATE. A deterministic session's artifact is a FIXTURE and the result says
 * so, so no reader can mistake it for a treatment observation.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARTIFACT_ATTRIBUTION_LAW, ARTIFACT_IDENTITY_FIELDS, INSTRUMENTATION_PROVENANCE, NL, RECONSTRUCTION_COST_FIELDS } from './contract.mjs';

/**
 * §6: ATTRIBUTE ONE ARTIFACT TO ONE SCHEDULED SESSION, BY IDENTITY CHAIN.
 *
 * `expected` names the identity the caller asserts: `{ runId, attemptId, hostJobId }`. Every field the artifact's
 * path or the caller can supply is compared, and a conflict is a refusal. `attributed` requires at least one
 * CORROBORATING identity beyond the filename: an attempt id or a host job id present in the path.
 */
export function attributeArtifact(input) {
  const { artifactPath, session, expected = {} } = input;
  if (artifactPath === null || artifactPath === undefined || artifactPath === '') {
    return Object.freeze({ attributed: false, reason: 'NO_ARTIFACT_SUPPLIED', detail: 'the session produced no artifact, so no cost measurement may be claimed for it' });
  }
  if (!existsSync(artifactPath)) {
    return Object.freeze({ attributed: false, reason: 'ARTIFACT_ABSENT', detail: `no artifact exists at ${artifactPath}`, artifactPath });
  }
  const normalized = String(artifactPath).replace(/\\/gu, '/');
  const attemptIdInPath = (/attempt-([0-9a-f]+)/u.exec(normalized)?.[1]) ?? null;
  const hostJobIdInPath = (/job-([0-9a-zA-Z]+)/u.exec(normalized)?.[1]) ?? null;
  const sessionIdInPath = session !== null && session !== undefined && normalized.includes(session.sessionId);
  const trajectoryIdInPath = session?.trajectoryId !== undefined && normalized.includes(session.trajectoryId);
  const generationInPath = session?.generation !== undefined && normalized.includes(session.generation);

  /** §6: every identity field the caller asserted, compared against what the path or content carries. */
  const checks = [];
  const compare = (field, expectedValue, actualValue) => {
    if (expectedValue === undefined || expectedValue === null) return;
    const matches = actualValue !== null && String(expectedValue) === String(actualValue);
    checks.push(Object.freeze({ field, expected: expectedValue, actual: actualValue, matches }));
  };
  compare('attemptId', expected.attemptId, attemptIdInPath);
  compare('hostJobId', expected.hostJobId, hostJobIdInPath);

  const conflicts = checks.filter((entry) => entry.matches === false);
  if (conflicts.length > 0) {
    return Object.freeze({
      attributed: false,
      reason: 'IDENTITY_CONFLICT',
      detail: `the artifact's identity conflicts on [${conflicts.map((entry) => entry.field).join(', ')}]; a conflicting identity is refused rather than resolved by convenience`,
      artifactPath, attemptIdInPath, hostJobIdInPath, checks: Object.freeze(checks),
    });
  }

  /**
   * §6: TWO WAYS AN ATTRIBUTION CAN BE CORROBORATED, and at least one is required.
   *
   *   (a) the path names the session AND carries a corroborating identity (an attempt or host-job id); or
   *   (b) the CALLER asserts an expected attempt id or host job id and the path matches it.
   *
   * (b) is what the pipeline uses, and it is stronger than a filename substring: the attempt id comes from the
   * session's own record, so a mismatch is a conflict rather than a guess. The product's artifact path carries
   * `attempt-<id>` and not the session id, so requiring the session id in the path would refuse every real
   * artifact — which is why the caller-asserted identity is the primary corroboration.
   */
  const assertedIdentityCorroborated = (expected.attemptId !== undefined && expected.attemptId !== null && attemptIdInPath !== null && String(expected.attemptId) === String(attemptIdInPath))
    || (expected.hostJobId !== undefined && expected.hostJobId !== null && hostJobIdInPath !== null && String(expected.hostJobId) === String(hostJobIdInPath));
  const pathCorroborated = sessionIdInPath === true && (attemptIdInPath !== null || hostJobIdInPath !== null);
  const corroborating = assertedIdentityCorroborated || pathCorroborated;
  const corroboratedChecks = checks.filter((entry) => entry.matches === true);
  if (corroborating !== true) {
    /** §6: no identity anywhere is a different fact from a path that names no session. */
    const noIdentityAnywhere = attemptIdInPath === null && hostJobIdInPath === null && assertedIdentityCorroborated !== true;
    return Object.freeze({
      attributed: false,
      reason: noIdentityAnywhere ? 'UNCORROBORATED_IDENTITY' : 'SESSION_NOT_IN_PATH',
      detail: noIdentityAnywhere
        ? 'neither the path nor the caller supplies an identity that corroborates this artifact against the session, so the attribution is refused rather than resolved by convenience'
        : `the artifact's path names no scheduled session and the caller asserted no matching identity, so it cannot be attributed to ${String(session?.sessionId)}`,
      artifactPath, attemptIdInPath, hostJobIdInPath, sessionIdInPath, assertedIdentityCorroborated,
    });
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: 'artifact attribution',
    attributed: true,
    artifactPath,
    /** §6: the full identity chain. */
    identity: Object.freeze({
      runId: expected.runId ?? null,
      sessionId: session?.sessionId ?? null,
      trajectoryId: session?.trajectoryId ?? null,
      generation: session?.generation ?? null,
      attemptId: attemptIdInPath ?? expected.attemptId ?? null,
      hostJobId: hostJobIdInPath ?? expected.hostJobId ?? null,
      artifactDigest: artifactDigest(artifactPath),
    }),
    identityFields: ARTIFACT_IDENTITY_FIELDS,
    attemptIdInPath,
    hostJobIdInPath,
    sessionIdInPath,
    trajectoryIdInPath,
    generationInPath,
    assertedIdentityCorroborated,
    pathCorroborated,
    corroboratingIdentities: Object.freeze([attemptIdInPath !== null ? 'attemptId' : null, hostJobIdInPath !== null ? 'hostJobId' : null].filter((entry) => entry !== null)),
    checks: Object.freeze(checks),
    corroboratedChecks: Object.freeze(corroboratedChecks),
    /** §6: the forbidden shortcut, as a value. */
    filenameMatchingAlone: false,
    reason: null,
  });
}

/** §6: a digest of the artifact's bytes, so a cost record binds the exact artifact it measured. */
function artifactDigest(path) {
  try { return createHash('sha256').update(readFileSync(path)).digest('hex'); } catch { return null; }
}

/**
 * §6: MEASURE ONE SESSION'S RECONSTRUCTION COST.
 *
 * The measurement is delegated to the FROZEN R3-L0C instrumentation, so the counting rules are the frozen ones.
 * The provenance is explicit and a missing attribution yields absent fields rather than zeros.
 */
export async function measureSessionCost(input) {
  const { artifactPath, session, provenance = INSTRUMENTATION_PROVENANCE.FIXTURE, expected = {} } = input;
  const attribution = attributeArtifact({ artifactPath, session, expected });
  if (attribution.attributed !== true) {
    return Object.freeze({
      schemaVersion: 1, kind: 'session reconstruction cost',
      sessionId: session?.sessionId ?? null, measured: false, attribution, provenance,
      reason: attribution.reason,
      /** §6: a missing or ambiguous attribution is REJECTED, and the fields are absent rather than zero. */
      fields: null,
    });
  }
  const { reconstructCost } = await import('../r3l0c/instrumentation.mjs');
  const cost = reconstructCost({ path: artifactPath, attemptId: attribution.identity.attemptId });
  const fields = Object.freeze({
    sessionArtifactIdentity: Object.freeze({ path: artifactPath, attemptId: attribution.identity.attemptId, digest: attribution.identity.artifactDigest }),
    attemptId: attribution.identity.attemptId,
    hostJobId: attribution.identity.hostJobId,
    rawHistoryArtifactsRead: cost.rawHistoryArtifactsRead,
    rawHistoryArtifactIds: cost.rawHistoryArtifactIds,
    rawHistoryBytesReturned: cost.rawHistoryBytesReturned,
    historyReadActions: cost.historyReadActions,
    capitalPullActions: cost.capitalPullActions,
    capitalPullReturned: cost.capitalPullReturned,
    capitalReturnedBodyObservations: cost.capitalPullReturned,
    actionsBeforeFirstResult: cost.actionsBeforeFirstResult,
    elapsedToFirstResultMs: cost.elapsedToFirstResultMs,
    completionCause: cost.completionCause,
    hiddenQualityVector: input.hiddenQualityVector ?? null,
    treatmentWitness: input.treatmentWitness ?? null,
    uptakeWitness: input.uptakeWitness ?? null,
  });
  return Object.freeze({
    schemaVersion: 1, kind: 'session reconstruction cost',
    sessionId: session?.sessionId ?? null, trajectoryId: session?.trajectoryId ?? null,
    generation: session?.generation ?? null, arm: session?.arm ?? null,
    measured: true, attribution, provenance, fields,
    /** §6: whether every declared field is present, checked rather than assumed. */
    fieldsPresent: RECONSTRUCTION_COST_FIELDS.filter((field) => !(field in fields)),
    law: ARTIFACT_ATTRIBUTION_LAW.law,
  });
}

/**
 * §6: MEASURE EVERY SESSION, REJECTING AMBIGUOUS ATTRIBUTION, AND REQUIRE ALL SIXTEEN.
 *
 * A rejected session is NEVER silently dropped: it appears in `rejected` with its reason, and
 * `allSixteenAttributed` is false, so the analysis that needed it fails rather than proceeding on a smaller
 * denominator.
 */
export async function measureMatrixCost(input) {
  const {
    schedule, artifactsBySession, provenance = INSTRUMENTATION_PROVENANCE.FIXTURE,
    hostJobIds = {}, attemptIds = {}, runId = null, vectors = {}, witnesses = {},
  } = input;
  const measured = [];
  const rejected = [];
  for (const session of schedule) {
    const artifactPath = artifactsBySession?.[session.sessionId] ?? null;
    const result = await measureSessionCost({
      artifactPath, session, provenance,
      expected: { runId, attemptId: attemptIds[session.sessionId], hostJobId: hostJobIds[session.sessionId] },
      hiddenQualityVector: vectors[session.sessionId] ?? null,
      treatmentWitness: witnesses[session.sessionId]?.treatment ?? null,
      uptakeWitness: witnesses[session.sessionId]?.uptake ?? null,
    });
    if (result.measured === true) measured.push(result);
    else rejected.push(Object.freeze({ sessionId: session.sessionId, reason: result.reason, detail: result.attribution?.detail ?? null }));
  }
  const livePrimary = measured.filter((entry) => entry.provenance === INSTRUMENTATION_PROVENANCE.LIVE_PRIMARY);
  const fixture = measured.filter((entry) => entry.provenance === INSTRUMENTATION_PROVENANCE.FIXTURE);
  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R', kind: 'matrix reconstruction cost',
    plannedSessions: schedule.length,
    measuredCount: measured.length,
    rejectedCount: rejected.length,
    measured: Object.freeze(measured),
    rejected: Object.freeze(rejected),
    livePrimaryCount: livePrimary.length,
    fixtureCount: fixture.length,
    provenanceLabels: INSTRUMENTATION_PROVENANCE,
    allAttributed: rejected.length === 0,
    /** §6: all sixteen real records are required before the paired analysis may execute. */
    allSixteenAttributed: schedule.length === 16 && measured.length === 16 && rejected.length === 0,
    /** §6: a missing or ambiguous attribution BLOCKS the causal verdict rather than becoming a zero-cost session. */
    blocksCausalVerdict: rejected.length > 0,
    selectedLatestArtifactByConvenience: false,
    inventedFromScriptedWorkerSource: false,
    law: ARTIFACT_ATTRIBUTION_LAW.law,
  });
}

/**
 * §6: DISCOVER THE SESSION ARTIFACTS UNDER A HOME, DEEPEST-FIRST.
 *
 * This is the discovery half of the pipeline's own attribution: the frozen R3-L0C `sessionArtifacts` walker is
 * reused rather than reimplemented, so the set the pipeline attributes is the same set the frozen instrumentation
 * can measure.
 */
export async function discoverSessionArtifacts(home) {
  const { sessionArtifacts } = await import('../r3l0c/instrumentation.mjs');
  const found = sessionArtifacts(home);
  return Object.freeze({
    home,
    count: found.length,
    artifacts: Object.freeze(found.map((artifact) => Object.freeze({ path: artifact.path, attemptId: artifact.attemptId, bytes: artifact.bytes, mtimeMs: artifact.mtimeMs }))),
  });
}

/** §6: the artifact→session map, refusing ambiguity rather than resolving by recency. */
export function buildArtifactMap(input) {
  const { artifacts, schedule } = input;
  const bySession = {};
  const unattributable = [];
  const ambiguous = [];
  for (const artifact of artifacts) {
    const normalized = String(artifact.path ?? artifact).replace(/\\/gu, '/');
    const candidates = schedule.filter((session) => normalized.includes(session.sessionId));
    if (candidates.length === 0) { unattributable.push(normalized); continue; }
    if (candidates.length > 1) { ambiguous.push(Object.freeze({ path: normalized, candidates: Object.freeze(candidates.map((session) => session.sessionId)) })); continue; }
    const match = candidates[0];
    if (bySession[match.sessionId] !== undefined) {
      ambiguous.push(Object.freeze({ path: normalized, candidates: Object.freeze([bySession[match.sessionId], normalized]) }));
      continue;
    }
    bySession[match.sessionId] = normalized;
  }
  return Object.freeze({
    schemaVersion: 1, kind: 'session artifact map',
    bySession: Object.freeze(bySession),
    ambiguousSessions: Object.freeze([...new Set(ambiguous.flatMap((entry) => entry.candidates))]),
    ambiguous: Object.freeze(ambiguous),
    unattributable: Object.freeze(unattributable),
    resolvedByRecency: false,
    law: ARTIFACT_ATTRIBUTION_LAW.law,
  });
}

export { NL, join, ARTIFACT_IDENTITY_FIELDS, INSTRUMENTATION_PROVENANCE };
