# G10-L — G10-K Carry-Forward Disposition

Inputs: `docs/engineering/audits/G10-K-CARRY-FORWARD.md`,
`docs/engineering/audits/G10-K-BOUNDARY-MEMORY-DELIVERY.md`,
`docs/engineering/G10-K-BOUNDARY-MEMORY-LIVINGSPEC-SPEC.md`.

## Mandatory closures

### CF-K-01 — BoundaryWorkspace not a Dynamics subject → `CLOSED_IN_L`
`DynamicsSubject` gains `{ kind: "boundary_workspace", workspace: BoundaryWorkspaceRef }` (additive).
The snapshot binds a `BoundaryWorkspaceBasisRef` (workspaceId + throughSeq + chainDigest) that
participates in basis/freshness. No parallel BoundaryDynamics system. Proofs: FB-A20/A21/A22 and
`test/l_boundary_dynamics.test.ts`.

### CF-K-02 — Fixed workspace membership → `CLOSED_IN_L`
Participants are a governed append-only lineage: `MembershipChangeCandidate` +
`MEMBERSHIP_APPROVED`/`MEMBERSHIP_REJECTED`/`MEMBERSHIP_REVISION_ACCEPTED` events, v1
`ADD_PARTICIPANT` / `REMOVE_PARTICIPANT_CONSENSUAL` only, all-required-approval, branching without
LWW. Proofs: L-N10…N19, FB-A12…A19, and the dynamic-membership golden E2E.

### CF-K-03 — Remote candidate/acceptance transport → `CLOSED_IN_L`
A dedicated `BoundaryCollaborationTransportPort` carries strict semantic envelopes with stable
`operationId`s; the canonical home validates and commits. Chat transport is not reused
(`PeerMessage.body` is never a boundary mutation channel). Proofs: FB-A01…A07, L-N03…N08, the
cross-host golden E2E.

## Remaining K items

### CF-K-04 — Formalization evidence port caller-supplied → `STILL_DEFERRED_WITH_CONCRETE_TRIGGER`
Unchanged. Boundary acceptance satisfies no evidence obligation. Trigger: a formalization obligation
genuinely requiring external evidence. Carried as **CF-L-06**.

### CF-K-05 — Empirical post-observation → `STILL_DEFERRED_WITH_CONCRETE_TRIGGER`
Unchanged; boundary diagnostics are mechanical and explicitly disclaim correctness/quality
(FB-A24). Trigger: an empirical evaluation stage. Carried as **CF-L-07**.

### CF-K-06 — No candidate rebase helper → `STILL_DEFERRED_WITH_CONCRETE_TRIGGER`
Unchanged: a stale candidate is never auto-rebased or reinterpreted; the intent must be re-proposed
from the current head. Now also true after membership evolution. Trigger: agent/UI ergonomics
needing an explicit rebase command. Carried as **CF-L-08**.

### CF-K-07 — Artifact type-version migration → `STILL_DEFERRED_WITH_CONCRETE_TRIGGER`
Unchanged. Trigger: evolving an artifact's schema while preserving identity. Carried as **CF-L-09**.

### CF-K-08 — Boundary observation not wired into Dynamics → `CLOSED_IN_L`
Boundary mechanics and basis-grounded diagnostics are now first-class for a `boundary_workspace`
subject; `BLUEPRINT_PRESENT ≠ should formalize` is machine-proved (L-N24/FB-A23).

### CF-K-09 — Structured message refs → `STILL_DEFERRED_WITH_CONCRETE_TRIGGER`
Unchanged (`PeerMessage.body` stays a string; boundary operations never ride chat). Trigger:
typed candidate/change references in messages. Carried as **CF-L-10**.

### CF-K-10 — Institution governance for formalization genesis → `STILL_DEFERRED_WITH_CONCRETE_TRIGGER`
Unchanged; formalization remains `standalone`. Trigger: a formalization requiring an existing
institution body's approval. Carried as **CF-L-11**.

## Summary

```text
CLOSED_IN_L:                          CF-K-01, CF-K-02, CF-K-03, CF-K-08
REQUIRED_BUT_RESCOPED_WITH_PROOF:     none
STILL_DEFERRED_WITH_CONCRETE_TRIGGER: CF-K-04, CF-K-05, CF-K-06, CF-K-07, CF-K-09, CF-K-10
OBSOLETE_AFTER_L_DESIGN:              none
```
No `BLOCKER_IN_L` remains.
