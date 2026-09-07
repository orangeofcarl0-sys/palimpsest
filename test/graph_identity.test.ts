/**
 * PLMP-CANVAS-7 (32 号规格, G9-D D0–D5): the stable graph identity battery.
 * Node/edge identity never auto-reuses (ID-LIFE, EDGE-LIFE), identity
 * survives the IR round-trip byte-exactly including edge ids (EDGE-H,
 * ROUNDTRIP-V3), the same-patch remove+add resurrection has an explicit
 * machine verdict (IDENTITY_REUSE), kind changes mean a new definition
 * identity (verdict B), and parallel identical data edges are named at the
 * capability gate instead of collapsing silently.
 */
import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  allocateCanvasEdgeId,
  allocateCanvasNodeId,
  canvasCompile,
  canvasInsertFragment,
  canvasRoundTripDiff,
  emptyCanvasDoc,
  liftToAgentGraph,
  parseCanvasDoc,
  unloadToCanvasDoc,
  type CanvasDoc,
} from "../src/canvas/index.js";
import {
  agentGraphSemanticDigest,
  parseAgentGraph,
  type AgentGraph,
  type AgentGraphEdge,
} from "../src/graph/index.js";
import { applyGraphPatch, EMPTY_PATCH, validateGraphPatch, type GraphPatch } from "../src/graph/patch.js";
import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import type { ProjectProposal } from "../src/architecture/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const task = (key: string, title: string, dependsOn: string[] = []): Record<string, unknown> => ({
  key,
  type: "task",
  title,
  x: 0,
  y: 0,
  z: "root",
  task: { dependsOn },
});

const docOf = (...nodes: Array<Record<string, unknown>>): CanvasDoc => {
  let edgeCounter = 0;
  const edges = nodes.flatMap((node) =>
    ((node["task"] as { dependsOn?: string[] } | undefined)?.dependsOn ?? []).map((source) => {
      edgeCounter += 1;
      return { id: `e:draft:${edgeCounter}`, source, target: node["key"] as string, kind: "data" as const };
    }),
  );
  return {
    version: 3,
    goal: "g",
    identity: { namespace: "draft", nextNode: 1, nextEdge: edgeCounter + 1 },
    nodes: nodes.map((node) => {
      const { task: _payload, ...rest } = node;
      void _payload;
      return { ...rest, task: {} } as CanvasDoc["nodes"][number];
    }),
    edges,
    groups: [],
  };
};

const makeRig = () => {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(tempStatePath(), "ops.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: "identity-project",
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
  return { store, controller, cleanup: () => Promise.all([effects.close(), store.close()]) };
};

describe("node identity lifecycle (PLMP-CANVAS-7 ID-LIFE)", () => {
  it("ID-LIFE-A01: the allocator never returns a deleted key (web/manual path contract)", () => {
    const doc = docOf(task("n1", "A"), task("n2", "B"));
    const withoutN2: CanvasDoc = {
      ...doc,
      nodes: doc.nodes.filter((node) => node.key !== "n2"),
      edges: doc.edges.filter((edge) => edge.source !== "n2" && edge.target !== "n2"),
    };
    const allocated = allocateCanvasNodeId(withoutN2);
    // The doc's own family starts at n:draft:1 - the retired n2 can never
    // resurface (the pre-v3 genKey max+1 scan resurrected it).
    expect(allocated.id).not.toBe("n2");
    expect(allocated.id).toBe("n:draft:1");
    // The renderer-side genKey is retired: no max+1 scan may exist in web.
    const panels = readFileSync(join(import.meta.dirname, "..", "web", "src", "Panels.tsx"), "utf8");
    expect(panels).not.toMatch(/genKey/);
    expect(panels).not.toMatch(/\^\?n\(\\d\+\)\$/);
  });

  it("ID-LIFE-A02: kernel fragment insertion after a delete never reuses the deleted key", () => {
    const doc = docOf(task("n1", "A"), task("n2", "B"));
    const afterDelete: CanvasDoc = { ...doc, nodes: doc.nodes.filter((node) => node.key !== "n2") };
    const proposal: ProjectProposal = { goal: "frag", changeClass: "behavior_change", tasks: [{ title: "F1", dependsOn: [] }] };
    const inserted = canvasInsertFragment(afterDelete, proposal);
    const fresh = inserted.nodes.find((node) => node.title === "F1")!;
    expect(fresh.key).not.toBe("n2");
    expect(fresh.key).toBe("n:draft:1");
  });

  it("ID-LIFE-A03: copy is a new logical definition - same fragment twice, two distinct identities", () => {
    const proposal: ProjectProposal = { goal: "frag", changeClass: "behavior_change", tasks: [{ title: "F1", dependsOn: [] }] };
    const once = canvasInsertFragment(emptyCanvasDoc("g", "draft"), proposal);
    const twice = canvasInsertFragment(once, proposal);
    const [first, second] = twice.nodes.map((node) => node.key);
    expect(first).toBe("n:draft:1");
    expect(second).not.toBe(first);
    expect(second).toBe("n:draft:2");
  });

  it("ID-LIFE-A04: rename / payload edit / scope move keep the identity", () => {
    const doc = docOf(
      task("n1", "A"),
      { key: "s1", type: "subflow", title: "S", x: 0, y: 0, z: "root" },
      task("n2", "B", ["n1"]),
    );
    const graph = liftToAgentGraph(doc);
    const patched = applyGraphPatch(graph, {
      ...EMPTY_PATCH,
      updateNodes: [{ id: "n1", label: "A（改名）" }, { id: "n2", task: { role: "analyst" } }],
      moveScope: [{ id: "n2", scope: "s1" }],
    });
    expect(patched.nodes.map((node) => node.id)).toEqual(["n1", "s1", "n2"]);
    expect(patched.nodes[0]!.label).toBe("A（改名）");
    expect(patched.nodes[2]!.scope).toBe("s1");
    // And the unload keeps both ids (identity-preserving round-trip).
    expect(unloadToCanvasDoc(patched).nodes.map((node) => node.key)).toEqual(["n1", "s1", "n2"]);
  });

  it("ID-LIFE-A05: after deletes, repeated allocation never regenerates a retired id", () => {
    let doc = emptyCanvasDoc("g", "draft");
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const allocated = allocateCanvasNodeId(doc);
      doc = allocated.doc;
      ids.push(allocated.id);
    }
    // Retire everything, then allocate again - counters never rewind.
    doc = { ...doc, nodes: [], edges: [] };
    const after: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const allocated = allocateCanvasNodeId(doc);
      doc = allocated.doc;
      after.push(allocated.id);
    }
    expect(after.every((id) => !ids.includes(id))).toBe(true);
    expect(after).toEqual(["n:draft:4", "n:draft:5", "n:draft:6"]);
  });
});

describe("edge identity lifecycle (PLMP-CANVAS-7 EDGE-LIFE)", () => {
  it("EDGE-LIFE-A01: the edge allocator never returns a deleted edge id", () => {
    // The doc's own edge consumed e:draft:1; retiring it must push the
    // next allocation past it - never back onto the retired id.
    let doc = docOf(task("n1", "A"), task("n2", "B", ["n1"]));
    expect(doc.identity.nextEdge).toBe(2);
    doc = { ...doc, edges: [] };
    const allocated = allocateCanvasEdgeId(doc);
    expect(allocated.id).toBe("e:draft:2");
  });

  it("EDGE-LIFE-A02: reconnect semantics are frozen - endpoints are edge identity", () => {
    // Reconnect (retarget an edge) is delete + fresh id, never an in-place
    // retarget: the delete of e:draft:x and a re-add of the same id in one
    // patch is exactly the refused resurrection.
    const doc = docOf(task("n1", "A"), task("n2", "B", ["n1"]));
    const graph = liftToAgentGraph(doc);
    const patch: GraphPatch = {
      ...EMPTY_PATCH,
      removeEdges: ["e:draft:1"],
      addEdges: [{ id: "e:draft:1", source: "n1", target: "n2", kind: "data" }],
    };
    expect(validateGraphPatch(graph, patch).map((entry) => entry.type)).toEqual([
      "IDENTITY_REUSE",
      "DUPLICATE_EDGE_ID",
    ]);
    // The honest reconnect recipe - remove old, add with a FRESH id - works.
    const reconnect: GraphPatch = {
      ...EMPTY_PATCH,
      removeEdges: ["e:draft:1"],
      addEdges: [{ id: "e:draft:9", source: "n1", target: "n2", kind: "data" }],
    };
    const patched = applyGraphPatch(graph, reconnect);
    expect(patched.edges.map((edge) => edge.id)).toEqual(["e:draft:9"]);
  });
});

describe("GraphPatch identity verdicts (PLMP-CANVAS-7 D5)", () => {
  const graph = (): AgentGraph =>
    liftToAgentGraph(docOf(task("n17", "Research")));

  it("PATCH-IDENTITY-A: remove+add same node id is refused as IDENTITY_REUSE", () => {
    const diagnostics = validateGraphPatch(graph(), {
      ...EMPTY_PATCH,
      removeNodes: ["n17"],
      addNodes: [{ id: "n17", kind: "annotation", label: "Note", scope: "root", text: "now a note" }],
    });
    expect(diagnostics.map((entry) => entry.type)).toEqual(["IDENTITY_REUSE"]);
    expect(() => applyGraphPatch(graph(), { ...EMPTY_PATCH, removeNodes: ["n17"], addNodes: [{ id: "n17", kind: "annotation", label: "N", scope: "root", text: "x" }] })).toThrow(/IDENTITY_REUSE/);
  });

  it("PATCH-IDENTITY-B: kind change (verdict B) = remove old + add a NEW identity", () => {
    // Same-id kind morphing is dead; the recipe is a fresh definition id.
    const diagnostics = validateGraphPatch(graph(), {
      ...EMPTY_PATCH,
      removeNodes: ["n17"],
      addNodes: [{ id: "n17", kind: "annotation", label: "Note", scope: "root", text: "note" }],
    });
    expect(diagnostics.map((entry) => entry.type)).toEqual(["IDENTITY_REUSE"]);
    const ok = validateGraphPatch(graph(), {
      ...EMPTY_PATCH,
      removeNodes: ["n17"],
      addNodes: [{ id: "n18", kind: "annotation", label: "Note", scope: "root", text: "note" }],
    });
    expect(ok).toEqual([]);
    expect(applyGraphPatch(graph(), { ...EMPTY_PATCH, removeNodes: ["n17"], addNodes: [{ id: "n18", kind: "annotation", label: "Note", scope: "root", text: "note" }] }).nodes.map((node) => node.id)).toEqual(["n18"]);
  });

  it("PATCH-IDENTITY-C: remove+add same EDGE id is refused as IDENTITY_REUSE", () => {
    const diagnostics = validateGraphPatch(graph(), {
      ...EMPTY_PATCH,
      removeEdges: ["missing"],
      addEdges: [],
    });
    void diagnostics; // shape guard; the real case is EDGE-LIFE-A02
    const base = liftToAgentGraph(docOf(task("n1", "A"), task("n2", "B", ["n1"])));
    const resurrect = validateGraphPatch(base, {
      ...EMPTY_PATCH,
      removeEdges: ["e:draft:1"],
      addEdges: [{ id: "e:draft:1", source: "n1", target: "n2", kind: "data" }],
    });
    // IDENTITY_REUSE fires first; the base-edge duplicate check names it too.
    expect(resurrect.map((entry) => entry.type)).toEqual(["IDENTITY_REUSE", "DUPLICATE_EDGE_ID"]);
  });

  it("UNSUPPORTED-PARALLEL: identical parallel data edges parse but the capability gate names them", () => {
    const doc = docOf(task("n1", "A"), task("n2", "B"));
    const withParallel: CanvasDoc = {
      ...doc,
      edges: [
        { id: "e:one", source: "n1", target: "n2", kind: "data" },
        { id: "e:two", source: "n1", target: "n2", kind: "data" },
      ],
    };
    const lifted = liftToAgentGraph(parseCanvasDoc(withParallel));
    // The IR is a multigraph - structurally legal.
    expect(() => parseAgentGraph(lifted)).not.toThrow();
    // But the DAG runtime has no multiplicity semantics - named, not collapsed.
    const compiled = (() => {
      try {
        canvasCompile(parseCanvasDoc(withParallel));
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })();
    expect(compiled).toContain("UNSUPPORTED_PARALLEL_DATA_EDGE");
  });
});

describe("strict edge-identity round-trip (PLMP-CANVAS-7 EDGE-H / ROUNDTRIP-V3)", () => {
  it("EDGE-H01/ROUNDTRIP-V3-A01: Canvas v3 → IR → Canvas v3 → IR strict equality", () => {
    const graph: AgentGraph = {
      version: 1,
      goal: "g",
      nodes: [
        { id: "n17", kind: "agent", label: "A", scope: "root", task: { role: "scout" } },
        { id: "s", kind: "subgraph", label: "S", scope: "root", mode: "runtime" },
        { id: "m", kind: "agent", label: "M", scope: "s", task: { writePaths: ["out/x.md"] } },
        { id: "note", kind: "annotation", label: "注", scope: "root", text: "todo" },
      ],
      edges: [
        { id: "pe9", source: "n17", target: "m", kind: "data" },
        { id: "zz-last", source: "m", target: "n17", kind: "data" },
      ],
    };
    const once = unloadToCanvasDoc(graph);
    const relifted = liftToAgentGraph(once);
    const twice = unloadToCanvasDoc(relifted);
    const again = liftToAgentGraph(twice);
    // Strict semantic equality: node ids, edge ids, orders, payloads.
    expect(again).toEqual(graph);
    expect(twice.nodes.map((node) => node.key)).toEqual(graph.nodes.map((node) => node.id));
    expect(twice.edges).toEqual(graph.edges.map((edge: AgentGraphEdge) => ({ ...edge, kind: "data" as const })));
    // The strong invariant the B3 bridge used to approximate.
    expect(agentGraphSemanticDigest(relifted)).toBe(agentGraphSemanticDigest(graph));
    expect(canvasRoundTripDiff(graph)).toEqual([]);
  });

  it("EDGE-H02: a patch-introduced edge id survives to the canvas response graph", () => {
    const base = liftToAgentGraph(docOf(task("n1", "A"), task("n2", "B")));
    const patched = applyGraphPatch(base, {
      ...EMPTY_PATCH,
      addEdges: [{ id: "pe9", source: "n1", target: "n2", kind: "data" }],
    });
    const doc = unloadToCanvasDoc(patched);
    expect(doc.edges.map((edge) => edge.id)).toEqual(["pe9"]);
    expect(liftToAgentGraph(doc)).toEqual(patched);
    expect(agentGraphSemanticDigest(liftToAgentGraph(doc))).toBe(agentGraphSemanticDigest(patched));
  });
});

describe("EDGE-H03: removeEdges/updateEdges through the canvas endpoint on stable ids", async () => {
  it("edge operations hit exactly the stable id end-to-end", async () => {
    const rig = makeRig();
    const handle: ServeHandle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
      const doc = docOf(task("n1", "A"), task("n2", "B", ["n1"]));
      const call = async (body: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
        const response = await fetch(`${handle.url}/api/canvas/patch`, {
          method: "POST",
          headers: { authorization: `Bearer ${handle.token}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: response.status, json: (await response.json()) as Record<string, unknown> };
      };
      // updateEdges on the stable id: kind swap is IR-legal, canvas refuses.
      const kindSwap = await call({
        doc,
        patch: { ...EMPTY_PATCH, updateEdges: [{ id: "e:draft:1", kind: "control" }] },
      });
      expect(kindSwap.json.applied).toBe(false);
      expect((kindSwap.json.diagnostics as Array<{ type: string }>)[0]!.type).toBe("UNREPRESENTABLE_IN_CANVAS");
      // removeEdges on the stable id applies and the edge is gone - the
      // anchor equals digest(patched) (the B3 relift bridge is retired).
      const removed = await call({
        doc,
        patch: { ...EMPTY_PATCH, removeEdges: ["e:draft:1"] },
      });
      expect(removed.json.applied).toBe(true);
      expect((removed.json.doc as { edges: Array<{ id: string }> }).edges).toEqual([]);
      const returnedGraph = liftToAgentGraph(
        unloadToCanvasDoc(liftToAgentGraph(docOf(task("n1", "A"), task("n2", "B")))),
      );
      void returnedGraph;
      const patched = applyGraphPatch(liftToAgentGraph(doc), { ...EMPTY_PATCH, removeEdges: ["e:draft:1"] });
      expect(removed.json.graphDigest).toBe(agentGraphSemanticDigest(patched));
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });
});
