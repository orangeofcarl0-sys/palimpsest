#!/usr/bin/env node
/**
 * SR-1C §21 — capture the golden structural parity fixture from a BUILT tree.
 *
 *   node scripts/audit/application-parity.mjs --tree <path> --print
 *   node scripts/audit/application-parity.mjs --tree <baseline> --write
 *
 * The capture logic lives in `tools/architecture/application_parity.ts` and is shared with
 * `test/architecture/application_parity.test.ts`, so the fixture and its checker cannot drift.
 * `--write` records the fixture into the CURRENT tree, captured FROM `--tree`: it is only ever
 * run against the canonical baseline, never against the tree it guards.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};
const TREE = flag('--tree', '.');
const OUT = flag('--out', join('test', 'fixtures', 'sr1', 'application-parity.json'));

const mod = await import(pathToFileURL(join(process.cwd(), 'dist', 'tools', 'architecture', 'application_parity.js')).href);
const capture = await mod.captureApplicationParity(TREE);

if (!argv.includes('--write')) {
  process.stdout.write(JSON.stringify(capture, null, 2) + String.fromCharCode(10));
  process.exit(0);
}

const payload = {
  note:
    'SR-1C §21 golden structural parity fixture. Captured from the canonical baseline ' +
    '(a30a328afbe2850e02151f4e41f32242091abeae) with ' +
    '`node scripts/audit/application-parity.mjs --tree <baseline> --write`, and compared by ' +
    'test/architecture/application_parity.test.ts. Sorted indices only: no timestamps, paths or ids.',
  capture,
};
const target = join(process.cwd(), OUT);
mkdirSync(join(process.cwd(), 'test', 'fixtures', 'sr1'), { recursive: true });
writeFileSync(target, JSON.stringify(payload, null, 2) + String.fromCharCode(10));
process.stdout.write('parity fixture written: ' + target + ' (captured from ' + TREE + ')' + String.fromCharCode(10));
