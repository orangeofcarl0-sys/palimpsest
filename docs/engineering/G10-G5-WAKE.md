# G10-G5 — Wake & World Reconciliation

```text
Wake = rehydrate canonical state + continuity check + world reconciliation
     + evidence refresh + belief revision + commitment reconsideration
     + next-action compilation
Wake ≠ load old checkpoint → rerun old Project
```

- `beginWake` runs a CONTINUITY CHECK first (§136): the Campaign must exist,
  not be TERMINATED, and a canonical checkpoint must exist — otherwise
  `wake_blocked`, never a silent replay.
- `WAKE_STARTED` (DORMANT→WAKING) records the `WakeCycleId`, the cause, and the
  checkpoint basis (§134/§135).
- `observeWorld` returns `reconciliation_incomplete` if ANY load-bearing fact is
  unknown (§139): the Campaign stays WAKING/RECONCILING, no Project is
  compiled, and the stale checkpoint is never used as current truth.
- `reconcile` commits `WORLD_RECONCILED` + `COMMITMENTS_REVIEWED` in ONE
  atomic transition; institution epoch changes are recorded while `CampaignId`
  is unchanged (§140). Commitment reconsideration is a minimal deterministic
  review — no generic BDI reasoner (§142).
- `completeWake` requires a next action: Project → ACTIVE, or WAIT → DORMANT
  (§178). A WAIT wake must install a new wake route for that cycle.
- Crash/restart reconstructs the previous `WakeCycleId` from history rather
  than starting a second independent wake (§146).
- Wake NEVER creates a RuntimeAgent (§205) and the module never starts or
  retries Work (proof G5-M11).
