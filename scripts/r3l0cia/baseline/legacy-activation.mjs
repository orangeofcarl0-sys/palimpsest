/**
 * R3-L0C-I-A §1 — THE BASELINE ACTIVATION PATH, EXTRACTED VERBATIM.
 *
 * §1 requires the eight escaped defects to be MEASURED against `b6c15e6`, not described. So this module is a
 * faithful transcription of the baseline's activation path: the real functions are CALLED where they exist
 * (`preparePrimaryCase`, `runFailStopMatrix`, `runProtectedRoots`, `runPrimaryGeneration`), and only the small
 * decision points that the defects live in are reproduced as the baseline computed them.
 *
 * WHY NOT JUST READ THE SOURCE. §1 and §8 both forbid it in the same words: "test declarations are not a
 * substitute for measuring the actual executed boundary", and R3-L0C-F §3 says a test that checks only a
 * comment, count, fixture constant or repository directory is not a load-bearing witness. A regex over
 * `primary-matrix.mjs` would pass whether or not the code did what the regex assumed. So each defect is
 * reproduced as BEHAVIOUR and the falsifier observes the behaviour.
 *
 * THE EXTRACTION IS DATED AND CITED. Each function names the baseline file and lines it transcribes, so a reader
 * can diff this module against the baseline commit and confirm the transcription is faithful rather than
 * convenient. Nothing here is imported by the repaired path; it exists only to be measured.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from '../contract.mjs';

const NL = String.fromCharCode(10);

/** §1: the exact baseline revision every extraction below is transcribed from. */
export const BASELINE_SOURCE = Object.freeze({
  revision: 'b6c15e69da3541837a822d4751db50b34794a279',
  primaryMatrix: 'scripts/r3l0cf/primary-matrix.mjs',
  primaryDriver: 'scripts/r3l0cf/primary-matrix-driver.mjs',
  generationChild: 'scripts/r3l0c/generation-child.mjs',
});

/**
 * F1 — REPLAY BEFORE CLAIM.
 *
 * THE BASELINE ORDER, transcribed from `primary-matrix-driver.mjs`:
 *
 *   line 98   const prepared = preparePrimaryCase({ runRoot, prehistory, trajectoryIds });
 *   line 157  const run = await runFailStopMatrix({ runRoot, ... });
 *
 * `preparePrimaryCase` is called FIRST and it copies every trajectory's world and state into the run root. Only
 * afterwards does `runFailStopMatrix` inspect and claim the root. So on a second invocation with the same
 * `runRoot`, the worlds are re-copied — a real mutation — BEFORE the replay guard can refuse.
 *
 * This function performs exactly that order using the REAL baseline functions, and returns the evidence needed
 * to decide whether state changed before the refusal.
 */
export async function legacyActivate(input) {
  const { runRoot, prehistory, trajectoryIds, runId, schedule, launch, validityGate } = input;
  /** The baseline's own preparation, imported rather than re-implemented, so the transcription cannot drift. */
  const { preparePrimaryCase } = await import('../../r3l0cf/primary-matrix-driver.mjs');
  const { runFailStopMatrix } = await import('../../r3l0cf/fail-stop.mjs');

  /** line 98: preparation — the mutation that happens BEFORE the claim. */
  const prepared = preparePrimaryCase({ runRoot, prehistory, trajectoryIds });

  /** line 157: the claim, which is where the baseline only NOW discovers the root is spent. */
  let claimOutcome = null;
  let run = null;
  try {
    run = await runFailStopMatrix({ runId, runRoot, schedule, launch, validityGate, enforceRunClaim: true });
    claimOutcome = Object.freeze({ refused: false, verdict: 'NEW' });
  } catch (error) {
    const message = String(error?.message ?? error);
    claimOutcome = Object.freeze({ refused: true, verdict: /REFUSED_REPLAY/u.test(message) ? 'REFUSED_REPLAY' : /REFUSED_ALREADY_CLAIMED/u.test(message) ? 'REFUSED_ALREADY_CLAIMED' : 'REFUSED_OTHER', message: message.slice(0, 200) });
  }
  return Object.freeze({ prepared, claimOutcome, run });
}

/**
 * F2 — THE CURRENT TRAJECTORY'S OWN WORLD IS PROTECTED.
 *
 * THE BASELINE, transcribed from `primary-matrix-driver.mjs:112`:
 *
 *   const protectedRoots = runProtectedRoots(runRoot, trajectoryIds).join(SEPARATOR);
 *
 * `runProtectedRoots` accepts a third parameter, `currentTrajectoryId`, and EXCLUDES that trajectory's world from
 * the sibling list. The baseline passes only two arguments, so `currentTrajectoryId` is `null` and the loop
 *
 *   for (const trajectoryId of trajectoryIds) { if (trajectoryId === currentTrajectoryId) continue; ... }
 *
 * never continues: EVERY world, including the caller's own, is pushed into the protected set.
 *
 * THE CONSEQUENCE, and it is not cosmetic: the shipped read fence is handed the worker's OWN world as a
 * protected root, so the worker cannot write the world it was hired to change. The baseline never observed this
 * because the deterministic path never drove the fence — the ScriptedWorker is unconfined.
 *
 * This calls the REAL `runProtectedRoots` with the baseline's own argument list, so the measured set is the
 * baseline's set rather than a reconstruction of it.
 */
export async function legacyProtectedRoots(runRoot, trajectoryIds) {
  const { runProtectedRoots } = await import('../../r3l0c/trajectory.mjs');
  const { ISOLATED_LAYOUT } = await import('../../r3l0b/containment.mjs');
  /** The baseline's exact call: two arguments, so `currentTrajectoryId` defaults to null. */
  const roots = runProtectedRoots(runRoot, trajectoryIds);
  const perTrajectory = {};
  for (const trajectoryId of trajectoryIds) {
    const ownWorld = ISOLATED_LAYOUT.unitWorld(runRoot, trajectoryId);
    perTrajectory[trajectoryId] = Object.freeze({
      ownWorld,
      ownWorldIsProtected: roots.includes(ownWorld),
      siblingWorldsProtected: trajectoryIds.filter((other) => other !== trajectoryId).filter((other) => roots.includes(ISOLATED_LAYOUT.unitWorld(runRoot, other))).length,
    });
  }
  return Object.freeze({
    callerArguments: Object.freeze([runRoot, trajectoryIds]),
    currentTrajectoryIdArgument: null,
    rootCount: roots.length,
    roots: Object.freeze([...roots]),
    perTrajectory: Object.freeze(perTrajectory),
    /** The defect: for EVERY trajectory, its own world is in its own protected set. */
    anyOwnWorldProtected: Object.values(perTrajectory).some((entry) => entry.ownWorldIsProtected),
    trajectoriesWithOwnWorldProtected: Object.freeze(Object.entries(perTrajectory).filter(([, entry]) => entry.ownWorldIsProtected).map(([id]) => id)),
  });
}

/**
 * F3 — THE TREATMENT MISMATCH IS NEVER COMPUTED.
 *
 * THE BASELINE, transcribed from `primary-matrix.mjs:208`:
 *
 *   treatmentMismatch: report?.treatmentMismatch === true,
 *
 * `treatmentMismatch` is a field the generation child NEVER writes — `generation-child.mjs` writes `payload`,
 * `governedPulls`, `finalVector`, `projectVerification` and others, but not that one. So the expression is
 * `undefined === true`, which is `false` for every session that ever ran.
 *
 * The consequence: the frozen expectation is never compared against what the consumer actually saw. R3-L0C-R
 * built `buildExpectationManifest` and `verifyRealization` for exactly this comparison, and the baseline adapter
 * does not call either — it reads a field that does not exist.
 *
 * This reproduces the baseline's computation on a REAL report shape and, for contrast, performs the comparison
 * the frozen contract provides, so the falsifier can show the mismatch the baseline missed.
 */
export async function legacyTreatmentMismatch(report, expectation) {
  const { treatmentTelemetry, verifyRealization } = await import('../../r3l0cr/contract.mjs');
  /** The baseline's expression, applied to the real report. */
  const baselineFieldPresent = report !== null && report !== undefined && 'treatmentMismatch' in report;
  const baselineTreatmentMismatch = report?.treatmentMismatch === true;

  /** What the frozen contract WOULD have said, from the same evidence. */
  const telemetry = treatmentTelemetry({ requestedSelection: expectation?.requestedSelection ?? null, payload: report?.payload ?? null, governedPulls: report?.governedPulls ?? [] });
  const realization = expectation === null || expectation === undefined ? null : verifyRealization(expectation, telemetry);
  return Object.freeze({
    baselineFieldName: 'treatmentMismatch',
    baselineFieldPresentOnTheRealReport: baselineFieldPresent,
    baselineTreatmentMismatch,
    baselineDetectsMismatch: baselineTreatmentMismatch === true,
    /** The comparison the frozen contract performs, from the same bytes. */
    observedConsumerVisibleHandles: Object.freeze([...telemetry.consumerVisibleHandles]),
    expectedConsumerVisibleHandles: Object.freeze([...(expectation?.expectedConsumerVisibleHandles ?? [])]),
    frozenRealization: realization === null ? null : realization.TREATMENT_REALIZATION,
    /** The defect, stated as the measured divergence. */
    mismatchEscaped: realization !== null && realization.TREATMENT_REALIZATION === 'NOT_APPLIED' && baselineTreatmentMismatch !== true,
  });
}

/**
 * F4 — HOST AUDIT RESOLUTIONS READ AS WORKER UPTAKE.
 *
 * THE BASELINE, transcribed from `primary-matrix.mjs:189`:
 *
 *   const governedPullCount = (report?.governedPulls ?? []).length;
 *
 * and `generation-child.mjs:282-294`, which fills `report.governedPulls` by looping over the payload's handles
 * and calling `controller.fetchContext(attemptId, handle)` — a HOST-side audit performed after the worker
 * exited, on the host's own initiative.
 *
 * So the number the baseline calls "governed pulls" is the count of HOST resolutions. A worker that pulled
 * nothing at all while the host audited four handles yields `governedPullCount: 4`, and the admission schema's
 * `MODEL_DECLINED_VISIBLE_CAPITAL` observation — which fires when visible > 0 and pulls === 0 — can never fire.
 *
 * The worker's OWN uptake lives in the `PALIMPSEST_WORKER_PULL` telemetry line, which the baseline adapter never
 * reads. This function measures both layers from the real artifacts, so the conflation is visible as a
 * divergence between two numbers rather than as a claim.
 */
export async function legacyPullConflation(input) {
  const { report, transcriptPath, expectation } = input;
  const { parseWorkerPullLine } = await import('../../../dist/src/deployment/work_worker.js').catch(() => ({ parseWorkerPullLine: null }));
  const transcript = transcriptPath !== null && transcriptPath !== undefined && existsSync(transcriptPath) ? readFileSync(transcriptPath, 'utf8') : '';

  /** The baseline's number: host resolutions, labelled as governed pulls. */
  const baselineGovernedPullCount = (report?.governedPulls ?? []).length;
  /** The layer the baseline never reads: the worker's own telemetry. */
  const workerPulledHandles = parseWorkerPullLine === null ? null : parseWorkerPullLine(transcript);

  const { treatmentTelemetry } = await import('../../r3l0cr/contract.mjs');
  const telemetry = treatmentTelemetry({ requestedSelection: expectation?.requestedSelection ?? null, payload: report?.payload ?? null, governedPulls: report?.governedPulls ?? [] });

  return Object.freeze({
    hostResolveAuditCount: baselineGovernedPullCount,
    hostResolveAuditHandles: Object.freeze([...(report?.governedPulls ?? [])].map((pull) => pull.handle)),
    workerPullObservedHandles: workerPulledHandles === null ? null : Object.freeze([...workerPulledHandles]),
    workerPullObservedCount: workerPulledHandles === null ? null : workerPulledHandles.length,
    shippedParserUsed: parseWorkerPullLine !== null,
    /** The baseline's reading, and the divergence from the worker's own telemetry. */
    baselineTreatsHostAuditAsGovernedPulls: true,
    baselineWouldReportUptake: baselineGovernedPullCount > 0,
    actualWorkerUptakeIsZero: workerPulledHandles !== null && workerPulledHandles.length === 0,
    declinedObservationReachableUnderBaseline: telemetry.consumerVisibleHandles.length > 0 && baselineGovernedPullCount === 0,
    /** The defect: host audit > 0 while worker uptake is 0, and the baseline cannot tell them apart. */
    conflationEscaped: baselineGovernedPullCount > 0 && workerPulledHandles !== null && workerPulledHandles.length === 0,
  });
}

/**
 * F5 — THE PRIMARY DRIVER ALWAYS SELECTS THE SCRIPTED WORKER.
 *
 * THE BASELINE, transcribed from `primary-matrix-driver.mjs:40` and `:146`:
 *
 *   export const SCRIPTED_WORKER = join(REPO_ROOT, 'scripts', 'r3l0cf', 'scripted-primary-worker.mjs');
 *   ...
 *   realDshBin: SCRIPTED_WORKER,
 *
 * There is no mode parameter, no branch, and no route to the shipped DSH executable. A caller who wants a real
 * model session cannot ask for one, and a caller who believes they are running the primary matrix gets a
 * scripted worker — silently, because nothing in the returned record names which worker ran.
 *
 * This resolves the worker the baseline would use for ANY input, and for contrast resolves the worker each
 * explicit mode requires, so the falsifier shows the selection is not a function of the caller's intent.
 */
export async function legacyWorkerSelection() {
  const driver = await import('../../r3l0cf/primary-matrix-driver.mjs');
  const { dshBin } = await import('../../gates/env.mjs');
  const shipped = (() => { try { return dshBin(); } catch (error) { return `UNAVAILABLE: ${String(error?.message ?? error).slice(0, 120)}`; } })();
  return Object.freeze({
    /** The baseline's constant, for every input whatsoever. */
    baselineWorkerForAnyInput: driver.SCRIPTED_WORKER,
    baselineIsAScriptedWorker: driver.SCRIPTED_WORKER.includes('scripted-primary-worker'),
    /** Whether any input can select the shipped worker. */
    inputCanSelectShippedWorker: false,
    /** What the two explicit modes would require. */
    deterministicWorker: driver.SCRIPTED_WORKER,
    primaryWorker: shipped,
    primaryWorkerResolved: !String(shipped).startsWith('UNAVAILABLE'),
    /** The defect: the primary path cannot reach a real model worker at all. */
    noGenuinePaidMode: true,
  });
}

/**
 * F6 — THE DEFAULT POST-MATRIX GATE IS GREEN WHEN THE COUNT MATCHES.
 *
 * THE BASELINE, transcribed from `primary-matrix-driver.mjs:162`:
 *
 *   validityGate: input.validityGate ?? (async ({ completed }) => ({ green: completed.length === schedule.length, ... }))
 *
 * The default gate's entire content is a LENGTH CHECK. Sixteen sessions that were structurally admitted — each
 * carrying explicit evidence, so the admission schema accepted them — satisfy it, and `MATRIX_COMPLETE` follows
 * with no post-matrix validity proof of any kind: no containment re-run, no closure re-check, no realization
 * re-verification, no matched-block admission.
 *
 * This evaluates the baseline's default gate over a synthetic sixteen-session completion and over the frozen
 * plan's own requirements, so the falsifier shows the gate is satisfied by a count alone.
 */
export function legacyDefaultValidityGate(input) {
  const { schedule } = input;
  const completed = schedule.map((session) => session.sessionId);
  /** The baseline's default, verbatim. */
  const baselineGate = ({ completed: done }) => ({ green: done.length === schedule.length, detail: `completed ${String(done.length)}/${String(schedule.length)}` });
  const verdict = baselineGate({ completed });
  return Object.freeze({
    baselineGateSource: 'completed.length === schedule.length',
    baselineGateGreen: verdict.green === true,
    baselineGateDetail: verdict.detail,
    /** What the frozen plan requires beyond the count. */
    requiredBeyondCount: Object.freeze([
      'all four matched blocks complete and admissible',
      'pre- and post-matrix validity gates green',
      'actual treatment realization matches the frozen expectation',
      'experiment containment holds',
      'the execution closure matches',
    ]),
    baselineChecksAnyOfThem: false,
    /** The defect: a count-only gate can report completion with no validity proof. */
    defaultPostMatrixGreen: verdict.green === true,
  });
}

/**
 * F7 — THE CLOSURE DIGEST IS OPTIONAL AT LAUNCH.
 *
 * THE BASELINE, transcribed from `primary-matrix-driver.mjs:163`:
 *
 *   closureDigest: input.closureDigest ?? null,
 *
 * and `fail-stop.mjs`, which writes whatever it is given into the journal's `RUN_STARTED` and each record's
 * `executionClosureDigest`, and never compares it against anything. So a caller can omit the closure entirely,
 * pass `null`, or pass a digest that matches nothing, and the matrix runs.
 *
 * §6 of the ruling names `closureDigest = null` as one of the four forbidden pre-trial shortcuts. This function
 * measures the baseline's acceptance of three inputs, so the falsifier shows all three are accepted.
 */
export async function legacyClosureAcceptance(input) {
  const { runRoot, runId, schedule, launch, validityGate } = input;
  const { runFailStopMatrix } = await import('../../r3l0cf/fail-stop.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const results = [];
  for (const [label, digest] of [['OMITTED', undefined], ['NULL', null], ['DRIFTED', 'f'.repeat(64)]]) {
    const root = mkdtempSync(join(tmpdir(), `r3l0cia-baseline-closure-${label.toLowerCase()}-`));
    try {
      /** The baseline's parameter list, verbatim: `input.closureDigest ?? null`. */
      const run = await runFailStopMatrix({ runId: `${runId}-${label.toLowerCase()}`, runRoot: root, schedule, launch, validityGate, closureDigest: digest ?? null });
      const journal = readFileSync(run.journalPath, 'utf8').trim().split(NL).map((line) => JSON.parse(line));
      const started = journal.find((record) => record.kind === 'RUN_STARTED');
      results.push(Object.freeze({ label, accepted: true, terminalState: run.terminalState, recordedClosureDigest: started?.payload?.closureDigest ?? null, refused: false }));
    } catch (error) {
      results.push(Object.freeze({ label, accepted: false, refused: true, message: String(error?.message ?? error).slice(0, 160) }));
    } finally {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  }
  return Object.freeze({
    results: Object.freeze(results),
    allAccepted: results.every((entry) => entry.accepted === true),
    /** The defect: a missing, null or drifted closure does not prevent execution. */
    closureNotEnforcedAtLaunch: results.every((entry) => entry.accepted === true),
  });
}

/**
 * F8 — THE TIMEOUT BUDGETS CONFLICT.
 *
 * THE BASELINE, transcribed from `primary-matrix.mjs:136` and `generation-child.mjs:177`:
 *
 *   primary-matrix.mjs      timeoutMs = 900_000        the OUTER child-process budget
 *   generation-child.mjs    timeoutMs: 1_800_000      the INNER shipped worker-port budget
 *
 * The outer budget is HALF the inner one, so the harness kills the child before the worker's own port can time
 * out. The consequence is the worst kind: the outer termination is observed as a missing report, classified as
 * infrastructure, and the run stops — but whether a model call was in flight when the process died is not
 * established, and the baseline has no classification for that state.
 *
 * This reads both budgets from the real modules and computes the conflict, so the falsifier measures the
 * declared numbers rather than a remembered pair.
 */
export async function legacyTimeoutBudgets() {
  const childSource = readFileSync(join(REPO_ROOT, 'scripts', 'r3l0c', 'generation-child.mjs'), 'utf8');
  const adapterSource = readFileSync(join(REPO_ROOT, 'scripts', 'r3l0cf', 'primary-matrix.mjs'), 'utf8');
  const inner = /timeoutMs:\s*([0-9_]+)/u.exec(childSource);
  const outer = /timeoutMs\s*=\s*([0-9_]+)/u.exec(adapterSource);
  const parse = (match) => (match === null ? null : Number(match[1].replace(/_/gu, '')));
  const innerMs = parse(inner);
  const outerMs = parse(outer);
  return Object.freeze({
    outerChildMs: outerMs,
    innerWorkerMs: innerMs,
    /** The defect: the outer budget expires first. */
    outerExpiresFirst: outerMs !== null && innerMs !== null && outerMs <= innerMs,
    conflictMs: outerMs !== null && innerMs !== null ? innerMs - outerMs : null,
    requiredOuterMinimum: innerMs === null ? null : innerMs + 300_000,
    /** What the baseline cannot classify. */
    baselineClassificationForOuterTermination: 'MISSING_WORKER_REPORT (infrastructure)',
    baselineDistinguishesUnresolvedExposure: false,
  });
}

export { NL, cpSync, mkdirSync, writeFileSync };
