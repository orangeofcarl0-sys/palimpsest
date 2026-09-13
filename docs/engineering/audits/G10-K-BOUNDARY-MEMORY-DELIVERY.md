# G10-K — Collaborative Boundary Memory & LivingSpec: Delivery

Baseline: `main @ 67b29c9`. Verdict: **PASS** (see the final campaign report).

## What shipped

New advanced-only module `src/boundary_memory/`:

| File | Responsibility |
|---|---|
| `ref.ts` | Boundary identities/refs, typed content refs, artifact type ref, canonical digest helpers |
| `artifacts.ts` | Workspace/artifact/candidate/accepted-revision artifacts, event parsers, chain digest, extensible type registry + builtin types, `OrganizationBlueprintContent` |
| `store.ts` | `SqliteBoundaryMemoryStore` — append-only per-workspace chain, CAS `appendAtomic`, replay, corrupt-history fail-closed |
| `service.ts` | `makeBoundaryMemoryService` — explicit acceptance/rejection, branching, views, change observation, accepted-blueprint read, commitment-scope verification |
| `index.ts` | Advanced barrel |

Additive integration:
- `federation/commitment.ts`: `CommitmentScope` variant `boundary_revision` + strict parser; `CommitmentError` kind `unverified_scope`.
- `federation/commitment_service.ts`: `CommitmentScopeGuard` (fail closed when absent).
- `federation/coalition.ts`: boundary-scoped commitments have no coalition scope (throws / skipped); `commitmentScopeKey` covers the variant.
- `federation/workforce.ts`: boundary-scoped commitments are never coalition members.
- `organization_evolution/formalization.ts` (new): `CompleteFormalizationCandidate`, `OrganizationFormalizationCompilerPort`, `OrganizationFormalizationBoundaryPort`.
- `organization_evolution/artifacts.ts`: `EvolutionTargetKind += "FORMALIZE"`, `EXECUTABLE_FORMALIZE` disposition, `EVOLUTION_FORMALIZATION_COMPILED` event, `EVOLUTION_ASSESSED.kind += FORMALIZE`.
- `organization_evolution/service.ts`: `driveFormalization` — authority-gated genesis.
- `install.ts`: `boundaryMemoryStore`, `boundaryArtifactTypes`, `organizationFormalizationCompiler`; `installed.boundaryMemory`; commitment `scopeGuard`; evolution `formalization` wiring.
- `advanced.ts`: exports `boundary_memory`.

## Machine invariants

| Invariant | Proof |
|---|---|
| BM-A01/A02 Conversation/Thread ≠ BoundaryMemory | workspace opened explicitly; no Thread/Message input exists (`k_boundary_memory` "explicit, never derived") |
| BM-A03/A23 Candidate ≠ AcceptedRevision; stable exact ref | `materializeAcceptedBoundaryRevisionRef`; head only advances on `REVISION_ACCEPTED` |
| BM-A04/A05/A06/A07 Acceptance ≠ Commitment/Evidence/Truth/Authority | acceptance path writes only boundary events; no evidence/commitment/authority port reachable; firewall test |
| BM-A08/A09 Workspace ≠ Organization; participant ≠ member | boundary memory imports no organization store; firewall test |
| BM-A10 author ≠ unilateral acceptor | `requiredAcceptors` must include a non-author (parse + service) |
| BM-A11 remote acceptance authenticated | `unauthenticated_acceptance` (K-N08) |
| BM-A12/A13 explicit acceptors; head on complete acceptance | K-N16 (one acceptance insufficient) |
| BM-A14/A15/A16 exact base; branch never LWW; stale cannot advance | branching test (K-N10/N11) |
| BM-A17 rejected/superseded history immutable | rejection + two-revision history test (K-N17) |
| BM-A18 replay deterministically reconstructs state | restart test; corrupt-history fails closed (K-N35) |
| BM-A19/A20 no duplicate truth with Coordination/Organization | store owns only boundary state; firewall test |
| BM-A21/A22 content strictly validated; extensible without `any` | K-N19/N20; custom-registry test |
| BM-A24/A25 commitment binds exact accepted revision; lifecycle independent | K-N23 |
| BM-A26 rich federation may remain federation | K-N25 |
| BM-A27/A28 Blueprint ≠ OrganizationDefinition; zero org writes | blueprint test; K-N25 |
| BM-A29/A30/A31 FORMALIZE needs fresh proposal, complete candidate, J authority | K-N27/N28/N26 |
| BM-A32/A33 never auto-creates Institution/RuntimeScope | K-N30/N31 |
| BM-A34/A35/A36/A37 no WorkGraph/Scheduler/Ordarium-effect/global-manager | boundary memory touches none; firewall test |
| BM-A38 fixed-participant limitation explicit | v1 fixed participants; no add/remove API |
| BM-A39 all J carry-forward items disposed | `G10-K-J-CARRY-FORWARD-DISPOSITION.md` |
| BM-A40 canonical main regression suite green | 117 files / 1010 tests, build, build:web |

Wording discipline: content references and acceptance are provenance/linkage, never authority;
`interfaceId`/`operationId`/`tag`/`statement` are descriptive only, with no hidden execution semantics.

## Negative suite (K-N01…K-N35)

Implemented and machine-checked: K-N01, N02, N03 (no ack→accept path exists), N04, N05, N06/N07
(no evidence/organization port), N08, N09, N10, N11, N12, N13, N14, N15, N16, N17, N18, N19, N20,
N21 (references grant nothing), N22, N23, N24, N25, N26, N27, N28, N29, N30, N31, N32, N33
(only required acceptors decide; no focus/agent authority surface), N34, N35.

K-N03 ("message ack does not accept a candidate") is structural: no message/ack path can reach
`acceptRevision` (the only entries are explicit authenticated peer/local peer), and the boundary
service imports no messaging module (firewall test).

## Canonical gate

- Final branch HEAD `26f56c8` → PR **#62** → canonical `main` merge **`7fafe3c`**
  (`git diff 26f56c8 7fafe3c` is empty — the tested tree IS the merged tree).
- PR CI run `34786607850` (unit + e2e): **SUCCESS on attempt 1**.
- Canonical main push CI run `34786679811` (unit + e2e): **SUCCESS on attempt 1**.
- Local canonical gate: `pnpm test` 117 files / 1010 tests; `build` + `build:web` green;
  local e2e 19/21, the two failures being the documented pre-existing flakes
  `E2E-DEBUG-01` / `E2E-RUNTIME-03` (verified genuine flakiness: identical code passes
  and fails across runs, and both pass in isolation).

## Honest deviations

- **J1–J9 / K1–K9** are one implementation PR (plus this docs/closure PR), not one PR per stage.
- **CF-K-01**: no first-class `boundary_workspace` Dynamics subject; FORMALIZE uses a prospective
  organization subject (documented in the assessment).
- **Institution governance for formalization genesis** is not implemented (CF-K-10); formalization is
  `standalone`.
- **Remote transport** for candidate/acceptance artifacts is not implemented (shared-store
  multi-instance only) — CF-K-03.
- One G10-J source-firewall assertion was updated: `organization_evolution/service.ts` now contains a
  `registerRevision` call, which is the sanctioned additive FORMALIZE genesis path (there is no F3
  transformation for genesis). The guard now asserts the genesis write is reachable only after the
  independent authority seam denies/authorizes. This is a regulation of a stage-era test guard, not an
  edit to a frozen contract.
