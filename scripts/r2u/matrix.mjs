#!/usr/bin/env node
/**
 * R2-U §27 — GATE B: THE 40-RUN MATRIX.
 *
 * §27 requires ALL 40 primary trials to run, with NO prompt tuning and NO early stopping because uptake
 * looks good or bad, and EVERY trial accounted for with failures recorded honestly.
 *
 * §14/§23: single ACTIVE confidential worker at all times, so this runner is strictly SEQUENTIAL — there is
 * no concurrency to configure, because the Windows confidential profile supports exactly one.
 *
 * §15: the order comes from `design.mjs`'s frozen seed, per scenario, so the four cells of a block are
 * interleaved rather than grouped.
 *
 * ONE PROCESS PER TRIAL, like `trial.mjs` itself, because §9 requires newly bootstrapped trial states and no
 * reuse of previous model sessions.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { blockOrder, EXPECTED_TRIALS, REPETITIONS, SCENARIO_IDS, trialPlan } from './design.mjs';
import { SCENARIOS } from './scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2u', 'matrix');
const SCENARIO_IDS_TO_RUN = (args.get('scenarios') ?? 'C,D').split(',').map((value) => value.trim().toUpperCase()).filter((value) => value !== '');
const REPETITIONS_TO_RUN = Number(args.get('repetitions') ?? String(REPETITIONS));

const out = (line) => process.stdout.write(`${line}\n`);

async function main() {
  const trials = trialPlan(REPETITIONS_TO_RUN, SCENARIO_IDS_TO_RUN);
  const expected = SCENARIO_IDS_TO_RUN.length * 4 * REPETITIONS_TO_RUN;
  if (trials.length !== expected) throw new Error(`the plan produced ${String(trials.length)} trials, expected ${String(expected)}`);
  mkdirSync(RIG, { recursive: true });
  /**
   * A FRESH RUN DIRECTORY PER INVOCATION, and deliberately no `rmSync` of a previous one.
   *
   * A worker's execution world carries a DSH workspace write grant, which sets an ACL on the world tree; a
   * killed run can therefore leave directories this process cannot delete (measured: `EPERM` on `rmSync`,
   * which aborted the whole matrix before a single trial ran).
   *
   * Deleting would be the WRONG fix even if it worked: a fixed path plus a tolerant delete means a trial
   * that failed to write could be read back as a STALE record from the previous run, which is exactly the
   * silent substitution this stage's accounting rules exist to prevent. A unique directory cannot serve a
   * stale record.
   *
   * The run directory is named in `plan.json`, so which trials belong to which invocation is recorded
   * rather than inferred from a path convention.
   */
  const runsDir = join(RIG, `runs-${new Date().toISOString().replace(/[:.]/gu, '-')}`);
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    join(RIG, 'plan.json'),
    JSON.stringify({ schemaVersion: 1, expected, repetitions: REPETITIONS_TO_RUN, seed: '0x52325501', runsDir, blockOrder: SCENARIO_IDS_TO_RUN.map((id) => ({ scenario: id, blocks: blockOrder(REPETITIONS_TO_RUN, id) })), trials }, null, 2),
    'utf8',
  );
  out(`R2-U PRIMARY MATRIX — ${String(trials.length)} trials planned (${SCENARIO_IDS_TO_RUN.join('+')} × K0A0/K1A0/K0A1/K1A1 × ${String(REPETITIONS_TO_RUN)})`);
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
        [join(REPO_ROOT, 'scripts', 'r2u', 'trial.mjs'), `--scenario=${trial.scenarioId}`, `--cell=${trial.cell}`, `--block=${String(trial.block)}`, `--repetition=${String(trial.repetition)}`, `--rig=${runsDir}`],
        { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
      ).trim().split('\n').pop() ?? '';
    } catch (error) {
      line = `HARNESS_ERROR ${error?.message ?? String(error)}`;
    }
    const trialId = `${scenario.id}-${trial.cell}-b${String(trial.block)}r${String(trial.repetition)}`;
    const recordPath = join(runsDir, trialId, 'out', 'trial.json');
    const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : null;
    if (record !== null) records.push(record);
    const seconds = Math.round((Date.now() - started) / 1000);
    out(`[${String(index).padStart(2, ' ')}/${String(trials.length)}] ${trialId.padEnd(16)} ${String(seconds)}s  ${line}`);
    // The partial record is flushed after every trial so an interrupted run leaves an honest trail.
    writeFileSync(join(RIG, 'trials.partial.json'), JSON.stringify({ completed: records.length, expected, trials: records }, null, 2), 'utf8');
  }

  writeFileSync(join(RIG, 'trials.json'), JSON.stringify({ schemaVersion: 1, expected, completed: records.length, trials: records }, null, 2), 'utf8');
  out(`\nPRIMARY MATRIX COMPLETE — ${String(records.length)}/${String(trials.length)} trial records written`);
  out(`record: ${join(RIG, 'trials.json')}`);
  process.exit(0);
}

await main();
