/**
 * PLMP-LEAN-1 §D3-a — the FIRST-PARTY world observation: what a real deployment can honestly say about
 * its current world.
 *
 * This is host/deployment-side (`src/deployment/**`), and it is the ONLY place that knows how to read a
 * source revision or a semantic projection out of a real project. The runtime above it stays a pure
 * consumer of the port.
 *
 *     Observation  ≠  Truth about compatibility
 *
 * It reports revisions. It never decides whether a difference matters — that judgement belongs to the
 * currentness assessment, and later to a compatibility assessor, both of which receive these facts
 * rather than reading the world themselves.
 *
 * WHY THE SEMANTIC PROJECTION IS RE-DERIVED HERE. `semanticProjectionDigestOf` is a PURE function of the
 * envelope, so the "current" projection for a task is simply the digest of the envelope the project
 * holds for it right now. That is what makes an irrelevant `ProjectIR` revision bump invisible: the
 * envelope of an untouched task is byte-identical, so its digest is unchanged, so nothing this work
 * depends on moved. The global revision is read only for PROVENANCE on a new capture.
 *
 * Host/deployment packaging: it reads a repository and a task row, and it holds no authority.
 */
import { execFileSync } from "node:child_process";

import { parseTaskEnvelope } from "../schema/index.js";
import { semanticProjectionDigestOf } from "../project_world/dependency.js";
import type { ProjectWorldObservationPort } from "../project_world/runtime.js";
import type { SourceRevisionBinding } from "../domain/world_basis.js";

/** Exactly what this port needs from the Work owner: one task's canonical envelope, and the revision. */
export interface WorldObservationWorkReader {
  /**
   * The canonical envelope for one task, or null when the project has no such task.
   *
   * A READ ON THE OWNER rather than a query here. The G10-W source firewall pins the writers of the
   * envelope column to exactly one file (the projector) and its NAMERS to a short, audited list — so a
   * new module reaching for that column would either widen the allowlist or become a second shadow
   * envelope cache. Asking the Work owner keeps the firewall's list short, which is the point of it.
   */
  taskEnvelope(taskId: string): unknown | null;
  /** The current canonical revision, for provenance on a capture. */
  projectRevision(): number;
}

export function firstPartyProjectWorldObservation(input: {
  readonly owner: WorldObservationWorkReader;
  readonly repository: string | undefined;
}): ProjectWorldObservationPort {
  const { owner } = input;

  const git = (args: readonly string[]): string =>
    execFileSync("git", [...args], { cwd: input.repository, encoding: "utf8" }).trim();

  return Object.freeze({
    adapterId: "first-party-project-world-observation",

    observeSource(): { readonly ok: true; readonly revision: SourceRevisionBinding } | { readonly ok: false; readonly detail: string } {
      if (input.repository === undefined || input.repository === "") {
        /**
         * No repository ⇒ no source facet. Reported as UNOBSERVABLE rather than as an empty revision,
         * so a capture on such a deployment fails closed instead of recording a basis whose source is a
         * placeholder.
         */
        return { ok: false, detail: "this deployment is not bound to a repository, so it cannot observe a source revision" };
      }
      try {
        return { ok: true, revision: Object.freeze({ backend: "git", revision: git(["rev-parse", "HEAD"]) }) };
      } catch (error) {
        return { ok: false, detail: `the canonical repository's HEAD could not be read: ${error instanceof Error ? error.message : String(error)}` };
      }
    },

    observeSemanticProjection(
      taskId: string,
    ): { readonly ok: true; readonly digest: string } | { readonly ok: false; readonly detail: string } | null {
      const envelope = owner.taskEnvelope(taskId);
      /**
       * `null` is the "this task is not in the current project" answer, and it is deliberately distinct
       * from an error: a retired task is a PROVEN divergence (its basis cannot still hold), whereas an
       * unreadable envelope is a fact the deployment cannot establish. Collapsing them would make a
       * retired task report UNKNOWN and understate what is known.
       */
      if (envelope === null) return null;
      try {
        return { ok: true, digest: semanticProjectionDigestOf(parseTaskEnvelope(envelope)) };
      } catch (error) {
        return { ok: false, detail: `task "${taskId}" has an unreadable envelope: ${error instanceof Error ? error.message : String(error)}` };
      }
    },

    observeRevision(): number {
      return owner.projectRevision();
    },
  });
}
