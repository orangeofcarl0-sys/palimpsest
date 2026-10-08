/**
 * R3-WR — THE FAILED-ATTEMPT LIFECYCLE AND RECOVERY ANALYSIS.
 *
 * The ruling asks whether the resulting failed attempt has a legitimate recovery path, and it names the exact
 * concern: "If a terminated worker can leave an Attempt permanently RUNNING with no supported recovery path,
 * classify that separately."
 *
 * The observed lifecycle, reconstructed from the durable store of the preserved run rather than from prose:
 *
 *   ATTEMPT_CREATED → ATTEMPT_STARTED → (the worker could not commit) → NEEDS_ESCALATION → no ATTEMPT_COMPLETED
 *
 * So the attempt is left RUNNING, and the NEXT generation is refused with
 * `plan revision blocked (quiescence_required)`, because a structural plan revision requires every open attempt
 * to settle. The consequence is precise and worth stating separately from the object-store defect itself: the
 * object-store failure is what stops ONE worker, and the unsettled attempt is what stops the PROJECT.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not propose skipping verification, forcing promotion or disabling
 * quiescence — the ruling forbids all three, and each would be a repair that hides the failure rather than
 * routing it. It measures what the EXISTING failure semantics already offer, so a repair can be built on them.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const NL = String.fromCharCode(10);

/**
 * The lifecycle states an attempt can be left in, and whether each has a supported continuation.
 *
 * `RUNNING` is the state the defect produced, and it is the one with NO supported continuation for the NEXT
 * generation: the project cannot take a structural revision while an attempt is open. That is the finding.
 */
export const ATTEMPT_STATES = Object.freeze({
  COMPLETED: Object.freeze({ settles: true, blocksNextGeneration: false }),
  RUNNING: Object.freeze({ settles: false, blocksNextGeneration: true }),
  FAILED: Object.freeze({ settles: true, blocksNextGeneration: false }),
  ABANDONED: Object.freeze({ settles: true, blocksNextGeneration: false }),
});

/**
 * THE LIFECYCLE FINDING.
 *
 * It is classified separately, as the ruling requires, because it is a DIFFERENT defect from the object store:
 * the object store stops a worker, and the unsettled attempt stops the project. Fixing the object store prevents
 * this lifecycle state from ARISING, but does not by itself give a project that is ALREADY in it a way out.
 */
export const LIFECYCLE_FINDING = Object.freeze({
  id: 'TERMINATED_WORKER_LEAVES_ATTEMPT_UNSETTLED',
  observed: Object.freeze(['ATTEMPT_CREATED', 'ATTEMPT_STARTED', 'no ATTEMPT_COMPLETED']),
  attemptStateAfterFailure: 'RUNNING',
  consequence: 'the next generation is refused with plan revision blocked (quiescence_required), because a structural plan revision requires every open attempt to settle',
  distinctFrom: 'the object-store defect: this is the PROJECT-level consequence, not the worker-level cause',
  /** The ruling names this as the thing to classify separately, and it is. */
  classifySeparately: true,
  /** The three repairs that are forbidden, and why each hides the failure rather than routing it. */
  forbiddenRepairs: Object.freeze([
    Object.freeze({ repair: 'skip verification', why: 'the attempt produced no result to verify, so there is nothing to skip' }),
    Object.freeze({ repair: 'force promotion', why: 'promotion requires a COMPLETED attempt with a report; forcing it would fabricate a result' }),
    Object.freeze({ repair: 'disable quiescence', why: 'quiescence is what stops a structural revision from racing an open attempt' }),
  ]),
  /** What the existing semantics DO offer, which is the basis a repair may be built on. */
  existingSemantics: Object.freeze([
    'the worker already reports NEEDS_ESCALATION, which is a recognised outcome rather than a silent exit',
    'the attempt carries a durable host-failure record, so the failure is observable rather than inferred',
    'a settlement path exists for an attempt that HAS a report; the gap is an attempt with none',
  ]),
  gap: 'an attempt whose worker terminated without submitting any result has no settlement path, so the project cannot take its next structural revision',
});

/**
 * Reconstruct the observed lifecycle from a run's durable store.
 *
 * The store is the authority: an attempt that never emitted ATTEMPT_COMPLETED did not settle, whatever the
 * harness printed. Reading it directly is what makes this an observation rather than a recollection.
 */
export function observedLifecycle(input) {
  const { storePath, attemptIdPrefix } = input;
  if (!existsSync(storePath)) return Object.freeze({ available: false, storePath });
  const events = readAttemptEvents({ storePath });
  const interesting = events.filter((event) => attemptIdPrefix === undefined || String(event.entity_id).startsWith(attemptIdPrefix));
  const byAttempt = {};
  for (const event of interesting) {
    byAttempt[event.entity_id] = byAttempt[event.entity_id] ?? [];
    byAttempt[event.entity_id].push(event.event_type);
  }
  const rows = Object.entries(byAttempt).map(([attemptId, types]) => Object.freeze({
    attemptId,
    events: Object.freeze(types),
    settled: types.includes('ATTEMPT_COMPLETED') || types.includes('ATTEMPT_FAILED'),
    leftRunning: types.includes('ATTEMPT_STARTED') && !types.includes('ATTEMPT_COMPLETED') && !types.includes('ATTEMPT_FAILED'),
  }));
  return Object.freeze({
    available: true,
    storePath,
    attempts: Object.freeze(rows),
    unsettled: Object.freeze(rows.filter((row) => row.leftRunning).map((row) => row.attemptId)),
    settled: Object.freeze(rows.filter((row) => row.settled).map((row) => row.attemptId)),
  });
}

/** Read the attempt/task events of an orchestration store, without the sqlite module leaking into callers. */
function readAttemptEvents(input) {
  const { storePath } = input;
  const db = new DatabaseSync(storePath);
  try {
    return db.prepare("SELECT entity_id, event_type FROM events WHERE entity_type IN ('attempt','task') ORDER BY rowid ASC").all().map((row) => Object.freeze({ entity_id: String(row.entity_id), event_type: String(row.event_type) }));
  } finally {
    db.close();
  }
}

/** §16: the recovery verdict, stated as one of the three values the ruling names. */
export function recoveryVerdict(lifecycle) {
  if (lifecycle.available !== true) {
    return Object.freeze({
      FAILED_ATTEMPT_RECOVERY: 'NOT_APPLICABLE',
      reason: 'the run durable store is not available on this host, so the lifecycle cannot be observed',
    });
  }
  const unsettled = lifecycle.unsettled.length;
  return Object.freeze({
    FAILED_ATTEMPT_RECOVERY: unsettled > 0 ? 'OPEN' : 'CLOSED',
    unsettledAttempts: unsettled,
    reason: unsettled > 0
      ? 'an attempt that terminated without a result is left RUNNING and has no settlement path, so the project cannot take its next structural revision'
      : 'every observed attempt settled, so no recovery gap was exhibited by this run',
  });
}

export { NL };
