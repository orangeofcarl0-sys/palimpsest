/**
 * SR-2 §十四/§十五/§十六 — the WORLD / RESULT / CONTINUATION namespace boundaries, as proofs.
 *
 *     Continuation is not part of OCC.        Result ≠ World.
 *
 * SR-2c is a NAMESPACE slice: it moves two things to the layers that own them and removes the
 * barrel edges that made the World kernel look like the owner of both.
 *
 *   §十四  D5-a's calculus (`assessContinuation`) moves from `src/project_world/` to
 *         `src/continuation/assessment.ts`. It CONSUMES World conclusions; it is not World OCC.
 *   §十五  Result identity/derivation/candidate storage/rematerialization move from
 *         `src/project_world/` to `src/result/`. World Consistency JUDGES a result's relation to
 *         the world; it does not OWN the result.
 *   §十六  the World barrel stops re-exporting a consumer: a broad barrel is public surface, not
 *         an internal service locator, and an L2 kernel naming an L3 consumer is an upward edge.
 *
 * These proofs assert the BOUNDARIES and the invariants the moves must not disturb. The D3/D5
 * suites (repointed to the new paths, unchanged in substance) continue to prove the behaviour.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyseModuleArchitecture, layerOf } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

/* ================================================================== *
 * §十四 — the assessment belongs to the continuation layer
 * ================================================================== */

describe("SR-2 §十四 the continuation assessment lives with continuation", () => {
  it("src/continuation/assessment.ts exists, is L3, and the old path is gone", () => {
    const decision = layerOf("src/continuation/assessment.ts");
    expect(decision.layer).toBe("L3");
    // The old module is DELETED, not left as a second copy.
    const architecture = analyseModuleArchitecture(REPO);
    expect(architecture.modules.find((module) => module.file === "src/project_world/continuation.ts")).toBeUndefined();
  });

  it("it still declares the same public vocabulary — the move renamed no concept", () => {
    const source = read("src/continuation/assessment.ts");
    for (const symbol of [
      "assessContinuation",
      "continuationStillAppliesTo",
      "CONTINUATION_CURRENTNESS",
      "CONTINUATION_COMPATIBILITY_INPUTS",
      "ContinuationAssessment",
      "ContinuationFacts",
      "ContinuationCapabilities",
    ]) {
      expect(source, `the moved module must still declare ${symbol}`).toContain(symbol);
    }
    // And the digest domain is UNCHANGED: a module move must not rename a digest domain (§三).
    expect(source).toContain("palimpsest.result-continuation-assessment.v1");
  });

  it("the dependency direction is now DOWNWARD: L3 assessment → L2 world", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const node = architecture.modules.find((module) => module.file === "src/continuation/assessment.ts")!;
    // It reads the World kernel, which is allowed (L3 → L2), and the World kernel no longer
    // reaches back up into it.
    expect(node.layer).toBe("L3");
    const worldImports = node.imports.filter((file) => file.startsWith("src/project_world/"));
    expect(worldImports.length).toBeGreaterThan(0);
    const backEdge = architecture.forbiddenImports.filter(
      (edge) => edge.from.startsWith("src/project_world/") && edge.to.startsWith("src/continuation/"),
    );
    expect(backEdge).toEqual([]);
  });
});

/* ================================================================== *
 * §十五 — result is its own capability
 * ================================================================== */

describe("SR-2 §十五 result identity and derivation are their own capability", () => {
  it("the four result modules live under src/result at L2, and their old paths are gone", () => {
    const architecture = analyseModuleArchitecture(REPO);
    for (const file of [
      "src/result/subject.ts",
      "src/result/derivation.ts",
      "src/result/candidate_store.ts",
      "src/result/rematerialization.ts",
    ]) {
      const node = architecture.modules.find((module) => module.file === file);
      expect(node, `${file} must exist`).toBeDefined();
      expect(node!.layer, `${file} must be L2`).toBe("L2");
    }
    for (const gone of [
      "src/project_world/result_resolution.ts",
      "src/project_world/derivation.ts",
      "src/project_world/candidate_store.ts",
      "src/project_world/rematerialization.ts",
    ]) {
      expect(architecture.modules.find((module) => module.file === gone), `${gone} must be gone`).toBeUndefined();
    }
  });

  it("the World kernel no longer names a result concept it does not judge", () => {
    /**
     * §十五's claim in one assertion: `project_world` keeps BASIS/FOOTPRINT/COMPATIBILITY/
     * OBSERVATION/ISSUANCE/ADMISSION — the things that JUDGE a result's relation to the world — and
     * no longer owns the result's identity, derivation, candidate storage or the carry effect.
     */
    const architecture = analyseModuleArchitecture(REPO);
    const worldFiles = architecture.modules
      .filter((module) => module.file.startsWith("src/project_world/") && module.file !== "src/project_world/index.ts")
      .map((module) => module.file);
    expect(worldFiles.length).toBeGreaterThan(0);
    /**
     * The kernel's own modules may NAME a result — an admission record must say WHICH result it is
     * about, and that reference is the boundary working rather than a leak. What they must not do
     * is own the result's IDENTITY, DERIVATION, CANDIDATE STORAGE or CARRY EFFECT. So the
     * assertion is about which result modules are reached, not about whether any is.
     */
    const ownedConcepts = ["src/result/derivation.ts", "src/result/candidate_store.ts", "src/result/rematerialization.ts"];
    for (const file of worldFiles) {
      const node = architecture.modules.find((module) => module.file === file)!;
      const owned = node.imports.filter((target) => ownedConcepts.includes(target));
      expect(owned, `${file} must not own derivation, candidate storage or the carry effect`).toEqual([]);
    }
    // The ONE permitted reference is the subject identity, and only where a record must name it.
    const subjectReferrers = worldFiles.filter((file) => {
      const node = architecture.modules.find((module) => module.file === file)!;
      return node.imports.includes("src/result/subject.ts");
    });
    expect(subjectReferrers.sort()).toEqual(["src/project_world/admission_store.ts"]);
  });

  it("the result digest domains are UNCHANGED by the move (§三)", () => {
    // A module move must never rename a digest domain: identities are history, not layout.
    for (const [file, domain] of [
      ["src/result/subject.ts", "palimpsest.result-subject-ref.v1"],
      ["src/result/derivation.ts", "palimpsest.result-derivation.v1"],
    ] as const) {
      expect(read(file), `${file} must keep its domain`).toContain(domain);
    }
  });
});

/* ================================================================== *
 * §十六 — no barrel back-edge, and no internal code uses the barrel as a locator
 * ================================================================== */

describe("SR-2 §十六 the World barrel is public surface, not a service locator", () => {
  it("the World barrel does not re-export a continuation symbol", () => {
    const barrel = read("src/project_world/index.ts");
    // The removed re-export is GONE — an L2 barrel naming an L3 consumer is an upward edge.
    expect(barrel).not.toContain("../continuation/assessment.js");
    expect(barrel).not.toContain("assessContinuation");
    expect(barrel).not.toContain("continuationStillAppliesTo");
  });

  it("no live module imports the assessment through the World barrel", () => {
    // Consumers import it from its owner; the barrel is not an internal locator.
    const architecture = analyseModuleArchitecture(REPO);
    const offenders: string[] = [];
    for (const module of architecture.modules) {
      if (module.file === "src/project_world/index.ts") continue;
      const source = read(module.file);
      if (source.includes('from "../project_world/index.js"') && source.includes("assessContinuation")) {
        offenders.push(module.file);
      }
      if (source.includes('from "../../src/project_world/index.js"') && source.includes("assessContinuation")) {
        offenders.push(module.file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the continuation service reaches NO project_world module at all any more", () => {
    // The SR-2a wall, tightened by §十四: the calculus is now a sibling.
    const architecture = analyseModuleArchitecture(REPO);
    const node = architecture.modules.find((module) => module.file === "src/continuation/service.ts")!;
    expect(node.imports.filter((file) => file.startsWith("src/project_world/"))).toEqual([]);
  });
});

/* ================================================================== *
 * The behavioural invariants the moves must not disturb
 * ================================================================== */

describe("SR-2 §十四 the assessment's own invariants are untouched by the move", () => {
  it("the calculus still refuses to infer compatibility from currentness alone", () => {
    const source = read("src/continuation/assessment.ts");
    // The distinctions the module exists for are all still spelled out.
    for (const distinction of ["INCOMPATIBLE", "UNKNOWN", "NOT_ASSESSED", "EXACT", "moreCouldHelp"]) {
      expect(source, `the calculus must still distinguish ${distinction}`).toContain(distinction);
    }
    // And it is still PURE: no I/O, no store, no clock.
    for (const forbidden of ["DatabaseSync", "new Date(", "readFileSync", "execFileSync"]) {
      expect(source, `the calculus must stay pure (${forbidden})`).not.toContain(forbidden);
    }
  });

  it("the assessment is a pure function over facts, and its inputs are unchanged", () => {
    const source = read("src/continuation/assessment.ts");
    expect(source).toContain("export function assessContinuation(facts: ContinuationFacts)");
    // The one read-shape it consumes from the World kernel is the outcome vocabulary.
    expect(source).toContain("CompatibilityOutcome");
    expect(source).toContain("ResultSubjectRef");
  });
});
