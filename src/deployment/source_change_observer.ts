/**
 * PLMP-LEAN-1 §D3-b4 — the SOURCE CHANGE OBSERVER, and the packaged composition proof.
 *
 * This is where Git finally does something it is genuinely good at — and it is emphatically NOT the old
 * architecture:
 *
 *     Git does NOT answer "did the Project World change?"
 *     Git DOES answer, as one source backend: "between H0 and H1, which source paths moved?"
 *
 *     source change observer  ≠  project compatibility oracle
 *
 * The observer's whole output is a `CoveredFootprint` at PATH granularity with `RUNTIME_OBSERVED`
 * coverage, because a full `--name-status` between two revisions enumerates every path that moved —
 * that is what the command means, and it is why the coverage can honestly be PROVEN_COMPLETE. A caller
 * that ran a partial or filtered diff must not use this.
 *
 * IT DOES NOT DECIDE ANYTHING. It reports which resources changed; whether that matters to a result is
 * the compatibility assessor's question, and it is asked with the observer's output rather than by the
 * observer.
 *
 * Host/deployment packaging (`src/deployment/**`): it runs git and reads no project state.
 */
import { execFileSync } from "node:child_process";

import { provenComplete, sourceChangeFootprintFromPaths, type CoveredFootprint } from "../project_world/footprint.js";

export interface SourceChangeObserverPort {
  readonly adapterId: string;
  /**
   * Which SOURCE resources moved between two revisions.
   *
   * A revision the repository cannot resolve is reported as an UNPROVEN EMPTY set rather than an empty
   * PROVEN one: "I could not compare them" and "nothing changed" are different facts, and conflating
   * them would let an uncomparable pair produce a compatibility proof.
   */
  observeChange(input: {
    readonly fromRevision: string;
    readonly toRevision: string;
  }): CoveredFootprint;
}

export function gitSourceChangeObserver(input: { readonly repository: string }): SourceChangeObserverPort {
  return Object.freeze({
    adapterId: "git-source-change-observer",

    observeChange(changeInput: { readonly fromRevision: string; readonly toRevision: string }): CoveredFootprint {
      const { fromRevision, toRevision } = changeInput;
      if (fromRevision === toRevision) {
        // Identical revisions: the diff is empty AND that emptiness is proven by the comparison.
        return sourceChangeFootprintFromPaths({ paths: [] });
      }
      try {
        /**
         * `--no-renames` is deliberate, and it was MEASURED rather than assumed: with rename detection
         * on (the modern default) a rename reports only the NEW path, so a result that depended on the
         * old path would be told nothing changed there. Disabling detection reports the delete and the
         * add separately, naming BOTH paths — an over-approximation of the change set, which is the
         * correct direction to err in when the cost of missing a change is a false compatibility proof.
         */
        const stdout = execFileSync("git", ["diff", "--name-only", "--no-renames", `${fromRevision}..${toRevision}`], {
          cwd: input.repository,
          encoding: "utf8",
        });
        const paths = stdout
          .split(String.fromCharCode(10))
          .map((line) => line.trim())
          .filter((line) => line !== "");
        return sourceChangeFootprintFromPaths({ paths });
      } catch (error) {
        return Object.freeze({
          selectors: Object.freeze([]),
          coverage: Object.freeze({
            status: "UNPROVEN" as const,
            detail: `the source revisions could not be compared (${error instanceof Error ? error.message : String(error)}), so neither a change nor its absence is established`,
          }),
        });
      }
    },
  });
}

/** Re-exported so a caller of this module has the coverage vocabulary in one import. */
export { provenComplete };
