# G10-M CARRY-FORWARD Register

Mandatory input for the next stage. No `BLOCKER_IN_M` remains.

```text
P1 — important: CF-M-01, CF-M-02
P2 — deferred / evidence-triggered: CF-M-03 … CF-M-09
```

## CF-M-01 — `boundary_workspace` retirement unsupported
- **ID:** CF-M-01 · **Observed at:** `src/runtime_evolution/artifacts.ts` (`runtimeDispositionFor`)
- **Evidence:** `DISSOLVE_OR_RETIRE_CANDIDATE` + `boundary_workspace` → `UNSUPPORTED_SUBJECT`.
  Workspace close/archive already exists and federated workspace retirement would need
  cross-host governance.
- **Category:** BOUNDARY · **Concrete trigger:** a real need to retire/archive a federated
  workspace with participant governance. · **Blocking:** NON_BLOCKING

## CF-M-02 — Retirement is one-way (no reactivation)
- **ID:** CF-M-02 · **Observed at:** `src/organization/store.ts` (`organization_retirements`)
- **Evidence:** v1 retirement is append-only one-way; there is no un-retire path.
- **Category:** ORGANIZATION · **Concrete trigger:** a real need to reactivate a retired
  organization lineage (would need explicit reactivation governance). · **Blocking:** NON_BLOCKING

## CF-M-03 — No runtime-topology migration/merge collapse for external surfaces
- **ID:** CF-M-03 · **Evidence:** COLLAPSE v1 blocks a child with a peer/boundary/campaign
  association instead of migrating it to the parent.
- **Category:** RUNTIME_POLICY · **Concrete trigger:** explicit external-surface migration
  semantics. · **Blocking:** NON_BLOCKING

## CF-M-04 — Runtime scope retirement does not release commitments
- **ID:** CF-M-04 · **Evidence:** commitments are coordination truth; `RETIRE_SCOPE` touches no
  coordination state. A scope retirement therefore leaves commitments untouched (by design).
- **Category:** FEDERATION · **Concrete trigger:** a governance need to release commitments when
  a runtime scope retires. · **Blocking:** NON_BLOCKING

## CF-M-05 — No remote/federated runtime evolution protocol
- **ID:** CF-M-05 · **Evidence:** runtime structural evolution is local to the canonical
  RuntimeScopeStore; there is no remote submit/authorize transport for topology changes.
- **Category:** AVAILABILITY · **Concrete trigger:** a multi-host runtime topology change. ·
  **Blocking:** NON_BLOCKING

## CF-M-06 — Candidate rebase helper (from CF-L-08)
- **ID:** CF-M-06 · **Evidence:** a stale runtime candidate is never auto-rebased; the intent must
  be re-proposed. · **Concrete trigger:** agent/UI ergonomics. · **Blocking:** NON_BLOCKING

## CF-M-07 — Empirical runtime benefit evaluation (from CF-L-07)
- **ID:** CF-M-07 · **Evidence:** post-change observation records structural before/after digests
  only. · **Concrete trigger:** an empirical evaluation stage. · **Blocking:** NON_BLOCKING

## CF-M-08 — Boundary/workspace close is not boundary retirement
- **ID:** CF-M-08 · **Evidence:** BoundaryWorkspace `CLOSED` remains workspace lifecycle; there is
  no boundary retirement semantics in M. · **Concrete trigger:** a federated workspace retirement
  stage. · **Blocking:** NON_BLOCKING

## CF-M-09 — Institution lifecycle vs organization retirement coupling
- **ID:** CF-M-09 · **Evidence:** retirement is blocked while the organization is a current
  institution body, but institution epochs are not terminated by retirement.
- **Category:** AUTHORITY · **Concrete trigger:** an institution that must be wound down when its
  body retires. · **Blocking:** NON_BLOCKING

---
```text
No BLOCKER_IN_M. Next-stage candidates (from real carry-forward):
  Collaborative Reasoning Cells · Agent-facing Federation/MultiGraph UI ·
  Multi-Institution Governance · Federated Boundary Operational Resilience (CF-L-01) ·
  Empirical Organization Evaluation
```
