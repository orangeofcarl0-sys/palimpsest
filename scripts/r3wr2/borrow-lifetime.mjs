/**
 * R3-WR2 GATE D — THE BORROW-CHAIN LIFETIME FAULT MATRIX.
 *
 * WHAT IS BEING TESTED. A `--shared` world does not contain its history. It contains a POINTER, in
 * `.git/objects/info/alternates`, at another object store, and it reads its immutable objects through that
 * pointer for as long as it lives. So the world's usable lifetime is bounded by the lifetime of a directory it
 * does not own. This module measures that boundary instead of assuming it.
 *
 * TWO TOPOLOGIES, because they are not the same and the ruling names the second:
 *
 *   SHIPPED    canonical → worker world              one hop, which is what `GitCliPort.createWorld` makes
 *   CHAINED    canonical → trajectory world → worker two hops, which is what the R3-L0C rig produces by
 *                                                    COPYING a prepared world and cloning from the copy
 *
 * Each hop is measured, because "which object directory does this world actually borrow" is the question a
 * lifetime claim depends on, and the answer differs between the two shapes.
 *
 * THE FAULTS. Each is a deterministic lifecycle event, not a race, so a result is reproducible:
 *
 *   intermediate-removed-after-readiness   the borrowed store vanishes after the world was declared ready
 *   borrowed-dir-temporarily-unavailable   the borrowed store is renamed away and back (a maintenance window)
 *   parent-world-copied                    the parent is duplicated; does the copy's pointer still resolve
 *   parent-world-moved                     the parent is relocated; an ABSOLUTE pointer cannot follow it
 *   source-repacked                        git maintenance rewrites the borrowed store in place
 *   failure-before-work-starts             the borrowed store is already gone when the worker begins
 *   failure-after-edits-before-commit      edits exist in the worktree when the store vanishes
 *
 * WHAT EACH RESULT MEANS. A fault that makes the commit fail is a lifetime boundary the runtime must either
 * prevent or detect; a fault that does NOT break the commit is a negative result and is recorded as one. The
 * module never converts a negative result into a cause.
 *
 * NO PRODUCT REDESIGN. This module measures. It does not replace `--shared`, and it does not propose a heavier
 * clone as a fix; alternatives are reported as options with their tradeoffs, which is what the ruling asks for.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWorldLikeShipped, git, makeBasisRepository, workerCommit } from '../r3wr/reproduce.mjs';

const NL = String.fromCharCode(10);

/** Every alternates entry of a world, each TYPED rather than merely existence-tested. */
export function borrowEdges(worldPath) {
  const path = join(worldPath, '.git', 'objects', 'info', 'alternates');
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return Object.freeze({ present: false, entries: Object.freeze([]) });
  }
  const entries = text.split(/\r?\n/u).filter((line) => line.trim() !== '').map((line) => {
    const resolved = line.trim();
    let type = 'ABSENT';
    try { type = statSync(resolved).isDirectory() ? 'DIRECTORY' : 'FILE'; } catch { type = 'ABSENT'; }
    /**
     * Whether the pointer is ABSOLUTE. An absolute pointer cannot survive the borrowed directory being
     * MOVED, which is the distinction between a relocatable borrow and a pinned one.
     */
    const absolute = /^[A-Za-z]:[\\/]/u.test(resolved) || resolved.startsWith('\\\\') || resolved.startsWith('/');
    return Object.freeze({ resolved, type, absolute });
  });
  return Object.freeze({ present: true, text: text.trim(), entries: Object.freeze(entries) });
}

/**
 * GATE D: THE SHIPPED TOPOLOGY — canonical → worker world.
 *
 * This is what the product actually creates. The worker's one borrow edge should name the canonical object
 * store, and nothing else.
 */
export function shippedTopology(root) {
  const basis = makeBasisRepository(root);
  const worldPath = join(root, 'world');
  const prepared = createWorldLikeShipped({ repository: basis.repo, worldPath, baseCommit: basis.basisCommit });
  if (!prepared.created) return Object.freeze({ kind: 'SHIPPED', built: false, steps: prepared.steps });
  return Object.freeze({
    kind: 'SHIPPED',
    built: true,
    hops: Object.freeze(['canonical', 'worker world']),
    basis,
    worldPath,
    prepared,
    workerBorrows: borrowEdges(worldPath),
    canonicalObjects: join(basis.repo, '.git', 'objects'),
  });
}

/**
 * GATE D: THE CHAINED TOPOLOGY — canonical → trajectory world → worker world.
 *
 * The middle world is COPIED on disk, which is the rig's shape. The copy keeps the original's absolute
 * alternates, so the trajectory world's own objects directory is a copy while its pointer still names the
 * prehistory. That is the two-hop lookup the worker's commit walks.
 */
export function chainedTopology(root) {
  const basis = makeBasisRepository(root);
  const trajectorySource = join(root, 'trajectory-source');
  const source = createWorldLikeShipped({ repository: basis.repo, worldPath: trajectorySource, baseCommit: basis.basisCommit });
  if (!source.created) return Object.freeze({ kind: 'CHAINED', built: false, steps: source.steps });

  const trajectory = join(root, 'trajectory');
  cpSync(trajectorySource, trajectory, { recursive: true });

  const workerPath = join(root, 'worker-world');
  const worker = createWorldLikeShipped({ repository: trajectory, worldPath: workerPath, baseCommit: basis.basisCommit });
  if (!worker.created) return Object.freeze({ kind: 'CHAINED', built: false, stage: 'worker', steps: worker.steps });

  return Object.freeze({
    kind: 'CHAINED',
    built: true,
    hops: Object.freeze(['canonical', 'trajectory world (a copy)', 'worker world']),
    basis,
    trajectorySource,
    trajectory,
    workerPath,
    trajectoryBorrows: borrowEdges(trajectory),
    workerBorrows: borrowEdges(workerPath),
    canonicalObjects: join(basis.repo, '.git', 'objects'),
    trajectoryObjects: join(trajectory, '.git', 'objects'),
  });
}

/** A deterministic, committable edit. */
function edit(worldPath, label) {
  writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = "${label}";${NL}`, 'utf8');
}

/**
 * GATE D: ONE FAULT ARM.
 *
 * `fault` mutates the topology at a named point, and the round records what the worker could still do. The
 * `phase` says WHEN the fault lands, because "before work starts" and "after edits" are different questions:
 * the first is a preparation failure, the second is a data-loss question.
 */
export function faultArm(input) {
  const { root, topology = 'SHIPPED', fault = 'none', phase = 'before-work' } = input;
  const built = topology === 'CHAINED' ? chainedTopology(root) : shippedTopology(root);
  if (built.built === false) return Object.freeze({ topology, fault, phase, built: false, steps: built.steps });

  /** Both topologies name the world they hand the worker; the field is normalized so one arm reads it once. */
  const worldPath = built.workerPath ?? built.worldPath;
  const borrowedParent = topology === 'CHAINED' ? built.trajectory : built.basis.repo;
  const borrowedObjects = join(borrowedParent, '.git', 'objects');
  const notes = [];

  /** The fault, applied at the phase the caller named. */
  const applyFault = () => {
    if (fault === 'none') return;
    if (fault === 'borrowed-parent-objects-removed') { renameSync(borrowedObjects, `${borrowedObjects}-aside`); notes.push(`moved ${borrowedObjects} aside`); return; }
    if (fault === 'borrowed-dir-temporarily-unavailable') { renameSync(borrowedObjects, `${borrowedObjects}-aside`); notes.push('borrowed store renamed away for a maintenance window'); return; }
    if (fault === 'parent-world-copied') { cpSync(borrowedParent, `${borrowedParent}-copy`, { recursive: true }); notes.push('parent duplicated; the copy is not what the pointer names'); return; }
    if (fault === 'parent-world-moved') { renameSync(borrowedParent, `${borrowedParent}-moved`); notes.push(`moved the whole parent world to ${borrowedParent}-moved`); return; }
    if (fault === 'source-repacked') { git(borrowedObjects.replace(/[\\/]\.git[\\/]objects$/u, ''), ['repack', '-a', '-d', '-q']); notes.push('ran `git repack -a -d` against the borrowed store'); return; }
    notes.push(`unknown fault ${fault}`);
  };

  if (phase === 'before-work') {
    applyFault();
    edit(worldPath, `before-${fault}`);
  } else {
    /** AFTER EDITS: the work exists in the worktree and has NOT been committed. */
    edit(worldPath, `after-${fault}`);
    git(worldPath, ['add', '-A']);
    applyFault();
  }

  const commit = workerCommit({ worldPath, message: `fault ${fault} (${phase})` });
  /** A restored store: does the SAME world recover once the window closes, with the work still present? */
  let recovery = null;
  if (fault === 'borrowed-dir-temporarily-unavailable') {
    renameSync(`${borrowedObjects}-aside`, borrowedObjects);
    recovery = workerCommit({ worldPath, message: `recovery ${fault}` });
  }

  return Object.freeze({
    topology,
    fault,
    phase,
    built: true,
    notes: Object.freeze(notes),
    /** Which directories each hop borrows, measured rather than assumed. */
    workerBorrows: built.workerBorrows,
    trajectoryBorrows: built.trajectoryBorrows ?? null,
    committed: commit.commitOk,
    commit,
    recovery: recovery === null ? null : Object.freeze({ committed: recovery.commitOk, couldNotParseHead: recovery.couldNotParseHead, output: recovery.output }),
    /** After a move, whether the world's pointer still resolves — the relocatability question. */
    pointerStillResolvesAfter: fault === 'parent-world-moved' || fault === 'parent-world-copied' ? borrowEdges(worldPath) : null,
  });
}

/**
 * GATE D: THE MATRIX.
 *
 * Both topologies × the named faults × the two phases. Every arm is deterministic, so the table is
 * reproducible rather than a sample.
 */
export function borrowLifetimeMatrix(input = {}) {
  const base = mkdtempSync(join(tmpdir(), 'r3wr2-lifetime-'));
  const arms = [];
  const plan = [
    Object.freeze({ topology: 'SHIPPED', fault: 'none', phase: 'before-work' }),
    Object.freeze({ topology: 'SHIPPED', fault: 'borrowed-parent-objects-removed', phase: 'before-work' }),
    Object.freeze({ topology: 'SHIPPED', fault: 'borrowed-dir-temporarily-unavailable', phase: 'before-work' }),
    Object.freeze({ topology: 'SHIPPED', fault: 'parent-world-copied', phase: 'before-work' }),
    Object.freeze({ topology: 'SHIPPED', fault: 'parent-world-moved', phase: 'before-work' }),
    Object.freeze({ topology: 'SHIPPED', fault: 'source-repacked', phase: 'before-work' }),
    Object.freeze({ topology: 'SHIPPED', fault: 'borrowed-parent-objects-removed', phase: 'after-edits' }),
    Object.freeze({ topology: 'CHAINED', fault: 'none', phase: 'before-work' }),
    Object.freeze({ topology: 'CHAINED', fault: 'borrowed-parent-objects-removed', phase: 'before-work' }),
    Object.freeze({ topology: 'CHAINED', fault: 'borrowed-dir-temporarily-unavailable', phase: 'before-work' }),
    Object.freeze({ topology: 'CHAINED', fault: 'parent-world-copied', phase: 'before-work' }),
    Object.freeze({ topology: 'CHAINED', fault: 'parent-world-moved', phase: 'before-work' }),
    Object.freeze({ topology: 'CHAINED', fault: 'source-repacked', phase: 'before-work' }),
    Object.freeze({ topology: 'CHAINED', fault: 'borrowed-parent-objects-removed', phase: 'after-edits' }),
  ];
  try {
    for (const [index, arm] of plan.entries()) {
      const root = join(base, `arm-${String(index)}`);
      mkdirSync(root, { recursive: true });
      arms.push(faultArm({ root, ...arm }));
    }
  } finally {
    if (input.keep !== true) rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return Object.freeze({
    kind: 'borrow-chain lifetime fault matrix',
    arms: Object.freeze(arms),
    /** What the matrix establishes, computed rather than asserted. */
    healthyArmCommits: arms.filter((arm) => arm.fault === 'none' && arm.committed === true).length,
    healthyArmCount: arms.filter((arm) => arm.fault === 'none').length,
    breaksCommit: Object.freeze(arms.filter((arm) => arm.committed === false).map((arm) => `${arm.topology}/${arm.fault}/${arm.phase}`)),
    survivesCommit: Object.freeze(arms.filter((arm) => arm.committed === true).map((arm) => `${arm.topology}/${arm.fault}/${arm.phase}`)),
  });
}

function main() {
  const matrix = borrowLifetimeMatrix();
  process.stdout.write(`${NL}===== R3-WR2 GATE D — BORROW-CHAIN LIFETIME =====${NL}`);
  for (const arm of matrix.arms) {
    process.stdout.write(
      `${arm.topology.padEnd(8)} ${String(arm.fault).padEnd(36)} ${String(arm.phase).padEnd(12)} committed=${String(arm.committed).padEnd(5)} ${arm.recovery === null ? '' : `recovery=${String(arm.recovery.committed)}`}${NL}`,
    );
    if (arm.notes?.length > 0) process.stdout.write(`         notes: ${arm.notes.join('; ')}${NL}`);
    if (arm.committed === false) process.stdout.write(`         signature: ${String(arm.commit.couldNotParseHead ? 'could-not-parse-HEAD' : '')} ${String(arm.commit.output).slice(0, 140)}${NL}`);
  }
  process.stdout.write(`${NL}breaks commit: ${matrix.breaksCommit.join(', ') || 'none'}${NL}`);
  process.stdout.write(`survives:      ${matrix.survivesCommit.join(', ') || 'none'}${NL}`);
}

if (process.argv[1] !== undefined) main();
