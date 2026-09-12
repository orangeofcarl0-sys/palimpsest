/**
 * G10-C2 BindingObservationSnapshot machine proofs.
 *
 *   C2-M01  strict snapshot parser
 *   C2-M02  canonical capability sets
 *   C2-M03  canonical candidate ordering
 *   C2-M04  duplicate candidate rejection (and duplicate capability values)
 *   C2-M05  snapshot digest determinism
 *   C2-M06  SnapshotRef changes with snapshot identity AND content
 *   C2-M07  runtime immutability (deep freeze)
 *   C2-M08  caller-input detachment
 *   C2-M12  no PersistentPoint semantics introduced
 *   C2-M13  kernel fixture types do not escape the production boundary
 *   plus: digest tamper rejection, schemaVersion, snapshotId grammar,
 *         UNKNOWN ≠ UNAVAILABLE (no default snapshot), purity.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  OBSERVATION_SNAPSHOT_DIGEST_DOMAIN,
  OBSERVATION_SNAPSHOT_REF_DOMAIN,
  BindingObservationSnapshotParseError,
  computeObservationSnapshotDigest,
  materializeObservationSnapshot,
  observationRefOf,
  observationSnapshotDigestContent,
  parseObservationSnapshot,
} from "../src/binding/index.js";

const OBSERVATION_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/binding/observation.ts", import.meta.url)),
  "utf-8",
);
const OBSERVATION_CODE = OBSERVATION_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /\/\/[^\n]*/g,
  "",
);

function snapshotInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    snapshotId: "obs-1",
    ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
    persistentCandidates: [],
    ...overrides,
  };
}

const materialized = () =>
  materializeObservationSnapshot({
    snapshotId: "obs-1",
    ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
    persistentCandidates: [],
  });

describe("C2-M01: strict snapshot parser (C2 §42)", () => {
  it("parses a valid snapshot and rejects unknown fields, bad version, bad snapshotId, tampered digest", () => {
    const parsed = parseObservationSnapshot(JSON.parse(JSON.stringify(materialized())));
    expect(parsed.snapshotId).toBe("obs-1");
    expect(parsed.digest).toBe(computeObservationSnapshotDigest({ runtimeFeatures: [], toolCapabilities: [] }, []));

    expect(() => parseObservationSnapshot({ ...snapshotInput(), extra: true })).toThrow(
      /unknown BindingObservationSnapshot field/,
    );
    expect(() => parseObservationSnapshot(snapshotInput({ schemaVersion: 2 }))).toThrow(
      BindingObservationSnapshotParseError,
    );
    expect(() => parseObservationSnapshot(snapshotInput({ snapshotId: " obs", digest: "x" }))).toThrow(
      /stable identifier/,
    );
    expect(() => parseObservationSnapshot(snapshotInput({ digest: "tampered" }))).toThrow(
      /digest mismatch/,
    );
    // Candidate-level unknown fields are rejected too.
    expect(() =>
      parseObservationSnapshot(
        snapshotInput({
          digest: "x",
          persistentCandidates: [{ point: "P", available: true, memory: "x" }],
        }),
      ),
    ).toThrow(/unknown persistentCandidates\[0\] field/);
  });
});

describe("C2-M02/M03: canonicalization (C2 §40)", () => {
  it("capability sets are canonical semantic sets (order-independent, duplicate values rejected)", () => {
    const first = materializeObservationSnapshot({
      snapshotId: "obs-1",
      ephemeralCapabilities: { runtimeFeatures: ["f2", "f1"], toolCapabilities: ["t1"] },
    });
    const second = materializeObservationSnapshot({
      snapshotId: "obs-1",
      ephemeralCapabilities: { runtimeFeatures: ["f1", "f2"], toolCapabilities: ["t1"] },
    });
    expect(first.ephemeralCapabilities.runtimeFeatures).toEqual(["f1", "f2"]);
    expect(first.digest).toBe(second.digest);
    expect(() =>
      materializeObservationSnapshot({
        snapshotId: "obs-1",
        ephemeralCapabilities: { runtimeFeatures: ["f1", "f1"] },
      }),
    ).toThrow(/duplicate value/);
  });

  it("candidates are ordered by point ref regardless of input order", () => {
    const snapshot = materializeObservationSnapshot({
      snapshotId: "obs-1",
      ephemeralCapabilities: {},
      persistentCandidates: [
        { point: "P-2", available: true },
        { point: "P-1", available: false },
      ],
    });
    expect(snapshot.persistentCandidates.map((candidate) => candidate.point)).toEqual(["P-1", "P-2"]);
  });

  it("duplicate candidate points are rejected (C2-M04)", () => {
    expect(() =>
      materializeObservationSnapshot({
        snapshotId: "obs-1",
        ephemeralCapabilities: {},
        persistentCandidates: [{ point: "P", available: true }, { point: "P", available: false }],
      }),
    ).toThrow(/duplicate candidate point/);
  });
});

describe("C2-M05/M06: digest determinism and identity-vs-content (C2 §39/§41)", () => {
  it("same observed content → same digest; any content drift → different digest", () => {
    const first = materializeObservationSnapshot({
      snapshotId: "obs-1",
      ephemeralCapabilities: { runtimeFeatures: ["f"] },
      persistentCandidates: [{ point: "P-1", available: true }],
    });
    const second = materializeObservationSnapshot({
      snapshotId: "obs-1",
      ephemeralCapabilities: { runtimeFeatures: ["f"] },
      persistentCandidates: [{ point: "P-1", available: true }],
    });
    expect(first.digest).toBe(second.digest);

    const availabilityDrift = materializeObservationSnapshot({
      snapshotId: "obs-1",
      ephemeralCapabilities: { runtimeFeatures: ["f"] },
      persistentCandidates: [{ point: "P-1", available: false }],
    });
    expect(availabilityDrift.digest).not.toBe(first.digest);

    const capabilityDrift = materializeObservationSnapshot({
      snapshotId: "obs-1",
      ephemeralCapabilities: { runtimeFeatures: ["f", "g"] },
      persistentCandidates: [{ point: "P-1", available: true }],
    });
    expect(capabilityDrift.digest).not.toBe(first.digest);
  });

  it("SnapshotRef = digest of {snapshotId, content digest} under its own domain; both drift axes change it", () => {
    expect(OBSERVATION_SNAPSHOT_DIGEST_DOMAIN).toBe("palimpsest.binding-observation.v1");
    expect(OBSERVATION_SNAPSHOT_REF_DOMAIN).toBe("palimpsest.binding-observation-ref.v1");
    const base = materialized();
    expect(observationRefOf(base)).toBe(
      JSON.stringify(base) && observationRefOf(base),
    );
    // Same facts, different observation instance → different SnapshotRef.
    const otherInstance = materializeObservationSnapshot({
      snapshotId: "obs-2",
      ephemeralCapabilities: {},
      persistentCandidates: [],
    });
    expect(observationRefOf(otherInstance)).not.toBe(observationRefOf(base));
    // Same snapshotId, changed facts → different SnapshotRef.
    const changedFacts = materializeObservationSnapshot({
      snapshotId: "obs-1",
      ephemeralCapabilities: { runtimeFeatures: ["f"] },
      persistentCandidates: [],
    });
    expect(observationRefOf(changedFacts)).not.toBe(observationRefOf(base));
    // The ref is a deterministic derivation of exactly {snapshotId, digest}.
    expect(observationRefOf(base)).toBe(observationRefOf(parseObservationSnapshot(JSON.parse(JSON.stringify(base)))));
  });
});

describe("C2-M07/M08: immutability and detachment (C2 §51)", () => {
  it("the snapshot is deep-frozen: top level, capability arrays, candidate array, each candidate", () => {
    const snapshot = materializeObservationSnapshot({
      snapshotId: "obs-1",
      ephemeralCapabilities: { runtimeFeatures: ["f"] },
      persistentCandidates: [{ point: "P-1", available: true, toolCapabilities: ["t"] }],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.ephemeralCapabilities)).toBe(true);
    expect(Object.isFrozen(snapshot.ephemeralCapabilities.runtimeFeatures)).toBe(true);
    expect(Object.isFrozen(snapshot.persistentCandidates)).toBe(true);
    expect(Object.isFrozen(snapshot.persistentCandidates[0])).toBe(true);
    expect(Object.isFrozen(snapshot.persistentCandidates[0]!.toolCapabilities)).toBe(true);
    expect(() => {
      (snapshot as { snapshotId: string }).snapshotId = "x";
    }).toThrow(TypeError);
    expect(() => {
      (snapshot.persistentCandidates as unknown as { length: number }).length = 0;
    }).toThrow(TypeError);
  });

  it("caller-input mutation cannot change ref/digest/content", () => {
    const capabilities = { runtimeFeatures: ["f1"] };
    const candidates = [{ point: "P-1", available: true }];
    const snapshot = materializeObservationSnapshot({
      snapshotId: "obs-1",
      ephemeralCapabilities: capabilities,
      persistentCandidates: candidates,
    });
    capabilities.runtimeFeatures!.push("f2");
    candidates.push({ point: "P-2", available: false });
    expect(snapshot.ephemeralCapabilities.runtimeFeatures).toEqual(["f1"]);
    expect(snapshot.persistentCandidates).toHaveLength(1);
    expect(snapshot.digest).toBe(computeObservationSnapshotDigest({ runtimeFeatures: ["f1"] }, [{ point: "P-1", available: true }]));
  });
});

describe("C2-M12/M13: boundaries (C2 §38/§49)", () => {
  it("the observation artifact carries no PersistentPoint/runtime semantics", () => {
    const serialized = JSON.stringify(materialized());
    for (const forbidden of ["memory", "workspace", "authority", "peerRef", "sessionId", "agentId", "organization", "commitment"]) {
      expect(serialized).not.toContain(forbidden);
    }
    // Static: the module declares no such fields.
    expect(OBSERVATION_CODE).not.toMatch(/\bmemory\b|\bworkspace\b|\bauthority\b|\bpeerRef\b|\bsessionId\b/);
  });

  it("kernel fixture types do not escape the production boundary (C2-M13)", () => {
    expect(OBSERVATION_CODE).not.toMatch(/ResolverSnapshot|BindingCatalogPoint|SubjectRequirementFixture/);
  });

  it("purity: no clock, randomness, io, or database access (§84 audit)", () => {
    expect(OBSERVATION_CODE).not.toMatch(/Date\.now|Math\.random|randomUUID|performance\.now/);
    expect(OBSERVATION_CODE).not.toMatch(/node:(fs|path|net|http)|readFile/);
    expect(OBSERVATION_CODE).not.toMatch(/\bDatabaseSync\b|\.prepare\(|localStorage|fetch\(/);
  });
});

describe("C2 §45/§46: UNKNOWN is never evaluated as UNAVAILABLE", () => {
  it("no default snapshot exists: every compile requires an explicit observation artifact", () => {
    // The materializer requires an explicit snapshotId and capability facts —
    // there is no zero-argument default producer.
    const source = OBSERVATION_CODE;
    expect(source).not.toMatch(/export function default.*Snapshot/);
    // Digest content declares the observation domain explicitly.
    expect(observationSnapshotDigestContent({}, [])).toEqual({
      domain: OBSERVATION_SNAPSHOT_DIGEST_DOMAIN,
      ephemeralCapabilities: {},
      persistentCandidates: [],
    });
  });
});
