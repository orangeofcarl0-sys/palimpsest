/**
 * G10-K Boundary Memory artifacts — workspace, artifact, candidate revision,
 * accepted revision, the append-only event vocabulary, and the extensible
 * artifact-type registry.
 *
 *   Conversation ≠ SharedBoundaryState      Message ≠ BoundaryArtifact
 *   CandidateRevision ≠ AcceptedRevision    SupersededRevision ≠ DeletedHistory
 *
 * Every durable artifact is strict-parsed (exact fields, nested rejection, stable
 * ids, canonical digests) and deep-frozen. The kernel validates the ENVELOPE; a
 * `BoundaryArtifactTypeValidator` from the registry validates type-specific
 * CONTENT. An unknown type fails closed — never a silent pass, never `payload: any`.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { PeerRef } from "../federation/peer.js";
import { parsePeerRef } from "../federation/peer.js";
import type {
  OrganizationDefinition,
  OrganizationMemberRef,
  OrganizationNorm,
  OrganizationInteraction,
  RoleAssignment,
  RoleDefinition,
} from "../organization/definition.js";
import { materializeOrganizationDefinition } from "../organization/definition.js";
import type {
  AcceptedBoundaryRevisionRef,
  BoundaryArtifactTypeRef,
  BoundaryContentRef,
  BoundaryWorkspaceRef,
} from "./ref.js";
import {
  BOUNDARY_CONTENT_DIGEST_DOMAIN,
  bmDigest,
  bmExactKeys,
  bmFail,
  bmLiteral,
  bmNonEmpty,
  bmNonNegativeInteger,
  bmObject,
  bmStableId,
  boundaryArtifactTypeRefKey,
  boundaryContentRefKey,
  parseAcceptedBoundaryRevisionRef,
  parseBoundaryArtifactTypeRef,
  parseBoundaryContentRefs,
} from "./ref.js";
import type { MembershipChangeCandidate, WorkspaceMembershipRevision } from "./membership.js";
import { parseMembershipChangeCandidate, parseWorkspaceMembershipRevision } from "./membership.js";

export const BOUNDARY_WORKSPACE_DOMAIN = "palimpsest.boundary-workspace.v1";
export const BOUNDARY_ARTIFACT_DOMAIN = "palimpsest.boundary-artifact.v1";
export const BOUNDARY_CANDIDATE_DOMAIN = "palimpsest.boundary-candidate.v1";
export const BOUNDARY_REVISION_DOMAIN = "palimpsest.boundary-revision.v1";
export const BOUNDARY_CHAIN_DOMAIN = "palimpsest.boundary-chain.v1";
export const BOUNDARY_EVENT_DOMAIN = "palimpsest.boundary-event.v1";

/* ------------------------------------------------------------------ *
 * Canonical peer sets
 * ------------------------------------------------------------------ */

function peerKey(peer: PeerRef): string {
  return peer.peerId;
}

/** Canonical peer SET: exact PeerRefs, duplicates rejected, lexical order. */
export function canonicalPeerSet(raw: unknown, what: string, minimum: number): readonly PeerRef[] {
  if (!Array.isArray(raw)) bmFail(`${what} must be an array`);
  const peers = raw.map((entry, index) => parsePeerRef(entry));
  const seen = new Set<string>();
  for (const peer of peers) {
    if (seen.has(peerKey(peer))) bmFail(`${what}: duplicate peer "${peer.peerId}" (semantic set)`);
    seen.add(peerKey(peer));
  }
  if (peers.length < minimum) bmFail(`${what} requires at least ${minimum} distinct peer(s)`);
  return Object.freeze([...peers].sort((a, b) => (peerKey(a) < peerKey(b) ? -1 : 1)));
}

export function peerSetsEqual(a: readonly PeerRef[], b: readonly PeerRef[]): boolean {
  return a.length === b.length && a.every((peer, index) => peer.peerId === b[index]!.peerId);
}

/* ------------------------------------------------------------------ *
 * Workspace definition
 * ------------------------------------------------------------------ */

export interface BoundaryWorkspaceDefinition {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  /** FIXED participants in v1 (≥ 2), canonical order, immutable after open. */
  readonly participants: readonly PeerRef[];
  readonly purpose: string;
}

export function materializeBoundaryWorkspaceDefinition(input: {
  readonly workspaceId: string;
  readonly participants: readonly PeerRef[];
  readonly purpose: string;
}): BoundaryWorkspaceDefinition {
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId: bmStableId(input.workspaceId, "workspaceId"),
    participants: canonicalPeerSet(input.participants, "participants", 2),
    purpose: bmNonEmpty(input.purpose, "purpose"),
  });
}

export function parseBoundaryWorkspaceDefinition(raw: unknown, what = "BoundaryWorkspaceDefinition"): BoundaryWorkspaceDefinition {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["schemaVersion", "workspaceId", "participants", "purpose"], what);
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  return materializeBoundaryWorkspaceDefinition({
    workspaceId: object.workspaceId as string,
    participants: object.participants as readonly PeerRef[],
    purpose: object.purpose as string,
  });
}

export function isWorkspaceParticipant(workspace: BoundaryWorkspaceDefinition, peer: PeerRef): boolean {
  return workspace.participants.some((entry) => entry.peerId === peer.peerId);
}

/* ------------------------------------------------------------------ *
 * Artifact definition
 * ------------------------------------------------------------------ */

export interface BoundaryArtifactDefinition {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly type: BoundaryArtifactTypeRef;
  readonly title: string;
}

export function materializeBoundaryArtifactDefinition(input: {
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly type: BoundaryArtifactTypeRef;
  readonly title: string;
}): BoundaryArtifactDefinition {
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId: bmStableId(input.workspaceId, "workspaceId"),
    artifactId: bmStableId(input.artifactId, "artifactId"),
    type: parseBoundaryArtifactTypeRef(input.type, "type"),
    title: bmNonEmpty(input.title, "title"),
  });
}

export function parseBoundaryArtifactDefinition(raw: unknown, what = "BoundaryArtifactDefinition"): BoundaryArtifactDefinition {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["schemaVersion", "workspaceId", "artifactId", "type", "title"], what);
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  return materializeBoundaryArtifactDefinition({
    workspaceId: object.workspaceId as string,
    artifactId: object.artifactId as string,
    type: object.type as BoundaryArtifactTypeRef,
    title: object.title as string,
  });
}

/* ------------------------------------------------------------------ *
 * Artifact type registry (kernel validates the envelope; the registry content)
 * ------------------------------------------------------------------ */

export interface BoundaryArtifactTypeValidator {
  readonly type: BoundaryArtifactTypeRef;
  /** Validate + canonicalize type-specific content, or throw. Deep-frozen result. */
  validate(content: unknown): unknown;
}

export interface BoundaryArtifactTypeRegistry {
  validator(type: BoundaryArtifactTypeRef): BoundaryArtifactTypeValidator | undefined;
}

export function makeBoundaryArtifactTypeRegistry(
  validators: readonly BoundaryArtifactTypeValidator[],
): BoundaryArtifactTypeRegistry {
  const byKey = new Map<string, BoundaryArtifactTypeValidator>();
  for (const validator of validators) {
    byKey.set(boundaryArtifactTypeRefKey(validator.type), validator);
  }
  return {
    validator: (type) => byKey.get(boundaryArtifactTypeRefKey(type)),
  };
}

/** Domain-separated digest over (type, canonical content). */
export function boundaryContentDigestOf(type: BoundaryArtifactTypeRef, content: unknown): string {
  return canonicalDigest({ domain: BOUNDARY_CONTENT_DIGEST_DOMAIN, type, content });
}

/* ------------------------------------------------------------------ *
 * Builtin artifact types
 * ------------------------------------------------------------------ */

export const BOUNDARY_STATEMENT_TAGS = Object.freeze([
  "requirement",
  "constraint",
  "assumption",
  "open_question",
  "decision",
] as const);

export type BoundaryStatementTag = (typeof BOUNDARY_STATEMENT_TAGS)[number];

export interface BoundaryStatementContent {
  readonly statement: string;
  readonly tags: readonly BoundaryStatementTag[];
  readonly references: readonly BoundaryContentRef[];
}

export interface BoundaryInterfaceOperation {
  readonly operationId: string;
  readonly semantics: string;
}

export interface BoundaryInterfaceContent {
  readonly interfaceId: string;
  readonly description: string;
  readonly operations: readonly BoundaryInterfaceOperation[];
  readonly references: readonly BoundaryContentRef[];
}

export const BOUNDARY_COMPATIBILITY_STANDINGS = Object.freeze(["compatible", "incompatible", "unknown"] as const);
export type BoundaryCompatibilityStanding = (typeof BOUNDARY_COMPATIBILITY_STANDINGS)[number];

export interface BoundaryCompatibilityContent {
  readonly subject: string;
  readonly requirement: string;
  readonly compatibility: BoundaryCompatibilityStanding;
  readonly references: readonly BoundaryContentRef[];
}

/**
 * `organization-blueprint.v1` content — the authoring source for a formalization.
 * It reuses the OrganizationDefinition typed schema/validators verbatim (no
 * weakened role/norm/assignment schema) but is NOT an OrganizationDefinition:
 * accepting it writes ZERO canonical organization state.
 */
export interface OrganizationBlueprintContent {
  readonly organizationDefinitionId: string;
  readonly mission: string;
  readonly members: readonly OrganizationMemberRef[];
  readonly roles: readonly RoleDefinition[];
  readonly assignments: readonly RoleAssignment[];
  readonly norms: readonly OrganizationNorm[];
  readonly interactions: readonly OrganizationInteraction[];
  readonly references: readonly BoundaryContentRef[];
}

function parseStatement(raw: unknown): BoundaryStatementContent {
  const object = bmObject(raw, "boundary.statement.v1");
  bmExactKeys(object, ["statement", "tags", "references"], "boundary.statement.v1");
  if (!Array.isArray(object.tags)) bmFail("boundary.statement.v1.tags must be an array");
  const tags = object.tags.map((entry, index) => bmLiteral(entry, BOUNDARY_STATEMENT_TAGS, `tags[${index}]`));
  const seen = new Set<string>();
  for (const tag of tags) {
    if (seen.has(tag)) bmFail(`boundary.statement.v1: duplicate tag "${tag}" (semantic set)`);
    seen.add(tag);
  }
  return Object.freeze({
    statement: bmNonEmpty(object.statement, "statement"),
    tags: Object.freeze([...tags].sort()),
    references: parseBoundaryContentRefs(object.references, "references"),
  });
}

function parseInterface(raw: unknown): BoundaryInterfaceContent {
  const object = bmObject(raw, "boundary.interface.v1");
  bmExactKeys(object, ["interfaceId", "description", "operations", "references"], "boundary.interface.v1");
  if (!Array.isArray(object.operations)) bmFail("boundary.interface.v1.operations must be an array");
  const operations = object.operations.map((entry, index) => {
    const item = bmObject(entry, `operations[${index}]`);
    bmExactKeys(item, ["operationId", "semantics"], `operations[${index}]`);
    return Object.freeze({
      operationId: bmStableId(item.operationId, `operations[${index}].operationId`),
      semantics: bmNonEmpty(item.semantics, `operations[${index}].semantics`),
    });
  });
  const seen = new Set<string>();
  for (const operation of operations) {
    if (seen.has(operation.operationId)) bmFail(`boundary.interface.v1: duplicate operationId "${operation.operationId}"`);
    seen.add(operation.operationId);
  }
  return Object.freeze({
    interfaceId: bmStableId(object.interfaceId, "interfaceId"),
    description: bmNonEmpty(object.description, "description"),
    operations: Object.freeze([...operations].sort((a, b) => (a.operationId < b.operationId ? -1 : 1))),
    references: parseBoundaryContentRefs(object.references, "references"),
  });
}

function parseCompatibility(raw: unknown): BoundaryCompatibilityContent {
  const object = bmObject(raw, "boundary.compatibility.v1");
  bmExactKeys(object, ["subject", "requirement", "compatibility", "references"], "boundary.compatibility.v1");
  return Object.freeze({
    subject: bmNonEmpty(object.subject, "subject"),
    requirement: bmNonEmpty(object.requirement, "requirement"),
    compatibility: bmLiteral(object.compatibility, BOUNDARY_COMPATIBILITY_STANDINGS, "compatibility"),
    references: parseBoundaryContentRefs(object.references, "references"),
  });
}

export function parseOrganizationBlueprintContent(raw: unknown, what = "organization-blueprint.v1"): OrganizationBlueprintContent {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["organizationDefinitionId", "mission", "members", "roles", "assignments", "norms", "interactions", "references"], what);
  const organizationDefinitionId = bmStableId(object.organizationDefinitionId, "organizationDefinitionId");
  if (!Array.isArray(object.members)) bmFail(`${what}.members must be an array`);
  const members = object.members as readonly OrganizationMemberRef[];
  if (!Array.isArray(object.roles) || !Array.isArray(object.assignments)) bmFail(`${what}.roles/assignments must be arrays`);
  if (!Array.isArray(object.norms) || !Array.isArray(object.interactions)) bmFail(`${what}.norms/interactions must be arrays`);
  // Reuse the OrganizationDefinition validators verbatim: this is the ONLY
  // structural guarantee, and it is the same one a canonical organization gets.
  const definition = materializeOrganizationDefinition({
    organizationDefinitionId,
    revision: 0,
    mission: object.mission as string,
    members,
    roles: object.roles as readonly RoleDefinition[],
    assignments: object.assignments as readonly RoleAssignment[],
    norms: object.norms as readonly OrganizationNorm[],
    interactions: object.interactions as readonly OrganizationInteraction[],
  });
  return Object.freeze({
    organizationDefinitionId,
    mission: definition.mission,
    members: definition.members,
    roles: definition.roles,
    assignments: definition.assignments,
    norms: definition.norms,
    interactions: definition.interactions,
    references: parseBoundaryContentRefs(object.references, "references"),
  });
}

/** The canonical OrganizationDefinition (revision 0) an accepted blueprint denotes. */
export function organizationDefinitionOfBlueprint(content: OrganizationBlueprintContent): OrganizationDefinition {
  return materializeOrganizationDefinition({
    organizationDefinitionId: content.organizationDefinitionId,
    revision: 0,
    mission: content.mission,
    members: content.members,
    roles: content.roles,
    assignments: content.assignments,
    norms: content.norms,
    interactions: content.interactions,
  });
}

const statementType: BoundaryArtifactTypeRef = Object.freeze({ typeId: "boundary.statement", version: "v1" });
const interfaceType: BoundaryArtifactTypeRef = Object.freeze({ typeId: "boundary.interface", version: "v1" });
const compatibilityType: BoundaryArtifactTypeRef = Object.freeze({ typeId: "boundary.compatibility", version: "v1" });
export const ORGANIZATION_BLUEPRINT_TYPE: BoundaryArtifactTypeRef = Object.freeze({ typeId: "boundary.organization-blueprint", version: "v1" });

export const BUILTIN_BOUNDARY_ARTIFACT_TYPES: readonly BoundaryArtifactTypeRef[] = Object.freeze([
  statementType,
  interfaceType,
  compatibilityType,
  ORGANIZATION_BLUEPRINT_TYPE,
]);

/** Default registry. NOT a claim that the type taxonomy is complete. */
export function makeBuiltinBoundaryArtifactTypeRegistry(): BoundaryArtifactTypeRegistry {
  return makeBoundaryArtifactTypeRegistry([
    { type: statementType, validate: parseStatement },
    { type: interfaceType, validate: parseInterface },
    { type: compatibilityType, validate: parseCompatibility },
    { type: ORGANIZATION_BLUEPRINT_TYPE, validate: parseOrganizationBlueprintContent },
  ]);
}

export function defaultBoundaryArtifactTypeRegistry(): BoundaryArtifactTypeRegistry {
  return makeBuiltinBoundaryArtifactTypeRegistry();
}

/* ------------------------------------------------------------------ *
 * Candidate revision
 * ------------------------------------------------------------------ */

export interface BoundaryCandidateRevision {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly type: BoundaryArtifactTypeRef;
  /** Exact accepted base; null ONLY for the first revision of an artifact. */
  readonly base: AcceptedBoundaryRevisionRef | null;
  readonly content: unknown;
  readonly contentDigest: string;
  readonly author: PeerRef;
  /** Explicit, canonical, ≥ 1 acceptor that is NOT the author (§Q8/BM-A10). */
  readonly requiredAcceptors: readonly PeerRef[];
  readonly intent: string;
  readonly digest: string;
}

export function candidateDigestOf(input: Omit<BoundaryCandidateRevision, "digest">): string {
  return canonicalDigest({
    domain: BOUNDARY_CANDIDATE_DOMAIN,
    workspaceId: input.workspaceId,
    artifactId: input.artifactId,
    type: input.type,
    base: input.base,
    contentDigest: input.contentDigest,
    author: input.author,
    requiredAcceptors: input.requiredAcceptors,
    intent: input.intent,
  });
}

export function parseBoundaryCandidateRevision(raw: unknown, what = "BoundaryCandidateRevision"): BoundaryCandidateRevision {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["schemaVersion", "workspaceId", "artifactId", "type", "base", "content", "contentDigest", "author", "requiredAcceptors", "intent", "digest"], what);
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  const type = parseBoundaryArtifactTypeRef(object.type, `${what}.type`);
  const contentDigest = bmDigest(object.contentDigest, `${what}.contentDigest`);
  if (boundaryContentDigestOf(type, object.content) !== contentDigest) bmFail(`${what}.contentDigest does not match its content`);
  const base = object.base === null ? null : parseAcceptedBoundaryRevisionRef(object.base, `${what}.base`);
  const parsedBase = {
    schemaVersion: 1 as const,
    workspaceId: bmStableId(object.workspaceId, `${what}.workspaceId`),
    artifactId: bmStableId(object.artifactId, `${what}.artifactId`),
    type,
    base,
    content: object.content,
    contentDigest,
    author: parsePeerRef(object.author),
    requiredAcceptors: canonicalPeerSet(object.requiredAcceptors, `${what}.requiredAcceptors`, 1),
    intent: bmNonEmpty(object.intent, `${what}.intent`),
  };
  if (base !== null && (base.workspaceId !== parsedBase.workspaceId || base.artifactId !== parsedBase.artifactId)) {
    bmFail(`${what}.base must reference the same workspace artifact`);
  }
  if (parsedBase.requiredAcceptors.every((peer) => peer.peerId === parsedBase.author.peerId)) {
    // v1 supports joint-accepted artifacts only: an author can never be the sole
    // required acceptor, so acceptance is never a unilateral act for others (§Q8/BM-A10).
    bmFail(`${what}: requiredAcceptors must include at least one peer other than the author (joint acceptance only in v1)`);
  }
  const digest = bmDigest(object.digest, `${what}.digest`);
  if (digest !== candidateDigestOf(parsedBase)) bmFail(`${what}.digest does not match its content`);
  return Object.freeze({ ...parsedBase, digest });
}

export function candidateHasAcceptor(candidate: BoundaryCandidateRevision, peer: PeerRef): boolean {
  return candidate.requiredAcceptors.some((entry) => entry.peerId === peer.peerId);
}

/* ------------------------------------------------------------------ *
 * Accepted revision
 * ------------------------------------------------------------------ */

export interface AcceptedBoundaryRevision {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly revision: number;
  readonly candidateDigest: string;
  readonly revisionDigest: string;
  readonly acceptors: readonly PeerRef[];
  readonly base: AcceptedBoundaryRevisionRef | null;
}

export function acceptedRevisionDigestOf(input: {
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly revision: number;
  readonly candidateDigest: string;
  readonly acceptors: readonly PeerRef[];
  readonly previousRevisionDigest: string | null;
}): string {
  return canonicalDigest({
    domain: BOUNDARY_REVISION_DOMAIN,
    workspaceId: input.workspaceId,
    artifactId: input.artifactId,
    revision: input.revision,
    candidateDigest: input.candidateDigest,
    acceptors: input.acceptors,
    previous: input.previousRevisionDigest,
  });
}

export function parseAcceptedBoundaryRevision(raw: unknown, what = "AcceptedBoundaryRevision"): AcceptedBoundaryRevision {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["schemaVersion", "workspaceId", "artifactId", "revision", "candidateDigest", "revisionDigest", "acceptors", "base"], what);
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  const base = object.base === null ? null : parseAcceptedBoundaryRevisionRef(object.base, `${what}.base`);
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId: bmStableId(object.workspaceId, `${what}.workspaceId`),
    artifactId: bmStableId(object.artifactId, `${what}.artifactId`),
    revision: bmNonNegativeInteger(object.revision, `${what}.revision`),
    candidateDigest: bmDigest(object.candidateDigest, `${what}.candidateDigest`),
    revisionDigest: bmDigest(object.revisionDigest, `${what}.revisionDigest`),
    acceptors: canonicalPeerSet(object.acceptors, `${what}.acceptors`, 1),
    base,
  });
}

export function acceptedRevisionRefOf(revision: AcceptedBoundaryRevision): AcceptedBoundaryRevisionRef {
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId: revision.workspaceId,
    artifactId: revision.artifactId,
    revision: revision.revision,
    candidateDigest: revision.candidateDigest,
    revisionDigest: revision.revisionDigest,
  });
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export type BoundaryEventType =
  | "WORKSPACE_OPENED"
  | "WORKSPACE_CLOSED"
  | "ARTIFACT_CREATED"
  | "CANDIDATE_PROPOSED"
  | "CANDIDATE_ACCEPTED"
  | "CANDIDATE_REJECTED"
  | "REVISION_ACCEPTED"
  | "MEMBERSHIP_PROPOSED"
  | "MEMBERSHIP_APPROVED"
  | "MEMBERSHIP_REJECTED"
  | "MEMBERSHIP_REVISION_ACCEPTED";

export interface BoundaryEventPayloads {
  readonly WORKSPACE_OPENED: { readonly workspace: BoundaryWorkspaceDefinition };
  readonly WORKSPACE_CLOSED: { readonly reason: string };
  readonly ARTIFACT_CREATED: { readonly artifact: BoundaryArtifactDefinition };
  readonly CANDIDATE_PROPOSED: { readonly candidate: BoundaryCandidateRevision };
  readonly CANDIDATE_ACCEPTED: {
    readonly workspaceId: string;
    readonly artifactId: string;
    readonly candidateDigest: string;
    readonly acceptedBy: PeerRef;
    readonly authenticated: boolean;
  };
  readonly CANDIDATE_REJECTED: {
    readonly workspaceId: string;
    readonly artifactId: string;
    readonly candidateDigest: string;
    readonly rejectedBy: PeerRef;
    readonly authenticated: boolean;
  };
  readonly REVISION_ACCEPTED: { readonly revision: AcceptedBoundaryRevision };
  readonly MEMBERSHIP_PROPOSED: { readonly candidate: MembershipChangeCandidate };
  readonly MEMBERSHIP_APPROVED: {
    readonly workspaceId: string;
    readonly candidateDigest: string;
    readonly approvedBy: PeerRef;
    readonly authenticated: boolean;
  };
  readonly MEMBERSHIP_REJECTED: {
    readonly workspaceId: string;
    readonly candidateDigest: string;
    readonly rejectedBy: PeerRef;
    readonly authenticated: boolean;
  };
  readonly MEMBERSHIP_REVISION_ACCEPTED: { readonly revision: WorkspaceMembershipRevision };
}

export type BoundaryEventPayloadParser = (payload: unknown) => unknown;
export type BoundaryEventParsers = Readonly<Record<string, BoundaryEventPayloadParser>>;

function decisionPayload(payload: unknown, what: string): { workspaceId: string; artifactId: string; candidateDigest: string; peer: PeerRef; authenticated: boolean } {
  const object = bmObject(payload, what);
  const peerKey = what === "CANDIDATE_ACCEPTED" ? "acceptedBy" : "rejectedBy";
  bmExactKeys(object, ["workspaceId", "artifactId", "candidateDigest", peerKey, "authenticated"], what);
  if (typeof object.authenticated !== "boolean") bmFail(`${what}.authenticated must be a boolean`);
  return {
    workspaceId: bmStableId(object.workspaceId, `${what}.workspaceId`),
    artifactId: bmStableId(object.artifactId, `${what}.artifactId`),
    candidateDigest: bmDigest(object.candidateDigest, `${what}.candidateDigest`),
    peer: parsePeerRef(object[peerKey]),
    authenticated: object.authenticated,
  };
}

export const BOUNDARY_EVENT_PARSERS: BoundaryEventParsers = Object.freeze({
  WORKSPACE_OPENED: (payload: unknown) => {
    const object = bmObject(payload, "WORKSPACE_OPENED");
    bmExactKeys(object, ["workspace"], "WORKSPACE_OPENED");
    return Object.freeze({ workspace: parseBoundaryWorkspaceDefinition(object.workspace) });
  },
  WORKSPACE_CLOSED: (payload: unknown) => {
    const object = bmObject(payload, "WORKSPACE_CLOSED");
    bmExactKeys(object, ["reason"], "WORKSPACE_CLOSED");
    return Object.freeze({ reason: bmNonEmpty(object.reason, "reason") });
  },
  ARTIFACT_CREATED: (payload: unknown) => {
    const object = bmObject(payload, "ARTIFACT_CREATED");
    bmExactKeys(object, ["artifact"], "ARTIFACT_CREATED");
    return Object.freeze({ artifact: parseBoundaryArtifactDefinition(object.artifact) });
  },
  CANDIDATE_PROPOSED: (payload: unknown) => {
    const object = bmObject(payload, "CANDIDATE_PROPOSED");
    bmExactKeys(object, ["candidate"], "CANDIDATE_PROPOSED");
    return Object.freeze({ candidate: parseBoundaryCandidateRevision(object.candidate) });
  },
  CANDIDATE_ACCEPTED: (payload: unknown) => {
    const parsed = decisionPayload(payload, "CANDIDATE_ACCEPTED");
    return Object.freeze({ workspaceId: parsed.workspaceId, artifactId: parsed.artifactId, candidateDigest: parsed.candidateDigest, acceptedBy: parsed.peer, authenticated: parsed.authenticated });
  },
  CANDIDATE_REJECTED: (payload: unknown) => {
    const parsed = decisionPayload(payload, "CANDIDATE_REJECTED");
    return Object.freeze({ workspaceId: parsed.workspaceId, artifactId: parsed.artifactId, candidateDigest: parsed.candidateDigest, rejectedBy: parsed.peer, authenticated: parsed.authenticated });
  },
  REVISION_ACCEPTED: (payload: unknown) => {
    const object = bmObject(payload, "REVISION_ACCEPTED");
    bmExactKeys(object, ["revision"], "REVISION_ACCEPTED");
    return Object.freeze({ revision: parseAcceptedBoundaryRevision(object.revision) });
  },
  MEMBERSHIP_PROPOSED: (payload: unknown) => {
    const object = bmObject(payload, "MEMBERSHIP_PROPOSED");
    bmExactKeys(object, ["candidate"], "MEMBERSHIP_PROPOSED");
    return Object.freeze({ candidate: parseMembershipChangeCandidate(object.candidate) });
  },
  MEMBERSHIP_APPROVED: (payload: unknown) => {
    const parsed = membershipDecisionPayload(payload, "MEMBERSHIP_APPROVED", "approvedBy");
    return Object.freeze({ workspaceId: parsed.workspaceId, candidateDigest: parsed.candidateDigest, approvedBy: parsed.peer, authenticated: parsed.authenticated });
  },
  MEMBERSHIP_REJECTED: (payload: unknown) => {
    const parsed = membershipDecisionPayload(payload, "MEMBERSHIP_REJECTED", "rejectedBy");
    return Object.freeze({ workspaceId: parsed.workspaceId, candidateDigest: parsed.candidateDigest, rejectedBy: parsed.peer, authenticated: parsed.authenticated });
  },
  MEMBERSHIP_REVISION_ACCEPTED: (payload: unknown) => {
    const object = bmObject(payload, "MEMBERSHIP_REVISION_ACCEPTED");
    bmExactKeys(object, ["revision"], "MEMBERSHIP_REVISION_ACCEPTED");
    return Object.freeze({ revision: parseWorkspaceMembershipRevision(object.revision) });
  },
});

function membershipDecisionPayload(payload: unknown, what: string, peerKey: string): { workspaceId: string; candidateDigest: string; peer: PeerRef; authenticated: boolean } {
  const object = bmObject(payload, what);
  bmExactKeys(object, ["workspaceId", "candidateDigest", peerKey, "authenticated"], what);
  if (typeof object.authenticated !== "boolean") bmFail(`${what}.authenticated must be a boolean`);
  return {
    workspaceId: bmStableId(object.workspaceId, `${what}.workspaceId`),
    candidateDigest: bmDigest(object.candidateDigest, `${what}.candidateDigest`),
    peer: parsePeerRef(object[peerKey]),
    authenticated: object.authenticated,
  };
}

export function boundaryChainDigest(input: {
  readonly workspaceId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly previousChainDigest: string | null;
}): string {
  return canonicalDigest({
    domain: BOUNDARY_CHAIN_DOMAIN,
    workspaceId: input.workspaceId,
    seq: input.seq,
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    previous: input.previousChainDigest,
  });
}

export function boundaryEventIdOf(type: string, workspaceId: string, payload: unknown): string {
  return `bev-${canonicalDigest({ domain: BOUNDARY_EVENT_DOMAIN, type, workspaceId, payload }).slice(0, 32)}`;
}

/* ------------------------------------------------------------------ *
 * Derived candidate standing (§16) — always from append-only history.
 * ------------------------------------------------------------------ */

export type CandidateStanding = "PROPOSED" | "PARTIALLY_ACCEPTED" | "ACCEPTED" | "REJECTED" | "STALE" | "SUPERSEDED";

/** Derived membership-change standing — always from append-only history. */
export type MembershipStanding = "PROPOSED" | "PARTIALLY_APPROVED" | "ACCEPTED" | "REJECTED" | "STALE" | "SUPERSEDED";

/** A basis into a workspace's canonical boundary history (for Dynamics grounding). */
export interface BoundaryWorkspaceBasisRef {
  readonly workspace: BoundaryWorkspaceRef;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

/**
 * G10-L mechanical boundary observation. Counts are MECHANICAL FACTS about
 * canonical BoundaryMemory history — never collaboration quality, alignment,
 * trust, correctness, or a scalar score. `commitmentRefCount` is intentionally
 * absent: commitments are coordination truth, not boundary truth.
 */
export interface BoundaryObservation {
  readonly workspaceId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
  readonly lifecycle: "OPEN" | "CLOSED";
  readonly participantCount: number;
  readonly membershipRevision: number;
  readonly artifactCount: number;
  readonly candidateCount: number;
  readonly pendingCandidateCount: number;
  readonly staleCandidateCount: number;
  readonly rejectedCandidateCount: number;
  readonly acceptedRevisionCount: number;
  readonly acceptedArtifactCount: number;
  readonly branchCount: number;
  readonly revisionChurn: number;
  readonly membershipChurn: number;
  readonly blueprintAccepted: boolean;
}

/** Canonical order of content refs for a set (used by views). */
export function sortedContentRefKeys(refs: readonly BoundaryContentRef[]): readonly string[] {
  return Object.freeze([...refs.map(boundaryContentRefKey)].sort());
}
