/**
 * G10-B3 freshness proofs: `Current ≠ Stale` orthogonality to satisfiability
 * (B3-M11), stale detection per provenance input, and rebinding immutability
 * (B3-M12, plan-state fixture).
 */

import { describe, expect, it } from "vitest";

import type {
  BindingResolutionResult,
  FreshnessBasis,
  ResolverInput,
} from "../src/binding/index.js";
import {
  authorBindingDefinition,
  makeInput,
  makeSnapshot,
  refOf,
} from "./binding_helpers.js";
import {
  evaluateFreshness,
  materializeResolutionResult,
  resolveBindingCore,
} from "../src/binding/index.js";

function basis(overrides: Partial<FreshnessBasis> = {}): FreshnessBasis {
  return {
    architecture: { definitionId: "architecture-fixture", revision: 2, digest: "arch-digest-1" },
    work: { definitionId: "work-fixture", revision: 5, digest: "work-digest-1" },
    intentSource: { kind: "implicit_ephemeral_default", semanticVersion: 1 },
    runConfigurationDigest: "run-config-digest-1",
    snapshot: { ref: "snap-1" },
    resolverPolicy: { id: "minimal.lexicographic", version: "1" },
    ...overrides,
  };
}

function resolvedResult(): BindingResolutionResult {
  return materializeResolutionResult(resolveBindingCore(makeInput()), "r-1");
}

function unsatisfiedResult(): {
  readonly result: BindingResolutionResult;
  readonly basis: FreshnessBasis;
} {
  const definition = authorBindingDefinition({
    bindingDefinitionId: "b-req",
    revision: 0,
    bindings: { S: { continuity: { requirePersistent: true } } },
  });
  const intentSource = { kind: "explicit" as const, binding: refOf(definition) };
  const result = materializeResolutionResult(
    resolveBindingCore(
      makeInput({
        intentSource,
        explicitDefinition: definition,
      }),
    ),
  );
  return { result, basis: basis({ intentSource }) };
}

describe("freshness: current basis (B3-M11)", () => {
  it("reports current for a satisfied result whose basis matches", () => {
    expect(evaluateFreshness(resolvedResult(), basis())).toBe("current");
  });

  it("reports current for an unsatisfied result whose basis matches", () => {
    const { result, basis: matchingBasis } = unsatisfiedResult();
    expect(evaluateFreshness(result, matchingBasis)).toBe("current");
  });
});

describe("freshness: each provenance input independently (B3-M11)", () => {
  it("architecture definition change → stale", () => {
    expect(
      evaluateFreshness(resolvedResult(), basis({
        architecture: { definitionId: "architecture-fixture", revision: 3, digest: "arch-digest-2" },
      })),
    ).toBe("stale");
  });

  it("work definition change → stale", () => {
    expect(
      evaluateFreshness(resolvedResult(), basis({
        work: { definitionId: "work-fixture", revision: 6, digest: "work-digest-2" },
      })),
    ).toBe("stale");
  });

  it("intent source change → stale", () => {
    const definition = authorBindingDefinition({
      bindingDefinitionId: "b-late",
      revision: 0,
      bindings: { S: { continuity: {} } },
    });
    expect(
      evaluateFreshness(resolvedResult(), basis({
        intentSource: { kind: "explicit", binding: refOf(definition) },
      })),
    ).toBe("stale");
  });

  it("run-configuration digest change → stale", () => {
    expect(evaluateFreshness(resolvedResult(), basis({ runConfigurationDigest: "rc-2" }))).toBe(
      "stale",
    );
  });

  it("snapshot change → stale", () => {
    expect(evaluateFreshness(resolvedResult(), basis({ snapshot: { ref: "snap-2" } }))).toBe(
      "stale",
    );
  });

  it("resolver-policy change → stale", () => {
    expect(
      evaluateFreshness(resolvedResult(), basis({
        resolverPolicy: { id: "minimal.lexicographic", version: "2" },
      })),
    ).toBe("stale");
  });
});

describe("rebinding immutability (B3-M12, §77/§78)", () => {
  const definition = authorBindingDefinition({
    bindingDefinitionId: "b-rebind",
    revision: 0,
    bindings: { S: { continuity: { pin: "P" } } },
  });

  it("produces a new resolution on a new snapshot without mutating anything", () => {
    const intentSource = { kind: "explicit" as const, binding: refOf(definition) };
    const inputOn = (snapshotRef: string): ResolverInput =>
      makeInput({
        intentSource,
        explicitDefinition: definition,
        snapshot: makeSnapshot({
          ref: snapshotRef,
          persistentCandidates: [{ point: "P", available: true }],
        }),
      });

    const r1 = materializeResolutionResult(resolveBindingCore(inputOn("snap-1")), "r-1");
    const r1Before = JSON.stringify(r1);

    // Snapshot moves: r1 becomes stale for current execution...
    expect(
      evaluateFreshness(r1, {
        architecture: { definitionId: "architecture-fixture", revision: 2, digest: "arch-digest-1" },
        work: { definitionId: "work-fixture", revision: 5, digest: "work-digest-1" },
        intentSource,
        runConfigurationDigest: "run-config-digest-1",
        snapshot: { ref: "snap-2" },
        resolverPolicy: { id: "minimal.lexicographic", version: "1" },
      }),
    ).toBe("stale");

    // ...and rebinding resolves r2 against the new snapshot.
    const r2 = materializeResolutionResult(resolveBindingCore(inputOn("snap-2")), "r-2");

    expect(JSON.stringify(r1)).toBe(r1Before); // r1 unchanged
    expect(r2.status).toBe("satisfied");
    if (r1.status !== "satisfied" || r2.status !== "satisfied") return;
    // Same selection, but the snapshot basis moved — the resolution digest covers
    // provenance/snapshot identity, so r2's digest is distinct from r1's.
    expect(r2.continuity.S).toEqual(r1.continuity.S);
    expect(r2.digest).not.toBe(r1.digest);
    expect(r2.resolutionId).toBe("r-2");
    expect(definition.bindings.S).toEqual({ continuity: { pin: "P" } }); // definition unchanged
  });

  it("keeps the plan-state fixture immutable across a rebind (§78)", () => {
    const inputOn = (snapshotRef: string): ResolverInput =>
      makeInput({
        intentSource: { kind: "implicit_ephemeral_default", semanticVersion: 1 },
        snapshot: makeSnapshot({ ref: snapshotRef }),
      });
    const planState = (name: string, snapshotRef: string) => ({
      name,
      bindingResolution: {
        resolutionId: `res-${name}`,
        digest: materializeResolutionResult(resolveBindingCore(inputOn(snapshotRef)), `res-${name}`)
          .status === "satisfied"
          ? (
              materializeResolutionResult(resolveBindingCore(inputOn(snapshotRef)), `res-${name}`) as {
                digest: string;
              }
            ).digest
          : "",
      },
    });

    const p1 = planState("p1", "snap-1");
    const before = JSON.stringify(p1);
    const p2 = planState("p2", "snap-2");
    expect(JSON.stringify(p1)).toBe(before); // p1 unchanged
    expect(p2.bindingResolution.resolutionId).toBe("res-p2");
  });
});
