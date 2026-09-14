# G10-N — Collaborative Reasoning Cells & Epistemic Admission (Spec)

Baseline: `main @ c08f960`. Status: implemented; see
`docs/engineering/audits/G10-N-COLLABORATIVE-REASONING-DELIVERY.md`.

## Mission

> Make collaborative reasoning composable without turning branches into fake durable agents or
> policy-admitted claims into truth.

```text
Persistent Accepted State + Independent Local Search + Composable Candidate Contributions
+ Explicit Verification + Explicit Epistemic Admission
```

Core principle: parallel local cognition becomes valuable only when its outputs can be independently
admitted into a shared composable state.

## Firewalls

```text
ReasoningCell ≠ Organization/BoundaryWorkspace/Campaign/RuntimeScope/PersistentPoint/PeerRef
ReasoningBranch ≠ AgentDefinition ≠ PersistentPoint ≠ PeerRef ≠ durable labor point
branch carrier attribution ≠ branch identity      branch internal reasoning ≠ canonical cell state
Branch report ≠ Evidence      CandidateClaim ≠ AcceptedClaim ≠ Truth ≠ Evidence
AcceptedClaim ≠ BoundaryAcceptance ≠ Commitment
VerificationResult ≠ AdmissionDecision ≠ Truth      EpistemicAdmission ≠ EffectAdmission
Accepted frontier ≠ universal KnowledgeGraph     Claim DAG ≠ WorkGraph/OrganizationGraph/Boundary graph
UserFocus ≠ EpistemicAuthority   MainAgent ≠ EpistemicAuthority   more branches ≠ better answer
```

**No chain-of-thought persistence**: canonical state holds branch metadata, structured candidate
claims, verification results, admission decisions, admitted claims, and invalidation history only.
The strict schemas contain no `chainOfThought`/`scratchpad`/`privateReasoning` fields.

## Identity

- `ReasoningCellId` — genuine new identity (spans branches, carrier replacement, restart).
- `ReasoningBranchRef` — cell-local ephemeral search identity; optional `ActivationRef` attribution
  is provenance only.
- `ReasoningClaimRef = { cellId, claimId }`; `claimId` is the cell-scoped content address of
  `claimDigest`.
- `ReasoningFrontierBasis { cellId, frontierRevision, frontierDigest }` ≠ `ReasoningStoreBasis`.

## Claims

`ReasoningClaimTypeRef { typeId, version }` + a host-injected `ReasoningClaimTypeRegistry`
(builtin `reasoning.statement.v1`, `reasoning.dead-end.v1`; unknown type fails closed). A claim is
`{ type, content, dependencies[claimRef], claimDigest }` where

```text
claimDigest = digest(type + canonical content + canonical dependency claim ids)
```

excluding branch identity, support evidence, and verification — so two branches proposing the same
semantic claim converge on one identity. Dependencies may reference only currently ACTIVE admitted
claims; a rejected/pending/invalidated claim is never a dependency.

## Branches and blind-until-commit

`openBranch` freezes a `ReasoningBranchBrief` (objective, question, exact frontier basis, accepted
claim refs at that moment). The brief exposes the ACCEPTED FRONTIER ONLY — no pending sibling
candidates, sibling branches, verification queue, or private reasoning. `ReasoningCellView` (admin)
exposes pending candidate metadata and branch statuses but never private reasoning.

## Candidates

`ReasoningCandidate { cell, branch, branchFrontierBasis, claim, externalEvidenceRefs, candidateDigest }`;
the candidate digest covers claim + branch provenance + frontier provenance + support refs, so the same
claim from different branches yields different candidates. `externalEvidenceRefs` are opaque ids —
never evidence bodies. Submission never admits.

## Verification and admission

Two distinct ports, invoked only by the service:

```text
Candidate → ReasoningVerificationPolicyPort.verify → VerificationResult
          → ReasoningEpistemicAdmissionPolicyPort.admit → AdmissionDecision
```

`VerificationResult` binds candidate digest, exact current `FrontierBasis`, policy ref, standing
(`SUPPORTED|CONTRADICTED|INCONCLUSIVE`), supporting/contradicting evidence ids, provenance, digest.
`AdmissionDecision` binds candidate digest, verification digest, exact frontier basis, policy ref,
decision (`ADMIT|REJECT|UNRESOLVED`), provenance, digest. A caller cannot pass `admit: true`.

Freshness: the frontier is re-read after verification and again before the commit; any movement →
`stale_evaluation` with ZERO frontier writes (no hidden re-verify). `ADMIT` records
verification + decision + admitted claim as ONE atomic batch. `REJECT` and `UNRESOLVED` leave the
frontier unchanged; `UNRESOLVED` is first-class and re-evaluable. Verification operational errors are
never stored as `INCONCLUSIVE`.

## Frontier, DAG, invalidation

The accepted frontier is DERIVED: admitted claims minus the dependency cascade of root invalidations.
`claimGraph` exposes nodes/edges without a second canonical graph store. Invalidation is
policy-governed (`verifyInvalidation` → `admitInvalidation`, decisions
`INVALIDATE|KEEP|UNRESOLVED`); a canonical root invalidation plus the DAG deterministically derives the
cascade. Historical admission is never deleted: `AdmittedHistory ≠ CurrentActiveFrontier`.
Reactivation is not implemented in v1.

## Surface

`installed.reasoningCells` is present iff a canonical store plus BOTH policy seams are supplied
(never stubbed). Reasoning cells are exported from `advanced` only and never added to
`ProjectController`.
