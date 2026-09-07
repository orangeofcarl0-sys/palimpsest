/**
 * PLMP-CANVAS-1 + PLMP-CANVAS-6 + PLMP-CANVAS-7 (32 号规格, G9-D): the canvas
 * definition layer. A CanvasDoc is the client-side authoring scratchpad - the
 * orchestration ledger stays the only server-side truth. The format follows
 * Node-RED's flat-array contract with ownership fields instead of nesting:
 * `z` names the owning subflow (root nodes say "root"); depth comes from `z`
 * chains, so arbitrary nesting serializes as a flat list.
 *
 * v3 (G9-D) is the identity-corrected single format: dependencies are
 * `doc.edges[]` - first-class `{id, source, target, kind:"data"}` records and
 * the ONE edge authoring truth (the old `task.dependsOn` payload field is
 * gone, so two encodings of the same edge can no longer disagree); every doc
 * carries an `identity` state (namespace + monotonic counters) whose
 * allocations never auto-reuse a retired id - a deleted n2 is never
 * regenerated, because rename/payload/scope edits keep identity, delete
 * retires it, and copy gets a fresh one. Definition identity must never be
 * automatically reused: it rides Canvas → ProjectProposal → TaskSpec →
 * ProjectIR → runtime → historical governance.
 *
 * Parsing is fail-closed on shape errors, unknown fields, ownership
 * integrity (PLMP-CANVAS-5) and edge references (INV-D1/D2, now edge-keyed).
 * Version 2 (payload dependsOn, regenerable edge ids) and v1 (title-keyed)
 * are not accepted anywhere - v3 is the single format, no dual-parse path;
 * v2 drafts migrate through the EXPLICIT `upgradeCanvasV2ToV3` converter
 * only (localStorage restore / JSON import / explicit migration action),
 * which preserves every existing node key - definition lineage must not be
 * renumbered by a schema upgrade.
 */

import type { ProjectProposal } from "../architecture/index.js";

export interface CanvasTaskPayload {
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
  /** PLMP-GRAPH-3: subflows only - "runtime" declares a runtime subgraph
   * (scope identity + boundary); absent means editorial (compile flatten). */
  readonly mode?: "runtime";
  readonly task?: CanvasTaskPayload;
  readonly text?: string;
}

/** PLMP-CANVAS-7: one edge authoring truth. Edge identity is first-class and
 * survives the IR round-trip byte-exactly; endpoints are part of the logical
 * edge identity, so a reconnect is delete + fresh id, never an in-place
 * retarget. The canvas grammar only speaks "data" - stronger edge kinds stay
 * IR-only (the capability gate refuses them). */
export interface CanvasEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: "data";
}

/** PLMP-CANVAS-7: the identity state. `namespace` scopes the id family
 * (`n:<ns>:<k>` / `e:<ns>:<k>`) so fresh allocations never collide with
 * legacy `nK` keys; the counters are monotonic - deletion never rewinds
 * them, which is exactly what makes retired ids unreusable. */
export interface CanvasIdentityState {
  readonly namespace: string;
  readonly nextNode: number;
  readonly nextEdge: number;
}

export interface CanvasGroup {
  readonly id: string;
  readonly label: string;
  readonly g?: string;
  readonly members: readonly string[];
}

export interface CanvasDoc {
  /** v3 (PLMP-CANVAS-7): edges[] is the only edge truth, identity state
   * included. v2/v1 are not accepted - migrate through upgradeCanvasV2ToV3. */
  readonly version: 3;
  readonly goal: string;
  readonly identity: CanvasIdentityState;
  readonly nodes: readonly CanvasNode[];
  readonly edges: readonly CanvasEdge[];
  readonly groups: readonly CanvasGroup[];
}

export const ROOT_Z = "root";

/** Namespace charset: no colons, so the `n:<ns>:<k>` family regexes stay
 * unambiguous. Web drafts use a random hex slice; kernel internals use "sys". */
export const CANVAS_NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

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

function parsePayloadFields(raw: Record<string, unknown>): CanvasTaskPayload {
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

function parseNode(value: unknown): CanvasNode {
  if (typeof value !== "object" || value === null) fail("node must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["key", "type", "title", "x", "y", "z", "mode", "task", "text"].includes(field)) {
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
  // PLMP-GRAPH-3: mode is a subflow-only declaration with a single encoding.
  if (raw["mode"] !== undefined && type !== "subflow") fail(`node "${key}" must not carry field "mode"`);
  if (raw["mode"] !== undefined && raw["mode"] !== "runtime") {
    fail(`node "${key}" mode must be "runtime"`);
  }
  const node: CanvasNode = {
    key,
    type: type as CanvasNodeType,
    title: str(raw["title"], "node.title"),
    x: num(raw["x"], "node.x"),
    y: num(raw["y"], "node.y"),
    z: str(raw["z"], "node.z"),
    ...(raw["mode"] === undefined ? {} : { mode: "runtime" as const }),
    ...(type === "task" ? { task: parseTaskPayload(raw["task"]) } : {}),
    ...(type === "annotation" ? { text: str(raw["text"], "node.text") } : {}),
  };
  if (type === "task" && node.task === undefined) fail("task node needs node.task");
  return node;
}

function parseTaskPayload(value: unknown): CanvasTaskPayload {
  if (typeof value !== "object" || value === null) fail("node.task must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    // `dependsOn` retired with v3: edges[] is the single edge truth (32 号).
    if (!["writePaths", "requiredArtifacts", "gateId", "role", "suggestedSkills"].includes(field)) {
      fail(`unknown node.task field "${field}"`);
    }
  }
  return parsePayloadFields(raw);
}

function parseEdge(value: unknown): CanvasEdge {
  if (typeof value !== "object" || value === null) fail("edge must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["id", "source", "target", "kind"].includes(field)) {
      fail(`unknown edge field "${field}"`);
    }
  }
  const id = str(raw["id"], "edge.id");
  if (id.trim() === "") fail("edge.id must be non-blank");
  const kind = str(raw["kind"], "edge.kind");
  // Canvas grammar speaks "data" only this round (32 号): message/control
  // edges stay IR-only and must not sneak into authoring state.
  if (kind !== "data") fail(`edge "${id}" kind must be "data" (canvas grammar)`);
  const source = str(raw["source"], "edge.source");
  const target = str(raw["target"], "edge.target");
  if (source === target) fail(`edge "${id}" connects "${source}" to itself`);
  return { id, source, target, kind: "data" };
}

function parseIdentity(value: unknown): CanvasIdentityState {
  if (typeof value !== "object" || value === null) fail("identity must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["namespace", "nextNode", "nextEdge"].includes(field)) {
      fail(`unknown identity field "${field}"`);
    }
  }
  const namespace = str(raw["namespace"], "identity.namespace");
  if (!CANVAS_NAMESPACE_PATTERN.test(namespace)) {
    fail(`identity.namespace "${namespace}" must match ${CANVAS_NAMESPACE_PATTERN.source}`);
  }
  const positive = (value: unknown, what: string): number => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      fail(`${what} must be an integer >= 1`);
    }
    return value;
  };
  return {
    namespace,
    nextNode: positive(raw["nextNode"], "identity.nextNode"),
    nextEdge: positive(raw["nextEdge"], "identity.nextEdge"),
  };
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

/** Highest counter floor implied by a namespace family present in real ids.
 * Counters never rewind below what the doc's own family ids already
 * consumed, so an unload→edit→unload chain cannot resurrect a retired id. */
export function familyCountersOf(
  namespace: string,
  nodeIds: readonly string[],
  edgeIds: readonly string[],
): { nextNode: number; nextEdge: number } {
  const nodePattern = new RegExp(`^n:${namespace}:(\\d+)$`);
  const edgePattern = new RegExp(`^e:${namespace}:(\\d+)$`);
  let nextNode = 1;
  for (const id of nodeIds) {
    const match = nodePattern.exec(id);
    if (match !== null) nextNode = Math.max(nextNode, Number(match[1]) + 1);
  }
  let nextEdge = 1;
  for (const id of edgeIds) {
    const match = edgePattern.exec(id);
    if (match !== null) nextEdge = Math.max(nextEdge, Number(match[1]) + 1);
  }
  return { nextNode, nextEdge };
}

/** The monotonic node allocator: a fresh id from the doc's own family, with
 * a collision loop as defense against externally injected same-family ids.
 * The counter advances monotonically, so ids this doc allocated before -
 * even since-deleted ones - are never regenerated. */
export function allocateCanvasNodeId(doc: CanvasDoc): { doc: CanvasDoc; id: string } {
  const used = new Set(doc.nodes.map((node) => node.key));
  let counter = Math.max(1, doc.identity.nextNode);
  while (used.has(`n:${doc.identity.namespace}:${counter}`)) counter += 1;
  const id = `n:${doc.identity.namespace}:${counter}`;
  return { doc: { ...doc, identity: { ...doc.identity, nextNode: counter + 1 } }, id };
}

/** Edge twin of `allocateCanvasNodeId` (same monotonic family discipline). */
export function allocateCanvasEdgeId(doc: CanvasDoc): { doc: CanvasDoc; id: string } {
  const used = new Set(doc.edges.map((edge) => edge.id));
  let counter = Math.max(1, doc.identity.nextEdge);
  while (used.has(`e:${doc.identity.namespace}:${counter}`)) counter += 1;
  const id = `e:${doc.identity.namespace}:${counter}`;
  return { doc: { ...doc, identity: { ...doc.identity, nextEdge: counter + 1 } }, id };
}

export function parseCanvasDoc(value: unknown): CanvasDoc {
  if (typeof value !== "object" || value === null) fail("document must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["version", "goal", "identity", "nodes", "edges", "groups"].includes(field)) {
      fail(`unknown document field "${field}"`);
    }
  }
  if (raw["version"] === 2) {
    fail(
      "unsupported version 2 - canvas doc v3 (edges[] + identity) is the only format; migrate v2 drafts through upgradeCanvasV2ToV3 (explicit conversion, preserves node keys)",
    );
  }
  if (raw["version"] !== 3) {
    fail(`unsupported version ${JSON.stringify(raw["version"])} - canvas doc v3 is the only format`);
  }
  if (!Array.isArray(raw["nodes"])) fail("nodes must be an array");
  if (!Array.isArray(raw["edges"])) fail("edges must be an array");
  if (!Array.isArray(raw["groups"])) fail("groups must be an array");
  const nodes = raw["nodes"].map(parseNode);
  const edges = raw["edges"].map(parseEdge);
  const groups = raw["groups"].map(parseGroup);
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  if (byKey.size !== nodes.length) fail("duplicate node key");
  const edgeIds = new Set(edges.map((edge) => edge.id));
  if (edgeIds.size !== edges.length) fail("duplicate edge id");
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
  // PLMP-CANVAS-6 INV-D1/D2 (edge-keyed since v3): edge endpoints must
  // reference existing nodes and the SOURCE must be a task - you can only
  // depend on tasks (payload dependsOn semantics, now carried by the edge
  // record). Cycles and parallel data edges are the capability gate's
  // verdict, not silent authoring errors.
  for (const edge of edges) {
    const source = byKey.get(edge.source);
    if (source === undefined) fail(`edge "${edge.id}" references unknown source "${edge.source}"`);
    if (source.type !== "task") fail(`edge "${edge.id}" sources "${edge.source}" which is not a task`);
    const target = byKey.get(edge.target);
    if (target === undefined) fail(`edge "${edge.id}" references unknown target "${edge.target}"`);
  }
  return {
    version: 3,
    goal: str(raw["goal"], "goal"),
    identity: parseIdentity(raw["identity"]),
    nodes,
    edges,
    groups,
  };
}

export function emptyCanvasDoc(goal = "", namespace = "sys"): CanvasDoc {
  if (!CANVAS_NAMESPACE_PATTERN.test(namespace)) {
    fail(`identity.namespace "${namespace}" must match ${CANVAS_NAMESPACE_PATTERN.source}`);
  }
  return { version: 3, goal, identity: { namespace, nextNode: 1, nextEdge: 1 }, nodes: [], edges: [], groups: [] };
}

// ---------------------------------------------------------------------------
// PLMP-CANVAS-7 §3.8: the explicit v2 → v3 converter. NOT a dual parser -
// `parseCanvasDoc` still only speaks v3. This runs once per restored/imported
// draft (localStorage restore / JSON import / explicit migration action),
// validates the v2 shape strictly (fail-closed, same invariants the v2
// parser enforced), preserves every existing node key (definition lineage
// must not be renumbered), folds the retired `node.g` second encoding into
// `group.members`, and flattens payload `dependsOn[]` into deterministic
// `doc.edges[]` with `e:<ns>:<k>` ids. The caller supplies the namespace
// (web: a random hex slice per draft) and must surface the upgrade to the
// user ("canvas draft upgraded v2 → v3").
// ---------------------------------------------------------------------------

interface V2Node {
  readonly key: string;
  readonly type: CanvasNodeType;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly z: string;
  readonly g?: string;
  readonly mode?: "runtime";
  readonly task?: { readonly dependsOn: readonly string[] } & CanvasTaskPayload;
  readonly text?: string;
}

interface V2Doc {
  readonly goal: string;
  readonly nodes: readonly V2Node[];
  readonly groups: readonly CanvasGroup[];
}

/** Strict v2 validation - private on purpose: the converter is the only
 * consumer, so v2 has no second public parse path. */
function parseV2Doc(value: unknown): V2Doc {
  if (typeof value !== "object" || value === null) fail("document must be an object");
  const raw = value as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    if (!["version", "goal", "nodes", "groups"].includes(field)) {
      fail(`unknown document field "${field}"`);
    }
  }
  if (raw["version"] !== 2) {
    fail(`unsupported version ${JSON.stringify(raw["version"])} - the converter migrates v2 docs only`);
  }
  if (!Array.isArray(raw["nodes"])) fail("nodes must be an array");
  if (!Array.isArray(raw["groups"])) fail("groups must be an array");
  const nodes: V2Node[] = raw["nodes"].map((entry: unknown): V2Node => {
    if (typeof entry !== "object" || entry === null) fail("node must be an object");
    const nodeRaw = entry as Record<string, unknown>;
    for (const field of Object.keys(nodeRaw)) {
      if (!["key", "type", "title", "x", "y", "z", "g", "mode", "task", "text"].includes(field)) {
        fail(`unknown node field "${field}"`);
      }
    }
    const type = str(nodeRaw["type"], "node.type");
    if (!NODE_TYPES.has(type)) fail(`unknown node type "${type}"`);
    const key = str(nodeRaw["key"], "node.key");
    if (key.trim() === "") fail("node.key must be non-blank");
    if (type !== "task" && nodeRaw["task"] !== undefined) fail(`node "${key}" must not carry field "task"`);
    if (type !== "annotation" && nodeRaw["text"] !== undefined) fail(`node "${key}" must not carry field "text"`);
    if (nodeRaw["mode"] !== undefined && type !== "subflow") fail(`node "${key}" must not carry field "mode"`);
    if (nodeRaw["mode"] !== undefined && nodeRaw["mode"] !== "runtime") {
      fail(`node "${key}" mode must be "runtime"`);
    }
    let task: V2Node["task"];
    if (type === "task") {
      if (typeof nodeRaw["task"] !== "object" || nodeRaw["task"] === null) fail("node.task must be an object");
      const taskRaw = nodeRaw["task"] as Record<string, unknown>;
      for (const field of Object.keys(taskRaw)) {
        if (!["dependsOn", "writePaths", "requiredArtifacts", "gateId", "role", "suggestedSkills"].includes(field)) {
          fail(`unknown node.task field "${field}"`);
        }
      }
      task = {
        dependsOn: strArray(taskRaw["dependsOn"], "task.dependsOn"),
        ...parsePayloadFields(taskRaw),
      };
    }
    const node: V2Node = {
      key,
      type: type as CanvasNodeType,
      title: str(nodeRaw["title"], "node.title"),
      x: num(nodeRaw["x"], "node.x"),
      y: num(nodeRaw["y"], "node.y"),
      z: str(nodeRaw["z"], "node.z"),
      ...(nodeRaw["g"] === undefined ? {} : { g: str(nodeRaw["g"], "node.g") }),
      ...(nodeRaw["mode"] === undefined ? {} : { mode: "runtime" as const }),
      ...(task === undefined ? {} : { task }),
      ...(type === "annotation" ? { text: str(nodeRaw["text"], "node.text") } : {}),
    };
    if (type === "task" && node.task === undefined) fail("task node needs node.task");
    return node;
  });
  const groups = raw["groups"].map(parseGroup);
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  if (byKey.size !== nodes.length) fail("duplicate node key");
  const groupIds = new Set(groups.map((group) => group.id));
  if (groupIds.size !== groups.length) fail("duplicate group id");
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
  for (const node of nodes) {
    for (const dependency of node.task?.dependsOn ?? []) {
      const target = byKey.get(dependency);
      if (target === undefined) {
        fail(`node "${node.key}" depends on unknown key "${dependency}"`);
      }
      if (target.type !== "task") {
        fail(`node "${node.key}" depends on "${dependency}" which is not a task`);
      }
    }
  }
  return { goal: str(raw["goal"], "goal"), nodes, groups };
}

/**
 * Explicit v2 → v3 migration. Rules (32 号 §3.8, frozen): node keys are
 * preserved verbatim; payload `dependsOn` flattens to edges in node
 * declaration × dependency order with deterministic `e:<ns>:<k>` ids;
 * `node.g` folds into `group.members` (the single membership truth); the
 * identity counters start at the family floor (legacy `nK` keys are outside
 * the `n:<ns>:<k>` family, so fresh allocations cannot collide with them).
 */
export function upgradeCanvasV2ToV3(value: unknown, namespace: string): CanvasDoc {
  if (!CANVAS_NAMESPACE_PATTERN.test(namespace)) {
    fail(`identity.namespace "${namespace}" must match ${CANVAS_NAMESPACE_PATTERN.source}`);
  }
  const v2 = parseV2Doc(value);
  const membersByGroup = new Map<string, string[]>(v2.groups.map((group) => [group.id, [...group.members]]));
  const nodes: CanvasNode[] = v2.nodes.map((node) => {
    if (node.g !== undefined) {
      const members = membersByGroup.get(node.g);
      if (members !== undefined && !members.includes(node.key)) members.push(node.key);
    }
    return {
      key: node.key,
      type: node.type,
      title: node.title,
      x: node.x,
      y: node.y,
      z: node.z,
      ...(node.mode === undefined ? {} : { mode: node.mode }),
      ...(node.type === "task" ? { task: parsePayloadFields((node.task ?? {}) as Record<string, unknown>) } : {}),
      ...(node.type === "annotation" ? { text: node.text ?? "" } : {}),
    };
  });
  let edgeCounter = 0;
  const edges: CanvasEdge[] = v2.nodes.flatMap((node) =>
    (node.task?.dependsOn ?? []).map((source) => {
      edgeCounter += 1;
      return { id: `e:${namespace}:${edgeCounter}`, source, target: node.key, kind: "data" as const };
    }),
  );
  const family = familyCountersOf(
    namespace,
    nodes.map((node) => node.key),
    edges.map((edge) => edge.id),
  );
  return {
    version: 3,
    goal: v2.goal,
    identity: { namespace, nextNode: family.nextNode, nextEdge: family.nextEdge },
    nodes,
    edges,
    groups: v2.groups.map((group) => ({
      id: group.id,
      label: group.label,
      ...(group.g === undefined ? {} : { g: group.g }),
      members: membersByGroup.get(group.id) ?? [...group.members],
    })),
  };
}
