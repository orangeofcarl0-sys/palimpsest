# G10-D4 — Closed Loop Record

The full observe → resolve → realize → re-observe cycle as implemented and
machine-proven:

```text
canonical PersistentPoint store + RuntimeObservationPort (read-only)
        ↓  observeBindingState (refuse on ANY unknown; §77/§79)
BindingObservationSnapshot  (C2 artifact; snapshotId from the injected allocator)
        ↓  observeAndCompileGroundedPlan (distinct step; pure compiler)
Grounded planned result (RunDefinition + BindingResolution + ref-only plan)
        ↓  evaluateGroundedPlanFreshness against the CURRENT state (§84 re-check)
PreparedRuntimeRealization (stable realizationKey; allocator seam)
        ↓  Ordarium-admitted carrier realize (D2/D3 actions)
Activation + RuntimeAttachment (only after effect success)
        ↓  world changes (release/loss/availability drift)
re-observe → new snapshot content digest → new SnapshotRef
        ↓
old resolution STALE (kernel freshness; artifacts byte-immutable)
        ↓
re-resolve / re-prepare (truthful planning condition, no auto-healing)
```

Honest limits (§85): the window between observation and external effect is
mitigated by the stable realization key, the pre-effect freshness re-check,
and host-side availability checks — it is **not** atomic across the
Palimpsest DB, the host runtime, and Ordarium, and nothing in this campaign
claims otherwise. Typed unavailability (`realized:false` results, D3)
survives the Ordarium boundary; arbitrary thrown classes do not, and the
design accounts for that.

What the loop does NOT do: auto-heal a stale plan, auto-create a missing
point, silently downgrade persistent→ephemeral, or manufacture a snapshot
from unknown facts.
