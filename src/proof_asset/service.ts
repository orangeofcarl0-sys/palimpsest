/**
 * G10-T Proof/Evidence plane — authoritative service.
 *
 *   Source ≠ Evidence   Evidence ≠ Claim   Claim ≠ Truth
 *   Verification ≠ PublicationAdmission   PublishedClaim ≠ Authority
 *   Freshness ≠ Truth   STALE ≠ FALSE   HistoricalSupport ≠ CurrentSupport
 *   ReasoningClaimRef ≠ EvidenceClaimRef   VaultBlob ≠ SemanticClaim
 *
 * The service records proof-plane facts (source revisions, evidence selections,
 * candidate claims, policy verification results, publication decisions,
 * appended assessments) and derives standings. A standing is ALWAYS a policy
 * output: callers can never supply a standing or a publish flag, and the
 * `selectionDigest` of an evidence item is always recomputed from resolved
 * content (a caller-supplied mismatch is rejected).
 *
 * It imports NO Organization/RuntimeScope/Boundary/Commitment/effect authority.
 * It reads the campaign Evidence plane's claim-standing contract through the
 * injected `CampaignEvidencePort` surface (it implements it) — no CoT, no
 * reasoning internals.
 */

import { createHash } from "node:crypto";

import { canonicalDigest, canonicalJsonBytes } from "../schema/canonical.js";
import type { CampaignClaimStatus, CampaignEvidencePort, ClaimStandingSnapshot, EvidenceClaimRef, EvidenceKnowledge } from "../campaign/epistemic.js";
import { materializeClaimStandingSnapshot } from "../campaign/epistemic.js";
import type { LocalProofBlobStore } from "./blob.js";
import type { DisclosureExportReceipt, DisclosurePreview } from "./disclosure.js";
import { parseDisclosureExportReceipt, parseDisclosurePreview } from "./disclosure.js";
import type {
  ClaimAssessmentRevision,
  ProofAssetDependency,
  ProofAssetView,
  ProofClaimCandidate,
  ProofClaimOrigin,
  ProofClaimStanding,
  ProofClaimTypeRef,
  ProofDependencyRecord,
  ProofEvidenceRef,
  ProofFreshness,
  ProofPolicyRef,
  ProofPublicationDecision,
  ProofPublicationDecisionRecord,
  ProofVerificationResult,
  PublishedProofClaim,
} from "./claims.js";
import {
  builtinProofClaimTypes,
  materializeClaimAssessmentRevision,
  materializeProofAssetView,
  materializeProofClaimCandidate,
  materializeProofDependencyRecord,
  materializeProofPublicationDecisionRecord,
  materializePublishedProofClaim,
} from "./claims.js";
import type { EvidenceItem, EvidenceSelector } from "./evidence.js";
import { materializeEvidenceItem } from "./evidence.js";
import type { ProofClaimPortRef, ProofSourceRevisionRef } from "./refs.js";
import { proofDigestHex, proofNonEmpty } from "./refs.js";
import type { ProofSourceRevision } from "./sources.js";
import { SOURCE_PROVENANCES, materializeProofSourceRevision } from "./sources.js";
import type { ProofBasis, ProofEvent, ProofEventDraft, ProofEvidenceStore } from "./store.js";
import { PROOF_SCOPE_ID, ProofStoreError, proofEventIdOf, proofPlaneOpenedPayload } from "./store.js";
import type { ProofDependencyStanding, ProofPublicationAdmissionInput, ProofPublicationAdmissionPort, ProofVerificationInput, ProofVerificationPolicyPort } from "./verification.js";
import { evaluateVerification, parseProofPublicationAdmissionOutcome } from "./verification.js";

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type ProofEvidenceServiceErrorKind =
  | "unknown_source"
  | "unknown_evidence"
  | "unknown_candidate"
  | "unknown_claim"
  | "verification_required"
  | "content_unavailable"
  | "selection_out_of_bounds"
  | "selection_digest_mismatch"
  | "content_digest_mismatch"
  | "revision_conflict"
  | "dependency_not_published"
  | "policy_unavailable"
  | "invalid_request";

export class ProofEvidenceServiceError extends Error {
  constructor(
    readonly kind: ProofEvidenceServiceErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProofEvidenceServiceError";
  }
}

function serviceFail(kind: ProofEvidenceServiceErrorKind, message: string): never {
  throw new ProofEvidenceServiceError(kind, message);
}

/* ------------------------------------------------------------------ *
 * Content port
 * ------------------------------------------------------------------ */

/** Read-only source-content resolver for non-local/external revisions. */
export interface ProofContentPort {
  resolve(input: { readonly revision: ProofSourceRevision }): Promise<Uint8Array | undefined>;
}

/** Assessment vocabulary alias for `ProofContentPort`. */
export type ProofSourceContentPort = ProofContentPort;

/* ------------------------------------------------------------------ *
 * Default policies (v1 safety gates)
 * ------------------------------------------------------------------ */

export const PROOF_DEFAULT_VERIFICATION_POLICY_REF: ProofPolicyRef = Object.freeze({ policyId: "proof.default-verification", version: "v1" });
export const PROOF_DEFAULT_PUBLICATION_POLICY_REF: ProofPolicyRef = Object.freeze({ policyId: "proof.default-publication", version: "v1" });

/**
 * Deterministic v1 verification policy. It inspects only evidence *counts*:
 * support without contradiction is SUPPORTED; both is PARTIALLY_SUPPORTED; only
 * contradiction is CONTRADICTED; neither is INCONCLUSIVE. It asserts no truth.
 */
export function defaultProofVerificationPolicy(): ProofVerificationPolicyPort {
  return Object.freeze({
    policyRef: PROOF_DEFAULT_VERIFICATION_POLICY_REF,
    async verify(input: ProofVerificationInput): Promise<unknown> {
      const supporting = input.candidate.supportingEvidence.map((entry) => entry.evidenceId);
      const contradicting = input.candidate.contradictingEvidence.map((entry) => entry.evidenceId);
      let standing: ProofClaimStanding;
      if (supporting.length > 0 && contradicting.length === 0) standing = "SUPPORTED";
      else if (supporting.length > 0 && contradicting.length > 0) standing = "PARTIALLY_SUPPORTED";
      else if (supporting.length === 0 && contradicting.length > 0) standing = "CONTRADICTED";
      else standing = "INCONCLUSIVE";
      return {
        standing,
        supportingEvidenceIds: supporting,
        contradictingEvidenceIds: contradicting,
        provenanceDigest: canonicalDigest({
          domain: "palimpsest.proof.default-verification-reason.v1",
          candidateId: input.candidate.candidateId,
          standing,
          dependencyCount: input.dependencies.length,
        }),
      };
    },
  });
}

/**
 * The default v1 publication safety gate. PUBLISH requires a policy-produced
 * standing of SUPPORTED or PARTIALLY_SUPPORTED; CONTRADICTED is REJECTed and
 * INCONCLUSIVE/STALE stay UNRESOLVED. A non-SUPPORTED standing can never become
 * a ProofAsset by default.
 */
export function defaultProofPublicationAdmission(): ProofPublicationAdmissionPort {
  return Object.freeze({
    policyRef: PROOF_DEFAULT_PUBLICATION_POLICY_REF,
    async decide(input: ProofPublicationAdmissionInput): Promise<unknown> {
      const standing = input.verification.standing;
      const decision: ProofPublicationDecision = standing === "SUPPORTED" || standing === "PARTIALLY_SUPPORTED" ? "PUBLISH" : standing === "CONTRADICTED" ? "REJECT" : "UNRESOLVED";
      return { decision, provenanceDigest: input.verification.provenanceDigest };
    },
  });
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export interface ProofEvidenceServiceDeps {
  readonly store: ProofEvidenceStore;
  readonly blob?: LocalProofBlobStore | undefined;
  readonly contentPort?: ProofContentPort | undefined;
  readonly verificationPolicy?: ProofVerificationPolicyPort | undefined;
  readonly publicationAdmission?: ProofPublicationAdmissionPort | undefined;
  readonly clock?: (() => string) | undefined;
}

export interface ProofPublicationResult {
  readonly decision: ProofPublicationDecision;
  readonly verification: ProofVerificationResult;
  readonly publication: ProofPublicationDecisionRecord;
  readonly claimId?: string | undefined;
}

export interface ProofWhyAssessment {
  readonly assessmentId: string;
  readonly standing: ProofClaimStanding;
  readonly policyRef: ProofPolicyRef;
  readonly assessedAt: string;
  readonly previousAssessmentId?: string | undefined;
}

export interface ProofWhy {
  readonly claimRef: ProofClaimPortRef;
  readonly claimType: ProofClaimTypeRef;
  readonly content: unknown;
  readonly baseStanding: ProofClaimStanding;
  readonly effectiveStanding: ProofClaimStanding;
  readonly freshness: ProofFreshness;
  readonly freshnessExplanation: string;
  readonly verification: ProofVerificationResult | null;
  readonly policyRef: ProofPolicyRef | null;
  readonly evidence: readonly EvidenceItem[];
  readonly sourceRevisions: readonly ProofSourceRevisionRef[];
  readonly provenance: Readonly<Record<string, string>>;
  readonly dependencies: readonly ProofAssetDependency[];
  readonly assessments: readonly ProofWhyAssessment[];
}

export interface ProofSourceSummary {
  readonly sourceId: string;
  readonly revisionCount: number;
  readonly latestRevision: number;
  readonly latestContentDigest: string;
  readonly latestMediaType: string;
  readonly latestLabel: string;
  readonly provenance: ProofSourceRevision["provenance"];
}

export interface ProofEvidenceService {
  importSource(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly label: string;
    readonly provenance: (typeof SOURCE_PROVENANCES)[number];
    readonly sourceId: string;
    readonly metadata?: Readonly<Record<string, string>> | undefined;
    readonly contentDigest?: string | undefined;
  }): Promise<{ readonly revision: ProofSourceRevision }>;
  /** Every known source id with its latest recorded revision (READ-ONLY projection of history). */
  sources(): Promise<readonly ProofSourceSummary[]>;
  /** The immutable revisions recorded for one source, oldest first. */
  sourceRevisions(sourceId: string): Promise<readonly ProofSourceRevision[]>;
  /** Look up one exact immutable revision; a contentDigest that does not match is not found. */
  sourceRevision(ref: ProofSourceRevisionRef): Promise<ProofSourceRevision | undefined>;
  /**
   * EXPLICITLY resolve the bytes of a recorded revision through the configured content port. A
   * missing/unresolvable blob yields `undefined` (unavailable) — never `false` and never wrong bytes.
   */
  readSourceContent(ref: ProofSourceRevisionRef): Promise<Uint8Array | undefined>;
  /** Look up a recorded evidence selection by its content-addressed id. */
  evidence(evidenceId: string): Promise<EvidenceItem | undefined>;
  /** Every published proof claim (READ-ONLY projection of history). */
  publishedClaims(): Promise<readonly PublishedProofClaim[]>;
  recordEvidence(input: {
    readonly sourceRevision: ProofSourceRevisionRef;
    readonly selector: EvidenceSelector;
    readonly selectionDigest?: string | undefined;
  }): Promise<EvidenceItem>;
  prepareCandidate(input: {
    readonly claimType: ProofClaimTypeRef;
    readonly content: unknown;
    readonly supportingEvidenceIds: readonly string[];
    readonly contradictingEvidenceIds?: readonly string[] | undefined;
    readonly dependencies?: readonly ProofClaimPortRef[] | undefined;
    readonly origin: ProofClaimOrigin;
    readonly provenance?: Readonly<Record<string, string>> | undefined;
  }): Promise<ProofClaimCandidate>;
  verify(input: { readonly candidateId: string }): Promise<ProofVerificationResult>;
  decidePublication(input: { readonly candidateId: string }): Promise<ProofPublicationResult>;
  reassess(input: { readonly claimId: string; readonly policyRef?: ProofPolicyRef | undefined }): Promise<ClaimAssessmentRevision>;
  inspectClaim(claim: EvidenceClaimRef): Promise<EvidenceKnowledge<ClaimStandingSnapshot>>;
  proofAssetView(claimId: string): Promise<ProofAssetView>;
  why(claimId: string): Promise<ProofWhy>;
  /**
   * Persist a disclosure PREVIEW on the proof chain (`DISCLOSURE_PREPARED`). Preview ≠ authority:
   * recording a preview never grants approval and never writes any bytes.
   */
  recordDisclosurePreview(preview: DisclosurePreview): Promise<DisclosurePreview>;
  /** Persist a LOCAL disclosure export receipt (`DISCLOSURE_RECEIPT_RECORDED`); Exported ≠ Received. */
  recordDisclosureReceipt(receipt: DisclosureExportReceipt): Promise<DisclosureExportReceipt>;
  /** Every disclosure preview recorded on the proof chain (READ-ONLY projection, chain order). */
  disclosurePreviews(): Promise<readonly DisclosurePreview[]>;
  /** Every local disclosure export receipt recorded on the proof chain (READ-ONLY, chain order). */
  disclosureReceipts(): Promise<readonly DisclosureExportReceipt[]>;
  /** The read-only Campaign Evidence port this service satisfies. */
  readonly campaignEvidencePort: CampaignEvidencePort;
  replay(): Promise<readonly ProofEvent[]>;
  basis(): Promise<ProofBasis | undefined>;
}

interface ProofPlaneSnapshot {
  readonly events: readonly ProofEvent[];
  readonly revisions: readonly ProofSourceRevision[];
  readonly revisionsBySource: ReadonlyMap<string, readonly ProofSourceRevision[]>;
  readonly revisionByKey: ReadonlyMap<string, ProofSourceRevision>;
  readonly evidence: ReadonlyMap<string, EvidenceItem>;
  readonly candidates: ReadonlyMap<string, ProofClaimCandidate>;
  readonly verifications: ReadonlyMap<string, readonly ProofVerificationResult[]>;
  readonly publicationByCandidate: ReadonlyMap<string, ProofPublicationDecisionRecord>;
  readonly publishedByClaim: ReadonlyMap<string, { readonly claim: PublishedProofClaim; readonly candidateId: string }>;
  readonly assessmentsByClaim: ReadonlyMap<string, readonly ClaimAssessmentRevision[]>;
  readonly dependencyEdges: ReadonlyMap<string, readonly string[]>;
  readonly disclosurePreviews: ReadonlyMap<string, DisclosurePreview>;
  readonly disclosureReceipts: readonly DisclosureExportReceipt[];
}

function revisionOf(event: ProofEvent): ProofSourceRevision {
  return (event.payload as { readonly revision: ProofSourceRevision }).revision;
}
function evidenceOf(event: ProofEvent): EvidenceItem {
  return (event.payload as { readonly evidence: EvidenceItem }).evidence;
}
function candidateOf(event: ProofEvent): ProofClaimCandidate {
  return (event.payload as { readonly candidate: ProofClaimCandidate }).candidate;
}
function verificationOf(event: ProofEvent): ProofVerificationResult {
  return (event.payload as { readonly verification: ProofVerificationResult }).verification;
}
function publicationOf(event: ProofEvent): ProofPublicationDecisionRecord {
  return (event.payload as { readonly publication: ProofPublicationDecisionRecord }).publication;
}
function publishedOf(event: ProofEvent): PublishedProofClaim {
  return (event.payload as { readonly claim: PublishedProofClaim }).claim;
}
function assessmentOf(event: ProofEvent): ClaimAssessmentRevision {
  return (event.payload as { readonly assessment: ClaimAssessmentRevision }).assessment;
}
function dependencyOf(event: ProofEvent): ProofDependencyRecord {
  return (event.payload as { readonly dependency: ProofDependencyRecord }).dependency;
}
function disclosurePreviewOf(event: ProofEvent): DisclosurePreview {
  return (event.payload as { readonly preview: DisclosurePreview }).preview;
}
function disclosureReceiptOf(event: ProofEvent): DisclosureExportReceipt {
  return (event.payload as { readonly receipt: DisclosureExportReceipt }).receipt;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function revisionKey(ref: ProofSourceRevisionRef): string {
  return `${ref.sourceId}\u0000${ref.revision}`;
}

function isFreshnessPolicy(value: string | undefined): value is (typeof FRESHNESS_POLICIES_LOCAL)[number] {
  return value !== undefined && (FRESHNESS_POLICIES_LOCAL as readonly string[]).includes(value);
}
const FRESHNESS_POLICIES_LOCAL = ["IMMUTABLE_EVIDENCE", "LATEST_SOURCE_REVISION", "EXPIRES_AT"] as const;
export function makeProofEvidenceService(deps: ProofEvidenceServiceDeps): ProofEvidenceService {
  const store = deps.store;
  const registry = builtinProofClaimTypes();
  const clock = deps.clock ?? (() => new Date().toISOString());

  function planeOpenedDraft(): ProofEventDraft {
    const payload = proofPlaneOpenedPayload();
    return Object.freeze({ eventId: proofEventIdOf("PROOF_PLANE_OPENED", PROOF_SCOPE_ID, payload), type: "PROOF_PLANE_OPENED", payload });
  }

  /** Append events, opening the proof plane definition first on an empty chain. */
  async function append(events: readonly ProofEventDraft[]): Promise<readonly ProofEvent[]> {
    let basis = await store.basis();
    const drafts = [...events];
    if (basis === undefined) {
      drafts.unshift(planeOpenedDraft());
      basis = Object.freeze({ scopeId: PROOF_SCOPE_ID, throughSeq: 0, chainDigest: "" });
    }
    return store.appendAtomic({ expectedBasis: basis, events: drafts });
  }

  async function loadPlane(): Promise<ProofPlaneSnapshot> {
    const events = await store.replay();
    const revisions: ProofSourceRevision[] = [];
    const revisionsBySource = new Map<string, ProofSourceRevision[]>();
    const revisionByKey = new Map<string, ProofSourceRevision>();
    const evidence = new Map<string, EvidenceItem>();
    const candidates = new Map<string, ProofClaimCandidate>();
    const verifications = new Map<string, ProofVerificationResult[]>();
    const publicationByCandidate = new Map<string, ProofPublicationDecisionRecord>();
    const publishedByClaim = new Map<string, { claim: PublishedProofClaim; candidateId: string }>();
    const assessmentsByClaim = new Map<string, ClaimAssessmentRevision[]>();
    const dependencyEdges = new Map<string, string[]>();
    const disclosurePreviews = new Map<string, DisclosurePreview>();
    const disclosureReceipts: DisclosureExportReceipt[] = [];
    for (const event of events) {
      switch (event.type) {
        case "SOURCE_REVISION_RECORDED": {
          const revision = revisionOf(event);
          revisions.push(revision);
          const list = revisionsBySource.get(revision.sourceId);
          if (list === undefined) revisionsBySource.set(revision.sourceId, [revision]);
          else list.push(revision);
          revisionByKey.set(`${revision.sourceId}\u0000${revision.revision}`, revision);
          break;
        }
        case "EVIDENCE_RECORDED": {
          const item = evidenceOf(event);
          evidence.set(item.evidenceId, item);
          break;
        }
        case "CANDIDATE_RECORDED": {
          const candidate = candidateOf(event);
          candidates.set(candidate.candidateId, candidate);
          break;
        }
        case "VERIFICATION_RECORDED": {
          const result = verificationOf(event);
          const list = verifications.get(result.candidateId);
          if (list === undefined) verifications.set(result.candidateId, [result]);
          else list.push(result);
          break;
        }
        case "PUBLICATION_DECIDED": {
          const record = publicationOf(event);
          publicationByCandidate.set(record.candidateId, record);
          break;
        }
        case "CLAIM_PUBLISHED": {
          const claim = publishedOf(event);
          // The candidate id is recovered from the preceding publication decision.
          const decision = [...publicationByCandidate.values()].find((entry) => entry.claimRef?.claimId === claim.claimRef.claimId);
          publishedByClaim.set(claim.claimRef.claimId, { claim, candidateId: decision?.candidateId ?? "" });
          break;
        }
        case "ASSESSMENT_RECORDED": {
          const assessment = assessmentOf(event);
          const list = assessmentsByClaim.get(assessment.claimRef.claimId);
          if (list === undefined) assessmentsByClaim.set(assessment.claimRef.claimId, [assessment]);
          else list.push(assessment);
          break;
        }
        case "DEPENDENCY_RECORDED": {
          const dependency = dependencyOf(event);
          const list = dependencyEdges.get(dependency.claimRef.claimId);
          if (list === undefined) dependencyEdges.set(dependency.claimRef.claimId, [dependency.dependsOnClaimId]);
          else if (!list.includes(dependency.dependsOnClaimId)) list.push(dependency.dependsOnClaimId);
          break;
        }
        case "DISCLOSURE_PREPARED": {
          const preview = disclosurePreviewOf(event);
          disclosurePreviews.set(preview.previewId, preview);
          break;
        }
        case "DISCLOSURE_RECEIPT_RECORDED": {
          disclosureReceipts.push(disclosureReceiptOf(event));
          break;
        }
        default:
          break;
      }
    }
    return Object.freeze({
      events,
      revisions: Object.freeze(revisions),
      revisionsBySource,
      revisionByKey,
      evidence,
      candidates,
      verifications,
      publicationByCandidate,
      publishedByClaim,
      assessmentsByClaim,
      dependencyEdges,
      disclosurePreviews,
      disclosureReceipts: Object.freeze(disclosureReceipts),
    });
  }

  function requireCandidate(plane: ProofPlaneSnapshot, candidateId: string): ProofClaimCandidate {
    const candidate = plane.candidates.get(candidateId);
    if (candidate === undefined) serviceFail("unknown_candidate", `candidate "${candidateId}" is not recorded`);
    return candidate;
  }

  function requirePublished(plane: ProofPlaneSnapshot, claimId: string): { claim: PublishedProofClaim; candidateId: string } {
    const entry = plane.publishedByClaim.get(claimId);
    if (entry === undefined) serviceFail("unknown_claim", `claim "${claimId}" is not published`);
    return entry;
  }

  function latestVerification(plane: ProofPlaneSnapshot, candidateId: string): ProofVerificationResult | undefined {
    const list = plane.verifications.get(candidateId);
    return list === undefined ? undefined : list[list.length - 1];
  }

  function evidenceItemsFor(plane: ProofPlaneSnapshot, ids: readonly string[]): readonly EvidenceItem[] {
    const out: EvidenceItem[] = [];
    for (const id of ids) {
      const item = plane.evidence.get(id);
      if (item !== undefined) out.push(item);
    }
    return Object.freeze(out);
  }

  function candidateEvidence(plane: ProofPlaneSnapshot, candidate: ProofClaimCandidate): readonly EvidenceItem[] {
    const ids = [...candidate.supportingEvidence.map((entry) => entry.evidenceId), ...candidate.contradictingEvidence.map((entry) => entry.evidenceId)];
    return evidenceItemsFor(plane, ids);
  }

  function baseStandingOf(plane: ProofPlaneSnapshot, claimId: string): ProofClaimStanding {
    const assessments = plane.assessmentsByClaim.get(claimId);
    const assessment = assessments?.[assessments.length - 1];
    if (assessment !== undefined) return assessment.standing;
    const entry = plane.publishedByClaim.get(claimId);
    if (entry === undefined) return "STALE";
    const verification = latestVerification(plane, entry.candidateId);
    return verification?.standing ?? "INCONCLUSIVE";
  }

  /**
   * Current EFFECTIVE standing. A dependency whose effective standing is
   * STALE/CONTRADICTED/INCONCLUSIVE makes this claim STALE — never automatically
   * CONTRADICTED. Historical assessments are never mutated.
   */
  function effectiveStandingOf(
    plane: ProofPlaneSnapshot,
    claimId: string,
    memo: Map<string, ProofClaimStanding>,
    stack: ReadonlySet<string>,
  ): ProofClaimStanding {
    const cached = memo.get(claimId);
    if (cached !== undefined) return cached;
    if (stack.has(claimId)) return "STALE";
    if (!plane.publishedByClaim.has(claimId)) return "STALE";
    const base = baseStandingOf(plane, claimId);
    let result: ProofClaimStanding = base === "STALE" ? "STALE" : base;
    if (result !== "STALE") {
      // Own freshness: a claim whose OWN supporting evidence is no longer current is
      // effectively STALE (STALE ≠ FALSE; the base standing is retained verbatim).
      const entry = plane.publishedByClaim.get(claimId)!;
      const candidate = plane.candidates.get(entry.candidateId);
      if (candidate !== undefined && freshnessOf(plane, claimId, candidate, entry.claim).freshness === "stale") {
        result = "STALE";
      }
    }
    if (result !== "STALE") {
      const entry = plane.publishedByClaim.get(claimId)!;
      const candidate = plane.candidates.get(entry.candidateId);
      const recorded = plane.dependencyEdges.get(claimId) ?? [];
      const declared = candidate?.dependencies.map((dependency) => dependency.claimId) ?? [];
      const dependencies = [...new Set([...recorded, ...declared])].sort();
      const nextStack = new Set(stack);
      nextStack.add(claimId);
      for (const dependencyId of dependencies) {
        const standing = effectiveStandingOf(plane, dependencyId, memo, nextStack);
        if (standing === "STALE" || standing === "CONTRADICTED" || standing === "INCONCLUSIVE") {
          result = "STALE";
          break;
        }
      }
    }
    memo.set(claimId, result);
    return result;
  }

  function effectiveDependenciesOf(plane: ProofPlaneSnapshot, candidate: ProofClaimCandidate): readonly ProofDependencyStanding[] {
    const memo = new Map<string, ProofClaimStanding>();
    const declared = candidate.dependencies.map((dependency) => dependency.claimId);
    const dependencies = [...new Set(declared)].sort();
    return Object.freeze(
      dependencies.map((claimId) => Object.freeze({ claimId, effectiveStanding: effectiveStandingOf(plane, claimId, memo, new Set<string>()) })),
    );
  }

  function dependenciesOfClaim(plane: ProofPlaneSnapshot, claimId: string): readonly ProofAssetDependency[] {
    const entry = plane.publishedByClaim.get(claimId);
    const candidate = entry === undefined ? undefined : plane.candidates.get(entry.candidateId);
    const recorded = plane.dependencyEdges.get(claimId) ?? [];
    const declared = candidate?.dependencies.map((dependency) => dependency.claimId) ?? [];
    const dependencies = [...new Set([...recorded, ...declared])].sort();
    const memo = new Map<string, ProofClaimStanding>();
    return Object.freeze(
      dependencies.map((dependencyId) =>
        Object.freeze({ claimId: dependencyId, effectiveStanding: effectiveStandingOf(plane, dependencyId, memo, new Set<string>()) }),
      ),
    );
  }

  async function resolveRevisionContent(revision: ProofSourceRevision): Promise<Uint8Array | undefined> {
    if (deps.blob !== undefined) {
      try {
        const bytes = await deps.blob.get(revision.contentDigest);
        if (bytes !== undefined) return bytes;
      } catch (error) {
        throw new ProofEvidenceServiceError("content_unavailable", `blob vault rejected "${revision.contentDigest}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (deps.contentPort !== undefined) {
      try {
        const bytes = await deps.contentPort.resolve({ revision });
        if (bytes !== undefined) return bytes;
      } catch (error) {
        throw new ProofEvidenceServiceError("content_unavailable", `content port failed for "${revision.sourceId}@${revision.revision}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return undefined;
  }

  function resolveJsonPointer(document: unknown, pointer: string): unknown {
    if (pointer === "") return document;
    let current: unknown = document;
    for (const rawSegment of pointer.slice(1).split("/")) {
      const segment = rawSegment.replace(/~1/gu, "/").replace(/~0/gu, "~");
      if (Array.isArray(current)) {
        if (!/^(0|[1-9][0-9]*)$/u.test(segment)) serviceFail("selection_out_of_bounds", `JSON Pointer segment "${segment}" is not a valid array index`);
        const index = Number(segment);
        if (index >= current.length) serviceFail("selection_out_of_bounds", `JSON Pointer array index ${index} is out of bounds`);
        current = current[index];
      } else if (typeof current === "object" && current !== null) {
        const object = current as Record<string, unknown>;
        if (!Object.hasOwn(object, segment)) serviceFail("selection_out_of_bounds", `JSON Pointer segment "${segment}" does not exist`);
        current = object[segment];
      } else {
        serviceFail("selection_out_of_bounds", `JSON Pointer segment "${segment}" traverses a non-container`);
      }
    }
    return current;
  }

  function selectBytes(revision: ProofSourceRevision, selector: EvidenceSelector, bytes: Uint8Array): Uint8Array {
    switch (selector.kind) {
      case "WHOLE_SOURCE":
        return bytes;
      case "TEXT_RANGE": {
        const text = new TextDecoder().decode(bytes);
        if (selector.end > text.length) serviceFail("selection_out_of_bounds", `TEXT_RANGE end ${selector.end} exceeds source length ${text.length}`);
        return new TextEncoder().encode(text.slice(selector.start, selector.end));
      }
      case "JSON_POINTER": {
        const text = new TextDecoder().decode(bytes);
        let document: unknown;
        try {
          document = JSON.parse(text);
        } catch (error) {
          serviceFail("content_unavailable", `source "${revision.sourceId}@${revision.revision}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        const resolved = resolveJsonPointer(document, selector.pointer);
        return canonicalJsonBytes(resolved);
      }
      default: {
        const exhausted: never = selector;
        return exhausted;
      }
    }
  }

  async function importSource(input: Parameters<ProofEvidenceService["importSource"]>[0]): Promise<{ readonly revision: ProofSourceRevision }> {
    if (!(input.bytes instanceof Uint8Array)) serviceFail("invalid_request", "importSource.bytes must be a Uint8Array");
    const contentDigest = sha256Hex(input.bytes);
    if (input.contentDigest !== undefined && input.contentDigest !== contentDigest) {
      serviceFail("content_digest_mismatch", "a caller-provided contentDigest does not match the supplied bytes");
    }
    if (deps.blob !== undefined) {
      const stored = await deps.blob.put(input.bytes);
      if (stored.contentDigest !== contentDigest) serviceFail("content_digest_mismatch", "blob vault returned a digest that does not match the bytes");
    }
    const plane = await loadPlane();
    // Idempotent at the content level: identical bytes under a source return the
    // existing revision rather than minting a duplicate.
    const existingForSource = plane.revisionsBySource.get(input.sourceId) ?? [];
    const identical = existingForSource.find((revision) => revision.contentDigest === contentDigest);
    if (identical !== undefined) return Object.freeze({ revision: identical });

    const maxRevision = existingForSource.reduce((max, revision) => (revision.revision > max ? revision.revision : max), 0);
    const revision = materializeProofSourceRevision({
      sourceId: input.sourceId,
      revision: maxRevision + 1,
      contentDigest,
      mediaType: input.mediaType,
      label: input.label,
      provenance: input.provenance,
      ...(deps.blob === undefined ? {} : { blobRef: contentDigest }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    });
    await append([{ eventId: proofEventIdOf("SOURCE_REVISION_RECORDED", PROOF_SCOPE_ID, { revision }), type: "SOURCE_REVISION_RECORDED", payload: { revision } }]);
    return Object.freeze({ revision });
  }

  async function recordEvidence(input: Parameters<ProofEvidenceService["recordEvidence"]>[0]): Promise<EvidenceItem> {
    const plane = await loadPlane();
    const revision = plane.revisionByKey.get(revisionKey(input.sourceRevision));
    if (revision === undefined || revision.contentDigest !== input.sourceRevision.contentDigest) {
      serviceFail("unknown_source", `source revision "${input.sourceRevision.sourceId}@${input.sourceRevision.revision}" is not recorded`);
    }
    const bytes = await resolveRevisionContent(revision);
    if (bytes === undefined) {
      serviceFail("content_unavailable", `content for "${revision.sourceId}@${revision.revision}" is not resolvable (no blob or content port)`);
    }
    const selected = selectBytes(revision, input.selector, bytes);
    const selectionDigest = sha256Hex(selected);
    if (input.selectionDigest !== undefined) {
      proofDigestHex(input.selectionDigest, "selectionDigest");
      if (input.selectionDigest !== selectionDigest) {
        serviceFail("selection_digest_mismatch", "a caller-supplied selectionDigest does not match the resolved selection content");
      }
    }
    const item = materializeEvidenceItem({ sourceRevision: input.sourceRevision, selector: input.selector, selectionDigest });
    const existing = plane.evidence.get(item.evidenceId);
    if (existing !== undefined) return existing;
    await append([{ eventId: proofEventIdOf("EVIDENCE_RECORDED", PROOF_SCOPE_ID, { evidence: item }), type: "EVIDENCE_RECORDED", payload: { evidence: item } }]);
    return item;
  }

  async function prepareCandidate(input: Parameters<ProofEvidenceService["prepareCandidate"]>[0]): Promise<ProofClaimCandidate> {
    const plane = await loadPlane();
    const referenced = [...input.supportingEvidenceIds, ...(input.contradictingEvidenceIds ?? [])];
    for (const evidenceId of referenced) {
      if (!plane.evidence.has(evidenceId)) serviceFail("unknown_evidence", `evidence "${evidenceId}" is not recorded`);
    }
    for (const dependency of input.dependencies ?? []) {
      // Pending candidates cannot be dependencies: only PUBLISHED claims qualify.
      if (!plane.publishedByClaim.has(dependency.claimId)) {
        serviceFail("dependency_not_published", `dependency "${dependency.claimId}" is not a published claim`);
      }
    }
    const candidate = materializeProofClaimCandidate(input, registry);
    const existing = plane.candidates.get(candidate.candidateId);
    if (existing !== undefined) return existing;
    await append([{ eventId: proofEventIdOf("CANDIDATE_RECORDED", PROOF_SCOPE_ID, { candidate }), type: "CANDIDATE_RECORDED", payload: { candidate } }]);
    return candidate;
  }

  async function verify(input: { readonly candidateId: string }): Promise<ProofVerificationResult> {
    const plane = await loadPlane();
    const candidate = requireCandidate(plane, input.candidateId);
    const policy = deps.verificationPolicy ?? defaultProofVerificationPolicy();
    const dependencies = effectiveDependenciesOf(plane, candidate);
    const raw = await policy.verify({
      candidate,
      evidence: candidateEvidence(plane, candidate),
      dependencies,
      content: candidate.content,
    });
    const result = evaluateVerification(raw, { candidateId: candidate.candidateId, policyRef: policy.policyRef });
    await append([{ eventId: proofEventIdOf("VERIFICATION_RECORDED", PROOF_SCOPE_ID, { verification: result }), type: "VERIFICATION_RECORDED", payload: { verification: result } }]);
    return result;
  }

  async function decidePublication(input: { readonly candidateId: string }): Promise<ProofPublicationResult> {
    const plane = await loadPlane();
    const candidate = requireCandidate(plane, input.candidateId);
    const verification = latestVerification(plane, candidate.candidateId);
    if (verification === undefined) serviceFail("verification_required", `candidate "${candidate.candidateId}" has no verification result`);
    const dependencies = effectiveDependenciesOf(plane, candidate);
    const admission = deps.publicationAdmission ?? defaultProofPublicationAdmission();
    const raw = await admission.decide({ candidate, verification, dependencies });
    const outcome = parseProofPublicationAdmissionOutcome(raw);
    const now = clock();
    const claimId =
      outcome.decision === "PUBLISH"
        ? `pc-${canonicalDigest({
            domain: "palimpsest.proof.published-claim-id.v1",
            candidateId: candidate.candidateId,
            verificationDigest: verification.digest,
          }).slice(0, 32)}`
        : undefined;
    // A published claim id is minted in the proof namespace and can never equal a
    // ReasoningCell claim id (which uses the `cl-` namespace).
    const publication = materializeProofPublicationDecisionRecord({
      candidateId: candidate.candidateId,
      decision: outcome.decision,
      policyRef: admission.policyRef,
      verificationDigest: verification.digest,
      provenanceDigest: outcome.provenanceDigest ?? verification.provenanceDigest,
      ...(claimId === undefined ? {} : { claimRef: { claimId } }),
      decidedAt: now,
    });
    const events: ProofEventDraft[] = [
      { eventId: proofEventIdOf("PUBLICATION_DECIDED", PROOF_SCOPE_ID, { publication }), type: "PUBLICATION_DECIDED", payload: { publication } },
    ];
    let published: PublishedProofClaim | undefined;
    if (claimId !== undefined) {
      published = materializePublishedProofClaim(
        {
          claimRef: { claimId },
          claimType: candidate.claimType,
          content: candidate.content,
          publicationProvenance: {
            ...candidate.provenance,
            verificationPolicy: verification.policyRef.policyId,
            admissionPolicy: admission.policyRef.policyId,
          },
          publishedAt: now,
        },
        registry,
      );
      events.push({ eventId: proofEventIdOf("CLAIM_PUBLISHED", PROOF_SCOPE_ID, { claim: published }), type: "CLAIM_PUBLISHED", payload: { claim: published } });
      for (const dependency of candidate.dependencies) {
        const record = materializeProofDependencyRecord({ claimRef: { claimId }, dependsOnClaimId: dependency.claimId, recordedAt: now });
        events.push({ eventId: proofEventIdOf("DEPENDENCY_RECORDED", PROOF_SCOPE_ID, { dependency: record }), type: "DEPENDENCY_RECORDED", payload: { dependency: record } });
      }
    }
    await append(events);
    return Object.freeze({
      decision: outcome.decision,
      verification,
      publication,
      ...(claimId === undefined ? {} : { claimId }),
    });
  }

  async function reassess(input: { readonly claimId: string; readonly policyRef?: ProofPolicyRef | undefined }): Promise<ClaimAssessmentRevision> {
    const plane = await loadPlane();
    const entry = requirePublished(plane, input.claimId);
    const candidate = requireCandidate(plane, entry.candidateId);
    let policyRef: ProofPolicyRef;
    let standing: ProofClaimStanding;
    let supportingEvidenceIds: readonly string[];
    let contradictingEvidenceIds: readonly string[];
    let provenanceDigest: string;
    if (input.policyRef !== undefined) {
      const policy = deps.verificationPolicy;
      if (policy === undefined || policy.policyRef.policyId !== input.policyRef.policyId || policy.policyRef.version !== input.policyRef.version) {
        serviceFail("policy_unavailable", `verification policy "${input.policyRef.policyId}@${input.policyRef.version}" is not configured`);
      }
      const result = evaluateVerification(
        await policy.verify({ candidate, evidence: candidateEvidence(plane, candidate), dependencies: effectiveDependenciesOf(plane, candidate), content: candidate.content }),
        { candidateId: candidate.candidateId, policyRef: policy.policyRef },
      );
      policyRef = result.policyRef;
      standing = result.standing;
      supportingEvidenceIds = result.supportingEvidenceIds;
      contradictingEvidenceIds = result.contradictingEvidenceIds;
      provenanceDigest = result.provenanceDigest;
    } else {
      const verification = latestVerification(plane, candidate.candidateId);
      if (verification === undefined) serviceFail("verification_required", `candidate "${candidate.candidateId}" has no verification result`);
      policyRef = verification.policyRef;
      standing = verification.standing;
      supportingEvidenceIds = verification.supportingEvidenceIds;
      contradictingEvidenceIds = verification.contradictingEvidenceIds;
      provenanceDigest = verification.provenanceDigest;
    }
    const history = plane.assessmentsByClaim.get(input.claimId) ?? [];
    const previous = history[history.length - 1];
    const assessment = materializeClaimAssessmentRevision({
      claimRef: { claimId: input.claimId },
      verificationPolicyRef: policyRef,
      supportingEvidenceIds,
      contradictingEvidenceIds,
      standing,
      provenanceDigest,
      ...(previous === undefined ? {} : { previousAssessmentId: previous.assessmentId }),
      assessedAt: clock(),
    });
    await append([{ eventId: proofEventIdOf("ASSESSMENT_RECORDED", PROOF_SCOPE_ID, { assessment }), type: "ASSESSMENT_RECORDED", payload: { assessment } }]);
    return assessment;
  }

  function freshnessOf(plane: ProofPlaneSnapshot, claimId: string, candidate: ProofClaimCandidate, published: PublishedProofClaim): { freshness: ProofFreshness; explanation: string } {
    const configured = candidate.provenance["freshnessPolicy"] ?? published.publicationProvenance["freshnessPolicy"];
    const policy = isFreshnessPolicy(configured) ? configured : "IMMUTABLE_EVIDENCE";
    const evidenceItems = candidateEvidence(plane, candidate).filter((item) =>
      candidate.supportingEvidence.some((ref) => ref.evidenceId === item.evidenceId),
    );
    switch (policy) {
      case "IMMUTABLE_EVIDENCE":
        return { freshness: "fresh", explanation: "policy IMMUTABLE_EVIDENCE: content-addressed evidence is immutable; freshness does not assert truth" };
      case "LATEST_SOURCE_REVISION": {
        for (const item of evidenceItems) {
          const revisions = plane.revisionsBySource.get(item.sourceRevision.sourceId) ?? [];
          const latest = revisions.reduce((max, revision) => (revision.revision > max ? revision.revision : max), 0);
          if (item.sourceRevision.revision < latest) {
            return {
              freshness: "stale",
              explanation: `policy LATEST_SOURCE_REVISION: a newer revision (${latest}) exists for a supporting source; historical support is not current support (STALE ≠ FALSE)`,
            };
          }
        }
        return { freshness: "fresh", explanation: "policy LATEST_SOURCE_REVISION: all supporting evidence points at the latest recorded revision" };
      }
      case "EXPIRES_AT": {
        const content = candidate.content;
        const validUntil = typeof content === "object" && content !== null && typeof (content as Record<string, unknown>)["validUntil"] === "string" ? ((content as Record<string, unknown>)["validUntil"] as string) : undefined;
        if (validUntil === undefined) {
          return { freshness: "unknown", explanation: "policy EXPIRES_AT: the claim content carries no validUntil instant" };
        }
        const expired = Date.parse(clock()) > Date.parse(validUntil);
        return expired
          ? { freshness: "stale", explanation: `policy EXPIRES_AT: the claim expired at ${validUntil} (STALE ≠ FALSE; base standing is unchanged)` }
          : { freshness: "fresh", explanation: `policy EXPIRES_AT: the claim is valid until ${validUntil}` };
      }
      default:
        return { freshness: "unknown", explanation: "unknown freshness policy" };
    }
  }

  function sourceRevisionsOf(evidenceItems: readonly EvidenceItem[]): readonly ProofSourceRevisionRef[] {
    const seen = new Set<string>();
    const out: ProofSourceRevisionRef[] = [];
    for (const item of evidenceItems) {
      const key = `${item.sourceRevision.sourceId}\u0000${item.sourceRevision.revision}\u0000${item.sourceRevision.contentDigest}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item.sourceRevision);
    }
    return Object.freeze(out);
  }

  async function proofAssetView(claimId: string): Promise<ProofAssetView> {
    const plane = await loadPlane();
    const entry = requirePublished(plane, claimId);
    const candidate = requireCandidate(plane, entry.candidateId);
    const verification = latestVerification(plane, entry.candidateId);
    const assessment = (plane.assessmentsByClaim.get(claimId) ?? []).slice(-1)[0];
    const baseStanding = assessment?.standing ?? verification?.standing ?? "INCONCLUSIVE";
    const effectiveStanding = effectiveStandingOf(plane, claimId, new Map<string, ProofClaimStanding>(), new Set<string>());
    const supportingIds = verification?.supportingEvidenceIds ?? [];
    const contradictingIds = verification?.contradictingEvidenceIds ?? [];
    const supportingEvidence = evidenceItemsFor(plane, supportingIds);
    const contradictingEvidence = evidenceItemsFor(plane, contradictingIds);
    const allEvidence = [...supportingEvidence, ...contradictingEvidence];
    const { freshness, explanation } = freshnessOf(plane, claimId, candidate, entry.claim);
    return materializeProofAssetView({
      claimRef: { claimId },
      claimType: candidate.claimType,
      content: candidate.content,
      baseStanding,
      effectiveStanding,
      freshness,
      freshnessExplanation: explanation,
      supportingEvidence,
      contradictingEvidence,
      sourceRevisions: sourceRevisionsOf(allEvidence),
      dependencies: dependenciesOfClaim(plane, claimId),
      publicationProvenance: entry.claim.publicationProvenance,
    });
  }

  async function why(claimId: string): Promise<ProofWhy> {
    const plane = await loadPlane();
    const entry = requirePublished(plane, claimId);
    const candidate = requireCandidate(plane, entry.candidateId);
    const verification = latestVerification(plane, entry.candidateId);
    const history = plane.assessmentsByClaim.get(claimId) ?? [];
    const baseStanding = history[history.length - 1]?.standing ?? verification?.standing ?? "INCONCLUSIVE";
    const effectiveStanding = effectiveStandingOf(plane, claimId, new Map<string, ProofClaimStanding>(), new Set<string>());
    const supportingEvidence = evidenceItemsFor(plane, verification?.supportingEvidenceIds ?? []);
    const contradictingEvidence = evidenceItemsFor(plane, verification?.contradictingEvidenceIds ?? []);
    const allEvidence = [...supportingEvidence, ...contradictingEvidence];
    const { freshness, explanation } = freshnessOf(plane, claimId, candidate, entry.claim);
    return Object.freeze({
      claimRef: Object.freeze({ claimId }),
      claimType: candidate.claimType,
      content: candidate.content,
      baseStanding,
      effectiveStanding,
      freshness,
      freshnessExplanation: explanation,
      verification: verification ?? null,
      policyRef: verification?.policyRef ?? null,
      evidence: Object.freeze(allEvidence),
      sourceRevisions: sourceRevisionsOf(allEvidence),
      provenance: entry.claim.publicationProvenance,
      dependencies: dependenciesOfClaim(plane, claimId),
      assessments: Object.freeze(
        history.map((assessment) =>
          Object.freeze({
            assessmentId: assessment.assessmentId,
            standing: assessment.standing,
            policyRef: assessment.verificationPolicyRef,
            assessedAt: assessment.assessedAt,
            ...(assessment.previousAssessmentId === undefined ? {} : { previousAssessmentId: assessment.previousAssessmentId }),
          }),
        ),
      ),
    });
  }

  async function inspectClaim(claim: EvidenceClaimRef): Promise<EvidenceKnowledge<ClaimStandingSnapshot>> {
    try {
      const plane = await loadPlane();
      const entry = plane.publishedByClaim.get(claim.claimId);
      if (entry === undefined) {
        return Object.freeze({ state: "unknown", detail: `claim "${claim.claimId}" is not published on the proof plane` });
      }
      const candidate = plane.candidates.get(entry.candidateId);
      if (candidate === undefined) {
        return Object.freeze({ state: "error", detail: `published claim "${claim.claimId}" has no recorded candidate` });
      }
      const verification = latestVerification(plane, entry.candidateId);
      const history = plane.assessmentsByClaim.get(claim.claimId) ?? [];
      const assessment = history[history.length - 1];
      const effectiveStanding = effectiveStandingOf(plane, claim.claimId, new Map<string, ProofClaimStanding>(), new Set<string>());
      const supportingEvidenceIds = verification?.supportingEvidenceIds ?? [];
      const contradictingEvidenceIds = verification?.contradictingEvidenceIds ?? [];
      const provenanceDigest =
        assessment?.provenanceDigest ??
        verification?.provenanceDigest ??
        canonicalDigest({ domain: "palimpsest.proof.claim-standing-empty.v1", claimId: claim.claimId });
      const status: CampaignClaimStatus = effectiveStanding;
      const value = materializeClaimStandingSnapshot({
        claim: { claimId: claim.claimId },
        status,
        supportingEvidenceIds,
        contradictingEvidenceIds,
        provenanceDigest: proofNonEmpty(provenanceDigest, "provenanceDigest"),
      });
      return Object.freeze({ state: "known", value });
    } catch (error) {
      if (error instanceof ProofEvidenceServiceError) {
        return Object.freeze({ state: "error", detail: `${error.kind}: ${error.message}` });
      }
      if (error instanceof ProofStoreError) {
        return Object.freeze({ state: "error", detail: `${error.kind}: ${error.message}` });
      }
      return Object.freeze({ state: "error", detail: error instanceof Error ? error.message : String(error) });
    }
  }

  async function sources(): Promise<readonly ProofSourceSummary[]> {
    const plane = await loadPlane();
    const summaries: ProofSourceSummary[] = [];
    for (const [sourceId, revisions] of plane.revisionsBySource) {
      const latest = revisions.reduce((max, revision) => (revision.revision > max.revision ? revision : max));
      summaries.push(
        Object.freeze({
          sourceId,
          revisionCount: revisions.length,
          latestRevision: latest.revision,
          latestContentDigest: latest.contentDigest,
          latestMediaType: latest.mediaType,
          latestLabel: latest.label,
          provenance: latest.provenance,
        }),
      );
    }
    return Object.freeze(summaries.sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0)));
  }

  async function sourceRevisions(sourceId: string): Promise<readonly ProofSourceRevision[]> {
    const plane = await loadPlane();
    const revisions = plane.revisionsBySource.get(sourceId) ?? [];
    return Object.freeze([...revisions].sort((a, b) => a.revision - b.revision));
  }

  async function sourceRevision(ref: ProofSourceRevisionRef): Promise<ProofSourceRevision | undefined> {
    const plane = await loadPlane();
    const revision = plane.revisionByKey.get(revisionKey(ref));
    if (revision === undefined || revision.contentDigest !== ref.contentDigest) return undefined;
    return revision;
  }

  async function readSourceContent(ref: ProofSourceRevisionRef): Promise<Uint8Array | undefined> {
    const revision = await sourceRevision(ref);
    if (revision === undefined) return undefined;
    return resolveRevisionContent(revision);
  }

  async function evidence(evidenceId: string): Promise<EvidenceItem | undefined> {
    const plane = await loadPlane();
    return plane.evidence.get(evidenceId);
  }

  async function publishedClaims(): Promise<readonly PublishedProofClaim[]> {
    const plane = await loadPlane();
    const claims = [...plane.publishedByClaim.values()].map((entry) => entry.claim);
    return Object.freeze(claims.sort((a, b) => (a.claimRef.claimId < b.claimRef.claimId ? -1 : a.claimRef.claimId > b.claimRef.claimId ? 1 : 0)));
  }

  async function recordDisclosurePreview(preview: DisclosurePreview): Promise<DisclosurePreview> {
    const parsed = parseDisclosurePreview(preview);
    const events = await append([
      { eventId: proofEventIdOf("DISCLOSURE_PREPARED", PROOF_SCOPE_ID, { preview: parsed }), type: "DISCLOSURE_PREPARED", payload: { preview: parsed } },
    ]);
    return (events[events.length - 1]!.payload as { readonly preview: DisclosurePreview }).preview;
  }

  async function recordDisclosureReceipt(receipt: DisclosureExportReceipt): Promise<DisclosureExportReceipt> {
    const parsed = parseDisclosureExportReceipt(receipt);
    const events = await append([
      { eventId: proofEventIdOf("DISCLOSURE_RECEIPT_RECORDED", PROOF_SCOPE_ID, { receipt: parsed }), type: "DISCLOSURE_RECEIPT_RECORDED", payload: { receipt: parsed } },
    ]);
    return (events[events.length - 1]!.payload as { readonly receipt: DisclosureExportReceipt }).receipt;
  }

  async function disclosurePreviews(): Promise<readonly DisclosurePreview[]> {
    const plane = await loadPlane();
    return Object.freeze([...plane.disclosurePreviews.values()]);
  }

  async function disclosureReceipts(): Promise<readonly DisclosureExportReceipt[]> {
    const plane = await loadPlane();
    return Object.freeze([...plane.disclosureReceipts]);
  }

  const campaignEvidencePort: CampaignEvidencePort = { inspectClaim };

  return Object.freeze({
    importSource,
    sources,
    sourceRevisions,
    sourceRevision,
    readSourceContent,
    evidence,
    publishedClaims,
    recordEvidence,
    prepareCandidate,
    verify,
    decidePublication,
    reassess,
    inspectClaim,
    proofAssetView,
    why,
    recordDisclosurePreview,
    recordDisclosureReceipt,
    disclosurePreviews,
    disclosureReceipts,
    campaignEvidencePort,
    replay: () => store.replay(),
    basis: () => store.basis(),
  });
}
