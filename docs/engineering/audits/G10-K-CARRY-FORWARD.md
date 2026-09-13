# G10-K CARRY-FORWARD Register

Mandatory input for the next stage. No `BLOCKER_IN_K` remains.

```text
P1 — important: CF-K-01, CF-K-02, CF-K-03
P2 — deferred / evidence-triggered: CF-K-04 … CF-K-10
```

## CF-K-01 — No `boundary_workspace` Dynamics subject
- **ID:** CF-K-01 · **Observed at:** `src/organization_evolution/service.ts` (`driveFormalization`)
- **Evidence:** G10-I's `DynamicsSubject` is `organization | runtime_scope`; a BoundaryWorkspace is
  neither. FORMALIZE therefore names the prospective target organization
  (`{organizationDefinitionId, revision 0, digest=blueprint organization digest}`), which keeps the
  proposal basis stable across genesis. Blueprint freshness and target-id availability are verified
  independently by the formalization branch.
- **Category:** ORGANIZATION_DYNAMICS · **Semantic impact:** none — no non-equivalence is weakened;
  the proposal is non-canonical and the blueprint is the authoring source.
- **Recommended next stage:** Boundary-aware Dynamics observation (spec §58). ·
  **Concrete trigger:** a case needing federation/workspace-level pressures (accepted-artifact count,
  revision churn, stable-interface presence) grounded on a workspace subject. · **Blocking:** NON_BLOCKING

## CF-K-02 — Dynamic workspace membership deferred
- **ID:** CF-K-02 · **Observed at:** `src/boundary_memory/artifacts.ts` (`participants` fixed)
- **Evidence:** v1 supports N FIXED participants (≥ 2, canonical set, immutable after open); the
  service exposes no add/remove API.
- **Category:** OTHER · **Recommended next stage:** membership governance (NOT a second Organization). ·
  **Concrete trigger:** a real multi-party workspace needing admission/removal with explicit
  acceptance semantics. · **Blocking:** NON_BLOCKING

## CF-K-03 — Remote candidate/acceptance transport absent
- **ID:** CF-K-03 · **Observed at:** `src/boundary_memory/service.ts` (authors/acceptors are the
  configured `localPeer` or an explicit authenticated envelope)
- **Evidence:** multi-peer workspaces are exercised via shared-store service instances with distinct
  local peers; transport-level authentication is not implemented here.
- **Category:** OTHER · **Recommended next stage:** federation transport integration. ·
  **Concrete trigger:** two hosts needing to exchange candidate/acceptance artifacts over a peer
  transport with authenticated identity. · **Blocking:** NON_BLOCKING

## CF-K-04 — Formalization evidence port caller-supplied (from CF-J-08)
- **ID:** CF-K-04 · **Evidence:** the formalization path supplies no evidence port and records zero
  obligations; boundary acceptance satisfies no evidence obligation (BM-A05).
- **Category:** OTHER · **Concrete trigger:** a formalization obligation that genuinely requires
  external evidence. · **Blocking:** NON_BLOCKING

## CF-K-05 — Post-observation is structural only (from CF-J-09)
- **ID:** CF-K-05 · **Evidence:** before/after snapshot digests only; no success score, no causal
  attribution, no empirical organization evaluation.
- **Category:** ORGANIZATION_DYNAMICS · **Concrete trigger:** an empirical evaluation stage. ·
  **Blocking:** NON_BLOCKING

## CF-K-06 — No candidate rebase helper
- **ID:** CF-K-06 · **Evidence:** a stale candidate cannot advance the head; continuing its intent
  requires proposing a NEW candidate from the current head. No automatic rebase/merge exists
  (by design — K-N11).
- **Category:** OTHER · **Concrete trigger:** UI/agent ergonomics needing an explicit rebase command. ·
  **Blocking:** NON_BLOCKING

## CF-K-07 — Artifact type-version migration unsupported
- **ID:** CF-K-07 · **Evidence:** a candidate's `type` must equal the artifact's declared type; a
  type/version change is not representable.
- **Category:** OTHER · **Concrete trigger:** a real need to evolve an artifact's schema while
  preserving its identity. · **Blocking:** NON_BLOCKING

## CF-K-08 — Boundary observation not wired into Organization Dynamics
- **ID:** CF-K-08 · **Evidence:** spec §58 permits read-only boundary observation; K did not add a
  diagnostic (no basis-grounded workspace subject exists — see CF-K-01). `LivingSpec richness ≠
  should formalize` is nonetheless machine-proved by K-N25.
- **Category:** ORGANIZATION_DYNAMICS · **Blocking:** NON_BLOCKING

## CF-K-09 — Structured message refs not added
- **ID:** CF-K-09 · **Evidence:** `PeerMessage.body` stays a string (spec §25); a boundary ref may
  be mentioned in a body but is not a typed message field.
- **Category:** OTHER · **Concrete trigger:** agent/host ergonomics needing typed candidate/change
  references in messages. · **Blocking:** NON_BLOCKING

## CF-K-10 — Institution governance for formalization genesis
- **ID:** CF-K-10 · **Evidence:** formalization is always `standalone`; no Institution is created or
  consulted. Governance of genesis (as opposed to revision adoption) is undefined.
- **Category:** AUTHORITY · **Concrete trigger:** a formalization that must be approved by an
  existing institution body. · **Blocking:** NON_BLOCKING

---
```text
No BLOCKER_IN_K. Next stage candidates (choose from real carry-forward):
  Runtime Structural Evolution · Multi-Institution Governance ·
  Collaborative Reasoning Cells · Agent-facing Federation/MultiGraph UI
```
