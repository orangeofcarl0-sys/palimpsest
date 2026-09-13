/**
 * G10-F2 OrganizationDefinition machine proofs (§72).
 *
 *   F2-M01  Organization ≠ Coalition
 *   F2-M02  Organization ≠ WorkGraph
 *   F2-M03  Organization ≠ RuntimeScope
 *   F2-M04  Role ≠ member identity
 *   F2-M05  role permission ≠ effect authority
 *   F2-M06  capability advertisement ≠ capability truth
 *   F2-M07  overlapping org membership allowed
 *   F2-M08  member identity namespaces remain distinct
 *   F2-M09  canonicalization deterministic
 *   F2-M10  strict parser
 *   F2-M11  nested immutability
 *   F2-M12  organization revision immutable
 *   F2-M13  conflicting lineage head fails closed
 *   F2-M14  coalition provenance does not auto-create org
 *   plus store persistence/replay
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OrganizationStoreError,
  SqliteOrganizationStore,
  materializeOrganizationDefinition,
  materializeOrganizationFromCoalition,
  organizationMemberKey,
  organizationRefOf,
  parseOrganizationDefinition,
  parseOrganizationRef,
  roleEligibilityView,
} from "../src/organization/index.js";
import type {
  OrganizationDefinition,
  OrganizationMemberRef,
  RoleAssignment,
  RoleDefinition,
} from "../src/organization/index.js";
import { materializeCoalitionSnapshot } from "../src/federation/index.js";
import { materializePeerRef } from "../src/federation/index.js";

const SRC = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/organization/${relative}`, import.meta.url)), "utf-8");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const PEER_A = materializePeerRef({ peerId: "alpha" });
const PEER_B = materializePeerRef({ peerId: "beta" });

function peerMember(peerId: string): OrganizationMemberRef {
  return { kind: "peer", peer: materializePeerRef({ peerId }) };
}
function agentMember(architectureDefinitionId: string, agentDefinitionId: string): OrganizationMemberRef {
  return { kind: "agent_definition", architectureDefinitionId, agentDefinitionId };
}

const ROLES: readonly RoleDefinition[] = [
  { roleId: "researcher", requiredCapabilities: ["search", "write"] },
  { roleId: "reviewer", requiredCapabilities: ["review"] },
];
const ASSIGNMENTS: readonly RoleAssignment[] = [
  { member: peerMember("alpha"), roleId: "researcher" },
  { member: peerMember("beta"), roleId: "reviewer" },
];

function org(overrides: Partial<Parameters<typeof materializeOrganizationDefinition>[0]> = {}): OrganizationDefinition {
  return materializeOrganizationDefinition({
    organizationDefinitionId: "org-1",
    revision: 0,
    mission: "advance the frontier",
    members: [peerMember("alpha"), peerMember("beta")],
    roles: ROLES,
    assignments: ASSIGNMENTS,
    ...overrides,
  });
}

function deepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(deepFrozen);
}

describe("F2-M01/M02/M03: Organization is not Coalition / WorkGraph / RuntimeScope", () => {
  it("definition/store/eligibility depend on no coalition, WorkGraph, scheduler, or runtime concern", () => {
    for (const file of ["definition.ts", "store.ts", "eligibility.ts"]) {
      const code = strip(SRC(file));
      expect(code).not.toMatch(/coalition/i);
      expect(code).not.toMatch(/workgraph|scheduler|taskspec|projectir/i);
      expect(code).not.toMatch(/runtimescope|activation|sessionRef|retry|budget/i);
    }
    // Coalition authoring is the ONE explicit, non-automatic bridge.
    expect(strip(SRC("from_coalition.ts"))).toMatch(/coalition/);
  });

  it("an OrganizationDefinition carries organization semantics only", () => {
    const definition = org();
    expect(Object.keys(definition).sort()).toEqual([
      "assignments",
      "digest",
      "interactions",
      "members",
      "mission",
      "norms",
      "organizationDefinitionId",
      "revision",
      "roles",
      "schemaVersion",
    ]);
    expect(definition).not.toHaveProperty("peers");
    expect(definition).not.toHaveProperty("basis");
    expect(definition).not.toHaveProperty("workGraph");
  });
});

describe("F2-M04: Role ≠ member identity", () => {
  it("a RoleId and a member identity are disjoint namespaces", () => {
    const definition = org();
    expect(definition.roles.map((role) => role.roleId)).toEqual(["researcher", "reviewer"]);
    expect(definition.members.map(organizationMemberKey)).not.toContain("reviewer");
    // A member may hold multiple roles; a role may be held by multiple members.
    const shared = materializeOrganizationDefinition({
      organizationDefinitionId: "org-2",
      revision: 0,
      mission: "m",
      members: [peerMember("alpha"), peerMember("beta")],
      roles: [{ roleId: "reviewer", requiredCapabilities: [] }],
      assignments: [
        { member: peerMember("alpha"), roleId: "reviewer" },
        { member: peerMember("beta"), roleId: "reviewer" },
      ],
    });
    expect(shared.assignments).toHaveLength(2);
  });
});

describe("F2-M05: role permission ≠ effect authority", () => {
  it("norms are normative data only; the module has no effect-authority path", () => {
    const definition = org({
      norms: [{ normId: "n1", kind: "permission", roleId: "reviewer", actionTag: "approve-report" }],
    });
    expect(definition.norms[0]).toEqual({
      normId: "n1",
      kind: "permission",
      roleId: "reviewer",
      actionTag: "approve-report",
    });
    const code = strip(SRC("definition.ts")) + strip(SRC("store.ts")) + strip(SRC("eligibility.ts"));
    expect(code).not.toMatch(/ordarium|effects|git|authorityGrant|grantAuthority/i);
  });
});

describe("F2-M06: capability advertisement ≠ capability truth", () => {
  it("required capabilities are declarations; eligibility is labelled honestly", () => {
    const definition = org();
    // The definition declares requirements without any capability evidence.
    expect(definition.roles.find((role) => role.roleId === "researcher")?.requiredCapabilities).toEqual(["search", "write"]);
    const unknown = roleEligibilityView(definition, () => undefined);
    expect(unknown.every((entry) => entry.basis === "capability_unknown")).toBe(true);

    const insufficient = roleEligibilityView(definition, (member) =>
      organizationMemberKey(member) === "peer:alpha" ? ["search"] : ["review"],
    );
    expect(insufficient[0]!.basis).toBe("declared_capability_insufficient");
    expect(insufficient[0]!.missingDeclaredCapabilities).toEqual(["write"]);

    const eligible = roleEligibilityView(definition, () => ["search", "write", "review"]);
    expect(eligible.every((entry) => entry.basis === "eligible_by_declared_capability")).toBe(true);
    // Never claims verified possession.
    expect(JSON.stringify(eligible)).not.toMatch(/verified|capable_verified/);
  });
});

describe("F2-M07: overlapping organization membership allowed", () => {
  it("the same peer is a member of two organizations; no organizationId on the member", () => {
    const o1 = org();
    const o2 = org({ organizationDefinitionId: "org-2" });
    const a1 = o1.members.find((member) => organizationMemberKey(member) === "peer:alpha")!;
    const a2 = o2.members.find((member) => organizationMemberKey(member) === "peer:alpha")!;
    expect(a1).toEqual(a2);
    expect(a1).not.toHaveProperty("organizationId");
    expect(o1.organizationDefinitionId).not.toBe(o2.organizationDefinitionId);
  });
});

describe("F2-M08: member identity namespaces remain distinct", () => {
  it("a peer and an agent definition with the same string value are different members", () => {
    const definition = materializeOrganizationDefinition({
      organizationDefinitionId: "org-1",
      revision: 0,
      mission: "m",
      members: [
        { kind: "peer", peer: materializePeerRef({ peerId: "alpha" }) },
        { kind: "agent_definition", architectureDefinitionId: "arch-1", agentDefinitionId: "alpha" },
      ],
      roles: [],
      assignments: [],
    });
    expect(definition.members).toHaveLength(2);
    const keys = definition.members.map(organizationMemberKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys).toContain("peer:alpha");
    expect(keys).toContain("agent:arch-1/alpha");
  });
});

describe("F2-M09: canonicalization deterministic", () => {
  it("shuffled input produces the same digest and canonical order", () => {
    const base = {
      organizationDefinitionId: "org-1",
      revision: 0,
      mission: "m",
      roles: [
        { roleId: "b", requiredCapabilities: ["z", "a"] },
        { roleId: "a", requiredCapabilities: [] },
      ] as readonly RoleDefinition[],
      assignments: [
        { member: peerMember("beta"), roleId: "b" },
        { member: peerMember("alpha"), roleId: "a" },
      ] as readonly RoleAssignment[],
    };
    const first = materializeOrganizationDefinition({ ...base, members: [peerMember("beta"), peerMember("alpha")] });
    const second = materializeOrganizationDefinition({ ...base, members: [peerMember("alpha"), peerMember("beta")] });
    expect(second.digest).toBe(first.digest);
    expect(first.roles.map((role) => role.roleId)).toEqual(["a", "b"]);
    expect(first.roles[1]!.requiredCapabilities).toEqual(["a", "z"]);
    expect(first.members.map(organizationMemberKey)).toEqual(["peer:alpha", "peer:beta"]);
  });
});

describe("F2-M10: strict parser", () => {
  it("rejects unknown fields, dangling references, duplicates, and a bad digest", () => {
    const definition = org();
    expect(() => parseOrganizationDefinition({ ...definition, rogue: true })).toThrow(/unknown .* field/);
    expect(() =>
      parseOrganizationDefinition({
        ...definition,
        assignments: [{ member: peerMember("ghost"), roleId: "researcher" }],
      }),
    ).toThrow(/unknown member/);
    expect(() =>
      parseOrganizationDefinition({
        ...definition,
        assignments: [{ member: peerMember("alpha"), roleId: "nope" }],
      }),
    ).toThrow(/unknown RoleId/);
    expect(() =>
      parseOrganizationDefinition({
        ...definition,
        assignments: [ASSIGNMENTS[0]!, ASSIGNMENTS[0]!],
      }),
    ).toThrow(/duplicate role assignment/);
    expect(() =>
      parseOrganizationDefinition({
        ...definition,
        norms: [{ normId: "n1", kind: "permission", roleId: "nope", actionTag: "x" }],
      }),
    ).toThrow(/unknown RoleId/);
    expect(() => parseOrganizationDefinition({ ...definition, digest: "0".repeat(64) })).toThrow(/digest mismatch/);
    // Round-trip.
    expect(parseOrganizationDefinition(JSON.parse(JSON.stringify(definition)))).toEqual(definition);
  });
});

describe("F2-M11: nested immutability", () => {
  it("the definition is deeply frozen with canonical nested sets frozen", () => {
    const definition = org({
      norms: [{ normId: "n1", kind: "obligation", roleId: "researcher", actionTag: "cite" }],
      interactions: [{ interactionId: "i1", fromRoleId: "researcher", toRoleId: "reviewer", protocol: "review-request" }],
    });
    expect(deepFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.members)).toBe(true);
    expect(Object.isFrozen(definition.roles[0]!.requiredCapabilities)).toBe(true);
  });
});

describe("F2-M12: organization revision immutable", () => {
  it("re-registering a revision with different content fails closed", async () => {
    const store = new SqliteOrganizationStore(":memory:");
    const definition = org();
    await store.registerRevision({ definition, parent: null, expectedHeadRevision: null });
    const changed = materializeOrganizationDefinition({
      organizationDefinitionId: "org-1",
      revision: 0,
      mission: "different mission",
      members: [peerMember("alpha"), peerMember("beta")],
      roles: ROLES,
      assignments: ASSIGNMENTS,
    });
    await expect(
      store.registerRevision({ definition: changed, parent: null, expectedHeadRevision: null }),
    ).rejects.toBeInstanceOf(OrganizationStoreError);
    expect(await store.listRevisions("org-1")).toHaveLength(1);
    // Byte-identical duplicate is idempotent.
    await store.registerRevision({ definition, parent: null, expectedHeadRevision: null });
    expect(await store.listRevisions("org-1")).toHaveLength(1);
    store.close();
  });
});

describe("F2-M13: conflicting lineage head fails closed", () => {
  it("head mismatch, non-head parent, revision jump, genesis-on-existing, and fork all fail", async () => {
    const store = new SqliteOrganizationStore(":memory:");
    const rev0 = org();
    await store.registerRevision({ definition: rev0, parent: null, expectedHeadRevision: null });
    const ref0 = organizationRefOf(rev0);

    const rev1 = org({ revision: 1, mission: "m1" });
    // Wrong expected head.
    await expect(
      store.registerRevision({ definition: rev1, parent: ref0, expectedHeadRevision: 7 }),
    ).rejects.toMatchObject({ kind: "head_mismatch" });

    // Parent not the current head (digest differs).
    const bogusParent = { organizationDefinitionId: "org-1", revision: 0, digest: "f".repeat(64) };
    await expect(
      store.registerRevision({ definition: rev1, parent: bogusParent, expectedHeadRevision: 0 }),
    ).rejects.toMatchObject({ kind: "lineage_conflict" });

    // Revision jump.
    const rev5 = org({ revision: 5, mission: "jump" });
    await expect(
      store.registerRevision({ definition: rev5, parent: ref0, expectedHeadRevision: 0 }),
    ).rejects.toMatchObject({ kind: "invalid_registration" });

    // Genesis on an existing organization with different content.
    const otherGenesis = org({ mission: "other genesis" });
    await expect(
      store.registerRevision({ definition: otherGenesis, parent: null, expectedHeadRevision: null }),
    ).rejects.toMatchObject({ kind: "artifact_conflict" });

    // Correct revision 1 commits; then a competing fork under the same head fails.
    await store.registerRevision({ definition: rev1, parent: ref0, expectedHeadRevision: 0 });
    const fork = org({ revision: 1, mission: "fork" });
    await expect(
      store.registerRevision({ definition: fork, parent: ref0, expectedHeadRevision: 0 }),
    ).rejects.toMatchObject({ kind: "artifact_conflict" });
    expect(await store.listRevisions("org-1")).toHaveLength(2);
    store.close();
  });
});

describe("F2-M14: coalition provenance does not auto-create an organization", () => {
  it("explicit authoring is required; coalition only seeds peer members and is cited", () => {
    const coalition = materializeCoalitionSnapshot({
      scope: { kind: "contact_need", contactNeedId: "need-1" },
      basis: { throughSeq: 3, digest: "b".repeat(64) },
      members: [PEER_A, PEER_B],
      sourceCommitments: ["c-1"],
      sourceParticipations: [],
    });
    const result = materializeOrganizationFromCoalition({
      coalition,
      organizationDefinitionId: "org-1",
      revision: 0,
      mission: "explicit mission",
      roles: ROLES,
      assignments: ASSIGNMENTS,
    });
    expect(result.definition.members.map(organizationMemberKey)).toEqual(["peer:alpha", "peer:beta"]);
    expect(result.provenance.snapshotDigest).toBe(coalition.digest);
    // Provenance is not identity.
    expect(result.definition.organizationDefinitionId).not.toBe(coalition.digest);
    // Roles/assignments came only from the explicit input — nothing inferred.
    expect(result.definition.roles).toHaveLength(2);
    expect(result.definition.norms).toEqual([]);
    expect(result.definition.interactions).toEqual([]);
  });
});

describe("F2 store: persistence and replay", () => {
  it("a reopened store reproduces the revision lineage", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "palimpsest-f2-")), "organization.sqlite");
    const store = new SqliteOrganizationStore(path);
    const rev0 = org();
    await store.registerRevision({ definition: rev0, parent: null, expectedHeadRevision: null });
    const rev1 = org({ revision: 1, mission: "m1" });
    await store.registerRevision({ definition: rev1, parent: organizationRefOf(rev0), expectedHeadRevision: 0 });
    store.close();

    const reopened = new SqliteOrganizationStore(path);
    expect((await reopened.head("org-1"))?.revision).toBe(1);
    expect((await reopened.current("org-1"))?.mission).toBe("m1");
    const lineage = await reopened.lineage("org-1");
    expect(lineage).toHaveLength(2);
    expect(lineage[0]!.parent).toBeNull();
    expect(lineage[1]!.parent).toEqual(organizationRefOf(rev0));
    expect(parseOrganizationRef(organizationRefOf(rev1))).toEqual(organizationRefOf(rev1));
    reopened.close();
  });
});
