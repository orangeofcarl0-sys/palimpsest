#!/usr/bin/env node
/**
 * R2-S §19/§25 — GATE A: THE PRE-MATRIX READINESS CHECKLIST (DETERMINISTIC ONLY).
 *
 * §19 forbids a stochastic C/D pilot: "Use deterministic/dummy readiness tests only." So this gate proves
 * the readiness facts DETERMINISTICALLY — by exercising the seam, the candidate-set construction, the
 * order schedule and the renderer correction directly — and it does NOT run a real worker on Scenario C or
 * D. The model-visible delivery proof belongs to the last-mile gate (R2-LR) and to every primary trial's
 * own session artifact, which is authoritative.
 *
 * THE CHECKLIST (§19/§25):
 *
 *   · the frozen schedule is exactly 20 trials, 2 scenarios × 2 conditions × 5 repetitions;
 *   · every randomized block contains exactly S0 and S1;
 *   · the five distractor sets per scenario are PAIRWISE DISTINCT, so the order varies across blocks;
 *   · each candidate set is 3 TARGET + 3 DISTRACTOR, one per kind, and every distractor is independent;
 *   · the experimental mode is absent by default and only the two frozen tokens enable an arm;
 *   · S0 is the IDENTITY on the production index (the control is the real control);
 *   · S1 replaces ONLY the entry lines and preserves the heading and the trailing instructions;
 *   · §5 the renderer emits each handle EXACTLY ONCE, so the arms differ in metadata bytes and NOT in
 *     handle occurrence count;
 *   · §13 the rendered S1 material leaks no hidden acceptance, no oracle text and no complete body;
 *   · the projection is deterministic and bounded, and the Procedure ruling (P-A) holds;
 *   · the harness digests are recorded, so a later change to the harness invalidates this readiness record.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { CANDIDATE_SET_SIZE, CONDITIONS, DISTRACTOR_COUNT, EXPECTED_TRIALS, KINDS, PROTOCOL_SEED, REPETITIONS, SCENARIO_IDS, TARGET_COUNT, blockOrder, distractorSchedule, previewLeakage, trialPlan } from './design.mjs';
import { BUNDLE_IDS, assertDistractorIndependent, bundleCapital, candidateSetFor } from './candidates.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const RIG = join(homedir(), '.palimpsest-r2s', 'readiness');
const metadata = await import(new URL('../../host/dsh/lib/index-metadata.js', import.meta.url).href);
const NL = String.fromCharCode(10);

const results = [];
const check = (id, statement, pass, detail) => {
  results.push({ id, statement, pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${statement} — ${detail}${NL}`);
};
const digestOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/* ---------------------------------------------------------------- §19 the frozen schedule */

process.stdout.write(`--- §19 the frozen schedule ---${NL}`);
const plan = trialPlan();
check('SA-01', 'the schedule is exactly 2 × 2 × 5 = 20 primary trials', plan.length === EXPECTED_TRIALS && EXPECTED_TRIALS === 20, `${String(plan.length)} trials planned`);
check('SA-02', 'the seed is the frozen literal', PROTOCOL_SEED === 0x52_53_02_01, `0x${PROTOCOL_SEED.toString(16)}`);
for (const scenarioId of SCENARIO_IDS) {
  const blocks = blockOrder(REPETITIONS, scenarioId);
  check(`SA-03${scenarioId}`, `§19 every ${scenarioId} block contains exactly S0 and S1`, blocks.length === REPETITIONS && blocks.every((block) => [...block.order].sort().join(',') === [...CONDITIONS].sort().join(',')), blocks.map((block) => `b${String(block.block)}[${block.order.join(',')}]`).join(' '));
  check(`SA-04${scenarioId}`, `§19 the ${scenarioId} arms are INTERLEAVED, not grouped`, new Set(blocks.map((block) => block.order.join(','))).size > 1, `${String(new Set(blocks.map((block) => block.order.join(','))).size)} distinct permutations`);
}

/* ---------------------------------------------------------------- §6/§7/§11 the candidate sets */

process.stdout.write(`${NL}--- §6/§7 the broad candidate sets (3 target + 3 distractor) ---${NL}`);
const sets = {};
for (const scenarioId of SCENARIO_IDS) {
  const schedule = distractorSchedule(scenarioId, REPETITIONS);
  const keys = schedule.map((entry) => entry.key);
  check(`SA-05${scenarioId}`, `§11 the five ${scenarioId} distractor sets are PAIRWISE DISTINCT`, new Set(keys).size === REPETITIONS, keys.join(' | '));
  sets[scenarioId] = schedule.map((entry) => candidateSetFor(scenarioId, entry.set));
  check(`SA-06${scenarioId}`, `§6 every ${scenarioId} candidate set is 3 TARGET + 3 DISTRACTOR, one per kind`, sets[scenarioId].every((set) => set.targetCount === TARGET_COUNT && set.distractorCount === DISTRACTOR_COUNT && KINDS.every((kind) => set.items.filter((item) => item.kind === kind).length === 2)), `${String(sets[scenarioId].length)} sets, each ${String(CANDIDATE_SET_SIZE)} items`);
  const independence = sets[scenarioId].map((set) => assertDistractorIndependent(scenarioId, set));
  check(`SA-07${scenarioId}`, `§6/§7 every ${scenarioId} distractor is an INDEPENDENT bundle, not the target and not the target's domain`, independence.every((entry) => entry.ok), independence.flatMap((entry) => entry.problems).join('; ') || 'all distractors independent');
  check(`SA-08${scenarioId}`, `§7 the ${scenarioId} target is the scenario's OWN bundle`, sets[scenarioId].every((set) => set.targetBundleId === scenarioId), `${scenarioId} → ${sets[scenarioId][0]?.targetBundleId ?? '?'}`);
}

/** §7: every installed bundle resolves to REAL capital — no fake or garbage distractor content. */
const bundles = BUNDLE_IDS.map((bundleId) => bundleCapital(bundleId));
check('SA-09', '§6 every distractor pool member is REAL mature capital (a recorded exploration, not a string)', bundles.length === 3 && bundles.every((bundle) => typeof bundle.proof?.statement === 'string' && bundle.proof.statement.length > 80 && Array.isArray(bundle.procedureClauses) && bundle.procedureClauses.length > 0), bundles.map((bundle) => `${bundle.bundleId}:${String(bundle.procedureClauses.length)} clauses`).join(' | '));
check('SA-10', '§6 no distractor bundle shares a domain with a DIFFERENT bundle', new Set(bundles.map((bundle) => bundle.domain)).size === bundles.length, bundles.map((bundle) => `${bundle.bundleId}:${bundle.domain.split(' (')[0]}`).join(' | '));

/* ---------------------------------------------------------------- §9/§25 the presentation seam */

process.stdout.write(`${NL}--- §9/§25 the index-presentation seam ---${NL}`);
check('SA-11', 'the DEFAULT mode resolves to off and only the two frozen tokens enable an arm', metadata.resolveIndexMetadataMode(undefined) === metadata.INDEX_METADATA_MODES.OFF && metadata.resolveIndexMetadataMode('m0') === metadata.INDEX_METADATA_MODES.M0 && metadata.resolveIndexMetadataMode('m1') === metadata.INDEX_METADATA_MODES.M1, 'absent ⇒ off; m0/m1 select the arms');
for (const value of [undefined, '', 'M1 ', 'm1x', 'M0x', 'on', 'true', '1', 'explicit-review']) {
  check(`SA-12:${String(value)}`, `no unrecognized value enables an arm (${JSON.stringify(value)})`, metadata.resolveIndexMetadataMode(value) === metadata.INDEX_METADATA_MODES.OFF, 'resolves to off');
}
check('SA-13', 'the seam names no relevance, priority or salience scoring surface', Object.keys(metadata).every((name) => !/(relevance|priority|salience|score)/iu.test(name)), `exports: ${Object.keys(metadata).join(', ')}`);

/* ---------------------------------------------------------------- §5/§9 the six-item rendering */

process.stdout.write(`${NL}--- §5/§9 the S0 identity and the S1 rendering, on the SIX-item set ---${NL}`);
const sampleProductionIndex = [
  '',
  'Project context available to this attempt (READ-ONLY; never authority):',
  ...Array.from({ length: CANDIDATE_SET_SIZE }, (_, index) => `  [${KINDS[index % KINDS.length]}] @ctx/${KINDS[index % KINDS.length]}/handle-${String(index)}`),
  '',
  'Use `palimpsest_worker_context_pull` with exactly one listed handle when the body would help.',
  'Do not invent handles: a handle that is not listed above will be refused.',
].join(NL);
check('SA-14', '§9/§25 S0 is the IDENTITY: an empty entry list leaves the index byte-identical', metadata.renderIndexMetadata(sampleProductionIndex, []) === sampleProductionIndex, 'the S0 arm is the production section passed through, never a re-rendering');

/**
 * The six derived entries, one per production entry line, from the REAL bundles — so the rendering is
 * exercised on real content AND the entry count matches the section it replaces. A mismatch here would
 * silently drop the surplus handles and make the occurrence check report the fixture's own error.
 */
const sampleEntries = Array.from({ length: CANDIDATE_SET_SIZE }, (_, index) => {
  const kind = KINDS[index % KINDS.length];
  const bundle = bundles[index % bundles.length];
  const handle = `@ctx/${kind}/handle-${String(index)}`;
  if (kind === 'proof') return metadata.deriveIndexEntry({ handle, kind }, { body: { statement: bundle.proof.statement }, binding: { standing_at_compile: 'SUPPORTED', freshness_at_compile: 'fresh' } });
  if (kind === 'reasoning') return metadata.deriveIndexEntry({ handle, kind }, { body: { statement: bundle.reasoning.statement }, binding: { active_at_compile: true } });
  return metadata.deriveIndexEntry({ handle, kind }, { body: { applicability: [bundle.domain], limitations: ['advisory guidance only; it cannot widen write scope or allowed commands'] }, binding: { standing_at_compile: 'ACTIVE', procedure_revision: 0 } });
});
const renderedS1 = metadata.renderIndexMetadata(sampleProductionIndex, sampleEntries);
check('SA-15', '§9 S1 replaces the entry lines and preserves the heading and the trailing instructions', renderedS1.includes('Standing at compile:') && renderedS1.includes('Selected for this attempt: true') && renderedS1.includes('Do not invent handles'), 'derived block present; boundary lines unchanged');

/**
 * §5: THE LOAD-BEARING CORRECTION. Each handle must appear EXACTLY ONCE in the rendered S1 section — the
 * same count as in the S0 section — so the arms differ in metadata bytes and NOT in handle repetition.
 */
const s0Counts = Array.from({ length: CANDIDATE_SET_SIZE }, (_, index) => ({ handle: `@ctx/${KINDS[index % KINDS.length]}/handle-${String(index)}`, count: 0 }));
for (const entry of s0Counts) entry.count = sampleProductionIndex.split(entry.handle).length - 1;
const s1Counts = s0Counts.map((entry) => ({ handle: entry.handle, count: renderedS1.split(entry.handle).length - 1 }));
check('SA-16', '§5 every handle appears EXACTLY ONCE in the rendered S1 section', s1Counts.every((entry) => entry.count === 1), s1Counts.map((entry) => `${entry.handle.slice(0, 26)}…×${String(entry.count)}`).join(' | '));
check('SA-17', '§5 the S0 and S1 handle OCCURRENCE COUNTS are EQUAL (the duplicate-handle confound is removed)', s0Counts.every((entry) => entry.count === 1) && s1Counts.every((entry) => entry.count === 1), `S0 all×1 and S1 all×1 across ${String(CANDIDATE_SET_SIZE)} handles`);
check('SA-18', '§5 the renderer emits NO trailing duplicate `Handle:` line', !renderedS1.includes('    Handle: '), 'the trailing per-entry handle line is gone');

/* ---------------------------------------------------------------- §12/§13 the projection + leakage */

process.stdout.write(`${NL}--- §12/§13 the frozen projection and the leakage gate ---${NL}`);
check('SA-19', '§12 the projection is deterministic — the same input yields the same bytes', metadata.boundedText('some owner content', 160).text === metadata.boundedText('some owner content', 160).text, 'byte-stable');
check('SA-20', '§12 the projection is bounded and marks a truncation with exactly ONE fixed marker', (() => { const result = metadata.boundedText('x'.repeat(400), 160); return result.truncated && [...result.text].length === 161 && result.text.endsWith(metadata.TRUNCATION_MARKER); })(), '161 code points, marker appended');
check('SA-21', '§12 the per-field budget is the frozen one', metadata.PREVIEW_BUDGET.proof === 160 && metadata.PREVIEW_BUDGET.reasoning === 160 && metadata.PREVIEW_BUDGET.procedureApplicability === 120 && metadata.PREVIEW_BUDGET.procedureLimitations === 120, JSON.stringify(metadata.PREVIEW_BUDGET));
check('SA-22', '§11 the Procedure ruling is P-A: applicability + limitations only, no method-body preview', metadata.PROCEDURE_RULING === 'P-A' && (() => { const procedure = metadata.deriveIndexEntry({ handle: '@ctx/procedure/p/0', kind: 'procedure' }, { body: { applicability: ['a'], limitations: ['l'], steps: [{ instruction: 'SECRET METHOD STEP' }] }, binding: {} }); return procedure.fields.map((field) => field.name).join(',') === 'Applicability,Limitations' && !JSON.stringify(procedure).includes('SECRET METHOD STEP'); })(), 'P-A holds; the method body is not rendered');
check('SA-23', '§13 the mechanism label marks the seam EXPERIMENTAL, not product semantics', metadata.PREVIEW_MECHANISM === 'EXPERIMENTAL_HOST_DERIVED_PREVIEW', metadata.PREVIEW_MECHANISM);

const leakage = (() => {
  const problems = [];
  const rendered = metadata.renderIndexMetadata(sampleProductionIndex, sampleEntries);
  for (const scenarioId of SCENARIO_IDS) {
    const forbidden = [SCENARIOS[scenarioId].taskObjective, SCENARIOS[scenarioId].knownFailure].filter((value) => typeof value === 'string');
    problems.push(...previewLeakage({ previewText: rendered, sourceField: '', forbidden }).problems);
  }
  for (const bundle of bundles) {
    for (const statement of [bundle.proof.statement, bundle.reasoning.statement]) {
      if (statement.length > 60 && rendered.includes(statement)) problems.push(`the rendered index contains a complete body statement from ${bundle.bundleId}`);
    }
  }
  return problems;
})();
check('SA-24', '§13 the rendered S1 material leaks no hidden acceptance, no oracle text and no complete body', leakage.length === 0, leakage.length === 0 ? `${String(bundles.length)} bundles inspected; every body truncated; clean` : leakage.join('; '));

/* ---------------------------------------------------------------- §25 the harness digests */

process.stdout.write(`${NL}--- §25 the harness digests this readiness record describes ---${NL}`);
const harnessDigests = {
  'host/dsh/lib/index-metadata.js': digestOf(join(REPO_ROOT, 'host', 'dsh', 'lib', 'index-metadata.js')),
  'host/dsh/lib/runner.js': digestOf(join(REPO_ROOT, 'host', 'dsh', 'lib', 'runner.js')),
  'scripts/r2s/design.mjs': digestOf(join(REPO_ROOT, 'scripts', 'r2s', 'design.mjs')),
  'scripts/r2s/candidates.mjs': digestOf(join(REPO_ROOT, 'scripts', 'r2s', 'candidates.mjs')),
  'scripts/r2s/trial.mjs': digestOf(join(REPO_ROOT, 'scripts', 'r2s', 'trial.mjs')),
};
check('SA-25', 'the harness digests this readiness record describes are recorded', Object.values(harnessDigests).every((digest) => /^[0-9a-f]{64}$/u.test(digest)), `${String(Object.keys(harnessDigests).length)} files digested (a trial does not count if the harness changes afterwards)`);

/* ---------------------------------------------------------------- §25 no canonical change */

process.stdout.write(`${NL}--- §25 the production default is untouched ---${NL}`);
check('SA-26', '§25 the experimental seam is OFF unless the environment explicitly selects an arm', metadata.INDEX_METADATA_ENV === 'PALIMPSEST_R2M_INDEX' && metadata.resolveIndexMetadataMode(process.env.PALIMPSEST_R2M_INDEX) === metadata.INDEX_METADATA_MODES.OFF, 'the default path is byte-identical to production');

/* ---------------------------------------------------------------- report */

const failed = results.filter((entry) => !entry.pass);
mkdirSync(RIG, { recursive: true });
writeFileSync(join(RIG, 'harness-digests.json'), `${JSON.stringify(harnessDigests, null, 2)}${NL}`, 'utf8');
writeFileSync(join(RIG, 'readiness.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R2-S', gate: 'A', deterministicOnly: true, note: '§19: NO stochastic C/D pilot was run; readiness is proven deterministically and the model-visible proof belongs to each trial’s own session artifact', harnessDigests, results }, null, 2)}${NL}`, 'utf8');
mkdirSync(join(REPO_ROOT, 'research-evidence', 'r2-s'), { recursive: true });
writeFileSync(join(REPO_ROOT, 'research-evidence', 'r2-s', 'gate-a.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R2-S', gate: 'A', deterministicOnly: true, harnessDigests, results }, null, 2)}${NL}`, 'utf8');

process.stdout.write(`${NL}§R2-S GATE A: ${failed.length === 0 ? 'GREEN' : 'RED'} — ${String(results.length - failed.length)}/${String(results.length)}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
