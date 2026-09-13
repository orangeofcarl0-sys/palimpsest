/**
 * G10-J Governed Dynamic Evolution — artifacts.
 *
 *   Proposal ≠ Candidate ≠ Assessment ≠ Authority ≠ Governance ≠ Activation ≠ Success
 *
 * A `CompleteEvolutionCandidate` compiles a fresh G10-I `OrganizationDynamicsProposal`
 * into the EXISTING F3 typed transformation vocabulary — never a second transformation
 * language. The candidate is untrusted, strictly parsed, and has no mutation authority.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import type { OrganizationDefinition, OrganizationDefinitionRef, OrganizationMemberRef, RoleId } from "../organization/index.js";
import { parseOrganizationDefinition, parseOrganizationRef } from "../organization/index.js";
import type { OrganizationTransformationProposal, SplitPlacement, SplitRolePlacement, SplitNormPlacement, MergeRoleDecision } from "../organization/index.js";
import type { OrganizationDynamicsProposal, ProposalImpactReport } from "../organization_dynamics/index.js";
import { parseCompleteFormalizationCandidate } from "./formalization.js";

export const EVOLUTION_CANDIDATE_DOMAIN = "palimpsest.organization-evolution-candidate.v1";
export const EVOLUTION_CASE_DOMAIN = "palimpsest.organization-evolution-case.v1";
export const EVOLUTION_CHAIN_DOMAIN = "palimpsest.organization-evolution-chain.v1";

export class EvolutionArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvolutionArtifactError";
  }
}

function fail(message: string): never {
  throw new EvolutionArtifactError(message);
}

export function evObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${what} must be an object`);
  return value as Record<string, unknown>;
}

export function evExactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) if (!keys.includes(key)) fail(`unknown ${what} field "${key}"`);
  for (const key of keys) if (!Object.hasOwn(object, key)) fail(`${what}: field "${key}" is required`);
}

function stableId(value: unknown, what: string): string {
  if (typeof value !== "string") fail(`${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) fail(`${what} must be a stable identifier`);
  return normalized;
}

function nonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${what} must be a non-empty string`);
  return value;
}

function literal<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) fail(`${what} must be one of ${allowed.join(", ")}`);
  return value as T;
}

/* ------------------------------------------------------------------ *
 * Candidate
 * ------------------------------------------------------------------ */

export type EvolutionTargetKind = "REVISE" | "SPLIT" | "MERGE" | "FORMALIZE";

export interface CompleteEvolutionCandidate {
  readonly schemaVersion: 1;
  readonly proposalDigest: string;
  readonly proposalBasisDigest: string;
  readonly kind: EvolutionTargetKind;
  readonly transformation: OrganizationTransformationProposal;
  readonly compilerProvenance: string;
  readonly digest: string;
}

export interface OrganizationEvolutionCompilerInput {
  readonly proposal: OrganizationDynamicsProposal;
  readonly impact: ProposalImpactReport;
  readonly sources: readonly OrganizationDefinition[];
  readonly capabilities: readonly string[];
}

/** Untrusted host-injected authoring seam. No store, authority, governance, or effects. */
export interface OrganizationEvolutionCompilerPort {
  compile(input: OrganizationEvolutionCompilerInput): Promise<unknown>;
}

function parseMemberPlacements(raw: unknown): readonly { member: OrganizationMemberRef; placement: SplitPlacement }[] {
  if (!Array.isArray(raw)) fail("memberPlacements must be an array");
  return Object.freeze(
    raw.map((entry) => {
      const object = evObject(entry, "memberPlacement");
      evExactKeys(object, ["member", "placement"], "memberPlacement");
      const member = evObject(object.member, "memberPlacement.member");
      const kind = member.kind;
      if (kind !== "peer" && kind !== "agent_definition") fail("member kind must be peer or agent_definition");
      const parsedMember: OrganizationMemberRef =
        kind === "peer"
          ? (Object.freeze({ kind: "peer" as const, peer: { schemaVersion: 1 as const, peerId: stableId(evObject(member.peer, "member.peer").peerId, "peerId") } }) as OrganizationMemberRef)
          : (Object.freeze({
              kind: "agent_definition" as const,
              architectureDefinitionId: stableId(member.architectureDefinitionId, "architectureDefinitionId"),
              agentDefinitionId: stableId(member.agentDefinitionId, "agentDefinitionId"),
            }) as OrganizationMemberRef);
      return Object.freeze({ member: parsedMember, placement: literal(object.placement, ["left", "right", "both"], "placement") as SplitPlacement });
    }),
  );
}

/** Strict parser for the F3 transformation proposal carried inside a candidate. */
export function parseEvolutionTransformation(raw: unknown): OrganizationTransformationProposal {
  const object = evObject(raw, "EvolutionTransformation");
  if (object.kind === "REVISE") {
    evExactKeys(object, ["kind", "base", "candidate"], "ReviseProposal");
    return Object.freeze({ kind: "REVISE" as const, base: parseOrganizationRef(object.base, "base"), candidate: parseOrganizationDefinition(object.candidate, "candidate") });
  }
  if (object.kind === "SPLIT") {
    evExactKeys(object, ["kind", "base", "left", "right", "memberPlacements", "rolePlacements", "normPlacements", "overlapDeclared"], "SplitProposal");
    if (typeof object.overlapDeclared !== "boolean") fail("overlapDeclared must be a boolean");
    const successor = (value: unknown, what: string) => {
      const spec = evObject(value, what);
      evExactKeys(spec, ["organizationDefinitionId", "revision", "mission"], what);
      if (typeof spec.revision !== "number" || !Number.isSafeInteger(spec.revision) || spec.revision < 0) fail(`${what}.revision must be a non-negative integer`);
      return Object.freeze({ organizationDefinitionId: stableId(spec.organizationDefinitionId, `${what}.organizationDefinitionId`), revision: spec.revision, mission: nonEmpty(spec.mission, `${what}.mission`) });
    };
    if (!Array.isArray(object.rolePlacements) || !Array.isArray(object.normPlacements)) fail("rolePlacements and normPlacements must be arrays");
    return Object.freeze({
      kind: "SPLIT" as const,
      base: parseOrganizationRef(object.base, "base"),
      left: successor(object.left, "left"),
      right: successor(object.right, "right"),
      memberPlacements: parseMemberPlacements(object.memberPlacements),
      rolePlacements: Object.freeze(
        object.rolePlacements.map((entry) => {
          const item = evObject(entry, "rolePlacement");
          evExactKeys(item, ["roleId", "placement"], "rolePlacement");
          return Object.freeze({ roleId: stableId(item.roleId, "roleId") as RoleId, placement: literal(item.placement, ["left", "right", "both", "retired"], "placement") as SplitRolePlacement });
        }),
      ),
      normPlacements: Object.freeze(
        object.normPlacements.map((entry) => {
          const item = evObject(entry, "normPlacement");
          evExactKeys(item, ["normId", "placement"], "normPlacement");
          return Object.freeze({ normId: stableId(item.normId, "normId"), placement: literal(item.placement, ["left", "right", "both", "retired", "interface"], "placement") as SplitNormPlacement });
        }),
      ),
      overlapDeclared: object.overlapDeclared,
    });
  }
  if (object.kind === "MERGE") {
    evExactKeys(object, ["kind", "sources", "target", "roleResolutions"], "MergeProposal");
    if (!Array.isArray(object.sources) || !Array.isArray(object.roleResolutions)) fail("sources and roleResolutions must be arrays");
    const target = evObject(object.target, "target");
    evExactKeys(target, ["organizationDefinitionId", "revision", "mission"], "target");
    if (typeof target.revision !== "number" || !Number.isSafeInteger(target.revision) || target.revision < 0) fail("target.revision must be a non-negative integer");
    return Object.freeze({
      kind: "MERGE" as const,
      sources: Object.freeze(object.sources.map((entry) => parseOrganizationRef(entry, "sources[]"))),
      target: Object.freeze({ organizationDefinitionId: stableId(target.organizationDefinitionId, "target.organizationDefinitionId"), revision: target.revision, mission: nonEmpty(target.mission, "target.mission") }),
      roleResolutions: Object.freeze(
        object.roleResolutions.map((entry) => {
          const item = evObject(entry, "roleResolution");
          evExactKeys(item, ["sourceOrganizationDefinitionId", "roleId", "decision", "targetRoleId"], "roleResolution");
          const decision = literal(item.decision, ["same_role", "rename", "keep_distinct"], "decision") as MergeRoleDecision;
          return Object.freeze({
            sourceOrganizationDefinitionId: stableId(item.sourceOrganizationDefinitionId, "sourceOrganizationDefinitionId"),
            roleId: stableId(item.roleId, "roleId") as RoleId,
            decision,
            ...(item.targetRoleId === null || item.targetRoleId === undefined ? {} : { targetRoleId: stableId(item.targetRoleId, "targetRoleId") as RoleId }),
          });
        }),
      ),
    });
  }
  fail(`unsupported evolution transformation kind "${String(object.kind)}"`);
}

export function evolutionCandidateDigestOf(candidate: Omit<CompleteEvolutionCandidate, "digest">): string {
  return canonicalDigest({ domain: EVOLUTION_CANDIDATE_DOMAIN, ...candidate });
}

export function parseCompleteEvolutionCandidate(raw: unknown): CompleteEvolutionCandidate {
  const object = evObject(raw, "CompleteEvolutionCandidate");
  evExactKeys(object, ["schemaVersion", "proposalDigest", "proposalBasisDigest", "kind", "transformation", "compilerProvenance", "digest"], "CompleteEvolutionCandidate");
  if (object.schemaVersion !== 1) fail("schemaVersion must be 1");
  const base = {
    schemaVersion: 1 as const,
    proposalDigest: nonEmpty(object.proposalDigest, "proposalDigest"),
    proposalBasisDigest: nonEmpty(object.proposalBasisDigest, "proposalBasisDigest"),
    kind: literal(object.kind, ["REVISE", "SPLIT", "MERGE"], "kind") as EvolutionTargetKind,
    transformation: parseEvolutionTransformation(object.transformation),
    compilerProvenance: nonEmpty(object.compilerProvenance, "compilerProvenance"),
  };
  const digest = nonEmpty(object.digest, "digest");
  if (digest !== evolutionCandidateDigestOf(base)) fail("candidate digest does not match its content");
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * Authority
 * ------------------------------------------------------------------ */

export type EvolutionGovernance = "standalone" | "institution";

export interface OrganizationEvolutionAdmissionInput {
  readonly proposalDigest: string;
  readonly candidateDigest: string;
  readonly assessmentDigest: string;
  readonly sourceOrganizations: readonly OrganizationDefinitionRef[];
  readonly kind: EvolutionTargetKind;
  readonly governance: EvolutionGovernance;
  readonly impact: ProposalImpactReport;
}

export type OrganizationEvolutionAuthorityOutcome =
  | { readonly outcome: "authorized" }
  | { readonly outcome: "denied"; readonly detail: string }
  | { readonly outcome: "unresolved"; readonly detail: string };

/**
 * Independent structural-evolution authority seam. It answers ONLY whether an assessed
 * evolution case may proceed to activation/governance — never truth, continuation, or
 * effect authority. A caller cannot supply its own outcome.
 */
export interface OrganizationEvolutionAdmissionPort {
  admit(input: OrganizationEvolutionAdmissionInput): Promise<OrganizationEvolutionAuthorityOutcome>;
}

/* ------------------------------------------------------------------ *
 * Evolution case
 * ------------------------------------------------------------------ */

export type EvolutionCaseRef = string;

export function evolutionCaseRefOf(input: { readonly proposalDigest: string; readonly candidateDigest: string }): EvolutionCaseRef {
  return `ec-${canonicalDigest({ domain: EVOLUTION_CASE_DOMAIN, proposalDigest: input.proposalDigest, candidateDigest: input.candidateDigest }).slice(0, 24)}`;
}

export type EvolutionEventType =
  | "EVOLUTION_CASE_OPENED"
  | "EVOLUTION_CANDIDATE_COMPILED"
  | "EVOLUTION_FORMALIZATION_COMPILED"
  | "EVOLUTION_ASSESSED"
  | "EVOLUTION_BLOCKED"
  | "EVOLUTION_AUTHORIZED"
  | "EVOLUTION_DENIED"
  | "EVOLUTION_AUTHORITY_UNRESOLVED"
  | "EVOLUTION_GOVERNANCE_REQUIRED"
  | "EVOLUTION_ACTIVATED"
  | "EVOLUTION_POST_OBSERVED"
  | "EVOLUTION_TERMINAL_RESOLVED"
  | "EVOLUTION_CLOSED";

export type EvolutionCaseState =
  | "PROPOSED"
  | "COMPILED"
  | "BLOCKED"
  | "AWAITING_AUTHORITY"
  | "DENIED"
  | "AUTHORITY_UNRESOLVED"
  | "AWAITING_GOVERNANCE"
  | "ACTIVATED"
  | "POST_OBSERVED"
  | "TERMINAL_RESOLVED"
  | "CLOSED";

export type EvolutionEventPayloadParser = (payload: unknown) => unknown;
export type EvolutionEventParsers = Readonly<Record<string, EvolutionEventPayloadParser>>;

export const EVOLUTION_EVENT_PARSERS: EvolutionEventParsers = Object.freeze({
  EVOLUTION_CASE_OPENED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_CASE_OPENED");
    evExactKeys(o, ["proposalDigest", "subjectKey"], "EVOLUTION_CASE_OPENED");
    return Object.freeze({ proposalDigest: nonEmpty(o.proposalDigest, "proposalDigest"), subjectKey: nonEmpty(o.subjectKey, "subjectKey") });
  },
  EVOLUTION_CANDIDATE_COMPILED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_CANDIDATE_COMPILED");
    evExactKeys(o, ["candidate"], "EVOLUTION_CANDIDATE_COMPILED");
    return Object.freeze({ candidate: parseCompleteEvolutionCandidate(o.candidate) });
  },
  EVOLUTION_FORMALIZATION_COMPILED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_FORMALIZATION_COMPILED");
    evExactKeys(o, ["candidate"], "EVOLUTION_FORMALIZATION_COMPILED");
    return Object.freeze({ candidate: parseCompleteFormalizationCandidate(o.candidate) });
  },
  EVOLUTION_ASSESSED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_ASSESSED");
    evExactKeys(o, ["kind", "status", "assessmentDigest", "obligations"], "EVOLUTION_ASSESSED");
    if (!Array.isArray(o.obligations)) fail("obligations must be an array");
    return Object.freeze({
      kind: literal(o.kind, ["REVISE", "SPLIT", "MERGE", "FORMALIZE"], "kind"),
      status: literal(o.status, ["admissible", "blocked"], "status"),
      assessmentDigest: nonEmpty(o.assessmentDigest, "assessmentDigest"),
      obligations: Object.freeze(
        o.obligations.map((entry) => {
          const item = evObject(entry, "obligation");
          evExactKeys(item, ["obligationId", "kind", "status", "detail"], "obligation");
          return Object.freeze({ obligationId: stableId(item.obligationId, "obligationId"), kind: nonEmpty(item.kind, "kind"), status: literal(item.status, ["satisfied", "unresolved"], "status"), detail: nonEmpty(item.detail, "detail") });
        }),
      ),
    });
  },
  EVOLUTION_BLOCKED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_BLOCKED");
    evExactKeys(o, ["unresolvedObligations"], "EVOLUTION_BLOCKED");
    if (!Array.isArray(o.unresolvedObligations)) fail("unresolvedObligations must be an array");
    return Object.freeze({ unresolvedObligations: Object.freeze(o.unresolvedObligations.map((entry) => stableId(entry, "obligationId"))) });
  },
  EVOLUTION_AUTHORIZED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_AUTHORIZED");
    evExactKeys(o, ["candidateDigest", "assessmentDigest", "governance"], "EVOLUTION_AUTHORIZED");
    return Object.freeze({ candidateDigest: nonEmpty(o.candidateDigest, "candidateDigest"), assessmentDigest: nonEmpty(o.assessmentDigest, "assessmentDigest"), governance: literal(o.governance, ["standalone", "institution"], "governance") });
  },
  EVOLUTION_DENIED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_DENIED");
    evExactKeys(o, ["detail"], "EVOLUTION_DENIED");
    return Object.freeze({ detail: nonEmpty(o.detail, "detail") });
  },
  EVOLUTION_AUTHORITY_UNRESOLVED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_AUTHORITY_UNRESOLVED");
    evExactKeys(o, ["detail"], "EVOLUTION_AUTHORITY_UNRESOLVED");
    return Object.freeze({ detail: nonEmpty(o.detail, "detail") });
  },
  EVOLUTION_GOVERNANCE_REQUIRED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_GOVERNANCE_REQUIRED");
    evExactKeys(o, ["institutionId", "transitionId", "adopted"], "EVOLUTION_GOVERNANCE_REQUIRED");
    return Object.freeze({ institutionId: stableId(o.institutionId, "institutionId"), transitionId: stableId(o.transitionId, "transitionId"), adopted: parseOrganizationRef(o.adopted, "adopted") });
  },
  EVOLUTION_ACTIVATED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_ACTIVATED");
    evExactKeys(o, ["activated"], "EVOLUTION_ACTIVATED");
    if (!Array.isArray(o.activated)) fail("activated must be an array");
    return Object.freeze({ activated: Object.freeze(o.activated.map((entry) => parseOrganizationRef(entry, "activated[]"))) });
  },
  EVOLUTION_POST_OBSERVED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_POST_OBSERVED");
    evExactKeys(o, ["beforeSnapshotDigest", "afterSnapshotDigest"], "EVOLUTION_POST_OBSERVED");
    return Object.freeze({ beforeSnapshotDigest: nonEmpty(o.beforeSnapshotDigest, "beforeSnapshotDigest"), afterSnapshotDigest: nonEmpty(o.afterSnapshotDigest, "afterSnapshotDigest") });
  },
  EVOLUTION_TERMINAL_RESOLVED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_TERMINAL_RESOLVED");
    evExactKeys(o, ["kind"], "EVOLUTION_TERMINAL_RESOLVED");
    return Object.freeze({ kind: literal(o.kind, ["NO_CHANGE", "RETAIN_FEDERATION"], "kind") });
  },
  EVOLUTION_CLOSED: (payload: unknown) => {
    const o = evObject(payload, "EVOLUTION_CLOSED");
    evExactKeys(o, ["reason"], "EVOLUTION_CLOSED");
    return Object.freeze({ reason: nonEmpty(o.reason, "reason") });
  },
});

export function evolutionChainDigest(input: {
  readonly caseRef: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly previousChainDigest: string | null;
}): string {
  return canonicalDigest({ domain: EVOLUTION_CHAIN_DOMAIN, caseRef: input.caseRef, seq: input.seq, eventId: input.eventId, type: input.type, payload: input.payload, previous: input.previousChainDigest });
}

/** Disposition of every G10-I proposal kind (J0-Q6, additive in G10-K). */
export type EvolutionKindDisposition = "TERMINAL_NON_MUTATING" | "EXECUTABLE_IN_J" | "EXECUTABLE_FORMALIZE" | "DEFERRED_UNSUPPORTED";

export const EVOLUTION_KIND_DISPOSITION: Readonly<Record<string, EvolutionKindDisposition>> = Object.freeze({
  NO_CHANGE: "TERMINAL_NON_MUTATING",
  RETAIN_FEDERATION: "TERMINAL_NON_MUTATING",
  REVISE_ORGANIZATION: "EXECUTABLE_IN_J",
  SPLIT_ORGANIZATION: "EXECUTABLE_IN_J",
  MERGE_ORGANIZATIONS: "EXECUTABLE_IN_J",
  // G10-K CF-J-02: executable ONLY with a fresh proposal + an EXACT accepted
  // OrganizationBlueprint + a complete candidate + independent evolution authority.
  FORMALIZE_ORGANIZATION: "EXECUTABLE_FORMALIZE",
  ENCAPSULATE_RUNTIME_SCOPE: "DEFERRED_UNSUPPORTED",
  COLLAPSE_RUNTIME_STRUCTURE: "DEFERRED_UNSUPPORTED",
  DISSOLVE_OR_RETIRE_CANDIDATE: "DEFERRED_UNSUPPORTED",
});

export const EVOLUTION_KIND_TO_TRANSFORMATION: Readonly<Record<string, EvolutionTargetKind>> = Object.freeze({
  REVISE_ORGANIZATION: "REVISE",
  SPLIT_ORGANIZATION: "SPLIT",
  MERGE_ORGANIZATIONS: "MERGE",
});
