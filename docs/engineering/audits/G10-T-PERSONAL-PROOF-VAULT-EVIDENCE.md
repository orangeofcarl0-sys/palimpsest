# G10-T Personal Proof Vault — Vertical E2E Evidence

Reproduce: `pnpm run build && node scripts/proof/proof-vault-e2e.mjs` (synthetic fixtures only; a real
`ReasoningCellService` event chain; deterministic policies). Evidence: `.dogfood/g10t-proof-vault-e2e.json`.

```text
result: PASS
syntheticOnly: true
extraction: deterministic-reasoning-cell (realReasoningCellService: true, dshUsed: false)
fixtures: degree.txt · employment.json · financial-summary.txt   (all synthetic)
refs:
  reasoningClaimRef cl-f34eb97cbd1235d18105fd37
  evidenceClaimRef  pc-267c8684ad7aed2ca4063f6ac95d7e67   (≠ reasoningClaimRef)
  dependentClaimRef pc-69d6ce8700f269d05a403790d96e0645
  degreeEvidenceId  pev-32b6ad44ed72c58473fbe1dd527b9ed6
staleCascade:
  degreeBaseStanding SUPPORTED · degreeEffectiveStanding STALE · degreeFreshness stale
  dependentEffectiveStanding STALE · degreeRevisionCount 2
disclosure:
  previewId dsp-8fd3f521ed564d672ad2d2164fbb6794
  bundleDigest c18258d9…  receiptDigest 7d29df1d…  exportedFileCount 2
  excludedClaimIds [employment, financial, dependent] · excludedEvidenceIds [employment, financial]
  excludedSourceIds [employment, financial]
restart:
  reconstructedExactly true · chainEvents 27 · disclosureReceiptCount 1 · disclosurePreviewCount 1
```

## Pipeline proven

1. Three synthetic sources imported explicitly (fetch-guarded: **no model/network call on import**).
2. Exact `EvidenceItem`s derived with `WHOLE_SOURCE`, `JSON_POINTER`, `WHOLE_SOURCE` selectors; selector
   digests computed by the resolver, not the caller.
3. A ReasoningCell claim was admitted (real event chain + verification and a SEPARATE epistemic
   admission), then `preparePublication` produced a candidate while **no EvidenceClaim existed**.
4. Deterministic proof verification, then an explicit publication admission, then publication produced a
   NEW `pc-…` claim distinct from the `cl-…` reasoning claim.
5. `inspectClaim` through the read-only `CampaignEvidencePort` returned a `known ClaimStandingSnapshot`.
6. A dependent derived claim was published; importing a newer `degree.txt` revision made the degree
   claim's freshness stale → base standing **SUPPORTED** but effective standing **STALE**, and the
   dependent claim became effectively **STALE** (history retained).
7. An education-only disclosure preview included the degree claim/evidence and **excluded** employment,
   financial and the dependent claim ids; the preview alone exported nothing (no receipt).
8. An explicit APPROVE + export wrote `manifest.json` + the selected source (2 files) and recorded a
   local EXPORTED receipt (never a delivery/recipient receipt).
9. Store close/reopen reconstructed all 27 chain events, 1 preview and 1 receipt exactly.

## Extraction-mode honesty

`dshUsed: false` **by design**, not as a fake: a real DSH ephemeral branch receives only the frozen
BranchBrief and submits its own candidate, so it cannot attach the proof-plane `evidenceId` to
`externalEvidenceRefs`; a DSH-produced reasoning claim would therefore be unverifiable and unpublishable.
The E2E instead uses a real `makeReasoningCellService` (real append-only chain, real separate
verification + admission) with deterministic policies, and records `mode`/`dshUsed` in the evidence.
Real DSH branch execution was separately proven in G10-S (`scripts/recipes/explore-e2e.mjs`). Closing the
evidenceId hand-off is CF-T-02.

## Firewalls observed

`Source ≠ Evidence ≠ Claim`; `ReasoningClaimRef ≠ EvidenceClaimRef`; verification ≠ publication
admission; `STALE ≠ FALSE`; history retained; preview ≠ export; HTTP/tool auth is not disclosure
approval; no federation send; no encryption/credential claim; only synthetic fixtures are used.
