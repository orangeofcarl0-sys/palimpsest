/**
 * PLMP-CANVAS-1 (21 号规格): the canvas definition layer. A CanvasDoc is the
 * client-side authoring scratchpad - the orchestration ledger stays the only
 * server-side truth. The format follows Node-RED's flat-array contract with
 * ownership fields instead of nesting: `z` names the owning subflow (root
 * nodes say "root"), `g` the visual group; depth comes from `z` chains, so
 * arbitrary nesting serializes as a flat list. Dependencies are TITLES - the
 * proposal's own vocabulary - so compiling to a ProjectProposal is a flatten,
 * and what the canvas draws as a subflow boundary is editorial only.
 *
 * Parsing is fail-closed on shape errors and unknown fields (client-authored
 * JSON: a typo must fail loudly, not silently drop a task). PLMP-CANVAS-5
 * adds the ownership invariants: a `z` owner must be a subflow, chains are
 * self-parent-free and acyclic (group `g` nesting too), and payload fields
 * are never silently dropped - cycles would hang every renderer-side walk,
 * so they are refused here before any renderer or compiler sees the doc.
 */

import type { ProjectProposal } from "../architecture/index.js";

export interface CanvasTaskPayload {
  readonly dependsOn: readonly string[];
  readonly writePaths?: readonly string[];
  readonly requiredArtifacts?: readonly string[];
  readonly gateId?: string;
  readonly role?: string;
  readonly suggestedSkills?: readonly string[];
}

export type CanvasNodeType = "task" | "subflow" | "annotation";

export interface CanvasNode {
  readonly key: string;
  readonly type: CanvasNodeType;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  /** Owning subflow key, or "root". */
  readonly z: string;
  /** Visual group id (groups never affect compilation). */
  readonly g?: string;
  readonly task?: CanvasTaskPayload;
  readonly text?: string;
}

export interface CanvasGroup {
  readonly id: string;
  readonly label: string;
  readonly g?: string;
  readonly members: readonly string[];
}

export interface CanvasDoc {
  readonly version: 1;
  readonly goal: string;
  readonly nodes: readonly CanvasNode[];
  readonly groups: readonly CanvasGroup[];
}

export const ROOT_Z = "root";

function fail(message: string): never {
  throw new Error(`canvas doc: ${message}`);
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

function num(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${what} must be a finite number`);
  return value;
}

const NODE_TYPES: ReadonlySet<string> = new Set(["task", "subflow", "annotation"]);

function parseTaskPayload(value: unknown): CanvasTaskPayload {
  if (typeof value !== "object" || value === null) fail("node.task must be an object");
  const raw = value as Record<string, unknown>;
  const writePaths = optStrArray(raw["writePaths"], "task.writePaths");
  const requiredArtifacts = optStrArray(raw["requiredArtifacts"], "task.requiredArtifacts");
  const gateId = optStr(raw["gateId"], "task.gateId");
  const role = optStr(raw["role"], "task.role");
  const suggestedSkills = optStrArray(raw["suggestedSkills"], "task.suggestedSkills");
  return {
    dependsOn: strArray(raw["dependsOn"], "task.dependsOn"),
    ...(writePaths === undefined ? {} : { writePaths }),
    ...(requiredArtifacts === undefined ? {} : { requiredArtifacts }),
    ...(gateId === undefined ? {} : { gateId }),
    ...(role === undefined ? {} : { role }),
    ...(suggestedSkills === undefined ? {} : { suggestedSkills }),
  };
}

function parseNode(value: unknown): CanvasNode {
  if (typeof value !== "object" || value === null) fail("node must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["key", "type", "title", "x", "y", "z", "g", "task", "text"].includes(field)) {
      fail(`unknown node field "${field}"`);
    }
  }
  const type = str(raw["type"], "node.type");
  if (!NODE_TYPES.has(type)) fail(`unknown node type "${type}"`);
  const key = str(raw["key"], "node.key");
  if (key.trim() === "") fail("node.key must be non-blank");
  // PLMP-CANVAS-5 INV-C5: type-mismatched payload fields fail loudly - the
  // parser never silently drops a field it accepted (round-trip must be
  // faithful, client-authored typos must not vanish).
  if (type !== "task" && raw["task"] !== undefined) fail(`node "${key}" must not carry field "task"`);
  if (type !== "annotation" && raw["text"] !== undefined) fail(`node "${key}" must not carry field "text"`);
  const node: CanvasNode = {
    key,
    type: type as CanvasNodeType,
    title: str(raw["title"], "node.title"),
    x: num(raw["x"], "node.x"),
    y: num(raw["y"], "node.y"),
    z: str(raw["z"], "node.z"),
    ...(raw["g"] === undefined ? {} : { g: str(raw["g"], "node.g") }),
    ...(type === "task" ? { task: parseTaskPayload(raw["task"]) } : {}),
    ...(type === "annotation" ? { text: str(raw["text"], "node.text") } : {}),
  };
  if (type === "task" && node.task === undefined) fail("task node needs node.task");
  return node;
}

function parseGroup(value: unknown): CanvasGroup {
  if (typeof value !== "object" || value === null) fail("group must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["id", "label", "g", "members"].includes(field)) {
      fail(`unknown group field "${field}"`);
    }
  }
  return {
    id: str(raw["id"], "group.id"),
    label: str(raw["label"], "group.label"),
    ...(raw["g"] === undefined ? {} : { g: str(raw["g"], "group.g") }),
    members: strArray(raw["members"], "group.members"),
  };
}

export function parseCanvasDoc(value: unknown): CanvasDoc {
  if (typeof value !== "object" || value === null) fail("document must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["version", "goal", "nodes", "groups"].includes(field)) {
      fail(`unknown document field "${field}"`);
    }
  }
  if (raw["version"] !== 1) fail(`unsupported version ${JSON.stringify(raw["version"])}`);
  if (!Array.isArray(raw["nodes"])) fail("nodes must be an array");
  if (!Array.isArray(raw["groups"])) fail("groups must be an array");
  const nodes = raw["nodes"].map(parseNode);
  const groups = raw["groups"].map(parseGroup);
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  if (byKey.size !== nodes.length) fail("duplicate node key");
  const groupIds = new Set(groups.map((group) => group.id));
  if (groupIds.size !== groups.length) fail("duplicate group id");
  // PLMP-CANVAS-5 INV-C1..C4: ownership integrity - a `z` chain must walk
  // subflow owners only, never itself, and terminate at the root; group `g`
  // nesting must terminate too. Cycles would hang every renderer-side walk
  // (member collection, bounds, visibility), so they are refused here,
  // before the doc reaches any renderer or compiler.
  for (const node of nodes) {
    if (node.z === ROOT_Z) continue;
    const owner = byKey.get(node.z);
    if (owner === undefined) fail(`node "${node.key}" references unknown owner "${node.z}"`);
    if (owner.type !== "subflow") fail(`node "${node.key}" owner "${node.z}" must be a subflow node`);
    if (owner.key === node.key) fail(`node "${node.key}" cannot own itself`);
  }
  for (const node of nodes) {
    const seen = new Set<string>([node.key]);
    let current = byKey.get(node.key)!;
    while (current.z !== ROOT_Z) {
      const owner = byKey.get(current.z)!;
      if (seen.has(owner.key)) fail(`ownership cycle detected at "${owner.key}"`);
      seen.add(owner.key);
      current = owner;
    }
  }
  for (const node of nodes) {
    if (node.g !== undefined && !groupIds.has(node.g)) {
      fail(`node "${node.key}" references unknown group "${node.g}"`);
    }
  }
  const groupById = new Map(groups.map((group) => [group.id, group]));
  for (const group of groups) {
    if (group.g !== undefined && !groupIds.has(group.g)) {
      fail(`group "${group.id}" references unknown group "${group.g}"`);
    }
    for (const member of group.members) {
      if (!byKey.has(member)) fail(`group "${group.id}" references unknown member "${member}"`);
    }
  }
  for (const group of groups) {
    const seen = new Set<string>([group.id]);
    let current = groupById.get(group.id)!;
    while (current.g !== undefined) {
      if (seen.has(current.g)) fail(`group nesting cycle detected at "${current.g}"`);
      seen.add(current.g);
      current = groupById.get(current.g)!;
    }
  }
  return { version: 1, goal: str(raw["goal"], "goal"), nodes, groups };
}

export function emptyCanvasDoc(goal = ""): CanvasDoc {
  return { version: 1, goal, nodes: [], groups: [] };
}
