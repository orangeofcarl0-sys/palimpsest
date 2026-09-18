/**
 * SR-1 R3A — the cognition tool cluster.
 *
 * palimpsest_reasoning, palimpsest_experiments, palimpsest_recipes, palimpsest_advisor, palimpsest_recipe, kept together because they read the
 * same application face(s). Adapter only: tool metadata, its own argument parsing and a call to
 * the application façade. It reaches no durable store and no semantic service directly (§12).
 */

import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import type { VariantKind } from "../../organization_memory/index.js";
import { VARIANT_KINDS } from "../../organization_memory/index.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool, ToolArgsError, required, requiredString, stringArray } from "./common.js";

export function defineCognitionTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const tools: DshToolDefinition[] = [];
if (application.reasoning !== undefined) {
    const reasoning = application.reasoning;
    tools.push(
      tool({
        name: "palimpsest_reasoning",
        description: "Collaborative reasoning: view a cell, open a branch and read its FROZEN brief, submit a structured candidate, and request evaluation (the service performs verification then epistemic admission; no chain-of-thought is ever stored)",
        mode: "mutating",
        actions: ["view", "frontier", "graph", "brief", "branch", "candidate", "evaluate", "invalidate"],
        extraProperties: {
          cellId: { type: "string" },
          branchId: { type: "string" },
          question: { type: "string" },
          type: { type: "object" },
          content: { type: "object" },
          dependencies: { type: "array", items: { type: "object" } },
          externalEvidenceRefs: { type: "array", items: { type: "string" }, description: "opaque Proof-plane evidence ids this candidate actually used (selector-only)" },
          candidateDigest: { type: "string" },
          targetClaimId: { type: "string" },
          reason: { type: "string" },
        },
        run: async (action, object) => {
          if (action === "view") return reasoning.view(requiredString(object, "cellId"));
          if (action === "frontier") return reasoning.frontier(requiredString(object, "cellId"));
          if (action === "graph") return reasoning.graph(requiredString(object, "cellId"));
          if (action === "brief") return reasoning.brief({ cellId: requiredString(object, "cellId"), branchId: requiredString(object, "branchId") });
          if (action === "branch") return reasoning.openBranch({ cellId: requiredString(object, "cellId"), question: requiredString(object, "question") });
          if (action === "candidate") {
            const refs = Array.isArray(object.externalEvidenceRefs) ? stringArray(object.externalEvidenceRefs, "externalEvidenceRefs") : [];
            return reasoning.submitCandidate({
              cellId: requiredString(object, "cellId"),
              branchId: requiredString(object, "branchId"),
              type: required(object, "type") as never,
              content: required(object, "content"),
              ...(Array.isArray(object.dependencies) ? { dependencies: object.dependencies as never } : {}),
              ...(refs.length === 0 ? {} : { externalEvidenceRefs: refs.map((evidenceId) => ({ evidenceId })) }),
            });
          }
          if (action === "evaluate") return reasoning.evaluate({ cellId: requiredString(object, "cellId"), candidateDigest: requiredString(object, "candidateDigest") });
          return reasoning.invalidate({ cellId: requiredString(object, "cellId"), targetClaimId: requiredString(object, "targetClaimId"), reason: requiredString(object, "reason") });
        },
      }),
    );
  }

  if (application.empirical !== undefined) {
    const empirical = application.empirical;
    tools.push(
      tool({
        name: "palimpsest_experiments",
        description: "Read-only empirical history: experiment/scenario/variant definitions, observed run results, derived evaluations, measurement corrections, structural interventions, and deterministic similar-run/structural-history queries (evaluation ≠ governance; memory ≠ authority)",
        mode: "read-only",
        actions: ["experiments", "experiment", "scenarios", "variants", "runs", "run", "evaluations", "corrections", "interventions", "similar_runs", "structural_history"],
        extraProperties: {
          experimentId: { type: "string" },
          runRef: { type: "string" },
          subjectRef: { type: "string" },
          scenarioId: { type: "string" },
          variantKind: { type: "string", enum: [...VARIANT_KINDS] },
          provider: { type: "string" },
          model: { type: "string" },
        },
        run: async (action, object) => {
          if (action === "experiments") return empirical.experiments();
          if (action === "experiment") return empirical.experiment(requiredString(object, "experimentId"));
          if (action === "scenarios") return empirical.scenarios(requiredString(object, "experimentId"));
          if (action === "variants") return empirical.variants(requiredString(object, "experimentId"));
          if (action === "runs") return empirical.runs(requiredString(object, "experimentId"));
          if (action === "run") return empirical.run(requiredString(object, "runRef"));
          if (action === "evaluations") return empirical.evaluations(requiredString(object, "experimentId"));
          if (action === "corrections") return empirical.corrections(requiredString(object, "experimentId"));
          if (action === "interventions") return empirical.interventions();
          if (action === "structural_history") return empirical.structuralHistory(requiredString(object, "subjectRef"));
          const variantKind = object.variantKind;
          if (variantKind !== undefined && (typeof variantKind !== "string" || !(VARIANT_KINDS as readonly string[]).includes(variantKind))) {
            throw new ToolArgsError(`argument "variantKind" must be one of ${VARIANT_KINDS.join(", ")}`);
          }
          return empirical.similarRuns({
            ...(typeof object.scenarioId === "string" ? { scenarioId: object.scenarioId } : {}),
            ...(variantKind === undefined ? {} : { variantKind: variantKind as VariantKind }),
            ...(typeof object.provider === "string" ? { provider: object.provider } : {}),
            ...(typeof object.model === "string" ? { model: object.model } : {}),
          });
        },
      }),
    );
  }

  if (application.recipes !== undefined) {
    const recipes = application.recipes;
    tools.push(
      tool({
        name: "palimpsest_recipes",
        description: "Read-only recipe catalog: the versioned modes of working, their supported modifiers, honest per-capability readiness, and stated limitations (a recipe is descriptive product config, never authority)",
        mode: "read-only",
        actions: ["list", "inspect", "readiness"],
        extraProperties: { recipeId: { type: "string" } },
        run: async (action, object) => {
          if (action === "list") return recipes.list();
          if (action === "readiness") return recipes.readiness();
          return recipes.inspect(requiredString(object, "recipeId")) ?? null;
        },
      }),
    );
  }

  if (application.advisor !== undefined) {
    const advisor = application.advisor;
    tools.push(
      tool({
        name: "palimpsest_advisor",
        description: "Read-only empirical architecture advisor: profile a task and get eligible recipe plans with one plain-language recommendation, non-overridable blockers, and disclosed empirical uncertainty (a suggestion, never a chooser; no score/weight/health)",
        mode: "read-only",
        actions: ["profile", "recommend", "explain"],
        extraProperties: {
          task: { type: "string" },
          values: { type: "object" },
          taskProfile: { type: "object" },
          preferences: { type: "object" },
          userRequestedMultiAgent: { type: "boolean" },
        },
        run: async (action, object) => {
          if (action === "profile") {
            return advisor.profile({
              ...(typeof object.task === "string" ? { task: object.task } : {}),
              ...(object.values === undefined ? {} : { values: required(object, "values") as Readonly<Record<string, string>> }),
            });
          }
          const taskProfile = required(object, "taskProfile");
          if (typeof taskProfile !== "object" || taskProfile === null) throw new ToolArgsError("taskProfile must be an object");
          const input = {
            taskProfile: taskProfile as never,
            ...(object.preferences === undefined ? {} : { preferences: object.preferences as never }),
            ...(typeof object.userRequestedMultiAgent === "boolean" ? { userRequestedMultiAgent: object.userRequestedMultiAgent } : {}),
          };
          if (action === "recommend") return advisor.recommend(input);
          return advisor.explain(input);
        },
      }),
    );
  }

  if (application.recipeExecution !== undefined) {
    const recipeExecution = application.recipeExecution;
    tools.push(
      tool({
        name: "palimpsest_recipe",
        description: "Compile a recipe plan into a descriptive plan, report the execution bindings actually wired, and START it through the EXISTING governed services (compilation grants no authority; start never admits a claim, accepts a boundary, evolves anything, or forces a peer)",
        mode: "mutating",
        actions: ["compile", "start", "status"],
        extraProperties: { plan: { type: "object" }, compiled: { type: "object" }, context: { type: "object" } },
        run: async (action, object) => {
          if (action === "status") return recipeExecution.status();
          if (action === "compile") {
            const plan = required(object, "plan");
            if (typeof plan !== "object" || plan === null) throw new ToolArgsError("plan must be an object");
            return recipeExecution.compile(plan as never);
          }
          const compiled = required(object, "compiled");
          if (typeof compiled !== "object" || compiled === null) throw new ToolArgsError("compiled must be an object");
          const context = object.context;
          return recipeExecution.start(compiled as never, (typeof context === "object" && context !== null ? context : {}) as never);
        },
      }),
    );
  }
  return tools;
}
