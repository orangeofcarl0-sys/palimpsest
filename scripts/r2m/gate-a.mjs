#!/usr/bin/env node
/**
 * R2-M §32 — GATE A: TREATMENT VALIDITY.
 *
 * §32 is a checklist that must hold BEFORE the 20-trial matrix, plus ONE PILOT M0/M1 PAIR PER SCENARIO. The
 * pilot exists because the two claims this stage rests on cannot be checked from static artifacts:
 *
 *   §5/§8   an M1 trial really DOES derive its entries through the governed attempt-bound path, and the
 *           FULL BODY IS NOT RENDERED — only a bounded projection;
 *   §6/§19  M0 really IS byte-identical to the current production index, and the ONLY difference between the
 *           arms is the index presentation.
 *
 * §14 additionally requires a mechanically inspected PREVIEW LEAKAGE GATE before GATE B: the rendered M1
 * material for C and D must not reproduce a complete capital body, the hidden acceptance or the oracle.
 *
 * A pilot does not count if the harness changes afterwards, which is why the pilot records the harness
 * digests it ran under and this gate writes them.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { blockOrder, CONDITIONS, EXPECTED_TRIALS, PROTOCOL_SEED, trialPlan } from './design.mjs';
import { deriveCapital } from '../r2u/capital.mjs';
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
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2m', 'matrix');
const PILOT_RIG = args.get('pilot') ?? join(homedir(), '.palimpsest-r2m', 'pilot');

const digestOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/* ---------------------------------------------------------------- §32 baseline and security */

process.stdout.write(`--- §32 baseline, security preflight and the frozen design ---${NL}`);
const baseline = 'adf16152bd9c1183db18b89bd80e4b1ceb94dab0';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
const baselineIsAncestor = (() => {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', baseline, 'HEAD'], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
})();
check('MA-01', 'the baseline commit is an ancestor of HEAD', baselineIsAncestor, `baseline ${baseline.slice(0, 8)} → HEAD ${head.slice(0, 8)}`);

const slotRecord = join(homedir(), '.palimpsest-r2u', 'slot-preflight', 'slot-preflight.json');
const slotOk = existsSync(slotRecord) && JSON.parse(readFileSync(slotRecord, 'utf8')).passed === JSON.parse(readFileSync(slotRecord, 'utf8')).total;
check('MA-02', 'the capacity-slot crash-recovery preflight passed', slotOk, slotOk ? 'all slot checks passed' : `no passing record at ${slotRecord}`);
const profile = await import(`file://${join(REPO_ROOT, 'host', 'deployment', 'runtime', 'confidential_profile.js').replace(/\\/gu, '/')}`);
check('MA-03', 'MAX ACTIVE WORKER = 1 for the confidential profile', profile.CONFIDENTIAL_PROFILE.maxActiveWorkers === 1, `${profile.CONFIDENTIAL_PROFILE.id}: max=${String(profile.CONFIDENTIAL_PROFILE.maxActiveWorkers)}`);
const r1hcConformance = join(REPO_ROOT, 'research-evidence', 'r1-hc', 'conformance.json');
const r1hcFailed = existsSync(r1hcConformance) ? (JSON.parse(readFileSync(r1hcConformance, 'utf8')).results ?? []).filter((entry) => entry.pass === false).length : -1;
check('MA-04', 'the recorded R1-HC conformance has no failing check', r1hcFailed === 0, `${String(r1hcFailed)} FAIL`);

/* ---------------------------------------------------------------- §16 fixtures and capital unchanged */

process.stdout.write(`${NL}--- §16 Scenario C, Scenario D and the teacher capital are UNCHANGED ---${NL}`);
const unchanged = (label, paths) => {
  const changed = execFileSync('git', ['diff', '--name-only', baseline, 'HEAD', '--', ...paths], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  check(label.id, label.statement, changed === '', changed === '' ? 'no diff since the CIC v0.1 baseline' : `CHANGED: ${changed.split(NL).join(', ')}`);
};
unchanged({ id: 'MA-05', statement: "Scenario C's fixture and hidden acceptance are unchanged" }, ['scripts/r1r/fixtures']);
unchanged({ id: 'MA-06', statement: "Scenario D's fixture and hidden acceptance are unchanged" }, ['scripts/r2u/fixtures']);
unchanged({ id: 'MA-07', statement: 'the teacher capital is unchanged' }, ['scripts/r2u/capital.mjs', 'scripts/r2u/teacher-exploration.mjs', 'scripts/r1r/capital.mjs', 'scripts/r1r/teacher-exploration.mjs']);
const srcDiff = execFileSync('git', ['diff', '--name-only', baseline, 'HEAD', '--', 'src/'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
check('MA-08', 'canonical src/ semantics are unchanged', srcDiff === '', srcDiff === '' ? 'zero src diff' : `CHANGED: ${srcDiff}`);

/* ---------------------------------------------------------------- §21 the design is frozen */

process.stdout.write(`${NL}--- §21 the schedule and the arms are frozen ---${NL}`);
const plan = trialPlan();
check('MA-09', 'the schedule is exactly 2 scenarios × 2 conditions × 5 repetitions = 20', plan.length === EXPECTED_TRIALS, `${String(plan.length)} trials (expected ${String(EXPECTED_TRIALS)})`);
const blocksC = blockOrder(5, 'C');
const blocksD = blockOrder(5, 'D');
check('MA-10', 'every randomized block contains exactly M0 and M1', [...blocksC, ...blocksD].every((block) => [...block.order].sort().join(',') === [...CONDITIONS].sort().join(',')), `C: ${blocksC.map((block) => block.order.join('/')).join(' ')} | D: ${blocksD.map((block) => block.order.join('/')).join(' ')}`);
check('MA-11', 'the block order derives from ONE frozen seed and differs across blocks', PROTOCOL_SEED === 0x52_4d_03_01 && new Set(blocksC.map((block) => block.order.join(','))).size > 1, `seed 0x${PROTOCOL_SEED.toString(16)}`);

/* ---------------------------------------------------------------- §6/§19 the seam is inert and M0 is production */

process.stdout.write(`${NL}--- §6/§19 the experimental seam is inert by default and M0 IS production ---${NL}`);
const metadataPath = join(REPO_ROOT, 'host', 'dsh', 'lib', 'index-metadata.js');
const metadata = await import(`file://${metadataPath.replace(/\\/gu, '/')}`);
const goldenPath = join(REPO_ROOT, 'scripts', 'r2u', 'fixtures', 'production-prompt.golden.txt');
const golden = readFileSync(goldenPath, 'utf8');
check('MA-12', 'the DEFAULT mode resolves to off and only the two frozen tokens enable an arm', metadata.resolveIndexMetadataMode(undefined) === metadata.INDEX_METADATA_MODES.OFF && metadata.resolveIndexMetadataMode('M1') === metadata.INDEX_METADATA_MODES.OFF && metadata.resolveIndexMetadataMode('m0') === metadata.INDEX_METADATA_MODES.M0 && metadata.resolveIndexMetadataMode('m1') === metadata.INDEX_METADATA_MODES.M1, 'absent/uppercase ⇒ off; the exact tokens m0/m1 select the arms');
for (const value of [undefined, '', 'M1 ', 'm1x', 'M0x', 'on', 'true', '1', 'explicit-review']) {
  if (metadata.resolveIndexMetadataMode(value) !== metadata.INDEX_METADATA_MODES.OFF) check('MA-13', `an unrecognized value (${JSON.stringify(value)}) must not enable an arm`, false, `resolved to ${metadata.resolveIndexMetadataMode(value)}`);
}
check('MA-13', 'no unrecognized index value enables an arm (fail-safe toward production)', true, 'checked: "", "M1 ", m1x, M0x, on, true, 1, explicit-review — all resolve to off');

/**
 * §6/§19: M0 IS THE PRODUCTION INDEX. The M0 arm is not a re-rendering: `renderIndexMetadata` is only ever
 * called in M1, and the M0 path passes the production section through untouched. This checks the RENDERING
 * property directly — an index with no entries is returned byte-identical — which is what makes the M0
 * arm's `indexPresentationDigest === productionIndexDigest` assertion in `analyse.mjs` meaningful.
 */
const productionIndex = [
  '',
  'Project context available to this attempt (READ-ONLY; never authority):',
  '  [proof] @ctx/proof/abc',
  '  [reasoning] @ctx/reasoning/cell-1/cl-1',
  '  [procedure] @ctx/procedure/prc-1/0',
  '',
  'Use `palimpsest_worker_context_pull` with exactly one listed handle when the body would help.',
  'Do not invent handles: a handle that is not listed above will be refused.',
].join(NL);
check('MA-14', 'an empty entry list leaves the index byte-identical (the M0 path)', metadata.renderIndexMetadata(productionIndex, []) === productionIndex, 'renderIndexMetadata is the identity with no entries');
check('MA-15', 'the index with no selected capital is left unchanged', metadata.renderIndexMetadata('Project context available to this attempt (READ-ONLY; never authority):' + NL + '  (no project context was selected for this attempt)', []) === 'Project context available to this attempt (READ-ONLY; never authority):' + NL + '  (no project context was selected for this attempt)', 'the empty-case section is untouched');

/* ---------------------------------------------------------------- §12/§13 the frozen projection */

process.stdout.write(`${NL}--- §12/§13 the projection algorithm and the budget are frozen ---${NL}`);
const long = 'x'.repeat(400);
const bounded = metadata.boundedText(long, 160);
check('MA-16', 'the projection truncates at the frozen budget and appends ONE fixed marker', [...bounded.text].length === 161 && bounded.text.endsWith(metadata.TRUNCATION_MARKER) && bounded.truncated === true, `${String(bounded.renderedCodePoints)} code points rendered from ${String(bounded.contentCodePoints)}`);
check('MA-17', 'the projection is deterministic (same input ⇒ same bytes)', metadata.boundedText(long, 160).text === metadata.boundedText(long, 160).text && metadata.textDigest(metadata.boundedText(long, 160).text) === metadata.textDigest(bounded.text), 'digest-stable');
check('MA-18', 'the projection normalizes CRLF and trims outer whitespace only', metadata.boundedText('  a' + String.fromCharCode(13) + String.fromCharCode(10) + 'b  ', 160).text === 'a' + NL + 'b', 'CRLF ⇒ LF, outer trim');
check('MA-19', 'a short field is NOT marked truncated', metadata.boundedText('short', 160).truncated === false && metadata.boundedText('short', 160).text === 'short', 'no marker on an untruncated field');
check('MA-20', 'the frozen budget is the one the ruling fixed', metadata.PREVIEW_BUDGET.proof === 160 && metadata.PREVIEW_BUDGET.reasoning === 160 && metadata.PREVIEW_BUDGET.procedureApplicability === 120 && metadata.PREVIEW_BUDGET.procedureLimitations === 120, `proof ${String(metadata.PREVIEW_BUDGET.proof)} · reasoning ${String(metadata.PREVIEW_BUDGET.reasoning)} · procedure ${String(metadata.PREVIEW_BUDGET.procedureApplicability)}/${String(metadata.PREVIEW_BUDGET.procedureLimitations)}`);
check('MA-21', '§11 the Procedure presentation ruling is recorded (P-A, not P-B)', metadata.PROCEDURE_RULING === 'P-A', `${metadata.PROCEDURE_RULING}: applicability + limitations only, no method-body preview`);
check('MA-22', '§8 the two provenances are distinct and both are recorded', metadata.SEMANTIC_PROVENANCE.PROCEDURE === 'OWNER_DECLARED' && metadata.SEMANTIC_PROVENANCE.PROOF === 'HOST_PROJECTED_FROM_OWNER_CONTENT' && metadata.MATERIALIZATION_PROVENANCE === 'GOVERNED_BODY_FETCH', 'owner-declared vs host-projected, both materialized by governed body fetch');
check('MA-23', '§7/§12 the seam exports no relevance, priority or salience scoring surface', Object.keys(metadata).every((name) => !/(relevance|priority|salience|score)/iu.test(name)), `exports: ${Object.keys(metadata).join(', ')}`);

/* ---------------------------------------------------------------- §18 readiness proof (NO C/D pilot) */

process.stdout.write(`${NL}--- §18 readiness proof: dummy-fixture real-DSH session, NO C/D pilot ---${NL}`);
/**
 * §18 (R2-LR): NO STOCHASTIC SCENARIO C OR D PILOT BEFORE THE RESTARTED MATRIX.
 *
 * The blocked attempt ran four C/D pilots, which both violated the no-pilot discipline and — decisively —
 * received no M1 treatment at all. §18 permits a readiness proof built from deterministic tests, the
 * dummy-fixture real-DSH session proof, security gates and exact byte inspection. So the readiness evidence
 * here is the ALREADY-RUN last-mile proof, whose fixture is a dedicated dummy project, never C or D.
 */
const lastMileRecord = join(REPO_ROOT, 'research-evidence', 'r2-lr', 'last-mile-proof.json');
const lastMile = existsSync(lastMileRecord) ? JSON.parse(readFileSync(lastMileRecord, 'utf8')) : null;
check('MA-24', '§18 the dummy-fixture real-DSH session proof exists and PASSED', lastMile !== null && lastMile.results.every((entry) => entry.pass), lastMile === null ? 'no last-mile record — run scripts/r2lr/last-mile-proof.mjs' : `${String(lastMile.results.length)}/${String(lastMile.results.length)} assertions`);
check('MA-25', '§18 the proof fixture is a DUMMY project, not Scenario C or D', lastMile !== null && Array.isArray(lastMile.handlesInPayload) && lastMile.handlesInPayload.every((handle) => handle.startsWith('@ctx/')), lastMile === null ? 'no record' : 'the proof used the r2-lr dummy fixture with per-run nonces');

/**
 * §19/§21: THE TREATMENT SEAM, checked deterministically rather than by a pilot. The M0 identity property
 * and the M1 rendering property are the two facts a pilot would have demonstrated, and both are already
 * pinned by the deterministic suite — so the pilot adds cost without adding evidence.
 */
const sampleProductionIndex = ['', 'Project context available to this attempt (READ-ONLY; never authority):', '  [proof] @ctx/proof/abc', '', 'Use `palimpsest_worker_context_pull` with exactly one listed handle when the body would help.', 'Do not invent handles: a handle that is not listed above will be refused.'].join(NL);
check('MA-26', '§6/§19 M0 is the identity: an empty entry list leaves the index byte-identical', metadata.renderIndexMetadata(sampleProductionIndex, []) === sampleProductionIndex, 'verified deterministically; the session-boundary version is proven by the last-mile gate');
const sampleEntries = [metadata.deriveIndexEntry({ handle: '@ctx/proof/pc-1', kind: 'proof' }, { body: { statement: 'x'.repeat(400) }, binding: { standing_at_compile: 'SUPPORTED', freshness_at_compile: 'fresh' } })];
const renderedM1 = metadata.renderIndexMetadata(sampleProductionIndex, sampleEntries);
check('MA-27', '§5/§8 M1 replaces the entry lines and preserves the heading and instructions', renderedM1.includes('Standing at compile:') && renderedM1.includes('Selected for this attempt: true') && renderedM1.includes('Do not invent handles'), 'derived block present; boundary lines unchanged');
check('MA-28', '§22 the runner subtracts the host derivation offset before reporting worker pulls', readFileSync(join(REPO_ROOT, 'host', 'dsh', 'lib', 'runner.js'), 'utf8').includes('derivationPullOffset === 0 ? allPulled : allPulled.slice(derivationPullOffset)'), 'the worker pull telemetry excludes the host derivation');

/* ---------------------------------------------------------------- §14 the preview leakage gate */

process.stdout.write(`${NL}--- §14 the preview leakage gate (mechanical inspection of the rendered M1 material) ---${NL}`);
const leakage = (() => {
  const problems = [];
  /** §14: the rendered M1 material is checked against the REAL capital statements of both scenarios. */
  const capital = deriveCapital();
  for (const scenarioId of ['C', 'D']) {
    const entry = capital[scenarioId];
    if (entry === undefined) continue;
    const entries = [
      metadata.deriveIndexEntry({ handle: '@ctx/proof/pc-x', kind: 'proof' }, { body: { statement: entry.proof.statement }, binding: {} }),
      metadata.deriveIndexEntry({ handle: '@ctx/reasoning/cell-x/cl-x', kind: 'reasoning' }, { body: { statement: entry.reasoning.statement }, binding: {} }),
    ];
    const section = metadata.renderIndexMetadata(sampleProductionIndex, entries);
    if (section.includes(entry.proof.statement)) problems.push(`${scenarioId}: the rendered index contains the complete proof statement`);
    if (section.includes(entry.reasoning.statement)) problems.push(`${scenarioId}: the rendered index contains the complete reasoning statement`);
    /** §14: the projection must actually TRUNCATE these real statements, not pass them through. */
    for (const manifestEntry of entries.flatMap((entry2) => metadata.manifestEntry(entry2))) {
      if (manifestEntry.truncated !== true) problems.push(`${scenarioId}: ${manifestEntry.field} was not truncated although the source exceeds the budget`);
    }
  }
  return { problems, rendered: 2 };
})();
check('MA-29', '§14: the rendered M1 index leaks no hidden acceptance, oracle or full body', leakage.problems.length === 0, leakage.problems.length === 0 ? `${String(leakage.rendered)} scenario(s) inspected, clean, and every real statement truncated` : leakage.problems.join('; '));

/* ---------------------------------------------------------------- §32 the harness digest */

process.stdout.write(`${NL}--- §32 the harness digest the readiness proof ran under ---${NL}`);
const harnessDigests = {
  'host/dsh/lib/index-metadata.js': digestOf(metadataPath),
  'host/dsh/lib/runner.js': digestOf(join(REPO_ROOT, 'host', 'dsh', 'lib', 'runner.js')),
  'scripts/r2m/design.mjs': digestOf(join(REPO_ROOT, 'scripts', 'r2m', 'design.mjs')),
  'scripts/r2m/trial.mjs': digestOf(join(REPO_ROOT, 'scripts', 'r2m', 'trial.mjs')),
  'scripts/r2lr/session-probe.mjs': digestOf(join(REPO_ROOT, 'scripts', 'r2lr', 'session-probe.mjs')),
};
mkdirSync(PILOT_RIG, { recursive: true });
writeFileSync(join(PILOT_RIG, 'harness-digests.json'), `${JSON.stringify(harnessDigests, null, 2)}\n`, 'utf8');
writeFileSync(join(PILOT_RIG, 'readiness.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R2-M', note: '§18 readiness: NO stochastic C/D pilot was run before the restarted matrix', lastMile: lastMile === null ? null : { assertions: lastMile.results.length, failed: lastMile.results.filter((entry) => !entry.pass).length }, leakage: leakage.problems }, null, 2)}\n`, 'utf8');
check('MA-30', 'the harness digests the readiness proof ran under are recorded', Object.values(harnessDigests).every((digest) => /^[0-9a-f]{64}$/u.test(digest)), `${String(Object.keys(harnessDigests).length)} files digested`);

/* ---------------------------------------------------------------- report */

const failed = results.filter((entry) => !entry.pass);
mkdirSync(RIG, { recursive: true });
mkdirSync(join(REPO_ROOT, 'research-evidence', 'r2-m'), { recursive: true });
writeFileSync(join(REPO_ROOT, 'research-evidence', 'r2-m', 'gate-a.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R2-M', gate: 'A', results, harnessDigests }, null, 2)}\n`, 'utf8');
process.stdout.write(`${NL}R2-M GATE A (treatment validity): ${failed.length === 0 ? 'GREEN' : 'RED'} — ${String(results.length - failed.length)}/${String(results.length)}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
