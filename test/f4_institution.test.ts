/**
 * G10-F4 durable institution continuity kernel machine proofs (§136).
 *
 *   F4-M01  Institution ≠ Organization
 *   F4-M02  Institution ≠ PersistentPoint
 *   F4-M03  Institution ≠ RuntimeAgent/Session
 *   F4-M04  continuation authority explicit
 *   F4-M05  role does not imply continuation authority
 *   F4-M06  current authority controls authority revision
 *   F4-M07  new authority cannot self-authorize
 *   F4-M08  approval threshold deterministic
 *   F4-M09  duplicate approval counted once
 *   F4-M10  stale base epoch rejects transition
 *   F4-M11  epoch advancement atomic
 *   F4-M12  charter immutable/versioned
 *   F4-M13  total member replacement preserves InstitutionId
 *   F4-M14  different OrganizationId can preserve InstitutionId when authorized
 *   F4-M15  zero active runtime does not terminate institution
 *   plus store persistence/replay
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SqliteOrganizationStore,
  materializeOrganizationDefinition,
  organizationRefOf,
} from "../src/organization/index.js";
import type { OrganizationDefinition, OrganizationMemberRef } from "../src/organization/index.js";
import {
  InstitutionStoreError,
  SqliteInstitutionStore,
  makeInstitutionService,
  materializeInstitutionCharter,
} from "../src/institution/index.js";
import type { InstitutionService } from "../src/institution/index.js";
import { materializePeerRef } from "../src/federation/index.js";

const SRC = (file: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/institution/${file}`, import.meta.url)), "utf-8");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const A = materializePeerRef({ peerId: "peer-a" });
const B = materializePeerRef({ peerId: "peer-b" });
const C = materializePeerRef({ peerId: "peer-c" });
const D = materializePeerRef({ peerId: "peer-d" });

const peer = (peerId: string): OrganizationMemberRef => ({ kind: "peer", peer: materializePeerRef({ peerId }) });

async function org(store: SqliteOrganizationStore, id: string, members: readonly string[]): Promise<OrganizationDefinition> {
  const definition = materializeOrganizationDefinition({
    organizationDefinitionId: id,
    revision: 0,
    mission: `mission of ${id}`,
    members: members.map(peer),
    roles: [{ roleId: "manager", requiredCapabilities: [] }],
    assignments: members.map((member) => ({ member: peer(member), roleId: "manager" })),
  });
  await store.registerRevision({ definition, parent: null, expectedHeadRevision: null });
  return definition;
}

function world() {
  const organizations = new SqliteOrganizationStore(":memory:");
  const store = new SqliteInstitutionStore(":memory:");
  let counter = 0;
  const service: InstitutionService = makeInstitutionService({
    store,
    organizations,
    allocateTransitionId: () => `t-${++counter}`,
  });
  return { organizations, store, service };
}

function deepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(deepFrozen);
}

describe("F4-M01/M02/M03/M05/M15: institution firewalls", () => {
  it("the institution module imports no Organization object, continuity, runtime, or effect concern", () => {
    for (const file of ["artifacts.ts", "store.ts", "service.ts"]) {
      const code = strip(SRC(file));
      expect(code).not.toMatch(/persistentpoint|continuity/i);
      expect(code).not.toMatch(/runtime|activation|sessionref/i);
      expect(code).not.toMatch(/ordarium|effects\//i);
      expect(code).not.toMatch(/scheduler|workgraph/i);
    }
  });

  it("institution identity is a distinct namespace from organization identity", async () => {
    const w = world();
    const o1 = await org(w.organizations, "org-1", ["alpha", "beta"]);
    const { charter, epoch } = await w.service.genesis({
      institutionId: "inst-1",
      purpose: "endure",
      authorities: [A, B],
      requiredApprovals: 2,
      organization: organizationRefOf(o1),
    });
    expect(charter.institutionId).toBe("inst-1");
    expect(epoch.institutionId).toBe("inst-1");
    expect(epoch.organization.organizationDefinitionId).toBe("org-1");
    expect(charter).not.toHaveProperty("organizationDefinitionId");
    expect(deepFrozen(charter)).toBe(true);
    expect(deepFrozen(epoch)).toBe(true);
  });
});

describe("F4-M04: continuation authority is explicit", () => {
  it("charter authority does not derive from organization roles", async () => {
    const w = world();
    const o1 = await org(w.organizations, "org-1", ["alpha"]);
    // The org has a "manager" role for alpha; the charter authorities are
    // explicit and unrelated to it.
    const { charter } = await w.service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [B, C],
      requiredApprovals: 1,
      organization: organizationRefOf(o1),
    });
    expect(charter.continuationAuthority.authorities.map((authority) => authority.peerId)).toEqual(["peer-b", "peer-c"]);
    expect(() =>
      materializeInstitutionCharter({
        institutionId: "inst-1",
        revision: 0,
        purpose: "p",
        continuationAuthority: { authorities: [], requiredApprovals: 1 },
      }),
    ).toThrow();
  });
});

describe("F4-M06/M07: current authority controls its own successor (§111)", () => {
  it("a new authority set cannot authorize itself into existence", async () => {
    const w = world();
    const o1 = await org(w.organizations, "org-1", ["alpha"]);
    await w.service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [A, B],
      requiredApprovals: 2,
      organization: organizationRefOf(o1),
    });
    const proposal = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o1),
      reason: "replace authority",
      amendment: { authorities: [C, D], requiredApprovals: 1 },
    });
    // Only the NEW authorities approve.
    await w.service.approve({ transitionId: proposal.transitionId, peer: C });
    await w.service.approve({ transitionId: proposal.transitionId, peer: D });
    await expect(w.service.advance({ transitionId: proposal.transitionId })).rejects.toMatchObject({
      kind: "approval_threshold_not_met",
    });
    // The CURRENT authorities approve — now it advances.
    await w.service.approve({ transitionId: proposal.transitionId, peer: A });
    await w.service.approve({ transitionId: proposal.transitionId, peer: B });
    const epoch = await w.service.advance({ transitionId: proposal.transitionId });
    expect(epoch.epoch).toBe(1);
    expect(epoch.charter.revision).toBe(1);
    expect((await w.store.currentCharter("inst-1"))?.continuationAuthority.authorities.map((a) => a.peerId)).toEqual([
      "peer-c",
      "peer-d",
    ]);
  });
});

describe("F4-M08/M09: threshold determinism and duplicate approvals", () => {
  it("requires exactly the configured number of unique authority approvals", async () => {
    const w = world();
    const o1 = await org(w.organizations, "org-1", ["alpha"]);
    await w.service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [A, B, C],
      requiredApprovals: 2,
      organization: organizationRefOf(o1),
    });
    const proposal = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o1),
      reason: "advance",
    });
    await w.service.approve({ transitionId: proposal.transitionId, peer: A });
    await expect(w.service.advance({ transitionId: proposal.transitionId })).rejects.toMatchObject({
      kind: "approval_threshold_not_met",
    });
    // A duplicate approval does not count twice.
    await w.service.approve({ transitionId: proposal.transitionId, peer: A });
    await expect(w.service.advance({ transitionId: proposal.transitionId })).rejects.toMatchObject({
      kind: "approval_threshold_not_met",
    });
    await w.service.approve({ transitionId: proposal.transitionId, peer: B });
    const epoch = await w.service.advance({ transitionId: proposal.transitionId });
    expect(epoch.epoch).toBe(1);
    expect(await w.store.approvals(proposal.transitionId)).toHaveLength(2);
  });

  it("a non-authority approval is recorded but never counted", async () => {
    const w = world();
    const o1 = await org(w.organizations, "org-1", ["alpha"]);
    await w.service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [A],
      requiredApprovals: 1,
      organization: organizationRefOf(o1),
    });
    const proposal = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o1),
      reason: "advance",
    });
    await w.service.approve({ transitionId: proposal.transitionId, peer: D });
    await expect(w.service.advance({ transitionId: proposal.transitionId })).rejects.toMatchObject({
      kind: "approval_threshold_not_met",
    });
  });

  it("remote approval without authentication is refused", async () => {
    const w = world();
    const o1 = await org(w.organizations, "org-1", ["alpha"]);
    await w.service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [A],
      requiredApprovals: 1,
      organization: organizationRefOf(o1),
    });
    const proposal = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o1),
      reason: "advance",
    });
    await expect(
      w.service.approveRemote({ transitionId: proposal.transitionId, authenticatedPeer: null }),
    ).rejects.toBeInstanceOf(InstitutionStoreError);
  });
});

describe("F4-M10/M11: stale approvals and atomic advancement", () => {
  it("an approval bound to an old base epoch cannot authorize; a failed advance writes nothing", async () => {
    const w = world();
    const o1 = await org(w.organizations, "org-1", ["alpha"]);
    await w.service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [A, B],
      requiredApprovals: 2,
      organization: organizationRefOf(o1),
    });
    const first = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o1),
      reason: "first",
    });
    const second = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o1),
      reason: "second",
    });
    await w.service.approve({ transitionId: first.transitionId, peer: A });
    await w.service.approve({ transitionId: first.transitionId, peer: B });
    expect((await w.service.advance({ transitionId: first.transitionId })).epoch).toBe(1);

    // second was proposed against epoch 0 — now stale.
    await w.service.approve({ transitionId: second.transitionId, peer: A });
    await w.service.approve({ transitionId: second.transitionId, peer: B });
    await expect(w.service.advance({ transitionId: second.transitionId })).rejects.toMatchObject({
      kind: "stale_base_epoch",
    });
    expect((await w.store.epochs("inst-1")).map((epoch) => epoch.epoch)).toEqual([0, 1]);
    expect((await w.store.head("inst-1"))?.epoch).toBe(1);
  });
});

describe("F4-M12: charter immutable/versioned", () => {
  it("a charter revision is append-only and content tampering is refused", async () => {
    const w = world();
    const o1 = await org(w.organizations, "org-1", ["alpha"]);
    const { charter } = await w.service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [A],
      requiredApprovals: 1,
      organization: organizationRefOf(o1),
    });
    // No-op transition (charter unchanged at revision 0).
    const noop = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o1),
      reason: "no-op",
    });
    await w.service.approve({ transitionId: noop.transitionId, peer: A });
    // Same revision, different content → fail closed.
    const tainted = materializeInstitutionCharter({
      institutionId: "inst-1",
      revision: 0,
      purpose: "tampered",
      continuationAuthority: { authorities: [A], requiredApprovals: 1 },
    });
    await expect(
      w.store.commitTransition({ proposal: noop, proposedCharter: tainted, expectedHeadEpoch: 0 }),
    ).rejects.toMatchObject({ kind: "charter_conflict" });
    // The real advance still works and the original charter is untouched.
    expect((await w.service.advance({ transitionId: noop.transitionId })).epoch).toBe(1);
    expect(await w.store.charter({ institutionId: "inst-1", revision: 0, digest: charter.digest })).toEqual(charter);

    // An amendment creates a NEW revision; the old one is immutable history.
    const amended = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o1),
      reason: "amend",
      amendment: { purpose: "p2" },
    });
    expect((await w.store.currentCharter("inst-1"))?.revision).toBe(0);
    await w.service.approve({ transitionId: amended.transitionId, peer: A });
    expect((await w.service.advance({ transitionId: amended.transitionId })).charter.revision).toBe(1);
    expect((await w.store.currentCharter("inst-1"))?.revision).toBe(1);
    expect((await w.store.charters("inst-1")).map((entry) => entry.revision)).toEqual([0, 1]);
    expect(await w.store.charter({ institutionId: "inst-1", revision: 0, digest: charter.digest })).toEqual(charter);
  });
});

describe("F4-M13/M14: institution identity survives body and member replacement", () => {
  it("E0 O@1 {alpha,beta} → E1 O@2 {gamma,delta} preserves InstitutionId (different org id)", async () => {
    const w = world();
    const o1 = await org(w.organizations, "org-1", ["alpha", "beta"]);
    const o2 = await org(w.organizations, "org-2", ["gamma", "delta"]);
    await w.service.genesis({
      institutionId: "inst-1",
      purpose: "endure",
      authorities: [A, B],
      requiredApprovals: 2,
      organization: organizationRefOf(o1),
    });
    const proposal = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o2),
      reason: "total replacement",
    });
    await w.service.approve({ transitionId: proposal.transitionId, peer: A });
    await w.service.approve({ transitionId: proposal.transitionId, peer: B });
    const epoch = await w.service.advance({ transitionId: proposal.transitionId });
    expect(epoch.institutionId).toBe("inst-1");
    expect(epoch.organization.organizationDefinitionId).toBe("org-2");
    expect(epoch.predecessor?.epoch).toBe(0);
    const epochs = await w.store.epochs("inst-1");
    expect(epochs.map((entry) => entry.institutionId)).toEqual(["inst-1", "inst-1"]);
    expect(epochs.map((entry) => entry.organization.organizationDefinitionId)).toEqual(["org-1", "org-2"]);
  });
});

describe("F4-M15: zero runtime does not terminate the institution", () => {
  it("the epoch chain is fully readable with no runtime object anywhere", async () => {
    const w = world();
    const o1 = await org(w.organizations, "org-1", ["alpha"]);
    await w.service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [A],
      requiredApprovals: 1,
      organization: organizationRefOf(o1),
    });
    const head = await w.store.head("inst-1");
    expect(head?.epoch).toBe(0);
    expect(await w.store.currentEpoch("inst-1")).toBeDefined();
    // No runtime/activation/session is involved anywhere in this test.
  });
});

describe("F4 store: persistence and replay", () => {
  it("a reopened institution store reproduces charters, epochs, proposals, approvals and head", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "palimpsest-f4-")), "institution.sqlite");
    const orgPath = join(mkdtempSync(join(tmpdir(), "palimpsest-f4-org-")), "organization.sqlite");
    const organizations = new SqliteOrganizationStore(orgPath);
    const store = new SqliteInstitutionStore(path);
    let counter = 0;
    const service = makeInstitutionService({ store, organizations, allocateTransitionId: () => `t-${++counter}` });
    const o1 = await org(organizations, "org-1", ["alpha"]);
    await service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [A],
      requiredApprovals: 1,
      organization: organizationRefOf(o1),
    });
    const proposal = await service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o1),
      reason: "r",
    });
    await service.approve({ transitionId: proposal.transitionId, peer: A });
    await service.advance({ transitionId: proposal.transitionId });
    store.close();

    const reopened = new SqliteInstitutionStore(path);
    expect((await reopened.head("inst-1"))?.epoch).toBe(1);
    expect((await reopened.epochs("inst-1"))).toHaveLength(2);
    expect((await reopened.charters("inst-1"))).toHaveLength(1);
    expect((await reopened.proposals("inst-1"))).toHaveLength(1);
    expect((await reopened.approvals(proposal.transitionId))).toHaveLength(1);
    reopened.close();
    organizations.close();
  });
});
