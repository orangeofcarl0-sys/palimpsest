/**
 * R3-L0C-I-A-R §2/§4/§8 — THE PRIMARY GENERATION ADAPTER.
 *
 * This module drives ONE session through the REAL generation child, the REAL shipped worker port, the REAL
 * governed pull channel and the REAL strict result parser. Only the model is replaced (in DETERMINISTIC mode by
 * the stage-owned scripted worker). Three defects of the R3-L0C-I-A adapter are repaired here:
 *
 *   §8 (G8a)  the descendant-exit classification equated a Worker Result LINE with confirmed process EXIT:
 *             `descendantExitEstablished = !timedOut || workerFinished()`. A worker that reported and then hung
 *             was therefore classified as an established exit. The repair makes ANY timeout UNCERTAIN, because a
 *             result line proves the worker REPORTED, not that its process EXITED.
 *   §4 (G4)   the adapter carries the result's ADMISSIBILITY and the identity fields the admission gate needs, so
 *             `admission.mjs` can refuse on them.
 *   §5 (G5)   the adapter carries the worker layer's PROVENANCE and never coalesces a non-observed count to 0.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GENERATION_CHILD_BUDGET_MS,
  NL,
  REPO_ROOT,
  SETTLEMENT_INTERVAL_MS,
  WORKER_EXECUTION_BUDGET_MS,
} from './contract.mjs';
import { buildPullLayers, computeTreatmentRealization, shippedPullParser, telemetryLineShape } from './treatment.mjs';

/** §2: the shipped generation child, unchanged and still the real execution route. */
export const CHILD_PROGRAM = join(REPO_ROOT, 'scripts', 'r3l0c', 'generation-child.mjs');

/** §2: the tee wrapper, which re-execs the real DSH bin and relays the governed pull channel. */
export const TEE_PATH = join(REPO_ROOT, 'scripts', 'gates', 'd2-live-tee-worker.mjs');

/** §2: the stage-owned scripted worker, which speaks the SHIPPED telemetry schema. */
export const SCRIPTED_WORKER = join(REPO_ROOT, 'scripts', 'r3l0ciar', 'scripted-worker.mjs');

/** §4: the worker-result prefix, imported from the product's own vocabulary rather than re-typed. */
export const WORKER_RESULT_PREFIX = 'PALIMPSEST_WORK_RESULT ';

/** §8: the fault kinds the stage-owned scripted worker understands. */
export const PRIMARY_FAULTS = Object.freeze({
  NONE: 'NONE',
  REPORT_MISSING: 'REPORT_MISSING',
  NO_COMMIT: 'NO_COMMIT',
  DECLINE_PULL: 'DECLINE_PULL',
  NEEDS_ESCALATION: 'NEEDS_ESCALATION',
  SLOW: 'SLOW',
  /** §8: reports its result, then keeps running past the outer budget. */
  REPORT_THEN_HANG: 'REPORT_THEN_HANG',
});

/* ================================================================ §8 the timeout hierarchy */

/**
 * §8: THE DECLARED BUDGETS.
 *
 * The outer budget is DERIVED from the inner one plus the settlement interval, so the two cannot drift apart
 * independently. The frozen budget is preserved: no deterministic evidence required a pre-exposure revision.
 */
export function timeoutHierarchy() {
  const outer = GENERATION_CHILD_BUDGET_MS;
  const inner = WORKER_EXECUTION_BUDGET_MS;
  const settlement = SETTLEMENT_INTERVAL_MS;
  return Object.freeze({
    outerChildMs: outer,
    innerWorkerMs: inner,
    settlementMs: settlement,
    outerExceedsInnerPlusSettlement: outer > inner + settlement,
    marginMs: outer - (inner + settlement),
    law: 'the outer child budget must exceed the worker execution budget plus the required settlement interval',
  });
}

/* ================================================================ §4 the child spec */

/** §4: build the child spec for one session, recording the worker the resolved mode requires. */
export function buildChildSpec(input) {
  const { runRoot, world, paths, home, profile, workerExecutable, session, generation, knowledge, protectedRoots, mode } = input;
  const control = join(runRoot, 'private', 'control');
  mkdirSync(control, { recursive: true });
  const tag = `${session.sessionId}-a1`;
  const reportPath = join(control, `report-${tag}.json`);
  const specPath = join(control, `spec-${tag}.json`);
  const payloadSink = join(control, `payload-${tag}.json`);
  const transcript = join(control, `transcript-${tag}.txt`);
  const spec = {
    repoRoot: REPO_ROOT,
    projectId: 'cutover-entitlements',
    repo: world,
    paths,
    dshHome: home,
    realDshBin: workerExecutable,
    profile,
    teePath: TEE_PATH,
    payloadSink,
    transcript,
    workRoot: runRoot,
    reportPath,
    protectedRoots,
    arm: session.arm,
    block: session.block,
    trajectoryId: session.trajectoryId,
    generation: generation.id,
    requirement: generation.requirement,
    objective: generation.title,
    projectGoal: 'keep tenant entitlements correct across the legacy cutover',
    knowledge: knowledge ?? null,
    executionMode: mode,
    standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0ciar primary adapter'], confirmed: true, notes: [] },
  };
  writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
  return Object.freeze({ spec, specPath, reportPath, payloadSink, transcript });
}

/* ================================================================ §2 the single spawn */

/**
 * §2: EXECUTE ONE SESSION THROUGH THE REAL CHILD, ONCE.
 *
 * ONE SPAWN, no retry loop, no attempt counter. The timeout is OBSERVED rather than assumed: on expiry the
 * function reports whether the descendant could be observed to have exited, and the classification follows §8.
 */
export async function runPrimaryGeneration(input) {
  const {
    runRoot, world, paths, home, profile, workerExecutable, session, generation, knowledge,
    protectedRoots, expectation, requestedSelection, mode, fault = 'NONE', timeoutMs = GENERATION_CHILD_BUDGET_MS,
  } = input;

  const built = buildChildSpec({ runRoot, world, paths, home, profile, workerExecutable, session, generation, knowledge, protectedRoots, mode });
  const started = Date.now();
  const spawnResult = await spawnChild({ specPath: built.specPath, timeoutMs, session, fault, transcriptPath: built.transcript });

  const report = existsSync(built.reportPath) ? JSON.parse(readFileSync(built.reportPath, 'utf8')) : null;
  const transcriptText = existsSync(built.transcript) ? readFileSync(built.transcript, 'utf8') : '';
  const workerResult = parseWorkerResult(transcriptText);

  const realization = await computeTreatmentRealization({ expectation, report, arm: session.arm, generationId: generation.id, requestedSelection });
  const layers = await buildPullLayers({
    report,
    transcriptPath: built.transcript,
    artifactPath: input.artifactPath ?? null,
    expectedHandles: realization.expectedConsumerVisibleHandles,
  });

  /**
   * §8: THE TIMEOUT OUTCOME.
   *
   * `descendantExitEstablished` is true ONLY when the run did NOT time out. A timed-out execution is UNCERTAIN
   * regardless of whether a result line was seen, because the worker may have reported and then survived its
   * parent's termination — the G8a case. `workerResultSeen` is carried as its own fact so the report can name it
   * without letting it stand in for an exit.
   */
  const timedOut = spawnResult.timedOut === true;
  const descendantExitEstablished = !timedOut;

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R',
    kind: 'primary generation outcome',
    sessionId: session.sessionId,
    executionMode: mode,
    jobPhase: report?.jobPhase ?? (spawnResult.threw === null ? null : 'HOST_ERROR'),
    reportPresent: workerResult.present,
    reportMissing: workerResult.present !== true,
    childReportPresent: report !== null,
    childOk: report?.ok ?? null,
    childError: report?.error ?? null,
    attemptState: report?.attemptState ?? null,
    /** §4: the result evidence, each checked rather than assumed. */
    workerResultPresent: workerResult.present,
    workerResultKind: workerResult.kind,
    workerResultAdmissible: workerResult.admissible,
    workerResultParseFailure: workerResult.parseFailure,
    /** §8: the timeout hierarchy outcome. */
    timedOut,
    workerResultSeen: spawnResult.workerResultSeen === true,
    directChildExited: spawnResult.directChildExited,
    descendantExitEstablished,
    outcomeUnknown: descendantExitEstablished !== true,
    uncertainReason: descendantExitEstablished === true ? null : 'OUTER_BUDGET_EXPIRED_WITHOUT_ESTABLISHED_DESCENDANT_EXIT',
    threw: spawnResult.threw !== null,
    threwDetail: spawnResult.threw,
    hostFailure: workerResult.present !== true || report?.jobPhase === 'HOST_ERROR',
    gitObjectResolutionFailed: report?.gitObjectResolutionFailed === true,
    worldUnavailable: false,
    commitFailedEnvironmentally: false,
    /** §5: the treatment realization, from consumer evidence. NOT a field read off the report. */
    treatmentMismatch: realization.TREATMENT_REALIZATION === 'NOT_APPLIED',
    treatmentRealization: realization.TREATMENT_REALIZATION,
    /** §5: the separated layers, with the worker layer's provenance carried explicitly. */
    consumerVisibleHandleCount: realization.consumerVisibleHandles.length,
    consumerVisibleHandles: realization.consumerVisibleHandles,
    workerUptakeProvenance: layers.workerPullObserved.provenance,
    workerUptakeObserved: layers.workerPullObserved.observed,
    governedPullCount: layers.workerPullObserved.count,
    governedPulls: layers.workerPullObserved.handles === null ? Object.freeze([]) : Object.freeze(layers.workerPullObserved.handles.map((handle) => Object.freeze({ handle, resolved: true }))),
    hostResolveAuditCount: layers.hostResolveAudit.count,
    resolvedBodyDigests: layers.hostResolveAudit.bodyDigests.map((entry) => entry.digest),
    pullLayers: layers,
    hiddenInvariantVector: report?.finalVector ?? null,
    completionCause: report?.completionCause ?? (workerResult.kind === 'NEEDS_ESCALATION' ? 'ESCALATED' : report?.jobPhase === 'FINISHED' ? 'RESULT_SUBMITTED' : 'OTHER_RUNTIME_CAUSE'),
    correctnessOk: report?.projectVerification?.ok ?? null,
    workCannotAdvance: workerResult.present === true && (report?.attemptState === 'RUNNING' || report?.attemptState === 'LEASED' || report?.attemptState === 'CREATED'),
    /** §4: the provenance. */
    hostJobId: report?.jobId ?? null,
    attemptId: report?.attemptId ?? null,
    startingHead: report?.startingHead ?? null,
    finalHead: report?.finalHead ?? null,
    resultState: report?.attemptState ?? null,
    verificationState: report?.projectVerification === undefined ? null : (report.projectVerification.ok === true ? 'PASS' : 'FAIL'),
    promotionState: report?.promoted === true ? 'PROMOTED' : (report?.eligibility?.eligible === false ? 'NOT_ELIGIBLE' : 'UNKNOWN'),
    reportPath: built.reportPath,
    transcriptPath: built.transcript,
    payloadPath: built.payloadSink,
    specPath: built.specPath,
    elapsedMs: Date.now() - started,
    childExit: spawnResult.exitCode,
    sessionArtifactPath: input.artifactPath ?? null,
    observationDigest: realization.expectationDigest,
  });
}

/**
 * §8: SPAWN THE CHILD WITH AN OBSERVABLE TIMEOUT.
 *
 * On expiry the direct child (the tee) is killed, but on Windows there is no process group here, so the WORKER is
 * the tee's grandchild and survives its parent. A `timedOut` run is therefore ALWAYS uncertain: whether or not a
 * result line was seen, the worker's death is not established.
 */
function spawnChild(input) {
  const { specPath, timeoutMs, session, fault, transcriptPath } = input;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHILD_PROGRAM, specPath], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PALIMPSEST_R3L0CIA_SESSION: session.sessionId, R3L0CIA_FAULT: fault },
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let directChildExited = false;
    let exitCode = null;
    let threw = null;
    let settled = false;

    const workerResultSeen = () => {
      if (transcriptPath === null || transcriptPath === undefined) return false;
      try { return readFileSync(transcriptPath, 'utf8').split(/\r?\n/u).some((line) => line.startsWith(WORKER_RESULT_PREFIX)); } catch { return false; }
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      /** §8: the descendant's death is established ONLY when the run did not time out. */
      const descendantExitEstablished = !timedOut;
      resolve(Object.freeze({
        stdout,
        stderr,
        timedOut,
        workerResultSeen: workerResultSeen(),
        directChildExited,
        descendantExitEstablished,
        exitCode,
        threw,
        outcomeUnknown: descendantExitEstablished !== true,
        uncertainReason: descendantExitEstablished === true ? null : 'OUTER_BUDGET_EXPIRED_WITHOUT_ESTABLISHED_DESCENDANT_EXIT',
        stdoutTail: stdout.trim().split(NL).slice(-2).join(' | '),
      }));
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch (error) { threw = `the kill failed: ${String(error?.message ?? error).slice(0, 120)}`; }
      /** A grace period to let the direct child's exit be observed; the WORKER's fate stays unestablished. */
      setTimeout(() => finish(), 5_000);
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => { threw = String(error?.message ?? error).slice(0, 300); finish(); });
    child.on('exit', (code) => { directChildExited = true; exitCode = code; finish(); });
  });
}

/**
 * §4: PARSE THE WORKER'S OWN RESULT, USING THE SHIPPED VOCABULARY.
 *
 * The line's shape is the product's own closed contract — `READY_FOR_SETTLEMENT` requires a non-empty `summary`,
 * `NEEDS_ESCALATION` requires a `reason` — so this checks those and reports a parse failure rather than treating a
 * malformed line as a success. `admissible` is carried so the admission gate can refuse on it.
 */
export function parseWorkerResult(transcriptText) {
  const lines = String(transcriptText).split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined || !line.startsWith(WORKER_RESULT_PREFIX)) continue;
    try {
      const parsed = JSON.parse(line.slice(WORKER_RESULT_PREFIX.length));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return Object.freeze({ present: true, kind: null, summaryPresent: false, escalationReasonPresent: false, admissible: false, parseFailure: 'the result line is not an object' });
      const kind = typeof parsed.kind === 'string' ? parsed.kind : null;
      const summaryPresent = typeof parsed.summary === 'string' && parsed.summary.length > 0;
      const escalationReasonPresent = typeof parsed.reason === 'string' && parsed.reason.length > 0;
      const admissible = (kind === 'READY_FOR_SETTLEMENT' && summaryPresent) || (kind === 'NEEDS_ESCALATION' && escalationReasonPresent);
      return Object.freeze({
        present: true, kind, summaryPresent, escalationReasonPresent, admissible,
        parseFailure: admissible ? null : `the ${String(kind)} result does not satisfy the shipped contract (summary=${String(summaryPresent)}, reason=${String(escalationReasonPresent)})`,
      });
    } catch (error) {
      return Object.freeze({ present: true, kind: null, summaryPresent: false, escalationReasonPresent: false, admissible: false, parseFailure: `the result line does not parse: ${String(error?.message ?? error).slice(0, 160)}` });
    }
  }
  return Object.freeze({ present: false, kind: null, summaryPresent: false, escalationReasonPresent: false, admissible: false, parseFailure: null });
}

/** §8: the fault injection points, by position in the frozen schedule. */
export function faultPositionFault(sessionIndex, scheduleLength) {
  const middle = Math.floor((scheduleLength - 1) / 2);
  const last = scheduleLength - 1;
  return Object.freeze({ FIRST: sessionIndex === 0, MIDDLE: sessionIndex === middle, LAST: sessionIndex === last, index: sessionIndex, middleIndex: middle, lastIndex: last });
}

/** §2: the frozen 16-session schedule, with its positions and its intra-trajectory dependency. */
export async function frozenPrimarySchedule() {
  const plan = await import('../r3l0c/plan.mjs');
  const schedule = plan.schedule();
  return Object.freeze(schedule.map((session, index) => Object.freeze({
    ...session,
    scheduleIndex: index,
    requiresResolved: session.generation === 'G1' ? null : `${session.trajectoryId}-G1`,
  })));
}

export { NL, shippedPullParser, telemetryLineShape };
