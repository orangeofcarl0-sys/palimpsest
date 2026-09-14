/**
 * G10-R OrganizationMemory service — empirical observation/history ONLY.
 *
 *   Telemetry ≠ SemanticTruth        ExperimentResult ≠ OrganizationTruth
 *   ObservedAssociation ≠ Causation  HistoricalWinner ≠ FutureAuthority
 *
 * Every write appends ONE content-addressed event to its scope chain after
 * reading the current basis (CAS-guarded `appendAtomic`); every read re-derives
 * state from the append-only history. `similarRuns` is a DETERMINISTIC metadata
 * filter — there are no embeddings and no learned retrieval.
 *
 * The service exposes NO mutator for OrganizationDefinition, RuntimeScope,
 * Commitment, BoundaryState, Evidence truth or Authority, and never imports
 * those concerns.
 */

import type {
  ArchitectureVariant,
  ExperimentDefinition,
  InterventionRecord,
  MeasurementCorrection,
  OrganizationEvaluation,
  RunResult,
  ScenarioDefinition,
  ScenarioFeatureAnnotation,
  VariantKind,
} from "./artifacts.js";
import type {
  OrganizationMemoryBasis,
  OrganizationMemoryEvent,
  OrganizationMemoryEventDraft,
  OrganizationMemoryStore,
} from "./store.js";
import {
  INTERVENTIONS_SCOPE_ID,
  OrganizationMemoryStoreError,
  organizationMemoryEventIdOf,
} from "./store.js";

export interface OrganizationMemoryServiceDeps {
  readonly store: OrganizationMemoryStore;
  /**
   * Accepted for service-layer symmetry. Every organization-memory write is
   * content-addressed and therefore never consults wall-clock time, so this is
   * intentionally not used to derive identity or ordering.
   */
  readonly clock?: () => string;
}

export interface SimilarRunsQuery {
  readonly metricIds?: readonly string[] | undefined;
  readonly scenarioId?: string | undefined;
  readonly variantKind?: VariantKind | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly limit?: number | undefined;
}

export interface OrganizationMemoryService {
  recordExperiment(experiment: ExperimentDefinition): Promise<ExperimentDefinition>;
  recordScenario(experimentId: string, scenario: ScenarioDefinition): Promise<ScenarioDefinition>;
  recordVariant(experimentId: string, variant: ArchitectureVariant): Promise<ArchitectureVariant>;
  recordRun(experimentId: string, run: RunResult): Promise<RunResult>;
  recordEvaluation(experimentId: string, evaluation: OrganizationEvaluation): Promise<OrganizationEvaluation>;
  recordCorrection(experimentId: string, correction: MeasurementCorrection): Promise<MeasurementCorrection>;
  recordIntervention(intervention: InterventionRecord): Promise<InterventionRecord>;
  recordScenarioAnnotation(experimentId: string, annotation: ScenarioFeatureAnnotation): Promise<ScenarioFeatureAnnotation>;
  experiments(): Promise<readonly ExperimentDefinition[]>;
  experiment(experimentId: string): Promise<ExperimentDefinition>;
  scenarios(experimentId: string): Promise<readonly ScenarioDefinition[]>;
  scenarioAnnotations(experimentId: string, scenarioId?: string): Promise<readonly ScenarioFeatureAnnotation[]>;
  variants(experimentId: string): Promise<readonly ArchitectureVariant[]>;
  runs(experimentId: string): Promise<readonly RunResult[]>;
  run(runRef: string): Promise<RunResult | undefined>;
  evaluations(experimentId: string): Promise<readonly OrganizationEvaluation[]>;
  corrections(experimentId: string): Promise<readonly MeasurementCorrection[]>;
  interventions(): Promise<readonly InterventionRecord[]>;
  similarRuns(query: SimilarRunsQuery): Promise<readonly RunResult[]>;
  structuralHistory(subjectRef: string): Promise<readonly InterventionRecord[]>;
}

function fail(kind: ConstructorParameters<typeof OrganizationMemoryStoreError>[0], message: string): never {
  throw new OrganizationMemoryStoreError(kind, message);
}

function emptyBasis(scopeId: string): OrganizationMemoryBasis {
  return Object.freeze({ scopeId, throughSeq: 0, chainDigest: "" });
}

function experimentOf(event: OrganizationMemoryEvent): ExperimentDefinition {
  return (event.payload as { readonly experiment: ExperimentDefinition }).experiment;
}

export function makeOrganizationMemoryService(deps: OrganizationMemoryServiceDeps): OrganizationMemoryService {
  const store = deps.store;

  async function requireExperimentEvents(experimentId: string): Promise<readonly OrganizationMemoryEvent[]> {
    if (experimentId === INTERVENTIONS_SCOPE_ID) fail("unknown_experiment", `"${experimentId}" is the reserved interventions scope, not an experiment`);
    const events = await store.replay(experimentId);
    const first = events[0];
    if (first === undefined || first.type !== "EXPERIMENT_RECORDED") {
      fail("unknown_experiment", `experiment "${experimentId}" is not registered`);
    }
    return events;
  }

  async function append(scopeId: string, allowCreate: boolean, draft: OrganizationMemoryEventDraft): Promise<void> {
    let basis = await store.basis(scopeId);
    if (basis === undefined) {
      if (!allowCreate) fail("unknown_experiment", `experiment "${scopeId}" is not registered`);
      basis = emptyBasis(scopeId);
    }
    await store.appendAtomic({ expectedBasis: basis, events: [draft] });
  }

  async function recordExperiment(experiment: ExperimentDefinition): Promise<ExperimentDefinition> {
    const scopeId = experiment.experimentId;
    const payload = { experiment };
    await append(scopeId, true, { eventId: organizationMemoryEventIdOf("EXPERIMENT_RECORDED", scopeId, payload), type: "EXPERIMENT_RECORDED", payload });
    return experiment;
  }

  async function recordScenario(experimentId: string, scenario: ScenarioDefinition): Promise<ScenarioDefinition> {
    const events = await requireExperimentEvents(experimentId);
    const payload = { scenario };
    await store.appendAtomic({ expectedBasis: basisOf(experimentId, events), events: [{ eventId: organizationMemoryEventIdOf("SCENARIO_RECORDED", experimentId, payload), type: "SCENARIO_RECORDED", payload }] });
    return scenario;
  }

  async function recordVariant(experimentId: string, variant: ArchitectureVariant): Promise<ArchitectureVariant> {
    const events = await requireExperimentEvents(experimentId);
    const payload = { variant };
    await store.appendAtomic({ expectedBasis: basisOf(experimentId, events), events: [{ eventId: organizationMemoryEventIdOf("VARIANT_RECORDED", experimentId, payload), type: "VARIANT_RECORDED", payload }] });
    return variant;
  }

  async function recordRun(experimentId: string, run: RunResult): Promise<RunResult> {
    if (run.experimentRef !== experimentId) fail("invalid_registration", `run "${run.runRef}" references experiment "${run.experimentRef}", not "${experimentId}"`);
    const events = await requireExperimentEvents(experimentId);
    const payload = { run };
    await store.appendAtomic({ expectedBasis: basisOf(experimentId, events), events: [{ eventId: organizationMemoryEventIdOf("RUN_RECORDED", experimentId, payload), type: "RUN_RECORDED", payload }] });
    return run;
  }

  async function recordEvaluation(experimentId: string, evaluation: OrganizationEvaluation): Promise<OrganizationEvaluation> {
    if (evaluation.experimentRef !== experimentId) fail("invalid_registration", `evaluation "${evaluation.evaluationRef}" references experiment "${evaluation.experimentRef}", not "${experimentId}"`);
    const events = await requireExperimentEvents(experimentId);
    const payload = { evaluation };
    await store.appendAtomic({ expectedBasis: basisOf(experimentId, events), events: [{ eventId: organizationMemoryEventIdOf("EVALUATION_RECORDED", experimentId, payload), type: "EVALUATION_RECORDED", payload }] });
    return evaluation;
  }

  async function recordCorrection(experimentId: string, correction: MeasurementCorrection): Promise<MeasurementCorrection> {
    const events = await requireExperimentEvents(experimentId);
    const payload = { correction };
    await store.appendAtomic({ expectedBasis: basisOf(experimentId, events), events: [{ eventId: organizationMemoryEventIdOf("CORRECTION_RECORDED", experimentId, payload), type: "CORRECTION_RECORDED", payload }] });
    return correction;
  }

  async function recordIntervention(intervention: InterventionRecord): Promise<InterventionRecord> {
    const payload = { intervention };
    await append(INTERVENTIONS_SCOPE_ID, true, { eventId: organizationMemoryEventIdOf("INTERVENTION_RECORDED", INTERVENTIONS_SCOPE_ID, payload), type: "INTERVENTION_RECORDED", payload });
    return intervention;
  }

  /**
   * Append an annotation of an existing scenario. Multiple annotations for the same
   * scenario coexist: identity is content-addressed and append-only, so a later
   * annotation never overwrites an earlier one (no last-writer-wins).
   */
  async function recordScenarioAnnotation(experimentId: string, annotation: ScenarioFeatureAnnotation): Promise<ScenarioFeatureAnnotation> {
    const events = await requireExperimentEvents(experimentId);
    const payload = { annotation };
    await store.appendAtomic({
      expectedBasis: basisOf(experimentId, events),
      events: [{ eventId: organizationMemoryEventIdOf("SCENARIO_ANNOTATED", experimentId, payload), type: "SCENARIO_ANNOTATED", payload }],
    });
    return annotation;
  }

  async function experiments(): Promise<readonly ExperimentDefinition[]> {
    const scopes = await store.experiments();
    const definitions: ExperimentDefinition[] = [];
    for (const scopeId of scopes) {
      const events = await store.replay(scopeId);
      const first = events[0];
      if (first === undefined || first.type !== "EXPERIMENT_RECORDED") {
        fail("malformed_record", `experiment scope "${scopeId}" has no experiment definition`);
      }
      definitions.push(experimentOf(first));
    }
    return Object.freeze(definitions);
  }

  async function experiment(experimentId: string): Promise<ExperimentDefinition> {
    const events = await requireExperimentEvents(experimentId);
    return experimentOf(events[0]!);
  }

  function scenarios(experimentId: string): Promise<readonly ScenarioDefinition[]> {
    return readArtifacts(experimentId, "SCENARIO_RECORDED", (event) => (event.payload as { readonly scenario: ScenarioDefinition }).scenario);
  }

  async function scenarioAnnotations(experimentId: string, scenarioId?: string): Promise<readonly ScenarioFeatureAnnotation[]> {
    const all = await readArtifacts(experimentId, "SCENARIO_ANNOTATED", (event) => (event.payload as { readonly annotation: ScenarioFeatureAnnotation }).annotation);
    if (scenarioId === undefined) return all;
    return Object.freeze(all.filter((annotation) => annotation.scenarioId === scenarioId));
  }

  function variants(experimentId: string): Promise<readonly ArchitectureVariant[]> {
    return readArtifacts(experimentId, "VARIANT_RECORDED", (event) => (event.payload as { readonly variant: ArchitectureVariant }).variant);
  }

  function runs(experimentId: string): Promise<readonly RunResult[]> {
    return readArtifacts(experimentId, "RUN_RECORDED", (event) => (event.payload as { readonly run: RunResult }).run);
  }

  function evaluations(experimentId: string): Promise<readonly OrganizationEvaluation[]> {
    return readArtifacts(experimentId, "EVALUATION_RECORDED", (event) => (event.payload as { readonly evaluation: OrganizationEvaluation }).evaluation);
  }

  function corrections(experimentId: string): Promise<readonly MeasurementCorrection[]> {
    return readArtifacts(experimentId, "CORRECTION_RECORDED", (event) => (event.payload as { readonly correction: MeasurementCorrection }).correction);
  }

  async function readArtifacts<T>(experimentId: string, type: OrganizationMemoryEvent["type"], project: (event: OrganizationMemoryEvent) => T): Promise<readonly T[]> {
    const events = await requireExperimentEvents(experimentId);
    const items: T[] = [];
    for (const event of events) {
      if (event.type === type) items.push(project(event));
    }
    return Object.freeze(items);
  }

  async function run(runRef: string): Promise<RunResult | undefined> {
    for (const scopeId of await store.experiments()) {
      const events = await store.replay(scopeId);
      for (const event of events) {
        if (event.type !== "RUN_RECORDED") continue;
        const candidate = (event.payload as { readonly run: RunResult }).run;
        if (candidate.runRef === runRef) return candidate;
      }
    }
    return undefined;
  }

  async function interventions(): Promise<readonly InterventionRecord[]> {
    const events = await store.replay(INTERVENTIONS_SCOPE_ID);
    const records: InterventionRecord[] = [];
    for (const event of events) {
      if (event.type === "INTERVENTION_RECORDED") records.push((event.payload as { readonly intervention: InterventionRecord }).intervention);
    }
    return Object.freeze(records);
  }

  async function similarRuns(query: SimilarRunsQuery): Promise<readonly RunResult[]> {
    const collected: RunResult[] = [];
    const variantKindByKey = new Map<string, VariantKind>();
    for (const scopeId of await store.experiments()) {
      for (const event of await store.replay(scopeId)) {
        if (event.type === "VARIANT_RECORDED") {
          const variant = (event.payload as { readonly variant: ArchitectureVariant }).variant;
          variantKindByKey.set(variantKey(scopeId, variant.variantId), variant.kind);
        } else if (event.type === "RUN_RECORDED") {
          collected.push((event.payload as { readonly run: RunResult }).run);
        }
      }
    }
    const metricIds = query.metricIds;
    const matches = collected.filter((candidate) => {
      if (query.scenarioId !== undefined && candidate.scenarioRef.scenarioId !== query.scenarioId) return false;
      if (query.provider !== undefined && candidate.provenance.provider !== query.provider) return false;
      if (query.model !== undefined && candidate.provenance.model !== query.model) return false;
      if (metricIds !== undefined && metricIds.length > 0) {
        const present = new Set(candidate.measurements.map((measurement) => measurement.metricId));
        if (!metricIds.every((metricId) => present.has(metricId))) return false;
      }
      if (query.variantKind !== undefined) {
        const kind = variantKindByKey.get(variantKey(candidate.experimentRef, candidate.variantRef.variantId));
        if (kind !== query.variantKind) return false;
      }
      return true;
    });
    matches.sort((a, b) => (a.runRef < b.runRef ? -1 : a.runRef > b.runRef ? 1 : 0));
    if (query.limit === undefined) return Object.freeze(matches);
    const limit = Math.max(0, Math.trunc(query.limit));
    return Object.freeze(matches.slice(0, limit));
  }

  async function structuralHistory(subjectRef: string): Promise<readonly InterventionRecord[]> {
    const records = await interventions();
    return Object.freeze(records.filter((record) => record.subjectRefs.includes(subjectRef)));
  }

  return {
    recordExperiment,
    recordScenario,
    recordVariant,
    recordRun,
    recordEvaluation,
    recordCorrection,
    recordIntervention,
    recordScenarioAnnotation,
    experiments,
    experiment,
    scenarios,
    scenarioAnnotations,
    variants,
    runs,
    run,
    evaluations,
    corrections,
    interventions,
    similarRuns,
    structuralHistory,
  };
}

function basisOf(scopeId: string, events: readonly OrganizationMemoryEvent[]): OrganizationMemoryBasis {
  const tail = events[events.length - 1]!;
  return Object.freeze({ scopeId, throughSeq: tail.seq, chainDigest: tail.chainDigest });
}

function variantKey(experimentRef: string, variantId: string): string {
  return `${experimentRef}\u0000${variantId}`;
}
