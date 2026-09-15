# G10-T Proof Asset Assessment (T0)

Baseline: `main @ 735f54d6935b71f681ff97aa1413687baf53dfad`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## Finding: no authoritative Evidence/Proof plane exists

`grep ProofEvidence|EvidenceStore|EvidenceItem|ProofAsset` → **zero matches** in `src/`/`test/`.
`CF-S-08` is accurate: `ReasoningCell accepted claim → Evidence/proof-asset publication` was absent.

What exists and is **not** an authoritative Evidence plane:

- `src/evidence/` (name only): a pure Work/Research gate helper (`GateEngine`, `ClaimGraph`,
  invalidation calculus) that reads the Work SQLite `evidence` projection; in-memory, Work-scoped.
- Work `evidence` projection (`src/schema/models.ts` `EvidenceAtom`, table `evidence(project_id,
  evidence_id, status, evidence_json, …)`): attempt/commit evidence atoms keyed by `project_id`, with
  `active|stale`. No cross-project claim-standing identity, no per-scope chain, no admission lineage,
  not exported as an Evidence service. **T leaves it untouched and read-only.**

So T may add ONE minimal authoritative store (`ProofEvidenceStore`).

## Existing contracts T must satisfy (verified)

- `CampaignEvidencePort { inspectClaim(claim: EvidenceClaimRef): Promise<EvidenceKnowledge<ClaimStandingSnapshot>> }`
  (`src/campaign/epistemic.ts`), with `ClaimStandingSnapshot { claim, status, supportingEvidenceIds,
  contradictingEvidenceIds, provenanceDigest, digest }`, `CampaignClaimStatus = SUPPORTED |
  PARTIALLY_SUPPORTED | CONTRADICTED | INCONCLUSIVE | STALE`, and digest via
  `materializeClaimStandingSnapshot` (domain `palimpsest.claim-standing.v1`). Campaign consumes it
  read-only and fails closed on non-`known`.
- `ReasoningCellService.frontier/activeClaims/claimGraph/cellView` expose ACTIVE admitted
  `ReasoningClaim`s; `ReasoningClaimRef = {schemaVersion, cellId, claimId}`;
  `ReasoningClaim { type, content, dependencies, claimDigest }`. **No publication concept exists.**
- `ExternalEvidenceRef { evidenceId }` is an opaque stable id carried on reasoning candidates and never
  resolved today — the new proof plane is its natural resolver.
- ReasoningCell verification and epistemic admission are **separate policy seams** invoked only by the
  service; a caller can never supply a VerificationResult/AdmissionDecision. T must not bypass them.
- Store idiom to mirror: per-scope append-only chained SQLite, content-addressed event ids, CAS
  `appendAtomic` on `{scopeId, throughSeq, chainDigest}`, definition-first, strict registered parsers.

## Truth ownership matrix

| Owner | Owns |
| --- | --- |
| `ProofEvidenceStore` | source metadata/revision history; EvidenceItem metadata; publication candidates; verification results; publication decisions; published EvidenceClaims; claim assessment history; proof-claim dependencies; disclosure bundle manifests; local export receipts |
| `LocalProofBlobStore` | opaque source bytes by content digest (never semantic truth) |
| `ReasoningCellStore` | cell-local reasoning state (unchanged) |
| `CampaignStore` | hypotheses/belief history (unchanged) |
| `BoundaryMemoryStore` | shared boundary state (unchanged) |
| Work `event_store`/`evidence` projection | Work attempt/commit evidence atoms (unchanged, read-only to T) |

Identity discipline: `ReasoningClaimRef ≠ EvidenceClaimRef/ProofClaimRef`; `ProofAssetView` is a
**derived** user-facing view with no parallel canonical store.

## T0 decisions

- No `PersonIdentity`/legal identity ontology; v1 is single-deployment-context.
- Source bytes never live in semantic SQLite; a content-addressed local blob adapter holds them, with
  **no encryption/std 0700-0600 claims unless actually implemented and tested**.
- Import is explicit and triggers no model call; source content is reached only through an explicit
  `ProofSourceContentPort` for extract/verify/prepare-disclosure.
- `ProofAsset` means "an evidence-backed claim admitted under a named verification/publication policy
  with current standing" — never mathematical/legal proof, credential, identity, or objective truth.
- Disclosure is purpose-scoped **local** only in T; no federation send, no VC/DID/ZK, no recipient
  authentication, no delivery receipt.
