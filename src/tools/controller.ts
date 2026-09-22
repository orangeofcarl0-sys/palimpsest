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

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
import { deriveAttemptCompletionContract, deriveCompletionReadiness } from "../domain/completion_contract.js";
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
import { GateEngine, parseGateDefinition, type GateDefinition, type GateResult } from "../evidence/gate_dsl.js";
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
import { standardGateChain } from "../domain/standard.js";
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

/** The one task a direct bootstrap creates. Stable so a retry recognises the SAME work. */
const DIRECT_TASK_ID = "direct-1";
/** Runaway guard for the activation loop — a defensive cap, never a semantic budget (§E.9). */
const DIRECT_BEGIN_MAX_STEPS = 16;

/**
 * Semantic equivalence between a canonical project and a requested direct proposal (§E.12).
 *
 * Deliberately NOT provenance: with no direct marker, a one-task project created by `begin` and an
 * identical one created through architect/start are indistinguishable, and adding a marker is exactly
 * what the appendix forbids. Equivalence is the decidable question, so it is the one asked.
 *
 * `task_id` is not compared: it is runtime identity, not part of the work's meaning.
 */
function directShapeEquivalent(project: ProjectIr, task: TaskSpec): boolean {
  if (project.tasks.length !== 1) return false;
  const existing = project.tasks[0]!;
  const sameList = (left: readonly string[], right: readonly string[]): boolean =>
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  return (
    existing.objective === task.objective &&
    existing.depends_on.length === 0 &&
    sameList(existing.write_paths, task.write_paths) &&
    sameList(existing.required_artifacts, task.required_artifacts)
  );
}

/** The one gate a confirmed project standard declares; promotion names it by this id. */
export const RELEASE_GATE_ID = "gate-release";

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

/**
 * Where an attempt's work happens, and therefore where it is observed.
 *
 * - "worktree" (default): every attempt gets an isolated git worktree at base commit; the worker
 *   is expected to work there. Right for out-of-process workers, branch executors and CI, which
 *   genuinely live in that directory.
 * - "in-place": the attempt works in the canonical repository tree itself — the model for an
 *   agent whose cwd IS the repository (a DSH agent). Isolation buys nothing here (the product's
 *   single-writer discipline means one writer at a time anyway) and the worktree/workdir mismatch
 *   is exactly the defect that burned four live attempts: work done in the main repo, gate run in
 *   an empty worktree. So in-place, work and observation are the same tree, and concurrent RUNNING
 *   attempts are capped at one because two agents writing one tree is not isolation, it is corruption.
 */
export type ExecutionMode = "worktree" | "in-place";

export interface ProjectControllerOptions {
  store: EventStore;
  effects: PalimpsestEffectsRuntime;
  projectId: string;
  policy: TaskPolicy;
  /** Attempt work/observation model; default "worktree" (every existing deployment). */
  execution?: ExecutionMode | undefined;
  /**
   * PLMP-LEAN-1 §1: the project's confirmed done-ness. On `start()` the controller declares the
   * release gate from it (once), so a confirmed standard is the only thing a person had to state —
   * the gate, its clauses and its predicates are derived from that sentence plus the repository.
   * An UNCONFIRMED standard declares nothing: a promotion must never rest on a standard nobody
   * stated.
   */
  standard?: import("../domain/standard.js").ProjectStandard | undefined;
  /**
   * PLMP-LEAN-1 §2.1 / 2A-Q: what this deployment can actually do. Capabilities gate READINESS —
   * they never change what a task REQUIRES. Injected from the composition, which alone knows whether
   * a verifier satisfying the independence contract is composed; the conservative default assumes
   * nothing, so a deployment that says nothing is told the truth rather than a comfortable guess.
   */
  capabilities?: import("../domain/completion_contract.js").CompletionCapabilities | undefined;
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
  readonly execution: ExecutionMode;
  readonly #standard: import("../domain/standard.js").ProjectStandard | undefined;
  readonly #capabilities: import("../domain/completion_contract.js").CompletionCapabilities;
  /**
   * Transient gate diagnostics: the output tail of the last observation per (attempt, predicate,
   * command). Deliberately NOT persisted — the evidence atom's bytes are pinned by the Python
   * conformance fixtures — but an opaque exit code (pytest's 5) is unreadable without it, and the
   * agent cannot see the host's stdout any other way. Bounded: the oldest entries are dropped.
   */
  readonly #gateOutputs = new Map<string, string>();
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
    this.execution = options.execution ?? "worktree";
    this.#standard = options.standard;
    // Conservative by default: an unstated capability is an ABSENT one, so readiness reports the
    // truth instead of a comfortable guess.
    this.#capabilities = options.capabilities ?? {
      independentVerifierAvailable: false,
      attemptResultVerificationAvailable: false,
      sandboxSpawnVerified: false,
    };
    this.promotions = new PromotionManager(options.store, options.effects, options.projectId, this.execution);
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
    // PLMP-LEAN-1 §1: a CONFIRMED standard declares the release gate here, once, at genesis.
    // That is what removes the two things a person used to have to do by hand: recite predicate
    // vocabulary for a gate, and declare it through the CLI before "accept" could work at all.
    // An unconfirmed standard declares nothing (see the option's doc): no promotion may rest on a
    // standard nobody stated.
    if (this.#standard !== undefined && this.#standard.confirmed && this.#releaseGateDeclared() === false) {
      const chain = standardGateChain(this.#standard);
      if (chain.length > 0) {
        this.declareGate(
          parseGateDefinition({
            gate_id: RELEASE_GATE_ID,
            version: 1,
            subject_type: "attempt",
            require: { all: chain },
          }),
          "derived from the confirmed project standard",
        );
      }
    }
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
  ): Promise<{ worktreePath: string; baseCommit?: string }> {
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
    if (this.execution === "in-place") {
      // No isolated tree: the attempt works in the canonical repository, so the claimed base is
      // the head the work will be diffed against, and a second concurrent writer is refused —
      // two agents editing one tree is corruption, not isolation.
      const inFlight = this.#runningRoles().length;
      if (inFlight > 0) {
        throw new DomainValidationError(
          `in-place execution allows one RUNNING attempt at a time (${String(inFlight)} already running) — wait for it to settle or switch the deployment to worktree execution`,
        );
      }
      this.scheduler.startAttempt(attemptId);
      return { worktreePath: "", baseCommit: project.head_commit };
    }
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
    // In-place: the product observes the tree itself, synchronously. The caller's changed_files
    // and result_commit are overwritten by what `git status`/HEAD actually say, so the report
    // records an observation, not a claim. The envelope's write_paths are then the CONTRACT the
    // observation is checked against: an out-of-scope change fails here, at the moment it can be
    // named, instead of surfacing later as a gate that can only count evidence atoms.
    if (this.execution === "in-place") {
      const envelope = this.#attemptContext(attemptId)[1];
      const observed = this.#observeInPlaceAttemptSync(attemptId, envelope.base_commit);
      const scope = envelope.write_paths;
      const outOfScope = observed.changedFiles.filter(
        (path) => !scope.some((allowed) => path === allowed || path.startsWith(`${allowed}/`)),
      );
      if (outOfScope.length > 0) {
        throw new DomainValidationError(
          `in-place attempt ${attemptId} changed paths outside the task envelope's write_paths [${scope.join(", ")}]: ${outOfScope.join(", ")} — revert them or revise the plan with palimpsest_plan`,
        );
      }
      // §2.6: a COMPLETED attempt must have materialized its work as a commit. Only completion is
      // held to this — a failed or cancelled attempt is allowed to stop mid-edit, and its report is
      // still worth observing.
      if (input.workerStatus === "completed") {
        this.#assertCompletionMaterialized(attemptId, observed.uncommitted);
        // §3.3: and it must have left observable work at all. Enforced HERE, on the report path, so
        // the automatic pump cannot mint the zero-work COMPLETED attempt that `finish` refuses —
        // which is exactly what the 2A live gate measured it doing.
        this.#assertCompletionHasWork(attemptId, observed.changedFiles);
      }
      input = {
        ...input,
        changedFiles: observed.changedFiles,
        ...(observed.head === null ? {} : { resultCommit: observed.head }),
      };
    }
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

  /**
   * In-place observation of one attempt's work: `git status --porcelain` over the canonical
   * repository (synchronous by necessity — the report path is synchronous — and safe: status is
   * read-only). Untracked-but-ignored scaffolding (`.palimpsest/` state, caches) is excluded so
   * the observation names what the attempt CHANGED, not what the tooling left behind. head is the
   * repository's current HEAD commit; the caller commits through the normal git flow before
   * reporting, so this head IS the attempt's result.
   */
  #observeInPlaceAttemptSync(
    attemptId: string,
    baseCommit: string,
  ): { changedFiles: string[]; head: string | null; uncommitted: string[] } {
    const repo = this.#inPlaceRepository();
    const run = (args: string[]): string => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
    // The observation covers BOTH states a change can be in at report time: committed since the
    // attempt's base (`git diff --name-only base..HEAD` — the normal case, the agent commits as it
    // works) and still-uncommitted (`git status --porcelain`). `.palimpsest/` is the product's own
    // scaffolding, never the attempt's work.
    const committed = run(["diff", "--name-only", baseCommit, "HEAD"])
      .split(String.fromCharCode(10))
      .map((path: string) => path.trim())
      .filter((path: string) => path !== "" && !path.startsWith(".palimpsest/"));
    const uncommitted = run(["status", "--porcelain"])
      .split(String.fromCharCode(10))
      .filter((line: string) => line.trim() !== "")
      .map((line: string) => line.slice(3).trim())
      .filter((path: string) => !path.startsWith(".palimpsest/"));
    const changedFiles = [...new Set([...committed, ...uncommitted])].sort();
    const head = run(["rev-parse", "HEAD"]).trim();
    // `uncommitted` is returned SEPARATELY, not merely folded into changedFiles: a completed attempt
    // must have materialized its work as a commit, and only the two sets apart can say whether it
    // did (see #assertCompletionMaterialized).
    return { changedFiles, head, uncommitted };
  }

  /**
   * PLMP-LEAN-1 §2.6: **completed in-place work must be commit-materialized.**
   *
   * Measured (probe, 2026-09-21): an agent edited a file, never committed, and called `finish`. The
   * attempt went COMPLETED with `changed_files: ["src/dedupe.ts"]` while `result_commit` was the BASE
   * commit — a commit that does not contain the edit. Worse, the in-place promotion guard compares
   * the recorded commit against the repository HEAD, and both were the base, so the guard passed:
   * the promotion could record a COMMITTED outcome whose canonical head contains none of the work.
   *
   * The invariant is one line to state and closes both the promotion hole and the 2B subject
   * question at once: a successful completion implies `changed_files == Diff(base, resultCommit)`.
   * Refusing is the right remedy rather than committing on the agent's behalf — committing is
   * ordinary agent work (read / edit / test / commit), not governance machinery, so the product must
   * not author commits for it.
   */
  #assertCompletionMaterialized(attemptId: string, uncommitted: readonly string[]): void {
    if (uncommitted.length === 0) return;
    throw new DomainValidationError(
      `attempt ${attemptId} has work that is not committed: ${uncommitted.join(", ")} — a completed attempt's result commit must contain its work, and right now it would not (the recorded commit is the current HEAD, which does not include these files). Commit or revert them, then finish again`,
    );
  }

  #inPlaceRepository(): string {
    const candidate = (this.effects.git as { repository?: string }).repository;
    if (candidate === undefined || candidate === "") {
      throw new DomainValidationError(
        "in-place execution requires a git port bound to the repository (GitCliPort) — the fake port cannot observe a real tree",
      );
    }
    return candidate;
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
  /** Read the transient tail of the last observation for one gate (see #gateOutputs). */
  gateObservationOutput(attemptId: string, predicate: string, command: readonly string[]): string | undefined {
    return this.#gateOutputs.get(this.#gateOutputKey(attemptId, predicate, command));
  }

  #gateOutputKey(attemptId: string, predicate: string, command: readonly string[]): string {
    return `${attemptId}\u0000${predicate}\u0000${command.join(" ")}`;
  }

  #rememberGateOutput(attemptId: string, predicate: string, command: readonly string[], tail: string): void {
    if (this.#gateOutputs.size >= 64) {
      const oldest = this.#gateOutputs.keys().next().value;
      if (oldest !== undefined) this.#gateOutputs.delete(oldest);
    }
    this.#gateOutputs.set(this.#gateOutputKey(attemptId, predicate, command), tail);
  }

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
      // In-place attempts have no worktree: their tree IS the repository, and the gate must run
      // where the work is (measured live: a missing cwd made every in-place gate unobservable).
      ...(this.execution === "in-place" ? { cwd: this.#inPlaceRepository() } : {}),
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
    this.#rememberGateOutput(input.attemptId, input.predicate, input.command, observation.outputTail);
    return this.#recordCommandEvidence(
      input.attemptId,
      input.predicate,
      input.command,
      observation.exitCode,
      input.observedArtifacts,
    );
  }

  /**
   * The single place a COMMAND predicate's EVIDENCE_ADDED event is built, so `gate` and `finish`
   * cannot drift apart: `gate` runs the caller's command and hands the observed exit code here,
   * and `finish` does the same after running the project standard's own commands. The exit code is
   * always an OBSERVATION — no caller-supplied value reaches this point (SR-1 #134).
   */
  #recordCommandEvidence(
    attemptId: string,
    predicate: EvidenceAtom["predicate"],
    command: readonly string[],
    exitCode: number,
    observedArtifacts?: readonly string[] | undefined,
  ): SchedulerEvent {
    const [row, envelope] = this.#attemptContext(attemptId);
    const key = actionKey("evidence-v1", {
      project_id: this.projectId,
      attempt_id: attemptId,
      predicate,
      command,
    });
    const evidenceId = stableEntityId("evidence", key);
    const evidence: EvidenceAtom = {
      schema_version: 1,
      project_id: this.projectId,
      evidence_id: evidenceId,
      subject_type: "attempt",
      subject_id: attemptId,
      subject_digest: canonicalDigest({ attempt_id: attemptId, command }),
      predicate,
      value: { exit_code: exitCode },
      project_revision: envelope.project_revision,
      input_fingerprint: envelope.project_digest,
      command: [...command],
      exit_code: exitCode,
      environment_digest: "e".repeat(64),
      dependency_digest: null,
      observed_artifacts: [...(observedArtifacts ?? envelope.required_artifacts)],
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
        idempotency_key: key,
        expected_project_revision: envelope.project_revision,
      }),
    );
  }

  /**
   * PLMP-LEAN-1 §2.6 / `INV-5`: record evidence the PRODUCT observed without running a command.
   *
   * `write_scope_valid` and `expected_files_exist` are observations of the tree and the filesystem,
   * not protocol runs, so they carry `command: null` / `exit_code: null`. The frozen evidence
   * contract already permits exactly that — its "requires command and exit_code" rule is scoped to
   * the four process predicates (src/schema/models.ts) — so scope evidence stops being a caller's
   * label stuck onto somebody else's command, which is what it was in the first live session.
   */
  #recordObservedEvidence(
    attemptId: string,
    predicate: EvidenceAtom["predicate"],
    value: EvidenceAtom["value"],
  ): SchedulerEvent {
    const [row, envelope] = this.#attemptContext(attemptId);
    const key = actionKey("evidence-observed-v1", {
      project_id: this.projectId,
      attempt_id: attemptId,
      predicate,
    });
    const evidenceId = stableEntityId("evidence", key);
    const evidence: EvidenceAtom = {
      schema_version: 1,
      project_id: this.projectId,
      evidence_id: evidenceId,
      subject_type: "attempt",
      subject_id: attemptId,
      subject_digest: canonicalDigest({ attempt_id: attemptId, predicate }),
      predicate,
      value,
      project_revision: envelope.project_revision,
      input_fingerprint: envelope.project_digest,
      command: null,
      exit_code: null,
      environment_digest: "e".repeat(64),
      dependency_digest: null,
      observed_artifacts: [...envelope.required_artifacts],
      producer: "palimpsest-finish",
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
        idempotency_key: key,
        expected_project_revision: envelope.project_revision,
      }),
    );
  }

  /**
   * PLMP-LEAN-1 §3.3: **a completed attempt must have left observable work.**
   *
   * Measured live (2A final gate, 2026-09-21): the agent rewrote the module, ran the tests and
   * committed — then called `palimpsest_run` by mistake. The mechanical pump claimed its own attempt,
   * ran the policy command against the UNCHANGED tree, and settled it COMPLETED with
   * `changed_files: []`, `result_commit` = the base commit and zero evidence. That is precisely the
   * state `finish` exists to refuse, reached through the automatic path instead.
   *
   * The rule is `changed_files` non-empty, and it is deliberately not softened by "the required
   * artifacts exist": a declared artifact that already existed before the attempt is not work. Any
   * task whose only real output is analysis belongs to another locus (a reasoning branch, a
   * verification, a cross-project ask) rather than to a Work attempt.
   */
  #assertCompletionHasWork(attemptId: string, changedFiles: readonly string[]): void {
    if (changedFiles.length > 0) return;
    throw new DomainValidationError(
      `attempt ${attemptId} has no observable work: nothing changed in the repository, so there is nothing to complete — if this task only needed analysis it belongs to a reasoning branch, a verification or a cross-project ask rather than a work attempt; otherwise make the change and report again`,
    );
  }

  /** The one attempt this principal currently has RUNNING; 0 or more than 1 is a refusal, not a guess. */
  #uniqueRunningAttempt(): string {
    const rows = this.store.connection
      .prepare("SELECT attempt_id FROM attempts WHERE project_id=? AND state=? ORDER BY attempt_id")
      .all(this.projectId, "RUNNING") as { attempt_id: string }[];
    if (rows.length === 1) return rows[0]!.attempt_id;
    if (rows.length === 0) {
      throw new DomainValidationError(
        "no attempt is running, so there is no work to finish — claim a task first (the plan's ready set decides which), then do the work and call finish again",
      );
    }
    throw new DomainValidationError(
      `${rows.length} attempts are running (${rows.map((row) => row.attempt_id).join(", ")}), so finishing would have to guess which one is yours — settle them one at a time, or narrow the plan so only one task is ready`,
    );
  }

  /**
   * PLMP-LEAN-1 appendix E (2A-B): the **begin** protocol — symmetric with `finish`.
   *
   *   Agent decides what the work is. Palimpsest makes the work governable.
   *
   * The agent compiles the user's intent into a minimal direct-work proposal (a goal and the write
   * scope it intends to touch); the product validates it and MECHANICALLY establishes the single
   * managed work position, so the principal can just start working. The agent never operates the
   * scheduler, never claims, and never sees an attempt id.
   *
   * The state machine is S0-S3 (appendix E §E.16), and every precondition is evaluated BEFORE
   * anything is appended: a refusal leaves the event log exactly as it was.
   */
  async begin(input: {
    readonly goal: string;
    readonly writePaths: readonly string[];
    readonly requiredArtifacts?: readonly string[] | undefined;
  }): Promise<{
    readonly state: "READY" | "RESUMED";
    readonly goal: string;
    readonly writeScope: readonly string[];
    readonly requiredArtifacts: readonly string[];
    readonly completion: {
      readonly mechanicalChecks: readonly string[];
      readonly independentVerificationRequired: boolean;
    };
  }> {
    const goal = input.goal.trim();
    if (goal === "") {
      throw new DomainValidationError("begin requires a non-empty goal — state what the work is");
    }
    // §E.4.1: v1 is repository-bound + in-place only. Under worktree execution this would create a
    // direct path that cannot be walked to the end: the principal edits its own cwd while the product
    // made a worker worktree, and `finish` fails closed there.
    if (this.execution !== "in-place") {
      throw new DomainValidationError(
        "this deployment's work position is an isolated worktree; direct principal bootstrap v1 supports in-place execution only — worktree execution belongs to the D2 worker path",
      );
    }
    const repository = this.#inPlaceRepository();
    // §E.4.2: an empty write scope is a task that provably cannot complete, since a completed attempt
    // must have observable changes and every change would fall outside the scope.
    if (input.writePaths.length === 0) {
      throw new DomainValidationError(
        "begin requires a non-empty write scope: a completed attempt must have observable work, and with no declared write path every change would be out of scope — if this task only needs analysis it belongs to a reasoning branch, a verification or a cross-project ask",
      );
    }
    const standard = this.#standard;
    if (standard === undefined || !standard.confirmed) {
      throw new DomainValidationError(
        "NEEDS_STANDARD_CONFIRMATION: this project has no confirmed completion standard, and begin cannot mint one — the operator states one sentence, the product proposes it from the repository, and begin becomes available once they confirm it",
      );
    }

    const requiredArtifacts = [...(input.requiredArtifacts ?? [])];
    const taskSpec: TaskSpec = {
      task_id: DIRECT_TASK_ID,
      objective: goal,
      depends_on: [],
      write_paths: [...input.writePaths],
      required_artifacts: requiredArtifacts,
    };

    const canonical = this.isProjectInitialized() ? this.#project() : null;

    // S3: a canonical project that is not the SAME direct work is a conflict, never a silent rewrite.
    // The judgement is semantic equivalence, not provenance — with no direct marker, "who created
    // this one-task project" is undecidable, and adding a marker is exactly what the spec forbids.
    if (canonical !== null && !directShapeEquivalent(canonical, taskSpec)) {
      throw new DomainValidationError(
        "CONFLICT: this project already has a plan, and direct bootstrap will not silently rewrite an existing plan — use an existing ready task, or make an explicit plan revision",
      );
    }

    // S2: the principal already has a RUNNING attempt for this same work. Its tree may be dirty and
    // may carry new commits: those changes belong to THAT attempt, so nothing is re-claimed and the
    // scheduler is left alone.
    const running = this.#principalAttemptInState("RUNNING");
    if (canonical !== null && running !== null) {
      return this.#beginProjection("RESUMED", goal, input.writePaths, requiredArtifacts, standard);
    }

    // S1 (and S0): pre-claim there is no legitimate owner yet, so unowned project changes must be
    // zero. Checked HERE, after the S2 early return, because a RUNNING attempt legitimately owns a
    // dirty tree and must not be refused for it.
    this.#assertNoUnownedWork(repository);

    // S1: the project exists but no attempt is running. Pre-claim, the ambient head must still equal
    // the canonical project head — otherwise work done outside this task would be attributed to it.
    if (canonical !== null) {
      const head = this.#observedHead(repository);
      if (head !== canonical.head_commit) {
        throw new DomainValidationError(
          `HEAD_CONFLICT: the canonical project head is ${canonical.head_commit.slice(0, 12)} but the repository is at ${head.slice(0, 12)} — resuming before an attempt exists requires them to agree, or the changes made in between would be attributed to this task`,
        );
      }
    }

    // S0: freeze the WHOLE genesis basis once. Aligning the head alone is not enough — ProjectIR's
    // digest includes committed_at, and the envelope's identity includes the project digest, so a
    // prospective basis built at one instant and a canonical one built at another would differ even
    // when goal, task and head all match.
    const liveHead = this.#observedHead(repository);
    const genesisCommittedAt = this.#now();

    // Prospective basis: build it EXACTLY as start() will, so the digest is byte-identical, then
    // authorize and derive the completion contract from it — all in memory, nothing appended.
    const prospective = buildProjectIr({
      projectId: this.projectId,
      goal,
      requirements: [],
      decisions: [],
      tasks: [taskSpec],
      headCommit: liveHead,
      committedAt: genesisCommittedAt,
    });
    const authorized = this.policy.authorize(prospective, DIRECT_TASK_ID);
    const contract = deriveAttemptCompletionContract({
      standard,
      task: { write_paths: taskSpec.write_paths, required_artifacts: taskSpec.required_artifacts },
      envelope: {
        write_paths: authorized.envelope.write_paths,
        required_artifacts: authorized.envelope.required_artifacts,
        allowed_commands: authorized.envelope.allowed_commands,
      },
    });

    // §E.14.1: before phase 2B exists, a REQUIRED independent verification cannot be met — the
    // composed verifier only understands CURRENT_PROJECT_HEAD, so it must not stand in for an
    // ATTEMPT_RESULT requirement. Fail closed rather than begin work that cannot complete.
    if (contract.verification.required && !this.#capabilities.attemptResultVerificationAvailable) {
      // §B.11: the condition is an EXECUTABLE independent ATTEMPT_RESULT verifier — not "a
      // verification store exists". A boundary task begins only where its requirement can actually be
      // met, which is what makes this a preflight rather than a late dead end.
      throw new DomainValidationError(
        `ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE: this task requires independent verification (${contract.verification.requiredReasons.join("; ")}) and this deployment composes no executable verifier for an attempt result — the operator must register one, and until then this work must not begin`,
      );
    }

    const readiness = deriveCompletionReadiness({
      standard,
      authorizedCommands: this.authorizedCommands(),
      capabilities: this.#capabilities,
      contract,
    });
    if (readiness.task !== null && readiness.task.state !== "READY") {
      throw new DomainValidationError(
        `begin refused before writing anything: ${readiness.task.blockers.join("; ")}`,
      );
    }

    if (canonical === null) {
      // S0: the prospective basis IS the canonical one — same head, same instant.
      this.start({
        projectId: this.projectId,
        goal,
        tasks: [taskSpec],
        headCommit: liveHead,
        committedAt: genesisCommittedAt,
      });
    }

    // S1 continued: claim the attempt. An attempt may ALREADY exist and be claimable — a retry after
    // a crash at the ATTEMPT_CREATED landing point finds it, and stepping again would deadlock
    // because the scheduler returns null once a task occupies the stage.
    const claimable = this.#principalAttemptInState("CREATED");
    if (claimable !== null) {
      await this.claim(claimable);
      return this.#beginProjection("READY", goal, input.writePaths, requiredArtifacts, standard);
    }
    const created = this.#advanceToClaimableAttempt();
    await this.claim(created);
    return this.#beginProjection("READY", goal, input.writePaths, requiredArtifacts, standard);
  }

  /**
   * Drive the scheduler to one claimable direct attempt using lifecycle primitives only.
   *
   * `palimpsest_run` and the pump are FORBIDDEN here: they are mechanical executors and will settle
   * the attempt for the agent. This loop may only reach the point where the principal can start
   * working, and the step bound is a runaway guard, not a semantic budget.
   */
  #advanceToClaimableAttempt(): string {
    for (let step = 0; step < DIRECT_BEGIN_MAX_STEPS; step += 1) {
      const preview = this.preview();
      if (preview.decision !== "next") break;
      if (preview.eventType === "TASK_STARTED") {
        this.step();
        continue;
      }
      if (preview.eventType === "ATTEMPT_CREATED") {
        const entityId = preview.entityId;
        this.step();
        if (entityId !== undefined) return entityId;
        break;
      }
      throw new DomainValidationError(
        `begin refuses to advance past an unexpected scheduler decision (${preview.eventType ?? "unknown"}): direct bootstrap may only commit activation lifecycle events`,
      );
    }
    throw new DomainValidationError(
      "begin could not reach a claimable attempt within its step bound — the plan's ready set produced no direct attempt",
    );
  }

  /** The principal's attempt in one state, or null. Direct bootstrap owns exactly one. */
  #principalAttemptInState(state: "CREATED" | "RUNNING"): string | null {
    const row = this.store.connection
      .prepare("SELECT attempt_id FROM attempts WHERE project_id=? AND state=? ORDER BY attempt_id LIMIT 1")
      .get(this.projectId, state) as { attempt_id: string } | undefined;
    return row?.attempt_id ?? null;
  }

  /** The principal projection: no project, task or attempt id ever crosses this boundary. */
  #beginProjection(
    state: "READY" | "RESUMED",
    goal: string,
    writePaths: readonly string[],
    requiredArtifacts: readonly string[],
    standard: import("../domain/standard.js").ProjectStandard,
  ): {
    readonly state: "READY" | "RESUMED";
    readonly goal: string;
    readonly writeScope: readonly string[];
    readonly requiredArtifacts: readonly string[];
    readonly completion: {
      readonly mechanicalChecks: readonly string[];
      readonly independentVerificationRequired: boolean;
    };
  } {
    // A human-readable summary of what will be required — NOT "testsRequired", because the standard
    // may ask for lint_pass or process_exit_zero, and a wrong-but-simple quality summary is worse
    // than none.
    const checks: string[] = [];
    for (const clause of standard.clauses) {
      if (clause.kind === "command_succeeds") {
        checks.push(`run \`${clause.command.join(" ")}\` and it must succeed (${clause.predicate})`);
      } else if (clause.kind === "files_exist") {
        checks.push(`these declared paths must exist: ${clause.paths.join(", ")}`);
      } else {
        checks.push("changes must stay inside the declared write scope");
      }
    }
    return Object.freeze({
      state,
      goal,
      writeScope: Object.freeze([...writePaths]),
      requiredArtifacts: Object.freeze([...requiredArtifacts]),
      completion: Object.freeze({
        mechanicalChecks: Object.freeze(checks),
        independentVerificationRequired: false,
      }),
    });
  }

  #observedHead(repository: string): string {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
  }

  /**
   * Unowned project changes must be zero before an attempt exists (§E.7). The filter is the SAME one
   * `finish` observes with: `.palimpsest/` is the product's own scaffolding, and a naive
   * `git status --porcelain` would let the product deadlock on its own state directory.
   */
  #assertNoUnownedWork(repository: string): void {
    const unowned = execFileSync("git", ["status", "--porcelain"], { cwd: repository, encoding: "utf8" })
      .split(String.fromCharCode(10))
      .filter((line: string) => line.trim() !== "")
      .map((line: string) => line.slice(3).trim())
      .filter((path: string) => !path.startsWith(".palimpsest/"));
    if (unowned.length === 0) return;
    throw new DomainValidationError(
      `the working tree already has changes that belong to no attempt: ${unowned.join(", ")} — deal with them before managed work begins, or the product cannot prove which changes belong to this task`,
    );
  }

  /**
   * PLMP-LEAN-1 appendix A: the agent states done-ness ONCE and the product derives the rest.
   *
   * The caller says "I think this piece is done" and nothing else — no attempt id, no predicate, no
   * command, no exit code, no changed-file list. Everything mechanical is derived from the confirmed
   * project standard and the attempt's own envelope: which commands to run, what the write scope
   * actually was, whether the declared artifacts exist, and what the attempt's report must say.
   *
   * Every failure path leaves the attempt RUNNING. A failing command, an out-of-scope change and an
   * empty result are all still fixable; settling the attempt would turn them into a result nobody
   * can correct.
   */
  async finish(input: { readonly summary?: string | undefined } = {}): Promise<{
    readonly attemptId: string;
    readonly state: "COMPLETED";
    readonly changedFiles: readonly string[];
    readonly evidenceRecorded: readonly string[];
    readonly nextEvidenceNeeded: readonly string[];
  }> {
    const attemptId = this.#uniqueRunningAttempt();
    // Fail closed rather than pretend. This path derives its facts from an observation of the tree,
    // and only in-place execution puts the work in a tree this controller can read: under worktree
    // execution the tree lives in the attempt's worktree, whose path the git port owns, so a
    // "completion" here would record scope and artifact checks that nothing actually performed.
    if (this.execution !== "in-place") {
      throw new DomainValidationError(
        "this deployment runs worktree execution, and the high-level finish path can only observe an in-place tree — report the attempt explicitly (palimpsest_report) instead, or run the profile with in-place execution",
      );
    }
    const [, envelope] = this.#attemptContext(attemptId);
    const standard = this.#standard;
    if (standard === undefined) {
      throw new DomainValidationError(
        "this project has no confirmed completion standard, so nothing can be derived as done — the operator states one sentence first (it is proposed from the repository and confirmed once), and finish becomes available",
      );
    }

    // The product observes the tree. In-place attempts have no worktree: their tree IS the
    // repository, and the observation — never the caller — decides what the report says changed.
    const observed = this.#observeInPlaceAttemptSync(attemptId, envelope.base_commit);
    const changedFiles = observed.changedFiles;
    // Before any command runs and before any evidence is recorded, so a refusal leaves nothing
    // behind. `report` holds the same invariant as the last line of defence.
    this.#assertCompletionMaterialized(attemptId, observed.uncommitted);

    // Empty work is refused rather than settled (§3.3). Shared with the report path so the automatic
    // pump cannot produce a state this path would refuse.
    this.#assertCompletionHasWork(attemptId, changedFiles);

    // ONE derivation, several consumers (§2.1 / 2A-Q): finish executes the contract's mechanical
    // part, and readiness plus `nextEvidenceNeeded` project the same object — so the bar shown before
    // the work cannot differ from the bar demanded after it.
    const contract = this.#completionContractFor(attemptId);

    const evidenceRecorded: string[] = [];
    for (const check of contract.mechanical) {
      if (check.kind === "assert_write_scope") {
        const scope = envelope.write_paths;
        const outOfScope = changedFiles.filter(
          (path) => !scope.some((allowed) => path === allowed || path.startsWith(`${allowed}/`)),
        );
        if (outOfScope.length > 0) {
          throw new DomainValidationError(
            `attempt ${attemptId} changed paths outside the task envelope's write_paths [${scope.join(", ")}]: ${outOfScope.join(", ")} — revert them or revise the plan with palimpsest_plan; the attempt is still running`,
          );
        }
        this.#recordObservedEvidence(attemptId, "write_scope_valid", {
          changed_files: changedFiles,
          write_paths: [...scope],
          out_of_scope: [],
        });
        evidenceRecorded.push("write_scope_valid");
        continue;
      }
      if (check.kind === "assert_required_artifacts") {
        const root = this.#inPlaceRepository();
        const missing = check.paths.filter((path) => !existsSync(join(root, path)));
        if (missing.length > 0) {
          throw new DomainValidationError(
            `attempt ${attemptId} is missing required artifacts: ${missing.join(", ")} — the attempt is still running; produce them and call finish again`,
          );
        }
        this.#recordObservedEvidence(attemptId, "expected_files_exist", { paths: [...check.paths], missing: [] });
        evidenceRecorded.push("expected_files_exist");
        continue;
      }

      // run_standard_command: executed by the product in the attempt's own tree. The exit code is
      // observed here, so a failure returns as a failure instead of being recorded as a passing
      // predicate (which the evidence contract would reject anyway).
      const command = [...check.command];
      const executable = command[0];
      if (executable === undefined) continue;
      this.#assertGateCommandAllowed(envelope, command);
      const observation = (await runGateCommand(this.effects, {
        worktreeId: attemptId,
        executable,
        argv: command.slice(1),
        ...(this.execution === "in-place" ? { cwd: this.#inPlaceRepository() } : {}),
        scope: this.projectId,
        callId: `finish:${attemptId}:${canonicalDigest({ predicate: check.predicate, command }).slice(0, 16)}`,
        revision: this.promotions.projectRevision(),
      })) as { exitCode: number | null; outputTail: string };
      if (observation.exitCode === null) {
        throw new DomainValidationError(
          `the completion standard's command ${command.join(" ")} produced no observable exit code, so no evidence is recorded — fix that command in the project standard and call finish again`,
        );
      }
      if (observation.exitCode !== 0) {
        throw new DomainValidationError(
          `the completion standard's command ${command.join(" ")} failed (exit ${observation.exitCode})${observation.outputTail === "" ? "" : `: ${observation.outputTail}`} — the attempt is still running; fix the failure and call finish again`,
        );
      }
      this.#rememberGateOutput(attemptId, check.predicate, command, observation.outputTail);
      this.#recordCommandEvidence(attemptId, check.predicate, command, observation.exitCode);
      evidenceRecorded.push(check.predicate);
    }

    // The report and the settlement. In-place reports re-observe the tree, so the recorded
    // changed_files and result_commit are the product's observation rather than the caller's claim.
    // The summary is the agent's own words when it gave any; otherwise the product states what it
    // observed rather than asking the caller for a sentence it does not need.
    this.report(attemptId, {
      workerStatus: "completed",
      summary:
        input.summary ??
        (observed === null
          ? "finished"
          : `finished: ${changedFiles.length} changed file(s) observed in the repository`),
    });

    return {
      attemptId,
      state: "COMPLETED",
      changedFiles,
      evidenceRecorded,
      nextEvidenceNeeded: this.#nextEvidenceNeeded(attemptId),
    };
  }

  /** What this attempt still owes before it may be promoted, in plain predicate names. */
  #nextEvidenceNeeded(attemptId: string): readonly string[] {
    const missing = new Set<string>();
    for (const gateId of this.declaredGateIds()) {
      for (const clause of this.evaluateAttemptGate(gateId, attemptId).next_evidence_needed) {
        missing.add(clause);
      }
    }
    return [...missing].sort();
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
      // There is nothing to run, so nothing can be OBSERVED — and a completed attempt must have left
      // observable work (§3.3). Settling this COMPLETED would mint exactly the zero-work attempt the
      // live gate measured the pump producing, so it is reported as a failure that names the real
      // cause: the deployment, not the work.
      const reportEvent = this.report(attemptId, {
        workerStatus: "failed",
        summary:
          "this envelope authorizes no command, so the automatic executor cannot observe any work — declare a policy command for this project, or run this task through the direct path (palimpsest_finish)",
      });
      return { exitCode: null, reportEvent: reportEvent.event_type };
    }
    const outcome = (await runGateCommand(this.effects, {
      worktreeId: attemptId,
      executable: command.executable,
      argv: command.argv_prefix,
      ...(this.execution === "in-place" ? { cwd: this.#inPlaceRepository() } : {}),
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
  async promoteAttempt(input: {
    attemptId: string;
    gateId?: string | undefined;
    reason?: string | undefined;
  }): Promise<PromoteResult> {
    // async on purpose: the in-place precondition below fails by THROWING, and every caller of
    // this entry point expects a promise (the tool and HTTP surfaces await it), so a synchronous
    // throw would escape their rejection handling.
    if (this.execution === "in-place") this.#assertInPlaceAttemptCurrent(input.attemptId);
    return this.promotions.promoteAttempt(input);
  }

  /**
   * PLMP-LEAN-1 §B.9: the canonical Work record for one attempt, as the VERIFICATION plane reads it.
   *
   * The read lives here, on the Work owner, so the verification plane names no storage column and
   * keeps no shadow envelope cache — the G10-W source firewall pins `envelope_json`'s writers to the
   * projector and its namers to a short list, and this keeps that list short rather than widening it.
   */
  attemptWorkRecord(attemptId: string): {
    readonly state: string;
    readonly taskId: string | null;
    readonly report: unknown;
    readonly envelope: TaskEnvelope | null;
  } | null {
    const attempt = this.store.connection
      .prepare("SELECT task_id, state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(this.projectId, attemptId) as
      | { task_id: string | null; state: string; report_json: unknown }
      | undefined;
    if (attempt === undefined) return null;
    const envelopeRow =
      attempt.task_id === null
        ? undefined
        : (this.store.connection
            .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
            .get(this.projectId, attempt.task_id) as { envelope_json: unknown } | undefined);
    const rawEnvelope = envelopeRow?.envelope_json;
    // A canonical row that cannot be READ is a corrupted record, so it fails loudly here rather than
    // leaking a raw parse error to whichever plane asked.
    const decode = (value: unknown, what: string): unknown => {
      try {
        return decodeJsonBlob(value);
      } catch (error) {
        throw new DomainValidationError(
          `${what} is unreadable: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    let envelope: TaskEnvelope | null = null;
    if (rawEnvelope !== null && rawEnvelope !== undefined) {
      try {
        envelope = parseTaskEnvelope(decode(rawEnvelope, `task "${attempt.task_id}" envelope`));
      } catch (error) {
        throw new DomainValidationError(
          `task "${attempt.task_id}" has an unreadable envelope: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return Object.freeze({
      state: attempt.state,
      taskId: attempt.task_id,
      report:
        attempt.report_json === null || attempt.report_json === undefined
          ? null
          : decode(attempt.report_json, `attempt "${attemptId}" report`),
      envelope,
    });
  }

  /**
   * PLMP-LEAN-1 §1/§4: the operator's one-stop view of this project's governance — the confirmed
   * standard, the commands it authorizes, and the gates already declared. Read-only; it exists so a
   * user-facing surface never has to ask a person for predicate vocabulary or a gate id.
   */
  standard(): import("../domain/standard.js").ProjectStandard | undefined {
    return this.#standard;
  }

  /** The commands this deployment authorizes (the policy bound the envelopes are cut from). */
  authorizedCommands(): readonly { readonly executable: string; readonly argv_prefix: readonly string[] }[] {
    return this.policy.allowed_commands;
  }

  /**
   * PLMP-LEAN-1 §2.1 / 2A-Q: the DERIVED completion contract for one attempt. Pure — the same
   * standard, task declaration, envelope and capabilities always produce the same `basisDigest`, so
   * "the bar did not move after the result was seen" (`INV-7`) is a machine check rather than a
   * promise. It is a function result, not a durable artifact: nothing is stored and no event is
   * appended.
   */
  #completionContractFor(attemptId: string): import("../domain/completion_contract.js").AttemptCompletionContract {
    const [, envelope] = this.#attemptContext(attemptId);
    const standard = this.#standard;
    if (standard === undefined) {
      throw new DomainValidationError(
        "this project has no confirmed completion standard, so no completion contract can be derived — the operator states one sentence first",
      );
    }
    return deriveAttemptCompletionContract({
      standard,
      task: { write_paths: envelope.write_paths, required_artifacts: envelope.required_artifacts },
      envelope: {
        write_paths: envelope.write_paths,
        required_artifacts: envelope.required_artifacts,
        allowed_commands: envelope.allowed_commands,
      },
    });
  }

  /** The contract for one attempt, or null when the project has no confirmed standard yet. */
  completionContract(
    attemptId: string,
  ): import("../domain/completion_contract.js").AttemptCompletionContract | null {
    return this.#standard === undefined ? null : this.#completionContractFor(attemptId);
  }

  /**
   * PLMP-LEAN-1 §5 / 2A-Q: readiness in TWO layers. The deployment layer is answerable at startup;
   * the task layer needs a task, so it is derived from the running attempt's contract when one
   * exists. A deployment fact ("no independent verifier is composed") is a TASK blocker only when
   * this task actually requires one — marking every project NOT READY because some task somewhere
   * might need verification would be dishonest.
   */
  completionReadiness(): import("../domain/completion_contract.js").CompletionReadiness {
    let contract: import("../domain/completion_contract.js").AttemptCompletionContract | undefined;
    if (this.#standard !== undefined) {
      const running = this.store.connection
        .prepare("SELECT attempt_id FROM attempts WHERE project_id=? AND state=? ORDER BY attempt_id LIMIT 1")
        .get(this.projectId, "RUNNING") as { attempt_id: string } | undefined;
      if (running !== undefined) contract = this.#completionContractFor(running.attempt_id);
    }
    return deriveCompletionReadiness({
      standard: this.#standard,
      authorizedCommands: this.authorizedCommands(),
      capabilities: this.#capabilities,
      ...(contract === undefined ? {} : { contract }),
    });
  }

  /** The gate ids already declared on this project's log. */
  declaredGateIds(): readonly string[] {
    return (
      this.store.connection
        .prepare("SELECT gate_id FROM gate_registry WHERE project_id=? ORDER BY gate_id")
        .all(this.projectId) as { gate_id: string }[]
    ).map((row) => row.gate_id);
  }

  /**
   * PLMP-LEAN-1 §1: the command this attempt's envelope authorizes, so no caller needs a packaged
   * default. Returns the envelope's first allowed command; an empty array means the envelope
   * authorizes nothing and the caller must refuse rather than invent one.
   */
  authorizedGateCommand(attemptId: string): string[] {
    const [, envelope] = this.#attemptContext(attemptId);
    const first = envelope.allowed_commands[0];
    return first === undefined ? [] : [first.executable, ...first.argv_prefix];
  }

  /** Whether the release gate this deployment would declare is already on the log. */
  #releaseGateDeclared(): boolean {
    const row = this.store.connection
      .prepare("SELECT COUNT(*) AS c FROM gate_registry WHERE project_id=? AND gate_id=?")
      .get(this.projectId, RELEASE_GATE_ID) as { c: number } | undefined;
    return (row?.c ?? 0) > 0;
  }

  /**
   * In-place promotion precondition: the tree must not have moved past what the attempt's report
   * observed.
   *
   * Measured live: the mechanical pump reported an attempt before the agent had written anything
   * (result_commit = the base), the agent then committed its real work as a CHILD of that commit,
   * and promotion would have merged the recorded commit — a no-op that moves the head to a commit
   * which does not contain the work, silently leaving it behind. A worktree attempt cannot drift
   * like this (its tree is private); an in-place one can, so the recorded commit and the current
   * head must agree, and the remedy is to report again from the current state.
   *
   * This guard is NECESSARY BUT NOT SUFFICIENT on its own, which a probe settled on 2026-09-21: if
   * the agent never committed at all, the recorded commit and the head are both the BASE and agree,
   * so the guard passes while the work sits uncommitted. `#assertCompletionMaterialized` is what
   * makes the two agree on a commit that CONTAINS the work; together they close the hole.
   */
  #assertInPlaceAttemptCurrent(attemptId: string): void {
    const row = this.store.connection
      .prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(this.projectId, attemptId) as { report_json: Uint8Array | null } | undefined;
    if (row?.report_json == null) return; // no report yet: eligibility itself will refuse
    const report = JSON.parse(Buffer.from(row.report_json).toString("utf8")) as {
      result_commit?: string | null;
    };
    const recorded = report.result_commit ?? null;
    if (recorded === null) return;
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: this.#inPlaceRepository(),
      encoding: "utf8",
    }).trim();
    if (head !== recorded) {
      throw new DomainValidationError(
        `in-place attempt ${attemptId} recorded commit ${recorded.slice(0, 12)} but the repository is at ${head.slice(0, 12)}: work landed after the report, so promoting the recorded commit would not contain it — report the attempt again from the current state`,
      );
    }
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
