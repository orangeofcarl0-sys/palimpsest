/**
 * PLMP-LEAN-1 §D3-b — the compatibility assessor, and the one thing it must never do.
 *
 * The whole slice turns on a single inversion it refuses:
 *
 *     no observed conflict   ≠   proved compatible
 *
 * So the tests are organised around the ways that inversion could sneak back in — an unprovable
 * selector relation, an unproven footprint, a legacy facet nobody captured, a stale witness — and each
 * one must produce `UNKNOWN`, never `COMPATIBLE`.
 *
 * The five facts a `COMPATIBLE` requires, all of which the tests exercise individually:
 *
 *   1. every relevant divergence is known          (change coverage)
 *   2. the change footprint is complete            (for the domains involved)
 *   3. the read footprint has enough coverage
 *   4. the write footprint has enough coverage
 *   5. every change × read/write relation is PROVEN DISJOINT
 *
 * Plus the two structural facts: `COMPATIBLE` carries a WITNESS, and that witness is bound to one
 * target observation.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SELECTOR_RELATIONS,
  relateSelectorToSet,
  relateSelectors,
  type SelectorRelation,
} from "../src/domain/selector_algebra.js";
import { normalizeSourcePath, type ResourceSelector } from "../src/domain/world_basis.js";
import {
  DIRECT_COMPATIBILITY_POLICY_VERSION,
  assessmentStillAppliesTo,
  assessCompatibility,
  covered,
  materializeWorldChangeFootprint,
  noChanges,
  provenComplete,
  resultFootprints,
  sourceChangeFootprintFromPaths,
  unproven,
  wholeRepositoryRead,
  worldChangeFootprintDigest,
  type CoveredFootprint,
  type WorldChangeFootprint,
} from "../src/project_world/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ fixtures */

const srcPath = (path: string): ResourceSelector => ({ domain: "source", scope: "path", path });
const srcSubtree = (prefix: string): ResourceSelector => ({ domain: "source", scope: "subtree", prefix });
const WHOLE_SOURCE: ResourceSelector = { domain: "source", scope: "repository" };
const asset = (assetRef: string): ResourceSelector => ({ domain: "asset", assetRef });

const proven = (detail = "proven complete for the test") => provenComplete("RUNTIME_OBSERVED", detail);

/** A change footprint with nothing in it, whose emptiness is PROVEN. */
function noChange(): WorldChangeFootprint {
  return materializeWorldChangeFootprint({
    projectSemantic: noChanges({ coverage: proven() }),
    source: noChanges({ coverage: proven() }),
    assets: noChanges({ coverage: proven() }),
    environment: noChanges({ coverage: proven() }),
  });
}

function changeWith(input: {
  readonly source?: readonly ResourceSelector[] | undefined;
  readonly assets?: readonly ResourceSelector[] | undefined;
  readonly environment?: readonly ResourceSelector[] | undefined;
  readonly projectSemantic?: readonly ResourceSelector[] | undefined;
  readonly coverage?: CoveredFootprint["coverage"] | undefined;
}): WorldChangeFootprint {
  const part = (selectors: readonly ResourceSelector[] | undefined): CoveredFootprint =>
    covered({ selectors: selectors ?? [], coverage: input.coverage ?? proven() });
  return materializeWorldChangeFootprint({
    projectSemantic: part(input.projectSemantic),
    source: part(input.source),
    assets: part(input.assets),
    environment: part(input.environment),
  });
}

const assess = (input: {
  readonly change: WorldChangeFootprint;
  readonly reads?: CoveredFootprint | undefined;
  readonly writes?: CoveredFootprint | undefined;
  readonly exactlyCurrent?: boolean | undefined;
  readonly unobservedFacets?: readonly string[] | undefined;
}) =>
  assessCompatibility({
    resultManifestDigest: "manifest-1",
    originBasisDigest: "basis-0",
    targetObservationDigest: "target-1",
    exactlyCurrent: input.exactlyCurrent ?? false,
    change: input.change,
    reads: input.reads ?? resultFootprints({ reads: wholeRepositoryRead(), writes: covered({ selectors: [], coverage: proven() }) }).reads,
    writes: input.writes ?? covered({ selectors: [], coverage: proven() }),
    ...(input.unobservedFacets === undefined ? {} : { unobservedFacets: input.unobservedFacets }),
  });

/* ================================================================== *
 * D3-b1 — the selector algebra is three-valued
 * ================================================================== */

describe("§D3-b1 the selector algebra answers DISJOINT / OVERLAP / UNKNOWN", () => {
  it("A. an unprovable relation is UNKNOWN, never a boolean false", () => {
    /**
     * Two environment components with different names. Nothing defines their independence — they may
     * share a libc, a lock file or a container image — so the honest answer is UNKNOWN. A `boolean
     * overlaps()` returning `false` here would become a `COMPATIBLE` downstream.
     */
    const relation = relateSelectors(
      { domain: "environment", component: "compiler" },
      { domain: "environment", component: "python-runtime" },
    );
    expect(relation.relation).toBe("UNKNOWN");
    expect(relation.relation).not.toBe("DISJOINT");
    // The reason names why a name difference is not a proof.
    expect(relation.basis).toContain("independence proof");
  });

  it("different domains are DISJOINT by proof, not by convention", () => {
    expect(relateSelectors(srcPath("src/a.ts"), asset("src/a.ts")).relation).toBe("DISJOINT");
    expect(relateSelectors(srcPath("a"), { domain: "environment", component: "a" }).relation).toBe("DISJOINT");
    expect(relateSelectors({ domain: "project_semantic", aspect: "task" }, srcPath("a")).relation).toBe("DISJOINT");
  });

  it("the whole repository overlaps any source selector — so it can never yield a disjointness proof", () => {
    for (const other of [srcPath("src/a.ts"), srcSubtree("src"), WHOLE_SOURCE]) {
      expect(relateSelectors(WHOLE_SOURCE, other).relation).toBe("OVERLAP");
    }
  });

  it("source path relations are decided by identity and containment", () => {
    expect(relateSelectors(srcPath("src/a.ts"), srcPath("src/a.ts")).relation).toBe("OVERLAP");
    expect(relateSelectors(srcPath("src/a.ts"), srcPath("src/b.ts")).relation).toBe("DISJOINT");
    expect(relateSelectors(srcPath("src/a.ts"), srcSubtree("src")).relation).toBe("OVERLAP");
    expect(relateSelectors(srcPath("src/a.ts"), srcSubtree("docs")).relation).toBe("DISJOINT");
    expect(relateSelectors(srcSubtree("src/parser"), srcSubtree("src")).relation).toBe("OVERLAP");
    expect(relateSelectors(srcSubtree("src"), srcSubtree("docs")).relation).toBe("DISJOINT");
  });

  it("path normalization is separator-agnostic but NOT case-folding", () => {
    expect(normalizeSourcePath("src\\a.ts")).toBe("src/a.ts");
    expect(normalizeSourcePath("./src//a.ts/")).toBe("src/a.ts");
    // Case is preserved: folding it would make two different files look like one resource, which is an
    // over-approximation that could turn a real conflict into a claimed disjointness.
    expect(normalizeSourcePath("Src/A.ts")).toBe("Src/A.ts");
    expect(relateSelectors(srcPath("Src/A.ts"), srcPath("src/a.ts")).relation).toBe("DISJOINT");
  });

  it("asset identity decides: same ref overlaps, different refs are disjoint", () => {
    expect(relateSelectors(asset("A"), asset("A")).relation).toBe("OVERLAP");
    expect(relateSelectors(asset("A"), asset("B")).relation).toBe("DISJOINT");
  });

  it("project semantic aspects are decided by obligation identity", () => {
    expect(relateSelectors({ domain: "project_semantic", aspect: "task" }, { domain: "project_semantic", aspect: "task" }).relation).toBe("OVERLAP");
    expect(relateSelectors({ domain: "project_semantic", aspect: "task" }, { domain: "project_semantic", aspect: "authority_policy" }).relation).toBe("DISJOINT");
  });

  it("the relation is SYMMETRIC — an asymmetric proof would be a false COMPATIBLE in one direction", () => {
    const pairs: readonly (readonly [ResourceSelector, ResourceSelector])[] = [
      [WHOLE_SOURCE, srcPath("a")],
      [srcPath("a"), srcPath("b")],
      [srcSubtree("src"), srcSubtree("docs")],
      [srcPath("src/a.ts"), srcSubtree("src")],
      [asset("A"), asset("B")],
      [{ domain: "environment", component: "x" }, { domain: "environment", component: "y" }],
      [srcPath("a"), asset("a")],
    ];
    for (const [left, right] of pairs) {
      expect(relateSelectors(right, left).relation, `${JSON.stringify(left)} vs ${JSON.stringify(right)}`).toBe(
        relateSelectors(left, right).relation,
      );
    }
  });

  it("a single UNKNOWN poisons a whole set: a set is not a disjunction", () => {
    /**
     * The only genuinely undecidable relation the algebra has is environment-vs-environment with
     * different names, so the SUBJECT must be an environment component for the unknown member to be
     * reachable. (Cross-domain members are DISJOINT by proof and therefore do NOT poison a set.)
     */
    const compiler = { domain: "environment", component: "compiler" } as const;
    const poisoned = relateSelectorToSet(compiler, [
      { domain: "environment", component: "compiler" },
      { domain: "environment", component: "python-runtime" },
    ]);
    // The set contains an OVERLAP member, which is reported first and decisively.
    expect(poisoned.relation).toBe("OVERLAP");

    const unknownMember = relateSelectorToSet(compiler, [
      asset("A"),
      { domain: "environment", component: "python-runtime" },
    ]);
    // Every member except the undecidable one is provably disjoint, and the set is still not disjoint.
    expect(unknownMember.relation).toBe("UNKNOWN");

    const allDisjoint = relateSelectorToSet(compiler, [asset("A"), srcPath("src/c.ts")]);
    expect(allDisjoint.relation).toBe("DISJOINT");
  });

  it("the relation vocabulary is exactly the three values", () => {
    expect([...SELECTOR_RELATIONS]).toEqual(["DISJOINT", "OVERLAP", "UNKNOWN"]);
    const seen = new Set<SelectorRelation>();
    for (const [left, right] of [
      [WHOLE_SOURCE, srcPath("a")],
      [srcPath("a"), srcPath("b")],
      [{ domain: "environment", component: "x" }, { domain: "environment", component: "y" }],
    ] as readonly (readonly [ResourceSelector, ResourceSelector])[]) {
      seen.add(relateSelectors(left, right).relation);
    }
    expect([...seen].sort()).toEqual(["DISJOINT", "OVERLAP", "UNKNOWN"]);
  });
});

/* ================================================================== *
 * D3-b2 — coverage
 * ================================================================== */

describe("§D3-b2 coverage is carried beside the selectors, never inferred from them", () => {
  it("the whole-repository read is PROVEN_COMPLETE by construction, and coarse by consequence", () => {
    const read = wholeRepositoryRead();
    expect(read.coverage.status).toBe("PROVEN_COMPLETE");
    expect(read.coverage.status === "PROVEN_COMPLETE" && read.coverage.evidence).toBe("CONSERVATIVE_DOMAIN");
    expect(read.selectors).toEqual([WHOLE_SOURCE]);
  });

  it("a source diff names paths at PATH granularity with RUNTIME_OBSERVED coverage", () => {
    const footprint = sourceChangeFootprintFromPaths({ paths: ["src/a.ts", "src\\b.ts", ""] });
    expect(footprint.coverage.status === "PROVEN_COMPLETE" && footprint.coverage.evidence).toBe("RUNTIME_OBSERVED");
    // Normalized, empty entries dropped, canonically ordered.
    expect(footprint.selectors.map((selector) => (selector.domain === "source" ? selector.scope : ""))).toEqual(["path", "path"]);
  });

  it("the change footprint digest is order-independent and covers every domain", () => {
    const one = changeWith({ source: [srcPath("src/a.ts"), srcPath("src/b.ts")] });
    const other = changeWith({ source: [srcPath("src/b.ts"), srcPath("src/a.ts")] });
    expect(worldChangeFootprintDigest(other)).toBe(worldChangeFootprintDigest(one));
    // A change in a different domain moves it.
    expect(worldChangeFootprintDigest(changeWith({ assets: [asset("A")] }))).not.toBe(worldChangeFootprintDigest(one));
  });
});

/* ================================================================== *
 * D3-b3 — the assessor, and the inversion it refuses
 * ================================================================== */

describe("§D3-b3 B. an UNPROVEN footprint blocks compatibility", () => {
  it("surface-disjoint selectors are NOT enough: UNPROVEN read coverage ⇒ UNKNOWN", () => {
    /**
     * The case the whole slice exists for. The change touches `src/network.ts`; the result DECLARES it
     * reads only `src/parser.ts`; formally `R ∩ Δ = ∅`. But nothing proved the read set is complete —
     * the worker's world handed it the whole repository — so the conclusion must not be COMPATIBLE.
     */
    const assessment = assess({
      change: changeWith({ source: [srcPath("src/network.ts")] }),
      reads: covered({ selectors: [srcPath("src/parser.ts")], coverage: unproven("the work declared a read scope, and nothing enforced it") }),
      writes: covered({ selectors: [srcPath("src/parser.ts")], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("UNKNOWN");
    expect(assessment.outcome).not.toBe("COMPATIBLE");
    expect(assessment.unknowns.map((entry) => entry.part)).toContain("read_coverage");
  });

  it("an UNPROVEN change set cannot support a proof about what it does NOT touch", () => {
    const assessment = assess({
      change: changeWith({ source: [srcPath("src/network.ts")], coverage: unproven("a filtered diff was used") }),
      reads: covered({ selectors: [srcPath("src/parser.ts")], coverage: proven() }),
      writes: covered({ selectors: [], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("UNKNOWN");
    expect(assessment.unknowns.map((entry) => entry.part)).toContain("change_coverage");
  });

  it("an undecidable selector relation ⇒ UNKNOWN, even with complete coverage on both sides", () => {
    const assessment = assess({
      change: changeWith({ environment: [{ domain: "environment", component: "python-runtime" }] }),
      reads: covered({ selectors: [{ domain: "environment", component: "compiler" }], coverage: proven() }),
      writes: covered({ selectors: [], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("UNKNOWN");
    expect(assessment.unknowns.map((entry) => entry.part)).toContain("selector_relation");
  });
});

describe("§D3-b3 C. the first positive compatibility witness", () => {
  it("proven-complete coverage + proven-disjoint relations ⇒ COMPATIBLE, with the proofs attached", () => {
    const assessment = assess({
      change: changeWith({ source: [srcPath("src/c.ts")] }),
      reads: covered({ selectors: [srcPath("src/a.ts")], coverage: proven("a sandbox enforced the read set") }),
      writes: covered({ selectors: [srcPath("src/b.ts")], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("COMPATIBLE");
    expect(assessment.conflicts).toEqual([]);
    expect(assessment.unknowns).toEqual([]);
    // The witness carries the PROOFS, not just a verdict.
    expect(assessment.disjointnessProofs.length).toBe(2);
    expect(assessment.disjointnessProofs.map((proof) => proof.side).sort()).toEqual(["read", "write"]);
    for (const proof of assessment.disjointnessProofs) {
      expect(proof.change).toEqual(srcPath("src/c.ts"));
      expect(proof.basis).toContain("proven disjoint");
    }
    expect(assessment.policyVersion).toBe(DIRECT_COMPATIBILITY_POLICY_VERSION);
  });

  it("a whole-repository read can NEVER produce COMPATIBLE against a source change — by design", () => {
    const assessment = assess({
      change: changeWith({ source: [srcPath("src/c.ts")] }),
      reads: wholeRepositoryRead(),
      writes: covered({ selectors: [], coverage: proven() }),
    });
    // Not UNKNOWN (the coverage IS proven) and not COMPATIBLE (the read genuinely overlaps).
    expect(assessment.outcome).toBe("INCOMPATIBLE");
    expect(assessment.conflicts.map((entry) => entry.side)).toEqual(["read"]);
    expect(assessment.conflicts[0]?.kind).toBe("read_invalidation");
  });

  it("a change in an unrelated domain is compatible with a proven source-only result", () => {
    const assessment = assess({
      change: changeWith({ assets: [asset("A")] }),
      reads: covered({ selectors: [srcPath("src/a.ts")], coverage: proven() }),
      writes: covered({ selectors: [srcPath("src/b.ts")], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("COMPATIBLE");
  });
});

describe("§D3-b3 D/E/F. the conflict witnesses", () => {
  it("D. a change to a resource the result READ is a read-invalidation", () => {
    const assessment = assess({
      change: changeWith({ source: [srcPath("src/a.ts")] }),
      reads: covered({ selectors: [srcPath("src/a.ts")], coverage: proven() }),
      writes: covered({ selectors: [], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("INCOMPATIBLE");
    expect(assessment.conflicts[0]?.kind).toBe("read_invalidation");
    expect(assessment.conflicts[0]?.side).toBe("read");
  });

  it("E. a change to a resource the result WRITES is a write collision", () => {
    const assessment = assess({
      change: changeWith({ source: [srcPath("src/b.ts")] }),
      reads: covered({ selectors: [], coverage: proven() }),
      writes: covered({ selectors: [srcPath("src/b.ts")], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("INCOMPATIBLE");
    expect(assessment.conflicts[0]?.kind).toBe("write_collision");
    expect(assessment.conflicts[0]?.side).toBe("write");
  });

  it("F. write-disjointness is NOT sufficient: a writer invalidating a reader is INCOMPATIBLE", () => {
    /**
     * The classic counterexample, kept as a standing test so a future simplification cannot reduce the
     * model to write/write disjointness:
     *
     *     R writes report      Δ writes dataset
     *     R reads  dataset
     *
     * `W_R ∩ Δ = ∅` holds, and the result is still unsafe: the report was computed from the dataset the
     * change replaced.
     */
    const assessment = assess({
      change: changeWith({ assets: [asset("dataset")] }),
      reads: covered({ selectors: [asset("dataset")], coverage: proven() }),
      writes: covered({ selectors: [asset("report")], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("INCOMPATIBLE");
    expect(assessment.conflicts.map((entry) => entry.kind)).toEqual(["read_invalidation"]);

    // The naive write-only test, stated explicitly, and it passes — which is the point.
    const writes = new Set([asset("report")]);
    expect([asset("dataset")].filter((selector) => writes.has(selector))).toEqual([]);
  });

  it("a conflict is reported even when other parts of the assessment are unknown", () => {
    // A proven conflict is a POSITIVE fact: it does not become UNKNOWN because another facet was
    // unprovable. Reporting UNKNOWN here would hide a known interference behind an unknown.
    const assessment = assess({
      change: changeWith({ source: [srcPath("src/a.ts")], coverage: unproven("partial diff") }),
      reads: covered({ selectors: [srcPath("src/a.ts")], coverage: unproven("declared only") }),
      writes: covered({ selectors: [], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("INCOMPATIBLE");
    expect(assessment.conflicts.length).toBeGreaterThan(0);
  });
});

describe("§D3-b3 G/H. legacy facets and the exact short-circuit", () => {
  it("G. a legacy facet nobody captured blocks COMPATIBLE, even with perfect coverage elsewhere", () => {
    const assessment = assess({
      change: changeWith({ source: [srcPath("src/c.ts")] }),
      reads: covered({ selectors: [srcPath("src/a.ts")], coverage: proven() }),
      writes: covered({ selectors: [srcPath("src/b.ts")], coverage: proven() }),
      unobservedFacets: ["assets"],
    });
    expect(assessment.outcome).toBe("UNKNOWN");
    expect(assessment.outcome).not.toBe("COMPATIBLE");
    expect(assessment.unknowns.map((entry) => entry.part)).toContain("unobserved_facet");
  });

  it("H. an exactly-current basis reports EXACT — never downgraded to COMPATIBLE", () => {
    const assessment = assess({
      change: noChange(),
      exactlyCurrent: true,
      reads: covered({ selectors: [srcPath("src/a.ts")], coverage: proven() }),
      writes: covered({ selectors: [srcPath("src/b.ts")], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("EXACT");
    expect(assessment.outcome).not.toBe("COMPATIBLE");
  });

  it("an empty PROVEN change set is compatible with anything covered — nothing moved", () => {
    const assessment = assess({
      change: noChange(),
      reads: covered({ selectors: [srcPath("src/a.ts")], coverage: proven() }),
      writes: covered({ selectors: [srcPath("src/b.ts")], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("COMPATIBLE");
  });
});

describe("§D3-b3 I/J. the witness is bound, and assessment is pure", () => {
  it("I. a witness for one target observation does NOT authorize another", () => {
    const assessment = assess({
      change: changeWith({ source: [srcPath("src/c.ts")] }),
      reads: covered({ selectors: [srcPath("src/a.ts")], coverage: proven() }),
      writes: covered({ selectors: [], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("COMPATIBLE");

    const sameTarget = assessmentStillAppliesTo({
      assessment,
      resultManifestDigest: "manifest-1",
      originBasisDigest: "basis-0",
      targetObservationDigest: "target-1",
    });
    expect(sameTarget.applies).toBe(true);

    // The world moved: the SAME assessment must not authorize the new target.
    const moved = assessmentStillAppliesTo({
      assessment,
      resultManifestDigest: "manifest-1",
      originBasisDigest: "basis-0",
      targetObservationDigest: "target-2",
    });
    expect(moved.applies).toBe(false);
    expect(moved.detail).toContain("the world has moved");

    // A different result or origin basis is likewise not covered by this witness.
    expect(assessmentStillAppliesTo({ assessment, resultManifestDigest: "other", originBasisDigest: "basis-0", targetObservationDigest: "target-1" }).applies).toBe(false);
    expect(assessmentStillAppliesTo({ assessment, resultManifestDigest: "manifest-1", originBasisDigest: "basis-9", targetObservationDigest: "target-1" }).applies).toBe(false);
  });

  it("the assessment digest is deterministic, and moves with the change set", () => {
    const input = {
      change: changeWith({ source: [srcPath("src/c.ts")] }),
      reads: covered({ selectors: [srcPath("src/a.ts")], coverage: proven() }),
      writes: covered({ selectors: [], coverage: proven() }),
    };
    const first = assess(input);
    const second = assess(input);
    expect(second.assessmentDigest).toBe(first.assessmentDigest);
    expect(second).toEqual(first);

    const otherChange = assess({ ...input, change: changeWith({ source: [srcPath("src/d.ts")] }) });
    expect(otherChange.assessmentDigest).not.toBe(first.assessmentDigest);
  });

  it("J. assessing is PURE: no store, no filesystem, no clock", () => {
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/compatibility.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    for (const forbidden of ["node:fs", "node:sqlite", "DatabaseSync", "writeFileSync", "execFileSync", "new Date("]) {
      expect(text, `compatibility.ts must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });
});

/* ================================================================== *
 * The OUT list, as a machine check
 * ================================================================== */

describe("§D3-b scope: assessment only", () => {
  it("no merge, transplant, promotion, scheduler or semantic inference appears anywhere", () => {
    const read = (relative: string): string =>
      execFileSync(process.execPath, ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`], {
        encoding: "utf8",
      }).replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const file of [
      "src/project_world/compatibility.ts",
      "src/project_world/footprint.ts",
      "src/domain/selector_algebra.ts",
    ]) {
      const text = read(file);
      for (const forbidden of [
        "cherry-pick",
        "mergeBase",
        "threeWay",
        "rebase",
        "transplant",
        "applyResult",
        "promoteAttempt",
        "assessPromotionEligibility",
        "ATTEMPT_COMPLETED",
        "recordCallback",
        // No LLM/semantic plausibility: nothing here reads content or names to guess compatibility.
        "readFileSync",
        "llmJudge",
        "plausib",
      ]) {
        expect(text, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("the assessor never reads file CONTENT — a change is paths and identities, not bytes", () => {
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/compatibility.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    // It may name a path (that IS the resource identity) but must never open, read or diff one.
    expect(text).not.toContain("createReadStream");
    expect(text).not.toContain("git diff");
    expect(text).not.toContain("--name-status");
  });
});

/* ================================================================== *
 * Two properties the composition proof forced into the design
 * ================================================================== */

describe("§D3-b3 a proof is only a proof when its own coverage is proven", () => {
  it("no disjointness proof is recorded for a dependency whose coverage is UNPROVEN", () => {
    /**
     * Measured while building the packaged composition test. Relating a change to a DECLARED-but-
     * unenforced read set produces a formally disjoint answer — `src/parser.ts` vs `src/network.ts` —
     * and that answer is NOT a proof, because the set may simply be incomplete.
     *
     * Recording it as a proof would let a consumer cherry-pick it out of an UNKNOWN assessment and read
     * it as compatibility. So the assessment carries the obstacle and NO proof, and a caller cannot
     * mistake the absence of a conflict for a demonstration of one.
     */
    const assessment = assess({
      change: changeWith({ source: [srcPath("src/network.ts")] }),
      reads: covered({ selectors: [srcPath("src/parser.ts")], coverage: unproven("declared only") }),
      writes: covered({ selectors: [], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("UNKNOWN");
    expect(assessment.disjointnessProofs).toEqual([]);
  });

  it("but a genuine CONFLICT is still reported under unproven coverage — a fact is not diluted", () => {
    // The mirror of the rule above: coverage gaps suppress PROOFS, never WITNESSES.
    const assessment = assess({
      change: changeWith({ source: [srcPath("src/parser.ts")] }),
      reads: covered({ selectors: [srcPath("src/parser.ts")], coverage: unproven("declared only") }),
      writes: covered({ selectors: [], coverage: proven() }),
    });
    expect(assessment.outcome).toBe("INCOMPATIBLE");
    expect(assessment.conflicts.length).toBe(1);
    expect(assessment.conflicts[0]?.kind).toBe("read_invalidation");
  });
});
