/** Structural mirrors of the kernel contracts (VIS-1/2, ARCH) the panel consumes. */

export interface GraphAttempt {
  attemptId: string;
  state: string;
  attribution?: { model: string; cost: number };
  evidence: string[];
  contextManifest?: string;
  timeline: Array<{ at: string; label: string }>;
}

export interface GraphTask {
  taskId: string;
  objective: string;
  state: string;
  role: string;
  dependsOn: string[];
  writePaths: string[];
  requiredArtifacts: string[];
  scopeId?: string;
  /** PLMP-GRAPH-4: the stable definition identity (AgentGraph node id). */
  definitionId?: string;
  /** PLMP-DEBUG-1 + 30: "stale" = hold anchored to an earlier plan revision. */
  held?: "active" | "stale";
  attempts: GraphAttempt[];
}

export interface GraphPromotion {
  promotionId: string;
  attemptId: string;
  state: "PREPARED" | "COMMITTED" | "FAILED";
}

export interface OrchestrationGraph {
  project: { projectId: string; revision: number; goal: string; paused: boolean; cursor: number };
  tasks: GraphTask[];
  promotions: GraphPromotion[];
  runtime?: RuntimeView;
}

export interface TaskProposal {
  title: string;
  dependsOn: string[];
  writePaths?: string[];
  requiredArtifacts?: string[];
  gateId?: string;
  /** Slot role from the preset (ARCH-3); absent means "implementer". */
  role?: string;
  /** PLMP-CANVAS-2: skill hints for the claiming worker. */
  suggestedSkills?: string[];
  /** PLMP-GRAPH-3: runtime-subgraph membership; absent means no scope. */
  scopeId?: string;
  /** PLMP-GRAPH-4: the stable definition identity (AgentGraph node id). */
  definitionId?: string;
}

/** PLMP-ARCH-3: preset metadata mirror (lineage only - no orchestration terms). */
export interface PresetParamField {
  name: string;
  required: boolean;
  description: string;
}

export interface PresetMeta {
  id: string;
  label: string;
  lineage: string;
  description: string;
  paramSpec: PresetParamField[];
}

export type ChangeClass = "metadata_only" | "backward_compatible" | "behavior_change" | "contract_breaking";

export interface ProjectProposal {
  goal: string;
  changeClass: ChangeClass;
  tasks: TaskProposal[];
}

export interface ProposalDiagnostic {
  type: string;
  task?: string;
  detail: string;
}

export const TASK_COLORS: Record<string, string> = {
  READY: "#64748b",
  ACTIVE: "#3b82f6",
  VERIFYING: "#f59e0b",
  SATISFIED: "#22c55e",
  FAILED: "#ef4444",
  STALE: "#a855f7",
};

export const stateColor = (state: string): string => TASK_COLORS[state] ?? "#64748b";

/** PLMP-CANVAS: canvas doc mirrors (client-side authoring scratchpad). */

export interface CanvasTaskPayload {
  dependsOn: string[];
  writePaths?: string[];
  requiredArtifacts?: string[];
  gateId?: string;
  role?: string;
  suggestedSkills?: string[];
}

export interface CanvasNode {
  key: string;
  type: "task" | "subflow" | "annotation";
  title: string;
  x: number;
  y: number;
  z: string;
  g?: string;
  /** PLMP-GRAPH-3: subflows only - absent means editorial. */
  mode?: "runtime";
  task?: CanvasTaskPayload;
  text?: string;
}

export interface CanvasGroup {
  id: string;
  label: string;
  g?: string;
  members: string[];
}

export interface CanvasDoc {
  /** v2 (PLMP-CANVAS-6): task dependencies reference node keys. */
  version: 2;
  goal: string;
  nodes: CanvasNode[];
  groups: CanvasGroup[];
}

export const CANVAS_ROLES = ["implementer", "tester", "verifier", "scout", "analyst"];

export type CanvasLayoutName = "manual" | "flow_lr" | "flow_tb" | "force" | "compact";

export interface CanvasDiffEntry {
  title: string;
}

export interface CanvasDiffChanged {
  title: string;
  fields: string[];
}

export interface CanvasDiffResult {
  added: CanvasDiffEntry[];
  removed: CanvasDiffEntry[];
  changed: CanvasDiffChanged[];
}

export interface TraceSpan {
  label: string;
  start: string;
  end: string;
}

export interface TraceRow {
  attemptId: string;
  definitionId?: string;
  taskTitle: string;
  role: string;
  state: string;
  scopeId?: string;
  spans: TraceSpan[];
}

export interface SatelliteAttempt {
  attemptId: string;
  taskId: string;
  definitionId?: string;
  taskTitle: string;
  role: string;
  state: string;
  scopeId?: string;
  origin: "scheduler-activation";
  createdAt?: string;
  attribution?: { model: string; cost: number };
}

/** PLMP-GRAPH-5 §B2-D: one debugger hold as governance state - survives
 * task renumbering (stale) and removal (orphan). */
export interface HoldControlView {
  taskId: string;
  setAtRevision: number | null;
  currentRevision: number;
  status: "active" | "stale" | "orphan";
  reason: string;
  declaredBy: string;
  definitionId?: string;
}

/** PLMP-RUNTIME-1: one canonical graph, three projections. */
export interface RuntimeView {
  satellites: SatelliteAttempt[];
  traces: TraceRow[];
  roleOccupancy?: Array<{ role: string; occupied: number; slots: number }>;
  controls?: { holds: HoldControlView[] };
}
