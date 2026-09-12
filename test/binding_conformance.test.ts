/**
 * G10-B3C contract-conformance regression proofs.
 *
 * Each test reproduced a defect on the pre-closure HEAD (3880f42) before the
 * fix was applied (test-first rule). Proofs:
 *   B3C-M01 exact explicit subject-set equality (BC-01)
 *   B3C-M02 frozen reason-priority ordering, not lexical (BC-02)
 *   B3C-M03 intentSource ↔ explicitDefinition coherence (BC-03)
 *   B3C-M04 actual resolver-policy provenance (BC-04)
 *   B3C-M05 canonical parser representation (BC-05)
 *   B3C-M06 resolution detached from mutable inputs (BC-06)
 */

import { describe, expect, it } from "vitest";

import type { BindingDefinition, ResolverInput } from "../src/binding/index.js";
import {
  BindingConfigurationError,
  orderUnsatisfiedReasons,
  validateSubjectCoverage,
} from "../src/binding/index.js";
import {
  compileBindingIntentSource,
  materializeResolutionResult,
  parseBindingDefinition,
  resolveBindingCore,
} from "../src/binding/index.js";
import { authorBindingDefinition, makeInput, makeSnapshot, refOf } from "./binding_helpers.js";

function inputWithDefinition(
  definition: BindingDefinition,
  overrides: Partial<ResolverInput> = {},
): ResolverInput {
  return makeInput({
    intentSource: { kind: "explicit", binding: refOf(definition) },
    explicitDefinition: definition,
    ...overrides,
  });
}

describe("B3C-M01: exact explicit subject-set equality (BC-01, PF-02)", () => {
  const definition = authorBindingDefinition({
    bindingDefinitionId: "b-eq",
    revision: 0,
    bindings: {
      A: { continuity: { pin: "P" } },
      B: { continuity: {} },
    },
  });

  it("accepts exact coverage (participating == binding subjects)", () => {
    expect(() =>
      resolveBindingCore(inputWithDefinition(definition, { participatingSubjects: ["A", "B"] })),
    ).not.toThrow();
  });

  it("accepts exact coverage regardless of subject order (set semantics)", () => {
    expect(() =>
      resolveBindingCore(inputWithDefinition(definition, { participatingSubjects: ["B", "A"] })),
    ).not.toThrow();
  });

  it("rejects a missing binding subject", () => {
    expect(() =>
      resolveBindingCore(inputWithDefinition(definition, { participatingSubjects: ["A"] })),
    ).toThrowError(BindingConfigurationError);
  });

  it("rejects an extra binding subject — the defect BC-01 closes", () => {
    // participating = {A}; binding = {A,B}. The pre-closure implementation only
    // checked the subset direction and silently ignored B; PF-02 requires
    // set equality.
    expect(() =>
      resolveBindingCore(inputWithDefinition(definition, { participatingSubjects: ["A"] })),
    ).toThrowError(BindingConfigurationError);
    // Wait — that input has participating={A} which is the MISSING case.
    // The extra-subject case is participating={A,B}, binding={A,B,C}:
    const larger = authorBindingDefinition({
      bindingDefinitionId: "b-eq-larger",
      revision: 0,
      bindings: {
        A: { continuity: { pin: "P" } },
        B: { continuity: {} },
        C: { continuity: {} },
      },
    });
    expect(() =>
      resolveBindingCore(inputWithDefinition(larger, { participatingSubjects: ["A", "B"] })),
    ).toThrowError(/not a participating subject/);
  });

  it("validates through validateSubjectCoverage with set semantics (centralized)", () => {
    expect(() => validateSubjectCoverage(["A", "B"], definition)).not.toThrow();
    expect(() => validateSubjectCoverage(["A"], definition)).toThrowError(
      BindingConfigurationError,
    );
  });
});

describe("B3C-M02: frozen reason-priority ordering (BC-02)", () => {
  it("orders cross-tier reasons semantically, not lexically", () => {
    // Lexical sort would place no_matching_persistent_point BEFORE
    // required_capability_unavailable; frozen priority places capability
    // (tier 2) before continuity-absence (tier 3).
    const ordered = orderUnsatisfiedReasons([
      "no_matching_persistent_point",
      "required_capability_unavailable",
    ]);
    expect(ordered).toEqual(["required_capability_unavailable", "no_matching_persistent_point"]);
  });

  it("keeps pinned-tier reasons ahead of every lower tier", () => {
    const ordered = orderUnsatisfiedReasons([
      "no_matching_persistent_point",
      "pinned_target_incompatible",
      "required_capability_unavailable",
      "pinned_target_unavailable",
    ]);
    // Both pinned reasons share tier 0 (lexically incompatible < unavailable);
    // tier 1 capability; tier 2 continuity-absence.
    expect(ordered).toEqual([
      "pinned_target_incompatible",
      "pinned_target_unavailable",
      "required_capability_unavailable",
      "no_matching_persistent_point",
    ]);
  });

  it("uses deterministic lexical order within the same tier (implementation choice; the contract does not order the pinned variants)", () => {
    expect(
      orderUnsatisfiedReasons(["pinned_target_unavailable", "pinned_target_incompatible"]),
    ).toEqual(["pinned_target_incompatible", "pinned_target_unavailable"]);
  });

  it("resolves a multi-subject mixed failure in frozen priority order (B3C-M02 proof)", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-mixed",
      revision: 0,
      bindings: {
        S: { continuity: { requirePersistent: true }, hard: { toolCapabilities: ["repo_access"] } },
        T: { continuity: { requirePersistent: true } },
      },
    });
    const result = resolveBindingCore(
      inputWithDefinition(definition, {
        participatingSubjects: ["S", "T"],
        snapshot: makeSnapshot({
          // S cannot satisfy repo_access anywhere (tier 2);
          // T has no admissible durable locus (tier 3).
          ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
          persistentCandidates: [],
        }),
      }),
    );
    expect(result.status).toBe("unsatisfied");
    if (result.status !== "unsatisfied") return;
    // Lexical order would be [no_matching_persistent_point, required_capability_unavailable].
    expect(result.reasons).toEqual([
      "required_capability_unavailable",
      "no_matching_persistent_point",
    ]);
  });

  it("keeps a pinned-tier reason ahead of a lower-tier reason in resolved output", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-mixed-pin",
      revision: 0,
      bindings: {
        S: { continuity: { pin: "P" } },
        // T requires a capability no candidate satisfies (tier 1).
        T: { continuity: { requirePersistent: true }, hard: { toolCapabilities: ["vault"] } },
      },
    });
    const result = resolveBindingCore(
      inputWithDefinition(definition, {
        participatingSubjects: ["S", "T"],
        snapshot: makeSnapshot({
          ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
          persistentCandidates: [{ point: "Q", available: true }],
        }),
      }),
    );
    expect(result.status).toBe("unsatisfied");
    if (result.status !== "unsatisfied") return;
    // S's pin target P is absent (tier 0); T's capability is unsatisfiable
    // everywhere (tier 1). Lexical order within each tier is deterministic.
    expect(result.reasons).toEqual(["pinned_target_unavailable", "required_capability_unavailable"]);
  });
});

describe("B3C-M03: intentSource ↔ explicitDefinition coherence (BC-03)", () => {
  const definition = authorBindingDefinition({
    bindingDefinitionId: "b-coherent",
    revision: 7,
    bindings: { S: { continuity: {} } },
  });

  it("accepts an exact ref matching the definition", () => {
    expect(() => resolveBindingCore(inputWithDefinition(definition))).not.toThrow();
  });

  it("rejects a wrong-id ref", () => {
    const input = inputWithDefinition(definition, {
      intentSource: {
        kind: "explicit",
        binding: { ...refOf(definition), bindingDefinitionId: "other" },
      },
    });
    expect(() => resolveBindingCore(input)).toThrowError(BindingConfigurationError);
  });

  it("rejects a wrong-revision ref", () => {
    const input = inputWithDefinition(definition, {
      intentSource: {
        kind: "explicit",
        binding: { ...refOf(definition), revision: 8 },
      },
    });
    expect(() => resolveBindingCore(input)).toThrowError(BindingConfigurationError);
  });

  it("rejects a wrong-digest ref", () => {
    const input = inputWithDefinition(definition, {
      intentSource: {
        kind: "explicit",
        binding: { ...refOf(definition), digest: "deadbeef" },
      },
    });
    expect(() => resolveBindingCore(input)).toThrowError(BindingConfigurationError);
  });

  it("rejects an implicit source combined with an explicitDefinition", () => {
    expect(() =>
      resolveBindingCore(
        makeInput({
          intentSource: compileBindingIntentSource(undefined),
          explicitDefinition: definition,
        }),
      ),
    ).toThrowError(BindingConfigurationError);
  });

  it("keeps compileBindingIntentSource coherent with the resolver (§19)", () => {
    const intentSource = compileBindingIntentSource(definition);
    expect(() =>
      resolveBindingCore(makeInput({ intentSource, explicitDefinition: definition })),
    ).not.toThrow();
  });
});

describe("B3C-M04: actual resolver-policy provenance (BC-04)", () => {
  it("records minimal.lexicographic@1 when the policy is omitted", () => {
    const input: ResolverInput & { resolverPolicy?: unknown } = makeInput();
    delete input.resolverPolicy;
    const result = resolveBindingCore(input);
    expect(result.status).toBe("satisfied");
    if (result.status !== "satisfied") return;
    expect(result.provenance.resolverPolicy).toEqual({
      id: "minimal.lexicographic",
      version: "1",
    });
  });

  it("accepts the exact supported policy", () => {
    const result = resolveBindingCore(
      makeInput({ resolverPolicy: { id: "minimal.lexicographic", version: "1" } }),
    );
    expect(result.status).toBe("satisfied");
    if (result.status !== "satisfied") return;
    expect(result.provenance.resolverPolicy).toEqual({
      id: "minimal.lexicographic",
      version: "1",
    });
  });

  it("rejects a different policy id", () => {
    expect(() =>
      resolveBindingCore(makeInput({ resolverPolicy: { id: "other.policy", version: "1" } })),
    ).toThrowError(BindingConfigurationError);
  });

  it("rejects a different policy version", () => {
    expect(() =>
      resolveBindingCore(
        makeInput({ resolverPolicy: { id: "minimal.lexicographic", version: "2" } }),
      ),
    ).toThrowError(BindingConfigurationError);
  });
});

describe("B3C-M05: canonical parser representation (BC-05)", () => {
  function parseBoth(featureOrders: [string[], string[]]) {
    const parse = (features: string[]): BindingDefinition =>
      parseBindingDefinition(
        authorBindingDefinition({
          bindingDefinitionId: "b-canonical",
          revision: 0,
          bindings: { S: { hard: { runtimeFeatures: features } } },
        }),
      );
    return [parse(featureOrders[0]), parse(featureOrders[1])] as const;
  }

  it("parses runtimeFeatures [b,a] and [a,b] to equal canonical arrays", () => {
    const [first, second] = parseBoth([
      ["b", "a"],
      ["a", "b"],
    ]);
    expect(first.bindings.S?.hard?.runtimeFeatures).toEqual(["a", "b"]);
    expect(second.bindings.S?.hard?.runtimeFeatures).toEqual(["a", "b"]);
  });

  it("parses toolCapabilities order variants to equal canonical arrays", () => {
    const parse = (capabilities: string[]): BindingDefinition =>
      parseBindingDefinition(
        authorBindingDefinition({
          bindingDefinitionId: "b-canonical",
          revision: 0,
          bindings: { S: { hard: { toolCapabilities: capabilities } } },
        }),
      );
    const first = parse(["z", "a"]);
    const second = parse(["a", "z"]);
    expect(first.bindings.S?.hard?.toolCapabilities).toEqual(["a", "z"]);
    expect(second.bindings.S?.hard?.toolCapabilities).toEqual(["a", "z"]);
  });

  it("parses subject insertion-order variants to the same canonical key order", () => {
    const parse = (
      bindings: Record<string, SubjectBindingShape>,
    ): BindingDefinition =>
      parseBindingDefinition(
        authorBindingDefinition({ bindingDefinitionId: "b-canonical", revision: 0, bindings }),
      );
    const first = parse({
      Z: { continuity: {} },
      A: { continuity: {} },
      M: { continuity: {} },
    });
    const second = parse({
      A: { continuity: {} },
      M: { continuity: {} },
      Z: { continuity: {} },
    });
    expect(Object.keys(first.bindings)).toEqual(["A", "M", "Z"]);
    expect(Object.keys(second.bindings)).toEqual(["A", "M", "Z"]);
  });

  it("yields the same digest for all semantic-order variants", () => {
    const first = parseBindingDefinition(
      authorBindingDefinition({
        bindingDefinitionId: "b-canonical",
        revision: 0,
        bindings: { S: { hard: { runtimeFeatures: ["b", "a"] } } },
      }),
    );
    const second = parseBindingDefinition(
      authorBindingDefinition({
        bindingDefinitionId: "b-canonical",
        revision: 0,
        bindings: { S: { hard: { runtimeFeatures: ["a", "b"] } } },
      }),
    );
    expect(first.digest).toBe(second.digest);
  });
});

interface SubjectBindingShape {
  readonly continuity?: Record<string, unknown>;
  readonly hard?: Record<string, unknown>;
}

describe("B3C-M06: resolution detached from mutable inputs (BC-06)", () => {
  const definition = authorBindingDefinition({
    bindingDefinitionId: "b-alias",
    revision: 0,
    bindings: { S: { continuity: { pin: "P" } } },
  });

  function mutableInput(): {
    readonly input: ResolverInput;
    readonly mutable: {
      architecture: { definitionId: string; revision: number; digest: string };
      work: { definitionId: string; revision: number; digest: string };
      binding: { bindingDefinitionId: string; revision: number; digest: string };
      snapshotRef: { ref: string };
      policy: { id: string; version: string };
    };
  } {
    const mutable = {
      architecture: { definitionId: "a", revision: 1, digest: "ad" },
      work: { definitionId: "w", revision: 1, digest: "wd" },
      binding: { bindingDefinitionId: "b-alias", revision: 0, digest: definition.digest },
      snapshotRef: { ref: "snap-alias" },
      policy: { id: "minimal.lexicographic", version: "1" },
    };
    const input: ResolverInput = {
      participatingSubjects: ["S"],
      architecture: mutable.architecture,
      work: mutable.work,
      architectureHard: {},
      workHard: {},
      intentSource: { kind: "explicit", binding: mutable.binding },
      explicitDefinition: definition,
      runConfigurationDigest: "rc",
      snapshot: makeSnapshot({
        ref: mutable.snapshotRef.ref,
        persistentCandidates: [{ point: "P", available: true }],
      }),
      resolverPolicy: mutable.policy,
    };
    return { input, mutable };
  }

  it("keeps provenance/selections stable when caller inputs are mutated afterwards", () => {
    const { input, mutable } = mutableInput();
    const result = materializeResolutionResult(resolveBindingCore(input), "r-1");
    expect(result.status).toBe("satisfied");
    const before = JSON.stringify(result);

    // Mutate every caller-owned input object through the escape hatch.
    (mutable.architecture as { revision: number }).revision = 99;
    (mutable.work as { digest: string }).digest = "mutated";
    (mutable.binding as { digest: string }).digest = "mutated";
    (mutable.snapshotRef as { ref: string }).ref = "mutated";
    (mutable.policy as { version: string }).version = "99";

    expect(JSON.stringify(result)).toBe(before);
  });

  it("keeps continuity selections frozen against nested mutation attempts", () => {
    const { input } = mutableInput();
    const result = materializeResolutionResult(resolveBindingCore(input), "r-1");
    expect(result.status).toBe("satisfied");
    if (result.status !== "satisfied") return;
    const selection = result.continuity.S as { kind: string };
    expect(() => {
      (selection as { kind: string }).kind = "mutated";
    }).toThrowError(TypeError);
    expect(selection.kind).toBe("persistent");
  });

  it("keeps unsatisfied results immutable and detached from input refs (§35)", () => {
    const { input, mutable } = mutableInput();
    const unsatDefinition = authorBindingDefinition({
      bindingDefinitionId: "b-alias",
      revision: 0,
      bindings: { S: { continuity: { pin: "Missing" } } },
    });
    const unsatInput: ResolverInput = {
      ...input,
      explicitDefinition: unsatDefinition,
      intentSource: { kind: "explicit", binding: refOf(unsatDefinition) },
    };
    const result = materializeResolutionResult(resolveBindingCore(unsatInput));
    expect(result.status).toBe("unsatisfied");
    const before = JSON.stringify(result);
    (mutable.architecture as { revision: number }).revision = 42;
    expect(JSON.stringify(result)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status !== "unsatisfied") return;
    expect(Object.isFrozen(result.reasons)).toBe(true);
  });
});
