/**
 * G10-S empirical architecture advisor — a READ-ONLY, plain-language advisor.
 *
 *   Advisor ≠ Authority        Recommendation ≠ Commitment
 *   HistoricalWinner ≠ FutureAuthority   Suggestion ≠ Selection
 *
 * The advisor maps a task profile and available capabilities onto eligible recipe
 * plans and a single recommended plan. It holds only a READ-ONLY
 * OrganizationMemoryService (never a mutator), owns no store, and emits NO score,
 * weight or health field anywhere: eligibility is stated, rationale is plain
 * language, and the human/user remains the chooser.
 *
 * Hard rules encoded here:
 *   - FOCUS is always eligible and is the default unless there is an engineering
 *     reason for another boundary.
 *   - COORDINATE is eligible ONLY with an already-independent sovereign peer; with
 *     none it is a NON-overridable blocker ("no independent sovereign peer").
 *   - EXPLORE is eligible only with reasoning branches; it is disfavoured (never
 *     blocked) under high coupling or low output composability.
 *   - VERIFY is suggested only with a REGISTERED verifier ref, and whether that
 *     verifier counts as independent is reported from the deployment's real
 *     runtime/registry fact (G10-AD §28) — never inferred from its NAME.
 *   - MONITOR is suggested only with campaign monitoring and never claims autonomy.
 */

import type { RecipeBaseMode, RecipePlan } from "../recipes/artifacts.js";
import { materializeRecipePlan, parseRecipePlan } from "../recipes/artifacts.js";
import type { RecipeRegistry } from "../recipes/registry.js";
import { canonicalDigest } from "../schema/canonical.js";
import type { OrganizationMemoryService } from "../organization_memory/service.js";
import type { TaskFeatureName } from "../organization_memory/artifacts.js";
import type { EmpiricalSupport } from "./evidence.js";
import {
  INSUFFICIENT_EMPIRICAL_EVIDENCE,
  collectEmpiricalSupport,
  interpretREvidence,
  parseEmpiricalSupport,
} from "./evidence.js";
import type { TaskProfile } from "./task_profile.js";
import { taskFeatureValue } from "./task_profile.js";
import { assessTransferability } from "./transferability.js";
import {
  advisorDigest,
  advisorFail,
  advisorKeys,
  advisorObject,
  advisorStringArray,
} from "./strict.js";

export const ADVISOR_RECOMMENDATION_DOMAIN = "palimpsest.advisor.recommendation.v1";
export const ADVISOR_RATIONALE_DOMAIN = "palimpsest.advisor.rationale.v1";

export const RECIPE_IDS = Object.freeze({
  focus: "focus.v1",
  explore: "explore.v1",
  coordinate: "coordinate.v1",
  verify: "verify.v1",
  monitor: "monitor.v1",
});

export const BLOCKER_NO_INDEPENDENT_PEER = "no independent sovereign peer";

/*
 * Capability notes use the same `capability_required:<id>` vocabulary as the
 * recipe execution layer, so an unavailable capability is stated, never padded.
 *
 * G10-AD §17: the VERIFY modifier's capability is PROJECT VERIFICATION, not the
 * ambiguous experiment-validator vocabulary (`experiment.validator`). The
 * ExperimentValidatorPort primitives are reused by an adapter, but experiment
 * evaluation is not project-verification truth, and the verifier is a REGISTERED
 * protocol rather than a validator ref a caller may name.
 */
export const CAPABILITY_VERIFIER = "project.verification";
export const CAPABILITY_MONITORING = "campaign.watcher";
export const CAPABILITY_REASONING = "reasoning.cell";

/* ------------------------------------------------------------------ *
 * Categorical preferences (never a score)
 * ------------------------------------------------------------------ */

export interface ArchitecturePreferences {
  readonly budget?: string | undefined;
  readonly latencyPreference?: string | undefined;
  readonly verificationPreference?: string | undefined;
  readonly persistencePreference?: string | undefined;
  readonly sharingScope?: string | undefined;
}

export interface AdvisorIndependentPeer {
  readonly peerId: string;
}

export interface AdvisorCapabilities {
  readonly independentPeers: readonly AdvisorIndependentPeer[];
  /**
   * G10-AD §28: the REGISTERED verifier ref a plan may bind, taken from the real
   * `ProjectVerifierRegistry`. A bare descriptive string is still accepted for
   * compatibility, but it NO LONGER implies an independent verifier: see
   * `independentVerifierAvailable`.
   */
  readonly verifierRef?: string | undefined;
  /**
   * G10-AD §28 (additive): TRUE only when the registered verifier really EXECUTES
   * in this deployment and counts as independent under its registered independence
   * class. Absent ⇒ false. A raw `verificationCapabilityRef` can never set it -
   * the fact must come from the runtime/registry.
   */
  readonly independentVerifierAvailable?: boolean | undefined;
  readonly campaignMonitoring: boolean;
  readonly reasoningBranches: boolean;
}

export interface ArchitectureRecommendInput {
  readonly taskProfile: TaskProfile;
  readonly preferences?: ArchitecturePreferences | undefined;
  readonly userRequestedMultiAgent?: boolean | undefined;
}

export interface ArchitectureRecommendation {
  readonly schemaVersion: 1;
  readonly eligiblePlans: readonly RecipePlan[];
  readonly recommendedPlan: RecipePlan;
  readonly alternatives: readonly RecipePlan[];
  readonly blockers: readonly string[];
  readonly rationale: readonly string[];
  readonly empiricalSupport: readonly EmpiricalSupport[];
  readonly empiricalCounterEvidence: readonly EmpiricalSupport[];
  readonly transferabilityWarnings: readonly string[];
  readonly unavailableEvidence: readonly string[];
  readonly digest: string;
}

export function architectureRecommendationDigestOf(input: Omit<ArchitectureRecommendation, "digest">): string {
  return canonicalDigest({ domain: ADVISOR_RECOMMENDATION_DOMAIN, recommendation: input });
}

export type MaterializeArchitectureRecommendationInput = Omit<ArchitectureRecommendation, "digest" | "schemaVersion">;

export function materializeArchitectureRecommendation(input: MaterializeArchitectureRecommendationInput): ArchitectureRecommendation {
  const body: Omit<ArchitectureRecommendation, "digest"> = {
    schemaVersion: 1 as const,
    eligiblePlans: Object.freeze([...input.eligiblePlans]),
    recommendedPlan: input.recommendedPlan,
    alternatives: Object.freeze([...input.alternatives]),
    blockers: Object.freeze([...input.blockers]),
    rationale: Object.freeze([...input.rationale]),
    empiricalSupport: Object.freeze([...input.empiricalSupport]),
    empiricalCounterEvidence: Object.freeze([...input.empiricalCounterEvidence]),
    transferabilityWarnings: Object.freeze([...input.transferabilityWarnings]),
    unavailableEvidence: Object.freeze([...input.unavailableEvidence]),
  };
  return Object.freeze({ ...body, digest: architectureRecommendationDigestOf(body) });
}

const RECOMMENDATION_KEYS = [
  "schemaVersion",
  "eligiblePlans",
  "recommendedPlan",
  "alternatives",
  "blockers",
  "rationale",
  "empiricalSupport",
  "empiricalCounterEvidence",
  "transferabilityWarnings",
  "unavailableEvidence",
  "digest",
] as const;

export function parseArchitectureRecommendation(raw: unknown, what = "ArchitectureRecommendation"): ArchitectureRecommendation {
  const object = advisorObject(raw, what);
  advisorKeys(object, RECOMMENDATION_KEYS, RECOMMENDATION_KEYS, what);
  if (object.schemaVersion !== 1) advisorFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  if (!Array.isArray(object.eligiblePlans) || !Array.isArray(object.alternatives)) {
    advisorFail("malformed_artifact", `${what}: eligiblePlans/alternatives must be arrays`);
  }
  const eligiblePlans = (object.eligiblePlans as unknown[]).map((entry, index) => parseRecipePlan(entry, `${what}.eligiblePlans[${index}]`));
  const eligibleById = new Map<string, RecipePlan>();
  for (const plan of eligiblePlans) {
    if (eligibleById.has(plan.planId)) advisorFail("invalid_value", `${what}.eligiblePlans has duplicate planId "${plan.planId}"`);
    eligibleById.set(plan.planId, plan);
  }
  const recommendedPlan = parseRecipePlan(object.recommendedPlan, `${what}.recommendedPlan`);
  if (eligibleById.get(recommendedPlan.planId)?.digest !== recommendedPlan.digest) {
    advisorFail("inconsistent_recommendation", `${what}.recommendedPlan must be one of eligiblePlans`);
  }
  const alternatives = (object.alternatives as unknown[]).map((entry, index) => parseRecipePlan(entry, `${what}.alternatives[${index}]`));
  const expectedAlternativeIds = eligiblePlans.filter((plan) => plan.planId !== recommendedPlan.planId).map((plan) => plan.planId);
  const alternativeIds = alternatives.map((plan) => plan.planId);
  if (
    alternativeIds.length !== expectedAlternativeIds.length ||
    alternativeIds.some((planId, index) => planId !== expectedAlternativeIds[index]) ||
    new Set(alternativeIds).size !== alternativeIds.length
  ) {
    advisorFail("inconsistent_recommendation", `${what}.alternatives must be exactly eligiblePlans minus recommendedPlan`);
  }
  if (!Array.isArray(object.empiricalSupport) || !Array.isArray(object.empiricalCounterEvidence)) {
    advisorFail("malformed_artifact", `${what}: empiricalSupport/empiricalCounterEvidence must be arrays`);
  }
  const empiricalSupport = (object.empiricalSupport as unknown[]).map((entry, index) => parseEmpiricalSupport(entry, `${what}.empiricalSupport[${index}]`));
  const empiricalCounterEvidence = (object.empiricalCounterEvidence as unknown[]).map((entry, index) => parseEmpiricalSupport(entry, `${what}.empiricalCounterEvidence[${index}]`));
  const body: Omit<ArchitectureRecommendation, "digest"> = {
    schemaVersion: 1 as const,
    eligiblePlans: Object.freeze(eligiblePlans),
    recommendedPlan,
    alternatives: Object.freeze(alternatives),
    blockers: advisorStringArray(object.blockers, `${what}.blockers`),
    rationale: advisorStringArray(object.rationale, `${what}.rationale`),
    empiricalSupport: Object.freeze(empiricalSupport),
    empiricalCounterEvidence: Object.freeze(empiricalCounterEvidence),
    transferabilityWarnings: advisorStringArray(object.transferabilityWarnings, `${what}.transferabilityWarnings`),
    unavailableEvidence: advisorStringArray(object.unavailableEvidence, `${what}.unavailableEvidence`),
  };
  const digest = advisorDigest(object.digest, `${what}.digest`);
  if (architectureRecommendationDigestOf(body) !== digest) advisorFail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...body, digest });
}

/* ------------------------------------------------------------------ *
 * Plan construction (descriptive only)
 * ------------------------------------------------------------------ */

function definitionRef(registry: RecipeRegistry, recipeId: string): { readonly recipeId: string; readonly version: number; readonly digest: string } {
  const definition = registry.get(recipeId);
  if (definition === undefined) advisorFail("unknown_recipe", `recipe "${recipeId}" is not registered`);
  return Object.freeze({ recipeId: definition.recipeId, version: definition.version, digest: definition.digest });
}

interface BuildPlanInput {
  readonly baseId: string;
  readonly modifierIds: readonly string[];
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly existingSubjectRefs: readonly string[];
  readonly rationale: readonly string[];
}

function buildPlan(registry: RecipeRegistry, input: BuildPlanInput): RecipePlan {
  const base = registry.get(input.baseId);
  if (base === undefined) advisorFail("unknown_recipe", `recipe "${input.baseId}" is not registered`);
  if (base.role !== "base") advisorFail("invalid_value", `recipe "${input.baseId}" is not a base recipe`);
  for (const modifierId of input.modifierIds) {
    const modifier = registry.get(modifierId);
    if (modifier === undefined) advisorFail("unknown_recipe", `recipe "${modifierId}" is not registered`);
    if (modifier.role !== "modifier") advisorFail("invalid_value", `recipe "${modifierId}" is not a modifier recipe`);
  }
  return materializeRecipePlan({
    baseRecipeRef: definitionRef(registry, input.baseId),
    modifierRefs: input.modifierIds.map((modifierId) => definitionRef(registry, modifierId)),
    parameters: input.parameters,
    existingSubjectRefs: input.existingSubjectRefs,
    rationaleDigest: canonicalDigest({ domain: ADVISOR_RATIONALE_DOMAIN, rationale: input.rationale }),
  });
}

function supportedModifiersOf(registry: RecipeRegistry, baseId: string): readonly string[] {
  const base = registry.get(baseId);
  return base === undefined ? Object.freeze([] as string[]) : base.supportedModifiers;
}

function isSameModelVerifier(verifierRef: string): boolean {
  // G10-AD §28: DEPRECATED and no longer consulted. A VERIFIER REF NAME is not an
  // independence signal (nor a correctness one): independence comes from the
  // registered definition's class + separation contract, which the install reads
  // from the real ProjectVerifierRegistry and reports through
  // `AdvisorCapabilities.independentVerifierAvailable`. Kept exported for embedders
  // that used it as a purely descriptive label.
  return /same[-_ ]?model|same[-_ ]?context|self[-_ ]?verif|non[-_ ]?independent/iu.test(verifierRef);
}

/** G10-AD §28: the deprecated name heuristic, kept only for display callers. */
export const verifierRefNameLooksSameModel = isSameModelVerifier;

/* ------------------------------------------------------------------ *
 * Advisor
 * ------------------------------------------------------------------ */

export interface EmpiricalArchitectureAdvisorDeps {
  readonly registry: RecipeRegistry;
  /** READ-ONLY. The advisor never mutates organization memory. */
  readonly memory?: OrganizationMemoryService | undefined;
  readonly capabilities: AdvisorCapabilities;
}

export interface EmpiricalArchitectureAdvisor {
  recommend(input: ArchitectureRecommendInput): Promise<ArchitectureRecommendation>;
}

export function makeEmpiricalArchitectureAdvisor(deps: EmpiricalArchitectureAdvisorDeps): EmpiricalArchitectureAdvisor {
  const { registry, capabilities } = deps;
  const memory = deps.memory;

  return {
    async recommend(input: ArchitectureRecommendInput): Promise<ArchitectureRecommendation> {
      const profile = input.taskProfile;
      const val = (feature: TaskFeatureName): string => taskFeatureValue(profile, feature);

      const couplingHigh = val("crossComponentCoupling") === "HIGH";
      const decomposability = val("decomposability");
      const decompHigh = decomposability === "HIGH";
      const decompLow = decomposability === "LOW";
      const verifyHigh = val("verifiability") === "HIGH";
      const parallelHigh = val("parallelSearchBenefit") === "HIGH";
      const wantsBoundary = val("authoritySeparationNeed") === "YES" || val("existingIndependentPeers") === "YES";

      const hasPeers = capabilities.independentPeers.length > 0;
      const canExplore = capabilities.reasoningBranches;
      const verifierRef = capabilities.verifierRef;
      const hasVerifier = verifierRef !== undefined && verifierRef.trim() !== "";
      const hasMonitoring = capabilities.campaignMonitoring;
      const userRequestedMultiAgent = input.userRequestedMultiAgent === true;

      const prefersExplore = decompHigh && !couplingHigh && verifyHigh && parallelHigh;
      const exploreDisfavored = couplingHigh || decompLow;
      const requestedExploreFallback = userRequestedMultiAgent && !hasPeers && canExplore;
      const shouldExplore = canExplore && (prefersExplore || requestedExploreFallback);
      const shouldCoordinate = !shouldExplore && hasPeers && (wantsBoundary || couplingHigh);

      let mode: RecipeBaseMode;
      if (shouldExplore) mode = "EXPLORE";
      else if (shouldCoordinate) mode = "COORDINATE";
      else mode = "FOCUS";

      /* --- empirical evidence (read-only) ----------------------------- */

      const evidence = memory === undefined ? undefined : await collectEmpiricalSupport(memory);
      const empiricalSupport = evidence?.supports ?? Object.freeze([] as readonly EmpiricalSupport[]);
      const empiricalCounterEvidence = evidence?.counterEvidence ?? Object.freeze([] as readonly EmpiricalSupport[]);

      const transferabilityWarnings: readonly string[] =
        evidence === undefined || evidence.supports.length === 0
          ? Object.freeze([] as string[])
          : assessTransferability({
              currentProfile: profile,
              evaluation: {
                provider: evidence.supports[0]!.provider,
                model: evidence.supports[0]!.model,
                sampleSize: evidence.supports[0]!.sampleCount,
              },
            }).warnings;

      /* --- blockers / unavailable evidence ---------------------------- */

      const blockers = new Set<string>();
      if (!hasPeers) blockers.add(BLOCKER_NO_INDEPENDENT_PEER);
      if (!canExplore && (prefersExplore || userRequestedMultiAgent)) blockers.add("reasoning branches capability is not available");

      const unavailable = new Set<string>(evidence?.unavailableEvidence ?? []);
      if (!hasVerifier) unavailable.add(`capability_required:${CAPABILITY_VERIFIER}`);
      if (!hasMonitoring) unavailable.add(`capability_required:${CAPABILITY_MONITORING}`);
      if (!canExplore && (prefersExplore || userRequestedMultiAgent)) unavailable.add(`capability_required:${CAPABILITY_REASONING}`);
      if (memory !== undefined) unavailable.add(`${INSUFFICIENT_EMPIRICAL_EVIDENCE}:REASONING_CELL:qualityScore`);

      /* --- plain-language rationale (no scores, no numbers) ----------- */

      const rationale: string[] = [];
      rationale.push("Focus is always eligible: a single persistent locus is the baseline, and no other boundary is chosen without an engineering reason.");
      if (mode === "EXPLORE" && requestedExploreFallback && !prefersExplore) {
        rationale.push("Explore is offered instead of durable peer agents: Explore uses ephemeral branches, not durable peer agents, so it needs no sovereign peer.");
      } else if (mode === "EXPLORE") {
        rationale.push("Explore is recommended: the task decomposes cleanly, its components are loosely coupled, its output is verifiable, and parallel search has measured benefit.");
      }
      if (mode === "COORDINATE") {
        rationale.push("Coordinate is recommended: an already-independent peer exists and the interface dependency calls for a durable boundary rather than a fake role split.");
      }
      if (canExplore && exploreDisfavored) {
        rationale.push("Explore is disfavoured here, though not blocked: the task is highly cross-component-coupled or output composability is low, so branches would add coordination cost without a clean composition.");
      }
      if (!hasPeers) {
        rationale.push("Coordination is blocked and cannot be overridden: there is no independent sovereign peer, and a durable peer cannot be conjured.");
      }
      if (userRequestedMultiAgent) {
        rationale.push("A multi-agent request was noted, but durable coordination still requires an already-independent peer; Explore uses ephemeral branches, not durable peer agents.");
      }
      if (hasVerifier) {
        // G10-AD §28: the independence FACT comes from the runtime/registry, never
        // from a name heuristic or a bare capability string. A registered ref that
        // does not count as independent is stated as exactly that.
        if (capabilities.independentVerifierAvailable === true) {
          rationale.push(
            `Verification can be bound to the registered verifier "${verifierRef}", which counts as independent under its registered independence class; the deployment can prove the separation.`,
          );
        } else {
          rationale.push(
            `Verification can be bound to the registered verifier "${verifierRef}", but it does not count as independent in this deployment (an unbound, shared-context, declared-only or unknown-separation verifier is not independent verification).`,
          );
        }
      } else {
        rationale.push("No verifier is registered, so Verify is not suggested.");
      }
      if (hasMonitoring) {
        rationale.push("Monitoring would be caller-driven only; no autonomous background monitoring is claimed.");
      } else {
        rationale.push("No campaign monitoring capability is configured, so Monitor is not suggested.");
      }
      if (empiricalSupport.length > 0) {
        rationale.push("The empirical basis is limited: the samples are small and come from a single provider, so no variant is a universal winner.");
        for (const reading of new Set(empiricalCounterEvidence.flatMap((support) => interpretREvidence(support)))) {
          rationale.push(reading);
        }
      } else {
        rationale.push("No empirical evaluation is available, so the recommendation rests on stated capability and task features alone.");
      }
      if (transferabilityWarnings.length > 0) {
        rationale.push(`Transfer to the current task is uncertain: ${transferabilityWarnings.join(", ")}.`);
      }

      /* --- eligible plans --------------------------------------------- */

      const buildCandidate = (baseId: string): RecipePlan => {
        const supported = supportedModifiersOf(registry, baseId);
        const modifierIds: string[] = [];
        if (hasVerifier && supported.includes("VERIFY")) modifierIds.push(RECIPE_IDS.verify);
        if (hasMonitoring && supported.includes("MONITOR")) modifierIds.push(RECIPE_IDS.monitor);
        const parameters: Record<string, unknown> = {};
        if (baseId === RECIPE_IDS.explore) parameters.question = "explore the task";
        if (modifierIds.includes(RECIPE_IDS.verify)) parameters.verifierRef = verifierRef;
        return buildPlan(registry, {
          baseId,
          modifierIds,
          parameters,
          existingSubjectRefs: baseId === RECIPE_IDS.coordinate ? capabilities.independentPeers.map((peer) => peer.peerId) : [],
          rationale,
        });
      };

      const focusPlan = buildCandidate(RECIPE_IDS.focus);
      const eligiblePlans: RecipePlan[] = [focusPlan];
      if (canExplore) eligiblePlans.push(buildCandidate(RECIPE_IDS.explore));
      if (hasPeers) eligiblePlans.push(buildCandidate(RECIPE_IDS.coordinate));

      const recommendedPlan = mode === "EXPLORE" ? eligiblePlans.find((plan) => plan.baseRecipeRef.recipeId === RECIPE_IDS.explore)! : mode === "COORDINATE" ? eligiblePlans.find((plan) => plan.baseRecipeRef.recipeId === RECIPE_IDS.coordinate)! : focusPlan;
      const alternatives = eligiblePlans.filter((plan) => plan.planId !== recommendedPlan.planId);

      return materializeArchitectureRecommendation({
        eligiblePlans,
        recommendedPlan,
        alternatives,
        blockers: [...blockers].sort(),
        rationale,
        empiricalSupport,
        empiricalCounterEvidence,
        transferabilityWarnings,
        unavailableEvidence: [...unavailable].sort(),
      });
    },
  };
}
