/**
 * G10-B3 binding parser / canonicalization / subject-coverage proofs.
 * Covers B3-M02 (explicit Case E), B3-M03 (continuity canonical-state
 * rejection), PF-01/PF-02 closures, unknown-field rejection at every frozen
 * level, semantic-set duplicates, and digest validation (fail closed).
 */

import { describe, expect, it } from "vitest";

import type { BindingDefinition, SubjectBinding } from "../src/binding/index.js";
import {
  BindingConfigurationError,
  BindingParseError,
  computeBindingDefinitionDigest,
  parseBindingDefinition,
  validateSubjectCoverage,
} from "../src/binding/index.js";
import { authorBindingDefinition } from "./binding_helpers.js";

describe("binding parser: continuity canonical states (B3-M03)", () => {
  const cases: readonly { readonly name: string; readonly intent: unknown }[] = [
    { name: "Case E (empty continuity object)", intent: {} },
    { name: "persistent preferred", intent: { preferPersistent: true } },
    { name: "persistent required", intent: { requirePersistent: true } },
    { name: "persistent pinned", intent: { pin: "P" } },
  ];

  for (const { name, intent } of cases) {
    it(`accepts ${name}`, () => {
      const definition = parseBindingDefinition(
        authorBindingDefinition({
          bindingDefinitionId: "bind-1",
          revision: 0,
          bindings: { S: { continuity: intent as never } },
        }),
      );
      expect(definition.bindings.S?.continuity).toEqual(intent);
    });
  }

  it("rejects false presence flags", () => {
    for (const field of ["preferPersistent", "requirePersistent"]) {
      expect(() =>
        parseBindingDefinition(
          authorBindingDefinition({
            bindingDefinitionId: "bind-1",
            revision: 0,
            bindings: { S: { continuity: { [field]: false } as never } },
          }),
        ),
      ).toThrowError(BindingParseError);
    }
  });

  it("rejects multi-field continuity combinations", () => {
    const combos: readonly Record<string, unknown>[] = [
      { pin: "P", preferPersistent: true },
      { pin: "P", requirePersistent: true },
      { requirePersistent: true, preferPersistent: true },
    ];
    for (const continuity of combos) {
      expect(() =>
        parseBindingDefinition(
          authorBindingDefinition({
            bindingDefinitionId: "bind-1",
            revision: 0,
            bindings: { S: { continuity: continuity as never } },
          }),
        ),
      ).toThrowError(BindingParseError);
    }
  });
});

describe("binding parser: PF-01 explicit Case E", () => {
  it("preserves a present continuity:{} as meaningful Case E even with no hard requirements", () => {
    const definition = parseBindingDefinition(
      authorBindingDefinition({
        bindingDefinitionId: "bind-case-e",
        revision: 0,
        bindings: { S: { continuity: {} } },
      }),
    );
    expect(definition.bindings.S).toEqual({ continuity: {} });
  });

  it("normalizes a present-but-empty hard object to absent", () => {
    const definition = parseBindingDefinition(
      authorBindingDefinition({
        bindingDefinitionId: "bind-empty-hard",
        revision: 0,
        bindings: {
          S: { continuity: { requirePersistent: true }, hard: {} },
        },
      }),
    );
    expect(definition.bindings.S).toEqual({ continuity: { requirePersistent: true } });
  });

  it("rejects a subject whose only content is an empty hard object (normalizes to empty)", () => {
    expect(() =>
      parseBindingDefinition(
        authorBindingDefinition({
          bindingDefinitionId: "bind-empty-hard",
          revision: 0,
          bindings: { T: { hard: { runtimeFeatures: [] } } as SubjectBinding },
        }),
      ),
    ).toThrowError(/normalizes to an empty entry/);
  });

  it("keeps explicit Case E digest-distinct from subject absence (PF-01 digest rule)", () => {
    const withCaseE = authorBindingDefinition({
      bindingDefinitionId: "bind-x",
      revision: 0,
      bindings: { S: { continuity: {} } },
    });
    const withoutSubject = authorBindingDefinition({
      bindingDefinitionId: "bind-x",
      revision: 0,
      bindings: { T: { continuity: {} } },
    });
    expect(withCaseE.digest).not.toBe(withoutSubject.digest);
  });
});

describe("binding parser: structure", () => {
  it("rejects an explicit definition with zero subjects", () => {
    expect(() =>
      parseBindingDefinition(
        authorBindingDefinition({ bindingDefinitionId: "b", revision: 0, bindings: {} }),
      ),
    ).toThrowError(/at least one subject entry/);
  });

  it("rejects a subject entry with no binding semantics", () => {
    expect(() =>
      parseBindingDefinition(
        authorBindingDefinition({
          bindingDefinitionId: "b",
          revision: 0,
          bindings: { S: {} as SubjectBinding },
        }),
      ),
    ).toThrowError(/no binding semantics/);
  });

  it("rejects a subject entry that normalizes to empty (hard: {} only)", () => {
    expect(() =>
      parseBindingDefinition(
        authorBindingDefinition({
          bindingDefinitionId: "b",
          revision: 0,
          bindings: { S: { hard: {} } },
        }),
      ),
    ).toThrowError(/normalizes to an empty entry/);
  });

  it("rejects unknown fields at every frozen level", () => {
    const base = authorBindingDefinition({
      bindingDefinitionId: "b",
      revision: 0,
      bindings: { S: { continuity: { pin: "P" }, hard: { runtimeFeatures: ["f"] } } },
    });
    const mutate = (path: string[], extra: Record<string, unknown>): unknown => {
      const clone = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
      let level = clone;
      for (const key of path.slice(0, -1)) {
        level = level[key] as Record<string, unknown>;
      }
      const last = path[path.length - 1];
      if (last === undefined) throw new Error("empty mutation path");
      Object.assign(level, { [last]: extra });
      return clone;
    };
    expect(() => parseBindingDefinition(mutate(["extra"], {} as never))).toThrowError(
      /unknown field "extra"/,
    );
    expect(() =>
      parseBindingDefinition(mutate(["bindings", "S", "extra"], {} as never)),
    ).toThrowError(/unknown field "extra"/);
    expect(() =>
      parseBindingDefinition(mutate(["bindings", "S", "continuity", "extra"], {} as never)),
    ).toThrowError(/unknown field "extra"/);
    expect(() =>
      parseBindingDefinition(mutate(["bindings", "S", "hard", "extra"], {} as never)),
    ).toThrowError(/unknown field "extra"/);
  });

  it("rejects duplicate semantic-set values", () => {
    expect(() =>
      parseBindingDefinition(
        authorBindingDefinition({
          bindingDefinitionId: "b",
          revision: 0,
          bindings: { S: { hard: { runtimeFeatures: ["f", "f"] } } },
        }),
      ),
    ).toThrowError(/duplicate value "f"/);
  });

  it("rejects a malformed revision", () => {
    for (const revision of [-1, 1.5, "0", null]) {
      expect(() =>
        parseBindingDefinition(
          authorBindingDefinition({
            bindingDefinitionId: "b",
            revision: revision as number,
            bindings: { S: { continuity: {} } },
          }),
        ),
      ).toThrowError(BindingParseError);
    }
  });
});

describe("binding parser: digest validation (fail closed)", () => {
  it("accepts a matching digest", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b",
      revision: 0,
      bindings: { S: { continuity: {} } },
    });
    expect(parseBindingDefinition(definition).digest).toBe(definition.digest);
  });

  it("rejects a tampered digest", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b",
      revision: 0,
      bindings: { S: { continuity: {} } },
    });
    const tampered = {
      ...definition,
      digest: (definition.digest.slice(0, -1) === "a" ? "b" : "a") + definition.digest.slice(1),
    } as BindingDefinition;
    expect(() => parseBindingDefinition(tampered)).toThrowError(/digest mismatch/);
  });

  it("computes the digest from canonical content (matches the authoring helper)", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b",
      revision: 3,
      bindings: { S: { hard: { toolCapabilities: ["repo_access"] } } },
    });
    expect(definition.digest).toBe(computeBindingDefinitionDigest(definition));
  });
});

describe("binding parser: PF-02 subject coverage", () => {
  it("accepts total coverage including an explicit Case E subject", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b",
      revision: 0,
      bindings: {
        A: { continuity: { pin: "P" } },
        B: { continuity: {} },
      },
    });
    expect(() => validateSubjectCoverage(["A", "B"], definition)).not.toThrow();
  });

  it("fails configuration validation for a missing participating subject", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b",
      revision: 0,
      bindings: { A: { continuity: {} } },
    });
    expect(() => validateSubjectCoverage(["A", "B"], definition)).toThrowError(
      BindingConfigurationError,
    );
    expect(() => validateSubjectCoverage(["A", "B"], definition)).toThrowError(
      /"B" has no entry/,
    );
  });
});
