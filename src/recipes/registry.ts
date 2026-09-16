/**
 * G10-S recipe registry — versioned immutable product config in code.
 *
 * There is deliberately NO RecipeStore: recipes are not canonical history, they
 * are an in-code catalog of what modes of working exist and how honestly ready
 * they are. `readiness` values and `limitations` mirror
 * docs/engineering/audits/G10-S-RECIPE-ADVISOR-ASSESSMENT.md; a PRODUCTION_READY
 * recipe is only listed when a real execution binding exists.
 */

import type { RecipeDefinition } from "./artifacts.js";
import { materializeRecipeDefinition } from "./artifacts.js";

export interface RecipeRegistry {
  get(recipeId: string): RecipeDefinition | undefined;
  list(): readonly RecipeDefinition[];
}

/** The five builtin recipes, digest-bound at construction. */
export function builtinRecipeRegistry(): RecipeRegistry {
  const definitions: readonly RecipeDefinition[] = Object.freeze([
    materializeRecipeDefinition({
      recipeId: "focus.v1",
      version: 1,
      role: "base",
      baseMode: "FOCUS",
      supportedModifiers: ["VERIFY", "MONITOR"],
      capabilityRequirements: ["work.principal"],
      parameterSchema: Object.freeze({}),
      readiness: "PRODUCTION_READY",
      // The docs state no limitation beyond Work itself.
      limitations: [],
    }),
    materializeRecipeDefinition({
      recipeId: "explore.v1",
      version: 1,
      role: "base",
      baseMode: "EXPLORE",
      supportedModifiers: ["VERIFY"],
      capabilityRequirements: ["reasoning.cell", "reasoning.branch-execution"],
      parameterSchema: Object.freeze({ required: ["question"], optional: ["branchCount"] }),
      readiness: "CONDITIONAL",
      limitations: ["quality transfer unknown; branch execution is host-dependent"],
    }),
    materializeRecipeDefinition({
      recipeId: "coordinate.v1",
      version: 1,
      role: "base",
      baseMode: "COORDINATE",
      supportedModifiers: ["MONITOR", "VERIFY"],
      capabilityRequirements: ["federation.peer", "federation.contact"],
      parameterSchema: Object.freeze({ required: ["existingSubjectRefs"] }),
      readiness: "PRODUCTION_READY",
      limitations: ["requires an already-independent peer; not a way to spawn help"],
    }),
    materializeRecipeDefinition({
      recipeId: "verify.v1",
      version: 1,
      role: "modifier",
      modifier: "VERIFY",
      supportedModifiers: [],
      // G10-AD §17: the capability is PROJECT VERIFICATION, not the ambiguous
      // experiment-validator vocabulary. The ExperimentValidatorPort primitives
      // are reused by an adapter, but experiment evaluation is not project
      // verification truth, and a verifier is a REGISTERED protocol - not a
      // validator ref a caller may name.
      capabilityRequirements: ["project.verification"],
      parameterSchema: Object.freeze({ optional: ["verifierRef"] }),
      readiness: "CONDITIONAL",
      limitations: [
        "same-model same-context verification is not independent",
        "requires a registered, versioned verifier definition on the deployment's ProjectVerifierRegistry",
        "requires that definition to have a real execution binding (an unbound registered ref is not a runtime)",
        "the subject is the exact current ProjectIR head; an arbitrary commit cannot be selected",
      ],
    }),
    materializeRecipeDefinition({
      recipeId: "monitor.v1",
      version: 1,
      role: "modifier",
      modifier: "MONITOR",
      supportedModifiers: [],
      capabilityRequirements: ["campaign.watcher"],
      parameterSchema: Object.freeze({ optional: ["campaignRef"] }),
      // G10-AC §33: a real runtime now exists, so PREVIEW_ONLY is no longer
      // honest - but deployment binding remains CONDITIONAL, so this is NOT
      // PRODUCTION_READY.
      readiness: "CONDITIONAL",
      limitations: [
        "requires the Campaign prospective-memory surface",
        "requires an explicit monitor tick/runtime wiring",
        "requires a host wake adapter for autonomous resume",
        "a MONITOR preference alone does not create watches",
        "a watch firing only causes reconsideration",
        "delivery is at-least-once",
      ],
    }),
  ]);

  const byId = new Map<string, RecipeDefinition>();
  for (const definition of definitions) {
    if (byId.has(definition.recipeId)) {
      throw new Error(`builtin recipe registry contains a duplicate recipeId "${definition.recipeId}"`);
    }
    byId.set(definition.recipeId, definition);
  }

  return Object.freeze({
    get: (recipeId: string): RecipeDefinition | undefined => byId.get(recipeId),
    list: (): readonly RecipeDefinition[] => definitions,
  });
}
