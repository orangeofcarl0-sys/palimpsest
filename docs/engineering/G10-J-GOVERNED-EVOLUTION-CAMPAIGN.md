# G10-J — Governed Dynamic Evolution Campaign

**Make structural evolution executable without making structural proposals sovereign.**

Baseline: `main @ b30b01129aa6e019278344b32450e9cf5a8946d4`. Frozen: UAS-1, BIND-1, AGT-0,
PAG-0, G10-H, G10-I, G10-F3, G10-F4/F5.

```text
Proposal ≠ Candidate ≠ Assessment ≠ Authority ≠ Governance ≠ Activation ≠ Success
```

## 1. J0 decisions
[Assessment](audits/G10-J-GOVERNED-EVOLUTION-ASSESSMENT.md): F3 activation has **no authority
gate**, so J places an evolution-specific admission seam in front of it; executable kinds are
REVISE/SPLIT/MERGE; FORMALIZE and the RuntimeScope kinds are explicitly deferred; a derived-
identity evolution case store is required for continuity; institution governance is routed
through one explicitly wired institution.

## 2. I carry-forward disposition
[Disposition](audits/G10-J-I-CARRY-FORWARD-DISPOSITION.md): CF-I-02 and CF-I-08 are
`CLOSED_IN_J`; CF-I-06 closed via derived case identity; the rest carry concrete triggers.

## 3. Executable kind matrix
| Dynamics kind | Disposition |
|---|---|
| NO_CHANGE / RETAIN_FEDERATION | TERMINAL_NON_MUTATING |
| REVISE / SPLIT / MERGE | EXECUTABLE_IN_J → F3 |
| FORMALIZE / ENCAPSULATE / COLLAPSE / DISSOLVE | DEFERRED_UNSUPPORTED (explicit) |

## 4. Campaign activity observation (CF-I-02)
Read-only `CampaignActivityObservation` port (existence, lifecycle, basis, event/commitment/
watch counts, in-flight wake) with `known|unknown|error`; wired from the CampaignStore. Counts
are mechanical facts — never value, health, or dissolution authority; `dormant ≠ dead`.

## 5. Candidate / compiler contract
Untrusted host-injected compiler produces a complete F3-typed
`CompleteEvolutionCandidate`; strict parser (unknown fields, malformed refs/definitions,
digest mismatch fail closed); bound to the exact proposal digest + basis.

## 6. Freshness
Shared G10-I proposal freshness + `candidateFresh` (source refs must equal current heads).
Checked before compile and before every irreversible write; stale ⇒ zero canonical writes.

## 7. F3 reuse & proof obligations
`evaluateOrganizationTransformation` is called unchanged; blocked assessments never activate.
J duplicates no split/merge/boundary/norm/role logic. Evidence obligations use the existing
`TransformationEvidencePort`; Dynamics diagnostic evidence is never treated as verification.

## 8. Authority model
Independent `OrganizationEvolutionAdmissionPort` with `authorized|denied|unresolved`; the
caller cannot pass an outcome. Distinct from continuation, effect, truth, norm, and focus.

## 9. Institution governance routing
One wired institution; current-body match selects the F5 path. The organization candidate
revision is activated first; the institution keeps the old body until approvals + `advance`
produce a new epoch. Split adopts one body (no institution fork); merge never merges
institutions.

## 10. Evolution case continuity
`SqliteOrganizationEvolutionStore` — append-only, chain digest, idempotent retry, atomic
batches, restart-safe; derived `caseRef`; event-derived state machine. Owns only evolution
history.

## 11. Crash / retry semantics
Idempotent re-entry short-circuits resolved cases; activation reuses `registerRevisions`
(byte-identical re-registration is a no-op) so a retry never duplicates a revision; governance
resume checks the institution epoch before recording activation.

## 12. Terminal & unsupported outcomes
NO_CHANGE / RETAIN_FEDERATION resolve with zero canonical writes; unsupported kinds are explicit
and never mutate by fallback.

## 13. Post-change observation
Before/after snapshot digests recorded; activation remains successful even if post-observation
fails (no rollback).

## 14. Truth ownership & authority matrix
Evolution store owns evolution history only. Organization / Institution / RuntimeScope /
Dynamics truth stay in their own stores. Structural evolution authority, institution
continuation authority, Ordarium effect authority, epistemic truth, and org norm permission are
all distinct and never auto-mapped.

## 15. Golden E2E
Standalone REVISE (proposal → candidate → F3 admissible → authority → activation →
post-observation, source immutable, retry idempotent); institution-governed REVISE (awaiting
governance → approvals → new epoch adopts successor, institutionId unchanged); stable federation
(RETAIN_FEDERATION terminal, zero writes); blocked assessment (authority cannot override);
denied authority (zero writes).

## 16. Adversarial proofs
Kind mismatch, wrong source, unknown compiler fields, candidate conflict, stale proposal,
blocked-override, denied-zero-write, institution non-fork/non-merge, terminal/unsupported zero
writes, and the zero-mutation firewalls (Dynamics stays mutation-free; the root export stays
free of the evolution surface).

## 17. Test / CI matrix
114 files / 981 tests; `build`; `build:web`; e2e 21/21. Details in the
[delivery record](audits/G10-J-GOVERNED-EVOLUTION-DELIVERY.md).

## 18. Carry-forward
[`audits/G10-J-CARRY-FORWARD.md`](audits/G10-J-CARRY-FORWARD.md).

## 19. Canonical gate record
Remote CI run `34779225213` (attempt 1) SUCCESS on the exact merged HEAD `54998f5`; PR `#60` -> `ff3c42a`; canonical main: 114 files / 981 tests, build, build:web pass; local e2e 20/21 with the documented `E2E-DEBUG-01` flake (remote e2e green).

## 20. Recommended next stage
Per the real carry-forward, the strongest candidates are Boundary Memory / LivingSpec (long-
lived peer shared boundary state) or Runtime Structural Evolution (the deferred
ENCAPSULATE/COLLAPSE/DISSOLVE kinds). Not started.

---

```text
G10-J GOVERNED DYNAMIC EVOLUTION: PASS
```
