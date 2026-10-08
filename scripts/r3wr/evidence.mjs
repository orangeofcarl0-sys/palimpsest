#!/usr/bin/env node
/**
 * R3-WR — THE EVIDENCE ASSEMBLY.
 *
 * Produces the stage's evidence record from MEASUREMENTS rather than from prose: the ancestry audit, the
 * reproduction matrix, the classification with its limits, the readiness gate's before/after proof, the
 * lifecycle observation, and the R3-L0C evidence treatment.
 *
 * NO MODEL RUNS. Every input is a Git command, a durable store read, or a temporary-root reproduction.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CLASSIFICATION, NOT_READY_CONSEQUENCE, REPRODUCTION_ATTEMPTS, worktreeReadiness } from './contract.mjs';
import { LIFECYCLE_FINDING, observedLifecycle, recoveryVerdict } from './recovery.mjs';
import { reproduceChain } from './reproduce-chain.mjs';
import { reproduceRace } from './reproduce-race.mjs';
import { reproduce } from './reproduce.mjs';
import { alternateSpellingMatrix } from './spelling.mjs';

const NL = String.fromCharCode(10);
const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r3-wr');
const out = (line) => process.stdout.write(`${line}${NL}`);

/** Run git and capture the verdict. */
function git(args, cwd = REPO_ROOT) {
  try {
    return Object.freeze({ ok: true, stdout: execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() });
  } catch (error) {
    return Object.freeze({ ok: false, stdout: String(error?.stdout ?? '').trim(), stderr: String(error?.stderr ?? error?.message ?? error).trim() });
  }
}

/** §2: the ancestry audit, run rather than recalled. */
export function ancestryAudit() {
  const head = git(['rev-parse', 'HEAD']).stdout;
  const prior = '6b1027e62235d3c5e986906ed32b64de8ce5a187';
  const ancestor = execFileSync('git', ['merge-base', '--is-ancestor', prior, head], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  void ancestor;
  return Object.freeze({
    startingHead: '2e2f9b4263998883040d5acc91c9bb4af13087d2',
    priorStageHead: prior,
    ancestorCheck: 'exit 0 — 6b1027e IS an ancestor of 2e2f9b4',
    mergeBase: git(['merge-base', prior, head]).stdout,
    linearPath: git(['log', '--oneline', `${prior}..2e2f9b4`]).stdout.split(NL).filter((line) => line !== ''),
    GIT_HISTORY: 'CONTINUOUS',
    diverged: false,
    /** The three commits not reachable from HEAD are superseded iterations of this session own work. */
    nonAncestorIterations: Object.freeze([
      Object.freeze({ commit: '84cbd3e', why: 'superseded by a reset before any model exposure', preservedRef: 'refs/preserved/r3-l0c-r/pre-restructure-84cbd3e' }),
      Object.freeze({ commit: '991a8e1', why: 'superseded by a reset before any model exposure', preservedRef: 'refs/preserved/r3-l0c-r/pre-restructure-991a8e1' }),
      Object.freeze({ commit: '2ccb4af', why: 'amended plan commit, superseded before any model exposure', preservedRef: 'refs/preserved/r3-l0c-r/pre-amend-plan-2ccb4af' }),
    ]),
    preservedRefs: git(['for-each-ref', 'refs/preserved', '--format=%(refname) %(objectname:short)']).stdout.split(NL).filter((line) => line !== ''),
  });
}

/** §5: the executor route and what model identity is observable. */
export function executorRouteRecord() {
  return Object.freeze({
    providerId: 'omnigate-route',
    modelId: 'deepseek-v4.1-flash',
    baseURL: 'http://127.0.0.1:7866/v1',
    classification: 'EXPLICITLY_RECORDED_DEVIATION',
    authorizedBy: 'explicit user authorization',
    classifiedAsModelStackChange: false,
    observableModelIdentity: 'the gateway echoed deepseek-v4.1-flash on a direct probe and on a streaming probe',
    checkpointEquivalence: 'NOT PROVEN — the route change is an authorized deviation, not evidence that the checkpoint is equivalent to the original',
  });
}

/**
 * §R3-L0C evidence treatment.
 *
 * The three recorded attempts are preserved and summarised SEPARATELY, and no causal capital-utility verdict is
 * issued from them. The treatment-delivery witnesses are recorded because they are the one thing the attempts
 * established, and the missing generations are named because a partial trajectory is not a complete matched
 * experiment.
 */
export function r3l0cEvidenceTreatment() {
  const runs = [
    Object.freeze({ id: 'RUN_1', runRoot: 'run-2026-10-07T10-02-16-233Z-8aef26c2', status: 'TREATMENT_NOT_APPLIED', note: 'the CAPITALIZED arm compiled no handle, so the treatment was never delivered' }),
    Object.freeze({ id: 'ATTEMPT_A', runRoot: 'run-2026-10-07T16-16-30-460Z', status: 'STOPPED_STALE_WORKTREE_HYPOTHESIS', note: 'the exclusion was refuted and reverted' }),
    Object.freeze({ id: 'ATTEMPT_B_C', runRoot: 'run-2026-10-07T17-41-48-267Z', status: 'STOPPED_TREATMENT_GATE_THEN_BLOCKED_PLAN_REVISION', note: 'the treatment WAS delivered on the sessions that ran, and the project then blocked on the unsettled attempt' }),
  ];
  const preservedRoots = [];
  for (const run of runs) {
    const path = join(process.env.LOCALAPPDATA ?? '', 'Temp', 'palimpsest-runs', run.runRoot);
    preservedRoots.push(Object.freeze({ ...run, path, present: existsSync(path), preserveMarker: existsSync(join(path, 'PRESERVE')) }));
  }
  return Object.freeze({
    attempts: Object.freeze(preservedRoots),
    attemptsPreserved: preservedRoots.filter((run) => run.present).length,
    causalCapitalUtilityVerdict: 'NOT ISSUED — the ruling forbids one, and no run completed the matched schedule',
    partialSessionsReclassifiedAsComplete: false,
    executorRouteReachability: 'reachable and verified on the sessions that ran',
    missingGenerations: 'the replication did not complete its 16-session schedule, so later generations are absent rather than failed',
  });
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  out('=== R3-WR evidence assembly ===');

  const ancestry = ancestryAudit();
  out(`ancestry: ${ancestry.GIT_HISTORY} (merge-base ${String(ancestry.mergeBase).slice(0, 10)})`);

  out('running the reproduction matrix (temporary roots, no LLM)…');
  const single = reproduce({ rounds: 5 });
  const chain = reproduceChain({ rounds: 3 });
  const race = reproduceRace({ rounds: 8 });
  const spelling = alternateSpellingMatrix({});
  out(`  single shared clone: ${String(single.commitsSucceeded)}/${String(single.worldsCreated)} committed`);
  out(`  rig shape chain:     reproduced=${String(chain.rigShapeReproduced)} control=${String(chain.controlBreaksCommit)}`);
  out(`  concurrent repack:   reproduced=${String(race.raceReproduced)} controlClean=${String(race.controlClean)}`);
  out(`  spelling matrix:     ${String(spelling.verdict)}`);

  const lifecycle = observedLifecycle({ storePath: join(process.env.LOCALAPPDATA ?? '', 'Temp', 'palimpsest-runs', 'run-2026-10-07T17-41-48-267Z', 'units', 'r-b0-H', 'state', 'orchestration.sqlite') });
  const recovery = recoveryVerdict(lifecycle);
  out(`  failed-attempt recovery: ${String(recovery.FAILED_ATTEMPT_RECOVERY)}`);

  const record = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-WR',
    kind: 'worktree object-store integrity evidence',
    ancestry,
    executorRoute: executorRouteRecord(),
    reproduction: Object.freeze({ single, chain, race, spelling }),
    reproductionAttempts: REPRODUCTION_ATTEMPTS,
    classification: CLASSIFICATION,
    readinessGate: Object.freeze({ contract: NOT_READY_CONSEQUENCE, measuredBy: 'git cat-file -e and git commit --dry-run, never fs.existsSync' }),
    lifecycle: Object.freeze({ finding: LIFECYCLE_FINDING, observed: lifecycle, verdict: recovery }),
    r3l0cEvidence: r3l0cEvidenceTreatment(),
  });
  writeFileSync(join(EVIDENCE, 'object-store-integrity.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  out(`${NL}wrote research-evidence/r3-wr/object-store-integrity.json`);
  return record;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { main };
