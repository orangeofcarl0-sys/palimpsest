import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import type { TaskSpec } from "../src/schema/index.js";

import { FakeClock, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-runtime-")), "ops.sqlite"),
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

function scopeTask(taskId: string, role: string, scopeId?: string): TaskSpec {
  return {
    task_id: taskId,
    objective: `Complete ${taskId}.`,
    depends_on: [],
    write_paths: [`src/${taskId}.py`],
    required_artifacts: [`src/${taskId}.py`],
    role,
    ...(scopeId === undefined ? {} : { scope_id: scopeId }),
  };
}

async function api(handle: ServeHandle, path: string, init?: { method?: string }): Promise<{ status: number; json: any }> {
  const response = await fetch(`${handle.url}${path}`, {
    method: init?.method ?? "GET",
    headers: { authorization: `Bearer ${handle.token}` },
  });
  return { status: response.status, json: (await response.json()) as any };
}

describe("unified runtime graph (PLMP-RUNTIME-1)", () => {
  it("RUNTIME-A01: one lineage across the definition/runtime/trace projections", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [scopeTask("task-1", "scout", "rt")],
      });
      rig.controller.step();
      rig.controller.step();
      const { json } = await api(handle, "/api/graph");
      const graph = json.graph as any;
      const runtime = graph.runtime;
      // The ephemeral instance face: identity, scope, origin, createdAt.
      expect(runtime.satellites).toHaveLength(1);
      const satellite = runtime.satellites[0];
      const definitionTask = graph.tasks.find((t: any) => t.taskId === "task-1");
      expect(satellite.attemptId).toBeTruthy();
      expect(satellite.taskId).toBe("task-1");
      expect(satellite.taskTitle).toBe("Complete task-1.");
      expect(satellite.scopeId).toBe("rt");
      expect(satellite.origin).toBe("scheduler-activation");
      // createdAt is the first timeline event of the same attempt.
      expect(satellite.createdAt).toBe(definitionTask.attempts[0].timeline[0].at);
      // The trace face carries the same identity.
      expect(runtime.traces).toHaveLength(1);
      expect(runtime.traces[0].attemptId).toBe(satellite.attemptId);
      expect(runtime.traces[0].scopeId).toBe("rt");
      // The definition face carries the same attempt in its timeline.
      expect(definitionTask.attempts[0].attemptId).toBe(satellite.attemptId);
      // The capacity view rides the declared role table.
      expect(runtime.roleOccupancy).toEqual([
        { role: "analyst", occupied: 0, slots: 2 },
        { role: "implementer", occupied: 0, slots: 2 },
        { role: "scout", occupied: 1, slots: 2 },
        { role: "tester", occupied: 0, slots: 1 },
        { role: "verifier", occupied: 0, slots: 1 },
      ]);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("RUNTIME-A02: the runtime node is deterministic and cursor-gated", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [scopeTask("task-1", "implementer")],
      });
      rig.controller.step();
      const first = (await api(handle, "/api/graph")).json.graph.runtime;
      const second = (await api(handle, "/api/graph")).json.graph.runtime;
      expect(first).toEqual(second);
      const cursor = (await api(handle, "/api/graph")).json.graph.project.cursor;
      const gated = await api(handle, `/api/graph?cursor=${cursor}`);
      expect(gated.json.changed).toBe(false);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("RUNTIME-A03: the derive face is retired; term isolation still gates the graph payload", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [scopeTask("task-1", "implementer")],
      });
      const retired = await api(handle, "/api/canvas/derive", { method: "POST" });
      expect(retired.status).toBe(404);
      const body = JSON.stringify((await api(handle, "/api/graph")).json);
      expect(body).not.toContain("event_id");
      expect(body).not.toContain("previous_event_digest");
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });
});
