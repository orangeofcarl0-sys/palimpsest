/**
 * G10-F5 AGT × PAG integration machine proofs (§160–§164, §170–§173).
 *
 *   F5-E2E   collaboration → coalition → organization → institution → governed evolution
 *   F5-SPLIT organization split under an institution does not fork the institution
 *   F5-MERGE organization merge under an institution does not merge institutions
 *   F5-MEM   3-epoch member replacement preserves InstitutionId
 *   F5-OVER  coalition + organization overlap
 *   F5-C     governance cannot satisfy unresolved obligations; no anti-patterns
 *   F5-COMPAT backward compatibility + additive install surface
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SqliteOrganizationStore,
  evaluateOrganizationTransformation,
  materializeOrganizationDefinition,
  organizationMemberKey,
  organizationRefOf,
} from "../src/organization/index.js";
import type { OrganizationDefinition, OrganizationMemberRef } from "../src/organization/index.js";
import {
  InstitutionStoreError,
  SqliteInstitutionStore,
  activateAndGovernOrganizationChange,
  institutionBodyView,
  makeInstitutionService,
} from "../src/institution/index.js";
import type { InstitutionService } from "../src/institution/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import {
  deriveCoalitionSnapshot,
  makeCommitmentService,
  materializeCoalitionSnapshot,
  materializePeerRef,
} from "../src/federation/index.js";
import { installPalimpsest } from "../src/install.js";
import { FakeGitPort } from "../src/effects/index.js";
import { MockHost } from "./helpers.js";

const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const PA = materializePeerRef({ peerId: "peer-a" });
const PB = materializePeerRef({ peerId: "peer-b" });
const PC = materializePeerRef({ peerId: "peer-c" });
const PD = materializePeerRef({ peerId: "peer-d" });
const PE = materializePeerRef({ peerId: "peer-e" });
const PF = materializePeerRef({ peerId: "peer-f" });

const peer = (p: typeof PA): OrganizationMemberRef => ({ kind: "peer", peer: p });

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

const ROLES = [
  { roleId: "researcher", requiredCapabilities: [] },
  { roleId: "reviewer", requiredCapabilities: [] },
];
const INTERACTIONS = [{ interactionId: "i1", fromRoleId: "researcher", toRoleId: "reviewer", protocol: "review" }];

function orgWith(id: string, revision: number, members: readonly typeof PA[]): OrganizationDefinition {
  return materializeOrganizationDefinition({
    organizationDefinitionId: id,
    revision,
    mission: `${id} mission`,
    members: members.map(peer),
    roles: ROLES,
    assignments: members.map((member) => ({ member: peer(member), roleId: "researcher" })),
    interactions: INTERACTIONS,
  });
}

async function seedOrg(store: SqliteOrganizationStore, definition: OrganizationDefinition): Promise<void> {
  await store.registerRevision({ definition, parent: null, expectedHeadRevision: null });
}

describe("F5-E2E: collaboration → coalition → organization → institution → governed evolution (§160)", () => {
  it("the full bottom-up path is explicit at every arrow and institution identity survives member replacement", async () => {
    // 1. Real collaboration.
    const coordination = new SqliteCoordinationStore(":memory:");
    let c = 0;
    const commitments = makeCommitmentService({
      store: coordination,
      localPeer: PA,
      allocateCommitmentId: () => `c-${++c}`,
      allocateHandoffId: () => `h-${c}`,
    });
    const offer = await commitments.offerCommitment({
      proposedHolder: PB,
      scope: { kind: "contact_need", contactNeedId: "need-1" },
      statement: "collaborate",
    });
    await commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: PB });

    // 2. Coalition snapshot (derived, temporary).
    const coalition = await deriveCoalitionSnapshot(coordination, { kind: "contact_need", contactNeedId: "need-1" });
    expect(coalition.members.map((member) => member.peerId)).toEqual(["peer-b"]);

    // 3. K1 alone creates NO organization.
    const w = world();
    expect(await w.organizations.listRevisions("org-1")).toHaveLength(0);

    // 4. Explicit authoring creates O@1 (coalition cited as provenance).
    const o1 = orgWith("org-1", 0, [PA, PB]);
    await seedOrg(w.organizations, o1);
    expect(await w.organizations.listRevisions("org-1")).toHaveLength(1);

    // 5. Explicit institution genesis with charter C@1 + body O@1.
    await w.service.genesis({
      institutionId: "inst-1",
      purpose: "endure the research mission",
      authorities: [PA, PB],
      requiredApprovals: 2,
      organization: organizationRefOf(o1),
    });

    // 6. A transformation proposal: replace every member (REVISE → O@2).
    const o2 = orgWith("org-1", 1, [PC, PD]);
    const assessment = await evaluateOrganizationTransformation(
      { kind: "REVISE", base: organizationRefOf(o1), candidate: o2 },
      { bases: [o1] },
    );
    expect(assessment.status).toBe("admissible");

    // 7. A blocked transformation can NEVER be adopted through governance.
    const blocked = await evaluateOrganizationTransformation(
      {
        kind: "SPLIT",
        base: organizationRefOf(o1),
        left: { organizationDefinitionId: "org-l", revision: 0, mission: "l" },
        right: { organizationDefinitionId: "org-r", revision: 0, mission: "r" },
        memberPlacements: [{ member: peer(PA), placement: "left" }],
        rolePlacements: [],
        normPlacements: [],
        overlapDeclared: false,
      },
      { bases: [o1] },
    );
    expect(blocked.status).toBe("blocked");
    await expect(
      activateAndGovernOrganizationChange({
        organizationStore: w.organizations,
        institutionService: w.service,
        institutionId: "inst-1",
        assessment: blocked,
        reason: "must not happen",
      }),
    ).rejects.toBeInstanceOf(InstitutionStoreError);

    // 8. Admissible → activate the organization revision, then propose governance.
    const governed = await activateAndGovernOrganizationChange({
      organizationStore: w.organizations,
      institutionService: w.service,
      institutionId: "inst-1",
      assessment,
      reason: "replace members",
    });
    expect(governed.activatedOrganizations.map((ref) => ref.revision)).toEqual([1]);

    // 9. Current-charter authorities approve.
    await w.service.approve({ transitionId: governed.transition.transitionId, peer: PA });
    await w.service.approve({ transitionId: governed.transition.transitionId, peer: PB });

    // 10. Authorized epoch advancement.
    const e1 = await w.service.advance({ transitionId: governed.transition.transitionId });
    expect(e1.epoch).toBe(1);
    expect(e1.institutionId).toBe("inst-1");
    expect(e1.organization).toEqual(organizationRefOf(o2));

    // 11. The institution body is the new organization; identity unchanged.
    const body = await institutionBodyView(w.store, w.organizations, "inst-1");
    expect(body.organization.members.map(organizationMemberKey).sort()).toEqual(["peer:peer-c", "peer:peer-d"]);
    expect(body.charter.purpose).toBe("endure the research mission");

    // 12. Deterministic replay: the epoch chain is stable.
    expect((await w.store.epochs("inst-1")).map((epoch) => epoch.epoch)).toEqual([0, 1]);
    expect((await w.store.charter({ institutionId: "inst-1", revision: 0, digest: body.epoch.charter.digest }))).toBeDefined();
  });
});

describe("F5-SPLIT: split under an institution does not fork the institution (§146/§161)", () => {
  it("the institution adopts one body; the other is standalone", async () => {
    const w = world();
    const base = materializeOrganizationDefinition({
      organizationDefinitionId: "org-s",
      revision: 0,
      mission: "s",
      members: [peer(PA), peer(PB)],
      roles: ROLES,
      assignments: [
        { member: peer(PA), roleId: "researcher" },
        { member: peer(PB), roleId: "reviewer" },
      ],
      interactions: INTERACTIONS,
    });
    await seedOrg(w.organizations, base);
    await w.service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [PA, PB],
      requiredApprovals: 2,
      organization: organizationRefOf(base),
    });
    const split = await evaluateOrganizationTransformation(
      {
        kind: "SPLIT",
        base: organizationRefOf(base),
        left: { organizationDefinitionId: "org-sl", revision: 0, mission: "left" },
        right: { organizationDefinitionId: "org-sr", revision: 0, mission: "right" },
        memberPlacements: [
          { member: peer(PA), placement: "left" },
          { member: peer(PB), placement: "right" },
        ],
        rolePlacements: [
          { roleId: "researcher", placement: "left" },
          { roleId: "reviewer", placement: "right" },
        ],
        normPlacements: [],
        overlapDeclared: false,
      },
      { bases: [base] },
    );
    expect(split.status).toBe("admissible");
    expect(split.boundaryPorts).toHaveLength(2);

    const governed = await activateAndGovernOrganizationChange({
      organizationStore: w.organizations,
      institutionService: w.service,
      institutionId: "inst-1",
      assessment: split,
      adopt: 0,
      reason: "adopt left body",
    });
    await w.service.approve({ transitionId: governed.transition.transitionId, peer: PA });
    await w.service.approve({ transitionId: governed.transition.transitionId, peer: PB });
    const epoch = await w.service.advance({ transitionId: governed.transition.transitionId });
    expect(epoch.organization.organizationDefinitionId).toBe("org-sl");

    // Both successors exist as organizations; the institution did NOT fork.
    expect(await w.organizations.listRevisions("org-sl")).toHaveLength(1);
    expect(await w.organizations.listRevisions("org-sr")).toHaveLength(1);
    expect((await w.store.epochs("inst-1"))).toHaveLength(2);
    expect(await w.store.head("inst-2")).toBeUndefined();
  });
});

describe("F5-MERGE: merge under an institution does not merge institutions (§147/§162)", () => {
  it("an explicit merge candidate is adopted; institution lineage is untouched", async () => {
    const w = world();
    const one = materializeOrganizationDefinition({
      organizationDefinitionId: "org-one",
      revision: 0,
      mission: "one",
      members: [peer(PA)],
      roles: [{ roleId: "reviewer", requiredCapabilities: [] }],
      assignments: [{ member: peer(PA), roleId: "reviewer" }],
    });
    const two = materializeOrganizationDefinition({
      organizationDefinitionId: "org-two",
      revision: 0,
      mission: "two",
      members: [peer(PB)],
      roles: [{ roleId: "reviewer", requiredCapabilities: [] }],
      assignments: [{ member: peer(PB), roleId: "reviewer" }],
    });
    await seedOrg(w.organizations, one);
    await seedOrg(w.organizations, two);
    await w.service.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [PA],
      requiredApprovals: 1,
      organization: organizationRefOf(one),
    });
    const merge = await evaluateOrganizationTransformation(
      {
        kind: "MERGE",
        sources: [organizationRefOf(one), organizationRefOf(two)],
        target: { organizationDefinitionId: "org-merged", revision: 0, mission: "merged" },
        roleResolutions: [
          { sourceOrganizationDefinitionId: "org-one", roleId: "reviewer", decision: "same_role" },
          { sourceOrganizationDefinitionId: "org-two", roleId: "reviewer", decision: "same_role" },
        ],
      },
      { bases: [one, two] },
    );
    expect(merge.status).toBe("admissible");
    const governed = await activateAndGovernOrganizationChange({
      organizationStore: w.organizations,
      institutionService: w.service,
      institutionId: "inst-1",
      assessment: merge,
      reason: "adopt merged body",
    });
    await w.service.approve({ transitionId: governed.transition.transitionId, peer: PA });
    const epoch = await w.service.advance({ transitionId: governed.transition.transitionId });
    expect(epoch.organization.organizationDefinitionId).toBe("org-merged");
    // Sources remain historical; no institution was merged.
    expect(await w.organizations.listRevisions("org-one")).toHaveLength(1);
    expect(await w.organizations.listRevisions("org-two")).toHaveLength(1);
    expect((await w.store.epochs("inst-1"))).toHaveLength(2);
  });
});

describe("F5-MEM: 3-epoch member replacement preserves InstitutionId (§148/§163)", () => {
  it("E0/E1/E2 change the body and members while the institution id is constant", async () => {
    const w = world();
    const o1 = orgWith("org-1", 0, [PA, PB]);
    const o2 = orgWith("org-2", 0, [PC, PD]);
    const o3 = orgWith("org-3", 0, [PE, PF]);
    await seedOrg(w.organizations, o1);
    await seedOrg(w.organizations, o2);
    await seedOrg(w.organizations, o3);
    await w.service.genesis({
      institutionId: "inst-1",
      purpose: "persist",
      authorities: [PA, PB],
      requiredApprovals: 2,
      organization: organizationRefOf(o1),
    });
    for (const target of [o2, o3]) {
      const proposal = await w.service.proposeTransition({
        institutionId: "inst-1",
        proposedOrganization: organizationRefOf(target),
        reason: "replace body",
      });
      await w.service.approve({ transitionId: proposal.transitionId, peer: PA });
      await w.service.approve({ transitionId: proposal.transitionId, peer: PB });
      await w.service.advance({ transitionId: proposal.transitionId });
    }
    const epochs = await w.store.epochs("inst-1");
    expect(epochs.map((epoch) => epoch.institutionId)).toEqual(["inst-1", "inst-1", "inst-1"]);
    expect(epochs.map((epoch) => epoch.organization.organizationDefinitionId)).toEqual(["org-1", "org-2", "org-3"]);
  });
});

describe("F5-OVER: coalition and organization overlap (§164)", () => {
  it("the same peer is in two coalitions and two organizations", async () => {
    const k1 = materializeCoalitionSnapshot({
      scope: { kind: "contact_need", contactNeedId: "need-1" },
      basis: { throughSeq: 1, digest: "a".repeat(64) },
      members: [PA],
      sourceCommitments: ["c-1"],
      sourceParticipations: [],
    });
    const k2 = materializeCoalitionSnapshot({
      scope: { kind: "contact_need", contactNeedId: "need-2" },
      basis: { throughSeq: 2, digest: "b".repeat(64) },
      members: [PA],
      sourceCommitments: ["c-2"],
      sourceParticipations: [],
    });
    const w = world();
    const o1 = orgWith("org-1", 0, [PA]);
    const o2 = orgWith("org-2", 0, [PA]);
    await seedOrg(w.organizations, o1);
    await seedOrg(w.organizations, o2);
    expect(k1.members[0]!.peerId).toBe("peer-a");
    expect(k2.members[0]!.peerId).toBe("peer-a");
    expect(o1.members.map(organizationMemberKey)).toEqual(["peer:peer-a"]);
    expect(o2.members.map(organizationMemberKey)).toEqual(["peer:peer-a"]);
    expect(o1.members[0]).not.toHaveProperty("groupId");
    expect(PA).not.toHaveProperty("organizationId");
  });
});

describe("F5-C: campaign-wide anti-patterns absent (§170–§173)", () => {
  it("no generic groupId/group_id collapse, no scheduler awareness, no cross-concern imports", () => {
    const files = [
      "src/organization/definition.ts",
      "src/organization/store.ts",
      "src/organization/transformation.ts",
      "src/institution/artifacts.ts",
      "src/institution/store.ts",
      "src/institution/service.ts",
      "src/institution/governed.ts",
    ];
    for (const file of files) {
      const code = strip(readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf-8"));
      expect(code).not.toMatch(/group_id|\bgroupId\b/);
      expect(code).not.toMatch(/coordination\//);
      expect(code).not.toMatch(/scheduler/i);
    }
    const scheduler = strip(readFileSync(fileURLToPath(new URL("../src/scheduler/scheduler.ts", import.meta.url)), "utf-8"));
    expect(scheduler).not.toMatch(/organization|institution/i);
  });
});

describe("F5-COMPAT: additive install surface (§153/§154)", () => {
  function options(extra: Record<string, unknown>) {
    return {
      projectId: "p",
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-f5-")), "state.sqlite"),
      ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-f5-ops-")), "ops.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
      clock: () => "2026-08-13T00:00:00Z",
      ...extra,
    };
  }

  it("no organization/institution wiring keeps them absent; supplying stores exposes them additively", () => {
    const bare = installPalimpsest(new MockHost() as never, options({}));
    expect(bare.organization).toBeUndefined();
    expect(bare.institution).toBeUndefined();

    const orgOnly = new SqliteOrganizationStore(":memory:");
    const withOrg = installPalimpsest(new MockHost() as never, options({ organizationStore: orgOnly }));
    expect(withOrg.organization?.store).toBe(orgOnly);
    expect(withOrg.institution).toBeUndefined();

    const instStore = new SqliteInstitutionStore(":memory:");
    const withBoth = installPalimpsest(
      new MockHost() as never,
      options({ organizationStore: orgOnly, institutionStore: instStore }),
    );
    expect(withBoth.organization?.store).toBe(orgOnly);
    expect(withBoth.institution?.store).toBe(instStore);
    expect(typeof withBoth.institution?.service.genesis).toBe("function");
  });
});
