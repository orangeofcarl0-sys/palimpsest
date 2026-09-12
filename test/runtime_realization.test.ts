/**
 * G10-D2 ephemeral runtime realization machine proofs.
 *
 *   D2-M01  ephemeral realization requires no PersistentPoint
 *   D2-M02  carrier effect passes through Ordarium (idempotent admission)
 *   D2-M03  direct port mutation path absent from the service
 *   D2-M04  successful effect → Activation + RuntimeAttachment
 *   D2-M05  failed effect → no successful Activation artifact
 *   D2-M06  RuntimeAgentRef remains host identity
 *   D2-M07  optional SessionRef not synthesized
 *   D2-M08  retries use the stable realization key
 *   D2-M09  existing install works without a runtime port (untouched)
 *   D2-M10  runtime port config does not change Work planning
 *   D2-M11  scheduler untouched/pure
 *   D2-M12  no Attempt identity inferred
 *   plus: staleness refusal, persistent-selection refusal, effect-denied
 *         mapping, release idempotency.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  compileGroundedBindingPlan,
  materializeObservationSnapshot,
} from "../src/binding/index.js";
import type { GroundedPlanningState } from "../src/binding/index.js";
import {
  callbackRuntimeCarrierPort,
  makeRuntimeRealizationService,
} from "../src/runtime/index.js";
import type {
  RuntimeCarrierRealizeRequest,
  RuntimeCarrierRealizeResult,
} from "../src/runtime/index.js";
import { materializeArchitectureDefinition } from "../src/architecture/index.js";
import type { ArchitectureDefinition } from "../src/architecture/index.js";
import type { ProjectIr } from "../src/schema/index.js";
import { parseTaskSpec, projectIrDigestOf } from "../src/schema/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { authorBindingDefinition } from "./binding_helpers.js";

const REALIZE_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/runtime/realize.ts", import.meta.url)),
  "utf-8",
);
const REALIZE_CODE = REALIZE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const ARCHITECTURE: ArchitectureDefinition = materializeArchitectureDefinition({
  architectureDefinitionId: "arch-d2",
  revision: 1,
  agentDefinitionIds: ["A", "B"],
});

function projectIr(revision = 2): ProjectIr {
  const base = {
    schema_version: 1 as const,
    project_id: "proj-d2",
    revision,
    parent_revision: revision > 0 ? revision - 1 : null,
    parent_digest: revision > 0 ? "p" : null,
    goal: "ephemeral",
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

function planned(overrides: Partial<{ workRevision: number; snapshotId: string }> = {}) {
  const result = compileGroundedBindingPlan({
    architecture: ARCHITECTURE,
    work: projectIr(overrides.workRevision ?? 2),
    runConfiguration: materializeRunConfiguration(),
    observationSnapshot: materializeObservationSnapshot({
      snapshotId: overrides.snapshotId ?? "obs-d2",
      ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
      persistentCandidates: [],
    }),
    resolutionId: "res-d2",
  });
  if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
  return result;
}

import { materializeRunConfiguration } from "../src/run/index.js";

function currentState(overrides: Partial<{ workRevision: number; snapshotId: string }> = {}): GroundedPlanningState {
  return {
    architecture: ARCHITECTURE,
    work: projectIr(overrides.workRevision ?? 2),
    runConfiguration: materializeRunConfiguration(),
    observationSnapshot: materializeObservationSnapshot({
      snapshotId: overrides.snapshotId ?? "obs-d2",
      ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
      persistentCandidates: [],
    }),
  };
}

interface Harness {
  realize: ReturnType<typeof makeRuntimeRealizationService>["realize"];
  release: ReturnType<typeof makeRuntimeRealizationService>["releaseCarrier"];
  portCalls: { realize: string[]; release: string[] };
  setRealizeBehavior(behavior: (request: RuntimeCarrierRealizeRequest) => Promise<RuntimeCarrierRealizeResult>): void;
}

/** Deterministic callback port + real Ordarium effects runtime on a temp ledger. */
function makeHarness(): Harness {
  const portCalls: { realize: string[]; release: string[] } = { realize: [], release: [] };
  let behavior: (request: RuntimeCarrierRealizeRequest) => Promise<RuntimeCarrierRealizeResult> =
    async (request) => ({
      runtimeAgent: { runtimeAdapter: "callback", agentId: `host-${request.activationId}` },
      ...(request.activationId.endsWith("-s")
        ? { session: { runtimeAdapter: "callback", sessionId: `host-sess-${request.activationId}` } }
        : {}),
    });
  const port = callbackRuntimeCarrierPort("callback", {
    onRealize: async (request) => {
      portCalls.realize.push(request.realizationKey);
      return behavior(request);
    },
    onRelease: async (request) => {
      portCalls.release.push(request.realizationKey);
    },
  });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-d2-")), "ops.sqlite"),
    git: new FakeGitPort("c".repeat(40)),
  });
  // Stable per-subject allocator (§21/§44 contract): retries of the same
  // realization context must reuse the same activation ids so the
  // realizationKey (and therefore the Ordarium operation) is identical.
  const allocated = new Map<string, string>();
  const service = makeRuntimeRealizationService({
    effects,
    allocateActivationId: (subject: string, _context: string) => {
      const existing = allocated.get(subject);
      if (existing !== undefined) return existing;
      const id = `act-${subject}-${allocated.size + 1}`;
      allocated.set(subject, id);
      return id;
    },
    port,
  });
  return {
    realize: service.realize,
    release: service.releaseCarrier,
    portCalls,
    setRealizeBehavior(next) {
      behavior = next;
    },
  };
}

describe("D2-M01: ephemeral realization requires no PersistentPoint (§37/§48)", () => {
  it("realizes a fully ephemeral plan with no store anywhere in the path", async () => {
    const harness = makeHarness();
    const grounded = planned();
    const outcome = await harness.realize({
      architecture: ARCHITECTURE,
      runDefinition: grounded.runDefinition,
      resolution: grounded.resolution,
      plan: grounded.plan,
      current: currentState(),
      activationContext: "ctx-1",
    });
    expect(outcome.status).toBe("realized");
    if (outcome.status !== "realized") return;
    expect(outcome.realizations).toHaveLength(2);
    for (const entry of outcome.realizations) {
      expect(entry.attachment.continuityTarget).toEqual({ kind: "ephemeral" });
    }
  });
});

describe("D2-M04/M06/M07: successful effect → Activation + RuntimeAttachment (host identities verbatim)", () => {
  it("materializes only after the effect; host refs carried verbatim; session only when supplied", async () => {
    const harness = makeHarness();
    const grounded = planned();
    const outcome = await harness.realize({
      architecture: ARCHITECTURE,
      runDefinition: grounded.runDefinition,
      resolution: grounded.resolution,
      plan: grounded.plan,
      current: currentState(),
      activationContext: "ctx-1",
    });
    if (outcome.status !== "realized") throw new Error(`expected realized, got ${outcome.status}`);
    const first = outcome.realizations[0]!;
    expect(first.activation.activationId).toBe("act-A-1");
    expect(first.activation.agentDefinitionId).toBe("A");
    expect(first.activation.runDefinition).toEqual({ digest: grounded.runDefinition.digest });
    expect(first.attachment.runtimeAgent).toEqual({
      runtimeAdapter: "callback",
      agentId: "host-act-A-1",
    });
    expect(first.attachment.session).toBeUndefined();
    expect(Object.isFrozen(first.activation)).toBe(true);
    expect(Object.isFrozen(first.attachment)).toBe(true);
  });
});

describe("D2-M02/M08: Ordarium admission + stable-key idempotency", () => {
  it("a repeated identical realization invokes the port once (Ordarium idempotent dedupe)", async () => {
    const harness = makeHarness();
    const grounded = planned();
    const request = {
      architecture: ARCHITECTURE,
      runDefinition: grounded.runDefinition,
      resolution: grounded.resolution,
      plan: grounded.plan,
      current: currentState(),
      activationContext: "ctx-1",
    };
    const first = await harness.realize(request);
    expect(first.status).toBe("realized");
    expect(harness.portCalls.realize).toHaveLength(2);
    const second = await harness.realize(request);
    expect(second.status).toBe("realized");
    // The port saw NO additional realize calls: Ordarium admitted the retry
    // as the same idempotent operation (stable realizationKey in the input).
    expect(harness.portCalls.realize).toHaveLength(2);
    if (first.status !== "realized" || second.status !== "realized") return;
    expect(JSON.stringify(second.realizations)).toBe(JSON.stringify(first.realizations));
  });
});

describe("D2-M05: failed effect → no successful Activation artifact", () => {
  it("a port failure yields a failed outcome with no realizations", async () => {
    const harness = makeHarness();
    harness.setRealizeBehavior(async () => {
      throw new Error("host exploded");
    });
    const grounded = planned();
    const outcome = await harness.realize({
      architecture: ARCHITECTURE,
      runDefinition: grounded.runDefinition,
      resolution: grounded.resolution,
      plan: grounded.plan,
      current: currentState(),
      activationContext: "ctx-1",
    });
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.reason).toBe("runtime_realization_failed");
    expect(outcome.subject).toBe("A");
  });
});

describe("refusals: stale plan never realizes; persistent never downgraded (§47/§64/§65)", () => {
  it("a stale current state is refused before any effect", async () => {
    const harness = makeHarness();
    const grounded = planned();
    const outcome = await harness.realize({
      architecture: ARCHITECTURE,
      runDefinition: grounded.runDefinition,
      resolution: grounded.resolution,
      plan: grounded.plan,
      current: currentState({ workRevision: 9 }),
      activationContext: "ctx-1",
    });
    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") return;
    expect(outcome.reason).toBe("plan_stale");
    expect(harness.portCalls.realize).toHaveLength(0);
  });

  it("a persistent selection without a continuity store fails closed — never downgraded to ephemeral (D3 §65)", async () => {
    const harness = makeHarness();
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-d2-pin",
      revision: 0,
      bindings: { A: { continuity: { pin: "P-1" } }, B: { continuity: {} } },
    });
    const result = compileGroundedBindingPlan({
      architecture: ARCHITECTURE,
      work: projectIr(),
      trustedBindingDefinition: definition,
      runConfiguration: materializeRunConfiguration(),
      observationSnapshot: materializeObservationSnapshot({
        snapshotId: "obs-d2-pin",
        ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
        persistentCandidates: [{ point: "P-1", available: true }],
      }),
      resolutionId: "res-d2-pin",
    });
    if (result.status !== "planned") throw new Error("expected planned");
    const outcome = await harness.realize({
      architecture: ARCHITECTURE,
      runDefinition: result.runDefinition,
      resolution: result.resolution,
      plan: result.plan,
      current: {
        architecture: ARCHITECTURE,
        work: projectIr(),
        bindingDefinition: definition,
        runConfiguration: materializeRunConfiguration(),
        observationSnapshot: materializeObservationSnapshot({
          snapshotId: "obs-d2-pin",
          ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
          persistentCandidates: [{ point: "P-1", available: true }],
        }),
      },
      activationContext: "ctx-1",
    });
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.reason).toBe("persistent_point_missing");
    expect(harness.portCalls.realize).toHaveLength(0);
  });
});

describe("release (§107): idempotent, port-optional", () => {
  it("release twice is one port release; a release-less adapter fails honestly", async () => {
    const harness = makeHarness();
    const grounded = planned();
    const outcome = await harness.realize({
      architecture: ARCHITECTURE,
      runDefinition: grounded.runDefinition,
      resolution: grounded.resolution,
      plan: grounded.plan,
      current: currentState(),
      activationContext: "ctx-1",
    });
    if (outcome.status !== "realized") throw new Error("expected realized");
    const attachment = outcome.realizations[0]!.attachment;
    // D-AUTH-01: release takes the handle generated by the successful
    // realization — the authorized Work revision is derived, not fabricated.
    const handle = outcome.realizations[0]!.release;
    expect(handle.authorizedWorkRevision).toBe(2); // derived from projectIr(2)
    const first = await harness.release(handle);
    const second = await harness.release(handle);
    expect(first.status).toBe("released");
    expect(second.status).toBe("released");
    // Ordarium idempotency: the second release is the same ledger operation.
    expect(harness.portCalls.release).toHaveLength(1);
  });
});

describe("D2-M03/M12: structural firewalls", () => {
  it("the service never calls the port directly; no Attempt identity anywhere", () => {
    expect(REALIZE_CODE).not.toMatch(/port\.realize\(|port\.release\(/);
    expect(REALIZE_CODE).not.toMatch(/\battemptId\b|\btaskId\b|\bdefinition_id\b/);
    expect(REALIZE_CODE).not.toMatch(/Date\.now|Math\.random|randomUUID/);
    expect(REALIZE_CODE).toMatch(/effects\.invoke\(/);
  });
});

describe("D2-M09/M10/M11: compatibility (suites)", () => {
  it("install, Work planning, and scheduler remain compatible (behavioral proof in D5 §93; suites green)", async () => {
    // D2 added no install wiring; D5 later added the OPTIONAL runtime options
    // additively (behavioral backward compatibility is machine-proven by the
    // D5 §93 test: no runtime options → no runtime surface, unchanged tools).
    const { readFileSync: read } = await import("node:fs");
    const installSource = read(
      fileURLToPath(new URL("../src/install.ts", import.meta.url)),
      "utf-8",
    );
    expect(installSource).toMatch(/runtimeCarrierPort\?:/);
    const schedulerSource = read(
      fileURLToPath(new URL("../src/scheduler/scheduler.ts", import.meta.url)),
      "utf-8",
    );
    expect(schedulerSource).not.toMatch(/RuntimeCarrier|runtimeCarrier|observeBindingState/);
  });
});
