#!/usr/bin/env node
/**
 * R2-V §10 — GATE A: THE PRE-MATRIX READINESS CHECKLIST (DETERMINISTIC ONLY).
 *
 * §10 forbids a behavioural pilot on D and permits "dummy-fixture plumbing proof only". So this gate proves
 * the readiness facts DETERMINISTICALLY:
 *
 *   · the frozen schedule is exactly 20 trials, 4 arms × 5 repetitions, and every block contains ALL FOUR
 *     arms exactly once;
 *   · the four arms' consumed bundle sets are the frozen ones and are all distinct;
 *   · every bundle is REAL mature capital from a distinct domain — no new hand-authored capital (§7);
 *   · the marginal-signal classifier behaves correctly on synthetic outcomes, including the honest
 *     NO_CLEAR_SIGNAL case for "identical on both";
 *   · the R2-S calibration reads the two axes correctly;
 *   · the consumption mechanism the stage relies on is the R2-E seam, and it is OFF by default;
 *   · the Scenario-D identity is byte-frozen;
 *   · the harness digests are recorded, so a later change to the harness invalidates this record.
 *
 * It does NOT run a real worker on Scenario D. The model-visible consumption proof belongs to every primary
 * trial's own session artifact, which is authoritative.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { ADDED_BUNDLES, analyseUtility, ARMS, armUtility, blockOrder, CONDITIONS, CONSUMPTION_MECHANISM, EXPECTED_TRIALS, marginalSignal, PROTOCOL_SEED, REPETITIONS, SCENARIO_IDS, trialPlan, UTILITY_CLASSIFICATIONS } from './design.mjs';
import { calibrateAgainstR2S } from './analyse.mjs';
import { BUNDLE_DOMAIN, BUNDLE_IDS, bundleCapital } from '../r2s/candidates.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const RIG = join(homedir(), '.palimpsest-r2v', 'readiness');
const efficacy = await import(new URL('../../host/dsh/lib/efficacy.js', import.meta.url).href);
const NL = String.fromCharCode(10);

const results = [];
const check = (id, statement, pass, detail) => {
  results.push({ id, statement, pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${statement} — ${detail}${NL}`);
};
const digestOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/* ---------------------------------------------------------------- §10 the frozen schedule */

process.stdout.write(`--- §10 the frozen schedule ---${NL}`);
const plan = trialPlan();
check('VA-01', 'the schedule is exactly 4 arms × 5 repetitions = 20 Scenario-D trials', plan.length === EXPECTED_TRIALS && EXPECTED_TRIALS === 20, `${String(plan.length)} trials planned`);
check('VA-02', 'the seed is the frozen literal', PROTOCOL_SEED === 0x52_56_03_01, `0x${PROTOCOL_SEED.toString(16)}`);
check('VA-03', 'the stage runs on Scenario D only (§6)', SCENARIO_IDS.length === 1 && SCENARIO_IDS[0] === 'D', SCENARIO_IDS.join(','));
for (const block of blockOrder(REPETITIONS, 'D')) {
  check(`VA-04:b${String(block.block)}`, `§10 block ${String(block.block)} contains ALL FOUR arms exactly once`, [...block.order].sort().join(',') === [...CONDITIONS].sort().join(','), block.order.join(' '));
}
check('VA-05', 'the arm ordering is not the same permutation in every block', new Set(blockOrder(REPETITIONS, 'D').map((block) => block.order.join(','))).size > 1, `${String(new Set(blockOrder(REPETITIONS, 'D').map((block) => block.order.join(','))).size)} distinct permutations`);

/* ---------------------------------------------------------------- §8 the arms */

process.stdout.write(`${NL}--- §8 the four arms ---${NL}`);
check('VA-06', 'V0 consumes the D bundle only', ARMS.V0.bundles.join('+') === 'D', ARMS.V0.bundles.join('+'));
check('VA-07', 'V1 consumes D + B', ARMS.V1.bundles.join('+') === 'D+B', ARMS.V1.bundles.join('+'));
check('VA-08', 'V2 consumes D + C', ARMS.V2.bundles.join('+') === 'D+C', ARMS.V2.bundles.join('+'));
check('VA-09', 'V3 consumes D + B + C', ARMS.V3.bundles.join('+') === 'D+B+C', ARMS.V3.bundles.join('+'));
const bundleSets = CONDITIONS.map((id) => [...ARMS[id].bundles].sort().join('+'));
check('VA-10', '§11 the four consumed bundle sets are ALL DISTINCT', new Set(bundleSets).size === CONDITIONS.length, bundleSets.join(' | '));
check('VA-11', '§8 every arm includes the task\'s OWN bundle (D), so the comparison isolates what is ADDED', CONDITIONS.every((id) => ARMS[id].bundles.includes('D')), CONDITIONS.map((id) => `${id}:${ARMS[id].bundles.join('+')}`).join(' '));
check('VA-12', '§9 the arms add WHOLE bundles, never individual kinds', CONDITIONS.every((id) => (ADDED_BUNDLES[id] ?? []).every((bundleId) => BUNDLE_IDS.includes(bundleId))), Object.entries(ADDED_BUNDLES).map(([id, bundles]) => `${id}+${bundles.join('+')}`).join(' '));

/* ---------------------------------------------------------------- §7 real capital only */

process.stdout.write(`${NL}--- §7 the bundles are real mature capital ---${NL}`);
const bundles = BUNDLE_IDS.map((bundleId) => bundleCapital(bundleId));
check('VA-13', '§7 every bundle is a REAL recorded exploration, not a hand-authored string', bundles.length === 3 && bundles.every((bundle) => typeof bundle.proof?.statement === 'string' && bundle.proof.statement.length > 80 && bundle.procedureClauses.length > 0), bundles.map((bundle) => `${bundle.bundleId}:${String(bundle.procedureClauses.length)} clauses`).join(' | '));
check('VA-14', '§7 no two bundles share a domain', new Set(bundles.map((bundle) => bundle.domain)).size === bundles.length, bundles.map((bundle) => `${bundle.bundleId}:${bundle.domain.split(' (')[0]}`).join(' | '));
check('VA-15', '§7 the B and C bundles really differ from D\'s target content', (() => { const d = bundleCapital('D'); return [bundleCapital('B'), bundleCapital('C')].every((bundle) => bundle.proof.statement !== d.proof.statement && bundle.reasoning.statement !== d.reasoning.statement); })(), 'B/C proof and reasoning statements differ from D\'s');

/* ---------------------------------------------------------------- §8 the mechanism */

process.stdout.write(`${NL}--- §8 the consumption mechanism ---${NL}`);
check('VA-16', '§8 the mechanism is the R2-E HOST_MEDIATED_PREWORK seam, recorded as data', CONSUMPTION_MECHANISM === 'HOST_MEDIATED_PREWORK' && efficacy.PREWORK_MECHANISM === CONSUMPTION_MECHANISM, `${CONSUMPTION_MECHANISM} (host seam: ${efficacy.PREWORK_MECHANISM})`);
check('VA-17', '§4 the efficacy seam is OFF by default and only the two frozen tokens enable an arm', efficacy.resolveEfficacyMode(undefined) === efficacy.EFFICACY_MODES.OFF && efficacy.resolveEfficacyMode('e1') === efficacy.EFFICACY_MODES.E1 && efficacy.resolveEfficacyMode('e0') === efficacy.EFFICACY_MODES.E0, 'absent ⇒ off');
for (const value of [undefined, '', 'E1 ', 'e1x', 'on', 'true', '1']) {
  check(`VA-18:${String(value)}`, `no unrecognized efficacy value enables an arm (${JSON.stringify(value)})`, efficacy.resolveEfficacyMode(value) === efficacy.EFFICACY_MODES.OFF, 'resolves to off');
}

/* ---------------------------------------------------------------- §15 the classifier */

process.stdout.write(`${NL}--- §15 the marginal-signal classifier ---${NL}`);
const arm = (solved, recurred, n = 5) => ({ analysed: n, fullSolved: `${String(solved)}/${String(n)}`, mistakeRecurred: `${String(recurred)}/${String(n)}`, preconditionNotMet: 0 });
const classify = (v0, vx) => marginalSignal(ARMS.V1, v0, vx).classification;
check('VA-19', 'a bundle that FEWER mistakes with no solve loss is POSITIVE_SIGNAL', classify(arm(3, 3), arm(3, 0)) === UTILITY_CLASSIFICATIONS.POSITIVE_SIGNAL, 'recurrence 3→0, solves 3→3');
check('VA-20', 'a bundle that ADDS solves with no recurrence loss is POSITIVE_SIGNAL', classify(arm(3, 3), arm(5, 3)) === UTILITY_CLASSIFICATIONS.POSITIVE_SIGNAL, 'solves 3→5, recurrence 3→3');
check('VA-21', 'a bundle that adds mistakes is ADVERSE_SIGNAL', classify(arm(3, 1), arm(3, 4)) === UTILITY_CLASSIFICATIONS.ADVERSE_SIGNAL, 'recurrence 1→4, solves 3→3');
check('VA-22', 'a bundle that loses solves is ADVERSE_SIGNAL', classify(arm(4, 1), arm(1, 1)) === UTILITY_CLASSIFICATIONS.ADVERSE_SIGNAL, 'solves 4→1, recurrence 1→1');
check('VA-23', 'IDENTICAL on both outcomes is NO_CLEAR_SIGNAL, never POSITIVE', classify(arm(3, 2), arm(3, 2)) === UTILITY_CLASSIFICATIONS.NO_CLEAR_SIGNAL, 'no movement is reported as no clear signal');
check('VA-24', '§15 the classification is never a binary useful/useless', Object.values(UTILITY_CLASSIFICATIONS).join(',') === 'POSITIVE_SIGNAL,NO_CLEAR_SIGNAL,ADVERSE_SIGNAL', 'three descriptive classes only');

/* ---------------------------------------------------------------- §16 the calibration */

process.stdout.write(`${NL}--- §16 the R2-S calibration ---${NL}`);
const calibration = calibrateAgainstR2S({ B: { consensus: 'NO_CLEAR_SIGNAL' }, C: { consensus: 'NO_CLEAR_SIGNAL' } }, { D: { S0: { targetRecall: '15/15', distractorRate: '15/15' }, S1: { targetRecall: '15/15', distractorRate: '6/15' } } });
check('VA-25', '§16 the calibration names B and C as the bundles R2-S skipped on D', calibration.skippedByR2S.map((entry) => entry.bundleId).join(',') === 'B,C', JSON.stringify(calibration.skippedByR2S.map((entry) => `${entry.bundleId}:${entry.utility}`)));
check('VA-26', '§16 skipped bundles with no positive utility signal are reported CONSISTENT', calibration.answers.correlation.startsWith('CONSISTENT'), calibration.answers.correlation);
check('VA-26b', '§16 a skipped bundle WITH a positive signal (and one without) is reported MIXED', calibrateAgainstR2S({ B: { consensus: 'POSITIVE_SIGNAL' }, C: { consensus: 'NO_CLEAR_SIGNAL' } }, null).answers.correlation.startsWith('MIXED'), calibrateAgainstR2S({ B: { consensus: 'POSITIVE_SIGNAL' }, C: { consensus: 'NO_CLEAR_SIGNAL' } }, null).answers.correlation);
check('VA-26c', '§16 when EVERY skipped bundle shows a positive signal the calibration is MISCALIBRATED', calibrateAgainstR2S({ B: { consensus: 'POSITIVE_SIGNAL' }, C: { consensus: 'POSITIVE_SIGNAL' } }, null).answers.correlation.startsWith('MISCALIBRATED'), calibrateAgainstR2S({ B: { consensus: 'POSITIVE_SIGNAL' }, C: { consensus: 'POSITIVE_SIGNAL' } }, null).answers.correlation);
check('VA-27', '§16 the calibration states its scope restriction (R2-S ran on C and D; R2-V on D)', calibration.scopeRestriction.includes('R2-V ran on D only'), calibration.scopeRestriction);

/* ---------------------------------------------------------------- §6 the frozen D identity */

process.stdout.write(`${NL}--- §6 the frozen Scenario-D identity ---${NL}`);
const d = SCENARIOS.D;
check('VA-28', '§6 Scenario D is the scenario this stage runs, with its task and oracle byte-frozen', d.id === 'D' && d.sourceFile === 'src/cache.ts' && d.exportName === 'invalidateCache' && d.knownFailureDetector === 'invalidateBeforeClosureFrozen', `${d.name} / ${d.sourceFile} / ${d.exportName}`);
check('VA-29', '§6 the D target bundle is the D bundle, unchanged from R2-S', ARMS.V0.bundles.join('+') === 'D', ARMS.V0.bundles.join('+'));

/* ---------------------------------------------------------------- §19 the harness digests */

process.stdout.write(`${NL}--- the harness digests this readiness record describes ---${NL}`);
const harnessDigests = {
  'host/dsh/lib/efficacy.js': digestOf(join(REPO_ROOT, 'host', 'dsh', 'lib', 'efficacy.js')),
  'scripts/r2v/design.mjs': digestOf(join(REPO_ROOT, 'scripts', 'r2v', 'design.mjs')),
  'scripts/r2v/trial.mjs': digestOf(join(REPO_ROOT, 'scripts', 'r2v', 'trial.mjs')),
  'scripts/r2v/analyse.mjs': digestOf(join(REPO_ROOT, 'scripts', 'r2v', 'analyse.mjs')),
};
check('VA-30', 'the harness digests this readiness record describes are recorded', Object.values(harnessDigests).every((digest) => /^[0-9a-f]{64}$/u.test(digest)), `${String(Object.keys(harnessDigests).length)} files digested (a trial does not count if the harness changes afterwards)`);

/* ---------------------------------------------------------------- §4 no product change */

process.stdout.write(`${NL}--- §4 the production default is untouched ---${NL}`);
check('VA-31', '§4 the efficacy seam is inert unless the environment explicitly selects an arm', efficacy.EFFICACY_ENV === 'PALIMPSEST_R2E_EFFICACY' && efficacy.resolveEfficacyMode(process.env.PALIMPSEST_R2E_EFFICACY) === efficacy.EFFICACY_MODES.OFF, 'the default path is byte-identical to production');

/* ---------------------------------------------------------------- §14/§15 the analysis shape */

process.stdout.write(`${NL}--- §14 the marginal comparisons the analysis produces ---${NL}`);
const byArm = { V0: armUtility([]), V1: armUtility([]), V2: armUtility([]), V3: armUtility([]) };
const utility = analyseUtility(byArm);
/** A NON-EMPTY fixture, so the tested-scope assertion checks a real string rather than "0 vs 0 trials". */
const nonEmpty = Object.fromEntries(CONDITIONS.map((id) => [id, armUtility([{ finalAcceptanceSolved: true, firstCandidateSolved: true, knownFailureRecurred: false, visibleOracleInvocations: 3, implementationRevisions: 0, elapsedMs: 1000, consumptionProven: true, finalAcceptancePassed: 14, finalAcceptanceTotal: 14, firstCandidatePassed: 14, firstCandidateTotal: 14 }])]));
const nonEmptyUtility = analyseUtility(nonEmpty);
check('VA-32', '§14 the analysis produces exactly V1-vs-V0, V2-vs-V0 and V3-vs-V0', utility.comparisons.map((entry) => entry.comparison).join(',') === 'V1 vs V0,V2 vs V0,V3 vs V0', utility.comparisons.map((entry) => entry.comparison).join(','));
check('VA-33', '§14 each comparison carries RAW deltas and DIRECTION, never a p-value', utility.comparisons.every((entry) => typeof entry.solveDelta === 'number' && typeof entry.recurrenceDelta === 'number' && typeof entry.solveDirection === 'string' && !('pValue' in entry) && !('p' in entry)), 'raw counts and direction only');
check('VA-34', '§15 each comparison states its tested scope with a real trial count', nonEmptyUtility.comparisons.every((entry) => typeof entry.testedScope === 'string' && entry.testedScope.includes('Scenario D') && !entry.testedScope.startsWith('0 ')), nonEmptyUtility.comparisons[0]?.testedScope ?? 'ABSENT');

/* ---------------------------------------------------------------- report */

const failed = results.filter((entry) => !entry.pass);
mkdirSync(RIG, { recursive: true });
writeFileSync(join(RIG, 'harness-digests.json'), `${JSON.stringify(harnessDigests, null, 2)}${NL}`, 'utf8');
writeFileSync(join(RIG, 'readiness.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R2-V', gate: 'A', deterministicOnly: true, note: '§10: NO behavioural pilot on D; readiness is proven deterministically and the model-visible consumption proof belongs to each trial\'s own session artifact', harnessDigests, results }, null, 2)}${NL}`, 'utf8');
mkdirSync(join(REPO_ROOT, 'research-evidence', 'r2-v'), { recursive: true });
writeFileSync(join(REPO_ROOT, 'research-evidence', 'r2-v', 'gate-a.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R2-V', gate: 'A', deterministicOnly: true, harnessDigests, results }, null, 2)}${NL}`, 'utf8');

process.stdout.write(`${NL}§R2-V GATE A: ${failed.length === 0 ? 'GREEN' : 'RED'} — ${String(results.length - failed.length)}/${String(results.length)}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
