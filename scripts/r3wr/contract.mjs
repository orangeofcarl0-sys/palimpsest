/**
 * R3-WR GATE 1/2 — THE OBJECT-STORE DEFECT CONTRACT AND THE READINESS GATE.
 *
 * GATE 1's outcome is a NEGATIVE RESULT, and this module records it as one rather than dressing it as a cause.
 * Four independent reproductions were run through the SHIPPED preparation path, and the failure the stage was
 * opened for did not recur in any of them:
 *
 *   single shared clone, 5 rounds                         5/5 committed
 *   the rig's chained shape (worker → copied world), 3     3/3 committed
 *   the same chain without the copy, 3                     3/3 committed
 *   concurrent `git repack -a -d` on the alternate target  8/8 committed
 *
 * The one hypothesis that CANNOT be dismissed is the separator, and it was tested directly: the same world was
 * committed with its alternates written four different ways — the shipped mixed spelling, all backslashes, all
 * forward slashes, and a relative path — and ALL FOUR COMMITTED. So the mixed separator Git warned about is
 * tolerated, and the warning is not the defect.
 *
 * WHAT DOES REPRODUCE, exactly and deterministically: REMOVING THE ALTERNATE TARGET. With the intermediate
 * world's `objects` directory deleted, every round fails with the worker's own signature —
 * `fatal: could not parse HEAD` — because the objects a borrowed store points at are gone. That is the
 * positive control, and it establishes the CLASS of the defect even though the ORIGINAL trigger was not
 * recovered.
 *
 * SO THE CLASSIFICATION IS `MISSING_GIT_OBJECT`, and the honest statement is that the missing object's ORIGIN
 * was not reproduced. The ruling anticipates exactly this: "If the defect does not reproduce, report exactly
 * which original failing bytes or lifecycle conditions are unavailable. Do not fabricate a successful
 * root-cause conclusion."
 *
 * WHAT IS UNAVAILABLE, stated precisely rather than vaguely. The original failure's alternates bytes were
 * RESTORED BY THIS SESSION during diagnosis, before the ruling's preservation step existed, so the mtime of that
 * file (02:01) is later than the worker's own metadata (01:49). The preserved copy is byte-identical to what
 * this session restored, and it is NOT verifiable as the worker-era original. That is recorded as a limitation
 * on the evidence, not hidden.
 *
 * WHY A REPAIR IS STILL JUSTIFIED. GATE 2 authorizes a repair "only for a reproduced defect violating the
 * existing Worktree preparation contract". A defect WAS reproduced — an unreadable alternate target makes a
 * worker unable to commit, deterministically — and the contract the worktree preparation already promises is
 * that the world "owns its mutable git state and borrows immutable objects read-only", which is exactly the
 * promise a missing target breaks. So the repair does not invent a new contract; it CHECKS the existing one.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { git } from './reproduce.mjs';

const NL = String.fromCharCode(10);

/** GATE 1: the negative results, each with what it rules out. */
export const REPRODUCTION_ATTEMPTS = Object.freeze([
  Object.freeze({ id: 'SINGLE_SHARED_CLONE', rounds: 5, committed: 5, failed: 0, rulesOut: 'the shipped `clone --shared` call itself as a deterministic failure' }),
  Object.freeze({ id: 'RIG_SHAPE_CHAINED_WITH_COPY', rounds: 3, committed: 3, failed: 0, rulesOut: 'the rig shape (a shared clone of a copied world) as a deterministic failure' }),
  Object.freeze({ id: 'CHAIN_WITHOUT_COPY', rounds: 3, committed: 3, failed: 0, rulesOut: 'the copy hop as the trigger' }),
  Object.freeze({ id: 'CONCURRENT_REPACK_OF_ALTERNATE', rounds: 8, committed: 8, failed: 0, rulesOut: 'a repack of the alternate target during the commit window as a reproducible race' }),
  Object.freeze({ id: 'CONTROL_MISSING_ALTERNATE_TARGET', rounds: 3, committed: 0, failed: 3, rulesOut: 'nothing — it REPRODUCES the worker signature and establishes the defect class' }),
  Object.freeze({ id: 'ALTERNATE_SPELLING_MATRIX', rounds: 4, committed: 4, failed: 0, rulesOut: 'the mixed path separator as the defect; all four spellings commit' }),
]);

/** GATE 1: the classification, with its basis and its limitation. */
export const CLASSIFICATION = Object.freeze({
  category: 'MISSING_GIT_OBJECT',
  notCategory: Object.freeze(['MALFORMED_ALTERNATE_PATH']),
  whyNotMalformedPath: 'the shipped mixed-separator spelling commits, and so do three other spellings, so the warning Git emits is tolerated and is not the failure',
  whyMissingObject: 'removing the alternate target reproduces the worker exact signature deterministically, which is the only mechanism that did',
  triggerNotReproduced: true,
  triggerStatement: 'the ORIGIN of the missing or unreadable object in the original run was not recovered; the CLASS is established and the TRIGGER is not',
  /** The ruling requires the unavailable conditions to be named. */
  unavailableEvidence: Object.freeze([
    Object.freeze({ id: 'WORKER_ERA_ALTERNATES_BYTES', detail: 'the alternates file of the failing worktree was restored by this session during diagnosis at 02:01, after the worker metadata of 01:49; the preserved copy is byte-identical to that restoration and cannot be verified as the worker-era original' }),
    Object.freeze({ id: 'ALTERNATE_TARGET_STATE_DURING_THE_RUN', detail: 'the intermediate world objects directory is present now and cannot be observed as it was during the worker window' }),
    Object.freeze({ id: 'HOST_LEVEL_IO_STATE', detail: 'no durable record captures whether the alternate target was transiently unreadable (a Windows sharing violation, an antivirus scan, or a concurrent removal) during the commit' }),
  ]),
});

/**
 * GATE 2: THE READINESS GATE.
 *
 * The three facts the ruling names, each measured by GIT rather than inferred from a filesystem check. The gate
 * exists because the failure mode it prevents is invisible to every other signal: a world that cannot commit
 * still reports a resolvable HEAD and a clean status, so without an explicit commit-capability check the runtime
 * declares the attempt usable and the worker discovers otherwise.
 *
 * `WORKTREE_COMMIT_CAPABLE` is measured with `git commit --dry-run`, which reads the index and the base and stops
 * before writing — so checking readiness cannot itself alter the world it is checking.
 */
export function worktreeReadiness(input) {
  const { worldPath, basisCommit } = input;
  const head = git(worldPath, ['rev-parse', '--verify', 'HEAD']);
  const basis = basisCommit === undefined || basisCommit === null ? null : git(worldPath, ['cat-file', '-e', `${basisCommit}^{commit}`]);
  const dryRun = git(worldPath, ['-c', 'user.email=readiness@palimpsest.invalid', '-c', 'user.name=readiness', 'commit', '--dry-run', '-m', 'readiness-probe']);
  const dryRunText = `${dryRun.stdout}${NL}${dryRun.stderr}`;
  /**
   * `commit --dry-run` exits non-zero when there is NOTHING TO COMMIT, which is a legitimate clean world rather
   * than an unreadiness. So capability is decided by the ABSENCE of an object-store error, not by the exit code —
   * an exit-code test would fail every clean world and the gate would be worse than useless.
   */
  const objectStoreError = /could not parse HEAD|bad object|unable to normalize alternate|not a git repository|object directory/iu.test(dryRunText);
  return Object.freeze({
    WORKTREE_HEAD_RESOLVABLE: head.ok,
    WORKTREE_REQUIRED_OBJECTS_RESOLVABLE: basis === null ? head.ok : basis.ok,
    WORKTREE_COMMIT_CAPABLE: !objectStoreError,
    detail: Object.freeze({
      head: head.ok ? head.stdout : null,
      headError: head.ok ? null : head.stderr,
      basisReadable: basis === null ? null : basis.ok,
      basisError: basis === null || basis.ok ? null : basis.stderr,
      dryRunExitOk: dryRun.ok,
      objectStoreError: objectStoreError ? dryRunText.trim().slice(0, 240) : null,
    }),
    READY: head.ok && (basis === null || basis.ok) && !objectStoreError,
  });
}

/**
 * GATE 2: THE FAIL-CLOSED RULE.
 *
 * A world that is not ready must make WORKER READINESS fail rather than produce an attempt that looks usable.
 * The consequence is stated as a value so a caller cannot soften it, and it names what must NOT be done about it.
 */
export const NOT_READY_CONSEQUENCE = Object.freeze({
  rule: 'a world failing any readiness fact must fail worker readiness rather than create a misleading usable attempt',
  forbidden: Object.freeze([
    'skipping verification to let the attempt proceed',
    'forcing promotion',
    'disabling quiescence',
    're-creating a world that may have held uncommitted work',
  ]),
  /** The lifecycle the runtime already has, which the failure must be routed into rather than bypassed. */
  route: 'report the attempt as a host failure through the existing failure semantics, so the attempt settles and the project stays quiescent',
});

export { NL };
