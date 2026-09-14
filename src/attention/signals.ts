/**
 * G10-P attention signals — Palimpsest's SEMANTIC attention decision.
 *
 *   Notification ≠ Activation     Host Wake ≠ Semantic Authority
 *   AttentionSignal ≠ Commitment ≠ BoundaryAcceptance ≠ AuthorityGrant
 *
 * A signal is DERIVED from canonical semantic state (inbox, commitments, boundary
 * candidates), so at-least-once transport cannot multiply it: duplicates converge on
 * the same `signalId` because the underlying semantic fact is singular. The signal is
 * never persisted as truth and never itself changes any semantic state.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier } from "../schema/identifier.js";
import type { PeerRef } from "../federation/peer.js";
import { materializePeerRef, parsePeerRef } from "../federation/peer.js";

export const ATTENTION_SIGNAL_DOMAIN = "palimpsest.attention-signal.v1";

export type AttentionKind =
  | "inbound_peer_message"
  | "boundary_decision_required"
  | "commitment_decision_required"
  | "boundary_revision_accepted";

export interface AttentionSubjectRef {
  /** A canonical kind label (e.g. "peer_message", "commitment", "boundary_artifact"). */
  readonly kind: string;
  readonly id: string;
}

export interface AttentionSignal {
  readonly schemaVersion: 1;
  /** Deterministic identity of this attention fact; re-observation yields the same id. */
  readonly signalId: string;
  readonly kind: AttentionKind;
  /** The peer whose inbound work or decision raised this signal (never a manager). */
  readonly peer: PeerRef;
  readonly threadId?: string | undefined;
  readonly subjects: readonly AttentionSubjectRef[];
  readonly reason: string;
  /**
   * True only when the policy cannot resolve this locally and a human decision is
   * needed (authority missing, conflicting commitments, irreconcilable boundary
   * disagreement, value decision). Default false — escalation is never invented.
   */
  readonly requiresUserAttention: boolean;
  readonly createdAt: string;
}

export type AttentionCandidate = Omit<AttentionSignal, "requiresUserAttention">;

export class AttentionSignalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttentionSignalError";
  }
}

function nonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AttentionSignalError(`${what} must be a non-empty string`);
  }
  return value;
}

function stableId(value: unknown, what: string): string {
  if (typeof value !== "string" || !isStableIdentifier(value)) {
    throw new AttentionSignalError(`${what} must be a stable identifier`);
  }
  return value;
}

/** Deterministic signal identity: kind + peer + optional thread + SORTED subjects. */
export function attentionSignalIdOf(input: {
  readonly kind: AttentionKind;
  readonly peerId: string;
  readonly threadId?: string | undefined;
  readonly subjects: readonly AttentionSubjectRef[];
}): string {
  const subjects = [...input.subjects]
    .map((subject) => ({ kind: subject.kind, id: subject.id }))
    .sort((a, b) => (a.kind === b.kind ? (a.id < b.id ? -1 : 1) : a.kind < b.kind ? -1 : 1));
  return canonicalDigest({
    domain: ATTENTION_SIGNAL_DOMAIN,
    kind: input.kind,
    peerId: input.peerId,
    threadId: input.threadId ?? null,
    subjects,
  });
}

export function materializeAttentionCandidate(input: {
  readonly kind: AttentionKind;
  readonly peer: PeerRef;
  readonly threadId?: string | undefined;
  readonly subjects: readonly AttentionSubjectRef[];
  readonly reason: string;
  readonly createdAt: string;
}): AttentionCandidate {
  const subjects = Object.freeze(
    input.subjects.map((subject) => Object.freeze({ kind: nonEmpty(subject.kind, "subject.kind"), id: nonEmpty(subject.id, "subject.id") })),
  );
  return Object.freeze({
    schemaVersion: 1 as const,
    signalId: attentionSignalIdOf({
      kind: input.kind,
      peerId: input.peer.peerId,
      ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
      subjects,
    }),
    kind: input.kind,
    peer: materializePeerRef({ peerId: input.peer.peerId }),
    ...(input.threadId === undefined ? {} : { threadId: staticThreadId(input.threadId) }),
    subjects,
    reason: nonEmpty(input.reason, "reason"),
    createdAt: input.createdAt,
  });
}

function staticThreadId(value: string): string {
  return stableId(value, "threadId");
}

export function withEscalation(candidate: AttentionCandidate, requiresUserAttention: boolean): AttentionSignal {
  return Object.freeze({ ...candidate, requiresUserAttention });
}

export function parseAttentionSubjectRef(raw: unknown, what = "AttentionSubjectRef"): AttentionSubjectRef {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AttentionSignalError(`${what} must be an object`);
  }
  const object = raw as Record<string, unknown>;
  const keys = Object.keys(object);
  for (const key of keys) {
    if (key !== "kind" && key !== "id") throw new AttentionSignalError(`${what} has unknown field "${key}"`);
  }
  return Object.freeze({ kind: nonEmpty(object.kind, `${what}.kind`), id: nonEmpty(object.id, `${what}.id`) });
}

export function parseAttentionSignal(raw: unknown, what = "AttentionSignal"): AttentionSignal {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AttentionSignalError(`${what} must be an object`);
  }
  const object = raw as Record<string, unknown>;
  const kind = object.kind;
  if (
    kind !== "inbound_peer_message" &&
    kind !== "boundary_decision_required" &&
    kind !== "commitment_decision_required" &&
    kind !== "boundary_revision_accepted"
  ) {
    throw new AttentionSignalError(`${what}.kind is not a known attention kind`);
  }
  if (!Array.isArray(object.subjects)) throw new AttentionSignalError(`${what}.subjects must be an array`);
  return Object.freeze({
    schemaVersion: 1 as const,
    signalId: nonEmpty(object.signalId, `${what}.signalId`),
    kind,
    peer: parsePeerRef(object.peer),
    ...(object.threadId === undefined ? {} : { threadId: staticThreadId(nonEmpty(object.threadId, `${what}.threadId`)) }),
    subjects: Object.freeze(object.subjects.map((subject) => parseAttentionSubjectRef(subject, `${what}.subjects[]`))),
    reason: nonEmpty(object.reason, `${what}.reason`),
    requiresUserAttention: object.requiresUserAttention === true,
    createdAt: nonEmpty(object.createdAt, `${what}.createdAt`),
  });
}
