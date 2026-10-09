/**
 * R3-L0C-I-A §1 — THE EIGHT ESCAPED-DEFECT FALSIFIERS.
 *
 * §1 requires each of the eight defects to be MEASURED against `b6c15e6` and to FAIL against the baseline. This
 * module runs the measurements in `baseline/legacy-activation.mjs` and reports, per defect, the observation and
 * whether the defect is present.
 *
 * WHAT "FAIL AGAINST THE BASELINE" MEANS HERE. The ruling's phrasing is the R3-L0C-F form: the falsifier is a
 * property that the repaired implementation must satisfy, and against the baseline the property is VIOLATED.
 * So each entry reports `PROPERTY_VIOLATED_BY_BASELINE: true` with the evidence that violates it, and the
 * repaired implementation is measured against the SAME property by `activation.mjs`. That is what makes the two
 * halves commensurable rather than two different tests.
 *
 * THE FALSIFIERS ARE COMMITTED BEFORE THE REPAIRS. §1 says it in one line: "Do not write the negative tests after
 * adapting them to the repaired implementation." The commit order is the evidence.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  legacyActivate,
  legacyClosureAcceptance,
  legacyDefaultValidityGate,
  legacyProtectedRoots,
  legacyPullConflation,
  legacyTimeoutBudgets,
  legacyTreatmentMismatch,
  legacyWorkerSelection,
} from './baseline/legacy-activation.mjs';

const NL = String.fromCharCode(10);

/** The schedule the falsifiers use, small and deterministic: two sessions in one trajectory. */
export function falsifierSchedule() {
  return Object.freeze([
    Object.freeze({ sessionId: 'f-t0-G1', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'f-t0', scheduleIndex: 0, requiresResolved: null }),
    Object.freeze({ sessionId: 'f-t0-G2', block: 0, arm: 'C', generation: 'G2', trajectoryId: 'f-t0', scheduleIndex: 1, requiresResolved: 'f-t0-G1' }),
  ]);
}

/** The admission signals a healthy outcome carries, so the runner's own schema does not interfere. */
const ADMITTED_BASE = Object.freeze({
  jobPhase: 'FINISHED',
  reportPresent: true,
  attemptState: 'COMPLETED',
  consumerVisibleHandleCount: 0,
  governedPullCount: 0,
  completionCause: 'RESULT_SUBMITTED',
});

/**
 * F1 — REPLAY BEFORE CLAIM.
 *
 * THE PROPERTY: a second invocation with the same run id must be refused BEFORE any byte of the run root's
 * protected state changes.
 *
 * THE MEASUREMENT: a digest over the run root's files — the trajectory world, its durable stores, the claim, the
 * journal, the abort manifest and the PRESERVE marker — is taken after the first run; the run root is then
 * re-entered through the baseline's own activation order; the digest is retaken.
 *
 * THE FINDING IS SEVERE AND WAS NOT ASSUMED. The baseline does not merely mutate before refusing: it NEVER
 * REFUSES. `preparePrimaryCase` calls `prepareRunLayout` -> `buildIsolatedLayout`, whose first statement is
 * `rmSync(root, { recursive: true, force: true })` — so the second invocation DELETES the run root, including
 * the claim file, the generation journal, the abort manifest and the PRESERVE marker, and then proceeds as
 * `NEW`. Measured: the first run's five evidence artifacts are present afterwards with DIFFERENT digests, the
 * claim file has been recreated by the second run, and the second run's own terminal state is computed from a
 * schedule it ran itself.
 *
 * That is the worst form of the defect the ruling names. The replay guard exists in `fail-stop.mjs` and is
 * correct, but it is unreachable because the destructive preparation runs FIRST and removes the very evidence the
 * guard reads. A reader who checked only the guard would conclude the property held.
 */
export async function falsifyF1(input) {
  const { prehistory, trajectoryIds } = input;
  const runRoot = mkdtempSync(join(tmpdir(), 'r3l0cia-f1-'));
  try {
    const schedule = falsifierSchedule();
    const launch = async () => ADMITTED_BASE;
    const validityGate = async () => ({ green: true });
    const first = await legacyActivate({ runRoot, prehistory, trajectoryIds, runId: 'f1', schedule, launch, validityGate });
    const before = digestRunRootState(runRoot, trajectoryIds);
    const firstEvidence = evidenceState(runRoot);
    const second = await legacyActivate({ runRoot, prehistory, trajectoryIds, runId: 'f1', schedule, launch, validityGate });
    const after = digestRunRootState(runRoot, trajectoryIds);
    const secondEvidence = evidenceState(runRoot);
    const changed = before.digest !== after.digest;
    /** The specific loss: evidence that existed after the first run and no longer carries the same bytes. */
    const evidenceRewritten = Object.keys(firstEvidence).filter((name) => firstEvidence[name] !== secondEvidence[name]);
    return Object.freeze({
      id: 'F1_REPLAY_BEFORE_CLAIM',
      property: 'a replayed invocation is refused before any protected state changes',
      firstRunTerminal: first.run?.terminalState ?? null,
      secondRunRefused: second.claimOutcome.refused === true,
      secondRunVerdict: second.claimOutcome.verdict,
      secondRunTerminal: second.run?.terminalState ?? null,
      secondRunLaunchedSessions: second.run?.launches?.length ?? null,
      stateDigestBefore: before.digest,
      stateDigestAfter: after.digest,
      stateChangedBeforeRefusal: changed,
      firstRunEvidence: Object.freeze(firstEvidence),
      secondRunEvidence: Object.freeze(secondEvidence),
      evidenceRewritten: Object.freeze(evidenceRewritten),
      addedFiles: Object.freeze(after.files.filter((path) => before.files.includes(path) === false).slice(0, 12)),
      modifiedFiles: Object.freeze(after.files.filter((path) => before.files.includes(path) === true && before.digests[path] !== after.digests[path]).slice(0, 12)),
      PROPERTY_VIOLATED_BY_BASELINE: changed || second.claimOutcome.refused !== true,
      detail: changed
        ? `the baseline REWROTE ${String(evidenceRewritten.length)} preserved evidence artifact(s) [${evidenceRewritten.join(', ')}] and did NOT refuse the replay (verdict ${second.claimOutcome.verdict}); the destructive preparation runs before the guard that would have read that evidence`
        : 'no state change was observed before the refusal',
    });
  } finally {
    try { rmSync(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/**
 * The digests of the run root's OWN evidence artifacts, so a falsifier can name what a replay destroyed rather
 * than reporting an aggregate that moved.
 */
function evidenceState(runRoot) {
  const names = ['run-claim.json', 'generation-journal.jsonl', 'abort-manifest.json', 'evidence-index.json', 'PRESERVE'];
  const found = {};
  for (const name of names) {
    const path = join(runRoot, name);
    found[name] = existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16) : 'ABSENT';
  }
  return found;
}

/**
 * F2 — OWN WORLD PROTECTED.
 *
 * THE PROPERTY: for each trajectory, its OWN world is never in its own protected roots, and all seven siblings
 * are.
 */
export async function falsifyF2(input) {
  const { runRoot, trajectoryIds } = input;
  const measured = await legacyProtectedRoots(runRoot, trajectoryIds);
  const ownWorldProtectedCount = measured.trajectoriesWithOwnWorldProtected.length;
  return Object.freeze({
    id: 'F2_OWN_WORLD_PROTECTED',
    property: "a trajectory's own world is never in its own protected roots",
    callerArgumentCount: measured.callerArguments.length,
    currentTrajectoryIdArgument: measured.currentTrajectoryIdArgument,
    roots: measured.roots,
    rootCount: measured.rootCount,
    perTrajectory: measured.perTrajectory,
    trajectoriesWithOwnWorldProtected: measured.trajectoriesWithOwnWorldProtected,
    ownWorldProtectedCount,
    PROPERTY_VIOLATED_BY_BASELINE: ownWorldProtectedCount > 0,
    detail: ownWorldProtectedCount > 0
      ? `all ${String(ownWorldProtectedCount)} of ${String(trajectoryIds.length)} trajectories have their OWN world in their own protected set, because the baseline passes no currentTrajectoryId`
      : 'no trajectory had its own world protected',
  });
}

/**
 * F3 — TREATMENT MISMATCH ESCAPED.
 *
 * THE PROPERTY: an observed consumer-visible set that differs from the frozen expectation in identity, kind or
 * count yields TREATMENT_REALIZATION = NOT_APPLIED.
 *
 * THE MEASUREMENT: the frozen contract is asked for its verdict on a report whose consumer boundary carried the
 * WRONG handles, and the baseline's own expression is evaluated on the same report.
 */
export async function falsifyF3(input) {
  const { expectation, observedHandles } = input;
  /** A report shaped exactly as the generation child writes one, with a consumer boundary carrying `observedHandles`. */
  const report = Object.freeze({
    ok: true,
    jobPhase: 'FINISHED',
    attemptId: 'attempt-f3',
    payload: Object.freeze({ handles: observedHandles.map((handle) => ({ handle, kind: kindOfHandle(handle) })), compiledHandleCount: observedHandles.length }),
    governedPulls: Object.freeze([]),
    finalVector: Object.freeze({ failedPrepaidClasses: [], prepaidCoverage: 1 }),
  });
  const measured = await legacyTreatmentMismatch(report, expectation);
  const frozenSaysMismatch = measured.frozenRealization === 'NOT_APPLIED';
  return Object.freeze({
    id: 'F3_TREATMENT_MISMATCH_ESCAPED',
    property: 'a consumer-visible set that differs from the frozen expectation is NOT_APPLIED and TRIAL_INVALID',
    expectedHandles: measured.expectedConsumerVisibleHandles,
    observedHandles: measured.observedConsumerVisibleHandles,
    baselineFieldPresentOnTheRealReport: measured.baselineFieldPresentOnTheRealReport,
    baselineDetectsMismatch: measured.baselineDetectsMismatch,
    frozenRealization: measured.frozenRealization,
    frozenSaysMismatch,
    mismatchEscaped: measured.mismatchEscaped,
    PROPERTY_VIOLATED_BY_BASELINE: frozenSaysMismatch && measured.baselineDetectsMismatch !== true,
    detail: frozenSaysMismatch && measured.baselineDetectsMismatch !== true
      ? 'the frozen contract says NOT_APPLIED while the baseline adapter reads a field the generation child never writes, so it reports no mismatch'
      : 'the baseline and the frozen contract agreed',
  });
}

/**
 * F4 — HOST AUDIT READ AS WORKER UPTAKE.
 *
 * THE PROPERTY: worker uptake comes from the worker's own telemetry; a host audit resolution is never read as a
 * voluntary pull.
 *
 * THE MEASUREMENT: a report whose `governedPulls` are four HOST resolutions, and a transcript whose worker
 * telemetry line reports zero pulls. The baseline counts four; the shipped parser reports zero.
 */
export async function falsifyF4(input) {
  const { expectation, transcriptPath, visibleHandles } = input;
  const report = Object.freeze({
    ok: true,
    jobPhase: 'FINISHED',
    attemptId: 'attempt-f4',
    payload: Object.freeze({ handles: visibleHandles.map((handle) => ({ handle, kind: kindOfHandle(handle) })), compiledHandleCount: visibleHandles.length }),
    /** The baseline's "governed pulls": host-side `controller.fetchContext()` resolutions. */
    governedPulls: Object.freeze(visibleHandles.map((handle, index) => Object.freeze({ handle, resolved: true, bodyBytes: 100 + index, bodyDigest: 'a'.repeat(64) }))),
    finalVector: Object.freeze({ failedPrepaidClasses: [], prepaidCoverage: 1 }),
  });
  const measured = await legacyPullConflation({ report, transcriptPath, expectation });
  return Object.freeze({
    id: 'F4_HOST_AUDIT_AS_WORKER_UPTAKE',
    property: 'Worker uptake is measured from the worker’s own telemetry, never from a host audit',
    visibleHandles: Object.freeze([...visibleHandles]),
    hostResolveAuditCount: measured.hostResolveAuditCount,
    workerPullObservedCount: measured.workerPullObservedCount,
    workerPullObservedHandles: measured.workerPullObservedHandles,
    shippedParserUsed: measured.shippedParserUsed,
    baselineWouldReportUptake: measured.baselineWouldReportUptake,
    actualWorkerUptakeIsZero: measured.actualWorkerUptakeIsZero,
    declinedObservationReachableUnderBaseline: measured.declinedObservationReachableUnderBaseline,
    conflationEscaped: measured.conflationEscaped,
    PROPERTY_VIOLATED_BY_BASELINE: measured.conflationEscaped === true,
    detail: measured.conflationEscaped === true
      ? `the baseline reads ${String(measured.hostResolveAuditCount)} host audit resolutions as governed pulls while the worker's own telemetry reports ${String(measured.workerPullObservedCount)} pulls, so a declined pull is indistinguishable from uptake`
      : 'the two layers agreed, so the conflation was not demonstrated',
  });
}

/**
 * F5 — NO GENUINE PAID MODE.
 *
 * THE PROPERTY: DETERMINISTIC and PRIMARY are explicit, mutually exclusive modes, and PRIMARY resolves the
 * shipped DSH executable.
 */
export async function falsifyF5() {
  const measured = await legacyWorkerSelection();
  return Object.freeze({
    id: 'F5_NO_GENUINE_PAID_MODE',
    property: 'the primary driver can select an actual model worker under an explicit PRIMARY mode',
    baselineWorkerForAnyInput: measured.baselineWorkerForAnyInput,
    baselineIsAScriptedWorker: measured.baselineIsAScriptedWorker,
    inputCanSelectShippedWorker: measured.inputCanSelectShippedWorker,
    primaryWorkerResolved: measured.primaryWorkerResolved,
    PROPERTY_VIOLATED_BY_BASELINE: measured.inputCanSelectShippedWorker !== true,
    detail: 'the baseline driver hardcodes the scripted worker as `realDshBin`, so no input can select a real model worker and nothing in the record names which worker ran',
  });
}

/**
 * F6 — DEFAULT POST-MATRIX GREEN.
 *
 * THE PROPERTY: sixteen structurally admitted sessions with no actual post-matrix validity proof must not return
 * MATRIX_COMPLETE.
 */
export async function falsifyF6(input) {
  const { schedule } = input;
  const measured = legacyDefaultValidityGate({ schedule });
  return Object.freeze({
    id: 'F6_DEFAULT_POST_MATRIX_GREEN',
    property: 'completion requires an actual post-matrix validity proof, not a session count',
    baselineGateSource: measured.baselineGateSource,
    baselineGateGreen: measured.baselineGateGreen,
    requiredBeyondCount: measured.requiredBeyondCount,
    baselineChecksAnyOfThem: measured.baselineChecksAnyOfThem,
    defaultPostMatrixGreen: measured.defaultPostMatrixGreen,
    PROPERTY_VIOLATED_BY_BASELINE: measured.defaultPostMatrixGreen === true,
    detail: 'the baseline default gate is `completed.length === schedule.length` and checks nothing else, so sixteen admitted sessions complete the matrix with no validity proof',
  });
}

/**
 * F7 — CLOSURE NOT ENFORCED AT LAUNCH.
 *
 * THE PROPERTY: an omitted, null or drifted closure digest refuses execution before any launch.
 */
export async function falsifyF7() {
  const measured = await legacyClosureAcceptance({ runId: 'f7', schedule: falsifierSchedule(), launch: async () => ADMITTED_BASE, validityGate: async () => ({ green: true }) });
  return Object.freeze({
    id: 'F7_CLOSURE_NOT_ENFORCED_AT_LAUNCH',
    property: 'an omitted, null or drifted closure digest refuses execution',
    results: measured.results,
    allAccepted: measured.allAccepted,
    PROPERTY_VIOLATED_BY_BASELINE: measured.closureNotEnforcedAtLaunch === true,
    detail: 'the baseline accepts an omitted, a null and a drifted closure digest alike, and records whatever it was given without comparing it to anything',
  });
}

/**
 * F8 — CONFLICTING TIMEOUT BUDGETS.
 *
 * THE PROPERTY: the outer child budget exceeds the worker execution budget plus the settlement interval.
 */
export async function falsifyF8() {
  const measured = await legacyTimeoutBudgets();
  return Object.freeze({
    id: 'F8_CONFLICTING_TIMEOUT_BUDGETS',
    property: 'the outer child budget exceeds the inner worker budget plus the settlement interval',
    outerChildMs: measured.outerChildMs,
    innerWorkerMs: measured.innerWorkerMs,
    outerExpiresFirst: measured.outerExpiresFirst,
    conflictMs: measured.conflictMs,
    requiredOuterMinimum: measured.requiredOuterMinimum,
    baselineDistinguishesUnresolvedExposure: measured.baselineDistinguishesUnresolvedExposure,
    PROPERTY_VIOLATED_BY_BASELINE: measured.outerExpiresFirst === true,
    detail: measured.outerExpiresFirst === true
      ? `the outer budget (${String(measured.outerChildMs)}ms) expires ${String(measured.conflictMs)}ms BEFORE the inner worker budget (${String(measured.innerWorkerMs)}ms), so the harness kills a worker its own port still considers live`
      : 'the budgets did not conflict',
  });
}

/**
 * §1: RUN ALL EIGHT FALSIFIERS AGAINST THE BASELINE.
 *
 * The result is the stage's record of what was wrong, and it is what the repairs are checked against: each entry
 * names the property, and the repaired implementation must satisfy the SAME property.
 */
export async function runEscapedDefectFalsifiers(input) {
  const { prehistory, trajectoryIds, expectation, observedHandles, visibleHandles, transcriptPath, runRoot } = input;
  const schedule = falsifierSchedule();
  const f1 = await falsifyF1({ prehistory, trajectoryIds });
  const f2 = await falsifyF2({ runRoot, trajectoryIds });
  const f3 = await falsifyF3({ expectation, observedHandles });
  const f4 = await falsifyF4({ expectation, transcriptPath, visibleHandles });
  const f5 = await falsifyF5();
  const f6 = await falsifyF6({ schedule });
  const f7 = await falsifyF7();
  const f8 = await falsifyF8();
  const falsifiers = Object.freeze([f1, f2, f3, f4, f5, f6, f7, f8]);
  const violated = falsifiers.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE === true);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'escaped-defect falsifiers against the baseline',
    baseline: 'b6c15e69da3541837a822d4751db50b34794a279',
    falsifiers,
    ESCAPED_DEFECTS_PRESENT: violated.length,
    ALL_EIGHT_VIOLATED_BY_BASELINE: violated.length === falsifiers.length,
    violated: Object.freeze(violated.map((entry) => entry.id)),
    notViolated: Object.freeze(falsifiers.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE !== true).map((entry) => entry.id)),
    modelCallsMade: 0,
    law: 'each falsifier names a property the repaired implementation must satisfy; against the baseline the property is violated',
  });
}

/* ================================================================ the small helpers */

/** The kind a handle names, read from its own namespace rather than assumed. */
function kindOfHandle(handle) {
  if (/@ctx\/proof\//u.test(handle)) return 'proof';
  if (/@ctx\/reasoning\//u.test(handle)) return 'reasoning';
  if (/@ctx\/procedure\//u.test(handle)) return 'procedure';
  return 'unknown';
}

/**
 * A digest over a run root's PROTECTED state: each trajectory's world files, its Git refs and its SQLite bytes.
 *
 * It is deliberately over CONTENT rather than over mtime, because a re-copy that reproduces identical bytes is
 * not the mutation the property forbids — the property is about the run root's state, and identical bytes are
 * the same state. What the F1 measurement must catch is a genuine change, and the file LIST is included so a
 * re-copy that ADDS files is caught even when every pre-existing file is byte-identical.
 */
export function digestRunRootState(runRoot, trajectoryIds) {
  const digests = {};
  const files = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile()) {
        const relative = path.slice(runRoot.length + 1).split('\\').join('/');
        files.push(relative);
        try { digests[relative] = createHash('sha256').update(readFileSync(path)).digest('hex'); } catch { digests[relative] = 'UNREADABLE'; }
      }
    }
  };
  walk(runRoot, 0);
  const material = Object.entries(digests).sort(([left], [right]) => (left < right ? -1 : 1)).map(([path, digest]) => `${path}:${digest}`).join(NL);
  return Object.freeze({
    digest: createHash('sha256').update(material, 'utf8').digest('hex'),
    files: Object.freeze(files.sort()),
    digests: Object.freeze(digests),
    fileCount: files.length,
  });
}

export { NL, readFileSync, tmpdir };
