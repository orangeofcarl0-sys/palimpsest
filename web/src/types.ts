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
}

export interface TaskProposal {
  title: string;
  dependsOn: string[];
  writePaths?: string[];
  requiredArtifacts?: string[];
  gateId?: string;
}

export interface ProjectProposal {
  goal: string;
  changeClass: string;
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
