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
import { parsePeerRef } from "./peer.js";
import type { AttemptRef } from "../coordination/index.js";
import { CoordinationStoreError as StoreError } from "../coordination/errors.js";
import { canonicalDigest } from "../schema/canonical.js";
import {
  asObject,
  requireBoolean,
  requireStableId,
  requireString,
  strictObject,
} from "../coordination/strict.js";

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

/* ------------------------------------------------------------------------- *
 * F0 §23–§24: artifact-domain strict parsers for commitment/handoff
 * artifacts. Exact fields, nested PeerRef/scope artifacts validated, stable
 * ids and enum literals enforced — never an unchecked structural cast.
 * ------------------------------------------------------------------------- */

const COMMITMENT_OFFER_KEYS = ["commitmentId", "proposer", "proposedHolder", "scope", "termsDigest"] as const;
const HANDOFF_OFFER_KEYS = ["handoffId", "commitmentId", "from", "to", "scope"] as const;
const ATTEMPT_REF_KEYS = ["projectId", "attemptId"] as const;

/** Strict CommitmentScope: discriminated union, exact fields per kind. */
export function parseCommitmentScope(value: unknown, what = "scope"): CommitmentScope {
  const record = asObject(value, what);
  if (record.kind === "attempt_participation") {
    const scoped = strictObject(
      value,
      { allowed: ["kind", "attempt"], required: ["kind", "attempt"] },
      what,
    );
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
    const scoped = strictObject(
      value,
      { allowed: ["kind", "contactNeedId"], required: ["kind", "contactNeedId"] },
      what,
    );
    return Object.freeze({
      kind: "contact_need" as const,
      contactNeedId: requireStableId(scoped.contactNeedId, `${what}.contactNeedId`),
    });
  }
  throw new StoreError(`${what}.kind must be one of attempt_participation, contact_need`);
}

/** Strict CommitmentOffer artifact. */
export function parseCommitmentOffer(value: unknown, what = "offer"): CommitmentOffer {
  const record = strictObject(value, { allowed: COMMITMENT_OFFER_KEYS, required: COMMITMENT_OFFER_KEYS }, what);
  return Object.freeze({
    commitmentId: requireStableId(record.commitmentId, `${what}.commitmentId`),
    proposer: parsePeerRef(record.proposer),
    proposedHolder: parsePeerRef(record.proposedHolder),
    scope: parseCommitmentScope(record.scope, `${what}.scope`),
    termsDigest: requireString(record.termsDigest, `${what}.termsDigest`),
  });
}

/** Strict HandoffOffer artifact. */
export function parseHandoffOffer(value: unknown, what = "offer"): HandoffOffer {
  const record = strictObject(value, { allowed: HANDOFF_OFFER_KEYS, required: HANDOFF_OFFER_KEYS }, what);
  return Object.freeze({
    handoffId: requireStableId(record.handoffId, `${what}.handoffId`),
    commitmentId: requireStableId(record.commitmentId, `${what}.commitmentId`),
    from: parsePeerRef(record.from),
    to: parsePeerRef(record.to),
    scope: parseCommitmentScope(record.scope, `${what}.scope`),
  });
}

/** Strict parsers for commitment/handoff events, registered with the store. */
export const COMMITMENT_EVENT_PARSERS = Object.freeze({
  COMMITMENT_OFFERED: (payload: unknown) => {
    const record = strictObject(payload, { allowed: ["offer"], required: ["offer"] }, "COMMITMENT_OFFERED");
    return Object.freeze({ offer: parseCommitmentOffer(record.offer) }) satisfies CommitmentOfferedPayload;
  },
  COMMITMENT_ACCEPTED: (payload: unknown) => {
    const record = strictObject(
      payload,
      { allowed: ["commitmentId", "acceptedBy", "authenticated"], required: ["commitmentId", "acceptedBy", "authenticated"] },
      "COMMITMENT_ACCEPTED",
    );
    return Object.freeze({
      commitmentId: requireStableId(record.commitmentId, "commitmentId"),
      acceptedBy: parsePeerRef(record.acceptedBy),
      authenticated: requireBoolean(record.authenticated, "COMMITMENT_ACCEPTED.authenticated"),
    }) satisfies CommitmentAcceptedPayload;
  },
  COMMITMENT_REJECTED: (payload: unknown) => {
    const record = strictObject(
      payload,
      { allowed: ["commitmentId", "rejectedBy"], required: ["commitmentId", "rejectedBy"] },
      "COMMITMENT_REJECTED",
    );
    return Object.freeze({
      commitmentId: requireStableId(record.commitmentId, "commitmentId"),
      rejectedBy: parsePeerRef(record.rejectedBy),
    }) satisfies CommitmentRejectedPayload;
  },
  COMMITMENT_RELEASED: (payload: unknown) => {
    const record = strictObject(
      payload,
      { allowed: ["commitmentId", "releasedBy"], required: ["commitmentId", "releasedBy"] },
      "COMMITMENT_RELEASED",
    );
    return Object.freeze({
      commitmentId: requireStableId(record.commitmentId, "commitmentId"),
      releasedBy: parsePeerRef(record.releasedBy),
    }) satisfies CommitmentReleasedPayload;
  },
  COMMITMENT_SUPERSEDED: (payload: unknown) => {
    const record = strictObject(
      payload,
      { allowed: ["commitmentId", "handoffId"], required: ["commitmentId", "handoffId"] },
      "COMMITMENT_SUPERSEDED",
    );
    return Object.freeze({
      commitmentId: requireStableId(record.commitmentId, "commitmentId"),
      handoffId: requireStableId(record.handoffId, "handoffId"),
    }) satisfies CommitmentSupersededPayload;
  },
  HANDOFF_OFFERED: (payload: unknown) => {
    const record = strictObject(payload, { allowed: ["offer"], required: ["offer"] }, "HANDOFF_OFFERED");
    return Object.freeze({ offer: parseHandoffOffer(record.offer) }) satisfies HandoffOfferedPayload;
  },
  HANDOFF_ACCEPTED: (payload: unknown) => {
    const record = strictObject(
      payload,
      {
        allowed: ["handoffId", "commitmentId", "successorCommitmentId", "to"],
        required: ["handoffId", "commitmentId", "successorCommitmentId", "to"],
      },
      "HANDOFF_ACCEPTED",
    );
    return Object.freeze({
      handoffId: requireStableId(record.handoffId, "handoffId"),
      commitmentId: requireStableId(record.commitmentId, "commitmentId"),
      successorCommitmentId: requireStableId(record.successorCommitmentId, "successorCommitmentId"),
      to: parsePeerRef(record.to),
    }) satisfies HandoffAcceptedPayload;
  },
  HANDOFF_REJECTED: (payload: unknown) => {
    const record = strictObject(
      payload,
      { allowed: ["handoffId", "rejectedBy"], required: ["handoffId", "rejectedBy"] },
      "HANDOFF_REJECTED",
    );
    return Object.freeze({
      handoffId: requireStableId(record.handoffId, "handoffId"),
      rejectedBy: parsePeerRef(record.rejectedBy),
    }) satisfies HandoffRejectedPayload;
  },
});

export type { CoordinationStoreError } from "../coordination/errors.js";
