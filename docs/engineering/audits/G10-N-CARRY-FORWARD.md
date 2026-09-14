# G10-N CARRY-FORWARD Register

Mandatory input for the next stage. No `BLOCKER_IN_N` remains.

```text
P1 — important: CF-N-01, CF-N-02
P2 — deferred / evidence-triggered: CF-N-03 … CF-N-09
```

## CF-N-01 — No ReasoningCell ↔ Campaign/Evidence publication bridge
- **ID:** CF-N-01 · **Observed at:** `src/reasoning_cell/service.ts`
- **Evidence:** accepted claims are cell-local admitted epistemic state; nothing is published to the
  Campaign Evidence plane. `CampaignEvidencePort` is a read-only host bridge, and no canonical
  Evidence implementation exists in this repository.
- **Category:** EPISTEMIC · **Concrete trigger:** a Campaign needing to consume a cell's accepted
  claim as Evidence/claim input (would need an explicit `ReasoningClaimPublicationPort`).
- **Blocking:** NON_BLOCKING

## CF-N-02 — No ReasoningCell runtime/Holon packaging
- **ID:** CF-N-02 · **Evidence:** a cell never auto-creates a PeerRef, RuntimeScope, or Holon; a branch
  carries at most an `ActivationRef` attribution.
- **Category:** RUNTIME · **Concrete trigger:** a cell that must present itself externally as a peer
  (explicit RuntimeScope/Holon packaging stage). · **Blocking:** NON_BLOCKING

## CF-N-03 — No branch execution port
- **ID:** CF-N-03 · **Evidence:** the kernel freezes the structured-candidate contract; there is no
  `ReasoningBranchExecutionPort`, so a host drives branch execution entirely outside Palimpsest.
- **Category:** RUNTIME · **Concrete trigger:** a host integration wanting a standard branch-runner
  seam. · **Blocking:** NON_BLOCKING

## CF-N-04 — No invalidation reactivation / un-invalidate
- **ID:** CF-N-04 · **Evidence:** v1 invalidation is one-way inactive; re-proposing the same semantic
  claim converges to DEDUPLICATED (it cannot be re-admitted).
- **Category:** EPISTEMIC · **Concrete trigger:** a need to reactivate a claim after new evidence.
  Current workaround: admit a NEW semantic claim that supersedes it. · **Blocking:** NON_BLOCKING

## CF-N-05 — Claim taxonomy is intentionally small
- **ID:** CF-N-05 · **Evidence:** builtin claim types are `reasoning.statement.v1` and
  `reasoning.dead-end.v1`; the registry is extensible but the taxonomy is not claimed complete.
- **Category:** EPISTEMIC · **Concrete trigger:** a domain needing a structured claim type (proof
  obligation, quantitative bound, citation set). · **Blocking:** NON_BLOCKING

## CF-N-06 — No cross-cell claim composition
- **ID:** CF-N-06 · **Evidence:** `claimId` is cell-scoped; dependencies must reference the same cell.
  Two cells cannot share one accepted frontier.
- **Category:** EPISTEMIC · **Concrete trigger:** a need for hierarchical/ federated cells with a
  shared admitted state (would need explicit cross-cell claim references). · **Blocking:** NON_BLOCKING

## CF-N-07 — Briefs are frozen (no dynamic refresh)
- **ID:** CF-N-07 · **Evidence:** `openBranch` freezes the brief; a branch opened before a claim was
  admitted never sees it (a new branch does).
- **Category:** EPISTEMIC · **Concrete trigger:** a long-running branch needing mid-flight frontier
  refresh semantics. · **Blocking:** NON_BLOCKING

## CF-N-08 — No bounded verification retry / backoff policy
- **ID:** CF-N-08 · **Evidence:** a verification/admission operational error surfaces as
  `verification_error`; retry policy is the caller's.
- **Category:** AVAILABILITY · **Concrete trigger:** a production verification implementation needing a
  bounded retry contract. · **Blocking:** NON_BLOCKING

## CF-N-09 — Frontier-derived metrics not wired into Dynamics
- **ID:** CF-N-09 · **Evidence:** cell frontier/branch metrics are not exposed as an Organization
  Dynamics observation subject.
- **Category:** DYNAMICS · **Concrete trigger:** a cell that must be observed/diagnosed as part of an
  organization's collaborative cognition. · **Blocking:** NON_BLOCKING

---
```text
No BLOCKER_IN_N. Next-stage candidates (from real carry-forward; spec §93):
  Agent-facing Federation / MultiGraph UI · Empirical Organization Evaluation ·
  Multi-Institution Governance · Federated Boundary Operational Resilience (CF-L-01) ·
  ReasoningCell ↔ Campaign/Evidence publication · ReasoningCell runtime/Holon packaging
Note: the semantic core's breadth is now broad; the next stage should weigh
vertical/product closure over further kernel expansion.
```
