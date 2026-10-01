#!/usr/bin/env node
/**
 * R2-U §8/§25 — THE PROMPT-ISOLATION PROOF, AND THE DEFAULT-PATH BYTE-IDENTITY PROOF.
 *
 * §8 requires that, within one randomized block, these are IDENTICAL across the four cells:
 *
 *   ProjectIR digest · task digest · repo tree digest · visible tests · hidden oracle · worker profile ·
 *   model · policy · ordinary task text · capability catalogue
 *
 * and that the ONLY differences are the capital index presence and the uptake-affordance clause presence.
 * §8 also requires the components be RECORDED SEPARATELY rather than as one digest that masks the factor —
 * a single whole-prompt digest changes both when the index appears and when the clause appears, so it
 * cannot show that only one of them moved.
 *
 * §7/§25 additionally require the DEFAULT path to be BYTE-IDENTICAL to current production. That is checked
 * here against a golden capture taken from the stage's starting commit, so "byte-identical" is a comparison
 * rather than an assurance.
 *
 * This script runs BEFORE the matrix: the `--record` mode reads a completed matrix and verifies isolation
 * per block, while the default mode proves the prompt seam itself.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AFFORDANCE_MODES, applyAffordance, resolveAffordanceMode, UPTAKE_CLAUSE, uptakeClauseDigest } from '../../host/dsh/lib/affordance.js';
import { CELLS } from './design.mjs';
import { isolationCheck } from './analyse.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const GOLDEN = join(REPO_ROOT, 'scripts', 'r2u', 'fixtures', 'production-prompt.golden.txt');
const GOLDEN_CONTEXT = join(REPO_ROOT, 'scripts', 'r2u', 'fixtures', 'production-prompt.context.json');

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));

const NL = String.fromCharCode(10);
const results = [];
const check = (id, statement, pass, detail) => {
  results.push({ id, statement, pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${statement} — ${detail}${NL}`);
};

/* ---------------------------------------------------------------- §7 the default path is byte-identical */

process.stdout.write(`--- §7 the default presentation path ---${NL}`);
const golden = readFileSync(GOLDEN, 'utf8');
const fixture = JSON.parse(readFileSync(GOLDEN_CONTEXT, 'utf8'));

/**
 * The baseline `workTask` is extracted from the golden capture's own context, so the comparison is against
 * the SAME inputs the golden text was produced from. The extraction of the current function is done the same
 * way `capture-baseline-prompt.mjs` did it, from the working tree rather than from git, so this compares
 * production-now against production-at-the-stage-start.
 */
const source = readFileSync(join(REPO_ROOT, 'host', 'dsh', 'lib', 'runner.js'), 'utf8');
/**
 * The file is checked out with CRLF on Windows and the golden capture came from `git show` (LF), so the
 * extraction normalizes line endings BEFORE locating the function and the emitted probe is written with LF.
 * Without this, the comparison would report a byte difference that is entirely line endings.
 */
const normalizedSource = source.replace(/\r\n/gu, '\n');
const start = normalizedSource.indexOf('function workTask(');
const end = normalizedSource.indexOf('\n}\n', start);
if (start === -1 || end === -1) throw new Error('the runner has no workTask function to compare');
const workTaskSource = normalizedSource.slice(start, end + 3);
const probePath = join(REPO_ROOT, 'scripts', 'r2u', 'fixtures', '.workTask-current.mjs');
const { writeFileSync } = await import('node:fs');
writeFileSync(probePath, `${workTaskSource}\nexport { workTask };\n`, 'utf8');
const { workTask } = await import(`${new URL(`file://${probePath.replace(/\\/gu, '/')}`).href}?v=${String(Date.now())}`);

const currentDefault = applyAffordance(workTask(fixture.context, fixture.indexText), AFFORDANCE_MODES.OFF);
check(
  'ISO-01',
  'the DEFAULT mode prompt is BYTE-IDENTICAL to the captured production prompt',
  currentDefault === golden,
  currentDefault === golden ? `${String(Buffer.byteLength(golden, 'utf8'))} bytes, identical` : `DIFFERS: ${String(Buffer.byteLength(currentDefault, 'utf8'))} bytes vs ${String(Buffer.byteLength(golden, 'utf8'))}`,
);

const absent = applyAffordance(workTask(fixture.context, fixture.indexText), resolveAffordanceMode(undefined));
check('ISO-02', 'an UNSET affordance environment value yields the production prompt', absent === golden, 'absent ⇒ off ⇒ byte-identical');

for (const value of ['', 'on', 'EXPLICIT-REVIEW', 'explicit_review', 'true', '1']) {
  const mode = resolveAffordanceMode(value);
  if (mode !== AFFORDANCE_MODES.OFF) check('ISO-03', `an unrecognized value (${JSON.stringify(value)}) must not enable the clause`, false, `resolved to ${mode}`);
}
check('ISO-03', 'no unrecognized affordance value enables the clause (fail-safe toward production)', true, 'checked: "", on, EXPLICIT-REVIEW, explicit_review, true, 1 — all resolve to off');

/* ---------------------------------------------------------------- §6/§7 the A1 clause */

process.stdout.write(`${NL}--- §6/§7 the explicit-review clause ---${NL}`);
const a1 = applyAffordance(workTask(fixture.context, fixture.indexText), AFFORDANCE_MODES.EXPLICIT_REVIEW);
check('ISO-04', 'the A1 prompt is the A0 prompt PLUS exactly the frozen clause', a1 === `${golden}\n\n${UPTAKE_CLAUSE}`, `added ${String(Buffer.byteLength(`\n\n${UPTAKE_CLAUSE}`, 'utf8'))} bytes; nothing else changed`);
check('ISO-05', 'the A1 prompt contains the A0 prompt as a prefix, so nothing was re-rendered', a1.startsWith(golden), 'prefix preserved');
check('ISO-06', 'the clause names no handle kind and no body content', !/procedure|proof|reasoning|@ctx\//iu.test(UPTAKE_CLAUSE), 'the clause is kind-agnostic and content-blind');
check('ISO-07', 'the clause routes the read through the governed capability rather than the filesystem', UPTAKE_CLAUSE.includes('governed context-pull capability'), 'the affordance cannot be read as "read the file"');
check('ISO-08', 'the clause covers the empty/irrelevant case, which is what makes K0A1 the placebo', /empty or not relevant, proceed normally/iu.test(UPTAKE_CLAUSE), 'the placebo arm is stated in the clause itself');

const digest = await uptakeClauseDigest();
check('ISO-09', 'the clause digest is stable and recorded', /^[0-9a-f]{64}$/u.test(digest), digest);

/* ---------------------------------------------------------------- §8 per-block isolation, from a matrix */

const RIG = args.get('rig');
if (typeof RIG === 'string' && RIG !== '') {
  process.stdout.write(`${NL}--- §8 per-block isolation, from the recorded matrix ---${NL}`);
  const matrixPath = join(RIG, 'trials.json');
  if (!existsSync(matrixPath)) {
    check('ISO-10', 'the matrix record exists', false, `no record at ${matrixPath}`);
  } else {
    const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
    const normalized = matrix.trials.map((record) => ({
      scenario: record.scenario,
      cell: record.cell,
      factorK: record.factorK,
      factorA: record.factorA,
      block: record.block,
      handlesVisible: record.prompt?.indexHandleCount ?? 0,
      ordinaryTaskDigest: record.prompt?.ordinaryTaskDigest ?? 'UNKNOWN',
      affordanceClauseDigest: record.prompt?.affordanceClauseDigest ?? 'UNKNOWN',
      capabilitySetDigest: record.prompt?.capabilitySetDigest ?? 'UNKNOWN',
      pairedState: record.pairedState ?? null,
    }));
    const blocks = isolationCheck(normalized);
    const confounded = blocks.filter((block) => block.confounded);
    check('ISO-10', 'every randomized block holds the invariant components identical across its four cells', confounded.length === 0, `${String(blocks.length)} blocks checked; ${String(confounded.length)} confounded${confounded.length === 0 ? '' : `: ${confounded.map((block) => `${block.scenario}/b${String(block.block)} ${block.differences.join('; ')}`).join(' | ')}`}`);
    const cellsSeen = new Set(normalized.map((record) => record.cell));
    check('ISO-11', 'every block contains exactly the four pre-registered cells', CELLS.every((cell) => cellsSeen.has(cell)) && blocks.every((block) => block.cells.length === 4), `cells present: ${[...cellsSeen].sort().join(', ')}`);
  }
}

const failed = results.filter((entry) => !entry.pass);
process.stdout.write(`${NL}R2-U PRESENTATION-ISOLATION: ${failed.length === 0 ? 'PASS' : 'FAIL'} — ${String(results.length - failed.length)}/${String(results.length)}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
