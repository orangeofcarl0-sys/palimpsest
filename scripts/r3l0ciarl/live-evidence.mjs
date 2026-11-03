/**
 * R3-L0C-I-A-R-L §1 — THE LIVE-EVIDENCE SIDECAR AND ITS DURABLE BINDING.
 *
 * THE DEFECT THIS CLOSES, measured in L1. The frozen journal's record builder has a fixed field set
 * (`JOURNAL_FIELDS`), and it carries neither `sessionArtifactPath` nor `hiddenInvariantVector`. The adapter
 * produces both on its outcome, but the Fail-Stop runner passes neither into `buildGenerationRecord`, so the
 * durable `TRIAL_RECORDED` record cannot answer "which artifact did this session produce, and what hidden vector
 * did it yield".
 *
 * THE REPAIR IS THE NARROWEST MECHANISM THAT WORKS, and the choice is deliberate rather than convenient.
 * `JOURNAL_FIELDS` is frozen and may not be edited. But it ALREADY carries `contentDigests`, a field that accepts
 * arbitrary keys — and the runner passes it straight through:
 *
 *     fail-stop.mjs:525   contentDigests: outcome?.contentDigests ?? {}
 *
 * So the live evidence travels in a STAGE-OWNED SIDECAR under the run root, and the sidecar's DIGEST is bound into
 * the durable record through `contentDigests`. That gives the chain §1 asks for, and it is checkable rather than
 * asserted:
 *
 *     the durable journal binds the sidecar by digest
 *     the sidecar carries the artifact identity, the hidden vector and the cost provenance
 *     a reader that recomputes the digest proves the evidence was not substituted after the fact
 *
 * WHY A DIGEST AND NOT THE VALUES INLINE. The journal is append-only and hash-chained; putting a large hidden
 * vector inline would change what the frozen record means and bloat every record. The digest binds the bytes
 * without changing the record's shape, and a mismatch is detectable — which is the property that matters.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { LIVE_EVIDENCE, NL } from './contract.mjs';

/** §1: the sidecar's own schema version. */
export const LIVE_EVIDENCE_SCHEMA = 1;

/**
 * §1: WRITE ONE SESSION'S LIVE-EVIDENCE SIDECAR, AND RETURN ITS DIGEST.
 *
 * The sidecar carries every field §1 names. A field that is genuinely absent is written as `null` rather than
 * omitted, so a reader can distinguish "not measured" from "not recorded" — the distinction the frozen journal's
 * field-set check makes for its own fields.
 */
export function writeLiveEvidence(input) {
  const { runRoot, sessionId, sessionArtifactPath, hiddenInvariantVector, attemptId, hostJobId, costProvenance, mode, extra = {} } = input;
  const directory = join(runRoot, LIVE_EVIDENCE.directory);
  mkdirSync(directory, { recursive: true });
  const sidecar = Object.freeze({
    schemaVersion: LIVE_EVIDENCE_SCHEMA,
    kind: 'r3l0ciarl live evidence',
    sessionId: sessionId ?? null,
    sessionArtifactPath: sessionArtifactPath ?? null,
    sessionArtifactDigest: sessionArtifactPath === null || sessionArtifactPath === undefined || !existsSync(sessionArtifactPath)
      ? null
      : createHash('sha256').update(readFileSync(sessionArtifactPath)).digest('hex'),
    hiddenInvariantVector: hiddenInvariantVector ?? null,
    attemptId: attemptId ?? null,
    hostJobId: hostJobId ?? null,
    costProvenance: costProvenance ?? null,
    mode: mode ?? null,
    ...extra,
  });
  const path = join(directory, `${sessionId}.json`);
  const text = `${JSON.stringify(sidecar, null, 2)}${NL}`;
  writeFileSync(path, text, 'utf8');
  return Object.freeze({
    path,
    sidecar,
    digest: createHash('sha256').update(text, 'utf8').digest('hex'),
    /** §1: the field set §1 requires, each checked rather than assumed. */
    missingFields: LIVE_EVIDENCE.requiredFields.filter((field) => !(field in sidecar)),
  });
}

/**
 * §1: READ ONE SESSION'S SIDECAR BACK AND VERIFY IT AGAINST THE DURABLE BINDING.
 *
 * This is the readback half. Given the record's `contentDigests` binding and the run root, it recomputes the
 * sidecar's digest and reports whether the bytes still match — so a substitution after the record was written is
 * DETECTED rather than trusted.
 */
export function readLiveEvidence(input) {
  const { runRoot, sessionId, binding } = input;
  const path = join(runRoot, LIVE_EVIDENCE.directory, `${sessionId}.json`);
  if (!existsSync(path)) {
    return Object.freeze({ found: false, sessionId, path, sidecar: null, digest: null, matchesBinding: false, reason: 'NO_SIDECAR' });
  }
  const text = readFileSync(path, 'utf8');
  const digest = createHash('sha256').update(text, 'utf8').digest('hex');
  let sidecar = null;
  try { sidecar = JSON.parse(text); } catch { return Object.freeze({ found: true, sessionId, path, sidecar: null, digest, matchesBinding: false, reason: 'SIDECAR_UNPARSEABLE' }); }
  const bound = binding === null || binding === undefined ? null : binding;
  return Object.freeze({
    found: true,
    sessionId,
    path,
    sidecar,
    digest,
    boundDigest: bound,
    matchesBinding: typeof bound === 'string' && bound === digest,
    reason: typeof bound !== 'string' ? 'NO_BINDING_IN_RECORD' : bound === digest ? null : 'DIGEST_MISMATCH',
  });
}

/**
 * §1: THE BINDING, AS IT IS PLACED ON THE OUTCOME.
 *
 * The pipeline merges this into the outcome's `contentDigests`, which the frozen runner passes straight into the
 * durable record. Returning the key and value together keeps the two from drifting.
 */
export function liveEvidenceBinding(digest) {
  return Object.freeze({ [LIVE_EVIDENCE.bindingKey]: digest });
}

/** §1: the binding recovered from a durable record, or null. */
export function bindingOf(record) {
  const digests = record?.contentDigests ?? null;
  if (digests === null || typeof digests !== 'object') return null;
  const value = digests[LIVE_EVIDENCE.bindingKey];
  return typeof value === 'string' ? value : null;
}

/**
 * §1: VERIFY EVERY SESSION'S LIVE EVIDENCE AGAINST THE DURABLE JOURNAL.
 *
 * The readback §1 asks for: for each `TRIAL_RECORDED` record, does a sidecar exist, does it carry the required
 * fields, and does its digest still match the binding the record carries? A session with no sidecar, a missing
 * field or a digest mismatch is REPORTED rather than skipped.
 */
export function verifyLiveEvidenceContinuity(input) {
  const { runRoot, records } = input;
  const perSession = [];
  for (const record of records) {
    const binding = bindingOf(record);
    const read = readLiveEvidence({ runRoot, sessionId: record.sessionId, binding });
    const carriedFields = read.sidecar === null ? [] : LIVE_EVIDENCE.requiredFields.filter((field) => field in read.sidecar);
    const nullFields = read.sidecar === null ? [] : LIVE_EVIDENCE.requiredFields.filter((field) => read.sidecar[field] === null);
    perSession.push(Object.freeze({
      sessionId: record.sessionId,
      bound: binding !== null,
      sidecarFound: read.found,
      matchesBinding: read.matchesBinding,
      carriedFields: Object.freeze(carriedFields),
      nullFields: Object.freeze(nullFields),
      artifactPath: read.sidecar?.sessionArtifactPath ?? null,
      hiddenVectorPresent: read.sidecar?.hiddenInvariantVector !== null && read.sidecar?.hiddenInvariantVector !== undefined,
      attemptId: read.sidecar?.attemptId ?? null,
      hostJobId: read.sidecar?.hostJobId ?? null,
      costProvenance: read.sidecar?.costProvenance ?? null,
      reason: read.reason,
    }));
  }
  const allBound = perSession.every((entry) => entry.bound === true);
  const allMatched = perSession.every((entry) => entry.matchesBinding === true);
  const allComplete = perSession.every((entry) => entry.carriedFields.length === LIVE_EVIDENCE.requiredFields.length);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L',
    kind: 'live evidence continuity',
    sessions: perSession.length,
    perSession: Object.freeze(perSession),
    allBound,
    allMatched,
    allComplete,
    /** §1: the property. Every session's live evidence survived, intact, into the durable record. */
    LIVE_ARTIFACT_PROPAGATION: allBound && allMatched && allComplete && perSession.length > 0 ? 'PASS' : 'FAIL',
    law: LIVE_EVIDENCE.law,
  });
}

/** §1: the sidecar paths under a run root, so a reader can enumerate what was written. */
export function listLiveEvidence(runRoot) {
  const directory = join(runRoot, LIVE_EVIDENCE.directory);
  if (!existsSync(directory)) return Object.freeze([]);
  return Object.freeze(readdirSync(directory).filter((name) => name.endsWith('.json')).sort());
}

export { NL };
