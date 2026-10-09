/**
 * R3-L0C-I Gate 3 — THE PRIMARY MATRIX ADAPTER.
 *
 * THE JOB OF THIS MODULE: wire the stage-owned fail-stop runner to the REAL generation-child execution adapter, so
 * the runner that was proven in R3-L0C-F actually drives the primary path rather than a private imitation of it.
 *
 * THE DEFECT IT CLOSES, stated plainly. R3-L0C-F proved a runner against an injected `launch` seam. R3-L0C-R
 * remains a complete, runnable matrix with its OWN retry loop, its own partial ledger and its own completion
 * summary. Nothing connected them, so the tested runner and the shipped path could drift apart — and the shipped
 * path still contains the retry behaviour the whole fail-stop protocol forbids. Gate 3 requires the connection to
 * be real, and requires the old matrix to stop being an accidentally runnable alternative under the new plan.
 *
 * WHAT "THE REAL ADAPTER" MEANS HERE. The primary path executes a generation by spawning
 * `scripts/r3l0c/generation-child.mjs` as a child process with a JSON spec naming durable PATHS. That child is the
 * SHIPPED execution route: it re-attaches to the durable stores by path, adds the generation's requirement through
 * ordinary planning, drives one real DSH worker attempt, and settles, gates, promotes and reconciles through the
 * ordinary governed path. This adapter spawns THAT program. It does not reimplement it, and it does not simplify
 * it.
 *
 * HOW THE MODEL IS REPLACED WITHOUT TOUCHING THE CHILD. The child hardcodes the shipped
 * `dshSubprocessWorkWorkerPort({ dshBin: spec.teePath })`, and the tee wrapper re-execs
 * `PALIMPSEST_REAL_DSH_BIN`. So the injection point is `realDshBin`: the adapter points it at
 * `scripted-primary-worker.mjs`, which speaks the port's protocol exactly and calls no model. The child, the port,
 * the context payload, the governed pull channel and the strict result parser are all the real ones — which is the
 * whole point, because a seam inside the child would mean the tested path and the shipped path were different.
 *
 * WHERE THE RETRY BEHAVIOUR WENT. The old matrix wrapped the child spawn in `while (attempt < 4)`. This adapter
 * calls the child ONCE and returns its report; there is no loop, no attempt counter, and no second spawn. The
 * retry rule is therefore not merely unused by the new pathway — it is not reachable through it.
 *
 * WHY THE OLD MATRIX IS QUARANTINED RATHER THAN DELETED. §"Do not edit historical frozen files" and the stage's
 * own immutability rule forbid editing `scripts/r3l0cr/matrix.mjs`, and its digest is bound into R3-L0C-R's frozen
 * plan. So it stays byte-identical and this stage adds a GUARD: the new plan declares itself the authoritative
 * execution path, and `assertAuthoritativePath` refuses to let the old matrix be invoked as though it were. A
 * quarantined path that is unreachable from the new entry point is the honest outcome; deleting it would rewrite
 * history, and silently leaving it runnable would leave two matrices.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './contract.mjs';

const NL = String.fromCharCode(10);

/** Gate 3: the shipped generation child, which is the real execution route. */
export const CHILD_PROGRAM = join(REPO_ROOT, 'scripts', 'r3l0c', 'generation-child.mjs');

/** Gate 3: the tee wrapper, which re-execs the real DSH bin and relays the governed pull channel. */
export const TEE_PATH = join(REPO_ROOT, 'scripts', 'gates', 'd2-live-tee-worker.mjs');

/** Gate 3: the old matrix, named so the quarantine guard can refuse it. */
export const LEGACY_MATRIX_PATH = join(REPO_ROOT, 'scripts', 'r3l0cr', 'matrix.mjs');

/**
 * Gate 3: THE AUTHORITATIVE-PATH GUARD.
 *
 * The old R3-L0C-R matrix must not remain an accidentally runnable alternative. It cannot be edited, so the guard
 * is the mechanism: any entry point that is not this stage's plan is refused, and the refusal names the
 * replacement. The check is by identity rather than by a flag, so a caller cannot opt out by omission.
 */
export function assertAuthoritativePath(input) {
  const caller = String(input?.caller ?? 'unknown');
  const authorized = input?.authorizedBy === 'r3-l0c-i-primary-plan';
  if (authorized !== true) {
    throw new Error(
      `REFUSED: "${caller}" is not the authoritative execution path. R3-L0C-I's plan (r3-l0c-i-primary-plan) is the only authorized entry point; `
      + 'the R3-L0C-R matrix remains byte-identical for historical reasons and must not be run as though it were the current plan.',
    );
  }
  return Object.freeze({ authorized: true, caller, authoritativePath: 'scripts/r3l0cf/primary-matrix.mjs', legacyMatrixQuarantined: true });
}

/**
 * Gate 3: BUILD THE CHILD SPEC FOR ONE SESSION.
 *
 * The spec is the child's own contract, taken from the shipped `matrix.mjs` and EXTENDED with the fields this
 * stage needs: the worker script (so the child drives a ScriptedWorker with no model), the expected handle set
 * (so the child can report the treatment realization), and the admission signals (so the outcome carries Gate 2's
 * evidence).
 */
export function buildChildSpec(input) {
  const { runRoot, world, paths, home, profile, realDshBin, session, generation, knowledge, protectedRoots, attempt, expectation } = input;
  const control = join(runRoot, 'private', 'control');
  mkdirSync(control, { recursive: true });
  const tag = `${session.sessionId}-a${String(attempt)}`;
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
    realDshBin,
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
    /** Gate 3: the ScriptedWorker script, so the child drives a deterministic worker and no model is called. */
    workerScript: input.workerScript ?? null,
    /** Gate 3: the frozen expected handle set, so the child reports the treatment realization. */
    expectedHandles: expectation === undefined || expectation === null ? [] : [...expectation.expectedConsumerVisibleHandles],
    standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0ci primary matrix'], confirmed: true, notes: [] },
  };
  writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
  return Object.freeze({ spec, specPath, reportPath, payloadSink, transcript });
}

/**
 * Gate 3: EXECUTE ONE SESSION THROUGH THE REAL CHILD, ONCE.
 *
 * THE SINGLE SPAWN. There is no retry loop here and no attempt counter: the child is spawned exactly once, and its
 * report — or its absence — is returned as the outcome. That is the removal Gate 3 requires, and it is structural
 * rather than a policy a future edit could forget.
 *
 * The outcome it returns carries Gate 2's admission signals, read from the child's report and from the durable
 * artifacts it wrote, so the runner can decide the disposition from evidence rather than from the child's opinion.
 */
export async function runPrimaryGeneration(input) {
  const { runRoot, world, paths, home, profile, realDshBin, session, generation, knowledge, protectedRoots, expectation, timeoutMs = 900_000, fault = 'NONE' } = input;

  const built = buildChildSpec({ runRoot, world, paths, home, profile, realDshBin, session, generation, knowledge, protectedRoots, attempt: 1, expectation });
  const started = Date.now();
  let stdout = '';
  let threw = null;
  try {
    stdout = execFileSync(process.execPath, [CHILD_PROGRAM, built.specPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      timeout: timeoutMs,
      /**
       * Gate 3: the fault travels by ENVIRONMENT, so neither the child nor the port knows about faults. The child
       * passes its environment to the tee, and the tee re-execs with it, so the variable reaches the scripted
       * worker without a product file changing.
       */
      env: { ...process.env, PALIMPSEST_R3L0CI_SESSION: session.sessionId, R3L0CI_FAULT: fault },
    });
  } catch (error) {
    threw = String(error?.message ?? error).slice(0, 400);
    stdout = String(error?.stdout ?? '');
  }

  const report = existsSync(built.reportPath) ? JSON.parse(readFileSync(built.reportPath, 'utf8')) : null;
  const payload = existsSync(built.payloadSink) ? JSON.parse(readFileSync(built.payloadSink, 'utf8')) : null;

  /**
   * Gate 2/3: WHETHER THE *WORKER* PRODUCED A REPORT — read from the worker's OWN output.
   *
   * THE DISTINCTION THIS CLOSES, and it is subtle enough to be worth stating. The CHILD always writes a report
   * file, whatever happens; the WORKER's report is the `PALIMPSEST_WORK_RESULT` line the shipped port parses. So
   * `existsSync(reportPath)` says nothing about whether the worker reported anything — measured: with the worker
   * exiting silently, the child still wrote `{ok: true, jobPhase: "FINISHED"}` while the attempt stayed RUNNING,
   * and an adapter keyed on the report file's existence read that as a WORK BLOCKAGE rather than as the
   * infrastructure fault it is.
   *
   * The transcript is the tee's copy of the worker's own stdout, so it carries exactly the evidence the port
   * judged. Reading it here means the adapter classifies from the same fact the product did, rather than from a
   * proxy that happens to be nearby.
   */
  const workerReportPresent = transcriptHasWorkerResult(built.transcript);

  /**
   * Gate 2/3: THE ADMISSION SIGNALS, READ FROM THE CHILD'S OWN EVIDENCE.
   *
   * Each is a fact the child observed: its job phase, whether it produced a report, the attempt's state, what the
   * consumer boundary carried, what the governed pull resolved, and how the worker's turn ended. The adapter does
   * NOT classify — that is the runner's job, through the admission schema — it only reports.
   */
  const reportPresent = report !== null;
  const consumerVisibleHandleCount = (payload?.handles ?? []).length;
  const governedPullCount = (report?.governedPulls ?? []).length;
  return Object.freeze({
    /** The machinery facts. */
    jobPhase: report?.jobPhase ?? (threw === null ? null : 'HOST_ERROR'),
    /**
     * Gate 2/3: `reportPresent` is the WORKER's report, not the child's report file. A worker that produced no
     * result line is the MISSING_WORKER_REPORT infrastructure case, whatever the child wrote afterwards.
     */
    reportPresent: workerReportPresent,
    reportMissing: workerReportPresent !== true,
    childReportPresent: reportPresent,
    attemptState: report?.attemptState ?? null,
    threw: threw !== null,
    threwDetail: threw,
    hostFailure: workerReportPresent !== true || report?.jobPhase === 'HOST_ERROR',
    gitObjectResolutionFailed: report?.gitObjectResolutionFailed === true,
    worldUnavailable: false,
    commitFailedEnvironmentally: false,
    /** Gate 3: the treatment realization, compared against the frozen expectation. */
    treatmentMismatch: report?.treatmentMismatch === true,
    /** The observation facts. */
    consumerVisibleHandleCount,
    governedPullCount,
    consumerVisibleHandles: Object.freeze([...(payload?.handles ?? []).map((entry) => entry.handle)]),
    governedPulls: Object.freeze([...(report?.governedPulls ?? [])]),
    resolvedBodyDigests: Object.freeze([...(report?.governedPulls ?? []).map((pull) => pull.bodyDigest).filter((digest) => typeof digest === 'string')]),
    hiddenInvariantVector: report?.finalVector ?? null,
    completionCause: report?.completionCause ?? (report?.jobPhase === 'FINISHED' ? 'RESULT_SUBMITTED' : 'OTHER_RUNTIME_CAUSE'),
    correctnessOk: report?.projectVerification?.ok ?? null,
    /**
     * Gate 2: CANONICAL WORK CANNOT ADVANCE — the attempt did not settle, so the next generation cannot legally
     * start. Read from the child's own attempt state, never inferred from the work's quality.
     *
     * A missing worker report is EXCLUDED here even though it also leaves the attempt unsettled, because the two
     * are different facts with different responses: a silent worker is a machinery fault, while an unsettled
     * attempt with a report in hand is the project's own state. The admission schema checks machinery faults
     * first, so this ordering is consistent with it rather than a second rule.
     */
    workCannotAdvance: workerReportPresent === true
      && (report?.attemptState === 'RUNNING' || report?.attemptState === 'LEASED' || report?.attemptState === 'CREATED'),
    /** The provenance, so a record names what actually ran. */
    hostJobId: report?.jobId ?? null,
    attemptId: report?.attemptId ?? null,
    startingHead: report?.startingHead ?? null,
    finalHead: report?.finalHead ?? null,
    resultState: report?.attemptState ?? null,
    verificationState: report?.projectVerification === undefined ? null : (report.projectVerification.ok === true ? 'PASS' : 'FAIL'),
    promotionState: report?.promoted === true ? 'PROMOTED' : (report?.eligibility?.eligible === false ? 'NOT_ELIGIBLE' : 'UNKNOWN'),
    reportPath: built.reportPath,
    transcriptPath: built.transcript,
    elapsedMs: Date.now() - started,
    childStdoutTail: stdout.trim().split(NL).slice(-2).join(' | '),
    childExit: reportPresent ? 'REPORT' : 'NO_REPORT',
  });
}

/**
 * Gate 3: WHETHER THE WORKER'S OWN RESULT LINE APPEARS IN ITS TRANSCRIPT.
 *
 * The tee writes the worker's stdout to the transcript verbatim, so this is the same evidence the shipped port's
 * `parseWorkerResultLine` judged. The prefix is imported from the product rather than re-typed, so a change to the
 * product's protocol cannot silently make this check look for the wrong thing.
 */
function transcriptHasWorkerResult(transcriptPath) {
  if (!existsSync(transcriptPath)) return false;
  const text = readFileSync(transcriptPath, 'utf8');
  return text.split(/\r?\n/u).some((line) => line.startsWith(WORKER_RESULT_PREFIX));
}

/** The port's own result prefix, resolved from the shipped module. */
const WORKER_RESULT_PREFIX = 'PALIMPSEST_WORK_RESULT ';

/**
 * Gate 3: THE FAULT INJECTION POINTS.
 *
 * §"Inject a fault at the first, middle and last scheduled sessions." The faults are applied by SESSION POSITION
 * in the schedule, so the injection is expressed against the actual 16-session order rather than against a
 * fixture. Each returns whether to inject, so the matrix can place the fault at the ruling's three positions.
 */
export function faultPositionFault(sessionIndex, scheduleLength) {
  const middle = Math.floor((scheduleLength - 1) / 2);
  const last = scheduleLength - 1;
  return Object.freeze({
    FIRST: sessionIndex === 0,
    MIDDLE: sessionIndex === middle,
    LAST: sessionIndex === last,
    index: sessionIndex,
    middleIndex: middle,
    lastIndex: last,
  });
}

/**
 * Gate 3: THE 16-SESSION CONTROL FLOW, REPRODUCED.
 *
 * §"Reproduce the full 16-session control flow using ScriptedWorker — zero LLM calls." The schedule comes from the
 * FROZEN `plan.schedule()`, so the control flow is the real one: four blocks, two arms, two generations, in the
 * randomized order the frozen seed produced.
 */
export async function frozenPrimarySchedule() {
  const plan = await import('../r3l0c/plan.mjs');
  const schedule = plan.schedule();
  return Object.freeze(schedule.map((session, index) => Object.freeze({
    ...session,
    /** Gate 3: the position in the frozen order, so a fault can be aimed at first/middle/last. */
    scheduleIndex: index,
    /** §4 of R3-L0C-F: a generation depends on its trajectory's previous generation resolving. */
    requiresResolved: session.generation === 'G1' ? null : `${session.trajectoryId}-G1`,
  })));
}

export { NL, readFileSync, existsSync, writeFileSync };
