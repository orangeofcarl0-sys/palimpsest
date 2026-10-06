/**
 * R3-A0 §2/§4/§6/§8/§10/§12/§16/§17 — DETERMINISTIC QUALIFICATION-CONTRACT TESTS.
 *
 * These test the CONTRACT, not the product, and they encode no expected utility result: the pair verdicts on
 * the real fixtures are a measurement, and they are asserted here only as the frozen record of what was
 * measured. The load-bearing tests are the structural protections — the ones that would let a fixture be
 * smuggled past the gate if they regressed:
 *
 *   · §2.2 the bounds require room in BOTH directions and the semantics are not inverted;
 *   · §2.2/§12 a near-ceiling pair with one unrelated varying class is REJECTED (the R2-V shape);
 *   · §2.3 two dimensions with identical observed series collapse to one;
 *   · §2.4 every failure class carries a declared capital relationship;
 *   · §4/§6 the fixtures are structurally distinct and their H0 has headroom rather than a floor;
 *   · §8 the model axis has ≥2 materially distinct families and no two sizes of one family;
 *   · §10 the baseline harness delivers NO capital;
 *   · §16 the three verdicts are exactly the allowed set, with no "almost qualified";
 *   · §17 the A→B gate needs the L-shaped bridge and counts only COMPLIANT fixtures.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CAPITAL_ITEMS, CAPITAL_RELATIONSHIPS, TRANSFER_HYPOTHESES, directClasses } from "../scripts/r3a/capital.mjs";
import { FIXTURE_SPECS } from "../scripts/r3a/fixture-content.mjs";
import { COMMON_RENDERER, MODEL_ROUTES, distinctFamilies, verifiedRoutes } from "../scripts/r3a/models.mjs";
import { MIN_CLASS_HEADROOM, PAIR_VERDICTS, QUALIFICATION_BOUNDS, aToBGate, nonRedundantDimensions, qualifyPair } from "../scripts/r3a/qualification.mjs";
import { ANTI_OVERFIT_PROCESSES } from "../scripts/r3a/fixture-manifest.mjs";
import { classIdsOf } from "../scripts/r3a/analyse.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EVIDENCE = join(REPO_ROOT, "research-evidence", "r3-a");
const analysis = existsSync(join(EVIDENCE, "qualification-analysis.json")) ? JSON.parse(readFileSync(join(EVIDENCE, "qualification-analysis.json"), "utf8")) : null;

/* ================================================================ §2 the contract */

describe("R3-A0 §2 — the qualification contract v0.1", () => {
  it("§2.2 the bounds require room in BOTH directions and are strictly ordered", () => {
    expect(QUALIFICATION_BOUNDS.roomRequiredInBothDirections).toBe(true);
    expect(QUALIFICATION_BOUNDS.lower).toBeGreaterThan(0);
    expect(QUALIFICATION_BOUNDS.upper).toBeLessThan(1);
    expect(QUALIFICATION_BOUNDS.lower).toBeLessThan(QUALIFICATION_BOUNDS.upper);
    expect(QUALIFICATION_BOUNDS.lower).toBe(0.2);
    expect(QUALIFICATION_BOUNDS.upper).toBe(0.85);
  });

  it("§2.2 the floor/ceiling semantics are recorded CORRECTLY, not inverted", () => {
    expect(QUALIFICATION_BOUNDS.floorMeaning).toBe("no room to detect harm");
    expect(QUALIFICATION_BOUNDS.ceilingMeaning).toBe("no room to detect help");
  });

  it("§2.2 Nq and the class-headroom minimum are frozen", () => {
    expect(MIN_CLASS_HEADROOM.Nq).toBe(5);
    expect(MIN_CLASS_HEADROOM.minVaryingDirectClasses).toBe(2);
  });

  it("§16 the allowed verdicts are exactly three, with no 'almost qualified'", () => {
    expect(Object.values(PAIR_VERDICTS)).toEqual(["QUALIFIED", "UNQUALIFIED", "INFRASTRUCTURE_INVALID"]);
  });
});

/* ================================================================ §12/§16 the pair verdicts */

describe("R3-A0 §12/§16 — the pair verdict logic", () => {
  const ids = ["FA1", "FA2", "FA3", "FA4", "FA5", "FA6"];
  const PRECONDITION_OK = { mechanicalOracleProven: true, allHiddenCasesDeclareFailureClass: true, allDeclaredClassesAreExercised: true, oracleUsesNoModelSelfReport: true };
  const pair = (trials: any[], overrides: Record<string, unknown> = {}) => qualifyPair({ fixtureId: "f", modelId: "m", nq: 5, classIds: ids, directClasses: ids, relationshipOf: () => "DIRECT", fixtureAuditPrecondition: PRECONDITION_OK, trials, ...overrides });

  it("§12 rejects the R2-V shape: near-ceiling coverage with ONE unrelated varying class", () => {
    const trials = Array.from({ length: 5 }, (_, index) => ({ classPass: { FA1: true, FA2: true, FA3: true, FA4: true, FA5: true, FA6: index === 0 }, fullSolve: index !== 0 }));
    const verdict = pair(trials, { directClasses: ["FA2"] });
    expect(verdict.verdict).toBe(PAIR_VERDICTS.UNQUALIFIED);
    expect(verdict.reasons.join(" ")).toMatch(/QC-1|QC-4|QC-5/u);
  });

  it("§12 rejects a FLOOR pair (coverage below the lower bound)", () => {
    const trials = Array.from({ length: 5 }, () => ({ classPass: { FA1: false, FA2: false, FA3: false, FA4: false, FA5: false, FA6: true }, fullSolve: false }));
    const verdict = pair(trials);
    expect(verdict.verdict).toBe(PAIR_VERDICTS.UNQUALIFIED);
    expect(verdict.reasons.join(" ")).toMatch(/QC-1.*FLOOR/u);
  });

  it("§12 qualifies a pair with ≥2 varying DIRECT classes and real aggregate variance", () => {
    const trials = [
      { classPass: { FA1: false, FA2: false, FA3: false, FA4: true, FA5: true, FA6: true }, fullSolve: false },
      { classPass: { FA1: true, FA2: false, FA3: false, FA4: true, FA5: true, FA6: true }, fullSolve: false },
      { classPass: { FA1: false, FA2: true, FA3: false, FA4: true, FA5: true, FA6: true }, fullSolve: false },
      { classPass: { FA1: false, FA2: false, FA3: true, FA4: false, FA5: true, FA6: true }, fullSolve: false },
      { classPass: { FA1: true, FA2: true, FA3: true, FA4: false, FA5: true, FA6: true }, fullSolve: true },
    ];
    expect(pair(trials).verdict).toBe(PAIR_VERDICTS.QUALIFIED);
  });

  it("§16 too many infrastructure-invalid runs yields INFRASTRUCTURE_INVALID, never UNQUALIFIED", () => {
    const valid = Array.from({ length: 5 }, () => ({ classPass: { FA1: true, FA2: true, FA3: true, FA4: true, FA5: true, FA6: true }, fullSolve: true }));
    const verdict = pair([...valid.slice(0, 3), { classPass: {}, infrastructureInvalid: true }, { classPass: {}, infrastructureInvalid: true }]);
    expect(verdict.verdict).toBe(PAIR_VERDICTS.INFRASTRUCTURE_INVALID);
  });
});

/* ================================================================ §2.3 redundancy */

describe("R3-A0 §2.3 — redundant dimensions collapse by observation", () => {
  it("two dimensions with identical series form ONE redundant group", () => {
    const vectors = [{ a: 1, b: 1 }, { a: 0, b: 0 }, { a: 1, b: 1 }];
    const groups = nonRedundantDimensions(vectors, ["a", "b"]);
    expect(groups.length).toBe(1);
    expect(groups[0]!.redundant).toBe(true);
    expect(groups[0]!.dimensions).toEqual(["a", "b"]);
  });

  it("two dimensions that differ stay separate", () => {
    const vectors = [{ a: 1, b: 1 }, { a: 0, b: 1 }, { a: 1, b: 0 }];
    expect(nonRedundantDimensions(vectors, ["a", "b"]).length).toBe(2);
  });
});

/* ================================================================ §4/§6 the fixtures */

describe("R3-A0 §4/§6 — the frozen fixture families", () => {
  it("at least two structurally distinct mechanism families exist", () => {
    expect(FIXTURE_SPECS.length).toBeGreaterThanOrEqual(2);
    expect(new Set(FIXTURE_SPECS.map((spec) => spec.mechanismFamily)).size).toBe(FIXTURE_SPECS.length);
  });

  it("each fixture declares failure classes that its own acceptance module exercises", () => {
    for (const spec of FIXTURE_SPECS) {
      const classIds = classIdsOf(spec);
      expect(classIds.length).toBeGreaterThan(0);
      for (const classId of classIds) expect(spec.files["acceptance.mjs"]).toContain(`failureClass: "${classId}"`);
    }
  });

  it("each fixture's H0 is not a complete solution (it must have headroom)", () => {
    for (const spec of FIXTURE_SPECS) {
      /** The audit record carries the H0 result; a full-solve H0 would mean a ceiling fixture. */
      const audit = JSON.parse(readFileSync(join(EVIDENCE, "fixture-audit.json"), "utf8"));
      const entry = audit.fixtures.find((fixture: any) => fixture.fixtureId === spec.fixtureId);
      expect(entry.h0.passed).toBeLessThan(entry.h0.total);
      expect(entry.h0.passed).toBeGreaterThan(0);
    }
  });

  it("§6 the two families fail in structurally different ways", async () => {
    const fa = FIXTURE_SPECS.find((spec) => spec.fixtureId.includes("f-a"))!;
    const fb = FIXTURE_SPECS.find((spec) => spec.fixtureId.includes("f-b"))!;
    /**
     * Behaviour, not prose: F-A's H0 leaves MUTATED STATE BEHIND (it applies as it walks); F-B's H0 leaves
     * the input UNTOUCHED but DISCARDS unknown fields. Prose would be defeated by a docstring, so both H0s
     * are run.
     */
    const os = await import("node:os");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(os.homedir(), ".palimpsest-r3a", "contract-check");
    fs.rmSync(dir, { recursive: true, force: true });

    const faDir = path.join(dir, "fa");
    fs.mkdirSync(path.join(faDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(faDir, "src", "ledger.mjs"), fa.files["src/ledger.mjs"]!, "utf8");
    const faModule = await import(new URL(`file:///${path.join(faDir, "src", "ledger.mjs").split(path.sep).join("/")}`).href);
    const storeA = { accounts: { a: { balance: 10 }, b: { balance: 5 } }, applied: {} };
    const beforeA = JSON.stringify(storeA);
    try {
      faModule.applyTransaction(storeA, { id: "t", operations: [{ kind: "credit", account: "a", amount: 1 }, { kind: "credit", account: "ghost", amount: 1 }] });
    } catch { /* expected: the H0 throws on the unknown account, but only AFTER mutating */ }
    /** F-A's characteristic failure: the store moved even though the transaction failed. */
    expect(JSON.stringify(storeA)).not.toBe(beforeA);

    const fbDir = path.join(dir, "fb");
    fs.mkdirSync(path.join(fbDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(fbDir, "src", "config.mjs"), fb.files["src/config.mjs"]!, "utf8");
    const fbModule = await import(new URL(`file:///${path.join(fbDir, "src", "config.mjs").split(path.sep).join("/")}`).href);
    const inputB = { version: 1, retry_count: 1, featureFlag: true };
    const beforeB = JSON.stringify(inputB);
    const outB = fbModule.migrateDocument(inputB);
    /** F-B's characteristic failure: the input is UNTOUCHED, but the unknown field is GONE from the output. */
    expect(JSON.stringify(inputB)).toBe(beforeB);
    expect(outB.featureFlag).toBeUndefined();
  });
});

/* ================================================================ §2.4/§7 the capital maps */

describe("R3-A0 §2.4/§7 — the frozen capital relationship maps", () => {
  it("every failure class of every fixture carries a relationship entry", () => {
    for (const spec of FIXTURE_SPECS) {
      for (const classId of classIdsOf(spec)) expect(CAPITAL_RELATIONSHIPS[spec.fixtureId]?.[classId]).toBeDefined();
    }
  });

  it("each fixture has a capital item whose DIRECT map is non-empty", () => {
    for (const spec of FIXTURE_SPECS) {
      const capital = CAPITAL_ITEMS.find((item) => item.appliesToFixture === spec.fixtureId);
      expect(capital).toBeDefined();
      expect(directClasses(spec.fixtureId, capital!.capitalId).length).toBeGreaterThan(0);
    }
  });

  it("§7 capital provenance is mechanism derivation, never an empirical claim", () => {
    for (const item of CAPITAL_ITEMS) {
      expect(item.provenance).toBe("MECHANISM_DERIVATION");
      expect(item.limitations.some((entry) => entry.includes("advisory"))).toBe(true);
    }
  });

  it("§2.4 TRANSFER_HYPOTHESIS is recorded separately from DIRECT", () => {
    expect(Object.keys(TRANSFER_HYPOTHESES).length).toBeGreaterThan(0);
    /** No class is BOTH direct for a capital and listed as a transfer hypothesis for it. */
    for (const [fixtureId, byCapital] of Object.entries(TRANSFER_HYPOTHESES)) {
      for (const [capitalId, classes] of Object.entries(byCapital)) {
        for (const classId of classes as readonly string[]) {
          expect(CAPITAL_RELATIONSHIPS[fixtureId]?.[classId]?.[capitalId]).not.toBe("DIRECT");
        }
      }
    }
  });
});

/* ================================================================ §8/§9 the model axis */

describe("R3-A0 §8/§9 — the model-family axis", () => {
  it("§8 at least two materially distinct families are verified end-to-end", () => {
    const verified = verifiedRoutes();
    expect(verified.length).toBeGreaterThanOrEqual(2);
    expect(distinctFamilies(verified).length).toBeGreaterThanOrEqual(2);
  });

  it("§8 no two verified routes are two sizes of one family", () => {
    const verified = verifiedRoutes();
    expect(new Set(verified.map((route) => `${route.vendor}/${route.modelFamily}`)).size).toBe(verified.length);
  });

  it("§8 every route records why it is materially distinct", () => {
    for (const route of MODEL_ROUTES) {
      expect(route.materialDistinctness.reasoningArchitecture.length).toBeGreaterThan(0);
      expect(route.materialDistinctness.vendor.length).toBeGreaterThan(0);
    }
  });

  it("§8 an unverified route is recorded with a reason rather than silently dropped", () => {
    for (const route of MODEL_ROUTES.filter((entry) => !entry.verifiedEndToEnd)) expect(typeof route.verificationNote).toBe("string");
  });

  it("§9 the common renderer is family-independent", () => {
    expect(COMMON_RENDERER.familySpecific).toBe(false);
  });
});

/* ================================================================ §10/§20 treatment independence */

describe("R3-A0 §10/§20 — the baseline harness is treatment-independent", () => {
  const source = readFileSync(join(REPO_ROOT, "scripts", "r3a", "trial.mjs"), "utf8");

  it("§10 the harness selects no capital and enables no prework seam", () => {
    expect(source).toContain("service.start({ expectedTaskId: 't1' })");
    expect(source).not.toMatch(/knowledge\s*:/u);
    expect(source).not.toContain("EFFICACY_ENV");
    expect(source).not.toContain("PALIMPSEST_R2E_EFFICACY");
  });

  it("§5 the harness never copies the hidden acceptance into the world", () => {
    expect(source).toMatch(/acceptance\.mjs.*NEVER copied into a world/u);
    expect(source).toMatch(/if \(relative\.endsWith\('acceptance\.mjs'\)\) continue/u);
  });

  it("§10 every recorded trial proves no capital was delivered", () => {
    if (analysis === null) return;
    const trials = JSON.parse(readFileSync(join(EVIDENCE, "normalized-trials.json"), "utf8")).trials;
    for (const trial of trials) {
      expect(trial.capitalDelivered).toBe(false);
      expect(trial.compiledHandleCount).toBe(0);
    }
  });
});

/* ================================================================ §2.1/§17 the A→B gate */

describe("R3-A0 §2.1/§17 — the A→B gate", () => {
  const p = (taskFamily: string, modelFamily: string, verdict = PAIR_VERDICTS.QUALIFIED, antiOverfitProcess = ANTI_OVERFIT_PROCESSES.COMPLIANT) => ({ fixtureId: `f-${taskFamily}`, taskFamily, modelId: `m-${modelFamily}`, modelFamily, verdict, antiOverfitProcess });

  it("§2.1 green on a graph with the minimum L-shaped bridge", () => {
    const gate = aToBGate([p("A", "x"), p("B", "x"), p("A", "y")]);
    expect(gate.green).toBe(true);
    expect(gate.modelsOnTwoTaskFamilies).toEqual(["x"]);
    expect(gate.taskFamiliesOnTwoModelFamilies).toEqual(["A"]);
  });

  it("§2.1 red on a bridgeless graph even with 2 families and 2 models", () => {
    expect(aToBGate([p("A", "x"), p("B", "y")]).green).toBe(false);
  });

  it("§2.6 a NON_COMPLIANT pair does NOT count toward the gate", () => {
    const gate = aToBGate([p("A", "x"), p("B", "x", PAIR_VERDICTS.QUALIFIED, ANTI_OVERFIT_PROCESSES.NON_COMPLIANT), p("A", "y", PAIR_VERDICTS.QUALIFIED, ANTI_OVERFIT_PROCESSES.NON_COMPLIANT)]);
    expect(gate.excludedNonCompliant).toBe(2);
    expect(gate.green).toBe(false);
  });

  it("§2.1 the full 2×2 cross is RECORDED but not required", () => {
    const gate = aToBGate([p("A", "x"), p("B", "x"), p("A", "y")]);
    expect(gate.green).toBe(true);
    expect(gate.fullTwoByTwoCross).toBe(false);
  });

  it("§17 the recorded gate result matches this stage's real evidence", () => {
    if (analysis === null) return;
    /** The stage's actual outcome: one qualified pair, so the gate is RED and is recorded as such. */
    expect(analysis.gate.qualifiedPairs).toBe(1);
    expect(analysis.gate.green).toBe(false);
    expect(analysis.gate.clauses.twoTaskFamilies).toBe(false);
  });
});

/* ================================================================ the stage documents */

describe("R3-A0 — the required documents exist", () => {
  for (const name of ["R3-A-QUALIFICATION-CONTRACT-V0.1-AMENDMENT.md", "R3-A-FIXTURE-FAMILIES.md"]) {
    it(`docs/engineering/${name} exists and is substantive`, () => {
      const path = join(REPO_ROOT, "docs", "engineering", name);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8").length).toBeGreaterThan(1500);
    });
  }
});
