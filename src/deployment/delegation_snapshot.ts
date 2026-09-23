/**
 * PLMP-LEAN-1 §C.11 principle ②: the delegation-time PROJECT SNAPSHOT.
 *
 *     WriteSet_canonical_project(worker) = ∅
 *
 * The brief deliberately carries no Principal conversation, but the branch runner's `workDir` is an
 * explicit parameter — so pointing it at the repository the principal is editing would hand the worker
 * a MOVING filesystem. `WriteSet` would be empty while `ReadBasis` was not frozen, which is the worse
 * half of the problem: a research finding computed against a tree that changed underneath it is not
 * reproducible and cannot be compared with another branch's.
 *
 * So a delegation checks out the DELEGATION-TIME COMMITTED HEAD into a detached temporary checkout.
 * The worker reads a frozen basis, and an accidental `edit`/`shell` write lands in the throwaway copy
 * rather than the project. The constraint is canonical-project zero writes — NOT the stronger and
 * wrong claim that a worker may not write any temporary file anywhere.
 *
 * Uncommitted principal changes are deliberately NOT copied. Reading a moving dirty tree would be less
 * honest than saying "this basis is the committed HEAD", and the target scenario ("delegate B, then
 * start editing A") does not need them.
 *
 * This is a host capability, not a truth owner: it creates no identity, records nothing, and its
 * cleanup is unconditional.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export interface DelegationSnapshot {
  /** The frozen tree the research worker should read. */
  readonly workDir: string;
  /** The commit this basis IS — recorded so a finding can name what it was computed against. */
  readonly basisCommit: string;
  /** Always called, including when the job fails, times out or is cancelled. */
  release(): Promise<void>;
}

export interface DelegationSnapshotPort {
  /**
   * Freeze the CURRENT committed HEAD into an ephemeral checkout. Absent a repository this is simply
   * not composed, and the caller must fail closed rather than hand the worker a live tree.
   */
  freeze(): Promise<DelegationSnapshot>;
}

export class DelegationSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegationSnapshotError";
  }
}

/**
 * The first-party snapshot: a detached git worktree at the committed HEAD, under a
 * delegation-specific namespace so it can never be mistaken for a Work workspace or an attempt.
 */
export function gitDelegationSnapshotPort(input: {
  readonly repository: string;
  /** Where ephemeral snapshots are created; defaults to `<repository>/.palimpsest/delegation`. */
  readonly rootDirectory?: string | undefined;
}): DelegationSnapshotPort {
  const repository = input.repository;
  const root = input.rootDirectory ?? join(repository, ".palimpsest", "delegation");
  const git = (args: readonly string[], cwd: string): string =>
    execFileSync("git", [...args], { cwd, encoding: "utf8" });

  return Object.freeze({
    async freeze(): Promise<DelegationSnapshot> {
      // The basis is the COMMITTED head. A dirty tree is not copied, and saying so is the point.
      let head: string;
      try {
        head = git(["rev-parse", "HEAD"], repository).trim();
      } catch (error) {
        throw new DelegationSnapshotError(
          `the project repository cannot be read, so no research basis can be frozen: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      mkdirSync(root, { recursive: true });
      const path = join(root, `basis-${head.slice(0, 12)}-${randomUUID().slice(0, 8)}`);
      try {
        git(["worktree", "add", "--detach", path, head], repository);
      } catch (error) {
        throw new DelegationSnapshotError(
          `the research basis at ${head.slice(0, 12)} could not be checked out: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const materialized = git(["rev-parse", "HEAD"], path).trim();
      if (materialized !== head) {
        try {
          git(["worktree", "remove", "--force", path], repository);
        } catch {
          /* the defensive cleanup below still runs */
        }
        rmSync(path, { recursive: true, force: true });
        throw new DelegationSnapshotError(
          `the research basis materialized ${materialized.slice(0, 12)} where ${head.slice(0, 12)} was required`,
        );
      }
      return Object.freeze({
        workDir: path,
        basisCommit: head,
        async release(): Promise<void> {
          try {
            git(["worktree", "remove", "--force", path], repository);
          } catch {
            // A failed removal must not hide a research result, and the directory is reaped below.
          }
          rmSync(path, { recursive: true, force: true });
          try {
            git(["worktree", "prune"], repository);
          } catch {
            /* prune is hygiene, not correctness */
          }
        },
      });
    },
  });
}
