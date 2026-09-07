/**
 * PLMP-GRAPH-1 §1.3 + PLMP-GRAPH-2 §1.4 + PLMP-CANVAS-7 (32 号): the doc↔IR
 * pair. CanvasDoc v3 lifts into the AgentGraph IR - task→agent,
 * subflow→subgraph, annotation→annotation, `z`→scope, `doc.edges[]`→IR edges
 * with ids preserved byte-exactly - and capability-clean graphs unload back
 * to a doc. canvasCompile is compileAgentGraph ∘ liftToAgentGraph; there is
 * no second flatten path.
 *
 * G9-D closed the v2 wound: edge ids used to regenerate on the canvas path
 * (`pe9` came back as `e1`), so the strong round-trip invariant
 * `liftToAgentGraph(unloadToCanvasDoc(g)) === g` - node ids, edge ids, node
 * order, edge order, semantic payloads - holds again, and the G9-B3 response
 * digest bridge (digest of the RELIFTED graph) is retired.
 */

import type { AgentGraph, AgentGraphNode, AgentTaskPayload } from "../graph/index.js";
import {
  familyCountersOf,
  parseCanvasDoc,
  type CanvasDoc,
  type CanvasEdge,
  type CanvasIdentityState,
  type CanvasNode,
} from "./doc.js";

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
  // ONE EDGE TRUTH: edges are the doc's own records, ids and order preserved.
  const edges = doc.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, kind: edge.kind }));
  return { version: 1, goal: doc.goal, nodes, edges };
}

/**
 * The inverse lift for capability-clean graphs. Node order and edge order
 * (ids included) are preserved, so lift(unload(g)) ≡ g strictly. Positions
 * come from the map when given; missing entries land on a deterministic grid
 * (patches are position-free by design). The identity state is preserved
 * when the caller supplies it (serve passes the submitted draft's identity,
 * so patch round-trips never rewind the counters); without one the default
 * family is "sys" floored by a scan of the graph's own family ids - which is
 * still enough to never regenerate a family id the graph itself carries.
 * Visual groups and positions remain outside the IR (G9-C scope); non-data
 * edges have no canvas record - the 31 号 apply gate refuses before such a
 * graph ever reaches here in a serve path.
 */
export function unloadToCanvasDoc(
  graph: AgentGraph,
  options?: {
    readonly positions?: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
    readonly identity?: CanvasIdentityState;
  },
): CanvasDoc {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== "data") continue;
    const bucket = incoming.get(edge.target) ?? [];
    bucket.push(edge.source);
    incoming.set(edge.target, bucket);
  }
  const nodes: CanvasNode[] = graph.nodes.map((node, index) => {
    const at = options?.positions?.get(node.id) ?? {
      x: 80 + (index % 4) * 240,
      y: 80 + Math.floor(index / 4) * 140,
    };
    const base = { key: node.id, title: node.label, x: at.x, y: at.y, z: node.scope };
    if (node.kind === "agent") {
      const task = node.task!;
      return {
        ...base,
        type: "task" as const,
        task: {
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
  const edges: CanvasEdge[] = graph.edges
    .filter((edge) => edge.kind === "data")
    .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, kind: "data" as const }));
  const namespace = options?.identity?.namespace ?? "sys";
  const floor = familyCountersOf(namespace, graph.nodes.map((node) => node.id), graph.edges.map((edge) => edge.id));
  const identity: CanvasIdentityState = {
    namespace,
    nextNode: Math.max(options?.identity?.nextNode ?? 1, floor.nextNode),
    nextEdge: Math.max(options?.identity?.nextEdge ?? 1, floor.nextEdge),
  };
  return { version: 3, goal: graph.goal, identity, nodes, edges, groups: [] };
}

function agentPayloadOf(task: CanvasNode["task"]): AgentTaskPayload {
  return {
    ...(task?.writePaths === undefined ? {} : { writePaths: [...task.writePaths] }),
    ...(task?.requiredArtifacts === undefined ? {} : { requiredArtifacts: [...task.requiredArtifacts] }),
    ...(task?.gateId === undefined ? {} : { gateId: task.gateId }),
    ...(task?.role === undefined ? {} : { role: task.role }),
    ...(task?.suggestedSkills === undefined ? {} : { suggestedSkills: [...task.suggestedSkills] }),
  };
}

/**
 * PLMP-GRAPH-5 (31 号 §4) + PLMP-CANVAS-7: the lossy-apply gate. Semantic
 * losses that the canvas round-trip would incur for `graph`, as plain-language
 * reasons - empty means the graph is canvas-representable. The apply gate
 * refuses instead of degrading: no Tool becomes an anonymous annotation, no
 * message edge evaporates. Since v3 the edge comparison is exact and
 * order-sensitive on (id, source, target, kind) - edge ids survive the
 * round-trip, so any mismatch is a real loss, not a regeneration artifact.
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
  // Exact, order-sensitive edge identity comparison (32 号): id + endpoints +
  // kind must all survive, in declaration order. Non-data edges have no
  // canvas record, so the comparison base is the graph's data-edge list;
  // anything else is named below as a loss.
  const edgeSignature = (edge: { readonly id: string; readonly kind: string; readonly source: string; readonly target: string }): string =>
    `${edge.id}:${edge.kind}:${edge.source}->${edge.target}`;
  const want = graph.edges.filter((edge) => edge.kind === "data").map(edgeSignature);
  const got = relifted.edges.map(edgeSignature);
  if (want.join("\n") !== got.join("\n")) {
    const wantSet = new Set(want);
    const gotSet = new Set(got);
    for (const signature of want) {
      if (!gotSet.has(signature)) losses.push(`edge "${signature}" has no canvas representation`);
    }
    for (const signature of got) {
      if (!wantSet.has(signature)) losses.push(`edge "${signature}" would appear out of nowhere`);
    }
    if (losses.every((loss) => !loss.startsWith("edge ")) && want.length === got.length) {
      losses.push("edge declaration order would change (edge ids are stable - order is semantic)");
    }
  }
  for (const edge of graph.edges) {
    if (edge.kind !== "data") {
      losses.push(`edge "${edgeSignature(edge)}" has no canvas representation`);
    }
  }
  return losses;
}
