/**
 * G10-F1 formal Coalition grounding (§30–§44).
 *
 * A Coalition is a temporary, purpose/scope-driven set of collaborating peers
 * derived from ACTIVE collaboration relations. It is normally overlapping,
 * temporary, derived, and scope-bound (§31) — NOT a durable Organization.
 *
 *   Coalition = derived snapshot over coordination history
 *   Coalition ≠ Organization          (§41 — never auto-promoted)
 *   Coalition ≠ membership authority  (§32)
 *   Coalition has no manager          (§39)
 *
 * `CoalitionSnapshot` (§33) is an immutable derived artifact identified by
 *   scope + coordination basis + content digest    (§34 — no durable CoalitionId)
 * and records the exact coordination-history basis it was derived from (§36),
 * so a snapshot over older history is recognizably historical rather than
 * silently stale.
 *
 * Membership (§37) derives ONLY from explicit active relations:
 *   - holders of ACTIVE commitments whose scope matches;
 *   - active participations in the scope are recorded as provenance, but
 *     Participation is Activation-anchored and carries no PeerRef, so it
 *     contributes NO peer member (Runtime participation ≠ peer identity).
 * It is NEVER inferred from messages, acks, advertisements, contact
 * candidates, or user focus.
 *
 * `CoalitionProvenanceRef` (§42) lets later Organization authoring cite a
 * snapshot's digest: provenance only — this is NOT automatic promotion and
 * creates no Organization.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { CoordinationEvent, CoordinationStore } from "../coordination/store.js";
import { CoordinationStoreError } from "../coordination/errors.js";
import {
  asObject,
  requireNonNegativeInteger,
  requireStableId,
  requireString,
  strictObject,
} from "../coordination/strict.js";
import type { AttemptRef, ParticipationId } from "../coordination/index.js";
import type { PeerRef } from "./peer.js";
import { parsePeerRef } from "./peer.js";
import type { CommitmentId, CommitmentOffer, CommitmentScope } from "./commitment.js";

export const COALITION_BASIS_DIGEST_DOMAIN = "palimpsest.coalition-basis.v1";
export const COALITION_SNAPSHOT_DIGEST_DOMAIN = "palimpsest.coalition-snapshot.v1";

/** The grounded collaboration scope a coalition forms around (§35). */
export type CoalitionScope =
  | { readonly kind: "attempt_participation"; readonly attempt: AttemptRef }
  | { readonly kind: "contact_need"; readonly contactNeedId: string };

/** Deterministic basis reference into coordination history (§36). */
export interface CoordinationBasisRef {
  readonly throughSeq: number;
  readonly digest: string;
}

/**
 * An immutable derived coalition snapshot (§33/§34). No `coalitionId`: a
 * snapshot is identified by scope + basis + content digest.
 */
export interface CoalitionSnapshot {
  readonly schemaVersion: 1;
  readonly scope: CoalitionScope;
  readonly basis: CoordinationBasisRef;
  readonly members: readonly PeerRef[];
  readonly sourceCommitments: readonly CommitmentId[];
  readonly sourceParticipations: readonly ParticipationId[];
  readonly digest: string;
}

/** Provenance-only citation of a coalition snapshot (§42) — never promotion. */
export interface CoalitionProvenanceRef {
  readonly snapshotDigest: string;
  readonly basis: CoordinationBasisRef;
}

/* ------------------------------------------------------------------ *
 * Scope
 * ------------------------------------------------------------------ */

const ATTEMPT_SCOPE_KEYS = ["kind", "attempt"] as const;
const ATTEMPT_REF_KEYS = ["projectId", "attemptId"] as const;
const CONTACT_SCOPE_KEYS = ["kind", "contactNeedId"] as const;

export function coalitionScopeOfCommitmentScope(scope: CommitmentScope): CoalitionScope {
  return scope.kind === "attempt_participation"
    ? Object.freeze({ kind: "attempt_participation" as const, attempt: Object.freeze({ ...scope.attempt }) })
    : Object.freeze({ kind: "contact_need" as const, contactNeedId: scope.contactNeedId });
}

/** Strict CoalitionScope parser (exact fields per kind). */
export function parseCoalitionScope(raw: unknown, what = "scope"): CoalitionScope {
  const record = asObject(raw, what);
  if (record.kind === "attempt_participation") {
    const scoped = strictObject(raw, { allowed: ATTEMPT_SCOPE_KEYS, required: ATTEMPT_SCOPE_KEYS }, what);
    const attempt = strictObject(
      scoped.attempt,
      { allowed: ATTEMPT_REF_KEYS, required: ATTEMPT_REF_KEYS },
      `${what}.attempt`,
    );
    return Object.freeze({
      kind: "attempt_participation" as const,
      attempt: Object.freeze({
        projectId: requireStableId(attempt.projectId, `${what}.attempt.projectId`),
        attemptId: requireStableId(attempt.attemptId, `${what}.attempt.attemptId`),
      }),
    });
  }
  if (record.kind === "contact_need") {
    const scoped = strictObject(raw, { allowed: CONTACT_SCOPE_KEYS, required: CONTACT_SCOPE_KEYS }, what);
    return Object.freeze({
      kind: "contact_need" as const,
      contactNeedId: requireStableId(scoped.contactNeedId, `${what}.contactNeedId`),
    });
  }
  throw new CoordinationStoreError(`${what}.kind must be one of attempt_participation, contact_need`);
}

/** Canonical matching key for a coalition scope. */
export function coalitionScopeKey(scope: CoalitionScope): string {
  return scope.kind === "attempt_participation"
    ? `attempt:${scope.attempt.projectId}/${scope.attempt.attemptId}`
    : `contact_need:${scope.contactNeedId}`;
}

/** Canonical matching key for a commitment scope (same grounded vocabulary). */
export function commitmentScopeKey(scope: CommitmentScope): string {
  return scope.kind === "attempt_participation"
    ? `attempt:${scope.attempt.projectId}/${scope.attempt.attemptId}`
    : `contact_need:${scope.contactNeedId}`;
}

/* ------------------------------------------------------------------ *
 * Basis
 * ------------------------------------------------------------------ */

/** Deterministic history basis: the events the snapshot was derived from (§36). */
export function coordinationBasisOf(events: readonly CoordinationEvent[]): CoordinationBasisRef {
  const throughSeq = events.reduce((max, event) => (event.seq > max ? event.seq : max), 0);
  const digest = canonicalDigest({
    domain: COALITION_BASIS_DIGEST_DOMAIN,
    events: events
      .filter((event) => event.seq <= throughSeq)
      .map((event) => ({
        eventId: event.eventId,
        seq: event.seq,
        projectId: event.projectId,
        type: event.type,
        payload: event.payload,
      })),
  });
  return Object.freeze({ throughSeq, digest });
}

function parseBasis(raw: unknown, what: string): CoordinationBasisRef {
  const record = strictObject(raw, { allowed: ["throughSeq", "digest"], required: ["throughSeq", "digest"] }, what);
  return Object.freeze({
    throughSeq: requireNonNegativeInteger(record.throughSeq, `${what}.throughSeq`),
    digest: requireString(record.digest, `${what}.digest`),
  });
}

/* ------------------------------------------------------------------ *
 * Active relations (shared derivation)
 * ------------------------------------------------------------------ */

export interface ActiveCommitmentRecord {
  readonly commitmentId: CommitmentId;
  readonly offer: CommitmentOffer;
  readonly holder: PeerRef;
  readonly active: boolean;
}

/**
 * Derive active/inactive commitment records from coordination history. The
 * ONE active-commitment derivation, shared by the coalition snapshot and the
 * legacy `coalitionView` projection.
 */
export function activeCommitmentRecords(events: readonly CoordinationEvent[]): readonly ActiveCommitmentRecord[] {
  const byId = new Map<CommitmentId, ActiveCommitmentRecord>();
  for (const event of events) {
    switch (event.type) {
      case "COMMITMENT_OFFERED": {
        const offer = (event.payload as { offer: CommitmentOffer }).offer;
        byId.set(offer.commitmentId, {
          commitmentId: offer.commitmentId,
          offer,
          holder: offer.proposedHolder,
          active: false,
        });
        break;
      }
      case "COMMITMENT_ACCEPTED": {
        const payload = event.payload as { commitmentId: CommitmentId; acceptedBy: PeerRef };
        const existing = byId.get(payload.commitmentId);
        if (existing !== undefined) {
          byId.set(payload.commitmentId, { ...existing, holder: payload.acceptedBy, active: true });
        }
        break;
      }
      case "COMMITMENT_REJECTED":
      case "COMMITMENT_RELEASED":
      case "COMMITMENT_SUPERSEDED": {
        const payload = event.payload as { commitmentId: CommitmentId };
        const existing = byId.get(payload.commitmentId);
        if (existing !== undefined) {
          byId.set(payload.commitmentId, { ...existing, active: false });
        }
        break;
      }
      default:
        break;
    }
  }
  return Object.freeze([...byId.values()]);
}

/** Active participation ids relevant to the scope (Attempt-scoped only). */
export function activeParticipationIdsInScope(
  events: readonly CoordinationEvent[],
  scope: CoalitionScope,
): readonly ParticipationId[] {
  if (scope.kind !== "attempt_participation") return Object.freeze([]);
  const ended = new Set<ParticipationId>();
  const active: ParticipationId[] = [];
  for (const event of events) {
    if (event.type === "PARTICIPATION_STARTED") {
      const participation = (event.payload as { participation: { participationId: ParticipationId; attempt: AttemptRef } })
        .participation;
      const attempt = participation.attempt;
      if (attempt.projectId === scope.attempt.projectId && attempt.attemptId === scope.attempt.attemptId) {
        active.push(participation.participationId);
      }
    } else if (event.type === "PARTICIPATION_ENDED") {
      ended.add((event.payload as { participationId: ParticipationId }).participationId);
    }
  }
  return Object.freeze([...new Set(active.filter((id) => !ended.has(id)))].sort());
}

/* ------------------------------------------------------------------ *
 * Snapshot materialization / parsing
 * ------------------------------------------------------------------ */

function canonicalPeerSet(members: readonly PeerRef[]): readonly PeerRef[] {
  const byId = new Map<string, PeerRef>();
  for (const member of members) {
    if (!byId.has(member.peerId)) byId.set(member.peerId, Object.freeze({ schemaVersion: 1 as const, peerId: member.peerId }));
  }
  return Object.freeze([...byId.values()].sort((a, b) => (a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0)));
}

function canonicalIdSet(ids: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(ids)].sort());
}

function snapshotContent(input: {
  readonly scope: CoalitionScope;
  readonly basis: CoordinationBasisRef;
  readonly members: readonly PeerRef[];
  readonly sourceCommitments: readonly CommitmentId[];
  readonly sourceParticipations: readonly ParticipationId[];
}): unknown {
  return {
    domain: COALITION_SNAPSHOT_DIGEST_DOMAIN,
    scope: input.scope,
    basis: input.basis,
    members: input.members,
    sourceCommitments: input.sourceCommitments,
    sourceParticipations: input.sourceParticipations,
  };
}

/** Materialize an immutable coalition snapshot (canonicalizes sets; §63). */
export function materializeCoalitionSnapshot(input: {
  readonly scope: CoalitionScope;
  readonly basis: CoordinationBasisRef;
  readonly members: readonly PeerRef[];
  readonly sourceCommitments: readonly CommitmentId[];
  readonly sourceParticipations: readonly ParticipationId[];
}): CoalitionSnapshot {
  const scope = parseCoalitionScope(input.scope);
  const basis = parseBasis(input.basis, "basis");
  const members = canonicalPeerSet(input.members);
  const sourceCommitments = canonicalIdSet(input.sourceCommitments);
  const sourceParticipations = canonicalIdSet(input.sourceParticipations);
  const digest = canonicalDigest(
    snapshotContent({ scope, basis, members, sourceCommitments, sourceParticipations }),
  );
  return Object.freeze({
    schemaVersion: 1 as const,
    scope,
    basis,
    members,
    sourceCommitments,
    sourceParticipations,
    digest,
  });
}

function requireCanonicalPeerArray(raw: unknown, what: string): readonly PeerRef[] {
  if (!Array.isArray(raw)) throw new CoordinationStoreError(`${what} must be an array`);
  const peers = raw.map((entry, index) => parsePeerRef(entry));
  const ids = peers.map((peer) => peer.peerId);
  const sorted = [...ids].sort();
  if (new Set(ids).size !== ids.length || ids.join("\u0000") !== sorted.join("\u0000")) {
    throw new CoordinationStoreError(`${what} must be a canonical (sorted, unique) peer set`);
  }
  return Object.freeze(peers);
}

function requireCanonicalIdArray(raw: unknown, what: string): readonly string[] {
  if (!Array.isArray(raw)) throw new CoordinationStoreError(`${what} must be an array`);
  const ids = raw.map((entry) => requireStableId(entry, `${what}[]`));
  const sorted = [...ids].sort();
  if (new Set(ids).size !== ids.length || ids.join("\u0000") !== sorted.join("\u0000")) {
    throw new CoordinationStoreError(`${what} must be a canonical (sorted, unique) id set`);
  }
  return Object.freeze(ids);
}

/** Strict snapshot parser; fails closed on a digest mismatch. */
export function parseCoalitionSnapshot(raw: unknown, what = "CoalitionSnapshot"): CoalitionSnapshot {
  const record = strictObject(
    raw,
    {
      allowed: ["schemaVersion", "scope", "basis", "members", "sourceCommitments", "sourceParticipations", "digest"],
      required: ["schemaVersion", "scope", "basis", "members", "sourceCommitments", "sourceParticipations", "digest"],
    },
    what,
  );
  if (record.schemaVersion !== 1) throw new CoordinationStoreError(`${what}.schemaVersion must be 1`);
  const scope = parseCoalitionScope(record.scope, `${what}.scope`);
  const basis = parseBasis(record.basis, `${what}.basis`);
  const members = requireCanonicalPeerArray(record.members, `${what}.members`);
  const sourceCommitments = requireCanonicalIdArray(record.sourceCommitments, `${what}.sourceCommitments`);
  const sourceParticipations = requireCanonicalIdArray(record.sourceParticipations, `${what}.sourceParticipations`);
  const digest = requireString(record.digest, `${what}.digest`);
  const expected = canonicalDigest(
    snapshotContent({ scope, basis, members, sourceCommitments, sourceParticipations }),
  );
  if (digest !== expected) {
    throw new CoordinationStoreError(`${what}.digest does not match its content`);
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    scope,
    basis,
    members,
    sourceCommitments,
    sourceParticipations,
    digest,
  });
}

/* ------------------------------------------------------------------ *
 * Derivation
 * ------------------------------------------------------------------ */

/**
 * Derive a coalition snapshot from coordination history (§37). Read-only: it
 * writes NOTHING and creates NO Organization (§41).
 */
export async function deriveCoalitionSnapshot(
  store: CoordinationStore,
  scope: CoalitionScope,
): Promise<CoalitionSnapshot> {
  const parsedScope = parseCoalitionScope(scope);
  const head = await store.head();
  const events = (await store.replay()).filter((event) => event.seq <= head);
  const basis = coordinationBasisOf(events);
  const scopeKey = coalitionScopeKey(parsedScope);

  const members: PeerRef[] = [];
  const sourceCommitments: CommitmentId[] = [];
  for (const record of activeCommitmentRecords(events)) {
    if (!record.active) continue;
    if (commitmentScopeKey(record.offer.scope) !== scopeKey) continue;
    sourceCommitments.push(record.commitmentId);
    members.push(record.holder);
  }

  return materializeCoalitionSnapshot({
    scope: parsedScope,
    basis,
    members,
    sourceCommitments,
    sourceParticipations: activeParticipationIdsInScope(events, parsedScope),
  });
}

/** True when a snapshot's recorded basis is still the current history (§36). */
export async function isCoalitionSnapshotCurrent(
  store: CoordinationStore,
  snapshot: CoalitionSnapshot,
): Promise<boolean> {
  const head = await store.head();
  const events = (await store.replay()).filter((event) => event.seq <= head);
  const basis = coordinationBasisOf(events);
  return basis.throughSeq === snapshot.basis.throughSeq && basis.digest === snapshot.basis.digest;
}

/** Provenance-only citation of a snapshot (§42) — Organization authoring may use it. */
export function coalitionProvenanceOf(snapshot: CoalitionSnapshot): CoalitionProvenanceRef {
  return Object.freeze({ snapshotDigest: snapshot.digest, basis: snapshot.basis });
}

/** Strict parser for the provenance ref. */
export function parseCoalitionProvenanceRef(raw: unknown, what = "CoalitionProvenanceRef"): CoalitionProvenanceRef {
  const record = strictObject(
    raw,
    { allowed: ["snapshotDigest", "basis"], required: ["snapshotDigest", "basis"] },
    what,
  );
  return Object.freeze({
    snapshotDigest: requireString(record.snapshotDigest, `${what}.snapshotDigest`),
    basis: parseBasis(record.basis, `${what}.basis`),
  });
}

export type { CommitmentScope, CommitmentOffer, CommitmentId, AttemptRef, ParticipationId };
