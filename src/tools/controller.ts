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
import { RoleSlotPolicy, BudgetLedger, type ParallelOptions } from "./parallel.js";
import { computeInvalidationSet, changeClassInvalidates } from "../evidence/invalidation.js";
import { GateEngine, type GateDefinition, type GateResult } from "../evidence/gate_dsl.js";
import { runTournament, type PairwiseJudge, type TournamentEntry, type TournamentResult } from "../select/tournament.js";
import { allocate, type Allocation, type AllocationEstimates } from "../allocate/allocator.js";
import { ModelPerformanceTable } from "../telemetry/performance_table.js";
import { ClaimGraph } from "../evidence/graph.js";
import type { ChangeClass, DependencyEdge } from "../evidence/invalidation.js";
import type { TaskRole } from "../schema/index.js";
import { EventStore } from "../state/index.js";
import { Scheduler } from "../scheduler/index.js";
import { PromotionManager, type PromoteResult } from "../effects/promotion.js";
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
}

export interface ProjectControllerOptions {
  store: EventStore;
  effects: PalimpsestEffectsRuntime;
  projectId: string;
  policy: TaskPolicy;
  clock?: (() => string) | undefined;
  /** P3: role-slot admission and attempt budget (defaults: strong, zero-config). */
  parallel?: ParallelOptions | undefined;
  /** R1: registered gates evaluated by evaluateGate (empty default). */
  gates?: readonly GateDefinition[] | undefined;
}

export class ProjectController {
  readonly store: EventStore;
  readonly effects: PalimpsestEffectsRuntime;
  readonly projectId: string;
  readonly policy: TaskPolicy;
  readonly scheduler: Scheduler;
  readonly promotions: PromotionManager;
  readonly slots: RoleSlotPolicy;
  readonly budget: BudgetLedger;
  readonly gates: GateEngine;
  /** R6: telemetry the host records into (success/cost per task_type+model). */
  readonly telemetry = new ModelPerformanceTable();
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
    this.slots = options.parallel?.slots ?? new RoleSlotPolicy();
    this.budget = options.parallel?.budget ?? new BudgetLedger();
    this.gates = new GateEngine();
    for (const gate of options.gates ?? []) {
      this.gates.register(gate);
    }
    this.#clock = options.clock ?? (() => new Date().toISOString());
  }

  #now(): string {
    return canonicalDatetime(this.#clock());
  }

  // -------------------------------------------------------------------------
  // Goal compilation and planning
  // -------------------------------------------------------------------------

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

  /** Claim an attempt: create its worktree and mark it RUNNING. */
  async claim(attemptId: string): Promise<{ worktreePath: string }> {
    const project = this.#project();
    const role = this.#roleOf(attemptId);
    const runningRoles = this.#runningRoles();
    this.slots.assertAdmissible(role, runningRoles);
    this.budget.admit();
    const worktree = await this.effects.invoke(
      this.effects.actions.worktreeCreate,
      { worktreeId: attemptId, baseCommit: project.head_commit },
      { scope: this.projectId, callId: `worktree:${attemptId}` },
    );
    this.scheduler.startAttempt(attemptId);
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
      summary: input.summary,
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
    await this.effects.invoke(
      this.effects.actions.gateCommand,
      {
        worktreeId: input.attemptId,
        executable: input.command[0],
        argv: input.command.slice(1),
      },
      {
        scope: this.projectId,
        callId: `gate:${input.attemptId}:${canonicalDigest({
          predicate: input.predicate,
          command: input.command,
        }).slice(0, 16)}`,
      },
    );
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
    const check = this.evaluateGate(gateId, "attempt", attemptId);
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

  /** R5: the deterministic allocation for one task from a six-dimensional estimate. */
  allocateFor(
    taskId: string,
    estimates: AllocationEstimates,
  ): Allocation {
    const row = this.store.connection
      .prepare("SELECT task_id FROM tasks WHERE project_id=? AND task_id=?")
      .get(this.projectId, taskId);
    if (row === undefined) {
      throw new DomainValidationError("task does not exist");
    }
    return allocate(estimates);
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
   * Recursive pairwise tournament over the completed candidates of the
   * current batch (R4). The judge only ever sees id + summary — never the
   * full AttemptReport — and the winner is the candidate presented for
   * promotion.
   */
  async selectCandidate(judge: PairwiseJudge): Promise<TournamentResult> {
    const rows = this.store.connection
      .prepare(
        "SELECT attempt_id, report_json FROM attempts WHERE project_id=? AND state='COMPLETED'",
      )
      .all(this.projectId) as Array<{ attempt_id: string; report_json: Uint8Array | null }>;
    if (rows.length === 0) {
      throw new DomainValidationError("no completed candidates to select from");
    }
    const entries: TournamentEntry[] = rows.map((row) => {
      // The judge gets the report summary — the report itself never leaks.
      const report = row.report_json === null ? null : decodeJsonBlob(row.report_json);
      return {
        id: row.attempt_id,
        summary:
          report === null ? "completed candidate" : String(report.summary ?? "completed candidate"),
      };
    });
    return runTournament(entries, judge);
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
          "SELECT attempt_id, task_id, state, state_json FROM attempts WHERE project_id=?",
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
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

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
