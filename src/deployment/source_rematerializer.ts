/**
 * PLMP-LEAN-1 §D3-d2 — the first-party GIT SOURCE REMATERIALIZER.
 *
 *     Δ_S = Diff(H_0, R_0)          R_1 = Apply(H_1, Δ_S)
 *
 * THE SEMANTIC IS THE TREE DELTA, NOT THE COMMIT. What migrates is the change the origin result's source
 * facet EXPRESSES, not the git commit object in the graph. So this backend does exactly three things:
 *
 *     diff two source revisions   ·   apply that delta to a target   ·   freeze a new revision
 *
 * and `cherry-pick` is deliberately NOT the semantics. Making a git operation the Project-level definition
 * of "carrying a result forward" would re-lock `Project result == Git commit` at the layer built to escape
 * it — this is only one implementation of one facet.
 *
 * ALL-OR-NOTHING, AND NO CLEVERNESS. The delta is applied in an ISOLATED WORLD created at the target
 * basis; if it does not apply cleanly the world is reported as a failure and no revision is produced.
 * There is deliberately no three-way merge, no rename heuristic, no conflict resolution and no partial
 * application here: compatibility was PROVED by D3-b and ADMITTED by D3-c, and
 *
 *     an effect engine must not exceed the proof that authorized it
 *
 * A backend that started merging would be doing fresh compatibility reasoning inside the effect layer.
 *
 * WHY THE WORLD IS A CLONE. Same reason D2-cR established: a linked worktree keeps HEAD/refs/index in the
 * canonical repository, so a confined process could not commit. The world owns its mutable git state and
 * borrows immutable objects read-only, which is what lets this run inside a sandbox rooted at the world.
 *
 * Host/deployment packaging (`src/deployment/**`): it runs git, and it holds no Work authority.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

import type { RematerializationOutcome, ResultRematerializerPort } from "../project_world/rematerialization.js";

/** Operational commit identity: it says "a Palimpsest derivation produced this", never "this is the user". */
export const REMATERIALIZER_COMMIT_NAME = "Palimpsest Rematerializer";
export const REMATERIALIZER_COMMIT_EMAIL = "rematerializer@palimpsest.invalid";

export const GIT_SOURCE_REMATERIALIZER_ID = "git-source-rematerializer";
export const GIT_SOURCE_REMATERIALIZER_VERSION = "1";

export function gitSourceRematerializer(input: {
  readonly repository: string;
  readonly worldsRoot: string;
}): ResultRematerializerPort {
  const git = (cwd: string, args: readonly string[]): string =>
    execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

  return Object.freeze({
    adapterId: GIT_SOURCE_REMATERIALIZER_ID,
    mechanismVersion: GIT_SOURCE_REMATERIALIZER_VERSION,

    async rematerialize(runInput: {
      readonly delta: { readonly backend: string; readonly fromRevision: string; readonly toRevision: string };
      readonly targetBasisRevision: string;
      readonly worldId: string;
    }): Promise<RematerializationOutcome> {
      if (runInput.delta.backend !== "git") {
        return {
          state: "APPLY_FAILED",
          detail: `this rematerializer carries the git source facet only, and the delta names backend "${runInput.delta.backend}"`,
        };
      }
      const worldPath = `${input.worldsRoot}/${runInput.worldId}`;
      try {
        /**
         * REPLAY. The world id IS the operation identity, so the same operation addresses the same world.
         * If that world already stands beyond the target basis, the derivation completed and its frozen
         * revision is the answer — re-applying the delta would fail on work already applied, which is
         * exactly the crash/replay window D2-e1 taught this project to close rather than to rediscover.
         *
         * This is what makes a retry converge: `same operation identity → same canonical derivation`,
         * without requiring the two runs to produce the same commit hash.
         */
        if (existsSync(worldPath)) {
          const existingHead = git(worldPath, ["rev-parse", "HEAD"]);
          if (existingHead !== runInput.targetBasisRevision) {
            return { state: "MATERIALIZED", resultRevision: existingHead, worldPath };
          }
        }

        /**
         * A world at the TARGET basis. `--shared` borrows immutable objects and keeps everything mutable
         * inside, and `origin` is removed so a strong process inside the world has no explicit path back
         * into the canonical project.
         */
        if (!existsSync(worldPath)) {
          git(input.repository, ["clone", "--shared", "--no-checkout", input.repository, worldPath]);
        }
        git(worldPath, ["checkout", "--detach", runInput.targetBasisRevision]);
        git(worldPath, ["remote", "remove", "origin"]);
        git(worldPath, ["config", "user.name", REMATERIALIZER_COMMIT_NAME]);
        git(worldPath, ["config", "user.email", REMATERIALIZER_COMMIT_EMAIL]);

        /**
         * THE DELTA, as a patch between the origin revisions, applied to the target.
         *
         * `--binary` so a delta touching non-text resources is carried faithfully rather than mangled by
         * text handling. `--3way` is deliberately NOT used: a three-way application is a merge, and a
         * merge is a compatibility decision this layer is not entitled to make.
         */
        const patch = execFileSync(
          "git",
          ["diff", "--binary", `${runInput.delta.fromRevision}..${runInput.delta.toRevision}`],
          { cwd: input.repository, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
        );
        if (patch.trim() === "") {
          // An empty delta is a legitimate derivation: the result changed nothing in source. Freezing the
          // target revision is the honest outcome, and it is NOT a failure.
          return { state: "MATERIALIZED", resultRevision: git(worldPath, ["rev-parse", "HEAD"]), worldPath };
        }

        execFileSync("git", ["apply", "--binary", "--whitespace=nowarn", "-"], {
          cwd: worldPath,
          input: patch,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        });

        // Freeze. A commit is required because a candidate result is an immutable revision, and the
        // completion invariant D2 established holds a completed result to a materialized commit.
        git(worldPath, ["add", "-A"]);
        git(worldPath, ["commit", "-m", `rematerialize ${runInput.delta.fromRevision.slice(0, 12)}..${runInput.delta.toRevision.slice(0, 12)} onto ${runInput.targetBasisRevision.slice(0, 12)}`]);
        return { state: "MATERIALIZED", resultRevision: git(worldPath, ["rev-parse", "HEAD"]), worldPath };
      } catch (error) {
        /**
         * The delta did not apply, or the world could not be produced. Either way the answer is a FAILURE
         * and the world is left in place for inspection rather than deleted — it may hold the only evidence
         * of why, and this runtime does not silently retry with a cleverer strategy.
         */
        const detail = error instanceof Error ? error.message : String(error);
        return existsSync(worldPath)
          ? { state: "APPLY_FAILED", detail: `${detail} (the world at "${worldPath}" was retained for inspection; nothing was frozen)` }
          : { state: "WORLD_UNAVAILABLE", detail };
      }
    },

    async exportRevision(exportInput: { readonly worldId: string; readonly revision: string }): Promise<{
      readonly imported: boolean;
      readonly detail: string;
    }> {
      const worldPath = `${input.worldsRoot}/${exportInput.worldId}`;
      if (!existsSync(worldPath)) {
        return { imported: false, detail: `WORLD_MISSING: world "${exportInput.worldId}" does not exist, so its revision cannot be exported` };
      }
      try {
        /**
         * Object-only: fetch the world's HEAD into FETCH_HEAD. No refspec destination means no ref is
         * created or moved, so canonical project state cannot change here.
         */
        git(input.repository, ["fetch", "--no-tags", worldPath, "HEAD"]);
        git(input.repository, ["cat-file", "-e", `${exportInput.revision}^{commit}`]);
        return {
          imported: true,
          detail: `the canonical object database can now read ${exportInput.revision.slice(0, 12)}; no ref, working tree or project revision changed`,
        };
      } catch (error) {
        return { imported: false, detail: `${error instanceof Error ? error.message : String(error)}` };
      }
    },

    async release(worldId: string): Promise<void> {
      const worldPath = `${input.worldsRoot}/${worldId}`;
      if (!existsSync(worldPath)) return;
      rmSync(worldPath, { recursive: true, force: true });
    },
  });
}
