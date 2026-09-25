/**
 * PLMP-LEAN-1 §D3-b3 — the COMPATIBILITY ASSESSOR.
 *
 *     B_0 ≠ B_1  but  Result R may still be SAFE relative to B_1
 *
 * D3-a answers "is the basis still exactly what it was?". This answers the harder question: when it is
 * NOT, is there a POSITIVE PROOF that the divergence cannot affect the result?
 *
 * WHAT `COMPATIBLE` MEANS HERE, precisely — not "the result probably still works":
 *
 *     Under the resource-dependency model and direct-admission policy currently in force, the basis
 *     divergence neither invalidates the inputs this result depended on nor collides with the resources
 *     it writes.
 *
 * which is a conjunction of five facts, all of which must hold:
 *
 *   1. every relevant divergence is KNOWN           (change coverage)
 *   2. the change footprint is COMPLETE for the domains involved
 *   3. the result's READ footprint has enough coverage
 *   4. the result's WRITE footprint has enough coverage
 *   5. every change × read/write selector relation is PROVEN DISJOINT
 *
 *     COMPATIBLE     = positive proof
 *     INCOMPATIBLE   = positive conflict witness
 *     UNKNOWN        = insufficient proof
 *     EXACT          = D3-a already proved it (never downgraded to COMPATIBLE)
 *
 * `UNKNOWN` IS NOT "soft-compatible". It is the absence of a proof, and it must stay distinguishable
 * from one, because D3-c will admit on the strength of this assessment.
 *
 * THE WITNESS IS THE POINT. The assessor returns the proofs and the obstacles, not just a verdict, so
 * D3-c consumes an assessment instead of re-deriving one:
 *
 *     A(R, B_0, B_1)  —  bound to the exact result, origin basis and TARGET OBSERVATION
 *
 * A witness for `B_1` does not authorize `B_2`; a target that has moved needs its own assessment. That
 * is the same current-state discipline the promotion plane already follows.
 *
 * NO SEMANTIC PLAUSIBILITY. An LLM opinion that "a README change looks unrelated to the algorithm" may
 * be a RECOMMENDATION to a person; it is never a compatibility witness. Nothing in this module reads
 * file contents, names, or prose.
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { canonicalDigest } from "../schema/canonical.js";
import {
  relateSelectorToSet,
  type SelectorRelation,
} from "../domain/selector_algebra.js";
import type { ResourceSelector } from "../domain/world_basis.js";
import {
  worldChangeFootprintDigest,
  type CoveredFootprint,
  type WorldChangeFootprint,
} from "./footprint.js";

/**
 * The policy this assessment was made under.
 *
 * Versioned and part of the witness, because "compatible" is relative to a proof system: a later policy
 * that accepts narrower read evidence must not silently inherit authority from an assessment made under
 * a stricter one. The value is a constant today; the field exists so it cannot be forgotten later.
 */
export const DIRECT_COMPATIBILITY_POLICY_VERSION = "palimpsest.direct-compatibility.v1";

export const COMPATIBILITY_OUTCOMES = ["EXACT", "COMPATIBLE", "INCOMPATIBLE", "UNKNOWN"] as const;
export type CompatibilityOutcome = (typeof COMPATIBILITY_OUTCOMES)[number];

/** A proven disjointness, carried so a reader can check the proof rather than trust the verdict. */
export interface DisjointnessProof {
  readonly change: ResourceSelector;
  readonly dependency: ResourceSelector;
  readonly side: "read" | "write";
  readonly basis: string;
}

/** A proven interference, carried with the same purpose. */
export interface ConflictWitness {
  readonly change: ResourceSelector;
  readonly dependency: ResourceSelector;
  readonly side: "read" | "write";
  readonly kind: "read_invalidation" | "write_collision";
  readonly detail: string;
}

/** One reason a proof could not be completed. Every entry blocks COMPATIBLE. */
export interface CompatibilityUnknown {
  readonly part:
    | "change_coverage"
    | "read_coverage"
    | "write_coverage"
    | "selector_relation"
    | "unobserved_facet";
  readonly detail: string;
  /** The selectors whose relation could not be decided, when that is the obstacle. */
  readonly selectors?: readonly ResourceSelector[] | undefined;
}

export interface CompatibilityAssessment {
  readonly schemaVersion: 1;
  readonly policyVersion: string;
  /** WHICH result this is about. */
  readonly resultManifestDigest: string;
  /** WHICH basis the result came from. */
  readonly originBasisDigest: string;
  /** WHICH observed target this was assessed against — a witness for B_1 does not authorize B_2. */
  readonly targetObservationDigest: string;
  /** The exact change set, so the assessment names the divergence it reasoned about. */
  readonly changeFootprintDigest: string;
  readonly outcome: CompatibilityOutcome;
  readonly disjointnessProofs: readonly DisjointnessProof[];
  readonly conflicts: readonly ConflictWitness[];
  readonly unknowns: readonly CompatibilityUnknown[];
  readonly detail: string;
  readonly assessmentDigest: string;
}

const ASSESSMENT_DIGEST_DOMAIN = "palimpsest.compatibility-assessment.v1";

export interface AssessCompatibilityInput {
  readonly resultManifestDigest: string;
  readonly originBasisDigest: string;
  /** A digest of the OBSERVED target world, so the assessment is bound to the world it judged. */
  readonly targetObservationDigest: string;
  /**
   * `true` when D3-a's exact currentness already proved the basis holds.
   *
   * An EXACT result short-circuits to EXACT rather than being re-proved as COMPATIBLE: downgrading a
   * stronger fact to a weaker one would lose information a consumer may need, and would invite callers
   * to treat the two as interchangeable.
   */
  readonly exactlyCurrent: boolean;
  readonly change: WorldChangeFootprint;
  readonly reads: CoveredFootprint;
  readonly writes: CoveredFootprint;
  /**
   * Domains whose change coverage could not be established at all.
   *
   * A facet the origin basis recorded as UNKNOWN (a legacy D2 attempt's assets) lands here when the
   * proof would need it: the divergence cannot be shown to be irrelevant to a dependency nobody ever
   * recorded. Reporting COMPATIBLE in that situation would inherit a compatibility nobody established.
   */
  readonly unobservedFacets?: readonly string[] | undefined;
}

function assessmentDigestOf(body: Omit<CompatibilityAssessment, "assessmentDigest">): string {
  return canonicalDigest({ domain: ASSESSMENT_DIGEST_DOMAIN, ...body });
}

export function assessCompatibility(input: AssessCompatibilityInput): CompatibilityAssessment {
  const unknowns: CompatibilityUnknown[] = [];
  const conflicts: ConflictWitness[] = [];
  const proofs: DisjointnessProof[] = [];

  // 1. A facet nobody ever observed blocks a proof that would depend on it.
  for (const facet of input.unobservedFacets ?? []) {
    unknowns.push(
      Object.freeze({
        part: "unobserved_facet" as const,
        detail: `${facet}: the origin basis never recorded this facet, so the divergence cannot be shown irrelevant to a dependency that was never captured`,
      }),
    );
  }

  // 2. Coverage must be complete for the parts the proof reads.
  const coverageChecks: readonly (readonly ["change_coverage" | "read_coverage" | "write_coverage", CoveredFootprint, string])[] = [
    ["read_coverage", input.reads, "the result's read footprint"],
    ["write_coverage", input.writes, "the result's write footprint"],
  ];
  for (const [part, footprint, what] of coverageChecks) {
    if (footprint.coverage.status !== "PROVEN_COMPLETE") {
      unknowns.push(
        Object.freeze({
          part,
          detail: `${what} is UNPROVEN (${footprint.coverage.detail}), so disjointness against it cannot be established`,
        }),
      );
    }
  }

  // 3. Walk every change against every dependency, collecting proofs and witnesses.
  const sides: readonly (readonly ["read" | "write", CoveredFootprint])[] = [
    ["read", input.reads],
    ["write", input.writes],
  ];
  const changeParts: readonly (readonly ["projectSemantic" | "source" | "assets" | "environment", CoveredFootprint])[] = [
    ["projectSemantic", input.change.projectSemantic],
    ["source", input.change.source],
    ["assets", input.change.assets],
    ["environment", input.change.environment],
  ];

  for (const [side, dependency] of sides) {
    /**
     * A disjointness proof requires complete coverage of the thing being proven disjoint.
     *
     * Relating a change to a DECLARED-but-unenforced read set can produce a formally disjoint answer
     * that is not a proof at all — the read set may simply be incomplete. Recording such a relation as
     * a proof would let a consumer cherry-pick it out of an UNKNOWN assessment and read it as
     * compatibility, which is precisely the laundering the coverage rule exists to prevent. The
     * obstacle is recorded instead, and the walk still runs so that a genuine CONFLICT is never hidden
     * behind a coverage gap.
     */
    const dependencyCoverageProven = dependency.coverage.status === "PROVEN_COMPLETE";
    for (const [part, changes] of changeParts) {
      if (changes.coverage.status !== "PROVEN_COMPLETE") {
        /**
         * An UNPROVEN change footprint is an obstacle EVEN WHEN IT LISTS NO SELECTORS.
         *
         * This condition used to also require `changes.selectors.length > 0`, which made an UNPROVEN
         * EMPTY set indistinguishable from a PROVEN empty one — so an UNAVAILABLE observation ("the
         * revisions could not be compared") was read as "nothing changed". The design says the
         * opposite in as many words: an uncomparable pair yields an UNPROVEN empty set *precisely so
         * that* "I could not compare them" and "nothing changed" stay two different facts. The extra
         * conjunct nullified that distinction, and the D4-LIVE gate reached it through first-party
         * code: a source comparison the observer could not perform produced a COMPATIBLE assessment
         * while the result read the whole repository.
         *
         * Incomplete coverage means there may be MORE changes than the ones listed — it does not
         * disqualify the ones we can SEE. So the obstacle is recorded and the walk continues: a
         * POSITIVE conflict witness is a fact that does not get diluted by an unrelated unknown, and
         * skipping the walk here would hide a proven interference behind a coverage gap.
         */
        unknowns.push(
          Object.freeze({
            part: "change_coverage" as const,
            detail: `the ${part} change set is not PROVEN_COMPLETE (${changes.coverage.detail}), so ${
              changes.selectors.length === 0 ? "not even its emptiness" : "the changes it does not list"
            } can be established`,
          }),
        );
      }
      for (const change of changes.selectors) {
        const related = relateSelectorToSet(change, dependency.selectors);
        if (related.relation === "OVERLAP") {
          const witness = related.witness;
          conflicts.push(
            Object.freeze({
              change,
              dependency: witness?.selector ?? change,
              side,
              kind: side === "read" ? ("read_invalidation" as const) : ("write_collision" as const),
              detail:
                side === "read"
                  ? `the ${part} change touches a resource this result was computed from (${witness?.basis ?? "overlap proven"}), so its input would be superseded`
                  : `the ${part} change touches a resource this result also writes (${witness?.basis ?? "overlap proven"}), so accepting both would make one overwrite the other`,
            }),
          );
          continue;
        }
        if (related.relation === "DISJOINT") {
          /**
           * A disjointness PROOF is recorded only when the dependency's coverage is itself proven.
           * A formally disjoint relation against a DECLARED-but-unenforced set is not evidence that
           * the change cannot matter — the set may simply be incomplete — so it is recorded as a
           * proof ONLY under proven coverage, and otherwise contributes nothing.
           */
          if (dependencyCoverageProven) {
            for (const target of dependency.selectors) {
              const single = relateSelectorToSet(change, [target]);
              if (single.relation === "DISJOINT") {
                proofs.push(
                  Object.freeze({
                    change,
                    dependency: target,
                    side,
                    basis: `proven disjoint: the ${part} change and this ${side} dependency cannot name the same resource`,
                  }),
                );
              }
            }
          }
          continue;
        }
        unknowns.push(
          Object.freeze({
            part: "selector_relation" as const,
            detail: `the relation between a ${part} change and this ${side} dependency is not decidable by the current selector algebra, so non-interference is unproven`,
            selectors: Object.freeze([change, ...dependency.selectors]),
          }),
        );
      }
    }
  }

  const outcome: CompatibilityOutcome = input.exactlyCurrent
    ? "EXACT"
    : conflicts.length > 0
      ? "INCOMPATIBLE"
      : unknowns.length > 0
        ? "UNKNOWN"
        : "COMPATIBLE";

  const detail =
    outcome === "EXACT"
      ? "D3-a exact currentness already proved the basis holds, so no divergence needs a compatibility proof"
      : outcome === "INCOMPATIBLE"
        ? `${String(conflicts.length)} proven interference(s) between the world change and this result`
        : outcome === "COMPATIBLE"
          ? `every one of the ${String(proofs.length)} change-to-dependency relation(s) is PROVEN DISJOINT under complete coverage`
          : `no proof was completed: ${unknowns.map((entry) => entry.part).join(", ")}`;

  const body = {
    schemaVersion: 1 as const,
    policyVersion: DIRECT_COMPATIBILITY_POLICY_VERSION,
    resultManifestDigest: input.resultManifestDigest,
    originBasisDigest: input.originBasisDigest,
    targetObservationDigest: input.targetObservationDigest,
    changeFootprintDigest: worldChangeFootprintDigest(input.change),
    outcome,
    disjointnessProofs: Object.freeze(proofs),
    conflicts: Object.freeze(conflicts),
    unknowns: Object.freeze(unknowns),
    detail,
  };
  return Object.freeze({ ...body, assessmentDigest: assessmentDigestOf(body) });
}

/**
 * Is this assessment still about the world it was made against?
 *
 * §D3-b3: a witness is bound to `(result, origin basis, TARGET OBSERVATION)`. Handing an old assessment
 * to a new target must be detected rather than trusted, so D3-c's admission stays a current-state
 * decision:
 *
 *     A(R, B_0, B_1)  does NOT authorize  B_2
 */
export function assessmentStillAppliesTo(input: {
  readonly assessment: CompatibilityAssessment;
  readonly resultManifestDigest: string;
  readonly originBasisDigest: string;
  readonly targetObservationDigest: string;
}): { readonly applies: boolean; readonly detail: string } {
  const { assessment } = input;
  if (assessment.resultManifestDigest !== input.resultManifestDigest) {
    return { applies: false, detail: "the assessment was made about a different result" };
  }
  if (assessment.originBasisDigest !== input.originBasisDigest) {
    return { applies: false, detail: "the assessment was made against a different origin basis" };
  }
  if (assessment.targetObservationDigest !== input.targetObservationDigest) {
    return {
      applies: false,
      detail:
        "the world has moved since this assessment was made: a witness for one target observation does not authorize another, so a fresh assessment is required",
    };
  }
  return { applies: true, detail: "the assessment is about this exact result, origin basis and target observation" };
}

/** Exposed for tests and callers that want the raw relation without the assessment machinery. */
export type { SelectorRelation };
