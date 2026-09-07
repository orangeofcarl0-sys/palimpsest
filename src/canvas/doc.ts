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
 * JSON: a typo must fail loudly, not silently drop a task).
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
  if (type === "subflow" && raw["task"] !== undefined) fail("subflow node must not carry node.task");
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
  const keys = new Set(nodes.map((node) => node.key));
  if (keys.size !== nodes.length) fail("duplicate node key");
  for (const node of nodes) {
    if (node.z !== ROOT_Z && !keys.has(node.z)) {
      fail(`node "${node.key}" references unknown owner "${node.z}"`);
    }
  }
  const groups = raw["groups"].map(parseGroup);
  const groupIds = new Set(groups.map((group) => group.id));
  for (const node of nodes) {
    if (node.g !== undefined && !groupIds.has(node.g)) {
      fail(`node "${node.key}" references unknown group "${node.g}"`);
    }
  }
  for (const group of groups) {
    if (group.g !== undefined && !groupIds.has(group.g)) {
      fail(`group "${group.id}" references unknown group "${group.g}"`);
    }
    for (const member of group.members) {
      if (!keys.has(member)) fail(`group "${group.id}" references unknown member "${member}"`);
    }
  }
  return { version: 1, goal: str(raw["goal"], "goal"), nodes, groups };
}

export function emptyCanvasDoc(goal = ""): CanvasDoc {
  return { version: 1, goal, nodes: [], groups: [] };
}
