import { describe, expect, it } from "vitest";

import {
  parseAgentGraph,
  agentGraphCapabilities,
  compileAgentGraph,
  type AgentGraph,
} from "../src/graph/index.js";
import { canvasCompile, canvasLayout, liftToAgentGraph, parseCanvasDoc } from "../src/canvas/index.js";
import { validateProjectProposal } from "../src/architecture/index.js";
import type { CanvasDoc } from "../src/canvas/index.js";

function docWith(...nodes: CanvasDoc["nodes"]): CanvasDoc {
  return { version: 2, goal: "g", nodes, groups: [] };
}

function taskNode(key: string, title: string, x: number, y: number, z = "root", dependsOn: string[] = []) {
  return { key, type: "task" as const, title, x, y, z, task: { dependsOn } };
}

const agentNode = (id: string, label: string, scope = "root") => ({
  id,
  kind: "agent" as const,
  label,
  scope,
  task: {},
});

describe("agent graph IR (PLMP-GRAPH-1)", () => {
  it("GRAPH-A01: parse is fail-closed across the full matrix; clean graphs round-trip", () => {
    const graph: AgentGraph = {
      version: 1,
      goal: "g",
      nodes: [
        agentNode("a", "调研"),
        { id: "s", kind: "subgraph", label: "子图", scope: "root" },
        { id: "m", kind: "agent", label: "成员", scope: "s", task: { role: "scout" } },
        { id: "note", kind: "annotation", label: "备注", scope: "root", text: "todo" },
      ],
      edges: [{ id: "e1", source: "m", target: "a", kind: "data" }],
    };
    expect(parseAgentGraph(JSON.parse(JSON.stringify(graph)))).toEqual(graph);
    expect(() => parseAgentGraph({ ...graph, version: 2 })).toThrow(/version/);
    expect(() => parseAgentGraph({ ...graph, extra: 1 })).toThrow(/unknown graph field/);
    expect(() =>
      parseAgentGraph({ ...graph, nodes: [...graph.nodes, { ...agentNode("a", "重名") }] }),
    ).toThrow(/duplicate node id/);
    expect(() =>
      parseAgentGraph({
        ...graph,
        nodes: [...graph.nodes, { ...agentNode("x", "悬空"), scope: "ghost" }],
      }),
    ).toThrow(/unknown scope "ghost"/);
    expect(() =>
      parseAgentGraph({
        ...graph,
        nodes: [...graph.nodes, { ...agentNode("x", "坏 owner"), scope: "a" }],
      }),
    ).toThrow(/must be a subgraph/);
    expect(() =>
      parseAgentGraph({
        ...graph,
        nodes: [...graph.nodes, { id: "s2", kind: "subgraph", label: "自指", scope: "s2" }],
      }),
    ).toThrow(/cannot scope itself/);
    expect(() =>
      parseAgentGraph({
        ...graph,
        nodes: [
          ...graph.nodes,
          { id: "p", kind: "subgraph", label: "P", scope: "q" },
          { id: "q", kind: "subgraph", label: "Q", scope: "p" },
        ],
      }),
    ).toThrow(/scope cycle/);
    expect(() =>
      parseAgentGraph({ ...graph, edges: [{ id: "e2", source: "ghost", target: "a", kind: "data" }] }),
    ).toThrow(/unknown node "ghost"/);
    expect(() =>
      parseAgentGraph({ ...graph, edges: [...graph.edges, { id: "e9", source: "a", target: "a", kind: "data" }] }),
    ).toThrow(/to itself/);
    expect(() =>
      parseAgentGraph({
        ...graph,
        edges: [...graph.edges, { id: "e3", source: "a", target: "m", kind: "teleport" }],
      }),
    ).toThrow(/unknown edge kind/);
    // An agent node without its task payload is a shape error.
    const { task: _omit, ...agentWithoutTask } = agentNode("x", "无载荷");
    expect(() =>
      parseAgentGraph({
        ...graph,
        nodes: [...graph.nodes, agentWithoutTask as AgentGraph["nodes"][number]],
      }),
    ).toThrow(/needs node.task/);
    // Advisory kinds carry no agent payload: bare tool node is legal IR
    // (the capability gate refuses it at compile), but carrying one is not.
    const bareTool = { id: "t", kind: "tool", label: "工具", scope: "root" };
    const withBareTool = parseAgentGraph({
      ...graph,
      nodes: [...graph.nodes, bareTool as AgentGraph["nodes"][number]],
    });
    expect(agentGraphCapabilities(withBareTool)).toEqual([
      { type: "UNSUPPORTED_NODE_KIND", node: "t", detail: 'node kind "tool" has no runtime semantics yet' },
    ]);
    expect(() =>
      parseAgentGraph({
        ...graph,
        nodes: [...graph.nodes, { ...bareTool, task: {} } as AgentGraph["nodes"][number]],
      }),
    ).toThrow(/must not carry field "task"/);
    expect(() =>
      parseAgentGraph({ ...graph, edges: [{ id: "e1", source: "m", target: "a", kind: "data" }, { id: "e1", source: "a", target: "m", kind: "data" }] }),
    ).toThrow(/duplicate edge id/);
  });

  it("GRAPH-A02: lift maps doc→IR exactly and compiles byte-identically to the canvas compile", () => {
    const doc = parseCanvasDoc(
      docWith(
        taskNode("out", "外部", 0, 0),
        { key: "s1", type: "subflow", title: "外层", x: 0, y: 0, z: "root" },
        { key: "s2", type: "subflow", title: "内层", x: 0, y: 0, z: "s1" },
        { ...taskNode("m1", "成员一", 0, 0, "s2"), task: { dependsOn: ["out"], role: "scout" } },
        { ...taskNode("m2", "成员二", 0, 0, "s1"), task: { dependsOn: ["m1"] } },
        { key: "note", type: "annotation", title: "备注", x: 0, y: 0, z: "root", text: "todo" },
      ),
    );
    const graph = liftToAgentGraph(doc);
    expect(graph.nodes.map((node) => [node.id, node.kind, node.scope])).toEqual([
      ["out", "agent", "root"],
      ["s1", "subgraph", "root"],
      ["s2", "subgraph", "s1"],
      ["m1", "agent", "s2"],
      ["m2", "agent", "s1"],
      ["note", "annotation", "root"],
    ]);
    expect(graph.edges).toEqual([
      { id: "e1", source: "out", target: "m1", kind: "data" },
      { id: "e2", source: "m1", target: "m2", kind: "data" },
    ]);
    expect(agentGraphCapabilities(graph)).toEqual([]);
    const viaIr = compileAgentGraph(graph);
    expect(viaIr).toEqual(canvasCompile(doc));
    expect(validateProjectProposal(viaIr)).toEqual([]);
  });

  it("GRAPH-A03: the capability gate refuses every non-runtime semantic, compile throws", () => {
    const base: AgentGraph = {
      version: 1,
      goal: "g",
      nodes: [agentNode("a", "A"), agentNode("b", "B")],
      edges: [{ id: "e1", source: "a", target: "b", kind: "data" }],
    };
    expect(compileAgentGraph(base)).toEqual({
      goal: "g",
      changeClass: "behavior_change",
      tasks: [
        { title: "A", dependsOn: [], definitionId: "a" },
        { title: "B", dependsOn: ["A"], definitionId: "b" },
      ],
    });
    // UNSUPPORTED_NODE_KIND: advisory node kinds stay authoring-only.
    const withTool: AgentGraph = {
      ...base,
      nodes: [...base.nodes, { id: "t", kind: "tool", label: "工具", scope: "root", task: {} }],
    };
    expect(agentGraphCapabilities(withTool)).toEqual([
      { type: "UNSUPPORTED_NODE_KIND", node: "t", detail: 'node kind "tool" has no runtime semantics yet' },
    ]);
    // UNSUPPORTED_EDGE_KIND: named but not executable.
    const withMessageEdge: AgentGraph = {
      ...base,
      edges: [...base.edges, { id: "e2", source: "b", target: "a", kind: "message" }],
    };
    expect(agentGraphCapabilities(withMessageEdge)).toEqual([
      { type: "UNSUPPORTED_EDGE_KIND", edge: "e2", detail: 'edge kind "message" has no runtime semantics yet' },
    ]);
    // UNSUPPORTED_EDGE_ENDPOINT: data edges bind agents to agents.
    const withSubgraphEndpoint: AgentGraph = {
      ...base,
      nodes: [...base.nodes, { id: "s", kind: "subgraph", label: "S", scope: "root" }],
      edges: [...base.edges, { id: "e3", source: "s", target: "a", kind: "data" }],
    };
    expect(agentGraphCapabilities(withSubgraphEndpoint)).toEqual([
      {
        type: "UNSUPPORTED_EDGE_ENDPOINT",
        edge: "e3",
        detail: 'data edges must connect agent nodes ("s" -> "a")',
      },
    ]);
    for (const bad of [withTool, withMessageEdge, withSubgraphEndpoint]) {
      expect(() => compileAgentGraph(bad)).toThrow(/UNSUPPORTED_/);
    }
  });

  it("GRAPH-A04: cycles are IR-legal but capability-gated - no silent flatten", () => {
    const cyclic: AgentGraph = {
      version: 1,
      goal: "g",
      nodes: [agentNode("a", "A"), agentNode("b", "B")],
      edges: [
        { id: "e1", source: "a", target: "b", kind: "data" },
        { id: "e2", source: "b", target: "a", kind: "data" },
      ],
    };
    // The IR layer accepts the cycle (representation is not execution).
    expect(parseAgentGraph(JSON.parse(JSON.stringify(cyclic)))).toEqual(cyclic);
    expect(agentGraphCapabilities(cyclic)).toEqual([
      {
        type: "UNSUPPORTED_RUNTIME_CYCLE",
        node: "a",
        detail: 'data-edge cycle through "a" - the DAG runtime cannot execute cycles',
      },
    ]);
    expect(() => compileAgentGraph(cyclic)).toThrow(/UNSUPPORTED_RUNTIME_CYCLE/);
  });

  it("GRAPH-A05: lift/compile/capabilities are deterministic and layout-invariant", () => {
    const doc = parseCanvasDoc(
      docWith(
        taskNode("a", "A", 900, 900),
        { key: "s1", type: "subflow", title: "S", x: 900, y: 900, z: "root" },
        { ...taskNode("m", "M", 920, 950, "s1"), task: { dependsOn: ["a"] } },
        { ...taskNode("b", "B", 100, 100), task: { dependsOn: ["m"] } },
      ),
    );
    const lifted = liftToAgentGraph(doc);
    const compiled = compileAgentGraph(lifted);
    expect(agentGraphCapabilities(lifted)).toEqual([]);
    for (const layout of ["flow_lr", "flow_tb", "force", "compact"] as const) {
      const laid = canvasLayout(doc, layout);
      // The IR carries no coordinates: any layout lifts to the identical graph.
      expect(liftToAgentGraph(laid)).toEqual(lifted);
      expect(compileAgentGraph(liftToAgentGraph(laid))).toEqual(compiled);
    }
    // Determinism: same input twice, identical output.
    expect(liftToAgentGraph(doc)).toEqual(lifted);
    expect(compileAgentGraph(lifted)).toEqual(compiled);
    expect(agentGraphCapabilities(lifted)).toEqual([]);
  });
});
