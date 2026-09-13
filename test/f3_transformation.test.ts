/**
 * G10-F3 typed Organization transformation machine proofs (§102).
 *
 *   F3-M01  proposal ≠ canonical revision (evaluation writes nothing)
 *   F3-M02  split partition alone insufficient
 *   F3-M03  cross-boundary interaction → synthesized interface ports
 *   F3-M04  every port traces to a source interaction
 *   F3-M05  no cross-boundary interaction omitted
 *   F3-M06  norm handling explicit
 *   F3-M07  role collisions explicit (merge)
 *   F3-M08  norm conflicts unresolved, not guessed
 *   F3-M09  interface report deterministic
 *   F3-M10  source definitions immutable
 *   F3-M11  split canonical activation atomic
 *   F3-M12  merge canonical activation
 *   F3-M13  evidence claim not auto-satisfied
 *   F3-M14  scheduler/runtime unchanged
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  OrganizationDefinitionError,
  SqliteOrganizationStore,
  activateOrganizationTransformation,
  evaluateOrganizationTransformation,
  materializeOrganizationDefinition,
  organizationMemberKey,
  organizationRefOf,
  planTransformationActivation,
} from "../src/organization/index.js";
import type {
  MergeProposal,
  OrganizationDefinition,
  SplitProposal,
  TransformationEvidencePort,
} from "../src/organization/index.js";
import { materializePeerRef } from "../src/federation/index.js";

const TRANSFORMATION_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/organization/transformation.ts", import.meta.url)),
  "utf-8",
);
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const peer = (peerId: string) => ({ kind: "peer" as const, peer: materializePeerRef({ peerId }) });

function baseOrg(): OrganizationDefinition {
  return materializeOrganizationDefinition({
    organizationDefinitionId: "org-base",
    revision: 0,
    mission: "base mission",
    members: [peer("alpha"), peer("beta")],
    roles: [
      { roleId: "A", requiredCapabilities: [] },
      { roleId: "B", requiredCapabilities: [] },
    ],
    assignments: [
      { member: peer("alpha"), roleId: "A" },
      { member: peer("beta"), roleId: "B" },
    ],
    norms: [
      { normId: "nA", kind: "obligation", roleId: "A", actionTag: "doA" },
      { normId: "nB", kind: "prohibition", roleId: "B", actionTag: "doB" },
    ],
    interactions: [{ interactionId: "i1", fromRoleId: "A", toRoleId: "B", protocol: "handoff" }],
  });
}

function splitProposal(base: OrganizationDefinition, overrides: Partial<SplitProposal> = {}): SplitProposal {
  return {
    kind: "SPLIT",
    base: organizationRefOf(base),
    left: { organizationDefinitionId: "org-L", revision: 0, mission: "left mission" },
    right: { organizationDefinitionId: "org-R", revision: 0, mission: "right mission" },
    memberPlacements: [
      { member: peer("alpha"), placement: "left" },
      { member: peer("beta"), placement: "right" },
    ],
    rolePlacements: [
      { roleId: "A", placement: "left" },
      { roleId: "B", placement: "right" },
    ],
    normPlacements: [
      { normId: "nA", placement: "left" },
      { normId: "nB", placement: "right" },
    ],
    overlapDeclared: false,
    ...overrides,
  };
}

describe("F3-M01: proposal ≠ canonical revision (§97)", () => {
  it("evaluation produces immutable candidates and writes nothing", async () => {
    const base = baseOrg();
    const store = new SqliteOrganizationStore(":memory:");
    const assessment = await evaluateOrganizationTransformation(splitProposal(base), { bases: [base] });
    expect(assessment.status).toBe("admissible");
    expect(assessment.candidates).toHaveLength(2);
    expect(Object.isFrozen(assessment.candidates)).toBe(true);
    expect(Object.isFrozen(assessment.candidates[0])).toBe(true);
    expect(await store.listRevisions("org-L")).toHaveLength(0);
    store.close();
  });
});

describe("F3-M02/M06: split partition alone is insufficient (§78/§81)", () => {
  it("omitting role/norm placements blocks the transformation", async () => {
    const base = baseOrg();
    const assessment = await evaluateOrganizationTransformation(
      { ...splitProposal(base), rolePlacements: [], normPlacements: [] },
      { bases: [base] },
    );
    expect(assessment.status).toBe("blocked");
    const kinds = assessment.obligations.filter((entry) => entry.status === "unresolved").map((entry) => entry.kind);
    expect(kinds).toContain("role_unclassified");
    expect(kinds).toContain("norm_unclassified");
  });

  it("an unplaced member blocks the split (no silent disappearance)", async () => {
    const base = baseOrg();
    const assessment = await evaluateOrganizationTransformation(
      { ...splitProposal(base), memberPlacements: [{ member: peer("alpha"), placement: "left" }] },
      { bases: [base] },
    );
    expect(assessment.status).toBe("blocked");
    expect(assessment.obligations.map((entry) => entry.kind)).toContain("member_unplaced");
  });
});

describe("F3-M03/M04/M05: interface synthesis (§82/§85)", () => {
  it("a cross-boundary interaction becomes paired compatible ports, none omitted, none invented", async () => {
    const base = baseOrg();
    const assessment = await evaluateOrganizationTransformation(splitProposal(base), { bases: [base] });
    expect(assessment.status).toBe("admissible");
    expect(assessment.boundaryPorts).toHaveLength(2);
    const directions = assessment.boundaryPorts.map((port) => port.direction).sort();
    expect(directions).toEqual(["in", "out"]);
    for (const port of assessment.boundaryPorts) {
      expect(port.protocol).toBe("handoff");
      expect(port.sourceInteractionId).toBe("i1");
    }
    // Every port traces to a source interaction (F3-M04).
    expect(
      assessment.boundaryPorts.every((port) => base.interactions.some((interaction) => interaction.interactionId === port.sourceInteractionId)),
    ).toBe(true);
    // No omission (F3-M05): exactly one cross-boundary source interaction.
    expect(assessment.interfaceReport?.crossBoundaryInteractionCount).toBe(1);
    expect(assessment.interfaceReport?.uniqueProtocolCount).toBe(1);
  });

  it("same-successor interactions stay internal (no port)", async () => {
    const base = baseOrg();
    const assessment = await evaluateOrganizationTransformation(
      splitProposal(base, {
        rolePlacements: [
          { roleId: "A", placement: "left" },
          { roleId: "B", placement: "left" },
        ],
        memberPlacements: [
          { member: peer("alpha"), placement: "left" },
          { member: peer("beta"), placement: "left" },
        ],
      }),
      { bases: [base] },
    );
    expect(assessment.boundaryPorts).toHaveLength(0);
    expect(assessment.interfaceReport?.crossBoundaryInteractionCount).toBe(0);
  });
});

describe("F3-M07/M08: merge collisions and conflicts are explicit (§89/§90)", () => {
  function sources() {
    const one = materializeOrganizationDefinition({
      organizationDefinitionId: "org-one",
      revision: 0,
      mission: "one",
      members: [peer("alpha")],
      roles: [{ roleId: "reviewer", requiredCapabilities: [] }],
      assignments: [{ member: peer("alpha"), roleId: "reviewer" }],
      norms: [{ normId: "n1", kind: "permission", roleId: "reviewer", actionTag: "approve" }],
    });
    const two = materializeOrganizationDefinition({
      organizationDefinitionId: "org-two",
      revision: 0,
      mission: "two",
      members: [peer("beta")],
      roles: [{ roleId: "reviewer", requiredCapabilities: [] }],
      assignments: [{ member: peer("beta"), roleId: "reviewer" }],
      norms: [{ normId: "n2", kind: "prohibition", roleId: "reviewer", actionTag: "approve" }],
    });
    return { one, two };
  }

  it("unresolved role collision and norm conflict block the merge", async () => {
    const { one, two } = sources();
    const proposal: MergeProposal = {
      kind: "MERGE",
      sources: [organizationRefOf(one), organizationRefOf(two)],
      target: { organizationDefinitionId: "org-M", revision: 0, mission: "merged" },
      roleResolutions: [],
    };
    const assessment = await evaluateOrganizationTransformation(proposal, { bases: [one, two] });
    expect(assessment.status).toBe("blocked");
    const kinds = assessment.obligations.filter((entry) => entry.status === "unresolved").map((entry) => entry.kind);
    expect(kinds).toContain("role_collision_unresolved");
    expect(kinds).toContain("norm_conflict_unresolved");
  });

  it("explicit decisions yield an admissible, conflict-free candidate", async () => {
    const { one, two } = sources();
    const proposal: MergeProposal = {
      kind: "MERGE",
      sources: [organizationRefOf(one), organizationRefOf(two)],
      target: { organizationDefinitionId: "org-M", revision: 0, mission: "merged" },
      roleResolutions: [
        { sourceOrganizationDefinitionId: "org-one", roleId: "reviewer", decision: "same_role" },
        { sourceOrganizationDefinitionId: "org-two", roleId: "reviewer", decision: "same_role" },
      ],
      normResolutions: [{ actionTag: "approve", decision: "permission" }],
    };
    const assessment = await evaluateOrganizationTransformation(proposal, { bases: [one, two] });
    expect(assessment.status).toBe("admissible");
    const candidate = assessment.candidates[0]!;
    expect(candidate.roles.map((role) => role.roleId)).toEqual(["reviewer"]);
    expect(candidate.members.map(organizationMemberKey).sort()).toEqual(["peer:alpha", "peer:beta"]);
    expect(candidate.norms.map((norm) => norm.kind)).toEqual(["permission"]);
    expect(candidate.assignments).toHaveLength(2);
  });

  it("a missing explicit mission blocks the merge (§91)", async () => {
    const { one, two } = sources();
    const assessment = await evaluateOrganizationTransformation(
      {
        kind: "MERGE",
        sources: [organizationRefOf(one), organizationRefOf(two)],
        target: { organizationDefinitionId: "org-M", revision: 0, mission: "   " },
        roleResolutions: [
          { sourceOrganizationDefinitionId: "org-one", roleId: "reviewer", decision: "same_role" },
          { sourceOrganizationDefinitionId: "org-two", roleId: "reviewer", decision: "same_role" },
        ],
        normResolutions: [{ actionTag: "approve", decision: "permission" }],
      },
      { bases: [one, two] },
    );
    expect(assessment.obligations.map((entry) => entry.kind)).toContain("mission_not_explicit");
    expect(assessment.status).toBe("blocked");
  });
});

describe("F3-M09: interface report deterministic", () => {
  it("two evaluations yield identical reports and obligation ids", async () => {
    const base = baseOrg();
    const first = await evaluateOrganizationTransformation(splitProposal(base), { bases: [base] });
    const second = await evaluateOrganizationTransformation(splitProposal(base), { bases: [base] });
    expect(second.interfaceReport).toEqual(first.interfaceReport);
    expect(second.obligations.map((entry) => entry.obligationId)).toEqual(first.obligations.map((entry) => entry.obligationId));
    expect(second.candidates.map((entry) => entry.digest)).toEqual(first.candidates.map((entry) => entry.digest));
  });
});

describe("F3-M10: source definitions immutable (§101)", () => {
  it("evaluation does not mutate the base definition", async () => {
    const base = baseOrg();
    const digestBefore = base.digest;
    await evaluateOrganizationTransformation(splitProposal(base), { bases: [base] });
    expect(base.digest).toBe(digestBefore);
    expect(Object.isFrozen(base)).toBe(true);
    expect(base.members).toHaveLength(2);
  });
});

describe("F3-M11/M12: atomic canonical activation (§100)", () => {
  it("split activation registers all successors atomically — a conflict rolls back the whole batch", async () => {
    const base = baseOrg();
    const store = new SqliteOrganizationStore(":memory:");
    // Pre-create org-R with different content so the right successor conflicts.
    await store.registerRevision({
      definition: materializeOrganizationDefinition({
        organizationDefinitionId: "org-R",
        revision: 0,
        mission: "pre-existing different",
        members: [peer("beta")],
        roles: [{ roleId: "B", requiredCapabilities: [] }],
        assignments: [],
      }),
      parent: null,
      expectedHeadRevision: null,
    });
    const assessment = await evaluateOrganizationTransformation(splitProposal(base), { bases: [base] });
    await expect(activateOrganizationTransformation(store, assessment)).rejects.toBeInstanceOf(Error);
    // org-L must NOT have been partially registered.
    expect(await store.listRevisions("org-L")).toHaveLength(0);
    expect(await store.listRevisions("org-R")).toHaveLength(1);
    store.close();
  });

  it("split activation succeeds when both successors are fresh; merge activation registers its candidate", async () => {
    const base = baseOrg();
    const store = new SqliteOrganizationStore(":memory:");
    const split = await evaluateOrganizationTransformation(splitProposal(base), { bases: [base] });
    const refs = await activateOrganizationTransformation(store, split);
    expect(refs).toHaveLength(2);
    expect(await store.listRevisions("org-L")).toHaveLength(1);
    expect(await store.listRevisions("org-R")).toHaveLength(1);

    const one = materializeOrganizationDefinition({
      organizationDefinitionId: "org-one",
      revision: 0,
      mission: "one",
      members: [peer("alpha")],
      roles: [{ roleId: "r1", requiredCapabilities: [] }],
      assignments: [{ member: peer("alpha"), roleId: "r1" }],
    });
    const two = materializeOrganizationDefinition({
      organizationDefinitionId: "org-two",
      revision: 0,
      mission: "two",
      members: [peer("beta")],
      roles: [{ roleId: "r2", requiredCapabilities: [] }],
      assignments: [{ member: peer("beta"), roleId: "r2" }],
    });
    const mergeAssessment = await evaluateOrganizationTransformation(
      {
        kind: "MERGE",
        sources: [organizationRefOf(one), organizationRefOf(two)],
        target: { organizationDefinitionId: "org-M", revision: 0, mission: "merged" },
        roleResolutions: [],
      },
      { bases: [one, two] },
    );
    expect(mergeAssessment.status).toBe("admissible");
    const mergeRefs = await activateOrganizationTransformation(store, mergeAssessment);
    expect(mergeRefs).toHaveLength(1);
    expect(await store.listRevisions("org-M")).toHaveLength(1);

    // A blocked assessment is never activatable.
    const blocked = await evaluateOrganizationTransformation(
      {
        kind: "MERGE",
        sources: [organizationRefOf(one)],
        target: { organizationDefinitionId: "org-M2", revision: 0, mission: "merged" },
        roleResolutions: [],
      },
      { bases: [one] },
    );
    expect(blocked.status).toBe("blocked");
    await expect(activateOrganizationTransformation(store, blocked)).rejects.toBeInstanceOf(OrganizationDefinitionError);
    store.close();
  });
});

describe("F3-M13: evidence claim is not auto-satisfied (§94/§95)", () => {
  it("a claimed behavior-preservation is unresolved without verification", async () => {
    const base = baseOrg();
    const candidate = materializeOrganizationDefinition({
      organizationDefinitionId: "org-base",
      revision: 1,
      mission: "revised",
      members: [peer("alpha"), peer("beta")],
      roles: base.roles,
      assignments: base.assignments,
      norms: base.norms,
      interactions: base.interactions,
    });
    const blocked = await evaluateOrganizationTransformation(
      { kind: "REVISE", base: organizationRefOf(base), candidate, claimedEvidenceRefs: ["ev-1"] },
      { bases: [base] },
    );
    expect(blocked.status).toBe("blocked");
    expect(blocked.obligations.map((entry) => entry.kind)).toContain("evidence_claim_unverified");

    const verifying: TransformationEvidencePort = {
      inspect: async (refs) => refs.map((ref) => ({ ref, verified: true, fresh: true })),
    };
    const admitted = await evaluateOrganizationTransformation(
      { kind: "REVISE", base: organizationRefOf(base), candidate, claimedEvidenceRefs: ["ev-1"] },
      { bases: [base], evidence: verifying },
    );
    expect(admitted.status).toBe("admissible");
  });

  it("a revise candidate that changes identity does not advance the revision", async () => {
    const base = baseOrg();
    const candidate = materializeOrganizationDefinition({
      organizationDefinitionId: "different-org",
      revision: 1,
      mission: "revised",
      members: [peer("alpha")],
      roles: [],
      assignments: [],
    });
    const assessment = await evaluateOrganizationTransformation(
      { kind: "REVISE", base: organizationRefOf(base), candidate },
      { bases: [base] },
    );
    expect(assessment.status).toBe("blocked");
    expect(assessment.obligations.map((entry) => entry.kind)).toContain("revision_does_not_advance");
  });

  it("planning an activation for a blocked assessment refuses", async () => {
    const base = baseOrg();
    const assessment = await evaluateOrganizationTransformation(
      { ...splitProposal(base), rolePlacements: [] },
      { bases: [base] },
    );
    expect(() => planTransformationActivation(assessment)).toThrow(OrganizationDefinitionError);
  });
});

describe("F3-M14: scheduler / runtime unchanged", () => {
  it("the transformation module imports no scheduler, runtime, or effect concern", () => {
    const code = strip(TRANSFORMATION_SOURCE);
    expect(code).not.toMatch(/scheduler|sessionRef|runtimescope|ordarium|effects\//i);
  });
});
