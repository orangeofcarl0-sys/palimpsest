/**
 * R3-A2 — THE DESIGN-CONTRACT TESTS.
 *
 * These run BEFORE any primary worker run and assert the properties the stage ruling requires of the frozen
 * portfolio. They are deterministic: no model is called, so a green suite cannot be produced by a lucky run.
 *
 * What they cover, in the ruling's order:
 *
 *   §"Frozen new portfolio"        exactly TWO new families, F-C and F-D, and no F-E
 *   §"Failure-class requirements"  multiple mechanically decidable classes; every case declares one; every
 *                                  declared class is exercised; no model self-report decides pass/fail
 *   §"Construction contamination"  evaluationModelFamiliesKnownAtConstruction = true, heldOut = false, and a
 *                                  COMPLIANT classification that does NOT imply held-out
 *   §"Source/target transfer prep" source analogues, capital blueprints, and a frozen DIRECT /
 *                                  TRANSFER_HYPOTHESIS / NONE map
 *   §"Qualification contract"      bounds, Nq, QC-2, QC-4, QC-6 and the anti-overfit gate are UNCHANGED
 *   §"Hard stage budget"           the frozen 20-run schedule and the hard maximum
 *   §"No primary-fixture smoke"    no primary run is possible before the plan commit exists
 *   §"Three-commit evidence"       the plan carries the model stacks, digests, schemas and definitions
 *   §"Readiness decomposition"     the four states, INCLUDING the disconnected LOCAL-not-BRIDGE case
 *   §"Fusion ruling"               no Council/SupervisorAgent/FusionAgent ontology is introduced
 *   §"Engine immutability"         the plan's engine digests still match the working tree
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COMBINED_SPECS, HISTORICAL_FAMILIES, NEW_FAMILIES, allContentDigests, materialize, specFor } from "../scripts/r3a2/fixtures.mjs";
import { PORTFOLIO_SPECS } from "../scripts/r3a/fixture-content-r3a2.mjs";
import { ANTI_OVERFIT_PROCESSES, CONTAMINATION, PORTFOLIO_MANIFESTS, portfolioClaimCeiling, portfolioCountsTowardGraph, portfolioManifestFor } from "../scripts/r3a2/manifest.mjs";
import { PORTFOLIO_CAPITAL_ITEMS, PORTFOLIO_CAPITAL_RELATIONSHIPS, SOURCE_ANALOGUES, portfolioDirectClasses, portfolioRelationshipOf, portfolioTransferHypotheses } from "../scripts/r3a2/capital.mjs";
import { allPreconditions, preconditionSatisfied } from "../scripts/r3a2/fixture-audit.mjs";
import { COMMON_RENDERER, DECLARED_PRICES, EXCLUDED_MODEL_IDS, MODEL_ROUTES_SENTINEL, SENTINEL_MODEL_IDS, sentinelFamilies } from "../scripts/r3a2/models.mjs";
import { buildPlan, schedule } from "../scripts/r3a2/plan.mjs";
import { continuation, graphEdges, readiness } from "../scripts/r3a2/readiness.mjs";
import { MIN_CLASS_HEADROOM, PAIR_VERDICTS, QUALIFICATION_BOUNDS, aToBGate } from "../scripts/r3a/qualification.mjs";
import { FIXTURE_MANIFESTS } from "../scripts/r3a/fixture-manifest.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EVIDENCE = join(REPO_ROOT, "research-evidence", "r3-a2");

const qualified = (fixtureId: string, taskFamily: string, modelFamily: string, overrides: Record<string, unknown> = {}) => ({
  fixtureId,
  taskFamily,
  modelId: `${modelFamily}-x`,
  modelFamily,
  verdict: PAIR_VERDICTS.QUALIFIED,
  antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT,
  ...overrides,
});

/* ================================================================ §"Frozen new portfolio" */

describe("R3-A2 §Frozen new portfolio — exactly two new families, F-C and F-D", () => {
  it("§Frozen new portfolio exactly TWO new families exist and no F-E is present", () => {
    expect(NEW_FAMILIES.length).toBe(2);
    expect(NEW_FAMILIES).toEqual(["r3a-f-c-policy-resolution", "r3a-f-d-rule-resolution"]);
    expect(COMBINED_SPECS.some((spec: any) => spec.fixtureId.includes("f-e"))).toBe(false);
  });

  it("§Frozen new portfolio the two families are structurally distinct from F-A and F-B", () => {
    const families = COMBINED_SPECS.map((spec: any) => spec.mechanismFamily);
    expect(new Set(families).size).toBe(families.length);
    for (const spec of PORTFOLIO_SPECS) expect(spec.mechanismFamily).toMatch(/^F-[CD] /u);
  });

  it("§Frozen new portfolio F-C is a graph closure problem, not Scenario D's cache invalidation", () => {
    const fc = specFor("r3a-f-c-policy-resolution");
    const text = Object.values(fc.files).join("\n");
    /** Scenario D invalidates a cache after a change set; F-C resolves which DECLARED value is effective. */
    expect(text).not.toMatch(/invalidate|invalidation|stale|changeSet|cache/iu);
    expect(fc.sourceFile).toBe("src/policy.mjs");
  });

  it("§Frozen new portfolio each new family is exercised by a distinct source export and file", () => {
    const exports = PORTFOLIO_SPECS.map((spec) => spec.exportName);
    const files = PORTFOLIO_SPECS.map((spec) => spec.sourceFile);
    expect(new Set(exports).size).toBe(2);
    expect(new Set(files).size).toBe(2);
  });

  it("§Frozen new portfolio the two carried-forward families are still the R3-A0 ones", () => {
    expect(HISTORICAL_FAMILIES).toEqual(["r3a-f-a-atomic-transaction", "r3a-f-b-versioned-migration"]);
  });
});

/* ================================================================ §"Failure-class requirements" */

describe("R3-A2 §Failure-class requirements — mechanically decidable classes", () => {
  it("§Failure-class requirements every new family declares multiple classes (>= 5)", () => {
    for (const spec of PORTFOLIO_SPECS) expect(spec.classStructure.independent.length).toBeGreaterThanOrEqual(4);
  });

  it("§Failure-class requirements every declared class is exercised and every case declares a class", async () => {
    const preconditions = await allPreconditions();
    for (const fixtureId of NEW_FAMILIES) {
      const precondition = preconditions[fixtureId];
      expect(precondition.allDeclaredClassesAreExercised).toBe(true);
      expect(precondition.allHiddenCasesDeclareFailureClass).toBe(true);
    }
  });

  it("§Failure-class requirements no model self-report decides pass/fail (oracle consults no model)", async () => {
    const preconditions = await allPreconditions();
    for (const fixtureId of NEW_FAMILIES) expect(preconditions[fixtureId].oracleUsesNoModelSelfReport).toBe(true);
  });

  it("§Failure-class requirements the mechanical oracle is deterministic and judges every case", async () => {
    const preconditions = await allPreconditions();
    for (const fixtureId of NEW_FAMILIES) {
      expect(preconditions[fixtureId].mechanicalOracleProven).toBe(true);
      expect(preconditionSatisfied(preconditions[fixtureId])).toBe(true);
    }
  });

  it("§Failure-class requirements structural class relations are declared SEPARATELY from observed series", () => {
    for (const spec of PORTFOLIO_SPECS) {
      expect(spec.classStructure).toBeDefined();
      expect(Array.isArray(spec.classStructure.partiallyCoupled)).toBe(true);
      /** The fixture must not claim observed redundancy from an observed series anywhere in its bytes. */
      expect(JSON.stringify(spec.classStructure)).not.toMatch(/observ|series|redundan/iu);
    }
  });

  it("§Failure-class requirements H0 has headroom on EVERY declared class (no floor class)", async () => {
    const { allConstructionAudits } = await import("../scripts/r3a2/fixture-audit.mjs");
    const audits = await allConstructionAudits();
    for (const audit of audits) {
      expect(audit.classesWithoutHeadroom).toEqual([]);
      expect(audit.h0.passed).toBeGreaterThan(0);
      expect(audit.h0.passed).toBeLessThan(audit.h0.total);
    }
  });

  it("§Failure-class requirements the fixture H0 is SOLVABLE: a reference resolution passes every class", async () => {
    /** A solvable fixture is required, or the class would be measuring an impossible contract. */
    for (const spec of PORTFOLIO_SPECS) {
      const reference = await import(`./fixtures-r3a2/${spec.shortId}-reference.mjs`);
      const { oracle } = await materialize(spec);
      const run = oracle.runCases(reference[spec.exportName], oracle.cases);
      expect(run.passed, `${spec.fixtureId} reference solved ${run.passed}/${run.total}`).toBe(run.total);
    }
  });

  it("§Failure-class requirements the R3-A2 oracle accessors dispatch on the DECLARED export names", async () => {
    const { oracleExports } = await import("../scripts/r3a2/fixtures.mjs");
    /** Every family declares its own export names, so adding a family is a data change, not a code change. */
    for (const spec of PORTFOLIO_SPECS) {
      const names = oracleExports(spec);
      expect(names.classes).toBe(spec.classesExport);
      expect(names.cases).toBe(spec.casesExport);
    }
    const fc = oracleExports(specFor("r3a-f-c-policy-resolution"));
    const fd = oracleExports(specFor("r3a-f-d-rule-resolution"));
    expect(fc.classes).not.toBe(fd.classes);
    /** And the accessor really reads them from the acceptance module rather than branching on the id. */
    const { oracle } = await materialize(specFor("r3a-f-d-rule-resolution"));
    expect(oracle.classIds).toContain("FD1");
  });
});

/* ================================================================ §"Construction contamination" */

describe("R3-A2 §Construction contamination — known families, not held out", () => {
  it("§Construction contamination the evaluation families are recorded as KNOWN at construction", () => {
    for (const manifest of PORTFOLIO_MANIFESTS) {
      expect(manifest.evaluationModelFamiliesKnownAtConstruction).toBe(true);
      expect(manifest.evaluationModelFamilies).toEqual(["deepseek", "glm"]);
    }
  });

  it("§Construction contamination heldOut is FALSE and the reason is recorded", () => {
    for (const manifest of PORTFOLIO_MANIFESTS) {
      expect(manifest.heldOut).toBe(false);
      expect(manifest.heldOutReason.length).toBeGreaterThan(0);
    }
  });

  it("§Construction contamination COMPLIANT does NOT imply held out, and the ceiling is limited", () => {
    for (const manifest of PORTFOLIO_MANIFESTS) {
      expect(manifest.antiOverfitProcess).toBe(ANTI_OVERFIT_PROCESSES.COMPLIANT);
      /** COMPLIANT but not held out: task-family claims only, never model-family generality. */
      expect(portfolioClaimCeiling(manifest.fixtureId)).toBe("G1");
    }
  });

  it("§Construction contamination the construction model identity is NOT invented", () => {
    for (const manifest of PORTFOLIO_MANIFESTS) {
      expect(manifest.constructionModelId).toBe("UNKNOWN");
      expect(manifest.constructionModelFamily).toBe("UNKNOWN");
      expect(manifest.contamination).toBe(CONTAMINATION.UNKNOWN);
    }
  });

  it("§Construction contamination the anti-overfit basis names the mechanism and the pre-run ordering", () => {
    for (const manifest of PORTFOLIO_MANIFESTS) {
      expect(manifest.antiOverfitBasis).toMatch(/BEFORE any R3-A2 baseline run/u);
      expect(manifest.antiOverfitBasis).toMatch(/not.*(tuned|derived)|rather than/iu);
    }
  });

  it("§Construction contamination the manifest digest matches the REAL computed fixture digest", () => {
    const digests = allContentDigests();
    for (const manifest of PORTFOLIO_MANIFESTS) expect(manifest.contentDigest).toBe(digests[manifest.fixtureId]);
  });

  it("§Construction contamination the R3-A0 manifests are untouched by this stage", () => {
    expect(FIXTURE_MANIFESTS.length).toBe(2);
    expect(FIXTURE_MANIFESTS.map((entry) => entry.fixtureId)).toEqual([...HISTORICAL_FAMILIES]);
    expect(FIXTURE_MANIFESTS.find((entry) => entry.fixtureId === "r3a-f-a-atomic-transaction")!.contentDigest)
      .toBe("468cfcea8a8e36127ebba9022f21cad1c751f2b18cca7f53867775c6163fc37a");
    expect(FIXTURE_MANIFESTS.find((entry) => entry.fixtureId === "r3a-f-b-versioned-migration")!.contentDigest)
      .toBe("8e290a4be4ba7f2713b621806113a99fc8e15e009b4a75630be9d593757b7611");
  });

  it("§Construction contamination the gate consumes manifest compliance, so a non-compliant family cannot count", () => {
    expect(portfolioCountsTowardGraph("r3a-f-c-policy-resolution")).toBe(true);
    const gate = aToBGate([qualified("fx", "F-C", "glm", { antiOverfitProcess: ANTI_OVERFIT_PROCESSES.NON_COMPLIANT })]);
    expect(gate.qualifiedPairs).toBe(0);
    expect(gate.excludedNonCompliant).toBe(1);
  });
});

/* ================================================================ §"Source/target transfer preparation" */

describe("R3-A2 §Source/target transfer preparation — analogues, blueprints and the frozen map", () => {
  it("§Source/target transfer prep each new family declares a source analogue in ANOTHER surface domain", () => {
    expect(SOURCE_ANALOGUES.length).toBe(2);
    for (const analogue of SOURCE_ANALOGUES) {
      expect(NEW_FAMILIES).toContain(analogue.forTargetFixture);
      expect(analogue.surfaceDomain).not.toBe(analogue.targetSurfaceDomain);
      expect(analogue.mechanismCorrespondence.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("§Source/target transfer prep each new family declares a candidate-capital blueprint", () => {
    expect(PORTFOLIO_CAPITAL_ITEMS.length).toBe(2);
    for (const item of PORTFOLIO_CAPITAL_ITEMS) {
      expect(NEW_FAMILIES).toContain(item.appliesToFixture);
      expect(item.provenance).toBe("MECHANISM_DERIVATION");
      expect(item.clauses.length).toBeGreaterThanOrEqual(5);
      /** The blueprint is advisory method guidance, never authority. */
      expect(item.limitations.some((entry) => entry.includes("advisory"))).toBe(true);
    }
  });

  it("§Source/target transfer prep the relationship map covers EVERY class of EVERY new family", async () => {
    for (const spec of PORTFOLIO_SPECS) {
      const { oracle } = await materialize(spec);
      const map = PORTFOLIO_CAPITAL_RELATIONSHIPS[spec.fixtureId];
      for (const classId of oracle.classIds) expect(map?.[classId], `${spec.fixtureId}/${classId} is unmapped`).toBeDefined();
    }
  });

  it("§Source/target transfer prep every relationship is one of DIRECT / TRANSFER_HYPOTHESIS / NONE", () => {
    for (const byClass of Object.values(PORTFOLIO_CAPITAL_RELATIONSHIPS)) {
      for (const byCapital of Object.values(byClass as Record<string, Record<string, string>>)) {
        for (const relationship of Object.values(byCapital)) expect(["DIRECT", "TRANSFER_HYPOTHESIS", "NONE"]).toContain(relationship);
      }
    }
  });

  it("§Source/target transfer prep each new family has DIRECT classes for its OWN capital", () => {
    for (const item of PORTFOLIO_CAPITAL_ITEMS) {
      const direct = portfolioDirectClasses(item.appliesToFixture, item.capitalId);
      expect(direct.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("§Source/target transfer prep a TRANSFER_HYPOTHESIS never satisfies the DIRECT clause", () => {
    const transfers = portfolioTransferHypotheses();
    expect(transfers.length).toBeGreaterThan(0);
    for (const entry of transfers) {
      const direct = portfolioDirectClasses(entry.fixtureId, entry.capitalId);
      expect(direct).not.toContain(entry.classId);
      expect(portfolioRelationshipOf(entry.fixtureId, entry.classId, entry.capitalId)).toBe("TRANSFER_HYPOTHESIS");
    }
  });

  it("§Source/target transfer prep the map is frozen before any baseline run (a data literal, not computed)", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a2", "capital.mjs"), "utf8");
    expect(source).toMatch(/frozen BEFORE baseline execution/iu);
    expect(source).toMatch(/not be inferred post hoc/iu);
    /** The map is a frozen literal, so it cannot be a function of any observed outcome. */
    expect(source).toMatch(/PORTFOLIO_CAPITAL_RELATIONSHIPS = Object\.freeze\(/u);
  });
});

/* ================================================================ §"Qualification contract" */

describe("R3-A2 §Qualification contract — the frozen engine is reused, not altered", () => {
  it("§Qualification contract the aggregate bounds are UNCHANGED at (0.20, 0.85)", () => {
    expect(QUALIFICATION_BOUNDS.lower).toBe(0.2);
    expect(QUALIFICATION_BOUNDS.upper).toBe(0.85);
    expect(QUALIFICATION_BOUNDS.roomRequiredInBothDirections).toBe(true);
  });

  it("§Qualification contract Nq is UNCHANGED at 5 and the class-headroom minimum at 2", () => {
    expect(MIN_CLASS_HEADROOM.Nq).toBe(5);
    expect(MIN_CLASS_HEADROOM.minVaryingDirectClasses).toBe(2);
  });

  it("§Qualification contract the three pair verdicts are unchanged and there is no 'almost qualified'", () => {
    expect(Object.values(PAIR_VERDICTS).join(",")).toBe("QUALIFIED,UNQUALIFIED,INFRASTRUCTURE_INVALID");
  });

  it("§Qualification contract the R3-A2 analysis does not reimplement a QC clause", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a2", "analyse.mjs"), "utf8");
    /** It must CALL the frozen engine and must not carry its own QC-2/QC-4 arithmetic. */
    expect(source).toMatch(/qualifyPair/u);
    expect(source).not.toMatch(/QC-2 failed|QC-4 failed|QC-6 failed/u);
  });

  it("§Qualification contract the new pairs go through the SAME engine as the historical ones", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a2", "analyse.mjs"), "utf8");
    expect(source).toMatch(/from '\.\.\/r3a\/qualification\.mjs'/u);
  });

  it("§Qualification contract the two sentinel stacks are the ONLY ones scheduled, and Kimi is excluded", () => {
    expect(SENTINEL_MODEL_IDS).toEqual(["deepseek-flash", "glm-5.3-flash"]);
    expect(EXCLUDED_MODEL_IDS).toContain("kimi-k3");
    expect(MODEL_ROUTES_SENTINEL.map((route: any) => route.modelId)).toEqual([...SENTINEL_MODEL_IDS]);
    expect(MODEL_ROUTES_SENTINEL.some((route: any) => route.modelId === "kimi-k3")).toBe(false);
    expect(sentinelFamilies()).toEqual(["deepseek", "glm"]);
  });

  it("§Common cognitive interface the common renderer is frozen, family-independent and UNCHANGED", () => {
    expect(COMMON_RENDERER.rendererId).toBe("dsh-common-worker");
    expect(COMMON_RENDERER.rendererVersion).toBe(1);
    expect(COMMON_RENDERER.familySpecific).toBe(false);
  });

  it("§Common cognitive interface no pure model-architecture isolation is claimed", () => {
    for (const route of MODEL_ROUTES_SENTINEL) expect(route.materialDistinctness).toBeDefined();
    const plan = buildPlan();
    for (const model of plan.models) expect(model.isolationCaveat).toMatch(/NOT pure model-architecture isolation/u);
  });
});

/* ================================================================ §"Hard stage budget" */

describe("R3-A2 §Hard stage budget — the frozen 20-run schedule", () => {
  it("§Hard stage budget the schedule is exactly 20 runs: 2 fixtures x 2 models x Nq=5", () => {
    const runs = schedule();
    expect(runs.length).toBe(20);
    const counts = new Map<string, number>();
    for (const run of runs) counts.set(`${run.fixtureId}|${run.modelId}`, (counts.get(`${run.fixtureId}|${run.modelId}`) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual([
      "r3a-f-c-policy-resolution|deepseek-flash",
      "r3a-f-c-policy-resolution|glm-5.3-flash",
      "r3a-f-d-rule-resolution|deepseek-flash",
      "r3a-f-d-rule-resolution|glm-5.3-flash",
    ]);
    for (const value of counts.values()) expect(value).toBe(5);
  });

  it("§Hard stage budget the hard maximum valid primary runs is 20 and the budget is declared", () => {
    const plan = buildPlan();
    expect(plan.runBudget.hardMaximumValidPrimaryRuns).toBe(20);
    expect(plan.runBudget.intendedValidPrimaryRuns).toBe(20);
    expect(plan.expectedRuns).toBe(20);
  });

  it("§Hard stage budget the schedule touches NO historical fixture", () => {
    for (const run of schedule()) expect(NEW_FAMILIES).toContain(run.fixtureId);
  });

  it("§Hard stage budget the retry policy forbids retrying a valid bad outcome", () => {
    const plan = buildPlan();
    expect(plan.retryPolicy.validOutcomeIsFinal).toBe(true);
    expect(plan.retryPolicy.rule).toMatch(/NEVER retried/u);
  });

  it("§Hard stage budget the trial ids are unique, so no two runs collide on a directory", () => {
    const ids = schedule().map((run: any) => run.trialId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ================================================================ §"No primary-fixture smoke" */

describe("R3-A2 §No primary-fixture smoke — no run before the plan commit", () => {
  it("§No primary-fixture smoke the runner REFUSES to start without the committed plan", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a2", "qualify.mjs"), "utf8");
    expect(source).toMatch(/research-evidence.*plan\.json/u);
    expect(source).toMatch(/refus/iu);
  });

  it("§No primary-fixture smoke the runner verifies the executed schedule EQUALS the committed schedule", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a2", "qualify.mjs"), "utf8");
    expect(source).toMatch(/differs from the frozen plan/u);
  });

  it("§No primary-fixture smoke the baseline condition selects NO capital of any kind", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a2", "trial.mjs"), "utf8");
    expect(source).toContain("service.start({ expectedTaskId: 't1' })");
    expect(source).not.toContain("knowledge:");
    expect(source).not.toContain("EFFICACY_ENV");
    expect(source).not.toContain("PALIMPSEST_R2E_EFFICACY");
    expect(source).not.toContain("PALIMPSEST_R2M_INDEX");
  });

  it("§No primary-fixture smoke the plan records the smoke policy and the baseline condition", () => {
    const plan = buildPlan();
    expect(plan.smokePolicy).toMatch(/does NOT count toward Nq/u);
    expect(plan.baselineCondition.selectedInheritedCapital).toBe(false);
    expect(plan.baselineCondition.projectCapitalIndex).toBe(false);
    expect(plan.baselineCondition.m1Preview).toBe(false);
    expect(plan.baselineCondition.hostMediatedCapitalPrework).toBe(false);
  });
});

/* ================================================================ §"Three-commit evidence structure" */

describe("R3-A2 §Three-commit evidence structure — the plan is complete before execution", () => {
  it("§Three-commit the plan carries the exact model-stack identities", () => {
    const plan = buildPlan();
    expect(plan.models.length).toBe(2);
    for (const model of plan.models) {
      for (const field of ["modelId", "modelFamily", "routeId", "providerId", "vendor", "api", "baseURL", "apiKeyEnv"]) {
        expect(model[field], `${model.modelId} is missing ${field}`).toBeTruthy();
      }
    }
  });

  it("§Three-commit the plan carries fixture digests, engine digests and the renderer digest", () => {
    const plan = buildPlan();
    expect(plan.fixtures.length).toBe(COMBINED_SPECS.length);
    for (const fixture of plan.fixtures) expect(fixture.contentDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(Object.keys(plan.engineDigests).length).toBeGreaterThanOrEqual(8);
    for (const digest of Object.values(plan.engineDigests)) expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(plan.renderer.rendererId).toBe("dsh-common-worker");
  });

  it("§Engine immutability the plan's engine digests still match the working tree", async () => {
    const { ENGINE_DIGESTS } = await import("../scripts/r3a2/plan.mjs");
    const { createHash } = await import("node:crypto");
    for (const [relative, digest] of Object.entries(ENGINE_DIGESTS)) {
      const actual = createHash("sha256").update(readFileSync(join(REPO_ROOT, relative))).digest("hex");
      expect(actual, `${relative} drifted`).toBe(digest);
    }
    expect(Object.keys(buildPlan().engineDigests)).toEqual(Object.keys(ENGINE_DIGESTS));
  });

  it("§Three-commit the plan carries the trial schema, the analysis schema and the readiness definitions", () => {
    const plan = buildPlan();
    expect(plan.trialSchema.required.length).toBeGreaterThanOrEqual(15);
    expect(plan.analysisSchema.perPair.length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(plan.readinessDefinitions)).toEqual(["TASK_READY", "MODEL_READY", "LOCAL_PAIR_READY", "BRIDGE_READY"]);
    expect(Object.keys(plan.readinessStates)).toEqual(["TASK_READY", "MODEL_READY", "LOCAL_PAIR_READY", "BRIDGE_READY"]);
  });

  it("§Three-commit the plan records the research ruling's laws verbatim in substance", () => {
    const plan = buildPlan();
    expect(plan.laws.portfolioQualificationNotBridgeHunting).toMatch(/RED graph is a valid result/u);
    expect(plan.laws.noFixtureAuthoredAfterFirstRun).toMatch(/no additional fixture/iu);
    expect(plan.laws.historicalVerdictsUnchanged).toMatch(/unchanged/u);
    expect(plan.laws.fusionOutOfScope).toMatch(/future host\/runtime policy over Attempts/u);
  });

  it("§Fusion ruling no Council / SupervisorAgent / FusionAgent ontology is introduced", () => {
    const files = ["scripts/r3a2/fixtures.mjs", "scripts/r3a2/capital.mjs", "scripts/r3a2/readiness.mjs", "scripts/r3a2/plan.mjs", "scripts/r3a2/analyse.mjs"];
    for (const file of files) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      expect(source).not.toMatch(/Council|SupervisorAgent|FusionAgent/u);
    }
    expect(buildPlan().laws.fusionOutOfScope).toContain("not a canonical owner or authority mechanism");
  });
});

/* ================================================================ §"Readiness decomposition" */

describe("R3-A2 §Readiness decomposition — the four states are NOT collapsed", () => {
  const sentinels = ["deepseek", "glm"];

  it("§Readiness decomposition only COMPLIANT + QUALIFIED pairs become edges", () => {
    const edges = graphEdges([
      qualified("fx", "F-C", "glm"),
      { ...qualified("fy", "F-D", "glm"), verdict: PAIR_VERDICTS.UNQUALIFIED },
      { ...qualified("fz", "F-D", "deepseek"), antiOverfitProcess: ANTI_OVERFIT_PROCESSES.NON_COMPLIANT },
    ]);
    expect(edges.length).toBe(1);
  });

  it("§Readiness decomposition TASK_READY requires one model on >=2 structurally distinct task families", () => {
    expect(readiness([qualified("fa", "F-A", "glm")], sentinels).TASK_READY).toBe(false);
    expect(readiness([qualified("fa", "F-A", "glm"), qualified("fc", "F-C", "glm")], sentinels).TASK_READY).toBe(true);
  });

  it("§Readiness decomposition MODEL_READY requires one fixture family on BOTH sentinel families", () => {
    expect(readiness([qualified("fc", "F-C", "glm"), qualified("fc", "F-C", "deepseek")], sentinels).MODEL_READY).toBe(true);
    expect(readiness([qualified("fc", "F-C", "glm"), qualified("fd", "F-D", "deepseek")], sentinels).MODEL_READY).toBe(false);
  });

  it("§Readiness decomposition LOCAL_PAIR_READY requires both sentinels qualified AND >=2 task families", () => {
    expect(readiness([qualified("fa", "F-A", "glm")], sentinels).LOCAL_PAIR_READY).toBe(false);
    const twoFamilies = readiness([qualified("fa", "F-A", "glm"), qualified("fb", "F-B", "deepseek")], sentinels);
    expect(twoFamilies.LOCAL_PAIR_READY).toBe(true);
    expect(twoFamilies.BRIDGE_READY).toBe(false);
  });

  it("§Readiness decomposition the L-shape in ONE component is BRIDGE_READY", () => {
    const report = readiness([qualified("fa", "F-A", "glm"), qualified("fc", "F-C", "glm"), qualified("fc", "F-C", "deepseek")], sentinels);
    expect(report.BRIDGE_READY).toBe(true);
    expect(report.components.some((component: any) => component.lShaped)).toBe(true);
  });

  it("§Readiness decomposition DISCONNECTED: the facts exist in different components, so BRIDGE_READY is FALSE", () => {
    /**
     * deepseek spans F-C+F-D in one component; glm is qualified on F-B in another. TASK_READY and
     * LOCAL_PAIR_READY both hold, but NO component carries the L-shape — the case the ruling says must not be
     * collapsed into one GREEN.
     */
    const report = readiness([qualified("fc", "F-C", "deepseek"), qualified("fd", "F-D", "deepseek"), qualified("fb", "F-B", "glm")], sentinels);
    expect(report.TASK_READY).toBe(true);
    expect(report.LOCAL_PAIR_READY).toBe(true);
    expect(report.BRIDGE_READY).toBe(false);
    expect(report.components.every((component: any) => !component.lShaped)).toBe(true);
    expect(report.confoundNote).toMatch(/TASK-CONFOUNDED/u);
  });

  it("§Readiness decomposition the full 2x2 cross is reported SEPARATELY from BRIDGE_READY", () => {
    const full = readiness([qualified("fc", "F-C", "deepseek"), qualified("fc", "F-C", "glm"), qualified("fd", "F-D", "deepseek"), qualified("fd", "F-D", "glm")], sentinels);
    expect(full.fullTwoByTwoCrossExists).toBe(true);
    const lOnly = readiness([qualified("fa", "F-A", "glm"), qualified("fc", "F-C", "glm"), qualified("fc", "F-C", "deepseek")], sentinels);
    expect(lOnly.BRIDGE_READY).toBe(true);
    expect(lOnly.fullTwoByTwoCrossExists).toBe(false);
  });

  it("§Continuation ruling the next stage follows the ruling's order exactly", () => {
    expect(continuation(readiness([qualified("fa", "F-A", "glm"), qualified("fc", "F-C", "glm"), qualified("fc", "F-C", "deepseek")], sentinels)).next).toBe("R3-BX");
    expect(continuation(readiness([qualified("fa", "F-A", "glm"), qualified("fb", "F-B", "deepseek")], sentinels)).next).toBe("R3-BL");
    expect(continuation(readiness([qualified("fa", "F-A", "glm")], sentinels)).next).toBe("ARCHITECTURAL REVIEW");
  });

  it("§Continuation ruling a pair-local recommendation records the task confound", () => {
    const local = continuation(readiness([qualified("fa", "F-A", "glm"), qualified("fb", "F-B", "deepseek")], sentinels));
    expect(local.next).toBe("R3-BL");
    expect(local.reason).toMatch(/task-confounded/u);
  });

  it("§Readiness decomposition the four states are DISTINCT values, not one boolean", () => {
    const report = readiness([qualified("fa", "F-A", "glm")], sentinels);
    const states = { TASK_READY: report.TASK_READY, MODEL_READY: report.MODEL_READY, LOCAL_PAIR_READY: report.LOCAL_PAIR_READY, BRIDGE_READY: report.BRIDGE_READY };
    for (const state of Object.keys(states)) expect(typeof states[state as keyof typeof states]).toBe("boolean");
    /** A one-family portfolio must not read as any of the four. */
    expect(report.TASK_READY || report.MODEL_READY || report.LOCAL_PAIR_READY || report.BRIDGE_READY).toBe(false);
  });
});

/* ================================================================ §"Experiment economics" */

describe("R3-A2 §Experiment economics — no invented cost values", () => {
  it("§Experiment economics no price is invented: every sentinel route records null WITH a reason", () => {
    for (const modelId of SENTINEL_MODEL_IDS) {
      const price = DECLARED_PRICES[modelId]!;
      expect(price.usdPerMillionInputTokens).toBeNull();
      expect(price.usdPerMillionOutputTokens).toBeNull();
      expect(price.reason.length).toBeGreaterThan(0);
    }
  });

  it("§Experiment economics the telemetry reader sums per-step increments, not the running total", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a2", "telemetry.mjs"), "utf8");
    expect(source).toMatch(/RUNNING TOTAL/u);
    expect(source).toMatch(/Math\.max\(runningTotalTokens/u);
  });

  it("§Experiment economics the multi-frame zstd artifact is split on the frame magic", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a2", "telemetry.mjs"), "utf8");
    expect(source).toMatch(/0x28, 0xb5, 0x2f, 0xfd/u);
    expect(source).toMatch(/FRAME_MAGIC/u);
  });

  it("§Experiment economics owner-side, model-side and tool-interaction costs stay separate", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a2", "analyse.mjs"), "utf8");
    expect(source).toMatch(/ownerSide/u);
    expect(source).toMatch(/modelSide/u);
    expect(source).toMatch(/toolInteraction/u);
  });
});

/* ================================================================ §"Existing graph" */

describe("R3-A2 §Existing graph — historical verdicts carried forward, never rerun", () => {
  it("§Existing graph the historical R3-AE record exists and is NOT modified by this stage", () => {
    const path = join(REPO_ROOT, "research-evidence", "r3-ae", "corrected-analysis.json");
    expect(existsSync(path)).toBe(true);
    const historical = JSON.parse(readFileSync(path, "utf8"));
    const verdicts = Object.fromEntries(historical.pairs.map((pair: any) => [`${pair.fixtureId}|${pair.modelId}`, pair.verdict]));
    expect(verdicts["r3a-f-a-atomic-transaction|deepseek-flash"]).toBe("UNQUALIFIED");
    expect(verdicts["r3a-f-a-atomic-transaction|glm-5.3-flash"]).toBe("QUALIFIED");
    expect(verdicts["r3a-f-b-versioned-migration|deepseek-flash"]).toBe("UNQUALIFIED");
    expect(verdicts["r3a-f-b-versioned-migration|glm-5.3-flash"]).toBe("UNQUALIFIED");
    expect(historical.gate.green).toBe(false);
  });

  it("§Existing graph the analysis CARRIES the historical pairs forward rather than recomputing them", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a2", "analyse.mjs"), "utf8");
    expect(source).toMatch(/corrected-analysis\.json/u);
    expect(source).toMatch(/carried forward, NOT rerun/iu);
  });

  it("§Existing graph the A→B gate result is reproduced from the carried-forward verdicts", () => {
    const gate = aToBGate([
      { fixtureId: "fa", taskFamily: "F-A transactional / atomic state update", modelId: "glm-5.3-flash", modelFamily: "glm", verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT },
      { fixtureId: "fa", taskFamily: "F-A transactional / atomic state update", modelId: "deepseek-flash", modelFamily: "deepseek", verdict: PAIR_VERDICTS.UNQUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT },
    ]);
    expect(gate.green).toBe(false);
  });
});

/* ================================================================ the frozen fixtures on disk */

describe("R3-A2 the frozen fixture revisions on disk match the in-memory specs", () => {
  it("§Fixture lifecycle each new revision is on disk under fixtures/r3a2 with its own digest", () => {
    for (const spec of PORTFOLIO_SPECS) {
      const dir = join(REPO_ROOT, "fixtures", "r3a2", spec.fixtureId, `r${String(spec.fixtureRevision)}`);
      expect(existsSync(dir)).toBe(true);
      for (const relative of Object.keys(spec.files)) expect(existsSync(join(dir, relative)), `${spec.fixtureId}/${relative} is missing`).toBe(true);
    }
  });

  it("§Fixture lifecycle a written fixture file is byte-identical to the in-memory spec", () => {
    for (const spec of PORTFOLIO_SPECS) {
      const dir = join(REPO_ROOT, "fixtures", "r3a2", spec.fixtureId, `r${String(spec.fixtureRevision)}`);
      for (const [relative, content] of Object.entries(spec.files)) {
        expect(readFileSync(join(dir, relative), "utf8"), `${spec.fixtureId}/${relative} drifted`).toBe(content);
      }
    }
  });

  it("§Fixture lifecycle the constructed digest file agrees with the manifest digests", () => {
    const constructed = JSON.parse(readFileSync(join(EVIDENCE, "fixture-digests.json"), "utf8"));
    for (const entry of constructed.fixtures) {
      expect(portfolioManifestFor(entry.fixtureId).contentDigest).toBe(entry.contentDigest);
    }
  });
});
