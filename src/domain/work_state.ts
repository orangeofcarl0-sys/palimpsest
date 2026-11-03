/**
 * PC1-V1 R2 — what can actually happen next.
 *
 * The normal product used to infer `action=next` from a READY task state alone. That advice ignored
 * the Scheduler's VERIFYING latch and produced calls that were guaranteed to make no progress. This
 * derivation reads the Scheduler's own pure decision and the current Work/authority state, and
 * distinguishes:
 *
 *     structurally READY  ≠  the Scheduler can activate it now
 *     a delivered result  ≠  an operator decision
 *     an open plan        ≠  a legal next transition
 *
 * It is pure: no store read, no clock, no write, no second planner.
 */
import type { ProjectHeadState } from "./project_head.js";

export interface ControllerStatusView {
  projectId: string;
  revision: number;
  headCommit: string;
  schedulerState: "RUNNING" | "PAUSED";
  generation: number;
  /** Task ids whose current-revision hold blocks activation. */
  holds: string[];
  /** PC1-V1 R2: the one truthful next-action explanation shared by agent and continuity surfaces. */
  nextAction: WorkNextAction;
  tasks: Array<{
    task_id: string;
    state: string;
    last_event_id: number;
    role?: string;
  }>;
  attempts: Array<{
    attempt_id: string;
    task_id: string | null;
    state: string;
    attempt_no: number | null;
    /** Derived: the attempt's task is retired, so this is not a live work position. */
    orphaned?: boolean;
    task_state?: string;
  }>;
  evidence: Array<{ evidence_id: string; status: string }>;
  promotions: Array<{ promotion_id: string; state: string }>;
  /**
   * G10-Z: pending promotion intents - the same read model the revision fence
   * refuses on, exposed so a UI can explain the refusal without provoking it.
   */
  promotionFence: Array<{
    promotion_id: string;
    attempt_id: string;
    task_id: string;
    state: string;
  }>;
  parallel: { admittedAttempts: number; rejectedClaims: number };
  /** PLMP-TLM-2 §1: human-facing model performance summary (absent when cold). */
  telemetry?: {
    rows: Array<{
      task_type: string;
      model: string;
      attempts: number;
      successes: number;
      successRate: string;
      avgCost: string;
      costPerSuccess: string;
    }>;
  };
  /** E3 resume block: where the project is, what the host must do next. */
  resume: {
    action:
      | "blocked"
      | "paused"
      | "progress"
      | "dispatch_worker"
      | "gate_and_promote"
      | "awaiting_worker"
      | "idle";
    detail: string;
    inFlightAttemptIds: string[];
    openTasks: Array<{ task_id: string; state: string }>;
    /** Promotions sitting PREPARED without a terminal event (H1 §3.1). */
    preparedPromotions: string[];
  };
  /**
   * G10-X additive: the canonical head picture. Derived from the ProjectIR
   * head plus the committed promotion facts only - never from `git.head()`.
   */
  head?: {
    projectHeadCommit: string;
    provenEffectHeadCommit: string;
    state: ProjectHeadState;
    /**
     * G10-X additive: the provenance of the promotion that produced the
     * canonical head (the chain tip when SYNC_REQUIRED, the absorbed tip when
     * IN_SYNC). `null` when no promotion is chained. Derived from the committed
     * promotion facts only.
     */
    latestPromotion:
      | {
          promotionId: string;
          attemptId: string;
          sourceCommit: string;
          fromHead: string;
          toHead: string;
          eventId: string;
        }
      | null;
  };
}

export type WorkNextActionKind =
  | "EXECUTE_SCHEDULER_STEP"
  | "WAIT_OPERATOR_ACCEPT"
  | "WAIT_OPERATOR_RECOVERY"
  | "WAIT_OPERATOR_HEAD_SYNC"
  | "WAIT_ACTIVE_WORK"
  | "WAIT_DEPENDENCIES"
  | "SCHEDULER_PAUSED"
  | "NEEDS_COMPLETION_STANDARD"
  | "NO_ACTION";

export interface WorkNextAction {
  readonly kind: WorkNextActionKind;
  /** True only when the named action is a transition the Scheduler/Work owner would actually accept. */
  readonly executable: boolean;
  /** The exact normal-tool action to call, or null when only a person/operator can progress. */
  readonly action: string | null;
  readonly detail: string;
  readonly taskId: string | null;
  readonly blockers: readonly string[];
}

export interface WorkNextActionInput {
  readonly standardConfirmed: boolean;
  readonly schedulerState: "RUNNING" | "PAUSED";
  readonly schedulerDecision: { readonly eventType: string; readonly entityId: string } | null;
  readonly schedulerError: string | null;
  readonly tasks: readonly { readonly taskId: string; readonly state: string }[];
  readonly attempts: readonly { readonly taskId: string | null; readonly state: string }[];
  readonly holds: readonly string[];
  readonly promotionFence: readonly { readonly taskId: string; readonly state: string }[];
  readonly headState: string;
}

function action(
  kind: WorkNextActionKind,
  executable: boolean,
  actionText: string | null,
  detail: string,
  taskId: string | null = null,
  blockers: readonly string[] = [],
): WorkNextAction {
  return Object.freeze({ kind, executable, action: actionText, detail, taskId, blockers: Object.freeze([...blockers]) });
}

export function explainWorkState(input: WorkNextActionInput): WorkNextAction {
  if (!input.standardConfirmed) {
    return action(
      "NEEDS_COMPLETION_STANDARD",
      false,
      null,
      "no confirmed completion standard exists, so no task can be derived as done; an operator must state and confirm one first",
    );
  }
  if (input.promotionFence.length > 0) {
    const first = input.promotionFence[0]!;
    return action(
      "WAIT_OPERATOR_RECOVERY",
      false,
      null,
      `promotion ${first.taskId} has an unresolved external effect; the canonical effect must be reconciled before ordinary work advances`,
      first.taskId,
      input.promotionFence.map((entry) => `promotion:${entry.taskId}:${entry.state}`),
    );
  }
  if (input.headState === "SYNC_REQUIRED") {
    return action(
      "WAIT_OPERATOR_HEAD_SYNC",
      false,
      null,
      "the proven promotion effect head is ahead of the canonical ProjectIR head; the product must reconcile the head before new READY work activates",
    );
  }
  if (input.schedulerState === "PAUSED") {
    return action("SCHEDULER_PAUSED", false, null, "the Scheduler is paused; no transition will be committed until an operator resumes it");
  }
  if (input.schedulerError !== null) {
    return action("WAIT_OPERATOR_RECOVERY", false, null, `the Scheduler cannot produce a decision: ${input.schedulerError}`);
  }
  if (input.schedulerDecision !== null) {
    return action(
      "EXECUTE_SCHEDULER_STEP",
      true,
      "palimpsest_work action=next",
      `the Scheduler's next decision is ${input.schedulerDecision.eventType}; calling next commits exactly that transition`,
      input.schedulerDecision.entityId,
    );
  }

  const verifying = input.tasks.filter((task) => task.state === "VERIFYING");
  if (verifying.length > 0) {
    return action(
      "WAIT_OPERATOR_ACCEPT",
      false,
      null,
      `the Scheduler's VERIFYING latch is held by ${verifying.map((task) => task.taskId).join(", ")}; action=next will make no progress until an operator accepts or reworks that result. Investigation and proposals may still proceed outside the formal plan`,
      verifying[0]!.taskId,
      verifying.map((task) => `task:${task.taskId}:VERIFYING`),
    );
  }

  const running = input.attempts.filter((attempt) => attempt.state === "RUNNING");
  if (running.length > 0) {
    return action(
      "WAIT_ACTIVE_WORK",
      true,
      "palimpsest_work action=complete",
      "an attempt is RUNNING; completion is the only formal transition available until it settles",
      running[0]!.taskId,
    );
  }

  const ready = input.tasks.filter((task) => task.state === "READY");
  if (ready.length > 0) {
    const held = ready.filter((task) => input.holds.includes(task.taskId));
    if (held.length > 0) {
      return action(
        "WAIT_ACTIVE_WORK",
        false,
        null,
        `READY task(s) ${held.map((task) => task.taskId).join(", ")} are on an explicit hold; next will not activate a held task`,
        held[0]!.taskId,
        held.map((task) => `task:${task.taskId}:HELD`),
      );
    }
    return action(
      "WAIT_ACTIVE_WORK",
      false,
      null,
      `READY task(s) ${ready.map((task) => task.taskId).join(", ")} are structurally runnable, but the Scheduler produced no activation decision (latch capacity, role slots, or another declared guard). action=next would be a futile call; inspect the declared state before changing anything`,
      ready[0]!.taskId,
    );
  }

  const blocked = input.tasks.filter((task) => task.state === "BLOCKED");
  if (blocked.length > 0) {
    return action(
      "WAIT_DEPENDENCIES",
      false,
      null,
      `task(s) ${blocked.map((task) => task.taskId).join(", ")} are BLOCKED by unmet dependencies; no transition is available until a dependency is satisfied`,
      blocked[0]!.taskId,
      blocked.map((task) => `task:${task.taskId}:BLOCKED`),
    );
  }

  const active = input.tasks.filter((task) => task.state === "ACTIVE");
  if (active.length > 0) {
    return action(
      "WAIT_ACTIVE_WORK",
      false,
      null,
      `task(s) ${active.map((task) => task.taskId).join(", ")} are ACTIVE but no RUNNING attempt was observed; start or inspect that Work position`,
      active[0]!.taskId,
    );
  }

  return action("NO_ACTION", false, null, "every declared task is terminal; there is no legal formal transition left");
}

/**
 * The controller's status rows use snake_case ids; mapping them here keeps the controller thin and
 * keeps ONE explanation function shared by the normal tool and continuity.
 */
export function explainStatusWorkState(input: {
  readonly standardConfirmed: boolean;
  readonly schedulerState: "RUNNING" | "PAUSED";
  readonly schedulerDecision: { readonly eventType: string; readonly entityId: string } | null;
  readonly schedulerError: string | null;
  readonly tasks: readonly { readonly task_id: string; readonly state: string }[];
  readonly attempts: readonly { readonly task_id: string | null; readonly state: string }[];
  readonly holds: readonly string[];
  readonly promotionFence: readonly { readonly task_id: string; readonly state: string }[];
  readonly headState: string;
}): WorkNextAction {
  const terminalTaskIds = new Set(
    input.tasks
      .filter((task) => ["STALE", "FAILED", "SATISFIED"].includes(task.state))
      .map((task) => task.task_id),
  );
  const liveAttempts = input.attempts.filter(
    (attempt) => attempt.task_id === null || !terminalTaskIds.has(attempt.task_id),
  );
  return explainWorkState({
    standardConfirmed: input.standardConfirmed,
    schedulerState: input.schedulerState,
    schedulerDecision: input.schedulerDecision,
    schedulerError: input.schedulerError,
    tasks: input.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
    attempts: liveAttempts.map((attempt) => ({ taskId: attempt.task_id, state: attempt.state })),
    holds: input.holds,
    promotionFence: input.promotionFence.map((entry) => ({ taskId: entry.task_id, state: entry.state })),
    headState: input.headState,
  });
}
