/**
 * R3-L0C-R §12/§14/§15 — THE REPAIR-REPLICATION MATRIX RUNNER.
 *
 * §14 requires the EXACT original R3-L0C arm order, fresh run ids, a fresh isolated topology, no new seed, and
 * 16 valid sessions with BOTH arms rerun. §14 also forbids pairing an old H session with a new C session, which
 * is why this runner starts from a fresh prehistory copy and never reads Run 1.
 *
 * §15 requires each trial record to carry its treatment realization evidence: the expectation digest, the five
 * telemetry fields, the actual consumer handle digest, the pull and body digests, the topology digest and the
 * execution-closure digest. A trial whose realization mismatches is INVALID and STOPS the run.
 *
 * THE ORDER OF OPERATIONS IS THE GATE STRUCTURE, and every step refuses rather than warns:
 *
 *   1. the committed plan must exist and its schedule must match;
 *   2. the preflight repairs, the validity gates and the containment canaries must be green;
 *   3. the §7 real-prehistory boundary probe must PASS — the check Run 1's dummy preflight could not perform;
 *   4. the §9 closure digest must MATCH the frozen one;
 *   5. only then does the first primary session run.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';
import { buildExpectationManifest, expectationDigest, verifyRealization } from './contract.mjs';
import { treatmentTelemetry } from './contract.mjs';
import { buildSelection, validateSelection } from './selection.mjs';
import { checkExecutionClosure, computeExecutionClosure, runSelectionMutations } from './mutations.mjs';
import { buildTopologyManifest, canaryPlan, manifestPathsExist, topologyDigest } from './topology.mjs';
import { buildPrehistory } from '../r3l0c/build-prehistory.mjs';
import { admitCapital, selectionRefs } from '../r3l0c/prehistory.mjs';
import { GENERATION_EXPOSURES, ARMS } from '../r3l0c/capital.mjs';
import { GENERATIONS } from '../r3l0c/contract.mjs';
import { CHILD_PROGRAM, TEE_PATH, containmentEnvironment, makeProfile, prepareRunLayout, prepareTrajectory, runProtectedRoots, trajectoryHome } from '../r3l0c/trajectory.mjs';
import { PRIMARY_EXECUTOR, schedule } from '../r3l0c/plan.mjs';
import { acquireLease, rigPath } from '../r3l0c/run-root.mjs';
import { capitalWitness, historyOnlyWitness } from '../r3l0c/witness.mjs';
import { runRealPrehistoryBoundaryProbe, probeMatchesExpectation } from './boundary-probe.mjs';
import { runPreflight, runValidityGates, runContainmentGate, runPlumbingCheck } from '../r3l0c/preflight.mjs';

const NL = String.fromCharCode(10);
const out = (line) => process.stdout.write(`${line}${NL}`);

/** §15: run ONE generation as a child process, retrying only on infrastructure invalidity. */
function runGeneration(input) {
  const { runRoot, world, paths, home, profile, session, generation, knowledge, realDshBin, protectedRoots, attempt } = input;
  const control = join(runRoot, 'private', 'control');
  mkdirSync(control, { recursive: true });
  const reportPath = join(control, `report-${session.sessionId}-a${String(attempt)}.json`);
  const specPath = join(control, `spec-${session.sessionId}-a${String(attempt)}.json`);
  const payloadSink = join(control, `payload-${session.sessionId}-a${String(attempt)}.json`);
  const transcript = join(control, `transcript-${session.sessionId}-a${String(attempt)}.txt`);
  writeFileSync(specPath, JSON.stringify({
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
    modelId: PRIMARY_EXECUTOR.modelId,
    standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0cr generation'], confirmed: true, notes: [] },
  }, null, 2), 'utf8');

  const started = Date.now();
  let stdout = '';
  let threw = null;
  try {
    stdout = execFileSync(process.execPath, [CHILD_PROGRAM, specPath], {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 2_400_000,
      env: containmentEnvironment(runRoot, process.env, input.trajectoryIds),
    });
  } catch (error) {
    threw = String(error?.message ?? error).slice(0, 300);
    stdout = String(error?.stdout ?? '');
  }
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const infrastructureInvalid = report === null || report.ok !== true || report.jobPhase === 'HOST_ERROR';
  return Object.freeze({ session, generation, attempt, report, payloadSink, transcript, elapsedMs: Date.now() - started, stdout: stdout.trim().split(NL).slice(-2).join(' | '), threw, infrastructureInvalid });
}

/** §12/§14: run ONE trajectory — its generations strictly in order, each in a fresh child process. */
async function runTrajectory(input) {
  const { runRoot, prehistory, home, realDshBin, session, admitted, protectedRoots, trajectoryIds, expectations, closures, topology } = input;
  const { world, paths } = prepareTrajectory(runRoot, session.trajectoryId, prehistory);
  const profile = `r3l0cr${String(session.trajectoryId).replace(/[^a-z0-9]/gu, '')}`;
  const generations = [];
  const witnesses = [];

  for (const generation of GENERATIONS) {
    const sessionId = `${session.trajectoryId}-${generation.id}`;
    const expectation = expectations[sessionId];
    /** §4/§6: the selection is built ONLY through the canonical validating builder. */
    const knowledge = buildSelection({ arm: session.arm, generationId: generation.id, admittedRefs: admitted.refs, generationExposures: GENERATION_EXPOSURES });
    validateSelection(knowledge);

    let attempt = 0;
    let result = null;
    while (attempt < 4) {
      attempt += 1;
      result = runGeneration({ runRoot, world, paths, home, profile, realDshBin, session: { ...session, sessionId }, attempt, generation, knowledge, protectedRoots, trajectoryIds });
      if (!result.infrastructureInvalid) break;
      out(`      ${sessionId} attempt ${String(attempt)} INFRASTRUCTURE_INVALID (${String(result.threw ?? result.report?.jobPhase ?? 'no report').slice(0, 90)})`);
    }
    const report = result.report;
    /** §3: the five telemetry fields, from where each is observable. */
    const telemetry = treatmentTelemetry({ requestedSelection: knowledge, payload: report?.payload ?? null, governedPulls: report?.governedPulls ?? [] });
    /** §6/§15: the realization check against the FROZEN expectation. */
    const realization = verifyRealization(expectation, telemetry);

    const record = {
      sessionId,
      block: session.block,
      arm: session.arm,
      armName: ARMS[session.arm].name,
      generation: generation.id,
      trajectoryId: session.trajectoryId,
      attempt,
      infrastructureInvalid: result.infrastructureInvalid,
      pid: report?.pid ?? null,
      startingHead: report?.startingHead ?? null,
      finalHead: report?.finalHead ?? null,
      projectRevision: report?.projectRevision ?? null,
      jobPhase: report?.jobPhase ?? null,
      attemptId: report?.attemptId ?? null,
      promoted: report?.promoted === true,
      eligible: report?.eligibility?.eligible ?? null,
      sourceDigest: report?.sourceDigest ?? null,
      firstCandidateVector: report?.firstCandidateVector ?? null,
      finalVector: report?.finalVector ?? null,
      projectVerification: report?.projectVerification ?? null,
      payload: report?.payload ?? null,
      governedPulls: report?.governedPulls ?? [],
      elapsedMs: result.elapsedMs,
      transcriptBytes: report?.transcriptBytes ?? null,
      hostError: report?.hostError ?? null,
      error: report?.error ?? null,
      /** §15: the treatment realization evidence, on the record itself. */
      treatment: Object.freeze({
        expectationDigest: expectationDigest(expectation),
        telemetry,
        realization,
        consumerHandleDigest: telemetry.consumerVisibleHandles.length === 0 ? null : closureOf(telemetry.consumerVisibleHandles.join(',')),
        topologyManifestDigest: topology.topologyDigest,
        executionClosureDigest: closures.executionClosureDigest,
      }),
    };
    generations.push(record);

    /** §15: a realization mismatch is INVALID and STOPS the run. */
    if (realization.TREATMENT_REALIZATION !== 'APPLIED') {
      throw new Error(`TREATMENT_NOT_APPLIED at ${sessionId}: expected [${expectation.expectedConsumerVisibleHandles.join(', ')}] but the consumer saw [${telemetry.consumerVisibleHandles.join(', ')}]; §15 forbids retrying this as a model outcome`);
    }

    const expectedHandles = expectation.expectedConsumerVisibleHandles;
    if (session.arm === 'C') {
      witnesses.push(capitalWitness({ sessionId, arm: 'C', block: session.block, generation: generation.id, report: record, admitted: admitted.capital, expectedHandles, associationsPresent: true }));
    } else {
      witnesses.push(historyOnlyWitness({ sessionId, arm: 'H', block: session.block, generation: generation.id, report: record, expectedHandles }));
    }
    const coverage = record.finalVector?.prepaidCoverage;
    out(`      ${sessionId} pid=${String(record.pid)} phase=${String(record.jobPhase)} promoted=${String(record.promoted)} prepaidCov=${coverage === undefined || coverage === null ? 'n/a' : coverage.toFixed(2)} handles=${String(telemetry.compiledTotal)} ${realization.TREATMENT_REALIZATION}`);
  }

  return Object.freeze({
    trajectoryId: session.trajectoryId,
    block: session.block,
    arm: session.arm,
    armName: ARMS[session.arm].name,
    generations: Object.freeze(generations),
    witnesses: Object.freeze(witnesses),
    terminalHead: generations[generations.length - 1]?.finalHead ?? null,
    terminalSourceDigest: generations[generations.length - 1]?.sourceDigest ?? null,
  });
}

/** §15: a digest of a handle set, so a trial record carries the actual consumer handle digest. */
function closureOf(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

async function main() {
  const plan = buildPlanForReplication();
  const committedPath = join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'plan.json');
  if (!existsSync(committedPath)) throw new Error('the frozen plan is not committed: research-evidence/r3-l0c-r/plan.json is absent, so no primary session may start');
  const committed = JSON.parse(readFileSync(committedPath, 'utf8'));
  if (plan.sessions.map((entry) => entry.sessionId).join(',') !== committed.sessions.map((entry) => entry.sessionId).join(',')) {
    throw new Error('the schedule to be executed differs from the frozen plan; refusing to run');
  }

  /** §9: recompute the closure and require it to MATCH the frozen one. */
  out('=== §9 execution closure ===');
  const closures = computeExecutionClosure();
  const closureCheck = checkExecutionClosure(committed.executionClosure);
  out(`  frozen:     ${String(committed.executionClosure?.executionClosureDigest ?? 'ABSENT').slice(0, 16)}`);
  out(`  recomputed: ${closures.executionClosureDigest.slice(0, 16)}`);
  out(`  EXECUTION_CLOSURE: ${closureCheck.EXECUTION_CLOSURE}`);
  if (closureCheck.EXECUTION_CLOSURE !== 'MATCH') throw new Error(`the executable closure drifted (${closureCheck.changed.concat(closureCheck.added, closureCheck.removed).join(', ')}); §9 says STOP and a pre-exposure repair must create a NEW plan commit`);

  const identity = { runId: `run-${new Date().toISOString().replace(/[:.]/gu, '-')}` };
  const lease = acquireLease({ runId: identity.runId, label: 'r3-l0cr-repair-replication' });
  const runRoot = lease.root;
  out(`${NL}R3-L0C-R REPAIR REPLICATION — run ${identity.runId}`);
  out(`  run root: ${runRoot}`);

  /** §8: the topology is DERIVED from the schedule, then used to configure the fence. */
  const trajectoryIds = [...new Set(plan.sessions.map((entry) => entry.trajectoryId))].sort();
  const topology = buildTopologyManifest({ runRoot, units: trajectoryIds });
  prepareRunLayout(runRoot, trajectoryIds);
  out(`${NL}=== §8 topology-derived containment ===`);
  out(`  units: ${topology.unitIds.join(', ')}  digest: ${topology.topologyDigest.slice(0, 16)}`);
  const topologyExistence = manifestPathsExist(topology);
  out(`  protected roots exist: ${String(topologyExistence.allExist)}${topologyExistence.missing.length === 0 ? '' : ` (missing ${String(topologyExistence.missing.length)})`}`);

  out(`${NL}=== §2 preflight infrastructure repairs ===`);
  const preflight = await runPreflight({ runRoot });
  for (const repair of preflight.repairs) out(`  ${repair.id.padEnd(30)} ${repair.green ? 'GREEN' : 'RED'} ${String(repair.detail).slice(0, 60)}`);
  if (preflight.repairs.some((repair) => !repair.green)) throw new Error('a preflight repair is RED; no model call may occur');

  out(`${NL}=== validity gates (pre-matrix) ===`);
  const validity = await runValidityGates({ runRoot, phase: 'pre' });
  out(`  SYSTEM_VALID: ${validity.SYSTEM_VALID ? 'YES' : 'NO'}  EXPERIMENT_ENVIRONMENT_VALID: ${validity.EXPERIMENT_VALID ? 'YES' : 'NO'}`);
  if (validity.SYSTEM_VALID !== true || validity.EXPERIMENT_VALID !== true) throw new Error('validity is not green before trial 1');

  out(`${NL}=== §8 containment canaries against the ACTUAL topology ===`);
  const containment = await runContainmentGate({ runRoot });
  out(`  EXPERIMENT_CONTAINMENT: ${containment.EXPERIMENT_CONTAINMENT} (${String(containment.probes)} probes, liveness ${containment.livenessLive ? 'LIVE' : 'NOT LIVE'})`);
  if (containment.EXPERIMENT_CONTAINMENT !== 'PASS') throw new Error('containment is not PASS');

  /** §7: the REAL-prehistory boundary probe. A dummy project is NOT sufficient. */
  out(`${NL}=== §7 real-prehistory deterministic boundary probe ===`);
  const prehistoryRoot = rigPath(runRoot, 'prehistory');
  const prehistory = await buildPrehistory(prehistoryRoot);
  const admitted = await admitCapital(prehistoryRoot, prehistory.paths, 'cutover-entitlements', prehistory.world);
  const refs = selectionRefs(admitted);
  out(`  prehistory head=${prehistory.head.slice(0, 10)} revision=${String(prehistory.revision)}`);

  const mutations = runSelectionMutations({ admittedRefs: refs, generationId: 'G1' });
  out(`  mutations detected: ${String(mutations.mutationsDetected)}  controls passed: ${String(mutations.controlsPassed)}  launches on mutation: ${String(mutations.REAL_MODEL_LAUNCH_COUNT_ON_ANY_MUTATION)}`);
  if (mutations.TREATMENT_REALIZATION_GATE !== 'PASS') throw new Error(`the selection realization gate failed: ${JSON.stringify(mutations.mutations.filter((entry) => !entry.detected))}`);

  /** §6: the expectation manifests, frozen BEFORE any generation. */
  const expectations = {};
  for (const session of plan.sessions) {
    expectations[session.sessionId] = buildExpectationManifest({ generationId: session.generation, arm: session.arm, admittedRefs: refs, generationExposures: GENERATION_EXPOSURES });
  }
  out(`  expectations: ${String(Object.keys(expectations).length)} frozen`);

  /** §7: the probe drives the real prehistory with the exact selector and the exact associations. */
  const probeRoot = rigPath(runRoot, 'boundary-probe');
  const probeWorld = join(probeRoot, 'world');
  cpSync(prehistory.world, probeWorld, { recursive: true });
  const probeState = join(probeRoot, 'state');
  cpSync(prehistory.paths.state, probeState, { recursive: true });
  const probePaths = Object.freeze({ ...prehistory.paths, state: probeState, orchestration: join(probeState, 'orchestration.sqlite'), ordarium: join(probeState, 'ordarium.sqlite'), association: join(probeState, 'assoc.sqlite'), journal: join(probeState, 'journal.sqlite'), proof: join(probeState, 'proof.sqlite'), proofBlobs: join(probeState, 'proof-blobs'), cells: join(probeState, 'cells.sqlite'), procedures: join(probeState, 'procedures.sqlite') });
  const probeExpectation = expectations['b0-C-G1'];
  const probe = await runRealPrehistoryBoundaryProbe({ projectId: 'cutover-entitlements', world: probeWorld, paths: probePaths, refs, generationId: 'G1', generationExposures: GENERATION_EXPOSURES, expectation: probeExpectation });
  const probeMatch = probeMatchesExpectation(probe, probeExpectation);
  out(`  BOUNDARY_PROBE: ${probe.BOUNDARY_PROBE}  matches expectation: ${String(probeMatch.matches)}  handles: ${String(probe.consumerVisibleHandles.length)}  pulls resolved: ${String(probe.pulls.filter((pull) => pull.resolved).length)}/${String(probe.pulls.length)}`);
  if (probe.BOUNDARY_PROBE !== 'PASS' || probeMatch.matches !== true) throw new Error(`the real-prehistory boundary probe failed (${probe.BOUNDARY_PROBE}, matches=${String(probeMatch.matches)}); §7 requires it to PASS before primary execution`);

  out(`${NL}=== §10 dummy plumbing check (worker path) ===`);
  const plumbing = await runPlumbingCheck({ runRoot, selection: null });
  out(`  plumbing: ${plumbing.ok ? 'OK' : 'FAILED'} — ${String(plumbing.detail).slice(0, 70)}`);
  if (plumbing.ok !== true) throw new Error(`the plumbing check failed: ${String(plumbing.detail)}`);

  const realDshBin = (await import('../gates/env.mjs')).dshBin();
  const SEPARATOR = process.platform === 'win32' ? ';' : ':';
  const protectedRootsFor = (current) => runProtectedRoots(runRoot, trajectoryIds, current).join(SEPARATOR);

  const trajectories = [];
  const sessions = [];
  for (const session of plan.sessions) {
    if (trajectories.some((entry) => entry.trajectoryId === session.trajectoryId)) continue;
    const home = trajectoryHome(runRoot, session.trajectoryId);
    const { installHostBundle, dshHome } = await import('../gates/env.mjs');
    makeProfile(home, PRIMARY_EXECUTOR, `r3l0cr${session.trajectoryId.replace(/[^a-z0-9]/gu, '')}`, installHostBundle, dshHome);
    out(`[block ${String(session.block)}] trajectory ${session.trajectoryId} (${session.armName})`);
    const trajectory = await runTrajectory({
      runRoot, prehistory, home, realDshBin, session,
      admitted: { refs, capital: admitted.admitted },
      protectedRoots: protectedRootsFor(session.trajectoryId), trajectoryIds, expectations, closures, topology,
    });
    trajectories.push(trajectory);
    sessions.push(...trajectory.generations);
    writeFileSync(join(runRoot, 'private', 'evidence', 'trials.partial.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-L0C-R', trajectories, sessions }, null, 2)}${NL}`, 'utf8');
    lease.heartbeat();
  }

  const validSessions = sessions.filter((entry) => entry.infrastructureInvalid !== true);
  const summary = {
    schemaVersion: 1,
    stage: 'R3-L0C-R',
    kind: 'repair replication matrix',
    runId: identity.runId,
    runRoot,
    plannedSessions: plan.sessions.length,
    validSessions: validSessions.length,
    infrastructureInvalidSessions: sessions.filter((entry) => entry.infrastructureInvalid === true).length,
    prehistory: { head: prehistory.head, revision: prehistory.revision, worldDigest: prehistory.worldDigest },
    admittedCapital: admitted.admitted,
    selectionRefs: refs,
    expectations: Object.fromEntries(Object.entries(expectations).map(([id, manifest]) => [id, { arm: manifest.arm, generationId: manifest.generationId, expectedConsumerVisibleHandles: manifest.expectedConsumerVisibleHandles, expectedCounts: manifest.expectedCounts }])),
    topology,
    executionClosure: closures,
    mutations,
    boundaryProbe: probe,
    boundaryProbeMatch: probeMatch,
    trajectories,
    sessions,
    preMatrixValidity: validity,
    preflight,
    containment,
    plumbing,
  };
  mkdirSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH), { recursive: true });
  writeFileSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'matrix.json'), `${JSON.stringify(summary, null, 2)}${NL}`, 'utf8');
  out(`${NL}REPAIR REPLICATION COMPLETE — ${String(validSessions.length)}/${String(plan.sessions.length)} valid sessions`);
  lease.release();
  return summary;
}

/** §14: the replication reuses the ORIGINAL R3-L0C arm order and seed, with fresh session ids. */
function buildPlanForReplication() {
  const base = schedule();
  return Object.freeze({ sessions: Object.freeze(base.map((session) => Object.freeze({ ...session, sessionId: `r-${session.sessionId}`, trajectoryId: `r-${session.trajectoryId}` }))) });
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { buildPlanForReplication, main };
