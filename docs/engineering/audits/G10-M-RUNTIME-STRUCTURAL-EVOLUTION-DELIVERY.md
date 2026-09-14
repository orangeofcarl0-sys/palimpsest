# G10-M Runtime Structural Evolution & Retirement — Delivery

Baseline: `main @ dd38147`. Verdict: **PASS** (see the final campaign report).

## What shipped

| File | Change |
|---|---|
| `src/runtime_scope/store.ts` | `applyStructuralTransition` (multi-scope, one transaction), `RuntimeScopeCreateRequest`, `organization_retired` kind |
| `src/runtime_scope/service.ts` | retired-organization grounding guard |
| `src/runtime_scope/index.ts` | exports the new transition types |
| `src/runtime_evolution/artifacts.ts` (new) | candidate union + compiler/authority seams + case/event vocabulary + routing matrix |
| `src/runtime_evolution/assessment.ts` (new) | pure deterministic safety assessment + obligations |
| `src/runtime_evolution/store.ts` (new) | `SqliteRuntimeEvolutionStore` (process history only) |
| `src/runtime_evolution/service.ts` (new) | compile → assess → authority → atomic activation → post-observation |
| `src/runtime_evolution/index.ts` (new) | advanced barrel |
| `src/organization/store.ts` | `OrganizationLifecycle`, `organization_retirements`, `lifecycle/retire/retirements`, `retired_lineage` enforcement |
| `src/organization/index.ts` | exports lifecycle/retirement |
| `src/institution/store.ts` | read-only `institutions()` + `currentBodies()`, `organization_retired` kind |
| `src/institution/service.ts` | retired-organization adoption guard (genesis + advance) |
| `src/organization_evolution/artifacts.ts` | `"RETIRE"` target kind, `EXECUTABLE_RETIREMENT` disposition, `EVOLUTION_RETIREMENT_CANDIDATE` event, `EVOLUTION_ASSESSED.kind += RETIRE` |
| `src/organization_evolution/retirement.ts` (new) | retirement candidate, assessment, exhaustive read-only ports |
| `src/organization_evolution/service.ts` | `driveRetirement` |
| `src/organization_dynamics/*` | additive `organizationLifecycle` observation |
| `src/install.ts` | `installed.runtimeEvolution`; retirement wiring; lifecycle into runtime-scope/dynamics/institution ports |
| `src/advanced.ts` | exports `runtime_evolution` |

## Machine invariants

| Invariant | Proof |
|---|---|
| RS-A01/A02/A03 topology evolution ≠ Organization transformation; ENCAPSULATE ≠ SPLIT; COLLAPSE ≠ MERGE | separate candidate vocabulary + foreign-store source firewall |
| RS-A04/A05 close ≠ retirement; retirement ≠ Campaign termination | retirement is `safe detach + close + receipt`; no campaign mutation |
| RS-A06/A07/A08/A09 independent runtime authority | distinct port + distinct input; authority firewall |
| RS-A10/A11/A12/A13 all-or-none, exact-basis, absence-guarded, independent chains | primitive tests (partial → recovery_required; basis_mismatch; event_conflict; distinct chain digests) |
| RS-A14 topology forest single-parent & acyclic | assessment simulation (`forestValid`) |
| RS-A15/A16/A17 exact members; no implicit inheritance; parent Holon digest preserved | ENCAPSULATE golden test |
| RS-A18/A19/A20 collapse refuses external/campaign child; preserves history | COLLAPSE block + golden tests |
| RS-A21/A22 retire requires emptiness; identity/history preserved | RETIRE golden + block tests |
| RS-A23/A24/A25 Proposal ≠ … ≠ Activation; blocked cannot be overridden; stale cannot activate | service ordering + tests |
| RS-A26/A27/A28/A29 no foreign store mutation | source firewall + oracle stores |
| RS-A30…A37 organization retirement append-only, no deletion, no advance/ground/adopt, historical | retirement golden + guard tests |
| RS-A38 boundary_workspace retirement unsupported | disposition matrix test |
| RS-A39 all L items disposed | `G10-M-L-CARRY-FORWARD-DISPOSITION.md` |
| RS-A40 canonical main regression green | 122 files / 1055 tests, build, build:web, e2e 20/21 (documented flake) |

## Negative suite (M-N01…M-N35)

Covered: M-N01/N02 (encapsulate cannot mutate Organization; parent Holon digest preserved),
N03/N04 (missing member / occupied id), N05 (cycle — forest validation), N06 (competing
encapsulations), N07/N08/N09 (collapse external peer/boundary/campaign), N10 (member
collision), N11 (collapse cannot mutate BoundaryMemory — source firewall), N12…N15 (retire with
members/children/representation/campaign), N16 (raw close ≠ retirement case), N17/N18/N19
(authority independence), N20/N21 (stale proposal/source), N22 (same proposal + different
candidate → `candidate_conflict`), N23/N24 (all-or-none / partial fail-closed), N25 (no revision
deleted), N26 (retired lineage cannot advance), N27 (cannot ground new scope), N28 (cannot be
newly adopted), N29 (current institution body cannot retire), N30 (open runtime scope blocks),
N31 (campaign untouched), N32 (historical epoch reference remains readable), N33 (boundary
dissolve has no fallback), N34 (Scheduler untouched — source firewall), N35 (restart).

## Honest deviations

- **M1–M10** ship as one implementation PR plus a docs-only closure PR.
- **CF-M-01**: `boundary_workspace` retirement is explicitly unsupported (workspace close/archive
  already exists; federated governance would be required).
- **Retirement is one-way** in v1 (no reactivation) — per spec §42.
- **Membership basis derivation** from the chain position (L) is unchanged; runtime transitions
  use explicit exact bases.
- **`currentBodies()`** is a new read-only institution enumeration; continuation authority
  semantics are untouched.
- No empirical benefit/success scoring is computed; post-change observation records structural
  digests only (spec §36).
