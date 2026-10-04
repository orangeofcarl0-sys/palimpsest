#!/usr/bin/env node
/**
 * R2-V §10 — THE 20-RUN SCENARIO-D UTILITY MATRIX.
 *
 * §10 requires 4 arms × 5 stochastic repetitions = 20 Scenario-D trials, in randomized blocks containing ALL
 * FOUR arms, with NO adaptive stopping and NO behavioural pilot on D. The order comes from `design.mjs`'s
 * frozen seed, and the frozen plan is written to disk BEFORE the first trial runs.
 *
 * §23/§12: a single ACTIVE confidential worker at all times, so this runner is strictly SEQUENTIAL, and ONE
 * PROCESS PER TRIAL because §10 requires newly bootstrapped trial states and no reuse of previous model
 * sessions.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { ARMS, blockOrder, CONDITIONS, EXPECTED_TRIALS, PROTOCOL_SEED, REPETITIONS, SCENARIO_IDS, trialPlan } from './design.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2v', 'matrix');
const SCENARIO_IDS_TO_RUN = (args.get('scenarios') ?? 'D').split(',').map((value) => value.trim().toUpperCase()).filter((value) => value !== '');
const REPETITIONS_TO_RUN = Number(args.get('repetitions') ?? String(REPETITIONS));

const out = (line) => process.stdout.write(`${line}\n`);

async function main() {
  const trials = trialPlan(REPETITIONS_TO_RUN, SCENARIO_IDS_TO_RUN);
  const expected = SCENARIO_IDS_TO_RUN.length * CONDITIONS.length * REPETITIONS_TO_RUN;
  if (trials.length !== expected) throw new Error(`the plan produced ${String(trials.length)} trials, expected ${String(expected)}`);
  mkdirSync(RIG, { recursive: true });
  /** A FRESH RUN DIRECTORY PER INVOCATION: a worker's world carries an ACL this process may not delete. */
  const runsDir = join(RIG, `runs-${new Date().toISOString().replace(/[:.]/gu, '-')}`);
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    join(RIG, 'plan.json'),
    JSON.stringify({
      schemaVersion: 1,
      stage: 'R2-V',
      expected,
      repetitions: REPETITIONS_TO_RUN,
      seed: `0x${PROTOCOL_SEED.toString(16)}`,
      runsDir,
      arms: Object.fromEntries(CONDITIONS.map((id) => [id, ARMS[id].bundles])),
      blockOrder: SCENARIO_IDS_TO_RUN.map((id) => ({ scenario: id, blocks: blockOrder(REPETITIONS_TO_RUN, id) })),
      trials: trials.map((trial) => ({ scenarioId: trial.scenarioId, block: trial.block, repetition: trial.repetition, condition: trial.condition, bundles: trial.bundles })),
    }, null, 2),
    'utf8',
  );
  out(`R2-V UTILITY-CALIBRATION MATRIX — ${String(trials.length)} trials planned (${SCENARIO_IDS_TO_RUN.join('+')} × V0/V1/V2/V3 × ${String(REPETITIONS_TO_RUN)})`);
  out(`arms: ${CONDITIONS.map((id) => `${id}=${ARMS[id].bundles.join('+')}`).join('  ')}`);
  out(`block ordering (frozen seed): ${SCENARIO_IDS_TO_RUN.map((id) => `${id}:${blockOrder(REPETITIONS_TO_RUN, id).map((block) => `b${String(block.block)}[${block.order.join(',')}]`).join(' ')}`).join('  |  ')}`);

  const records = [];
  let index = 0;
  for (const trial of trials) {
    index += 1;
    const scenario = SCENARIOS[trial.scenarioId];
    const started = Date.now();
    let line;
    try {
      line = execFileSync(
        process.execPath,
        [join(REPO_ROOT, 'scripts', 'r2v', 'trial.mjs'), `--scenario=${trial.scenarioId}`, `--condition=${trial.condition}`, `--block=${String(trial.block)}`, `--repetition=${String(trial.repetition)}`, `--rig=${runsDir}`],
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
    out(`[${String(index).padStart(2, ' ')}/${String(trials.length)}] ${trialId.padEnd(14)} ${String(seconds)}s  ${line}`);
    writeFileSync(join(RIG, 'trials.partial.json'), JSON.stringify({ completed: records.length, expected, trials: records }, null, 2), 'utf8');
  }

  writeFileSync(join(RIG, 'trials.json'), JSON.stringify({ schemaVersion: 1, stage: 'R2-V', expected, completed: records.length, trials: records }, null, 2), 'utf8');
  out(`\nPRIMARY MATRIX COMPLETE — ${String(records.length)}/${String(trials.length)} trial records written`);
  out(`record: ${join(RIG, 'trials.json')}`);
  process.exit(0);
}

await main();
