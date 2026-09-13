# G10-GC2-E/H — Wake Causal State Machine & Current-Wake Gating

## Wake/reconciliation/compilation provenance

`WakeReconciliationRef = (wakeCycleId, reconciliationDigest)` binds a compiled candidate
to the exact committed reconciliation that produced it.

- `observeCurrentWorld` requires the requested wake to equal the current incomplete wake;
  otherwise `{status:"wake_cycle_mismatch"}` with zero writes.
- `reconcileCurrentWorld` requires the current incomplete wake and lifecycle `WAKING` for a
  first reconciliation. An identical retry returns the existing committed reconciliation
  (idempotent); a different reconciliation for the same wake is never written — one
  committed reconciliation per wake under the current model.
- `compileNextAction` during a wake requires the current wake plus its committed
  reconciliation and sets `compiled.wake = { wakeCycleId, reconciliationDigest }`; without a
  committed reconciliation it returns `compilation_failed`.
- The admission key and candidate digest both include the wake binding, so a candidate from
  `W1/R1` can never be admitted under `W2` even with identical proposal content.
- Before a first admission the candidate is freshness-checked against the Campaign basis,
  the in-flight wake, the committed reconciliation digest, and the current belief digest
  (§68/§69); any change returns `stale`.

`installPalimpsest`'s compiler context is built from the *current* wake's committed
reconciliation (`inFlightWake` + `committedReconciliationOf`) — never "the latest
reconciliation anywhere".

## State-machine gating

| Method | Gate |
|---|---|
| `beginWake` | `DORMANT` only; never `TERMINATED`; the watch cause must have a canonical `WATCH_TRIGGERED`; a second call reports `wake_already_in_progress` |
| `resumeWake` | returns only the single incomplete current wake |
| `observeCurrentWorld` | requested wake == current incomplete wake |
| `reconcileCurrentWorld` | current incomplete wake + lifecycle `WAKING` (first) |
| `compileNextAction` | during a wake: current wake + committed reconciliation (lifecycle `RECONCILING`) |
| `admitCompiledAction` | current wake + current reconciliation + unchanged belief basis |
| `completeWakeWithAction` | an `AdmittedCampaignActionRef` matching a bound admission |

Proofs: E-M01 arbitrary wake cannot reconcile · E-M02 current `WAKING` cycle can · E-M03
same reconciliation retry idempotent · E-M04 no second reconciliation · E-M05/M06 compiled
action carries the wake id and reconciliation digest · E-M07 W1 candidate rejected under W2
· E-M08 changed reconciliation stales · E-M09 changed basis/belief stales; H-M01/M02 wrong
wake refused for observe/reconcile · H-M03 compile requires a committed reconciliation ·
H-M04 stale-wake admission refused · H-M05 old-wake action refused · H-M06 arbitrary
completion impossible via the golden path · H-M07 `TERMINATED` refuses wake progression ·
H-M08 one incomplete wake survives restart.
