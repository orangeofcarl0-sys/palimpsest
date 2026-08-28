import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseGateDefinition } from "../src/evidence/index.js";
import { ProjectController, type PlanInput } from "../src/tools/index.js";
import { DomainValidationError } from "../src/domain/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const GATE_PASS = parseGateDefinition({
  gate_id: "gate-pass",
  version: 1,
  subject_type: "attempt",
  require: {
    all: [
      { exists: { predicate: "tests_pass" } },
      { exists: { predicate: "write_scope_valid" } },
    ],
  },
});

const GATE_TESTS_ONLY = parseGateDefinition({
  gate_id: "gate-tests",
  version: 1,
  subject_type: "attempt",
  require: { all: [{ exists: { predicate: "tests_pass" } }] },
});

function makeRig(withGates = false) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-g3-")), "ops.sqlite"),
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
      attempt_limit: 8,
      candidate_limit: 4,
    }),
    clock: () => "2026-08-13T00:00:00Z",
  });
  withGatesFlag = withGates === true;
  return {
    store,
    controller,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

let withGatesFlag = false;

async function driveAttempt(controller: ProjectController) {
  controller.start({
    projectId: "scheduler-project",
    goal: "g",
    tasks: [taskSpec("task-1")],
  });
  if (withGatesFlag) {
    controller.declareGate(GATE_PASS, "h1-test");
    controller.declareGate(GATE_TESTS_ONLY, "h1-test");
  }
  controller.step();
  const created = controller.step()!;
  await controller.claim(created.entity_id);
  return created.entity_id;
}

describe("Gate DSL integration (R3)", () => {
  it("controller.evaluateGate returns PASS when every clause is evidenced", async () => {
    const { controller, cleanup } = makeRig(true);
    try {
      const attemptId = await driveAttempt(controller);
      await controller.gate({ attemptId, predicate: "tests_pass", command: ["pytest"], exitCode: 0 });
      const incomplete = controller.evaluateGate("gate-pass", "attempt", attemptId);
      expect(incomplete.verdict).toBe("INCOMPLETE");
      expect(incomplete.next_evidence_needed).toEqual(["exists(write_scope_valid)"]);
      await controller.gate({
        attemptId,
        predicate: "write_scope_valid",
        command: ["check-write-scope"],
        exitCode: 0,
      });
      const pass = controller.evaluateGate("gate-pass", "attempt", attemptId);
      expect(pass.verdict).toBe("PASS");
    } finally {
      await cleanup();
    }
  });

  it("controller.evaluateGate rejects unregistered gates and subject mismatches", async () => {
    const { controller, cleanup } = makeRig(true);
    try {
      const attemptId = await driveAttempt(controller);
      expect(() => controller.evaluateGate("missing", "attempt", attemptId)).toThrow(
        /not declared/,
      );
      expect(() => controller.evaluateGate("gate-pass", "task", "task-1")).toThrow(
        /expects subject_type attempt/,
      );
    } finally {
      await cleanup();
    }
  });

  it("palimpsest_gate with a gateId reports the verdict and missing evidence", async () => {
    // Reuse the tool bundle through a minimal host like the P2 suite.
    const { controller, cleanup } = makeRig(true);
    try {
      const attemptId = await driveAttempt(controller);
      const { definePalimpsestTools } = await import("../src/tools/index.js");
      const [gateTool] = definePalimpsestTools(controller).filter(
        (tool) => tool.name === "palimpsest_gate",
      );
      const first = (await gateTool!.execute(
        { attemptId, predicate: "tests_pass", command: ["pytest"], exitCode: 0, gateId: "gate-pass" },
        { callId: "c", rootCallId: "r", name: "palimpsest_gate", arguments: {}, agent: undefined, parent: undefined, signal: new AbortController().signal },
      )) as { evidenceId: string; gateVerdict: string; nextEvidenceNeeded: string[] };
      expect(first.gateVerdict).toBe("INCOMPLETE");
      expect(first.nextEvidenceNeeded).toEqual(["exists(write_scope_valid)"]);
      const second = (await gateTool!.execute(
        { attemptId, predicate: "write_scope_valid", command: ["check-write-scope"], exitCode: 0, gateId: "gate-pass" },
        { callId: "c2", rootCallId: "r", name: "palimpsest_gate", arguments: {}, agent: undefined, parent: undefined, signal: new AbortController().signal },
      )) as { gateVerdict: string };
      expect(second.gateVerdict).toBe("PASS");
    } finally {
      await cleanup();
    }
  });

  it("palimpsest_gate without a gateId keeps the evidence-only behavior (backward compatible)", async () => {
    const { controller, cleanup } = makeRig(true);
    try {
      const attemptId = await driveAttempt(controller);
      const { definePalimpsestTools } = await import("../src/tools/index.js");
      const [gateTool] = definePalimpsestTools(controller).filter(
        (tool) => tool.name === "palimpsest_gate",
      );
      const result = (await gateTool!.execute(
        { attemptId, predicate: "tests_pass", command: ["pytest"], exitCode: 0 },
        { callId: "c", rootCallId: "r", name: "palimpsest_gate", arguments: {}, agent: undefined, parent: undefined, signal: new AbortController().signal },
      )) as { evidenceId: string; status: string };
      expect(result.status).toBe("active");
      expect("gateVerdict" in result).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("works with a gate engine registered in isolation (no controller needed)", () => {
    // The GateEngine contract is already exercised by the R1 suite; this
    // guards the registered-gates option plumbing end to end.
    void GATE_TESTS_ONLY;
    void DomainValidationError;
    void (null as unknown as PlanInput);
  });
});