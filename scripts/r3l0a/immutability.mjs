/**
 * R3-L0A §18 — THE HISTORICAL EVIDENCE IMMUTABILITY GUARD.
 *
 * §18 requires the guard to run and permits this stage to write ONLY its own evidence paths plus explicitly
 * allowed analysis source/test files. The R3-L0 guard protects `research-evidence/**` excluding
 * `research-evidence/r3-l0`; this stage additionally excludes its own `research-evidence/r3-l0a`, because
 * otherwise the guard would report this stage's legitimate output as a historical mutation.
 *
 * The guard RECORDS rather than restores, which is the behaviour §28 of R3-L0 established and this stage keeps.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { EXCLUDED_STAGE_PATHS, STAGE_EVIDENCE_PATH } from './adjudicate.mjs';
import { REPO_ROOT } from '../r3l0/envelope.mjs';

const NL = String.fromCharCode(10);
const PROTECTED_ROOT = 'research-evidence';
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

/** §18: digest every protected evidence file, excluding the stage-owned paths. */
export function digestProtectedEvidence() {
  const root = join(REPO_ROOT, PROTECTED_ROOT);
  const files = walk(root).filter((relativePath) => !EXCLUDED_STAGE_PATHS.some((excluded) => `${PROTECTED_ROOT}/${relativePath}`.startsWith(`${excluded}/`)));
  const digests = {};
  for (const relativePath of files) digests[`${PROTECTED_ROOT}/${relativePath}`] = sha256(readFileSync(join(root, relativePath), 'utf8'));
  const ordered = Object.keys(digests).sort();
  return Object.freeze({ fileCount: ordered.length, treeDigest: sha256(ordered.map((path) => `${path}:${digests[path]}`).join(NL)), digests: Object.freeze(digests) });
}

/** §18: compare against the R3-L0 baseline, RECORDING any mutation rather than repairing it. */
export function checkImmutability() {
  const baseline = JSON.parse(readFileSync(join(REPO_ROOT, 'research-evidence', 'r3-l0', 'historical-evidence-baseline.json'), 'utf8'));
  const current = digestProtectedEvidence();
  const changed = Object.keys(baseline.digests).filter((path) => path in current.digests && current.digests[path] !== baseline.digests[path]);
  const added = Object.keys(current.digests).filter((path) => !(path in baseline.digests));
  const removed = Object.keys(baseline.digests).filter((path) => !(path in current.digests));
  const immutable = changed.length === 0 && added.length === 0 && removed.length === 0;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0A',
    kind: 'historical evidence immutability guard',
    excludedStagePaths: EXCLUDED_STAGE_PATHS,
    baselineTreeDigest: baseline.treeDigest,
    currentTreeDigest: current.treeDigest,
    baselineFileCount: baseline.fileCount,
    currentFileCount: current.fileCount,
    HISTORICAL_EVIDENCE_IMMUTABLE: immutable ? 'PASS' : 'FAIL',
    changed: Object.freeze(changed.sort()),
    added: Object.freeze(added.sort()),
    removed: Object.freeze(removed.sort()),
    action: immutable ? 'none required' : 'RECORDED — the mutation is reported and NOT auto-restored',
    /**
     * §18: THE KNOWN, PRE-EXISTING MUTATOR.
     *
     * `test/r2lr_last_mile.test.ts` writes `research-evidence/r2-lr/deterministic-suite.json` with a fresh
     * `recordedAt` timestamp every time the unit suite runs. That is a PRE-EXISTING behaviour of an earlier
     * stage's test, not an effect of this stage, and it is reported rather than hidden or silently restored.
     *
     * It is recorded here as a known cause so a reader can distinguish a self-inflicted timestamp from a real
     * historical mutation.
     */
    knownPreExistingMutators: Object.freeze([
      Object.freeze({
        path: 'research-evidence/r2-lr/deterministic-suite.json',
        cause: 'test/r2lr_last_mile.test.ts rewrites its own evidence record with a fresh recordedAt on every unit run',
        introducedBy: 'R2-LR (pre-existing, not this stage)',
        fieldChanged: 'recordedAt',
      }),
    ]),
    /** §18: the verdict EXCLUDING the known pre-existing mutator, so the stage's own effect is isolable. */
    HISTORICAL_EVIDENCE_IMMUTABLE_EXCLUDING_KNOWN_MUTATORS: changed.filter((path) => path !== 'research-evidence/r2-lr/deterministic-suite.json').length === 0 && added.length === 0 && removed.length === 0 ? 'PASS' : 'FAIL',
  });
}

function main() {
  const record = checkImmutability();
  writeFileSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'immutability.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`HISTORICAL_EVIDENCE_IMMUTABLE: ${record.HISTORICAL_EVIDENCE_IMMUTABLE} (${String(record.currentFileCount)} protected files)${NL}`);
  if (record.HISTORICAL_EVIDENCE_IMMUTABLE === 'FAIL') {
    process.stdout.write(`  changed: ${record.changed.join(', ') || 'none'}${NL}`);
    process.stdout.write(`  added: ${record.added.join(', ') || 'none'}${NL}`);
    process.stdout.write(`  removed: ${record.removed.join(', ') || 'none'}${NL}`);
  }
  return record;
}

if (process.argv[1] !== undefined && import.meta.url === new URL('file://' + process.argv[1].split(String.fromCharCode(92)).join('/')).href) {
  main();
}
