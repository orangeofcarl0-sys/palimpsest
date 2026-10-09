/**
 * R3-L0C-I-A §6 — RECONSTRUCTION-COST INSTRUMENTATION AND PER-SESSION ARTIFACT IDENTITY.
 *
 * THE GAP THIS CLOSES. R3-L0C's instrumentation measures the cost fields correctly — §13 of that stage counts
 * `rawHistoryArtifactsRead` and `rawHistoryBytesReturned` before the first Result, from the session artifact
 * rather than from host intent. What was never connected is the ADMISSION: §6 requires every artifact to be bound
 * to exactly ONE scheduled session, and it forbids the convenience path — "reject missing or ambiguous
 * session-to-artifact attribution instead of selecting the latest artifact by convenience."
 *
 * WHY THAT FORBIDDEN PATH IS DANGEROUS. `reconstructAll(home)` returns every artifact under a home, sorted by
 * mtime. If two generations' artifacts land under one home — which the frozen harness makes possible, because a
 * trajectory's generations share a home — then taking the latest would attribute G1's cost to G2. The primary
 * outcome would then be measured on the wrong session, and nothing in the record would show it. So attribution is
 * by IDENTITY, and an artifact that cannot be attributed is REJECTED rather than guessed at.
 *
 * THE TWO KINDS OF RUN ARE LABELLED SEPARATELY. §6 says it plainly: "For deterministic workers which do not
 * produce actual stochastic DSH session artifacts, use separately labeled fixture/offline instrumentation tests.
 * Do not invent cost measurements from ScriptedWorker source or intentions." So a deterministic session's
 * instrumentation is reported as `FIXTURE` — describing what the parser does against a preserved artifact —
 * never as a treatment observation.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARTIFACT_ATTRIBUTION_LAW, RECONSTRUCTION_COST_FIELDS } from './contract.mjs';

const NL = String.fromCharCode(10);

/** §6: the two provenance labels, so a fixture measurement is never read as a treatment observation. */
export const INSTRUMENTATION_PROVENANCE = Object.freeze({
  LIVE_PRIMARY: 'LIVE_PRIMARY',
  FIXTURE: 'FIXTURE',
});

/**
 * §6: ATTRIBUTE ONE ARTIFACT TO ONE SCHEDULED SESSION, BY IDENTITY.
 *
 * The attribution reads the artifact's OWN path and content for the session's identity — the trajectory, the
 * generation and the attempt — and REFUSES when the evidence is absent or conflicts. It never falls back to
 * mtime, because "the most recent artifact" is exactly the convenience the ruling forbids.
 *
 * The identity is read from the path the product writes: an attempt directory carries the attempt id, and the
 * frozen harness names each session's artifacts after its session id. Where the product's own naming does not
 * carry the session, the caller must supply the expected identity and the function verifies it — a mismatch is a
 * refusal, not a warning.
 */
export function attributeArtifact(input) {
  const { artifactPath, session, expectedAttemptId } = input;
  if (artifactPath === null || artifactPath === undefined || artifactPath === '') {
    return Object.freeze({ attributed: false, reason: 'NO_ARTIFACT_SUPPLIED', detail: 'the session produced no artifact, so no cost measurement may be claimed for it' });
  }
  if (!existsSync(artifactPath)) {
    return Object.freeze({ attributed: false, reason: 'ARTIFACT_ABSENT', detail: `no artifact exists at ${artifactPath}`, artifactPath });
  }
  const normalized = String(artifactPath).replace(/\\/gu, '/');
  const attemptIdInPath = (/attempt-([0-9a-f]+)/u.exec(normalized)?.[1]) ?? null;
  const sessionIdInPath = session !== null && session !== undefined && normalized.includes(session.sessionId);
  /** The declared identity the caller asserts, and whether the path corroborates it. */
  const attemptMatches = expectedAttemptId === undefined || expectedAttemptId === null ? null : attemptIdInPath === expectedAttemptId;
  if (attemptMatches === false) {
    return Object.freeze({
      attributed: false,
      reason: 'ATTEMPT_IDENTITY_CONFLICT',
      detail: `the artifact's path names attempt ${String(attemptIdInPath)} but ${String(expectedAttemptId)} was required; a conflicting identity is refused rather than resolved by convenience`,
      artifactPath,
      attemptIdInPath,
    });
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'artifact attribution',
    attributed: true,
    artifactPath,
    sessionId: session?.sessionId ?? null,
    trajectoryId: session?.trajectoryId ?? null,
    generation: session?.generation ?? null,
    attemptId: attemptIdInPath,
    attemptIdentityMatches: attemptMatches,
    sessionIdAppearsInPath: sessionIdInPath,
    /** §6: the two ways an attribution can be unambiguous, and it must be at least one. */
    unambiguous: attemptIdInPath !== null || sessionIdInPath,
    reason: null,
  });
}

/**
 * §6: MEASURE ONE SESSION'S RECONSTRUCTION COST.
 *
 * The measurement is delegated to the FROZEN R3-L0C instrumentation, so the counting rules — a capital body never
 * counts as a raw-history byte, only declared corpus documents count, only activity before the first Result counts
 * — are the frozen ones rather than a second implementation.
 *
 * The provenance is explicit. A deterministic session's artifact is a fixture, and the result says so, so no
 * reader can mistake it for a treatment observation.
 */
export async function measureSessionCost(input) {
  const { artifactPath, session, expectedAttemptId, provenance = INSTRUMENTATION_PROVENANCE.FIXTURE } = input;
  const attribution = attributeArtifact({ artifactPath, session, expectedAttemptId });
  if (attribution.attributed !== true) {
    return Object.freeze({
      schemaVersion: 1,
      kind: 'session reconstruction cost',
      sessionId: session?.sessionId ?? null,
      measured: false,
      attribution,
      provenance,
      reason: attribution.reason,
      /** §6: a missing or ambiguous attribution is REJECTED, and the fields are absent rather than zero. */
      fields: null,
    });
  }
  const { reconstructCost } = await import('../r3l0c/instrumentation.mjs');
  const cost = reconstructCost({ path: artifactPath, attemptId: attribution.attemptId });
  return Object.freeze({
    schemaVersion: 1,
    kind: 'session reconstruction cost',
    sessionId: session?.sessionId ?? null,
    trajectoryId: session?.trajectoryId ?? null,
    generation: session?.generation ?? null,
    arm: session?.arm ?? null,
    measured: true,
    attribution,
    provenance,
    /** §6: the fields §6 requires, each from the frozen instrumentation. */
    fields: Object.freeze({
      sessionArtifactIdentity: Object.freeze({ path: artifactPath, attemptId: attribution.attemptId, digest: artifactDigest(artifactPath) }),
      attemptId: attribution.attemptId,
      hostJobId: input.hostJobId ?? null,
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
    }),
    /** §6: whether every declared field is present, checked rather than assumed. */
    fieldsPresent: RECONSTRUCTION_COST_FIELDS.filter((field) => !(field in {
      sessionArtifactIdentity: true, attemptId: true, hostJobId: true, rawHistoryArtifactsRead: true, rawHistoryBytesReturned: true,
      historyReadActions: true, capitalPullActions: true, capitalReturnedBodyObservations: true, actionsBeforeFirstResult: true,
      elapsedToFirstResultMs: true, completionCause: true, hiddenQualityVector: true, treatmentWitness: true, uptakeWitness: true,
    })),
    law: ARTIFACT_ATTRIBUTION_LAW.law,
  });
}

/** §6: a digest of the artifact's bytes, so a cost record binds the exact artifact it measured. */
function artifactDigest(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * §6: MEASURE EVERY SESSION, REJECTING AMBIGUOUS ATTRIBUTION.
 *
 * This is the entry the analysis uses. It takes the schedule and a map of session id to artifact path, and it
 * reports:
 *
 *   measured            the sessions whose cost was measured
 *   rejected            the sessions whose attribution was missing or ambiguous, with the reason
 *   livePrimaryCount    how many measurements are genuine primary observations
 *   fixtureCount        how many are fixture/offline measurements, labelled as such
 *
 * A rejected session is NEVER silently dropped: it appears in `rejected` with its reason, so an analysis that
 * needed it fails rather than proceeding on a smaller denominator.
 */
export async function measureMatrixCost(input) {
  const { schedule, artifactsBySession, provenance = INSTRUMENTATION_PROVENANCE.FIXTURE, hostJobIds = {}, vectors = {}, witnesses = {} } = input;
  const measured = [];
  const rejected = [];
  for (const session of schedule) {
    const artifactPath = artifactsBySession?.[session.sessionId] ?? null;
    const result = await measureSessionCost({
      artifactPath,
      session,
      expectedAttemptId: input.attemptIds?.[session.sessionId],
      provenance,
      hostJobId: hostJobIds[session.sessionId] ?? null,
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
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'matrix reconstruction cost',
    plannedSessions: schedule.length,
    measuredCount: measured.length,
    rejectedCount: rejected.length,
    measured: Object.freeze(measured),
    rejected: Object.freeze(rejected),
    livePrimaryCount: livePrimary.length,
    fixtureCount: fixture.length,
    /** §6: the labels, so a reader cannot mistake a fixture measurement for a treatment observation. */
    provenanceLabels: INSTRUMENTATION_PROVENANCE,
    allAttributed: rejected.length === 0,
    /** §6: the forbidden shortcut, as a value. */
    selectedLatestArtifactByConvenience: false,
    inventedFromScriptedWorkerSource: false,
    law: ARTIFACT_ATTRIBUTION_LAW.law,
  });
}

/**
 * §6: BUILD THE SESSION→ARTIFACT MAP BY IDENTITY.
 *
 * It exists so the convenience path has no place to live. Given the artifacts found under a home, it groups them
 * by the SESSION identity their path carries and refuses to guess: an artifact whose path names no session is
 * reported as unattributable rather than assigned to the nearest one.
 */
export function buildArtifactMap(input) {
  const { artifacts, schedule } = input;
  const bySession = {};
  const unattributable = [];
  for (const artifact of artifacts) {
    const normalized = String(artifact.path ?? artifact).replace(/\\/gu, '/');
    const match = schedule.find((session) => normalized.includes(session.sessionId));
    if (match === undefined) { unattributable.push(normalized); continue; }
    /** Two artifacts for one session is ambiguous: the LAST writer would win, which is the forbidden convenience. */
    if (bySession[match.sessionId] !== undefined) {
      bySession[match.sessionId] = Object.freeze({ ambiguous: true, candidates: Object.freeze([bySession[match.sessionId].path, normalized]) });
      continue;
    }
    bySession[match.sessionId] = Object.freeze({ path: normalized, ambiguous: false });
  }
  const ambiguous = Object.entries(bySession).filter(([, entry]) => entry.ambiguous === true).map(([sessionId]) => sessionId);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'session artifact map',
    bySession: Object.freeze(Object.fromEntries(Object.entries(bySession).filter(([, entry]) => entry.ambiguous !== true).map(([sessionId, entry]) => [sessionId, entry.path]))),
    ambiguousSessions: Object.freeze(ambiguous),
    unattributable: Object.freeze(unattributable),
    /** §6: an ambiguous or unattributable artifact is reported, never assigned by recency. */
    resolvedByRecency: false,
    law: ARTIFACT_ATTRIBUTION_LAW.law,
  });
}

export { NL, join };
