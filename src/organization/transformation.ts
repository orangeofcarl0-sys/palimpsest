/**
 * G10-F3 typed Organization transformation (§74–§103).
 *
 * PLMP-AGT-0 freezes T : G → G' with T = (r, β, χ, PO, E). F3 implements the
 * smallest executable subset: REVISE, SPLIT, MERGE (EXTRACT/INLINE/REWIRE are
 * deferred — §76).
 *
 * Pipeline (§75):
 *   proposal → typed candidate → structural validation → boundary/interface
 *   synthesis → proof obligations → evidence/admission assessment →
 *   explicit activation → new immutable Organization revision(s)
 *
 * No AI (and no caller) directly mutates canonical organization truth:
 * proposals are immutable artifacts; they become canonical ONLY through an
 * explicit activation (§97/§98). Unresolved proof obligations BLOCK activation
 * (§144 preview) — they are never silently admitted.
 *
 * Split (§78): `Split = Partition + InterfaceSynthesis + InterfaceReport`.
 * A member partition alone is NOT a valid split. Cross-successor interactions
 * become paired `OrganizationBoundaryPort`s (§82/§83); ports carry NO runtime
 * meaning (§84).
 *
 * Merge (§88–§91): every role collision and norm conflict requires an EXPLICIT
 * decision; mission synthesis requires an EXPLICIT target mission.
 *
 * Evidence discipline (§94–§96): a proposal CLAIMING correctness is not
 * evidence. An optional read-only `TransformationEvidencePort` may verify
 * referenced evidence; without verification an evidence obligation stays
 * UNRESOLVED. No second evidence system is created.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type {
  OrganizationDefinition,
  OrganizationDefinitionRef,
  OrganizationInteraction,
  OrganizationMemberRef,
  OrganizationNorm,
  OrganizationNormKind,
  RoleAssignment,
  RoleDefinition,
  RoleId,
} from "./definition.js";
import {
  OrganizationDefinitionError,
  materializeOrganizationDefinition,
  organizationMemberKey,
  organizationRefOf,
} from "./definition.js";

export type OrganizationTransformationKind = "REVISE" | "SPLIT" | "MERGE";

export const BOUNDARY_PORT_DIGEST_DOMAIN = "palimpsest.organization.boundary-port.v1";
export const PROOF_OBLIGATION_DIGEST_DOMAIN = "palimpsest.organization.proof-obligation.v1";

/* ------------------------------------------------------------------ *
 * First-class proof obligations (§92–§95)
 * ------------------------------------------------------------------ */

export type OrganizationProofObligationKind =
  | "member_unplaced"
  | "role_unclassified"
  | "norm_unclassified"
  | "norm_role_missing"
  | "assignment_dangling"
  | "interaction_role_missing"
  | "successor_mission_missing"
  | "overlap_not_declared"
  | "base_missing"
  | "revision_does_not_advance"
  | "role_collision_unresolved"
  | "norm_conflict_unresolved"
  | "mission_not_explicit"
  | "source_count_insufficient"
  | "all_members_accounted"
  | "all_roles_classified"
  | "all_norms_classified"
  | "cross_boundary_interactions_synthesized"
  | "no_invented_boundary_ports"
  | "evidence_claim_unverified";

export interface OrganizationProofObligation {
  readonly obligationId: string;
  readonly kind: OrganizationProofObligationKind | string;
  readonly status: "satisfied" | "unresolved";
  readonly detail: string;
  readonly evidenceRefs?: readonly string[];
}

function obligationId(kind: string, detail: string): string {
  return `po-${canonicalDigest({ domain: PROOF_OBLIGATION_DIGEST_DOMAIN, kind, detail }).slice(0, 24)}`;
}

function obligation(
  kind: OrganizationProofObligationKind | string,
  satisfied: boolean,
  detail: string,
  evidenceRefs?: readonly string[],
): OrganizationProofObligation {
  return Object.freeze({
    obligationId: obligationId(kind, detail),
    kind,
    status: satisfied ? ("satisfied" as const) : ("unresolved" as const),
    detail,
    ...(evidenceRefs === undefined ? {} : { evidenceRefs }),
  });
}

/* ------------------------------------------------------------------ *
 * Boundary ports (§83/§84)
 * ------------------------------------------------------------------ */

export interface OrganizationBoundaryPort {
  readonly portId: string;
  readonly direction: "in" | "out";
  readonly protocol: string;
  readonly counterpartyOrganization: OrganizationDefinitionRef;
  /** Traceability only — the source interaction this port was synthesized from. */
  readonly sourceInteractionId: string;
}

/* ------------------------------------------------------------------ *
 * Interface report (§86/§87)
 * ------------------------------------------------------------------ */

export interface OrganizationInterfaceReport {
  readonly crossBoundaryInteractionCount: number;
  readonly uniqueProtocolCount: number;
  readonly duplicateProtocolOpportunities: readonly string[];
  readonly boundarySurfaceSummary: string;
}

/* ------------------------------------------------------------------ *
 * Evidence port (§96)
 * ------------------------------------------------------------------ */

export interface TransformationEvidenceInspection {
  readonly ref: string;
  readonly verified: boolean;
  readonly fresh: boolean;
}

export interface TransformationEvidencePort {
  inspect(refs: readonly string[]): Promise<readonly TransformationEvidenceInspection[]>;
}

/* ------------------------------------------------------------------ *
 * Proposals (§77–§91)
 * ------------------------------------------------------------------ */

export interface ReviseProposal {
  readonly kind: "REVISE";
  readonly base: OrganizationDefinitionRef;
  readonly candidate: OrganizationDefinition;
  readonly claimedEvidenceRefs?: readonly string[];
}

export type SplitPlacement = "left" | "right" | "both";
export type SplitRolePlacement = "left" | "right" | "both" | "retired";
export type SplitNormPlacement = "left" | "right" | "both" | "retired" | "interface";

export interface SplitSuccessorSpec {
  readonly organizationDefinitionId: string;
  readonly revision: number;
  readonly mission: string;
}

export interface SplitProposal {
  readonly kind: "SPLIT";
  readonly base: OrganizationDefinitionRef;
  readonly left: SplitSuccessorSpec;
  readonly right: SplitSuccessorSpec;
  readonly memberPlacements: readonly { readonly member: OrganizationMemberRef; readonly placement: SplitPlacement }[];
  readonly rolePlacements: readonly { readonly roleId: RoleId; readonly placement: SplitRolePlacement }[];
  readonly normPlacements: readonly { readonly normId: string; readonly placement: SplitNormPlacement }[];
  /** Declares whether cross-successor membership overlap is intended (§79). */
  readonly overlapDeclared: boolean;
  readonly claimedEvidenceRefs?: readonly string[];
}

export type MergeRoleDecision = "same_role" | "rename" | "keep_distinct";
export interface MergeRoleResolution {
  readonly sourceOrganizationDefinitionId: string;
  readonly roleId: RoleId;
  readonly decision: MergeRoleDecision;
  /** Required for `rename` and `keep_distinct`. */
  readonly targetRoleId?: RoleId;
}

export interface MergeNormResolution {
  readonly actionTag: string;
  readonly decision: "permission" | "prohibition" | "drop";
}

export interface MergeProposal {
  readonly kind: "MERGE";
  readonly sources: readonly OrganizationDefinitionRef[];
  readonly target: { readonly organizationDefinitionId: string; readonly revision: number; readonly mission: string };
  readonly roleResolutions: readonly MergeRoleResolution[];
  /** When provided, the explicit member union replaces the derived union (§88). */
  readonly members?: readonly OrganizationMemberRef[];
  readonly normResolutions?: readonly MergeNormResolution[];
  readonly claimedEvidenceRefs?: readonly string[];
}

export type OrganizationTransformationProposal = ReviseProposal | SplitProposal | MergeProposal;

/* ------------------------------------------------------------------ *
 * Assessment
 * ------------------------------------------------------------------ */

export interface OrganizationTransformationAssessment {
  readonly kind: OrganizationTransformationKind;
  readonly bases: readonly OrganizationDefinitionRef[];
  readonly candidates: readonly OrganizationDefinition[];
  readonly boundaryPorts: readonly OrganizationBoundaryPort[];
  readonly obligations: readonly OrganizationProofObligation[];
  readonly interfaceReport?: OrganizationInterfaceReport;
  readonly status: "admissible" | "blocked";
}

export interface OrganizationTransformationContext {
  readonly bases: readonly OrganizationDefinition[];
  readonly evidence?: TransformationEvidencePort;
}

function findBase(
  bases: readonly OrganizationDefinition[],
  ref: OrganizationDefinitionRef,
): OrganizationDefinition | undefined {
  return bases.find(
    (candidate) =>
      candidate.organizationDefinitionId === ref.organizationDefinitionId &&
      candidate.revision === ref.revision &&
      candidate.digest === ref.digest,
  );
}

function finalize(
  kind: OrganizationTransformationKind,
  bases: readonly OrganizationDefinitionRef[],
  candidates: readonly OrganizationDefinition[],
  boundaryPorts: readonly OrganizationBoundaryPort[],
  obligations: readonly OrganizationProofObligation[],
  interfaceReport?: OrganizationInterfaceReport,
): OrganizationTransformationAssessment {
  const blocked = obligations.some((entry) => entry.status === "unresolved");
  return Object.freeze({
    kind,
    bases: Object.freeze([...bases]),
    candidates: Object.freeze([...candidates]),
    boundaryPorts: Object.freeze([...boundaryPorts]),
    obligations: Object.freeze([...obligations]),
    ...(interfaceReport === undefined ? {} : { interfaceReport }),
    status: blocked ? ("blocked" as const) : ("admissible" as const),
  });
}

async function evidenceObligation(
  claimed: readonly string[] | undefined,
  context: OrganizationTransformationContext,
): Promise<OrganizationProofObligation[]> {
  if (claimed === undefined || claimed.length === 0) return [];
  if (context.evidence === undefined) {
    return [
      obligation(
        "evidence_claim_unverified",
        false,
        "proposal cites evidence but no verification port is configured (a claim is not evidence)",
        claimed,
      ),
    ];
  }
  const inspections = await context.evidence.inspect(claimed);
  const byRef = new Map(inspections.map((entry) => [entry.ref, entry]));
  const missing = claimed.filter((ref) => {
    const entry = byRef.get(ref);
    return entry === undefined || !entry.verified || !entry.fresh;
  });
  return [
    obligation(
      "evidence_claim_unverified",
      missing.length === 0,
      missing.length === 0
        ? "all cited evidence refs verified and fresh"
        : `evidence refs not verified/fresh: ${missing.join(", ")}`,
      claimed,
    ),
  ];
}

/* ------------------------------------------------------------------ *
 * REVISE
 * ------------------------------------------------------------------ */

async function evaluateRevise(
  proposal: ReviseProposal,
  context: OrganizationTransformationContext,
): Promise<OrganizationTransformationAssessment> {
  const base = findBase(context.bases, proposal.base);
  const obligations: OrganizationProofObligation[] = [];
  if (base === undefined) {
    obligations.push(obligation("base_missing", false, `base revision ${proposal.base.revision} of "${proposal.base.organizationDefinitionId}" was not supplied`));
    return finalize("REVISE", [proposal.base], [proposal.candidate], [], obligations);
  }
  const sameIdentity = proposal.candidate.organizationDefinitionId === base.organizationDefinitionId;
  obligations.push(
    obligation(
      "revision_does_not_advance",
      sameIdentity && proposal.candidate.revision > base.revision,
      sameIdentity
        ? proposal.candidate.revision > base.revision
          ? "candidate advances the revision"
          : `candidate revision ${proposal.candidate.revision} does not advance base ${base.revision}`
        : "candidate changes the organization identity (revision lineage is not transferable)",
    ),
  );
  obligations.push(...(await evidenceObligation(proposal.claimedEvidenceRefs, context)));
  return finalize("REVISE", [proposal.base], [proposal.candidate], [], obligations);
}

/* ------------------------------------------------------------------ *
 * SPLIT
 * ------------------------------------------------------------------ */

type Side = "left" | "right";

const memberSides = (placement: SplitPlacement): Side[] => (placement === "both" ? ["left", "right"] : [placement]);
const roleSides = (placement: SplitRolePlacement): Side[] => (placement === "retired" ? [] : placement === "both" ? ["left", "right"] : [placement]);
const normSides = (placement: SplitNormPlacement): Side[] =>
  placement === "retired" ? [] : placement === "left" ? ["left"] : placement === "right" ? ["right"] : ["left", "right"];

async function evaluateSplit(
  proposal: SplitProposal,
  context: OrganizationTransformationContext,
): Promise<OrganizationTransformationAssessment> {
  const base = findBase(context.bases, proposal.base);
  const obligations: OrganizationProofObligation[] = [];
  if (base === undefined) {
    obligations.push(obligation("base_missing", false, `base revision ${proposal.base.revision} of "${proposal.base.organizationDefinitionId}" was not supplied`));
    return finalize("SPLIT", [proposal.base], [], [], obligations);
  }

  const memberPlacement = new Map(proposal.memberPlacements.map((entry) => [organizationMemberKey(entry.member), entry.placement]));
  const rolePlacement = new Map(proposal.rolePlacements.map((entry) => [entry.roleId, entry.placement]));
  const normPlacement = new Map(proposal.normPlacements.map((entry) => [entry.normId, entry.placement]));

  // §79: no member disappears silently; §80: every role explicitly classified;
  // §81: every norm explicitly classified.
  const unplaced = base.members.map(organizationMemberKey).filter((key) => !memberPlacement.has(key));
  obligations.push(
    obligation("member_unplaced", unplaced.length === 0, unplaced.length === 0 ? "all members placed" : `unplaced members: ${unplaced.join(", ")}`),
  );
  const unclassifiedRoles = base.roles.map((role) => role.roleId).filter((roleId) => !rolePlacement.has(roleId));
  obligations.push(
    obligation("role_unclassified", unclassifiedRoles.length === 0, unclassifiedRoles.length === 0 ? "all roles classified" : `unclassified roles: ${unclassifiedRoles.join(", ")}`),
  );
  const unclassifiedNorms = base.norms.map((norm) => norm.normId).filter((normId) => !normPlacement.has(normId));
  obligations.push(
    obligation("norm_unclassified", unclassifiedNorms.length === 0, unclassifiedNorms.length === 0 ? "all norms classified" : `unclassified norms: ${unclassifiedNorms.join(", ")}`),
  );

  const overlapUsed = proposal.memberPlacements.some((entry) => entry.placement === "both");
  obligations.push(
    obligation("overlap_not_declared", !overlapUsed || proposal.overlapDeclared, overlapUsed && !proposal.overlapDeclared ? "member overlap is used but not declared" : "overlap policy consistent"),
  );

  const missionOk = proposal.left.mission.trim() !== "" && proposal.right.mission.trim() !== "";
  obligations.push(obligation("successor_mission_missing", missionOk, missionOk ? "successor missions explicit" : "a successor mission is empty"));

  // Members / roles per successor.
  const membersFor = (side: Side): OrganizationMemberRef[] =>
    base.members.filter((member) => {
      const placement = memberPlacement.get(organizationMemberKey(member));
      return placement !== undefined && memberSides(placement).includes(side);
    });
  const rolesFor = (side: Side): RoleDefinition[] =>
    base.roles.filter((role) => {
      const placement = rolePlacement.get(role.roleId);
      return placement !== undefined && roleSides(placement).includes(side);
    });

  // Assignments: must be representable in at least one successor; else dangling.
  const assignmentsFor = (side: Side): RoleAssignment[] =>
    base.assignments.filter((assignment) => {
      const memberPlacementValue = memberPlacement.get(organizationMemberKey(assignment.member));
      const rolePlacementValue = rolePlacement.get(assignment.roleId);
      if (memberPlacementValue === undefined || rolePlacementValue === undefined) return false;
      return memberSides(memberPlacementValue).includes(side) && roleSides(rolePlacementValue).includes(side);
    });
  const danglingAssignments = base.assignments.filter((assignment) => {
    const memberPlacementValue = memberPlacement.get(organizationMemberKey(assignment.member));
    const rolePlacementValue = rolePlacement.get(assignment.roleId);
    if (memberPlacementValue === undefined || rolePlacementValue === undefined) return true;
    const memberSideSet = new Set(memberSides(memberPlacementValue));
    return !roleSides(rolePlacementValue).some((side) => memberSideSet.has(side));
  });
  obligations.push(
    obligation(
      "assignment_dangling",
      danglingAssignments.length === 0,
      danglingAssignments.length === 0
        ? "no dangling role assignments"
        : `dangling assignments: ${danglingAssignments.map((assignment) => `${organizationMemberKey(assignment.member)}/${assignment.roleId}`).join(", ")}`,
    ),
  );

  // Norms: a placed norm whose role is absent from every side it needs is an
  // explicit obligation — never silently discarded.
  const normRoleMissing: string[] = [];
  const normsFor = (side: Side): OrganizationNorm[] =>
    base.norms.filter((norm) => {
      const placement = normPlacement.get(norm.normId);
      const rolePlacementValue = rolePlacement.get(norm.roleId);
      if (placement === undefined) return false;
      const needed = normSides(placement);
      if (!needed.includes(side)) return false;
      if (rolePlacementValue === undefined || !roleSides(rolePlacementValue).includes(side)) {
        normRoleMissing.push(`${norm.normId}@${side}`);
        return false;
      }
      return true;
    });
  const leftNorms = normsFor("left");
  const rightNorms = normsFor("right");
  obligations.push(
    obligation("norm_role_missing", normRoleMissing.length === 0, normRoleMissing.length === 0 ? "every placed norm keeps its role" : `norms without a role on a needed side: ${normRoleMissing.join(", ")}`),
  );

  // Interactions: internal ones stay; cross-successor ones synthesize ports (§82/§85).
  const internalInteractionsFor = (side: Side): OrganizationInteraction[] =>
    base.interactions.filter((interaction) => {
      const from = rolePlacement.get(interaction.fromRoleId);
      const to = rolePlacement.get(interaction.toRoleId);
      if (from === undefined || to === undefined) return false;
      return roleSides(from).includes(side) && roleSides(to).includes(side);
    });

  const leftMembers = membersFor("left");
  const rightMembers = membersFor("right");
  const leftRoles = rolesFor("left");
  const rightRoles = rolesFor("right");

  const leftDefinition = materializeOrganizationDefinition({
    organizationDefinitionId: proposal.left.organizationDefinitionId,
    revision: proposal.left.revision,
    mission: proposal.left.mission,
    members: leftMembers,
    roles: leftRoles,
    assignments: assignmentsFor("left"),
    norms: leftNorms,
    interactions: internalInteractionsFor("left"),
  });
  const rightDefinition = materializeOrganizationDefinition({
    organizationDefinitionId: proposal.right.organizationDefinitionId,
    revision: proposal.right.revision,
    mission: proposal.right.mission,
    members: rightMembers,
    roles: rightRoles,
    assignments: assignmentsFor("right"),
    norms: rightNorms,
    interactions: internalInteractionsFor("right"),
  });
  const leftRef = organizationRefOf(leftDefinition);
  const rightRef = organizationRefOf(rightDefinition);

  // §85 InterfaceSynthesis: every cross-boundary source interaction → paired
  // compatible ports; directions compatible; protocol preserved; no invented port.
  const ports: OrganizationBoundaryPort[] = [];
  const crossProtocols: string[] = [];
  let crossCount = 0;
  let missingCross = 0;
  const successorRefOf = (side: Side): OrganizationDefinitionRef => (side === "left" ? leftRef : rightRef);
  for (const interaction of base.interactions) {
    const fromPlacement = rolePlacement.get(interaction.fromRoleId);
    const toPlacement = rolePlacement.get(interaction.toRoleId);
    if (fromPlacement === undefined || toPlacement === undefined) {
      missingCross += 1;
      continue;
    }
    const fromSides = roleSides(fromPlacement);
    const toSides = roleSides(toPlacement);
    for (const fromSide of fromSides) {
      for (const toSide of toSides) {
        if (fromSide === toSide) continue;
        crossCount += 1;
        crossProtocols.push(interaction.protocol);
        const outId = `port-${canonicalDigest({ domain: BOUNDARY_PORT_DIGEST_DOMAIN, interactionId: interaction.interactionId, side: fromSide, direction: "out" }).slice(0, 20)}`;
        const inId = `port-${canonicalDigest({ domain: BOUNDARY_PORT_DIGEST_DOMAIN, interactionId: interaction.interactionId, side: toSide, direction: "in" }).slice(0, 20)}`;
        ports.push(
          Object.freeze({
            portId: outId,
            direction: "out" as const,
            protocol: interaction.protocol,
            counterpartyOrganization: successorRefOf(toSide),
            sourceInteractionId: interaction.interactionId,
          }),
          Object.freeze({
            portId: inId,
            direction: "in" as const,
            protocol: interaction.protocol,
            counterpartyOrganization: successorRefOf(fromSide),
            sourceInteractionId: interaction.interactionId,
          }),
        );
      }
    }
  }
  obligations.push(
    obligation(
      "interaction_role_missing",
      missingCross === 0,
      missingCross === 0 ? "every interaction endpoint classified" : `${missingCross} interactions reference an unclassified/retired role`,
    ),
  );
  obligations.push(
    obligation("cross_boundary_interactions_synthesized", true, `${crossCount} cross-boundary interactions synthesized into ${ports.length} ports`),
  );
  obligations.push(
    obligation("no_invented_boundary_ports", ports.every((port) => base.interactions.some((interaction) => interaction.interactionId === port.sourceInteractionId)), "every port traces to a source interaction"),
  );

  const protocols = [...new Set(crossProtocols)].sort();
  const duplicates = protocols.filter((protocol) => crossProtocols.filter((entry) => entry === protocol).length > 1);
  const interfaceReport: OrganizationInterfaceReport = Object.freeze({
    crossBoundaryInteractionCount: crossCount,
    uniqueProtocolCount: protocols.length,
    duplicateProtocolOpportunities: Object.freeze(duplicates),
    boundarySurfaceSummary: `${crossCount} cross-boundary interaction(s) across ${protocols.length} protocol(s)`,
  });

  obligations.push(...(await evidenceObligation(proposal.claimedEvidenceRefs, context)));
  return finalize("SPLIT", [proposal.base], [leftDefinition, rightDefinition], ports, obligations, interfaceReport);
}

/* ------------------------------------------------------------------ *
 * MERGE
 * ------------------------------------------------------------------ */

async function evaluateMerge(
  proposal: MergeProposal,
  context: OrganizationTransformationContext,
): Promise<OrganizationTransformationAssessment> {
  const obligations: OrganizationProofObligation[] = [];
  const sources = proposal.sources.map((ref) => findBase(context.bases, ref));
  if (proposal.sources.length < 2 || sources.some((source) => source === undefined)) {
    obligations.push(
      obligation("source_count_insufficient", false, `merge requires >=2 resolvable sources (got ${sources.filter((s) => s !== undefined).length})`),
    );
    return finalize("MERGE", proposal.sources, [], [], obligations);
  }
  const definitions = sources as OrganizationDefinition[];

  const missionOk = proposal.target.mission.trim() !== "";
  obligations.push(obligation("mission_not_explicit", missionOk, missionOk ? "target mission explicit" : "target mission missing (never concatenated automatically, §91)"));
  if (!missionOk) {
    // An invalid mission cannot produce a candidate — report the blocking
    // obligation honestly instead of throwing mid-construction.
    obligations.push(...(await evidenceObligation(proposal.claimedEvidenceRefs, context)));
    return finalize("MERGE", proposal.sources, [], [], obligations);
  }

  const membersRaw: readonly OrganizationMemberRef[] =
    proposal.members ?? definitions.flatMap((definition) => definition.members);
  const memberByKey = new Map<string, OrganizationMemberRef>();
  for (const member of membersRaw) memberByKey.set(organizationMemberKey(member), member);
  const members = [...memberByKey.values()];
  const memberKeys = new Set(memberByKey.keys());

  // §89 Role collision: any roleId present in >1 source requires an explicit decision.
  const roleOccurrences = new Map<RoleId, string[]>();
  for (const definition of definitions) {
    for (const role of definition.roles) {
      const list = roleOccurrences.get(role.roleId) ?? [];
      list.push(definition.organizationDefinitionId);
      roleOccurrences.set(role.roleId, list);
    }
  }
  const decisionFor = (sourceId: string, roleId: RoleId): MergeRoleResolution | undefined =>
    proposal.roleResolutions.find((entry) => entry.sourceOrganizationDefinitionId === sourceId && entry.roleId === roleId);
  const targetRoleIdOf = (sourceId: string, roleId: RoleId): string | undefined => {
    const collides = (roleOccurrences.get(roleId)?.length ?? 0) > 1;
    if (!collides) return roleId;
    const decision = decisionFor(sourceId, roleId);
    if (decision === undefined) return undefined;
    if (decision.decision === "same_role") return roleId;
    return decision.targetRoleId;
  };
  const unresolvedRoleCollisions: string[] = [];
  const rolesById = new Map<string, RoleDefinition>();
  for (const definition of definitions) {
    for (const role of definition.roles) {
      const targetRoleId = targetRoleIdOf(definition.organizationDefinitionId, role.roleId);
      if (targetRoleId === undefined) {
        unresolvedRoleCollisions.push(`${definition.organizationDefinitionId}:${role.roleId}`);
        continue;
      }
      const existing = rolesById.get(targetRoleId);
      rolesById.set(
        targetRoleId,
        existing === undefined
          ? Object.freeze({ roleId: targetRoleId, requiredCapabilities: Object.freeze([...role.requiredCapabilities]) })
          : Object.freeze({
              roleId: targetRoleId,
              requiredCapabilities: Object.freeze([...new Set([...existing.requiredCapabilities, ...role.requiredCapabilities])].sort()),
            }),
      );
    }
  }
  obligations.push(
    obligation(
      "role_collision_unresolved",
      unresolvedRoleCollisions.length === 0,
      unresolvedRoleCollisions.length === 0 ? "every role collision explicitly resolved" : `unresolved role collisions: ${unresolvedRoleCollisions.join(", ")}`,
    ),
  );

  // §90 Norm conflict: permission vs prohibition on the same actionTag requires
  // an explicit resolution; never chosen automatically.
  const normByAction = new Map<string, Set<OrganizationNormKind>>();
  for (const definition of definitions) {
    for (const norm of definition.norms) {
      const kinds = normByAction.get(norm.actionTag) ?? new Set<OrganizationNormKind>();
      kinds.add(norm.kind);
      normByAction.set(norm.actionTag, kinds);
    }
  }
  const conflictTags = [...normByAction.entries()]
    .filter(([, kinds]) => kinds.has("permission") && kinds.has("prohibition"))
    .map(([actionTag]) => actionTag)
    .sort();
  const resolutionFor = (actionTag: string): MergeNormResolution | undefined =>
    proposal.normResolutions?.find((entry) => entry.actionTag === actionTag);
  const unresolvedConflicts = conflictTags.filter((actionTag) => resolutionFor(actionTag) === undefined);
  obligations.push(
    obligation(
      "norm_conflict_unresolved",
      unresolvedConflicts.length === 0,
      unresolvedConflicts.length === 0 ? "every norm conflict explicitly resolved" : `unresolved norm conflicts: ${unresolvedConflicts.join(", ")}`,
    ),
  );

  const assignmentsByKey = new Map<string, RoleAssignment>();
  const interactions: OrganizationInteraction[] = [];
  const interactionIds = new Set<string>();
  const roleIds = new Set(rolesById.keys());
  definitions.forEach((definition, index) => {
    for (const assignment of definition.assignments) {
      const targetRoleId = targetRoleIdOf(definition.organizationDefinitionId, assignment.roleId);
      if (targetRoleId === undefined || !roleIds.has(targetRoleId)) continue;
      if (!memberKeys.has(organizationMemberKey(assignment.member))) continue;
      const key = `${organizationMemberKey(assignment.member)}\u0000${targetRoleId}`;
      if (!assignmentsByKey.has(key)) assignmentsByKey.set(key, { member: assignment.member, roleId: targetRoleId });
    }
    for (const interaction of definition.interactions) {
      const from = targetRoleIdOf(definition.organizationDefinitionId, interaction.fromRoleId);
      const to = targetRoleIdOf(definition.organizationDefinitionId, interaction.toRoleId);
      if (from === undefined || to === undefined || !roleIds.has(from) || !roleIds.has(to)) continue;
      const interactionId = interactionIds.has(interaction.interactionId)
        ? `${interaction.interactionId}.${index}`
        : interaction.interactionId;
      interactionIds.add(interactionId);
      interactions.push({ ...interaction, interactionId, fromRoleId: from, toRoleId: to });
    }
  });
  const assignments = [...assignmentsByKey.values()];

  // Norms: union with explicit conflict resolution applied; role references are
  // remapped through the role decisions (never left dangling).
  const norms: OrganizationNorm[] = [];
  const normIds = new Set<string>();
  definitions.forEach((definition, index) => {
    for (const norm of definition.norms) {
      if (conflictTags.includes(norm.actionTag)) {
        const resolution = resolutionFor(norm.actionTag);
        if (resolution === undefined || resolution.decision === "drop") continue;
        if (resolution.decision !== norm.kind) continue;
      }
      const roleId = targetRoleIdOf(definition.organizationDefinitionId, norm.roleId);
      if (roleId === undefined || !roleIds.has(roleId)) continue;
      const normId = normIds.has(norm.normId) ? `${norm.normId}.${index}` : norm.normId;
      normIds.add(normId);
      norms.push({ ...norm, normId, roleId });
    }
  });

  const candidate = materializeOrganizationDefinition({
    organizationDefinitionId: proposal.target.organizationDefinitionId,
    revision: proposal.target.revision,
    mission: proposal.target.mission,
    members,
    roles: [...rolesById.values()],
    assignments,
    norms,
    interactions,
  });

  obligations.push(...(await evidenceObligation(proposal.claimedEvidenceRefs, context)));
  return finalize("MERGE", proposal.sources, [candidate], [], obligations);
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

export async function evaluateOrganizationTransformation(
  proposal: OrganizationTransformationProposal,
  context: OrganizationTransformationContext,
): Promise<OrganizationTransformationAssessment> {
  switch (proposal.kind) {
    case "REVISE":
      return evaluateRevise(proposal, context);
    case "SPLIT":
      return evaluateSplit(proposal, context);
    case "MERGE":
      return evaluateMerge(proposal, context);
    default:
      throw new OrganizationDefinitionError("unknown organization transformation kind");
  }
}

/* ------------------------------------------------------------------ *
 * Explicit activation (§97–§100)
 * ------------------------------------------------------------------ */

export interface TransformationActivation {
  readonly definition: OrganizationDefinition;
  readonly parent: OrganizationDefinitionRef | null;
  readonly expectedHeadRevision: number | null;
}

/**
 * Plan the store registrations for an admissible assessment. Refuses a blocked
 * assessment (unresolved proof obligations are never admitted, §144).
 */
export function planTransformationActivation(
  assessment: OrganizationTransformationAssessment,
): readonly TransformationActivation[] {
  if (assessment.status !== "admissible") {
    throw new OrganizationDefinitionError(
      "cannot activate a blocked transformation: unresolved proof obligations must be resolved first",
    );
  }
  const baseRefs = new Map(assessment.bases.map((ref) => [ref.organizationDefinitionId, ref]));
  return Object.freeze(
    assessment.candidates.map((definition) => {
      const base = baseRefs.get(definition.organizationDefinitionId);
      return Object.freeze({
        definition,
        parent: base ?? null,
        expectedHeadRevision: base === undefined ? null : base.revision,
      });
    }),
  );
}

/**
 * Explicit activation (§98): trusted administrative activation for standalone
 * organizations. This is NOT institution continuation authority — an
 * institution-governed organization must advance through F4/F5 governance.
 * Registers all candidate revisions as ONE atomic transition (§100).
 */
export async function activateOrganizationTransformation(
  store: { registerRevisions(inputs: readonly TransformationActivation[]): Promise<void> },
  assessment: OrganizationTransformationAssessment,
): Promise<readonly OrganizationDefinitionRef[]> {
  const plan = planTransformationActivation(assessment);
  await store.registerRevisions(plan);
  return Object.freeze(plan.map((entry) => organizationRefOf(entry.definition)));
}
