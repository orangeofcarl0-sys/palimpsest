# G10-T — Proof Asset Layer & Personal Data Proof Vault (Spec)

Raw Sources → Evidence → Verified Publication → Proof Assets → Freshness → Purpose-Scoped Disclosure.

Baseline: `main @ 735f54d6935b71f681ff97aa1413687baf53dfad`. First asset-centric vertical. Adds the
minimal authoritative Evidence plane and closes CF-S-08.

## Naming discipline

`ProofAsset` = "an evidence-backed claim admitted under a named verification/publication policy and
presented with provenance and current standing". It is **not** mathematical/legal proof, a government
credential, cryptographic attestation, objective truth or identity.

## Firewalls

```
Source ≠ Evidence   Evidence ≠ Claim   Claim ≠ Truth
ReasoningAcceptedClaim ≠ EvidenceClaim   ReasoningAdmission ≠ ProofPublication
Verification ≠ PublicationAdmission   PublishedClaim ≠ Authority   ProofAssetView ≠ CanonicalTruthSpecies
ProofAsset ≠ Credential/LegalProof/Identity/Commitment
Freshness ≠ Truth   STALE ≠ FALSE   CONTRADICTED ≠ REVOKED_SOURCE   HistoricalSupport ≠ CurrentSupport
DisclosurePlan ≠ Disclosure   DisclosureBundlePrepared ≠ Disclosed   LocalExportReceipt ≠ RecipientReceipt
AudienceLabel ≠ AuthenticatedRecipient   VaultBlob ≠ SemanticClaim   BlobStore ≠ EvidenceStore
HTTPAuth ≠ DisclosureApproval   AgentAccess ≠ UserConsent   PersonalData ≠ AgentMemory
```

## Pipeline

```
Raw user source → immutable source revision → EvidenceItem → ProofClaimCandidate
→ verification (policy) → separate publication admission → published EvidenceClaim
→ derived ProofAssetView → freshness / dependency status → purpose-scoped disclosure preview
→ explicit approval → local export → receipt
```

## Rules

- No three equivalent claim identities: `ReasoningClaimRef` (reasoning cell), `ProofClaimRef` (Evidence
  plane), `ProofAssetView` (derived view; no parallel canonical store).
- Raw bytes never live in semantic SQLite; a content-addressed local blob adapter holds them. No
  encryption-at-rest claim unless implemented (it is not).
- Source revisions are immutable; a newer revision never deletes older evidence.
- `selectionDigest` is computed by the resolver from actual content; a caller cannot self-report it.
- Verification standing comes only from a `ProofVerificationPolicyPort`; publication requires a separate
  `ProofPublicationAdmissionPort`; v1 PUBLISHs only SUPPORTED/PARTIALLY_SUPPORTED.
- Published claim content is immutable; later standings are append-only `ClaimAssessmentRevision`s.
- Freshness policies: `IMMUTABLE_EVIDENCE`, `LATEST_SOURCE_REVISION`, `EXPIRES_AT`; effective standing
  derives from freshness + dependency cascade (a stale dependency makes a dependent effectively STALE,
  never automatically CONTRADICTED); history is retained.
- Import is explicit and triggers no model call; source content is read only through an explicit port.
- Disclosure is purpose-scoped **local** only: exactly the selected claims + explicitly required
  dependencies + selected evidence; WHOLE_SOURCE evidence forces an over-disclosure warning; export
  requires a separate admission (HTTP auth ≠ approval); the receipt records EXPORT only, never delivery.
- No remote disclosure, no VC/DID/ZK, no PKI, no recipient authentication in T.

## Exit criterion

Palimpsest can import user-controlled sources without automatically exposing them to a model, preserve
immutable source revisions outside the semantic database, derive exact EvidenceItems, explicitly
transform an active ReasoningCell claim into a separately verified and separately admitted Evidence-plane
claim, expose that claim to Campaigns through a real read-only CampaignEvidencePort, derive user-facing
ProofAssets with provenance, dependency and freshness semantics, and prepare/export a purpose-scoped
local disclosure bundle containing only explicitly selected claims and required evidence — without
equating proof assets with truth, legal credentials, identity authority, encryption, recipient
authentication or cryptographic selective disclosure.
