/**
 * G10-G0 F-governance closure machine proofs (§34).
 *
 *   G0-M01 competing Charter@N+1 candidates coexist
 *   G0-M02 unapproved charter candidate absent from the canonical list
 *   G0-M03 winning candidate becomes canonical only inside epoch commit
 *   G0-M04 stale losing proposal cannot commit
 *   G0-M05 caller cannot choose the local approving PeerRef
 *   G0-M06 remote unauthenticated approval refused
 *   G0-M07 new authority cannot self-authorize
 *   G0-M08 REVISE +2 blocked during assessment
 *   G0-M09 REVISE +1 admissible when otherwise valid
 *   G0-M10 store still rejects a stale head at activation
 */

import { describe, expect, it } from "vitest";

import {
  SqliteOrganizationStore,
  evaluateOrganizationTransformation,
  materializeOrganizationDefinition,
  organizationRefOf,
} from "../src/organization/index.js";
import type { OrganizationDefinition } from "../src/organization/index.js";
import {
  InstitutionStoreError,
  SqliteInstitutionStore,
  makeInstitutionService,
} from "../src/institution/index.js";
import type { InstitutionService } from "../src/institution/index.js";
import { materializePeerRef } from "../src/federation/index.js";

const A = materializePeerRef({ peerId: "peer-a" });
const B = materializePeerRef({ peerId: "peer-b" });
const C = materializePeerRef({ peerId: "peer-c" });
const D = materializePeerRef({ peerId: "peer-d" });

function world(localGovernancePeer = A) {
  const organizations = new SqliteOrganizationStore(":memory:");
  const store = new SqliteInstitutionStore(":memory:");
  let counter = 0;
  const service: InstitutionService = makeInstitutionService({
    store,
    organizations,
    allocateTransitionId: () => `t-${++counter}`,
    localGovernancePeer,
  });
  return { organizations, store, service };
}

async function seedOrg(store: SqliteOrganizationStore, id: string): Promise<OrganizationDefinition> {
  const definition = materializeOrganizationDefinition({
    organizationDefinitionId: id,
    revision: 0,
    mission: `${id} mission`,
    members: [{ kind: "peer", peer: A }],
    roles: [],
    assignments: [],
  });
  await store.registerRevision({ definition, parent: null, expectedHeadRevision: null });
  return definition;
}

async function genesisFor(w: ReturnType<typeof world>, authorities = [A, B], requiredApprovals = 2) {
  const organization = await seedOrg(w.organizations, "org-1");
  await w.service.genesis({
    institutionId: "inst-1",
    purpose: "endure",
    authorities,
    requiredApprovals,
    organization: organizationRefOf(organization),
  });
  return organization;
}

describe("G0-M01/M02/M03/M04: charter candidate isolation (§23–§26)", () => {
  it("competing candidates coexist, stay non-canonical, and only the winner commits", async () => {
    const w = world();
    const organization = await genesisFor(w);

    const p1 = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(organization),
      reason: "candidate A",
      amendment: { purpose: "purpose A" },
    });
    const p2 = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(organization),
      reason: "candidate B",
      amendment: { purpose: "purpose B" },
    });

    // G0-M02: neither candidate occupies the canonical revision slot.
    expect((await w.store.charters("inst-1")).map((charter) => charter.revision)).toEqual([0]);
    // G0-M01: both candidates exist in the non-canonical pool with the SAME revision.
    const candidateA = await w.store.charterCandidate(p1.proposedCharter);
    const candidateB = await w.store.charterCandidate(p2.proposedCharter);
    expect(candidateA?.purpose).toBe("purpose A");
    expect(candidateB?.purpose).toBe("purpose B");
    expect(candidateA?.revision).toBe(1);
    expect(candidateB?.revision).toBe(1);
    expect(candidateA?.digest).not.toBe(candidateB?.digest);

    // G0-M03: the winner becomes canonical only inside the epoch commit.
    await w.service.approveRemote({ transitionId: p1.transitionId, authenticatedPeer: A });
    await w.service.approveRemote({ transitionId: p1.transitionId, authenticatedPeer: B });
    const winning = await w.service.advance({ transitionId: p1.transitionId });
    expect(winning.charter.revision).toBe(1);
    expect((await w.store.charters("inst-1")).map((charter) => charter.revision)).toEqual([0, 1]);
    expect((await w.store.currentCharter("inst-1"))?.purpose).toBe("purpose A");

    // G0-M04: the losing proposal cannot commit against the advanced head.
    await w.service.approveRemote({ transitionId: p2.transitionId, authenticatedPeer: A });
    await w.service.approveRemote({ transitionId: p2.transitionId, authenticatedPeer: B });
    await expect(w.service.advance({ transitionId: p2.transitionId })).rejects.toMatchObject({
      kind: "stale_base_epoch",
    });
    expect((await w.store.charters("inst-1")).map((charter) => charter.revision)).toEqual([0, 1]);
    expect((await w.store.charters("inst-1"))[1]!.purpose).toBe("purpose A");
  });
});

describe("G0-M05/M06: institution approval actor grounding (§27–§30)", () => {
  it("local approval uses the configured identity; no caller-chosen local peer exists", async () => {
    const w = world(A);
    const organization = await genesisFor(w);
    const proposal = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(organization),
      reason: "r",
    });
    expect((w.service as unknown as { approve?: unknown }).approve).toBeUndefined();
    await w.service.approveLocal({ transitionId: proposal.transitionId });
    expect((await w.store.approvals(proposal.transitionId)).map((approval) => approval.approvingPeer.peerId)).toEqual([
      "peer-a",
    ]);
  });

  it("a service without a configured local governance identity cannot approve locally", async () => {
    const organizations = new SqliteOrganizationStore(":memory:");
    const store = new SqliteInstitutionStore(":memory:");
    let counter = 0;
    const service = makeInstitutionService({
      store,
      organizations,
      allocateTransitionId: () => `t-${++counter}`,
    });
    const organization = await seedOrg(organizations, "org-1");
    await service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [A],
      requiredApprovals: 1,
      organization: organizationRefOf(organization),
    });
    const proposal = await service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(organization),
      reason: "r",
    });
    await expect(service.approveLocal({ transitionId: proposal.transitionId })).rejects.toBeInstanceOf(
      InstitutionStoreError,
    );
    organizations.close();
    store.close();
  });

  it("remote approval without an authenticated peer is refused", async () => {
    const w = world();
    const organization = await genesisFor(w);
    const proposal = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(organization),
      reason: "r",
    });
    await expect(
      w.service.approveRemote({ transitionId: proposal.transitionId, authenticatedPeer: null }),
    ).rejects.toBeInstanceOf(InstitutionStoreError);
  });
});

describe("G0-M07: new authority cannot self-authorize (§31)", () => {
  it("only current-charter authorities can install a successor authority set", async () => {
    const w = world();
    const organization = await genesisFor(w);
    const proposal = await w.service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(organization),
      reason: "replace authority",
      amendment: { authorities: [C, D], requiredApprovals: 1 },
    });
    await w.service.approveRemote({ transitionId: proposal.transitionId, authenticatedPeer: C });
    await w.service.approveRemote({ transitionId: proposal.transitionId, authenticatedPeer: D });
    await expect(w.service.advance({ transitionId: proposal.transitionId })).rejects.toMatchObject({
      kind: "approval_threshold_not_met",
    });
    await w.service.approveRemote({ transitionId: proposal.transitionId, authenticatedPeer: A });
    await w.service.approveRemote({ transitionId: proposal.transitionId, authenticatedPeer: B });
    const epoch = await w.service.advance({ transitionId: proposal.transitionId });
    expect(epoch.charter.revision).toBe(1);
    expect((await w.store.currentCharter("inst-1"))?.continuationAuthority.authorities.map((p) => p.peerId)).toEqual([
      "peer-c",
      "peer-d",
    ]);
  });
});

describe("G0-M08/M09/M10: REVISE assessment/store coherence (§32–§33)", () => {
  const base = (): OrganizationDefinition =>
    materializeOrganizationDefinition({
      organizationDefinitionId: "org-1",
      revision: 0,
      mission: "m",
      members: [{ kind: "peer", peer: A }],
      roles: [],
      assignments: [],
    });

  it("REVISE +2 is blocked at assessment; REVISE +1 is admissible", async () => {
    const b = base();
    const plusTwo = materializeOrganizationDefinition({
      organizationDefinitionId: "org-1",
      revision: 2,
      mission: "m2",
      members: [{ kind: "peer", peer: A }],
      roles: [],
      assignments: [],
    });
    const blocked = await evaluateOrganizationTransformation(
      { kind: "REVISE", base: organizationRefOf(b), candidate: plusTwo },
      { bases: [b] },
    );
    expect(blocked.status).toBe("blocked");
    expect(blocked.obligations.map((entry) => entry.kind)).toContain("revision_does_not_advance");

    const plusOne = materializeOrganizationDefinition({
      organizationDefinitionId: "org-1",
      revision: 1,
      mission: "m1",
      members: [{ kind: "peer", peer: A }],
      roles: [],
      assignments: [],
    });
    const admissible = await evaluateOrganizationTransformation(
      { kind: "REVISE", base: organizationRefOf(b), candidate: plusOne },
      { bases: [b] },
    );
    expect(admissible.status).toBe("admissible");
  });

  it("the organization store still rejects a stale head at activation", async () => {
    const store = new SqliteOrganizationStore(":memory:");
    const b = base();
    await store.registerRevision({ definition: b, parent: null, expectedHeadRevision: null });
    const plusOne = materializeOrganizationDefinition({
      organizationDefinitionId: "org-1",
      revision: 1,
      mission: "m1",
      members: [{ kind: "peer", peer: A }],
      roles: [],
      assignments: [],
    });
    await expect(
      store.registerRevision({ definition: plusOne, parent: organizationRefOf(b), expectedHeadRevision: 5 }),
    ).rejects.toMatchObject({ kind: "head_mismatch" });
    store.close();
  });
});
