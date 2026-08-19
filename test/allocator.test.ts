import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { allocate, type AllocationEstimates } from "../src/allocate/index.js";
import { ProjectController } from "../src/tools/index.js";
import { DomainValidationError } from "../src/domain/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const BASE: AllocationEstimates = {
  uncertainty: "low",
  verifiability: "deterministic",
  impact: "low",
  evidenceDeficit: 0,
  critical: false,
  expensiveExecution: false,
};

describe("dynamic compute allocator (R5)", () => {
  it("low uncertainty + deterministic verification: one cheap worker", () => {
    const allocation = allocate(BASE);
    expect(allocation).toMatchObject({ candidates: 1, verifiers: 1, escalation: "cheap" });
  });

  it("high uncertainty + easy verification: wide parallel sampling (8 candidates)", () => {
    const allocation = allocate({ ...BASE, uncertainty: "high" });
    expect(allocation).toMatchObject({ candidates: 8, escalation: "worker" });
  });

  it("high uncertainty + weak verification: strong reasoning, not more samples", () => {
    const allocation = allocate({
      ...BASE,
      uncertainty: "high",
      verifiability: "weak",
    });
    // The whole point of §35: do NOT widen the sample when verification is weak.
    expect(allocation.candidates).toBeLessThanOrEqual(2);
    expect(allocation.escalation).toBe("strong");
    expect(allocation.reason).toMatch(/discriminative experiment/);
  });

  it("critical/high-impact work gets independent verification", () => {
    const critical = allocate({ ...BASE, critical: true });
    expect(critical).toMatchObject({ candidates: 4, verifiers: 2 });
    const highImpact = allocate({ ...BASE, impact: "high" });
    expect(highImpact).toMatchObject({ candidates: 4, verifiers: 2 });
  });

  it("expensive execution pre-screens aggressively instead of widening", () => {
    const gpu = allocate({ ...BASE, uncertainty: "high", expensiveExecution: true });
    expect(gpu.candidates).toBeLessThanOrEqual(2);
    expect(gpu.reason).toMatch(/pre-screen/);
    const gpuCritical = allocate({
      ...BASE,
      uncertainty: "high",
      critical: true,
      expensiveExecution: true,
    });
    expect(gpuCritical).toMatchObject({ candidates: 2, verifiers: 2 });
  });

  it("medium uncertainty: four candidates", () => {
    expect(allocate({ ...BASE, uncertainty: "medium" })).toMatchObject({
      candidates: 4,
      escalation: "worker",
    });
  });

  it("controller integration requires an existing task", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    const effects = createPalimpsestEffects({
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-a5-")), "ops.sqlite"),
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
    try {
      expect(() => controller.allocateFor("missing", BASE)).toThrow(DomainValidationError);
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [{ ...taskSpec("task-1"), role: "implementer" }],
      });
      expect(
        controller.allocateFor("task-1", { ...BASE, uncertainty: "high" }),
      ).toMatchObject({ candidates: 8 });
    } finally {
      await effects.close();
      store.close();
    }
  });
});