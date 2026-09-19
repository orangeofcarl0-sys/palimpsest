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

import { randomUUID } from "node:crypto";

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
  type NewEvent,
  type ProjectIr,
  type Requirement,
  type SchedulerEvent,
  type TaskEnvelope,
  type TaskSpec,
} from "../schema/index.js";
import { DomainValidationError } from "../domain/errors.js";
import {
  compilePlanRevision,
  type PlanReconciliationBlocker,
  type PlanReconciliationBlockerKind,
  type PlanRevisionReconciliation,
  type ReconcileAttemptRow,
  type ReconcileTaskRow,
} from "../domain/plan_reconciliation.js";
import {
  compileProjectHeadReconciliation,
  ProjectHeadError,
  type ProjectHeadReconciliationCandidate,
  type ProjectHeadState,
  type ProjectHeadStatus,
} from "../domain/project_head.js";
import {
  assessCoverage,
  buildContextManifest,
  compileContextBrief,
  compileContextRequirement,
  cosineSimilarity,
  type ContextBrief,
  type ContextManifest,
  type ContextDistribution,
  type CoverageAssessment,
} from "../context/index.js";
import { distributeContext } from "../context/distribution.js";
import { RoleSlotPolicy, BudgetLedger } from "./parallel.js";
import {
  compileEvidenceInvalidation,
  computeInvalidationSet,
  type ActiveWorkEvidence,
  type ChangeClass,
  type EvidenceInvalidationPlan,
} from "../evidence/invalidation.js";
import { GateEngine, type GateDefinition, type GateResult } from "../evidence/gate_dsl.js";
import { compilePromotionFenceBlocker } from "../domain/promotion_eligibility.js";
import type { PromotionEligibilityAssessment } from "../domain/promotion_eligibility.js";
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
import type { DependencyEdge } from "../evidence/invalidation.js";
import type { TaskRole } from "../schema/index.js";
import { EventStore } from "../state/index.js";
import { Scheduler } from "../scheduler/index.js";
import {
  buildOrchestrationGraph,
  type OrchestrationGraph,
} from "./graph.js";
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
  /** PLMP-SCHED-1: optional declared stage graph (e.g. latch concurrency);
   * absent means the verbatim genesis pipeline. */
  stageGraph?: StageGraphDefinition | undefined;
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

/**
 * G10-X TRUSTED-ONLY revision options. This is deliberately NOT part of the
 * agent-facing `PlanInput` surface: an agent can never name a head. The head
 * advance is derived by the promotion manager's canonical chain and is
 * re-validated here against the same derivation, so `headAdvance` is a
 * redundant proof of a fact the controller already owns - never a free choice.
 */
export interface TrustedPlanOptions {
  readonly headAdvance?:
    | {
        /** The backing PROMOTION_COMMITTED event ref (the canonical chain tip). */
        readonly fromPromotionEventId: string;
        /** The canonically proven effect head. */
        readonly toHead: string;
      }
    | undefined;
}

/** G10-X: the outcome of one mechanical head reconciliation. */
export interface ProjectHeadReconciliationResult {
  readonly status: "reconciled" | "in_sync" | "blocked";
  readonly revision?: number;
  readonly fromHead: string;
  readonly toHead: string;
  readonly blockers: readonly string[];
}

/** The additive read-back of one reconciled plan revision. */
export interface PlanReconciliationOutcome {
  /** The committed PROJECT_REVISED event (the batch's centerpiece). */
  readonly event: SchedulerEvent;
  /** The pure reconciliation the batch was compiled from (diffs + basis). */
  readonly reconciliation: PlanRevisionReconciliation;
  readonly result: {
    readonly revision: number;
    readonly digest: string;
    readonly retainedReauthorized: readonly string[];
    readonly added: readonly string[];
    readonly removedStaled: readonly string[];
    readonly blocked: readonly string[];
  };
}

/**
 * Fail-closed plan-revision blocker. Nothing is written before this is thrown
 * (the reconciliation is pure), so a caller that receives it knows the work
 * graph is byte-for-byte unchanged.
 */
export class PlanReconciliationError extends DomainValidationError {
  readonly kind: PlanReconciliationBlockerKind;
  readonly refs: readonly string[];

  constructor(blocker: PlanReconciliationBlocker) {
    super(
      `plan revision blocked (${blocker.kind}): ${blocker.detail} [refs: ${blocker.refs.join(", ")}]`,
    );
    this.name = "PlanReconciliationError";
    this.kind = blocker.kind;
    this.refs = [...blocker.refs];
  }
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

/**
 * G9-F2 (§4-5, VIEW-INV-5): runtime validation + internal-ownership snapshot
 * for host-supplied attribution. JSON input is never trusted to TypeScript
 * typing: unknown fields are rejected and the returned value is a FRESH
 * plain object, so controller-owned graph state never retains a
 * caller-mutable alias. Public semantics stay exactly the three declared
 * fields - nothing is widened.
 */
export function parseAttemptAttribution(value: unknown): AttemptAttribution {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DomainValidationError("attribution must be an object");
  }
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (key !== "model" && key !== "cost" && key !== "taskType") {
      throw new DomainValidationError(`attribution: unknown field '${key}'`);
    }
  }
  if (typeof raw.model !== "string" || raw.model.length === 0) {
    throw new DomainValidationError("attribution.model must be a non-empty string");
  }
  const snapshot: AttemptAttribution = { model: raw.model };
  if (raw.cost !== undefined) {
    if (typeof raw.cost !== "number" || !Number.isFinite(raw.cost) || raw.cost < 0) {
      throw new DomainValidationError("attribution.cost must be a finite number >= 0");
    }
    snapshot.cost = raw.cost;
  }
  if (raw.taskType !== undefined) {
    if (typeof raw.taskType !== "string" || raw.taskType.length === 0) {
      throw new DomainValidationError("attribution.taskType must be a non-empty string");
    }
    snapshot.taskType = raw.taskType;
  }
  return snapshot;
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
  /** ALC-1 §2: per-attempt telemetry attribution, consumed at settlement.
   * Spec 35 (VIEW-INV-1/3): this map is GRAPH-VISIBLE controller-process
   * volatile state - it feeds buildOrchestrationGraph but is not an event-log
   * projection. Every graph-visible mutation bumps #viewGeneration so the
   * polling fast path cannot lie about freshness. */
  #attemptAttribution = new Map<string, AttemptAttribution>();

  /** Spec 35 §2.1, G9-F2 §7-8: a FULL 128-bit per-process nonce - a restart
   * invalidates every viewCursor the previous process handed out (the
   * volatile map dies with the process while the event cursor stays put, so
   * cross-process cursor equality cannot mean equal views). Honest strength
   * wording: accidental cross-process equality is cryptographically
   * NEGLIGIBLE, not mathematically impossible. */
  readonly #viewEpoch = randomUUID();

  /** Monotonic generation of graph-visible volatile view state (attribution
   * set/delete). NOT bumped for state that never reaches the graph. */
  #viewGeneration = 0;

  #graphBuilds = 0;

  /** ALC-1 §3: the pending auto-flush failure, if any (cleared on the next successful flush). */
  telemetryPendingError(): string | undefined {
    return this.#telemetryError?.message;
  }

  /** TLM-1 r2: append the memory table's new deltas to the shared timeline. */
  async persistTelemetry(): Promise<void> {
    // Fresh-process baseline: this process's records are ALL new deltas - the
    // durable aggregate must not be subtracted from them (r2 semantics fix).
    this.#telemetrySync ??= TelemetryStateSync.fresh(this.effects.state);
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
    // PLMP-SCHED-1: validate the declared stage graph BEFORE anything is
    // appended - a bad declaration must not leave a half-started project.
    const declaredGraph = parseStageGraphDefinition(input.stageGraph ?? DEFAULT_STAGE_GRAPH);
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
    // declared verbatim (H1 §3.4 D-3) unless the caller declares its own.
    this.declareStageGraph(declaredGraph, 1);
    for (const task of input.tasks) {
      this.scheduler.registerTask(this.policy.authorize(project, task.task_id));
    }
    return created;
  }

  /**
   * PLMP-DEBUG-1: task-level breakpoint. The hold is a scheduling gate, not
   * a task state - the task keeps its state, the ledger keeps the audit.
   * PLMP-GRAPH-4 (30 号规格): the hold anchors to (project_revision, task_id)
   * - a hold set at revision N goes stale when the plan revises, instead of
   * mis-attaching to whatever semantic task later reuses the task_id.
   */
  setHold(taskId: string, input: { reason: string; declaredBy: string }): SchedulerEvent {
    const project = this.#project();
    if (project.tasks.every((task) => task.task_id !== taskId)) {
      throw new DomainValidationError("task is not declared by ProjectIR");
    }
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "HOLD_SET",
        payload_version: 1,
        entity_type: "task",
        entity_id: taskId,
        payload: {
          task_id: taskId,
          reason: input.reason,
          declared_by: input.declaredBy,
          project_revision: project.revision,
        },
        causation_id: null,
        correlation_id: `task:${taskId}`,
        idempotency_key: actionKey("task-hold-v1", {
          project_id: this.projectId,
          task_id: taskId,
          reason: input.reason,
        }),
        expected_project_revision: this.promotions.projectRevision(),
      }),
    );
  }

  clearHold(taskId: string, input: { reason: string }): SchedulerEvent {
    const row = this.store.connection
      .prepare("SELECT 1 AS ok FROM task_holds WHERE project_id=? AND task_id=?")
      .get(this.projectId, taskId);
    if (row === undefined) {
      throw new DomainValidationError("task is not held");
    }
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "HOLD_CLEARED",
        payload_version: 1,
        entity_type: "task",
        entity_id: taskId,
        payload: {
          task_id: taskId,
          reason: input.reason,
        },
        causation_id: null,
        correlation_id: `task:${taskId}`,
        idempotency_key: actionKey("task-hold-clear-v1", {
          project_id: this.projectId,
          task_id: taskId,
          reason: input.reason,
        }),
        expected_project_revision: this.promotions.projectRevision(),
      }),
    );
  }

  /**
   * Emit a new ProjectIR revision (palimpsest_plan).
   *
   * Signature and return are unchanged, but the semantics are now the revision
   * contract: a revision either commits the COMPLETE structural closure as ONE
   * atomic batch (stale removed tasks, stale the typed-invalidation set, revise,
   * reauthorize retained tasks, register added tasks) or it throws a typed
   * `PlanReconciliationError` and writes ZERO events. There is no fallback:
   *
   *   - without `changeClass`/`changedIds` the project must be quiescent (no
   *     ACTIVE/VERIFYING task, no open CREATED/LEASED/RUNNING attempt);
   *   - with them, exactly the affected tasks are settled by staling them
   *     inside the same batch, and any UNaffected in-flight work still blocks.
   */
  plan(input: PlanInput): SchedulerEvent {
    return this.planReconciled(input).event;
  }

  /**
   * Revision-safe Work evolution: compile the complete structural closure for
   * a plan revision (pure, via `compilePlanRevision`), refuse it fail-closed
   * when it cannot be honest, and otherwise commit it as ONE `appendAtomic`
   * batch in a deterministic order:
   *
   *   1. TASK_STALE       for each removed runnable task (and each typed-invalidation task)
   *   2. EVIDENCE_STALE   for each Work Evidence item those tasks' retirement revokes
   *   3. PROJECT_REVISED
   *   4. TASK_REAUTHORIZED for each retained task (fresh envelope on the new head)
   *   5. TASK_CREATED     for each added task
   *
   * Nothing is written when a blocker is present - not a partial closure, not a
   * single-event legacy closure. Typed invalidation (`changeClass`/`changedIds`)
   * is an EXPLICIT settlement act: the tasks it stales ride INSIDE the same
   * batch, so those tasks (and their open attempts) no longer block quiescence;
   * any in-flight work outside the affected set still does.
   *
   * G10-Y: the retirement of a task and the revocation of the Evidence that gave
   * its work gate authority are ONE durable transition. The stale events are
   * compiled before the batch opens and appended inside it, so a crash can only
   * expose the complete old world (with its evidence still active) or the
   * complete new world (with the retired work's evidence revoked) - never a new
   * ProjectIR still backed by authority from the superseded one.
   */
  planReconciled(input: PlanInput, trusted: TrustedPlanOptions = {}): PlanReconciliationOutcome {
    const current = this.#project();
    const revision = current.revision + 1;
    // G10-X: a TRUSTED-ONLY head advance. Without it the head is unchanged
    // (every existing caller keeps byte-identical behaviour); with it the new
    // ProjectIR carries the canonically proven effect head and the retained
    // READY/BLOCKED tasks are reauthorized onto that base inside the SAME
    // atomic batch. The advance is validated against the canonical derivation,
    // so a caller cannot mint a head of its own choosing.
    const nextHeadCommit = this.#validatedHeadAdvance(current, trusted.headAdvance);
    const data = {
      project_id: this.projectId,
      revision,
      parent_revision: current.revision,
      parent_digest: current.digest,
      goal: input.goal ?? current.goal,
      requirements: input.requirements ? [...input.requirements] : current.requirements,
      decisions: input.decisions ? [...input.decisions] : current.decisions,
      tasks: [...input.tasks],
      head_commit: nextHeadCommit,
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

    const reconcileTasks: ReconcileTaskRow[] = (
      this.store.connection
        .prepare("SELECT task_id, state, envelope_json FROM tasks WHERE project_id=?")
        .all(this.projectId) as Array<Record<string, unknown>>
    ).map((row) => ({
      taskId: String(row.task_id),
      state: String(row.state),
      envelope:
        row.envelope_json === null || row.envelope_json === undefined
          ? null
          : parseTaskEnvelope(decodeJsonBlob(row.envelope_json)),
    }));
    const openAttempts: ReconcileAttemptRow[] = (
      this.store.connection
        .prepare(
          "SELECT attempt_id, task_id, state FROM attempts WHERE project_id=? AND state IN ('CREATED','LEASED','RUNNING')",
        )
        .all(this.projectId) as Array<Record<string, unknown>>
    ).map((row) => ({
      attemptId: String(row.attempt_id),
      taskId: String(row.task_id),
      state: String(row.state),
    }));

    // Typed invalidation is an explicit operator act: it names the tasks whose
    // in-flight work this revision settles by staling them in the batch. Only
    // those exact tasks stop blocking quiescence; everything else in flight
    // (ANY ACTIVE/VERIFYING task, ANY open attempt outside the set) still fails
    // closed with `quiescence_required`. A same-id meaning change always blocks
    // (`replacement_task_id_required`): settlement is not a lineage protocol.
    const affected =
      input.changeClass === undefined
        ? []
        : this.#invalidationAffected({
            changeClass: input.changeClass,
            changedIds: input.changedIds ?? input.tasks.map((task) => task.task_id),
            from: current.revision,
            to: revision,
            project,
          });
    const stateOf = new Map(reconcileTasks.map((row) => [row.taskId, row.state]));
    const settledTaskIds = affected.filter((taskId) => {
      const state = stateOf.get(taskId);
      return state !== undefined && state !== "STALE" && state !== "FAILED" && state !== "SATISFIED";
    });

    const reconciliation = compilePlanRevision({
      current,
      next: project,
      tasks: reconcileTasks,
      openAttempts,
      policy: this.policy,
      settledTaskIds,
    });

    // G10-Z §23/§24/§25: the PROMOTION FENCE, checked BEFORE the generic
    // reconciliation blockers so the most specific reason is reported. The set is
    // computed pre-compile as a SUPERSET of what this revision could retire (the
    // typed-invalidation settlement set plus every non-terminal task the new
    // ProjectIR drops), so a fence can never be bypassed by a blocker that
    // happened to be reported first. Typed invalidation's settlement bypass does
    // NOT cross it: the fence is evaluated on the resulting set, not the input.
    const terminalStates = new Set(["SATISFIED", "FAILED", "STALE"]);
    const nextTaskIds = new Set(project.tasks.map((task) => task.task_id));
    const wouldRetire = [
      ...settledTaskIds,
      ...reconcileTasks
        .filter((row) => !terminalStates.has(row.state) && !nextTaskIds.has(row.taskId))
        .map((row) => row.taskId),
    ];
    const fence = compilePromotionFenceBlocker(this.promotions.promotionFenceRows(), wouldRetire);
    if (fence !== undefined) {
      throw new PlanReconciliationError(fence);
    }

    const firstBlocker = reconciliation.blocked[0];
    if (firstBlocker !== undefined) {
      throw new PlanReconciliationError(firstBlocker);
    }

    const requests: NewEvent[] = [];
    const staled = new Set<string>();

    for (const taskId of reconciliation.removedStaled) {
      requests.push(
        this.#taskStaleRequest(
          taskId,
          `plan revision ${revision}: task is not declared by the new ProjectIR`,
        ),
      );
      staled.add(taskId);
    }
    const typedReason =
      input.changeClass === undefined
        ? ""
        : `typed invalidation (${input.changeClass}) on revision ${revision}`;
    for (const taskId of settledTaskIds) {
      if (staled.has(taskId)) continue;
      requests.push(this.#taskStaleRequest(taskId, typedReason));
      staled.add(taskId);
    }

    // G10-Z §23/§24/§25: the PROMOTION FENCE. `staled` is now the exact set of
    // tasks this revision would retire - by removal, by typed invalidation, or
    // by both. A task that owns an unresolved external promotion effect cannot
    // be among them: the external effect's authority basis must settle first.
    // Typed invalidation's settlement bypass does NOT cross this fence, because
    // the fence is evaluated on the resulting set rather than on the input.
    // G10-Z §26: head-drift ordering. A committed promotion effect that has not
    // been reconciled into the ProjectIR head leaves the canonical expected head
    // ahead of this revision's base. A MEANING-CHANGING revision on that base
    // would anchor new/retained Work on a superseded base (and, under Z's
    // same-base eligibility rule, produce work that cannot be promoted until the
    // sync happens). The supported order is effect -> Work settlement -> head
    // sync -> meaning change, so the revision is refused with `head_sync_required`
    // and ZERO writes. The trusted head reconciliation itself still passes
    // (it carries `headAdvance` and is head-only, so it is not meaning-changing).
    if (trusted.headAdvance === undefined && this.#isMeaningChanging(reconciliation, input)) {
      const headStatus = this.promotions.projectHeadStatusSync();
      if (headStatus.state === "SYNC_REQUIRED") {
        throw new PlanReconciliationError({
          kind: "head_sync_required",
          detail:
            "the canonical promotion head has advanced past the ProjectIR head; reconcile the project head before a meaning-changing revision",
          refs: [headStatus.projectHeadCommit, headStatus.provenEffectHeadCommit],
        });
      }
    }

    // G10-Y: the tasks this batch retires also lose the Work Evidence that
    // granted gate authority to their old work. The plan is compiled from the
    // pre-mutation projection and its events are appended BEFORE the revision
    // bump: revoking authority over the OLD world is part of retiring it, so it
    // commits in the SAME transaction as the revision closure. There is no
    // post-commit repair and therefore no window in which a committed new world
    // is still backed by old authority.
    const evidenceInvalidation = this.#compileEvidenceInvalidation({
      current,
      revision,
      changeClass: input.changeClass ?? null,
      retiredTaskIds: [...staled],
    });
    for (const evidenceId of evidenceInvalidation.evidenceIds) {
      requests.push(
        this.#evidenceStaleRequest({
          evidenceId,
          reason: evidenceInvalidation.reason,
          fromRevision: current.revision,
          toRevision: revision,
          changeClass: input.changeClass ?? null,
          expectedProjectRevision: current.revision,
        }),
      );
    }

    const promotionId = stableEntityId(
      "plan",
      actionKey("plan-revision-v1", { project_id: this.projectId, revision }),
    );
    requests.push(
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

    const retainedIds: string[] = [];
    for (const envelope of reconciliation.retainedReauthorized) {
      if (staled.has(envelope.task_id)) continue;
      retainedIds.push(envelope.task_id);
      requests.push(
        parseNewEvent({
          schema_version: 1,
          project_id: this.projectId,
          event_type: "TASK_REAUTHORIZED",
          payload_version: 1,
          entity_type: "task",
          entity_id: envelope.task_id,
          payload: {
            task_envelope: envelope,
            policy_id: this.policy.policy_id,
            policy_digest: this.policy.digest,
          },
          causation_id: null,
          correlation_id: `task:${envelope.task_id}:reauthorized`,
          idempotency_key: envelope.idempotency_key,
          expected_project_revision: envelope.project_revision,
        }),
      );
    }

    const addedIds: string[] = [];
    for (const entry of reconciliation.added) {
      addedIds.push(entry.taskId);
      requests.push(
        parseNewEvent({
          schema_version: 1,
          project_id: this.projectId,
          event_type: "TASK_CREATED",
          payload_version: 1,
          entity_type: "task",
          entity_id: entry.taskId,
          payload: {
            task_envelope: entry.envelope,
            initial_state: entry.initial,
            policy_id: this.policy.policy_id,
            policy_digest: this.policy.digest,
          },
          causation_id: null,
          correlation_id: `task:${entry.taskId}`,
          idempotency_key: entry.envelope.idempotency_key,
          expected_project_revision: entry.envelope.project_revision,
        }),
      );
    }

    const events = this.store.appendAtomic(requests, {
      ...(input.committedAt === undefined ? {} : { committedAt: input.committedAt }),
    });
    const revised = events.find((event) => event.event_type === "PROJECT_REVISED");
    if (revised === undefined) {
      throw new DomainValidationError("plan reconciliation did not commit PROJECT_REVISED");
    }
    return Object.freeze({
      event: revised,
      reconciliation,
      result: Object.freeze({
        revision,
        digest: project.digest,
        retainedReauthorized: Object.freeze(retainedIds),
        added: Object.freeze(addedIds),
        removedStaled: Object.freeze([...reconciliation.removedStaled]),
        blocked: Object.freeze([]) as readonly string[],
      }),
    });
  }

  /**
   * G10-X TRUSTED-ONLY head advance validation. Returns the next ProjectIR head
   * commit: unchanged when no advance was requested, else the canonically
   * proven effect head - but only after proving (against the promotion
   * manager's own derivation and the backing PROMOTION_COMMITTED event) that
   * the caller is not choosing a head. Anything else fails closed with
   * `caller_head_not_canonical` and zero writes.
   */
  #validatedHeadAdvance(
    current: ProjectIr,
    advance: TrustedPlanOptions["headAdvance"],
  ): string {
    if (advance === undefined) return current.head_commit;
    const refuse = (message: string, refs: readonly string[]): never => {
      throw new ProjectHeadError("caller_head_not_canonical", message, refs);
    };
    const status = this.promotions.projectHeadStatusSync();
    if (status.state !== "SYNC_REQUIRED") {
      refuse(
        `head advance refused: the canonical head state is ${status.state}, not SYNC_REQUIRED`,
        [status.projectHeadCommit, status.provenEffectHeadCommit],
      );
    }
    if (status.projectHeadCommit !== current.head_commit) {
      refuse(
        `head advance refused: the project head changed under the revision (${current.head_commit} -> ${status.projectHeadCommit})`,
        [current.head_commit, status.projectHeadCommit],
      );
    }
    const canonical = this.promotions.canonicalExpectedHeadSync();
    if (advance.toHead !== canonical || advance.toHead !== status.provenEffectHeadCommit) {
      refuse(
        `head advance refused: toHead ${advance.toHead} is not the canonical proven effect head ${canonical}`,
        [advance.toHead, canonical],
      );
    }
    if (
      status.latestPromotionEventRef === null ||
      advance.fromPromotionEventId !== status.latestPromotionEventRef
    ) {
      refuse(
        `head advance refused: fromPromotionEventId ${advance.fromPromotionEventId} is not the canonical chain tip`,
        [advance.fromPromotionEventId],
      );
    }
    const eventId = Number(advance.fromPromotionEventId);
    const backing = Number.isInteger(eventId) ? this.store.getEvent(eventId) : undefined;
    if (
      backing === undefined ||
      backing.event_type !== "PROMOTION_COMMITTED" ||
      String(backing.payload.resulting_head_commit) !== advance.toHead ||
      String(backing.payload.expected_head_commit) !== current.head_commit
    ) {
      refuse(
        `head advance refused: promotion event ${advance.fromPromotionEventId} does not back ${current.head_commit} -> ${advance.toHead}`,
        [advance.fromPromotionEventId],
      );
    }
    return advance.toHead;
  }

  /** The pure head-reconciliation proposal (no writes). */
  #headReconciliationCandidate(): ProjectHeadReconciliationCandidate {
    const project = this.#project();
    const status = this.promotions.projectHeadStatusSync();
    const tasks = (
      this.store.connection
        .prepare("SELECT task_id, state FROM tasks WHERE project_id=?")
        .all(this.projectId) as Array<Record<string, unknown>>
    ).map((row) => ({ taskId: String(row.task_id), state: String(row.state) }));
    const openAttempts = (
      this.store.connection
        .prepare(
          "SELECT attempt_id, task_id, state FROM attempts WHERE project_id=? AND state IN ('CREATED','LEASED','RUNNING')",
        )
        .all(this.projectId) as Array<Record<string, unknown>>
    ).map((row) => ({
      attemptId: String(row.attempt_id),
      taskId: String(row.task_id),
      state: String(row.state),
    }));
    return compileProjectHeadReconciliation({
      project,
      status,
      tasks,
      openAttempts,
      promotions: this.promotions.promotionFactsSync(),
    });
  }

  /**
   * G10-X: the provenance of the canonical head - the chained promotion fact
   * named by the status (the absorbed tip when IN_SYNC). Derived from the
   * committed promotion facts only, never from `git.head()`.
   */
  #latestHeadPromotion(
    status: ProjectHeadStatus,
  ): {
    promotionId: string;
    attemptId: string;
    sourceCommit: string;
    fromHead: string;
    toHead: string;
    eventId: string;
  } | null {
    const ref = status.latestPromotionEventRef;
    if (ref === null) return null;
    const fact = this.promotions.promotionFactsSync().find((entry) => entry.eventId === ref);
    if (fact === undefined) return null;
    return {
      promotionId: fact.promotionId,
      attemptId: fact.attemptId,
      sourceCommit: fact.sourceCommit,
      fromHead: fact.expectedHeadCommit,
      toHead: fact.resultingHeadCommit,
      eventId: fact.eventId,
    };
  }

  /**
   * G10-X: the MANAGE/DELEGATE-appropriate mechanical consistency step. Derive
   * the head status, compile the pure candidate, and - only when it is
   * compilable - advance the ProjectIR head onto the canonically proven effect
   * head through the SAME atomic revision batch (`planReconciled`), which
   * reauthorizes the retained READY/BLOCKED tasks onto the new base.
   *
   * On any blocker this returns `blocked` (or `in_sync`/`reconciled`) with ZERO
   * writes. Freshness is re-verified immediately before the commit: if the
   * ProjectIR basis or the backing promotion fact changed, it throws
   * `stale_head_reconciliation` (again, zero writes). An already-compiled
   * `candidate` (a pure, content-addressed proposal) may be supplied by a
   * trusted caller - it is re-validated here and again by `planReconciled`, so
   * it can never name a head of its own choosing.
   *
   * Management-policy seam (next stage): `operator` marks an operator-driven
   * call. The mechanical consistency step is currently unconditional, and a
   * caller that must not auto-reconcile (a policy that forbids it) should
   * inspect the returned blockers and drive the advance itself via the trusted
   * `planReconciled(..., { headAdvance })` path. The policy wiring lands in the
   * next stage; the seam is deliberately kept explicit here.
   */
  async reconcileProjectHead(
    input: { operator?: boolean; candidate?: ProjectHeadReconciliationCandidate } = {},
  ): Promise<ProjectHeadReconciliationResult> {
    void input.operator;
    const project = this.#project();
    const fromHead = project.head_commit;
    const status = await this.promotions.projectHeadStatus();
    if (status.state === "IN_SYNC") {
      return { status: "in_sync", fromHead, toHead: fromHead, blockers: [] };
    }
    // The candidate is ALWAYS re-validated below (freshness) and again inside
    // `planReconciled` (canonical proof), so a supplied candidate is never a
    // caller-settable head: a stale or forged one fails closed with zero writes.
    const candidate = input.candidate ?? this.#headReconciliationCandidate();
    if (!candidate.compilable) {
      return {
        status: "blocked",
        fromHead: candidate.fromHead,
        toHead: candidate.toHead,
        blockers: candidate.blockers.map((blocker) => `${blocker.kind}: ${blocker.detail}`),
      };
    }
    const promotionEventId = candidate.latestPromotionEventId;
    if (promotionEventId === null) {
      throw new ProjectHeadError(
        "head_not_proven",
        "the head drift has no backing promotion fact; refusing an unproven advance",
        [fromHead, candidate.toHead],
      );
    }
    // Freshness (zero writes on failure): the basis and the backing fact must
    // still be exactly what the candidate was compiled from.
    const freshProject = this.#project();
    const freshStatus = await this.promotions.projectHeadStatus();
    const freshBacking = candidate.promotionChainBasis.at(-1)?.eventId;
    if (
      freshProject.revision !== project.revision ||
      freshProject.digest !== project.digest ||
      freshProject.head_commit !== fromHead ||
      freshStatus.state !== "SYNC_REQUIRED" ||
      freshStatus.provenEffectHeadCommit !== candidate.toHead ||
      freshStatus.latestPromotionEventRef !== promotionEventId ||
      (freshBacking !== undefined && freshBacking !== promotionEventId)
    ) {
      throw new ProjectHeadError(
        "stale_head_reconciliation",
        "the ProjectIR basis or the backing promotion fact changed before the reconciliation committed; no events were written",
        [String(project.revision), String(freshProject.revision), fromHead, freshProject.head_commit],
      );
    }
    const outcome = this.planReconciled(
      {
        tasks: [...project.tasks],
        reason: `project head reconciliation ${fromHead} -> ${candidate.toHead}`,
      },
      { headAdvance: { fromPromotionEventId: promotionEventId, toHead: candidate.toHead } },
    );
    return {
      status: "reconciled",
      revision: outcome.result.revision,
      fromHead,
      toHead: candidate.toHead,
      blockers: [],
    };
  }

  /**
   * G10-Z §26: does this revision change the PROJECT'S MEANING, as opposed to
   * merely re-anchoring the head? A head-only reconciliation retains every task
   * unchanged and retires none, so it is not meaning-changing; anything that
   * adds, removes, replaces, or typed-invalidates is.
   */
  #isMeaningChanging(
    reconciliation: PlanRevisionReconciliation,
    input: PlanInput,
  ): boolean {
    if (input.changeClass !== undefined) return true;
    if (reconciliation.removedStaled.length > 0) return true;
    if (reconciliation.added.length > 0) return true;
    return reconciliation.diffs.some(
      (diff) => diff.class === "ADD" || diff.class === "REMOVE" || diff.class === "MODIFY_SAME_ID",
    );
  }

  /**
   * The forward propagation set for a typed revision delta (sorted, stable).
   * This is the EXACT set the revision batch stales, and therefore the exact set
   * that is removed from the quiescence requirement.
   */
  #invalidationAffected(arg: {
    changeClass: ChangeClass;
    changedIds: readonly string[];
    from: number;
    to: number;
    project: ProjectIr;
  }): string[] {
    const edges: DependencyEdge[] = [];
    for (const task of arg.project.tasks) {
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
    return [...affected].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  }

  /**
   * Build (but do not append) the canonical EVIDENCE_STALE request for one Work
   * Evidence item. ONE builder serves both the revision path and the manual
   * `invalidateEvidence` path, so the two can never drift into different event
   * shapes or idempotency semantics.
   *
   * The identity binds the SEMANTICS, not merely the target: the same Evidence
   * across the same `from -> to` revision transition under the same trigger is a
   * retry and converges; different semantics reusing the identity fail closed as
   * an idempotency conflict instead of silently overwriting authority history.
   */
  #evidenceStaleRequest(input: {
    evidenceId: string;
    reason: string;
    fromRevision: number;
    toRevision: number;
    changeClass: ChangeClass | null;
    expectedProjectRevision: number;
  }): NewEvent {
    return parseNewEvent({
      schema_version: 1,
      project_id: this.projectId,
      event_type: "EVIDENCE_STALE",
      payload_version: 1,
      entity_type: "evidence",
      entity_id: input.evidenceId,
      payload: { evidence_id: input.evidenceId, reason: input.reason },
      causation_id: null,
      correlation_id: `evidence-stale:${input.evidenceId}`,
      idempotency_key: actionKey("evidence-stale-v1", {
        project_id: this.projectId,
        evidence_id: input.evidenceId,
        from_revision: input.fromRevision,
        to_revision: input.toRevision,
        change_class: input.changeClass,
        reason: input.reason,
      }),
      expected_project_revision: input.expectedProjectRevision,
    });
  }

  /**
   * Read the ACTIVE Work Evidence of this project and compile the typed
   * invalidation plan for the tasks this revision retires. Compilation is a READ:
   * it runs before the atomic batch opens and writes nothing, so the plan is a
   * function of the world being revoked rather than of the mutation itself.
   */
  #compileEvidenceInvalidation(input: {
    current: ProjectIr;
    revision: number;
    changeClass: ChangeClass | null;
    retiredTaskIds: readonly string[];
  }): EvidenceInvalidationPlan {
    const retiredTaskIds = [...input.retiredTaskIds].sort();
    const affectedAttemptIds: string[] = [];
    for (const taskId of retiredTaskIds) {
      const attempts = this.store.connection
        .prepare(
          "SELECT attempt_id FROM attempts WHERE project_id=? AND task_id=? ORDER BY attempt_id",
        )
        .all(this.projectId, taskId) as Array<{ attempt_id: string }>;
      for (const attempt of attempts) affectedAttemptIds.push(String(attempt.attempt_id));
    }
    const activeEvidence: ActiveWorkEvidence[] = [];
    const rows = this.store.connection
      .prepare(
        `SELECT evidence_id,
                json_extract(evidence_json, '$.subject_type') AS subject_type,
                json_extract(evidence_json, '$.subject_id') AS subject_id
         FROM evidence
         WHERE project_id=? AND status='active'
         ORDER BY evidence_id`,
      )
      .all(this.projectId) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const subjectType = String(row.subject_type);
      if (subjectType !== "task" && subjectType !== "attempt" && subjectType !== "commit") continue;
      activeEvidence.push({
        evidenceId: String(row.evidence_id),
        subjectType,
        subjectId: String(row.subject_id),
      });
    }
    return compileEvidenceInvalidation({
      projectId: this.projectId,
      basis: { revision: input.current.revision, digest: input.current.digest },
      targetRevision: input.revision,
      affectedTaskIds: retiredTaskIds,
      affectedAttemptIds,
      changeClass: input.changeClass,
      activeEvidence,
    });
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
      | "progress"
      | "head_sync_required";
    mechanical: { attemptsRun: number; exits: (number | null)[] };
    next?: { eventType: string; entityId: string; projectRevision: number | null };
    recovery?: RecoveryReport;
    /** G10-X additive: the derived head picture (never from `git.head()`). */
    head?: { projectHeadCommit: string; provenEffectHeadCommit: string; state: ProjectHeadState };
    /** G10-X: the explicit barrier reasons when phase is `head_sync_required`. */
    blockers?: readonly string[];
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
    // G10-X head barrier. When the project head is behind the proven effect
    // head, NEW READY work must not activate - but already-started / VERIFYING
    // work may still settle so the project can reach quiescence. Once quiescent
    // the head advance runs automatically (the MANAGE/DELEGATE-appropriate
    // mechanical consistency step) and normal activation resumes in the same
    // turn. There is no deadlock: promotion -> drift -> new activation blocked
    // -> settlement allowed -> quiescent -> head sync -> activation resumes.
    const headStatus = await this.promotions.projectHeadStatus();
    const headView = (status: ProjectHeadStatus) => ({
      projectHeadCommit: status.projectHeadCommit,
      provenEffectHeadCommit: status.provenEffectHeadCommit,
      state: status.state,
    });
    const mechanical =
      headStatus.state === "SYNC_REQUIRED"
        ? await this.pumpSettlement({ maxSteps })
        : await this.pumpCommandAttempts({ maxSteps });
    const control = this.store.connection
      .prepare("SELECT state FROM scheduler_control WHERE project_id=?")
      .get(this.projectId) as { state: string } | undefined;
    if (control?.state === "PAUSED") {
      return { phase: "paused", mechanical };
    }
    if (headStatus.state === "SYNC_REQUIRED") {
      const post = await this.promotions.projectHeadStatus();
      if (post.state === "SYNC_REQUIRED") {
        const candidate = this.#headReconciliationCandidate();
        if (!candidate.compilable) {
          return {
            phase: "head_sync_required",
            mechanical,
            head: headView(post),
            blockers: candidate.blockers.map((blocker) => blocker.kind),
          };
        }
        const reconciliation = await this.reconcileProjectHead();
        if (reconciliation.status === "blocked") {
          return {
            phase: "head_sync_required",
            mechanical,
            head: headView(post),
            blockers: reconciliation.blockers,
          };
        }
      }
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
    // G9-F2 VIEW-INV-5: validate + snapshot BEFORE any side effect - a
    // malformed attribution fails the whole claim with zero partial state,
    // and the stored value is controller-owned (never a caller alias).
    const ownedAttribution =
      attribution === undefined ? undefined : parseAttemptAttribution(attribution);
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
    if (ownedAttribution !== undefined) {
      this.#attemptAttribution.set(attemptId, ownedAttribution);
      this.#viewGeneration += 1;
    }
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
      // PLMP-CTX-2 §3.2: if a context manifest was compiled for this attempt,
      // the report references it; the worker itself never knows the id.
      ...this.#contextManifestRef(attemptId),
    };
  }

  /**
   * PLMP-CTX-2 §3.2: the deterministic manifest id for an attempt, resolved
   * against the projection - absent when no manifest was compiled, which
   * keeps the report (and its digest) byte-identical to the pre-CTX-2 shape.
   */
  #contextManifestRef(attemptId: string): { context_manifest: string } | Record<string, never> {
    const manifestId = stableEntityId(
      "context-manifest",
      actionKey("context-manifest-v1", {
        project_id: this.projectId,
        attempt_id: attemptId,
      }),
    );
    const row = this.store.connection
      .prepare("SELECT manifest_id FROM context_manifests WHERE project_id=? AND manifest_id=?")
      .get(this.projectId, manifestId) as { manifest_id: string } | undefined;
    return row === undefined ? {} : { context_manifest: row.manifest_id };
  }

  // -------------------------------------------------------------------------
  // Deterministic gate → EvidenceAtom
  // -------------------------------------------------------------------------

  /**
   * The envelope's allowlist is the OPERATOR's declaration of what may run on this project's
   * behalf, so every gate path honours it — the auto path always did, and an explicit gate that
   * skipped it made the promise conditional on which tool the agent happened to pick. Prefix
   * match: `executable` plus the declared argv prefix (`python -m pytest` authorizes
   * `python -m pytest -q`, not `python -m blackout`). An empty allowlist authorizes nothing.
   */
  #assertGateCommandAllowed(envelope: TaskEnvelope, command: readonly string[]): void {
    const authorized = (envelope.allowed_commands ?? []).some(
      (entry) =>
        entry.executable === command[0] &&
        entry.argv_prefix.every((prefix, index) => command[index + 1] === prefix),
    );
    if (!authorized) {
      const allowed = (envelope.allowed_commands ?? [])
        .map((entry) => `${entry.executable} ${entry.argv_prefix.join(" ")}`.trim())
        .join("; ");
      throw new DomainValidationError(
        `gate command ${command.join(" ")} is not authorized by the task envelope (allowed: ${allowed || "none"}) — revise the plan with palimpsest_plan if this command is the right one`,
      );
    }
  }

  /**
   * Run one gate command and record what was OBSERVED.
   *
   * The constitution is `palimpsest_report`'s own sentence — claims are never evidence, only
   * deterministic observation is — so this method takes no exit code from the caller: the caller's
   * version did execute the command and then record whatever number the caller asserted, which made
   * `producer: "palimpsest-gate"` a label on an attestation. Three rules follow:
   *   - the command must be one the task envelope authorizes (the auto path always honoured this);
   *   - the recorded exit code is the one this execution produced, never a caller's;
   *   - no observable exit (exit null) means NO evidence — absence of observation is not a
   *     negative result (§18), so fabricating one is refused.
   */
  async gate(input: GateInput): Promise<SchedulerEvent> {
    const [row, envelope] = this.#attemptContext(input.attemptId);
    const executable = input.command[0];
    if (executable === undefined) {
      throw new DomainValidationError("gate command must have an executable");
    }
    this.#assertGateCommandAllowed(envelope, input.command);
    const observation = (await runGateCommand(this.effects, {
      worktreeId: input.attemptId,
      executable,
      argv: input.command.slice(1),
      scope: this.projectId,
      callId: `gate:${input.attemptId}:${canonicalDigest({
        predicate: input.predicate,
        command: input.command,
      }).slice(0, 16)}`,
      revision: this.promotions.projectRevision(),
    })) as { exitCode: number | null; outputTail: string };
    if (observation.exitCode === null) {
      throw new DomainValidationError(
        `gate command ${input.command.join(" ")} produced no observable exit code — evidence is not recorded (an unobserved run is not a negative result)${observation.outputTail === "" ? "" : `; output: ${observation.outputTail}`}`,
      );
    }
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
      value: { exit_code: observation.exitCode },
      project_revision: envelope.project_revision,
      input_fingerprint: envelope.project_digest,
      command: [...input.command],
      exit_code: observation.exitCode,
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
    // G10-AA (audit finding): this direct retirement path bypassed Z's promotion
    // fence, which lived only in `planReconciled`. An unresolved external effect
    // must not be crossed by ANY retirement path, so the same fence is applied
    // here: retiring Work while a promotion intent owns its effect is refused.
    const fence = compilePromotionFenceBlocker(this.promotions.promotionFenceRows(), [taskId]);
    if (fence !== undefined) {
      throw new PlanReconciliationError(fence);
    }
    return this.store.append(this.#taskStaleRequest(taskId, reason));
  }

  /**
   * Build (but do not append) the TASK_STALE request for one task. The key is
   * derived exactly like the frozen baseline (task-stale-v1); active tasks
   * carry their batch anchor. Building is separated from appending so the
   * reconcile batch can place the stale BEFORE the revision bump while keeping
   * the same event shape.
   */
  #taskStaleRequest(taskId: string, reason: string): NewEvent {
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
    void state;
    return parseNewEvent({
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
    });
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

  /**
   * Invalidate Evidence bound to a superseded subject (revision change).
   *
   * This is the MANUAL revocation path. It shares the exact builder, event shape
   * and idempotency semantics with the revision path (`planReconciled`), so a
   * manually revoked item and a revision-revoked item are indistinguishable on
   * the log. The `from`/`to` revision pair is the current revision on both sides,
   * because a manual act revokes authority without moving the ProjectIR.
   */
  invalidateEvidence(evidenceId: string, reason: string): SchedulerEvent {
    const revision = this.#project().revision;
    return this.store.append(
      this.#evidenceStaleRequest({
        evidenceId,
        reason,
        fromRevision: revision,
        toRevision: revision,
        changeClass: null,
        expectedProjectRevision: revision,
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
    })) as { exitCode: number | null; outputTail: string };
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
    return this.#pump({
      maxSteps: options.maxSteps ?? 50,
      blockTaskActivation: false,
      attribution: options.attribution,
    });
  }

  /**
   * G10-X: settle-only pump used while the project head is behind the proven
   * effect head. It behaves exactly like `pumpCommandAttempts` except that it
   * refuses to commit a NEW task activation (`TASK_STARTED`): already-started
   * work (its planned attempts, its reports/gates) may still settle, so the
   * world can reach quiescence and the head can advance. A blocked activation
   * is never an error - it is the barrier.
   */
  async pumpSettlement(options: { maxSteps?: number } = {}): Promise<{
    lastEvent: SchedulerEvent | null;
    attemptsRun: number;
    exits: (number | null)[];
  }> {
    return this.#pump({ maxSteps: options.maxSteps ?? 50, blockTaskActivation: true });
  }

  async #pump(options: {
    maxSteps: number;
    blockTaskActivation: boolean;
    attribution?: AttemptAttribution | undefined;
  }): Promise<{
    lastEvent: SchedulerEvent | null;
    attemptsRun: number;
    exits: (number | null)[];
  }> {
    const exits: (number | null)[] = [];
    let attemptsRun = 0;
    let event: SchedulerEvent | null = null;
    for (let step = 0; step < options.maxSteps; step += 1) {
      if (options.blockTaskActivation) {
        const decision = this.scheduler.decide();
        if (decision === null || decision.event_type === "TASK_STARTED") break;
      }
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

  /**
   * G10-X: the product-safe promotion entry point. The caller names the attempt
   * (and optionally a registered gate) and NOTHING ELSE: the source commit is
   * the attempt's canonical `AttemptReport.result_commit` and the expected head
   * is the canonically proven effect head of the promotion chain. Both are
   * re-validated inside the promotion manager, so a caller can never choose
   * either. `promote(attemptId, sourceCommit, expectedHeadCommit)` below stays
   * reachable only as the expert/internal path.
   */
  promoteAttempt(input: {
    attemptId: string;
    gateId?: string | undefined;
    reason?: string | undefined;
  }): Promise<PromoteResult> {
    return this.promotions.promoteAttempt(input);
  }

  /**
   * G10-Z §41: a READ-ONLY promotion-eligibility preview. It answers "may this
   * attempt start an external effect right now, and if not, why not" without
   * attempting any mutation - so a UI or agent can explain the refusal instead
   * of provoking it. Nothing is appended and no effect starts.
   */
  promotionEligibility(
    attemptId: string,
    gateId?: string | undefined,
  ): PromotionEligibilityAssessment {
    return this.promotions.assessEligibility(
      attemptId,
      gateId === undefined ? {} : { gateId },
    );
  }

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
    options: {
      /** PLMP-ALC-2 §1.3: advisory model candidates; absent = no model advice. */
      modelCandidates?: readonly { model: string; cost: number; priorSuccessRate?: number }[];
    } = {},
  ): {
    allocation: Allocation;
    concurrency: AllocationCalibration;
    suggestedModel?: string;
    suggestedModelReason?: string;
  } {
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
    // PLMP-ALC-2 §1.3: pure advisory arm - the host still picks the model.
    const modelAdvice =
      options.modelCandidates === undefined
        ? undefined
        : this.telemetry.suggestModel(role, options.modelCandidates);
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
      ...(modelAdvice === undefined
        ? {}
        : { suggestedModel: modelAdvice.model, suggestedModelReason: modelAdvice.reason }),
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

  /**
   * PLMP-VIS-1 §1.1: the read-only orchestration graph projection - plan
   * graph (tasks + depends_on) and per-attempt run timelines, re-arranged
   * from the existing projections. Nothing here writes.
   */
  orchestrationGraph(): OrchestrationGraph {
    this.#graphBuilds += 1;
    return buildOrchestrationGraph({
      projectId: this.projectId,
      project: this.#project(),
      connection: this.store.connection,
      attribution: this.#attemptAttribution,
    });
  }

  /** Test instrumentation for the freshness gate (WEB-H01-A): how many times
   * the full graph projection has been built in this process. */
  graphBuildCount(): number {
    return this.#graphBuilds;
  }

  /** Spec 35 VIEW-INV-2: opaque validator for the complete user-visible
   * projection - cheap (MAX(event_id) + in-memory generation + process
   * epoch), never a full-graph digest. Same viewCursor ⇒ same graph. */
  viewCursor(): string {
    const cursorRow = this.store.connection
      .prepare("SELECT COALESCE(MAX(event_id), 0) AS m FROM events WHERE project_id=?")
      .get(this.projectId) as { m: number };
    return `v1:${this.#viewEpoch}:${Number(cursorRow.m)}:${this.#viewGeneration}`;
  }

  /** G9-G §5: the ONE read-side "is this project initialized?" query, scoped
   * to THIS controller's project identity (HEALTH-INV-2). Sibling projects in
   * a shared store never answer for it; serviceHealth, the serve declare
   * face, and the CLI architect face all consume this single source - the
   * duplicated LIMIT-1 queries (one per face) drifted exactly once already. */
  isProjectInitialized(): boolean {
    return (
      this.store.connection
        .prepare("SELECT 1 AS ok FROM scheduler_control WHERE project_id=?")
        .get(this.projectId) !== undefined
    );
  }

  /** Spec 35 HEALTH-INV-1, G9-F2 HEALTH-INV-2: service availability without
   * an initialized ProjectIR - cheap state only, never a graph build.
   * projectInitialized is scoped to THIS controller's project identity. */
  serviceHealth(): { ok: boolean; projectInitialized: boolean; eventCursor: number } {
    const cursorRow = this.store.connection
      .prepare("SELECT COALESCE(MAX(event_id), 0) AS m FROM events WHERE project_id=?")
      .get(this.projectId) as { m: number };
    return { ok: true, projectInitialized: this.isProjectInitialized(), eventCursor: Number(cursorRow.m) };
  }

  status(): ControllerStatusView {
    const project = this.#project();
    const promotionFence = this.promotions.promotionFenceRows().map((row) => ({
      promotion_id: row.promotionId,
      attempt_id: row.attemptId,
      task_id: row.taskId,
      state: row.state,
    }));
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
    // PLMP-TLM-2 §1: the user-facing telemetry summary, in plain numbers -
    // percentages and prices only, never internal vocabulary ([STV-A03]).
    const telemetryRows = this.telemetry.snapshot().rows.map((row) => ({
      task_type: row.task_type,
      model: row.model,
      attempts: row.attempts,
      successes: row.successes,
      successRate: `${Math.round(row.successRate * 100)}%`,
      avgCost: row.avgAttemptCost.toFixed(4),
      costPerSuccess:
        row.costPerSuccess === undefined ? "n/a" : row.costPerSuccess.toFixed(4),
    }));
    const headStatus = this.promotions.projectHeadStatusSync();
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
      promotionFence,
      parallel: {
        admittedAttempts: this.budget.admitted,
        rejectedClaims: this.budget.rejected,
      },
      resume: {
        ...this.#resumeOverview(headStatus),
        preparedPromotions: this.#preparedPromotionIds(),
      },
      ...(telemetryRows.length === 0 ? {} : { telemetry: { rows: telemetryRows } }),
      head: {
        projectHeadCommit: headStatus.projectHeadCommit,
        provenEffectHeadCommit: headStatus.provenEffectHeadCommit,
        state: headStatus.state,
        latestPromotion: this.#latestHeadPromotion(headStatus),
      },
    };
  }

  /**
   * PLMP-CTX-1 §2: the C2 context brief - a derived advisory compilation of
   * facts (evidence 1:1, zero summarisation), interpretations (worker
   * self-reports, marked as such) and contradicted claims (both sides
   * listed, the R7 verdict verbatim). Read-only and never appended to the
   * event log: context is not a source of truth ([CTX-INV-5]).
   */
  contextBrief(options: { taskId?: string } = {}): ContextBrief {
    const attemptFilter =
      options.taskId === undefined ? "" : " AND task_id=?";
    const attemptArgs =
      options.taskId === undefined
        ? [this.projectId]
        : [this.projectId, options.taskId];
    const interpretations = (
      this.store.connection
        .prepare(
          `SELECT attempt_id, task_id, report_json FROM attempts WHERE project_id=?${attemptFilter}`,
        )
        .all(...attemptArgs) as Array<Record<string, unknown>>
    ).flatMap((row) => {
      if (row.report_json === null) return [];
      const report = decodeJsonBlob(row.report_json) as Record<string, unknown>;
      if (
        typeof report.summary !== "string" ||
        typeof report.worker_status !== "string"
      ) {
        return [];
      }
      return [
        {
          attemptId: String(row.attempt_id),
          taskId: row.task_id === null ? null : String(row.task_id),
          workerStatus: report.worker_status,
          summary: report.summary,
        },
      ];
    });
    const attemptIds = new Set(interpretations.map((entry) => entry.attemptId));
    const evidence = (
      this.store.connection
        .prepare("SELECT evidence_id, status, evidence_json FROM evidence WHERE project_id=?")
        .all(this.projectId) as Array<Record<string, unknown>>
    ).flatMap((row) => {
      const atom = decodeJsonBlob(row.evidence_json) as Record<string, unknown>;
      const subjectId = typeof atom.subject_id === "string" ? atom.subject_id : null;
      if (options.taskId !== undefined && (subjectId === null || !attemptIds.has(subjectId))) {
        return [];
      }
      return [
        {
          evidenceId: String(row.evidence_id),
          status: String(row.status),
          subjectType: typeof atom.subject_type === "string" ? atom.subject_type : "",
          subjectId: subjectId ?? "",
          predicate: typeof atom.predicate === "string" ? atom.predicate : "",
          exitCode: typeof atom.exit_code === "number" ? atom.exit_code : null,
        },
      ];
    });
    const claims = this.claims.snapshot().nodes
      .filter((node) => node.kind === "claim")
      .map((node) => {
        const status = this.claims.claimStatus(node.id);
        return {
          claimId: node.id,
          label: node.label,
          status: status.status,
          supportedBy: status.supportedBy,
          contradictedBy: status.contradictedBy,
        };
      });
    return compileContextBrief({
      projectId: this.projectId,
      evidence,
      interpretations,
      claims,
    });
  }

  /**
   * PLMP-CTX-2 §5: compile the context for one attempt - requirement
   * derivation, lexical retrieval over its worktree, the canonical manifest
   * (emitted as CONTEXT_MANIFEST_ADDED, idempotent per attempt) and the
   * coverage assessment. The worktree must exist (claim first).
   */
  async compileTaskContext(attemptId: string): Promise<{
    manifest: ContextManifest;
    coverage: CoverageAssessment;
    distribution: ContextDistribution;
  }> {
    const attemptRow = this.store.connection
      .prepare("SELECT task_id FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(this.projectId, attemptId) as { task_id: string } | undefined;
    if (attemptRow === undefined) {
      throw new DomainValidationError("attempt does not exist");
    }
    const taskId = String(attemptRow.task_id);
    const project = this.#project();
    const task = project.tasks.find((item) => item.task_id === taskId);
    if (task === undefined) {
      throw new DomainValidationError("task does not exist");
    }

    const manifestId = stableEntityId(
      "context-manifest",
      actionKey("context-manifest-v1", {
        project_id: this.projectId,
        attempt_id: attemptId,
      }),
    );
    const existing = this.store.connection
      .prepare("SELECT manifest_json FROM context_manifests WHERE project_id=? AND manifest_id=?")
      .get(this.projectId, manifestId) as { manifest_json: Uint8Array } | undefined;
    if (existing !== undefined) {
      const manifest = JSON.parse(
        new TextDecoder().decode(existing.manifest_json),
      ) as ContextManifest;
      return {
        manifest,
        coverage: assessCoverage(manifest.requirement, manifest),
        distribution: distributeContext(manifest),
      };
    }

    // Requirement inputs: prior-failure evidence and the stale set come from
    // the projections; upstream write surfaces come from depends_on tasks.
    const attemptRows = this.store.connection
      .prepare("SELECT attempt_id, task_id, state FROM attempts WHERE project_id=?")
      .all(this.projectId) as Array<Record<string, unknown>>;
    const evidenceRows = this.store.connection
      .prepare("SELECT evidence_id, status, evidence_json FROM evidence WHERE project_id=?")
      .all(this.projectId) as Array<Record<string, unknown>>;
    const failedAttemptIds = new Set(
      attemptRows
        .filter((row) => String(row.task_id) === taskId && String(row.state) === "FAILED")
        .map((row) => String(row.attempt_id)),
    );
    const priorFailureEvidence: string[] = [];
    const staleRefs: string[] = [];
    for (const row of attemptRows) {
      if (String(row.state) === "STALE") staleRefs.push(String(row.attempt_id));
    }
    for (const row of evidenceRows) {
      const atom = decodeJsonBlob(row.evidence_json) as Record<string, unknown>;
      const subjectId = typeof atom.subject_id === "string" ? atom.subject_id : "";
      if (String(row.status) === "stale") staleRefs.push(String(row.evidence_id));
      if (failedAttemptIds.has(subjectId) && String(row.status) === "active") {
        priorFailureEvidence.push(String(row.evidence_id));
      }
    }
    const upstreamWritePaths = (task.depends_on ?? []).flatMap((dependency) => {
      const upstream = project.tasks.find((item) => item.task_id === dependency);
      return upstream?.write_paths ?? [];
    });
    const requirement = compileContextRequirement({
      projectId: this.projectId,
      taskId,
      requiredArtifacts: task.required_artifacts,
      writePaths: task.write_paths,
      upstreamWritePaths,
      priorFailureEvidence,
      staleRefs,
    });

    // Deterministic retrieval terms: objective + artifact tokens (V0, no model).
    const stopwords = new Set([
      "the",
      "and",
      "for",
      "with",
      "this",
      "that",
      "from",
      "into",
      "complete",
    ]);
    const tokens = new Set<string>();
    for (const token of `${task.objective} ${task.required_artifacts.join(" ")}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)) {
      if (token.length >= 4 && !stopwords.has(token)) tokens.add(token);
    }
    const source = await this.effects.git.scanLexical({
      worktreeId: attemptId,
      terms: [...tokens].slice(0, 8),
    });

    // PLMP-CTX-3 §1.3: the semantic channel (active only with an injected
    // embedding port) - file-level cosine ranking over the worktree texts,
    // §6 scoring V0: cosine minus a token-weight penalty minus a duplicate
    // penalty; D/E/F/C features stay neutral in V0.
    let semantic: ReadonlyArray<{ path: string; score_permille: number }> | undefined;
    if (this.effects.embedding !== undefined) {
      const texts = await this.effects.git.collectWorktreeTexts({
        worktreeId: attemptId,
        maxFiles: 64,
        maxBytesPerFile: 65_536,
      });
      const query = `${task.objective} ${task.required_artifacts.join(" ")}`;
      const embeddings = await this.effects.embedding.embed([
        query,
        ...texts.map((file) => file.content),
      ]);
      const queryVector = embeddings[0] ?? [];
      const scored = texts
        .map((file, index) => {
          const chunkVector = embeddings[index + 1] ?? [];
          return {
            path: file.path,
            // Dot product on the raw count vectors: density reward (r2).
            dot: queryVector.reduce(
              (sum, value, index2) => sum + value * (chunkVector[index2] ?? 0),
              0,
            ),
            cosine: cosineSimilarity(queryVector, chunkVector),
            bytes: Buffer.byteLength(file.content, "utf8"),
            digest: canonicalDigest(file.content),
          };
        })
        .filter((entry) => entry.cosine >= 0.05)
        .sort((a, b) => b.dot - a.dot)
        .slice(0, 8);
      const seen = new Set<string>();
      semantic = scored
        .map((entry) => ({
          path: entry.path,
          score_permille: Math.round(Math.max(0, Math.min(1, entry.dot)) * 1000),
          digest: entry.digest,
        }))
        .filter((entry) => {
          // Duplicate content is penalized at scoring and dropped here so the
          // manifest never carries two entries for the same body.
          if (seen.has(entry.digest)) return false;
          seen.add(entry.digest);
          return true;
        })
        .map(({ path, score_permille }) => ({ path, score_permille }));
    }
    const manifest = buildContextManifest({
      manifestId,
      taskId,
      projectRevision: this.promotions.projectRevision(),
      requirement,
      source,
      semantic,
      createdAt: this.#now(),
    });
    this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "CONTEXT_MANIFEST_ADDED",
        payload_version: 1,
        entity_type: "context-manifest",
        entity_id: manifest.manifest_id,
        payload: {
          task_id: manifest.task_id,
          project_revision: manifest.project_revision,
          manifest,
        },
        causation_id: null,
        correlation_id: `task:${manifest.task_id}:context`,
        idempotency_key: actionKey("context-manifest-v1", {
          project_id: this.projectId,
          attempt_id: attemptId,
        }),
        expected_project_revision: this.#project().revision,
      }),
    );
    return {
      manifest,
      coverage: assessCoverage(manifest.requirement, manifest),
      distribution: distributeContext(manifest),
    };
  }

  /**
   * PLMP-CTX-4 §1.2: resolve a `@ctx/…` handle against the latest context
   * manifest of the attempt's task. Unknown handles resolve to undefined -
   * handles are an advisory index, not a contract assertion.
   */
  async fetchContext(
    attemptId: string,
    handle: string,
  ): Promise<{
    kind: "exact" | "source" | "evidence";
    ref: string;
    body: unknown;
  } | undefined> {
    const attemptRow = this.store.connection
      .prepare("SELECT task_id FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(this.projectId, attemptId) as { task_id: string } | undefined;
    if (attemptRow === undefined) return undefined;
    const manifestRow = this.store.connection
      .prepare(
        "SELECT manifest_json FROM context_manifests WHERE project_id=? AND task_id=? ORDER BY last_event_id DESC LIMIT 1",
      )
      .get(this.projectId, String(attemptRow.task_id)) as { manifest_json: Uint8Array } | undefined;
    if (manifestRow === undefined) return undefined;
    const manifest = JSON.parse(
      new TextDecoder().decode(manifestRow.manifest_json),
    ) as ContextManifest;
    const distribution = distributeContext(manifest);
    const entry = [...distribution.boot, ...distribution.handles].find(
      (candidate) => candidate.handle === handle,
    );
    if (entry === undefined) return undefined;
    if (entry.kind === "evidence") {
      const row = this.store.connection
        .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND evidence_id=?")
        .get(this.projectId, entry.ref) as { evidence_json: Uint8Array } | undefined;
      return row === undefined
        ? undefined
        : { kind: entry.kind, ref: entry.ref, body: JSON.parse(new TextDecoder().decode(row.evidence_json)) };
    }
    if (entry.kind === "source") {
      const source = manifest.source.find((candidate) => candidate.path === entry.ref);
      return source === undefined ? undefined : { kind: entry.kind, ref: entry.ref, body: source };
    }
    const exact = manifest.exact.find((candidate) => candidate.ref === entry.ref);
    return exact === undefined ? undefined : { kind: entry.kind, ref: entry.ref, body: exact };
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

  /**
   * G10-X additive: fold the canonical head picture into the resume detail
   * without changing the action taxonomy (existing consumers keep their
   * action; the head state becomes explicit in the human-facing detail and in
   * the status `head` block).
   */
  #resumeOverview(
    headStatus?: ProjectHeadStatus,
  ): Omit<ControllerStatusView["resume"], "preparedPromotions"> {
    const overview = this.#resumeOverviewBase();
    if (headStatus === undefined || headStatus.state === "IN_SYNC") return overview;
    const note =
      headStatus.state === "SYNC_REQUIRED"
        ? `project head drift: the proven effect head ${headStatus.provenEffectHeadCommit} has not yet become the project head ${headStatus.projectHeadCommit}; settle in-flight work and reconcile the head before new READY work activates`
        : `project head conflict: the promotion chain is broken (head ${headStatus.projectHeadCommit}); no automatic head advance is offered`;
    return { ...overview, detail: `${overview.detail}; ${note}` };
  }

  #resumeOverviewBase(): Omit<ControllerStatusView["resume"], "preparedPromotions"> {
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
    this.#viewGeneration += 1;
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
