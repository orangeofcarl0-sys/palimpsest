/**
 * R3-L0C §2.1 — THE EXPLICIT EVIDENCE MODE.
 *
 * R3-L0B §14 repaired a real defect — a test was rewriting committed historical evidence — by moving the live
 * record to a scratch path. The repair worked, but it left a SILENT AMBIGUITY: GATE R read
 * `scratch ?? committed`, so a reader could not tell whether a green result came from a fresh run or from a
 * frozen artifact recorded months earlier. Both are legitimate, and they mean different things.
 *
 * §2.1 removes the ambiguity by making the choice EXPLICIT and the OUTPUT AUDITABLE:
 *
 *   LIVE        the evidence must come from a FRESH record produced by THIS run. If it is absent, the gate
 *               FAILS. A LIVE gate never silently degrades to a frozen artifact, because "the thing I just
 *               measured" and "a thing somebody measured before" are not the same claim.
 *
 *   HISTORICAL  the evidence may come from the COMMITTED artifact. This is the correct mode for a gate that
 *               audits a past stage's record, and it is required to say so.
 *
 * EVERY gate output carries three fields, whatever the mode:
 *
 *   evidenceSource  which artifact was read, by path
 *   evidenceDigest  the digest of the BYTES actually read
 *   freshness       FRESH_CURRENT_RUN when the artifact was produced by this run, FROZEN_COMMITTED when it was
 *                   read from the checkout, plus the run identity where one exists
 *
 * WHY THE DIGEST IS OF THE BYTES READ RATHER THAN OF THE PATH. A path can be overwritten between the read and
 * the report; a digest of the bytes is the only form that survives that. And a reader comparing two reports can
 * see immediately whether they audited the same artifact.
 *
 * NO PRODUCT SEMANTICS CHANGE. This module is test/harness infrastructure: it is not imported by `src/**` or
 * `host/**`, it registers nothing, and it creates no canonical owner.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './contract.mjs';

const NL = String.fromCharCode(10);

/** §2.1: the two modes. There is deliberately no third, implicit mode. */
export const EVIDENCE_MODES = Object.freeze({
  LIVE: 'LIVE',
  HISTORICAL: 'HISTORICAL',
});

/** §2.1: the freshness of the artifact a gate actually read. */
export const FRESHNESS = Object.freeze({
  FRESH_CURRENT_RUN: 'FRESH_CURRENT_RUN',
  FROZEN_COMMITTED: 'FROZEN_COMMITTED',
});

/** §2.1: how a caller asks for a mode. The environment variable makes the choice available to every gate. */
export const EVIDENCE_MODE_ENV = 'PALIMPSEST_EVIDENCE_MODE';

/**
 * §2.1: RESOLVE THE MODE EXPLICITLY.
 *
 * The default is `HISTORICAL`, because that is the safe default for an audit gate: a gate that cannot find
 * fresh evidence should not invent it, and a stage that wants LIVE says so. The mode is always RETURNED rather
 * than assumed, so a caller can report it.
 */
export function resolveEvidenceMode(explicit, environment = process.env) {
  const requested = explicit ?? environment[EVIDENCE_MODE_ENV];
  if (requested === undefined || requested === null || String(requested).trim() === '') {
    return Object.freeze({ mode: EVIDENCE_MODES.HISTORICAL, explicit: false, source: 'default', reason: 'no mode was requested, so the safe default applies: committed evidence may be validated' });
  }
  const normalized = String(requested).trim().toUpperCase();
  if (normalized !== EVIDENCE_MODES.LIVE && normalized !== EVIDENCE_MODES.HISTORICAL) {
    /**
     * An UNKNOWN mode is an error rather than a fallback. Silently treating a typo as HISTORICAL is exactly the
     * class of ambiguity §2.1 exists to remove.
     */
    return Object.freeze({ mode: null, explicit: true, source: 'environment', reason: `"${String(requested)}" is not a declared evidence mode; expected LIVE or HISTORICAL` });
  }
  return Object.freeze({ mode: normalized, explicit: true, source: 'environment', reason: `the caller requested ${normalized}` });
}

/** §2.1: the digest of a file's bytes, or null when it does not exist. */
export function digestOfFile(path) {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * §2.1: READ ONE EVIDENCE ARTIFACT UNDER AN EXPLICIT MODE.
 *
 * Returns a record that always carries `evidenceSource`, `evidenceDigest` and `freshness`, so a gate can attach
 * it to its own output without re-deriving anything. A LIVE read that finds no fresh record returns
 * `ok: false` with the reason — it never falls back.
 */
export function readEvidence(input) {
  const { livePath, committedPath, mode, label, runId } = input;
  if (mode === EVIDENCE_MODES.LIVE) {
    if (livePath === undefined || livePath === null) {
      return Object.freeze({ ok: false, mode, label, evidenceSource: null, evidenceDigest: null, freshness: null, reason: 'LIVE mode requires a fresh-record path, and none was supplied' });
    }
    if (!existsSync(livePath)) {
      return Object.freeze({
        ok: false, mode, label, evidenceSource: livePath, evidenceDigest: null, freshness: FRESHNESS.FRESH_CURRENT_RUN,
        reason: `LIVE mode requires a fresh record from THIS run, and ${livePath} does not exist. The gate refuses rather than falling back to committed evidence.`,
      });
    }
    const bytes = readFileSync(livePath, 'utf8');
    return Object.freeze({
      ok: true, mode, label, evidenceSource: livePath, evidenceDigest: createHash('sha256').update(bytes, 'utf8').digest('hex'),
      freshness: FRESHNESS.FRESH_CURRENT_RUN, runId: runId ?? null, bytes: bytes.length,
      value: parseJson(bytes, livePath),
    });
  }
  if (mode === EVIDENCE_MODES.HISTORICAL) {
    const source = existsSync(committedPath) ? committedPath : (livePath !== undefined && livePath !== null && existsSync(livePath) ? livePath : committedPath);
    if (!existsSync(source)) {
      return Object.freeze({ ok: false, mode, label, evidenceSource: source, evidenceDigest: null, freshness: FRESHNESS.FROZEN_COMMITTED, reason: `HISTORICAL mode found no committed record at ${source}` });
    }
    const bytes = readFileSync(source, 'utf8');
    const isCommitted = source === committedPath;
    return Object.freeze({
      ok: true, mode, label, evidenceSource: source, evidenceDigest: createHash('sha256').update(bytes, 'utf8').digest('hex'),
      /** The freshness names WHERE it came from, which is the fact a reader needs. */
      freshness: isCommitted ? FRESHNESS.FROZEN_COMMITTED : FRESHNESS.FRESH_CURRENT_RUN, runId: runId ?? null, bytes: bytes.length,
      value: parseJson(bytes, source),
    });
  }
  return Object.freeze({ ok: false, mode: null, label, evidenceSource: null, evidenceDigest: null, freshness: null, reason: 'the evidence mode was not resolved, so no artifact may be read' });
}

function parseJson(bytes, path) {
  try { return JSON.parse(bytes); } catch { return Object.freeze({ parseError: `the record at ${path} is not JSON` }); }
}

/* ================================================================ the run identity */

/**
 * §2.1: THE RUN IDENTITY.
 *
 * A run identity is what lets a report say "these numbers came from run X". It is derived from the run's own
 * scratch root rather than invented, so two gates in the same run agree without coordination.
 */
export function runIdentity(scratchRoot) {
  const stamp = new Date().toISOString();
  const material = `${stamp}${NL}${scratchRoot ?? ''}${NL}${process.pid}`;
  return Object.freeze({
    runId: `run-${stamp.replace(/[:.]/gu, '-')}-${createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 8)}`,
    startedAt: stamp,
    pid: process.pid,
    scratchRoot: scratchRoot ?? null,
  });
}

/**
 * §2.1: WRITE A LIVE RECORD, creating its directory.
 *
 * The writer exists so a producer (a test suite, a gate) publishes to the SAME location a LIVE consumer reads,
 * rather than each side spelling the path itself.
 */
export function writeLiveRecord(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}${NL}`, 'utf8');
  return Object.freeze({ path, digest: createHash('sha256').update(readFileSync(path)).digest('hex') });
}

/** §2.1: the evidence fields a gate must attach to its own output, from one or more reads. */
export function evidenceProvenance(reads) {
  const list = Array.isArray(reads) ? reads : [reads];
  return Object.freeze(list.map((read) => Object.freeze({
    label: read.label,
    mode: read.mode,
    evidenceSource: read.evidenceSource,
    evidenceDigest: read.evidenceDigest,
    freshness: read.freshness,
    runId: read.runId ?? null,
    ok: read.ok === true,
    reason: read.reason ?? null,
  })));
}

/** §2.1: the standard LIVE scratch location for a named producer, under a run-owned root. */
export function liveRecordPath(scratchRoot, producer, name) {
  return join(scratchRoot, producer, name);
}

/** §2.1: the committed evidence path for a stage. */
export function committedEvidencePath(stage, name) {
  return join(REPO_ROOT, 'research-evidence', stage, name);
}

export { REPO_ROOT };
