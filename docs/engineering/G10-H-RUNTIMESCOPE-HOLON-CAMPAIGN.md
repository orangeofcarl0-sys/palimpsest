# G10-H — RuntimeScope & Holon Grounding / Recursive Runtime Organization

Campaign: **Make recursive AI organizations executable.**

Baseline audited: `main @ fc900879c850e14aa6977225790747c314896ce9`.
Frozen baselines (unchanged): `PLMP-UAS-1`, `PLMP-BIND-1`, `PLMP-AGT-0`, `PLMP-PAG-0`.

```text
InternalPlurality → ExternalUnity
```

— never `managerAgentId → workers[]`, and never a collapse of Organization / WorkGraph /
Peer / PersistentPoint / RuntimeScope into one object.

## 1. H0 decisions

See [`audits/G10-H-RUNTIMESCOPE-HOLON-ASSESSMENT.md`](audits/G10-H-RUNTIMESCOPE-HOLON-ASSESSMENT.md):
RuntimeScope is a new, typed runtime-organization identity (never Work/federation/commitment/
effect scope); it requires a new canonical append-only store; Holon needs **no** new durable
identity; Organization↔scope is 0..N with an optional ≤1 recorded basis; nesting is a
single-parent forest.

## 2. Implemented artifacts

| Artifact | Purpose |
|---|---|
| `src/runtime_scope/ref.ts` | leaf identity: `RuntimeScopeRef`, strict parser (no cycle with federation) |
| `src/runtime_scope/artifacts.ts` | members (tagged union), boundary, definition, basis, event parsers, chain + Holon digests |
| `src/runtime_scope/store.ts` | `SqliteRuntimeScopeStore` — per-scope append-only chain, idempotent/conflict/basis discipline |
| `src/runtime_scope/service.ts` | membership, single-parent nesting, lifecycle, organization freshness, `HolonView` |
| `src/federation/peer.ts` | `ContactNeedOrigin.runtime_scope` tightened to typed `RuntimeScopeRef` + `parseContactNeedOrigin` |
| `src/install.ts` | `runtimeScopeStore?` → `installed.runtimeScopes?` / `installed.holons?` |
| `src/advanced.ts` | advanced-only export of the runtime-organization surface |

## 3. Canonical truth ownership

| Concern | Owner | Relation to RuntimeScope |
|---|---|---|
| Work / `scope_id` | Work `EventStore` | none |
| Participation / collaboration / commitment | `CoordinationStore` | none (orthogonal) |
| `PersistentPoint` continuity | `ContinuityStore` | referenced never |
| Organization revisions | `OrganizationStore` | read-only provenance basis |
| Institution epochs | `InstitutionStore` | none |
| **RuntimeScope history** | **`RuntimeScopeStore`** (new, own file) | owns membership/nesting/peer/boundary/lifecycle |

No truth overlap; `H-A23` holds and is asserted at source level.

## 4. Identity matrix

| Ref | ≠ |
|---|---|
| `RuntimeScopeRef` | Work `scope_id`, federation/commitment/coalition scope, effect scope, `PeerRef`, `PersistentPointId`, `ActivationRef`, `OrganizationDefinitionId`, `CampaignId`, Institution/epoch ids |
| `RuntimeScopeMember` | `OrganizationMemberRef` |
| `OrganizationBasisRef` | a runtime mutation |
| `HolonView` | a new canonical identity (it is a derived view) |

## 5. RuntimeScope lifecycle

`OPEN → CLOSED`, derived from canonical events. Distinct from Campaign lifecycle, Activation
lifecycle, and Institution epoch. Closing a scope touches no Campaign/Institution
(`H-A18`, `N10`, `N11`).

## 6. Organization ↔ RuntimeScope relation

Explicit and optional; an Organization never auto-creates a scope (`H-A19`). A scope records
the exact historical `OrganizationBasisRef`; a later organization revision makes the basis
**stale** (`N09`, freshness ∈ {unassociated, current, stale, unknown}).

## 7. Holon external representation

`HolonView = RuntimeScope + explicit PeerRef + boundary + provenance`, with an external
projection digest over ONLY those fields. Internal constituents never appear (`H-A13`).
No peer is inferred from user focus or from the first/oldest member (`H-A11`, `A14`, `N06`, `N07`).

## 8. Boundary semantics

```ts
interface RuntimeScopeBoundary { boundaryId; protocol; sourceInteractionId; exposed }
```

A declared runtime boundary cites its source interaction — distinct from a definition-time
`OrganizationBoundaryPort`. Source-existence verification is carried forward (CF-H-03).

## 9. Recursive / nested proof

`root ├ A1 ├ A2 └ C ├ C1 └ C2` is expressible; `child_scope` is a typed member. Single-parent
forest: no self-parent, no second parent, no cycle — each fails closed (`H2` test, `H-A09`,
`N08`). Adding a child scope does not change the parent's external Holon digest.

## 10. Internal-reconfiguration proof

Remove `A1`, add `A3` ⇒ `peer = P`, `boundary = B`, and the Holon `digest` are unchanged
(`H-A12`, `A29`, `N05`). A boundary change DOES change the digest (`N12`).

## 11. Golden E2E

`test/h_runtime_scope_e2e.test.ts`: real `OrganizationStore` definition → explicit scope basis
→ A1/A2 → explicit peer P + boundary → reconfiguration → nested child → **restart** →
same external Holon state. Drives `installed.runtimeScopes` / `installed.holons`.

## 12. Negative / adversarial proofs

N01 organization without runtime · N02 scope without organization · N03 no ghost activation ·
N04 no organization copy · N05 internal replacement keeps external peer · N06 no focus-based
representation · N07 no first-member representative · N08 nesting cycle fail-closed · N09 stale
basis never disguised as current · N10 close ≠ Institution termination · N11 close ≠ Campaign
termination · N12 boundary change distinguishes external change. Plus concurrency: a stale
expected basis cannot fork scope history.

## 13. Test / CI matrix

`git diff --check` · targeted H tests (10 + 5 + 5) · `pnpm test` (111 files / 952 tests) ·
`pnpm build` · `pnpm build:web` · `pnpm test:e2e` (21/21). Details in
[`audits/G10-H-RUNTIMESCOPE-HOLON-DELIVERY.md`](audits/G10-H-RUNTIMESCOPE-HOLON-DELIVERY.md).

## 14. Carry-forward register

[`audits/G10-H-CARRY-FORWARD.md`](audits/G10-H-CARRY-FORWARD.md) — 12 items; **no
`BLOCKER_IN_H` remains**; P1 items CF-H-03/06/08/09.

## 15. Final verdict

```text
G10-H RUNTIMESCOPE & HOLON GROUNDING: PASS
```

Palimpsest can represent and replay a recursive runtime organizational boundary in which
multiple internal runtime constituents are exposed externally as one explicitly represented
Holon boundary, without collapsing Organization, Runtime, Peer, Continuity, Work, or Authority
semantics.

## 16. Recommended next stage

`G10-I — Organization Dynamics: Observation, Diagnosis & Structural Proposal` (not started).
Its inputs are registered in the carry-forward register (CF-H-09, CF-H-03).

## 17. Canonical gate record

| Gate | Result |
|---|---|
| Remote CI (exact merged HEAD `87e4bac`) | workflow `34774691471`, attempt 1: `unit` ✓, `e2e` ✓ |
| Merge | PR `#56` → `a855bf2` (normal merge) |
| Canonical `main` `git diff --check` | clean |
| Canonical `main` `pnpm test` | 111 files / 953 tests passed (one timing flake, green on re-run) |
| Canonical `main` build / build:web | PASS |
| Canonical `main` e2e | 21/21 |

The closure verification record is delivered by `experiment/g10-h-closure`
(see [`audits/G10-H-RUNTIMESCOPE-HOLON-DELIVERY.md`](audits/G10-H-RUNTIMESCOPE-HOLON-DELIVERY.md)).
With G10-H PASS, PAG closure work remains stopped and the runtime frontier moves
to G10-I; this campaign does not start it.
