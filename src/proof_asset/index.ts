/**
 * G10-T authoritative Proof/Evidence plane — public barrel.
 *
 * Firewalls preserved across the whole surface:
 *   Source ≠ Evidence   Evidence ≠ Claim   Claim ≠ Truth
 *   Verification ≠ PublicationAdmission   PublishedClaim ≠ Authority
 *   Freshness ≠ Truth   STALE ≠ FALSE   HistoricalSupport ≠ CurrentSupport
 *   ReasoningClaimRef ≠ EvidenceClaimRef   VaultBlob ≠ SemanticClaim
 *
 * The plane records source revisions, content-addressed evidence selections,
 * candidate claims, policy verification results, publication decisions and
 * append-only assessments; it derives standings and never asserts authority,
 * truth, health, credentials, encryption, VC/DID or ZK claims.
 */

export * from "./refs.js";
export * from "./sources.js";
export * from "./evidence.js";
export * from "./materialize_selector.js";
export * from "./extraction.js";
export * from "./claims.js";
export * from "./verification.js";
export * from "./blob.js";
export * from "./store.js";
export * from "./service.js";
export * from "./campaign_bridge.js";
export * from "./reasoning_bridge.js";
export * from "./disclosure.js";
// `source_content_port.ts` and `service.ts` both export a name spelled
// `ProofSourceContentPort` (service.ts carries a legacy, revision-keyed alias).
// Explicitly re-export the canonical source-content port so the barrel is
// unambiguous; the explicit export wins over the star exports.
export { blobBackedSourceContentPort, type ProofSourceContentPort } from "./source_content_port.js";
