/**
 * R3-SPEC §1/§18 — DETERMINISTIC CONTRACT TESTS.
 *
 * Two load-bearing protections:
 *
 *   §1  THE EVIDENCE-CHAIN CLOSURE. Every one of the 20 R2-V sources re-judged by R2-VR must reproduce its
 *       recorded total from its STORED bytes, with the digests recorded. If a stored source ever diverged
 *       from what the R2-V matrix judged, this fails.
 *
 *   §18 THE FACTORIAL RULE. A combined-treatment contrast must never be read as a component marginal
 *       effect. The test asserts this on a synthetic factorial where the combined contrast and the marginal
 *       effect genuinely differ, so an analysis that reintroduces the R2-V error fails here rather than
 *       passing review.
 *
 * Nothing here asserts what a utility result must be; these are structural protections, not measurements.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildClosure } from "../scripts/r3spec/evidence-closure.mjs";
import { factorialContrasts } from "../scripts/r2vr/factorial.mjs";
import { correctedAnalysis, loadR2VRaw } from "../scripts/r2vr/reanalyse.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/* ================================================================ §1 the evidence-chain closure */

describe("R3-SPEC §1 — the R2-VR evidence-chain closure", () => {
  const closurePath = join(REPO_ROOT, "research-evidence", "r3-spec", "r2vr-source-closure.json");
  const closure = existsSync(closurePath) ? JSON.parse(readFileSync(closurePath, "utf8")) : null;

  it("records all 20 sources with the six required fields", () => {
    expect(closure).not.toBeNull();
    expect(closure.sourcesRejudged).toBe(20);
    expect(closure.sourcesMissing).toEqual([]);
    for (const source of closure.sources) {
      expect(source.trialId).toMatch(/^D-V[0-3]-b\dr\d$/u);
      expect(source.finalSourceSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(source.acceptanceModuleSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(source.perCaseVectorDigest).toMatch(/^[0-9a-f]{64}$/u);
      expect(typeof source.recordedTotal).toBe("number");
      expect(typeof source.rejudgedTotal).toBe("number");
    }
  });

  it("§1 requires recordedTotal == rejudgedTotal for all 20", () => {
    expect(closure.allTotalsMatch).toBe(true);
    for (const source of closure.sources) expect(source.recordedTotal).toBe(source.rejudgedTotal);
  });

  it("the acceptance-module digest is the SAME for every source (one frozen oracle)", () => {
    const digests = new Set(closure.sources.map((source: any) => source.acceptanceModuleSha256));
    expect(digests.size).toBe(1);
    expect(closure.acceptanceModuleSha256).toBe([...digests][0]);
  });

  it("§1 reports no missing source and does not reconstruct any from the outcome", () => {
    expect(closure.limitation).toBeNull();
    expect(closure.method).toMatch(/no worker ran/iu);
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3spec", "evidence-closure.mjs"), "utf8");
    expect(source).toMatch(/NOT reconstructed from the outcome/u);
  });

  it("mechanically confirms h14 is the sole varying case and no other case ever fails", () => {
    const vectors = new Map<string, number>();
    for (const source of closure.sources) vectors.set(source.perCaseVectorDigest, (vectors.get(source.perCaseVectorDigest) ?? 0) + 1);
    /** Exactly two distinct outcome vectors: all-pass, and h14-fails. */
    expect(vectors.size).toBe(2);
    const h14Passes = closure.sources.filter((source: any) => source.perCaseVector.find((entry: any) => entry.caseId === "h14").pass).length;
    expect(h14Passes).toBe(14);
    const nonH14Failures = closure.sources.flatMap((source: any) => source.perCaseVector.filter((entry: any) => entry.caseId !== "h14" && !entry.pass));
    expect(nonH14Failures).toEqual([]);
  });

  it("the recorded per-case digest is reproducible from the recorded vector", () => {
    for (const source of closure.sources) {
      const order = source.perCaseVector.map((entry: any) => entry.caseId).join(",");
      const vector = source.perCaseVector.map((entry: any) => (entry.pass ? 1 : 0)).join("");
      const recomputed = createHash("sha256").update(`${order}|${vector}`, "utf8").digest("hex");
      expect(recomputed).toBe(source.perCaseVectorDigest);
    }
  });

  it("re-runs the closure live and reproduces the recorded totals", async () => {
    const live = await buildClosure();
    expect(live.sourcesRejudged).toBe(20);
    expect(live.allTotalsMatch).toBe(true);
    const recorded = new Map(closure.sources.map((source: any) => [source.trialId, source.finalSourceSha256]));
    for (const source of live.sources) expect(source.finalSourceSha256).toBe(recorded.get(source.trialId));
  }, 120000);
});

/* ================================================================ §1 the h14 erratum */

describe("R3-SPEC §1 — the h14 description erratum", () => {
  const erratum = JSON.parse(readFileSync(join(REPO_ROOT, "research-evidence", "r3-spec", "r2vr-closure-erratum.json"), "utf8"));

  it("records that the malformed field is missing `value`, not `deps`", () => {
    expect(erratum.h14DescriptionErratum.theMalformedField).toMatch(/missing `value`, not missing `deps`/u);
    expect(erratum.h14DescriptionErratum.acceptanceBytesChanged).toBe(false);
  });

  it("the frozen h14 bytes really do carry a deps array", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r2u", "fixtures", "scenario-d", "acceptance.mjs"), "utf8");
    const line = source.split("\n").find((entry) => entry.includes('id: "h14"'));
    expect(line).toBeDefined();
    expect(line).toContain("broken: { deps: [] }");
  });

  it("the reference rejects for the missing `value`, before its deps check", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r2u", "fixtures", "scenario-d", "acceptance.mjs"), "utf8");
    const valueCheck = source.indexOf('Object.hasOwn(entry, "value")');
    const depsCheck = source.indexOf("Array.isArray(entry.deps)");
    expect(valueCheck).toBeGreaterThan(-1);
    expect(depsCheck).toBeGreaterThan(-1);
    expect(valueCheck).toBeLessThan(depsCheck);
  });
});

/* ================================================================ §2 the frozen ruling */

describe("R3-SPEC §2 — the frozen R2-VR ruling", () => {
  const ruling = JSON.parse(readFileSync(join(REPO_ROOT, "research-evidence", "r3-spec", "frozen-ruling.json"), "utf8"));

  it("freezes CLOSED / INCONCLUSIVE and does not reopen the trials", () => {
    expect(ruling.ruling.R2VR_REANALYSIS).toBe("CLOSED");
    expect(ruling.ruling.UTILITY_CALIBRATION).toBe("INCONCLUSIVE");
    expect(ruling.reopenedStochasticTrials).toBe(false);
  });
});

/* ================================================================ §18 the factorial rule */

describe("R3-SPEC §18 — a combined contrast is never a component marginal effect", () => {
  const trial = (solved: boolean) => ({ finalAcceptanceSolved: solved, firstCandidateSolved: solved, knownFailureRecurred: false });
  const armOf = (solved: number, n = 5) => [...Array.from({ length: solved }, () => trial(true)), ...Array.from({ length: n - solved }, () => trial(false))];

  it("the protecting test FAILS an analysis that reads V3-V0 as B's marginal effect", () => {
    /** A factorial where the combined contrast and the marginal effect genuinely differ. */
    const byArm = { V0: armOf(1), V1: armOf(4), V2: armOf(1), V3: armOf(2) };
    const contrast = factorialContrasts(byArm, "finalAcceptanceSolved");

    const combinedContrast = 2 / 5 - 1 / 5; // V3 - V0 = +0.20
    const bMarginal = (4 / 5 - 1 / 5 + (2 / 5 - 1 / 5)) / 2; // mean[(V1-V0), (V3-V2)] = +0.40

    /** The two are NOT equal here, so an analysis that conflates them is detectably wrong. */
    expect(combinedContrast).not.toBeCloseTo(bMarginal, 6);
    expect(contrast.bMainEffect).toBeCloseTo(bMarginal, 6);
    expect(contrast.bMainEffect).not.toBeCloseTo(combinedContrast, 6);
  });

  it("the four conditional contrasts are computed, not the two combined ones", () => {
    const contrast = factorialContrasts({ V0: armOf(1), V1: armOf(4), V2: armOf(1), V3: armOf(2) }, "finalAcceptanceSolved");
    expect(contrast.conditional.bGivenCAbsent.value).toBeCloseTo(3 / 5, 6);
    expect(contrast.conditional.bGivenCPresent.value).toBeCloseTo(1 / 5, 6);
    expect(contrast.conditional.cGivenBAbsent.value).toBeCloseTo(0, 6);
    expect(contrast.conditional.cGivenBPresent.value).toBeCloseTo(-2 / 5, 6);
    expect(contrast.bMainEffect).toBeCloseTo((3 / 5 + 1 / 5) / 2, 6);
    expect(contrast.cMainEffect).toBeCloseTo((0 + -2 / 5) / 2, 6);
    expect(contrast.interaction).toBeCloseTo(2 / 5 - 1 / 5 - 4 / 5 + 1 / 5, 6);
  });

  it("the interaction is the difference-of-differences, and additive worlds give zero", () => {
    const additive = factorialContrasts({ V0: armOf(1), V1: armOf(2), V2: armOf(2), V3: armOf(3) }, "finalAcceptanceSolved");
    expect(additive.interaction).toBe(0);
    const interacting = factorialContrasts({ V0: armOf(1), V1: armOf(4), V2: armOf(1), V3: armOf(2) }, "finalAcceptanceSolved");
    expect(interacting.interaction).not.toBe(0);
    expect(interacting.interactionLabel).toBe("DESCRIPTIVE_INTERACTION_PATTERN");
  });

  it("§18 the real R2-VR analysis obeys the rule: main effects are means, not the combined contrast", () => {
    const analysis = correctedAnalysis(loadR2VRaw());
    const contrast = analysis.contrasts.finalAcceptanceSolved;
    const v3minusV0 = contrast.cells.V3.rate - contrast.cells.V0.rate;
    const meanOfConditionals = (contrast.conditional.bGivenCAbsent.value + contrast.conditional.bGivenCPresent.value) / 2;
    expect(contrast.bMainEffect).toBeCloseTo(meanOfConditionals, 6);
    /** On the real data these coincide because the conditional contrasts are exact opposites. */
    expect(contrast.bMainEffect).toBeCloseTo(0, 6);
    void v3minusV0;
  });
});

/* ================================================================ §25 the required documents */

describe("R3-SPEC §25 — the five required documents exist", () => {
  for (const name of ["R3-GENERALIZATION-BENCHMARK-SPEC.md", "BENCHMARK-QUALIFICATION-CONTRACT.md", "R3-FACTOR-MATRIX.md", "R3-CLAIM-LADDER.md", "R3-EXECUTION-READINESS.md"]) {
    it(`docs/engineering/${name} exists and is substantive`, () => {
      const path = join(REPO_ROOT, "docs", "engineering", name);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8").length).toBeGreaterThan(1500);
    });
  }
});

/* ================================================================ §6/§22 the frozen laws */

describe("R3-SPEC §6/§22 — the frozen laws are stated", () => {
  const spec = readFileSync(join(REPO_ROOT, "docs", "engineering", "R3-GENERALIZATION-BENCHMARK-SPEC.md"), "utf8");
  const ladder = readFileSync(join(REPO_ROOT, "docs", "engineering", "R3-CLAIM-LADDER.md"), "utf8");

  it("§4 the anti-overfit law is frozen with both processes named", () => {
    expect(spec).toContain("Benchmark Qualification ≠ Benchmark Tuning");
    expect(spec).toMatch(/Forbidden process/iu);
    expect(spec).toMatch(/Allowed process/iu);
  });

  it("§6 the minimum task-family count is stated", () => {
    expect(spec).toMatch(/minimum:\s+2 genuinely different task families/u);
  });

  it("§23 the no-universal-skill law is frozen", () => {
    expect(spec).toMatch(/does not imply general reusable superiority/u);
    expect(ladder).toMatch(/does not imply general reusable superiority/u);
  });

  it("§22 the claim ladder is pre-declared from G0 to G4", () => {
    for (const level of ["G0", "G1", "G2", "G3", "G4"]) expect(ladder).toContain(level);
    expect(ladder).toMatch(/may claim \*\*only the highest level actually tested\*\*/u);
  });
});
