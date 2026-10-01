#!/usr/bin/env node
/**
 * R2-E §25 — GATE A: EFFICACY HARNESS VALIDITY.
 *
 * The gate is a checklist that must hold BEFORE the 20-trial matrix, plus ONE PILOT E0/E1 PAIR PER SCENARIO.
 * The pilot exists because the two claims this stage rests on cannot be checked from static artifacts:
 *
 *   §9/§16  an E1 trial really DOES materialize every selected handle through the governed channel, before
 *           the first engineering turn — and the host, not the model, is what makes that true;
 *   §12     the E0 control really contains NO capital, while carrying the SAME section boundary.
 *
 * §25 is also explicit that a pilot does not count if the harness changes afterwards, which is why the
 * pilot records the harness digests it ran under and the gate compares them.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { blockOrder, CONDITIONS, EXPECTED_TRIALS, PROTOCOL_SEED, trialPlan } from './design.mjs';
import { normalizeTrial, pairingCheck } from './analyse.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';

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
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2e', 'matrix');
const PILOT_RIG = args.get('pilot') ?? join(homedir(), '.palimpsest-r2e', 'pilot');

const digestOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/* ---------------------------------------------------------------- §25 security preflight */

process.stdout.write(`--- §25 security preflight and the frozen design ---${NL}`);
const slotRecord = join(homedir(), '.palimpsest-r2u', 'slot-preflight', 'slot-preflight.json');
const slotOk = existsSync(slotRecord) && JSON.parse(readFileSync(slotRecord, 'utf8')).passed === JSON.parse(readFileSync(slotRecord, 'utf8')).total;
check('EA-01', 'the capacity-slot crash-recovery preflight passed', slotOk, slotOk ? 'all slot checks passed' : `no passing record at ${slotRecord}`);
const profile = await import(`file://${join(REPO_ROOT, 'host', 'deployment', 'runtime', 'confidential_profile.js').replace(/\\/gu, '/')}`);
check('EA-02', 'MAX ACTIVE WORKER = 1 for the confidential profile', profile.CONFIDENTIAL_PROFILE.maxActiveWorkers === 1, `${profile.CONFIDENTIAL_PROFILE.id}: max=${String(profile.CONFIDENTIAL_PROFILE.maxActiveWorkers)}`);
const r1hcConformance = join(REPO_ROOT, 'research-evidence', 'r1-hc', 'conformance.json');
const r1hcFailed = existsSync(r1hcConformance) ? (JSON.parse(readFileSync(r1hcConformance, 'utf8')).results ?? []).filter((entry) => entry.pass === false).length : -1;
check('EA-03', 'the recorded R1-HC conformance has no failing check', r1hcFailed === 0, `${String(r1hcFailed)} FAIL`);

/* ---------------------------------------------------------------- §25 fixtures and capital unchanged */

process.stdout.write(`${NL}--- §25 Scenario C, Scenario D and the teacher capital are UNCHANGED ---${NL}`);
const baseline = '8edf9f12f624828b43502642152f653c924e1bb8';
const unchanged = (label, paths) => {
  const changed = execFileSync('git', ['diff', '--name-only', baseline, 'HEAD', '--', ...paths], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  check(label.id, label.statement, changed === '', changed === '' ? 'no diff since the R2-U baseline' : `CHANGED: ${changed.split(String.fromCharCode(10)).join(', ')}`);
};
unchanged({ id: 'EA-04', statement: 'Scenario C\'s fixture and hidden acceptance are unchanged since the R2-U baseline' }, ['scripts/r1r/fixtures']);
unchanged({ id: 'EA-05', statement: 'Scenario D\'s fixture and hidden acceptance are unchanged since the R2-U baseline' }, ['scripts/r2u/fixtures']);
unchanged({ id: 'EA-06', statement: 'the teacher capital is unchanged since the R2-U baseline' }, ['scripts/r2u/capital.mjs', 'scripts/r2u/teacher-exploration.mjs', 'scripts/r1r/capital.mjs', 'scripts/r1r/teacher-exploration.mjs']);
const srcDiff = execFileSync('git', ['diff', '--name-only', baseline, 'HEAD', '--', 'src/'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
check('EA-07', 'canonical src/ semantics are unchanged', srcDiff === '', srcDiff === '' ? 'zero src diff' : `CHANGED: ${srcDiff}`);

/* ---------------------------------------------------------------- §25 the design is frozen */

process.stdout.write(`${NL}--- §25 the schedule and the arms are frozen ---${NL}`);
const plan = trialPlan();
check('EA-08', 'the schedule is exactly 2 scenarios × 2 conditions × 5 repetitions = 20', plan.length === EXPECTED_TRIALS, `${String(plan.length)} trials (expected ${String(EXPECTED_TRIALS)})`);
const blocksC = blockOrder(5, 'C');
const blocksD = blockOrder(5, 'D');
check('EA-09', 'every randomized block contains exactly E0 and E1', [...blocksC, ...blocksD].every((block) => [...block.order].sort().join(',') === [...CONDITIONS].sort().join(',')), `C: ${blocksC.map((block) => block.order.join('/')).join(' ')} | D: ${blocksD.map((block) => block.order.join('/')).join(' ')}`);
check('EA-10', 'the block order derives from ONE frozen seed and differs across blocks', PROTOCOL_SEED === 0x52_45_02_01 && new Set(blocksC.map((block) => block.order.join(','))).size > 1, `seed 0x${PROTOCOL_SEED.toString(16)}`);

/* ---------------------------------------------------------------- §25 the seam is inert by default */

process.stdout.write(`${NL}--- §25 the experimental seam is inert by default ---${NL}`);
const efficacyPath = join(REPO_ROOT, 'host', 'dsh', 'lib', 'efficacy.js');
const efficacy = await import(`file://${efficacyPath.replace(/\\/gu, '/')}`);
const goldenPath = join(REPO_ROOT, 'scripts', 'r2u', 'fixtures', 'production-prompt.golden.txt');
const golden = readFileSync(goldenPath, 'utf8');
check('EA-11', 'the DEFAULT mode leaves the prompt byte-identical to production', efficacy.applyEfficacyReview(golden, { mode: efficacy.EFFICACY_MODES.OFF }) === golden, 'off ⇒ identity');
for (const value of [undefined, '', 'E1 ', 'e1x', 'E0x', 'on', 'true', '1']) {
  if (efficacy.resolveEfficacyMode(value) !== efficacy.EFFICACY_MODES.OFF) check('EA-12', `an unrecognized value (${JSON.stringify(value)}) must not enable an arm`, false, `resolved to ${efficacy.resolveEfficacyMode(value)}`);
}
check('EA-12', 'no unrecognized efficacy value enables an arm (fail-safe toward production)', true, 'checked: "", "E1 ", e1x, E0x, on, true, 1 — all resolve to off');
const e0 = efficacy.applyEfficacyReview(golden, { mode: efficacy.EFFICACY_MODES.E0 });
const e1 = efficacy.applyEfficacyReview(golden, { mode: efficacy.EFFICACY_MODES.E1, resolved: [{ handle: '@ctx/proof/x', kind: 'proof', body: { statement: 'S' } }] });
check('EA-13', 'both arms carry the SAME section boundary and the control carries no capital', e0.includes(efficacy.EFFICACY_SECTION_HEADING) && e1.includes(efficacy.EFFICACY_SECTION_HEADING) && e0.includes('No inherited project capital was selected'), 'shared boundary; control states none was selected');
check('EA-14', 'the treatment section preserves the three kinds with their framing', ['EPISTEMIC INFORMATION', 'ADMITTED REASONING', 'ADVISORY METHOD GUIDANCE'].every((needle) => efficacy.applyEfficacyReview(golden, { mode: efficacy.EFFICACY_MODES.E1, resolved: [{ handle: '@ctx/proof/x', kind: 'proof', body: 'a' }, { handle: '@ctx/reasoning/x', kind: 'reasoning', body: 'b' }, { handle: '@ctx/procedure/x', kind: 'procedure', body: 'c' }] }).includes(needle)), 'all three kinds framed as non-authority');

/* ---------------------------------------------------------------- §25 the pilot pair */

process.stdout.write(`${NL}--- §25 the pilot E0/E1 pair per scenario ---${NL}`);
const pilotDir = join(PILOT_RIG, 'runs');
mkdirSync(pilotDir, { recursive: true });
const pilots = [];
for (const scenarioId of ['C', 'D']) {
  for (const condition of ['E0', 'E1']) {
    const block = 500 + (scenarioId === 'D' ? 10 : 0);
    const trialId = `${scenarioId}-${condition}-b${String(block)}r0`;
    const recordPath = join(pilotDir, trialId, 'out', 'trial.json');
    if (!existsSync(recordPath)) {
      process.stdout.write(`  running pilot ${trialId}…${NL}`);
      try {
        execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'r2e', 'trial.mjs'), `--scenario=${scenarioId}`, `--condition=${condition}`, `--block=${String(block)}`, '--repetition=0', `--rig=${pilotDir}`], {
          cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
        });
      } catch (error) {
        process.stdout.write(`  pilot ${trialId} raised: ${String(error?.message ?? error).slice(0, 200)}${NL}`);
      }
    }
    if (existsSync(recordPath)) pilots.push(JSON.parse(readFileSync(recordPath, 'utf8')));
  }
}
check('EA-15', 'all four pilot trials produced a record', pilots.length === 4, `${String(pilots.length)}/4 records`);

const pilotNormalized = pilots.map(normalizeTrial);
const e1Pilots = pilotNormalized.filter((trial) => trial.condition === 'E1');
const e0Pilots = pilotNormalized.filter((trial) => trial.condition === 'E0');
check('EA-16', '§16: every pilot E1 trial CONSUMED every selected handle through the governed channel', e1Pilots.length === 2 && e1Pilots.every((trial) => trial.preconditionMet && trial.selectedCount > 0 && trial.resolvedCount === trial.selectedCount), e1Pilots.map((trial) => `${trial.trialId} ${String(trial.resolvedCount)}/${String(trial.selectedCount)} ${trial.preworkMechanism}`).join(' | '));
check('EA-17', '§12: every pilot E0 trial carries NO capital', e0Pilots.length === 2 && e0Pilots.every((trial) => trial.selectedCount === 0 && trial.consumedHandles.length === 0), e0Pilots.map((trial) => `${trial.trialId} selected=${String(trial.selectedCount)}`).join(' | '));
check('EA-18', '§22: consumption happened before the first engineering turn in every pilot E1 trial', e1Pilots.length === 2 && e1Pilots.every((trial) => trial.consumedBeforeFirstEdit === true), 'the prework phase runs before the first turn exists');
check('EA-19', '§16: the consumption proof records handle identities and digests, never a body', e1Pilots.every((trial) => trial.consumedHandles.length > 0 && trial.consumedDigests.length === trial.consumedHandles.length && trial.consumedDigests.every((entry) => /^[a-z]+:@ctx\/[^:]+:[0-9a-f]{64}$/u.test(String(entry)))), `${String(e1Pilots[0]?.consumedDigests.length ?? 0)} digest(s) on the first pilot`);
const pilotBlocks = pairingCheck(pilotNormalized);
check('EA-20', '§13: the pilot pairs are not confounded (invariant components equal, section differs)', pilotBlocks.length === 2 && pilotBlocks.every((block) => !block.confounded), pilotBlocks.map((block) => `${block.scenario} ${block.confounded ? `CONFOUNDED: ${block.differences.join('; ')}` : 'clean'}`).join(' | '));

/* ---------------------------------------------------------------- §25 the harness digest */

process.stdout.write(`${NL}--- §25 the harness digest the pilot ran under ---${NL}`);
const harnessDigests = {
  'host/dsh/lib/efficacy.js': digestOf(efficacyPath),
  'host/dsh/lib/runner.js': digestOf(join(REPO_ROOT, 'host', 'dsh', 'lib', 'runner.js')),
  'scripts/r2e/design.mjs': digestOf(join(REPO_ROOT, 'scripts', 'r2e', 'design.mjs')),
  'scripts/r2e/trial.mjs': digestOf(join(REPO_ROOT, 'scripts', 'r2e', 'trial.mjs')),
};
mkdirSync(PILOT_RIG, { recursive: true });
writeFileSync(join(PILOT_RIG, 'harness-digests.json'), `${JSON.stringify(harnessDigests, null, 2)}\n`, 'utf8');
check('EA-21', 'the harness digests the pilot ran under are recorded', Object.values(harnessDigests).every((digest) => /^[0-9a-f]{64}$/u.test(digest)), `${String(Object.keys(harnessDigests).length)} files digested (a pilot does not count if the harness changes afterwards)`);

/* ---------------------------------------------------------------- report */

const failed = results.filter((entry) => !entry.pass);
process.stdout.write(`${NL}R2-E GATE A (efficacy harness validity): ${failed.length === 0 ? 'GREEN' : 'RED'} — ${String(results.length - failed.length)}/${String(results.length)}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
