/**
 * R3-WR GATE 1 — THE CHAINED-ALTERNATE REPRODUCTION.
 *
 * The first reproduction cloned a PLAIN repository and every round committed successfully, so the defect is not
 * in a single `--shared` clone. The failing worktree differs in one structural way, and this module tests it:
 *
 *   the failing worker world's alternates point at the TRAJECTORY WORLD's `.git/objects`
 *   the trajectory world is ITSELF a shared clone, whose alternates point at the PREHISTORY
 *
 * So the object lookup is a CHAIN — worker world → trajectory world → prehistory — and a chain is where a
 * lifecycle condition can break a lookup that a single hop survives. The rig adds that hop by COPYING the
 * prehistory world into each trajectory, so the trajectory world's own alternates still name the prehistory by
 * ABSOLUTE path while its objects directory is a copy.
 *
 * THIS MODULE BUILDS THE CHAIN AND MEASURES IT. If the chain reproduces the failure, the classification is
 * `OBJECT_STORE_LIFECYCLE_RACE` or `WORKTREE_COPY_OR_MOVE_DEFECT`; if it does not, the negative result is
 * recorded rather than a cause being invented.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWorldLikeShipped, git, makeBasisRepository, readinessOf, workerCommit } from './reproduce.mjs';

const NL = String.fromCharCode(10);

/** The alternates of a world, decoded. */
export function alternatesOf(worldPath) {
  const path = join(worldPath, '.git', 'objects', 'info', 'alternates');
  try {
    const text = readFileSync(path, 'utf8');
    return Object.freeze({
      present: true,
      entries: Object.freeze(text.split(/\r?\n/u).filter((line) => line.trim() !== '').map((line) => {
        const resolved = line.trim();
        let type = 'ABSENT';
        try { type = statSync(resolved).isDirectory() ? 'DIRECTORY' : 'FILE'; } catch { type = 'ABSENT'; }
        return Object.freeze({ resolved, type });
      })),
    });
  } catch {
    return Object.freeze({ present: false, entries: Object.freeze([]) });
  }
}

/**
 * GATE 1: BUILD THE THREE-LEVEL CHAIN the rig actually produces.
 *
 *   canonical  the basis repository
 *   trajectory a SHARED CLONE of canonical, then COPIED on disk (which is what `cpSync` of a prehistory world
 *              does — the copy's alternates still name the original by absolute path)
 *   worker     a SHARED CLONE of the trajectory copy, which is what `createWorld` makes for an attempt
 *
 * The middle COPY is the rig's contribution and the hop the plain reproduction lacked.
 */
export function buildChain(input) {
  const { root, copyTrajectory = true } = input;
  const basis = makeBasisRepository(root);
  const trajectorySource = join(root, 'trajectory-source');
  const source = createWorldLikeShipped({ repository: basis.repo, worldPath: trajectorySource, baseCommit: basis.basisCommit });
  if (!source.created) return Object.freeze({ ok: false, stage: 'trajectory-source', steps: source.steps });

  const trajectory = copyTrajectory ? join(root, 'trajectory-copy') : trajectorySource;
  if (copyTrajectory) cpSync(trajectorySource, trajectory, { recursive: true });

  const workerPath = join(root, 'worker-world');
  const worker = createWorldLikeShipped({ repository: trajectory, worldPath: workerPath, baseCommit: basis.basisCommit });
  if (!worker.created) return Object.freeze({ ok: false, stage: 'worker-world', steps: worker.steps, trajectoryAlternates: alternatesOf(trajectory) });

  return Object.freeze({
    ok: true,
    basis,
    trajectory,
    trajectoryAlternates: alternatesOf(trajectory),
    workerPath,
    workerAlternates: alternatesOf(workerPath),
    trajectoryHead: git(trajectory, ['rev-parse', 'HEAD']).stdout,
    workerHead: git(workerPath, ['rev-parse', 'HEAD']).stdout,
  });
}

/**
 * GATE 1: ONE CHAINED ROUND.
 *
 * prepare the chain, modify a file deterministically, commit through the worker's supported path, verify. The
 * result records WHERE the chain breaks when it does, because "the worker could not commit" is not a root cause.
 */
export function chainedRound(input) {
  const { root, label, copyTrajectory = true, removeTrajectoryObjects = false } = input;
  const chain = buildChain({ root, copyTrajectory });
  if (chain.ok !== true) return Object.freeze({ label, built: false, stage: chain.stage, steps: chain.steps });

  /** An explicit lifecycle mutation: the intermediate world's objects disappear after the worker world borrows them. */
  if (removeTrajectoryObjects) rmSync(join(chain.trajectory, '.git', 'objects'), { recursive: true, force: true });

  const before = readinessOf({ worldPath: chain.workerPath, basisCommit: chain.basis.basisCommit });
  writeFileSync(join(chain.workerPath, 'src', 'ledger.mjs'), ['export const answer = 42;', ''].join(NL), 'utf8');
  const commit = workerCommit({ worldPath: chain.workerPath, message: `chained ${label}` });
  const after = readinessOf({ worldPath: chain.workerPath, basisCommit: chain.basis.basisCommit });

  return Object.freeze({
    label,
    built: true,
    copyTrajectory,
    removeTrajectoryObjects,
    trajectoryAlternates: chain.trajectoryAlternates,
    workerAlternates: chain.workerAlternates,
    trajectoryHead: chain.trajectoryHead,
    workerHead: chain.workerHead,
    before,
    commit,
    after,
    committed: commit.commitOk === true,
  });
}

/**
 * GATE 1: THE CHAINED REPRODUCTION SUITE.
 *
 * Three arms, because they answer different questions:
 *
 *   copyTrajectory true            the rig's actual shape
 *   copyTrajectory false           the same chain without the rig's copy, which isolates the copy's contribution
 *   removeTrajectoryObjects true   an explicit lifecycle break, which is the POSITIVE CONTROL for the failure
 *                                  signature: if removing the intermediate objects does NOT break the commit,
 *                                  then the signature this stage is chasing cannot be produced by an object
 *                                  store at all and the classification must say so
 */
export function reproduceChain(input = {}) {
  const rounds = input.rounds ?? 3;
  const base = mkdtempSync(join(tmpdir(), 'r3wr-chain-'));
  const arms = [];
  try {
    for (const arm of [
      { id: 'RIG_SHAPE_COPIED_TRAJECTORY', copyTrajectory: true, removeTrajectoryObjects: false },
      { id: 'NO_COPY_DIRECT_CLONE', copyTrajectory: false, removeTrajectoryObjects: false },
      { id: 'CONTROL_INTERMEDIATE_OBJECTS_REMOVED', copyTrajectory: true, removeTrajectoryObjects: true },
    ]) {
      const results = [];
      for (let index = 0; index < rounds; index += 1) {
        const root = join(base, arm.id, `round-${String(index)}`);
        mkdirSync(root, { recursive: true });
        results.push(chainedRound({ root, label: `${arm.id}-r${String(index)}`, copyTrajectory: arm.copyTrajectory, removeTrajectoryObjects: arm.removeTrajectoryObjects }));
      }
      const built = results.filter((round) => round.built);
      const committed = built.filter((round) => round.committed);
      arms.push(Object.freeze({
        id: arm.id,
        rounds,
        built: built.length,
        committed: committed.length,
        failed: built.length - committed.length,
        signatures: Object.freeze(built.filter((round) => !round.committed).map((round) => Object.freeze({ label: round.label, couldNotParseHead: round.commit?.couldNotParseHead, unableToNormalizeAlternate: round.commit?.unableToNormalizeAlternate, output: round.commit?.output }))),
        workerAlternates: built[0]?.workerAlternates ?? null,
      }));
    }
  } finally {
    if (input.keep !== true) rmSync(base, { recursive: true, force: true });
  }
  return Object.freeze({
    kind: 'chained alternate reproduction',
    rounds,
    arms: Object.freeze(arms),
    rigShapeReproduced: arms[0].failed > 0,
    controlBreaksCommit: arms[2].failed > 0,
  });
}

export { NL };
