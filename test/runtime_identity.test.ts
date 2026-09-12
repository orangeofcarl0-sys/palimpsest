/**
 * G10-D1 runtime identity kernel machine proofs.
 *
 *   D1-M01  AgentDefinition ≠ Activation
 *   D1-M02  Activation ≠ Attempt
 *   D1-M03  ActivationId independent of AgentDefinitionId (allocator seam)
 *   D1-M04  RuntimeAgentRef ≠ ActivationId
 *   D1-M05  SessionRef ≠ RuntimeAgentRef; never synthesized
 *   D1-M06  plan/ref coherence (fail-closed)
 *   D1-M07  stale plan refused (G10-C grounded freshness reuse)
 *   D1-M08  ephemeral target derived exactly from BindingResolution
 *   D1-M09  persistent target derived exactly from BindingResolution
 *   D1-M10  no task/work identity in runtime realization
 *   D1-M11  runtime artifacts immutable (B3C2 standard)
 *   D1-M12  no point creation during preparation (purity/import audit)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  compileGroundedBindingPlan,
  materializeObservationSnapshot,
} from "../src/binding/index.js";
import type { GroundedPlanningState } from "../src/binding/index.js";
import { materializeActivation, materializeRuntimeAttachment } from "../src/runtime/index.js";
import type { Activation, RuntimeAgentRef, RuntimeAttachment, SessionRef } from "../src/runtime/index.js";
import { materializeRunConfiguration } from "../src/run/index.js";
import {
  RuntimeRealizationError,
  continuityTargetOf,
  prepareRuntimeRealization,
  runtimeRealizationKey,
} from "../src/runtime/index.js";
import { materializeArchitectureDefinition } from "../src/architecture/index.js";
import type { ArchitectureDefinition } from "../src/architecture/index.js";
import type { ProjectIr } from "../src/schema/index.js";
import { parseTaskSpec, projectIrDigestOf } from "../src/schema/index.js";
import { authorBindingDefinition } from "./binding_helpers.js";

const IDENTITY_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/runtime/identity.ts", import.meta.url)),
  "utf-8",
);
const IDENTITY_CODE = IDENTITY_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const ARCHITECTURE: ArchitectureDefinition = materializeArchitectureDefinition({
  architectureDefinitionId: "arch-d",
  revision: 1,
  agentDefinitionIds: ["A", "B"],
});

function projectIr(revision = 3): ProjectIr {
  const base = {
    schema_version: 1 as const,
    project_id: "proj-d",
    revision,
    parent_revision: revision > 0 ? revision - 1 : null,
    parent_digest: revision > 0 ? "p" : null,
    goal: "runtime",
    requirements: [],
    decisions: [],
    tasks: [
      parseTaskSpec({
        task_id: "task-1",
        objective: "o",
        depends_on: [],
        write_paths: [],
        required_artifacts: [],
      }),
    ],
    head_commit: "head",
    committed_at: "2026-01-01T00:00:00.000000Z",
  };
  return { ...base, digest: projectIrDigestOf(base) } as ProjectIr;
}

function plannedResult(overrides: Partial<{ snapshotId: string; workRevision: number }> = {}) {
  const result = compileGroundedBindingPlan({
    architecture: ARCHITECTURE,
    work: projectIr(overrides.workRevision ?? 3),
    runConfiguration: materializeRunConfiguration(),
    observationSnapshot: materializeObservationSnapshot({
      snapshotId: overrides.snapshotId ?? "obs-d",
      ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
      persistentCandidates: [],
    }),
    resolutionId: "res-d",
  });
  if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
  return result;
}

/** Deterministic allocator seam output (§21): tests never use randomness. */
const activationIds = { A: "act-A-1", B: "act-B-1" };

function prepared(overrides: Partial<Parameters<typeof prepareRuntimeRealization>[0]> = {}) {
  const grounded = plannedResult();
  return prepareRuntimeRealization({
    architecture: ARCHITECTURE,
    runDefinition: grounded.runDefinition,
    resolution: grounded.resolution,
    plan: grounded.plan,
    activationIds,
    ...overrides,
  });
}

describe("D1-M01: AgentDefinition ≠ Activation", () => {
  it("an Activation references the definition without being it; definition input is not required to materialize", () => {
    const grounded = plannedResult();
    const activation: Activation = materializeActivation({
      activationId: "act-1",
      agentDefinitionId: "A",
      runDefinition: { digest: grounded.runDefinition.digest },
      bindingResolution: {
        resolutionId: grounded.resolution.resolutionId,
        digest: grounded.resolution.digest,
      },
    });
    expect(activation.agentDefinitionId).toBe("A");
    expect(activation).not.toHaveProperty("instructions");
    expect(Object.keys(activation).sort()).toEqual([
      "activationId",
      "agentDefinitionId",
      "bindingResolution",
      "runDefinition",
      "schemaVersion",
    ]);
  });
});

describe("D1-M02: Activation ≠ Attempt (§4/§31)", () => {
  it("prepared realizations and activations carry no task/attempt/work identity", () => {
    const entries = prepared();
    const serialized = JSON.stringify({ entries, activation: materializeActivation({
      activationId: "act-A-1",
      agentDefinitionId: "A",
      runDefinition: { digest: entries[0]!.runDefinition.digest },
      bindingResolution: entries[0]!.bindingResolution,
    }) });
    for (const forbidden of ["taskId", "attemptId", "TaskSpec", "definition_id", "worktree", "AttemptContext"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(IDENTITY_CODE).not.toMatch(/\btaskId\b|\battemptId\b|\bdefinition_id\b/);
  });
});

describe("D1-M03: ActivationId comes from the allocator seam, never derived (§21)", () => {
  it("ids are caller-supplied and independent of the definition id", () => {
    const entries = prepared();
    expect(entries.map((entry) => entry.activationId)).toEqual(["act-A-1", "act-B-1"]);
    const mismatched = prepareRuntimeRealization({
      architecture: ARCHITECTURE,
      runDefinition: plannedResult().runDefinition,
      resolution: plannedResult().resolution,
      plan: plannedResult().plan,
      activationIds: { A: "totally-different", B: "also-unrelated" },
    });
    expect(mismatched.map((entry) => entry.activationId)).toEqual(["totally-different", "also-unrelated"]);
    // Incomplete allocator output is rejected.
    expect(() =>
      prepareRuntimeRealization({
        architecture: ARCHITECTURE,
        runDefinition: plannedResult().runDefinition,
        resolution: plannedResult().resolution,
        plan: plannedResult().plan,
        activationIds: { A: "act-A-1" },
      }),
    ).toThrow(RuntimeRealizationError);
  });
});

describe("D1-M04/M05: host refs are their own namespaces (§23/§24)", () => {
  it("RuntimeAgentRef and SessionRef are distinct host-owned shapes; session is never synthesized", () => {
    const grounded = plannedResult();
    const runtimeAgent: RuntimeAgentRef = { runtimeAdapter: "callback", agentId: "host-agent-7" };
    const attachment: RuntimeAttachment = materializeRuntimeAttachment({
      activationId: "act-A-1",
      runtimeAgent,
      continuityTarget: { kind: "ephemeral" },
    });
    expect(attachment.session).toBeUndefined();
    expect(Object.keys(attachment).sort()).toEqual([
      "activationId",
      "continuityTarget",
      "runtimeAgent",
      "schemaVersion",
    ]);
    const withSession = materializeRuntimeAttachment({
      activationId: "act-A-1",
      runtimeAgent,
      session: { runtimeAdapter: "callback", sessionId: "host-session-9" } as SessionRef,
      continuityTarget: { kind: "ephemeral" },
    });
    expect(withSession.session).toEqual({ runtimeAdapter: "callback", sessionId: "host-session-9" });
    expect(grounded).toBeDefined();
  });
});

describe("D1-M06: plan/ref coherence is fail-closed (§29)", () => {
  it("mismatched RunDefinition ref, resolution ref, or subject set is rejected", () => {
    const grounded = plannedResult();
    expect(() =>
      prepareRuntimeRealization({
        architecture: ARCHITECTURE,
        runDefinition: { ...grounded.runDefinition, digest: "other" },
        resolution: grounded.resolution,
        plan: grounded.plan,
        activationIds,
      }),
    ).toThrow(/does not match the returned RunDefinition/);
    expect(() =>
      prepareRuntimeRealization({
        architecture: ARCHITECTURE,
        runDefinition: grounded.runDefinition,
        resolution: { ...grounded.resolution, resolutionId: "forged" },
        plan: grounded.plan,
        activationIds,
      }),
    ).toThrow(/does not match the returned BindingResolution/);
    const shrunken = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-d",
      revision: 1,
      agentDefinitionIds: ["A"],
    });
    expect(() =>
      prepareRuntimeRealization({
        architecture: shrunken,
        runDefinition: grounded.runDefinition,
        resolution: grounded.resolution,
        plan: grounded.plan,
        activationIds: { A: "act-A-1" },
      }),
    ).toThrow(/do not equal the BindingResolution continuity subjects/);
  });
});

describe("D1-M07: stale plan refused via G10-C grounded freshness (§30)", () => {
  it("a current-state mismatch refuses preparation; same-state prepares", () => {
    const grounded = plannedResult();
    const current: GroundedPlanningState = {
      architecture: ARCHITECTURE,
      work: projectIr(3),
      runConfiguration: materializeRunConfiguration(),
      observationSnapshot: materializeObservationSnapshot({
        snapshotId: "obs-d",
        ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
        persistentCandidates: [],
      }),
    };
    expect(prepared({ current }).map((entry) => entry.agentDefinitionId)).toEqual(["A", "B"]);
    const advanced: GroundedPlanningState = {
      ...current,
      work: projectIr(4),
    };
    expect(() => prepared({ current: advanced })).toThrow(RuntimeRealizationError);
    try {
      prepared({ current: advanced });
    } catch (error) {
      expect((error as RuntimeRealizationError).kind).toBe("plan_stale");
    }
  });
});

describe("D1-M08/M09: continuity targets derive exactly from the BindingResolution (§27)", () => {
  it("ephemeral selections map to ephemeral targets; persistent selections carry the point", () => {
    const preparedEntries = prepared();
    expect(preparedEntries.map((entry) => entry.continuityTarget)).toEqual([
      { kind: "ephemeral" },
      { kind: "ephemeral" },
    ]);
    // A persistent selection flows through the explicit adapter unchanged.
    expect(continuityTargetOf({ kind: "persistent", point: "P-1" })).toEqual({
      kind: "persistent",
      point: "P-1",
    });
    expect(continuityTargetOf({ kind: "ephemeral" })).toEqual({ kind: "ephemeral" });
  });

  it("persistent resolution drives persistent prepared targets end-to-end", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-d",
      revision: 0,
      bindings: {
        A: { continuity: { pin: "P-9" } },
        B: { continuity: {} },
      },
    });
    const result = compileGroundedBindingPlan({
      architecture: ARCHITECTURE,
      work: projectIr(),
      trustedBindingDefinition: definition,
      runConfiguration: materializeRunConfiguration(),
      observationSnapshot: materializeObservationSnapshot({
        snapshotId: "obs-d-pin",
        ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
        persistentCandidates: [{ point: "P-9", available: true }],
      }),
      resolutionId: "res-d-pin",
    });
    if (result.status !== "planned") throw new Error("expected planned");
    const preparedEntries = prepareRuntimeRealization({
      architecture: ARCHITECTURE,
      runDefinition: result.runDefinition,
      resolution: result.resolution,
      plan: result.plan,
      activationIds,
    });
    expect(preparedEntries.find((entry) => entry.agentDefinitionId === "A")?.continuityTarget).toEqual({
      kind: "persistent",
      point: "P-9",
    });
    expect(preparedEntries.find((entry) => entry.agentDefinitionId === "B")?.continuityTarget).toEqual({
      kind: "ephemeral",
    });
  });
});

describe("D1-M10: realization keys are stable and input-sensitive (§44)", () => {
  it("identical prepared inputs → identical keys; any basis drift → different key", () => {
    const grounded = plannedResult();
    const first = runtimeRealizationKey({
      activationId: "act-A-1",
      runDefinition: { digest: grounded.runDefinition.digest },
      bindingResolution: {
        resolutionId: grounded.resolution.resolutionId,
        digest: grounded.resolution.digest,
      },
      continuityTarget: { kind: "ephemeral" },
    });
    const second = runtimeRealizationKey({
      activationId: "act-A-1",
      runDefinition: { digest: grounded.runDefinition.digest },
      bindingResolution: {
        resolutionId: grounded.resolution.resolutionId,
        digest: grounded.resolution.digest,
      },
      continuityTarget: { kind: "ephemeral" },
    });
    expect(first).toBe(second);
    const drifted = runtimeRealizationKey({
      activationId: "act-A-1",
      runDefinition: { digest: grounded.runDefinition.digest },
      bindingResolution: {
        resolutionId: grounded.resolution.resolutionId,
        digest: grounded.resolution.digest,
      },
      continuityTarget: { kind: "persistent", point: "P-9" },
    });
    expect(drifted).not.toBe(first);
  });
});

describe("D1-M11: runtime artifacts immutable (§32)", () => {
  it("prepared realizations, activations, and attachments are deep-frozen and detached", () => {
    const preparedEntries = prepared();
    for (const entry of preparedEntries) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.runDefinition)).toBe(true);
      expect(Object.isFrozen(entry.bindingResolution)).toBe(true);
      expect(Object.isFrozen(entry.continuityTarget)).toBe(true);
    }
    const activation = materializeActivation({
      activationId: "act-1",
      agentDefinitionId: "A",
      runDefinition: { digest: "d" },
      bindingResolution: { resolutionId: "r", digest: "rd" },
    });
    const runDefinitionRef = { digest: "d" };
    const attachment = materializeRuntimeAttachment({
      activationId: "act-1",
      runtimeAgent: { runtimeAdapter: "callback", agentId: "a" },
      session: { runtimeAdapter: "callback", sessionId: "s" },
      continuityTarget: { kind: "persistent", point: "P-1" },
    });
    expect(Object.isFrozen(activation)).toBe(true);
    expect(Object.isFrozen(activation.runDefinition)).toBe(true);
    expect(Object.isFrozen(attachment.runtimeAgent)).toBe(true);
    expect(Object.isFrozen(attachment.session)).toBe(true);
    expect(Object.isFrozen(attachment.continuityTarget)).toBe(true);
    expect(() => {
      (activation as { activationId: string }).activationId = "x";
    }).toThrow(TypeError);
    runDefinitionRef.digest = "mutated";
    expect(activation.runDefinition.digest).toBe("d");
  });
});

describe("D1-M12: preparation creates nothing external (§28)", () => {
  it("the kernel imports no ports, stores, hosts, or effects", () => {
    expect(IDENTITY_CODE).not.toMatch(/RuntimeCarrierPort|PersistentPointStore|Ordarium|DatabaseSync|createHash\(/);
    expect(IDENTITY_CODE).not.toMatch(/node:(fs|path|net|http)/);
    expect(IDENTITY_CODE).not.toMatch(/Date\.now|Math\.random|randomUUID/);
    expect(IDENTITY_CODE).not.toMatch(/\.prepare\(|localStorage|fetch\(/);
  });
});
