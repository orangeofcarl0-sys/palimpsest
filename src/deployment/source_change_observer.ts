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

import {
  observedPremise,
  unavailablePremise,
  type PremiseObservation,
} from "../project_world/observation.js";
import { provenComplete, sourceChangeFootprintFromPaths, type CoveredFootprint } from "../project_world/footprint.js";

/**
 * The observer's own identity, and the mechanism it claims.
 *
 * These are declared HERE, by the observer, and nowhere else. A party that did not run a full tree diff
 * cannot honestly label its output with `GIT_TREE_DIFF_NO_RENAMES`, and the type gives it no way to:
 * `observedPremise` requires a `mechanism`, and the only code that supplies this one is this file.
 */
export const GIT_SOURCE_OBSERVER_ID = "git-source-change-observer";
export const GIT_SOURCE_OBSERVER_VERSION = "1";
export const GIT_SOURCE_MECHANISM = "RUNTIME_OBSERVED" as const;

export interface SourceChangeObserverPort {
  readonly adapterId: string;
  /**
   * Which SOURCE resources moved between two revisions, as an AUTHORITY-BEARING observation.
   *
   * §D3-c1: the return value is not a footprint with a label but an observation with PROVENANCE — who
   * observed, at which version, by which mechanism, over which scope. That is what lets a compatibility
   * certificate rest on a premise whose completeness somebody actually established, rather than on a
   * caller's assertion that it is complete.
   */
  observeChange(input: {
    readonly fromRevision: string;
    readonly toRevision: string;
    /** The repository the diff is over — part of the scope, because completeness is always over one. */
    readonly scopeRef: string;
  }): PremiseObservation;
}

export function gitSourceChangeObserver(input: { readonly repository: string }): SourceChangeObserverPort {
  return Object.freeze({
    adapterId: GIT_SOURCE_OBSERVER_ID,

    observeChange(changeInput: {
      readonly fromRevision: string;
      readonly toRevision: string;
      readonly scopeRef: string;
    }): PremiseObservation {
      const { fromRevision, toRevision, scopeRef } = changeInput;
      const provenance = {
        observerId: GIT_SOURCE_OBSERVER_ID,
        observerVersion: GIT_SOURCE_OBSERVER_VERSION,
        mechanism: GIT_SOURCE_MECHANISM,
        scope: { domain: "source" as const, scopeRef, from: fromRevision, to: toRevision },
      };
      if (fromRevision === toRevision) {
        // Identical revisions: the diff is empty AND that emptiness is proven by the comparison.
        return observedPremise({ provenance, selectors: [] });
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
        const footprint = sourceChangeFootprintFromPaths({ paths });
        return observedPremise({ provenance, selectors: footprint.selectors });
      } catch (error) {
        /**
         * An incomparable revision pair is `UNAVAILABLE`, NOT an empty observation: "I could not compare
         * them" and "nothing changed" are different facts, and an unavailable premise contributes no
         * coverage, so it can never support a proof.
         */
        return unavailablePremise(
          "source",
          `the source revisions could not be compared (${error instanceof Error ? error.message : String(error)}), so neither a change nor its absence is established`,
        );
      }
    },
  });
}

/** Re-exported so a caller of this module has the coverage vocabulary in one import. */
export { provenComplete, type CoveredFootprint };

