/**
 * G10-T Proof/Evidence plane — ReasoningCell → Proof claim publication bridge.
 *
 *   ReasoningClaim accepted ≠ Proof claim published
 *   ReasoningClaimRef ≠ EvidenceClaimRef
 *   Accepted (cell-local) ≠ Published (proof plane) ≠ Truth
 *
 * This bridge is a ONE-WAY, TRANSLATION-ONLY seam. It reads an admitted
 * ReasoningCell claim and materializes a `ProofClaimCandidate` artifact. It
 * never calls the proof service's verification/publication APIs, so it can never
 * cause a proof claim to be published: a candidate produced here must still pass
 * the proof plane's own verification + publication-admission policies.
 *
 * FAIL CLOSED on the freshness/standing question:
 *   - the claim must be an ACTIVE (currently effective) admitted claim; a claim
 *     that was never admitted, has been invalidated, or is dependency-inactive
 *     returns `{ status: "blocked" }`.
 *   - `dependencies` on the produced candidate are ALWAYS empty. Reasoning
 *     dependencies are NOT published proof claims and must never be smuggled in
 *     as proof-plane dependency edges.
 *
 * PROVENANCE, NOT DEPENDENCY: the reasoning origin (cellId/claimId/claimDigest)
 * is recorded in `provenance` as a historical fact. If the reasoning claim is
 * INVALIDATED after this candidate is published, the published proof claim does
 * NOT disappear and does not auto-become STALE. Reasoning origin is provenance,
 * not a live dependency edge.
 *
 * Model information is NOT exposed by the `ReasoningCellService` surface used
 * here (claims carry no model field); it is therefore not fabricated.
 */

import type { ReasoningClaim } from "../reasoning_cell/claims.js";
import { reasoningClaimTypeKey } from "../reasoning_cell/claims.js";
import type { ReasoningCandidate } from "../reasoning_cell/artifacts.js";
import type { ReasoningCellService } from "../reasoning_cell/service.js";
import type { ProofClaimCandidate, ProofClaimTypeRef } from "./claims.js";
import { materializeProofClaimCandidate } from "./claims.js";

export const REASONING_PUBLICATION_ADAPTER_ID = "reasoning-cell.claim-publication";

export interface ReasoningClaimPublicationSourcePort {
  readonly adapterId: string;
  preparePublication(input: {
    readonly cellId: string;
    readonly claimId: string;
  }): Promise<
    | { readonly status: "prepared"; readonly candidate: ProofClaimCandidate }
    | { readonly status: "blocked"; readonly reason: string }
  >;
}

const PROOF_STATEMENT_TYPE_REF: ProofClaimTypeRef = Object.freeze({ typeId: "proof.statement", version: "v1" });
const REASONING_STATEMENT_TYPE_KEY = "reasoning.statement@v1";

/** Derive a non-empty statement string from opaque reasoning claim content. */
function statementFromContent(content: unknown): string {
  if (typeof content === "object" && content !== null && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    const statement = record.statement;
    if (typeof statement === "string" && statement.trim() !== "") return statement;
    const description = record.description;
    if (typeof description === "string" && description.trim() !== "") {
      const reason = record.reason;
      return typeof reason === "string" && reason.trim() !== "" ? `${description}: ${reason}` : description;
    }
  }
  try {
    const text = JSON.stringify(content);
    if (typeof text === "string" && text.length > 0) return text;
  } catch {
    // fall through to the conservative description below
  }
  return "reasoning claim content (no textual statement available)";
}

/**
 * Map a reasoning claim type/content to a proof claim type/content.
 * `reasoning.statement.v1` maps to `proof.statement.v1`; every other reasoning
 * type falls back to `proof.statement.v1` with a statement derived from content.
 */
function mapClaimContent(claim: ReasoningClaim): { readonly claimType: ProofClaimTypeRef; readonly content: unknown } {
  if (reasoningClaimTypeKey(claim.type) === REASONING_STATEMENT_TYPE_KEY) {
    return { claimType: PROOF_STATEMENT_TYPE_REF, content: { statement: statementFromContent(claim.content) } };
  }
  return { claimType: PROOF_STATEMENT_TYPE_REF, content: { statement: statementFromContent(claim.content) } };
}

/**
 * Recover the external (opaque evidence-id) references of the candidate(s) that
 * proposed this semantic claim. Claim identity is content-addressed, so every
 * candidate proposing the same claimDigest shares that identity; their external
 * evidence references are unioned. Evidence ids are NEVER resolved to bodies.
 */
async function externalEvidenceIdsFor(
  reasoning: ReasoningCellService,
  cellId: string,
  claimDigest: string,
): Promise<readonly string[]> {
  const events = await reasoning.events({ cellId });
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type !== "CANDIDATE_SUBMITTED") continue;
    const payload = event.payload;
    if (typeof payload !== "object" || payload === null) continue;
    const candidate = (payload as { readonly candidate?: ReasoningCandidate }).candidate;
    if (candidate === undefined) continue;
    if (candidate.claim.claimDigest !== claimDigest) continue;
    for (const ref of candidate.externalEvidenceRefs) ids.add(ref.evidenceId);
  }
  return Object.freeze([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function reasoningClaimPublicationSource(deps: {
  readonly reasoning: ReasoningCellService;
}): ReasoningClaimPublicationSourcePort {
  return Object.freeze({
    adapterId: REASONING_PUBLICATION_ADAPTER_ID,

    async preparePublication(input: {
      readonly cellId: string;
      readonly claimId: string;
    }): Promise<
      | { readonly status: "prepared"; readonly candidate: ProofClaimCandidate }
      | { readonly status: "blocked"; readonly reason: string }
    > {
      let graph;
      try {
        graph = await deps.reasoning.claimGraph({ cellId: input.cellId });
      } catch (error) {
        // Fail closed: an unknown/unreadable cell cannot yield a publishable candidate.
        return Object.freeze({
          status: "blocked" as const,
          reason: `reasoning cell "${input.cellId}" is not readable: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      const node = graph.nodes.find((entry) => entry.ref.claimId === input.claimId);
      if (node === undefined) {
        return Object.freeze({ status: "blocked" as const, reason: `reasoning claim "${input.claimId}" is not admitted in cell "${input.cellId}"` });
      }
      if (!node.active) {
        return Object.freeze({
          status: "blocked" as const,
          reason: `reasoning claim "${input.claimId}" is not ACTIVE (invalidated or dependency-inactive); accepted ≠ published and only ACTIVE admitted claims are eligible`,
        });
      }

      const evidenceIds = await externalEvidenceIdsFor(deps.reasoning, input.cellId, node.claim.claimDigest);
      const mapped = mapClaimContent(node.claim);
      const provenance = Object.freeze({
        reasoningCellId: input.cellId,
        reasoningClaimId: input.claimId,
        reasoningClaimDigest: node.claim.claimDigest,
        reasoningClaimType: reasoningClaimTypeKey(node.claim.type),
        reasoningFrontierDigest: graph.basis.frontierDigest,
      });
      let candidate: ProofClaimCandidate;
      try {
        candidate = materializeProofClaimCandidate({
          claimType: mapped.claimType,
          content: mapped.content,
          supportingEvidenceIds: evidenceIds,
          // Reasoning dependencies are NOT published proof claims: always empty.
          dependencies: [],
          origin: "REASONING_CELL",
          provenance,
        });
      } catch (error) {
        return Object.freeze({
          status: "blocked" as const,
          reason: `reasoning claim "${input.claimId}" could not be materialized as a proof claim candidate: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      return Object.freeze({ status: "prepared" as const, candidate });
    },
  });
}
