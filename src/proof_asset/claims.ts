/**
 * G10-T Proof/Evidence plane — Claims, verification, publication, assessment.
 *
 *   Evidence ≠ Claim        Candidate ≠ PublishedClaim        Claim ≠ Truth
 *   Verification ≠ PublicationAdmission        PublishedClaim ≠ Authority
 *   STALE ≠ FALSE           HistoricalSupport ≠ CurrentSupport
 *   ReasoningClaimRef ≠ EvidenceClaimRef
 *
 * This module owns the *forms* of proof-plane claims: typed candidate content
 * (strictly parsed by a registry), policy-produced verification results, the
 * publication decision record, immutable published claims, append-only claim
 * assessments, and the DERIVED (store-free) proof asset view.
 *
 * A `standing` is only ever a POLICY output. `ProofClaimStanding` reuses the
 * campaign's `CampaignClaimStatus` vocabulary verbatim so the two planes agree.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { JsonValue } from "../schema/canonical.js";
import type { EvidenceItem } from "./evidence.js";
import { parseEvidenceItem } from "./evidence.js";
import type { ProofClaimPortRef, ProofSourceRevisionRef } from "./refs.js";
import {
  parseProofClaimRefLike,
  parseProofSourceRevisionRef,
  proofDigestHex,
  proofEnum,
  proofEvidenceIdArray,
  proofFail,
  proofJsonValue,
  proofKeys,
  proofNonEmpty,
  proofObject,
  proofRefDigest,
  proofStableId,
  proofString,
  proofStringRecord,
} from "./refs.js";

/* ------------------------------------------------------------------ *
 * Policy refs
 * ------------------------------------------------------------------ */

export interface ProofPolicyRef {
  readonly policyId: string;
  readonly version: string;
}

export function materializeProofPolicyRef(input: { readonly policyId: string; readonly version: string }): ProofPolicyRef {
  return Object.freeze({ policyId: proofStableId(input.policyId, "policyId"), version: proofNonEmpty(input.version, "version") });
}

export function parseProofPolicyRef(raw: unknown, what = "ProofPolicyRef"): ProofPolicyRef {
  const object = proofObject(raw, what);
  proofKeys(object, ["policyId", "version"], ["policyId", "version"], what);
  return materializeProofPolicyRef({ policyId: object.policyId as string, version: object.version as string });
}

export function proofPolicyRefsEqual(a: ProofPolicyRef, b: ProofPolicyRef): boolean {
  return a.policyId === b.policyId && a.version === b.version;
}

/* ------------------------------------------------------------------ *
 * Claim type registry
 * ------------------------------------------------------------------ */

export interface ProofClaimTypeRef {
  readonly typeId: string;
  readonly version: string;
}

export function materializeProofClaimTypeRef(input: ProofClaimTypeRef): ProofClaimTypeRef {
  return Object.freeze({ typeId: proofStableId(input.typeId, "typeId"), version: proofNonEmpty(input.version, "version") });
}

export function parseProofClaimTypeRef(raw: unknown, what = "ProofClaimTypeRef"): ProofClaimTypeRef {
  const object = proofObject(raw, what);
  proofKeys(object, ["typeId", "version"], ["typeId", "version"], what);
  return materializeProofClaimTypeRef({ typeId: object.typeId as string, version: object.version as string });
}

export function proofClaimTypeKey(type: ProofClaimTypeRef): string {
  return `${type.typeId}@${type.version}`;
}

export interface ProofClaimTypeValidator {
  readonly type: ProofClaimTypeRef;
  /** Validate + canonicalize type-specific content, or throw. */
  parse(content: unknown): unknown;
}

/** Policy output: a verification result. `standing` is never caller-supplied. */
export interface ProofClaimTypeRegistry {
  get(typeRef: ProofClaimTypeRef): { parse(content: unknown): unknown } | undefined;
  list(): readonly { readonly typeId: string; readonly version: string }[];
}

export function makeProofClaimTypeRegistry(validators: readonly ProofClaimTypeValidator[]): ProofClaimTypeRegistry {
  const byKey = new Map(validators.map((validator) => [proofClaimTypeKey(materializeProofClaimTypeRef(validator.type)), validator]));
  return Object.freeze({
    get: (typeRef: ProofClaimTypeRef) => byKey.get(proofClaimTypeKey(materializeProofClaimTypeRef(typeRef))),
    list: () =>
      Object.freeze(
        [...byKey.values()]
          .map((validator) => Object.freeze({ typeId: validator.type.typeId, version: validator.type.version }))
          .sort((a, b) => (proofClaimTypeKey(a) < proofClaimTypeKey(b) ? -1 : proofClaimTypeKey(a) > proofClaimTypeKey(b) ? 1 : 0)),
      ),
  });
}

/* ------------------------------------------------------------------ *
 * Builtin claim types
 * ------------------------------------------------------------------ */

export interface ProofStatementContent {
  readonly statement: string;
}

export interface ProofAttributeContent {
  readonly attribute: string;
  readonly value: JsonValue;
  readonly validFrom?: string | undefined;
  readonly validUntil?: string | undefined;
}

export const PROOF_STATEMENT_TYPE: ProofClaimTypeRef = Object.freeze({ typeId: "proof.statement", version: "v1" });
export const PROOF_ATTRIBUTE_TYPE: ProofClaimTypeRef = Object.freeze({ typeId: "proof.attribute", version: "v1" });

export function parseProofStatementContent(raw: unknown, what = "proof.statement.v1"): ProofStatementContent {
  const object = proofObject(raw, what);
  proofKeys(object, ["statement"], ["statement"], what);
  return Object.freeze({ statement: proofNonEmpty(object.statement, `${what}.statement`) });
}

export function parseProofAttributeContent(raw: unknown, what = "proof.attribute.v1"): ProofAttributeContent {
  const object = proofObject(raw, what);
  proofKeys(object, ["attribute", "value", "validFrom", "validUntil"], ["attribute", "value"], what);
  const attribute = proofNonEmpty(object.attribute, `${what}.attribute`);
  const value = proofJsonValue(object.value, `${what}.value`);
  const validFrom = object.validFrom === undefined ? undefined : proofNonEmpty(object.validFrom, `${what}.validFrom`);
  const validUntil = object.validUntil === undefined ? undefined : proofNonEmpty(object.validUntil, `${what}.validUntil`);
  if (validFrom !== undefined) assertIsoInstant(validFrom, `${what}.validFrom`);
  if (validUntil !== undefined) assertIsoInstant(validUntil, `${what}.validUntil`);
  if (validFrom !== undefined && validUntil !== undefined && validFrom > validUntil) {
    proofFail("invalid_value", `${what}: validFrom must be <= validUntil`);
  }
  return Object.freeze({
    attribute,
    value,
    ...(validFrom === undefined ? {} : { validFrom }),
    ...(validUntil === undefined ? {} : { validUntil }),
  });
}

function assertIsoInstant(value: string, what: string): void {
  if (!Number.isFinite(Date.parse(value))) proofFail("invalid_value", `${what} must be an ISO-8601 instant`);
}

export function builtinProofClaimTypes(): ProofClaimTypeRegistry {
  return makeProofClaimTypeRegistry([
    { type: PROOF_STATEMENT_TYPE, parse: parseProofStatementContent },
    { type: PROOF_ATTRIBUTE_TYPE, parse: parseProofAttributeContent },
  ]);
}

/* ------------------------------------------------------------------ *
 * Standing (same vocabulary as CampaignClaimStatus)
 * ------------------------------------------------------------------ */

export const PROOF_CLAIM_STANDINGS = ["SUPPORTED", "PARTIALLY_SUPPORTED", "CONTRADICTED", "INCONCLUSIVE", "STALE"] as const;
export type ProofClaimStanding = (typeof PROOF_CLAIM_STANDINGS)[number];

/* ------------------------------------------------------------------ *
 * Candidate claim
 * ------------------------------------------------------------------ */

export const PROOF_CLAIM_CANDIDATE_DOMAIN = "palimpsest.proof.claim-candidate.v1";
export const PROOF_CLAIM_CANDIDATE_ID_DOMAIN = "palimpsest.proof.claim-candidate-id.v1";

export const PROOF_CLAIM_ORIGINS = ["MANUAL", "REASONING_CELL", "IMPORT"] as const;
export type ProofClaimOrigin = (typeof PROOF_CLAIM_ORIGINS)[number];

export interface ProofEvidenceRef {
  readonly evidenceId: string;
}

export interface ProofClaimCandidate {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly claimType: ProofClaimTypeRef;
  readonly content: unknown;
  readonly supportingEvidence: readonly ProofEvidenceRef[];
  readonly contradictingEvidence: readonly ProofEvidenceRef[];
  readonly dependencies: readonly ProofClaimPortRef[];
  readonly origin: ProofClaimOrigin;
  readonly provenance: Readonly<Record<string, string>>;
  readonly digest: string;
}

function evidenceRefsOf(ids: readonly string[], what: string): readonly ProofEvidenceRef[] {
  return Object.freeze(proofEvidenceIdArray(ids, what).map((evidenceId) => Object.freeze({ evidenceId })));
}

function dependencyRefsOf(refs: readonly ProofClaimPortRef[], what: string): readonly ProofClaimPortRef[] {
  if (!Array.isArray(refs)) proofFail("invalid_value", `${what} must be an array`);
  const seen = new Set<string>();
  const out: ProofClaimPortRef[] = [];
  for (const entry of refs) {
    const ref = Object.freeze({ claimId: proofStableId(entry.claimId, `${what}[]`) });
    if (seen.has(ref.claimId)) proofFail("invalid_value", `${what}: duplicate dependency "${ref.claimId}"`);
    seen.add(ref.claimId);
    out.push(ref);
  }
  return Object.freeze(out.sort((a, b) => (a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0)));
}

export function proofClaimCandidateDigestOf(input: {
  readonly claimType: ProofClaimTypeRef;
  readonly content: unknown;
  readonly supportingEvidence: readonly ProofEvidenceRef[];
  readonly contradictingEvidence: readonly ProofEvidenceRef[];
  readonly dependencies: readonly ProofClaimPortRef[];
  readonly origin: ProofClaimOrigin;
  readonly provenance: Readonly<Record<string, string>>;
}): string {
  return canonicalDigest({
    domain: PROOF_CLAIM_CANDIDATE_DOMAIN,
    claimType: input.claimType,
    content: input.content,
    supportingEvidence: input.supportingEvidence.map((entry) => entry.evidenceId).sort(),
    contradictingEvidence: input.contradictingEvidence.map((entry) => entry.evidenceId).sort(),
    dependencies: input.dependencies.map((entry) => entry.claimId).sort(),
    origin: input.origin,
    provenance: input.provenance,
  });
}

export interface MaterializeProofClaimCandidateInput {
  readonly claimType: ProofClaimTypeRef;
  readonly content: unknown;
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds?: readonly string[] | undefined;
  readonly dependencies?: readonly ProofClaimPortRef[] | undefined;
  readonly origin: ProofClaimOrigin;
  readonly provenance?: Readonly<Record<string, string>> | undefined;
}

export function materializeProofClaimCandidate(
  input: MaterializeProofClaimCandidateInput,
  registry: ProofClaimTypeRegistry = builtinProofClaimTypes(),
): ProofClaimCandidate {
  const claimType = materializeProofClaimTypeRef(input.claimType);
  const validator = registry.get(claimType);
  if (validator === undefined) proofFail("unknown_kind", `unknown proof claim type "${proofClaimTypeKey(claimType)}"`);
  let content: unknown;
  try {
    content = validator.parse(input.content);
  } catch (error) {
    proofFail("invalid_value", `claim content is invalid for "${proofClaimTypeKey(claimType)}": ${error instanceof Error ? error.message : String(error)}`);
  }
  const supportingEvidence = evidenceRefsOf(input.supportingEvidenceIds, "supportingEvidence");
  const contradictingEvidence = evidenceRefsOf(input.contradictingEvidenceIds ?? [], "contradictingEvidence");
  const dependencies = dependencyRefsOf(input.dependencies ?? [], "dependencies");
  const origin = proofEnum(input.origin, PROOF_CLAIM_ORIGINS, "origin");
  const provenance = input.provenance === undefined ? Object.freeze({} as Record<string, string>) : proofStringRecord(input.provenance, "provenance");
  const digest = proofClaimCandidateDigestOf({ claimType, content, supportingEvidence, contradictingEvidence, dependencies, origin, provenance });
  const candidateId = proofRefDigest(PROOF_CLAIM_CANDIDATE_ID_DOMAIN, digest, "pcc");
  return Object.freeze({
    schemaVersion: 1 as const,
    candidateId,
    claimType,
    content,
    supportingEvidence,
    contradictingEvidence,
    dependencies,
    origin,
    provenance,
    digest,
  });
}

export function parseProofClaimCandidate(
  raw: unknown,
  what = "ProofClaimCandidate",
  registry: ProofClaimTypeRegistry = builtinProofClaimTypes(),
): ProofClaimCandidate {
  const object = proofObject(raw, what);
  proofKeys(
    object,
    ["schemaVersion", "candidateId", "claimType", "content", "supportingEvidence", "contradictingEvidence", "dependencies", "origin", "provenance", "digest"],
    ["schemaVersion", "candidateId", "claimType", "content", "supportingEvidence", "contradictingEvidence", "dependencies", "origin", "provenance", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const claimType = parseProofClaimTypeRef(object.claimType, `${what}.claimType`);
  const validator = registry.get(claimType);
  if (validator === undefined) proofFail("unknown_kind", `${what}.claimType "${proofClaimTypeKey(claimType)}" is not registered`);
  let content: unknown;
  try {
    content = validator.parse(object.content);
  } catch (error) {
    proofFail("invalid_value", `${what}.content is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const supportingEvidence = parseEvidenceRefs(object.supportingEvidence, `${what}.supportingEvidence`);
  const contradictingEvidence = parseEvidenceRefs(object.contradictingEvidence, `${what}.contradictingEvidence`);
  const rawDependencies = object.dependencies;
  if (!Array.isArray(rawDependencies)) proofFail("invalid_value", `${what}.dependencies must be an array`);
  const dependencies = Object.freeze(
    rawDependencies
      .map((entry) => parseProofClaimRefLike(entry, `${what}.dependencies[]`))
      .sort((a, b) => (a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0)),
  );
  const origin = proofEnum(object.origin, PROOF_CLAIM_ORIGINS, `${what}.origin`);
  const provenance = proofStringRecord(object.provenance, `${what}.provenance`);
  const expectedDigest = proofClaimCandidateDigestOf({ claimType, content, supportingEvidence, contradictingEvidence, dependencies, origin, provenance });
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (digest !== expectedDigest) proofFail("invalid_value", `${what}.digest does not match its content`);
  const candidateId = proofString(object.candidateId, `${what}.candidateId`);
  if (candidateId !== proofRefDigest(PROOF_CLAIM_CANDIDATE_ID_DOMAIN, digest, "pcc")) {
    proofFail("invalid_value", `${what}.candidateId must be derived from the candidate digest`);
  }
  return Object.freeze({ schemaVersion: 1 as const, candidateId, claimType, content, supportingEvidence, contradictingEvidence, dependencies, origin, provenance, digest });
}

function parseEvidenceRefs(raw: unknown, what: string): readonly ProofEvidenceRef[] {
  if (!Array.isArray(raw)) proofFail("invalid_value", `${what} must be an array`);
  const seen = new Set<string>();
  const out: ProofEvidenceRef[] = [];
  for (const entry of raw) {
    const object = proofObject(entry, `${what}[]`);
    proofKeys(object, ["evidenceId"], ["evidenceId"], `${what}[]`);
    const evidenceId = proofStableId(object.evidenceId, `${what}[].evidenceId`);
    if (seen.has(evidenceId)) proofFail("invalid_value", `${what}: duplicate evidence "${evidenceId}"`);
    seen.add(evidenceId);
    out.push(Object.freeze({ evidenceId }));
  }
  return Object.freeze(out.sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0)));
}

/* ------------------------------------------------------------------ *
 * Verification result (POLICY output — never caller-supplied standing)
 * ------------------------------------------------------------------ */

export const PROOF_VERIFICATION_DOMAIN = "palimpsest.proof.verification.v1";

export interface ProofVerificationResult {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly standing: ProofClaimStanding;
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds: readonly string[];
  readonly policyRef: ProofPolicyRef;
  readonly provenanceDigest: string;
  readonly digest: string;
}

export function proofVerificationDigestOf(input: Omit<ProofVerificationResult, "digest">): string {
  return canonicalDigest({
    domain: PROOF_VERIFICATION_DOMAIN,
    candidateId: input.candidateId,
    standing: input.standing,
    supportingEvidenceIds: [...input.supportingEvidenceIds].sort(),
    contradictingEvidenceIds: [...input.contradictingEvidenceIds].sort(),
    policyRef: input.policyRef,
    provenanceDigest: input.provenanceDigest,
  });
}

export interface MaterializeProofVerificationResultInput {
  readonly candidateId: string;
  readonly standing: ProofClaimStanding;
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds?: readonly string[] | undefined;
  readonly policyRef: ProofPolicyRef;
  readonly provenanceDigest: string;
}

export function materializeProofVerificationResult(input: MaterializeProofVerificationResultInput): ProofVerificationResult {
  const base: Omit<ProofVerificationResult, "digest"> = {
    schemaVersion: 1 as const,
    candidateId: proofStableId(input.candidateId, "candidateId"),
    standing: proofEnum(input.standing, PROOF_CLAIM_STANDINGS, "standing"),
    supportingEvidenceIds: proofEvidenceIdArray(input.supportingEvidenceIds, "supportingEvidenceIds"),
    contradictingEvidenceIds: proofEvidenceIdArray(input.contradictingEvidenceIds ?? [], "contradictingEvidenceIds"),
    policyRef: materializeProofPolicyRef(input.policyRef),
    provenanceDigest: proofDigestHex(input.provenanceDigest, "provenanceDigest"),
  };
  return Object.freeze({ ...base, digest: proofVerificationDigestOf(base) });
}

export function parseProofVerificationResult(raw: unknown, what = "ProofVerificationResult"): ProofVerificationResult {
  const object = proofObject(raw, what);
  proofKeys(
    object,
    ["schemaVersion", "candidateId", "standing", "supportingEvidenceIds", "contradictingEvidenceIds", "policyRef", "provenanceDigest", "digest"],
    ["schemaVersion", "candidateId", "standing", "supportingEvidenceIds", "contradictingEvidenceIds", "policyRef", "provenanceDigest", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const base: Omit<ProofVerificationResult, "digest"> = {
    schemaVersion: 1 as const,
    candidateId: proofStableId(object.candidateId, `${what}.candidateId`),
    standing: proofEnum(object.standing, PROOF_CLAIM_STANDINGS, `${what}.standing`),
    supportingEvidenceIds: proofEvidenceIdArray(object.supportingEvidenceIds, `${what}.supportingEvidenceIds`),
    contradictingEvidenceIds: proofEvidenceIdArray(object.contradictingEvidenceIds, `${what}.contradictingEvidenceIds`),
    policyRef: parseProofPolicyRef(object.policyRef, `${what}.policyRef`),
    provenanceDigest: proofDigestHex(object.provenanceDigest, `${what}.provenanceDigest`),
  };
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (proofVerificationDigestOf(base) !== digest) proofFail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * Publication
 * ------------------------------------------------------------------ */

export const PROOF_PUBLICATION_DECISION_DOMAIN = "palimpsest.proof.publication-decision.v1";
export const PROOF_PUBLISHED_CLAIM_DOMAIN = "palimpsest.proof.published-claim.v1";
export const PROOF_PUBLISHED_CLAIM_ID_DOMAIN = "palimpsest.proof.published-claim-id.v1";

export const PROOF_PUBLICATION_DECISIONS = ["PUBLISH", "REJECT", "UNRESOLVED"] as const;
export type ProofPublicationDecision = (typeof PROOF_PUBLICATION_DECISIONS)[number];

export interface ProofPublicationDecisionRecord {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly decision: ProofPublicationDecision;
  readonly policyRef: ProofPolicyRef;
  readonly verificationDigest: string;
  readonly provenanceDigest: string;
  readonly claimRef?: ProofClaimPortRef | undefined;
  readonly decidedAt: string;
  readonly digest: string;
}

export function proofPublicationDecisionDigestOf(input: Omit<ProofPublicationDecisionRecord, "digest">): string {
  return canonicalDigest({
    domain: PROOF_PUBLICATION_DECISION_DOMAIN,
    candidateId: input.candidateId,
    decision: input.decision,
    policyRef: input.policyRef,
    verificationDigest: input.verificationDigest,
    provenanceDigest: input.provenanceDigest,
    claimRef: input.claimRef ?? null,
    decidedAt: input.decidedAt,
  });
}

export function materializeProofPublicationDecisionRecord(input: {
  readonly candidateId: string;
  readonly decision: ProofPublicationDecision;
  readonly policyRef: ProofPolicyRef;
  readonly verificationDigest: string;
  readonly provenanceDigest: string;
  readonly claimRef?: ProofClaimPortRef | undefined;
  readonly decidedAt: string;
}): ProofPublicationDecisionRecord {
  const base: Omit<ProofPublicationDecisionRecord, "digest"> = {
    schemaVersion: 1 as const,
    candidateId: proofStableId(input.candidateId, "candidateId"),
    decision: proofEnum(input.decision, PROOF_PUBLICATION_DECISIONS, "decision"),
    policyRef: materializeProofPolicyRef(input.policyRef),
    verificationDigest: proofDigestHex(input.verificationDigest, "verificationDigest"),
    provenanceDigest: proofDigestHex(input.provenanceDigest, "provenanceDigest"),
    ...(input.claimRef === undefined ? {} : { claimRef: Object.freeze({ claimId: proofStableId(input.claimRef.claimId, "claimRef.claimId") }) }),
    decidedAt: proofNonEmpty(input.decidedAt, "decidedAt"),
  };
  return Object.freeze({ ...base, digest: proofPublicationDecisionDigestOf(base) });
}

export function parseProofPublicationDecisionRecord(raw: unknown, what = "ProofPublicationDecisionRecord"): ProofPublicationDecisionRecord {
  const object = proofObject(raw, what);
  proofKeys(
    object,
    ["schemaVersion", "candidateId", "decision", "policyRef", "verificationDigest", "provenanceDigest", "claimRef", "decidedAt", "digest"],
    ["schemaVersion", "candidateId", "decision", "policyRef", "verificationDigest", "provenanceDigest", "decidedAt", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const claimRefRaw = object.claimRef;
  const claimRef = claimRefRaw === undefined ? undefined : parseClaimRefPort(claimRefRaw, `${what}.claimRef`);
  const base: Omit<ProofPublicationDecisionRecord, "digest"> = {
    schemaVersion: 1 as const,
    candidateId: proofStableId(object.candidateId, `${what}.candidateId`),
    decision: proofEnum(object.decision, PROOF_PUBLICATION_DECISIONS, `${what}.decision`),
    policyRef: parseProofPolicyRef(object.policyRef, `${what}.policyRef`),
    verificationDigest: proofDigestHex(object.verificationDigest, `${what}.verificationDigest`),
    provenanceDigest: proofDigestHex(object.provenanceDigest, `${what}.provenanceDigest`),
    ...(claimRef === undefined ? {} : { claimRef }),
    decidedAt: proofNonEmpty(object.decidedAt, `${what}.decidedAt`),
  };
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (proofPublicationDecisionDigestOf(base) !== digest) proofFail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

function parseClaimRefPort(raw: unknown, what: string): ProofClaimPortRef {
  const object = proofObject(raw, what);
  proofKeys(object, ["claimId"], ["claimId"], what);
  return Object.freeze({ claimId: proofStableId(object.claimId, `${what}.claimId`) });
}

export interface PublishedProofClaim {
  readonly schemaVersion: 1;
  readonly claimRef: ProofClaimPortRef;
  readonly claimType: ProofClaimTypeRef;
  readonly content: unknown;
  readonly publicationProvenance: Readonly<Record<string, string>>;
  readonly publishedAt: string;
  readonly digest: string;
}

export function proofPublishedClaimDigestOf(input: Omit<PublishedProofClaim, "digest">): string {
  return canonicalDigest({
    domain: PROOF_PUBLISHED_CLAIM_DOMAIN,
    claimRef: input.claimRef,
    claimType: input.claimType,
    content: input.content,
    publicationProvenance: input.publicationProvenance,
    publishedAt: input.publishedAt,
  });
}

export function materializePublishedProofClaim(
  input: {
    readonly claimRef: ProofClaimPortRef;
    readonly claimType: ProofClaimTypeRef;
    readonly content: unknown;
    readonly publicationProvenance?: Readonly<Record<string, string>> | undefined;
    readonly publishedAt: string;
  },
  registry: ProofClaimTypeRegistry = builtinProofClaimTypes(),
): PublishedProofClaim {
  const claimRef = parseClaimRefPort(input.claimRef, "claimRef");
  const claimType = materializeProofClaimTypeRef(input.claimType);
  const validator = registry.get(claimType);
  if (validator === undefined) proofFail("unknown_kind", `unknown proof claim type "${proofClaimTypeKey(claimType)}"`);
  let content: unknown;
  try {
    content = validator.parse(input.content);
  } catch (error) {
    proofFail("invalid_value", `published content is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const base: Omit<PublishedProofClaim, "digest"> = {
    schemaVersion: 1 as const,
    claimRef,
    claimType,
    content,
    publicationProvenance: input.publicationProvenance === undefined ? Object.freeze({} as Record<string, string>) : proofStringRecord(input.publicationProvenance, "publicationProvenance"),
    publishedAt: proofNonEmpty(input.publishedAt, "publishedAt"),
  };
  return Object.freeze({ ...base, digest: proofPublishedClaimDigestOf(base) });
}

export function parsePublishedProofClaim(
  raw: unknown,
  what = "PublishedProofClaim",
  registry: ProofClaimTypeRegistry = builtinProofClaimTypes(),
): PublishedProofClaim {
  const object = proofObject(raw, what);
  proofKeys(
    object,
    ["schemaVersion", "claimRef", "claimType", "content", "publicationProvenance", "publishedAt", "digest"],
    ["schemaVersion", "claimRef", "claimType", "content", "publicationProvenance", "publishedAt", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const claimType = parseProofClaimTypeRef(object.claimType, `${what}.claimType`);
  const validator = registry.get(claimType);
  if (validator === undefined) proofFail("unknown_kind", `${what}.claimType "${proofClaimTypeKey(claimType)}" is not registered`);
  let content: unknown;
  try {
    content = validator.parse(object.content);
  } catch (error) {
    proofFail("invalid_value", `${what}.content is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const base: Omit<PublishedProofClaim, "digest"> = {
    schemaVersion: 1 as const,
    claimRef: parseClaimRefPort(object.claimRef, `${what}.claimRef`),
    claimType,
    content,
    publicationProvenance: proofStringRecord(object.publicationProvenance, `${what}.publicationProvenance`),
    publishedAt: proofNonEmpty(object.publishedAt, `${what}.publishedAt`),
  };
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (proofPublishedClaimDigestOf(base) !== digest) proofFail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * Append-only claim assessment history
 * ------------------------------------------------------------------ */

export const PROOF_ASSESSMENT_DOMAIN = "palimpsest.proof.assessment.v1";
export const PROOF_ASSESSMENT_ID_DOMAIN = "palimpsest.proof.assessment-id.v1";

export interface ClaimAssessmentRevision {
  readonly schemaVersion: 1;
  readonly assessmentId: string;
  readonly claimRef: ProofClaimPortRef;
  readonly verificationPolicyRef: ProofPolicyRef;
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds: readonly string[];
  readonly standing: ProofClaimStanding;
  readonly provenanceDigest: string;
  readonly previousAssessmentId?: string | undefined;
  readonly assessedAt: string;
  readonly digest: string;
}

export function claimAssessmentDigestOf(input: Omit<ClaimAssessmentRevision, "digest" | "assessmentId">): string {
  return canonicalDigest({
    domain: PROOF_ASSESSMENT_DOMAIN,
    claimRef: input.claimRef,
    verificationPolicyRef: input.verificationPolicyRef,
    supportingEvidenceIds: [...input.supportingEvidenceIds].sort(),
    contradictingEvidenceIds: [...input.contradictingEvidenceIds].sort(),
    standing: input.standing,
    provenanceDigest: input.provenanceDigest,
    previousAssessmentId: input.previousAssessmentId ?? null,
    assessedAt: input.assessedAt,
  });
}

export function materializeClaimAssessmentRevision(input: {
  readonly claimRef: ProofClaimPortRef;
  readonly verificationPolicyRef: ProofPolicyRef;
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds?: readonly string[] | undefined;
  readonly standing: ProofClaimStanding;
  readonly provenanceDigest: string;
  readonly previousAssessmentId?: string | undefined;
  readonly assessedAt: string;
}): ClaimAssessmentRevision {
  const base: Omit<ClaimAssessmentRevision, "digest" | "assessmentId"> = {
    schemaVersion: 1 as const,
    claimRef: parseClaimRefPort(input.claimRef, "claimRef"),
    verificationPolicyRef: materializeProofPolicyRef(input.verificationPolicyRef),
    supportingEvidenceIds: proofEvidenceIdArray(input.supportingEvidenceIds, "supportingEvidenceIds"),
    contradictingEvidenceIds: proofEvidenceIdArray(input.contradictingEvidenceIds ?? [], "contradictingEvidenceIds"),
    standing: proofEnum(input.standing, PROOF_CLAIM_STANDINGS, "standing"),
    provenanceDigest: proofDigestHex(input.provenanceDigest, "provenanceDigest"),
    ...(input.previousAssessmentId === undefined ? {} : { previousAssessmentId: proofStableId(input.previousAssessmentId, "previousAssessmentId") }),
    assessedAt: proofNonEmpty(input.assessedAt, "assessedAt"),
  };
  const digest = claimAssessmentDigestOf(base);
  const assessmentId = proofRefDigest(PROOF_ASSESSMENT_ID_DOMAIN, digest, "assess");
  return Object.freeze({ ...base, assessmentId, digest });
}

export function parseClaimAssessmentRevision(raw: unknown, what = "ClaimAssessmentRevision"): ClaimAssessmentRevision {
  const object = proofObject(raw, what);
  proofKeys(
    object,
    ["schemaVersion", "assessmentId", "claimRef", "verificationPolicyRef", "supportingEvidenceIds", "contradictingEvidenceIds", "standing", "provenanceDigest", "previousAssessmentId", "assessedAt", "digest"],
    ["schemaVersion", "assessmentId", "claimRef", "verificationPolicyRef", "supportingEvidenceIds", "contradictingEvidenceIds", "standing", "provenanceDigest", "assessedAt", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const previousRaw = object.previousAssessmentId;
  const base: Omit<ClaimAssessmentRevision, "digest" | "assessmentId"> = {
    schemaVersion: 1 as const,
    claimRef: parseClaimRefPort(object.claimRef, `${what}.claimRef`),
    verificationPolicyRef: parseProofPolicyRef(object.verificationPolicyRef, `${what}.verificationPolicyRef`),
    supportingEvidenceIds: proofEvidenceIdArray(object.supportingEvidenceIds, `${what}.supportingEvidenceIds`),
    contradictingEvidenceIds: proofEvidenceIdArray(object.contradictingEvidenceIds, `${what}.contradictingEvidenceIds`),
    standing: proofEnum(object.standing, PROOF_CLAIM_STANDINGS, `${what}.standing`),
    provenanceDigest: proofDigestHex(object.provenanceDigest, `${what}.provenanceDigest`),
    ...(previousRaw === undefined ? {} : { previousAssessmentId: proofStableId(previousRaw, `${what}.previousAssessmentId`) }),
    assessedAt: proofNonEmpty(object.assessedAt, `${what}.assessedAt`),
  };
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (claimAssessmentDigestOf(base) !== digest) proofFail("invalid_value", `${what}.digest does not match its content`);
  const assessmentId = proofString(object.assessmentId, `${what}.assessmentId`);
  if (assessmentId !== proofRefDigest(PROOF_ASSESSMENT_ID_DOMAIN, digest, "assess")) {
    proofFail("invalid_value", `${what}.assessmentId must be derived from the assessment digest`);
  }
  return Object.freeze({ ...base, assessmentId, digest });
}

/* ------------------------------------------------------------------ *
 * Dependency edge record (published claim → dependency claim)
 * ------------------------------------------------------------------ */

export const PROOF_DEPENDENCY_DOMAIN = "palimpsest.proof.dependency.v1";

export interface ProofDependencyRecord {
  readonly schemaVersion: 1;
  readonly claimRef: ProofClaimPortRef;
  readonly dependsOnClaimId: string;
  readonly recordedAt: string;
  readonly digest: string;
}

export function proofDependencyDigestOf(input: Omit<ProofDependencyRecord, "digest">): string {
  return canonicalDigest({
    domain: PROOF_DEPENDENCY_DOMAIN,
    claimRef: input.claimRef,
    dependsOnClaimId: input.dependsOnClaimId,
    recordedAt: input.recordedAt,
  });
}

export function materializeProofDependencyRecord(input: {
  readonly claimRef: ProofClaimPortRef;
  readonly dependsOnClaimId: string;
  readonly recordedAt: string;
}): ProofDependencyRecord {
  const base: Omit<ProofDependencyRecord, "digest"> = {
    schemaVersion: 1 as const,
    claimRef: parseClaimRefPort(input.claimRef, "claimRef"),
    dependsOnClaimId: proofStableId(input.dependsOnClaimId, "dependsOnClaimId"),
    recordedAt: proofNonEmpty(input.recordedAt, "recordedAt"),
  };
  return Object.freeze({ ...base, digest: proofDependencyDigestOf(base) });
}

export function parseProofDependencyRecord(raw: unknown, what = "ProofDependencyRecord"): ProofDependencyRecord {
  const object = proofObject(raw, what);
  proofKeys(object, ["schemaVersion", "claimRef", "dependsOnClaimId", "recordedAt", "digest"], ["schemaVersion", "claimRef", "dependsOnClaimId", "recordedAt", "digest"], what);
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const base: Omit<ProofDependencyRecord, "digest"> = {
    schemaVersion: 1 as const,
    claimRef: parseClaimRefPort(object.claimRef, `${what}.claimRef`),
    dependsOnClaimId: proofStableId(object.dependsOnClaimId, `${what}.dependsOnClaimId`),
    recordedAt: proofNonEmpty(object.recordedAt, `${what}.recordedAt`),
  };
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (proofDependencyDigestOf(base) !== digest) proofFail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * Freshness policy + DERIVED proof asset view
 * ------------------------------------------------------------------ */

export const FRESHNESS_POLICIES = ["IMMUTABLE_EVIDENCE", "LATEST_SOURCE_REVISION", "EXPIRES_AT"] as const;
export type FreshnessPolicy = (typeof FRESHNESS_POLICIES)[number];

export const PROOF_FRESHNESS_STATES = ["fresh", "stale", "unknown"] as const;
export type ProofFreshness = (typeof PROOF_FRESHNESS_STATES)[number];

export const PROOF_ASSET_VIEW_DOMAIN = "palimpsest.proof.asset-view.v1";

export interface ProofAssetDependency {
  readonly claimId: string;
  readonly effectiveStanding: ProofClaimStanding;
}

export interface ProofAssetView {
  readonly schemaVersion: 1;
  readonly claimRef: ProofClaimPortRef;
  readonly claimType: ProofClaimTypeRef;
  readonly content: unknown;
  readonly baseStanding: ProofClaimStanding;
  readonly effectiveStanding: ProofClaimStanding;
  readonly freshness: ProofFreshness;
  readonly freshnessExplanation: string;
  readonly supportingEvidence: readonly EvidenceItem[];
  readonly contradictingEvidence: readonly EvidenceItem[];
  readonly sourceRevisions: readonly ProofSourceRevisionRef[];
  readonly dependencies: readonly ProofAssetDependency[];
  readonly publicationProvenance: Readonly<Record<string, string>>;
  readonly digest: string;
}

export function proofAssetViewDigestOf(input: Omit<ProofAssetView, "digest">): string {
  return canonicalDigest({
    domain: PROOF_ASSET_VIEW_DOMAIN,
    claimRef: input.claimRef,
    claimType: input.claimType,
    content: input.content,
    baseStanding: input.baseStanding,
    effectiveStanding: input.effectiveStanding,
    freshness: input.freshness,
    freshnessExplanation: input.freshnessExplanation,
    supportingEvidence: input.supportingEvidence.map((item) => item.evidenceId).sort(),
    contradictingEvidence: input.contradictingEvidence.map((item) => item.evidenceId).sort(),
    sourceRevisions: input.sourceRevisions.map((ref) => `${ref.sourceId}\u0000${ref.revision}\u0000${ref.contentDigest}`).sort(),
    dependencies: input.dependencies.map((entry) => `${entry.claimId}\u0000${entry.effectiveStanding}`).sort(),
    publicationProvenance: input.publicationProvenance,
  });
}

export interface MaterializeProofAssetViewInput {
  readonly claimRef: ProofClaimPortRef;
  readonly claimType: ProofClaimTypeRef;
  readonly content: unknown;
  readonly baseStanding: ProofClaimStanding;
  readonly effectiveStanding: ProofClaimStanding;
  readonly freshness: ProofFreshness;
  readonly freshnessExplanation: string;
  readonly supportingEvidence: readonly EvidenceItem[];
  readonly contradictingEvidence: readonly EvidenceItem[];
  readonly sourceRevisions: readonly ProofSourceRevisionRef[];
  readonly dependencies: readonly ProofAssetDependency[];
  readonly publicationProvenance: Readonly<Record<string, string>>;
}

export function materializeProofAssetView(input: MaterializeProofAssetViewInput): ProofAssetView {
  const base: Omit<ProofAssetView, "digest"> = {
    schemaVersion: 1 as const,
    claimRef: parseClaimRefPort(input.claimRef, "claimRef"),
    claimType: materializeProofClaimTypeRef(input.claimType),
    content: input.content,
    baseStanding: proofEnum(input.baseStanding, PROOF_CLAIM_STANDINGS, "baseStanding"),
    effectiveStanding: proofEnum(input.effectiveStanding, PROOF_CLAIM_STANDINGS, "effectiveStanding"),
    freshness: proofEnum(input.freshness, PROOF_FRESHNESS_STATES, "freshness"),
    freshnessExplanation: proofNonEmpty(input.freshnessExplanation, "freshnessExplanation"),
    supportingEvidence: Object.freeze([...input.supportingEvidence]),
    contradictingEvidence: Object.freeze([...input.contradictingEvidence]),
    sourceRevisions: Object.freeze([...input.sourceRevisions]),
    dependencies: Object.freeze(
      input.dependencies.map((entry) =>
        Object.freeze({ claimId: proofStableId(entry.claimId, "dependencies[].claimId"), effectiveStanding: proofEnum(entry.effectiveStanding, PROOF_CLAIM_STANDINGS, "dependencies[].effectiveStanding") }),
      ),
    ),
    publicationProvenance: proofStringRecord(input.publicationProvenance, "publicationProvenance"),
  };
  return Object.freeze({ ...base, digest: proofAssetViewDigestOf(base) });
}

export function parseProofAssetView(raw: unknown, what = "ProofAssetView"): ProofAssetView {
  const object = proofObject(raw, what);
  proofKeys(
    object,
    ["schemaVersion", "claimRef", "claimType", "content", "baseStanding", "effectiveStanding", "freshness", "freshnessExplanation", "supportingEvidence", "contradictingEvidence", "sourceRevisions", "dependencies", "publicationProvenance", "digest"],
    ["schemaVersion", "claimRef", "claimType", "content", "baseStanding", "effectiveStanding", "freshness", "freshnessExplanation", "supportingEvidence", "contradictingEvidence", "sourceRevisions", "dependencies", "publicationProvenance", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  if (!Array.isArray(object.supportingEvidence) || !Array.isArray(object.contradictingEvidence) || !Array.isArray(object.sourceRevisions) || !Array.isArray(object.dependencies)) {
    proofFail("invalid_value", `${what}: evidence/ref/dependency fields must be arrays`);
  }
  const base: Omit<ProofAssetView, "digest"> = {
    schemaVersion: 1 as const,
    claimRef: parseClaimRefPort(object.claimRef, `${what}.claimRef`),
    claimType: parseProofClaimTypeRef(object.claimType, `${what}.claimType`),
    content: object.content,
    baseStanding: proofEnum(object.baseStanding, PROOF_CLAIM_STANDINGS, `${what}.baseStanding`),
    effectiveStanding: proofEnum(object.effectiveStanding, PROOF_CLAIM_STANDINGS, `${what}.effectiveStanding`),
    freshness: proofEnum(object.freshness, PROOF_FRESHNESS_STATES, `${what}.freshness`),
    freshnessExplanation: proofNonEmpty(object.freshnessExplanation, `${what}.freshnessExplanation`),
    supportingEvidence: Object.freeze((object.supportingEvidence as unknown[]).map((entry) => parseEvidenceItem(entry, `${what}.supportingEvidence[]`))),
    contradictingEvidence: Object.freeze((object.contradictingEvidence as unknown[]).map((entry) => parseEvidenceItem(entry, `${what}.contradictingEvidence[]`))),
    sourceRevisions: Object.freeze((object.sourceRevisions as unknown[]).map((entry) => parseProofSourceRevisionRef(entry, `${what}.sourceRevisions[]`))),
    dependencies: Object.freeze(
      (object.dependencies as unknown[]).map((entry, index) => {
        const item = proofObject(entry, `${what}.dependencies[${index}]`);
        proofKeys(item, ["claimId", "effectiveStanding"], ["claimId", "effectiveStanding"], `${what}.dependencies[${index}]`);
        return Object.freeze({
          claimId: proofStableId(item.claimId, `${what}.dependencies[${index}].claimId`),
          effectiveStanding: proofEnum(item.effectiveStanding, PROOF_CLAIM_STANDINGS, `${what}.dependencies[${index}].effectiveStanding`),
        });
      }),
    ),
    publicationProvenance: proofStringRecord(object.publicationProvenance, `${what}.publicationProvenance`),
  };
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (proofAssetViewDigestOf(base) !== digest) proofFail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}
