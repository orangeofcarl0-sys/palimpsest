# G10-H CARRY-FORWARD Register

Mandatory input for the next stage. No item here may be "fixed by widening H".
`BLOCKER_IN_H` items are closed in this campaign (none remained); the rest are
honest leftovers with an explicit reason.

---

## CF-H-01 — Runtime constituent existence is not verifiable

- **ID:** CF-H-01
- **Observed at:** `src/runtime_scope/service.ts` `addMember`; `src/runtime/identity.ts` (no activation registry)
- **Evidence:** members record an `ActivationRef`, but no canonical activation registry exists; Palimpsest cannot prove a referenced activation exists or is running.
- **Category:** HOST_INTEGRATION
- **Why not in G10-H:** would require a runtime activation registry or a host-owned constituent resolver — outside RuntimeScope/Holon grounding.
- **Semantic impact:** runtime membership is an explicit organization record, not a liveness claim.
- **Recommended next stage:** host/runtime integration or G10-I observation inputs.
- **Blocking status:** NON_BLOCKING (membership is intentionally declarative; no invariant depends on liveness).

## CF-H-02 — RuntimeScope-local policy is a seam only

- **ID:** CF-H-02
- **Observed at:** `docs/engineering/G10-H-RUNTIMESCOPE-HOLON-SPEC.md` §9
- **Evidence:** no concurrency envelope / routing-policy ref / admission policy is implemented; the scope has no policy field.
- **Category:** RUNTIME_POLICY
- **Why not in G10-H:** no concrete use case; §16 permits freezing only the seam.
- **Semantic impact:** scope-local execution policy is unrepresented; Work Scheduler remains organization-unaware.
- **Recommended next stage:** a runtime-policy stage or G10-I if observation demands it.
- **Blocking status:** NON_BLOCKING.

## CF-H-03 — Boundary source interaction is not verified

- **ID:** CF-H-03
- **Observed at:** `src/runtime_scope/artifacts.ts` `RuntimeScopeBoundary.sourceInteractionId`
- **Evidence:** the boundary cites a source interaction id for provenance, but its existence in the recorded organization revision's `interactions` is not checked.
- **Category:** BOUNDARY_MEMORY
- **Why not in G10-H:** would require the organization port to expose revision interactions and a boundary↔definition reconciliation; §14 only requires an explicit, provenance-bearing runtime boundary.
- **Semantic impact:** "boundary port invented without source" is provenance-bearing but not yet source-verified.
- **Recommended next stage:** boundary-memory / organization-dynamics stage.
- **Blocking status:** NEXT_STAGE_REQUIRED.

## CF-H-04 — Multi-parent / laminar scopes unsupported

- **ID:** CF-H-04
- **Observed at:** `src/runtime_scope/service.ts` `addMember` (single-parent forest)
- **Evidence:** a scope with two parents fails `multiple_parents`.
- **Category:** ORGANIZATION_DYNAMICS
- **Why not in G10-H:** the frozen ownership rule (§3.4) permits a forest; laminar partial overlap needs explicit organizational semantics.
- **Semantic impact:** partially overlapping execution ownership cannot be expressed.
- **Recommended next stage:** G10-I Organization Dynamics if evidence demands.
- **Blocking status:** NON_BLOCKING.

## CF-H-05 — QUIESCENT / suspend-resume lifecycle absent

- **ID:** CF-H-05
- **Observed at:** `src/runtime_scope/artifacts.ts` `RuntimeScopeLifecycle = OPEN | CLOSED`
- **Evidence:** only OPEN/CLOSED are derived.
- **Category:** RUNTIME_POLICY
- **Why not in G10-H:** no real suspend-resume use case; §10 says implement the minimum.
- **Semantic impact:** a scope cannot be temporarily suspended without closing.
- **Recommended next stage:** runtime-policy stage.
- **Blocking status:** NON_BLOCKING.

## CF-H-06 — Holon representation authority unmodeled

- **ID:** CF-H-06
- **Observed at:** `src/runtime_scope/service.ts` `associatePeer` / `declareBoundary`
- **Evidence:** any holder of the service may change the external peer/boundary; there is no representation-authority contract.
- **Category:** AUTHORITY
- **Why not in G10-H:** §13 says implement only the explicit `PeerRef` association, defer the fuller representation-authority model.
- **Semantic impact:** external representation is auditable (events) but not authority-gated.
- **Recommended next stage:** institutional epistemic governance / organization dynamics.
- **Blocking status:** NEXT_STAGE_REQUIRED.

## CF-H-07 — RuntimeScope ↔ Participation association absent

- **ID:** CF-H-07
- **Observed at:** `src/coordination/participation.ts`, `src/runtime_scope/service.ts`
- **Evidence:** no `Participation → RuntimeScope` link exists.
- **Category:** FEDERATION
- **Why not in G10-H:** §17 keeps runtime membership orthogonal to attempt participation; no derivation is safe.
- **Semantic impact:** a view cannot join "activation in scope H" with "activation in attempt T" without an explicit future association.
- **Recommended next stage:** federation/runtime integration.
- **Blocking status:** NON_BLOCKING.

## CF-H-08 — Campaign ↔ RuntimeScope integration absent

- **ID:** CF-H-08
- **Observed at:** `src/campaign/**`, `src/runtime_scope/**`
- **Evidence:** no Campaign references a RuntimeScope.
- **Category:** OTHER
- **Why not in G10-H:** §18 says no Campaign lifecycle drives scope lifecycle in this stage.
- **Semantic impact:** a long-horizon Campaign cannot declare the runtime scope that hosts its activity.
- **Recommended next stage:** a Campaign/runtime integration stage.
- **Blocking status:** NEXT_STAGE_REQUIRED.

## CF-H-09 — Runtime structural metrics for Organization Dynamics unexposed

- **ID:** CF-H-09
- **Observed at:** `src/runtime_scope/service.ts` (`scopeState`/`holonView` only)
- **Evidence:** no structural snapshot/metrics surface (fan-out, depth, reconfiguration counts) is derived.
- **Category:** ORGANIZATION_DYNAMICS
- **Why not in G10-H:** that is G10-I's mandate (Observation → Diagnosis → Proposal).
- **Semantic impact:** G10-I has no ready metric input yet.
- **Recommended next stage:** G10-I.
- **Blocking status:** NEXT_STAGE_REQUIRED.

## CF-H-10 — No automatic promotion paths (by design)

- **ID:** CF-H-10
- **Observed at:** `service.openScope` (explicit only)
- **Evidence:** nothing auto-creates a RuntimeScope/Holon from an Organization or Coalition.
- **Category:** ORGANIZATION_DYNAMICS
- **Why not in G10-H:** §3/§19 forbid automatic promotion.
- **Semantic impact:** promotion remains a deliberate future transformation.
- **Recommended next stage:** G10-I/G10-J.
- **Blocking status:** NON_BLOCKING (explicit non-goal).

## CF-H-11 — No UI / MultiGraph surface for scopes

- **ID:** CF-H-11
- **Observed at:** `src/canvas/**` (untouched)
- **Evidence:** the runtime-organization surface is advanced/headless only.
- **Category:** UI
- **Why not in G10-H:** §3 excludes MultiGraph UI redesign.
- **Semantic impact:** external representation is inspectable programmatically, not visually.
- **Recommended next stage:** MultiGraph organization debugger.
- **Blocking status:** NON_BLOCKING.

## CF-H-12 — Ordarium 1.3.1 / StateChangeFeed untouched

- **ID:** CF-H-12
- **Observed at:** repository baseline (Ordarium pinned at the installed release)
- **Evidence:** no Ordarium upgrade or feed consumption was needed.
- **Category:** ORDARIUM_ALIGNMENT
- **Why not in G10-H:** no hard dependency was proven.
- **Semantic impact:** none for H invariants.
- **Recommended next stage:** evidence-triggered integration stage.
- **Blocking status:** NON_BLOCKING.

---

## Priority summary

```text
P0 — next-stage mandatory (from this register): none (no BLOCKER_IN_H remains)
P1 — important: CF-H-03, CF-H-06, CF-H-08, CF-H-09
P2 — deferred / evidence-triggered: CF-H-01, CF-H-02, CF-H-04, CF-H-05, CF-H-07, CF-H-10, CF-H-11, CF-H-12
```
