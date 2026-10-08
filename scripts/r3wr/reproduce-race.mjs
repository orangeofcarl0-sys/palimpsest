/**
 * R3-WR GATE 1 — THE LIFECYCLE-RACE REPRODUCTION.
 *
 * The rig's static shape does NOT reproduce the failure: every round committed, with the same mixed-separator
 * alternates, and the original worktree now commits too. The one control that DOES reproduce the worker's exact
 * signature — `fatal: could not parse HEAD` — is a MISSING alternate target.
 *
 * So the remaining question is what could make the alternate target missing or unreadable DURING a worker's run
 * while being present before and after. The shipped code answers it: `exportResultCommit` runs
 * `git fetch --no-tags <world> HEAD` INTO the canonical repository, and `git gc`/`git repack` can be triggered
 * by Git's own auto-maintenance. A repack that moves loose objects into a pack while a borrowed reader is
 * resolving them is the classic borrowed-object race.
 *
 * THIS MODULE TESTS THAT MECHANISM RATHER THAN ASSERTING IT. It runs a writer against the intermediate world's
 * object store concurrently with a worker commit, and measures whether the commit ever fails. A race that does
 * not reproduce under this pressure is reported as NOT REPRODUCED, because an unreproduced race is not a proven
 * cause — and the ruling forbids inventing one.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildChain } from './reproduce-chain.mjs';
import { git, workerCommit } from './reproduce.mjs';

const NL = String.fromCharCode(10);

/**
 * GATE 1: ONE ROUND WITH CONCURRENT MAINTENANCE.
 *
 * The worker's commit is started while a `git repack -ad` runs against the INTERMEDIATE world — the alternate
 * target. Repacking with `-a -d` deletes the loose objects it packs, so a reader that resolves a loose object
 * during the window can miss it. That is the exact mechanism a borrowed object store is vulnerable to.
 */
export function racedRound(input) {
  const { root, label, concurrentMaintenance = true } = input;
  const chain = buildChain({ root, copyTrajectory: true });
  if (chain.ok !== true) return Object.freeze({ label, built: false, stage: chain.stage });

  writeFileSync(join(chain.workerPath, 'src', 'ledger.mjs'), ['export const answer = 42;', ''].join(NL), 'utf8');

  let maintenance = null;
  if (concurrentMaintenance) {
    /** Repack the ALTERNATE TARGET with `-a -d`, which removes the loose objects it absorbs. */
    maintenance = spawn('git', ['repack', '-a', '-d', '-q'], { cwd: chain.trajectory, stdio: 'ignore' });
  }
  const commit = workerCommit({ worldPath: chain.workerPath, message: `raced ${label}` });
  return Object.freeze({
    label,
    built: true,
    concurrentMaintenance,
    commit,
    committed: commit.commitOk === true,
    /** Recorded so the round says what it actually did, not only whether it passed. */
    maintenanceStarted: maintenance !== null,
  });
}

/**
 * GATE 1: THE RACED SUITE.
 *
 * Several rounds with maintenance, and the same number without, so the comparison is between two runs of the
 * same code rather than between a run and an expectation.
 */
export function reproduceRace(input = {}) {
  const rounds = input.rounds ?? 8;
  const base = mkdtempSync(join(tmpdir(), 'r3wr-race-'));
  const arms = [];
  try {
    for (const arm of [
      { id: 'CONCURRENT_REPACK_OF_ALTERNATE_TARGET', concurrentMaintenance: true },
      { id: 'NO_MAINTENANCE_CONTROL', concurrentMaintenance: false },
    ]) {
      const results = [];
      for (let index = 0; index < rounds; index += 1) {
        const root = join(base, arm.id, `round-${String(index)}`);
        mkdirSync(root, { recursive: true });
        results.push(racedRound({ root, label: `${arm.id}-r${String(index)}`, concurrentMaintenance: arm.concurrentMaintenance }));
      }
      const built = results.filter((round) => round.built);
      const failed = built.filter((round) => !round.committed);
      arms.push(Object.freeze({
        id: arm.id,
        rounds,
        built: built.length,
        committed: built.length - failed.length,
        failed: failed.length,
        signatures: Object.freeze(failed.map((round) => Object.freeze({ label: round.label, couldNotParseHead: round.commit?.couldNotParseHead, output: round.commit?.output }))),
      }));
    }
  } finally {
    if (input.keep !== true) rmSync(base, { recursive: true, force: true });
  }
  return Object.freeze({
    kind: 'alternate-target lifecycle race reproduction',
    rounds,
    arms: Object.freeze(arms),
    raceReproduced: arms[0].failed > 0,
    controlClean: arms[1].failed === 0,
  });
}

/**
 * GATE 1: THE BORROWED-OBJECT INVARIANT, stated as a checkable property.
 *
 * A borrowed object store is only sound while every object a reader may need is present at the moment it is
 * needed. This function states the property in the terms a readiness gate can test, and it is what GATE 2's
 * repair is built on.
 */
export function borrowedObjectInvariant(input) {
  const { worldPath, requiredCommits } = input;
  const missing = (requiredCommits ?? []).filter((commit) => !git(worldPath, ['cat-file', '-e', `${commit}^{commit}`]).ok);
  return Object.freeze({
    requiredCommits: Object.freeze([...(requiredCommits ?? [])]),
    missing: Object.freeze(missing),
    HOLDS: missing.length === 0,
    statement: 'every object a worker must resolve — its HEAD and its basis — must be readable through the worktree own store or its alternates at the moment the worker runs',
  });
}

export { NL };
