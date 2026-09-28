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
import type { AttemptRef } from "../identity/refs.js";
import { CoordinationStoreError as StoreError } from "../identity/errors.js";
import { canonicalDigest } from "../schema/canonical.js";
import type { AcceptedBoundaryRevisionRef } from "../boundary_memory/ref.js";
import { parseAcceptedBoundaryRevisionRef } from "../boundary_memory/ref.js";
import {
  asObject,
  requireBoolean,
  requireOneOf,
  requireStableId,
  requireString,
  strictObject,
} from "../identity/strict.js";

export type CommitmentId = string;
export type HandoffId = string;

export type CommitmentScope =
  | { readonly kind: "attempt_participation"; readonly attempt: AttemptRef }
  | { readonly kind: "contact_need"; readonly contactNeedId: string }
  /**
   * G10-K §27: responsibility bound to an EXACT ACCEPTED boundary revision.
   * A candidate revision is not representable in this position, so
   * `candidate revision ≠ commitment scope` holds by type; boundary acceptance
   * still does not itself create any commitment.
   */
  | { readonly kind: "boundary_revision"; readonly revision: AcceptedBoundaryRevisionRef };

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
  /**
   * E3-C §19 (additive): the RECOVERABLE canonical terms body.
   *
   * A commitment whose terms survive only as a digest cannot be evaluated later — nothing can decide
   * whether the promise was kept, because the promise is not in history. New offers therefore carry the
   * canonical body too. The rule is strict and checkable: when present, `terms.termsDigest` MUST equal
   * the offer's `termsDigest` and `terms.statement` MUST re-derive it, so the body can never disagree
   * with the digest it claims to explain.
   *
   * Historical offers that carry only `termsDigest` remain valid and are NOT rewritten; they are simply
   * not fulfillable through E3-C V1 (§19) — refusing to guess a promise is the honest reading.
   */
  readonly terms?: CommitmentTerms | undefined;
}

/** A handoff offer (§100): only a current holder may offer; the target must accept. */
export interface HandoffOffer {
  readonly handoffId: HandoffId;
  readonly commitmentId: CommitmentId;
  readonly from: PeerRef;
  readonly to: PeerRef;
  readonly scope: CommitmentScope;
}

/**
 * Derived commitment lifecycle state (§93). E3-C §27 adds `FULFILLED`.
 *
 * `FULFILLED` is TERMINAL: a fulfilled commitment can no longer be released, handed off or
 * re-accepted, because the responsibility it named has been discharged by an admitted fulfillment.
 */
export type CommitmentState =
  | "OFFERED"
  | "ACTIVE"
  | "REJECTED"
  | "RELEASED"
  | "SUPERSEDED"
  | "FULFILLED";

export class CommitmentError extends Error {
  constructor(
    readonly kind:
      | "commitment_invalid"
      | "commitment_conflict"
      | "not_proposed_holder"
      | "not_current_holder"
      | "commitment_not_active"
      | "unauthenticated_acceptance"
      | "handoff_invalid"
      | "unverified_scope"
      | "fulfillment_invalid"
      | "not_fulfillable"
      | "fulfillment_conflict",
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
 * E3-C §20–§25: FULFILLMENT — a typed, admitted contribution.
 *
 * `Commitment → Fulfillment`, NEVER `Commitment → RemoteWorkAssignment`. A
 * fulfillment names WHAT was delivered (a closed union of high-integrity
 * cross-peer artifacts), not what anyone did, and it grants no Work authority
 * anywhere. `Fulfillment ≠ Truth` and `Fulfillment ≠ Evidence`: admission
 * decides whether the promise was discharged, not whether the content is true.
 * ------------------------------------------------------------------------- */

export const FULFILLMENT_SUBMISSION_DOMAIN = "palimpsest.commitment-fulfillment.submission.v1";
export const FULFILLMENT_SUBMISSION_ID_DOMAIN = "palimpsest.commitment-fulfillment.submission-id.v1";

/**
 * §21: the V1 output union. It is INTENTIONALLY CLOSED and has exactly one member — an exact currently
 * ACCEPTED boundary revision, which BoundaryMemory already represents with shared artifact, explicit
 * participants, candidate proposal, explicit acceptance and digest-bound identity. A future output kind
 * requires an explicit additive review; there is deliberately NO generic `kind: string` arm, because a
 * generic arm would let any string become a deliverable.
 */
export type CommitmentFulfillmentOutput = {
  readonly kind: "boundary_revision";
  readonly revision: AcceptedBoundaryRevisionRef;
};

/** Strict parser for the closed output union. */
export function parseCommitmentFulfillmentOutput(
  raw: unknown,
  what = "output",
): CommitmentFulfillmentOutput {
  const record = asObject(raw, what);
  if (record.kind === "boundary_revision") {
    const scoped = strictObject(raw, { allowed: ["kind", "revision"], required: ["kind", "revision"] }, what);
    return Object.freeze({
      kind: "boundary_revision" as const,
      revision: parseAcceptedBoundaryRevisionRef(scoped.revision, `${what}.revision`),
    });
  }
  throw new StoreError(`${what}.kind must be "boundary_revision" (the V1 fulfillment output union is closed)`);
}

/** Canonical key for an output, so a submission's output SET can be deduplicated and ordered. */
export function commitmentFulfillmentOutputKey(output: CommitmentFulfillmentOutput): string {
  const ref = output.revision;
  return `boundary_revision:${ref.workspaceId}/${ref.artifactId}@${ref.revision}:${ref.revisionDigest}`;
}

/**
 * §23: a content-addressed fulfillment submission. `submissionId` derives from the content, so a retry
 * of the same submission is the same artifact — never a second one.
 */
export interface CommitmentFulfillmentSubmission {
  readonly schemaVersion: 1;
  readonly submissionId: string;
  readonly commitmentId: CommitmentId;
  readonly submittedBy: PeerRef;
  readonly outputs: readonly CommitmentFulfillmentOutput[];
  readonly note: string;
  readonly digest: string;
}

type FulfillmentSubmissionContent = Omit<CommitmentFulfillmentSubmission, "submissionId" | "digest">;

export function fulfillmentSubmissionDigestOf(content: FulfillmentSubmissionContent): string {
  return canonicalDigest({ domain: FULFILLMENT_SUBMISSION_DOMAIN, submission: content });
}

/** Canonical output SET: duplicates rejected, order canonicalized. */
export function canonicalFulfillmentOutputs(
  outputs: readonly CommitmentFulfillmentOutput[],
): readonly CommitmentFulfillmentOutput[] {
  const parsed = outputs.map((output, index) => parseCommitmentFulfillmentOutput(output, `outputs[${index}]`));
  const seen = new Set<string>();
  for (const output of parsed) {
    const key = commitmentFulfillmentOutputKey(output);
    if (seen.has(key)) throw new StoreError(`outputs: duplicate output "${key}" (semantic set)`);
    seen.add(key);
  }
  return Object.freeze(
    [...parsed].sort((a, b) => {
      const left = commitmentFulfillmentOutputKey(a);
      const right = commitmentFulfillmentOutputKey(b);
      return left < right ? -1 : left > right ? 1 : 0;
    }),
  );
}

export function materializeFulfillmentSubmission(input: {
  readonly commitmentId: CommitmentId;
  readonly submittedBy: PeerRef;
  readonly outputs: readonly CommitmentFulfillmentOutput[];
  readonly note: string;
}): CommitmentFulfillmentSubmission {
  if (typeof input.note !== "string") {
    throw new StoreError("fulfillment note must be a string");
  }
  const content: FulfillmentSubmissionContent = Object.freeze({
    schemaVersion: 1 as const,
    commitmentId: input.commitmentId,
    submittedBy: input.submittedBy,
    outputs: canonicalFulfillmentOutputs(input.outputs),
    note: input.note,
  });
  const digest = fulfillmentSubmissionDigestOf(content);
  const submissionId = `cfs-${canonicalDigest({ domain: FULFILLMENT_SUBMISSION_ID_DOMAIN, digest }).slice(0, 32)}`;
  return Object.freeze({ ...content, submissionId, digest });
}

/** Strict FulfillmentSubmission parser; the digest is RE-DERIVED so a tampered body is refused. */
export function parseFulfillmentSubmission(
  raw: unknown,
  what = "CommitmentFulfillmentSubmission",
): CommitmentFulfillmentSubmission {
  const record = strictObject(
    raw,
    {
      allowed: ["schemaVersion", "submissionId", "commitmentId", "submittedBy", "outputs", "note", "digest"],
      required: ["schemaVersion", "submissionId", "commitmentId", "submittedBy", "outputs", "note", "digest"],
    },
    what,
  );
  if (record.schemaVersion !== 1) throw new StoreError(`${what}.schemaVersion must be 1`);
  if (!Array.isArray(record.outputs)) throw new StoreError(`${what}.outputs must be an array`);
  const outputs = canonicalFulfillmentOutputs(
    record.outputs.map((entry, index) => parseCommitmentFulfillmentOutput(entry, `${what}.outputs[${index}]`)),
  );
  const content: FulfillmentSubmissionContent = Object.freeze({
    schemaVersion: 1 as const,
    commitmentId: requireStableId(record.commitmentId, `${what}.commitmentId`),
    submittedBy: parsePeerRef(record.submittedBy),
    outputs,
    note: requireString(record.note, `${what}.note`),
  });
  const digest = fulfillmentSubmissionDigestOf(content);
  if (requireString(record.digest, `${what}.digest`) !== digest) {
    throw new StoreError(`${what}.digest does not match its content`);
  }
  const submissionId = `cfs-${canonicalDigest({ domain: FULFILLMENT_SUBMISSION_ID_DOMAIN, digest }).slice(0, 32)}`;
  if (requireStableId(record.submissionId, `${what}.submissionId`) !== submissionId) {
    throw new StoreError(`${what}.submissionId does not match its content`);
  }
  return Object.freeze({ ...content, submissionId, digest });
}

export interface FulfillmentSubmittedPayload {
  readonly submission: CommitmentFulfillmentSubmission;
}

/** §25/§26: the independent fulfillment authority's decision, naming the EXACT submission digest. */
export const FULFILLMENT_ADMISSION_DECISIONS = ["ADMIT", "REJECT", "UNRESOLVED"] as const;
export type FulfillmentAdmissionDecision = (typeof FULFILLMENT_ADMISSION_DECISIONS)[number];

export interface FulfillmentDecidedPayload {
  readonly commitmentId: CommitmentId;
  readonly submissionDigest: string;
  readonly decision: FulfillmentAdmissionDecision;
  readonly policyRef: { readonly policyId: string; readonly version: string };
  readonly provenanceDigest: string;
  readonly detail?: string | undefined;
}

export interface CommitmentFulfilledPayload {
  readonly commitmentId: CommitmentId;
  readonly submissionDigest: string;
  readonly submissionId: string;
  readonly holder: PeerRef;
  readonly outputs: readonly CommitmentFulfillmentOutput[];
  readonly admission: {
    readonly decision: "ADMIT";
    readonly policyRef: { readonly policyId: string; readonly version: string };
    readonly provenanceDigest: string;
  };
}

/* ------------------------------------------------------------------------- *
 * F0 §23–§24: artifact-domain strict parsers for commitment/handoff
 * artifacts. Exact fields, nested PeerRef/scope artifacts validated, stable
 * ids and enum literals enforced — never an unchecked structural cast.
 * ------------------------------------------------------------------------- */

const COMMITMENT_OFFER_KEYS = ["commitmentId", "proposer", "proposedHolder", "scope", "termsDigest", "terms"] as const;
const COMMITMENT_OFFER_REQUIRED = ["commitmentId", "proposer", "proposedHolder", "scope", "termsDigest"] as const;
const HANDOFF_OFFER_KEYS = ["handoffId", "commitmentId", "from", "to", "scope"] as const;
const ATTEMPT_REF_KEYS = ["projectId", "attemptId"] as const;
const COMMITMENT_TERMS_KEYS = ["statement", "termsDigest"] as const;

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
  if (record.kind === "boundary_revision") {
    const scoped = strictObject(
      value,
      { allowed: ["kind", "revision"], required: ["kind", "revision"] },
      what,
    );
    return Object.freeze({
      kind: "boundary_revision" as const,
      revision: parseAcceptedBoundaryRevisionRef(scoped.revision, `${what}.revision`),
    });
  }
  throw new StoreError(`${what}.kind must be one of attempt_participation, contact_need, boundary_revision`);
}

/**
 * §19: strict CommitmentTerms parser. The digest is RE-DERIVED from the statement, so a terms body whose
 * digest disagrees with its own statement is refused rather than believed.
 */
export function parseCommitmentTerms(raw: unknown, what = "terms"): CommitmentTerms {
  const record = strictObject(raw, { allowed: COMMITMENT_TERMS_KEYS, required: COMMITMENT_TERMS_KEYS }, what);
  const statement = requireString(record.statement, `${what}.statement`);
  const expected = commitmentTermsOf(statement).termsDigest;
  if (requireString(record.termsDigest, `${what}.termsDigest`) !== expected) {
    throw new StoreError(`${what}.termsDigest does not match its statement`);
  }
  return Object.freeze({ statement, termsDigest: expected });
}

/** Strict CommitmentOffer artifact. */
export function parseCommitmentOffer(value: unknown, what = "offer"): CommitmentOffer {
  const record = strictObject(
    value,
    { allowed: COMMITMENT_OFFER_KEYS, required: COMMITMENT_OFFER_REQUIRED },
    what,
  );
  const termsDigest = requireString(record.termsDigest, `${what}.termsDigest`);
  // §19: when the recoverable body is present it must agree with the digest the offer declares.
  const terms = record.terms === undefined ? undefined : parseCommitmentTerms(record.terms, `${what}.terms`);
  if (terms !== undefined && terms.termsDigest !== termsDigest) {
    throw new StoreError(`${what}.terms.termsDigest does not match the offer's termsDigest`);
  }
  return Object.freeze({
    commitmentId: requireStableId(record.commitmentId, `${what}.commitmentId`),
    proposer: parsePeerRef(record.proposer),
    proposedHolder: parsePeerRef(record.proposedHolder),
    scope: parseCommitmentScope(record.scope, `${what}.scope`),
    termsDigest,
    ...(terms === undefined ? {} : { terms }),
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
  /** E3-C §26: the submission record. `submission ≠ acceptance` — this event decides nothing. */
  FULFILLMENT_SUBMITTED: (payload: unknown) => {
    const record = strictObject(
      payload,
      { allowed: ["submission"], required: ["submission"] },
      "FULFILLMENT_SUBMITTED",
    );
    return Object.freeze({
      submission: parseFulfillmentSubmission(record.submission, "FULFILLMENT_SUBMITTED.submission"),
    }) satisfies FulfillmentSubmittedPayload;
  },
  /** E3-C §25/§26: the authority's decision, naming the exact submission digest it decided. */
  FULFILLMENT_DECIDED: (payload: unknown) => {
    const record = strictObject(
      payload,
      {
        allowed: ["commitmentId", "submissionDigest", "decision", "policyRef", "provenanceDigest", "detail"],
        required: ["commitmentId", "submissionDigest", "decision", "policyRef", "provenanceDigest"],
      },
      "FULFILLMENT_DECIDED",
    );
    const policyRef = strictObject(
      record.policyRef,
      { allowed: ["policyId", "version"], required: ["policyId", "version"] },
      "FULFILLMENT_DECIDED.policyRef",
    );
    const detail = record.detail;
    return Object.freeze({
      commitmentId: requireStableId(record.commitmentId, "FULFILLMENT_DECIDED.commitmentId"),
      submissionDigest: requireString(record.submissionDigest, "FULFILLMENT_DECIDED.submissionDigest"),
      decision: requireOneOf(record.decision, FULFILLMENT_ADMISSION_DECISIONS, "FULFILLMENT_DECIDED.decision"),
      policyRef: Object.freeze({
        policyId: requireString(policyRef.policyId, "FULFILLMENT_DECIDED.policyRef.policyId"),
        version: requireString(policyRef.version, "FULFILLMENT_DECIDED.policyRef.version"),
      }),
      provenanceDigest: requireString(record.provenanceDigest, "FULFILLMENT_DECIDED.provenanceDigest"),
      ...(detail === undefined ? {} : { detail: requireString(detail, "FULFILLMENT_DECIDED.detail") }),
    }) satisfies FulfillmentDecidedPayload;
  },
  /** E3-C §26/§27: the terminal transition. It records the admitted output, never a Work state. */
  COMMITMENT_FULFILLED: (payload: unknown) => {
    const record = strictObject(
      payload,
      {
        allowed: ["commitmentId", "submissionDigest", "submissionId", "holder", "outputs", "admission"],
        required: ["commitmentId", "submissionDigest", "submissionId", "holder", "outputs", "admission"],
      },
      "COMMITMENT_FULFILLED",
    );
    if (!Array.isArray(record.outputs)) throw new StoreError("COMMITMENT_FULFILLED.outputs must be an array");
    const admission = strictObject(
      record.admission,
      { allowed: ["decision", "policyRef", "provenanceDigest"], required: ["decision", "policyRef", "provenanceDigest"] },
      "COMMITMENT_FULFILLED.admission",
    );
    if (admission.decision !== "ADMIT") {
      throw new StoreError('COMMITMENT_FULFILLED.admission.decision must be "ADMIT"');
    }
    const policyRef = strictObject(
      admission.policyRef,
      { allowed: ["policyId", "version"], required: ["policyId", "version"] },
      "COMMITMENT_FULFILLED.admission.policyRef",
    );
    return Object.freeze({
      commitmentId: requireStableId(record.commitmentId, "COMMITMENT_FULFILLED.commitmentId"),
      submissionDigest: requireString(record.submissionDigest, "COMMITMENT_FULFILLED.submissionDigest"),
      submissionId: requireStableId(record.submissionId, "COMMITMENT_FULFILLED.submissionId"),
      holder: parsePeerRef(record.holder),
      outputs: canonicalFulfillmentOutputs(
        record.outputs.map((entry, index) => parseCommitmentFulfillmentOutput(entry, `COMMITMENT_FULFILLED.outputs[${index}]`)),
      ),
      admission: Object.freeze({
        decision: "ADMIT" as const,
        policyRef: Object.freeze({
          policyId: requireString(policyRef.policyId, "COMMITMENT_FULFILLED.admission.policyRef.policyId"),
          version: requireString(policyRef.version, "COMMITMENT_FULFILLED.admission.policyRef.version"),
        }),
        provenanceDigest: requireString(admission.provenanceDigest, "COMMITMENT_FULFILLED.admission.provenanceDigest"),
      }),
    }) satisfies CommitmentFulfilledPayload;
  },
});

export type { CoordinationStoreError } from "../identity/errors.js";
