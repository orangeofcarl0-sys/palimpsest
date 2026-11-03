/**
 * COG-5 §5.5 — THE POST-PROMOTION APPLICABILITY ANCHOR.
 *
 *     unpromoted result:  origin basis  →  current source        (what changed since the candidate was cut?)
 *     promoted result:    accepted head →  current source        (what changed after it was accepted?)
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A COMPATIBILITY CHANGE.
 *
 * The packaged continuation compares a result's ORIGIN source revision to the CURRENT source revision. For a
 * result that was promoted, the accepted resulting head contains the result's own output, so the origin-to-
 * current interval reports the result's own writes as a later external change. The assessor then sees a
 * `read_invalidation` (the whole-repository read overlaps its own output) and a `write_collision` (the result
 * collides with itself), and the packaged face reports `INCOMPATIBLE` for a change that is its own effect.
 *
 * The correct baseline for the post-promotion question is the **accepted resulting head** recorded by the
 * normal Promotion Lineage — never the result commit by assumption. `PromotionFact` records both
 * `sourceCommit` and `resultingHeadCommit`; a promotion may merge the result onto an advanced head, so the two
 * are not interchangeable. This module selects the baseline only after the recorded Git graph proves:
 *
 *     resultCommit ⊆ resultingHeadCommit ⊆ currentSourceRevision
 *
 * and that the promotion's expected head is also contained in the resulting head. Anything less is
 * `UNPROVEN`: no origin fallback (which would restore the self-collision), no invented head, no positive
 * authority. The caller turns `UNPROVEN` into an UNAVAILABLE source observation, which the compatibility
 * assessor already reports as `UNKNOWN`.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not read ProjectIR, promote, assess, admit, rematerialize or write.
 * It is a pure selection over facts the owners already recorded plus one read-only ancestry probe.
 *
 * Layer: host/deployment packaging (`src/deployment/**`). It holds no Work, Promotion or world authority.
 */
import { execFileSync } from "node:child_process";

import type { PromotionFact } from "../domain/project_head.js";

/** A three-valued ancestry answer: "I could not decide" is never read as "no". */
export type AncestryVerdict = "PROVEN" | "DISPROVEN" | "UNKNOWN";

export interface AncestryProbe {
  (input: { readonly ancestor: string; readonly descendant: string }): AncestryVerdict;
}

export type PromotionBaseline =
  /** The result produced no canonical source revision, so a promotion lineage cannot anchor it. */
  | { readonly state: "NO_SOURCE_RESULT"; readonly detail: string }
  /** No committed promotion names this attempt: the result is still a candidate at its origin. */
  | { readonly state: "UNPROMOTED"; readonly detail: string }
  /** The promotion lineage is proven; this accepted head is the baseline for later changes. */
  | {
      readonly state: "PROMOTED";
      readonly baselineRevision: string;
      readonly promotionId: string;
      readonly eventId: string;
      readonly detail: string;
    }
  /** A promotion fact exists but the lineage cannot be proven. The caller must not guess a baseline. */
  | { readonly state: "UNPROVEN"; readonly detail: string };

const frozen = <T extends PromotionBaseline>(value: T): T => Object.freeze(value);

/**
 * Select the baseline for "what changed after this result?".
 *
 * The order is the semantics:
 *   1. no source result        → there is no lineage question to ask;
 *   2. no fact for this attempt → unpromoted, keep the origin interval;
 *   3. more than one fact      → ambiguous, refuse;
 *   4. the fact's source is not this result → refuse;
 *   5. the result is not proven inside the accepted head → refuse;
 *   6. the expected head is not proven inside the accepted head → refuse;
 *   7. the accepted head is not proven inside the current source → refuse;
 *   8. otherwise the accepted head is the baseline.
 */
export function resolvePromotionBaseline(input: {
  readonly attemptId: string;
  readonly resultCommit: string | null;
  readonly currentSourceRevision: string | null;
  readonly promotionFacts: readonly PromotionFact[];
  readonly provesAncestry: AncestryProbe;
}): PromotionBaseline {
  if (input.resultCommit === null) {
    return frozen({
      state: "NO_SOURCE_RESULT" as const,
      detail:
        "the result produced no canonical source revision, so there is no promoted source result to anchor and the origin interval remains the change premise",
    });
  }

  const facts = input.promotionFacts.filter((fact) => fact.attemptId === input.attemptId);
  if (facts.length === 0) {
    return frozen({
      state: "UNPROMOTED" as const,
      detail:
        "no committed promotion names this attempt, so the result is still a candidate and its origin basis remains the change premise",
    });
  }
  if (facts.length > 1) {
    return frozen({
      state: "UNPROVEN" as const,
      detail: `this attempt has ${String(facts.length)} committed promotions, so which resulting head is the accepted one is ambiguous`,
    });
  }

  const fact = facts[0] as PromotionFact;
  if (fact.sourceCommit !== input.resultCommit) {
    return frozen({
      state: "UNPROVEN" as const,
      detail: `the promotion recorded source commit ${fact.sourceCommit.slice(0, 12)} but the canonical result commit is ${input.resultCommit.slice(0, 12)}; the accepted fact does not name this result`,
    });
  }
  if (input.currentSourceRevision === null) {
    return frozen({
      state: "UNPROVEN" as const,
      detail:
        "the current source revision could not be observed, so the accepted head cannot be placed relative to the current world",
    });
  }

  const resultInHead = input.provesAncestry({
    ancestor: input.resultCommit,
    descendant: fact.resultingHeadCommit,
  });
  if (resultInHead !== "PROVEN") {
    return frozen({
      state: "UNPROVEN" as const,
      detail: `git did not prove the result commit ${input.resultCommit.slice(0, 12)} is contained in the accepted head ${fact.resultingHeadCommit.slice(0, 12)} (${resultInHead})`,
    });
  }

  const expectedInHead =
    fact.expectedHeadCommit === fact.resultingHeadCommit
      ? ("PROVEN" as const)
      : input.provesAncestry({
          ancestor: fact.expectedHeadCommit,
          descendant: fact.resultingHeadCommit,
        });
  if (expectedInHead !== "PROVEN") {
    return frozen({
      state: "UNPROVEN" as const,
      detail: `git did not prove the promotion's expected head ${fact.expectedHeadCommit.slice(0, 12)} is contained in the accepted head ${fact.resultingHeadCommit.slice(0, 12)} (${expectedInHead}); the recorded fact is not a coherent lineage`,
    });
  }

  if (fact.resultingHeadCommit !== input.currentSourceRevision) {
    const headInCurrent = input.provesAncestry({
      ancestor: fact.resultingHeadCommit,
      descendant: input.currentSourceRevision,
    });
    if (headInCurrent !== "PROVEN") {
      return frozen({
        state: "UNPROVEN" as const,
        detail: `git did not prove the accepted head ${fact.resultingHeadCommit.slice(0, 12)} is an ancestor of the current source ${input.currentSourceRevision.slice(0, 12)} (${headInCurrent}); the current world has diverged from the accepted lineage, so later external changes cannot be named`,
      });
    }
  }

  return frozen({
    state: "PROMOTED" as const,
    baselineRevision: fact.resultingHeadCommit,
    promotionId: fact.promotionId,
    eventId: fact.eventId,
    detail: `the accepted promotion ${fact.promotionId} produced ${fact.resultingHeadCommit.slice(0, 12)}, which Git proves contains result ${input.resultCommit.slice(0, 12)} and is contained in the current source ${input.currentSourceRevision.slice(0, 12)}`,
  });
}

/**
 * The read-only Git probe: `git merge-base --is-ancestor <ancestor> <descendant>`.
 *
 * Exit 0 is PROVEN, exit 1 is DISPROVEN (a real "no"), and every other outcome — a missing object, a bad
 * repository, a spawn failure — is UNKNOWN. The distinction is load-bearing: a missing object must not make a
 * claimed lineage look disproven, and an unavailable probe must not make it look proven.
 */
export function gitAncestryProbe(repository: string): AncestryProbe {
  return ({ ancestor, descendant }) => {
    if (ancestor === "" || descendant === "" || repository === "") return "UNKNOWN";
    if (ancestor === descendant) return "PROVEN";
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
        cwd: repository,
        stdio: ["ignore", "ignore", "ignore"],
      });
      return "PROVEN";
    } catch (error) {
      const status = (error as { readonly status?: unknown }).status;
      return typeof status === "number" && status === 1 ? "DISPROVEN" : "UNKNOWN";
    }
  };
}
