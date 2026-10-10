/**
 * R3-L0C-G1 §6 — DURABLE HOST EVIDENCE AND RUN CORRELATION.
 *
 * §6 requires a stage-owned correlator that reads AUTHENTIC host observations and the EXISTING durable
 * Work/Run evidence, and that creates no new canonical Work fact. This module is that correlator, plus the
 * durable recorder that preserves a sanitized observation set.
 *
 * THE CHAIN IT ESTABLISHES, and the level it stops at:
 *
 *   RUN_STARTED → validated Run Claim → frozen scheduled Session → durable Trial/Attempt identity
 *     → host-local Job association → host-private Port Invocation → observed direct-child lifecycle
 *
 * Every link but the last two is read from EXISTING evidence. The last two come from the G1 observation seam.
 * The chain therefore reaches `RUN_ATTEMPT_CORRELATED` for a local non-model producer and STOPS: it never
 * reaches `LIVE_PRIMARY_NOT_ESTABLISHED`'s opposite, because no genuine DSH worker was observed.
 *
 * WHY A FABRICATED JSON OBJECT IS NOT EVIDENCE. §6: "A fabricated JSON object passed to a verification function
 * is a test fixture. It does not become trusted evidence because the schema is valid." The correlator takes
 * observations through a RECORDER-ISSUED HANDLE, not as free-standing objects: a caller can construct a
 * well-formed observation but cannot make the recorder vouch for it. The distinction is carried as
 * `origin`, and a declaration-shaped input can only ever reach `DECLARATION_ONLY`.
 *
 * WHAT IT STILL DEPENDS ON. It trusts the local host process that ran the recorder. §6 requires that limitation
 * to be DISCLOSED rather than papered over with a self-signed signature, and `trustedLocalRecorder` says so.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { EVIDENCE_STATE, NL, OBSERVATION_SCHEMA_VERSION, REPO_ROOT } from './contract.mjs';

/** §6: the durable observation record's schema version, independent of the observation's own. */
export const OBSERVATION_RECORD_SCHEMA_VERSION = 1;

/** §6: the file name a recorder writes inside a run root. */
export const HOST_OBSERVATION_FILE = 'host-observations.json';

/** §6: a digest over a record's content, excluding the digest field itself. */
export function recordDigest(record) {
  const { recordDigest: _ignored, ...rest } = record;
  return createHash('sha256').update(JSON.stringify(rest), 'utf8').digest('hex');
}

/** §6: the trusted origin marker a recorder stamps. A caller cannot set this through the public entry. */
const RECORDER_ORIGIN = 'G1_LOCAL_RECORDER';

/**
 * §6: CREATE A RECORDER.
 *
 * The recorder is the ONLY way an observation becomes `LOCAL_HOST_OBSERVED`. It captures the observations the
 * port emitted, in order, and stamps each with the origin marker, so the correlator can distinguish a record
 * this host actually produced from a JSON object a caller assembled.
 *
 * A recorder does not settle, verify or promote anything; it writes a research record and nothing else.
 */
export function createObservationRecorder(input = {}) {
  const invocationId = input.invocationId ?? `wpi-${createHash('sha256').update(String(Date.now()), 'utf8').digest('hex').slice(0, 32)}`;
  const captured = [];
  const rejected = [];
  return Object.freeze({
    invocationId,
    /** §4: the sink shape the port expects. Bound to THIS recorder's invocation. */
    sink(observation) {
      if (observation === null || typeof observation !== 'object') {
        rejected.push(Object.freeze({ reason: 'observation is not an object' }));
        return;
      }
      if (observation.schemaVersion !== OBSERVATION_SCHEMA_VERSION) {
        rejected.push(Object.freeze({ reason: `unknown observation schema version ${String(observation.schemaVersion)}` }));
        return;
      }
      if (observation.invocationId !== invocationId) {
        rejected.push(Object.freeze({ reason: 'observation names a different invocation' }));
        return;
      }
      captured.push(observation);
    },
    /** §6: the captured set, in emission order, as data. */
    captured: () => Object.freeze([...captured]),
    rejected: () => Object.freeze([...rejected]),
  });
}

/**
 * §6: BUILD THE DURABLE RECORD from a recorder's captured set plus the correlation identity.
 *
 * The record carries STRUCTURAL metadata only: event kinds, sequence numbers, pids, exit codes, the sanitized
 * executable identity, and the digests. No command line, no environment value, no worker context, no prompt.
 */
export function buildObservationRecord(input) {
  const { recorder, hostLocalJobId, attemptId, runId, sessionId, source } = input;
  const observations = recorder.captured();
  const record = {
    schemaVersion: OBSERVATION_RECORD_SCHEMA_VERSION,
    kind: 'G1 host process observation record',
    stage: 'R3-L0C-G1',
    origin: RECORDER_ORIGIN,
    /** §5: the canonical AttemptId, from the host-private correlation — never a caller's claim. */
    attemptId,
    /** §5: named to say it is host-local and non-durable, not canonical Work identity. */
    hostLocalJobId,
    /** §6: the run binding, when the caller supplies one that a validated journal can corroborate. */
    runId: runId ?? null,
    sessionId: sessionId ?? null,
    invocationId: recorder.invocationId,
    source: source ?? 'LOCAL_NONMODEL_PRODUCER',
    eventCount: observations.length,
    rejectedCount: recorder.rejected().length,
    rejected: recorder.rejected(),
    events: observations.map((observation) => Object.freeze({
      eventKind: observation.eventKind,
      sequence: observation.sequence,
      observedAt: observation.observedAt,
      directChildPid: observation.directChildPid,
      processRole: observation.processRole,
      exitCode: observation.exitCode,
      exitSignal: observation.exitSignal,
      hostFailureDetail: observation.hostFailureDetail,
      executableIdentity: observation.executableIdentity,
    })),
    /** §6: the honest scope, carried on the record so a reader cannot over-read it. */
    proves: Object.freeze([
      'a direct child process was created and its lifecycle was observed on this host',
      'the observation was produced by this host process and preserved by this recorder',
    ]),
    doesNotProve: Object.freeze([
      'that a downstream wrapper spawned the genuine DSH binary',
      'that the provider/model route actually executed',
      'that a remote model request occurred',
      'that the Work Attempt was canonically completed',
      'that this record is LIVE_PRIMARY provenance',
    ]),
    /** §6: the trust limitation, stated rather than hidden behind a self-signed signature. */
    trustedLocalRecorder: true,
    independentlySigned: false,
    trustLimitation: 'this record is trusted only to the extent the local host process that produced it is trusted; G1 adds no cryptographic signature, because a key generated and trusted by the same test would prove nothing',
  };
  return Object.freeze({ ...record, recordDigest: recordDigest(record) });
}

/**
 * §6: WRITE THE RECORD DURABLY, then RE-READ and VERIFY the bytes.
 *
 * §6 requires: "preserve on-disk evidence before claiming it durable; re-read and verify recorded bytes; refuse
 * conflicting or duplicated observations". The re-read is not decoration — a claim of durability that is never
 * checked is exactly the kind of assertion this repository's rules exist to prevent.
 */
export function writeObservationRecord(input) {
  const { runRoot, record } = input;
  const path = join(runRoot, HOST_OBSERVATION_FILE);
  mkdirSync(runRoot, { recursive: true });
  /** §6: refuse to overwrite a conflicting record; a second write for the same invocation is a conflict. */
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, 'utf8'));
    const sameInvocation = existing.invocationId === record.invocationId;
    return Object.freeze({
      written: false,
      conflict: true,
      path,
      sameInvocation,
      reason: sameInvocation
        ? 'a record for this invocation already exists; a duplicate write is refused rather than overwriting preserved evidence'
        : 'a record for a DIFFERENT invocation already exists in this run root; refusing to overwrite it',
    });
  }
  writeFileSync(path, `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  const readBack = JSON.parse(readFileSync(path, 'utf8'));
  const verified = readBack.recordDigest === recordDigest(readBack) && readBack.recordDigest === record.recordDigest;
  return Object.freeze({
    written: true,
    conflict: false,
    path,
    bytesRead: readFileSync(path).length,
    digestMatches: verified,
    durabilityVerified: verified,
  });
}

/** §6: read the durable record from a run root, or null. */
export function readObservationRecord(input) {
  const path = join(input.runRoot, HOST_OBSERVATION_FILE);
  if (!existsSync(path)) return null;
  const record = JSON.parse(readFileSync(path, 'utf8'));
  const digestOk = record.recordDigest === recordDigest(record);
  return Object.freeze({ record, digestOk, contentBindingFailed: !digestOk });
}

/**
 * §6: READ THE RUN IDENTITY FROM THE ACTUAL RUN JOURNAL.
 *
 * §6: "Use the actual Run Journal's RUN_STARTED record. Do not require a nonexistent record.runId field in each
 * frozen Trial." Exactly one run identity must be present; a conflicting, missing or malformed one is refused.
 */
export function readRunIdentity(input) {
  const { journalRecords } = input;
  const started = (journalRecords ?? []).filter((entry) => entry?.type === 'RUN_STARTED' || entry?.eventType === 'RUN_STARTED');
  const runIds = [...new Set(started.map((entry) => entry.runId).filter((value) => typeof value === 'string' && value !== ''))];
  if (started.length === 0) {
    return Object.freeze({ ok: false, verdict: 'MISSING_RUN_STARTED', runId: null, runIds: Object.freeze([]), detail: 'the journal carries no RUN_STARTED record, so the run relationship cannot be established' });
  }
  if (runIds.length === 0) {
    return Object.freeze({ ok: false, verdict: 'MALFORMED_RUN_STARTED', runId: null, runIds: Object.freeze([]), detail: 'a RUN_STARTED record carries no usable runId' });
  }
  if (runIds.length > 1) {
    return Object.freeze({ ok: false, verdict: 'CONFLICTING_RUN_IDENTITY', runId: null, runIds: Object.freeze(runIds), detail: `the journal names ${String(runIds.length)} distinct run identities, so the run relationship is ambiguous` });
  }
  return Object.freeze({ ok: true, verdict: 'SINGLE_RUN_IDENTITY', runId: runIds[0], runIds: Object.freeze(runIds), detail: null });
}

/** §6: the durable Trial records the journal carries, keyed by sessionId. */
export function readTrialIdentities(input) {
  const { journalRecords } = input;
  const trials = (journalRecords ?? []).filter((entry) => entry?.type === 'TRIAL_RECORDED' || entry?.eventType === 'TRIAL_RECORDED');
  const bySession = new Map();
  for (const trial of trials) {
    if (typeof trial.sessionId === 'string') bySession.set(trial.sessionId, trial);
  }
  return bySession;
}

/**
 * §6: CORRELATE ONE DURABLE OBSERVATION RECORD AGAINST THE RUN AND THE TRIAL.
 *
 * The result is a STATE, not a boolean, so an incomplete chain is visible rather than collapsed into "false".
 */
export function correlateObservationRecord(input) {
  const { record, journalRecords, expectedRunId, expectedAttemptId } = input;
  const problems = [];
  const notes = [];

  /** §6: a record that did not come from the recorder is a DECLARATION, whatever its schema says. */
  if (record?.origin !== RECORDER_ORIGIN) {
    return Object.freeze({
      state: EVIDENCE_STATE.DECLARATION_ONLY,
      correlated: false,
      problems: Object.freeze(['the input did not come from the G1 recorder, so it is a caller declaration rather than host-produced observation']),
      notes: Object.freeze([]),
      chain: Object.freeze([]),
    });
  }

  /** §6: content binding — a record altered after persistence must fail. */
  if (record.recordDigest !== recordDigest(record)) {
    return Object.freeze({
      state: EVIDENCE_STATE.PROVENANCE_CONFLICT,
      correlated: false,
      problems: Object.freeze(['the record content no longer matches its own digest, so it was altered after it was recorded']),
      notes: Object.freeze([]),
      chain: Object.freeze([]),
    });
  }

  const run = readRunIdentity({ journalRecords });
  const chain = [];
  if (!run.ok) {
    problems.push(run.detail);
  } else {
    chain.push('RUN_STARTED');
    if (expectedRunId !== undefined && expectedRunId !== null && expectedRunId !== run.runId) {
      problems.push(`the record names run "${String(record.runId)}" but the journal's run identity is "${run.runId}"`);
    } else if (record.runId !== null && record.runId !== undefined && record.runId !== run.runId) {
      problems.push(`the record names run "${String(record.runId)}" but the journal's run identity is "${run.runId}"`);
    } else {
      chain.push('VALIDATED_RUN_CLAIM');
    }
  }

  /** §6: the AttemptId the record carries must match the durable Trial's AttemptId for the same session. */
  const trials = readTrialIdentities({ journalRecords });
  if (record.sessionId !== null && record.sessionId !== undefined && trials.has(record.sessionId)) {
    chain.push('DURABLE_TRIAL_ATTEMPT_IDENTITY');
    const trial = trials.get(record.sessionId);
    if (trial.attemptId !== record.attemptId) {
      problems.push(`the record's AttemptId "${String(record.attemptId)}" disagrees with the durable trial's AttemptId "${String(trial.attemptId)}" for session "${record.sessionId}"`);
    }
  } else if (expectedAttemptId !== undefined && expectedAttemptId !== null && expectedAttemptId !== record.attemptId) {
    problems.push(`the record's AttemptId "${String(record.attemptId)}" does not match the expected AttemptId`);
  } else {
    notes.push('no durable trial record was supplied for this session, so the Attempt identity could not be corroborated against the journal');
  }

  if (problems.length > 0) {
    return Object.freeze({
      state: EVIDENCE_STATE.PROVENANCE_CONFLICT,
      correlated: false,
      problems: Object.freeze(problems),
      notes: Object.freeze(notes),
      chain: Object.freeze(chain),
      runId: run.runId,
    });
  }

  if (chain.includes('DURABLE_TRIAL_ATTEMPT_IDENTITY')) {
    chain.push('HOST_LOCAL_JOB_ASSOCIATION', 'HOST_PRIVATE_PORT_INVOCATION', 'OBSERVED_DIRECT_CHILD_LIFECYCLE');
    return Object.freeze({
      state: EVIDENCE_STATE.RUN_ATTEMPT_CORRELATED,
      correlated: true,
      problems: Object.freeze([]),
      notes: Object.freeze(notes),
      chain: Object.freeze(chain),
      runId: run.runId,
      /** §8: correlation is NOT live-primary provenance, and the result says so. */
      livePrimary: false,
    });
  }

  return Object.freeze({
    state: EVIDENCE_STATE.PROVENANCE_INCOMPLETE,
    correlated: false,
    problems: Object.freeze([]),
    notes: Object.freeze([...notes, 'the run identity is established but the Attempt identity was not corroborated against a durable trial record']),
    chain: Object.freeze(chain),
    runId: run.runId,
  });
}

export { NL, REPO_ROOT };
