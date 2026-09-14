/**
 * G10-R OrganizationMemory artifacts — immutable EMPIRICAL observation only.
 *
 *   Telemetry ≠ SemanticTruth          ExperimentResult ≠ OrganizationTruth
 *   ObservedAssociation ≠ Causation    BetterOnMetric ≠ GloballyBetter
 *   HistoricalWinner ≠ FutureAuthority OrganizationMemory ≠ PolicyAuthority
 *   OrganizationMemory ≠ DynamicsProposal   Evaluation ≠ Governance
 *
 * These artifacts own empirical history (experiment/scenario/variant definitions, run results,
 * evaluations, corrections, structural intervention records). They own NO OrganizationDefinition,
 * RuntimeScope, Commitment, BoundaryState, Evidence truth or Authority, and expose no mutator for
 * them. `unavailable` is a first-class state and is NEVER written as 0.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";

export const OM_METRIC_DOMAIN = "palimpsest.org-memory.metric.v1";
export const OM_VARIANT_DOMAIN = "palimpsest.org-memory.variant.v1";
export const OM_SCENARIO_DOMAIN = "palimpsest.org-memory.scenario.v1";
export const OM_EXPERIMENT_DOMAIN = "palimpsest.org-memory.experiment.v1";
export const OM_RUN_DOMAIN = "palimpsest.org-memory.run.v1";
export const OM_EVALUATION_DOMAIN = "palimpsest.org-memory.evaluation.v1";
export const OM_CORRECTION_DOMAIN = "palimpsest.org-memory.correction.v1";
export const OM_INTERVENTION_DOMAIN = "palimpsest.org-memory.intervention.v1";

export class OrganizationMemoryError extends Error {
  constructor(
    readonly kind: "malformed_artifact" | "unknown_field" | "invalid_value" | "unknown_schema_version" | "unknown_kind",
    message: string,
  ) {
    super(message);
    this.name = "OrganizationMemoryError";
  }
}

/* ------------------------------------------------------------------ *
 * Strict helpers (fail closed; never an unchecked cast)
 * ------------------------------------------------------------------ */

function fail(kind: OrganizationMemoryError["kind"], message: string): never {
  throw new OrganizationMemoryError(kind, message);
}

export function omObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("malformed_artifact", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function omKeys(object: Record<string, unknown>, allowed: readonly string[], required: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) fail("unknown_field", `${what}: unknown field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key) || object[key] === undefined) {
      fail("malformed_artifact", `${what}: missing required field "${key}"`);
    }
  }
}

function omString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) fail("invalid_value", `${what} must be a non-empty string`);
  return value;
}

function omOptionalString(value: unknown, what: string): string | undefined {
  if (value === undefined) return undefined;
  return omString(value, what);
}

function omBool(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") fail("invalid_value", `${what} must be a boolean`);
  return value;
}

function omEnum<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail("unknown_kind", `${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function omInt(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) fail("invalid_value", `${what} must be an integer`);
  return value;
}

function omNonNegInt(value: unknown, what: string): number {
  const n = omInt(value, what);
  if (n < 0) fail("invalid_value", `${what} must be >= 0`);
  return n;
}

function omNumber(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail("invalid_value", `${what} must be a finite number`);
  return value;
}

function omId(value: unknown, what: string): string {
  if (typeof value !== "string") fail("invalid_value", `${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) fail("invalid_value", `${what} must be a stable identifier`);
  return normalized;
}

function omStringArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) fail("invalid_value", `${what} must be an array`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = omString(item, `${what}[]`);
    if (seen.has(text)) fail("invalid_value", `${what}: duplicate value "${text}"`);
    seen.add(text);
    out.push(text);
  }
  return Object.freeze(out);
}

function omOptionalStringArray(value: unknown, what: string): readonly string[] {
  return value === undefined ? Object.freeze([] as string[]) : omStringArray(value, what);
}

function omDigest(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    fail("invalid_value", `${what} must be a canonical sha256 digest`);
  }
  return value;
}

function refDigest(domain: string, digest: string, prefix: string): string {
  return `${prefix}-${canonicalDigest({ domain, digest }).slice(0, 32)}`;
}

/* ------------------------------------------------------------------ *
 * MetricObservation
 * ------------------------------------------------------------------ */

export const MEASUREMENT_CLASSES = [
  "DIRECTLY_OBSERVED",
  "DERIVED_MECHANICALLY",
  "EXTERNALLY_VALIDATED",
  "LLM_JUDGED",
  "UNAVAILABLE",
] as const;
export type MeasurementClass = (typeof MEASUREMENT_CLASSES)[number];

export const METRIC_STATES = ["known", "unavailable", "error"] as const;
export type MetricState = (typeof METRIC_STATES)[number];

export interface MetricObservation {
  readonly schemaVersion: 1;
  readonly metricId: string;
  readonly version: number;
  readonly unit: string;
  readonly measurementClass: MeasurementClass;
  readonly state: MetricState;
  /** Present iff state === "known" and the metric is numeric. */
  readonly value?: number | undefined;
  /** Present iff state === "known" and the metric is textual. */
  readonly text?: string | undefined;
  /** Present iff state !== "known". */
  readonly detail?: string | undefined;
  readonly provenance: string;
  readonly digest: string;
}

export function metricDigestOf(input: Omit<MetricObservation, "digest">): string {
  return canonicalDigest({ domain: OM_METRIC_DOMAIN, observation: input });
}

export function materializeMetric(input: {
  readonly metricId: string;
  readonly version?: number;
  readonly unit: string;
  readonly measurementClass: MeasurementClass;
  readonly state: MetricState;
  readonly value?: number | undefined;
  readonly text?: string | undefined;
  readonly detail?: string | undefined;
  readonly provenance: string;
}): MetricObservation {
  const base = {
    schemaVersion: 1 as const,
    metricId: omId(input.metricId, "metricId"),
    version: input.version ?? 1,
    unit: omString(input.unit, "unit"),
    measurementClass: input.measurementClass,
    state: input.state,
    provenance: omString(input.provenance, "provenance"),
  };
  if (input.state === "known") {
    const hasValue = input.value !== undefined;
    const hasText = input.text !== undefined;
    if (hasValue === hasText) fail("invalid_value", "a known metric must carry exactly one of value|text");
    if (input.detail !== undefined) fail("invalid_value", "a known metric must not carry detail");
    if (hasValue && !Number.isSafeInteger(input.value!)) {
      fail("invalid_value", "a numeric metric value must be a safe integer (canonical JSON forbids non-integers)");
    }
    const withValue = { ...base, ...(hasValue ? { value: input.value! } : {}), ...(hasText ? { text: input.text! } : {}) };
    return Object.freeze({ ...withValue, digest: metricDigestOf(withValue) });
  }
  if (input.value !== undefined || input.text !== undefined) {
    fail("invalid_value", `a ${input.state} metric must not carry value/text (unavailable is never 0)`);
  }
  const withDetail = { ...base, detail: omString(input.detail, "detail") };
  return Object.freeze({ ...withDetail, digest: metricDigestOf(withDetail) });
}

export function unavailableMetric(input: {
  readonly metricId: string;
  readonly unit: string;
  readonly detail: string;
  readonly provenance: string;
  readonly version?: number;
}): MetricObservation {
  return materializeMetric({ ...input, measurementClass: "UNAVAILABLE", state: "unavailable" });
}

export function parseMetricObservation(raw: unknown, what = "MetricObservation"): MetricObservation {
  const object = omObject(raw, what);
  omKeys(
    object,
    ["schemaVersion", "metricId", "version", "unit", "measurementClass", "state", "value", "text", "detail", "provenance", "digest"],
    ["schemaVersion", "metricId", "version", "unit", "measurementClass", "state", "provenance", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const state = omEnum(object.state, METRIC_STATES, `${what}.state`);
  const measurementClass = omEnum(object.measurementClass, MEASUREMENT_CLASSES, `${what}.measurementClass`);
  const value = object.value === undefined ? undefined : omNumber(object.value, `${what}.value`);
  if (value !== undefined && !Number.isSafeInteger(value)) fail("invalid_value", `${what}.value must be a safe integer`);
  const text = omOptionalString(object.text, `${what}.text`);
  const detail = omOptionalString(object.detail, `${what}.detail`);
  const base = {
    schemaVersion: 1 as const,
    metricId: omId(object.metricId, `${what}.metricId`),
    version: omNonNegInt(object.version, `${what}.version`),
    unit: omString(object.unit, `${what}.unit`),
    measurementClass,
    state,
    provenance: omString(object.provenance, `${what}.provenance`),
  };
  let artifact: Omit<MetricObservation, "digest">;
  if (state === "known") {
    if ((value === undefined) === (text === undefined)) fail("malformed_artifact", `${what}: a known metric needs exactly one of value|text`);
    if (detail !== undefined) fail("malformed_artifact", `${what}: a known metric must not have detail`);
    artifact = { ...base, ...(value === undefined ? {} : { value }), ...(text === undefined ? {} : { text }) };
  } else {
    if (value !== undefined || text !== undefined) fail("malformed_artifact", `${what}: ${state} must not carry value/text`);
    if (detail === undefined) fail("malformed_artifact", `${what}: ${state} requires detail`);
    artifact = { ...base, detail };
  }
  const digest = omDigest(object.digest, `${what}.digest`);
  if (metricDigestOf(artifact) !== digest) fail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...artifact, digest });
}

/* ------------------------------------------------------------------ *
 * ArchitectureVariant — an experimental TREATMENT DESCRIPTOR only
 * ------------------------------------------------------------------ */

export const VARIANT_KINDS = [
  "SINGLE_LOCUS",
  "ARTIFICIAL_ROLE_SPLIT",
  "FEDERATED_PEERS",
  "REASONING_CELL",
  "RUNTIME_TOPOLOGY",
  "CUSTOM_EXISTING_CONFIGURATION",
] as const;
export type VariantKind = (typeof VARIANT_KINDS)[number];

export interface ArchitectureVariant {
  readonly schemaVersion: 1;
  readonly variantId: string;
  readonly kind: VariantKind;
  readonly description: string;
  /** Opaque references to EXISTING system config (peer/profile/topology refs). Not a new ontology. */
  readonly configRefs: readonly string[];
  readonly digest: string;
}

export function variantDigestOf(input: Omit<ArchitectureVariant, "digest">): string {
  return canonicalDigest({ domain: OM_VARIANT_DOMAIN, variant: input });
}

export function materializeVariant(input: {
  readonly variantId: string;
  readonly kind: VariantKind;
  readonly description: string;
  readonly configRefs?: readonly string[];
}): ArchitectureVariant {
  const base = {
    schemaVersion: 1 as const,
    variantId: omId(input.variantId, "variantId"),
    kind: omEnum(input.kind, VARIANT_KINDS, "kind"),
    description: omString(input.description, "description"),
    configRefs: input.configRefs === undefined ? Object.freeze([] as string[]) : omStringArray(input.configRefs, "configRefs"),
  };
  return Object.freeze({ ...base, digest: variantDigestOf(base) });
}

export function parseVariant(raw: unknown, what = "ArchitectureVariant"): ArchitectureVariant {
  const object = omObject(raw, what);
  omKeys(object, ["schemaVersion", "variantId", "kind", "description", "configRefs", "digest"], ["schemaVersion", "variantId", "kind", "description", "configRefs", "digest"], what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const base = {
    schemaVersion: 1 as const,
    variantId: omId(object.variantId, `${what}.variantId`),
    kind: omEnum(object.kind, VARIANT_KINDS, `${what}.kind`),
    description: omString(object.description, `${what}.description`),
    configRefs: omStringArray(object.configRefs, `${what}.configRefs`),
  };
  const digest = omDigest(object.digest, `${what}.digest`);
  if (variantDigestOf(base) !== digest) fail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * ScenarioDefinition — versioned, digest-bound, classification disclosed
 * ------------------------------------------------------------------ */

export const SCENARIO_KINDS = [
  "S1_LOW_COUPLING",
  "S2_INTERFACE_NEGOTIATION",
  "S3_SHARED_CONTEXT",
  "ANTI_AGENTIFICATION",
  "REASONING_DECOMPOSITION",
  "RUNTIME_TOPOLOGY",
] as const;
export type ScenarioKind = (typeof SCENARIO_KINDS)[number];

export const SCENARIO_CLASSIFICATIONS = ["OPEN_ENDED", "SCAFFOLDED", "SCRIPTED_MECHANICAL"] as const;
export type ScenarioClassification = (typeof SCENARIO_CLASSIFICATIONS)[number];

export interface ScenarioBounds {
  readonly maxWallClockMs: number;
  readonly maxModelCalls: number;
  readonly maxRunsPerVariant: number;
}

export interface ScenarioDefinition {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly scenarioRevision: number;
  readonly kind: ScenarioKind;
  /** Disclosure of how much content the scenario supplies (§8). Never reported as autonomous invention. */
  readonly classification: ScenarioClassification;
  readonly task: string;
  readonly allowedHumanIntervention: readonly string[];
  readonly successCriteria: readonly string[];
  readonly validatorRefs: readonly string[];
  readonly bounds: ScenarioBounds;
  readonly digest: string;
}

export function scenarioDigestOf(input: Omit<ScenarioDefinition, "digest">): string {
  return canonicalDigest({ domain: OM_SCENARIO_DOMAIN, scenario: input });
}

export function materializeScenario(input: {
  readonly scenarioId: string;
  readonly scenarioRevision: number;
  readonly kind: ScenarioKind;
  readonly classification: ScenarioClassification;
  readonly task: string;
  readonly allowedHumanIntervention?: readonly string[];
  readonly successCriteria: readonly string[];
  readonly validatorRefs?: readonly string[];
  readonly bounds: ScenarioBounds;
}): ScenarioDefinition {
  const base = {
    schemaVersion: 1 as const,
    scenarioId: omId(input.scenarioId, "scenarioId"),
    scenarioRevision: omNonNegInt(input.scenarioRevision, "scenarioRevision"),
    kind: omEnum(input.kind, SCENARIO_KINDS, "kind"),
    classification: omEnum(input.classification, SCENARIO_CLASSIFICATIONS, "classification"),
    task: omString(input.task, "task"),
    allowedHumanIntervention: input.allowedHumanIntervention === undefined ? Object.freeze([] as string[]) : omStringArray(input.allowedHumanIntervention, "allowedHumanIntervention"),
    successCriteria: omStringArray(input.successCriteria, "successCriteria"),
    validatorRefs: input.validatorRefs === undefined ? Object.freeze([] as string[]) : omStringArray(input.validatorRefs, "validatorRefs"),
    bounds: Object.freeze({
      maxWallClockMs: input.bounds.maxWallClockMs,
      maxModelCalls: input.bounds.maxModelCalls,
      maxRunsPerVariant: input.bounds.maxRunsPerVariant,
    }),
  };
  return Object.freeze({ ...base, digest: scenarioDigestOf(base) });
}

export function parseScenario(raw: unknown, what = "ScenarioDefinition"): ScenarioDefinition {
  const object = omObject(raw, what);
  omKeys(
    object,
    ["schemaVersion", "scenarioId", "scenarioRevision", "kind", "classification", "task", "allowedHumanIntervention", "successCriteria", "validatorRefs", "bounds", "digest"],
    ["schemaVersion", "scenarioId", "scenarioRevision", "kind", "classification", "task", "allowedHumanIntervention", "successCriteria", "validatorRefs", "bounds", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const boundsObject = omObject(object.bounds, `${what}.bounds`);
  omKeys(boundsObject, ["maxWallClockMs", "maxModelCalls", "maxRunsPerVariant"], ["maxWallClockMs", "maxModelCalls", "maxRunsPerVariant"], `${what}.bounds`);
  const base = {
    schemaVersion: 1 as const,
    scenarioId: omId(object.scenarioId, `${what}.scenarioId`),
    scenarioRevision: omNonNegInt(object.scenarioRevision, `${what}.scenarioRevision`),
    kind: omEnum(object.kind, SCENARIO_KINDS, `${what}.kind`),
    classification: omEnum(object.classification, SCENARIO_CLASSIFICATIONS, `${what}.classification`),
    task: omString(object.task, `${what}.task`),
    allowedHumanIntervention: omStringArray(object.allowedHumanIntervention, `${what}.allowedHumanIntervention`),
    successCriteria: omStringArray(object.successCriteria, `${what}.successCriteria`),
    validatorRefs: omStringArray(object.validatorRefs, `${what}.validatorRefs`),
    bounds: Object.freeze({
      maxWallClockMs: omNonNegInt(boundsObject.maxWallClockMs, `${what}.bounds.maxWallClockMs`),
      maxModelCalls: omNonNegInt(boundsObject.maxModelCalls, `${what}.bounds.maxModelCalls`),
      maxRunsPerVariant: omNonNegInt(boundsObject.maxRunsPerVariant, `${what}.bounds.maxRunsPerVariant`),
    }),
  };
  const digest = omDigest(object.digest, `${what}.digest`);
  if (scenarioDigestOf(base) !== digest) fail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * ExperimentDefinition / RunPolicy / MeasurementPlan
 * ------------------------------------------------------------------ */

export const OBJECTIVE_NAMES = ["quality", "latency", "cost", "coordinationCost", "humanIntervention", "recovery"] as const;
export type ObjectiveName = (typeof OBJECTIVE_NAMES)[number];

export interface ExperimentRunPolicy {
  readonly minRunsPerVariantPerScenario: number;
  readonly maxRuns: number;
  readonly maxWallClockMs: number;
  readonly maxModelCalls: number;
  readonly maxAttemptsPerRun: number;
  readonly randomizeOrder: boolean;
  readonly seed: number;
}

export interface ExperimentMeasurementPlan {
  readonly metricIds: readonly string[];
  readonly primaryValidatorRef: string;
  /** An explicit user-selected objective set. NOT a universal score. */
  readonly objectives: readonly ObjectiveName[];
  readonly objectiveNote: "decision_aid_not_truth";
}

export interface ExperimentDefinition {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly revision: number;
  readonly objective: string;
  readonly scenarioRefs: readonly { readonly scenarioId: string; readonly scenarioRevision: number; readonly digest: string }[];
  readonly variantRefs: readonly { readonly variantId: string; readonly digest: string }[];
  readonly measurementPlan: ExperimentMeasurementPlan;
  readonly runPolicy: ExperimentRunPolicy;
  readonly digest: string;
}

export function experimentDigestOf(input: Omit<ExperimentDefinition, "digest">): string {
  return canonicalDigest({ domain: OM_EXPERIMENT_DOMAIN, experiment: input });
}

export function materializeRunPolicy(input: ExperimentRunPolicy): ExperimentRunPolicy {
  return Object.freeze({
    minRunsPerVariantPerScenario: omNonNegInt(input.minRunsPerVariantPerScenario, "runPolicy.minRunsPerVariantPerScenario"),
    maxRuns: omNonNegInt(input.maxRuns, "runPolicy.maxRuns"),
    maxWallClockMs: omNonNegInt(input.maxWallClockMs, "runPolicy.maxWallClockMs"),
    maxModelCalls: omNonNegInt(input.maxModelCalls, "runPolicy.maxModelCalls"),
    maxAttemptsPerRun: omNonNegInt(input.maxAttemptsPerRun, "runPolicy.maxAttemptsPerRun"),
    randomizeOrder: omBool(input.randomizeOrder, "runPolicy.randomizeOrder"),
    seed: omInt(input.seed, "runPolicy.seed"),
  });
}

export function materializeExperiment(input: {
  readonly experimentId: string;
  readonly revision: number;
  readonly objective: string;
  readonly scenarioRefs: readonly { readonly scenarioId: string; readonly scenarioRevision: number; readonly digest: string }[];
  readonly variantRefs: readonly { readonly variantId: string; readonly digest: string }[];
  readonly measurementPlan: ExperimentMeasurementPlan;
  readonly runPolicy: ExperimentRunPolicy;
}): ExperimentDefinition {
  if (input.scenarioRefs.length === 0) fail("invalid_value", "an experiment needs at least one scenario");
  if (input.variantRefs.length === 0) fail("invalid_value", "an experiment needs at least one variant");
  const base = {
    schemaVersion: 1 as const,
    experimentId: omId(input.experimentId, "experimentId"),
    revision: omNonNegInt(input.revision, "revision"),
    objective: omString(input.objective, "objective"),
    scenarioRefs: Object.freeze(
      input.scenarioRefs.map((ref) => Object.freeze({ scenarioId: omId(ref.scenarioId, "scenarioRef.scenarioId"), scenarioRevision: omNonNegInt(ref.scenarioRevision, "scenarioRef.scenarioRevision"), digest: omDigest(ref.digest, "scenarioRef.digest") })),
    ),
    variantRefs: Object.freeze(
      input.variantRefs.map((ref) => Object.freeze({ variantId: omId(ref.variantId, "variantRef.variantId"), digest: omDigest(ref.digest, "variantRef.digest") })),
    ),
    measurementPlan: Object.freeze({
      metricIds: omStringArray(input.measurementPlan.metricIds, "measurementPlan.metricIds"),
      primaryValidatorRef: omString(input.measurementPlan.primaryValidatorRef, "measurementPlan.primaryValidatorRef"),
      objectives: Object.freeze(input.measurementPlan.objectives.map((objective) => omEnum(objective, OBJECTIVE_NAMES, "measurementPlan.objectives[]"))),
      objectiveNote: input.measurementPlan.objectiveNote,
    }),
    runPolicy: materializeRunPolicy(input.runPolicy),
  };
  return Object.freeze({ ...base, digest: experimentDigestOf(base) });
}

export function parseExperiment(raw: unknown, what = "ExperimentDefinition"): ExperimentDefinition {
  const object = omObject(raw, what);
  omKeys(object, ["schemaVersion", "experimentId", "revision", "objective", "scenarioRefs", "variantRefs", "measurementPlan", "runPolicy", "digest"], ["schemaVersion", "experimentId", "revision", "objective", "scenarioRefs", "variantRefs", "measurementPlan", "runPolicy", "digest"], what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  if (!Array.isArray(object.scenarioRefs) || !Array.isArray(object.variantRefs)) fail("malformed_artifact", `${what}: refs must be arrays`);
  const planObject = omObject(object.measurementPlan, `${what}.measurementPlan`);
  omKeys(planObject, ["metricIds", "primaryValidatorRef", "objectives", "objectiveNote"], ["metricIds", "primaryValidatorRef", "objectives", "objectiveNote"], `${what}.measurementPlan`);
  const policyObject = omObject(object.runPolicy, `${what}.runPolicy`);
  omKeys(policyObject, ["minRunsPerVariantPerScenario", "maxRuns", "maxWallClockMs", "maxModelCalls", "maxAttemptsPerRun", "randomizeOrder", "seed"], ["minRunsPerVariantPerScenario", "maxRuns", "maxWallClockMs", "maxModelCalls", "maxAttemptsPerRun", "randomizeOrder", "seed"], `${what}.runPolicy`);
  const base = {
    schemaVersion: 1 as const,
    experimentId: omId(object.experimentId, `${what}.experimentId`),
    revision: omNonNegInt(object.revision, `${what}.revision`),
    objective: omString(object.objective, `${what}.objective`),
    scenarioRefs: Object.freeze(
      (object.scenarioRefs as unknown[]).map((ref, index) => {
        const item = omObject(ref, `${what}.scenarioRefs[${index}]`);
        omKeys(item, ["scenarioId", "scenarioRevision", "digest"], ["scenarioId", "scenarioRevision", "digest"], `${what}.scenarioRefs[${index}]`);
        return Object.freeze({ scenarioId: omId(item.scenarioId, "scenarioId"), scenarioRevision: omNonNegInt(item.scenarioRevision, "scenarioRevision"), digest: omDigest(item.digest, "digest") });
      }),
    ),
    variantRefs: Object.freeze(
      (object.variantRefs as unknown[]).map((ref, index) => {
        const item = omObject(ref, `${what}.variantRefs[${index}]`);
        omKeys(item, ["variantId", "digest"], ["variantId", "digest"], `${what}.variantRefs[${index}]`);
        return Object.freeze({ variantId: omId(item.variantId, "variantId"), digest: omDigest(item.digest, "digest") });
      }),
    ),
    measurementPlan: Object.freeze({
      metricIds: omStringArray(planObject.metricIds, `${what}.measurementPlan.metricIds`),
      primaryValidatorRef: omString(planObject.primaryValidatorRef, `${what}.measurementPlan.primaryValidatorRef`),
      objectives: Object.freeze((omStringArray(planObject.objectives, `${what}.measurementPlan.objectives`) as readonly string[]).map((objective) => omEnum(objective, OBJECTIVE_NAMES, "objectives[]"))),
      objectiveNote: "decision_aid_not_truth" as const,
    }),
    runPolicy: materializeRunPolicy({
      minRunsPerVariantPerScenario: omNonNegInt(policyObject.minRunsPerVariantPerScenario, "minRunsPerVariantPerScenario"),
      maxRuns: omNonNegInt(policyObject.maxRuns, "maxRuns"),
      maxWallClockMs: omNonNegInt(policyObject.maxWallClockMs, "maxWallClockMs"),
      maxModelCalls: omNonNegInt(policyObject.maxModelCalls, "maxModelCalls"),
      maxAttemptsPerRun: omNonNegInt(policyObject.maxAttemptsPerRun, "maxAttemptsPerRun"),
      randomizeOrder: omBool(policyObject.randomizeOrder, "randomizeOrder"),
      seed: omInt(policyObject.seed, "seed"),
    }),
  };
  const digest = omDigest(object.digest, `${what}.digest`);
  if (experimentDigestOf(base) !== digest) fail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * RunProvenance / RunResult
 * ------------------------------------------------------------------ */

export const RUN_OUTCOMES = ["PASS", "FAIL", "UNRESOLVED", "ERROR"] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

export const FAILURE_CLASSIFICATIONS = [
  "NONE",
  "TIMEOUT",
  "SEMANTIC_CONFLICT",
  "HOST_FAILURE",
  "TRANSPORT_FAILURE",
  "AUTHORITY_DENIED",
  "VALIDATION_FAILED",
  "QUALITY_FAILED",
  "USER_ESCALATION",
  "MODEL_NONCOMPLIANCE",
  "UNKNOWN",
] as const;
export type FailureClassification = (typeof FAILURE_CLASSIFICATIONS)[number];

export const VALIDATOR_VERDICTS = ["PASS", "FAIL", "SCORE", "UNRESOLVED", "ERROR"] as const;
export type ValidatorVerdict = (typeof VALIDATOR_VERDICTS)[number];

export interface ValidatorResult {
  readonly validatorRef: string;
  readonly verdict: ValidatorVerdict;
  readonly score?: number | undefined;
  readonly detail?: string | undefined;
}

export interface RunProvenance {
  readonly provider: string;
  readonly model: string;
  readonly hostVersion: string;
  readonly palimpsestSha: string;
  readonly ordariumVersion: string;
  readonly profileDigest: string;
  readonly scenarioDigest: string;
  readonly variantDigest: string;
  readonly experimentDigest: string;
  readonly repoShas: readonly { readonly repo: string; readonly sha: string }[];
  readonly scenarioClassification: ScenarioClassification;
  readonly seed: number;
  readonly orderIndex: number;
  readonly warmup: boolean;
  readonly attempt: number;
  readonly unknowns: readonly string[];
}

export interface RunResult {
  readonly schemaVersion: 1;
  readonly runRef: string;
  readonly experimentRef: string;
  readonly scenarioRef: { readonly scenarioId: string; readonly scenarioRevision: number };
  readonly variantRef: { readonly variantId: string };
  readonly provenance: RunProvenance;
  readonly measurements: readonly MetricObservation[];
  readonly outcome: RunOutcome;
  readonly failureClassification: FailureClassification;
  readonly validatorVerdicts: readonly ValidatorResult[];
  readonly artifactRefs: readonly string[];
  readonly startedAt: string;
  readonly endedAt: string;
  readonly digest: string;
}

export function runDigestOf(input: Omit<RunResult, "digest" | "runRef">): string {
  return canonicalDigest({ domain: OM_RUN_DOMAIN, run: input });
}

/**
 * The run's IDENTITY digest excludes `validatorVerdicts`, so `runRef` can be resolved BEFORE
 * validation and stay equal to the persisted run's ref (validators receive the final runRef).
 * The integrity `digest` still covers the verdicts.
 */
export function runIdentityDigestOf(input: Omit<RunResult, "digest" | "runRef">): string {
  const { validatorVerdicts: _verdicts, ...rest } = input;
  return canonicalDigest({ domain: OM_RUN_DOMAIN, run: rest });
}

export function runRefOf(input: Omit<RunResult, "digest" | "runRef">): string {
  return refDigest(OM_RUN_DOMAIN, runIdentityDigestOf(input), "run");
}

export function materializeRun(input: Omit<RunResult, "digest" | "runRef" | "schemaVersion"> & { readonly runRef?: string }): RunResult {
  if (input.outcome === "PASS" && input.failureClassification !== "NONE") {
    fail("invalid_value", "a PASS run must have failureClassification NONE");
  }
  if (input.outcome !== "PASS" && input.failureClassification === "NONE") {
    fail("invalid_value", `a ${input.outcome} run must carry a failureClassification`);
  }
  const body = {
    schemaVersion: 1 as const,
    experimentRef: omId(input.experimentRef, "experimentRef"),
    scenarioRef: Object.freeze({ scenarioId: omId(input.scenarioRef.scenarioId, "scenarioRef.scenarioId"), scenarioRevision: omNonNegInt(input.scenarioRef.scenarioRevision, "scenarioRef.scenarioRevision") }),
    variantRef: Object.freeze({ variantId: omId(input.variantRef.variantId, "variantRef.variantId") }),
    provenance: input.provenance,
    measurements: input.measurements,
    outcome: omEnum(input.outcome, RUN_OUTCOMES, "outcome"),
    failureClassification: omEnum(input.failureClassification, FAILURE_CLASSIFICATIONS, "failureClassification"),
    validatorVerdicts: input.validatorVerdicts,
    artifactRefs: omStringArray(input.artifactRefs, "artifactRefs"),
    startedAt: omString(input.startedAt, "startedAt"),
    endedAt: omString(input.endedAt, "endedAt"),
  };
  const digest = runDigestOf(body);
  // runRef is DERIVED from the identity digest (excluding verdicts), so a duplicate run id with
  // divergent content is impossible by construction (R-N13), identical content replays
  // idempotently, and the validator-visible runRef equals the persisted one.
  return Object.freeze({ ...body, runRef: runRefOf(body), digest });
}

export function parseRunResult(raw: unknown, what = "RunResult"): RunResult {
  const object = omObject(raw, what);
  omKeys(object, ["schemaVersion", "runRef", "experimentRef", "scenarioRef", "variantRef", "provenance", "measurements", "outcome", "failureClassification", "validatorVerdicts", "artifactRefs", "startedAt", "endedAt", "digest"], ["schemaVersion", "runRef", "experimentRef", "scenarioRef", "variantRef", "provenance", "measurements", "outcome", "failureClassification", "validatorVerdicts", "artifactRefs", "startedAt", "endedAt", "digest"], what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  if (!Array.isArray(object.measurements) || !Array.isArray(object.validatorVerdicts)) fail("malformed_artifact", `${what}: arrays required`);
  const measurements = Object.freeze((object.measurements as unknown[]).map((metric) => parseMetricObservation(metric, `${what}.measurements[]`)));
  const validatorVerdicts = Object.freeze(
    (object.validatorVerdicts as unknown[]).map((entry, index) => {
      const item = omObject(entry, `${what}.validatorVerdicts[${index}]`);
      omKeys(item, ["validatorRef", "verdict", "score", "detail"], ["validatorRef", "verdict"], `${what}.validatorVerdicts[${index}]`);
      return Object.freeze({
        validatorRef: omString(item.validatorRef, "validatorRef"),
        verdict: omEnum(item.verdict, VALIDATOR_VERDICTS, "verdict"),
        ...(item.score === undefined ? {} : { score: omNumber(item.score, "score") }),
        ...(item.detail === undefined ? {} : { detail: omString(item.detail, "detail") }),
      });
    }),
  );
  const scenarioRefObject = omObject(object.scenarioRef, `${what}.scenarioRef`);
  omKeys(scenarioRefObject, ["scenarioId", "scenarioRevision"], ["scenarioId", "scenarioRevision"], `${what}.scenarioRef`);
  const variantRefObject = omObject(object.variantRef, `${what}.variantRef`);
  omKeys(variantRefObject, ["variantId"], ["variantId"], `${what}.variantRef`);
  // Provenance is validated structurally by the store's own contract; here we require the exact key set.
  const provenance = omObject(object.provenance, `${what}.provenance`);
  omKeys(
    provenance,
    ["provider", "model", "hostVersion", "palimpsestSha", "ordariumVersion", "profileDigest", "scenarioDigest", "variantDigest", "experimentDigest", "repoShas", "scenarioClassification", "seed", "orderIndex", "warmup", "attempt", "unknowns"],
    ["provider", "model", "hostVersion", "palimpsestSha", "ordariumVersion", "profileDigest", "scenarioDigest", "variantDigest", "experimentDigest", "repoShas", "scenarioClassification", "seed", "orderIndex", "warmup", "attempt", "unknowns"],
    `${what}.provenance`,
  );
  const body = {
    schemaVersion: 1 as const,
    runRef: omString(object.runRef, `${what}.runRef`),
    experimentRef: omId(object.experimentRef, `${what}.experimentRef`),
    scenarioRef: Object.freeze({ scenarioId: omId(scenarioRefObject.scenarioId, "scenarioId"), scenarioRevision: omNonNegInt(scenarioRefObject.scenarioRevision, "scenarioRevision") }),
    variantRef: Object.freeze({ variantId: omId(variantRefObject.variantId, "variantId") }),
    provenance: provenance as unknown as RunProvenance,
    measurements,
    outcome: omEnum(object.outcome, RUN_OUTCOMES, `${what}.outcome`),
    failureClassification: omEnum(object.failureClassification, FAILURE_CLASSIFICATIONS, `${what}.failureClassification`),
    validatorVerdicts,
    artifactRefs: omStringArray(object.artifactRefs, `${what}.artifactRefs`),
    startedAt: omString(object.startedAt, `${what}.startedAt`),
    endedAt: omString(object.endedAt, `${what}.endedAt`),
  };
  const digest = omDigest(object.digest, `${what}.digest`);
  const { runRef: _ignored, ...content } = body;
  if (runDigestOf(content) !== digest) fail("invalid_value", `${what}.digest does not match its content`);
  if (body.runRef !== runRefOf(content)) {
    fail("invalid_value", `${what}.runRef must be derived from the run identity digest (R-N13)`);
  }
  return Object.freeze({ ...body, digest });
}

/* ------------------------------------------------------------------ *
 * MeasurementCorrection (additive; never overwrites history)
 * ------------------------------------------------------------------ */

export interface MeasurementCorrection {
  readonly schemaVersion: 1;
  readonly correctionRef: string;
  readonly targetRunRef: string;
  readonly metricId: string;
  readonly corrected: MetricObservation;
  readonly reason: string;
  readonly digest: string;
}

export function correctionDigestOf(input: {
  readonly targetRunRef: string;
  readonly metricId: string;
  readonly corrected: MetricObservation;
  readonly reason: string;
}): string {
  return canonicalDigest({ domain: OM_CORRECTION_DOMAIN, targetRunRef: input.targetRunRef, metricId: input.metricId, corrected: input.corrected, reason: input.reason });
}

export function materializeCorrection(input: {
  readonly targetRunRef: string;
  readonly metricId: string;
  readonly corrected: MetricObservation;
  readonly reason: string;
}): MeasurementCorrection {
  const base = {
    schemaVersion: 1 as const,
    targetRunRef: omString(input.targetRunRef, "targetRunRef"),
    metricId: omId(input.metricId, "metricId"),
    corrected: input.corrected,
    reason: omString(input.reason, "reason"),
  };
  const digest = correctionDigestOf(base);
  return Object.freeze({ ...base, correctionRef: refDigest(OM_CORRECTION_DOMAIN, digest, "corr"), digest });
}

export function parseCorrection(raw: unknown, what = "MeasurementCorrection"): MeasurementCorrection {
  const object = omObject(raw, what);
  omKeys(object, ["schemaVersion", "correctionRef", "targetRunRef", "metricId", "corrected", "reason", "digest"], ["schemaVersion", "correctionRef", "targetRunRef", "metricId", "corrected", "reason", "digest"], what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const corrected = parseMetricObservation(object.corrected, `${what}.corrected`);
  const base = {
    schemaVersion: 1 as const,
    correctionRef: omString(object.correctionRef, `${what}.correctionRef`),
    targetRunRef: omString(object.targetRunRef, `${what}.targetRunRef`),
    metricId: omId(object.metricId, `${what}.metricId`),
    corrected,
    reason: omString(object.reason, `${what}.reason`),
  };
  const digest = omDigest(object.digest, `${what}.digest`);
  if (correctionDigestOf(base) !== digest) fail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * InterventionRecord (observational history of a structural change)
 * ------------------------------------------------------------------ */

export interface InterventionRecord {
  readonly schemaVersion: 1;
  readonly interventionRef: string;
  readonly subjectRefs: readonly string[];
  readonly proposalDigest?: string | undefined;
  readonly evolutionCaseRef?: string | undefined;
  readonly beforeRef?: string | undefined;
  readonly afterRef?: string | undefined;
  readonly rationale: string;
  readonly observationBasis: string;
  readonly recordedAt: string;
  readonly digest: string;
}

export function interventionDigestOf(input: {
  readonly subjectRefs: readonly string[];
  readonly rationale: string;
  readonly observationBasis: string;
  readonly recordedAt: string;
  readonly proposalDigest?: string | undefined;
  readonly evolutionCaseRef?: string | undefined;
  readonly beforeRef?: string | undefined;
  readonly afterRef?: string | undefined;
}): string {
  return canonicalDigest({
    domain: OM_INTERVENTION_DOMAIN,
    subjectRefs: input.subjectRefs,
    rationale: input.rationale,
    observationBasis: input.observationBasis,
    recordedAt: input.recordedAt,
    proposalDigest: input.proposalDigest ?? null,
    evolutionCaseRef: input.evolutionCaseRef ?? null,
    beforeRef: input.beforeRef ?? null,
    afterRef: input.afterRef ?? null,
  });
}

export function materializeIntervention(input: {
  readonly subjectRefs: readonly string[];
  readonly rationale: string;
  readonly observationBasis: string;
  readonly recordedAt: string;
  readonly proposalDigest?: string | undefined;
  readonly evolutionCaseRef?: string | undefined;
  readonly beforeRef?: string | undefined;
  readonly afterRef?: string | undefined;
}): InterventionRecord {
  const base = {
    schemaVersion: 1 as const,
    subjectRefs: omStringArray(input.subjectRefs, "subjectRefs"),
    rationale: omString(input.rationale, "rationale"),
    observationBasis: omString(input.observationBasis, "observationBasis"),
    recordedAt: omString(input.recordedAt, "recordedAt"),
    ...(input.proposalDigest === undefined ? {} : { proposalDigest: omDigest(input.proposalDigest, "proposalDigest") }),
    ...(input.evolutionCaseRef === undefined ? {} : { evolutionCaseRef: omString(input.evolutionCaseRef, "evolutionCaseRef") }),
    ...(input.beforeRef === undefined ? {} : { beforeRef: omString(input.beforeRef, "beforeRef") }),
    ...(input.afterRef === undefined ? {} : { afterRef: omString(input.afterRef, "afterRef") }),
  };
  const digest = interventionDigestOf(base);
  return Object.freeze({ ...base, interventionRef: refDigest(OM_INTERVENTION_DOMAIN, digest, "ivr"), digest });
}

export function parseIntervention(raw: unknown, what = "InterventionRecord"): InterventionRecord {
  const object = omObject(raw, what);
  omKeys(object, ["schemaVersion", "interventionRef", "subjectRefs", "proposalDigest", "evolutionCaseRef", "beforeRef", "afterRef", "rationale", "observationBasis", "recordedAt", "digest"], ["schemaVersion", "interventionRef", "subjectRefs", "rationale", "observationBasis", "recordedAt", "digest"], what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const base = {
    schemaVersion: 1 as const,
    interventionRef: omString(object.interventionRef, `${what}.interventionRef`),
    subjectRefs: omStringArray(object.subjectRefs, `${what}.subjectRefs`),
    rationale: omString(object.rationale, `${what}.rationale`),
    observationBasis: omString(object.observationBasis, `${what}.observationBasis`),
    recordedAt: omString(object.recordedAt, `${what}.recordedAt`),
    ...(object.proposalDigest === undefined ? {} : { proposalDigest: omDigest(object.proposalDigest, `${what}.proposalDigest`) }),
    ...(object.evolutionCaseRef === undefined ? {} : { evolutionCaseRef: omString(object.evolutionCaseRef, `${what}.evolutionCaseRef`) }),
    ...(object.beforeRef === undefined ? {} : { beforeRef: omString(object.beforeRef, `${what}.beforeRef`) }),
    ...(object.afterRef === undefined ? {} : { afterRef: omString(object.afterRef, `${what}.afterRef`) }),
  };
  const digest = omDigest(object.digest, `${what}.digest`);
  if (interventionDigestOf(base) !== digest) fail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

export { refDigest, omStringArray, omOptionalStringArray };

/* ------------------------------------------------------------------ *
 * OrganizationEvaluation — derived empirical artifact (never a score)
 * ------------------------------------------------------------------ */

export const OM_DOMINANCE = ["A", "B", "neither", "unknown"] as const;
export type Dominance = (typeof OM_DOMINANCE)[number];

export interface MetricDistribution {
  readonly metricId: string;
  readonly unit: string;
  readonly measurementClass: MeasurementClass;
  readonly count: number;
  readonly known: number;
  readonly unavailable: number;
  readonly error: number;
  readonly mean?: number | undefined;
  readonly median?: number | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly variance?: number | undefined;
  readonly quantiles?: { readonly p50: number; readonly p90: number } | undefined;
}

export interface VariantStats {
  readonly variantId: string;
  readonly runs: number;
  readonly outcomes: { readonly pass: number; readonly fail: number; readonly unresolved: number; readonly error: number };
  readonly failureClassifications: readonly { readonly classification: FailureClassification; readonly count: number }[];
  readonly distributions: readonly MetricDistribution[];
}

export interface PairwiseComparison {
  readonly variantA: string;
  readonly variantB: string;
  readonly scenarioId: string;
  readonly scenarioRevision: number;
  readonly pairedRuns: number;
  readonly metricDeltas: readonly {
    readonly metricId: string;
    readonly aMedian?: number | undefined;
    readonly bMedian?: number | undefined;
    readonly delta?: number | undefined;
    readonly note: string;
  }[];
  readonly dominated: Dominance;
}

export interface OrganizationEvaluation {
  readonly schemaVersion: 1;
  readonly evaluationRef: string;
  readonly experimentRef: string;
  readonly experimentDigest: string;
  readonly variantStats: readonly VariantStats[];
  readonly pairwise: readonly PairwiseComparison[];
  readonly pareto: { readonly objectives: readonly ObjectiveName[]; readonly frontier: readonly string[] };
  readonly sampleSize: { readonly min: number; readonly max: number };
  readonly limitations: readonly string[];
  readonly warnings: readonly string[];
  readonly digest: string;
}

export function evaluationDigestOf(input: Omit<OrganizationEvaluation, "digest" | "evaluationRef">): string {
  return canonicalDigest({ domain: OM_EVALUATION_DOMAIN, evaluation: input });
}

export function materializeEvaluation(input: Omit<OrganizationEvaluation, "digest" | "evaluationRef" | "schemaVersion">): OrganizationEvaluation {
  const body = { schemaVersion: 1 as const, ...input };
  const digest = evaluationDigestOf(body);
  return Object.freeze({ ...body, evaluationRef: refDigest(OM_EVALUATION_DOMAIN, digest, "eval"), digest });
}

export function parseEvaluation(raw: unknown, what = "OrganizationEvaluation"): OrganizationEvaluation {
  const object = omObject(raw, what);
  omKeys(
    object,
    ["schemaVersion", "evaluationRef", "experimentRef", "experimentDigest", "variantStats", "pairwise", "pareto", "sampleSize", "limitations", "warnings", "digest"],
    ["schemaVersion", "evaluationRef", "experimentRef", "experimentDigest", "variantStats", "pairwise", "pareto", "sampleSize", "limitations", "warnings", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  // The evaluation is a derived read model: structural validation of nested arrays is done here,
  // while the store keeps the canonical JSON. We validate the digest over the exact stored content.
  const body = {
    schemaVersion: 1 as const,
    experimentRef: omId(object.experimentRef, `${what}.experimentRef`),
    experimentDigest: omDigest(object.experimentDigest, `${what}.experimentDigest`),
    variantStats: object.variantStats as readonly VariantStats[],
    pairwise: object.pairwise as readonly PairwiseComparison[],
    pareto: object.pareto as { readonly objectives: readonly ObjectiveName[]; readonly frontier: readonly string[] },
    sampleSize: object.sampleSize as { readonly min: number; readonly max: number },
    limitations: omStringArray(object.limitations, `${what}.limitations`),
    warnings: omStringArray(object.warnings, `${what}.warnings`),
  };
  const digest = omDigest(object.digest, `${what}.digest`);
  if (evaluationDigestOf(body) !== digest) fail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...body, evaluationRef: omString(object.evaluationRef, `${what}.evaluationRef`), digest });
}
