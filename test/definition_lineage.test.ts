/**
 * PLMP-GRAPH-4 (30 号规格): canonical definition identity. The authoring
 * node id (canvas key / AgentGraph node id) survives declaration as the
 * definition identity and rides the whole lineage; task_id remains the
 * runtime entity id. Legacy (spec-first) projects keep byte-identical
 * behavior with the field absent.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canvasCompile, parseCanvasDoc } from "../src/canvas/index.js";
import { proposalTaskSpecs, validateProjectProposal } from "../src/architecture/index.js";
import { canonicalDigest, parseTaskSpec } from "../src/schema/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { makeProject, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);

async function lineageRig() {
  const store = new EventStore(join(mkdtempSync(join(tmpdir(), "palimpsest-id-")), "p.db"), {
    clock: (() => {
      let s = 0;
      return () => new Date(Date.UTC(2026, 8, 7, 0, 0, s++)).toISOString();
    })(),
  });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-id-")), "ops.sqlite"),
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
  return { controller, cleanup: () => Promise.all([effects.close(), store.close()]) };
}

describe("definition identity lineage (PLMP-GRAPH-4)", () => {
  it("ID-A01: the canvas node id survives declaration as the definition identity", async () => {
    const doc = parseCanvasDoc({
      version: 2,
      goal: "g",
      nodes: [
        { key: "n17", type: "task", title: "Research", x: 0, y: 0, z: "root", task: { dependsOn: [] } },
        { key: "n18", type: "task", title: "Write", x: 10, y: 0, z: "root", task: { dependsOn: ["n17"] } },
      ],
      groups: [],
    });
    const proposal = canvasCompile(doc);
    expect(proposal.tasks.map((task) => task.definitionId)).toEqual(["n17", "n18"]);
    const specs = proposalTaskSpecs(proposal);
    expect(specs.map((spec) => spec.definition_id)).toEqual(["n17", "n18"]);
    // task_id stays the runtime entity id: declaration order, not node id.
    expect(specs.map((spec) => spec.task_id)).toEqual(["task-1", "task-2"]);

    const rig = await lineageRig();
    const { controller, cleanup } = rig;
    controller.start({
      projectId: "scheduler-project",
      goal: "g",
      tasks: specs.map((spec) => ({ ...taskSpec(spec.task_id, spec.depends_on), ...spec })),
    });
    try {
      const graph = controller.orchestrationGraph();
      expect(graph.tasks.map((task) => task.definitionId)).toEqual(["n17", "n18"]);
      // Activate task-1 and check the runtime lineage triple on every face.
      // Two ticks: TASK_STARTED (activation), then ATTEMPT_CREATED (batch).
      expect(controller.scheduler.runOnce()?.event_type).toBe("TASK_STARTED");
      expect(controller.scheduler.runOnce()?.event_type).toBe("ATTEMPT_CREATED");
      const after = controller.orchestrationGraph();
      const attempt = after.tasks[0]!.attempts[0]!;
      const satellite = after.runtime?.satellites.find((row) => row.attemptId === attempt.attemptId);
      expect(satellite).toMatchObject({ taskId: "task-1", definitionId: "n17" });
      const trace = after.runtime?.traces.find((row) => row.attemptId === attempt.attemptId);
      expect(trace?.definitionId).toBe("n17");
    } finally {
      await cleanup();
    }
  });

  it("ID-A02: spec-first proposals keep the field absent - digest byte-identical, parse key-free", () => {
    const legacyProposal = {
      goal: "g",
      changeClass: "behavior_change" as const,
      tasks: [{ title: "A", dependsOn: [], role: "tester" }],
    };
    const [spec] = proposalTaskSpecs(legacyProposal);
    expect(spec).toBeDefined();
    const legacySpec = spec!;
    expect(Object.hasOwn(legacySpec, "definition_id")).toBe(false);
    // Round-trip through the contract parser keeps the key absent.
    const parsed = parseTaskSpec(JSON.parse(JSON.stringify(legacySpec)));
    expect(Object.hasOwn(parsed, "definition_id")).toBe(false);
    // Golden byte assertion: the absent field digests identically to the
    // legacy canonical form (hand-written without the key).
    const legacyJson = {
      task_id: "task-1",
      objective: "A",
      depends_on: [],
      write_paths: [],
      required_artifacts: [],
      role: "tester",
    };
    expect(Object.keys(legacyJson).sort()).toEqual(Object.keys(legacySpec).sort());
    expect(canonicalDigest(legacySpec)).toBe(canonicalDigest(legacyJson));
    // And a set definition_id genuinely enters the canonical form (on-chain,
    // not dropped): present vs absent digest differently.
    const withDefinition = { ...legacySpec, definition_id: "n17" };
    expect(canonicalDigest(withDefinition)).not.toBe(canonicalDigest(legacySpec));
    expect(canonicalDigest(makeProject([withDefinition]))).not.toBe(
      canonicalDigest(makeProject([legacySpec])),
    );
    void legacyProposal;
  });

  it("ID-A03: two tasks may not claim the same definition identity", () => {
    const conflicting = {
      goal: "g",
      changeClass: "behavior_change" as const,
      tasks: [
        { title: "A", dependsOn: [], definitionId: "n1" },
        { title: "B", dependsOn: ["A"], definitionId: "n1" },
      ],
    };
    expect(validateProjectProposal(conflicting).map((diagnostic) => diagnostic.type)).toEqual([
      "DUPLICATE_DEFINITION_ID",
    ]);
    const distinct = {
      goal: "g",
      changeClass: "behavior_change" as const,
      tasks: [
        { title: "A", dependsOn: [], definitionId: "n1" },
        { title: "B", dependsOn: ["A"], definitionId: "n2" },
      ],
    };
    expect(validateProjectProposal(distinct)).toEqual([]);
  });
});
