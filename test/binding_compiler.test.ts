/**
 * G10-B4 binding compiler / plan-seam machine proofs, updated for G10-C0.
 *
 *   B4-M01  legacy ProjectProposal → TaskSpec[] byte/structurally unchanged
 *   B4-M02  implicit_ephemeral_default@1 — now over the ArchitectureDefinition's
 *           real subject set (C0-M09); empty-architecture case adjudicated
 *   B4-M03  Work definition_id never becomes ArchitectureSubjectRef
 *   C0-M06  architecture ref derivation (§31)
 *   C0-M07  ArchitectureSubjectRef derivation (§32)
 *   C0-M08  arbitrary caller architecture-ref/subject-ref seams removed (§34-§39/§71)
 *   C0-M09  implicit Binding over real Architecture subjects (§48)
 *   C0-M10  explicit Binding over real Architecture subjects (§49)
 *   C0-M11  exact subject coverage: missing (§50) and extra (§51) subjects
 *   C0-M12  architecture freshness + membership-change configuration outcome (§46/§47)
 *   plus: configuration invalid ≠ unsatisfied (§23), unsatisfied → no plan (§58),
 *   stale → no plan (§59), rebinding → new immutable plan state (§44),
 *   ref-only single truth (§20/§56/§57), deep immutability + no aliasing (§60),
 *   determinism (§61), purity (§62), fixture non-escape (§35),
 *   Work-ID collision adversarial (§52).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { BindingPlanCompileInput } from "../src/binding/index.js";
import {
  BindingConfigurationError,
  BindingParseError,
  MINIMAL_RESOLVER_POLICY,
  architectureRefOf,
  architectureSubjectRefsOf,
  compileBindingPlan,
  workRefOf,
} from "../src/binding/index.js";
import {
  ArchitectureDefinitionParseError,
  materializeArchitectureDefinition,
  parseArchitectureDefinition,
} from "../src/architecture/index.js";
import type { ArchitectureDefinition } from "../src/architecture/index.js";
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

const ARCHITECTURE = () =>
  materializeArchitectureDefinition({
    architectureDefinitionId: "arch-test",
    revision: 1,
    agentDefinitionIds: ["S"],
  });

function compileInput(overrides: Partial<BindingPlanCompileInput> = {}): BindingPlanCompileInput {
  return {
    trustedArchitectureDefinition: ARCHITECTURE(),
    work: { definitionId: "proj-test", revision: 3, digest: "work-digest" },
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

describe("B4-M01: legacy proposal compile is structurally unchanged (B4 §28, C0 §55)", () => {
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
    // No Binding or Architecture data may leak into TaskSpec (B4 §28, C0 §55).
    const serialized = JSON.stringify(specs);
    for (const forbidden of ["binding", "continuity", "resolution", "intentSource", "agentDefinition"]) {
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

  it("static firewall: B3 spike fixture types are not re-exported by the compiler (B4 §35)", () => {
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

describe("C0-M08: arbitrary caller architecture seams are removed (C0 §34-§39/§71)", () => {
  it("the public compiler input no longer accepts an architecture ref or raw subject list", () => {
    expect(COMPILER_CODE).not.toContain("participatingArchitectureSubjects");
    expect(COMPILER_CODE).not.toMatch(/architecture\??\s*:\s*DefinitionRevisionRef/);
    expect(COMPILER_CODE).toMatch(/rawArchitectureDefinition|trustedArchitectureDefinition/);
  });

  it("missing architecture source is a configuration error naming the requirement", () => {
    const { trustedArchitectureDefinition: _omitted, ...withoutArchitecture } = compileInput();
    expect(() => compileBindingPlan(withoutArchitecture)).toThrow(
      /exactly one ArchitectureDefinition source/,
    );
  });

  it("raw + trusted architecture sources simultaneously is a configuration error (C0 §38)", () => {
    expect(() =>
      compileBindingPlan(
        compileInput({
          rawArchitectureDefinition: JSON.parse(JSON.stringify(ARCHITECTURE())),
        }),
      ),
    ).toThrow(/not both/);
  });

  it("raw architecture is parsed at the boundary; architecture parse errors stay distinct (C0 §36/§74)", () => {
    const { trustedArchitectureDefinition: _omitted, ...rawOnly } = compileInput();
    const result = compileBindingPlan({
      ...rawOnly,
      rawArchitectureDefinition: JSON.parse(JSON.stringify(ARCHITECTURE())),
    });
    expect(result.status).toBe("planned");
    // Unknown field → ArchitectureDefinitionParseError, not BindingConfigurationError.
    const bad = JSON.parse(JSON.stringify(ARCHITECTURE())) as Record<string, unknown>;
    bad.label = "nope";
    expect(() =>
      compileBindingPlan({ ...rawOnly, rawArchitectureDefinition: bad }),
    ).toThrow(ArchitectureDefinitionParseError);
    // Bad supplied digest → parse error (never silently replaced).
    const badDigest = JSON.parse(JSON.stringify(ARCHITECTURE())) as Record<string, unknown>;
    badDigest.digest = "deadbeef";
    expect(() =>
      compileBindingPlan({ ...rawOnly, rawArchitectureDefinition: badDigest }),
    ).toThrow(ArchitectureDefinitionParseError);
  });

  it("trusted-path integrity: tests use materializer/parser outputs, not arbitrary casts (C0 §37/§73)", () => {
    const trusted: ArchitectureDefinition = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-trusted",
      revision: 3,
      agentDefinitionIds: ["S"],
    });
    const parsed: ArchitectureDefinition = parseArchitectureDefinition(
      JSON.parse(JSON.stringify(trusted)),
    );
    expect(compileBindingPlan(compileInput({ trustedArchitectureDefinition: parsed })).status).toBe(
      "planned",
    );
  });
});

describe("C0-M06/M07: architecture provenance and subjects are derived (C0 §31/§32/§39)", () => {
  it("architectureRefOf maps the artifact's own identity/revision/digest", () => {
    const architecture = ARCHITECTURE();
    expect(architectureRefOf(architecture)).toEqual({
      definitionId: "arch-test",
      revision: 1,
      digest: architecture.digest,
    });
  });

  it("architectureSubjectRefsOf derives solely from AgentDefinition membership", () => {
    const architecture = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-2",
      revision: 0,
      agentDefinitionIds: ["A", "B"],
    });
    expect(architectureSubjectRefsOf(architecture)).toEqual(["A", "B"]);
    // Canonical (sorted) membership order regardless of authoring order.
    expect(architecture.agentDefinitions.map((agent) => agent.agentDefinitionId)).toEqual(["A", "B"]);
  });

  it("the resolution provenance carries the derived artifact ref", () => {
    const architecture = ARCHITECTURE();
    const result = compileBindingPlan(compileInput({}));
    if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
    expect(result.resolution.provenance.architecture).toEqual(architectureRefOf(architecture));
  });
});

describe("C0-M09: legacy implicit binding over the real subject set (C0 §48)", () => {
  it("no BindingDefinition compiles through implicit_ephemeral_default@1 over the architecture's subjects", () => {
    const architecture = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-live",
      revision: 1,
      agentDefinitionIds: ["agent-A", "agent-B"],
    });
    const result = compileBindingPlan(
      compileInput({ trustedArchitectureDefinition: architecture }),
    );
    if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
    expect(result.resolution.provenance.intentSource).toEqual({
      kind: "implicit_ephemeral_default",
      semanticVersion: 1,
    });
    expect(Object.keys(result.resolution.continuity).sort()).toEqual(["agent-A", "agent-B"]);
    for (const subject of ["agent-A", "agent-B"]) {
      expect(result.resolution.continuity[subject]).toEqual({ kind: "ephemeral" });
    }
  });

  it("an empty-membership architecture yields the adjudicated empty subject set", () => {
    const result = compileBindingPlan(
      compileInput({
        trustedArchitectureDefinition: materializeArchitectureDefinition({
          architectureDefinitionId: "arch-empty",
          revision: 0,
          agentDefinitionIds: [],
        }),
      }),
    );
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(Object.keys(result.resolution.continuity)).toEqual([]);
  });
});

describe("C0-M10/M11: explicit binding over real subjects with exact coverage (C0 §49-§51)", () => {
  it("A→pin P, B→Case E resolves through the kernel with no Work identity involved (§49)", () => {
    const architecture = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-ab",
      revision: 1,
      agentDefinitionIds: ["A", "B"],
    });
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-ab",
      revision: 0,
      bindings: {
        A: { continuity: { pin: "P-1" } },
        B: { continuity: {} },
      },
    });
    const result = compileBindingPlan(
      compileInput({
        trustedArchitectureDefinition: architecture,
        trustedBindingDefinition: definition,
        planningSnapshot: {
          ref: "snap-1",
          ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
          persistentCandidates: [{ point: "P-1", available: true }],
        },
      }),
    );
    if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
    expect(result.resolution.continuity["A"]).toEqual({ kind: "persistent", point: "P-1" });
    expect(result.resolution.continuity["B"]).toEqual({ kind: "ephemeral" });
  });

  it("a binding missing a subject fails exact coverage (§50)", () => {
    const architecture = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-ab",
      revision: 1,
      agentDefinitionIds: ["A", "B"],
    });
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-missing",
      revision: 0,
      bindings: { A: { continuity: {} } },
    });
    expect(() =>
      compileBindingPlan(compileInput({ trustedArchitectureDefinition: architecture, trustedBindingDefinition: definition })),
    ).toThrow(BindingConfigurationError);
  });

  it("a binding with an extra subject fails exact coverage (§51)", () => {
    const architecture = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-a",
      revision: 1,
      agentDefinitionIds: ["A"],
    });
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-extra",
      revision: 0,
      bindings: { A: { continuity: {} }, B: { continuity: {} } },
    });
    expect(() =>
      compileBindingPlan(compileInput({ trustedArchitectureDefinition: architecture, trustedBindingDefinition: definition })),
    ).toThrow(BindingConfigurationError);
  });

  it("an explicit definition against a zero-agent architecture is a configuration failure (B4 §31)", () => {
    expect(() =>
      compileBindingPlan(
        compileInput({
          trustedArchitectureDefinition: materializeArchitectureDefinition({
            architectureDefinitionId: "arch-empty",
            revision: 0,
            agentDefinitionIds: [],
          }),
          trustedBindingDefinition: caseEDefinition(),
        }),
      ),
    ).toThrow(/contributes none/);
  });

  it("membership change with an old binding is a configuration outcome — never silent repair (C0 §47)", () => {
    const architectureR2 = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-ab",
      revision: 2,
      agentDefinitionIds: ["A", "B", "C"], // C joined between r1 and r2
    });
    const oldDefinition = authorBindingDefinition({
      bindingDefinitionId: "b-ab",
      revision: 0,
      bindings: { A: { continuity: {} }, B: { continuity: {} } },
    });
    expect(() =>
      compileBindingPlan(
        compileInput({ trustedArchitectureDefinition: architectureR2, trustedBindingDefinition: oldDefinition }),
      ),
    ).toThrow(BindingConfigurationError);
  });
});

describe("C0-M12: architecture freshness (C0 §46)", () => {
  it("an architecture advance r1→r2 makes the prior resolution stale through the same freshness gate", () => {
    const architectureR1 = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-fresh",
      revision: 1,
      agentDefinitionIds: ["S"],
    });
    const first = compileBindingPlan(compileInput({ trustedArchitectureDefinition: architectureR1 }));
    if (first.status !== "planned") throw new Error(`expected planned, got ${first.status}`);

    const architectureR2 = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-fresh",
      revision: 2,
      agentDefinitionIds: ["S"],
    });
    const advancedBasis = {
      architecture: architectureRefOf(architectureR2),
      work: { definitionId: "proj-test", revision: 3, digest: "work-digest" },
      intentSource: { kind: "implicit_ephemeral_default", semanticVersion: 1 } as const,
      runConfigurationDigest: "run-config-digest",
      snapshot: { ref: "snap-1" },
      resolverPolicy: MINIMAL_RESOLVER_POLICY,
    };
    const refused = compileBindingPlan(
      compileInput({ trustedArchitectureDefinition: architectureR1, admissionBasis: advancedBasis }),
    );
    expect(refused.status).toBe("stale");
    if (refused.status !== "stale") return;
    expect(refused.resolution.provenance.architecture.revision).toBe(1);

    // Re-compile against r2 → planned with the new architecture provenance.
    const second = compileBindingPlan(compileInput({ trustedArchitectureDefinition: architectureR2 }));
    if (second.status !== "planned") throw new Error(`expected planned, got ${second.status}`);
    expect(second.resolution.provenance.architecture.revision).toBe(2);
    expect(second.plan.bindingResolution.digest).not.toBe(first.plan.bindingResolution.digest);
  });
});

describe("§52: Work-ID collision adversarial test", () => {
  it("TaskSpec.definition_id = AgentDefinitionId string equality forms no relation", () => {
    const proposal = parseProjectProposal({
      goal: "g",
      changeClass: "behavior_change",
      tasks: [
        { title: "T", dependsOn: [], writePaths: ["src/t.ts"], requiredArtifacts: [], definitionId: "agent-A" },
      ],
    });
    const specs = proposalTaskSpecs(proposal);
    expect(specs[0]?.definition_id).toBe("agent-A");

    const architecture = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-collision",
      revision: 0,
      agentDefinitionIds: ["agent-A"],
    });
    const result = compileBindingPlan(compileInput({ trustedArchitectureDefinition: architecture }));
    if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
    // Subjects come only from the ArchitectureDefinition; provenance.architecture
    // is the architecture artifact's identity, NOT the Work task's definition_id.
    expect(result.resolution.provenance.architecture.definitionId).toBe("arch-collision");
    expect(result.resolution.continuity["agent-A"]).toEqual({ kind: "ephemeral" });
    expect(Object.keys(result.resolution.continuity)).toEqual(["agent-A"]);
    // The compiler has no input that could have carried the TaskSpec.
    expect(COMPILER_CODE).not.toMatch(/\bTaskSpec\b/);
  });
});

describe("configuration invalid ≠ binding unsatisfied (B4 §23)", () => {
  it("missing or malformed non-architecture provenance inputs are configuration errors", () => {
    expect(() => compileBindingPlan(compileInput({ runConfigurationDigest: "" }))).toThrow(
      /RunConfiguration/,
    );
    expect(() =>
      compileBindingPlan(compileInput({ planningSnapshot: { ref: "", ephemeralCapabilities: {} } })),
    ).toThrow(/planningSnapshot/);
    expect(() => compileBindingPlan(compileInput({ resolutionId: "" }))).toThrow(/resolutionId/);
  });

  it("non-participating hard-requirement subjects are configuration errors", () => {
    expect(() =>
      compileBindingPlan(compileInput({ architectureHard: { ghost: { runtimeFeatures: ["f"] } } })),
    ).toThrow(/non-participating/);
  });

  it("unsupported resolver policy and ambiguous raw+trusted binding input are configuration errors", () => {
    expect(() =>
      compileBindingPlan(compileInput({ resolverPolicy: { id: "other", version: "9" } })),
    ).toThrow(BindingConfigurationError);
    expect(() =>
      compileBindingPlan(
        compileInput({ rawBindingDefinition: {}, trustedBindingDefinition: caseEDefinition() }),
      ),
    ).toThrow(/not both/);
  });

  it("a malformed raw binding definition raises the kernel parse error at the trust boundary (B4 §37/§50)", () => {
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
      architecture: architectureRefOf(ARCHITECTURE()),
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
