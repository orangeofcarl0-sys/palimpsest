/**
 * PLMP-GRAPH-1 §1.3 + PLMP-GRAPH-2 §1.4: the doc↔IR pair. CanvasDoc v2
 * lifts into the AgentGraph IR - task→agent, subflow→subgraph,
 * annotation→annotation, `z`→scope, dependency keys→data edges with
 * deterministic ids - and capability-clean graphs unload back to a doc.
 * canvasCompile is compileAgentGraph ∘ liftToAgentGraph; there is no second
 * flatten path.
 */

import type { AgentGraph, AgentGraphNode, AgentTaskPayload } from "../graph/index.js";
import { parseCanvasDoc, type CanvasDoc, type CanvasNode, type CanvasTaskPayload } from "./doc.js";

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
      return {
        id: node.key,
        kind: "subgraph",
        label: node.title,
        scope: node.z,
        ...(node.mode === undefined ? {} : { mode: node.mode }),
      };
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
      return {
        ...base,
        type: "subflow" as const,
        ...(node.mode === undefined ? {} : { mode: node.mode }),
      };
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

/**
 * PLMP-GRAPH-5 (31 号 §4): the lossy-apply gate. Semantic losses that the
 * canvas round-trip would incur for `graph`, as plain-language reasons -
 * empty means the graph is canvas-representable. The apply gate refuses
 * instead of degrading: no Tool becomes an anonymous annotation, no message
 * edge evaporates. Comparison is semantic: node id/kind/label/scope/mode/
 * task/text exactly, edges as an ordered-multiset of (kind, source, target)
 * - edge IDs regenerate on the canvas path until CanvasDoc grows edge
 * identity (32 号 / G9-D), which is a registered difference, not a loss.
 */
export function canvasRoundTripDiff(graph: AgentGraph): string[] {
  let doc: CanvasDoc;
  try {
    doc = parseCanvasDoc(unloadToCanvasDoc(graph));
  } catch (error) {
    return [
      `unload does not parse as a canvas doc: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
  const relifted = liftToAgentGraph(doc);
  const losses: string[] = [];
  const mirrorById = new Map(relifted.nodes.map((node) => [node.id, node]));
  for (const node of graph.nodes) {
    const mirror = mirrorById.get(node.id);
    if (mirror === undefined) {
      losses.push(`node "${node.id}" (kind ${node.kind}) has no canvas representation`);
      continue;
    }
    if (mirror.kind !== node.kind) {
      losses.push(`node "${node.id}": kind "${node.kind}" degrades to "${mirror.kind}" in canvas`);
    }
    if (mirror.label !== node.label) losses.push(`node "${node.id}": label would be lost`);
    if (mirror.scope !== node.scope) {
      losses.push(`node "${node.id}": scope "${node.scope}" would be lost`);
    }
    if (mirror.mode !== node.mode) {
      losses.push(`node "${node.id}": mode would be lost`);
    }
    if (node.kind === "agent" && mirror.kind === "agent") {
      const want = node.task!;
      const got = mirror.task;
      const payloadFields: ReadonlyArray<keyof AgentTaskPayload> = [
        "writePaths",
        "requiredArtifacts",
        "gateId",
        "role",
        "suggestedSkills",
      ];
      for (const field of payloadFields) {
        const wantValue = want[field];
        const gotValue = got === undefined ? undefined : got[field];
        const same =
          wantValue === undefined && gotValue === undefined
            ? true
            : JSON.stringify(wantValue ?? null) === JSON.stringify(gotValue ?? null);
        if (!same) {
          losses.push(`node "${node.id}": task.${field} would be lost`);
        }
      }
    }
    if (node.kind === "annotation" && mirror.kind === "annotation" && mirror.text !== node.text) {
      losses.push(`node "${node.id}": text would be lost`);
    }
  }
  const edgeSignature = (edge: { readonly kind: string; readonly source: string; readonly target: string }): string =>
    `${edge.kind}:${edge.source}->${edge.target}`;
  const want = graph.edges.map(edgeSignature).sort();
  const got = relifted.edges.map(edgeSignature).sort();
  for (const signature of want) {
    const index = got.indexOf(signature);
    if (index === -1) {
      losses.push(`edge "${signature}" has no canvas representation`);
      continue;
    }
    got.splice(index, 1);
  }
  for (const extra of got) {
    losses.push(`edge "${extra}" would appear out of nowhere`);
  }
  return losses;
}
