/**
 * G10-B3 binding digest proofs: canonical ordering invariance (B3-M04),
 * identity/revision exclusion (B3-M05), and content sensitivity.
 */

import { describe, expect, it } from "vitest";

import type { BindingDefinition } from "../src/binding/index.js";
import { computeBindingDefinitionDigest } from "../src/binding/index.js";
import { authorBindingDefinition } from "./binding_helpers.js";

function digestOf(bindings: Record<string, unknown>, id = "b", revision = 0): string {
  return computeBindingDefinitionDigest({
    schemaVersion: 1,
    bindingDefinitionId: id,
    revision,
    digest: "",
    bindings: bindings as BindingDefinition["bindings"],
  });
}

describe("binding digest (B3-M04/M05)", () => {
  it("is invariant to subject map insertion order", () => {
    const first = digestOf({
      S: { continuity: { pin: "P" } },
      T: { continuity: {} },
    });
    // Same semantic content, keys inserted in reverse order.
    const second = digestOf({
      T: { continuity: {} },
      S: { continuity: { pin: "P" } },
    });
    expect(first).toBe(second);
  });

  it("is invariant to semantic-set ordering", () => {
    expect(
      digestOf({ S: { hard: { runtimeFeatures: ["a", "b"], toolCapabilities: ["c", "d"] } } }),
    ).toBe(
      digestOf({ S: { hard: { runtimeFeatures: ["b", "a"], toolCapabilities: ["d", "c"] } } }),
    );
  });

  it("excludes lineage identity: same content under different id/revision ⇒ same digest", () => {
    expect(digestOf({ S: { continuity: {} } }, "b", 0)).toBe(
      digestOf({ S: { continuity: {} } }, "other-lineage", 9),
    );
  });

  it("changes when semantic content changes (representative changes)", () => {
    const base = digestOf({ S: { continuity: {} } });
    expect(digestOf({ S: { continuity: { requirePersistent: true } } })).not.toBe(base);
    expect(digestOf({ S: { continuity: { preferPersistent: true } } })).not.toBe(base);
    expect(digestOf({ S: { continuity: { pin: "P" } } })).not.toBe(base);
    expect(digestOf({ S: { continuity: {}, hard: { runtimeFeatures: ["f"] } } })).not.toBe(base);
    expect(digestOf({ S: { continuity: {} }, T: { continuity: {} } })).not.toBe(base);
  });

  it("distinguishes explicit Case E from subject absence through the authoring helper", () => {
    const withCaseE = authorBindingDefinition({
      bindingDefinitionId: "b",
      revision: 0,
      bindings: { S: { continuity: {} } },
    });
    const withoutSubject = authorBindingDefinition({
      bindingDefinitionId: "b",
      revision: 0,
      bindings: { T: { continuity: {} } },
    });
    expect(withCaseE.digest).not.toBe(withoutSubject.digest);
  });

  it("produces a stable 64-character hex digest (SHA-256 implementation choice)", () => {
    expect(digestOf({ S: { continuity: {} } })).toMatch(/^[0-9a-f]{64}$/);
  });
});
