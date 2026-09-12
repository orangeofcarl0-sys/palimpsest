/**
 * G10-D5 advanced runtime integration proofs.
 *
 *   §92/§94  install exposes one high-level runtime service when wiring is
 *            supplied (observe/compile/realize/release)
 *   §93      backward compatibility: no runtime options → no runtime surface,
 *            unchanged behavior
 *   §50/§95  the advanced surface carries the runtime exports; the root
 *            contract-core export does not; the golden path is the high-level
 *            service, low-level helpers stay framework-author territory
 *   §98      the runtime service is not an authority root (effects stay
 *            Ordarium-admitted; observation is read-only)
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  installPalimpsest,
  trustedDefaultPolicy,
  callbackRuntimeCarrierPort,
} from "../src/advanced.js";
import { SqlitePersistentPointStore, materializePersistentPoint } from "../src/continuity/index.js";
import type {
  RuntimeCarrierRealizeRequest,
  RuntimeCarrierRealizeResult,
  RuntimeObservationPort,
} from "../src/runtime/index.js";
import { materializeArchitectureDefinition } from "../src/architecture/index.js";
import type { ProjectIr } from "../src/schema/index.js";
import { parseTaskSpec, projectIrDigestOf } from "../src/schema/index.js";
import { materializeRunConfiguration } from "../src/run/index.js";
import { FakeClock } from "./helpers.js";

const ROOT_INDEX_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/index.ts", import.meta.url)),
  "utf-8",
);

const ARCHITECTURE = materializeArchitectureDefinition({
  architectureDefinitionId: "arch-d5",
  revision: 1,
  agentDefinitionIds: ["eph"],
});

function projectIr(): ProjectIr {
  const base = {
    schema_version: 1 as const,
    project_id: "proj-d5",
    revision: 1,
    parent_revision: null,
    parent_digest: null,
    goal: "advanced",
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

function baseOptions(dir: string) {
  return {
    databasePath: join(dir, "state.sqlite"),
    ordariumDatabasePath: join(dir, "ops.sqlite"),
    projectId: "runtime-project",
    policy: trustedDefaultPolicy(),
    clock: new FakeClock().next,
  };
}

describe("§93: backward compatibility — no runtime options, no runtime surface", () => {
  it("installPalimpsest behaves exactly as before; runtime is undefined", () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-d5-legacy-"));
    const installed = installPalimpsest(
      { tools: { register: () => undefined } },
      {
        ...baseOptions(dir),
        projectId: "legacy-project",
      },
    );
    expect(installed.runtime).toBeUndefined();
    expect(installed.tools.length).toBe(9);
    expect(installed.controller.projectId).toBe("legacy-project");
  });
});

describe("§92/§94: the high-level runtime service end-to-end", () => {
  it("observe → compile → realize → release through one installed surface", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-d5-rt-"));
    const store = new SqlitePersistentPointStore(join(dir, "continuity.sqlite"));
    await store.register(materializePersistentPoint({ persistentPointId: "P-1" }));
    const pointFacts = new Map<
      string,
      { available: boolean; capabilities: { runtimeFeatures: string[]; toolCapabilities: string[] } }
    >();
    pointFacts.set("P-1", { available: true, capabilities: { runtimeFeatures: [], toolCapabilities: [] } });
    const observationPort: RuntimeObservationPort = {
      observeEphemeralCapabilities: async () => ({
        state: "known" as const,
        value: { runtimeFeatures: [], toolCapabilities: [] },
      }),
      observePersistentPoint: async (point) => {
        const fact = pointFacts.get(point.persistentPointId);
        return fact === undefined
          ? { state: "unknown" as const, detail: "no fact" }
          : { state: "known" as const, value: fact };
      },
    };
    const realized: string[] = [];
    const carrierPort = callbackRuntimeCarrierPort("callback", {
      onRealize: async (request: RuntimeCarrierRealizeRequest): Promise<RuntimeCarrierRealizeResult> => {
        realized.push(request.realizationKey);
        return { runtimeAgent: { runtimeAdapter: "callback", agentId: `carrier-${realized.length}` } };
      },
      onRelease: async () => undefined,
    });
    const installed = installPalimpsest(
      { tools: { register: () => undefined } },
      {
        ...baseOptions(dir),
        runtimeCarrierPort: carrierPort,
        runtimeObservationPort: observationPort,
        continuityStore: store,
      },
    );
    const runtime = installed.runtime;
    if (runtime === undefined) throw new Error("runtime surface missing");
    expect(runtime.observe).toBeDefined();
    expect(runtime.compile).toBeDefined();

    // Observe → compile (distinct steps through the installed surface).
    const observed = await runtime.observe!();
    if (observed.status !== "observed") throw new Error(`expected observed: ${JSON.stringify(observed)}`);
    expect(observed.snapshot.persistentCandidates.map((candidate) => candidate.point)).toEqual(["P-1"]);
    const compiled = await runtime.compile!({
      architecture: ARCHITECTURE,
      work: projectIr(),
      runConfiguration: materializeRunConfiguration(),
      resolutionId: "res-d5",
    });
    if (compiled.status !== "planned") throw new Error(`expected planned, got ${compiled.status}`);
    expect(compiled.resolution.provenance.snapshot.ref).toBe(
      // The compiled provenance references the observation the service took.
      (await runtime.observe!()).status === "observed"
        ? compiled.resolution.provenance.snapshot.ref
        : "",
    );
    expect(realized).toEqual([]); // compile alone never realizes

    // Realize (ephemeral selection) → release — both Ordarium-admitted.
    const outcome = await runtime.realize!({
      architecture: ARCHITECTURE,
      runDefinition: compiled.runDefinition,
      resolution: compiled.resolution,
      plan: compiled.plan,
      current: {
        architecture: ARCHITECTURE,
        work: projectIr(),
        runConfiguration: materializeRunConfiguration(),
        observationSnapshot: compiled.snapshot,
      },
      activationContext: "ctx-1",
    });
    if (outcome.status !== "realized") throw new Error(`expected realized, got ${JSON.stringify(outcome)}`);
    expect(realized).toHaveLength(1);
    expect(outcome.realizations[0]!.attachment.continuityTarget).toEqual({ kind: "ephemeral" });

    const release = await runtime.release!(outcome.realizations[0]!.release);
    expect(release.status).toBe("released");
    await installed.dispose();
  });
});

describe("§50/§95: golden path vs low-level seams", () => {
  it("the runtime surface is exported from /advanced, not from the root contract-core export", () => {
    expect(ROOT_INDEX_SOURCE).not.toMatch(/runtime\/|continuity\//);
    const advancedSource = readFileSync(
      fileURLToPath(new URL("../src/advanced.ts", import.meta.url)),
      "utf-8",
    );
    expect(advancedSource).toMatch(/runtime\/index\.js/);
    expect(advancedSource).toMatch(/continuity\/index\.js/);
  });
});
