# G10-G0 — PAG Ownership Matrix

Every fact has exactly ONE canonical owner. Campaign adds the temporal/
epistemic row without absorbing any existing authority.

| Fact | Canonical owner | Notes |
| ---- | --------------- | ----- |
| Institution identity / charter / epoch | `InstitutionStore` | durable lineage; G0 adds candidate isolation |
| Organization definition / revision | `OrganizationStore` | immutable revisions |
| Work / Project / Task / Attempt | Work `EventStore` | `projects`, `tasks`, `attempts` projections |
| Evidence atoms (evidence bodies) | Work `EventStore` `evidence` projection | `EVIDENCE_ADDED` / `EVIDENCE_STALE` events |
| Claim standing (derived) | existing Evidence plane (`ClaimGraph.claimStatus`) | DERIVED; currently in-memory, not event-sourced |
| Typed invalidation calculus | `src/evidence/invalidation.ts` | `changeClassInvalidates` / `classifyLateResult` |
| Context manifest (per attempt) | Work `EventStore` `context_manifests` | canonical *what context an attempt used* |
| Context brief / requirement / distribution / embeddings | context layer | DERIVED transport only |
| Collaboration (peers/commitments/handoff) | `CoordinationStore` | federation semantics |
| PersistentPoint | `ContinuityStore` | operational continuity locus |
| Runtime Activation / Session | runtime layer | not Campaign semantics |
| External effects | Ordarium ledger | effect admission |
| **Campaign identity / history** | **G1 `CampaignStore`** | new temporal/epistemic store |
| **CampaignCommitment** | **G1 `CampaignStore`** | append-only events; ≠ federation Commitment |
| **Hypothesis branches** | **G1/G2 `CampaignStore`** | Campaign working hypotheses |
| **EvidenceHistory observations** | **G1/G2 `CampaignStore`** | historical observations of Evidence-plane standing |
| **CurrentBeliefState** | **G2 derived projection** | NOT canonical truth; replay-verifiable |
| **Interventions** | **G3 `CampaignStore`** | observed Work outcome + epistemic outcome |
| **Watch definitions** | **G4 `CampaignStore`** | durable prospective conditions |
| **Watch observations / external signals** | **external / current observation sources** | read-only ports; never Campaign-owned truth |
| **Lifecycle state** | **G5 derived projection** | replayable from Campaign events |
| **Compiler context / candidates** | **G6 derived** | disposable; never canonical |

## Non-overlap rules

```text
Campaign evidence observations ≠ evidence bodies      (refs only)
CurrentBeliefState           ≠ Evidence claim standing (derived mapping of it)
CampaignCommitment           ≠ federation Commitment
CampaignProjectRef           ≠ Campaign identity
WatchId                      ≠ runtime process / Activation
WakeCycleId                  ≠ InstitutionEpoch / ActivationId
CampaignStore                ≠ WorkStore / EvidenceStore
```

No store writes into another store's canonical tables. Cross-store progress
uses idempotent keys, freshness bases, and reconciliation — never claimed
distributed atomicity.
