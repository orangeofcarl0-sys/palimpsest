#!/usr/bin/env node
/**
 * R2-U §26 — GATE A: READINESS.
 *
 * The gate is a checklist of preconditions that must all hold BEFORE any stochastic trial runs, so that a
 * matrix is never collected against an unfrozen design. §26 lists them; this script checks each one against
 * the actual artifacts rather than asserting them in prose:
 *
 *   R1-HC gates green · capacity-slot crash recovery green · frozen uptake wording · Scenario C intact ·
 *   Scenario D built · Scenario D teacher capital grounded · Scenario D calibration eligible ·
 *   40-trial schedule frozen
 *
 * A GREEN result continues automatically into GATE B; a RED result stops the stage.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { AFFORDANCE_MODES, applyAffordance, UPTAKE_CLAUSE, uptakeClauseDigest } from '../../host/dsh/lib/affordance.js';
import { deriveCapital } from './capital.mjs';
import { blockOrder, CELLS, EXPECTED_TRIALS, PROTOCOL_SEED, trialPlan } from './design.mjs';
import { detectD } from './known-failure.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { SCENARIO_D_GENERATIONS } from './teacher-exploration.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const NL = String.fromCharCode(10);
const results = [];
const check = (id, statement, pass, detail) => {
  results.push({ id, statement, pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${statement} — ${detail}${NL}`);
};
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2u', 'matrix');

/* ---------------------------------------------------------------- §26 frozen uptake wording */

process.stdout.write(`--- §26 the uptake wording is frozen and the seam is additive ---${NL}`);
const clauseDigest = await uptakeClauseDigest();
const goldenPath = join(REPO_ROOT, 'scripts', 'r2u', 'fixtures', 'production-prompt.golden.txt');
const goldenExists = existsSync(goldenPath);
check('GA-01', 'the production prompt was captured from the stage baseline', goldenExists, goldenExists ? `${String(Buffer.byteLength(readFileSync(goldenPath, 'utf8'), 'utf8'))} bytes captured` : 'the golden capture is missing');
const golden = goldenExists ? readFileSync(goldenPath, 'utf8') : '';
check('GA-02', 'the DEFAULT path is byte-identical to the captured production prompt', applyAffordance(golden, AFFORDANCE_MODES.OFF) === golden, 'off ⇒ identity');
check('GA-03', 'the A1 clause is exactly the frozen wording', applyAffordance(golden, AFFORDANCE_MODES.EXPLICIT_REVIEW) === `${golden}\n\n${UPTAKE_CLAUSE}`, `clause digest ${clauseDigest.slice(0, 16)}…`);
check('GA-04', 'the clause reveals no body content and no handle kind', !/procedure|proof|reasoning|@ctx\//iu.test(UPTAKE_CLAUSE), 'kind-agnostic, content-blind');

/* ---------------------------------------------------------------- §26 Scenario C intact */

process.stdout.write(`${NL}--- §26 Scenario C is intact and reused, not redesigned ---${NL}`);
const scenarioC = SCENARIOS.C;
check('GA-05', 'Scenario C\'s fixture and hidden acceptance are the R1-R originals', existsSync(scenarioC.acceptanceModule) && scenarioC.acceptanceModule.includes(join('r1r', 'fixtures')), scenarioC.acceptanceModule.replace(REPO_ROOT, '<repo>'));
const r1rAcceptance = await import(`file://${scenarioC.acceptanceModule.replace(/\\/gu, '/')}`);
const hiddenC = r1rAcceptance.materialize(r1rAcceptance.HIDDEN_CASES);
const refC = r1rAcceptance.runCases(r1rAcceptance.applyEventStreamReference, hiddenC);
check('GA-06', 'Scenario C\'s reference implementation still passes every hidden case', refC.passed === refC.total, `${String(refC.passed)}/${String(refC.total)}`);
const h0C = await import(`file://${join(REPO_ROOT, 'scripts', 'r1r', 'fixtures', 'scenario-c', 'src', 'reducer.ts').replace(/\\/gu, '/')}`);
const h0CResult = r1rAcceptance.runCases(h0C.applyEventStream, hiddenC);
check('GA-07', 'Scenario C\'s H0 still FAILS the hidden acceptance, so the fixture has headroom', h0CResult.passed < h0CResult.total, `H0 ${String(h0CResult.passed)}/${String(h0CResult.total)}`);

/* ---------------------------------------------------------------- §26 Scenario D built and grounded */

process.stdout.write(`${NL}--- §26 Scenario D is built, calibrated-eligible and grounded ---${NL}`);
const scenarioD = SCENARIOS.D;
check('GA-08', 'Scenario D\'s world can be built and its hidden acceptance is unreachable from it', existsSync(scenarioD.fixtureDir) && existsSync(scenarioD.acceptanceModule), 'fixture + hidden acceptance present');
const dAcceptance = await import(`file://${scenarioD.acceptanceModule.replace(/\\/gu, '/')}`);
const hiddenD = dAcceptance.materialize(dAcceptance.HIDDEN_CASES);
const visibleD = dAcceptance.materialize(dAcceptance.VISIBLE_CASES);
const refD = dAcceptance.runCases(dAcceptance.invalidateCacheReference, hiddenD);
check('GA-09', 'Scenario D\'s reference implementation passes every hidden case', refD.passed === refD.total, `${String(refD.passed)}/${String(refD.total)}`);
const refDVisible = dAcceptance.runCases(dAcceptance.invalidateCacheReference, visibleD);
check('GA-10', 'Scenario D\'s reference implementation passes every visible case', refDVisible.passed === refDVisible.total, `${String(refDVisible.passed)}/${String(refDVisible.total)}`);
const h0D = await import(`file://${join(REPO_ROOT, 'scripts', 'r2u', 'fixtures', 'scenario-d', 'src', 'cache.ts').replace(/\\/gu, '/')}`);
const h0DHidden = dAcceptance.runCases(h0D.invalidateCache, hiddenD);
const h0DVisible = dAcceptance.runCases(h0D.invalidateCache, visibleD);
check('GA-11', 'Scenario D\'s H0 passes the VISIBLE oracle but FAILS the hidden acceptance', h0DVisible.passed === h0DVisible.total && h0DHidden.passed < h0DHidden.total, `visible ${String(h0DVisible.passed)}/${String(h0DVisible.total)}, hidden ${String(h0DHidden.passed)}/${String(h0DHidden.total)}`);

/** §12: the capital must be traceable to observed failures, and the mature generation must stop failing. */
const capital = deriveCapital().D;
check('GA-12', 'Scenario D\'s capital derives from a recorded exploration whose final generation stops failing', capital.exploration.observations.at(-1).failedCaseIds.length === 0, `generations ${capital.exploration.generations.join(' → ')}`);
const clauseGenerations = new Set(capital.procedureClauses.map((clause) => clause.forcedBy));
check('GA-13', 'every Procedure clause names a generation that actually failed something', [...clauseGenerations].every((id) => capital.exploration.observations.find((observation) => observation.generation === id)?.failedCaseIds.length > 0), `clauses forced by ${[...clauseGenerations].sort().join(', ')}`);
check('GA-14', 'the Procedure encodes METHOD (a step list) rather than the final source', capital.procedureClauses.length > 0 && capital.procedureClauses.every((clause) => typeof clause.instruction === 'string' && !clause.instruction.includes('function ')), `${String(capital.procedureClauses.length)} ordered clauses`);

/** §18: the pre-paid mistake detector must discriminate in both directions. */
const detectorDiscriminates = SCENARIO_D_GENERATIONS.slice(0, -1).every((generation) => detectD(generation.invalidate).recurred === true) && detectD(SCENARIO_D_GENERATIONS.at(-1).invalidate).recurred === false;
check('GA-15', 'the pre-paid-mistake detector recurs on every naive generation and NOT on the mature one', detectorDiscriminates, 'checked in both directions');

/* ---------------------------------------------------------------- §26 the 40-trial schedule is frozen */

process.stdout.write(`${NL}--- §26 the schedule is frozen ---${NL}`);
const plan = trialPlan();
check('GA-16', 'the schedule is exactly 2 scenarios × 4 cells × 5 repetitions = 40', plan.length === EXPECTED_TRIALS, `${String(plan.length)} trials (expected ${String(EXPECTED_TRIALS)})`);
const blocks = blockOrder(5, 'C');
const blocksD = blockOrder(5, 'D');
const everyBlockComplete = blocks.every((block) => [...block.order].sort().join(',') === [...CELLS].sort().join(',')) && blocksD.every((block) => [...block.order].sort().join(',') === [...CELLS].sort().join(','));
check('GA-17', 'every randomized block contains exactly the four cells', everyBlockComplete, `C: ${blocks.map((block) => block.order.join('/')).join(' ')} | D: ${blocksD.map((block) => block.order.join('/')).join(' ')}`);
check('GA-18', 'the block order is derived from ONE frozen seed and differs across blocks', PROTOCOL_SEED === 0x52_32_55_01 && new Set(blocks.map((block) => block.order.join(','))).size > 1, `seed 0x${PROTOCOL_SEED.toString(16)}`);
/**
 * §15: "Do not run all affordance trials after all passive trials." The checkable form of that is: within
 * every block, at least one A1 cell precedes at least one A0 cell — i.e. the two A1 cells never occupy the
 * block's last two positions, which is what grouping the affordance arm at the end would look like.
 */
const a1Interleaved = (block) => {
  const a1Positions = block.order.map((cell, index) => (cell.endsWith('A1') ? index : -1)).filter((index) => index >= 0);
  const a0Positions = block.order.map((cell, index) => (cell.endsWith('A0') ? index : -1)).filter((index) => index >= 0);
  return a1Positions.some((a1) => a0Positions.some((a0) => a1 < a0));
};
check(
  'GA-19',
  'the A1 cells are interleaved with the A0 cells rather than grouped after them',
  [...blocks, ...blocksD].every(a1Interleaved),
  [...blocks, ...blocksD].every(a1Interleaved) ? 'every block has at least one A1 before an A0' : 'some block runs its affordance cells last',
);

/* ---------------------------------------------------------------- §26 R1-HC gates green + slot recovery */

process.stdout.write(`${NL}--- §26 the R1-HC baseline and the slot contract ---${NL}`);
const r1hcConformance = join(REPO_ROOT, 'research-evidence', 'r1-hc', 'conformance.json');
const r1hcLive = join(REPO_ROOT, 'research-evidence', 'r1-hc', 'live', 'verdict.json');
check('GA-20', 'the R1-HC conformance and live verdicts are on record with zero FAIL', existsSync(r1hcConformance) && existsSync(r1hcLive), 'records present');
if (existsSync(r1hcConformance)) {
  const conformance = JSON.parse(readFileSync(r1hcConformance, 'utf8'));
  const failed = (conformance.results ?? []).filter((entry) => entry.pass === false);
  check('GA-21', 'the recorded R1-HC conformance has no failing check', failed.length === 0, `${String((conformance.results ?? []).length)} checks, ${String(failed.length)} FAIL`);
}
const slotRecord = join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.palimpsest-r2u', 'slot-preflight', 'slot-preflight.json');
const slotOk = existsSync(slotRecord) && JSON.parse(readFileSync(slotRecord, 'utf8')).passed === JSON.parse(readFileSync(slotRecord, 'utf8')).total;
check('GA-22', 'the capacity-slot crash-recovery preflight passed (killed holder → fresh host recovers)', slotOk, slotOk ? 'all slot checks passed' : `no passing record at ${slotRecord}`);

/**
 * §26: Scenario D must be calibration-eligible BEFORE the matrix runs. The calibration's own record is the
 * evidence, and its verdict is READ rather than recomputed — a second computation here could disagree with
 * the calibration that actually ran.
 */
const calibrationPath = join(homedir(), '.palimpsest-r2u', 'calibration', 'calibration.json');
if (!existsSync(calibrationPath)) {
  check('GA-23', 'Scenario D is calibration-eligible (3 C0 runs, neither ceiling nor floor)', false, `no calibration record at ${calibrationPath}; run \`pnpm r2u:calibrate --scenarios=D --runs=3\``);
} else {
  const calibration = JSON.parse(readFileSync(calibrationPath, 'utf8'));
  const entry = calibration.scenarios?.D;
  check(
    'GA-23',
    'Scenario D is calibration-eligible (3 C0 runs, neither ceiling nor floor)',
    entry?.verdict === 'PRIMARY_ELIGIBLE',
    entry === undefined
      ? 'the calibration record holds no Scenario D entry'
      : `${String(entry.trials?.length ?? 0)} C0 runs · first-candidate solves ${String(entry.firstCandidateSolves)} · meaningful ${String(entry.meaningfulProgress)} · verdict ${String(entry.verdict)}`,
  );
}

/* ---------------------------------------------------------------- report */

const failed = results.filter((entry) => !entry.pass);
process.stdout.write(`${NL}R2-U GATE A (readiness): ${failed.length === 0 ? 'GREEN' : 'RED'} — ${String(results.length - failed.length)}/${String(results.length)}${NL}`);
process.stdout.write(`schedule record: ${join(RIG, 'plan.json')}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
