/**
 * G10-R experiment evaluation machine proofs.
 *
 *   Evaluation ≠ Governance       BetterOnMetric ≠ GloballyBetter
 *   Validator ≠ Truth             Failure ≠ Discarded
 *
 * Descriptive statistics (integer-canonical), the Pareto decision aid, the
 * comparability firewall, validator verdict mapping, neutral telemetry,
 * deterministic run planning, retained failures and the PASS/FAIL
 * classification invariant (R-N01..R-N12, EO-A06/A07/A17/A31/A35/A37).
 */

import { describe, expect, it } from "vitest";

import {
  materializeExperiment,
  materializeMetric,
  materializeRun,
  materializeScenario,
  materializeVariant,
  unavailableMetric,
} from "../src/organization_memory/index.js";
import type {
  ArchitectureVariant,
  ExperimentDefinition,
  FailureClassification,
  MetricObservation,
  RunOutcome,
  RunProvenance,
  RunResult,
  ScenarioDefinition,
} from "../src/organization_memory/index.js";
import {
  EvaluationError,
  buildRunResult,
  commandValidator,
  evaluate,
  executeRuns,
  extractSessionTelemetry,
  llmJudgeValidator,
  paretoFrontier,
  planRuns,
  sessionTelemetryMetrics,
  summarize,
  validatorVerdictToOutcome,
} from "../src/experiment/index.js";
import type { ExperimentRunSpec, VariantExecutor } from "../src/experiment/index.js";
import { canonicalDigest } from "../src/schema/canonical.js";

/* ------------------------------------------------------------------ *
 * Builders
 * ------------------------------------------------------------------ */

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

function makeScenario(scenarioId: string, scenarioRevision = 0): ScenarioDefinition {
  return materializeScenario({
    scenarioId,
    scenarioRevision,
    kind: "S1_LOW_COUPLING",
    classification: "OPEN_ENDED",
    task: `task-${scenarioId}`,
    successCriteria: ["criterion"],
    bounds: { maxWallClockMs: 1000, maxModelCalls: 10, maxRunsPerVariant: 10 },
  });
}

function makeVariant(variantId: string): ArchitectureVariant {
  return materializeVariant({ variantId, kind: "SINGLE_LOCUS", description: `description-${variantId}` });
}

function makeExperiment(input: {
  readonly experimentId: string;
  readonly scenarios: readonly ScenarioDefinition[];
  readonly variants: readonly ArchitectureVariant[];
  readonly minRuns?: number;
  readonly maxAttemptsPerRun?: number;
  readonly randomizeOrder?: boolean;
  readonly seed?: number;
}): ExperimentDefinition {
  return materializeExperiment({
    experimentId: input.experimentId,
    revision: 0,
    objective: "compare variants",
    scenarioRefs: input.scenarios.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      scenarioRevision: scenario.scenarioRevision,
      digest: scenario.digest,
    })),
    variantRefs: input.variants.map((variant) => ({ variantId: variant.variantId, digest: variant.digest })),
    measurementPlan: {
      metricIds: ["qualityScore", "modelCalls"],
      primaryValidatorRef: "validator-1",
      objectives: ["quality", "cost"],
      objectiveNote: "decision_aid_not_truth",
    },
    runPolicy: {
      minRunsPerVariantPerScenario: input.minRuns ?? 1,
      maxRuns: 1000,
      maxWallClockMs: 1000,
      maxModelCalls: 100,
      maxAttemptsPerRun: input.maxAttemptsPerRun ?? 1,
      randomizeOrder: input.randomizeOrder ?? false,
      seed: input.seed ?? 42,
    },
  });
}

function known(metricId: string, value: number, unit = "count"): MetricObservation {
  return materializeMetric({ metricId, unit, measurementClass: "DIRECTLY_OBSERVED", state: "known", value, provenance: "test" });
}

function objectives(quality: number, cost: number): readonly MetricObservation[] {
  return [known("qualityScore", quality, "score"), known("modelCalls", cost)];
}

function provenanceFor(
  experiment: ExperimentDefinition,
  scenario: ScenarioDefinition,
  variant: ArchitectureVariant,
  orderIndex: number,
  warmup: boolean,
): RunProvenance {
  return {
    ...PROVENANCE,
    scenarioDigest: scenario.digest,
    variantDigest: variant.digest,
    experimentDigest: experiment.digest,
    scenarioClassification: scenario.classification,
    seed: experiment.runPolicy.seed,
    orderIndex,
    warmup,
    attempt: 1,
  };
}

function makeRun(input: {
  readonly experiment: ExperimentDefinition;
  readonly scenario: ScenarioDefinition;
  readonly variant: ArchitectureVariant;
  readonly orderIndex?: number;
  readonly warmup?: boolean;
  readonly outcome?: RunOutcome;
  readonly failureClassification?: FailureClassification;
  readonly measurements?: readonly MetricObservation[];
}): RunResult {
  const spec: ExperimentRunSpec = {
    experiment: input.experiment,
    scenario: input.scenario,
    variant: input.variant,
    seed: input.experiment.runPolicy.seed,
    orderIndex: input.orderIndex ?? 1,
    warmup: input.warmup ?? false,
    attempt: 1,
  };
  return buildRunResult({
    spec,
    provenance: PROVENANCE,
    execution: {
      outcome: input.outcome ?? "PASS",
      failureClassification: input.failureClassification ?? "NONE",
      measurements: input.measurements ?? [],
      validatorResults: [],
    },
    startedAt: "2020-01-01T00:00:00.000Z",
    endedAt: "2020-01-01T00:00:01.000Z",
  });
}

function runBase(input: {
  readonly experiment: ExperimentDefinition;
  readonly scenario: ScenarioDefinition;
  readonly variant: ArchitectureVariant;
  readonly orderIndex?: number;
  readonly warmup?: boolean;
}) {
  return {
    experimentRef: input.experiment.experimentId,
    scenarioRef: { scenarioId: input.scenario.scenarioId, scenarioRevision: input.scenario.scenarioRevision },
    variantRef: { variantId: input.variant.variantId },
    provenance: provenanceFor(input.experiment, input.scenario, input.variant, input.orderIndex ?? 1, input.warmup ?? false),
    measurements: [] as readonly MetricObservation[],
    validatorVerdicts: [],
    artifactRefs: [] as readonly string[],
    startedAt: "2020-01-01T00:00:00.000Z",
    endedAt: "2020-01-01T00:00:01.000Z",
  };
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      collectKeys(item, keys);
    }
  }
  return keys;
}

function expectEvaluationError(fn: () => unknown, kind: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EvaluationError);
    expect((error as EvaluationError).kind).toBe(kind);
    return;
  }
  throw new Error(`expected EvaluationError "${kind}", but no error was thrown`);
}

const noWait = (): Promise<never> => new Promise<never>(() => undefined);

/* ------------------------------------------------------------------ *
 * summarize / materializeMetric
 * ------------------------------------------------------------------ */

describe("G10-R descriptive statistics", () => {
  it("rounds every statistic to an integer and fits the canonical JSON contract", () => {
    const multi = summarize([1, 2, 3, 4]);
    expect(multi).toEqual({ count: 4, mean: 3, median: 3, min: 1, max: 4, variance: 2, quantiles: { p50: 3, p90: 4 } });
    for (const value of [multi.mean, multi.median, multi.min, multi.max, multi.variance, multi.quantiles!.p50, multi.quantiles!.p90]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(() => canonicalDigest(multi)).not.toThrow();
    expect(() => canonicalDigest(summarize([1, 2]))).not.toThrow();
  });

  it("omits variance for n=1 and includes it for n>=2", () => {
    const single = summarize([5]);
    expect(single.variance).toBeUndefined();
    expect(single.quantiles).toBeUndefined();
    expect(single).toEqual({ count: 1, mean: 5, median: 5, min: 5, max: 5 });
    const pair = summarize([2, 4]);
    expect(pair.variance).toBe(2);
    expect(pair.quantiles).toBeUndefined();
    expect(() => summarize([])).toThrow(RangeError);
  });

  it("rejects a non-integer numeric value and never gives an unavailable metric a value", () => {
    expect(() =>
      materializeMetric({
        metricId: "qualityScore",
        unit: "score",
        measurementClass: "DIRECTLY_OBSERVED",
        state: "known",
        value: 1.5,
        provenance: "test",
      }),
    ).toThrowError(/safe integer/);
    const absent = unavailableMetric({ metricId: "qualityScore", unit: "score", detail: "host did not report", provenance: "test" });
    expect(absent.state).toBe("unavailable");
    expect(absent.value).toBeUndefined();
    expect(Object.hasOwn(absent, "value")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * paretoFrontier
 * ------------------------------------------------------------------ */

describe("G10-R Pareto decision aid (R-N11/EO-A17)", () => {
  it("A dominates B when not worse on all shared observed objectives and better on one", () => {
    const frontier = paretoFrontier({
      variants: [
        { variantId: "A", objectives: { quality: 10, cost: 5 } },
        { variantId: "B", objectives: { quality: 5, cost: 10 } },
      ],
      objectives: ["quality", "cost"],
    });
    expect(frontier).toEqual(["A"]);
  });

  it("skips objectives missing on either side rather than inventing a comparison", () => {
    const skipped = paretoFrontier({
      variants: [
        { variantId: "A", objectives: { quality: 10 } },
        { variantId: "B", objectives: { quality: 5 } },
      ],
      objectives: ["quality", "cost"],
    });
    expect(skipped).toEqual(["A"]);
    const disjoint = paretoFrontier({
      variants: [
        { variantId: "A", objectives: { quality: 10 } },
        { variantId: "B", objectives: { cost: 5 } },
      ],
      objectives: ["quality", "cost"],
    });
    expect(disjoint).toEqual(["A", "B"]);
  });

  it("returns both variants for a non-dominated pair (no forced winner)", () => {
    const frontier = paretoFrontier({
      variants: [
        { variantId: "A", objectives: { quality: 10, cost: 10 } },
        { variantId: "B", objectives: { quality: 5, cost: 5 } },
      ],
      objectives: ["quality", "cost"],
    });
    expect(frontier).toEqual(["A", "B"]);
  });
});

/* ------------------------------------------------------------------ *
 * evaluate — comparability firewall, warnings, uncertainty disclosure
 * ------------------------------------------------------------------ */

describe("G10-R evaluate", () => {
  it("warns fewer_than_min_runs and never fabricates a generalized winner (R-N01)", () => {
    const scenario = makeScenario("scn-1");
    const variantA = makeVariant("var-a");
    const variantB = makeVariant("var-b");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variantA, variantB], minRuns: 3 });
    const runs = [
      makeRun({ experiment, scenario, variant: variantA, orderIndex: 1, measurements: objectives(50, 5) }),
      makeRun({ experiment, scenario, variant: variantB, orderIndex: 1, measurements: objectives(50, 5) }),
    ];
    const evaluation = evaluate({ experiment, runs });
    expect(evaluation.warnings).toContain("fewer_than_min_runs");
    expect(evaluation.variantStats.map((stats) => stats.runs)).toEqual([1, 1]);
    expect(evaluation.pairwise).toHaveLength(1);
    expect(evaluation.pairwise[0]!.dominated).toBe("neither");
    const keys = collectKeys(evaluation);
    for (const banned of ["score", "health", "organizationScore", "winner", "champion"]) {
      expect(keys.has(banned)).toBe(false);
    }
  });

  it("throws scenario_revision_mismatch when the run provenance digest disagrees (R-N06)", () => {
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    const run = makeRun({ experiment, scenario, variant, measurements: objectives(50, 5) });
    const stale: RunResult = { ...run, provenance: { ...run.provenance, scenarioDigest: "0".repeat(64) } };
    expectEvaluationError(() => evaluate({ experiment, runs: [stale] }), "scenario_revision_mismatch");
  });

  it("throws experiment_mismatch when a run belongs to another experiment", () => {
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    const run = makeRun({ experiment, scenario, variant, measurements: objectives(50, 5) });
    const foreign: RunResult = { ...run, experimentRef: "exp-other" };
    expectEvaluationError(() => evaluate({ experiment, runs: [run, foreign] }), "experiment_mismatch");
  });

  // R-N06 firewall (fixed): every run must agree with the SUPPLIED experiment, including the
  // all-foreign case that previously slipped through because only intra-run agreement was checked.
  it("rejects an all-foreign run set whose experimentRef disagrees with the supplied experiment", () => {
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    const run = makeRun({ experiment, scenario, variant, measurements: objectives(50, 5) });
    const foreign: RunResult = { ...run, experimentRef: "exp-other" };
    expectEvaluationError(() => evaluate({ experiment, runs: [foreign] }), "experiment_mismatch");
  });

  it("excludes warmup runs from statistics and discloses the exclusion", () => {
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant], minRuns: 1 });
    const warmup = makeRun({ experiment, scenario, variant, orderIndex: 0, warmup: true, measurements: objectives(999, 999) });
    const scored = makeRun({ experiment, scenario, variant, orderIndex: 1, measurements: objectives(10, 2) });
    const evaluation = evaluate({ experiment, runs: [warmup, scored] });
    expect(evaluation.warnings).toContain("warmup_runs_excluded");
    expect(evaluation.variantStats[0]!.runs).toBe(1);
    const quality = evaluation.variantStats[0]!.distributions.find((distribution) => distribution.metricId === "qualityScore")!;
    expect(quality.mean).toBe(10);
    expect(quality.max).toBe(10);
  });

  it("stores sample counts, warnings and limitations (uncertainty disclosure)", () => {
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    const evaluation = evaluate({
      experiment,
      runs: [makeRun({ experiment, scenario, variant, measurements: [unavailableMetric({ metricId: "qualityScore", unit: "score", detail: "absent", provenance: "x" })] })],
      limitations: ["single_host_only"],
    });
    expect(Object.keys(evaluation.sampleSize).sort()).toEqual(["max", "min"]);
    expect(Number.isInteger(evaluation.sampleSize.min)).toBe(true);
    expect(Number.isInteger(evaluation.sampleSize.max)).toBe(true);
    expect(evaluation.limitations).toContain("observed_association_not_causation");
    expect(evaluation.limitations).toContain("no_universal_score");
    expect(evaluation.limitations).toContain("single_host_only");
    expect(evaluation.warnings.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * Validators
 * ------------------------------------------------------------------ */

describe("G10-R validators", () => {
  it("maps ERROR to ERROR, never FAIL (R-N09)", () => {
    expect(validatorVerdictToOutcome("ERROR")).toBe("ERROR");
    expect(validatorVerdictToOutcome("ERROR")).not.toBe("FAIL");
    expect(validatorVerdictToOutcome("FAIL")).toBe("FAIL");
    expect(validatorVerdictToOutcome("PASS")).toBe("PASS");
    expect(validatorVerdictToOutcome("SCORE")).toBe("PASS");
    expect(validatorVerdictToOutcome("UNRESOLVED")).toBe("UNRESOLVED");
  });

  it("commandValidator: exit 0 is PASS, non-zero is FAIL, a missing executable is ERROR", async () => {
    const pass = commandValidator({ validatorRef: "cmd-pass", command: process.execPath, args: ["-e", "process.exit(0)"] });
    expect(await pass.validate({ runRef: "run-1" })).toEqual({ validatorRef: "cmd-pass", verdict: "PASS" });

    const fail = commandValidator({ validatorRef: "cmd-fail", command: process.execPath, args: ["-e", "process.exit(3)"] });
    const failResult = await fail.validate({ runRef: "run-1" });
    expect(failResult.verdict).toBe("FAIL");
    expect(failResult.detail).toContain("3");

    const missing = commandValidator({ validatorRef: "cmd-missing", command: "this-executable-does-not-exist-xyz" });
    const missingResult = await missing.validate({ runRef: "run-1" });
    expect(missingResult.verdict).toBe("ERROR");
    expect(missingResult.verdict).not.toBe("FAIL");
  });

  it("llmJudgeValidator returns SCORE, and a rejecting judge is ERROR (R-N03)", async () => {
    const scoring = llmJudgeValidator({
      validatorRef: "judge-1",
      judgeModel: "model-x",
      promptVersion: "v1",
      judge: async () => 7,
    });
    expect(await scoring.validate({ runRef: "run-1" })).toEqual({ validatorRef: "judge-1", verdict: "SCORE", score: 7 });

    const rejecting = llmJudgeValidator({
      validatorRef: "judge-2",
      judgeModel: "model-x",
      promptVersion: "v1",
      judge: async () => {
        throw new Error("judge unavailable");
      },
    });
    const rejected = await rejecting.validate({ runRef: "run-1" });
    expect(rejected.verdict).toBe("ERROR");
    expect(rejected.verdict).not.toBe("FAIL");
  });
});

/* ------------------------------------------------------------------ *
 * Telemetry
 * ------------------------------------------------------------------ */

describe("G10-R telemetry (EO-A06/EO-A31)", () => {
  it("extractSessionTelemetry counts turns/steps/tool calls and sums usage buckets", () => {
    const extracted = extractSessionTelemetry([
      { type: "turn/start" },
      { type: "turn/start" },
      { type: "step/start" },
      { type: "step/start" },
      { type: "step/start" },
      { type: "tool/call" },
      { type: "agent/error" },
      { type: "assistant/message", data: { usage: { inputTokens: 10, outputTokens: 5 } } },
      { type: "assistant/message", data: { usage: { inputTokens: 2, cacheReadTokens: 7 } } },
      { type: "assistant/message", data: { usage: { inputTokens: "not-a-number" } } },
      { type: "assistant/message", data: 12 },
    ]);
    expect(extracted.turns).toBe(2);
    expect(extracted.steps).toBe(3);
    expect(extracted.toolCalls).toBe(1);
    expect(extracted.errors).toBe(1);
    expect(extracted.usage.inputTokens).toBe(12);
    expect(extracted.usage.outputTokens).toBe(5);
    expect(extracted.usage.cacheReadTokens).toBe(7);
    expect(extracted.usage.cacheWriteTokens).toBeUndefined();
    expect(extracted.usage.reasoningTokens).toBeUndefined();
  });

  it("sessionTelemetryMetrics marks missing token buckets and estimatedCost UNAVAILABLE, never 0", () => {
    const metrics = sessionTelemetryMetrics({
      provider: "provider-z",
      model: "model-z",
      turns: 2,
      steps: 3,
      toolCalls: 1,
      errors: 0,
      usage: { inputTokens: 10 },
    });
    const byId = new Map(metrics.map((metric) => [metric.metricId, metric]));
    expect(byId.get("inputTokens")!.state).toBe("known");
    expect(byId.get("inputTokens")!.value).toBe(10);
    expect(byId.get("modelCalls")!.state).toBe("known");
    expect(byId.get("modelCalls")!.value).toBe(3);
    expect(byId.get("modelCalls")!.measurementClass).toBe("DERIVED_MECHANICALLY");
    for (const metricId of ["outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "estimatedCost"]) {
      const metric = byId.get(metricId)!;
      expect(metric.state).toBe("unavailable");
      expect(metric.value).toBeUndefined();
      expect(metric.value ?? 0).toBe(0); // display-only; the artifact carries no numeric value
      expect(Object.hasOwn(metric, "value")).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * planRuns / executeRuns
 * ------------------------------------------------------------------ */

describe("G10-R runner", () => {
  it("planRuns emits minRuns x scenarios x variants measured slots plus flagged warmups (EO-A35)", () => {
    const scenarios = [makeScenario("scn-1"), makeScenario("scn-2")];
    const variants = [makeVariant("var-a"), makeVariant("var-b")];
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios, variants, minRuns: 2 });
    const plan = planRuns({ experiment, scenarios, variants, warmupRunsPerVariant: 1 });
    expect(plan).toHaveLength(1 * variants.length + 2 * scenarios.length * variants.length);
    const measured = plan.filter((spec) => !spec.warmup);
    const warmups = plan.filter((spec) => spec.warmup);
    expect(measured).toHaveLength(2 * scenarios.length * variants.length);
    expect(warmups).toHaveLength(variants.length);
    for (const spec of plan) {
      expect(spec.seed).toBe(experiment.runPolicy.seed);
      expect(Number.isInteger(spec.orderIndex)).toBe(true);
      expect(spec.attempt).toBe(1);
    }
    // one measured orderIndex per (scenario, repeat) slot, shared across variants
    const byOrder = new Map<number, ExperimentRunSpec[]>();
    for (const spec of measured) byOrder.set(spec.orderIndex, [...(byOrder.get(spec.orderIndex) ?? []), spec]);
    expect(byOrder.size).toBe(2 * scenarios.length);
    for (const block of byOrder.values()) {
      expect(block).toHaveLength(variants.length);
      expect(new Set(block.map((spec) => spec.scenario.scenarioId)).size).toBe(1);
    }
    expect(planRuns({ experiment, scenarios, variants, warmupRunsPerVariant: 0 }).every((spec) => !spec.warmup)).toBe(true);
    const noAttempts = makeExperiment({ experimentId: "exp-2", scenarios, variants, maxAttemptsPerRun: 0 });
    expect(planRuns({ experiment: noAttempts, scenarios, variants })).toEqual([]);
  });

  it("planRuns is deterministic under randomization with a fixed seed", () => {
    const scenarios = [makeScenario("scn-1"), makeScenario("scn-2")];
    const variants = [makeVariant("var-a"), makeVariant("var-b")];
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios, variants, minRuns: 2, randomizeOrder: true, seed: 1234 });
    const first = planRuns({ experiment, scenarios, variants });
    const second = planRuns({ experiment, scenarios, variants });
    expect(first.map((spec) => [spec.scenario.scenarioId, spec.variant.variantId, spec.orderIndex])).toEqual(
      second.map((spec) => [spec.scenario.scenarioId, spec.variant.variantId, spec.orderIndex]),
    );
  });

  it("retains a throwing executor as an ERROR/HOST_FAILURE RunResult (R-N10/EO-A37)", async () => {
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    const plan = planRuns({ experiment, scenarios: [scenario], variants: [variant] });
    const executor: VariantExecutor = {
      executorId: "throwing",
      variantKind: variant.kind,
      execute: async () => {
        throw new Error("executor exploded");
      },
    };
    const delivered: RunResult[] = [];
    const results = await executeRuns({
      plan,
      executors: [executor],
      validators: [],
      workspaceRoot: process.cwd(),
      onResult: async (run) => {
        delivered.push(run);
      },
      clock: () => "2020-01-01T00:00:00.000Z",
    });
    expect(results).toHaveLength(plan.length);
    expect(delivered).toHaveLength(plan.length);
    expect(results[0]!.outcome).toBe("ERROR");
    expect(results[0]!.failureClassification).toBe("HOST_FAILURE");
    expect(results[0]!.measurements.length).toBeGreaterThan(0);
  });

  it("turns a timeout into a FAIL/TIMEOUT record and keeps every run", async () => {
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    const plan = planRuns({ experiment, scenarios: [scenario], variants: [variant] });
    const executor: VariantExecutor = {
      executorId: "hanging",
      variantKind: variant.kind,
      execute: () => noWait(),
    };
    const results = await executeRuns({
      plan,
      executors: [executor],
      validators: [],
      workspaceRoot: process.cwd(),
      onResult: async () => undefined,
      clock: () => "2020-01-01T00:00:00.000Z",
      timeoutMs: 5,
    });
    expect(results).toHaveLength(plan.length);
    expect(results[0]!.outcome).toBe("FAIL");
    expect(results[0]!.failureClassification).toBe("TIMEOUT");
  });

  it("records an ERROR/HOST_FAILURE run when no executor is registered", async () => {
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    const plan = planRuns({ experiment, scenarios: [scenario], variants: [variant] });
    const results = await executeRuns({
      plan,
      executors: [],
      validators: [],
      workspaceRoot: process.cwd(),
      onResult: async () => undefined,
      clock: () => "2020-01-01T00:00:00.000Z",
    });
    expect(results[0]!.outcome).toBe("ERROR");
    expect(results[0]!.failureClassification).toBe("HOST_FAILURE");
  });

  it("requires NONE for PASS and a classification for every non-PASS run", () => {
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    const base = runBase({ experiment, scenario, variant });

    expect(() => materializeRun({ ...base, outcome: "PASS", failureClassification: "TIMEOUT" })).toThrowError(/PASS run must have failureClassification NONE/);
    expect(() => materializeRun({ ...base, outcome: "FAIL", failureClassification: "NONE" })).toThrowError(/must carry a failureClassification/);
    expect(materializeRun({ ...base, outcome: "PASS", failureClassification: "NONE" }).outcome).toBe("PASS");
    expect(materializeRun({ ...base, outcome: "FAIL", failureClassification: "TIMEOUT" }).failureClassification).toBe("TIMEOUT");

    const spec: ExperimentRunSpec = { experiment, scenario, variant, seed: 1, orderIndex: 1, warmup: false, attempt: 1 };
    expect(() =>
      buildRunResult({
        spec,
        provenance: PROVENANCE,
        execution: { outcome: "PASS", failureClassification: "HOST_FAILURE", measurements: [], validatorResults: [] },
        startedAt: "2020-01-01T00:00:00.000Z",
        endedAt: "2020-01-01T00:00:01.000Z",
      }),
    ).toThrowError(/PASS run must have failureClassification NONE/);
  });
});
