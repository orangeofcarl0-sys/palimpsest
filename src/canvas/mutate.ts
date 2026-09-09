/**
 * PLMP-CANVAS-7 (32 号, G9-D D6): the centralized first-party Canvas mutation
 * layer. THE single mutation truth for first-party semantic edits:
 *
 * MUT-INV-1: parseCanvasDoc(before)=PASS ⇒ parseCanvasDoc(mutation(before))=PASS
 *
 * Every operation validates its preconditions fail-closed and cleans every
 * reference it touches, so a first-party mutation can never manufacture a
 * parser-invalid doc (no dangling edges, no dangling membership, no broken
 * ownership). The web mirror (web/src/canvasMutate.ts) is a renderer-side
 * stop-gap on the independent build chain pinned by source tripwires; this
 * module is the only semantic authority.
 *
 * Identity lifecycle rulings this layer enforces (32 号 §2/§5/§6/§7):
 * - node creation allocates through the doc's monotonic family (never a
 *   reused id); delete retires, rename/move keep identity, copy = fresh;
 * - removing a node atomically drops incident edges and visual-group
 *   membership; deleting a SUBFLOW lifts its direct children one level (they
 *   reparent to the deleted scope's parent) - nested descendants stay under
 *   their direct parents, the subtree is never flattened;
 * - reconnect = remove old edge + allocate a FRESH edge id (endpoints are
 *   part of edge identity; an edge is never retargeted in place);
 * - duplicate copies nodes and internal edges with fresh identities;
 *   external edges and visual-group membership are deliberately excluded
 *   (smallest fail-closed behavior: a copy carries no relations it did not
 *   explicitly earn) - documented registered behavior, not an accident.
 */

import {
  allocateCanvasEdgeId,
  allocateCanvasNodeId,
  ROOT_Z,
  type CanvasDoc,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeType,
} from "./doc.js";

function fail(message: string): never {
  throw new Error(`canvas mutate: ${message}`);
}

function nodeById(doc: CanvasDoc, key: string): CanvasNode {
  const node = doc.nodes.find((entry) => entry.key === key);
  if (node === undefined) fail(`node "${key}" does not exist`);
  return node;
}

function groupById(doc: CanvasDoc, id: string): CanvasDoc["groups"][number] {
  const group = doc.groups.find((entry) => entry.id === id);
  if (group === undefined) fail(`group "${id}" does not exist`);
  return group;
}

/** The transitive descendant key set of a subflow (parser guarantees the z
 * forest is acyclic, so the walk terminates). */
function descendantKeys(doc: CanvasDoc, rootKey: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const node of doc.nodes) {
    if (node.z === ROOT_Z) continue;
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
}

function requireOwnerScope(doc: CanvasDoc, key: string, z: string): void {
  if (z === key) fail(`node "${key}" cannot own itself`);
  // Cycle condition: after the move key.z = z, so the chain from z upward
  // is unchanged - the move rings only if z lies inside key's own subtree.
  const moving = doc.nodes.find((node) => node.key === key);
  if (moving !== undefined && moving.type === "subflow" && descendantKeys(doc, key).has(z)) {
    fail(`node "${key}" cannot move into its own descendant "${z}"`);
  }
  if (z === ROOT_Z) return;
  const owner = nodeById(doc, z);
  if (owner.type !== "subflow") fail(`owner "${z}" must be a subflow`);
}

/** Create a node with a fresh monotonic identity. Task nodes start with an
 * empty payload; the caller edits display fields afterwards. */
export function canvasAddNode(
  doc: CanvasDoc,
  input: {
    readonly type: CanvasNodeType;
    readonly title: string;
    readonly text?: string;
    readonly x?: number;
    readonly y?: number;
    readonly z?: string;
  },
): { doc: CanvasDoc; id: string } {
  if (input.type === "annotation" && input.text === undefined) {
    fail("annotation nodes need text");
  }
  if (input.type !== "annotation" && input.text !== undefined) {
    fail(`node type "${input.type}" must not carry text`);
  }
  const z = input.z ?? ROOT_Z;
  if (z !== ROOT_Z) {
    // A new node has no descendants, so the owner check is just ownership.
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
  const node: CanvasNode =
    input.type === "task"
      ? { ...base, type: "task", task: {} }
      : input.type === "subflow"
        ? { ...base, type: "subflow" }
        : { ...base, type: "annotation", text: input.text! };
  return { doc: { ...allocated.doc, nodes: [...allocated.doc.nodes, node] }, id: allocated.id };
}

/** Remove a node atomically: incident edges, visual-group membership, and
 * (for a subflow) the deterministic one-level lift of its direct children
 * to the deleted scope's parent. Surviving identities never change. */
export function canvasRemoveNode(doc: CanvasDoc, key: string): CanvasDoc {
  const removed = nodeById(doc, key);
  const parent = removed.z;
  const nodes: CanvasNode[] =
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

/** Duplicate a node (or, for a subflow, its whole subtree) with fresh node
 * and edge identities; structural equivalence is preserved and external
 * edges / visual-group membership are excluded (registered fail-closed
 * behavior - a copy owns no relations it did not earn). */
export function canvasDuplicateNode(
  doc: CanvasDoc,
  key: string,
  at?: { readonly x: number; readonly y: number },
): { doc: CanvasDoc; id: string } {
  const source = nodeById(doc, key);
  const subtree = source.type === "subflow" ? [...descendantKeys(doc, key).add(key)] : [key];
  const inSubtree = new Set(subtree);
  const dx = at !== undefined ? at.x - source.x : 32;
  const dy = at !== undefined ? at.y - source.y : 32;
  let working = doc;
  const idMap = new Map<string, string>();
  const copied: CanvasNode[] = [];
  for (const node of doc.nodes) {
    if (!inSubtree.has(node.key)) continue;
    const allocated = allocateCanvasNodeId(working);
    working = allocated.doc;
    idMap.set(node.key, allocated.id);
    copied.push({
      ...node,
      key: allocated.id,
      x: node.x + dx,
      y: node.y + dy,
      ...(node.z !== ROOT_Z && inSubtree.has(node.z)
        ? {}
        : { z: node.z }),
    } as CanvasNode);
  }
  // Copy-internal containment: a copied member's owner must be the copied
  // parent when the owner itself was copied; otherwise the original owner
  // (still alive) is kept.
  const withReparented = copied.map((node) => {
    const ownerCopied = node.z !== ROOT_Z && idMap.has(node.z);
    if (!ownerCopied) return node;
    return { ...node, z: idMap.get(node.z)! } as CanvasNode;
  });
  const edges: CanvasEdge[] = [];
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
  const rootCopyId = idMap.get(key)!;
  return {
    doc: { ...working, nodes: [...working.nodes, ...withReparented], edges: [...working.edges, ...edges] },
    id: rootCopyId,
  };
}

/** Connect two nodes with a fresh data edge. Exact duplicates are refused at
 * authoring time (parallel identical data edges are the capability gate's
 * refusal at compile; authoring refuses them earlier, deterministically). */
export function canvasAddEdge(
  doc: CanvasDoc,
  input: { readonly source: string; readonly target: string },
): { doc: CanvasDoc; id: string } {
  const source = nodeById(doc, input.source);
  const target = nodeById(doc, input.target);
  if (source.type !== "task") fail(`edge source "${input.source}" must be a task (you can only depend on tasks)`);
  if (source.key === target.key) fail(`edge cannot connect "${source.key}" to itself`);
  if (doc.edges.some((edge) => edge.source === source.key && edge.target === target.key)) {
    fail(`edge ${source.key} -> ${target.key} already exists`);
  }
  const allocated = allocateCanvasEdgeId(doc);
  return {
    doc: {
      ...allocated.doc,
      edges: [
        ...allocated.doc.edges,
        { id: allocated.id, source: source.key, target: target.key, kind: "data" },
      ],
    },
    id: allocated.id,
  };
}

/** Remove an edge by its stable id. */
export function canvasRemoveEdge(doc: CanvasDoc, id: string): CanvasDoc {
  if (!doc.edges.some((edge) => edge.id === id)) fail(`edge "${id}" does not exist`);
  return { ...doc, edges: doc.edges.filter((edge) => edge.id !== id) };
}

/** Reconnect = retire the old edge and allocate a FRESH one with the new
 * endpoint(s). The original id never survives a retarget (EDGE-INV-3). */
export function canvasReconnectEdge(
  doc: CanvasDoc,
  id: string,
  newEndpoint: { readonly source?: string; readonly target?: string },
): { doc: CanvasDoc; id: string } {
  const edge = doc.edges.find((entry) => entry.id === id);
  if (edge === undefined) fail(`edge "${id}" does not exist`);
  const source = newEndpoint.source ?? edge.source;
  const target = newEndpoint.target ?? edge.target;
  if (source === edge.source && target === edge.target) {
    fail(`reconnect of edge "${id}" changes nothing - endpoints are unchanged`);
  }
  const withoutOld = canvasRemoveEdge(doc, id);
  const added = canvasAddEdge(withoutOld, { source, target });
  return { doc: added.doc, id: added.id };
}

/** Move a node into another scope (subflow or root), refusing cycles: a
 * subflow cannot land inside its own subtree. */
export function canvasMoveNodeScope(doc: CanvasDoc, key: string, scope: string): CanvasDoc {
  nodeById(doc, key);
  requireOwnerScope(doc, key, scope);
  return {
    ...doc,
    nodes: doc.nodes.map((node) => (node.key === key ? { ...node, z: scope } : node)),
  };
}

/** Create a visual group (pure presentation object - no runtime semantics). */
export function canvasAddGroup(
  doc: CanvasDoc,
  input: { readonly label: string; readonly id?: string; readonly g?: string },
): { doc: CanvasDoc; id: string } {
  let id = input.id;
  if (id === undefined) {
    let counter = doc.groups.length + 1;
    id = `grp${counter}`;
    while (doc.groups.some((group) => group.id === id)) id = `grp${(counter += 1)}`;
  } else if (doc.groups.some((group) => group.id === id)) {
    fail(`group "${id}" already exists`);
  }
  if (input.g !== undefined) groupById(doc, input.g);
  return {
    doc: {
      ...doc,
      groups: [...doc.groups, { id, label: input.label, ...(input.g === undefined ? {} : { g: input.g }), members: [] }],
    },
    id,
  };
}

/** Remove a visual group; nested child groups lift to the top level so no
 * dangling parent reference remains (one-level lift, same discipline as
 * subflow deletion). */
export function canvasRemoveGroup(doc: CanvasDoc, id: string): CanvasDoc {
  groupById(doc, id);
  return {
    ...doc,
    groups: doc.groups
      .filter((group) => group.id !== id)
      .map((group) =>
        group.g === id
          ? { id: group.id, label: group.label, members: group.members }
          : group,
      ),
  };
}
