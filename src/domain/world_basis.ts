/**
 * PLMP-LEAN-1 §D3-0 — the WORLD BASIS and RESOURCE-DOMAIN semantic foundation.
 *
 * This module freezes the vocabulary D3 is built on. It implements NO mechanism: no transplant, no
 * rebase, no merge policy, no compatibility solver, no CAS, no scheduler. It exists because the
 * alternative — start from `H0 → H1` and generalise later — locks the whole of D3 back into a
 * Git-centric model, and every later correction then costs a migration.
 *
 * FOUR CONSTITUTIONAL RULES, each one the answer to a failure this project has already measured:
 *
 *   1. `ProjectWorldBasis = dependency projection, not global snapshot`
 *      A work binds `B_w = π_w(W_t)`, NOT `W_t`. A task that edits one source file must not be stale
 *      because an unrelated document changed, and a task that consumes a dataset MUST be able to be
 *      stale while `HEAD` has not moved at all. So the basis records what this work's dependencies
 *      RESOLVED to, not the world's version.
 *
 *   2. `AttemptResult = immutable output facets bound to exactly ONE basis`
 *      `R is a commit` is not the model; `R was produced from basis B0` is. Two results whose bytes are
 *      identical but whose bases differ have different authority provenance — the mirror image of the
 *      D2-d incident, where two results with identical bytes turned out to be the same commit, and an
 *      assertion about hashes was asserting git's deduplication rather than the product's promise.
 *
 *   3. `Compatibility ≠ revision equality`
 *      Neither `ProjectIR.revision` nor `HEAD` is a currentness predicate. `capturedAtRevision` is
 *      PROVENANCE here and is deliberately excluded from `basisDigest`, so a global revision bump that
 *      changes nothing this work depends on cannot move the basis.
 *
 *   4. `Concurrency safety requires read/write reasoning, not merely write/write disjointness`
 *      `W_A ∩ W_B = ∅` is necessary and NOT sufficient. A worker that reads what another writes is
 *      invalidated by it even though their write sets never touch. Both halves are modelled.
 *
 * THE FACET TRUTH VALUE HAS THREE STATES, NOT TWO. `undefined` would conflate three different facts:
 *
 *   BOUND(x)       this IS part of the basis, and `x` is what it resolved to;
 *   NOT_REQUIRED   the system KNOWS changes here cannot affect this work;
 *   UNKNOWN        the system does not have enough information to say.
 *
 * and `UNKNOWN ⇏ compatible`. This is what lets a legacy D2 attempt — which captured only a base
 * commit — enter D3 WITHOUT manufacturing historical knowledge: it reports UNKNOWN for the facets it
 * never observed, and UNKNOWN fails closed wherever a decision depends on it.
 *
 * Layer: L1 (domain), beside `standard.ts` and `completion_contract.ts`. NOT re-exported from the
 * domain barrel: the product's public surface is sealed, and an added export fails parity.
 */
import { canonicalDigest } from "../schema/canonical.js";

/* ================================================================== *
 * §D3-0.2  The three-state facet truth value
 * ================================================================== */

/**
 * What the basis says about ONE facet of a work's dependency projection.
 *
 * The three states are deliberately not collapsible into optionality, and the reason is a data-lifetime
 * one rather than a stylistic one: a legacy record that captured nothing must not read as a record that
 * established nothing was needed. `NOT_REQUIRED` is a KNOWLEDGE claim; `UNKNOWN` is the ABSENCE of one.
 */
export type FacetBinding<T> =
  | { readonly state: "BOUND"; readonly value: T }
  | { readonly state: "NOT_REQUIRED" }
  | { readonly state: "UNKNOWN"; readonly detail: string };

export function bound<T>(value: T): FacetBinding<T> {
  return Object.freeze({ state: "BOUND" as const, value });
}

export const NOT_REQUIRED: FacetBinding<never> = Object.freeze({ state: "NOT_REQUIRED" as const });

export function unknown<T>(detail: string): FacetBinding<T> {
  return Object.freeze({ state: "UNKNOWN" as const, detail });
}

/* ================================================================== *
 * §D3-0.12  The typed resource domain
 * ================================================================== */

/**
 * WHAT a dependency is about, across the whole world rather than across a working tree.
 *
 * Deliberately typed per domain instead of `string[]`. A `string[]` of git paths cannot express "this
 * task consumes asset revision A3", so every consumer that needs the distinction would either encode it
 * in a path convention or re-derive it — and the first option is how a resource model silently becomes
 * a path model again. `start coarse, model general`: the FIRST implementation resolves `source` at
 * repository granularity, and that is a choice of resolver, not a limitation of this type.
 */
export type ResourceSelector =
  /** The canonical project's SEMANTIC projection: task, work, envelope, policy, output obligations. */
  | { readonly domain: "project_semantic"; readonly aspect: "task" | "work" | "envelope" | "verification_policy" | "authority_policy" }
  /**
   * Canonical source, at whatever granularity the resolver can honestly observe.
   *
   * §D3-b adds the two finer scopes beside `repository`. They exist because a DISJOINTNESS PROOF needs
   * narrower selectors than "the whole repository" — but only where the narrowing is itself proven, so
   * the conservative `repository` scope remains the honest answer whenever completeness cannot be
   * established (see `CoveredFootprint` in `project_world/footprint.ts`).
   */
  | { readonly domain: "source"; readonly scope: "repository" }
  /** One exact source path. */
  | { readonly domain: "source"; readonly scope: "path"; readonly path: string }
  /** A directory subtree: everything under `prefix`. */
  | { readonly domain: "source"; readonly scope: "subtree"; readonly prefix: string }
  /** A canonical asset, by ref; the revision is resolved, never declared by the caller. */
  | { readonly domain: "asset"; readonly assetRef: string }
  /** A semantically relevant environment component (toolchain, runtime, lock state). */
  | { readonly domain: "environment"; readonly component: string };

/** A stable, order-comparable spelling of one selector — the identity used for digests and set algebra. */
export function resourceSelectorKey(selector: ResourceSelector): string {
  if (selector.domain === "source") {
    switch (selector.scope) {
      case "repository":
        return "source:repository";
      case "path":
        return `source:path:${normalizeSourcePath(selector.path)}`;
      case "subtree":
        return `source:subtree:${normalizeSourcePath(selector.prefix)}`;
    }
  }
  // The source case returned above, so this switch is exhaustive over the REMAINING domains.
  switch (selector.domain) {
    case "project_semantic":
      return `project_semantic:${selector.aspect}`;
    case "asset":
      return `asset:${selector.assetRef}`;
    case "environment":
      return `environment:${selector.component}`;
  }
}

/**
 * One spelling of a source path, so two selectors that name the same place compare equal.
 *
 * Deliberately NOT lowercased: source paths are case-sensitive as a rule, and folding case would make
 * two genuinely different files look like one resource — an over-approximation that could turn a real
 * conflict into a claimed disjointness. Separator normalization is the only rewriting done, because
 * `/` and `\` are the same character to every backend here.
 */
export function normalizeSourcePath(path: string): string {
  return path
    .split(String.fromCharCode(92))
    .join("/")
    .replace(/\/+/gu, "/")
    .replace(/^\.\//u, "")
    .replace(/\/$/u, "");
}

/** A sorted, de-duplicated selector set: the canonical form, so digests never depend on input order. */
export function canonicallyOrderedSelectors(selectors: readonly ResourceSelector[]): readonly ResourceSelector[] {
  const byKey = new Map<string, ResourceSelector>();
  for (const selector of selectors) byKey.set(resourceSelectorKey(selector), selector);
  return Object.freeze([...byKey.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([, selector]) => selector));
}

/* ================================================================== *
 * §D3-0.13  What a work depends on, and what its result tries to change
 * ================================================================== */

/**
 * A work's declared dependency footprint.
 *
 * `reads` is what the basis is RESOLVED from; `writes` is what the result is allowed to affect, and is
 * the input of the conflict calculus. They are separate fields because they answer different questions
 * and because rule 4 needs both: write/write disjointness alone cannot see a writer invalidating a
 * reader.
 */
export interface WorkDependency {
  readonly reads: readonly ResourceSelector[];
  readonly writes: readonly ResourceSelector[];
}

export function materializeWorkDependency(input: {
  readonly reads?: readonly ResourceSelector[] | undefined;
  readonly writes?: readonly ResourceSelector[] | undefined;
}): WorkDependency {
  return Object.freeze({
    reads: canonicallyOrderedSelectors(input.reads ?? []),
    writes: canonicallyOrderedSelectors(input.writes ?? []),
  });
}

/* ================================================================== *
 * §D3-0.6  The resolved facet values
 * ================================================================== */

/** Where canonical source stood. `revision` is a backend-specific immutable id (today: the commit). */
export interface SourceRevisionBinding {
  readonly backend: string;
  readonly revision: string;
}

/** One canonical asset at a revision. Identity/version only — never bytes. */
export interface AssetRevisionBinding {
  readonly assetRef: string;
  readonly revision: string;
}

/** The SEMANTIC environment: what could change the meaning or reproducibility of a result. */
export interface EnvironmentBinding {
  readonly component: string;
  readonly revision: string;
}

/**
 * §D3-0.5 — `EnvironmentBasis ≠ ExecutionHostCapabilities`.
 *
 * This type is the SECOND one, and it is deliberately not a facet of any world basis. Whether THIS
 * machine can currently grant a sandbox (the D2 live gate measured exactly such a case: the PTC file
 * sandbox needs WRITE_DAC, which the host had inside the user profile but not on other volumes) is a
 * fact about EXECUTION ADMISSION. Modelling it as an environment revision would make "the result is
 * stale" out of "we moved the checkout to another disk", which is not a statement about the work.
 */
export interface ExecutionHostCapabilities {
  readonly sandboxSpawnVerified: boolean;
  readonly supportsSandboxWriteGrant: boolean;
  readonly notes: readonly string[];
}

/* ================================================================== *
 * §D3-0.1/§D3-0.3  The world, and the basis a work is bound to
 * ================================================================== */

/**
 * The CURRENT full world `W_t`.
 *
 * `revision` is the global ProjectIR revision. It is present for provenance and diagnostics and is
 * NEVER compared on its own: a revision bump caused by an unrelated task is not a reason for anything.
 */
export interface ProjectWorldState {
  readonly projectId: string;
  readonly revision: number;
  readonly semanticProjectionDigest: string;
  readonly source: FacetBinding<SourceRevisionBinding>;
  readonly assets: FacetBinding<readonly AssetRevisionBinding[]>;
  readonly environment: FacetBinding<EnvironmentBinding>;
}

/**
 * A work's basis `B_w = π_w(W_t)`: the dependency projection resolved at one instant.
 *
 * `capturedAtRevision` is PROVENANCE — it says when and where this was taken, so a person can locate it.
 * It is EXCLUDED from `basisDigest` on purpose: including it would restore the exact defect this module
 * exists to prevent, where a global counter stands in for "something this work depends on changed".
 */
export interface ProjectWorldBasis {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly taskId: string;
  /** Provenance only. Never a currentness predicate — see the module comment, rule 3. */
  readonly capturedAtRevision: number;
  /** `P_w`: the digest of the semantic projection relevant to THIS work. */
  readonly semanticProjectionDigest: string;
  readonly source: FacetBinding<SourceRevisionBinding>;
  readonly assets: FacetBinding<readonly AssetRevisionBinding[]>;
  readonly environment: FacetBinding<EnvironmentBinding>;
  readonly basisDigest: string;
}

const BASIS_DIGEST_DOMAIN = "palimpsest.project-world-basis.v1";

/**
 * The digest of a basis: every SEMANTIC facet, and nothing else.
 *
 * `capturedAtRevision` is omitted deliberately (rule 3). `projectId`/`taskId` are included because two
 * works' bases are not interchangeable even when they resolve identically — that is rule 2 read from
 * the provenance side.
 */
export function projectWorldBasisDigest(
  basis: Omit<ProjectWorldBasis, "basisDigest">,
): string {
  const facet = <T>(binding: FacetBinding<T>, encode: (value: T) => unknown): unknown => {
    switch (binding.state) {
      case "BOUND":
        return { state: "BOUND", value: encode(binding.value) };
      case "NOT_REQUIRED":
        return { state: "NOT_REQUIRED" };
      case "UNKNOWN":
        return { state: "UNKNOWN", detail: binding.detail };
    }
  };
  return canonicalDigest({
    domain: BASIS_DIGEST_DOMAIN,
    projectId: basis.projectId,
    taskId: basis.taskId,
    semanticProjectionDigest: basis.semanticProjectionDigest,
    source: facet(basis.source, (value) => value),
    // Sorted here too: the digest must not depend on the order a resolver happened to emit.
    assets: facet(basis.assets, (values) =>
      [...values].sort((a, b) => (a.assetRef < b.assetRef ? -1 : a.assetRef > b.assetRef ? 1 : 0)),
    ),
    environment: facet(basis.environment, (value) => value),
  });
}

export function materializeProjectWorldBasis(
  input: Omit<ProjectWorldBasis, "schemaVersion" | "basisDigest">,
): ProjectWorldBasis {
  const body = {
    schemaVersion: 1 as const,
    ...input,
    assets:
      input.assets.state === "BOUND"
        ? bound(Object.freeze([...input.assets.value].sort((a, b) => (a.assetRef < b.assetRef ? -1 : a.assetRef > b.assetRef ? 1 : 0))))
        : input.assets,
  };
  return Object.freeze({ ...body, basisDigest: projectWorldBasisDigest(body) });
}

/**
 * §D3-0.13: `B_w = Resolve(W_t, R_w)`.
 *
 * Resolution is where "this work does not care about assets" becomes a KNOWLEDGE claim rather than an
 * omission: a work that declares no `asset` read gets `NOT_REQUIRED`, because the projection is exactly
 * the selectors the work named. An UNKNOWN in the current world propagates rather than being dropped —
 * if the deployment cannot say what the assets are, the basis cannot either.
 *
 * This is the constructor for NEW work. Legacy records take the path below, which does not pretend a
 * declaration was made.
 */
export function resolveWorkBasis(input: {
  readonly state: ProjectWorldState;
  readonly dependency: WorkDependency;
  readonly taskId: string;
}): ProjectWorldBasis {
  const { state, dependency } = input;
  const domains = new Set(dependency.reads.map((selector) => selector.domain));
  const assets = ((): FacetBinding<readonly AssetRevisionBinding[]> => {
    if (!domains.has("asset")) return NOT_REQUIRED as FacetBinding<readonly AssetRevisionBinding[]>;
    if (state.assets.state !== "BOUND") return state.assets;
    const wanted = new Set(
      dependency.reads.flatMap((selector) => (selector.domain === "asset" ? [selector.assetRef] : [])),
    );
    const held = state.assets.value.filter((asset) => wanted.has(asset.assetRef));
    return bound(Object.freeze(held));
  })();
  return materializeProjectWorldBasis({
    projectId: state.projectId,
    taskId: input.taskId,
    capturedAtRevision: state.revision,
    semanticProjectionDigest: state.semanticProjectionDigest,
    source: domains.has("source") ? state.source : (NOT_REQUIRED as FacetBinding<SourceRevisionBinding>),
    assets,
    environment: domains.has("environment") ? state.environment : (NOT_REQUIRED as FacetBinding<EnvironmentBinding>),
  });
}

/**
 * §D3-0.16 — a legacy D2 attempt, mapped WITHOUT manufacturing historical knowledge.
 *
 * A D2 record knows exactly two things: the canonical envelope it was authorized under, and the base
 * commit. It did NOT capture asset or environment dependencies, so those facets become `UNKNOWN` — not
 * `NOT_REQUIRED`. The difference is the whole point: `UNKNOWN` fails closed wherever a decision needs
 * it, so a legacy result can enter D3 and be assessed honestly instead of silently inheriting a
 * compatibility nobody established.
 *
 * The one exception is a work whose schema can PROVE it depended on nothing else; the caller states
 * that explicitly rather than this function guessing it.
 */
export function legacyD2Basis(input: {
  readonly projectId: string;
  readonly taskId: string;
  readonly baseCommit: string;
  readonly semanticProjectionDigest: string;
  readonly capturedAtRevision: number;
  readonly assetsWereProvenNotRequired?: boolean | undefined;
}): ProjectWorldBasis {
  return materializeProjectWorldBasis({
    projectId: input.projectId,
    taskId: input.taskId,
    capturedAtRevision: input.capturedAtRevision,
    semanticProjectionDigest: input.semanticProjectionDigest,
    source: bound({ backend: "git", revision: input.baseCommit }),
    assets:
      input.assetsWereProvenNotRequired === true
        ? (NOT_REQUIRED as FacetBinding<readonly AssetRevisionBinding[]>)
        : unknown("a D2 attempt recorded a base commit only, so whether it depended on assets was never captured"),
    environment: unknown("a D2 attempt never captured an environment revision"),
  });
}

/* ================================================================== *
 * §D3-0.9/§D3-0.10  Exact currentness, and the compatibility vocabulary
 * ================================================================== */

/** The exhaustive answer to "is this basis still exactly what it was?" */
export const BASIS_CURRENTNESS = ["CURRENT", "STALE", "UNKNOWN"] as const;
export type BasisCurrentness = (typeof BASIS_CURRENTNESS)[number];

export interface CurrentnessAssessment {
  readonly currentness: BasisCurrentness;
  /** Which facets decided it, in plain language. Empty when CURRENT. */
  readonly reasons: readonly string[];
}

function sameFacet<T>(left: FacetBinding<T>, right: FacetBinding<T>, encode: (value: T) => unknown): boolean {
  if (left.state !== right.state) return false;
  if (left.state !== "BOUND" || right.state !== "BOUND") return true;
  return canonicalDigest(encode(left.value)) === canonicalDigest(encode(right.value));
}

/**
 * §D3-0.9: `CurrentExact(B_0, W_1) ⟺ π_w(W_1) = B_0`.
 *
 * Only the BOUND facets participate: `NOT_REQUIRED` is knowledge that the facet cannot affect this
 * work, so a change there is not staleness. `UNKNOWN` on either side makes EXACTNESS UNPROVABLE, which
 * is reported as `UNKNOWN` — never as `CURRENT`, and never as the `STALE` that would claim knowledge
 * the system does not have.
 */
export function assessExactCurrentness(input: {
  readonly basis: ProjectWorldBasis;
  readonly current: ProjectWorldState;
}): CurrentnessAssessment {
  const { basis, current } = input;
  const reasons: string[] = [];
  const unprovable: string[] = [];
  /** A PROVEN divergence. Kept separate from `unprovable` so the verdict is a fact, not a wording test. */
  const divergences: string[] = [];

  if (basis.projectId !== current.projectId) {
    return Object.freeze({
      currentness: "STALE" as const,
      reasons: Object.freeze([`the basis belongs to project "${basis.projectId}", not "${current.projectId}"`]),
    });
  }

  if (basis.semanticProjectionDigest !== current.semanticProjectionDigest) {
    const reason = "the work's semantic projection changed (task, work, envelope, policy or obligations)";
    reasons.push(reason);
    divergences.push(reason);
  }

  const facets: readonly {
    readonly name: string;
    readonly held: FacetBinding<unknown>;
    readonly now: FacetBinding<unknown>;
    readonly encode: (value: unknown) => unknown;
  }[] = [
    { name: "source", held: basis.source, now: current.source, encode: (value) => value },
    {
      name: "assets",
      held: basis.assets,
      now: current.assets,
      encode: (value) => [...(value as readonly AssetRevisionBinding[])].sort((a, b) => (a.assetRef < b.assetRef ? -1 : 1)),
    },
    { name: "environment", held: basis.environment, now: current.environment, encode: (value) => value },
  ];

  for (const facet of facets) {
    // NOT_REQUIRED is KNOWLEDGE that this facet cannot affect the work, so it never participates.
    if (facet.held.state === "NOT_REQUIRED") continue;
    if (facet.held.state === "UNKNOWN" || facet.now.state === "UNKNOWN") {
      const reason = `${facet.name}: the basis cannot prove exactness (${facet.held.state === "UNKNOWN" ? "the basis never captured it" : "the current world cannot report it"})`;
      reasons.push(reason);
      unprovable.push(reason);
      continue;
    }
    if (!sameFacet(facet.held, facet.now, facet.encode)) {
      const reason = `${facet.name}: it was bound at a different revision than the current world has`;
      reasons.push(reason);
      divergences.push(reason);
    }
  }

  /**
   * A PROVEN divergence outranks an unprovable facet: if something this work depends on demonstrably
   * moved, the basis is STALE regardless of how much else could not be checked. Only when nothing
   * diverged and something is unprovable is the honest answer UNKNOWN.
   */
  return Object.freeze({
    currentness: divergences.length > 0 ? ("STALE" as const) : unprovable.length > 0 ? ("UNKNOWN" as const) : ("CURRENT" as const),
    reasons: Object.freeze(reasons),
  });
}

/**
 * §D3-0.10 — the four-valued compatibility vocabulary.
 *
 *   EXACT          the current world still resolves the basis identically (`CurrentExact` implies this);
 *   COMPATIBLE     it does NOT, and the changes were PROVEN not to invalidate this result;
 *   INCOMPATIBLE   they were proven to invalidate or conflict with it;
 *   UNKNOWN        neither was proven.
 *
 * Four values rather than a boolean because "no conflict was demonstrated" and "compatibility was
 * demonstrated" are different facts, and collapsing them would make the absence of analysis read as its
 * success:
 *
 *     UNKNOWN ≠ COMPATIBLE
 *
 * §D3-0 implements the VOCABULARY and one conservative default. It implements NO inference: proving
 * compatibility is D3-b's problem, and a stub that guessed would be worse than an honest UNKNOWN.
 */
export const BASIS_COMPATIBILITY = ["EXACT", "COMPATIBLE", "INCOMPATIBLE", "UNKNOWN"] as const;
export type BasisCompatibility = (typeof BASIS_COMPATIBILITY)[number];

export interface CompatibilityAssessment {
  readonly compatibility: BasisCompatibility;
  readonly detail: string;
}

/**
 * The conservative default: `EXACT` when exactness is provable, otherwise `UNKNOWN`. It never returns
 * `COMPATIBLE`, because nothing in D3-0 is entitled to claim it, and never `INCOMPATIBLE`, because
 * reporting a conflict nobody established is its own kind of lie.
 */
export function assessCompatibilityWithoutSolver(input: {
  readonly basis: ProjectWorldBasis;
  readonly current: ProjectWorldState;
}): CompatibilityAssessment {
  const exact = assessExactCurrentness(input);
  return Object.freeze(
    exact.currentness === "CURRENT"
      ? { compatibility: "EXACT" as const, detail: "the current world still resolves every bound dependency identically" }
      : {
          compatibility: "UNKNOWN" as const,
          detail: `compatibility is not assessed in D3-0 (exact currentness is ${exact.currentness}); no inference is attempted, so nothing is claimed`,
        },
  );
}

/* ================================================================== *
 * §D3-0.11  Read/write conflict: write/write disjointness is NOT enough
 * ================================================================== */

export const FOOTPRINT_CONFLICT_KINDS = [
  /** Both results change the same resource: the second would overwrite the first. */
  "write_write",
  /** A result changes a resource the other one DEPENDED on: the reader's output is based on a stale input. */
  "write_read_invalidation",
] as const;
export type FootprintConflictKind = (typeof FOOTPRINT_CONFLICT_KINDS)[number];

export interface FootprintConflict {
  readonly kind: FootprintConflictKind;
  /** The selector the two footprints disagree about. */
  readonly selector: ResourceSelector;
  readonly detail: string;
}

/**
 * Two declared footprints and whether they may both be accepted against one world.
 *
 * Required, for both directions:
 *
 *     W_A ∩ (R_B ∪ W_B) = ∅        and        W_B ∩ (R_A ∪ W_A) = ∅
 *
 * The `R` terms are what write/write disjointness cannot see:
 *
 *     A writes dataset D                     B writes report R
 *     B reads  dataset D                     A reads  nothing (of B's)
 *
 * `W_A ∩ W_B = ∅` holds, and yet B's report was computed from the dataset A replaced: accepting both
 * would admit an output that is already invalid. Modelling reads is the difference between a concurrency
 * rule that works and one that has to be replaced.
 *
 * This function compares DECLARED footprints only. It is a conflict calculus, not a dependency
 * analysis: an undeclared read is invisible here by construction, which is why `WorkDependency` is an
 * input to admission rather than a hint.
 */
export function compareFootprints(
  left: WorkDependency,
  right: WorkDependency,
): readonly FootprintConflict[] {
  const conflicts: FootprintConflict[] = [];
  const byKey = (selectors: readonly ResourceSelector[]): Map<string, ResourceSelector> =>
    new Map(selectors.map((selector) => [resourceSelectorKey(selector), selector]));

  const leftWrites = byKey(left.writes);
  const rightWrites = byKey(right.writes);
  const rightReads = byKey(right.reads);
  const leftReads = byKey(left.reads);

  for (const [key, selector] of leftWrites) {
    if (rightWrites.has(key)) {
      conflicts.push(
        Object.freeze({
          kind: "write_write" as const,
          selector,
          detail: "both results change this resource, so accepting both would make the second overwrite the first",
        }),
      );
    }
  }
  for (const [key, selector] of leftWrites) {
    if (rightReads.has(key)) {
      conflicts.push(
        Object.freeze({
          kind: "write_read_invalidation" as const,
          selector,
          detail: "the left result changes a resource the right result was computed from, so the right result would be based on a superseded input",
        }),
      );
    }
  }
  for (const [key, selector] of rightWrites) {
    if (leftReads.has(key)) {
      conflicts.push(
        Object.freeze({
          kind: "write_read_invalidation" as const,
          selector,
          detail: "the right result changes a resource the left result was computed from, so the left result would be based on a superseded input",
        }),
      );
    }
  }
  return Object.freeze(conflicts);
}

/* ================================================================== *
 * §D3-0.6/§D3-0.7/§D3-0.14  AttemptResult, as facets bound to one basis
 * ================================================================== */

/** The source facet. In the current backend `resultRevision` IS the D2 result commit. */
export interface SourceResultFacet {
  readonly backend: string;
  readonly baseRevision: string;
  readonly resultRevision: string;
}

/**
 * One AUTHORITATIVE output, by canonical reference.
 *
 * §D3-0.7: this is NOT "every file produced during execution". A worker's world fills up with logs,
 * caches, `node_modules/`, screenshots and intermediate binaries; none of them are a result. Listing
 * them would rot the asset graph within one release, so the manifest carries only what the work
 * DECLARED as output — `TaskEnvelope.required_artifacts` today.
 */
export interface ProducedAssetFacet {
  readonly assetRef: string;
  readonly revision: string;
  readonly digest: string;
  readonly assetKind: string;
  readonly mediaType: string | null;
}

/**
 * §D3-0.6/§D3-0.14 — the non-Git-centric result model.
 *
 * The hard invariant is the binding: a result belongs to EXACTLY ONE basis, and that fact — not the
 * bytes — is what any later promotion, transplant, reuse or parallel composition has to reason about.
 *
 *     result R + basis B_0 + current world W_1  →  Compatible(R, B_0, W_1)?
 *
 * which is strictly more information than `merge-base(R, HEAD)` can ever carry.
 *
 * §D3-0.8: `CAS object ≠ Asset ≠ ProjectAssetAssociation ≠ Evidence`. A content-addressed object is
 * bytes identity only; an asset is canonical identity/version; an association is project semantics; this
 * entry is execution provenance. D3-0 implements none of them and fixes only their relation, because
 * collapsing any two of them is a migration nobody can afford later.
 */
export interface AttemptResultFacets {
  readonly schemaVersion: 1;
  readonly attemptId: string;
  readonly taskId: string;
  /** EXACTLY ONE basis. There is no constructible result without one. */
  readonly basisDigest: string;
  /** Absent for a result that produced no canonical source revision (an analysis-only outcome). */
  readonly sourceResult: SourceResultFacet | null;
  readonly producedAssets: readonly ProducedAssetFacet[];
  readonly resultManifestDigest: string;
}

const RESULT_MANIFEST_DOMAIN = "palimpsest.attempt-result-manifest.v1";

export function attemptResultManifestDigest(
  facets: Omit<AttemptResultFacets, "schemaVersion" | "resultManifestDigest">,
): string {
  return canonicalDigest({
    domain: RESULT_MANIFEST_DOMAIN,
    attemptId: facets.attemptId,
    taskId: facets.taskId,
    basisDigest: facets.basisDigest,
    sourceResult: facets.sourceResult,
    producedAssets: [...facets.producedAssets].sort((a, b) => (a.assetRef < b.assetRef ? -1 : a.assetRef > b.assetRef ? 1 : 0)),
  });
}

export function materializeAttemptResultFacets(
  input: Omit<AttemptResultFacets, "schemaVersion" | "resultManifestDigest">,
): AttemptResultFacets {
  const body = {
    schemaVersion: 1 as const,
    ...input,
    producedAssets: Object.freeze(
      [...input.producedAssets].sort((a, b) => (a.assetRef < b.assetRef ? -1 : a.assetRef > b.assetRef ? 1 : 0)),
    ),
  };
  return Object.freeze({ ...body, resultManifestDigest: attemptResultManifestDigest(body) });
}

/**
 * §D3-0.6: the D2 relationship, stated so it is a PROMOTION of the old model rather than a replacement.
 *
 *     resultCommit  →  sourceResult.resultRevision
 *
 * Every D2 fact stays true: the same commit, the same basis commit as `baseRevision`, the same report.
 * What changes is that the result now also carries the basis it was produced from, which is what D3's
 * admission questions need and what a bare commit cannot express.
 */
export function attemptResultFacetsFromD2Attempt(input: {
  readonly attemptId: string;
  readonly taskId: string;
  readonly basis: ProjectWorldBasis;
  readonly resultCommit: string | null;
  readonly producedAssets?: readonly ProducedAssetFacet[] | undefined;
}): AttemptResultFacets {
  const sourceBinding = input.basis.source;
  return materializeAttemptResultFacets({
    attemptId: input.attemptId,
    taskId: input.taskId,
    basisDigest: input.basis.basisDigest,
    sourceResult:
      input.resultCommit === null || sourceBinding.state !== "BOUND"
        ? null
        : {
            backend: sourceBinding.value.backend,
            baseRevision: sourceBinding.value.revision,
            resultRevision: input.resultCommit,
          },
    producedAssets: input.producedAssets ?? [],
  });
}
