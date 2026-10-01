#!/usr/bin/env node
/**
 * R2-U §13 — CALIBRATION (C0 ONLY).
 *
 * For Scenario D: THREE fresh C0 stochastic workers, and reject the fixture if it sits at either extreme:
 *
 *   CEILING  all three first submissions fully satisfy hidden acceptance
 *   FLOOR    all three fail to make meaningful progress
 *
 * §13 also forbids developing Scenario D by repeatedly tuning against the same five-trial primary
 * distribution, which is why calibration runs its own three trials under their own block numbers and is
 * NEVER counted among the 40.
 *
 * Scenario C is already historically calibrated (R1-R's own three C0 runs), so §13 asks only that its
 * harness integrity be re-checked — that is what `--scenarios=C` does here, and the result is recorded
 * separately rather than re-run for tuning.
 *
 * "Meaningful progress" is defined HERE, before the runs, as a strict majority of the hidden acceptance
 * cases. That threshold is stated in advance so the floor decision cannot be made after seeing which runs
 * it would reject.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { SCENARIOS } from './scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2u', 'calibration');
const RUNS = Number(args.get('runs') ?? '3');
const SCENARIOS_TO_RUN = (args.get('scenarios') ?? 'D').split(',').map((value) => value.trim().toUpperCase()).filter((value) => value !== '');

/** §13: "meaningful progress" — pre-registered BEFORE the runs, as a strict majority of hidden cases. */
const MEANINGFUL_PROGRESS_FRACTION = 0.5;

const run = (trialArgs) => {
  const result = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'r2u', 'trial.mjs'), ...trialArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.trim().split('\n').pop() ?? '';
};

const out = (line) => process.stdout.write(`${line}\n`);

async function main() {
  rmSync(RIG, { recursive: true, force: true });
  mkdirSync(RIG, { recursive: true });
  const calibration = { schemaVersion: 1, stage: 'R2-U', phase: 'CALIBRATION', runsPerScenario: RUNS, meaningfulProgressFraction: MEANINGFUL_PROGRESS_FRACTION, scenarios: {} };

  for (const scenarioId of SCENARIOS_TO_RUN) {
    const scenario = SCENARIOS[scenarioId];
    out(`\n=========== calibration: scenario ${scenarioId} ===========`);
    const trials = [];
    for (let index = 0; index < RUNS; index += 1) {
      const block = 900 + index;
      const rigDir = join(RIG, 'runs');
      mkdirSync(rigDir, { recursive: true });
      const line = run([`--scenario=${scenarioId}`, '--cell=K0A0', `--block=${String(block)}`, '--repetition=0', `--rig=${rigDir}`]);
      const trialId = `${scenarioId}-K0A0-b${String(block)}r0`;
      const recordPath = join(rigDir, trialId, 'out', 'trial.json');
      const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : null;
      if (record === null) throw new Error(`calibration trial ${trialId} produced no record: ${line}`);
      trials.push(record);
      out(`  ${trialId}  final=${String(record.finalAcceptance.passed)}/${String(record.finalAcceptance.total)}  first=${String(record.firstCandidateAcceptance.passed)}/${String(record.firstCandidateAcceptance.total)}  knownFailure(first)=${String(record.knownFailureFirst.recurred)}  oracleRuns=${String(record.visibleOracleInvocations)}`);
    }

    const firstPassAll = trials.filter((trial) => trial.firstCandidateAcceptance.total > 0 && trial.firstCandidateAcceptance.passed === trial.firstCandidateAcceptance.total && trial.knownFailureFirst.recurred === false);
    const meaningful = trials.filter((trial) => trial.finalAcceptance.total > 0 && trial.finalAcceptance.passed / trial.finalAcceptance.total > MEANINGFUL_PROGRESS_FRACTION);
    const ceiling = firstPassAll.length === trials.length;
    const floor = meaningful.length === 0;
    calibration.scenarios[scenarioId] = {
      scenario: scenario.name,
      trials: trials.map((trial) => ({
        trialId: trial.trialId,
        finalAcceptance: trial.finalAcceptance,
        firstCandidateAcceptance: trial.firstCandidateAcceptance,
        knownFailureFirstRecurred: trial.knownFailureFirst.recurred,
        knownFailureFinalRecurred: trial.knownFailureFinal.recurred,
        visibleOracleInvocations: trial.visibleOracleInvocations,
        implementationRevisions: trial.implementationRevisions,
        elapsedMs: trial.elapsedMs,
        hostFailure: trial.hostFailure,
      })),
      firstCandidateSolves: firstPassAll.length,
      meaningfulProgress: meaningful.length,
      ceiling,
      floor,
      verdict: ceiling ? 'REJECT_CEILING' : floor ? 'REJECT_FLOOR' : 'PRIMARY_ELIGIBLE',
    };
    out(`  => first-candidate solves ${String(firstPassAll.length)}/${String(trials.length)} · meaningful ${String(meaningful.length)}/${String(trials.length)} · verdict ${calibration.scenarios[scenarioId].verdict}`);
  }

  const allEligible = SCENARIOS_TO_RUN.every((scenarioId) => calibration.scenarios[scenarioId].verdict === 'PRIMARY_ELIGIBLE');
  calibration.allEligible = allEligible;
  writeFileSync(join(RIG, 'calibration.json'), JSON.stringify(calibration, null, 2), 'utf8');
  out(`\nCALIBRATION ${allEligible ? 'GREEN — every scenario PRIMARY_ELIGIBLE' : 'NOT GREEN'}`);
  out(`record: ${join(RIG, 'calibration.json')}`);
  process.exit(0);
}

await main();
