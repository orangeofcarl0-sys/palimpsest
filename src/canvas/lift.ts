/**
 * PLMP-GRAPH-1 §1.3: the single compilation path. CanvasDoc v2 lifts into
 * the AgentGraph IR - task→agent, subflow→subgraph, annotation→annotation,
 * `z`→scope, dependency keys→data edges with deterministic ids. canvasCompile
 * is compileAgentGraph ∘ liftToAgentGraph; there is no second flatten path.
 */

import type { AgentGraph, AgentGraphNode, AgentTaskPayload } from "../graph/index.js";
import type { CanvasDoc, CanvasTaskPayload } from "./doc.js";

export function liftToAgentGraph(doc: CanvasDoc): AgentGraph {
  const nodes: AgentGraphNode[] = doc.nodes.map((node): AgentGraphNode => {
    if (node.type === "task") {
      return {
        id: node.key,
        kind: "agent",
        label: node.title,
        scope: node.z,
        task: agentPayloadOf(node.task!),
      };
    }
    if (node.type === "subflow") {
      return { id: node.key, kind: "subgraph", label: node.title, scope: node.z };
    }
    return { id: node.key, kind: "annotation", label: node.title, scope: node.z, text: node.text ?? "" };
  });
  let edgeCounter = 0;
  const edges = doc.nodes.flatMap((node) =>
    (node.task?.dependsOn ?? []).map((source) => {
      edgeCounter += 1;
      return { id: `e${edgeCounter}`, source, target: node.key, kind: "data" as const };
    }),
  );
  return { version: 1, goal: doc.goal, nodes, edges };
}

function agentPayloadOf(task: CanvasTaskPayload): AgentTaskPayload {
  return {
    ...(task.writePaths === undefined ? {} : { writePaths: [...task.writePaths] }),
    ...(task.requiredArtifacts === undefined ? {} : { requiredArtifacts: [...task.requiredArtifacts] }),
    ...(task.gateId === undefined ? {} : { gateId: task.gateId }),
    ...(task.role === undefined ? {} : { role: task.role }),
    ...(task.suggestedSkills === undefined ? {} : { suggestedSkills: [...task.suggestedSkills] }),
  };
}
