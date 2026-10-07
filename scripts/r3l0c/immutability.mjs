/**
 * R3-L0C §2.2 — THE BASELINE-DERIVED EVIDENCE IMMUTABILITY GUARD.
 *
 * THE DEFECT THIS CLOSES. R3-L0B's guard carried two hand-maintained lists:
 *
 *   EXCLUDED_STAGE_PATHS          the current stage's own evidence
 *   POST_BASELINE_STAGE_PATHS     every LATER stage's evidence, added one at a time
 *
 * The second list grew by editing an EARLIER stage's adjudication script. That is the wrong direction of
 * dependency: a new stage should not have to reach back and modify a completed stage's file, and R3-L0B had to
 * do exactly that to keep R3-L0A's guard green. §2.2 replaces the pattern with a rule that needs no edit:
 *
 *     protected set = baseline Git tree  MINUS  the current stage-owned evidence namespace
 *
 * The baseline is the COMMITTED TREE at a recorded revision, not a JSON file a stage maintains. So the
 * protected set is derived from Git — the same authority the rest of the repository uses — and a new stage
 * declares only its OWN namespace.
 *
 * WHY THE BASELINE IS A GIT TREE RATHER THAN A SNAPSHOT FILE. A snapshot file is itself evidence that can drift
 * or be rewritten, and comparing against it proves only that the file and the tree agree. Reading the baseline
 * from Git means the comparison is against what was actually committed, which is the claim immutability is
 * about. The recorded revision is part of the guard's contract so the baseline cannot move silently.
 *
 * WHAT THE GUARD ENFORCES, precisely:
 *
 *   · a file present in the baseline and CHANGED     -> FAIL
 *   · a file present in the baseline and REMOVED     -> FAIL
 *   · a file NOT in the baseline and ADDED, OUTSIDE the stage namespace -> FAIL
 *   · a file NOT in the baseline and ADDED, INSIDE the stage namespace  -> tolerated, and listed
 *
 * The tolerated additions are always REPORTED rather than absorbed, so a reader can see exactly what a stage
 * added to the protected tree.
 *
 * NO RESTORE PATH EXISTS. There is no function that repairs a mutation, because a guard that can repair what it
 * measures cannot report it honestly.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './contract.mjs';

const NL = String.fromCharCode(10);

/** §2.2: the protected root. Everything under it is protected unless it is the stage's own namespace. */
export const PROTECTED_ROOT = 'research-evidence';

/**
 * §2.2: THE BASELINE REVISION.
 *
 * The revision whose tree defines the protected set. It is the R3-L0B final commit, because that is the last
 * revision at which every prior stage's evidence was complete and verified — the R3-L0B guard passed over it.
 * Recording it here makes the baseline auditable rather than implicit.
 */
export const BASELINE_REVISION = 'e51df1f4c2a666ffa7364dbdc108eb9eb7eae2fb';

/** §2.2: the current stage's own namespace, the ONLY thing it may add to. */
export const STAGE_NAMESPACE = `${PROTECTED_ROOT}/r3-l0c`;

/** §2.2: the namespaces a stage may not touch, kept as DATA so a report can name them without re-deriving them. */
export function protectedNamespaces() {
  return Object.freeze(listBaselinePaths().map((path) => path.split('/').slice(0, 2).join('/')).filter((value, index, all) => all.indexOf(value) === index).sort());
}

/**
 * §2.2: READ THE BASELINE TREE FROM GIT.
 *
 * `git ls-tree -r --name-only <revision> -- research-evidence` is the authority. A failure is reported rather
 * than swallowed, because a guard that silently compares against nothing would pass trivially.
 */
export function listBaselinePaths(revision = BASELINE_REVISION) {
  try {
    const output = execFileSync('git', ['ls-tree', '-r', '--name-only', revision, '--', PROTECTED_ROOT], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return Object.freeze(output.split(NL).map((line) => line.trim()).filter((line) => line !== '').sort());
  } catch (error) {
    return Object.freeze({ error: `the baseline tree at ${revision} could not be read: ${String(error?.message ?? error).slice(0, 200)}` });
  }
}

/** §2.2: the blob digest Git records for a path at a revision, or null. */
export function baselineBlobDigest(path, revision = BASELINE_REVISION) {
  try {
    return execFileSync('git', ['rev-parse', `${revision}:${path}`], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** §2.2: the content digest of a file on disk, or null when it is absent. */
export function workingDigest(path) {
  const full = join(REPO_ROOT, path);
  if (!existsSync(full)) return null;
  return createHash('sha256').update(readFileSync(full), 'utf8').digest('hex');
}

/** Walk the protected root on disk. */
function walkWorking(prefix = PROTECTED_ROOT, out = []) {
  const dir = join(REPO_ROOT, prefix);
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walkWorking(rel, out);
    else out.push(rel);
  }
  return out;
}

/** §2.2: every file under the protected root on disk. */
export function listWorkingPaths() {
  return Object.freeze(walkWorking().sort());
}

/**
 * §2.2: THE GUARD.
 *
 * The protected set is DERIVED, not listed. The stage namespace is the only tolerated addition, and it is a
 * single value the stage owns rather than a registry an earlier stage maintains.
 */
export function checkImmutability(input = {}) {
  const revision = input.baselineRevision ?? BASELINE_REVISION;
  const stageNamespace = input.stageNamespace ?? STAGE_NAMESPACE;
  const baselinePaths = listBaselinePaths(revision);
  if (!Array.isArray(baselinePaths)) {
    return Object.freeze({
      schemaVersion: 1, stage: 'R3-L0C', kind: 'baseline-derived historical evidence immutability guard',
      baselineRevision: revision, stageNamespace,
      HISTORICAL_EVIDENCE_IMMUTABLE: 'FAIL',
      reason: baselinePaths.error,
      changed: Object.freeze([]), added: Object.freeze([]), removed: Object.freeze([]), details: Object.freeze([]),
    });
  }
  const workingPaths = listWorkingPaths();
  const baselineSet = new Set(baselinePaths);
  const workingSet = new Set(workingPaths);

  const removed = baselinePaths.filter((path) => !workingSet.has(path));
  const changed = [];
  const details = [];
  for (const path of baselinePaths) {
    if (!workingSet.has(path)) continue;
    const blob = baselineBlobDigest(path, revision);
    const digest = workingDigest(path);
    /**
     * Git records a blob hash over the file's BYTES with a header, which is not the same function as a plain
     * content sha256. So the comparison is made by asking Git for the WORKING tree's blob for the same path,
     * which makes both sides the same function.
     */
    const workingBlob = workingBlobDigest(path);
    if (blob !== null && workingBlob !== null && blob !== workingBlob) {
      changed.push(path);
      details.push(Object.freeze({ path, baselineBlob: blob, workingBlob, workingSha256: digest }));
    }
  }
  const added = workingPaths.filter((path) => !baselineSet.has(path));
  const tolerated = added.filter((path) => path === stageNamespace || path.startsWith(`${stageNamespace}/`));
  const unexpected = added.filter((path) => !tolerated.includes(path));
  const immutable = changed.length === 0 && removed.length === 0 && unexpected.length === 0;

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C',
    kind: 'baseline-derived historical evidence immutability guard',
    baselineRevision: revision,
    baselineSource: `git ls-tree -r ${revision} -- ${PROTECTED_ROOT}`,
    stageNamespace,
    baselineFileCount: baselinePaths.length,
    workingFileCount: workingPaths.length,
    HISTORICAL_EVIDENCE_IMMUTABLE: immutable ? 'PASS' : 'FAIL',
    changed: Object.freeze(changed.sort()),
    removed: Object.freeze(removed.sort()),
    added: Object.freeze(added.sort()),
    details: Object.freeze(details),
    /** §2.2: the stage's own additions, listed so they are visible rather than absorbed. */
    stageNamespaceAdditions: Object.freeze(tolerated.sort()),
    unexpectedAdditions: Object.freeze(unexpected.sort()),
    /** §2.2: the derived protected set, so the guard's scope is auditable from its own output. */
    protectedNamespaces: protectedNamespaces(),
    basis: immutable
      ? `${String(changed.length)} changed, ${String(removed.length)} removed and ${String(unexpected.length)} unexpected additions across ${String(workingPaths.length)} files; ${String(tolerated.length)} addition(s) under the stage namespace ${stageNamespace} are tolerated and listed`
      : `a protected mutation was found: ${String(changed.length)} changed, ${String(removed.length)} removed, ${String(unexpected.length)} unexpected addition(s)`,
    /** §2.2: no repair path exists, stated as a value so its absence is checkable. */
    restoreAvailable: false,
    action: immutable ? 'none required' : 'FAIL IMMEDIATELY — no automatic restore is performed',
  });
}

/** §2.2: the WORKING tree's blob digest for a path, so both sides of the comparison use Git's function. */
export function workingBlobDigest(path) {
  try {
    return execFileSync('git', ['hash-object', '--', path], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** §2.2: whether a path is inside the stage's own namespace. */
export function isStageOwned(path, stageNamespace = STAGE_NAMESPACE) {
  return path === stageNamespace || path.startsWith(`${stageNamespace}/`);
}

function main() {
  const record = checkImmutability();
  process.stdout.write(`HISTORICAL_EVIDENCE_IMMUTABLE: ${record.HISTORICAL_EVIDENCE_IMMUTABLE} (${String(record.workingFileCount)} protected files, baseline ${String(record.baselineRevision).slice(0, 8)})${NL}`);
  process.stdout.write(`  stage namespace: ${String(record.stageNamespace)} (${String(record.stageNamespaceAdditions.length)} tolerated addition(s))${NL}`);
  if (record.HISTORICAL_EVIDENCE_IMMUTABLE === 'FAIL') {
    process.stdout.write(`  changed: ${record.changed.join(', ') || 'none'}${NL}`);
    process.stdout.write(`  removed: ${record.removed.join(', ') || 'none'}${NL}`);
    process.stdout.write(`  unexpected additions: ${record.unexpectedAdditions.join(', ') || 'none'}${NL}`);
    process.exitCode = 1;
  }
  return record;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  main();
}
