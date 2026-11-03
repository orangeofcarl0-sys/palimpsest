#!/usr/bin/env node
/**
 * R2-U §10/§25 — REGENERATE THE WORKER-VISIBLE CASE FILE.
 *
 * `test/cases.json` is the VISIBLE oracle's case list: the acceptance module's own cases, with the
 * `invariant` field stripped and the reference result attached. Generating it from the acceptance module
 * (rather than hand-writing it) is what makes it impossible for the visible cases to drift from the
 * hidden ones, and the deterministic test asserts the checked-in file still matches this output.
 *
 * Run after editing the acceptance module's case lists:  node scripts/r2u/write-visible-cases.mjs
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const scenarioD = await import(pathToFileURL(join(REPO, 'scripts', 'r2u', 'fixtures', 'scenario-d', 'acceptance.mjs')).href);

const out = join(REPO, 'scripts', 'r2u', 'fixtures', 'scenario-d', 'test', 'cases.json');
const visible = scenarioD.materializeVisible(scenarioD.VISIBLE_CASES);
writeFileSync(out, `${JSON.stringify(visible, null, 2)}\n`, 'utf8');
process.stdout.write(`wrote ${String(visible.length)} visible cases -> ${out}\n`);
