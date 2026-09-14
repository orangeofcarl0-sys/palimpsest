# G10-L CARRY-FORWARD Register

Mandatory input for the next stage. No `BLOCKER_IN_L` remains.

```text
P1 — important: CF-L-01, CF-L-02
P2 — deferred / evidence-triggered: CF-L-03 … CF-L-11
```

## CF-L-01 — Canonical-home migration / failover
- **ID:** CF-L-01 · **Observed at:** `src/boundary_memory/transport.ts`
- **Evidence:** home unavailable yields `home_unavailable`; no election/failover promotes a remote
  writer. `BoundaryWorkspaceRoutePort` resolves to one home.
- **Category:** AVAILABILITY · **Concrete trigger:** a real multi-host production deployment needing
  planned migration or home failure continuity. · **Blocking:** NON_BLOCKING

## CF-L-02 — No structured metadata for remote operations
- **ID:** CF-L-02 · **Observed at:** `BoundaryRemoteEnvelope` (no causation/correlation/idempotency
  metadata beyond `operationId`)
- **Evidence:** retries rely solely on the stable `operationId`; there is no bounded-retry policy,
  backoff, or operation status query.
- **Category:** OTHER · **Concrete trigger:** a transport where a caller needs to poll an operation's
  canonical outcome after an ambiguous failure. · **Blocking:** NON_BLOCKING

## CF-L-03 — Scaffolding operations are not remote
- **ID:** CF-L-03 · **Evidence:** `openWorkspace` / `createArtifact` are canonical-home scaffolding
  steps; there is no remote `create_artifact` / `open_workspace` operation.
- **Category:** OTHER · **Concrete trigger:** a workspace that must be bootstrapped by a participant
  rather than by the hosting deployment. · **Blocking:** NON_BLOCKING

## CF-L-04 — Workspace close is local-only
- **ID:** CF-L-04 · **Evidence:** `closeWorkspace` is not exposed remotely.
- **Category:** OTHER · **Concrete trigger:** a governed remote close/archive operation. ·
  **Blocking:** NON_BLOCKING

## CF-L-05 — No local cache / change feed
- **ID:** CF-L-05 · **Evidence:** remote reads are request/response; no derived cache, subscription,
  or push change feed exists (a cache must never outrank the home).
- **Category:** OTHER · **Concrete trigger:** a latency/offline requirement. · **Blocking:** NON_BLOCKING

## CF-L-06 — Formalization evidence port caller-supplied (from CF-K-04)
- **ID:** CF-L-06 · **Evidence:** boundary acceptance satisfies no evidence obligation. ·
  **Concrete trigger:** a formalization obligation genuinely requiring external evidence. ·
  **Blocking:** NON_BLOCKING

## CF-L-07 — Empirical post-observation (from CF-K-05)
- **ID:** CF-L-07 · **Evidence:** boundary diagnostics are mechanical and disclaim correctness. ·
  **Concrete trigger:** an empirical evaluation stage. · **Blocking:** NON_BLOCKING

## CF-L-08 — Candidate rebase helper (from CF-K-06)
- **ID:** CF-L-08 · **Evidence:** a stale candidate (superseded base OR changed membership) is never
  auto-rebased; the intent must be re-proposed. · **Concrete trigger:** agent/UI ergonomics. ·
  **Blocking:** NON_BLOCKING

## CF-L-09 — Artifact type-version migration (from CF-K-07)
- **ID:** CF-L-09 · **Concrete trigger:** evolving an artifact's schema while preserving identity. ·
  **Blocking:** NON_BLOCKING

## CF-L-10 — Structured message refs (from CF-K-09)
- **ID:** CF-L-10 · **Evidence:** `PeerMessage.body` stays a string; boundary operations never ride
  chat. · **Concrete trigger:** typed candidate/change references in messages. ·
  **Blocking:** NON_BLOCKING

## CF-L-11 — Institution governance for formalization genesis (from CF-K-10)
- **ID:** CF-L-11 · **Evidence:** formalization is always `standalone`. · **Concrete trigger:** a
  formalization requiring an existing institution body's approval. · **Blocking:** NON_BLOCKING

---
```text
No BLOCKER_IN_L. Next-stage candidates (choose from real carry-forward):
  Runtime Structural Evolution (CF-J-03/04, long deferred) ·
  Collaborative Reasoning Cells · Agent-facing Federation/MultiGraph UI ·
  Multi-Institution Governance
```
