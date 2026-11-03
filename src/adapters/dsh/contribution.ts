/**
 * APS-A/B — the contribution tool.
 *
 * It records a finding that arrived from another executor and, when the principal actually changes
 * the plan, applies the COMPLETE new task graph through the existing plan-revision owner. It never
 * accepts a result, creates Evidence or promotes anything.
 */
import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool, ToolArgsError, required, requiredString, stringArray } from "./common.js";

const SOURCE_KINDS = ["NATIVE_SUBAGENT", "DELEGATION", "EXPLORATION"] as const;
const DECISIONS = ["ACKNOWLEDGE", "ACCEPT_AS_CANDIDATE", "REJECT", "NEEDS_MORE_EVIDENCE", "REVISE_PLAN"] as const;

function taskInput(raw: unknown): Array<{
  task_id: string;
  objective: string;
  depends_on: string[];
  write_paths: string[];
  required_artifacts: string[];
}> {
  if (!Array.isArray(raw)) throw new ToolArgsError("tasks must be an array");
  return raw.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ToolArgsError("each task must be an object");
    }
    const task = entry as Record<string, unknown>;
    return {
      task_id: requiredString(task, "task_id"),
      objective: requiredString(task, "objective"),
      depends_on: task.depends_on === undefined ? [] : [...stringArray(task.depends_on, "depends_on")],
      write_paths: task.write_paths === undefined ? [] : [...stringArray(task.write_paths, "write_paths")],
      required_artifacts: task.required_artifacts === undefined ? [] : [...stringArray(task.required_artifacts, "required_artifacts")],
    };
  });
}

export function defineContributionTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const contribution = application.contribution;
  if (contribution === undefined) return [];
  const changeClasses = contribution.changeClasses();
  return [
    tool({
      name: "palimpsest_contribute",
      description:
        "Record a finding that ARRIVED from another executor and connect it to the project's actual plan. Use `record` after a native DSH Subagent (sourceKind=NATIVE_SUBAGENT; sourceRef is your label) or a terminal Palimpsest delegation (sourceKind=DELEGATION; sourceRef is the delegation ref) returns something that bears on your next decision. The record carries the project basis, the finding, what the executor DECLARED it read (never an observation of the child process), and an explicit `independentVerification: false`. It is NOT Evidence, acceptance or authority. `decide` records what YOU decided: ACKNOWLEDGE, ACCEPT_AS_CANDIDATE, REJECT, NEEDS_MORE_EVIDENCE, or REVISE_PLAN. `REVISE_PLAN` requires the COMPLETE new task graph and applies it through the existing project-revision owner; the reply reports the ACTUAL revision delta. `changedPlan` alone is only a declaration and is recorded as such. A contribution whose basis is stale is flagged and cannot silently rewrite the plan: re-read the current project, then pass allowStaleBasis only if the finding is still informative on the new basis. `list` returns the recorded chain with each contribution's basis state, decisions, and the downstream task outcome.",
      mode: "mutating",
      actions: ["record", "decide", "list"],
      extraProperties: {
        sourceKind: { type: "string", enum: [...SOURCE_KINDS], description: "where the finding came from" },
        sourceRef: {
          type: "string",
          description: "for record: the delegation ref (DELEGATION) or a stable label for a native subagent / exploration; never an invented read observation",
        },
        task: { type: "string", description: "for record: the question or task the contributor worked on (optional for a delegation; its own question is used)" },
        finding: { type: "string", description: "for record: what the contributor concluded, in your own words (optional for a delegation; its own terminal conclusion is used)" },
        declaredReadFootprint: {
          type: "array",
          items: { type: "string" },
          description: "for record: what the contributor SAID it read; this is a declaration, not an observed footprint",
        },
        artifacts: { type: "array", items: { type: "string" }, description: "for record: candidate files the finding refers to (not accepted artifacts)" },
        contributionId: { type: "string", description: "for decide: the id returned by record" },
        decision: { type: "string", enum: [...DECISIONS], description: "for decide: what you decided about the contribution" },
        decisionNote: { type: "string", description: "for decide: why, in your own words" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              task_id: { type: "string" },
              objective: { type: "string" },
              depends_on: { type: "array", items: { type: "string" } },
              write_paths: { type: "array", items: { type: "string" } },
              required_artifacts: { type: "array", items: { type: "string" } },
            },
            required: ["task_id", "objective"],
          },
          description: "for decide REVISE_PLAN: the COMPLETE new task graph (not a patch)",
        },
        reason: { type: "string", description: "for decide: why the plan revision is being applied" },
        changeClass: {
          type: "string",
          enum: [...changeClasses],
          description: "for decide REVISE_PLAN: optional typed invalidation class for the revision",
        },
        changedIds: {
          type: "array",
          items: { type: "string" },
          description: "for decide REVISE_PLAN: logical ids changed by the revision, when a typed change class is used",
        },
        declaredChangedPlan: {
          type: "boolean",
          description: "for decide: the principal's declaration that the plan changed; a decision without the actual task graph remains declared-only",
        },
        allowStaleBasis: {
          type: "boolean",
          description: "for decide REVISE_PLAN: explicitly allow a plan change from a stale contribution basis; use only after re-reading the project",
        },
      },
      run: async (action, object) => {
        if (action === "list") return contribution.list();
        if (action === "record") {
          const sourceKind = requiredString(object, "sourceKind");
          if (!(SOURCE_KINDS as readonly string[]).includes(sourceKind)) {
            throw new ToolArgsError(`argument "sourceKind" must be one of ${SOURCE_KINDS.join(", ")}`);
          }
          return contribution.record({
            sourceKind: sourceKind as (typeof SOURCE_KINDS)[number],
            sourceRef: requiredString(object, "sourceRef"),
            ...(object.task === undefined ? {} : { task: requiredString(object, "task") }),
            ...(object.finding === undefined ? {} : { finding: requiredString(object, "finding") }),
            ...(object.declaredReadFootprint === undefined
              ? {}
              : { declaredReadFootprint: stringArray(object.declaredReadFootprint, "declaredReadFootprint") }),
            ...(object.artifacts === undefined ? {} : { artifacts: stringArray(object.artifacts, "artifacts") }),
          });
        }
        const decision = requiredString(object, "decision");
        if (!(DECISIONS as readonly string[]).includes(decision)) {
          throw new ToolArgsError(`argument "decision" must be one of ${DECISIONS.join(", ")}`);
        }
        if (object.changeClass !== undefined) {
          const changeClass = requiredString(object, "changeClass");
          if (!changeClasses.includes(changeClass)) {
            throw new ToolArgsError(`argument "changeClass" must be one of ${changeClasses.join(", ")}`);
          }
        }
        if (object.allowStaleBasis !== undefined && typeof object.allowStaleBasis !== "boolean") {
          throw new ToolArgsError('argument "allowStaleBasis" must be a boolean when given');
        }
        return contribution.decide({
          contributionId: requiredString(object, "contributionId"),
          decision: decision as (typeof DECISIONS)[number],
          decisionNote: requiredString(object, "decisionNote"),
          ...(object.tasks === undefined ? {} : { tasks: taskInput(object.tasks) }),
          ...(object.reason === undefined ? {} : { reason: requiredString(object, "reason") }),
          ...(object.changeClass === undefined ? {} : { changeClass: requiredString(object, "changeClass") as never }),
          ...(object.changedIds === undefined ? {} : { changedIds: stringArray(object.changedIds, "changedIds") }),
          ...(object.declaredChangedPlan === undefined ? {} : { declaredChangedPlan: object.declaredChangedPlan === true }),
          ...(object.allowStaleBasis === undefined ? {} : { allowStaleBasis: object.allowStaleBasis === true }),
        });
      },
    }),
  ];
}
