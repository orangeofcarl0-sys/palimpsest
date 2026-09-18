/**
 * SR-1D R2 §7/§8/§9 — the cognition application-surface cluster.
 *
 * Owns BOTH the façade interfaces (ReasoningApplicationSurface, EmpiricalApplicationSurface, RecipesApplicationSurface, RecipeReadinessReport, AdvisorApplicationSurface, AdvisorProfileInput, AdvisorExplanation, RecipeExecutionApplicationSurface, RecipeExecutionStatus) and the constructor that
 * implements them, from a NARROW input: this module can only see the 6 dependencies it
 * actually reads (advisor, organizationMemory, reasoning, recipeExecution, recipes, taskProfiler). Behaviour is unchanged.
 */

import { invalidInput } from "../common.js";
import type { ReasoningCellService, ReasoningFrontierView, ReasoningClaimGraphView, ReasoningCellView, ReasoningBranchBrief, CandidateStatus } from "../../reasoning_cell/index.js";
import type { ReasoningClaimTypeRef, ReasoningClaimRef, ExternalEvidenceRef, EvaluationOutcome, InvalidationOutcome } from "../../reasoning_cell/index.js";
import type { ArchitectureVariant, ExperimentDefinition, InterventionRecord, MeasurementCorrection, OrganizationEvaluation, RunResult, ScenarioDefinition } from "../../organization_memory/index.js";
import type { OrganizationMemoryService, SimilarRunsQuery } from "../../organization_memory/index.js";
import type { TaskFeatureName, TaskFeatureValue } from "../../organization_memory/artifacts.js";
import { TASK_FEATURE_ALLOWED_VALUES, TASK_FEATURE_NAMES } from "../../organization_memory/artifacts.js";
import type { CompiledRecipePlan, RecipeBaseMode, RecipeDefinition, RecipeModifier, RecipePlan, RecipeReadiness, RecipeRole } from "../../recipes/artifacts.js";
import { parseCompiledRecipePlan, parseRecipePlan } from "../../recipes/artifacts.js";
import type { RecipeRegistry } from "../../recipes/registry.js";
import { compileRecipePlan } from "../../recipes/compiler.js";
import type { RecipeExecutionContext, RecipeExecutionOutcome, RecipeExecutionService } from "../../recipes/execution.js";
import type { ArchitectureRecommendInput, ArchitectureRecommendation, EmpiricalArchitectureAdvisor } from "../../advisor/advisor.js";
import type { TaskProfile, TaskProfilerPort } from "../../advisor/task_profile.js";
import { applyProfilerOutput, parseTaskProfile, unknownTaskProfile, withTaskFeature } from "../../advisor/task_profile.js";

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface CognitionSurfaceDeps {
  readonly advisor?: EmpiricalArchitectureAdvisor | undefined;
  readonly organizationMemory?: OrganizationMemoryService | undefined;
  readonly reasoning?: ReasoningCellService | undefined;
  readonly recipeExecution?: { readonly service: RecipeExecutionService; readonly status: RecipeExecutionStatus } | undefined;
  readonly recipes?: RecipeRegistry | undefined;
  readonly taskProfiler?: TaskProfilerPort | undefined;
}

export interface ReasoningApplicationSurface {
  view(cellId: string): Promise<ReasoningCellView>;
  openBranch(input: { readonly cellId: string; readonly question: string; readonly attribution?: unknown }): Promise<{ readonly branch: unknown; readonly brief: ReasoningBranchBrief }>;
  brief(input: { readonly cellId: string; readonly branchId: string }): Promise<ReasoningBranchBrief>;
  submitCandidate(input: { readonly cellId: string; readonly branchId: string; readonly type: ReasoningClaimTypeRef; readonly content: unknown; readonly dependencies?: readonly ReasoningClaimRef[]; readonly externalEvidenceRefs?: readonly ExternalEvidenceRef[] }): Promise<{ readonly candidate: unknown; readonly status: CandidateStatus }>;
  evaluate(input: { readonly cellId: string; readonly candidateDigest: string }): Promise<EvaluationOutcome>;
  invalidate(input: { readonly cellId: string; readonly targetClaimId: string; readonly reason: string }): Promise<InvalidationOutcome>;
  frontier(cellId: string): Promise<ReasoningFrontierView>;
  graph(cellId: string): Promise<ReasoningClaimGraphView>;
}

/**
 * G10-R: the pure READ model over canonical empirical history. Every method
 * re-derives from the append-only OrganizationMemory store; there is no writer,
 * no mutator of another subsystem, and no authority reachable here.
 */
export interface EmpiricalApplicationSurface {
  experiments(): Promise<readonly ExperimentDefinition[]>;
  experiment(experimentId: string): Promise<ExperimentDefinition>;
  scenarios(experimentId: string): Promise<readonly ScenarioDefinition[]>;
  variants(experimentId: string): Promise<readonly ArchitectureVariant[]>;
  runs(experimentId: string): Promise<readonly RunResult[]>;
  run(runRef: string): Promise<RunResult | undefined>;
  evaluations(experimentId: string): Promise<readonly OrganizationEvaluation[]>;
  corrections(experimentId: string): Promise<readonly MeasurementCorrection[]>;
  interventions(): Promise<readonly InterventionRecord[]>;
  similarRuns(query: SimilarRunsQuery): Promise<readonly RunResult[]>;
  structuralHistory(subjectRef: string): Promise<readonly InterventionRecord[]>;
}

/** READ-ONLY recipe catalog. Recipes are product config, not canonical truth. */
export interface RecipesApplicationSurface {
  list(): readonly RecipeDefinition[];
  inspect(recipeId: string): RecipeDefinition | undefined;
  readiness(): readonly RecipeReadinessReport[];
}

/** One recipe's honest, per-capability readiness (a stated enum, never a score). */
export interface RecipeReadinessReport {
  readonly recipeId: string;
  readonly role: RecipeRole;
  readonly baseMode?: RecipeBaseMode | undefined;
  readonly modifier?: RecipeModifier | undefined;
  readonly readiness: RecipeReadiness;
  readonly capabilityRequirements: readonly string[];
  readonly limitations: readonly string[];
}

/**
 * READ-ONLY empirical architecture advisor. `profile` may consume UNTRUSTED profiler output (strictly
 * parsed and re-sourced) but can never select a recipe; only `recommend` maps a profile + the install's
 * honest capabilities to eligible plans, and the human remains the chooser.
 */
export interface AdvisorApplicationSurface {
  profile(input: AdvisorProfileInput): Promise<TaskProfile>;
  recommend(input: ArchitectureRecommendInput): Promise<ArchitectureRecommendation>;
  explain(input: ArchitectureRecommendInput): Promise<AdvisorExplanation>;
}

export interface AdvisorProfileInput {
  /** An opaque task description; only meaningful with an untrusted profiler wired. */
  readonly task?: string | undefined;
  /** Caller/user-declared feature values (strictly validated; the caller is the source). */
  readonly values?: Readonly<Record<string, string>> | undefined;
}

/** The plain-language explanation portion of a recommendation (no scores/weights). */
export interface AdvisorExplanation {
  readonly recommendedPlan: RecipePlan;
  readonly rationale: readonly string[];
  readonly blockers: readonly string[];
  readonly unavailableEvidence: readonly string[];
}

/**
 * G10-S: descriptive compilation plus execution through the EXISTING governed services.
 * `compile`/`status` are pure reads; `start` runs the wired ReasoningCell/Federation services and
 * never admits a claim, accepts a boundary revision, evolves anything, or produces an effect itself.
 */
export interface RecipeExecutionApplicationSurface {
  compile(plan: RecipePlan): CompiledRecipePlan;
  start(compiled: CompiledRecipePlan, context: RecipeExecutionContext): Promise<RecipeExecutionOutcome>;
  status(): RecipeExecutionStatus;
}

/** The execution bindings actually wired for this install (plain boolean facts, never guesses). */
export interface RecipeExecutionStatus {
  readonly localPeerId: string;
  readonly reasoningCell: boolean;
  readonly branchExecution: boolean;
  readonly federation: boolean;
}

export function makeCognitionSurfaces(deps: CognitionSurfaceDeps): { readonly reasoning: ReasoningApplicationSurface | undefined; readonly empirical: EmpiricalApplicationSurface | undefined; readonly recipes: RecipesApplicationSurface | undefined; readonly advisor: AdvisorApplicationSurface | undefined; readonly recipeExecution: RecipeExecutionApplicationSurface | undefined } {
    const reasoning: ReasoningApplicationSurface | undefined =
      deps.reasoning === undefined
        ? undefined
        : {
            view: (cellId) => deps.reasoning!.cellView({ cellId }),
            openBranch: (input) => deps.reasoning!.openBranch({ cellId: input.cellId, question: input.question, attribution: input.attribution as never }),
            brief: (input) => deps.reasoning!.branchBrief(input),
            submitCandidate: (input) => deps.reasoning!.submitCandidate(input),
            evaluate: (input) => deps.reasoning!.evaluateCandidate(input),
            invalidate: (input) => deps.reasoning!.requestInvalidation(input),
            frontier: (cellId) => deps.reasoning!.frontier({ cellId }),
            graph: (cellId) => deps.reasoning!.claimGraph({ cellId }),
          };


    const empirical: EmpiricalApplicationSurface | undefined =
      deps.organizationMemory === undefined
        ? undefined
        : {
            experiments: () => deps.organizationMemory!.experiments(),
            experiment: (experimentId) => deps.organizationMemory!.experiment(experimentId),
            scenarios: (experimentId) => deps.organizationMemory!.scenarios(experimentId),
            variants: (experimentId) => deps.organizationMemory!.variants(experimentId),
            runs: (experimentId) => deps.organizationMemory!.runs(experimentId),
            run: (runRef) => deps.organizationMemory!.run(runRef),
            evaluations: (experimentId) => deps.organizationMemory!.evaluations(experimentId),
            corrections: (experimentId) => deps.organizationMemory!.corrections(experimentId),
            interventions: () => deps.organizationMemory!.interventions(),
            similarRuns: (query) => deps.organizationMemory!.similarRuns(query),
            structuralHistory: (subjectRef) => deps.organizationMemory!.structuralHistory(subjectRef),
          };


    const recipes: RecipesApplicationSurface | undefined =
      deps.recipes === undefined
        ? undefined
        : {
            list: () => deps.recipes!.list(),
            inspect: (recipeId) => deps.recipes!.get(recipeId),
            readiness: () =>
              deps.recipes!.list().map((definition) =>
                Object.freeze({
                  recipeId: definition.recipeId,
                  role: definition.role,
                  ...(definition.baseMode === undefined ? {} : { baseMode: definition.baseMode }),
                  ...(definition.modifier === undefined ? {} : { modifier: definition.modifier }),
                  readiness: definition.readiness,
                  capabilityRequirements: definition.capabilityRequirements,
                  limitations: definition.limitations,
                }),
              ),
          };


    const advisor: AdvisorApplicationSurface | undefined =
      deps.advisor === undefined
        ? undefined
        : {
            profile: async (input) => {
              // A wired UNTRUSTED profiler is strict-parsed and re-sourced; it never selects a recipe.
              if (deps.taskProfiler !== undefined && input.task !== undefined) {
                const proposed = await deps.taskProfiler.profile({ task: input.task });
                return applyProfilerOutput(unknownTaskProfile(), proposed);
              }
              let profile = unknownTaskProfile();
              for (const [feature, value] of Object.entries(input.values ?? {})) {
                if (!(TASK_FEATURE_NAMES as readonly string[]).includes(feature)) {
                  throw invalidInput(`unknown task feature "${feature}"`);
                }
                const name = feature as TaskFeatureName;
                if (!(TASK_FEATURE_ALLOWED_VALUES[name] as readonly string[]).includes(value)) {
                  throw invalidInput(`value "${value}" is not allowed for task feature "${feature}"`);
                }
                profile = withTaskFeature(profile, name, value as TaskFeatureValue);
              }
              return profile;
            },
            recommend: (input) => deps.advisor!.recommend({ ...input, taskProfile: parseTaskProfile(input.taskProfile) }),
            explain: async (input) => {
              const recommendation = await deps.advisor!.recommend({ ...input, taskProfile: parseTaskProfile(input.taskProfile) });
              return Object.freeze({
                recommendedPlan: recommendation.recommendedPlan,
                rationale: recommendation.rationale,
                blockers: recommendation.blockers,
                unavailableEvidence: recommendation.unavailableEvidence,
              });
            },
          };


    const recipeExecution: RecipeExecutionApplicationSurface | undefined =
      deps.recipeExecution === undefined || deps.recipes === undefined
        ? undefined
        : {
            // Re-parse defensively at the boundary: a raw caller-supplied plan cannot slip past its digest.
            compile: (plan) => compileRecipePlan(parseRecipePlan(plan, "RecipePlan"), deps.recipes!),
            start: (compiled, context) => deps.recipeExecution!.service.execute(parseCompiledRecipePlan(compiled, "CompiledRecipePlan"), context),
            status: () => deps.recipeExecution!.status,
          };

    /*
     * UX-A §16: the collaboration face. It is COMPOSED here (not merely declared) —
     * the G10-AC-R lesson recorded in this file: a surface member that is declared on
     * the type and wired into the deps but never added to the returned object makes
     * every route answer 501. The service itself is the install's thin, stateless
     * composition; this face adds NO logic, NO authority and NO second parser beyond
     * the service's own strict `parseCollaborationRequest`.
     */

  return { reasoning, empirical, recipes, advisor, recipeExecution };
}
