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
import { tool, ToolArgsError, requiredString } from "./common.js";

export function defineOutcomeTool(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const workspace = application.projectWorkspace;
  if (workspace === undefined) return [];
  return [
    tool({
      name: "palimpsest_outcome",
      description:
        "Read and evaluate the project's BUSINESS OUTCOME separately from Work delivery and acceptance. `contracts` lists the explicit domain contracts this deployment registered; `project` returns the latest recorded evaluation per task (execution state, Work acceptance, business outcome, unmet requirements); `evaluate` runs one named contract over the named artifact/journal facts and records the result as a non-canonical journal note. The caller cannot choose the resulting status: a contract may return supported, infeasible, uncertain, contested or partially_fulfilled, and a negative investigation completes the investigation without completing the business objective.",
      mode: "mutating",
      actions: ["contracts", "project", "evaluate"],
      extraProperties: {
        taskId: { type: "string", description: "for evaluate: the Work task the evaluation is about" },
        contractId: { type: "string", description: "for evaluate: a contract id from `contracts`" },
        artifactPath: { type: "string", description: "for evaluate: the artifact to read (relative to the project or absolute)" },
        parameters: { type: "object", description: "for evaluate: contract-specific facts (e.g. requiredKeys, journalEntryId)" },
      },
      run: async (action, object) => {
        if (action === "contracts") return workspace.outcomeContracts();
        if (action === "project") return workspace.outcomeProject();
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
