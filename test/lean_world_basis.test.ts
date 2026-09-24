/**
 * PLMP-LEAN-1 §D3-0 — the world-basis / resource-domain semantic foundation, as machine proofs.
 *
 * This slice adds NO mechanism (no transplant, no rebase, no merge policy, no compatibility solver, no
 * CAS, no scheduler). So the tests cannot demonstrate behaviour — they must demonstrate that the
 * VOCABULARY refuses the four collapses D3 would otherwise inherit, and that the refusals survive the
 * cases that are easy to get wrong:
 *
 *   Basis immutability            a frozen basis digests stably and order-independently
 *   Irrelevant global revision    a ProjectIR revision bump alone must NOT make work stale
 *   Asset invalidation            source unchanged + a BOUND asset moved ⇒ NOT exact   ← the core test
 *   Explicit nondependency        NOT_REQUIRED assets ⇒ an asset move must NOT cost exactness
 *   Unknown is not proof          UNKNOWN must never read as COMPATIBLE
 *   Read/write conflict           W_A ∩ W_B = ∅ must NOT be sufficient for concurrency safety
 *   Result basis binding          identical bytes from different bases are not interchangeable
 *
 * The asset-invalidation case is the one that proves the model actually left the Git-centric world: it
 * is a change with NO source movement at all.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");
/** Comments are stripped for the boundary checks: the module's own doc NAMES what it refuses to do. */
const code = (relative: string): string => {
  const withoutBlocks = read(relative).replace(/\/\*[\s\S]*?\*\//gu, "");
  return withoutBlocks
    .split(String.fromCharCode(10))
    .map((line) => {
      const at = line.indexOf("//");
      return at < 0 ? line : line.slice(0, at);
    })
    .join(String.fromCharCode(10));
};

import {
  NOT_REQUIRED,
  assessCompatibilityWithoutSolver,
  assessExactCurrentness,
  attemptResultFacetsFromD2Attempt,
  attemptResultManifestDigest,
  bound,
  canonicallyOrderedSelectors,
  compareFootprints,
  legacyD2Basis,
  materializeAttemptResultFacets,
  materializeProjectWorldBasis,
  materializeWorkDependency,
  projectWorldBasisDigest,
  resolveWorkBasis,
  resourceSelectorKey,
  unknown,
  type AssetRevisionBinding,
  type ProjectWorldBasis,
  type ProjectWorldState,
  type ProducedAssetFacet,
  type ResourceSelector,
  type WorkDependency,
} from "../src/domain/world_basis.js";

/* ------------------------------------------------------------------ fixtures */

const SRC_SELECTOR: ResourceSelector = { domain: "source", scope: "repository" };
const ASSET_SELECTOR = (assetRef: string): ResourceSelector => ({ domain: "asset", assetRef });

const SOURCE_AT = (revision: string) => bound({ backend: "git", revision });
const ASSETS_AT = (entries: readonly (readonly [string, string])[]) =>
  bound(Object.freeze(entries.map(([assetRef, revision]) => ({ assetRef, revision }))));

function world(overrides: Partial<ProjectWorldState> = {}): ProjectWorldState {
  return Object.freeze({
    projectId: "p",
    revision: 41,
    semanticProjectionDigest: "sem-1",
    source: SOURCE_AT("H0"),
    assets: NOT_REQUIRED as ProjectWorldState["assets"],
    environment: NOT_REQUIRED as ProjectWorldState["environment"],
    ...overrides,
  });
}

/**
 * A basis for a work whose declared reads are `reads`, resolved against `state` — i.e. the real
 * constructor, so the tests exercise the resolution rule rather than assembling a basis by hand.
 */
function basisFor(state: ProjectWorldState, reads: readonly ResourceSelector[], taskId = "t1"): ProjectWorldBasis {
  return resolveWorkBasis({ state, dependency: materializeWorkDependency({ reads, writes: [] }), taskId });
}

/* ================================================================== *
 * Basis immutability
 * ================================================================== */

describe("§D3-0 basis immutability and canonical form", () => {
  it("the digest is stable across repeated materialization of the same facets", () => {
    const state = world({ assets: ASSETS_AT([["A", "A3"]]) });
    const first = basisFor(state, [SRC_SELECTOR, ASSET_SELECTOR("A")]);
    const second = basisFor(state, [SRC_SELECTOR, ASSET_SELECTOR("A")]);
    expect(second.basisDigest).toBe(first.basisDigest);
    expect(second).toEqual(first);
  });

  it("the digest does not depend on the ORDER the resolver emitted assets in", () => {
    const ascending = materializeProjectWorldBasis({
      projectId: "p",
      taskId: "t1",
      capturedAtRevision: 41,
      semanticProjectionDigest: "sem-1",
      source: SOURCE_AT("H0"),
      assets: ASSETS_AT([
        ["A", "A3"],
        ["B", "B1"],
      ]),
      environment: NOT_REQUIRED,
    });
    const descending = materializeProjectWorldBasis({
      projectId: "p",
      taskId: "t1",
      capturedAtRevision: 41,
      semanticProjectionDigest: "sem-1",
      source: SOURCE_AT("H0"),
      assets: ASSETS_AT([
        ["B", "B1"],
        ["A", "A3"],
      ]),
      environment: NOT_REQUIRED,
    });
    expect(descending.basisDigest).toBe(ascending.basisDigest);
    // …and the stored value is canonical, so equality is not merely a digest coincidence.
    expect(descending.assets).toEqual(ascending.assets);
  });

  it("`capturedAtRevision` is provenance and is EXCLUDED from the digest", () => {
    const state = world();
    const at41 = { ...basisFor(state, [SRC_SELECTOR]) };
    const alaterCapture = materializeProjectWorldBasis({
      projectId: at41.projectId,
      taskId: at41.taskId,
      capturedAtRevision: 999,
      semanticProjectionDigest: at41.semanticProjectionDigest,
      source: at41.source,
      assets: at41.assets,
      environment: at41.environment,
    });
    // Same semantics ⇒ same digest, even though the record says it was taken at another revision.
    expect(alaterCapture.basisDigest).toBe(at41.basisDigest);
    expect(alaterCapture.capturedAtRevision).toBe(999);
    // The digest really is computed over the semantic body — recomputing it by hand agrees.
    const { basisDigest, ...body } = alaterCapture;
    expect(basisDigest).toBe(projectWorldBasisDigest(body));
  });

  it("two works' bases are NOT interchangeable even when they resolve identically", () => {
    const state = world();
    const one = basisFor(state, [SRC_SELECTOR], "t1");
    const other = basisFor(state, [SRC_SELECTOR], "t2");
    expect(other.source).toEqual(one.source);
    expect(other.basisDigest).not.toBe(one.basisDigest);
  });
});

/* ================================================================== *
 * Rule 3 — a global revision change is not a staleness reason
 * ================================================================== */

describe("§D3-0 rule 3: an irrelevant global revision change does not make work stale", () => {
  it("a ProjectIR revision bump that changes nothing this work reads stays EXACTLY current", () => {
    const basis = basisFor(world({ revision: 41 }), [SRC_SELECTOR]);
    const later = world({ revision: 42 }); // another task added a note; nothing this work reads moved
    const assessment = assessExactCurrentness({ basis, current: later });
    expect(assessment.currentness).toBe("CURRENT");
    expect(assessment.reasons).toEqual([]);
  });

  it("but a change to the work's OWN semantic projection is staleness", () => {
    const basis = basisFor(world(), [SRC_SELECTOR]);
    const assessment = assessExactCurrentness({
      basis,
      current: world({ semanticProjectionDigest: "sem-2" }),
    });
    expect(assessment.currentness).toBe("STALE");
    expect(assessment.reasons.join(" ")).toContain("semantic projection");
  });
});

/* ================================================================== *
 * The core test: the model has left the Git-centric world
 * ================================================================== */

describe("§D3-0 asset invalidation: a change with NO source movement", () => {
  it("source unchanged + a BOUND asset moved ⇒ NOT exact (and therefore not COMPATIBLE-by-default)", () => {
    const held = basisFor(world({ source: SOURCE_AT("H0"), assets: ASSETS_AT([["A", "A3"]]) }), [
      SRC_SELECTOR,
      ASSET_SELECTOR("A"),
    ]);
    // The source is IDENTICAL — this is the case a HEAD-equality model cannot represent at all.
    const now = world({ source: SOURCE_AT("H0"), assets: ASSETS_AT([["A", "A4"]]) });

    const assessment = assessExactCurrentness({ basis: held, current: now });
    expect(assessment.currentness).toBe("STALE");
    expect(assessment.reasons.join(" ")).toContain("assets");

    // And nothing entitles D3-0 to call that compatible.
    expect(assessCompatibilityWithoutSolver({ basis: held, current: now }).compatibility).toBe("UNKNOWN");
  });

  it("the reverse: source MOVED while the only asset this work reads did not ⇒ still exactly current", () => {
    // A work that reads asset A and no source at all. `source` is therefore NOT_REQUIRED for it, so a
    // source move is not its staleness — the mirror of the case above.
    const held = basisFor(world({ source: SOURCE_AT("H0"), assets: ASSETS_AT([["A", "A3"]]) }), [ASSET_SELECTOR("A")]);
    expect(held.source.state).toBe("NOT_REQUIRED");
    const assessment = assessExactCurrentness({
      basis: held,
      current: world({ source: SOURCE_AT("H9"), assets: ASSETS_AT([["A", "A3"]]) }),
    });
    expect(assessment.currentness).toBe("CURRENT");
  });
});

/* ================================================================== *
 * Explicit nondependency
 * ================================================================== */

describe("§D3-0 explicit nondependency is knowledge, not an omission", () => {
  it("a work that declares no asset read keeps exact currentness when assets move", () => {
    const held = basisFor(world({ assets: ASSETS_AT([["A", "A3"]]) }), [SRC_SELECTOR]);
    // The projection recorded the KNOWLEDGE that this work does not depend on assets.
    expect(held.assets.state).toBe("NOT_REQUIRED");
    const assessment = assessExactCurrentness({
      basis: held,
      current: world({ assets: ASSETS_AT([["A", "A4"]]) }),
    });
    expect(assessment.currentness).toBe("CURRENT");
  });

  it("NOT_REQUIRED and UNKNOWN are DIFFERENT states, and produce different answers", () => {
    const state = world({ assets: ASSETS_AT([["A", "A4"]]) });
    const notRequired = basisFor(state, [SRC_SELECTOR]);
    const unknownBasis = materializeProjectWorldBasis({
      projectId: "p",
      taskId: "t1",
      capturedAtRevision: 41,
      semanticProjectionDigest: "sem-1",
      source: SOURCE_AT("H0"),
      assets: unknown("never captured"),
      environment: NOT_REQUIRED,
    });
    expect(notRequired.assets.state).toBe("NOT_REQUIRED");
    expect(unknownBasis.assets.state).toBe("UNKNOWN");
    // Same world: knowledge says CURRENT, ignorance says it cannot say. That difference is the point.
    expect(assessExactCurrentness({ basis: notRequired, current: state }).currentness).toBe("CURRENT");
    expect(assessExactCurrentness({ basis: unknownBasis, current: state }).currentness).toBe("UNKNOWN");
  });
});

/* ================================================================== *
 * UNKNOWN is not proof
 * ================================================================== */

describe("§D3-0 UNKNOWN never reads as compatibility", () => {
  it("an UNKNOWN facet makes exactness unprovable and compatibility UNKNOWN — never COMPATIBLE", () => {
    const held = materializeProjectWorldBasis({
      projectId: "p",
      taskId: "t1",
      capturedAtRevision: 41,
      semanticProjectionDigest: "sem-1",
      source: SOURCE_AT("H0"),
      assets: unknown("the deployment could not report asset revisions"),
      environment: NOT_REQUIRED,
    });
    const assessment = assessExactCurrentness({ basis: held, current: world() });
    expect(assessment.currentness).toBe("UNKNOWN");
    expect(assessment.reasons.join(" ")).toContain("cannot prove exactness");
    const compatibility = assessCompatibilityWithoutSolver({ basis: held, current: world() });
    expect(compatibility.compatibility).toBe("UNKNOWN");
    expect(compatibility.compatibility).not.toBe("COMPATIBLE");
  });

  it("a legacy D2 basis reports UNKNOWN for what it never captured, and NOT_REQUIRED for nothing", () => {
    const legacy = legacyD2Basis({
      projectId: "p",
      taskId: "t1",
      baseCommit: "H0",
      semanticProjectionDigest: "sem-1",
      capturedAtRevision: 41,
    });
    expect(legacy.source).toEqual(SOURCE_AT("H0"));
    // The two facets D2 never observed are UNKNOWN — NOT the "we know it does not matter" claim.
    expect(legacy.assets.state).toBe("UNKNOWN");
    expect(legacy.environment.state).toBe("UNKNOWN");
    expect(assessExactCurrentness({ basis: legacy, current: world() }).currentness).toBe("UNKNOWN");
  });

  it("a PROVEN divergence outranks an unprovable facet: demonstration beats ignorance", () => {
    // The semantic projection is demonstrably different AND the assets were never captured. STALE is
    // the fact; UNKNOWN would be a weaker claim than the evidence supports.
    const held = materializeProjectWorldBasis({
      projectId: "p",
      taskId: "t1",
      capturedAtRevision: 41,
      semanticProjectionDigest: "sem-1",
      source: SOURCE_AT("H0"),
      assets: unknown("never captured"),
      environment: NOT_REQUIRED,
    });
    const assessment = assessExactCurrentness({
      basis: held,
      current: world({ semanticProjectionDigest: "sem-2" }),
    });
    expect(assessment.currentness).toBe("STALE");
    // Both reasons are reported, so a reader sees what was proven and what could not be checked.
    expect(assessment.reasons.join(" ")).toContain("semantic projection");
    expect(assessment.reasons.join(" ")).toContain("cannot prove exactness");
  });

  it("a legacy basis may only claim NOT_REQUIRED when something PROVED it", () => {
    const proven = legacyD2Basis({
      projectId: "p",
      taskId: "t1",
      baseCommit: "H0",
      semanticProjectionDigest: "sem-1",
      capturedAtRevision: 41,
      assetsWereProvenNotRequired: true,
    });
    expect(proven.assets.state).toBe("NOT_REQUIRED");
    // …and the environment stays UNKNOWN, because that proof said nothing about it.
    expect(proven.environment.state).toBe("UNKNOWN");
  });
});

/* ================================================================== *
 * Rule 4 — write/write disjointness is not sufficient
 * ================================================================== */

describe("§D3-0 rule 4: concurrency needs read/write reasoning", () => {
  it("disjoint WRITE sets are not enough: a writer invalidates a reader", () => {
    const dataset: ResourceSelector = ASSET_SELECTOR("dataset");
    const report: ResourceSelector = ASSET_SELECTOR("report");
    const workerA: WorkDependency = materializeWorkDependency({ reads: [], writes: [dataset] });
    const workerB: WorkDependency = materializeWorkDependency({ reads: [dataset], writes: [report] });

    // The naive test, and it passes: nothing is written twice.
    const aWrites = new Set(workerA.writes.map(resourceSelectorKey));
    const bWrites = new Set(workerB.writes.map(resourceSelectorKey));
    const writeWriteOverlap = [...aWrites].filter((key) => bWrites.has(key));
    expect(writeWriteOverlap).toEqual([]);

    // And yet they must not be accepted together: B's report was computed from the dataset A replaced.
    const conflicts = compareFootprints(workerA, workerB);
    expect(conflicts.map((entry) => entry.kind)).toEqual(["write_read_invalidation"]);
    expect(conflicts[0]?.selector).toEqual(dataset);
    // The relation is symmetric — the same pair, analysed from the other side, is equally unsafe.
    expect(compareFootprints(workerB, workerA).map((entry) => entry.kind)).toEqual(["write_read_invalidation"]);
  });

  it("a genuine write/write overlap is reported as such", () => {
    const shared: ResourceSelector = ASSET_SELECTOR("shared");
    const conflicts = compareFootprints(
      materializeWorkDependency({ writes: [shared] }),
      materializeWorkDependency({ writes: [shared] }),
    );
    expect(conflicts.map((entry) => entry.kind)).toEqual(["write_write"]);
  });

  it("two footprints that touch nothing in common report no conflict", () => {
    const conflicts = compareFootprints(
      materializeWorkDependency({ reads: [SRC_SELECTOR], writes: [ASSET_SELECTOR("x")] }),
      materializeWorkDependency({ reads: [ASSET_SELECTOR("y")], writes: [ASSET_SELECTOR("z")] }),
    );
    expect(conflicts).toEqual([]);
  });

  it("read/read sharing is not a conflict", () => {
    const conflicts = compareFootprints(
      materializeWorkDependency({ reads: [SRC_SELECTOR] }),
      materializeWorkDependency({ reads: [SRC_SELECTOR] }),
    );
    expect(conflicts).toEqual([]);
  });
});

/* ================================================================== *
 * The typed resource domain
 * ================================================================== */

describe("§D3-0 the resource domain is typed, not a path list", () => {
  it("every selector domain is distinguishable and canonically orderable", () => {
    const selectors: readonly ResourceSelector[] = [
      SRC_SELECTOR,
      ASSET_SELECTOR("A"),
      { domain: "environment", component: "node-24" },
      { domain: "project_semantic", aspect: "envelope" },
    ];
    const ordered = canonicallyOrderedSelectors([...selectors].reverse());
    expect(ordered.map(resourceSelectorKey)).toEqual([
      "asset:A",
      "environment:node-24",
      "project_semantic:envelope",
      "source:repository",
    ]);
    // De-duplicated: the same selector twice is one dependency.
    expect(canonicallyOrderedSelectors([SRC_SELECTOR, SRC_SELECTOR])).toHaveLength(1);
  });

  it("a source selector and an asset selector with the same spelling are DIFFERENT resources", () => {
    expect(resourceSelectorKey({ domain: "source", scope: "repository" })).not.toBe(
      resourceSelectorKey({ domain: "asset", assetRef: "repository" }),
    );
  });
});

/* ================================================================== *
 * Result facets bound to one basis
 * ================================================================== */

describe("§D3-0 rule 2: a result is bound to exactly one basis", () => {
  const asset: ProducedAssetFacet = {
    assetRef: "out/report.md",
    revision: "1",
    digest: "d".repeat(64),
    assetKind: "document",
    mediaType: "text/markdown",
  };

  it("two results with identical bytes from DIFFERENT bases are not interchangeable", () => {
    const baseA = basisFor(world({ source: SOURCE_AT("H0") }), [SRC_SELECTOR]);
    const baseB = basisFor(world({ source: SOURCE_AT("H1") }), [SRC_SELECTOR]);
    expect(baseA.basisDigest).not.toBe(baseB.basisDigest);

    // Same attempt shape, same produced asset, same source result revision — only the basis differs.
    const shared = { attemptId: "a1", taskId: "t1", sourceResult: { backend: "git", baseRevision: "H0", resultRevision: "R" }, producedAssets: [asset] };
    const fromA = materializeAttemptResultFacets({ ...shared, basisDigest: baseA.basisDigest });
    const fromB = materializeAttemptResultFacets({ ...shared, basisDigest: baseB.basisDigest });

    // The manifest digests DIFFER, because the basis is part of what the result IS.
    expect(fromB.resultManifestDigest).not.toBe(fromA.resultManifestDigest);
    // And each is recomputable by hand, so the digest is over the manifest rather than around it.
    const { resultManifestDigest, ...body } = fromA;
    expect(resultManifestDigest).toBe(attemptResultManifestDigest(body));
  });

  it("the produced-asset list is canonical: order does not move the manifest digest", () => {
    const basis = basisFor(world(), [SRC_SELECTOR]);
    const one = materializeAttemptResultFacets({
      attemptId: "a1",
      taskId: "t1",
      basisDigest: basis.basisDigest,
      sourceResult: null,
      producedAssets: [asset, { ...asset, assetRef: "aaa-first.md" }],
    });
    const other = materializeAttemptResultFacets({
      attemptId: "a1",
      taskId: "t1",
      basisDigest: basis.basisDigest,
      sourceResult: null,
      producedAssets: [{ ...asset, assetRef: "aaa-first.md" }, asset],
    });
    expect(other.resultManifestDigest).toBe(one.resultManifestDigest);
    expect(other.producedAssets.map((entry) => entry.assetRef)).toEqual(["aaa-first.md", "out/report.md"]);
  });

  it("the D2 mapping PROMOTES resultCommit to sourceResult.resultRevision and keeps every D2 fact", () => {
    const basis = basisFor(world({ source: SOURCE_AT("H0") }), [SRC_SELECTOR]);
    const facets = attemptResultFacetsFromD2Attempt({
      attemptId: "attempt-1",
      taskId: "t1",
      basis,
      resultCommit: "R",
    });
    expect(facets.sourceResult).toEqual({ backend: "git", baseRevision: "H0", resultRevision: "R" });
    expect(facets.basisDigest).toBe(basis.basisDigest);
    // No assets is NOT the same claim as "assets are not required" — the manifest simply lists none.
    expect(facets.producedAssets).toEqual([]);
  });

  it("a result with no source revision is legal, and says so explicitly", () => {
    const basis = basisFor(world(), [SRC_SELECTOR]);
    const facets = attemptResultFacetsFromD2Attempt({
      attemptId: "attempt-1",
      taskId: "t1",
      basis,
      resultCommit: null,
    });
    expect(facets.sourceResult).toBe(null);
  });
});

/* ================================================================== *
 * The OUT list, as a machine check
 * ================================================================== */

describe("§D3-0 scope: the foundation implements NO mechanism", () => {
  it("the module contains none of the OUT-list mechanisms (concatenation, three-way merge, rebase, solver)", () => {
    const text = code("src/domain/world_basis.ts");
    /**
     * D3-0 is a semantic-base closure. If it starts containing the MECHANISM, the slice got ahead of
     * itself — and a transplant written before the vocabulary is frozen is exactly the "increasingly
     * complex patches around Git HEAD" this ordering exists to avoid.
     */
    for (const forbidden of [
      "cherry-pick",
      "cherryPick",
      "mergeBase",
      "merge-base",
      "threeWay",
      "three-way",
      "rebase",
      "transplant",
      "reconcile",
      // No compatibility INFERENCE: the vocabulary is here, the solver is D3-b.
      "inferCompatibility",
      "proveCompatible",
      // No storage of any kind: bytes identity is a separate plane (§D3-0.8).
      "createHash",
      "writeFileSync",
      "DatabaseSync",
    ]) {
      expect(text, `world_basis.ts must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("the module imports exactly ONE thing: the canonical digest", () => {
    const imports = [...code("src/domain/world_basis.ts").matchAll(/^import .*from "([^"]+)";$/gmu)].map((match) => match[1]);
    expect(imports).toEqual(["../schema/canonical.js"]);
  });

  it("it is NOT re-exported from the domain barrel, so no public API name is added", () => {
    // The public surface is sealed: an added export fails parity. The D3-0 vocabulary is internal for
    // now, and this asserts the placement rather than trusting it.
    expect(read("src/domain/index.ts")).not.toContain("world_basis");
  });
});

/* ================================================================== *
 * The architectural rule the D2 live gate earned
 * ================================================================== */

describe("§D3-0 rule 5: a capability claim comes from the composed system, not from configuration", () => {
  it("the composition derives the verification capability from what it COMPOSED", () => {
    /**
     * The D2 live gate measured the failure this rule forbids: a capability derived from how the
     * deployment was CONFIGURED ("was a verification store passed in?") said `false` on a deployment
     * that then composed a real, executable, independent attempt-result verifier — so the product
     * refused work it could actually do. The fix bound the capability where the runtime is composed.
     *
     * D3 will add source backends, asset materializers, compatibility assessors and a transplant
     * engine, and each one will face the same temptation. The rule is asserted here so it is a standing
     * constraint rather than a lesson that has to be relearned.
     */
    const composition = read("src/composition/governance.ts");
    // The capability is BOUND by the cluster that composes the runtime…
    expect(composition).toMatch(/verificationCapabilities\.bind\(/u);
    // …and derived from the executable definitions, not from an option being present.
    expect(composition).toMatch(/executableVerifierDefinitions\s*\.some\(|independentVerifierFor\(/u);
    // The controller reads the late-bound value rather than a value computed at construction time.
    const core = read("src/composition/core.ts");
    expect(core).toMatch(/verificationCapabilities: \{/u);
    // And `install.ts` does NOT pre-compute the capability from option presence any more.
    const install = read("src/install.ts");
    expect(install).not.toMatch(/independentVerifierAvailable:\s*options\.projectVerificationStore\s*!==\s*undefined/u);
  });
});
