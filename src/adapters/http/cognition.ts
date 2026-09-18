/**
 * SR-1 R3B — the cognition route cluster: reasoning cells, empirical memory, recipes and the
 * advisor.
 *
 * One cluster because they are one loop: a reasoning cell produces candidates, the empirical
 * memory records what past runs showed, a recipe encodes a reusable procedure, and the advisor
 * proposes which of them fits a request. History stays READ-ONLY here (evaluation ≠ governance).
 */

import {
  bodyObject,
  parseBody,
  queryRequired,
  requireSurface,
  route,
  str,
  type ApplicationRouteDescriptor,
} from "./common.js";
import { InvalidRequest } from "./common.js";
import { VARIANT_KINDS } from "../../organization_memory/index.js";
import type { VariantKind } from "../../organization_memory/index.js";
import type { CompiledRecipePlan } from "../../recipes/artifacts.js";
import { parseCompiledRecipePlan, parseRecipePlan } from "../../recipes/artifacts.js";
import type { TaskProfile } from "../../advisor/task_profile.js";
import { parseTaskProfile } from "../../advisor/task_profile.js";
import type { RecipeExecutionContext } from "../../recipes/execution.js";

export const COGNITION_ROUTES: readonly ApplicationRouteDescriptor[] = [
  /* ---- reasoning ---- */
  /*
    Added after the canonical baseline, and recorded as such in the parity gate
    (`REVIEWED_ROUTE_ADDITIONS`) rather than slipped in silently.

    Every other reasoning route requires a `cellId`, so a client could only reach a cell whose id it
    had been told out of band — there was no way for the dashboard to show what had already been
    explored. This is the index: the cells this deployment owns, with the objective a human wrote.
    It returns definitions only — no frontier, no claims, no candidate bodies.
  */
  route({
    path: "/api/reasoning/cells",
    methods: ["GET"],
    face: "reasoning",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.reasoning, "reasoning").listCells());
    },
  }),
  route({
    path: "/api/reasoning/view",
    methods: ["GET"],
    face: "reasoning",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.reasoning, "reasoning").view(queryRequired(query, "cellId")));
    },
  }),
  route({
    path: "/api/reasoning/frontier",
    methods: ["GET"],
    face: "reasoning",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.reasoning, "reasoning").frontier(queryRequired(query, "cellId")));
    },
  }),
  route({
    path: "/api/reasoning/graph",
    methods: ["GET"],
    face: "reasoning",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.reasoning, "reasoning").graph(queryRequired(query, "cellId")));
    },
  }),
  route({
    path: "/api/reasoning/brief",
    methods: ["GET"],
    face: "reasoning",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.reasoning, "reasoning").brief({ cellId: queryRequired(query, "cellId"), branchId: queryRequired(query, "branchId") }));
    },
  }),
  route({
    path: "/api/reasoning/branch",
    methods: ["POST"],
    face: "reasoning",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.reasoning, "reasoning").openBranch({ cellId: str(b.cellId, "cellId"), question: str(b.question, "question") }));
    },
  }),
  route({
    path: "/api/reasoning/candidate",
    methods: ["POST"],
    face: "reasoning",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const externalEvidenceRefs = Array.isArray(b.externalEvidenceRefs)
        ? b.externalEvidenceRefs.map((entry) => ({
            evidenceId: typeof entry === "string" ? str(entry, "externalEvidenceRefs[]") : str(bodyObject(entry).evidenceId, "externalEvidenceRefs[].evidenceId"),
          }))
        : [];
      return ok(
        await requireSurface(application.reasoning, "reasoning").submitCandidate({
          cellId: str(b.cellId, "cellId"),
          branchId: str(b.branchId, "branchId"),
          type: b.type as never,
          content: b.content,
          ...(Array.isArray(b.dependencies) ? { dependencies: b.dependencies as never } : {}),
          ...(externalEvidenceRefs.length === 0 ? {} : { externalEvidenceRefs }),
        }),
      );
    },
  }),
  route({
    path: "/api/reasoning/evaluate",
    methods: ["POST"],
    face: "reasoning",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.reasoning, "reasoning").evaluate({ cellId: str(b.cellId, "cellId"), candidateDigest: str(b.candidateDigest, "candidateDigest") }));
    },
  }),
  route({
    path: "/api/reasoning/invalidate",
    methods: ["POST"],
    face: "reasoning",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.reasoning, "reasoning").invalidate({ cellId: str(b.cellId, "cellId"), targetClaimId: str(b.targetClaimId, "targetClaimId"), reason: str(b.reason, "reason") }));
    },
  }),

  /* ---- empirical memory (READ-ONLY history; evaluation ≠ governance) ---- */
  route({
    path: "/api/experiments",
    methods: ["GET"],
    face: "empirical",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.empirical, "experiments").experiments());
    },
  }),
  route({
    path: "/api/experiments/experiment",
    methods: ["GET"],
    face: "empirical",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.empirical, "experiments").experiment(queryRequired(query, "experimentId")));
    },
  }),
  route({
    path: "/api/experiments/scenarios",
    methods: ["GET"],
    face: "empirical",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.empirical, "experiments").scenarios(queryRequired(query, "experimentId")));
    },
  }),
  route({
    path: "/api/experiments/variants",
    methods: ["GET"],
    face: "empirical",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.empirical, "experiments").variants(queryRequired(query, "experimentId")));
    },
  }),
  route({
    path: "/api/experiments/runs",
    methods: ["GET"],
    face: "empirical",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.empirical, "experiments").runs(queryRequired(query, "experimentId")));
    },
  }),
  route({
    path: "/api/experiments/run",
    methods: ["GET"],
    face: "empirical",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.empirical, "experiments").run(queryRequired(query, "runRef")));
    },
  }),
  route({
    path: "/api/experiments/evaluations",
    methods: ["GET"],
    face: "empirical",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.empirical, "experiments").evaluations(queryRequired(query, "experimentId")));
    },
  }),
  route({
    path: "/api/experiments/corrections",
    methods: ["GET"],
    face: "empirical",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.empirical, "experiments").corrections(queryRequired(query, "experimentId")));
    },
  }),
  route({
    path: "/api/memory/interventions",
    methods: ["GET"],
    face: "empirical",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.empirical, "experiments").interventions());
    },
  }),
  route({
    path: "/api/memory/similar_runs",
    methods: ["GET"],
    face: "empirical",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      const empirical = requireSurface(application.empirical, "experiments");
      const scenarioId = query.get("scenarioId");
      const variantKind = query.get("variantKind");
      const provider = query.get("provider");
      const model = query.get("model");
      if (variantKind !== null && !(VARIANT_KINDS as readonly string[]).includes(variantKind)) {
        throw new InvalidRequest(`query parameter "variantKind" must be one of ${VARIANT_KINDS.join(", ")}`);
      }
      return ok(await empirical.similarRuns({
        ...(scenarioId === null || scenarioId === "" ? {} : { scenarioId }),
        ...(variantKind === null ? {} : { variantKind: variantKind as VariantKind }),
        ...(provider === null || provider === "" ? {} : { provider }),
        ...(model === null || model === "" ? {} : { model }),
      }));
    },
  }),
  route({
    path: "/api/memory/structural_history",
    methods: ["GET"],
    face: "empirical",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.empirical, "experiments").structuralHistory(queryRequired(query, "subjectRef")));
    },
  }),

  /* ---- recipes / advisor (G10-S; read-only except an explicit governed start) ---- */
  route({
    path: "/api/recipes",
    methods: ["GET"],
    face: "recipes",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(requireSurface(application.recipes, "recipes").list());
    },
  }),
  route({
    path: "/api/recipes/recipe",
    methods: ["GET"],
    face: "recipes",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(requireSurface(application.recipes, "recipes").inspect(queryRequired(query, "id")) ?? null);
    },
  }),
  route({
    path: "/api/recipes/readiness",
    methods: ["GET"],
    face: "recipes",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(requireSurface(application.recipes, "recipes").readiness());
    },
  }),
  route({
    path: "/api/recipes/compile",
    methods: ["POST"],
    face: "recipeExecution",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const recipeExecution = requireSurface(application.recipeExecution, "recipeExecution");
      return ok(recipeExecution.compile(parseBody(() => parseRecipePlan(body, "request body"))));
    },
  }),
  route({
    path: "/api/recipes/execute",
    methods: ["POST"],
    face: "recipeExecution",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const recipeExecution = requireSurface(application.recipeExecution, "recipeExecution");
      const b = bodyObject(body);
      const hasEnvelope = Object.hasOwn(b, "compiled");
      const compiled: CompiledRecipePlan = parseBody(() => parseCompiledRecipePlan(hasEnvelope ? b.compiled : body, "request body"));
      const context = hasEnvelope ? b.context : undefined;
      return ok(await recipeExecution.start(compiled, (context === undefined || context === null ? {} : context) as RecipeExecutionContext));
    },
  }),
  route({
    path: "/api/advisor/recommend",
    methods: ["POST"],
    face: "advisor",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const advisor = requireSurface(application.advisor, "advisor");
      const taskProfile: TaskProfile = parseBody(() => parseTaskProfile(b.taskProfile, "taskProfile"));
      return ok(
        await advisor.recommend({
          taskProfile,
          ...(b.preferences === undefined ? {} : { preferences: b.preferences as never }),
          ...(typeof b.userRequestedMultiAgent === "boolean" ? { userRequestedMultiAgent: b.userRequestedMultiAgent } : {}),
        }),
      );
    },
  }),
];
