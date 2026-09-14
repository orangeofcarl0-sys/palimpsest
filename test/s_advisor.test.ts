/**
 * G10-S empirical architecture advisor — golden recommendations, hard (non-overridable)
 * ineligibility, disclosed uncertainty, and the untrusted-profiler boundary.
 *
 *   Advisor ≠ Authority        Recommendation ≠ Commitment
 *   Suggestion ≠ Selection     HistoricalWinner ≠ FutureAuthority
 */

import { describe, expect, it } from "vitest";

import {
  INSUFFICIENT_EMPIRICAL_EVIDENCE,
  applyProfilerOutput,
  makeEmpiricalArchitectureAdvisor,
  parseArchitectureRecommendation,
  parseProfilerOutput,
  parseTaskProfile,
  taskFeatureValue,
  taskProfileFromValues,
  unknownTaskProfile,
} from "../src/advisor/index.js";
import { AdvisorError } from "../src/advisor/strict.js";
import type { AdvisorCapabilities, ArchitectureRecommendation } from "../src/advisor/index.js";
import { builtinRecipeRegistry } from "../src/recipes/index.js";
import type { RecipeRegistry } from "../src/recipes/index.js";
import {
  SqliteOrganizationMemoryStore,
  makeOrganizationMemoryService,
  materializeEvaluation,
  materializeExperiment,
  materializeMetric,
  materializeScenario,
  materializeVariant,
} from "../src/organization_memory/index.js";
import type { OrganizationMemoryService, RunResult, VariantStats } from "../src/organization_memory/index.js";
import { buildRunResult } from "../src/experiment/index.js";
import type { ExperimentRunSpec } from "../src/experiment/index.js";

const registry: RecipeRegistry = builtinRecipeRegistry();

const PROVENANCE = {
  provider: "test-provider",
  model: "test-model",
  hostVersion: "host-1",
  palimpsestSha: "sha-1",
  ordariumVersion: "ord-1",
  profileDigest: "profile-1",
  repoShas: [] as readonly { readonly repo: string; readonly sha: string }[],
  unknowns: [] as readonly string[],
};

/**
 * A real OrganizationMemoryService over an in-memory store, with a REASONING_CELL variant whose
 * quality metric was never observed as known (so quality transfer stays unknown, never 0).
 */
function makeMemory(): OrganizationMemoryService {
  const store = new SqliteOrganizationMemoryStore(":memory:");
  const memory = makeOrganizationMemoryService({ store });
  const scenario = materializeScenario({
    scenarioId: "scn-1",
    scenarioRevision: 0,
    kind: "S1_LOW_COUPLING",
    classification: "OPEN_ENDED",
    task: "task",
    successCriteria: ["criterion"],
    bounds: { maxWallClockMs: 1000, maxModelCalls: 10, maxRunsPerVariant: 10 },
  });
  const reasoningCell = materializeVariant({ variantId: "var-cell", kind: "REASONING_CELL", description: "cell" });
  const federated = materializeVariant({ variantId: "var-fed", kind: "FEDERATED_PEERS", description: "fed" });
  const single = materializeVariant({ variantId: "var-single", kind: "SINGLE_LOCUS", description: "single" });
  const variants = [reasoningCell, federated, single];
  const experiment = materializeExperiment({
    experimentId: "exp-1",
    revision: 0,
    objective: "compare",
    scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: scenario.scenarioRevision, digest: scenario.digest }],
    variantRefs: variants.map((variant) => ({ variantId: variant.variantId, digest: variant.digest })),
    measurementPlan: {
      metricIds: ["qualityScore", "unresolvedness"],
      primaryValidatorRef: "validator-1",
      objectives: ["quality"],
      objectiveNote: "decision_aid_not_truth",
    },
    runPolicy: {
      minRunsPerVariantPerScenario: 2,
      maxRuns: 100,
      maxWallClockMs: 1000,
      maxModelCalls: 10,
      maxAttemptsPerRun: 1,
      randomizeOrder: false,
      seed: 1,
    },
  });

  const known = (metricId: string, value: number) =>
    materializeMetric({ metricId, unit: "count", measurementClass: "DIRECTLY_OBSERVED", state: "known", value, provenance: "test" });
  const runs: RunResult[] = [];
  for (const variant of variants) {
    for (let index = 0; index < 2; index += 1) {
      const measurements = variant.kind === "REASONING_CELL" ? [known("unresolvedness", index)] : [known("qualityScore", 50 + index), known("unresolvedness", index)];
      const spec: ExperimentRunSpec = { experiment, scenario, variant, seed: 1, orderIndex: index + 1, warmup: false, attempt: 1 };
      runs.push(
        buildRunResult({
          spec,
          provenance: PROVENANCE,
          execution: { outcome: "PASS", failureClassification: "NONE", measurements, validatorResults: [] },
          startedAt: "2020-01-01T00:00:00.000Z",
          endedAt: "2020-01-01T00:00:01.000Z",
        }),
      );
    }
  }
  const variantStats: VariantStats[] = variants.map((variant) => ({
    variantId: variant.variantId,
    runs: 2,
    outcomes: { pass: 2, fail: 0, unresolved: 0, error: 0 },
    failureClassifications: [],
    distributions: [],
  }));
  const evaluation = materializeEvaluation({
    experimentRef: experiment.experimentId,
    experimentDigest: experiment.digest,
    variantStats,
    pairwise: [],
    pareto: { objectives: ["quality"], frontier: [] },
    sampleSize: { min: 2, max: 2 },
    limitations: ["observed_association_not_causation"],
    warnings: [],
  });
  return {
    experiments: async () => [experiment],
    runs: async () => runs,
    evaluations: async () => [evaluation],
    variants: async () => variants,
  } as unknown as OrganizationMemoryService;
}

function advisorWith(capabilities: Partial<AdvisorCapabilities>, memory?: OrganizationMemoryService) {
  return makeEmpiricalArchitectureAdvisor({
    registry,
    ...(memory === undefined ? {} : { memory }),
    capabilities: {
      independentPeers: capabilities.independentPeers ?? [],
      ...(capabilities.verifierRef === undefined ? {} : { verifierRef: capabilities.verifierRef }),
      campaignMonitoring: capabilities.campaignMonitoring ?? false,
      reasoningBranches: capabilities.reasoningBranches ?? false,
    },
  });
}

function ids(recommendation: ArchitectureRecommendation): readonly string[] {
  return recommendation.eligiblePlans.map((plan) => plan.baseRecipeRef.recipeId);
}

const FOCUS_BLOCKER = "no independent sovereign peer";

/* ------------------------------------------------------------------ *
 * Golden recommendations
 * ------------------------------------------------------------------ */

describe("G10-S advisor golden cases", () => {
  it("A: no peer + high coupling + low decomposability ⇒ FOCUS recommended, COORDINATE blocked, EXPLORE disfavoured", async () => {
    const advisor = advisorWith({ reasoningBranches: true });
    const recommendation = await advisor.recommend({
      taskProfile: taskProfileFromValues({
        decomposability: "LOW",
        crossComponentCoupling: "HIGH",
        verifiability: "LOW",
        parallelSearchBenefit: "LOW",
        authoritySeparationNeed: "NO",
        existingIndependentPeers: "NO",
      }),
    });
    expect(recommendation.recommendedPlan.baseRecipeRef.recipeId).toBe("focus.v1");
    expect(ids(recommendation)).not.toContain("coordinate.v1");
    expect(recommendation.blockers).toContain(FOCUS_BLOCKER);
    expect(recommendation.rationale.some((line) => line.includes("Explore is disfavoured"))).toBe(true);
  });

  it("B: an already-independent peer makes COORDINATE eligible and recommended over the GIVEN refs", async () => {
    const advisor = advisorWith({ independentPeers: [{ peerId: "peer-x" }] });
    const recommendation = await advisor.recommend({
      taskProfile: taskProfileFromValues({
        decomposability: "LOW",
        crossComponentCoupling: "LOW",
        authoritySeparationNeed: "YES",
        existingIndependentPeers: "YES",
      }),
    });
    expect(recommendation.recommendedPlan.baseRecipeRef.recipeId).toBe("coordinate.v1");
    expect(ids(recommendation)).toContain("coordinate.v1");
    expect(recommendation.recommendedPlan.existingSubjectRefs).toEqual(["peer-x"]);
    expect(recommendation.blockers).not.toContain(FOCUS_BLOCKER);
  });

  it("C: high decomposability/verifiability/parallel ⇒ EXPLORE recommended, quality transfer unknown", async () => {
    const advisor = advisorWith({ reasoningBranches: true }, makeMemory());
    const recommendation = await advisor.recommend({
      taskProfile: taskProfileFromValues({
        decomposability: "HIGH",
        crossComponentCoupling: "LOW",
        verifiability: "HIGH",
        parallelSearchBenefit: "HIGH",
      }),
    });
    expect(recommendation.recommendedPlan.baseRecipeRef.recipeId).toBe("explore.v1");
    expect(recommendation.rationale.some((line) => line.toLowerCase().includes("quality transfer"))).toBe(true);
    expect(recommendation.empiricalSupport.length).toBeGreaterThan(0);
    expect(recommendation.empiricalSupport.some((support) => support.transferabilityNotes.includes("quality_transfer_unknown"))).toBe(true);
  });

  it("D: a multi-agent request with no peer ⇒ COORDINATE blocked, EXPLORE offered via ephemeral branches", async () => {
    const advisor = advisorWith({ reasoningBranches: true });
    const recommendation = await advisor.recommend({
      taskProfile: taskProfileFromValues({ decomposability: "LOW", crossComponentCoupling: "HIGH" }),
      userRequestedMultiAgent: true,
    });
    expect(recommendation.recommendedPlan.baseRecipeRef.recipeId).toBe("explore.v1");
    expect(ids(recommendation)).not.toContain("coordinate.v1");
    expect(recommendation.blockers).toContain(FOCUS_BLOCKER);
    expect(recommendation.rationale.some((line) => line.includes("ephemeral branches") && line.includes("durable peer agents"))).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * No score / weight / health
 * ------------------------------------------------------------------ */

describe("G10-S advisor has no score/weight/health", () => {
  it("strict parse rejects an injected score/weight/health field", async () => {
    const recommendation = await advisorWith({}).recommend({ taskProfile: unknownTaskProfile() });
    for (const banned of ["score", "weight", "health", "FocusScore"]) {
      const tampered = { ...JSON.parse(JSON.stringify(recommendation)) as Record<string, unknown>, [banned]: 1 };
      try {
        parseArchitectureRecommendation(tampered);
        throw new Error(`expected unknown_field for "${banned}"`);
      } catch (error) {
        expect(error).toBeInstanceOf(AdvisorError);
        expect((error as AdvisorError).kind).toBe("unknown_field");
      }
    }
    for (const key of Object.keys(recommendation)) {
      expect(["score", "weight", "health"]).not.toContain(key);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Hard ineligibility is not overridable
 * ------------------------------------------------------------------ */

describe("G10-S advisor hard ineligibility", () => {
  it("no peer keeps COORDINATE blocked even under preferences / user override / profiler claims", async () => {
    const advisor = advisorWith({ reasoningBranches: true });
    // An unrecognized override field must not be able to conjure a peer.
    const input = {
      taskProfile: taskProfileFromValues({ authoritySeparationNeed: "YES", existingIndependentPeers: "YES" }),
      preferences: { sharingScope: "team", persistencePreference: "durable", budget: "large" },
      userRequestedMultiAgent: true,
      override: "coordinate.v1",
    } as unknown as Parameters<typeof advisor.recommend>[0];
    const recommendation = await advisor.recommend(input);
    expect(ids(recommendation)).not.toContain("coordinate.v1");
    expect(recommendation.recommendedPlan.baseRecipeRef.recipeId).not.toBe("coordinate.v1");
    expect(recommendation.blockers).toContain(FOCUS_BLOCKER);

    // Even a hand-fabricated recommendation cannot make an ineligible coordinate plan canonical.
    const fabricated = JSON.parse(JSON.stringify(recommendation)) as Record<string, unknown>;
    expect(() => parseArchitectureRecommendation(fabricated)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * Disclosed uncertainty
 * ------------------------------------------------------------------ */

describe("G10-S advisor uncertainty disclosure", () => {
  it("unavailable quality is INSUFFICIENT_EMPIRICAL_EVIDENCE, never 0", async () => {
    const recommendation = await advisorWith({ reasoningBranches: true }, makeMemory()).recommend({ taskProfile: unknownTaskProfile() });
    const unavailableQuality = recommendation.unavailableEvidence.filter((entry) => entry.includes("qualityScore"));
    expect(unavailableQuality.length).toBeGreaterThan(0);
    expect(unavailableQuality.every((entry) => entry.startsWith(INSUFFICIENT_EMPIRICAL_EVIDENCE))).toBe(true);
    expect(unavailableQuality.some((entry) => entry.endsWith(":0"))).toBe(false);
  });

  it("carries transferability warnings and a real sample count", async () => {
    const recommendation = await advisorWith({ reasoningBranches: true }, makeMemory()).recommend({ taskProfile: unknownTaskProfile() });
    expect(recommendation.transferabilityWarnings.length).toBeGreaterThan(0);
    expect(recommendation.transferabilityWarnings).toContain("LIMITED_EMPIRICAL_BASIS");
    expect(recommendation.empiricalSupport.every((support) => Number.isInteger(support.sampleCount))).toBe(true);
    expect(recommendation.empiricalSupport.some((support) => support.sampleCount > 0)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Untrusted profiler boundary
 * ------------------------------------------------------------------ */

describe("G10-S untrusted profiler", () => {
  it("strict-parses profiler output, rejects provenance/recipe fields, and re-sources it as UNTRUSTED_PROFILER", () => {
    expect(() =>
      parseProfilerOutput({ features: [{ feature: "decomposability", value: "HIGH", source: "USER_DECLARED" }] }),
    ).toThrow(/unknown field/);
    expect(() => parseProfilerOutput({ features: [], recipeId: "focus.v1" })).toThrow(/unknown field/);
    expect(parseProfilerOutput({ features: [{ feature: "decomposability", value: "HIGH" }] })).toEqual(new Map([["decomposability", "HIGH"]]));

    const applied = applyProfilerOutput(unknownTaskProfile(), { features: [{ feature: "decomposability", value: "HIGH" }] });
    expect(taskFeatureValue(applied, "decomposability")).toBe("HIGH");
    expect(applied.features.find((entry) => entry.feature === "decomposability")!.source).toBe("UNTRUSTED_PROFILER");
    expect(applied.features.find((entry) => entry.feature === "verifiability")!.source).toBe("UNKNOWN");
  });

  it("profiler output cannot select a recipe: claiming a peer does not conjure one", async () => {
    const advisor = advisorWith({ reasoningBranches: true });
    // The (untrusted) profiler claims an independent peer exists...
    const profile = applyProfilerOutput(unknownTaskProfile(), {
      features: [
        { feature: "authoritySeparationNeed", value: "YES" },
        { feature: "existingIndependentPeers", value: "YES" },
      ],
    });
    const recommendation = await advisor.recommend({ taskProfile: profile });
    // ...but the install has no peer, so COORDINATE stays hard-blocked. A profile is not a chooser.
    expect(ids(recommendation)).not.toContain("coordinate.v1");
    expect(recommendation.blockers).toContain(FOCUS_BLOCKER);
    // And a profile is strict-parsed before use.
    expect(parseTaskProfile(JSON.parse(JSON.stringify(profile)) as unknown)).toEqual(profile);
  });
});
