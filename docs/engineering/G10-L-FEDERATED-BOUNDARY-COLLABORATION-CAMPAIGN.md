# G10-L Campaign — Federated Boundary Collaboration

Baseline: `main @ 2b7aa48`. Closes CF-K-01/02/03/08; real leftovers carried into
`G10-L-CARRY-FORWARD.md`.

## Stage topology (as executed)

```text
L0  Audit + K carry-forward disposition
    → docs/engineering/audits/G10-L-FEDERATED-BOUNDARY-COLLABORATION-ASSESSMENT.md
    → docs/engineering/audits/G10-L-K-CARRY-FORWARD-DISPOSITION.md

L1  BoundaryWorkspace as a first-class Dynamics subject + basis + mechanical metrics
    → src/organization_dynamics/{dynamics,service}.ts (additive, digest-preserving)

L2  Membership lineage + candidate/approval semantics
    → src/boundary_memory/membership.ts; service membership methods

L3  Membership ↔ artifact freshness interaction
    → candidates proposed before a membership advance become STALE (chain-derived basis)

L4  Remote semantic protocol + stable operationId
    → src/boundary_memory/transport.ts (envelopes, ops, home dedupe receipts)

L5  Canonical-home routing / authenticated inbound
    → BoundaryWorkspaceRoutePort, BoundaryHome

L6  Remote observation / changesSince / basis
    → read-only remote operations returning canonical basis

L7  Cross-host adapter seam + test harness
    → inProcessBoundaryTransportPort / callbackBoundaryTransportPort / staticBoundaryRoute

L8  P↔O cross-host golden E2E
L9  Dynamic-membership golden E2E
L10 Boundary-aware Dynamics E2E
L11 Adversarial/firewall/crash-retry closure + docs + CI/merge
```

## Test matrix

| File | Tests | Focus |
|---|---:|---|
| `test/l_cross_host_e2e.test.ts` | 7 | §30 cross-host golden path, retry idempotency, restart, membership golden (§31), membership branch-safety, membership ≠ blueprint |
| `test/l_boundary_dynamics.test.ts` | 4 | §32 boundary Dynamics subject, metrics, diagnostics, unknown/race, digest compatibility |
| `test/l_federated_boundary.test.ts` | 10 | storage-home/transport firewalls, membership independence, concurrent-head safety, restart lineage, lost-response retry, reorder semantics |

Baseline before L: 117 files / 1010 unit tests. After L: **120 files / 1031 unit tests**;
`pnpm build` (tsc -b) and `pnpm build:web` green; local `pnpm test:e2e` **21/21** (no flakes on the
recorded run).

## CI / merge gates

Per stage: `git diff --check`, targeted tests, `pnpm test`, `pnpm build`, `pnpm build:web`.
Final `pnpm test:e2e` recorded truthfully. Exact branch HEAD → normal PR merge → canonical main SHA
→ remote unit + e2e green. Existing `E2E-DEBUG-01`/`E2E-RUNTIME-03` handled only by the documented
failed-job rerun; new failures are treated as real until classified.
