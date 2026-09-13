/**
 * G10-I Organization Dynamics — deterministic, basis-grounded observation,
 * typed structural diagnosis, and NON-canonical structural proposals.
 *
 *   Observation ≠ Diagnosis ≠ Proposal ≠ Transformation ≠ Governance ≠ Activation
 *
 * This module has ZERO canonical mutation authority. It reads canonical source
 * histories across stores and derives immutable, digest-identified artifacts. It
 * owns no store, no scalar "organization health", and no magic threshold.
 * Thresholds live only in an explicit, versioned `DynamicsPolicy`.
 *
 * Knowledge discipline: a missing source is `unknown`, never `empty`. Any
 * diagnostic depending on an unknown input is `unresolved`.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import type { OrganizationDefinition, OrganizationDefinitionRef } from "../organization/definition.js";
import type { RuntimeScopeRef, RuntimeScopeState, HolonView, RuntimeScopeStore, RuntimeScopeService, RuntimeScopeMember } from "../runtime_scope/index.js";

export const DYNAMICS_SNAPSHOT_DOMAIN = "palimpsest.dynamics-snapshot.v1";
export const DYNAMICS_DIAGNOSIS_DOMAIN = "palimpsest.dynamics-diagnosis.v1";
export const DYNAMICS_PROPOSAL_DOMAIN = "palimpsest.dynamics-proposal.v1";

export type DynamicsKnowledgeState = "known" | "unknown" | "error";

export class OrganizationDynamicsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationDynamicsError";
  }
}

function fail(message: string): never {
  throw new OrganizationDynamicsError(message);
}

export function dynObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${what} must be an object`);
  return value as Record<string, unknown>;
}

export function dynExactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) if (!keys.includes(key)) fail(`unknown ${what} field "${key}"`);
  for (const key of keys) if (!Object.hasOwn(object, key)) fail(`${what}: field "${key}" is required`);
}

function dynStableId(value: unknown, what: string): string {
  if (typeof value !== "string") fail(`${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) fail(`${what} must be a stable identifier`);
  return normalized;
}

function dynNonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${what} must be a non-empty string`);
  return value;
}

/* ------------------------------------------------------------------ *
 * Subject, basis, policy
 * ------------------------------------------------------------------ */

export type DynamicsSubject =
  | { readonly kind: "organization"; readonly organization: OrganizationDefinitionRef }
  | { readonly kind: "runtime_scope"; readonly scope: RuntimeScopeRef };

export function parseDynamicsSubject(raw: unknown): DynamicsSubject {
  const object = dynObject(raw, "DynamicsSubject");
  if (object.kind === "organization") {
    dynExactKeys(object, ["kind", "organization"], "DynamicsSubject");
    const ref = dynObject(object.organization, "DynamicsSubject.organization");
    dynExactKeys(ref, ["organizationDefinitionId", "revision", "digest"], "DynamicsSubject.organization");
    if (typeof ref.revision !== "number" || !Number.isSafeInteger(ref.revision) || ref.revision < 0) fail("revision must be a non-negative integer");
    return Object.freeze({
      kind: "organization" as const,
      organization: Object.freeze({ organizationDefinitionId: dynStableId(ref.organizationDefinitionId, "organizationDefinitionId"), revision: ref.revision, digest: dynNonEmpty(ref.digest, "digest") }),
    });
  }
  if (object.kind === "runtime_scope") {
    dynExactKeys(object, ["kind", "scope"], "DynamicsSubject");
    const scope = dynObject(object.scope, "DynamicsSubject.scope");
    dynExactKeys(scope, ["schemaVersion", "scopeId"], "DynamicsSubject.scope");
    if (scope.schemaVersion !== 1) fail("scope.schemaVersion must be 1");
    return Object.freeze({ kind: "runtime_scope" as const, scope: Object.freeze({ schemaVersion: 1 as const, scopeId: dynStableId(scope.scopeId, "scopeId") }) });
  }
  fail("DynamicsSubject.kind must be organization or runtime_scope");
}

export function subjectKey(subject: DynamicsSubject): string {
  return subject.kind === "organization" ? `organization:${subject.organization.organizationDefinitionId}` : `runtime_scope:${subject.scope.scopeId}`;
}

export interface DynamicsPolicyRef {
  readonly id: string;
  readonly version: string;
}

export interface DynamicsPolicy {
  readonly ref: DynamicsPolicyRef;
  /** Minimum distinct basis-separated snapshots before a standing may be called persistent. */
  readonly minDistinctBases: number;
  /** Explicit, versioned thresholds — never scattered magic numbers. */
  readonly churnMinReconfigurations: number;
  readonly concentrationShareThreshold: number;
  readonly federationMinMessageEvents: number;
  readonly federationMinDistinctPeers: number;
}

export function parseDynamicsPolicy(raw: unknown): DynamicsPolicy {
  const object = dynObject(raw, "DynamicsPolicy");
  dynExactKeys(object, ["ref", "minDistinctBases", "churnMinReconfigurations", "concentrationShareThreshold", "federationMinMessageEvents", "federationMinDistinctPeers"], "DynamicsPolicy");
  const ref = dynObject(object.ref, "DynamicsPolicy.ref");
  dynExactKeys(ref, ["id", "version"], "DynamicsPolicy.ref");
  const nonNeg = (value: unknown, what: string): number => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail(`${what} must be a non-negative integer`);
    return value;
  };
  const fraction = (value: unknown, what: string): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) fail(`${what} must be a fraction in [0,1]`);
    return value;
  };
  return Object.freeze({
    ref: Object.freeze({ id: dynStableId(ref.id, "policy.id"), version: dynNonEmpty(ref.version, "policy.version") }),
    minDistinctBases: nonNeg(object.minDistinctBases, "minDistinctBases"),
    churnMinReconfigurations: nonNeg(object.churnMinReconfigurations, "churnMinReconfigurations"),
    concentrationShareThreshold: fraction(object.concentrationShareThreshold, "concentrationShareThreshold"),
    federationMinMessageEvents: nonNeg(object.federationMinMessageEvents, "federationMinMessageEvents"),
    federationMinDistinctPeers: nonNeg(object.federationMinDistinctPeers, "federationMinDistinctPeers"),
  });
}

/* ------------------------------------------------------------------ *
 * Collaboration observation (normalized, mechanical)
 * ------------------------------------------------------------------ */

export interface DynamicsCollaborationObservation {
  /** Exact coordination event-type counts — mechanical, no interpretation. */
  readonly eventCounts: Readonly<Record<string, number>>;
  readonly messageEventCount: number;
  readonly distinctPeerIds: readonly string[];
  readonly commitmentAcceptedEvents: number;
  readonly handoffAcceptedEvents: number;
  readonly contactRequestEvents: number;
  /** Activation ids recorded as participating (join key against runtime membership). */
  readonly participationActivationIds: readonly string[];
  readonly coordinationHead: number;
}

export interface DynamicsCollaborationPort {
  observe(): Promise<DynamicsCollaborationObservation>;
}

/* ------------------------------------------------------------------ *
 * Basis + snapshot
 * ------------------------------------------------------------------ */

export interface ScopeBasisRef {
  readonly scope: RuntimeScopeRef;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export interface DynamicsBasis {
  readonly subject: DynamicsSubject;
  readonly organization: OrganizationDefinitionRef | null;
  readonly runtimeScopes: readonly ScopeBasisRef[];
  readonly coordinationHead: number;
  /** Honest label of the actual guarantee — never claimed atomic. */
  readonly synchronization: "optimistic_reread";
}

export interface RuntimeStructuralSnapshot {
  readonly scopeCount: number;
  readonly maxDepth: number;
  readonly activationMemberCount: number;
  readonly childScopeMemberCount: number;
  readonly memberAdditions: number;
  readonly memberRemovals: number;
  readonly reconfigurationCount: number;
  readonly boundaryChangeCount: number;
  readonly peerChangeCount: number;
  readonly campaignAssociationCount: number;
  readonly externalBoundaryCount: number;
  readonly externalPeerCount: number;
  readonly organizationBasisFreshness: "unassociated" | "current" | "stale" | "unknown";
}

export interface OrganizationStructureMetrics {
  readonly memberCount: number;
  readonly roleCount: number;
  readonly interactionCount: number;
  readonly revisionCount: number;
}

export interface CollaborationMetrics {
  readonly messageEventCount: number;
  readonly distinctPeerCount: number;
  readonly commitmentAcceptedEvents: number;
  readonly handoffAcceptedEvents: number;
  readonly contactRequestEvents: number;
  /** Derived co-occurrence only — never a canonical Participation→RuntimeScope relation. */
  readonly participationRuntimeCooccurrence: number;
}

export interface DynamicsKnowledge {
  readonly runtime: DynamicsKnowledgeState;
  readonly organization: DynamicsKnowledgeState | "unassociated";
  readonly collaboration: DynamicsKnowledgeState;
}

export interface OrganizationDynamicsSnapshot {
  readonly subject: DynamicsSubject;
  readonly basis: DynamicsBasis;
  readonly policy: DynamicsPolicyRef;
  readonly knowledge: DynamicsKnowledge;
  readonly runtime: RuntimeStructuralSnapshot;
  readonly organization: OrganizationStructureMetrics | null;
  readonly collaboration: CollaborationMetrics | null;
  readonly declaredInteractionIds: readonly string[];
  readonly observedBoundaryInteractionIds: readonly string[];
  readonly digest: string;
}

export function basisDigestOf(basis: DynamicsBasis): string {
  return canonicalDigest({
    domain: "palimpsest.dynamics-basis.v1",
    subject: basis.subject,
    organization: basis.organization,
    runtimeScopes: basis.runtimeScopes,
    coordinationHead: basis.coordinationHead,
    synchronization: basis.synchronization,
  });
}

export function snapshotDigestOf(input: {
  readonly subject: DynamicsSubject;
  readonly basis: DynamicsBasis;
  readonly policy: DynamicsPolicyRef;
  readonly knowledge: DynamicsKnowledge;
  readonly runtime: RuntimeStructuralSnapshot;
  readonly organization: OrganizationStructureMetrics | null;
  readonly collaboration: CollaborationMetrics | null;
  readonly declaredInteractionIds: readonly string[];
  readonly observedBoundaryInteractionIds: readonly string[];
}): string {
  return canonicalDigest({
    domain: DYNAMICS_SNAPSHOT_DOMAIN,
    subject: input.subject,
    basis: input.basis,
    policy: input.policy,
    knowledge: input.knowledge,
    runtime: input.runtime,
    organization: input.organization,
    collaboration: input.collaboration,
    declaredInteractionIds: [...input.declaredInteractionIds].sort(),
    observedBoundaryInteractionIds: [...input.observedBoundaryInteractionIds].sort(),
  });
}

/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */

export type PressureStanding = "supported" | "unsupported" | "unresolved";

export type DynamicsPressureKind =
  | "STALE_ORGANIZATION_GROUNDING"
  | "RUNTIME_RECONFIGURATION_CHURN"
  | "INTERACTION_CONCENTRATION"
  | "DECLARED_BUT_UNOBSERVED_INTERACTION"
  | "UNDECLARED_OBSERVED_INTERACTION"
  | "STABLE_FEDERATION"
  | "SHADOW_ORGANIZATION_CANDIDATE"
  | "ZOMBIE_ORGANIZATION_CANDIDATE"
  | "MERGE_PRESSURE"
  | "SPLIT_PRESSURE"
  | "ENCAPSULATION_CANDIDATE";

export interface StructuralPressure {
  readonly kind: DynamicsPressureKind;
  readonly standing: PressureStanding;
  readonly evidence: readonly string[];
  readonly counterEvidence: readonly string[];
  readonly unknowns: readonly string[];
}

export interface InterfaceCompressibilityAssessment {
  readonly boundaryExists: boolean;
  readonly boundaryStable: boolean;
  readonly internalReconfigurationHigh: boolean;
  readonly externalRepresentationStable: boolean;
  /** Semantic sufficiency of the interface is not observable today. */
  readonly semanticSufficiency: "requires_evidence";
}

export interface StructuralDiagnosis {
  readonly subject: DynamicsSubject;
  readonly snapshotDigest: string;
  readonly policy: DynamicsPolicyRef;
  readonly pressures: readonly StructuralPressure[];
  readonly interfaceCompressibility: InterfaceCompressibilityAssessment;
  readonly digest: string;
}

export interface PersistenceEntry {
  readonly kind: DynamicsPressureKind;
  readonly standing: "persistent" | "candidate" | "insufficient_history" | "not_supported";
  readonly distinctBases: number;
  readonly supportingSnapshotDigests: readonly string[];
}

export interface PersistenceReport {
  readonly policy: DynamicsPolicyRef;
  readonly entries: readonly PersistenceEntry[];
}

/* ------------------------------------------------------------------ *
 * Proposal
 * ------------------------------------------------------------------ */

export type DynamicsProposalKind =
  | "NO_CHANGE"
  | "RETAIN_FEDERATION"
  | "FORMALIZE_ORGANIZATION"
  | "REVISE_ORGANIZATION"
  | "SPLIT_ORGANIZATION"
  | "MERGE_ORGANIZATIONS"
  | "ENCAPSULATE_RUNTIME_SCOPE"
  | "COLLAPSE_RUNTIME_STRUCTURE"
  | "DISSOLVE_OR_RETIRE_CANDIDATE";

export const DYNAMICS_PROPOSAL_KINDS: readonly DynamicsProposalKind[] = Object.freeze([
  "NO_CHANGE", "RETAIN_FEDERATION", "FORMALIZE_ORGANIZATION", "REVISE_ORGANIZATION", "SPLIT_ORGANIZATION",
  "MERGE_ORGANIZATIONS", "ENCAPSULATE_RUNTIME_SCOPE", "COLLAPSE_RUNTIME_STRUCTURE", "DISSOLVE_OR_RETIRE_CANDIDATE",
]);

export type ExistingTransformationMapping = "REVISE" | "SPLIT" | "MERGE" | "unsupported";

export interface OrganizationDynamicsProposal {
  readonly subject: DynamicsSubject;
  readonly snapshotDigest: string;
  readonly diagnosisDigest: string;
  readonly kind: DynamicsProposalKind;
  readonly targets: readonly string[];
  readonly intent: string;
  readonly policy: DynamicsPolicyRef;
  readonly advisorProvenance: string | null;
  readonly mapsToExistingTransformation: ExistingTransformationMapping;
  readonly basisDigest: string;
  readonly digest: string;
}

export function proposalDigestOf(proposal: Omit<OrganizationDynamicsProposal, "digest">): string {
  return canonicalDigest({ domain: DYNAMICS_PROPOSAL_DOMAIN, ...proposal });
}

export function parseOrganizationDynamicsProposal(raw: unknown): OrganizationDynamicsProposal {
  const object = dynObject(raw, "OrganizationDynamicsProposal");
  dynExactKeys(
    object,
    ["subject", "snapshotDigest", "diagnosisDigest", "kind", "targets", "intent", "policy", "advisorProvenance", "mapsToExistingTransformation", "basisDigest", "digest"],
    "OrganizationDynamicsProposal",
  );
  const subject = parseDynamicsSubject(object.subject);
  if (!Array.isArray(object.targets)) fail("targets must be an array");
  const targets = object.targets.map((entry) => dynStableId(entry, "targets[]"));
  if (new Set(targets).size !== targets.length) fail("targets must not contain duplicates");
  const policy = dynObject(object.policy, "proposal.policy");
  dynExactKeys(policy, ["id", "version"], "proposal.policy");
  if (!DYNAMICS_PROPOSAL_KINDS.includes(object.kind as DynamicsProposalKind)) fail("unsupported proposal kind");
  const mapping = object.mapsToExistingTransformation;
  if (mapping !== "REVISE" && mapping !== "SPLIT" && mapping !== "MERGE" && mapping !== "unsupported") fail("invalid transformation mapping");
  const advisorProvenance = object.advisorProvenance === null ? null : dynNonEmpty(object.advisorProvenance, "advisorProvenance");
  const base = {
    subject,
    snapshotDigest: dynNonEmpty(object.snapshotDigest, "snapshotDigest"),
    diagnosisDigest: dynNonEmpty(object.diagnosisDigest, "diagnosisDigest"),
    kind: object.kind as DynamicsProposalKind,
    targets: Object.freeze(targets.sort()),
    intent: dynNonEmpty(object.intent, "intent"),
    policy: Object.freeze({ id: dynStableId(policy.id, "policy.id"), version: dynNonEmpty(policy.version, "policy.version") }),
    advisorProvenance,
    mapsToExistingTransformation: mapping as ExistingTransformationMapping,
    basisDigest: dynNonEmpty(object.basisDigest, "basisDigest"),
  };
  const digest = dynNonEmpty(object.digest, "digest");
  if (digest !== proposalDigestOf(base)) fail("proposal digest does not match its content");
  return Object.freeze({ ...base, digest });
}

export interface ProposalIndependenceLoss {
  readonly distinctPeers: number | "unknown";
  readonly distinctOrganizations: number | "unknown";
  readonly distinctAuthorityDomains: "unknown";
  readonly distinctCommitments: number | "unknown";
  readonly distinctEvidenceSources: "unknown";
  readonly distinctFailureDomains: "unknown";
  readonly distinctWorkspaces: "unknown";
}

export interface ProposalImpactReport {
  readonly proposalDigest: string;
  readonly affectedScopes: readonly string[];
  readonly affectedBoundaries: readonly string[];
  readonly affectedPeers: readonly string[];
  readonly independenceLoss: ProposalIndependenceLoss;
  readonly mapsToExistingTransformation: ExistingTransformationMapping;
}

/* ------------------------------------------------------------------ *
 * Advisor seam (untrusted, host-injected)
 * ------------------------------------------------------------------ */

export interface OrganizationDynamicsAdvisorPort {
  propose(input: {
    readonly subject: DynamicsSubject;
    readonly snapshotDigest: string;
    readonly diagnosisDigest: string;
    readonly pressures: readonly StructuralPressure[];
  }): Promise<unknown>;
}

export interface AdvisorProposalFields {
  readonly kind: DynamicsProposalKind;
  readonly targets: readonly string[];
  readonly intent: string;
  readonly advisorProvenance: string;
}

export function parseAdvisorProposal(raw: unknown): AdvisorProposalFields {
  const object = dynObject(raw, "AdvisorProposal");
  dynExactKeys(object, ["kind", "targets", "intent", "advisorProvenance"], "AdvisorProposal");
  if (!DYNAMICS_PROPOSAL_KINDS.includes(object.kind as DynamicsProposalKind)) fail("advisor returned an unsupported proposal kind");
  if (!Array.isArray(object.targets)) fail("advisor targets must be an array");
  return Object.freeze({
    kind: object.kind as DynamicsProposalKind,
    targets: Object.freeze(object.targets.map((entry) => dynStableId(entry, "targets[]")).sort()),
    intent: dynNonEmpty(object.intent, "intent"),
    advisorProvenance: dynNonEmpty(object.advisorProvenance, "advisorProvenance"),
  });
}
