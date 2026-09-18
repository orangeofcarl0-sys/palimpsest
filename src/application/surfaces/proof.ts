/**
 * SR-1D R2 §7/§8/§9 — the proof application-surface cluster.
 *
 * Owns BOTH the façade interfaces (ProofApplicationSurface, DisclosureApplicationSurface) and the constructor that
 * implements them, from a NARROW input: this module can only see the 4 dependencies it
 * actually reads (disclosure, proof, proofExtraction, reasoning). Behaviour is unchanged.
 */

import type { ReasoningCellService } from "../../reasoning_cell/index.js";
import type { ClaimStandingSnapshot, EvidenceKnowledge } from "../../campaign/epistemic.js";
import type { AnalyzeEvidenceOutcome, ClaimAssessmentRevision, DisclosureExportOutcome, DisclosureExportReceipt, DisclosurePreview, DisclosureRequest, DisclosureService, EvidenceExtractionService, EvidenceItem, EvidenceSelector, ProofAssetView, ProofClaimCandidate, ProofEvidenceService, ProofPublicationResult, ProofSourceRevision, ProofSourceRevisionRef, ProofSourceSummary, ProofWhy, PublishedProofClaim, SourceProvenance } from "../../proof_asset/index.js";
import { materializeProofSourceRevisionRef, reasoningClaimPublicationSource } from "../../proof_asset/index.js";

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface ProofSurfaceDeps {
  readonly disclosure?: DisclosureService | undefined;
  readonly proof?: ProofEvidenceService | undefined;
  readonly proofExtraction?: EvidenceExtractionService | undefined;
  readonly reasoning?: ReasoningCellService | undefined;
}

/**
 * The authoritative Proof/Evidence plane as seen by products. Every method delegates to the
 * injected `ProofEvidenceService`; NO method accepts a caller-supplied standing or publication
 * decision. `preparePublication` materializes a candidate from an ACTIVE admitted reasoning claim
 * (read-only) and records it on the proof plane — it never verifies and never publishes.
 */
export interface ProofApplicationSurface {
  /** Explicit, model-free import of source bytes (never embedded in the semantic rows). */
  importSource(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly label: string;
    readonly provenance: SourceProvenance;
    readonly sourceId: string;
    readonly metadata?: Readonly<Record<string, string>> | undefined;
  }): Promise<{ readonly revision: ProofSourceRevision }>;
  /** Record an evidence selection over an immutable revision; the selection digest is recomputed. */
  recordEvidence(input: { readonly sourceRevision: ProofSourceRevisionRef; readonly selector: EvidenceSelector }): Promise<EvidenceItem>;
  sources(): Promise<readonly ProofSourceSummary[]>;
  sourceRevisions(sourceId: string): Promise<readonly ProofSourceRevision[]>;
  inspectSource(revisionRef: ProofSourceRevisionRef): Promise<ProofSourceRevision | undefined>;
  /** EXPLICIT content read through the configured content port; unavailable content is `undefined`. */
  readContentExplicit(revisionRef: ProofSourceRevisionRef): Promise<Uint8Array | undefined>;
  evidence(evidenceId: string): Promise<EvidenceItem | undefined>;
  claims(): Promise<readonly PublishedProofClaim[]>;
  inspectClaim(claimId: string): Promise<EvidenceKnowledge<ClaimStandingSnapshot>>;
  why(claimId: string): Promise<ProofWhy>;
  preparePublication(input: {
    readonly cellId: string;
    readonly claimId: string;
  }): Promise<{ readonly status: "prepared"; readonly candidate: ProofClaimCandidate } | { readonly status: "blocked"; readonly reason: string }>;
  /** Verify then run the SEPARATE publication admission; verification alone never publishes. */
  evaluatePublication(input: { readonly candidateId: string }): Promise<ProofPublicationResult>;
  reassess(input: { readonly claimId: string }): Promise<ClaimAssessmentRevision>;
  assetView(claimId: string): Promise<ProofAssetView>;
  /**
   * G10-T CF-T-02: evidence-grounded Explore extraction. Builds a selector-only
   * evidence context, runs ephemeral branches and evaluates their candidates
   * through the REAL ReasoningCell service. It NEVER verifies with the proof plane,
   * publishes, or approves disclosure. Absent extraction wiring ⇒ `capability_required`.
   */
  analyzeEvidence(input: { readonly evidenceIds: readonly string[]; readonly objective: string; readonly branchCount?: number }): Promise<AnalyzeEvidenceOutcome>;
}

/** Local, purpose-scoped disclosure over published claims. Preview ≠ export ≠ recipient receipt. */
export interface DisclosureApplicationSurface {
  preview(request: DisclosureRequest): Promise<DisclosurePreview>;
  approveAndExport(input: { readonly previewId: string }): Promise<DisclosureExportOutcome>;
  history(): Promise<readonly DisclosureExportReceipt[]>;
}

export function makeProofSurfaces(deps: ProofSurfaceDeps): { readonly proof: ProofApplicationSurface | undefined; readonly disclosure: DisclosureApplicationSurface | undefined } {
    const proof: ProofApplicationSurface | undefined =
      deps.proof === undefined
        ? undefined
        : (() => {
            const service = deps.proof!;
            const revision = (ref: ProofSourceRevisionRef) =>
              materializeProofSourceRevisionRef({ sourceId: ref.sourceId, revision: ref.revision, contentDigest: ref.contentDigest });
            return {
              importSource: (input) =>
                service.importSource({
                  bytes: input.bytes,
                  mediaType: input.mediaType,
                  label: input.label,
                  provenance: input.provenance,
                  sourceId: input.sourceId,
                  ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
                }),
              recordEvidence: (input) => service.recordEvidence({ sourceRevision: revision(input.sourceRevision), selector: input.selector }),
              sources: () => service.sources(),
              sourceRevisions: (sourceId) => service.sourceRevisions(sourceId),
              inspectSource: (revisionRef) => service.sourceRevision(revision(revisionRef)),
              readContentExplicit: (revisionRef) => service.readSourceContent(revision(revisionRef)),
              evidence: (evidenceId) => service.evidence(evidenceId),
              claims: () => service.publishedClaims(),
              inspectClaim: (claimId) => service.inspectClaim({ claimId }),
              why: (claimId) => service.why(claimId),
              preparePublication: async (input) => {
                if (deps.reasoning === undefined) {
                  return Object.freeze({ status: "blocked" as const, reason: "no reasoning cell service is configured; a reasoning-origin candidate cannot be prepared" });
                }
                const source = reasoningClaimPublicationSource({ reasoning: deps.reasoning });
                const prepared = await source.preparePublication({ cellId: input.cellId, claimId: input.claimId });
                if (prepared.status === "blocked") return prepared;
                // Recording the candidate on the proof plane NEVER verifies or publishes it: the
                // separate verification + publication-admission policies must still run.
                const candidate = await service.prepareCandidate({
                  claimType: prepared.candidate.claimType,
                  content: prepared.candidate.content,
                  supportingEvidenceIds: prepared.candidate.supportingEvidence.map((entry) => entry.evidenceId),
                  contradictingEvidenceIds: prepared.candidate.contradictingEvidence.map((entry) => entry.evidenceId),
                  dependencies: prepared.candidate.dependencies,
                  origin: prepared.candidate.origin,
                  provenance: prepared.candidate.provenance,
                });
                return Object.freeze({ status: "prepared" as const, candidate });
              },
              evaluatePublication: async (input) => {
                await service.verify({ candidateId: input.candidateId });
                return service.decidePublication({ candidateId: input.candidateId });
              },
              reassess: (input) => service.reassess({ claimId: input.claimId }),
              assetView: (claimId) => service.proofAssetView(claimId),
              analyzeEvidence: (input) => {
                const extraction = deps.proofExtraction;
                if (extraction === undefined) {
                  return Promise.resolve(
                    Object.freeze({
                      status: "capability_required" as const,
                      detail: "evidence extraction is not configured for this installation (needs a source content port and reasoning/branch execution wiring)",
                    }),
                  );
                }
                return extraction.analyzeEvidence(input);
              },
            };
          })();


    const disclosure: DisclosureApplicationSurface | undefined =
      deps.disclosure === undefined
        ? undefined
        : {
            preview: (request) => deps.disclosure!.preview(request),
            approveAndExport: (input) => deps.disclosure!.approveAndExport(input),
            history: () => deps.disclosure!.history(),
          };


  return { proof, disclosure };
}
