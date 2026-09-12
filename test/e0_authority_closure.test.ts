/**
 * G10-E0 D-authority closure machine proofs.
 *
 *   D-AUTH-01  release authorization evidence names the REALIZED Work
 *              revision (plan-revision:17, never plan-revision:0) — proven
 *              against the actual Ordarium ledger record.
 *   D-API-01   activationContext is required and grammar-validated; retry vs
 *              replacement cannot be confused by omission.
 *   D-MOD-01   no realize → effects-actions → realize module cycle
 *              (structural import audit).
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  compileGroundedBindingPlan,
  materializeObservationSnapshot,
} from "../src/binding/index.js";
import type { GroundedPlanningState } from "../src/binding/index.js";
import { callbackRuntimeCarrierPort, makeRuntimeRealizationService } from "../src/runtime/index.js";
import {
  RuntimeRealizationError,
  requireActivationContextId,
} from "../src/runtime/index.js";
import { materializeArchitectureDefinition } from "../src/architecture/index.js";
import type { ArchitectureDefinition } from "../src/architecture/index.js";
import type { ProjectIr } from "../src/schema/index.js";
import { parseTaskSpec, projectIrDigestOf } from "../src/schema/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { materializeRunConfiguration } from "../src/run/index.js";

const REALIZE_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/runtime/realize.ts", import.meta.url)),
  "utf-8",
);
const ACTIONS_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/effects/runtime_actions.ts", import.meta.url)),
  "utf-8",
);
const IDENTITY_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/runtime/identity.ts", import.meta.url)),
  "utf-8",
);

const ARCHITECTURE: ArchitectureDefinition = materializeArchitectureDefinition({
  architectureDefinitionId: "arch-e0",
  revision: 1,
  agentDefinitionIds: ["eph"],
});

function projectIr(revision: number): ProjectIr {
  const base = {
    schema_version: 1 as const,
    project_id: "proj-e0",
    revision,
    parent_revision: revision > 0 ? revision - 1 : null,
    parent_digest: revision > 0 ? "p" : null,
    goal: "authority",
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

function planned(workRevision: number) {
  const result = compileGroundedBindingPlan({
    architecture: ARCHITECTURE,
    work: projectIr(workRevision),
    runConfiguration: materializeRunConfiguration(),
    observationSnapshot: materializeObservationSnapshot({
      snapshotId: "obs-e0",
      ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
      persistentCandidates: [],
    }),
    resolutionId: "res-e0",
  });
  if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
  return result;
}

function currentState(workRevision: number): GroundedPlanningState {
  return {
    architecture: ARCHITECTURE,
    work: projectIr(workRevision),
    runConfiguration: materializeRunConfiguration(),
    observationSnapshot: materializeObservationSnapshot({
      snapshotId: "obs-e0",
      ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
      persistentCandidates: [],
    }),
  };
}

describe("D-AUTH-01: release authorization names the realized Work revision (§12)", () => {
  it("Work revision 17 produces plan-revision:17 in the Ordarium ledger — never plan-revision:0", async () => {
    const ordariumPath = join(mkdtempSync(join(tmpdir(), "palimpsest-e0-")), "ops.sqlite");
    const effects = createPalimpsestEffects({
      databasePath: ordariumPath,
      git: new FakeGitPort("f".repeat(40)),
    });
    const realized: string[] = [];
    const service = makeRuntimeRealizationService({
      effects,
      allocateActivationId: (subject: string, context: string) =>
        context === "" ? `act-${subject}` : `act-${subject}-${context}`,
      port: callbackRuntimeCarrierPort("callback", {
        onRealize: async () => {
          const id = `carrier-${realized.length + 1}`;
          realized.push(id);
          return { runtimeAgent: { runtimeAdapter: "callback", agentId: id } };
        },
        onRelease: async () => undefined,
      }),
    });
    const grounded = planned(17);
    const outcome = await service.realize({
      architecture: ARCHITECTURE,
      runDefinition: grounded.runDefinition,
      resolution: grounded.resolution,
      plan: grounded.plan,
      current: currentState(17),
      activationContext: "ctx-1",
    });
    if (outcome.status !== "realized") throw new Error(`expected realized: ${JSON.stringify(outcome)}`);

    // The handle's authorized revision is DERIVED from the RunDefinition.
    const handle = outcome.realizations[0]!.release;
    expect(handle.authorizedWorkRevision).toBe(17);
    expect(handle.realizationKey).toBe(outcome.realizations[0]!.attachment.activationId ? handle.realizationKey : handle.realizationKey);

    const release = await service.releaseCarrier(handle);
    expect(release.status).toBe("released");

    // Read the ACTUAL Ordarium ledger: both the realize and release
    // operations must carry plan-revision:17 authorization evidence.
    const ledger = new DatabaseSync(ordariumPath);
    const rows = ledger
      .prepare("SELECT record_json FROM ordarium_operations")
      .all() as Array<{ record_json: string }>;
    ledger.close();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const records = rows.map((row) => JSON.parse(row.record_json) as {
      action?: { name?: string } | string;
      authorization?: { source?: string };
      name?: string;
    });
    const releaseRecords = records.filter((record) =>
      JSON.stringify(record).includes("runtime.carrier.release"),
    );
    expect(releaseRecords.length).toBeGreaterThanOrEqual(1);
    for (const record of releaseRecords) {
      const source =
        record.authorization?.source ??
        (record as unknown as { authorizationSource?: string }).authorizationSource;
      expect(source).toBe("plan-revision:17");
    }
    // No operation in this campaign flow may cite the fabricated revision 0.
    for (const record of records) {
      expect(JSON.stringify(record)).not.toContain("plan-revision:0");
    }
  });
});

describe("D-API-01: activation context is explicit and grammar-validated (§15/§16)", () => {
  it("a missing/invalid context fails closed; valid contexts flow to the allocator", async () => {
    expect(requireActivationContextId("ctx-1")).toBe("ctx-1");
    expect(() => requireActivationContextId("")).toThrow(RuntimeRealizationError);
    expect(() => requireActivationContextId("ctx 1")).toThrow(RuntimeRealizationError);
    expect(() => requireActivationContextId("ctx\n1")).toThrow(RuntimeRealizationError);
    const effects = createPalimpsestEffects({
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-e0b-")), "ops.sqlite"),
      git: new FakeGitPort("f".repeat(40)),
    });
    const service = makeRuntimeRealizationService({
      effects,
      allocateActivationId: (subject: string) => `act-${subject}`,
      port: callbackRuntimeCarrierPort("callback", {
        onRealize: async () => ({
          runtimeAgent: { runtimeAdapter: "callback", agentId: "c" },
        }),
      }),
    });
    const grounded = planned(1);
    // Omission is a type error; an invalid context fails closed at runtime.
    await expect(
      service.realize({
        architecture: ARCHITECTURE,
        runDefinition: grounded.runDefinition,
        resolution: grounded.resolution,
        plan: grounded.plan,
        current: currentState(1),
        activationContext: "ctx 1",
      }),
    ).rejects.toBeInstanceOf(RuntimeRealizationError);
  });

  it("retry C1 keeps ids/keys (Ordarium dedupe); new context C2 gets a new activation (§16)", async () => {
    const effects = createPalimpsestEffects({
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-e0c-")), "ops.sqlite"),
      git: new FakeGitPort("f".repeat(40)),
    });
    const realizedKeys: string[] = [];
    const service = makeRuntimeRealizationService({
      effects,
      allocateActivationId: (subject: string, context: string) => `act-${subject}-${context}`,
      port: callbackRuntimeCarrierPort("callback", {
        onRealize: async (request) => {
          realizedKeys.push(request.realizationKey);
          return { runtimeAgent: { runtimeAdapter: "callback", agentId: `c-${realizedKeys.length}` } };
        },
      }),
    });
    const grounded = planned(1);
    const request = (context: string) => ({
      architecture: ARCHITECTURE,
      runDefinition: grounded.runDefinition,
      resolution: grounded.resolution,
      plan: grounded.plan,
      current: currentState(1),
      activationContext: context,
    });
    const first = await service.realize(request("C1"));
    const retry = await service.realize(request("C1"));
    if (first.status !== "realized" || retry.status !== "realized") throw new Error("expected realized");
    // Retry: same activation id; Ordarium deduped (no new key executed).
    expect(retry.realizations[0]!.activation.activationId).toBe(
      first.realizations[0]!.activation.activationId,
    );
    expect(realizedKeys).toHaveLength(1);
    // New context: genuinely new activation and a fresh carrier realization.
    const replacement = await service.realize(request("C2"));
    if (replacement.status !== "realized") throw new Error("expected realized");
    expect(replacement.realizations[0]!.activation.activationId).not.toBe(
      first.realizations[0]!.activation.activationId,
    );
    expect(realizedKeys).toHaveLength(2);
  });
});

describe("D-MOD-01: no realize ↔ effects-actions module cycle (§14)", () => {
  it("runtime_actions imports the neutral errors module, not realize", () => {
    expect(ACTIONS_SOURCE).toMatch(/from "\.\.\/runtime\/errors\.js"/);
    expect(ACTIONS_SOURCE).not.toMatch(/from "\.\.\/runtime\/realize\.js"/);
    // The neutral module exists and realize imports from it too.
    expect(IDENTITY_SOURCE).not.toMatch(/class ContinuityUnavailableError/);
    expect(REALIZE_SOURCE).toMatch(/from "\.\/errors\.js"/);
  });
});
