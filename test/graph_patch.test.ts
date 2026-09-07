import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyGraphPatch,
  compileAgentGraph,
  diffGraphPatch,
  EMPTY_PATCH,
  patchFromFragment,
  validateGraphPatch,
  type AgentGraph,
  type GraphPatch,
} from "../src/graph/index.js";
import { liftToAgentGraph, parseCanvasDoc, unloadToCanvasDoc } from "../src/canvas/index.js";
import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import type { ProjectProposal } from "../src/architecture/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function baseGraph(): AgentGraph {
  return {
    version: 1,
    goal: "g",
    nodes: [
      { id: "a", kind: "agent", label: "调研", scope: "root", task: {} },
      { id: "b", kind: "agent", label: "综合", scope: "root", task: { role: "analyst" } },
    ],
    edges: [{ id: "e1", source: "a", target: "b", kind: "data" }],
  };
}

const agent = (id: string, label: string, scope = "root") => ({
  id,
  kind: "agent" as const,
  label,
  scope,
  task: {},
});

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-patch-")), "ops.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: "scheduler-project",
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => "2026-09-07T00:00:00Z",
  });
  return {
    store,
    controller,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

function eventCount(store: EventStore): number {
  return (
    store.connection.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number }
  ).c;
}

interface Json {
  [key: string]: unknown;
}

async function api(
  handle: ServeHandle,
  path: string,
  init?: { method?: string; body?: unknown; token?: string | null },
): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {};
  const token = init?.token === null ? undefined : (init?.token ?? handle.token);
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  if (init?.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${handle.url}${path}`, {
    method: init?.method ?? "GET",
    headers,
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return { status: response.status, json: (await response.json()) as Json };
}

describe("graph patch (PLMP-GRAPH-2)", () => {
  it("PATCH-A01: the diagnostic matrix refuses every malformed operation", () => {
    const base = baseGraph();
    expect(
      validateGraphPatch(base, { ...EMPTY_PATCH, removeNodes: ["ghost"] }),
    ).toEqual([{ type: "UNKNOWN_NODE", id: "ghost", detail: 'node "ghost" does not exist' }]);
    expect(
      validateGraphPatch(base, { ...EMPTY_PATCH, removeEdges: ["ghost"] }),
    ).toEqual([{ type: "UNKNOWN_EDGE", id: "ghost", detail: 'edge "ghost" does not exist' }]);
    expect(
      validateGraphPatch(base, { ...EMPTY_PATCH, updateNodes: [{ id: "ghost", label: "X" }] })[0]!.type,
    ).toBe("UNKNOWN_NODE");
    expect(
      validateGraphPatch(base, { ...EMPTY_PATCH, updateEdges: [{ id: "ghost", kind: "data" }] })[0]!.type,
    ).toBe("UNKNOWN_EDGE");
    expect(validateGraphPatch(base, { ...EMPTY_PATCH, addNodes: [agent("a", "撞名")] })[0]!.type).toBe(
      "DUPLICATE_NODE_ID",
    );
    expect(
      validateGraphPatch(base, {
        ...EMPTY_PATCH,
        addEdges: [
          { id: "x1", source: "a", target: "b", kind: "data" },
          { id: "x1", source: "b", target: "a", kind: "data" },
        ],
      })[0]!.type,
    ).toBe("DUPLICATE_EDGE_ID");
    // NODE_HAS_EDGES: removals are explicit, never cascading.
    expect(validateGraphPatch(base, { ...EMPTY_PATCH, removeNodes: ["a"] })).toEqual([
      { type: "NODE_HAS_EDGES", id: "a", detail: 'node "a" is removed but edge "e1" still references it' },
    ]);
    const clean = applyGraphPatch(base, { ...EMPTY_PATCH, removeEdges: ["e1"] });
    expect(validateGraphPatch(clean, { ...EMPTY_PATCH, removeNodes: ["a"] })).toEqual([]);
    expect(validateGraphPatch(base, { ...EMPTY_PATCH, addEdges: [{ id: "x2", source: "a", target: "ghost", kind: "data" }] })[0]!.type).toBe(
      "EDGE_ENDPOINT_UNKNOWN",
    );
    expect(
      validateGraphPatch(base, { ...EMPTY_PATCH, addEdges: [{ id: "x3", source: "a", target: "a", kind: "data" }] })[0]!.type,
    ).toBe("EDGE_SELF_LOOP");
    expect(
      validateGraphPatch(base, { ...EMPTY_PATCH, moveScope: [{ id: "a", scope: "ghost" }] })[0]!.type,
    ).toBe("INVALID_MOVE_SCOPE");
    // INVALID_MOVE_SCOPE stays distinct from SCOPE_CYCLE: an agent is not a
    // valid target at all...
    const withSub: AgentGraph = {
      ...base,
      nodes: [...base.nodes, { id: "s", kind: "subgraph", label: "S", scope: "root" }],
    };
    expect(
      validateGraphPatch(withSub, { ...EMPTY_PATCH, moveScope: [{ id: "s", scope: "a" }] }),
    ).toEqual([{ type: "INVALID_MOVE_SCOPE", id: "s", detail: 'move target "a" is not a subgraph' }]);
    // ...while a subgraph nested inside s closes the ring when s moves into it.
    const nested: AgentGraph = {
      ...withSub,
      nodes: [...withSub.nodes, { id: "s2", kind: "subgraph", label: "S2", scope: "s" }],
    };
    expect(
      validateGraphPatch(nested, { ...EMPTY_PATCH, moveScope: [{ id: "s", scope: "s2" }] }),
    ).toEqual([{ type: "SCOPE_CYCLE", id: "s", detail: 'scope cycle through "s"' }]);
    // STALE_BASE: governance-boundary freshness.
    expect(
      validateGraphPatch(base, { ...EMPTY_PATCH, baseRevision: 3 }, { liveRevision: 7 }),
    ).toEqual([
      { type: "STALE_BASE", detail: "patch anchors revision 3, live is 7" },
    ]);
    expect(validateGraphPatch(base, { ...EMPTY_PATCH, baseRevision: 7 }, { liveRevision: 7 })).toEqual([]);
    // applyGraphPatch throws with the first diagnostic.
    expect(() => applyGraphPatch(base, { ...EMPTY_PATCH, removeNodes: ["a"] })).toThrow(/NODE_HAS_EDGES/);
  });

  it("PATCH-A02: fixed apply order, full op coverage, deterministic result", () => {
    const base = baseGraph();
    const patch: GraphPatch = {
      removeEdges: [],
      removeNodes: [],
      updateNodes: [{ id: "a", label: "调研（改）" }],
      updateEdges: [],
      moveScope: [],
      addNodes: [agent("c", "验证", "root"), { id: "s", kind: "subgraph", label: "子图", scope: "root" }],
      addEdges: [
        { id: "e2", source: "b", target: "c", kind: "data" },
        { id: "e3", source: "c", target: "a", kind: "data" },
      ],
    };
    const once = applyGraphPatch(base, patch);
    const twice = applyGraphPatch(base, patch);
    expect(once).toEqual(twice);
    expect(once.nodes.map((node) => node.label)).toEqual(["调研（改）", "综合", "验证", "子图"]);
    expect(once.edges).toEqual([
      { id: "e1", source: "a", target: "b", kind: "data" },
      { id: "e2", source: "b", target: "c", kind: "data" },
      { id: "e3", source: "c", target: "a", kind: "data" },
    ]);
    // Update + move + remove compose; removal of edges precedes node removal.
    // (The edge kind mutation is real: same-kind updates are NO_OP refusals
    // since the 31 号 §B2-C no-op verdict.)
    const composed = applyGraphPatch(once, {
      removeEdges: ["e3", "e2"],
      removeNodes: ["c"],
      updateNodes: [],
      updateEdges: [{ id: "e1", kind: "control" }],
      moveScope: [{ id: "b", scope: "s" }],
      addNodes: [],
      addEdges: [],
    });
    expect(composed.nodes.map((node) => [node.id, node.scope])).toEqual([
      ["a", "root"],
      ["b", "s"],
      ["s", "root"],
    ]);
    expect(composed.edges).toEqual([{ id: "e1", source: "a", target: "b", kind: "control" }]);
    // Preview lines follow the apply order.
    const preview = diffGraphPatch(base, patch);
    expect(preview.map((entry) => entry.op)).toEqual(["add", "add", "update", "add", "add"]);
    expect(preview[0]).toEqual({ op: "add", target: "node", id: "c", detail: "Agent 验证" });
  });

  it("PATCH-A03: patchFromFragment applies to compile-equality with fragment insertion", () => {
    const proposal: ProjectProposal = {
      goal: "g",
      changeClass: "behavior_change",
      tasks: [
        { title: "A", dependsOn: [] },
        { title: "B", dependsOn: ["A"], writePaths: ["out/x.md"] },
        { title: "C", dependsOn: ["A", "B"] },
      ],
    };
    const base = baseGraph();
    const patch = patchFromFragment(base, proposal);
    expect(patch.addNodes.map((node) => node.id)).toEqual(["n1", "n2", "n3"]);
    expect(patch.addEdges.map((edge) => [edge.source, edge.target])).toEqual([
      ["n1", "n2"],
      ["n1", "n3"],
      ["n2", "n3"],
    ]);
    const patched = applyGraphPatch(base, patch);
    const compiled = compileAgentGraph(patched);
    expect(compiled.tasks.slice(0, 2).map((task) => task.title)).toEqual(["调研", "综合"]);
    expect(compiled.tasks.slice(2).map((task) => task.definitionId)).toEqual(["n1", "n2", "n3"]);
    expect(
      compiled.tasks.slice(2).map(({ definitionId: _definitionId, ...rest }) => rest),
    ).toEqual(proposal.tasks);
  });

  it("PATCH-A04: unload round-trips the IR (lift∘unload ≡ identity) with deterministic grid", () => {
    const doc = parseCanvasDoc({
      version: 2,
      goal: "g",
      nodes: [
        { key: "a", type: "task", title: "A", x: 10, y: 20, z: "root", task: { dependsOn: [] } },
        { key: "s1", type: "subflow", title: "S", x: 0, y: 0, z: "root" },
        { key: "m", type: "task", title: "M", x: 30, y: 40, z: "s1", task: { dependsOn: ["a"], role: "scout" } },
        { key: "note", type: "annotation", title: "备注", x: 50, y: 60, z: "root", text: "hi" },
      ],
      groups: [],
    });
    const graph = liftToAgentGraph(doc);
    const unloaded = unloadToCanvasDoc(graph);
    expect(liftToAgentGraph(unloaded)).toEqual(graph);
    // Positions: kept via the map, deterministic grid otherwise.
    const placed = unloadToCanvasDoc(graph, new Map([["a", { x: 500, y: 400 }]]));
    expect(placed.nodes.find((node) => node.key === "a")!.x).toBe(500);
    const grid = unloadToCanvasDoc(graph);
    expect(grid.nodes.map((node) => [node.x, node.y])).toEqual([
      [80, 80],
      [320, 80],
      [560, 80],
      [800, 80],
    ]);
  });

  it("PATCH-A05: serve reviews patches - apply/stale/refusal, token gate, zero events", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      const doc = {
        version: 2,
        goal: "g",
        nodes: [{ key: "n1", type: "task", title: "已有", x: 0, y: 0, z: "root", task: { dependsOn: [] } }],
        groups: [],
      };
      const patch = {
        removeEdges: [],
        removeNodes: [],
        updateNodes: [],
        updateEdges: [],
        moveScope: [],
        addNodes: [{ id: "n9", kind: "agent", label: "新增", scope: "root", task: {} }],
        addEdges: [{ id: "pe1", source: "n1", target: "n9", kind: "data" }],
      };
      const unauthed = await api(handle, "/api/canvas/patch", { method: "POST", body: { doc, patch }, token: null });
      expect(unauthed.status).toBe(401);
      const before = eventCount(rig.store);
      const applied = await api(handle, "/api/canvas/patch", { method: "POST", body: { doc, patch } });
      expect(applied.status).toBe(200);
      expect(applied.json.applied).toBe(true);
      expect(applied.json.diagnostics).toEqual([]);
      const nextDoc = applied.json.doc as Json;
      expect((nextDoc.nodes as Json[]).map((node) => node.title)).toEqual(["已有", "新增"]);
      expect(((nextDoc.nodes as Json[])[1] as Json).task).toEqual({ dependsOn: ["n1"] });
      expect(applied.json.preview).toEqual([
        { op: "add", target: "node", id: "n9", detail: "Agent 新增" },
        { op: "add", target: "edge", id: "pe1", detail: "边 已有 → 新增" },
      ]);
      // Unknown node → refused with diagnostics, no doc.
      const refused = await api(handle, "/api/canvas/patch", {
        method: "POST",
        body: { doc, patch: { ...patch, addEdges: [{ id: "pe2", source: "ghost", target: "n9", kind: "data" }] } },
      });
      expect(refused.json.applied).toBe(false);
      expect((refused.json.diagnostics as Json[])[0]!.type).toBe("EDGE_ENDPOINT_UNKNOWN");
      expect(refused.json.doc).toBeUndefined();
      // Stale base → refused.
      const stale = await api(handle, "/api/canvas/patch", {
        method: "POST",
        body: { doc, patch: { ...patch, baseRevision: 99 } },
      });
      expect(stale.json.applied).toBe(false);
      expect((stale.json.diagnostics as Json[])[0]!.type).toBe("STALE_BASE");
      expect(eventCount(rig.store)).toBe(before);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });
});
