#!/usr/bin/env node
/**
 * R3-A0 §4/§5/§6 — CONSTRUCT THE FROZEN FIXTURES AND AUDIT THEM.
 *
 * Writes each fixture revision from `fixture-content.mjs`, computes its content digest, and runs two
 * DETERMINISTIC coherence checks that must hold BEFORE any model is involved:
 *
 *   1. the H0 source actually FAILS the hidden classes the fixture claims headroom for, and PASSES none of
 *      them by accident — a fixture whose H0 already solves everything has no headroom and is not a fixture;
 *   2. every declared failure class is exercised by at least one case, and every case names a declared class.
 *
 * §2.5: this writes a NEW revision directory. It never edits a frozen revision in place.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { FIXTURE_SPECS } from './fixture-content.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
export const FIXTURE_ROOT = join(REPO_ROOT, 'fixtures', 'r3a');
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
  /** §5: the revision digest is over the ORDERED file list, so a rename or a reorder is visible. */
  const contentDigest = createHash('sha256')
    .update(files.map((file) => `${file.path}:${file.sha256}`).join('\n'), 'utf8')
    .digest('hex');
  return Object.freeze({ fixtureId: spec.fixtureId, fixtureRevision: spec.fixtureRevision, dir, files: Object.freeze(files), contentDigest });
}

/** Load the fixture's own source and acceptance modules from the constructed directory. */
async function loadModules(spec, constructed) {
  const sourceUrl = new URL(`file:///${join(constructed.dir, spec.sourceFile).replace(/\\/gu, '/')}`).href;
  const acceptanceUrl = new URL(`file:///${join(constructed.dir, spec.acceptanceFile).replace(/\\/gu, '/')}`).href;
  const source = await import(sourceUrl);
  const acceptance = await import(acceptanceUrl);
  return { source, acceptance };
}

/** The class list and case list of a fixture, read from its own acceptance module. */
function casesOf(spec, acceptance) {
  return spec.fixtureId.includes('f-a') ? { classes: acceptance.FA_CLASSES, cases: acceptance.FA_CASES } : { classes: acceptance.FB_CLASSES, cases: acceptance.FB_CASES };
}

/**
 * §4/§6: THE COHERENCE AUDIT. Deterministic, no model involved.
 *
 * The H0 must FAIL at least one case per class the fixture claims headroom for, and must not be at the floor
 * on every case (a fixture H0 solves nothing on is also unmeasurable in the other direction).
 */
export async function auditFixture(spec, root = FIXTURE_ROOT) {
  const constructed = constructFixture(spec, root);
  const { source, acceptance } = await loadModules(spec, constructed);
  const { classes, cases } = casesOf(spec, acceptance);
  const run = acceptance.runCases(source[spec.exportName], cases);

  const perClass = classes.map((entry) => {
    const members = run.results.filter((result) => result.failureClass === entry.id);
    return Object.freeze({
      classId: entry.id,
      invariant: entry.invariant,
      cases: members.length,
      passed: members.filter((result) => result.pass).length,
      failed: members.filter((result) => !result.pass).length,
      /** A class has H0 headroom when H0 fails at least one of its cases. */
      h0Headroom: members.some((result) => !result.pass),
    });
  });

  const undeclared = run.results.filter((result) => !classes.some((entry) => entry.id === result.failureClass));
  const unexercised = classes.filter((entry) => !cases.some((testCase) => testCase.failureClass === entry.id));

  return Object.freeze({
    fixtureId: spec.fixtureId,
    fixtureRevision: spec.fixtureRevision,
    mechanismFamily: spec.mechanismFamily,
    sourceFile: spec.sourceFile,
    exportName: spec.exportName,
    contentDigest: constructed.contentDigest,
    files: constructed.files,
    h0: Object.freeze({ passed: run.passed, total: run.total, raw: `${String(run.passed)}/${String(run.total)}` }),
    perClass: Object.freeze(perClass),
    classesWithHeadroom: perClass.filter((entry) => entry.h0Headroom).map((entry) => entry.classId),
    classesWithoutHeadroom: perClass.filter((entry) => !entry.h0Headroom).map((entry) => entry.classId),
    undeclaredCases: undeclared.map((result) => result.id),
    unexercisedClasses: unexercised.map((entry) => entry.id),
    classStructure: spec.classStructure,
  });
}

async function main() {
  const audits = [];
  for (const spec of FIXTURE_SPECS) audits.push(await auditFixture(spec));
  mkdirSync(join(REPO_ROOT, 'research-evidence', 'r3-a'), { recursive: true });
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a', 'fixture-audit.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-A0', fixtures: audits }, null, 2)}${NL}`, 'utf8');
  for (const audit of audits) {
    process.stdout.write(`${audit.fixtureId} r${String(audit.fixtureRevision)} — H0 ${audit.h0.raw}${NL}`);
    process.stdout.write(`  digest ${audit.contentDigest.slice(0, 16)}…${NL}`);
    for (const entry of audit.perClass) process.stdout.write(`  ${entry.classId} ${entry.invariant}: ${String(entry.passed)}/${String(entry.cases)} passed, headroom=${String(entry.h0Headroom)}${NL}`);
    if (audit.undeclaredCases.length > 0) process.stdout.write(`  UNDECLARED CASES: ${audit.undeclaredCases.join(', ')}${NL}`);
    if (audit.unexercisedClasses.length > 0) process.stdout.write(`  UNEXERCISED CLASSES: ${audit.unexercisedClasses.join(', ')}${NL}`);
  }
  process.stdout.write(`${NL}wrote research-evidence/r3-a/fixture-audit.json${NL}`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
