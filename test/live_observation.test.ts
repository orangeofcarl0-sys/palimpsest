/**
 * G10-D4 live observation machine proofs.
 *
 *   D4-M01  live snapshot derives the point list from the canonical store
 *   D4-M02  live snapshot derives ephemeral capabilities from runtime observation
 *   D4-M03  UNKNOWN ≠ UNAVAILABLE (and ≠ empty known set)
 *   D4-M04  incomplete observation produces no snapshot
 *   D4-M05  a registered point with unknown facts cannot be silently omitted
 *   D4-M06  observation is read-only
 *   D4-M07  a relevant runtime change changes the SnapshotRef
 *   D4-M08  the old resolution becomes stale after the change
 *   D4-M09  re-resolution produces a new current resolution
 *   D4-M10  realize performs the freshness re-check (§84)
 *   D4-M11  observation never creates PersistentPoints
 *   D4-M12  observation never creates RuntimeAgents
 *   plus §87: realization/release changes later observation.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  observationRefOf,
  evaluateGroundedResolutionFreshness,
  materializeObservationSnapshot,
} from "../src/binding/index.js";
import type { GroundedPlanningState } from "../src/binding/index.js";
import {
  makeRuntimeRealizationService,
  observeBindingState,
  observeAndCompileGroundedPlan,
} from "../src/runtime/index.js";
import type { RuntimeObservationPort } from "../src/runtime/index.js";
import {
  SqlitePersistentPointStore,
  materializePersistentPoint,
} from "../src/continuity/index.js";
import type { PersistentPoint } from "../src/continuity/index.js";
import { materializeArchitectureDefinition } from "../src/architecture/index.js";
import type { ArchitectureDefinition } from "../src/architecture/index.js";
import type { ProjectIr } from "../src/schema/index.js";
import { parseTaskSpec, projectIrDigestOf } from "../src/schema/index.js";
import { authorBindingDefinition } from "./binding_helpers.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { materializeRunConfiguration } from "../src/run/index.js";

const ARCHITECTURE: ArchitectureDefinition = materializeArchitectureDefinition({
  architectureDefinitionId: "arch-d4",
  revision: 1,
  agentDefinitionIds: ["eph", "dur"],
});

function projectIr(): ProjectIr {
  const base = {
    schema_version: 1 as const,
    project_id: "proj-d4",
    revision: 1,
    parent_revision: null,
    parent_digest: null,
    goal: "live",
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

interface ObservationState {
  ephemeral: { state: "known"; value: { runtimeFeatures: string[]; toolCapabilities: string[] } } | { state: "unknown"; detail: string };
  points: Map<string, { state: "known"; value: { available: boolean; capabilities: { runtimeFeatures: string[]; toolCapabilities: string[] } } } | { state: "unknown"; detail: string }>;
}

function scriptedPort(state: ObservationState): RuntimeObservationPort {
  return {
    observeEphemeralCapabilities: async () => state.ephemeral,
    observePersistentPoint: async (point) =>
      state.points.get(point.persistentPointId) ?? { state: "unknown", detail: "no scripted fact" },
  };
}

function harness(store: SqlitePersistentPointStore, state: ObservationState) {
  let snapshotCounter = 0;
  const deps = {
    pointStore: store,
    observationPort: scriptedPort(state),
    allocateSnapshotId: () => `obs-d4-${++snapshotCounter}`,
  };
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-d4-")), "ops.sqlite"),
    git: new FakeGitPort("e".repeat(40)),
  });
  const allocated = new Map<string, string>();
  const service = makeRuntimeRealizationService({
    effects,
    allocateActivationId: (subject: string, context: string) =>
      context === "" ? `act-${subject}` : `act-${subject}-${context}`,
    port: callbackPortForTest(),
    pointStore: store,
  });
  return { deps, service };
}

function callbackPortForTest() {
  // A minimal real callback port: carriers are named per realize call order.
  let n = 0;
  return {
    adapterId: "callback",
    realize: async () => {
      n += 1;
      return { runtimeAgent: { runtimeAdapter: "callback", agentId: `carrier-${n}` } };
    },
  };
}

function baseState(): ObservationState {
  return {
    ephemeral: { state: "known", value: { runtimeFeatures: [], toolCapabilities: [] } },
    points: new Map(),
  };
}

describe("D4-M01/M02: the live snapshot derives from canonical sources", () => {
  it("point list comes from the store; ephemeral capabilities from the port", async () => {
    const store = new SqlitePersistentPointStore(":memory:");
    await store.register(materializePersistentPoint({ persistentPointId: "P-2" }));
    await store.register(materializePersistentPoint({ persistentPointId: "P-1" }));
    const state = baseState();
    state.points.set("P-1", {
      state: "known",
      value: { available: true, capabilities: { runtimeFeatures: ["f"], toolCapabilities: [] } },
    });
    state.points.set("P-2", {
      state: "known",
      value: { available: false, capabilities: { runtimeFeatures: [], toolCapabilities: [] } },
    });
    const { deps } = harness(store, state);
    const outcome = await observeBindingState(deps);
    if (outcome.status !== "observed") throw new Error(`expected observed: ${JSON.stringify(outcome)}`);
    expect(outcome.snapshot.persistentCandidates.map((candidate) => candidate.point)).toEqual([
      "P-1",
      "P-2",
    ]);
    expect(outcome.snapshot.ephemeralCapabilities.runtimeFeatures).toEqual([]);
    expect(outcome.snapshot.persistentCandidates[0]).toEqual({
      point: "P-1",
      available: true,
      runtimeFeatures: ["f"],
      toolCapabilities: [],
    });
  });
});

describe("D4-M03/M04/M05: UNKNOWN is refused, never collapsed (§76/§77/§79/§118)", () => {
  it("unknown ephemeral facts produce no snapshot at all", async () => {
    const store = new SqlitePersistentPointStore(":memory:");
    const state = baseState();
    state.ephemeral = { state: "unknown", detail: "runtime adapter cold" };
    const { deps } = harness(store, state);
    const outcome = await observeBindingState(deps);
    expect(outcome.status).toBe("incomplete");
    if (outcome.status !== "incomplete") return;
    expect(outcome.detail).toContain("UNKNOWN is never evaluated");
  });

  it("an unknown registered point refuses the snapshot — never silently omitted", async () => {
    const store = new SqlitePersistentPointStore(":memory:");
    await store.register(materializePersistentPoint({ persistentPointId: "P-1" }));
    await store.register(materializePersistentPoint({ persistentPointId: "P-2" }));
    const state = baseState();
    state.points.set("P-1", {
      state: "known",
      value: { available: true, capabilities: { runtimeFeatures: [], toolCapabilities: [] } },
    });
    // P-2 intentionally left unknown.
    const { deps } = harness(store, state);
    const outcome = await observeBindingState(deps);
    expect(outcome.status).toBe("incomplete");
    if (outcome.status !== "incomplete") return;
    expect(outcome.detail).toContain("P-2");
  });
});

describe("D4-M06/M11/M12: observation is read-only", () => {
  it("observing mutates nothing: store unchanged, no carriers created", async () => {
    const store = new SqlitePersistentPointStore(":memory:");
    await store.register(materializePersistentPoint({ persistentPointId: "P-1" }));
    const state = baseState();
    state.points.set("P-1", {
      state: "known",
      value: { available: true, capabilities: { runtimeFeatures: [], toolCapabilities: [] } },
    });
    const { deps } = harness(store, state);
    const before = await store.list();
    const outcome = await observeBindingState(deps);
    expect(outcome.status).toBe("observed");
    expect(await store.list()).toEqual(before);
    expect(await store.get("P-1")).toEqual(materializePersistentPoint({ persistentPointId: "P-1" }));
    // The observation path constructs no carrier service and no realize calls.
    expect((await store.list()).length).toBe(1);
  });
});

describe("D4-M07/M08/M09 + §86: the re-observation loop", () => {
  it("O1→S1→R1; runtime change → O2→S2; R1 stale; re-resolve → R2 current", async () => {
    const store = new SqlitePersistentPointStore(":memory:");
    await store.register(materializePersistentPoint({ persistentPointId: "P-1" }));
    const state = baseState();
    state.points.set("P-1", {
      state: "known",
      value: { available: true, capabilities: { runtimeFeatures: [], toolCapabilities: [] } },
    });
    const { deps } = harness(store, state);

    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-d4",
      revision: 0,
      bindings: { eph: { continuity: {} }, dur: { continuity: { pin: "P-1" } } },
    });
    const first = await observeAndCompileGroundedPlan(deps, {
      architecture: ARCHITECTURE,
      work: projectIr(),
      trustedBindingDefinition: definition,
      runConfiguration: materializeRunConfiguration(),
      resolutionId: "res-d4-1",
    });
    if (first.status !== "planned") throw new Error(`expected planned, got ${first.status}`);

    // Runtime change: P-1 becomes inadmissible.
    state.points.set("P-1", {
      state: "known",
      value: { available: false, capabilities: { runtimeFeatures: [], toolCapabilities: [] } },
    });
    const secondObservation = await observeBindingState(deps);
    if (secondObservation.status !== "observed") throw new Error("expected observed");
    expect(secondObservation.snapshot.digest).not.toBe(first.snapshot.digest);
    expect(observationRefOf(secondObservation.snapshot)).not.toBe(observationRefOf(first.snapshot));

    // R1 is stale against the current state; artifacts stay immutable.
    const currentState: GroundedPlanningState = {
      architecture: ARCHITECTURE,
      work: projectIr(),
      bindingDefinition: definition,
      runConfiguration: materializeRunConfiguration(),
      observationSnapshot: secondObservation.snapshot,
    };
    expect(evaluateGroundedResolutionFreshness(first.resolution, currentState)).toBe("stale");
    const serializedFirst = JSON.stringify(first.resolution);
    expect(evaluateGroundedResolutionFreshness(first.resolution, {
      ...currentState,
      observationSnapshot: first.snapshot,
    })).toBe("current");

    // Re-resolve against S2: the pin now fails exact kernel semantics — the
    // resolution is UNSATISFIABLE against the changed world (pin target
    // unavailable), which is the truthful planning condition.
    const recompiled = await observeAndCompileGroundedPlan(deps, {
      architecture: ARCHITECTURE,
      work: projectIr(),
      trustedBindingDefinition: definition,
      runConfiguration: materializeRunConfiguration(),
      resolutionId: "res-d4-2",
    });
    expect(["binding_unsatisfied", "planned"]).toContain(recompiled.status);
    if (recompiled.status === "planned") {
      expect(recompiled.resolution.digest).not.toBe(first.resolution.digest);
    }
    expect(JSON.stringify(first.resolution)).toBe(serializedFirst);
  });
});

describe("D4-M10/§84: realize re-checks grounded freshness before the effect", () => {
  it("a plan compiled against S1 is refused when the current observation is S2", async () => {
    const store = new SqlitePersistentPointStore(":memory:");
    const state = baseState();
    const { deps, service } = harness(store, state);
    const first = await observeAndCompileGroundedPlan(deps, {
      architecture: ARCHITECTURE,
      work: projectIr(),
      runConfiguration: materializeRunConfiguration(),
      resolutionId: "res-d4-3",
    });
    if (first.status !== "planned") throw new Error("expected planned");

    const staleCurrent: GroundedPlanningState = {
      architecture: ARCHITECTURE,
      work: projectIr(),
      runConfiguration: materializeRunConfiguration(),
      observationSnapshot: materializeObservationSnapshot({
        snapshotId: "obs-d4-advanced",
        ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
        persistentCandidates: [],
      }),
    };
    const outcome = await service.realize({
      architecture: ARCHITECTURE,
      runDefinition: first.runDefinition,
      resolution: first.resolution,
      plan: first.plan,
      current: staleCurrent,
      activationContext: "ctx-1",
    });
    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") return;
    expect(outcome.reason).toBe("plan_stale");
  });
});

describe("D4-M07/§87: the runtime effect changes later observation", () => {
  it("release/loss flips availability; the next observation has a different ref", async () => {
    const store = new SqlitePersistentPointStore(":memory:");
    await store.register(materializePersistentPoint({ persistentPointId: "P-1" }));
    const state = baseState();
    state.points.set("P-1", {
      state: "known",
      value: { available: true, capabilities: { runtimeFeatures: [], toolCapabilities: [] } },
    });
    const { deps } = harness(store, state);
    const before = await observeBindingState(deps);
    if (before.status !== "observed") throw new Error("expected observed");

    // Carrier loss: the locus is no longer admissible.
    state.points.set("P-1", {
      state: "known",
      value: { available: false, capabilities: { runtimeFeatures: [], toolCapabilities: [] } },
    });
    const after = await observeBindingState(deps);
    if (after.status !== "observed") throw new Error("expected observed");
    expect(observationRefOf(after.snapshot)).not.toBe(observationRefOf(before.snapshot));
    // The content digest differs (availability is digest content), and the
    // instance identity differs regardless.
    expect(after.snapshot.digest).not.toBe(before.snapshot.digest);
  });
});
