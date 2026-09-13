/**
 * G10-E4 commitment & handoff — explicit peer agreement and responsibility
 * transition, without equating either with assignment, conversation, or ack.
 *
 * COMMITMENT (§86): an explicitly ACCEPTED responsibility/obligation by a
 * PeerRef. It requires explicit acceptance — there is NO unilateral
 * commitment of another peer. `Assignment ≠ Commitment` (§87): Work/scheduler
 * operations produce no commitment automatically. `Commitment ≠
 * Participation` (§95) and `Commitment ≠ Work ownership` (§96) — commitment
 * changes no Task/scheduler/project authority and mutates no WorkGraph.
 *
 * Lifecycle is DERIVED from append-only events (§93): OFFERED → ACTIVE /
 * REJECTED, then RELEASED / SUPERSEDED — never a mutable last-write-wins row.
 *
 * HANDOFF (§97–§103): an explicit responsibility transition. It requires an
 * existing ACTIVE commitment, the current holder, a target, an explicit
 * transfer proposal, and explicit target acceptance — no unilateral handoff.
 * Acceptance produces an explicit successor responsibility; the old
 * commitment stays historical/immutable (`SUPERSEDED`). `Handoff ≠ ordinary
 * message`, and a planner saying "peer B should take this" executes nothing.
 *
 * Session handoff is NOT fabricated (§102): the host exposes no
 * session-transfer contract, so only RESPONSIBILITY handoff is implemented.
 */

import type { PeerRef } from "./peer.js";
import type { AttemptRef } from "../coordination/index.js";
import type { CoordinationStoreError } from "../coordination/store.js";
import { CoordinationStoreError as StoreError } from "../coordination/store.js";
import { isStableIdentifier } from "../schema/identifier.js";
import { canonicalDigest } from "../schema/canonical.js";

export type CommitmentId = string;
export type HandoffId = string;

export type CommitmentScope =
  | { readonly kind: "attempt_participation"; readonly attempt: AttemptRef }
  | { readonly kind: "contact_need"; readonly contactNeedId: string };

/** Canonical typed terms (§90): a statement plus its canonical digest — never arbitrary JSON. */
export interface CommitmentTerms {
  readonly statement: string;
  readonly termsDigest: string;
}

export function commitmentTermsOf(statement: string): CommitmentTerms {
  if (typeof statement !== "string" || statement.trim() === "") {
    throw new StoreError("commitment statement must be a non-empty string");
  }
  return Object.freeze({
    statement,
    termsDigest: canonicalDigest({ domain: "palimpsest.commitment-terms.v1", statement }),
  });
}

/** A commitment offer (§88). OFFERED is not ACTIVE. */
export interface CommitmentOffer {
  readonly commitmentId: CommitmentId;
  readonly proposer: PeerRef;
  readonly proposedHolder: PeerRef;
  readonly scope: CommitmentScope;
  readonly termsDigest: string;
}

/** A handoff offer (§100): only a current holder may offer; the target must accept. */
export interface HandoffOffer {
  readonly handoffId: HandoffId;
  readonly commitmentId: CommitmentId;
  readonly from: PeerRef;
  readonly to: PeerRef;
  readonly scope: CommitmentScope;
}

/** Derived commitment lifecycle state (§93). */
export type CommitmentState = "OFFERED" | "ACTIVE" | "REJECTED" | "RELEASED" | "SUPERSEDED";

export class CommitmentError extends Error {
  constructor(
    readonly kind:
      | "commitment_invalid"
      | "commitment_conflict"
      | "not_proposed_holder"
      | "not_current_holder"
      | "commitment_not_active"
      | "unauthenticated_acceptance"
      | "handoff_invalid",
    message: string,
  ) {
    super(message);
    this.name = "CommitmentError";
  }
}

function requireId(value: string, what: string): string {
  if (!isStableIdentifier(value)) throw new CommitmentError("commitment_invalid", `${what} must be a stable identifier`);
  return value;
}

/** The successor commitment id created by an accepted handoff — derived, explicit, no hidden mutation (§101). */
export function successorCommitmentIdOf(handoffId: HandoffId, commitmentId: CommitmentId): CommitmentId {
  return `c-${canonicalDigest({ domain: "palimpsest.commitment-successor.v1", handoffId, commitmentId }).slice(0, 32)}`;
}

export interface CommitmentOfferedPayload {
  readonly offer: CommitmentOffer;
}

export interface CommitmentAcceptedPayload {
  readonly commitmentId: CommitmentId;
  readonly acceptedBy: PeerRef;
  /** §71/§91: acceptance is only valid from an AUTHENTICATED proposed holder. */
  readonly authenticated: boolean;
}

export interface CommitmentRejectedPayload {
  readonly commitmentId: CommitmentId;
  readonly rejectedBy: PeerRef;
}

export interface CommitmentReleasedPayload {
  readonly commitmentId: CommitmentId;
  readonly releasedBy: PeerRef;
}

export interface CommitmentSupersededPayload {
  readonly commitmentId: CommitmentId;
  readonly handoffId: HandoffId;
}

export interface HandoffOfferedPayload {
  readonly offer: HandoffOffer;
}

export interface HandoffAcceptedPayload {
  readonly handoffId: HandoffId;
  readonly commitmentId: CommitmentId;
  /** The successor responsibility activated for `to`. */
  readonly successorCommitmentId: CommitmentId;
  readonly to: PeerRef;
}

export interface HandoffRejectedPayload {
  readonly handoffId: HandoffId;
  readonly rejectedBy: PeerRef;
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StoreError(`malformed ${what} payload`);
  }
  return value as Record<string, unknown>;
}

function requirePeer(value: unknown, what: string): PeerRef {
  const record = asRecord(value, what);
  return Object.freeze({ schemaVersion: 1 as const, peerId: requireId(record.peerId as string, what) });
}

function requireScope(value: unknown): CommitmentScope {
  const record = asRecord(value, "scope");
  if (record.kind === "attempt_participation") {
    const attempt = asRecord(record.attempt, "attempt");
    return Object.freeze({
      kind: "attempt_participation" as const,
      attempt: Object.freeze({
        projectId: requireId(attempt.projectId as string, "projectId"),
        attemptId: requireId(attempt.attemptId as string, "attemptId"),
      }),
    });
  }
  if (record.kind === "contact_need") {
    return Object.freeze({
      kind: "contact_need" as const,
      contactNeedId: requireId(record.contactNeedId as string, "contactNeedId"),
    });
  }
  throw new StoreError("unknown commitment scope kind");
}

/** Strict parsers for commitment/handoff events, registered with the store. */
export const COMMITMENT_EVENT_PARSERS = Object.freeze({
  COMMITMENT_OFFERED: (payload: unknown) => {
    const record = asRecord(payload, "COMMITMENT_OFFERED");
    const offer = asRecord(record.offer, "offer");
    return {
      offer: Object.freeze({
        commitmentId: requireId(offer.commitmentId as string, "commitmentId"),
        proposer: requirePeer(offer.proposer, "proposer"),
        proposedHolder: requirePeer(offer.proposedHolder, "proposedHolder"),
        scope: requireScope(offer.scope),
        termsDigest: requireId(offer.termsDigest as string, "termsDigest"),
      }),
    } satisfies CommitmentOfferedPayload;
  },
  COMMITMENT_ACCEPTED: (payload: unknown) => {
    const record = asRecord(payload, "COMMITMENT_ACCEPTED");
    if (typeof record.authenticated !== "boolean") {
      throw new StoreError("COMMITMENT_ACCEPTED.authenticated must be a boolean");
    }
    return {
      commitmentId: requireId(record.commitmentId as string, "commitmentId"),
      acceptedBy: requirePeer(record.acceptedBy, "acceptedBy"),
      authenticated: record.authenticated,
    } satisfies CommitmentAcceptedPayload;
  },
  COMMITMENT_REJECTED: (payload: unknown) => {
    const record = asRecord(payload, "COMMITMENT_REJECTED");
    return {
      commitmentId: requireId(record.commitmentId as string, "commitmentId"),
      rejectedBy: requirePeer(record.rejectedBy, "rejectedBy"),
    } satisfies CommitmentRejectedPayload;
  },
  COMMITMENT_RELEASED: (payload: unknown) => {
    const record = asRecord(payload, "COMMITMENT_RELEASED");
    return {
      commitmentId: requireId(record.commitmentId as string, "commitmentId"),
      releasedBy: requirePeer(record.releasedBy, "releasedBy"),
    } satisfies CommitmentReleasedPayload;
  },
  COMMITMENT_SUPERSEDED: (payload: unknown) => {
    const record = asRecord(payload, "COMMITMENT_SUPERSEDED");
    return {
      commitmentId: requireId(record.commitmentId as string, "commitmentId"),
      handoffId: requireId(record.handoffId as string, "handoffId"),
    } satisfies CommitmentSupersededPayload;
  },
  HANDOFF_OFFERED: (payload: unknown) => {
    const record = asRecord(payload, "HANDOFF_OFFERED");
    const offer = asRecord(record.offer, "offer");
    return {
      offer: Object.freeze({
        handoffId: requireId(offer.handoffId as string, "handoffId"),
        commitmentId: requireId(offer.commitmentId as string, "commitmentId"),
        from: requirePeer(offer.from, "from"),
        to: requirePeer(offer.to, "to"),
        scope: requireScope(offer.scope),
      }),
    } satisfies HandoffOfferedPayload;
  },
  HANDOFF_ACCEPTED: (payload: unknown) => {
    const record = asRecord(payload, "HANDOFF_ACCEPTED");
    return {
      handoffId: requireId(record.handoffId as string, "handoffId"),
      commitmentId: requireId(record.commitmentId as string, "commitmentId"),
      successorCommitmentId: requireId(record.successorCommitmentId as string, "successorCommitmentId"),
      to: requirePeer(record.to, "to"),
    } satisfies HandoffAcceptedPayload;
  },
  HANDOFF_REJECTED: (payload: unknown) => {
    const record = asRecord(payload, "HANDOFF_REJECTED");
    return {
      handoffId: requireId(record.handoffId as string, "handoffId"),
      rejectedBy: requirePeer(record.rejectedBy, "rejectedBy"),
    } satisfies HandoffRejectedPayload;
  },
});

export type { CoordinationStoreError };
