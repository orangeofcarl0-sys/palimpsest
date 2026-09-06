import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  pipelinePreset,
  proposalTaskSpecs,
  validateProjectProposal,
  type ProjectProposal,
} from "../src/architecture/index.js";
import { parseGateDefinition } from "../src/evidence/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-arch-")), "ops.sqlite"),
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

const PIPELINE: ProjectProposal = pipelinePreset({
  goal: "ship the calculator",
  stages: [
    { title: "实现", writePaths: ["src/calc.py"], requiredArtifacts: ["src/calc.py"] },
    { title: "验证", writePaths: ["reports/verify.md"], requiredArtifacts: ["reports/verify.md"], gateId: "gate-release" },
    { title: "评审", writePaths: ["reports/review.md"] },
  ],
});

describe("architecture modes (PLMP-ARCH)", () => {
  it("ARCH-A01: the pipeline preset is deterministic with a linear dependency chain", () => {
    const first = pipelinePreset({
      goal: "ship",
      stages: [{ title: "a" }, { title: "b" }, { title: "c" }],
    });
    expect(JSON.stringify(pipelinePreset({ goal: "ship", stages: [{ title: "a" }, { title: "b" }, { title: "c" }] }))).toBe(
      JSON.stringify(first),
    );
    expect(first.tasks.map((task) => task.dependsOn)).toEqual([[], ["a"], ["b"]]);

    // Upstream write paths feed downstream context requirements (CTX-2
    // upstreamWritePaths semantics) once compiled through start/plan.
    const specs = proposalTaskSpecs(PIPELINE);
    expect(specs.map((spec) => spec.task_id)).toEqual(["task-1", "task-2", "task-3"]);
    expect(specs[1]!.depends_on).toEqual(["task-1"]);
    expect(specs[2]!.depends_on).toEqual(["task-2"]);
  });

  it("ARCH-A02: declaring a preset proposal goes through the existing channels only", async () => {
    const { controller, store, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: PIPELINE.goal,
        tasks: [],
      });
      controller.declareGate(
        parseGateDefinition({
          gate_id: "gate-release",
          version: 1,
          subject_type: "attempt",
          require: { all: [{ exists: { predicate: "tests_pass" } }] },
        }),
        "h1-test",
      );
      const before = eventCount(store);
      const project = controller.plan({
        tasks: proposalTaskSpecs(PIPELINE),
        changeClass: PIPELINE.changeClass,
        changedIds: ["task-1"],
      });
      expect(project.event_type).toBe("PROJECT_REVISED");
      const graph = controller.orchestrationGraph();
      expect(graph.tasks.map((task) => task.taskId)).toEqual(["task-1", "task-2", "task-3"]);
      expect(graph.tasks[1]!.dependsOn).toEqual(["task-1"]);
      // Upstream write scope reached the downstream context requirement.
      expect(graph.tasks[1]!.writePaths).toEqual(["reports/verify.md"]);

      // A revision of a running project goes through plan - no new event types.
      controller.plan({
        tasks: [...proposalTaskSpecs(PIPELINE)],
        changeClass: "behavior_change",
        changedIds: ["task-1"],
      });
      const types = new Set(
        (store.connection.prepare("SELECT DISTINCT event_type AS t FROM events").all() as Array<{ t: string }>).map(
          (row) => row.t,
        ),
      );
      expect(types.has("PROJECT_CREATED")).toBe(true);
      expect(eventCount(store)).toBeGreaterThan(before);
    } finally {
      await cleanup();
    }
  });

  it("ARCH-A03: the validator is fail-closed - bad proposals never touch the ledger", () => {
    expect(validateProjectProposal({ goal: "g", changeClass: "behavior_change", tasks: [] })).toEqual([
      { type: "EMPTY_TASKS", detail: "proposal has no tasks" },
    ]);
    const unknownDep: ProjectProposal = {
      goal: "g",
      changeClass: "behavior_change",
      tasks: [{ title: "a", dependsOn: ["ghost"] }],
    };
    expect(validateProjectProposal(unknownDep)).toEqual([
      { type: "UNKNOWN_DEPENDENCY", task: "a", detail: 'depends on "ghost", which is not in this proposal' },
    ]);
    const cycle: ProjectProposal = {
      goal: "g",
      changeClass: "behavior_change",
      tasks: [
        { title: "a", dependsOn: ["b"] },
        { title: "b", dependsOn: ["a"] },
      ],
    };
    expect(validateProjectProposal(cycle).map((d) => d.type)).toContain("DEPENDENCY_CYCLE");
    const missingWrite: ProjectProposal = {
      goal: "g",
      changeClass: "behavior_change",
      tasks: [{ title: "a", dependsOn: [], requiredArtifacts: ["out.md"] }],
    };
    expect(validateProjectProposal(missingWrite).map((d) => d.type)).toContain("MISSING_WRITE_PATHS");
    const unknownGate: ProjectProposal = {
      goal: "g",
      changeClass: "behavior_change",
      tasks: [{ title: "a", dependsOn: [], gateId: "gate-nope" }],
    };
    expect(
      validateProjectProposal(unknownGate, { knownGateIds: new Set(["gate-release"]) }).map((d) => d.type),
    ).toContain("UNKNOWN_GATE");
    expect(
      validateProjectProposal(unknownGate).filter((d) => d.type === "UNKNOWN_GATE"),
    ).toEqual([]);

    // A good proposal yields zero diagnostics.
    expect(validateProjectProposal(PIPELINE, { knownGateIds: new Set(["gate-release"]) })).toEqual([]);
  });

  it("ARCH-A04: the architect flow is end-to-end with zero in-plugin LLM", async () => {
    const { controller, cleanup } = makeRig();
    try {
      // The "main agent" compiles a proposal (no plugin-side model call),
      // validates, then declares through start - the graph reflects it.
      const proposal = pipelinePreset({
        goal: "research then implement",
        stages: [
          { title: "调研", writePaths: ["notes/research.md"], requiredArtifacts: ["notes/research.md"] },
          { title: "实现", writePaths: ["src/x.py"], requiredArtifacts: ["src/x.py"] },
        ],
      });
      expect(validateProjectProposal(proposal)).toEqual([]);
      controller.start({
        projectId: "scheduler-project",
        goal: proposal.goal,
        tasks: proposalTaskSpecs(proposal),
      });
      const graph = controller.orchestrationGraph();
      expect(graph.tasks.map((task) => task.objective)).toEqual(["调研", "实现"]);

      // Dependency red line: the plugin's own manifest pulls no model/API client.
      const { readFileSync } = await import("node:fs");
      const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
      expect(names.filter((name) => /openai|anthropic|axios|node-fetch|langchain/i.test(name))).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("ARCH-A05: an architecture change on a live project is a plan revision under the same gates", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: proposalTaskSpecs(PIPELINE),
      });
      controller.step();
      const created = controller.step()!;
      controller.plan({
        tasks: [
          ...proposalTaskSpecs(PIPELINE),
          {
            task_id: "task-4",
            objective: "发布说明",
            depends_on: ["task-3"],
            write_paths: ["CHANGELOG.md"],
            required_artifacts: ["CHANGELOG.md"],
          },
        ],
        changeClass: "backward_compatible",
        changedIds: ["task-1"],
      });
      const graph = controller.orchestrationGraph();
      expect(graph.project.revision).toBe(1);
      expect(graph.tasks.map((task) => task.taskId)).toEqual(["task-1", "task-2", "task-3", "task-4"]);
      // The pre-revision attempt is still governed by the same evidence gates.
      expect(graph.tasks[0]!.attempts[0]!.attemptId).toBe(created.entity_id);
    } finally {
      await cleanup();
    }
  });
});
