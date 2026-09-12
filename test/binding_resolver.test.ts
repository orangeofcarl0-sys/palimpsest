/**
 * G10-B3 pure resolver proofs: legacy implicit default (B3-M01), explicit Case E
 * (B3-M02), pin/require/prefer semantics (B3-M06/M07/M08), capability merging
 * (B3-M09), determinism (B3-M10), no runtime identity (B3-M13), no point
 * creation / snapshot immutability (B3-M14), and PF-02 subject coverage (§73).
 */

import { describe, expect, it } from "vitest";

import type { ResolverInput } from "../src/binding/index.js";
import {
  authorBindingDefinition,
  makeInput,
  makeSnapshot,
  refOf,
} from "./binding_helpers.js";
import {
  compileBindingIntentSource,
  materializeResolutionResult,
  MINIMAL_RESOLVER_POLICY,
  resolveBindingCore,
} from "../src/binding/index.js";

function pointAt(
  point: string,
  requirements: { runtimeFeatures?: string[]; toolCapabilities?: string[] } = {},
) {
  return { point, available: true, ...requirements };
}

describe("binding resolver: legacy implicit default (B3-M01, §65)", () => {
  it("compiles a missing explicit definition to the implicit ephemeral default source", () => {
    expect(compileBindingIntentSource(undefined)).toEqual({
      kind: "implicit_ephemeral_default",
      semanticVersion: 1,
    });
  });

  it("compiles an explicit definition to its exact ref", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b",
      revision: 3,
      bindings: { S: { continuity: {} } },
    });
    expect(compileBindingIntentSource(definition)).toEqual({ kind: "explicit", binding: refOf(definition) });
  });

  it("resolves legacy no-binding ephemerally with no fake definition or point", () => {
    const result = resolveBindingCore(makeInput());
    expect(result.status).toBe("satisfied");
    if (result.status !== "satisfied") return;
    expect(result.provenance.intentSource).toEqual({
      kind: "implicit_ephemeral_default",
      semanticVersion: 1,
    });
    expect(result.continuity.S).toEqual({ kind: "ephemeral" });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("bindingDefinitionId");
    expect(serialized).not.toContain("PersistentPoint");
  });
});

describe("binding resolver: explicit Case E (B3-M02/PF-01, §66)", () => {
  it("resolves an explicit continuity:{} subject ephemerally under an explicit source", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b",
      revision: 0,
      bindings: { S: { continuity: {} } },
    });
    const result = resolveBindingCore(
      makeInput({
        intentSource: { kind: "explicit", binding: refOf(definition) },
        explicitDefinition: definition,
      }),
    );
    expect(result.status).toBe("satisfied");
    if (result.status !== "satisfied") return;
    expect(result.continuity.S).toEqual({ kind: "ephemeral" });
    expect(result.provenance.intentSource).toEqual({ kind: "explicit", binding: refOf(definition) });
  });

  it("never selects a durable point for Case E even when one is available (PF-04)", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b",
      revision: 0,
      bindings: { S: { continuity: {} } },
    });
    const result = resolveBindingCore(
      makeInput({
        intentSource: { kind: "explicit", binding: refOf(definition) },
        explicitDefinition: definition,
        snapshot: makeSnapshot({
          persistentCandidates: [pointAt("P")],
        }),
      }),
    );
    expect(result.status).toBe("satisfied");
    if (result.status !== "satisfied") return;
    expect(result.continuity.S).toEqual({ kind: "ephemeral" });
  });
});

describe("binding resolver: pin semantics (B3-M06, §69)", () => {
  const definition = authorBindingDefinition({
    bindingDefinitionId: "b-pin",
    revision: 0,
    bindings: { S: { continuity: { pin: "P" } } },
  });

  function input(snapshot = makeSnapshot()): ResolverInput {
    return makeInput({
      intentSource: { kind: "explicit", binding: refOf(definition) },
      explicitDefinition: definition,
      snapshot,
    });
  }

  it("selects exactly P when available and compatible", () => {
    const result = resolveBindingCore(input(makeSnapshot({ persistentCandidates: [pointAt("P")] })));
    expect(result.status).toBe("satisfied");
    if (result.status !== "satisfied") return;
    expect(result.continuity.S).toEqual({ kind: "persistent", point: "P" });
  });

  it("reports pinned_target_unavailable without falling back to another point", () => {
    const result = resolveBindingCore(
      input(makeSnapshot({ persistentCandidates: [pointAt("Q")] })),
    );
    expect(result.status).toBe("unsatisfied");
    if (result.status !== "unsatisfied") return;
    expect(result.reasons).toEqual(["pinned_target_unavailable"]);
  });

  it("reports pinned_target_incompatible when P fails a hard constraint", () => {
    const hardDefinition = authorBindingDefinition({
      bindingDefinitionId: "b-pin-hard",
      revision: 0,
      bindings: {
        S: { continuity: { pin: "P" }, hard: { toolCapabilities: ["repo_access"] } },
      },
    });
    const withHard = input(
      makeSnapshot({
        persistentCandidates: [{ point: "P", available: true }],
      }),
    );
    // Replace the whole input coherently: the pin now carries a hard
    // requirement the point does not satisfy.
    const withHardCoherent: ResolverInput = {
      ...withHard,
      intentSource: { kind: "explicit", binding: refOf(hardDefinition) },
      explicitDefinition: hardDefinition,
    };
    const result = resolveBindingCore(withHardCoherent);
    expect(result.status).toBe("unsatisfied");
    if (result.status !== "unsatisfied") return;
    expect(result.reasons).toEqual(["pinned_target_incompatible"]);
  });
});

describe("binding resolver: require semantics (B3-M07, §68/§72)", () => {
  const definition = authorBindingDefinition({
    bindingDefinitionId: "b-req",
    revision: 0,
    bindings: { S: { continuity: { requirePersistent: true } } },
  });

  function input(snapshot = makeSnapshot()): ResolverInput {
    return makeInput({
      intentSource: { kind: "explicit", binding: refOf(definition) },
      explicitDefinition: definition,
      snapshot,
    });
  }

  it("selects deterministically (lexicographic) among admissible durable candidates", () => {
    const result = resolveBindingCore(
      input(makeSnapshot({ persistentCandidates: [pointAt("Q"), pointAt("P")] })),
    );
    expect(result.status).toBe("satisfied");
    if (result.status !== "satisfied") return;
    expect(result.continuity.S).toEqual({ kind: "persistent", point: "P" });
  });

  it("reports no_matching_persistent_point when only ephemeral is admissible", () => {
    const result = resolveBindingCore(input());
    expect(result.status).toBe("unsatisfied");
    if (result.status !== "unsatisfied") return;
    expect(result.reasons).toEqual(["no_matching_persistent_point"]);
  });

  it("reports required_capability_unavailable when nothing satisfies the merged hard set (§72)", () => {
    const hardDefinition = authorBindingDefinition({
      bindingDefinitionId: "b-req-hard",
      revision: 0,
      bindings: {
        S: { continuity: { requirePersistent: true }, hard: { toolCapabilities: ["repo_access"] } },
      },
    });
    const withHardCoherent: ResolverInput = {
      ...input(
        makeSnapshot({
          // The ephemeral profile and the durable candidate both lack repo_access.
          persistentCandidates: [pointAt("P", { runtimeFeatures: ["f"] })],
        }),
      ),
      intentSource: { kind: "explicit", binding: refOf(hardDefinition) },
      explicitDefinition: hardDefinition,
    };
    const result = resolveBindingCore(withHardCoherent);
    expect(result.status).toBe("unsatisfied");
    if (result.status !== "unsatisfied") return;
    expect(result.reasons).toEqual(["required_capability_unavailable"]);
  });
});

describe("binding resolver: prefer semantics and capability interaction (B3-M08, §71)", () => {
  const definition = authorBindingDefinition({
    bindingDefinitionId: "b-pref",
    revision: 0,
    bindings: { S: { continuity: { preferPersistent: true } } },
  });

  it("prefers an admissible durable candidate", () => {
    const result = resolveBindingCore(
      makeInput({
        intentSource: { kind: "explicit", binding: refOf(definition) },
        explicitDefinition: definition,
        snapshot: makeSnapshot({ persistentCandidates: [pointAt("P")] }),
      }),
    );
    expect(result.status).toBe("satisfied");
    if (result.status !== "satisfied") return;
    expect(result.continuity.S).toEqual({ kind: "persistent", point: "P" });
  });

  it("falls back to a valid ephemeral resolution when only an incompatible point exists (§71)", () => {
    const result = resolveBindingCore(
      makeInput({
        intentSource: { kind: "explicit", binding: refOf(definition) },
        explicitDefinition: definition,
        snapshot: makeSnapshot({
          ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: ["repo_access"] },
          persistentCandidates: [pointAt("P")], // durable point lacks the required capability
        }),
        workHard: { S: { toolCapabilities: ["repo_access"] } },
      }),
    );
    // The durable point lacks the required capability, but persistence was only
    // preferred: the ephemeral path satisfies every hard constraint.
    expect(result.status).toBe("satisfied");
    if (result.status !== "satisfied") return;
    expect(result.continuity.S).toEqual({ kind: "ephemeral" });
  });
});

describe("binding resolver: capability merge (B3-M09, §49/§70)", () => {
  it("merges Architecture + Work + Binding hard requirements by union per subject", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-merge",
      revision: 0,
      bindings: {
        S: { hard: { toolCapabilities: ["repo_access"] } },
      },
    });
    const result = resolveBindingCore(
      makeInput({
        intentSource: { kind: "explicit", binding: refOf(definition) },
        explicitDefinition: definition,
        architectureHard: { S: { runtimeFeatures: ["f1"] } },
        workHard: { S: { runtimeFeatures: ["f2"], toolCapabilities: ["repo_access"] } },
        snapshot: makeSnapshot({
          ephemeralCapabilities: {
            runtimeFeatures: ["f1", "f2"],
            toolCapabilities: ["repo_access"],
          },
        }),
      }),
    );
    expect(result.status).toBe("satisfied");
    if (result.status !== "satisfied") return;
    expect(result.continuity.S).toEqual({ kind: "ephemeral" });
  });

  it("does not copy merged requirements back into the BindingDefinition", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-merge",
      revision: 0,
      bindings: { S: { hard: { toolCapabilities: ["repo_access"] } } },
    });
    resolveBindingCore(
      makeInput({
        intentSource: { kind: "explicit", binding: refOf(definition) },
        explicitDefinition: definition,
        workHard: { S: { runtimeFeatures: ["f2"] } },
      }),
    );
    expect(definition.bindings.S).toEqual({ hard: { toolCapabilities: ["repo_access"] } });
  });
});

describe("binding resolver: determinism and purity (B3-M10/M14)", () => {
  it("is deterministic for identical complete inputs; caller-supplied ids stay outside the digest", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-det",
      revision: 0,
      bindings: { S: { continuity: { pin: "P" } } },
    });
    const input = (): ResolverInput =>
      makeInput({
        intentSource: { kind: "explicit", binding: refOf(definition) },
        explicitDefinition: definition,
        snapshot: makeSnapshot({ persistentCandidates: [pointAt("P")] }),
      });
    const first = materializeResolutionResult(resolveBindingCore(input()), "resolution-1");
    const second = materializeResolutionResult(resolveBindingCore(input()), "resolution-1");
    expect(first).toEqual(second);
    const differentId = materializeResolutionResult(resolveBindingCore(input()), "resolution-2");
    expect(differentId.status).toBe("satisfied");
    if (differentId.status !== "satisfied" || first.status !== "satisfied") return;
    expect(differentId.digest).toBe(first.digest);
    expect(differentId.resolutionId).toBe("resolution-2");
  });

  it("never mutates the read-only snapshot and never creates points (B3-M14)", () => {
    const snapshot = makeSnapshot({
      persistentCandidates: [pointAt("P", { runtimeFeatures: ["f"] })],
    });
    const before = JSON.stringify(snapshot);
    const input = makeInput({ snapshot });
    resolveBindingCore(input);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("emits no runtime identity fields (B3-M13)", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-id",
      revision: 0,
      bindings: { S: { continuity: { pin: "P" } } },
    });
    const satisfied = materializeResolutionResult(
      resolveBindingCore(
        makeInput({
          intentSource: { kind: "explicit", binding: refOf(definition) },
          explicitDefinition: definition,
          snapshot: makeSnapshot({ persistentCandidates: [pointAt("P")] }),
        }),
      ),
      "r-1",
    );
    const serialized = JSON.stringify(satisfied);
    for (const forbidden of ["agentId", "sessionId", "callId", "attemptId", "peerRef"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("exposes the spike resolver policy for provenance only", () => {
    expect(MINIMAL_RESOLVER_POLICY).toEqual({ id: "minimal.lexicographic", version: "1" });
  });
});
