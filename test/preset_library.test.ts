import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  pipelinePreset,
  presetDraft,
  presetMeta,
  PRESETS,
  proposalTaskSpecs,
  validateProjectProposal,
} from "../src/architecture/index.js";
import { parseGateDefinition } from "../src/evidence/index.js";
import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { DEFAULT_ROLE_SLOTS, ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const VERIFIED_GATE = parseGateDefinition({
  gate_id: "verified",
  version: 1,
  subject_type: "attempt",
  require: { all: [{ exists: { predicate: "tests_pass" } }] },
});

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-preset-")), "ops.sqlite"),
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

describe("preset library (PLMP-ARCH-3)", () => {
  it("PRE-A01: registry complete - six presets whose default params validate clean", () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual([
      "pipeline",
      "fan_out",
      "hierarchy",
      "panel",
      "verified_dag",
      "research_loop",
    ]);
    for (const preset of PRESETS) {
      expect(preset.label.trim()).not.toBe("");
      expect(preset.lineage.trim()).not.toBe("");
      // PLMP-UAS-0 UA-INV-8/9: every preset is honestly labeled a topology
      // prototype (approximate fidelity), never native equivalence.
      expect(preset.fidelity).toBe("topology_prototype");
      expect(preset.paramSpec.length).toBeGreaterThan(0);
      const proposal = preset.build({});
      expect(proposal.goal).toBe("新目标");
      expect(proposal.changeClass).toBe("behavior_change");
      expect(validateProjectProposal(proposal)).toEqual([]);
    }
    expect(presetMeta()).toHaveLength(6);
    expect(Object.hasOwn(presetMeta()[0] as object, "build")).toBe(false);
  });

  it("PRE-A02: fan_out - workers parallel, synthesis depends on all, roles scout/analyst", () => {
    const proposal = presetDraft("fan_out", {
      goal: "g",
      workers: [{ title: "w1" }, { title: "w2" }, { title: "w3" }],
    });
    const specs = proposalTaskSpecs(proposal);
    expect(specs.map((spec) => spec.objective)).toEqual(["w1", "w2", "w3", "综合"]);
    for (const spec of specs.slice(0, 3)) {
      expect(spec.depends_on).toEqual([]);
      expect(spec.role).toBe("scout");
    }
    const synthesis = specs[3]!;
    expect(synthesis.depends_on).toEqual(["task-1", "task-2", "task-3"]);
    expect(synthesis.role).toBe("analyst");
  });

  it("PRE-A03: hierarchy - research parallel, then writing, then editing", () => {
    const proposal = presetDraft("hierarchy", {
      goal: "g",
      research: [{ title: "r1" }, { title: "r2" }],
    });
    const specs = proposalTaskSpecs(proposal);
    expect(specs.map((spec) => spec.objective)).toEqual(["r1", "r2", "撰写", "编辑"]);
    expect(specs[0]!.role).toBe("scout");
    expect(specs[1]!.role).toBe("scout");
    const writing = specs[2]!;
    expect(writing.role).toBe("implementer");
    expect(writing.depends_on).toEqual(["task-1", "task-2"]);
    const editing = specs[3]!;
    expect(editing.role).toBe("analyst");
    expect(editing.depends_on).toEqual(["task-3"]);
  });

  it("PRE-A04: panel - same-question candidates parallel, synthesis depends on all", () => {
    const proposal = presetDraft("panel", {});
    expect(proposal.tasks.map((task) => task.title)).toEqual(["方案 A", "方案 B", "合成评审"]);
    for (const task of proposal.tasks.slice(0, 2)) {
      expect(task.dependsOn).toEqual([]);
      expect(task.role).toBe("analyst");
    }
    const synthesis = proposal.tasks[2]!;
    expect(synthesis.dependsOn).toEqual(["方案 A", "方案 B"]);
    const four = presetDraft("panel", { goal: "g", candidates: 4 });
    expect(four.tasks).toHaveLength(5);
    expect(() => presetDraft("panel", { candidates: 0 })).toThrow(/candidates/);
    expect(() => presetDraft("panel", { candidates: 5 })).toThrow(/candidates/);
    expect(() => presetDraft("panel", { candidates: 1.5 })).toThrow(/candidates/);
  });

  it("PRE-A05: verified_dag - unit deps pass through, shared validator flags bad refs", () => {
    const proposal = presetDraft("verified_dag", {
      goal: "g",
      units: [{ title: "u1" }, { title: "u2", dependsOn: ["u1"] }, { title: "u3", dependsOn: ["ghost"] }],
    });
    expect(proposal.tasks.map((task) => task.title)).toEqual(["u1", "u2", "u3", "终审"]);
    expect(proposal.tasks[1]!.dependsOn).toEqual(["u1"]);
    const review = proposal.tasks[3]!;
    expect(review.dependsOn).toEqual(["u1", "u2", "u3"]);
    expect(review.role).toBe("verifier");
    expect(validateProjectProposal(proposal)).toContainEqual(
      expect.objectContaining({ type: "UNKNOWN_DEPENDENCY", task: "u3" }),
    );
  });

  it("PRE-A06: research_loop - plan, parallel evidence, verify gate, synthesis", () => {
    const proposal = presetDraft("research_loop", {});
    const specs = proposalTaskSpecs(proposal);
    expect(specs.map((spec) => spec.objective)).toEqual([
      "研究计划",
      "取证 A",
      "取证 B",
      "核验",
      "综合",
    ]);
    expect(specs.map((spec) => spec.role)).toEqual([
      "analyst",
      "scout",
      "scout",
      "verifier",
      "implementer",
    ]);
    expect(specs[1]!.depends_on).toEqual(["task-1"]);
    expect(specs[2]!.depends_on).toEqual(["task-1"]);
    expect(specs[3]!.depends_on).toEqual(["task-2", "task-3"]);
    expect(specs[4]!.depends_on).toEqual(["task-4"]);
  });

  it("PRE-A07: every preset role stays inside the genesis declared table", () => {
    const declared = new Set(Object.keys(DEFAULT_ROLE_SLOTS));
    for (const preset of PRESETS) {
      for (const task of preset.build({}).tasks) {
        if (task.role !== undefined) expect(declared.has(task.role)).toBe(true);
      }
    }
  });

  it("PRE-A08: serve endpoints - metadata, pure-derivation drafts, auth and errors", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      const listed = await api(handle, "/api/presets");
      expect(listed.status).toBe(200);
      expect((listed.json.presets as Json[]).map((preset) => preset.id)).toHaveLength(6);
      const unauthed = await api(handle, "/api/presets", { token: null });
      expect(unauthed.status).toBe(401);

      const before = eventCount(rig.store);
      const draft = await api(handle, "/api/preset/fan_out/draft", { method: "POST", body: {} });
      expect(draft.status).toBe(200);
      const proposal = draft.json.proposal as never;
      expect(validateProjectProposal(proposal)).toEqual([]);
      expect(eventCount(rig.store)).toBe(before);

      const unknown = await api(handle, "/api/preset/nope/draft", { method: "POST", body: {} });
      expect(unknown.status).toBe(400);
      expect(String(unknown.json.error)).toContain("unknown preset");
      const badParams = await api(handle, "/api/preset/panel/draft", {
        method: "POST",
        body: { candidates: 9 },
      });
      expect(badParams.status).toBe(400);
      const notADraft = await api(handle, "/api/preset/panel", { method: "POST", body: {} });
      expect(notADraft.status).toBe(404);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("PRE-A09: serve validation carries the project's declared gates - same verdict as the CLI", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      const advised = presetDraft("verified_dag", {
        goal: "g",
        units: [{ title: "u1", gateId: "verified" }],
      });
      const undeclared = await api(handle, "/api/proposal/validate", {
        method: "POST",
        body: advised,
      });
      expect(undeclared.json.diagnostics).toContainEqual(
        expect.objectContaining({ type: "UNKNOWN_GATE", task: "u1" }),
      );
      rig.controller.declareGate(VERIFIED_GATE, "test");
      const declared = await api(handle, "/api/proposal/validate", {
        method: "POST",
        body: advised,
      });
      expect(declared.json.diagnostics).toEqual([]);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("PRE-A10: the registry pipeline entry matches pipelinePreset exactly", () => {
    const stages = [{ title: "a", writePaths: ["src/x"] }, { title: "b", gateId: "verified" }];
    expect(presetDraft("pipeline", { goal: "g", stages })).toEqual(
      pipelinePreset({ goal: "g", stages }),
    );
  });
});
