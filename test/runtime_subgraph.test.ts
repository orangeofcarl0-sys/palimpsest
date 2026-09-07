import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseAgentGraph,
  compileAgentGraph,
  agentGraphCapabilities,
  applyGraphPatch,
  EMPTY_PATCH,
  type AgentGraph,
} from "../src/graph/index.js";
import {
  canvasCompile,
  liftToAgentGraph,
  parseCanvasDoc,
  unloadToCanvasDoc,
  type CanvasDoc,
} from "../src/canvas/index.js";
import { proposalTaskSpecs, validateProjectProposal } from "../src/architecture/index.js";
import { canonicalJsonBytes } from "../src/schema/canonical.js";
import type { TaskSpec } from "../src/schema/index.js";
import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function docWith(...nodes: CanvasDoc["nodes"]): CanvasDoc {
  return { version: 2, goal: "g", nodes, groups: [] };
}

function task(key: string) {
  return { key, type: "task" as const, title: "T", x: 0, y: 0, z: "root", task: { dependsOn: [] } };
}

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-scope-")), "ops.sqlite"),
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

async function api(handle: ServeHandle, path: string): Promise<{ status: number; json: any }> {
  const response = await fetch(`${handle.url}${path}`, {
    headers: { authorization: `Bearer ${handle.token}` },
  });
  return { status: response.status, json: (await response.json()) as any };
}

describe("runtime subgraph (PLMP-GRAPH-3)", () => {
  it("RSUB-A01: mode parses only on subflow/subgraph, only as runtime; round-trips", () => {
    const doc = parseCanvasDoc(
      docWith(
        { key: "s1", type: "subflow", title: "运行时子图", x: 0, y: 0, z: "root", mode: "runtime" },
        { key: "m", type: "task", title: "成员", x: 0, y: 0, z: "s1", task: { dependsOn: [] } },
      ),
    );
    expect(doc.nodes[0]!.mode).toBe("runtime");
    expect(JSON.parse(JSON.stringify(doc)).nodes[0].mode).toBe("runtime");
    expect(() =>
      parseCanvasDoc(docWith({ ...task("n1"), mode: "runtime" } as CanvasDoc["nodes"][number])),
    ).toThrow(/must not carry field "mode"/);
    expect(() =>
      parseCanvasDoc(
        docWith({
          key: "s2",
          type: "subflow",
          title: "坏值",
          x: 0,
          y: 0,
          z: "root",
          mode: "editorial",
        } as unknown as CanvasDoc["nodes"][number]),
      ),
    ).toThrow(/mode must be "runtime"/);
    // IR: mode only on subgraph.
    const graph: AgentGraph = {
      version: 1,
      goal: "g",
      nodes: [
        { id: "s", kind: "subgraph", label: "S", scope: "root", mode: "runtime" },
        { id: "m", kind: "agent", label: "M", scope: "s", task: {} },
      ],
      edges: [],
    };
    expect(parseAgentGraph(JSON.parse(JSON.stringify(graph))).nodes[0]!.mode).toBe("runtime");
    expect(() =>
      parseAgentGraph({
        ...graph,
        nodes: [{ id: "x", kind: "agent", label: "X", scope: "root", mode: "runtime", task: {} }],
      }),
    ).toThrow(/must not carry field "mode"/);
  });

  it("RSUB-A02: compile attributes members to the nearest runtime ancestor; absent means absent", () => {
    const doc = parseCanvasDoc(
      docWith(
        { key: "rt", type: "subflow", title: "运行时", x: 0, y: 0, z: "root", mode: "runtime" },
        { key: "ed", type: "subflow", title: "编辑期", x: 0, y: 0, z: "rt" },
        { key: "m1", type: "task", title: "成员一", x: 0, y: 0, z: "ed", task: { dependsOn: [] } },
        { key: "m2", type: "task", title: "成员二", x: 0, y: 0, z: "rt", task: { dependsOn: ["m1"] } },
        { key: "out", type: "task", title: "外部", x: 0, y: 0, z: "root", task: { dependsOn: ["m2"] } },
        { key: "free", type: "task", title: "无主", x: 0, y: 0, z: "root", task: { dependsOn: [] } },
      ),
    );
    const proposal = canvasCompile(doc);
    const byTitle = new Map(proposal.tasks.map((task) => [task.title, task]));
    // Editorial subflow inside a runtime one does not change attribution.
    expect(byTitle.get("成员一")!.scopeId).toBe("rt");
    expect(byTitle.get("成员二")!.scopeId).toBe("rt");
    expect(byTitle.get("外部")!.scopeId).toBeUndefined();
    expect(byTitle.get("无主")!.scopeId).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(byTitle.get("外部")!, "scopeId")).toBe(false);
    expect(validateProjectProposal(proposal)).toEqual([]);
    const graph = liftToAgentGraph(doc);
    expect(agentGraphCapabilities(graph)).toEqual([]);
    expect(compileAgentGraph(graph)).toEqual(proposal);
  });

  it("RSUB-A03: scope_id rides TaskProposal→TaskSpec; scope-less spec digest unchanged", () => {
    const scoped = proposalTaskSpecs({
      goal: "g",
      changeClass: "behavior_change",
      tasks: [
        { title: "A", dependsOn: [], scopeId: "rt" },
        { title: "B", dependsOn: ["A"] },
      ],
    });
    expect(scoped[0]!.scope_id).toBe("rt");
    expect(Object.hasOwn(scoped[1] as object, "scope_id")).toBe(false);
    const parsed: TaskSpec = JSON.parse(JSON.stringify(scoped[1]));
    expect(parsed.scope_id).toBeUndefined();
    // Golden: a scope-less TaskSpec canonicalizes exactly as before the field existed.
    const legacy: TaskSpec = {
      task_id: "task-1",
      objective: "调研",
      depends_on: [],
      write_paths: ["r.md"],
      required_artifacts: [],
    };
    expect(new TextDecoder().decode(canonicalJsonBytes(legacy))).toBe(
      '{"depends_on":[],"objective":"调研","required_artifacts":[],"task_id":"task-1","write_paths":["r.md"]}',
    );
    const withScope: TaskSpec = { ...legacy, scope_id: "rt" };
    expect(new TextDecoder().decode(canonicalJsonBytes(withScope))).toBe(
      '{"depends_on":[],"objective":"调研","required_artifacts":[],"scope_id":"rt","task_id":"task-1","write_paths":["r.md"]}',
    );
  });

  it("RSUB-A04: the live projection carries scopeId only for scoped tasks", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [
          {
            task_id: "task-1",
            objective: "在域",
            depends_on: [],
            write_paths: ["r.md"],
            required_artifacts: [],
            scope_id: "rt",
          },
          {
            task_id: "task-2",
            objective: "无域",
            depends_on: [],
            write_paths: [],
            required_artifacts: [],
          },
        ],
      });
      const { json } = await api(handle, "/api/graph");
      const tasks = json.graph.tasks as Array<Record<string, unknown>>;
      const scoped = tasks.find((task) => task.taskId === "task-1")!;
      const free = tasks.find((task) => task.taskId === "task-2")!;
      expect(scoped.scopeId).toBe("rt");
      expect(Object.prototype.hasOwnProperty.call(free, "scopeId")).toBe(false);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("RSUB-A05: the patch path can build a runtime subgraph that compiles with scopes", () => {
    const base = liftToAgentGraph(
      parseCanvasDoc(docWith({ key: "a", type: "task", title: "已有", x: 0, y: 0, z: "root", task: { dependsOn: [] } })),
    );
    const patched = applyGraphPatch(base, {
      ...EMPTY_PATCH,
      addNodes: [
        { id: "rt", kind: "subgraph", label: "研究组", scope: "root", mode: "runtime" },
        { id: "m", kind: "agent", label: "组员", scope: "rt", task: {} },
      ],
      addEdges: [{ id: "pe1", source: "a", target: "m", kind: "data" }],
    });
    const doc = unloadToCanvasDoc(patched);
    expect(doc.nodes.find((node) => node.key === "rt")!.mode).toBe("runtime");
    const proposal = canvasCompile(doc);
    expect(proposal.tasks.find((task) => task.title === "组员")!.scopeId).toBe("rt");
    expect(proposal.tasks.find((task) => task.title === "已有")!.scopeId).toBeUndefined();
  });
});
