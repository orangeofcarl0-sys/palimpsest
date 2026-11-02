/**
 * PC1 S06 — the domain-outcome tool.
 *
 * It exposes EXPLICIT contract evaluation: a caller names a contract and the facts it is evaluated
 * against, and the product records the result with its evidence. It cannot name a status, a truth
 * label, or a business objective. A negative investigation completes the investigation contract; the
 * project goal stays unmet until the business outcome is genuinely supported.
 */
import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { HARD_CONSTRAINT_KINDS, type HardConstraintKind } from "../../domain/hard_constraints.js";
import { tool, ToolArgsError, requiredString } from "./common.js";

export function defineOutcomeTool(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const workspace = application.projectWorkspace;
  if (workspace === undefined) return [];
  return [
    tool({
      name: "palimpsest_outcome",
      description:
        "Read and evaluate the project's BUSINESS OUTCOME separately from Work delivery and acceptance. `contracts` lists the explicit domain contracts this deployment registered; `project` returns the latest recorded evaluation per task (execution state, Work acceptance, business outcome, unmet requirements); `evaluate` runs one named contract over the named artifact/journal facts; `check` runs ONE deterministic hard-constraint calculator over explicit inputs and records a non-canonical note. Use `check` BEFORE committing to a plan when a schedule, budget, unit, coverage, source-identity or approval constraint is decisive. The caller cannot choose the resulting status: a contract may return supported, infeasible, uncertain, contested or partially_fulfilled, and a check returns PASS/FAIL/UNKNOWN from the supplied facts with its assumptions stated. A negative investigation completes the investigation without completing the business objective.",
      mode: "mutating",
      actions: ["contracts", "project", "evaluate", "check"],
      extraProperties: {
        taskId: { type: "string", description: "for evaluate/check: the Work task the evaluation is about" },
        contractId: { type: "string", description: "for evaluate: a contract id from `contracts`" },
        artifactPath: { type: "string", description: "for evaluate: the artifact to read (relative to the project or absolute)" },
        parameters: { type: "object", description: "for evaluate: contract-specific facts; for check: the explicit inputs the calculator requires" },
        kind: {
          type: "string",
          enum: [...HARD_CONSTRAINT_KINDS],
          description: "for check: schedule | budget | units | coverage | source-identity | approval",
        },
      },
      run: async (action, object) => {
        if (action === "contracts") return workspace.outcomeContracts();
        if (action === "project") return workspace.outcomeProject();
        if (action === "check") {
          const kind = requiredString(object, "kind") as HardConstraintKind;
          if (!(HARD_CONSTRAINT_KINDS as readonly string[]).includes(kind)) {
            throw new ToolArgsError(`argument "kind" must be one of ${HARD_CONSTRAINT_KINDS.join(", ")}`);
          }
          const parameters = object.parameters;
          if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
            throw new ToolArgsError('argument "parameters" must be an object for check');
          }
          const checkTaskId = object.taskId;
          if (checkTaskId !== undefined && typeof checkTaskId !== "string") throw new ToolArgsError('argument "taskId" must be a string when given');
          return workspace.checkHardConstraint({
            kind,
            parameters: parameters as Readonly<Record<string, unknown>>,
            ...(checkTaskId === undefined ? {} : { taskId: checkTaskId }),
          });
        }
        const taskId = requiredString(object, "taskId");
        const contractId = requiredString(object, "contractId");
        const artifactPath = object.artifactPath;
        if (artifactPath !== undefined && typeof artifactPath !== "string") throw new ToolArgsError('argument "artifactPath" must be a string when given');
        const parameters = object.parameters;
        if (parameters !== undefined && (typeof parameters !== "object" || parameters === null || Array.isArray(parameters))) {
          throw new ToolArgsError('argument "parameters" must be an object when given');
        }
        return workspace.evaluateOutcome({
          taskId,
          contractId,
          ...(artifactPath === undefined ? {} : { artifactPath }),
          ...(parameters === undefined ? {} : { parameters: parameters as Readonly<Record<string, unknown>> }),
        });
      },
    }),
  ];
}
