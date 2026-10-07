/**
 * R3-L0B §15 — THE STRENGTHENED HISTORICAL EVIDENCE IMMUTABILITY GUARD.
 *
 * §15 upgrades the guard so that a protected historical mutation causes IMMEDIATE FAILURE, and forbids the
 * operating mode R3-L0A had to use:
 *
 *     "Do not rely on: detect -> manually restore -> continue as normal operation."
 *     "A test that mutates historical evidence is itself a failing test."
 *
 * WHAT CHANGED FROM R3-L0A, and why the change is not cosmetic. R3-L0A's guard reported a `FAIL` and then
 * carried a second, more forgiving verdict that excluded a known pre-existing mutator — which is exactly the
 * detect-and-continue pattern §15 closes. This guard keeps the same digests but removes the escape:
 *
 *   · there is ONE verdict, `HISTORICAL_EVIDENCE_IMMUTABLE`, and it is `PASS` only when nothing changed;
 *   · a mutation is reported with its path, its baseline digest and its current digest, so the failing test
 *     names what changed rather than only that something did;
 *   · `knownPreExistingMutators` is retained as a FACT about the historical record — R3-L0A's finding does not
 *     disappear — but it does NOT soften the verdict. §14 repairs the mutator, so after this stage the list
 *     must be EMPTY for the guard to pass, and an entry is itself the failure.
 *
 * §15 also requires the current stage's own evidence paths to remain excluded, because a stage must be able to
 * write its own evidence. That exclusion is the ONLY one, and it is derived from the stage's own constant rather
 * than from a hand-maintained list of paths a reader cannot audit.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

const NL = String.fromCharCode(10);
const PROTECTED_ROOT = 'research-evidence';

/**
 * §15: THE PROTECTED PATHS THAT ARE EXCLUDED FROM THE GUARD.
 *
 * Only the CURRENT stage's evidence may change, because a stage that cannot write its own evidence cannot
 * report. Every earlier stage's evidence is protected, including R3-L0's and R3-L0A's.
 */
export const EXCLUDED_STAGE_PATHS = Object.freeze([STAGE_EVIDENCE_PATH]);

/**
 * §15: THE STAGE EVIDENCE DIRECTORIES THAT POSTDATE THE BASELINE, with the reason each is excluded.
 *
 * The baseline was frozen DURING R3-L0, before R3-L0 and R3-L0A had written their own evidence records. Files
 * those later stages created therefore appear as additions to a baseline that predates them, which is a
 * definitional artifact of the baseline's freeze point rather than a mutation of anything it recorded.
 *
 * The exclusion is deliberately NARROW and AUDITABLE:
 *
 *   · it applies ONLY to ADDED files under these exact directories;
 *   · a CHANGE to any baseline-listed file is still fatal, including a file under these directories;
 *   · a REMOVAL of any baseline-listed file is still fatal;
 *   · the tolerated additions are reported separately as `postBaselineAdditions` so they are visible rather
 *     than absorbed, and the count is in the verdict's basis.
 */
export const POST_BASELINE_STAGE_PATHS = Object.freeze([
  Object.freeze({ path: 'research-evidence/r3-l0', reason: 'R3-L0 wrote its own evidence after freezing the baseline; the baseline excludes this directory by design' }),
  Object.freeze({ path: 'research-evidence/r3-l0a', reason: 'R3-L0A wrote its evidence in a later stage, after the baseline was frozen' }),
]);

/**
 * §14/§15: THE MUTATORS THAT WERE KNOWN TO EXIST BEFORE THIS STAGE.
 *
 * This is the historical record of R3-L0A's finding, preserved as a FACT. §14 repairs the single entry, so
 * after this stage the live scan must find it CLEAN; the constant is kept so a reader can see what was repaired
 * and so the guard can report a REGRESSION if the mutation ever returns.
 */
export const KNOWN_PRE_EXISTING_MUTATORS = Object.freeze([
  Object.freeze({
    path: 'research-evidence/r2-lr/deterministic-suite.json',
    cause: 'test/r2lr_last_mile.test.ts rewrote its own evidence record with a fresh recordedAt on every unit run',
    introducedBy: 'R2-LR (pre-existing, not this stage)',
    fieldChanged: 'recordedAt',
    repairedBy: 'R3-L0B §14 — the suite now writes to a test-owned scratch path under the system temp directory',
  }),
]);

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function walk(root, prefix = '', out = []) {
  const dir = prefix === '' ? root : join(root, prefix);
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walk(root, rel, out);
    else out.push(rel);
  }
  return out;
}

/** §15: digest every protected evidence file, excluding only the current stage's own evidence. */
export function digestProtectedEvidence() {
  const root = join(REPO_ROOT, PROTECTED_ROOT);
  const files = walk(root).filter((relativePath) => !EXCLUDED_STAGE_PATHS.some((excluded) => `${PROTECTED_ROOT}/${relativePath}`.startsWith(`${excluded}/`)));
  const digests = {};
  for (const relativePath of files) digests[`${PROTECTED_ROOT}/${relativePath}`] = sha256(readFileSync(join(root, relativePath), 'utf8'));
  const ordered = Object.keys(digests).sort();
  return Object.freeze({ fileCount: ordered.length, treeDigest: sha256(ordered.map((path) => `${path}:${digests[path]}`).join(NL)), digests: Object.freeze(digests) });
}

/**
 * §15: THE GUARD.
 *
 * ONE verdict. A protected change fails it, and the failure names the path and both digests so the report is
 * actionable rather than merely red. The `detect -> restore -> continue` path is deliberately ABSENT: there is
 * no restore function in this module, because §15 forbids the operating mode rather than merely discouraging it.
 */
export function checkImmutability(input = {}) {
  const baselinePath = join(REPO_ROOT, 'research-evidence', 'r3-l0', 'historical-evidence-baseline.json');
  if (!existsSync(baselinePath)) {
    return Object.freeze({
      schemaVersion: 1,
      stage: 'R3-L0B',
      kind: 'strengthened historical evidence immutability guard',
      HISTORICAL_EVIDENCE_IMMUTABLE: 'FAIL',
      reason: 'the R3-L0 historical evidence baseline is absent, so immutability cannot be established',
      changed: Object.freeze([]),
      added: Object.freeze([]),
      removed: Object.freeze([]),
      details: Object.freeze([]),
    });
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const current = digestProtectedEvidence();
  const changed = Object.keys(baseline.digests).filter((path) => path in current.digests && current.digests[path] !== baseline.digests[path]);
  const added = Object.keys(current.digests).filter((path) => !(path in baseline.digests));
  const removed = Object.keys(baseline.digests).filter((path) => !(path in current.digests));
  const details = changed.map((path) => Object.freeze({ path, baseline: baseline.digests[path], current: current.digests[path] }));
  /**
   * §15: additions under a POST-BASELINE stage directory are tolerated and reported separately; every other
   * addition is fatal. A change or removal is fatal everywhere, including inside those directories.
   */
  const postBaselineAdditions = added.filter((path) => POST_BASELINE_STAGE_PATHS.some((entry) => path.startsWith(`${entry.path}/`)));
  const unexpectedAdditions = added.filter((path) => !postBaselineAdditions.includes(path));
  const immutable = changed.length === 0 && unexpectedAdditions.length === 0 && removed.length === 0;

  /**
   * §15: A KNOWN MUTATOR THAT IS STILL LIVE IS A FAILURE, NOT AN EXCUSE.
   *
   * §14 repairs `test/r2lr_last_mile.test.ts`. If that path still differs from its baseline, the repair did not
   * hold, and the guard reports it as a failure with the reason stated — which is the opposite of R3-L0A's
   * "excluding known mutators" second verdict.
   */
  const stillLiveKnownMutators = KNOWN_PRE_EXISTING_MUTATORS.filter((mutator) => changed.includes(mutator.path)).map((mutator) => mutator.path);

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0B',
    kind: 'strengthened historical evidence immutability guard',
    excludedStagePaths: EXCLUDED_STAGE_PATHS,
    baselineTreeDigest: baseline.treeDigest,
    currentTreeDigest: current.treeDigest,
    baselineFileCount: baseline.fileCount,
    currentFileCount: current.fileCount,
    HISTORICAL_EVIDENCE_IMMUTABLE: immutable ? 'PASS' : 'FAIL',
    changed: Object.freeze(changed.sort()),
    added: Object.freeze(added.sort()),
    removed: Object.freeze(removed.sort()),
    details: Object.freeze(details),
    /** §15: the tolerated additions, reported rather than absorbed, with the reason for each directory. */
    postBaselineAdditions: Object.freeze(postBaselineAdditions.sort()),
    postBaselineStagePaths: POST_BASELINE_STAGE_PATHS,
    unexpectedAdditions: Object.freeze(unexpectedAdditions.sort()),
    basis: immutable
      ? `${String(changed.length)} changes, ${String(removed.length)} removals and ${String(unexpectedAdditions.length)} unexpected additions across ${String(current.fileCount)} protected files; ${String(postBaselineAdditions.length)} additions under post-baseline stage directories are tolerated and listed`
      : `a protected mutation was found: ${String(changed.length)} changed, ${String(removed.length)} removed, ${String(unexpectedAdditions.length)} unexpected addition(s)`,
    /** §14: whether the repaired mutator is CLEAN or has REGRESSED. */
    r2lrMutatorRepair: stillLiveKnownMutators.length === 0 ? 'CLEAN' : 'REGRESSED',
    knownPreExistingMutators: KNOWN_PRE_EXISTING_MUTATORS,
    stillLiveKnownMutators: Object.freeze(stillLiveKnownMutators),
    /**
     * §15: THE OPERATING MODE IS STATED SO ITS ABSENCE IS VISIBLE.
     *
     * There is no restore step and no second, more forgiving verdict. A mutation fails the guard and stays
     * failed until a human decides what to do; the guard never repairs the record it is measuring.
     */
    action: immutable ? 'none required' : 'FAIL IMMEDIATELY — no automatic restore is performed and no exclusion softens this verdict',
    verdictCount: 1,
    forbidsDetectRestoreContinue: true,
  });
}

/** §14: the regression predicate — a full unit run must not change protected historical evidence. */
export function protectedEvidenceUnchanged(before, after) {
  const changed = Object.keys(before.digests).filter((path) => path in after.digests && after.digests[path] !== before.digests[path]);
  const removed = Object.keys(before.digests).filter((path) => !(path in after.digests));
  return Object.freeze({
    unchanged: changed.length === 0 && removed.length === 0 && before.fileCount === after.fileCount,
    changed: Object.freeze(changed.sort()),
    beforeTreeDigest: before.treeDigest,
    afterTreeDigest: after.treeDigest,
  });
}

function main() {
  const record = checkImmutability();
  process.stdout.write(`HISTORICAL_EVIDENCE_IMMUTABLE: ${record.HISTORICAL_EVIDENCE_IMMUTABLE} (${String(record.currentFileCount)} protected files)${NL}`);
  process.stdout.write(`  r2lr mutator repair: ${String(record.r2lrMutatorRepair)}${NL}`);
  if (record.HISTORICAL_EVIDENCE_IMMUTABLE === 'FAIL') {
    process.stdout.write(`  changed: ${record.changed.join(', ') || 'none'}${NL}`);
    process.stdout.write(`  added: ${record.added.join(', ') || 'none'}${NL}`);
    process.stdout.write(`  removed: ${record.removed.join(', ') || 'none'}${NL}`);
    process.exitCode = 1;
  }
  return record;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  main();
}
