/**
 * G10-R OrganizationMemory machine proofs.
 *
 *   Telemetry ≠ SemanticTruth        ExperimentResult ≠ OrganizationTruth
 *   ObservedAssociation ≠ Causation  HistoricalWinner ≠ FutureAuthority
 *   OrganizationMemory ≠ PolicyAuthority   Evaluation ≠ Governance
 *
 * Definition-first registration, content-addressed idempotency, CAS basis
 * guards, append-only corrections, the query surface, restart reconstruction
 * and the "unavailable is never 0" rule (R-N02, R-N13, R-N14, EO-A18).
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  INTERVENTIONS_SCOPE_ID,
  OrganizationMemoryStoreError,
  SqliteOrganizationMemoryStore,
  makeOrganizationMemoryService,
  materializeCorrection,
  materializeExperiment,
  materializeIntervention,
  materializeMetric,
  materializeRun,
  materializeScenario,
  materializeVariant,
  organizationMemoryEventIdOf,
  parseRunResult,
  unavailableMetric,
} from "../src/organization_memory/index.js";
import type {
  ArchitectureVariant,
  ExperimentDefinition,
  FailureClassification,
  MetricObservation,
  OrganizationMemoryBasis,
  OrganizationMemoryEvent,
  OrganizationMemoryService,
  RunOutcome,
  RunResult,
  ScenarioDefinition,
  VariantKind,
} from "../src/organization_memory/index.js";
import { buildRunResult, evaluate } from "../src/experiment/index.js";
import type { ExperimentRunSpec } from "../src/experiment/index.js";

/* ------------------------------------------------------------------ *
 * Builders (deterministic, no clock/randomness)
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

function makeVariant(variantId: string, kind: VariantKind = "SINGLE_LOCUS"): ArchitectureVariant {
  return materializeVariant({ variantId, kind, description: `description-${variantId}` });
}

function makeExperiment(input: {
  readonly experimentId: string;
  readonly scenarios: readonly ScenarioDefinition[];
  readonly variants: readonly ArchitectureVariant[];
  readonly revision?: number;
  readonly minRuns?: number;
}): ExperimentDefinition {
  return materializeExperiment({
    experimentId: input.experimentId,
    revision: input.revision ?? 0,
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
      minRunsPerVariantPerScenario: input.minRuns ?? 2,
      maxRuns: 1000,
      maxWallClockMs: 1000,
      maxModelCalls: 100,
      maxAttemptsPerRun: 1,
      randomizeOrder: false,
      seed: 42,
    },
  });
}

function knownMetric(metricId: string, value: number, unit = "count"): MetricObservation {
  return materializeMetric({ metricId, unit, measurementClass: "DIRECTLY_OBSERVED", state: "known", value, provenance: "test" });
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
  readonly provider?: string;
  readonly model?: string;
}): RunResult {
  const spec: ExperimentRunSpec = {
    experiment: input.experiment,
    scenario: input.scenario,
    variant: input.variant,
    seed: 42,
    orderIndex: input.orderIndex ?? 1,
    warmup: input.warmup ?? false,
    attempt: 1,
  };
  return buildRunResult({
    spec,
    provenance: {
      ...PROVENANCE,
      provider: input.provider ?? PROVENANCE.provider,
      model: input.model ?? PROVENANCE.model,
    },
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

function emptyBasis(scopeId: string): OrganizationMemoryBasis {
  return Object.freeze({ scopeId, throughSeq: 0, chainDigest: "" });
}

async function rejectsWithKind(promise: Promise<unknown>, kind: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(OrganizationMemoryStoreError);
    expect((error as OrganizationMemoryStoreError).kind).toBe(kind);
    return;
  }
  throw new Error(`expected rejection with kind "${kind}", but the promise resolved`);
}

function inMemory(): { readonly store: SqliteOrganizationMemoryStore; readonly service: OrganizationMemoryService } {
  const store = new SqliteOrganizationMemoryStore(":memory:");
  return { store, service: makeOrganizationMemoryService({ store }) };
}

/* ------------------------------------------------------------------ *
 * Definition-first registration
 * ------------------------------------------------------------------ */

describe("G10-R OrganizationMemory definition-first registration", () => {
  it("rejects a non-definition as the first event of an empty scope with invalid_registration", async () => {
    const { store } = inMemory();
    const scenario = makeScenario("scn-1");
    await rejectsWithKind(
      store.appendAtomic({
        expectedBasis: emptyBasis("exp-1"),
        events: [{ eventId: "e1", type: "SCENARIO_RECORDED", payload: { scenario } }],
      }),
      "invalid_registration",
    );
    expect(await store.replay("exp-1")).toEqual([]);
    expect(await store.basis("exp-1")).toBeUndefined();
    store.close();
  });

  it("records a valid ExperimentDefinition and reads it back", async () => {
    const { store, service } = inMemory();
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [makeScenario("scn-1")], variants: [makeVariant("var-a")] });
    expect(await service.recordExperiment(experiment)).toEqual(experiment);
    expect(await service.experiment("exp-1")).toEqual(experiment);
    expect(await service.experiments()).toEqual([experiment]);
    store.close();
  });

  it("rejects redefining the same experiment mid-chain with invalid_registration", async () => {
    const { store, service } = inMemory();
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    await service.recordExperiment(experiment);
    const redefined = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant], revision: 1 });
    expect(redefined.digest).not.toBe(experiment.digest);
    await rejectsWithKind(service.recordExperiment(redefined), "invalid_registration");
    expect(await service.experiment("exp-1")).toEqual(experiment);
    store.close();
  });
});

/* ------------------------------------------------------------------ *
 * Idempotency, conflicts, CAS basis, recovery
 * ------------------------------------------------------------------ */

describe("G10-R OrganizationMemory append guards", () => {
  it("replays an identical batch idempotently without duplicating history", async () => {
    const { store } = inMemory();
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [makeScenario("scn-1")], variants: [makeVariant("var-a")] });
    const scenario = makeScenario("scn-1");
    const batch = [
      { eventId: "e-def", type: "EXPERIMENT_RECORDED" as const, payload: { experiment } },
      { eventId: "e-scn", type: "SCENARIO_RECORDED" as const, payload: { scenario } },
    ];
    const first = await store.appendAtomic({ expectedBasis: emptyBasis("exp-1"), events: batch });
    expect(first).toHaveLength(2);
    const basis = await store.basis("exp-1");
    expect(basis).toBeDefined();
    const second = await store.appendAtomic({ expectedBasis: basis!, events: batch });
    expect(second.map((event) => [event.eventId, event.seq, event.chainDigest])).toEqual(
      first.map((event) => [event.eventId, event.seq, event.chainDigest]),
    );
    expect(await store.replay("exp-1")).toHaveLength(2);
    store.close();
  });

  it("rejects an existing eventId with different payload content as event_conflict", async () => {
    const { store } = inMemory();
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [makeScenario("scn-1")], variants: [makeVariant("var-a")] });
    await store.appendAtomic({
      expectedBasis: emptyBasis("exp-1"),
      events: [{ eventId: "e-def", type: "EXPERIMENT_RECORDED", payload: { experiment } }],
    });
    const scenarioOne = makeScenario("scn-1");
    const scenarioTwo = makeScenario("scn-2");
    await store.appendAtomic({
      expectedBasis: (await store.basis("exp-1"))!,
      events: [{ eventId: "shared", type: "SCENARIO_RECORDED", payload: { scenario: scenarioOne } }],
    });
    await rejectsWithKind(
      store.appendAtomic({
        expectedBasis: (await store.basis("exp-1"))!,
        events: [{ eventId: "shared", type: "SCENARIO_RECORDED", payload: { scenario: scenarioTwo } }],
      }),
      "event_conflict",
    );
    expect(await store.replay("exp-1")).toHaveLength(2);
    store.close();
  });

  it("rejects a stale expectedBasis as basis_mismatch", async () => {
    const { store } = inMemory();
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [makeScenario("scn-1")], variants: [makeVariant("var-a")] });
    await store.appendAtomic({
      expectedBasis: emptyBasis("exp-1"),
      events: [{ eventId: "e-def", type: "EXPERIMENT_RECORDED", payload: { experiment } }],
    });
    const stale = (await store.basis("exp-1"))!;
    const scenario = makeScenario("scn-1");
    await store.appendAtomic({
      expectedBasis: stale,
      events: [{ eventId: "e-scn", type: "SCENARIO_RECORDED", payload: { scenario } }],
    });
    expect((await store.basis("exp-1"))!.throughSeq).toBe(stale.throughSeq + 1);
    await rejectsWithKind(
      store.appendAtomic({
        expectedBasis: stale,
        events: [{ eventId: "e-var", type: "VARIANT_RECORDED", payload: { variant: makeVariant("var-a") } }],
      }),
      "basis_mismatch",
    );
    store.close();
  });

  it("requires recovery when an atomic batch is partially present", async () => {
    const { store } = inMemory();
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [makeScenario("scn-1")], variants: [makeVariant("var-a")] });
    await store.appendAtomic({
      expectedBasis: emptyBasis("exp-1"),
      events: [{ eventId: "e-def", type: "EXPERIMENT_RECORDED", payload: { experiment } }],
    });
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const firstDraft = { eventId: "e-scn", type: "SCENARIO_RECORDED" as const, payload: { scenario } };
    const secondDraft = { eventId: "e-var", type: "VARIANT_RECORDED" as const, payload: { variant } };
    await store.appendAtomic({ expectedBasis: (await store.basis("exp-1"))!, events: [firstDraft] });
    await rejectsWithKind(
      store.appendAtomic({ expectedBasis: (await store.basis("exp-1"))!, events: [firstDraft, secondDraft] }),
      "recovery_required",
    );
    expect(await store.replay("exp-1")).toHaveLength(2);
    store.close();
  });
});

/* ------------------------------------------------------------------ *
 * Append-only: corrections leave history readable; duplicate runs are singular
 * ------------------------------------------------------------------ */

describe("G10-R OrganizationMemory append-only history", () => {
  it("recording a correction leaves the original run readable and unchanged (R-N14)", async () => {
    const { store, service } = inMemory();
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    await service.recordExperiment(experiment);
    await service.recordScenario("exp-1", scenario);
    await service.recordVariant("exp-1", variant);
    const run = makeRun({ experiment, scenario, variant, measurements: [knownMetric("qualityScore", 80)] });
    await service.recordRun("exp-1", run);
    const before = (await service.runs("exp-1"))[0]!;
    expect(before.measurements.find((measurement) => measurement.metricId === "qualityScore")?.value).toBe(80);

    const correction = materializeCorrection({
      targetRunRef: run.runRef,
      metricId: "qualityScore",
      corrected: knownMetric("qualityScore", 95),
      reason: "re-scored after manual audit",
    });
    await service.recordCorrection("exp-1", correction);

    const after = (await service.runs("exp-1"))[0]!;
    expect(after).toEqual(before);
    expect(after.measurements.find((measurement) => measurement.metricId === "qualityScore")?.value).toBe(80);
    expect(after.digest).toBe(before.digest);
    expect(await service.corrections("exp-1")).toEqual([correction]);
    store.close();
  });

  it("fails closed on a duplicate run id with different content and stays singular for an identical run (R-N13)", async () => {
    const { store, service } = inMemory();
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    await service.recordExperiment(experiment);
    await service.recordScenario("exp-1", scenario);
    await service.recordVariant("exp-1", variant);

    const runOne = makeRun({ experiment, scenario, variant, measurements: [knownMetric("qualityScore", 70)] });
    const runTwo = makeRun({ experiment, scenario, variant, measurements: [knownMetric("qualityScore", 71)] });
    expect(runTwo.runRef).not.toBe(runOne.runRef);

    // Identical replay: content-addressed id makes it a no-op, never a second entry.
    await service.recordRun("exp-1", runOne);
    await service.recordRun("exp-1", runOne);
    expect(await service.runs("exp-1")).toHaveLength(1);

    // Same eventId forced against different run content must fail closed.
    const eventId = organizationMemoryEventIdOf("RUN_RECORDED", "exp-1", { run: runOne });
    await store.appendAtomic({
      expectedBasis: (await store.basis("exp-1"))!,
      events: [{ eventId, type: "RUN_RECORDED", payload: { run: runOne } }],
    });
    await rejectsWithKind(
      store.appendAtomic({
        expectedBasis: (await store.basis("exp-1"))!,
        events: [{ eventId, type: "RUN_RECORDED", payload: { run: runTwo } }],
      }),
      "event_conflict",
    );
    expect(await service.runs("exp-1")).toHaveLength(1);
    store.close();
  });

  it("binds runRef to the run digest: a tampered duplicate run id fails closed (R-N13)", async () => {
    const { store, service } = inMemory();
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    await service.recordExperiment(experiment);
    await service.recordScenario("exp-1", scenario);
    await service.recordVariant("exp-1", variant);
    const runOne = makeRun({ experiment, scenario, variant, measurements: [knownMetric("qualityScore", 70)] });
    const runTwo = makeRun({ experiment, scenario, variant, measurements: [knownMetric("qualityScore", 71)] });
    expect(runOne.digest).not.toBe(runTwo.digest);
    // runRef is derived from the content digest, so divergent runs cannot share one.
    expect(runOne.runRef).not.toBe(runTwo.runRef);
    expect(() => parseRunResult({ ...runOne, runRef: "shared-run-id" })).toThrow();
    await service.recordRun("exp-1", runOne);
    await service.recordRun("exp-1", runTwo);
    const runs = await service.runs("exp-1");
    expect(runs).toHaveLength(2);
    const refs = runs.map((entry) => parseRunResult(entry).runRef);
    expect(new Set(refs)).toEqual(new Set([runOne.runRef, runTwo.runRef]));
    store.close();
  });
});

/* ------------------------------------------------------------------ *
 * Unavailable is first-class, never coerced to 0 (R-N02)
 * ------------------------------------------------------------------ */

describe("G10-R unavailable metrics (R-N02)", () => {
  it("round-trips an unavailable metric with no value and keeps it distinct from a zero", async () => {
    const { store, service } = inMemory();
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    await service.recordExperiment(experiment);
    await service.recordScenario("exp-1", scenario);
    await service.recordVariant("exp-1", variant);
    const run = makeRun({
      experiment,
      scenario,
      variant,
      measurements: [
        unavailableMetric({ metricId: "qualityScore", unit: "count", detail: "host did not report a score", provenance: "host" }),
      ],
    });
    await service.recordRun("exp-1", run);

    const stored = (await service.runs("exp-1"))[0]!.measurements[0]!;
    expect(stored.state).toBe("unavailable");
    expect(stored.value).toBeUndefined();
    expect(stored.text).toBeUndefined();
    expect(stored.detail).toBe("host did not report a score");
    expect(stored.value ?? 0).toBe(0); // only for the mathematical display; the artifact itself has no value
    expect(Object.hasOwn(stored, "value")).toBe(false);
    store.close();
  });

  it("refuses to construct an unavailable metric that carries value/text (never 0)", () => {
    expect(() =>
      materializeMetric({
        metricId: "qualityScore",
        unit: "count",
        measurementClass: "UNAVAILABLE",
        state: "unavailable",
        value: 0,
        detail: "should not exist",
        provenance: "host",
      }),
    ).toThrowError(/unavailable is never 0/);
    const zeroComparison = unavailableMetric({ metricId: "qualityScore", unit: "count", detail: "missing", provenance: "host" });
    expect(zeroComparison.value).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Query surface
 * ------------------------------------------------------------------ */

describe("G10-R OrganizationMemory query surface", () => {
  it("exposes experiments/scenarios/variants/runs/run/evaluations/corrections/interventions and deterministic similarRuns", async () => {
    const { store, service } = inMemory();
    const scenarioOne = makeScenario("scn-1");
    const scenarioTwo = makeScenario("scn-2");
    const variantA = makeVariant("var-a", "SINGLE_LOCUS");
    const variantB = makeVariant("var-b", "FEDERATED_PEERS");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenarioOne, scenarioTwo], variants: [variantA, variantB] });

    await service.recordExperiment(experiment);
    await service.recordScenario("exp-1", scenarioOne);
    await service.recordScenario("exp-1", scenarioTwo);
    await service.recordVariant("exp-1", variantA);
    await service.recordVariant("exp-1", variantB);

    const runA = makeRun({
      experiment,
      scenario: scenarioOne,
      variant: variantA,
      orderIndex: 1,
      provider: "provider-a",
      model: "model-a",
      measurements: [knownMetric("qualityScore", 90), knownMetric("modelCalls", 4)],
    });
    const runB = makeRun({
      experiment,
      scenario: scenarioTwo,
      variant: variantB,
      orderIndex: 2,
      provider: "provider-b",
      model: "model-b",
      measurements: [knownMetric("qualityScore", 60), knownMetric("modelCalls", 9)],
    });
    await service.recordRun("exp-1", runA);
    await service.recordRun("exp-1", runB);

    const evaluation = evaluate({ experiment, runs: await service.runs("exp-1") });
    await service.recordEvaluation("exp-1", evaluation);

    const intervention = materializeIntervention({
      subjectRefs: ["subject-a", "subject-b"],
      rationale: "observed topology shift",
      observationBasis: "run cluster 1",
      recordedAt: "2020-01-02T00:00:00.000Z",
    });
    await service.recordIntervention(intervention);

    // experiments / experiment
    expect(await service.experiments()).toEqual([experiment]);
    expect(await service.experiment("exp-1")).toEqual(experiment);
    // scenarios / variants
    expect(await service.scenarios("exp-1")).toEqual([scenarioOne, scenarioTwo]);
    expect(await service.variants("exp-1")).toEqual([variantA, variantB]);
    // runs / run
    expect(await service.runs("exp-1")).toEqual([runA, runB]);
    expect(await service.run(runA.runRef)).toEqual(runA);
    expect(await service.run("run-does-not-exist")).toBeUndefined();
    // evaluations / corrections
    expect(await service.evaluations("exp-1")).toEqual([evaluation]);
    expect(await service.corrections("exp-1")).toEqual([]);
    // interventions (reserved scope) + structuralHistory
    expect(await service.interventions()).toEqual([intervention]);
    expect(await service.structuralHistory("subject-a")).toEqual([intervention]);
    expect(await service.structuralHistory("subject-z")).toEqual([]);
    // the interventions scope is not an experiment
    expect(await store.experiments()).toEqual(["exp-1"]);

    // similarRuns: deterministic metadata filter
    expect((await service.similarRuns({})).map((run) => run.runRef)).toEqual([runA.runRef, runB.runRef].sort());
    expect(await service.similarRuns({ provider: "provider-a" })).toEqual([runA]);
    expect(await service.similarRuns({ model: "model-b" })).toEqual([runB]);
    expect(await service.similarRuns({ scenarioId: "scn-2" })).toEqual([runB]);
    expect(await service.similarRuns({ variantKind: "FEDERATED_PEERS" })).toEqual([runB]);
    expect(await service.similarRuns({ metricIds: ["qualityScore", "modelCalls"] })).toHaveLength(2);
    const orderedRefs = [runA.runRef, runB.runRef].sort();
    expect(await service.similarRuns({ metricIds: ["qualityScore"], limit: 1 })).toEqual([orderedRefs[0] === runA.runRef ? runA : runB]);

    store.close();
  });

  it("refuses unknown experiments and the reserved interventions scope", async () => {
    const { store, service } = inMemory();
    await rejectsWithKind(service.recordScenario("exp-missing", makeScenario("scn-1")), "unknown_experiment");
    await rejectsWithKind(service.experiment("exp-missing"), "unknown_experiment");
    await rejectsWithKind(service.experiment(INTERVENTIONS_SCOPE_ID), "unknown_experiment");
    store.close();
  });

  it("refuses a run that references a different experiment as invalid_registration", async () => {
    const { store, service } = inMemory();
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    await service.recordExperiment(experiment);
    const run = makeRun({ experiment, scenario, variant });
    const foreign: RunResult = { ...run, experimentRef: "exp-other" };
    await rejectsWithKind(service.recordRun("exp-1", foreign), "invalid_registration");
    store.close();
  });
});

/* ------------------------------------------------------------------ *
 * Restart / golden reconstruction (EO-A18)
 * ------------------------------------------------------------------ */

describe("G10-R OrganizationMemory restart reconstruction (EO-A18)", () => {
  const tempDirs: string[] = [];
  afterAll(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may still hold a SQLite handle briefly; the OS temp dir is disposable.
      }
    }
  });

  it("reconstructs full history and the evaluation identically after close/reopen", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pal-om-restart-"));
    tempDirs.push(dir);
    const databasePath = join(dir, "organization_memory.sqlite");

    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });

    const firstStore = new SqliteOrganizationMemoryStore(databasePath);
    const firstService = makeOrganizationMemoryService({ store: firstStore });
    await firstService.recordExperiment(experiment);
    await firstService.recordScenario("exp-1", scenario);
    await firstService.recordVariant("exp-1", variant);
    const run = makeRun({ experiment, scenario, variant, measurements: [knownMetric("qualityScore", 77), knownMetric("modelCalls", 3)] });
    await firstService.recordRun("exp-1", run);
    const evaluation = evaluate({ experiment, runs: await firstService.runs("exp-1") });
    await firstService.recordEvaluation("exp-1", evaluation);

    const historyBefore = await firstStore.replay("exp-1");
    const evaluationsBefore = await firstService.evaluations("exp-1");
    expect(historyBefore).toHaveLength(5);
    firstStore.close();

    const secondStore = new SqliteOrganizationMemoryStore(databasePath);
    const secondService = makeOrganizationMemoryService({ store: secondStore });
    const historyAfter = await secondStore.replay("exp-1");
    const evaluationsAfter = await secondService.evaluations("exp-1");

    expect(historyAfter).toEqual(historyBefore);
    expect(historyAfter.map((event: OrganizationMemoryEvent) => event.chainDigest)).toEqual(
      historyBefore.map((event: OrganizationMemoryEvent) => event.chainDigest),
    );
    expect(evaluationsAfter).toEqual(evaluationsBefore);
    expect(evaluationsAfter[0]!.evaluationRef).toBe(evaluation.evaluationRef);
    expect(evaluationsAfter[0]!.digest).toBe(evaluation.digest);
    expect(await secondService.experiment("exp-1")).toEqual(experiment);
    expect(await secondService.runs("exp-1")).toEqual([run]);
    secondStore.close();
  });
});

/* ------------------------------------------------------------------ *
 * Small internal invariant: unchanged materializeRun is importable and stable
 * ------------------------------------------------------------------ */

describe("G10-R materializeRun identity stability", () => {
  it("derives the same runRef/digest for identical content", () => {
    const scenario = makeScenario("scn-1");
    const variant = makeVariant("var-a");
    const experiment = makeExperiment({ experimentId: "exp-1", scenarios: [scenario], variants: [variant] });
    const base = {
      experimentRef: experiment.experimentId,
      scenarioRef: { scenarioId: scenario.scenarioId, scenarioRevision: scenario.scenarioRevision },
      variantRef: { variantId: variant.variantId },
      provenance: {
        ...PROVENANCE,
        scenarioDigest: scenario.digest,
        variantDigest: variant.digest,
        experimentDigest: experiment.digest,
        scenarioClassification: scenario.classification,
        seed: 42,
        orderIndex: 1,
        warmup: false,
        attempt: 1,
      },
      measurements: [knownMetric("qualityScore", 80)],
      outcome: "PASS" as const,
      failureClassification: "NONE" as const,
      validatorVerdicts: [],
      artifactRefs: [],
      startedAt: "2020-01-01T00:00:00.000Z",
      endedAt: "2020-01-01T00:00:01.000Z",
    };
    const first = materializeRun(base);
    const second = materializeRun(base);
    expect(second.runRef).toBe(first.runRef);
    expect(second.digest).toBe(first.digest);
  });
});
