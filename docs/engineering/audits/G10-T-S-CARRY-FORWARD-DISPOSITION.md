# G10-T — CF-S Carry-Forward Disposition

Input: `docs/engineering/audits/G10-S-CARRY-FORWARD.md` (CF-S-01 … CF-S-08).
Verdicts: `CLOSED_IN_T` · `RESCOPED_IN_T` · `STILL_DEFERRED_WITH_TRIGGER`.

| ID | Disposition | Reasoning |
| --- | --- | --- |
| CF-S-01 — no mode-selector onboarding panel | STILL_DEFERRED_WITH_TRIGGER | T adds the Proof Vault web vertical; the recipe mode panel remains future UX work. |
| CF-S-02 — VERIFY independence not wired by default | STILL_DEFERRED_WITH_TRIGGER | T ships a deterministic `ProofVerificationPolicyPort`; an independent-model verifier is still a future capability. |
| CF-S-03 — MONITOR has no condition source | STILL_DEFERRED_WITH_TRIGGER | Unchanged; T's freshness is pull/derived, not a background monitor. |
| CF-S-04 — EXPLORE quality transfer unknown | RESCOPED_IN_T | T's ReasoningCell→Publication bridge plus the synthetic E2E gives the first real "accepted claim becomes useful" path, but quality remains empirically unmeasured. |
| CF-S-05 — R empirical limits | STILL_DEFERRED_WITH_TRIGGER | Unchanged; T records model/provider exposure honestly. |
| CF-S-06 — tiny recipe catalog | STILL_DEFERRED_WITH_TRIGGER | Unchanged. |
| CF-S-07 — no learned retriever | STILL_DEFERRED_WITH_TRIGGER | T uses metadata-only proof queries. |
| CF-S-08 — proof-asset bridge not implemented | **CLOSED_IN_T** | `ReasoningClaimPublicationSourcePort` prepares a `ProofClaimCandidate` from an ACTIVE admitted claim; publication still requires separate verification + separate admission; `EvidenceClaimRef ≠ ReasoningClaimRef`; inactive claims fail closed. |

```text
No BLOCKER_IN_T. CF-S-08 closed by the explicit ReasoningCell → Proof publication bridge.
```
