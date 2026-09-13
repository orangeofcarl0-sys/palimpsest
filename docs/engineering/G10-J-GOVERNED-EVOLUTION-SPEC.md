# G10-J — Governed Dynamic Evolution Spec (frozen)

Baseline `main @ b30b011`. Reuses G10-F3 (transformation) and G10-F4/F5 (institution governance)
unchanged; adds one governed bridge and one derived-identity evolution history.

```text
FreshProposal → CompleteCandidate → F3Assessment → EvolutionAuthority → (Governance) → Activation → PostObservation
Proposal ≠ Candidate ≠ Assessment ≠ Authority ≠ Governance ≠ Activation ≠ Success
```

## 1. Candidate

`CompleteEvolutionCandidate { schemaVersion:1, proposalDigest, proposalBasisDigest, kind,
transformation: OrganizationTransformationProposal, compilerProvenance, digest }`
(digest domain `palimpsest.organization-evolution-candidate.v1`). Strictly parsed: unknown
fields, malformed refs/definitions, and digest mismatch all fail closed. The candidate carries
the EXISTING F3 vocabulary — no second transformation language.

## 2. Compiler seam

`OrganizationEvolutionCompilerPort.compile({proposal, impact, sources, capabilities})` is
host-injected and **untrusted**: no store, no authority, no governance, no activation, no
effects. Output is `unknown` and must be a complete candidate.

## 3. Freshness

Proposal freshness reuses G10-I's shared evaluator. `candidateFresh` additionally requires every
candidate source ref to still equal the current organization head. Both are checked before any
irreversible write; a stale proposal or candidate produces zero canonical writes.

## 4. Authority

`OrganizationEvolutionAdmissionPort.admit({proposalDigest, candidateDigest, assessmentDigest,
sourceOrganizations, kind, governance, impact})` → `authorized | denied | unresolved`. The
caller cannot supply an outcome. Evolution authority ≠ continuation authority ≠ effect
authority ≠ truth verification ≠ norm permission ≠ user focus.

## 5. Governance routing

If a wired institution's current epoch body has the same `organizationDefinitionId` as the
proposal subject, the change is institution-governed and uses F5:
`activateOrganizationTransformation` (org candidate revision) then
`activateAndGovernOrganizationChange` → `proposeTransition`; the institution still points at the
old body until current-charter approvals and `advance` produce a new `InstitutionEpoch`. Split
produces multiple organizations but the institution adopts one body and never forks; merge never
merges institutions. J supports one explicitly wired institution (multi-institution adoption is
carry-forward).

## 6. Activation

Standalone: `activateOrganizationTransformation(organizationStore, assessment)` — the existing
F3 canonical mutation path. Blocked assessments (`status:"blocked"`) never reach it; approval
cannot override unresolved obligations.

## 7. Evolution case

`OrganizationEvolutionStore` (append-only, chain digest, idempotent, restart-safe) owns ONLY
evolution governance/execution history. Case identity is derived:
`caseRef = ec-<digest(proposalDigest, candidateDigest)>`. Events: `CASE_OPENED`,
`CANDIDATE_COMPILED`, `ASSESSED`, `BLOCKED`, `AUTHORIZED`, `DENIED`, `AUTHORITY_UNRESOLVED`,
`GOVERNANCE_REQUIRED`, `ACTIVATED`, `POST_OBSERVED`, `TERMINAL_RESOLVED`, `CLOSED`. State is
derived from events. Same proposal + different candidate → `candidate_conflict`.

## 8. Terminal outcomes

`NO_CHANGE` and `RETAIN_FEDERATION` are first-class terminal non-mutating resolutions: zero
Organization/Institution/RuntimeScope writes.

## 9. Unsupported kinds

`FORMALIZE_ORGANIZATION`, `ENCAPSULATE_RUNTIME_SCOPE`, `COLLAPSE_RUNTIME_STRUCTURE`,
`DISSOLVE_OR_RETIRE_CANDIDATE` → explicit `unsupported_evolution_kind`; never a fallback
mutation, and never silently `NO_CHANGE`.

## 10. Post-change observation

After activation the service re-observes via G10-I and records before/after snapshot digests.
`activation ≠ beneficial`; post-observation failure leaves the successful canonical activation
intact (no rollback).

## 11. Surface

Advanced-only; independent module `src/organization_evolution/`; never inside
`ProjectController`. `installed.organizationEvolution?` present iff dynamics + evolution
store + compiler + authority + organization store are wired, else absent (never stubbed).

## 12. Invariants (GE-A01…A40)

See the campaign umbrella §"Invariants"; the machine proofs cover the candidate/assessment/
authority/governance/activation separation, freshness gating, zero-mutation firewall,
terminal/unsupported outcomes, institution non-fork/non-merge, crash idempotency, and
post-observation non-rollback.
