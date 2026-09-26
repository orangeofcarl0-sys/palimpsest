/**
 * SR-2d3 §十九 — the COLLABORATION SUBSTRATE cycle, as machine proofs.
 *
 *     stable identity/contracts  →  Coordination semantics  →  Federation transport
 *
 * The ten-file SCC spanned `boundary_memory/ref`, `coordination/*`, `federation/*` and
 * `organization/definition`. The ruling made this slice conditional: if breaking it required
 * changing the federation wire protocol, commitment identity, the persisted message shape or the
 * organization semantics, STOP (停点 B).
 *
 * MEASURED: it did not. Every reverse edge was a pure IDENTITY REF or a PARSER CONTRACT —
 * `PeerRef`, `ActivationRef`, `AttemptRef`, `OrganizationDefinitionRef`,
 * `AcceptedBoundaryRevisionRef`, `CoordinationEventParsers`. Not one touched the protocol, a
 * commitment identity, a persisted payload shape or organization semantics.
 *
 * So the fix is §十九's allowed one: move the identity contracts into a neutral layer that sits
 * BELOW both. Nothing about any wire shape moved.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyseModuleArchitecture, layerOf } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

const FORMER_MEMBERS = [
  "src/boundary_memory/ref.ts",
  "src/coordination/attempts.ts",
  "src/coordination/index.ts",
  "src/coordination/participate.ts",
  "src/coordination/participation.ts",
  "src/coordination/store.ts",
  "src/federation/commitment.ts",
  "src/federation/messages.ts",
  "src/federation/peer.ts",
  "src/organization/definition.ts",
];

/* ================================================================== *
 * The cycle is gone
 * ================================================================== */

describe("SR-2d3 §十九 the ten-file collaboration substrate cycle is gone", () => {
  it("no SCC contains ten files any more, and none contains these ten modules", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const big = architecture.stronglyConnectedComponents.filter((component) => component.size >= 10);
    expect(big).toEqual([]);
    const offending = architecture.stronglyConnectedComponents.filter((component) =>
      component.files.some((file) => FORMER_MEMBERS.includes(file)),
    );
    expect(offending).toEqual([]);
  });

  it("the direction among the former members is now one-way", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const set = new Set(FORMER_MEMBERS);
    const edges = new Set<string>();
    for (const module of architecture.modules) {
      if (!set.has(module.file)) continue;
      for (const target of module.imports) {
        if (set.has(target)) edges.add(`${module.file} -> ${target}`);
      }
    }
    /**
     * The three reverse edges that closed the cycle are gone:
     *   federation/commitment.ts → coordination/index.ts   (AttemptRef)
     *   federation/messages.ts   → coordination/store.ts   (the parser contract)
     *   federation/peer.ts       → coordination/index.ts   (ActivationRef / AttemptRef)
     *   coordination/store.ts    → federation/*            (the parser TABLES)
     *   boundary_memory/ref.ts   → organization/definition.ts
     *   organization/definition.ts → federation/peer.ts
     */
    for (const gone of [
      "src/federation/commitment.ts -> src/coordination/index.ts",
      "src/federation/messages.ts -> src/coordination/store.ts",
      "src/federation/peer.ts -> src/coordination/index.ts",
      "src/boundary_memory/ref.ts -> src/organization/definition.ts",
      "src/organization/definition.ts -> src/federation/peer.ts",
    ]) {
      expect(edges.has(gone), `the reverse edge ${gone} must be gone`).toBe(false);
    }
  });

  it("the identity layer is the ONE place the refs are declared", () => {
    const identity = read("src/identity/refs.ts");
    for (const symbol of [
      "export interface PeerRef",
      "export interface ActivationRef",
      "export interface AttemptRef",
      "export interface OrganizationDefinitionRef",
      "export interface AcceptedBoundaryRevisionRef",
      "export type CoordinationEventParsers",
    ]) {
      expect(identity, `the identity layer must declare ${symbol}`).toContain(symbol);
    }
    expect(layerOf("src/identity/refs.ts").layer).toBe("L2");
    // And it is a LOW layer: it imports the schema grammar and the helper leaves, not the
    // coordination or federation semantics it serves.
    const architecture = analyseModuleArchitecture(REPO);
    const node = architecture.modules.find((module) => module.file === "src/identity/refs.ts")!;
    for (const forbidden of ["src/coordination/store.ts", "src/federation/", "src/organization/definition.ts"]) {
      expect(
        node.imports.some((target) => target.startsWith(forbidden)),
        `the identity layer must not import ${forbidden}`,
      ).toBe(false);
    }
  });
});

/* ================================================================== *
 * 停点 B: no protocol changed
 * ================================================================== */

describe("SR-2d3 §十九 停点 B was not reached — no protocol moved", () => {
  it("the parsers still accept EXACTLY the same fields, with the same rejections", () => {
    const identity = read("src/identity/refs.ts");
    // PeerRef: exactly schemaVersion + peerId, and the unknown-field refusal is spelled out.
    expect(identity).toContain('key !== "schemaVersion" && key !== "peerId"');
    expect(identity).toContain('fail("PeerRef requires schemaVersion and peerId")');
    // AttemptRef: exactly the two canonical Work identity fields.
    expect(identity).toContain('const ATTEMPT_REF_KEYS = ["projectId", "attemptId"] as const;');
    // ActivationRef: exactly the four provenance fields, with the nested refs validated as objects.
    expect(identity).toContain(
      'const ACTIVATION_REF_KEYS = ["activationId", "agentDefinitionId", "runDefinition", "bindingResolution"] as const;',
    );
    // OrganizationDefinitionRef: exactly three fields.
    expect(identity).toContain('"organizationDefinitionId", "revision", "digest"');
    // AcceptedBoundaryRevisionRef: exactly six fields.
    expect(identity).toContain('"schemaVersion", "workspaceId", "artifactId", "revision", "candidateDigest", "revisionDigest"');
  });

  it("the exception CLASSES are the same objects — a caller's catch still works", () => {
    // The peer error moved WITH its parser, and organization/definition.ts re-exports the same
    // class from its new home; neither is a second definition.
    expect(read("src/identity/refs.ts")).toContain("export class PeerIdentityError extends Error");
    expect(read("src/identity/refs.ts")).toContain("export class OrganizationDefinitionError extends Error");
    expect(read("src/federation/peer.ts")).toContain('export { materializePeerRef, parsePeerRef, PeerIdentityError }');
    expect(read("src/organization/definition.ts")).toContain('from "../identity/refs.js"');
  });

  it("the commitment / message / organization SEMANTICS modules were not rewritten", () => {
    // The protocol-bearing modules still own their event vocabularies and payload parsers.
    const commitment = read("src/federation/commitment.ts");
    expect(commitment).toContain("export const COMMITMENT_EVENT_PARSERS");
    expect(commitment).toContain("COMMITMENT_OFFERED");
    const messages = read("src/federation/messages.ts");
    expect(messages).toContain("export const FEDERATION_EVENT_PARSERS");
    expect(messages).toContain("CONTACT_REQUESTED");
    // And the store still composes the tables — the registry stayed where it was.
    expect(read("src/coordination/store.ts")).toContain("DEFAULT_COORDINATION_EVENT_PARSERS");
  });

  it("the persisted coordination store shape is untouched — no schema, no migration", () => {
    const store = read("src/coordination/store.ts");
    expect(store).toContain("CREATE TABLE IF NOT EXISTS coordination_events");
    // Its DDL and its append/conflict vocabulary are unchanged by this slice.
    for (const kept of ["CoordinationStoreError", "CoordinationConflictError", "appendAtomic", "expectedHeadSeq"]) {
      expect(store, `the store must keep ${kept}`).toContain(kept);
    }
  });
});

/* ================================================================== *
 * The exception was deleted with the cycle
 * ================================================================== */

describe("SR-2 §三十一 the cycle's exception was deleted, not left dormant", () => {
  it("the baseline records FIVE cycles — the ten-file one is gone", () => {
    const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
      .baseline as { permittedCycles: readonly { files: readonly string[] }[] };
    expect(baseline.permittedCycles).toHaveLength(5);
    for (const gone of FORMER_MEMBERS) {
      const offending = baseline.permittedCycles.filter((cycle) => cycle.files.includes(gone));
      expect(offending, `no recorded cycle may contain ${gone}`).toEqual([]);
    }
  });

  it("the remaining five are exactly the ones SR-2 leaves alone", () => {
    const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
      .baseline as { permittedCycles: readonly { files: readonly string[] }[] };
    const groups = baseline.permittedCycles.map((cycle) => cycle.files[0]!.split("/")[1]).sort();
    // Campaign, domain/schema, proof_asset, project_management and project_verification — all
    // explicitly OUT of SR-2 by §二十.
    expect(groups).toEqual(["campaign", "domain", "project_management", "project_verification", "proof_asset"]);
  });

  it("the exception set only ever shrank: 12 → 9 across the d-slices", () => {
    const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
      .baseline as { permittedForbiddenEdges: readonly unknown[]; permittedCycles: readonly unknown[] };
    expect(baseline.permittedForbiddenEdges).toHaveLength(4);
    expect(baseline.permittedCycles).toHaveLength(5);
    // 4 edges + 5 cycles = 9 accepted exceptions, down from 12.
    expect(baseline.permittedForbiddenEdges.length + baseline.permittedCycles.length).toBe(9);
  });
});
