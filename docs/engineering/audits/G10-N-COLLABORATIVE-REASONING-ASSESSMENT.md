# G10-N Collaborative Reasoning Cells & Epistemic Admission — N0 Assessment

Baseline audited: `orangeofcarl0-sys/palimpsest` `main @ c08f960`.
Read: `UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1.md`, `G10-G-CAMPAIGN-EPISTEMIC-WAKE-CAMPAIGN.md`,
`G10-GC3-UNIFIED-NEXT-ACTION-ADMISSION-CLOSURE.md`, `G10-M-CARRY-FORWARD.md`, and
`src/{campaign,runtime_scope,coordination,federation,boundary_memory}/**`, `src/install.ts`, `src/advanced.ts`.

## N0-Q1 — Does Palimpsest own an Evidence store? **NO**

`src/campaign/epistemic.ts` reaches the authoritative Evidence plane only through the read-only
`CampaignEvidencePort.inspectClaim(claim)` → `EvidenceKnowledge<ClaimStandingSnapshot>`. There is
**no canonical Evidence implementation** in this repository; the plane is host-supplied. Therefore a
ReasoningCell accepted claim is **cell-local admitted epistemic state only**: it is not Evidence, and
the reasoning-cell store is never re-labelled as a global Evidence store. Bridge disposition (§60/§85):
**no automatic bridge**; an explicit publication seam is carried forward (CF-N-06).

The canonical claim-standing vocabulary (`SUPPORTED | PARTIALLY_SUPPORTED | CONTRADICTED |
INCONCLUSIVE | STALE`) is reused in spirit; `ReasoningVerificationResult.standing` uses the three
outcomes the pipeline acts on (`SUPPORTED | CONTRADICTED | INCONCLUSIVE`).

## N0-Q2 — Cell accepted-state truth ownership: **YES, a canonical store**

Accepted frontier state needs stable cell identity, branch/candidate history, verification/admission
history, accepted-claim lineage, restart, concurrency, and invalidation. A new
`SqliteReasoningCellStore` owns **only** reasoning-cell semantic history
(`$DSH_HOME/palimpsest/reasoning_cells.sqlite`), chained per cell. It owns no Evidence body, no
Campaign belief, no BoundaryMemory, no Work, no RuntimeScope, no Organization, no effect.

## N0-Q3 — Genuine `ReasoningCellId`

Introduced: a cell spans many branches, survives branch carrier replacement and restart, and is not
any RuntimeScope/Peer/Campaign/BoundaryWorkspace/Organization/PersistentPoint identity.

## N0-Q4 — Branch identity

`ReasoningBranchRef` is an ephemeral, cell-local search/provenance locus. An `ActivationRef` may be
recorded as **carrier attribution** only; `branchRef ≠ activationRef`, and branch identity is never
derived from an activation.

## N0-Q5 — Cell definition

`ReasoningCellDefinition { cellId, objective, verificationPolicyRef, admissionPolicyRef }` — no
manager agent, worker count, or planner/reviewer role fields.

## Verification / admission boundary (the central invariant)

Two DISTINCT seams, both invoked only by the service (a caller can never supply a result or decision):
`ReasoningVerificationPolicyPort.verify(...)` → `ReasoningVerificationResult`, then
`ReasoningEpistemicAdmissionPolicyPort.admit(...)` → `ReasoningAdmissionDecision`. A `SUPPORTED`
verification never auto-admits; a policy may `REJECT` it. Both artifacts bind the exact current
`FrontierBasis`; the service re-reads the frontier before the atomic commit and writes **zero**
frontier mutation when it moved (`stale_evaluation`). Operational errors (timeout/tool/transport) are
never recorded as an epistemic `INCONCLUSIVE`.

## Frontier vs store basis

`ReasoningStoreBasis` (full append-only cell history) is strictly distinct from
`ReasoningFrontierBasis { cellId, frontierRevision, frontierDigest }` (the accepted ACTIVE epistemic
state). Candidate submission and branch opening change only the store basis; they never semantically
invalidate a branch frontier.

## Blind-until-commit

`ReasoningBranchBrief` is FROZEN at branch open and contains only the accepted frontier at that
moment (objective, question, frontier basis, accepted claim refs). It structurally cannot carry
pending sibling candidates, sibling branches, a verification queue, or private reasoning. An
admin-only `ReasoningCellView` exposes pending candidate metadata and branch statuses.

## Invalidation

Policy-governed: request → `verifyInvalidation` → `admitInvalidation` (decisions `INVALIDATE | KEEP |
UNRESOLVED`). A canonical root invalidation plus the accepted dependency DAG deterministically derives
the cascade: any claim transitively depending on an invalidated claim leaves the ACTIVE frontier while
remaining in the admitted history. One-way in v1 (no reactivation).

## M carry-forward disposition

CF-M-01…09 are re-adjudicated in `G10-N-M-CARRY-FORWARD-DISPOSITION.md`; the P1 items (boundary
workspace retirement, one-way organization retirement) remain evidence-triggered and have **no hard
dependency** on collaborative reasoning.

## Frozen-contract impact

Additive only: a new advanced-only `src/reasoning_cell/` module and an optional
`installed.reasoningCells` surface. No UAS-2; no existing semantics rewritten.
