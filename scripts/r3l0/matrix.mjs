#!/usr/bin/env node
/**
 * R3-L0 §12/§14/§15/§26 — THE TRAJECTORY MATRIX RUNNER.
 *
 * §12: the TRAJECTORY is the primary unit, and generations are NEVER reset — G(n+1) starts from whatever G(n)
 * actually promoted. So a trajectory is run as one sequential unit: the prehistory world is copied per
 * trajectory, and each generation mutates the SAME durable repository in order.
 *
 * §14: four matched blocks, each with one H and one C trajectory of three generations. The arm order within a
 * block comes from the FROZEN randomization, and the runner REFUSES to start unless the committed plan matches
 * the schedule it would execute — so no session can precede the plan commit.
 *
 * §15: the budget is 24 valid sessions. An infrastructure-invalid session is retried only to reach the scheduled
 * count; a VALID outcome is never retried.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { admitCapital, buildPrehistory } from './prehistory.mjs';
import { GENERATIONS, LEDGER_ERRORS, LEDGER_PLANS } from './project.mjs';
import { ARMS, knowledgeSelectionFor } from './capital.mjs';
import { CHILD_PROGRAM, TEE_PATH, makeProfile, sha256, trajectoryPaths, trajectoryRoot, writeProjectWorld } from './trajectory.mjs';
import { PREHISTORY_LEDGER_SOURCE } from './prehistory.mjs';
import { REPO_ROOT, STAGE_EVIDENCE_PATH, digestHistoricalEvidence, runLoadBearingSystemGates, systemValidFrom } from './envelope.mjs';
import { buildPlan, PRIMARY_EXECUTOR } from './plan.mjs';
import { capitalWitness, historyOnlyWitness } from './witness.mjs';

const NL = String.fromCharCode(10);
const out = (line) => process.stdout.write(`${line}${NL}`);

/** §14: the trajectory's durable paths, so a restart is a genuine re-attachment. */
function prepareTrajectory(root, prehistory) {
  const repo = join(root, 'repo');
  cpSync(join(prehistory.root, 'prehistory-repo'), repo, { recursive: true });
  /** §5: the durable stores are copied from the prehistory, so both arms inherit the SAME paid-for history. */
  const paths = trajectoryPaths(root);
  cpSync(join(prehistory.paths.state), paths.state, { recursive: true });
  return Object.freeze({ repo, paths });
}

/** §13: the profile for one trajectory, so each trajectory has its own home and session space. */
function prepareHome(root, label) {
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  makeProfile(home, PRIMARY_EXECUTOR, `r3l0${label.replace(/[^a-z0-9]/gu, '')}`);
  return home;
}

/**
 * §14/§15: run ONE generation as a child process, retrying only on infrastructure invalidity.
 *
 * §4: the child is a FRESH OS PROCESS. Nothing from a previous generation crosses except the durable stores.
 */
function runGeneration(input) {
  const { root, repo, paths, home, profile, session, attempt, generation, knowledge, admitted } = input;
  const reportPath = join(root, `report-${session.sessionId}-a${String(attempt)}.json`);
  const specPath = join(root, `spec-${session.sessionId}-a${String(attempt)}.json`);
  const payloadSink = join(root, `payload-${session.sessionId}-a${String(attempt)}.json`);
  const transcript = join(root, `transcript-${session.sessionId}-a${String(attempt)}.txt`);
  writeFileSync(specPath, JSON.stringify({
    repoRoot: REPO_ROOT,
    projectId: 'entitlement-ledger',
    repo,
    paths,
    dshHome: home,
    realDshBin: input.realDshBin,
    profile,
    teePath: TEE_PATH,
    payloadSink,
    transcript,
    workRoot: root,
    reportPath,
    arm: session.arm,
    block: session.block,
    generation: generation.id,
    requirement: generation.requirement,
    objective: generation.objective,
    projectGoal: generation.projectGoal,
    knowledge: knowledge ?? null,
    standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0 generation'], confirmed: true, notes: [] },
    supportFiles: { 'plans.mjs': LEDGER_PLANS, 'errors.mjs': LEDGER_ERRORS },
  }, null, 2), 'utf8');

  const started = Date.now();
  let stdout = '';
  let threw = null;
  try {
    stdout = execFileSync(process.execPath, [CHILD_PROGRAM, specPath], {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 2_400_000,
    });
  } catch (error) {
    threw = String(error?.message ?? error).slice(0, 300);
    stdout = String(error?.stdout ?? '');
  }
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const elapsedMs = Date.now() - started;
  /** §15: infrastructure invalidity is NOT a bad model outcome. */
  const infrastructureInvalid = report === null || report.ok !== true || report.jobPhase === 'HOST_ERROR';
  return Object.freeze({ session, generation, attempt, report, payloadSink, transcript, elapsedMs, stdout: stdout.trim().split(NL).slice(-2).join(' | '), threw, infrastructureInvalid });
}

/**
 * §14: run ONE trajectory: its generations strictly in order, each in a fresh child process.
 */
async function runTrajectory(input) {
  const { root, prehistory, home, realDshBin, session, admitted } = input;
  const { repo, paths } = prepareTrajectory(root, prehistory);
  const profile = `r3l0${String(session.trajectoryId).replace(/[^a-z0-9]/gu, '')}`;
  const generations = [];
  const witnesses = [];

  for (const generation of GENERATIONS) {
    const sessionId = `${session.trajectoryId}-${generation.id}`;
    /** §7: the ONLY difference between the arms. H omits the field; C passes the governed selection. */
    const knowledge = knowledgeSelectionFor(session.arm, admitted.refs);
    let attempt = 0;
    let result = null;
    while (attempt < 4) {
      attempt += 1;
      result = runGeneration({ root, repo, paths, home, profile, realDshBin, session: { ...session, sessionId }, attempt, generation, knowledge, admitted });
      if (!result.infrastructureInvalid) break;
      out(`      ${sessionId} attempt ${String(attempt)} INFRASTRUCTURE_INVALID (${String(result.threw ?? result.report?.jobPhase ?? 'no report').slice(0, 90)})`);
    }
    const record = {
      sessionId,
      block: session.block,
      arm: session.arm,
      armName: ARMS[session.arm].name,
      generation: generation.id,
      trajectoryId: session.trajectoryId,
      attempt,
      infrastructureInvalid: result.infrastructureInvalid,
      pid: result.report?.pid ?? null,
      startingHead: result.report?.startingHead ?? null,
      finalHead: result.report?.finalHead ?? null,
      startingRevision: result.report?.startingRevision ?? null,
      projectRevision: result.report?.projectRevision ?? null,
      jobPhase: result.report?.jobPhase ?? null,
      attemptId: result.report?.attemptId ?? null,
      promoted: result.report?.promoted === true,
      eligible: result.report?.eligibility?.eligible ?? null,
      sourceDigest: result.report?.sourceDigest ?? null,
      diagnostic: result.report?.diagnostic ?? null,
      visibleOracle: result.report?.visibleOracle ?? null,
      payload: result.report?.payload ?? null,
      governedPulls: result.report?.governedPulls ?? [],
      elapsedMs: result.elapsedMs,
      transcriptBytes: result.report?.transcriptBytes ?? null,
      requirements: result.report?.requirements ?? [],
      hostError: result.report?.hostError ?? null,
      error: result.report?.error ?? null,
    };
    generations.push(record);

    /** §16/§17: the witness for this generation, from its own report. */
    if (session.arm === 'C') {
      witnesses.push(capitalWitness({
        report: record,
        admittedCapital: admitted.capital,
        expectedHandles: admitted.refs.allHandles,
        lessonExposed: generation.exposes.length > 0,
        bypassClean: true,
        associationsPresent: true,
      }));
    } else {
      witnesses.push(historyOnlyWitness({ report: record, expectedHandles: admitted.refs.allHandles, bypassClean: true }));
    }
    out(`      ${sessionId} pid=${String(record.pid)} phase=${String(record.jobPhase)} promoted=${String(record.promoted)} cov=${record.diagnostic === null ? 'n/a' : record.diagnostic.coverage.toFixed(2)} failed=${record.diagnostic === null ? 'n/a' : (record.diagnostic.failedClasses.join(',') || 'none')}`);
  }

  return Object.freeze({
    trajectoryId: session.trajectoryId,
    block: session.block,
    arm: session.arm,
    armName: ARMS[session.arm].name,
    generations: Object.freeze(generations),
    witnesses: Object.freeze(witnesses),
    /** §12: the terminal state this trajectory left, so path dependence is visible. */
    terminalHead: generations[generations.length - 1]?.finalHead ?? null,
    terminalRevision: generations[generations.length - 1]?.projectRevision ?? null,
    terminalSourceDigest: generations[generations.length - 1]?.sourceDigest ?? null,
  });
}

/** §6: the owner references the selection needs, read back out of the admitted capital record. */
function selectionRefs(admitted) {
  const proof = admitted.admitted.proof.map((entry) => ({ claimId: entry.claimId }));
  const reasoning = admitted.admitted.reasoning.filter((entry) => entry.claimId !== null).map((entry) => ({ cellId: entry.cellId, claimId: entry.claimId }));
  const procedure = admitted.admitted.procedure.filter((entry) => entry.published === true).map((entry) => ({ procedureId: entry.procedureId, revision: entry.revision, reason: `the prepaid method for ${entry.lesson}` }));
  const allHandles = [
    ...proof.map((entry) => `@ctx/proof/${entry.claimId}`),
    ...reasoning.map((entry) => `@ctx/reasoning/${entry.cellId}/${entry.claimId}`),
    ...procedure.map((entry) => `@ctx/procedure/${entry.procedureId}/${String(entry.revision)}`),
  ];
  return Object.freeze({ proof: Object.freeze(proof), reasoning: Object.freeze(reasoning), procedure: Object.freeze(procedure), allHandles: Object.freeze(allHandles) });
}

async function main() {
  const plan = buildPlan();
  const committedPath = join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'plan.json');
  if (!existsSync(committedPath)) throw new Error('the frozen plan is not committed: research-evidence/r3-l0/plan.json is absent, so no primary session may start');
  const committed = JSON.parse(readFileSync(committedPath, 'utf8'));
  const key = (entry) => `${entry.sessionId}`;
  if (plan.sessions.map(key).join(',') !== committed.sessions.map(key).join(',')) throw new Error('the schedule to be executed differs from the frozen plan; refusing to run');

  /** §1/§22: the load-bearing gates run BEFORE the matrix, and a red gate stops the stage. */
  out('=== pre-matrix load-bearing system gates ===');
  const gates = runLoadBearingSystemGates();
  const sv = systemValidFrom(gates);
  for (const [name, value] of Object.entries(gates)) if (name !== 'kind') out(`  ${name.padEnd(26)} ${value.green ? 'GREEN' : 'RED'} ${String(value.detail).slice(0, 70)}`);
  if (sv.SYSTEM_VALID !== true) throw new Error(`SYSTEM_VALID is NO (${sv.notGreen.join(', ')}); §1 says STOP and no behavioural result may repair it`);
  out(`  SYSTEM_VALID: YES${NL}`);

  const rigRoot = trajectoryRoot('matrix');
  const runDir = join(rigRoot, `run-${new Date().toISOString().replace(/[:.]/gu, '-')}`);
  mkdirSync(runDir, { recursive: true });
  const realDshBin = (await import('../gates/env.mjs')).dshBin();

  /** §5: ONE prehistory, built once, then copied per trajectory so the arms cannot diverge by construction. */
  out('=== building the deterministic prehistory ===');
  const prehistoryRoot = join(runDir, 'prehistory');
  mkdirSync(prehistoryRoot, { recursive: true });
  const prehistory = await buildPrehistory(prehistoryRoot);
  const prehistoryPaths = trajectoryPaths(join(prehistoryRoot, 'prehistory-state'));
  out(`  head=${String(prehistory.head).slice(0, 10)} revision=${String(prehistory.revision)} incidents=${prehistory.incidents.map((entry) => `${entry.taskId}:${String(entry.promoted)}`).join(',')}`);

  /** §6: ONE capital bundle, admitted once into the prehistory stores. */
  out('=== admitting the frozen capital bundle ===');
  const admitted = await admitCapital(prehistoryRoot, prehistoryPaths, 'entitlement-ledger', join(prehistoryRoot, 'prehistory-repo'));
  out(`  proof=${String(admitted.admitted.proof.length)} reasoning=${String(admitted.admitted.reasoning.length)} procedure=${String(admitted.admitted.procedure.length)} leakFree=${String(admitted.leakage.leakFree)}`);
  const refs = selectionRefs(admitted);
  out(`  handles: ${refs.allHandles.join(', ')}${NL}`);

  const prehistoryForCopy = Object.freeze({ root: prehistoryRoot, paths: { state: prehistoryPaths.state } });
  const trajectories = [];
  const sessions = [];
  let index = 0;
  for (const session of plan.sessions) {
    index += 1;
    const root = join(runDir, session.trajectoryId);
    /** §14: a trajectory is one unit; its three generations run sequentially inside it. */
    const alreadyDone = trajectories.some((entry) => entry.trajectoryId === session.trajectoryId);
    if (alreadyDone) continue;
    mkdirSync(root, { recursive: true });
    const home = prepareHome(root, session.trajectoryId);
    out(`[block ${String(session.block)}] trajectory ${session.trajectoryId} (${session.armName})`);
    const trajectory = await runTrajectory({ root, prehistory: prehistoryForCopy, home, realDshBin, session, admitted: { refs, capital: admitted.admitted } });
    trajectories.push(trajectory);
    sessions.push(...trajectory.generations);
    writeFileSync(join(runDir, 'trials.partial.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-L0', trajectories, sessions }, null, 2)}${NL}`, 'utf8');
  }

  const validSessions = sessions.filter((entry) => entry.infrastructureInvalid !== true);
  const summary = {
    schemaVersion: 1,
    stage: 'R3-L0',
    kind: 'longitudinal trajectory matrix',
    runDir,
    plannedSessions: plan.sessions.length,
    validSessions: validSessions.length,
    infrastructureInvalidSessions: sessions.filter((entry) => entry.infrastructureInvalid === true).length,
    prehistory: { head: prehistory.head, revision: prehistory.revision, worldDigest: prehistory.worldDigest, incidents: prehistory.incidents },
    admittedCapital: admitted.admitted,
    capitalBundleDigest: admitted.bundleDigest,
    selectionRefs: refs,
    trajectories,
    sessions,
    preMatrixSystemValid: sv,
  };
  mkdirSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH), { recursive: true });
  writeFileSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'matrix.json'), `${JSON.stringify(summary, null, 2)}${NL}`, 'utf8');
  out(`${NL}MATRIX COMPLETE — ${String(validSessions.length)}/${String(plan.sessions.length)} valid sessions across ${String(trajectories.length)} trajectories`);
  return summary;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
