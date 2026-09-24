/**
 * PLMP-LEAN-1 §D3-b2 — FOOTPRINT COVERAGE and the CHANGE FOOTPRINT.
 *
 * A selector list is a CLAIM about which resources matter. It is not by itself a PROOF that the claim is
 * complete, and that distinction is the fifth constitutional rule of D3:
 *
 *     declared footprint  ≠  proven-complete footprint
 *
 * The counterexample this module exists for is small and real. A work declares `reads: src/parser.ts`.
 * The world changes `src/network.ts`. Formally `R ∩ Δ = ∅` — and the conclusion is still WRONG, because
 * the worker's execution world handed it the WHOLE repository and it may well have read `network.ts`
 * without any ProjectIR field recording it. So:
 *
 *     UNPROVEN footprint  ⇏  COMPATIBLE
 *
 * even when every selector looks disjoint. Coverage is therefore a first-class value carried BESIDE the
 * selectors, never inferred from them.
 *
 * THE TWO HALVES HAVE GENUINELY DIFFERENT STRENGTH, and pretending otherwise would be the mistake:
 *
 *   WRITES   A completed source result was OBSERVED. `git diff --name-status base..result` is an
 *            execution fact, not an intention, so a completed result's write footprint can be
 *            PROVEN_COMPLETE at path granularity. "I planned to modify foo.ts" is strictly weaker
 *            evidence than "the diff shows I modified foo.ts", so observed writes are preferred.
 *
 *   READS    Git cannot tell anyone which source files a build or a test actually read. While the
 *            world grants read access to the whole repository, the only STRICTLY SAFE source read
 *            footprint is the whole repository — coarse, and honestly so. A narrower read set is
 *            PROVEN_COMPLETE only when something actually enforced it (restricted materialization, a
 *            sandbox file-access policy, a hermetic dependency manifest), and that evidence is
 *            supplied by the caller rather than assumed here.
 *
 * Layer: L2 (`src/project_world/`), beside the basis runtime. Not re-exported from the domain barrel.
 */
import { canonicalDigest } from "../schema/canonical.js";
import {
  canonicallyOrderedSelectors,
  normalizeSourcePath,
  type ResourceSelector,
} from "../domain/world_basis.js";

/* ================================================================== *
 * §D3-b2.1  Coverage: the evidence that a selector list is complete
 * ================================================================== */

/**
 * HOW the completeness of a footprint is established.
 *
 * The vocabulary matters more than the names: each value is a MECHANISM that can be pointed at, so
 * "PROVEN_COMPLETE" is never a bare assertion. A deployment that has none of these reports UNPROVEN,
 * and an UNPROVEN footprint cannot produce a compatibility proof no matter how disjoint it looks.
 */
export const COVERAGE_EVIDENCE = [
  /** The selector IS the whole domain by construction (e.g. "the entire source repository"). */
  "CONSERVATIVE_DOMAIN",
  /** Something enforced the boundary: a sandbox file policy, a restricted materialization. */
  "SANDBOX_ENFORCED",
  /** The set was OBSERVED after execution rather than declared before it (a result diff, a manifest). */
  "RUNTIME_OBSERVED",
  /** An authoritative manifest enumerated it (a produced-asset manifest, a lock file). */
  "AUTHORITATIVE_MANIFEST",
] as const;
export type CoverageEvidence = (typeof COVERAGE_EVIDENCE)[number];

export type FootprintCoverage =
  | { readonly status: "PROVEN_COMPLETE"; readonly evidence: CoverageEvidence; readonly detail: string }
  | { readonly status: "UNPROVEN"; readonly detail: string };

export function provenComplete(evidence: CoverageEvidence, detail: string): FootprintCoverage {
  return Object.freeze({ status: "PROVEN_COMPLETE" as const, evidence, detail });
}

export function unproven(detail: string): FootprintCoverage {
  return Object.freeze({ status: "UNPROVEN" as const, detail });
}

/** A selector list WITH the evidence that it is complete. */
export interface CoveredFootprint {
  readonly selectors: readonly ResourceSelector[];
  readonly coverage: FootprintCoverage;
}

export function covered(input: {
  readonly selectors: readonly ResourceSelector[];
  readonly coverage: FootprintCoverage;
}): CoveredFootprint {
  return Object.freeze({
    selectors: canonicallyOrderedSelectors(input.selectors),
    coverage: input.coverage,
  });
}

/**
 * The whole source repository, as a footprint that IS complete by construction.
 *
 * This is the honest default for a READ while the world grants repository-wide read access: it is
 * coarse, and its completeness is not a guess — the selector literally means "every source resource".
 * Being coarse makes it overlap everything, so it can never yield a disjointness proof against a source
 * change. That is the correct outcome: it is what "we cannot narrow this read" should cost.
 */
export function wholeRepositoryRead(): CoveredFootprint {
  return covered({
    selectors: [Object.freeze({ domain: "source", scope: "repository" } as const)],
    coverage: provenComplete(
      "CONSERVATIVE_DOMAIN",
      "the selector IS the whole source domain, so its completeness is definitional rather than observed",
    ),
  });
}

/* ================================================================== *
 * §D3-b2.2  The change footprint: what moved between B_0 and the current world
 * ================================================================== */

/**
 * WHAT changed, not merely THAT something changed.
 *
 * D3-a could only say "the basis is no longer exact". A compatibility proof needs the difference itself,
 * because non-interference is a statement about specific resources.
 *
 * It carries coverage for the same reason a footprint does:
 *
 *     partial diff  ⇏  absence of other changes
 *
 * A source diff that lists three files does not prove nothing else moved unless the diff is complete.
 */
export interface WorldChangeFootprint {
  readonly schemaVersion: 1;
  readonly projectSemantic: CoveredFootprint;
  readonly source: CoveredFootprint;
  readonly assets: CoveredFootprint;
  readonly environment: CoveredFootprint;
}

export function materializeWorldChangeFootprint(input: {
  readonly projectSemantic: CoveredFootprint;
  readonly source: CoveredFootprint;
  readonly assets: CoveredFootprint;
  readonly environment: CoveredFootprint;
}): WorldChangeFootprint {
  return Object.freeze({ schemaVersion: 1 as const, ...input });
}

/** An EMPTY change set that is known to be empty because it was compared, not because nothing was seen. */
export function noChanges(input: {
  readonly coverage: FootprintCoverage;
}): CoveredFootprint {
  return covered({ selectors: [], coverage: input.coverage });
}

/**
 * §D3-b2.3: `SourceChangeFootprint` from a real source diff.
 *
 * This is where Git finally does something it is genuinely good at — and it is emphatically NOT the
 * old architecture. Git does not answer "did the Project World change?"; it answers, as ONE SOURCE
 * BACKEND among possible others:
 *
 *     between revisions H0 and H1, which SOURCE resources changed?
 *
 *     source change observer  ≠  project compatibility oracle
 *
 * The selector granularity is PATH, and the coverage is PROVEN_COMPLETE because a full `--name-status`
 * between two revisions enumerates every path that moved — that is what the command means. A caller
 * that ran a partial or filtered diff must not use this constructor.
 */
export function sourceChangeFootprintFromPaths(input: {
  readonly paths: readonly string[];
  readonly coverage?: FootprintCoverage | undefined;
}): CoveredFootprint {
  const selectors = input.paths
    .map((path) => normalizeSourcePath(path))
    .filter((path) => path !== "")
    .map((path) => Object.freeze({ domain: "source", scope: "path", path } as const));
  return covered({
    selectors,
    coverage:
      input.coverage ??
      provenComplete(
        "RUNTIME_OBSERVED",
        "a full name-status diff between two revisions enumerates every source path that moved",
      ),
  });
}

/* ================================================================== *
 * §D3-b2.4  The result's own footprints
 * ================================================================== */

/**
 * A completed result's footprints, with the coverage each one actually has.
 *
 * `observedWrites` is deliberately named OBSERVED: for a completed source result it comes from the
 * diff the product already takes for its completion invariant, which makes it an execution fact. The
 * DECLARED write scope is retained beside it because a deployment may want to compare intention against
 * outcome, but the assessor prefers the observed set — intention is weaker evidence about what a result
 * actually touches.
 */
export interface ResultFootprints {
  readonly reads: CoveredFootprint;
  readonly writes: CoveredFootprint;
}

export function resultFootprints(input: {
  readonly reads: CoveredFootprint;
  readonly writes: CoveredFootprint;
}): ResultFootprints {
  return Object.freeze({ reads: input.reads, writes: input.writes });
}

/** A digest over a change footprint, so an assessment can bind the exact change set it was made against. */
const CHANGE_FOOTPRINT_DOMAIN = "palimpsest.world-change-footprint.v1";

export function worldChangeFootprintDigest(footprint: WorldChangeFootprint): string {
  const encode = (part: CoveredFootprint): unknown => ({
    selectors: part.selectors.map((selector) => selector),
    coverage: part.coverage,
  });
  return canonicalDigest({
    domain: CHANGE_FOOTPRINT_DOMAIN,
    projectSemantic: encode(footprint.projectSemantic),
    source: encode(footprint.source),
    assets: encode(footprint.assets),
    environment: encode(footprint.environment),
  });
}
