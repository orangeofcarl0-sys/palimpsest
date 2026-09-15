# G10-T Carry-Forward Register

Mandatory input for the next stage. No `BLOCKER_IN_T`.

## CF-T-01 — No Proof Vault web vertical
- **Evidence:** the proof/disclosure product surface is complete as tools + HTTP + application surfaces;
  the minimal Proof Vault UI (Sources / Proof Assets / Disclosure) was not built.
- **Category:** UX · **Trigger:** a user-facing Proof Vault pass. · **Blocking:** NON_BLOCKING

## CF-T-02 — Real DSH extraction cannot attach proof evidence ids
- **Evidence:** a DSH ephemeral branch submits its own reasoning candidate without the proof-plane
  `evidenceId` in `externalEvidenceRefs`, so its claim cannot be verified/published through the proof
  plane. The Vertical E2E therefore used a real ReasoningCell service with deterministic policies.
- **Trigger:** extending the branch brief/candidate submission to carry explicit `externalEvidenceRefs`.
- **Blocking:** NON_BLOCKING (blocks only "real-host extraction", not the proof plane)

## CF-T-03 — Disclosure exports whole source files only
- **Evidence:** `TEXT_RANGE`/`JSON_POINTER` excerpts are recorded in evidence but the exporter writes the
  whole selected source file; sub-range excerpt materialization is not implemented.
- **Trigger:** a disclosure consumer that needs minimal excerpts. · **Blocking:** NON_BLOCKING

## CF-T-04 — Local-only disclosure
- **Evidence:** no federation send, cloud sync, VC/DID/ZK, PKI or recipient authentication exists. The
  local export receipt records EXPORT only, never delivery.
- **Trigger:** G10-U controlled proof disclosure / cross-app proof federation. · **Blocking:** NON_BLOCKING

## CF-T-05 — Verification is deterministic-policy only
- **Evidence:** `ProofVerificationPolicyPort` is a seam; the shipped path is a deterministic policy. No
  independent-model or human verification provider is wired.
- **Trigger:** an independent verifier capability. · **Blocking:** NON_BLOCKING

## CF-T-06 — No blob deletion / erasure engine
- **Evidence:** semantic history and blob retention are separate; deleting blobs is not implemented, and
  a missing blob yields `unavailable`/`error` (never `false`).
- **Trigger:** an erasure workflow that first shows dependent Evidence/Claims. · **Blocking:** NON_BLOCKING

## CF-T-07 — No person/identity ontology
- **Evidence:** no `PersonIdentity`/legal identity species; v1 is single-deployment-context.
- **Trigger:** multi-user or identity-bound proof requirements. · **Blocking:** NON_BLOCKING

## CF-T-08 — Import connectors are explicit local files only
- **Evidence:** sources are imported by explicit bytes/content; no filesystem crawler, no auto-index, no
  import-triggered model call.
- **Trigger:** an explicit connector for a named source provider. · **Blocking:** NON_BLOCKING

```text
No BLOCKER_IN_T. Next direction (spec §58): G10-U — Controlled Proof Disclosure & Cross-App Proof
Federation (boundary-based bundle exchange, recipient-side acknowledgement, purpose/consent lifecycle,
revocation/expiry receipts, credential/attestation standards audit, cryptographic selective disclosure
only if justified), or first Proof Vault source connectors / Monitor condition sources / independent
Verify provider.
```
