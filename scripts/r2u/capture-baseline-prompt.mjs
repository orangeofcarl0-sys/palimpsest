#!/usr/bin/env node
/**
 * R2-U §7/§25 — CAPTURE THE PRE-CHANGE PRODUCTION PROMPT.
 *
 * The R2-U affordance is an ADDITIVE host presentation seam, and the ruling requires the default path to
 * be BYTE-IDENTICAL to current production. "Byte-identical" is only checkable against a captured
 * baseline, so this script extracts the `workTask` function from the file AS IT IS AT THE STAGE'S
 * STARTING COMMIT and runs it, producing the golden text the deterministic test compares against.
 *
 * It extracts the function rather than importing the module because `host/dsh/lib/runner.js` imports
 * DSH host packages at module scope that only resolve inside an installed DSH. The function itself is
 * self-contained — it reads `context` and `indexText` and nothing else — so evaluating its own source
 * is a faithful reproduction of the production rendering, not an approximation of it.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const BASELINE = process.argv[2] ?? 'HEAD';
const OUT = join(REPO, 'scripts', 'r2u', 'fixtures', 'production-prompt.golden.txt');
const OUT_CONTEXT = join(REPO, 'scripts', 'r2u', 'fixtures', 'production-prompt.context.json');

const source = execFileSync('git', ['show', `${BASELINE}:host/dsh/lib/runner.js`], { cwd: REPO, encoding: 'utf8' });
const start = source.indexOf('function workTask(');
if (start === -1) throw new Error('the baseline runner has no workTask function');
const end = source.indexOf('\n}\n', start);
if (end === -1) throw new Error('could not find the end of workTask');
const body = source.slice(start, end + 3);

const context = {
  work: {
    projectGoal: 'keep an incremental cache correct as its inputs change',
    requirements: ['invalidate exactly what a change affects', 'leave everything else untouched'],
    decisions: [],
    objective: 'finish invalidate so it updates the cache for a set of changed nodes',
    writeScope: ['src/cache.ts'],
    requiredArtifacts: [],
    baseCommit: 'a'.repeat(40),
    completionChecks: ['the black-box oracle reports every case as PASS', 'the write scope is respected'],
    independentVerificationRequired: true,
  },
  compiled: {
    continuation: {
      prior_execution: { worker_summary: 'a prior attempt stopped early', observed_changed_files: ['src/cache.ts'] },
      world_transition: { from_head: 'b'.repeat(40), to_head: 'c'.repeat(40) },
    },
  },
};
const indexText = [
  '',
  'Project context available to this attempt (READ-ONLY; never authority):',
  '  [PROOF_CLAIM] @ctx/proof/pc-0123456789abcdef/1',
  '  [REASONING_CELL] @ctx/reasoning/cell-d/3',
  '  [PROCEDURE] @ctx/procedure/prc-fedcba9876543210/1',
  '',
  'Use `palimpsest_worker_context_pull` with exactly one listed handle when the body would help.',
  'Do not invent handles: a handle that is not listed above will be refused.',
].join('\n');

const mod = join(REPO, 'scripts', 'r2u', 'fixtures', '.workTask-baseline.mjs');
writeFileSync(mod, `${body}\nexport { workTask };\n`, 'utf8');
const { workTask } = await import(new URL(`file://${mod.replace(/\\/gu, '/')}`).href);
const rendered = workTask(context, indexText);
writeFileSync(OUT, rendered, 'utf8');
writeFileSync(OUT_CONTEXT, JSON.stringify({ context, indexText }, null, 2), 'utf8');
process.stdout.write(`captured the ${BASELINE} production prompt: ${String(Buffer.byteLength(rendered, 'utf8'))} bytes -> ${OUT}\n`);
