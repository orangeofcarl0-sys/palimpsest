/**
 * PLMP-GRAPH-1 §1.3 + PLMP-GRAPH-2 §1.4: the doc↔IR pair. CanvasDoc v2
 * lifts into the AgentGraph IR - task→agent, subflow→subgraph,
 * annotation→annotation, `z`→scope, dependency keys→data edges with
 * deterministic ids - and capability-clean graphs unload back to a doc.
 * canvasCompile is compileAgentGraph ∘ liftToAgentGraph; there is no second
 * flatten path.
 */

import type { AgentGraph, AgentGraphNode, AgentTaskPayload } from "../graph/index.js";
import type { CanvasDoc, CanvasNode, CanvasTaskPayload } from "./doc.js";

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

/**
 * PLMP-GRAPH-2 §1.4: the inverse lift for capability-clean graphs. Node
 * order is preserved (lift(unload(g)) ≡ g); a node's dependsOn is its
 * incoming data edges in edge declaration order - exactly how the IR compile
 * reads them. Positions come from the map when given; missing entries land
 * on a deterministic grid (patches are position-free by design).
 */
export function unloadToCanvasDoc(
  graph: AgentGraph,
  positions?: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
): CanvasDoc {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== "data") continue;
    const bucket = incoming.get(edge.target) ?? [];
    bucket.push(edge.source);
    incoming.set(edge.target, bucket);
  }
  const nodes: CanvasNode[] = graph.nodes.map((node, index) => {
    const at = positions?.get(node.id) ?? { x: 80 + (index % 4) * 240, y: 80 + Math.floor(index / 4) * 140 };
    const base = { key: node.id, title: node.label, x: at.x, y: at.y, z: node.scope };
    if (node.kind === "agent") {
      const task = node.task!;
      return {
        ...base,
        type: "task" as const,
        task: {
          dependsOn: incoming.get(node.id) ?? [],
          ...(task.writePaths === undefined ? {} : { writePaths: [...task.writePaths] }),
          ...(task.requiredArtifacts === undefined ? {} : { requiredArtifacts: [...task.requiredArtifacts] }),
          ...(task.gateId === undefined ? {} : { gateId: task.gateId }),
          ...(task.role === undefined ? {} : { role: task.role }),
          ...(task.suggestedSkills === undefined ? {} : { suggestedSkills: [...task.suggestedSkills] }),
        },
      };
    }
    if (node.kind === "subgraph") {
      return { ...base, type: "subflow" as const };
    }
    return { ...base, type: "annotation" as const, text: node.text ?? "" };
  });
  return { version: 2, goal: graph.goal, nodes, groups: [] };
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
