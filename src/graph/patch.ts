/**
 * PLMP-GRAPH-2 (25 号规格): GraphPatch - the formal edit protocol over the
 * AgentGraph IR. AI architects never replace a whole graph; they emit a patch
 * that is validated, previewed in plain language, and applied through the
 * existing governance. Patches are semantic (no coordinates) and apply in a
 * fixed order, so the same patch applied twice yields the identical graph.
 */

import type { AgentGraph, AgentGraphEdge, AgentGraphNode, AgentTaskPayload } from "./ir.js";
import {
  AGENT_EDGE_KINDS,
  agentGraphSemanticDigest,
  parseAgentGraph,
  parseAgentGraphEdge,
  parseAgentGraphNode,
  parseAgentTaskPayload,
  ROOT_SCOPE,
} from "./ir.js";
import type { ProjectProposal } from "../architecture/index.js";
import { canonicalDigest } from "../schema/index.js";

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
  /** PLMP-GRAPH-5 §B2-A: authoring semantic freshness - the digest of the
   * draft AgentGraph the patch was written against (agentGraphSemanticDigest).
   * Independent from baseRevision (canonical project freshness); either
   * mismatch refuses the patch. */
  readonly baseGraphDigest?: string;
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
  | "STALE_GRAPH_BASE"
  | "UNKNOWN_NODE"
  | "UNKNOWN_EDGE"
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_EDGE_ID"
  | "NODE_HAS_EDGES"
  | "EDGE_ENDPOINT_UNKNOWN"
  | "EDGE_SELF_LOOP"
  | "INVALID_MOVE_SCOPE"
  | "SCOPE_CYCLE"
  // PLMP-GRAPH-5 (31 号): operation-conflict and result-graph diagnostics.
  | "CONFLICTING_NODE_OPERATION"
  | "CONFLICTING_EDGE_OPERATION"
  | "MOVE_TARGET_REMOVED"
  | "SCOPE_OWNER_REMOVED"
  | "SCOPE_OWNER_INVALID"
  | "ILLEGAL_NODE_UPDATE"
  // PLMP-GRAPH-5 §B2-C: preview honesty - a mutation that changes nothing is
  // refused, never silently normalized away.
  | "NO_OP_OPERATION"
  // Emitted ONLY by the canvas apply gate (serve face) - never by the
  // IR-level validator: the IR legitimately holds semantics the canvas
  // cannot express; the gate refuses lossy unload instead of degrading.
  | "UNREPRESENTABLE_IN_CANVAS";

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

// ---------------------------------------------------------------------------
// PLMP-GRAPH-5 (31 号): the strict input protocol. GraphPatch is the AI edit
// boundary - it parses like CanvasDoc/AgentGraph do (unknown fields, shapes,
// duplicates all fail loudly), never rides an `as` cast into the kernel.
// ---------------------------------------------------------------------------

const PATCH_FIELDS: ReadonlySet<string> = new Set([
  "baseRevision",
  "baseGraphDigest",
  "addNodes",
  "removeNodes",
  "updateNodes",
  "addEdges",
  "removeEdges",
  "updateEdges",
  "moveScope",
]);

const GRAPH_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function failPatch(message: string): never {
  throw new Error(`graph patch: ${message}`);
}

function patchObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    failPatch(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

/** Identity-like strings: node/edge ids and move targets (non-blank). */
function patchIdentifier(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    failPatch(`${what} must be a non-blank string`);
  }
  return value;
}

/** Free-value strings: label/text - exactly as permissive as the AgentGraph
 * grammar for the same field (31 号 §B2-E: add and update share one grammar). */
function patchString(value: unknown, what: string): string {
  if (typeof value !== "string") failPatch(`${what} must be a string`);
  return value;
}

function patchStringList(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) failPatch(`${what} must be an array of node ids`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const id = patchIdentifier(entry, `${what}[${index}]`);
    if (seen.has(id)) failPatch(`duplicate ${what} entry "${id}"`);
    seen.add(id);
    return id;
  });
}

function parseNodeUpdate(value: unknown): GraphPatchNodeUpdate {
  const raw = patchObject(value, "updateNodes entry");
  for (const field of Object.keys(raw)) {
    if (!["id", "label", "task", "text"].includes(field)) {
      failPatch(`unknown updateNodes field "${field}"`);
    }
  }
  const id = patchIdentifier(raw["id"], "updateNodes.id");
  // kind is deliberately absent: node kinds are immutable in patches - a
  // different kind means remove + add a new node, never an in-place morph.
  const label = raw["label"] === undefined ? undefined : patchString(raw["label"], "updateNodes.label");
  const text = raw["text"] === undefined ? undefined : patchString(raw["text"], "updateNodes.text");
  const task = raw["task"] === undefined ? undefined : parseAgentTaskPayload(raw["task"]);
  if (label === undefined && task === undefined && text === undefined) {
    // Syntactic no-op: a mutation entry with nothing to mutate is an input
    // error, not an edit (31 号 §B2-C EMPTY_UPDATE).
    failPatch(`updateNodes entry "${id}" mutates nothing (EMPTY_UPDATE)`);
  }
  return {
    id,
    ...(label === undefined ? {} : { label }),
    ...(task === undefined ? {} : { task }),
    ...(text === undefined ? {} : { text }),
  };
}

function parseEdgeUpdate(value: unknown): GraphPatchEdgeUpdate {
  const raw = patchObject(value, "updateEdges entry");
  for (const field of Object.keys(raw)) {
    if (!["id", "kind"].includes(field)) failPatch(`unknown updateEdges field "${field}"`);
  }
  const id = patchIdentifier(raw["id"], "updateEdges.id");
  const kind = raw["kind"] === undefined ? undefined : patchString(raw["kind"], "updateEdges.kind");
  // Syntactic no-op, symmetric with updateNodes (31 号 §B3): an entry with
  // nothing to mutate is an input error, not an edit.
  if (kind === undefined) failPatch(`updateEdges entry "${id}" mutates nothing (EMPTY_UPDATE)`);
  if (!AGENT_EDGE_KINDS.has(kind)) {
    failPatch(`unknown updateEdges kind "${kind}"`);
  }
  return { id, kind: kind as Exclude<GraphPatchEdgeUpdate["kind"], undefined> };
}

function parseMoveScope(value: unknown): GraphPatchMoveScope {
  const raw = patchObject(value, "moveScope entry");
  for (const field of Object.keys(raw)) {
    if (!["id", "scope"].includes(field)) failPatch(`unknown moveScope field "${field}"`);
  }
  const id = patchIdentifier(raw["id"], "moveScope.id");
  const scope = patchIdentifier(raw["scope"], "moveScope.scope");
  return { id, scope };
}

function parseUniqueTargets<T extends { readonly id: string }>(entries: readonly T[], what: string): T[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) failPatch(`duplicate ${what} target "${entry.id}"`);
    seen.add(entry.id);
  }
  return [...entries];
}

/** Strict parse of an untrusted GraphPatch (the AI input boundary). */
export function parseGraphPatch(value: unknown): GraphPatch {
  const raw = patchObject(value, "patch");
  for (const field of Object.keys(raw)) {
    if (!PATCH_FIELDS.has(field)) failPatch(`unknown patch field "${field}"`);
  }
  const rawBaseRevision = raw["baseRevision"];
  let baseRevision: number | undefined;
  if (rawBaseRevision !== undefined) {
    if (typeof rawBaseRevision !== "number" || !Number.isInteger(rawBaseRevision) || rawBaseRevision < 0) {
      failPatch("baseRevision must be a non-negative integer");
    }
    baseRevision = rawBaseRevision;
  }
  const rawBaseGraphDigest = raw["baseGraphDigest"];
  let baseGraphDigest: string | undefined;
  if (rawBaseGraphDigest !== undefined) {
    if (typeof rawBaseGraphDigest !== "string" || !GRAPH_DIGEST_PATTERN.test(rawBaseGraphDigest)) {
      failPatch("baseGraphDigest must be a lowercase hex SHA-256 digest (agentGraphSemanticDigest)");
    }
    baseGraphDigest = rawBaseGraphDigest;
  }
  for (const list of ["addNodes", "removeNodes", "updateNodes", "addEdges", "removeEdges", "updateEdges", "moveScope"]) {
    if (!Array.isArray(raw[list])) failPatch(`${list} must be an array (omit nothing - send [] like EMPTY_PATCH)`);
  }
  const list = (name: string): unknown[] => raw[name] as unknown[];
  const updateNodes = parseUniqueTargets(list("updateNodes").map(parseNodeUpdate), "updateNodes");
  const updateEdges = parseUniqueTargets(list("updateEdges").map(parseEdgeUpdate), "updateEdges");
  const moveScope = parseUniqueTargets(list("moveScope").map(parseMoveScope), "moveScope");
  return {
    ...(baseRevision === undefined ? {} : { baseRevision }),
    ...(baseGraphDigest === undefined ? {} : { baseGraphDigest }),
    addNodes: list("addNodes").map(parseAgentGraphNode),
    removeNodes: patchStringList(list("removeNodes"), "removeNodes"),
    updateNodes,
    addEdges: list("addEdges").map(parseAgentGraphEdge),
    removeEdges: patchStringList(list("removeEdges"), "removeEdges"),
    updateEdges,
    moveScope,
  };
}

/**
 * The patched graph, built in the fixed apply order. THE single result
 * construction - validateGraphPatch checks THIS, applyGraphPatch commits
 * THIS, so validate=PASS structurally implies apply success (31 §3 H04).
 */
function computePatchedGraph(
  base: AgentGraph,
  patch: GraphPatch,
): { nodes: AgentGraphNode[]; edges: AgentGraphEdge[] } {
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
  const edges: AgentGraphEdge[] = [
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
  return { nodes, edges };
}

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
  // PLMP-GRAPH-5 §B2-A: authoring freshness - independent of the project
  // revision anchor. Either mismatch refuses the patch; neither overrides
  // the other.
  if (patch.baseGraphDigest !== undefined && patch.baseGraphDigest !== agentGraphSemanticDigest(base)) {
    diagnostics.push({
      type: "STALE_GRAPH_BASE",
      detail: `patch anchors graph digest ${patch.baseGraphDigest.slice(0, 12)}…, current draft digest is ${agentGraphSemanticDigest(base).slice(0, 12)}…`,
    });
  }
  const nodeIds = new Set(base.nodes.map((node) => node.id));
  const edgeIds = new Set(base.edges.map((edge) => edge.id));
  // -- operation reference checks ------------------------------------------
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
  // -- operation conflict checks (31 §3): a removal silently swallowing an
  // update/move is a lie between preview and result - refuse, never drop.
  const removedNodes = new Set(patch.removeNodes);
  const removedEdges = new Set(patch.removeEdges);
  for (const update of patch.updateNodes) {
    if (removedNodes.has(update.id)) {
      diagnostics.push({
        type: "CONFLICTING_NODE_OPERATION",
        id: update.id,
        detail: `node "${update.id}" is removed and updated by the same patch`,
      });
    }
  }
  for (const move of patch.moveScope) {
    if (removedNodes.has(move.id)) {
      diagnostics.push({
        type: "CONFLICTING_NODE_OPERATION",
        id: move.id,
        detail: `node "${move.id}" is removed and moved by the same patch`,
      });
    }
  }
  for (const update of patch.updateEdges) {
    if (removedEdges.has(update.id)) {
      diagnostics.push({
        type: "CONFLICTING_EDGE_OPERATION",
        id: update.id,
        detail: `edge "${update.id}" is removed and updated by the same patch`,
      });
    }
  }
  // -- payload/kind legality (31 §3): update.task only applies to agents,
  // update.text only to annotations; wrong combinations are refused here
  // instead of surfacing as a result parse failure.
  const baseNodeById = new Map(base.nodes.map((node) => [node.id, node]));
  for (const update of patch.updateNodes) {
    const node = baseNodeById.get(update.id);
    if (node === undefined) continue; // already reported as UNKNOWN_NODE
    if (update.task !== undefined && node.kind !== "agent") {
      diagnostics.push({
        type: "ILLEGAL_NODE_UPDATE",
        id: update.id,
        detail: `node "${update.id}" is a ${node.kind}; task payloads only apply to agent nodes`,
      });
    }
    if (update.text !== undefined && node.kind !== "annotation") {
      diagnostics.push({
        type: "ILLEGAL_NODE_UPDATE",
        id: update.id,
        detail: `node "${update.id}" is a ${node.kind}; text only applies to annotation nodes`,
      });
    }
  }
  // -- semantic no-op checks (31 号 §B2-C): a mutation that does not change
  // the graph is refused, because preview would claim an edit that the
  // result does not contain. AI-produced no-ops are input errors worth
  // naming, not something to normalize away.
  for (const update of patch.updateNodes) {
    const node = baseNodeById.get(update.id);
    if (node === undefined) continue; // already reported as UNKNOWN_NODE
    if (update.label !== undefined && update.label === node.label) {
      diagnostics.push({
        type: "NO_OP_OPERATION",
        id: update.id,
        detail: `node "${update.id}" label is already "${update.label}"`,
      });
    }
    if (update.text !== undefined && update.text === node.text) {
      diagnostics.push({
        type: "NO_OP_OPERATION",
        id: update.id,
        detail: `node "${update.id}" text is unchanged`,
      });
    }
    if (
      update.task !== undefined &&
      node.task !== undefined &&
      canonicalDigest(update.task) === canonicalDigest(node.task)
    ) {
      diagnostics.push({
        type: "NO_OP_OPERATION",
        id: update.id,
        detail: `node "${update.id}" task payload is unchanged`,
      });
    }
  }
  for (const update of patch.updateEdges) {
    const edge = base.edges.find((entry) => entry.id === update.id);
    if (edge !== undefined && (update.kind === undefined || update.kind === edge.kind)) {
      diagnostics.push({
        type: "NO_OP_OPERATION",
        id: update.id,
        detail:
          update.kind === undefined
            ? `edge "${update.id}" update carries no kind (nothing to mutate)`
            : `edge "${update.id}" kind is already "${edge.kind}"`,
      });
    }
  }
  for (const move of patch.moveScope) {
    const currentScope =
      baseNodeById.get(move.id)?.scope ?? patch.addNodes.find((node) => node.id === move.id)?.scope;
    if (currentScope !== undefined && move.scope === currentScope) {
      diagnostics.push({
        type: "NO_OP_OPERATION",
        id: move.id,
        detail: `node "${move.id}" is already scoped to "${move.scope}"`,
      });
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
  // -- move target checks (against the RESULT graph, not the base) ---------
  const knownAfterAdd = new Set([...nodeIds, ...patch.addNodes.map((node) => node.id)]);
  const resultSubgraphs = new Set(
    [...base.nodes, ...patch.addNodes]
      .filter((node) => node.kind === "subgraph" && !removedNodes.has(node.id))
      .map((node) => node.id),
  );
  const moveReported = new Set<string>();
  for (const move of patch.moveScope) {
    if (!knownAfterAdd.has(move.id)) {
      diagnostics.push({ type: "UNKNOWN_NODE", id: move.id, detail: `node "${move.id}" does not exist` });
      moveReported.add(move.id);
      continue;
    }
    if (removedNodes.has(move.scope) && move.scope !== ROOT_SCOPE) {
      diagnostics.push({
        type: "MOVE_TARGET_REMOVED",
        id: move.id,
        detail: `move target "${move.scope}" is removed by the same patch`,
      });
      moveReported.add(move.id);
      continue;
    }
    if (move.scope !== ROOT_SCOPE && !resultSubgraphs.has(move.scope)) {
      diagnostics.push({
        type: "INVALID_MOVE_SCOPE",
        id: move.id,
        detail: `move target "${move.scope}" is not a subgraph`,
      });
      moveReported.add(move.id);
    }
  }
  // -- RESULT-graph validation (31 §3 H04): the same construction apply
  // commits, checked against the same invariants parseAgentGraph enforces -
  // validate=PASS therefore structurally implies apply success.
  const result = computePatchedGraph(base, patch);
  const resultIds = new Set(result.nodes.map((node) => node.id));
  if (resultIds.size !== result.nodes.length) {
    const seen = new Set<string>();
    for (const node of result.nodes) {
      if (seen.has(node.id)) {
        diagnostics.push({
          type: "DUPLICATE_NODE_ID",
          id: node.id,
          detail: `node "${node.id}" is declared twice in this patch (or already exists)`,
        });
        continue;
      }
      seen.add(node.id);
    }
  }
  for (const edge of result.edges) {
    if (patch.addEdges.includes(edge)) continue; // added edges checked below
    for (const endpoint of [edge.source, edge.target]) {
      if (!resultIds.has(endpoint)) {
        diagnostics.push({
          type: "NODE_HAS_EDGES",
          id: endpoint,
          detail: `node "${endpoint}" is removed but edge "${edge.id}" still references it`,
        });
      }
    }
  }
  for (const edge of patch.addEdges) {
    for (const endpoint of [edge.source, edge.target]) {
      if (!resultIds.has(endpoint)) {
        diagnostics.push({
          type: "EDGE_ENDPOINT_UNKNOWN",
          id: edge.id,
          detail: removedNodes.has(endpoint)
            ? `edge "${edge.id}" references node "${endpoint}", which this patch removes`
            : `edge "${edge.id}" references unknown node "${endpoint}"`,
        });
      }
    }
    if (edge.source === edge.target) {
      diagnostics.push({ type: "EDGE_SELF_LOOP", id: edge.id, detail: `edge "${edge.id}" connects "${edge.source}" to itself` });
    }
  }
  // Scope containment of the RESULT graph: every scope owner must exist,
  // be a subgraph, and not be the node itself; chains terminate; rings are
  // refused. Nodes already reported through their move diagnostic are not
  // re-reported here, and at most one SCOPE_CYCLE is reported per pass
  // (every member of a ring reports the same breakage).
  const scopeById = new Map(result.nodes.map((node) => [node.id, node.scope]));
  const kindById = new Map(result.nodes.map((node) => [node.id, node.kind]));
  let cycleReported = false;
  for (const [id, scope] of scopeById) {
    if (moveReported.has(id) || scope === ROOT_SCOPE) continue;
    if (scope === id) {
      if (!cycleReported) {
        diagnostics.push({ type: "SCOPE_CYCLE", id, detail: `node "${id}" cannot scope itself` });
        cycleReported = true;
      }
      continue;
    }
    if (!resultIds.has(scope)) {
      diagnostics.push(
        removedNodes.has(scope)
          ? { type: "SCOPE_OWNER_REMOVED", id, detail: `node "${id}" keeps scope "${scope}", which this patch removes` }
          : { type: "SCOPE_OWNER_INVALID", id, detail: `node "${id}" references unknown scope "${scope}"` },
      );
      continue;
    }
    if (kindById.get(scope) !== "subgraph") {
      diagnostics.push({
        type: "SCOPE_OWNER_INVALID",
        id,
        detail: `node "${id}" scope "${scope}" must be a subgraph`,
      });
    }
  }
  if (!cycleReported) {
    for (const [id, scope] of scopeById) {
      if (scope === ROOT_SCOPE) continue;
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
        current = scopeById.get(current);
      }
      if (cyclic) break;
    }
  }
  // Belt for the accepted-patch invariant (31 号 §B2-C): a non-empty patch
  // that survives every check must still change the semantic graph - this
  // catches combinations of individually-meaningful ops that cancel out.
  const opCount =
    patch.addNodes.length +
    patch.removeNodes.length +
    patch.updateNodes.length +
    patch.addEdges.length +
    patch.removeEdges.length +
    patch.updateEdges.length +
    patch.moveScope.length;
  if (opCount > 0 && diagnostics.length === 0) {
    const resultDigest = agentGraphSemanticDigest({
      version: 1,
      goal: base.goal,
      nodes: result.nodes,
      edges: result.edges,
    });
    if (resultDigest === agentGraphSemanticDigest(base)) {
      diagnostics.push({
        type: "NO_OP_OPERATION",
        detail: "patch changes nothing - accepted patches must change the semantic graph",
      });
    }
  }
  return diagnostics;
}

/**
 * Apply in the fixed order; fail-closed on any diagnostic. Validation runs
 * first over the SAME result construction apply commits, so a validated
 * patch cannot fail structurally at the re-parse (31 §3 H04).
 */
export function applyGraphPatch(base: AgentGraph, patch: GraphPatch): AgentGraph {
  const diagnostics = validateGraphPatch(base, patch);
  if (diagnostics.length > 0) {
    const first = diagnostics[0]!;
    throw new Error(`graph patch: ${first.type}: ${first.detail}`);
  }
  const result = computePatchedGraph(base, patch);
  return parseAgentGraph({ version: 1, goal: base.goal, nodes: result.nodes, edges: result.edges });
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
