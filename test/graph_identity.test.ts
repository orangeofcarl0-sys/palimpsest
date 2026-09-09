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
  canvasDiff,
  canvasInsertFragment,
  canvasRoundTripDiff,
  emptyCanvasDoc,
  liftToAgentGraph,
  parseCanvasDoc,
  unloadToCanvasDoc,
  type CanvasDoc,
  type LiveTaskView,
} from "../src/canvas/index.js";
import {
  agentGraphSemanticDigest,
  parseAgentGraph,
  type AgentGraph,
  type AgentGraphEdge,
} from "../src/graph/index.js";
import { applyGraphPatch, EMPTY_PATCH, validateGraphPatch, type GraphPatch } from "../src/graph/patch.js";
import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { ProjectController, parseAttemptAttribution } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import type { ProjectProposal, TaskProposal } from "../src/architecture/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";
import { parseGateDefinition } from "../src/domain/index.js";

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

// ---------------------------------------------------------------------------
// PLMP-CANVAS-7 (32 号, G9-D D7): identity-aware draft/live diff.
// DIFF-INV-1: current work-definition identity dominates title.
// UAS-D-INV-3: this is a Work-definition diff, not a future SystemGraph diff.
// ---------------------------------------------------------------------------

describe("identity-aware draft/live diff (PLMP-CANVAS-7 D7)", () => {
  const draft = (title: string, definitionId: string, extra: Partial<TaskProposal> = {}): TaskProposal => ({
    title,
    dependsOn: [],
    definitionId,
    ...extra,
  });
  const live = (objective: string, definitionId?: string, extra: Partial<LiveTaskView> = {}): LiveTaskView => ({
    objective,
    dependsOn: [],
    writePaths: [],
    requiredArtifacts: [],
    ...(definitionId === undefined ? {} : { definitionId }),
    ...extra,
  });

  it("DIFF-ID-A01: same definition id + renamed title is changed(title), never remove+add", () => {
    const result = canvasDiff([draft("Investigation", "n17")], [live("Research", "n17")]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([{ title: "Investigation", fields: ["title"] }]);
  });

  it("DIFF-ID-A02: same title + different definition id is remove + add, never unchanged", () => {
    const result = canvasDiff([draft("Research", "n42")], [live("Research", "n17")]);
    expect(result.added).toEqual([{ title: "Research" }]);
    expect(result.removed).toEqual([{ title: "Research" }]);
    expect(result.changed).toEqual([]);
  });

  it("DIFF-ID-A03: legacy live without ids uses the documented title fallback only", () => {
    // Spec-first live project (no definition_id): title matching is the only
    // available identity - explicit fallback, no silent mixing.
    const result = canvasDiff([draft("Research", "n17")], [live("Research")]);
    expect(result).toEqual({ added: [], removed: [], changed: [] });
    const drifted = canvasDiff([draft("Research", "n17", { role: "scout" })], [live("Research")]);
    expect(drifted.changed).toEqual([{ title: "Research", fields: ["role"] }]);
    // Hand-written draft without ids against an identity-carrying live side:
    // the pair falls back to title matching too (identity unavailable on the
    // draft side), while identity tasks still match by id.
    const mixed = canvasDiff([draft("调研", "n1"), { title: "手写", dependsOn: [] }], [
      live("调研", "n1"),
      live("手写", "n2"),
    ]);
    expect(mixed.added).toEqual([]);
    expect(mixed.removed).toEqual([]);
  });

  it("DIFF-ID-A04: scope move with the same identity is changed(scope), not remove/add", () => {
    const result = canvasDiff(
      [draft("M", "m", { scopeId: "s1" })],
      [live("M", "m")],
    );
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([{ title: "M", fields: ["scope"] }]);
    // Absent on both sides means equal.
    const same = canvasDiff([draft("M", "m")], [live("M", "m")]);
    expect(same.changed).toEqual([]);
  });

  it("DIFF-ID-A05: pure layout move yields no semantic diff (ids and edges stable)", () => {
    const doc = parseCanvasDoc(docOf({ ...task("n1", "A") }, { ...task("n2", "B", ["n1"]) }));
    const baseline = canvasCompile(doc);
    const moved: CanvasDoc = {
      ...doc,
      nodes: doc.nodes.map((node, index) => ({ ...node, x: 40 + 300 * index, y: 90 + 55 * index })),
    };
    const after = canvasCompile(moved);
    // Positions are visual-only: the compiled Work definitions (ids included)
    // are equal, and the diff of the moved draft against the baseline-as-live
    // is empty.
    expect(after).toEqual(baseline);
    const liveView: LiveTaskView[] = baseline.tasks.map((t) => ({
      objective: t.title,
      dependsOn: t.dependsOn,
      writePaths: t.writePaths ?? [],
      requiredArtifacts: t.requiredArtifacts ?? [],
      ...(t.definitionId === undefined ? {} : { definitionId: t.definitionId }),
      ...(t.scopeId === undefined ? {} : { scopeId: t.scopeId }),
    }));
    expect(canvasDiff(after.tasks, liveView)).toEqual({ added: [], removed: [], changed: [] });
  });

  it("DIFF-ID-A06: declared skill hints are a diffable Work field (gate stays advisory)", () => {
    // suggested_skills rides TaskSpec (E2) - set comparison, order-insensitive.
    const sameSet = canvasDiff(
      [draft("R", "n17", { suggestedSkills: ["web", "sql"] })],
      [live("R", "n17", { suggestedSkills: ["sql", "web"] })],
    );
    expect(sameSet.changed).toEqual([]);
    const drifted = canvasDiff(
      [draft("R", "n17", { suggestedSkills: ["web", "sql"] })],
      [live("R", "n17", { suggestedSkills: ["web"] })],
    );
    expect(drifted.changed).toEqual([{ title: "R", fields: ["suggestedSkills"] }]);
    // gateId is advisory (20 号: gates keep their single declareGate path and
    // never enter TaskSpec) - deliberately NOT a diff field.
    const gateOnly = canvasDiff(
      [draft("R", "n17", { gateId: "g1" })],
      [live("R", "n17")],
    );
    expect(gateOnly.changed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PLMP-CANVAS-7 (32 号, G9-D D8): the compile-independent Work-authoring
// anchor. ANCHOR-INV-1 + UAS-D-INV-2: authoring freshness is independent of
// runtime capability; this anchors the current Work graph, not a future
// architecture anchor.
// ---------------------------------------------------------------------------

describe("compile-independent anchor endpoint (PLMP-CANVAS-7 D8)", () => {
  it("ANCHOR-A01..A05: parse+lift+digest+revision only - cycles anchor fine, layout-stable, read-only", async () => {
    const rig = makeRig();
    const handle: ServeHandle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
      const before = (rig.store.connection.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number }).c;
      const call = async (path: string, body: unknown, token?: string): Promise<{ status: number; json: Record<string, unknown> }> => {
        const response = await fetch(`${handle.url}${path}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token ?? handle.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
        return { status: response.status, json: (await response.json()) as Record<string, unknown> };
      };
      // ANCHOR-A01: a data cycle is authoring-valid, runtime-invalid - the
      // anchor must succeed where compile refuses.
      const cyclic = docOf(
        { ...task("n1", "A", ["n2"]) },
        { ...task("n2", "B", ["n1"]) },
      );
      const anchored = await call("/api/canvas/anchor", { doc: cyclic });
      expect(anchored.status).toBe(200);
      const compileAttempt = await call("/api/canvas/compile", { doc: cyclic });
      expect(compileAttempt.status).toBe(400);
      // ANCHOR-A02: one response, one observation - both anchors present.
      expect(typeof anchored.json.baseRevision).toBe("number");
      expect(typeof anchored.json.baseGraphDigest).toBe("string");
      expect((anchored.json.baseGraphDigest as string)).toMatch(/^[0-9a-f]{64}$/);
      // ANCHOR-A03: pure layout movement keeps the digest.
      const moved = {
        ...cyclic,
        nodes: cyclic.nodes.map((node, index) => ({ ...node, x: node.x + 500 * (index + 1), y: node.y - 77 })),
      };
      const reAnchored = await call("/api/canvas/anchor", { doc: moved });
      expect(reAnchored.json.baseGraphDigest).toBe(anchored.json.baseGraphDigest);
      // ANCHOR-A04: a semantic change (rewiring an edge) moves the digest.
      const rewired = {
        ...cyclic,
        edges: [
          { id: "e:draft:1", source: "n1", target: "n2", kind: "data" as const },
          { id: "e:draft:2", source: "n1", target: "n2", kind: "data" as const },
        ],
      };
      const changedAnchor = await call("/api/canvas/anchor", { doc: rewired });
      expect(changedAnchor.json.baseGraphDigest).not.toBe(anchored.json.baseGraphDigest);
      // ANCHOR-A05: read-only - no events appended; token-gated like the
      // other canvas faces.
      const after = (rig.store.connection.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number }).c;
      expect(after).toBe(before);
      const unauthed = await call("/api/canvas/anchor", { doc: cyclic }, "");
      expect(unauthed.status).toBe(401);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// PLMP-CANVAS-8 (33 号, G9-C): endpoint-level presentation preservation
// through POST /api/canvas/patch - surviving positions and VisualGroups
// survive, fresh nodes place deterministically, identity counters advance.
// ---------------------------------------------------------------------------

describe("patch endpoint presentation preservation (PLMP-CANVAS-8)", () => {
  const beforeDoc = () =>
    parseCanvasDoc({
      version: 3,
      goal: "g",
      identity: { namespace: "sys", nextNode: 3, nextEdge: 3 },
      nodes: [
        { key: "n1", type: "task", title: "A", x: 701, y: 113, z: "root", task: {} },
        { key: "n2", type: "task", title: "B", x: 211, y: 628, z: "root", task: {} },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", kind: "data" }],
      groups: [{ id: "g1", label: "Research", members: ["n1", "n2"] }],
    });
  const call = async (
    handle: ServeHandle,
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

  it("PATCH-PRES-A01: semantic field update keeps position, group, and a correct digest", async () => {
    const rig = makeRig();
    const handle: ServeHandle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
      const doc = beforeDoc();
      const result = await call(handle, "/api/canvas/patch", {
        doc,
        patch: { addNodes: [], removeNodes: [], updateNodes: [{ id: "n1", label: "A2" }], addEdges: [], removeEdges: [], updateEdges: [], moveScope: [] },
      });
      expect(result.status).toBe(200);
      expect(result.json.applied).toBe(true);
      const returned = result.json.doc as { nodes: Array<{ key: string; x: number; y: number; title: string }>; groups: unknown[] };
      expect(returned.nodes.find((node) => node.key === "n1")).toMatchObject({ x: 701, y: 113, title: "A2" });
      expect(returned.groups).toEqual([{ id: "g1", label: "Research", members: ["n1", "n2"] }]);
      // The response digest matches the RETURNED document's lifted graph -
      // presentation reconciliation is semantically transparent.
      expect(agentGraphSemanticDigest(liftToAgentGraph(parseCanvasDoc(result.json.doc)))).toBe(result.json.graphDigest);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("PATCH-PRES-A02: added node keeps old nodes fixed, places deterministically, advances counters", async () => {
    const rig = makeRig();
    const handle: ServeHandle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
      const doc = beforeDoc();
      const patch = {
        addNodes: [{ id: "n:sys:7", kind: "agent", label: "C", scope: "root", task: {} }],
        removeNodes: [], updateNodes: [], addEdges: [], removeEdges: [], updateEdges: [], moveScope: [],
      };
      const result = await call(handle, "/api/canvas/patch", { doc, patch });
      expect(result.json.applied).toBe(true);
      const returned = result.json.doc as {
        nodes: Array<{ key: string; x: number; y: number }>;
        identity: { nextNode: number };
      };
      expect(returned.nodes.find((node) => node.key === "n1")).toMatchObject({ x: 701, y: 113 });
      expect(returned.nodes.find((node) => node.key === "n2")).toMatchObject({ x: 211, y: 628 });
      const c = returned.nodes.find((node) => node.key === "n:sys:7")!;
      const clear = (other: { x: number; y: number }) =>
        c.x >= other.x + 190 || c.x + 190 <= other.x || c.y >= other.y + 56 || c.y + 56 <= other.y;
      expect(clear({ x: 701, y: 113 })).toBe(true);
      expect(clear({ x: 211, y: 628 })).toBe(true);
      // n:sys:7 lifts the family floor: nextNode >= 8, never rewound to 3.
      expect(returned.identity.nextNode).toBeGreaterThanOrEqual(8);
      // Deterministic: the identical request returns identical placement.
      const again = await call(handle, "/api/canvas/patch", { doc, patch });
      expect((again.json.doc as { nodes: unknown[] }).nodes).toEqual(returned.nodes);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("PATCH-PRES-A03: deleted node cleans the group; the emptied group is retained", async () => {
    const rig = makeRig();
    const handle: ServeHandle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
      const doc = beforeDoc();
      const removeA = await call(handle, "/api/canvas/patch", {
        doc,
        patch: { addNodes: [], removeNodes: ["n1"], updateNodes: [], addEdges: [], removeEdges: ["e1"], updateEdges: [], moveScope: [] },
      });
      expect(removeA.json.applied).toBe(true);
      expect((removeA.json.doc as { groups: Array<{ id: string; members: string[] }> }).groups).toEqual([
        { id: "g1", label: "Research", members: ["n2"] },
      ]);
      const removeB = await call(handle, "/api/canvas/patch", {
        doc: removeA.json.doc,
        patch: { addNodes: [], removeNodes: ["n2"], updateNodes: [], addEdges: [], removeEdges: [], updateEdges: [], moveScope: [] },
      });
      expect(removeB.json.applied).toBe(true);
      expect((removeB.json.doc as { groups: Array<{ id: string; members: string[] }> }).groups).toEqual([
        { id: "g1", label: "Research", members: [] },
      ]);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("PATCH-PRES-A04: moveScope preserves absolute Canvas x/y", async () => {
    const rig = makeRig();
    const handle: ServeHandle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
      const doc = parseCanvasDoc({
        version: 3,
        goal: "g",
        identity: { namespace: "sys", nextNode: 3, nextEdge: 2 },
        nodes: [
          { key: "n1", type: "task", title: "A", x: 620, y: 240, z: "root", task: {} },
          { key: "s1", type: "subflow", title: "S", x: 0, y: 0, z: "root" },
        ],
        edges: [],
        groups: [],
      });
      const result = await call(handle, "/api/canvas/patch", {
        doc,
        patch: { addNodes: [], removeNodes: [], updateNodes: [], addEdges: [], removeEdges: [], updateEdges: [], moveScope: [{ id: "n1", scope: "s1" }] },
      });
      expect(result.json.applied).toBe(true);
      const returned = result.json.doc as { nodes: Array<{ key: string; x: number; y: number; z: string }> };
      expect(returned.nodes.find((node) => node.key === "n1")).toMatchObject({ x: 620, y: 240, z: "s1" });
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Spec 35 (PLMP-PARSE-1): view freshness - EventCursor ≠ ViewCursor.
// WEB-H01-A..E through the real serve; WEB-HEALTH-A01 for the empty state.
// ---------------------------------------------------------------------------

describe("view freshness (spec 35 WEB-H01 / WEB-HEALTH)", () => {
  const eventCursorOf = (store: EventStore): number => {
    const row = store.connection.prepare("SELECT COALESCE(MAX(event_id), 0) AS m FROM events").get() as { m: number };
    return Number(row.m);
  };
  const get = async (handle: ServeHandle, suffix = ""): Promise<{ status: number; json: Record<string, unknown> }> => {
    const response = await fetch(`${handle.url}/api/graph${suffix}`, {
      headers: { authorization: `Bearer ${handle.token}` },
    });
    return { status: response.status, json: (await response.json()) as Record<string, unknown> };
  };
  const seedEvidenceRow = (store: EventStore, attemptId: string): void => {
    store.connection
      .prepare(
        "INSERT INTO evidence(project_id, evidence_id, status, evidence_json, last_event_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "identity-project",
        `evidence-${attemptId}-tests_pass-0`,
        "active",
        new TextEncoder().encode(
          JSON.stringify({
            schema_version: 1,
            project_id: "identity-project",
            evidence_id: `evidence-${attemptId}-tests_pass-0`,
            subject_type: "attempt",
            subject_id: attemptId,
            subject_digest: "a".repeat(64),
            predicate: "tests_pass",
            value: {},
            project_revision: 0,
            input_fingerprint: "b".repeat(64),
            command: ["python", "-m", "pytest"],
            exit_code: 0,
            environment_digest: "c".repeat(64),
            dependency_digest: null,
            observed_artifacts: [],
            producer: "h1",
            created_at: "2026-09-10T00:00:00Z",
            status: "active",
          }),
        ),
        1,
        "2026-09-10T00:00:00Z",
      );
  };

  it("WEB-HEALTH-A01: health succeeds before project initialization, without building the graph", async () => {
    const rig = makeRig();
    const handle: ServeHandle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      const before = rig.controller.graphBuildCount();
      const response = await fetch(`${handle.url}/api/health`, {
        headers: { authorization: `Bearer ${handle.token}` },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; projectInitialized: boolean; eventCursor: number };
      expect(body).toEqual({ ok: true, projectInitialized: false, eventCursor: 0 });
      expect(rig.controller.graphBuildCount()).toBe(before);
      // After the project exists, health reports it - still no graph build.
      rig.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
      const after = (await (
        await fetch(`${handle.url}/api/health`, { headers: { authorization: `Bearer ${handle.token}` } })
      ).json()) as { projectInitialized: boolean };
      expect(after.projectInitialized).toBe(true);
      expect(rig.controller.graphBuildCount()).toBe(before);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("WEB-H01-A/B: matching viewCursor skips the build; an event invalidates it", async () => {
    const rig = makeRig();
    const handle: ServeHandle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
      const first = await get(handle);
      expect(first.json.changed).toBe(true);
      const vc = first.json.viewCursor as string;
      expect(typeof vc).toBe("string");
      expect((first.json.graph as { project: { cursor: number } }).project.cursor).toBe(eventCursorOf(rig.store));
      // A: same viewCursor → changed=false, no graph payload, no rebuild.
      const builds = rig.controller.graphBuildCount();
      const second = await get(handle, `?viewCursor=${encodeURIComponent(vc)}`);
      expect(second.json.changed).toBe(false);
      expect(second.json.graph).toBeUndefined();
      expect(second.json.viewCursor).toBe(vc);
      expect(rig.controller.graphBuildCount()).toBe(builds);
      // B: a graph-visible canonical event invalidates the cursor.
      rig.controller.pause("smoke");
      const third = await get(handle, `?viewCursor=${encodeURIComponent(vc)}`);
      expect(third.json.changed).toBe(true);
      expect(third.json.graph).toBeDefined();
      expect(third.json.viewCursor).not.toBe(vc);
      expect(rig.controller.graphBuildCount()).toBe(builds + 1);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("WEB-H01-C/D: a graph-visible volatile change invalidates; a non-visible one does not", async () => {
    const rig = makeRig();
    try {
      rig.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
      rig.controller.step();
      const created = rig.controller.step()!;
      const attemptId = created.entity_id;
      const gate = parseGateDefinition({
        gate_id: "gate-pass",
        version: 1,
        subject_type: "attempt",
        require: { all: [{ exists: { predicate: "tests_pass" } }] },
      });
      rig.controller.declareGate(gate, "test");
      seedEvidenceRow(rig.store, attemptId);
      // D first: gate evaluation WITHOUT attribution settles nothing - the
      // non-visible mutation must not churn the view cursor.
      const beforeD = rig.controller.viewCursor();
      const verdictD = rig.controller.evaluateAttemptGate("gate-pass", attemptId);
      expect(verdictD.verdict).toBe("PASS");
      expect(rig.controller.viewCursor()).toBe(beforeD);
      // C: claim WITH attribution, then the same eventless settlement - the
      // attribution disappears from the graph while MAX(event_id) stays put;
      // the old viewCursor must be invalidated by the generation bump.
      await rig.controller.claim(attemptId, { model: "flash", cost: 1 });
      seedEvidenceRow(rig.store, `${attemptId}-2`);
      const vc = rig.controller.viewCursor();
      const events = eventCursorOf(rig.store);
      const verdictC = rig.controller.evaluateAttemptGate("gate-pass", attemptId);
      expect(verdictC.verdict).toBe("PASS");
      expect(eventCursorOf(rig.store)).toBe(events); // no event appended
      expect(rig.controller.viewCursor()).not.toBe(vc); // but the view moved
    } finally {
      await rig.cleanup();
    }
  });

  it("WEB-H01-E: a stale viewCursor from a dead process never hits the fast path", async () => {
    const statePath = tempStatePath();
    const makeRigAt = () => {
      const store = new EventStore(statePath, { clock: new FakeClock().next });
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
        clock: () => "2026-09-10T00:00:00Z",
      });
      return { store, controller, cleanup: () => Promise.all([effects.close(), store.close()]) };
    };
    const rigA = makeRigAt();
    const handleA: ServeHandle = await serveOrchestration(rigA.controller, { port: 0 });
    let staleCursor = "";
    try {
      rigA.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
      staleCursor = (await get(handleA)).json.viewCursor as string;
    } finally {
      await handleA.close();
      await rigA.cleanup();
    }
    // New process over the SAME ledger: the volatile attribution map died
    // with process A while the event cursor is unchanged - the 128-bit epoch
    // in the cursor makes accidental cross-process equality cryptographically
    // negligible (G9-F2 honest wording; never claimed impossible).
    const rigB = makeRigAt();
    const handleB: ServeHandle = await serveOrchestration(rigB.controller, { port: 0 });
    try {
      const response = await get(handleB, `?viewCursor=${encodeURIComponent(staleCursor)}`);
      expect(response.json.changed).toBe(true);
      expect(response.json.graph).toBeDefined();
      expect(response.json.viewCursor).not.toBe(staleCursor);
    } finally {
      await handleB.close();
      await rigB.cleanup();
    }
  });
});


/**
 * G9-F2 residual closure (spec 35 addendum): VIEW-RES-A01..A04 (attribution
 * ownership + validation), VIEW-RES-C01 (viewCursor dominates the legacy
 * cursor), HEALTH-RES-A01..A03 (project-scoped initialization).
 */
describe("G9-F2 residual closure (VIEW-RES / HEALTH-RES)", () => {
  const get = async (handle: ServeHandle, suffix = ""): Promise<{ json: Record<string, unknown> }> => {
    const response = await fetch(`${handle.url}/api/graph${suffix}`, {
      headers: { authorization: `Bearer ${handle.token}` },
    });
    return { json: (await response.json()) as Record<string, unknown> };
  };
  const createAttempt = (rig: ReturnType<typeof makeRig>): string => {
    rig.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
    rig.controller.step();
    return rig.controller.step()!.entity_id;
  };

  it("VIEW-RES-A01: mutating the caller's object after claim() never mutates graph output", async () => {
    const rig = makeRig();
    try {
      const attemptId = createAttempt(rig);
      const attribution = { model: "model-A", cost: 1 };
      await rig.controller.claim(attemptId, attribution);
      const before = rig.controller.orchestrationGraph();
      attribution.model = "model-B";
      const after = rig.controller.orchestrationGraph();
      const attributionOf = (graph: typeof before) =>
        graph.tasks.find((task) => task.attempts.length > 0)?.attempts[0]?.attribution;
      expect(attributionOf(after)).toEqual({ model: "model-A", cost: 1 });
      expect(attributionOf(after)).toEqual(attributionOf(before));
    } finally {
      await rig.cleanup();
    }
  });

  it("VIEW-RES-A02: caller mutation cannot produce same viewCursor + different graph", async () => {
    const rig = makeRig();
    try {
      const attemptId = createAttempt(rig);
      const attribution = { model: "model-A", cost: 1 };
      await rig.controller.claim(attemptId, attribution);
      const cursor1 = rig.controller.viewCursor();
      const graph1 = rig.controller.orchestrationGraph();
      attribution.model = "model-B";
      const cursor2 = rig.controller.viewCursor();
      const graph2 = rig.controller.orchestrationGraph();
      expect(cursor2).toBe(cursor1);
      expect(JSON.stringify(graph2)).toBe(JSON.stringify(graph1));
    } finally {
      await rig.cleanup();
    }
  });

  it("VIEW-RES-A03: malformed attribution is rejected before graph-visible state (unit + controller + HTTP)", async () => {
    const rig = makeRig();
    const handle: ServeHandle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      const attemptId = createAttempt(rig);
      // Unit face: every malformed shape is rejected by the parser.
      expect(() => parseAttemptAttribution({ model: 42 })).toThrow(/non-empty string/);
      expect(() => parseAttemptAttribution({ model: "" })).toThrow(/non-empty string/);
      expect(() => parseAttemptAttribution({ model: "m", cost: -1 })).toThrow(/>= 0/);
      expect(() => parseAttemptAttribution({ model: "m", cost: "free" })).toThrow(/finite number/);
      expect(() => parseAttemptAttribution({ model: "m", cost: Number.NaN })).toThrow(/finite number/);
      expect(() => parseAttemptAttribution({ model: "m", taskType: "" })).toThrow(/non-empty string/);
      expect(() => parseAttemptAttribution({ model: "m", junk: true })).toThrow(/unknown field 'junk'/);
      expect(() => parseAttemptAttribution(null)).toThrow(/must be an object/);
      // The stored snapshot is a fresh, internally owned value.
      const owned = parseAttemptAttribution({ model: "m", cost: 1, taskType: "code" });
      expect(owned).toEqual({ model: "m", cost: 1, taskType: "code" });
      // Controller face: a malformed claim fails with zero partial state -
      // no worktree side effect, attempt stays CREATED, cursor untouched.
      const cursorBefore = rig.controller.viewCursor();
      await expect(
        rig.controller.claim(attemptId, { model: 42, junk: true } as never),
      ).rejects.toThrow(/unknown field 'junk'/);
      const attemptState = rig.controller.status().attempts.find(
        (attempt) => attempt.attempt_id === attemptId,
      );
      expect(attemptState?.state).toBe("CREATED");
      expect(rig.controller.viewCursor()).toBe(cursorBefore);
      // HTTP face: the cast boundary is gone - the panel gets a 400.
      const response = await fetch(`${handle.url}/api/control/claim`, {
        method: "POST",
        headers: { authorization: `Bearer ${handle.token}`, "content-type": "application/json" },
        body: JSON.stringify({ attemptId, attribution: { model: 42, cost: "free", junk: true } }),
      });
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toMatch(/unknown field 'junk'/);
      const graph = rig.controller.orchestrationGraph();
      const attributed = graph.tasks.find((task) => task.attempts.length > 0)?.attempts[0];
      expect(attributed?.attribution).toBeUndefined();
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("VIEW-RES-A04: claiming without attribution does not bump the volatile view generation", async () => {
    const rig = makeRig();
    try {
      const attemptId = createAttempt(rig);
      const before = rig.controller.viewCursor().split(":");
      await rig.controller.claim(attemptId);
      const after = rig.controller.viewCursor().split(":");
      // The event cursor moved (ATTEMPT_STARTED), the generation did not.
      expect(after[3]).toBe(before[3]);
      expect(Number(after[2])).toBeGreaterThan(Number(before[2]));
    } finally {
      await rig.cleanup();
    }
  });

  it("VIEW-RES-C01: viewCursor dominates - a mixed request never answers graph + changed:false", async () => {
    const rig = makeRig();
    const handle: ServeHandle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({ projectId: "identity-project", goal: "g", tasks: [taskSpec("task-1")] });
      rig.controller.step();
      const created = rig.controller.step()!;
      const stale = rig.controller.viewCursor();
      // Volatile graph-visible change with NO event: the event cursor stays
      // put while the stale viewCursor goes bad.
      await rig.controller.claim(created.entity_id, { model: "m", cost: 0 });
      const eventCursor = rig.controller.serviceHealth().eventCursor;
      expect(eventCursor).toBeGreaterThan(0);
      const mixed = await get(handle, `?viewCursor=${encodeURIComponent(stale)}&cursor=${eventCursor}`);
      expect(mixed.json.graph).toBeDefined();
      expect(mixed.json.changed).toBe(true);
      expect(mixed.json.viewCursor).not.toBe(stale);
      // And the fast path still holds for the FRESH cursor.
      const fresh = (
        await get(handle, `?viewCursor=${encodeURIComponent(mixed.json.viewCursor as string)}`)
      ).json;
      expect(fresh.changed).toBe(false);
      expect(fresh.graph).toBeUndefined();
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("HEALTH-RES-A01/A02/A03: projectInitialized is scoped to the controller's project", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    const effectsA = createPalimpsestEffects({
      databasePath: join(tempStatePath(), "ops-health-a.sqlite"),
      git: new FakeGitPort(HEAD),
    });
    const effectsB = createPalimpsestEffects({
      databasePath: join(tempStatePath(), "ops-health-b.sqlite"),
      git: new FakeGitPort(HEAD),
    });
    const policy = new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    });
    const controllerA = new ProjectController({
      store,
      effects: effectsA,
      projectId: "project-a",
      policy,
      clock: () => "2026-09-08T00:00:00Z",
    });
    // B wraps the SAME store but points at a different project identity.
    const controllerB = new ProjectController({
      store,
      effects: effectsB,
      projectId: "project-b",
      policy,
      clock: () => "2026-09-08T00:00:00Z",
    });
    const handleB: ServeHandle = await serveOrchestration(controllerB, { port: 0 });
    try {
      // A01: empty store - healthy, not initialized.
      expect(controllerB.serviceHealth()).toEqual({ ok: true, projectInitialized: false, eventCursor: 0 });
      // A02: A initialized, controller for B - B stays uninitialized, and the
      // HTTP health face answers with B's scope, not the store's.
      controllerA.start({ projectId: "project-a", goal: "a", tasks: [taskSpec("task-1")] });
      expect(controllerA.serviceHealth().projectInitialized).toBe(true);
      expect(controllerB.serviceHealth()).toEqual({ ok: true, projectInitialized: false, eventCursor: 0 });
      const health = await fetch(`${handleB.url}/api/health`, {
        headers: { authorization: `Bearer ${handleB.token}` },
      });
      expect(((await health.json()) as { projectInitialized: boolean }).projectInitialized).toBe(false);
      // A03: once B itself is initialized, B reports it.
      controllerB.start({ projectId: "project-b", goal: "b", tasks: [taskSpec("task-1")] });
      expect(controllerB.serviceHealth().projectInitialized).toBe(true);
    } finally {
      await handleB.close();
      await Promise.all([effectsA.close(), effectsB.close(), store.close()]);
    }
  });
});
