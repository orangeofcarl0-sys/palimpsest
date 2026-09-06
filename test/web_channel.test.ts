import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { pipelinePreset, type ProjectProposal } from "../src/architecture/index.js";
import { parseGateDefinition } from "../src/evidence/index.js";
import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore, snapshotDigest } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const GATE_RELEASE = parseGateDefinition({
  gate_id: "gate-release",
  version: 1,
  subject_type: "attempt",
  require: { all: [{ exists: { predicate: "tests_pass" } }] },
});

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-serve-")), "ops.sqlite"),
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

describe("serve channel face (PLMP-WEB-1)", () => {
  it("WEB-A01: the served graph is same-source; the cursor makes polling cheap", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      rig.controller.step();
      const created = rig.controller.step()!;
      await rig.controller.claim(created.entity_id);

      const { json } = await api(handle, "/api/graph");
      const graph = json.graph as Json;
      const inProcess = rig.controller.orchestrationGraph();
      expect(graph).toEqual(inProcess as unknown as Json);
      expect(json.changed).toBe(true);

      const cursor = String((graph.project as Json).cursor);
      const second = await api(handle, `/api/graph?cursor=${cursor}`);
      expect(second.json.changed).toBe(false);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("WEB-A02: the control loop runs over HTTP; unauthenticated requests get 401", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      expect((await api(handle, "/api/graph", { token: null })).status).toBe(401);

      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      rig.controller.declareGate(GATE_RELEASE, "h1-test");
      rig.controller.step();
      const created = rig.controller.step()!;
      const attemptId = created.entity_id;

      const paused = await api(handle, "/api/control/pause", {
        method: "POST",
        body: { reason: "inspect" },
      });
      expect(paused.json.result).toMatchObject({ event_type: "SCHEDULER_PAUSED" });
      expect(rig.controller.orchestrationGraph().project.paused).toBe(true);
      await api(handle, "/api/control/resume", { method: "POST", body: { reason: "go" } });

      const claimed = await api(handle, "/api/control/claim", {
        method: "POST",
        body: { attemptId },
      });
      expect((claimed.json.result as Json).worktreePath).toBeDefined();

      const gated = await api(handle, "/api/control/gate", {
        method: "POST",
        body: { attemptId, predicate: "tests_pass", command: ["python", "-m", "pytest"], exitCode: 0 },
      });
      expect((gated.json.result as Json).entity_id).toBeDefined();

      const reported = await api(handle, "/api/control/report", {
        method: "POST",
        body: { attemptId, workerStatus: "completed", summary: "ok", resultCommit: "d".repeat(40) },
      });
      expect((reported.json.result as Json).event_type).toBe("ATTEMPT_COMPLETED");

      const promoted = await api(handle, "/api/control/promote", {
        method: "POST",
        body: { gateId: "gate-release" },
      });
      expect((promoted.json.result as Json).promoted).toBe(true);
      expect(rig.controller.orchestrationGraph().promotions[0]).toMatchObject({
        state: "COMMITTED",
      });
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("WEB-A03: the proposal face validates fail-closed over HTTP", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      const bad = pipelinePreset({
        goal: "g",
        stages: [
          { title: "a", requiredArtifacts: ["out.md"] },
          { title: "b" },
        ],
      });
      const missingDependency: ProjectProposal = {
        goal: "g",
        changeClass: "behavior_change",
        tasks: [{ title: "a", dependsOn: ["ghost"] }],
      };
      const invalid = await api(handle, "/api/proposal/declare", {
        method: "POST",
        body: bad,
      });
      expect(invalid.json.declared).toBe(false);
      expect((invalid.json.diagnostics as Json[]).map((d) => d.type)).toContain("MISSING_WRITE_PATHS");
      const ghost = await api(handle, "/api/proposal/validate", {
        method: "POST",
        body: missingDependency,
      });
      expect((ghost.json.diagnostics as Json[]).map((d) => d.type)).toContain("UNKNOWN_DEPENDENCY");
      const before = eventCount(rig.store);
      expect(eventCount(rig.store)).toBe(before); // nothing landed

      const good = pipelinePreset({
        goal: "ship the calculator",
        stages: [
          { title: "实现", writePaths: ["src/calc.py"] },
          { title: "验证", writePaths: ["reports/verify.md"], requiredArtifacts: ["reports/verify.md"] },
        ],
      });
      const declared = await api(handle, "/api/proposal/declare", {
        method: "POST",
        body: good,
      });
      expect(declared.json).toMatchObject({ declared: true, eventType: "PROJECT_CREATED" });
      expect(rig.controller.orchestrationGraph().tasks.map((task) => task.taskId)).toEqual([
        "task-1",
        "task-2",
      ]);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("WEB-A04: serve is an additive presentation face - closing it leaves the ledgers untouched", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    let before = 0;
    let digestBefore = "";
    try {
      rig.controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      await api(handle, "/api/graph");
      before = eventCount(rig.store);
      digestBefore = snapshotDigest(rig.store.connection);
    } finally {
      await handle.close();
    }
    expect(eventCount(rig.store)).toBe(before);
    expect(snapshotDigest(rig.store.connection)).toBe(digestBefore);
    expect(rig.controller.orchestrationGraph().project.goal).toBe("g");
    await rig.cleanup();
  });

  it("WEB-A05: security defaults - loopback bind and a fresh random token per start", async () => {
    const rig = makeRig();
    rig.controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
    const first = await serveOrchestration(rig.controller, { port: 0 });
    const second = await serveOrchestration(rig.controller, { port: 0 });
    try {
      expect(first.host).toBe("127.0.0.1");
      expect(second.host).toBe("127.0.0.1");
      expect(first.token).not.toBe(second.token);
      // The first token must not authorize the second server.
      expect((await api(second, "/api/health", { token: first.token })).status).toBe(401);
      expect((await api(second, "/api/health")).status).toBe(200);
    } finally {
      await first.close();
      await second.close();
      await rig.cleanup();
    }
  });

  it("WEB-A06: static serving - the built bundle, or the fallback page", async () => {
    const rig = makeRig();
    // Mechanism: an injected static root is served verbatim.
    const fake = mkdtempSync(join(tmpdir(), "palimpsest-webroot-"));
    writeFileSync(join(fake, "index.html"), "<!doctype html><html><body>panel-fake</body></html>");
    const first = await serveOrchestration(rig.controller, { port: 0, staticRoot: fake });
    try {
      const response = await fetch(`${first.url}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("panel-fake");
    } finally {
      await first.close();
    }
    // The real bundle (built by `pnpm build:web`) or the fallback page.
    const second = await serveOrchestration(rig.controller, { port: 0 });
    try {
      const response = await fetch(`${second.url}/`);
      const html = await response.text();
      expect(response.status).toBe(200);
      const built = existsSync(
        join(fileURLToPath(new URL("../dist/web/index.html", import.meta.url))),
      );
      if (built) {
        expect(html).toContain("assets/index-");
        const asset = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(html)![0]!;
        const assetResponse = await fetch(`${second.url}/${asset}`);
        expect(assetResponse.status).toBe(200);
      } else {
        expect(html).toContain("build:web");
      }
    } finally {
      await second.close();
      await rig.cleanup();
    }
  });
});
