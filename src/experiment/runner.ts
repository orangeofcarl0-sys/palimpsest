/**
 * G10-R experiment runner — ORCHESTRATION ONLY.
 *
 *   Runner ≠ Judge          Execution ≠ SemanticDecision
 *   ObservedRun ≠ Truth      Failure ≠ Discarded
 *
 * The runner schedules runs, invokes an executor, times it out, attaches
 * validator verdicts and retains every outcome — including failures. It never
 * decides whether a run "succeeded" in any semantic sense and never turns a
 * validator score into truth. Executors own the work; validators own the
 * evidence; the runner owns only the schedule and the record.
 */

import { materializeRun } from "../organization_memory/artifacts.js";
import type {
  ArchitectureVariant,
  ExperimentDefinition,
  FailureClassification,
  MetricObservation,
  RunOutcome,
  RunProvenance,
  RunResult,
  ScenarioDefinition,
  ValidatorResult,
  VariantKind,
} from "../organization_memory/artifacts.js";
import { unavailableTelemetry } from "./telemetry.js";
import type { ExperimentValidatorPort, ValidatorInput } from "./validators.js";

/* ------------------------------------------------------------------ *
 * Ports and value types
 * ------------------------------------------------------------------ */

export interface VariantExecutor {
  readonly executorId: string;
  readonly variantKind: VariantKind;
  execute(
    spec: ExperimentRunSpec,
    context: { signal: AbortSignal; workspacePath: string },
  ): Promise<VariantExecutionResult>;
}

export interface ExperimentRunSpec {
  readonly experiment: ExperimentDefinition;
  readonly scenario: ScenarioDefinition;
  readonly variant: ArchitectureVariant;
  readonly seed: number;
  readonly orderIndex: number;
  readonly warmup: boolean;
  readonly attempt: number;
}

export interface VariantExecutionResult {
  readonly outcome: RunOutcome;
  readonly failureClassification: FailureClassification;
  readonly measurements: readonly MetricObservation[];
  readonly validatorResults: readonly ValidatorResult[];
  readonly artifactRefs?: readonly string[] | undefined;
}

/* ------------------------------------------------------------------ *
 * run result assembly
 * ------------------------------------------------------------------ */

/**
 * Assemble a RunResult from a spec, caller-supplied provenance and the
 * executor's result. The scenario/variant/experiment digests, classification,
 * seed, orderIndex, warmup flag and attempt are ALWAYS taken from the spec so a
 * record cannot disagree with the plan that produced it.
 */
export function buildRunResult(input: {
  readonly spec: ExperimentRunSpec;
  readonly provenance: Omit<
    RunProvenance,
    | "scenarioDigest"
    | "variantDigest"
    | "experimentDigest"
    | "scenarioClassification"
    | "seed"
    | "orderIndex"
    | "warmup"
    | "attempt"
    | "experimentDigest"
  > &
    Partial<RunProvenance>;
  readonly execution: VariantExecutionResult;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly runRef?: string;
}): RunResult {
  const spec = input.spec;
  const provenance: RunProvenance = {
    provider: input.provenance.provider,
    model: input.provenance.model,
    hostVersion: input.provenance.hostVersion,
    palimpsestSha: input.provenance.palimpsestSha,
    ordariumVersion: input.provenance.ordariumVersion,
    profileDigest: input.provenance.profileDigest,
    repoShas: input.provenance.repoShas,
    unknowns: input.provenance.unknowns,
    scenarioDigest: spec.scenario.digest,
    variantDigest: spec.variant.digest,
    experimentDigest: spec.experiment.digest,
    scenarioClassification: spec.scenario.classification,
    seed: spec.seed,
    orderIndex: spec.orderIndex,
    warmup: spec.warmup,
    attempt: spec.attempt,
  };
  return materializeRun({
    experimentRef: spec.experiment.experimentId,
    scenarioRef: { scenarioId: spec.scenario.scenarioId, scenarioRevision: spec.scenario.scenarioRevision },
    variantRef: { variantId: spec.variant.variantId },
    provenance,
    measurements: input.execution.measurements,
    outcome: input.execution.outcome,
    failureClassification: input.execution.failureClassification,
    validatorVerdicts: input.execution.validatorResults,
    artifactRefs: input.execution.artifactRefs ?? [],
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    ...(input.runRef === undefined ? {} : { runRef: input.runRef }),
  });
}

/* ------------------------------------------------------------------ *
 * planning
 * ------------------------------------------------------------------ */

type DraftRunSpec = Omit<ExperimentRunSpec, "orderIndex">;

interface RunBlock {
  orderIndex: number;
  readonly specs: readonly DraftRunSpec[];
}

/** Tiny deterministic xorshift32 PRNG (seeded by runPolicy.seed). */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = rng() % (index + 1);
    const temp = items[index]!;
    items[index] = items[swapIndex]!;
    items[swapIndex] = temp;
  }
}

export interface PlanRunsInput {
  readonly experiment: ExperimentDefinition;
  readonly scenarios: readonly ScenarioDefinition[];
  readonly variants: readonly ArchitectureVariant[];
  readonly warmupRunsPerVariant?: number;
}

/**
 * Build the run plan: warmup runs first (per variant), then the cartesian
 * product scenario × variant × repeats where `repeats` is the experiment's
 * `minRunsPerVariantPerScenario`.
 *
 * `orderIndex` identifies a comparison slot, not an array position: every
 * variant in one (scenario, repeat) slot shares its `orderIndex`, which is what
 * lets evaluation pair runs across variants. When `randomizeOrder` is set the
 * measured slots are permuted with a deterministic xorshift PRNG seeded by
 * `runPolicy.seed`; warmup runs stay ahead of measured runs.
 *
 * Bounds: the flattened plan never exceeds `maxRuns`; `attempt` starts at 1 and
 * no plan is produced when `maxAttemptsPerRun < 1`.
 */
export function planRuns(input: PlanRunsInput): ExperimentRunSpec[] {
  const experiment = input.experiment;
  const policy = experiment.runPolicy;
  if (policy.maxAttemptsPerRun < 1) return [];
  const scenarios = input.scenarios;
  const variants = input.variants;
  if (scenarios.length === 0 || variants.length === 0) return [];

  const repeats = Math.max(0, Math.floor(policy.minRunsPerVariantPerScenario));
  const warmupCount = Math.max(0, Math.floor(input.warmupRunsPerVariant ?? 0));

  const base = (scenario: ScenarioDefinition, variant: ArchitectureVariant, warmup: boolean): DraftRunSpec => ({
    experiment,
    scenario,
    variant,
    seed: policy.seed,
    warmup,
    attempt: 1,
  });

  /* Warmups first, grouped per variant. */
  const blocks: RunBlock[] = [];
  let nextOrderIndex = 0;
  for (const variant of variants) {
    for (let warmup = 0; warmup < warmupCount; warmup += 1) {
      const scenario = scenarios[warmup % scenarios.length]!;
      blocks.push({ orderIndex: nextOrderIndex, specs: [base(scenario, variant, true)] });
      nextOrderIndex += 1;
    }
  }

  /* Measured slots: one per (scenario, repeat), shared across variants. */
  const measuredBlocks: RunBlock[] = [];
  for (const scenario of scenarios) {
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      measuredBlocks.push({
        orderIndex: -1,
        specs: variants.map((variant) => base(scenario, variant, false)),
      });
    }
  }
  if (policy.randomizeOrder) {
    shuffleInPlace(measuredBlocks, makeRng(policy.seed));
  }
  measuredBlocks.forEach((block, position) => {
    block.orderIndex = nextOrderIndex + position;
  });
  blocks.push(...measuredBlocks);

  /* Flatten, enforcing the maxRuns bound. */
  const maxRuns = Math.max(0, Math.floor(policy.maxRuns));
  const plan: ExperimentRunSpec[] = [];
  for (const block of blocks) {
    if (plan.length >= maxRuns) break;
    for (const spec of block.specs) {
      if (plan.length >= maxRuns) break;
      plan.push({ ...spec, orderIndex: block.orderIndex });
    }
  }
  return plan;
}

/* ------------------------------------------------------------------ *
 * execution
 * ------------------------------------------------------------------ */

class ExecutionTimeoutError extends Error {
  constructor() {
    super("execution timed out");
    this.name = "ExecutionTimeoutError";
  }
}

type ProvenanceBase = Omit<
  RunProvenance,
  | "scenarioDigest"
  | "variantDigest"
  | "experimentDigest"
  | "scenarioClassification"
  | "seed"
  | "orderIndex"
  | "warmup"
  | "attempt"
>;

function knownTextMetric(measurements: readonly MetricObservation[], metricId: string): string | undefined {
  for (const measurement of measurements) {
    if (measurement.metricId === metricId && measurement.state === "known" && typeof measurement.text === "string") {
      return measurement.text;
    }
  }
  return undefined;
}

/**
 * Provenance the runner can honestly assert from telemetry alone. Config
 * identity it cannot observe is named in `unknowns` rather than fabricated.
 */
function unreportedProvenance(execution: VariantExecutionResult): ProvenanceBase {
  const provider = knownTextMetric(execution.measurements, "provider");
  const model = knownTextMetric(execution.measurements, "model");
  const unknowns: string[] = ["hostVersion", "palimpsestSha", "ordariumVersion", "profileDigest"];
  if (provider === undefined) unknowns.push("provider");
  if (model === undefined) unknowns.push("model");
  return {
    provider: provider ?? "unreported",
    model: model ?? "unreported",
    hostVersion: "unreported",
    palimpsestSha: "unreported",
    ordariumVersion: "unreported",
    profileDigest: "unreported",
    repoShas: [],
    unknowns,
  };
}

function failureExecution(
  outcome: RunOutcome,
  failureClassification: FailureClassification,
  reason: string,
): VariantExecutionResult {
  return {
    outcome,
    failureClassification,
    measurements: unavailableTelemetry(reason),
    validatorResults: [],
  };
}

/**
 * Seal a verdict for canonical persistence. Run digests are canonical JSON,
 * which forbids non-integers, so a numeric score must be a safe integer or the
 * whole run becomes unpersistable. Scores that are not canonical are snapped to
 * the nearest integer (the codebase's score convention); a value that cannot be
 * made canonical at all becomes ERROR rather than destroying the run.
 */
function sealValidatorResult(result: ValidatorResult): ValidatorResult {
  if (result.score === undefined || Number.isSafeInteger(result.score)) return result;
  const rounded = Math.round(result.score);
  if (!Number.isSafeInteger(rounded)) {
    return {
      validatorRef: result.validatorRef,
      verdict: "ERROR",
      detail: `non-canonical score from ${result.validatorRef}`,
    };
  }
  return {
    validatorRef: result.validatorRef,
    verdict: result.verdict,
    score: rounded,
    ...(result.detail === undefined ? {} : { detail: result.detail }),
  };
}

async function collectValidatorResults(
  validators: readonly ExperimentValidatorPort[],
  runRef: string,
  workspacePath: string,
  artifactRefs: readonly string[] | undefined,
): Promise<readonly ValidatorResult[]> {
  const results: ValidatorResult[] = [];
  for (const validator of validators) {
    const validatorInput: ValidatorInput = {
      runRef,
      workspacePath,
      ...(artifactRefs === undefined ? {} : { artifactRefs }),
    };
    try {
      results.push(sealValidatorResult(await validator.validate(validatorInput)));
    } catch (error) {
      results.push({
        validatorRef: validator.validatorRef,
        verdict: "ERROR",
        detail: error instanceof Error ? error.message : "validator threw",
      });
    }
  }
  return Object.freeze(results);
}

async function executeOne(input: {
  readonly spec: ExperimentRunSpec;
  readonly executor: VariantExecutor | undefined;
  readonly validators: readonly ExperimentValidatorPort[];
  readonly workspaceRoot: string;
  readonly clock: () => string;
  readonly timeoutMs: number | undefined;
}): Promise<RunResult> {
  const spec = input.spec;
  const executor = input.executor;
  const startedAt = input.clock();

  let execution: VariantExecutionResult;
  if (executor === undefined) {
    execution = failureExecution(
      "ERROR",
      "HOST_FAILURE",
      `no executor registered for variant kind ${spec.variant.kind}`,
    );
  } else {
    const controller = new AbortController();
    const timeoutMs = input.timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ExecutionTimeoutError());
        }, timeoutMs);
      }
    });
    try {
      execution = await Promise.race([
        Promise.resolve().then(() =>
          executor.execute(spec, { signal: controller.signal, workspacePath: input.workspaceRoot }),
        ),
        timeoutPromise,
      ]);
    } catch (error) {
      if (error instanceof ExecutionTimeoutError) {
        execution = failureExecution("FAIL", "TIMEOUT", `execution exceeded ${timeoutMs}ms`);
      } else if (error instanceof Error) {
        execution = failureExecution("ERROR", "HOST_FAILURE", error.message);
      } else {
        execution = failureExecution("ERROR", "UNKNOWN", "executor threw a non-error value");
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /* Validators receive the run's reference, so runRef is resolved before the
   * verdicts are sealed. runRef is not part of the run digest, so passing it
   * back keeps the validator's reference equal to the final result's. */
  const provisional = buildRunResult({
    spec,
    provenance: unreportedProvenance(execution),
    execution: { ...execution, validatorResults: Object.freeze([] as ValidatorResult[]) },
    startedAt,
    endedAt: input.clock(),
  });
  const validatorResults = await collectValidatorResults(
    input.validators,
    provisional.runRef,
    input.workspaceRoot,
    execution.artifactRefs,
  );
  const finalExecution: VariantExecutionResult = { ...execution, validatorResults };
  return buildRunResult({
    spec,
    provenance: unreportedProvenance(finalExecution),
    execution: finalExecution,
    startedAt,
    endedAt: input.clock(),
    runRef: provisional.runRef,
  });
}

export interface ExecuteRunsInput {
  readonly plan: readonly ExperimentRunSpec[];
  readonly executors: readonly VariantExecutor[];
  readonly validators: readonly ExperimentValidatorPort[];
  readonly workspaceRoot: string;
  readonly onResult: (run: RunResult) => Promise<void>;
  readonly clock?: (() => string) | undefined;
  readonly timeoutMs?: number | undefined;
}

/**
 * Execute every spec, in plan order. Each run is retained: a timeout becomes a
 * FAIL/TIMEOUT record, a thrown or host failure becomes ERROR/HOST_FAILURE, and
 * any unexpected orchestration fault becomes ERROR/UNKNOWN. Validator verdicts
 * are attached to every retained record. `onResult` is awaited for each run and
 * failures are never swallowed.
 */
export async function executeRuns(input: ExecuteRunsInput): Promise<readonly RunResult[]> {
  const clock = input.clock ?? (() => new Date().toISOString());
  const results: RunResult[] = [];
  for (const spec of input.plan) {
    const executor = input.executors.find((candidate) => candidate.variantKind === spec.variant.kind);
    const configuredTimeout = input.timeoutMs ?? spec.experiment.runPolicy.maxWallClockMs;
    const timeoutMs = configuredTimeout > 0 ? configuredTimeout : undefined;
    let run: RunResult;
    try {
      run = await executeOne({
        spec,
        executor,
        validators: input.validators,
        workspaceRoot: input.workspaceRoot,
        clock,
        timeoutMs,
      });
    } catch (error) {
      const failure = failureExecution(
        "ERROR",
        "UNKNOWN",
        error instanceof Error ? error.message : "run orchestration failed",
      );
      run = buildRunResult({
        spec,
        provenance: unreportedProvenance(failure),
        execution: failure,
        startedAt: clock(),
        endedAt: clock(),
      });
    }
    results.push(run);
    await input.onResult(run);
  }
  return Object.freeze(results);
}
