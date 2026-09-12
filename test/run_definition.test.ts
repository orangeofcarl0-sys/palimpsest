/**
 * G10-C1 RunDefinition machine proofs.
 *
 *   C1-M04  RunDefinition uses refs only (composite, not a truth store)
 *   C1-M05  RunDefinition digest determinism
 *   C1-M06  explicit Binding source represented truthfully
 *   C1-M07  implicit Binding source represented truthfully
 *   C1-M08  Work identity derived from ProjectIr
 *   C1-M09  Architecture identity derived from ArchitectureDefinition
 *   C1-M11  no Architecture/Work content duplication
 *   plus: immutability/aliasing (C1 §28), digest content, no snapshot state
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ArchitectureDefinition } from "../src/architecture/index.js";
import { materializeArchitectureDefinition } from "../src/architecture/index.js";
import type { ProjectIr } from "../src/schema/index.js";
import { parseTaskSpec, projectIrDigestOf } from "../src/schema/index.js";
import type { BindingDefinition } from "../src/binding/index.js";
import { architectureRefOf, workRefOf } from "../src/binding/index.js";
import { authorBindingDefinition } from "./binding_helpers.js";
import {
  RUN_DEFINITION_DIGEST_DOMAIN,
  materializeRunConfiguration,
  materializeRunDefinition,
  runDefinitionDigestOf,
} from "../src/run/index.js";

const ARCHITECTURE: ArchitectureDefinition = materializeArchitectureDefinition({
  architectureDefinitionId: "arch-rd",
  revision: 3,
  agentDefinitionIds: ["A", "B"],
});

function projectIr(overrides: Partial<{ revision: number; taskId: string }> = {}): ProjectIr {
  const base = {
    schema_version: 1 as const,
    project_id: "proj-rd",
    revision: overrides.revision ?? 5,
    parent_revision: (overrides.revision ?? 5) > 0 ? (overrides.revision ?? 5) - 1 : null,
    parent_digest: (overrides.revision ?? 5) > 0 ? "parent" : null,
    goal: "ship",
    requirements: [],
    decisions: [],
    tasks: [
      parseTaskSpec({
        task_id: overrides.taskId ?? "task-1",
        objective: "o",
        depends_on: [],
        write_paths: [],
        required_artifacts: [],
        definition_id: "agent-A", // colliding Work lineage string
      }),
    ],
    head_commit: "head",
    committed_at: "2026-01-01T00:00:00.000000Z",
  };
  return { ...base, digest: projectIrDigestOf(base) } as ProjectIr;
}

function explicitDefinition(): BindingDefinition {
  return authorBindingDefinition({
    bindingDefinitionId: "b-rd",
    revision: 2,
    bindings: { A: { continuity: {} }, B: { continuity: {} } },
  });
}

describe("C1-M08/M09: refs are derived from the actual artifacts (C1 §25)", () => {
  it("architecture ref equals architectureRefOf; work ref equals workRefOf", () => {
    const runDefinition = materializeRunDefinition({
      architecture: ARCHITECTURE,
      work: projectIr(),
      runConfiguration: materializeRunConfiguration(),
    });
    expect(runDefinition.architecture).toEqual(architectureRefOf(ARCHITECTURE));
    expect(runDefinition.work).toEqual(workRefOf(projectIr()));
    expect(runDefinition.architecture.definitionId).toBe("arch-rd");
    expect(runDefinition.work.definitionId).toBe("proj-rd");
  });
});

describe("C1-M06/M07: binding intent source is represented truthfully (C1 §27)", () => {
  it("explicit BindingDefinition → BindingDefinitionRef (id/revision/digest)", () => {
    const definition = explicitDefinition();
    const runDefinition = materializeRunDefinition({
      architecture: ARCHITECTURE,
      work: projectIr(),
      bindingDefinition: definition,
      runConfiguration: materializeRunConfiguration(),
    });
    expect(runDefinition.bindingIntentSource).toEqual({
      kind: "explicit",
      binding: {
        bindingDefinitionId: "b-rd",
        revision: 2,
        digest: definition.digest,
      },
    });
  });

  it("no BindingDefinition → implicit_ephemeral_default@1 (no synthetic definition)", () => {
    const runDefinition = materializeRunDefinition({
      architecture: ARCHITECTURE,
      work: projectIr(),
      runConfiguration: materializeRunConfiguration(),
    });
    expect(runDefinition.bindingIntentSource).toEqual({
      kind: "implicit_ephemeral_default",
      semanticVersion: 1,
    });
  });
});

describe("C1-M05: RunDefinition digest determinism (C1 §24)", () => {
  it("identical composite inputs → identical digest; any input drift → different digest", () => {
    const input = () => ({
      architecture: ARCHITECTURE,
      work: projectIr(),
      runConfiguration: materializeRunConfiguration(),
    });
    const first = materializeRunDefinition(input());
    const second = materializeRunDefinition(input());
    expect(first.digest).toBe(second.digest);

    const workDrift = materializeRunDefinition({ ...input(), work: projectIr({ revision: 6 }) });
    expect(workDrift.digest).not.toBe(first.digest);

    const architectureDrift = materializeRunDefinition({
      ...input(),
      architecture: materializeArchitectureDefinition({
        architectureDefinitionId: "arch-rd",
        revision: 4,
        agentDefinitionIds: ["A", "B"],
      }),
    });
    expect(architectureDrift.digest).not.toBe(first.digest);

    const membershipDrift = materializeRunDefinition({
      ...input(),
      architecture: materializeArchitectureDefinition({
        architectureDefinitionId: "arch-rd",
        revision: 3,
        agentDefinitionIds: ["A", "B", "C"],
      }),
    });
    expect(membershipDrift.digest).not.toBe(first.digest);

    const bindingDrift = materializeRunDefinition({
      ...input(),
      bindingDefinition: explicitDefinition(),
    });
    expect(bindingDrift.digest).not.toBe(first.digest);
  });

  it("digest content carries the run-definition domain over the four inputs", () => {
    const runDefinition = materializeRunDefinition({
      architecture: ARCHITECTURE,
      work: projectIr(),
      runConfiguration: materializeRunConfiguration(),
    });
    expect(RUN_DEFINITION_DIGEST_DOMAIN).toBe("palimpsest.run-definition.v1");
    expect(
      runDefinitionDigestOf({
        architecture: runDefinition.architecture,
        work: runDefinition.work,
        bindingIntentSource: runDefinition.bindingIntentSource,
        runConfigurationDigest: runDefinition.runConfigurationDigest,
      }),
    ).toBe(runDefinition.digest);
  });
});

describe("C1-M04/M11: refs only — no second Work/Architecture truth (C1 §23)", () => {
  it("the composite carries identity refs, never artifact content", () => {
    const runDefinition = materializeRunDefinition({
      architecture: ARCHITECTURE,
      work: projectIr(),
      runConfiguration: materializeRunConfiguration(),
    });
    expect(Object.keys(runDefinition).sort()).toEqual([
      "architecture",
      "bindingIntentSource",
      "digest",
      "runConfigurationDigest",
      "schemaVersion",
      "work",
    ]);
    const serialized = JSON.stringify(runDefinition);
    // No Work content (goal/tasks/TaskSpec fields), no Architecture content
    // (agentDefinitions), no run-config content, no snapshot state.
    for (const forbidden of [
      "goal",
      "task_id",
      "depends_on",
      "write_paths",
      "required_artifacts",
      "agentDefinitions",
      "architectureDefinitionId",
      "planningSnapshot",
      "persistentCandidates",
      "ephemeralCapabilities",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("C1 §28: runtime immutability and caller detachment", () => {
  it("the composite is deep-frozen and never aliases caller inputs", () => {
    const work = projectIr();
    const bindingDefinition = explicitDefinition();
    const runDefinition = materializeRunDefinition({
      architecture: ARCHITECTURE,
      work,
      bindingDefinition,
      runConfiguration: materializeRunConfiguration(),
    });
    expect(Object.isFrozen(runDefinition)).toBe(true);
    expect(Object.isFrozen(runDefinition.architecture)).toBe(true);
    expect(Object.isFrozen(runDefinition.work)).toBe(true);
    expect(Object.isFrozen(runDefinition.bindingIntentSource)).toBe(true);
    expect(() => {
      (runDefinition as { digest: string }).digest = "x";
    }).toThrow(TypeError);
    // Mutating the caller's ProjectIr afterwards must not reach the composite.
    (work.tasks as unknown as { length: number }).length = 0;
    expect(runDefinition.work.revision).toBe(workRefOf(projectIr()).revision);
    expect(JSON.stringify(runDefinition)).toContain('"work"');
  });

  it("adversarial §32: the explicit intent source is frozen through its nested binding ref", () => {
    const runDefinition = materializeRunDefinition({
      architecture: ARCHITECTURE,
      work: projectIr(),
      bindingDefinition: explicitDefinition(),
      runConfiguration: materializeRunConfiguration(),
    });
    expect(Object.isFrozen(runDefinition.bindingIntentSource)).toBe(true);
    const binding = (runDefinition.bindingIntentSource as { binding: object }).binding;
    expect(Object.isFrozen(binding)).toBe(true);
    expect(() => {
      (binding as { digest: string }).digest = "tampered";
    }).toThrow(TypeError);
  });

  it("adversarial §32: the materializer has no fake-ref injection path", () => {
    // The materializer input accepts ARTIFACTS (ArchitectureDefinition,
    // ProjectIr) — never preconstructed refs.
    const definitionSource = readFileSync(
      fileURLToPath(new URL("../src/run/definition.ts", import.meta.url)),
      "utf-8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const materializerStart = definitionSource.indexOf("export function materializeRunDefinition");
    const materializerBody = definitionSource.slice(
      materializerStart,
      definitionSource.indexOf("}): RunDefinition {", materializerStart),
    );
    expect(materializerBody).toMatch(/readonly architecture: ArchitectureDefinition/);
    expect(materializerBody).toMatch(/readonly work: ProjectIr/);
    expect(materializerBody).not.toContain("DefinitionRevisionRef");
  });
});
