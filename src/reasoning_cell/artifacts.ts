/**
 * G10-N reasoning-cell artifacts, events, and strict parsers.
 *
 *   VerificationResult ≠ AdmissionDecision      AdmissionDecision ≠ Truth
 *   EpistemicAdmission ≠ EffectAdmission        CandidateClaim ≠ AcceptedClaim
 *   BranchBrief exposes the ACCEPTED FRONTIER only (blind-until-commit)
 *
 * Operation errors (timeout/tool/transport) are NEVER recorded as an epistemic
 * `INCONCLUSIVE` standing.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { ActivationRef } from "../coordination/index.js";
import { parseActivationRef } from "../coordination/index.js";
import { materializeReasoningCellRef } from "./ref.js";
import type { ReasoningClaim, ReasoningClaimTypeRef } from "./claims.js";
import { parseReasoningClaim, parseReasoningClaimTypeRef } from "./claims.js";
import type { ReasoningCellRef, ReasoningClaimRef, ReasoningFrontierBasis, ReasoningPolicyRef, ReasoningBranchRef } from "./ref.js";
import {
  parseReasoningBranchRef,
  parseReasoningCellRef,
  parseReasoningClaimRef,
  parseReasoningFrontierBasis,
  parseReasoningPolicyRef,
  rcDigest,
  rcExactKeys,
  rcFail,
  rcLiteral,
  rcNonEmpty,
  rcNonNegativeInteger,
  rcObject,
  rcStableId,
} from "./ref.js";

export const REASONING_CANDIDATE_DOMAIN = "palimpsest.reasoning-candidate.v1";
export const REASONING_VERIFICATION_DOMAIN = "palimpsest.reasoning-verification.v1";
export const REASONING_ADMISSION_DOMAIN = "palimpsest.reasoning-admission.v1";
export const REASONING_INVALIDATION_REQUEST_DOMAIN = "palimpsest.reasoning-invalidation-request.v1";
export const REASONING_INVALIDATION_VERIFICATION_DOMAIN = "palimpsest.reasoning-invalidation-verification.v1";
export const REASONING_INVALIDATION_ADMISSION_DOMAIN = "palimpsest.reasoning-invalidation-admission.v1";
export const REASONING_CHAIN_DOMAIN = "palimpsest.reasoning-cell-chain.v1";

/* ------------------------------------------------------------------ *
 * Cell
 * ------------------------------------------------------------------ */

export type ReasoningCellLifecycle = "OPEN" | "CLOSED";

export interface ReasoningCellDefinition {
  readonly schemaVersion: 1;
  readonly cellId: string;
  readonly objective: string;
  readonly verificationPolicyRef: ReasoningPolicyRef;
  readonly admissionPolicyRef: ReasoningPolicyRef;
}

export function materializeReasoningCellDefinition(input: {
  readonly cellId: string;
  readonly objective: string;
  readonly verificationPolicyRef: ReasoningPolicyRef;
  readonly admissionPolicyRef: ReasoningPolicyRef;
}): ReasoningCellDefinition {
  return Object.freeze({
    schemaVersion: 1 as const,
    cellId: rcStableId(input.cellId, "cellId"),
    objective: rcNonEmpty(input.objective, "objective"),
    verificationPolicyRef: parseReasoningPolicyRef(input.verificationPolicyRef, "verificationPolicyRef"),
    admissionPolicyRef: parseReasoningPolicyRef(input.admissionPolicyRef, "admissionPolicyRef"),
  });
}

export function parseReasoningCellDefinition(raw: unknown, what = "ReasoningCellDefinition"): ReasoningCellDefinition {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cellId", "objective", "verificationPolicyRef", "admissionPolicyRef"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  return materializeReasoningCellDefinition({
    cellId: object.cellId as string,
    objective: object.objective as string,
    verificationPolicyRef: object.verificationPolicyRef as ReasoningPolicyRef,
    admissionPolicyRef: object.admissionPolicyRef as ReasoningPolicyRef,
  });
}

/* ------------------------------------------------------------------ *
 * Branch / brief
 * ------------------------------------------------------------------ */

export interface ReasoningBranch {
  readonly schemaVersion: 1;
  readonly ref: ReasoningBranchRef;
  readonly question: string;
  /** Carrier attribution ONLY — never branch identity. */
  readonly attribution: ActivationRef | null;
  /** The frozen accepted frontier this branch was opened against. */
  readonly atFrontier: ReasoningFrontierBasis;
}

export function parseReasoningBranch(raw: unknown, what = "ReasoningBranch"): ReasoningBranch {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "ref", "question", "attribution", "atFrontier"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  return Object.freeze({
    schemaVersion: 1 as const,
    ref: parseReasoningBranchRef(object.ref, `${what}.ref`),
    question: rcNonEmpty(object.question, `${what}.question`),
    attribution: object.attribution === null ? null : parseActivationRef(object.attribution, `${what}.attribution`),
    atFrontier: parseReasoningFrontierBasis(object.atFrontier, `${what}.atFrontier`),
  });
}

/**
 * The branch-facing brief. It exposes the ACCEPTED FRONTIER ONLY — never pending sibling
 * candidates, sibling branches, a verification queue, or any private reasoning.
 */
export interface ReasoningBranchBrief {
  readonly schemaVersion: 1;
  readonly cell: ReasoningCellRef;
  readonly branch: ReasoningBranchRef;
  readonly objective: string;
  readonly question: string;
  readonly frontierBasis: ReasoningFrontierBasis;
  readonly acceptedClaims: readonly ReasoningClaimRef[];
}

export function parseReasoningBranchBrief(raw: unknown, what = "ReasoningBranchBrief"): ReasoningBranchBrief {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cell", "branch", "objective", "question", "frontierBasis", "acceptedClaims"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  if (!Array.isArray(object.acceptedClaims)) rcFail(`${what}.acceptedClaims must be an array`);
  return Object.freeze({
    schemaVersion: 1 as const,
    cell: parseReasoningCellRef(object.cell, `${what}.cell`),
    branch: parseReasoningBranchRef(object.branch, `${what}.branch`),
    objective: rcNonEmpty(object.objective, `${what}.objective`),
    question: rcNonEmpty(object.question, `${what}.question`),
    frontierBasis: parseReasoningFrontierBasis(object.frontierBasis, `${what}.frontierBasis`),
    acceptedClaims: Object.freeze(object.acceptedClaims.map((entry) => parseReasoningClaimRef(entry, `${what}.acceptedClaims[]`))),
  });
}

/* ------------------------------------------------------------------ *
 * Candidate
 * ------------------------------------------------------------------ */

/** An opaque reference to an Evidence-plane claim. Never an evidence body. */
export interface ExternalEvidenceRef {
  readonly evidenceId: string;
}

export function parseExternalEvidenceRef(raw: unknown, what = "ExternalEvidenceRef"): ExternalEvidenceRef {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["evidenceId"], what);
  return Object.freeze({ evidenceId: rcStableId(object.evidenceId, `${what}.evidenceId`) });
}

export interface ReasoningCandidate {
  readonly schemaVersion: 1;
  readonly cell: ReasoningCellRef;
  readonly branch: ReasoningBranchRef;
  readonly branchFrontierBasis: ReasoningFrontierBasis;
  readonly claim: ReasoningClaim;
  readonly externalEvidenceRefs: readonly ExternalEvidenceRef[];
  readonly candidateDigest: string;
}

export function reasoningCandidateDigestOf(input: Omit<ReasoningCandidate, "candidateDigest">): string {
  return canonicalDigest({
    domain: REASONING_CANDIDATE_DOMAIN,
    cell: input.cell,
    branch: input.branch,
    branchFrontierBasis: input.branchFrontierBasis,
    claim: input.claim,
    externalEvidenceRefs: [...input.externalEvidenceRefs].sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : 1)),
  });
}

export function parseReasoningCandidate(raw: unknown, what = "ReasoningCandidate"): ReasoningCandidate {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cell", "branch", "branchFrontierBasis", "claim", "externalEvidenceRefs", "candidateDigest"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  if (!Array.isArray(object.externalEvidenceRefs)) rcFail(`${what}.externalEvidenceRefs must be an array`);
  const base = {
    schemaVersion: 1 as const,
    cell: parseReasoningCellRef(object.cell, `${what}.cell`),
    branch: parseReasoningBranchRef(object.branch, `${what}.branch`),
    branchFrontierBasis: parseReasoningFrontierBasis(object.branchFrontierBasis, `${what}.branchFrontierBasis`),
    claim: parseReasoningClaim(object.claim, `${what}.claim`),
    externalEvidenceRefs: Object.freeze(object.externalEvidenceRefs.map((entry) => parseExternalEvidenceRef(entry, `${what}.externalEvidenceRefs[]`))),
  };
  const candidateDigest = rcDigest(object.candidateDigest, `${what}.candidateDigest`);
  if (candidateDigest !== reasoningCandidateDigestOf(base)) rcFail(`${what}.candidateDigest does not match its content`);
  return Object.freeze({ ...base, candidateDigest });
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */

export const REASONING_VERIFICATION_STANDINGS = Object.freeze(["SUPPORTED", "CONTRADICTED", "INCONCLUSIVE"] as const);
export type ReasoningVerificationStanding = (typeof REASONING_VERIFICATION_STANDINGS)[number];

export interface ReasoningVerificationResult {
  readonly schemaVersion: 1;
  readonly cell: ReasoningCellRef;
  readonly candidateDigest: string;
  readonly frontierBasis: ReasoningFrontierBasis;
  readonly verificationPolicyRef: ReasoningPolicyRef;
  readonly standing: ReasoningVerificationStanding;
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds: readonly string[];
  readonly provenanceDigest: string;
  readonly digest: string;
}

function evidenceIdList(raw: unknown, what: string): readonly string[] {
  if (!Array.isArray(raw)) rcFail(`${what} must be an array`);
  return Object.freeze([...new Set(raw.map((entry) => rcStableId(entry, `${what}[]`)))].sort());
}

export function reasoningVerificationDigestOf(input: Omit<ReasoningVerificationResult, "digest">): string {
  return canonicalDigest({ domain: REASONING_VERIFICATION_DOMAIN, ...input });
}

export function parseReasoningVerificationResult(raw: unknown, what = "ReasoningVerificationResult"): ReasoningVerificationResult {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cell", "candidateDigest", "frontierBasis", "verificationPolicyRef", "standing", "supportingEvidenceIds", "contradictingEvidenceIds", "provenanceDigest", "digest"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  const base = {
    schemaVersion: 1 as const,
    cell: parseReasoningCellRef(object.cell, `${what}.cell`),
    candidateDigest: rcDigest(object.candidateDigest, `${what}.candidateDigest`),
    frontierBasis: parseReasoningFrontierBasis(object.frontierBasis, `${what}.frontierBasis`),
    verificationPolicyRef: parseReasoningPolicyRef(object.verificationPolicyRef, `${what}.verificationPolicyRef`),
    standing: rcLiteral(object.standing, REASONING_VERIFICATION_STANDINGS, `${what}.standing`),
    supportingEvidenceIds: evidenceIdList(object.supportingEvidenceIds, `${what}.supportingEvidenceIds`),
    contradictingEvidenceIds: evidenceIdList(object.contradictingEvidenceIds, `${what}.contradictingEvidenceIds`),
    provenanceDigest: rcDigest(object.provenanceDigest, `${what}.provenanceDigest`),
  };
  const digest = rcDigest(object.digest, `${what}.digest`);
  if (digest !== reasoningVerificationDigestOf(base)) rcFail(`${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * Admission
 * ------------------------------------------------------------------ */

export const REASONING_ADMISSION_DECISIONS = Object.freeze(["ADMIT", "REJECT", "UNRESOLVED"] as const);
export type ReasoningAdmissionDecisionKind = (typeof REASONING_ADMISSION_DECISIONS)[number];

export interface ReasoningAdmissionDecision {
  readonly schemaVersion: 1;
  readonly cell: ReasoningCellRef;
  readonly candidateDigest: string;
  readonly verificationResultDigest: string;
  readonly frontierBasis: ReasoningFrontierBasis;
  readonly admissionPolicyRef: ReasoningPolicyRef;
  readonly decision: ReasoningAdmissionDecisionKind;
  readonly provenanceDigest: string;
  readonly digest: string;
}

export function reasoningAdmissionDigestOf(input: Omit<ReasoningAdmissionDecision, "digest">): string {
  return canonicalDigest({ domain: REASONING_ADMISSION_DOMAIN, ...input });
}

export function parseReasoningAdmissionDecision(raw: unknown, what = "ReasoningAdmissionDecision"): ReasoningAdmissionDecision {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cell", "candidateDigest", "verificationResultDigest", "frontierBasis", "admissionPolicyRef", "decision", "provenanceDigest", "digest"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  const base = {
    schemaVersion: 1 as const,
    cell: parseReasoningCellRef(object.cell, `${what}.cell`),
    candidateDigest: rcDigest(object.candidateDigest, `${what}.candidateDigest`),
    verificationResultDigest: rcDigest(object.verificationResultDigest, `${what}.verificationResultDigest`),
    frontierBasis: parseReasoningFrontierBasis(object.frontierBasis, `${what}.frontierBasis`),
    admissionPolicyRef: parseReasoningPolicyRef(object.admissionPolicyRef, `${what}.admissionPolicyRef`),
    decision: rcLiteral(object.decision, REASONING_ADMISSION_DECISIONS, `${what}.decision`),
    provenanceDigest: rcDigest(object.provenanceDigest, `${what}.provenanceDigest`),
  };
  const digest = rcDigest(object.digest, `${what}.digest`);
  if (digest !== reasoningAdmissionDigestOf(base)) rcFail(`${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * Invalidation
 * ------------------------------------------------------------------ */

export interface ClaimInvalidationRequest {
  readonly schemaVersion: 1;
  readonly cell: ReasoningCellRef;
  readonly targetClaimId: string;
  readonly frontierBasis: ReasoningFrontierBasis;
  readonly reason: string;
  readonly requestDigest: string;
}

export function claimInvalidationRequestDigestOf(input: Omit<ClaimInvalidationRequest, "requestDigest">): string {
  return canonicalDigest({ domain: REASONING_INVALIDATION_REQUEST_DOMAIN, ...input });
}

export function parseClaimInvalidationRequest(raw: unknown, what = "ClaimInvalidationRequest"): ClaimInvalidationRequest {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cell", "targetClaimId", "frontierBasis", "reason", "requestDigest"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  const base = {
    schemaVersion: 1 as const,
    cell: parseReasoningCellRef(object.cell, `${what}.cell`),
    targetClaimId: rcStableId(object.targetClaimId, `${what}.targetClaimId`),
    frontierBasis: parseReasoningFrontierBasis(object.frontierBasis, `${what}.frontierBasis`),
    reason: rcNonEmpty(object.reason, `${what}.reason`),
  };
  const requestDigest = rcDigest(object.requestDigest, `${what}.requestDigest`);
  if (requestDigest !== claimInvalidationRequestDigestOf(base)) rcFail(`${what}.requestDigest does not match its content`);
  return Object.freeze({ ...base, requestDigest });
}

export interface InvalidationVerificationResult {
  readonly schemaVersion: 1;
  readonly cell: ReasoningCellRef;
  readonly targetClaimId: string;
  readonly requestDigest: string;
  readonly frontierBasis: ReasoningFrontierBasis;
  readonly verificationPolicyRef: ReasoningPolicyRef;
  readonly standing: ReasoningVerificationStanding;
  readonly evidenceIds: readonly string[];
  readonly provenanceDigest: string;
  readonly digest: string;
}

export function invalidationVerificationDigestOf(input: Omit<InvalidationVerificationResult, "digest">): string {
  return canonicalDigest({ domain: REASONING_INVALIDATION_VERIFICATION_DOMAIN, ...input });
}

export function parseInvalidationVerificationResult(raw: unknown, what = "InvalidationVerificationResult"): InvalidationVerificationResult {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cell", "targetClaimId", "requestDigest", "frontierBasis", "verificationPolicyRef", "standing", "evidenceIds", "provenanceDigest", "digest"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  const base = {
    schemaVersion: 1 as const,
    cell: parseReasoningCellRef(object.cell, `${what}.cell`),
    targetClaimId: rcStableId(object.targetClaimId, `${what}.targetClaimId`),
    requestDigest: rcDigest(object.requestDigest, `${what}.requestDigest`),
    frontierBasis: parseReasoningFrontierBasis(object.frontierBasis, `${what}.frontierBasis`),
    verificationPolicyRef: parseReasoningPolicyRef(object.verificationPolicyRef, `${what}.verificationPolicyRef`),
    standing: rcLiteral(object.standing, REASONING_VERIFICATION_STANDINGS, `${what}.standing`),
    evidenceIds: evidenceIdList(object.evidenceIds, `${what}.evidenceIds`),
    provenanceDigest: rcDigest(object.provenanceDigest, `${what}.provenanceDigest`),
  };
  const digest = rcDigest(object.digest, `${what}.digest`);
  if (digest !== invalidationVerificationDigestOf(base)) rcFail(`${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

export const INVALIDATION_DECISIONS = Object.freeze(["INVALIDATE", "KEEP", "UNRESOLVED"] as const);
export type InvalidationDecisionKind = (typeof INVALIDATION_DECISIONS)[number];

export interface InvalidationAdmissionDecision {
  readonly schemaVersion: 1;
  readonly cell: ReasoningCellRef;
  readonly targetClaimId: string;
  readonly requestDigest: string;
  readonly verificationResultDigest: string;
  readonly frontierBasis: ReasoningFrontierBasis;
  readonly admissionPolicyRef: ReasoningPolicyRef;
  readonly decision: InvalidationDecisionKind;
  readonly provenanceDigest: string;
  readonly digest: string;
}

export function invalidationAdmissionDigestOf(input: Omit<InvalidationAdmissionDecision, "digest">): string {
  return canonicalDigest({ domain: REASONING_INVALIDATION_ADMISSION_DOMAIN, ...input });
}

export function parseInvalidationAdmissionDecision(raw: unknown, what = "InvalidationAdmissionDecision"): InvalidationAdmissionDecision {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cell", "targetClaimId", "requestDigest", "verificationResultDigest", "frontierBasis", "admissionPolicyRef", "decision", "provenanceDigest", "digest"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  const base = {
    schemaVersion: 1 as const,
    cell: parseReasoningCellRef(object.cell, `${what}.cell`),
    targetClaimId: rcStableId(object.targetClaimId, `${what}.targetClaimId`),
    requestDigest: rcDigest(object.requestDigest, `${what}.requestDigest`),
    verificationResultDigest: rcDigest(object.verificationResultDigest, `${what}.verificationResultDigest`),
    frontierBasis: parseReasoningFrontierBasis(object.frontierBasis, `${what}.frontierBasis`),
    admissionPolicyRef: parseReasoningPolicyRef(object.admissionPolicyRef, `${what}.admissionPolicyRef`),
    decision: rcLiteral(object.decision, INVALIDATION_DECISIONS, `${what}.decision`),
    provenanceDigest: rcDigest(object.provenanceDigest, `${what}.provenanceDigest`),
  };
  const digest = rcDigest(object.digest, `${what}.digest`);
  if (digest !== invalidationAdmissionDigestOf(base)) rcFail(`${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export type ReasoningEventType =
  | "REASONING_CELL_OPENED"
  | "REASONING_CELL_CLOSED"
  | "BRANCH_OPENED"
  | "BRANCH_CLOSED"
  | "CANDIDATE_SUBMITTED"
  | "CANDIDATE_DEDUPLICATED"
  | "CANDIDATE_REJECTED"
  | "VERIFICATION_RECORDED"
  | "ADMISSION_DECIDED"
  | "CLAIM_ADMITTED"
  | "CLAIM_INVALIDATION_REQUESTED"
  | "INVALIDATION_VERIFICATION_RECORDED"
  | "INVALIDATION_DECIDED"
  | "CLAIM_INVALIDATED";

export type ReasoningEventPayloadParser = (payload: unknown) => unknown;
export type ReasoningEventParsers = Readonly<Record<string, ReasoningEventPayloadParser>>;

export const REASONING_EVENT_PARSERS: ReasoningEventParsers = Object.freeze({
  REASONING_CELL_OPENED: (payload: unknown) => {
    const o = rcObject(payload, "REASONING_CELL_OPENED");
    rcExactKeys(o, ["definition"], "REASONING_CELL_OPENED");
    return Object.freeze({ definition: parseReasoningCellDefinition(o.definition) });
  },
  REASONING_CELL_CLOSED: (payload: unknown) => {
    const o = rcObject(payload, "REASONING_CELL_CLOSED");
    rcExactKeys(o, ["reason"], "REASONING_CELL_CLOSED");
    return Object.freeze({ reason: rcNonEmpty(o.reason, "reason") });
  },
  BRANCH_OPENED: (payload: unknown) => {
    const o = rcObject(payload, "BRANCH_OPENED");
    rcExactKeys(o, ["branch", "brief"], "BRANCH_OPENED");
    const brief = parseReasoningBranchBrief(o.brief);
    return Object.freeze({ branch: parseReasoningBranch(o.branch), brief });
  },
  BRANCH_CLOSED: (payload: unknown) => {
    const o = rcObject(payload, "BRANCH_CLOSED");
    rcExactKeys(o, ["branchId", "reason"], "BRANCH_CLOSED");
    return Object.freeze({ branchId: rcStableId(o.branchId, "branchId"), reason: rcNonEmpty(o.reason, "reason") });
  },
  CANDIDATE_SUBMITTED: (payload: unknown) => {
    const o = rcObject(payload, "CANDIDATE_SUBMITTED");
    rcExactKeys(o, ["candidate"], "CANDIDATE_SUBMITTED");
    return Object.freeze({ candidate: parseReasoningCandidate(o.candidate) });
  },
  CANDIDATE_DEDUPLICATED: (payload: unknown) => {
    const o = rcObject(payload, "CANDIDATE_DEDUPLICATED");
    rcExactKeys(o, ["candidateDigest", "existingClaimId"], "CANDIDATE_DEDUPLICATED");
    return Object.freeze({ candidateDigest: rcDigest(o.candidateDigest, "candidateDigest"), existingClaimId: rcStableId(o.existingClaimId, "existingClaimId") });
  },
  CANDIDATE_REJECTED: (payload: unknown) => {
    const o = rcObject(payload, "CANDIDATE_REJECTED");
    rcExactKeys(o, ["candidateDigest", "decisionDigest"], "CANDIDATE_REJECTED");
    return Object.freeze({ candidateDigest: rcDigest(o.candidateDigest, "candidateDigest"), decisionDigest: rcDigest(o.decisionDigest, "decisionDigest") });
  },
  VERIFICATION_RECORDED: (payload: unknown) => {
    const o = rcObject(payload, "VERIFICATION_RECORDED");
    rcExactKeys(o, ["verification"], "VERIFICATION_RECORDED");
    return Object.freeze({ verification: parseReasoningVerificationResult(o.verification) });
  },
  ADMISSION_DECIDED: (payload: unknown) => {
    const o = rcObject(payload, "ADMISSION_DECIDED");
    rcExactKeys(o, ["decision"], "ADMISSION_DECIDED");
    return Object.freeze({ decision: parseReasoningAdmissionDecision(o.decision) });
  },
  CLAIM_ADMITTED: (payload: unknown) => {
    const o = rcObject(payload, "CLAIM_ADMITTED");
    rcExactKeys(o, ["claimId", "claim", "admittedAtFrontier", "verificationResultDigest", "admissionDecisionDigest"], "CLAIM_ADMITTED");
    return Object.freeze({
      claimId: rcStableId(o.claimId, "claimId"),
      claim: parseReasoningClaim(o.claim),
      admittedAtFrontier: parseReasoningFrontierBasis(o.admittedAtFrontier, "admittedAtFrontier"),
      verificationResultDigest: rcDigest(o.verificationResultDigest, "verificationResultDigest"),
      admissionDecisionDigest: rcDigest(o.admissionDecisionDigest, "admissionDecisionDigest"),
    });
  },
  CLAIM_INVALIDATION_REQUESTED: (payload: unknown) => {
    const o = rcObject(payload, "CLAIM_INVALIDATION_REQUESTED");
    rcExactKeys(o, ["request"], "CLAIM_INVALIDATION_REQUESTED");
    return Object.freeze({ request: parseClaimInvalidationRequest(o.request) });
  },
  INVALIDATION_VERIFICATION_RECORDED: (payload: unknown) => {
    const o = rcObject(payload, "INVALIDATION_VERIFICATION_RECORDED");
    rcExactKeys(o, ["verification"], "INVALIDATION_VERIFICATION_RECORDED");
    return Object.freeze({ verification: parseInvalidationVerificationResult(o.verification) });
  },
  INVALIDATION_DECIDED: (payload: unknown) => {
    const o = rcObject(payload, "INVALIDATION_DECIDED");
    rcExactKeys(o, ["decision"], "INVALIDATION_DECIDED");
    return Object.freeze({ decision: parseInvalidationAdmissionDecision(o.decision) });
  },
  CLAIM_INVALIDATED: (payload: unknown) => {
    const o = rcObject(payload, "CLAIM_INVALIDATED");
    rcExactKeys(o, ["claimId", "requestDigest", "decisionDigest"], "CLAIM_INVALIDATED");
    return Object.freeze({ claimId: rcStableId(o.claimId, "claimId"), requestDigest: rcDigest(o.requestDigest, "requestDigest"), decisionDigest: rcDigest(o.decisionDigest, "decisionDigest") });
  },
});

export function reasoningChainDigest(input: {
  readonly cellId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly previousChainDigest: string | null;
}): string {
  return canonicalDigest({
    domain: REASONING_CHAIN_DOMAIN,
    cellId: input.cellId,
    seq: input.seq,
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    previous: input.previousChainDigest,
  });
}

export function reasoningEventIdOf(type: string, cellId: string, payload: unknown): string {
  return `rce-${canonicalDigest({ domain: "palimpsest.reasoning-cell-event.v1", type, cellId, payload }).slice(0, 32)}`;
}

/** Canonical cell ref for a cell id (used by views/events). */
export function reasoningCellRefOf(cellId: string): ReasoningCellRef {
  return materializeReasoningCellRef({ cellId });
}

