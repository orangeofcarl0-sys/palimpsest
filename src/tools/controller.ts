/**
 * ProjectController: the process-level orchestrator behind the tool surface.
 *
 * It owns one project: the EventStore (orchestration truth), the Ordarium
 * effects runtime (side-effect truth), the trusted policy, and the attempt
 * executor. The seven DSH tools (src/tools/tools.ts) are thin bindings over
 * it; tests drive it directly for the fault-acceptance scenarios.
 *
 * Determinism rules carried over from the frozen baseline:
 *   - every event idempotency key is derived, never caller-chosen;
 *   - attempts are claimed (worktree + STARTED) and reported (terminal
 *     callback); a report's claims are never evidence;
 *   - pause/resume uses the scheduler control generation as a fencing token.
 */

import {
  actionKey,
  stableEntityId,
  DEFAULT_STAGE_GRAPH,
  parseStageGraphDefinition,
  validateStageGraphReachability,
  type StageGraphDefinition,
} from "../domain/index.js";
import {
  attemptReportDigestOf,
  canonicalDatetime,
  canonicalDigest,
  parseProjectIr,
  parseTaskEnvelope,
  parseNewEvent,
  type AttemptReport,
  type Decision,
  type EvidenceAtom,
  type EventType,
  type ProjectIr,
  type Requirement,
  type SchedulerEvent,
  type TaskEnvelope,
  type TaskSpec,
} from "../schema/index.js";
import { DomainValidationError } from "../domain/errors.js";
import { RoleSlotPolicy, BudgetLedger } from "./parallel.js";
import { computeInvalidationSet, changeClassInvalidates } from "../evidence/invalidation.js";
import { GateEngine, type GateDefinition, type GateResult } from "../evidence/gate_dsl.js";
import {
  runTournament,
  type PairwiseJudge,
  type TournamentEntry,
  type TournamentResult,
} from "../select/tournament.js";
import { capWorkerSummary, judgeCommentary, rubricCompare } from "../select/declared.js";
import { allocate, type Allocation, type AllocationEstimates } from "../allocate/allocator.js";
import { adjustAllocation } from "../allocate/telemetry_adapter.js";
import { ModelPerformanceTable } from "../telemetry/performance_table.js";
import { TelemetryStateSync } from "../telemetry/state_persistence.js";
import { ClaimGraph } from "../evidence/graph.js";
import type { ChangeClass, DependencyEdge } from "../evidence/invalidation.js";
import type { TaskRole } from "../schema/index.js";
import { EventStore } from "../state/index.js";
import { Scheduler } from "../scheduler/index.js";
import {
  DEFAULT_HARD_CAP,
  DEFAULT_ROLE_SLOTS,
  type ParallelOptions,
} from "./parallel.js";
import { PromotionManager, type PromoteResult } from "../effects/promotion.js";
import {
  createPromotionRecoveryService,
  type PromotionRecoveryService,
  type RecoveryReport,
} from "../recovery/recovery.js";
import { runGateCommand } from "./gate_runner.js";
import type { PalimpsestEffectsRuntime } from "../effects/runtime.js";
import type { TaskPolicy } from "../domain/policy.js";
import type { AttemptExecutor } from "../effects/executor.js";

export const DEFAULT_HEAD_COMMIT = "c".repeat(40);

export interface StartProjectInput {
  projectId: string;
  goal: string;
  requirements?: readonly Requirement[];
  decisions?: readonly Decision[];
  tasks: readonly TaskSpec[];
  headCommit?: string | undefined;
  committedAt?: string | undefined;
}

export interface PlanInput {
  goal?: string | undefined;
  requirements?: readonly Requirement[];
  decisions?: readonly Decision[];
  tasks: readonly TaskSpec[];
  reason?: string | undefined;
  committedAt?: string | undefined;
  /** R2 typed invalidation: the class and logical ids this revision changes. */
  changeClass?: ChangeClass | undefined;
  changedIds?: readonly string[] | undefined;
}

export interface ReportInput {
  workerStatus: AttemptReport["worker_status"];
  summary: string;
  changedFiles?: readonly string[] | undefined;
  producedArtifacts?: readonly string[] | undefined;
  resultCommit?: string | null | undefined;
  runner?: string | undefined;
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
}

export interface GateInput {
  attemptId: string;
  predicate: EvidenceAtom["predicate"];
  command: readonly string[];
  exitCode: number;
  observedArtifacts?: readonly string[] | undefined;
}

/**
 * R6→R5 (PLMP-ALC-1 §2): host-supplied telemetry attribution for one
 * attempt. Host-layer only - the event contract stays untouched, and an
 * attempt claimed without attribution produces no telemetry sample.
 */
export interface AttemptAttribution {
  /** The model that runs this attempt (host namespace, e.g. "flash"). */
  model: string;
  /** Host-priced attempt cost (>= 0, finite); 0 leaves cost comparisons vacuous. */
  cost?: number;
  /** Telemetry task_type; defaults to the attempt task's role. */
  taskType?: string;
}

export interface AllocationCalibration {
  readonly role: TaskRole;
  readonly slotOfRole: number;
  readonly occupied: number;
  readonly totalRunning: number;
  readonly hardCap: number;
  /** How many candidates of this role may run concurrently right now. */
  readonly concurrentLimit: number;
}

export interface ControllerStatusView {
  projectId: string;
  revision: number;
  headCommit: string;
  schedulerState: "RUNNING" | "PAUSED";
  generation: number;
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
  }>;
  evidence: Array<{ evidence_id: string; status: string }>;
  promotions: Array<{ promotion_id: string; state: string }>;
  parallel: { admittedAttempts: number; rejectedClaims: number };
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
}

export interface ProjectControllerOptions {
  store: EventStore;
  effects: PalimpsestEffectsRuntime;
  projectId: string;
  policy: TaskPolicy;
  /** Runtime attempt metering (not on-chain state); inject for budget tests. */
  budget?: BudgetLedger | undefined;
  clock?: (() => string) | undefined;
}

export class ProjectController {
  readonly store: EventStore;
  readonly effects: PalimpsestEffectsRuntime;
  readonly projectId: string;
  readonly policy: TaskPolicy;
  /** Runtime attempt metering (not on-chain state); inject for budget tests. */
  readonly budget: BudgetLedger;
  readonly scheduler: Scheduler;
  readonly promotions: PromotionManager;
  readonly recovery: PromotionRecoveryService;
  /**
   * H1 §3.4 D-2: the slot policy is read from the declared role table on every
   * use - the declaration on the log is the single source of truth. Missing
   * declaration fails closed (claims only exist after genesis).
   */
  get slots(): RoleSlotPolicy {
    const row = this.store.connection
      .prepare("SELECT table_json FROM role_tables WHERE project_id=?")
      .get(this.projectId) as { table_json: Uint8Array } | undefined;
    if (row === undefined) {
      throw new DomainValidationError("no role table declared for this project");
    }
    const declared = JSON.parse(new TextDecoder().decode(row.table_json)) as {
      roles: Array<{ role: string; slots: number }>;
      hard_cap: number;
    };
    const slots: Record<string, number> = {};
    for (const entry of declared.roles) slots[entry.role] = entry.slots;
    return new RoleSlotPolicy({ slots, hardCap: declared.hard_cap });
  }
  readonly gates: GateEngine;
  /** R6: telemetry the host records into (success/cost per task_type+model). */
  readonly telemetry = new ModelPerformanceTable();
  /** TLM-1: durable home is the Ordarium state kind; lazily bound sync. */
  #telemetrySync: TelemetryStateSync | undefined = undefined;
  /** ALC-1 §3: last auto-flush failure, surfaced until the next flush succeeds. */
  #telemetryError: { message: string } | undefined = undefined;
  /** ALC-1 §2: per-attempt telemetry attribution, consumed at settlement. */
  #attemptAttribution = new Map<string, AttemptAttribution>();

  /** ALC-1 §3: the pending auto-flush failure, if any (cleared on the next successful flush). */
  telemetryPendingError(): string | undefined {
    return this.#telemetryError?.message;
  }

  /** TLM-1: append the memory table's new deltas to the shared timeline. */
  async persistTelemetry(): Promise<void> {
    this.#telemetrySync ??= await TelemetryStateSync.load(this.effects.state);
    await this.#telemetrySync.flush(this.telemetry);
    this.#telemetryError = undefined;
  }

  /** TLM-1: rebuild the in-memory telemetry from the durable deltas (after a restart). */
  async loadTelemetryInto(target: ModelPerformanceTable): Promise<ModelPerformanceTable> {
    const sync = await TelemetryStateSync.load(this.effects.state);
    this.#telemetrySync = sync;
    for (const row of sync.durableSnapshot().rows) {
      target.addAggregated(row);
    }
    return target;
  }
  /** R7: scientific evidence graph recording claims/evidence/experiments. */
  readonly claims = new ClaimGraph();
  readonly #clock: () => string;

  constructor(options: ProjectControllerOptions) {
    this.store = options.store;
    this.effects = options.effects;
    this.projectId = options.projectId;
    this.policy = options.policy;
    this.scheduler = new Scheduler(options.store, options.projectId);
    this.scheduler.registerPolicy(options.policy);
    this.promotions = new PromotionManager(options.store, options.effects, options.projectId);
    this.recovery = createPromotionRecoveryService({
      store: options.store,
      effects: options.effects,
      projectId: options.projectId,
    });
    this.budget = options.budget ?? new BudgetLedger();
    this.gates = new GateEngine();
    this.#clock = options.clock ?? (() => new Date().toISOString());
  }

  #now(): string {
    return canonicalDatetime(this.#clock());
  }

  // -------------------------------------------------------------------------
  // Goal compilation and planning
  // -------------------------------------------------------------------------

  /** H1 §3.4 D-1: declare (or supersede) one gate on the log. */
  declareGate(gate: GateDefinition, declaredBy: string): SchedulerEvent {
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "GATE_DEFINED",
        payload_version: 1,
        entity_type: "gate",
        entity_id: gate.gate_id,
        payload: { gate, declared_by: declaredBy },
        causation_id: null,
        correlation_id: `gate:${gate.gate_id}`,
        idempotency_key: actionKey("gate-defined-v1", {
          project_id: this.projectId,
          gate_id: gate.gate_id,
          version: gate.version,
        }),
        expected_project_revision: this.promotions.projectRevision(),
      }),
    );
  }

  /** H1 §3.4 D-2: declare (or supersede) the project role table on the log. */
  declareRoleTable(
    input: {
      roles: Array<{ role: string; slots: number }>;
      hardCap: number;
      declaredBy: string;
    },
  ): SchedulerEvent {
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "ROLE_TABLE_DEFINED",
        payload_version: 1,
        entity_type: "role-table",
        entity_id: this.projectId,
        payload: {
          roles: input.roles,
          hard_cap: input.hardCap,
          declared_by: input.declaredBy,
        },
        causation_id: null,
        correlation_id: `roles:${this.projectId}`,
        idempotency_key: actionKey("role-table-defined-v1", {
          project_id: this.projectId,
          roles: input.roles.map((role) => `${role.role}:${role.slots}`).join(","),
          hard_cap: input.hardCap,
        }),
        expected_project_revision: this.promotions.projectRevision(),
      }),
    );
  }

  /**
   * H1 §3.4 D-3 / G4: declare (or supersede) the project stage graph. Any
   * topology change is a governance act — the new definition must parse, and
   * every currently occupied task state must still reach a terminal state
   * through declared transitions, all before anything is appended.
   */
  declareStageGraph(graph: StageGraphDefinition, version: number): SchedulerEvent {
    const definition = parseStageGraphDefinition(graph);
    const occupied = (
      this.store.connection
        .prepare("SELECT DISTINCT state FROM tasks WHERE project_id=?")
        .all(this.projectId) as Array<Record<string, unknown>>
    ).map((row) => String(row.state));
    validateStageGraphReachability(definition, occupied);
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "STAGE_GRAPH_DEFINED",
        payload_version: 1,
        entity_type: "stage-graph",
        entity_id: this.projectId,
        payload: {
          stages: definition.stages,
          transitions: definition.transitions,
          guards: definition.guards,
          declared_by: definition.declared_by,
          reason: definition.reason,
        },
        causation_id: null,
        correlation_id: `stage-graph:${this.projectId}`,
        idempotency_key: actionKey("stage-graph-v1", {
          project_id: this.projectId,
          version,
        }),
        expected_project_revision: this.promotions.projectRevision(),
      }),
    );
  }

  start(input: StartProjectInput): SchedulerEvent {
    if (input.projectId !== this.projectId) {
      throw new DomainValidationError("project id does not match the controller");
    }
    const project = buildProjectIr({
      projectId: this.projectId,
      goal: input.goal,
      requirements: input.requirements ?? [],
      decisions: input.decisions ?? [],
      tasks: input.tasks,
      headCommit: input.headCommit ?? DEFAULT_HEAD_COMMIT,
      committedAt: input.committedAt ?? this.#now(),
    });
    const created = this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "PROJECT_CREATED",
        payload_version: 1,
        entity_type: "project",
        entity_id: this.projectId,
        payload: { project_ir: project },
        causation_id: null,
        correlation_id: "scheduler-project-create",
        idempotency_key: actionKey("scheduler-project-create", {
          project: this.projectId,
        }),
        expected_project_revision: null,
      }),
    );
    // H1 §3.4 genesis: the default role table is itself a declaration on the
    // log, so the previous hardcoded defaults remain replayable facts.
    this.declareRoleTable({
      roles: Object.entries(DEFAULT_ROLE_SLOTS).map(([role, slots]) => ({ role, slots })),
      hardCap: DEFAULT_HARD_CAP,
      declaredBy: "genesis",
    });
    // ...as is the default stage graph: the phase0-2 hardcoded pipeline,
    // declared verbatim (H1 §3.4 D-3).
    this.declareStageGraph(DEFAULT_STAGE_GRAPH, 1);
    for (const task of input.tasks) {
      this.scheduler.registerTask(this.policy.authorize(project, task.task_id));
    }
    return created;
  }

  /** Emit a new ProjectIR revision (palimpsest_plan). */
  plan(input: PlanInput): SchedulerEvent {
    const current = this.#project();
    const revision = current.revision + 1;
    const data = {
      project_id: this.projectId,
      revision,
      parent_revision: current.revision,
      parent_digest: current.digest,
      goal: input.goal ?? current.goal,
      requirements: input.requirements ? [...input.requirements] : current.requirements,
      decisions: input.decisions ? [...input.decisions] : current.decisions,
      tasks: [...input.tasks],
      head_commit: current.head_commit,
      committed_at: input.committedAt ?? this.#now(),
    };
    const project = buildProjectIr({
      projectId: data.project_id,
      revision,
      parentRevision: data.parent_revision,
      parentDigest: data.parent_digest,
      goal: data.goal,
      requirements: data.requirements,
      decisions: data.decisions,
      tasks: data.tasks,
      headCommit: data.head_commit,
      committedAt: data.committed_at,
    });
    const promotionId = stableEntityId(
      "plan",
      actionKey("plan-revision-v1", { project_id: this.projectId, revision }),
    );
    const event = this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "PROJECT_REVISED",
        payload_version: 1,
        entity_type: "project",
        entity_id: this.projectId,
        payload: { project_ir: project, promotion_id: promotionId },
        causation_id: null,
        correlation_id: `plan:${revision}`,
        idempotency_key: actionKey("plan-revision-v1", {
          project_id: this.projectId,
          revision,
        }),
        expected_project_revision: current.revision,
      }),
    );
    if (input.changeClass !== undefined) {
      this.#applyTypedInvalidation({
        changeClass: input.changeClass,
        changedIds: input.changedIds ?? input.tasks.map((task) => task.task_id),
        from: current.revision,
        to: revision,
      });
    }
    return event;
  }

  /** R2: compute and apply the typed invalidation closure for a plan revision. */
  #applyTypedInvalidation(arg: {
    changeClass: ChangeClass;
    changedIds: readonly string[];
    from: number;
    to: number;
  }): void {
    const project = this.#project(); // new revision is now current
    const edges: DependencyEdge[] = [];
    for (const task of project.tasks) {
      for (const dependency of task.depends_on) {
        edges.push({
          from: dependency,
          to: task.task_id,
          sensitive_to: ["behavior_change", "contract_breaking"],
        });
      }
    }
    const affected = computeInvalidationSet(
      {
        from: arg.from,
        to: arg.to,
        change_class: arg.changeClass,
        changed_ids: arg.changedIds,
      },
      edges,
    );
    if (affected.size === 0 && !changeClassInvalidates(arg.changeClass)) {
      return;
    }
    for (const taskId of affected) {
      const row = this.store.connection
        .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
        .get(this.projectId, taskId) as { state: string } | undefined;
      if (row === undefined || row.state === "STALE" || row.state === "FAILED" || row.state === "SATISFIED") {
        continue;
      }
      this.invalidateTask(taskId, `typed invalidation (${arg.changeClass}) on revision ${arg.to}`);
    }
    // Evidence bound to the affected tasks (or their attempts) loses authority.
    const scope: string[] = [];
    for (const taskId of affected) {
      scope.push(taskId);
      for (const attempt of this.store.connection
        .prepare("SELECT attempt_id FROM attempts WHERE project_id=? AND task_id=?")
        .all(this.projectId, taskId) as Array<{ attempt_id: string }>) {
        scope.push(attempt.attempt_id);
      }
    }
    if (scope.length === 0) return;
    const holders = this.store.connection
      .prepare(
        "SELECT evidence_id FROM evidence WHERE project_id=? AND status='active'",
      )
      .all(this.projectId) as Array<{ evidence_id: string }>;
    for (const holder of holders) {
      const evidence = JSON.parse(
        new TextDecoder().decode(
          (
            this.store.connection
              .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND evidence_id=?")
              .get(this.projectId, holder.evidence_id) as { evidence_json: Uint8Array }
          ).evidence_json,
        ),
      ) as { subject_id?: string };
      if (evidence.subject_id !== undefined && scope.includes(evidence.subject_id)) {
        this.store.connection
          .prepare("UPDATE evidence SET status='stale' WHERE project_id=? AND evidence_id=?")
          .run(this.projectId, holder.evidence_id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Scheduler decisions
  // -------------------------------------------------------------------------

  /** One deterministic scheduler decision; appends at most one Event. */
  step(): SchedulerEvent | null {
    return this.scheduler.runOnce();
  }

  /**
   * E1, plan-mode-safe surface (docs/02 §3.1): the deterministic decision the
   * next step() would commit, without writing a single event. A preview is
   * byte-identical to what step() would append (preview uses scheduler.decide,
   * step uses scheduler.runOnce = commit(decide)).
   */
  preview(): {
    decision: "idle" | "paused" | "next";
    eventType?: string;
    entityId?: string;
    projectRevision?: number | null;
  } {
    const control = this.store.connection
      .prepare("SELECT state FROM scheduler_control WHERE project_id=?")
      .get(this.projectId) as { state: string } | undefined;
    if (control?.state === "PAUSED") return { decision: "paused" };
    const decision = this.scheduler.decide();
    if (decision === null) return { decision: "idle" };
    return {
      decision: "next",
      eventType: decision.event_type,
      entityId: decision.entity_id,
      projectRevision: decision.expected_project_revision,
    };
  }

  /**
   * E1, one turn of the entry loop (docs/02 §2.1): drive bounded mechanical
   * progress (auto gate commands, batch retries) via pumpCommandAttempts, then
   * read the next decision and classify what the host agent alone can supply:
   * dispatch a worker (needs_worker), gate+promote a verified batch
   * (needs_promotion), or nothing left (terminal/paused).
   */
  async runTurn(options: { maxSteps?: number } = {}): Promise<{
    phase:
      | "terminal"
      | "paused"
      | "needs_worker"
      | "needs_promotion"
      | "needs_reconcile"
      | "progress";
    mechanical: { attemptsRun: number; exits: (number | null)[] };
    next?: { eventType: string; entityId: string; projectRevision: number | null };
    recovery?: RecoveryReport;
  }> {
    const maxSteps = options.maxSteps ?? 50;
    // H1 spec §3.1: reconcile PREPARED promotions before the scheduler looks
    // at the world, so a crash between the merge and the ledger write resolves
    // instead of stalling the pipeline. Uncertain outcomes that reconcile
    // cannot resolve block the turn (H1-A2) instead of guessing a verdict.
    const recovery = await this.recovery.reconcileAll();
    if (recovery.blocked.length > 0) {
      return {
        phase: "needs_reconcile",
        mechanical: { attemptsRun: 0, exits: [] },
        recovery,
      };
    }
    const mechanical = await this.pumpCommandAttempts({ maxSteps });
    const control = this.store.connection
      .prepare("SELECT state FROM scheduler_control WHERE project_id=?")
      .get(this.projectId) as { state: string } | undefined;
    if (control?.state === "PAUSED") {
      return { phase: "paused", mechanical };
    }
    const decision = this.scheduler.decide();
    if (decision !== null) {
      const next = {
        eventType: decision.event_type,
        entityId: decision.entity_id,
        projectRevision: decision.expected_project_revision,
      };
      const phase =
        decision.event_type === "ATTEMPT_CREATED" ? "needs_worker" : "progress";
      return { phase, mechanical, next };
    }
    const rows = this.store.connection
      .prepare("SELECT task_id, state FROM tasks WHERE project_id=?")
      .all(this.projectId) as { task_id: string; state: string }[];
    const states = new Map(rows.map((row) => [String(row.task_id), String(row.state)]));
    const unresolved = this.#project().tasks.filter(
      (task) => !["SATISFIED", "FAILED"].includes(states.get(task.task_id) ?? ""),
    );
    if (unresolved.length === 0) return { phase: "terminal", mechanical };
    if (unresolved.some((task) => states.get(task.task_id) === "VERIFYING")) {
      return { phase: "needs_promotion", mechanical };
    }
    return { phase: "needs_worker", mechanical };
  }

  pause(reason: string): SchedulerEvent {
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "SCHEDULER_PAUSED",
        payload_version: 1,
        entity_type: "scheduler_control",
        entity_id: this.projectId,
        payload: { reason },
        causation_id: null,
        correlation_id: "scheduler-pause",
        idempotency_key: actionKey("scheduler-pause-v1", {
          project_id: this.projectId,
          reason,
        }),
        expected_project_revision: null,
      }),
    );
  }

  resume(reason: string): SchedulerEvent {
    const row = this.store.connection
      .prepare("SELECT generation FROM scheduler_control WHERE project_id=?")
      .get(this.projectId) as { generation: number } | undefined;
    if (row === undefined) {
      throw new DomainValidationError("scheduler control projection is missing");
    }
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "SCHEDULER_RESUMED",
        payload_version: 1,
        entity_type: "scheduler_control",
        entity_id: this.projectId,
        payload: { reason, expected_control_generation: row.generation },
        causation_id: null,
        correlation_id: "scheduler-resume",
        idempotency_key: actionKey("scheduler-resume-v1", {
          project_id: this.projectId,
          reason,
          expected_control_generation: row.generation,
        }),
        expected_project_revision: null,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Claim / report protocol
  // -------------------------------------------------------------------------

  /**
   * Claim an attempt: create its worktree and mark it RUNNING. An optional
   * attribution registers the telemetry sample this attempt will settle
   * (PLMP-ALC-1 §2); without it the attempt produces no sample.
   */
  async claim(
    attemptId: string,
    attribution?: AttemptAttribution | undefined,
  ): Promise<{ worktreePath: string }> {
    const project = this.#project();
    const role = this.#roleOf(attemptId);
    const runningRoles = this.#runningRoles();
    this.slots.assertAdmissible(role, runningRoles);
    this.budget.admit();
    const worktree = await this.effects.invoke(
      this.effects.actions.worktreeCreate,
      { worktreeId: attemptId, baseCommit: project.head_commit },
      {
        scope: this.projectId,
        callId: `worktree:${attemptId}`,
        revision: this.promotions.projectRevision(),
      },
    );
    this.scheduler.startAttempt(attemptId);
    if (attribution !== undefined) this.#attemptAttribution.set(attemptId, attribution);
    return { worktreePath: worktree.worktreePath };
  }

  /** Submit an attempt report; the report's claims are never evidence. */
  report(attemptId: string, input: ReportInput): SchedulerEvent {
    const terminal: Record<AttemptReport["worker_status"], EventType> = {
      completed: "ATTEMPT_COMPLETED",
      failed: "ATTEMPT_FAILED",
      cancelled: "ATTEMPT_CANCELLED",
      expired: "ATTEMPT_EXPIRED",
    };
    const report = this.#buildReport(attemptId, input);
    return this.scheduler.recordCallback(attemptId, terminal[input.workerStatus], report);
  }

  /** A worker that expired its lease may still return; it is recorded STALE. */
  reportLate(attemptId: string, input: ReportInput): SchedulerEvent {
    const report = this.#buildReport(attemptId, {
      ...input,
      workerStatus: input.workerStatus === "expired" ? "expired" : input.workerStatus,
    });
    return this.scheduler.recordCallback(attemptId, "ATTEMPT_LATE_RESULT", report);
  }

  #buildReport(attemptId: string, input: ReportInput): AttemptReport {
    const [row, envelope] = this.#attemptContext(attemptId);
    const summary = capWorkerSummary(input.summary);
    const completed = input.workerStatus === "completed";
    return {
      schema_version: 1,
      project_id: this.projectId,
      attempt_id: attemptId,
      task_id: String(row.task_id),
      envelope_id: envelope.envelope_id,
      input_project_revision: envelope.project_revision,
      input_project_digest: envelope.project_digest,
      base_commit: envelope.base_commit,
      worktree_id: `worktree-${attemptId.slice(-8)}`,
      result_commit:
        input.resultCommit === undefined
          ? completed
            ? DEFAULT_HEAD_COMMIT
            : null
          : input.resultCommit,
      worker_status: input.workerStatus,
      summary,
      changed_files: [...(input.changedFiles ?? [])],
      produced_artifacts: [...(input.producedArtifacts ?? envelope.required_artifacts)],
      started_at: input.startedAt ?? "2026-08-13T00:00:00Z",
      finished_at: input.finishedAt ?? "2026-08-13T00:00:01Z",
      runtime_metadata: {
        runner: input.runner ?? "dsh-agent",
        runner_version: "1",
        argv: [input.runner ?? "dsh-agent"],
        exit_code: completed ? 0 : 1,
        duration_ms: 1,
        environment_digest: "e".repeat(64),
        stdout_artifact: null,
        stderr_artifact: null,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Deterministic gate → EvidenceAtom
  // -------------------------------------------------------------------------

  async gate(input: GateInput): Promise<SchedulerEvent> {
    const [row, envelope] = this.#attemptContext(input.attemptId);
    const executable = input.command[0];
    if (executable === undefined) {
      throw new DomainValidationError("gate command must have an executable");
    }
    await runGateCommand(this.effects, {
      worktreeId: input.attemptId,
      executable,
      argv: input.command.slice(1),
      scope: this.projectId,
      callId: `gate:${input.attemptId}:${canonicalDigest({
        predicate: input.predicate,
        command: input.command,
      }).slice(0, 16)}`,
      revision: this.promotions.projectRevision(),
    });
    const evidenceId = stableEntityId(
      "evidence",
      actionKey("evidence-v1", {
        project_id: this.projectId,
        attempt_id: input.attemptId,
        predicate: input.predicate,
        command: input.command,
      }),
    );
    const evidence: EvidenceAtom = {
      schema_version: 1,
      project_id: this.projectId,
      evidence_id: evidenceId,
      subject_type: "attempt",
      subject_id: input.attemptId,
      subject_digest: canonicalDigest({
        attempt_id: input.attemptId,
        command: input.command,
      }),
      predicate: input.predicate,
      value: { exit_code: input.exitCode },
      project_revision: envelope.project_revision,
      input_fingerprint: envelope.project_digest,
      command: [...input.command],
      exit_code: input.exitCode,
      environment_digest: "e".repeat(64),
      dependency_digest: null,
      observed_artifacts: [...(input.observedArtifacts ?? envelope.required_artifacts)],
      producer: "palimpsest-gate",
      created_at: this.#now(),
      status: "active",
    };
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "EVIDENCE_ADDED",
        payload_version: 1,
        entity_type: "evidence",
        entity_id: evidenceId,
        payload: { evidence },
        causation_id: row.last_event_id,
        correlation_id: `evidence:${evidenceId}`,
        idempotency_key: actionKey("evidence-v1", {
          project_id: this.projectId,
          attempt_id: input.attemptId,
          predicate: input.predicate,
          command: input.command,
        }),
        expected_project_revision: envelope.project_revision,
      }),
    );
  }

  /**
   * Mark a task STALE after its input world changed (revision change /
   * plan). The key is derived exactly like the frozen baseline
   * (task-stale-v1); active tasks carry their batch anchor.
   */
  invalidateTask(taskId: string, reason: string): SchedulerEvent {
    const row = this.store.connection
      .prepare("SELECT * FROM tasks WHERE project_id=? AND task_id=?")
      .get(this.projectId, taskId) as Record<string, unknown> | undefined;
    if (row === undefined) {
      throw new DomainValidationError("task does not exist");
    }
    const state = decodeJsonBlob(row.state_json);
    const previousState = String(row.state);
    let batchId: number | null = null;
    if (previousState === "ACTIVE" || previousState === "VERIFYING") {
      const [activationId] = this.store.aggregateValidator.currentBatch(
        this.store.connection,
        row,
      );
      batchId = activationId;
    }
    const key = actionKey("task-stale-v1", {
      project_id: this.projectId,
      task_id: taskId,
      previous_state: previousState,
      batch_activation_event_id: batchId,
    });
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "TASK_STALE",
        payload_version: 1,
        entity_type: "task",
        entity_id: taskId,
        payload: {
          previous_state: previousState,
          new_state: "STALE",
          reason,
          batch_activation_event_id: batchId,
        },
        causation_id: row.last_event_id,
        correlation_id: `task:${taskId}:stale`,
        idempotency_key: key,
        expected_project_revision: this.#project().revision,
      }),
    );
  }

  /**
   * Evaluate a registered gate against the Evidence projection for one
   * subject (R1): return the verdict and the evidence demand.
   */
  evaluateGate(
    gateId: string,
    subjectType: GateDefinition["subject_type"],
    subjectId: string,
  ): GateResult {
    return this.gates.evaluate(this.store, this.projectId, subjectType, subjectId, gateId);
  }

  /**
   * Evaluate a registered gate on one attempt and settle its telemetry
   * sample from the verdict (PLMP-ALC-1 §3): PASS records success, FAIL
   * records failure, INCOMPLETE records nothing - the worker's own claim
   * of completion never counts as success.
   */
  evaluateAttemptGate(gateId: string, attemptId: string): GateResult {
    const verdict = this.evaluateGate(gateId, "attempt", attemptId);
    if (verdict.verdict === "PASS") this.#recordAttemptOutcome(attemptId, "success");
    if (verdict.verdict === "FAIL") this.#recordAttemptOutcome(attemptId, "failure");
    return verdict;
  }

  /** Invalidate evidence bound to a superseded subject (revision change). */
  invalidateEvidence(evidenceId: string, reason: string): SchedulerEvent {
    const revision = this.#project().revision;
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "EVIDENCE_STALE",
        payload_version: 1,
        entity_type: "evidence",
        entity_id: evidenceId,
        payload: { evidence_id: evidenceId, reason },
        causation_id: null,
        correlation_id: `evidence-stale:${evidenceId}`,
        idempotency_key: actionKey("evidence-stale-v1", {
          project_id: this.projectId,
          evidence_id: evidenceId,
          reason,
        }),
        expected_project_revision: revision,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Command-executor automation (R12)
  // -------------------------------------------------------------------------

  /**
   * Fully-automated attempt: claim (worktree + RUNNING), run the envelope's
   * first allowed gate command, and map the exit code to a terminal report.
   * A deterministic gate is the source of truth, never a worker claim.
   */
  async runAttemptWithCommandExecutor(
    attemptId: string,
    attribution?: AttemptAttribution | undefined,
  ): Promise<{ exitCode: number | null; reportEvent: SchedulerEvent["event_type"] }> {
    await this.claim(attemptId, attribution);
    const [, envelope] = this.#attemptContext(attemptId);
    const command = envelope.allowed_commands[0];
    if (command === undefined) {
      const reportEvent = this.report(attemptId, {
        workerStatus: "completed",
        summary: "no gate command configured; accepted by policy",
      });
      return { exitCode: null, reportEvent: reportEvent.event_type };
    }
    const outcome = (await runGateCommand(this.effects, {
      worktreeId: attemptId,
      executable: command.executable,
      argv: command.argv_prefix,
      scope: this.projectId,
      callId: `gate:auto:${attemptId}`,
      revision: this.promotions.projectRevision(),
    })) as { exitCode: number | null };
    const exitCode = outcome.exitCode as number | null;
    const passed = exitCode === 0;
    // Evidence-faced settlement (PLMP-ALC-1 §3): the mechanical gate result
    // is the sample; an unknown exit code is not a sample at all.
    if (exitCode !== null) {
      this.#recordAttemptOutcome(attemptId, passed ? "success" : "failure");
    }
    const reportEvent = this.report(attemptId, {
      workerStatus: passed ? "completed" : "failed",
      summary: `${command.executable} ${command.argv_prefix.join(" ")} -> exit ${String(exitCode)}`,
    });
    return { exitCode, reportEvent: reportEvent.event_type };
  }

  /**
   * Drive batches fully automatically: dispatch and execute each created
   * attempt via the command executor until a terminal state (VERIFYING /
   * SATISFIED / FAILED / STALE) or a bounded step count is reached. A
   * failing attempt settles its batch back to READY and the next batch
   * retries — up to the envelope's attempt budget.
   */
  async pumpCommandAttempts(options: {
    maxSteps?: number;
    /** Telemetry attribution applied to every attempt this pump claims (ALC-1 §2). */
    attribution?: AttemptAttribution | undefined;
  } = {}): Promise<{
    lastEvent: SchedulerEvent | null;
    attemptsRun: number;
    exits: (number | null)[];
  }> {
    const maxSteps = options.maxSteps ?? 50;
    const exits: (number | null)[] = [];
    let attemptsRun = 0;
    let event: SchedulerEvent | null = null;
    for (let step = 0; step < maxSteps; step += 1) {
      event = this.step();
      if (event === null) break;
      if (event.event_type === "ATTEMPT_CREATED") {
        const outcome = await this.runAttemptWithCommandExecutor(event.entity_id, options.attribution);
        attemptsRun += 1;
        exits.push(outcome.exitCode);
        continue;
      }
      if (
        event.event_type === "TASK_VERIFYING" ||
        event.event_type === "TASK_SATISFIED" ||
        event.event_type === "TASK_FAILED" ||
        event.event_type === "TASK_STALE"
      ) {
        break;
      }
    }
    // ALC-1 §3: settle-flush at the pump boundary. A failed flush never
    // breaks the orchestration loop - the TLM delta is idempotent (the
    // baseline did not advance) and the failure stays surfaced until the
    // next successful flush.
    try {
      await this.persistTelemetry();
    } catch (error) {
      this.#telemetryError = {
        message: error instanceof Error ? error.message : String(error),
      };
    }
    return { lastEvent: event, attemptsRun, exits };
  }

  // -------------------------------------------------------------------------
  // Promotion and status
  // -------------------------------------------------------------------------

  promote(
    attemptId: string,
    sourceCommit: string,
    expectedHeadCommit: string,
  ): Promise<PromoteResult> {
    return this.promotions.promote({ attemptId, sourceCommit, expectedHeadCommit });
  }

  /** Promotion gated by a registered gate (R8): only a PASS may be promoted. */
  async promoteWhenGatePasses(
    attemptId: string,
    sourceCommit: string,
    expectedHeadCommit: string,
    gateId: string,
  ): Promise<
    | { readonly promoted: true; readonly result: PromoteResult }
    | {
        readonly promoted: false;
        readonly gateId: string;
        readonly verdict: GateResult["verdict"];
        readonly nextEvidenceNeeded: readonly string[];
      }
  > {
    // Fail closed on an unregistered gate: callers that do not want a gate
    // use promote() directly.
    const check = this.evaluateAttemptGate(gateId, attemptId);
    if (check.verdict !== "PASS") {
      return {
        promoted: false,
        gateId,
        verdict: check.verdict,
        nextEvidenceNeeded: check.next_evidence_needed,
      };
    }
    return {
      promoted: true,
      result: await this.promote(attemptId, sourceCommit, expectedHeadCommit),
    };
  }

  /**
   * R5 + R10: the deterministic allocation for one task, calibrated against
   * the current concurrency picture - role slot, hard cap and occupancy -
   * so an allocator's candidate suggestion never exceeds what the P3 slot
   * policy can actually run concurrently.
   */
  allocateFor(
    taskId: string,
    estimates: AllocationEstimates,
  ): { allocation: Allocation; concurrency: AllocationCalibration } {
    const row = this.store.connection
      .prepare("SELECT task_id FROM tasks WHERE project_id=? AND task_id=?")
      .get(this.projectId, taskId);
    if (row === undefined) {
      throw new DomainValidationError("task does not exist");
    }
    const role = this.#taskRole(taskId);
    const runningRoles = this.#runningRoles();
    const occupied = runningRoles.filter((running) => running === role).length;
    const slotOfRole = this.slots.slotOf(role);
    const totalRunning = runningRoles.length;
    const hardCapRemaining = this.slots.hardCapRemaining(totalRunning);
    const concurrentLimit = Math.max(0, Math.min(slotOfRole - occupied, hardCapRemaining));
    return {
      allocation: adjustAllocation(allocate(estimates), {
        estimates,
        candidateLimit: this.policy.candidate_limit,
        stats: this.telemetry.taskTypeAggregate(role),
      }),
      concurrency: {
        role,
        slotOfRole,
        occupied,
        totalRunning,
        hardCap: this.slots.hardCap,
        concurrentLimit,
      },
    };
  }

  /**
   * R9: the full verified -> selected -> gated-promoted chain. Run the
   * tournament over completed candidates, read the winner's result commit,
   * and promote it only when the registered gate passes.
   */
  async selectAndPromoteWhenGatePasses(
    judge: PairwiseJudge,
    gateId: string,
    expectedHeadCommit: string,
  ): Promise<{
    readonly tournament: TournamentResult;
    readonly outcome:
      | { readonly promoted: true; readonly result: PromoteResult }
      | {
          readonly promoted: false;
          readonly gateId: string;
          readonly verdict: GateResult["verdict"];
          readonly nextEvidenceNeeded: readonly string[];
        };
  }> {
    const tournament = await this.selectCandidate(judge);
    if (tournament.winner === undefined) {
      throw new DomainValidationError("no completed candidates to promote");
    }
    const row = this.store.connection
      .prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(this.projectId, tournament.winner) as { report_json: Uint8Array | null } | undefined;
    if (row === undefined || row.report_json === null) {
      throw new DomainValidationError("selected candidate has no attempt report");
    }
    const report = decodeJsonBlob(row.report_json);
    const resultCommit = report.result_commit;
    if (typeof resultCommit !== "string") {
      throw new DomainValidationError("selected candidate has no result commit");
    }
    const outcome = await this.promoteWhenGatePasses(
      tournament.winner,
      resultCommit,
      expectedHeadCommit,
      gateId,
    );
    return { tournament, outcome };
  }

  /**
   * Declare the project's selection judge (H1 spec §3.3): a governed event on
   * the hash-chained log. Re-declaring with the same judge_id bumps version.
   */
  declareJudge(input: {
    judgeId: string;
    kind: "rubric" | "llm" | "manual";
    declaredBy: string;
  }): SchedulerEvent {
    const existing = this.store.connection
      .prepare(
        "SELECT version FROM judge_declarations WHERE project_id=? AND judge_id=?",
      )
      .get(this.projectId, input.judgeId) as { version: number } | undefined;
    const version = (existing?.version ?? 0) + 1;
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "JUDGE_DECLARED",
        payload_version: 1,
        entity_type: "judge",
        entity_id: input.judgeId,
        payload: {
          judge_id: input.judgeId,
          kind: input.kind,
          version,
          declared_by: input.declaredBy,
        },
        causation_id: null,
        correlation_id: `judge:${input.judgeId}`,
        idempotency_key: actionKey("judge-declared-v1", {
          project_id: this.projectId,
          judge_id: input.judgeId,
          version,
        }),
        expected_project_revision: this.promotions.projectRevision(),
      }),
    );
  }

  #declaredJudge(): { judge_id: string; kind: "rubric" | "llm" | "manual"; version: number } {
    const row = this.store.connection
      .prepare(
        "SELECT judge_id, kind, version FROM judge_declarations WHERE project_id=? ORDER BY last_event_id DESC LIMIT 1",
      )
      .get(this.projectId) as
      | { judge_id: string; kind: "rubric" | "llm" | "manual"; version: number }
      | undefined;
    if (row === undefined) {
      throw new DomainValidationError(
        "no selection judge declared: declare one with declareJudge (rubric | llm | manual)",
      );
    }
    return row;
  }

  /**
   * Recursive pairwise tournament over the completed candidates of the
   * current batch (R4), under the project's DECLARED judge (H1 spec §3.3).
   * The judge sees the structured digest as the formal signal and a
   * length-capped, explicitly untrusted worker summary; the full report never
   * leaks. Every decision lands on the log as CANDIDATE_SELECTED.
   */
  async selectCandidate(judge?: PairwiseJudge): Promise<TournamentResult> {
    const declared = this.#declaredJudge();
    const rows = this.store.connection
      .prepare(
        "SELECT attempt_id, report_json FROM attempts WHERE project_id=? AND state='COMPLETED'",
      )
      .all(this.projectId) as Array<{ attempt_id: string; report_json: Uint8Array | null }>;
    if (rows.length === 0) {
      throw new DomainValidationError("no completed candidates to select from");
    }
    const entries: TournamentEntry[] = rows.map((row) => {
      const report = row.report_json === null ? null : decodeJsonBlob(row.report_json);
      const workerStatus = String(report?.worker_status ?? "completed");
      const resultCommit =
        report !== null && typeof report.result_commit === "string" ? report.result_commit : null;
      return {
        id: row.attempt_id,
        view: {
          structured: {
            attempt_id: row.attempt_id,
            worker_status: workerStatus,
            result_commit: resultCommit,
            changed_files: Array.isArray(report?.changed_files) ? report.changed_files.length : 0,
            produced_artifacts: Array.isArray(report?.produced_artifacts)
              ? report.produced_artifacts.length
              : 0,
            duration_ms:
              report !== null &&
              typeof report.started_at === "string" &&
              typeof report.finished_at === "string"
                ? Math.max(0, Date.parse(report.finished_at) - Date.parse(report.started_at))
                : null,
          },
          commentary: judgeCommentary(
            report === null ? null : typeof report.summary === "string" ? report.summary : null,
          ),
        },
      };
    });

    let decision: PairwiseJudge;
    if (declared.kind === "rubric") {
      decision = { compare: (left, right) => rubricCompare(left.view, right.view) };
    } else {
      // llm / manual: the host supplies the decision maker; the declaration
      // alone never picks a winner.
      if (judge === undefined) {
        throw new DomainValidationError(
          `declared judge '${declared.judge_id}' (${declared.kind}) requires a host-supplied decision`,
        );
      }
      decision = judge;
    }

    const result = await runTournament(entries, decision);
    const replayable = declared.kind === "rubric";
    const winner = result.winner ?? null;
    this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "CANDIDATE_SELECTED",
        payload_version: 1,
        entity_type: "selection",
        entity_id: winner ?? "none",
        payload: {
          task_id: null,
          candidates: entries.map((entry) => entry.id),
          rounds: result.rounds,
          judge: { id: declared.judge_id, kind: declared.kind, replayable },
          winner,
          entries_digest: canonicalDigest(
            entries.map((entry) => ({ id: entry.id, view: entry.view })),
          ),
        },
        causation_id: null,
        correlation_id: `selection:${this.projectId}`,
        idempotency_key: actionKey("candidate-selected-v1", {
          project_id: this.projectId,
          candidates: entries.map((entry) => entry.id).join(","),
          judge_id: declared.judge_id,
          judge_version: declared.version,
        }),
        expected_project_revision: this.promotions.projectRevision(),
      }),
    );
    return result;
  }

  status(): ControllerStatusView {
    const project = this.#project();
    const control = this.store.connection
      .prepare("SELECT state, generation FROM scheduler_control WHERE project_id=?")
      .get(this.projectId) as { state: "RUNNING" | "PAUSED"; generation: number } | undefined;
    if (control === undefined) {
      throw new DomainValidationError("scheduler control projection is missing");
    }
    const roles = new Map<string, string>();
    for (const task of project.tasks) {
      if (task.role !== undefined) roles.set(task.task_id, task.role);
    }
    const tasks = (
      this.store.connection
        .prepare("SELECT task_id, state, last_event_id FROM tasks WHERE project_id=?")
        .all(this.projectId) as Array<Record<string, unknown>>
    ).map((row) => {
      const taskId = String(row.task_id);
      return {
        task_id: taskId,
        state: String(row.state),
        last_event_id: Number(row.last_event_id),
        ...(roles.has(taskId) ? { role: roles.get(taskId) as string } : {}),
      };
    });
    const attempts = (
      this.store.connection
        .prepare(
          "SELECT attempt_id, task_id, state, state_json FROM attempts WHERE project_id=? ORDER BY last_event_id ASC",
        )
        .all(this.projectId) as Array<Record<string, unknown>>
    ).map((row) => {
      const state = decodeJsonBlob(row.state_json);
      return {
        attempt_id: String(row.attempt_id),
        task_id: row.task_id === null ? null : String(row.task_id),
        state: String(row.state),
        attempt_no:
          typeof state.attempt_no === "number" ? state.attempt_no : null,
      };
    });
    const evidence = (
      this.store.connection
        .prepare("SELECT evidence_id, status FROM evidence WHERE project_id=?")
        .all(this.projectId) as Array<Record<string, unknown>>
    ).map((row) => ({
      evidence_id: String(row.evidence_id),
      status: String(row.status),
    }));
    const promotions = (
      this.store.connection
        .prepare("SELECT promotion_id, state FROM promotions WHERE project_id=?")
        .all(this.projectId) as Array<Record<string, unknown>>
    ).map((row) => ({
      promotion_id: String(row.promotion_id),
      state: String(row.state),
    }));
    return {
      projectId: this.projectId,
      revision: project.revision,
      headCommit: project.head_commit,
      schedulerState: control.state,
      generation: control.generation,
      tasks,
      attempts,
      evidence,
      promotions,
      parallel: {
        admittedAttempts: this.budget.admitted,
        rejectedClaims: this.budget.rejected,
      },
      resume: {
        ...this.#resumeOverview(),
        preparedPromotions: this.#preparedPromotionIds(),
      },
    };
  }

  /**
   * E3: the cross-session resume block. Read-only (uses scheduler.decide, so
   * it never appends). Answers, in user language, "where is the project and
   * what should the host do next" — the "继续" entry point after any crash or
   * session close.
   */
  #preparedPromotionIds(): string[] {
    const rows = this.store.connection
      .prepare(
        "SELECT promotion_id FROM promotions WHERE project_id=? AND state IN ('PREPARED','GIT_STARTED')",
      )
      .all(this.projectId) as Array<{ promotion_id: string }>;
    return rows.map((row) => String(row.promotion_id));
  }

  #resumeOverview(): Omit<ControllerStatusView["resume"], "preparedPromotions"> {
    const control = this.store.connection
      .prepare("SELECT state FROM scheduler_control WHERE project_id=?")
      .get(this.projectId) as { state: string } | undefined;
    if (control?.state === "PAUSED") {
      return {
        action: "paused",
        detail: "the scheduler is paused; resume it to continue",
        inFlightAttemptIds: [],
        openTasks: [],
      };
    }
    const taskRows = this.store.connection
      .prepare("SELECT task_id, state FROM tasks WHERE project_id=?")
      .all(this.projectId) as Array<{ task_id: string; state: string }>;
    const openTasks = taskRows
      .filter((row) => !["SATISFIED", "FAILED"].includes(String(row.state)))
      .map((row) => ({ task_id: String(row.task_id), state: String(row.state) }));
    const inFlightAttemptIds = (
      this.store.connection
        .prepare(
          "SELECT attempt_id FROM attempts WHERE project_id=? AND state IN ('LEASED','RUNNING')",
        )
        .all(this.projectId) as Array<{ attempt_id: string }>
    ).map((row) => String(row.attempt_id));

    let decision: ReturnType<Scheduler["decide"]> = null;
    let blocked: string | null = null;
    try {
      decision = this.scheduler.decide();
    } catch (error) {
      // The scheduler refuses to advance (e.g. an ACTIVE task authorized under
      // an older project revision — R2 stale input world). That is the correct
      // fail-closed stance for committing, but pure observation (status) must
      // not crash: surface the block honestly instead.
      blocked = (error as Error).message;
    }
    if (blocked !== null) {
      return {
        action: "blocked",
        detail: `the scheduler cannot advance: ${blocked}`,
        inFlightAttemptIds,
        openTasks,
      };
    }
    if (decision !== null) {
      return {
        action: decision.event_type === "ATTEMPT_CREATED" ? "dispatch_worker" : "progress",
        detail: `${decision.event_type} ${decision.entity_id}`,
        inFlightAttemptIds,
        openTasks,
      };
    }
    if (openTasks.length === 0) {
      return {
        action: "idle",
        detail: "no unresolved work — the project is complete or failed",
        inFlightAttemptIds,
        openTasks,
      };
    }
    if (openTasks.some((task) => task.state === "VERIFYING")) {
      return {
        action: "gate_and_promote",
        detail: "a verified batch awaits a gate verdict, then promotion",
        inFlightAttemptIds,
        openTasks,
      };
    }
    if (inFlightAttemptIds.length > 0) {
      return {
        action: "awaiting_worker",
        detail:
          "attempts are claimed but not resolved; resume them or they will be recorded stale",
        inFlightAttemptIds,
        openTasks,
      };
    }
    return {
      action: "dispatch_worker",
      detail: "unresolved work needs a worker to claim and complete it",
      inFlightAttemptIds,
      openTasks,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Role of a task by id (absent role means implementer). */
  #taskRole(taskId: string): TaskRole {
    const project = this.#project();
    return project.tasks.find((item) => item.task_id === taskId)?.role ?? "implementer";
  }

  /** Role of the task owning this attempt (absent role means implementer). */
  #roleOf(attemptId: string): TaskRole {
    const row = this.store.connection
      .prepare("SELECT task_id FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(this.projectId, attemptId) as { task_id: string } | undefined;
    if (row === undefined) {
      throw new DomainValidationError("attempt does not exist");
    }
    const project = this.#project();
    const task = project.tasks.find((item) => item.task_id === row.task_id);
    return task?.role ?? "implementer";
  }

  /**
   * Settle one telemetry sample from an evidence-faced outcome (ALC-1 §3).
   * Each attempt settles at most once: the attribution is consumed here, so
   * later gate evaluations on the same attempt cannot double-count.
   */
  #recordAttemptOutcome(attemptId: string, outcome: "success" | "failure"): void {
    const attribution = this.#attemptAttribution.get(attemptId);
    if (attribution === undefined) return;
    this.#attemptAttribution.delete(attemptId);
    this.telemetry.record({
      task_type: attribution.taskType ?? this.#roleOf(attemptId),
      model: attribution.model,
      outcome,
      cost: attribution.cost ?? 0,
    });
  }

  /** Roles of attempts still occupying a slot (CREATED/LEASED/RUNNING). */
  #runningRoles(): TaskRole[] {
    // Only claimed attempts (LEASED/RUNNING) occupy a slot; CREATED
    // candidates are created by the scheduler but not yet running.
    const rows = this.store.connection
      .prepare(
        "SELECT task_id FROM attempts WHERE project_id=? AND state IN ('LEASED','RUNNING')",
      )
      .all(this.projectId) as Array<{ task_id: string }>;
    const project = this.#project();
    const roles = new Map<string, TaskRole>();
    for (const task of project.tasks) {
      roles.set(task.task_id, task.role ?? "implementer");
    }
    return rows.map((row) => roles.get(row.task_id) ?? "implementer");
  }

  #project(): ProjectIr {
    const row = this.store.connection
      .prepare("SELECT state_json FROM projects WHERE project_id=?")
      .get(this.projectId) as { state_json: Uint8Array } | undefined;
    if (row === undefined) {
      throw new DomainValidationError("project does not exist");
    }
    return parseProjectIr(decodeJsonBlob(row.state_json));
  }

  #attemptContext(attemptId: string): [Record<string, unknown>, TaskEnvelope] {
    const row = this.store.connection
      .prepare("SELECT * FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(this.projectId, attemptId) as Record<string, unknown> | undefined;
    if (row === undefined) {
      throw new DomainValidationError("attempt does not exist");
    }
    const task = this.store.connection
      .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(this.projectId, String(row.task_id)) as { envelope_json: Uint8Array } | undefined;
    if (task === undefined) {
      throw new DomainValidationError("task does not exist");
    }
    return [row, parseTaskEnvelope(decodeJsonBlob(task.envelope_json))];
  }

  async close(): Promise<void> {
    await this.effects.close();
  }
}

export function decodeJsonBlob(raw: unknown): Record<string, unknown> {
  if (!(raw instanceof Uint8Array)) {
    throw new DomainValidationError("projection JSON must be stored as BLOB bytes");
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(raw));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DomainValidationError("projection JSON must be an object");
  }
  return value as Record<string, unknown>;
}

/** Build a ProjectIR with a correct canonical digest (revision 0 or child). */
export function buildProjectIr(input: {
  projectId: string;
  revision?: number | undefined;
  parentRevision?: number | null | undefined;
  parentDigest?: string | null | undefined;
  goal: string;
  requirements: readonly Requirement[];
  decisions: readonly Decision[];
  tasks: readonly TaskSpec[];
  headCommit: string;
  committedAt: string;
}): ProjectIr {
  const revision = input.revision ?? 0;
  const data = {
    schema_version: 1 as const,
    project_id: input.projectId,
    revision,
    parent_revision:
      revision === 0 ? null : (input.parentRevision ?? 0),
    parent_digest:
      revision === 0 ? null : (input.parentDigest ?? null),
    goal: input.goal,
    requirements: [...input.requirements],
    decisions: [...input.decisions],
    tasks: [...input.tasks],
    head_commit: input.headCommit,
    committed_at: canonicalDatetime(input.committedAt),
  };
  return {
    ...data,
    digest: canonicalDigest(data),
  } as unknown as ProjectIr;
}

void attemptReportDigestOf;
