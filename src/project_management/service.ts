/**
 * G10-V graduated project-management autonomy — the bounded management service.
 *
 *   EffectivePermission = existing semantic authority ∩ management policy ∩ capability
 *   Service ≠ Authority       Recommendation ≠ Mutation       Request ≠ Change
 *
 * This service owns NO store and NO authority of its own. It composes:
 *   - the operator profile (read from the injected `UserManagementControlPort`);
 *   - the derived `ProjectWorkspaceView`;
 *   - the deterministic action policy; and
 *   - the EXISTING governed services (`controller.runTurn`, `controller.plan`,
 *     the recipe execution service, the injected local verification port).
 *
 * It can never attest semantic authority: every authority-shaped action class is
 * refused with `not_permitted`. Mode changes are REQUESTS only on the
 * agent-facing path; only the operator path (`applyOperatorModeChange`, wired to
 * a CLI/host port, never to an LLM tool) may persist one.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { parseProjectIr, type ProjectIr, type TaskSpec } from "../schema/models.js";
import { decodeJsonBlob, type ProjectController } from "../tools/controller.js";
import { materializeRecipePlan } from "../recipes/artifacts.js";
import { compileRecipePlan } from "../recipes/compiler.js";
import type { RecipeExecutionService } from "../recipes/execution.js";
import type { RecipeRegistry } from "../recipes/registry.js";
import type { ProjectWorkspaceService } from "../project_workspace/service.js";

import {
  CAPABILITY_OBSERVE,
  CAPABILITY_PREPARE,
  CAPABILITY_PLAN,
  CAPABILITY_RECIPE_EXECUTION,
  CAPABILITY_RECOMMEND,
  CAPABILITY_RUN_TURN,
  CAPABILITY_VERIFY,
  deriveManagementActionCandidates,
  type ManagementActionCandidate,
} from "./actions.js";
import { evaluateManagementAction, type ManagementActionEvaluation } from "./policy.js";
import {
  MANAGEMENT_INVOLVEMENTS,
  managementFail,
  type ManagementActionClass,
  type ManagementAutonomyProfile,
  type ManagementInvolvement,
  type UserManagementControlPort,
} from "./profile.js";

export const MANAGEMENT_RECIPE_RATIONALE_DOMAIN = "palimpsest.project-management.recipe-rationale.v1";

/* ------------------------------------------------------------------ *
 * Dependency surface
 * ------------------------------------------------------------------ */

export interface ProjectManagementRecipeDeps {
  readonly registry: RecipeRegistry;
  readonly execution?: RecipeExecutionService | undefined;
}

export interface ProjectManagementCapabilities {
  readonly recipeExecution: boolean;
  readonly verify: boolean;
}

export interface ProjectManagementServiceDeps {
  readonly workspace: ProjectWorkspaceService;
  readonly control: UserManagementControlPort;
  readonly controller: ProjectController;
  readonly recipes?: ProjectManagementRecipeDeps | undefined;
  readonly verify?: { run(): Promise<unknown> } | undefined;
  readonly capabilities?: ProjectManagementCapabilities | undefined;
  readonly clock?: (() => string) | undefined;
}

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

export interface ManagementAssessment {
  readonly profile: ManagementAutonomyProfile;
  readonly view: Awaited<ReturnType<ProjectWorkspaceService["view"]>>;
  readonly candidates: readonly ManagementActionCandidate[];
}

export type ManagementStepPreview =
  | {
      readonly candidate: ManagementActionCandidate;
      readonly permitted: boolean;
      readonly requiredConfirmation: boolean;
      readonly reason: string;
    }
  | { readonly candidate: null; readonly reason: string };

export type ManagementStepStatus = "executed" | "needs_confirmation" | "not_permitted" | "nothing_to_do";

export interface ManagementStepResult {
  readonly status: ManagementStepStatus;
  readonly action?: string | undefined;
  readonly detail: string;
}

export interface ManagementBoundedRun {
  readonly steps: readonly ManagementStepResult[];
  readonly stoppedReason: string;
}

export interface ProjectManagementService {
  assess(): Promise<ManagementAssessment>;
  recommend(): Promise<readonly ManagementActionCandidate[]>;
  previewStep(): Promise<ManagementStepPreview>;
  step(input?: { readonly confirmed?: boolean | undefined }): Promise<ManagementStepResult>;
  runBounded(input?: { readonly maxSteps?: number | undefined }): Promise<ManagementBoundedRun>;
  requestModeChange(input: { readonly to: ManagementInvolvement; readonly requestedBy: string }): Promise<{ readonly status: "requested"; readonly detail: string }>;
  applyOperatorModeChange(input: { readonly to: ManagementInvolvement; readonly updatedBy: string }): Promise<ManagementAutonomyProfile>;
}

/* ------------------------------------------------------------------ *
 * Action-class execution priority (mechanical first, authority-shaped last)
 * ------------------------------------------------------------------ */

const EXECUTION_PRIORITY: readonly ManagementActionClass[] = Object.freeze([
  "ADVANCE_MECHANICAL_WORK",
  "START_LOCAL_RECIPE",
  "RUN_LOCAL_VERIFY",
  "DISPATCH_LOCAL_WORK",
  "APPLY_LOCAL_PLAN_REVISION",
  "PREPARE",
  "RECOMMEND",
  "OBSERVE",
  "SEND_PEER_REQUEST",
  "CREATE_EXTERNAL_COMMITMENT",
  "APPROVE_DISCLOSURE",
  "EVOLVE_ORGANIZATION",
  "IRREVERSIBLE_EFFECT",
]);

const NON_EXECUTABLE_ACTIONS: readonly ManagementActionClass[] = Object.freeze([
  "SEND_PEER_REQUEST",
  "CREATE_EXTERNAL_COMMITMENT",
  "APPROVE_DISCLOSURE",
  "EVOLVE_ORGANIZATION",
  "IRREVERSIBLE_EFFECT",
]);

/** Why an action class has no governed execution binding in this layer. */
function refusalReason(actionClass: ManagementActionClass): string | undefined {
  switch (actionClass) {
    case "SEND_PEER_REQUEST":
      return "peer requests are not executed by the management layer; they go through the existing federation/coordination services directly";
    case "CREATE_EXTERNAL_COMMITMENT":
      return "creating an external commitment requires existing commitment authority, which a management mode can never grant";
    case "APPROVE_DISCLOSURE":
      return "disclosure approval requires existing disclosure/governance authority, which a management mode can never grant";
    case "EVOLVE_ORGANIZATION":
      return "organization evolution is a governed act; the management layer holds no evolution authority";
    case "IRREVERSIBLE_EFFECT":
      return "irreversible effects require existing effect authority, which a management mode can never grant";
    default:
      return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * Implementation
 * ------------------------------------------------------------------ */

export function makeProjectManagementService(deps: ProjectManagementServiceDeps): ProjectManagementService {
  const controller = deps.controller;
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();

  /** Read the current ProjectIR (read-only; the controller owns the projection). */
  function readProject(): ProjectIr {
    const row = controller.store.connection
      .prepare("SELECT state_json FROM projects WHERE project_id=?")
      .get(controller.projectId) as { state_json: unknown } | undefined;
    if (row === undefined) {
      managementFail("invalid_registration", `project "${controller.projectId}" has no ProjectIR`);
    }
    try {
      return parseProjectIr(decodeJsonBlob(row.state_json));
    } catch (error) {
      managementFail("malformed_artifact", `project "${controller.projectId}" ProjectIR is unreadable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function capabilityAvailable(capability: string): boolean {
    switch (capability) {
      case CAPABILITY_OBSERVE:
      case CAPABILITY_RECOMMEND:
      case CAPABILITY_PREPARE:
      case CAPABILITY_RUN_TURN:
      case CAPABILITY_PLAN:
        return true;
      case CAPABILITY_RECIPE_EXECUTION:
        return deps.capabilities?.recipeExecution ?? deps.recipes?.execution !== undefined;
      case CAPABILITY_VERIFY:
        return deps.capabilities?.verify ?? deps.verify !== undefined;
      default:
        // Fail closed: an unmapped capability (e.g. the authority-shaped classes)
        // is never available in this deployment.
        return false;
    }
  }

  function withinEnvelope(candidate: ManagementActionCandidate, project: ProjectIr): boolean {
    if (candidate.subjects.length === 0) return false;
    const taskIds = new Set(project.tasks.map((task) => task.task_id));
    return candidate.subjects.every((subject) => subject.kind === "task" && taskIds.has(subject.id));
  }

  /**
   * The management layer never attests semantic authority: it has no authority
   * port, so it always answers `false` and the authority-shaped classes stay
   * refused. Authority can only be exercised by the existing governed services.
   */
  function evaluateCandidate(
    profile: ManagementAutonomyProfile,
    candidate: ManagementActionCandidate,
    project: ProjectIr,
    confirmed: boolean,
  ): ManagementActionEvaluation {
    return evaluateManagementAction({
      profile,
      actionClass: candidate.kind,
      hasSemanticAuthority: false,
      capabilityAvailable: capabilityAvailable(candidate.capability),
      isWithinEnvelope: withinEnvelope(candidate, project),
      confirmed,
    });
  }

  function orderedCandidates(candidates: readonly ManagementActionCandidate[]): readonly ManagementActionCandidate[] {
    const order = new Map<string, number>(EXECUTION_PRIORITY.map((kind, index) => [kind, index]));
    return [...candidates].sort((a, b) => {
      const delta = (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0);
      if (delta !== 0) return delta;
      return a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0;
    });
  }

  function stepResult(status: ManagementStepStatus, action: string | undefined, detail: string): ManagementStepResult {
    return Object.freeze({ status, ...(action === undefined ? {} : { action }), detail });
  }

  async function assess(): Promise<ManagementAssessment> {
    const profile = await deps.control.get(controller.projectId);
    const view = await deps.workspace.view();
    return Object.freeze({ profile, view, candidates: deriveManagementActionCandidates(view) });
  }

  async function recommend(): Promise<readonly ManagementActionCandidate[]> {
    // Recommendation ONLY: no governed service is called, nothing is mutated.
    return (await assess()).candidates;
  }

  async function previewStep(): Promise<ManagementStepPreview> {
    const { profile, candidates } = await assess();
    const ordered = orderedCandidates(candidates);
    if (ordered.length === 0) {
      return Object.freeze({ candidate: null, reason: "no management action candidates are derivable from the current workspace view" });
    }
    const project = readProject();
    // Preview the SAME candidate `step()` would act on: the first permitted one,
    // else the first that is waiting on a confirmation boundary, else the first
    // hard denial.
    let pending: { readonly candidate: ManagementActionCandidate; readonly evaluation: ManagementActionEvaluation } | undefined;
    let denied: { readonly candidate: ManagementActionCandidate; readonly evaluation: ManagementActionEvaluation } | undefined;
    for (const candidate of ordered) {
      const evaluation = evaluateCandidate(profile, candidate, project, false);
      if (evaluation.permitted) {
        return Object.freeze({ candidate, permitted: true, requiredConfirmation: evaluation.requiredConfirmation, reason: evaluation.reason });
      }
      if (evaluation.requiredConfirmation) {
        pending ??= { candidate, evaluation };
        continue;
      }
      denied ??= { candidate, evaluation };
    }
    const chosen = pending ?? denied;
    if (chosen === undefined) {
      return Object.freeze({ candidate: null, reason: "no management action is available under the current profile" });
    }
    return Object.freeze({
      candidate: chosen.candidate,
      permitted: chosen.evaluation.permitted,
      requiredConfirmation: chosen.evaluation.requiredConfirmation,
      reason: chosen.evaluation.reason,
    });
  }

  /** Execute one already-permitted candidate through an existing governed service. */
  async function executeCandidate(candidate: ManagementActionCandidate, profile: ManagementAutonomyProfile): Promise<ManagementStepResult> {
    const refusal = refusalReason(candidate.kind);
    if (refusal !== undefined) return stepResult("not_permitted", candidate.kind, refusal);

    switch (candidate.kind) {
      case "OBSERVE":
        return stepResult("executed", candidate.kind, `observed without mutation: ${candidate.reason}`);
      case "RECOMMEND":
        return stepResult("executed", candidate.kind, `recommendation published without mutation: ${candidate.reason}`);
      case "PREPARE":
        return stepResult("executed", candidate.kind, `prepared without mutation; promotion stays explicit: ${candidate.reason}`);

      case "ADVANCE_MECHANICAL_WORK": {
        const turn = await controller.runTurn({ maxSteps: profile.budgets.maxStepsPerRun });
        return stepResult("executed", candidate.kind, `controller.runTurn phase=${turn.phase} attemptsRun=${turn.mechanical.attemptsRun}`);
      }

      case "DISPATCH_LOCAL_WORK":
      case "APPLY_LOCAL_PLAN_REVISION": {
        const current = readProject();
        if (candidate.subjects.some((subject) => subject.kind === "goal")) {
          return stepResult("not_permitted", candidate.kind, "the management layer never changes the project goal; a goal change is not a local plan revision");
        }
        if (candidate.subjects.some((subject) => subject.kind === "requirement")) {
          return stepResult("not_permitted", candidate.kind, "the management layer never changes requirements; a requirement change is not a local plan revision");
        }
        // Task-plan changes only: the SAME goal, requirements and decisions are
        // re-asserted, and the task list is re-declared through the existing
        // ProjectIR validation. This layer never invents a task spec.
        const tasks: TaskSpec[] = current.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] }));
        controller.plan({
          goal: current.goal,
          requirements: current.requirements,
          decisions: current.decisions,
          tasks,
          reason: `management ${candidate.kind}: ${candidate.reason}`,
        });
        return stepResult("executed", candidate.kind, "applied a local task-plan revision; goal and requirements were unchanged");
      }

      case "START_LOCAL_RECIPE": {
        const recipes = deps.recipes;
        const execution = recipes?.execution;
        if (recipes === undefined || execution === undefined) {
          return stepResult("not_permitted", candidate.kind, "no local recipe registry/execution is configured");
        }
        const recipeSubject = candidate.subjects.find((subject) => subject.kind === "recipe");
        if (recipeSubject === undefined) {
          return stepResult("not_permitted", candidate.kind, "the recipe candidate names no recipe");
        }
        const definition = recipes.registry.get(recipeSubject.id);
        if (definition === undefined) {
          return stepResult("not_permitted", candidate.kind, `recipe "${recipeSubject.id}" is not registered`);
        }
        const parameters: Record<string, unknown> = {};
        if (definition.baseMode === "EXPLORE") parameters.question = candidate.reason;
        const existingSubjectRefs = candidate.subjects.filter((subject) => subject.kind === "peer").map((subject) => subject.id);
        try {
          const plan = materializeRecipePlan({
            baseRecipeRef: { recipeId: definition.recipeId, version: definition.version, digest: definition.digest },
            parameters,
            existingSubjectRefs,
            rationaleDigest: canonicalDigest({ domain: MANAGEMENT_RECIPE_RATIONALE_DOMAIN, actionId: candidate.actionId }),
          });
          const compiled = compileRecipePlan(plan, recipes.registry);
          const outcome = await execution.execute(compiled, {});
          return stepResult("executed", candidate.kind, `local recipe "${definition.recipeId}" outcome=${outcome.status}`);
        } catch (error) {
          return stepResult("not_permitted", candidate.kind, `the local recipe could not be compiled/executed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case "RUN_LOCAL_VERIFY": {
        const verify = deps.verify;
        if (verify === undefined) return stepResult("not_permitted", candidate.kind, "no local verification port is configured");
        await verify.run();
        return stepResult("executed", candidate.kind, "ran the configured local verification port");
      }

      default:
        return stepResult("not_permitted", candidate.kind, `${candidate.kind} has no governed execution binding in this layer`);
    }
  }

  async function step(input?: { readonly confirmed?: boolean | undefined }): Promise<ManagementStepResult> {
    const { profile, candidates } = await assess();
    const ordered = orderedCandidates(candidates);
    if (ordered.length === 0) {
      return stepResult("nothing_to_do", undefined, "no management action candidates are derivable from the current workspace view");
    }
    const project = readProject();
    const confirmed = input?.confirmed === true;

    let pending: { readonly candidate: ManagementActionCandidate; readonly evaluation: ManagementActionEvaluation } | undefined;
    let denied: { readonly candidate: ManagementActionCandidate; readonly evaluation: ManagementActionEvaluation } | undefined;

    for (const candidate of ordered) {
      const evaluation = evaluateCandidate(profile, candidate, project, confirmed);
      if (evaluation.permitted) {
        return executeCandidate(candidate, profile);
      }
      if (evaluation.requiredConfirmation && !confirmed) {
        pending ??= { candidate, evaluation };
        continue;
      }
      denied ??= { candidate, evaluation };
    }

    if (pending !== undefined) return stepResult("needs_confirmation", pending.candidate.kind, pending.evaluation.reason);
    if (denied !== undefined) return stepResult("not_permitted", denied.candidate.kind, denied.evaluation.reason);
    return stepResult("nothing_to_do", undefined, "no management action is available under the current profile");
  }

  async function runBounded(input?: { readonly maxSteps?: number | undefined }): Promise<ManagementBoundedRun> {
    const steps: ManagementStepResult[] = [];
    const requestedMax = input?.maxSteps;
    const startedAt = Date.parse(now());
    let previous: ManagementStepResult | undefined;
    let stoppedReason = "budget_exhausted";

    for (;;) {
      // Re-read the profile EVERY step: a downgrade stops the next proactive
      // action immediately, with no grace budget.
      const profile = await deps.control.get(controller.projectId);
      const maxSteps = requestedMax === undefined ? profile.budgets.maxStepsPerRun : Math.min(requestedMax, profile.budgets.maxStepsPerRun);
      if (steps.length >= maxSteps) {
        stoppedReason = "budget_exhausted";
        break;
      }
      const maxWallClockMs = profile.budgets.maxWallClockMs;
      if (maxWallClockMs !== undefined && Number.isFinite(startedAt) && Date.parse(now()) - startedAt >= maxWallClockMs) {
        stoppedReason = "wall_clock_budget_exhausted";
        break;
      }

      const result = await step();
      if (result.status !== "executed") {
        steps.push(result);
        stoppedReason = result.status;
        break;
      }
      if (previous !== undefined && previous.action === result.action && previous.detail === result.detail) {
        steps.push(result);
        stoppedReason = "no_progress";
        break;
      }
      steps.push(result);
      previous = result;
    }

    return Object.freeze({ steps: Object.freeze(steps), stoppedReason });
  }

  function requireInvolvement(value: unknown, what: string): ManagementInvolvement {
    if (typeof value !== "string" || !(MANAGEMENT_INVOLVEMENTS as readonly string[]).includes(value)) {
      managementFail("unknown_kind", `${what} must be one of ${MANAGEMENT_INVOLVEMENTS.join(", ")}`);
    }
    return value as ManagementInvolvement;
  }

  async function requestModeChange(input: { readonly to: ManagementInvolvement; readonly requestedBy: string }): Promise<{ readonly status: "requested"; readonly detail: string }> {
    const to = requireInvolvement(input.to, "to");
    const requestedBy = typeof input.requestedBy === "string" && input.requestedBy.length > 0 ? input.requestedBy : "unknown";
    // A REQUEST only. The agent-facing path can never apply an upward change.
    return Object.freeze({
      status: "requested" as const,
      detail: `management involvement change to ${to} was requested by ${requestedBy}; only the operator control port can apply it, and the agent-facing path never does`,
    });
  }

  /**
   * OPERATOR-ONLY. Wired to the CLI/host control port, never exposed as an LLM
   * tool: it delegates the persisted change to the injected control port.
   */
  async function applyOperatorModeChange(input: { readonly to: ManagementInvolvement; readonly updatedBy: string }): Promise<ManagementAutonomyProfile> {
    const to = requireInvolvement(input.to, "to");
    const updatedBy = typeof input.updatedBy === "string" && input.updatedBy.length > 0 ? input.updatedBy : "operator";
    return deps.control.set({ projectId: controller.projectId, involvement: to, updatedBy });
  }

  return Object.freeze({
    assess,
    recommend,
    previewStep,
    step,
    runBounded,
    requestModeChange,
    applyOperatorModeChange,
  });
}
