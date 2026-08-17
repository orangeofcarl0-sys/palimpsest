/** Closed transition tables and state predicates for the unified baseline. */

import type { EventType } from "../schema/index.js";

export const TASK_TERMINAL_STATES: ReadonlySet<string> = new Set([
  "FAILED",
  "SATISFIED",
  "STALE",
]);
export const TASK_ACTIVE_STATES: ReadonlySet<string> = new Set(["ACTIVE", "VERIFYING"]);
export const ATTEMPT_OPEN_STATES: ReadonlySet<string> = new Set([
  "CREATED",
  "LEASED",
  "RUNNING",
]);
export const ATTEMPT_TERMINAL_STATES: ReadonlySet<string> = new Set([
  "COMPLETED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "STALE",
]);

export const TASK_EVENT_TARGET: Partial<Record<EventType, string>> = {
  TASK_BLOCKED: "BLOCKED",
  TASK_READY: "READY",
  TASK_STARTED: "ACTIVE",
  TASK_VERIFYING: "VERIFYING",
  TASK_SATISFIED: "SATISFIED",
  TASK_FAILED: "FAILED",
  TASK_STALE: "STALE",
};

export const TASK_ALLOWED_SOURCES: Record<string, ReadonlySet<string>> = {
  TASK_BLOCKED: new Set(),
  TASK_READY: new Set(["BLOCKED", "ACTIVE", "VERIFYING"]),
  TASK_STARTED: new Set(["READY"]),
  TASK_VERIFYING: new Set(["ACTIVE"]),
  TASK_SATISFIED: new Set(["VERIFYING"]),
  TASK_FAILED: new Set(["ACTIVE", "VERIFYING"]),
  TASK_STALE: new Set(["BLOCKED", "READY", "ACTIVE", "VERIFYING"]),
};

export const ATTEMPT_EVENT_TARGET: Partial<Record<EventType, string>> = {
  ATTEMPT_LEASED: "LEASED",
  ATTEMPT_STARTED: "RUNNING",
  ATTEMPT_COMPLETED: "COMPLETED",
  ATTEMPT_FAILED: "FAILED",
  ATTEMPT_EXPIRED: "EXPIRED",
  ATTEMPT_CANCELLED: "CANCELLED",
  ATTEMPT_LATE_RESULT: "STALE",
};

export const ATTEMPT_ALLOWED_SOURCES: Record<string, ReadonlySet<string>> = {
  ATTEMPT_LEASED: new Set(["CREATED"]),
  ATTEMPT_STARTED: new Set(["CREATED", "LEASED"]),
  ATTEMPT_COMPLETED: new Set(["RUNNING"]),
  ATTEMPT_FAILED: new Set(["RUNNING"]),
  ATTEMPT_EXPIRED: new Set(["RUNNING"]),
  ATTEMPT_CANCELLED: new Set(["RUNNING"]),
  ATTEMPT_LATE_RESULT: new Set(["EXPIRED"]),
};

interface TaskGraphTask {
  task_id: string;
  depends_on: string[];
}

export function validateTaskGraph(tasks: readonly TaskGraphTask[]): void {
  const identifiers = tasks.map((task) => task.task_id);
  const known = new Set(identifiers);
  if (known.size !== identifiers.length) {
    throw new Error("ProjectIR task identifiers must be unique");
  }

  const edges = new Map<string, string[]>();
  for (const task of tasks) {
    const dependencies = task.depends_on;
    if (dependencies.includes(task.task_id)) {
      throw new Error(`Task ${task.task_id} cannot depend on itself`);
    }
    const missing = [...new Set(dependencies)].filter((id) => !known.has(id)).sort();
    if (missing.length > 0) {
      throw new Error(
        `Task ${task.task_id} references unknown dependencies: ${missing.join(", ")}`,
      );
    }
    edges.set(task.task_id, dependencies);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (taskId: string): void => {
    if (visiting.has(taskId)) {
      throw new Error("ProjectIR task dependency graph contains a cycle");
    }
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependency of edges.get(taskId) ?? []) visit(dependency);
    visiting.delete(taskId);
    visited.add(taskId);
  };

  for (const identifier of identifiers) visit(identifier);
}
