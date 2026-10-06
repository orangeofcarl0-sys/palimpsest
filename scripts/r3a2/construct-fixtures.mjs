#!/usr/bin/env node
/**
 * R3-A2 §"Three-commit evidence structure" — CONSTRUCT THE TWO NEW FIXTURE REVISIONS ON DISK.
 *
 * Writes F-C and F-D from `fixture-content-r3a2.mjs` into `fixtures/r3a2/<id>/r1/`, records the per-file
 * digests and the revision content digest, and refuses to touch an existing revision in place. §"Research
 * ruling" freezes the lifecycle `DESIGN → FREEZE revision → QUALIFY frozen revision`: a revision written from
 * this module cannot be quietly edited, because changing it produces a NEW revision with a NEW digest.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { COMBINED_SPECS, NEW_FAMILIES, contentDigestOf } from './fixtures.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
export const FIXTURE_ROOT = join(REPO_ROOT, 'fixtures', 'r3a2');
const NL = String.fromCharCode(10);

/** Write one fixture revision to disk and return its file map plus the content digest. */
export function constructFixture(spec, root = FIXTURE_ROOT) {
  const dir = join(root, spec.fixtureId, `r${String(spec.fixtureRevision)}`);
  rmSync(dir, { recursive: true, force: true });
  const files = [];
  for (const [relative, content] of Object.entries(spec.files)) {
    const target = join(dir, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
    files.push({ path: relative, bytes: Buffer.byteLength(content, 'utf8'), sha256: createHash('sha256').update(content, 'utf8').digest('hex') });
  }
  /** The revision digest is over the ORDERED file list, so a rename or a reorder is visible. */
  return Object.freeze({
    fixtureId: spec.fixtureId,
    fixtureRevision: spec.fixtureRevision,
    dir,
    files: Object.freeze(files),
    contentDigest: contentDigestOf(spec),
  });
}

function main() {
  const constructed = [];
  for (const fixtureId of NEW_FAMILIES) {
    const spec = COMBINED_SPECS.find((entry) => entry.fixtureId === fixtureId);
    constructed.push(constructFixture(spec));
  }
  mkdirSync(join(REPO_ROOT, 'research-evidence', 'r3-a2'), { recursive: true });
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a2', 'fixture-digests.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-A2', fixtures: constructed }, null, 2)}${NL}`, 'utf8');
  for (const entry of constructed) {
    process.stdout.write(`${entry.fixtureId} r${String(entry.fixtureRevision)} — ${String(entry.files.length)} files${NL}`);
    process.stdout.write(`  dir    ${entry.dir}${NL}`);
    process.stdout.write(`  digest ${entry.contentDigest}${NL}`);
    for (const file of entry.files) process.stdout.write(`    ${file.path.padEnd(20)} ${String(file.bytes).padStart(6)}B  ${file.sha256.slice(0, 16)}…${NL}`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  main();
}
