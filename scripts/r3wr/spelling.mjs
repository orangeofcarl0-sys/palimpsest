/**
 * R3-WR GATE 1 — THE ALTERNATE-PATH NORMALIZATION TEST.
 *
 * The worker's transcript contains, in one block:
 *
 *     error: unable to normalize alternate object path: C:\...\units\r-b0-H\world/.git/objects
 *     fatal: could not parse HEAD
 *     fatal: bad object HEAD
 *
 * The entry mixes separators (`\` for the directory, `/` before `.git`). Two hypotheses follow, and they have
 * different consequences:
 *
 *   H1  the MIXED SEPARATOR is itself the defect — Git cannot normalize that string, so the alternate is dead
 *       and every object living only in it is unreachable
 *   H2  the mixed separator is TOLERATED and the target was genuinely absent or unreadable during the window
 *
 * H1 and H2 are distinguished by building a worktree whose alternate is written each way and committing. The
 * test is deliberately run on the SAME repository content so the only variable is the separator.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWorldLikeShipped, git, makeBasisRepository, workerCommit } from './reproduce.mjs';

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);

/** Rewrite a world's alternates to a chosen spelling and commit, so the separator is the only variable. */
function commitWithAlternateSpelling(input) {
  const { root, label, spelling } = input;
  const basis = makeBasisRepository(root);
  const worldPath = join(root, `world-${label}`);
  const prepared = createWorldLikeShipped({ repository: basis.repo, worldPath, baseCommit: basis.basisCommit });
  if (!prepared.created) return Object.freeze({ label, created: false });

  const alternatesPath = join(worldPath, '.git', 'objects', 'info', 'alternates');
  const target = join(basis.repo, '.git', 'objects');
  const spellings = {
    /** What the shipped clone writes: backslashes for the path, then a forward slash before `.git`. */
    SHIPPED_MIXED: `${target.split('/').join(BS)}`.replace(`${BS}.git`, '/.git'),
    /** Fully backslashed. */
    ALL_BACKSLASH: target.split('/').join(BS),
    /** Fully forward-slashed. */
    ALL_FORWARD: target.split(BS).join('/'),
    /** A relative path, which Git resolves against the objects directory's own location. */
    RELATIVE: null,
  };
  const chosen = spellings[spelling];
  if (spelling === 'RELATIVE') {
    /** `../..` from `<world>/.git/objects` reaches `<world>`, so a relative spelling names a sibling basis. */
    writeFileSync(alternatesPath, `${join('..', '..', '..', 'canonical', '.git', 'objects').split(BS).join('/')}${NL}`, 'utf8');
  } else {
    writeFileSync(alternatesPath, `${chosen}${NL}`, 'utf8');
  }

  writeFileSync(join(worldPath, 'src', 'ledger.mjs'), ['export const answer = 42;', ''].join(NL), 'utf8');
  const commit = workerCommit({ worldPath, message: `spelling ${label}` });
  return Object.freeze({
    label,
    created: true,
    spelling,
    written: readFileSync(alternatesPath, 'utf8').trim(),
    commit,
    committed: commit.commitOk === true,
  });
}

/** GATE 1: every spelling, so the separator hypothesis is tested rather than argued. */
export function alternateSpellingMatrix(input = {}) {
  const base = mkdtempSync(join(tmpdir(), 'r3wr-spelling-'));
  const results = [];
  try {
    for (const spelling of ['SHIPPED_MIXED', 'ALL_BACKSLASH', 'ALL_FORWARD', 'RELATIVE']) {
      const root = join(base, spelling);
      mkdirSync(root, { recursive: true });
      results.push(commitWithAlternateSpelling({ root, label: spelling, spelling }));
    }
  } finally {
    if (input.keep !== true) rmSync(base, { recursive: true, force: true });
  }
  return Object.freeze({
    kind: 'alternate spelling matrix',
    results: Object.freeze(results),
    shippedSpellingCommits: results.find((entry) => entry.spelling === 'SHIPPED_MIXED')?.committed === true,
    anySpellingFails: results.some((entry) => entry.created && !entry.committed),
    verdict: results.find((entry) => entry.spelling === 'SHIPPED_MIXED')?.committed === true
      ? 'MIXED_SEPARATOR_TOLERATED — the shipped spelling commits, so the separator is NOT the defect'
      : 'MIXED_SEPARATOR_FATAL — the shipped spelling cannot commit',
  });
}

export { NL };
