import type { CanvasDoc } from "./types";
import { allocateCanvasEdgeId, allocateCanvasNodeId } from "./canvasV3";

/**
 * PLMP-CANVAS-7 (32 号, G9-D D6/D9): web mirror of the kernel mutation layer
 * (`src/canvas/mutate.ts`) - THE single mutation truth on the web build
 * chain. Every first-party semantic mutation goes through here (no more
 * scattered inline filter/map integrity logic in components). MUT-INV-1:
 * a parse-valid doc in, a parse-valid doc out - operations fail closed and
 * clean every reference they touch. The kernel module stays the semantic
 * authority; this mirror is pinned by the WEB-V3-A01 source tripwire.
 */

function fail(message: string): never {
  throw new Error(`canvas mutate: ${message}`);
}

const nodeById = (doc: CanvasDoc, key: string): CanvasDoc["nodes"][number] => {
  const node = doc.nodes.find((entry) => entry.key === key);
  if (node === undefined) fail(`node "${key}" does not exist`);
  return node;
};

const descendantKeys = (doc: CanvasDoc, rootKey: string): Set<string> => {
  const children = new Map<string, string[]>();
  for (const node of doc.nodes) {
    if (node.z === "root") continue;
    const bucket = children.get(node.z) ?? [];
    bucket.push(node.key);
    children.set(node.z, bucket);
  }
  const out = new Set<string>();
  const stack = [...(children.get(rootKey) ?? [])];
  while (stack.length > 0) {
    const key = stack.pop()!;
    if (out.has(key)) continue;
    out.add(key);
    for (const child of children.get(key) ?? []) stack.push(child);
  }
  return out;
};

/** Create a node with a fresh monotonic identity (kernel `canvasAddNode`). */
export function canvasAddNode(
  doc: CanvasDoc,
  input: {
    type: "task" | "subflow" | "annotation";
    title: string;
    text?: string;
    x?: number;
    y?: number;
    z?: string;
  },
): { doc: CanvasDoc; id: string } {
  const z = input.z ?? "root";
  if (z !== "root") {
    const owner = nodeById(doc, z);
    if (owner.type !== "subflow") fail(`owner "${z}" must be a subflow`);
  }
  const allocated = allocateCanvasNodeId(doc);
  const base = {
    key: allocated.id,
    type: input.type,
    title: input.title,
    x: input.x ?? 120 + (doc.nodes.length % 4) * 40,
    y: input.y ?? 80 + doc.nodes.length * 24,
    z,
  };
  const node: CanvasDoc["nodes"][number] =
    input.type === "task"
      ? { ...base, type: "task", task: {} }
      : input.type === "subflow"
        ? { ...base, type: "subflow" }
        : { ...base, type: "annotation", text: input.text ?? "" };
  return { doc: { ...allocated.doc, nodes: [...allocated.doc.nodes, node] }, id: allocated.id };
}

/** Remove a node atomically: incident edges + visual-group membership +
 * (for a subflow) the one-level lift of direct children to the deleted
 * scope's parent - nested descendants stay, identities preserved. */
export function canvasRemoveNode(doc: CanvasDoc, key: string): CanvasDoc {
  const removed = nodeById(doc, key);
  const parent = removed.z;
  const nodes =
    removed.type === "subflow"
      ? doc.nodes
          .filter((node) => node.key !== key)
          .map((node) => (node.z === key ? { ...node, z: parent } : node))
      : doc.nodes.filter((node) => node.key !== key);
  const edges = doc.edges.filter((edge) => edge.source !== key && edge.target !== key);
  const groups = doc.groups.map((group) =>
    group.members.includes(key)
      ? { ...group, members: group.members.filter((member) => member !== key) }
      : group,
  );
  return { ...doc, nodes, edges, groups };
}

/** Duplicate a node/subtree with fresh identities; external edges and
 * visual-group membership are excluded (registered fail-closed behavior). */
export function canvasDuplicateNode(
  doc: CanvasDoc,
  key: string,
  at?: { x: number; y: number },
): { doc: CanvasDoc; id: string } {
  const source = nodeById(doc, key);
  const subtree = source.type === "subflow" ? [...descendantKeys(doc, key).add(key)] : [key];
  const inSubtree = new Set(subtree);
  const dx = at !== undefined ? at.x - source.x : 32;
  const dy = at !== undefined ? at.y - source.y : 32;
  let working = doc;
  const idMap = new Map<string, string>();
  const copied: CanvasDoc["nodes"] = [];
  for (const node of doc.nodes) {
    if (!inSubtree.has(node.key)) continue;
    const allocated = allocateCanvasNodeId(working);
    working = allocated.doc;
    idMap.set(node.key, allocated.id);
    copied.push({ ...node, key: allocated.id, x: node.x + dx, y: node.y + dy });
  }
  const withReparented = copied.map((node) =>
    node.z !== "root" && idMap.has(node.z) ? { ...node, z: idMap.get(node.z)! } : node,
  );
  const edges: CanvasDoc["edges"] = [];
  for (const edge of working.edges) {
    if (!inSubtree.has(edge.source) || !inSubtree.has(edge.target)) continue;
    const allocated = allocateCanvasEdgeId(working);
    working = allocated.doc;
    edges.push({
      id: allocated.id,
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
      kind: "data",
    });
  }
  return {
    doc: { ...working, nodes: [...working.nodes, ...withReparented], edges: [...working.edges, ...edges] },
    id: idMap.get(key)!,
  };
}

/** Connect two nodes with a fresh data edge; source must be a task, exact
 * duplicates refused (kernel `canvasAddEdge`). */
export function canvasAddEdge(
  doc: CanvasDoc,
  input: { source: string; target: string },
): { doc: CanvasDoc; id: string } {
  const source = nodeById(doc, input.source);
  nodeById(doc, input.target);
  if (source.type !== "task") fail(`edge source "${input.source}" must be a task (you can only depend on tasks)`);
  if (input.source === input.target) fail(`edge cannot connect "${input.source}" to itself`);
  if (doc.edges.some((edge) => edge.source === input.source && edge.target === input.target)) {
    fail(`edge ${input.source} -> ${input.target} already exists`);
  }
  const allocated = allocateCanvasEdgeId(doc);
  return {
    doc: {
      ...allocated.doc,
      edges: [
        ...allocated.doc.edges,
        { id: allocated.id, source: input.source, target: input.target, kind: "data" },
      ],
    },
    id: allocated.id,
  };
}

/** Remove an edge by stable id (kernel `canvasRemoveEdge`). */
export function canvasRemoveEdge(doc: CanvasDoc, id: string): CanvasDoc {
  if (!doc.edges.some((edge) => edge.id === id)) fail(`edge "${id}" does not exist`);
  return { ...doc, edges: doc.edges.filter((edge) => edge.id !== id) };
}

/** Reconnect = retire the old edge + fresh id; no-op reconnects refused
 * (kernel `canvasReconnectEdge`, EDGE-INV-3). */
export function canvasReconnectEdge(
  doc: CanvasDoc,
  id: string,
  newEndpoint: { source?: string; target?: string },
): { doc: CanvasDoc; id: string } {
  const edge = doc.edges.find((entry) => entry.id === id);
  if (edge === undefined) fail(`edge "${id}" does not exist`);
  const source = newEndpoint.source ?? edge.source;
  const target = newEndpoint.target ?? edge.target;
  if (source === edge.source && target === edge.target) {
    fail(`reconnect of edge "${id}" changes nothing - endpoints are unchanged`);
  }
  return canvasAddEdge(canvasRemoveEdge(doc, id), { source, target });
}

/** Move into another scope; a subflow cannot land inside its own subtree. */
export function canvasMoveNodeScope(doc: CanvasDoc, key: string, scope: string): CanvasDoc {
  nodeById(doc, key);
  if (scope === key) fail(`node "${key}" cannot own itself`);
  const moving = doc.nodes.find((node) => node.key === key);
  if (moving !== undefined && moving.type === "subflow" && descendantKeys(doc, key).has(scope)) {
    fail(`node "${key}" cannot move into its own descendant "${scope}"`);
  }
  if (scope !== "root") {
    const owner = nodeById(doc, scope);
    if (owner.type !== "subflow") fail(`owner "${scope}" must be a subflow`);
  }
  return {
    ...doc,
    nodes: doc.nodes.map((node) => (node.key === key ? { ...node, z: scope } : node)),
  };
}

/** Create a visual group (pure presentation object). */
export function canvasAddGroup(
  doc: CanvasDoc,
  input: { label: string; id?: string; g?: string },
): { doc: CanvasDoc; id: string } {
  let id = input.id;
  if (id === undefined) {
    let counter = doc.groups.length + 1;
    id = `grp${counter}`;
    while (doc.groups.some((group) => group.id === id)) id = `grp${(counter += 1)}`;
  } else if (doc.groups.some((group) => group.id === id)) {
    fail(`group "${id}" already exists`);
  }
  if (input.g !== undefined && !doc.groups.some((group) => group.id === input.g)) {
    fail(`group "${input.g}" does not exist`);
  }
  return {
    doc: {
      ...doc,
      groups: [
        ...doc.groups,
        { id, label: input.label, ...(input.g === undefined ? {} : { g: input.g }), members: [] },
      ],
    },
    id,
  };
}

/** Remove a visual group; nested child groups lift to the top level. */
export function canvasRemoveGroup(doc: CanvasDoc, id: string): CanvasDoc {
  if (!doc.groups.some((group) => group.id === id)) fail(`group "${id}" does not exist`);
  return {
    ...doc,
    groups: doc.groups
      .filter((group) => group.id !== id)
      .map((group) => (group.g === id ? { ...group, g: undefined } : group)),
  };
}
