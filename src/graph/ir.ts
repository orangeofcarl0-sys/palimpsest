/**
 * PLMP-GRAPH-1 (24 号规格): the AgentGraph IR - a renderer-neutral and
 * runtime-neutral graph intermediate representation. Node kinds are layered:
 * agent/subgraph/annotation are compile-relevant today; gate/tool/router/
 * memory/human/artifact exist in the IR (and future palettes) only - the
 * capability gate refuses them instead of pretending the runtime runs them.
 * The IR is cycle-CAPABLE by design (data-edge cycles parse fine); whether a
 * graph can run on the current DAG runtime is the capability gate's verdict,
 * never a silent flatten.
 *
 * Compound containment rides the same discipline as the canvas `z` chain:
 * a scope owner must be a subgraph, chains are self-free and acyclic.
 */

import type { ProjectProposal, TaskProposal } from "../architecture/index.js";

export const ROOT_SCOPE = "root";

export const AGENT_NODE_KINDS: ReadonlySet<string> = new Set([
  "agent",
  "subgraph",
  "gate",
  "tool",
  "router",
  "memory",
  "human",
  "artifact",
  "annotation",
]);

export type AgentGraphNodeKind =
  | "agent"
  | "subgraph"
  | "gate"
  | "tool"
  | "router"
  | "memory"
  | "human"
  | "artifact"
  | "annotation";

export const AGENT_EDGE_KINDS: ReadonlySet<string> = new Set([
  "data",
  "control",
  "message",
  "handoff",
  "delegation",
  "evidence",
  "validation",
  "aggregation",
  "retry",
]);

export type AgentGraphEdgeKind =
  | "data"
  | "control"
  | "message"
  | "handoff"
  | "delegation"
  | "evidence"
  | "validation"
  | "aggregation"
  | "retry";

/** Compile-relevant agent payload (mirrors the canvas task payload minus the
 * dependency list - ordering lives in data edges). */
export interface AgentTaskPayload {
  readonly writePaths?: readonly string[];
  readonly requiredArtifacts?: readonly string[];
  readonly gateId?: string;
  readonly role?: string;
  readonly suggestedSkills?: readonly string[];
}

export interface AgentGraphNode {
  readonly id: string;
  readonly kind: AgentGraphNodeKind;
  readonly label: string;
  /** Owning subgraph node id, or ROOT_SCOPE. */
  readonly scope: string;
  /** PLMP-GRAPH-3: subgraph only - "runtime" declares a runtime subgraph;
   * absent means editorial (compile-time flatten). */
  readonly mode?: "runtime";
  readonly task?: AgentTaskPayload;
  readonly text?: string;
}

export interface AgentGraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: AgentGraphEdgeKind;
}

export interface AgentGraph {
  readonly version: 1;
  readonly goal: string;
  readonly nodes: readonly AgentGraphNode[];
  readonly edges: readonly AgentGraphEdge[];
}

export type AgentGraphDiagnosticType =
  | "UNSUPPORTED_NODE_KIND"
  | "UNSUPPORTED_EDGE_KIND"
  | "UNSUPPORTED_EDGE_ENDPOINT"
  | "UNSUPPORTED_RUNTIME_CYCLE";

export interface AgentGraphDiagnostic {
  readonly type: AgentGraphDiagnosticType;
  readonly node?: string;
  readonly edge?: string;
  readonly detail: string;
}

function fail(message: string): never {
  throw new Error(`agent graph: ${message}`);
}

function str(value: unknown, what: string): string {
  if (typeof value !== "string") fail(`${what} must be a string`);
  return value;
}

function optStr(value: unknown, what: string): string | undefined {
  if (value === undefined) return undefined;
  return str(value, what);
}

function strArray(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) fail(`${what} must be an array of strings`);
  return value.map((entry) => str(entry, what));
}

function optStrArray(value: unknown, what: string): string[] | undefined {
  if (value === undefined) return undefined;
  return strArray(value, what);
}

/** Exported for the GraphPatch input protocol (25/31 号): the same strict
 * node parser guards patch addNodes — one grammar, no second parser. */
export function parseAgentTaskPayload(value: unknown): AgentTaskPayload {
  if (typeof value !== "object" || value === null) fail("node.task must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["writePaths", "requiredArtifacts", "gateId", "role", "suggestedSkills"].includes(field)) {
      fail(`unknown node.task field "${field}"`);
    }
  }
  const writePaths = optStrArray(raw["writePaths"], "task.writePaths");
  const requiredArtifacts = optStrArray(raw["requiredArtifacts"], "task.requiredArtifacts");
  const gateId = optStr(raw["gateId"], "task.gateId");
  const role = optStr(raw["role"], "task.role");
  const suggestedSkills = optStrArray(raw["suggestedSkills"], "task.suggestedSkills");
  return {
    ...(writePaths === undefined ? {} : { writePaths }),
    ...(requiredArtifacts === undefined ? {} : { requiredArtifacts }),
    ...(gateId === undefined ? {} : { gateId }),
    ...(role === undefined ? {} : { role }),
    ...(suggestedSkills === undefined ? {} : { suggestedSkills }),
  };
}

/** Exported for the GraphPatch input protocol (25/31 号). */
export function parseAgentGraphNode(value: unknown): AgentGraphNode {
  if (typeof value !== "object" || value === null) fail("node must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["id", "kind", "label", "scope", "mode", "task", "text"].includes(field)) {
      fail(`unknown node field "${field}"`);
    }
  }
  const kind = str(raw["kind"], "node.kind");
  if (!AGENT_NODE_KINDS.has(kind)) fail(`unknown node kind "${kind}"`);
  const id = str(raw["id"], "node.id");
  if (id.trim() === "") fail("node.id must be non-blank");
  if (kind !== "agent" && raw["task"] !== undefined) fail(`node "${id}" must not carry field "task"`);
  if (kind !== "annotation" && raw["text"] !== undefined) fail(`node "${id}" must not carry field "text"`);
  if (kind === "agent" && raw["task"] === undefined) fail(`agent node "${id}" needs node.task`);
  if (kind === "annotation" && raw["text"] === undefined) fail(`annotation node "${id}" needs node.text`);
  // PLMP-GRAPH-3: mode is a subgraph-only declaration with a single encoding.
  if (raw["mode"] !== undefined && kind !== "subgraph") fail(`node "${id}" must not carry field "mode"`);
  if (raw["mode"] !== undefined && raw["mode"] !== "runtime") {
    fail(`node "${id}" mode must be "runtime"`);
  }
  return {
    id,
    kind: kind as AgentGraphNodeKind,
    label: str(raw["label"], "node.label"),
    scope: str(raw["scope"], "node.scope"),
    ...(raw["mode"] === undefined ? {} : { mode: "runtime" as const }),
    ...(kind === "agent" ? { task: parseAgentTaskPayload(raw["task"]) } : {}),
    ...(kind === "annotation" ? { text: str(raw["text"], "node.text") } : {}),
  };
}

/** Exported for the GraphPatch input protocol (25/31 号). */
export function parseAgentGraphEdge(value: unknown): AgentGraphEdge {
  if (typeof value !== "object" || value === null) fail("edge must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["id", "source", "target", "kind"].includes(field)) {
      fail(`unknown edge field "${field}"`);
    }
  }
  const kind = str(raw["kind"], "edge.kind");
  if (!AGENT_EDGE_KINDS.has(kind)) fail(`unknown edge kind "${kind}"`);
  const id = str(raw["id"], "edge.id");
  if (id.trim() === "") fail("edge.id must be non-blank");
  const source = str(raw["source"], "edge.source");
  const target = str(raw["target"], "edge.target");
  if (source === target) fail(`edge "${id}" connects "${source}" to itself`);
  return {
    id,
    source,
    target,
    kind: kind as AgentGraphEdgeKind,
  };
}

export function parseAgentGraph(value: unknown): AgentGraph {
  if (typeof value !== "object" || value === null) fail("graph must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["version", "goal", "nodes", "edges"].includes(field)) {
      fail(`unknown graph field "${field}"`);
    }
  }
  if (raw["version"] !== 1) fail(`unsupported version ${JSON.stringify(raw["version"])}`);
  if (!Array.isArray(raw["nodes"])) fail("nodes must be an array");
  if (!Array.isArray(raw["edges"])) fail("edges must be an array");
  const nodes = raw["nodes"].map(parseAgentGraphNode);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) fail("duplicate node id");
  // Scope containment: same invariants as the canvas z chain.
  for (const node of nodes) {
    if (node.scope === ROOT_SCOPE) continue;
    const owner = byId.get(node.scope);
    if (owner === undefined) fail(`node "${node.id}" references unknown scope "${node.scope}"`);
    if (owner.kind !== "subgraph") fail(`node "${node.id}" scope "${node.scope}" must be a subgraph`);
    if (owner.id === node.id) fail(`node "${node.id}" cannot scope itself`);
  }
  for (const node of nodes) {
    const seen = new Set<string>([node.id]);
    let current = byId.get(node.id)!;
    while (current.scope !== ROOT_SCOPE) {
      const owner = byId.get(current.scope)!;
      if (seen.has(owner.id)) fail(`scope cycle detected at "${owner.id}"`);
      seen.add(owner.id);
      current = owner;
    }
  }
  const edges = raw["edges"].map(parseAgentGraphEdge);
  const edgeIds = new Set(edges.map((edge) => edge.id));
  if (edgeIds.size !== edges.length) fail("duplicate edge id");
  for (const edge of edges) {
    for (const endpoint of [edge.source, edge.target]) {
      if (!byId.has(endpoint)) {
        fail(`edge "${edge.id}" references unknown node "${endpoint}"`);
      }
    }
  }
  return { version: 1, goal: str(raw["goal"], "goal"), nodes, edges };
}

/**
 * The capability gate: what the current Palimpsest DAG runtime can compile.
 * The IR deliberately allows more than the runtime executes - every excess
 * gets an explicit diagnostic here instead of a silent wrong semantics.
 * Deterministic order: node walk first, then edges, cycle last.
 */
export function agentGraphCapabilities(graph: AgentGraph): AgentGraphDiagnostic[] {
  const diagnostics: AgentGraphDiagnostic[] = [];
  const compilableKinds: ReadonlySet<string> = new Set(["agent", "subgraph", "annotation"]);
  for (const node of graph.nodes) {
    if (!compilableKinds.has(node.kind)) {
      diagnostics.push({
        type: "UNSUPPORTED_NODE_KIND",
        node: node.id,
        detail: `node kind "${node.kind}" has no runtime semantics yet`,
      });
    }
  }
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const dataEdges: AgentGraphEdge[] = [];
  for (const edge of graph.edges) {
    if (edge.kind !== "data") {
      diagnostics.push({
        type: "UNSUPPORTED_EDGE_KIND",
        edge: edge.id,
        detail: `edge kind "${edge.kind}" has no runtime semantics yet`,
      });
      continue;
    }
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (source?.kind !== "agent" || target?.kind !== "agent") {
      diagnostics.push({
        type: "UNSUPPORTED_EDGE_ENDPOINT",
        edge: edge.id,
        detail: `data edges must connect agent nodes ("${edge.source}" -> "${edge.target}")`,
      });
      continue;
    }
    dataEdges.push(edge);
  }
  const cyclic = findCycle(graph.nodes, dataEdges);
  if (cyclic !== null) {
    diagnostics.push({
      type: "UNSUPPORTED_RUNTIME_CYCLE",
      node: cyclic,
      detail: `data-edge cycle through "${cyclic}" - the DAG runtime cannot execute cycles`,
    });
  }
  return diagnostics;
}

/** Deterministic first cycle member (node declaration order), or null. */
function findCycle(nodes: readonly AgentGraphNode[], edges: readonly AgentGraphEdge[]): string | null {
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const bucket = incoming.get(edge.target) ?? [];
    bucket.push(edge.source);
    incoming.set(edge.target, bucket);
  }
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): boolean => {
    const mark = state.get(id);
    if (mark === "visiting") return true;
    if (mark === "done") return false;
    state.set(id, "visiting");
    for (const source of incoming.get(id) ?? []) {
      if (visit(source)) return true;
    }
    state.set(id, "done");
    return false;
  };
  for (const node of nodes) {
    if (state.get(node.id) !== "done" && visit(node.id)) return node.id;
  }
  return null;
}

/**
 * IR → ProjectProposal for the capability-clean subset. Fail-closed: any
 * capability diagnostic aborts the compile - nothing is silently flattened
 * into wrong semantics. Task order = agent node declaration order; a task's
 * dependsOn = the labels of its incoming data-edge sources in edge
 * declaration order.
 */
export function compileAgentGraph(
  graph: AgentGraph,
  options?: { readonly goal?: string; readonly changeClass?: ProjectProposal["changeClass"] },
): ProjectProposal {
  const diagnostics = agentGraphCapabilities(graph);
  if (diagnostics.length > 0) {
    const first = diagnostics[0]!;
    fail(`${first.type}: ${first.detail}`);
  }
  const agents = graph.nodes.filter((node) => node.kind === "agent");
  const labels = agents.map((node) => node.label);
  const seen = new Set<string>();
  for (const label of labels) {
    if (seen.has(label)) fail(`duplicate agent label "${label}" - labels are the proposal's dependency key`);
    seen.add(label);
  }
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== "data") continue;
    const bucket = incoming.get(edge.target) ?? [];
    bucket.push(edge.source);
    incoming.set(edge.target, bucket);
  }
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const scopeIdFor = (node: AgentGraphNode): string | undefined => {
    let current: AgentGraphNode | undefined = node;
    const seen = new Set<string>([node.id]);
    while (current !== undefined && current.scope !== ROOT_SCOPE) {
      if (seen.has(current.scope)) return undefined;
      seen.add(current.scope);
      current = byId.get(current.scope);
      if (current !== undefined && current.kind === "subgraph" && current.mode === "runtime") {
        return current.id;
      }
    }
    return undefined;
  };
  const tasks: TaskProposal[] = agents.map((node) => {
    const task = node.task!;
    const scopeId = scopeIdFor(node);
    return {
      title: node.label,
      dependsOn: (incoming.get(node.id) ?? []).map((sourceId) => byIdLabel(graph, sourceId)),
      // PLMP-GRAPH-4 (30 号规格): the IR node id IS the definition identity.
      // It rides the whole chain (TaskSpec.definition_id → GraphTask →
      // runtime lineage) instead of dying here.
      definitionId: node.id,
      ...(task.writePaths === undefined ? {} : { writePaths: [...task.writePaths] }),
      ...(task.requiredArtifacts === undefined ? {} : { requiredArtifacts: [...task.requiredArtifacts] }),
      ...(task.gateId === undefined ? {} : { gateId: task.gateId }),
      ...(task.role === undefined ? {} : { role: task.role }),
      ...(task.suggestedSkills === undefined ? {} : { suggestedSkills: [...task.suggestedSkills] }),
      ...(scopeId === undefined ? {} : { scopeId }),
    };
  });
  return {
    goal: options?.goal ?? graph.goal,
    changeClass: options?.changeClass ?? "behavior_change",
    tasks,
  };
}

function byIdLabel(graph: AgentGraph, id: string): string {
  const node = graph.nodes.find((entry) => entry.id === id);
  if (node === undefined) fail(`edge references unknown node "${id}"`);
  return node.label;
}
