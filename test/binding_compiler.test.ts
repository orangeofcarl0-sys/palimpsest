/**
 * G10-B4 binding compiler / plan-seam machine proofs.
 *
 *   B4-M01  legacy ProjectProposal → TaskSpec[] byte/structurally unchanged
 *   B4-M02  legacy no-binding → implicit_ephemeral_default@1 (seam level;
 *           live resolution deferred — see the grounding matrix)
 *   B4-M03  Work definition_id never becomes ArchitectureSubjectRef
 *           (static + behavioral identity firewall, B4 §72)
 *   plus: explicit-binding seam proof (§55), configuration-invalid ≠
 *   unsatisfied (§23), unsatisfied → no plan (§58), stale → no plan (§59),
 *   rebinding → new immutable plan state (§44), ref-only single truth
 *   (§20/§56/§57), deep immutability + no aliasing (§60), determinism (§61),
 *   purity (§62), fixture non-escape (§35), empty-subject adjudication (§32).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { BindingPlanCompileInput } from "../src/binding/index.js";
import {
  BindingConfigurationError,
  BindingParseError,
  MINIMAL_RESOLVER_POLICY,
  compileBindingPlan,
  workRefOf,
} from "../src/binding/index.js";
import { parseProjectProposal, proposalTaskSpecs, validateProjectProposal } from "../src/architecture/index.js";
import type { ProjectIr } from "../src/schema/index.js";
import { parseTaskSpec, projectIrDigestOf } from "../src/schema/index.js";
import { authorBindingDefinition } from "./binding_helpers.js";

const COMPILER_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/binding/compiler.ts", import.meta.url)),
  "utf-8",
);

/** Comment-free source: the static firewalls bind the code, not the prose that documents them. */
const COMPILER_CODE = COMPILER_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function compileInput(overrides: Partial<BindingPlanCompileInput> = {}): BindingPlanCompileInput {
  return {
    architecture: { definitionId: "arch-test", revision: 1, digest: "arch-digest" },
    work: { definitionId: "proj-test", revision: 3, digest: "work-digest" },
    participatingArchitectureSubjects: ["S"],
    runConfigurationDigest: "run-config-digest",
    planningSnapshot: {
      ref: "snap-1",
      ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
      persistentCandidates: [],
    },
    resolutionId: "res-1",
    ...overrides,
  };
}

function caseEDefinition() {
  return authorBindingDefinition({
    bindingDefinitionId: "b-case-e",
    revision: 0,
    bindings: { S: { continuity: {} } },
  });
}

describe("B4-M01: legacy proposal compile is structurally unchanged (B4 §28)", () => {
  it("proposalTaskSpecs output is byte-stable including definition_id, and leaks no binding data", () => {
    const proposal = parseProjectProposal({
      goal: "ship it",
      changeClass: "behavior_change",
      tasks: [
        {
          title: "A",
          dependsOn: [],
          writePaths: ["src/a.ts"],
          requiredArtifacts: ["a.out"],
          role: "implementer",
          suggestedSkills: ["skill-1"],
          scopeId: "scope-1",
          definitionId: "node-a",
        },
        { title: "B", dependsOn: ["A"], writePaths: ["src/b.ts"], requiredArtifacts: [] },
      ],
    });
    expect(validateProjectProposal(proposal)).toEqual([]);
    const specs = proposalTaskSpecs(proposal);
    expect(specs).toEqual([
      {
        task_id: "task-1",
        objective: "A",
        depends_on: [],
        write_paths: ["src/a.ts"],
        required_artifacts: ["a.out"],
        role: "implementer",
        suggested_skills: ["skill-1"],
        scope_id: "scope-1",
        definition_id: "node-a",
      },
      {
        task_id: "task-2",
        objective: "B",
        depends_on: ["task-1"],
        write_paths: ["src/b.ts"],
        required_artifacts: [],
      },
    ]);
    // No Binding data may leak into TaskSpec (B4 §28).
    const serialized = JSON.stringify(specs);
    for (const forbidden of ["binding", "continuity", "resolution", "intentSource"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("B4-M03: Work identity is never reinterpreted as Architecture identity (B4 §9/§29/§72)", () => {
  it("workRefOf maps exactly project_id/revision/digest — never task fields", () => {
    const base = {
      schema_version: 1 as const,
      project_id: "proj-1",
      revision: 4,
      parent_revision: 3,
      parent_digest: "parent-digest",
      goal: "g",
      requirements: [],
      decisions: [],
      tasks: [
        parseTaskSpec({
          task_id: "task-1",
          objective: "o",
          depends_on: [],
          write_paths: [],
          required_artifacts: [],
          definition_id: "node-a",
        }),
      ],
      head_commit: "head",
      committed_at: "2026-01-01T00:00:00.000000Z",
    };
    const project = { ...base, digest: projectIrDigestOf(base) } as ProjectIr;
    const ref = workRefOf(project);
    expect(ref).toEqual({ definitionId: "proj-1", revision: 4, digest: project.digest });
    // definition_id ("node-a") is Work/task lineage and must not appear in the ref.
    expect(project.tasks[0]?.definition_id).toBe("node-a");
    expect(JSON.stringify(ref)).not.toContain("node-a");
  });

  it("static firewall: the compiler never imports task compilers and never reads definition_id (B4 §72)", () => {
    expect(COMPILER_CODE).not.toMatch(/\bTaskSpec\b|\bTaskProposal\b|\bproposalTaskSpecs\b/);
    expect(COMPILER_CODE).not.toContain("definition_id");
  });

  it("static fixture firewall: B3 spike fixture types are not re-exported by the compiler (B4 §35)", () => {
    for (const fixture of ["ResolverInput", "ResolverSnapshot", "BindingCatalogPoint", "SubjectRequirementFixture"]) {
      expect(COMPILER_CODE).not.toMatch(new RegExp(`export[^;]*\\b${fixture}\\b`));
    }
  });

  it("static purity: no clock, randomness, io, or database access in the compile core (B4 §62)", () => {
    expect(COMPILER_CODE).not.toMatch(/Date\.now|Math\.random|randomUUID|performance\.now/);
    expect(COMPILER_CODE).not.toMatch(/node:(fs|path|crypto|net|http)|from "node:/);
    expect(COMPILER_CODE).not.toMatch(/\bDatabaseSync\b|\.prepare\(|localStorage|fetch\(/);
  });
});

describe("B4-M02: legacy no-binding resolves under the implicit ephemeral default (B4 §27/§54)", () => {
  it("seam proof: provenance records implicit_ephemeral_default@1 and the plan is built (live wiring deferred)", () => {
    const result = compileBindingPlan(compileInput({ participatingArchitectureSubjects: [] }));
    if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
    expect(result.resolution.provenance.intentSource).toEqual({
      kind: "implicit_ephemeral_default",
      semanticVersion: 1,
    });
    expect(Object.keys(result.resolution.continuity)).toEqual([]);
  });

  it("empty grounded subject set under the implicit default is permitted (grounding matrix §6)", () => {
    const result = compileBindingPlan(compileInput({ participatingArchitectureSubjects: [] }));
    expect(result.status).toBe("planned");
  });
});

describe("explicit binding seam proof (B4 §55 — architecture grounding deferred)", () => {
  it("raw definition is parsed at the boundary; Case E subject resolves ephemeral; plan references the resolution", () => {
    const definition = caseEDefinition();
    const result = compileBindingPlan(
      compileInput({ rawBindingDefinition: JSON.parse(JSON.stringify(definition)) }),
    );
    if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
    expect(result.resolution.provenance.intentSource).toEqual({
      kind: "explicit",
      binding: {
        bindingDefinitionId: "b-case-e",
        revision: 0,
        digest: definition.digest,
      },
    });
    expect(result.resolution.continuity["S"]).toEqual({ kind: "ephemeral" });
    expect(result.resolution.resolutionId).toBe("res-1");
    expect(result.plan.bindingResolution).toEqual({
      resolutionId: "res-1",
      digest: result.resolution.digest,
    });
  });

  it("trusted (already-parsed) definitions are accepted without re-parsing", () => {
    const result = compileBindingPlan(compileInput({ trustedBindingDefinition: caseEDefinition() }));
    expect(result.status).toBe("planned");
  });

  it("requirePersistent with no durable candidates is unsatisfied and produces NO plan (B4 §58)", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-require",
      revision: 0,
      bindings: { S: { continuity: { requirePersistent: true } } },
    });
    const result = compileBindingPlan(compileInput({ trustedBindingDefinition: definition }));
    expect(result.status).toBe("binding_unsatisfied");
    if (result.status !== "binding_unsatisfied") return;
    expect(result.result.reasons).toEqual(["no_matching_persistent_point"]);
    expect("plan" in result).toBe(false);
    expect(Object.isFrozen(result.result)).toBe(true);
  });

  it("an explicit definition without grounded subjects fails configuration validation (B4 §31)", () => {
    expect(() =>
      compileBindingPlan(
        compileInput({ trustedBindingDefinition: caseEDefinition(), participatingArchitectureSubjects: [] }),
      ),
    ).toThrow(BindingConfigurationError);
  });

  it("pin resolution rides the same seam", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-pin",
      revision: 0,
      bindings: { S: { continuity: { pin: "P-1" } } },
    });
    const result = compileBindingPlan(
      compileInput({
        trustedBindingDefinition: definition,
        planningSnapshot: {
          ref: "snap-1",
          ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
          persistentCandidates: [{ point: "P-1", available: true }],
        },
      }),
    );
    if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
    expect(result.resolution.continuity["S"]).toEqual({ kind: "persistent", point: "P-1" });
  });
});

describe("configuration invalid ≠ binding unsatisfied (B4 §23)", () => {
  it("missing or placeholder provenance inputs are configuration errors naming the missing source", () => {
    expect(() => compileBindingPlan(compileInput({ architecture: undefined as never }))).toThrow(
      /architecture/,
    );
    expect(() =>
      compileBindingPlan(compileInput({ architecture: { definitionId: "a", revision: 1, digest: "" } })),
    ).toThrow(/no placeholders/);
    expect(() => compileBindingPlan(compileInput({ runConfigurationDigest: "" }))).toThrow(
      /RunConfiguration/,
    );
    expect(() =>
      compileBindingPlan(compileInput({ planningSnapshot: { ref: "", ephemeralCapabilities: {} } })),
    ).toThrow(/planningSnapshot/);
    expect(() => compileBindingPlan(compileInput({ resolutionId: "" }))).toThrow(/resolutionId/);
  });

  it("duplicate subjects and non-participating hard-requirement subjects are configuration errors", () => {
    expect(() =>
      compileBindingPlan(compileInput({ participatingArchitectureSubjects: ["S", "S"] })),
    ).toThrow(/duplicate/);
    expect(() =>
      compileBindingPlan(
        compileInput({ architectureHard: { ghost: { runtimeFeatures: ["f"] } } }),
      ),
    ).toThrow(/non-participating/);
  });

  it("unsupported resolver policy and ambiguous raw+trusted input are configuration errors, not unsatisfied", () => {
    expect(() =>
      compileBindingPlan(compileInput({ resolverPolicy: { id: "other", version: "9" } })),
    ).toThrow(BindingConfigurationError);
    expect(() =>
      compileBindingPlan(
        compileInput({ rawBindingDefinition: {}, trustedBindingDefinition: caseEDefinition() }),
      ),
    ).toThrow(/not both/);
  });

  it("a malformed raw definition raises the kernel parse error at the trust boundary (B4 §37/§50)", () => {
    expect(() => compileBindingPlan(compileInput({ rawBindingDefinition: { nope: true } }))).toThrow(
      BindingParseError,
    );
  });
});

describe("single truth: the plan stores the resolution ref only (B4 §19/§20/§56/§57)", () => {
  it("plan shape is exactly {work, bindingResolution{resolutionId, digest}} — no full-resolution copy", () => {
    const result = compileBindingPlan(compileInput());
    if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
    expect(Object.keys(result.plan).sort()).toEqual(["bindingResolution", "work"]);
    expect(Object.keys(result.plan.bindingResolution).sort()).toEqual(["digest", "resolutionId"]);
    const serialized = JSON.stringify(result.plan);
    for (const forbidden of ["provenance", "continuity", "intentSource", "schemaVersion", "reasons"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(result.plan.work).toEqual({ definitionId: "proj-test", revision: 3, digest: "work-digest" });
  });
});

describe("stale admission and rebinding (B4 §24/§44/§59)", () => {
  it("a resolution against S1 is refused when the admission basis is S2; re-resolution yields a new plan", () => {
    const first = compileBindingPlan(compileInput());
    if (first.status !== "planned") throw new Error(`expected planned, got ${first.status}`);
    const planP1 = first.plan;
    const serializedP1 = JSON.stringify(planP1);

    const advancedBasis = {
      architecture: { definitionId: "arch-test", revision: 1, digest: "arch-digest" },
      work: { definitionId: "proj-test", revision: 3, digest: "work-digest" },
      intentSource: { kind: "implicit_ephemeral_default", semanticVersion: 1 } as const,
      runConfigurationDigest: "run-config-digest",
      snapshot: { ref: "snap-2" },
      resolverPolicy: MINIMAL_RESOLVER_POLICY,
    };
    const refused = compileBindingPlan(compileInput({ admissionBasis: advancedBasis }));
    expect(refused.status).toBe("stale");
    if (refused.status !== "stale") return;
    expect(refused.resolution.provenance.snapshot.ref).toBe("snap-1");
    expect("resolutionId" in refused.resolution).toBe(false);
    expect("plan" in refused).toBe(false);

    // Re-resolve against S2 → R2 → new plan state P2; P1 untouched.
    const second = compileBindingPlan(
      compileInput({
        planningSnapshot: {
          ref: "snap-2",
          ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
          persistentCandidates: [],
        },
      }),
    );
    if (second.status !== "planned") throw new Error(`expected planned, got ${second.status}`);
    expect(second.plan.bindingResolution.digest).not.toBe(planP1.bindingResolution.digest);
    expect(second.resolution.provenance.snapshot.ref).toBe("snap-2");
    expect(JSON.stringify(planP1)).toBe(serializedP1);
  });

  it("rebinding never mutates the prior plan or resolution (no pointer mutation, B4 §44)", () => {
    const first = compileBindingPlan(compileInput());
    if (first.status !== "planned") throw new Error(`expected planned, got ${first.status}`);
    const before = JSON.stringify({ plan: first.plan, resolution: first.resolution });
    compileBindingPlan(
      compileInput({
        planningSnapshot: {
          ref: "snap-2",
          ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
          persistentCandidates: [],
        },
      }),
    );
    expect(JSON.stringify({ plan: first.plan, resolution: first.resolution })).toBe(before);
  });
});

describe("immutability and aliasing (B4 §60)", () => {
  it("the plan is runtime-immutable and does not alias caller inputs", () => {
    const work = { definitionId: "proj-alias", revision: 2, digest: "work-digest" };
    const result = compileBindingPlan(compileInput({ work }));
    if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.plan)).toBe(true);
    expect(Object.isFrozen(result.plan.work)).toBe(true);
    expect(Object.isFrozen(result.plan.bindingResolution)).toBe(true);
    expect(() => {
      (result.plan as { work: unknown }).work = null;
    }).toThrow(TypeError);
    // Caller-side mutation of the supplied ref must not reach the plan.
    work.revision = 99;
    expect(result.plan.work.revision).toBe(2);
  });
});

describe("determinism (B4 §61)", () => {
  it("identical grounded inputs produce identical plan semantic content; identity ≠ digest", () => {
    const first = compileBindingPlan(compileInput());
    const second = compileBindingPlan(compileInput());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const otherId = compileBindingPlan(compileInput({ resolutionId: "res-2" }));
    if (first.status !== "planned" || otherId.status !== "planned") {
      throw new Error("expected both plans");
    }
    expect(otherId.resolution.digest).toBe(first.resolution.digest);
    expect(otherId.plan.bindingResolution).toEqual({ resolutionId: "res-2", digest: first.resolution.digest });
  });
});
