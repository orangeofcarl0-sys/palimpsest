/**
 * UX-A §1/§3/§7/§11/§12/§13/§14/§27/§31/§34 — ONE-REQUEST LOCAL COLLABORATION.
 *
 *   InteractionIntent != Authority      Recommendation != Execution
 *   Execution != Admission              Branch != DurableAgent
 *   RequestIntent != PersistentPosture  Parallel != CrossProject  Check != Truth
 *
 * This service is a THIN, STATELESS COMPOSITION of the existing owners. It owns
 * no store, no canonical artifact, no agent identity and no policy:
 *
 *   profile      → the composed TaskProfilerPort (UNTRUSTED, strict-parsed)
 *   architecture → the existing EmpiricalArchitectureAdvisor (NEVER re-implemented)
 *   plan         → the existing compiler / materializeRecipePlan + compileRecipePlan
 *   execution    → the existing RecipeExecutionService (governed paths only)
 *   findings     → the existing ReasoningCellService accepted frontier
 *   verification → the existing Project Verification runtime (derived availability)
 *   preference   → the durable Work Mode preference, read as CONTEXT ONLY
 *
 * Everything is per-call. There is no interaction store, no interaction history,
 * no exactly-once promise and no scheduler (§27). The only state a run produces
 * is the state the EXISTING owners already own (a reasoning cell, a verification
 * run) — this layer never revises ProjectIR, creates a Task, appends a Decision,
 * writes a Journal entry (§30) or mints a durable peer/commitment (§14/§15).
 */

import type { EmpiricalArchitectureAdvisor, ArchitecturePreferences, ArchitectureRecommendation } from "../advisor/advisor.js";
import { CAPABILITY_REASONING, CAPABILITY_VERIFIER, RECIPE_IDS } from "../advisor/advisor.js";
import type { TaskProfile, TaskProfilerPort } from "../advisor/task_profile.js";
import { applyProfilerOutput, unknownTaskProfile, withTaskFeature } from "../advisor/task_profile.js";
import type { TaskFeatureName, TaskFeatureValue } from "../organization_memory/artifacts.js";
import type { EffectiveModeStatus, ProjectOperatingPostureView } from "../project_operating/posture.js";
import type { ProjectVerificationStatus } from "../project_verification/status.js";
import type { ReasoningCellService } from "../reasoning_cell/service.js";
import type { CompiledRecipePlan, RecipeBaseMode, RecipeDefinitionRef, RecipeModifier, RecipePlan } from "../recipes/artifacts.js";
import { materializeRecipePlan } from "../recipes/artifacts.js";
import { compileRecipePlan } from "../recipes/compiler.js";
import type { RecipeExecutionOutcome, RecipeExecutionService } from "../recipes/execution.js";
import type { RecipeRegistry } from "../recipes/registry.js";
import { canonicalDigest } from "../schema/canonical.js";
import type {
  CollaborationExecutionKind,
  CollaborationIntent,
  CollaborationPlanView,
  CollaborationRequest,
} from "./intent.js";
import {
  COLLABORATION_VERBS,
  CollaborationError,
  DEFAULT_BRANCH_COUNT,
  capabilityAvailabilityWarning,
  parseCollaborationRequest,
} from "./intent.js";
import type { CollaborationFinding, CollaborationResult, CollaborationVerificationView } from "./result_view.js";
import {
  EXPLORATORY_CELL_LOCAL,
  EXPLORATORY_FINDING_NOTE,
  collaborationFindingsFrom,
  collaborationSummaryOf,
  collaborationVerificationFrom,
} from "./result_view.js";

/**
 * UX-C §13/SC-10: a result that projects reasoning-cell findings carries the typed
 * exploratory standing and the mandated primary sentence. Findings only ever come
 * from the accepted ReasoningCell frontier (LOCAL_EXPLORE kinds), and an admitted
 * cell-local claim is a structured hypothesis — so the label is derived from the
 * findings themselves, not from a configured policy name.
 */
function exploratoryFindingFields(
  executionKind: CollaborationExecutionKind,
  findings: readonly CollaborationFinding[],
): { readonly findingStanding?: typeof EXPLORATORY_CELL_LOCAL; readonly findingNote?: string } {
  if (findings.length === 0) return {};
  if (executionKind !== "LOCAL_EXPLORE" && executionKind !== "LOCAL_EXPLORE_AND_VERIFY") return {};
  return { findingStanding: EXPLORATORY_CELL_LOCAL, findingNote: EXPLORATORY_FINDING_NOTE };
}

/**
 * The digest domain for a plan's `rationaleDigest`. A `RecipePlan` requires a
 * rationale digest; this names UX-A's own rationale, exactly as the advisor names
 * its own. It is NOT a canonical plane: nothing is stored, and the digest only
 * binds the plan to the plain-language reasons it was built from.
 */
export const INTERACTION_RATIONALE_DOMAIN = "palimpsest.interaction.rationale.v1";

/** The capability names UX-A may refuse on. The advisor's OWN vocabulary, verbatim. */
export const INTERACTION_CAPABILITY_REASONING = CAPABILITY_REASONING;
export const INTERACTION_CAPABILITY_VERIFICATION = CAPABILITY_VERIFIER;

/* ------------------------------------------------------------------ *
 * Dependencies
 * ------------------------------------------------------------------ */

/**
 * Every semantic dependency is a THUNK or an OPTIONAL service, because the
 * install composes verification/posture AFTER the recipe execution service (the
 * `verificationWiring`/`liveVerification()` precedent in `src/install.ts`). An
 * absent dependency is stated as absent — never stubbed.
 */
export interface CollaborationDeps {
  readonly projectId: string;
  readonly clock: () => string;
  /** The versioned recipe catalog (product config). Required for any local plan. */
  readonly recipes?: RecipeRegistry | undefined;
  /** The governed execution service. Absent ⇒ a local plan cannot run. */
  readonly recipeExecution?: RecipeExecutionService | undefined;
  /** The architecture selector (§12). Absent ⇒ AUTO falls back to FOCUS (§7). */
  readonly advisor?: EmpiricalArchitectureAdvisor | undefined;
  /** An UNTRUSTED host profiler; its output is strict-parsed and never selects a recipe. */
  readonly taskProfiler?: TaskProfilerPort | undefined;
  /** The accepted-frontier READ (§19). Absent ⇒ findings cannot be read back. */
  readonly reasoning?: Pick<ReasoningCellService, "activeClaims"> | undefined;
  /** §34: the SAME DERIVED verification availability the rest of the product uses. */
  readonly verificationStatus?: (() => Promise<ProjectVerificationStatus>) | undefined;
  /** §8/§31: the durable Work Mode preference, as context only. */
  readonly posture?: (() => Promise<ProjectOperatingPostureView>) | undefined;
}

export interface CollaborationService {
  /** READ-ONLY derivation: no execution, no mutation, no peer, no commitment. */
  plan(request: unknown): Promise<CollaborationPlanView>;
  /** Executes only the existing governed recipe/verification paths. */
  run(request: unknown): Promise<CollaborationResult>;
}

/* ------------------------------------------------------------------ *
 * Internal resolution
 * ------------------------------------------------------------------ */

interface CapabilityRead {
  readonly available: boolean;
  readonly capability: string;
  readonly availability: string;
  readonly reason: string;
}

interface Resolution {
  readonly view: CollaborationPlanView;
  /** The descriptive plan to compile, for the local execution kinds only. */
  readonly recipePlan?: RecipePlan | undefined;
  /** TRUE iff the request wants an independent check (CHECK / PARALLEL_AND_CHECK). */
  readonly verificationRequested: boolean;
  /** TRUE iff a VERIFY step will actually be part of the compiled plan. */
  readonly verificationPlanned: boolean;
  /** A short, plain-language "why" for the §18 summary (the view may be verbose). */
  readonly summaryWhy: readonly string[];
  readonly peers: readonly string[];
  readonly capability?: string | undefined;
}

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export function makeCollaborationService(deps: CollaborationDeps): CollaborationService {
  if (typeof deps.projectId !== "string" || deps.projectId.trim() === "") {
    throw new CollaborationError("not_configured", "a collaboration service requires the project id it acts within");
  }
  if (typeof deps.clock !== "function") {
    throw new CollaborationError("not_configured", "a collaboration service requires an injected clock");
  }

  /* ---------------- reading the existing owners ---------------- */

  async function postureView(): Promise<ProjectOperatingPostureView | undefined> {
    const read = deps.posture;
    if (read === undefined) return undefined;
    return read();
  }

  function modeRow(view: ProjectOperatingPostureView | undefined, capability: string): EffectiveModeStatus | undefined {
    return view?.workMode.effectiveStatus.find((row) => row.capability === capability);
  }

  interface PreferredWorkMode {
    readonly baseMode: string;
    readonly modifiers: readonly string[];
    readonly source: string;
    readonly degradedReason?: string | undefined;
  }

  /** §8/§31: read the DURABLE preference. This function never writes it. */
  async function preferredWorkMode(): Promise<PreferredWorkMode | undefined> {
    const view = await postureView();
    if (view === undefined) return undefined;
    return view.workMode.preferred;
  }

  /**
   * §34: the DERIVED independent-verification availability — the same fact the
   * posture and the recipe execution service use. It is never inferred from a
   * name, and a same-context verifier never satisfies it.
   */
  async function verificationCapability(): Promise<CapabilityRead> {
    const read = deps.verificationStatus;
    if (read === undefined) {
      return Object.freeze({
        available: false,
        capability: INTERACTION_CAPABILITY_VERIFICATION,
        availability: "UNAVAILABLE",
        reason:
          "no Project Verification status read is composed for this installation, so no independent verifier can be proven; a same-context fallback is not an independent check",
      });
    }
    const status: ProjectVerificationStatus = await read();
    const available = status.independentVerifyAvailable === true;
    return Object.freeze({
      available,
      capability: INTERACTION_CAPABILITY_VERIFICATION,
      availability: available ? "AVAILABLE" : "UNAVAILABLE",
      reason: status.detail,
    });
  }

  /** The derived EXPLORE availability from the operating posture (§5 of the audit). */
  async function postureReasoningCapability(): Promise<CapabilityRead | undefined> {
    const view = await postureView();
    const row = modeRow(view, "EXPLORE");
    if (row === undefined) return undefined;
    return Object.freeze({
      available: row.availability !== "UNAVAILABLE",
      capability: INTERACTION_CAPABILITY_REASONING,
      availability: row.availability,
      reason: row.reason,
    });
  }

  /**
   * The reasoning-branch capability as the ADVISOR sees it (§12: the advisor is
   * the architecture selector, so its eligibility IS the fact for AUTO/PARALLEL).
   * An EXPLORE plan in `eligiblePlans` means branches exist; the advisor's own
   * non-overridable blocker is quoted when they do not.
   */
  function reasoningCapabilityFrom(recommendation: ArchitectureRecommendation): CapabilityRead {
    const exploreEligible = recommendation.eligiblePlans.some(
      (plan) => plan.baseRecipeRef.recipeId === RECIPE_IDS.explore,
    );
    if (exploreEligible) {
      return Object.freeze({
        available: true,
        capability: INTERACTION_CAPABILITY_REASONING,
        availability: "AVAILABLE",
        reason: "the advisor made the EXPLORE architecture eligible for this deployment",
      });
    }
    const blocker = recommendation.blockers.find((entry) => /reasoning branches capability is not available/iu.test(entry));
    return Object.freeze({
      available: false,
      capability: INTERACTION_CAPABILITY_REASONING,
      availability: "UNAVAILABLE",
      reason:
        blocker ??
        "the advisor did not make the EXPLORE architecture eligible for this task, so bounded local exploration cannot be served",
    });
  }

  /**
   * §5 of the audit: the recipe `readiness` literal is hand-written and only the
   * posture's `availability` is derived, so every plan quotes the derived value.
   * A warning is raised only when the capability is NOT usable; a CONDITIONAL
   * capability is stated in the reasons and still usable.
   */
  function quoteAvailability(
    reasons: string[],
    warnings: string[],
    label: string,
    read: CapabilityRead | undefined,
  ): void {
    if (read === undefined) {
      reasons.push(`${label}: the operating posture is not composed for this installation, so no derived availability row exists.`);
      return;
    }
    reasons.push(`${label}: "${read.capability}" is ${read.availability} — ${read.reason}`);
    if (!read.available) warnings.push(capabilityAvailabilityWarning(read.capability, read.availability, read.reason));
  }

  /* ---------------- profiling (§3/§12) ---------------- */

  /**
   * Profile the task through the composed UNTRUSTED profiler (strict-parsed and
   * re-sourced by `applyProfilerOutput`), then apply the caller's explicit
   * overrides as USER_DECLARED. A profile is a suggestion the advisor reads; it
   * never selects a recipe on its own.
   */
  async function profileOf(request: CollaborationRequest): Promise<TaskProfile> {
    let profile = unknownTaskProfile();
    if (deps.taskProfiler !== undefined) {
      const proposed = await deps.taskProfiler.profile({ task: request.task });
      profile = applyProfilerOutput(profile, proposed);
    }
    for (const [feature, value] of Object.entries(request.taskProfileOverrides ?? {})) {
      profile = withTaskFeature(profile, feature as TaskFeatureName, value as TaskFeatureValue);
    }
    return profile;
  }

  /**
   * §12: the durable preference is handed to the advisor as CONTEXT. The current
   * advisor reads no `preferences` field, so this changes no architecture
   * decision — UX-A itself consumes the durable preference for the §7 VERIFY
   * rider below, and never writes it back (§8/§31).
   */
  function preferencesFrom(preferred: PreferredWorkMode | undefined): ArchitecturePreferences | undefined {
    if (preferred === undefined) return undefined;
    return Object.freeze({
      verificationPreference: preferred.modifiers.includes("VERIFY") ? "VERIFY" : "NONE",
      persistencePreference: preferred.baseMode,
    });
  }

  /* ---------------- plan construction (existing artifacts only) ---------------- */

  function definitionRef(recipeId: string): RecipeDefinitionRef {
    const registry = deps.recipes;
    const definition = registry?.get(recipeId);
    if (definition === undefined) {
      throw new CollaborationError(
        "not_configured",
        `recipe "${recipeId}" is not registered for this installation, so the collaboration plan cannot be built`,
      );
    }
    return Object.freeze({ recipeId: definition.recipeId, version: definition.version, digest: definition.digest });
  }

  /**
   * Build a descriptive `RecipePlan` with the EXISTING materializer. This is plan
   * MATERIALIZATION, not compilation and not selection: the base mode was already
   * chosen by the advisor (AUTO/PARALLEL) or by the request itself (CHECK /
   * FOCUS), and the plan is compiled by the existing compiler in `run`.
   */
  function buildPlan(input: {
    readonly baseId: string;
    readonly modifierIds: readonly string[];
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly existingSubjectRefs?: readonly string[] | undefined;
    readonly reasons: readonly string[];
  }): RecipePlan {
    if (deps.recipes === undefined) {
      throw new CollaborationError("not_configured", "no recipe registry is composed for this installation");
    }
    return materializeRecipePlan({
      baseRecipeRef: definitionRef(input.baseId),
      modifierRefs: input.modifierIds.map((modifierId) => definitionRef(modifierId)),
      parameters: input.parameters,
      existingSubjectRefs: input.existingSubjectRefs ?? [],
      rationaleDigest: canonicalDigest({ domain: INTERACTION_RATIONALE_DOMAIN, rationale: input.reasons }),
    });
  }

  /**
   * `modifierRecipeIds` are RECIPE ids (`verify.v1`), never the modifier enum
   * (`VERIFY`): the plan binds versioned recipe refs, and the compiler is what turns
   * them into a modifier step. Passing the enum here is exactly the kind of
   * unbound-ref bug the digest-bound plan forbids.
   */
  function explorePlan(request: CollaborationRequest, modifierRecipeIds: readonly string[], reasons: readonly string[]): RecipePlan {
    const wantsVerify = modifierRecipeIds.includes(RECIPE_IDS.verify);
    return buildPlan({
      baseId: RECIPE_IDS.explore,
      modifierIds: modifierRecipeIds,
      parameters: {
        question: request.task,
        branchCount: request.branchCountHint ?? DEFAULT_BRANCH_COUNT,
        // A caller-supplied `verifierRef` must BIND on every path that checks. It
        // previously reached the compiler only through CHECK, so PARALLEL_AND_CHECK
        // (and the AUTO verify rider) fell back to the compiler's `project-default`
        // sentinel and verified under a protocol the caller never named — exactly the
        // silent substitution this layer exists to prevent. Absent stays `{}` so the
        // sentinel remains the honest default.
        ...(wantsVerify ? verifyParameters(request) : {}),
      },
      reasons,
    });
  }

  function verifyParameters(request: CollaborationRequest): Readonly<Record<string, unknown>> {
    // An absent `verifierRef` lets the compiler emit its EXPLICIT `project-default`
    // sentinel, which execution resolves against the runtime registry.
    return request.verifierRef === undefined ? {} : { verifierRef: request.verifierRef };
  }

  /* ---------------- plan views ---------------- */

  function viewOf(input: {
    readonly request: CollaborationRequest;
    readonly baseMode: RecipeBaseMode;
    readonly modifiers: readonly RecipeModifier[];
    readonly reasons: readonly string[];
    readonly warnings: readonly string[];
    readonly executionKind: CollaborationExecutionKind;
    /** §14: the existing peers a CROSS_PROJECT_REQUIRED plan names, when any. */
    readonly peers?: readonly string[] | undefined;
  }): CollaborationPlanView {
    return Object.freeze({
      task: input.request.task,
      requestedIntent: input.request.intent,
      effectiveBaseMode: input.baseMode,
      modifiers: Object.freeze([...input.modifiers]),
      reason: freezeStrings(input.reasons),
      capabilityWarnings: freezeStrings(input.warnings),
      executionKind: input.executionKind,
      verb: COLLABORATION_VERBS[input.executionKind],
      // §14: a cross-project handoff is only actionable if a READ-ONLY plan names the
      // peers it would need, so `plan()` alone can hand off to UX-B without running
      // anything. Absent for every other execution kind.
      ...(input.peers === undefined || input.peers.length === 0
        ? {}
        : { peers: Object.freeze([...input.peers]) }),
    });
  }

  function principalContinues(request: CollaborationRequest, reasons: readonly string[], warnings: readonly string[]): Resolution {
    return Object.freeze({
      view: viewOf({
        request,
        baseMode: "FOCUS",
        modifiers: [],
        reasons,
        warnings,
        executionKind: "PRINCIPAL_CONTINUES",
      }),
      verificationRequested: false,
      verificationPlanned: false,
      summaryWhy: freezeStrings(reasons.filter((entry) => entry.startsWith("UX-A:"))),
      peers: Object.freeze([] as string[]),
    });
  }

  function capabilityRequired(input: {
    readonly request: CollaborationRequest;
    readonly capability: string;
    readonly baseMode: RecipeBaseMode;
    readonly modifiers: readonly RecipeModifier[];
    readonly reasons: readonly string[];
    readonly warnings: readonly string[];
  }): Resolution {
    return Object.freeze({
      view: viewOf({
        request: input.request,
        baseMode: input.baseMode,
        modifiers: input.modifiers,
        reasons: input.reasons,
        warnings: input.warnings,
        executionKind: "CAPABILITY_REQUIRED",
      }),
      verificationRequested: false,
      verificationPlanned: false,
      summaryWhy: freezeStrings([...input.reasons]),
      peers: Object.freeze([] as string[]),
      capability: input.capability,
    });
  }

  function appendRecommendation(reasons: string[], recommendation: ArchitectureRecommendation): void {
    for (const line of recommendation.rationale) reasons.push(line);
    for (const blocker of recommendation.blockers) reasons.push(`Advisor blocker: ${blocker}`);
  }

  /* ---------------- the AUTO / PARALLEL architecture paths (§7/§12/§13) ---------------- */

  async function resolveAuto(request: CollaborationRequest): Promise<Resolution> {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const preferred = await preferredWorkMode();
    if (preferred === undefined) {
      reasons.push(
        "UX-A: the durable Work Mode preference could not be read (no operating posture is composed), so AUTO was resolved without durable preference context.",
      );
    } else {
      reasons.push(
        `UX-A: the durable Work Mode preference for this project is ${preferred.baseMode}${
          preferred.modifiers.length === 0 ? "" : ` + ${preferred.modifiers.join("+")}`
        } (${preferred.source}); it is CONTEXT only and this request never rewrites it.`,
      );
    }
    if (deps.advisor === undefined) {
      // §7: the safe, documented fallback. No branch is opened so the request
      // appears to have done something.
      reasons.push(
        "UX-A: no empirical architecture advisor is configured for this installation, and AUTO must not invent an architecture policy, so AUTO falls back to FOCUS — the zero-extra-boundary baseline. Nothing was explored and no agent was created.",
      );
      return principalContinues(request, reasons, warnings);
    }
    const taskProfile = await profileOf(request);
    const recommendation = await deps.advisor.recommend({
      taskProfile,
      ...(preferencesFrom(preferred) === undefined ? {} : { preferences: preferencesFrom(preferred)! }),
    });
    reasons.push("UX-A: the existing empirical architecture advisor selected the structure; UX-A adds no architecture policy of its own.");
    return resolveFromRecommendation(request, recommendation, reasons, warnings, preferred);
  }

  function resolveFromRecommendation(
    request: CollaborationRequest,
    recommendation: ArchitectureRecommendation,
    reasons: string[],
    warnings: string[],
    preferred: PreferredWorkMode | undefined,
  ): Promise<Resolution> | Resolution {
    appendRecommendation(reasons, recommendation);
    const baseId = recommendation.recommendedPlan.baseRecipeRef.recipeId;

    /* §14: COORDINATE → CROSS_PROJECT_REQUIRED. Never compiled, never executed. */
    if (baseId === RECIPE_IDS.coordinate) {
      return Object.freeze({
        view: viewOf({
          request,
          baseMode: "COORDINATE",
          modifiers: [],
          reasons: [
            ...reasons,
            "UX-A: the advisor recommends COORDINATE, and one-request cross-project collaboration is not implemented in UX-A (§36), so this request stops at CROSS_PROJECT_REQUIRED. Zero peer messages, zero commitments and zero boundary mutations were made.",
          ],
          warnings,
          executionKind: "CROSS_PROJECT_REQUIRED",
          peers: recommendation.recommendedPlan.existingSubjectRefs,
        }),
        verificationRequested: false,
        verificationPlanned: false,
        summaryWhy: freezeStrings(reasons.filter((entry) => entry.startsWith("UX-A:"))),
        peers: Object.freeze([...recommendation.recommendedPlan.existingSubjectRefs]),
      });
    }

    if (baseId !== RECIPE_IDS.explore) {
      // FOCUS. §13/§21: FOCUS never explores and never invokes another agent for
      // appearance; AUTO does NOT add a VERIFY rider here because a
      // principal-continues request makes no project-head verification claim.
      reasons.push(
        "UX-A: the recommended structure is a single principal locus (FOCUS), so no branch, cell or agent is created — the principal continues with the request itself.",
      );
      return principalContinues(request, reasons, warnings);
    }

    // §5 of the audit: even when the ADVISOR selected EXPLORE, the plan quotes the
    // DERIVED availability (the posture's own row), because the recipe `readiness`
    // literal is hand-written and only the derivation is honest.
    quoteAvailability(reasons, warnings, "UX-A: derived exploration availability", reasoningCapabilityFrom(recommendation));
    return exploreResolution(request, reasons, warnings, preferred, true);
  }

  /**
   * The EXPLORE resolution, shared by AUTO and PARALLEL once the structure is
   * known. `withDurableVerifyRider` is TRUE only for AUTO, where §7 allows the
   * durable VERIFY preference to ride along as context.
   */
  async function exploreResolution(
    request: CollaborationRequest,
    reasons: string[],
    warnings: string[],
    preferred: PreferredWorkMode | undefined,
    withDurableVerifyRider: boolean,
  ): Promise<Resolution> {
    const modifiers: RecipeModifier[] = [];
    let executionKind: CollaborationExecutionKind = "LOCAL_EXPLORE";
    let verificationRequested = false;
    let verificationPlanned = false;

    const durableVerify = withDurableVerifyRider && preferred?.modifiers.includes("VERIFY") === true;
    if (durableVerify) {
      const verification = await verificationCapability();
      quoteAvailability(reasons, warnings, "UX-A: derived verification availability", verification);
      if (verification.available) {
        modifiers.push("VERIFY");
        verificationRequested = true;
        verificationPlanned = true;
        executionKind = "LOCAL_EXPLORE_AND_VERIFY";
        reasons.push(
          "UX-A: the durable Work Mode preference carries VERIFY and this deployment has an independent verifier, so the exploration is followed by a real project-head check (preference context, not a rewritten preference).",
        );
      } else {
        reasons.push(
          "UX-A: the durable VERIFY preference is context, not a demand, so the exploration still runs and no verification is claimed.",
        );
      }
    }

    return Object.freeze({
      view: viewOf({
        request,
        baseMode: "EXPLORE",
        modifiers,
        reasons,
        warnings,
        executionKind,
      }),
      recipePlan: explorePlan(request, modifiers.includes("VERIFY") ? [RECIPE_IDS.verify] : [], reasons),
      verificationRequested,
      verificationPlanned,
      summaryWhy: freezeStrings(reasons.filter((entry) => entry.startsWith("UX-A:"))),
      peers: Object.freeze([] as string[]),
    });
  }

  async function resolveParallel(request: CollaborationRequest): Promise<Resolution> {
    const reasons: string[] = [];
    const warnings: string[] = [];
    reasons.push(
      "UX-A: PARALLEL is an explicit request for LOCAL multi-branch exploration; no durable peer agent is minted to satisfy the word \"multi-agent\" (§7/§13).",
    );

    if (deps.advisor !== undefined) {
      const taskProfile = await profileOf(request);
      const recommendation = await deps.advisor.recommend({ taskProfile, userRequestedMultiAgent: true });
      appendRecommendation(reasons, recommendation);
      const read = reasoningCapabilityFrom(recommendation);
      quoteAvailability(reasons, warnings, "UX-A: derived exploration availability", read);
      if (!read.available) {
        // §13/§34 + UXA-N06: NEVER a fake "multi-agent completed".
        return capabilityRequired({
          request,
          capability: read.capability,
          baseMode: "EXPLORE",
          modifiers: [],
          reasons: [
            ...reasons,
            `UX-A: the reasoning-branch capability this request needs is absent (${read.reason}), so PARALLEL is refused with CAPABILITY_REQUIRED rather than pretending the exploration happened.`,
          ],
          warnings,
        });
      }
      // §13: PARALLEL may choose EXPLORE when the capability exists even if AUTO
      // would have chosen FOCUS — the eligibility came from the advisor itself.
      return exploreResolution(request, reasons, warnings, undefined, false);
    }

    // No advisor: the posture's DERIVED EXPLORE availability is the only honest
    // source left. Absent both, the request is refused rather than guessed.
    const read = await postureReasoningCapability();
    if (read === undefined) {
      return capabilityRequired({
        request,
        capability: INTERACTION_CAPABILITY_REASONING,
        baseMode: "EXPLORE",
        modifiers: [],
        reasons: [
          ...reasons,
          "UX-A: neither an architecture advisor nor an operating-posture availability read is composed for this installation, so bounded local exploration cannot be established; PARALLEL is refused rather than faked.",
        ],
        warnings,
      });
    }
    quoteAvailability(reasons, warnings, "UX-A: derived exploration availability", read);
    if (!read.available) {
      return capabilityRequired({
        request,
        capability: read.capability,
        baseMode: "EXPLORE",
        modifiers: [],
        reasons: [...reasons, `UX-A: bounded local exploration is unavailable here (${read.reason}); PARALLEL is refused rather than faked.`],
        warnings,
      });
    }
    return exploreResolution(request, reasons, warnings, undefined, false);
  }

  /* ---------------- CHECK / PARALLEL_AND_CHECK (§34) ---------------- */

  async function resolveCheck(request: CollaborationRequest): Promise<Resolution> {
    const reasons: string[] = [];
    const warnings: string[] = [];
    reasons.push("UX-A: CHECK uses ONLY the existing Project Verification runtime on the exact current project head (§34).");
    const verification = await verificationCapability();
    quoteAvailability(reasons, warnings, "UX-A: derived verification availability", verification);
    if (!verification.available) {
      return capabilityRequired({
        request,
        capability: verification.capability,
        baseMode: "FOCUS",
        modifiers: ["VERIFY"],
        reasons: [
          ...reasons,
          "UX-A: no independent verifier exists in this deployment, so the check is refused with CAPABILITY_REQUIRED. A same-model, same-context fallback is NOT accepted as an independent check (§34, UXA-N08).",
        ],
        warnings,
      });
    }
    return Object.freeze({
      view: viewOf({
        request,
        baseMode: "FOCUS",
        modifiers: ["VERIFY"],
        reasons,
        warnings,
        executionKind: "LOCAL_VERIFY",
      }),
      recipePlan: buildPlan({
        baseId: RECIPE_IDS.focus,
        modifierIds: [RECIPE_IDS.verify],
        parameters: verifyParameters(request),
        reasons,
      }),
      verificationRequested: true,
      verificationPlanned: true,
      summaryWhy: freezeStrings(reasons.filter((entry) => entry.startsWith("UX-A:"))),
      peers: Object.freeze([] as string[]),
    });
  }

  async function resolveParallelAndCheck(request: CollaborationRequest): Promise<Resolution> {
    const reasons: string[] = [];
    const warnings: string[] = [];

    /* --- the explore half ------------------------------------------------- */
    let exploreRead: CapabilityRead;
    if (deps.advisor !== undefined) {
      const taskProfile = await profileOf(request);
      const recommendation = await deps.advisor.recommend({ taskProfile, userRequestedMultiAgent: true });
      appendRecommendation(reasons, recommendation);
      exploreRead = reasoningCapabilityFrom(recommendation);
    } else {
      const fromPosture = await postureReasoningCapability();
      if (fromPosture === undefined) {
        return capabilityRequired({
          request,
          capability: INTERACTION_CAPABILITY_REASONING,
          baseMode: "EXPLORE",
          modifiers: [],
          reasons: [
            ...reasons,
            "UX-A: neither an architecture advisor nor an operating-posture availability read is composed for this installation, so the exploration half cannot be established; a check alone would not answer the request, so the request is refused rather than half-faked.",
          ],
          warnings,
        });
      }
      exploreRead = fromPosture;
    }
    quoteAvailability(reasons, warnings, "UX-A: derived exploration availability", exploreRead);
    if (!exploreRead.available) {
      return capabilityRequired({
        request,
        capability: exploreRead.capability,
        baseMode: "EXPLORE",
        modifiers: [],
        reasons: [...reasons, `UX-A: the exploration half is unavailable here (${exploreRead.reason}); PARALLEL_AND_CHECK is refused rather than faked.`],
        warnings,
      });
    }

    /* --- the check half --------------------------------------------------- */
    //
    // ASYMMETRY (§34, documented deliberately): an unavailable EXPLORE half is a
    // hard refusal (the request's primary work cannot be done at all), while an
    // unavailable CHECK half still lets the real exploration run and reports
    // PARTIAL, because the exploration DID produce real work and only the
    // independent check could not happen. In that case the VERIFY modifier is NOT
    // compiled at all: the recipe execution layer would otherwise refuse the whole
    // plan with `capability_required` and the exploration work would be lost.
    const verification = await verificationCapability();
    quoteAvailability(reasons, warnings, "UX-A: derived verification availability", verification);
    if (!verification.available) {
      reasons.push(
        "UX-A: the check half cannot run here, so the exploration runs alone and the result is reported as PARTIAL — the work is real, the independent check is NOT claimed.",
      );
      return Object.freeze({
        view: viewOf({
          request,
          baseMode: "EXPLORE",
          modifiers: [],
          reasons,
          warnings,
          executionKind: "LOCAL_EXPLORE_AND_VERIFY",
        }),
        recipePlan: explorePlan(request, [], reasons),
        verificationRequested: true,
        verificationPlanned: false,
        summaryWhy: freezeStrings(reasons.filter((entry) => entry.startsWith("UX-A:"))),
        peers: Object.freeze([] as string[]),
      });
    }
    reasons.push("UX-A: the exploration runs first and then the exact current project head is verified by the registered protocol.");
    return Object.freeze({
      view: viewOf({
        request,
        baseMode: "EXPLORE",
        modifiers: ["VERIFY"],
        reasons,
        warnings,
        executionKind: "LOCAL_EXPLORE_AND_VERIFY",
      }),
      recipePlan: explorePlan(request, [RECIPE_IDS.verify], reasons),
      verificationRequested: true,
      verificationPlanned: true,
      summaryWhy: freezeStrings(reasons.filter((entry) => entry.startsWith("UX-A:"))),
      peers: Object.freeze([] as string[]),
    });
  }

  async function resolveFocus(request: CollaborationRequest): Promise<Resolution> {
    const reasons: string[] = [
      "UX-A: FOCUS is the chosen intent, and FOCUS never explores: no branch, no reasoning cell and no extra agent is created. The principal continues with the request itself (§13/§21).",
    ];
    return principalContinues(request, reasons, []);
  }

  async function resolve(request: CollaborationRequest): Promise<Resolution> {
    switch (request.intent) {
      case "AUTO":
        return resolveAuto(request);
      case "FOCUS":
        return resolveFocus(request);
      case "PARALLEL":
        return resolveParallel(request);
      case "CHECK":
        return resolveCheck(request);
      case "PARALLEL_AND_CHECK":
        return resolveParallelAndCheck(request);
    }
  }

  async function plan(request: unknown): Promise<CollaborationPlanView> {
    const parsed = parseCollaborationRequest(request);
    return (await resolve(parsed)).view;
  }

  /* ---------------- running the existing governed paths ---------------- */

  function baseResult(input: {
    readonly resolution: Resolution;
    readonly status: CollaborationResult["status"];
    readonly didWhat: string;
    readonly findings: readonly CollaborationFinding[];
    readonly unresolved: readonly string[];
    readonly verification?: CollaborationVerificationView | undefined;
    readonly message?: string | undefined;
    /** §19: the claims THIS request admitted (never the whole cell frontier). */
    readonly admittedByThisRun?: readonly string[] | undefined;
    readonly branchExecutions?: number | undefined;
    /** §20/§34: TRUE only when the verification plane established this run as independent. */
    readonly independentVerification?: boolean | undefined;
  }): CollaborationResult {
    const resolution = input.resolution;
    const exploratory = exploratoryFindingFields(resolution.view.executionKind, input.findings);
    return Object.freeze({
      status: input.status,
      verb: resolution.view.verb,
      executionKind: resolution.view.executionKind,
      summary: collaborationSummaryOf({
        didWhat: input.didWhat,
        why: resolution.summaryWhy,
        findings: input.findings,
        admittedByThisRun: input.admittedByThisRun ?? [],
        branchExecutions: input.branchExecutions ?? 0,
        independentVerification: input.independentVerification === true,
        unresolved: input.unresolved,
        ...(exploratory.findingNote === undefined ? {} : { findingNote: exploratory.findingNote }),
        ...(input.verification === undefined ? {} : { verification: input.verification }),
      }),
      findings: Object.freeze([...input.findings]),
      ...exploratory,
      unresolved: freezeStrings(input.unresolved),
      ...(input.verification === undefined ? {} : { verification: input.verification }),
      capabilityWarnings: resolution.view.capabilityWarnings,
      details: Object.freeze({
        branchIds: Object.freeze([] as string[]),
        recipeIds: Object.freeze([] as string[]),
        runRefs: Object.freeze([] as string[]),
        ...(resolution.capability === undefined ? {} : { capability: resolution.capability }),
        ...(resolution.peers.length === 0 ? {} : { peers: resolution.peers }),
      }),
      ...(input.message === undefined ? {} : { message: input.message }),
      at: deps.clock(),
    });
  }

  function resultForNonLocal(input: {
    readonly resolution: Resolution;
    readonly status: CollaborationResult["status"];
    readonly didWhat: string;
    readonly unresolved?: readonly string[] | undefined;
  }): CollaborationResult {
    return baseResult({
      resolution: input.resolution,
      status: input.status,
      didWhat: input.didWhat,
      findings: Object.freeze([] as CollaborationFinding[]),
      unresolved: input.unresolved ?? [],
    });
  }

  async function runLocal(request: CollaborationRequest, resolution: Resolution): Promise<CollaborationResult> {
    const recipePlan = resolution.recipePlan;
    if (recipePlan === undefined) {
      // Unreachable through `resolve`; kept total for a future kind.
      return capabilityRequiredResult(
        resolution,
        "recipe.execution",
        "the resolved plan carries no descriptive RecipePlan, so nothing could be compiled or run",
      );
    }
    if (deps.recipes === undefined || deps.recipeExecution === undefined) {
      return capabilityRequiredResult(
        resolution,
        "recipe.execution",
        "no recipe registry or governed recipe execution service is composed for this installation, so the resolved plan could not be run",
      );
    }
    const compiled: CompiledRecipePlan = compileRecipePlan(recipePlan, deps.recipes);
    const outcome: RecipeExecutionOutcome = await deps.recipeExecution.execute(compiled, {});

    if (outcome.status === "capability_required") {
      return capabilityRequiredResult(resolution, outcome.capability, outcome.detail, {
        planId: recipePlan.planId,
        planDigest: recipePlan.digest,
        recipeIds: [recipePlan.baseRecipeRef.recipeId, ...recipePlan.modifierRefs.map((ref) => ref.recipeId)],
      });
    }

    const unresolved: string[] = [];
    let findings: readonly CollaborationFinding[] = Object.freeze([] as CollaborationFinding[]);
    let branchIds: readonly string[] = Object.freeze([] as string[]);
    let branchExecutions: number | undefined;
    let cellId: string | undefined;
    /** §19/MAJOR-2: what THIS request admitted, never the whole cell frontier. */
    let admittedByThisRun: readonly string[] = Object.freeze([] as string[]);

    if (outcome.status === "explored") {
      cellId = outcome.cellId;
      branchIds = outcome.branchIds;
      branchExecutions = outcome.branchExecutions;
      admittedByThisRun = outcome.admittedClaimIds;
      if (outcome.unresolved > 0) {
        unresolved.push(
          `${outcome.unresolved} branch candidate evaluation(s) did not converge to an admitted claim and remain unresolved.`,
        );
      }
      if (deps.reasoning === undefined) {
        unresolved.push(
          "the admitted findings could not be read back because no reasoning-cell read is composed for this installation.",
        );
      } else {
        findings = collaborationFindingsFrom(await deps.reasoning.activeClaims({ cellId: outcome.cellId }));
      }
    }

    const verification = outcome.verification === undefined ? undefined : collaborationVerificationFrom(outcome.verification);
    // MAJOR-1: the deployment-wide availability gate proves only that SOME verifier
    // is independent. The summary may claim an independent check only when the plane's
    // own list names the protocol that actually ran; otherwise it states the class.
    let independentVerification = false;
    if (verification !== undefined) {
      const read = deps.verificationStatus;
      if (read !== undefined) {
        try {
          independentVerification = (await read()).independentVerifierRefs.includes(verification.verifierRef);
        } catch {
          independentVerification = false;
        }
      }
    }
    if (outcome.verificationUnresolved !== undefined) {
      unresolved.push(
        `independent verification did not produce a recorded run (${outcome.verificationUnresolved.typedReasonCode}): ${outcome.verificationUnresolved.detail}`,
      );
    } else if (resolution.verificationRequested && verification === undefined) {
      unresolved.push(
        "independent verification was part of this request but no verifier run was recorded, so the result is PARTIAL: nothing about the project head is being claimed.",
      );
    }

    const status: CollaborationResult["status"] =
      resolution.verificationRequested && verification === undefined ? "PARTIAL" : "COMPLETED";

    // UX-C §14/SC-10: TWO INDEPENDENT FACTS, never one implied by the other. Local
    // Explore produced exploratory cell-local hypotheses; SEPARATELY the exact
    // current Project Head may have been checked. This sentence must never suggest
    // the findings were independently verified.
    const didWhat =
      resolution.view.effectiveBaseMode === "EXPLORE"
        ? `Local Explore produced exploratory findings: a bounded local exploration ran in ${branchExecutions ?? 0} branch execution(s) against one reasoning cell and the admitted findings were read back from the accepted frontier. Those findings are cell-local hypotheses, not Evidence, and this exploration did not verify them.${
            verification === undefined
              ? ""
              : " Separately, the exact current Project Head (not the findings) was checked by the registered protocol; the summary below states that check on its own."
          }`
        : "Replayed the single principal and checked the exact current Project Head (not any finding) with the registered protocol.";

    const exploratory = exploratoryFindingFields(resolution.view.executionKind, findings);
    return Object.freeze({
      status,
      verb: resolution.view.verb,
      executionKind: resolution.view.executionKind,
      summary: collaborationSummaryOf({
        didWhat,
        why: resolution.summaryWhy,
        findings,
        // The three honest signals go to the SUMMARY composer, where the wording
        // needs them — not onto the result envelope (they are not part of the
        // §11/§28 shape, and the ids belong in `details`).
        admittedByThisRun,
        branchExecutions: branchExecutions ?? 0,
        independentVerification,
        unresolved,
        ...(exploratory.findingNote === undefined ? {} : { findingNote: exploratory.findingNote }),
        ...(verification === undefined ? {} : { verification }),
      }),
      findings,
      ...exploratory,
      unresolved: freezeStrings(unresolved),
      ...(verification === undefined ? {} : { verification }),
      capabilityWarnings: resolution.view.capabilityWarnings,
      details: Object.freeze({
        ...(cellId === undefined ? {} : { cellId }),
        branchIds: Object.freeze([...branchIds]),
        ...(branchExecutions === undefined ? {} : { branchExecutions }),
        ...(admittedByThisRun.length === 0 ? {} : { admittedByThisRun: freezeStrings(admittedByThisRun) }),
        ...(verification === undefined ? {} : { independentVerification }),
        planId: recipePlan.planId,
        planDigest: recipePlan.digest,
        recipeIds: Object.freeze([recipePlan.baseRecipeRef.recipeId, ...recipePlan.modifierRefs.map((ref) => ref.recipeId)]),
        runRefs: freezeStrings(verification === undefined ? [] : [verification.runRef]),
      }),
      at: deps.clock(),
    });
  }

  function capabilityRequiredResult(
    resolution: Resolution,
    capability: string,
    detail: string,
    details?: { readonly planId?: string; readonly planDigest?: string; readonly recipeIds?: readonly string[] },
  ): CollaborationResult {
    const unresolved = [`the request needs the capability "${capability}", which this deployment does not have: ${detail}`];
    return Object.freeze({
      status: "CAPABILITY_REQUIRED",
      verb: resolution.view.verb,
      executionKind: resolution.view.executionKind,
      summary: collaborationSummaryOf({
        didWhat: `Nothing was executed: the request needs the capability "${capability}", which this deployment does not have.`,
        why: resolution.summaryWhy,
        findings: [],
        unresolved,
      }),
      findings: Object.freeze([] as CollaborationFinding[]),
      unresolved: freezeStrings(unresolved),
      capabilityWarnings: resolution.view.capabilityWarnings,
      details: Object.freeze({
        branchIds: Object.freeze([] as string[]),
        recipeIds: freezeStrings(details?.recipeIds ?? []),
        runRefs: Object.freeze([] as string[]),
        capability,
        ...(details?.planId === undefined ? {} : { planId: details.planId }),
        ...(details?.planDigest === undefined ? {} : { planDigest: details.planDigest }),
      }),
      at: deps.clock(),
    });
  }

  async function run(request: unknown): Promise<CollaborationResult> {
    const parsed = parseCollaborationRequest(request);
    let resolution: Resolution;
    try {
      resolution = await resolve(parsed);
    } catch (error) {
      // A typed interaction refusal stays a refusal; anything else is an
      // INFRASTRUCTURE failure and must not masquerade as a semantic result (§28,
      // UXA-N24).
      if (error instanceof CollaborationError) throw error;
      return Object.freeze({
        status: "ERROR",
        verb: COLLABORATION_VERBS.PRINCIPAL_CONTINUES,
        // §28/UX-A review MINOR-5: an infrastructure fault carries NO structural
        // verdict. It used to reuse `CAPABILITY_REQUIRED`, so a client switching on
        // `executionKind` read a capability diagnosis out of a server fault.
        executionKind: "ERROR",
        summary: `The request failed before anything could be planned: ${messageOf(error)}`,
        findings: Object.freeze([] as CollaborationFinding[]),
        unresolved: Object.freeze([] as string[]),
        capabilityWarnings: Object.freeze([] as string[]),
        details: Object.freeze({ branchIds: Object.freeze([] as string[]), recipeIds: Object.freeze([] as string[]), runRefs: Object.freeze([] as string[]) }),
        message: messageOf(error),
        at: deps.clock(),
      });
    }

    switch (resolution.view.executionKind) {
      case "PRINCIPAL_CONTINUES":
        return resultForNonLocal({
          resolution,
          status: "PRINCIPAL_CONTINUES",
          didWhat:
            "No extra collaboration boundary was created: the principal continues with this request itself, and nothing was explored or verified on its behalf.",
        });
      case "CROSS_PROJECT_REQUIRED":
        return resultForNonLocal({
          resolution,
          status: "CROSS_PROJECT_REQUIRED",
          didWhat: "This task needs another project, so nothing local was executed.",
          unresolved: [
            `Cross-project collaboration is not implemented in UX-A (§36); it is the UX-B handoff seam. No peer message was sent, no commitment was created and no boundary was mutated. Existing peers named by the recommendation: ${resolution.peers.length === 0 ? "(none)" : resolution.peers.join(", ")}.`,
          ],
        });
      case "CAPABILITY_REQUIRED":
        return capabilityRequiredResult(
          resolution,
          resolution.capability ?? "unknown",
          resolution.view.capabilityWarnings.length === 0
            ? "the required capability is not configured for this deployment"
            : resolution.view.capabilityWarnings.join(" "),
        );
      case "LOCAL_EXPLORE":
      case "LOCAL_VERIFY":
      case "LOCAL_EXPLORE_AND_VERIFY": {
        try {
          return await runLocal(parsed, resolution);
        } catch (error) {
          if (error instanceof CollaborationError) throw error;
          return Object.freeze({
            status: "ERROR",
            verb: COLLABORATION_VERBS.ERROR,
            // Same rule as the pre-resolution fault above: no structural verdict.
            executionKind: "ERROR",
            summary: `The collaboration run failed at the infrastructure level and no semantic result was produced: ${messageOf(error)}`,
            findings: Object.freeze([] as CollaborationFinding[]),
            unresolved: Object.freeze([] as string[]),
            capabilityWarnings: resolution.view.capabilityWarnings,
            details: Object.freeze({ branchIds: Object.freeze([] as string[]), recipeIds: Object.freeze([] as string[]), runRefs: Object.freeze([] as string[]) }),
            message: messageOf(error),
            at: deps.clock(),
          });
        }
      }
      case "ERROR":
        // Unreachable from `plan()` (a read that cannot be derived REJECTS instead of
        // inventing a structure), present so the vocabulary stays exhaustive.
        throw new CollaborationError(
          "not_configured",
          "an ERROR execution kind is never produced by planning; this is an internal invariant violation",
        );
    }
  }

  return { plan, run };
}
