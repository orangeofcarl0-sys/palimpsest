/**
 * R3-A2 — THE COMBINED SENTINEL FIXTURE PORTFOLIO REGISTRY.
 *
 * WHY THIS FILE EXISTS RATHER THAN AN APPENDED `FIXTURE_SPECS`.
 *
 * `scripts/r3a/fixture-content.mjs` exports the R3-A0 registry, and five R3-A0/R3-AE modules iterate it
 * (`construct-fixtures`, `fixture-audit`, `analyse`, `qualify`, `gate-c`). Appending F-C and F-D to that
 * array would silently change what those modules enumerate, and therefore rewrite the committed
 * `research-evidence/r3-a/fixture-audit.json`, `gate-c.json` and `qualification-analysis.json` artifacts.
 * This stage may not modify prior evidence, so the two new families are composed HERE instead, and the
 * R3-A0 registry is left exactly as R3-AE left it.
 *
 * The generic accessors below replace the R3-A0 `spec.fixtureId.includes('f-a') ? FA_* : FB_*` dispatch,
 * which could not name a third family. They read the export names the fixture spec declares, so adding a
 * family is a data change rather than a code change.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { FIXTURE_SPECS } from '../r3a/fixture-content.mjs';
import { PORTFOLIO_SPECS } from '../r3a/fixture-content-r3a2.mjs';

/**
 * The R3-A0 families plus the two R3-A2 sentinel families, in a FROZEN order. The order is the schedule
 * order the plan records, so it is data rather than an accident of array concatenation.
 */
export const COMBINED_SPECS = Object.freeze([...FIXTURE_SPECS, ...PORTFOLIO_SPECS]);

/** The two families this stage authors. Kept separate so a report can name them without filtering. */
export const NEW_FAMILIES = Object.freeze(PORTFOLIO_SPECS.map((spec) => spec.fixtureId));

/** The two families carried forward from R3-A0/R3-AE. */
export const HISTORICAL_FAMILIES = Object.freeze(FIXTURE_SPECS.map((spec) => spec.fixtureId));

/** The spec for a fixture id, or undefined. */
export function specFor(fixtureId) {
  return COMBINED_SPECS.find((spec) => spec.fixtureId === fixtureId);
}

/**
 * The export names a spec declares for its class list and its case list. F-A/F-B predate this field, so the
 * names are derived from the fixture's own uppercase short id — the same convention every family follows.
 */
export function oracleExports(spec) {
  const prefix = spec.fixtureId.toUpperCase().replace(/^R3A-|-/gu, '').slice(0, 2);
  return Object.freeze({
    classes: spec.classesExport ?? `${prefix}_CLASSES`,
    cases: spec.casesExport ?? `${prefix}_CASES`,
  });
}

/**
 * §"Failure-class requirements": read a fixture's declared classes and hidden cases from ITS OWN acceptance
 * source, generically. No family-specific branch lives here.
 */
export async function oracleOf(spec, acceptanceUrl) {
  const names = oracleExports(spec);
  const acceptance = await import(acceptanceUrl);
  const classes = acceptance[names.classes];
  const cases = acceptance[names.cases];
  if (!Array.isArray(classes) || !Array.isArray(cases)) {
    throw new Error(`${spec.fixtureId}: the acceptance module does not export ${names.classes}/${names.cases}`);
  }
  return Object.freeze({
    module: acceptance,
    classes,
    cases,
    classIds: Object.freeze(classes.map((entry) => entry.id).sort()),
    judgeCase: acceptance.judgeCase,
    runCases: acceptance.runCases,
  });
}

/** §"Fixture digests": the content digest of one spec, over its ORDERED file map. */
export function contentDigestOf(spec) {
  return createHash('sha256')
    .update(Object.entries(spec.files).map(([path, content]) => `${path}:${createHash('sha256').update(content, 'utf8').digest('hex')}`).join('\n'), 'utf8')
    .digest('hex');
}

/** Every fixture's digest, keyed by id. */
export function allContentDigests() {
  return Object.freeze(Object.fromEntries(COMBINED_SPECS.map((spec) => [spec.fixtureId, contentDigestOf(spec)])));
}

const SCRATCH = join(homedir(), '.palimpsest-r3a2', 'oracle');

/** Materialize one fixture into a scratch tree and import its source and acceptance modules. */
export async function materialize(spec, root = SCRATCH) {
  const dir = join(root, `${spec.fixtureId}-r${String(spec.fixtureRevision)}`);
  rmSync(dir, { recursive: true, force: true });
  for (const [relative, content] of Object.entries(spec.files)) {
    const target = join(dir, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  const source = await import(pathToFileURL(join(dir, spec.sourceFile)).href);
  const oracle = await oracleOf(spec, pathToFileURL(join(dir, spec.acceptanceFile)).href);
  return Object.freeze({ dir, source, oracle, candidate: source[spec.exportName] });
}
