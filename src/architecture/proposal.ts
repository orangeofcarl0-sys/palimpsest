/**
 * PLMP-ARCH (18 号规格): the three architecture modes share one validation
 * and declaration face. A preset (ARCH-1), the main agent acting as
 * architect (ARCH-2, zero in-plugin LLM - host-neutral red line), and a
 * hand-crafted visual editor (renderer-side) all produce the same
 * ProjectProposal; the proposal is validated here and declared through the
 * existing start()/plan() channels. An architecture change is a plan
 * revision - the system re-architects only through its own evidence gates.
 */

import { parseTaskSpec, type TaskSpec } from "../schema/index.js";

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
  /** PLMP-GRAPH-4 (30 号规格): stable definition identity - the AgentGraph
   * node id this task was compiled from. Absent means the proposal did not
   * originate from (or was not reconciled with) a stable graph IR; it is
   * never synthesized as task_id. */
  readonly definitionId?: string;
}

export interface ProjectProposal {
  readonly goal: string;
  readonly changeClass: "metadata_only" | "backward_compatible" | "behavior_change" | "contract_breaking";
  readonly tasks: readonly TaskProposal[];
}

export type ProposalDiagnosticType =
  | "EMPTY_GOAL"
  | "EMPTY_TASKS"
  | "EMPTY_TITLE"
  | "UNKNOWN_DEPENDENCY"
  | "DEPENDENCY_CYCLE"
  | "MISSING_WRITE_PATHS"
  | "UNKNOWN_GATE"
  | "DUPLICATE_DEFINITION_ID"
  | "DUPLICATE_TITLE"
  | "TASK_SPEC_CONTRACT";

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

// ---------------------------------------------------------------------------
// PLMP-GRAPH-5 §B2-B (31 号修订): the strict input contract. First-party
// proposal JSON passes through THIS before validateProjectProposal - shape,
// types and unknown fields here; semantic invariants (cycles, unknown
// dependencies/gates, duplicate definition ids, missing write paths) stay in
// the validator. No layer absorbs the other's job.
// ---------------------------------------------------------------------------

const PROPOSAL_FIELDS: ReadonlySet<string> = new Set(["goal", "changeClass", "tasks"]);

const TASK_PROPOSAL_FIELDS: ReadonlySet<string> = new Set([
  "title",
  "dependsOn",
  "writePaths",
  "requiredArtifacts",
  "gateId",
  "role",
  "suggestedSkills",
  "scopeId",
  "definitionId",
]);

const CHANGE_CLASSES: ReadonlySet<string> = new Set([
  "metadata_only",
  "backward_compatible",
  "behavior_change",
  "contract_breaking",
]);

function failProposal(message: string): never {
  throw new Error(`project proposal: ${message}`);
}

function proposalObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    failProposal(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function proposalString(value: unknown, what: string): string {
  if (typeof value !== "string") failProposal(`${what} must be a string`);
  return value;
}

function proposalStringArray(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) failProposal(`${what} must be an array of strings`);
  return value.map((entry, index) => proposalString(entry, `${what}[${index}]`));
}

function parseTaskProposal(value: unknown): TaskProposal {
  const raw = proposalObject(value, "task");
  for (const field of Object.keys(raw)) {
    if (!TASK_PROPOSAL_FIELDS.has(field)) failProposal(`unknown task field "${field}"`);
  }
  if (!Object.hasOwn(raw, "title")) failProposal("title: field is required");
  if (!Object.hasOwn(raw, "dependsOn")) failProposal("dependsOn: field is required");
  const title = proposalString(raw["title"], "title");
  const dependsOn = proposalStringArray(raw["dependsOn"], "dependsOn");
  const writePaths =
    raw["writePaths"] === undefined ? undefined : proposalStringArray(raw["writePaths"], "writePaths");
  const requiredArtifacts =
    raw["requiredArtifacts"] === undefined
      ? undefined
      : proposalStringArray(raw["requiredArtifacts"], "requiredArtifacts");
  const gateId = raw["gateId"] === undefined ? undefined : proposalString(raw["gateId"], "gateId");
  const role = raw["role"] === undefined ? undefined : proposalString(raw["role"], "role");
  const suggestedSkills =
    raw["suggestedSkills"] === undefined
      ? undefined
      : proposalStringArray(raw["suggestedSkills"], "suggestedSkills");
  const scopeId = raw["scopeId"] === undefined ? undefined : proposalString(raw["scopeId"], "scopeId");
  const definitionId =
    raw["definitionId"] === undefined ? undefined : proposalString(raw["definitionId"], "definitionId");
  return {
    title,
    dependsOn,
    ...(writePaths === undefined ? {} : { writePaths }),
    ...(requiredArtifacts === undefined ? {} : { requiredArtifacts }),
    ...(gateId === undefined ? {} : { gateId }),
    ...(role === undefined ? {} : { role }),
    ...(suggestedSkills === undefined ? {} : { suggestedSkills }),
    ...(scopeId === undefined ? {} : { scopeId }),
    ...(definitionId === undefined ? {} : { definitionId }),
  };
}

/** Strict parse of an untrusted ProjectProposal (the architect input boundary). */
export function parseProjectProposal(value: unknown): ProjectProposal {
  const raw = proposalObject(value, "proposal");
  for (const field of Object.keys(raw)) {
    if (!PROPOSAL_FIELDS.has(field)) failProposal(`unknown proposal field "${field}"`);
  }
  if (!Object.hasOwn(raw, "goal")) failProposal("goal: field is required");
  if (!Object.hasOwn(raw, "changeClass")) failProposal("changeClass: field is required");
  if (!Object.hasOwn(raw, "tasks")) failProposal("tasks: field is required");
  const goal = proposalString(raw["goal"], "goal");
  const changeClass = proposalString(raw["changeClass"], "changeClass");
  if (!CHANGE_CLASSES.has(changeClass)) {
    failProposal(
      `changeClass must be one of ${[...CHANGE_CLASSES].join("/")}, got "${changeClass}"`,
    );
  }
  if (!Array.isArray(raw["tasks"])) failProposal("tasks must be an array");
  return {
    goal,
    changeClass: changeClass as ProjectProposal["changeClass"],
    tasks: raw["tasks"].map(parseTaskProposal),
  };
}

/** ARCH §1.2: the shared proposal validator (fail-closed; never writes). */
export function validateProjectProposal(  proposal: ProjectProposal,
  options?: { readonly knownGateIds?: ReadonlySet<string> },
): ProposalDiagnostic[] {
  const diagnostics: ProposalDiagnostic[] = [];
  // PLMP-CANVAS-7 D10 (PROP-DECL-A01): canonical ProjectIr requires a
  // non-empty goal (parseProjectIr throws on replay), while buildProjectIr
  // itself accepts "" - a validated-clean empty goal would append an event
  // the ledger cannot re-read. The closure lives HERE (the one validator),
  // not in a declaration-specific parser.
  if (proposal.goal.trim() === "") {
    diagnostics.push({ type: "EMPTY_GOAL", detail: "proposal goal is blank - the canonical declaration contract requires a non-empty goal" });
  }
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
  // PLMP-GRAPH-5 §B3-D: the title IS the dependency vocabulary - a duplicate
  // title makes dependency identity ambiguous (title→id mapping becomes
  // last-write-wins), so it is graph identity corruption, not cosmetics.
  const titleSeen = new Set<string>();
  let duplicateTitle = false;
  for (const task of proposal.tasks) {
    if (titleSeen.has(task.title)) {
      duplicateTitle = true;
      diagnostics.push({
        type: "DUPLICATE_TITLE",
        task: task.title,
        detail: `task title "${task.title}" is declared twice - titles are the proposal's dependency key`,
      });
      continue;
    }
    titleSeen.add(task.title);
  }
  // Definition identity integrity: two tasks may not claim the same
  // definition node - that would alias one definition to two runtimes.
  const definitionIds = new Map<string, string>();
  for (const task of proposal.tasks) {
    if (task.definitionId === undefined) continue;
    const owner = definitionIds.get(task.definitionId);
    if (owner !== undefined) {
      diagnostics.push({
        type: "DUPLICATE_DEFINITION_ID",
        task: task.title,
        detail: `definition id "${task.definitionId}" is already claimed by "${owner}"`,
      });
      continue;
    }
    definitionIds.set(task.definitionId, task.title);
  }
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
  // PLMP-GRAPH-5 §B3-D compilability closure: validate clean must imply the
  // proposal compiles into canonical TaskSpecs - so the canonical contract
  // itself is the last check. ContractErrors from parseTaskSpec become
  // structured diagnostics (with the task's title); schema rules are reused,
  // never re-copied. Duplicate titles abort the trial compile: with an
  // ambiguous dependency vocabulary the mapping is not trustworthy (and
  // DUPLICATE_TITLE already refuses the proposal).
  if (!duplicateTitle) {
    const specs = proposalTaskSpecs(proposal);
    for (let index = 0; index < specs.length; index += 1) {
      try {
        parseTaskSpec(specs[index]!);
      } catch (error) {
        diagnostics.push({
          type: "TASK_SPEC_CONTRACT",
          task: proposal.tasks[index]!.title,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
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
    ...(task.definitionId === undefined ? {} : { definition_id: task.definitionId }),
  }));
}
