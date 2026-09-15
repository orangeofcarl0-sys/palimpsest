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
import { decodeJsonBlob, type ProjectController, type ProjectHeadReconciliationResult } from "../tools/controller.js";
import { materializeRecipePlan } from "../recipes/artifacts.js";
import { compileRecipePlan } from "../recipes/compiler.js";
import type { RecipeExecutionService } from "../recipes/execution.js";
import type { RecipeRegistry } from "../recipes/registry.js";
import type { ProjectWorkspaceService } from "../project_workspace/service.js";
import type { SqliteManagementActivityStore } from "../project_operating/activity_store.js";
import type { CanonicalOutcomeRef } from "../project_operating/activity.js";
import type {
  UserWorkModeControlPort,
  WorkModeBaseMode,
  WorkModeCapabilityInputs,
  WorkModeModifier,
} from "../project_operating/work_mode_profile.js";
import { buildProjectOperatingPostureView, type ProjectOperatingPostureView } from "../project_operating/posture.js";
import type { ManagementActivityRecord } from "../project_operating/activity.js";
import {
  orderCandidatesByWorkModePreference,
  type WorkModeOrderableCandidate,
  type WorkModePreferenceExplanation,
} from "../project_operating/preference.js";
import { buildProjectOperatingHistory, type ProjectOperatingHistory } from "../project_operating/history.js";
import type { RecipeDefinition } from "../recipes/index.js";

import {
  CAPABILITY_OBSERVE,
  CAPABILITY_PREPARE,
  CAPABILITY_PLAN,
  CAPABILITY_RECIPE_EXECUTION,
  CAPABILITY_RECOMMEND,
  CAPABILITY_RECONCILE_HEAD,
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
  type ManagementPreferenceHistoryEntry,
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
  /**
   * G10-AB: the append-only management activity store. Absent ⇒ no activity is
   * recorded (the store is a product/audit surface, never authority).
   */
  readonly activity?: SqliteManagementActivityStore | undefined;
  /** G10-AB: the operator's Work Mode preference, read as context only. */
  readonly workMode?: UserWorkModeControlPort | undefined;
  /** G10-AB: the ProjectIR basis an activity was decided against (read-only). */
  readonly projectBasis?: (() => { readonly revision: number; readonly digest: string; readonly headCommit: string }) | undefined;
  /**
   * G10-AB §7/§30: which capabilities actually exist. Only what is DECLARED here
   * is reported as available - an unavailable capability is never presented as
   * active, and `verify` being wired is not the same as an INDEPENDENT verifier
   * (same-model same-context verification does not count).
   */
  readonly operatingCapabilities?: Partial<WorkModeCapabilityInputs> | undefined;
  /** The recipe registry used to report readiness (falls back to `recipes`). */
  readonly registry?: { get(recipeId: string): RecipeDefinition | undefined } | undefined;
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

/**
 * G10-AB §25: additively typed. `action`/`detail` are retained for compatibility
 * (existing callers and the HTTP/agent surfaces read them), but a decision is now
 * also machine-readable: which candidate ran, under which action class, with a
 * stable reason code and REFERENCES to the canonical outcomes it produced.
 */
export interface ManagementStepResult {
  readonly status: ManagementStepStatus;
  readonly action?: string | undefined;
  readonly detail: string;
  readonly candidateId?: string | undefined;
  readonly actionClass?: string | undefined;
  readonly typedReasonCode?: string | undefined;
  readonly canonicalOutcomeRefs?: readonly CanonicalOutcomeRef[] | undefined;
  readonly activityRecordId?: string | undefined;
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
  /**
   * G10-X: the mechanical project-head reconciliation. It calls the
   * controller's canonical `reconcileProjectHead()` (which advances the
   * ProjectIR head onto the proven effect head through the ordinary revision
   * batch) and can NEVER promote an attempt or grant promotion authority.
   */
  reconcileProjectHead(): Promise<ProjectHeadReconciliationResult>;
  /**
   * G10-AB: the derived operating posture (Work Mode preference + effective
   * capability status, and the management axis). Read-only; owns no truth.
   */
  posture(): Promise<ProjectOperatingPostureView>;
  /** G10-AB: the append-only management activity history, oldest first. */
  activity(limit?: number): Promise<readonly ManagementActivityRecord[]>;
  /** G10-AB: activity that still needs a terminal. */
  unresolvedActivity(): Promise<readonly ManagementActivityRecord[]>;
  /** G10-AB: the derived operating history (references only). */
  operatingHistory(): Promise<ProjectOperatingHistory>;
  /**
   * OPERATOR-ONLY Work Mode preference change. Never exposed as an LLM tool, and
   * never applied by the agent-facing path - an agent may only REQUEST one.
   */
  setWorkModePreference(input: {
    readonly baseMode: WorkModeBaseMode;
    readonly modifiers: readonly WorkModeModifier[];
    readonly updatedBy: string;
  }): Promise<ProjectOperatingPostureView["workMode"]["preferred"]>;
  /** Agent-facing: a REQUEST only; it never persists the user-level default. */
  requestWorkModeChange(input: {
    readonly baseMode: WorkModeBaseMode;
    readonly modifiers: readonly WorkModeModifier[];
    readonly requestedBy: string;
  }): Promise<{ readonly status: "requested"; readonly detail: string }>;
}

/* ------------------------------------------------------------------ *
 * Action-class execution priority (mechanical first, authority-shaped last)
 * ------------------------------------------------------------------ */

const EXECUTION_PRIORITY: readonly ManagementActionClass[] = Object.freeze([
  "ADVANCE_MECHANICAL_WORK",
  "START_LOCAL_RECIPE",
  "RUN_LOCAL_VERIFY",
  "RECONCILE_PROJECT_HEAD",
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
      case CAPABILITY_RECONCILE_HEAD:
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

  /**
   * The Work Mode a candidate expresses, when it names a recipe. This is what
   * the user's preference can order - it is NOT eligibility: the preference
   * never makes an ineligible candidate eligible.
   */
  function baseModeOf(candidate: ManagementActionCandidate): string | undefined {
    const recipeSubject = candidate.subjects.find((subject) => subject.kind === "recipe");
    if (recipeSubject === undefined) return undefined;
    return registryOf().get(recipeSubject.id)?.baseMode;
  }

  /**
   * G10-AB §26: hard eligibility → need → USER PREFERENCE → empirical evidence.
   * The caller has already filtered eligibility, so this is a stable partition
   * honouring the preference, plus an explanation that NAMES the preference -
   * including when eligibility blocked it.
   */
  async function workModePreferredOrder(
    candidates: readonly ManagementActionCandidate[],
  ): Promise<{
    readonly ordered: readonly ManagementActionCandidate[];
    readonly explanation: WorkModePreferenceExplanation | null;
    readonly preferenceRef: string | null;
  }> {
    if (deps.workMode === undefined) {
      return { ordered: Object.freeze([...candidates]), explanation: null, preferenceRef: null };
    }
    let preference: Awaited<ReturnType<UserWorkModeControlPort["get"]>>;
    try {
      preference = await deps.workMode.get(controller.projectId);
    } catch {
      return { ordered: Object.freeze([...candidates]), explanation: null, preferenceRef: null };
    }
    const orderable: readonly (ManagementActionCandidate & WorkModeOrderableCandidate)[] =
      candidates.map((candidate) =>
        Object.freeze({ ...candidate, baseMode: baseModeOf(candidate) }),
      );
    const { ordered, explanation } = orderCandidatesByWorkModePreference(orderable, preference);
    return {
      ordered: Object.freeze(ordered),
      explanation,
      preferenceRef: preference.preference.digest,
    };
  }

  function orderedCandidates(candidates: readonly ManagementActionCandidate[]): readonly ManagementActionCandidate[] {
    const order = new Map<string, number>(EXECUTION_PRIORITY.map((kind, index) => [kind, index]));
    return [...candidates].sort((a, b) => {
      const delta = (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0);
      if (delta !== 0) return delta;
      return a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0;
    });
  }

  function stepResult(
    status: ManagementStepStatus,
    action: string | undefined,
    detail: string,
    extra: {
      readonly candidateId?: string | undefined;
      readonly typedReasonCode?: string | undefined;
      readonly canonicalOutcomeRefs?: readonly CanonicalOutcomeRef[] | undefined;
      readonly activityRecordId?: string | undefined;
    } = {},
  ): ManagementStepResult {
    return Object.freeze({
      status,
      ...(action === undefined ? {} : { action }),
      detail,
      ...(extra.candidateId === undefined ? {} : { candidateId: extra.candidateId }),
      ...(action === undefined ? {} : { actionClass: action }),
      ...(extra.typedReasonCode === undefined ? {} : { typedReasonCode: extra.typedReasonCode }),
      ...(extra.canonicalOutcomeRefs === undefined
        ? {}
        : { canonicalOutcomeRefs: Object.freeze(extra.canonicalOutcomeRefs) }),
      ...(extra.activityRecordId === undefined ? {} : { activityRecordId: extra.activityRecordId }),
    });
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
    // Preview the SAME order `step()` uses: execution priority, then the Work
    // Mode preference partition on top.
    const { ordered, explanation } = await workModePreferredOrder(orderedCandidates(candidates));
    const preferenceNote = explanation === null ? null : explanation.detail;
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
        return Object.freeze({
          candidate,
          permitted: true,
          requiredConfirmation: evaluation.requiredConfirmation,
          reason: preferenceNote === null ? evaluation.reason : `${evaluation.reason}; ${preferenceNote}`,
        });
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
        return stepResult("executed", candidate.kind, `observed without mutation: ${candidate.reason}`, {
          typedReasonCode: "observed_no_mutation",
          canonicalOutcomeRefs: [],
        });
      case "RECOMMEND":
        return stepResult("executed", candidate.kind, `recommendation published without mutation: ${candidate.reason}`, {
          typedReasonCode: "recommendation_no_mutation",
          canonicalOutcomeRefs: [],
        });
      case "PREPARE":
        return stepResult("executed", candidate.kind, `prepared without mutation; promotion stays explicit: ${candidate.reason}`, {
          typedReasonCode: "prepared_no_mutation",
          canonicalOutcomeRefs: [],
        });

      case "ADVANCE_MECHANICAL_WORK": {
        const turn = await controller.runTurn({ maxSteps: profile.budgets.maxStepsPerRun });
        // The mechanical turn is a composite of scheduler steps, so it names no
        // single canonical event: the summary is TYPED (phase + counts) and no
        // ref is invented (§24).
        return stepResult(
          "executed",
          candidate.kind,
          `controller.runTurn phase=${turn.phase} attemptsRun=${turn.mechanical.attemptsRun}`,
          { typedReasonCode: "mechanical_turn", canonicalOutcomeRefs: [] },
        );
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
        const revisionEvent = controller.plan({
          goal: current.goal,
          requirements: current.requirements,
          decisions: current.decisions,
          tasks,
          reason: `management ${candidate.kind}: ${candidate.reason}`,
        });
        const revisionNumber = Number(
          (revisionEvent.payload.project_ir as { revision: number }).revision,
        );
        return stepResult(
          "executed",
          candidate.kind,
          "applied a local task-plan revision; goal and requirements were unchanged",
          {
            typedReasonCode: "plan_revision_applied",
            // REFERENCES into the canonical owner - the Work EventStore keeps the
            // revision body; this record only points at it.
            canonicalOutcomeRefs: [
              { kind: "work_event", ref: String(revisionEvent.event_id) },
              { kind: "project_revision", ref: String(revisionNumber) },
            ],
          },
        );
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
          const refs: CanonicalOutcomeRef[] =
            outcome.status === "explored"
              ? [{ kind: "reasoning_cell", ref: outcome.cellId }]
              : [];
          return stepResult(
            "executed",
            candidate.kind,
            `local recipe "${definition.recipeId}" outcome=${outcome.status}`,
            { typedReasonCode: `recipe_${outcome.status}`, canonicalOutcomeRefs: refs },
          );
        } catch (error) {
          return stepResult("not_permitted", candidate.kind, `the local recipe could not be compiled/executed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case "RUN_LOCAL_VERIFY": {
        const verify = deps.verify;
        if (verify === undefined) return stepResult("not_permitted", candidate.kind, "no local verification port is configured");
        await verify.run();
        // The verify port returns no canonical ref today, so none is invented.
        return stepResult("executed", candidate.kind, "ran the configured local verification port", {
          typedReasonCode: "verify_port_ran",
          canonicalOutcomeRefs: [],
        });
      }

      case "RECONCILE_PROJECT_HEAD": {
        // G10-X: the MECHANICAL CONSISTENCY step. It calls the controller's
        // canonical reconciliation (never a raw plan, never a caller head) - the
        // ProjectIR head is advanced onto the proven effect head and the retained
        // tasks are re-authorized onto it. It does NOT promote anything.
        const outcome = await controller.reconcileProjectHead();
        if (outcome.status === "blocked") {
          return stepResult(
            "nothing_to_do",
            candidate.kind,
            `the project head cannot advance yet: ${outcome.blockers.join("; ")}`,
            { typedReasonCode: "head_reconciliation_blocked", canonicalOutcomeRefs: [] },
          );
        }
        return stepResult(
          "executed",
          candidate.kind,
          `project head ${outcome.status}: ${outcome.fromHead} -> ${outcome.toHead}${
            outcome.revision === undefined ? "" : ` at revision ${outcome.revision}`
          }`,
          {
            typedReasonCode: "head_reconciled",
            canonicalOutcomeRefs:
              outcome.revision === undefined
                ? []
                : [{ kind: "head_reconciliation", ref: String(outcome.revision) }],
          },
        );
      }

      default:
        return stepResult("not_permitted", candidate.kind, `${candidate.kind} has no governed execution binding in this layer`);
    }
  }

  /* ------------------------------------------------------------------ *
   * G10-AB: durable management activity
   *
   * CRASH-HONEST two-phase recording: a SELECTED record is appended BEFORE the
   * governed action runs, and a terminal record AFTER its outcome is observed.
   * A crash in between leaves the SELECTED record unresolved - history never
   * claims a success that was not observed.
   * ------------------------------------------------------------------ */

  function projectBasisOf(): { revision: number; digest: string; headCommit: string } {
    if (deps.projectBasis !== undefined) return deps.projectBasis();
    const project = readProject();
    return { revision: project.revision, digest: project.digest, headCommit: project.head_commit };
  }

  function candidateDigestOf(candidate: ManagementActionCandidate): string {
    return canonicalDigest({
      domain: "palimpsest.management-candidate.v1",
      actionId: candidate.actionId,
      kind: candidate.kind,
      subjects: candidate.subjects,
      riskClass: candidate.riskClass,
      capability: candidate.capability,
    });
  }

  /** The Work Mode preference identity in force, read as CONTEXT only. */
  async function workModeRef(): Promise<string | null> {
    if (deps.workMode === undefined) return null;
    try {
      return (await deps.workMode.get(controller.projectId)).preference.digest;
    } catch {
      return null;
    }
  }

  interface ActivityTracing {
    readonly startedRecordId: string | null;
  }

  async function recordSelected(
    candidate: ManagementActionCandidate,
    profile: ManagementAutonomyProfile,
    decision: "selected" | "needs_confirmation",
    reason: string,
  ): Promise<ActivityTracing> {
    const store = deps.activity;
    if (store === undefined) return { startedRecordId: null };
    const record = store.append({
      projectId: controller.projectId,
      candidateRef: candidate.actionId,
      candidateDigest: candidateDigestOf(candidate),
      actionClass: candidate.kind,
      subjects: candidate.subjects,
      managementProfileRef: `management-profile:${profile.projectId}:${profile.involvement}`,
      workModePreferenceRef: await workModeRef(),
      projectBasis: projectBasisOf(),
      decision,
      confirmed: false,
      reason,
      typedReasonCode: decision === "needs_confirmation" ? "awaiting_confirmation" : "selected",
      startedAt: now(),
    });
    return { startedRecordId: record.recordId };
  }

  async function recordTerminal(
    candidate: ManagementActionCandidate,
    profile: ManagementAutonomyProfile,
    tracing: ActivityTracing,
    result: ManagementStepResult,
    decision: "executed" | "failed" | "not_permitted",
  ): Promise<ManagementStepResult> {
    const store = deps.activity;
    if (store === undefined || tracing.startedRecordId === null) return result;
    const record = store.append({
      projectId: controller.projectId,
      candidateRef: candidate.actionId,
      candidateDigest: candidateDigestOf(candidate),
      actionClass: candidate.kind,
      subjects: candidate.subjects,
      managementProfileRef: `management-profile:${profile.projectId}:${profile.involvement}`,
      workModePreferenceRef: await workModeRef(),
      projectBasis: projectBasisOf(),
      decision,
      confirmed: decision === "executed",
      reason: result.detail,
      typedReasonCode: result.typedReasonCode ?? null,
      startedAt: now(),
      finishedAt: now(),
      canonicalOutcomeRefs: result.canonicalOutcomeRefs ?? [],
      noncanonicalOutcomeSummary:
        (result.canonicalOutcomeRefs ?? []).length === 0 ? result.detail : null,
      supersedesRecordId: tracing.startedRecordId,
    });
    return stepResult(result.status, result.action, result.detail, {
      candidateId: candidate.actionId,
      typedReasonCode: result.typedReasonCode,
      canonicalOutcomeRefs: result.canonicalOutcomeRefs,
      activityRecordId: record.recordId,
    });
  }

  /** A refusal or a pending confirmation is durable product history too. */
  async function recordDecisionWithoutExecution(
    candidate: ManagementActionCandidate,
    profile: ManagementAutonomyProfile,
    decision: "needs_confirmation" | "not_permitted",
    reason: string,
  ): Promise<ManagementStepResult> {
    const store = deps.activity;
    const status = decision === "needs_confirmation" ? "needs_confirmation" : "not_permitted";
    if (store === undefined) {
      return stepResult(status, candidate.kind, reason, {
        candidateId: candidate.actionId,
        typedReasonCode: decision,
        canonicalOutcomeRefs: [],
      });
    }
    const record = store.append({
      projectId: controller.projectId,
      candidateRef: candidate.actionId,
      candidateDigest: candidateDigestOf(candidate),
      actionClass: candidate.kind,
      subjects: candidate.subjects,
      managementProfileRef: `management-profile:${profile.projectId}:${profile.involvement}`,
      workModePreferenceRef: await workModeRef(),
      projectBasis: projectBasisOf(),
      decision,
      confirmed: false,
      reason,
      typedReasonCode: decision,
      startedAt: now(),
      finishedAt: now(),
      canonicalOutcomeRefs: [],
      noncanonicalOutcomeSummary: null,
      supersedesRecordId: null,
    });
    return stepResult(status, candidate.kind, reason, {
      candidateId: candidate.actionId,
      typedReasonCode: decision,
      canonicalOutcomeRefs: [],
      activityRecordId: record.recordId,
    });
  }

  /* ------------------------------------------------------------------ *
   * G10-AB: operating posture, activity and history (all DERIVED reads)
   * ------------------------------------------------------------------ */

  function registryOf(): { get(recipeId: string): RecipeDefinition | undefined } {
    if (deps.registry !== undefined) return deps.registry;
    const registry = deps.recipes?.registry;
    if (registry !== undefined) return registry;
    // No registry configured: report nothing as available rather than guessing.
    return { get: () => undefined };
  }

  /**
   * The inputs an EFFECTIVE status is derived from. Only what is declared counts:
   * reasoning branches follow the configured execution port, an independent
   * verifier and a Monitor condition source must be declared, and a genuine
   * independent peer must be declared - a preference is never upgraded into an
   * availability claim.
   */
  function operatingCapabilitiesOf(): WorkModeCapabilityInputs {
    const declared = deps.operatingCapabilities ?? {};
    return {
      reasoningBranches: declared.reasoningBranches ?? deps.recipes?.execution !== undefined,
      independentVerifier: declared.independentVerifier ?? false,
      monitorConditionSource: declared.monitorConditionSource ?? false,
      independentPeer: declared.independentPeer ?? false,
    };
  }

  async function posture(): Promise<ProjectOperatingPostureView> {
    const profile = await deps.control.get(controller.projectId);
    const history = (await deps.control.history?.(controller.projectId)) ?? [];
    const preference =
      deps.workMode === undefined
        ? {
            preference: {
              schemaVersion: 1 as const,
              projectId: controller.projectId,
              baseMode: "FOCUS" as const,
              modifiers: Object.freeze([]) as readonly WorkModeModifier[],
              updatedAt: "1970-01-01T00:00:00.000Z",
              updatedBy: "operator:unset",
              digest: canonicalDigest({
                domain: "palimpsest.project-work-mode-preference.v1",
                projectId: controller.projectId,
                baseMode: "FOCUS",
                modifiers: [],
                updatedAt: "1970-01-01T00:00:00.000Z",
                updatedBy: "operator:unset",
              }),
            },
            source: "safe_default" as const,
            degradedReason: "no Work Mode preference port is configured for this installation",
          }
        : await deps.workMode.get(controller.projectId);
    const workModeHistory =
      deps.workMode === undefined ? [] : await deps.workMode.history(controller.projectId);
    return buildProjectOperatingPostureView({
      projectId: controller.projectId,
      preference,
      registry: registryOf(),
      capabilities: operatingCapabilitiesOf(),
      profile,
      workModeHistory,
      managementHistory: history,
    });
  }

  async function activity(limit?: number): Promise<readonly ManagementActivityRecord[]> {
    const store = deps.activity;
    if (store === undefined) return Object.freeze([]);
    const all = store.list(controller.projectId);
    if (limit === undefined) return all;
    // Newest-first slice, returned oldest-first for chronological rendering.
    return Object.freeze(all.slice(Math.max(0, all.length - Math.max(0, limit))));
  }

  async function unresolvedActivity(): Promise<readonly ManagementActivityRecord[]> {
    const store = deps.activity;
    if (store === undefined) return Object.freeze([]);
    return store.unresolved(controller.projectId);
  }

  async function managementHistory(): Promise<readonly ManagementPreferenceHistoryEntry[]> {
    return (await deps.control.history?.(controller.projectId)) ?? [];
  }

  async function operatingHistory(): Promise<ProjectOperatingHistory> {
    const all = await activity();
    // Canonical refs are only marked resolvable when the OWNING plane can be
    // read for them; nothing is assumed.
    const resolvable: string[] = [];
    for (const record of all) {
      for (const ref of record.canonicalOutcomeRefs) {
        if (ref.kind === "project_revision" || ref.kind === "head_reconciliation") {
          const project = readProject();
          if (project.revision >= Number(ref.ref)) resolvable.push(`${ref.kind}:${ref.ref}`);
        } else if (ref.kind === "work_event") {
          const row = controller.store.connection
            .prepare("SELECT event_id FROM events WHERE project_id=? AND event_id=?")
            .get(controller.projectId, Number(ref.ref));
          if (row !== undefined) resolvable.push(`work_event:${ref.ref}`);
        }
      }
    }
    const unresolved = await unresolvedActivity();
    return buildProjectOperatingHistory({
      projectId: controller.projectId,
      workModeHistory: deps.workMode === undefined ? [] : await deps.workMode.history(controller.projectId),
      managementHistory: await managementHistory(),
      activity: all,
      unresolvedRecordIds: unresolved.map((record) => record.recordId),
      resolvableCanonicalRefs: resolvable,
    });
  }

  async function recordOperatorAct(
    actionClass: string,
    reason: string,
    typedReasonCode: string,
  ): Promise<string | null> {
    const store = deps.activity;
    if (store === undefined) return null;
    const profile = await deps.control.get(controller.projectId);
    const record = store.append({
      projectId: controller.projectId,
      candidateRef: actionClass,
      candidateDigest: canonicalDigest({
        domain: "palimpsest.management-candidate.v1",
        actionClass,
        reason,
      }),
      actionClass,
      subjects: [],
      managementProfileRef: `management-profile:${profile.projectId}:${profile.involvement}`,
      workModePreferenceRef: await workModeRef(),
      projectBasis: projectBasisOf(),
      decision: "executed",
      confirmed: true,
      reason,
      typedReasonCode,
      startedAt: now(),
      finishedAt: now(),
      canonicalOutcomeRefs: [],
      noncanonicalOutcomeSummary: reason,
      supersedesRecordId: null,
    });
    return record.recordId;
  }

  async function setWorkModePreference(input: {
    readonly baseMode: WorkModeBaseMode;
    readonly modifiers: readonly WorkModeModifier[];
    readonly updatedBy: string;
  }): Promise<ProjectOperatingPostureView["workMode"]["preferred"]> {
    if (deps.workMode === undefined) {
      managementFail(
        "invalid_value",
        "no Work Mode preference port is configured; the durable project default cannot be changed",
      );
    }
    const updated = await deps.workMode.set({
      projectId: controller.projectId,
      baseMode: input.baseMode,
      modifiers: input.modifiers,
      updatedBy: input.updatedBy,
    });
    // The AUTHORITATIVE value lives only in the preference store; this is an
    // activity entry that records the operator act, not a second truth.
    await recordOperatorAct(
      "OPERATOR_WORK_MODE_CHANGE",
      `Work Mode set to ${updated.baseMode}${
        updated.modifiers.length === 0 ? "" : ` + ${updated.modifiers.join(" + ")}`
      } by ${updated.updatedBy}`,
      "operator_work_mode_change",
    );
    return Object.freeze({
      baseMode: updated.baseMode,
      modifiers: Object.freeze([...updated.modifiers]),
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
      digest: updated.digest,
      source: "stored" as const,
    });
  }

  async function requestWorkModeChange(input: {
    readonly baseMode: WorkModeBaseMode;
    readonly modifiers: readonly WorkModeModifier[];
    readonly requestedBy: string;
  }): Promise<{ readonly status: "requested"; readonly detail: string }> {
    // A REQUEST only. An agent recommendation is never an operator preference
    // change, and this path never persists the user-level project default.
    return Object.freeze({
      status: "requested" as const,
      detail:
        `a Work Mode change to ${input.baseMode}` +
        `${input.modifiers.length === 0 ? "" : ` + ${input.modifiers.join(" + ")}`}` +
        ` was requested by ${input.requestedBy}; only the operator control port can apply it, and the agent-facing path never does`,
    });
  }

  async function step(input?: { readonly confirmed?: boolean | undefined }): Promise<ManagementStepResult> {
    const { profile, candidates } = await assess();
    // The EXECUTION PRIORITY order is preserved exactly as before; the Work Mode
    // preference is a STABLE partition ON TOP of it and can never make an
    // ineligible candidate eligible.
    const { ordered, explanation } = await workModePreferredOrder(orderedCandidates(candidates));
    // The preference is part of the EXPLANATION of a choice, never a score and
    // never an authority: it is reported alongside the outcome.
    const preferenceNote = explanation === null ? null : explanation.detail;
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
        // SELECTED first, so a crash during the governed action leaves an
        // unresolved record rather than a silent gap.
        const tracing = await recordSelected(candidate, profile, "selected", evaluation.reason);
        let result: ManagementStepResult;
        try {
          result = await executeCandidate(candidate, profile);
        } catch (error) {
          // The governed action threw: record the failure honestly and rethrow so
          // the caller sees it. History never claims success.
          await recordTerminal(
            candidate,
            profile,
            tracing,
            stepResult(
              "not_permitted",
              candidate.kind,
              `the governed action threw: ${error instanceof Error ? error.message : String(error)}`,
              { typedReasonCode: "action_threw", canonicalOutcomeRefs: [] },
            ),
            "failed",
          );
          throw error;
        }
        return recordTerminal(
          candidate,
          profile,
          tracing,
          preferenceNote === null
            ? result
            : stepResult(result.status, result.action, `${result.detail}; ${preferenceNote}`, {
                candidateId: result.candidateId,
                typedReasonCode: result.typedReasonCode,
                canonicalOutcomeRefs: result.canonicalOutcomeRefs,
              }),
          result.status === "executed" ? "executed" : "not_permitted",
        );
      }
      if (evaluation.requiredConfirmation && !confirmed) {
        pending ??= { candidate, evaluation };
        continue;
      }
      denied ??= { candidate, evaluation };
    }

    // What was Palimpsest waiting for, and what did it refuse? Both are durable
    // product history - a refusal is never hidden because another candidate was
    // permitted.
    if (pending !== undefined) {
      return recordDecisionWithoutExecution(
        pending.candidate,
        profile,
        "needs_confirmation",
        preferenceNote === null
          ? pending.evaluation.reason
          : `${pending.evaluation.reason}; ${preferenceNote}`,
      );
    }
    if (denied !== undefined) {
      return recordDecisionWithoutExecution(
        denied.candidate,
        profile,
        "not_permitted",
        preferenceNote === null
          ? denied.evaluation.reason
          : `${denied.evaluation.reason}; ${preferenceNote}`,
      );
    }
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
    const before = await deps.control.get(controller.projectId);
    const after = await deps.control.set({ projectId: controller.projectId, involvement: to, updatedBy });
    // The AUTHORITATIVE involvement value and its own append-only mode history
    // stay with the preference store; this records the operator ACT so the
    // activity log can answer "what happened in this project" completely.
    await recordOperatorAct(
      "OPERATOR_MANAGEMENT_MODE_CHANGE",
      `Management involvement ${before.involvement} → ${after.involvement} by ${updatedBy}`,
      "operator_management_mode_change",
    );
    return after;
  }

  /**
   * G10-X: the mechanical project-head reconciliation exposed as an explicit,
   * bounded operation (the HTTP `POST /api/project/reconcile_head` path and the
   * `palimpsest_manage` action both land here). It delegates to the controller's
   * canonical derivation - no head, source commit or plan is ever supplied by
   * the caller, and it cannot promote.
   */
  async function reconcileProjectHead(): Promise<ProjectHeadReconciliationResult> {
    return controller.reconcileProjectHead();
  }

  return Object.freeze({
    assess,
    recommend,
    previewStep,
    step,
    runBounded,
    requestModeChange,
    applyOperatorModeChange,
    reconcileProjectHead,
    posture,
    activity,
    unresolvedActivity,
    operatingHistory,
    setWorkModePreference,
    requestWorkModeChange,
  });
}
