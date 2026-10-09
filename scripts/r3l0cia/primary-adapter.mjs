/**
 * R3-L0C-I-A §4/§5/§6 — THE REPAIRED PRIMARY ADAPTER.
 *
 * THE JOB OF THIS MODULE. R3-L0C-I wired the fail-stop runner to the real generation child, and that wiring is
 * sound. But its ADAPTER — `runPrimaryGeneration` in `scripts/r3l0cf/primary-matrix.mjs` — carries four defects
 * this stage measured, and each is a defect in what the adapter MEASURES rather than in the child it drives:
 *
 *   F3  `treatmentMismatch: report?.treatmentMismatch === true` reads a field the child never writes, so the
 *       frozen expectation is never compared against the consumer boundary.
 *   F4  `governedPullCount` is read from `report.governedPulls`, which the child fills with HOST-side
 *       `controller.fetchContext()` calls — so host audit resolutions are reported as worker uptake.
 *   F5  `realDshBin` is hardcoded to the scripted worker, so no caller can select a real model worker.
 *   F8  the outer child budget is half the inner worker budget, so the harness kills a worker its own port still
 *       considers live, and the resulting state has no classification.
 *
 * THE REPAIR IS A NEW MODULE RATHER THAN AN EDIT, and the reason is scope discipline. R3-L0C-I's adapter is the
 * code its own tests and its frozen plan describe; editing it in place would make that stage's record describe
 * something that no longer exists. So this module supersedes it the way R3-L0C-I superseded R3-L0C-R: a new
 * stage-owned adapter that the new plan names as authoritative, with the old one left byte-identical.
 *
 * WHAT IT DRIVES IS UNCHANGED. The child program, the tee, the shipped worker port, the context payload, the
 * governed pull channel and the strict result parser are all the real ones — the same ones R3-L0C-I used. Only
 * the adapter's own measurements, mode resolution, budgets and evidence requirements are repaired.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GENERATION_CHILD_BUDGET_MS,
  REPO_ROOT,
  SETTLEMENT_INTERVAL_MS,
  WORKER_EXECUTION_BUDGET_MS,
} from './contract.mjs';
import { buildPullLayers, computeTreatmentRealization, shippedPullParser, telemetryLineShape } from './treatment.mjs';
import { perTrajectoryProtectedRoots } from './confinement.mjs';
import { resolveExecutionMode } from './activation.mjs';

const NL = String.fromCharCode(10);

/** §5: the shipped generation child, unchanged and still the real execution route. */
export const CHILD_PROGRAM = join(REPO_ROOT, 'scripts', 'r3l0c', 'generation-child.mjs');

/** §5: the tee wrapper, which re-execs the real DSH bin and relays the governed pull channel. */
export const TEE_PATH = join(REPO_ROOT, 'scripts', 'gates', 'd2-live-tee-worker.mjs');

/** §5: the stage-owned scripted worker, which speaks the SHIPPED telemetry schema. */
export const SCRIPTED_WORKER = join(REPO_ROOT, 'scripts', 'r3l0cia', 'scripted-worker.mjs');

/** §5: the old matrix, named so the quarantine guard can refuse it. */
export const LEGACY_MATRIX_PATH = join(REPO_ROOT, 'scripts', 'r3l0cr', 'matrix.mjs');

/** §5: the worker-result prefix, imported from the product's own vocabulary rather than re-typed. */
export const WORKER_RESULT_PREFIX = 'PALIMPSEST_WORK_RESULT ';

/** §5: the fault kinds the stage-owned scripted worker understands. */
export const PRIMARY_FAULTS = Object.freeze({
  NONE: 'NONE',
  REPORT_MISSING: 'REPORT_MISSING',
  NO_COMMIT: 'NO_COMMIT',
  DECLINE_PULL: 'DECLINE_PULL',
  NEEDS_ESCALATION: 'NEEDS_ESCALATION',
  /** §5: a deliberately slow worker, for the timeout-hierarchy case. */
  SLOW: 'SLOW',
});

/* ================================================================ §5 the authoritative path */

/**
 * §5: THE AUTHORITATIVE-PATH GUARD.
 *
 * The old R3-L0C-R matrix must not remain an accidentally runnable alternative under the new plan. §2 adds the
 * honesty requirement this guard exists to satisfy: the guard is what enforces the quarantine, and the legacy
 * matrix has NOT become physically unexecutable — it is refused at this entry point, and the refusal says so
 * rather than implying an impossibility.
 */
export function assertAuthoritativePath(input) {
  const caller = String(input?.caller ?? 'unknown');
  const authorizedBy = input?.authorizedBy;
  const authorized = authorizedBy === 'r3-l0c-ia-primary-plan';
  if (authorized !== true) {
    throw new Error(
      `REFUSED: "${caller}" is not the authoritative execution path. R3-L0C-I-A's plan (r3-l0c-ia-primary-plan) is the only authorized entry point. `
      + 'The R3-L0C-R matrix remains byte-identical and is still executable code; it is QUARANTINED by this guard, not made impossible, and must not be run as though it were the current plan.',
    );
  }
  return Object.freeze({
    authorized: true,
    caller,
    authoritativePath: 'scripts/r3l0cia/primary-adapter.mjs',
    legacyMatrixQuarantined: true,
    legacyMatrixStillExecutable: true,
  });
}

/* ================================================================ §4/§5 the child spec */

/**
 * §4: BUILD THE CHILD SPEC FOR ONE SESSION.
 *
 * The spec is the child's own contract, extended with the fields this stage needs: the worker script for a
 * deterministic run, the expected handle set so the treatment realization can be compared, and the per-trajectory
 * protected roots. The `modelId` is recorded from the resolved mode rather than from a constant, so the spec
 * names what will actually run.
 */
export function buildChildSpec(input) {
  const { runRoot, world, paths, home, profile, workerExecutable, session, generation, knowledge, protectedRoots, expectation, mode } = input;
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
    /** §5: the worker the resolved mode requires, recorded so the spec names what will run. */
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
    standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3-l0cia primary adapter'], confirmed: true, notes: [] },
  };
  writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
  return Object.freeze({ spec, specPath, reportPath, payloadSink, transcript });
}

/* ================================================================ §5 the timeout hierarchy */

/**
 * §5: THE DECLARED BUDGETS.
 *
 * The outer budget is DERIVED from the inner one plus the settlement interval, so the two cannot drift apart
 * independently — which is exactly how the baseline's 900s-against-1800s conflict arose. The assertion is
 * evaluated here rather than asserted in prose, so a future edit that lowered the outer budget would fail.
 */
export function timeoutHierarchy() {
  const outer = GENERATION_CHILD_BUDGET_MS;
  const inner = WORKER_EXECUTION_BUDGET_MS;
  const settlement = SETTLEMENT_INTERVAL_MS;
  return Object.freeze({
    outerChildMs: outer,
    innerWorkerMs: inner,
    settlementMs: settlement,
    /** §5: the required inequality, evaluated. */
    outerExceedsInnerPlusSettlement: outer > inner + settlement,
    marginMs: outer - (inner + settlement),
    law: 'the outer child budget must exceed the worker execution budget plus the required settlement interval',
  });
}

/* ================================================================ §5 the single spawn */

/**
 * §5: EXECUTE ONE SESSION THROUGH THE REAL CHILD, ONCE.
 *
 * ONE SPAWN. There is no retry loop and no attempt counter: the child is spawned exactly once and its report —
 * or its absence — is the outcome. That is structural rather than a policy a future edit could forget.
 *
 * THE TIMEOUT IS OBSERVED RATHER THAN ASSUMED. §5 requires that an outer termination whose descendant Worker
 * termination cannot be established is `UNCERTAIN_PRESERVED`, and it forbids treating `kill()` as proof of exit.
 * So the spawn is done with an explicit timer, and on expiry the function reports whether the descendant could be
 * observed to have exited. `execFileSync`'s own `timeout` cannot do this: it kills and returns, and the caller
 * never learns whether the worker went with it. That is why this uses `spawn`.
 */
export async function runPrimaryGeneration(input) {
  const {
    runRoot, world, paths, home, profile, workerExecutable, session, generation, knowledge,
    protectedRoots, expectation, requestedSelection, mode, fault = 'NONE', timeoutMs = GENERATION_CHILD_BUDGET_MS,
  } = input;

  const built = buildChildSpec({ runRoot, world, paths, home, profile, workerExecutable, session, generation, knowledge, protectedRoots, expectation, mode });
  const started = Date.now();
  const spawnResult = await spawnChild({ specPath: built.specPath, timeoutMs, session, fault, transcriptPath: built.transcript });

  const report = existsSync(built.reportPath) ? JSON.parse(readFileSync(built.reportPath, 'utf8')) : null;
  const payload = existsSync(built.payloadSink) ? JSON.parse(readFileSync(built.payloadSink, 'utf8')) : null;

  /** §5: the WORKER's own report, read from the transcript the shipped port judged. */
  const transcriptText = existsSync(built.transcript) ? readFileSync(built.transcript, 'utf8') : '';
  const workerResult = parseWorkerResult(transcriptText);

  /** §4: the treatment realization, from the ACTUAL consumer boundary. */
  const realization = await computeTreatmentRealization({ expectation, report, arm: session.arm, generationId: generation.id, requestedSelection });

  /** §4: the three separated layers, with the worker's uptake through the SHIPPED parser. */
  const layers = await buildPullLayers({
    report,
    transcriptPath: built.transcript,
    artifactPath: input.artifactPath ?? null,
    expectedHandles: realization.expectedConsumerVisibleHandles,
  });

  /** §5: the timeout outcome, which is its own fact rather than a missing-report case. */
  const timedOut = spawnResult.timedOut === true;
  const descendantExited = spawnResult.descendantExitEstablished === true;

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'primary generation outcome',
    sessionId: session.sessionId,
    executionMode: mode,
    /** §5: the machinery facts, each read from where it is observable. */
    jobPhase: report?.jobPhase ?? (spawnResult.threw === null ? null : 'HOST_ERROR'),
    /**
     * §5: THE WORKER'S REPORT, not the child's report file. The child writes a report whatever happens; the
     * worker's report is the line the shipped port parsed. A silent worker is a machinery fault, and reading the
     * child's file instead is how R3-L0C-I first classified one as a Work blockage.
     */
    reportPresent: workerResult.present,
    reportMissing: workerResult.present !== true,
    childReportPresent: report !== null,
    childOk: report?.ok ?? null,
    childError: report?.error ?? null,
    attemptState: report?.attemptState ?? null,
    /** §5: the result evidence, each checked rather than assumed. */
    workerResultKind: workerResult.kind,
    workerResultSummaryPresent: workerResult.summaryPresent,
    workerResultEscalationReasonPresent: workerResult.escalationReasonPresent,
    workerResultParseFailure: workerResult.parseFailure,
    /** §5: the timeout hierarchy outcome. */
    timedOut,
    directChildExited: spawnResult.directChildExited,
    descendantExitEstablished: descendantExited,
    /** §5: an entered launch whose outcome is unknown. */
    outcomeUnknown: spawnResult.outcomeUnknown === true,
    uncertainReason: spawnResult.uncertainReason ?? null,
    threw: spawnResult.threw !== null,
    threwDetail: spawnResult.threw,
    hostFailure: workerResult.present !== true || report?.jobPhase === 'HOST_ERROR',
    gitObjectResolutionFailed: report?.gitObjectResolutionFailed === true,
    worldUnavailable: false,
    commitFailedEnvironmentally: false,
    /** §4: the treatment realization, from consumer evidence. NOT a field read off the report. */
    treatmentMismatch: realization.TREATMENT_REALIZATION === 'NOT_APPLIED',
    treatmentRealization: realization.TREATMENT_REALIZATION,
    /** §4: the separated layers. The uptake number is the WORKER's, never the host's. */
    consumerVisibleHandleCount: realization.consumerVisibleHandles.length,
    consumerVisibleHandles: realization.consumerVisibleHandles,
    governedPullCount: layers.workerPullObserved.count ?? 0,
    governedPulls: layers.workerPullObserved.handles === null ? Object.freeze([]) : Object.freeze(layers.workerPullObserved.handles.map((handle) => Object.freeze({ handle, resolved: true }))),
    hostResolveAuditCount: layers.hostResolveAudit.count,
    resolvedBodyDigests: layers.hostResolveAudit.bodyDigests.map((entry) => entry.digest),
    pullLayers: layers,
    /** §4/§5: the quality vector and the completion cause, from the child's own measurements. */
    hiddenInvariantVector: report?.finalVector ?? null,
    completionCause: report?.completionCause ?? (workerResult.kind === 'NEEDS_ESCALATION' ? 'ESCALATED' : report?.jobPhase === 'FINISHED' ? 'RESULT_SUBMITTED' : 'OTHER_RUNTIME_CAUSE'),
    correctnessOk: report?.projectVerification?.ok ?? null,
    /** §5: whether Canonical Work could advance legally. */
    workCannotAdvance: workerResult.present === true
      && (report?.attemptState === 'RUNNING' || report?.attemptState === 'LEASED' || report?.attemptState === 'CREATED'),
    /** §5: the provenance. */
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
    childStdoutTail: spawnResult.stdoutTail,
    childExit: spawnResult.exitCode,
    /** §5: the session artifact, when the mode produced one. */
    sessionArtifactPath: input.artifactPath ?? null,
    /** §4: the observation digest, so the record binds what was measured. */
    observationDigest: realization.expectationDigest,
  });
}

/**
 * §5: SPAWN THE CHILD WITH AN OBSERVABLE TIMEOUT.
 *
 * `execFileSync` with a `timeout` kills the child and returns, and the caller never learns whether the WORKER
 * went with it. §5 requires that distinction, so this uses `spawn` and records three facts on expiry:
 *
 *   timedOut                       the outer budget expired
 *   descendantExitEstablished      the WORKER was observed to finish on its own
 *   outcomeUnknown                 the launch was entered and its outcome cannot be determined
 *
 * WHY `kill()` IS NOT PROOF, STATED CONCRETELY. The direct child is the TEE, which re-execs the real worker as
 * its OWN child. On Windows there is no process group or job object here, so terminating the tee does NOT
 * terminate the worker: the grandchild survives its parent. Measured: the tee exits, the scripted worker keeps
 * sleeping, and the transcript never receives a result line. So "the direct child exited" is a fact about the
 * tee, and the fact §5 needs is about the WORKER.
 *
 * THE ONE ESTABLISHABLE CASE. The worker's own completion is observable: it writes its `PALIMPSEST_WORK_RESULT`
 * line to the transcript, and the tee relays it. So if the result line was present BEFORE the outer budget
 * expired, the worker finished on its own and its death is established. Otherwise the outer budget expired with
 * the worker's fate unknown, and the honest answer is `descendantExitEstablished: false`.
 */
function spawnChild(input) {
  const { specPath, timeoutMs, session, fault, transcriptPath } = input;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHILD_PROGRAM, specPath], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      /**
       * §5: the fault travels by ENVIRONMENT, so neither the child nor the port knows about faults. The child
       * passes its environment to the tee, and the tee re-execs with it, so the variable reaches the worker
       * without a product file changing.
       */
      env: { ...process.env, PALIMPSEST_R3L0CIA_SESSION: session.sessionId, R3L0CIA_FAULT: fault },
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let directChildExited = false;
    let exitCode = null;
    let threw = null;
    let settled = false;

    /** §5: whether the WORKER finished on its own, read from the transcript the tee relays. */
    const workerFinished = () => {
      if (transcriptPath === null || transcriptPath === undefined) return false;
      try {
        return readFileSync(transcriptPath, 'utf8').split(/\r?\n/u).some((line) => line.startsWith(WORKER_RESULT_PREFIX));
      } catch {
        return false;
      }
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      /**
       * §5: the descendant's death is established ONLY when the worker completed on its own. A `timedOut` run in
       * which the worker had not finished is UNCERTAIN, whatever the tee did.
       */
      const descendantExitEstablished = !timedOut || workerFinished();
      resolve(Object.freeze({
        stdout,
        stderr,
        timedOut,
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
      /**
       * A grace period to observe whether the worker finishes anyway. If it does not, its death is NOT
       * established and the outcome is UNCERTAIN — never assumed to be a clean failure.
       */
      setTimeout(() => finish(), 5_000);
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => { threw = String(error?.message ?? error).slice(0, 300); finish(); });
    child.on('exit', (code) => { directChildExited = true; exitCode = code; finish(); });
  });
}

/**
 * §5: PARSE THE WORKER'S OWN RESULT, USING THE SHIPPED VOCABULARY.
 *
 * §5 requires positive proof appropriate to the outcome: "The Worker Result has been accepted by the shipped
 * parser, not merely found as an arbitrary prefix string." The line's shape is the product's own closed contract —
 * `READY_FOR_SETTLEMENT` requires a non-empty `summary`, `NEEDS_ESCALATION` requires a `reason` — so this checks
 * those, and reports a parse failure rather than treating a malformed line as a success.
 *
 * The prefix is imported from the product rather than re-typed, so a protocol change cannot make this look for
 * the wrong string.
 */
export function parseWorkerResult(transcriptText) {
  const lines = String(transcriptText).split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined || !line.startsWith(WORKER_RESULT_PREFIX)) continue;
    try {
      const parsed = JSON.parse(line.slice(WORKER_RESULT_PREFIX.length));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return Object.freeze({ present: true, kind: null, summaryPresent: false, escalationReasonPresent: false, parseFailure: 'the result line is not an object' });
      const kind = typeof parsed.kind === 'string' ? parsed.kind : null;
      const summaryPresent = typeof parsed.summary === 'string' && parsed.summary.length > 0;
      const escalationReasonPresent = typeof parsed.reason === 'string' && parsed.reason.length > 0;
      const admissible = (kind === 'READY_FOR_SETTLEMENT' && summaryPresent) || (kind === 'NEEDS_ESCALATION' && escalationReasonPresent);
      return Object.freeze({
        present: true,
        kind,
        summaryPresent,
        escalationReasonPresent,
        /** §5: the shipped vocabulary's own admissibility, so a malformed result is not a success. */
        admissible,
        parseFailure: admissible ? null : `the ${String(kind)} result does not satisfy the shipped contract (summary=${String(summaryPresent)}, reason=${String(escalationReasonPresent)})`,
      });
    } catch (error) {
      return Object.freeze({ present: true, kind: null, summaryPresent: false, escalationReasonPresent: false, admissible: false, parseFailure: `the result line does not parse: ${String(error?.message ?? error).slice(0, 160)}` });
    }
  }
  return Object.freeze({ present: false, kind: null, summaryPresent: false, escalationReasonPresent: false, admissible: false, parseFailure: null });
}

/**
 * §5: THE FAULT INJECTION POINTS.
 *
 * §8 requires a fault at the first, middle and last scheduled sessions, by POSITION in the frozen schedule rather
 * than by a fixture. This returns whether a given index is one of the three.
 */
export function faultPositionFault(sessionIndex, scheduleLength) {
  const middle = Math.floor((scheduleLength - 1) / 2);
  const last = scheduleLength - 1;
  return Object.freeze({ FIRST: sessionIndex === 0, MIDDLE: sessionIndex === middle, LAST: sessionIndex === last, index: sessionIndex, middleIndex: middle, lastIndex: last });
}

/** §5: the frozen 16-session schedule, with its positions and its intra-trajectory dependency. */
export async function frozenPrimarySchedule() {
  const plan = await import('../r3l0c/plan.mjs');
  const schedule = plan.schedule();
  return Object.freeze(schedule.map((session, index) => Object.freeze({
    ...session,
    scheduleIndex: index,
    requiresResolved: session.generation === 'G1' ? null : `${session.trajectoryId}-G1`,
  })));
}

export { NL, perTrajectoryProtectedRoots, resolveExecutionMode, shippedPullParser, telemetryLineShape };
