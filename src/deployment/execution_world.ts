/**
 * PLMP-LEAN-1 §D2-cR — the WORK EXECUTION WORLD, as a layer rather than a mechanism.
 *
 *     Work Execution World must own its mutable execution state.
 *
 * That sentence is what the D2-c live gate bought us. A linked git worktree keeps its mutable state
 * (`HEAD`, refs, index) in the CANONICAL repository — `<repo>/.git/worktrees/<id>` — which lies outside
 * the world, so a worker confined to its own directory could not `git add` or `git commit`, and said so
 * honestly. The fix is not a second writable root (which would distort the execution boundary to save a
 * backend) and not a host-side commit (which would put file selection, artifact creation and artifact
 * verification in one pair of hands): it is a world that owns what it must write.
 *
 * WHAT IS NEW HERE IS THE CONTRACT, NOT GIT. The first-party backend happens to be a local repository,
 * and long-lived backends may be containers, remote sandboxes or microVMs; the contract is what stays:
 *
 *     create / open-or-resume   ·  exact basis  ·  worldDir  ·  observe  ·  result export  ·  release
 *
 * Three rules carry over from what D2-a proved, and they are the reason this layer is a migration
 * rather than a rewrite:
 *
 *   `CompletionInvariant is placement-independent`
 *     The observation D2-a built reads whatever world the placement names. Changing how a world is
 *     MATERIALIZED does not touch how its work is JUDGED.
 *
 *   `a world outlives the worker process`
 *     A world is not a temporary directory to delete when a process exits. Its result may be the only
 *     copy of hours of work, and BASE_DRIFT in particular must never destroy it: the result stays
 *     inspectable and becomes D3's transplant input.
 *
 *   `an absent world is never re-created`
 *     A world that is expected and missing means the work may have existed and been lost. Re-cloning
 *     would silently discard it, so the only honest answer is `WORLD_MISSING`.
 *
 * Host/deployment packaging (`src/deployment/**`): it runs git and reads the filesystem, and it holds
 * no Work authority.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

/** The lifecycle a world is in. All of it is HOST-EXECUTION fact, never canonical Work state. */
export const EXECUTION_WORLD_STATES = ["PREPARED", "ACTIVE", "QUIESCENT", "RELEASED"] as const;
export type ExecutionWorldState = (typeof EXECUTION_WORLD_STATES)[number];

export interface ExecutionWorldView {
  readonly attemptId: string;
  /** The world's working directory: the worker's whole filesystem world. */
  readonly worldDir: string;
  /** The exact basis the world was materialized at — `TaskEnvelope.base_commit`, never a second base. */
  readonly basisCommit: string;
  /** Which backend materialized it. A name for diagnostics, not an authority. */
  readonly backend: string;
  /**
   * `PREPARED` once it exists; `ACTIVE`/`QUIESCENT` are composed by the host from its own job state
   * (D2-d), because "a worker is using it right now" is not something a filesystem can know.
   */
  readonly state: ExecutionWorldState;
  /** The world's own HEAD — for a placed attempt, its result commit once the worker has committed. */
  readonly head: string;
}

export type ExecutionWorldOpenResult =
  | { readonly ok: true; readonly world: ExecutionWorldView }
  | { readonly ok: false; readonly detail: string };

export interface ExecutionWorldPort {
  readonly adapterId: string;
  /** Pure path arithmetic: where the world WOULD be. Creates nothing, reads nothing. */
  worldDir(attemptId: string): string;
  /** Open an existing world. NEVER creates one — see `WORLD_MISSING`. */
  open(attemptId: string): ExecutionWorldOpenResult;
  /**
   * Export one world's result commit into the canonical repository's OBJECT DATABASE.
   *
   *     Object availability  !=  Canonical project state
   *
   * It moves no ref, touches no working tree and revises no ProjectIR: after it, the canonical
   * repository can READ the commit, and nothing about the project has changed. That is the seam D2-e's
   * settlement and D3's transplant both need, and it is deliberately separate from promotion.
   */
  exportResultCommit(input: {
    readonly attemptId: string;
    readonly commit: string;
  }): Promise<{ readonly imported: boolean; readonly detail: string }>;
  /** Release the world. ONLY ever called once its result is safely recorded or explicitly discarded. */
  release(attemptId: string): Promise<void>;
}

export class ExecutionWorldError extends Error {
  constructor(
    readonly kind: "WORLD_MISSING" | "WORLD_UNREADABLE" | "WORLD_EXPORT_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ExecutionWorldError";
  }
}

export function gitRepositoryWorldPort(input: {
  readonly repository: string;
  readonly worldsRoot: string;
}): ExecutionWorldPort {
  const worldDir = (attemptId: string): string => `${input.worldsRoot}/${attemptId}`;
  const git = (cwd: string, args: readonly string[]): string =>
    execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

  return {
    adapterId: "git-repository-world",
    worldDir,
    open(attemptId) {
      const dir = worldDir(attemptId);
      if (!existsSync(dir)) {
        /**
         * NOT "create one". A world that should exist and does not may have held uncommitted work, and
         * re-materializing it at the basis would silently throw that away. Fail closed and let the
         * caller decide (recovery is a Work decision, not a filesystem convenience).
         */
        return {
          ok: false,
          detail: `WORLD_MISSING: attempt ${attemptId} has no execution world at "${dir}" — it is not re-created, because whatever it held would be lost silently`,
        };
      }
      try {
        return {
          ok: true,
          world: Object.freeze({
            attemptId,
            worldDir: dir,
            basisCommit: git(dir, ["rev-parse", "HEAD"]),
            backend: "git-repository-world",
            state: "PREPARED" as const,
            head: git(dir, ["rev-parse", "HEAD"]),
          }),
        };
      } catch (error) {
        return {
          ok: false,
          detail: `WORLD_UNREADABLE: attempt ${attemptId}'s world at "${dir}" is not a readable repository: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    async exportResultCommit({ attemptId, commit }) {
      const dir = worldDir(attemptId);
      if (!existsSync(dir)) {
        return { imported: false, detail: `WORLD_MISSING: attempt ${attemptId} has no execution world to export from` };
      }
      try {
        // Object-only: fetch the world's HEAD into FETCH_HEAD. No refspec destination means no ref is
        // created or moved, so the canonical project's state cannot change here — the objects simply
        // become READABLE.
        git(input.repository, ["fetch", "--no-tags", dir, "HEAD"]);
        git(input.repository, ["cat-file", "-e", `${commit}^{commit}`]);
        return { imported: true, detail: `the canonical object database can now read ${commit.slice(0, 12)}; no ref, working tree or project revision changed` };
      } catch (error) {
        return {
          imported: false,
          detail: `WORLD_EXPORT_FAILED: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    async release(attemptId) {
      const dir = worldDir(attemptId);
      if (!existsSync(dir)) return;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
