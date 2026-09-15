# G10-U Carry-Forward Register

Mandatory input for the next stage. No `BLOCKER_IN_U`.

## CF-U-01 — No evidence enumeration route
- **Evidence:** there is no `GET /api/proof/evidence?sourceId`; the Sources detail lists session-created
  evidence plus evidence referenced by published claims, labelled as such.
- **Trigger:** a per-source/per-revision evidence enumeration requirement. · **Blocking:** NON_BLOCKING

## CF-U-02 — No model/provider metadata route
- **Evidence:** the proof plane stores model/provider exposure only when a bridge supplies it; the UI
  honestly renders "unknown" otherwise.
- **Trigger:** a model-route provenance source. · **Blocking:** NON_BLOCKING

## CF-U-03 — Freshness policy not settable through the application surface
- **Evidence:** `preparePublication(cellId, claimId)` uses the reasoning-origin path; a product UI built
  only on `installed.application` cannot choose `LATEST_SOURCE_REVISION` for a manual claim.
- **Trigger:** a product path needing manual claims with explicit freshness. · **Blocking:** NON_BLOCKING

## CF-U-04 — Browser import is base64 JSON, not streaming/multipart
- **Evidence:** import is bounded by the 1 MB body limit (~750 KB raw); no multipart/octet-stream path.
- **Trigger:** larger local sources. · **Blocking:** NON_BLOCKING

## CF-U-05 — Real-DSH off-allowlist negative is injected, not model-forced
- **Evidence:** the enforcement seam is shared and unit-tested with an injected off-allowlist payload; a
  live model cannot be made to cite a foreign id deterministically.
- **Trigger:** a deterministic adversarial model harness. · **Blocking:** NON_BLOCKING

## CF-U-06 — Excerpt artifacts are exports, not revisions
- **Evidence:** materialized excerpts are written into the disclosure bundle only; they are not stored as
  SourceRevisions (by design).
- **Trigger:** a need to re-inspect a past excerpt from the Vault. · **Blocking:** NON_BLOCKING

## CF-U-07 — T/U deferred scope unchanged
- CF-T-04 remote disclosure, CF-T-05 independent verifier, CF-T-06 erasure, CF-T-07 person identity,
  CF-T-08 external connectors remain deferred. · **Blocking:** NON_BLOCKING

```text
No BLOCKER_IN_U. Next direction (spec §45): G10-V — Controlled Proof Disclosure & Cross-App Proof
Federation (proof bundle over Boundary/Federation, recipient acknowledgement, purpose/consent lifecycle,
expiry/revocation, remote recipient identity/auth, VC/DID/attestation audit, cryptographic selective
disclosure only if justified), or named source connectors / independent Verify provider / Monitor
condition sources / blob retention+erasure by real need.
```
