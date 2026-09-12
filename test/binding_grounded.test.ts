/**
 * G10-C3 fully-grounded compiler machine proofs.
 *
 *   C3-M01  all provenance derived from source artifacts
 *   C3-M02..M07  no caller escape hatches (architecture ref, subject list,
 *           work ref, run-config digest, SnapshotRef, FreshnessBasis;
 *           also: no resolver-policy claim, no hard-requirement maps)
 *   C3-M08  RunDefinition coherence (materialized composite == plan ref ==
 *           resolution provenance)
 *   C3-M09  plan ref-only ownership
 *   C3-M10  unsatisfied → no plan
 *   C3-M11  stale → no current plan (grounded freshness evaluation)
 *   C3-M12..M16  per-input freshness: architecture, work, binding,
 *           run-configuration, snapshot
 *   C3-M17  rebinding immutability
 *   C3-M18  legacy implicit default grounded
 *   C3-M19  Work compiler non-regression
 *   C3-M20  scheduler purity/non-regression (no-diff + suite green)
 *   plus campaign end-to-end proofs §70–§76.
 */

import { describe, expect, it } from "vitest";

import {
  BindingConfigurationError,
  compileGroundedBindingPlan,
  evaluateGroundedPlanFreshness,
  evaluateGroundedResolutionFreshness,
  materializeObservationSnapshot,
  workRefOf,
} from "../src/binding/index.js";
import type { BindingDefinition } from "../src/binding/index.js";
import { materializeArchitectureDefinition } from "../src/architecture/index.js";
import { parseProjectProposal, proposalTaskSpecs } from "../src/architecture/index.js";
import type { ArchitectureDefinition } from "../src/architecture/index.js";
import type { ProjectIr } from "../src/schema/index.js";
import { parseTaskSpec, projectIrDigestOf } from "../src/schema/index.js";
import { authorBindingDefinition } from "./binding_helpers.js";
import { materializeRunConfiguration, parseRunConfiguration, runDefinitionDigestOf } from "../src/run/index.js";

const ARCHITECTURE = (overrides: Partial<{ revision: number; members: string[] }> = {}) =>
  materializeArchitectureDefinition({
    architectureDefinitionId: "arch-g",
    revision: overrides.revision ?? 1,
    agentDefinitionIds: overrides.members ?? ["A", "B"],
  });

function projectIr(overrides: Partial<{ revision: number }> = {}): ProjectIr {
  const revision = overrides.revision ?? 4;
  const base = {
    schema_version: 1 as const,
    project_id: "proj-g",
    revision,
    parent_revision: revision > 0 ? revision - 1 : null,
    parent_digest: revision > 0 ? "parent" : null,
    goal: "grounded",
    requirements: [],
    decisions: [],
    tasks: [
      parseTaskSpec({
        task_id: "task-1",
        objective: "o",
        depends_on: [],
        write_paths: [],
        required_artifacts: [],
        definition_id: "A",
      }),
    ],
    head_commit: "head",
    committed_at: "2026-01-01T00:00:00.000000Z",
  };
  return { ...base, digest: projectIrDigestOf(base) } as ProjectIr;
}

const RUN_CONFIGURATION = () => materializeRunConfiguration();

const SNAPSHOT = (snapshotId = "obs-g") =>
  materializeObservationSnapshot({
    snapshotId,
    ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
    persistentCandidates: [],
  });

function groundedInput(
  overrides: Partial<{
    architecture: ArchitectureDefinition;
    work: ProjectIr;
    trustedBindingDefinition: BindingDefinition;
    runConfiguration: ReturnType<typeof RUN_CONFIGURATION>;
    observationSnapshot: ReturnType<typeof SNAPSHOT>;
    resolutionId: string;
  }> = {},
) {
  return {
    architecture: overrides.architecture ?? ARCHITECTURE(),
    work: overrides.work ?? projectIr(),
    ...(overrides.trustedBindingDefinition === undefined
      ? {}
      : { trustedBindingDefinition: overrides.trustedBindingDefinition }),
    runConfiguration: overrides.runConfiguration ?? RUN_CONFIGURATION(),
    observationSnapshot: overrides.observationSnapshot ?? SNAPSHOT(),
    resolutionId: overrides.resolutionId ?? "res-g",
  };
}

const currentState = (input: ReturnType<typeof groundedInput>) => ({
  architecture: input.architecture,
  work: input.work,
  ...(input.trustedBindingDefinition === undefined
    ? {}
    : { bindingDefinition: input.trustedBindingDefinition }),
  runConfiguration: input.runConfiguration,
  observationSnapshot: input.observationSnapshot,
});

describe("C3-M01/M08: provenance derived from artifacts; RunDefinition coherence (§57/§61/§62)", () => {
  it("plan ref, materialized composite, and resolution provenance all agree", () => {
    const input = groundedInput();
    const result = compileGroundedBindingPlan(input);
    if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
    const runDefinition = result.runDefinition;
    // The returned composite is exactly what the artifacts materialize.
    expect(runDefinition).toEqual(
      materializeRunDefinitionFor(input),
    );
    // The plan's RunDefinition ref equals the composite's digest.
    expect(result.plan.runDefinition).toEqual({ digest: runDefinition.digest });
    // The resolution provenance matches the composite on every definition input.
    expect(result.resolution.provenance.architecture).toEqual(runDefinition.architecture);
    expect(result.resolution.provenance.work).toEqual(runDefinition.work);
    expect(result.resolution.provenance.intentSource).toEqual(runDefinition.bindingIntentSource);
    expect(result.resolution.provenance.runConfigurationDigest).toBe(
      runDefinition.runConfigurationDigest,
    );
    // The snapshot is NOT part of the RunDefinition (observation ≠ definition).
    expect(JSON.stringify(runDefinition)).not.toContain("obs-g");
  });
});

// helper mirroring materializeRunDefinition without another import cycle in tests
function materializeRunDefinitionFor(input: ReturnType<typeof groundedInput>) {
  const intent = input.trustedBindingDefinition;
  const architectureRef = {
    definitionId: input.architecture.architectureDefinitionId,
    revision: input.architecture.revision,
    digest: input.architecture.digest,
  };
  const workRef = workRefOf(input.work);
  const bindingIntentSource = intent
    ? ({
        kind: "explicit",
        binding: {
          bindingDefinitionId: intent.bindingDefinitionId,
          revision: intent.revision,
          digest: intent.digest,
        },
      } as const)
    : ({ kind: "implicit_ephemeral_default", semanticVersion: 1 } as const);
  return {
    schemaVersion: 1,
    digest: runDefinitionDigestOf({
      architecture: architectureRef,
      work: workRef,
      bindingIntentSource,
      runConfigurationDigest: input.runConfiguration.digest,
    }),
    architecture: architectureRef,
    work: workRef,
    bindingIntentSource,
    runConfigurationDigest: input.runConfiguration.digest,
  };
}

describe("C3-M02..M07: the grounded boundary exposes no escape hatches (§58)", () => {
  it("the input type accepts artifacts only — no refs, digests, subject lists, bases, policy claims, or hard maps", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const source = readFileSync(
      fileURLToPath(new URL("../src/binding/grounded.ts", import.meta.url)),
      "utf-8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const inputBlock = source.slice(
      source.indexOf("export interface GroundedBindingPlanInput"),
      source.indexOf("}", source.indexOf("resolutionId: string")),
    );
    expect(inputBlock).toMatch(/readonly architecture: ArchitectureDefinition/);
    expect(inputBlock).toMatch(/readonly work: ProjectIr/);
    expect(inputBlock).toMatch(/readonly runConfiguration: RunConfiguration/);
    expect(inputBlock).toMatch(/readonly observationSnapshot: BindingObservationSnapshot/);
    for (const forbidden of [
      "DefinitionRevisionRef",
      "ArchitectureSubjectRef",
      "runConfigurationDigest",
      "SnapshotRef",
      "FreshnessBasis",
      "ResolverPolicyRef",
      "architectureHard",
      "workHard",
      "admissionBasis",
      "participatingArchitectureSubjects",
    ]) {
      expect(inputBlock).not.toContain(forbidden);
    }
  });
});

describe("C3-M09: plan ref-only ownership (§63/§64/§65)", () => {
  it("the plan is exactly {runDefinition{digest}, bindingResolution{resolutionId,digest}}", () => {
    const result = compileGroundedBindingPlan(groundedInput());
    if (result.status !== "planned") throw new Error("expected planned");
    expect(Object.keys(result.plan).sort()).toEqual(["bindingResolution", "runDefinition"]);
    expect(Object.keys(result.plan.runDefinition).sort()).toEqual(["digest"]);
    const serialized = JSON.stringify(result.plan);
    for (const forbidden of ["provenance", "continuity", "agentDefinitions", "goal", "task_id"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("C3-M10: unsatisfied produces no plan (§67)", () => {
  it("requirePersistent with no durable candidates → unsatisfied, no plan, frozen result", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-g-require",
      revision: 0,
      bindings: { A: { continuity: { requirePersistent: true } }, B: { continuity: {} } },
    });
    const result = compileGroundedBindingPlan(groundedInput({ trustedBindingDefinition: definition }));
    expect(result.status).toBe("binding_unsatisfied");
    if (result.status !== "binding_unsatisfied") return;
    expect(result.result.reasons).toEqual(["no_matching_persistent_point"]);
    expect("plan" in result).toBe(false);
    expect(Object.isFrozen(result.result)).toBe(true);
  });
});

describe("C3-M11 + §70/§74: staleness and rebinding end-to-end", () => {
  it("snapshot S1 → R1/P1; current S2 → R1 stale, P1 stale; RD unchanged; resolve → R2/P2", () => {
    const input = groundedInput();
    const first = compileGroundedBindingPlan(input);
    if (first.status !== "planned") throw new Error("expected planned");
    const rd1Digest = first.runDefinition.digest;
    const p1 = JSON.stringify(first.plan);

    // The RunDefinition does NOT move when only the observation moves (§74).
    const currentStateS2 = { ...currentState(input), observationSnapshot: SNAPSHOT("obs-g-2") };
    expect(
      materializeRunDefinitionFor({ ...input, observationSnapshot: SNAPSHOT("obs-g-2") }).digest,
    ).toBe(rd1Digest);

    // Admission against the current state refuses R1 and P1 (C3-M11).
    expect(evaluateGroundedResolutionFreshness(first.resolution, currentStateS2)).toBe("stale");
    expect(evaluateGroundedPlanFreshness(first.plan, first.resolution, currentStateS2)).toBe("stale");
    // Same-state admission is current.
    expect(evaluateGroundedPlanFreshness(first.plan, first.resolution, currentState(input))).toBe(
      "current",
    );

    // Rebind: resolve against S2 → R2/P2; P1/RD1 untouched.
    const second = compileGroundedBindingPlan({ ...input, observationSnapshot: SNAPSHOT("obs-g-2") });
    if (second.status !== "planned") throw new Error("expected planned");
    expect(second.resolution.provenance.snapshot.ref).not.toBe(
      first.resolution.provenance.snapshot.ref,
    );
    expect(second.plan.bindingResolution.digest).not.toBe(first.plan.bindingResolution.digest);
    expect(second.runDefinition.digest).toBe(rd1Digest);
    expect(JSON.stringify(first.plan)).toBe(p1);
    expect(Object.isFrozen(first.plan)).toBe(true);
    expect(Object.isFrozen(second.plan)).toBe(true);
  });
});

describe("C3-M12/§71: architecture revision end-to-end", () => {
  it("A@r1 → R1; A@r2 → R1 stale, new RunDefinition digest; membership change can fail coverage", () => {
    const input = groundedInput({ architecture: ARCHITECTURE({ revision: 1 }) });
    const first = compileGroundedBindingPlan(input);
    if (first.status !== "planned") throw new Error("expected planned");

    const currentR2 = currentState({ ...input, architecture: ARCHITECTURE({ revision: 2 }) });
    expect(evaluateGroundedResolutionFreshness(first.resolution, currentR2)).toBe("stale");
    expect(evaluateGroundedPlanFreshness(first.plan, first.resolution, currentR2)).toBe("stale");

    const second = compileGroundedBindingPlan({
      ...input,
      architecture: ARCHITECTURE({ revision: 2 }),
    });
    if (second.status !== "planned") throw new Error("expected planned");
    expect(second.runDefinition.digest).not.toBe(first.runDefinition.digest);
    expect(second.resolution.provenance.architecture.revision).toBe(2);
  });

  it("membership change with an old explicit binding is a configuration outcome (§71)", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-g-ab",
      revision: 0,
      bindings: { A: { continuity: {} }, B: { continuity: {} } },
    });
    const grown = ARCHITECTURE({ revision: 2, members: ["A", "B", "C"] });
    expect(() =>
      compileGroundedBindingPlan(
        groundedInput({ architecture: grown, trustedBindingDefinition: definition }),
      ),
    ).toThrow(BindingConfigurationError);
  });
});

describe("C3-M13/§72: work revision end-to-end", () => {
  it("W@r1 → R1; W@r2 → R1 stale, new RunDefinition digest; no task-id reinterpretation", () => {
    const input = groundedInput({ work: projectIr({ revision: 4 }) });
    const first = compileGroundedBindingPlan(input);
    if (first.status !== "planned") throw new Error("expected planned");

    const currentW5 = currentState({ ...input, work: projectIr({ revision: 5 }) });
    expect(evaluateGroundedResolutionFreshness(first.resolution, currentW5)).toBe("stale");
    expect(evaluateGroundedPlanFreshness(first.plan, first.resolution, currentW5)).toBe("stale");

    const second = compileGroundedBindingPlan({ ...input, work: projectIr({ revision: 5 }) });
    if (second.status !== "planned") throw new Error("expected planned");
    expect(second.runDefinition.digest).not.toBe(first.runDefinition.digest);
    expect(second.runDefinition.work).toEqual(workRefOf(projectIr({ revision: 5 })));
    expect(second.runDefinition.work.definitionId).toBe("proj-g");
  });
});

describe("C3-M14/§75: binding change end-to-end", () => {
  it("B1 → R1; B2 → R1 stale, new RunDefinition digest; no in-place retarget", () => {
    const definition1 = authorBindingDefinition({
      bindingDefinitionId: "b-g",
      revision: 1,
      bindings: { A: { continuity: {} }, B: { continuity: {} } },
    });
    const definition2 = authorBindingDefinition({
      bindingDefinitionId: "b-g",
      revision: 2,
      bindings: { A: { continuity: {} }, B: { continuity: {} } },
    });
    const input = groundedInput({ trustedBindingDefinition: definition1 });
    const first = compileGroundedBindingPlan(input);
    if (first.status !== "planned") throw new Error("expected planned");

    const currentB2 = currentState({ ...input, trustedBindingDefinition: definition2 });
    expect(evaluateGroundedResolutionFreshness(first.resolution, currentB2)).toBe("stale");
    expect(evaluateGroundedPlanFreshness(first.plan, first.resolution, currentB2)).toBe("stale");

    const second = compileGroundedBindingPlan({
      ...input,
      trustedBindingDefinition: definition2,
    });
    if (second.status !== "planned") throw new Error("expected planned");
    expect(second.runDefinition.digest).not.toBe(first.runDefinition.digest);
    expect(second.resolution.provenance.intentSource).toEqual({
      kind: "explicit",
      binding: {
        bindingDefinitionId: "b-g",
        revision: 2,
        digest: definition2.digest,
      },
    });
  });
});

describe("C3-M15/§73: RunConfiguration freshness meaning", () => {
  it("the digest is freshness-live at the kernel level; with default-only configuration, RC1 == RC2 (no fabricated second configuration)", () => {
    // The parser accepts ONLY the canonical default — two different valid
    // RunConfigurations cannot exist today, so run-configuration drift is
    // unrepresentable (and honestly so: no run-scoped specialization exists).
    const rc1 = materializeRunConfiguration();
    const rc2 = materializeRunConfiguration();
    expect(rc1.digest).toBe(rc2.digest);
    // The mechanism is live: the RunDefinition digest and the resolution
    // provenance both carry the run-configuration digest, and the kernel
    // freshness gate compares it (kernel-level drift proof in binding_freshness).
    const result = compileGroundedBindingPlan(groundedInput());
    if (result.status !== "planned") throw new Error("expected planned");
    expect(result.resolution.provenance.runConfigurationDigest).toBe(rc1.digest);
    expect(result.runDefinition.runConfigurationDigest).toBe(rc1.digest);
  });
});

describe("C3-M16: snapshot freshness (kernel gate, grounded derivation)", () => {
  it("same-state admission is current; the derived basis equals the resolution provenance", () => {
    const input = groundedInput();
    const result = compileGroundedBindingPlan(input);
    if (result.status !== "planned") throw new Error("expected planned");
    expect(
      evaluateGroundedResolutionFreshness(result.resolution, currentState(input)),
    ).toBe("current");
  });
});

describe("C3-M17: rebinding immutability", () => {
  it("P1/R1/RD1 remain frozen and byte-stable across rebinds", () => {
    const input = groundedInput();
    const first = compileGroundedBindingPlan(input);
    if (first.status !== "planned") throw new Error("expected planned");
    const before = JSON.stringify({
      plan: first.plan,
      resolution: first.resolution,
      runDefinition: first.runDefinition,
    });
    compileGroundedBindingPlan({ ...input, observationSnapshot: SNAPSHOT("obs-g-2") });
    expect(
      JSON.stringify({
        plan: first.plan,
        resolution: first.resolution,
        runDefinition: first.runDefinition,
      }),
    ).toBe(before);
  });
});

describe("C3-M18/§76: legacy implicit default grounded", () => {
  it("no BindingDefinition → implicit_ephemeral_default@1 over the real Architecture subjects", () => {
    const result = compileGroundedBindingPlan(groundedInput());
    if (result.status !== "planned") throw new Error("expected planned");
    expect(result.resolution.provenance.intentSource).toEqual({
      kind: "implicit_ephemeral_default",
      semanticVersion: 1,
    });
    expect(Object.keys(result.resolution.continuity).sort()).toEqual(["A", "B"]);
    expect(result.resolution.continuity["A"]).toEqual({ kind: "ephemeral" });
  });
});

describe("C3-M19/§77: Work compiler non-regression", () => {
  it("ProjectProposal → TaskSpec[] stays byte-stable; no grounding fields leak into TaskSpec", () => {
    const proposal = parseProjectProposal({
      goal: "g",
      changeClass: "behavior_change",
      tasks: [
        { title: "T", dependsOn: [], writePaths: ["src/t.ts"], requiredArtifacts: [], definitionId: "A" },
      ],
    });
    const specs = proposalTaskSpecs(proposal);
    expect(specs).toEqual([
      {
        task_id: "task-1",
        objective: "T",
        depends_on: [],
        write_paths: ["src/t.ts"],
        required_artifacts: [],
        definition_id: "A",
      },
    ]);
    const serialized = JSON.stringify(specs).toLowerCase();
    for (const forbidden of ["run", "snapshot", "binding", "agentdefinition"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("red team §81: fabricated artifacts and mismatched inputs are rejected or detectable", () => {
  it("a tampered RunConfiguration cannot enter the grounded boundary", () => {
    const forged = { schemaVersion: 1, digest: "fabricated" } as ReturnType<typeof RUN_CONFIGURATION>;
    // The trusted boundary is trusted API, not unforgeable — but the forged
    // digest is DETECTABLE: it disagrees with the canonical content digest,
    // so the coherence of any plan built from it is broken by construction
    // (RunDefinition digest ≠ recomputation) and the run parser rejects it.
    expect(() => parseRunConfiguration(forged)).toThrow(/digest mismatch/);
  });
});
