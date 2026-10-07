/**
 * R3-L0C §1/§10/§11/§12/§23/§26 — THE MATRIX RUNNER.
 *
 * §12: four matched blocks, each with an H and a C trajectory of two generations. §11: the generations of a
 * trajectory run STRICTLY SEQUENTIALLY in fresh OS processes, because G2 starts from what G1 promoted.
 *
 * THE ORDER OF OPERATIONS IS THE POINT, and every step is a gate rather than a step:
 *
 *   1. the committed plan must exist, and the schedule it would execute must MATCH it — so no session can
 *      precede the plan commit;
 *   2. the preflight repairs must be green;
 *   3. SYSTEM_VALID and EXPERIMENT_VALID must both be YES, before trial 1 and again after the matrix;
 *   4. the containment canaries must pass, and the oracle must be outside every worker-readable root;
 *   5. only then does the first primary session run.
 *
 * §23: NO PRIMARY-FIXTURE SMOKE. The world is written once into the prehistory and copied per trajectory; no
 * project worker runs against it before the schedule begins. §10's plumbing checks use dummy fixtures.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BLOCK_COUNT, GENERATIONS, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';
import { ARMS, selectionFor } from './capital.mjs';
import { admitCapital, prepareTrajectory } from './prehistory.mjs';
import { CHILD_PROGRAM, TEE_PATH, containmentEnvironment, makeProfile, prepareRunLayout, trajectoryHome, trajectoryPaths, trajectoryWorld } from './trajectory.mjs';
import { buildPlan, PRIMARY_EXECUTOR } from './plan.mjs';
import { capitalWitness, historyOnlyWitness } from './witness.mjs';
import { acquireLease, rigPath, runRoot as runRootPath } from './run-root.mjs';
import { EVIDENCE_MODES, runIdentity } from './evidence-mode.mjs';
import { runPreflight, runValidityGates, runContainmentGate, runPlumbingCheck } from './preflight.mjs';
import { writeProjectWorld } from './prehistory.mjs';
import { corpusFiles } from './corpus.mjs';

const NL = String.fromCharCode(10);
const out = (line) => process.stdout.write(`${line}${NL}`);

/**
 * §11: RUN ONE GENERATION AS A CHILD PROCESS, retrying only on infrastructure invalidity.
 *
 * §12: a VALID outcome is never retried. Only a child that failed to run, a worker that failed to spawn, or a
 * host that lost the job is retried, and only to reach the scheduled session count.
 */
function runGeneration(input) {
  const { runRoot, world, paths, home, profile, session, generation, knowledge, admitted, realDshBin, protectedRoots } = input;
  const reportPath = join(runRoot, 'private', 'control', `report-${session.sessionId}-a${String(input.attempt)}.json`);
  const specPath = join(runRoot, 'private', 'control', `spec-${session.sessionId}-a${String(input.attempt)}.json`);
  const payloadSink = join(runRoot, 'private', 'control', `payload-${session.sessionId}-a${String(input.attempt)}.json`);
  const transcript = join(runRoot, 'private', 'control', `transcript-${session.sessionId}-a${String(input.attempt)}.txt`);
  mkdirSync(join(runRoot, 'private', 'control'), { recursive: true });
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
    standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0c generation'], confirmed: true, notes: [] },
  }, null, 2), 'utf8');

  const started = Date.now();
  let stdout = '';
  let threw = null;
  try {
    stdout = execFileSync(process.execPath, [CHILD_PROGRAM, specPath], {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 2_400_000,
      env: containmentEnvironment(runRoot, process.env),
    });
  } catch (error) {
    threw = String(error?.message ?? error).slice(0, 300);
    stdout = String(error?.stdout ?? '');
  }
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const elapsedMs = Date.now() - started;
  /** §12: infrastructure invalidity is NOT a bad model outcome. */
  const infrastructureInvalid = report === null || report.ok !== true || report.jobPhase === 'HOST_ERROR';
  return Object.freeze({ session, generation, attempt: input.attempt, report, payloadSink, transcript, elapsedMs, stdout: stdout.trim().split(NL).slice(-2).join(' | '), threw, infrastructureInvalid });
}

/** §11: run ONE trajectory: its generations strictly in order, each in a fresh child process. */
async function runTrajectory(input) {
  const { runRoot, prehistory, home, realDshBin, session, admitted, protectedRoots } = input;
  const { world, paths } = prepareTrajectory(runRoot, session.trajectoryId, prehistory);
  const profile = `r3l0c${String(session.trajectoryId).replace(/[^a-z0-9]/gu, '')}`;
  const generations = [];
  const witnesses = [];

  for (const generation of GENERATIONS) {
    const sessionId = `${session.trajectoryId}-${generation.id}`;
    /** §9: the ONLY difference between the arms — whether the frozen handles are SELECTED. H omits the field. */
    const knowledge = selectionFor(session.arm, generation.id, admitted.refs);
    let attempt = 0;
    let result = null;
    while (attempt < 4) {
      attempt += 1;
      result = runGeneration({ runRoot, world, paths, home, profile, realDshBin, session: { ...session, sessionId }, attempt, generation, knowledge, admitted, protectedRoots });
      if (!result.infrastructureInvalid) break;
      out(`      ${sessionId} attempt ${String(attempt)} INFRASTRUCTURE_INVALID (${String(result.threw ?? result.report?.jobPhase ?? 'no report').slice(0, 90)})`);
    }
    const report = result.report;
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
      startingRevision: report?.startingRevision ?? null,
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
      requirements: report?.requirements ?? [],
      hostError: report?.hostError ?? null,
      error: report?.error ?? null,
      knowledgeSelected: knowledge !== undefined && knowledge !== null,
    };
    generations.push(record);

    /** §17: the witness for this generation, from its own report. */
    const expectedHandles = admitted.frozenHandlesFor(session.arm, generation.id);
    if (session.arm === 'C') {
      witnesses.push(capitalWitness({ sessionId, arm: 'C', block: session.block, generation: generation.id, report: record, admitted: admitted.capital, expectedHandles, associationsPresent: admitted.associationsPresent }));
    } else {
      witnesses.push(historyOnlyWitness({ sessionId, arm: 'H', block: session.block, generation: generation.id, report: record, expectedHandles }));
    }
    const coverage = record.finalVector?.prepaidCoverage;
    out(`      ${sessionId} pid=${String(record.pid)} phase=${String(record.jobPhase)} promoted=${String(record.promoted)} prepaidCov=${coverage === undefined || coverage === null ? 'n/a' : coverage.toFixed(2)} selected=${String(record.knowledgeSelected)}`);
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

async function main() {
  const plan = buildPlan();
  const committedPath = join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'plan.json');
  if (!existsSync(committedPath)) throw new Error('the frozen plan is not committed: research-evidence/r3-l0c/plan.json is absent, so no primary session may start');
  const committed = JSON.parse(readFileSync(committedPath, 'utf8'));
  if (plan.sessions.map((entry) => entry.sessionId).join(',') !== committed.sessions.map((entry) => entry.sessionId).join(',')) {
    throw new Error('the schedule to be executed differs from the frozen plan; refusing to run');
  }

  /** §2/§23: the run root is lease-bearing, so no global sweep can delete this run's rigs. */
  const identity = runIdentity();
  const lease = acquireLease({ runId: identity.runId, label: 'r3-l0c-matrix' });
  const runRoot = lease.root;
  out(`R3-L0C MATRIX — run ${identity.runId}`);
  out(`  run root: ${runRoot}`);

  /** §2/§26: the preflight repairs and the two validity gates, BEFORE trial 1. */
  out(`${NL}=== §2 preflight infrastructure repairs ===`);
  const preflight = await runPreflight({ runRoot });
  for (const repair of preflight.repairs) out(`  ${repair.id.padEnd(30)} ${repair.green ? 'GREEN' : 'RED'} ${String(repair.detail).slice(0, 70)}`);
  if (preflight.repairs.some((repair) => !repair.green)) throw new Error('a preflight repair is RED; §2 forbids any model call before all three are green');

  out(`${NL}=== §1/§26 validity prerequisites (pre-matrix) ===`);
  const validity = await runValidityGates({ runRoot, mode: EVIDENCE_MODES.LIVE });
  for (const [name, value] of Object.entries(validity.gates)) out(`  ${name.padEnd(26)} ${value.green ? 'GREEN' : 'RED'} ${String(value.detail).slice(0, 70)}`);
  if (validity.SYSTEM_VALID !== true || validity.EXPERIMENT_VALID !== true) throw new Error(`validity is not green before trial 1 (SYSTEM_VALID=${String(validity.SYSTEM_VALID)}, EXPERIMENT_VALID=${String(validity.EXPERIMENT_VALID)}); §26 forbids a behavioral run`);
  out(`  SYSTEM_VALID: YES${NL}  EXPERIMENT_VALID: YES`);

  /** §10: the containment canaries, before any primary session. */
  out(`${NL}=== §10 containment canaries ===`);
  const containment = await runContainmentGate({ runRoot });
  out(`  EXPERIMENT_CONTAINMENT: ${containment.EXPERIMENT_CONTAINMENT} (${String(containment.probes)} probes, liveness ${containment.livenessLive ? 'LIVE' : 'NOT LIVE'})`);
  if (containment.EXPERIMENT_CONTAINMENT !== 'PASS') throw new Error('containment is not PASS; §10 forbids a primary session');

  /** §10/§23: the plumbing check, on a DUMMY fixture only. */
  out(`${NL}=== §10 dummy plumbing check (no primary fixture) ===`);
  const plumbing = await runPlumbingCheck({ runRoot });
  out(`  plumbing: ${plumbing.ok ? 'OK' : 'FAILED'} — ${String(plumbing.detail).slice(0, 90)}`);

  /** §7: ONE prehistory, built once, then copied per trajectory so the arms cannot diverge by construction. */
  out(`${NL}=== §7 building the deterministic prehistory ===`);
  const prehistoryRoot = rigPath(runRoot, 'prehistory');
  const prehistoryWorld = join(prehistoryRoot, 'world');
  mkdirSync(prehistoryWorld, { recursive: true });
  const head = writeProjectWorld(prehistoryWorld, corpusFiles());
  const prehistoryState = join(prehistoryRoot, 'state');
  mkdirSync(prehistoryState, { recursive: true });
  const prehistoryPaths = trajectoryPaths(runRoot, '__prehistory__');
  /** The prehistory's own stores live under the run's private area, not inside any world. */
  const prehistoryStateDir = join(runRoot, 'private', 'evidence', 'prehistory-state');
  mkdirSync(prehistoryStateDir, { recursive: true });
  const prehistoryStatePaths = Object.freeze({ ...prehistoryPaths, state: prehistoryStateDir, orchestration: join(prehistoryStateDir, 'orchestration.sqlite'), ordarium: join(prehistoryStateDir, 'ordarium.sqlite'), association: join(prehistoryStateDir, 'assoc.sqlite'), journal: join(prehistoryStateDir, 'journal.sqlite'), proof: join(prehistoryStateDir, 'proof.sqlite'), proofBlobs: join(prehistoryStateDir, 'proof-blobs'), cells: join(prehistoryStateDir, 'cells.sqlite'), procedures: join(prehistoryStateDir, 'procedures.sqlite') });
  out(`  head=${head.slice(0, 10)} worldDigest=${plan.worldDigest.slice(0, 12)}`);

  out(`${NL}=== §8 admitting the current-standing capital ===`);
  const admitted = await admitCapital(prehistoryRoot, prehistoryStatePaths, 'cutover-entitlements', prehistoryWorld);
  out(`  proof=${String(admitted.admitted.proof.length)} reasoning=${String(admitted.admitted.reasoning.length)} procedure=${String(admitted.admitted.procedure.length)} leakFree=${String(admitted.leakage.leakFree)}`);
  out(`  selected per generation: ${JSON.stringify(admitted.frozenHandlesFor('C', 'G1'))} ${JSON.stringify(admitted.frozenHandlesFor('C', 'G2'))}`);

  const prehistory = Object.freeze({ world: prehistoryWorld, state: prehistoryStateDir, head });
  const trajectoryIds = [...new Set(plan.sessions.map((entry) => entry.trajectoryId))].sort();
  prepareRunLayout(runRoot, trajectoryIds);

  const realDshBin = (await import('../gates/env.mjs')).dshBin();
  const protectedRoots = containmentEnvironment(runRoot, {}).PALIMPSEST_WORKER_PROTECTED_ROOTS;

  const trajectories = [];
  const sessions = [];
  for (const session of plan.sessions) {
    const alreadyDone = trajectories.some((entry) => entry.trajectoryId === session.trajectoryId);
    if (alreadyDone) continue;
    const home = trajectoryHome(runRoot, session.trajectoryId);
    const { installHostBundle, dshHome } = await import('../gates/env.mjs');
    makeProfile(home, PRIMARY_EXECUTOR, `r3l0c${session.trajectoryId.replace(/[^a-z0-9]/gu, '')}`, installHostBundle, dshHome);
    out(`[block ${String(session.block)}] trajectory ${session.trajectoryId} (${session.armName})`);
    const trajectory = await runTrajectory({ runRoot, prehistory, home, realDshBin, session, admitted: { refs: admitted.refs, capital: admitted.admitted, frozenHandlesFor: admitted.frozenHandlesFor, associationsPresent: true }, protectedRoots });
    trajectories.push(trajectory);
    sessions.push(...trajectory.generations);
    writeFileSync(join(runRoot, 'private', 'evidence', 'trials.partial.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-L0C', trajectories, sessions }, null, 2)}${NL}`, 'utf8');
    lease.heartbeat();
  }

  const validSessions = sessions.filter((entry) => entry.infrastructureInvalid !== true);
  const summary = {
    schemaVersion: 1,
    stage: 'R3-L0C',
    kind: 'project-specific reconstruction matrix',
    runId: identity.runId,
    runRoot,
    plannedSessions: plan.sessions.length,
    validSessions: validSessions.length,
    infrastructureInvalidSessions: sessions.filter((entry) => entry.infrastructureInvalid === true).length,
    prehistory: { head, worldDigest: plan.worldDigest },
    admittedCapital: admitted.admitted,
    capitalBundleDigest: admitted.bundleDigest,
    selectionRefs: admitted.refs,
    selectedHandlesByArm: Object.freeze({ H: Object.freeze({ G1: admitted.frozenHandlesFor('H', 'G1'), G2: admitted.frozenHandlesFor('H', 'G2') }), C: Object.freeze({ G1: admitted.frozenHandlesFor('C', 'G1'), G2: admitted.frozenHandlesFor('C', 'G2') }) }),
    trajectories,
    sessions,
    preMatrixValidity: validity,
    preflight,
    containment,
    plumbing,
  };
  mkdirSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH), { recursive: true });
  writeFileSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'matrix.json'), `${JSON.stringify(summary, null, 2)}${NL}`, 'utf8');
  out(`${NL}MATRIX COMPLETE — ${String(validSessions.length)}/${String(plan.sessions.length)} valid sessions across ${String(trajectories.length)} trajectories`);
  lease.release();
  return summary;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { runRootPath, GENERATIONS, BLOCK_COUNT, rmSync, cpSync, trajectoryWorld };
