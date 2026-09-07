import type { CanvasDoc, CanvasEdge, CanvasGroup, CanvasIdentityState, CanvasNode } from "./types";

/**
 * PLMP-CANVAS-7 (32 号) web mirrors of the kernel identity machinery
 * (`src/canvas/doc.ts`): the explicit v2→v3 converter, the monotonic
 * allocators, and draft construction. The web is an independent build chain
 * (structural mirrors + source tripwires, WEB-V3-A01) - the kernel remains
 * the only parse authority; these mirrors exist so identity allocation and
 * migration semantics cannot drift into renderer-local inventions.
 */

const NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Random-once namespace (32 号 §3.4 verdict A): one per draft, hex from a
 * UUID so fresh `n:<ns>:<k>` allocations stay disjoint from legacy `nK`
 * keys and from every other draft's family. */
export const randomCanvasNamespace = (): string =>
  crypto.randomUUID().replaceAll("-", "").slice(0, 12);

export const newCanvasIdentity = (namespace: string): CanvasIdentityState => ({
  namespace,
  nextNode: 1,
  nextEdge: 1,
});

export const newCanvasDoc = (goal = "", namespace = randomCanvasNamespace()): CanvasDoc => ({
  version: 3,
  goal,
  identity: newCanvasIdentity(namespace),
  nodes: [],
  edges: [],
  groups: [],
});

/** Node twin: fresh `n:<ns>:<k>` id; counters only advance, so a deleted
 * key is never regenerated (kernel `allocateCanvasNodeId`). */
export function allocateCanvasNodeId(doc: CanvasDoc): { doc: CanvasDoc; id: string } {
  const used = new Set(doc.nodes.map((node) => node.key));
  let counter = Math.max(1, doc.identity.nextNode);
  while (used.has(`n:${doc.identity.namespace}:${counter}`)) counter += 1;
  const id = `n:${doc.identity.namespace}:${counter}`;
  return { doc: { ...doc, identity: { ...doc.identity, nextNode: counter + 1 } }, id };
}

/** Edge twin (kernel `allocateCanvasEdgeId`). */
export function allocateCanvasEdgeId(doc: CanvasDoc): { doc: CanvasDoc; id: string } {
  const used = new Set(doc.edges.map((edge) => edge.id));
  let counter = Math.max(1, doc.identity.nextEdge);
  while (used.has(`e:${doc.identity.namespace}:${counter}`)) counter += 1;
  const id = `e:${doc.identity.namespace}:${counter}`;
  return { doc: { ...doc, identity: { ...doc.identity, nextEdge: counter + 1 } }, id };
}

function fail(message: string): never {
  throw new Error(`canvas doc: ${message}`);
}

// ---------------------------------------------------------------------------
// The explicit v2 → v3 converter (kernel `upgradeCanvasV2ToV3` mirror):
// strict v2 validation first (fail-closed), node keys preserved verbatim,
// payload dependsOn flattened to `e:<ns>:<k>` edges in declaration order,
// `node.g` folded into `group.members` (the single membership truth).
// ---------------------------------------------------------------------------

interface V2Node {
  key: string;
  type: "task" | "subflow" | "annotation";
  title: string;
  x: number;
  y: number;
  z: string;
  g?: string;
  mode?: "runtime";
  task?: { dependsOn: string[]; writePaths?: string[]; requiredArtifacts?: string[]; gateId?: string; role?: string; suggestedSkills?: string[] };
  text?: string;
}

const v2Str = (value: unknown, what: string): string => {
  if (typeof value !== "string") fail(`${what} must be a string`);
  return value;
};

export function upgradeCanvasV2ToV3(value: unknown, namespace: string): CanvasDoc {
  if (!NAMESPACE_PATTERN.test(namespace)) fail(`identity.namespace "${namespace}" is invalid`);
  if (typeof value !== "object" || value === null) fail("document must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["version", "goal", "nodes", "groups"].includes(field)) fail(`unknown document field "${field}"`);
  }
  if (raw["version"] !== 2) fail(`unsupported version ${JSON.stringify(raw["version"])} - the converter migrates v2 docs only`);
  if (!Array.isArray(raw["nodes"]) || !Array.isArray(raw["groups"])) fail("nodes/groups must be arrays");
  const nodes: V2Node[] = (raw["nodes"] as unknown[]).map((entry: unknown): V2Node => {
    if (typeof entry !== "object" || entry === null) fail("node must be an object");
    const nodeRaw = entry as Record<string, unknown>;
    for (const field of Object.keys(nodeRaw)) {
      if (!["key", "type", "title", "x", "y", "z", "g", "mode", "task", "text"].includes(field)) {
        fail(`unknown node field "${field}"`);
      }
    }
    const type = v2Str(nodeRaw["type"], "node.type");
    if (!["task", "subflow", "annotation"].includes(type)) fail(`unknown node type "${type}"`);
    const key = v2Str(nodeRaw["key"], "node.key");
    if (key.trim() === "") fail("node.key must be non-blank");
    if (type !== "task" && nodeRaw["task"] !== undefined) fail(`node "${key}" must not carry field "task"`);
    if (type !== "annotation" && nodeRaw["text"] !== undefined) fail(`node "${key}" must not carry field "text"`);
    let task: V2Node["task"];
    if (type === "task") {
      if (typeof nodeRaw["task"] !== "object" || nodeRaw["task"] === null) fail("node.task must be an object");
      const taskRaw = nodeRaw["task"] as Record<string, unknown>;
      if (!Array.isArray(taskRaw["dependsOn"])) fail("task.dependsOn must be an array");
      task = {
        dependsOn: (taskRaw["dependsOn"] as unknown[]).map((entry) => v2Str(entry, "task.dependsOn entry")),
        ...(taskRaw["writePaths"] === undefined ? {} : { writePaths: taskRaw["writePaths"] as string[] }),
        ...(taskRaw["requiredArtifacts"] === undefined
          ? {}
          : { requiredArtifacts: taskRaw["requiredArtifacts"] as string[] }),
        ...(taskRaw["gateId"] === undefined ? {} : { gateId: v2Str(taskRaw["gateId"], "task.gateId") }),
        ...(taskRaw["role"] === undefined ? {} : { role: v2Str(taskRaw["role"], "task.role") }),
        ...(taskRaw["suggestedSkills"] === undefined
          ? {}
          : { suggestedSkills: taskRaw["suggestedSkills"] as string[] }),
      };
    }
    return {
      key,
      type: type as V2Node["type"],
      title: v2Str(nodeRaw["title"], "node.title"),
      x: nodeRaw["x"] as number,
      y: nodeRaw["y"] as number,
      z: v2Str(nodeRaw["z"], "node.z"),
      ...(nodeRaw["g"] === undefined ? {} : { g: v2Str(nodeRaw["g"], "node.g") }),
      ...(nodeRaw["mode"] === undefined ? {} : { mode: "runtime" as const }),
      ...(task === undefined ? {} : { task }),
      ...(type === "annotation" ? { text: v2Str(nodeRaw["text"], "node.text") } : {}),
    };
  });
  const groups: CanvasGroup[] = (raw["groups"] as unknown[]).map((entry: unknown): CanvasGroup => {
    if (typeof entry !== "object" || entry === null) fail("group must be an object");
    const groupRaw = entry as Record<string, unknown>;
    for (const field of Object.keys(groupRaw)) {
      if (!["id", "label", "g", "members"].includes(field)) fail(`unknown group field "${field}"`);
    }
    if (!Array.isArray(groupRaw["members"])) fail("group.members must be an array");
    return {
      id: v2Str(groupRaw["id"], "group.id"),
      label: v2Str(groupRaw["label"], "group.label"),
      ...(groupRaw["g"] === undefined ? {} : { g: v2Str(groupRaw["g"], "group.g") }),
      members: (groupRaw["members"] as unknown[]).map((entry) => v2Str(entry, "group.members entry")),
    };
  });
  // Reference integrity (the v2 parser's invariants - fail closed here).
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  if (byKey.size !== nodes.length) fail("duplicate node key");
  const groupIds = new Set(groups.map((group) => group.id));
  if (groupIds.size !== groups.length) fail("duplicate group id");
  for (const node of nodes) {
    if (node.z === "root") continue;
    const owner = byKey.get(node.z);
    if (owner === undefined) fail(`node "${node.key}" references unknown owner "${node.z}"`);
    if (owner.type !== "subflow") fail(`node "${node.key}" owner "${node.z}" must be a subflow node`);
  }
  for (const node of nodes) {
    const seen = new Set<string>([node.key]);
    let current = byKey.get(node.key);
    while (current !== undefined && current.z !== "root") {
      if (seen.has(current.z)) fail(`ownership cycle detected at "${current.z}"`);
      seen.add(current.z);
      current = byKey.get(current.z);
    }
  }
  for (const node of nodes) {
    if (node.g !== undefined && !groupIds.has(node.g)) {
      fail(`node "${node.key}" references unknown group "${node.g}"`);
    }
  }
  for (const group of groups) {
    for (const member of group.members) {
      if (!byKey.has(member)) fail(`group "${group.id}" references unknown member "${member}"`);
    }
  }
  for (const node of nodes) {
    for (const dependency of node.task?.dependsOn ?? []) {
      const target = byKey.get(dependency);
      if (target === undefined) fail(`node "${node.key}" depends on unknown key "${dependency}"`);
      if (target?.type !== "task") fail(`node "${node.key}" depends on "${dependency}" which is not a task`);
    }
  }
  // Convert: fold node.g into members, flatten dependsOn to edges.
  const membersByGroup = new Map<string, string[]>(groups.map((group) => [group.id, [...group.members]]));
  const v3Nodes: CanvasNode[] = nodes.map((node) => {
    if (node.g !== undefined) {
      const members = membersByGroup.get(node.g);
      if (members !== undefined && !members.includes(node.key)) members.push(node.key);
    }
    const { dependsOn: _dependsOn, ...payload } = node.task ?? {};
    return {
      key: node.key,
      type: node.type,
      title: node.title,
      x: node.x,
      y: node.y,
      z: node.z,
      ...(node.mode === undefined ? {} : { mode: node.mode }),
      ...(node.type === "task" ? { task: payload } : {}),
      ...(node.type === "annotation" ? { text: node.text ?? "" } : {}),
    };
  });
  let edgeCounter = 0;
  const edges: CanvasEdge[] = nodes.flatMap((node) =>
    (node.task?.dependsOn ?? []).map((source) => {
      edgeCounter += 1;
      return { id: `e:${namespace}:${edgeCounter}`, source, target: node.key, kind: "data" as const };
    }),
  );
  let nextNode = 1;
  for (const node of v3Nodes) {
    const match = new RegExp(`^n:${namespace}:(\\d+)$`).exec(node.key);
    if (match !== null) nextNode = Math.max(nextNode, Number(match[1]) + 1);
  }
  return {
    version: 3,
    goal: v2Str(raw["goal"], "goal"),
    identity: { namespace, nextNode, nextEdge: edgeCounter + 1 },
    nodes: v3Nodes,
    edges,
    groups: groups.map((group) => ({
      id: group.id,
      label: group.label,
      ...(group.g === undefined ? {} : { g: group.g }),
      members: membersByGroup.get(group.id) ?? [...group.members],
    })),
  };
}
