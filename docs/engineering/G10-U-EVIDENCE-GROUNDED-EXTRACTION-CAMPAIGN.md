# G10-U — Local Proof Vault Product Closure (Campaign)

| Step | Deliverable |
| --- | --- |
| U0 | Product-gap audit → `audits/G10-U-PROOF-VAULT-PRODUCT-ASSESSMENT.md`, `audits/G10-U-T-CARRY-FORWARD-DISPOSITION.md` |
| U1/U2 | Typed proof HTTP helpers + Source import (bounded browser import) + Sources UI |
| U3 | Proof Assets UI (list/detail/Why/freshness/reassess) |
| U4/U5 | `EvidenceBoundReasoningContext` + allowlist enforcement + real DSH `externalEvidenceRefs` handoff |
| U6 | `analyzeEvidence` (application surface, HTTP, tool) with a pre-run model-exposure panel |
| U7/U8 | `materialize_selector.ts`: TEXT_RANGE / JSON_POINTER / WHOLE_SOURCE materialization |
| U9 | Disclosure manifest materials + preview/export parity + no-fallback export |
| U10 | Disclosure UI (preview ≠ approve/export; EXPORTED history) |
| U11 | Browser Proof Vault E2E (`e2e/proof-vault.spec.ts`) |
| U12 | Real DSH extraction E2E (`scripts/proof/real-extraction-e2e.mjs`) |
| U13 | Byte-level selective-disclosure E2E (`scripts/proof/selective-disclosure-e2e.mjs`) + privacy/claims audits |
| U14 | Docs/CI/carry-forward |

## Truth ownership (unchanged)

`ProofEvidenceStore` remains the ONE authoritative Proof/Evidence plane; `LocalProofBlobStore` holds
opaque bytes; ReasoningCell/Campaign/Boundary/Work stores unchanged; the UI is a derived view over the
typed application/HTTP surface (no second truth store, no direct store/blob access).

## Red lines held

Import ≠ Analyze ≠ Verify ≠ Publish; preview ≠ export; browser auth ≠ disclosure approval; branch
candidates constrained to an evidence allowlist; excerpt export ≠ source revision; no remote sharing; no
encryption claim; no truth/legal wording; no score.
