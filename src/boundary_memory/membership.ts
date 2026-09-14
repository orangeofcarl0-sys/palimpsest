/**
 * G10-L dynamic workspace membership — participant sets evolve through explicit,
 * governed lineage rather than a directly mutable set.
 *
 *   WorkspaceMembership ≠ OrganizationMembership ≠ CoalitionMembership
 *                      ≠ RuntimeScopeMembership ≠ Commitment ≠ AuthorityGrant
 *
 * v1 supports ONLY:
 *   ADD_PARTICIPANT                 — all current participants + the joining peer approve
 *   REMOVE_PARTICIPANT_CONSENSUAL   — all current participants (including the target) approve
 * There is NO involuntary expulsion / majority removal / suspension.
 *
 * Candidates branch from an exact membership revision; a later accepted change makes
 * sibling candidates stale. No last-write-wins, no auto-merge.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { PeerRef } from "../federation/peer.js";
import { parsePeerRef } from "../federation/peer.js";
import { bmDigest, bmExactKeys, bmFail, bmLiteral, bmNonEmpty, bmNonNegativeInteger, bmObject, bmStableId } from "./ref.js";

export const MEMBERSHIP_CANDIDATE_DOMAIN = "palimpsest.boundary-membership-candidate.v1";
export const MEMBERSHIP_REVISION_DOMAIN = "palimpsest.boundary-membership-revision.v1";

export type MembershipChangeKind = "ADD_PARTICIPANT" | "REMOVE_PARTICIPANT_CONSENSUAL";

export const MEMBERSHIP_CHANGE_KINDS: readonly MembershipChangeKind[] = Object.freeze([
  "ADD_PARTICIPANT",
  "REMOVE_PARTICIPANT_CONSENSUAL",
]);

export interface MembershipRevisionRef {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly revision: number;
  readonly revisionDigest: string;
}

export interface WorkspaceMembershipState {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly revision: number;
  readonly revisionDigest: string;
  readonly participants: readonly PeerRef[];
}

export interface MembershipChangeCandidate {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  /** The exact membership revision this change is based on. */
  readonly base: MembershipRevisionRef;
  readonly kind: MembershipChangeKind;
  readonly target: PeerRef;
  readonly author: PeerRef;
  /** Explicit canonical approver set: ALL must approve. */
  readonly requiredApprovers: readonly PeerRef[];
  readonly intent: string;
  readonly digest: string;
}

export interface WorkspaceMembershipRevision {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly revision: number;
  readonly revisionDigest: string;
  readonly kind: MembershipChangeKind;
  readonly target: PeerRef;
  readonly candidateDigest: string;
  readonly approvers: readonly PeerRef[];
  /** The participant set AFTER applying this revision (canonical order). */
  readonly participants: readonly PeerRef[];
  readonly baseRevision: number;
}

/* ------------------------------------------------------------------ *
 * Canonicalization
 * ------------------------------------------------------------------ */

export function canonicalParticipantSet(raw: unknown, what: string): readonly PeerRef[] {
  if (!Array.isArray(raw)) bmFail(`${what} must be an array`);
  const peers = raw.map((entry) => parsePeerRef(entry));
  const seen = new Set<string>();
  for (const peer of peers) {
    if (seen.has(peer.peerId)) bmFail(`${what}: duplicate peer "${peer.peerId}" (semantic set)`);
    seen.add(peer.peerId);
  }
  return Object.freeze([...peers].sort((a, b) => (a.peerId < b.peerId ? -1 : 1)));
}

export function sameParticipantSet(a: readonly PeerRef[], b: readonly PeerRef[]): boolean {
  return a.length === b.length && a.every((peer, index) => peer.peerId === b[index]!.peerId);
}

function participantKey(peer: PeerRef): string {
  return peer.peerId;
}

/** The genesis membership revision (revision 0) of a workspace. */
export function genesisMembershipRef(workspace: { readonly workspaceId: string; readonly participants: readonly PeerRef[] }): MembershipRevisionRef {
  const participants = canonicalParticipantSet(workspace.participants, "participants");
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId: workspace.workspaceId,
    revision: 0,
    revisionDigest: canonicalDigest({
      domain: MEMBERSHIP_REVISION_DOMAIN,
      workspaceId: workspace.workspaceId,
      revision: 0,
      genesis: true,
      participants,
    }),
  });
}

export function membershipRevisionRefsEqual(a: MembershipRevisionRef, b: MembershipRevisionRef): boolean {
  return a.workspaceId === b.workspaceId && a.revision === b.revision && a.revisionDigest === b.revisionDigest;
}

export function membershipCandidateDigestOf(input: Omit<MembershipChangeCandidate, "digest">): string {
  return canonicalDigest({
    domain: MEMBERSHIP_CANDIDATE_DOMAIN,
    workspaceId: input.workspaceId,
    base: input.base,
    kind: input.kind,
    target: input.target,
    author: input.author,
    requiredApprovers: input.requiredApprovers,
    intent: input.intent,
  });
}

export function membershipRevisionDigestOf(input: {
  readonly workspaceId: string;
  readonly revision: number;
  readonly kind: MembershipChangeKind;
  readonly target: PeerRef;
  readonly candidateDigest: string;
  readonly approvers: readonly PeerRef[];
  readonly participants: readonly PeerRef[];
  readonly previousRevisionDigest: string;
}): string {
  return canonicalDigest({
    domain: MEMBERSHIP_REVISION_DOMAIN,
    workspaceId: input.workspaceId,
    revision: input.revision,
    kind: input.kind,
    target: input.target,
    candidateDigest: input.candidateDigest,
    approvers: input.approvers,
    participants: input.participants,
    previous: input.previousRevisionDigest,
  });
}

/* ------------------------------------------------------------------ *
 * Parsers
 * ------------------------------------------------------------------ */

export function parseMembershipRevisionRef(raw: unknown, what = "MembershipRevisionRef"): MembershipRevisionRef {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["schemaVersion", "workspaceId", "revision", "revisionDigest"], what);
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId: bmStableId(object.workspaceId, `${what}.workspaceId`),
    revision: bmNonNegativeInteger(object.revision, `${what}.revision`),
    revisionDigest: bmDigest(object.revisionDigest, `${what}.revisionDigest`),
  });
}

export function parseMembershipChangeCandidate(raw: unknown, what = "MembershipChangeCandidate"): MembershipChangeCandidate {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["schemaVersion", "workspaceId", "base", "kind", "target", "author", "requiredApprovers", "intent", "digest"], what);
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  const base = parseMembershipRevisionRef(object.base, `${what}.base`);
  const workspaceId = bmStableId(object.workspaceId, `${what}.workspaceId`);
  if (base.workspaceId !== workspaceId) bmFail(`${what}.base must reference the same workspace`);
  const parsed = {
    schemaVersion: 1 as const,
    workspaceId,
    base,
    kind: bmLiteral(object.kind, MEMBERSHIP_CHANGE_KINDS, `${what}.kind`),
    target: parsePeerRef(object.target),
    author: parsePeerRef(object.author),
    requiredApprovers: canonicalParticipantSet(object.requiredApprovers, `${what}.requiredApprovers`),
    intent: bmNonEmpty(object.intent, `${what}.intent`),
  };
  if (parsed.requiredApprovers.length === 0) bmFail(`${what}.requiredApprovers must not be empty`);
  const digest = bmDigest(object.digest, `${what}.digest`);
  if (digest !== membershipCandidateDigestOf(parsed)) bmFail(`${what}.digest does not match its content`);
  return Object.freeze({ ...parsed, digest });
}

export function parseWorkspaceMembershipRevision(raw: unknown, what = "WorkspaceMembershipRevision"): WorkspaceMembershipRevision {
  const object = bmObject(raw, what);
  bmExactKeys(
    object,
    ["schemaVersion", "workspaceId", "revision", "revisionDigest", "kind", "target", "candidateDigest", "approvers", "participants", "baseRevision"],
    what,
  );
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId: bmStableId(object.workspaceId, `${what}.workspaceId`),
    revision: bmNonNegativeInteger(object.revision, `${what}.revision`),
    revisionDigest: bmDigest(object.revisionDigest, `${what}.revisionDigest`),
    kind: bmLiteral(object.kind, MEMBERSHIP_CHANGE_KINDS, `${what}.kind`),
    target: parsePeerRef(object.target),
    candidateDigest: bmDigest(object.candidateDigest, `${what}.candidateDigest`),
    approvers: canonicalParticipantSet(object.approvers, `${what}.approvers`),
    participants: canonicalParticipantSet(object.participants, `${what}.participants`),
    baseRevision: bmNonNegativeInteger(object.baseRevision, `${what}.baseRevision`),
  });
}

export function parseWorkspaceMembershipState(raw: unknown, what = "WorkspaceMembershipState"): WorkspaceMembershipState {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["schemaVersion", "workspaceId", "revision", "revisionDigest", "participants"], what);
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId: bmStableId(object.workspaceId, `${what}.workspaceId`),
    revision: bmNonNegativeInteger(object.revision, `${what}.revision`),
    revisionDigest: bmDigest(object.revisionDigest, `${what}.revisionDigest`),
    participants: canonicalParticipantSet(object.participants, `${what}.participants`),
  });
}

/** Apply one accepted membership revision to a participant set (pure). */
export function applyMembershipRevision(participants: readonly PeerRef[], revision: WorkspaceMembershipRevision): readonly PeerRef[] {
  const target = revision.target.peerId;
  if (revision.kind === "ADD_PARTICIPANT") {
    if (participants.some((peer) => peer.peerId === target)) return canonicalParticipantSet(participants, "participants");
    return canonicalParticipantSet([...participants, revision.target], "participants");
  }
  return canonicalParticipantSet(participants.filter((peer) => peer.peerId !== target), "participants");
}

/** Canonical required-approver set for a membership change at a given membership. */
export function requiredApproversFor(kind: MembershipChangeKind, participants: readonly PeerRef[], target: PeerRef): readonly PeerRef[] {
  if (kind === "ADD_PARTICIPANT") {
    const withTarget = participants.some((peer) => participantKey(peer) === participantKey(target)) ? participants : [...participants, target];
    return canonicalParticipantSet(withTarget, "requiredApprovers");
  }
  return canonicalParticipantSet(participants, "requiredApprovers");
}
