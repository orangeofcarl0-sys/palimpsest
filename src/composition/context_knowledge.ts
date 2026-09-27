/**
 * E1-K §10.2 — the CONTEXT-KNOWLEDGE composition adapter.
 *
 *     composition knows wiring;  context knows context semantics.
 *
 * This module is the ONE place that may see the concrete Proof owner, Reasoning owner and
 * ProjectWorkspace owner and adapt their READS into the context owner's own
 * `ContextKnowledgePorts`. It contains NO policy: every eligibility judgement (is it associated? is it
 * fresh? is the claim active?) belongs to `src/context/knowledge.ts`. Here we only answer the read.
 *
 *     KnowledgeContext  ≠  ResultContinuation
 *
 * That is why this is its own module rather than part of `src/composition/continuation.ts`: the two
 * adapters consume different owners for different planes, and merging them would make one cluster the
 * wiring owner of two unrelated semantics.
 *
 * MUTATION IS NOT REACHABLE. The Proof and Reasoning services passed in expose many write methods; this
 * adapter names only reads (`basis`, `proofAssetView`, `replay`, `frontier`, `claimGraph`) and the ports
 * it produces expose only reads, so a context compile can never write an owner's truth.
 *
 * Layer: L5 (`src/composition/`). Host/deployment-side wiring, like every other composition module.
 */
import type { ProofEvidenceService } from "../proof_asset/index.js";
import type { ReasoningCellService } from "../reasoning_cell/index.js";
import type { ProjectWorkspaceService } from "../project_workspace/index.js";
import type {
  ContextKnowledgePorts,
  ProofBasisAtCompile,
  ProofClaimObservation,
  ReasoningFrontierBasisAtCompile,
} from "../context/knowledge.js";

export interface ContextKnowledgeCompositionInput {
  readonly projectId: string;
  /** The composed Proof owner, when this deployment has one. */
  readonly proof: ProofEvidenceService | undefined;
  /** The composed Reasoning owner, when this deployment has one. */
  readonly reasoning: ReasoningCellService | undefined;
  /** The composed ProjectWorkspace owner, when this deployment has one. */
  readonly projectWorkspace: ProjectWorkspaceService | undefined;
}

/**
 * Adapt the composed owners into the context owner's read ports.
 *
 * Each capability is present EXACTLY when its owner is composed — no stub stands in for an absent
 * owner, so `KNOWLEDGE_CAPABILITY_UNAVAILABLE` is a fact about this deployment rather than a guess.
 * `undefined` is returned only when NO owner is composed at all.
 */
export function composeContextKnowledgePorts(
  input: ContextKnowledgeCompositionInput,
): ContextKnowledgePorts | undefined {
  const { projectId, proof, reasoning, projectWorkspace } = input;
  if (projectWorkspace === undefined && proof === undefined && reasoning === undefined) return undefined;

  /**
   * ProjectWorkspace READ: is this asset explicitly associated with THIS project?
   *
   * `projectScopedAssets` is the workspace's own scoped read: it FAILS CLOSED on a project id that is
   * not the workspace's project, so a caller cannot widen scope by passing a foreign id. Membership is
   * matched on `assetKind` + `canonicalRef.id`, which keeps the three truths separate: this answers
   * ASSOCIATION and says nothing about standing or activity.
   */
  const projectAssets =
    projectWorkspace === undefined
      ? undefined
      : {
          async associated(targetProjectId: string, kind: "PROOF_CLAIM" | "REASONING_CELL", id: string): Promise<boolean> {
            if (targetProjectId !== projectId) return false;
            let associations: readonly { readonly assetKind: string; readonly canonicalRef: { readonly id: string } }[];
            try {
              associations = await projectWorkspace.projectScopedAssets(targetProjectId);
            } catch {
              /**
               * The workspace REFUSED the scope (it is not this workspace's project). A refusal is not
               * an answer, so it fails CLOSED: "not associated with the project you asked about" is the
               * only safe reading, and it can never widen eligibility.
               */
              return false;
            }
            return associations.some(
              (association) => association.assetKind === kind && association.canonicalRef.id === id,
            );
          },
        };

  /**
   * Proof owner READ.
   *
   *   observeBasis → the plane's OWN basis (never a derived view digest)
   *   observeClaim → published? current standing/freshness? or a classified absence
   *   readClaim    → the canonical body plus the CURRENT view (pull)
   */
  const proofAssets =
    proof === undefined
      ? undefined
      : {
          async observeBasis(): Promise<ProofBasisAtCompile | undefined> {
            const basis = await proof.basis();
            return basis === undefined
              ? undefined
              : { scopeId: basis.scopeId, throughSeq: basis.throughSeq, chainDigest: basis.chainDigest };
          },
          async observeClaim(claimId: string): Promise<ProofClaimObservation> {
            const published = await proof.publishedClaims();
            if (!published.some((claim) => claim.claimRef.claimId === claimId)) {
              /**
               * The id names no published claim. It is NOT_PUBLISHED only when a candidate was recorded
               * under it (the candidate namespace `pcc-` is minted by the Proof owner for exactly that);
               * otherwise it names nothing at all and is NOT_FOUND. Both are owner facts read through the
               * owner's own `replay`, so the distinction is reported rather than guessed.
               */
              const recordedCandidate = await candidateRecorded(proof, claimId);
              return recordedCandidate ? { classified: "NOT_PUBLISHED" } : { classified: "NOT_FOUND" };
            }
            const view = await proof.proofAssetView(claimId);
            return {
              classified: "observed",
              effectiveStanding: String(view.effectiveStanding),
              freshness: String(view.freshness),
            };
          },
          async readClaim(claimId: string) {
            const published = await proof.publishedClaims();
            if (!published.some((claim) => claim.claimRef.claimId === claimId)) return undefined;
            const view = await proof.proofAssetView(claimId);
            return {
              body: view.content,
              effectiveStanding: String(view.effectiveStanding),
              freshness: String(view.freshness),
            };
          },
        };

  /**
   * Reasoning owner READ.
   *
   *   observeFrontier  → ONE self-consistent frontier observation (`frontier({cellId})` is a single
   *                      state read, so no race closure is needed)
   *   readAdmittedClaim→ an admitted claim even after it becomes INACTIVE (`claimGraph` resolves both
   *                      active and inactive admitted claims), with its CURRENT activity
   */
  const reasoningCells =
    reasoning === undefined
      ? undefined
      : {
          async observeFrontier(cellId: string): Promise<{ readonly basis: ReasoningFrontierBasisAtCompile; readonly activeClaims: readonly { readonly claimId: string }[] } | undefined> {
            try {
              const frontier = await reasoning.frontier({ cellId });
              return {
                basis: {
                  cellId: frontier.basis.cellId,
                  frontierRevision: frontier.basis.frontierRevision,
                  frontierDigest: frontier.basis.frontierDigest,
                },
                activeClaims: frontier.claims.map((entry) => ({ claimId: entry.ref.claimId })),
              };
            } catch (error) {
              // An unknown cell is an honest absence, not a fabricated empty frontier.
              if (isUnknownCell(error)) return undefined;
              throw error;
            }
          },
          async readAdmittedClaim(cellId: string, claimId: string) {
            try {
              const graph = await reasoning.claimGraph({ cellId });
              const node = graph.nodes.find((entry) => entry.ref.claimId === claimId);
              if (node === undefined) return undefined;
              return {
                claim: node.claim.content,
                currentlyActive: node.active,
                currentFrontierBasis: {
                  cellId: graph.basis.cellId,
                  frontierRevision: graph.basis.frontierRevision,
                  frontierDigest: graph.basis.frontierDigest,
                },
              };
            } catch (error) {
              if (isUnknownCell(error)) return undefined;
              throw error;
            }
          },
        };

  return Object.freeze({
    ...(projectAssets === undefined ? {} : { projectAssets }),
    ...(proofAssets === undefined ? {} : { proofAssets }),
    ...(reasoningCells === undefined ? {} : { reasoningCells }),
  });
}

/** Did the Proof owner ever record a candidate under this id? Read through the owner's own replay. */
async function candidateRecorded(proof: ProofEvidenceService, candidateId: string): Promise<boolean> {
  const events = await proof.replay();
  return events.some((event) => {
    if (event.type !== "CANDIDATE_RECORDED") return false;
    const payload = event.payload as { readonly candidate?: { readonly candidateId?: unknown } } | undefined;
    return payload?.candidate?.candidateId === candidateId;
  });
}

function isUnknownCell(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { readonly kind?: unknown }).kind === "unknown_cell"
  );
}
