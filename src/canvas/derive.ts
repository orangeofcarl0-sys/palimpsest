/**
 * PLMP-CANVAS-3/4 derivations: runtime satellite attempts and the trace
 * timeline, both pure reads of the frozen VIS projection (zero new queries,
 * zero event ids on any human face - attempt ids and labels only).
 */

import type { OrchestrationGraph } from "../tools/graph.js";

/** Attempts that still occupy a role slot - exactly the scheduler's open set. */
const OPEN_STATES: ReadonlySet<string> = new Set(["CREATED", "LEASED", "RUNNING"]);

export interface SatelliteAttempt {
  readonly attemptId: string;
  readonly taskId: string;
  /** PLMP-GRAPH-4 (30 号规格): the definition identity (AgentGraph node id);
   * absent when the project was declared from a spec-first proposal. */
  readonly definitionId?: string;
  readonly taskTitle: string;
  readonly role: string;
  readonly state: string;
  /** PLMP-RUNTIME-1: scope membership (G5) and the ephemeral identity face. */
  readonly scopeId?: string;
  readonly origin: "scheduler-activation";
  readonly createdAt?: string;
  readonly attribution?: { readonly model: string; readonly cost: number };
}

export function satelliteAttempts(graph: OrchestrationGraph): SatelliteAttempt[] {
  const satellites: SatelliteAttempt[] = [];
  for (const task of graph.tasks) {
    for (const attempt of task.attempts) {
      if (!OPEN_STATES.has(attempt.state)) continue;
      satellites.push({
        attemptId: attempt.attemptId,
        taskId: task.taskId,
        ...(task.definitionId === undefined ? {} : { definitionId: task.definitionId }),
        taskTitle: task.objective,
        role: task.role,
        state: attempt.state,
        ...(task.scopeId === undefined ? {} : { scopeId: task.scopeId }),
        origin: "scheduler-activation",
        ...(attempt.timeline.length > 0 ? { createdAt: attempt.timeline[0]!.at } : {}),
        ...(attempt.attribution === undefined ? {} : { attribution: attempt.attribution }),
      });
    }
  }
  return satellites;
}

export interface TraceSpan {
  readonly label: string;
  readonly start: string;
  readonly end: string;
}

export interface TraceRow {
  readonly attemptId: string;
  /** PLMP-GRAPH-4 (30 号规格): the definition identity; absent on
   * spec-first projects. */
  readonly definitionId?: string;
  readonly taskTitle: string;
  readonly role: string;
  readonly state: string;
  /** PLMP-RUNTIME-1: scope membership (G5). */
  readonly scopeId?: string;
  readonly spans: readonly TraceSpan[];
}

/** Span per consecutive timeline pair; the final event ends as a marker point. */
export function traceRows(graph: OrchestrationGraph): TraceRow[] {
  const rows: TraceRow[] = [];
  for (const task of graph.tasks) {
    for (const attempt of task.attempts) {
      if (attempt.timeline.length === 0) continue;
      const spans: TraceSpan[] = [];
      for (let i = 0; i < attempt.timeline.length - 1; i += 1) {
        const entry = attempt.timeline[i]!;
        spans.push({ label: entry.label, start: entry.at, end: attempt.timeline[i + 1]!.at });
      }
      const last = attempt.timeline[attempt.timeline.length - 1]!;
      spans.push({ label: last.label, start: last.at, end: last.at });
      rows.push({
        attemptId: attempt.attemptId,
        ...(task.definitionId === undefined ? {} : { definitionId: task.definitionId }),
        taskTitle: task.objective,
        role: task.role,
        state: attempt.state,
        ...(task.scopeId === undefined ? {} : { scopeId: task.scopeId }),
        spans,
      });
    }
  }
  rows.sort((a, b) => a.spans[0]!.start.localeCompare(b.spans[0]!.start));
  return rows;
}
