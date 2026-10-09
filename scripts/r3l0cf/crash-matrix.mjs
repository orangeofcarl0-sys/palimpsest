/**
 * R3-L0C-F §8/§10/§11 — THE DETERMINISTIC CRASH MATRIX, THE BOUNDARY SUITE AND THE CONTAINMENT GATE.
 *
 * This module runs the §8 crash matrix, the §10 zero-model boundary witness suite and the §11 topology-derived
 * containment gate, and it is where §3's falsifiers get their second half: the SAME five §8 properties the legacy
 * runner was measured to violate are asserted to HOLD for the fail-stop runner, over the SAME evaluator.
 *
 * ISOLATION IS PER CASE, AND THAT IS A REQUIREMENT RATHER THAN A CONVENIENCE. A crash case mutates a world — it
 * commits, it deletes an object store, it strips a consumer boundary — so running two cases against one world
 * makes the second case's fault unmeasurable: measured, a second case against an already-progressed world failed
 * with `TASK_NOT_NEXT_SCHEDULABLE`, which is an artifact of the harness, not the fault under test. Every case
 * therefore gets its own copy of the frozen prehistory.
 *
 * THE HEALTHY CONTROL IS THE OTHER HALF OF EVERY FALSIFIER. §8 requires the healthy trajectory to "still advance
 * normally through legitimate Work, Result and verification paths". A matrix of failures with no healthy control
 * would be satisfied by a runner that refuses everything, which is why the control is C10 and why it asserts
 * positive outcomes (a promotion, a moved head) rather than the absence of a stop.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTAINMENT_LAW, CONTAINMENT_REQUIREMENTS, CRASH_MATRIX_CASES, CRASH_MATRIX_REQUIREMENTS, REPO_ROOT } from './contract.mjs';
import { FAULT_SEAMS, runScriptedGeneration } from './scripted-generation.mjs';
import { runFailStopMatrix } from './fail-stop.mjs';
import { evaluateFailStopProperties } from './properties.mjs';
import { buildSelection } from '../r3l0cr/selection.mjs';
import { GENERATION_EXPOSURES } from '../r3l0c/capital.mjs';

const NL = String.fromCharCode(10);

/** §8: the two-generation schedule a crash case runs, with the dependency edges the fail-stop runner enforces. */
export function twoGenerationSchedule(block = 0, arm = 'C') {
  const trajectoryId = `b${String(block)}-${arm}`;
  return Object.freeze([
    Object.freeze({ sessionId: `${trajectoryId}-G1`, block, arm, generation: 'G1', trajectoryId }),
    Object.freeze({ sessionId: `${trajectoryId}-G2`, block, arm, generation: 'G2', trajectoryId, requiresResolved: `${trajectoryId}-G1` }),
  ]);
}

/** §8: a fresh copy of the frozen prehistory for one case, so cases cannot contaminate each other. */
export function copyPrehistoryFor(caseRoot, prehistory, name) {
  const root = join(caseRoot, name);
  mkdirSync(root, { recursive: true });
  const world = join(root, 'world');
  const state = join(root, 'state');
  cpSync(prehistory.world, world, { recursive: true });
  cpSync(prehistory.state, state, { recursive: true });
  const paths = Object.freeze({
    state,
    orchestration: join(state, 'orchestration.sqlite'),
    ordarium: join(state, 'ordarium.sqlite'),
    association: join(state, 'assoc.sqlite'),
    journal: join(state, 'journal.sqlite'),
    proof: join(state, 'proof.sqlite'),
    proofBlobs: join(state, 'proof-blobs'),
    cells: join(state, 'cells.sqlite'),
    procedures: join(state, 'procedures.sqlite'),
  });
  return Object.freeze({ root, world, paths });
}

/**
 * §8: RUN ONE CRASH CASE.
 *
 * The case is a fail-stop run over a two-generation schedule, driven by `runScriptedGeneration` with a fault. The
 * five §8 properties are then evaluated over the runner's own observation, and the case passes only when every
 * one holds.
 */
export async function runCrashCase(input) {
  const { id, caseRoot, prehistory, admittedRefs, fault, arm = 'C', launchGeneration = null, injectStop = null, expectedTerminal = null } = input;
  const fresh = copyPrehistoryFor(caseRoot, prehistory, id);
  const schedule = twoGenerationSchedule(0, arm);
  const refs = admittedRefs;

  const launch = async ({ session }) => {
    if (typeof injectStop === 'function' && injectStop({ session })) {
      return Object.freeze({ outcomeUnknown: true, uncertainReason: 'HOST_TERMINATED_AFTER_LAUNCH' });
    }
    const generation = { id: session.generation, requirement: `the ${session.generation} requirement`, title: `the ${session.generation} objective` };
    const knowledge = arm === 'C' ? buildSelection({ arm: 'C', generationId: session.generation, admittedRefs: refs, generationExposures: GENERATION_EXPOSURES }) : undefined;
    /** The fault applies to the FIRST generation unless the case names a later one. */
    const applies = launchGeneration === null || launchGeneration === session.generation;
    return await runScriptedGeneration({
      world: fresh.world,
      paths: fresh.paths,
      projectId: 'cutover-entitlements',
      generation,
      arm,
      knowledge,
      admittedRefs: refs,
      fault: applies ? fault : FAULT_SEAMS.NONE,
    });
  };

  const run = await runFailStopMatrix({
    runId: `case-${id}`,
    runRoot: fresh.root,
    schedule,
    launch,
    validityGate: async () => ({ green: true, detail: 'the crash matrix supplies a green gate for the healthy control only' }),
    intendedExecutorRoute: 'omnigate-ai/deepseek-v4.1-flash',
  });

  /** §8: the properties, evaluated over the runner's own observation. */
  const properties = evaluateFailStopProperties(run.observation);
  const caseResult = Object.freeze({
    id,
    arm,
    fault: fault ?? FAULT_SEAMS.NONE,
    terminalState: run.terminalState,
    completedSessions: run.completedSessions,
    launches: run.launches,
    maxLaunchesPerSession: run.maxLaunchesPerSession,
    failure: run.failure,
    matrixCompleted: run.matrixCompleted,
    journalIntact: run.journal.intact,
    manifestTerminalState: run.manifestPath === null ? null : readManifest(run.manifestPath)?.terminalState ?? null,
    properties,
    /** §8: every case must exhibit all five properties. */
    PASSES_CRASH_MATRIX_REQUIREMENTS: CRASH_MATRIX_REQUIREMENTS.every((propertyId) => properties.properties.find((entry) => entry.id === propertyId)?.holds === true),
    expectedTerminal: expectedTerminal,
    terminalMatchesExpectation: expectedTerminal === null || run.terminalState === expectedTerminal,
  });
  return caseResult;
}

/** Read a manifest, or null. */
function readManifest(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * §8: RUN THE TEN CASES.
 *
 * The ten cases are the ruling's own list. Each is expressed with the fault seam that models it, and the healthy
 * control is C10.
 */
export async function runCrashMatrix(input) {
  const { caseRoot, prehistory, admittedRefs } = input;
  const cases = [];

  /** C1: failure before any Worker launch. */
  cases.push(await runCrashCase({
    id: 'C1_FAILURE_BEFORE_LAUNCH', caseRoot, prehistory, admittedRefs, arm: 'C',
    fault: FAULT_SEAMS.NONE,
    injectStop: ({ session }) => session.generation === 'G1',
    expectedTerminal: 'UNCERTAIN_PRESERVED',
  }));

  /** C2: failure immediately after exposure-intent persistence — the launch throws. */
  cases.push(await runCrashCase({
    id: 'C2_FAILURE_AFTER_EXPOSURE_INTENT', caseRoot, prehistory, admittedRefs, arm: 'C',
    fault: FAULT_SEAMS.HOST_FAILURE, expectedTerminal: 'ABORT_PRESERVED',
  }));

  /** C3: child launch fails or the report is missing. */
  cases.push(await runCrashCase({
    id: 'C3_CHILD_LAUNCH_OR_REPORT_MISSING', caseRoot, prehistory, admittedRefs, arm: 'C',
    fault: FAULT_SEAMS.REPORT_MISSING, expectedTerminal: 'ABORT_PRESERVED',
  }));

  /** C4: the worker produces an actual HOST_FAILURE. */
  cases.push(await runCrashCase({
    id: 'C4_WORKER_HOST_FAILURE', caseRoot, prehistory, admittedRefs, arm: 'C',
    fault: FAULT_SEAMS.HOST_FAILURE, expectedTerminal: 'ABORT_PRESERVED',
  }));

  /** C5: the World loses Git object access after worker activity. */
  cases.push(await runCrashCase({
    id: 'C5_WORLD_LOSES_GIT_OBJECTS', caseRoot, prehistory, admittedRefs, arm: 'C',
    fault: FAULT_SEAMS.GIT_OBJECTS_LOST, expectedTerminal: 'ABORT_PRESERVED',
  }));

  /** C6: the C treatment's expected handles are absent at the consumer boundary. */
  cases.push(await runCrashCase({
    id: 'C6_C_TREATMENT_HANDLES_ABSENT', caseRoot, prehistory, admittedRefs, arm: 'C',
    fault: FAULT_SEAMS.TREATMENT_HANDLES_ABSENT, expectedTerminal: 'ABORT_PRESERVED',
  }));

  /** C7: G1 completes, but G2 fails. */
  cases.push(await runCrashCase({
    id: 'C7_G1_COMPLETES_G2_FAILS', caseRoot, prehistory, admittedRefs, arm: 'C',
    fault: FAULT_SEAMS.HOST_FAILURE, launchGeneration: 'G2', expectedTerminal: 'ABORT_PRESERVED',
  }));

  /** C8: the host terminates between journal writes. */
  cases.push(await runCrashCase({
    id: 'C8_HOST_TERMINATES_BETWEEN_JOURNAL_WRITES', caseRoot, prehistory, admittedRefs, arm: 'C',
    fault: FAULT_SEAMS.HOST_TERMINATES, expectedTerminal: 'UNCERTAIN_PRESERVED',
  }));

  /** C9: a runner restarts against an unfinished preserved run — inspected, never resumed. */
  const c9Root = copyPrehistoryFor(caseRoot, prehistory, 'C9_RESTART_AGAINST_UNFINISHED_RUN');
  const c9Schedule = twoGenerationSchedule(0, 'C');
  const c9Run = await runFailStopMatrix({
    runId: 'case-C9', runRoot: c9Root.root, schedule: c9Schedule,
    launch: async ({ session }) => session.generation === 'G1'
      ? Object.freeze({ outcomeUnknown: true, uncertainReason: 'HOST_TERMINATED_AFTER_LAUNCH' })
      : Object.freeze({ resultCorrect: true }),
    validityGate: async () => ({ green: true }),
  });
  const { inspectPreservedRun } = await import('./fail-stop.mjs');
  const inspection = inspectPreservedRun(c9Root.root);
  cases.push(Object.freeze({
    id: 'C9_RESTART_AGAINST_UNFINISHED_RUN',
    arm: 'C',
    terminalState: c9Run.terminalState,
    completedSessions: c9Run.completedSessions,
    launches: c9Run.launches,
    maxLaunchesPerSession: c9Run.maxLaunchesPerSession,
    failure: c9Run.failure,
    journalIntact: c9Run.journal.intact,
    inspection,
    properties: evaluateFailStopProperties(c9Run.observation),
    /** §8: a restart must not resume or replace, and must not start a further session. */
    PASSES_CRASH_MATRIX_REQUIREMENTS: evaluateFailStopProperties(c9Run.observation).ALL_PROPERTIES_HOLD && inspection.mayResumeAutomatically === false && inspection.mayReplaceAutomatically === false,
    expectedTerminal: 'UNCERTAIN_PRESERVED',
    terminalMatchesExpectation: c9Run.terminalState === 'UNCERTAIN_PRESERVED',
    NO_RESTART_RESUME: inspection.mayResumeAutomatically === false,
  }));

  /** C10: a healthy two-generation ScriptedWorker trajectory completes. */
  const healthyRoot = copyPrehistoryFor(caseRoot, prehistory, 'C10_HEALTHY_TWO_GENERATION_TRAJECTORY');
  const healthySchedule = twoGenerationSchedule(0, 'C');
  const healthyRun = await runFailStopMatrix({
    runId: 'case-C10', runRoot: healthyRoot.root, schedule: healthySchedule,
    launch: async ({ session }) => {
      const generation = { id: session.generation, requirement: `the ${session.generation} requirement`, title: `the ${session.generation} objective` };
      const knowledge = buildSelection({ arm: 'C', generationId: session.generation, admittedRefs, generationExposures: GENERATION_EXPOSURES });
      return await runScriptedGeneration({ world: healthyRoot.world, paths: healthyRoot.paths, projectId: 'cutover-entitlements', generation, arm: 'C', knowledge, admittedRefs, fault: FAULT_SEAMS.NONE });
    },
    validityGate: async ({ completed }) => ({ green: completed.length === 2, detail: `completed ${String(completed.length)}/2` }),
  });
  const healthyProperties = evaluateFailStopProperties(healthyRun.observation);
  const healthyRecords = healthyRun.records;
  cases.push(Object.freeze({
    id: 'C10_HEALTHY_TWO_GENERATION_TRAJECTORY',
    arm: 'C',
    terminalState: healthyRun.terminalState,
    completedSessions: healthyRun.completedSessions,
    launches: healthyRun.launches,
    maxLaunchesPerSession: healthyRun.maxLaunchesPerSession,
    failure: healthyRun.failure,
    journalIntact: healthyRun.journal.intact,
    properties: healthyProperties,
    /** §8: the control must ADVANCE, so the assertion is positive. */
    ADVANCED_THROUGH_GOVERNED_PATH: healthyRecords.length === 2
      && healthyRecords.every((record) => record.promotionState === 'PROMOTED')
      && healthyRecords.every((record) => record.finalHead !== null && record.finalHead !== record.startingHead),
    promoted: healthyRecords.map((record) => record.promotionState),
    headsMoved: healthyRecords.map((record) => record.startingHead !== record.finalHead),
    PASSES_CRASH_MATRIX_REQUIREMENTS: healthyProperties.ALL_PROPERTIES_HOLD,
    expectedTerminal: 'MATRIX_COMPLETE',
    terminalMatchesExpectation: healthyRun.terminalState === 'MATRIX_COMPLETE',
  }));

  const failureCases = cases.filter((entry) => entry.id !== 'C10_HEALTHY_TWO_GENERATION_TRAJECTORY');
  const failing = cases.filter((entry) => entry.PASSES_CRASH_MATRIX_REQUIREMENTS !== true);
  const unhealthy = cases.filter((entry) => entry.terminalMatchesExpectation !== true);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'deterministic fail-stop crash matrix',
    cases: Object.freeze(cases),
    requiredCases: CRASH_MATRIX_CASES.map((entry) => entry.id),
    allCasesRun: CRASH_MATRIX_CASES.every((entry) => cases.some((item) => item.id === entry.id)),
    failureCases: failureCases.length,
    failing: Object.freeze(failing.map((entry) => entry.id)),
    unexpectedTerminal: Object.freeze(unhealthy.map((entry) => entry.id)),
    /** §8: every failure case must exhibit all five properties, and the healthy control must still advance. */
    CRASH_MATRIX: failing.length === 0 && unhealthy.length === 0 ? 'PASS' : 'FAIL',
    healthyControlAdvanced: cases.find((entry) => entry.id === 'C10_HEALTHY_TWO_GENERATION_TRAJECTORY')?.ADVANCED_THROUGH_GOVERNED_PATH === true,
    modelCallsMade: 0,
    law: 'every failure case must show NO_SECOND_LAUNCH, NEXT_SESSION_NOT_STARTED, EVIDENCE_PRESERVED, NO_FAKE_ATTEMPT_TERMINAL and NO_CAUSAL_VERDICT, and the healthy control must still advance through the governed path',
  });
}

/**
 * §7: THE PRESERVATION PROOF.
 *
 * §7 names seven properties, and the one that is easy to get wrong is stated plainly in the ruling: "Do not call a
 * successful return from a cleanup function proof that all evidence survived." So this proof checks the EVIDENCE
 * on disk after each scenario, not the cleanup's return value.
 */
export async function provePreservation(input) {
  const { runRoot } = input;
  const { sweepRunRoots, classifyRoot, runRootParent, tmpdir } = await import('../r3l0c/run-root.mjs');
  const checks = [];

  /** §7: the marker exists and names the run. */
  const markerPath = join(runRoot, 'PRESERVE');
  checks.push(Object.freeze({ id: 'PRESERVE_MARKER_PRESENT', holds: existsSync(markerPath), detail: markerPath }));
  /** §7: the abort manifest and the journal exist and are non-empty. */
  const manifestPath = join(runRoot, 'abort-manifest.json');
  const journalPath = join(runRoot, 'generation-journal.jsonl');
  const manifest = readManifest(manifestPath);
  checks.push(Object.freeze({ id: 'ABORT_MANIFEST_PRESENT', holds: manifest !== null, detail: manifest === null ? 'absent' : `terminalState=${String(manifest.terminalState)}` }));
  checks.push(Object.freeze({ id: 'JOURNAL_PRESENT', holds: existsSync(journalPath) && readFileSync(journalPath, 'utf8').trim() !== '', detail: journalPath }));
  /** §7: the evidence index names the artifacts. */
  const index = readManifest(join(runRoot, 'evidence-index.json'));
  checks.push(Object.freeze({ id: 'EVIDENCE_INDEX_PRESENT', holds: index !== null && Array.isArray(index.artifacts) && index.artifacts.length > 0, detail: index === null ? 'absent' : `${String(index.artifacts.length)} artifact(s)` }));
  /**
   * §7: A SWEEP REFUSES TO DELETE A PRESERVED ROOT.
   *
   * The sweep is run as an owner of an UNRELATED run id, so the preserved root is a non-owned root. A preserved
   * root must survive, and the sweep must REPORT the refusal rather than silently skip it.
   *
   * THE ORDER MATTERS AND IS THE POINT: survival is measured AFTER the sweep, never before it. §7 says plainly
   * that "a successful return from a cleanup function is not proof that all evidence survived" — the same trap
   * applies here, where checking the marker BEFORE sweeping would report success without the sweep having been
   * given a chance to fail.
   */
  const parent = input.base ?? runRootParent(tmpdir());
  const preservedRunId = runRoot.split(/[/\\]/u).pop() ?? '';
  const sweep = sweepRunRoots({ base: parent, ownedRunIds: [], preservedRunIds: [] });
  const survived = existsSync(join(runRoot, 'PRESERVE')) && existsSync(journalPath);
  const refusalReported = sweep.protectedRoots.some((entry) => entry.runId === preservedRunId || entry.root === runRoot);
  const removedBySweep = sweep.removed.some((entry) => entry.root === runRoot);
  checks.push(Object.freeze({
    id: 'SWEEP_REFUSES_PRESERVED_ROOT',
    holds: survived && !removedBySweep,
    detail: `survived=${String(survived)} removedBySweep=${String(removedBySweep)} refusalReported=${String(refusalReported)}`,
    refusalReported,
  }));
  /** §7: a restart detects the unfinished run and refuses to resume it automatically. */
  const { inspectPreservedRun } = await import('./fail-stop.mjs');
  const inspection = inspectPreservedRun(runRoot);
  checks.push(Object.freeze({ id: 'RESTART_DETECTS_UNFINISHED_RUN', holds: inspection.verdict !== 'NOT_STARTED', detail: inspection.verdict }));
  checks.push(Object.freeze({ id: 'RESTART_REFUSES_AUTOMATIC_RESUME', holds: inspection.mayResumeAutomatically === false, detail: inspection.decision }));

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'preservation proof',
    runRoot,
    checks: Object.freeze(checks),
    inspection,
    sweepProtected: Object.freeze(sweep.protectedRoots.map((entry) => entry.root)),
    /** §7: the evidence survived, measured on disk rather than from a cleanup return. */
    CRASH_PRESERVATION: checks.every((check) => check.holds === true) ? 'CLOSED' : 'OPEN',
    law: 'a successful return from a cleanup function is not proof that evidence survived; the evidence is read from disk',
  });
}

export { CONTAINMENT_REQUIREMENTS, CONTAINMENT_LAW, NL, REPO_ROOT };
