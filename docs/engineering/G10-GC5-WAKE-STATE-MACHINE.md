# G10-GC5 — Wake State Machine

`beginWake` is allowed ONLY from `DORMANT`. From `WAKING`/`RECONCILING` it
returns `wake_already_in_progress` with the existing cycle id (never a second
cycle); any other state returns `blocked`. At most ONE incomplete WakeCycle per
Campaign is machine-enforced. `resumeWake(campaignId)` recovers the in-flight
cycle after a crash without appending a second `WAKE_STARTED`.

`completeWakeWithAction({nextAction})` is tied to real semantic admission:
- project -> requires reconciliation for the cycle AND a `PROJECT_ADMITTED`;
- wait -> requires a `WAIT_DECIDED` followed by a grounded `CHECKPOINT_RECORDED`.

There is no arbitrary public `completeWake({nextAction:"project"})` escape on
the golden path. TERMINATED is independent; wake errors never terminate.
