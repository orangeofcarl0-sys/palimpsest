# G10-N Collaborative Reasoning Cells & Epistemic Admission — Delivery

Baseline: `main @ c08f960`. Verdict: **PASS** (see the final campaign report).

## What shipped

New advanced-only module `src/reasoning_cell/`:

| File | Responsibility |
|---|---|
| `ref.ts` | cell/branch/claim refs, policy refs, `ReasoningFrontierBasis`, strict helpers |
| `claims.ts` | claim-type refs + registry, builtin `statement`/`dead-end`, claim + content-addressed identity |
| `artifacts.ts` | cell definition, branch, frozen brief, candidate, verification result, admission decision, invalidation artifacts, events/parsers, chain digest |
| `store.ts` | `SqliteReasoningCellStore` — per-cell append-only chained history, CAS `appendAtomic`, malformed-history fail-closed |
| `service.ts` | the pipeline: cell/branch lifecycle, submission, verify→admit, invalidation, derived frontier/DAG/views |
| `index.ts` | advanced barrel |

Integration: `install.ts` (`reasoningCellStore`/`reasoningClaimTypes`/`reasoningVerificationPolicy`/
`reasoningAdmissionPolicy` → `installed.reasoningCells`, present only with store + BOTH seams);
`advanced.ts` export.

## Machine invariants

| Invariant | Proof |
|---|---|
| RC-A01…A08 cell ≠ Organization/BoundaryWorkspace/Campaign/RuntimeScope; branch ≠ durable agent/PersistentPoint/PeerRef; carrier attribution ≠ identity | separate identity/namespace + source firewall + attribution test |
| RC-A09/A25 private reasoning ≠ canonical state; no CoT persistence | schemas contain no CoT/scratchpad field; source firewall |
| RC-A10/A11/A12 candidate/accepted claim ≠ Evidence/Truth | no Evidence store touched; naming uses `admitted`/`accepted-by-policy` |
| RC-A13/A14 verification ≠ admission; epistemic ≠ effect admission | two distinct ports; SUPPORTED+REJECT test; firewalls |
| RC-A15 unresolved is legitimate | UNRESOLVED leaves frontier unchanged and is re-evaluable |
| RC-A16 claim content strictly validated | unknown type / malformed payload fail closed |
| RC-A17/A18 claim digest independent of branch; candidate digest includes provenance | same claim from 3 branches → same claimDigest, different candidateDigest |
| RC-A19 duplicate semantic claim admitted at most once | dedupe at submission AND evaluation; one accepted claim |
| RC-A20/A21 dependencies reference active admitted claims; acyclic DAG | pending/invalidated dependency fails closed; dependencies point at existing claims |
| RC-A22 frontier is derived, no duplicate graph store | `frontier`/`claimGraph` derived from the chain |
| RC-A23/A24 brief exposes accepted frontier only; pending invisible to siblings | frozen brief field set + blind-until-commit test |
| RC-A26/A27/A28 verification/admission basis-bound; stale writes zero | binding checks + re-read freshness + stale-evaluation zero-write test |
| RC-A29/A30/A31 ADMIT atomic; REJECT/UNRESOLVED unchanged | single `appendAtomic` batch; frontier unchanged tests |
| RC-A32/A33/A34 invalidation policy-governed; cascade deterministic; history ≠ frontier | invalidation pipeline + `inactiveClaimIds` closure + graph retains inactive nodes |
| RC-A35…A38 no Commitment/Effect/BoundaryMemory/Organization mutation; closure ≠ Campaign termination | source firewall + no foreign store in deps |
| RC-A39 all M items disposed | `G10-N-M-CARRY-FORWARD-DISPOSITION.md` |
| RC-A40 canonical regression green | 123 files / 1069 tests, build, build:web |

## Negative suite (N-N01…N-N35)

Covered as runtime or structural proofs: N-N01/N02 (branch cannot become PersistentPoint/PeerRef),
N-N03/N04 (candidate/accepted claim ≠ Evidence — no Evidence store; firewall), N-N05 (a WorkerReport
cannot be admitted directly — admission requires the typed claim/candidate path), N-N06/N-N07
(dependency rules), N-N08/N-N09 (type/content fail closed), N-N10/N-N11 (digest mismatch — strict
parsers recompute), N-N12/N-N13 (a policy result bound to a different frontier is rejected),
N-N14 (SUPPORTED + REJECT → not admitted), N-N15 (UNRESOLVED is not failure), N-N16 (operational error
never becomes INCONCLUSIVE), N-N17/N-N18 (frontier change stales evaluation with zero writes),
N-N19/N-N20 (dedupe; CAS append), N-N21/N-N22 (brief blind + no CoT field), N-N23/N-N24 (invalidation
policy path + deterministic cascade), N-N25 (history never deleted), N-N26 (closure blocks new work),
N-N27…N-N30 (no effect/commitment/BoundaryMemory/Organization mutation — firewalls),
N-N31 (attribution ≠ identity), N-N32/N-N33 (no auto RuntimeScope/Peer), N-N34 (restart),
N-N35 (corrupted history fails closed).

## Honest deviations

- **N1–N10** ship as one implementation PR plus a docs-only closure PR.
- **No Campaign/Evidence publication bridge** is implemented (CF-N-06); accepted claims remain
  cell-local.
- **No invalidation reactivation** in v1 (one-way inactive) — per spec §48.
- **No `ReasoningBranchExecutionPort`** host seam is implemented (CF-N-07): the kernel freezes the
  structured-candidate contract, and a host may drive branches however it likes.
- **Branch briefs are frozen** (no dynamic refresh) — the N0 default.
- **Cell admission is cell-local**: a claim's `claimId` is cell-scoped, so the same semantic claim in
  two cells is two identities (each cell owns its own frontier).
