/**
 * G10-S recipe compiler — resolve a RecipePlan against a RecipeRegistry into a
 * descriptive CompiledRecipePlan.
 *
 * Compilation is PURE and DESCRIPTIVE: it resolves refs, checks modifier support,
 * and lays out steps. It imports no store, performs no mutation, and grants no
 * authority — execution is a separate concern that goes through the existing
 * governed services (ReasoningCell, Federation, Experiment validators, Campaign).
 */

import type { PeerRef } from "../federation/peer.js";
import { materializePeerRef } from "../federation/peer.js";
import type {
  CompiledRecipePlan,
  CompiledStep,
  RecipeBaseMode,
  RecipeDefinition,
  RecipeDefinitionRef,
  RecipeModifier,
  RecipePlan,
} from "./artifacts.js";
import { materializeCompiledRecipePlan } from "./artifacts.js";
import type { RecipeRegistry } from "./registry.js";

export type RecipeCompileErrorKind =
  | "unknown_recipe"
  | "unsupported_modifier"
  | "missing_parameter"
  | "coordinate_requires_independent_peer"
  | "invalid_plan";

export class RecipeCompileError extends Error {
  constructor(
    readonly kind: RecipeCompileErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "RecipeCompileError";
  }
}

/**
 * Every compiled plan carries these notes verbatim. Compilation describes; it does
 * not authorize.
 */
export const COMPILATION_AUTHORITY_NOTES: readonly string[] = Object.freeze([
  "compilation is descriptive only",
  "execution goes through existing governed services",
  "no commitment/boundary/epistemic/admission/evolution/effect authority is granted",
]);

function resolveRecipe(ref: RecipeDefinitionRef, registry: RecipeRegistry, label: "base" | "modifier"): RecipeDefinition {
  const definition = registry.get(ref.recipeId);
  if (definition === undefined) {
    throw new RecipeCompileError("unknown_recipe", `unknown ${label} recipe "${ref.recipeId}"`);
  }
  if (definition.version !== ref.version || definition.digest !== ref.digest) {
    throw new RecipeCompileError(
      "invalid_plan",
      `${label} ref for "${ref.recipeId}" does not match the registered definition (version/digest mismatch)`,
    );
  }
  return definition;
}

function parameterOf(plan: RecipePlan, name: string): unknown {
  return plan.parameters[name];
}

function baseModeSteps(plan: RecipePlan, baseMode: RecipeBaseMode): readonly CompiledStep[] {
  switch (baseMode) {
    case "FOCUS":
      return Object.freeze([Object.freeze({ kind: "reuse_principal" as const })]);
    case "EXPLORE": {
      const question = parameterOf(plan, "question");
      if (typeof question !== "string" || question.trim() === "") {
        throw new RecipeCompileError("missing_parameter", "EXPLORE requires a non-empty string parameter \"question\"");
      }
      const rawBranchCount = parameterOf(plan, "branchCount");
      let branchCount = 2;
      if (rawBranchCount !== undefined) {
        if (typeof rawBranchCount !== "number" || !Number.isSafeInteger(rawBranchCount) || rawBranchCount < 2) {
          throw new RecipeCompileError("missing_parameter", "EXPLORE parameter \"branchCount\" must be a safe integer >= 2");
        }
        branchCount = rawBranchCount;
      }
      return Object.freeze([Object.freeze({ kind: "open_reasoning_cell" as const, branchCount, question })]);
    }
    case "COORDINATE": {
      if (plan.existingSubjectRefs.length === 0) {
        throw new RecipeCompileError(
          "coordinate_requires_independent_peer",
          "COORDINATE requires at least one existing subject ref naming an already-independent peer",
        );
      }
      // Refying an EXISTING subject ref into a PeerRef identity is not creating a peer.
      const peerRefs: readonly PeerRef[] = Object.freeze(
        plan.existingSubjectRefs.map((peerId) => {
          try {
            return materializePeerRef({ peerId });
          } catch (error) {
            throw new RecipeCompileError(
              "invalid_plan",
              `existing subject ref "${peerId}" is not a valid peer id: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }),
      );
      return Object.freeze([
        Object.freeze({ kind: "surface_contact_need" as const, peerRefs }),
        Object.freeze({ kind: "prepare_boundary_context" as const, peerRefs }),
      ]);
    }
  }
}

/**
 * G10-AD §17: the EXPLICIT sentinel a VERIFY modifier carries when the plan names
 * no verifier ref. It means "the deployment's default REGISTERED verifier", which
 * execution resolves against the runtime registry. It is named rather than
 * silently bound: an absent verifier never becomes an invented one, and a
 * deployment with no registered default fails the step honestly.
 */
export const PROJECT_DEFAULT_VERIFIER_REF = "project-default";

function modifierStep(plan: RecipePlan, modifier: RecipeModifier): CompiledStep {
  if (modifier === "VERIFY") {
    const raw = parameterOf(plan, "verifierRef");
    // G10-AD §17: `project-default` is the honest, EXPLICIT sentinel. The old
    // `"deterministic"` token named no registered protocol and read like a real
    // verifier ref, so an absent parameter looked bound. Execution now resolves
    // this sentinel against the runtime registry (or fails with a typed
    // capability/unresolved outcome if no default verifier exists).
    if (raw === undefined) {
      return Object.freeze({ kind: "bind_verification" as const, verifierRef: PROJECT_DEFAULT_VERIFIER_REF });
    }
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new RecipeCompileError("missing_parameter", "VERIFY parameter \"verifierRef\" must be a non-empty string");
    }
    return Object.freeze({ kind: "bind_verification" as const, verifierRef: raw });
  }
  const raw = parameterOf(plan, "campaignRef");
  if (raw === undefined) return Object.freeze({ kind: "bind_monitoring" as const });
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new RecipeCompileError("missing_parameter", "MONITOR parameter \"campaignRef\" must be a non-empty string");
  }
  return Object.freeze({ kind: "bind_monitoring" as const, campaignRef: raw });
}

export function compileRecipePlan(plan: RecipePlan, registry: RecipeRegistry): CompiledRecipePlan {
  const base = resolveRecipe(plan.baseRecipeRef, registry, "base");
  if (base.role !== "base" || base.baseMode === undefined) {
    throw new RecipeCompileError("invalid_plan", `recipe "${base.recipeId}" is not a base recipe`);
  }
  const resolvedModifiers = plan.modifierRefs.map((ref) => resolveRecipe(ref, registry, "modifier"));

  const modifiers: RecipeModifier[] = [];
  const seenModifiers = new Set<RecipeModifier>();
  for (const definition of resolvedModifiers) {
    if (definition.role !== "modifier" || definition.modifier === undefined) {
      throw new RecipeCompileError("invalid_plan", `recipe "${definition.recipeId}" is not a modifier recipe`);
    }
    const modifier = definition.modifier;
    if (!base.supportedModifiers.includes(modifier)) {
      throw new RecipeCompileError(
        "unsupported_modifier",
        `base recipe "${base.recipeId}" does not support modifier "${modifier}"`,
      );
    }
    if (seenModifiers.has(modifier)) continue;
    seenModifiers.add(modifier);
    modifiers.push(modifier);
  }

  const steps: CompiledStep[] = [...baseModeSteps(plan, base.baseMode)];
  for (const modifier of modifiers) steps.push(modifierStep(plan, modifier));

  const capabilities: string[] = [];
  const seenCapabilities = new Set<string>();
  for (const definition of [base, ...resolvedModifiers]) {
    for (const capability of definition.capabilityRequirements) {
      if (seenCapabilities.has(capability)) continue;
      seenCapabilities.add(capability);
      capabilities.push(capability);
    }
  }

  return materializeCompiledRecipePlan({
    planDigest: plan.digest,
    baseMode: base.baseMode,
    modifiers: Object.freeze(modifiers),
    steps: Object.freeze(steps),
    requiredCapabilities: Object.freeze(capabilities),
    authorityNotes: COMPILATION_AUTHORITY_NOTES,
  });
}
