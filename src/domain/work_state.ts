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
    /** PNWF-A: the world/liveness facts that decide whether `complete` can actually succeed. */
    execution?: WorkAttemptExecution;
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
   * PNWF-B/C: the physical repository head and how it relates to the canonical ProjectIR head.
   * Derived from one read-only Git observation; it never advances the canonical head.
   */
  directOutcome?: WorkDirectOutcome;
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
  | "NO_SETTLEABLE_DELTA"
  | "NO_FORMAL_WORK"
  | "DIRECT_HEAD_AHEAD"
  | "NO_ACTION";

/**
 * PNWF-A: the execution facts that turn a lifecycle state into a truth about what can succeed now.
 *
 * `explainWorkState` used to see only task/attempt states, so any RUNNING attempt looked like a
 * settleable position. A real zero-delta attempt (the work committed before the project existed)
 * then received `complete` as an EXECUTABLE next action, which the settlement owner must refuse with
 * `NO_WORK`. The facts are supplied by the controller (the owner of the world/attempt read); the
 * domain stays pure.
 */
export type WorkAttemptLiveness = "ACTIVE" | "EXITED" | "UNKNOWN" | "UNOBSERVED";

export interface WorkAttemptExecution {
  readonly attemptId: string;
  readonly baseCommit: string;
  readonly worldHead: string | null;
  readonly uncommittedChanges: readonly string[];
  readonly liveness: WorkAttemptLiveness;
}

/** PNWF-B/C: what the physical repository holds relative to the canonical project head. */
export interface WorkDirectOutcome {
  readonly repositoryHead: string | null;
  readonly projectHead: string;
  readonly relation: "IN_SYNC" | "DIRECT_AHEAD" | "DIVERGED" | "UNOBSERVABLE";
  readonly uncommittedPaths: readonly string[];
  /** The current head has a committed operator basis-admission receipt; equality alone proves none. */
  readonly admittedDirectCommit?: string | null;
}

/** PNWF-A: the session-level exit, deliberately separate from the formal-work transition. */
export interface WorkSessionOption {
  readonly mayEnd: boolean;
  readonly action: string | null;
  readonly detail: string;
}

export interface WorkNextAction {
  readonly kind: WorkNextActionKind;
  /** True only when the named action is a transition the Scheduler/Work owner would actually accept. */
  readonly executable: boolean;
  /** The exact normal-tool action to call, or null when only a person/operator can progress. */
  readonly action: string | null;
  readonly detail: string;
  readonly taskId: string | null;
  readonly blockers: readonly string[];
  /**
   * PNWF-A: a session can end on an episode conclusion even when no formal transition is available.
   * This is NOT acceptance, completion or promotion; it is the honest stopping state.
   */
  readonly session?: WorkSessionOption;
  /**
   * PNWF-CQ-C: the mechanical transition and the business decision are different questions. When a
   * direct outcome already exists, the Scheduler may legally start a READY task while the task's
   * independent objective may already be satisfied. This is a derived advisory, not a new planner:
   * it names the facts and the possible routes; the principal still decides.
   */
  readonly semantic?: WorkSemanticDecision;
}

export interface WorkSemanticDecision {
  /** The business question the mechanical next action does not answer. */
  readonly question: string;
  /** The observed facts the question rests on. */
  readonly facts: readonly string[];
  /** Legal routes; none of them is claimed to be the right one. */
  readonly options: readonly string[];
}

export interface WorkNextActionInput {
  readonly standardConfirmed: boolean;
  readonly schedulerState: "RUNNING" | "PAUSED";
  readonly schedulerDecision: { readonly eventType: string; readonly entityId: string } | null;
  readonly schedulerError: string | null;
  readonly tasks: readonly { readonly taskId: string; readonly state: string }[];
  readonly attempts: readonly {
    readonly taskId: string | null;
    readonly state: string;
    readonly execution?: WorkAttemptExecution | undefined;
  }[];
  readonly holds: readonly string[];
  readonly promotionFence: readonly { readonly taskId: string; readonly state: string }[];
  readonly headState: string;
  readonly directOutcome?: WorkDirectOutcome | undefined;
}

function action(
  kind: WorkNextActionKind,
  executable: boolean,
  actionText: string | null,
  detail: string,
  taskId: string | null = null,
  blockers: readonly string[] = [],
  session?: WorkSessionOption | undefined,
): WorkNextAction {
  return Object.freeze({
    kind,
    executable,
    action: actionText,
    detail,
    taskId,
    blockers: Object.freeze([...blockers]),
    ...(session === undefined ? {} : { session: Object.freeze(session) }),
  });
}

const CHECKPOINT = "palimpsest_work action=conclude intent=CHECKPOINT";

function checkpointSession(detail: string): WorkSessionOption {
  return Object.freeze({ mayEnd: true, action: CHECKPOINT, detail });
}

/**
 * PNWF-CQ-C: a mechanically legal scheduler step is not a business recommendation. When a direct
 * outcome already exists at or ahead of the canonical basis, the principal must decide whether the
 * formal task still carries an independent objective. This helper only adds that question to the
 * existing mechanical explanation; it never retires, starts or accepts anything itself.
 */
function withSemantic(next: WorkNextAction, directOutcome: WorkDirectOutcome | undefined): WorkNextAction {
  if (directOutcome === undefined || next.kind !== "EXECUTE_SCHEDULER_STEP") return next;
  if (directOutcome.relation !== "DIRECT_AHEAD" && !(directOutcome.relation === "IN_SYNC" && directOutcome.admittedDirectCommit === directOutcome.projectHead)) return next;
  const repository = directOutcome.repositoryHead?.slice(0, 12) ?? "unknown";
  return Object.freeze({
    ...next,
    semantic: Object.freeze({
      question: "Does this formal task still carry an independent objective now that a direct outcome exists in the repository?",
      facts: Object.freeze([
        `repository HEAD ${repository}; canonical ProjectIR head ${directOutcome.projectHead.slice(0, 12)} (${directOutcome.relation})`,
        "the Scheduler step is mechanically legal; it is not an assessment that the work is still needed",
        "a direct commit is not a governed result, an operator acceptance or a Promotion",
      ]),
      options: Object.freeze([
        "continue genuine work the direct outcome does not cover",
        "retire a redundant formal task through a plan revision when the existing rules permit it",
        "record a CHECKPOINT if the formal work remains open and the session must end",
      ]),
    }),
  });
}

/**
 * PNWF-A: what a RUNNING attempt can actually do now. The lifecycle says "complete is available";
 * the world says whether a settlement has anything to settle.
 */
function runningAttemptAction(
  attempt: WorkNextActionInput["attempts"][number],
  multiples: number,
  directOutcome: WorkDirectOutcome | undefined,
): WorkNextAction {
  if (multiples > 1) {
    return action(
      "WAIT_ACTIVE_WORK",
      false,
      null,
      `${String(multiples)} attempts are RUNNING; pass the taskId the decision is about rather than guessing which one a settlement targets`,
      attempt.taskId,
    );
  }
  const facts = attempt.execution;
  if (facts === undefined) {
    return action(
      "WAIT_ACTIVE_WORK",
      true,
      "palimpsest_work action=complete",
      "an attempt is RUNNING; completion is the only formal transition available until it settles",
      attempt.taskId,
    );
  }
  if (facts.liveness === "ACTIVE") {
    return action(
      "WAIT_ACTIVE_WORK",
      false,
      null,
      "a worker is still observed writing this attempt's world; `complete` will refuse WORKER_ACTIVE. Observe it with `workers`, or request `stop` and wait for the host to observe the exit — do not call complete in a loop",
      attempt.taskId,
      [`attempt:${facts.attemptId}:WORKER_ACTIVE`],
      checkpointSession(
        "a worker is still observed active. A CHECKPOINT records that fact and does not claim the worker stopped, the task settled or the project completed",
      ),
    );
  }
  if (facts.liveness === "UNKNOWN") {
    return action(
      "WAIT_ACTIVE_WORK",
      false,
      null,
      "the worker's liveness is UNKNOWN: this host did not observe a confirmed exit, so an unobserved writer may still exist. `complete` must not race it. Inspect `workers`, or close the position with `relay` successor before any new attempt; a stop request is not an observed exit",
      attempt.taskId,
      [`attempt:${facts.attemptId}:LIVENESS_UNKNOWN`],
      checkpointSession(
        "the session can end with liveness UNKNOWN recorded. A CHECKPOINT does not claim the worker stopped, the task settled or the project completed",
      ),
    );
  }
  const unobserved = facts.liveness === "UNOBSERVED";
  const unobservedDetail = unobserved
    ? " This host has no invocation record for the attempt: that is not proof a worker never started, and it is not proof a previous writer stopped. The bytes can still be settled by the principal, but the attribution is UNATTRIBUTED; if you did not author this world, use `relay` successor instead of treating the world as quiescent."
    : "";
  if (facts.worldHead === null) {
    return action(
      "WAIT_ACTIVE_WORK",
      false,
      null,
      "the attempt's execution world cannot be observed, so neither a settlement nor a no-work refusal can be proven; inspect `workers` and the world path instead of calling complete",
      attempt.taskId,
      [`attempt:${facts.attemptId}:WORLD_UNOBSERVABLE`],
    );
  }
  if (facts.uncommittedChanges.length > 0) {
    return action(
      "WAIT_ACTIVE_WORK",
      false,
      null,
      `the attempt's world still has uncommitted changes (${facts.uncommittedChanges.join(", ")}); a settlement requires a committed result. Commit or discard them in the world first, then re-read status. The world HEAD being at the basis does not mean there is no work`,
      attempt.taskId,
      [`attempt:${facts.attemptId}:UNCOMMITTED_WORK`],
    );
  }
  if (facts.worldHead === facts.baseCommit) {
    const direct =
      directOutcome?.relation === "DIRECT_AHEAD"
        ? ` The repository is ahead of the canonical basis (${directOutcome.repositoryHead?.slice(0, 12) ?? "unknown"}); that direct commit is a repository outcome, not a governed result and not accepted here.`
        : directOutcome?.relation === "IN_SYNC"
          ? " The repository and the canonical head agree; any outcome already in the basis is a direct outcome, not a new delta of this attempt."
          : "";
    return action(
      "NO_SETTLEABLE_DELTA",
      false,
      null,
      `the attempt's world has no commit beyond its basis (world HEAD = base), so there is no settleable candidate delta and \`complete\` will refuse NO_WORK. This does NOT establish that the user's actual outcome is incomplete; assess that from the repository and the task's objective.${direct}${unobservedDetail} Do not retry the same complete. If this formal task has no independent goal, retire it through a plan revision; if the session must end, record a CHECKPOINT`,
      attempt.taskId,
      [`attempt:${facts.attemptId}:NO_DELTA`, ...(unobserved ? [`attempt:${facts.attemptId}:LIVENESS_UNOBSERVED`] : [])],
      checkpointSession(
        "the session can end with the open attempt recorded as an unresolved fact. A CHECKPOINT does not settle the attempt, accept an artifact or mark the project complete",
      ),
    );
  }
  return action(
    "WAIT_ACTIVE_WORK",
    true,
    "palimpsest_work action=complete",
    `the attempt's world holds a committed delta (${facts.baseCommit.slice(0, 12)} → ${facts.worldHead.slice(0, 12)}); completion is the next formal transition.${unobservedDetail}`,
    attempt.taskId,
    unobserved ? [`attempt:${facts.attemptId}:LIVENESS_UNOBSERVED`] : [],
  );
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

  /**
   * PNWF-A: a RUNNING attempt is a fact about the world, not just a lifecycle row. Its execution
   * facts decide whether `complete` is executable; they are checked before the scheduler's generic
   * decision because the generic decision is exactly what used to mislabel a zero-delta attempt.
   */
  const running = input.attempts.filter((attempt) => attempt.state === "RUNNING");
  if (running.length > 0) {
    return runningAttemptAction(running[0]!, running.length, input.directOutcome);
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

  /**
   * PNWF-C: a direct commit ahead of the canonical ProjectIR head. The physical Git HEAD and the
   * governed basis are different facts; the product never promotes one into the other. Governed work
   * starts from the canonical head, so starting it here would silently ignore the direct commit.
   */
  if (input.directOutcome?.relation === "DIRECT_AHEAD") {
    return action(
      "DIRECT_HEAD_AHEAD",
      false,
      null,
      `the repository is at ${input.directOutcome.repositoryHead?.slice(0, 12) ?? "unknown"} but the canonical ProjectIR head is ${input.directOutcome.projectHead.slice(0, 12)}. The direct commit is NOT a governed result and the canonical head is not advanced by ordinary Git. Governed work must not start at the stale canonical basis; the operator must decide (accept the direct outcome outside the project, or establish a new basis through the existing authority path). A direct DELIVER conclusion may cite the committed artifact as an advisory judgement`,
      null,
      [`direct:${input.directOutcome.projectHead.slice(0, 12)}:${input.directOutcome.repositoryHead?.slice(0, 12) ?? "unknown"}`],
      checkpointSession(
        "the session can end with the direct head recorded as ahead of the canonical basis. A CHECKPOINT is not acceptance, promotion or a head advance",
      ),
    );
  }

  if (input.schedulerDecision !== null) {
    return withSemantic(
      action(
        "EXECUTE_SCHEDULER_STEP",
        true,
        "palimpsest_work action=next",
        `the Scheduler's next decision is ${input.schedulerDecision.eventType}; calling next commits exactly that transition`,
        input.schedulerDecision.entityId,
      ),
      input.directOutcome,
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

  /**
   * PNWF-B/E: a project with no formal task (or only terminal history) is a legitimate shape. The
   * outcome may already be a direct commit. The product must not invent a task to produce a Work
   * record, and it must not say "no action" when the honest action is an episode conclusion.
   */
  const live = input.tasks.filter((task) => !["SATISFIED", "FAILED", "STALE"].includes(task.state));
  if (live.length === 0) {
    const direct =
      input.directOutcome?.relation === "IN_SYNC"
        ? " The repository and the canonical head agree."
        : "";
    return action(
      "NO_FORMAL_WORK",
      false,
      null,
      `this project has no live formal task. Direct work is allowed and a formal task is not mandatory for every edit.${direct} If the repository outcome is the deliverable, record an episode conclusion (DELIVER); if more work remains, plan a governed task only when its boundaries matter; if the session must end now, record CHECKPOINT`,
      null,
      [],
      checkpointSession(
        "no formal Work transition is available. DELIVER if the direct outcome is the deliverable; CHECKPOINT if it is not. Neither accepts an artifact or promotes a result",
      ),
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
  readonly attempts: readonly {
    readonly task_id: string | null;
    readonly state: string;
    readonly execution?: WorkAttemptExecution | undefined;
  }[];
  readonly holds: readonly string[];
  readonly promotionFence: readonly { readonly task_id: string; readonly state: string }[];
  readonly headState: string;
  readonly directOutcome?: WorkDirectOutcome | undefined;
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
    attempts: liveAttempts.map((attempt) => ({
      taskId: attempt.task_id,
      state: attempt.state,
      ...(attempt.execution === undefined ? {} : { execution: attempt.execution }),
    })),
    holds: input.holds,
    promotionFence: input.promotionFence.map((entry) => ({ taskId: entry.task_id, state: entry.state })),
    headState: input.headState,
    ...(input.directOutcome === undefined ? {} : { directOutcome: input.directOutcome }),
  });
}
