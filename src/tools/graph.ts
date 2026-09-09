/**
 * PLMP-VIS-1 §1.1: the read-only orchestration graph projection. A pure
 * re-arrangement of existing projections (tasks / attempts / evidence /
 * promotions / context manifests) into the shape a graph renderer needs -
 * plan graph (tasks + depends_on edges) and run timeline (per-attempt
 * human-language event sequence, retry chains visible). Zero contract
 * touch: nothing here writes, and the JSON carries no event ids or hashes
 * (SDS-18 terminology isolation is machine-guarded by VIS-A03).
 */

import type { DatabaseSync } from "node:sqlite";

import { actionKey, stableEntityId } from "../domain/index.js";
import type { ProjectIr } from "../schema/index.js";

import type { AttemptAttribution } from "./controller.js";
import { satelliteAttempts, traceRows } from "../canvas/derive.js";

export interface GraphAttempt {
  readonly attemptId: string;
  readonly state: string;
  readonly attribution?: { readonly model: string; readonly cost: number } | undefined;
  readonly evidence: readonly string[];
  readonly contextManifest?: string | undefined;
  readonly timeline: ReadonlyArray<{ readonly at: string; readonly label: string }>;
}

export interface GraphTask {
  readonly taskId: string;
  readonly objective: string;
  readonly state: string;
  readonly role: string;
  readonly dependsOn: readonly string[];
  readonly writePaths: readonly string[];
  readonly requiredArtifacts: readonly string[];
  /** PLMP-GRAPH-3: runtime-subgraph membership; absent means no scope. */
  readonly scopeId?: string;
  /** PLMP-GRAPH-4 (30 号规格): the stable definition identity (AgentGraph
   * node id) this task was compiled from; absent on spec-first projects. */
  readonly definitionId?: string;
  /** PLMP-CANVAS-7 D7 (32 号 §12): skill hints are declared Work-definition
   * payload, so the diff needs them on the live side too. Additive optional
   * (SDS-4): absent on legacy specs, digest byte-identical. Proposal gateId
   * stays advisory (20 号) - it never enters TaskSpec, so there is no live
   * gate field to diff. */
  readonly suggestedSkills?: readonly string[];
  /** PLMP-DEBUG-1 + 30 号规格: task-level breakpoint state; absent means not
   * held. "stale" = the hold was set on an earlier plan revision - it no
   * longer gates, but it is still surfaced until explicitly cleared. */
  readonly held?: "active" | "stale";
  readonly attempts: ReadonlyArray<GraphAttempt>;
}

export interface GraphPromotion {
  readonly promotionId: string;
  readonly attemptId: string;
  readonly state: "PREPARED" | "COMMITTED" | "FAILED";
}

/** PLMP-GRAPH-5 §B2-D (31 号修订): one debugger hold as governance state -
 * independent of the current task graph, so stale/orphan controls stay
 * observable. Every field is derived from the ledger (task_holds + the
 * HOLD_SET event's proven revision + the current ProjectIR); nothing is
 * invented. `status`: active = revision matches; stale = the hold anchors an
 * earlier revision (or its revision is unprovable); orphan = the task no
 * longer exists in the current ProjectIR. */
export interface HoldControlView {
  readonly taskId: string;
  readonly setAtRevision: number | null;
  readonly currentRevision: number;
  readonly status: "active" | "stale" | "orphan";
  readonly reason: string;
  readonly declaredBy: string;
  readonly definitionId?: string;
}

export interface OrchestrationGraph {
  readonly project: {
    readonly projectId: string;
    readonly revision: number;
    readonly goal: string;
    readonly paused: boolean;
    readonly cursor: number;
  };
  readonly tasks: ReadonlyArray<GraphTask>;
  readonly promotions: ReadonlyArray<GraphPromotion>;
  /** PLMP-RUNTIME-1: the runtime/trace projections over the same graph -
   * ephemeral attempt instances, span rows, and the declared role capacity
   * view. Absent only in hand-built fixtures predating the node. */
  readonly runtime?: {
    readonly satellites: ReturnType<typeof satelliteAttempts>;
    readonly traces: ReturnType<typeof traceRows>;
    readonly roleOccupancy?: ReadonlyArray<{
      readonly role: string;
      readonly occupied: number;
      readonly slots: number;
    }>;
    /** PLMP-GRAPH-5 §B2-D: the debugger control state as first-class
     * governance projection - includes holds whose task has since been
     * renumbered (stale) or removed (orphan). */
    readonly controls?: {
      readonly holds: ReadonlyArray<HoldControlView>;
    };
  };
}

/** Human-language timeline labels; anything unmapped degrades to a neutral phrase. */
const TIMELINE_LABELS: Record<string, string> = {
  ATTEMPT_CREATED: "尝试已创建",
  ATTEMPT_STARTED: "已认领",
  ATTEMPT_COMPLETED: "已报告完成",
  ATTEMPT_FAILED: "已报告失败",
  ATTEMPT_CANCELLED: "已取消",
  ATTEMPT_EXPIRED: "租约过期",
  ATTEMPT_LATE_RESULT: "迟到返回已按过期记录",
  EVIDENCE_ADDED: "门禁证据已记录",
  EVIDENCE_STALE: "证据已失效",
  PROMOTION_PREPARED: "晋升已预备",
  PROMOTION_COMMITTED: "已晋升",
  PROMOTION_FAILED: "晋升失败",
};

export interface OrchestrationGraphInput {
  readonly projectId: string;
  readonly project: ProjectIr;
  readonly connection: DatabaseSync;
  readonly attribution: ReadonlyMap<string, AttemptAttribution>;
}

export function buildOrchestrationGraph(input: OrchestrationGraphInput): OrchestrationGraph {
  const { projectId, project, connection, attribution } = input;

  const cursorRow = connection
    .prepare("SELECT COALESCE(MAX(event_id), 0) AS m FROM events WHERE project_id=?")
    .get(projectId) as { m: number };
  const pausedRow = connection
    .prepare("SELECT state FROM scheduler_control WHERE project_id=?")
    .get(projectId) as { state: string } | undefined;

  const taskStateRows = connection
    .prepare("SELECT task_id, state FROM tasks WHERE project_id=?")
    .all(projectId) as Array<{ task_id: string; state: string }>;
  const taskStates = new Map(taskStateRows.map((row) => [String(row.task_id), String(row.state)]));

  const attemptRows = connection
    .prepare("SELECT attempt_id, task_id, state FROM attempts WHERE project_id=? ORDER BY last_event_id")
    .all(projectId) as Array<{ attempt_id: string; task_id: string | null; state: string }>;

  const evidenceRows = connection
    .prepare("SELECT evidence_id, evidence_json FROM evidence WHERE project_id=?")
    .all(projectId) as Array<{ evidence_id: string; evidence_json: Uint8Array }>;
  const evidenceBySubject = new Map<string, string[]>();
  for (const row of evidenceRows) {
    const atom = JSON.parse(new TextDecoder().decode(row.evidence_json)) as { subject_id?: unknown };
    if (typeof atom.subject_id !== "string") continue;
    const bucket = evidenceBySubject.get(atom.subject_id) ?? [];
    bucket.push(row.evidence_id);
    evidenceBySubject.set(atom.subject_id, bucket);
  }

  const manifestRows = connection
    .prepare("SELECT manifest_id FROM context_manifests WHERE project_id=?")
    .all(projectId) as Array<{ manifest_id: string }>;
  const manifestIds = new Set(manifestRows.map((row) => row.manifest_id));

  // Fold promotion events (PREPARED → terminal) - the promotions table does
  // not carry the attempt id, the declaration event does.
  const promotionEventRows = connection
    .prepare(
      "SELECT event_type, entity_id, payload_json FROM events " +
        "WHERE project_id=? AND event_type LIKE 'PROMOTION_%' ORDER BY event_id",
    )
    .all(projectId) as Array<{ event_type: string; entity_id: string; payload_json: Uint8Array }>;
  const promotions = new Map<string, GraphPromotion>();
  for (const row of promotionEventRows) {
    const payload = JSON.parse(new TextDecoder().decode(row.payload_json)) as { attempt_id?: unknown };
    if (typeof payload.attempt_id !== "string") continue;
    const state: GraphPromotion["state"] =
      row.event_type === "PROMOTION_COMMITTED"
        ? "COMMITTED"
        : row.event_type === "PROMOTION_FAILED"
          ? "FAILED"
          : "PREPARED";
    promotions.set(String(row.entity_id), {
      promotionId: String(row.entity_id),
      attemptId: payload.attempt_id,
      state,
    });
  }

  // One pass over the project's events builds every attempt timeline.
  const eventRows = connection
    .prepare(
      "SELECT event_type, entity_type, entity_id, payload_json, committed_at FROM events " +
        "WHERE project_id=? ORDER BY event_id",
    )
    .all(projectId) as Array<{
    event_type: string;
    entity_type: string;
    entity_id: string;
    payload_json: Uint8Array;
    committed_at: string;
  }>;
  const timelines = new Map<string, Array<{ at: string; label: string }>>();
  const bump = (attemptId: string, at: string, label: string): void => {
    const bucket = timelines.get(attemptId) ?? [];
    bucket.push({ at, label });
    timelines.set(attemptId, bucket);
  };
  for (const row of eventRows) {
    const label = TIMELINE_LABELS[row.event_type];
    if (label === undefined) continue;
    if (row.entity_type === "attempt") {
      bump(row.entity_id, row.committed_at, label);
      continue;
    }
    const payload = JSON.parse(new TextDecoder().decode(row.payload_json)) as Record<string, unknown>;
    const evidence = payload.evidence as { subject_id?: unknown } | undefined;
    if (typeof evidence?.subject_id === "string") {
      bump(evidence.subject_id, row.committed_at, label);
      continue;
    }
    if (typeof payload.attempt_id === "string") {
      bump(payload.attempt_id, row.committed_at, label);
    }
  }

  const attemptsByTask = new Map<string, GraphAttempt[]>();
  for (const row of attemptRows) {
    const taskId = row.task_id === null ? "" : String(row.task_id);
    const attemptId = String(row.attempt_id);
    const manifestId = stableEntityId(
      "context-manifest",
      actionKey("context-manifest-v1", { project_id: projectId, attempt_id: attemptId }),
    );
    const attributed = attribution.get(attemptId);
    const list = attemptsByTask.get(taskId) ?? [];
    list.push({
      attemptId,
      state: String(row.state),
      evidence: evidenceBySubject.get(attemptId) ?? [],
      ...(manifestIds.has(manifestId) ? { contextManifest: manifestId } : {}),
      timeline: timelines.get(attemptId) ?? [],
      ...(attributed === undefined
        ? {}
        : { attribution: { model: attributed.model, cost: attributed.cost ?? 0 } }),
    });
    attemptsByTask.set(taskId, list);
  }

  // PLMP-GRAPH-4 (30 号规格) + §B2-D + §B3-C: holds carry their plan revision
  // AND their historical definition identity. The GraphTask badge is a
  // convenience face with a strict attribution rule: active holds (revision
  // unchanged ⇒ same IR) always badge; revision-mismatched holds badge only
  // when the historical definitionId is present and still equals the current
  // task's definition - a re-used task_id (different definition, or absent
  // identity) must not read as "was held". The controls projection below is
  // the honest face for every hold regardless.
  const heldRows = connection
    .prepare(
      "SELECT task_id, reason, declared_by, project_revision, definition_id FROM task_holds WHERE project_id=? ORDER BY task_id",
    )
    .all(projectId) as Array<{
    task_id: string;
    reason: string;
    declared_by: string;
    project_revision: number | null;
    definition_id: string | null;
  }>;
  const heldByTask = new Map<string, "active" | "stale">();
  const controls: HoldControlView[] = [];
  for (const row of heldRows) {
    const taskId = String(row.task_id);
    const historicalDefinitionId = row.definition_id === null ? null : String(row.definition_id);
    const setAtRevision = row.project_revision === null ? null : Number(row.project_revision);
    const currentSpec = project.tasks.find((spec) => spec.task_id === taskId);
    const status: HoldControlView["status"] = currentSpec === undefined
      ? "orphan"
      : setAtRevision === null || setAtRevision !== project.revision
        ? "stale"
        : "active";
    controls.push({
      taskId,
      setAtRevision,
      currentRevision: project.revision,
      status,
      reason: String(row.reason),
      declaredBy: String(row.declared_by),
      ...(historicalDefinitionId === null ? {} : { definitionId: historicalDefinitionId }),
    });
    if (currentSpec === undefined) continue; // orphan: no GraphTask face exists
    const badgeable =
      status === "active" ||
      (historicalDefinitionId !== null &&
        currentSpec.definition_id !== undefined &&
        historicalDefinitionId === currentSpec.definition_id);
    if (badgeable && status !== "orphan") {
      heldByTask.set(taskId, status === "active" ? "active" : "stale");
    }
  }
  const tasks: GraphTask[] = project.tasks.map((spec) => {
    const held = heldByTask.get(spec.task_id);
    return {
      taskId: spec.task_id,
      objective: spec.objective,
      state: taskStates.get(spec.task_id) ?? "READY",
      role: spec.role ?? "implementer",
      ...(spec.scope_id === undefined ? {} : { scopeId: spec.scope_id }),
      ...(spec.definition_id === undefined ? {} : { definitionId: spec.definition_id }),
      ...(held === undefined ? {} : { held }),
      dependsOn: spec.depends_on,
      writePaths: spec.write_paths,
      requiredArtifacts: spec.required_artifacts,
      ...(spec.suggested_skills === undefined ? {} : { suggestedSkills: spec.suggested_skills }),
      attempts: attemptsByTask.get(spec.task_id) ?? [],
    };
  });

  const graph: OrchestrationGraph = {
    project: {
      projectId,
      revision: project.revision,
      goal: project.goal,
      paused: pausedRow?.state === "PAUSED",
      cursor: Number(cursorRow.m),
    },
    tasks,
    promotions: [...promotions.values()],
  };
  // PLMP-RUNTIME-1: one canonical graph, three projections. The satellite/
  // trace derivations ride the same payload as the definition graph, and the
  // declared role capacity view (G6) comes from the same ledger.
  const tableRow = connection
    .prepare("SELECT table_json FROM role_tables WHERE project_id=?")
    .get(projectId) as { table_json: Uint8Array } | undefined;
  let roleOccupancy: Array<{ role: string; occupied: number; slots: number }> | undefined;
  if (tableRow !== undefined) {
    const declared = JSON.parse(new TextDecoder().decode(tableRow.table_json)) as {
      roles: Array<{ role: string; slots: number }>;
    };
    const occupied = new Map<string, number>();
    for (const spec of project.tasks) {
      const state = taskStates.get(spec.task_id);
      if (state !== "ACTIVE" && state !== "VERIFYING") continue;
      const role = spec.role ?? "implementer";
      occupied.set(role, (occupied.get(role) ?? 0) + 1);
    }
    roleOccupancy = declared.roles
      .map((entry) => ({
        role: entry.role,
        occupied: occupied.get(entry.role) ?? 0,
        slots: entry.slots,
      }))
      .sort((a, b) => a.role.localeCompare(b.role));
  }
  return {
    ...graph,
    runtime: {
      satellites: satelliteAttempts(graph),
      traces: traceRows(graph),
      ...(roleOccupancy === undefined ? {} : { roleOccupancy }),
      controls: { holds: controls },
    },
  };
}
