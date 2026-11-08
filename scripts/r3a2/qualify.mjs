#!/usr/bin/env node
/**
 * R3-A2 §"Qualification contract"/§"Hard stage budget" — THE SENTINEL QUALIFICATION MATRIX.
 *
 * §"Qualification contract": the schedule is `F-C × DeepSeek × 5`, `F-C × GLM × 5`, `F-D × DeepSeek × 5`,
 * `F-D × GLM × 5` — 20 intended valid primary runs, and §"Hard stage budget" caps valid primary runs at
 * NO MORE THAN 20.
 *
 * §"No primary-fixture smoke": the schedule in `plan.json` is the ONLY place a new fixture meets a model. This
 * runner REFUSES to start unless the committed plan exists and matches the schedule it would execute, so a
 * run cannot happen before the plan commit.
 *
 * §"Infrastructure-invalid attempts remain visible and follow the existing frozen retry rule": an
 * infrastructure-invalid attempt is retried to reach Nq valid runs for its pair, and every attempt — valid or
 * not — is written to `trials.json`. §"A valid bad model outcome is never retried": a run that produced a
 * real model outcome is never re-run, whatever its verdict.
 *
 * §"Baseline condition": strictly sequential — one ACTIVE confidential worker at a time.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { buildPlan, ENGINE_DIGESTS } from './plan.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const NL = String.fromCharCode(10);
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r3a2', 'qualification');
const PLANNED = args.get('runsdir') ?? null;
const MAX_ATTEMPTS_PER_PAIR = Number(args.get('max-attempts') ?? '8');

const out = (line) => process.stdout.write(`${line}${NL}`);
const plan = buildPlan();

/**
 * §"Three-commit evidence structure": refuse to run before the plan is committed. The committed plan is read
 * from `research-evidence/r3-a2/plan.json`; if it is absent, the second commit does not exist yet.
 */
const committedPath = join(REPO_ROOT, 'research-evidence', 'r3-a2', 'plan.json');
if (!existsSync(committedPath)) throw new Error('the frozen plan is not committed: research-evidence/r3-a2/plan.json is absent, so no primary run may start');
const committed = JSON.parse(readFileSync(committedPath, 'utf8'));

/** §"Engine immutability": the plan and the executed code must still agree. */
const drift = Object.entries(ENGINE_DIGESTS).filter(([relative, digest]) => committed.engineDigests?.[relative] !== digest);
if (drift.length > 0) throw new Error(`the frozen plan was made against different code: ${drift.map(([relative]) => relative).join(', ')}`);

/** §"No primary-fixture smoke": the executed schedule must BE the committed schedule. */
const plannedKey = (run) => `${run.fixtureId}|${run.modelId}|${String(run.repetition)}`;
const committedKeys = committed.runs.map(plannedKey).join(',');
const actualKeys = plan.runs.map(plannedKey).join(',');
if (committedKeys !== actualKeys) throw new Error('the schedule to be executed differs from the frozen plan; refusing to run');

const runsDir = PLANNED ?? committed.runsDir ?? join(RIG, `runs-${new Date().toISOString().replace(/[:.]/gu, '-')}`);
mkdirSync(runsDir, { recursive: true });

out(`R3-A2 SENTINEL QUALIFICATION — ${String(plan.runs.length)} scheduled valid runs`);
out(`  runsDir: ${runsDir}`);
out(`  plan:    ${committedPath} (frozen, digest-checked)`);
out('');

/** Every attempt, valid or not, in execution order. */
const attempts = [];
/** The valid runs per pair, which is what Nq counts. */
const validByPair = new Map();
const pairKey = (run) => `${run.fixtureId}||${run.modelId}`;

for (const run of plan.runs) {
  const key = pairKey(run);
  let attemptsHere = 0;
  /**
   * §"Retry policy": retry ONLY to reach a valid run for this scheduled repetition, and never more than
   * `MAX_ATTEMPTS_PER_PAIR` times. The bound is the loop's own counter: an earlier form keyed the loop on the
   * count of pairs that had ANY valid run, which for the very first pair is always zero and therefore spun
   * without limit.
   */
  while (attemptsHere < MAX_ATTEMPTS_PER_PAIR) {
    attemptsHere += 1;
    const started = Date.now();
    let line;
    try {
      line = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'r3a2', 'trial.mjs'), `--fixture=${run.fixtureId}`, `--model=${run.modelId}`, `--repetition=${String(run.repetition)}`, `--rig=${runsDir}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim().split('\n').pop() ?? '';
    } catch (error) {
      line = `HARNESS_ERROR ${String(error?.message ?? error).slice(0, 200)}`;
    }
    const recordPath = join(runsDir, run.trialId, 'out', 'trial.json');
    const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : null;
    const attempt = Object.freeze({
      attempt: attemptsHere,
      fixtureId: run.fixtureId,
      modelId: run.modelId,
      modelFamily: run.modelFamily,
      repetition: run.repetition,
      infrastructureInvalid: record === null || record.infrastructureInvalid === true,
      verdictContributing: record !== null && record.infrastructureInvalid !== true,
      classCoverage: record?.classCoverage ?? null,
      elapsedMs: Date.now() - started,
      line,
      record,
    });
    attempts.push(attempt);
    writeFileSync(join(RIG, 'trials.partial.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-A2', planned: plan.runs.length, attempts: attempts.length, runsDir, attempts }, null, 2)}${NL}`, 'utf8');
    out(`[${String(attempts.length).padStart(2, ' ')}] ${run.fixtureId.padEnd(28)} ${run.modelId.padEnd(16)} q${String(run.repetition)} attempt ${String(attemptsHere)} ${String(Math.round(attempt.elapsedMs / 1000)).padStart(4)}s  ${line}`);

    if (record !== null && record.infrastructureInvalid !== true) {
      if (!validByPair.has(key)) validByPair.set(key, []);
      validByPair.get(key).push(record);
      /** §"A valid bad model outcome is never retried": one valid run per scheduled repetition is enough. */
      break;
    }
  }
}

const records = attempts.filter((attempt) => attempt.record !== null).map((attempt) => attempt.record);
const validRuns = records.filter((record) => record.infrastructureInvalid !== true);
const summary = {
  schemaVersion: 1,
  stage: 'R3-A2',
  kind: 'sentinel portfolio qualification attempts',
  plannedValidRuns: plan.runs.length,
  hardMaximumValidRuns: plan.runBudget.hardMaximumValidPrimaryRuns,
  attemptsMade: attempts.length,
  validRuns: validRuns.length,
  infrastructureInvalidAttempts: attempts.filter((attempt) => attempt.infrastructureInvalid).length,
  validRunsByPair: Object.fromEntries([...validByPair.entries()].map(([key, value]) => [key, value.length])),
  engineDigests: ENGINE_DIGESTS,
  runsDir,
  attempts,
  trials: records,
};
writeFileSync(join(RIG, 'trials.json'), `${JSON.stringify(summary, null, 2)}${NL}`, 'utf8');
writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a2', 'attempts.json'), `${JSON.stringify(summary, null, 2)}${NL}`, 'utf8');

out('');
out(`SENTINEL MATRIX COMPLETE — ${String(validRuns.length)}/${String(plan.runs.length)} valid runs from ${String(attempts.length)} attempts`);
for (const [key, value] of validByPair.entries()) out(`  ${key.replace('||', ' x ')}: ${String(value.length)} valid`);
if (validRuns.length > plan.runBudget.hardMaximumValidPrimaryRuns) {
  out('BUDGET VIOLATION: valid runs exceeded the hard stage budget');
  process.exit(1);
}
out(`record: ${join(REPO_ROOT, 'research-evidence', 'r3-a2', 'attempts.json')}`);
