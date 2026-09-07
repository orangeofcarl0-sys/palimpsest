/**
 * PLMP-GRAPH-5 (31 号): GraphPatch hardening. The patch is a fail-closed
 * input protocol (strict parse, no `as` casts) and the validator checks the
 * RESULT graph - the hard invariant is validate=PASS ⇒ apply cannot fail
 * structurally (PATCH-H04). The apply-to-canvas gate refuses lossy
 * conversion (PATCH-H06) instead of degrading unsupported IR silently.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyGraphPatch,
  agentGraphSemanticDigest,
  EMPTY_PATCH,
  parseAgentGraph,
  parseGraphPatch,
  validateGraphPatch,
  type AgentGraph,
  type GraphPatch,
} from "../src/graph/index.js";
import {
  canvasRoundTripDiff,
  liftToAgentGraph,
  parseCanvasDoc,
  unloadToCanvasDoc,
} from "../src/canvas/index.js";
import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { docV3From, FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function baseGraph(): AgentGraph {
  return {
    version: 1,
    goal: "g",
    nodes: [
      { id: "a", kind: "agent", label: "调研", scope: "root", task: {} },
      { id: "b", kind: "agent", label: "综合", scope: "root", task: {} },
      { id: "s", kind: "subgraph", label: "小组", scope: "root" },
      { id: "m", kind: "agent", label: "成员", scope: "s", task: {} },
    ],
    edges: [{ id: "e1", source: "a", target: "b", kind: "data" }],
  };
}

const agentNode = (id: string, label: string, scope = "root") => ({
  id,
  kind: "agent" as const,
  label,
  scope,
  task: {},
});

describe("graph patch hardening (PLMP-GRAPH-5)", () => {
  it("PATCH-H01: duplicate addNodes ids inside one patch fail in validation, not at apply", () => {
    const base = baseGraph();
    const patch: GraphPatch = {
      ...EMPTY_PATCH,
      addNodes: [agentNode("n1", "X"), agentNode("n1", "Y")],
    };
    expect(validateGraphPatch(base, patch).map((diagnostic) => diagnostic.type)).toEqual([
      "DUPLICATE_NODE_ID",
    ]);
    // Same verdict through the strict parser.
    const parsed = parseGraphPatch({
      ...EMPTY_PATCH,
      addNodes: [agentNode("n1", "X"), agentNode("n1", "Y")],
    });
    expect(validateGraphPatch(base, parsed).map((diagnostic) => diagnostic.type)).toEqual([
      "DUPLICATE_NODE_ID",
    ]);
  });

  it("PATCH-H02: remove + update/move of the same entity is refused, never silently dropped", () => {
    const base = baseGraph();
    const removeAndUpdate: GraphPatch = {
      ...EMPTY_PATCH,
      removeNodes: ["a"],
      updateNodes: [{ id: "a", label: "改名" }],
    };
    // a is removed AND updated (conflict), and e1 still references it.
    expect(validateGraphPatch(base, removeAndUpdate).map((d) => d.type)).toEqual([
      "CONFLICTING_NODE_OPERATION",
      "NODE_HAS_EDGES",
    ]);
    const removeAndMove: GraphPatch = {
      ...EMPTY_PATCH,
      removeNodes: ["a"],
      moveScope: [{ id: "a", scope: "s" }],
    };
    // a is removed AND moved (conflict), and e1 still references it.
    expect(validateGraphPatch(base, removeAndMove).map((d) => d.type)).toEqual([
      "CONFLICTING_NODE_OPERATION",
      "NODE_HAS_EDGES",
    ]);
    const removeEdgeAndUpdate: GraphPatch = {
      ...EMPTY_PATCH,
      removeEdges: ["e1"],
      updateEdges: [{ id: "e1", kind: "control" }],
    };
    expect(validateGraphPatch(base, removeEdgeAndUpdate).map((d) => d.type)).toEqual([
      "CONFLICTING_EDGE_OPERATION",
    ]);
  });

  it("PATCH-H03: moving into a removed subgraph fails in validation", () => {
    const base = baseGraph();
    const patch: GraphPatch = {
      ...EMPTY_PATCH,
      removeNodes: ["s"],
      moveScope: [{ id: "b", scope: "s" }],
    };
    // b's move target is removed (and member m is orphaned by the removal).
    expect(validateGraphPatch(base, patch).map((d) => d.type)).toEqual([
      "MOVE_TARGET_REMOVED",
      "SCOPE_OWNER_REMOVED",
    ]);
    // And removing a subgraph without relocating its member is refused too.
    const orphan: GraphPatch = { ...EMPTY_PATCH, removeNodes: ["s"] };
    expect(validateGraphPatch(base, orphan).map((d) => d.type)).toEqual(["SCOPE_OWNER_REMOVED"]);
  });

  it("PATCH-H03b: adding an edge to a removed node, and scoping to a non-subgraph, fail in validation", () => {
    const base = baseGraph();
    const edgeToRemoved: GraphPatch = {
      ...EMPTY_PATCH,
      removeNodes: ["a"],
      addEdges: [{ id: "pe1", source: "b", target: "a", kind: "data" }],
    };
    // e1 survives and references the removed a; pe1 targets it too.
    expect(validateGraphPatch(base, edgeToRemoved)).toEqual([
      {
        type: "NODE_HAS_EDGES",
        id: "a",
        detail: 'node "a" is removed but edge "e1" still references it',
      },
      {
        type: "EDGE_ENDPOINT_UNKNOWN",
        id: "pe1",
        detail: 'edge "pe1" references node "a", which this patch removes',
      },
    ]);
    const scopedToAgent: GraphPatch = {
      ...EMPTY_PATCH,
      addNodes: [{ ...agentNode("n1", "X"), scope: "b" }],
    };
    expect(validateGraphPatch(base, scopedToAgent).map((d) => d.type)).toEqual([
      "SCOPE_OWNER_INVALID",
    ]);
  });

  it("PATCH-H03c: update payload/kind legality - task only on agents, text only on annotations", () => {
    const base = baseGraph();
    const taskOnSubgraph: GraphPatch = { ...EMPTY_PATCH, updateNodes: [{ id: "s", task: {} }] };
    expect(validateGraphPatch(base, taskOnSubgraph).map((d) => d.type)).toEqual([
      "ILLEGAL_NODE_UPDATE",
    ]);
    const textOnAgent: GraphPatch = { ...EMPTY_PATCH, updateNodes: [{ id: "a", text: "注" }] };
    expect(validateGraphPatch(base, textOnAgent).map((d) => d.type)).toEqual([
      "ILLEGAL_NODE_UPDATE",
    ]);
    const annotationText: GraphPatch = {
      ...EMPTY_PATCH,
      addNodes: [{ id: "t1", kind: "annotation", label: "注", scope: "root", text: "备注" }],
      updateNodes: [{ id: "t1", text: "备注二" }],
    };
    // updates target base nodes only - an update on an added node is UNKNOWN.
    expect(validateGraphPatch(base, annotationText).map((d) => d.type)).toEqual(["UNKNOWN_NODE"]);
  });

  it("PATCH-H05: parseGraphPatch is a strict grammar - unknown fields, shapes, duplicates all fail loudly", () => {
    expect(() => parseGraphPatch({ ...EMPTY_PATCH, addNdoes: [] })).toThrow(/unknown patch field/);
    expect(() => parseGraphPatch({ ...EMPTY_PATCH, addNodes: undefined })).toThrow(/must be an array/);
    expect(() => parseGraphPatch({ ...EMPTY_PATCH, baseRevision: -1 })).toThrow(/baseRevision/);
    expect(() => parseGraphPatch({ ...EMPTY_PATCH, removeNodes: ["a", "a"] })).toThrow(
      /duplicate removeNodes entry/,
    );
    expect(() =>
      parseGraphPatch({ ...EMPTY_PATCH, updateNodes: [{ id: "a", label: "x" }, { id: "a", label: "y" }] }),
    ).toThrow(/duplicate updateNodes target/);
    expect(() => parseGraphPatch({ ...EMPTY_PATCH, updateNodes: [{ id: "a", kind: "agent" }] })).toThrow(
      /unknown updateNodes field/,
    );
    expect(() =>
      parseGraphPatch({ ...EMPTY_PATCH, updateEdges: [{ id: "e1", kind: "teleport" }] }),
    ).toThrow(/unknown updateEdges kind/);
    expect(() => parseGraphPatch({ ...EMPTY_PATCH, moveScope: [{ id: "a" }] })).toThrow(
      /moveScope.scope/,
    );
    expect(() =>
      parseGraphPatch({ ...EMPTY_PATCH, addNodes: [{ id: "n1", kind: "agent", label: "X", scope: "root", task: {}, extra: 1 }] }),
    ).toThrow(/unknown node field/);
    // A well-formed patch parses into the same shape EMPTY_PATCH composes.
    const parsed = parseGraphPatch({
      baseRevision: 3,
      addNodes: [agentNode("n1", "X")],
      removeNodes: [],
      updateNodes: [],
      addEdges: [],
      removeEdges: [],
      updateEdges: [],
      moveScope: [],
    });
    expect(parsed).toEqual({ ...EMPTY_PATCH, baseRevision: 3, addNodes: [agentNode("n1", "X")] });
    expect(parseGraphPatch(EMPTY_PATCH)).toEqual(EMPTY_PATCH);
  });

  it("PATCH-H04: validate=PASS implies apply structural success (same result construction)", () => {
    const base = baseGraph();
    const validPatches: GraphPatch[] = [
      EMPTY_PATCH,
      { ...EMPTY_PATCH, addNodes: [agentNode("n1", "新")] },
      {
        ...EMPTY_PATCH,
        removeNodes: ["b"],
        removeEdges: ["e1"],
      },
      {
        ...EMPTY_PATCH,
        updateNodes: [{ id: "a", label: "改名" }, { id: "m", task: { role: "tester" } }],
        updateEdges: [{ id: "e1", kind: "control" }],
        moveScope: [{ id: "b", scope: "s" }, { id: "n1", scope: "root" }],
        addNodes: [agentNode("n1", "新成员", "s")],
      },
      {
        ...EMPTY_PATCH,
        removeNodes: ["s", "m"],
        addNodes: [{ id: "s2", kind: "subgraph", label: "小组二", scope: "root" }],
        moveScope: [{ id: "b", scope: "s2" }],
      },
      // Runtime cycle: canvas-expressible, compile-refused - representable.
      {
        ...EMPTY_PATCH,
        addEdges: [
          { id: "pe1", source: "b", target: "a", kind: "data" },
        ],
      },
    ];
    for (const patch of validPatches) {
      expect(validateGraphPatch(base, patch)).toEqual([]);
      const patched = applyGraphPatch(base, patch); // must not throw
      expect(parseAgentGraph(patched)).toEqual(patched);
    }
    // Belt for the invariant direction: every malformed battery member is
    // CAUGHT by validate - nothing may slip to an apply-time structural throw.
    const invalidPatches: GraphPatch[] = [
      { ...EMPTY_PATCH, addNodes: [agentNode("n1", "X"), agentNode("n1", "Y")] },
      { ...EMPTY_PATCH, removeNodes: ["a"], updateNodes: [{ id: "a", label: "x" }] },
      { ...EMPTY_PATCH, removeNodes: ["a"], moveScope: [{ id: "a", scope: "s" }] },
      { ...EMPTY_PATCH, removeEdges: ["e1"], updateEdges: [{ id: "e1", kind: "control" }] },
      { ...EMPTY_PATCH, removeNodes: ["s"], moveScope: [{ id: "b", scope: "s" }] },
      { ...EMPTY_PATCH, removeNodes: ["s"] },
      { ...EMPTY_PATCH, removeNodes: ["a"], addEdges: [{ id: "pe1", source: "b", target: "a", kind: "data" }] },
      { ...EMPTY_PATCH, addNodes: [{ ...agentNode("n1", "X"), scope: "b" }] },
      { ...EMPTY_PATCH, updateNodes: [{ id: "s", task: {} }] },
      { ...EMPTY_PATCH, updateNodes: [{ id: "a", text: "注" }] },
      { ...EMPTY_PATCH, removeNodes: ["ghost"] },
    ];
    for (const patch of invalidPatches) {
      expect(validateGraphPatch(base, patch).length).toBeGreaterThan(0);
    }
  });

  it("ROUNDTRIP-A01: the lossy gate - unsupported kinds are named, clean graphs pass silently", () => {
    const clean = parseAgentGraph({
      version: 1,
      goal: "g",
      nodes: [agentNode("a", "A"), { id: "s", kind: "subgraph", label: "S", scope: "root" }],
      edges: [],
    });
    expect(canvasRoundTripDiff(clean)).toEqual([]);
    // A data-edge cycle is canvas-expressible (compile refuses it later).
    const cyclic = parseAgentGraph({
      version: 1,
      goal: "g",
      nodes: [agentNode("a", "A"), agentNode("b", "B")],
      edges: [
        { id: "e1", source: "a", target: "b", kind: "data" },
        { id: "e2", source: "b", target: "a", kind: "data" },
      ],
    });
    expect(canvasRoundTripDiff(cyclic)).toEqual([]);
    // Tool node + message edge: exactly the losses the audit documented.
    const lossy = parseAgentGraph({
      version: 1,
      goal: "g",
      nodes: [agentNode("a", "A"), { id: "t", kind: "tool", label: "工具", scope: "root" }],
      edges: [{ id: "m1", source: "a", target: "t", kind: "message" }],
    });
    const losses = canvasRoundTripDiff(lossy);
    expect(losses.some((loss) => loss.includes('"t"') && loss.includes("tool"))).toBe(true);
    expect(losses.some((loss) => loss.includes("message:a->t"))).toBe(true);
  });
});

describe("graph patch endpoint gate (PLMP-GRAPH-5 PATCH-H06)", () => {
  it("PATCH-H06: unsupported IR is refused at the apply gate - applied:false, no degraded doc", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    const effects = createPalimpsestEffects({
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-patchhard-")), "ops.sqlite"),
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
    controller.start({
      projectId: "scheduler-project",
      goal: "g",
      tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"])],
    });
    const handle = await serveOrchestration(controller, { port: 0 });
    const api = async (
      path: string,
      body: unknown,
    ): Promise<{ status: number; json: Record<string, unknown> }> => {
      const response = await fetch(`${handle.url}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${handle.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, json: (await response.json()) as Record<string, unknown> };
    };
    try {
      const doc = docV3From([
        { key: "a", type: "task", title: "调研", x: 0, y: 0, z: "root", task: { dependsOn: [] } },
        { key: "b", type: "task", title: "综合", x: 10, y: 0, z: "root", task: { dependsOn: ["a"] } },
      ]);
      // A patch that introduces a Tool node and a message edge: the strict
      // parser accepts them (IR-legal), validation passes, and the canvas
      // gate refuses the lossy unload instead of degrading.
      const result = await api("/api/canvas/patch", {
        doc,
        patch: {
          addNodes: [{ id: "t1", kind: "tool", label: "工具", scope: "root" }],
          removeNodes: [],
          updateNodes: [],
          addEdges: [{ id: "m1", source: "a", target: "t1", kind: "message" }],
          removeEdges: [],
          updateEdges: [],
          moveScope: [],
        },
      });
      expect(result.status).toBe(200);
      expect(result.json.applied).toBe(false);
      const diagnostics = result.json.diagnostics as Array<{ type: string }>;
      expect(diagnostics[0]!.type).toBe("UNREPRESENTABLE_IN_CANVAS");
      expect(result.json.doc).toBeUndefined();
      // A typed edge-kind update alone is also unrepresentable in canvas.
      const kindSwap = await api("/api/canvas/patch", {
        doc,
        patch: {
          addNodes: [],
          removeNodes: [],
          updateNodes: [],
          addEdges: [],
          removeEdges: [],
          updateEdges: [{ id: "e:test:1", kind: "control" }],
          moveScope: [],
        },
      });
      expect(kindSwap.json.applied).toBe(false);
      expect(
        (kindSwap.json.diagnostics as Array<{ type: string }>)[0]!.type,
      ).toBe("UNREPRESENTABLE_IN_CANVAS");
    } finally {
      await handle.close();
      await effects.close();
      store.close();
    }
  });
});
/**
 * PLMP-GRAPH-5 (31 号): GraphPatch hardening. The patch is a fail-closed
 * input protocol (strict parse, no `as` casts) and the validator checks the
 * RESULT graph - the hard invariant is validate=PASS ⇒ apply cannot fail
 * structurally (PATCH-H04). The apply-to-canvas gate refuses lossy
 * conversion (PATCH-H06) instead of degrading unsupported IR silently.
 */
describe("draft freshness and patch grammar closure (PLMP-GRAPH-5 §B2)", () => {
  it("PATCH-FRESH-A01: a patch anchored to an older draft is refused as STALE_GRAPH_BASE", () => {
    const before = parseAgentGraph(baseGraph());
    const digest = agentGraphSemanticDigest(before);
    const patch: GraphPatch = {
      baseGraphDigest: digest,
      ...EMPTY_PATCH,
      updateNodes: [{ id: "a", label: "改名" }],
    };
    expect(validateGraphPatch(before, patch)).toEqual([]);
    // The user edits the draft (project revision unchanged) - the anchor breaks.
    const after = applyGraphPatch(before, patch);
    expect(agentGraphSemanticDigest(after)).not.toBe(digest);
    // Re-running the same patch against the edited draft is doubly dishonest:
    // stale anchor AND a mutation that is now a no-op.
    expect(validateGraphPatch(after, patch).map((d) => d.type)).toEqual([
      "STALE_GRAPH_BASE",
      "NO_OP_OPERATION",
    ]);
    // Omitting the anchor does not save a stale edit: the label is already
    // 改名, so the no-op verdict refuses it independently.
    expect(
      validateGraphPatch(after, { ...EMPTY_PATCH, updateNodes: [{ id: "a", label: "改名" }] }).map((d) => d.type),
    ).toEqual(["NO_OP_OPERATION"]);
  });

  it("PATCH-FRESH-A02: pure layout movement never changes the semantic digest", () => {
    const docAt = (x: number, y: number) =>
      docV3From([
        { key: "a", type: "task", title: "调研", x, y, z: "root", task: { dependsOn: [] } },
        { key: "b", type: "task", title: "综合", x: x + 10, y, z: "root", task: { dependsOn: ["a"] } },
      ]);
    const graphA = liftToAgentGraph(docAt(0, 0));
    const graphB = liftToAgentGraph(docAt(500, 300));
    expect(agentGraphSemanticDigest(graphA)).toBe(agentGraphSemanticDigest(graphB));
    // A patch anchored to the pre-move digest stays fresh after the move.
    const patch: GraphPatch = {
      baseGraphDigest: agentGraphSemanticDigest(graphA),
      ...EMPTY_PATCH,
      updateNodes: [{ id: "b", label: "综合（改）" }],
    };
    expect(validateGraphPatch(graphB, patch)).toEqual([]);
  });

  it("PATCH-FRESH-A03: project-stale and graph-stale are independently diagnosed", () => {
    const base = parseAgentGraph(baseGraph());
    const patch: GraphPatch = {
      baseRevision: 99,
      baseGraphDigest: "0".repeat(64),
      ...EMPTY_PATCH,
      updateNodes: [{ id: "a", label: "改名" }],
    };
    const types = validateGraphPatch(base, patch, { liveRevision: 5 }).map((d) => d.type);
    expect(types).toContain("STALE_BASE");
    expect(types).toContain("STALE_GRAPH_BASE");
  });

  it("PATCH-GRAMMAR-A01: annotation text '' has the same legality under add and update", () => {
    // add with empty text is IR-legal (24 号 grammar).
    const withEmpty = parseAgentGraph({
      version: 1,
      goal: "g",
      nodes: [{ id: "t", kind: "annotation", label: "注", scope: "root", text: "" }],
      edges: [],
    });
    expect(withEmpty.nodes[0]!.text).toBe("");
    // update with empty text parses under the same grammar (was non-blank
    // before the §B2-E grammar unification).
    const parsed = parseGraphPatch({
      addNodes: [],
      removeNodes: [],
      updateNodes: [{ id: "t", text: "" }],
      addEdges: [],
      removeEdges: [],
      updateEdges: [],
      moveScope: [],
    });
    expect(parsed.updateNodes[0]!.text).toBe("");
    // On a node whose text is already "" the update is a semantic no-op.
    expect(validateGraphPatch(withEmpty, parsed).map((d) => d.type)).toEqual(["NO_OP_OPERATION"]);
  });

  it("PATCH-GRAMMAR-A02: updateNodes with nothing to mutate is refused at parse (EMPTY_UPDATE)", () => {
    expect(() =>
      parseGraphPatch({
        addNodes: [],
        removeNodes: [],
        updateNodes: [{ id: "a" }],
        addEdges: [],
        removeEdges: [],
        updateEdges: [],
        moveScope: [],
      }),
    ).toThrow(/EMPTY_UPDATE/);
  });

  it("PATCH-GRAMMAR-A03: semantic no-ops are refused as NO_OP_OPERATION (verdict A)", () => {
    const base = parseAgentGraph(baseGraph());
    const sameLabel: GraphPatch = { ...EMPTY_PATCH, updateNodes: [{ id: "a", label: "调研" }] };
    expect(validateGraphPatch(base, sameLabel).map((d) => d.type)).toEqual(["NO_OP_OPERATION"]);
    const sameKind: GraphPatch = { ...EMPTY_PATCH, updateEdges: [{ id: "e1", kind: "data" }] };
    expect(validateGraphPatch(base, sameKind).map((d) => d.type)).toEqual(["NO_OP_OPERATION"]);
    const sameScope: GraphPatch = { ...EMPTY_PATCH, moveScope: [{ id: "a", scope: "root" }] };
    expect(validateGraphPatch(base, sameScope).map((d) => d.type)).toEqual(["NO_OP_OPERATION"]);
    const sameTask: GraphPatch = { ...EMPTY_PATCH, updateNodes: [{ id: "a", task: {} }] };
    expect(validateGraphPatch(base, sameTask).map((d) => d.type)).toEqual(["NO_OP_OPERATION"]);
    expect(() => applyGraphPatch(base, sameLabel)).toThrow(/NO_OP_OPERATION/);
  });

  it("PATCH-GRAMMAR-A04: every accepted non-empty patch changes the semantic digest", () => {
    const base = parseAgentGraph(baseGraph());
    const baseDigest = agentGraphSemanticDigest(base);
    const accepted: GraphPatch[] = [
      { ...EMPTY_PATCH, addNodes: [agentNode("n1", "新")] },
      { ...EMPTY_PATCH, removeNodes: ["b"], removeEdges: ["e1"] },
      { ...EMPTY_PATCH, updateNodes: [{ id: "a", label: "改名" }] },
      { ...EMPTY_PATCH, updateEdges: [{ id: "e1", kind: "control" }] },
      { ...EMPTY_PATCH, moveScope: [{ id: "b", scope: "s" }] },
    ];
    for (const patch of accepted) {
      expect(validateGraphPatch(base, patch)).toEqual([]);
      const patched = applyGraphPatch(base, patch);
      expect(agentGraphSemanticDigest(patched)).not.toBe(baseDigest);
    }
    // The EMPTY_PATCH is the only zero-op patch and applies trivially.
    expect(applyGraphPatch(base, EMPTY_PATCH)).toEqual(base);
  });
});

describe("response integrity and grammar symmetry (PLMP-GRAPH-5 §B3-A/E)", () => {
  it("PATCH-FRESH-A04: response.graphDigest equals digest(lift(response.doc)) through the real endpoint", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    const effects = createPalimpsestEffects({
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-fresh-")), "ops.sqlite"),
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
      clock: () => "2026-09-08T00:00:00Z",
    });
    controller.start({
      projectId: "scheduler-project",
      goal: "g",
      tasks: [taskSpec("task-1")],
    });
    const handle = await serveOrchestration(controller, { port: 0 });
    const post = async (body: unknown): Promise<any> => {
      const response = await fetch(`${handle.url}/api/canvas/patch`, {
        method: "POST",
        headers: { authorization: `Bearer ${handle.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, json: (await response.json()) as any };
    };
    try {
      const doc = docV3From([
        { key: "a", type: "task", title: "A", x: 0, y: 0, z: "root", task: { dependsOn: [] } },
        { key: "b", type: "task", title: "B", x: 10, y: 0, z: "root", task: { dependsOn: ["a"] } },
      ]);
      // Since CanvasDoc v3 (32 号) edge ids survive the round-trip, the
      // strong invariant digest(patched) === digest(lift(returnedDoc)) holds
      // by construction - the v2 bridge (relift digest) is retired, this
      // test stays as the belt.
      const result = await post({
        doc,
        patch: {
          addNodes: [{ id: "c", kind: "agent", label: "C", scope: "root", task: {} }],
          removeNodes: [],
          updateNodes: [],
          addEdges: [{ id: "pe1", source: "b", target: "c", kind: "data" }],
          removeEdges: [],
          updateEdges: [],
          moveScope: [],
        },
      });
      expect(result.status).toBe(200);
      expect(result.json.applied).toBe(true);
      const returnedGraph = liftToAgentGraph(parseCanvasDoc(result.json.doc));
      expect(result.json.graphDigest).toBe(agentGraphSemanticDigest(returnedGraph));
    } finally {
      await handle.close();
      await effects.close();
      store.close();
    }
  });

  it("PATCH-FRESH-A05: chaining a second patch with the returned anchor does not stale", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    const effects = createPalimpsestEffects({
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-fresh-")), "ops.sqlite"),
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
      clock: () => "2026-09-08T00:00:00Z",
    });
    controller.start({
      projectId: "scheduler-project",
      goal: "g",
      tasks: [taskSpec("task-1")],
    });
    const handle = await serveOrchestration(controller, { port: 0 });
    const post = async (body: unknown): Promise<any> => {
      const response = await fetch(`${handle.url}/api/canvas/patch`, {
        method: "POST",
        headers: { authorization: `Bearer ${handle.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, json: (await response.json()) as any };
    };
    try {
      let doc = docV3From([
        { key: "a", type: "task", title: "A", x: 0, y: 0, z: "root", task: { dependsOn: [] } },
      ]);
      // patch 1: add B with a fresh pe edge id, chain the returned anchor.
      const first = await post({
        doc,
        patch: {
          addNodes: [{ id: "b", kind: "agent", label: "B", scope: "root", task: {} }],
          removeNodes: [],
          updateNodes: [],
          addEdges: [{ id: "pe1", source: "a", target: "b", kind: "data" }],
          removeEdges: [],
          updateEdges: [],
          moveScope: [],
        },
      });
      expect(first.status).toBe(200);
      expect(first.json.applied).toBe(true);
      doc = parseCanvasDoc(first.json.doc);
      // patch 2 anchored to response.graphDigest acts on response.doc: fresh.
      const second = await post({
        doc,
        patch: {
          baseGraphDigest: first.graphDigest,
          addNodes: [],
          removeNodes: [],
          updateNodes: [{ id: "b", label: "B（改）" }],
          addEdges: [],
          removeEdges: [],
          updateEdges: [],
          moveScope: [],
        },
      });
      expect(second.status).toBe(200);
      expect(second.json.applied).toBe(true);
      expect(second.json.diagnostics).toEqual([]);
      // A wrong anchor on the same doc still refuses, carrying the current
      // digest for rebasing.
      const stale = await post({
        doc,
        patch: {
          baseGraphDigest: "0".repeat(64),
          addNodes: [],
          removeNodes: [],
          updateNodes: [{ id: "b", label: "再改" }],
          addEdges: [],
          removeEdges: [],
          updateEdges: [],
          moveScope: [],
        },
      });
      expect(stale.json.applied).toBe(false);
      expect((stale.json.diagnostics as Array<{ type: string }>)[0]!.type).toBe("STALE_GRAPH_BASE");
      expect(stale.json.graphDigest).toBe(first.json.graphDigest);
    } finally {
      await handle.close();
      await effects.close();
      store.close();
    }
  });

  it("PATCH-GRAMMAR-A05: updateEdges {id} without kind is EMPTY_UPDATE at parse", () => {
    expect(() =>
      parseGraphPatch({
        addNodes: [],
        removeNodes: [],
        updateNodes: [],
        addEdges: [],
        removeEdges: [],
        updateEdges: [{ id: "e1" }],
        moveScope: [],
      }),
    ).toThrow(/EMPTY_UPDATE/);
    // Programmatic patches without kind are refused at validation instead.
    const base = parseAgentGraph(baseGraph());
    expect(
      validateGraphPatch(base, { ...EMPTY_PATCH, updateEdges: [{ id: "e1" }] }).map((d) => d.type),
    ).toEqual(["NO_OP_OPERATION"]);
  });
});
