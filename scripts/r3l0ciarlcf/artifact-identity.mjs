/**
 * R3-L0C-I-A-R-L-C-F §4 Gate F2 — ACTUAL DSH ARTIFACT IDENTITY AND EXECUTION PROVENANCE.
 *
 * THE TWO DEFECTS THIS CLOSES, both measured by `baseline/legacy-controls.mjs controlUnverifiedLivePrimary` by
 * CALLING the real functions:
 *
 *   1. `deriveBridgeProvenance` produced LIVE_PRIMARY from a REGEX MATCH on the record's route string, the sidecar's
 *      mode being 'PRIMARY' and a verified digest. None of those is an independent observation: a caller who writes
 *      the route string and the mode gets LIVE_PRIMARY, and no field names the scheduled run, the observed worker
 *      process or the host/work relationship. §4: "A route string saying 'DeepSeek' and a sidecar field saying
 *      'PRIMARY' are declarations, not independent observations."
 *
 *   2. `compareIdentity` compared the path-derived attempt id against the record's with `String.includes()` in BOTH
 *      directions, so `attempt-abcdef` was accepted as the same identity as `attempt-abcdef0123456789` — a DIFFERENT
 *      attempt. §4: "Do not assume a parser returning only the hexadecimal suffix has the same identity
 *      representation as the canonical Work AttemptId. Establish the exact normalization contract before
 *      comparison."
 *
 * THE REPAIR HAS TWO HALVES, AND THEY ARE SEPARATE FACTS.
 *
 *   IDENTITY      the canonical `attempt-<hex>` and the path-derived bare `<hex>` are compared by EXACT normalized
 *                 equality. A prefix or substring collision is a different identity and is REFUSED.
 *   DISCOVERY     the artifact is found by searching ONLY the expected per-trajectory DSH home for the artifact
 *                 whose identity is the scheduled attempt's, rather than by accepting a caller-supplied path.
 *   PROVENANCE    LIVE_PRIMARY requires an independently corroborated EXECUTION WITNESS. A declaration is not one.
 *
 * WHAT THIS STAGE CANNOT DO. §4 forbids invoking a paid model to manufacture a witness, and forbids relabelling
 * historical artifacts as current observations. So `corroborateExecutionWitness` requires a witness that names the
 * scheduled run, the observed worker/attempt/host-job relationship, the real worker process and the uniquely
 * attributed artifact — and this stage has no authentic current-run witness, because producing one requires a
 * PRIMARY launch. The honest verdict is therefore `LIVE_PRIMARY_PROVENANCE = NOT_ESTABLISHED`, and this module
 * RETURNS that rather than promoting a declaration to a pass.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ARTIFACT_DISCOVERY_OUTCOMES, ATTEMPT_ID, BRIDGE_PROVENANCE, EXECUTION_WITNESS, NL } from './contract.mjs';

/** §4: the artifact file name the shipped runtime writes. */
export const SESSION_ARTIFACT_NAME = 'session.v4.jsonl.zstd';

/** §4: the canonical prefix on a Work AttemptId. */
const CANONICAL_PREFIX = ATTEMPT_ID.canonicalPrefix;

/** §4: the outcome vocabulary, so a caller reads the state by name rather than by a boolean. */
export function discoveryOutcome(id) {
  return ARTIFACT_DISCOVERY_OUTCOMES.find((entry) => entry.id === id) ?? Object.freeze({ id, discovered: false, ambiguous: false, detail: 'an undeclared discovery outcome' });
}

/**
 * §4: NORMALIZE A WORK ATTEMPT ID TO ITS BARE FORM.
 *
 * The canonical representation is `attempt-<hex>`; a DSH artifact path carries the BARE `<hex>` under an
 * `attempt-<hex>/` directory. Stripping the canonical prefix from both sides is what makes the two comparable —
 * and the comparison is then EXACT, not a substring test.
 */
export function normalizeAttemptId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  return text.startsWith(CANONICAL_PREFIX) ? text.slice(CANONICAL_PREFIX.length) : text;
}

/** §4: whether two attempt identities are the SAME identity, by exact normalized equality. */
export function attemptIdentityEquals(left, right) {
  const a = normalizeAttemptId(left);
  const b = normalizeAttemptId(right);
  if (a === null || b === null) return false;
  return a === b;
}

/** §4: the attempt id a path encodes, or null. The path form is `attempt-<bare>/...`. */
export function attemptIdFromPath(path) {
  const normalized = String(path ?? '').replace(/\\/gu, '/');
  const match = /(?:^|\/)attempt-([0-9a-fA-F]+)(?:\/|$)/u.exec(normalized);
  return match?.[1] ?? null;
}

/**
 * §4: DISCOVER THE SCHEDULED ATTEMPT'S ARTIFACT UNDER THE SESSION'S OWN DSH HOME.
 *
 * §4 requires candidate discovery to be scoped to the exact session and its associated DSH home, bound to the Work
 * AttemptId the actual execution produced, to reject zero candidates as absent, to reject ambiguity WITHOUT
 * selecting the latest by mtime, to verify the selected artifact's digest, and to never infer a missing identity
 * from a filename substring.
 *
 * `expectedAttemptId` is the CANONICAL `attempt-<hex>` the execution produced. Discovery matches on EXACT normalized
 * identity, so a prefix collision is not a candidate.
 */
export function discoverScheduledArtifact(input) {
  const { dshHomePath, sessionId = null, expectedAttemptId = null, maxDepth = 8 } = input;
  if (dshHomePath === null || dshHomePath === undefined || !existsSync(dshHomePath)) {
    return Object.freeze({ ...discoveryOutcome('SCOPE_UNAVAILABLE'), home: dshHomePath ?? null, candidates: Object.freeze([]), selected: null, expectedAttemptId, sessionId });
  }
  const found = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile() && entry.name === SESSION_ARTIFACT_NAME) {
        const attemptId = attemptIdFromPath(path);
        found.push(Object.freeze({ path, attemptId, bytes: statSync(path).size, mtimeMs: statSync(path).mtimeMs }));
      }
    }
  };
  walk(dshHomePath, 0);

  /** §4: an artifact whose path encodes NO attempt identity cannot be attributed, and is reported separately. */
  const identifiable = found.filter((artifact) => artifact.attemptId !== null);
  if (identifiable.length === 0) {
    return Object.freeze({
      ...discoveryOutcome(found.length === 0 ? 'NO_CANDIDATE' : 'IDENTITY_UNPARSEABLE'),
      home: dshHomePath, sessionId, expectedAttemptId,
      artifactsSeen: found.length, candidates: Object.freeze([]), selected: null,
    });
  }

  /** §4: EXACT normalized identity, never a substring. */
  const candidates = expectedAttemptId === null || expectedAttemptId === undefined
    ? identifiable
    : identifiable.filter((artifact) => attemptIdentityEquals(artifact.attemptId, expectedAttemptId));

  if (candidates.length === 0) {
    return Object.freeze({
      ...discoveryOutcome('NO_CANDIDATE'),
      home: dshHomePath, sessionId, expectedAttemptId,
      artifactsSeen: found.length, identifiableSeen: identifiable.length,
      /** §4: the near misses are REPORTED, so a collision is visible rather than silently refused. */
      nearMisses: Object.freeze(identifiable.filter((artifact) => !attemptIdentityEquals(artifact.attemptId, expectedAttemptId)).map((artifact) => artifact.attemptId)),
      candidates: Object.freeze([]), selected: null,
    });
  }
  if (candidates.length > 1) {
    /** §4: ambiguity is REFUSED rather than resolved by recency. */
    return Object.freeze({
      ...discoveryOutcome('AMBIGUOUS_CANDIDATES'),
      home: dshHomePath, sessionId, expectedAttemptId,
      artifactsSeen: found.length, identifiableSeen: identifiable.length,
      candidates: Object.freeze(candidates.map((artifact) => artifact.path)),
      selected: null,
      selectedLatestByMtime: false,
    });
  }
  const selected = candidates[0];
  return Object.freeze({
    ...discoveryOutcome('DISCOVERED_UNIQUE'),
    home: dshHomePath, sessionId, expectedAttemptId,
    artifactsSeen: found.length, identifiableSeen: identifiable.length,
    candidates: Object.freeze([selected.path]),
    selected: Object.freeze({ path: selected.path, attemptId: selected.attemptId, bytes: selected.bytes, digest: null }),
    /** §4: the discovery is by EXACT identity, so no recency rule was applied. */
    selectedLatestByMtime: false,
    law: 'the scheduled attempt\'s artifact is discovered by EXACT normalized attempt identity under the session-scoped DSH home; zero candidates is absent, ambiguity is refused, and no artifact is selected by recency',
  });
}

/**
 * §4: CORROBORATE AN EXECUTION WITNESS.
 *
 * §4: "LIVE_PRIMARY must require an independently corroborated execution witness." The witness must establish the
 * scheduled run/session, the observed Worker/Attempt/HostJob relationship, the execution route and real worker
 * process, and the resulting uniquely attributed artifact.
 *
 * This function does NOT invent such a witness and does NOT accept a declaration as one. Given a witness record it
 * checks that every required part is present AND that the parts are OBSERVATIONS rather than declarations: the
 * route and mode strings are explicitly NOT sufficient. With no witness, the verdict is `NOT_ESTABLISHED`.
 */
export function corroborateExecutionWitness(input) {
  const { witness = null, scheduledRunId = null, scheduledSessionId = null, expectedAttemptId = null, discovery = null, artifactDigestVerified = false } = input;
  const missing = [];
  if (witness === null || witness === undefined) {
    return Object.freeze({
      schemaVersion: 1,
      kind: 'execution witness corroboration',
      corroborated: false,
      verdict: 'NOT_ESTABLISHED',
      missing: Object.freeze([...EXECUTION_WITNESS.required]),
      reason: 'no execution witness was supplied, and this stage does not manufacture one: producing an authentic current-run witness requires a PRIMARY launch, which §0 forbids',
      declarationsAcceptedAsObservations: false,
      routeStringAloneSufficient: false,
      sidecarModeAloneSufficient: false,
    });
  }
  /** §4: the scheduled run and session, from the witness's OWN observed values. */
  if (typeof witness.runId !== 'string' || witness.runId === '' || (scheduledRunId !== null && witness.runId !== scheduledRunId)) missing.push('scheduledRunAndSession');
  if (typeof witness.sessionId !== 'string' || witness.sessionId === '' || (scheduledSessionId !== null && witness.sessionId !== scheduledSessionId)) missing.push('scheduledRunAndSession');
  /** §4: the observed worker/attempt/host-job relationship, all three present and consistent. */
  const hasWorker = typeof witness.workerProcessId === 'string' || typeof witness.workerProcessId === 'number';
  const hasAttempt = typeof witness.observedAttemptId === 'string' && witness.observedAttemptId !== '';
  const hasHostJob = typeof witness.observedHostJobId === 'string' && witness.observedHostJobId !== '';
  if (!(hasWorker && hasAttempt && hasHostJob)) missing.push('observedWorkerAttemptHostJobRelationship');
  /** §4: the observed attempt must be the scheduled one, by EXACT normalized identity. */
  if (hasAttempt && expectedAttemptId !== null && !attemptIdentityEquals(witness.observedAttemptId, expectedAttemptId)) missing.push('observedWorkerAttemptHostJobRelationship');
  /** §4: the route and the real worker process are OBSERVED, not declared. */
  if (typeof witness.observedRouteId !== 'string' || witness.observedRouteId === '') missing.push('executionRouteAndRealWorkerProcess');
  if (witness.routeDeclaredOnly === true || witness.modeDeclaredOnly === true) missing.push('executionRouteAndRealWorkerProcess');
  /** §4: the uniquely attributed artifact, digest-verified. */
  if (discovery === null || discovery?.discovered !== true) missing.push('uniquelyAttributedArtifact');
  if (artifactDigestVerified !== true) missing.push('uniquelyAttributedArtifact');

  const unique = [...new Set(missing)];
  const corroborated = unique.length === 0;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'execution witness corroboration',
    corroborated,
    verdict: corroborated ? BRIDGE_PROVENANCE.LIVE_PRIMARY : 'NOT_ESTABLISHED',
    required: EXECUTION_WITNESS.required,
    missing: Object.freeze(unique),
    observedAttemptId: hasAttempt ? witness.observedAttemptId : null,
    expectedAttemptId,
    observedRouteId: witness.observedRouteId ?? null,
    /** §4: the declarations are carried, and explicitly do NOT count. */
    declaredRoute: witness.declaredRoute ?? null,
    declaredMode: witness.declaredMode ?? null,
    declarationsAcceptedAsObservations: false,
    routeStringAloneSufficient: false,
    sidecarModeAloneSufficient: false,
    reason: corroborated
      ? 'an execution witness independently corroborates the scheduled run, the observed worker/attempt/host-job relationship, the observed route and real worker process, and the uniquely attributed artifact'
      : `the execution witness does not corroborate [${unique.join(', ')}]`,
    law: EXECUTION_WITNESS.law,
  });
}

export { NL };
