/**
 * Revision-safe Work evolution: the PURE plan-revision reconciliation.
 *
 * A plan revision (`PROJECT_REVISED`) changes the ProjectIR task graph. Before
 * this module existed, a client that wanted the *complete* structural closure
 * (retire removed runnable tasks, reauthorize retained tasks against the new
 * head, register added tasks) had to replay a sequence of separate append
 * calls, each with its own transaction boundary - so a crash mid-closure left
 * a half-migrated task graph. This module computes, with zero I/O, exactly the
 * closure a revision *would* commit, and says honestly when it refuses to
 * propose one (quiescence, same-id replacement without a lineage protocol,
 * unregistered dependencies).
 *
 * Invariants:
 *   - PURE: no database handle, no clock, no writes. The only authority that
 *     mints an envelope is the injected trusted `TaskPolicy`.
 *   - The basis is explicit: `{ revision, digest }` of the current ProjectIR
 *     and `{ revision, digest, headCommit }` of the next one.
 *   - Task identity for retention is SEMANTIC: deep equality of the canonical
 *     TaskSpec fields, never the `task_id` string alone. A task whose spec
 *     changed under the same id is a `MODIFY_SAME_ID` blocker in v1 (there is
 *     no lineage protocol to prove the new node supersedes the old one).
 *   - A non-quiescent project yields NO partial proposal: all of
 *     `retainedReauthorized`, `added`, and `removedStaled` are empty and a
 *     `quiescence_required` blocker names every UNsettled ACTIVE/VERIFYING task
 *     and every open (CREATED/LEASED/RUNNING) attempt that must settle first.
 *     A caller that supplies `settledTaskIds` (the tasks an explicit typed
 *     invalidation stales inside the same batch) only removes those exact tasks
 *     from the blocking set; everything else in flight still blocks.
 */

import { canonicalDigest, type ProjectIr, type TaskEnvelope, type TaskSpec } from "../schema/index.js";
import type { TaskPolicy } from "./policy.js";

export type TaskDiffClass =
  | "RETAIN_UNCHANGED"
  | "ADD"
  | "REMOVE"
  | "MODIFY_SAME_ID"
  | "TERMINAL_HISTORICAL";

export type PlanReconciliationBlockerKind =
  | "quiescence_required"
  | "replacement_task_id_required"
  | "missing_registration";

export interface PlanReconciliationBlocker {
  readonly kind: PlanReconciliationBlockerKind;
  readonly detail: string;
  readonly refs: readonly string[];
}

export interface PlanRevisionDiff {
  readonly taskId: string;
  readonly class: TaskDiffClass;
  readonly reason: string;
}

export interface PlanRevisionReconciliation {
  readonly schemaVersion: 1;
  readonly basis: { readonly revision: number; readonly digest: string };
  readonly next: { readonly revision: number; readonly digest: string; readonly headCommit: string };
  readonly diffs: readonly PlanRevisionDiff[];
  readonly retainedReauthorized: readonly TaskEnvelope[];
  readonly added: readonly { readonly taskId: string; readonly initial: "READY" | "BLOCKED"; readonly envelope: TaskEnvelope }[];
  readonly removedStaled: readonly string[];
  readonly blocked: readonly PlanReconciliationBlocker[];
  readonly quiescent: boolean;
}

/** One projected task row (state + its CURRENT envelope, if any). */
export interface ReconcileTaskRow {
  readonly taskId: string;
  readonly state: string;
  readonly envelope: TaskEnvelope | null;
}

/** One attempt in an open (non-terminal) state. */
export interface ReconcileAttemptRow {
  readonly attemptId: string;
  readonly taskId: string;
  readonly state: string;
}

export interface CompilePlanRevisionInput {
  readonly current: ProjectIr;
  readonly next: ProjectIr;
  readonly tasks: readonly ReconcileTaskRow[];
  readonly openAttempts: readonly ReconcileAttemptRow[];
  readonly policy: TaskPolicy;
  /**
   * Tasks whose in-flight work (ACTIVE/VERIFYING state or an open attempt) this
   * revision EXPLICITLY settles by staling them inside the same atomic batch.
   * This is the typed-invalidation act: it does not make the world quiescent by
   * fiat, it names the exact tasks whose work is being retired, and any
   * in-flight work OUTSIDE this set still blocks with `quiescence_required`.
   * Absent (or empty) means "nothing is settled" - the default contract.
   */
  readonly settledTaskIds?: readonly string[];
}

const ACTIVE_TASK_STATES: ReadonlySet<string> = new Set(["ACTIVE", "VERIFYING"]);
const OPEN_ATTEMPT_STATES: ReadonlySet<string> = new Set(["CREATED", "LEASED", "RUNNING"]);
const TERMINAL_TASK_STATES: ReadonlySet<string> = new Set(["SATISFIED", "FAILED", "STALE"]);
const RUNNABLE_TASK_STATES: ReadonlySet<string> = new Set(["READY", "BLOCKED"]);

/**
 * Semantic projection of a TaskSpec: exactly the canonical fields that define
 * the task's meaning. Optional fields are included only when present, so an
 * absent optional and an explicit null/undefined compare equal (canonical JSON
 * drops absent keys).
 */
function semanticSpec(task: TaskSpec): Record<string, unknown> {
  const projected: Record<string, unknown> = {
    objective: task.objective,
    depends_on: [...task.depends_on],
    write_paths: [...task.write_paths],
    required_artifacts: [...task.required_artifacts],
  };
  if (task.role !== undefined) projected.role = task.role;
  if (task.suggested_skills !== undefined) projected.suggested_skills = [...task.suggested_skills];
  if (task.scope_id !== undefined) projected.scope_id = task.scope_id;
  if (task.definition_id !== undefined) projected.definition_id = task.definition_id;
  return projected;
}

/** Deep semantic equality of two canonical TaskSpecs (not their ids). */
export function taskSpecsSemanticallyEqual(left: TaskSpec, right: TaskSpec): boolean {
  return canonicalDigest(semanticSpec(left)) === canonicalDigest(semanticSpec(right));
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Compile the revision reconciliation for one candidate plan. Pure: the caller
 * decides whether to commit the returned proposal.
 */
export function compilePlanRevision(input: CompilePlanRevisionInput): PlanRevisionReconciliation {
  const { current, next, policy } = input;
  const basis = { revision: current.revision, digest: current.digest };
  const nextHead = { revision: next.revision, digest: next.digest, headCommit: next.head_commit };

  const projected = new Map<string, ReconcileTaskRow>();
  for (const row of input.tasks) projected.set(row.taskId, row);
  const currentSpecs = new Map(current.tasks.map((task) => [task.task_id, task]));
  const nextSpecs = new Map(next.tasks.map((task) => [task.task_id, task]));

  const activeTaskIds = sortedUnique(
    input.tasks.filter((row) => ACTIVE_TASK_STATES.has(row.state)).map((row) => row.taskId),
  );
  const settled = new Set(input.settledTaskIds ?? []);
  const blockingActiveTaskIds = activeTaskIds.filter((taskId) => !settled.has(taskId));
  const blockingOpenAttempts = input.openAttempts.filter(
    (attempt) => OPEN_ATTEMPT_STATES.has(attempt.state) && !settled.has(attempt.taskId),
  );
  const blockingAttemptIds = sortedUnique(blockingOpenAttempts.map((attempt) => attempt.attemptId));
  const quiescent = blockingActiveTaskIds.length === 0 && blockingAttemptIds.length === 0;

  const diffs: PlanRevisionDiff[] = [];
  if (!quiescent) {
    // No partial proposal: describe the shape, but withhold every actionable
    // list until the world settles.
    for (const taskId of sortedUnique([...projected.keys()])) {
      const row = projected.get(taskId) as ReconcileTaskRow;
      diffs.push({
        taskId,
        class: TERMINAL_TASK_STATES.has(row.state)
          ? "TERMINAL_HISTORICAL"
          : nextSpecs.has(taskId)
            ? "RETAIN_UNCHANGED"
            : "REMOVE",
        reason: `withheld: the project is not quiescent (task ${taskId} is ${row.state})`,
      });
    }
    for (const task of next.tasks) {
      if (!projected.has(task.task_id)) {
        diffs.push({ taskId: task.task_id, class: "ADD", reason: "withheld: the project is not quiescent" });
      }
    }
    return Object.freeze({
      schemaVersion: 1 as const,
      basis,
      next: nextHead,
      diffs: Object.freeze(diffs),
      retainedReauthorized: Object.freeze([]),
      added: Object.freeze([]),
      removedStaled: Object.freeze([]),
      blocked: Object.freeze([
        Object.freeze({
          kind: "quiescence_required" as const,
          detail:
            "the project is not quiescent: every ACTIVE/VERIFYING task and every open (CREATED/LEASED/RUNNING) attempt must settle before a structural revision can be committed",
          refs: Object.freeze([...blockingActiveTaskIds, ...blockingAttemptIds]),
        }),
      ]),
      quiescent: false,
    });
  }

  const retainedReauthorized: TaskEnvelope[] = [];
  const added: { taskId: string; initial: "READY" | "BLOCKED"; envelope: TaskEnvelope }[] = [];
  const removedStaled: string[] = [];
  const blocked: PlanReconciliationBlocker[] = [];
  const states = new Map(input.tasks.map((row) => [row.taskId, row.state]));

  for (const taskId of sortedUnique([...projected.keys()])) {
    const row = projected.get(taskId) as ReconcileTaskRow;
    if (TERMINAL_TASK_STATES.has(row.state)) {
      diffs.push({
        taskId,
        class: "TERMINAL_HISTORICAL",
        reason: `terminal (${row.state}) history is preserved; never reauthorized or staled again`,
      });
      continue;
    }
    const nextTask = nextSpecs.get(taskId);
    if (nextTask === undefined) {
      diffs.push({ taskId, class: "REMOVE", reason: "not declared by the new ProjectIR" });
      removedStaled.push(taskId);
      continue;
    }
    const currentTask = currentSpecs.get(taskId);
    if (currentTask === undefined || !taskSpecsSemanticallyEqual(currentTask, nextTask)) {
      // Same runtime id, different meaning - and v1 has no lineage protocol to
      // prove a replacement, so the honest answer is a blocker, not silent
      // inheritance of the old envelope (or of a new one under the old id).
      diffs.push({
        taskId,
        class: "MODIFY_SAME_ID",
        reason: "the TaskSpec changed under an existing task_id",
      });
      blocked.push({
        kind: "replacement_task_id_required",
        detail: `task '${taskId}' changed meaning under the same id; declare the replacement under a NEW task_id (v1 has no lineage protocol)`,
        refs: [taskId],
      });
      continue;
    }
    if (!RUNNABLE_TASK_STATES.has(row.state)) {
      diffs.push({
        taskId,
        class: "RETAIN_UNCHANGED",
        reason: `spec unchanged; state ${row.state} is neither runnable nor terminal (left untouched)`,
      });
      continue;
    }
    retainedReauthorized.push(policy.authorize(next, taskId).envelope);
    diffs.push({ taskId, class: "RETAIN_UNCHANGED", reason: "spec unchanged; reauthorized against the new head" });
  }

  for (const task of next.tasks) {
    const taskId = task.task_id;
    if (projected.has(taskId)) continue;
    const missing = sortedUnique(task.depends_on.filter((dependency) => !nextSpecs.has(dependency)));
    if (missing.length > 0) {
      diffs.push({ taskId, class: "ADD", reason: "declared dependency is not registered by the new ProjectIR" });
      blocked.push({
        kind: "missing_registration",
        detail: `added task '${taskId}' depends on unregistered task(s): ${missing.join(", ")}`,
        refs: [taskId, ...missing],
      });
      continue;
    }
    const initial: "READY" | "BLOCKED" = task.depends_on.every(
      (dependency) => states.get(dependency) === "SATISFIED",
    )
      ? "READY"
      : "BLOCKED";
    added.push({ taskId, initial, envelope: policy.authorize(next, taskId).envelope });
    diffs.push({ taskId, class: "ADD", reason: `newly declared; initial state ${initial}` });
  }

  if (blocked.length > 0) {
    return Object.freeze({
      schemaVersion: 1 as const,
      basis,
      next: nextHead,
      diffs: Object.freeze(diffs.sort(byTaskId)),
      retainedReauthorized: Object.freeze([]),
      added: Object.freeze([]),
      removedStaled: Object.freeze([]),
      blocked: Object.freeze(blocked.map((entry) => Object.freeze(entry))),
      quiescent: true,
    });
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    basis,
    next: nextHead,
    diffs: Object.freeze(diffs.sort(byTaskId)),
    retainedReauthorized: Object.freeze(retainedReauthorized),
    added: Object.freeze(added),
    removedStaled: Object.freeze(removedStaled),
    blocked: Object.freeze([]),
    quiescent: true,
  });
}

function byTaskId(left: PlanRevisionDiff, right: PlanRevisionDiff): number {
  return left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0;
}
