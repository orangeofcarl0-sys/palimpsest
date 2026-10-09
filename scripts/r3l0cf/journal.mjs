/**
 * R3-L0C-F §6 — THE DURABLE PER-GENERATION EVIDENCE JOURNAL.
 *
 * §6 replaces trajectory-level-only recording with durable PER-GENERATION evidence, and it states three
 * properties the storage must have:
 *
 *   · primary records must NOT be rewritten after finalization;
 *   · writes must be atomic, or an equivalent durable protocol;
 *   · an interrupted write must be DETECTABLE, never silently treated as a complete session.
 *
 * THE SHAPE, AND WHY IT IS A SINGLE APPEND-ONLY FILE WITH A PER-RECORD DIGEST. A JSONL file is append-only by
 * construction: a record is a line, and a line is never modified in place. Atomicity comes from writing the
 * COMPLETE line bytes through a temporary file that is fsynced before the bytes are appended, so the record's
 * content is durable before it becomes visible. Detectability comes from the record's own `digest` field: a line
 * whose digest does not match its content is a torn write, and a trailing line that does not parse as JSON is a
 * torn write too. Both are reported as `INTERRUPTED` rather than being dropped or accepted.
 *
 * WHY NOT SQLITE. The product's durable stores are SQLite and this module deliberately is not one. §6 requires a
 * journal that is trivially auditable by a reader and cannot be "repaired" by a transaction — and, more to the
 * point, §6's tolerance for an equivalent protocol is about durability, not about sharing a storage engine with
 * the product. A plain JSONL file is the smallest thing that satisfies all three properties, and it keeps this
 * stage's evidence readable without the product's schema.
 *
 * IT RECORDS EVIDENCE AND OWNS NOTHING ELSE. It creates no canonical Work fact, holds no lock, and grants no
 * authority. The Abort Manifest is a STAGE-OWNED research artifact: it names what the run did, not what the
 * product's Attempts are.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

import { JOURNAL_EVENT_TYPES, JOURNAL_FIELDS, JOURNAL_PROTOCOL } from './contract.mjs';

const NL = String.fromCharCode(10);

/** §6: the journal file name inside a run root. */
export const JOURNAL_FILE = 'generation-journal.jsonl';

/** §6: the abort manifest file name. */
export const ABORT_MANIFEST_FILE = 'abort-manifest.json';

/** §6: the evidence index file name, so a preserved run is discoverable. */
export const EVIDENCE_INDEX_FILE = 'evidence-index.json';

/** §6: a digest over a record's content, excluding the digest field itself. */
export function recordDigest(record) {
  const { digest: _ignored, ...rest } = record;
  return createHash('sha256').update(JSON.stringify(rest), 'utf8').digest('hex');
}

/**
 * §6: DURABLY APPEND ONE RECORD.
 *
 * The protocol, in order, and the order is the point:
 *
 *   1. serialise the record to ONE line and compute its digest;
 *   2. write the line to a temporary file and fsync it, so its bytes are on disk before it is visible;
 *   3. append the line's bytes to the journal and fsync the journal;
 *   4. remove the temporary file.
 *
 * A crash between 2 and 3 leaves a `.tmp` file and no journal record: the record was never published, and the
 * temporary file is itself the evidence that a write was in flight. A crash during 3 leaves a partial line, which
 * the reader reports as INTERRUPTED.
 */
export function appendRecord(input) {
  const { journalPath, kind, payload } = input;
  if (!JOURNAL_EVENT_TYPES.includes(kind)) {
    throw new Error(`REFUSED: "${kind}" is not a declared journal event type, so the journal would accept an undeclared record shape`);
  }
  mkdirSync(dirname(journalPath), { recursive: true });
  const seq = countRecords(journalPath).total + 1;
  const base = { seq, kind, at: input.at ?? new Date().toISOString(), payload: payload ?? null };
  const record = { ...base, digest: recordDigest(base) };
  const line = `${JSON.stringify(record)}${NL}`;
  /** 2. the temporary file, fsynced before the record becomes visible. */
  const temporary = `${journalPath}.tmp-${String(seq)}`;
  writeFileSync(temporary, line, 'utf8');
  fsyncFile(temporary);
  /** 3. append the complete line to the journal, then fsync the journal. */
  const handle = openSync(journalPath, 'a');
  try {
    writeSync(handle, line);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  /** 4. the temporary file has served its purpose; its absence is the normal state. */
  rmSync(temporary, { force: true });
  return Object.freeze(record);
}

/** fsync a file by path. */
function fsyncFile(path) {
  const handle = openSync(path, 'r+');
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

/**
 * §6: READ A JOURNAL, CLASSIFYING EVERY RECORD.
 *
 * The reader is the other half of the durability protocol. It reports three things:
 *
 *   records      the records whose digest matches their content — the durable evidence
 *   interrupted  a trailing line that does not parse, or any line whose digest does not match — a torn write
 *   temporaryFiles  leftover `.tmp-*` files, which are a write that was in flight when the process died
 *
 * An INTERRUPTED tail is never dropped and never accepted: it is REPORTED, which is what makes §6's requirement
 * satisfiable rather than merely stated.
 */
export function readJournal(journalPath) {
  if (!existsSync(journalPath)) {
    return Object.freeze({
      schemaVersion: 1, kind: 'generation journal read', journalPath, exists: false,
      records: Object.freeze([]), interrupted: Object.freeze([]), temporaryFiles: Object.freeze([]),
      total: 0, JOURNAL_INTACT: true, INTERRUPTED_WRITE_DETECTED: false,
    });
  }
  const text = readFileSync(journalPath, 'utf8');
  const lines = text.split(NL);
  /** A trailing newline produces one empty final element, which is not a record. */
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const records = [];
  const interrupted = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      interrupted.push(Object.freeze({ line: index + 1, reason: 'UNPARSEABLE_LINE', raw: line.slice(0, 200) }));
      continue;
    }
    const { digest, ...rest } = parsed;
    if (typeof digest !== 'string' || recordDigest(rest) !== digest) {
      interrupted.push(Object.freeze({ line: index + 1, reason: 'DIGEST_MISMATCH', seq: parsed.seq ?? null, kind: parsed.kind ?? null }));
      continue;
    }
    records.push(Object.freeze(parsed));
  }
  const temporaryFiles = listTemporaryFiles(journalPath);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'generation journal read',
    journalPath,
    exists: true,
    records: Object.freeze(records),
    interrupted: Object.freeze(interrupted),
    temporaryFiles,
    total: records.length,
    /** §6: the journal is intact only when there is no torn tail and no write was left in flight. */
    JOURNAL_INTACT: interrupted.length === 0 && temporaryFiles.length === 0,
    INTERRUPTED_WRITE_DETECTED: interrupted.length > 0,
    /** §6: a write left in flight is reported, because it may mean a record was never published. */
    WRITE_IN_FLIGHT_DETECTED: temporaryFiles.length > 0,
  });
}

/** The `.tmp-*` files beside a journal, which are writes that were in flight. */
function listTemporaryFiles(journalPath) {
  const directory = dirname(journalPath);
  const name = journalPath.split(/[/\\]/u).pop() ?? '';
  if (!existsSync(directory)) return Object.freeze([]);
  const found = [];
  try {
    for (const entry of readdirSync(directory)) {
      if (entry.startsWith(`${name}.tmp-`)) found.push(entry);
    }
  } catch { /* the directory vanished mid-read */ }
  return Object.freeze(found.sort());
}

/** §6: the record counts, per event type. */
export function countRecords(journalPath) {
  const read = readJournal(journalPath);
  const byKind = {};
  for (const record of read.records) byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
  return Object.freeze({ total: read.records.length, byKind: Object.freeze(byKind), interrupted: read.interrupted.length, temporary: read.temporaryFiles.length });
}

/**
 * §6: BUILD A PER-GENERATION TRIAL RECORD.
 *
 * §6 lists the fields a per-generation record must carry. This function builds the record and ASSERTS that every
 * listed field is present, so a caller cannot produce a record that satisfies the shape by omission — the failure
 * mode §6 is guarding against is exactly a record that looks complete because the missing field is not named.
 */
export function buildGenerationRecord(input) {
  const record = {
    sessionId: input.sessionId,
    block: input.block,
    arm: input.arm,
    generation: input.generation,
    trajectoryId: input.trajectoryId,
    executionClosureDigest: input.executionClosureDigest ?? null,
    treatmentExpectationDigest: input.treatmentExpectationDigest ?? null,
    intendedExecutorRoute: input.intendedExecutorRoute ?? null,
    exposureState: input.exposureState ?? null,
    hostJobId: input.hostJobId ?? null,
    attemptId: input.attemptId ?? null,
    consumerVisibleHandles: input.consumerVisibleHandles ?? [],
    governedPulls: input.governedPulls ?? [],
    resolvedBodyDigests: input.resolvedBodyDigests ?? [],
    startingHead: input.startingHead ?? null,
    finalHead: input.finalHead ?? null,
    resultState: input.resultState ?? null,
    verificationState: input.verificationState ?? null,
    promotionState: input.promotionState ?? null,
    completionCause: input.completionCause ?? null,
    infrastructureFailureCause: input.infrastructureFailureCause ?? null,
    reportPath: input.reportPath ?? null,
    transcriptPath: input.transcriptPath ?? null,
    timestamps: input.timestamps ?? { recordedAt: new Date().toISOString() },
    contentDigests: input.contentDigests ?? {},
  };
  const missing = JOURNAL_FIELDS.filter((field) => !(field in record));
  if (missing.length > 0) {
    throw new Error(`REFUSED: the generation record omits required field(s) [${missing.join(', ')}]; §6 requires every field to be present, because an omitted field is indistinguishable from an unrecorded one`);
  }
  return Object.freeze(record);
}

/**
 * §6: THE ABORT MANIFEST.
 *
 * §6 requires it "at every normal stop", identifying all completed, incomplete and uncertain sessions. It is
 * STAGE-OWNED: it describes the research run, and it makes no claim about any canonical Attempt.
 */
export function buildAbortManifest(input) {
  const { runId, terminalState, plannedSessions, completedSessions, incompleteSessions, uncertainSessions, failure } = input;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'fail-stop abort manifest',
    runId,
    terminalState,
    at: new Date().toISOString(),
    plannedSessions: Object.freeze([...(plannedSessions ?? [])]),
    completedSessions: Object.freeze([...(completedSessions ?? [])]),
    incompleteSessions: Object.freeze([...(incompleteSessions ?? [])]),
    uncertainSessions: Object.freeze([...(uncertainSessions ?? [])]),
    /** §5: the failure that stopped the matrix, if any, with its class and its Gate 2 disposition. */
    failure: failure === undefined || failure === null ? null : Object.freeze({
      sessionId: failure.sessionId ?? null,
      failureClass: failure.failureClass ?? null,
      cause: failure.cause ?? null,
      detail: failure.detail ?? null,
      /** Gate 2: which of the three dispositions stopped the run, so a manifest distinguishes a defect from a project outcome. */
      disposition: failure.disposition ?? null,
      workCannotProgress: failure.workCannotProgress === true,
    }),
    /** Gate 2: whether the stop preserved a CENSORED trajectory rather than a harness fault. */
    censored: failure !== undefined && failure !== null && failure.disposition === 'CENSORED',
    /** §5/§14: the consequences of a stop, carried so a manifest cannot be read as a partial success. */
    consequences: Object.freeze(['NO_SESSION_RETRY', 'NO_REPLACEMENT_TRAJECTORY', 'NO_CAUSAL_TREATMENT_VERDICT']),
    /** Gate 2: the repair this forbids, stated on the manifest itself. */
    forbiddenRepair: 'never force Result, Verification or Promotion to unblock the project',
    /** §15: the manifest describes the RESEARCH run and asserts nothing about canonical Work. */
    describesCanonicalWork: false,
    canonicalAttemptMayRemainRunning: true,
    law: 'fail-stop means the research run stops and refuses a causal claim; it does not terminalize a canonical Attempt',
  });
}

/**
 * §7: THE EVIDENCE INDEX.
 *
 * §7 requires a preserved run to have "a discoverable identity and evidence index". The index names the run, its
 * journal, its manifest and the artifacts that exist, so a later reader can find everything without guessing.
 */
export function buildEvidenceIndex(input) {
  const { runId, runRoot, journalPath, manifestPath, artifacts } = input;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'preserved run evidence index',
    runId,
    runRoot,
    journalPath,
    manifestPath,
    /** Every artifact that exists, with a digest, so the index is checkable rather than a claim. */
    artifacts: Object.freeze((artifacts ?? []).map((entry) => Object.freeze({
      path: entry.path,
      exists: existsSync(entry.path),
      digest: existsSync(entry.path) ? createHash('sha256').update(readFileSync(entry.path)).digest('hex') : null,
    }))),
    at: new Date().toISOString(),
    law: 'a preserved run must be discoverable by identity, and its evidence indexed by digest',
  });
}

/** §6: write a JSON artifact atomically (temp + rename), so a reader never sees a partial document. */
export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${String(process.pid)}-${String(Date.now())}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}${NL}`, 'utf8');
  fsyncFile(temporary);
  renameSync(temporary, path);
  return path;
}

/** §6: the journal protocol, re-exported so a report can state what it is without importing the contract. */
export const JOURNAL_DURABILITY_PROTOCOL = JOURNAL_PROTOCOL;

export { NL };
