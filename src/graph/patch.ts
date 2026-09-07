/**
 * PLMP-GRAPH-2 (25 号规格): GraphPatch - the formal edit protocol over the
 * AgentGraph IR. AI architects never replace a whole graph; they emit a patch
 * that is validated, previewed in plain language, and applied through the
 * existing governance. Patches are semantic (no coordinates) and apply in a
 * fixed order, so the same patch applied twice yields the identical graph.
 */

import type { AgentGraph, AgentGraphEdge, AgentGraphNode, AgentTaskPayload } from "./ir.js";
import { parseAgentGraph, ROOT_SCOPE } from "./ir.js";
import type { ProjectProposal } from "../architecture/index.js";

export interface GraphPatchNodeUpdate {
  readonly id: string;
  readonly label?: string;
  readonly task?: AgentTaskPayload;
  readonly text?: string;
}

export interface GraphPatchEdgeUpdate {
  readonly id: string;
  readonly kind?: AgentGraphEdgePatchKind;
}

type AgentGraphEdgePatchKind =
  | "data"
  | "control"
  | "message"
  | "handoff"
  | "delegation"
  | "evidence"
  | "validation"
  | "aggregation"
  | "retry";

export interface GraphPatchMoveScope {
  readonly id: string;
  readonly scope: string;
}

export interface GraphPatch {
  readonly baseRevision?: number;
  readonly addNodes: readonly AgentGraphNode[];
  readonly removeNodes: readonly string[];
  readonly updateNodes: readonly GraphPatchNodeUpdate[];
  readonly addEdges: readonly AgentGraphEdge[];
  readonly removeEdges: readonly string[];
  readonly updateEdges: readonly GraphPatchEdgeUpdate[];
  readonly moveScope: readonly GraphPatchMoveScope[];
}

export type GraphPatchDiagnosticType =
  | "STALE_BASE"
  | "UNKNOWN_NODE"
  | "UNKNOWN_EDGE"
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_EDGE_ID"
  | "NODE_HAS_EDGES"
  | "EDGE_ENDPOINT_UNKNOWN"
  | "EDGE_SELF_LOOP"
  | "INVALID_MOVE_SCOPE"
  | "SCOPE_CYCLE";

export interface GraphPatchDiagnostic {
  readonly type: GraphPatchDiagnosticType;
  readonly id?: string;
  readonly detail: string;
}

export interface GraphPatchPreviewEntry {
  readonly op: "add" | "remove" | "update" | "move";
  readonly target: "node" | "edge";
  readonly id: string;
  readonly detail: string;
}

export const EMPTY_PATCH: GraphPatch = {
  addNodes: [],
  removeNodes: [],
  updateNodes: [],
  addEdges: [],
  removeEdges: [],
  updateEdges: [],
  moveScope: [],
};

/** Pure validation; deterministic diagnostic order (apply order). */
export function validateGraphPatch(
  base: AgentGraph,
  patch: GraphPatch,
  options?: { readonly liveRevision?: number },
): GraphPatchDiagnostic[] {
  const diagnostics: GraphPatchDiagnostic[] = [];
  if (patch.baseRevision !== undefined && options?.liveRevision !== undefined && patch.baseRevision !== options.liveRevision) {
    diagnostics.push({
      type: "STALE_BASE",
      detail: `patch anchors revision ${patch.baseRevision}, live is ${options.liveRevision}`,
    });
  }
  const nodeIds = new Set(base.nodes.map((node) => node.id));
  const edgeIds = new Set(base.edges.map((edge) => edge.id));
  for (const id of patch.removeNodes) {
    if (!nodeIds.has(id)) diagnostics.push({ type: "UNKNOWN_NODE", id, detail: `node "${id}" does not exist` });
  }
  for (const id of patch.removeEdges) {
    if (!edgeIds.has(id)) diagnostics.push({ type: "UNKNOWN_EDGE", id, detail: `edge "${id}" does not exist` });
  }
  for (const update of patch.updateNodes) {
    if (!nodeIds.has(update.id)) {
      diagnostics.push({ type: "UNKNOWN_NODE", id: update.id, detail: `node "${update.id}" does not exist` });
    }
  }
  for (const update of patch.updateEdges) {
    if (!edgeIds.has(update.id)) {
      diagnostics.push({ type: "UNKNOWN_EDGE", id: update.id, detail: `edge "${update.id}" does not exist` });
    }
  }
  for (const node of patch.addNodes) {
    if (nodeIds.has(node.id)) {
      diagnostics.push({ type: "DUPLICATE_NODE_ID", id: node.id, detail: `node "${node.id}" already exists` });
    }
  }
  const addedEdgeIds = new Set<string>();
  for (const edge of patch.addEdges) {
    if (edgeIds.has(edge.id) || addedEdgeIds.has(edge.id)) {
      diagnostics.push({ type: "DUPLICATE_EDGE_ID", id: edge.id, detail: `edge "${edge.id}" already exists` });
    }
    addedEdgeIds.add(edge.id);
  }
  // Removals happen before additions (fixed apply order), so a node being
  // added may legitimately be an endpoint of an added edge, but a node being
  // removed in the same patch cannot keep edges behind.
  const removedNodes = new Set(patch.removeNodes);
  const removedEdges = new Set(patch.removeEdges);
  const survivingEdges = base.edges.filter((edge) => !removedEdges.has(edge.id));
  for (const edge of survivingEdges) {
    for (const endpoint of [edge.source, edge.target]) {
      if (removedNodes.has(endpoint)) {
        diagnostics.push({
          type: "NODE_HAS_EDGES",
          id: endpoint,
          detail: `node "${endpoint}" is removed but edge "${edge.id}" still references it`,
        });
      }
    }
  }
  const knownAfterAdd = new Set([...nodeIds, ...patch.addNodes.map((node) => node.id)]);
  for (const edge of patch.addEdges) {
    for (const endpoint of [edge.source, edge.target]) {
      if (!knownAfterAdd.has(endpoint)) {
        diagnostics.push({
          type: "EDGE_ENDPOINT_UNKNOWN",
          id: edge.id,
          detail: `edge "${edge.id}" references unknown node "${endpoint}"`,
        });
      }
    }
    if (edge.source === edge.target) {
      diagnostics.push({ type: "EDGE_SELF_LOOP", id: edge.id, detail: `edge "${edge.id}" connects "${edge.source}" to itself` });
    }
  }
  const subgraphIds = new Set(
    [...base.nodes, ...patch.addNodes].filter((node) => node.kind === "subgraph").map((node) => node.id),
  );
  const scopeOf = new Map<string, string>();
  for (const node of base.nodes) scopeOf.set(node.id, node.scope);
  for (const node of patch.addNodes) scopeOf.set(node.id, node.scope);
  for (const move of patch.moveScope) {
    if (!knownAfterAdd.has(move.id)) {
      diagnostics.push({ type: "UNKNOWN_NODE", id: move.id, detail: `node "${move.id}" does not exist` });
      continue;
    }
    if (move.scope !== ROOT_SCOPE && !subgraphIds.has(move.scope)) {
      diagnostics.push({
        type: "INVALID_MOVE_SCOPE",
        id: move.id,
        detail: `move target "${move.scope}" is not a subgraph`,
      });
    }
    scopeOf.set(move.id, move.scope);
  }
  // Containment integrity of the RESULT graph (scope chains terminate).
  // One diagnostic per validation pass: every member of a ring reports the
  // same breakage, so the walk reports the first detection only.
  for (const [id, scope] of scopeOf) {
    if (scope === ROOT_SCOPE) continue;
    if (scope === id) {
      diagnostics.push({ type: "SCOPE_CYCLE", id, detail: `node "${id}" cannot scope itself` });
      break;
    }
    const seen = new Set<string>([id]);
    let current: string | undefined = scope;
    let cyclic = false;
    while (current !== undefined && current !== ROOT_SCOPE) {
      if (seen.has(current)) {
        diagnostics.push({ type: "SCOPE_CYCLE", id, detail: `scope cycle through "${current}"` });
        cyclic = true;
        break;
      }
      seen.add(current);
      current = scopeOf.get(current);
    }
    if (cyclic) break;
  }
  return diagnostics;
}

/**
 * Apply in the fixed order; fail-closed on any diagnostic. Validation runs
 * first (a bogus remove must be refused, not silently dropped); the result
 * is then re-parsed so every IR invariant holds on the output.
 */
export function applyGraphPatch(base: AgentGraph, patch: GraphPatch): AgentGraph {
  const diagnostics = validateGraphPatch(base, patch);
  if (diagnostics.length > 0) {
    const first = diagnostics[0]!;
    throw new Error(`graph patch: ${first.type}: ${first.detail}`);
  }
  const removedNodes = new Set(patch.removeNodes);
  const removedEdges = new Set(patch.removeEdges);
  const updateById = new Map(patch.updateNodes.map((update) => [update.id, update]));
  const edgeUpdateById = new Map(patch.updateEdges.map((update) => [update.id, update]));
  const moveById = new Map(patch.moveScope.map((move) => [move.id, move]));

  const nodes: AgentGraphNode[] = [
    ...base.nodes
      .filter((node) => !removedNodes.has(node.id))
      .map((node): AgentGraphNode => {
        const update = updateById.get(node.id);
        const move = moveById.get(node.id);
        if (update === undefined && move === undefined) return node;
        return {
          ...node,
          ...(update?.label === undefined ? {} : { label: update.label }),
          ...(update?.task === undefined ? {} : { task: update.task }),
          ...(update?.text === undefined ? {} : { text: update.text }),
          ...(move === undefined ? {} : { scope: move.scope }),
        };
      }),
    ...patch.addNodes.map((node) => {
      const move = moveById.get(node.id);
      return move === undefined ? node : { ...node, scope: move.scope };
    }),
  ];
  const edges = [
    ...base.edges
      .filter((edge) => !removedEdges.has(edge.id))
      .map((edge) => {
        const update = edgeUpdateById.get(edge.id);
        return update?.kind === undefined || update.kind === edge.kind
          ? edge
          : { ...edge, kind: update.kind };
      }),
    ...patch.addEdges,
  ];
  return parseAgentGraph({ version: 1, goal: base.goal, nodes, edges });
}

/** Plain-language preview lines in the fixed apply order. */
export function diffGraphPatch(base: AgentGraph, patch: GraphPatch): GraphPatchPreviewEntry[] {
  const nodeLabel = new Map(base.nodes.map((node) => [node.id, node.label]));
  for (const node of patch.addNodes) nodeLabel.set(node.id, node.label);
  const preview: GraphPatchPreviewEntry[] = [];
  for (const id of patch.removeEdges) {
    preview.push({ op: "remove", target: "edge", id, detail: `边 ${id}` });
  }
  for (const id of patch.removeNodes) {
    preview.push({ op: "remove", target: "node", id, detail: `节点 ${nodeLabel.get(id) ?? id}` });
  }
  for (const node of patch.addNodes) {
    preview.push({ op: "add", target: "node", id: node.id, detail: `${node.kind === "subgraph" ? "子图" : node.kind === "annotation" ? "注记" : "Agent"} ${node.label}` });
  }
  for (const update of patch.updateNodes) {
    const before = base.nodes.find((node) => node.id === update.id);
    const what =
      update.label !== undefined && before?.label !== undefined && update.label !== before.label
        ? `改名 ${before.label} → ${update.label}`
        : before === undefined
          ? update.label ?? update.id
          : "更新载荷";
    preview.push({ op: "update", target: "node", id: update.id, detail: what });
  }
  for (const move of patch.moveScope) {
    const owner = base.nodes.find((node) => node.id === move.scope);
    preview.push({
      op: "move",
      target: "node",
      id: move.id,
      detail: `移入 ${move.scope === ROOT_SCOPE ? "根层" : (owner?.label ?? move.scope)}`,
    });
  }
  for (const edge of patch.addEdges) {
    preview.push({
      op: "add",
      target: "edge",
      id: edge.id,
      detail: `边 ${nodeLabel.get(edge.source) ?? edge.source} → ${nodeLabel.get(edge.target) ?? edge.target}`,
    });
  }
  for (const update of patch.updateEdges) {
    preview.push({ op: "update", target: "edge", id: update.id, detail: `边 ${update.id}${update.kind === undefined ? "" : ` → ${update.kind}`}` });
  }
  return preview;
}

/**
 * Preset / fragment entry: a proposal (the fragment generator's vocabulary)
 * as a patch over `base`. Fresh node ids are scanned against the base; the
 * proposal's title dependencies map onto the fresh ids (proposals are
 * validated closed, so the mapping is total).
 */
export function patchFromFragment(base: AgentGraph, proposal: ProjectProposal): GraphPatch {
  const usedIds = new Set(base.nodes.map((node) => node.id));
  let next = 1;
  const freshId = (): string => {
    while (usedIds.has(`n${next}`)) next += 1;
    const id = `n${next}`;
    usedIds.add(id);
    return id;
  };
  const ids = proposal.tasks.map(() => freshId());
  const idByTitle = new Map(proposal.tasks.map((task, index) => [task.title, ids[index]!]));
  const addNodes: AgentGraphNode[] = proposal.tasks.map((task, index) => ({
    id: ids[index]!,
    kind: "agent",
    label: task.title,
    scope: ROOT_SCOPE,
    task: {
      ...(task.writePaths === undefined ? {} : { writePaths: [...task.writePaths] }),
      ...(task.requiredArtifacts === undefined ? {} : { requiredArtifacts: [...task.requiredArtifacts] }),
      ...(task.gateId === undefined ? {} : { gateId: task.gateId }),
      ...(task.role === undefined ? {} : { role: task.role }),
      ...(task.suggestedSkills === undefined ? {} : { suggestedSkills: [...task.suggestedSkills] }),
    },
  }));
  let edgeCounter = 0;
  const edgeIds = new Set(base.edges.map((edge) => edge.id));
  const addEdges = proposal.tasks.flatMap((task, index) =>
    task.dependsOn.map((title) => {
      let id = `pe${(edgeCounter += 1)}`;
      while (edgeIds.has(id)) id = `pe${(edgeCounter += 1)}`;
      edgeIds.add(id);
      const source = idByTitle.get(title);
      if (source === undefined) {
        throw new Error(`graph patch: proposal depends on "${title}", which is not in the fragment`);
      }
      return { id, source, target: ids[index]!, kind: "data" as const };
    }),
  );
  return { ...EMPTY_PATCH, addNodes, addEdges };
}
