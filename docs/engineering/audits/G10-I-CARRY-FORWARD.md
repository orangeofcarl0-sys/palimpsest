# G10-I CARRY-FORWARD Register

Mandatory input for G10-J. New non-blocking findings from G10-I (H items are disposed in
[`G10-I-H-CARRY-FORWARD-DISPOSITION.md`](G10-I-H-CARRY-FORWARD-DISPOSITION.md)).

## CF-I-01 — Peer-edge distribution not observable
- **ID:** CF-I-01 · **Observed at:** `src/organization_dynamics/service.ts` (INTERACTION_CONCENTRATION unresolved)
- **Evidence:** the coordination adapter exposes event-type counts and payload-scanned peer ids, not peer-pair edges.
- **Category:** FEDERATION · **Why not in G10-I:** edge-level observation needs a richer coordination projection.
- **Semantic impact:** concentration cannot be assessed; it is reported `unresolved`, never guessed.
- **Recommended next stage:** G10-J or a federation-observation stage. · **Blocking status:** NON_BLOCKING

## CF-I-02 — Campaign activity not observable
- **ID:** CF-I-02 · **Observed at:** dynamics diagnostics (ZOMBIE unresolved)
- **Evidence:** the Campaign↔RuntimeScope association exists (CF-H-08) but campaign *activity* counts are not exposed to dynamics.
- **Category:** OTHER · **Why not in G10-I:** no activity port was required for the frozen invariants.
- **Semantic impact:** zombie/dissolution diagnosis stays `unresolved` ("dormant ≠ dead").
- **Recommended next stage:** G10-J. · **Blocking status:** NEXT_STAGE_REQUIRED

## CF-I-03 — Participation↔RuntimeScope is derived co-occurrence only
- **ID:** CF-I-03 · **Observed at:** `CollaborationMetrics.participationRuntimeCooccurrence`
- **Evidence:** the join is derived from shared `ActivationRef`; no canonical relation is stored.
- **Category:** FEDERATION · **Why not in G10-I:** §12 permits the derived join and warns co-occurrence ≠ relation.
- **Semantic impact:** no canonical Participation→RuntimeScope relation exists. · **Blocking status:** NON_BLOCKING

## CF-I-04 — Interface semantic sufficiency requires telemetry
- **ID:** CF-I-04 · **Observed at:** `InterfaceCompressibilityAssessment.semanticSufficiency`
- **Evidence:** no information-theoretic telemetry exists; reported `"requires_evidence"`.
- **Category:** ORGANIZATION_DYNAMICS · **Blocking status:** STILL_DEFERRED_WITH_CONCRETE_TRIGGER (real telemetry).

## CF-I-05 — Activation liveness still unknown
- **ID:** CF-I-05 · **Observed at:** runtime metrics
- **Evidence:** no host activation observer; recorded membership is not liveness.
- **Category:** HOST_INTEGRATION · **Blocking status:** NON_BLOCKING (an optional host observation port would close it).

## CF-I-06 — Proposals have no durable identity
- **ID:** CF-I-06 · **Observed at:** `proposalDigestOf`
- **Evidence:** proposals are digest-identified only; no ProposalId store.
- **Category:** OTHER · **Blocking status:** NON_BLOCKING (G10-J may add proposal continuity if required).

## CF-I-07 — No UI
- **ID:** CF-I-07 · **Observed at:** `src/canvas/**` (untouched) · **Category:** UI · **Blocking status:** NON_BLOCKING

## CF-I-08 — Proposal→Transformation/Governance mapping is future work
- **ID:** CF-I-08 · **Observed at:** `ProposalImpactReport.mapsToExistingTransformation`
- **Evidence:** REVISE/SPLIT/MERGE map to existing F3 primitives; FORMALIZE/ENCAPSULATE/COLLAPSE/DISSOLVE are `unsupported`.
- **Category:** ORGANIZATION_DYNAMICS · **Blocking status:** NEXT_STAGE_REQUIRED (this is G10-J).

---

## Priority summary
```text
P0 — next-stage mandatory: none (no BLOCKER_IN_I remains)
P1 — important: CF-I-02, CF-I-08
P2 — deferred / evidence-triggered: CF-I-01, CF-I-03, CF-I-04, CF-I-05, CF-I-06, CF-I-07
```
