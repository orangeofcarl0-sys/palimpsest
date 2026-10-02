#!/usr/bin/env node
/**
 * R2-S §19 — THE 20-RUN PRIMARY MATRIX.
 *
 * §19 requires 2 scenarios × 2 conditions × 5 repetitions = 20 trials, in five paired randomized blocks
 * per scenario, with NO stochastic C/D pilot, NO adaptive tuning, NO prompt edits, NO preview edits, NO
 * fixture edits, NO manual rescue, and EVERY scheduled trial accounted for.
 *
 * §13/§23: a single ACTIVE confidential worker at all times, so this runner is strictly SEQUENTIAL.
 *
 * §11: the block's frozen distractor set is passed to the trial explicitly, so a trial cannot choose its
 * own candidate set. The distractor set is part of the frozen plan, and the plan is written to disk before
 * the first trial runs.
 *
 * ONE PROCESS PER TRIAL, because §19 requires newly bootstrapped trial states and no reuse of previous
 * model sessions.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { blockOrder, CONDITIONS, distractorSchedule, EXPECTED_TRIALS, KINDS, REPETITIONS, SCENARIO_IDS, trialPlan } from './design.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2s', 'matrix');
const SCENARIO_IDS_TO_RUN = (args.get('scenarios') ?? 'C,D').split(',').map((value) => value.trim().toUpperCase()).filter((value) => value !== '');
const REPETITIONS_TO_RUN = Number(args.get('repetitions') ?? String(REPETITIONS));

const out = (line) => process.stdout.write(`${line}\n`);

async function main() {
  const trials = trialPlan(REPETITIONS_TO_RUN, SCENARIO_IDS_TO_RUN);
  const expected = SCENARIO_IDS_TO_RUN.length * CONDITIONS.length * REPETITIONS_TO_RUN;
  if (trials.length !== expected) throw new Error(`the plan produced ${String(trials.length)} trials, expected ${String(expected)}`);
  mkdirSync(RIG, { recursive: true });
  /**
   * A FRESH RUN DIRECTORY PER INVOCATION, and deliberately no `rmSync` of a previous one: a worker's world
   * carries a DSH workspace write grant that sets an ACL this process may not be able to delete (measured
   * EPERM), and a fixed path plus a tolerant delete would let a failed trial read back as a STALE record.
   */
  const runsDir = join(RIG, `runs-${new Date().toISOString().replace(/[:.]/gu, '-')}`);
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    join(RIG, 'plan.json'),
    JSON.stringify({
      schemaVersion: 1,
      stage: 'R2-S',
      expected,
      repetitions: REPETITIONS_TO_RUN,
      seed: '0x52530201',
      runsDir,
      blockOrder: SCENARIO_IDS_TO_RUN.map((id) => ({ scenario: id, blocks: blockOrder(REPETITIONS_TO_RUN, id) })),
      distractorSchedule: SCENARIO_IDS_TO_RUN.map((id) => ({ scenario: id, blocks: distractorSchedule(id, REPETITIONS_TO_RUN) })),
      trials: trials.map((trial) => ({ scenarioId: trial.scenarioId, block: trial.block, repetition: trial.repetition, condition: trial.condition, targetBundle: trial.targetBundle, distractors: KINDS.map((kind) => trial.distractorSet[kind]) })),
    }, null, 2),
    'utf8',
  );
  out(`R2-S CAPITAL-SELECTIVITY MATRIX — ${String(trials.length)} trials planned (${SCENARIO_IDS_TO_RUN.join('+')} × S0/S1 × ${String(REPETITIONS_TO_RUN)})`);
  out(`block ordering (frozen seed): ${SCENARIO_IDS_TO_RUN.map((id) => `${id}:${blockOrder(REPETITIONS_TO_RUN, id).map((block) => `b${String(block.block)}[${block.order.join(',')}]`).join(' ')}`).join('  |  ')}`);
  out(`distractor sets: ${SCENARIO_IDS_TO_RUN.map((id) => `${id}:${distractorSchedule(id, REPETITIONS_TO_RUN).map((entry) => `b${String(entry.block)}[${entry.key}]`).join(' ')}`).join('  |  ')}`);

  const records = [];
  let index = 0;
  for (const trial of trials) {
    index += 1;
    const scenario = SCENARIOS[trial.scenarioId];
    const started = Date.now();
    const distractors = KINDS.map((kind) => trial.distractorSet[kind]).join(',');
    let line;
    try {
      line = execFileSync(
        process.execPath,
        [join(REPO_ROOT, 'scripts', 'r2s', 'trial.mjs'), `--scenario=${trial.scenarioId}`, `--condition=${trial.condition}`, `--block=${String(trial.block)}`, `--repetition=${String(trial.repetition)}`, `--distractors=${distractors}`, `--rig=${runsDir}`],
        { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
      ).trim().split('\n').pop() ?? '';
    } catch (error) {
      line = `HARNESS_ERROR ${error?.message ?? String(error)}`;
    }
    const trialId = `${scenario.id}-${trial.condition}-b${String(trial.block)}r${String(trial.repetition)}`;
    const recordPath = join(runsDir, trialId, 'out', 'trial.json');
    const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : null;
    if (record !== null) records.push(record);
    const seconds = Math.round((Date.now() - started) / 1000);
    out(`[${String(index).padStart(2, ' ')}/${String(trials.length)}] ${trialId.padEnd(16)} ${String(seconds)}s  ${line}`);
    writeFileSync(join(RIG, 'trials.partial.json'), JSON.stringify({ completed: records.length, expected, trials: records }, null, 2), 'utf8');
  }

  writeFileSync(join(RIG, 'trials.json'), JSON.stringify({ schemaVersion: 1, stage: 'R2-S', expected, completed: records.length, trials: records }, null, 2), 'utf8');
  out(`\nPRIMARY MATRIX COMPLETE — ${String(records.length)}/${String(trials.length)} trial records written`);
  out(`record: ${join(RIG, 'trials.json')}`);
  process.exit(0);
}

await main();
