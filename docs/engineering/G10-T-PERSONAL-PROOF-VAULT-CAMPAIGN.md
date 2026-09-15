# G10-T — Personal Data Proof Vault (Campaign)

| Step | Deliverable |
| --- | --- |
| T0 | Truth-ownership/privacy audit → `audits/G10-T-PROOF-ASSET-ASSESSMENT.md`, `audits/G10-T-S-CARRY-FORWARD-DISPOSITION.md` |
| T1 | Source refs/revisions + `LocalProofBlobStore` (`sources.ts`, `blob.ts`) |
| T2 | EvidenceItem + selectors (`evidence.ts`) |
| T3 | Claim types, candidates, verification + publication admission (`claims.ts`, `verification.ts`) |
| T4 | `SqliteProofEvidenceStore` + `makeProofEvidenceService` (`store.ts`, `service.ts`) |
| T5 | ReasoningCell publication bridge (`reasoning_bridge.ts`) — closes CF-S-08 |
| T6 | CampaignEvidencePort implementation (`campaign_bridge.ts`) |
| T7 | Freshness + dependency DAG (`service.ts`) |
| T8 | Disclosure preview/admission/local exporter/receipt (`disclosure.ts`, `source_content_port.ts`) |
| T9 | Application/tools/API wiring |
| T10 | Proof Vault web vertical → carried forward (CF-T-01) |
| T11 | Synthetic personal-data E2E (`scripts/proof/proof-vault-e2e.mjs`) |
| T12 | Adversarial/privacy/source-firewall closure |
| T13 | Docs/CI/carry-forward |

## Truth ownership

```
ProofEvidenceStore    source metadata/revisions, evidence, candidates, verification, publication,
                      published claims, assessments, dependencies, disclosure manifests, receipts
LocalProofBlobStore   opaque source bytes by content digest (never semantic truth)
ReasoningCellStore    cell-local reasoning state (unchanged)
CampaignStore         hypotheses/belief history (unchanged)
BoundaryMemoryStore   shared boundary state (unchanged)
Work evidence atom projection (unchanged, read-only to T)
```

## Red lines held

No second canonical Evidence store; source bytes outside semantic SQLite; caller cannot self-report
standing/decision; reasoning admission never auto-publishes; Campaign can inspect but not mutate proof;
stale ≠ false; history retained; preview ≠ export; HTTP auth ≠ disclosure approval; no federation send.
