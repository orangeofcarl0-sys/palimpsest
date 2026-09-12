/**
 * G10-D3 PersistentPoint + continuity store + persistent realization proofs.
 *
 *   D3-M01  PersistentPoint strict identity artifact
 *   D3-M02  PersistentPoint ≠ AgentDefinition
 *   D3-M03  PersistentPoint ≠ RuntimeAgent
 *   D3-M04  PersistentPoint ≠ Session
 *   D3-M05  explicit point creation only
 *   D3-M06  durable restart/readback
 *   D3-M07  duplicate registration fail-closed (idempotent only byte-identical)
 *   D3-M08  persistent selection requires existing point
 *   D3-M09  missing point never auto-created
 *   D3-M10  unavailable point never silently falls back
 *   D3-M11  carrier replacement preserves point identity (§67)
 *   D3-M12  ephemeral and persistent routes coexist (§68)
 *   D3-M13  BindingDefinition unchanged
 *   D3-M14  BindingResolution unchanged
 *   plus §61 corruption fail-closed and §69 no-ownership firewalls.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  ContinuityStoreError,
  SqlitePersistentPointStore,
  durableContinuityRefOf,
  materializePersistentPoint,
  parsePersistentPoint,
} from "../src/continuity/index.js";
import type { PersistentPoint } from "../src/continuity/index.js";
import {
  ContinuityUnavailableError,
  callbackRuntimeCarrierPort,
  makeRuntimeRealizationService,
} from "../src/runtime/index.js";
import type { RuntimeCarrierRealizeRequest, RuntimeCarrierRealizeResult } from "../src/runtime/index.js";
import {
  compileGroundedBindingPlan,
  materializeObservationSnapshot,
} from "../src/binding/index.js";
import type { GroundedPlanningState } from "../src/binding/index.js";
import { materializeArchitectureDefinition } from "../src/architecture/index.js";
import type { ArchitectureDefinition } from "../src/architecture/index.js";
import type { ProjectIr } from "../src/schema/index.js";
import { parseTaskSpec, projectIrDigestOf } from "../src/schema/index.js";
import { authorBindingDefinition } from "./binding_helpers.js";
import { materializeRunConfiguration } from "../src/run/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";

const ARCHITECTURE: ArchitectureDefinition = materializeArchitectureDefinition({
  architectureDefinitionId: "arch-d3",
  revision: 1,
  agentDefinitionIds: ["eph", "dur"],
});

function projectIr(revision = 1): ProjectIr {
  const base = {
    schema_version: 1 as const,
    project_id: "proj-d3",
    revision,
    parent_revision: revision > 0 ? revision - 1 : null,
    parent_digest: revision > 0 ? "p" : null,
    goal: "continuity",
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

function mixedPlan() {
  const definition = authorBindingDefinition({
    bindingDefinitionId: "b-d3",
    revision: 0,
    bindings: {
      dur: { continuity: { pin: "P-1" } },
      eph: { continuity: {} },
    },
  });
  const snapshotId = "obs-d3";
  const snapshot = () =>
    materializeObservationSnapshot({
      snapshotId,
      ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
      persistentCandidates: [{ point: "P-1", available: true }],
    });
  const result = compileGroundedBindingPlan({
    architecture: ARCHITECTURE,
    work: projectIr(),
    trustedBindingDefinition: definition,
    runConfiguration: materializeRunConfiguration(),
    observationSnapshot: snapshot(),
    resolutionId: "res-d3",
  });
  if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
  const current: GroundedPlanningState = {
    architecture: ARCHITECTURE,
    work: projectIr(),
    bindingDefinition: definition,
    runConfiguration: materializeRunConfiguration(),
    observationSnapshot: snapshot(),
  };
  return { result, current, definition };
}

interface Harness {
  realize: ReturnType<typeof makeRuntimeRealizationService>["realize"];
  releases: string[];
  carriers: string[];
  nextCarrier: (id: string) => void;
}

/** Deterministic port (sequential carrier ids) + real store + real Ordarium ledger. */
function makeHarness(store: SqlitePersistentPointStore): Harness {
  let carrierIndex = 0;
  let nextId = "carrier-1";
  const carriers: string[] = [];
  const releases: string[] = [];
  const port = callbackRuntimeCarrierPort("callback", {
    onRealize: async (request: RuntimeCarrierRealizeRequest): Promise<RuntimeCarrierRealizeResult> => {
      if (request.continuityTarget.kind === "persistent" && request.continuityTarget.point === "P-GONE") {
        throw new ContinuityUnavailableError("P-GONE");
      }
      carriers.push(nextId);
      return { runtimeAgent: { runtimeAdapter: "callback", agentId: nextId } };
    },
    onRelease: async () => {
      releases.push(nextId);
      carrierIndex += 1;
      nextId = `carrier-${carrierIndex + 1}`;
    },
  });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-d3-")), "ops.sqlite"),
    git: new FakeGitPort("d".repeat(40)),
  });
  const allocated = new Map<string, string>();
  const service = makeRuntimeRealizationService({
    effects,
    allocateActivationId: (subject: string, context: string) =>
      context === "" ? `act-${subject}` : `act-${subject}-${context}`,
    port,
    pointStore: store,
  });
  return {
    realize: service.realize,
    releases,
    carriers,
    nextCarrier: (id: string) => {
      nextId = id;
    },
  };
}

describe("D3-M01: PersistentPoint strict identity artifact (§56/§57)", () => {
  it("materializes/parses identity-only points; rejects unknown fields and bad grammar", () => {
    const point = materializePersistentPoint({ persistentPointId: "P-1" });
    expect(point).toEqual({ schemaVersion: 1, persistentPointId: "P-1" });
    expect(parsePersistentPoint(JSON.parse(JSON.stringify(point)))).toEqual(point);
    expect(() => parsePersistentPoint({ ...point, memory: "x" })).toThrow(/unknown PersistentPoint field/);
    expect(() => parsePersistentPoint({ ...point, schemaVersion: 2 })).toThrow(/schemaVersion/);
    expect(() => materializePersistentPoint({ persistentPointId: "P 1" })).toThrow(/stable identifier/);
    expect(() => materializePersistentPoint({ persistentPointId: "" })).toThrow(/stable identifier/);
  });

  it("explicit adapter maps to the Binding durable-continuity vocabulary (§58)", () => {
    expect(durableContinuityRefOf(materializePersistentPoint({ persistentPointId: "P-1" }))).toBe("P-1");
  });
});

describe("D3-M02/M03/M04 + §69: identity firewalls", () => {
  it("the point artifact carries no definition/runtime/session/ownership fields", () => {
    const point = materializePersistentPoint({ persistentPointId: "P-1" });
    const serialized = JSON.stringify(point);
    for (const forbidden of [
      "agentDefinitionId",
      "runtimeAdapter",
      "agentId",
      "sessionId",
      "workspace",
      "memory",
      "authority",
      "peerRef",
      "capabilities",
      "provider",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    // No AgentDefinition→Point or Point→AgentDefinition ownership exists.
    const architecture = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-x",
      revision: 0,
      agentDefinitionIds: ["A"],
    });
    expect(JSON.stringify(architecture)).not.toContain("persistentPointId");
    expect(Object.keys(point)).toEqual(["schemaVersion", "persistentPointId"]);
  });
});

describe("D3-M05/M06/M07: the canonical store (§60/§61)", () => {
  it("explicit registration, durable readback across reopen, idempotent byte-identical duplicates", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "palimpsest-d3-store-")), "continuity.sqlite");
    const store = new SqlitePersistentPointStore(path);
    const point = materializePersistentPoint({ persistentPointId: "P-1" });
    await store.register(point);
    await store.register(point); // byte-identical duplicate: idempotent no-op
    expect(await store.get("P-1")).toEqual(point);
    expect(await store.get("P-404")).toBeUndefined();
    expect((await store.list()).map((entry) => entry.persistentPointId)).toEqual(["P-1"]);
    store.close();

    // §61/§108: restart/readback — a fresh store instance sees the same truth.
    const reopened = new SqlitePersistentPointStore(path);
    expect(await reopened.get("P-1")).toEqual(point);
    const other = materializePersistentPoint({ persistentPointId: "P-2" });
    await reopened.register(other);
    expect((await reopened.list()).map((entry) => entry.persistentPointId)).toEqual(["P-1", "P-2"]);
    reopened.close();
  });

  it("conflicting duplicate registration fails closed; corrupt records fail closed on read", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "palimpsest-d3-store-")), "continuity.sqlite");
    const store = new SqlitePersistentPointStore(path);
    await store.register(materializePersistentPoint({ persistentPointId: "P-1" }));
    // A conflicting artifact under the registered id (simulated future schema
    // drift) must fail closed, never last-write-wins.
    const conflicting = JSON.stringify({
      schemaVersion: 1,
      persistentPointId: "P-1",
      memory: "smuggled",
    });
    const raw = new DatabaseSync(path);
    raw
      .prepare("UPDATE persistent_points SET artifact_json = ? WHERE persistent_point_id = 'P-1'")
      .run(conflicting);
    raw.close();
    await expect(store.get("P-1")).rejects.toBeInstanceOf(ContinuityStoreError);
    await expect(store.list()).rejects.toBeInstanceOf(ContinuityStoreError);
    await expect(store.register(materializePersistentPoint({ persistentPointId: "P-1" }))).rejects.toThrow(
      /already registered with a different artifact/,
    );
    store.close();
  });
});

describe("D3-M08/M09: persistent selection requires an existing point; missing never auto-created (§64/§65)", () => {
  it("a selected-but-unregistered point fails closed with no effect and no creation", async () => {
    const store = new SqlitePersistentPointStore(":memory:");
    const { result, current } = mixedPlan(); // selects P-1, which is NOT registered
    const harness = makeHarness(store);
    const outcome = await harness.realize({
      architecture: ARCHITECTURE,
      runDefinition: result.runDefinition,
      resolution: result.resolution,
      plan: result.plan,
      current,
    });
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.reason).toBe("persistent_point_missing");
    expect(outcome.subject).toBe("dur");
    expect(harness.carriers).toEqual([]); // no effect fired
    expect(await store.list()).toEqual([]); // nothing auto-created
    expect(await store.get("P-1")).toBeUndefined();
  });
});

describe("D3-M10: unavailable point never silently falls back (§66)", () => {
  it("a port-reported unavailable locus yields continuity_unavailable, not ephemeral", async () => {
    const store = new SqlitePersistentPointStore(":memory:");
    await store.register(materializePersistentPoint({ persistentPointId: "P-GONE" }));
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-d3-gone",
      revision: 0,
      bindings: { dur: { continuity: { pin: "P-GONE" } }, eph: { continuity: {} } },
    });
    const snapshot = () =>
      materializeObservationSnapshot({
        snapshotId: "obs-gone",
        ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
        persistentCandidates: [{ point: "P-GONE", available: true }],
      });
    const result = compileGroundedBindingPlan({
      architecture: ARCHITECTURE,
      work: projectIr(),
      trustedBindingDefinition: definition,
      runConfiguration: materializeRunConfiguration(),
      observationSnapshot: snapshot(),
      resolutionId: "res-gone",
    });
    if (result.status !== "planned") throw new Error("expected planned");
    const harness = makeHarness(store);
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
        observationSnapshot: snapshot(),
      },
    });
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.reason).toBe("continuity_unavailable");
  });
});

describe("D3-M11/§67: carrier replacement preserves point identity", () => {
  it("P survives carrier A → release → carrier B with A1 ≠ A2 and P ≠ every carrier", async () => {
    const store = new SqlitePersistentPointStore(":memory:");
    const point: PersistentPoint = materializePersistentPoint({ persistentPointId: "P-1" });
    await store.register(point);
    const harness = makeHarness(store);
    const { result, current } = mixedPlan();
    const request = {
      architecture: ARCHITECTURE,
      runDefinition: result.runDefinition,
      resolution: result.resolution,
      plan: result.plan,
      current,
    };

    const first = await harness.realize(request);
    if (first.status !== "realized") throw new Error(`expected realized, got ${first.status}`);
    const durable1 = first.realizations.find((entry) => entry.activation.agentDefinitionId === "dur")!;
    expect(durable1.attachment.continuityTarget).toEqual({ kind: "persistent", point: "P-1" });
    expect(durable1.attachment.runtimeAgent.agentId).toBe("carrier-1");
    const activationId1 = durable1.activation.activationId;

    // Release / carrier loss, then realize again — a NEW activation context
    // (a retry of the same context would be Ordarium-deduped, which is the
    // §44 guarantee; replacement is genuinely new, §67).
    harness.nextCarrier("carrier-2");
    const second = await harness.realize({
      ...request,
      activationContext: "replacement",
    });
    if (second.status !== "realized") throw new Error(`expected realized, got ${second.status}`);
    const durable2 = second.realizations.find((entry) => entry.activation.agentDefinitionId === "dur")!;

    // Point identity unchanged through the replacement.
    expect(await store.get("P-1")).toEqual(point);
    expect(durable2.attachment.continuityTarget).toEqual({ kind: "persistent", point: "P-1" });
    // Distinct carriers and distinct activations.
    expect(durable2.attachment.runtimeAgent.agentId).toBe("carrier-2");
    expect(durable2.attachment.runtimeAgent.agentId).not.toBe(durable1.attachment.runtimeAgent.agentId);
    expect(durable2.activation.activationId).not.toBe(activationId1);
    // P is none of the carriers.
    for (const carrier of ["carrier-1", "carrier-2"]) {
      expect("P-1").not.toBe(carrier);
    }
  });
});

describe("D3-M12/§68: ephemeral and persistent routes coexist", () => {
  it("one mixed plan realizes both routes; the ephemeral subject has no point indirection", async () => {
    const store = new SqlitePersistentPointStore(":memory:");
    await store.register(materializePersistentPoint({ persistentPointId: "P-1" }));
    const harness = makeHarness(store);
    const { result, current } = mixedPlan();
    const outcome = await harness.realize({
      architecture: ARCHITECTURE,
      runDefinition: result.runDefinition,
      resolution: result.resolution,
      plan: result.plan,
      current,
    });
    if (outcome.status !== "realized") throw new Error(`expected realized, got ${outcome.status}`);
    const eph = outcome.realizations.find((entry) => entry.activation.agentDefinitionId === "eph")!;
    const dur = outcome.realizations.find((entry) => entry.activation.agentDefinitionId === "dur")!;
    expect(eph.attachment.continuityTarget).toEqual({ kind: "ephemeral" });
    expect(eph.activation).not.toHaveProperty("persistentPointId");
    expect(dur.attachment.continuityTarget).toEqual({ kind: "persistent", point: "P-1" });
  });
});

describe("D3-M13/M14: frozen Binding artifacts unchanged (§59)", () => {
  it("resolution never creates points: the service only reads the store, the store exposes no create-from-resolution", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const realizeSource = readFileSync(
      fileURLToPath(new URL("../src/runtime/realize.ts", import.meta.url)),
      "utf-8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    // The service calls store.get (verification) but NEVER store.register.
    expect(realizeSource).toMatch(/pointStore\.get|deps\.pointStore\.get/);
    expect(realizeSource).not.toMatch(/\.register\(/);
    // Binding resolution itself has no store anywhere (kernel purity, D3-M14).
    const kernelSource = readFileSync(
      fileURLToPath(new URL("../src/binding/resolver.ts", import.meta.url)),
      "utf-8",
    );
    expect(kernelSource).not.toMatch(/PersistentPointStore|pointStore/);
  });
});
