import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { proposalTaskSpecs, validateProjectProposal, type ProjectProposal } from "../src/architecture/index.js";
import {
  canvasCompile,
  canvasDiff,
  canvasInsertFragment,
  canvasLayout,
  emptyCanvasDoc,
  parseCanvasDoc,
  satelliteAttempts,
  traceRows,
  upgradeCanvasV2ToV3,
  type CanvasDoc,
  type CanvasEdge,
} from "../src/canvas/index.js";
import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { ProjectController } from "../src/tools/index.js";
import type { OrchestrationGraph } from "../src/tools/graph.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

/**
 * PLMP-CANVAS-7 authoring helpers: nodes are declared with legacy-style
 * `task.dependsOn` for readability, and `docWith` materializes the v3 doc -
 * dependsOn flattens into `doc.edges[]` (ids `e:test:<k>`, node declaration
 * × dependency order, exactly the v2 lift order) and the identity namespace
 * is "test".
 */
function taskNode(key: string, title: string, x: number, y: number, z = "root", dependsOn: string[] = []) {
  return { key, type: "task" as const, title, x, y, z, task: { dependsOn } };
}

type AuthoringNode = object;

function docWith(...authoring: AuthoringNode[]): CanvasDoc {
  const nodes = authoring.map((node) => {
    const { task, ...rest } = node as { task?: { dependsOn?: string[] } & Record<string, unknown> };
    if (task === undefined) return { ...rest };
    const { dependsOn: _dependsOn, ...payload } = task;
    void _dependsOn;
    return { ...rest, task: payload };
  });
  let edgeCounter = 0;
  const edges: CanvasEdge[] = authoring.flatMap((node) =>
    ((node as { task?: { dependsOn?: string[] } }).task?.dependsOn ?? []).map((source) => {
      edgeCounter += 1;
      return { id: `e:test:${edgeCounter}`, source, target: (node as { key: string }).key, kind: "data" as const };
    }),
  );
  return {
    version: 3,
    goal: "g",
    identity: { namespace: "test", nextNode: 1, nextEdge: edgeCounter + 1 },
    nodes: nodes as unknown as CanvasDoc["nodes"],
    edges,
    groups: [],
  };
}

function docWithGroups(groups: CanvasDoc["groups"], ...authoring: AuthoringNode[]): CanvasDoc {
  return { ...docWith(...authoring), groups };
}

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-canvas-")), "ops.sqlite"),
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

function graphFixture(): OrchestrationGraph {
  return {
    project: { projectId: "p", revision: 0, goal: "g", paused: false, cursor: 7 },
    tasks: [
      {
        taskId: "task-1",
        objective: "调研",
        state: "ACTIVE",
        role: "scout",
        dependsOn: [],
        writePaths: ["r.md"],
        requiredArtifacts: [],
        attempts: [
          {
            attemptId: "attempt-aaa",
            state: "RUNNING",
            attribution: { model: "m1", cost: 0.5 },
            evidence: [],
            timeline: [
              { at: "2026-09-07T00:00:10Z", label: "尝试已创建" },
              { at: "2026-09-07T00:00:20Z", label: "已认领" },
              { at: "2026-09-07T00:00:45Z", label: "门禁证据已记录" },
            ],
          },
        ],
      },
      {
        taskId: "task-2",
        objective: "综合",
        state: "READY",
        role: "analyst",
        dependsOn: ["task-1"],
        writePaths: [],
        requiredArtifacts: [],
        attempts: [
          {
            attemptId: "attempt-bbb",
            state: "COMPLETED",
            attribution: { model: "m2", cost: 1.25 },
            evidence: [],
            timeline: [
              { at: "2026-09-07T00:01:00Z", label: "尝试已创建" },
              { at: "2026-09-07T00:02:00Z", label: "已晋升" },
            ],
          },
        ],
      },
    ],
    promotions: [],
  } as unknown as OrchestrationGraph;
}

describe("canvas definition layer (PLMP-CANVAS)", () => {
  it("CANVAS-A01: parse is fail-closed on shape errors and unknown fields, clean docs round-trip", () => {
    const doc = docWith(taskNode("n1", "调研", 10, 20));
    expect(parseCanvasDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    expect(() => parseCanvasDoc({ ...doc, version: 2 })).toThrow(/upgradeCanvasV2ToV3/);
    expect(() => parseCanvasDoc({ ...doc, version: 9 })).toThrow(/version/);
    expect(() => parseCanvasDoc({ ...doc, extra: 1 })).toThrow(/unknown document field/);
    expect(() =>
      parseCanvasDoc(docWith({ ...taskNode("n2", "x", 0, 0), wat: 1 } as unknown as CanvasDoc["nodes"][number])),
    ).toThrow(/unknown node field/);
    expect(() => parseCanvasDoc(docWith({ ...taskNode("n3", "x", 0, 0), z: "ghost" }))).toThrow(
      /unknown owner/,
    );
    expect(() =>
      parseCanvasDoc(docWith(taskNode("n4", "a", 0, 0), taskNode("n4", "b", 1, 1))),
    ).toThrow(/duplicate node key/);
    // PLMP-CANVAS-7: the visual-group second encoding (node.g) is retired -
    // it is an unknown node field now, not a silently ignored alternative.
    expect(() =>
      parseCanvasDoc(docWith({ ...taskNode("n5", "x", 0, 0), g: "nope" } as unknown as CanvasDoc["nodes"][number])),
    ).toThrow(/unknown node field "g"/);
    expect(() => parseCanvasDoc({ ...doc, identity: { namespace: "test", nextNode: 0, nextEdge: 1 } })).toThrow(
      /integer >= 1/,
    );
    expect(() => parseCanvasDoc({ ...doc, identity: { namespace: "bad:ns", nextNode: 1, nextEdge: 1 } })).toThrow(
      /identity\.namespace/,
    );
    const nested = docWith(
      { key: "s1", type: "subflow", title: "研究", x: 0, y: 0, z: "root" },
      taskNode("n6", "成员", 5, 5, "s1"),
    );
    expect(parseCanvasDoc(JSON.parse(JSON.stringify(nested)))).toEqual(nested);
    expect(emptyCanvasDoc("x").nodes).toEqual([]);
    expect(emptyCanvasDoc("x").identity).toEqual({ namespace: "sys", nextNode: 1, nextEdge: 1 });
  });

  it("CANVAS-A02: compile flattens to the same proposal a hand would write", () => {
    const doc = docWithGroups(
      [{ id: "g1", label: "框", members: ["n1", "a1"] }],
      taskNode("n1", "调研", 0, 0),
      { key: "a1", type: "annotation", title: "备注", x: 0, y: 0, z: "root", text: "todo" },
      { ...taskNode("n2", "综合", 10, 10), task: { dependsOn: ["n1"], role: "analyst", suggestedSkills: ["web"] } },
    );
    const proposal = canvasCompile(doc);
    expect(proposal.goal).toBe("g");
    expect(proposal.changeClass).toBe("behavior_change");
    expect(proposal.tasks.map((task) => task.title)).toEqual(["调研", "综合"]);
    expect(validateProjectProposal(proposal)).toEqual([]);
    expect(proposal.tasks[1]).toEqual({
      title: "综合",
      dependsOn: ["调研"],
      definitionId: "n2",
      role: "analyst",
      suggestedSkills: ["web"],
    });
    expect(() => canvasCompile(docWith(taskNode("n1", "同名", 0, 0), taskNode("n2", "同名", 1, 1)))).toThrow(
      /duplicate agent label/,
    );
  });

  it("CANVAS-A03: subflow members flatten across z chains with boundaries implicit", () => {
    const doc = docWith(
      taskNode("out", "外部", 0, 0),
      { key: "s1", type: "subflow", title: "外层", x: 0, y: 0, z: "root" },
      { key: "s2", type: "subflow", title: "内层", x: 0, y: 0, z: "s1" },
      { ...taskNode("m1", "成员一", 0, 0, "s2"), task: { dependsOn: ["out"] } },
      { ...taskNode("m2", "成员二", 0, 0, "s1"), task: { dependsOn: ["m1"] } },
      { ...taskNode("tail", "收尾", 0, 0), task: { dependsOn: ["m2"] } },
    );
    const proposal = canvasCompile(doc);
    expect(proposal.tasks.map((task) => task.title)).toEqual(["外部", "成员一", "成员二", "收尾"]);
    expect(proposal.tasks[0]!.dependsOn).toEqual([]);
    expect(proposal.tasks[1]!.dependsOn).toEqual(["外部"]);
    expect(proposal.tasks[2]!.dependsOn).toEqual(["成员一"]);
    expect(proposal.tasks[3]!.dependsOn).toEqual(["成员二"]);
    expect(validateProjectProposal(proposal)).toEqual([]);
  });

  it("CANVAS-A04: fragment insert regenerates keys, offsets, adopts an empty goal", () => {
    const seed = canvasInsertFragment(emptyCanvasDoc(""), {
      goal: "新目标",
      changeClass: "behavior_change",
      tasks: [{ title: "A", dependsOn: [] }, { title: "B", dependsOn: ["A"] }],
    });
    expect(seed.goal).toBe("新目标");
    // PLMP-CANVAS-7: the sys family, monotonic - and B's dependency is an
    // edge record, not a payload field.
    expect(seed.nodes.map((node) => node.key)).toEqual(["n:sys:1", "n:sys:2"]);
    expect(seed.edges).toEqual([{ id: "e:sys:1", source: "n:sys:1", target: "n:sys:2", kind: "data" }]);
    expect(seed.identity).toEqual({ namespace: "sys", nextNode: 3, nextEdge: 2 });
    const mixed = docWith(taskNode("n1", "已有", 0, 0), taskNode("n2", "已有二", 0, 0));
    const withFragment = canvasInsertFragment(mixed, {
      goal: "另目标",
      changeClass: "behavior_change",
      tasks: [{ title: "插入", dependsOn: [] }],
    });
    expect(withFragment.goal).toBe("g");
    // Legacy keys are outside the doc family - the fresh id starts the
    // family at 1 and can never collide with (or reuse) a legacy key.
    expect(withFragment.nodes.map((node) => node.key)).toEqual(["n1", "n2", "n:test:1"]);
    const inserted = withFragment.nodes[2]!;
    expect(inserted.title).toBe("插入");
    expect(inserted.x).toBeGreaterThan(0);
    const explicit = canvasInsertFragment(mixed, {
      goal: "g",
      changeClass: "behavior_change",
      tasks: [{ title: "插入", dependsOn: [] }],
    }, { x: 40, y: 60 });
    expect(explicit.nodes[2]!.x).toBe(40);
    expect(explicit.nodes[2]!.y).toBe(60);
  });

  it("CANVAS-A05: diff detects added/removed/changed field-level against live views", () => {
    const live = [
      { objective: "保留", dependsOn: ["源"], writePaths: ["a"], requiredArtifacts: [], role: "scout" },
      { objective: "移除", dependsOn: [], writePaths: [], requiredArtifacts: [], role: "implementer" },
    ];
    const draft = [
      { title: "保留", dependsOn: ["源"], writePaths: ["a"], role: "scout" },
      { title: "新增", dependsOn: [], role: "analyst" },
      { title: "变形", dependsOn: ["保留"], writePaths: ["b"], role: "verifier" },
    ];
    const diff = canvasDiff(draft, live);
    expect(diff.added.map((entry) => entry.title).sort()).toEqual(["变形", "新增"]);
    expect(diff.removed.map((entry) => entry.title)).toEqual(["移除"]);
    expect(diff.changed).toEqual([]);
    const orderStable = canvasDiff(
      [{ title: "保留", dependsOn: ["源"], writePaths: ["a"], role: "scout" }],
      live,
    );
    expect(orderStable.changed).toEqual([]);
    const roleAndPathsChanged = canvasDiff(
      [
        { title: "保留", dependsOn: ["源"], writePaths: ["a", "a2"], role: "verifier" },
        { title: "新增", dependsOn: [], role: "analyst" },
      ],
      live,
    );
    expect(roleAndPathsChanged.changed).toEqual([
      { title: "保留", fields: ["writePaths", "role"] },
    ]);
  });

  it("CANVAS-A06: serve canvas endpoints are token-gated, pure, and honest on errors", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      const unauthed = await api(handle, "/api/canvas/compile", { method: "POST", body: {}, token: null });
      expect(unauthed.status).toBe(401);
      const before = eventCount(rig.store);
      const compiled = await api(handle, "/api/canvas/compile", {
        method: "POST",
        body: { doc: JSON.parse(JSON.stringify(docWith(taskNode("n1", "调研", 0, 0)))) },
      });
      expect(compiled.status).toBe(200);
      expect((compiled.json.proposal as Json).goal).toBe("g");
      expect(compiled.json.diagnostics).toEqual([]);
      const bad = await api(handle, "/api/canvas/compile", {
        method: "POST",
        body: { doc: { version: 9, goal: "", nodes: [], edges: [], groups: [], identity: { namespace: "t", nextNode: 1, nextEdge: 1 } } },
      });
      expect(bad.status).toBe(400);
      const v2Doc = await api(handle, "/api/canvas/compile", {
        method: "POST",
        body: { doc: { version: 2, goal: "g", nodes: [], groups: [] } },
      });
      expect(v2Doc.status).toBe(400);
      expect(((v2Doc.json.error as string) ?? "")).toMatch(/upgradeCanvasV2ToV3/);
      const diff = await api(handle, "/api/canvas/diff", {
        method: "POST",
        body: {
          doc: JSON.parse(
            JSON.stringify(docWith(taskNode("n1", "调研", 0, 0), taskNode("n2", "新阶段", 0, 120))),
          ),
        },
      });
      expect(diff.status).toBe(200);
      const diffBody = diff.json.diff as Json;
      expect(diffBody.added).toEqual([{ title: "调研" }, { title: "新阶段" }]);
      expect(diffBody.removed).toEqual([{ title: "Complete task-1." }]);
      // PLMP-RUNTIME-1: the derive face is retired - satellites/traces ride
      // the graph poll; the retired endpoint answers 404.
      const derived = await api(handle, "/api/canvas/derive", { method: "POST", body: {} });
      expect(derived.status).toBe(404);
      const graphView = await api(handle, "/api/graph");
      const runtime = ((graphView.json.graph as Json).runtime ?? null) as Json | null;
      expect(runtime).not.toBeNull();
      expect(Array.isArray(runtime!.satellites)).toBe(true);
      expect(Array.isArray(runtime!.traces)).toBe(true);
      const laid = await api(handle, "/api/canvas/layout", {
        method: "POST",
        body: {
          doc: JSON.parse(JSON.stringify(docWith(taskNode("n1", "调研", 500, 500)))),
          layout: "flow_lr",
        },
      });
      expect((laid.json.doc as Json).nodes).toHaveLength(1);
      expect(eventCount(rig.store)).toBe(before);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("CANVAS-A07: suggestedSkills compiles through to TaskSpec.suggested_skills, absent omitted", () => {
    const withSkills = proposalTaskSpecs({
      goal: "g",
      changeClass: "behavior_change",
      tasks: [
        { title: "A", dependsOn: [], suggestedSkills: ["web", "shell"] },
        { title: "B", dependsOn: ["A"] },
      ],
    });
    expect(withSkills[0]!.suggested_skills).toEqual(["web", "shell"]);
    expect(Object.hasOwn(withSkills[1] as object, "suggested_skills")).toBe(false);
    // The fragment path is canvasInsertFragment (proposalFragment retired
    // with the v3 single-truth discipline).
    const inserted = canvasInsertFragment(emptyCanvasDoc(""), {
      goal: "g",
      changeClass: "behavior_change",
      tasks: [{ title: "A", dependsOn: [], suggestedSkills: ["web"] }],
    });
    expect(canvasCompile(inserted).tasks[0]!.suggestedSkills).toEqual(["web"]);
  });

  it("CANVAS-A08: trace rows derive spans with durations and chronological order", () => {
    const rows = traceRows(graphFixture());
    expect(rows.map((row) => row.attemptId)).toEqual(["attempt-aaa", "attempt-bbb"]);
    const first = rows[0]!;
    expect(first.taskTitle).toBe("调研");
    expect(first.spans).toEqual([
      { label: "尝试已创建", start: "2026-09-07T00:00:10Z", end: "2026-09-07T00:00:20Z" },
      { label: "已认领", start: "2026-09-07T00:00:20Z", end: "2026-09-07T00:00:45Z" },
      { label: "门禁证据已记录", start: "2026-09-07T00:00:45Z", end: "2026-09-07T00:00:45Z" },
    ]);
  });

  it("CANVAS-A09: every layout is compile-pure and moves descendants with their subflow", () => {
    const doc = docWith(
      taskNode("a", "A", 900, 900),
      { key: "s1", type: "subflow", title: "S", x: 900, y: 900, z: "root" },
      taskNode("m", "M", 920, 950, "s1"),
      { ...taskNode("b", "B", 100, 100), task: { dependsOn: ["a"] } },
    );
    const baseline = canvasCompile(doc);
    for (const layout of ["flow_lr", "flow_tb", "force", "compact"] as const) {
      const laid = canvasLayout(doc, layout);
      expect(canvasCompile(laid)).toEqual(baseline);
      const moved = laid.nodes.find((node) => node.key === "s1")!;
      const member = laid.nodes.find((node) => node.key === "m")!;
      const original = doc.nodes.find((node) => node.key === "s1")!;
      expect(member.x - 920).toBe(moved.x - original.x);
      expect(member.y - 950).toBe(moved.y - original.y);
    }
    expect(canvasLayout(doc, "manual")).toEqual(doc);
    expect(() => canvasLayout(doc, "nope" as never)).toThrow(/unknown layout/);
  });

  it("CANVAS-A10: satellites are exactly the open attempts", () => {
    const satellites = satelliteAttempts(graphFixture());
    expect(satellites).toHaveLength(1);
    expect(satellites[0]).toMatchObject({
      attemptId: "attempt-aaa",
      taskId: "task-1",
      taskTitle: "调研",
      role: "scout",
      state: "RUNNING",
      attribution: { model: "m1", cost: 0.5 },
    });
  });

  // PLMP-CANVAS-5 (22 号规格): canvas integrity - ownership invariants,
  // transitive layout translation, fail-closed serve gating.

  it("CANVAS-A11: INV-C1 - a z owner must be a subflow node", () => {
    expect(() =>
      parseCanvasDoc(docWith(taskNode("n1", "A", 0, 0), taskNode("n2", "B", 1, 1, "n1"))),
    ).toThrow(/must be a subflow/);
    expect(() =>
      parseCanvasDoc(
        docWith(
          taskNode("n1", "A", 0, 0),
          { key: "a1", type: "annotation", title: "注", x: 0, y: 0, z: "root", text: "t" },
          taskNode("n2", "B", 1, 1, "a1"),
        ),
      ),
    ).toThrow(/must be a subflow/);
    const legal = docWith(
      { key: "s1", type: "subflow", title: "S", x: 0, y: 0, z: "root" },
      taskNode("m", "M", 5, 5, "s1"),
    );
    expect(parseCanvasDoc(JSON.parse(JSON.stringify(legal)))).toEqual(legal);
  });

  it("CANVAS-A12: INV-C2 - self-parent is rejected", () => {
    expect(() =>
      parseCanvasDoc(docWith({ key: "s", type: "subflow", title: "S", x: 0, y: 0, z: "s" })),
    ).toThrow(/cannot own itself/);
    // A task owning itself is already refused by the owner-type invariant.
    expect(() => parseCanvasDoc(docWith(taskNode("n1", "A", 0, 0, "n1")))).toThrow(
      /must be a subflow/,
    );
  });

  it("CANVAS-A13: INV-C3 - ownership cycles rejected at any depth, deep legal chains pass", () => {
    expect(() =>
      parseCanvasDoc(
        docWith(
          { key: "s1", type: "subflow", title: "S1", x: 0, y: 0, z: "s3" },
          { key: "s2", type: "subflow", title: "S2", x: 0, y: 0, z: "s1" },
          { key: "s3", type: "subflow", title: "S3", x: 0, y: 0, z: "s2" },
        ),
      ),
    ).toThrow(/ownership cycle/);
    const deep = docWith(
      { key: "s1", type: "subflow", title: "S1", x: 0, y: 0, z: "root" },
      { key: "s2", type: "subflow", title: "S2", x: 0, y: 0, z: "s1" },
      { key: "s3", type: "subflow", title: "S3", x: 0, y: 0, z: "s2" },
      taskNode("m", "M", 5, 5, "s3"),
    );
    expect(parseCanvasDoc(JSON.parse(JSON.stringify(deep)))).toEqual(deep);
  });

  it("CANVAS-A14: INV-C4 - group nesting must be acyclic", () => {
    expect(() =>
      parseCanvasDoc(docWithGroups([{ id: "g1", label: "G1", g: "g1", members: ["n1"] }], taskNode("n1", "A", 0, 0))),
    ).toThrow(/group nesting cycle/);
    expect(() =>
      parseCanvasDoc(
        docWithGroups(
          [
            { id: "g1", label: "G1", g: "g2", members: ["n1"] },
            { id: "g2", label: "G2", g: "g1", members: [] },
          ],
          taskNode("n1", "A", 0, 0),
        ),
      ),
    ).toThrow(/group nesting cycle/);
    const legal = docWithGroups(
      [
        { id: "g2", label: "G2", members: [] },
        { id: "g1", label: "G1", g: "g2", members: ["n1"] },
      ],
      taskNode("n1", "A", 0, 0),
    );
    expect(parseCanvasDoc(JSON.parse(JSON.stringify(legal)))).toEqual(legal);
  });

  it("CANVAS-A15: INV-C5 - payload fields match the node type; round-trip is faithful", () => {
    expect(() =>
      parseCanvasDoc(
        docWith({ key: "a1", type: "annotation", title: "注", x: 0, y: 0, z: "root", text: "t", task: {} } as unknown as CanvasDoc["nodes"][number]),
      ),
    ).toThrow(/must not carry field "task"/);
    expect(() =>
      parseCanvasDoc(docWith({ ...taskNode("n1", "A", 0, 0), text: "hi" } as unknown as CanvasDoc["nodes"][number])),
    ).toThrow(/must not carry field "text"/);
    expect(() =>
      parseCanvasDoc(
        docWith({ key: "s1", type: "subflow", title: "S", x: 0, y: 0, z: "root", text: "hi" } as unknown as CanvasDoc["nodes"][number]),
      ),
    ).toThrow(/must not carry field "text"/);
    // The retired dependsOn payload field is an unknown task field now
    // (raw literal - docWith deliberately strips it while authoring).
    const rawDoc = JSON.parse(JSON.stringify(docWith(taskNode("n1", "A", 0, 0)))) as Record<string, unknown>;
    (rawDoc["nodes"] as Array<Record<string, unknown>>)[0]!["task"] = { dependsOn: [] };
    expect(() => parseCanvasDoc(rawDoc)).toThrow(/unknown node.task field "dependsOn"/);
    const doc = docWith(
      taskNode("n1", "A", 0, 0),
      { key: "a1", type: "annotation", title: "注", x: 1, y: 1, z: "root", text: "t" },
      { key: "s1", type: "subflow", title: "S", x: 2, y: 2, z: "root" },
    );
    expect(parseCanvasDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it("CANVAS-A16: INV-C6 - layout translates depth-2+ descendants with their root ancestor", () => {
    const doc = docWith(
      { key: "s1", type: "subflow", title: "S1", x: 500, y: 500, z: "root" },
      { key: "s2", type: "subflow", title: "S2", x: 520, y: 560, z: "s1" },
      taskNode("m", "M", 540, 620, "s2"),
    );
    const baseline = canvasCompile(doc);
    for (const layout of ["flow_lr", "flow_tb", "force", "compact"] as const) {
      const laid = canvasLayout(doc, layout);
      expect(canvasCompile(laid)).toEqual(baseline);
      const s1 = laid.nodes.find((node) => node.key === "s1")!;
      const d = { x: s1.x - 500, y: s1.y - 500 };
      const s2 = laid.nodes.find((node) => node.key === "s2")!;
      const m = laid.nodes.find((node) => node.key === "m")!;
      expect(s2.x - 520).toBe(d.x);
      expect(s2.y - 560).toBe(d.y);
      expect(m.x - 540).toBe(d.x);
      expect(m.y - 620).toBe(d.y);
    }
  });

  it("CANVAS-A17: serve endpoints fail closed on malformed ownership (400, zero events)", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      const before = eventCount(rig.store);
      const cyclic = docWith(
        { key: "s1", type: "subflow", title: "S1", x: 0, y: 0, z: "s2" },
        { key: "s2", type: "subflow", title: "S2", x: 0, y: 0, z: "s1" },
      );
      for (const path of ["/api/canvas/compile", "/api/canvas/layout", "/api/canvas/diff"]) {
        const rejected = await api(handle, path, {
          method: "POST",
          body: path === "/api/canvas/layout" ? { doc: JSON.parse(JSON.stringify(cyclic)), layout: "flow_lr" } : { doc: JSON.parse(JSON.stringify(cyclic)) },
        });
        expect(rejected.status).toBe(400);
      }
      const selfOwned = await api(handle, "/api/canvas/compile", {
        method: "POST",
        body: { doc: JSON.parse(JSON.stringify(docWith(taskNode("n1", "A", 0, 0, "n1")))) },
      });
      expect(selfOwned.status).toBe(400);
      const taskOwned = await api(handle, "/api/canvas/compile", {
        method: "POST",
        body: {
          doc: JSON.parse(
            JSON.stringify(docWith(taskNode("n1", "A", 0, 0), taskNode("n2", "B", 1, 1, "n1"))),
          ),
        },
      });
      expect(taskOwned.status).toBe(400);
      expect(eventCount(rig.store)).toBe(before);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  // PLMP-CANVAS-6/7 (23/32 号): stable graph identity - edges are edge
  // records between node keys, titles are display metadata; v3 is the
  // single format (v1/v2 rejected, explicit converter only).

  it("CANVAS-A18: renaming a title never breaks an edge; edge references fail closed", () => {
    const doc = docWith(
      taskNode("n1", "调研", 0, 0),
      { ...taskNode("n2", "综合", 10, 10), task: { dependsOn: ["n1"] } },
    );
    expect(doc.edges).toEqual([{ id: "e:test:1", source: "n1", target: "n2", kind: "data" }]);
    expect(canvasCompile(doc).tasks[1]!.dependsOn).toEqual(["调研"]);
    const renamed = docWith(
      taskNode("n1", "调研（改名）", 0, 0),
      { ...taskNode("n2", "综合", 10, 10), task: { dependsOn: ["n1"] } },
    );
    expect(canvasCompile(renamed).tasks[1]!.dependsOn).toEqual(["调研（改名）"]);
    // INV-D1: dangling edge source key.
    expect(() =>
      parseCanvasDoc(docWith({ ...taskNode("n3", "X", 0, 0), task: { dependsOn: ["ghost"] } })),
    ).toThrow(/unknown source "ghost"/);
    // INV-D2: edge targets must be task nodes.
    expect(() =>
      parseCanvasDoc(
        docWith(
          { key: "s1", type: "subflow", title: "S", x: 0, y: 0, z: "root" },
          { ...taskNode("n4", "X", 0, 0), task: { dependsOn: ["s1"] } },
        ),
      ),
    ).toThrow(/not a task/);
    // Self-loops are refused at the grammar level (same discipline as IR).
    expect(() =>
      parseCanvasDoc(docWith({ ...taskNode("n5", "X", 0, 0), task: { dependsOn: ["n5"] } })),
    ).toThrow(/to itself/);
    // v1 and v2 are retired formats - rejected everywhere, explicit
    // converter only.
    for (const version of [1, 2]) {
      const legacy = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
      legacy["version"] = version;
      delete legacy["identity"];
      delete legacy["edges"];
      expect(() => parseCanvasDoc(legacy as unknown as CanvasDoc)).toThrow(
        version === 2 ? /upgradeCanvasV2ToV3/ : /only format/,
      );
    }
  });

  it("CANVAS-A19: fragment insert remaps proposal title deps onto fresh keys, compile-equal", () => {
    const proposal: ProjectProposal = {
      goal: "g",
      changeClass: "behavior_change",
      tasks: [
        { title: "A", dependsOn: [] },
        { title: "B", dependsOn: ["A"], role: "tester" },
        { title: "C", dependsOn: ["A", "B"] },
      ],
    };
    const mixed = docWith(taskNode("n1", "已有", 0, 0), taskNode("n2", "已有二", 5, 5));
    const inserted = canvasInsertFragment(mixed, proposal);
    expect(inserted.nodes.map((node) => node.key)).toEqual(["n1", "n2", "n:test:1", "n:test:2", "n:test:3"]);
    const [a, b, c] = inserted.nodes.slice(2);
    expect("dependsOn" in (a!.task as unknown as object)).toBe(false);
    // Dependencies are edge records with fresh monotonic ids.
    expect(inserted.edges).toEqual([
      { id: "e:test:1", source: a!.key, target: b!.key, kind: "data" },
      { id: "e:test:2", source: a!.key, target: c!.key, kind: "data" },
      { id: "e:test:3", source: b!.key, target: c!.key, kind: "data" },
    ]);
    expect(inserted.identity).toEqual({ namespace: "test", nextNode: 4, nextEdge: 4 });
    const compiledInserted = canvasCompile(inserted).tasks;
    expect(compiledInserted.slice(2).map((task) => task.definitionId)).toEqual([
      "n:test:1",
      "n:test:2",
      "n:test:3",
    ]);
    expect(
      compiledInserted.slice(2).map(({ definitionId: _definitionId, ...rest }) => rest),
    ).toEqual(proposal.tasks);
    expect(compiledInserted.slice(0, 2).map((task) => task.title)).toEqual([
      "已有",
      "已有二",
    ]);
    // A fragment inserted into an empty doc compiles back to the proposal.
    const empty = canvasInsertFragment(emptyCanvasDoc(""), proposal);
    const emptyCompiled = canvasCompile(empty).tasks;
    expect(emptyCompiled.map((task) => task.definitionId)).toEqual(empty.nodes.map((node) => node.key));
    expect(emptyCompiled.map(({ definitionId: _definitionId, ...rest }) => rest)).toEqual(
      proposal.tasks,
    );
  });

  it("CANVAS-A20: cross-boundary key deps survive rename and layout in deep nesting", () => {
    const doc = docWith(
      taskNode("t0", "根前", 0, 0),
      { key: "s1", type: "subflow", title: "S1", x: 300, y: 300, z: "root" },
      { key: "s2", type: "subflow", title: "S2", x: 320, y: 360, z: "s1" },
      { ...taskNode("m", "深层", 340, 420, "s2"), task: { dependsOn: ["t0"] } },
      { ...taskNode("t1", "根后", 600, 0), task: { dependsOn: ["m"] } },
    );
    const baseline = canvasCompile(doc);
    expect(baseline.tasks.map((task) => task.dependsOn)).toEqual([[], ["根前"], ["深层"]]);
    const renamed = docWith(
      taskNode("t0", "根前（改）", 0, 0),
      { key: "s1", type: "subflow", title: "S1", x: 300, y: 300, z: "root" },
      { key: "s2", type: "subflow", title: "S2", x: 320, y: 360, z: "s1" },
      { ...taskNode("m", "深层（改）", 340, 420, "s2"), task: { dependsOn: ["t0"] } },
      { ...taskNode("t1", "根后", 600, 0), task: { dependsOn: ["m"] } },
    );
    const renamedProposal = canvasCompile(renamed);
    expect(renamedProposal.tasks[1]!.dependsOn).toEqual(["根前（改）"]);
    expect(renamedProposal.tasks[2]!.dependsOn).toEqual(["深层（改）"]);
    expect(validateProjectProposal(renamedProposal)).toEqual([]);
    for (const layout of ["flow_lr", "flow_tb", "force", "compact"] as const) {
      expect(canvasCompile(canvasLayout(doc, layout))).toEqual(baseline);
    }
  });

  it("CANVAS-A21: serve keeps v3 behavior and refuses legacy docs at the gate", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      const before = eventCount(rig.store);
      const compiled = await api(handle, "/api/canvas/compile", {
        method: "POST",
        body: {
          doc: JSON.parse(
            JSON.stringify(
              docWith(taskNode("n1", "调研", 0, 0), { ...taskNode("n2", "综合", 10, 10), task: { dependsOn: ["n1"] } }),
            ),
          ),
        },
      });
      expect(compiled.status).toBe(200);
      expect((compiled.json.proposal as Json).tasks).toEqual([
        { title: "调研", dependsOn: [], definitionId: "n1" },
        { title: "综合", dependsOn: ["调研"], definitionId: "n2" },
      ]);
      const v2 = await api(handle, "/api/canvas/compile", {
        method: "POST",
        body: {
          doc: { version: 2, goal: "g", nodes: [], groups: [] },
        },
      });
      expect(v2.status).toBe(400);
      expect(((v2.json.error as string) ?? "")).toMatch(/upgradeCanvasV2ToV3/);
      expect(eventCount(rig.store)).toBe(before);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  // PLMP-CANVAS-7 (32 号, G9-D): the explicit v2→v3 converter - node keys
  // preserved verbatim (definition lineage), dependsOn flattened to edges,
  // node.g folded into members.

  it("CANVAS-V3-MIG: upgradeCanvasV2ToV3 preserves node keys, folds g, flattens edges", () => {
    const v2 = {
      version: 2,
      goal: "老目标",
      nodes: [
        { key: "n1", type: "task", title: "调研", x: 1, y: 2, z: "root", g: "G1", task: { dependsOn: [] } },
        { key: "n2", type: "task", title: "综合", x: 3, y: 4, z: "root", task: { dependsOn: ["n1"] } },
        { key: "n17", type: "subflow", title: "子图", x: 5, y: 6, z: "root" },
        {
          key: "m",
          type: "task",
          title: "成员",
          x: 7,
          y: 8,
          z: "n17",
          g: "G1",
          task: { dependsOn: ["n1", "n2"], role: "scout" },
        },
      ],
      groups: [{ id: "G1", label: "框", members: [] }],
    };
    const v3 = upgradeCanvasV2ToV3(v2, "abc123def456");
    // V3-MIG-A01: every legacy key survives verbatim.
    expect(v3.nodes.map((node) => node.key)).toEqual(["n1", "n2", "n17", "m"]);
    // Edges flatten in node declaration × dependency order, deterministic ids.
    expect(v3.edges).toEqual([
      { id: "e:abc123def456:1", source: "n1", target: "n2", kind: "data" },
      { id: "e:abc123def456:2", source: "n1", target: "m", kind: "data" },
      { id: "e:abc123def456:3", source: "n2", target: "m", kind: "data" },
    ]);
    // node.g folded into members (the single membership truth); node.g gone.
    expect(v3.groups).toEqual([{ id: "G1", label: "框", members: ["n1", "m"] }]);
    expect(v3.nodes[0] && "g" in v3.nodes[0]).toBe(false);
    expect("dependsOn" in (v3.nodes[0]!.task as unknown as object)).toBe(false);
    expect(v3.nodes[3]?.task?.role).toBe("scout");
    expect(v3.goal).toBe("老目标");
    // The upgraded doc parses clean and the identity counters sit at the
    // family floor.
    expect(parseCanvasDoc(JSON.parse(JSON.stringify(v3)))).toEqual(v3);
    expect(v3.identity).toEqual({ namespace: "abc123def456", nextNode: 1, nextEdge: 4 });
    // V3-MIG-A02: fresh allocations can never collide with preserved keys.
    const proposal: ProjectProposal = { goal: "x", changeClass: "behavior_change", tasks: [{ title: "新", dependsOn: [] }] };
    const inserted = canvasInsertFragment(v3, proposal);
    expect(inserted.nodes[4]!.key).toBe("n:abc123def456:1");
    expect(inserted.nodes.map((node) => node.key).slice(0, 4)).toEqual(["n1", "n2", "n17", "m"]);
    // Fail-closed: malformed v2 is refused by the converter too.
    expect(() => upgradeCanvasV2ToV3({ ...v2, nodes: "nope" }, "abc123def456")).toThrow(/nodes must be an array/);
    expect(() => upgradeCanvasV2ToV3(v2, "bad:ns")).toThrow(/identity\.namespace/);
  });
});
