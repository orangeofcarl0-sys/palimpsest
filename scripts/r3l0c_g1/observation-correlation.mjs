/**
 * R3-L0C-G1-B §5/§6/§7 — DURABLE HOST EVIDENCE, RUN CORRELATION AND THE LOCAL ORIGIN BOUNDARY.
 *
 * G1 built a working producer but wired it to a consumer that could not read the real journal, accepted a forged
 * origin marker, and counted a zero-event record as durable evidence. G1-B corrects exactly those three things,
 * and nothing else.
 *
 * THE CORRECTED CHAIN, and the level it stops at:
 *
 *   RUN_STARTED (real `kind/payload` journal) → verified Run Claim (nonce) → durable Trial/Attempt identity
 *     → host-local Job association → one Port Invocation → non-empty observed direct-child lifecycle
 *
 * THREE SEPARATED TRUST LAYERS (§7). They are the whole point of the correction:
 *
 *   UNTRUSTED RECORD INSPECTION      `inspectUntrustedRecord` validates shape and content consistency ONLY. It
 *                                    can never promote its input to host origin, because it has no relationship
 *                                    to a live invocation.
 *   TRUSTED RECORDER INGESTION       `createObservationRecorder` returns a handle bound to ONE live invocation.
 *                                    Only observations delivered through that handle are `LOCAL_HOST_OBSERVED`.
 *   VERIFIED PERSISTENT READBACK     `readVerifiedRecord` reads an owned record from the expected run-scoped
 *                                    location, verifies its bytes, and compares it with the trusted bindings.
 *
 * WHY A COPIED ORIGIN MARKER IS NOT ENOUGH. §7: "A caller can copy a known string and recompute a public hash."
 * The marker and the digest are therefore NOT the trust decision; the trust decision is whether the record came
 * through a recorder handle that this process created for a live port invocation. The marker survives only as a
 * shape field, and a record carrying it without that relationship is reported `ORIGIN_NOT_ESTABLISHED`.
 *
 * WHAT IT STILL DEPENDS ON. The local host process. §7 requires that limitation DISCLOSED rather than papered over
 * with a self-signed credential, and `LOCAL_TRUST_MODEL` says so.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { EVIDENCE_STATE, NL, OBSERVATION_SCHEMA_VERSION, REPO_ROOT } from './contract.mjs';

/** §5: the durable observation record's schema version, independent of the observation's own. */
export const OBSERVATION_RECORD_SCHEMA_VERSION = 2;

/** §5: the run-scoped directory a recorder writes into, one file per invocation. */
export const HOST_OBSERVATION_DIRECTORY = 'host-observations';

/** §5: the shape field a record carries. It is NOT the trust decision — see the module header. */
export const RECORDER_ORIGIN = 'G1_LOCAL_RECORDER';

/** §5: the process-event kinds whose ordering a complete lifecycle must satisfy. */
export const LIFECYCLE_KINDS = Object.freeze({
  SPAWN_ATTEMPTED: 'DIRECT_CHILD_SPAWN_ATTEMPTED',
  SPAWN_OBSERVED: 'DIRECT_CHILD_SPAWN_OBSERVED',
  SPAWN_ERROR: 'DIRECT_CHILD_SPAWN_ERROR',
  EXIT_OBSERVED: 'DIRECT_CHILD_EXIT_OBSERVED',
  EXIT_UNCONFIRMED: 'DIRECT_CHILD_EXIT_UNCONFIRMED',
  TIMEOUT_REQUESTED: 'DIRECT_CHILD_TIMEOUT_REQUESTED',
  ABORT_REQUESTED: 'DIRECT_CHILD_ABORT_REQUESTED',
});

/** §5: the trust-boundary states this module can assign. */
export const CLASSIFICATION = Object.freeze({
  DECLARATION_ONLY: EVIDENCE_STATE.DECLARATION_ONLY,
  ORIGIN_NOT_ESTABLISHED: EVIDENCE_STATE.ORIGIN_NOT_ESTABLISHED,
  LOCAL_HOST_OBSERVED: EVIDENCE_STATE.LOCAL_HOST_OBSERVED,
  RUN_ATTEMPT_CORRELATED: EVIDENCE_STATE.RUN_ATTEMPT_CORRELATED,
  PROVENANCE_INCOMPLETE: EVIDENCE_STATE.PROVENANCE_INCOMPLETE,
  PROVENANCE_CONFLICT: EVIDENCE_STATE.PROVENANCE_CONFLICT,
});

/**
 * §5: a digest over a record's content, excluding the digest field itself.
 *
 * This is a CONTENT-INTEGRITY check, not a trust decision. §7: a caller can recompute it.
 */
export function recordDigest(record) {
  const { recordDigest: _ignored, ...rest } = record;
  return createHash('sha256').update(JSON.stringify(rest), 'utf8').digest('hex');
}

/** §5: a run-scoped, traversal-safe file name for ONE invocation. */
export function observationFileName(invocationId) {
  const safe = String(invocationId ?? '').replace(/[^A-Za-z0-9._-]/gu, '');
  if (safe === '' || safe !== String(invocationId)) return null;
  return `${safe}.json`;
}

/* ------------------------------------------------------------------ *
 * LAYER 1: untrusted record inspection
 * ------------------------------------------------------------------ */

/**
 * §7: INSPECT AN ARBITRARY RECORD WITHOUT TRUSTING IT.
 *
 * This function answers ONLY "is this shaped like a record and internally consistent". It NEVER promotes its input
 * to host origin, because it has no relationship to a live invocation — which is exactly the relationship §7
 * requires and the reason a copied marker cannot pass through here.
 */
export function inspectUntrustedRecord(record) {
  const problems = [];
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return Object.freeze({ wellFormed: false, problems: Object.freeze(['the input is not an object']), originRelationship: 'NONE', mayPromoteToHostOrigin: false });
  }
  if (record.schemaVersion !== OBSERVATION_RECORD_SCHEMA_VERSION) problems.push(`unknown record schema version ${String(record.schemaVersion)}`);
  if (typeof record.invocationId !== 'string' || record.invocationId === '') problems.push('the record carries no invocationId');
  if (!Array.isArray(record.events)) problems.push('the record carries no events array');
  if (record.recordDigest !== undefined && record.recordDigest !== recordDigest(record)) problems.push('the record content does not match its own digest');
  return Object.freeze({
    wellFormed: problems.length === 0,
    problems: Object.freeze(problems),
    /** §7: this layer has NO relationship to a live invocation, so it can never establish origin. */
    originRelationship: 'NONE',
    mayPromoteToHostOrigin: false,
    note: 'shape validity is not origin; a caller can copy the marker and recompute the digest',
  });
}

/* ------------------------------------------------------------------ *
 * LAYER 2: trusted local recorder ingestion
 * ------------------------------------------------------------------ */

/**
 * §5/§7: CREATE A RECORDER BOUND TO ONE LIVE INVOCATION.
 *
 * The recorder is the ONLY path to `LOCAL_HOST_OBSERVED`. It is created by the process that runs the port, and it
 * ingests the observations that port actually emitted — so a record it produces has a real producer relationship
 * that no caller-built JSON can reproduce.
 *
 * §5: THE RECORDER REJECTS WHAT THE PORT DID NOT EMIT. A mismatched invocation, an unknown schema and a duplicate
 * sequence number are all rejected rather than absorbed, and a rejection is VISIBLE, because a silently-dropped
 * event is how a zero-event record comes to look like a successful one.
 */
export function createObservationRecorder(input = {}) {
  const invocationId = input.invocationId ?? `wpi-${randomUUID()}`;
  const captured = [];
  const rejected = [];
  const seenSequences = new Set();
  return Object.freeze({
    invocationId,
    /** §5: the sink shape the port expects. Bound to THIS recorder's invocation. */
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
        rejected.push(Object.freeze({ reason: `observation names invocation "${String(observation.invocationId)}" but this recorder is bound to "${invocationId}"` }));
        return;
      }
      /** §5 B2-N4: a duplicate sequence is a duplicated or replayed event, so it is refused. */
      if (seenSequences.has(observation.sequence)) {
        rejected.push(Object.freeze({ reason: `duplicate event sequence ${String(observation.sequence)}` }));
        return;
      }
      seenSequences.add(observation.sequence);
      captured.push(observation);
    },
    /** §5: the captured set, in emission order, as data. */
    captured: () => Object.freeze([...captured]),
    rejected: () => Object.freeze([...rejected]),
  });
}

/**
 * §5: CLASSIFY A CAPTURED EVENT STREAM.
 *
 * A complete local lifecycle is SPAWN_ATTEMPTED → SPAWN_OBSERVED → EXIT_OBSERVED with one invocation, one pid and
 * a monotonic sequence. A SPAWN_ERROR stream is a legitimate FAILURE lifecycle and is classified as such — it is
 * never read as a spawn/exit pair. An exit without a preceding observed spawn is a contradiction.
 */
export function classifyEventStream(events) {
  const problems = [];
  const kinds = events.map((event) => event.eventKind);
  const invocationIds = [...new Set(events.map((event) => event.invocationId))];
  const pids = [...new Set(events.map((event) => event.directChildPid).filter((pid) => typeof pid === 'number'))];
  const sequences = events.map((event) => event.sequence);
  const monotonic = sequences.every((value, index) => index === 0 || value > sequences[index - 1]);

  if (events.length === 0) problems.push('the event stream is EMPTY, so it is not process evidence');
  if (invocationIds.length > 1) problems.push(`the event stream mixes ${String(invocationIds.length)} invocation identities`);
  if (!monotonic) problems.push('the event sequence numbers are not strictly monotonic');
  if (pids.length > 1) problems.push(`the event stream reports ${String(pids.length)} different direct-child pids`);

  const hasSpawnError = kinds.includes(LIFECYCLE_KINDS.SPAWN_ERROR);
  const hasSpawnObserved = kinds.includes(LIFECYCLE_KINDS.SPAWN_OBSERVED);
  const hasExitObserved = kinds.includes(LIFECYCLE_KINDS.EXIT_OBSERVED);
  const hasExitUnconfirmed = kinds.includes(LIFECYCLE_KINDS.EXIT_UNCONFIRMED);

  if (hasExitObserved && !hasSpawnObserved) problems.push('an exit was observed without a preceding observed spawn');
  if (hasSpawnError && (hasSpawnObserved || hasExitObserved)) problems.push('a spawn error coexists with a spawn/exit observation, which is contradictory');
  if (hasExitObserved && hasExitUnconfirmed) problems.push('both an observed and an unconfirmed exit appear in the same completed snapshot');

  const complete = hasSpawnObserved && hasExitObserved && !hasSpawnError && !hasExitUnconfirmed && problems.length === 0;
  const failed = hasSpawnError && !hasSpawnObserved && !hasExitObserved;
  const unconfirmed = hasExitUnconfirmed && !hasExitObserved;

  return Object.freeze({
    eventCount: events.length,
    invocationIds: Object.freeze(invocationIds),
    singleInvocation: invocationIds.length === 1,
    pids: Object.freeze(pids),
    singlePid: pids.length <= 1,
    monotonic,
    kinds: Object.freeze(kinds),
    hasSpawnError,
    hasSpawnObserved,
    hasExitObserved,
    hasExitUnconfirmed,
    completeLifecycle: complete,
    spawnFailed: failed,
    exitUnconfirmed: unconfirmed,
    problems: Object.freeze(problems),
    valid: problems.length === 0,
  });
}

/**
 * §5: BUILD THE DURABLE RECORD from a recorder's captured set plus the correlation identity.
 *
 * The record carries STRUCTURAL metadata only. It also carries the INVOCATION IDENTITY RELATIONSHIP — the fact
 * that this record was produced by a recorder bound to a live invocation — which is what separates it from a
 * caller-built object.
 */
export function buildObservationRecord(input) {
  const { recorder, hostLocalJobId, attemptId, runId, sessionId, source } = input;
  const observations = recorder.captured();
  const classification = classifyEventStream(observations);
  const record = {
    schemaVersion: OBSERVATION_RECORD_SCHEMA_VERSION,
    kind: 'G1-B host process observation record',
    stage: 'R3-L0C-G1-B',
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
    acceptedEventCount: observations.length,
    rejectedCount: recorder.rejected().length,
    rejected: recorder.rejected(),
    lifecycle: Object.freeze({
      complete: classification.completeLifecycle,
      spawnFailed: classification.spawnFailed,
      exitUnconfirmed: classification.exitUnconfirmed,
      singleInvocation: classification.singleInvocation,
      singlePid: classification.singlePid,
      monotonic: classification.monotonic,
      valid: classification.valid,
      problems: classification.problems,
    }),
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
    /** §5: the honest scope, carried on the record so a reader cannot over-read it. */
    proves: Object.freeze([
      'a direct child process was created and its lifecycle was observed on this host',
      'the observation was delivered through the recorder handle bound to this invocation',
    ]),
    doesNotProve: Object.freeze([
      'that a downstream wrapper spawned the genuine DSH binary',
      'that the provider/model route actually executed',
      'that a remote model request occurred',
      'that the Work Attempt was canonically completed',
      'that this record is LIVE_PRIMARY provenance',
    ]),
    /** §7: the trust limitation, stated rather than hidden behind a self-signed signature. */
    trustedLocalRecorder: true,
    independentlySigned: false,
    trustLimitation: 'this record is trusted only to the extent the local host process that produced it is trusted; G1-B adds no cryptographic signature, because a key generated and trusted by the same test would prove nothing',
  };
  return Object.freeze({ ...record, recordDigest: recordDigest(record) });
}

/* ------------------------------------------------------------------ *
 * LAYER 3: durable storage and verified readback
 * ------------------------------------------------------------------ */

/**
 * §5: WRITE THE RECORD DURABLY, PER INVOCATION, then RE-READ and VERIFY the bytes.
 *
 * §5 requires per-invocation storage rather than one fixed file, an atomic publish, a byte re-read, digest
 * verification, interrupted-write detection and a refusal of duplicates and conflicts. The temporary-then-rename
 * protocol is the same one the frozen journal uses, so a reader never sees a partial document.
 *
 * §5 also requires the limitation to be reported honestly: `writeFileSync` returning does not prove power-loss
 * durability on every filesystem, and the result says so rather than claiming it.
 */
export function writeObservationRecord(input) {
  const { runRoot, record } = input;
  const fileName = observationFileName(record.invocationId);
  if (fileName === null) {
    return Object.freeze({ written: false, conflict: false, path: null, reason: 'the record invocationId is not a safe file name, so the record is refused rather than written to a traversal-capable path' });
  }
  const directory = join(runRoot, HOST_OBSERVATION_DIRECTORY);
  const path = join(directory, fileName);
  /** §5: the path must stay inside the run-scoped directory. */
  if (!resolve(path).startsWith(resolve(directory))) {
    return Object.freeze({ written: false, conflict: false, path, reason: 'the resolved record path escapes the run-scoped observation directory' });
  }
  mkdirSync(directory, { recursive: true });
  /** §5 B2-N8/N9: refuse to overwrite an existing record; a second write for the same invocation is a conflict. */
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
        : 'a record for a DIFFERENT invocation already exists at this path; refusing to overwrite it',
    });
  }
  /** §5: atomic publish — write to a temporary file, then rename it into place. */
  const temporary = `${path}.tmp-${String(process.pid)}-${String(Date.now())}`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  renameSync(temporary, path);
  const readBack = JSON.parse(readFileSync(path, 'utf8'));
  const digestOk = readBack.recordDigest === recordDigest(readBack);
  const verified = digestOk && readBack.recordDigest === record.recordDigest;
  return Object.freeze({
    written: true,
    conflict: false,
    path,
    bytesRead: readFileSync(path).length,
    digestMatches: digestOk,
    durabilityVerified: verified,
    /** §5: stated, not implied — a successful write is not a power-loss guarantee. */
    powerLossDurabilityGuaranteed: false,
    durabilityLimitation: 'the record was written and its bytes were re-read and verified; this does not by itself prove power-loss durability on every filesystem',
  });
}

/**
 * §5: READ ONE RECORD BACK, VERIFYING ITS BYTES AND ITS INVOCATION BINDING.
 *
 * `expected` carries the trusted bindings the caller already holds from the live run. A record whose content is
 * intact but whose identity disagrees with those bindings is a CONFLICT, not an observation.
 */
export function readObservationRecord(input) {
  const { runRoot, invocationId, expected } = input;
  const fileName = observationFileName(invocationId);
  if (fileName === null) return null;
  const path = join(runRoot, HOST_OBSERVATION_DIRECTORY, fileName);
  if (!existsSync(path)) return null;
  const record = JSON.parse(readFileSync(path, 'utf8'));
  const digestOk = record.recordDigest === recordDigest(record);
  const mismatches = [];
  if (expected !== undefined && expected !== null) {
    for (const field of ['attemptId', 'hostLocalJobId', 'invocationId', 'runId', 'sessionId']) {
      if (expected[field] !== undefined && expected[field] !== null && record[field] !== expected[field]) {
        mismatches.push(`${field}: record "${String(record[field])}" vs expected "${String(expected[field])}"`);
      }
    }
  }
  return Object.freeze({
    record,
    digestOk,
    contentBindingFailed: !digestOk,
    identityMismatches: Object.freeze(mismatches),
    identityMatches: mismatches.length === 0,
    interrupted: !digestOk,
  });
}

/** §5: list every invocation record in a run root, for a multi-invocation run. */
export function listObservationRecords(runRoot) {
  const directory = join(runRoot, HOST_OBSERVATION_DIRECTORY);
  if (!existsSync(directory)) return Object.freeze([]);
  try {
    return Object.freeze(readdirSync(directory).filter((name) => name.endsWith('.json')).sort());
  } catch {
    return Object.freeze([]);
  }
}

/** §5: detect a leftover in-flight write, which is evidence a record may never have been published. */
export function detectInterruptedWrites(runRoot) {
  const directory = join(runRoot, HOST_OBSERVATION_DIRECTORY);
  if (!existsSync(directory)) return Object.freeze([]);
  try {
    return Object.freeze(readdirSync(directory).filter((name) => name.includes('.tmp-')).sort());
  } catch {
    return Object.freeze([]);
  }
}

/* ------------------------------------------------------------------ *
 * §6: the real frozen journal and the run claim
 * ------------------------------------------------------------------ */

/**
 * §6: READ THE RUN IDENTITY FROM THE ACTUAL FROZEN JOURNAL.
 *
 * §6: "A Journal Record has the shape `{ seq, kind, at, payload, digest }`." The G1 readers matched flattened
 * `type/runId` fields and therefore failed on real records; this reads `kind` and `payload.runId`, which is the
 * actual layout `appendRecord` writes.
 */
export function readRunIdentity(input) {
  const { journalRecords } = input;
  const started = (journalRecords ?? []).filter((entry) => entry?.kind === 'RUN_STARTED');
  if (started.length === 0) {
    return Object.freeze({ ok: false, verdict: 'MISSING_RUN_STARTED', runId: null, runIds: Object.freeze([]), detail: 'the journal carries no RUN_STARTED record, so the run relationship cannot be established' });
  }
  const runIds = [...new Set(started.map((entry) => entry?.payload?.runId).filter((value) => typeof value === 'string' && value !== ''))];
  if (runIds.length === 0) {
    return Object.freeze({ ok: false, verdict: 'MALFORMED_RUN_STARTED', runId: null, runIds: Object.freeze([]), detail: 'a RUN_STARTED record carries no usable payload.runId' });
  }
  if (runIds.length > 1) {
    return Object.freeze({ ok: false, verdict: 'CONFLICTING_RUN_IDENTITY', runId: null, runIds: Object.freeze(runIds), detail: `the journal names ${String(runIds.length)} distinct run identities, so the run relationship is ambiguous` });
  }
  /** §6 B3-N4: a duplicated RUN_STARTED for the SAME run is still a malformed journal. */
  if (started.length > 1) {
    return Object.freeze({ ok: false, verdict: 'DUPLICATE_RUN_STARTED', runId: null, runIds: Object.freeze(runIds), detail: `the journal carries ${String(started.length)} RUN_STARTED records, so the run boundary is not unambiguous` });
  }
  return Object.freeze({
    ok: true,
    verdict: 'SINGLE_RUN_IDENTITY',
    runId: runIds[0],
    runIds: Object.freeze(runIds),
    claimNonce: started[0]?.payload?.claimNonce ?? null,
    detail: null,
  });
}

/**
 * §6: READ THE DURABLE TRIAL IDENTITIES from the real journal, keyed by session.
 *
 * §6: a Trial identifies the session and attempt through `payload.sessionId`, `payload.record.attemptId` and
 * `payload.record.hostJobId`. A duplicate trial for one session is reported, not silently overwritten.
 */
export function readTrialIdentities(input) {
  const { journalRecords } = input;
  const trials = (journalRecords ?? []).filter((entry) => entry?.kind === 'TRIAL_RECORDED');
  const bySession = new Map();
  const duplicates = [];
  for (const trial of trials) {
    const sessionId = trial?.payload?.sessionId;
    if (typeof sessionId !== 'string' || sessionId === '') continue;
    if (bySession.has(sessionId)) duplicates.push(sessionId);
    bySession.set(sessionId, Object.freeze({
      sessionId,
      nestedSessionId: trial?.payload?.record?.sessionId ?? null,
      attemptId: trial?.payload?.record?.attemptId ?? null,
      hostJobId: trial?.payload?.record?.hostJobId ?? null,
    }));
  }
  return Object.freeze({ bySession, duplicates: Object.freeze(duplicates), total: trials.length });
}

/** §6: verify the frozen journal through the REAL reader, requiring intact evidence. */
export async function readVerifiedJournal(input) {
  const journal = await import('../r3l0cf/journal.mjs');
  const read = journal.readJournal(input.journalPath);
  return Object.freeze({
    exists: read.exists === true,
    journalIntact: read.JOURNAL_INTACT === true,
    interruptedCount: read.interrupted.length,
    temporaryFileCount: read.temporaryFiles.length,
    recordCount: read.records.length,
    records: read.records,
    problems: Object.freeze([
      ...(read.exists === true ? [] : ['the journal does not exist']),
      ...(read.interrupted.length === 0 ? [] : [`${String(read.interrupted.length)} interrupted record(s)`]),
      ...(read.temporaryFiles.length === 0 ? [] : [`${String(read.temporaryFiles.length)} in-flight temporary record(s)`]),
    ]),
  });
}

/** §6: verify the run claim through the REAL frozen verifier. */
export async function verifyRunClaim(input) {
  const failStop = await import('../r3l0cf/fail-stop.mjs');
  const verified = failStop.verifyTrustedClaim({ runRoot: input.runRoot, runId: input.runId, claimNonce: input.claimNonce });
  return Object.freeze({ trusted: verified.trusted === true, verdict: verified.verdict, reason: verified.reason ?? null });
}

/**
 * §6/§7: CORRELATE ONE DURABLE OBSERVATION RECORD AGAINST THE RUN, THE CLAIM AND THE TRIAL.
 *
 * The result is a STATE, not a boolean. A record reaches `RUN_ATTEMPT_CORRELATED` only when the origin
 * relationship, the non-empty validated events, the intact journal, the verified claim AND the durable Attempt
 * identity ALL hold. The chain is appended ONLY for relations actually checked, so no label is decoration.
 */
export async function correlateObservationRecord(input) {
  const { record, journalRecords, runRoot, claimNonce, expectedRunId, expectedAttemptId, expectedInvocationId, trustedIngestion } = input;
  const problems = [];
  const notes = [];
  const chain = [];

  /**
   * §7: ORIGIN IS ESTABLISHED BY INGESTION, NOT BY A MARKER.
   *
   * `trustedIngestion` is the token the recorder returns for a live invocation. Without it the record is a
   * DECLARATION, even when it carries the marker and a valid digest.
   */
  if (trustedIngestion !== true) {
    const inspection = inspectUntrustedRecord(record);
    return Object.freeze({
      state: record?.origin === RECORDER_ORIGIN ? CLASSIFICATION.ORIGIN_NOT_ESTABLISHED : CLASSIFICATION.DECLARATION_ONLY,
      correlated: false,
      problems: Object.freeze([
        'the record was not delivered through a live recorder handle, so its origin relationship is not established',
        ...inspection.problems,
      ]),
      notes: Object.freeze([]),
      chain: Object.freeze([]),
      livePrimary: false,
    });
  }
  chain.push('TRUSTED_LOCAL_RECORDER_INGESTION');

  /**
   * §4 B1 / §9 N1: THE RECORD'S INVOCATION MUST BE THE ONE THE TRUSTED SINK WAS BOUND TO.
   *
   * A record that names a DIFFERENT invocation than the live port produced is a second identity, which is exactly
   * the defect B1 closes. Without this comparison the record's own invocationId is self-asserted.
   */
  if (expectedInvocationId !== undefined && expectedInvocationId !== null && record.invocationId !== expectedInvocationId) {
    return Object.freeze({
      state: CLASSIFICATION.PROVENANCE_CONFLICT,
      correlated: false,
      problems: Object.freeze([`the record names invocation "${String(record.invocationId)}" but the trusted sink was bound to "${String(expectedInvocationId)}", so a second invocation identity was introduced`]),
      notes: Object.freeze([]),
      chain: Object.freeze(chain),
      livePrimary: false,
    });
  }

  /** §5: content binding — a record altered after persistence must fail. */
  if (record?.recordDigest !== recordDigest(record)) {
    return Object.freeze({
      state: CLASSIFICATION.PROVENANCE_CONFLICT,
      correlated: false,
      problems: Object.freeze(['the record content no longer matches its own digest, so it was altered after it was recorded']),
      notes: Object.freeze([]),
      chain: Object.freeze(chain),
      livePrimary: false,
    });
  }
  chain.push('CONTENT_INTEGRITY_VERIFIED');

  /** §5: a record with no real events cannot satisfy the process-lifecycle edge. */
  const events = Array.isArray(record.events) ? record.events : [];
  if (events.length === 0) {
    return Object.freeze({
      state: CLASSIFICATION.PROVENANCE_INCOMPLETE,
      correlated: false,
      problems: Object.freeze(['the record carries NO process events, so it is not evidence of a process lifecycle']),
      notes: Object.freeze([]),
      chain: Object.freeze(chain),
      livePrimary: false,
    });
  }
  if (record.eventCount !== events.length || record.acceptedEventCount !== events.length) {
    problems.push('the record event counts disagree with its events array');
  }
  chain.push('NONEMPTY_PROCESS_OBSERVATION');

  /** §5: the event stream must be a valid lifecycle with one invocation, one pid and a monotonic sequence. */
  const lifecycle = classifyEventStream(events.map((event) => ({ ...event, invocationId: record.invocationId })));
  if (lifecycle.valid !== true) problems.push(...lifecycle.problems);
  else chain.push('PROCESS_EVENT_SEQUENCE_VALID');
  /**
   * §5 / §9 N2: A CORRELATED STATE REQUIRES A COMPLETE OBSERVED LIFECYCLE. A stream with a spawn but no observed
   * exit is valid-but-incomplete; it is reported as incomplete evidence rather than correlated, because "the
   * process started and we did not see it finish" is not the same fact as "the process ran and exited".
   */
  const lifecycleComplete = lifecycle.completeLifecycle === true;

  /** §6: the journal must exist and be intact. */
  const journal = await readVerifiedJournal({ journalPath: input.journalPath });
  if (journal.exists !== true) problems.push('the journal does not exist');
  if (journal.journalIntact !== true) problems.push(...journal.problems);
  if (journal.exists === true && journal.journalIntact === true) chain.push('JOURNAL_INTEGRITY_VERIFIED');

  const run = readRunIdentity({ journalRecords });
  if (!run.ok) problems.push(run.detail);
  else {
    chain.push('RUN_STARTED');
    if (record.runId !== null && record.runId !== undefined && record.runId !== run.runId) {
      problems.push(`the record names run "${String(record.runId)}" but the journal's run identity is "${run.runId}"`);
    } else if (expectedRunId !== undefined && expectedRunId !== null && expectedRunId !== run.runId) {
      problems.push(`the expected run "${expectedRunId}" is not the journal's run identity "${run.runId}"`);
    } else {
      chain.push('RUN_IDENTITY_AGREES');
    }
    /** §6: the run claim must verify against the independently held nonce. */
    if (runRoot !== undefined && runRoot !== null) {
      const claim = await verifyRunClaim({ runRoot, runId: run.runId, claimNonce: claimNonce ?? run.claimNonce });
      if (claim.trusted !== true) problems.push(`the run claim did not verify (${claim.verdict}): ${String(claim.reason)}`);
      else chain.push('RUN_CLAIM_VERIFIED');
    } else {
      notes.push('no run root was supplied, so the run claim could not be verified');
    }
  }

  /** §6: the durable Attempt identity must agree with the trial the journal recorded for the session. */
  const trials = readTrialIdentities({ journalRecords });
  if (trials.duplicates.length > 0) problems.push(`the journal carries duplicate TRIAL_RECORDED records for session(s) [${trials.duplicates.join(', ')}]`);
  const sessionId = record.sessionId;
  if (typeof sessionId === 'string' && sessionId !== '' && trials.bySession.has(sessionId)) {
    const trial = trials.bySession.get(sessionId);
    if (trial.nestedSessionId !== null && trial.nestedSessionId !== sessionId) {
      problems.push(`the trial's nested session "${String(trial.nestedSessionId)}" disagrees with its outer session "${sessionId}"`);
    }
    if (trial.attemptId !== record.attemptId) {
      problems.push(`the record's AttemptId "${String(record.attemptId)}" disagrees with the durable trial's AttemptId "${String(trial.attemptId)}" for session "${sessionId}"`);
    } else {
      chain.push('DURABLE_TRIAL_ATTEMPT_IDENTITY');
    }
    /** §6: the host job association is checked where authoritative evidence exists. */
    if (trial.hostJobId !== null && trial.hostJobId !== record.hostLocalJobId) {
      problems.push(`the record's host-local job "${String(record.hostLocalJobId)}" disagrees with the trial's hostJobId "${String(trial.hostJobId)}"`);
    } else if (trial.hostJobId !== null) {
      chain.push('HOST_JOB_ASSOCIATION_VERIFIED');
    }
  } else if (expectedAttemptId !== undefined && expectedAttemptId !== null && expectedAttemptId !== record.attemptId) {
    problems.push(`the record's AttemptId "${String(record.attemptId)}" does not match the expected AttemptId`);
  } else {
    notes.push('no durable trial record was supplied for this session, so the Attempt identity could not be corroborated against the journal');
  }

  if (problems.length > 0) {
    return Object.freeze({
      state: CLASSIFICATION.PROVENANCE_CONFLICT,
      correlated: false,
      problems: Object.freeze(problems),
      notes: Object.freeze(notes),
      chain: Object.freeze(chain),
      runId: run.runId,
      livePrimary: false,
    });
  }

  if (chain.includes('DURABLE_TRIAL_ATTEMPT_IDENTITY') && lifecycleComplete !== true) {
    return Object.freeze({
      state: CLASSIFICATION.PROVENANCE_INCOMPLETE,
      correlated: false,
      problems: Object.freeze([]),
      notes: Object.freeze([...notes, 'the run and Attempt identities are established, but the observed process lifecycle is INCOMPLETE (no confirmed exit), so no completed lifecycle is claimed']),
      chain: Object.freeze(chain),
      runId: run.runId,
      livePrimary: false,
    });
  }

  if (chain.includes('DURABLE_TRIAL_ATTEMPT_IDENTITY')) {
    chain.push('HOST_LOCAL_JOB_ASSOCIATION', 'HOST_PRIVATE_PORT_INVOCATION', 'OBSERVED_DIRECT_CHILD_LIFECYCLE');
    return Object.freeze({
      state: CLASSIFICATION.RUN_ATTEMPT_CORRELATED,
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
    state: CLASSIFICATION.PROVENANCE_INCOMPLETE,
    correlated: false,
    problems: Object.freeze([]),
    notes: Object.freeze([...notes, 'the run identity is established but the Attempt identity was not corroborated against a durable trial record']),
    chain: Object.freeze(chain),
    runId: run.runId,
    livePrimary: false,
  });
}

export { NL, REPO_ROOT };
