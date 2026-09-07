/**
 * PLMP-ARCH (18 号规格): the three architecture modes share one validation
 * and declaration face. A preset (ARCH-1), the main agent acting as
 * architect (ARCH-2, zero in-plugin LLM - host-neutral red line), and a
 * hand-crafted visual editor (renderer-side) all produce the same
 * ProjectProposal; the proposal is validated here and declared through the
 * existing start()/plan() channels. An architecture change is a plan
 * revision - the system re-architects only through its own evidence gates.
 */

import type { TaskSpec } from "../schema/index.js";

export interface TaskProposal {
  /** Human-facing stage name; also the dependency key inside the proposal. */
  readonly title: string;
  /** References other tasks in this proposal by title. */
  readonly dependsOn: readonly string[];
  readonly writePaths?: readonly string[];
  readonly requiredArtifacts?: readonly string[];
  /** Advisory: which gate the stage's promotion should require. */
  readonly gateId?: string;
  /** Optional slot role (PLMP-ARCH-3 presets); absent means "implementer". */
  readonly role?: string;
  /** Optional skill hints for the claiming worker (PLMP-CANVAS-2); compiles
   * to the existing TaskSpec.suggested_skills channel - zero event touch. */
  readonly suggestedSkills?: readonly string[];
  /** PLMP-GRAPH-3: runtime-subgraph membership; absent means no scope. */
  readonly scopeId?: string;
}

export interface ProjectProposal {
  readonly goal: string;
  readonly changeClass: "metadata_only" | "backward_compatible" | "behavior_change" | "contract_breaking";
  readonly tasks: readonly TaskProposal[];
}

export type ProposalDiagnosticType =
  | "EMPTY_TASKS"
  | "EMPTY_TITLE"
  | "UNKNOWN_DEPENDENCY"
  | "DEPENDENCY_CYCLE"
  | "MISSING_WRITE_PATHS"
  | "UNKNOWN_GATE";

export interface ProposalDiagnostic {
  readonly type: ProposalDiagnosticType;
  readonly task?: string;
  readonly detail: string;
}

export interface PipelineStageInput {
  readonly title: string;
  readonly writePaths?: readonly string[];
  readonly requiredArtifacts?: readonly string[];
  readonly gateId?: string;
}

/** ARCH-1: the pipeline preset - a linear stage chain with depends_on edges. */
export function pipelinePreset(input: {
  readonly goal: string;
  readonly stages: ReadonlyArray<PipelineStageInput>;
}): ProjectProposal {
  return {
    goal: input.goal,
    changeClass: "behavior_change",
    tasks: input.stages.map((stage, index) => ({
      title: stage.title,
      dependsOn: index === 0 ? [] : [input.stages[index - 1]!.title],
      ...(stage.writePaths === undefined ? {} : { writePaths: [...stage.writePaths] }),
      ...(stage.requiredArtifacts === undefined
        ? {}
        : { requiredArtifacts: [...stage.requiredArtifacts] }),
      ...(stage.gateId === undefined ? {} : { gateId: stage.gateId }),
    })),
  };
}

/** ARCH §1.2: the shared proposal validator (fail-closed; never writes). */
export function validateProjectProposal(
  proposal: ProjectProposal,
  options?: { readonly knownGateIds?: ReadonlySet<string> },
): ProposalDiagnostic[] {
  const diagnostics: ProposalDiagnostic[] = [];
  if (proposal.tasks.length === 0) {
    diagnostics.push({ type: "EMPTY_TASKS", detail: "proposal has no tasks" });
    return diagnostics;
  }
  const titles = proposal.tasks.map((task) => task.title);
  for (const task of proposal.tasks) {
    if (task.title.trim() === "") {
      diagnostics.push({ type: "EMPTY_TITLE", detail: "task title is blank" });
      continue;
    }
    for (const dependency of task.dependsOn) {
      if (!titles.includes(dependency)) {
        diagnostics.push({
          type: "UNKNOWN_DEPENDENCY",
          task: task.title,
          detail: `depends on "${dependency}", which is not in this proposal`,
        });
      }
    }
    if (
      (task.requiredArtifacts?.length ?? 0) > 0 &&
      (task.writePaths?.length ?? 0) === 0
    ) {
      diagnostics.push({
        type: "MISSING_WRITE_PATHS",
        task: task.title,
        detail: "declares required artifacts but no write paths",
      });
    }
    if (
      task.gateId !== undefined &&
      options?.knownGateIds !== undefined &&
      !options.knownGateIds.has(task.gateId)
    ) {
      diagnostics.push({
        type: "UNKNOWN_GATE",
        task: task.title,
        detail: `gate "${task.gateId}" is not declared`,
      });
    }
  }
  // Cycle detection over the title graph (only edges inside the proposal).
  const byTitle = new Map(proposal.tasks.map((task) => [task.title, task]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (title: string): boolean => {
    const mark = state.get(title);
    if (mark === "visiting") return true;
    if (mark === "done") return false;
    state.set(title, "visiting");
    let cyclic = false;
    for (const dependency of byTitle.get(title)?.dependsOn ?? []) {
      if (byTitle.has(dependency) && visit(dependency)) {
        cyclic = true;
        break;
      }
    }
    state.set(title, "done");
    return cyclic;
  };
  for (const title of titles) {
    if (state.get(title) !== "done" && visit(title)) {
      diagnostics.push({ type: "DEPENDENCY_CYCLE", task: title, detail: "dependency cycle detected" });
      break;
    }
  }
  return diagnostics;
}

/** Proposal → TaskSpec[]: deterministic task ids in declaration order. */
export function proposalTaskSpecs(proposal: ProjectProposal): TaskSpec[] {
  const ids = proposal.tasks.map((_, index) => `task-${index + 1}`);
  const idByTitle = new Map(proposal.tasks.map((task, index) => [task.title, ids[index]!]));
  return proposal.tasks.map((task, index) => ({
    task_id: ids[index]!,
    objective: task.title,
    depends_on: task.dependsOn
      .map((dependency) => idByTitle.get(dependency))
      .filter((id): id is string => id !== undefined),
    write_paths: [...(task.writePaths ?? [])],
    required_artifacts: [...(task.requiredArtifacts ?? [])],
    ...(task.role === undefined ? {} : { role: task.role }),
    ...(task.suggestedSkills === undefined ? {} : { suggested_skills: [...task.suggestedSkills] }),
    ...(task.scopeId === undefined ? {} : { scope_id: task.scopeId }),
  }));
}
