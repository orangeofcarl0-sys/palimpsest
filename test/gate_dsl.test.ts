import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GateEngine,
  parseGateDefinition,
  type GateClause,
  type GateDefinition,
} from "../src/evidence/index.js";
import { ProjectController } from "../src/tools/index.js";
import { DomainValidationError } from "../src/domain/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-gate-")), "ops.sqlite"),
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
  return {
    store,
    controller,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

/** Seed one evidence row directly into the projection (DSL evaluates the projection). */
function seedEvidence(
  store: EventStore,
  projectId: string,
  subjectId: string,
  predicate: string,
  exitCode: number,
  status = "active",
  count = 1,
): void {
  for (let index = 0; index < count; index += 1) {
    const evidenceId = `evidence-${subjectId}-${predicate}-${index}`;
    store.connection
      .prepare(
        "INSERT INTO evidence(project_id, evidence_id, status, evidence_json, last_event_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        projectId,
        evidenceId,
        status,
        new TextEncoder().encode(
          JSON.stringify({
            subject_type: "attempt",
            subject_id: subjectId,
            predicate,
            value: { exit_code: exitCode },
          }),
        ),
        0,
        "2026-08-13T00:00:00Z",
      );
  }
}

function gateOf(clauses: GateClause[]): GateDefinition {
  return parseGateDefinition({
    gate_id: "g-1",
    version: 1,
    subject_type: "attempt",
    require: { all: clauses },
  });
}

describe("Gate DSL (Research line)", () => {
  it("parses all/any definitions and fails closed on invalid shapes", () => {
    expect(gateOf([{ exists: { predicate: "tests_pass" } }]).gate_id).toBe("g-1");
    expect(
      parseGateDefinition({
        gate_id: "g2",
        version: 2,
        subject_type: "task",
        require: { any: [{ count: { predicate: "tests_pass", gte: 2 } }] },
      }).require,
    ).toEqual({ mode: "any", chain: [{ count: { predicate: "tests_pass", gte: 2 } }] });
    expect(() =>
      parseGateDefinition({
        gate_id: "b",
        version: 1,
        subject_type: "attempt",
        require: { all: [{ exists: { predicate: "made_up" } }] },
      }),
    ).toThrow(/unknown evidence predicate/);
    expect(() =>
      parseGateDefinition({
        gate_id: "b",
        version: 1,
        subject_type: "attempt",
        require: { all: [{ count: { predicate: "tests_pass", gte: -1 } }] },
      }),
    ).toThrow(/gte/);
    expect(() =>
      parseGateDefinition({ gate_id: "b", version: 1, subject_type: "attempt", require: {} }),
    ).toThrow(/all or any/);
  });

  it("verdicts PASS when every all-branch is evidenced", async () => {
    const { store, cleanup } = makeRig();
    try {
      seedEvidence(store, "scheduler-project", "attempt-1", "tests_pass", 0);
      seedEvidence(store, "scheduler-project", "attempt-1", "lint_pass", 0);
      const engine = new GateEngine();
      engine.register(
        gateOf([
          { exists: { predicate: "tests_pass" } },
          { exists: { predicate: "lint_pass" } },
        ]),
      );
      const result = engine.evaluate(store, "scheduler-project", "attempt", "attempt-1", "g-1");
      expect(result.verdict).toBe("PASS");
      expect(result.passed).toEqual(["exists(tests_pass)", "exists(lint_pass)"]);
      expect(result.evidence_used).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });

  it("a not-branch vetoes (FAIL) when forbidden evidence exists", async () => {
    const { store, cleanup } = makeRig();
    try {
      seedEvidence(store, "scheduler-project", "attempt-1", "tests_pass", 0);
      seedEvidence(store, "scheduler-project", "attempt-1", "tests_fail", 1);
      const engine = new GateEngine();
      engine.register(
        gateOf([
          { exists: { predicate: "tests_pass" } },
          { not: { exists: { predicate: "tests_fail" } } },
        ]),
      );
      const result = engine.evaluate(store, "scheduler-project", "attempt", "attempt-1", "g-1");
      expect(result.verdict).toBe("FAIL");
      expect(result.failed).toEqual(["not(exists(tests_fail))"]);
    } finally {
      await cleanup();
    }
  });

  it("missing evidence is INCOMPLETE with next_evidence_needed, never FAIL", async () => {
    const { store, cleanup } = makeRig();
    try {
      const engine = new GateEngine();
      engine.register(gateOf([{ exists: { predicate: "tests_pass" } }]));
      const result = engine.evaluate(store, "scheduler-project", "attempt", "attempt-1", "g-1");
      expect(result.verdict).toBe("INCOMPLETE");
      expect(result.next_evidence_needed).toEqual(["exists(tests_pass)"]);
      expect(result.evidence_used).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("where filters scope a clause to matching evidence values", async () => {
    const { store, cleanup } = makeRig();
    try {
      seedEvidence(store, "scheduler-project", "attempt-1", "process_exit_zero", 0);
      const engine = new GateEngine();
      engine.register(
        gateOf([{ exists: { predicate: "process_exit_zero", where: { exit_code: 0 } } }]),
      );
      expect(
        engine.evaluate(store, "scheduler-project", "attempt", "attempt-1", "g-1").verdict,
      ).toBe("PASS");
      engine.register(
        gateOf([{ exists: { predicate: "process_exit_zero", where: { exit_code: 1 } } }]),
      );
      expect(
        engine.evaluate(store, "scheduler-project", "attempt", "attempt-1", "g-1").verdict,
      ).toBe("INCOMPLETE");
    } finally {
      await cleanup();
    }
  });

  it("count gates require at least gte matching evidence rows", async () => {
    const { store, cleanup } = makeRig();
    try {
      seedEvidence(store, "scheduler-project", "attempt-1", "tests_pass", 0, "active", 2);
      const engine = new GateEngine();
      engine.register(gateOf([{ count: { predicate: "tests_pass", gte: 2 } }]));
      expect(
        engine.evaluate(store, "scheduler-project", "attempt", "attempt-1", "g-1").verdict,
      ).toBe("PASS");
      engine.register(gateOf([{ count: { predicate: "tests_pass", gte: 3 } }]));
      expect(
        engine.evaluate(store, "scheduler-project", "attempt", "attempt-1", "g-1").verdict,
      ).toBe("INCOMPLETE");
    } finally {
      await cleanup();
    }
  });

  it("stale evidence is ignored (absence ≠ evidence of absence)", async () => {
    const { store, cleanup } = makeRig();
    try {
      seedEvidence(store, "scheduler-project", "attempt-1", "tests_pass", 0, "stale");
      const engine = new GateEngine();
      engine.register(gateOf([{ exists: { predicate: "tests_pass" } }]));
      const result = engine.evaluate(store, "scheduler-project", "attempt", "attempt-1", "g-1");
      expect(result.verdict).toBe("INCOMPLETE");
    } finally {
      await cleanup();
    }
  });

  it("any gates pass when at least one branch is evidenced", async () => {
    const { store, cleanup } = makeRig();
    try {
      seedEvidence(store, "scheduler-project", "attempt-1", "tests_fail", 1);
      const gate = parseGateDefinition({
        gate_id: "g-1",
        version: 1,
        subject_type: "attempt",
        require: { any: [{ exists: { predicate: "tests_pass" } }, { exists: { predicate: "tests_fail" } }] },
      });
      const engine = new GateEngine();
      engine.register(gate);
      expect(
        engine.evaluate(store, "scheduler-project", "attempt", "attempt-1", "g-1").verdict,
      ).toBe("PASS");
    } finally {
      await cleanup();
    }
  });

  it("integrates with evidence produced through the controller", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      controller.step();
      const created = controller.step()!;
      await controller.claim(created.entity_id);
      controller.report(created.entity_id, { workerStatus: "completed", summary: "done" });
      await controller.gate({
        attemptId: created.entity_id,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      const engine = new GateEngine();
      engine.register(
        gateOf([
          { exists: { predicate: "tests_pass" } },
          { exists: { predicate: "write_scope_valid" } },
        ]),
      );
      const result = engine.evaluate(
        controller.store,
        controller.projectId,
        "attempt",
        created.entity_id,
        "g-1",
      );
      expect(result.verdict).toBe("INCOMPLETE"); // tests_pass present, write_scope_valid missing
      expect(result.next_evidence_needed).toEqual(["exists(write_scope_valid)"]);
    } finally {
      await cleanup();
    }
  });

  it("rejects unregistered gates and subject-type mismatches", async () => {
    const { store, cleanup } = makeRig();
    try {
      const engine = new GateEngine();
      expect(() =>
        engine.evaluate(store, "scheduler-project", "attempt", "attempt-1", "missing"),
      ).toThrow(/not registered/);
      const taskGate = parseGateDefinition({
        gate_id: "g-task",
        version: 1,
        subject_type: "task",
        require: { all: [{ exists: { predicate: "tests_pass" } }] },
      });
      engine.register(taskGate);
      expect(() =>
        engine.evaluate(store, "scheduler-project", "attempt", "attempt-1", "g-task"),
      ).toThrow(/expects subject_type task/);
    } finally {
      await cleanup();
    }
  });
});