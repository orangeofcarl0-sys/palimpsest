/**
 * G10-F6 campaign-wide adversarial review (§166–§173).
 *
 *   F6-X01 store ownership is disjoint (§167)
 *   F6-X02 campaign-wide restart replay (§169)
 *   F6-X03 Work/runtime/federation non-regression firewalls (§178–§180)
 *   F6-X04 persistence orthogonality combinations (§181)
 *   F6-X05 authority matrix: no automatic implication (§171)
 *   F6-X06 anti-patterns absent (§173–§176)
 *   F6-X07 determinism across independent worlds (§169)
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { SqliteCoordinationStore } from "../src/coordination/index.js";
import { SqlitePersistentPointStore } from "../src/continuity/index.js";
import {
  SqliteOrganizationStore,
  materializeOrganizationDefinition,
  organizationRefOf,
} from "../src/organization/index.js";
import { SqliteInstitutionStore, makeInstitutionService } from "../src/institution/index.js";
import {
  deriveCoalitionSnapshot,
  makeCommitmentService,
  materializePeerRef,
} from "../src/federation/index.js";

const SRC = (path: string): string => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf-8");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const PA = materializePeerRef({ peerId: "peer-a" });
const PB = materializePeerRef({ peerId: "peer-b" });

function tmp(name: string): string {
  return join(mkdtempSync(join(tmpdir(), `palimpsest-f6-${name}-`)), "store.sqlite");
}

describe("F6-X01: store ownership is disjoint (§167)", () => {
  it("each canonical store owns only its own tables", () => {
    const coordination = strip(SRC("coordination/store.ts"));
    const continuity = strip(SRC("continuity/store.ts"));
    const organization = strip(SRC("organization/store.ts"));
    const institution = strip(SRC("institution/store.ts"));

    expect(coordination).toContain("coordination_events");
    expect(coordination).not.toMatch(/persistent_points|organization_revisions|institution_epochs/);

    expect(continuity).toContain("persistent_points");
    expect(continuity).not.toMatch(/coordination_events|organization_revisions|institution_epochs/);

    expect(organization).toContain("organization_revisions");
    expect(organization).not.toMatch(/coordination_events|persistent_points|institution_epochs/);

    expect(institution).toContain("institution_epochs");
    expect(institution).not.toMatch(/coordination_events|persistent_points|organization_revisions/);
  });
});

describe("F6-X02: campaign-wide restart replay (§169)", () => {
  it("coordination history, coalition snapshot, organization revisions, and institution chain all reproduce", async () => {
    const coordinationPath = tmp("coord");
    const organizationPath = tmp("org");
    const institutionPath = tmp("inst");

    const coordination = new SqliteCoordinationStore(coordinationPath);
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
    const coalitionBefore = await deriveCoalitionSnapshot(coordination, { kind: "contact_need", contactNeedId: "need-1" });
    coordination.close();

    const organizations = new SqliteOrganizationStore(organizationPath);
    const o1 = materializeOrganizationDefinition({
      organizationDefinitionId: "org-1",
      revision: 0,
      mission: "m",
      members: [
        { kind: "peer", peer: PA },
        { kind: "peer", peer: PB },
      ],
      roles: [{ roleId: "lead", requiredCapabilities: [] }],
      assignments: [{ member: { kind: "peer", peer: PA }, roleId: "lead" }],
    });
    await organizations.registerRevision({ definition: o1, parent: null, expectedHeadRevision: null });
    const institutionStore = new SqliteInstitutionStore(institutionPath);
    let t = 0;
    const service = makeInstitutionService({ store: institutionStore, organizations, allocateTransitionId: () => `t-${++t}` });
    await service.genesis({
      institutionId: "inst-1",
      purpose: "endure",
      authorities: [PA, PB],
      requiredApprovals: 2,
      organization: organizationRefOf(o1),
    });
    const proposal = await service.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o1),
      reason: "no-op",
    });
    await service.approve({ transitionId: proposal.transitionId, peer: PA });
    await service.approve({ transitionId: proposal.transitionId, peer: PB });
    await service.advance({ transitionId: proposal.transitionId });
    organizations.close();
    institutionStore.close();

    // Reopen everything from disk.
    const coordinationReopened = new SqliteCoordinationStore(coordinationPath);
    const coalitionAfter = await deriveCoalitionSnapshot(coordinationReopened, { kind: "contact_need", contactNeedId: "need-1" });
    expect(coalitionAfter).toEqual(coalitionBefore);

    const organizationsReopened = new SqliteOrganizationStore(organizationPath);
    expect((await organizationsReopened.head("org-1"))?.revision).toBe(0);
    const institutionReopened = new SqliteInstitutionStore(institutionPath);
    expect((await institutionReopened.head("inst-1"))?.epoch).toBe(1);
    expect((await institutionReopened.epochs("inst-1"))).toHaveLength(2);
    expect((await institutionReopened.charters("inst-1"))).toHaveLength(1);
    expect((await institutionReopened.approvals(proposal.transitionId))).toHaveLength(2);

    coordinationReopened.close();
    organizationsReopened.close();
    institutionReopened.close();
  });
});

describe("F6-X03: Work / runtime / federation non-regression firewalls (§178–§180)", () => {
  it("downstream concerns do not import organization/institution, and the root export stays clean", () => {
    for (const file of ["scheduler/scheduler.ts", "runtime/realize.ts", "federation/federation_service.ts", "coordination/store.ts"]) {
      const code = strip(SRC(file));
      expect(code).not.toMatch(/organization\/index|institution\/index|organization\.js|institution\.js/);
    }
    const root = SRC("index.ts");
    expect(root).not.toMatch(/organization|institution/);
    const advanced = SRC("advanced.ts");
    expect(advanced).toMatch(/organization\/index\.js/);
    expect(advanced).toMatch(/institution\/index\.js/);
  });

  it("a continuity store is independent of organization/institution state", async () => {
    const continuity = new SqlitePersistentPointStore(":memory:");
    expect(await continuity.list()).toEqual([]);
    // Organization and institution stores can exist with zero continuity points
    // and vice versa (persistence is orthogonal, §181).
    const organizations = new SqliteOrganizationStore(":memory:");
    expect(await organizations.listRevisions("org-x")).toEqual([]);
    continuity.close();
    organizations.close();
  });
});

describe("F6-X04: persistence orthogonality combinations (§181)", () => {
  it("coalition + no organization, organization + no institution are representable", async () => {
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
      statement: "s",
    });
    await commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: PB });
    const coalition = await deriveCoalitionSnapshot(coordination, { kind: "contact_need", contactNeedId: "need-1" });
    expect(coalition.members).toHaveLength(1);

    const organizations = new SqliteOrganizationStore(":memory:");
    const definition = materializeOrganizationDefinition({
      organizationDefinitionId: "org-1",
      revision: 0,
      mission: "m",
      members: [{ kind: "peer", peer: PA }],
      roles: [],
      assignments: [],
    });
    await organizations.registerRevision({ definition, parent: null, expectedHeadRevision: null });
    expect(await organizations.current("org-1")).toBeDefined();
    // No institution store exists — organization without institution.
    expect(await organizations.listRevisions("org-1")).toHaveLength(1);
    coordination.close();
    organizations.close();
  });
});

describe("F6-X05: authority matrix has no automatic implication (§171)", () => {
  it("organization and institution modules contain no effect/Ordarium mapping", () => {
    for (const file of [
      "organization/definition.ts",
      "organization/store.ts",
      "organization/eligibility.ts",
      "institution/artifacts.ts",
      "institution/store.ts",
      "institution/service.ts",
      "institution/governed.ts",
    ]) {
      const code = strip(SRC(file));
      expect(code).not.toMatch(/ordarium|effects\/|AuthorityGrant|grantAuthority/i);
    }
  });
});

describe("F6-X06: anti-patterns absent (§173–§176)", () => {
  it("no generic group id, no manager/hierarchy, no evidence auto-promotion", () => {
    for (const file of [
      "organization/definition.ts",
      "organization/store.ts",
      "organization/transformation.ts",
      "institution/artifacts.ts",
      "institution/store.ts",
    ]) {
      const code = strip(SRC(file));
      expect(code).not.toMatch(/group_id|\bgroupId\b/);
      expect(code).not.toMatch(/manager|leader|authorityRoot|hierarchy|subordinate/i);
      expect(code).not.toMatch(/evidenceId|admitEvidence|recordEvidence/);
    }
  });
});

describe("F6-X07: determinism across independent worlds (§169)", () => {
  it("two independent worlds produce identical institution epoch digests", async () => {
    async function run(): Promise<string> {
      const organizations = new SqliteOrganizationStore(":memory:");
      const store = new SqliteInstitutionStore(":memory:");
      let t = 0;
      const service = makeInstitutionService({ store, organizations, allocateTransitionId: () => `t-${++t}` });
      const o1 = materializeOrganizationDefinition({
        organizationDefinitionId: "org-1",
        revision: 0,
        mission: "m",
        members: [{ kind: "peer", peer: PA }],
        roles: [],
        assignments: [],
      });
      await organizations.registerRevision({ definition: o1, parent: null, expectedHeadRevision: null });
      await service.genesis({
        institutionId: "inst-1",
        purpose: "p",
        authorities: [PA],
        requiredApprovals: 1,
        organization: organizationRefOf(o1),
      });
      const proposal = await service.proposeTransition({
        institutionId: "inst-1",
        proposedOrganization: organizationRefOf(o1),
        reason: "r",
      });
      await service.approve({ transitionId: proposal.transitionId, peer: PA });
      const epoch = await service.advance({ transitionId: proposal.transitionId });
      const digest = epoch.digest;
      organizations.close();
      store.close();
      return digest;
    }
    expect(await run()).toBe(await run());
  });
});
